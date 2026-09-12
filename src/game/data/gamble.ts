/**
 * O RNG DE RPG.
 *
 * One table, rolled on a timer, and you live with the answer.
 *
 * The old version was a coin flip for a shield — heads you got one, tails you
 * got nothing. "Nothing" is the least interesting result a gamble can have,
 * and a gamble you cannot lose is not a gamble at all. So this table has real
 * teeth in it: a jammed revolver, a blast centred on your own feet, a whistle
 * that brings more of them running. **It is the only thing in the build that
 * can hurt you.**
 *
 * THREE RULES kept it from being miserable:
 *
 *   1. Nothing here can kill you outright. The self-damage outcomes are capped
 *      so they always leave you standing, because dying to your own upgrade
 *      while a boss watches is a bug report, not a story.
 *   2. Bad outcomes are LOUD and SHORT. You always know what happened and why,
 *      and it is over in seconds.
 *   3. Luck buys you out of them. `sorte`, plus a stack bonus from the card
 *      itself, shifts weight from the bad half of the table to the good half —
 *      so the gamble card and the luck cards are worth more together than
 *      apart, which is the whole reason both exist.
 *
 * Raio de Tupã used to live here as the jackpot. It is its own power card now:
 * a bolt that big deserved to be something a player can choose and build
 * around rather than something that occasionally happened to them.
 *
 * Weights below are the LUCKLESS odds. See `weightFor` for how luck bends them.
 */

export type GambleTone = 'bom' | 'ruim'

export interface GambleOutcome {
  id: string
  /** Shouted over his head the moment it lands. */
  label: string
  tone: GambleTone
  /** Base weight at zero luck. */
  weight: number
  /**
   * How hard luck moves this one, per point.
   *
   * Positive for prizes, negative for punishments. A big number means luck
   * changes this outcome's odds a lot — the jackpots and the disasters both
   * swing hardest, so a lucky run does not merely avoid trouble, it starts
   * hitting things an unlucky run never sees.
   */
  pull: number
}

export const GAMBLE: GambleOutcome[] = [
  // ------------------------------------------------------------- PRIZES --
  {
    id: 'escudo', label: 'ESCUDO!', tone: 'bom',
    weight: 16, pull: 0.9,
  },
  {
    id: 'furia', label: 'MÃO QUENTE!', tone: 'bom',
    weight: 14, pull: 0.8,
  },
  {
    id: 'forca', label: 'FORÇA BRUTA!', tone: 'bom',
    weight: 13, pull: 0.8,
  },
  {
    id: 'ligeiro', label: 'PÉ DE VENTO!', tone: 'bom',
    weight: 12, pull: 0.7,
  },
  {
    id: 'cura', label: 'REMÉDIO!', tone: 'bom',
    weight: 11, pull: 0.7,
  },
  {
    id: 'sumico', label: 'SUMIÇO!', tone: 'bom',
    weight: 8, pull: 0.6,
  },
  {
    id: 'carga', label: 'CARGA EXTRA!', tone: 'bom',
    weight: 6, pull: 1.1,
  },
  {
    id: 'colheita', label: 'COLHEITA!', tone: 'bom',
    weight: 8, pull: 0.6,
  },

  // --------------------------------------------------------- PUNISHMENTS --
  {
    id: 'trava', label: 'TRAVOU A ARMA!', tone: 'ruim',
    weight: 12, pull: -0.9,
  },
  {
    // The one that actually stings: it hurts you AND everything near you.
    id: 'panela', label: 'EXPLODIU NA MÃO!', tone: 'ruim',
    weight: 11, pull: -0.9,
  },
  {
    id: 'peia', label: 'PERNA BAMBA...', tone: 'ruim',
    weight: 10, pull: -0.7,
  },
  {
    id: 'mira', label: 'VISTA EMBAÇADA...', tone: 'ruim',
    weight: 9, pull: -0.8,
  },
  {
    id: 'chamou', label: 'CHAMOU ATENÇÃO!', tone: 'ruim',
    weight: 8, pull: -0.8,
  },
]

/**
 * The numbers each outcome actually applies.
 *
 * Kept apart from the table above so the odds and the effects can be read
 * without each other. Durations are short across the board — see rule 2.
 */
export const GAMBLE_FX = {
  /** Buff multipliers and how long they run. */
  furia: { fireRate: 1.7, seconds: 9 },
  forca: { damage: 1.6, seconds: 9 },
  ligeiro: { speed: 1.45, seconds: 9 },
  cura: { heal: 55 },
  sumico: { seconds: 5 },
  carga: { charges: 1 },
  colheita: { drops: 6, value: 14 },

  /** Curses. */
  trava: { fireRate: 0.32, seconds: 5 },
  peia: { speed: 0.62, seconds: 6 },
  /** Not blind, just short-sighted: the gun stops reaching across the street. */
  mira: { range: 0.55, damage: 0.8, seconds: 7 },
  /**
   * The blast in your hand. It catches the crowd too, so it is a bad roll
   * rather than a pure punishment — and the self-damage is a FRACTION of
   * current health, never a flat number, so it can bring you low but can
   * never be the thing that kills you.
   */
  panela: { radius: 150, damage: 120, selfFraction: 0.28 },
  /** Whistles up bodies from off screen. */
  chamou: { count: 7 },
} as const

/**
 * The weight of one outcome at a given luck.
 *
 * Luck pushes prizes up and punishments down, and `pull` decides how hard.
 * Clamped at a floor rather than zero so that no roll is ever fully off the
 * table: an unlucky run should still occasionally get the bolt, and a lucky
 * one should still occasionally blow its own hand off. A gamble with a
 * guaranteed half is not one.
 */
export function weightFor(o: GambleOutcome, luck: number): number {
  /*
   * The 0.95 is doing real work. At 2.2 the table went from a third bad at
   * luck zero to three percent bad at luck eight, which is not a lucky
   * gambler — it is a gambler who has stopped gambling. Luck should tilt the
   * table, never flip it: roughly a third bad becomes roughly an eighth, and
   * the dice still bite the luckiest run in the game now and then.
   */
  return Math.max(1.2, o.weight + o.pull * luck * 0.95)
}

/** Rolls one outcome. `luck` is the player's sorte plus the card's own bias. */
export function rollGamble(luck: number): GambleOutcome {
  let total = 0
  for (const o of GAMBLE) total += weightFor(o, luck)
  let r = Math.random() * total
  for (const o of GAMBLE) {
    r -= weightFor(o, luck)
    if (r <= 0) return o
  }
  return GAMBLE[0]
}
