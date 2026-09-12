import type { Game } from '../Game'
import type { Enemy, EnemyDef } from '../types'
import type { Prop } from '../world/props'
import { ENEMIES } from '../data/enemies'
import { ARENA_INTERIOR, CHURCH_DOOR, STAGES, WAVE_NAVE } from '../data/stages'
import { openInterior } from '../world/biomes'

/**
 * ATO III — DENTRO DA IGREJA.
 *
 * The other two acts end the way most games end an act: cross a line, a boss
 * drops in, kill it. This one could not be written that way, so it is not.
 * What happens behind the door is a SCRIPT, and this file is that script.
 *
 * It runs in four beats:
 *
 *   1. A DPS CHECK. Three timed rounds of the three species the player has
 *      been fighting for twenty minutes. Nothing new to learn — the question
 *      is only whether the build they actually built can clear a room before
 *      the room fills up again. Miss the clock and the same round is thrown
 *      on top of what is still standing, which is how a DPS check punishes:
 *      it compounds.
 *   2. SILENCE. A few seconds of nothing at all — the only quiet in the game,
 *      and it exists purely so that the next thing lands.
 *   3. O CHARÁ, in six bodies. See `updateChara`.
 *   4. Won.
 *
 * WHY IT IS A SEPARATE FILE. The director in `spawner.ts` answers one question
 * — what should be on the field right now — from a table. Act three asks
 * different questions in sequence, turns the director off and on again partway
 * through, and swaps the boss's own definition four times. Wiring any of that
 * into the wave table would have made the table a state machine, and the whole
 * reason the table is readable is that it is not one.
 */

export type Act3Phase =
  | 'outside' | 'check'
  /** O BEHOLDER DA CLT, between the check and the silence. */
  | 'beholder'
  /**
   * TWO ORDINARY WAVES, after him and before the silence.
   *
   * The act needs a breath between its two set pieces. Straight from the
   * Beholder into the silence into O Chará is three scripted things back to
   * back, and by the third the player has stopped believing the room is a room
   * — it is a corridor of cutscenes. Two waves of the ordinary horde in
   * between put the game back in their hands for a minute, and make the
   * silence that follows mean something again.
   */
  | 'after'
  | 'quiet' | 'fight' | 'won'

export interface Act3State {
  phase: Act3Phase
  /** Which round of the entry check is running. */
  round: number
  /** Seconds left on that round's clock. */
  clock: number
  /** How many times the current round has been thrown. Shown, and it stings. */
  thrown: number
  /** Beat timer, for the silence before he walks in. */
  hold: number
  /** Where the empty machine stands, until he climbs into it. */
  mecha: { x: number; y: number } | null
  /**
   * ARE THE ESTAGIÁRIOS STILL COMING?
   *
   * On between the first round of the check and the Beholder going down, and
   * off for ever afterwards. A flag rather than a phase test because the two
   * do not line up: they start partway THROUGH the check and stop partway
   * through the Beholder's own fight, and reading that off `phase` would mean
   * encoding the same two edges in three places.
   */
  interns: boolean
  /** Seconds until the next one is sent. */
  internCd: number
  /** Which of the two waves after the Beholder is running. */
  afterRound: number

  /**
   * How many pillars were raised. A COUNT, deliberately, not the enemies.
   *
   * Holding the three `Enemy` objects here was the obvious thing to write and
   * it was wrong: enemies live in a dense pool with swap-remove, so the object
   * that was a pillar is handed straight back out to the next alien that
   * spawns. The list then reported three pillars standing for ever — with
   * full health, because it was reading somebody else's — and the shield
   * never dropped. Nothing outside the pool may hold a reference into it.
   */
  pillars: number
}

export function makeAct3(): Act3State {
  return {
    phase: 'outside', round: -1, clock: 0, thrown: 0, hold: 0,
    interns: false, internCd: 0, afterRound: -1,
    mecha: null, pillars: 0,
  }
}

/**
 * THE ENTRY CHECK.
 *
 * Only the three species the player was promised: the ordinary alien, the fat
 * one, and the rocket. The rounds are not harder so much as HEAVIER — the body
 * count barely moves while the number of things that are genuinely dangerous
 * triples, so the first round can be walked through and the third cannot.
 *
 * The clocks are generous against a build that has kept pace and merciless
 * against one that has not, which is the entire point of putting a check here
 * rather than another wave. It is also the first thing in the game that can be
 * failed by doing too little damage rather than by being hit.
 */
/**
 * HOW MANY TIMES A MISSED CLOCK MAY THROW THE ROUND AGAIN.
 *
 * TWO, AND THIS NUMBER IS A SOFTLOCK FIX.
 *
 * The rule was "miss the clock and the round is thrown again on top of what is
 * still standing", with no limit on it. Against a build that cannot clear the
 * room that is not a difficulty spike, it is a trap with no floor: the field
 * only ever grows, the count can never reach zero, the arena is locked, and
 * the act cannot advance. A tester sat in the church until he gave up.
 *
 * Escalation was the right idea and unboundedness was the bug. Two extra
 * throws, each smaller than the last, and then the pressure stops and the room
 * is simply a room that has to be cleared. Slowly is still allowed to be the
 * answer; never is not.
 */
const MAX_THROWS = 2

/** Each re-throw is this much of the one before it. */
const THROW_DECAY = 0.55

const CHECK_ROUNDS: { limit: number; cast: Record<string, number> }[] = [
  { limit: 30, cast: { alien_basico: 22, grande_gordo: 2 } },
  // The RH alien arrives with the estagiários, and the round is opened up to
  // make room for them: the second beat of the act is about the new things,
  // not about how many old ones fit.
  { limit: 34, cast: { alien_basico: 20, grande_gordo: 4, rocket: 3, clt: 4 } },
  { limit: 38, cast: { alien_basico: 18, grande_gordo: 6, rocket: 5, clt: 7 } },
]

const ROUND_LINES = [
  'Tem coisa demais aqui dentro. Vem!',
  'Agora tão com CRACHÁ? Que porra é essa.',
  'Última leva. Aguenta, aguenta...',
]

// ------------------------------------------------------------------ ENTRY --

export function updateAct3(g: Game, dt: number) {
  const a = g.act3
  if (a.phase === 'won') return

  if (a.phase === 'outside') {
    /*
     * THE DOOR CLOSES BEHIND HIM.
     *
     * Deliberately not routed through `bossGate`. That gate's whole shape is
     * "sweep, drop a boss in, lock", and here the lock comes first, the boss
     * arrives about two minutes later, and what happens in between is the
     * point of the act.
     */
    if (g.player.reach < CHURCH_DOOR) return

    /*
     * AND NOT WHILE A BOSS IS STILL OWED. THIS IS THE SKIP.
     *
     * A player who arrives at the church door with act one's or act two's
     * boss unfought used to start act three anyway — and the line below
     * closes the arena, which is the FIRST thing `bossGate` checks. So from
     * that frame on the gate returned immediately, for ever, and BOTH owed
     * bosses were gone: not delayed, not fought later, simply deleted from the
     * run. Act three never unlocks, so nothing ever gave them the frame back.
     *
     * The ordering makes it worse rather than causing it: `updateAct3` runs
     * before `updateSpawner` in `step` (act three decides whether the director
     * may run at all), so act three always got to claim the lock first.
     *
     * This is the invariant stated where it belongs: ACT THREE CANNOT BEGIN
     * UNTIL THE ACTS BEFORE IT ARE FINISHED. Returning here leaves the frame
     * to `bossGate`, which scans every stage, finds the one that is owed, and
     * — because the player is a long way past where that arena was drawn —
     * re-centres the ring on them. The fight happens at the church door
     * instead of on the BR, which is strange to look at and correct: the
     * alternative is a run that skipped it.
     */
    for (const s of STAGES) {
      if (s.arena && s.boss && !g.bossesDone.has(s.id)) return
    }

    g.arenaLocked = true
    g.activeArena = g.resolveArena(ARENA_INTERIOR)
    g.sweepField()
    /*
     * THE WORLD CHANGES UNDER HIM.
     *
     * Reaching the church is going into it, so the square he is standing on
     * stops being a paved apron with a facade on it and becomes a floor. The
     * baked chunks still hold the old version, so they are thrown away and
     * rebuilt — once, at the one moment in a run when the terrain itself is
     * different from what it was a second ago.
     */
    openInterior(true)
    g.chunks.rebake({
      x: g.activeArena.centerX, y: g.activeArena.centerY,
      halfW: g.activeArena.halfW, halfH: g.activeArena.halfH,
    })
    // The director is off for the whole act except while the shield is up.
    g.waveHold = true
    a.phase = 'check'
    a.round = -1
    a.clock = 0
    g.showBanner('DENTRO DA IGREJA', 'E não tem casamento nenhum aqui.')
    g.audio.play('bossSpawn', { volume: 0.9 })
    g.camera.addShake(1)
    // He arrives whole, as at every other barrier. The room decides this
    // fight, not the walk up to it.
    g.player.hp = g.player.maxHp
    g.player.invuln = 2.5
    g.push()
    return
  }

  /*
   * THE ESTAGIÁRIOS ARE GOVERNED BY THE FLAG, NOT BY THE PHASE.
   *
   * They start partway through the check and stop partway through the
   * Beholder's own fight, so they belong above the dispatch rather than inside
   * one branch of it — which is where they were, and why they only ever turned
   * up once the Beholder was already on the field.
   *
   * `sendInterns` refuses on its own if the flag is off, so this line is the
   * whole of their scheduling.
   */
  sendInterns(g, a, dt)

  if (a.phase === 'check') { updateCheck(g, a, dt); return }
  if (a.phase === 'beholder') { updateBeholder3(g, a, dt); return }
  if (a.phase === 'after') { updateAfter(g, a); return }

  if (a.phase === 'quiet') {
    a.hold -= dt
    if (a.hold <= 0) { a.phase = 'fight'; spawnChara(g, a) }
    return
  }

  // 'fight' — the boss's own machine drives everything from here.
}

/**
 * BODIES THAT COUNT TOWARD CLEARING THE ROOM.
 *
 * NOT THE ESTAGIÁRIOS. They trickle in on their own timer for the whole of the
 * check, one every two and a half seconds, capped at five on the field — so
 * gating the round on `enemies.count === 0` meant emptying the room on the
 * exact frame between one arriving and the next. On a good build that is a
 * coin flip you eventually win; stacked on top of a missed clock it is the
 * other half of why the church could not be finished.
 *
 * They do no damage. They were never meant to be a win condition.
 */
function realBodies(g: Game): number {
  let n = 0
  for (const e of g.enemies.items) {
    if (e.def.id === 'beholder_minion') continue
    if (e.allyT > 0) continue
    n++
  }
  return n
}

function updateCheck(g: Game, a: Act3State, dt: number) {
  if (a.round < 0) { startRound(g, a, 0); return }

  if (realBodies(g) === 0) {
    if (a.round + 1 < CHECK_ROUNDS.length) { startRound(g, a, a.round + 1); return }
    /*
     * THE CHECK IS OVER, AND HE IS NOT THROUGH THE DOOR YET.
     *
     * The Beholder sits between the two things act three used to be: a DPS
     * check and then the ending. He is the middle the act did not have — one
     * fight with one idea in it, after the room has been cleared and before
     * the silence that O Chará walks out of.
     */
    startBeholder(g, a)
    return
  }

  /*
   * PAST THE LAST RE-THROW THE CLOCK IS SWITCHED OFF ENTIRELY.
   *
   * Not merely "no more spawns" — the timer stops running at all, so nothing
   * about this state can escalate again. What is on the field is what has to
   * be killed, however long it takes. See `MAX_THROWS`.
   */
  if (a.thrown >= MAX_THROWS) return

  a.clock -= dt
  if (a.clock > 0) return

  /*
   * THE CLOCK RAN OUT, so the round is thrown AGAIN on top of what is still
   * standing. The failure state of a DPS check should be that the problem gets
   * bigger while you are still solving the last one.
   *
   * EACH ONE SMALLER THAN THE LAST, and only twice. Unbounded, this was the
   * softlock: a player short on damage watched the room fill faster than they
   * could empty it, and the act had no other way out.
   */
  a.thrown++
  throwRound(g, a.round, Math.pow(THROW_DECAY, a.thrown))
  a.clock = CHECK_ROUNDS[a.round].limit
  g.camera.addShake(0.8)
  g.audio.play('bossSpawn', { volume: 0.8 })
  if (a.thrown >= MAX_THROWS) g.say('É O QUE TEM. Limpa isso e passa.')
  else g.say('NÃO DEU CONTA! TÁ VINDO MAIS!')
}

/**
 * THE ESTAGIÁRIOS, arriving steadily for as long as they are allowed to.
 *
 * They are the one thing in the act with no clock of its own that the player
 * can see: no wave, no announcement, just a trickle of little blue things that
 * do not hurt. That is deliberate. The Beholder's fight is a rotating bullet
 * pattern, and the interns exist to make sure the player cannot solve it once
 * and then stop paying attention to anything else.
 *
 * Capped by how many are already out, not by a rate alone: a player ignoring
 * them ends up with six on the field and their stick permanently backwards,
 * which is the correct punishment for ignoring them.
 */
function sendInterns(g: Game, a: Act3State, dt: number) {
  if (!a.interns) return
  a.internCd -= dt
  if (a.internCd > 0) return
  a.internCd = 2.6

  let out = 0
  for (const e of g.enemies.items) if (e.def.id === 'beholder_minion') out++
  if (out >= 5) return

  const arena = g.activeArena
  const p = g.player
  const ang = Math.random() * Math.PI * 2
  const r = 260 + Math.random() * 140
  const x = p.x + Math.cos(ang) * r
  const y = p.y + Math.sin(ang) * r
  g.spawnEnemy(
    ENEMIES.beholder_minion,
    arena ? clamp(x, arena.centerX, arena.halfW - 30) : x,
    arena ? clamp(y, arena.centerY, arena.halfH - 30) : y,
  )
}

/**
 * O BEHOLDER DA CLT ARRIVES, and he is not threatening anybody with violence.
 *
 * He is offering them a job. The lines are the fight: everything he says is an
 * offer, and every offer is worse than the last, and the reason it reads as a
 * threat rather than as a joke is that it is the exact thing Soul ran from.
 */
function startBeholder(g: Game, a: Act3State) {
  a.phase = 'beholder'
  a.clock = 0
  g.sweepField()
  const arena = g.activeArena
  const p = g.player
  const x = (arena ? arena.centerX : p.x) + 40
  const y = (arena ? arena.centerY : p.y) - 120
  g.bossRef = g.spawnEnemy(ENEMIES.beholder, x, y)
  g.showBanner('O BEHOLDER DA CLT', 'Ele não quer te matar. Ele quer te contratar.')
  g.audio.play('bossSpawn', { volume: 1 })
  g.camera.addShake(1)
  g.player.hp = g.player.maxHp
  g.player.invuln = 2
  g.say('Esse aí tem cara de RH. Cuidado.')
  g.push()
}

/**
 * THE MIDDLE OF ACT THREE.
 *
 * He fires himself (see `updateBeholder`); this only watches for him dying and
 * keeps the interns coming while he is up. When he goes down they stop, for
 * good: they were his, and the last stretch before the door is quiet on
 * purpose.
 */
function updateBeholder3(g: Game, a: Act3State, dt: number) {
  // He is gone the moment `bossRef` is cleared by his own death.
  // The interns are sent from `updateAct3`, above the dispatch.
  if (g.bossRef) {
    a.clock -= dt
    if (a.clock <= 0) {
      a.clock = 7
      g.bossSay('beholder', 'idle')
    }
    return
  }

  /*
   * AND THE INTERNS STOP. Not killed — whatever is still on the field stays,
   * and stays a problem — but no more are sent, so the square empties out on
   * its own and the walk to the door is quiet.
   */
  a.interns = false
  // The stick comes back the moment he is down, whatever was still ticking.
  g.player.invertT = 0
  g.showBanner('CONTRATO RECUSADO', 'A vaga tá fechada. E o Soul não vai trabalhar.')
  g.say('Enfia esse contrato no cu. CADÊ O SOUL?')
  // And the room fills back up. Two waves before the silence. See `updateAfter`.
  a.phase = 'after'
  a.afterRound = -1
  a.clock = 0
}

/**
 * THE TWO WAVES AFTER THE BEHOLDER.
 *
 * Ordinary ones, and that is the whole point: no clock, no new species, no
 * script. Clear the room and the next one arrives; clear that and it goes
 * quiet. The player has just spent a minute reading a rotating bullet pattern
 * with their controls being flipped, and what they need before the last fight
 * is a stretch of the game they already know how to play.
 *
 * NO FAILURE STATE. The check earlier in the act is the DPS test and it can be
 * failed by being too slow; this is not that. The pressure here came from the
 * thing that just died, and putting a second timer on the recovery would make
 * the recovery another exam.
 */
const AFTER_ROUNDS: Record<string, number>[] = [
  { alien_basico: 24, grande_gordo: 3, clt: 3 },
  { alien_basico: 20, grande_gordo: 5, rocket: 4, clt: 5 },
]

const AFTER_LINES = [
  'Voltaram. Claro que voltaram.',
  'Mais uma leva e eu chego nessa porta.',
]

function updateAfter(g: Game, a: Act3State) {
  if (a.afterRound < 0) { startAfter(g, a, 0); return }
  // Estagiários stop spawning when the Beholder goes down, but the ones
  // already on the field outlive him — and a harmless mob nobody is aiming at
  // must not be what stands between the player and the next wave.
  if (realBodies(g) > 0) return

  if (a.afterRound + 1 < AFTER_ROUNDS.length) { startAfter(g, a, a.afterRound + 1); return }

  a.phase = 'quiet'
  a.hold = 3.6
  a.clock = 0
  g.say('CADÊ ESSE ALIEN DE MERDA? CADÊ O SOUL?')
}

function startAfter(g: Game, a: Act3State, n: number) {
  a.afterRound = n
  throwCast(g, AFTER_ROUNDS[n])
  g.say(AFTER_LINES[n] ?? '')
  g.camera.addShake(0.45)
  g.audio.play('wave', { volume: 0.7 })
}

function startRound(g: Game, a: Act3State, n: number) {
  a.round = n
  a.thrown = 1
  a.clock = CHECK_ROUNDS[n].limit
  throwRound(g, n)

  /*
   * AFTER THE FIRST ROUND, THE LITTLE ONES START.
   *
   * Not from the first: round one is the player's one look at the square with
   * nothing new in it, and dropping two unfamiliar species into the opening
   * beat of an act would bury both. From round two they trickle in and keep
   * coming until the Beholder is down — so the player meets the estagiários
   * and the RH alien together, works out what they do, and only then meets the
   * thing that sent them.
   */
  if (n === 1 && !a.interns) {
    a.interns = true
    a.internCd = 1.5
    g.say('Que bichinho azul é esse?')
  }
  g.say(ROUND_LINES[n] ?? '')
  g.camera.addShake(0.5)
  g.audio.play('bossSpawn', { volume: 0.65 })
}

/** Drops one round's worth of bodies in a ring around the player. */
function throwRound(g: Game, n: number, scale = 1) {
  const cast = CHECK_ROUNDS[n].cast
  if (scale >= 1) { throwCast(g, cast); return }
  // A re-throw is a fraction of the round, floored at one of each so the shape
  // of the wave survives even when the count does not.
  const cut: Record<string, number> = {}
  for (const id of Object.keys(cast)) cut[id] = Math.max(1, Math.round(cast[id] * scale))
  throwCast(g, cut)
}

/**
 * A CAST, DROPPED IN A RING AROUND THE PLAYER.
 *
 * Pulled out of `throwRound` so the check and the two waves after the Beholder
 * put bodies on the field the same way — one function that knows about the
 * arena bounds, rather than two that both nearly do.
 */
function throwCast(g: Game, cast: Record<string, number>) {
  const arena = g.activeArena
  if (!arena) return
  const p = g.player
  for (const id of Object.keys(cast)) {
    const def = ENEMIES[id]
    if (!def) continue
    for (let i = 0; i < cast[id]; i++) {
      const ang = Math.random() * Math.PI * 2
      const r = 230 + Math.random() * 200
      const e = g.spawnEnemy(
        def,
        clamp(p.x + Math.cos(ang) * r, arena.centerX, arena.halfW - 30),
        clamp(p.y + Math.sin(ang) * r, arena.centerY, arena.halfH - 30),
      )
      /*
       * ROCKETS ARRIVE ALREADY LIT.
       *
       * Out in the world they are scenery until you walk into their ring,
       * which is a good ambush and a terrible way to end a timed round: a
       * measured run stalled with seven of them sitting dormant in the corners
       * of a room eleven hundred units wide, waiting to be visited. A check
       * has to come to the player.
       */
      if (e) e.awake = true
    }
  }
}

function clamp(v: number, centre: number, half: number) {
  return Math.max(centre - half, Math.min(centre + half, v))
}

// ------------------------------------------------------------- HE ARRIVES --

function spawnChara(g: Game, a: Act3State) {
  const arena = g.activeArena
  if (!arena) return

  /*
   * THE EMPTY MACHINE, standing in the room from the moment he walks in.
   *
   * It is furniture for the whole of stage one and the player has no reason
   * to care about it — which is the point. When the first bar empties and he
   * turns and RUNS for it, the thing he is running to has been on screen the
   * entire time. Foreshadowing costs one sprite.
   */
  a.mecha = { x: arena.centerX + arena.halfW * 0.6, y: arena.centerY - 150 }
  const img = g.assets.icon('empty_mecha')
  if (img && img.width) {
    g.extraProps.push({
      x: a.mecha.x, y: a.mecha.y, icon: 'empty_mecha',
      w: img.width, h: img.height, solidW: 0, solidH: 0,
    } as Prop)
  }

  // He walks in from the far end, alone — which is what "then only one alien
  // spawns" has to look like straight after two hundred of them.
  const e = g.spawnEnemy(ENEMIES.chara, arena.centerX + arena.halfW - 100, arena.centerY + 60)
  if (!e) return
  e.stage = 0
  g.bossRef = e
  g.showBanner('O CHARÁ', 'Ele tem a tua cara. Isso não é bom sinal.')
  g.audio.play('bossSpawn', { volume: 1 })
  g.audio.music('boss')
  g.camera.addShake(1)
  g.push()
}

// -------------------------------------------------------------- THE STAGES --

/**
 * WHAT TO DO WHEN ONE OF HIS BARS EMPTIES.
 *
 * Called from `damageEnemy` in place of the kill, because a zero means
 * something different at every stage: get up and run, climb out of the wreck,
 * call the ship, come down with a sword, or finally die. The damage code
 * cannot know which — but it does know it must not remove him, and coming back
 * from here with health on the clock is how this says so.
 */
export function charaAdvance(g: Game, e: Enemy) {
  const a = g.act3

  /*
   * GET HIM OFF ZERO BEFORE ANYTHING ELSE HAPPENS.
   *
   * The blast below is a `hostileBlast`, which damages every enemy in its
   * radius — and he is an enemy, standing in the middle of it. Leaving him on
   * zero health for the duration of his own detonation sent the damage
   * straight back into `damageEnemy`, which called this function again, which
   * fired the blast again: a stack overflow on the first bar break, every
   * time. One unit of health and a moment of invulnerability close it, and
   * they have to be set FIRST, not by the branch at the bottom.
   */
  e.hp = 1
  e.invulnT = Math.max(e.invulnT, 0.4)

  const brk = e.def.barBreak
  if (brk) {
    g.hostileBlast(e.x, e.y, brk.radius, brk.damage)
    g.spawnBlast(e.x, e.y, brk.radius)
    g.camera.addShake(brk.shake)
  }
  g.audio.play('boom', { volume: 1 })
  e.flash = 0.6

  switch (e.stage) {
    // ---- on foot, first time: he goes and gets the machine ---------------
    case 0:
      /*
       * NOT A NEW BODY YET — a sprint. He is untouchable for the length of
       * it, which is the only way the run reads as a cutscene he is playing
       * rather than as a boss standing still to be shot.
       */
      e.stage = 1
      e.shielded = true
      /*
       * HEALTH STAYS ON THE FLOOR through the run — he is not a fresh enemy,
       * he is a beaten one going to get something. Refilling the bar here
       * would tell the player the last thirty seconds did not count, and then
       * take it away again the moment he reaches the machine.
       */
      e.state = 0
      g.say('Ele largou a arma e correu. Correu pra onde?')
      return

    // ---- the mecha is down: he climbs out --------------------------------
    case 2:
      becomeChara(g, e, ENEMIES.chara_angry, 3, 3)
      // Dumped out of the wreck a little to the side, so the change of scale
      // is visible instead of happening under a cloud of smoke.
      e.x -= 46
      g.say('Saiu de dentro. Continua feio.')
      return

    // ---- on foot, second time: he calls the ship -------------------------
    case 3: {
      e.stage = 4
      e.shielded = true
      e.barsLeft = 2
      e.def = ENEMIES.chara_nave
      e.maxHp = ENEMIES.chara_nave.hp
      e.hp = e.maxHp
      e.broken = false
      e.invulnT = 0
      e.state = 3
      e.phase = 0
      const arena = g.activeArena
      if (arena) { e.x = arena.centerX; e.y = arena.centerY - 60 }
      g.spawnBlast(e.x, e.y, 300)
      g.camera.addShake(1.7)
      raisePillars(g, a)
      /*
       * THE WAVES COME BACK, and this is the only stretch of act three where
       * the director is allowed to run at all. It is also the only fight in
       * the game that asks the player to ignore the boss: the ship cannot be
       * hurt, the room is filling up again, and the answer is to leave both
       * and go and break three things in the corners.
       */
      g.waveOverride = WAVE_NAVE
      g.waveHold = false
      g.bossSay('chara', 'phase')
      g.showBanner('A NAVÉ MÃE', 'Com os três pilares de pé, ela não sente nada.')
      g.say('Tá blindada! Derruba aquelas três coisas!')
      g.push()
      return
    }

    // ---- the ship is down: he comes back down with a sword ---------------
    case 5:
      becomeChara(g, e, ENEMIES.chara_sword, 6, 1)
      g.bossSay('chara_nave', 'phase')
      g.showBanner('O CHARÁ', 'Acabou a bala dele. Agora é na lâmina.')
      g.say('Ele pulou lá de cima. COM UMA ESPADA.')
      return

    // ---- the last bar. He is done. ---------------------------------------
    default:
      // Undo the guard above: this is the one zero that is meant to stick.
      e.hp = 0
      e.invulnT = 0
      a.phase = 'won'
      g.waveHold = true
      g.waveOverride = null
      return
  }
}

/** Swaps the live boss onto a new body. He is never respawned. */
function becomeChara(g: Game, e: Enemy, def: EnemyDef, stage: number, bars: number) {
  e.def = def
  e.stage = stage
  e.barsLeft = bars
  e.maxHp = def.hp
  e.hp = e.maxHp
  e.broken = false
  e.shielded = false
  /*
   * A second of grace between bodies.
   *
   * Without it, sustained fire eats the opening of the next stage during the
   * transformation blast and the player never sees him change — they just see
   * the number keep going down, which is the exact bug the Microsoft's
   * `invulnT` was added to fix.
   */
  e.invulnT = 1.2
  e.state = 1.2
  e.phase = 0
  e.fuse = 0
  e.awake = true
  e.kx = 0; e.ky = 0
  g.camera.addShake(1)
  g.audio.play('bossSpawn', { volume: 1 })
  g.push()
}

/** The three pillars, spread wide enough that visiting all three is a journey. */
function raisePillars(g: Game, a: Act3State) {
  const arena = g.activeArena
  if (!arena) return
  a.pillars = 0
  const spots: [number, number][] = [[-0.7, -0.58], [0.7, -0.58], [0, 0.72]]
  for (const [fx, fy] of spots) {
    const t = g.spawnEnemy(
      ENEMIES.alien_tech,
      arena.centerX + fx * arena.halfW,
      arena.centerY + fy * arena.halfH,
    )
    if (t) a.pillars++
  }
  g.audio.play('bossSpawn', { volume: 0.8 })
}

/**
 * Pillars still standing. Zero means the shield drops.
 *
 * Counted off the live pool every time it is asked rather than tracked, for
 * the reason in `Act3State.pillars`: the only trustworthy answer to "is that
 * one still there" is to go and look.
 */
export function pillarsLeft(g: Game): number {
  const items = g.enemies.items
  let n = 0
  for (let i = 0; i < items.length; i++) {
    if (items[i].def.id === 'alien_tech') n++
  }
  return n
}

/**
 * WHAT THE HUD SHOULD SAY THE PLAYER IS SUPPOSED TO BE DOING.
 *
 * A boss health bar can say "hurt this". It cannot say "clear the room before
 * the clock runs out" or "the thing you are shooting is invulnerable, go and
 * break those instead", and act three asks both. So it is spelt out.
 */
export function act3Objective(g: Game): Snapshot3 | null {
  const a = g.act3
  if (a.phase === 'check') {
    /*
     * THE SAME COUNT THE ROUND IS ACTUALLY WAITING ON.
     *
     * It read `enemies.count`, which includes the estagiários — so the
     * objective could sit at "3 de pé" with nothing left that mattered, and
     * the player had no way to know the round was already effectively clear.
     *
     * And once the last re-throw is spent the clock is off, so showing a
     * number counting down would be a lie about a deadline that no longer
     * exists.
     */
    const left = realBodies(g)
    const done = a.thrown >= MAX_THROWS
    const secs = Math.max(0, Math.ceil(a.clock))
    return {
      label: 'LIMPA A IGREJA — LEVA ' + (a.round + 1) + '/' + CHECK_ROUNDS.length,
      value: left + ' de pé' + (done ? ' · sem pressa' : ' · ' + secs + 's'),
      urgent: !done && secs <= 8,
    }
  }
  if (a.phase === 'fight' && a.pillars > 0) {
    const n = pillarsLeft(g)
    if (n > 0) {
      return { label: 'A NAVÉ TÁ BLINDADA', value: n + ' pilares de pé', urgent: true }
    }
  }
  return null
}

/** The shape the snapshot wants. Named here because this is what fills it. */
interface Snapshot3 { label: string; value: string; urgent: boolean }
