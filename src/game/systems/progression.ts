import type { Game } from '../Game'
import { CONFIG } from '../config'
import { STAGES, stageAt } from '../data/stages'
import { STAT_SLOTS, UPGRADES, powerCap, type Upgrade } from '../data/weapons'
import { RARITIES, rollRarity } from '../data/luck'
import type { Rarity } from '../types'

/** Level N costs XP_BASE + XP_STEP * (N-1)^XP_CURVE, rounded. */
export function xpForLevel(level: number): number {
  return Math.round(CONFIG.XP_BASE + CONFIG.XP_STEP * Math.pow(level - 1, CONFIG.XP_CURVE))
}

/**
 * Watches how far east the player has walked and swaps acts when they cross a
 * threshold. Nothing is loaded or unloaded — the spawn table changes, a title
 * card fades through, and the terrain generator has already been blending the
 * ground for the last few hundred units.
 */
/** How long a line stays over his head. Long enough to read, over a fight. */
const BARK_SECONDS = 2.6

/** How long an act title holds the screen. Also the opening's quiet period. */
export const BANNER_SECONDS = 4.2

export function updateProgression(g: Game, dt: number) {
  if (g.banner) {
    g.banner.t += dt
    if (g.banner.t > BANNER_SECONDS) g.banner = null
  }

  if (g.bark) {
    g.bark.t += dt
    if (g.bark.t > BARK_SECONDS) {
      g.bark = null
      const next = g.takeQueuedBark()
      if (next) g.bark = { text: next, t: 0 }
    }
  }

  /*
   * THE BOSS TALKS, on a much slower clock than the player.
   *
   * Eleven to eighteen seconds. A boss that comments every few seconds stops
   * being frightening and starts being a companion, and these lines are worth
   * more when there is room around them. Event lines push the clock back so
   * the ambient one does not step on them.
   */
  if (g.bossBark) {
    g.bossBark.t += dt
    if (g.bossBark.t > BARK_SECONDS + 0.6) g.bossBark = null
  }
  if (g.bossRef && g.arenaLocked) {
    g.bossBarkCd -= dt
    if (g.bossBarkCd <= 0) {
      g.bossBarkCd = 11 + Math.random() * 7
      if (!g.bossBark) g.bossSay(g.bossRef.def.id)
    }
  } else {
    g.bossBark = null
  }

  /*
   * OUT OF TROUBLE, AND ALONE ON THE ROAD.
   *
   * Two conditions rather than two events, which is why they are watched here
   * instead of fired from wherever the health or the spawner changed. Both go
   * through `react`'s cooldown, so a player who hovers around a third of health
   * for a minute is not narrated the whole way.
   */
  const p = g.player
  const frac = p.hp / p.maxHp
  if (frac < 0.34) g.wasLow = true
  else if (g.wasLow && frac > 0.62) { g.wasLow = false; g.react('healed', undefined, 20) }

  /*
   * The empty road. Only checked when the field is nearly clear anyway, so the
   * distance loop costs nothing on the frames that matter.
   */
  if (!g.arenaLocked && g.enemies.count <= 6) {
    let near = false
    for (const e of g.enemies.items) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < 320) { near = true; break }
    }
    g.quietT = near ? 0 : g.quietT + dt
    if (g.quietT > 11) { g.quietT = 0; g.react('quiet', undefined, 40) }
  } else {
    g.quietT = 0
  }

  const next = stageAt(g.player.reach)
  if (next !== g.stageIndex) {
    g.stageIndex = next
    const s = STAGES[next]
    g.showBanner(s.name, s.subtitle)
    // Queued behind the title card, so he comments once it has cleared.
    if (s.id === 'streets') g.react('arrivedFloriano', 'arrivedFloriano')
    if (s.id === 'church') g.react('arrivedChurch', 'arrivedChurch')
  }
}

/**
 * How many distinct cards of each capped kind the player is carrying.
 *
 * Distinct, not total: taking Melhorar a Arma six times is one stat slot. The
 * cap is on how WIDE a build gets, never on how deep.
 */
export function slotsUsed(g: Game): { power: number; stat: number } {
  let power = 0
  let stat = 0
  for (const u of UPGRADES) {
    if (!g.taken[u.id]) continue
    if (u.kind === 'power') power++
    else if (u.kind === 'stat') stat++
  }
  return { power, stat }
}

/**
 * Can this card still be offered?
 *
 * Three gates. Its own take limit, its own `available` predicate, and — for
 * the two capped kinds — whether there is a slot left for it. A card the
 * player ALREADY owns is always allowed through the slot gate, because a full
 * build must still be able to deepen; it just cannot widen.
 */
function offerable(g: Game, u: Upgrade, used: { power: number; stat: number }): boolean {
  const owned = g.taken[u.id] ?? 0
  if (owned >= u.max) return false
  if (!(u.available?.(g.player) ?? true)) return false
  if (owned > 0) return true
  /*
   * A full power bar still gets offered new powers — taking one opens the swap
   * screen rather than being silently impossible. Stats do not: they are small
   * numeric bumps, and a swap prompt for +7% speed is friction with no
   * decision in it.
   */
  if (u.kind === 'stat') return used.stat < STAT_SLOTS
  return true
}

/**
 * Draws three distinct upgrade cards.
 *
 * TWO ROLLS, NOT ONE. A tier is rolled first — and the player's SORTE is what
 * bends that roll — then a card is picked from inside that tier by weight. A
 * single flat weight over the whole deck meant every card added made the ones
 * carrying the build harder to find; this way a card only ever competes with
 * its own tier, so the deck can grow without diluting anything.
 *
 * An empty tier falls back down to the next one below it rather than rerolling
 * for ever, so a run that has exhausted the legendaries still gets three cards.
 */
/**
 * FROM WHAT LEVEL THE HAND IS STEERED.
 *
 * Not from the first: the early levels are where a run's character is decided
 * and a deck that starts helping immediately decides it for you. By six the
 * player has a build they are trying to make, and a hand of three cards none of
 * which touches it is a level they waited two minutes for and got nothing from.
 */
const STEER_FROM_LEVEL = 6

/**
 * IS THIS A CARD THE PLAYER WOULD ACTUALLY TAKE?
 *
 * Three things qualify, and they are the three ways a card can matter:
 *
 *   - ONE THEY ALREADY OWN. It deepens something they chose, which is the
 *     definition of a card that fits the build.
 *   - A POWER WITH ROOM FOR IT. New powers are the only cards that change what
 *     a run can DO, and one that costs nothing to slot is always interesting.
 *   - ANYTHING RARE OR LEGENDARY. A tier that turns up seldom enough to be a
 *     moment is worth having even when it is off-build.
 *
 * What is left over — a fresh common stat, on a run that has already spent its
 * stat slots on other common stats — is the card the complaint is about.
 */
function wanted(g: Game, u: Upgrade, used: { power: number; stat: number }): boolean {
  if ((g.taken[u.id] ?? 0) > 0) return true
  if (u.rarity === 'raro' || u.rarity === 'lendario') return true
  if (u.kind === 'power' || u.kind === 'special') {
    return used.power < powerCap(g.taken)
  }
  return false
}

export function rollUpgrades(g: Game, count = 3): Upgrade[] {
  const used = slotsUsed(g)
  const pool = UPGRADES.filter((u) => offerable(g, u, used))

  const byTier = new Map<Rarity, Upgrade[]>()
  for (const tier of RARITIES) byTier.set(tier, [])
  for (const u of pool) byTier.get(u.rarity)!.push(u)

  const picks: Upgrade[] = []
  for (let n = 0; n < count; n++) {
    let tier: Rarity | null = rollRarity(g.player.mods.luck)
    // Walk down to a tier that still has something in it.
    let idx = RARITIES.indexOf(tier)
    while (idx >= 0 && byTier.get(RARITIES[idx])!.length === 0) idx--
    if (idx < 0) {
      // Nothing at or below: try upward before giving up.
      idx = RARITIES.findIndex((t) => byTier.get(t)!.length > 0)
      if (idx < 0) break
    }
    tier = RARITIES[idx]

    const bucket = byTier.get(tier)!
    let total = 0
    for (const u of bucket) total += u.weight
    let r = Math.random() * total
    let chosen = bucket[bucket.length - 1]
    for (const u of bucket) {
      r -= u.weight
      if (r <= 0) { chosen = u; break }
    }
    picks.push(chosen)
    bucket.splice(bucket.indexOf(chosen), 1)
  }

  /*
   * AND AT LEAST ONE OF THEM HAS TO BE WORTH TAKING.
   *
   * The two-roll scheme above is fair and completely indifferent to what the
   * player is building: three commons that all miss the build is a legal hand,
   * and on a long run it comes up often enough to be the thing people remember
   * about levelling. Waiting two minutes for a level and being handed nothing
   * is worse than the level not existing.
   *
   * So the hand is CHECKED, not rigged. If anything in it already qualifies —
   * which is most of the time — nothing happens at all and the roll stands.
   * Only a completely dead hand gets one card swapped, and the swap goes into
   * the LAST slot so the first two are still whatever the dice said.
   *
   * The replacement is drawn by weight from the wanted cards, not simply the
   * best one available: a guaranteed legendary every time the dice missed would
   * make a dead hand better than a live one.
   */
  if (g.player.level >= STEER_FROM_LEVEL && picks.length > 0
    && !picks.some((u) => wanted(g, u, used))) {
    const good = pool.filter((u) => wanted(g, u, used) && !picks.includes(u))
    if (good.length) {
      let total = 0
      for (const u of good) total += u.weight
      let r = Math.random() * total
      let swap = good[good.length - 1]
      for (const u of good) {
        r -= u.weight
        if (r <= 0) { swap = u; break }
      }
      picks[picks.length - 1] = swap
    }
  }

  return picks
}
