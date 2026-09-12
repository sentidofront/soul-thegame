import type { ArenaDef, RandomEvent, StageDef, WaveDef } from '../types'

/**
 * THREE ACTS, ONE CONTINUOUS WORLD.
 *
 * There is no level loading. The player walks east (+X) and the stage is
 * simply a function of how far they have got: crossing `endX` swaps the spawn
 * table and the terrain generator's biome, and the ground textures cross-fade
 * over a band of tiles. That is what makes the transition seamless — nothing
 * is torn down and rebuilt, the world just becomes a different place.
 *
 * Two acts end in a boss. Both close a barrier and sweep the field first, so a
 * boss fight is never muddled up with the trickle that was chasing you into it.
 */

/** The riot at the edge of town, fought in the open where the road used to be. */
export const ARENA_MANIFESTACAO: ArenaDef = {
  atDist: 10050,
  /*
   * Roomier than the church square, because this is the fight that is about
   * moving — but still close enough to one screen that the crowd throwing the
   * flags stays in view while you dodge them.
   */
  /*
   * Big. The first pass at 340x200 was barely a screen and a half, and a
   * bullet hell fought inside one screen is not a bullet hell — there is
   * nowhere to go, so the patterns stop being something you read and start
   * being something that happens to you.
   */
  halfW: 560,
  halfH: 330,
  camOffsetY: 0,
  // Nothing else gets in. The riot is the fight.
  sealed: true,
}

/**
 * THE FORECOURT, just short of the church.
 *
 * Wide, because the fight is about reading boomerangs coming back at you from
 * behind — and a boomerang arena has to have enough room that "behind" is a
 * real place. Not sealed: the town keeps arriving, which is the point of
 * fighting this one in the street rather than in a ring of its own.
 */
export const ARENA_MICROSOFT: ArenaDef = {
  atDist: 24600,
  halfW: 480,
  halfH: 300,
  camOffsetY: 0,
  sealed: true,
}

/**
 * The church square, at the very end of the way.
 *
 * `clearTop` is not part of the fight — it is a keep-out for the world
 * generator. The facade is drawn UPWARD from the north edge of the square and
 * stands about two hundred and thirty units tall, none of which the arena
 * rectangle covers, so houses were being scattered straight through the
 * church. Scenery is excluded from the rectangle plus this much above it.
 */
export const ARENA_IGREJA: ArenaDef = {
  /*
   * FOUR THOUSAND UNITS PAST THE EDGE OF TOWN, and it used to be seven hundred.
   *
   * Act three opened, said ATO III, and put the player through the door about
   * twenty seconds later — which is not an act, it is a corridor with a
   * title card on it. The square is a proper section now: long enough to have
   * waves of its own, to introduce two species nobody has met, and to lose a
   * fight in before the door is even reached.
   */
  atDist: 29400,
  halfW: 220,
  halfH: 105,
  camOffsetY: -30,
  clearTop: 300,
}

/**
 * THE DOOR.
 *
 * One number, and it is the seam between the two halves of act three. Before
 * it the player is in the square outside; on it the world becomes an interior
 * — the ground swaps to flagstones, the town stops being generated, and the
 * fight that has been coming since the first cow starts.
 *
 * The terrain generator reads it, the prop generator reads it, and the
 * director reads it. Move it and all three move together, which is the only
 * reason it is a constant and not three matching literals.
 */
export const CHURCH_DOOR = ARENA_IGREJA.atDist

/**
 * INSIDE. Where the last act is actually fought.
 *
 * Enormous by this game's standards — twelve hundred by eight hundred, twice
 * the riot's floor. It has to be. Five different fights happen in this one
 * room, and the largest of them is a mothership a hundred and twenty units
 * across dropping ordnance while three pillars in the corners need breaking.
 * A bullet hell in a small room is a coin flip.
 *
 * CENTRED ON THE CHURCH, and that is the whole of the geometry.
 *
 * The first version put the door on the room's near edge and pushed the
 * rectangle forward along the route to get there, which sounded right and was
 * wrong in the only way that matters: the building ended up five hundred units
 * outside its own arena. You fought in a room with the church visible over the
 * barrier, in the corner, like scenery from another level.
 *
 * Reaching the church IS going inside it, so the room simply sits where the
 * building sits and the facade stops being drawn. Nothing has to be nudged
 * along a heading, and nothing depends on which way the route happens to be
 * pointing when it arrives.
 */
export const ARENA_INTERIOR: ArenaDef = {
  atDist: CHURCH_DOOR,
  halfW: 560,
  halfH: 400,
  camOffsetY: 0,
  // Not sealed. Act III is the one fight where the waves come BACK partway
  // through, and the director has to be allowed to run when they do.
  sealed: false,
}

/** Every arena, for the world generator to keep scenery out of. */
export const ARENAS: ArenaDef[] = [
  ARENA_MANIFESTACAO, ARENA_MICROSOFT, ARENA_IGREJA, ARENA_INTERIOR,
]

export const STAGES: StageDef[] = [
  {
    id: 'road',
    name: 'ATO I — A ESTRADA',
    subtitle: 'A BR rumo a Floriano. O céu está errado.',
    startX: 0,
    endX: 10500,
    arena: ARENA_MANIFESTACAO,
    boss: 'manifestacao',
  },
  {
    id: 'streets',
    name: 'ATO II — AS RUAS DE FLORIANO',
    subtitle: 'Eles levaram o Soul para a praça. Corre.',
    startX: 10500,
    /*
     * LONGER THAN IT WAS by about a third. Act two had the densest wave table
     * in the game and the least road to run it on: species were introduced
     * three rows apart and the Microsoft's gate arrived before half of them
     * had been seen twice.
     */
    endX: 25400,
    arena: ARENA_MICROSOFT,
    boss: 'microsoft',
  },
  {
    id: 'church',
    name: 'ATO III — A IGREJA',
    subtitle: 'A porta tá aberta. O que tá dentro não é gente.',
    /*
     * NO `arena` AND NO `boss`, and that is not an omission.
     *
     * The other two acts hand the whole ending to `bossGate`: cross a line,
     * sweep the field, drop a boss in. Act three cannot be expressed that way
     * — crossing the line starts a timed clear, THEN a silence, THEN a boss
     * who changes body five times and turns the waves back on halfway
     * through. That is a script, so it lives in `act3.ts` and this row stays
     * out of the generic gate's way.
     */
    startX: 25400,
    endX: CHURCH_DOOR + 1240,
  },
]

/**
 * THE SCHEDULE.
 *
 * Every row takes over at a world X and holds until the next one. This is the
 * whole of the game's pacing, in one readable list — which is the point.
 *
 * It replaced a density scalar plus a per-species kill quota. That pairing had
 * a fault it never recovered from: the quotas were keyed to KILLS, so any
 * change to enemy health silently changed how many bodies a run got through
 * and pushed every gate out of reach. It was re-derived twice and broke twice.
 * A species now appears because a row ASKS for it, and no amount of retuning
 * health can move that.
 *
 * READING A ROW. `quota` is the floor the director fills toward; `interval` is
 * how often it adds one of each species in `cast` once that floor is met. It
 * keeps adding past the quota — the real ceiling is CONFIG.MAX_ENEMIES — which
 * is why the cap matters more than it looks.
 *
 * `cast` is the row's character. Three or four species, not the whole
 * bestiary: "here come the saleiros" only reads if a stretch is about saleiros.
 */
export const WAVES: WaveDef[] = [
  // ======================================================= ATO I — A ESTRADA
  // Opens almost empty. "The first enemy is a mutated cow" only lands if there
  // is actually one of them, alone, for long enough to look at it.
  {
    fromX: 0, quota: 10, interval: 1.9,
    cast: { vaca: 1 },
  },
  {
    fromX: 900, quota: 26, interval: 1.4,
    cast: { vaca: 3, vaca_saquinho: 1 },
  },
  {
    fromX: 2200, quota: 40, interval: 1.2,
    cast: { vaca: 2, vaca_saquinho: 2 },
  },
  {
    // THE STAMPEDE. The first thing in the game that is a moment rather than
    // pressure: a wall of cattle coming down the road at him.
    fromX: 3400, quota: 52, interval: 1.1,
    cast: { vaca: 2, vaca_saquinho: 2, coisa: 1 },
    event: {
      formation: 'wall', count: 30, cast: { vaca: 1 },
      bark: 'ELAS TÃO VINDO TUDO DE UMA VEZ!', shake: 0.6,
    },
  },
  {
    fromX: 4600, quota: 76, interval: 1.0,
    /*
     * THE FIRST MINHOCAS, one at a time.
     *
     * She is an obstacle rather than pressure: her whole job is to make one
     * line across the caatinga worse than another, and a crowd of mounds would
     * be a wall instead of something to walk around. She stays at one for the
     * rest of the act for that reason.
     */
    cast: { vaca: 2, vaca_saquinho: 2, coisa: 2, minhoca: 1 },
    bark: 'O chão tá se mexendo. O CHÃO.',
  },
  {
    // The aliens start drifting in around the middle of the road, a couple at
    // a time, long before the town is crawling with them.
    fromX: 5800, quota: 92, interval: 0.9,
    cast: { vaca_saquinho: 2, coisa: 2, alien_basico: 1, minhoca: 1 },
    bark: 'Opa. Esse aí não é daqui não.',
  },
  {
    // The bees arrive here, in the stretch that was three species of walking.
    fromX: 7000, quota: 104, interval: 0.85,
    cast: { vaca_saquinho: 2, coisa: 3, alien_basico: 2, abelinha: 2 },
    bark: 'Mexeram com as abelha. MEXERAM COM AS ABELHA.',
    event: {
      formation: 'swarm', count: 40, bark: 'Cercaram! Cercaram!', shake: 0.5,
      mixin: { id: 'grande_gordo', count: 1 },
    },
  },
  {
    fromX: 8400, quota: 118, interval: 0.8,
    cast: { vaca: 1, coisa: 3, alien_basico: 3, abelinha: 3, minhoca: 1 },
  },
  {
    // The approach. Thick with aliens, and the riot is audible from here.
    fromX: 9400, quota: 132, interval: 0.75,
    cast: { coisa: 2, alien_basico: 4 },
    event: { formation: 'pincer', count: 26, shake: 0.4, mixin: { id: 'coisa', count: 6 } },
  },

  // ====================================================== ATO II — AS RUAS
  // THICKER than the road, and it keeps thickening. Act one teaches you the
  // species; act two is where there are simply too many of them, which is the
  // shape this genre runs on. The quotas below roughly doubled — the engine
  // measured 4.8ms a frame at six hundred bodies, so the ceiling here is what
  // reads well rather than what runs.
  {
    // Floriano opens with Florianenses. That is the whole idea of act two.
    fromX: 10500, quota: 78, interval: 1.15,
    cast: { alien_basico: 3, tripa_seca: 1, alienado: 3 },
  },
  {
    fromX: 11400, quota: 92, interval: 1.1,
    cast: { alien_basico: 4, tripa_seca: 1, saleiro: 2, alienado: 3 },
    bark: 'Tá salgando o chão, é? Que ódio.',
  },
  {
    fromX: 12400, quota: 106, interval: 1.05,
    cast: { alien_basico: 3, saleiro: 2, explosivo: 2, alienado: 2 },
    event: { formation: 'pincer', count: 20, cast: { explosivo: 1 }, shake: 0.5 },
  },
  {
    // THE COME-TUDO. One of them, alone in the row, so the first one is
    // looked at rather than lost in a crowd.
    fromX: 13600, quota: 120, interval: 1.0,
    cast: { alien_basico: 3, alienado: 2, explosivo: 2, grande_gordo: 1 },
    event: {
      formation: 'cone', count: 1, cast: { big_eater: 1 },
      bark: 'Isso é só uma boca. CADÊ O RESTO?', shake: 0.6,
    },
  },
  {
    // THE CORDON. Glowies come in threes anyway; a line of them across the
    // street is a wall you can see through and still have to solve.
    fromX: 15000, quota: 134, interval: 0.95,
    cast: { alien_basico: 3, glowie: 3, rocket: 1 },
    event: {
      formation: 'wall', count: 22, cast: { glowie: 1 },
      bark: 'Fecharam a rua com esses brilhosos.', shake: 0.4,
    },
  },
  {
    fromX: 16400, quota: 150, interval: 0.9,
    cast: { alien_basico: 2, glowie: 2, rocket: 2, grande_gordo: 1, carro: 1 },
    event: {
      formation: 'pincer', count: 2, cast: { big_eater: 1 },
      mixin: { id: 'alienado', count: 8 }, shake: 0.5,
    },
  },
  {
    // THE HIGHWAY RUN. The car does not care about anyone, so sending it down
    // the street with bodies behind it is the joke landing on purpose rather
    // than by chance.
    fromX: 17800, quota: 166, interval: 0.88,
    cast: { alien_basico: 4, tripa_seca: 1, saleiro: 2, explosivo: 2 },
    event: {
      formation: 'cone', count: 3, cast: { carro: 1 },
      repeat: 3, every: 6,
      bark: 'SAI DA RUA! SAI DA RUA!', shake: 0.7,
    },
  },
  {
    fromX: 19200, quota: 184, interval: 0.85,
    cast: {
      alien_basico: 3, glowie: 2, grande_gordo: 2, rocket: 2, carro: 1,
      alienado: 3, big_eater: 1,
    },
  },
  {
    fromX: 20600, quota: 205, interval: 0.8,
    cast: {
      alien_basico: 4, glowie: 2, explosivo: 2, grande_gordo: 2, carro: 1,
      big_eater: 1, abelinha: 4,
    },
    event: {
      formation: 'swarm', count: 60, bark: 'Tão me cercando de novo!', shake: 0.6,
      mixin: { id: 'grande_gordo', count: 3 },
    },
  },

  // ===================================================== ATO III — A IGREJA
  // A small square, and the fight is meant to be about O Noivo rather than
  // about the guest list.
  /*
   * ===================================================== ATO III — A IGREJA
   *
   * Four rows across fourteen hundred units, which is dense scheduling for a
   * short act — and deliberate. Act III is not a journey, it is an approach:
   * the player has already walked twenty-two thousand units and the last
   * stretch should feel like the crowd closing rather than like more road.
   *
   * The shape is a funnel. It opens thin and quiet on purpose, so that
   * arriving at the square is a change of tone rather than a continuation,
   * then tightens every few hundred units until the barrier closes.
   */
  {
    // THE STEPS. Quiet, so the act lands as a change of tone.
    fromX: 25400, quota: 34, interval: 1.5,
    cast: { alien_basico: 4, tripa_seca: 1 },
    bark: 'A igreja. Aguenta aí, Soul.',
  },
  {
    // The guests notice him.
    fromX: 26300, quota: 52, interval: 1.2,
    cast: { alien_basico: 4, tripa_seca: 1, glowie: 2 },
    event: {
      formation: 'ring', count: 22,
      bark: 'Eles tão saindo de dentro da igreja!', shake: 0.5,
    },
  },
  {
    fromX: 27300, quota: 66, interval: 1.05,
    cast: {
      alien_basico: 3, glowie: 2, explosivo: 2, grande_gordo: 1,
      alienado: 2, big_eater: 1,
    },
    event: {
      formation: 'pincer', count: 20, cast: { explosivo: 1 },
      mixin: { id: 'grande_gordo', count: 2 }, shake: 0.5,
    },
  },
  {
    // The last of it, right outside the door.
    fromX: 28400, quota: 78, interval: 0.95,
    cast: { alien_basico: 4, glowie: 3, explosivo: 2, rocket: 1 },
    event: {
      formation: 'swarm', count: 34,
      mixin: { id: 'grande_gordo', count: 2 },
      bark: 'Sai da frente! SAI DA FRENTE!', shake: 0.6,
    },
  },
]

/**
 * WHAT THE NAVÉ MÃE CALLS DOWN while its shield is up.
 *
 * Not part of the schedule — `waveAt` never returns it. The act three script
 * hangs it on `g.waveOverride` for exactly as long as the pillars are
 * standing, and pulls it the moment the shield breaks.
 *
 * The cast is the same three species as the entry check, on purpose. By this
 * point in the fight the player has no attention left for a new enemy to
 * read; the pressure has to come from quantity and from being asked to fight
 * it while doing something else.
 */
export const WAVE_NAVE: WaveDef = {
  fromX: 0, quota: 110, interval: 0.9,
  cast: { alien_basico: 4, grande_gordo: 1, rocket: 1 },
}

/**
 * WHAT MIGHT HAPPEN, on nobody's schedule.
 *
 * The wave table above is authored and therefore learnable. This is the part
 * that is not: one of these fires every half minute or so, chosen by weight,
 * and it is the reason a stretch of road you have walked before can still go
 * wrong.
 *
 * THE FARM-AND-TRAP PATTERN is the one worth understanding. `A Boiada` and
 * `Formigueiro` are floods of near-worthless bodies — genuinely good XP, and
 * genuinely safe to stand in — with two or three of something that will take a
 * third of your health mixed into the middle. That is Vampire Survivors' best
 * trick: the swarm reads as free until it is not, and the skill is telling the
 * difference before it reaches you rather than after.
 */
export const RANDOM_EVENTS: RandomEvent[] = [
  {
    // The cattle flood. Free XP, and a Coisa Voadora in the middle of it.
    weight: 10, formation: 'swarm', count: 34,
    cast: { vaca: 3, vaca_saquinho: 2 },
    mixin: { id: 'coisa', count: 4 },
    bark: 'A BOIADA! Corre, corre, corre!', shake: 0.4,
  },
  {
    weight: 8, formation: 'wall', count: 26, fromX: 2600,
    cast: { vaca_saquinho: 1 },
    bark: 'Tão vindo em fila!', shake: 0.35,
  },
  {
    // Nothing but bodies, and it keeps coming back three times.
    weight: 7, formation: 'swarm', count: 26, fromX: 4200,
    cast: { coisa: 2, vaca: 1 },
    repeat: 3, every: 4.5,
    bark: 'Num para de vir!', shake: 0.3,
  },
  {
    weight: 9, formation: 'pincer', count: 22, fromX: 5200,
    cast: { alien_basico: 1 },
    mixin: { id: 'grande_gordo', count: 1 },
    bark: 'Pelos dois lados!', shake: 0.4,
  },
  {
    // FORMIGUEIRO — the anthill. The biggest farm in the game, and the one
    // most likely to kill you, because there is a Doido do Carro in it.
    weight: 6, formation: 'swarm', count: 55, fromX: 11000,
    cast: { alien_basico: 4, tripa_seca: 1 },
    mixin: { id: 'carro', count: 1 },
    bark: 'FORMIGUEIRO! De onde saiu tanto?!', shake: 0.6,
  },
  {
    weight: 7, formation: 'ring', count: 30, fromX: 11500,
    cast: { alien_basico: 2, glowie: 1 },
    mixin: { id: 'rocket', count: 3 },
    bark: 'Fecharam tudo!', shake: 0.5,
  },
  {
    // A minefield walking toward you.
    weight: 6, formation: 'wall', count: 16, fromX: 12000,
    cast: { explosivo: 1 },
    bark: 'Fila de ovo. Isso num vai dar certo.', shake: 0.4,
  },
  {
    weight: 5, formation: 'swarm', count: 20, fromX: 13000,
    cast: { saleiro: 1 },
    bark: 'Vão salgar a cidade inteira!', shake: 0.45,
  },
  {
    // O ENXAME. Nothing but bees, from every direction at once.
    weight: 7, formation: 'ring', count: 40, fromX: 7000,
    cast: { abelinha: 1 },
    bark: 'ENXAME! ENXAME! NÃO CORRE EM LINHA RETA!', shake: 0.5,
  },
  {
    // The town turning out, with one mouth in the middle of it.
    weight: 6, formation: 'wall', count: 24, fromX: 12500,
    cast: { alienado: 1 },
    mixin: { id: 'big_eater', count: 1 },
    bark: 'É a rua inteira. Todo mundo que eu conheço.', shake: 0.5,
  },
  {
    weight: 4, formation: 'cone', count: 4, fromX: 14000,
    cast: { carro: 1 }, repeat: 2, every: 5,
    bark: 'MAIS CARRO! QUEM DEU CARTEIRA PRA ESSES?', shake: 0.7,
  },
]

/** The row in force at a world X. Never returns nothing. */
export function waveAt(x: number): WaveDef {
  let found = WAVES[0]
  for (const w of WAVES) {
    if (x >= w.fromX) found = w
    else break
  }
  return found
}

export function stageAt(x: number): number {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (x >= STAGES[i].startX) return i
  }
  return 0
}
