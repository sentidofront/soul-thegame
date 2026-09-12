import type { Game } from '../Game'
import { CONFIG } from '../config'

/**
 * A NAVÉ MÃE PASSA POR CIMA.
 *
 * The mothership is the last boss of the game. This is the same ship, seen
 * from underneath and a very long way up, doing what it presumably does all
 * day while O Indígena is walking: sweeping the road with a light and taking
 * whatever is standing in it.
 *
 * IT IS A HAZARD, NOT AN ENEMY, and that is the whole design. It lives here
 * rather than in the enemy pool on purpose:
 *
 *   - It cannot be shot, targeted, knocked back, poisoned, tornado'd or
 *     counted toward the population cap. A boss you meet in act three is not
 *     something you get to chip down in act one.
 *   - It is not in the pool, so the director cannot recycle it, `sweepField`
 *     cannot delete it mid-pass, and nothing holds a reference into a dense
 *     array it does not own.
 *
 * What the player has to do about it is MOVE. The beam is a circle on the
 * ground travelling in a straight line at three times walking pace, so it can
 * always be stepped out of sideways and can never be outrun forwards — which
 * is the only interesting shape a fast-moving hazard can have.
 *
 * If it does catch him, it is the same A-D-A-D struggle the bosses use. Being
 * lifted off the ground by a flying saucer is the one moment in the game where
 * dodging is over and the answer is your hands.
 */

export type AbductPhase =
  /** Nothing overhead. `cd` is running down. */
  | 'off'
  /** Crossing, beam live, looking for him. */
  | 'fly'
  /** It has him. The struggle is running. */
  | 'hold'
  /** Leaving, whether or not it got anything. */
  | 'leave'

export interface AbductionState {
  phase: AbductPhase
  /** Seconds until it may come again. */
  cd: number
  /** Seconds in the current phase. */
  t: number
  /** Where the beam lands. The ship is drawn straight above this. */
  x: number
  y: number
  /** Unit heading, fixed for the whole pass. */
  dx: number
  dy: number
  /** 0..1, so the beam fades up and down instead of snapping. */
  glow: number
  /** How far off the ground he has been lifted, while held. */
  lift: number
  /** Its one parting shot, so it can only ever be dropped once. */
  bombed: boolean
  /**
   * SECONDS OF FLICKER LEFT after a struggle press landed.
   *
   * Read by the renderer to punch the beam brighter for a frame or two. It
   * lives on the hazard rather than on the player because it is the BEAM that
   * reacts — the point of it is that the thing holding him is visibly losing
   * its grip, which is the only feedback saying the mashing is working.
   */
  jolt: number
}

export function makeAbduction(): AbductionState {
  return {
    phase: 'off',
    // Never on the first minute of a run: the opening is meant to be a cow.
    cd: CONFIG.ABDUCT.firstDelay,
    t: 0, x: 0, y: 0, dx: 1, dy: 0,
    glow: 0, lift: 0, bombed: false, jolt: 0,
  }
}

// ------------------------------------------------------------------- CLOCK --

/**
 * WHEN IT IS ALLOWED TO HAPPEN AT ALL.
 *
 * Everything refused here is refused because the ship would be arriving into
 * a scene that already has an author: a boss arena is a closed room, act three
 * is a script, and the intro is a title card. A hazard that wanders into any
 * of those is not a surprise, it is a bug with a sprite.
 */
function allowed(g: Game): boolean {
  if (g.player.reach < CONFIG.ABDUCT.fromX) return false
  if (g.arenaLocked) return false
  if (g.act3.phase !== 'outside') return false
  if (g.waveHold || g.waveOverride) return false
  if (g.introT > 0) return false
  // Something else already has hold of him; two grabs at once is nonsense.
  if (g.player.grabT > 0) return false
  return true
}

/** How long between passes, out here. It gets much worse in Floriano. */
function interval(g: Game): number {
  const A = CONFIG.ABDUCT
  const [lo, hi] = g.player.reach >= A.oftenFromX ? A.gapLate : A.gapEarly
  return lo + Math.random() * (hi - lo)
}

// -------------------------------------------------------------------- PASS --

export function updateAbduction(g: Game, dt: number) {
  const a = g.abduct
  const A = CONFIG.ABDUCT
  a.t += dt

  /*
   * THE SCENE CHANGED UNDER IT.
   *
   * A barrier can close on the frame after a pass starts — `bossGate` runs
   * later in the same step than this does — and a mothership sweeping the
   * inside of a boss arena is not a thing that should ever be seen. It leaves,
   * and if it was holding him it lets go first.
   */
  if (a.phase !== 'off' && a.phase !== 'leave'
    && (g.arenaLocked || g.act3.phase !== 'outside')) {
    if (g.player.abducted) {
      g.player.abducted = false
      g.player.grabT = 0
      g.player.grabStruggle = 0
      a.lift = 0
    }
    leave(g, false)
    return
  }

  switch (a.phase) {
    case 'off': {
      a.glow = Math.max(0, a.glow - dt * 2)
      a.cd -= dt
      if (a.cd > 0) return
      // Not ready yet — check again shortly rather than the moment it clears,
      // so it never arrives on the exact frame a boss arena opens.
      if (!allowed(g)) { a.cd = 4; return }
      begin(g)
      return
    }

    case 'fly': {
      a.glow = Math.min(1, a.glow + dt * 2.2)
      a.x += a.dx * A.speed * dt
      a.y += a.dy * A.speed * dt

      /*
       * CAUGHT.
       *
       * `invuln` counts, which means a dash through the beam is a real answer
       * — the one movement ability in the game that says "you cannot be
       * touched" has to mean it here too, or the card is a lie.
       */
      const p = g.player
      if (p.invuln <= 0 && p.grabT <= 0) {
        const d = Math.hypot(p.x - a.x, p.y - 12 - a.y)
        if (d < A.beam) { seize(g); return }
      }

      // Past him and still going. It only gets one pass.
      if (travelled(g) > A.range) { leave(g, false) }
      return
    }

    case 'hold': {
      // The struggle itself runs in `abductionHold`, called from the player's
      // update — this only holds the ship still above him.
      a.glow = Math.min(1, a.glow + dt * 3)
      return
    }

    case 'leave': {
      a.glow = Math.max(0, a.glow - dt * 1.4)
      // Away much faster than it came in. It is done here.
      a.x += a.dx * A.speed * A.exitBoost * dt
      a.y += a.dy * A.speed * A.exitBoost * dt
      if (a.t > A.exitSeconds) {
        a.phase = 'off'
        a.t = 0
        a.cd = interval(g)
      }
      return
    }
  }
}

/** How far the ship is from where it entered, along its own heading. */
function travelled(g: Game): number {
  const a = g.abduct
  const p = g.player
  // Measured against the player rather than the entry point, so a player who
  // walks with it does not get a longer pass than one who walks away.
  return (a.x - p.x) * a.dx + (a.y - (p.y - 12)) * a.dy
}

/**
 * IT COMES IN FROM OFF SCREEN, AIMED NEAR HIM.
 *
 * Aimed NEAR rather than AT: a line that always ends on the player is a hit
 * you watch happen, and this has to be a thing that might miss. The offset is
 * up to a beam and a half sideways, so about a third of passes go by without
 * ever threatening — which is what makes the ones that do land read as bad
 * luck rather than as a scripted tax.
 */
function begin(g: Game) {
  const a = g.abduct
  const A = CONFIG.ABDUCT
  const p = g.player

  const ang = Math.random() * Math.PI * 2
  const start = Math.hypot(g.camera.viewW, g.camera.viewH) / 2 + A.entry
  const sx = p.x + Math.cos(ang) * start
  const sy = p.y - 12 + Math.sin(ang) * start

  // Perpendicular scatter on the aim point.
  const miss = (Math.random() - 0.5) * 2 * A.beam * 1.5
  const tx = p.x + Math.cos(ang + Math.PI / 2) * miss
  const ty = p.y - 12 + Math.sin(ang + Math.PI / 2) * miss

  const d = Math.hypot(tx - sx, ty - sy) || 1
  a.dx = (tx - sx) / d
  a.dy = (ty - sy) / d
  a.x = sx
  a.y = sy
  a.phase = 'fly'
  a.t = 0
  a.glow = 0
  a.lift = 0
  a.bombed = false

  g.react('shipOverhead')
  g.audio.play('rocketWake', { volume: 0.7, rate: 0.6 })
  g.camera.addShake(0.25)
}

/** It has him. */
function seize(g: Game) {
  const a = g.abduct
  const p = g.player
  a.phase = 'hold'
  a.t = 0
  a.lift = 0

  /*
   * The bosses' own struggle, reused whole — same fields, same alternating
   * key, same HUD prompt. A second quick-time event with its own rules would
   * be a second thing to learn at the worst possible moment.
   */
  p.abducted = true
  g.runStats.grabbed += 1
  p.grabT = CONFIG.ABDUCT.holdSeconds
  p.grabStruggle = 0
  p.grabNext = 'a'
  p.grabbedBy = null

  g.spawnFx('grab', p.x, p.y - 14, 1.2)
  g.audio.play('shield', { volume: 0.9, rate: 0.7 })
  g.camera.addShake(0.6)
  g.react('abducted')
}

/** Ends the pass. `dropBomb` is the parting shot, and only escape earns it. */
function leave(g: Game, dropBomb: boolean) {
  const a = g.abduct
  a.phase = 'leave'
  a.t = 0

  if (dropBomb && !a.bombed) {
    a.bombed = true
    /*
     * ONE BOMB. Not a barrage, not a pattern — one, right where he is
     * standing, as it pulls away.
     *
     * It is thrown at his feet rather than dropped where the beam was, so the
     * moment after breaking free is still a moment: he is out of the light and
     * has about a second to also be somewhere else.
     */
    const A = CONFIG.ABDUCT
    g.spawnBomb(g.player.x, g.player.y, A.bombDamage, A.bombRadius, { x: a.x, y: a.y - A.alt })
    g.audio.play('shootEnemy', { volume: 0.8, rate: 0.5 })
  }
}

// --------------------------------------------------------------- THE HOLD --

/**
 * BEING LIFTED.
 *
 * Called from `updateGrab` while `p.abducted` is set, which is how it gets to
 * own the player's whole update the way a boss grab does: no walking, no
 * shooting, no dash, nothing but A and D.
 *
 * The lift is the timer made visible. He rises the entire time he is held, so
 * how far off the ground he is says how much longer he has — which is a clock
 * the player reads without looking at a clock.
 */
export function abductionHold(g: Game, dt: number) {
  const a = g.abduct
  const p = g.player
  const A = CONFIG.ABDUCT

  /*
   * Reeled in under the middle of the beam, and up — but not neatly.
   *
   * A body hanging perfectly still in a tractor beam looks like it has given
   * up, which is the opposite of a minigame about not giving up. The wobble is
   * small and fast and driven off the struggle, so a player who is mashing
   * visibly fights harder than one who is not.
   */
  const fight = 1 + p.grabStruggle * 2
  p.x += (a.x - p.x) * Math.min(1, dt * 7) + Math.sin(g.time * 21) * 0.5 * fight
  p.y += (a.y + 12 - p.y) * Math.min(1, dt * 7) + Math.cos(g.time * 17) * 0.35 * fight
  p.vx = 0
  p.vy = 0

  const gone = 1 - Math.max(0, p.grabT) / A.holdSeconds
  a.lift = gone * A.maxLift

  p.grabT -= dt
  // Slips back, so stopping is losing ground rather than merely not gaining.
  p.grabStruggle = Math.max(0, p.grabStruggle - dt * 0.3)

  if (g.input.consumePressed(p.grabNext)) {
    p.grabStruggle += A.perPress
    p.grabNext = p.grabNext === 'a' ? 'd' : 'a'
    /*
     * EVERY PRESS HAS TO LAND, and it barely did.
     *
     * The one interaction in the game that is pure mashing was answering with
     * a quiet blip and a tenth of a shake, so the player had no way to tell a
     * press that counted from one that did not — which turns the whole thing
     * into hammering keys and hoping. A grunt, a real kick, a burst of light
     * off him, and the beam itself flickers on the frame: four channels
     * saying THAT ONE WORKED.
     */
    g.audio.play('punch', { volume: 0.55, rate: 1.25, throttle: 0.03, maxVoices: 3 })
    g.camera.addShake(0.22)
    g.spawnFx('spark', p.x, p.y - 14, 0.5)
    // Read by the renderer to punch the beam brighter for a moment.
    a.jolt = 0.16
  }
  if (a.jolt > 0) a.jolt = Math.max(0, a.jolt - dt)

  // The light is doing something to him the whole time it holds him.
  g.damagePlayerOverTime(A.dps * dt)

  if (p.grabStruggle >= 1) { release(g, true); return }
  if (p.grabT <= 0) release(g, false)
}

function release(g: Game, escaped: boolean) {
  const a = g.abduct
  const p = g.player
  const A = CONFIG.ABDUCT

  if (escaped) g.runStats.escaped += 1
  p.abducted = false
  p.grabT = 0
  p.grabStruggle = 0
  a.lift = 0

  // Dropped where he was hanging, a little to one side of the beam so he is
  // not standing in it again on the first frame he can move.
  const ang = Math.random() * Math.PI * 2
  p.x = a.x + Math.cos(ang) * (A.beam + 30)
  p.y = a.y + 12 + Math.sin(ang) * (A.beam + 30) * 0.7

  if (escaped) {
    p.invuln = Math.max(p.invuln, 1.1)
    g.spawnFloater(p.x, p.y - 46, 'SOLTOU!', '#9be8b0')
    g.audio.play('block', { volume: 0.9 })
    g.camera.addShake(0.5)
    g.react('escaped')
    // The one bomb. Breaking free is what buys it.
    leave(g, true)
  } else {
    /*
     * FAILING COSTS HEALTH AND NOTHING ELSE.
     *
     * There is no version of this where the ship keeps him — the game is one
     * long walk east and it does not have a place to put a player who was
     * taken. So the punishment is the drain he already took plus a real hit,
     * and the ship leaves empty-handed and unpunished, which is its own sting.
     */
    g.damagePlayer(A.failDamage)
    p.invuln = Math.max(p.invuln, 1.2)
    g.camera.addShake(0.8)
    leave(g, false)
  }
}
