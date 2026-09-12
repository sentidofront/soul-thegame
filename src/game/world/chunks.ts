import { CONFIG } from '../config'
import { Assets } from '../core/assets'
import { hash3 } from '../core/rng'
import { ARENA_IGREJA, ARENAS } from '../data/stages'
import {
  CITY_SOLID, citynessAt, insideChurch, interiorIsOpen, paintMottle,
  type Landmark,
} from './biomes'
import { PropField } from './props'
import { Route } from './route'

const SIZE = CONFIG.TILE * CONFIG.CHUNK_TILES

/** Cityness per cell, filled once per bake and read twice. */
const cityness = new Float32Array(CONFIG.CHUNK_TILES * CONFIG.CHUNK_TILES)

/**
 * Two scratch canvases, reused for every bake.
 *
 * Allocating a pair of six-hundred-square canvases per chunk would hand the
 * garbage collector a couple of megabytes every time the player walks into new
 * ground, which is exactly the moment a hitch is most visible.
 */
const pads: (HTMLCanvasElement | null)[] = [null, null]
function scratch(slot: number, size: number): HTMLCanvasElement {
  let c = pads[slot]
  if (!c) { c = document.createElement('canvas'); pads[slot] = c }
  if (c.width !== size) { c.width = size; c.height = size }
  return c
}

/**
 * One ground cell, mirrored one of four ways.
 *
 * A mirrored join on a noise texture duplicates a row of pixels, which is
 * invisible; a repeated one puts the texture's own features on a lattice,
 * which is not. Four variants take the visible period from one tile to four
 * and cost a transform per cell.
 */
function drawTile(
  g: CanvasRenderingContext2D, img: CanvasImageSource | null | undefined,
  x: number, y: number, size: number, v: number,
) {
  if (!img) return
  if (v === 0) { g.drawImage(img, x, y, size, size); return }
  g.save()
  g.translate(x + size / 2, y + size / 2)
  g.scale(v & 1 ? -1 : 1, v & 2 ? -1 : 1)
  g.drawImage(img, -size / 2, -size / 2, size, size)
  g.restore()
}

interface Chunk { canvas: HTMLCanvasElement; cx: number; cy: number }

/**
 * Bakes the world into square canvases, one per chunk, and caches them.
 *
 * Redrawing ~36 ground tiles plus a few hundred procedural props every frame
 * would be the single most expensive thing in the game. Instead each chunk is
 * painted once into its own canvas and the frame just blits a handful of those.
 * The cache is a plain LRU — Map keeps insertion order, so touching an entry
 * means delete-then-set, and eviction takes from the front.
 */
export class ChunkManager {
  private cache = new Map<number, Chunk>()
  readonly route: Route
  /**
   * Arena positions, resolved once against the route.
   *
   * The generator needs them as WORLD rectangles to keep scenery out of, and
   * resolving a distance-along-the-route into a position is not something a
   * chunk bake should be doing sixty times over.
   */
  readonly marks: Landmark[]
  /** The church itself, kept out of the list so nothing has to guess at it. */
  private readonly igreja: Landmark
  /** Everything standing in the world — drawn and collided with, not baked. */
  readonly props: PropField

  constructor(private assets: Assets, private seed: number) {
    this.route = new Route(seed)
    this.marks = ARENAS.map((a) => {
      const at = this.route.pointAt(a.atDist)
      return {
        x: at.x, y: at.y, halfW: a.halfW, halfH: a.halfH, clearTop: a.clearTop,
      }
    })
    /*
     * PICKED BY NAME, not by position in the list.
     *
     * This used to be `marks[marks.length - 1]`, which was true right up until
     * a fourth arena was added for the church INTERIOR — at which point the
     * facade and its paved square would have been painted around the middle of
     * a room that is behind the facade.
     */
    const n = ARENAS.indexOf(ARENA_IGREJA)
    this.igreja = this.marks[n >= 0 ? n : this.marks.length - 1]
    this.props = new PropField(seed, this.route, assets, this.marks)
  }

  private key(cx: number, cy: number) { return cx * 100000 + cy }

  get(cx: number, cy: number): HTMLCanvasElement {
    const k = this.key(cx, cy)
    const hit = this.cache.get(k)
    if (hit) {
      this.cache.delete(k)
      this.cache.set(k, hit)
      return hit.canvas
    }
    const chunk = this.bake(cx, cy)
    chunk.cx = cx
    chunk.cy = cy
    this.cache.set(k, chunk)
    while (this.cache.size > CONFIG.CHUNK_CACHE) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
    return chunk.canvas
  }

  /** Blits every chunk touching the camera's view. */
  draw(ctx: CanvasRenderingContext2D, viewX: number, viewY: number, viewW: number, viewH: number) {
    const c0 = Math.floor(viewX / SIZE)
    const c1 = Math.floor((viewX + viewW) / SIZE)
    const r0 = Math.floor(viewY / SIZE)
    const r1 = Math.floor((viewY + viewH) / SIZE)
    for (let cx = c0; cx <= c1; cx++) {
      for (let cy = r0; cy <= r1; cy++) {
        ctx.drawImage(this.get(cx, cy), cx * SIZE, cy * SIZE)
      }
    }
  }

  private bake(cx: number, cy: number): Chunk {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const g = canvas.getContext('2d')!
    g.imageSmoothingEnabled = false

    const ox = cx * SIZE
    const oy = cy * SIZE
    const t0x = cx * CONFIG.CHUNK_TILES
    const t0y = cy * CONFIG.CHUNK_TILES

    // 1. Ground.
    this.paintGround(g, t0x, t0y)

    // 1b. Break up the 100px lattice the repeating texture leaves behind.
    paintMottle(g, cx, cy, this.seed, ox, oy)

    /*
     * 2. The church plaza and its facade — but ONLY from outside.
     *
     * Once he has gone in, the building is behind him and painting its front
     * would put a church facade in the middle of the room he is fighting in.
     * `paintGround` has already laid flagstones over the same rectangle, so
     * skipping this is the whole of the interior: same square of world, no
     * apron, no front door, different floor.
     */
    if (!interiorIsOpen()
      && ox + SIZE > this.igreja.x - this.igreja.halfW - 260
      && ox < this.igreja.x + this.igreja.halfW + 300
      && oy + SIZE > this.igreja.y - this.igreja.halfH - 340
      && oy < this.igreja.y + this.igreja.halfH + 300) {
      this.paintPlaza(g, ox, oy, this.igreja)
    }

    /*
      * Scenery is NOT baked. It used to be, and a building near a chunk edge
      * came out sliced in a straight line by the canvas it was painted into —
      * and being part of the ground, nothing could ever be drawn behind it.
      * Props are entities now; see `world/props.ts`.
      */

    return { canvas, cx, cy }
  }

  /**
   * GROUND.
   *
   * Two problems live here and they have separate answers.
   *
   * THE LATTICE. A hundred-unit texture repeated across a field puts its own
   * light and dark patches on a hundred-unit grid, and the eye finds that grid
   * instantly however seamless the edges are. `makeSeamless` fixes the joins,
   * not the repetition. So every cell is drawn MIRRORED one of four ways, from
   * a hash of where it is: a mirrored join on a noise texture duplicates a row
   * of pixels and is invisible, while the pattern's period goes from one tile
   * to four. `paintMottle` then breaks up what is left at a much larger scale.
   *
   * THE TRANSITION. Caatinga becoming Floriano used to be a per-cell coin
   * flip, which is a dither — and a dither needs cells small enough to mix.
   * At a hundred units a side it was a chessboard of brown and green squares
   * with hard edges, several screens across, right at the gates of the town.
   * The coat below is one texture or the other, and `paintCityBlend` lays the
   * town in over it through a soft irregular mask.
   */
  private paintGround(g: CanvasRenderingContext2D, t0x: number, t0y: number) {
    const T = CONFIG.TILE
    const N = CONFIG.CHUNK_TILES
    g.fillStyle = '#5a6b3a'
    g.fillRect(0, 0, N * T, N * T)

    // How townish is this chunk, corner to corner? Kept so the blend pass can
    // be skipped everywhere except the band where it actually does something.
    let lo = 1
    let hi = 0
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const t = citynessAt(this.route, (t0x + i) * T + T / 2, (t0y + j) * T + T / 2)
        cityness[i * N + j] = t
        if (t < lo) lo = t
        if (t > hi) hi = t
      }
    }

    const solid = lo >= CITY_SOLID
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const wx = (t0x + i) * T
        const wy = (t0y + j) * T
        const v = (hash3(t0x + i, t0y + j, this.seed ^ 0x71f3) >>> 9) & 3
        const key = insideChurch(this.route, wx, wy)
          ? 'ground_church'
          : solid ? 'ground_city' : 'ground_caatinga'
        drawTile(g, this.assets.tile(key), i * T, j * T, T, v)
      }
    }

    if (hi > 0.02 && !solid) this.paintCityBlend(g, t0x, t0y)
  }

  /**
   * THE TOWN, laid over the scrub through a soft mask.
   *
   * Three canvases: this chunk, a coat of city texture, and a mask of blobs.
   * The coat is cut to the mask with `destination-in` and stamped down in one
   * blit, which is the only way to get an irregular edge out of two tiled
   * textures — a straight alpha cross-fade of two noise images turns both to
   * mush, which is why the original went with a dither instead.
   *
   * Each blob's opacity is `cityness` minus a per-blob random. That single
   * expression does the whole effect: out in the scrub almost every blob loses
   * its roll and the few that win are isolated patches of dirt; deep in town
   * almost every blob wins and they merge into solid ground; in between you
   * get a ragged, organic edge with outliers on both sides of it.
   *
   * The grid is WORLD-aligned with a margin, not chunk-aligned, so a blob
   * straddling a chunk border is drawn identically by both sides and no seam
   * appears — the same rule `paintMottle` follows.
   */
  private paintCityBlend(g: CanvasRenderingContext2D, t0x: number, t0y: number) {
    const city = this.assets.tile('ground_city')
    if (!city) return
    const T = CONFIG.TILE
    const N = CONFIG.CHUNK_TILES
    const S = N * T
    const ox = t0x * T
    const oy = t0y * T

    const layer = scratch(0, S)
    const mask = scratch(1, S)
    const lg = layer.getContext('2d')!
    const mg = mask.getContext('2d')!

    // The coat. Mirrored on a different salt from the base, so the two
    // textures do not end up varying in step with each other.
    lg.imageSmoothingEnabled = false
    lg.globalCompositeOperation = 'source-over'
    lg.clearRect(0, 0, S, S)
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const v = (hash3(t0x + i, t0y + j, this.seed ^ 0x2c07) >>> 9) & 3
        drawTile(lg, city, i * T, j * T, T, v)
      }
    }

    // The mask.
    mg.globalCompositeOperation = 'source-over'
    mg.clearRect(0, 0, S, S)
    mg.globalCompositeOperation = 'lighter'
    const step = 54
    /*
     * The margin has to exceed the largest reach of a blob whose grid point
     * sits outside this chunk — radius plus jitter, about a hundred — or the
     * two sides of a chunk border disagree about a blob they share and leave a
     * faint line down it.
     */
    const margin = 170
    const bx = Math.floor((ox - margin) / step) * step
    const by = Math.floor((oy - margin) / step) * step
    for (let px = bx; px < ox + S + margin; px += step) {
      for (let py = by; py < oy + S + margin; py += step) {
        const h = hash3(Math.round(px / step), Math.round(py / step), this.seed ^ 0x4b19)
        const n0 = ((h >>> 8) & 255) / 255
        const n1 = ((h >>> 16) & 255) / 255
        const n2 = ((h >>> 2) & 255) / 255
        const jx = px + (n1 - 0.5) * step * 0.9
        const jy = py + (n2 - 0.5) * step * 0.9
        /*
         * COVERAGE = cityness, minus a per-blob roll that SHRINKS as the town
         * takes over.
         *
         * The roll started out at a fixed weight, which meant the mask never
         * quite reached full opacity however deep into Floriano you went —
         * there were always a few blobs at a quarter alpha letting the scrub
         * show through. That was invisible in itself and produced a visible
         * line anywhere a fully-built chunk met a blended one, because one
         * side was solid town and the other was town with freckles.
         *
         * Scaling the roll by (1 - t) fixes both ends at once: it vanishes as
         * cityness approaches one, so deep town is genuinely solid and agrees
         * with the fast path below; and it dominates out in the scrub, where
         * only the luckiest few blobs land at all and read as isolated patches
         * of bare dirt.
         */
        const t = citynessAt(this.route, jx, jy)
        const a = Math.min(1, (t - n0 * (1 - t) * 1.8) * 4)
        if (a <= 0.02) continue
        const r = 42 + n1 * 34
        const cx = jx - ox
        const cy = jy - oy
        const grd = mg.createRadialGradient(cx, cy, 0, cx, cy, r)
        grd.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')')
        grd.addColorStop(0.55, 'rgba(255,255,255,' + (a * 0.72).toFixed(3) + ')')
        grd.addColorStop(1, 'rgba(255,255,255,0)')
        mg.fillStyle = grd
        mg.fillRect(cx - r, cy - r, r * 2, r * 2)
      }
    }

    lg.globalCompositeOperation = 'destination-in'
    lg.drawImage(mask, 0, 0)
    lg.globalCompositeOperation = 'source-over'
    g.drawImage(layer, 0, 0)
  }

  /**
   * Throws every baked chunk away.
   *
   * Called once a run, when he walks into the church: the terrain there is a
   * different terrain from that moment on, and the canvases holding the old
   * one are the only thing still claiming otherwise. A few dozen chunks are
   * rebuilt over the next couple of frames and that is the end of it.
   */
  rebake(box?: { x: number; y: number; halfW: number; halfH: number }) {
    if (!box) { this.cache.clear(); return }
    /*
     * TARGETED, because this one runs mid-game.
     *
     * Throwing the whole cache away at the church door meant rebuilding a
     * dozen chunks on the next frame, and a chunk is a few milliseconds now
     * that the ground is blended and mottled at two scales — three or four
     * dropped frames on the step through the door. Only the chunks the room
     * actually touches have changed, and there are about four of them.
     */
    for (const [k, c] of [...this.cache]) {
      const ox = c.cx * SIZE
      const oy = c.cy * SIZE
      if (ox > box.x + box.halfW || ox + SIZE < box.x - box.halfW) continue
      if (oy > box.y + box.halfH || oy + SIZE < box.y - box.halfH) continue
      this.cache.delete(k)
    }
  }

  /**
   * The church square: a paved apron, and the church itself standing on the
   * north edge of it so nothing can walk through the building — entities are
   * clamped inside the barrier, which runs along its steps.
   */
  private paintPlaza(g: CanvasRenderingContext2D, ox: number, oy: number, m: Landmark) {
    const pad = 70
    const x0 = m.x - m.halfW - pad
    const y0 = m.y - m.halfH - pad
    const w = (m.halfW + pad) * 2
    const h = (m.halfH + pad) * 2

    g.save()
    g.beginPath()
    g.rect(x0 - ox, y0 - oy, w, h)
    g.clip()
    g.fillStyle = '#8f8579'
    g.fillRect(x0 - ox, y0 - oy, w, h)

    /*
     * PAVING, not a chessboard.
     *
     * This was two alternating shades on a 20x12 grid, which is the obvious
     * way to draw stone and is wrong for one reason: perfect alternation is a
     * pattern the eye locks onto instantly, and the moment the player walked
     * up close the square in front of the church read as a giant draughts
     * board. It never showed while the church was only ever seen from a
     * distance.
     *
     * So: a mortar line between the stones, and each stone given its own
     * slight tone from a hash of where it is. The variation is much smaller
     * than the old alternation and it has no period, which is the whole
     * difference between texture and pattern.
     */
    const SW = 22
    const SH = 13
    const gx0 = Math.floor(x0 / SW) * SW
    const gy0 = Math.floor(y0 / SH) * SH
    for (let x = gx0; x < x0 + w; x += SW) {
      // Courses are offset every other row, the way paving is actually laid.
      const row = Math.round(x / SW)
      for (let y = gy0; y < y0 + h; y += SH) {
        const col = Math.round(y / SH)
        const shove = (col & 1) ? SW / 2 : 0
        const n = (hash3(row, col, this.seed ^ 0x9145) >>> 8) / 16777216
        // Four shades within a couple of percent of the base, so it reads as
        // wear rather than as a checker.
        g.fillStyle = n < 0.5
          ? 'rgba(0,0,0,' + (0.02 + n * 0.06).toFixed(3) + ')'
          : 'rgba(255,244,214,' + ((n - 0.5) * 0.09).toFixed(3) + ')'
        g.fillRect(x - ox + shove, y - oy, SW - 1.5, SH - 1.5)
      }
    }

    // The mortar, drawn over the stones as one dark grid rather than as gaps.
    g.fillStyle = 'rgba(58,52,44,0.20)'
    for (let x = gx0; x < x0 + w; x += SW) g.fillRect(x - ox, y0 - oy, 1.5, h)
    for (let y = gy0; y < y0 + h; y += SH) g.fillRect(x0 - ox, y - oy, w, 1.5)

    /*
     * And a dirty edge, so the square does not simply stop.
     *
     * A hard rectangle where paving meets scrub is the one thing that gives a
     * baked landmark away as a rectangle. Twelve units of gradient on each
     * side is enough to read as the ground taking the stone back.
     */
    const edge = 14
    const sides: [number, number, number, number, number, number][] = [
      [x0 - ox, y0 - oy, w, edge, 0, 1],
      [x0 - ox, y0 + h - oy - edge, w, edge, 0, -1],
      [x0 - ox, y0 - oy, edge, h, 1, 0],
      [x0 + w - ox - edge, y0 - oy, edge, h, -1, 0],
    ]
    for (const [bx, by, bw, bh, dx, dy] of sides) {
      const grd = g.createLinearGradient(
        bx + (dx < 0 ? bw : 0), by + (dy < 0 ? bh : 0),
        bx + (dx > 0 ? bw : dx < 0 ? 0 : 0), by + (dy > 0 ? bh : dy < 0 ? 0 : 0),
      )
      grd.addColorStop(0, 'rgba(94,88,64,0.55)')
      grd.addColorStop(1, 'rgba(94,88,64,0)')
      g.fillStyle = grd
      g.fillRect(bx, by, bw, bh)
    }
    g.restore()

    const church = this.assets.icon('b_igreja')
    if (church && church.width) {
      // The art is 1254 square; the facade wants to be about 230 units wide,
      // which is roughly the width of the square it stands on.
      const k = 230 / church.width
      const w = Math.round(church.width * k)
      const h = Math.round(church.height * k)
      g.drawImage(
        church,
        Math.round(m.x - ox - w / 2),
        Math.round(m.y - m.halfH - oy - h),
        w, h,
      )
      return
    }

    // Fallback, if the art ever fails to load: a facade made of rectangles.
    const bw = 236
    const cx0 = m.x - bw / 2 - ox
    const base = m.y - m.halfH
    const y = (dy: number) => base + dy - oy
    const mid = cx0 + bw / 2
    g.fillStyle = 'rgba(0,0,0,0.30)'
    g.fillRect(cx0 + 5, y(-84) + 5, bw, 84)
    g.fillStyle = '#e6dcc6'
    g.fillRect(cx0, y(-84), bw, 84)
    g.fillRect(cx0 - 22, y(-150), 46, 150)
    g.fillRect(cx0 + bw - 24, y(-150), 46, 150)
    g.fillStyle = '#8a4a3a'
    g.fillRect(cx0 - 26, y(-164), 54, 16)
    g.fillRect(cx0 + bw - 28, y(-164), 54, 16)
    g.fillRect(cx0 + 26, y(-104), bw - 52, 12)
    g.fillStyle = '#3a2b1e'
    g.fillRect(mid - 23, y(-38), 46, 38)
  }
}
