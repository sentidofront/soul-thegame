import type { Game } from '../Game'
import type { Bullet, Enemy, Player } from '../types'
import { CONFIG } from '../config'
import { COBSON_CORN, callCobson } from './cobson'
import { abductionHold } from './abduction'
import { REVOLVER, resolveWeapon } from '../data/weapons'
import { ABILITIES, at } from '../data/abilities'
import { AMMO } from '../data/bullets'


const near: number[] = []

// ------------------------------------------------------------------ PLAYER --

export function updatePlayer(g: Game, dt: number) {
  const p = g.player
  const base = resolveWeapon(p.mods)
  const ammo = AMMO[p.ammo[p.ammoIndex] ?? 'revolver']

  // The loaded ammo scales the revolver rather than replacing it, so a damage
  // card improves whatever is in the gun instead of favouring one type.
  // Temporary effects — gamble buffs and curses — multiply on top of the
  // permanent cards, so a Mão Quente is felt through whatever is in the gun.
  const fxDamage = g.effectMul('damage')
  const fxRate = g.effectMul('fireRate')
  const fxRange = g.effectMul('range')

  const w = {
    damage: base.damage * ammo.damage * fxDamage,
    fireRate: base.fireRate * ammo.fireRate * fxRate,
    bulletSpeed: ammo.speed,
    // Olho de Gavião reaches through the ammo as well as the revolver.
    range: ammo.range * p.mods.range * fxRange,
    pierce: base.pierce + ammo.pierce,
    /*
     * ...plus however much of the Cálice is still in him.
     *
     * Scaled by how much of the three seconds is left, so it wears off rather
     * than snapping straight — the last half second is a wobble, not a miss,
     * which is what makes the trade readable instead of feeling like the gun
     * broke.
     */
    spread: ammo.spread + base.spread * 0.4 + p.mods.projectiles * 0.05
      + (p.drunkT > 0 ? ABILITIES.calice.sway * Math.min(1, p.drunkT / 2) : 0),
    projectiles: ammo.projectiles + p.mods.projectiles,
    knockback: ammo.knockback,
    bulletRadius: ammo.radius,
  }

  if (g.input.consumePressed('e')) g.cycleAmmo()

  g.input.sample()

  /*
   * BEING HELD OVERRIDES EVERYTHING.
   *
   * No walking, no dash, no teleport — the only input that means anything is
   * the mash, and it is handled in `updateGrab`. Returning here rather than
   * guarding each system individually is deliberate: a grab that some
   * abilities could still escape would not be a grab.
   */
  if (p.grabT > 0) {
    updateGrab(g, dt)
    return
  }

  /*
   * THE DASH owns movement while it lasts.
   *
   * It ignores the stick entirely — the direction was chosen when the key went
   * down, and letting input steer mid-lunge turns a committed dodge into
   * flight. `invuln` is topped up every frame of it rather than set once, so
   * the i-frames cannot expire early because something clipped him on the way.
   */
  if (p.dashT > 0) {
    const D = ABILITIES.dash
    const ds = at(D.speed, p.abilities.dash.stacks)
    p.vx = p.dashX * ds
    p.vy = p.dashY * ds
    p.invuln = Math.max(p.invuln, p.dashT)
    p.x += p.vx * dt
    p.y += p.vy * dt
  } else {
    const speed = CONFIG.PLAYER.speed * p.mods.speed * g.effectMul('speed')
    /*
     * AND SOMETIMES BACKWARDS.
     *
     * Applied here, at the one place the movement vector is consumed, so the
     * keyboard and the touch stick invert together and nothing upstream has to
     * know about it. The AIM is deliberately untouched: inverting where he
     * shoots as well would make the state unplayable rather than awkward, and
     * the joke is that he cannot WALK straight, not that he cannot think.
     */
    if (p.invertT > 0) {
      p.invertT -= dt
      p.vx = -g.input.moveX * speed
      p.vy = -g.input.moveY * speed
    } else {
      p.vx = g.input.moveX * speed
      p.vy = g.input.moveY * speed
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
  }

  const arena = g.activeArena
  if (arena) {
    p.x = Math.max(arena.centerX - arena.halfW + 16, Math.min(arena.centerX + arena.halfW - 16, p.x))
    p.y = Math.max(arena.centerY - arena.halfH + 16, Math.min(arena.centerY + arena.halfH - 16, p.y))
  }
  /*
   * Walls. Resolved after movement rather than before it, so a dash that ends
   * inside a house pushes back out instead of being cancelled — being stopped
   * mid-lunge by geometry you could not see is worse than being nudged.
   */
  {
    const fixed = g.chunks.props.resolve(p.x, p.y, CONFIG.PLAYER.radius)
    p.x = fixed.x
    p.y = fixed.y
  }

  /*
   * PROGRESS IS ARC LENGTH ALONG THE ROUTE.
   *
   * It used to be world X, which was the same thing only while the world ran
   * in a straight line east. The route wanders, so how far the player has come
   * is how far along the way they have got — that one redefinition is what let
   * every act, wave and arena keep the numbers it already had.
   */
  // The hint is what stops a wander from being read as progress. See `nearest`.
  const here = g.chunks.route.nearest(p.x, p.y, p.reach)
  p.reach = Math.max(p.reach, here.d)

  /*
   * AND HE MAY WALK BACK AS FAR AS HE LIKES.
   *
   * There was a tow here: past seven hundred units behind his own high-water
   * mark, the route pulled him forward, and it pulled harder the further back
   * he went. It has been softened twice and it was still wrong both times,
   * because the problem was never the strength — it was the existence.
   *
   * The rule it enforced — the story only moves forward — is a rule about the
   * STORY, and the story is already safe: `reach` is a high-water mark, so
   * every wave, every act gate and every difficulty scalar is keyed to the
   * furthest he has ever been and none of them can be walked backwards out of.
   * Nothing about the run is undone by him going back for the corn he left
   * behind, and going back for it is a thing this game now gives him reasons
   * to want to do.
   *
   * What the tow actually did was fight the stick. A player deliberately
   * walking west felt a wall they could not see, could not name, and could not
   * push through — which is the worst kind of resistance a game can have,
   * because there is nothing to learn from it.
   *
   * The arrow says which way Floriano is. That is the whole of the
   * encouragement he needs, and it is the right amount.
   */

  p.anim += dt
  if (p.invuln > 0) p.invuln -= dt

  /*
   * OUT-OF-COMBAT REGEN.
   *
   * `sinceHit` is reset by `damagePlayer`, so this only ever runs once he has
   * been left alone. It deliberately does nothing at full health, so the flag
   * the HUD reads means "actually healing" rather than "eligible to heal".
   */
  p.sinceHit += dt
  // Set by `damagePlayerOverTime`, and the only thing that tells the renderer
  // a drain is happening RIGHT NOW rather than a moment ago.
  if (p.dotT > 0) p.dotT = Math.max(0, p.dotT - dt)
  if (p.dotFloatT > 0) p.dotFloatT = Math.max(0, p.dotFloatT - dt)
  p.regenerating = false
  if (p.mods.regen > 0 && p.sinceHit >= p.mods.regenDelay && p.hp < p.maxHp) {
    p.regenerating = true
    g.heal(p.mods.regen * dt, true)
  }
  if (p.shootAnim > 0) p.shootAnim -= dt

  // ---- where the revolver is looking ----
  updateAimDirection(g, p)

  let aimX = 0
  let aimY = 0
  let hasTarget = false
  g.aimTargetActive = false

  /*
   * MANUAL AIM.
   *
   * The revolver fires along the cursor, full stop — no target is chosen for
   * the player and there is nothing pulling the shot toward a body. Missing is
   * possible, and that is the point: the assist version could not miss, which
   * also meant it could not be aimed. The gun still fires on its own, so all
   * of the skill sits in where it is pointed.
   *
   * `hasPointer` is the gate. On touch, or before the mouse has ever moved,
   * there is no cursor to aim with — aiming at a stale screen origin would peg
   * every shot at the top-left corner of the world — so those fall through to
   * nearest-target instead.
   */
  if (CONFIG.AIM_MODE === 'mouse' && g.input.hasPointer) {
    const m = g.camera.screenToWorld(g.input.aimScreenX, g.input.aimScreenY)
    aimX = m.x - p.x
    aimY = m.y - p.y - 14
    /*
     * HOLD FIRE WHEN THERE IS NOTHING TO SHOOT.
     *
     * The assist got this for free: it only fired once it had picked a target,
     * and an empty field gave it none. Manual aim has no target to fail to
     * find, so without this the revolver empties itself into the caatinga for
     * the whole opening walk — bullets sailing across a screen with nothing on
     * it, which reads as broken before the first cow has even arrived.
     *
     * The gate is the gun's own range rather than the viewport: what is barely
     * off screen is also out of range, and range is the number the player is
     * already buying with Olho de Gavião. The reticle keeps drawing either
     * way, so aiming still feels live while he is holding fire.
     */
    hasTarget = anythingInRange(g, p.x, p.y, w.range)
    g.aimTargetX = m.x
    g.aimTargetY = m.y
    g.aimTargetActive = true
  } else {
    // Steering is a mouse feature. On touch, or before the pointer has moved,
    // fall back to plain nearest-target — a player with no cursor should not be
    // silently locked into only shooting the way they happen to be walking.
    const steer = CONFIG.AIM_MODE === 'steered' && g.input.hasPointer
    const t = pickTarget(g, p.x, p.y, w.range, steer ? p.aimX : 0, steer ? p.aimY : 0)
    if (t >= 0) {
      const e = g.enemies.items[t]
      aimX = e.x - p.x
      aimY = e.y - 12 - (p.y - 14)
      hasTarget = true
      g.aimTargetX = e.x
      g.aimTargetY = e.y - (e.def.size ?? 22) / 2
      g.aimTargetActive = true
    }
  }

  // The sprite faces where the gun points, falling back to where he walks.
  // The art is drawn facing right, so facing -1 draws the mirrored copy.
  if (Math.abs(p.aimX) > 0.2) p.facing = p.aimX < 0 ? -1 : 1
  else if (Math.abs(p.vx) > 1) p.facing = p.vx < 0 ? -1 : 1

  p.fireCd -= dt
  if (hasTarget && p.fireCd <= 0) {
    p.fireCd = 1 / (w.fireRate)
    const aim = Math.atan2(aimY, aimX)
    for (let i = 0; i < w.projectiles; i++) {
      // An even fan rather than pure scatter, so a spread reads as a spread.
      const step = w.projectiles > 1 ? (i / (w.projectiles - 1) - 0.5) * 2 : 0
      const a = aim + step * w.spread + (Math.random() - 0.5) * w.spread * 0.35
      const shot = g.spawnBullet(
        p.x + Math.cos(aim) * 8, p.y - 14 + Math.sin(aim) * 4,
        Math.cos(a) * w.bulletSpeed, Math.sin(a) * w.bulletSpeed,
        w.damage, w.pierce, w.bulletRadius, w.knockback, true,
        'bala', w.range, ammo.id,
      )
      /*
       * BALA TELEGUIADA. The only ammo property `spawnBullet` does not carry
       * itself — it clears `homing` on every spawn (a pooled round that curved
       * last life must not curve this one), so the round that WANTS to curve
       * has to say so here, after the reset.
       */
      if (shot && ammo.homing) shot.homing = ammo.homing
    }
    p.shootAnim = 0.16
    // Quiet and heavily throttled: at high fire rates this is the sound the
    // player hears more than any other, so it has to sit under everything.
    g.audio.play('shoot', { volume: 0.24, throttle: 0.05, maxVoices: 3 })
  }

  // ---- contact damage ----
  if (p.invuln <= 0) {
    g.hash.query(p.x, p.y, 40, near)
    /*
     * EVERYTHING TOUCHING HIM HITS, AND IT ARRIVES AS ONE BLOW.
     *
     * It used to `break` after the first body, so walking into a wall of six
     * aliens cost exactly as much as brushing one — which is the wrong lesson
     * for a game whose entire pressure is the size of the crowd.
     *
     * ACCUMULATED AND APPLIED ONCE, not dealt per body. `damagePlayer` opens
     * the i-frame window, so calling it in the loop would let the first hit
     * absorb the other five anyway; and one blow means one sound, one shake
     * and one number rather than six of each on the same frame.
     */
    let contact = 0
    let hits = 0
    for (let n = 0; n < near.length; n++) {
      const e = g.enemies.items[near[n]]
      if (!e || e.attackCd > 0) continue
      // Whatever Amantes turned does not touch him. It is on his side and it
      // has somewhere else to be. See `updateAlly`.
      if (e.allyT > 0) continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d > e.radius + CONFIG.PLAYER.radius) continue
      e.attackCd = e.def.attackCd

      /*
       * AN ESTAGIÁRIO DOES NOT HIT YOU, it confuses you.
       *
       * Handled before the shield and before the damage, and it deliberately
       * ignores both: a shield is protection from being HURT, and this does
       * not hurt. It is also `continue` rather than a branch, because the
       * whole species is this one line and none of the rest of the contact
       * pass applies to something with zero damage.
       */
      /*
       * A BURIED MINHOCA GRABS INSTEAD OF HITTING.
       *
       * Before the shield check on purpose, and it ignores armour entirely:
       * this is not a blow, it is being caught, and the counterplay is the
       * struggle rather than the mitigation. The shield DOES stop it — being
       * untouchable has to mean untouchable, the same way it stops the Tripa
       * Seca robbing you.
       *
       * She goes to sleep for the length of the hold plus a beat, so a player
       * who mashes free is not caught again by the same mound on the next
       * frame while their thumb is still moving.
       */
      if (e.def.behavior === 'burrow' && e.depth <= 0.5) {
        if (p.shield <= 0 && p.grabT <= 0 && !p.abducted) {
          p.grabT = 2.2
          p.grabStruggle = 0
          p.grabNext = 'a'
          p.grabbedBy = e
          p.grabbedUid = e.uid
          g.runStats.grabbed += 1
          e.state = 3.4
          e.vx = 0
          e.vy = 0
          g.camera.addShake(0.6)
          g.audio.play('bossSpawn', { volume: 0.7, rate: 1.4 })
          g.spawnFx('splash', e.x, e.y, 1.1)
          g.say('A MINHOCA! ELA ME PEGOU!')
        }
        continue
      }

      if (e.def.inverts) {
        if (p.invertT < CONFIG.INVERT.seconds) {
          const fresh = p.invertT <= 0
          p.invertT = CONFIG.INVERT.seconds
          if (fresh) {
            g.spawnFloater(p.x, p.y - 46, 'INVERTIDO!', '#8ea8ff')
            g.audio.play('gambleBad', { volume: 0.8 })
            g.camera.addShake(0.35)
            /*
             * A BURST ON HIM, not on the intern.
             *
             * The thing that changed is the PLAYER, and an effect played on
             * the little blue body that caused it would read as the little
             * blue body dying. Centred on him, in the same blue the screen
             * state uses, so the two are obviously one event.
             */
            g.spawnFx('nebula', p.x, p.y - 10, 0.34)
            g.say('QUE PORRA É ESSA, MEUS BRAÇOS TROCARAM')
          }
        }
        continue
      }

      const blocked = p.shield > 0

      /*
       * TRIPA SECA gets what he came for.
       *
       * One stack, not the whole ability — losing a maxed Tambaqui to a single
       * touch would be miserable, while one stack is a real loss you can see
       * on the HUD and earn back. The shield stops the robbery too: if it did
       * not, the one thing that is supposed to make you untouchable would not.
       */
      if (e.def.steals && e.stealCd <= 0 && !blocked) {
        const took = g.stealAbility()
        e.stealCd = 6
        if (took) {
          g.spawnFloater(p.x, p.y - 44, 'ROUBOU ' + took.toUpperCase(), '#ff9bd8')
          g.say('Ei! Esse desgraçado levou meu ' + took + '!')
          g.camera.addShake(0.3)
        }
      }

      // Only the first few count. See `CONFIG.CONTACT` for why there is a cap.
      if (hits < CONFIG.CONTACT.maxBodies) { contact += e.dmg; hits++ }

      // TIJOLO DE LEITE — the brick answers. It answers even through a shield:
      // the enemy still hit him, it just did not cost anything.
      const brick = p.abilities.tijolo.stacks
      if (brick > 0) {
        g.damageEnemy(near[n], at(ABILITIES.tijolo.damage, brick) * p.mods.damage, 0, 0)
        if (blocked) g.camera.addShake(0.1)
        /*
         * AND THAT IS WHERE THE LOOP HAS TO STOP.
         *
         * `damageEnemy` swap-removes on a kill, so every `near[n]` after this
         * one points at a body that has moved. Without the old unconditional
         * `break` the brick is the one thing in here that can invalidate the
         * list, so it keeps a break of its own — a crowd still all hits him,
         * and only a build carrying the brick trades the rest of the sweep for
         * the retaliation.
         */
        break
      }
    }

    /*
     * AND NEVER MORE THAN A BITE OF THE BAR AT ONCE.
     *
     * Six bodies at twenty damage each is a hundred and twenty, which on a
     * hundred-health run is death by walking into a corner. The cap is a
     * fraction of his MAXIMUM rather than a flat number so it means the same
     * thing at every point in a run.
     */
    if (contact > 0) g.damagePlayer(Math.min(contact, p.maxHp * CONFIG.CONTACT.maxFraction))
  }
}

/**
 * What a bullet does to a body beyond its damage.
 *
 * BALAS VENENOSAS stack: each venom hit adds a stack, and — this is the part
 * that makes it worth loading — the whole stack is refreshed by ANY bullet
 * landing on that target, not just another venom round. So you put a few
 * stacks into something big, switch back to the revolver, and the venom keeps
 * ticking for as long as you keep the pressure on it. Stop shooting it and the
 * stack falls off.
 */
function applyOnHit(e: Enemy, ammoId: Bullet['ammo']) {
  const def = ammoId ? AMMO[ammoId] : null
  const poison = def?.poison

  if (poison) {
    e.poisonStacks = Math.min(poison.maxStacks, e.poisonStacks + poison.perHit)
    e.poisonDps = poison.dpsPerStack
    e.poison = poison.duration
    return
  }

  // Not a venom round, but if it is already poisoned, keeping fire on it keeps
  // the stack alive.
  if (e.poisonStacks > 0) e.poison = AMMO.veneno.poison!.duration
}

/**
 * Somewhere for a ricochet to go next.
 *
 * Deliberately skips whatever is right under the impact, so a bounce is a jump
 * to another body rather than the same one twice. Anything already dead is
 * gone from the array by the time this runs, so the corpse cannot be chosen.
 */
/**
 * THE NEAREST BODY TO A POINT, for a round that is steering.
 *
 * Nearest rather than "whatever the player is aiming at": the round has left
 * the gun and is making its own decisions now, and a bullet that kept
 * consulting the cursor would be a cursor with a delay rather than a homing
 * round. Allies are skipped — it is his round.
 */
function nearestBody(g: Game, x: number, y: number, range: number) {
  const items = g.enemies.items
  let best = null
  let bestD = range * range
  for (let i = 0; i < items.length; i++) {
    const e = items[i]
    if (e.allyT > 0) continue
    const d = (e.x - x) ** 2 + (e.y - y) ** 2
    if (d < bestD) { bestD = d; best = e }
  }
  return best
}

function nextBounceTarget(g: Game, x: number, y: number, range: number) {
  const items = g.enemies.items
  let best = null
  let bestD = range * range
  for (let i = 0; i < items.length; i++) {
    const e = items[i]
    const d = (e.x - x) ** 2 + (e.y - y) ** 2
    if (d < 400) continue
    if (d < bestD) { bestD = d; best = e }
  }
  return best
}

/**
 * Works out which way the revolver is looking, and remembers it.
 *
 * The cursor is treated as a point in the world, so the direction updates as
 * the player moves around a stationary mouse — which is what makes pointing at
 * a spot on the ground feel like covering that spot. Very close to the player
 * the angle goes unstable, so the last good direction is kept instead.
 *
 * With no pointer at all — touch, or keyboard only — he aims where he walks,
 * and holds the last direction when standing still.
 */
function updateAimDirection(g: Game, p: Player) {
  if (g.input.hasPointer) {
    const m = g.camera.screenToWorld(g.input.aimScreenX, g.input.aimScreenY)
    const dx = m.x - p.x
    const dy = m.y - (p.y - 14)
    const d = Math.hypot(dx, dy)
    if (d > 16) { p.aimX = dx / d; p.aimY = dy / d }
    return
  }
  const moving = Math.hypot(p.vx, p.vy)
  if (moving > 1) { p.aimX = p.vx / moving; p.aimY = p.vy / moving }
}

/**
 * Target selection.
 *
 * Two things bend it away from "shoot whatever is closest":
 *
 * ELITES get their distance weighted down. With one single-target weapon,
 * closest-first means the revolver spends a whole boss fight killing guests
 * while the boss walks in untouched — in testing O Noivo finished several runs
 * on full health for exactly that reason.
 *
 * THE CURSOR steers the rest. A target's score is multiplied by how far off
 * the aim direction it sits, so pointing sweeps your fire across the horde
 * without ever silencing the gun: something behind you is still shootable, it
 * just has to be much closer to win. That keeps the weapon automatic — you
 * never click — while giving the player real say over which side gets cleared.
 */
const ELITE_PRIORITY = 0.42

/**
 * Is there anything at all worth pulling the trigger at?
 *
 * Broad-phase only — the exact distance is checked per candidate, but the hash
 * means an empty field costs a couple of cell lookups rather than a walk over
 * every body in the pool.
 */
function anythingInRange(g: Game, x: number, y: number, range: number): boolean {
  const found = g.hash.query(x, y, range, scratch)
  const r2 = range * range
  for (let i = 0; i < found.length; i++) {
    const e = g.enemies.items[found[i]]
    if (!e) continue
    const dx = e.x - x
    const dy = e.y - y
    if (dx * dx + dy * dy <= r2) return true
  }
  return false
}

const scratch: number[] = []

function pickTarget(
  g: Game, x: number, y: number, range: number,
  aimX: number, aimY: number,
): number {
  const items = g.enemies.items
  const r2 = range * range
  const steering = aimX !== 0 || aimY !== 0
  let best = -1
  let bestScore = Infinity

  for (let i = 0; i < items.length; i++) {
    const e = items[i]
    const dx = e.x - x
    const dy = e.y - y
    const d2 = dx * dx + dy * dy
    if (d2 > r2) continue

    let score = d2
    if (steering) {
      const d = Math.sqrt(d2) || 1
      // 1 = dead ahead of the cursor, -1 = directly behind the player.
      const alignment = (dx / d) * aimX + (dy / d) * aimY
      score *= 1 + CONFIG.AIM_STEER * (1 - alignment) * 0.5
    }
    if (e.def.elite) score *= ELITE_PRIORITY
    if (score < bestScore) { bestScore = score; best = i }
  }
  return best
}

// ----------------------------------------------------------------- BULLETS --

export function updateBullets(g: Game, dt: number) {
  const items = g.bullets.items
  for (let i = items.length - 1; i >= 0; i--) {
    const b = items[i]

    /*
     * A JANELA COMES BACK.
     *
     * Speed follows a cosine across the whole flight: full ahead at launch,
     * stalled at the halfway point, full speed home by the end. That gives the
     * turn a visible hang rather than a snap, and it means the ground a volley
     * has already crossed is only safe for about a second — which is the
     * entire reason to throw boomerangs at someone instead of bullets.
     *
     * The lateral term bends the return slightly off the outbound line, so a
     * volley fans on the way back instead of retracing itself exactly.
     */
    /*
     * A MISSILE STEERS.
     *
     * Applied before the motion below rather than as a branch of its own, so
     * a homing round is an ordinary bullet that happens to turn — it still
     * expires on range, still hits on the same test, still draws the same way.
     * The turn is capped per frame, which is what gives it a radius the player
     * can cut inside instead of an inevitability.
     */
    if (b.homing > 0) {
      /*
       * IT STEERS AT WHOEVER IT BELONGS TO.
       *
       * This used to be `!b.friendly` — homing was a thing only the aliens
       * did, at him. Bala Teleguiada is the same maths pointed the other way,
       * so the gate became "whose round is this" rather than "is homing
       * allowed at all", and the target is chosen to match.
       *
       * A friendly round with nothing to chase keeps flying straight, which is
       * correct: it should not stall in the air waiting for something to
       * appear.
       */
      const tp = b.friendly ? nearestBody(g, b.x, b.y, 300) : g.player
      if (!tp) continue
      const want = Math.atan2(tp.y - 12 - b.y, tp.x - b.x)
      let cur = Math.atan2(b.vy, b.vx)
      const diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      cur += Math.max(-b.homing * dt, Math.min(b.homing * dt, diff))
      const sp = Math.hypot(b.vx, b.vy)
      b.vx = Math.cos(cur) * sp
      b.vy = Math.sin(cur) * sp
      b.spin = cur
    }

    /*
     * A NOTE DANCES ITS WAY OVER.
     *
     * Two things happening at once: a slow bend toward whatever is nearest,
     * and a weave laid over the top of it. The weave is added to the HEADING
     * rather than to the drawn position, so the path it takes really is the
     * path it hits along — a note that visibly swings past you and does no
     * damage would be worse than one that flies straight.
     *
     * The phase comes from `spin`, which spawn already randomised, so a phrase
     * of four notes leaves in four different directions and stays a phrase
     * instead of collapsing into one thick line.
     */
    if (b.kind === 'nota') {
      const N = ABILITIES.cantarolar
      b.age += dt
      let cur = Math.atan2(b.vy, b.vx)
      const t = nextBounceTarget(g, b.x, b.y, N.seek)
      if (t) {
        const want = Math.atan2(t.y - 8 - b.y, t.x - b.x)
        const diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        cur += Math.max(-N.turn * dt, Math.min(N.turn * dt, diff))
      }
      cur += Math.sin(b.age * N.swayRate + b.spin) * N.sway * dt
      b.vx = Math.cos(cur) * N.speed
      b.vy = Math.sin(cur) * N.speed
    }

    if (b.boomerang > 0) {
      b.age += dt
      if (b.age >= b.boomerang) { g.bullets.removeAt(i); continue }
      const t = b.age / b.boomerang
      const speed = Math.cos(t * Math.PI) * b.bmSpeed
      const drift = Math.sin(t * Math.PI * 2) * b.bmSpeed * 0.22
      b.vx = b.bmX * speed - b.bmY * drift
      b.vy = b.bmY * speed + b.bmX * drift
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.spin += dt * 7
      if (b.hitCd > 0) b.hitCd -= dt
    } else {
      const step = Math.hypot(b.vx, b.vy) * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.life -= step
      if (b.hitCd > 0) b.hitCd -= dt
      if (b.life <= 0) {
        /*
         * IT CAME DOWN SOMEWHERE.
         *
         * Only the player's rounds are marked — a horde round expiring is not
         * information anybody needs, and at the density act two reaches it
         * would carpet the street. Missing should look like missing.
         */
        if (b.friendly) g.spawnFx('splash', b.x, b.y, 0.9)
        g.bullets.removeAt(i)
        continue
      }
    }

    if (b.friendly) {
      if (b.hitCd > 0) continue
      g.hash.query(b.x, b.y, b.radius + 20, near)
      for (let n = 0; n < near.length; n++) {
        const idx = near[n]
        const e = g.enemies.items[idx]
        if (!e) continue
        const d = Math.hypot(e.x - b.x, e.y - b.y - 8)
        if (d > e.radius + b.radius) continue

        const speed = Math.hypot(b.vx, b.vy) || 1
        const ammo = b.ammo ? AMMO[b.ammo] : null

        // Applied BEFORE the damage: the hit might be lethal, and the enemy
        // would be swap-removed out from under the index.
        applyOnHit(e, b.ammo)
        // Remember where it connected — the enemy may not survive the line below.
        const hx = e.x
        const hy = e.y
        if (!b.counted) { b.counted = true; g.runStats.hits += 1 }
        /*
         * ONE CONTINUATION PER HEAD, and this is where it is spent.
         *
         * `damageEnemy` rolls the chain, but it cannot mark the head that
         * rolled — it never sees the bullet. So the kill is detected here,
         * off the counter, and the head's link is set negative: it stays
         * flagged as a skull (so it never falls back to the ability's own 15%
         * roll) while no longer being eligible to continue.
         *
         * Without this a head with five bounces rolls up to five times and the
         * "chain" is a tree that branches faster than the decay shrinks it.
         * Spent on the first KILL rather than the first HIT, because a head
         * that grazed three armoured bodies has not had its turn yet.
         */
        const link = b.kind === 'skull' ? b.chain : 0
        const killsBefore = g.kills
        g.damageEnemy(
          idx, b.damage, (b.vx / speed) * b.knockback, (b.vy / speed) * b.knockback,
          false, false, link,
        )
        if (link > 0 && g.kills > killsBefore) b.chain = -1

        // BALA EXPLOSIVA. The blast is the damage; the impact barely matters.
        // It cannot hurt the player: a self-damaging round on a weapon that
        // fires itself is a trap nobody asked for.
        if (ammo?.explode) {
          g.detonate(
            hx, hy,
            ammo.explode.damage * REVOLVER.damage * g.player.mods.damage,
            ammo.explode.radius,
          )
          g.camera.addShake(0.12)
          g.bullets.removeAt(i)
          break
        }

        /*
         * ANYTHING THAT BOUNCES looks for somewhere else to be.
         *
         * Two things use this now and only one of them is ammunition, so the
         * range comes from whichever is doing the bouncing rather than from
         * `ammo` — which is null for a skull, and used to make the whole
         * branch unreachable for it.
         */
        if (b.bounces > 0) {
          const reach = b.kind === 'skull'
            ? ABILITIES.cabeca.bounceRange
            : (ammo?.bounceRange ?? 180)
          const next = nextBounceTarget(g, hx, hy, reach)
          if (next) {
            const dx = next.x - hx
            const dy = next.y - 10 - hy
            const nd = Math.hypot(dx, dy) || 1
            b.x = hx
            b.y = hy
            b.vx = (dx / nd) * speed
            b.vy = (dy / nd) * speed
            b.bounces--
            b.life = b.kind === 'skull'
              ? ABILITIES.cabeca.life * 0.8
              : (ammo?.range ?? 300) * 0.7
            b.hitCd = 0.07
            break
          }
        }

        if (b.pierce > 0) {
          b.pierce--
          /*
           * A tornado is a moving wall, not a fast bullet, so it waits much
           * longer between bites. At the ordinary pierce cooldown it chewed a
           * standing body twenty times a second and deleted anything large on
           * contact, which is not what "it crosses the field" should mean.
           */
          b.hitCd = b.kind === 'tornado' ? ABILITIES.tornado.hitCd : 0.05
        } else { g.bullets.removeAt(i) }
        break
      }
    } else {
      const p = g.player
      if (p.invuln > 0) continue
      if (Math.hypot(p.x - b.x, p.y - 14 - b.y) < CONFIG.PLAYER.radius + b.radius) {
        g.damagePlayer(b.damage)
        g.bullets.removeAt(i)
      }
    }
  }
}

// ----------------------------------------------------------------- PICKUPS --

export function updatePickups(g: Game, dt: number) {
  const p = g.player
  const magnet = CONFIG.PLAYER.magnet * p.mods.magnet
  const items = g.pickups.items
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    it.age += dt
    const dx = p.x - it.x
    const dy = p.y - 12 - it.y
    const d = Math.hypot(dx, dy) || 1

    /*
     * Totems are not pulled in. They are objects lying in the world, and
     * finding one should mean walking over to it — a magnet that sucks it off
     * a hillside turns a discovery into a pickup you never noticed.
     */
    if (it.kind !== 'totem' && !it.magnetised && d < magnet) it.magnetised = true

    if (it.magnetised) {
      /*
       * Kinematic homing, not a force.
       *
       * A spring-and-drag pull looks right standing still and fails completely
       * in motion: its terminal speed at the edge of the magnet radius works
       * out slower than the player's walk, so on a run that only ever moves
       * east the gems trail behind forever and the player stalls around level
       * four with hundreds of kills. Chasing at a speed that ramps well past
       * the player's own guarantees the pickup lands.
       */
      it.speed = Math.min(it.speed + 1100 * dt, 460)
      it.x += (dx / d) * it.speed * dt
      it.y += (dy / d) * it.speed * dt
    } else {
      it.vx *= Math.pow(0.02, dt)
      it.vy *= Math.pow(0.02, dt)
      it.x += it.vx * dt
      it.y += it.vy * dt
    }

    const reach = it.kind === 'totem' ? 20 : 12
    if (d < reach) {
      if (it.kind === 'corn_mini' || it.kind === 'corn_boss') {
        g.addXp(it.value)
        /*
         * AND THE BIG ONES ARE WHAT BRING COBSON OUT.
         *
         * Counted on the PICKUP rather than on the kill: the corn has to
         * actually be collected, so a player who drops a mini-boss and walks
         * away from the loot has not earned him. Boss corn is worth two —
         * there is at most one per act, and a whole boss should move the
         * needle more than a Grande Gordo does.
         */
        g.goodCorn += it.kind === 'corn_boss' ? 2 : 1
        if (g.goodCorn >= COBSON_CORN) { g.goodCorn = 0; callCobson(g) }
        // Its own noise, because picking one up is an event and the ordinary
        // orb's blip is a sound the player stopped hearing an hour ago.
        g.audio.play('totem', { volume: it.kind === 'corn_boss' ? 0.95 : 0.7 })
      } else if (it.kind === 'star') g.callAllCorn()
      else if (it.kind === 'bomb') g.eatBomb(it.value)
      else if (it.kind === 'xp') g.addXp(it.value)
      else if (it.kind === 'totem') g.takeTotem(it.value)
      else g.heal(it.value)
      g.pickups.removeAt(i)
    }
  }
}

/**
 * THE STRUGGLE.
 *
 * The one moment in the game that is not solved by moving. A grab holds the
 * player still and drains them, and the way out is alternating A and D — not
 * mashing one key, because a single key is a button you hold down and
 * alternation is something you have to actually do.
 *
 * Three things make it fair rather than annoying:
 *
 *   1. IT DECAYS. Progress slips back if you stop, so the fight is against a
 *      current rather than a counter, and there is no waiting it out.
 *   2. IT IS SURVIVABLE. The hold drains steadily and the release hurts, but
 *      neither is lethal on its own from full health — losing the struggle
 *      costs you the fight you were winning, not the run.
 *   3. THE PROMPT IS ENORMOUS. See the HUD. A quick-time event nobody notices
 *      is just damage.
 */
function updateGrab(g: Game, dt: number) {
  const p = g.player

  /*
   * THE SHIP'S HOLD IS ITS OWN.
   *
   * Same struggle, same keys, same prompt — but nothing is holding him from
   * the side, he is going straight up, and the thing that has him is not in
   * the enemy pool at all. See `systems/abduction.ts`.
   */
  if (p.abducted) { abductionHold(g, dt); return }

  const boss = p.grabbedBy

  /*
   * WHATEVER HAD HOLD OF HIM IS GONE: LET GO.
   *
   * The identity check is the important half. `grabbedBy` is a reference into
   * a dense pool with swap-remove — kill the thing holding you and the LAST
   * enemy in the pool is moved into that slot, so the object this points at is
   * suddenly a different, living body and the player stays held by something
   * that never grabbed them. The health check alone could not see that: the
   * replacement has health.
   *
   * Rare with one mothership in the game and routine now that a common act-one
   * enemy grabs. See `Enemy.uid`.
   */
  if (!boss || boss.hp <= 0 || boss.uid !== p.grabbedUid) { releaseGrab(g, false); return }

  // Held against the body, so the camera has something to sell.
  const ang = Math.atan2(p.y - boss.y, p.x - boss.x)
  p.x = boss.x + Math.cos(ang) * 34
  p.y = boss.y + Math.sin(ang) * 26
  p.vx = 0
  p.vy = 0

  p.grabT -= dt
  // Slips back, so stopping is losing ground rather than merely not gaining.
  p.grabStruggle = Math.max(0, p.grabStruggle - dt * 0.34)

  if (g.input.consumePressed(p.grabNext)) {
    p.grabStruggle += 0.14
    p.grabNext = p.grabNext === 'a' ? 'd' : 'a'
    g.audio.play('hurt', { volume: 0.35, throttle: 0.04, rate: 1.4 })
    g.camera.addShake(0.12)
  }

  // A steady drain, so being held is never free.
  g.damagePlayerOverTime(11 * dt)

  if (p.grabStruggle >= 1) { releaseGrab(g, true); return }
  if (p.grabT <= 0) releaseGrab(g, false)
}

/** Ends a grab. `escaped` decides whether it also hurts. */
function releaseGrab(g: Game, escaped: boolean) {
  const p = g.player
  const boss = p.grabbedBy
  p.grabT = 0
  p.grabStruggle = 0
  p.grabbedBy = null

  if (boss) {
    // Thrown clear either way — the difference is what it costs.
    const ang = Math.atan2(p.y - boss.y, p.x - boss.x)
    p.x = boss.x + Math.cos(ang) * 120
    p.y = boss.y + Math.sin(ang) * 90
    boss.state = 2.6
    boss.awake = false
  }

  if (escaped) {
    p.invuln = Math.max(p.invuln, 0.9)
    g.spawnFloater(p.x, p.y - 46, 'SOLTOU!', '#9be8b0')
    g.audio.play('block', { volume: 0.8 })
  } else {
    g.damagePlayer(34)
    p.invuln = Math.max(p.invuln, 1.1)
    g.spawnFloater(p.x, p.y - 46, 'ESMAGADO', '#ff9b9b')
    g.camera.addShake(0.8)
  }
}

// ---------------------------------------------------------------- FLOATERS --

export function updateFloaters(g: Game, dt: number) {
  const items = g.floaters.items
  for (let i = items.length - 1; i >= 0; i--) {
    const f = items[i]
    f.life -= dt
    f.y += f.vy * dt
    f.vy += 42 * dt
    if (f.life <= 0) g.floaters.removeAt(i)
  }
}
