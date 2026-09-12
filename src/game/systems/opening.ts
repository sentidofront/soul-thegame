import type { Game } from '../Game'
import { CONFIG } from '../config'

/**
 * THE FIRST NINE SECONDS.
 *
 * Between pressing COMEÇAR and having the stick, the game plays a short scene:
 * black lifts, two bars close over the frame, and O Indígena walks east saying
 * three things about why. Then the bars go and the road is his.
 *
 * WHY IT IS A CUTSCENE AND NOT A TITLE CARD. The menu already says what
 * happened — they took Soul — but it says it as a caption, in the third person,
 * on a screen with buttons on it. Nobody arrives in a run having met the man
 * they are about to play. Nine seconds of him complaining about the walk does
 * that, and it does it while he is ALREADY WALKING, so the first thing the game
 * shows is its own verb.
 *
 * THREE RULES it does not break:
 *
 *   1. IT RUNS ON REAL TIME, like the ending does. Nothing in it is simulated —
 *      no spawns, no bullets, no director — and a scene stepped through the
 *      fixed-timestep loop stutters on exactly the frames a scene most wants to
 *      be smooth. `Game.tick` gives it the wall clock and skips the
 *      accumulator entirely.
 *   2. IT IS SKIPPABLE by anything — a key, a click, a tap. A cutscene you
 *      cannot leave is a cutscene you resent on the second run, and this game
 *      expects a great many second runs. Skipping does not cut to black: it
 *      runs the last beat, so the bars still open and the walk is still
 *      continuous.
 *   3. IT MOVES HIM ALONG THE ROUTE, not with input. `updatePlayer` is never
 *      called during it, which is what guarantees he cannot shoot, dash,
 *      teleport or use an ability through his own opening — rather than a pile
 *      of guards inside the systems that would each be one refactor from being
 *      forgotten.
 */

/** What he says on the way out, in order. */
const LINES: readonly string[] = [
  'Os aliens levaram o soul',
  'Podia ser qualquer um. Foi logo ele.',
  'Floriano é pra lá, para o lado de lá.',
]

/*
 * THE BEATS, in seconds.
 *
 * Read down: the bars close, he starts moving, he says three things, he stops
 * on the last one, the bars open and the walk resumes as they go. The overlap
 * is the point — every transition here starts before the one under it has
 * finished, because a scene that completes each beat before beginning the next
 * reads as a slideshow.
 */
const IN = 0.75
/** He is already moving before the bars have finished arriving. */
const WALK_AT = 0.35
const LINE_AT = [1.0, 3.45, 5.9]
const LINE_HOLD = 2.3
/** He stops on the last line — the only still moment in it. */
const STOP_AT = 6.0
const OUT_AT = 8.15
const OUT = 0.8
const END = OUT_AT + OUT

export interface Cine {
  /** Seconds since the scene began, on the wall clock. */
  t: number
  /** 0..1, how far the letterbox is closed. */
  bars: number
  /** Which line is up, or -1 between them. */
  line: number
  /** How much of that line has been typed, 0..1. */
  type: number
  /** How hard he is walking, 0..1. Scripted, never input. */
  walk: number
  /** True for the one frame the scene hands over. */
  over: boolean
  /** Set by a skip, so the tail plays out fast instead of cutting. */
  rushed: boolean
  /** The highest line index that has already been announced. See below. */
  said: number
}

export function makeCine(): Cine {
  return { t: 0, bars: 0, line: -1, type: 0, walk: 0, over: false, rushed: false, said: -1 }
}

export const OPENING_LINES = LINES

/** Smoothstep, because every ramp in here wants to ease at both ends. */
const ease = (k: number) => {
  const c = Math.max(0, Math.min(1, k))
  return c * c * (3 - 2 * c)
}

export function updateOpening(g: Game, dt: number) {
  const c = g.cine
  if (!c) return

  /*
   * SKIP, ON E, AND ON NOTHING ELSE.
   *
   * It used to be any key at all, which sounds generous and was not: the first
   * thing anybody does when a game hands them a character is push the stick,
   * so WASD cancelled the scene before its first line — and a scene that ends
   * the moment you try to play is a scene almost nobody ever sees. The same
   * went for a click, which is the fire button.
   *
   * ONE DELIBERATE KEY. E is the one asked for, it is not a movement key, and
   * during the scene it is bound to nothing else — `updatePlayer` never runs
   * here, so the ammo swap it means in play cannot fire, and `endOpening`
   * clears the buffer so the press does not leak out the other side either.
   *
   * A TAP STILL SKIPS ON TOUCH, because a phone has no E. It is safe for the
   * same reason the keyboard was not: nothing on screen responds to a touch
   * during the scene, so a tap here can only ever have meant this.
   *
   * THE HALF-SECOND IS NOT POLITENESS. The mouse-down that pressed COMEÇAR is
   * still sitting in the press buffer on the first frame of the scene, and
   * without the delay a tap-to-start skipped the opening ITSELF, every single
   * time — which is exactly how a cutscene ends up believed to be broken
   * rather than believed to be skippable.
   *
   * Skipping does not jump to the end. It jumps to the moment the bars start
   * leaving, so what it removes is the TALKING, not the transition: the frame
   * opens up, he keeps walking, and the run begins the same way it would have
   * anyway. Past `OUT_AT` there is nothing left to skip and a press would only
   * make the handover jerk.
   */
  if (!c.rushed && c.t > 0.5 && c.t < OUT_AT) {
    const asked = g.input.consumePressed('e')
      || (g.input.touch && g.input.consumeClick())
    if (asked) {
      g.input.clearPressed()
      c.rushed = true
      c.t = Math.max(c.t, OUT_AT)
    }
  }

  c.t += dt

  /*
   * THE BLACK LIFTS ON THIS CLOCK.
   *
   * `step` normally does it, and `step` is exactly what is not running — the
   * veil would have hung at full black for the whole scene. It also lifts
   * FASTER than it does on a plain start, because the bars closing over it are
   * already doing the work of an opening and two slow fades on top of each
   * other is one slow fade too many.
   */
  if (g.veil > 0) g.veil = Math.max(0, g.veil - dt * 1.15)

  // ---- the frame ---------------------------------------------------------
  c.bars = c.t < OUT_AT
    ? ease(c.t / IN)
    : 1 - ease((c.t - OUT_AT) / OUT)

  // ---- what he is saying -------------------------------------------------
  c.line = -1
  c.type = 0
  if (!c.rushed) {
    for (let i = LINE_AT.length - 1; i >= 0; i--) {
      const since = c.t - LINE_AT[i]
      if (since < 0 || since > LINE_HOLD) continue
      c.line = i
      // Typed on rather than faded up: a subtitle that appears whole is read
      // in one glance and then waited out, which makes the hold feel like a
      // pause. Typed, the hold IS the line.
      c.type = Math.min(1, since / (LINES[i].length * 0.028))
      /*
       * ONE SOFT NOTE AS EACH LINE ARRIVES.
       *
       * Silent subtitles over silent walking is a scene the eye stops reading
       * about four seconds in. It is deliberately the card sound rather than
       * anything with impact — paper, not a hit — and quiet enough to sit
       * under the music instead of on top of it.
       */
      if (i > c.said) {
        c.said = i
        g.audio.play('cardTake', { volume: 0.35, rate: 0.85 })
      }
      break
    }
  }

  // ---- and the walk ------------------------------------------------------
  /*
   * He walks, stops on the last line, and starts again as the bars go. The
   * stop is what makes the third line land: two lines delivered on the move
   * and one delivered standing still reads as him having stopped to say it.
   */
  const want = c.rushed ? 1
    : c.t < WALK_AT ? 0
    : c.t < STOP_AT ? 1
    : c.t < OUT_AT ? 0
    : 1
  // Eased into rather than snapped, so the sprite accelerates like a body.
  c.walk += (want - c.walk) * Math.min(1, dt * 3.4)

  walkTheRoute(g, dt, c.walk)

  /*
   * THE CAMERA SITS AHEAD OF HIM, and settles back as the bars open.
   *
   * A cutscene camera looks ahead of its subject — down the road he is walking
   * — and a gameplay camera sits on him. Interpolating one into the other over
   * the last beat means the handover is a camera move rather than a cut, and
   * the player takes the stick from a frame that is already theirs.
   */
  const lead = (1 - ease((c.t - OUT_AT) / OUT)) * 46
  g.camera.follow(g.player.x + lead, g.player.y - 12, dt)

  if (c.t >= END) c.over = true
}

/**
 * MOVE HIM ALONG THE WAY, at a fraction of his own speed.
 *
 * `reach` is arc length down the route, so advancing it and asking the route
 * where that lands is a walk that follows every bend the road takes — the same
 * definition the rest of the game uses for progress, driven from the other end.
 *
 * `vx`/`vy` are written from the step actually taken rather than from the
 * intent, so the walk animation, the facing and the dust all read the truth
 * even on the frames the route turns under him.
 */
function walkTheRoute(g: Game, dt: number, amount: number) {
  const p = g.player
  p.anim += dt
  if (amount < 0.01) {
    p.vx *= Math.max(0, 1 - dt * 8)
    p.vy *= Math.max(0, 1 - dt * 8)
    return
  }

  const speed = CONFIG.PLAYER.speed * 0.62 * amount
  const before = { x: p.x, y: p.y }
  p.reach += speed * dt
  const to = g.chunks.route.pointAt(p.reach)
  p.x = to.x
  p.y = to.y

  const dx = p.x - before.x
  const dy = p.y - before.y
  p.vx = dx / Math.max(dt, 1e-4)
  p.vy = dy / Math.max(dt, 1e-4)
  if (dx !== 0 || dy !== 0) {
    if (Math.abs(dx) > 0.001) p.facing = dx < 0 ? -1 : 1
    const len = Math.hypot(dx, dy) || 1
    // The revolver looks where he is going. There is nothing to aim at yet.
    p.aimX = dx / len
    p.aimY = dy / len
  }
}
