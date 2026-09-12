/**
 * ACTIVE ABILITIES.
 *
 * Everything in `weapons.ts` is a multiplier on the revolver. These are
 * different: they run on their own clocks, fire their own projectiles, and
 * change what happens when the player is hit. Each one is tuned here as a
 * table indexed by how many times its card has been taken, so re-balancing is
 * editing a row of numbers rather than hunting through the systems.
 *
 * Read `[a, b, c]` as "1 stack, 2 stacks, 3 stacks". Values past the end of a
 * table clamp to the last entry.
 *
 * EVERY damage number below is multiplied by the player's `mods.damage`.
 * Card upgrades compound (1.22^n) while a flat ability does not, so without
 * that scaling the abilities quietly become traps — a bomb worth 130 is strong
 * at level 3 and irrelevant at level 15, and picking one costs you the run.
 * Tying them to the same gunpowder makes Melhorar a Arma improve your bombs
 * and your fish too, so the choice is about what you want rather than about
 * which card is not a mistake.
 */

export type AbilityId =
  | 'bomba'
  | 'escudo'
  | 'privacidade'
  | 'tijolo'
  | 'tambaqui'
  | 'teleporte'
  | 'homunculo'
  | 'orbital'
  | 'escudo_alien'
  | 'dash'
  | 'chuva'
  | 'tornado'
  | 'escudo_fiel'
  | 'escudo_voador'
  | 'cogumelo'
  | 'tupa'
  | 'lostmedia'
  | 'ventos'
  | 'bigorna'
  | 'podertupa'
  | 'cantarolar'
  | 'chapeu'
  | 'calice'
  | 'queima'
  | 'garra'
  | 'executar'
  | 'privada_fx'
  | 'amantes'
  | 'cabeca'

/** Reads a per-stack table. `stacks` is 1-based; 0 means the player lacks it. */
export function at(table: readonly number[], stacks: number): number {
  if (stacks <= 0) return 0
  return table[Math.min(stacks, table.length) - 1]
}

/**
 * THE TWO ABILITIES YOU HAVE TO PRESS SOMETHING FOR.
 *
 * Everything else in the build fires itself on a cooldown, which is the point
 * of a Vampire Survivors build — and it means the two exceptions are very easy
 * to own for ten minutes without ever using. Naming the key here rather than
 * only in the controls screen lets the HUD stamp it on the icon, where it is
 * read by someone who is currently being chased.
 */
export const ABILITY_KEYS: Record<string, string> = {
  queima: 'MOUSE 2',
  executar: 'X',
  dash: 'ESPAÇO',
  teleporte: 'Q',
  calice: 'F',
}

/**
 * THE SAME THREE, as the key the game actually reads.
 *
 * `ABILITY_KEYS` above is a LABEL — it is what gets stamped on the tile, and
 * "ESPAÇO" is not a keycode. This is the other half, so a touch button can say
 * `input.press(ABILITY_PRESS[id])` and arrive at exactly the same place a
 * keyboard would. Two tables rather than one object with two fields because
 * every reader wants one or the other and never both.
 */
export const ABILITY_PRESS: Record<string, string> = {
  queima: 'c',
  executar: 'x',
  dash: ' ',
  teleporte: 'q',
  calice: 'f',
}

export const ABILITIES = {
  /**
   * BOMBAS DO LOURO — lobbed to a random spot near the player on a timer.
   * More cards mean a shorter fuse between throws and a bigger bang, but the
   * blast radius NEVER grows: the size is the identity of the ability, and a
   * bomb that covers the screen stops being a thing you position around.
   */
  bomba: {
    maxStacks: 5,
    /** Bombs thrown per volley. More cards means more of them, not bigger ones. */
    count: [2, 3, 4, 5, 6],
    cooldown: [22, 19, 17, 15, 13],
    damage: [130, 140, 150, 160, 170],
    /** Fixed. On purpose. */
    radius: 76,
    /** Seconds in the air before it lands. */
    flight: 0.55,
    /** Seconds on the ground before it goes off. */
    fuse: 0.85,
    /** How far from the player it can be thrown. */
    throwRange: 210,
    throwMin: 60,
  },

  /**
   * RNG DE RPG — the dice are rolled and you live with the answer.
   *
   * It used to be a coin flip for a shield: heads you got one, tails you got
   * nothing, and "nothing" is the least interesting result a gamble can have.
   * Now it rolls the whole table in `data/gamble.ts` — shields, buffs, a bolt
   * from Tupã, a heal — and genuinely bad ones too: a jammed gun, a blast
   * centred on your own feet, mushrooms. It is the only thing in the build
   * that can hurt you, which is rather the point of gambling.
   *
   * Stacking shortens the wait between rolls and weights the table toward
   * outcomes you wanted. SORTE does the same, harder.
   */
  escudo: {
    maxStacks: 4,
    /** Seconds between rolls. Every card brings the table round faster. */
    interval: [26, 22, 18, 15],
    /** Added to the roll's luck, so cards and sorte both bend the table. */
    bias: [0, 1, 2, 3],
    /** How long the shield outcome lasts. Carried over from the old version. */
    duration: [2.4, 2.8, 3.2, 4.6],
  },

  /**
   * ESCUDO FIEL — the shield that always turns up.
   *
   * Deliberately the boring sibling of the RNG de RPG: shorter, weaker, and
   * absolutely certain. It exists so a player who wants protection can BUY
   * protection instead of gambling for it — and so the gamble is free to be a
   * real gamble without being the only route to a shield.
   */
  escudo_fiel: {
    maxStacks: 4,
    interval: [16, 14, 12, 10],
    duration: [0.9, 1.1, 1.3, 1.6],
  },

  /**
   * ESCUDO VOADOR — a drone that eats what is shot at him.
   *
   * The build already had three shields and all three answer the same
   * question: RNG de RPG might give you a window, Escudo Fiel definitely gives
   * you a shorter one, Escudo Alien banks a "no" for one blow. Every one of
   * them is about TIME — whether you happen to be protected at the instant
   * something lands.
   *
   * This one is about SPACE, and nothing else in the game does it: a small
   * thing orbiting him that catches enemy rounds out of the air and deletes
   * them. It does not care how hard the shot was or how many are coming; it
   * cares whether one crossed the ring while a drone was there.
   *
   * WHICH MAKES IT THE ANSWER TO A SPECIFIC PROBLEM. Glowies, rockets and the
   * Chará's fans are the parts of the late game that cannot be out-walked, and
   * until now the only counter to a screen full of green was a dash. This is a
   * second one, and it is a passive, so the player who took it is protected
   * while they are busy doing something else.
   *
   * Deliberately NOT a wall. It catches one round per drone per `reload`, so a
   * fan of five gets thinned rather than stopped, and standing still in front
   * of three Glowies is still a mistake.
   */
  escudo_voador: {
    maxStacks: 4,
    /** How many circle him. */
    count: [1, 2, 2, 3],
    /** Seconds before one can catch again. This is the real power curve. */
    reload: [1.3, 1.05, 0.8, 0.55],
    /** Radians per second, and how far out they sit. */
    spin: 1.6,
    radius: 42,
    /** Contact radius for catching a round. */
    size: 12,
  },

  /**
   * DASH EMPÍRICO — space, and he is somewhere else.
   *
   * The i-frames are the ability, not the distance. Everything else in the
   * build answers a crowd by killing it or by out-ranging it; this answers it
   * by being untouchable for a third of a second, which is the only thing that
   * works once a bullet-hell pattern has already closed around you.
   */
  dash: {
    maxStacks: 4,
    /*
     * MUCH shorter than it was — four and a half seconds down to under two.
     *
     * A dodge on a long cooldown is not a dodge, it is a resource you are
     * afraid to spend: the player hoards it, never uses it at the moment it
     * would help, and the ability reads as clunky because it is never
     * available when the situation calls for it. Movement abilities want to be
     * used constantly and to feel free.
     */
    cooldown: [1.35, 1.1, 0.9, 0.7],
    /** Seconds of the lunge itself, and of invulnerability. */
    duration: [0.24, 0.26, 0.29, 0.33],
    /**
     * World units per second while dashing.
     *
     * Duration times speed is the DISTANCE, and that is the number that was
     * wrong: 220 units at one card is barely two body-lengths — a dodge that
     * does not clear the thing you are dodging. 276 to 462 now, which is far
     * enough to leave a crowd instead of relocating inside it.
     */
    speed: [1150, 1240, 1320, 1400],
  },

  /**
   * DANÇA DA CHUVA — he dances and it rains ON HIM.
   *
   * A ring of weather that follows him for a few seconds and hurts everything
   * inside it, then stops and goes on cooldown. The thing you want it for is
   * being surrounded: it does not care which direction anything came from, it
   * only cares what is standing close.
   *
   * The first version dropped a static patch where he HAD been, after a delay,
   * as a bet on where the fight was going. It read as a puddle appearing
   * behind you for no reason — the delay meant you never saw the cause and the
   * effect together, and being anchored to the ground meant the one situation
   * it should answer, a crowd already on top of you, was the one it could not.
   */
  chuva: {
    maxStacks: 4,
    cooldown: [15, 13, 11, 9],
    /** Seconds the downpour follows him before it stops. */
    duration: [3.5, 4, 4.5, 5.5],
    radius: [92, 104, 116, 132],
    /** Damage per tick, and how often a tick lands. */
    damage: [13, 17, 21, 26],
    tick: 0.35,
  },

  /**
   * COGUMELO — he drops them as he walks, and they go off behind him.
   *
   * Dropped at his feet rather than thrown, which makes it the one power that
   * rewards RETREATING: everything else in the build wants the horde in front
   * of you, and this wants it following you through ground you have already
   * left. It hurts for three seconds and then blows up, so a chased player
   * leaves a trail of small disasters.
   */
  cogumelo: {
    maxStacks: 4,
    /** Seconds between drops. */
    cooldown: [4.5, 3.8, 3.1, 2.4],
    /** Seconds of growing before it starts stinging. */
    delay: 0.7,
    /** Seconds of area damage before it goes off. The brief is three. */
    duration: 3,
    radius: [52, 60, 68, 78],
    /** Damage per tick while it sits there. */
    damage: [10, 19, 21, 26],
    tick: 0.45,
    /** And the bang at the end. */
    burstRadius: [78, 88, 98, 112],
    burstDamage: [46, 58, 70, 86],
  },

  /**
   * LOST MEDIA — footage of you that nobody can account for.
   *
   * THE CONCEPT. The game is quietly recording him. Every so often a piece of
   * that recording surfaces: a washed-out, scan-lined copy of O Indígena from
   * a few seconds ago walks his own past back through the fight and fires the
   * shots he already fired. It cannot be hurt and it cannot be steered — it is
   * not a summon, it is a TAPE, and it plays whether it helps or not.
   *
   * Why it is good to play with rather than just a nice idea: the phantom
   * repeats what you DID, so the ability rewards having moved well ten seconds
   * ago. Standing in a corner produces a phantom that stands in a corner.
   * Cutting a clean arc through a crowd produces a second gun cutting the same
   * arc behind you. It is the only thing in the build where the value comes
   * out of your own past play rather than out of a number.
   *
   * More cards mean more tapes at once and a shorter gap between them, so a
   * maxed Lost Media is three of you on screen, all slightly out of step.
   */
  lostmedia: {
    maxStacks: 4,
    /** Seconds between one surfacing and the next. */
    cooldown: [13, 11, 9, 7],
    /** How many can be playing at once. */
    tapes: [1, 1, 2, 3],
    /**
     * How far back the recording is pulled from.
     *
     * SHORT, and it has to be. At six seconds the phantom trailed four hundred
     * and fifty units behind — a game where you are always walking forward
     * puts that permanently off screen, so the ability was a second gun nobody
     * ever saw. A second and a half keeps it just at your shoulder, which is
     * both more useful and considerably creepier.
     */
    delay: 1.5,
    /** Seconds a tape plays for before the signal goes. */
    duration: [5, 6, 7, 8],
    /** Shots per second, and what each is worth against the real revolver. */
    fireRate: 2.2,
    damage: [0.55, 0.62, 0.7, 0.8],
  },


  /**
   * VENTOS DE TUPÃ — the sky exhales and the street goes with it.
   *
   * The only crowd-control in the build. It does middling damage on purpose:
   * what it is for is the moment a swarm has closed and there is nowhere to
   * walk, and it answers that by MOVING the swarm rather than by killing it.
   * Knockback is enormous and the damage is an afterthought, which makes it
   * the one card that is worth taking when you are already winning on damage
   * and losing on space.
   */
  ventos: {
    maxStacks: 4,
    cooldown: [9, 7.5, 6, 4.5],
    radius: [150, 175, 200, 230],
    damage: [26, 34, 42, 52],
    /** World units per second the crowd leaves at. */
    push: 620,
  },

  /**
   * ARREMESSA BIGORNA — anvils, from nowhere, near you.
   *
   * The only friendly-fire card in the game, and that is the whole design: it
   * hits hard in a small circle and it does not care who is standing in it.
   * A telegraph is drawn where each one is coming down, so being hit by your
   * own anvil is always a thing you could have walked out of — which is what
   * makes it a risk rather than a tax.
   *
   * More cards drop more of them and drop them faster; the danger scales with
   * the damage, so it never becomes free.
   */
  bigorna: {
    maxStacks: 4,
    cooldown: [4.2, 3.4, 2.7, 2.1],
    /** Anvils per drop. */
    count: [1, 1, 2, 3],
    damage: [70, 90, 115, 145],
    /** What it does to YOU, if you are still under it. */
    selfDamage: [16, 20, 24, 30],
    /*
     * The footprint of the thing itself, not a blast — an anvil is about
     * forty units across and it hurts what is under it.
     */
    radius: 30,
    /** How far out they land. */
    spread: 110,
    /**
     * SECONDS OF FALLING, which is also the warning.
     *
     * There is no fuse. The shadow appears the moment it is thrown, grows all
     * the way down, and the damage happens when the anvil arrives — so the
     * time you have to move is exactly the time it is visibly in the air.
     */
    fall: 0.95,
    /** And how long it sits in the ground afterwards before it is gone. */
    rest: 0.9,
    /**
     * HOW FAR AHEAD OF A WALKING BODY IT AIMS, as a fraction of the fall.
     *
     * Not 1. Leading a target perfectly over a whole second of flight makes an
     * anvil that cannot be walked out from under, and the shadow stops being a
     * thing anybody has to read. At this it lands on whatever held still or
     * turned, and misses whatever kept going — which is the same deal the
     * player gets from it.
     */
    lead: 0.5,
  },

  /**
   * PODER DE TUPÃ — a window that opens whether you are ready or not.
   *
   * Every thirty seconds everything you own hits half again as hard for five
   * seconds, and for those five seconds the sky is also taking it out of you.
   * It is the only card in the game that damages the player on a timer, and
   * the reason it is interesting is that the window is NOT under your control:
   * you cannot save it for a boss, so the skill is noticing it has opened and
   * being somewhere worth being when it does.
   *
   * It boosts abilities and thrown things — not the revolver. Doubling the gun
   * would make it a damage card; leaving the gun out makes it a card about the
   * rest of your build.
   */
  podertupa: {
    maxStacks: 3,
    /** Seconds between windows. */
    cooldown: [30, 25, 20],
    /** How long it stays open. */
    window: [5, 5.5, 6],
    /** Multiplier on ability damage while it is. */
    power: [1.5, 1.7, 1.9],
    /** Health per second it costs to hold it open. */
    chip: [7, 8, 9],
  },

  /**
   * CANTAROLAR — he hums, and it goes off in a straight line.
   *
   * Fires where he is AIMING, which makes it the only automatic thing in the
   * build that answers to the mouse. Notes pierce, so it wants a queue rather
   * than a crowd, and it fires on its own clock rather than with the revolver
   * so the two never quite line up.
   */
  cantarolar: {
    maxStacks: 4,
    cooldown: [3.2, 2.8, 2.5, 1.8],
    /** Notes per phrase, in a small fan. */
    count: [2, 3, 3, 4],
    damage: [22, 28, 35, 44],
    pierce: 2,
    /*
     * SLOW. Slower than anything else he throws, and that is the point — a
     * note is meant to be watched drifting across the street, not fired.
     */
    speed: 110,
    /*
     * Distance, not seconds, and generous because a note that weaves covers a
     * good deal more ground than it crosses.
     */
    range: 440,
    /** How far off it will notice something worth going to. */
    seek: 260,
    /** Radians per second it can bend toward that. A drift, not a chase. */
    turn: 1.5,
    /** The dance: how hard it weaves, and how fast it changes its mind. */
    sway: 3.4,
    swayRate: 5.5,
  },

  /**
   * CHAPÉU-BONITO — one hat, and it is never two.
   *
   * The counter-example to every other card in the build: taking it again does
   * not give you more of the thing, it gives you a better one. There is one
   * hat, it sits on his head, and every so often it goes for a lap. Stacks buy
   * speed and damage and nothing else, which makes it the only card whose
   * value is legible without counting anything.
   */
  chapeu: {
    maxStacks: 4,
    /*
     * IT THROWS MORE THAN ONE HAT NOW, and that is the fix.
     *
     * A single point orbiting at radius 52 with a size of 13 sweeps a very
     * thin ring, and a thin ring in a crowd of four hundred misses almost
     * everything — the ability was doing real damage to whatever happened to
     * be standing on one exact circle and nothing to anybody else. More cards
     * used to buy a faster version of that same miss.
     *
     * Two hats at three cards and three at four, evenly spaced around the
     * orbit, so the ring is swept from several angles at once and a body
     * crossing it is actually struck. Spacing is handled in `hatAt`.
     */
    hats: [1, 2, 2, 3],
    /** Seconds between laps. */
    cooldown: [4.5, 3.5, 2.6, 1.8],
    /** How long a lap lasts, and how fast it goes round. */
    duration: [2.8, 3.2, 3.6, 4.2],
    spin: [5, 6.2, 7.4, 8.8],
    damage: [64, 92, 124, 168],
    radius: 54,
    /*
     * WIDER, so the ring is a band rather than a line. 13 was the size of the
     * picture; 21 is the size of the thing the picture is of, thrown.
     */
    size: 21,
    /** Seconds before the same body can be clipped again. */
    hitCd: 0.22,
    /**
     * THE TWO ENDS OF THE LAP.
     *
     * It used to teleport: on the frame the cooldown ended the hat was simply
     * fifty units away spinning, and on the frame the lap ended it was simply
     * back. A thing that leaves has to be seen leaving, so `launch` is how long
     * it takes to get out to the ring and `settle` is how long it takes to come
     * back down onto his head. Both are inside the lap, not added to it.
     */
    launch: 0.24,
    settle: 0.32,
    /** Where it sits when it is not doing anything: on his head. */
    restY: -23,
  },

  /**
   * CÁLICE — F, and whatever is in it.
   *
   * The only heal you can choose the moment of, which is worth a great deal in
   * a game where everything else happens on a timer. The catch is that the
   * chalice does not only contain water: for three seconds afterwards his aim
   * wanders, so drinking mid-fight trades health for the ability to hit
   * anything, and drinking early wastes it.
   */
  calice: {
    maxStacks: 3,
    cooldown: [26, 21, 17],
    heal: [40, 55, 72],
    /** Seconds of very poor aim, and how much worse it gets. */
    drunk: 3,
    sway: 0.42,
  },

  /**
   * RAIO DE TUPÃ — the sky picks something and deletes it.
   *
   * The only thing in the build that reaches across the whole screen, and the
   * only one that chooses its own target: it goes for the biggest health bar
   * in range rather than the nearest body, so it is the answer to a Grande
   * Gordo wading toward you while you are busy with everything else.
   *
   * It telegraphs before it lands. Not for fairness — nothing here can hit the
   * player — but because a bolt that simply appears reads as a bug, and one
   * that is announced reads as an event.
   */
  tupa: {
    maxStacks: 8,
    cooldown: [9, 8, 7.5, 6.5, 6.2, 5.8, 5.4, 5],
    /** Bolts per strike. */
    count: [1, 2, 3, 5, 6, 7, 8],
    damage: [95, 120, 145, 175],
    radius: [66, 74, 82, 92],
    /** Seconds of warning before it lands. */
    telegraph: 0.45,
    /** How far away the sky is willing to look. */
    range: 620,
  },

  /**
   * TORNADO — thrown out along the aim, and they keep going.
   *
   * They pierce everything, travel slowly and shove what they touch, so a
   * tornado is a moving wall rather than a bullet. Worth a power slot because
   * it does the one thing the revolver cannot: clear a line, and keep it clear
   * while it crosses.
   */
  tornado: {
    maxStacks: 4,
    cooldown: [7, 6, 5, 4],
    count: [1, 1, 2, 3],
    damage: [16, 20, 24, 28],
    speed: 165,
    radius: 17,
    /** World units before it blows itself out. */
    range: 560,
    /** Seconds before the same body can be hit by the same tornado again. */
    hitCd: 0.45,
  },

  /**
   * PRIVACIDADE — the protagonist goes invisible on a timer and the horde
   * loses him. They keep walking to where they last saw him, which is what
   * makes it read as losing track rather than as switching off.
   */
  privacidade: {
    maxStacks: 4,
    /** Seconds between vanishings. Constant. */
    interval: 25,
    duration: [3, 4, 5, 6],
  },

  /**
   * TIJOLO DE LEITE — the sweet is a brick. Anything that hits him hurts
   * itself. Every card makes the brick harder.
   */
  tijolo: {
    maxStacks: 5,
    damage: [14, 23, 32, 41, 50],
  },

  /**
   * TAMBAQUI — he throws fish at whatever is closest. They fly further than
   * the revolver reaches and go through a body on the way.
   */
  tambaqui: {
    maxStacks: 10,
    interval: [3.2, 2.8, 2.4, 2.0, 1.7],
    /** Fish per throw. A handful at once, not one at a time. */
    count: [2, 3, 4, 5, 6],
    damage: [22, 27, 32, 37, 42],
    speed: 230,
    pierce: 1,
    radius: 7,
    /** World units before a fish drops. */
    range: 420,
  },

  /**
   * HOMÚNCULO — a familiar that walks with you and takes the beating.
   *
   * It draws aggro: anything close enough goes for it instead of you, which is
   * the whole value. It is made of nothing and dies fast, but every hit it
   * takes costs the attacker, so a homúnculo dying in a crowd is not a loss so
   * much as a trade. It comes back a few seconds later.
   */
  homunculo: {
    maxStacks: 6,
    /** How many walk with you, one per card. */
    count: [1, 2, 3, 4, 5, 6],
    /*
     * THEY LAST NOW.
     *
     * 150 health at six cards, against late enemies that hit for 80 to 130,
     * is a bodyguard that survives TWO TOUCHES and then leaves you alone for
     * four and a half seconds. What the player saw was a little man who
     * appeared, died, and appeared again — never present at the moment they
     * needed one, which is the definition of useless.
     */
    hp: [260, 340, 430, 530, 640, 780],
    /** Damage returned to whatever hits it. */
    thorns: [70, 95, 130, 170, 215, 265],
    /*
     * AND THEY HIT THINGS, which they never did.
     *
     * Until now a homúnculo could only hurt something that chose to attack it;
     * standing next to an enemy did nothing at all. That made a squad of six a
     * set of speed bumps. This is what turns them into what the card looks
     * like it is buying — a group of little men fighting alongside you.
     */
    attack: [34, 46, 60, 76, 94, 116],
    /** Seconds between one's swings. */
    attackCd: 0.75,
    /** How far one reaches to swing. */
    attackRange: 26,
    /** Seconds before a missing one is summoned. */
    summonDelay: 3.2,
    /** Enemies inside this range of a homúnculo target it instead of you. */
    aggroRadius: 150,
    speed: 100,
    /** How far in front of the player they hold station. */
    guardDist: 40,
    /** How far out they look for something to stand in front of. */
    guardScan: 320,
    radius: 200,
  },

  /**
   * TELEPORTE INDÍGENA — double-tap Q to jump toward the cursor. Short, on a
   * cooldown, and it does not pass through the barrier in the church.
   */
  /**
   * TELEPORTE INDÍGENA — Q, and he is somewhere else.
   *
   * SINGLE PRESS now, not a double tap. The double tap existed to stop
   * accidental blinks, which was solving a problem nobody had at the cost of
   * the one that mattered: an escape that needs two inputs inside a third of a
   * second is an escape you fumble exactly when you are panicking, which is
   * the only time you want it. One key, short cooldown, no ceremony.
   */
  teleporte: {
    maxStacks: 3,
    /*
     * FURTHER, AND MORE OFTEN.
     *
     * At 170 units it went barely half a screen for two and a half seconds of
     * cooldown, which made it a worse dash that also cost a slot. A blink has
     * to go somewhere a walk could not, or it is not a blink.
     */
    distance: [210, 260, 310],
    cooldown: [1.9, 1.5, 1.15],
  },

  /**
   * REBIMBOCA ORBITAL — parts he keeps spinning around himself.
   *
   * The only thing in the build that defends the space he is STANDING IN
   * rather than the space he is pointing at: the gun answers the front, these
   * answer the back.
   *
   * Each one is spent on its first hit and has to be forged again, which is
   * what makes it a resource rather than a passive. Walking through a crowd
   * strips the ring bare in a second and then you have nothing behind you
   * until it builds back up — so it rewards keeping a little distance while it
   * reloads, instead of being an aura you forget about.
   *
   * It used to be a permanent ring computed from one angle. That had two
   * problems and one of them was fatal: nothing ever drew it, so it dealt
   * damage from thin air and read as broken.
   */
  orbital: {
    maxStacks: 4,
    /** How many can be spinning at once. */
    cap: [3, 4, 5, 6],
    /*
     * SPENT ON THE FIRST THING IT TOUCHES, SO IT HITS HARD — and it did not.
     *
     * The sustained output of this card is one orb per `respawn`, and nothing
     * else: at four cards that was 56 damage every 1.4 seconds, forty a
     * second, against bodies with thousands of health. The identity was fine
     * and the numbers were a rounding error.
     *
     * Each one is now worth killing something with, and the ring rebuilds
     * fast enough that walking through a crowd is a sequence of hits rather
     * than one hit and an empty orbit.
     */
    damage: [110, 155, 205, 270],
    /** Seconds to forge a replacement. */
    respawn: [1.5, 1.2, 0.95, 0.7],
    /**
     * AND IT TAKES THE NEIGHBOURS WITH IT.
     *
     * A spent orb detonates for a third of its damage in a small radius. It
     * is what stops the ring being strictly single-target — a part flying off
     * a machine at speed does not politely strike one thing.
     */
    splash: 62,
    /** Radians per second. Fast enough to threaten, slow enough to read. */
    speed: 3.1,
    /** How far out they sit. */
    radius: 58,
    /** Contact radius of one. */
    size: 12,
  },

  /**
   * ESCUDO ALIEN — charges, not seconds.
   *
   * Every other defence in the game is a window of time you may or may not be
   * standing in when it matters. This one waits: a charge sits there until
   * something actually hits you, and then eats that blow whole. Now that a
   * single touch can take a third of your health, a banked "no" is worth a
   * legendary slot.
   */
  escudo_alien: {
    maxStacks: 3,
    /** Charges held at once. */
    capacity: [1, 2, 3],
    /** Seconds to replace a spent charge. */
    recharge: [16, 14, 12],
  },

  /**
   * QUEIMA ROSCA — he sets himself on fire and walks into them.
   *
   * HELD, not fired. Every other power in the build is a thing that happens TO
   * the fight on a clock; this one is a state the player holds open, and its
   * identity is that the longer it stays open the better and the worse it gets.
   *
   * IT BUILDS HEAT, AND THE HEAT IS BOTH HALVES OF THE BARGAIN.
   *
   * Cold it is weak — a bit over half damage on a smaller ring. Held, it
   * climbs for about three seconds to well past its listed damage on a ring
   * half again as wide, and the price per second climbs with it. At the top it
   * OVERHEATS: one loud vent that hits everything near him for four seconds'
   * worth of the ring, and then the ability is dead for two and a half.
   *
   * WHY IT NEEDED THAT. The cost was flat and floored at one point of health
   * — which meant a player sitting on one health paid literally nothing and
   * could hold two hundred damage a second open forever. The floor
   * has to stay (a held button must never end a run), so the limit had to stop
   * being his health and start being the ability's own body: it cuts out.
   *
   * WHICH MAKES IT A DECISION AGAIN. Let go before the top and it cools with no
   * penalty, so the skill is riding it near the line; or tip it deliberately
   * for the vent and eat the lockout. Neither is wrong, and holding it is now
   * meaningfully better than tapping it, which it never was.
   *
   * And it LEAVES them burning. The ring is where he is; the fire he lights is
   * where they were, which is what stops it being a melee aura you have to
   * stand still inside.
   */
  queima: {
    maxStacks: 4,
    /** Damage a second to everything in the ring, at the middle of the meter. */
    dps: [58, 98, 135, 205],
    /** And to him. Cards make the fire hurt more; nothing makes it cheaper. */
    selfDps: [5, 8, 15, 20],
    radius: [62, 70, 80, 92],
    /** Seconds of fire left on anything the ring touches. */
    burn: 3,
    burnDps: [15, 23, 32, 44],

    // -------------------------------------------------------------- HEAT --
    /** Meter a second while held: a shade over three seconds from cold to vent. */
    heatUp: 0.32,
    /** And back down, released. Faster than it rises, so backing off is cheap. */
    heatDown: 0.45,
    /** Seconds the ability is dead after a vent. */
    lock: 2.5,
    /**
     * WHAT THE METER IS WORTH, cold to overheating.
     *
     * Damage and radius both ride it. The low end has to be genuinely poor or
     * there is no reason to hold it; the high end has to be genuinely better
     * than the number on the card or there is no reason to risk the lockout.
     */
    coldMul: 0.55,
    hotMul: 1.25,
    coldRadius: 0.78,
    hotRadius: 1.18,
    /** The price rides it too: half at cold, double at the top. */
    coldCost: 0.5,
    hotCost: 2,
    /** The vent, in seconds-of-ring. Four, so tipping it is worth something. */
    ventMul: 4,
    /** And how far it reaches, against the hot radius. */
    ventRadius: 1.45,
  },

  /**
   * A GARRA — anything that comes within reach gets opened up.
   *
   * The purely defensive answer to being crowded, and deliberately the DUMBEST
   * one: no cooldown to read, no button, no positioning. It is a radius and a
   * per-body timer, and what it buys is that walking through a pack is no
   * longer free for the pack.
   *
   * Distinct from Rebimboca, which is a ring of things that are SPENT: this
   * never runs out and never rebuilds, it simply costs a body a slice every
   * half second it insists on standing next to you.
   */
  garra: {
    maxStacks: 4,
    damage: [25, 25, 35, 45],
    radius: [15, 16, 20, 25],
    /** Seconds before the same body can be clawed again. */
    hitCd: 1,
  },

  /**
   * EXECUTAR — go and take one, and land on the rest of them.
   *
   * IT WAS TOO NARROW TO EXIST. Two gates had to line up at once: under HALF
   * health himself, and a body under a fifth of its own. On a run going even
   * slightly well the first gate is shut for whole acts at a time, and when it
   * did open the second one wanted a body that the revolver was about to kill
   * anyway. Players took the card and went minutes without the prompt ever
   * appearing, which is not a niche — a niche is a thing that happens sometimes.
   *
   * SO BOTH GATES MOVED. Anything short of full health offers it, and a body
   * at a third to over half is takeable. It is still a card about being hurt
   * and about finishing something; it is now a card that comes up.
   *
   * IT LANDS LIKE SOMETHING HEAVY. The leap used to put him alone in the
   * middle of whatever crowd the dying body was standing in, with half a
   * second of invulnerability and no answer — so the ability's own reward
   * regularly killed the player who used it. The landing is a blast now: real
   * damage, real knockback, and the ring is what buys the space he arrived in.
   *
   * THE KILL ITSELF IS STILL NOT DAMAGE. Whatever he lands ON is simply gone,
   * with no number and nothing for a damage card to improve. The blast is
   * around it, not on it.
   *
   * AND THE HEAL IS WORTH THE TRIP. It was half of the body's own hit — eight
   * health off an Alienígena, for a card whose whole premise is that you are
   * about to die. It is a share of your own maximum now, plus that same bite
   * of the body's damage on top.
   */
  executar: {
    maxStacks: 3,
    /** Health fraction at or under which a body may be taken. Was 0.20-0.35. */
    threshold: [0.35, 0.45, 0.58],
    /** And how hurt he has to be for it to be offered at all. Was 0.5. */
    selfBelow: 0.92,
    range: [230, 280, 340],
    cooldown: [6.5, 5, 3.8],
    /** Fraction of the body's own damage returned as health. */
    heal: 0.75,
    /** And a share of his own maximum, which is the half that matters. */
    healPct: [0.12, 0.16, 0.2],
    /**
     * HOW LONG THE MARK LASTS once a body has been picked out.
     *
     * The mark used to be recomputed from scratch every frame, so it flicked
     * between targets as the crowd moved and vanished the instant the revolver
     * finished the one it was on. There was no window to see, which is why
     * nobody could tell how long they had to press X: there was no answer.
     *
     * Now one body is chosen, held for four seconds whatever else dies, and
     * the time left is drawn on it as a ring that empties.
     */
    window: 4,
    /** What the landing does to everything that is not the target. */
    blast: [70, 105, 150],
    blastRadius: [86, 100, 118],
  },

  /**
   * A PRIVADA — a cogumelo that does not go off.
   *
   * Same shape, opposite ending. The mushroom is a short fuse with a bang: you
   * drop it and back away. This sits and sprays for twice as long and never
   * bursts, so it is an area you FIGHT IN rather than an area you leave, and
   * the two cards together give the build both halves of that idea.
   *
   * Longer, wider and weaker per tick than the mushroom, because a hazard you
   * are meant to stand next to has to be worth standing next to for a while.
   */
  privada_fx: {
    maxStacks: 4,
    cooldown: [6.5, 5.4, 4.4, 3.5],
    /** Seconds of spraying. The mushroom manages three. */
    duration: [5.5, 6, 6.5, 7.5],
    radius: [60, 68, 78, 90],
    damage: [11, 17, 24, 33],
    tick: 0.4,
    delay: 0.35,
  },

  /**
   * AMANTES — one of them changes its mind.
   *
   * Picks a body near him and turns it, for a while. It fights whatever it can
   * reach on his behalf, it stops being able to hurt him, and crucially it can
   * still be hurt BACK: the horde does not know one of its own has gone over
   * and treats it exactly as it treats him.
   *
   * WHICH IS WHY IT IS BUFFED WHILE IT IS TURNED. An ordinary cow sent into a
   * crowd of four hundred lasts about a second and a half, and a power whose
   * effect is over before the player has looked at it is not a power. Three
   * times the health and a bit over twice the damage is roughly what it takes
   * for one to be a thing you watch happen.
   *
   * Never a boss and never something already turned — see `updateAmantes`.
   */
  amantes: {
    maxStacks: 3,
    cooldown: [16, 12.5, 9],
    /** Seconds it stays on your side. It dies when this runs out. */
    duration: [12, 16, 21],
    /** What being loved is worth, in health and in damage. */
    hp: 3,
    damage: 2.2,
  },

  /**
   * ARRANCA CABEÇA @ sometimes the head comes off, and it keeps going.
   *
   * Fires on a KILL rather than on a clock, which is the whole character of
   * it: every other power in the build has a rhythm the player learns to read,
   * and this one has none. It pays out in proportion to how well the run is
   * already going, so it is loudest exactly when the screen is fullest.
   *
   * The skull ricochets. That is not decoration @ a projectile spawned inside
   * a crowd and travelling in a straight line would leave it in about a fifth
   * of a second, and the bounce is what keeps it in the mess it was born in.
   * Which also means the card is worth almost nothing against one big body and
   * a great deal against forty small ones, and that is a shape the deck did
   * not otherwise have.
   *
   * IT CHAINS, AND THE CHAIN DIES OUT. A head that killed something has an
   * 80% chance of taking that one's head too, then 70%, then 60% — ten points
   * off every link, so the ninth is impossible. Measured over three thousand
   * forced chains: mean 2.9 heads, ninth link once. In an actual crowd it
   * comes out shorter still — mean 2.0 over two hundred live chains — because
   * a head that finds nothing to kill ends the run early.
   *
   * THAT DECAY IS THE WHOLE SAFETY OF IT. A flat 80% never terminates on its
   * own: the expected length is five but the tail is unbounded, and one lucky
   * run of twenty clears the field. Subtracting ten points a link puts a wall
   * at nine no matter how the dice fall, so the ability can be loud without
   * ever being able to play itself.
   *
   * And ONE ROLL PER HEAD, not per kill — see `combat`. A head with five
   * bounces can kill five bodies, and rolling on each would make this a tree
   * branching about five to one, which no amount of decay contains.
   */
  cabeca: {
    maxStacks: 4,
    /** Chance per kill. */
    chance: [0.30, 0.35, 0.40, 0.50],
    /** Damage, as a multiple of the base revolver round. */
    damage: [1.6, 2.1, 2.7, 3.5],
    /** Bodies it may jump between before it drops. */
    bounces: [2, 3, 4, 5],
    /** How far it looks for the next head to take. */
    bounceRange: 190,
    /**
     * A SKULL'S OWN KILL CONTINUES THE CHAIN THIS OFTEN, first link.
     *
     * Not a stack table. The stacks buy how often the chain STARTS and how
     * hard each head hits; the decay is the same for every build, so a player
     * with one copy and a player with four read the chain the same way.
     */
    chainChance: 0.8,
    /** Taken off that chance at every further link. Eight links, then zero. */
    chainStep: 0.1,
    speed: 300,
    /** World units of travel before it falls over. */
    life: 340,
    radius: 7,
  },
} as const
