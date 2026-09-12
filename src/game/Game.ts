import { CONFIG } from './config'
import { openInterior } from './world/biomes'
import { CRIT_MULT, critChance, dropBonus } from './data/luck'
import { Assets } from './core/assets'
import { AudioBus } from './core/audio'
import { Camera } from './core/camera'
import { Input } from './core/input'
import { Pool } from './core/pool'
import { SpatialHash } from './core/spatialHash'
import { ChunkManager } from './world/chunks'
import { LEG, totemInLeg } from './world/items'
import { ENEMIES } from './data/enemies'
import { CHURCH_DOOR, STAGES, stageAt } from './data/stages'
import { timeOfDay } from './world/daylight'
import {
  BASE_MODS, REROLLS, REVOLVER, STAT_SLOTS, UPGRADES, powerCap, type Upgrade,
} from './data/weapons'
import { updateEnemies } from './systems/ai'
import { updateBullets, updateFloaters, updatePickups, updatePlayer } from './systems/combat'
import { updateSpawner } from './systems/spawner'
import {
  act3Objective, charaAdvance, makeAct3, updateAct3, type Act3State,
} from './systems/act3'
import { updateAbduction, makeAbduction, type AbductionState } from './systems/abduction'
import { makeCobson, updateCobson, type CobsonState } from './systems/cobson'
import { makeRunStats, summarise, type RunStats, type Summary } from './data/record'
import { makeCine, updateOpening, type Cine } from './systems/opening'
import { makeEnding, updateEnding, type EndingState } from './systems/ending'
import {
  BANNER_SECONDS, rollUpgrades, slotsUsed, updateProgression, xpForLevel,
} from './systems/progression'
import { render } from './systems/render'
import {
  CAST_FLASH, abilityActive, abilityInterval, updateAbilities, updateBombs, updatePoison,
} from './systems/abilities'
import { updateHelpers } from './systems/homunculo'
import type { Prop } from './world/props'
import { BLOOD, EFFECTS, type EffectKey } from './data/effects'
import type {
  AbilityState, Arena, ArenaDef, Bomb, Bullet, Enemy, EnemyDef, Floater, Fx, Helper,
  Frame, Pickup, Player, RunPhase, SetPiece, Snapshot, Storm, Tape,
  TempEffect, WaveDef,
} from './types'
import { ABILITIES, ABILITY_KEYS, ABILITY_PRESS, at, type AbilityId } from './data/abilities'
import { AMMO } from './data/bullets'
import { BARKS, QUIPS, pick, type BarkSet } from './data/barks'

/**
 * The engine.
 *
 * React never renders the game. It mounts a canvas, hands it to this class,
 * and subscribes to a throttled snapshot for the HUD. Everything below runs
 * outside React's render cycle — reconciling 700 enemies through the virtual
 * DOM sixty times a second is not a thing that works.
 *
 * The loop is a fixed-timestep accumulator: the simulation always advances in
 * exact 1/60 slices no matter what the display does, so behaviour is identical
 * on a 60Hz laptop and a 144Hz monitor, and a stalled tab cannot teleport
 * anything through a wall.
 */
/** What he says once a boss is down and the road opens again. */
const BOSS_CLEARED: Record<string, string> = {
  manifestacao: 'Cansei de discutir. Floriano é logo ali.',
  // The only line in the game that is also a direction. Act three does not
  // begin at a distance, it begins at a door, and the player has to be told
  // which one — so the boss dying and the church opening are the same beat.
  microsoft: 'Caiu. A igreja tá aberta — é ali que ele tá.',
}

/** Seconds a hit reads for. Matches HIT_FLASH_TIME in the renderer. */
export const HIT_FLASH = 0.14

export class Game {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  camera = new Camera()
  input = new Input()
  assets = new Assets()
  chunks!: ChunkManager
  hash = new SpatialHash(CONFIG.HASH_CELL)

  player!: Player
  enemies = new Pool<Enemy>(makeEnemy, CONFIG.MAX_ENEMIES)
  bullets = new Pool<Bullet>(makeBullet, CONFIG.MAX_BULLETS)
  pickups = new Pool<Pickup>(makePickup, CONFIG.MAX_PICKUPS)
  floaters = new Pool<Floater>(makeFloater, CONFIG.MAX_FLOATERS)
  bombs = new Pool<Bomb>(makeBomb, 24)
  /**
   * PLAYING EFFECTS.
   *
   * Capped well below the bullet pool on purpose. Four hundred things can die
   * in the same second and every one of them wants a blood spray; the cap is
   * what decides that the first ninety get one and the rest die quietly, which
   * is the right trade — nobody can see the ninety-first anyway.
   */
  fx = new Pool<Fx>(makeFx, 90)
  helpers = new Pool<Helper>(makeHelper, 4)

  phase: RunPhase = 'menu'
  time = 0
  kills = 0
  stageIndex = 0
  /**
   * EVERYTHING THE RUN DID, counted as it happens.
   *
   * Read once, at the end, by `data/record`. Kept here rather than on the
   * player because it outlives him — a Reviva does not reset what the run has
   * been, and `reset()` is the only thing that clears it.
   */
  runStats: RunStats = makeRunStats()
  /** The run's own summary, built the moment it ends and never rebuilt. */
  summary: Summary | null = null
  seed = 1337
  banner: { title: string; subtitle: string; t: number } | null = null
  /**
   * Seconds of opening title still to play.
   *
   * Nothing spawns and the clock does not run while this is counting down, so
   * the act card is read on an empty road instead of over the top of the first
   * fight — and the first bark cannot collide with the title, because there is
   * nothing to bark at yet.
   */
  introT = 0
  private barkQueue: string[] = []
  private lastBark = ''
  /** Earliest `time` each gated set may speak again. See `react`. */
  private barkCd: Partial<Record<BarkSet, number>> = {}
  /** Seconds he has had nobody near him. Drives the `quiet` set. */
  quietT = 0
  /** True while he is under a third of health, so coming back out can be said. */
  wasLow = false
  /** One-shot bark flags, so a reaction fires once per run rather than per tick. */
  private said = new Set<string>()
  /** Kills at the last streak line, so the next one needs real progress. */
  private streakAt = 0
  offers: Upgrade[] = []
  /**
   * THREE HANDS YOU DO NOT HAVE TO PLAY, for the whole run.
   *
   * The card screen is the only place the game asks a question and refuses to
   * accept "none of these" — three commons at level nineteen is a level-up
   * that happens TO you. Three rerolls is enough to rescue the hands that
   * genuinely have nothing in them and far too few to shop for a build, which
   * is exactly where it should sit: the choice is which of the bad hands is
   * worth spending one on.
   *
   * PER RUN, NOT PER LEVEL. Per level it would be a button you press every
   * time and the deck would effectively be six cards wide. Spent, it is gone,
   * and the last one is a decision.
   */
  rerolls = 0
  taken: Record<string, number> = {}
  bossSpawned = false
  bossRef: Enemy | null = null
  arenaLocked = false
  readonly audio = new AudioBus()
  /** Dança da Chuva downpours currently on the ground. */
  storms: Storm[] = []

  /**
   * THE RECORDING, for Lost Media.
   *
   * A plain ring buffer sampled at a fixed rate rather than every frame — it
   * only has to be good enough to walk a path, and sampling at sixty hertz for
   * six seconds would be three hundred and sixty entries per tape's worth of
   * history for no visible gain.
   */
  tapeLog: Frame[] = []
  tapeCd = 0
  tapes: Tape[] = []

  // ---- the director's bookmark in the schedule ----
  /** The wave row currently in force. */
  wave: WaveDef | null = null
  /**
   * ACT THREE, which is a script rather than a wave row. See `act3.ts`.
   */
  act3: Act3State = makeAct3()
  /** The mothership passing overhead. See `systems/abduction.ts`. */
  abduct: AbductionState = makeAbduction()
  /** The closing sequence. Only meaningful while `phase` is 'ending'. */
  ending: EndingState = makeEnding()
  /**
   * THE DIRECTOR IS OFF.
   *
   * Nothing at all is trickled while this is set. Distinct from a sealed
   * arena, which is a property of the ROOM: this is a property of the moment,
   * and act three turns it on and off three times inside the same room.
   */
  waveHold = false
  /**
   * A wave row forced in place of whatever the schedule says.
   *
   * Only the mothership uses it, to bring the horde back for exactly as long
   * as its shield is up. Everything else reads the table.
   */
  waveOverride: WaveDef | null = null
  /**
   * SCENERY THE WORLD DID NOT GENERATE.
   *
   * Props are a pure function of chunk and seed, which is what makes the world
   * rebuild identically — and it means there is no way to put ONE object
   * somewhere because the story needs it there. These are drawn and sorted
   * with the rest, generated by nothing. Currently: the empty mecha, standing
   * in the church until he climbs into it.
   */
  extraProps: Prop[] = []
  /** Seconds until the next top-up spawn. */
  spawnCd = 0
  /** A set piece still firing, and what is left of it. */
  piece: SetPiece | null = null
  pieceLeft = 0
  pieceCd = 0
  /** Seconds until the next unscheduled event rolls. */
  eventCd = 22
  /**
   * The power the player has taken with no room for it, waiting on an answer
   * about what it replaces. Non-null exactly while `phase === 'swap'`.
   */
  pendingSwap: Upgrade | null = null
  /**
   * The arena currently closed around the player, with its Y resolved against
   * the road. Null outside a boss fight. Everything that clamps to a barrier
   * reads this rather than a fixed rectangle — there are two arenas now and
   * one of them sits wherever the road happens to be.
   */
  activeArena: Arena | null = null
  /** Acts whose boss has already been fought, so it cannot re-trigger. */
  bossesDone = new Set<string>()
  spawnCredit = 0
  /** Where the revolver is currently pointed — render hint for the reticle. */
  aimTargetX = 0
  aimTargetY = 0
  aimTargetActive = false
  /**
   * Privacidade: while true the horde has lost him and walks to the last spot
   * they saw, instead of tracking him.
   */
  lostPlayer = false
  lastSeenX = 0
  lastSeenY = 0
  /**
   * A BLACK SHEET OVER THE WHOLE FRAME, 1 opaque and 0 gone.
   *
   * Used for the two cuts in the game that are cuts — into a run, and out of
   * the last fight — rather than for anything gameplay depends on. It is on
   * `Game` rather than in the renderer because it counts down on the
   * simulation's clock and the renderer does not have one.
   */
  veil = 0
  /**
   * THE BODY EXECUTAR IS CURRENTLY OFFERING, as three plain numbers.
   *
   * NOT a reference. The enemy pool is dense with swap-remove, so a reference
   * held across frames is handed to whatever spawns next the moment its owner
   * dies — the bug that made three destroyed pillars report as standing.
   * Recomputed every frame by `updateExecutar`; the renderer only draws it.
   */
  /**
   * COBSON, if he is on his way. Null the rest of the time.
   *
   * Deliberately a plain nullable object rather than a pooled one: there is
   * only ever one of him, he is never collided with, and nothing in the world
   * may hold a reference to him. See `systems/cobson`.
   */
  cobson: CobsonState | null = makeCobson()
  /** Big corns picked up since his last visit. See `COBSON_CORN`. */
  goodCorn = 0
  execOn = false
  execX = 0
  execY = 0
  /** Which body is marked, and how long is left to press X on it. */
  execUid = 0
  execT = 0
  /** Ticks up for every body that has ever been spawned. See `Enemy.uid`. */
  private nextEnemyUid = 0
  /**
   * SECONDS OF THE ESTRELA'S RING still expanding, counting down.
   *
   * A number rather than a pooled effect, because what it draws is a stroked
   * ring in the star's own gold and not a sheet — see `drawStarPull`. The
   * sheet version of this was `nebula`, which is a pale cloud the size of the
   * screen, and it whited out the one thing the item is for.
   */
  starPull = 0
  /**
   * THE OPENING SCENE, while it is running, and null the rest of the time.
   *
   * Null is load-bearing: `tick` branches on it to take the whole simulation
   * out of the loop, so the scene cannot be shot through, spawned into, or
   * levelled up in. See `systems/opening`.
   */
  cine: Cine | null = null

  /**
   * HOW MUCH AN ORB IS WORTH RIGHT NOW. See CONFIG.LEVEL_PACE.
   *
   * One over the ratio of how far ahead of the road the player's level is.
   * Read on every drop, which is a few hundred a minute, so it is arithmetic
   * and nothing else.
   */
  xpPace(): number {
    const P = CONFIG.LEVEL_PACE
    // The end of act two, read from the stage table rather than repeated here.
    const t = Math.max(0, Math.min(1, this.player.reach / STAGES[1].endX))
    const expected = 1 + P.top * Math.pow(t, P.curve)
    const ratio = expected / Math.max(1, this.player.level)
    return Math.max(P.min, Math.min(P.max, Math.pow(ratio, P.power)))
  }

  /**
   * HOW FAST THE WORLD IS RUNNING.
   *
   * 1 almost always. During Reviva it is a dead stop for the first fraction of
   * a second — long enough to register as a STOP rather than as a stutter —
   * and then eases back up to full over the rest of the sequence, so the game
   * returns to speed under the player instead of snapping back.
   */
  private reviveScale(): number {
    const t = this.player.reviveT
    if (t <= 0) return 1
    const R = CONFIG.REVIVE
    if (t > R.time - R.hold) return 0
    // Eased so the last of the slow motion is barely there.
    const k = 1 - t / (R.time - R.hold)
    return R.slow + (1 - R.slow) * k * k
  }

  /** Species already met this run, so a bark only fires once each. */
  seenSpecies = new Set<string>()
  /** What he is saying right now, drawn in a bubble over his head. */
  bark: { text: string; t: number } | null = null
  /**
   * WHAT THE BOSS IS SAYING.
   *
   * Kept apart from the player's bark rather than sharing one channel: the two
   * of them talk over each other constantly during a fight, and whoever spoke
   * second silencing the first would mean the boss's lines are the ones that
   * get eaten — they are the rarer and the more interesting half.
   *
   * The bubble is positioned against `bossRef` at draw time and never stores a
   * reference of its own, so it cannot outlive the thing that said it.
   */
  bossBark: { text: string; t: number } | null = null
  /** Seconds until the boss says something unprompted. */
  bossBarkCd = 0
  private lastQuip = ''
  /** Seconds until the next wave, and how many have landed. */
  waveCd = 0
  waveCount = 0
  /** Columns whose totem has been placed already, and which have been taken. */
  private totemsPlaced = new Set<number>()
  private totemsTaken = new Set<number>()

  private raf = 0
  private lastTime = 0
  private accumulator = 0
  private snapshotClock = 0
  private fps = 60
  private onSnapshot: ((s: Snapshot) => void) | null = null
  private resizeObserver: ResizeObserver | null = null
  /** Watches for the display's pixel ratio changing. See `observeSize`. */
  private dprWatch: MediaQueryList | null = null
  private dprListener: (() => void) | null = null
  /** React StrictMode mounts twice in dev; init() must not finish after dispose(). */
  private destroyed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D não disponível neste navegador.')
    this.ctx = ctx
    this.player = makePlayer()
  }

  /**
   * BOOT.
   *
   * The art and every audio file are pulled down together, and `onProgress`
   * reports the pair as one number — the loading screen has no reason to know
   * that half of what it is waiting for is wav.
   *
   * The audio is only FETCHED here, not decoded: a context cannot exist before
   * the first gesture. What that buys is that by the time anybody touches the
   * game the menu theme is already in memory, so it starts on the touch rather
   * than a few seconds after it.
   */
  async init(onSnapshot: (s: Snapshot) => void, onProgress?: (k: number) => void) {
    this.onSnapshot = onSnapshot
    let art = 0
    let sound = 0
    const report = () => onProgress?.(art * 0.55 + sound * 0.45)
    await Promise.all([
      this.assets.load().then(() => { art = 1; report() }),
      this.audio.prefetch((done, total) => { sound = total ? done / total : 1; report() }),
    ])
    if (this.destroyed) return
    this.chunks = new ChunkManager(this.assets, this.seed)
    this.input.attach(this.canvas)
    // Autoplay policy: the context cannot exist before a gesture, so the bus
    // waits for the first click or keypress and unlocks itself.
    this.audio.attach(this.canvas)
    this.observeSize()
    this.resize()
    this.reset()
    this.push()
    if (import.meta.env.DEV) (window as unknown as { soul: Game }).soul = this
  }

  /**
   * DEV only: run the simulation forward without waiting for frames.
   *
   * The loop is already frame-rate independent, so a smoke test can drive it
   * straight from the console — `soul.startRun(); soul.debugAdvance(120)` plays
   * two minutes instantly and you can inspect the result. Handy for checking
   * balance and act transitions without sitting through a run.
   */
  debugAdvance(seconds: number, chooser?: (offers: Upgrade[]) => string) {
    const steps = Math.round(seconds / CONFIG.STEP)
    for (let i = 0; i < steps; i++) {
      // Level-ups have to be resolved from in here, or the run stalls the
      // moment one fires. `chooser` lets a test model a player with a plan;
      // without it the first card is taken, which is a random build.
      if (this.phase === 'levelup') {
        const id = chooser ? chooser(this.offers) : (this.offers[0]?.id ?? '')
        this.chooseUpgrade(id)
      }
      // A swap prompt would stall a headless run forever. Tests take the deal,
      // dropping whichever power is listed first.
      if (this.phase === 'swap') {
        const owned = UPGRADES.filter((u) => u.kind === 'power' && this.taken[u.id])
        this.resolveSwap(owned[0]?.id ?? null)
      }
      if (this.phase !== 'playing') break
      this.step(CONFIG.STEP)
    }
    this.push()
  }

  dispose() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.input.dispose()
    this.audio.dispose()
    this.resizeObserver?.disconnect()
    this.dropDpr()
  }

  // ------------------------------------------------------------- LIFECYCLE --

  reset() {
    this.enemies.clear()
    this.bullets.clear()
    this.pickups.clear()
    this.floaters.clear()
    this.bombs.clear()
    this.fx.clear()
    this.helpers.clear()
    this.storms.length = 0
    this.tapeLog.length = 0
    this.tapes.length = 0
    this.tapeCd = 0
    this.player = makePlayer()
    this.time = 0
    this.kills = 0
    this.stageIndex = 0
    this.runStats = makeRunStats()
    this.summary = null
    this.banner = null
    this.barkQueue.length = 0
    this.said.clear()
    this.barkCd = {}
    this.quietT = 0
    this.wasLow = false
    this.streakAt = 0
    this.offers = []
    this.cobson = null
    this.goodCorn = 0
    this.rerolls = REROLLS
    this.wave = null
    this.act3 = makeAct3()
    this.abduct = makeAbduction()
    this.ending = makeEnding()
    // The world is outdoors again. See `openInterior`.
    openInterior(false)
    if (this.chunks) this.chunks.rebake()
    this.waveHold = false
    this.waveOverride = null
    this.extraProps.length = 0
    this.spawnCd = 0
    this.piece = null
    this.pieceLeft = 0
    this.pieceCd = 0
    this.eventCd = 22
    this.pendingSwap = null
    this.taken = {}
    this.veil = 0
    this.starPull = 0
    this.cine = null
    this.bossSpawned = false
    this.bossRef = null
    this.arenaLocked = false
    this.activeArena = null
    this.bossesDone.clear()
    this.spawnCredit = 0
    this.lostPlayer = false
    this.seenSpecies.clear()
    this.bark = null
    this.bossBark = null
    this.bossBarkCd = 0
    this.lastQuip = ''
    this.waveCd = 0
    this.waveCount = 0
    this.introT = 0
    this.totemsPlaced.clear()
    this.totemsTaken.clear()
    // Start standing on the road, wherever the generator put it.
    if (this.chunks) {
      const at = this.chunks.route.pointAt(0)
      this.player.x = at.x
      this.player.y = at.y
      this.player.reach = 0
    }
    this.camera.x = this.player.x
    this.camera.y = this.player.y
  }

  startRun() {
    this.reset()

    // Dev shortcut: /?start=15000 drops you straight into the church plaza so
    // act three can be worked on without replaying the first two.
    if (import.meta.env.DEV) {
      const at = Number(new URLSearchParams(location.search).get('start'))
      if (Number.isFinite(at) && at > 0) {
        this.player.x = at
        this.player.reach = at
        const at2 = this.chunks.route.pointAt(at)
        this.player.x = at2.x
        this.player.y = at2.y
        this.player.reach = at
        this.camera.x = this.player.x
        this.camera.y = this.player.y
        this.stageIndex = stageAt(at)
      }
    }

    this.phase = 'playing'
    /*
     * UP OUT OF BLACK, rather than cutting from the sign to the road.
     *
     * The opening scene lifts this itself — `step` is not running while it
     * plays — and lifts it faster than a plain start would, because the
     * letterbox closing over the top is already doing an opening's work.
     */
    this.veil = 1

    /*
     * AND THEN HE WALKS AND TALKS FOR NINE SECONDS.
     *
     * The banner and the quiet period still happen; they happen AFTER, on the
     * frame the bars finish leaving, so the act title lands on a frame the
     * player already has the stick for rather than over a scene they are
     * watching. Everything that used to be here has moved to `endOpening`.
     *
     * The dev shortcut skips it: `?start=15000` exists to reach act three in
     * one keypress, and nine seconds of an opening is the opposite of that.
     */
    if (import.meta.env.DEV && this.player.reach > 0) this.endOpening()
    else {
      // The press that opened the run does not also close the scene.
      this.input.clearPressed()
      this.cine = makeCine()
    }

    this.push()
    this.run()
  }

  /**
   * THE SCENE LETS GO.
   *
   * Everything a run used to begin with, moved intact to the far side of the
   * opening: the sound of setting off, the act title, and the few quiet
   * seconds before anything is allowed to arrive. `introT` is the last of
   * those, and it starts here rather than nine seconds ago, so the grace
   * period is a grace period rather than something already spent watching.
   */
  private endOpening() {
    this.cine = null
    this.audio.play('runStart', { volume: 0.8 })
    const s = STAGES[this.stageIndex]
    this.showBanner(s.name, s.subtitle)
    this.introT = BANNER_SECONDS
    this.input.clearPressed()
    this.push()
  }

  /** Keeps rendering while paused so the frozen frame stays on screen. */
  private run() {
    if (this.raf) return
    this.lastTime = performance.now()
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame)
      this.tick(now)
    }
    this.raf = requestAnimationFrame(frame)
  }

  togglePause() {
    if (this.phase === 'playing') this.phase = 'paused'
    else if (this.phase === 'paused') this.phase = 'playing'
    this.push()
  }

  private tick(now: number) {
    let dt = (now - this.lastTime) / 1000
    this.lastTime = now
    if (!Number.isFinite(dt) || dt < 0) dt = 0
    this.fps += (1 / Math.max(dt, 0.0005) - this.fps) * 0.08

    /*
     * REVIVA COUNTS DOWN ON REAL TIME, and it has to.
     *
     * It is what is throttling the simulation, and the first half-second of it
     * is a DEAD STOP — no steps run at all. Counted inside `step` it would
     * never reach zero, because nothing would ever step to decrement it, and
     * the game would freeze on the frame the player was saved. This is the one
     * timer in the game that belongs to the wall clock rather than to the
     * simulation, for exactly the reason the simulation is not running.
     */
    if (this.phase === 'playing' && this.player.reviveT > 0) {
      this.player.reviveT = Math.max(0, this.player.reviveT - dt)
    }

    /*
     * AND SO DOES BEING DOWN, for the same reason.
     *
     * Nothing is simulated in this phase — `step` never runs — so a countdown
     * kept inside it would never reach the moment the button is offered, and
     * the screen would sit grey forever. This is the wall clock, like the
     * ending and the opening.
     */
    if (this.phase === 'downed') this.player.downedT += Math.min(dt, 0.1)
    if (this.starPull > 0) this.starPull = Math.max(0, this.starPull - dt)

    /*
     * THE OPENING OWNS THE FRAME, and takes the simulation out of the loop.
     *
     * Same treatment the ending gets, for the same reason: it is a scene, it
     * runs on the wall clock, and nothing in it is simulated. Returning here
     * rather than guarding the systems individually is what makes it true that
     * he cannot shoot, dash or be shot at during his own introduction — there
     * is no path to any of it.
     */
    if (this.cine && this.phase === 'playing') {
      this.accumulator = 0
      /*
       * ONE CLAMPED dt FOR BOTH, and they must be the same one.
       *
       * A press stays readable for `Input.BUFFER` of the clock `tick` advances
       * — so handing `tick` the raw frame time lets a single long frame (a tab
       * coming back, a stall, a throttled background window) push the clock
       * past the buffer BEFORE the scene has read it, and the skip key
       * silently does nothing. Clamped, no frame can ever outrun the buffer.
       */
      const cdt = Math.min(dt, 0.1)
      this.input.tick(cdt)
      updateOpening(this, cdt)
      if (this.cine.over) this.endOpening()
      render(this)
      this.snapshotClock += dt
      if (this.snapshotClock > 1 / 15) { this.snapshotClock = 0; this.push() }
      return
    }

    const simulating = this.phase === 'playing'
    if (simulating) {
      /*
       * TIME IS NOT ALWAYS 1:1.
       *
       * Scaling what goes INTO the accumulator rather than the step itself:
       * the simulation still advances in exact 1/60 slices and stays
       * deterministic, there are simply fewer of them per real second. The
       * only thing in the game that uses this is Reviva — see `reviveScale`.
       */
      // Clamped so an alt-tabbed tab does not try to catch up on ten seconds.
      this.accumulator += Math.min(dt, CONFIG.MAX_CATCHUP) * this.reviveScale()
      while (this.accumulator >= CONFIG.STEP) {
        this.step(CONFIG.STEP)
        this.accumulator -= CONFIG.STEP
      }
      const arena = this.activeArena
      /*
       * PARK ON THE ARENA — but only one that FITS.
       *
       * A boss fought in a ring a screen and a half across wants a still
       * camera: chasing the player would swing the barrier off screen every
       * time they dodged, and a boss you cannot see is not a boss.
       *
       * The church interior is four times that. Parking on its centre would
       * leave the player somewhere off the edge of their own screen, so past
       * a size the camera goes back to following him and simply refuses to
       * show anything outside the walls. The threshold is the arena fitting
       * inside about one and a half views, which is exactly the case the
       * parked camera was written for.
       */
      const parks = !!arena
        && arena.halfW * 2 <= this.camera.viewW * 1.6
        && arena.halfH * 2 <= this.camera.viewH * 1.6
      if (this.arenaLocked && arena && parks) {
        this.camera.follow(arena.centerX, arena.camY, dt)
      } else if (this.arenaLocked && arena) {
        // Follow him, but never past the wall — the barrier is the edge of the
        // world here and there is nothing drawn on the other side of it.
        const mx = Math.max(0, arena.halfW - this.camera.viewW / 2)
        const my = Math.max(0, arena.halfH - this.camera.viewH / 2)
        this.camera.follow(
          Math.max(arena.centerX - mx, Math.min(arena.centerX + mx, this.player.x)),
          Math.max(arena.centerY - my, Math.min(arena.centerY + my, this.player.y - 12)),
          dt,
        )
      } else {
        this.camera.follow(
          this.player.x, this.player.y - 12, dt,
          this.player.vx / CONFIG.PLAYER.speed, this.player.vy / CONFIG.PLAYER.speed,
        )
      }
    } else if (this.phase === 'ending') {
      /*
       * THE CLOSING SEQUENCE RUNS ON REAL TIME, not on the accumulator.
       *
       * Nothing in it is simulated — there is no physics to keep
       * deterministic — and a cutscene stepped through the fixed-timestep loop
       * stutters on exactly the frames a cutscene most wants to be smooth. It
       * drives the camera itself, so `follow` is called only to let the shake
       * decay: passing the camera its own position holds it still.
       */
      this.accumulator = 0
      updateEnding(this, Math.min(dt, 0.1))
      this.camera.follow(this.camera.x, this.camera.y, dt)
    } else {
      this.accumulator = 0
      this.input.clearPressed()
    }

    render(this)

    this.snapshotClock += dt
    if (this.snapshotClock > 1 / 15) { this.snapshotClock = 0; this.push() }
  }

  /** One fixed simulation slice. Order matters — see the comments. */
  private step(dt: number) {
    // Before anything reads a key: the press buffer expires on this clock.
    this.input.tick(dt)

    if (this.input.consumePressed('escape') || this.input.consumePressed('p')) {
      this.togglePause()
      return
    }

    /*
     * THE BLACK LIFTS FIRST, and it lifts DURING the opening title rather
     * than after it — the veil, the banner and the quiet period are one beat,
     * not three in a queue. Above the intro's early return for that reason:
     * everything below it is paused while the title card is up.
     */
    if (this.veil > 0) this.veil = Math.max(0, this.veil - dt * 0.7)

    // The opening title plays out before the run actually starts. He can walk
    // during it; nothing arrives, and the clock has not started.
    if (this.introT > 0) {
      this.introT -= dt
      updatePlayer(this, dt)
      updateProgression(this, dt)
      return
    }

    this.time += dt

    // Before the director, because act three decides whether the director is
    // allowed to run at all this frame.
    updateAct3(this, dt)
    updateAbduction(this, dt)
    updateSpawner(this, dt)

    // Broad phase is rebuilt twice: once for the separation pass, then again
    // after everyone has moved so contact damage and bullets test true positions.
    this.rebuildHash()
    updateEnemies(this, dt)
    this.rebuildHash()

    updatePlayer(this, dt)
    updateAbilities(this, dt)
    updateCobson(this, dt)
    updateHelpers(this, dt)
    updateBullets(this, dt)
    updateBombs(this, dt)

    // Effects are pure decoration, so they are stepped after everything that
    // could have spawned one and answer to nothing but their own clock.
    for (let i = this.fx.items.length - 1; i >= 0; i--) {
      const f = this.fx.items[i]
      f.t += dt
      if (f.t >= f.life) this.fx.removeAt(i)
    }
    updatePoison(this, dt)
    updatePickups(this, dt)
    updateFloaters(this, dt)
    updateProgression(this, dt)
    this.placeWorldItems()
  }

  private rebuildHash() {
    this.hash.clear()
    const items = this.enemies.items
    for (let i = 0; i < items.length; i++) this.hash.insert(i, items[i].x, items[i].y)
  }

  // ---------------------------------------------------------------- SPAWNS --

  /**
   * WHETHER THIS ONE COMES IN BIG.
   *
   * Everything excluded here is excluded because being five times harder to
   * kill would break something rather than make it harder: a boss already has
   * a script, a pillar is furniture the player is crossing a room to switch
   * off, and act three's timed clear is a DPS check whose whole meaning is the
   * clock — one unkillable body in it turns a test into a coin flip.
   */
  private rollMiniBoss(def: EnemyDef): boolean {
    const M = CONFIG.MINIBOSS
    if (def.elite || def.stages) return false
    if (def.behavior === 'boss' || def.behavior === 'idle') return false
    if (this.player.reach < M.fromX) return false
    // The act three script owns the field whenever it has an opinion about it.
    if (this.waveOverride || this.waveHold) return false
    if (Math.random() >= M.chance) return false

    /*
     * Counted off the pool rather than tracked in a field. A counter would
     * have to be decremented on death, on despawn AND on the director
     * recycling one off-screen, and the pool has already caught this project
     * out three times — this is a handful of iterations on a 5% roll.
     */
    let alive = 0
    for (const e of this.enemies.items) if (e.buffed && ++alive >= M.maxAlive) return false
    return true
  }

  spawnEnemy(def: EnemyDef, x: number, y: number): Enemy | null {
    const e = this.enemies.spawn()
    if (!e) return null
    e.x = x; e.y = y
    e.vx = 0; e.vy = 0
    e.kx = 0; e.ky = 0
    e.def = def
    /*
     * A small roll on health, ±12%.
     *
     * Not a difficulty knob — it is there so that a row of the same species
     * does not die in perfect unison. Identical health makes a crowd read as
     * one object being deleted a slice at a time; a little scatter makes it
     * read as a crowd. Elites and the boss are exact, because a boss whose
     * health bar means something different every run is just noise.
     */
    /*
     * ONE OF THE BIG ONES? Rolled here rather than at the call sites so the
     * trickle, the formations and the set-piece mixins all get the same odds
     * from the same rule.
     */
    e.buffed = this.rollMiniBoss(def)
    /*
     * AND HOW FAR ALONG THE ROAD IS. See CONFIG.SCALE.
     *
     * Bosses are exempt because their health is written per stage against a
     * measured time-to-kill; scaling those as well would mean tuning the same
     * number in two places and losing to whichever one moved last.
     */
    const road = roadScale(def.elite ? 0 : this.player.reach)
    e.hpMul = (e.buffed ? CONFIG.MINIBOSS.hp : 1) * road.hp
    e.dmg = def.damage * (e.buffed ? CONFIG.MINIBOSS.damage : 1) * road.damage
    e.radius = def.radius * (e.buffed ? CONFIG.MINIBOSS.scale : 1)
    e.maxHp = def.elite ? def.hp : Math.round(def.hp * (0.88 + Math.random() * 0.24))
    e.maxHp = Math.round(e.maxHp * e.hpMul)
    e.hp = e.maxHp
    e.anim = Math.random() * 3
    e.flip = false
    e.flash = 0
    e.poison = 0
    e.poisonStacks = 0
    e.poisonDps = 0
    // Pooled: a body that burned last life must not arrive alight, and one
    // that was loved must not arrive still on the player's side.
    e.burnT = 0
    e.burnDps = 0
    e.clawCd = 0
    e.allyT = 0
    e.attackCd = 0
    e.state = 0
    e.phase = 0
    e.seed = Math.random()
    // Fresh identity every time the object leaves the pool, so a mark on the
    // body that used to be here cannot land on the one that replaced it.
    e.uid = ++this.nextEnemyUid
    // Minhocas arrive underground; everything else is simply always “up”.
    e.depth = def.behavior === 'burrow' ? 0 : 1
    e.variant = def.sheets ? (Math.random() * def.sheets.length) | 0 : 0
    e.broken = false
    e.awake = !def.detectRange
    e.fuse = 0
    e.burstCd = def.brokenBurst ? def.brokenBurst.interval * Math.random() : 0
    e.stealCd = 0
    e.orbitCd = 0
    e.tornadoCd = 0
    e.rainCd = 0
    e.barsLeft = def.bars ?? 1
    e.invulnT = 0
    e.stage = 0
    e.shielded = false

    // First of its kind: O Indígena has something to say about it.
    if (def.bark && !this.seenSpecies.has(def.id)) {
      this.seenSpecies.add(def.id)
      this.say(def.bark)
    }
    // And so does one that came in at half again the usual size.
    else if (e.buffed) this.react('bigOne', undefined, 25)
    return e
  }

  spawnBullet(
    x: number, y: number, vx: number, vy: number,
    damage: number, pierce: number, radius: number, knockback: number, friendly: boolean,
    kind: Bullet['kind'] = 'bala', life?: number, ammo: Bullet['ammo'] = null,
  ): Bullet | null {
    const b = this.bullets.spawn()
    if (!b) return null
    b.x = x; b.y = y
    b.vx = vx; b.vy = vy
    b.life = life ?? (friendly ? 330 : 520)
    b.damage = damage
    b.pierce = pierce
    b.radius = radius
    b.knockback = knockback
    b.friendly = friendly
    b.hitCd = 0
    b.counted = false
    b.bounces = ammo ? (AMMO[ammo].bounces ?? 0) : 0
    /*
     * AND THE TRIGGER IS PULLED HERE, once per round that leaves the barrel.
     *
     * Counted at the spawn rather than at the shot, so a build firing three
     * projectiles a trigger is three shots — which is what accuracy should
     * mean for a weapon that sprays. Only the player's; the aliens' misses are
     * their own business.
     */
    if (friendly && kind === 'bala') this.runStats.shots += 1
    b.kind = kind
    b.ammo = ammo
    b.spin = Math.random() * Math.PI * 2
    /*
     * Cleared on every spawn, not just set by the callers that want them.
     * These live on a pooled object: a bullet that was a boomerang last life
     * and is a revolver round this one would still curve back, which is the
     * kind of bug that looks like physics.
     */
    b.age = 0
    b.chain = 0
    b.boomerang = 0
    b.bmSpeed = 0
    b.bmX = 0
    b.bmY = 0
    b.homing = 0
    // Returned so a caller can make it something stranger than a bullet.
    return b
  }

  /**
   * Brings out a homúnculo. `instant` skips the summoning wait, which is what
   * the totem does — a totem you picked up should do something now, not in
   * five seconds.
   */
  summonHelper(instant = false) {
    const h = this.helpers.spawn()
    if (!h) return
    const H = ABILITIES.homunculo
    const stacks = Math.max(1, this.player.abilities.homunculo.stacks)
    const a = Math.random() * Math.PI * 2
    h.x = this.player.x + Math.cos(a) * 26
    h.y = this.player.y + Math.sin(a) * 18
    h.vx = 0; h.vy = 0
    h.maxHp = at(H.hp, stacks)
    h.hp = h.maxHp
    h.thorns = at(H.thorns, stacks)
    h.anim = 0
    h.flip = false
    h.flash = 0
    h.hitCd = 0
    h.age = 0
    h.hit = at(ABILITIES.homunculo.attack, stacks) * this.player.mods.damage
      * this.player.mods.ability
    h.swingCd = 0
    h.swing = 0
    h.slot = this.helpers.count - 1
    if (instant) this.say('Vem cá, bichinho.')
  }

  /**
   * An explosion at a point: damage with falloff, and the ring that sells it.
   *
   * Shared by Bombas do Louro and by explosive rounds so both feel the same —
   * a blast is a blast, and having two of them tuned separately is how they
   * end up looking like two different games.
   */
  detonate(x: number, y: number, damage: number, radius: number) {
    const r2 = radius * radius
    for (let j = this.enemies.items.length - 1; j >= 0; j--) {
      const e = this.enemies.items[j]
      const dx = e.x - x
      const dy = e.y - y
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const d = Math.sqrt(d2) || 1
      // Survivable at the rim, not survivable on top of it.
      const falloff = 0.45 + 0.55 * (1 - d / radius)
      this.damageEnemy(j, damage * falloff, (dx / d) * 220, (dy / d) * 220, false, true)
    }
    this.spawnBlast(x, y, radius)
  }

  /**
   * EVERY ORB ON THE MAP, AT ONCE.
   *
   * Not collected — CALLED. They are magnetised where they lie and fly in
   * under their own homing, which takes a distant one several seconds and is
   * the entire point: the reward for a Estrela is watching a run's worth of
   * abandoned corn come over the horizon at you. Awarding the XP silently
   * would be the same number and none of the moment.
   *
   * Totems are exempt, as they are from the ordinary magnet: finding one is
   * meant to mean walking to it.
   */
  callAllCorn() {
    const items = this.pickups.items
    let n = 0
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'totem' || it.magnetised) continue
      it.magnetised = true
      /*
       * STARTED AT SPEED rather than from nothing. The homing ramps at 1100
       * a second from a standstill, which for an orb two thousand units away
       * is most of a second of it sitting there looking broken.
       */
      it.speed = 260
      n++
    }
    /*
     * IT ANNOUNCES ITSELF, BUT NOT WITH A SHEET.
     *
     * There was a `spawnBlast(240)` here, which resolves to `nebula` — a pale
     * cloud drawn at three hundred units across. It is the right effect for a
     * boss's health bar detonating and completely wrong for this: it is WHITE,
     * it is enormous, and it sat on top of the one thing the item exists to
     * show for the entire second the corn was setting off.
     *
     * `starPull` is a ring instead: stroked, gold, expanding, and gone in
     * three quarters of a second. It says WHERE the pull came from and then
     * gets out of the way of the corn. See `drawStarPull`.
     */
    this.starPull = 0.75
    this.camera.addShake(0.3)
    this.audio.play('totem', { volume: 0.95 })
    this.say(n > 60 ? 'Ó O TANTO DE MILHO.' : 'Vem cá, milharada.')
  }

  /**
   * HE EATS IT AND IT GOES OFF.
   *
   * Centred on him, and it does NOT hurt him — this is a pickup, and a pickup
   * that can kill you is a trap, which is a different item in a different
   * game. What it costs is position: you had to walk to it.
   *
   * The damage is flat and deliberately ignores `mods.damage`. Everything else
   * the player owns scales with their build; this one is worth the same at
   * level three and at level forty, so it stays a moment early on and becomes
   * a piece of crowd control later rather than a screen-clear that scales past
   * every other card.
   */
  eatBomb(value: number) {
    const p = this.player
    const B = CONFIG.BOMB_FOOD
    // `detonate` draws the blast itself — adding a second one here stacked two
    // explosion sheets on the same pixel and whited the screen out.
    this.detonate(p.x, p.y - 6, value, B.radius)
    this.camera.addShake(0.85)
    this.audio.play('boom', { volume: 1 })
    this.spawnFloater(p.x, p.y - 48, 'BUM!', '#ffb15c')
    this.say('Comi. Me arrependo de nada.')
  }

  /**
   * A BLAST, at whatever size the caller needs.
   *
   * One expanding circle used to do every job here — a dash kicking dust, a
   * mushroom popping, and a boss's health bar detonating all drew the same
   * shape at a different radius, which is why none of them landed. Three
   * sheets now, chosen by how big the thing is, because a shockwave and an
   * explosion are not the same event at different scales.
   *
   * The radius still means what it always meant, so no caller changes.
   */
  spawnBlast(x: number, y: number, radius: number) {
    const key: EffectKey = radius < 46 ? 'ring' : radius < 200 ? 'boom' : 'nebula'
    const def = EFFECTS[key]
    // The sheets are authored at a natural size; scaling from the requested
    // radius is what keeps a 12-unit dust kick and a 300-unit detonation
    // reading as the same family of event.
    this.spawnFx(key, x, y, (radius * 2) / def.size)
  }


  /** Lobs a Bomba do Louro at a spot on the ground. */
  /**
   * Starts one effect at a point and forgets about it.
   *
   * Returns nothing, because there is nothing a caller should do with it: the
   * pool may be full, and an effect that did not spawn must never be a
   * behaviour change. Everything here is decoration over damage that has
   * already been dealt.
   */
  spawnFx(key: EffectKey, x: number, y: number, scale = 1, rot = 0) {
    const def = EFFECTS[key]
    if (!def) return
    const f = this.fx.spawn()
    if (!f) return
    f.key = key
    f.x = x
    f.y = y
    f.t = 0
    f.life = def.frames / def.fps
    f.scale = scale
    f.rot = rot
    f.ground = def.ground ?? false
  }

  /** A body coming apart, in one of five sprays. */
  spawnBlood(x: number, y: number, scale = 1) {
    this.spawnFx(BLOOD[(Math.random() * BLOOD.length) | 0], x, y, scale)
  }

  /**
   * AN ANVIL, dropped straight down onto a spot near him.
   *
   * IT DOES NOT EXPLODE. The damage is the anvil arriving — a shadow is cast
   * the moment it is thrown, grows for as long as it is in the air, and
   * whatever is standing in it when the iron lands takes the hit. There is no
   * fuse, no blast and no falloff: the telegraph is the fall, and the time you
   * have to move is exactly the time you can see it coming.
   *
   * It rides the bomb pool because the flight already exists, but everything
   * that made a bomb a bomb — the fuse, the blink, the burst — is off.
   */
  spawnAnvil(tx: number, ty: number, damage: number, selfDamage: number, radius: number) {
    const b = this.bombs.spawn()
    if (!b) return
    b.hostile = false
    b.anvil = true
    b.selfDamage = selfDamage
    // Straight down, from above the top of any sane view.
    b.sx = tx
    b.sy = ty - 300
    b.tx = tx; b.ty = ty
    b.x = b.sx; b.y = b.sy
    b.t = 0
    b.flight = ABILITIES.bigorna.fall
    // No fuse. It lands and that is the event.
    b.fuse = 0
    b.damage = damage
    b.radius = radius
    b.exploded = false
    b.blast = 0
    b.rest = 0
  }

  spawnBomb(
    tx: number, ty: number, damage: number, radius: number,
    from?: { x: number; y: number },
  ) {
    const b = this.bombs.spawn()
    if (!b) return
    b.hostile = !!from
    b.sx = from ? from.x : this.player.x
    b.sy = from ? from.y : this.player.y - 14
    b.tx = tx; b.ty = ty
    b.x = b.sx; b.y = b.sy
    b.t = 0
    b.flight = ABILITIES.bomba.flight
    b.fuse = ABILITIES.bomba.fuse
    b.damage = damage
    b.radius = radius
    b.exploded = false
    b.blast = 0
    b.anvil = false
    b.selfDamage = 0
    b.rest = 0
  }

  spawnPickup(kind: Pickup['kind'], x: number, y: number, value: number) {
    let p = this.pickups.spawn()
    /*
     * A FULL FLOOR MUST NEVER COST THE PLAYER XP.
     *
     * `spawn` returns null at capacity and this used to return with it, which
     * meant the drop simply did not happen — the corn stopped coming, for
     * good, and nothing said why. It is the worst shape a bug can have: it
     * costs the player the thing they are working for, it only happens once
     * they are doing well enough to fill the floor, and it is invisible.
     *
     * So at capacity the FURTHEST orb is folded into this one. Its value is
     * carried over rather than discarded, so the total XP on the field is
     * exactly what it would have been with no cap at all; what is lost is one
     * sprite lying somewhere behind the player that they were never going to
     * walk back for. Nothing else is ever consumed — a totem is a landmark
     * and a pão de alho is a decision, and neither is XP to be merged.
     */
    if (!p) {
      const i = this.furthestOrb()
      if (i < 0) return
      const old = this.pickups.items[i]
      if (isOrb(kind) && isOrb(old.kind)) value += old.value
      this.pickups.removeAt(i)
      p = this.pickups.spawn()
      if (!p) return
    }
    const a = Math.random() * Math.PI * 2
    const s = 20 + Math.random() * 40
    p.x = x; p.y = y
    p.vx = Math.cos(a) * s
    p.vy = Math.sin(a) * s
    p.kind = kind
    p.value = value
    p.age = 0
    p.magnetised = false
    p.speed = 0
  }

  /**
   * THE ABANDONED ORB FURTHEST FROM HIM, or -1 if there is nothing to take.
   *
   * Furthest rather than oldest: age says when it was dropped and distance
   * says whether he is ever coming back for it, and the second is the question
   * being asked. Only ever considers orbs — see `isOrb`.
   */
  private furthestOrb(): number {
    const items = this.pickups.items
    const p = this.player
    let best = -1
    let bestD = -1
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!isOrb(it.kind)) continue
      const d = (it.x - p.x) ** 2 + (it.y - p.y) ** 2
      if (d > bestD) { bestD = d; best = i }
    }
    return best
  }

  /**
   * IT DIES, AND NOTHING HIT IT.
   *
   * Executar is not a big number, it is a body stopping — so this runs the
   * whole death path (the blood, the XP, the corn, the streak) with zero
   * damage and `hostile` set, which keeps it out of the run's damage tally and
   * off the crit roll. A finisher that quietly counted as the biggest hit of
   * the run would be a lie on the summary screen.
   */
  executeEnemy(index: number) {
    const e = this.enemies.items[index]
    if (!e) return
    e.hp = 0
    this.damageEnemy(index, 0, 0, 0, true, true)
  }

  /**
   * A HEAD, LEAVING.
   *
   * Aimed at the nearest OTHER body rather than in a random direction: a skull
   * that flies off into the caatinga is a fifteen per cent chance of nothing,
   * and the whole point of the card is that it stays in the crowd it was born
   * in. Falls back to wherever the gun is pointed when there is nothing left.
   */
  throwSkull(x: number, y: number, stacks: number, chain = 1, skip: Enemy | null = null) {
    const C = ABILITIES.cabeca
    const p = this.player
    let ax = p.aimX
    let ay = p.aimY

    /*
     * IT GOES AT SOMEBODY. Two things were stopping that.
     *
     * THE CORPSE WAS THE TARGET. This is called from inside `damageEnemy`,
     * before the dead body leaves the pool, and the body is at the throw point
     * — offset by the eight units the skull spawns above it. So the nearest
     * enemy was always the one that just died, two units straight up, and
     * every head in the game flew vertically off the top of the screen. It is
     * excluded by identity now; a distance floor cannot do it, because a live
     * enemy standing on top of you is a legitimate and very close target.
     *
     * AND THE SEARCH WAS CAPPED at the bounce range, 190 units — about a
     * third of the view. Anything thrown with the field further away than that
     * fell back to wherever the gun happened to be pointing, which on a screen
     * with bodies on it is the same bug wearing a different hat. There is no
     * cap now: the whole field is searched and the aim direction is the answer
     * only when there is genuinely nothing alive to throw at.
     */
    let best = Infinity
    for (const o of this.enemies.items) {
      if (o === skip || o.allyT > 0) continue
      const dx = o.x - x
      const dy = o.y - 10 - y
      const d = dx * dx + dy * dy
      if (d < 1 || d > best) continue
      best = d
      const len = Math.sqrt(d)
      ax = dx / len
      ay = dy / len
    }

    const b = this.spawnBullet(
      x, y, ax * C.speed, ay * C.speed,
      REVOLVER.damage * at(C.damage, stacks) * p.mods.damage * p.mods.ability,
      0, C.radius, 90, true, 'skull', C.life,
    )
    if (!b) return
    b.bounces = at(C.bounces, stacks)
    // Which link of the chain this is. See `Bullet.chain`.
    b.chain = chain
    // Its face, for its whole flight. See `sprites.skull_1`.
    b.spin = Math.random() * Math.PI * 2
    /*
     * DEEPER IN THE CHAIN IS HIGHER AND QUIETER.
     *
     * A run of eight heads at one pitch is one sound played eight times, which
     * on a busy screen is indistinguishable from a stutter. Climbing tells the
     * player, without a number anywhere, that something is still going.
     */
    this.audio.play('punch', {
      volume: 0.4 / (1 + (chain - 1) * 0.28),
      rate: 1.6 + (chain - 1) * 0.12,
      throttle: 0.05, maxVoices: 4,
    })
  }

  /** Bônus de Vida adds, Trocar Vida multiplies, and the multiply is last. */
  rebuildMaxHp() {
    const p = this.player
    p.maxHp = Math.max(1, Math.round((100 + p.mods.maxHp) * p.mods.hpMul))
    if (p.hp > p.maxHp) p.hp = p.maxHp
  }

  spawnFloater(x: number, y: number, text: string, color: string) {
    const f = this.floaters.spawn()
    if (!f) return
    f.x = x + (Math.random() - 0.5) * 8
    f.y = y
    f.vy = -34
    f.life = 0.65
    f.maxLife = 0.65
    f.text = text
    f.color = color
  }

  // --------------------------------------------------------------- DAMAGE --

  /**
   * `silent` skips the flash and the damage number. Poison ticks sixty times a
   * second per enemy; showing a floater for each would bury the screen and
   * exhaust the pool instantly.
   */
  /**
   * `hostile` marks damage the player did not deal — the Doido do Carro
   * ploughing a crowd, an egg going off next to one. Those do not roll crits,
   * because a crit is the player's luck and nobody else's.
   */
  damageEnemy(
    index: number, amount: number, kx: number, ky: number,
    silent = false, hostile = false,
    /*
     * DID A SKULL DO THIS, AND WHICH LINK OF THE CHAIN WAS IT?
     *
     * 0 for everything that is not Arranca Cabeça, which is every other call
     * site in the program — defaulted, so none of them changed. 1 or more is
     * a head, and the number decides how likely that head is to take the next
     * one. See `ABILITIES.cabeca.chainChance`.
     *
     * It was a BOOLEAN that meant "refuse to chain". The chain is wanted now;
     * what stops it running away is the decay, not a wall.
     *
     * NEGATIVE MEANS A HEAD THAT HAS ALREADY HAD ITS ROLL. See `combat`: a
     * head that bounces four times could kill four bodies, and rolling on each
     * of them would make this a TREE rather than a chain — branching about
     * five to one per link, which no amount of decay contains. One roll per
     * head, spent on its first kill.
     */
    skullChain = 0,
  ) {
    const e = this.enemies.items[index]
    if (!e) return
    /*
     * COUNTED HERE, at the one place damage is dealt.
     *
     * Before the shield and the invulnerability checks below would have been
     * wrong — a number the player never saw is not damage they did. `hostile`
     * is an enemy hurting another enemy, which is also not theirs.
     */
    if (!hostile && e.invulnT <= 0 && !e.shielded) {
      this.runStats.damage += amount
      if (amount > this.runStats.bestHit) this.runStats.bestHit = amount
    }
    // Untouchable between bars, while the transformation plays.
    if (e.invulnT > 0) return
    /*
     * A MINHOCA UNDER THE GROUND IS NOT A TARGET.
     *
     * Deliberately not `invulnT`, which is a window that runs down on its own
     * — this is a state she chooses and leaves. Nothing gets through, not
     * explosions, not burn ticks, not the fire ring: “immune while buried” has
     * to mean immune, or the species is just a sprite that sinks a bit.
     */
    if (e.def.behavior === 'burrow' && e.depth <= 0.5) return
    /*
     * A SHIELD THE PLAYER IS MEANT TO SEE.
     *
     * Unlike `invulnT` this is not a window to wait out — it is a wall with a
     * switch somewhere else in the room, and it says so. Damage bounces with a
     * number the player can read, because silently absorbing fire is how you
     * teach someone that their build stopped working.
     */
    if (e.shielded) {
      if (!silent) {
        e.flash = HIT_FLASH
        this.spawnFloater(e.x, e.y - (e.def.size ?? 22), 'BLINDADO', '#8ef0d0')
      }
      return
    }

    /*
     * THE LUCK ROLL, on every single point of damage the player deals.
     *
     * Here rather than at the call sites so it covers the revolver, bombs,
     * fish, the orbital ring and the brick alike — one roll, one rule, and a
     * luck build feels its sorte everywhere instead of only on bullets. It is
     * also where the scaling that came out of Melhorar a Arma went: damage
     * used to be a number you compounded, and is now partly a number you roll.
     */
    let crit = false
    if (!hostile && Math.random() < critChance(this.player.mods.luck)) {
      crit = true
      amount *= CRIT_MULT
    }

    /*
     * Some things break instead of dying to the first thing that touches them.
     *
     * The hit is absorbed entirely — a bomb landing on a whole Coisa Voadora
     * does exactly what a single bullet does, which is the point: you cannot
     * delete one before it gets to be dangerous, you can only start the fight
     * with it. Handled here rather than in the bullet code so every damage
     * source in the game goes through the same rule.
     */
    if (e.def.breaksOnFirstHit && !e.broken) {
      e.broken = true
      e.hp = e.def.brokenHp
        ? Math.round(e.def.brokenHp * (0.88 + Math.random() * 0.24) * e.hpMul)
        : e.maxHp
      e.flash = HIT_FLASH * 1.4
      e.kx += kx / (e.def.mass ?? 1)
      e.ky += ky / (e.def.mass ?? 1)
      // Start its first vent part-charged so breaking one is felt immediately.
      if (e.def.brokenBurst) e.burstCd = e.def.brokenBurst.interval * 0.4
      return
    }

    e.hp -= amount
    const resist = e.def.mass ?? 1
    if (!silent) {
      e.flash = HIT_FLASH
      e.kx += kx / resist
      e.ky += ky / resist
      this.spawnFloater(
        e.x, e.y - (e.def.size ?? 22),
        crit ? Math.round(amount) + '!' : String(Math.round(amount)),
        crit ? '#ffd24a' : '#ffe9a8',
      )
    }

    /*
     * NOT DEAD YET.
     *
     * Emptying a bar on something that has more than one is a transformation,
     * not a kill: it goes off like a bomb, refills, and comes back different.
     * Handled here rather than in the boss's own update so that ANY source of
     * damage triggers it — a bomb landing the final point has to do the same
     * thing as a bullet, or the fight has a hole in it.
     */
    /*
     * A ZERO THAT RUNS A SCRIPT.
     *
     * O Chará has six bodies and five bars, and which one he is wearing is a
     * SEQUENCE rather than a function of how hurt he is. `charaAdvance`
     * decides what a zero means at each stage and hands back a live enemy with
     * health on it — or a genuinely dead one, on the last bar.
     */
    if (e.hp <= 0 && e.def.stages) {
      charaAdvance(this, e)
      if (e.hp > 0) { this.push(); return }
    }

    if (e.hp <= 0 && e.barsLeft > 1) {
      e.barsLeft -= 1
      e.hp = e.maxHp
      e.flash = 0.6
      e.invulnT = 1.1
      this.camera.addShake(1.4)
      this.audio.play('boom', { volume: 1 })
      // The detonation. Enormous, and centred on itself — standing next to a
      // boss whose bar just emptied should be the worst place in the world.
      const brk = e.def.barBreak
      this.hostileBlast(e.x, e.y, brk?.radius ?? 300, brk?.damage ?? 92)
      this.spawnBlast(e.x, e.y, brk?.radius ?? 300)
      this.say('EXPLODIU! E LEVANTOU DE NOVO!')
      this.push()
      return
    }

    if (e.hp > 0) return

    this.kills++
    /*
     * A BODY COMES APART.
     *
     * The single largest thing missing from the game before this: four hundred
     * kills a minute and not one of them left a mark. Scaled off the enemy's
     * own radius so a cow and a Grande Gordo do not spray the same amount.
     */
    this.spawnBlood(e.x, e.y - 6, 0.6 + Math.min(1.4, e.radius / 22))
    // Throttled hard: four hundred things can die in the same second, and
    // twelve cows popping at once should be one sound, not twelve.
    this.audio.play(Math.random() < 0.5 ? 'death1' : 'death2', {
      volume: 0.4, throttle: 0.07, maxVoices: 4,
    })
    if (this.kills >= this.streakAt + 90) {
      this.streakAt = this.kills
      this.react('killStreak')
    }
    if (this.player.mods.lifesteal > 0) this.heal(this.player.mods.lifesteal, true)
    /*
     * WHAT IT LEAVES BEHIND.
     *
     * Three tiers, and which one it is says what just died. `bossRef` rather
     * than `behavior === 'boss'` on purpose: O Chará is several bodies over
     * one fight and only the one the health bar is pointing at is the end of
     * it — the others would each have dropped a boss corn.
     */
    if (e.buffed) this.runStats.miniBosses += 1

    /*
     * ARRANCA CABEÇA. The head comes off and goes looking for another one.
     *
     * Rolled HERE, on the death, because that is what the ability is: it has
     * no cooldown and no rhythm, it simply pays out in proportion to how well
     * the run is already going.
     *
     * TWO DIFFERENT ROLLS, and which one applies is the whole shape of the
     * ability. A kill by anything else is the ABILITY's roll — fifteen per
     * cent at one stack — and starts a chain at link one. A kill by a head is
     * the CHAIN's roll: eighty per cent for the first head, ten points less
     * for every one after it, zero by the eighth. So the ability is rare to
     * trigger and spectacular once it does, which is a better shape than a
     * flat chance that pays out constantly and never means anything.
     *
     * Never off a boss, whose death already has a whole sequence attached, and
     * never off an ally.
     */
    const cab = this.player.abilities.cabeca
    if (cab.stacks > 0 && e.def.behavior !== 'boss') {
      const C = ABILITIES.cabeca
      const chance = skullChain > 0
        ? C.chainChance - C.chainStep * (skullChain - 1)
        : skullChain === 0 ? at(C.chance, cab.stacks) : 0
      if (chance > 0 && Math.random() < chance) {
        // `e` is still in the pool for a few more lines. Without excluding it
        // the head aims at the corpse it came off and flies straight up.
        this.throwSkull(e.x, e.y - 8, cab.stacks, Math.max(0, skullChain) + 1, e)
      }
    }
    const pace = this.xpPace()
    if (e === this.bossRef) {
      this.spawnPickup('corn_boss', e.x, e.y, CONFIG.CORN.boss * pace)
    } else if (e.buffed) {
      this.spawnPickup(
        'corn_mini', e.x, e.y,
        (e.def.xp * CONFIG.MINIBOSS.xp + CONFIG.CORN.mini) * pace,
      )
    } else {
      this.spawnPickup('xp', e.x, e.y, e.def.xp * pace)
    }

    /*
     * SOMETHING BIG WENT DOWN.
     *
     * Scaled by how big it was and nothing else, so a cow is silent and a
     * Come-Tudo is felt across the room. Gated on size rather than on species
     * because there are four hundred bodies on the field now and a kick per
     * kill would be a permanent tremor — this fires on maybe one death in
     * thirty, which is what makes it mean anything.
     */
    const bulk = (e.def.size ?? 22) * (e.buffed ? CONFIG.MINIBOSS.scale : 1)
    if (bulk >= 34 && this.camera.shaking < 0.22) {
      this.camera.addShake(Math.min(0.4, 0.06 + bulk / 260))
      // And it makes a noise going down, which nothing big ever did.
      this.audio.play('drop', { volume: 0.5, rate: 0.8, throttle: 0.12, maxVoices: 2 })
    }
    if (Math.random() < 0.012 * dropBonus(this.player.mods.luck)) {
      this.spawnPickup('heal', e.x, e.y, 20)
    }
    // And, very occasionally, something that is not a reward. See CONFIG.
    if (Math.random() < CONFIG.BOMB_FOOD.chance * dropBonus(this.player.mods.luck)) {
      this.spawnPickup('bomb', e.x, e.y, CONFIG.BOMB_FOOD.damage)
    }
    if (Math.random() < CONFIG.STAR.chance * dropBonus(this.player.mods.luck)) {
      this.spawnPickup('star', e.x, e.y, 1)
    }

    if (e === this.bossRef) {
      this.audio.play('boom', { volume: 1 })
      /*
       * A boss leaves something behind. The Microsoft drops a pão de alho on
       * the spot — the fight before the church should hand you back some of
       * what it took, or arriving at the last act is decided by how the last
       * one ended rather than by the last one itself.
       */
      if (e.def.id === 'microsoft') {
        this.spawnPickup('heal', e.x, e.y, 60)
        this.spawnPickup('heal', e.x - 26, e.y + 14, 60)
      }
      this.bossRef = null
      this.camera.addShake(1)

      /*
       * WHO OWNS THE ROOM.
       *
       * A gate boss owns the arena it was dropped into, so killing it opens
       * the barrier. A SCRIPTED one does not: act three closed that barrier
       * itself, on the door, and is going to keep using it for two more
       * fights. Tearing it down here let the player walk out of the church in
       * the middle of act three.
       */
      if (!e.def.scripted) {
        this.arenaLocked = false
        this.activeArena = null
      }

      /*
       * AND WHO ENDS THE RUN.
       *
       * `stages` is the flag for it, and only O Chará carries it. This used to
       * read `stages || stageIndex >= STAGES.length - 1` — a safety net for a
       * final act with a gate boss, which act three is not. The moment act
       * three grew a mid-boss that clause became a trapdoor: the Beholder dies
       * while `stageIndex` is already the last one, so beating the MIDPOINT
       * triggered the ending and won the game before O Chará had appeared.
       *
       * Beating the riot opens the road into Floriano; putting O Chará down
       * hands over to the closing sequence, which is where a run actually
       * finishes. See `systems/ending.ts`.
       */
      if (e.def.stages) {
        this.ending = makeEnding()
        this.phase = 'ending'
      } else {
        this.say(BOSS_CLEARED[e.def.id] ?? 'Passei. Segue o jogo.')
      }
      this.push()
    }
    this.enemies.removeAt(index)
  }

  /**
   * Adds a temporary buff or curse, replacing any earlier one with the same
   * id rather than stacking it — two Mão Quentes running at once would be a
   * multiplier nobody can reason about, and a refreshed timer reads the same
   * to the player anyway.
   */
  addEffect(fx: TempEffect) {
    const i = this.player.effects.findIndex((e) => e.id === fx.id)
    if (i >= 0) this.player.effects[i] = fx
    else this.player.effects.push(fx)
    this.spawnFloater(
      this.player.x, this.player.y - 46, fx.label,
      fx.good ? '#9be8b0' : '#ff9b9b',
    )
    this.push()
  }

  /** The product of every running effect's multiplier for one stat. */
  effectMul(key: 'damage' | 'fireRate' | 'speed' | 'range'): number {
    let m = 1
    for (const e of this.player.effects) m *= e[key] ?? 1
    return m
  }

  /**
   * A blast the PLAYER caused: Tupã's bolt, or the gamble going off in his
   * hand. Hurts the horde and nothing else — the self-damage half of a bad
   * roll is applied by the caller, so that the two halves stay readable.
   */
  playerBlast(x: number, y: number, radius: number, damage: number) {
    this.audio.play('boom', { volume: 0.6, throttle: 0.09, maxVoices: 3 })
    const r2 = radius * radius
    for (let j = this.enemies.items.length - 1; j >= 0; j--) {
      const e = this.enemies.items[j]
      const dx = e.x - x
      const dy = e.y - y
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const d = Math.sqrt(d2) || 1
      const falloff = 0.5 + 0.5 * (1 - d / radius)
      this.damageEnemy(j, damage * falloff, (dx / d) * 240, (dy / d) * 240)
    }
    this.spawnBlast(x, y, radius)
    this.camera.addShake(0.5)
  }

  damagePlayer(amount: number) {
    const p = this.player
    if (p.invuln > 0) return
    if (p.shield > 0) {
      // RNG de RPG: the roll came up, so this one costs nothing.
      this.spawnFloater(p.x, p.y - 34, 'BLOQUEIO', '#8fd4ff')
      this.audio.play('block', { volume: 0.5, throttle: 0.15 })
      return
    }
    if (p.absorb > 0) {
      // ESCUDO ALIEN eats the whole blow, however big it was. That is the
      // point of a charge over a duration: it is spent on the hit that came,
      // not on the seconds you happened to be standing in.
      p.absorb -= 1
      p.invuln = CONFIG.PLAYER.iframes
      this.spawnFloater(p.x, p.y - 34, 'ABSORVIDO', '#9be8b0')
      this.audio.play('block', { volume: 0.7 })
      this.camera.addShake(0.2)
      return
    }

    /*
     * COLETE DE COURO. Flat, and it can never reduce a blow past a scratch —
     * armour is meant to make a graze survivable, not to make small enemies
     * stop existing. Contact hurts enough now that a percentage would have
     * been worth nothing early and far too much late.
     */
    if (p.mods.armour > 0) amount = Math.max(1, amount - p.mods.armour)

    /*
     * AND THE LONGEST HE WENT WITHOUT THIS HAPPENING.
     *
     * `sinceHit` is about to be cleared and it is the only record of the
     * streak, so it is banked first. Out-of-combat regen already keeps this
     * number honest; the summary just reads it at its high-water mark.
     */
    if (p.sinceHit > this.runStats.bestStreak) this.runStats.bestStreak = p.sinceHit
    this.runStats.taken += amount
    p.hp -= amount
    p.sinceHit = 0
    p.invuln = CONFIG.PLAYER.iframes
    this.audio.play('hurt', { volume: 0.7, throttle: 0.2 })
    /*
     * SCALED TO THE BLOW. A flat kick meant a graze off a bee and a car to the
     * chest moved the screen exactly the same amount, which is the one place a
     * shake actually carries information.
     */
    this.camera.addShake(0.2 + Math.min(0.45, amount / p.maxHp))
    if (p.hp > 0 && p.hp / p.maxHp < 0.34) this.react('lowHealth', 'lowHealth')
    this.spawnFloater(p.x, p.y - 30, '-' + Math.round(amount), '#ff8a8a')
    if (p.hp > 0) return

    if (p.mods.revives > 0) { this.goDown(); return }

    p.hp = 0
    this.endRun('dead')
    this.audio.play('gameOver', { volume: 0.9 })
  }

  /**
   * HE BURSTS, AND THE WORLD STOPS.
   *
   * The old Reviva was a white flash and a shockwave inside a third of a
   * second, and the player did not perceive that they had died — which makes a
   * banked life the most expensive resource in the game and also the least
   * felt. So dying now takes the screen: he comes apart in blood, the colour
   * drains out of everything, and the run sits there until somebody presses a
   * button that says VOLTAR À VIDA.
   *
   * All of the getting-up — the shockwave, the health, the slow motion — has
   * moved to `standUp`, on the far side of that press.
   *
   * `downedT` is the only state this sets. The grey, the prompt and how he is
   * drawn all read the same clock, so they cannot drift apart.
   */
  private goDown() {
    const p = this.player
    p.hp = 0
    p.downedT = 0
    this.phase = 'downed'

    /*
     * HE COMES APART. Nine sprays over half a second of frames rather than one
     * big one: a single burst is an effect playing, several overlapping at
     * different sizes and offsets is a body doing something.
     */
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random()
      const d = Math.random() * 18
      this.spawnBlood(p.x + Math.cos(a) * d, p.y - 10 + Math.sin(a) * d * 0.6, 0.9 + Math.random() * 1.5)
    }
    this.spawnBlast(p.x, p.y - 8, 54)
    this.camera.addShake(1)
    this.audio.play('boom', { volume: 0.85, rate: 0.7 })
    this.audio.play('death1', { volume: 0.9, rate: 0.7 })
    this.audio.play('powerDown', { volume: 0.8 })
    this.push()
  }

  /**
   * AND HE COMES BACK, because somebody asked for it.
   *
   * Everything the old Reviva did on the frame he died, moved to the frame he
   * is brought back on — so the shockwave is the answer to a press rather than
   * something that happened while the player was still reading the screen.
   */
  standUp() {
    const p = this.player
    if (this.phase !== 'downed') return
    const R = CONFIG.REVIVE

    p.mods.revives -= 1
    this.runStats.revivesUsed += 1
    p.hp = Math.round(p.maxHp * R.heal)
    p.invuln = R.invuln
    p.reviveT = R.time
    p.downedT = 0
    p.sinceHit = 0
    this.phase = 'playing'
    this.lastTime = performance.now()

    // Everything within reach goes outward, hard, and is SEEN going.
    this.shoveEnemiesAway(R.push, R.force)
    this.spawnBlast(p.x, p.y, R.push)
    this.camera.addShake(1)
    this.audio.play('levelUp', { volume: 0.9, rate: 0.7 })
    this.audio.play('block', { volume: 1, rate: 0.6 })
    this.audio.play('punch', { volume: 0.8, rate: 0.6 })

    this.spawnFloater(p.x, p.y - 52, 'LEVANTA', '#9bf08a')
    /*
     * AND HOW MANY ARE LEFT, because the whole point of a resource is knowing
     * you have spent one. Shown only while there are any: "0 vidas" over a man
     * who just got up is a threat, not information.
     */
    if (p.mods.revives > 0) {
      this.spawnFloater(p.x, p.y - 74, '+' + p.mods.revives + ' VIDA', '#f6e3be')
    }
    this.say(p.mods.revives > 0
      ? 'Não acabou. Ainda não acabou.'
      : 'Essa foi a última. Agora é sério.')
    this.push()
  }

  /**
   * THE RUN IS OVER, whichever way it went.
   *
   * The summary is built exactly once, HERE, and never again: `summarise`
   * reads the live game and the live game keeps changing — health regenerates
   * on the game-over screen, the clock is still ticking, a bullet in flight
   * can still land. A summary recomputed on every render is a summary whose
   * numbers move while somebody is reading them.
   *
   * See `data/record`.
   */
  endRun(how: 'dead' | 'won') {
    if (this.summary) return
    this.summary = summarise(this, how === 'won')
    this.phase = how
    this.push()
  }

  /** Pushes everything within `radius` outward — used when the player revives. */
  private shoveEnemiesAway(radius: number, force: number) {
    const p = this.player
    for (const e of this.enemies.items) {
      const dx = e.x - p.x
      const dy = e.y - p.y
      const d = Math.hypot(dx, dy)
      if (d > radius || d === 0) continue
      const falloff = 1 - d / radius
      e.kx += (dx / d) * force * falloff
      e.ky += (dy / d) * force * falloff
    }
  }

  /**
   * Damage with no i-frames, for things you are standing in rather than things
   * that hit you.
   *
   * The ordinary path grants half a second of invulnerability per hit, which
   * is right for a body connecting and completely wrong for salt on the
   * ground: it would turn a continuous hazard into one tick every half second
   * regardless of how long you stood in it. The shield still stops it, because
   * the shield is supposed to stop everything.
   */
  damagePlayerOverTime(amount: number) {
    const p = this.player
    if (p.shield > 0 || amount <= 0) return
    // Armour applies here as a fraction, because this arrives sixty times a
    // second: subtracting the full plate from every tick would make standing
    // in salt completely free.
    if (p.mods.armour > 0) amount = Math.max(0, amount - p.mods.armour * 0.02)

    /*
     * IT COUNTS, AND IT SHOWS. Neither used to be true.
     *
     * This path had no feedback of any kind: no sound, no floater, no shake,
     * and it never touched `sinceHit` — so out-of-combat REGEN kept running
     * while the player was being cooked, the health bar wobbled around instead
     * of falling, and when it finally went somewhere the cause was minutes of
     * standing in something with nothing on screen naming it. It did not reach
     * `runStats.taken` either, so the end-of-run summary called it untouched.
     *
     * Everything a blow does is done here too, only rate-limited to suit
     * damage that arrives sixty times a second: the drain is banked and spent
     * as ONE floater every fifth of a second, and the sound is throttled. What
     * is NOT rate-limited is the bookkeeping — the tally and the streak are
     * exact, per tick.
     */
    if (p.sinceHit > this.runStats.bestStreak) this.runStats.bestStreak = p.sinceHit
    this.runStats.taken += amount
    p.sinceHit = 0
    // Read by the renderer for the drain vignette. A tenth of a second, so a
    // hazard left behind stops pulsing almost immediately.
    p.dotT = 0.1
    /*
     * ONE NUMBER EVERY FOUR TENTHS, not one per point of damage.
     *
     * Banking on the AMOUNT alone was wrong in both directions: twenty damage
     * a second produced thirteen floaters (measured) and buried the screen,
     * while a five-a-second trickle would have produced a stream of “-1”s. A
     * clock is what the player actually reads — a steady tick that says how
     * fast it is going — so the bank is spent on time and the number it
     * carries is however much accumulated in the meantime.
     */
    p.dotBank += amount
    if (p.dotFloatT <= 0 && p.dotBank >= 1) {
      p.dotFloatT = 0.4
      this.spawnFloater(
        p.x + (Math.random() - 0.5) * 10, p.y - 30, '-' + Math.round(p.dotBank), '#ff8a8a',
      )
      this.audio.play('hurt', { volume: 0.32, rate: 1.25, throttle: 0.28, maxVoices: 1 })
      p.dotBank = 0
    }

    p.hp -= amount
    if (p.hp > 0) return
    p.hp = 0
    if (p.mods.revives > 0) { this.damagePlayer(0); return }
    this.phase = 'dead'
    this.push()
  }

  /**
   * An enemy explosion. Hurts the player, and hurts the horde too — an egg
   * going off in a crowd should take the crowd with it.
   */
  hostileBlast(x: number, y: number, radius: number, damage: number) {
    this.audio.play('boom', { volume: 0.55, throttle: 0.09, maxVoices: 3 })
    const r2 = radius * radius
    for (let j = this.enemies.items.length - 1; j >= 0; j--) {
      const e = this.enemies.items[j]
      const dx = e.x - x
      const dy = e.y - y
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const d = Math.sqrt(d2) || 1
      this.damageEnemy(j, damage * 0.6, (dx / d) * 200, (dy / d) * 200, false, true)
    }
    const p = this.player
    const pd = Math.hypot(p.x - x, p.y - 12 - y)
    if (pd < radius) this.damagePlayer(damage * (0.5 + 0.5 * (1 - pd / radius)))
    this.spawnBlast(x, y, radius)
    this.camera.addShake(0.35)
  }

  heal(amount: number, quiet = false) {
    const p = this.player
    if (p.hp >= p.maxHp) return
    this.runStats.healed += Math.min(amount, p.maxHp - p.hp)
    p.hp = Math.min(p.maxHp, p.hp + amount)
    // Lifesteal fires on every kill; a floater per kill would bury the screen.
    if (!quiet) this.spawnFloater(p.x, p.y - 30, '+' + Math.round(amount), '#8affa8')
  }

  // ---------------------------------------------------------- PROGRESSION --

  addXp(amount: number) {
    const p = this.player
    p.xp += amount
    this.audio.play('xp', { volume: 0.22, throttle: 0.05, maxVoices: 3 })
    if (p.xp >= p.xpToNext) this.levelUp()
  }

  private levelUp() {
    const p = this.player
    p.xp -= p.xpToNext
    p.level++
    p.xpToNext = xpForLevel(p.level)
    this.audio.play('levelUp', { volume: 0.6 })
    /*
     * A burst, but no shake: the card screen is up on the very next frame and
     * a shake nobody is looking at is a shake that did not happen. The kick
     * for a level belongs on TAKING the card — see `chooseUpgrade`.
     */
    this.spawnBlast(p.x, p.y, 34)
    // Segundo Fôlego, paid out on the thing you were fighting for.
    if (p.mods.levelHeal > 0) this.heal(p.maxHp * p.mods.levelHeal)
    this.offers = rollUpgrades(this)
    if (p.level === 2) this.react('firstLevel', 'firstLevel')
    else this.react('levelUp')
    this.phase = 'levelup'
    this.push()
  }

  /**
   * DEAL AGAIN.
   *
   * Rolls a completely fresh hand rather than replacing one card: the deck
   * weights rarity per roll, so re-rolling one slot at a time would let a
   * player fish for a legendary with three separate pulls off the same
   * budget. One spend, one hand.
   *
   * Guarded on the phase as well as the count. This is reachable from the
   * console and from a button that a stale snapshot could still be showing,
   * and a reroll that lands while the swap prompt is up would change the
   * incoming card out from under the question.
   */
  rerollUpgrades() {
    if (this.phase !== 'levelup' || this.rerolls <= 0) return
    this.rerolls--
    this.offers = rollUpgrades(this)
    /*
     * A COIN GOING IN, then the ticket printing.
     *
     * Two sounds rather than one because the action has two halves and they
     * are half a beat apart: you spend, and then it deals. `gamble` is the
     * arcade coin slot and `ammoSwap` is a ticket printer — the pair reads as
     * a machine doing something for you, which is exactly what a reroll is.
     */
    this.audio.play('gamble', { volume: 0.55 })
    this.audio.play('ammoSwap', { volume: 0.4, rate: 1.15 })
    this.push()
  }

  /** Called by the React card picker. */
  chooseUpgrade(id: string) {
    const up = this.offers.find((u) => u.id === id)

    /*
     * A NEW POWER WITH NOWHERE TO PUT IT.
     *
     * Rather than refusing the card, the run stops and asks what it replaces.
     * That is the whole reason the power bar can be offered past its cap: a
     * build you can change your mind about is a build worth thinking about,
     * and a legendary found at level twenty should be a moment rather than a
     * card greyed out.
     */
    if (up && up.kind === 'power' && !this.taken[up.id]
      && slotsUsed(this).power >= powerCap(this.taken)) {
      this.pendingSwap = up
      // The offers are kept, not cleared: backing out of a swap should return
      // the player to the other two cards, not cost them the level-up. They
      // picked this one before they knew what it would ask of them.
      this.phase = 'swap'
      this.push()
      return
    }

    if (up) {
      // What the bar was before the card, so anything that RAISES it can hand
      // the difference over as health. See `rebuildMaxHp` below.
      const hpBefore = this.player.maxHp
      // Which copy this is, so a repeated card can be worth less than the first.
      up.apply(this.player.mods, (this.taken[up.id] ?? 0) + 1)
      // Taking the card is the moment the choice becomes real.
      this.camera.addShake(0.22)
      up.onTake?.((n) => this.heal(n))
      if (up.ammo && !this.player.ammo.includes(up.ammo)) {
        this.player.ammo.push(up.ammo)
        // Load it straight away — collecting ammo should be felt, not filed.
        this.player.ammoIndex = this.player.ammo.length - 1
        this.audio.play('ammoSwap', { volume: 0.5 })
      this.react('newAmmo')
      }
      if (up.ability) {
        const st = this.player.abilities[up.ability]
        st.stacks += 1
        /*
         * IT GOES OFF THE MOMENT YOU TAKE IT.
         *
         * This used to start the card on a full cooldown, on the reasoning
         * that a power reads as "from here on". It does not: what a player
         * actually experiences is picking Cogumelo, watching nothing happen,
         * and only seeing a mushroom eight seconds later with no way to
         * connect the two. The card has to prove what it is while the choice
         * is still in mind — so a brand new ability fires on the next tick,
         * and only the ones already running keep their clock.
         */
        if (st.stacks === 1) st.cd = 0
      }
      this.audio.play('cardTake', { volume: 0.6 })
      this.taken[up.id] = (this.taken[up.id] ?? 0) + 1
      /*
       * THE BAR, REBUILT. Bonuses add, trades multiply, and the multiply
       * comes last — see `PlayerMods.hpMul`. Current health is clamped down
       * with it, because Trocar Vida takes the health you HAVE as well as the
       * health you could have.
       */
      this.rebuildMaxHp()
      /*
       * AND A CARD THAT RAISED THE CEILING HANDS YOU THE ROOM IT MADE.
       *
       * Bônus de Vida used to carry its own `onTake: heal(20)`, because a card
       * that only moves the maximum reads as nothing at all when you are hurt:
       * the bar gets longer and the red part of it gets longer with it. Now
       * that the card is a percentage the number is not knowable at the card,
       * so the rule lives here instead — and covers anything else that ever
       * lifts the bar.
       *
       * Only ever upward. Trocar Vida lowers the ceiling, and `rebuildMaxHp`
       * has already clamped current health down to meet it.
       */
      if (this.player.maxHp > hpBefore) this.heal(this.player.maxHp - hpBefore)
    }
    this.offers = []
    // Enough XP for another level? Stack the card screens instead of losing them.
    if (this.player.xp >= this.player.xpToNext) this.levelUp()
    else { this.phase = 'playing'; this.lastTime = performance.now(); this.push() }
  }

  /**
   * Puts a line in a bubble over the player's head.
   *
   * Queued rather than interrupting: three species can show up in the same
   * second during a wave, and a bark that gets replaced mid-word reads as a
   * glitch. Anything said while he is already talking waits its turn, and the
   * queue is capped so a pile-up cannot leave him monologuing for a minute.
   */
  say(text: string) {
    // Never over a title card. The act banner and a speech bubble land in the
    // same part of the screen, and two blocks of text on top of each other is
    // just noise — the line waits its turn.
    if (!this.bark && !this.banner) { this.bark = { text, t: 0 }; return }
    if (this.barkQueue.length < 3 && !this.barkQueue.includes(text)) {
      this.barkQueue.push(text)
    }
  }

  /**
   * THE BOSS SAYS SOMETHING.
   *
   * `kind` picks the bucket — the slow ambient clock, the moment it turns into
   * whatever comes next, or the moment it has hold of you. A boss with nothing
   * written for that bucket simply stays quiet, which is why every caller can
   * fire without checking.
   */
  bossSay(id: string, kind: 'idle' | 'phase' | 'grab' = 'idle') {
    const set = QUIPS[id]
    const lines = set && set[kind]
    if (!lines || lines.length === 0) return
    const line = pick(lines, this.lastQuip)
    this.lastQuip = line
    this.bossBark = { text: line, t: 0 }
    // Pushed back so an event line is not stepped on by the ambient clock a
    // moment later.
    this.bossBarkCd = Math.max(this.bossBarkCd, 5)
  }

  /**
   * Resolves an arena definition against the road.
   *
   * An arena with no `centerY` is centred on the road wherever it happens to
   * be — the caatinga one has to be, because the road wanders and a fixed Y
   * would put the barrier in a field beside it.
   */
  resolveArena(def: ArenaDef): Arena {
    /*
     * Nudged along the route's own heading rather than in world Y. The way in
     * may be running north-east here, and an arena squared to the world axes
     * would sit at an angle to the direction the player arrives from.
     */
    const head = this.chunks.route.headingAt(def.atDist)
    const at = this.chunks.route.pointAt(def.atDist)
    const centerX = Math.round(at.x)
    const centerY = Math.round(at.y)
    return {
      atDist: def.atDist,
      centerX,
      centerY,
      halfW: def.halfW,
      halfH: def.halfH,
      camY: centerY + def.camOffsetY * Math.cos(head),
      sealed: def.sealed ?? false,
    }
  }


  /**
   * Clears the field for a boss.
   *
   * A boss arrives into an empty arena. Otherwise the fight opens with
   * whatever forty bodies happened to be chasing you through the door, which
   * is not a boss fight, it is the same fight with a bigger sprite in it.
   */
  sweepField(keep?: Enemy | null) {
    /*
     * `keep` exists for act three, where the field is swept in the MIDDLE of
     * a boss fight — the mothership's shield falls, the horde it called goes
     * away, and the thing that called them very much stays. Clearing the pool
     * outright would have deleted the boss along with its own summons.
     */
    if (keep) {
      for (let i = this.enemies.items.length - 1; i >= 0; i--) {
        if (this.enemies.items[i] !== keep) this.enemies.removeAt(i)
      }
    } else {
      this.enemies.clear()
    }
    for (let i = this.bullets.items.length - 1; i >= 0; i--) {
      if (!this.bullets.items[i].friendly) this.bullets.removeAt(i)
    }
    this.camera.addShake(0.6)
  }

  /**
   * A Totem do Homúnculo, picked up off the ground.
   *
   * It grants a permanent slot — so the helper comes back when it dies — AND
   * brings one out immediately, because a rare object you walked across the
   * map for should do something the moment you touch it.
   */
  takeTotem(key: number) {
    this.audio.play('totem', { volume: 0.9 })
    this.totemsTaken.add(key)
    const st = this.player.abilities.homunculo
    st.stacks = Math.min(ABILITIES.homunculo.maxStacks, st.stacks + 1)
    this.summonHelper(true)
    this.spawnFloater(this.player.x, this.player.y - 44, 'TOTEM!', '#ffd479')
    this.camera.addShake(0.25)
  }

  /** Cycles to the next collected ammo type. Bound to E. */
  cycleAmmo() {
    const p = this.player
    if (p.ammo.length < 2) return
    p.ammoIndex = (p.ammoIndex + 1) % p.ammo.length
    this.say(AMMO[p.ammo[p.ammoIndex]].name)
  }

  /**
   * Drops the world's own objects in as their chunks come within reach.
   *
   * Positions are a pure function of the chunk and the seed, so this just has
   * to notice a chunk it has not visited and put whatever lives there on the
   * ground. Chunks already emptied are remembered, so a totem cannot be
   * farmed by walking back and forth over the same patch.
   */
  private placeWorldItems() {
    const l0 = Math.max(0, Math.floor((this.player.reach - 900) / LEG))
    const l1 = Math.floor((this.player.reach + 900) / LEG)

    for (let cx = l0; cx <= l1; cx++) {
      if (this.totemsPlaced.has(cx)) continue
      this.totemsPlaced.add(cx)
      if (this.totemsTaken.has(cx)) continue
      const item = totemInLeg(cx, this.seed, this.chunks.route)
      if (!item) continue
      const p = this.pickups.spawn()
      if (!p) continue
      p.x = item.x; p.y = item.y
      p.vx = 0; p.vy = 0
      p.kind = 'totem'
      p.value = cx
      p.age = 0
      p.magnetised = false
      p.speed = 0
    }
  }

  /**
   * Answers the swap prompt.
   *
   * `dropId` names the power being given up, or null to walk away and keep the
   * build as it stands — declining has to be allowed, or the prompt is a trap
   * rather than a choice. Whatever is dropped is dropped ENTIRELY: every stack
   * of it, not one. Half a Tornado is not a thing anyone wants to be left
   * holding, and the slot has to actually come free.
   */
  resolveSwap(dropId: string | null) {
    const incoming = this.pendingSwap
    this.pendingSwap = null

    if (incoming && dropId) {
      const dropped = UPGRADES.find((u) => u.id === dropId)
      if (dropped?.ability) {
        const st = this.player.abilities[dropped.ability]
        st.stacks = 0
        st.cd = 0
      }
      delete this.taken[dropId]

      // And now take the new one, by the ordinary path.
      incoming.apply(this.player.mods, (this.taken[incoming.id] ?? 0) + 1)
      incoming.onTake?.((n) => this.heal(n))
      if (incoming.ability) {
        const st = this.player.abilities[incoming.ability]
        st.stacks = 1
        // Same rule on a swap: the thing you just traded for shows you what it
        // does, rather than making you wait to find out what you bought.
        st.cd = 0
      }
      this.taken[incoming.id] = 1
      /*
       * THE BAR, REBUILT. Bonuses add, trades multiply, and the multiply
       * comes last — see `PlayerMods.hpMul`. Current health is clamped down
       * with it, because Trocar Vida takes the health you HAVE as well as the
       * health you could have.
       */
      this.rebuildMaxHp()
      this.say('Troquei ' + (dropped?.name ?? 'aquilo') + ' por ' + incoming.name + '.')
    }

    if (!dropId) {
      // Walked away: back to the card screen with the same three on offer.
      this.phase = 'levelup'
      this.push()
      return
    }

    this.offers = []
    // A level-up may have stacked behind this one.
    if (this.player.xp >= this.player.xpToNext) this.levelUp()
    else { this.phase = 'playing'; this.lastTime = performance.now(); this.push() }
  }

  /**
   * Says something from a set, at random, never repeating the last line.
   *
   * `once` keys the reaction so it fires a single time per run. `cooldown` is
   * for the ones that answer to a CONDITION rather than to an event — standing
   * in fire, walking an empty road — where the trigger is true for as long as
   * the situation lasts and without a gate he would say it every frame.
   */
  react(set: BarkSet, once?: string, cooldown?: number) {
    if (once) {
      if (this.said.has(once)) return
      this.said.add(once)
    }
    if (cooldown) {
      if ((this.barkCd[set] ?? 0) > this.time) return
      this.barkCd[set] = this.time + cooldown
    }
    const line = pick(BARKS[set], this.lastBark)
    this.lastBark = line
    this.say(line)
  }

  /**
   * Picks the track for the moment.
   *
   * Called every push rather than on transitions, and `music()` ignores a
   * request for whatever is already playing — so this can be a plain
   * description of "what should be playing right now" instead of a set of
   * change handlers that have to agree with each other.
   */
  private updateMusic() {
    /*
     * THE MENU THEME TAKES ITS TIME.
     *
     * Six seconds rather than one. It cannot start before a gesture — that is
     * the autoplay policy and there is no way round it — so the first thing
     * anybody hears is triggered by their own first touch of the game, and
     * having it fade up under a title that is also fading up is the whole of
     * the opening. Everything else in the game swaps tracks in about a second,
     * which is right for a boss arriving and wrong for a beginning.
     */
    if (this.phase === 'menu') { this.audio.music('menu', 6); return }
    // Dying and winning are not the same event, and neither of them is the
    // main menu — which is what both used to sound like.
    if (this.phase === 'dead') { this.audio.music('gameover'); return }
    if (this.phase === 'won') { this.audio.music('victory'); return }

    /*
     * EVERYTHING BELOW HERE FOLLOWS THE SUN.
     *
     * The soundtrack arrived in two folders named for the halves of the
     * journey — day and night — and the game already has a clock those halves
     * map onto exactly: `timeOfDay`, which runs 0 at the first step of the road
     * to 1 at the church door and drives the whole sky. Using the same number
     * for the music means the track and the light go over together, which is
     * the only version of this that anybody would notice was deliberate.
     *
     * The threshold is PÔR DO SOL — the keyframe where the sky commits to
     * going down rather than merely warming. Track changes are slow enough
     * (see the fade below) that nobody catches the swap; what they catch is
     * that the road does not sound the way it did an hour ago.
     */
    const dusk = timeOfDay(this.player.reach) >= 0.62

    if (this.arenaLocked) {
      /*
       * WHO IS IN THE ARENA. O Chará is the reason for the entire walk, and he
       * had been sharing a track with a fat man made of trash. He gets his own
       * — two of his own, in fact: the first for the man in the mecha, and the
       * second for whatever is left of him after it comes apart.
       */
      let chara: 'chara' | 'charaFinal' | 'mecha' | null = null
      for (const e of this.enemies.items) {
        if (e.def.behavior !== 'boss') continue
        if (e.def.id === 'chara_angry' || e.def.id === 'chara_sword') { chara = 'charaFinal'; break }
        if (e.def.id === 'chara_mecha') { chara = 'mecha'; break }
        if (e.def.id.startsWith('chara')) chara = 'chara'
      }
      this.audio.music(chara ?? (dusk ? 'bossNight' : 'boss'))
      return
    }
    // The Doido do Carro brings his own siren with him.
    for (const e of this.enemies.items) {
      if (e.def.behavior === 'car') { this.audio.music('police'); return }
    }

    const id = STAGES[this.stageIndex]?.id
    /*
     * ACT THREE IS TWO PLACES, and it always sounded like one.
     *
     * The plaza is a walk across an empty square towards a building; the nave
     * is what is waiting inside it. Keying off the act's own state machine
     * rather than off distance means the track turns over on the door, which
     * is the only line in act three anybody remembers crossing.
     */
    if (id === 'church') {
      this.audio.music(this.act3.phase === 'outside' ? 'plaza' : 'church')
      return
    }
    if (id === 'streets') { this.audio.music(dusk ? 'streetsNight' : 'streets'); return }
    /*
     * THE ROAD GETS TWO. The first half of act one is empty country and the
     * second half is not, and one loop across the whole of it is how a walk
     * starts feeling long. The split is the same point the spawn tables start
     * getting serious about it.
     */
    /*
     * AND THE OPENING GETS A LONGER CROSSFADE.
     *
     * The menu theme is still up when the scene starts — the run began about
     * two hundred milliseconds ago — and swapping it out in the usual second
     * puts a hard musical edit right where the letterbox is closing. Three
     * seconds carries the menu underneath the first line and lets the road
     * arrive while he is already walking on it.
     */
    this.audio.music(
      this.player.reach > STAGES[0].endX * 0.5 ? 'roadLate' : 'road',
      this.cine ? 3 : 1.2,
    )
  }

  /** Pops the next queued line, if any. Called by the progression tick. */
  takeQueuedBark(): string | null {
    return this.barkQueue.shift() ?? null
  }

  /** Takes one stack of a random ability. Returns what was taken, or null. */
  /**
   * TRIPA SECA TAKES A STACK OFF SOMETHING.
   *
   * TWO RECORDS HAVE TO MOVE, AND ONLY ONE OF THEM USED TO.
   *
   * `player.abilities[id].stacks` is what the ability RUNS on; `taken[cardId]`
   * is what the player OWNS, and every screen in the game is drawn from the
   * second one — the HUD strip, the slot counters, the level-up deck's idea of
   * what is already yours, the end-of-run summary. Decrementing only the first
   * left the tile sitting on the HUD with a key and a cooldown ring, attached
   * to an ability with nothing in it: the reported bug where the icon stays
   * after you have been robbed.
   *
   * It was worse than a cosmetic desync. The stolen card still held its build
   * slot, so nothing could be taken to replace it; if it had been at max the
   * deck still refused to offer it, so it could never be earned back; and
   * taking it again put `taken` one ahead of `stacks` for the rest of the run.
   *
   * Only a stack, never the whole card. Losing a maxed Tambaqui to one touch
   * would be miserable; one stack is a real loss you can see and win back. And
   * only abilities that CAME FROM A CARD can be stolen at all — `taken` is the
   * source of truth for the UI, and there is no honest way to show the loss of
   * something that was never in it.
   */
  stealAbility(): string | null {
    const owned = (Object.keys(this.player.abilities) as AbilityId[])
      .filter((id) => {
        if (this.player.abilities[id].stacks <= 0) return false
        const card = UPGRADES.find((u) => u.ability === id)
        return !!card && (this.taken[card.id] ?? 0) > 0
      })
    if (owned.length === 0) return null

    const id = owned[(Math.random() * owned.length) | 0]
    const card = UPGRADES.find((u) => u.ability === id)!
    this.player.abilities[id].stacks -= 1

    const left = (this.taken[card.id] ?? 0) - 1
    if (left > 0) this.taken[card.id] = left
    // Deleted rather than left at zero: `slotsUsed` and `buildSlots` both test
    // truthiness, and a card sitting at 0 would keep its slot and its tile.
    else delete this.taken[card.id]

    return card.name
  }

  showBanner(title: string, subtitle: string) {
    this.banner = { title, subtitle, t: 0 }
  }

  // ---------------------------------------------------------------- OUTPUT --

  push() {
    this.updateMusic()
    if (!this.onSnapshot) return
    const p = this.player
    const stage = STAGES[this.stageIndex]
    const span = Math.max(1, stage.endX - stage.startX)
    this.onSnapshot({
      phase: this.phase,
      hp: p.hp,
      maxHp: p.maxHp,
      level: p.level,
      xp: p.xp,
      xpToNext: p.xpToNext,
      time: this.time,
      kills: this.kills,
      stageIndex: this.stageIndex,
      stageName: stage.name,
      stageSubtitle: stage.subtitle,
      stageProgress: Math.max(0, Math.min(1, (p.reach - stage.startX) / span)),
      enemies: this.enemies.count,
      fps: Math.round(this.fps),
      banner: this.banner ? { ...this.banner } : null,
      // The HUD stands down for the opening; the scene draws its own frame.
      cine: !!this.cine,
      // How long he has been on the floor, so the prompt knows when to arrive.
      downedT: this.player.downedT,
      revives: p.mods.revives,
      // Built once when the run ends; null for the whole of the run itself.
      summary: this.summary,
      boss: this.bossRef
        ? {
          name: this.bossRef.def.name,
          hp: this.bossRef.hp,
          maxHp: this.bossRef.maxHp,
          barsLeft: this.bossRef.barsLeft,
          bars: this.bossRef.def.bars ?? 1,
        }
        : null,
      offers: this.offers.map((u) => this.offerOf(u)),
      rerolls: this.rerolls,
      slots: {
        ...slotsUsed(this), powerMax: powerCap(this.taken), statMax: STAT_SLOTS,
      },
      swap: this.pendingSwap
        ? {
          incoming: this.offerOf(this.pendingSwap),
          owned: UPGRADES
            .filter((u) => u.kind === 'power' && this.taken[u.id])
            .map((u) => this.offerOf(u)),
        }
        : null,
      luck: this.player.mods.luck,
      critChance: critChance(this.player.mods.luck),
      absorb: this.player.absorb,
      regenerating: this.player.regenerating,
      grab: this.player.grabT > 0
        ? { progress: this.player.grabStruggle, next: this.player.grabNext }
        : null,
      objective: act3Objective(this),
      effects: this.player.effects.map((e) => ({
        id: e.id, label: e.label, good: e.good, t: e.t,
      })),
      build: this.buildSlots(),
      touch: this.input.touch,
      ammo: this.player.ammo.map((id, i) => ({
        id, name: AMMO[id].name, icon: AMMO[id].icon, loaded: i === this.player.ammoIndex,
      })),
    })
  }

  /** One card, described for the UI. Shared by the offers and the swap screen. */
  private offerOf(u: Upgrade) {
    return {
      id: u.id, name: u.name, desc: u.desc, icon: u.icon, glyph: u.glyph,
      kind: u.kind, rarity: u.rarity, owned: this.taken[u.id] ?? 0,
    }
  }

  /**
   * EVERY CARD THE PLAYER OWNS, in the order the deck lists them.
   *
   * Deck order rather than the order they were taken: a build should look the
   * same from one run to the next so the shape of it is learnable, and a strip
   * that reshuffles itself every level-up is a strip nobody reads.
   */
  private buildSlots(): Snapshot['build'] {
    const out: Snapshot['build'] = []
    const p = this.player
    for (const u of UPGRADES) {
      const n = this.taken[u.id] ?? 0
      if (n <= 0) continue
      const slot: Snapshot['build'][number] = {
        id: u.id, name: u.name, icon: u.icon, glyph: u.glyph,
        kind: u.kind, rarity: u.rarity, stacks: n,
      }
      /*
       * A CARD THAT TICKS SAYS SO, in the same tile as everything else.
       *
       * The cooldown and the key used to live in their own strip in the other
       * corner. One build, one place: the tile a card occupies never moves,
       * and the ones with something to press are the ones wearing a key.
       */
      if (u.ability) {
        const st = p.abilities[u.ability as AbilityId]
        const full = abilityInterval(u.ability as AbilityId, st.stacks)
        slot.ready = full > 0 ? Math.max(0, Math.min(1, 1 - st.cd / full)) : 1
        slot.active = abilityActive(p, u.ability as AbilityId)
        slot.key = ABILITY_KEYS[u.ability]
        slot.press = ABILITY_PRESS[u.ability]
        // 1 on the frame it fired, fading to 0. The tile kicks off this.
        if (st.fired > 0) slot.fired = st.fired / CAST_FLASH
        // And "I heard you", for a press that is waiting on the cooldown.
        if (st.queue > 0) slot.queued = true
      }
      out.push(slot)
    }
    return out
  }

  /** Owned abilities and how close each is to firing, for the HUD strip. */
  // ---------------------------------------------------------------- LAYOUT --

  private observeSize() {
    const parent = this.canvas.parentElement
    if (!parent || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', () => this.resize())
      return
    }
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(parent)
    this.watchDpr()
  }

  /**
   * THE PIXEL RATIO CAN CHANGE WITHOUT ANYTHING BEING RESIZED.
   *
   * Drag the window from a laptop's Retina screen onto an external 1080p
   * monitor and `devicePixelRatio` goes from 2 to 1 while the element keeps
   * exactly the CSS size it had — so neither the ResizeObserver nor the resize
   * event fires, and the canvas is left with a backing store built for the
   * other display. Browser zoom does the same thing.
   *
   * A media query on the CURRENT ratio is the only event for it. It matches
   * until the ratio moves, so the listener is re-armed against the new value
   * every time it goes off.
   */
  private watchDpr() {
    if (typeof matchMedia === 'undefined') return
    this.dropDpr()
    const dpr = window.devicePixelRatio || 1
    const mq = matchMedia('(resolution: ' + dpr + 'dppx)')
    const on = () => { this.resize(); this.watchDpr() }
    mq.addEventListener('change', on)
    this.dprWatch = mq
    this.dprListener = on
  }

  private dropDpr() {
    if (this.dprWatch && this.dprListener) {
      this.dprWatch.removeEventListener('change', this.dprListener)
    }
    this.dprWatch = null
    this.dprListener = null
  }

  private resize() {
    const parent = this.canvas.parentElement
    const cssW = parent?.clientWidth || window.innerWidth
    const cssH = parent?.clientHeight || window.innerHeight
    // Capped: a 3x device ratio triples the fill cost for pixels nobody can see.
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.max(1, Math.round(cssW * dpr))
    this.canvas.height = Math.max(1, Math.round(cssH * dpr))
    this.canvas.style.width = cssW + 'px'
    this.canvas.style.height = cssH + 'px'
    // Camera works in device pixels, so VIEW_HEIGHT is a real world-space
    // measurement regardless of the display's pixel density.
    this.camera.resize(this.canvas.width, this.canvas.height)
    this.ctx.imageSmoothingEnabled = false
  }
}

// ------------------------------------------------------- POOL CONSTRUCTORS --

function makePlayer(): Player {
  return {
    x: 120, y: 0, vx: 0, vy: 0,
    hp: CONFIG.PLAYER.maxHp, maxHp: CONFIG.PLAYER.maxHp,
    level: 1, xp: 0, xpToNext: xpForLevel(1),
    invuln: 0, facing: 1, aimX: 1, aimY: 0, anim: 0, shootAnim: 0, fireCd: 0,
    reach: 120,
    mods: { ...BASE_MODS },
    abilities: makeAbilities(),
    effects: [],
    sinceHit: 99,
    regenerating: false,
    orbs: [], orbSpin: 0, orbCd: 0,
    rainT: 0, rainCd: 0,
    tupaT: 0, drunkT: 0, hatT: 0, hatSpin: 0,
    ghosts: [],
    grabT: 0, grabStruggle: 0, grabNext: 'a', grabbedBy: null, grabbedUid: 0,
    abducted: false,
    hatLean: 0, hatBob: 0, burning: false, burnToggle: false,
    tupaSpark: 0, dotT: 0, dotBank: 0, dotFloatT: 0, burnHeat: 0, burnLock: 0, invertT: 0,
    shieldSpin: 0, shieldCd: [],
    reviveT: 0, downedT: 0,
    dashT: 0, dashX: 1, dashY: 0, dashCd: 0,
    shield: 0,
    absorb: 0,
    invisible: 0,
    blinkFrom: null,
    ammo: ['revolver'],
    ammoIndex: 0,
  }
}

/**
 * Every ability starts unowned, with its clock already wound.
 *
 * Derived from the ABILITIES table rather than from a hand-written list. The
 * list version drifted the moment a new ability was added — one missing id and
 * the whole game failed to boot with "cannot read properties of undefined",
 * from a lookup half a system away. There is no second place to update now.
 */
function makeAbilities(): Record<AbilityId, AbilityState> {
  const out = {} as Record<AbilityId, AbilityState>
  for (const id of Object.keys(ABILITIES) as AbilityId[]) {
    out[id] = { stacks: 0, cd: 0, fired: 0, queue: 0, queueX: 0, queueY: 0, queueAimed: false }
  }
  return out
}

/**
 * HOW MUCH TOUGHER EVERYTHING IS BY NOW.
 *
 * One curve, read at spawn, keyed to the furthest point of the journey the
 * player has reached. `curve` above 1 makes it slow to start and steep late,
 * so the opening stays a game about one cow and the last stretch is a game
 * about a wall of things that will not go down.
 *
 * Returned as a shared object: this runs on every spawn and there are a few
 * hundred a minute now.
 */
const roadOut = { hp: 1, damage: 1 }

function roadScale(reach: number) {
  const t = Math.max(0, Math.min(1, reach / CHURCH_DOOR))
  const k = Math.pow(t, CONFIG.SCALE.curve)
  roadOut.hp = 1 + (CONFIG.SCALE.hp - 1) * k
  roadOut.damage = 1 + (CONFIG.SCALE.damage - 1) * k
  return roadOut
}

function makeEnemy(): Enemy {
  return {
    x: 0, y: 0, vx: 0, vy: 0, kx: 0, ky: 0,
    hp: 1, maxHp: 1, def: ENEMIES.coisa,
    anim: 0, flip: false, flash: 0, poison: 0, poisonStacks: 0, poisonDps: 0,
    burnT: 0, burnDps: 0, clawCd: 0, allyT: 0,
    attackCd: 0, state: 0, phase: 0, seed: 0, uid: 0, depth: 1,
    variant: 0, broken: false, burstCd: 0, stealCd: 0, orbitCd: 0,
    barsLeft: 1, invulnT: 0, tornadoCd: 0, rainCd: 0,
    awake: false, fuse: 0, stage: 0, shielded: false,
    buffed: false, dmg: 1, radius: 10, hpMul: 1,
  }
}

function makeBullet(): Bullet {
  return {
    x: 0, y: 0, vx: 0, vy: 0, life: 0, kind: 'bala', ammo: null, spin: 0,
    damage: 0, pierce: 0, radius: 3, knockback: 0, friendly: true, hitCd: 0,
    bounces: 0, chain: 0, age: 0, boomerang: 0, bmSpeed: 0, bmX: 0, bmY: 0,
    homing: 0, counted: false,
  }
}

function makeHelper(): Helper {
  return {
    x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1, thorns: 0,
    anim: 0, flip: false, flash: 0, slot: 0, age: 0, hitCd: 0,
    hit: 0, swingCd: 0, swing: 0,
  }
}

function makeFx(): Fx {
  return { key: '', x: 0, y: 0, t: 0, life: 0, scale: 1, rot: 0, ground: false }
}

function makeBomb(): Bomb {
  return {
    sx: 0, sy: 0, tx: 0, ty: 0, x: 0, y: 0,
    t: 0, flight: 0.5, fuse: 1, damage: 0, radius: 0, exploded: false, hostile: false, anvil: false, selfDamage: 0, rest: 0, blast: 0,
  }
}

/**
 * IS THIS PICKUP JUST XP?
 *
 * The three corns are the same thing at three sizes and may be folded into one
 * another without anything being lost. A pão de alho, a totem and a comida
 * explosiva are each a decision the player gets to make, and a decision cannot
 * be merged into a number. See `Game.spawnPickup`.
 */
function isOrb(k: Pickup['kind']): boolean {
  return k === 'xp' || k === 'corn_mini' || k === 'corn_boss'
}

function makePickup(): Pickup {
  return { x: 0, y: 0, vx: 0, vy: 0, kind: 'xp', value: 1, age: 0, magnetised: false, speed: 0 }
}

function makeFloater(): Floater {
  return { x: 0, y: 0, vy: 0, life: 0, maxLife: 1, text: '', color: '#fff' }
}
