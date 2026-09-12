import { mulberry32, hash3, noise1 } from '../core/rng'

/**
 * THE WAY TO FLORIANO.
 *
 * There is no road any more. There was one, and it was the wrong idea: a band
 * of asphalt running due east turned the whole game into a corridor, and the
 * only decision the player ever made about the world was "keep holding D".
 * Walking down a line is not travelling.
 *
 * What replaced it is a ROUTE — an invisible wandering path from the caatinga
 * to the church, and an arrow that points along it. The player is not on rails
 * and never was; the difference is that now the destination is somewhere you
 * have to be pointed at, and it moves off to one side and back, so pushing
 * forward means actually steering.
 *
 * PROGRESS IS ARC LENGTH, not world X. That one change is what lets the whole
 * game keep its existing numbers: acts, waves and arenas are all keyed to "how
 * far along the journey" and they simply stopped meaning "how far east". The
 * route is generated to total roughly the old world width so none of those
 * tables had to move.
 *
 * The route is also the only spatial fact the world generator has: how townish
 * the ground is, where buildings cluster, and where scenery is allowed to
 * stand are all answers to "how near the route is this, and how far along".
 */

export interface RoutePoint {
  x: number
  y: number
  /** Cumulative distance from the start. */
  d: number
}

/** How near the route a point is, and how far along that nearest bit is. */
export interface RouteHit {
  /** Arc length of the closest point on the route. */
  d: number
  /** Perpendicular distance to it. */
  lateral: number
}

/**
 * HOW FAR IT IS TO THE CHURCH.
 *
 * It was 23400, chosen to match the width of the straight world this replaced.
 * Act two and the square outside the church have both grown since — the town
 * because it was the shortest act with the most in it, and the square because
 * it was SEVEN HUNDRED UNITS long, about twenty seconds, for a section that is
 * supposed to be the whole approach to the ending.
 *
 * Everything downstream is keyed to arc length rather than to this number, so
 * lengthening the road moves the acts and leaves their contents alone.
 */
const TARGET_LENGTH = 30200
const STEP = 420

export class Route {
  readonly pts: RoutePoint[] = []
  readonly total: number

  constructor(seed: number) {
    const rnd = mulberry32(hash3(seed, 0x0d31, 11))

    let x = 120
    let y = 0
    let d = 0
    this.pts.push({ x, y, d })

    /*
     * A SINE, plus noise to hide the sine.
     *
     * The first version of this was pure noise, and it produced a diagonal:
     * noise has no obligation to change sign, so over a journey this long it
     * drifted steadily one way and arrived nine thousand units south of where
     * it started while measuring 98% as straight as a ruler. A wandering path
     * has to be made to come BACK, not merely allowed to.
     *
     * So the swing is explicit — one full left-right cycle every ~4700 units,
     * five of them across the journey — and the noise is demoted to breaking
     * up the regularity so it does not read as a drawn wave.
     *
     * Bounded well inside a right angle either way. The route may meander but
     * it never doubles back: this is a journey with a destination, and a path
     * that occasionally runs west is just a maze.
     */
    let i = 0
    while (d < TARGET_LENGTH) {
      const swing = Math.sin(d / 750)
      const wobble = (noise1(d / 1150, 37) - 0.5) * 2
      const heading = swing * 0.82 + wobble * 0.30 + (rnd() - 0.5) * 0.07

      const len = STEP * (0.85 + rnd() * 0.3)
      x += Math.cos(heading) * len
      y += Math.sin(heading) * len
      d += len
      this.pts.push({ x, y, d })
      i++
      if (i > 400) break
    }

    this.total = d
  }

  /** World position at an arc length along the route. */
  pointAt(dist: number): { x: number; y: number } {
    const pts = this.pts
    if (dist <= 0) return { x: pts[0].x, y: pts[0].y }
    const last = pts[pts.length - 1]
    if (dist >= last.d) return { x: last.x, y: last.y }

    let lo = 0
    let hi = pts.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (pts[mid].d <= dist) lo = mid
      else hi = mid
    }
    const a = pts[lo]
    const b = pts[hi]
    const t = (dist - a.d) / Math.max(1e-6, b.d - a.d)
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }

  /** Which way the route is heading at an arc length. Radians. */
  headingAt(dist: number): number {
    const a = this.pointAt(dist)
    const b = this.pointAt(Math.min(this.total, dist + 60))
    return Math.atan2(b.y - a.y, b.x - a.x)
  }

  /**
   * The closest point on the route to a world position.
   *
   * Linear over the segments. There are only about sixty of them, this is
   * called once per chunk bake and once per frame for the player, and a
   * spatial index for sixty line segments would cost more to maintain than it
   * saves.
   */
  nearest(x: number, y: number, near?: number, window = 1600): RouteHit {
    const pts = this.pts
    let bestD = 0
    let bestSq = Infinity

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      /*
       * ONLY SEGMENTS NEAR WHERE THE WALKER ALREADY IS, when asked.
       *
       * THIS IS THE SKIPPED-BOSS BUG. The route swings north and south with a
       * period of about forty-seven hundred units, and this scan is GLOBAL:
       * it returns the closest point on the whole path. So a player who
       * wandered a few hundred units off the corridor, at a place where the
       * path had curved away and come back, could be geometrically nearer to
       * a stretch of route two thousand units FURTHER ON — and `reach` is a
       * high-water mark, so it took that number and kept it.
       *
       * The player teleported forward through the journey without moving. Act
       * one's boss gate is a 950-unit window; a jump like that steps straight
       * over it, `stageIndex` advances, and A Manifestação is never fought.
       *
       * The hint costs nothing and closes it: progress may only be measured
       * against the part of the path the walker is actually on. Callers that
       * genuinely want the global answer — the chunk baker asking how townish
       * a patch of dirt is — simply do not pass one.
       */
      if (near !== undefined && (b.d < near - window || a.d > near + window)) continue
      const vx = b.x - a.x
      const vy = b.y - a.y
      const len2 = vx * vx + vy * vy
      let t = len2 > 0 ? ((x - a.x) * vx + (y - a.y) * vy) / len2 : 0
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const px = a.x + vx * t
      const py = a.y + vy * t
      const dx = x - px
      const dy = y - py
      const sq = dx * dx + dy * dy
      if (sq < bestSq) {
        bestSq = sq
        bestD = a.d + Math.sqrt(len2) * t
      }
    }
    return { d: bestD, lateral: Math.sqrt(bestSq) }
  }
}
