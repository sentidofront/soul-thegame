# SOUL — house rules

Floriano, Piauí, under attack. O Indígena walks east with a revolver to get
Soul back. React owns the shell; the engine runs outside it and pushes a
`Snapshot` at ~15 Hz.

These are the rules that came out of bugs, not out of taste. Each one cost a
real defect to learn.

## Input

**The browser must never open a context menu while a run is attached.**
Queima Rosca is held on the right mouse button. If the refusal is bound to the
canvas alone, then any frame where an overlay appears under the cursor — a
level-up, a swap prompt, the pause screen — retargets the `contextmenu` event
to that overlay, the browser menu opens over the fight, and the `mouseup` that
would release the ability lands in the menu instead of the page. The ability
jams on. So `contextmenu` is refused on `window`, in the capture phase, for the
whole life of the `Input` object. See `core/input.ts`.

The same shape of bug applies to any held mouse input added later: bind the
guard to the window, not to the element the game happens to be drawn on.

**Key state comes from `e.code`, never `e.key`.** Holding Option on macOS
changes `e.key` mid-press ('d' becomes '∂'), so the keyup never matches the
keydown and the key sticks down for the rest of the run.

**Aim is scaled from the live element rect.** `camera.resize` is given device
pixels and the pointer arrives in CSS pixels; using them together silently
compresses a 360° sweep to 79° at DPR 2. Measured, not theorised.

## Pools

**Nothing outside a dense pool may hold a reference into it.** `damageEnemy`
can kill, a kill is a swap-remove, and the object at that index is handed
straight back to the pool with the last enemy moved into its slot. Anything
read off an enemy — its position, the index itself — must be read BEFORE the
damage, and anything written to it (`burnT`, `clawCd`) must be written before
too, or it lands on a corpse that the next spawn hands out.

This bug class has appeared at least four times: three destroyed pillars
reporting as standing, fire on a freshly spawned alien, a skull aimed at the
body it came off.

## Levelling

**The pace controller, not the XP curve, decides how often a player levels.**
`CONFIG.LEVEL_PACE` pins the level to roughly `expected(reach)` by shrinking
orb value once the player is ahead. Making levels cheaper on its own only means
arriving at the same ceiling sooner and waiting there — if levelling should be
faster, `top` has to move as well.

**A level-up must never hand over a hand of three cards that are all useless.**
From level six, `rollUpgrades` checks the hand and swaps its last card if
nothing in it is owned already, is a slottable power, or is rare or better. It
checks rather than rigs: a live hand is left exactly as the dice rolled it.

## Effects

**Additive compositing can only ever brighten.** Anything meant to darken —
scorch, smoke, blood — is drawn on normal compositing, or it reads as a lamp
rather than as a burn.

**Sprite sheets are mostly padding.** Measure the drawn extent frame by frame
before sizing an effect off its cell; `16_sunburn`'s flame reaches about half
of its cell radius, and the rest of every frame is empty. Oversizing the sprite
inside a buffer to compensate clips it against the buffer and composites the
buffer's own corners into the world as a bright rectangle — size the buffer's
placement instead.

## Verification

- `./node_modules/.bin/tsc --noEmit` — **not** `npx tsc`.
- `npx vite build`.
- Live measurement through `window.soul` in the browser beats reading the code.
  Sample the canvas with `getImageData` rather than trusting a screenshot; the
  preview pane serves stale frames.
- Vite's HMR goes stale on this project often enough to matter. A
  `ReferenceError` for a function that plainly exists means a hard reload, and
  sometimes `rm -rf node_modules/.vite`.

## Editing

Changes are applied with Python scripts doing assert-guarded exact string
replacement, so a stale assumption fails loudly instead of silently editing the
wrong place. Comments explain WHY, in the voice of the surrounding code, and
cite the measurement where there was one.
