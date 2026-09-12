/**
 * THE SOUND MAP.
 *
 * The effects library is from somewhere else entirely — it is a set of vehicle
 * and arcade sounds, all tills and helicopters and tank tracks — so almost
 * nothing here is used for the thing it was named for. That is fine and
 * normal: a sample is a shape, not a label, and `Cashmachine` firing on a
 * level-up is a till going off because you just got richer.
 *
 * Where a mapping is not obvious the reasoning is written down, because "why
 * is the revolver a truck gun" is a question someone will ask.
 */

/**
 * FAMILIES, one entry per sound that has variants on disk.
 *
 * The new library ships four takes of most things — `01_Hurt_v1` through
 * `_v4` — and playing a different one each time is the single cheapest thing
 * that can be done for how a game sounds. A gunshot fired three times a second
 * off ONE sample is a machine; the same gunshot off four is a gun. Everything
 * here is loaded and one is chosen at random per play; see `AudioBus.play`.
 *
 * The count is what is actually on disk, and the loader simply skips a file
 * that is not there — so these numbers being slightly wrong is survivable, but
 * they are correct as of the folder they were read from.
 */
export const SOUND_VARIANTS: Record<string, { src: string; count: number }> = {
  shoot:     { src: '/sounds/Sounds/01_Gunshot_v', count: 4 },
  hurt:      { src: '/sounds/Sounds/01_Hurt_v', count: 4 },
  death1:    { src: '/sounds/Sounds/01_Death_v', count: 4 },
  death2:    { src: '/sounds/Sounds/03_Death_v', count: 4 },
  boom:      { src: '/sounds/Sounds/01_Explosion_v', count: 3 },
  shootEnemy:{ src: '/sounds/Sounds/01_Laser_v', count: 4 },
  xp:        { src: '/sounds/Sounds/01_Coin Pickup_v', count: 2 },
  pickup:    { src: '/sounds/Sounds/03_Coin Pickup_v', count: 2 },
  cardTake:  { src: '/sounds/Sounds/01_Power up_v', count: 4 },
  levelUp:   { src: '/sounds/Sounds/02_Power up_v', count: 4 },
  totem:     { src: '/sounds/Sounds/03_Power up_v', count: 4 },
  gambleBad: { src: '/sounds/Sounds/01_Power down_v', count: 4 },
  punch:     { src: '/sounds/Sounds/01_Punch_v', count: 4 },
  dash:      { src: '/sounds/Sounds/01_Jump_v', count: 3 },
  gameOver:  { src: '/sounds/Sounds/02_Game Over_v', count: 4 },
  runStart:  { src: '/sounds/Sounds/01_Game Start_v', count: 4 },
  drop:      { src: '/sounds/Sounds/01_Fall_v', count: 4 },
}

export const SOUNDS = {
  /*
   * ---- the revolver ----
   *
   * A GUNSHOT, four of them, now that there are gunshots on disk. It used to
   * be a truck's gun because that was the meatiest thing in a library of
   * vehicles — a fair choice with nothing better, and there is something
   * better now. Fired three times a second, the four takes are what stop it
   * being a machine.
   */
  shoot: '/sounds/Sounds/01_Gunshot_v1.wav',
  // The green things keep the laser, so their shots are audibly not yours.
  shootEnemy: '/sounds/Sounds/01_Laser_v1.wav',

  // ---- things ending ----
  death1: '/sounds/Sounds/01_Death_v1.wav',
  death2: '/sounds/Sounds/03_Death_v1.wav',
  // Anything that goes off: bombs, eggs, rockets, an anvil landing.
  boom: '/sounds/Sounds/01_Explosion_v1.wav',
  /*
   * AND A HEAVY, DRY HIT, which nothing had before. Contact damage, a car
   * ploughing through, an anvil arriving — all of it was borrowing the
   * explosion, and none of it explodes.
   */
  punch: '/sounds/Sounds/01_Punch_v1.wav',
  /** Something landing from a height. The anvil, and a body being thrown. */
  drop: '/sounds/Sounds/01_Fall_v1.wav',

  // ---- being hurt, and not being hurt ----
  // A hurt sound, rather than a walkie-talkie standing in for one.
  hurt: '/sounds/Sounds/01_Hurt_v1.wav',
  block: '/sounds/Sounds/Neon_1.wav',
  heal: '/sounds/Sounds/Drink_machine.wav',
  /** Losing something: a curse landing, a helper dying, the last life spent. */
  powerDown: '/sounds/Sounds/01_Power down_v1.wav',

  // ---- picking things up ----
  xp: '/sounds/Sounds/01_Coin Pickup_v1.wav',
  pickup: '/sounds/Sounds/03_Coin Pickup_v1.wav',
  // A totem is a rare find and gets the biggest of the three power-ups.
  totem: '/sounds/Sounds/03_Power up_v1.wav',

  // ---- the level-up screen ----
  levelUp: '/sounds/Sounds/02_Power up_v1.wav',
  cardTake: '/sounds/Sounds/01_Power up_v1.wav',
  // The RNG de RPG rolling. A coin going into a machine is exactly the sound
  // of a gamble you did not choose to make.
  gamble: '/sounds/Sounds/Insert_coin.wav',
  gambleGood: '/sounds/Sounds/Collect_cash_1.wav',
  gambleBad: '/sounds/Sounds/01_Power down_v1.wav',

  // ---- abilities ----
  ammoSwap: '/sounds/Sounds/Print_ticket.wav',
  // A jump, because a dash is one — off the ground and back down.
  dash: '/sounds/Sounds/01_Jump_v1.wav',
  shield: '/sounds/Sounds/Neon_2.wav',
  // Rain is a cooler running: a continuous wet hiss.
  rain: '/sounds/Sounds/outdoor_cooler.wav',
  // The rocket lighting up, which is the one enemy sound that must carry.
  rocketWake: '/sounds/Sounds/Helicopter_engine_start.wav',

  // ---- the Doido do Carro ----
  carHorn: '/sounds/Sounds/cars_door_closing.wav',
  carEngine: '/sounds/Sounds/Truck_walk.wav',

  // ---- moments ----
  bossSpawn: '/sounds/Sounds/Helicopter_engine_stop.wav',
  wave: '/sounds/Sounds/Police_signal.wav',
  /** The run beginning, under the title card. */
  runStart: '/sounds/Sounds/01_Game Start_v1.wav',
  /** And the run ending, over the black. */
  gameOver: '/sounds/Sounds/02_Game Over_v1.wav',
  /** Seven seconds of fanfare, fired once when the run is won. */
  win: '/sounds/Music/ACT-2-ACT3 (night)/win.wav',
  gambleBad2: '/sounds/Sounds/01_Power down_v2.wav',
} as const

export type SoundKey = keyof typeof SOUNDS

const DAY = '/sounds/Music/ACT-1-2 (day)/'
const NIGHT = '/sounds/Music/ACT-2-ACT3 (night)/'
const MP3 = '/sounds/Music/MP3/'

/**
 * MUSIC, and it follows the sun.
 *
 * The two folders are named for the halves of the journey they belong to, and
 * that is the whole idea: the game already turns from midday to night over the
 * walk east, keyed to distance rather than to a clock, and the soundtrack now
 * turns with it. Nobody should be able to say where the day music ended, only
 * that the road they have been walking for twenty minutes does not sound the
 * way it did when they started — which is exactly what was already written
 * about the light.
 *
 * The switch is `dusk` in `Game.updateMusic`, read off the same `timeOfDay`
 * the sky is drawn from, and set at the keyframe where the sky commits to
 * going down rather than merely warming.
 *
 * EVERY TRACK HAS A FALLBACK. These are `.ogg`, which every current browser
 * decodes and some older Safaris do not; `MUSIC_FALLBACK` sends anything that
 * fails to the mp3 the game shipped with, so a browser that cannot read them
 * gets the old soundtrack rather than silence.
 */
export const MUSIC = {
  /** The front door. Unhurried, because it fades up over six seconds. */
  menu: DAY + 'Long Preparation.ogg',

  // ---- ACT I, the road, in daylight ----
  road: DAY + 'Mega-bot-pipes-forest.ogg',
  /** The last stretch of the road, once it stops being empty. */
  roadLate: DAY + 'jump_run_duck.ogg',

  // ---- ACT II, Floriano, afternoon into evening ----
  streets: DAY + 'cyberpunk-street.ogg',
  /** The same town after the sun has gone. */
  streetsNight: NIGHT + 'night time.ogg',

  // ---- ACT III ----
  /**
   * THE PLAZA, before the doors. Ambient and wrong, because act three opens
   * with a walk across an empty square towards a building with something in
   * it — the one stretch of the game where nothing is attacking and that is
   * the problem.
   */
  plaza: DAY + 'Magic Fx 7.ogg',
  /** And inside, which is a different building to the one he remembers. */
  church: NIGHT + 'Warped Caves.ogg',

  // ---- fights ----
  /** A boss met while it is still light. */
  boss: DAY + 'BossBattle.ogg',
  /** And one met after dark. */
  bossNight: NIGHT + 'battling.ogg',
  /**
   * THE MECHA. Named for exactly what it is, so it would have been perverse
   * to play anything else over a bipedal mech.
   */
  mecha: DAY + 'Bipedal Mech.ogg',
  /** O Chará gets his own, because he is the reason for all of it. */
  chara: NIGHT + 'chará.ogg',
  /** And a second one for when he stops being a man in a mecha. */
  charaFinal: NIGHT + 'chará(3).ogg',

  /** Kept for the Doido do Carro, who deserves his own siren. */
  police: NIGHT + 'outrunner.ogg',

  /*
   * THE TWO ENDINGS, which until now had no music at all.
   *
   * Both of them pointed at mp3s THAT DO NOT EXIST — there is no
   * `Game_over_theme` and no `Victory_theme` in the folder, and there never
   * was — so both fell through to the MENU theme, which is the same sound as
   * having not started yet: the worst possible answer to twenty minutes that
   * just ended one way or the other.
   *
   * Game over is the road theme's own subdued variant. Losing on the way to
   * Floriano and hearing the road he did not finish, played quieter, is worth
   * more than any dirge that has nothing to do with the rest of the game.
   */
  gameover: DAY + 'mega-bot-pipes under.ogg',
  /**
   * And winning is a loop, not the seven-second sting — `win.wav` is fired as
   * a ONE-SHOT over the top of it at the moment the run is won, because a
   * seven-second fanfare set to loop is a seven-second fanfare heard eleven
   * times while somebody reads their own stats.
   */
  victory: NIGHT + 'Space Rider.ogg',

  /*
   * ---- and the originals, kept only as fallbacks ----
   *
   * Nothing selects these directly. They exist so `MUSIC_FALLBACK` has
   * somewhere to point when an `.ogg` will not decode, which costs one fetch
   * each and buys a browser that cannot read the new soundtrack a complete
   * old one.
   */
  menuMp3: MP3 + 'Game_menu_theme_loopable.mp3',
  roadMp3: MP3 + 'Game_alternative_theme_loopable.mp3',
  streetsMp3: MP3 + 'Main_theme_floriano_loopable.mp3',
  churchMp3: MP3 + 'Main_theme_floriano_church_loopable.mp3',
  bossMp3: MP3 + 'Battle_theme_loopable.mp3',
  policeMp3: MP3 + 'police_theme_loopable.mp3',
} as const

export type MusicKey = keyof typeof MUSIC

/**
 * WHAT PLAYS IF A TRACK WILL NOT DECODE.
 *
 * The new soundtrack is `.ogg` — which every current browser reads and some
 * older Safaris do not. Anything that fails to fetch or decode falls back to
 * the mp3 the game shipped with, and on down the chain, so the worst case is
 * the old six-track soundtrack rather than a silent run.
 *
 * A missing file would otherwise sit in `pendingMusic` for ever, which is a
 * worse failure than playing the wrong thing and a much harder one to notice:
 * a silent screen looks like a design choice.
 */
export const MUSIC_FALLBACK: Partial<Record<MusicKey, MusicKey>> = {
  menu: 'menuMp3',
  road: 'roadMp3',
  roadLate: 'roadMp3',
  streets: 'streetsMp3',
  streetsNight: 'streetsMp3',
  plaza: 'churchMp3',
  church: 'churchMp3',
  boss: 'bossMp3',
  mecha: 'bossMp3',
  bossNight: 'bossMp3',
  chara: 'bossMp3',
  charaFinal: 'bossMp3',
  police: 'policeMp3',
  gameover: 'roadMp3',
  victory: 'bossMp3',
}
