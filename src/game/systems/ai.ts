import type { Game } from '../Game'
import type { Enemy } from '../types'
import { ENEMIES } from '../data/enemies'
import { ABILITIES } from '../data/abilities'
import { hitHelper, nearestHelper } from './homunculo'
import { pillarsLeft } from './act3'


const neighbours: number[] = []

/**
 * Enemy steering.
 *
 * Every behaviour writes a desired velocity into (vx, vy); knockback lives in
 * a separate (kx, ky) channel that decays on its own, so being shot never
 * fights the AI for control of the same variable.
 */
export function updateEnemies(g: Game, dt: number) {
  const items = g.enemies.items

  /*
   * PRIVACIDADE.
   *
   * While he is invisible the horde chases the spot where they last saw him,
   * not him. That is what makes the ability read as losing them rather than as
   * switching their brains off — they keep coming, confidently, to the wrong
   * place, and you walk out the side.
   */
  const hidden = g.lostPlayer && g.player.invisible > 0
  const px = hidden ? g.lastSeenX : g.player.x
  const py = hidden ? g.lastSeenY : g.player.y

  for (let i = 0; i < items.length; i++) {
    const e = items[i]

    /*
     * Hazard cooldowns run down here, at the very top, because several of the
     * branches below `continue` out of the loop — an enemy lured by a
     * homúnculo never reaches the bottom. Ticked further down, `rainCd` only
     * decremented while the player happened to be invisible, and a mushroom
     * that should have bitten seven times over three seconds bit once.
     */
    if (e.rainCd > 0) e.rainCd -= dt
    if (e.tornadoCd > 0) e.tornadoCd -= dt
    if (e.invulnT > 0) e.invulnT -= dt

    /*
     * A homúnculo standing nearby takes the attention. That is the whole
     * value of the thing: it does not just soak damage, it changes where the
     * crowd is walking, and a press that was closing on you goes somewhere
     * else instead.
     */
    const lure = e.def.behavior === 'boss'
      ? null
      : nearestHelper(g, e.x, e.y, ABILITIES.homunculo.aggroRadius)
    if (lure && !hidden) {
      const lx = lure.x - e.x
      const ly = lure.y - e.y
      const ld = Math.hypot(lx, ly) || 1
      e.vx = (lx / ld) * e.def.speed
      e.vy = (ly / ld) * e.def.speed
      const decayL = Math.pow(0.0009, dt)
      e.kx *= decayL; e.ky *= decayL
      e.x += (e.vx + e.kx) * dt
      e.y += (e.vy + e.ky) * dt
      if (Math.abs(e.vx) > 4) e.flip = e.vx < 0
      e.anim += dt
      if (e.flash > 0) e.flash -= dt
      if (e.attackCd > 0) e.attackCd -= dt
      else if (hitHelper(g, i, e)) e.attackCd = e.def.attackCd
      if (e.stealCd > 0) e.stealCd -= dt

      if (g.arenaLocked) clampToArena(g, e)
      continue
    }

    const dx = px - e.x
    const dy = py - e.y
    const dist = Math.hypot(dx, dy) || 1
    const nx = dx / dist
    const ny = dy / dist

    // A turned body fights its own kind and never reaches the switch below.
    if (updateAlly(g, e, dt)) { e.x += e.vx * dt; e.y += e.vy * dt; continue }

    switch (e.def.behavior) {
      case 'chase':
        e.vx = nx * e.def.speed
        e.vy = ny * e.def.speed
        break

      case 'swarm': {
        // A per-enemy phase offset keeps a swarm from collapsing into one line.
        const wob = Math.sin(g.time * 2.4 + e.seed * 6.283) * 0.45
        e.vx = (nx * Math.cos(wob) - ny * Math.sin(wob)) * e.def.speed
        e.vy = (nx * Math.sin(wob) + ny * Math.cos(wob)) * e.def.speed
        break
      }

      case 'charger': {
        // 0 = approach, 1 = wind up (telegraph), 2 = dash.
        e.state -= dt
        if (e.phase === 0) {
          e.vx = nx * e.def.speed
          e.vy = ny * e.def.speed
          if (dist < 190) { e.phase = 1; e.state = 0.55 }
        } else if (e.phase === 1) {
          e.vx *= 0.82; e.vy *= 0.82
          if (e.state <= 0) {
            e.phase = 2
            e.state = 0.5
            e.vx = nx * e.def.speed * 3.6
            e.vy = ny * e.def.speed * 3.6
          }
        } else {
          if (e.state <= 0) { e.phase = 0; e.state = 0 }
        }
        break
      }

      case 'shooter': {
        const ideal = 210
        const drive = dist > ideal + 40 ? 1 : dist < ideal - 50 ? -1 : 0
        e.vx = nx * e.def.speed * drive
        e.vy = ny * e.def.speed * drive
        e.state -= dt
        // Criptografia keeps their finger off the trigger for longer too.
        if (e.state <= 0 && dist < 340 * g.player.mods.notice && !hidden) {
          e.state = e.def.attackCd
          g.spawnBullet(
            e.x, e.y - 8, nx * 170, ny * 170, e.dmg, 0, 4, 0, false,
            e.def.shot ?? 'bala',
          )
        }
        break
      }

      case 'stalker': {
        /*
         * A thief with a gun. He fires on the approach but never backs off —
         * the shooting is pressure, the point is to reach you. Contact is
         * handled in the combat pass, where he takes something and leaves.
         */
        e.vx = nx * e.def.speed
        e.vy = ny * e.def.speed
        e.state -= dt
        if (e.state <= 0 && dist < 300 && dist > 40 && !hidden) {
          e.state = e.def.attackCd
          g.spawnBullet(e.x, e.y - 10, nx * 190, ny * 190, e.dmg, 0, 4, 0, false)
        }
        break
      }

      /*
       * MINHOCA ALIEN — under the ground or out of it, never both.
       *
       * `e.state` is the clock for the current half and `e.depth` is where she
       * is between them: 0 buried, 1 fully up. Everything else in the game
       * reads `depth` rather than a second flag, so there is exactly one
       * source of truth about which half she is in.
       *
       * MOVEMENT AND VULNERABILITY ARE SWAPPED, which is the whole species.
       * Buried she crawls at the player and cannot be touched; up she is
       * planted and can be shot. She never gets to do both, so the counterplay
       * is entirely about timing rather than about aim.
       *
       * SHE SURFACES NEAR HIM AND WAITS. Coming up on the far side of the
       * screen would make her free, so the dive is only worth taking when she
       * is close — she stays down while she is still crossing ground and pops
       * the moment she is in reach.
       */
      case 'burrow': {
        e.state -= dt
        const up = e.depth > 0.5

        if (up) {
          // Planted. She cannot move at all, which is the price of being out.
          e.vx = 0
          e.vy = 0
          e.depth = Math.min(1, e.depth + dt * 4)
          if (e.state <= 0) {
            // Down again, and the clock for the crawl is set here.
            e.depth = 0.49
            e.state = 2.2 + Math.random() * 2.4
            g.spawnFx('splash_pale', e.x, e.y, 0.7)
            g.audio.play('drop', { volume: 0.3, rate: 1.5, throttle: 0.2, maxVoices: 2 })
          }
          break
        }

        // Buried: a slow crawl toward him, and nothing can touch her.
        e.depth = Math.max(0, e.depth - dt * 4)
        e.vx = nx * e.def.speed
        e.vy = ny * e.def.speed
        /*
         * UP WHEN THE CLOCK RUNS OUT, OR EARLY IF SHE IS ALREADY ON HIM.
         *
         * The second half of that matters more than the first: a minhoca that
         * only ever surfaced on a timer would spend most of her life as an
         * untouchable mound wandering the caatinga, and the player would have
         * no way to make her come out. Closing the distance is what does it.
         */
        if (e.state <= 0 || (dist < 70 && e.state < 1.4)) {
          e.depth = 0.51
          // Long enough to be worth a magazine, short enough to be a window.
          e.state = 1.5 + Math.random() * 1.1
          g.spawnFx('splash', e.x, e.y, 0.9)
          g.audio.play('drop', { volume: 0.45, rate: 0.75, throttle: 0.15, maxVoices: 2 })
        }
        break
      }

      case 'bomber': {
        /*
         * Walks the egg over and sets it down on you. Slow on purpose — the
         * counterplay is noticing it and moving, not out-damaging it.
         */
        const det = e.def.detonates!
        if (e.fuse > 0) {
          e.vx *= 0.86; e.vy *= 0.86
          e.fuse -= dt
          if (e.fuse <= 0) { detonateOn(g, e, det); continue }
        } else {
          e.vx = nx * e.def.speed
          e.vy = ny * e.def.speed
          if (dist < det.triggerRange) e.fuse = det.fuse
        }
        break
      }

      case 'rocket': {
        /*
         * Scenery until you walk into its ring, then a missile. The sprite
         * swaps on waking so the difference is legible before it matters.
         */
        const det = e.def.detonates!
        if (!e.awake) {
          e.vx *= 0.8; e.vy *= 0.8
          const notice = (e.def.detectRange ?? 300) * g.player.mods.notice
          if (!hidden && dist < notice) {
            e.awake = true
            g.camera.addShake(0.08)
          }
          break
        }

        /*
         * ARMED. It stops dead and counts down.
         *
         * Stopping is the whole of the tell: everything else on the field is
         * moving, so the one thing that has planted itself is unmistakable
         * even in a crowd of four hundred. The renderer draws the blast circle
         * and the flash off `e.fuse` — see `drawEnemy`.
         */
        if (e.fuse > 0) {
          e.vx *= 0.78
          e.vy *= 0.78
          e.fuse -= dt
          if (e.fuse <= 0) { detonateOn(g, e, det); continue }
          break
        }

        if (e.state > 0) e.state -= dt
        e.vx = nx * e.def.speed
        e.vy = ny * e.def.speed
        if (e.state <= 0 && dist < det.triggerRange) {
          e.fuse = det.fuse
          e.vx = 0
          e.vy = 0
          g.audio.play('rocketWake', { volume: 0.7, rate: 1.5, throttle: 0.15, maxVoices: 3 })
          g.camera.addShake(0.12)
        }
        break
      }

      case 'car': {
        /*
         * Picks a lane and commits. No steering, no target — it was set moving
         * when it spawned and it keeps going until it is off the map. It is
         * also on nobody's side: it ploughs the horde as happily as the player.
         */
        e.vy *= 0.9
        ploughThrough(g, i, e)
        break
      }

      case 'idle':
        // The alien tech. It stands there and it is shot. That is the whole
        // behaviour, and the fight around it is what makes it interesting.
        e.vx = 0; e.vy = 0
        break

      case 'boss':
        if (e.def.id === 'beholder') updateBeholder(g, e, dt, nx, ny, dist)
        else if (e.def.id === 'manifestacao') updateManifestacao(g, e, dt, nx, ny, hidden)
        else if (e.def.id === 'microsoft') updateMicrosoft(g, e, dt, nx, ny, dist, hidden)
        else if (e.stage > 0 || e.def.stages) updateChara(g, e, dt, nx, ny, dist, hidden)
        else updateBoss(g, e, dt, nx, ny, dist, hidden)
        break
    }

    /*
     * An aura is damage you are standing in rather than damage aimed at you —
     * salt on the ground, a glow. It ignores attack cooldowns because it is not
     * an attack; it just costs you for being there.
     */
    if (e.def.aura && !hidden) {
      const ad = Math.hypot(g.player.x - e.x, g.player.y - 12 - e.y)
      if (ad < e.def.aura.radius) g.damagePlayerOverTime(e.def.aura.dps * dt)
    }

    /*
     * A broken thing vents.
     *
     * Anything with a `brokenBurst` starts throwing energy in every direction
     * once it is hurt past its threshold, so a wounded one is more dangerous
     * than a fresh one. Standing next to a flying thing and chipping at it is
     * the wrong idea; finishing it is the right one.
     */
    if (e.def.brokenBurst && e.broken) {
      e.burstCd -= dt
      if (e.burstCd <= 0) {
        const b = e.def.brokenBurst
        e.burstCd = b.interval
        const spin = e.seed * Math.PI * 2 + g.time * 0.7
        for (let k = 0; k < b.count; k++) {
          const ang = spin + (k / b.count) * Math.PI * 2
          g.spawnBullet(
            e.x, e.y - (e.def.hover ?? 0) - 8,
            Math.cos(ang) * b.speed, Math.sin(ang) * b.speed,
            b.damage, 0, 4, 0, false,
          )
        }
      }
    }

    if (e.stealCd > 0) e.stealCd -= dt

    /*
     * O SALEIRO LEAVES A TRAIL.
     *
     * Its aura was the whole of it before, which made it a thing you walked
     * away from and forgot. Salt that STAYS turns it into terrain: a Saleiro
     * that has been wandering a street has closed off parts of it, and killing
     * one does not clean up after it. That is what makes it a trap rather than
     * a moving damage field.
     */
    if (e.def.aura && e.def.id === 'saleiro') {
      e.burstCd -= dt
      if (e.burstCd <= 0 && g.storms.length < 60) {
        e.burstCd = 1.5
        // Not on top of salt that is already there. Without this a pacing
        // Saleiro lays eighty patches in eight seconds and the street becomes
        // impassable rather than hazardous.
        let crowded = false
        for (const st of g.storms) {
          if (!st.hostile) continue
          if ((st.x - e.x) ** 2 + (st.y - e.y) ** 2 < 44 * 44) { crowded = true; break }
        }
        if (!crowded) g.storms.push({
          kind: 'sal', hostile: true,
          x: e.x, y: e.y, radius: 42,
          delay: 0, life: 9,
          damage: 11, tick: 1, tickCd: 1, age: 0,
        })
      }
    }

    // Knockback decays exponentially and is applied on top of steering.
    const decay = Math.pow(0.0009, dt)
    e.kx *= decay
    e.ky *= decay

    e.x += (e.vx + e.kx) * dt
    e.y += (e.vy + e.ky) * dt

    /*
     * Walls, for anything with its feet on the ground.
     *
     * FLYERS ARE EXEMPT — anything with `hover` passes straight over a house,
     * and that exemption is doing more work than it looks. A town full of
     * solid buildings is a town a ground horde can get stuck behind; keeping
     * the air lanes open means there is always something that reaches you, and
     * it gives the flying half of the bestiary a reason to exist beyond being
     * a different sprite.
     *
     * The car is exempt too: it is a joke about not stopping, and a Doido do
     * Carro parked against a wall is not one.
     */
    if (!e.def.hover && e.def.behavior !== 'car') {
      const fixed = g.chunks.props.resolve(e.x, e.y, e.radius)
      e.x = fixed.x
      e.y = fixed.y
    }

    if (Math.abs(e.vx) > 4) e.flip = e.vx < 0
    e.anim += dt
    if (e.flash > 0) e.flash -= dt
    if (e.attackCd > 0) e.attackCd -= dt

    if (g.arenaLocked) clampToArena(g, e)
  }

  separate(g, dt)
}

/**
 * Soft body separation.
 *
 * Without this every enemy converges to the exact same point and the horde
 * renders as a single sprite. Each enemy is pushed out of its neighbours
 * proportionally to overlap and inversely to mass, which is what gives a
 * Vampire-Survivors crowd its shape.
 */
function separate(g: Game, dt: number) {
  const items = g.enemies.items
  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    const ar = a.radius
    g.hash.query(a.x, a.y, ar * 2, neighbours)
    let pushX = 0
    let pushY = 0
    for (let n = 0; n < neighbours.length; n++) {
      const j = neighbours[n]
      if (j === i || j >= items.length) continue
      const b = items[j]
      const dx = a.x - b.x
      const dy = a.y - b.y
      const min = ar + b.radius
      const d2 = dx * dx + dy * dy
      if (d2 >= min * min || d2 === 0) continue
      const d = Math.sqrt(d2)
      const overlap = (min - d) / min
      const massRatio = (b.def.mass ?? 1) / ((a.def.mass ?? 1) + (b.def.mass ?? 1))
      pushX += (dx / d) * overlap * massRatio
      pushY += (dy / d) * overlap * massRatio
    }
    const strength = 520 * dt
    a.x += pushX * strength
    a.y += pushY * strength
  }
}

function clampToArena(g: Game, e: Enemy) {
  const a = g.activeArena
  if (!a) return
  e.x = Math.max(a.centerX - a.halfW + 20, Math.min(a.centerX + a.halfW - 20, e.x))
  e.y = Math.max(a.centerY - a.halfH + 20, Math.min(a.centerY + a.halfH - 20, e.y))
}

/**
 * A MANIFESTAÇÃO — a bullet hell, not a chase.
 *
 * It barely moves. What it does is fill the arena with flags in patterns you
 * have to read and walk through, and keep pushing bodies into the space while
 * you do. The three phases add a second pattern rather than replacing the
 * first, so the floor gets progressively harder to stand on.
 */
/** How many of the crowd the riot keeps on the field at once. */
const MAX_MANIFESTANTES = 6

function updateManifestacao(
  g: Game, e: Enemy, dt: number, nx: number, ny: number, hidden: boolean,
) {
  const frac = e.hp / e.maxHp
  const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3

  // It drifts toward the player rather than charging — the threat is the air,
  // not the body.
  const drift = hidden ? 0 : 0.35
  e.vx = nx * e.def.speed * drift
  e.vy = ny * e.def.speed * drift
  if (Math.abs(e.vx) > 2) e.flip = e.vx < 0

  /*
   * Flag damage is a FIXED number, deliberately not derived from the riot's
   * contact damage.
   *
   * Contact is meant to be near-mortal now, and a bullet hell that fires
   * near-mortal contact sixty times over is not a fight, it is a coin flip.
   * These are dodgeable, and there are dozens of them in the air — the threat
   * is the accumulation and the geometry, so each one has to stay affordable.
   * Walking into the crowd itself still costs you the full 26.
   */
  const FLAG_DAMAGE = 15
  const flag = (ang: number, speed: number) =>
    g.spawnBullet(e.x, e.y - 26, Math.cos(ang) * speed, Math.sin(ang) * speed,
      FLAG_DAMAGE, 0, 6, 0, false, 'flag', 900)

  /*
   * --- the spiral: a steady stream that sweeps the whole arena ---
   *
   * The phases are keyed to the health bar, which means hurting the boss is
   * also what makes it dangerous — so the escalation has to stay inside what a
   * player can read. An earlier pass at 0.11s and three arms put out some
   * twenty-seven flags a second, and the arena simply filled: lowering the
   * boss's health made the fight HARDER, because it reached that pattern
   * sooner. Each step up should be visibly worse and still have gaps in it.
   */
  e.state -= dt
  if (e.state <= 0) {
    e.state = phase === 1 ? 0.2 : phase === 2 ? 0.15 : 0.12
    e.phase += 0.42
    const arms = phase >= 3 ? 3 : 2
    for (let k = 0; k < arms; k++) {
      flag(e.phase + (k / arms) * Math.PI * 2, 132)
    }
  }

  // --- the volley: a ring, on a slower clock, from phase two ---
  e.burstCd -= dt
  if (e.burstCd <= 0) {
    e.burstCd = phase === 1 ? 4.2 : phase === 2 ? 3.2 : 2.5
    if (phase >= 2) {
      const count = 12 + phase * 4
      const spin = Math.random() * Math.PI * 2
      for (let k = 0; k < count; k++) flag(spin + (k / count) * Math.PI * 2, 96)
      g.camera.addShake(0.3)
    }
    /*
     * --- and it keeps throwing people in ---
     *
     * Capped, because the gun aims itself: a body at arm's length always
     * outscores the boss across the arena, so an uncapped stream quietly turns
     * the fight into "shoot manifestantes forever" and the health bar stops
     * moving. Six is enough to keep the player honest about where they stand
     * without taking the crowd's own fight away from them.
     */
    let live = 0
    for (const o of g.enemies.items) if (o.def.id === 'manifestante') live++
    const bodies = Math.min(phase + 1, MAX_MANIFESTANTES - live)
    for (let k = 0; k < bodies; k++) {
      const a = Math.random() * Math.PI * 2
      g.spawnEnemy(ENEMIES.manifestante, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70)
    }
  }
}

/** A thing that detonates and takes itself with it. */
/**
 * A LOVER, FIGHTING FOR HIM.
 *
 * Whatever Amantes turned keeps its own sprite, its own speed and its own
 * contact attack; the only thing that changes is who it is walking at. It
 * hunts the nearest body that has NOT been turned, and hits it on the same
 * `attackCd` it would have hit the player on.
 *
 * IT IS STILL AN ENEMY, and that is the design. The horde has no idea one of
 * its own has gone over, so it walks into it, hits it, and kills it in about
 * the time you would expect — which is why the card buffs it on the way in.
 * A lover is a distraction with a knife, not a second player.
 *
 * Returns true when it has handled the body, so the ordinary behaviour switch
 * is skipped entirely: an allied Glowie must not also be shooting at him.
 */
function updateAlly(g: Game, e: Enemy, dt: number): boolean {
  if (e.allyT <= 0) return false

  const items = g.enemies.items
  let best: Enemy | null = null
  let bestD = 460 * 460
  for (let j = items.length - 1; j >= 0; j--) {
    const o = items[j]
    if (o === e || o.allyT > 0) continue
    const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2
    if (d < bestD) { bestD = d; best = o }
  }

  if (e.attackCd > 0) e.attackCd -= dt

  if (!best) {
    // Nothing to fight: it walks back to him rather than standing in a field.
    const p = g.player
    const dx = p.x - e.x
    const dy = p.y - e.y
    const d = Math.hypot(dx, dy) || 1
    const close = d < 70 ? 0 : 1
    e.vx = (dx / d) * e.def.speed * close
    e.vy = (dy / d) * e.def.speed * close
    e.flip = dx < 0
    return true
  }

  const dx = best.x - e.x
  const dy = best.y - e.y
  const d = Math.hypot(dx, dy) || 1
  e.vx = (dx / d) * e.def.speed
  e.vy = (dy / d) * e.def.speed
  e.flip = dx < 0

  if (e.attackCd <= 0 && d < e.radius + best.radius + 6) {
    e.attackCd = e.def.attackCd
    const j = items.indexOf(best)
    if (j >= 0) {
      /*
       * `hostile` because this is not the player's damage: no crit, and it
       * stays out of the run's damage tally. The lover is fighting, and what
       * the summary should say about the player is what the player did.
       */
      g.damageEnemy(j, e.dmg, (dx / d) * 160, (dy / d) * 160, false, true)
    }
  }
  return true
}

function detonateOn(g: Game, e: Enemy, det: NonNullable<Enemy['def']['detonates']>) {
  g.hostileBlast(e.x, e.y - (e.def.hover ?? 0), det.radius, det.damage)
  const idx = g.enemies.items.indexOf(e)
  if (idx >= 0) g.enemies.removeAt(idx)
}

/**
 * The car's contribution to the war effort.
 *
 * Anything it is currently inside takes a hit, on a short cooldown so one body
 * is not deleted sixty times a second. Enemies get `plough`, the player gets
 * the car's ordinary contact damage through the normal path.
 */
function ploughThrough(g: Game, carIndex: number, car: Enemy) {
  const hit = car.def.plough ?? 0
  if (hit <= 0 || car.attackCd > 0) return
  const reach = car.radius + 16
  let struck = false
  for (let j = g.enemies.items.length - 1; j >= 0; j--) {
    if (j === carIndex) continue
    const o = g.enemies.items[j]
    if (o.def.behavior === 'car') continue
    if (Math.hypot(o.x - car.x, o.y - car.y) > reach + o.radius) continue
    const push = car.vx > 0 ? 1 : -1
    g.damageEnemy(j, hit, push * 260, (Math.random() - 0.5) * 120, false, true)
    struck = true
  }
  if (struck) car.attackCd = 0.12
}

/**
 * O NOIVO CINZENTO — three phases, gated on remaining health.
 * Phase 1: walk you down. Phase 2: + radial volleys. Phase 3: + calls guests.
 */
/**
 * A MICROSOFT.
 *
 * TWO PHASES that play differently rather than scaling.
 *
 * PHASE ONE is a heavy: slow, enormous, and it shakes the ground every step —
 * the shake is on a walk clock, not a timer, so it only happens when the thing
 * is actually moving and reads as weight rather than as ambience. It throws
 * windows that come back, and periodically it RUSHES. The rush is a grab, and
 * it is the whole reason the phase exists: everything else in this game is
 * solved by moving, and for a second and a half this is not.
 *
 * PHASE TWO, under half health, drops the grab entirely and becomes about the
 * floor. It pulses rings of area damage out of its own footprint and summons
 * employees who do the same on a shorter fuse. Nothing here can hold you, but
 * standing still stops being an option.
 *
 * `state` is the attack clock, `burstCd` the walk clock, `fuse` the rush
 * timer, and `awake` marks "currently rushing" — reusing the enemy fields that
 * already exist rather than widening the struct for one boss.
 */
/**
 * O BEHOLDER DA CLT — he spins, and he is hiring.
 *
 * ONE IDEA, DONE LITERALLY. He turns on the spot and throws contracts out of
 * wherever he happens to be pointing, so what leaves him is a rotating spray
 * rather than an aimed fan. The renderer rotates the actual sprite off the
 * same `state` this fires from (see `drawEnemy`), which is the whole reason
 * the pattern is readable: the thing you dodge and the thing you are looking
 * at are visibly the same rotation.
 *
 * TWO SPEEDS, ALTERNATING. A slow sweep you can walk out of, then a fast one
 * you have to already be out of. A single constant spin is a pattern the
 * player solves once and then ignores; changing the rate is what makes them
 * keep reading it.
 *
 * He closes SLOWLY and never charges. Everything dangerous about him is in
 * the air, so a boss that also chased would just be pushing the player out of
 * the room they have to fight him in.
 */
/**
 * SECONDS OF WIND-UP before the Beholder's fast half.
 *
 * Exported so the renderer draws the tell over exactly the window the AI is
 * actually holding fire for. Two copies of this number would drift the first
 * time either was tuned, and a telegraph that is out of step with the thing it
 * telegraphs is worse than none.
 */
export const BEHOLDER_WINDUP = 1.1

function updateBeholder(g: Game, e: Enemy, dt: number, nx: number, ny: number, dist: number) {
  // He drifts toward you, and stops well short: the fight is the pattern.
  const closing = dist > 200 ? 1 : dist < 140 ? -0.6 : 0
  e.vx = nx * e.def.speed * closing
  e.vy = ny * e.def.speed * closing

  /*
   * `phase` is the whole state machine: how far round he has turned. It drives
   * the firing angle here and the sprite's rotation in the renderer, so the
   * two can never disagree about which way he is facing.
   */
  /*
   * TWO SPEEDS, AND THE CHANGE IS TELEGRAPHED.
   *
   * The rate flipped silently every seven seconds, which is the one thing a
   * rotating pattern must never do: the player reads the gap coming round,
   * commits to a path through it, and the gap moves. That is not difficulty,
   * it is a lie about the pattern.
   *
   * `burstCd` is how long until it changes, written every frame and read by
   * the renderer — one number, so the wind-up on screen and the moment it
   * actually happens cannot drift apart. See `drawEnemy`.
   */
  const SPIN_PERIOD = 7
  const t = g.time % (SPIN_PERIOD * 2)
  const fast = t >= SPIN_PERIOD
  e.burstCd = (fast ? SPIN_PERIOD * 2 : SPIN_PERIOD) - t

  // He gathers himself before the fast half, and the spin drops away with it.
  const winding = e.burstCd < BEHOLDER_WINDUP && !fast
  const rate = fast ? 3.4 : winding ? 0.35 : 1.5
  e.phase += rate * dt

  e.state -= dt
  if (e.state > 0) return
  // Nothing comes out of him while he is winding up: the pause is the tell.
  if (winding) { e.state = 0.05; return }
  e.state = fast ? 0.09 : 0.16

  /*
   * THREE ARMS, evenly spaced, so the spray closes the room rather than
   * sweeping one side of it. Alternating speeds already give the player a
   * rhythm; a single arm would also give them a permanently safehalf of the
   * arena to stand in.
   */
  const ARMS = 3
  for (let i = 0; i < ARMS; i++) {
    const a = e.phase + (i / ARMS) * Math.PI * 2
    g.spawnBullet(
      e.x + Math.cos(a) * 26, e.y - 20 + Math.sin(a) * 14,
      Math.cos(a) * 210, Math.sin(a) * 210,
      e.dmg * 0.45, 0, 7, 0, false, 'clt', 900,
    )
  }
  g.audio.play('shootEnemy', { volume: 0.35, rate: 1.2, throttle: 0.1, maxVoices: 2 })
}

function updateMicrosoft(
  g: Game, e: Enemy, dt: number,
  nx: number, ny: number, dist: number, hidden: boolean,
) {
  const p = g.player
  /*
   * PHASE IS THE BAR, not a health fraction.
   *
   * It used to flip at half health, which meant the transformation happened
   * somewhere in the middle of a bar with nothing to mark it. Now the first
   * bar IS phase one: emptying it detonates the thing and hands you a fresh
   * one, and the second fight starts exactly where the first ended.
   */
  const phaseTwo = e.barsLeft <= 1

  /*
   * The change of form, announced once.
   *
   * `broken` is what the renderer reads to swap to the second sheet, so
   * setting it here is what makes the thing visibly melt. Guarded on the edge
   * rather than assigned every frame so the line and the shake fire once.
   */
  if (phaseTwo && !e.broken) {
    e.broken = true
    e.flash = 0.5
    g.camera.addShake(1)
    g.audio.play('bossSpawn', { volume: 1 })
    g.bossSay('microsoft', 'phase')
    g.say('Ele derreteu. E agora tá pior.')
  }

  // ---- THE RUSH, phase one only -----------------------------------------
  if (e.awake) {
    // Committed: it does not steer once it has started, so a rush can be
    // sidestepped. A homing grab would be a coin flip rather than a dodge.
    e.x += e.vx * dt
    e.y += e.vy * dt
    g.camera.addShake(0.22)
    e.fuse -= dt
    if (dist < e.radius + 26 && p.grabT <= 0 && p.invuln <= 0) {
      p.grabT = 2.4
      p.grabStruggle = 0
      p.grabNext = 'a'
      p.grabbedBy = e
      p.grabbedUid = e.uid
      e.awake = false
      e.vx = 0; e.vy = 0
      g.camera.addShake(0.9)
      g.audio.play('bossSpawn', { volume: 0.9 })
      g.bossSay('microsoft', 'grab')
      g.say('ME LARGA, DESGRAÇA!')
    }
    if (e.fuse <= 0) { e.awake = false; e.vx = 0; e.vy = 0; e.state = 1.8 }
    return
  }

  // Holding someone: stand still and let the struggle play out.
  if (p.grabbedBy === e && p.grabT > 0) { e.vx = 0; e.vy = 0; return }

  // ---- WALKING ------------------------------------------------------------
  const speed = e.def.speed * (phaseTwo ? 1.25 : 1) * (hidden ? 0 : 1)
  const closing = dist > 70 ? 1 : 0
  e.vx = nx * speed * closing
  e.vy = ny * speed * closing

  /*
   * The ground shakes on the step, not on a timer. Tied to whether it is
   * actually moving, so a stationary boss is a quiet one and the shake reads
   * as the weight of the thing rather than as a rumble someone left on.
   */
  if (closing) {
    e.burstCd -= dt
    if (e.burstCd <= 0) {
      e.burstCd = phaseTwo ? 0.5 : 0.72
      g.camera.addShake(0.34)
      g.audio.play('boom', { volume: 0.28, throttle: 0.4, maxVoices: 1 })
    }
  }

  // ---- ATTACKS ------------------------------------------------------------
  e.state -= dt
  if (e.state > 0) return

  if (!phaseTwo) {
    // A rush every third opening, so it is a threat you are waiting for rather
    // than one that never comes.
    if (Math.random() < 0.34 && dist < 460) {
      e.state = 6
      e.awake = true
      e.fuse = 1.5
      const len = Math.hypot(p.x - e.x, p.y - e.y) || 1
      e.vx = ((p.x - e.x) / len) * 420
      e.vy = ((p.y - e.y) / len) * 420
      e.flip = e.vx < 0
      g.camera.addShake(0.5)
      g.say('Ele vem! CORRE!')
      return
    }

    /*
     * A FAN, AND EVERY OTHER TIME A CLOSED RING WITH IT.
     *
     * A fan alone is solved by standing anywhere except in front of him, which
     * is what phase one had been for its whole life: seven boomerangs through
     * the player and a wide safe arc behind them. The ring is aimed at nobody
     * and closes that arc — so the answer stops being "pick a side" and
     * becomes "keep moving through the gaps", which is what a bullet hell is.
     *
     * `phase` counts the openings so the two alternate rather than rolling,
     * because a pattern you can learn the rhythm of is a pattern you can play
     * against, and a random one is only ever survived.
     */
    e.state = 2.9
    e.phase++
    throwWindows(g, e, 9, 300, 2.1)
    if (e.phase % 2 === 0) windowRing(g, e, 12, 210, 2.4)
    return
  }

  // ---- PHASE TWO: the floor -----------------------------------------------
  e.state = 2.2

  // A ring out of its own footprint.
  g.hostileBlast(e.x, e.y, 150, e.dmg * 0.95)
  g.camera.addShake(0.55)

  /*
   * AND THE AIR IS NEVER CLEAR EITHER.
   *
   * Three overlapping patterns rather than one, on the same opening: a fan
   * through the player, a closed ring off his own footprint, and two spiral
   * arms. They are chosen to fail in different directions — the fan punishes
   * standing in front, the ring punishes standing still, and the spiral
   * punishes circling him, which was the answer to the other two.
   *
   * The spiral is the one that makes this phase feel like a different fight.
   * It is the only pattern in the game that arrives CURVED, so the gap you
   * read is not the gap that is there a second later.
   */
  e.phase++
  throwWindows(g, e, 14, 340, 1.9)
  windowRing(g, e, 16, 240, 2.2)
  windowSpiral(g, e, 2, 7, 290, e.phase * 0.7)

  // And the staff.
  const live = g.enemies.items.reduce(
    (n, o) => n + (o.def.id === 'funcionario' ? 1 : 0), 0,
  )
  const want = Math.min(4, 7 - live)
  for (let i = 0; i < want; i++) {
    const a = Math.random() * Math.PI * 2
    g.spawnEnemy(ENEMIES.funcionario, e.x + Math.cos(a) * 80, e.y + Math.sin(a) * 80)
  }
}

/**
 * A CLOSED RING OF WINDOWS, aimed at nobody.
 *
 * The counterpart to the fan. A fan says "not in front of him"; this says "not
 * standing still" — it leaves the same gap in every direction, so the only way
 * through is to be moving when it arrives. Slower than the fan on purpose: two
 * patterns at the same speed arrive as one wall, and at different speeds they
 * arrive as two problems.
 */
function windowRing(g: Game, e: Enemy, count: number, speed: number, flight: number) {
  // Offset by the boss's own seed so two openings are never the same ring.
  const spin = e.seed * Math.PI * 2 + g.time * 0.5
  for (let i = 0; i < count; i++) {
    const a = spin + (i / count) * Math.PI * 2
    throwOneWindow(g, e, a, speed, flight)
  }
}

/**
 * ARMS OF WINDOWS, curving away from him.
 *
 * Each arm is a line of boomerangs fired along a turning angle with staggered
 * speeds, so what leaves him straight arrives bent. No per-frame state: the
 * curve is baked into the spread of speeds at the moment they are thrown,
 * which is why this costs one loop and not a spiral emitter.
 *
 * It is the only pattern here that is not solved by circling him, because the
 * arm sweeps the way you are running.
 */
function windowSpiral(
  g: Game, e: Enemy, arms: number, per: number, speed: number, offset: number,
) {
  for (let arm = 0; arm < arms; arm++) {
    const base = offset + (arm / arms) * Math.PI * 2
    for (let i = 0; i < per; i++) {
      const t = i / per
      // The angle walks as the speed drops, which is what draws the curve.
      throwOneWindow(g, e, base + t * 1.5, speed * (1 - t * 0.42), 2.3 + t * 0.5)
    }
  }
}

/** A fan of boomerangs, evenly spread and aimed through the player. */
function throwWindows(g: Game, e: Enemy, count: number, speed: number, flight: number) {
  const p = g.player
  const aim = Math.atan2(p.y - e.y, p.x - e.x)
  for (let i = 0; i < count; i++) {
    const spread = (i / Math.max(1, count - 1) - 0.5) * 1.9
    throwOneWindow(g, e, aim + spread, speed, flight)
  }
  g.camera.addShake(0.3)
  g.audio.play('shootEnemy', { volume: 0.5, throttle: 0.2 })
}

/**
 * ONE WINDOW, thrown along an angle.
 *
 * Pulled out of the fan so the ring and the spiral throw the same object with
 * the same boomerang set-up — three patterns that agree about what a window
 * IS, rather than three copies of the same six lines drifting apart.
 */
function throwOneWindow(g: Game, e: Enemy, a: number, speed: number, flight: number) {
  const b = g.spawnBullet(
    e.x, e.y - 26,
    Math.cos(a) * speed, Math.sin(a) * speed,
    e.dmg * 0.5, 0, 9, 0, false, 'janela', 9999,
  )
  if (!b) return
  b.boomerang = flight
  b.age = 0
  b.bmSpeed = speed
  b.bmX = Math.cos(a)
  b.bmY = Math.sin(a)
}

function updateBoss(
  g: Game, e: Enemy, dt: number,
  nx: number, ny: number, dist: number, hidden: boolean,
) {
  const frac = e.hp / e.maxHp
  const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3

  const closing = dist > 60 && !hidden ? 1 : 0
  e.vx = nx * e.def.speed * closing * (1 + (phase - 1) * 0.18)
  e.vy = ny * e.def.speed * closing * (1 + (phase - 1) * 0.18)

  e.state -= dt
  if (e.state <= 0) {
    e.state = phase === 1 ? 3.4 : phase === 2 ? 2.4 : 1.8

    // Radial volley — a ring of slow bullets you walk between.
    const count = 10 + phase * 4
    const spin = e.seed * Math.PI * 2 + g.time
    for (let i = 0; i < count; i++) {
      const a = spin + (i / count) * Math.PI * 2
      g.spawnBullet(e.x, e.y - 20, Math.cos(a) * 128, Math.sin(a) * 128, e.dmg * 0.55, 0, 5, 0, false)
    }
    g.camera.addShake(0.35)

    // Phase 3: the groom calls his guests.
    if (phase === 3) {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2
        g.spawnEnemy(ENEMIES.tripa_seca, e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90)
      }
    }
  }
  if (Math.abs(e.vx) > 4) e.flip = e.vx < 0
}

/* ========================================================================= *
 *                                O CHARÁ                                    *
 * ========================================================================= */

/**
 * THE LAST FIGHT, and the only one in the game that is six fights.
 *
 * `e.stage` is the whole of the state, and it is advanced by `charaAdvance` in
 * `act3.ts` rather than in here — this function only ever answers "given the
 * body he is currently wearing, what does it do this frame". Splitting it that
 * way is what keeps a six-stage boss readable: the transitions are one switch
 * in one file, and the behaviours are one switch in another.
 *
 *   0  ON FOOT   — same height as the player, and all he does is shoot.
 *   1  THE RUN   — untouchable, sprinting for the machine in the corner.
 *   2  THE MECHA — slow, huge, missiles, and it GRABS. D then A, the mirror
 *                  of the Microsoft's, so act two's muscle memory is exactly
 *                  wrong here.
 *   3  ON FOOT   — again, faster, and much less patient.
 *   4  THE SHIP  — invulnerable, dropping ordnance, while the waves come back
 *                  and three pillars need breaking somewhere else.
 *   5  THE SHIP  — shield down, raking the floor with green.
 *   6  THE SWORD — no ranged attack at all. He runs at you. That is it.
 */
function updateChara(
  g: Game, e: Enemy, dt: number,
  nx: number, ny: number, dist: number, hidden: boolean,
) {
  switch (e.stage) {
    case 0: charaFoot(g, e, dt, nx, ny, dist, hidden, false); return
    case 1: charaRun(g, e, dt); return
    case 2: charaMecha(g, e, dt, nx, ny, dist, hidden); return
    case 3: charaFoot(g, e, dt, nx, ny, dist, hidden, true); return
    case 4:
    case 5: charaNave(g, e, dt, nx, ny); return
    case 6: charaSword(g, e, dt, nx, ny, dist); return
  }
}

/**
 * ON FOOT. He keeps his distance and shoots, which is all stage one is.
 *
 * The spacing IS the fight: he backs off inside a hundred and seventy units
 * and closes outside three hundred, so there is a band he wants to be in and
 * the player's job is to take it away from him. `angry` is the second time
 * round — same shape, half the patience.
 */
function charaFoot(
  g: Game, e: Enemy, dt: number,
  nx: number, ny: number, dist: number, hidden: boolean, angry: boolean,
) {
  const near = angry ? 150 : 175
  const far = angry ? 270 : 310
  const speed = e.def.speed * (hidden ? 0.35 : 1)

  // Toward, away, or sideways. The strafe is what stops him standing in one
  // place trading shots, which at this size would just be a turret.
  if (dist < near) { e.vx = -nx * speed; e.vy = -ny * speed }
  else if (dist > far) { e.vx = nx * speed; e.vy = ny * speed }
  else {
    const s = Math.sin(g.time * 1.6 + e.seed * 6.283) > 0 ? 1 : -1
    e.vx = -ny * speed * s
    e.vy = nx * speed * s
  }
  if (Math.abs(e.vx) > 4) e.flip = e.vx < 0

  /*
   * THE FIRING POSE, held for a beat after each volley.
   *
   * `awake` is what the renderer reads to swap to `sheetActive`, and `burstCd`
   * is doing nothing else in this stage — so the recoil pose costs no new
   * state at all.
   */
  if (e.burstCd > 0) { e.burstCd -= dt; e.awake = true } else { e.awake = false }

  e.state -= dt
  if (e.state > 0) return

  e.burstCd = 0.3
  e.phase++
  /*
   * Every third volley is a RING instead of a fan, so the stage cannot be
   * solved by standing off to one side. The fan punishes being in front of
   * him; the ring punishes standing still anywhere.
   */
  if (e.phase % 3 === 0) {
    e.state = angry ? 1.5 : 1.9
    ring(g, e, angry ? 18 : 13, 150, e.dmg * 0.42, 'glow')
    g.audio.play('shootEnemy', { volume: 0.55, throttle: 0.2 })
    return
  }

  e.state = angry ? 0.78 : 1.15
  fan(g, e, angry ? 5 : 3, angry ? 0.5 : 0.32, 280, e.dmg * 0.4, 'glow')
  g.audio.play('shootEnemy', { volume: 0.45, throttle: 0.15 })
}

/**
 * THE RUN. He is not fighting; he is going to get into the machine.
 *
 * Untouchable for the length of it, and `shielded` rather than a timer,
 * because this has to end when he ARRIVES — how long that takes depends on
 * where he happened to be standing when the bar emptied.
 */
function charaRun(g: Game, e: Enemy, dt: number) {
  const to = g.act3.mecha
  if (!to) { e.stage = 2; return }

  const dx = to.x - e.x
  const dy = to.y - e.y
  const d = Math.hypot(dx, dy) || 1
  e.vx = (dx / d) * 330
  e.vy = (dy / d) * 330
  e.flip = dx < 0

  // A dust kick every few strides, so a boss sprinting across the room reads
  // as effort rather than as a sprite being slid sideways.
  e.state -= dt
  if (e.state <= 0) {
    e.state = 0.13
    g.spawnFx('ring', e.x, e.y, 0.4)
  }

  if (d > 26) return

  // ---- HE IS IN ---------------------------------------------------------
  g.act3.mecha = null
  const n = g.extraProps.findIndex((prop) => prop.icon === 'empty_mecha')
  if (n >= 0) g.extraProps.splice(n, 1)

  e.def = ENEMIES.chara_mecha
  e.stage = 2
  e.barsLeft = 4
  e.maxHp = ENEMIES.chara_mecha.hp
  e.hp = e.maxHp
  e.shielded = false
  e.broken = false
  e.invulnT = 1
  e.state = 1.6
  e.phase = 0
  e.stealCd = 3
  e.x = to.x
  e.y = to.y
  g.showBanner('O CHARÁ — MECHA', 'Ele entrou na coisa. Claro que entrou.')
  g.audio.play('bossSpawn', { volume: 1 })
  g.camera.addShake(1.4)
  g.spawnBlast(e.x, e.y, 130)
  g.say('ELE ENTROU NA COISA!')
  g.push()
}

/** How close you have to get before the machine reaches down and takes you. */
const MECHA_GRAB_RANGE = 92

/**
 * THE MECHA. A bullet hell with missiles, and one very good reason not to
 * close the distance.
 *
 * THE GRAB IS INVERTED. The Microsoft's mash is A then D; this one is D then
 * A. That is not a difficulty change — the same number of presses gets you
 * out — it is there because the player has spent a whole act training a
 * rhythm, and the last boss should make them think about the input again
 * instead of running the pattern already in their hands.
 */
function charaMecha(
  g: Game, e: Enemy, dt: number,
  nx: number, ny: number, dist: number, hidden: boolean,
) {
  const p = g.player

  // Half health, and the machine is visibly coming apart. `broken` is what the
  // renderer reads to swap to the damaged sheet.
  if (!e.broken && e.hp <= e.maxHp * 0.5) {
    e.broken = true
    e.flash = 0.5
    g.camera.addShake(0.9)
    g.audio.play('boom', { volume: 0.8 })
    g.say('Tá fumaçando! Continua!')
  }

  // Holding someone: stand still and let the struggle play out.
  if (p.grabbedBy === e && p.grabT > 0) { e.vx = 0; e.vy = 0; return }

  const speed = e.def.speed * (hidden ? 0 : 1)
  const closing = dist > 90 ? 1 : 0
  e.vx = nx * speed * closing
  e.vy = ny * speed * closing
  if (Math.abs(e.vx) > 4) e.flip = e.vx < 0

  // The walk shakes the floor, on the step rather than on a timer.
  if (closing) {
    e.burstCd -= dt
    if (e.burstCd <= 0) {
      e.burstCd = 0.62
      g.camera.addShake(0.3)
      g.audio.play('boom', { volume: 0.24, throttle: 0.4, maxVoices: 1 })
    }
  }

  // ---- THE GRAB ---------------------------------------------------------
  e.stealCd -= dt
  if (e.stealCd <= 0 && dist < MECHA_GRAB_RANGE && p.grabT <= 0 && p.invuln <= 0) {
    e.stealCd = 7
    p.grabT = 2.4
    p.grabStruggle = 0
    // D FIRST. See the note above.
    p.grabNext = 'd'
    p.grabbedBy = e
    p.grabbedUid = e.uid
    e.vx = 0; e.vy = 0
    g.camera.addShake(0.9)
    g.audio.play('bossSpawn', { volume: 0.9 })
    // The hand closing, aimed from the machine at whoever it just caught.
    g.spawnFx('grab', (e.x + p.x) / 2, (e.y + p.y) / 2 - 10, 1,
      Math.atan2(p.y - e.y, p.x - e.x))
    g.bossSay('chara_mecha', 'grab')
    g.say('A MÃO! A MÃO DA COISA!')
    return
  }

  // ---- ORDNANCE ---------------------------------------------------------
  e.state -= dt
  if (e.state > 0) return
  e.phase++

  if (e.phase % 3 === 0) {
    // A ring, to punish standing still while dodging the missiles.
    e.state = 2.6
    ring(g, e, 20, 132, e.dmg * 0.34, 'glow')
    g.audio.play('shootEnemy', { volume: 0.6, throttle: 0.2 })
    return
  }

  e.state = 2.3
  missiles(g, e, e.broken ? 7 : 5)
}

/**
 * MISSILES. Launched wide and made to come back around.
 *
 * They are fired at a broad spread rather than at the player, and it is the
 * TURN RATE that brings them in — so a volley opens like a flower, folds
 * toward wherever the player is by then, and is beaten by cutting inside the
 * arc rather than by outrunning it. Fired straight at him they would be a fan
 * of bullets with extra steps.
 */
function missiles(g: Game, e: Enemy, count: number) {
  const p = g.player
  const aim = Math.atan2(p.y - 12 - e.y, p.x - e.x)
  for (let i = 0; i < count; i++) {
    const a = aim + (i / Math.max(1, count - 1) - 0.5) * 2.5
    const b = g.spawnBullet(
      e.x, e.y - 30,
      Math.cos(a) * 190, Math.sin(a) * 190,
      e.dmg * 0.46, 0, 7, 0, false, 'missile', 1400,
    )
    if (b) {
      b.homing = 1.15
      b.spin = a
    }
  }
  g.camera.addShake(0.35)
  g.audio.play('shootEnemy', { volume: 0.7, throttle: 0.2 })
}

/**
 * THE NAVÉ MÃE, in both of its stages.
 *
 * Stage four is not a fight with the ship at all — it cannot be hurt, and
 * everything it does exists to make crossing the room to the pillars cost
 * something. Stage five is the ship: shield down, waves gone, and the floor
 * raked with green.
 */
function charaNave(g: Game, e: Enemy, dt: number, nx: number, ny: number) {
  const arena = g.activeArena

  /*
   * IT DRIFTS RATHER THAN CHASES.
   *
   * A mothership that walks toward you is just a very large man. Keeping it
   * loosely over the middle of the room, leaning a little in the player's
   * direction, makes the room feel OCCUPIED instead of pursued — and it keeps
   * the corners reachable, which stage four depends on.
   */
  if (arena) {
    const hx = arena.centerX + nx * arena.halfW * 0.3 - e.x
    const hy = arena.centerY + ny * arena.halfH * 0.3 - e.y
    const hd = Math.hypot(hx, hy) || 1
    const pull = Math.min(1, hd / 140)
    e.vx = (hx / hd) * e.def.speed * pull
    e.vy = (hy / hd) * e.def.speed * pull
  }
  if (Math.abs(e.vx) > 3) e.flip = e.vx < 0

  // ---- STAGE FOUR: shielded, and dropping things ------------------------
  if (e.stage === 4) {
    e.shielded = true
    if (pillarsLeft(g) === 0) {
      e.stage = 5
      e.shielded = false
      e.flash = 0.7
      e.invulnT = 0.8
      e.state = 1.4
      e.phase = 0
      /*
       * The room empties again. A bullet hell shared with forty aliens is not
       * a bullet hell, it is soup — and the last stage of the last fight
       * should be readable.
       */
      g.waveOverride = null
      g.waveHold = true
      g.sweepField(e)
      g.camera.addShake(1.5)
      g.audio.play('bossSpawn', { volume: 1 })
      g.bossSay('chara_nave', 'phase')
      g.showBanner('A NAVÉ MÃE', 'Caiu o escudo. Agora ela sente.')
      g.say('CAIU! ATIRA NELA AGORA!')
      g.push()
      return
    }

    e.state -= dt
    if (e.state > 0) return
    e.state = 3.1

    /*
     * BOMBS, thrown where the player is GOING rather than where they are.
     *
     * Led by half a second: short enough to be beaten by changing direction,
     * long enough to punish running in a straight line to the next pillar —
     * which is exactly the thing this stage is about.
     */
    const p = g.player
    for (let i = 0; i < 3; i++) {
      g.spawnBomb(
        p.x + p.vx * 0.5 + (Math.random() - 0.5) * 150,
        p.y + p.vy * 0.5 + (Math.random() - 0.5) * 150,
        e.dmg * 0.8, 92,
        { x: e.x, y: e.y - 30 },
      )
    }
    g.audio.play('shootEnemy', { volume: 0.6, throttle: 0.3 })
    return
  }

  // ---- STAGE FIVE: the rake ---------------------------------------------
  if (!e.broken && e.hp <= e.maxHp * 0.5) {
    e.broken = true
    e.flash = 0.6
    g.camera.addShake(1)
    g.audio.play('boom', { volume: 0.9 })
    g.say('Tá caindo pedaço dela!')
  }

  /*
   * THREE ARMS, TURNING. `phase` is the sweep angle and it only ever goes one
   * way, so the safe wedge travels steadily around the room and the player is
   * always walking somewhere rather than parking.
   *
   * It REVERSES at half health, which is the cheapest possible second pattern
   * and genuinely works: everyone has learned to walk against the spin by
   * then, and against it is suddenly into it.
   */
  e.burstCd -= dt
  if (e.burstCd <= 0) {
    e.burstCd = 0.14
    e.phase += e.broken ? -0.30 : 0.24
    const arms = e.broken ? 4 : 3
    for (let i = 0; i < arms; i++) {
      const a = e.phase + (i / arms) * Math.PI * 2
      /*
       * Range is the room, not the horizon. Six hundred units reaches the far
       * wall from the middle; anything longer just leaves spent rays hanging
       * in a room that is already three arms thick, and the pattern stops
       * reading as a spiral you can walk out of.
       */
      g.spawnBullet(
        e.x, e.y - 34,
        Math.cos(a) * 168, Math.sin(a) * 168,
        e.dmg * 0.3, 0, 4, 0, false, 'raio', 620,
      )
    }
    g.audio.play('shootEnemy', { volume: 0.3, throttle: 0.22, maxVoices: 2 })
  }

  // And an aimed volley on top, so hugging the safe wedge is not free either.
  e.state -= dt
  if (e.state <= 0) {
    e.state = 4.2
    fan(g, e, 7, 1.5, 240, e.dmg * 0.36, 'raio')
    g.camera.addShake(0.4)
  }
}

/**
 * THE SWORD. He runs at you swinging, and there is nothing else in the state.
 *
 * WIND-UP, COMMIT, RECOVER — the oldest melee shape there is, and the right
 * one to end on. He telegraphs by stopping dead; the dash does not steer once
 * it has started, so it is beaten by moving LATE rather than early; and the
 * recovery is the window you are meant to shoot into. After twenty minutes of
 * reading bullet patterns, the last thing the game asks for is the first thing
 * it ever taught.
 */
function charaSword(g: Game, e: Enemy, dt: number, nx: number, ny: number, dist: number) {
  const p = g.player

  // ---- COMMITTED --------------------------------------------------------
  if (e.fuse > 0) {
    e.fuse -= dt
    e.x += e.vx * dt
    e.y += e.vy * dt
    /*
     * THE BLADE. An arc laid along the dash, not a trail of dots.
     *
     * Thrown every third frame or so rather than every one: the sheet is a
     * whip that fades over its own forty-five frames, so overlapping three of
     * them is a swing and overlapping twenty is a wall.
     */
    if (Math.random() < 0.34) {
      g.spawnFx('slash', e.x, e.y - 12, 0.8, Math.atan2(e.vy, e.vx))
    }
    if (dist < e.radius + 22 && p.invuln <= 0) {
      g.damagePlayer(e.dmg)
      g.camera.addShake(0.8)
      e.fuse = 0
      e.state = 0.9
    }
    if (e.fuse <= 0) { e.vx = 0; e.vy = 0; e.state = Math.max(e.state, 0.7) }
    return
  }

  e.state -= dt

  // ---- WINDING UP: dead still, which is the tell ------------------------
  if (e.awake) {
    e.vx = 0; e.vy = 0
    if (e.state > 0) return
    e.awake = false
    e.fuse = 0.62
    const len = Math.hypot(p.x - e.x, p.y - e.y) || 1
    e.vx = ((p.x - e.x) / len) * 620
    e.vy = ((p.y - e.y) / len) * 620
    e.flip = e.vx < 0
    g.camera.addShake(0.45)
    g.audio.play('dash', { volume: 0.8, rate: 0.8 })
    return
  }

  // ---- STALKING ---------------------------------------------------------
  e.vx = nx * e.def.speed
  e.vy = ny * e.def.speed
  if (Math.abs(e.vx) > 4) e.flip = e.vx < 0
  if (e.state > 0) return

  e.awake = true
  e.state = 0.42
  e.flash = 0.25
  g.camera.addShake(0.2)
  g.audio.play('shootEnemy', { volume: 0.5, rate: 0.7 })
}

/** A spread of shots through the player. */
function fan(
  g: Game, e: Enemy, count: number, spread: number,
  speed: number, damage: number, kind: 'glow' | 'raio',
) {
  const p = g.player
  const aim = Math.atan2(p.y - 12 - e.y, p.x - e.x)
  for (let i = 0; i < count; i++) {
    const a = aim + (i / Math.max(1, count - 1) - 0.5) * spread
    g.spawnBullet(
      e.x, e.y - (e.def.hover ?? 0) - 16,
      Math.cos(a) * speed, Math.sin(a) * speed,
      damage, 0, 5, 0, false, kind, 800,
    )
  }
}

/** A closed ring of shots, aimed at nobody. */
function ring(
  g: Game, e: Enemy, count: number,
  speed: number, damage: number, kind: 'glow' | 'raio',
) {
  const spin = e.seed * Math.PI * 2 + g.time
  for (let i = 0; i < count; i++) {
    const a = spin + (i / count) * Math.PI * 2
    g.spawnBullet(
      e.x, e.y - (e.def.hover ?? 0) - 16,
      Math.cos(a) * speed, Math.sin(a) * speed,
      damage, 0, 5, 0, false, kind, 700,
    )
  }
  g.camera.addShake(0.25)
}
