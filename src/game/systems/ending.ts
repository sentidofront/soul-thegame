import type { Game } from '../Game'
import { ARENA_INTERIOR } from '../data/stages'

/**
 * THE LAST NINETY SECONDS.
 *
 * O Chará goes down and the game stops being a game for a moment: a black
 * screen, a wounded alien breathing in close-up, and one click. Then the
 * camera finds the middle of the church, Soul comes down out of the light, and
 * the player is asked for the only input in twenty minutes that is not
 * violence.
 *
 * WHY IT IS ITS OWN PHASE. The simulation must not run through any of this —
 * no director, no spawns, no revolver — while the renderer very much must, and
 * the camera has to be taken away from whatever was driving it. A flag on
 * 'playing' would have meant guarding every system in the tick against a
 * cutscene; a phase means the tick simply does not reach them.
 *
 * WHY IT IS DRIVEN OFF REAL TIME rather than the fixed step. Nothing here is
 * simulated: there is no physics to keep deterministic, and a cutscene that
 * runs on the accumulator would stutter on exactly the frames a cutscene most
 * wants to be smooth.
 */

export type EndingStep =
  | 'fade'      // the fight dims out
  | 'wounded'   // he is breathing, and waiting. Click.
  | 'shot'      // the three frames of it landing
  | 'hold'      // and the silence after
  | 'church'    // back to the world, the camera drifting to the middle
  | 'descend'   // Soul, out of the light
  | 'kiss'      // the last prompt in the game
  | 'kissed'    // and the answer

export interface EndingState {
  step: EndingStep
  /** Seconds in the current step. */
  t: number
  /** Where the camera was when the world came back, to pan from. */
  fromX: number
  fromY: number
  /** Where Soul is going to land. */
  soulX: number
  soulY: number
  /** 0 at the top of the screen, 1 on the ground. */
  descent: number
  /** Where O Indígena was standing when the fight ended, to walk him in from. */
  manX: number
  manY: number
  /** Hearts, once. */
  hearts: number
}

export function makeEnding(): EndingState {
  return {
    step: 'fade', t: 0,
    fromX: 0, fromY: 0, soulX: 0, soulY: 0,
    descent: 0, hearts: 0, manX: 0, manY: 0,
  }
}

/** How long each step runs, where the step is on a clock rather than a click. */
const FADE = 1.1
const HOLD = 2.2
const CHURCH = 1.8
const DESCEND = 3.2
const KISSED = 3.4

export function updateEnding(g: Game, dt: number) {
  const e = g.ending
  e.t += dt

  switch (e.step) {
    case 'fade':
      if (e.t < FADE) return
      go(g, e, 'wounded')
      g.audio.music('victory')
      return

    case 'wounded': {
      /*
       * THE ONE CLICK.
       *
       * No timer on it. He is not going anywhere and neither is the player,
       * and putting a countdown on the last shot of the game would turn a
       * decision into a reflex test — which is what the whole fight before it
       * already was.
       */
      if (!g.input.consumeClick()) return
      go(g, e, 'shot')
      g.audio.play('shoot', { volume: 1 })
      g.camera.addShake(1.2)
      return
    }

    case 'shot':
      // Three frames at six a second, then let it sit.
      if (e.t < 3 / 6 + 0.15) return
      go(g, e, 'hold')
      return

    case 'hold':
      if (e.t < HOLD) return
      go(g, e, 'church')
      // The camera has been parked on the arena all fight; remember where, so
      // the drift to the middle has somewhere to start.
      e.fromX = g.camera.x
      e.fromY = g.camera.y
      {
        /*
         * THE MIDDLE OF THE ROOM, resolved from the route rather than read off
         * `activeArena`.
         *
         * The barrier is dropped the instant the boss dies — the same lines
         * that hand over to this sequence also clear it — so by the time the
         * camera wants somewhere to go, the arena is already null and Soul
         * would have landed on top of whoever was standing there. The
         * interior's position is a pure function of the route, so it can just
         * be asked for again.
         */
        const a = g.act3.phase !== 'outside' ? g.resolveArena(ARENA_INTERIOR) : null
        e.soulX = a ? a.centerX : g.player.x
        e.soulY = a ? a.centerY - 20 : g.player.y - 20
      }
      // And where HE was standing, so he can be walked into the shot.
      e.manX = g.player.x
      e.manY = g.player.y
      return

    case 'church': {
      const k = Math.min(1, e.t / CHURCH)
      const s = k * k * (3 - 2 * k)
      g.camera.x = e.fromX + (e.soulX - e.fromX) * s
      g.camera.y = e.fromY + (e.soulY - 30 - e.fromY) * s

      /*
       * AND HE WALKS INTO IT.
       *
       * The camera going to the middle of the room without him would leave the
       * player watching a stranger land in an empty church — he is off screen
       * by wherever the last shot happened to leave him. Walked rather than
       * teleported: it is the same smoothstep the camera is on, so the two
       * arrive together.
       */
      stage(g, e, s)
      if (k < 1) return
      go(g, e, 'descend')
      g.say('...Soul?')
      return
    }

    case 'descend': {
      const k = Math.min(1, e.t / DESCEND)
      /*
       * Slowing as it lands rather than falling. He is not dropping, he is
       * being lowered — an ease-out on the last third is the whole difference
       * between arriving and hitting the floor.
       */
      e.descent = 1 - (1 - k) * (1 - k)
      stage(g, e, 1)
      if (k < 1) return
      go(g, e, 'kiss')
      g.audio.play('totem', { volume: 0.9 })
      g.say('Cê demorou, viu.')
      return
    }

    case 'kiss':
      stage(g, e, 1)
      if (!g.input.consumeClick()) return
      go(g, e, 'kissed')
      e.hearts = 1
      g.audio.play('heal', { volume: 1 })
      g.camera.addShake(0.2)
      return

    case 'kissed':
      // Leaning in, and then not leaning back.
      stage(g, e, 1, Math.min(1, e.t / 0.5))
      if (e.t < KISSED) return
      // And that is the run. `endRun` freezes the summary; see `data/record`.
      g.endRun('won')
      // Over the top of the victory loop, once. See MUSIC.victory.
      g.audio.play('win', { volume: 0.9 })
      g.push()
      return
  }
}

/**
 * Puts O Indígena where the shot needs him: a step to Soul's left, facing them.
 *
 * `lean` closes the last few units for the kiss itself, which is the whole of
 * the animation and quite enough — the sprite has no kiss pose and inventing
 * one out of a translation would look worse than a step forward does.
 */
function stage(g: Game, e: EndingState, k: number, lean = 0) {
  const gap = 15 - lean * 6
  g.player.x = e.manX + (e.soulX - gap - e.manX) * k
  g.player.y = e.manY + (e.soulY - e.manY) * k
  g.player.vx = 0
  g.player.vy = 0
  g.player.facing = 1
  g.player.aimX = 1
  g.player.aimY = 0
}

/**
 * Moves to a step, and throws away any click that was already pending.
 *
 * That last part is not housekeeping. The click flag is an edge that sits
 * there until something consumes it, and the last thing the player did before
 * O Chará went down was hold the fire button — so the prompt would read a
 * click made ten seconds earlier and skip straight past itself. Twice, in
 * testing: the whole sequence ran to the kiss without anyone touching a mouse.
 */
function go(g: Game, e: EndingState, step: EndingStep) {
  e.step = step
  e.t = 0
  g.input.clearPressed()
}

/**
 * How black the screen is, 0..1.
 *
 * Shared by the renderer for the veil and for deciding whether the world is
 * worth drawing at all — through the close-up it is completely covered, and
 * blitting a hundred chunks under an opaque rectangle is work for nobody.
 */
export function endingVeil(e: EndingState): number {
  switch (e.step) {
    case 'fade': return Math.min(1, e.t / FADE)
    case 'wounded':
    case 'shot':
      return 1
    case 'hold': return 1
    case 'church': return Math.max(0, 1 - e.t / 0.7)
    default: return 0
  }
}
