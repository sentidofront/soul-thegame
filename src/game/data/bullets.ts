import { ICONS } from './sprites'
import type { EffectKey } from './effects'

/**
 * AMMO TYPES.
 *
 * Bullets are not abilities. An ability runs on its own clock and fires itself;
 * ammo is what the revolver is loaded with, and only one type is loaded at a
 * time. You collect types as upgrades and press E to cycle between them, so the
 * choice is moment-to-moment rather than a build decision made once at level up.
 *
 * Every field except `poison` is a multiplier on the base revolver in
 * `weapons.ts`, so a damage card improves whatever is loaded rather than
 * favouring one type.
 *
 * Five of the six drawn types carry mechanics. `bullet_around` is registered
 * with its art and no card, waiting on a decision about what it does.
 */
export type AmmoId =
  | 'revolver' | 'veneno' | 'spray' | 'piercing' | 'explosive' | 'ricochet'
  | 'aimbot' | 'sniper'

export interface AmmoDef {
  id: AmmoId
  name: string
  desc: string
  icon: string
  /** All multipliers on the base revolver, except where noted. */
  damage: number
  fireRate: number
  /** Projectiles per shot (absolute, not a multiplier). */
  projectiles: number
  /** Radians of cone, absolute. */
  spread: number
  /** Extra bodies passed through, added to the player's pierce. */
  pierce: number
  range: number
  speed: number
  knockback: number
  radius: number
  /**
   * Tracer colours. Still used by the HUD and by anything drawing a line, but
   * the round in flight is a sprite now — see `fx`.
   */
  tracer: string
  core: string
  /**
   * Which of the seven bullet colours flies when this is loaded.
   *
   * The point of six ammo types is that you can tell which one is in the gun
   * without looking at the HUD, and colour does that better than the damage
   * numbers do. Kept next to the balance figures because that is where the
   * decision belongs, not in the renderer.
   */
  fx: EffectKey
  /**
   * Applied on hit. Stacks build up on one target and tick as damage over
   * time; see `tryPoison` for how they are kept alive.
   */
  poison?: {
    /** Stacks added per hit. */
    perHit: number
    maxStacks: number
    /** Damage per second, per stack, before the player's damage multiplier. */
    dpsPerStack: number
    /** Seconds before the whole stack falls off. Refreshed by ANY hit. */
    duration: number
  }
  /** Bursts on impact. `damage` is another multiplier on the base revolver. */
  explode?: { radius: number; damage: number }
  /** Redirects to a fresh target on impact instead of stopping. */
  bounces?: number
  /** How far it looks for the next body to jump to. */
  bounceRange?: number
  /**
   * RADIANS PER SECOND THE ROUND MAY TURN, once it is in the air.
   *
   * Zero for everything the gun fired until now. The turn is CAPPED per frame
   * rather than being a lock, which is the whole difference between a round
   * that corrects and one that cannot be dodged: a target moving across it
   * faster than this can still be missed, and cutting inside the arc still
   * works.
   */
  homing?: number
}

export const AMMO: Record<AmmoId, AmmoDef> = {
  /** The one he starts with. Everything else is measured against it. */
  revolver: {
    id: 'revolver', name: 'Bala Normal', desc: 'O de sempre. Confiável.',
    icon: ICONS.up_arma,
    damage: 1, fireRate: 1, projectiles: 1, spread: 0.045, pierce: 0,
    range: 330, speed: 430, knockback: 70, radius: 3,
    tracer: 'rgba(255,214,120,0.85)', core: '#fff6d8', fx: 'bullet_gold',
  },

  /**
   * BALAS VENENOSAS — cheap damage that keeps working.
   *
   * Each hit lands far less than a normal round but adds a stack of poison,
   * and the whole stack is refreshed by ANY bullet landing on that target.
   * So the play is to load venom, put a few stacks into something big, switch
   * back to the revolver, and keep the pressure on: the venom keeps ticking
   * for as long as you keep hitting it. Stop shooting it and the stack falls
   * off.
   */
  veneno: {
    id: 'veneno', name: 'Balas Venenosas',
    desc: 'Dano fraco, mas envenena. Cada tiro empilha; qualquer tiro renova',
    icon: ICONS.up_bullet_poison,
    damage: 0.45, fireRate: 1.1, projectiles: 1, spread: 0.05, pierce: 0,
    range: 330, speed: 400, knockback: 40, radius: 3,
    tracer: 'rgba(150,240,120,0.85)', core: '#e6ffd0', fx: 'bullet_green',
    poison: { perHit: 1, maxStacks: 8, dpsPerStack: 4.2, duration: 3.2 },
  },

  /**
   * SPRAY — a fistful of pellets in a wide cone.
   *
   * Enormous up close and worthless past the second row: short range and a
   * cone that opens fast. The answer to being surrounded, and the wrong thing
   * to have loaded when something is shooting at you from across the street.
   */
  spray: {
    id: 'spray', name: 'Chumbo Grosso',
    desc: 'Cinco bagos de uma vez. Devastador de perto, inútil de longe',
    icon: ICONS.up_bullet_spray,
    // Measured at nearly double the revolver's kill rate before this: five
    // pellets all connect in a crowd, and a crowd is the default situation.
    // Now it is worth about a third more when everything lands and less than
    // the revolver when it does not.
    damage: 0.34, fireRate: 0.75, projectiles: 5, spread: 0.44, pierce: 0,
    range: 150, speed: 360, knockback: 95, radius: 3,
    tracer: 'rgba(140,200,255,0.85)', core: '#dff0ff', fx: 'bullet_cyan',
  },

  /**
   * PERFURANTE — one long line through a queue.
   *
   * Weak per body and it does not care how many bodies there are: it goes
   * through five of them and keeps going. The trickle arrives from the east in
   * a rough column, which is exactly the shape this is for; it is worth much
   * less when things have already surrounded you.
   */
  piercing: {
    id: 'piercing', name: 'Bala Perfurante',
    desc: 'Atravessa uma fila inteira. Fraca por corpo, longa de alcance',
    icon: ICONS.up_bullet_piercing,
    // Buffed from 0.62/0.9: a line of five is rarer than it sounds, and the
    // round measured level with the plain revolver in Act I.
    damage: 0.80, fireRate: 1.0, projectiles: 1, spread: 0.02, pierce: 4,
    range: 420, speed: 520, knockback: 45, radius: 3,
    tracer: 'rgba(255,150,110,0.9)', core: '#ffe0d0', fx: 'bullet_orange',
  },

  /**
   * EXPLOSIVA — small blast where it lands.
   *
   * Slow to fire and mediocre against one body; the damage is in the burst, so
   * it wants a knot of things rather than a straggler. Its own blast cannot
   * hurt the player, which is a deliberate softening — a self-damaging round
   * on a weapon that fires itself would be a trap nobody asked for.
   */
  explosive: {
    id: 'explosive', name: 'Bala Explosiva',
    desc: 'Estoura onde acerta. Devagar, mas leva quem estiver junto',
    icon: ICONS.up_bullet_explosive,
    // The blast lands on everything in the radius, so its value scales with
    // how packed the street is — it measured at +148% in Act II before this.
    damage: 0.42, fireRate: 0.55, projectiles: 1, spread: 0.05, pierce: 0,
    range: 300, speed: 340, knockback: 80, radius: 4,
    tracer: 'rgba(255,190,90,0.9)', core: '#fff0c0', fx: 'bullet_red',
    explode: { radius: 38, damage: 0.36 },
  },

  /**
   * RICOCHETE — jumps from body to body.
   *
   * Never wasted: what it does not kill it bounces off, looking for the next
   * thing within range. Worth the most in a loose crowd and nearly nothing
   * against a lone target, which is the opposite of the piercing round.
   */
  ricochet: {
    id: 'ricochet', name: 'Bala Ricochete',
    desc: 'Pula de um pro outro. Ótima no meio do bando, fraca contra um só',
    icon: ICONS.up_bullet_ricochet,
    // Cutting both the damage and a bounce at once overshot: it went from
    // double the revolver to worse than it. Two bounces, damage back up.
    damage: 0.52, fireRate: 1.0, projectiles: 1, spread: 0.05, pierce: 0,
    range: 300, speed: 420, knockback: 45, radius: 3,
    tracer: 'rgba(255,120,140,0.9)', core: '#ffd8e0', fx: 'bullet_cream',
    bounces: 2, bounceRange: 170,
  },

  /**
   * BALA TELEGUIADA — it corrects.
   *
   * Weak, slow and it does not miss. Every other round in the gun rewards
   * pointing well; this one rewards not having to, which is worth having on a
   * screen where the thing you want dead is behind three things you do not
   * care about — and worth much less on a clear field, where it is simply the
   * worst round available.
   *
   * THE TURN IS CAPPED, not absolute. Two and a half radians a second bends
   * comfortably around a walking cow and loses a Doido do Carro completely, so
   * "it does not miss" is a claim about crowds rather than about physics.
   *
   * Deliberately the slowest thing the gun fires. A homing round at revolver
   * speed is a straight line with extra steps; at 250 you can watch it curve,
   * which is the only reason to take it.
   */
  aimbot: {
    id: 'aimbot', name: 'Bala Teleguiada',
    desc: 'Fraca e lenta, mas corrige sozinha e acha quem você errou',
    icon: ICONS.up_bullet_aimbot,
    damage: 0.62, fireRate: 1.15, projectiles: 1, spread: 0.22, pierce: 0,
    range: 360, speed: 250, knockback: 40, radius: 4,
    tracer: 'rgba(214,140,255,0.9)', core: '#f0dcff', fx: 'bullet_magenta',
    homing: 2.5,
  },

  /**
   * BALA DE PRECISÃO — one, and it goes through everything.
   *
   * The opposite end of the same argument. A third of the cadence and five
   * times the damage, so the DPS is close to a revolver's and the shape of it
   * is completely different: this build has one answer per second and it had
   * better be pointed at something.
   *
   * The two pierces are what stop it being a worse revolver on a full screen —
   * against a line of bodies it is the best round in the gun, and against one
   * body at close range it is a punishment for missing.
   *
   * `spread: 0` is the only zero in the table. It is the precision round; the
   * gun's own wobble has no business being in it.
   */
  sniper: {
    id: 'sniper', name: 'Bala de Precisão',
    desc: 'Um tiro por vez. Atravessa tudo e dói muito.',
    icon: ICONS.up_bullet_sniper,
    damage: 5.2, fireRate: 0.32, projectiles: 1, spread: 0, pierce: 2,
    range: 560, speed: 760, knockback: 190, radius: 4,
    tracer: 'rgba(220,232,244,0.95)', core: '#ffffff', fx: 'bullet_cream',
  },
}

/** Order used when cycling with E. Revolver is always first. */
export const AMMO_ORDER: AmmoId[] =
  ['revolver', 'veneno', 'spray', 'piercing', 'explosive', 'ricochet',
    'aimbot', 'sniper']
