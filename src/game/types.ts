import type { SheetKey } from './data/sprites'
import type { AbilityId } from './data/abilities'
import type { AmmoId } from './data/bullets'

export type Vec2 = { x: number; y: number }

// ---------------------------------------------------------------- ENEMIES --

export type Behavior =
  | 'chase'     // walks straight at the player
  | 'swarm'     // faster, weaker, wanders slightly
  | 'charger'   // winds up, then dashes in a straight line
  | 'shooter'   // keeps distance and fires
  | 'stalker'   // closes in AND fires on the way — it wants to reach you
  | 'bomber'    // walks in slowly and detonates on top of you
  | 'rocket'    // dormant until it sees you, then flies at you and bursts
  | 'car'       // drives a straight line and ploughs whatever is in it
  | 'idle'      // stands there. Scenery you can shoot: the alien tech pillars
  | 'burrow'    // under the ground and untouchable, or up and being shot at
  | 'boss'      // scripted phases

export interface EnemyDef {
  id: string
  /**
   * THIS BOSS BELONGS TO A SCRIPT, not to `bossGate`.
   *
   * A gate boss owns the arena it was dropped into: killing it opens the
   * barrier and, if it was the last act's, ends the run. Act three's bosses
   * own NEITHER — the room is act three's, and the ending is O Chará's alone.
   *
   * Without this the Beholder tore down the church's own barrier on death and
   * then, because act three IS the last stage, immediately triggered the
   * closing sequence: the mid-boss won the game.
   */
  scripted?: boolean

  /**
   * TOUCHING THIS FLIPS THE STICK, instead of hurting.
   *
   * One species uses it, and the reason it is a flag on the definition rather
   * than a special case buried in the contact pass is that "what happens when
   * this touches you" belongs next to `damage` — which for this one is zero.
   * Reading those two lines together is the entire enemy.
   *
   * See `CONFIG.INVERT` for how long, and `updatePlayer` for where the stick
   * is actually turned round.
   */
  inverts?: boolean

  /** Shown in the codex / boss bar. */
  name: string
  /** Key into SHEETS. Undefined (or not drawn yet) = placeholder blob. */
  sheet?: SheetKey | string
  /**
   * Swapped in once the thing is broken. The flying thing has a "broken" sheet
   * drawn for it, and showing damage on the body beats a health bar.
   */
  sheetHurt?: SheetKey | string
  /**
   * Survives the very first hit it takes NO MATTER HOW BIG, and comes apart
   * instead. A point-blank bomb breaks one exactly like a single bullet does.
   * After that it is ordinary and can be killed.
   */
  breaksOnFirstHit?: boolean
  /** Health the broken form is left holding. */
  brokenHp?: number
  behavior: Behavior
  hp: number
  speed: number
  /** Contact damage per hit. */
  damage: number
  /** Seconds between contact hits. */
  attackCd: number
  radius: number
  xp: number
  /** Placeholder tint, and the colour of the hit particles once art exists. */
  color: string
  /** Draw size when falling back to the placeholder blob. */
  size?: number
  /** How hard this enemy shoves others out of the way (0..1). */
  mass?: number
  /** Swapped in while this thing is awake and moving — the rocket's burn. */
  sheetActive?: SheetKey | string
  /**
   * A field of damage it carries with it: salt on the ground, a glow you do
   * not want to stand in. Ticks continuously while the player is inside.
   */
  aura?: { radius: number; dps: number }
  /** Detonates when it reaches the player, taking itself with it. */
  detonates?: { radius: number; damage: number; triggerRange: number; fuse: number }
  /** Dormant until the player comes within this, then it wakes and charges. */
  detectRange?: number
  /** Spawned this many at a time, in a cluster. */
  groupSize?: number
  /** Damage dealt to OTHER enemies it drives through. */
  plough?: number
  /**
   * What its shots look like. Defaults to the ordinary hostile tracer; a
   * glowie fires the same bullet in its own sickly green, because "they glow"
   * has to be true of the thing they throw as well as of them.
   */
  shot?: BulletKind
  /**
   * How many times its health has to be emptied.
   *
   * Anything without this dies once. Two means the first zero is a
   * TRANSFORMATION rather than a death: see `damageEnemy`.
   */
  bars?: number
  /** Draw height above the ground. The shadow stays put, so it reads as flight. */
  hover?: number
  /**
   * Colour variants. One is chosen per spawn, so a crowd of the same species
   * is not a crowd of identical sprites.
   */
  sheets?: string[]
  /**
   * World X before which this species never appears — the coarse gate, used
   * mostly to keep town enemies out of the caatinga.
   */
  firstSeenAt?: number
  /**
   * Total kills before this species joins the table. This is the cadence: you
   * clear a quota of what is in front of you and the road answers with
   * something new, so the bestiary arrives at the pace you are actually
   * fighting rather than at the pace you are walking.
   */
  unlockKills?: number
  /** What O Indígena says the first time he lays eyes on one. */
  bark?: string
  /**
   * Reaches the player and takes one stack of a random ability. Killing these
   * quickly is the whole counterplay, so they are built to die quickly.
   */
  steals?: boolean
  /**
   * Fired repeatedly once the thing is broken — a broken machine
   * venting. Only used by species that have a broken state.
   */
  brokenBurst?: {
    interval: number
    count: number
    speed: number
    damage: number
  }
  /**
   * Emptying its health runs a SCRIPT instead of killing it.
   *
   * O Chará has six bodies and five health bars, and which one he is wearing
   * is not a function of how hurt he is — it is a sequence. `damageEnemy`
   * hands the zero to `charaAdvance` and that decides whether the fight is
   * over or whether something bigger just stood up.
   */
  stages?: boolean
  /**
   * The blast when one of several bars empties. The Microsoft's is enormous
   * because it is a building coming apart; a man the size of the player going
   * down on one knee is not, and firing the same three-hundred-unit
   * detonation off him would kill the player for standing where they should.
   */
  barBreak?: { radius: number; damage: number; shake: number }
  /** Boss / elite flag: shows a health bar, never despawns off-screen. */
  elite?: boolean
  /**
   * IT GIVES OFF LIGHT.
   *
   * Only visible once the sun is down, and it goes through the same wash the
   * street lamps do — a hole punched in the darkness plus a coloured glow over
   * the top, so a Glowie in a night street lights the ground it is standing on
   * instead of merely being a green sprite in the dark. See `drawDaylight`.
   */
  emits?: { r: number; g: number; b: number; radius: number; strength: number }
}

export interface Enemy {
  x: number; y: number
  vx: number; vy: number
  /** Knockback velocity, decays separately from steering. */
  kx: number; ky: number
  hp: number; maxHp: number
  def: EnemyDef
  /**
   * ONE OF THE BIG ONES.
   *
   * See CONFIG.MINIBOSS. The three numbers below are the def's own, already
   * multiplied, and they are read instead of `def.*` everywhere it matters —
   * a def is shared by every body of its species, so the buff cannot live
   * there. `hpMul` is kept because a thing that breaks rather than dies
   * (`brokenHp`) has to be scaled a second time, later.
   */
  buffed: boolean
  /** Contact and shot damage, already carrying the buff. */
  dmg: number
  /** Collision radius, already carrying the buff. */
  radius: number
  hpMul: number
  anim: number
  flip: boolean
  /** Seconds of white hit-flash remaining. */
  flash: number
  /**
   * Balas Venenosas. `poison` is the seconds left on the whole stack and is
   * refreshed by ANY bullet landing, which is what lets venom keep working
   * after you switch back to normal rounds.
   */
  poison: number
  /**
   * ON FIRE, and for how much a second. Queima Rosca lights these.
   *
   * Kept apart from `poison` rather than folded into it: a body can be both,
   * the two look completely different, and a burn is lit by standing near him
   * while poison is carried in on a round. One number each is cheaper than one
   * shared number with a source flag on it.
   */
  burnT: number
  burnDps: number
  /** Seconds before A Garra can open the same body again. */
  clawCd: number
  /**
   * SECONDS LEFT ON THE PLAYER'S SIDE. Zero for everything in the game except
   * whatever Amantes has just turned.
   *
   * A number rather than a flag because it is also the timer: when it runs out
   * the body dies, which is what stops a turned enemy being a permanent second
   * player. See `updateAmantes`.
   */
  allyT: number
  poisonStacks: number
  /** Damage per second contributed by ONE stack, set by whatever applied it. */
  poisonDps: number
  attackCd: number
  /** Behaviour-local timer (charge wind-up, shoot cooldown, phase clock). */
  state: number
  phase: number
  seed: number
  /**
   * A NUMBER THAT IS THIS BODY AND NO OTHER, for as long as it lives.
   *
   * The pool is dense with swap-remove, so an index is only valid for the
   * frame it was read in and a reference is never safe to keep at all. When
   * something has to point at one body ACROSS frames — Executar's mark, which
   * has to stay on the same alien while the player decides — this is the only
   * honest handle: store the number, and re-find it next frame in the loop
   * that was already running.
   */
  uid: number
  /**
   * A MINHOCA'S DEPTH: 0 fully buried, 1 fully out of the ground.
   *
   * The whole species reads off this one number — the AI decides whether she
   * can move, `damageEnemy` decides whether she can be hit, the contact pass
   * decides whether she grabs instead of hitting, and the renderer decides
   * whether to draw a worm or a mound of dirt. One value, four consumers, and
   * no way for them to disagree about which state she is in.
   */
  depth: number
  /** Index into `def.sheets`, fixed at spawn. */
  variant: number
  /** Has it come apart yet? Explicit state, not a health threshold. */
  broken: boolean
  /** Countdown for a broken thing's next burst. */
  burstCd: number
  /** Cooldown before a thief can rob the player again. */
  stealCd: number
  /** Seconds before the Rebimboca Orbital ring may hit this one again. */
  orbitCd: number
  /**
   * Health bars still to go, for anything that does not die the first time.
   *
   * A Microsoft has two. Emptying the first does not kill it — it detonates
   * and comes back with a full bar and a different fight, which is the whole
   * shape of the encounter.
   */
  barsLeft: number
  /**
   * Seconds of invulnerability, used only between health bars.
   *
   * Without it, sustained fire eats the opening of the second bar during the
   * transformation blast — the player never sees the thing change form, they
   * just see the number keep going down.
   */
  invulnT: number
  /** Seconds before a tornado may hit this one again. */
  tornadoCd: number
  /** Seconds before the rain may hit this one again. */
  rainCd: number
  /** Has this thing woken up? Used by anything that starts dormant. */
  awake: boolean
  /** Seconds left on a detonation fuse, once lit. */
  fuse: number
  /**
   * Which body it is wearing, for anything that has more than one.
   *
   * Only O Chará uses it. Kept on the enemy rather than in a side table
   * because the fight has to survive him being knocked about, healed, hit by
   * a bomb and recycled by the director, all of which go through the pool.
   */
  stage: number
  /**
   * Takes no damage at all, and says so.
   *
   * Distinct from `invulnT`, which is the silent window between health bars.
   * This one is a wall the player is meant to SEE, understand, and go and
   * switch off somewhere else — the mothership, until the three pillars
   * holding it up are down.
   */
  shielded: boolean
}

// ---------------------------------------------------------------- WEAPONS --

export interface WeaponStats {
  damage: number
  /** Shots per second. */
  fireRate: number
  bulletSpeed: number
  /** World units before the bullet expires. */
  range: number
  /** Extra enemies a bullet passes through. */
  pierce: number
  /** Radians of random spread. */
  spread: number
  projectiles: number
  knockback: number
  bulletRadius: number
}

export type BulletKind =
  | 'bala' | 'tambaqui' | 'flag' | 'glow' | 'tornado' | 'janela'
  /** ARRANCA CABEÇA. A head that came off, still bouncing. */
  | 'skull'
  /** A rolled-up employment contract, thrown. Act three. */
  | 'clt'
  // Act III. A drawn missile that steers, and the mothership's rake.
  | 'missile' | 'raio'
  /** Cantarolar. Notes, going where he is looking. */
  | 'nota'


export interface Bullet {
  /**
   * HAS THIS ROUND ALREADY BEEN COUNTED AS A HIT?
   *
   * Accuracy is a question about the TRIGGER: one shot that pierces four
   * bodies is one shot that connected, not four. Without this a build with
   * Perfura reported an accuracy over a hundred per cent.
   */
  counted: boolean
  x: number; y: number
  vx: number; vy: number
  kind: BulletKind
  /** Which ammo fired it — decides its colour and what it does on hit. */
  ammo: AmmoId | null
  /** Spin angle, for anything that tumbles through the air. */
  spin: number
  /** Remaining travel distance. */
  life: number
  damage: number
  pierce: number
  radius: number
  knockback: number
  friendly: boolean
  /** Brief cooldown so one bullet cannot hit the same body twice in a row. */
  hitCd: number
  /** Jumps left, for a ricochet round. */
  bounces: number
  /**
   * HOW DEEP IN AN ARRANCA CABEÇA CHAIN THIS HEAD IS. 0 for anything else.
   *
   * 1 is the head the ability itself threw, 2 is the head that one's kill
   * produced, and so on. It is here rather than in a set on the side because
   * the chance to continue falls off with the link — see `ABILITIES.cabeca` —
   * so the number has to travel WITH the skull, and a pooled bullet is the
   * only thing that lives exactly as long as the link does.
   */
  chain: number

  /**
   * BOOMERANG FLIGHT. Zero for anything that travels in a straight line.
   *
   * A janela does not expire at the end of its range — it slows, stops, and
   * comes back down its own path, so the safe ground behind a volley is only
   * safe for about a second. `age` counts the flight and `boomerang` is how
   * long the whole out-and-back takes; speed follows a cosine of the two, so
   * the turn is a smooth stall rather than a snap.
   */
  age: number
  boomerang: number
  /** Speed at launch, needed because velocity is recomputed every frame. */
  bmSpeed: number
  /** Direction of the outbound leg. */
  bmX: number
  bmY: number
  /**
   * HOW HARD IT STEERS, in radians per second. Zero flies straight.
   *
   * Deliberately a turn RATE rather than a homing strength: a missile that
   * corrects by a fraction of the error every frame can never be dodged, it
   * can only be outrun. One that turns at a fixed rate has a radius, and a
   * radius is something the player can beat by cutting inside it. That is the
   * difference between a threat and a tax.
   */
  homing: number
}

// ------------------------------------------------------------ HOMÚNCULO --

export interface Helper {
  x: number; y: number
  vx: number; vy: number
  hp: number; maxHp: number
  /** Damage returned to whatever hits it. */
  thorns: number
  anim: number
  flip: boolean
  flash: number
  /** Its place in the trail behind the player, so they do not stack up. */
  slot: number
  /** Seconds since it was summoned, used to fade the aggro ring in and out. */
  age: number
  /** Brief cooldown so one enemy cannot drain it in a single frame. */
  hitCd: number
  /** What its own swing is worth, and when it may swing again. */
  hit: number
  swingCd: number
  /** Counts down while a swing is being drawn. Purely for the picture. */
  swing: number
}

// ----------------------------------------------------------------- BOMBS --

export interface Bomb {
  /** Where it was thrown from, and where it is going. */
  sx: number; sy: number
  tx: number; ty: number
  /** Current ground position, interpolated along the throw. */
  x: number; y: number
  /** Seconds elapsed in the air, then counting the fuse down. */
  t: number
  flight: number
  fuse: number
  damage: number
  radius: number
  /** Set the moment it goes off; the entity lingers only to draw the blast. */
  exploded: boolean
  blast: number
  /**
   * Thrown AT the player rather than by them.
   *
   * The nave drops these while the player is busy with the pillars. Same
   * flight, same fuse, same drawn landing ring — the telegraph is the point,
   * and it should read the same whoever threw it — but it hurts the other
   * side and it is drawn in their colour.
   */
  hostile: boolean
  /**
   * AN ANVIL, which is neither of the above: it hurts EVERYONE.
   *
   * Arremessa Bigorna is the only friendly-fire card in the game, and the
   * whole design of it is that the thing coming down does not care who is
   * standing there. `selfDamage` is what it costs the player, kept separate
   * because it is a much smaller number — the card is a risk, not a trap.
   */
  anvil: boolean
  selfDamage: number
  /**
   * SECONDS AN ANVIL STAYS WHERE IT FELL.
   *
   * It used to vanish on the frame it landed, which is what made the whole
   * thing read as a flicker: seventy points of damage arrived and the object
   * that dealt them was already gone. Now it lands, sits in the dirt, and the
   * dust comes off it — the damage is instant, the presence is not.
   */
  rest: number
}

// --------------------------------------------------------------- PICKUPS --

/*
 * WHAT CAN BE LYING ON THE GROUND.
 *
 * The two corns are XP and nothing but XP — they collect the same way, they
 * feed the same bar. They are separate kinds rather than a `value` on an
 * ordinary orb because the whole point of them is that you can SEE one from
 * across the field and know what died to leave it there. A number is not
 * visible; a green cob is.
 */
export type PickupKind =
  | 'xp' | 'heal' | 'totem' | 'corn_mini' | 'corn_boss' | 'bomb'
  /** A ESTRELA. Every orb on the map comes to him. See `Game.callAllCorn`. */
  | 'star'

export interface Pickup {
  x: number; y: number
  /** Scatter velocity, used only before the pickup is magnetised. */
  vx: number; vy: number
  kind: PickupKind
  value: number
  age: number
  magnetised: boolean
  /** Homing speed once magnetised — ramps up, so collection reads as a snap. */
  speed: number
}

// ----------------------------------------------------------------- FLOATERS --

export interface Floater {
  x: number; y: number
  vy: number
  life: number
  maxLife: number
  text: string
  color: string
}

// ---------------------------------------------------------------- PLAYER --

export interface Player {
  x: number; y: number
  vx: number; vy: number
  hp: number
  maxHp: number
  level: number
  xp: number
  xpToNext: number
  /** Seconds of i-frames remaining. */
  invuln: number
  facing: number
  /** Unit vector the revolver is currently looking along. Persists when idle. */
  aimX: number
  aimY: number
  anim: number
  shootAnim: number
  fireCd: number
  /** Furthest X ever reached — this is what drives stage progression. */
  reach: number
  /** Multipliers granted by level-up cards. */
  mods: PlayerMods
  /** Timed abilities granted by level-up cards. */
  abilities: Record<AbilityId, AbilityState>
  /**
   * GETTING BACK UP. Seconds left of the Reviva sequence, counting down.
   *
   * Drives the slow motion, the white-out, the shockwave and the way he is
   * drawn while it runs — all of it derived from this one number so the pieces
   * cannot drift out of step with each other.
   */
  /**
   * HOW FAR THE HAT IS LEANING, and how far through its bounce it is.
   *
   * Eased toward his velocity rather than read from it, so the hat LAGS: it
   * tips back when he sets off, hangs over when he stops, and settles a beat
   * after he does. That lag is the entire difference between a hat on a head
   * and a hat drawn on a head. See `hatAt`.
   */
  hatLean: number
  hatBob: number
  /**
   * IS QUEIMA ROSCA ALIGHT?
   *
   * Held on the right mouse button, TOGGLED by the key and by the touch
   * button. Two ways in because a hold is the right verb for a mouse and the
   * wrong one for a thumb that is also holding a stick.
   */
  burning: boolean
  /** Set by the key or the button; OR-ed with the held mouse. */
  burnToggle: boolean
  /**
   * HOW HOT QUEIMA ROSCA IS, 0 cold to 1 venting.
   *
   * Rises while held, falls while not, and everything about the ability rides
   * it: damage, radius, the price per second, and every colour in the effect.
   * At 1 it vents and the ability locks out. See `ABILITIES.queima`.
   */
  /**
   * SECONDS SINCE THE LAST TICK OF DAMAGE-OVER-TIME, counting down.
   *
   * Damage that arrives sixty times a second cannot use any of the feedback a
   * blow uses — i-frames, a shake, a floater per tick — so before this it used
   * none at all, and a player standing in salt or running Poder de Tupã simply
   * watched the bar fall with nothing on screen to say why. That is the
   * \"farming peacefully and started taking damage out of nowhere\" report.
   *
   * The renderer reads this to pulse the screen while it is above zero.
   */
  /** Seconds until Poder de Tupã throws its next bolt. See `updateAbilities`. */
  tupaSpark: number
  dotT: number
  /** Drain accumulated since the last floater, so one number covers many ticks. */
  dotBank: number
  /** Seconds until that bank is allowed to become a floater. */
  dotFloatT: number
  burnHeat: number
  /** Seconds left of the forced cooldown a vent costs. 0 when it is usable. */
  burnLock: number
  /**
   * THE ESCUDO VOADOR: where the ring is pointing, and when each drone may
   * catch again.
   *
   * One shared angle plus a reload per drone, rather than an object each. The
   * drones have no position of their own — they ARE the angle — so there is
   * nothing to keep in step and nothing to leak.
   */
  shieldSpin: number
  shieldCd: number[]
  reviveT: number
  /**
   * SECONDS SINCE HE WENT DOWN, while the run is waiting to be asked for.
   *
   * Drives the colour draining out of the screen and when the button appears.
   * Zero the rest of the time.
   */
  downedT: number
  /** Seconds of RNG de RPG shield remaining. Blocks damage outright. */
  shield: number
  /** Buffs and curses currently running. See `TempEffect`. */
  effects: TempEffect[]
  /** Seconds since anything last hurt him. Drives out-of-combat regen. */
  sinceHit: number
  /** True while that regen is actually restoring health. */
  regenerating: boolean
  /**
   * REBIMBOCAS currently spinning, as angles around the ring.
   *
   * An array rather than a count, because they are spent individually — the
   * gaps left by the ones that have already hit something are the whole read
   * of the ability.
   */
  orbs: number[]
  /** Shared rotation of the ring, and the forge clock for the next one. */
  orbSpin: number
  orbCd: number
  /**
   * SECONDS OF BACKWARDS CONTROLS still to go. See `CONFIG.INVERT`.
   *
   * On the player rather than as a flag on the thing that did it: what matters
   * downstream is only how long it lasts, and the estagiário that caused it is
   * usually already dead by the time it wears off.
   */
  invertT: number
  /** Seconds of Dança da Chuva still falling on him, and its tick clock. */
  rainT: number
  rainCd: number

  /** Seconds left on the Poder de Tupã window, while the sky is helping. */
  tupaT: number
  /**
   * Seconds of very poor aim, from the Cálice.
   *
   * A number rather than a flag so it can decay: the sway is scaled by how
   * much is left, and the last half second is barely a wobble rather than the
   * aim snapping straight.
   */
  drunkT: number
  /**
   * CHAPÉU-BONITO. Seconds of the current lap, and where the hat is in it.
   *
   * There is exactly one hat and there always will be, so this is two numbers
   * rather than a list — which is the whole point of the card.
   */
  hatT: number
  hatSpin: number

  /**
   * BEING HELD.
   *
   * Seconds left before the grab does its worst, how far the player has got
   * struggling out of it, and which key has to come next. It is a whole
   * separate control scheme for a second and a half — everything else in the
   * game is dodged, and this one thing is fought.
   */
  grabT: number
  grabStruggle: number
  /** The key the mash wants next: alternating is what makes it a struggle. */
  grabNext: 'a' | 'd'
  /** Who has hold of him, so the grab ends if the boss dies mid-hold. */
  grabbedBy: Enemy | null
  /**
   * AND WHICH BODY THAT ACTUALLY WAS.
   *
   * `grabbedBy` is a reference into a pool that swap-removes, so on the frame
   * the holder dies the object it points at becomes whichever enemy was last
   * in the list — alive, with health, and holding a player it never touched.
   * The uid is checked alongside the reference every frame so the hold ends
   * with the body that started it. See `updateGrab`.
   */
  grabbedUid: number
  /**
   * HELD BY THE SHIP INSTEAD.
   *
   * The same struggle, with nothing in `grabbedBy` — the mothership overhead
   * is not an enemy and is not in the pool, so there is nothing to point at.
   * This is the flag that says which of the two holds is running.
   */
  abducted: boolean
  /**
   * AFTERIMAGES, for anything that moves faster than the eye follows.
   *
   * A dash that simply relocates the sprite reads as a stutter — the player
   * sees a character at A and then a character at B and their brain fills in
   * nothing. A trail is what turns that into a movement they can feel, and it
   * is most of the difference between "clunky" and "snappy".
   */
  ghosts: { x: number; y: number; t: number; life: number; flip: boolean }[]
  /**
   * Dash state: seconds left of the lunge, and the direction of it. While this
   * is above zero he is moving fast and cannot be hit.
   */
  dashT: number
  dashX: number
  dashY: number
  /** Seconds until the dash is available again. */
  dashCd: number
  /**
   * Hits the Escudo Alien will eat before they reach your health.
   *
   * Separate from `shield`, which is a window of time: this is a count of
   * blows, so it survives being ignored and is spent by being wrong.
   */
  absorb: number
  /** Seconds of Privacidade remaining. The horde cannot see him. */
  invisible: number
  /** Afterimage timer, drawn briefly after a teleport. */
  blinkFrom: { x: number; y: number; t: number } | null
  /** Ammo types collected, in cycle order. The revolver is always index 0. */
  ammo: AmmoId[]
  /** Which of `ammo` is loaded. */
  ammoIndex: number
}

export interface AbilityState {
  /** How many times its card has been taken. 0 = not owned. */
  stacks: number
  /** Seconds until it next fires. */
  cd: number
  /**
   * SECONDS SINCE IT WENT OFF, counting down from `CAST_FLASH`.
   *
   * Purely for the HUD. An ability firing was, until now, something you found
   * out about by noticing a bomb had appeared — the tile you pressed did not
   * move, which on the ones you press yourself reads as the button not having
   * worked. This is what makes the tile answer.
   */
  fired: number
  /**
   * A PRESS THAT ARRIVED TOO EARLY, and how long it is still good for.
   *
   * `Input` holds a press for a fifth of a second, which is right for a shot
   * and far too short for a MOVEMENT ability: the moment a player wants to
   * dash is the moment before they need to be somewhere, and the dash is
   * usually a beat away from being ready. Under the old rule that press
   * evaporated in the buffer and the button simply did nothing — so the player
   * pressed again, and again, and the ability read as unresponsive when the
   * only thing wrong was the timing of the question.
   *
   * Counted down in real ability time and spent the instant the cooldown
   * clears. Seconds. See `CONFIG.ABILITY_QUEUE`.
   */
  queue: number
  /** The heading that press arrived with, for a dash aimed off a touch button. */
  queueX: number
  queueY: number
  queueAimed: boolean
}

export interface PlayerMods {
  damage: number
  /**
   * A MULTIPLIER ON THE WHOLE HEALTH BAR, which nothing else touches.
   *
   * `maxHp` is additive @ Bônus de Vida adds twenty flat @ and Trocar Vida
   * needs to take a THIRD of whatever the bar happens to be, so it cannot be
   * expressed there. One number, applied last, so the two cards compose the
   * way a player would expect: bonuses build the bar, trades cut it.
   */
  hpMul: number
  /**
   * A SECOND multiplier, on abilities and thrown things only.
   *
   * Everything the player owns already scales with `damage`; this is the one
   * that Poder de Tupã opens and closes, and it deliberately does not touch
   * the revolver. Boosting the gun would have made that card a damage card
   * like every other; leaving the gun out makes it a card about the rest of
   * the build.
   */
  ability: number
  /**
   * THE PART OF `ability` THAT CARDS OWN, and it has to be separate.
   *
   * `ability` above is wiped to a flat 1 at the top of every frame — that is
   * how Poder de Tupã's window is guaranteed not to leak. Anything a card
   * multiplied into it would be erased on the next tick, so a permanent power
   * bonus needs a field of its own; `updateAbilities` folds this one into
   * `ability` each frame, and every call site that already reads
   * `mods.damage * mods.ability` picks it up without changing.
   */
  abilityMul: number
  fireRate: number
  speed: number
  magnet: number
  pierce: number
  projectiles: number
  maxHp: number
  /** Health recovered per kill, per stack of Vampirismo. */
  lifesteal: number
  /** Times the player can get back up instead of dying. */
  revives: number
  /**
   * SORTE. Zero is an unlucky nobody; every point bends a roll in your favour.
   *
   * It is not a stat that does one thing — it is the input to every roll the
   * game makes on your behalf. See `data/luck.ts` for what it actually buys.
   */
  luck: number
  /**
   * Flat damage subtracted from every blow that lands, before health.
   *
   * Flat rather than a percentage on purpose: contact now hurts enough that a
   * percentage would be worth almost nothing early and far too much late.
   * Armour is what makes a graze survivable, not what makes you immortal.
   */
  armour: number
  /**
   * Multiplier on how far away the horde notices you. Criptografia lowers it.
   */
  notice: number
  /**
   * Health per second regained once he has been left alone for a moment.
   *
   * OUT OF COMBAT, and that qualifier is the whole design: healing that ticks
   * during a fight just raises effective health and makes every fight longer.
   * Healing that only starts after a few untouched seconds is a reason to
   * disengage, which is a decision — and disengaging in a game about walking
   * forward costs you ground.
   */
  regen: number
  /** Seconds without being hit before `regen` starts. */
  regenDelay: number
  /** Fraction of max health restored on each level-up. */
  levelHeal: number
  /**
   * Multiplier on how far the revolver reaches — both what it will lock onto
   * and how far the bullet flies before it drops.
   */
  range: number
}

/**
 * A TEMPORARY EFFECT on the player: a buff, or a curse.
 *
 * These exist because the RNG de RPG gamble needed somewhere to put "you are
 * faster for eight seconds" and "your gun is jammed for five". They stack
 * multiplicatively with the permanent `PlayerMods`, tick down on their own,
 * and are listed on the HUD so a player can see why they suddenly feel
 * different. Anything here is short-lived by definition — a permanent effect
 * belongs in `PlayerMods`.
 */
export interface TempEffect {
  id: string
  /** Seconds remaining. */
  t: number
  /** What the player is told is happening to them. */
  label: string
  /** Shown in the effect's colour: good news is green, bad news is red. */
  good: boolean
  damage?: number
  fireRate?: number
  speed?: number
  range?: number
}

/**
 * What kind of slot a card occupies.
 *
 * The build is capped: four powers and four stats. `ammo` is neither — only
 * one is loaded at a time and it is cycled with E rather than stacked — and
 * `special` is for one-offs that are consumed rather than carried.
 */
export type UpgradeKind = 'stat' | 'power' | 'ammo' | 'special'

export type Rarity = 'comum' | 'incomum' | 'raro' | 'lendario'

/**
 * ONE FRAME OF THE RECORDING that Lost Media plays back.
 *
 * Deliberately tiny: position, aim and whether he was walking. A phantom is a
 * replay of where you were and where you were pointing, not a simulation of
 * you — anything more would be a second player character to keep in sync.
 */
export interface Frame {
  x: number
  y: number
  ax: number
  ay: number
  flip: boolean
}

/** A tape currently playing. */
export interface Tape {
  /** Index into the recording, advanced in real time. */
  head: number
  t: number
  life: number
  fireCd: number
  damage: number
  x: number
  y: number
  flip: boolean
}

/**
 * ONE PLAYING EFFECT.
 *
 * Fire and forget: it is placed once and never follows anything. That is a
 * rule rather than an omission — an effect that tracked an enemy would have to
 * hold a reference into a dense pool, and the object it was holding is handed
 * to the next thing that spawns the moment its owner dies. Effects that belong
 * to a living body (a shield, an aura, a burning machine) are drawn inline by
 * whatever draws that body, off the clock, and never come through here.
 */
export interface Fx {
  key: string
  x: number
  y: number
  /** Seconds since it started. */
  t: number
  /** Seconds it gets; the sheet's own length unless something shortens it. */
  life: number
  scale: number
  rot: number
  /** Under the walking bodies, or over them. Copied from the def at spawn. */
  ground: boolean
}

/**
 * A HAZARD ON THE GROUND: a downpour, or a mushroom.
 *
 * The two are the same shape and so share one entity — something lands, waits,
 * hurts everything standing in it for a while, and then is gone. The mushroom
 * differs only in going out with a bang, which is what `burst` is for.
 *
 * Not pooled: there are only ever a handful, they are large, and they are
 * drawn under everything rather than among the bullets.
 */
export interface Storm {
  kind: 'chuva' | 'cogumelo' | 'raio' | 'sal' | 'privada'
  /**
   * Whose hazard this is.
   *
   * Everything on the ground used to belong to the player. The horde leaves
   * things behind now — salt where a Saleiro has walked — and the only real
   * difference between a downpour and a salt patch is which side it hurts.
   */
  hostile?: boolean
  x: number
  y: number
  radius: number
  /** Seconds until it starts working. Negative once it has. */
  delay: number
  /** Seconds of damage left. */
  life: number
  damage: number
  /** Seconds between damage ticks. */
  tick: number
  tickCd: number
  /** A parting explosion when `life` runs out. Mushrooms have one; rain does not. */
  burst?: { radius: number; damage: number }
  /**
   * IT HITS ONE THING, not everything standing near it.
   *
   * A bolt of lightning that detonates in a circle is a grenade. `burst` gives
   * the damage and the reach to look for a body in; `single` says only the
   * nearest one inside it is struck.
   */
  single?: boolean
  /** Which of the five drawn bolts this one is, and how long it stays lit. */
  bolt?: number
  flash?: number
  /** Counts up for ever, so the animation does not restart. */
  age: number
}

// ----------------------------------------------------------------- STAGES --

/**
 * WHERE A GROUP ARRIVES FROM, and therefore what it asks of the player.
 *
 * One arrival pattern can only ever ask one question. These are four.
 *
 *   cone   — mostly ahead of where he is looking. The default trickle: this is
 *            pressure you walk INTO, and the fiction is that the road is
 *            contested rather than that something is chasing you.
 *   ring   — a full circle, closing. There is no safe direction, so standing
 *            still is the thing it punishes.
 *   wall   — a line across his path, sweeping. Go around it or go through it.
 *   pincer — both flanks at once, nothing front or back. The answer is to move
 *            perpendicular, which is the one direction the road does not want.
 */
export type Formation = 'cone' | 'ring' | 'wall' | 'pincer' | 'swarm'

/**
 * A SET PIECE: an authored arrival, outside the ordinary trickle.
 *
 * Fires once when its wave is entered, and may repeat. Deliberately exempt
 * from the population cap — a moment you wrote should always land, even into a
 * crowd, or it is not a moment.
 */
export interface SetPiece {
  formation: Formation
  count: number
  /** Species and ratio. Defaults to the wave's own cast. */
  cast?: Record<string, number>
  /** How many times in total. Default 1. */
  repeat?: number
  /** Seconds between repeats. */
  every?: number
  /**
   * A HARDER THING HIDDEN IN THE CROWD.
   *
   * Vampire Survivors' best trick: a wall of trivial bodies that is genuinely
   * good to farm, with two or three of something that will kill you standing
   * in the middle of it. The swarm reads as free XP right up until it is not,
   * and telling the difference at a glance is the skill.
   */
  mixin?: { id: string; count: number }
  /** What he says when it lands. */
  bark?: string
  shake?: number
}

/**
 * A RANDOM EVENT: a set piece that is not on the schedule.
 *
 * The wave table is authored and so predictable — right for pacing, wrong for
 * tension, because a player who has walked the road twice knows exactly what
 * is coming. These fire on their own clock from a pool, so something always
 * might.
 */
export interface RandomEvent extends SetPiece {
  /** Relative likelihood of being the one that fires. */
  weight: number
  /** Not before this far along the journey. */
  fromX?: number
}

/**
 * ONE ROW OF THE DIRECTOR'S SCHEDULE.
 *
 * Keyed to DISTANCE, not to a clock — this is a journey with a destination,
 * and how far east you have pushed is the thing that should escalate it.
 *
 * `quota` is a FLOOR, not a ceiling. Below it the director fills as fast as it
 * can; at or above it the director still adds one of each species in `cast`
 * every `interval`, so pressure keeps arriving and the real ceiling is the
 * population cap. That is lifted from Vampire Survivors and it is the reason
 * the cap is load-bearing rather than a safety net.
 *
 * `cast` is the wave's CHARACTER. A weight table over the whole bestiary
 * produces a smoothie of everything unlocked; naming three species per wave is
 * what makes a stretch of road feel like it is about something.
 */
export interface WaveDef {
  /** World X at which this row takes over. */
  fromX: number
  /** Population to hold on the field. */
  quota: number
  /** Seconds between top-up spawns once the quota is met. */
  interval: number
  cast: Record<string, number>
  /** Fired once on entering this row. */
  event?: SetPiece
  /** Said on entering, if anything. */
  bark?: string
}

export interface StageDef {
  id: 'road' | 'streets' | 'church'
  name: string
  subtitle: string
  /** World X where this stage begins. */
  startX: number
  /** World X where it ends and the next begins. */
  endX: number
  /**
   * Where this act's boss is fought. The barrier closes here, the field is
   * swept, and the fight happens in this rectangle.
   */
  arena?: ArenaDef
  boss?: string
}

/**
 * A boss arena.
 *
 * `centerY` is optional: leave it out and the arena is centred on the road
 * wherever it happens to be at `centerX`, which is what an act that ends in
 * the open caatinga needs — the road wanders, and a fixed Y would put the
 * barrier in a field next to it.
 */
export interface ArenaDef {
  /**
   * How far ALONG THE ROUTE this arena sits.
   *
   * It used to be a world X and Y. The route wanders now, so a fixed pair of
   * coordinates would drop the church in a field somewhere beside the way in —
   * arenas are placed by distance travelled and resolved against the route at
   * world creation, which puts them exactly where the player will arrive.
   */
  atDist: number
  halfW: number
  halfH: number
  /** The camera parks here for the whole fight, relative to the arena centre. */
  camOffsetY: number
  /**
   * Extra world height ABOVE the arena that scenery may not occupy.
   *
   * For anything with a building drawn standing on it: the arena rectangle is
   * where the fight happens, and the art can extend well outside it.
   */
  clearTop?: number
  /**
   * A sealed arena admits nothing but the boss and what the boss makes.
   *
   * Ordinarily the trickle keeps arriving during a boss fight, walking in
   * along the barrier — at the wedding that is the guest list turning up and
   * it belongs there. A bullet hell cannot afford it: the whole fight is
   * reading the pattern, and cattle wandering through the flags is noise on
   * top of the only thing the player should be looking at.
   */
  sealed?: boolean
}

/** An arena with its position resolved against the route. */
export interface Arena {
  /** Distance along the route, carried through so the gate can compare. */
  atDist: number
  centerX: number
  centerY: number
  halfW: number
  halfH: number
  camY: number
  sealed: boolean
}

// ------------------------------------------------------------------- RUN --

export type RunPhase =
  | 'menu' | 'playing' | 'levelup' | 'swap' | 'paused' | 'dead'
  /**
   * The closing sequence, between the last enemy dying and the run being
   * over. Its own phase rather than a flag on 'playing' because the
   * simulation must NOT run through it — no spawns, no director, no
   * shooting — while the renderer very much must.
   */
  | 'ending'
  /**
   * DOWN, BUT WITH A REVIVA IN THE BANK.
   *
   * He has burst, the world has stopped and gone grey, and there is one button
   * on the screen. Its own phase rather than a flag on 'playing' because the
   * simulation must NOT run through it — nothing arrives, nothing shoots,
   * nothing moves at all — while the renderer very much must, and because it
   * is the one place in the game where the run is waiting on the player to say
   * they want it back.
   *
   * The old version did all of this in about a third of a second, without
   * asking, behind a white flash. Players did not notice they had died.
   */
  | 'downed'
  | 'won'

/** The read-only slice the React HUD renders. Pushed at ~15Hz, never per-frame. */
export interface Snapshot {
  phase: RunPhase
  /**
   * True while the opening scene is playing. The HUD hides behind it — a
   * health bar over a letterboxed frame is the single fastest way to make a
   * cutscene look like a bug.
   */
  cine: boolean
  /** Seconds since he burst, while `phase` is 'downed'. See `Game.goDown`. */
  downedT: number
  /** Revivas still banked, including the one about to be spent. */
  revives: number
  /**
   * WHAT THE RUN WAS, once it is over. Null until then.
   *
   * A frozen object rather than something the end screen computes: the game
   * keeps running underneath that screen, and figures that drift while
   * somebody is reading them are worse than no figures. See `data/record`.
   */
  summary: import('./data/record').Summary | null
  hp: number
  maxHp: number
  level: number
  xp: number
  xpToNext: number
  time: number
  kills: number
  stageIndex: number
  stageName: string
  stageSubtitle: string
  /** 0..1 progress through the current stage. */
  stageProgress: number
  enemies: number
  fps: number
  banner: { title: string; subtitle: string; t: number } | null
  boss: {
    name: string
    hp: number
    maxHp: number
    /** Bars still to empty, so the HUD can show there is more to come. */
    barsLeft: number
    bars: number
  } | null
  offers: UpgradeOffer[]
  /** Rerolls left in the run. See `Game.rerolls`. */
  rerolls: number
  /** How much of the capped build is spent, for the level-up screen. */
  slots: { power: number; powerMax: number; stat: number; statMax: number }
  /**
   * Set while the player is being asked what to drop.
   *
   * `incoming` is the power they just took with no room for it; `owned` is
   * what is on offer to give up for it, each with how deep it currently runs.
   */
  swap: { incoming: UpgradeOffer; owned: UpgradeOffer[] } | null
  /** Sorte, and what it currently buys. Shown on the HUD. */
  luck: number
  critChance: number
  /** True while out-of-combat regen is actually ticking. */
  regenerating: boolean
  /** Escudo Alien charges banked right now. */
  absorb: number
  /**
   * Set while the player is being held. `progress` is 0..1 toward escaping,
   * `next` is the key to press.
   */
  grab: { progress: number; next: string } | null
  /**
   * WHAT THE GAME WANTS FROM YOU RIGHT NOW.
   *
   * Act III is the first part of the game that asks for something other than
   * "survive": clear this many before the clock runs out, break those three
   * pillars. A boss health bar cannot say either of those, so the objective
   * says it in words with a number attached.
   */
  objective: { label: string; value: string; urgent: boolean } | null
  /** Buffs and curses running, newest last. Drawn on the HUD. */
  effects: { id: string; label: string; good: boolean; t: number }[]
  /** Owned timed abilities, for the HUD strip. */
  /**
   * EVERYTHING THE PLAYER HAS TAKEN, powers and stats alike.
   *
   * The ability strip only ever showed the cards that tick — a build could be
   * eight cards deep with two of them visible, which made the other six feel
   * like they had not happened. This is the whole of it.
   */
  build: BuildSlot[]
  /**
   * Somebody has touched the screen at least once.
   *
   * The HUD grows a set of on-screen buttons when this turns true and never
   * loses them again. One-way on purpose: a player who taps once and then
   * picks the keyboard back up still has the buttons, which is harmless,
   * whereas flickering them in and out under somebody's thumb is not.
   */
  touch: boolean
  /** Ammo collected, and which is loaded. */
  ammo: { id: string; name: string; icon: string; loaded: boolean }[]
}

export interface BuildSlot {
  id: string
  name: string
  icon: string
  glyph: string
  kind: UpgradeKind
  rarity: Rarity
  /** How deep it runs. 1 is not shown; anything above it is. */
  stacks: number
  /*
   * THE THREE BELOW ONLY EXIST ON A CARD THAT DOES SOMETHING ON A TIMER.
   *
   * There used to be a second list and a second strip for those, which split
   * one build across two corners of the screen and made a card feel like it
   * had not happened depending on which corner it landed in. There is one
   * list now; a card that ticks simply carries more to say about itself.
   */
  /** 0..1 — how close to ready. 1 means it fires now. Absent on a stat. */
  ready?: number
  /** True while its effect is actually running. */
  active?: boolean
  /**
   * What to press, for the ones that are not automatic. Undefined means it
   * fires itself and the player has nothing to do about it.
   */
  key?: string
  /** The same thing as a keycode, for the on-screen buttons to send. */
  press?: string
  /** 0..1, fading, on the frame after it fires. Drives the tile's kick. */
  fired?: number
  /**
   * THE PRESS HAS BEEN HEARD BUT NOT YET ANSWERED.
   *
   * Abilities buffer an early press and spend it the moment the cooldown
   * clears (see `AbilityState.queue`), which is what stopped them feeling
   * unresponsive — but it is invisible: the player presses, the ability does
   * not fire for another half second, and nothing on screen says the game
   * caught it. This is that. The tile lights the instant the button is
   * pressed, whether or not anything happened yet.
   */
  queued?: boolean
}

export interface UpgradeOffer {
  id: string
  name: string
  desc: string
  /** Path to the card's 32x32 art under /public. */
  icon: string
  /** Shown instead when the art has not been drawn yet. */
  glyph: string
  /** Which of the two capped slot pools this card spends, if either. */
  kind: UpgradeKind
  /** Tier the card was rolled out of, shown on the card frame. */
  rarity: Rarity
  /** How many times it has already been taken. 0 = this would open a slot. */
  owned: number
}
