import { CONFIG } from '../config'
import { mulberry32, hash3 } from '../core/rng'
import type { Assets } from '../core/assets'
import type { IconKey } from '../data/sprites'
import { blend, inChurchRoom, type Landmark, inLandmark } from './biomes'
import type { Route } from './route'

/**
 * EVERYTHING STANDING IN THE WORLD.
 *
 * These used to be painted straight into the baked chunk canvas, which was
 * cheap and wrong in three ways at once:
 *
 *   1. A building near a chunk edge was CLIPPED by the canvas it was painted
 *      into. Half a house, sliced off in a straight line, with the neighbour
 *      chunk drawing nothing — the "cut off by the floor" problem.
 *   2. Baked art is under everything for ever. There is no way to walk BEHIND
 *      a house if the house is part of the ground.
 *   3. Nothing knew where anything was, so nothing could be solid.
 *
 * So props are entities now. Still generated deterministically per chunk from
 * the world seed — the same seed always builds the same Floriano — but kept as
 * a list of positions instead of pixels. That single change buys the Y-sorting
 * and the collision together.
 */

export interface Prop {
  /** Foot position: where it stands, and what it sorts by. */
  x: number
  y: number
  icon: IconKey
  w: number
  h: number
  /**
   * Half-extents of the blocking box at the foot. Zero means you walk through
   * it — grass and signage — and anything else is a wall.
   *
   * The box is deliberately much shorter than the art. A building is drawn
   * seventy units tall and blocks about eighteen: the upper storeys are
   * scenery the player walks BEHIND, and only the footprint is a wall. Solid
   * to the full height of the sprite would make a street feel like a canyon.
   */
  solidW: number
  solidH: number
}

interface PropRule {
  icon: IconKey
  chance: number
  minDist: number
  maxDist: number
  scale: number
  /** Fraction of the drawn width/height that actually blocks. 0 = passable. */
  solid?: number
}

/*
 * SCALES ARE AGAINST THE PLAYER, who stands about 22 world units tall, and
 * DISTANCES ARE AGAINST THE VIEW, which is about 520x370 units — so a little
 * over 250 either side of the route is on screen when it runs vertically, and
 * about 185 when it runs across.
 *
 * THE CORRIDOR IS THE LOAD-BEARING NUMBER. Nothing solid stands within ~100
 * units of the route, giving a lane close to 200 wide. The first pass used 56
 * and the caatinga closed around it: a test walk covered barely half the
 * ground it should have and eventually wedged for good. A corridor has to be
 * wide enough that a player being shoved by a crowd still fits down it.
 */
const CAATINGA_PROPS: PropRule[] = [
  { icon: 'e_cactus', chance: 0.34, minDist: 100, maxDist: 460, scale: 0.29, solid: 0.13 },
  { icon: 'e_palmeiras', chance: 0.16, minDist: 106, maxDist: 460, scale: 0.30, solid: 0.12 },
]

/*
 * FLORIANO, in three rows.
 *
 * The first version had one band, 104 to 158, and every rule in the table was
 * eligible for every slot — the generator picked a rule at random and THEN
 * checked whether that rule's band contained the slot. Almost every draw
 * failed, so a screen in the middle of town held TWO buildings and a lot of
 * dirt. The generator picks among the rules that fit the slot now, which is
 * most of the difference on its own.
 *
 * The rest of it is depth. A single row of houses either side of a lane is a
 * film set, not a town: what makes somewhere read as a city is seeing roofs
 * BEHIND the roofs in front of you. So there are three bands, and the further
 * ones are drawn smaller — a cheap forced perspective that costs nothing and
 * does most of the work.
 *
 *   FRONT   100-190   full size, the street he is walking down
 *   MID     185-280   slightly smaller, the next street over
 *   BACK    270-420   half size, the town going on without him
 */
const CITY_PROPS: PropRule[] = [
  // ---- the street he is on -------------------------------------------------
  { icon: 'b_home_1', chance: 0.72, minDist: 100, maxDist: 190, scale: 0.38, solid: 0.30 },
  { icon: 'b_home_2', chance: 0.72, minDist: 100, maxDist: 190, scale: 0.38, solid: 0.30 },
  { icon: 'b_home_3', chance: 0.70, minDist: 100, maxDist: 190, scale: 0.38, solid: 0.30 },
  { icon: 'b_home_4', chance: 0.70, minDist: 100, maxDist: 190, scale: 0.42, solid: 0.30 },
  { icon: 'b_apartamento', chance: 0.58, minDist: 100, maxDist: 190, scale: 0.36, solid: 0.30 },
  { icon: 'b_bar', chance: 0.52, minDist: 100, maxDist: 190, scale: 0.38, solid: 0.30 },
  { icon: 'b_acougue', chance: 0.50, minDist: 100, maxDist: 190, scale: 0.38, solid: 0.30 },
  { icon: 'b_farmacia', chance: 0.50, minDist: 100, maxDist: 190, scale: 0.38, solid: 0.30 },
  { icon: 'b_mercearia', chance: 0.50, minDist: 100, maxDist: 190, scale: 0.38, solid: 0.30 },
  { icon: 'b_oficina', chance: 0.48, minDist: 100, maxDist: 190, scale: 0.36, solid: 0.30 },
  { icon: 'b_salao', chance: 0.48, minDist: 100, maxDist: 190, scale: 0.38, solid: 0.30 },
  { icon: 'b_abandonado', chance: 0.38, minDist: 100, maxDist: 190, scale: 0.38, solid: 0.30 },

  // ---- the next street over ----------------------------------------------
  { icon: 'b_home_1', chance: 0.62, minDist: 185, maxDist: 280, scale: 0.31, solid: 0.30 },
  { icon: 'b_home_2', chance: 0.62, minDist: 185, maxDist: 280, scale: 0.31, solid: 0.30 },
  { icon: 'b_home_3', chance: 0.60, minDist: 185, maxDist: 280, scale: 0.31, solid: 0.30 },
  { icon: 'b_home_4', chance: 0.60, minDist: 185, maxDist: 280, scale: 0.34, solid: 0.30 },
  { icon: 'b_apartamento', chance: 0.54, minDist: 185, maxDist: 280, scale: 0.30, solid: 0.30 },
  { icon: 'b_mercearia', chance: 0.44, minDist: 185, maxDist: 280, scale: 0.31, solid: 0.30 },
  { icon: 'b_oficina', chance: 0.44, minDist: 185, maxDist: 280, scale: 0.30, solid: 0.30 },
  { icon: 'b_abandonado', chance: 0.40, minDist: 185, maxDist: 280, scale: 0.31, solid: 0.30 },
  { icon: 'b_igrejinha', chance: 0.14, minDist: 185, maxDist: 280, scale: 0.30, solid: 0.30 },

  // ---- the town going on without him -------------------------------------
  // Never solid: he is not going out there, and a wall he cannot reach is a
  // wall that can only ever be a nuisance to something else's pathing.
  /*
   * `b_home1` — the wide terrace strip — is wired up in `sprites.ts` but the
   * file has never existed, so the rule that used to sit here drew nothing and
   * quietly thinned the back row by half. Real houses until the art turns up.
   */
  { icon: 'b_home_3', chance: 0.52, minDist: 270, maxDist: 420, scale: 0.23 },
  { icon: 'b_home_1', chance: 0.48, minDist: 270, maxDist: 420, scale: 0.23 },
  { icon: 'b_home_2', chance: 0.46, minDist: 270, maxDist: 420, scale: 0.23 },
  { icon: 'b_home_4', chance: 0.46, minDist: 270, maxDist: 420, scale: 0.25 },
  { icon: 'b_apartamento', chance: 0.44, minDist: 270, maxDist: 420, scale: 0.23 },
  { icon: 'b_abandonado', chance: 0.34, minDist: 270, maxDist: 420, scale: 0.23 },
  { icon: 'b_igrejinha', chance: 0.12, minDist: 270, maxDist: 420, scale: 0.24 },

  // ---- street furniture, tight to the lane so it frames it ----------------
  // Lamp posts are NOT in this table. They are laid along the route in
  // `streetLights` below, because a scattered light is not a lit street.
  { icon: 'e_palmeiras', chance: 0.16, minDist: 100, maxDist: 240, scale: 0.30, solid: 0.12 },
]

/** Rules whose band contains this lateral distance. Reused, never allocated. */
const eligible: PropRule[] = []
function rulesFor(table: readonly PropRule[], lateral: number): PropRule[] {
  eligible.length = 0
  for (let i = 0; i < table.length; i++) {
    const r = table[i]
    if (lateral >= r.minDist && lateral <= r.maxDist) eligible.push(r)
  }
  return eligible
}

/**
 * STREET LIGHTING.
 *
 * Laid down the route at a fixed interval, alternating sides, rather than
 * drawn from the random prop table like everything else — and that distinction
 * is the whole reason night works.
 *
 * Scattered, a lamp post has to win a slot against twelve building rules and
 * then pass its own roll, which came out at about one every three screens.
 * That is fine as scenery and useless as light: the sun goes down over
 * Floriano and the town is dark with the occasional inexplicable glow. Lamps
 * are infrastructure. Somebody put them there on purpose, evenly, down both
 * sides, and it should look like it.
 *
 * They start where the asphalt does and stop at the church, which has its own
 * light.
 */
const LAMP_FROM = 10100
const LAMP_STEP = 172
/*
 * ON THE KERB, INSIDE the building band.
 *
 * At 116 they sat in the same lateral range as the front row of houses and
 * spent most of the night behind one — a light source you cannot see is just
 * an unexplained bright patch. Ninety is between the walking lane and the
 * first wall, which is where a council would put them anyway.
 */
const LAMP_OFF = 90

function streetLights(
  route: Route, assets: Assets, marks: readonly Landmark[],
  worldX0: number, worldY0: number, size: number, out: Prop[],
) {
  const img = assets.icon('e_luz')
  if (!img || !img.width) return
  const scale = 0.22
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  let n = 0
  for (let d = LAMP_FROM; d < route.total; d += LAMP_STEP, n++) {
    const at = route.pointAt(d)
    // Cheap reject before the heading maths: a lamp more than a chunk away
    // cannot land in this one however far it is offset.
    if (at.x < worldX0 - 260 || at.x > worldX0 + size + 260) continue
    if (at.y < worldY0 - 260 || at.y > worldY0 + size + 260) continue

    const head = route.headingAt(d)
    const side = (n & 1) ? 1 : -1
    const x = at.x + Math.cos(head + Math.PI / 2) * LAMP_OFF * side
    const y = at.y + Math.sin(head + Math.PI / 2) * LAMP_OFF * side
    if (x < worldX0 || x >= worldX0 + size) continue
    if (y < worldY0 || y >= worldY0 + size) continue
    // Not in a boss arena, and not inside the church.
    if (inLandmark(marks, x, y, 30)) continue
    if (inChurchRoom(route, x, y)) continue

    /*
     * NOT SOLID. A pole this close to the lane would be a thing the player
     * catches on while being shoved by a crowd, and the corridor rule exists
     * precisely so nothing does that. It is scenery that emits light.
     */
    out.push({ x, y, icon: 'e_luz', w, h, solidW: 0, solidH: 0 })
  }
}

const SIGNS: { icon: IconKey; at: number; side: number; off: number; scale: number }[] = [
  { icon: 'e_placa_piaui', at: 1600, side: 1, off: 82, scale: 0.30 },
  { icon: 'e_placa_bemvindo', at: 10380, side: -1, off: 78, scale: 0.34 },
  { icon: 'e_placa_floriano', at: 10560, side: 1, off: 76, scale: 0.20 },
]

const TOWN_FROM = 9700
const TOWN_FULL = 10900

/**
 * The props standing in one chunk.
 *
 * Pure function of (chunk, seed, route), so it survives the cache being
 * evicted and refilled and always rebuilds the same town.
 *
 * NOTE THE MARGIN. Slots are generated over a region rather larger than the
 * chunk, because a building whose FOOT is in the neighbouring chunk may still
 * be visible in this one — it is fifty units tall. The caller de-duplicates by
 * only ever asking each chunk for its own; the margin is for the query, not
 * for the ownership.
 */
export function propsInChunk(
  cx: number, cy: number, seed: number, route: Route,
  assets: Assets, marks: readonly Landmark[],
): Prop[] {
  const size = CONFIG.TILE * CONFIG.CHUNK_TILES
  const worldX0 = cx * size
  const worldY0 = cy * size
  const rnd = mulberry32(hash3(cx, cy, seed ^ 0x9a03))
  const out: Prop[] = []

  /*
   * A FINER GRID than before — 74 units down to 52, so a chunk offers 132
   * candidate slots instead of 64. Density is the point of this pass and the
   * cheapest half of it is simply asking more often.
   */
  const step = 52
  for (let sx = 0; sx < size; sx += step) {
    for (let sy = 0; sy < size; sy += step) {
      const wx = worldX0 + sx + rnd() * step
      const wy = worldY0 + sy + rnd() * step
      if (inLandmark(marks, wx, wy, 40)) continue

      /*
       * Nothing is scattered on the church's ground, before or after he goes
       * in. Outside it is a square; inside it is bare stone on purpose — five
       * bullet-hell stages are fought in that room, and every cactus in it
       * would be a thing the player dies behind.
       */
      if (inChurchRoom(route, wx, wy)) continue

      const hit = route.nearest(wx, wy)
      const cityness = blend(hit.d, TOWN_FROM, TOWN_FULL)
        * (1 - blend(hit.lateral, 420, 800))

      /*
       * PICK AMONG THE RULES THAT FIT, rather than picking one and hoping.
       *
       * This used to draw a rule at random from the whole table and then check
       * whether that rule's distance band happened to contain the slot. With
       * seventeen rules over one narrow band, almost every draw failed — a
       * screen in the middle of Floriano held two buildings. Filtering first
       * is the same table, the same weights, and about six times the town.
       */
      const table = rnd() < cityness ? CITY_PROPS : CAATINGA_PROPS
      const fit = rulesFor(table, hit.lateral)
      if (fit.length === 0) continue
      const rule = fit[Math.floor(rnd() * fit.length)]
      if (rnd() > rule.chance) continue

      const img = assets.icon(rule.icon)
      if (!img || !img.width) continue
      const w = Math.round(img.width * rule.scale)
      const h = Math.round(img.height * rule.scale)

      /*
       * NOT ON TOP OF THE LAST ONE.
       *
       * At this density two buildings will occasionally land within a few
       * units of each other, which reads as one building with a rendering
       * fault rather than as two. Half the drawn width apart is enough to keep
       * them overlapping like a terrace without merging. O(n^2) over the sixty
       * or so props in a chunk, once, at bake time.
       */
      const near = w * 0.42
      let clash = false
      for (let i = out.length - 1; i >= 0; i--) {
        const o = out[i]
        if (Math.abs(o.x - wx) < near && Math.abs(o.y - wy) < near * 0.5) {
          clash = true
          break
        }
      }
      if (clash) continue

      const s = rule.solid ?? 0
      out.push({
        x: wx, y: wy, icon: rule.icon, w, h,
        solidW: (w / 2) * s,
        // The blocking box is a shallow slab at the foot, never the whole
        // sprite — you walk behind a house, you do not walk into its roof.
        solidH: s > 0 ? Math.max(6, h * s * 0.28) : 0,
      })
    }
  }

  streetLights(route, assets, marks, worldX0, worldY0, size, out)

  // Signs belong to whichever chunk their foot lands in.
  for (const sign of SIGNS) {
    const at = route.pointAt(sign.at)
    const head = route.headingAt(sign.at)
    const x = at.x + Math.cos(head + Math.PI / 2) * sign.off * sign.side
    const y = at.y + Math.sin(head + Math.PI / 2) * sign.off * sign.side
    if (x < worldX0 || x >= worldX0 + size) continue
    if (y < worldY0 || y >= worldY0 + size) continue
    const img = assets.icon(sign.icon)
    if (!img || !img.width) continue
    out.push({
      x, y, icon: sign.icon,
      w: Math.round(img.width * sign.scale),
      h: Math.round(img.height * sign.scale),
      solidW: 0, solidH: 0,
    })
  }

  return out
}

/**
 * Props, cached per chunk, with the queries the renderer and the physics need.
 */
export class PropField {
  private cache = new Map<number, Prop[]>()

  constructor(
    private seed: number,
    private route: Route,
    private assets: Assets,
    private marks: readonly Landmark[],
  ) {}

  private key(cx: number, cy: number) { return cx * 100000 + cy }

  chunk(cx: number, cy: number): Prop[] {
    const k = this.key(cx, cy)
    let hit = this.cache.get(k)
    if (!hit) {
      hit = propsInChunk(cx, cy, this.seed, this.route, this.assets, this.marks)
      this.cache.set(k, hit)
      // Generous: props are a few dozen numbers each, and regenerating a chunk
      // costs a route query per slot.
      if (this.cache.size > 400) {
        const oldest = this.cache.keys().next().value
        if (oldest !== undefined) this.cache.delete(oldest)
      }
    }
    return hit
  }

  /** Every prop whose foot lies within `pad` of the box. */
  query(x0: number, y0: number, x1: number, y1: number, out: Prop[]): Prop[] {
    out.length = 0
    const size = CONFIG.TILE * CONFIG.CHUNK_TILES
    const c0 = Math.floor(x0 / size)
    const c1 = Math.floor(x1 / size)
    const r0 = Math.floor(y0 / size)
    const r1 = Math.floor(y1 / size)
    for (let cx = c0; cx <= c1; cx++) {
      for (let cy = r0; cy <= r1; cy++) {
        const list = this.chunk(cx, cy)
        for (let i = 0; i < list.length; i++) {
          const p = list[i]
          if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue
          out.push(p)
        }
      }
    }
    return out
  }

  /**
   * Pushes a circle out of anything solid nearby, and reports where it ended.
   *
   * Axis-separated resolution: whichever overlap is shallower is the one that
   * gets undone, which is what makes a body SLIDE along a wall instead of
   * sticking to it. Walking into the front of a house should send you along
   * the street, not stop you dead in it.
   */
  resolve(x: number, y: number, radius: number): { x: number; y: number } {
    const pad = 140
    this.query(x - pad, y - pad, x + pad, y + pad, scratch)

    /*
     * ONE PUSH PER FRAME, out of whichever box is deepest.
     *
     * Resolving every overlap in sequence looks more correct and is much
     * worse: two props whose boxes overlap push a body back and forth and it
     * ends up WEDGED, unable to leave. A test walk got permanently stuck in
     * the caatinga at the same spot every run. Solving only the worst overlap
     * lets the next frame handle whatever is left, and a body slides out
     * instead of jamming.
     */
    let best: Prop | null = null
    let bestOx = 0
    let bestOy = 0
    let bestDepth = 0

    for (let i = 0; i < scratch.length; i++) {
      const p = scratch[i]
      if (p.solidW <= 0) continue
      const cy = p.y - p.solidH * 0.35
      const dx = x - p.x
      const dy = y - cy
      const ox = p.solidW + radius - Math.abs(dx)
      if (ox <= 0) continue
      const oy = p.solidH + radius - Math.abs(dy)
      if (oy <= 0) continue
      const depth = Math.min(ox, oy)
      if (depth > bestDepth) {
        bestDepth = depth
        best = p
        bestOx = dx >= 0 ? ox : -ox
        bestOy = dy >= 0 ? oy : -oy
      }
    }

    if (best) {
      // Whichever overlap is shallower is the one undone, which is what makes
      // a body SLIDE along a wall rather than stick to it.
      if (Math.abs(bestOx) < Math.abs(bestOy)) x += bestOx
      else y += bestOy
    }
    return { x, y }
  }
}

const scratch: Prop[] = []
