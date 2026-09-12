import type { EnemyDef } from '../types'

/**
 * THE BESTIARY.
 *
 * Every species here has art. Anything without a sprite has been taken out
 * rather than left as a coloured blob — a placeholder monster is fine while a
 * system is being built and embarrassing once the roster is real.
 *
 * TWO GATES set the pacing, and a species needs both.
 *
 * `firstSeenAt` is distance — the coarse one, keeping town enemies out of the
 * caatinga. `unlockKills` is the cadence: clear a quota of what is in front of
 * you and the road answers with something new. Walking further does not skip
 * the bestiary, and neither does standing still and farming; the run opens
 * with one mutated cow either way.
 *
 * The kill numbers are measured, not guessed, and they are much smaller than
 * they look like they should be. An instrumented run reaches Floriano at
 * around ninety-six kills and leaves it at about a hundred and eighty — you
 * walk past far more than you shoot. An earlier set of quotas in the 175-260
 * range had been written for a shorter game, and the effect was that almost
 * the whole Floriano roster never unlocked before the church: the town was
 * three species and a rumour.
 *
 * THESE ARE COUPLED TO ENEMY HEALTH, which is the trap. Doubling how long a
 * body takes to kill halves how many bodies a run gets through, and every
 * quota here silently becomes too high — it has now had to be re-derived twice
 * for exactly that reason. Re-measure the kill curve before trusting them
 * after ANY change to health, density or act length.
 *
 * `bark` is what O Indígena says the first time he sees one.
 *
 * BOSSES HIT MUCH HARDER THAN ANYTHING ELSE, on purpose. A boss that deals
 * ordinary contact damage is a wall with a health bar: the crowd is what makes
 * a run attritional, and a boss is supposed to be the thing that ends it in
 * three mistakes rather than thirty. Their touch is roughly a third of a full
 * health bar.
 *
 * ON CONTACT DAMAGE. These numbers are roughly double what they were, and that
 * is the point: against 100 starting health, four or five touches is the whole
 * bar, so ANY contact is a real event rather than a tax on walking through a
 * crowd. The old figures let the player stroll into a herd and shoot their way
 * out, which made the opening of a run something you could not lose.
 *
 * XP WENT UP WITH THE HEALTH, and had to. A level-up is paid for in bodies,
 * so making every body take twice as long to drop quietly halved the rate the
 * player grows at — runs started arriving at the Act I boss two levels below
 * where they used to, with three cards to their name and a slot cap they never
 * got near. XP is the price of the danger cleared, not of the corpse.
 *
 * Health went up alongside the damage, but by less. Damage is what makes an enemy
 * dangerous; health is only what makes it slow. Doubling both would have
 * produced a game that was harder AND took longer, which is not the ask.
 */
export const ENEMIES: Record<string, EnemyDef> = {
  // ------------------------------------------- ATO I — A ESTRADA (caatinga) --

  /** The first thing you ever meet. Slow, heavy, and it used to be somebody's. */
  vaca: {
    id: 'vaca', name: 'Vaca Mutada', behavior: 'chase',
    firstSeenAt: 0,     unlockKills: 0,
    sheet: 'vaca_mutada',
    bark: 'Parece que, as vacas estão sendo mudadas pelos aliens..',
    hp: 24, speed: 46, damage: 17, attackCd: 0.9, radius: 11, xp: 6,
    color: '#c9a06a', size: 26, mass: 1.2,
  },

  /** They bagged the cattle. The bags float. Nobody has explained this. */
  vaca_saquinho: {
    id: 'vaca_saquinho', name: 'Vaca no Saquinho', behavior: 'swarm',
    firstSeenAt: 700,   unlockKills: 5,
    sheet: 'vaca_saquinho',
    bark: 'Botaram a vaca no saquinho?!',
    hp: 30, speed: 38, damage: 19, attackCd: 1.0, radius: 11, xp: 7,
    color: '#e8e2d0', size: 26, mass: 1.0,
    hover: 10,
  },

  /**
   * Cannot be one-shot. Whatever lands on it first only breaks it, and it
   * survives to come apart into the broken form — which vents energy in every
   * direction while it is still up. The thing you failed to kill is now the
   * thing shooting at you.
   */
  coisa: {
    id: 'coisa', name: 'Coisa Voadora', behavior: 'swarm',
    firstSeenAt: 1600,  unlockKills: 14,
    sheet: 'coisa_voadora',
    sheetHurt: 'coisa_voadora_quebrada',
    breaksOnFirstHit: true, brokenHp: 15,
    bark: 'Caralho, o shiroan ta certo puta que pariu.',
    hp: 18, speed: 58, damage: 12, attackCd: 0.7, radius: 9, xp: 6,
    color: '#9fd45a', size: 22, mass: 0.5, hover: 14,
    brokenBurst: { interval: 2.3, count: 5, speed: 110, damage: 11 },
  },

  /**
   * The rank and file, in three colours. A couple start drifting in around the
   * middle of the road — a hint of what the town is full of — long before
   * Floriano is crawling with them.
   */
  alien_basico: {
    id: 'alien_basico', name: 'Alienígena', behavior: 'chase',
    firstSeenAt: 5200,  unlockKills: 26,
    sheets: ['alien_verde', 'alien_azul', 'alien_amarelo'],
    bark: 'Opa. Esse aí não é daqui não.',
    hp: 38, speed: 52, damage: 20, attackCd: 0.8, radius: 8, xp: 5,
    color: '#6fcf6f', size: 22, mass: 0.7,
  },

  /**
   * A MINHOCA ALIEN — the first thing in the game you cannot simply shoot.
   *
   * TWO STATES, AND THEY ARE OPPOSITES. Under the ground she is untouchable
   * and mobile: nothing hits her, she deals no damage, and she creeps toward
   * the player at a speed a walking man beats easily. Up, she is the reverse — she cannot move at all, she is a target standing still, and she is
   * made of paper. So the species is a rhythm: wait, shoot, wait, shoot.
   *
   * WHAT MAKES HER A THREAT IS THE ONE THING SHE DOES WHILE BURIED. Walking
   * into the mound is a GRAB — the same struggle the Navé Mãe uses, the same
   * mashing to get out, the same drain while held. She never lands a hit; she
   * catches you and holds you where everything else can.
   *
   * SO SHE IS AREA DENIAL IN ACT ONE, which act one did not have. The caatinga
   * until now is a place you walk through in whatever line you like; a mound
   * crossing that line is the first time the ground itself is the problem.
   *
   * Cheap health, because she is untouchable for most of her life: a species
   * you can only damage a third of the time cannot also be tough.
   */
  minhoca: {
    id: 'minhoca', name: 'Minhoca Alien', behavior: 'burrow',
    firstSeenAt: 3000, unlockKills: 14,
    sheet: 'minhoca',
    bark: 'O chão tá se mexendo. O CHÃO.',
    // `damage` is what a touch costs while she is UP. Buried, the grab is the
    // whole attack and it drains on its own clock — see `updateGrab`.
    hp: 30, speed: 30, damage: 8, attackCd: 1.2, radius: 10, xp: 7,
    color: '#5fbf5f', size: 24, mass: 1.4,
  },

  // ---------------------------------------------- ATO II — AS RUAS (cidade) --

  /**
   * A criminal they abducted and drove. He shoots on the way in but he is
   * coming regardless — what he wants is to reach you and take something off
   * you. Made of paper: two shots put him down, and that is the whole answer.
   */
  tripa_seca: {
    id: 'tripa_seca', name: 'Tripa Seca', behavior: 'stalker',
    firstSeenAt: 10500, unlockKills: 62,
    sheet: 'tripa_seca',
    bark: 'Favelado abduzido!! esconde as habilidades.',
    /*
     * THE SHOOTING IS PRESSURE, and pressure is not a barrage.
     *
     * Its own behaviour comment says the gun is there to make the approach
     * uncomfortable and that the POINT is reaching you — but at 1.5 seconds a
     * pack of them put out more fire than the Glowies do, from something that
     * is meant to be closing the distance rather than holding it. 2.8s is
     * still a shot on the way in; it is no longer a wall on the way in.
     */
    /*
     * FASTER, AND THAT MAKES HIM LESS ANNOYING RATHER THAN MORE.
     *
     * He was 52 against a player who walks at 118, so he could never actually
     * arrive: what a Tripa Seca did all fight was trail along behind at the
     * edge of the screen putting out the occasional shot, and cash in whenever
     * the player got boxed into a corner by something else. The encounter had
     * no shape — you never chose to deal with him, he was ambient tax with a
     * robbery attached.
     *
     * At 70 he closes, does the thing, and dies to the two shots he is made
     * of. Still comfortably slower than the player, so running is a real
     * answer; fast enough that ignoring him is a decision with a cost rather
     * than the default.
     */
    hp: 30, speed: 65, damage: 16, attackCd: 2.8, radius: 6, xp: 9,
    color: '#7fd0c8', size: 24, mass: 0.6,
    steals: true,
  },

  /**
   * SALEIRO — floats around salting the ground, and the salt is the weapon.
   * Standing anywhere near one costs you continuously, so it is not something
   * to walk past; it is something to leave.
   */
  saleiro: {
    id: 'saleiro', name: 'Saleiro', behavior: 'chase',
    firstSeenAt: 10800, unlockKills: 70,
    sheet: 'saleiro',
    bark: 'Tá salgando o chão, é? JOGA SAL',
    hp: 130, speed: 40, damage: 17, attackCd: 1.2, radius: 10, xp: 9,
    color: '#e6e0cf', size: 24, mass: 0.9, hover: 12,
    aura: { radius: 62, dps: 10 },
  },

  /**
   * EXPLOSIVO — carries an egg toward you at a walking pace, then lights the
   * fuse when it is close enough. Slow on purpose: the counterplay is noticing.
   */
  explosivo: {
    id: 'explosivo', name: 'Alien do Ovo', behavior: 'bomber',
    firstSeenAt: 11200, unlockKills: 78,
    sheet: 'explosivo',
    bark: 'Ele tá com um OVO.',
    hp: 126, speed: 34, damage: 0, attackCd: 1, radius: 10, xp: 10,
    color: '#d8a05a', size: 24, mass: 0.9,
    detonates: { radius: 150, damage: 48, triggerRange: 44, fuse: 0.85 },
  },

  /**
   * ROCKET — sits there doing nothing until you come inside its detection
   * ring, then lights up and flies at you. Idle it is scenery; awake it is a
   * missile, and the sprite changes so you can tell which one you are looking at.
   */
  rocket: {
    id: 'rocket', name: 'Alien Foguete', behavior: 'rocket',
    firstSeenAt: 11800, unlockKills: 94,
    sheet: 'rocket_idle',
    sheetActive: 'rocket_flying',
    bark: 'FOGUETE!!! FODEU!',
    /*
     * IT WAS NOT A THREAT, IT WAS A COIN FLIP.
     *
     * Two hundred and ten units a second from three hundred away, with a fuse
     * of two tenths of a second, is under one and a half seconds from "that
     * one woke up" to fifty-three damage in a sixty-two radius — and the fuse
     * is the only part of that the player can react to. Two tenths is not a
     * telegraph, it is a formality.
     *
     * `detonates.damage` also does NOT scale with the road (see `detonateOn`),
     * so this number is flat for the whole game: it is a third of a health bar
     * on the road and a third of one at the church door, which is why it never
     * stopped being the thing that ends runs.
     *
     * Slower in, smaller blast, and a fuse you can actually leave. It still
     * hurts more than anything else its size; it now asks to be noticed rather
     * than asking to be already elsewhere.
     */
    /*
     * IT ARMS, IT SWELLS, AND THEN IT GOES OFF.
     *
     * It used to be a contact mine with legs: the fuse was never read — the
     * behaviour detonated the instant `dist < triggerRange` — so the whole
     * event was "something orange touched you and you lost a third of a bar".
     * There was nothing to react to because there was no moment between the
     * approach and the blast.
     *
     * It is a creeper now. At fifty units it STOPS, hisses, swells and flashes
     * faster and faster for most of a second, with its blast radius drawn on
     * the dirt the whole time — and if you are out of that circle when the
     * fuse ends, it stands down and comes again. The damage is back up because
     * it is now a thing you are allowed to beat.
     *
     * `triggerRange` is deliberately INSIDE `radius`: it arms while you are
     * already in the blast, so the answer is always to move, never to stand
     * where you are and shoot it.
     */
    hp: 90, speed: 168, damage: 0, attackCd: 1, radius: 9, xp: 10,
    emits: { r: 255, g: 176, b: 90, radius: 56, strength: 0.6 },
    color: '#c0554a', size: 22, mass: 0.6, hover: 10,
    detectRange: 260,
    detonates: { radius: 58, damage: 35, triggerRange: 50, fuse: 0.85 },
  },

  /**
   * GLOWIE — comes in threes and lights up the street. They shoot, and the
   * glow itself hurts, so a cluster is a no-go area rather than three separate
   * problems.
   */
  glowie: {
    id: 'glowie', name: 'Glowie', behavior: 'shooter',
    firstSeenAt: 12400, unlockKills: 102,
    sheet: 'glowie',
    bark: 'AGENTES BRILHANDO!! OS ALIENS SÃO DA ABIN!.',
    /*
     * FEWER SHOTS, NOT WEAKER ONES.
     *
     * A Glowie fires one round per `attackCd` and arrives in a group, so the
     * number of green bullets in the air is cadence multiplied by group size
     * — and at 1.5s in threes that was two shots a second PER GROUP, from
     * every group on the field at once. What the player saw was not an enemy
     * they were dodging, it was weather.
     *
     * 2.6s in pairs is about a third of the old volume. The round still hurts
     * exactly as much: the problem was never that a Glowie shot was dangerous,
     * it was that there was no gap between them to move in.
     */
    hp: 156, speed: 34, damage: 26, attackCd: 2.6, radius: 9, xp: 9,
    // It is called a Glowie. In a night street it had better glow.
    emits: { r: 130, g: 255, b: 130, radius: 74, strength: 0.72 },
    color: '#7bf07b', size: 22, mass: 0.7,
    aura: { radius: 46, dps: 5 },
    groupSize: 2,
    shot: 'glow',
  },

  /** A damage sponge. Slow, enormous, and it takes a magazine to put down. */
  grande_gordo: {
    id: 'grande_gordo', name: 'Grande Gordo', behavior: 'chase',
    firstSeenAt: 11500, unlockKills: 86,
    sheet: 'grande_gordo',
    bark: 'Esse é grande demais pra bala pequena.',
    hp: 620, speed: 25, damage: 36, attackCd: 1.1, radius: 14, xp: 26,
    color: '#5a6a8c', size: 28, mass: 2.6,
  },

  /**
   * CARRO — a Floriano folk doing ninety down the street.
   *
   * It does not chase and does not steer: it picks a direction and commits. It
   * is also not on anyone's side, so it ploughs the aliens as happily as it
   * hits you. Very fast, and it soaks an absurd amount, because the joke does
   * not work if you can shoot it before it arrives.
   *
   * It used to be pinned to the road, which meant it only ever came at you
   * along one axis and vanished the moment you stepped off. There is no road
   * now: it comes from wherever it likes, which is both funnier and worse.
   */
  carro: {
    id: 'carro', name: 'Doido do Carro', behavior: 'car',
    firstSeenAt: 10500, unlockKills: 112,
    sheet: 'carro',
    bark: 'ESSE AÍ NEM É ALIEN. É O DOIDO DO CARRO.',
    hp: 1200, speed: 340, damage: 125, attackCd: 0.5, radius: 20, xp: 30,
    color: '#c8442e', size: 30, mass: 9,
    plough: 90,
  },

  // -------------------------------------------------------------- OS CHEFES --

  /**
   * A MANIFESTAÇÃO — the riot at the edge of town, and the wall between the
   * road and Floriano.
   *
   * A crowd of mind-controlled people that fights like a bullet hell: it fills
   * the space with flags rather than chasing, and keeps throwing bodies into
   * the arena while it does. The field is swept before it arrives, so there is
   * nothing on screen but the riot and what it makes.
   */
  manifestacao: {
/*
 * WHY THE BOSS NUMBERS LOOK LIKE THIS.
 *
 * They are not guesses. Single-target damage was measured in-engine against a
 * standing dummy, on the build the player is expected to be carrying when they
 * arrive — which is now a much smaller build than it was, because the XP curve
 * used to hand out level thirty-three by the end of the road (see CONFIG).
 *
 *   at A MANIFESTAÇÃO, level ~18   101 dps
 *   at A MICROSOFT,    level ~30   757 dps
 *   at O CHARÁ,        level ~33   ~700 dps
 *
 * Health is that figure times an intended fight length, times 0.7 for the time
 * nobody spends shooting the boss — dodging, turning, clearing what the fight
 * throws in. Targets: 100s for the road, 100s for the building, 85s for the
 * groom, and 150s for O Chará spread across his five bars, weighted so the
 * mecha holds the screen longest and the two on foot are quick.
 *
 * Then CHECKED in a live arena rather than against the dummy, because a boss
 * that walks away from you is not a dummy: A MICROSOFT came out at 91s on the
 * first try and A MANIFESTAÇÃO at 137s, so the road boss was cut again to land
 * near the hundred seconds it was aimed at.
 *
 * A MANIFESTAÇÃO CAME DOWN, and that is not a mistake. At the old curve the
 * player met it with three times the build and melted it; at the corrected one
 * the OLD number was a two-minute fight against the first boss in the game.
 * Everything after it went up between three and four times.
 */
    id: 'manifestacao', name: 'A MANIFESTAÇÃO', behavior: 'boss',
    firstSeenAt: 9000,  unlockKills: 0,
    sheet: 'manifestacao',
    /*
     * HOW TO RE-SIZE THIS, if you ever want to.
     *
     * Health is the wrong dial to reach for first, and that is worth knowing
     * before spending an afternoon on it: swept across a wide range, a kiting
     * bot lost at every value and lost by DYING rather than by running out of
     * time. What decides this fight is how long the player survives inside the
     * barrier, so the arena size, the manifestante cap and the flag rate all
     * move it further than the health bar does.
     *
     * Two things do scale with health, though, and they pull against each
     * other: the three phases are keyed to the fraction remaining, so a bigger
     * bar means longer spent in the calm opening pattern AND longer spent in
     * the frantic one.
     */
    hp: 5400, speed: 26, damage: 88, attackCd: 1.0, radius: 40, xp: 0,
    color: '#c04a4a', size: 60, mass: 9, elite: true,
  },


  /**
   * ABELINHA — whatever they did to the bees, they did it first.
   *
   * The smallest thing in the game and the fastest. It does not chase so much
   * as harass: `swarm` wanders as it closes, so a cloud of them arrives on
   * different lines and cannot be walked away from in a straight line the way
   * a wall of cattle can. Almost no health — the counterplay is that anything
   * you fire at one kills it, and the difficulty is that you were aiming at
   * something else.
   *
   * Comes in groups, because one bee is nothing and eight is a problem.
   */
  abelinha: {
    id: 'abelinha', name: 'Abelinha', behavior: 'swarm',
    firstSeenAt: 6200, unlockKills: 40,
    sheet: 'abelinha',
    bark: 'Olha as ABELINHAS! CHEIO DE TITIA VOANDO.',
    /*
     * WEAK, and meant to be. Six at a time at nearly twice walking pace, and
     * they bite every half second — the threat of a swarm is the swarm, not
     * any one of them. At 24 health and 14 damage a group of six was doing
     * more than a Grande Gordo while being impossible to hold off.
     */
    hp: 15, speed: 96, damage: 8, attackCd: 0.55, radius: 6, xp: 4,
    color: '#e8c84a', size: 16, mass: 0.3, hover: 11,
    groupSize: 6,
  },

  /**
   * BIG EATER — a mouth, and the rest is a rumour.
   *
   * Act two's bruiser. Slower than anything else that walks and it does not
   * need to be quick: it has more health than a Grande Gordo and hits harder
   * than anything that is not a boss, so the question it asks is whether you
   * can keep backing up while a street full of smaller things is trying to
   * stop you doing that.
   *
   * Deliberately NOT elite — no health bar over its head. A thing this size
   * should read as dangerous from its silhouette, and a bar would turn it into
   * a progress meter you stand still to fill.
   */
  big_eater: {
    id: 'big_eater', name: 'Come-Tudo', behavior: 'chase',
    firstSeenAt: 13000, unlockKills: 120,
    sheet: 'big_eater',
    bark: 'NÃO QUERO SER ENGOLIDO',
    hp: 1280, speed: 21, damage: 130, attackCd: 1.0, radius: 22, xp: 44,
    color: '#3f9a3f', size: 52, mass: 5,
  },

  /**
   * O ALIENADO — somebody from Floriano, with the lights on and nobody home.
   *
   * The town's own people, which is the point: act two is not an invasion of
   * monsters, it is an invasion of neighbours. Ordinary numbers on purpose —
   * this is the body the street is MADE of, and it is unsettling because of
   * who it is rather than what it does.
   *
   * The rare sheet is the same man without his clothes. Weighted by repeating
   * the common one in the list, which is what `sheets` allows and is honest
   * about: five in six turn up dressed.
   */
  alienado: {
    id: 'alienado', name: 'Alienado', behavior: 'chase',
    firstSeenAt: 10500, unlockKills: 70,
    sheets: [
      'alienado', 'alienado', 'alienado', 'alienado', 'alienado',
      'alienado_pelado',
    ],
    bark: 'Esse aí eu conheço. Jogava bola com ele.',
    hp: 46, speed: 60, damage: 20, attackCd: 0.9, radius: 9, xp: 8,
    color: '#c98f6a', size: 24, mass: 0.8,
  },

  /** What the riot throws at you. Cheap, endless, and in the way. */
  manifestante: {
    id: 'manifestante', name: 'Manifestante', behavior: 'swarm',
    firstSeenAt: 9000,  unlockKills: 0,
    sheet: 'manifestacao_spawn',
    hp: 25, speed: 72, damage: 24, attackCd: 0.8, radius: 8, xp: 3,
    color: '#d06a6a', size: 20, mass: 0.6,
  },

  /**
   * A MICROSOFT — what was waiting at the end of the street.
   *
   * TWO PHASES, and they are different fights rather than the same fight with
   * bigger numbers.
   *
   * In the FIRST it is enormous and slow: the ground shakes on every step, it
   * throws windows that come back, and every so often it rushes. The rush is
   * the thing — it is a GRAB, and being grabbed is the only moment in the game
   * where dodging stops working and you have to fight the controls instead.
   *
   * In the SECOND it stops grabbing and starts pulsing: rings of area damage
   * out of its own footprint, and employees who do the same on a shorter fuse.
   * Phase one is about the one big thing in front of you; phase two is about
   * the floor.
   */
  microsoft: {
    id: 'microsoft', name: 'A MICROSOFT', behavior: 'boss',
    firstSeenAt: 20000, unlockKills: 0,
    sheet: 'microsoft',
    // Phase two. See the note in sprites.ts for why it rides on `sheetHurt`.
    sheetHurt: 'microsoft_2',
    /*
     * TWO BARS of 4200 rather than one of 7400.
     *
     * Slightly more total, but that is not the point — the point is that the
     * fight now has a middle. Emptying the first bar is an event with a blast
     * and a change of form attached, instead of a number quietly passing 50%.
     */
    hp: 26500, bars: 2, speed: 34, damage: 86, attackCd: 1.0, radius: 44, xp: 0,
    // The window IS the head, and a lit window is the whole joke.
    emits: { r: 120, g: 190, b: 255, radius: 132, strength: 0.95 },
    color: '#2f6fd0', size: 72, mass: 12, elite: true,
  },

  /**
   * FUNCIONÁRIO — what it summons in phase two.
   *
   * Walks at you and detonates, like the Alien do Ovo, but faster and in
   * numbers. They are the reason phase two is about the floor: three of them
   * converging turns a safe corner into three overlapping circles.
   */
  funcionario: {
    id: 'funcionario', name: 'Funcionário', behavior: 'bomber',
    firstSeenAt: 20000, unlockKills: 0,
    sheet: 'funcionario',
    hp: 122, speed: 58, damage: 0, attackCd: 1, radius: 9, xp: 6,
    color: '#5a8fd0', size: 22, mass: 0.7,
    detonates: { radius: 62, damage: 58, triggerRange: 40, fuse: 0.6 },
  },

  /**
   * O NOIVO CINZENTO. The only thing in the roster still without art — kept
   * because it is the ending, not because a blob is acceptable.
   *
   * As with the riot, health is not what makes this fight hard. Swept across
   * a wide range a kiting bot lost at every value, and lost by DYING rather
   * than by running out of time — what it loses to is the square, which is why
   * the guest list was thinned at the same time. Reach for `baseDensity` on
   * the church stage before reaching for this number.
   */
  o_noivo: {
    id: 'o_noivo', name: 'O NOIVO CINZENTO', behavior: 'boss',
    firstSeenAt: 22000, unlockKills: 0,
    hp: 41600, speed: 34, damage: 88, attackCd: 0.9, radius: 30, xp: 0,
    color: '#8c8c4a', size: 64, mass: 8, elite: true,
  },

  /*
   * ============================================================== O CHARÁ ==
   *
   * The last thing in the game, and the only one that is SIX enemies wearing
   * one health bar between them.
   *
   * Each entry below is one body. The fight never spawns a second boss — the
   * script in `act3.ts` swaps `e.def` on the live enemy, so the camera, the
   * boss bar and the arena stay pointed at the same object while what that
   * object IS changes completely underneath them. That is what lets him climb
   * into a machine and still be him.
   *
   * All five that carry a bar declare `bars: 5`, because the HUD reads the
   * count off whichever def is current and the player should see five pips
   * from the first shot to the last. `stages` is what tells `damageEnemy` that
   * a zero here is a cue rather than a death.
   *
   * HEALTH, across the whole fight, is about fourteen thousand — a little over
   * the Noivo's single bar, spread across five. That is deliberate: no single
   * stage should outlast its own idea. A bullet-hell pattern is interesting
   * for about ninety seconds and then it is homework.
   */


  /**
   * O CLT — he is not trying to kill you, he is trying to hire you.
   *
   * The first thing in the square outside the church, and the joke the whole
   * act three midgame is built on: the aliens have stopped invading and
   * started RECRUITING. He walks up holding a contract out and throws it, and
   * the contract hurts, because of course it does.
   *
   * Mechanically an ordinary shooter with a slow, readable round — he is
   * introduced alongside something genuinely confusing (the minions) and two
   * new problems at once is one too many.
   */
  clt: {
    id: 'clt', name: 'Alien de RH', behavior: 'shooter',
    firstSeenAt: 25400, unlockKills: 0,
    sheet: 'clt',
    bark: 'Esse aí tá com uma proposta de emprego. CORRE.',
    hp: 210, speed: 44, damage: 30, attackCd: 2.2, radius: 10, xp: 12,
    emits: { r: 120, g: 200, b: 255, radius: 60, strength: 0.5 },
    color: '#6fc0ff', size: 24, mass: 0.9,
    shot: 'clt',
  },

  /**
   * OS ESTAGIÁRIOS — the Beholder's little ones, and they deal NO DAMAGE.
   *
   * Which is the entire design. Everything else in this game hurts you, so the
   * player's whole trained instinct is to read a thing coming at them as
   * damage and dodge it. These cost nothing to touch and INVERT THE CONTROLS
   * for a few seconds instead — so the punishment for being hit is that the
   * dodging itself stops working, which is a far worse thing to happen in a
   * room full of Grande Gordos than losing thirty health.
   *
   * FAST, BUT REACTABLE. They have to be genuinely avoidable or the inversion
   * is a tax rather than a mistake: quick enough that you have to watch them,
   * slow enough that watching them is enough. They also have very little
   * health, so the answer is always available — shoot the little one.
   */
  beholder_minion: {
    id: 'beholder_minion', name: 'Estagiário', behavior: 'chase',
    firstSeenAt: 25400, unlockKills: 0,
    sheet: 'beholder_minion',
    bark: 'Esses bichinhos não machucam. Mas atrapalham MUITO.',
    hp: 44, speed: 168, damage: 0, attackCd: 3.2, radius: 8, xp: 6,
    emits: { r: 90, g: 130, b: 255, radius: 44, strength: 0.55 },
    color: '#5a7cff', size: 16, mass: 0.4,
    /** Seconds of inverted WASD it leaves behind. See `CONFIG.INVERT`. */
    inverts: true,
  },

  /**
   * O BEHOLDER DA CLT — the mid-boss of act three, and he is a job offer.
   *
   * He does not want the town and he does not want Soul. He wants to fill a
   * position. Everything he says is an offer, and the reason it lands as a
   * threat is that it is one — Soul is terrified of the CLT market, which is
   * the whole reason O Indígena is out here in the first place.
   *
   * ONE GIMMICK, AND IT IS LITERAL. He spins. The sprite itself is rotated by
   * the renderer while he is firing, and what comes off him is a ring of
   * contracts thrown from wherever he happens to be pointing — so the pattern
   * is a rotating spray rather than an aimed one, and the way through it is to
   * read the gap coming round rather than to stand behind him.
   *
   * No bars. He is a midpoint, not an ending: one health pool, one idea, and
   * then the room is quiet for a few seconds and O Chará walks into it.
   */
  beholder: {
    id: 'beholder', name: 'O BEHOLDER DA CLT', behavior: 'boss',
    firstSeenAt: 27000, unlockKills: 0,
    sheet: 'beholder',
    elite: true,
    hp: 9200, speed: 40, damage: 44, attackCd: 1.0, radius: 26, xp: 0,
    // Act three owns the room and the ending. See `EnemyDef.scripted`.
    scripted: true,
    emits: { r: 120, g: 190, b: 255, radius: 120, strength: 0.8 },
    color: '#4f7ad0', size: 44, mass: 4,
  },

  /** STAGE ONE. Same height as the player, and all he does is shoot. */
  chara: {
    id: 'chara', name: 'O CHARÁ', behavior: 'boss',
    firstSeenAt: 22000, unlockKills: 0,
    sheet: 'chara',
    /*
     * The firing pose, on the same hook the rocket's burn uses: `sheetActive`
     * is shown whenever `awake` is set, and act three sets it for a fraction
     * of a second after each volley. A boss who shoots without changing pose
     * reads as bullets appearing near him rather than as bullets coming from
     * him, and at twenty-one pixels wide the pose is all there is.
     */
    sheetActive: 'chara_shoot',
    hp: 6800, bars: 5, stages: true, scripted: true,
    speed: 104, damage: 70, attackCd: 0.9, radius: 11, xp: 0,
    color: '#6ad46a', size: 30, mass: 4, elite: true,
    barBreak: { radius: 120, damage: 40, shake: 0.7 },
    bark: 'Esse aí é o chará. Tá com a cara do Soul.',
  },

  /**
   * STAGE TWO. He is inside the machine now.
   *
   * Slow, enormous, and it does not have to reach you — the missiles do. The
   * grab is the reason to ever be near it, and the reason never to be: the
   * mash is D then A, the mirror of the Microsoft's, so muscle memory earned
   * in act two is exactly wrong here.
   */
  chara_mecha: {
    id: 'chara_mecha', name: 'O CHARÁ — MECHA', behavior: 'boss',
    firstSeenAt: 22000, unlockKills: 0,
    sheet: 'chara_mecha',
    // Half health, and the machine is visibly coming apart. `broken` is set
    // by the script rather than by the first hit, so the swap lands on the
    // fifty percent mark and reads as damage rather than as a scratch.
    sheetHurt: 'chara_mecha_broken',
    hp: 27300, bars: 5, stages: true, scripted: true,
    speed: 46, damage: 74, attackCd: 1.0, radius: 30, xp: 0,
    color: '#4a8f5a', size: 60, mass: 14, elite: true,
    barBreak: { radius: 240, damage: 56, shake: 1.3 },
  },

  /** STAGE THREE. Out of the wreck, on foot, and much less patient. */
  chara_angry: {
    id: 'chara_angry', name: 'O CHARÁ', behavior: 'boss',
    firstSeenAt: 22000, unlockKills: 0,
    sheet: 'chara_final',
    sheetActive: 'chara_shoot',
    hp: 7900, bars: 5, stages: true, scripted: true,
    speed: 138, damage: 44, attackCd: 0.8, radius: 11, xp: 0,
    color: '#8ae86a', size: 30, mass: 4, elite: true,
    barBreak: { radius: 150, damage: 34, shake: 0.9 },
  },

  /**
   * STAGE FOUR AND FIVE. The mothership.
   *
   * It hovers, so it has no business touching anyone, and its contact damage
   * exists only for the player who walks into the hull. What it does instead
   * is drop ordnance while the pillars are up and rake the floor with green
   * once they are down.
   */
  chara_nave: {
    id: 'chara_nave', name: 'A NAVÉ MÃE', behavior: 'boss',
    firstSeenAt: 22000, unlockKills: 0,
    sheet: 'chara_nave',
    sheetHurt: 'chara_nave_broken',
    hp: 15000, bars: 5, stages: true, scripted: true,
    emits: { r: 120, g: 255, b: 190, radius: 168, strength: 1 },
    speed: 30, damage: 60, attackCd: 1.1, radius: 52, xp: 0,
    color: '#63e0b0', size: 96, mass: 20, elite: true,
    hover: 34,
    barBreak: { radius: 300, damage: 68, shake: 1.6 },
  },

  /**
   * STAGE SIX. No bullets left. Just him and a sword, at running speed.
   *
   * The only boss state in the game with no ranged attack at all, which is
   * why it closes the game: after twenty minutes of reading patterns the last
   * thing asked of the player is the first thing they ever learned, which is
   * to move.
   */
  chara_sword: {
    id: 'chara_sword', name: 'O CHARÁ — A ESPADA', behavior: 'boss',
    firstSeenAt: 22000, unlockKills: 0,
    sheet: 'chara_sword',
    hp: 6800, bars: 5, stages: true, scripted: true,
    speed: 96, damage: 54, attackCd: 0.7, radius: 13, xp: 0,
    color: '#d8ff7a', size: 30, mass: 5, elite: true,
    barBreak: { radius: 120, damage: 0, shake: 1 },
  },

  /**
   * ALIEN TECH — the three pillars holding the mothership's shield up.
   *
   * Scenery you can shoot, and the only enemy in the game that does nothing
   * whatsoever. It is a DPS check wearing a different hat: the nave is
   * invulnerable and raining bombs, the waves are back, and the answer is not
   * to fight any of that but to leave the safe ground and go and break these.
   *
   * Health is high enough that it costs real time and low enough that a build
   * which has kept up can take one down in a single approach.
   */
  alien_tech: {
    id: 'alien_tech', name: 'Tecnologia Alien', behavior: 'idle',
    firstSeenAt: 22000, unlockKills: 0,
    sheet: 'alien_tech',
    hp: 4200, speed: 0, damage: 0, attackCd: 1, radius: 17, xp: 40,
    emits: { r: 110, g: 255, b: 200, radius: 108, strength: 0.9 },
    color: '#63e0b0', size: 54, mass: 30, elite: true,
    aura: { radius: 78, dps: 16 },
  },
}
