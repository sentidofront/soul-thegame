import type { Game } from '../Game'
import type { Arena, Formation, SetPiece, WaveDef } from '../types'
import { CONFIG } from '../config'
import { ENEMIES } from '../data/enemies'
import { RANDOM_EVENTS, STAGES, waveAt } from '../data/stages'

/**
 * THE DIRECTOR.
 *
 * It runs a SCHEDULE, not a headcount. Every row of `WAVES` takes over at a
 * point along the journey and says three things: how many bodies to hold on
 * the field, how often to add more, and which species this stretch is about.
 *
 * That is lifted from Vampire Survivors, and the part worth lifting is the
 * quota rule rather than the wave list: below quota the director fills as fast
 * as it can, and AT or above quota it still adds one of each species in the
 * cast every interval. Pressure never stops arriving; the real ceiling is
 * CONFIG.MAX_ENEMIES. That is why the cap is load-bearing here and not a
 * safety net.
 *
 * What it replaced was a density scalar plus per-species kill quotas. Two
 * faults killed that design. The quotas were keyed to KILLS, so every change
 * to enemy health silently moved them and the bestiary's pacing broke — twice.
 * And a single weight table over everything unlocked meant species arrived
 * blended, so no stretch of road was ever ABOUT anything.
 *
 * Three things arrive, and they feel different on purpose:
 *
 *   TRICKLE   — the steady quota fill, mostly from where he is looking.
 *   SET PIECE — authored moments: the stampede, the glowie cordon, the car
 *               run. Exempt from the cap, because a moment you wrote should
 *               always land.
 *   BOSS      — sweeps the field and closes a barrier.
 */

const BOSS_LINES: Record<string, string> = {
  manifestacao: 'A cidade inteira tá com a cabeça virada. Passa por cima.',
  o_noivo: 'Ele veio buscar o Soul. Não vai levar.',
}

export function updateSpawner(g: Game, dt: number) {
  const p = g.player

  recycle(g)
  bossGate(g)

  // A sealed arena has no trickle and no set pieces — the boss is the only
  // source of anything inside it.
  if (g.activeArena?.sealed) return
  /*
   * ACT THREE HOLDS THE DIRECTOR OFF ENTIRELY.
   *
   * Different from a sealed arena, and the difference matters: sealing is a
   * property of the ROOM and lasts the whole fight, while this is a property
   * of the MOMENT — the church turns it on for the timed clear, off again
   * while the mothership's shield is up, and back on for the last stages, all
   * inside the same unsealed room.
   */
  if (g.waveHold) return

  const wave = g.waveOverride ?? waveAt(p.reach)
  if (wave !== g.wave) enterWave(g, wave)

  runSetPiece(g, dt)
  /*
   * NO RANDOM EVENTS INDOORS.
   *
   * The events table is keyed to how far along the journey you are and by act
   * three every row in it has unlocked — including the one that sends a Doido
   * do Carro down the street. Driving a car through the nave of a church while
   * a mothership is parked in it is funny exactly once, and the wave the
   * mothership calls is already the pressure that stretch is supposed to have.
   */
  if (!g.waveOverride) runRandomEvent(g, dt)
  trickle(g, dt, wave)
}

// ---------------------------------------------------------------- RECYCLE --

/**
 * Stragglers left behind. Elites are not deleted — they are moved.
 *
 * Vampire Survivors teleports its bosses back into view rather than letting
 * them despawn, and it is right: the Doido do Carro used to simply evaporate
 * if you outran it, which turned the one enemy that is supposed to be
 * unstoppable into the one you could walk away from.
 */
function recycle(g: Game) {
  const p = g.player
  for (let i = g.enemies.items.length - 1; i >= 0; i--) {
    const e = g.enemies.items[i]
    const far = Math.hypot(e.x - p.x, e.y - p.y) > CONFIG.DESPAWN_RADIUS
    if (!far) continue

    /*
     * The pillars are furniture. Recycling would TELEPORT them — they are
     * elite, and the rule below moves elites back in front of the player
     * rather than deleting them — which would move the three things the
     * player is crossing the room to reach.
     */
    if (e.def.behavior === 'idle') continue

    if (e.def.elite || e === g.bossRef) {
      const ang = Math.atan2(p.aimY, p.aimX) + (Math.random() - 0.5) * 1.2
      const r = ringRadius(g) + 40
      e.x = p.x + Math.cos(ang) * r
      e.y = p.y + Math.sin(ang) * r
      e.kx = 0; e.ky = 0
      continue
    }
    g.enemies.removeAt(i)
  }
}

// ------------------------------------------------------------------ BOSSES --

/**
 * EVERY BOSS THAT IS OWED, not just the current act's.
 *
 * This used to be handed `STAGES[g.stageIndex]` and asked about that one
 * stage. Which is fine right up until the player is somehow already past it —
 * and then the gate is simply never asked about again, the act ends, and the
 * boss is skipped. That is a class of bug rather than one bug: any way of
 * getting `reach` past `endX` without passing through the window is a way of
 * walking around A Manifestação, and `nearest` had one (see `route.ts`).
 *
 * Scanning every stage in order removes the class. A boss that has not been
 * fought and whose line has been crossed is fought, however the player got
 * there and however late it is — the fight is not optional and this is what
 * makes that true rather than hoping.
 */
function bossGate(g: Game) {
  if (g.arenaLocked) return
  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i]
    if (!stage.arena || !stage.boss) continue
    if (g.bossesDone.has(stage.id)) continue
    const arena = g.resolveArena(stage.arena)
    if (g.player.reach <= arena.atDist - arena.halfW + 60) continue
    fireBoss(g, stage, arena)
    return
  }
}

function fireBoss(g: Game, stage: typeof STAGES[number], arena: ReturnType<Game['resolveArena']>) {
  /*
   * THE RING CLOSES ON HIM, if he has already walked past where it was drawn.
   *
   * The failsafe above can fire long after the authored spot, and an arena
   * that seals a piece of road four hundred units BEHIND the player yanks them
   * backwards into a barrier they never saw. So a late gate brings the ring
   * to where they are standing. In an ordinary run this never runs at all —
   * the window is crossed on foot, in order, and the arena is where it was
   * written.
   */
  if (g.player.reach > arena.atDist + arena.halfW) {
    const at = g.chunks.route.pointAt(g.player.reach)
    const shift = Math.round(at.y) - arena.centerY
    arena.centerX = Math.round(at.x)
    arena.centerY = Math.round(at.y)
    arena.camY += shift
    arena.atDist = g.player.reach
  }

  g.bossesDone.add(stage.id)
  g.bossSpawned = true
  g.arenaLocked = true
  g.activeArena = arena
  g.sweepField()

  const def = ENEMIES[stage.boss!]
  g.bossRef = g.spawnEnemy(def, arena.centerX + 30, arena.centerY - 40)
  g.showBanner(def.name, BOSS_LINES[stage.boss!] ?? '')
  g.audio.play('bossSpawn', { volume: 1 })
  g.camera.addShake(1)
  // The barrier closing ends a leg of the journey, so the player arrives
  // whole — otherwise the fight is decided by the walk into it.
  g.player.hp = g.player.maxHp
  g.player.invuln = 2
}

// ------------------------------------------------------------------- WAVES --

function enterWave(g: Game, wave: WaveDef) {
  g.wave = wave
  g.spawnCd = 0
  if (wave.bark) g.say(wave.bark)
  if (wave.event) {
    g.piece = wave.event
    g.pieceLeft = wave.event.repeat ?? 1
    g.pieceCd = 0
  }
}

/** Authored arrivals. They ignore the population cap on purpose. */
function runSetPiece(g: Game, dt: number) {
  if (!g.piece || g.pieceLeft <= 0) return
  g.pieceCd -= dt
  if (g.pieceCd > 0) return

  const piece = g.piece
  g.pieceLeft -= 1
  g.pieceCd = piece.every ?? 0

  spawnFormation(g, piece.formation, piece.count, piece.cast ?? g.wave?.cast ?? {})

  /*
   * And the thing hiding in it. Placed in the SAME formation rather than off
   * to one side, because the whole trick is that it is standing in the middle
   * of the free XP and you did not notice until it was close.
   */
  if (piece.mixin) {
    spawnFormation(g, piece.formation, piece.mixin.count, { [piece.mixin.id]: 1 })
  }

  /*
   * The piece's own line if it was written one, and a general complaint if it
   * was not. An authored moment has something specific to say about itself;
   * everything else just needs somebody to notice it happened.
   */
  if (piece.bark) g.say(piece.bark)
  else g.react('wave', undefined, 22)
  if (piece.shake) g.camera.addShake(piece.shake)
  g.audio.play('wave', { volume: 0.55 })

  if (g.pieceLeft <= 0) g.piece = null
}

/**
 * SOMETHING MIGHT ALWAYS HAPPEN.
 *
 * The wave table is authored, and therefore learnable — right for pacing,
 * wrong for tension once a player has walked the road twice. This fires a
 * piece from the pool on its own clock so the journey is never entirely known.
 *
 * The interval is deliberately wide. A surprise on a predictable timer is just
 * another schedule.
 */
function runRandomEvent(g: Game, dt: number) {
  g.eventCd -= dt
  if (g.eventCd > 0) return
  g.eventCd = 26 + Math.random() * 30

  const open = RANDOM_EVENTS.filter((e) => (e.fromX ?? 0) <= g.player.reach)
  if (open.length === 0) return
  let total = 0
  for (const e of open) total += e.weight
  let r = Math.random() * total
  let picked = open[open.length - 1]
  for (const e of open) { r -= e.weight; if (r <= 0) { picked = e; break } }

  // Straight into the piece slot, so it uses the same repeat machinery.
  g.piece = picked
  g.pieceLeft = picked.repeat ?? 1
  g.pieceCd = 0
}

// ----------------------------------------------------------------- TRICKLE --

/**
 * The quota fill.
 *
 * Below quota it spends credit to catch up quickly; at or above it, one of
 * each species in the cast per interval. Both paths stop dead at the cap.
 */
function trickle(g: Game, dt: number, wave: WaveDef) {
  if (g.enemies.count >= CONFIG.MAX_ENEMIES) return

  if (g.enemies.count < wave.quota) {
    g.spawnCredit += dt * 22
    while (g.enemies.count < wave.quota && g.spawnCredit >= 1
      && g.enemies.count < CONFIG.MAX_ENEMIES) {
      g.spawnCredit -= 1
      spawnFromCast(g, wave.cast)
    }
    return
  }

  g.spawnCredit = 0
  g.spawnCd -= dt
  if (g.spawnCd > 0) return
  g.spawnCd = wave.interval

  /*
   * AS MANY BODIES AS THE ROW HAS SPECIES, BUT CHOSEN BY WEIGHT.
   *
   * This used to add one of EACH species per interval, which quietly ignored
   * the cast weights on the path that does most of the spawning. It did not
   * show while the intervals were long; at the tightened ones it did, badly —
   * a row listing `alien_basico: 3` beside `big_eater: 1` was delivering them
   * one for one, and the town filled up with the thing that was meant to be
   * the rare heavy. Same volume as before, correct mix.
   */
  let n = 0
  for (const _ in wave.cast) n++
  for (let i = 0; i < n; i++) {
    if (g.enemies.count >= CONFIG.MAX_ENEMIES) break
    spawnFromCast(g, wave.cast)
  }
}

/** One body, species chosen from the cast by weight. */
function spawnFromCast(g: Game, cast: Record<string, number>) {
  let total = 0
  for (const k in cast) total += cast[k]
  if (total <= 0) return
  let r = Math.random() * total
  let chosen = ''
  for (const k in cast) {
    chosen = k
    r -= cast[k]
    if (r <= 0) break
  }
  spawnAt(g, chosen, coneAngle(g))
}

/**
 * Mostly from where he is LOOKING.
 *
 * The way he faces is the way he is about to push, so pointing at something
 * also means walking into more of it — the trade the mouse is supposed to
 * make. The remainder wanders in from anywhere, so turning around is never a
 * way to empty the world. Formations ignore this entirely: a ring is not a
 * ring if four fifths of it arrives in front of you.
 */
function coneAngle(g: Game): number {
  const p = g.player
  const facing = Math.atan2(p.aimY, p.aimX)
  return Math.random() < 0.82
    ? facing + (Math.random() - 0.5) * CONFIG.SPAWN_CONE
    : Math.random() * Math.PI * 2
}

function spawnAt(g: Game, id: string, angle: number) {
  const def = ENEMIES[id]
  if (!def) return
  const p = g.player
  const radius = ringRadius(g) + 50 + Math.random() * 110

  let x = p.x + Math.cos(angle) * radius
  let y = p.y + Math.sin(angle) * radius

  if (g.arenaLocked && g.activeArena) {
    // Inside a barrier there is no "off screen" to arrive from, so they walk
    // in along the edge instead of materialising on top of the player.
    const e = edgePoint(g.activeArena, angle)
    x = e.x
    y = e.y
  }

  // Some things travel in packs, and a lone one of them is not the same enemy.
  const group = def.groupSize ?? 1
  for (let n = 0; n < group; n++) {
    const jx = n === 0 ? 0 : (Math.random() - 0.5) * 46
    const jy = n === 0 ? 0 : (Math.random() - 0.5) * 46
    const spawned = g.spawnEnemy(def, x + jx, y + jy)
    /*
     * THE CAR arrives already at speed and never steers again. It used to be
     * pinned to the road; there is no road any more, so it simply picks the
     * direction it is facing and commits to it.
     */
    if (spawned && def.behavior === 'car') {
      const away = Math.atan2(p.y - spawned.y, p.x - spawned.x)
      spawned.vx = Math.cos(away) * def.speed
      spawned.vy = Math.sin(away) * def.speed * 0.35
      spawned.flip = spawned.vx < 0
      spawned.awake = true
    }
  }
}

// -------------------------------------------------------------- FORMATIONS --

/**
 * Four shapes, four questions.
 *
 * The trickle only ever knows one way to arrive, and one arrival pattern can
 * only ask one thing of the player. These are what make a set piece read as an
 * event rather than as a busier minute.
 */
function spawnFormation(
  g: Game, kind: Formation, count: number, cast: Record<string, number>,
) {
  const p = g.player
  const base = ringRadius(g) + 60
  const facing = Math.atan2(p.aimY, p.aimX)

  for (let i = 0; i < count; i++) {
    let ang: number
    let r = base

    switch (kind) {
      case 'ring': {
        // Evenly all the way round: no safe direction, so standing is punished.
        ang = (i / count) * Math.PI * 2 + Math.random() * 0.12
        r = base + Math.random() * 50
        break
      }
      case 'wall': {
        // A line across his path, off to the front. Go around, or go through.
        const t = (i / Math.max(1, count - 1) - 0.5) * 2
        const ahead = facing
        const side = ahead + Math.PI / 2
        const x = p.x + Math.cos(ahead) * base + Math.cos(side) * t * base * 1.15
        const y = p.y + Math.sin(ahead) * base + Math.sin(side) * t * base * 1.15
        placeFrom(g, cast, x, y)
        continue
      }
      case 'swarm': {
        /*
         * A WALL OF BODIES YOU CANNOT SIMPLY LEAVE.
         *
         * The ring was escapable: it arrives at a fixed radius, the player
         * walks one way, and half of it is behind them for ever. A swarm is
         * biased HEAVILY toward where he is going and packed much tighter, so
         * pushing forward walks into more of it — and the tail that lands
         * behind means turning round is not an answer either.
         *
         * The point is not that it is unfair. It is that it has to be FOUGHT
         * rather than walked out of, which is the one thing the old wave never
         * managed.
         */
        const ahead = Math.random() < 0.72
        ang = ahead
          ? facing + (Math.random() - 0.5) * 1.5
          : Math.random() * Math.PI * 2
        r = base * (ahead ? 0.72 : 1) + Math.random() * 120
        break
      }
      case 'pincer': {
        // Both flanks at once, nothing front or back. Move perpendicular.
        const side = facing + (i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2)
        const spread = ((i >> 1) / Math.max(1, count / 2) - 0.5) * 1.1
        ang = side + spread
        r = base + Math.random() * 40
        break
      }
      default: {
        ang = coneAngle(g)
        r = base + Math.random() * 90
        break
      }
    }

    placeFrom(g, cast, p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r)
  }
}

function placeFrom(g: Game, cast: Record<string, number>, x: number, y: number) {
  let total = 0
  for (const k in cast) total += cast[k]
  if (total <= 0) return
  let r = Math.random() * total
  let id = ''
  for (const k in cast) { id = k; r -= cast[k]; if (r <= 0) break }
  const def = ENEMIES[id]
  if (!def) return

  const spawned = g.spawnEnemy(def, x, y)
  if (spawned && def.behavior === 'car') {
    const away = Math.atan2(g.player.y - y, g.player.x - x)
    spawned.vx = Math.cos(away) * def.speed
    spawned.vy = Math.sin(away) * def.speed * 0.35
    spawned.flip = spawned.vx < 0
    spawned.awake = true
  }
}

// ------------------------------------------------------------------ GEOMETRY --

/**
 * Just past the corner of the view, so nothing is seen popping in — but never
 * closer than SPAWN_RADIUS. On a small window the view diagonal is only about
 * 150 units, which would drop the horde almost on top of the player.
 */
function ringRadius(g: Game): number {
  return Math.max(CONFIG.SPAWN_RADIUS, Math.hypot(g.camera.viewW, g.camera.viewH) / 2 + 40)
}

/** Projects an angle onto the inside of an arena rectangle. */
function edgePoint(a: Arena, angle: number) {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const inset = 26
  const hw = a.halfW - inset
  const hh = a.halfH - inset
  const scale = Math.min(
    Math.abs(dx) < 1e-4 ? Infinity : hw / Math.abs(dx),
    Math.abs(dy) < 1e-4 ? Infinity : hh / Math.abs(dy),
  )
  return { x: a.centerX + dx * scale, y: a.centerY + dy * scale }
}

export type { SetPiece }
