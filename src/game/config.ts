/**
 * Every tunable number in the game lives here.
 * Design rule: no magic numbers in systems — import them from CONFIG so the
 * whole feel of the game can be re-tuned from one file.
 */
export const CONFIG = {
  /** Size of a map_bg tile in world units. The art is 100x100. */
  TILE: 100,
  /** A chunk is CHUNK_TILES x CHUNK_TILES tiles, baked to one offscreen canvas. */
  CHUNK_TILES: 6,
  /** How many chunk canvases to keep cached before evicting the oldest. */
  CHUNK_CACHE: 24,

  /** Simulation runs at a fixed step so physics never depends on framerate. */
  STEP: 1 / 60,
  /** Never simulate more than this many seconds of catch-up in one frame. */
  MAX_CATCHUP: 0.25,

  /** Target world-space height of the viewport. Zoom is derived from this. */
  VIEW_HEIGHT: 360,
  MIN_ZOOM: 2,
  MAX_ZOOM: 6,

  /** Camera lerp — fraction of remaining distance closed per second. */
  CAM_SMOOTH: 0.0001,
  /**
   * CAMERA LEADS THE PLAYER, a little — and it used to be a lot.
   *
   * Forty units of lead means the camera sits forty units past him in
   * whichever direction he is walking, which sounds helpful and is not: this
   * is a twin-stick game played in every direction at once, so the lead
   * REVERSES every time the stick does. The world slid eighty units across the
   * screen on every change of mind, which is a camera constantly correcting
   * itself around a character who is standing still, and it is the thing that
   * reads as disorienting.
   *
   * Twelve still shows a little more of where he is going than where he has
   * been, which is all a lead is for, and `Camera.follow` now eases into it
   * rather than snapping — so a reversal is a drift rather than a whip.
   */
  CAM_LOOKAHEAD: 12,

  /**
   * ÀS VEZES VEM UM GRANDE.
   *
   * Any species in the game can arrive as a buffed one: same behaviour, same
   * art, five times the health and a tenth more damage. It is not a new enemy
   * and it is deliberately not announced — the point is that a wave you have
   * learned occasionally contains one body that does not die when it should,
   * and you have to notice that yourself and decide what to do about it.
   *
   * `chance` stays low and `maxAlive` stays lower. Two of these on screen is a
   * problem to solve; five is just a wave with more health in it, which is the
   * one thing this must never become.
   */
  /**
   * HOW LONG AN EARLY PRESS IS STILL GOOD FOR.
   *
   * The input buffer is a fifth of a second, which is the right answer for a
   * shot and the wrong one for a dash: nobody presses dash when it is ready,
   * they press it when they need it, and those are different moments. Half a
   * second of grace means a dash asked for just before the cooldown ends still
   * fires — and that one number is most of the difference between a movement
   * ability that feels loose and one that feels like it is arguing with you.
   *
   * Not longer, because a queued dash the player has forgotten about firing on
   * its own is worse than one that did not fire at all.
   */
  ABILITY_QUEUE: 0.5,

  /**
   * COMIDA EXPLOSIVA — the one pickup that is not a reward, it is a weapon.
   *
   * Everything else on the floor is XP or health: things you collect because
   * collecting is free. This one goes off. Walking over it detonates around
   * HIM, which means the good moment to pick it up is the moment he is
   * surrounded — and being surrounded is the moment a player is least able to
   * plan. That is the whole design: a pickup you have to decide about.
   *
   * Rare on purpose. At a third of a percent it turns up roughly once every
   * three hundred kills, which over a run is a handful of times — often enough
   * to be a thing that happens, rare enough that seeing one on the ground is
   * worth changing direction for.
   */
  /**
   * A ESTRELA — rarer than a pão de alho, commoner than the bomb.
   *
   * It has to be rare enough that seeing one is a moment and common enough
   * that a long run gets a few, because what it is FOR is the XP a run leaves
   * behind: the orbs dropped while the player was being pushed forward, which
   * they can see and cannot reach. One of these a few times a run is the game
   * handing back the ground it took.
   */
  /**
   * HOW LONG THE STICK STAYS BACKWARDS.
   *
   * Long enough to be a real problem in a room full of things that DO hurt,
   * short enough that the answer is "get through it" rather than "stop
   * playing". Refreshed rather than stacked by a second touch, so a swarm of
   * them cannot bank ten seconds on you in one pass.
   */
  INVERT: { seconds: 4 },

  STAR: {
    /*
     * ONE IN FIVE HUNDRED KILLS, and it should feel like it.
     *
     * At 0.006 it turned up every hundred and sixty bodies, which on a late
     * wave is under a minute — often enough that the floor never got a chance
     * to fill, so the thing it exists to solve had stopped existing by the
     * time it arrived. A Estrela is only worth anything when there is a run's
     * worth of corn lying behind you, and that takes a while to accumulate.
     */
    chance: 0.001,
  },

  BOMB_FOOD: {
    /** Roll per kill, before Sorte. */
    chance: 0.0033,
    /** Flat, and it does not scale with the player's damage cards. */
    damage: 620,
    radius: 150,
  },

  /**
   * THE TWO RARE CORNS, and what they are worth.
   *
   * MILHO ALIENADO drops off a mini-boss — a body with fifteen times the
   * health had better pay for itself, and the ordinary orb it left was not
   * doing that on its own.
   *
   * MILHO DOURADO drops off a boss, and it is the more overdue of the two:
   * every boss in the game is defined with `xp: 0`. Killing A Manifestação
   * — twenty-six thousand health, the wall at the end of act one — paid
   * LITERALLY NOTHING, and the run went on as though it had not happened.
   *
   * Both are multiplied by `xpPace` like every other orb, so they scale with
   * where the player is in the journey rather than being worth a level early
   * and a rounding error late.
   */
  CORN: {
    /** On top of what the mini-boss's own body was already worth. */
    mini: 26,
    /** Flat, because a boss's own `xp` is zero and always has been. */
    boss: 220,
  },

  MINIBOSS: {
    /** Roll, per body the director places. */
    chance: 0.05,
    hp: 15,
    damage: 1.1,
    /**
     * Worth killing. A body with five times the health that pays the ordinary
     * one XP orb is a thing to walk away from, and walking away from it is the
     * opposite of what a mini-boss is for.
     */
    xp: 4,
    /** Drawn and collided this much bigger, so "bigger enemy" is literal. */
    scale: 1.5,
    /** Never more than this many alive at once. */
    maxAlive: 2,
    /** Nothing this big on the first stretch of road. */
    fromX: 1200,
  },

  /**
   * A NAVÉ MÃE, PASSANDO.
   *
   * The tuning of the whole hazard. See `systems/abduction.ts` for what it is.
   *
   * `speed` against PLAYER.speed is the entire fight: at 118 he walks, at 355
   * it crosses, so stepping out sideways works and running away never does.
   * `beam` is small enough that "get out of the circle" is one decision.
   */
  ABDUCT: {
    /** Middle of act one. Nothing overhead before that. */
    fromX: 5250,
    /** Middle of act two — over Floriano it happens far more often. */
    oftenFromX: 16250,
    /** Seconds between passes out on the BR. Very, very rare. */
    gapEarly: [190, 300] as [number, number],
    /** And in town. */
    gapLate: [70, 115] as [number, number],
    /** Never in the opening minutes, whatever the roll says. */
    firstDelay: 90,

    speed: 355,
    /** Ground radius of the light. */
    beam: 58,
    /**
     * How high it is drawn above the circle.
     *
     * Capped by the camera, not by realism: the view is 360 units tall and
     * centred on him, so anything past about 170 above his feet is off the top
     * of the screen. It sells the height by being SMALL up there instead —
     * see `naveScale`.
     */
    alt: 152,
    /** Drawn this much smaller than life, because it is a long way up. */
    naveScale: 0.62,
    /** Spawned this far beyond the corner of the view. */
    entry: 170,
    /** How far past him it goes before giving up on the pass. */
    range: 520,
    /** Away is faster than in. */
    exitBoost: 1.9,
    exitSeconds: 2.6,

    /** Seconds to break the hold before it does its worst. */
    holdSeconds: 2.8,
    /** Struggle gained per correct key. Eight presses, near enough. */
    perPress: 0.13,
    /** Health per second while it has him. */
    dps: 13,
    /** And what it costs to lose the struggle outright. */
    failDamage: 38,
    /** How far off the ground he ends up, at the end of the hold. */
    maxLift: 74,

    /** Its one parting shot, once he is free. */
    bombDamage: 46,
    bombRadius: 96,
  },

  /**
   * REVIVA — the loudest three seconds in the game.
   *
   * It was a shake, a shove and one small green word, fired into a screen with
   * four hundred bodies and a hundred damage numbers on it. Players did not
   * notice they had died and come back, which makes the rarest card in the
   * deck feel like nothing happened.
   *
   * What it is now: the world STOPS, goes white, and starts again in slow
   * motion while he gets up. Nothing else in this game slows down, and that is
   * exactly why it works here — the one moment worth interrupting the run for
   * is the one where the run nearly ended.
   */
  REVIVE: {
    /**
     * HOW LONG THE SCREEN STAYS GREY before the button is offered.
     *
     * Not a delay for its own sake: it is the beat in which the player watches
     * themselves burst and the colour drain, and a button that appears during
     * that gets pressed reflexively by somebody who has not yet understood
     * what happened. Which was the entire complaint about the old version.
     */
    prompt: 0.75,
    /** Total length of the sequence. */
    time: 2.6,
    /** Dead stop at the start, in seconds, before anything moves again. */
    hold: 0.45,
    /** How slowly the world runs when it restarts, ramping back to 1. */
    slow: 0.18,
    /** Health he gets back, as a fraction. */
    heal: 0.5,
    /** And how long nothing can touch him afterwards. */
    invuln: 3,
    /** The shockwave: how far it throws, and how hard. */
    push: 260,
    force: 460,
  },

  PLAYER: {
    speed: 118,
    maxHp: 100,
    /** Collision radius, world units. */
    radius: 9,
    /** Seconds of invulnerability after taking a hit. */
    iframes: 0.5,
    /**
     * XP pickups inside this radius fly toward the player.
     * Generous on purpose: the revolver kills at up to 330 units and the run
     * only ever moves east, so a tight magnet quietly throws away most of the
     * XP the player earned and leaves them badly under-levelled.
     */
    magnet: 115,
    /** Sprite anchor sits at the feet; this is the visual foot offset. */
    footOffset: 2,
  },

  /**
   * How the revolver picks what to shoot.
   *
   *   'steered' — fires on its own, but the mouse decides WHICH way it looks.
   *               Targets are scored by distance and by how close they are to
   *               the direction of the cursor, so you sweep the horde by
   *               pointing rather than by clicking. This is the default.
   *   'mouse'   — fires exactly at the cursor, ignoring targets entirely.
   *   'auto'    — pure nearest-target, no steering.
   */
  /**
   * WHO DECIDES WHERE THE BULLET GOES.
   *
   * `mouse` — the player does. The revolver fires along the cursor and hits
   *   whatever happens to be in the way, or nothing at all. This is the mode
   *   the game is designed around now: the gun still fires on its own, so the
   *   skill is entirely in where it is pointed rather than in clicking.
   * `steered` — the old assist. It picked a target for you and used the cursor
   *   only as a weighting on that choice, which meant a player could not miss
   *   and could not deliberately shoot a particular thing either.
   * `auto` — no cursor input at all, plain nearest-target.
   *
   * Touch and keyboard-only play fall back to `auto` regardless, because there
   * is no cursor to aim with. See `updatePlayer`.
   */
  AIM_MODE: 'mouse' as 'steered' | 'mouse' | 'auto',

  /**
   * How hard the cursor pulls target selection.
   *
   * An enemy directly behind you is scored as if it were this-many-times-plus-one
   * further away, so pointing genuinely redirects your fire without ever letting
   * the gun fall silent when nothing is in front.
   */
  AIM_STEER: 4,

  /** Hard caps. Pools are pre-allocated to these sizes. */
  /**
   * The population ceiling, and it is doing real work.
   *
   * The director keeps adding past a wave's quota — that is the rule lifted
   * from Vampire Survivors, and it means this number, not the quota, is what
   * actually limits a crowd. Theirs is 300; 400 is ours, measured against
   * 415 bodies rendering in 1.08 ms a frame.
   *
   * Set pieces and bosses are exempt. A moment you authored should always
   * land, even into a crowd, or it is not a moment.
   */
  /*
   * THE REAL GOVERNOR OF DENSITY.
   *
   * The wave table's `quota` is a floor the director fills to; it goes on
   * adding past it, so THIS is what the field actually settles at once the
   * quotas are high. At 800 the town measured 798 bodies carrying 1.4 million
   * health between them — with a town-sized build doing about 2,800 damage a
   * second that is eight minutes to clear a screen, which is not density, it
   * is a wall. Four hundred is a Vampire Survivors crowd and it measured
   * 4.1ms a frame, which leaves the whole rest of the budget alone.
   */
  MAX_ENEMIES: 420,

  /**
   * WHAT THE ROAD DOES TO EVERYTHING ON IT.
   *
   * The player compounds — cards, stacks, crits — and until now the bestiary
   * did not. A Vaca Mutada had twenty-four health in the first minute and
   * twenty-four health an hour later; the only thing that got harder was WHICH
   * species turned up. That is the whole of "they melt before they reach me".
   *
   * Measured, on a build of the size act one should end with: about 1,400
   * damage a second into a crowd. Nothing in the old table survived contact
   * with that, so the curve below is what keeps a body on the field long
   * enough to be a body.
   *
   * Health does the work; damage rises much more slowly, because a swarm that
   * both refuses to die AND one-shots you is not harder, it is just shorter.
   * Applied at spawn against `player.reach`, so it is a property of how far
   * along the journey is rather than of how long anyone has been playing.
   *
   * Bosses are exempt: their health is authored per stage — see ENEMIES.
   */
  SCALE: {
    /**
     * Health at the church door is this many times health at the first step.
     *
     * THIS WAS 5.5 AND THAT WAS WRONG. Measured across the run, damage grows
     * about ninefold from the first cards to a finished build — and at 5.5 the
     * bestiary grew sevenfold with it, so kills per second went 8.9, 13.3,
     * 11.4 and the whole run felt like standing still. A player is entitled to
     * notice they got stronger.
     *
     * At 2.6 the same measurements give 9.8 rising to about 24: the build is
     * visibly winning, roughly two and a half times the throughput it started
     * with. Where the danger comes from instead is DENSITY — four hundred
     * bodies rather than ninety — and from which species the road is sending,
     * which already spans twenty-four health to twelve hundred without any
     * help from this number. That is the genre's own answer: you are supposed
     * to mow them down, and the threat is being surrounded while you do it.
     */
    hp: 2.6,
    /**
     * And damage, which has to do more of the work: if no single body is
     * frightening any more, being touched has to be.
     *
     * 1.8 WAS TOO MUCH BY THE CHURCH, and the curve is why. `curve` above one
     * is slow early and steep late, so act three sits at essentially the full
     * multiplier for its whole length — a Grande Gordo touching you went from
     * 36 to 65, on a health bar that is typically 140, while four hundred
     * other things were also on the field. Two touches was the run.
     *
     * 1.42 puts the same body at 51, about a third of a bar, which is a
     * mistake rather than a sentence. The late game keeps its teeth from
     * DENSITY and from the species the road is sending, which is where they
     * were always supposed to come from.
     */
    damage: 1.42,
    /** Above 1 the ramp is slow early and steep late. */
    curve: 1.15,
  },
  MAX_BULLETS: 400,
  /**
   * HOW MANY THINGS MAY BE LYING ON THE GROUND AT ONCE.
   *
   * This was 500, and it was silently costing the player XP. A pickup never
   * expires — the only way one leaves the pool is being picked up — so
   * every orb dropped behind a cow the player never walked back to stays
   * there for the rest of the run. Four hundred and twenty enemies on the
   * field, a magnet of a hundred and fifteen units, and a run that only ever
   * walks east: five hundred abandoned orbs is not an edge case, it is a
   * Tuesday. And once the pool was full `spawn` returned null, `spawnPickup`
   * returned quietly, and NO CORN DROPPED AGAIN for the rest of the run.
   *
   * Two things fix that and this is only the first of them. The number is now
   * high enough that reaching it takes real neglect; `spawnPickup` handles
   * reaching it anyway, and handles it without throwing XP away. See there.
   *
   * It is still a number rather than nothing, because this pool is a dense
   * array walked once per frame and drawn once per frame: unbounded here means
   * an unbounded frame, which is a worse bug than the one being fixed.
   */
  MAX_PICKUPS: 2400,
  MAX_FLOATERS: 120,

  /** Spatial hash cell size. Roughly 2x the largest common collision radius. */
  HASH_CELL: 48,

  /**
   * Enemies further than this from the player despawn and refund their slot.
   * Tighter than the spawn ring by a good margin: anything left this far
   * behind is never catching up, and recycling it lets the director put a body
   * in front of the player instead, which is where the fight is.
   */
  DESPAWN_RADIUS: 780,
  /** Enemies spawn on a ring just outside the view. */
  SPAWN_RADIUS: 460,
  /**
   * Width of the arc the trickle arrives through, centred due east.
   * The road ahead is what is contested — walking forward should feel like
   * pushing through something.
   */
  SPAWN_CONE: Math.PI * 0.95,

  /**
   * XP needed for level N = XP_BASE + XP_STEP * (N-1) ^ XP_CURVE
   *
   * Flattened from 1.35 when the acts were lengthened: a longer road means
   * more kills, but a steep curve ate them and players were arriving at the
   * church around the same level as before despite fighting half again as much
   * on the way. The extra distance should buy something.
   */
  /*
   * FITTED, not guessed.
   *
   * The old curve (5 / 3.2 / 1.26) cost 3,855 XP to reach level 33 while act
   * one ALONE hands out about 3,300 — so the road ended with a nearly complete
   * build and the whole of Floriano was a victory lap. Every later problem
   * ("bosses melt", "they never reach me") is downstream of that one number.
   *
   * These are solved against the wave table below: with the density raised,
   * act one supplies ~6,000 XP, act two ~18,000 and act three ~5,000. At this
   * curve that lands the player at
   *
   *   level 18  at A MANIFESTAÇÃO   (was 30-33)
   *   level 30  at A MICROSOFT
   *   level 32  at the church door
   *
   * The exponent is what stops it running away: each level costing 1.86 of the
   * last means the tail of the run cannot outpace the content the way it did.
   */
  /**
   * WHAT LEVEL THE ROAD EXPECTS YOU TO BE, at a given distance.
   *
   * This exists because of a hole the measurements found, and it is the one
   * that actually lets a run run away: XP is earned per KILL, and difficulty
   * is keyed to DISTANCE. Standing still and farming an early stretch is
   * therefore free levels — enemies keep arriving at reach-4000 strength for
   * ever while the player compounds against them. Measured standing still at
   * reach 7000: 112 XP a second, which is a level every eight seconds.
   *
   * The fix keeps the game's rule that the journey belongs to the road and not
   * to the clock. Orbs are simply worth less once the player is ahead of the
   * road, on a curve steep enough that farming pays for itself twice and then
   * stops paying. Nobody is denied a level; the fourth hour of the first field
   * is just not worth as much as the first minute of it.
   *
   * It also helps in the other direction — a player who is BEHIND gets a
   * little more, so a bad stretch does not compound into an unwinnable one.
   */
  LEVEL_PACE: {
    /**
     * LEVEL THE CURVE EXPECTS BY THE END OF ACT TWO. Was 30.
     *
     * This number, not `XP_CURVE`, is what actually decides how often a player
     * levels. The controller below pins the level to roughly `expected(reach)`:
     * get ahead of it and orbs are worth a fraction, so making levels CHEAPER
     * on its own just means arriving at the same ceiling sooner and then
     * waiting there. The ceiling had to move too.
     */
    top: 40,
    /** Below 1: most of the levelling happens early, as it should. */
    curve: 0.85,
    /** How hard being ahead is punished, and how far it can fall. */
    power: 1.6,
    /**
     * AND THE FLOOR IS HIGHER. Was 0.16.
     *
     * A sixth of value is not a nudge, it is a stop: a player who got a level
     * ahead spent the next stretch watching corn worth almost nothing, which is
     * exactly the "it takes forever to level" complaint arriving through the
     * back door. A third still punishes farming without ever making a kill feel
     * pointless.
     */
    min: 0.33,
    max: 1.25,
  },

  /*
   * FLATTER AND CHEAPER, because it took too long.
   *
   * The curve was 1.86 on a step of 4, which is 6 + 4*(N-1)^1.86: level 10 cost
   * 259 and level 20 cost 1027, so the back half of a run levelled about once
   * every couple of minutes. The card screen is where a build actually gets
   * made — a run that reaches it eight times has eight decisions in it, and
   * most of a twenty-five minute run was spent between them.
   *
   * 4 + 3*(N-1)^1.62 puts level 10 at 122 and level 20 at 250: roughly half the
   * early cost and a quarter of the late one, so the second half of a run keeps
   * moving instead of flattening out.
   */
  /**
   * WALKING INTO A CROWD.
   *
   * Every body touching him on a frame contributes, capped two ways: how many
   * of them are counted at all, and how much of the bar the whole thing may
   * take. Four is enough that a wall hurts noticeably more than a straggler;
   * past four the difference is academic and the only thing more bodies would
   * add is a one-frame death.
   */
  CONTACT: {
    maxBodies: 4,
    /** Share of maximum health one frame of contact may ever cost. */
    maxFraction: 0.4,
  },

  XP_BASE: 4,
  XP_STEP: 3,
  XP_CURVE: 1.62,

  /** Debug overlay (F3). */
  DEBUG: false,
} as const

export type AimMode = typeof CONFIG.AIM_MODE
