import type { Game } from '../Game'
import { CONFIG } from '../config'

/**
 * COBSON, WHO TURNS UP WHEN THE FARMING IS GOING WELL.
 *
 * The only friendly thing in the game that is not a card. He is not summoned,
 * not owned, and not on a cooldown the player can see: he arrives because the
 * run is going well, walks through whatever is in the way, hands over a pile
 * of corn, says something stupid, and leaves.
 *
 * WHY HE IS TIED TO THE GOOD CORN AND NOT TO A CLOCK. A timer would make him
 * scenery — a thing that happens every ninety seconds whatever you do. Hung
 * off the mini-boss and boss corn he becomes a REACTION: he shows up because
 * you went and killed the big ones, which is exactly the behaviour worth
 * rewarding and the one the game otherwise only pays in experience.
 *
 * HE IS NOT AN ENEMY AND NOT A HELPER. Both of those are pooled objects that
 * the world can hit, and the whole point of him is that he is never in danger
 * and never in the way: nothing targets him, nothing collides with him, and he
 * cannot be killed. He is a scripted visitor with four fields and a walk.
 */
export interface CobsonState {
  x: number
  y: number
  /** Which way he is walking. He only ever goes one way, straight through. */
  dir: number
  /** Seconds since he arrived. */
  t: number
  phase: 'walk' | 'gift' | 'leave'
  /** Set once the corn has been thrown, so it cannot happen twice. */
  gifted: boolean
  /** The line he is saying, and how long is left of it. */
  line: string
  lineT: number
}

/**
 * HOW MANY BIG CORNS BRING HIM OUT.
 *
 * Four is about one visit per mini-boss cluster on a run that is going well,
 * and never on a run that is being survived rather than played. He is a
 * reward for pressing forward, so the number has to be reachable by pressing
 * forward and not by waiting.
 */
export const COBSON_CORN = 4

/** How far off screen he starts, and how far past the player he walks. */
const ENTER = 320
const SPEED = 74

/** What he does to whatever he walks through. */
const CONTACT_DAMAGE = 44
const CONTACT_RADIUS = 34

/**
 * WHAT HE SAYS. One is picked per visit.
 *
 * All of them are the same joke, which is the point: he is a man who has
 * exactly one bit and commits to it entirely.
 */
const LINES = [
  'UM MILHÃO PRA VOCÊ, INDÍGENA!',
  'MILHO NÃO, MILHÃO!',
  'TOMA UM MILHÃO, PARCEIRO!',
  'CRÉBITO, OU MILHO?',
  'ESPIGA DE OURO PRO MEU AMIGO!',
  'Ó CARRO DO MILHO',
  'INVESTE EM MILHO, RAPAZ.',
]

export function makeCobson(): CobsonState | null {
  return null
}

/**
 * He comes in from the side the player is NOT walking toward.
 *
 * The run only ever moves east, so entering from the east would put him head
 * on and make the player stop; from behind he overtakes, which reads as him
 * catching up to do you a favour rather than as something arriving.
 */
export function callCobson(g: Game) {
  if (g.cobson) return
  const p = g.player
  g.cobson = {
    x: p.x - ENTER,
    y: p.y + (Math.random() - 0.5) * 40,
    dir: 1,
    t: 0,
    phase: 'walk',
    gifted: false,
    line: LINES[(Math.random() * LINES.length) | 0],
    lineT: 3.2,
  }
  g.audio.play('gambleGood', { volume: 0.7 })
}

export function updateCobson(g: Game, dt: number) {
  const c = g.cobson
  if (!c) return
  const p = g.player

  c.t += dt
  if (c.lineT > 0) c.lineT -= dt

  /*
   * HE WALKS THROUGH THINGS.
   *
   * Not an attack and not aimed: a flat radius around him that hurts whatever
   * is standing in it, applied on his own clock rather than per body, so a
   * crowd is opened up as he passes rather than all at once when he arrives.
   *
   * `hostile` is false, so the kills are the PLAYER'S — the corn drops, the
   * experience lands, and the run summary counts them. He is doing you a
   * favour; a favour that stole your kills would not be one.
   *
   * READ BEFORE THE DAMAGE. `damageEnemy` swap-removes on a kill, so walking
   * the list backwards is the only order that survives it.
   */
  const items = g.enemies.items
  const r2 = CONTACT_RADIUS * CONTACT_RADIUS
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i]
    if (e.allyT > 0) continue
    const dx = e.x - c.x
    const dy = e.y - c.y
    if (dx * dx + dy * dy > r2) continue
    const d = Math.hypot(dx, dy) || 1
    g.damageEnemy(i, CONTACT_DAMAGE * dt, (dx / d) * 90, (dy / d) * 90, true)
  }

  if (c.phase === 'walk') {
    c.x += SPEED * c.dir * dt
    // A little drift toward his line so he does not walk past off-screen.
    c.y += Math.sin(c.t * 2.2) * 12 * dt
    // Level with the player, or three seconds — whichever comes first, so he
    // arrives even if the player is running the other way.
    if (c.x > p.x - 26 || c.t > 4.5) {
      c.phase = 'gift'
      c.t = 0
    }
    return
  }

  if (c.phase === 'gift') {
    if (!c.gifted) {
      c.gifted = true
      throwCorn(g, c)
    }
    // A beat of standing there, so the corn and the man are one event.
    if (c.t > 1.1) { c.phase = 'leave'; c.t = 0 }
    return
  }

  // Off he goes, and out of existence when he is well past the edge.
  c.x += SPEED * 1.35 * c.dir * dt
  if (c.t > 3.4) g.cobson = null
}

/**
 * THE GIFT: ordinary corn, and the blue kind.
 *
 * Thrown outward rather than handed over, because a pile that appears at his
 * feet is a number arriving and a pile that scatters is a moment the player
 * spends ten seconds enjoying. They land inside the magnet's reach, so nobody
 * has to go and get them.
 *
 * The blue ones are the mini-boss corn, which is the whole joke: he is paying
 * out in the currency you only otherwise get by killing something enormous.
 */
function throwCorn(g: Game, c: CobsonState) {
  const pace = g.xpPace()
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4
    const r = 26 + Math.random() * 62
    g.spawnPickup('xp', c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.6, 9 * pace)
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.random()
    const r = 34 + Math.random() * 40
    g.spawnPickup(
      'corn_mini', c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.6,
      CONFIG.CORN.mini * pace,
    )
  }
  g.audio.play('gambleGood', { volume: 0.85 })
  g.audio.play('pickup', { volume: 0.7, rate: 0.8 })
  g.camera.addShake(0.2)
  g.say('Esse cara é gente boa demais.')
}
