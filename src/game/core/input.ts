/**
 * Input is normalised into one shape the game reads every tick:
 * a movement vector (-1..1), an aim point in SCREEN space, and edge-triggered
 * action flags. Keyboard, mouse and a floating touch stick all feed the same
 * struct, so gameplay code never asks "which device is this?".
 */
/**
 * WHICH KEY THIS IS, taken from the key's POSITION and not from its letter.
 *
 * `e.key` is what the key produces, and what a key produces changes under a
 * modifier. Hold Option on a Mac and D stops being 'd' and becomes '∂' — so a
 * keydown recorded as 'd' was answered by a keyup for '∂', the delete missed,
 * and 'd' stayed in the held set FOR EVER. The character walks east on its
 * own, pressing A only cancels it back to standing still, and W turns into a
 * diagonal. Every symptom in the movement report falls out of that one line.
 *
 * `e.code` is the physical key and does not move: KeyD is KeyD with Option,
 * with Shift, with Caps Lock, on ABNT2 and on AZERTY. It is also the right
 * answer for a game — WASD is a SHAPE under the left hand, which is why an
 * AZERTY player expects the keys where W and A are printed Z and Q to walk
 * them forward and left.
 *
 * The names it produces are the ones the game already asks for: 'w', 'a',
 * 'arrowleft', ' ', 'escape'. `e.key` remains the fallback for anything with
 * no code at all, which is mostly software keyboards.
 */
function keyName(e: KeyboardEvent): string {
  const c = e.code
  if (c) {
    if (c.length === 4 && c.startsWith('Key')) return c[3].toLowerCase()
    if (c.startsWith('Arrow')) return c.toLowerCase()
    if (c === 'Space') return ' '
    if (c === 'Escape') return 'escape'
    if (c.length === 6 && c.startsWith('Digit')) return c[5]
  }
  return e.key.toLowerCase()
}

export class Input {
  moveX = 0
  moveY = 0
  aimScreenX = 0
  aimScreenY = 0
  /**
   * False until the pointer actually moves. On touch and on keyboard-only play
   * there is no cursor, and aiming at a stale (0,0) would peg the aim to the
   * top-left corner of the screen forever.
   */
  hasPointer = false
  firing = false
  /**
   * THE OTHER BUTTON, held.
   *
   * Queima Rosca is the one ability in the game that is a STATE rather than an
   * event, so it needs an input that can be held, and the left button is
   * already the trigger. Right-click is the only held input a mouse has left.
   * The context menu it would normally open is refused on the canvas @ see
   * `noMenu`.
   */
  firing2 = false
  /**
   * True only on the frame the button went down, cleared by `consumeClick`.
   *
   * `firing` is a HELD flag, which is right for a gun and wrong for anything
   * asked once — a cutscene prompt reading it would fire on every frame the
   * button happened to be down and skip the rest of the scene in a tick.
   */
  private clicked = false
  /**
   * PRESSES WAITING TO BE READ, and when each of them happened.
   *
   * A Set was wrong. Nothing drains it except a reader, and every reader in
   * the game is behind a condition — `consumePressed('q')` is only reached
   * when Teleporte is off cooldown. So a Q pressed during the cooldown sat in
   * the set until the cooldown ended and THEN fired, seconds after the player
   * asked for it and usually while they were doing something else.
   *
   * Timestamped, and anything older than the buffer below is thrown away. The
   * buffer is deliberately not zero: a press made a few frames early should
   * still land, because that is what a player means by it.
   */
  private pressed = new Map<string, number>()
  /** Seconds a press stays readable before it is dropped. */
  private static readonly BUFFER = 0.18
  /**
   * GAME SECONDS, not wall-clock ones. Advanced by `tick` from the simulation.
   *
   * The buffer has to expire in the time the PLAYER experiences. Off
   * `performance.now()` the two agree in normal play and come apart exactly
   * when it matters — a frame spike, a tab coming back and catching up on a
   * quarter second in one go, or the fixed-step loop running several steps
   * inside one millisecond. Then a press that should have been dropped is
   * still fresh, and the late-firing dash is back.
   */
  private clock = 0

  /** Called once per simulation step, with the step's own dt. */
  tick(dt: number) { this.clock += dt }

  /**
   * A DIRECTION ATTACHED TO A PRESS.
   *
   * On a keyboard the answer to "which way" is the stick or the cursor, and
   * there is nothing to attach. On a phone there is no cursor and the stick is
   * held by the other thumb — so the button itself becomes the aim: press it,
   * drag, let go, and the drag is the direction. Keyed by the key so a queued
   * dash cannot pick up a teleport's heading.
   */
  private aims = new Map<string, { x: number; y: number }>()
  /**
   * Set the first time a real touch arrives, and never unset.
   *
   * Feature detection is the wrong tool: half the laptops sold have a
   * touchscreen and none of their owners want the keyboard controls to
   * disappear. Actually touching the thing is the only honest signal.
   */
  touch = false
  private down = new Set<string>()
  /** The two most recent press times per key, in seconds, for double taps. */
  private tapLast = new Map<string, number>()
  private tapPrev = new Map<string, number>()

  private touchId: number | null = null
  private touchOrigin = { x: 0, y: 0 }
  private touchNow = { x: 0, y: 0 }
  /** Pixels of drag that equal full stick deflection. */
  private static readonly STICK_RANGE = 56
  /**
   * AND PIXELS OF DRAG THAT MEAN NOTHING AT ALL.
   *
   * A thumb resting on glass is never still: it rolls a few pixels while it
   * sits there, and with no dead zone every one of those pixels was movement —
   * seven pixels of tremor is an eighth of full deflection, which on a phone
   * is a character that will not stand where it is put. The deflection is
   * rescaled from the edge of the zone rather than measured from the centre,
   * so the stick still starts at exactly zero instead of jumping to an eighth
   * the moment it crosses.
   */
  private static readonly STICK_DEAD = 7

  private detach: (() => void)[] = []

  attach(el: HTMLCanvasElement) {
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return
      /*
       * CMD SWALLOWS KEYUP, so nothing held may survive it.
       *
       * On macOS the system does not deliver keyup for ordinary keys while
       * Command is down. `keyName` below cannot help with an event that never
       * arrives — so the moment Meta is involved, everything being held is
       * dropped. Cmd is not a game key; there is nothing to lose here and a
       * character walking into the caatinga on its own to lose otherwise.
       */
      if (e.metaKey || e.key === 'Meta') this.down.clear()

      const k = keyName(e)
      const now = performance.now() / 1000
      this.down.add(k)
      this.pressed.set(k, this.clock)
      this.tapPrev.set(k, this.tapLast.get(k) ?? -Infinity)
      this.tapLast.set(k, now)
      // Stop the page from scrolling out from under the game.
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
    }
    const ku = (e: KeyboardEvent) => {
      this.down.delete(keyName(e))
      // Releasing Command is the other half of the rule above: whatever was
      // held while it was down never reported itself released.
      if (e.key === 'Meta') this.down.clear()
    }
    const blur = () => {
      this.firing2 = false
      this.down.clear()
      /*
       * AND THE BUFFER TOO.
       *
       * `pressed` used to survive a tab switch, so a dash asked for on the way
       * out could still be sitting there on the way back in. It expires on its
       * own in a fifth of a second of GAME time — which is not time that
       * passes while the tab is hidden.
       */
      this.pressed.clear()
      this.firing = false
      this.touchId = null
    }
    // A tab going into the background never fires `blur` on some browsers, and
    // it is the single most common way to end up holding a key you have let go.
    const hidden = () => { if (document.hidden) blur() }

    /*
     * ON THE WINDOW, NOT ON THE CANVAS.
     *
     * `.hud` is `pointer-events: none` so the HUD does not eat shots, but the
     * handful of things inside it that are actually controls opt back in — and
     * a mousemove over one of those never reached the canvas, so the aim FROZE
     * at whatever angle it held when the cursor crossed the button, and stayed
     * there until the cursor came back. The same went for the cursor leaving
     * the window entirely.
     *
     * The rectangle still comes from the canvas, so the coordinates are the
     * canvas's own either way; the only thing that changes is that the aim now
     * keeps tracking over every pixel of the page, including the ones the
     * canvas cannot see.
     */
    const mm = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      /*
       * CSS PIXELS IN, BACKING-STORE PIXELS OUT. This is the aim bug.
       *
       * `clientX` is in CSS pixels and the camera works in the canvas's own
       * pixels — `Game.resize` hands it `canvas.width`, which is `cssW * dpr`.
       * On a 1x display the two are the same number and nothing is wrong,
       * which is exactly why this survived: it is invisible on the machine it
       * was written on and total on a Retina MacBook.
       *
       * At dpr 2 the point the aim treats as "the player" lands on the BOTTOM
       * RIGHT CORNER of the window, because every screen coordinate is half
       * what the camera expects. Everything the mouse can reach is up and to
       * the left of that corner, so the revolver can only be pointed into one
       * quadrant: sweeping the mouse all the way round the window moved the
       * aim through 79 degrees instead of 360. That is the playtester who
       * could not turn around.
       *
       * Measured off the element every move rather than cached, so it also
       * survives the things that change dpr without resizing anything: a
       * window dragged onto a second monitor, and browser zoom.
       */
      const sx = r.width > 0 ? el.width / r.width : 1
      const sy = r.height > 0 ? el.height / r.height : 1
      this.aimScreenX = (e.clientX - r.left) * sx
      this.aimScreenY = (e.clientY - r.top) * sy
      this.hasPointer = true

      /*
       * AND A DROPPED MOUSEUP HEALS HERE.
       *
       * Release the button outside the window — over the dock, over another
       * app — and no mouseup is delivered, so `firing` stays true and the
       * revolver keeps going by itself. `buttons` is the ground truth about
       * what is actually held, and every move reasserts it.
       */
      if (this.firing && (e.buttons & 1) === 0) this.firing = false
      if (this.firing2 && (e.buttons & 2) === 0) this.firing2 = false
    }
    const mdn = (e: MouseEvent) => {
      if (e.button === 2) { this.firing2 = true; return }
      if (e.button !== 0) return
      this.firing = true
      this.clicked = true
    }
    const mup = (e: MouseEvent) => {
      if (e.button === 0) this.firing = false
      if (e.button === 2) this.firing2 = false
    }
    /*
     * RIGHT-CLICK OPENS NOTHING.
     *
     * The context menu is a panel that appears over the game, takes the
     * keyboard, and swallows the next click used to dismiss it — three
     * separate ways to lose a fight to a mis-click. Only over the canvas: the
     * menus are ordinary HTML and a player is entitled to right-click them.
     */
    /*
     * THE RIGHT BUTTON BELONGS TO THE GAME, ANYWHERE ON THE PAGE.
     *
     * This was bound to the CANVAS only, on the reasoning that the menus are
     * ordinary HTML and a player is entitled to right-click them. Queima Rosca
     * is held on the right button — so the sequence that breaks it is: hold
     * right button, level up, the card screen appears UNDER THE CURSOR, and the
     * contextmenu event that follows now has an overlay as its target instead
     * of the canvas. The browser menu opens over the fight, the mouseup lands
     * in the menu instead of the page, and the ability is left stuck on.
     *
     * So the refusal is on the window, in the CAPTURE phase, for as long as a
     * run is attached. Nothing in this game wants a browser context menu, and
     * the cost of being wrong about that is a lot smaller than the cost of an
     * ability jamming on in the middle of act three.
     */
    const noMenu = (e: Event) => e.preventDefault()

    const ts = (e: TouchEvent) => {
      this.touch = true
      /*
       * BEFORE THE EARLY RETURN, and that ordering is the whole fix.
       *
       * A touchstart that is not default-prevented makes the browser follow it
       * up with SYNTHESISED mouse events — mousemove, mousedown, mouseup — for
       * compatibility. The first finger was prevented and so produced none;
       * the second finger hit the guard below and returned before ever getting
       * here, so it did. That synthetic mousemove set `hasPointer`, which is
       * the flag that switches the gun from auto-target to cursor aim — and
       * there is no cursor on a phone. One two-finger moment and aiming was
       * permanently pinned to wherever that second thumb happened to land.
       */
      e.preventDefault()
      /*
       * A HAND ON THE GLASS MEANS THE MOUSE IS NOT DRIVING. On a laptop with a
       * touchscreen both are real, so this follows whichever was used last
       * rather than latching to one for the session.
       */
      this.hasPointer = false
      if (this.touchId !== null) return
      const t = e.changedTouches[0]
      this.touchId = t.identifier
      const r = el.getBoundingClientRect()
      this.touchOrigin = { x: t.clientX - r.left, y: t.clientY - r.top }
      this.touchNow = { ...this.touchOrigin }
      // A tap is a click. The ending has to be finishable on a phone.
      this.clicked = true
    }
    const tm = (e: TouchEvent) => {
      if (this.touchId === null) return
      const r = el.getBoundingClientRect()
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.touchId) continue
        this.touchNow = { x: t.clientX - r.left, y: t.clientY - r.top }
      }
      e.preventDefault()
    }
    /*
     * A TOUCH ANYWHERE ON THE PAGE, not only on the canvas.
     *
     * `touch` decides what the game says to the player — which key skips the
     * opening, and whether an on-screen button belongs there — and on a phone
     * every one of those decisions is needed BEFORE the first touch the canvas
     * ever sees, because the menu is React and its buttons are not the canvas.
     * This flips the flag on the tap that presses COMEÇAR; it deliberately
     * does nothing else, so it cannot be mistaken for a tap the game acts on.
     */
    const anyTouch = () => { this.touch = true }

    const te = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.touchId) this.touchId = null
      }
      /*
       * AND THE BACKSTOP: nothing is touching the screen, so nothing is
       * holding the stick, whatever the identifiers said.
       *
       * A touch can go away without its own `touchend` — the browser takes it
       * for a system gesture, a phone call arrives, a second finger confuses
       * the sequence. When that happened the stick stayed exactly where it was
       * last dragged to and the character walked off in that direction with
       * nobody touching the phone at all.
       */
      if (e.touches.length === 0) this.touchId = null
    }

    window.addEventListener('keydown', kd, { passive: false })
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('mousemove', mm)
    el.addEventListener('mousedown', mdn)
    window.addEventListener('contextmenu', noMenu, { capture: true })
    window.addEventListener('mouseup', mup)
    el.addEventListener('touchstart', ts, { passive: false })
    el.addEventListener('touchmove', tm, { passive: false })
    window.addEventListener('touchstart', anyTouch, { passive: true, capture: true })
    window.addEventListener('touchend', te)
    window.addEventListener('touchcancel', te)

    this.detach = [
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
      () => window.removeEventListener('blur', blur),
      () => document.removeEventListener('visibilitychange', hidden),
      () => window.removeEventListener('mousemove', mm),
      () => el.removeEventListener('mousedown', mdn),
      () => window.removeEventListener('contextmenu', noMenu, { capture: true }),
      () => window.removeEventListener('mouseup', mup),
      () => el.removeEventListener('touchstart', ts),
      () => el.removeEventListener('touchmove', tm),
      () => window.removeEventListener('touchstart', anyTouch, { capture: true }),
      () => window.removeEventListener('touchend', te),
      () => window.removeEventListener('touchcancel', te),
    ]
  }

  dispose() { for (const d of this.detach) d(); this.detach = [] }

  /** True once per press of the mouse button or one tap. */
  consumeClick(): boolean {
    if (!this.clicked) return false
    this.clicked = false
    return true
  }

  /**
   * A KEY THE GAME CAN BE TOLD ABOUT, rather than one somebody held down.
   *
   * This is the whole of touch support for actions: an on-screen button says
   * `press(' ')` and every line of gameplay code goes on reading the keyboard
   * exactly as it always did. Nothing downstream has to know which kind of
   * device asked, which is the same reason the movement stick folds into the
   * same vector WASD does.
   *
   * Only `pressed`, never `down` — nothing in the game holds any of these.
   */
  press(key: string, dir?: { x: number; y: number } | null) {
    this.pressed.set(key, this.clock)
    // Cleared rather than left alone: a plain tap after an aimed one must not
    // inherit the heading of the one before it.
    if (dir) this.aims.set(key, dir)
    else this.aims.delete(key)
  }

  /** The heading a press arrived with, if it had one. Read once. */
  takeAim(key: string): { x: number; y: number } | null {
    const d = this.aims.get(key)
    this.aims.delete(key)
    return d ?? null
  }

  /** True once per press, if it was recent enough to still mean anything. */
  consumePressed(key: string): boolean {
    const at = this.pressed.get(key)
    if (at === undefined) return false
    this.pressed.delete(key)
    return this.clock - at <= Input.BUFFER
  }

  clearPressed() { this.pressed.clear(); this.clicked = false }


  /**
   * True once per double tap of `key` within `window` seconds.
   *
   * Consumed on read so one double tap fires one blink. A tap pair older than
   * half a second is ignored rather than buffered — otherwise a double tap
   * made while the ability was on cooldown would fire the instant it came
   * back, seconds after the player asked for it.
   */
  consumeDoubleTap(key: string, window: number): boolean {
    const last = this.tapLast.get(key)
    const prev = this.tapPrev.get(key)
    if (last === undefined || prev === undefined) return false
    if (last - prev > window) return false
    if (performance.now() / 1000 - last > 0.5) return false
    this.tapPrev.set(key, -Infinity)
    return true
  }

  /** Is a touch stick currently active? Used by the HUD to draw it. */
  get stick(): { ox: number; oy: number; x: number; y: number } | null {
    if (this.touchId === null) return null
    return { ox: this.touchOrigin.x, oy: this.touchOrigin.y, x: this.touchNow.x, y: this.touchNow.y }
  }

  /** Folds keyboard + touch into a single normalised movement vector. */
  sample() {
    let x = 0
    let y = 0
    if (this.down.has('a') || this.down.has('arrowleft')) x -= 1
    if (this.down.has('d') || this.down.has('arrowright')) x += 1
    if (this.down.has('w') || this.down.has('arrowup')) y -= 1
    if (this.down.has('s') || this.down.has('arrowdown')) y += 1

    if (this.touchId !== null) {
      const dx = this.touchNow.x - this.touchOrigin.x
      const dy = this.touchNow.y - this.touchOrigin.y
      const d = Math.hypot(dx, dy)
      if (d > Input.STICK_DEAD) {
        const k = (d - Input.STICK_DEAD) / Input.STICK_RANGE / d
        x += dx * k
        y += dy * k
      }
    }

    const len = Math.hypot(x, y)
    if (len > 1) { x /= len; y /= len }
    this.moveX = x
    this.moveY = y
  }
}
