import { CHURCH_DOOR, STAGES } from '../data/stages'

/**
 * THE SUN GOING DOWN OVER THE WHOLE JOURNEY.
 *
 * O Indígena leaves at midday and arrives at the church at night, and the
 * light changes the entire way rather than at act boundaries. That is the
 * point: nobody should be able to say where afternoon became evening, only
 * that the road they have been walking for twenty minutes does not look the
 * way it did when they started.
 *
 * It is keyed to DISTANCE, not to the clock. A player who takes forty minutes
 * and a player who takes twelve should both watch the same sunset, because it
 * belongs to the journey and not to how long they spent on it. `reach` only
 * ever goes up, so the sun never comes back.
 *
 * THE CONSTRAINT THAT SHAPES ALL OF IT: this is decoration, and decoration
 * that makes the game harder to see has failed. `depth` is capped well short
 * of darkness, lamps put light back where the player is walking, and he
 * carries a little of his own so the ground under his feet is never in doubt.
 *
 * AND THE ONE THAT WAS MISSING: the afternoon has to get DARKER.
 *
 * Measured across the run, average frame brightness went 132 at midday, 176 in
 * the afternoon and 192 at sunset before falling off a cliff into the evening
 * — the sun was going down and the screen was getting brighter, because the
 * additive half of this system (`rays`, `sunA`, `dust`) ramps up toward sunset
 * while the multiply half (`depth`) had barely started. Every keyframe below
 * is now balanced so those two move together: sunset stays the most COLOURED
 * moment of the run without being the brightest one.
 */

export interface Sky {
  /** Wash multiplied over the world. */
  r: number
  g: number
  b: number
  /** How much of that wash lands. Capped — see the note above. */
  depth: number
  /** A warm bloom laid over everything, for the half hour the sun is low. */
  warmR: number
  warmG: number
  warmB: number
  warmA: number
  /**
   * Shadows. `len` stretches and offsets them away from the sun, `alpha` is
   * how dark they are — a hard noon shadow, a long soft evening one, and
   * almost nothing at night when the only light is a lamp post.
   */
  len: number
  shadow: number
  /** How much artificial light shows. 0 by day, 1 once it is properly dark. */
  night: number
  /**
   * GOD RAYS. How hard the light is coming across the ground in bars.
   *
   * Peaks at sunset and is gone at night, which is the same shape the real
   * thing has: rays need a low sun and something in the air, and at midnight
   * there is neither. Drawn from the direction the shadows point away from,
   * so the rays and the shadows are lit by the same sun.
   */
  rays: number
  /**
   * THE CORNERS GOING DOWN. Deepens all evening.
   *
   * The one effect here that is purely about the camera rather than about the
   * weather: it pulls the eye to the middle of the screen, which is where the
   * player is, and it is most of why a frame reads as a shot rather than as a
   * view of a tilemap.
   */
  vig: number
  /** The bloom around the sun itself, off past the corner of the screen. */
  sunA: number
  /** Dust hanging in the light. Nothing to see at night. */
  dust: number
  /** What to call it, for the debug readout. */
  name: string
}

/**
 * The keyframes, in order. Everything between them is linear.
 *
 * Chosen against the act boundaries rather than spaced evenly: Act I is walked
 * in daylight, Floriano is an afternoon, the sun goes down over the middle of
 * the town, and the Microsoft is fought in the dark. By the church door it is
 * night, which is what act three has always been written as.
 */
const KEYS: { t: number; sky: Sky }[] = [
  {
    t: 0,
    sky: {
      name: 'MEIO-DIA',
      r: 255, g: 252, b: 240, depth: 0,
      warmR: 0, warmG: 0, warmB: 0, warmA: 0,
      len: 0.08, shadow: 0.34, night: 0,
      // High sun: almost no rays, hard little shadows, hot white air.
      rays: 0.05, vig: 0.18, sunA: 0.06, dust: 0.5,
    },
  },
  {
    t: 0.38,
    sky: {
      name: 'TARDE',
      r: 255, g: 238, b: 200, depth: 0.26,
      warmR: 255, warmG: 196, warmB: 120, warmA: 0.04,
      len: 0.5, shadow: 0.28, night: 0,
      rays: 0.13, vig: 0.24, sunA: 0.10, dust: 0.8,
    },
  },
  {
    // The half hour that makes the whole thing worth doing.
    t: 0.63,
    sky: {
      name: 'PÔR DO SOL',
      r: 255, g: 172, b: 118, depth: 0.46,
      warmR: 255, warmG: 122, warmB: 52, warmA: 0.10,
      len: 1.15, shadow: 0.22, night: 0.08,
      // The half hour the whole system exists for.
      rays: 0.26, vig: 0.32, sunA: 0.15, dust: 1,
    },
  },
  {
    t: 0.80,
    sky: {
      name: 'ANOITECENDO',
      r: 150, g: 118, b: 168, depth: 0.44,
      warmR: 255, warmG: 96, warmB: 96, warmA: 0.06,
      len: 0.72, shadow: 0.16, night: 0.5,
      rays: 0.17, vig: 0.34, sunA: 0.13, dust: 0.5,
    },
  },
  {
    t: 0.93,
    sky: {
      name: 'NOITE',
      r: 62, g: 76, b: 146, depth: 0.50,
      warmR: 0, warmG: 0, warmB: 0, warmA: 0,
      len: 0.22, shadow: 0.12, night: 0.92,
      rays: 0, vig: 0.42, sunA: 0, dust: 0.12,
    },
  },
  {
    t: 1,
    sky: {
      /*
       * THE FLOOR OF THE WHOLE SYSTEM. 0.56 through a blue wash leaves the
       * ground at a little over half its daylight brightness, which is dark
       * enough to be night and light enough that a swarm is still a swarm and
       * not a guess. Anything below this and the lamps stop being atmosphere
       * and start being the only way to play.
       */
      name: 'NOITE FECHADA',
      r: 44, g: 58, b: 128, depth: 0.56,
      warmR: 0, warmG: 0, warmB: 0, warmA: 0,
      len: 0.1, shadow: 0.10, night: 1,
      rays: 0, vig: 0.46, sunA: 0, dust: 0.08,
    },
  },
]

/**
 * THE SKY IS BENT SO THAT NIGHT FALLS ON FLORIANO.
 *
 * It used to be a straight line: reach over the distance to the church door,
 * so the sun went down at whatever rate the map happened to imply. Which put
 * the town at 0.46 — mid-afternoon — and left the whole of the sunset for
 * the second half of the walk. The act with the streetlights in it, the act
 * the Glowies are named for, was fought in daylight.
 *
 * Two straight lines instead of one, hinged on the moment the road becomes a
 * town. Act one is the whole of the day: noon, afternoon, sunset. Arriving in
 * Floriano IS nightfall, and act two and act three deepen from there into the
 * dark the church is fought in.
 *
 * NIGHTFALL sits between ANOITECENDO (0.80) and NOITE (0.93) on purpose. On
 * the keyframe it lands about seventy per cent of the way into full night: the
 * lamps are on and the ground has gone blue, but there is still a little west
 * in the sky, which is what makes the last two acts feel like one continuous
 * evening rather than a cut to black.
 */
const NIGHTFALL = 0.86

/** 0 at the first step of the road, NIGHTFALL at Floriano, 1 at the church. */
export function timeOfDay(reach: number): number {
  const town = STAGES[1]?.startX ?? CHURCH_DOOR * 0.46
  if (reach <= 0) return 0
  if (reach < town) return (reach / town) * NIGHTFALL
  const rest = Math.max(1, CHURCH_DOOR - town)
  const k = Math.min(1, (reach - town) / rest)
  return NIGHTFALL + (1 - NIGHTFALL) * k
}

const out: Sky = { ...KEYS[0].sky }

/**
 * The sky at a point in the journey.
 *
 * Returns a shared object — this is read every frame by the renderer and
 * allocating a new one sixty times a second for six numbers would be silly.
 * Nothing holds onto it.
 */
export function skyAt(t: number): Sky {
  let i = 0
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const k = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)))

  out.name = k < 0.5 ? a.sky.name : b.sky.name
  out.r = a.sky.r + (b.sky.r - a.sky.r) * k
  out.g = a.sky.g + (b.sky.g - a.sky.g) * k
  out.b = a.sky.b + (b.sky.b - a.sky.b) * k
  out.depth = a.sky.depth + (b.sky.depth - a.sky.depth) * k
  out.warmR = a.sky.warmR + (b.sky.warmR - a.sky.warmR) * k
  out.warmG = a.sky.warmG + (b.sky.warmG - a.sky.warmG) * k
  out.warmB = a.sky.warmB + (b.sky.warmB - a.sky.warmB) * k
  out.warmA = a.sky.warmA + (b.sky.warmA - a.sky.warmA) * k
  out.len = a.sky.len + (b.sky.len - a.sky.len) * k
  out.shadow = a.sky.shadow + (b.sky.shadow - a.sky.shadow) * k
  out.night = a.sky.night + (b.sky.night - a.sky.night) * k
  out.rays = a.sky.rays + (b.sky.rays - a.sky.rays) * k
  out.vig = a.sky.vig + (b.sky.vig - a.sky.vig) * k
  out.sunA = a.sky.sunA + (b.sky.sunA - a.sky.sunA) * k
  out.dust = a.sky.dust + (b.sky.dust - a.sky.dust) * k
  return out
}

/**
 * WHICH WAY THE SHADOWS FALL.
 *
 * The sun is behind him and to the west for the whole journey, because he is
 * walking east into it getting later — so shadows reach ahead and a little
 * south, and they get longer as the afternoon goes. Fixed rather than derived
 * from the route's heading: a shadow that swung around every time the path
 * bent would read as the sun moving, not the player.
 */
export const SUN_X = 0.86
export const SUN_Y = 0.51

/**
 * AND THEREFORE WHERE THE SUN IS.
 *
 * Shadows fall away from it, so it is in the opposite direction to the one
 * they point — up and to the left, off past the corner of the screen. The rays
 * and the bloom are anchored here so that every lit thing on screen agrees
 * about which way the light is coming from.
 */
export const SUN_DIR_X = -SUN_X
export const SUN_DIR_Y = -SUN_Y
