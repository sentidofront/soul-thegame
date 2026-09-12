import { mulberry32, hash3 } from '../core/rng'
import { CONFIG } from '../config'
import { ARENA_INTERIOR } from '../data/stages'
import type { Route } from './route'

/**
 * TERRAIN RULES.
 *
 * Everything here is a pure function of world position + the world seed + the
 * route, so a chunk regenerates byte-identically after being evicted from the
 * cache. No Math.random() below this line.
 */

/** Where a boss arena sits, once the route has been resolved. */
export interface Landmark {
  x: number
  y: number
  halfW: number
  halfH: number
  /** Extra exclusion above the rectangle, for a building drawn standing on it. */
  clearTop?: number
}

/**
 * WHERE THE TOWN IS.
 *
 * Cityness used to be a function of world X. That worked only while the world
 * was a corridor running due east; the route wanders now, so "how townish is
 * this spot" has to be answered against the JOURNEY — how far along the
 * nearest bit of route is, and how far from it you are standing.
 *
 * These two distances are Act II's boundary, so Floriano begins where the act
 * does rather than at a number that once matched it.
 */
const TOWN_FROM = 9700
const TOWN_FULL = 10900

/** Linear ramp, clamped. */
export function blend(x: number, a: number, b: number) {
  return Math.max(0, Math.min(1, (x - a) / (b - a)))
}

/**
 * How built-up a world position is. 0 = caatinga, 1 = Floriano.
 *
 * Falls off AWAY from the route as well as along it: the town is a ribbon
 * either side of the way in, not an infinite plane of asphalt. Wander far
 * enough sideways and you are back in scrub even deep into Act II, which is
 * part of what makes the route worth following.
 */
export function citynessAt(route: Route, x: number, y: number): number {
  const hit = route.nearest(x, y)
  /*
   * The sideways falloff has to reach past the LAST ROW OF HOUSES, or the town
   * ends up standing on scrub. Buildings now go out to about four hundred and
   * twenty, so the ground stays urban to four hundred and fades out by eight
   * hundred — matching the prop generator's own falloff.
   */
  return blend(hit.d, TOWN_FROM, TOWN_FULL) * (1 - blend(hit.lateral, 420, 800))
}

/**
 * WHERE THE ROOM IS, resolved once per route.
 *
 * `inChurchRoom` is asked about every tile of every chunk that touches the
 * square — thirteen hundred times per chunk — and the answer needs a
 * `pointAt`, which walks the route's arc-length table. Recomputing it per tile
 * made baking a chunk the most expensive thing in the frame for no reason at
 * all: it cannot change while the route does not.
 */
let roomRoute: Route | null = null
let room = { x: 0, y: 0 }
function churchRoom(route: Route) {
  if (roomRoute !== route) {
    const at = route.pointAt(ARENA_INTERIOR.atDist)
    room = { x: at.x, y: at.y }
    roomRoute = route
  }
  return room
}

/**
 * The rectangle the church stands in, whether or not he has gone inside yet.
 *
 * Separate from `insideChurch` because scenery does not care about the door:
 * nothing is scattered on the church's ground before he arrives OR after,
 * so the prop generator can answer this once and cache it per chunk. Bringing
 * the door into that answer would mean re-running the whole town every time
 * the state flipped, for no visible difference.
 */
export function inChurchRoom(route: Route, x: number, y: number): boolean {
  const r = churchRoom(route)
  return Math.abs(x - r.x) <= ARENA_INTERIOR.halfW
    && Math.abs(y - r.y) <= ARENA_INTERIOR.halfH
}

/**
 * HAS HE GONE IN?
 *
 * The interior is not a separate scene — nothing is loaded, nothing is torn
 * down. It is the same square of world, rebaked: the ground swaps to
 * flagstones and the facade stops being painted, because you are now standing
 * behind it.
 *
 * That is the same trick the rest of the world runs on. Floriano is not a
 * level either; it is a number saying how townish you are. Doing the interior
 * any other way would have meant a loading screen in a game whose one
 * structural promise is that there are none.
 *
 * It has to be STATE rather than geometry, and that is the part worth
 * remembering. Terrain is baked ahead of the player and cached, so a purely
 * positional answer would lay the church's floor down in the open air a
 * screen before he ever reached the door. The flag flips when he walks in and
 * the affected chunks are thrown away and rebuilt — a few dozen canvases, once
 * in a run.
 */
let interiorOpen = false

/** Called by the act three script when the door closes, and by a reset. */
export function openInterior(on: boolean) { interiorOpen = on }

/** For the chunk baker, which needs the flag without a position to test. */
export function interiorIsOpen() { return interiorOpen }

export function insideChurch(route: Route, x: number, y: number): boolean {
  return interiorOpen && inChurchRoom(route, x, y)
}

/**
 * WHERE THE TOWN'S GROUND STOPS BEING BLENDED.
 *
 * Above this there is nothing left to mix in, so the chunk baker lays a solid
 * coat of town texture and skips the mask pass entirely. Below it the coat is
 * caatinga and the town is painted over it through soft blobs.
 *
 * This replaced a `groundTileAt` that decided the transition per cell with a
 * weighted coin flip. That is a dither, and a dither needs cells small enough
 * to mix: at a hundred world units a side it produced a chessboard of brown
 * and green squares with hard edges, several screens across, right where the
 * player arrives in Floriano.
 */
/** Above this there is nothing left to blend, so the coat is simply town. */
export const CITY_SOLID = 0.94

/**
 * Low-frequency mottling painted over the ground.
 *
 * A straight repeat of a tileable texture still leaves the texture's own light
 * and dark patches landing on a 100px lattice, which the eye picks out as a
 * grid. A handful of soft patches at a much larger scale hides it and reads as
 * dry ground.
 *
 * Blobs are generated for the 3x3 neighbourhood of chunks, not just this one,
 * so a patch straddling a chunk border is drawn identically by both sides and
 * no seam appears.
 */
export function paintMottle(
  g: CanvasRenderingContext2D,
  cx: number, cy: number, seed: number, ox: number, oy: number,
) {
  const size = CONFIG.TILE * CONFIG.CHUNK_TILES
  for (let nx = -1; nx <= 1; nx++) {
    for (let ny = -1; ny <= 1; ny++) {
      const bx = (cx + nx) * size
      const by = (cy + ny) * size
      const rnd = mulberry32(hash3(cx + nx, cy + ny, seed ^ 0x3077))

      /*
       * TWO SCALES, because the lattice has two.
       *
       * The big blobs hide the low-frequency drift across a field. What they
       * cannot touch is the tile's OWN period: `makeSeamless` repairs the
       * joins by cross-blending an offset copy into the edges, which leaves
       * every tile slightly softer around its rim than through its middle — a
       * faint plus sign, repeated every hundred units, that survives mirroring
       * because mirroring only doubles the period rather than removing it.
       *
       * The second pass is sized to that: patches of about the tile's own
       * width, scattered off the grid, so the repeat has something the same
       * size as itself sitting on top of it and stops reading as a repeat.
       */
      const bands: [number, number, number, number][] = [
        // count, min radius, radius range, opacity
        [5 + Math.floor(rnd() * 4), 70, 170, 1],
        [22 + Math.floor(rnd() * 10), 26, 68, 0.62],
      ]
      for (const [count, rmin, rspan, strength] of bands) {
      for (let i = 0; i < count; i++) {
        const x = bx + rnd() * size - ox
        const y = by + rnd() * size - oy
        const r = rmin + rnd() * rspan
        /*
         * EVERY DRAW HAPPENS, INCLUDING FOR BLOBS THAT GET THROWN AWAY.
         *
         * This roll used to sit after the cull below, and that was a seam
         * generator. Each chunk paints the mottle for its whole 3x3
         * neighbourhood so a patch straddling a border is drawn identically by
         * both sides — but only if both sides pull the same numbers, and
         * skipping a draw for an off-screen blob desynchronises the stream for
         * every blob after it. The two chunks then disagreed about the shading
         * along their shared edge, which is a faint but perfectly straight
         * line every six hundred units, in every biome. Measured at about 27%
         * more row-to-row difference across a chunk join than across an
         * ordinary tile join.
         *
         * Consume first, cull second. Always.
         */
        const dark = rnd() < 0.55
        if (x + r < 0 || x - r > size || y + r < 0 || y - r > size) continue
        const grd = g.createRadialGradient(x, y, 0, x, y, r)
        const a0 = (dark ? 0.20 : 0.16) * strength
        const a1 = (dark ? 0.09 : 0.07) * strength
        const tint = dark ? '38,44,22,' : '198,184,124,'
        grd.addColorStop(0, 'rgba(' + tint + a0.toFixed(3) + ')')
        grd.addColorStop(0.65, 'rgba(' + tint + a1.toFixed(3) + ')')
        grd.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = grd
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
      }
    }
  }
}

/** Nothing is scattered into a boss arena. */
export function inLandmark(
  marks: readonly Landmark[], x: number, y: number, margin = 24,
): boolean {
  for (const m of marks) {
    if (Math.abs(x - m.x) >= m.halfW + margin) continue
    /*
     * The exclusion is taller than the arena when something is BUILT on it.
     *
     * The church is drawn upward from the square's north edge and stands
     * nearly three times the height of the rectangle it sits on — checking
     * the rectangle alone put houses straight through the facade.
     */
    const top = m.y - m.halfH - (m.clearTop ?? 0) - margin
    const bottom = m.y + m.halfH + margin
    if (y > top && y < bottom) return true
  }
  return false
}
