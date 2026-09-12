/**
 * EVERY EFFECT SHEET, and how to read it.
 *
 * These are NOT sprites in the `SHEETS` sense and they must not go through
 * that loader. A character sheet is sliced by looking for the emptiest columns
 * and every frame is then re-centred on its own content and cropped tight —
 * exactly right for a walk cycle, where what matters is that the feet land in
 * the same place, and fatal for an explosion, where what matters is that all
 * thirteen frames stay registered to the point the thing went off. Normalised,
 * a blast walks around the screen instead of expanding.
 *
 * So effects are read as a plain grid, row-major, with no normalisation, no
 * mirrored copy and no white silhouette. See `Assets.effect`.
 *
 * Sizes are in WORLD UNITS, against a player who stands about twenty-two tall
 * and a view about 520x370 across.
 */
export interface EffectDef {
  src: string
  /** Cell width in the source image. */
  cw: number
  /** Cell height. Square when omitted. */
  ch?: number
  /** Columns in the source grid. A flat strip when omitted. */
  cols?: number
  /** First cell to use, for sheets that open with a blank. */
  first?: number
  frames: number
  fps: number
  /** Loops for as long as whatever owns it lives. Otherwise one shot. */
  loop?: boolean
  /** Drawn width in world units; the height keeps the cell's aspect. */
  size: number
  /**
   * RECOLOURING, applied once at load.
   *
   * `hue` and `sat` are a filter and only move colours that HAVE a hue —
   * rotating white leaves it white, which is how a frost sheet meant to become
   * rain stayed snow through a full 190-degree turn. `tint` is a wash painted
   * through the sheet's own alpha, and it is the one that works on art drawn
   * mostly in white.
   */
  hue?: number
  sat?: number
  tint?: string
  /**
   * How solid it draws, 0..1. Defaults to fully.
   *
   * Separate from `tint` because they do different jobs: a tint replaces the
   * colour and leaves the sheet just as opaque, which on a two-hundred-unit
   * cloud of white smoke is a whiteout with the fight behind it. This is the
   * one that lets you see through the thing.
   */
  alpha?: number
  /**
   * Drawn with the ground layer, under everything that walks, rather than over
   * the top. Blood, splashes and floor rings belong under; anything that
   * happens in the air belongs over.
   */
  ground?: boolean
  /**
   * A SINGLE STILL, animated by the engine instead of by the sheet.
   *
   * Most of this folder is thirty frames of somebody else's animation. Some of
   * it is one drawing — and one drawing that appears and vanishes on a timer
   * reads as a stamp, not as a hit. `pop` says: snap it in slightly small and
   * bright, let it grow a little, and fade it out over its own life. Two lines
   * in `drawFx`, and it is the difference between a sticker and a swipe.
   *
   * `frames` is 1 for these, so `fps` stops being a playback rate and becomes
   * the only thing that sets how long it is on screen: life = 1 / fps.
   */
  pop?: boolean
}

const GEN = '/fx/_gen/'
const FX = '/fx/'

const TABLE = {
  // ------------------------------------------------------------- BULLETS --
  /*
   * One animated round in seven colours. The mapping from ammo to colour is a
   * balance decision and lives in `bullets.ts`; these are named for what they
   * look like so a new ammo can pick one without renaming anything.
   */
  bullet_gold: { src: GEN + 'bullet_gold.png', cw: 16, frames: 30, fps: 24, loop: true, size: 15 },
  bullet_red: { src: GEN + 'bullet_red.png', cw: 16, frames: 30, fps: 24, loop: true, size: 15 },
  bullet_orange: { src: GEN + 'bullet_orange.png', cw: 16, frames: 30, fps: 24, loop: true, size: 15 },
  bullet_cream: { src: GEN + 'bullet_cream.png', cw: 16, frames: 30, fps: 24, loop: true, size: 15 },
  bullet_magenta: { src: GEN + 'bullet_magenta.png', cw: 16, frames: 30, fps: 24, loop: true, size: 15 },
  bullet_cyan: { src: GEN + 'bullet_cyan.png', cw: 16, frames: 30, fps: 24, loop: true, size: 15 },
  bullet_green: { src: GEN + 'bullet_green.png', cw: 16, frames: 30, fps: 24, loop: true, size: 15 },

  // ------------------------------------------------------------- IMPACTS --
  /*
   * FIVE BLOOD SPRAYS, chosen at random per death. One would be recognisable
   * within a minute at four hundred kills a minute; five is enough that a
   * crowd dying reads as a crowd rather than as one animation repeating.
   */
  blood_1: { src: GEN + 'blood_1.png', cw: 100, frames: 22, fps: 30, size: 46, ground: true },
  blood_2: { src: GEN + 'blood_2.png', cw: 100, frames: 30, fps: 32, size: 46, ground: true },
  blood_3: { src: GEN + 'blood_3.png', cw: 100, frames: 30, fps: 32, size: 46, ground: true },
  blood_4: { src: GEN + 'blood_4.png', cw: 100, frames: 30, fps: 32, size: 40, ground: true },
  blood_5: { src: GEN + 'blood_5.png', cw: 100, frames: 30, fps: 32, size: 52, ground: true },

  /** Where a round that hit nothing came down. */
  splash: { src: GEN + 'splash_warm.png', cw: 48, ch: 32, frames: 4, fps: 20, size: 20, ground: true },
  splash_pale: { src: GEN + 'splash_pale.png', cw: 48, ch: 32, frames: 4, fps: 20, size: 20, ground: true },

  /** The mecha's hand closing. Short, and it only ever plays once a fight. */
  grab: { src: GEN + 'slash_cyan.png', cw: 35, ch: 32, frames: 5, fps: 16, size: 78 },

  /**
   * HIT SPARKS. Drawn straight off the enemy's own flash timer rather than
   * pooled — a busy second is several hundred hits, and a pool that size would
   * spend more time being swept than the sparks are on screen.
   */
  spark: { src: FX + '5_magickahit_spritesheet.png', cw: 100, cols: 7, frames: 40, fps: 44, size: 26 },

  // ---------------------------------------------------------- EXPLOSIONS --
  /*
   * FOUR SIZES, where there used to be one expanding circle doing every job
   * from a dash kick to a boss coming apart. `spawnBlast` picks by radius.
   */
  ring: {
    src: FX + '10_weaponhit_spritesheet.png',
    cw: 100, cols: 6, frames: 30, fps: 38, size: 44, ground: true,
  },
  boom: {
    src: FX + 'fire/Explosion SpriteSheet.png',
    // The sheet opens with a blank cell, which would otherwise show as a
    // dropped frame at the front of every detonation.
    cw: 64, cols: 4, first: 1, frames: 13, fps: 26, size: 130,
  },
  /** A burst that rises off the ground — right for something that landed. */
  groundboom: {
    src: FX + 'fire/Explosion 2 SpriteSheet.png',
    cw: 48, frames: 17, fps: 28, size: 120,
  },
  /** A bar emptying. The largest thing the game ever draws. */
  nebula: {
    src: FX + '12_nebula_spritesheet.png',
    cw: 100, cols: 8, frames: 61, fps: 34, size: 330,
  },

  // -------------------------------------------------------------- AURAS --
  /** Escudo Alien, orbiting him while it holds. */
  shield: {
    src: FX + '8_protectioncircle_spritesheet.png',
    cw: 100, cols: 8, frames: 61, fps: 26, loop: true, size: 54,
  },
  /** The Navé Mãe's shield: the one thing act three asks you to go switch off. */
  dome: {
    src: FX + '15_loading_spritesheet.png',
    cw: 100, cols: 11, frames: 121, fps: 28, loop: true, size: 190,
  },
  /** Alien tech, and the glow a Glowie stands in. Sized per use. */
  alienaura: {
    src: FX + '17_felspell_spritesheet.png',
    cw: 100, cols: 10, frames: 91, fps: 24, loop: true, size: 150, ground: true,
  },
  /**
   * DANÇA DA CHUVA. Pushed toward blue and desaturated a little, because the
   * sheet is drawn as frost and this is a downpour — the particle motion is
   * the part that matters and it survives a recolour intact.
   */
  // ------------------------------------------------------------- THE END --
  /*
   * THE LAST TWO SHEETS IN THE GAME, and the only ones drawn in screen space.
   *
   * Six hundred pixels a frame, which is roughly the whole viewport — they are
   * a close-up on a black screen, not something standing in the world. They
   * are here rather than in SHEETS because the character loader would re-centre
   * every frame on its own content, and the entire point of the second one is
   * that his head SLUMPS: normalised, it would slump in place and look like a
   * jitter.
   */
  chara_wounded: {
    src: '/sprites/BOSS_act3_the_alien_chará/cutscene_click_final_shot_his_head.png',
    cw: 600, ch: 400, frames: 3, fps: 3.5, loop: true, size: 600,
  },
  chara_finish: {
    src: '/sprites/BOSS_act3_the_alien_chará/shoot_in_the_head_chará.png',
    cw: 600, ch: 400, frames: 3, fps: 6, size: 600,
  },

  // ------------------------------------------------------ TUPÃ AND FRIENDS --
  /**
   * THE BOLT. Raio de Tupã has been a hand-drawn line since the day it was
   * written; this is a real fork of lightning with branches.
   *
   * Tinted gold from violet. The art is violet because the pack is, and violet
   * is a colour this game does not use anywhere — gold is what the sky already
   * looks like when it is on your side here.
   */
  bolt: {
    src: GEN + 'bolt.png', cw: 128, frames: 7, fps: 20, size: 150,
    tint: 'rgba(255,226,130,0.72)',
  },
  /** Where it lands, and the small sparks off the Poder de Tupã window. */
  zap: {
    src: GEN + 'zap.png', cw: 32, frames: 9, fps: 24, size: 54,
    tint: 'rgba(255,222,120,0.6)',
  },
  /** Cantarolar, in flight. Notes, tumbling. */
  /*
   * The sheet, kept for anything that wants a burst of them. The notes
   * CANTAROLAR throws are a single drawn sprite instead — they live long
   * enough to be looked at, and a looping sheet on a four-second flight reads
   * as a flicker rather than a note.
   */
  notes: { src: GEN + 'notes.png', cw: 64, frames: 21, fps: 20, loop: true, size: 30 },
  /**
   * PODER DE TUPÃ, which is a clock — and it should be, because the whole
   * ability is a window that opens and closes on a schedule.
   */
  haste: {
    src: GEN + 'haste.png', cw: 128, frames: 29, fps: 12, loop: true, size: 74,
  },
  /** The Cálice going down. */
  heartburst: { src: GEN + 'heartburst.png', cw: 128, frames: 16, fps: 22, size: 76 },
  /** An anvil arriving. */
  clang: { src: GEN + 'clang.png', cw: 96, frames: 7, fps: 20, size: 84 },
  /** Ventos de Tupã, leaving. */
  gust: {
    src: GEN + 'gust.png', cw: 64, frames: 21, fps: 26, size: 120,
    tint: 'rgba(206,232,255,0.5)', alpha: 0.42,
  },

  // ---------------------------------------------------- BOSSES AND FLIGHT --
  /** A tornado, in the one colour of the nine that belongs in a caatinga. */
  /*
   * THE CHURN AT THE FOOT OF A TORNADO.
   *
   * This used to point at a strip cut from `Part 10/464` — which, on being
   * looked at properly, is a FLAME. Every one of that sheet's nine rows is the
   * same rising fire in a different colour, so no row of it was ever going to
   * be a tornado, and what was on screen was a burning column with a dust
   * palette. This one actually spins: a top-down whirl of debris around a
   * bright core, which is the right shape for a thing seen from above.
   *
   * Tinted sand rather than recoloured by hue: the sheet is red and a hue
   * rotation on red-through-white leaves the white white — the same reason
   * Dança da Chuva could not be turned blue by rotation.
   */
  tornado: {
    src: FX + '13_vortex_spritesheet.png',
    cw: 100, cols: 8, frames: 64, fps: 30, loop: true, size: 52,
    // Opaque enough to bury the sheet's white core, which under any brightness
    // at all reads as a light source sitting in the dirt.
    tint: 'rgba(188,158,108,0.95)',
    alpha: 0.9,
  },
  /** O Chará's sword, aligned to the dash. */
  slash: {
    src: FX + '6_flamelash_spritesheet.png',
    cw: 100, cols: 7, frames: 45, fps: 34, size: 96,
  },
  /** A rocket under power. Small, bright, and impossible to mistake for a dud. */
  burn: {
    src: FX + '9_brightfire_spritesheet.png',
    cw: 100, cols: 8, frames: 61, fps: 24, loop: true, size: 26,
  },
  /**
   * QUEIMA ROSCA, the ring he stands in the middle of.
   *
   * `firespin` rather than the flame sheet: it is authored as a circle of fire
   * seen from above, which is exactly the shape of an aura, where `fire` is a
   * plume seen from the side and would read as a bonfire standing next to him.
   */
  firering: {
    /*
     * SUNBURN, NOT FIRESPIN.
     *
     * `firespin` is a thin open crescent that never closes — a wisp chasing
     * its own tail. Blown up to a hundred and thirty units it read as a smear
     * with a gap in it, which is the opposite of the one thing this effect has
     * to communicate: that there is a complete circle around him and being
     * inside it costs you.
     *
     * `sunburn` is a CLOSED ring of flame with a white-hot middle, drawn from
     * above. It is the shape of the ability.
     */
    src: FX + '16_sunburn_spritesheet.png',
    cw: 100, cols: 8, frames: 61, fps: 30, loop: true, size: 120, ground: true,
  },
  /**
   * A BODY ON FIRE. Small, on the enemy, and it loops for as long as it burns.
   *
   * Tinted down from the sheet's orange so a field of thirty burning cows is
   * legible as thirty burning cows rather than as one orange smear.
   */
  alight: {
    /*
     * THE SAME SHEET THE ROCKET BURNS WITH, at a body's size.
     *
     * It was the blue-fire sheet under a two-hundred-degree hue rotation and
     * an orange tint, which is three operations to arrive at a colour one
     * sheet in the folder already is — and arrived somewhere between the
     * two, so a burning cow read as neither. This one is orange on disk.
     */
    src: FX + '9_brightfire_spritesheet.png',
    cw: 100, cols: 8, frames: 61, fps: 26, loop: true, size: 22,
  },
  /**
   * A GARRA, on whatever walked into it.
   *
   * It was `10_weaponhit` washed pale gold — a generic impact starburst,
   * the same sheet the explosion ring uses, and it read as "something went
   * off here" rather than as claws. This is the drawn one: three red slashes
   * in a crescent, one still image, bulging in the direction of the swipe.
   *
   * NO TINT. The art is already the colour it should be, and the wash that
   * made the old sheet legible would only flatten this one.
   *
   * `fps: 5` is not a playback rate here — there is one frame. It is the
   * lifetime: a fifth of a second, which is about as long as a swipe should
   * hang around when the radius can fire every half second per body.
   */
  claw: {
    src: FX + 'claw attack.png',
    cw: 64, cols: 1, frames: 1, fps: 5, size: 40, pop: true,
  },
  /** EXECUTAR. The one hit that is not damage. */
  finish: {
    src: FX + '5_magickahit_spritesheet.png',
    cw: 100, cols: 7, frames: 40, fps: 46, size: 74,
    tint: 'rgba(255,120,120,0.95)',
  },
  /**
   * A PRIVADA, DOING WHAT A PRIVADA DOES.
   *
   * It was pale blue, which is what a fountain does. This is not a fountain.
   * The sheet is a mass of rising bubbles, which is the right MOTION either
   * way; the tint is what decides what is in them, and there is only one
   * honest answer for a toilet in the middle of the road.
   */
  splashwater: {
    src: FX + '20_magicbubbles_spritesheet.png',
    cw: 100, cols: 8, frames: 61, fps: 26, loop: true, size: 96, ground: true,
    tint: 'rgba(126,86,42,0.92)',
  },
  /** And the flush, when it has had enough. */
  flush: {
    src: FX + '20_magicbubbles_spritesheet.png',
    cw: 100, cols: 8, frames: 61, fps: 44, size: 110, ground: true,
    tint: 'rgba(150,104,54,0.95)',
  },
  /** AMANTES. Whoever just changed sides. */
  smitten: {
    src: FX + '17_felspell_spritesheet.png',
    cw: 100, cols: 8, frames: 61, fps: 30, size: 58,
    tint: 'rgba(255,140,200,0.9)',
  },

  /** The mecha past half health. A burning machine reads at a glance. */
  fire: {
    src: FX + '11_fire_spritesheet.png',
    cw: 100, cols: 8, frames: 61, fps: 22, loop: true, size: 46,
  },
} satisfies Record<string, EffectDef>

export type EffectKey = keyof typeof TABLE

/*
 * Widened on the way out.
 *
 * `satisfies` keeps the literal type of every entry, which is what gives the
 * key union above — but it also means an entry that happens not to set
 * `ground` has no such property at all, and a lookup through the union cannot
 * read it. Re-exporting as a full record hands callers the whole shape with
 * the optional fields present and undefined, which is what they expect.
 */
export const EFFECTS: Record<EffectKey, EffectDef> = TABLE

/** The five sprays, for picking one per death. */
export const BLOOD: EffectKey[] = ['blood_1', 'blood_2', 'blood_3', 'blood_4', 'blood_5']
