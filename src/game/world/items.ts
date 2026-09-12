import { CONFIG } from '../config'
import { hash3, mulberry32 } from '../core/rng'
import type { Route } from './route'

/**
 * THINGS LYING IN THE WORLD.
 *
 * Not loot and not an upgrade card — an object that is simply out there, in a
 * fixed place, waiting to be walked into. Its position is derived from the
 * world seed like everything else in the terrain, so the same seed always
 * hides it in the same spot, and picking one up can be remembered by position
 * rather than by tracking an entity.
 *
 * Rolled per LEG OF THE ROUTE, not per chunk and not per world column.
 *
 * It used to roll per chunk column, which was correct only while the journey
 * ran in a straight line east — the route wanders now, and a column of world
 * space may contain the way in twice or not at all. A leg is a fixed slice of
 * distance TRAVELLED, so the odds of meeting a totem are the same whether the
 * route is running straight or doubling around a hill.
 *
 * THE TOTEM DO HOMÚNCULO is the only one so far, and it is meant to be rare
 * enough that finding one is an event: about one per run, near enough to the
 * way in to be spotted while travelling, far enough off it that you have to go
 * and get it.
 */

/** How much travelled distance one roll covers. */
export const LEG = CONFIG.TILE * CONFIG.CHUNK_TILES

/** Roughly one leg in twenty-two, so about one per journey. */
const TOTEM_CHANCE = 0.045

/** Placed in this band either side of the way — visible, but off the path. */
const TOTEM_MIN_OFF = 110
const TOTEM_MAX_OFF = 280

export interface WorldItem {
  x: number
  y: number
}

/**
 * The totem hidden in this column of the world, if any. Pure function of
 * (column, seed), so it survives the chunk cache being evicted and refilled.
 */
export function totemInLeg(leg: number, seed: number, route: Route): WorldItem | null {
  const rnd = mulberry32(hash3(leg, 0x707e, seed))
  if (rnd() > TOTEM_CHANCE) return null

  const along = leg * LEG + LEG * (0.2 + rnd() * 0.6)
  const at = route.pointAt(along)
  // Offset along the route's own normal, so "beside the way" stays beside the
  // way even where it is running diagonally.
  const head = route.headingAt(along)
  const side = rnd() < 0.5 ? -1 : 1
  const off = TOTEM_MIN_OFF + rnd() * (TOTEM_MAX_OFF - TOTEM_MIN_OFF)
  return {
    x: at.x + Math.cos(head + Math.PI / 2) * off * side,
    y: at.y + Math.sin(head + Math.PI / 2) * off * side,
  }
}
