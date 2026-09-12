import type { Rarity } from '../types'

/**
 * SORTE.
 *
 * Luck is not a stat that does one thing. It is the input to every roll the
 * game makes on the player's behalf, and it lives here so that "what is luck
 * worth?" has exactly one answer to read instead of six scattered constants.
 *
 * Four things roll against it:
 *
 *   1. CRITS      — every bullet, fish and bomb rolls to hit twice as hard.
 *   2. CARDS      — the rarity tier of what you are offered on a level-up.
 *   3. O ESCUDO   — the RNG de RPG gamble, which is a luck card by nature.
 *   4. DROPS      — whether a corpse leaves something behind.
 *
 * That spread is deliberate. A luck card that only improved level-up offers
 * would be a stat about menus; one that only gave crits would be a worse
 * damage card. Touching all four makes it the card that makes the whole run
 * go better, which is what luck should feel like.
 *
 * Every curve here is SATURATING. Luck is meant to be worth taking at 1 and
 * still worth taking at 6, without a stacked-luck run rolling legendaries
 * every level and critting on every shot.
 */

/** Diminishing returns: 0 -> 0, and it approaches 1 without reaching it. */
function curve(luck: number, half: number): number {
  if (luck <= 0) return 0
  return luck / (luck + half)
}

// -------------------------------------------------------------- 1. CRITS --

/** Chance any given hit lands for `CRIT_MULT`. Base 4%, saturating near 45%. */
export function critChance(luck: number): number {
  return 0.04 + 0.45 * curve(luck, 5)
}

export const CRIT_MULT = 2

// -------------------------------------------------------------- 2. CARDS --

export const RARITIES: readonly Rarity[] = ['comum', 'incomum', 'raro', 'lendario']

/** What each tier is worth, for the card frame and the pick order. */
export const RARITY_STYLE: Record<Rarity, { label: string; color: string }> = {
  comum:    { label: 'COMUM',     color: '#9aa3ad' },
  incomum:  { label: 'INCOMUM',   color: '#6fcf6f' },
  raro:     { label: 'RARO',      color: '#6aa8ff' },
  lendario: { label: 'LENDÁRIO',  color: '#f0b24a' },
}

/**
 * The tier roll for one offered card.
 *
 * At luck 0 a legendary is a 2% event, which is what makes finding Reviva feel
 * like something rather than like a Tuesday. Luck drains the common tier into
 * the three above it, weighted so the top tier grows slowest — luck should
 * make good cards common, not make legendaries routine.
 */
export function rarityOdds(luck: number): Record<Rarity, number> {
  const shift = 0.42 * curve(luck, 4)
  const comum = 0.62 - shift
  return {
    comum,
    incomum: 0.26 + shift * 0.5,
    raro: 0.10 + shift * 0.36,
    lendario: 0.02 + shift * 0.14,
  }
}

/** Rolls one tier. Falls back down the tiers when a tier has nothing left. */
export function rollRarity(luck: number): Rarity {
  const odds = rarityOdds(luck)
  let r = Math.random()
  for (const tier of RARITIES) {
    r -= odds[tier]
    if (r <= 0) return tier
  }
  return 'comum'
}

// ------------------------------------------------------------- 3. GAMBLES --

/**
 * Bends a plain probability toward happening. Used by the RNG de RPG roll, so
 * that the ability whose entire identity is a dice throw is the one luck helps
 * most obviously.
 */
export function luckyChance(base: number, luck: number): number {
  return Math.min(0.95, base + (1 - base) * curve(luck, 6))
}

// --------------------------------------------------------------- 4. DROPS --

/** Multiplier on how often a kill leaves a pickup behind. */
export function dropBonus(luck: number): number {
  return 1 + 1.5 * curve(luck, 5)
}
