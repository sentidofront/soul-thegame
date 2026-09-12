import type { Game } from '../Game'
import type { Prop } from '../world/props'
import type { Bullet, Enemy, Helper } from '../types'
import { drawEffect, type Effect, type Sheet } from '../core/assets'
import { EFFECTS, type EffectKey } from '../data/effects'
import { OPENING_LINES } from './opening'
import {
  SUN_DIR_X, SUN_DIR_Y, SUN_X, SUN_Y, skyAt, timeOfDay, type Sky,
} from '../world/daylight'
import { endingVeil } from './ending'
import { CONFIG } from '../config'
import type { IconKey } from '../data/sprites'
import { ABILITIES, at } from '../data/abilities'
import { BEHOLDER_WINDUP } from './ai'
import { hatAt, queimaRadius } from './abilities'
import { AMMO } from '../data/bullets'
import { CHURCH_DOOR } from '../data/stages'

/** Reused every frame so the draw pass allocates nothing. */
const order: number[] = []

/*
 * THE ONE FACE, for canvas text too.
 *
 * `ctx.font` knows nothing about the stylesheet, so the bark, the damage
 * numbers and the distance under the guide arrow were all still drawing in the
 * system monospace while every DOM element around them was 8-bit. Sizes here
 * are in WORLD units and the camera is at 2x, so 7px lands as fourteen on
 * screen.
 */
const PIXEL = "'Press Start 2P', ui-monospace, monospace"
/** How long a landed struggle press keeps the beam bright. Matches `abduction`. */
const A_JOLT = 0.16

export function render(g: Game) {
  const ctx = g.ctx
  const cam = g.camera

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#0d0f10'
  ctx.fillRect(0, 0, g.canvas.width, g.canvas.height)

  /*
   * The hour of the day, resolved once and used twice: here for the shadows,
   * and again by `drawDaylight` after everything is on screen.
   */
  const sky = skyAt(timeOfDay(g.player.reach))
  const indoors = g.act3.phase !== 'outside'
  sunLen = indoors ? 0.06 : sky.len
  sunDark = indoors ? 0.26 : sky.shadow

  cam.apply(ctx)

  const viewX = cam.x - cam.viewW / 2
  const viewY = cam.y - cam.viewH / 2

  // 1. Ground, road and scenery — pre-baked, a handful of blits.
  g.chunks.draw(ctx, viewX - 8, viewY - 8, cam.viewW + 16, cam.viewH + 16)

  // 1b. Indoors. Painted over the flagstones, under everything alive.
  if (g.act3.phase !== 'outside') drawInterior(g, ctx)

  // 2. Arena barrier.
  if (g.arenaLocked) drawArena(g, ctx, g.time)

  // 3. Rain and mushrooms sit ON the ground, under everything that walks.
  drawStorms(g, ctx)
  drawRain(g, ctx)

  // 3b. Blood, splashes and floor rings: over the ground, under the bodies.
  drawFx(g, ctx, true)

  // 3c. The light the mothership is dragging along the road. On the ground,
  // under everything standing in it — including him.
  drawBeamGround(g, ctx)

  // 3d. Anvil shadows, and anvils that have already landed.
  drawAnvilGround(g, ctx)

  // 3e. The ring going out from a man who just got back up.
  drawReviveWave(g, ctx)

  // 4. Loot on the ground.
  drawPickups(g, ctx)

  // 4. Bodies, sorted back-to-front so the 3/4 view reads correctly.
  drawActors(g, ctx)

  // 4b. Explosions and anything else that happens in the air.
  drawFx(g, ctx, false)

  // 4c. Soul, coming down out of the light. Only during the ending.
  if (g.phase === 'ending') drawEndingWorld(g, ctx)

  // 5. Projectiles and ordnance sit above everyone.
  drawBombs(g, ctx)
  drawBullets(g, ctx)
  drawReticle(g, ctx)

  // 5. The tapes, among the actors so they can be walked behind.
  drawTapes(g, ctx)

  // 5a. The rebimbocas, over the fight but under the reticle.
  drawOrbs(g, ctx)

  // 5a2. And the thing casting it, three hundred units up. Above the bullets
  // because there is nothing in this game that flies higher than it.
  drawNave(g, ctx)

  drawCobson(g, ctx)
  drawQueima(g, ctx)
  drawStarPull(g, ctx)
  drawFlyingShields(g, ctx)

  // 5b. The way to Floriano — but not during the opening, where it is the one
  // thing on screen that belongs to a player who does not have the stick yet.
  if (!g.cine) drawGuide(g, ctx)

  // 6. Damage numbers, then whatever he is saying about all this.
  drawFloaters(g, ctx)
  drawBark(g, ctx)

  // 7. Screen-space: the hour of the day first, then the rest of the overlay.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  drawDaylight(g, ctx)
  // 7a2. Air bending over the fire. Must come after the world is finished:
  // it re-reads the frame. See `drawHeat`.
  drawHeat(g, ctx)
  drawScreenFx(g, ctx)

  // 7b2. REVIVA whites the screen out. Above the world, under the HUD, so
  // the health bar is the first thing readable again as it clears.
  drawReviveFlash(g, ctx)

  // 7c. The cut into a run, lifting.
  if (g.veil > 0) {
    // Squared, so it holds black for a moment and then opens quickly — a
    // linear fade from full black reads as a slow grey wipe.
    ctx.fillStyle = 'rgba(4,5,7,' + (g.veil * g.veil).toFixed(3) + ')'
    ctx.fillRect(0, 0, g.canvas.width, g.canvas.height)
  }

  // 7c1. THE CONTROLS ARE BACKWARDS, and the screen had better say so.
  if (g.player.invertT > 0) drawInverted(g, ctx)

  // 7c2. AND THE COLOUR GOING OUT OF IT.
  if (g.phase === 'downed') drawDowned(g, ctx)

  // 7d. The first thing anybody sees, over the top of the black lifting.
  if (g.cine) drawOpening(g, ctx)

  // 8. And the last thing anybody sees.
  if (g.phase === 'ending') drawEndingScreen(g, ctx)
}

/**
 * THE COLOUR GOING OUT OF THE WORLD.
 *
 * One `fillRect` in `saturation` blend mode with a grey source: that mode
 * keeps the hue and the brightness of everything underneath and takes only the
 * SATURATION from what is drawn, so a flat grey pushes the whole frame to
 * zero saturation. It is a true desaturation of the finished picture rather
 * than a grey wash laid over it — the difference being that a wash flattens
 * the contrast and this does not touch it, so the world is still perfectly
 * readable, it has simply stopped having colour in it.
 *
 * Ramped over the first three quarters of a second so the drain is something
 * the player watches happen, and darkened slightly underneath so the button
 * that arrives after it has somewhere to sit.
 */
/**
 * THE STICK IS BACKWARDS, said as loudly as it can be said.
 *
 * This is the one status in the game the player cannot work out from the
 * world: everything else announces itself by hurting, and an estagiário does
 * nothing at all except make the next four seconds feel broken. If the screen
 * does not say it, the player concludes the GAME is broken, which is a much
 * worse thing for them to conclude.
 *
 * A blue vignette, two arrows pointing the wrong way, and a bar that runs out
 * — so it reads as a state with an end rather than as a fault. The vignette
 * flashes hard for the first fraction of a second and then settles, because
 * the moment it needs to be unmissable is the moment it starts.
 */
function drawInverted(g: Game, ctx: CanvasRenderingContext2D) {
  const W = g.canvas.width
  const H = g.canvas.height
  const left = g.player.invertT
  const total = CONFIG.INVERT.seconds
  // 1 the instant it lands, 0 as it wears off.
  const k = Math.max(0, Math.min(1, left / total))
  const onset = Math.min(1, (total - left) / 0.25)

  ctx.save()
  const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.62)
  grd.addColorStop(0, 'rgba(0,0,0,0)')
  grd.addColorStop(1, 'rgba(50,70,180,' + (0.2 + k * 0.28 + (1 - onset) * 0.3).toFixed(3) + ')')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, W, H)

  const size = Math.max(8, Math.round(Math.min(W, H) * 0.028))
  ctx.font = size + 'px ' + PIXEL
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = 0.55 + Math.sin(g.time * 8) * 0.25
  ctx.fillStyle = '#000'
  ctx.fillText('→  CONTROLES INVERTIDOS  ←', W / 2 + 2, H * 0.17 + 2)
  ctx.fillStyle = '#aebfff'
  ctx.fillText('→  CONTROLES INVERTIDOS  ←', W / 2, H * 0.17)

  // The clock, so it is visibly temporary.
  ctx.globalAlpha = 0.8
  const bw = Math.round(W * 0.18)
  const bx = Math.round(W / 2 - bw / 2)
  const by = Math.round(H * 0.17 + size * 1.2)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(bx - 1, by - 1, bw + 2, 5)
  ctx.fillStyle = '#8ea8ff'
  ctx.fillRect(bx, by, Math.round(bw * k), 3)
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function drawDowned(g: Game, ctx: CanvasRenderingContext2D) {
  const W = g.canvas.width
  const H = g.canvas.height
  const k = Math.min(1, g.player.downedT / CONFIG.REVIVE.prompt)

  ctx.save()
  ctx.globalCompositeOperation = 'saturation'
  ctx.globalAlpha = k
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, W, H)
  ctx.restore()

  /*
   * AND ONE THING THAT IS STILL RED.
   *
   * A vignette in the blood's own colour, breathing slowly. Everything else on
   * the screen has had the colour taken out of it, so this is the only hue
   * left in the frame and the eye goes straight to it — which is the whole
   * job, because it is what says the grey is a state and not a bug.
   */
  const beat = 0.5 + Math.sin(g.player.downedT * 2.4) * 0.5
  const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.62)
  grd.addColorStop(0, 'rgba(0,0,0,0)')
  grd.addColorStop(1, 'rgba(78,8,10,' + (k * (0.5 + beat * 0.18)).toFixed(3) + ')')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, W, H)
}

/**
 * THE LETTERBOX, AND WHAT HE IS SAYING INSIDE IT.
 *
 * Two bars and a subtitle, in screen space, drawn per frame rather than pushed
 * through the snapshot — the bars slide in over three quarters of a second and
 * the fifteen-hertz HUD channel would have delivered that as eleven steps.
 *
 * THE BARS ARE NOT DECORATION. They are the contract: while they are down the
 * player is watching, and when they leave the game is theirs. So they are the
 * last thing composited, over the veil and over the daylight, at full black —
 * a letterbox that the hour of the day tints is a letterbox that reads as part
 * of the world, and this one is deliberately not.
 */
function drawOpening(g: Game, ctx: CanvasRenderingContext2D) {
  const c = g.cine
  if (!c) return
  const W = g.canvas.width
  const H = g.canvas.height
  const bar = Math.round(H * 0.13 * c.bars)

  if (bar > 0) {
    ctx.save()
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, bar)
    ctx.fillRect(0, H - bar, W, bar)
    /*
     * A HAIRLINE OF LIGHT on the inside edge of each bar.
     *
     * Pure black against a dark frame has no edge at all — the bars simply eat
     * the picture and it reads as the canvas being the wrong size. One line at
     * four per cent is enough to say that something has been placed OVER the
     * image, which is the entire difference between a letterbox and a bug.
     */
    ctx.fillStyle = 'rgba(244,236,216,0.16)'
    ctx.fillRect(0, bar - 1, W, 1)
    ctx.fillRect(0, H - bar, W, 1)
    ctx.restore()
  }

  if (c.line < 0) return
  const full = OPENING_LINES[c.line]
  if (!full) return

  /*
   * TYPED, AND CUT ON A CHARACTER RATHER THAN FADED.
   *
   * The cursor is a block that blinks while the line finishes arriving and
   * disappears once it has — a terminal's punctuation, which is the right
   * register for a man who narrates his own life like there is a group chat
   * watching.
   */
  const shown = full.slice(0, Math.max(1, Math.round(full.length * c.type)))
  const typing = c.type < 1

  const size = Math.max(7, Math.round(Math.min(W, H) * 0.021))
  ctx.save()
  ctx.font = size + 'px ' + PIXEL
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Sat just inside the lower bar, which is where a subtitle belongs and also
  // the one band of the frame guaranteed to have nothing happening in it.
  const y = H - bar - size * 2.4
  // Faded with the bars, so a skip takes the words out with the frame rather
  // than leaving a line hanging over live gameplay.
  ctx.globalAlpha = Math.min(1, c.bars * 1.4)

  const text = shown + (typing && Math.floor(c.t * 6) % 2 === 0 ? '_' : '')
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  ctx.fillText(text, W / 2 + 2, y + 2)
  ctx.fillStyle = '#f2ead6'
  ctx.fillText(text, W / 2, y)

  /*
   * AND THE WAY OUT, once the first line has had its moment.
   *
   * Dim, small, in the bar rather than in the picture: a skip prompt that
   * competes with the line it is offering to skip has misread the room.
   */
  if (c.t > 2 && !c.rushed) {
    ctx.globalAlpha = 0.34 * c.bars
    ctx.font = Math.round(size * 0.62) + 'px ' + PIXEL
    ctx.fillStyle = '#cbc2a8'
    // Naming the key, now that it is one key. "Any key" was a promise the
    // scene no longer keeps — and keeping it was what let WASD cancel it.
    ctx.fillText(g.input.touch ? 'TOQUE PRA PULAR' : 'E PRA PULAR', W / 2, H - bar / 2)
  }
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// ------------------------------------------------------------------ ACTORS --

/**
 * Everything that stands on the ground, drawn back to front.
 *
 * Props are in this pass rather than baked into the chunk, which is what makes
 * a building something you can walk BEHIND. Sorting by foot Y puts a house in
 * front of anyone standing further up the screen than it and behind anyone
 * standing lower, which is the whole of the 3/4 illusion.
 *
 * The query reaches well past the view because a prop is drawn upward from its
 * foot: a house whose base is below the bottom of the screen still has its
 * roof on it.
 */
function drawActors(g: Game, ctx: CanvasRenderingContext2D) {
  const enemies = g.enemies.items
  order.length = enemies.length
  for (let i = 0; i < enemies.length; i++) order[i] = i
  order.sort((a, b) => enemies[a].y - enemies[b].y)

  const cam = g.camera
  const pad = 220
  g.chunks.props.query(
    cam.x - cam.viewW / 2 - pad, cam.y - cam.viewH / 2 - pad,
    cam.x + cam.viewW / 2 + pad, cam.y + cam.viewH / 2 + pad,
    propBuf,
  )
  /*
   * Scenery the generator did not make. There is currently exactly one — the
   * empty mecha — and it is appended after the query rather than living in a
   * chunk because its position comes from the script, not from the seed.
   */
  for (let i = 0; i < g.extraProps.length; i++) propBuf.push(g.extraProps[i])
  propBuf.sort((a, b) => a.y - b.y)

  const py = g.player.y
  let drewPlayer = false
  let h = 0
  let pr = 0
  const helpers = g.helpers.items.slice().sort((a, b) => a.y - b.y)

  const flushProps = (untilY: number) => {
    while (pr < propBuf.length && propBuf[pr].y <= untilY) drawProp(g, ctx, propBuf[pr++])
  }

  for (let n = 0; n < order.length; n++) {
    const e = enemies[order[n]]
    flushProps(e.y)
    while (h < helpers.length && helpers[h].y <= e.y) drawHelper(g, ctx, helpers[h++])
    if (!drewPlayer && e.y > py) { flushProps(py); drawPlayer(g, ctx); drewPlayer = true }
    drawEnemy(g, ctx, e)
  }
  while (h < helpers.length) drawHelper(g, ctx, helpers[h++])
  if (!drewPlayer) { flushProps(py); drawPlayer(g, ctx) }
  flushProps(Infinity)
}

const propBuf: Prop[] = []

function drawProp(g: Game, ctx: CanvasRenderingContext2D, p: Prop) {
  const img = g.assets.icon(p.icon)
  if (!img || !img.width) return
  // A soft contact shadow so nothing looks pasted on top of the ground.
  if (p.solidW > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.ellipse(p.x, p.y, p.w * 0.34, p.w * 0.11, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.drawImage(img, Math.round(p.x - p.w / 2), Math.round(p.y - p.h), p.w, p.h)
}

/**
 * A LOOPING SHEET, pinned to something alive.
 *
 * These never go through the effect pool, and that is a rule rather than an
 * optimisation. A pooled effect that tracked an enemy would have to hold a
 * reference into a dense pool with swap-remove, and the object it was holding
 * is handed straight to the next thing that spawns the moment its owner dies —
 * the same trap that made three destroyed pillars report as standing. Anything
 * that belongs to a body is drawn by whatever draws that body, off the world
 * clock, and stops existing when the body does.
 *
 * `seed` offsets the phase so a row of the same thing is not in lockstep.
 */
function loopFx(
  g: Game, ctx: CanvasRenderingContext2D, key: string,
  x: number, y: number, scale = 1, seed = 0, alpha = 1,
) {
  const fx = g.assets.effect(key)
  if (!fx) return false
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  drawEffect(ctx, fx, x, y, g.time + seed * 3.7, scale, 0, alpha)
  ctx.restore()
  return true
}

/*
 * WHERE THE SUN IS, this frame.
 *
 * Module state rather than a parameter because `shadow` is called from five
 * places and threading the sky through all of them to move one ellipse would
 * be a worse trade than a variable the render pass sets once.
 */
let sunLen = 0.08
let sunDark = 0.3

/**
 * The pool under a body, thrown away from the sun.
 *
 * At noon it is a tight dark disc directly underfoot. As the afternoon goes it
 * slides out ahead of him and stretches — the same ellipse, offset and scaled
 * along a fixed sun direction, which is four numbers and reads as an entire
 * time of day. At night it is barely there, because at night nothing is
 * casting one except a lamp post.
 */
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number) {
  ctx.fillStyle = 'rgba(0,0,0,' + sunDark.toFixed(3) + ')'
  ctx.beginPath()
  ctx.ellipse(
    x + SUN_X * sunLen * rx * 1.5,
    y + SUN_Y * sunLen * rx * 0.62,
    rx * (1 + sunLen * 0.75), rx * 0.42,
    0, 0, Math.PI * 2,
  )
  ctx.fill()
}

/**
 * THE SHADOW OF THE THING ITSELF, rather than an oval underneath it.
 *
 * A man, a cow and a mothership were all standing on the same ellipse, which
 * is the sort of detail nobody notices until they do and then cannot stop
 * noticing. This lays the sprite's own silhouette on the floor instead.
 *
 * IT IS A FLOOR PROJECTION, not a mirror. The sprite is drawn upright from its
 * feet; the shadow is that same shape squashed toward the ground and sheared
 * along it, away from the sun and by however long the sun says shadows are.
 * Both numbers come from the same place the ellipse's did, so a shadow still
 * shortens at noon, rakes across the road at sunset and nearly vanishes at
 * night — it just has a head now.
 *
 * Falls back to the ellipse whenever there is no sheet, which is what the
 * props, the pickups and anything still awaiting art are drawing.
 */
function castShadow(
  ctx: CanvasRenderingContext2D, sheet: Sheet, frame: number,
  x: number, y: number, flip: boolean, scale = 1,
) {
  if (!sheet.ok) return
  const f = ((frame % sheet.frames) + sheet.frames) % sheet.frames
  const w = sheet.fw * scale
  const h = sheet.fh * scale

  /*
   * The transform, read bottom-up: stand at the feet, lean the top of the
   * shape toward where the sun is not, flatten it onto the ground, and draw
   * the silhouette from there. `0.34` is the flattest a shape can go and still
   * be recognisable as the thing above it; the rest of the squash comes from
   * how high the sun is.
   */
  const lean = SUN_X * sunLen * 1.35
  const squash = 0.34 + sunLen * 0.26

  ctx.save()
  ctx.globalAlpha = sunDark
  ctx.translate(x, y)
  ctx.transform(1, 0, lean, squash, 0, 0)
  ctx.drawImage(
    flip ? sheet.darkFlipped : sheet.dark,
    f * sheet.fw, 0, sheet.fw, sheet.fh,
    Math.round(-w / 2), Math.round(-h), w, h,
  )
  ctx.restore()

  /*
   * AND NOTHING UNDER THE FEET.
   *
   * There was a second, darker ellipse here — a "contact patch" — sitting
   * directly under every body on top of its own cast shape. It was written
   * when the silhouette was still the new thing and nobody trusted it yet, and
   * it is precisely the blob the silhouette was meant to have replaced: every
   * character stood on a dark ball with their own shape lying beside it.
   *
   * The silhouette is the shadow now. If a body ever stops reading as planted
   * on the ground, the answer is `sunDark` — how dark the shape it actually
   * casts is — and not another oval.
   */
}

/**
 * Draws one frame of a strip, anchored at the feet.
 * The flipped copy is pre-rendered at load time — mirroring with save/scale/
 * restore per sprite costs a full context state change 700 times a frame.
 */
function drawSheet(
  ctx: CanvasRenderingContext2D, sheet: Sheet,
  frame: number, x: number, y: number, flip: boolean,
  scale = 1, white = false,
) {
  const f = ((frame % sheet.frames) + sheet.frames) % sheet.frames
  const src = white
    ? (flip ? sheet.whiteFlipped : sheet.white)
    : (flip ? sheet.flipped : sheet.img)
  const w = Math.round(sheet.fw * scale)
  const h = Math.round(sheet.fh * scale)
  ctx.drawImage(
    src,
    f * sheet.fw, 0, sheet.fw, sheet.fh,
    Math.round(x - w / 2), Math.round(y - h),
    w, h,
  )
}

/**
 * THE HIT.
 *
 * Three things at once, because one is not enough to read at this sprite size:
 * the body flashes solid white, it pops a little larger for a couple of frames,
 * and a few sparks kick out. All of it is driven off the same `flash` timer, so
 * it costs nothing to track and lands on the frame the damage does.
 */
function drawHitFlash(
  ctx: CanvasRenderingContext2D, sheet: Sheet, frame: number,
  x: number, y: number, flip: boolean, flash: number, scale: number,
) {
  const t = Math.min(1, flash / HIT_FLASH_TIME)
  // A brief swell, strongest at the moment of impact.
  const pop = 1 + t * 0.16
  ctx.globalAlpha = Math.min(1, t * 1.6)
  drawSheet(ctx, sheet, frame, x, y, flip, scale * pop, true)
  ctx.globalAlpha = 1
}

/** Sparks off an impact. Deterministic per body, so they do not crawl. */
/**
 * THE SPARKS OFF A HIT.
 *
 * Driven off the enemy's own flash timer rather than the effect pool: a busy
 * second in act two is several hundred connecting rounds, and a pool that size
 * would spend more time being swept than the sparks spend on screen. The
 * timer already exists, already counts down, and already means "this was hit a
 * moment ago", which is exactly the question being asked.
 */
function drawHitSparks(
  g: Game, ctx: CanvasRenderingContext2D,
  x: number, y: number, seed: number, flash: number,
) {
  const fx = g.assets.effect('spark')
  if (!fx) return
  // Played backwards from the flash timer: `flash` counts DOWN from
  // HIT_FLASH_TIME, so the elapsed time is what is left subtracted from it.
  const t = Math.max(0, HIT_FLASH_TIME - flash)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  drawEffect(ctx, fx, x, y, t * 0.55, 0.7 + (seed % 0.4), 0, 0.9)
  ctx.restore()
}

/** How long a hit reads for. Set alongside HIT_FLASH in Game.ts. */
const HIT_FLASH_TIME = 0.14

function drawPlayer(g: Game, ctx: CanvasRenderingContext2D) {
  const p = g.player

  /*
   * NOTHING, while he is on the floor.
   *
   * He burst. Drawing the sprite standing in the middle of his own blood
   * would say he is fine and waiting, which is the opposite of what the phase
   * is for — the empty patch of ground is the picture. He comes back on the
   * frame `standUp` runs.
   */
  if (g.phase === 'downed') return

  /*
   * AFTERIMAGES, drawn before him so he is always on top of his own trail.
   *
   * These are the whole reason a dash feels like a movement instead of a
   * teleport-by-accident: without a streak the eye gets a sprite at A and a
   * sprite at B and fills in nothing at all.
   */
  if (p.ghosts.length > 0) {
    const sheet = g.assets.sheet('player_gun_walk') ?? g.assets.sheet('player_idle')
    if (sheet) {
      for (const gh of p.ghosts) {
        const k = 1 - gh.t / gh.life
        ctx.globalAlpha = k * 0.5
        drawSheet(ctx, sheet, 0, gh.x, gh.y + CONFIG.PLAYER.footOffset, gh.flip)
      }
      ctx.globalAlpha = 1
    }
  }

  // Teleporte: a ghost of where he left from, so the jump reads as a jump.
  if (p.blinkFrom) {
    const sheet = g.assets.sheet('player_idle')
    if (sheet) {
      ctx.globalAlpha = Math.max(0, p.blinkFrom.t / 0.22) * 0.45
      drawSheet(ctx, sheet, 0, p.blinkFrom.x, p.blinkFrom.y + CONFIG.PLAYER.footOffset, p.facing < 0)
      ctx.globalAlpha = 1
    }
  }

  /*
   * GETTING UP, and therefore NOT blinking.
   *
   * The invulnerability blink is right for the second after a hit and wrong
   * for the one moment the player is supposed to be looking straight at him:
   * three seconds of i-frames would have flickered him out of existence for
   * half of his own revival. While `reviveT` runs he is solid, lit, and
   * rising.
   */
  if (p.reviveT <= 0 && p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0) return

  const moving = Math.abs(p.vx) + Math.abs(p.vy) > 6
  const key = p.shootAnim > 0 ? 'player_gun_shoot' : moving ? 'player_gun_walk' : 'player_idle'
  const sheet = g.assets.sheet(key) ?? g.assets.sheet('player_idle')

  /*
   * HIS OWN SHAPE ON THE GROUND. Cast from the frame he is actually on, so it
   * walks when he walks — and always from his real position, even while the
   * ship has him thirty units in the air.
   */
  if (sheet) {
    castShadow(
      ctx, sheet, sheet.fps > 0 ? Math.floor(p.anim * sheet.fps) : 0,
      p.x, p.y + CONFIG.PLAYER.footOffset, p.facing < 0,
    )
  } else {
    shadow(ctx, p.x, p.y, 8)
  }

  /*
   * OFF THE GROUND.
   *
   * His shadow stays where it is — drawn above, at his real position — so the
   * rise reads as him leaving it rather than as the whole character sliding up
   * the screen. It is also the clock: how high he is IS how little time is
   * left on the struggle.
   */
  const lift = p.abducted ? g.abduct.lift : 0

  /*
   * The glow he comes back with. Under the sprite, so it reads as light coming
   * off him rather than as a bubble round him, and it goes out over the whole
   * sequence.
   */
  if (p.reviveT > 0) {
    const rk = p.reviveT / CONFIG.REVIVE.time
    const rr = 26 + (1 - rk) * 16
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const grd = ctx.createRadialGradient(p.x, p.y - 14, 0, p.x, p.y - 14, rr)
    grd.addColorStop(0, 'rgba(200,255,215,' + (0.75 * rk).toFixed(3) + ')')
    grd.addColorStop(1, 'rgba(120,240,160,0)')
    ctx.fillStyle = grd
    ctx.fillRect(p.x - rr, p.y - 14 - rr, rr * 2, rr * 2)
    ctx.restore()
  }

  // Privacidade: he is still there, you can just barely see him.
  if (p.invisible > 0) ctx.globalAlpha = 0.28

  if (!sheet) {
    ctx.fillStyle = '#2f7a3a'
    ctx.fillRect(Math.round(p.x - 8), Math.round(p.y - 26), 16, 26)
  } else {
    const frame = sheet.fps > 0 ? Math.floor(p.anim * sheet.fps) : 0
    ctx.save()
    // Kicking. He is not going quietly.
    if (lift > 0) {
      ctx.translate(p.x, p.y - lift)
      ctx.rotate(Math.sin(g.time * 17) * 0.16)
      ctx.translate(-p.x, -(p.y - lift))
    }
    drawSheet(ctx, sheet, frame, p.x, p.y - lift + CONFIG.PLAYER.footOffset, p.facing < 0)

    /*
     * AND HE IS ON FIRE, which the sprite has no idea about.
     *
     * The whole ability is a man burning, and until this the man was the one
     * thing in the picture that was not: a normal green sprite standing in the
     * middle of an inferno, which reads as him operating a fire rather than
     * being one.
     *
     * His own silhouette, filled hot, laid over him additively and pulsed on
     * the same clock the ring breathes on. Same trick the hit flash uses —
     * see `hotCopy` — so it costs one blit and follows every frame of the
     * walk cycle for free.
     */
    if (p.burning) {
      const hot = hotCopy(sheet)
      if (hot) {
        const f = ((frame % sheet.frames) + sheet.frames) % sheet.frames
        const fy = p.y - lift + CONFIG.PLAYER.footOffset
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        /*
         * HE GETS HOTTER WITH THE METER, and flickers faster doing it.
         *
         * A fixed glow made the man look the same at a fifth of a second in as
         * at three seconds in, which is the one moment the ability most needs
         * to be read off him rather than off the ground: he is the thing the
         * player is watching, and by the top he should look like he is about
         * to come apart.
         */
        const hk = p.burnHeat
        ctx.globalAlpha = 0.2 + hk * 0.34 + Math.sin(g.time * (7 + hk * 9)) * (0.1 + hk * 0.12)
        ctx.drawImage(
          p.facing < 0 ? hot.flipped : hot.plain,
          f * sheet.fw, 0, sheet.fw, sheet.fh,
          Math.round(p.x - sheet.fw / 2), Math.round(fy - sheet.fh), sheet.fw, sheet.fh,
        )
        ctx.restore()
      }
    }

    ctx.restore()
  }
  ctx.globalAlpha = 1

  /*
   * CHAPÉU-BONITO. Sitting on his head, or away on a lap.
   *
   * Drawn from the card's own icon rather than a second sprite: it is a hat,
   * the card already has a picture of one, and a thirty-two pixel icon at this
   * scale is exactly the size a hat on a twenty-two pixel man should be.
   *
   * Position comes from `hatAt`, which is the same function the damage test
   * uses — see `systems/abilities`. Everything here is what that position
   * LOOKS like: the roll, the size, and the echoes strung out behind it.
   */
  if (p.abilities.chapeu.stacks > 0) {
    const hat = g.assets.icon('up_chapeu')
    const stacks = p.abilities.chapeu.stacks
    const hats = at(ABILITIES.chapeu.hats, stacks)
    if (hat) for (let n = 0; n < hats; n++) {
      // Evenly spaced around the same orbit. Must match the hit test.
      const phase = (n / hats) * Math.PI * 2
      const h = hatAt(p, stacks, phase)
      /*
       * THE TRAIL, and it is the whole of the flair.
       *
       * Four echoes at earlier points on the same orbit, fading and shrinking
       * behind it. A single spinning sprite crossing fifty units in a third of
       * a second reads as a stutter; a streak reads as a thrown object, which
       * is what it is. Faded out by `k` so nothing at all is drawn while the
       * hat is sitting on his head.
       */
      if (h.k > 0.12) {
        for (let i = 4; i >= 1; i--) {
          const back = { ...p, hatSpin: p.hatSpin - i * 0.15 }
          const e = hatAt(back as typeof p, stacks, phase)
          const a = (1 - i / 5) * 0.42 * h.k
          const es = (12 + 4 * h.k) * (1 - i * 0.09)
          ctx.save()
          ctx.globalAlpha = a
          ctx.translate(e.x, e.y)
          ctx.rotate(e.roll)
          ctx.drawImage(hat, Math.round(-es / 2), Math.round(-es / 2), es, es)
          ctx.restore()
        }
      }

      /*
       * And the hat. It grows a little on the way out — it is nearer the
       * camera than his head is — and it lands flat, because `roll` is scaled
       * by `k` and `k` is zero the moment it is home.
       */
      const size = 14 + 5 * h.k
      ctx.save()
      ctx.translate(h.x, h.y)
      ctx.rotate(h.roll)
      ctx.drawImage(hat, Math.round(-size / 2), Math.round(-size / 2), size, size)
      ctx.restore()
    }
  }

  /*
   * ESCUDO ALIEN. Orbiting sparks rather than a stroked ring, so a shield that
   * is UP looks like something running rather than something parked.
   */
  if (p.shield > 0 && !loopFx(g, ctx, 'shield', p.x, p.y - 13, 0.82, 0, 0.8)) {
    const t = g.time * 9
    ctx.strokeStyle = 'rgba(143,212,255,0.9)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(p.x, p.y - 13, 20, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(p.x, p.y - 13, 20, t, t + 1.5); ctx.stroke()
  }
}

/**
 * O HOMÚNCULO. Drawn with a health bar because it is a thing you own and will
 * watch die, and a faint ring showing how far its pull reaches.
 */
/** Drawn smaller than a person — it is a helper, not a second protagonist. */
const HELPER_SCALE = 0.72

function drawHelper(g: Game, ctx: CanvasRenderingContext2D, h: Helper) {

  /*
   * The pull radius is shown only for the first couple of seconds after it
   * appears. Drawn permanently it is a 150-unit ellipse per homúnculo — with
   * three out that is most of the screen under rings, and the thing it is
   * meant to teach is learned in one look anyway.
   */
  if (h.age < 2.2) {
    const fade = h.age < 0.3 ? h.age / 0.3 : 1 - (h.age - 0.3) / 1.9
    const r = ABILITIES.homunculo.aggroRadius
    ctx.strokeStyle = 'rgba(201,160,255,' + (0.30 * Math.max(0, fade)).toFixed(3) + ')'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(h.x, h.y, r, r * 0.42, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  const sheet = g.assets.sheet('homunculo')
  if (sheet) {
    castShadow(
      ctx, sheet, sheet.fps > 0 ? Math.floor(h.anim * sheet.fps) : 0,
      h.x, h.y, h.flip, HELPER_SCALE,
    )
    const frame = sheet.fps > 0 ? Math.floor(h.anim * sheet.fps) : 0
    drawSheet(ctx, sheet, frame, h.x, h.y, h.flip, HELPER_SCALE)
    if (h.flash > 0) {
      drawHitFlash(ctx, sheet, frame, h.x, h.y, h.flip, h.flash, HELPER_SCALE)
      drawHitSparks(g, ctx, h.x, h.y - sheet.fh * HELPER_SCALE * 0.5, h.slot * 0.37, h.flash)
    }
    /*
     * AND THE SWING, which is new and needed to be SEEN.
     *
     * They hit things now instead of only being hit, and an attack with no
     * picture is an attack the player never learns they have — six little men
     * silently chipping at a crowd reads exactly like six little men doing
     * nothing. An arc thrown out on the side it struck, gone in a fifth of a
     * second.
     */
    if (h.swing > 0) {
      const k = h.swing / 0.18
      const dir = h.flip ? -1 : 1
      ctx.save()
      ctx.globalAlpha = k * 0.85
      ctx.strokeStyle = '#efe4c4'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(h.x + dir * 5, h.y - 9, 13, dir > 0 ? -0.9 : Math.PI + 0.9,
        dir > 0 ? 0.9 : Math.PI - 0.9, dir < 0)
      ctx.stroke()
      ctx.restore()
    }
  } else {
    ctx.fillStyle = '#d8cdb4'
    ctx.beginPath(); ctx.ellipse(h.x, h.y - 7, 5, 7, 0, 0, Math.PI * 2); ctx.fill()
  }

  if (h.hp < h.maxHp) {
    const w = 16
    const y = h.y - 25
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(h.x - w / 2 - 1, y - 1, w + 2, 4)
    ctx.fillStyle = '#d94f4f'
    ctx.fillRect(h.x - w / 2, y, w * (h.hp / h.maxHp), 2)
  }
}

/**
 * HOW BRIGHT A THING'S OWN LIGHT IS, THIS FRAME.
 *
 * Most emitters are steady — a Glowie glows, a window is lit, and neither has
 * any business twitching. The rocket is the exception and it earns it twice
 * over:
 *
 *   ON THE WAY IN, the light stutters like a lit fuse in the wind. It is a
 *   thing burning toward you, and by act two it is doing that in the dark, so
 *   the flicker is often the only part of it visible before the sprite is.
 *
 *   ONCE ARMED, it turns into a strobe that accelerates with the fuse — the
 *   same countdown the ground ring and the sprite flash run off, so all three
 *   panic together and the room lights up with it.
 *
 * Deliberately NOT random per frame. A light randomised every frame reads as a
 * rendering fault; two sine waves at prime-ish rates read as a flame, and they
 * are the same three multiplications.
 */
function emitPulse(g: Game, e: Enemy): number {
  if (e.def.id !== 'rocket') return 1
  const det = e.def.detonates
  if (e.fuse > 0 && det) {
    // 0 the instant it armed, 1 on the frame it goes off.
    const k = Math.max(0, Math.min(1, 1 - e.fuse / det.fuse))
    const rate = 8 + k * 34
    // A hard square strobe rather than a wave: this is an alarm, not a flame.
    return Math.floor(e.fuse * rate) % 2 === 0 ? 1.9 + k : 0.28
  }
  const t = g.time * 13 + e.seed * 31
  return 0.68 + Math.sin(t) * 0.2 + Math.sin(t * 2.7) * 0.12
}

function drawEnemy(g: Game, ctx: CanvasRenderingContext2D, e: Enemy) {
  /*
   * A BURROWED MINHOCA IS HER OWN FIRST FRAME.
   *
   * The sheet is a rise — barely out, half out, fully up — so the frame the
   * artist drew for “just breaking the surface” is exactly the walking state,
   * and there is no reason to invent a mound of dirt next to art that already
   * says it. Frame 0, held, while she crosses ground.
   *
   * Drawn here and returned from, ahead of every other layer, because none of
   * the rest of this function applies to something that cannot be hit: no hit
   * flash, no health bar, no execute mark.
   */
  if (e.def.behavior === 'burrow' && e.depth <= 0.5) { drawBurrowed(g, ctx, e); return }

  // A wounded body reads faster than a health bar. `broken` is an explicit
  // state now, set by the first hit, not a health ratio.
  const hurt = e.def.sheetHurt && e.broken
  // Species drawn in several colours pick theirs at spawn and keep it.
  const base = e.def.sheets ? e.def.sheets[e.variant % e.def.sheets.length] : e.def.sheet
  // Anything that wakes up has a second sheet for being awake — the rocket
  // idle and the rocket under power should not look like the same object.
  const live = e.awake && e.def.sheetActive ? e.def.sheetActive : base
  const key = hurt ? e.def.sheetHurt : live
  const sheet = key ? g.assets.sheet(key) : undefined

  // Flyers are lifted off their own shadow, which stays on the ground.
  const lift = e.def.hover
    ? e.def.hover + Math.sin(g.time * 3 + e.seed * 6.283) * 2.5
    : 0

  /*
   * ONE OF THE BIG ONES IS SIMPLY BIGGER.
   *
   * No crown, no outline, no colour it does not already have. The species is
   * the same species and it should be recognised as one — what the player is
   * supposed to notice is that this particular vaca is the size of a car and
   * did not fall over when it was shot, and that reads best with no badge on
   * it at all.
   */
  const big = e.buffed ? CONFIG.MINIBOSS.scale : 1

  if (sheet) {
    const frame = sheet.fps > 0 ? Math.floor(e.anim * sheet.fps) : 0
    // The shadow stays on the ground even when the body is hovering above it,
    // which is what tells you a Coisa Voadora is flying.
    castShadow(ctx, sheet, frame, e.x, e.y, e.flip, big)

    /*
     * AND THE BEHOLDER LITERALLY SPINS.
     *
     * His whole gimmick is that the contracts come out of wherever he happens
     * to be pointing, so the sprite is turned by the SAME `phase` the AI fires
     * from — see `updateBeholder`. The player is not being asked to infer a
     * rotation from the bullets; the rotation is the thing they are looking at
     * and the bullets follow it.
     *
     * Rotated about his middle rather than his feet, because he floats.
     */
    if (e.def.id === 'beholder') {
      const cy3 = e.y - lift - (e.def.size ?? 44) * 0.5
      /*
       * HE IS GATHERING HIMSELF, and the player has to be able to see it.
       *
       * `burstCd` is how long the AI has until it flips to the fast half; it
       * holds fire for the last `BEHOLDER_WINDUP` of that. Reading the same
       * number here is what keeps the tell and the thing it tells about from
       * drifting apart when either is tuned.
       *
       * A ring closing on him, brightening as it arrives. Closing rather than
       * expanding on purpose: everything else in this game that grows outward
       * is a blast, and this is the opposite — a thing winding IN before it
       * lets go.
       */
      const wind = e.burstCd < BEHOLDER_WINDUP && e.burstCd > 0
        ? 1 - e.burstCd / BEHOLDER_WINDUP : 0
      if (wind > 0) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.25 + wind * 0.6
        ctx.strokeStyle = '#9fd0ff'
        ctx.lineWidth = 1.5 + wind * 2.5
        ctx.beginPath()
        const rr = 150 - wind * 96
        ctx.ellipse(e.x, cy3, rr, rr * 0.55, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      /*
       * AND THE SPIN IS SMEARED while he is going fast.
       *
       * Three ghosts at earlier angles. A sprite turning at three and a half
       * radians a second steps about three degrees a frame, which the eye
       * reads as a stutter rather than as rotation; the smear is what turns
       * the same motion into speed.
       */
      const spinning = e.burstCd > BEHOLDER_WINDUP
      if (spinning) {
        for (let k = 3; k >= 1; k--) {
          ctx.save()
          ctx.globalAlpha = (1 - k / 4) * 0.3
          ctx.translate(e.x, cy3)
          ctx.rotate(e.phase - k * 0.16)
          ctx.translate(-e.x, -cy3)
          drawSheet(ctx, sheet, frame, e.x, e.y - lift, e.flip, big)
          ctx.restore()
        }
      }

      ctx.save()
      ctx.translate(e.x, cy3)
      ctx.rotate(e.phase)
      ctx.translate(-e.x, -cy3)
      drawSheet(ctx, sheet, frame, e.x, e.y - lift, e.flip, big)
      ctx.restore()

      // The eye, lit, so there is one still thing on a spinning body to read.
      const glow = 0.35 + Math.sin(g.time * 4) * 0.12 + wind * 0.5
      const gr = 26 + wind * 14
      const grd2 = ctx.createRadialGradient(e.x, cy3, 1, e.x, cy3, gr)
      grd2.addColorStop(0, 'rgba(150,210,255,' + glow.toFixed(2) + ')')
      grd2.addColorStop(1, 'rgba(90,150,255,0)')
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = grd2
      ctx.fillRect(e.x - gr, cy3 - gr, gr * 2, gr * 2)
      ctx.restore()
    } else {
      ctx.save()
      if (e.allyT > 0) {
        ctx.filter = 'sepia(1) saturate(4) hue-rotate(285deg)'
      }
      drawSheet(ctx, sheet, frame, e.x, e.y - lift, e.flip, big)
      ctx.restore()
    }
    if (e.flash > 0) {
      drawHitFlash(ctx, sheet, frame, e.x, e.y - lift, e.flip, e.flash, big)
      drawHitSparks(g, ctx, e.x, e.y - lift - sheet.fh * big * 0.5, e.seed, e.flash)
    }
  } else {
    shadow(ctx, e.x, e.y, e.radius * 0.85)
    drawPlaceholder(ctx, e)
  }

  /*
   * around it. Salt reads white, a glowie reads green.
   */
  if (e.def.aura) {
    const r = e.def.aura.radius
    /*
     * A GREEN AURA IS A SHEET; a white one is not.
     *
     * The glow a Glowie stands in and the field around a pillar of alien tech
     * are the same thing and now look it. Salt keeps the flat disc it always
     * had: it is meant to read as GROUND you are standing in rather than as an
     * effect you watch, and a particle field would turn it back into the
     * second thing.
     */
    if (e.def.id === 'glowie' || e.def.id === 'alien_tech') {
      loopFx(g, ctx, 'alienaura', e.x, e.y, (r * 2) / 150, e.seed, 0.85)
    }
    const pulse = 0.5 + Math.sin(g.time * 3 + e.seed * 6.283) * 0.5
    const tint = e.def.id === 'glowie' ? '123,240,123' : '235,232,214'
    if (e.def.id !== 'glowie' && e.def.id !== 'alien_tech') {
      const grd = ctx.createRadialGradient(e.x, e.y, r * 0.15, e.x, e.y, r)
      grd.addColorStop(0, 'rgba(' + tint + ',' + (0.20 + pulse * 0.10).toFixed(2) + ')')
      grd.addColorStop(1, 'rgba(' + tint + ',0)')
      ctx.save()
      ctx.scale(1, 0.45)
      ctx.fillStyle = grd
      ctx.beginPath(); ctx.arc(e.x, e.y / 0.45, r, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
      ctx.strokeStyle = 'rgba(' + tint + ',' + (0.22 + pulse * 0.16).toFixed(2) + ')'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.ellipse(e.x, e.y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke()
    }
  }

  /*
   * A LIT FUSE, AND WHERE IT IS GOING TO REACH.
   *
   * The rocket arms at fifty units and holds for most of a second, and that
   * second is only fair if the player can see two things: that it is armed,
   * and exactly how far back they have to be. So the blast radius is drawn on
   * the dirt and FILLS as the fuse burns — the ring is where you must not be
   * and the fill is how long you have, in one shape.
   *
   * Everything here accelerates. The blink rate, the swell and the fill all
   * run off the same normalised countdown, so the thing visibly panics as it
   * gets close, which is the entire read of a creeper.
   */
  if (e.fuse > 0) {
    const det = e.def.detonates
    const full = det?.fuse ?? 1
    // 0 the instant it armed, 1 on the frame it goes off.
    const k = Math.max(0, Math.min(1, 1 - e.fuse / full))

    if (det) {
      const rr = det.radius
      ctx.save()
      // The ground it will take, filling up.
      ctx.globalAlpha = 0.10 + k * 0.28
      ctx.fillStyle = '#ff7a3c'
      ctx.beginPath()
      ctx.ellipse(e.x, e.y, rr * (0.25 + k * 0.75), rr * 0.5 * (0.25 + k * 0.75), 0, 0, Math.PI * 2)
      ctx.fill()
      // And the line itself, which does not move: this is the edge to be past.
      ctx.globalAlpha = 0.5 + k * 0.45
      ctx.strokeStyle = '#ffd07a'
      ctx.lineWidth = 1.5 + k
      ctx.beginPath()
      ctx.ellipse(e.x, e.y, rr, rr * 0.5, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // Blinking faster and faster, and swelling with it.
    const rate = 5 + k * 26
    if (Math.floor(e.fuse * rate) % 2 === 0) {
      const s = (e.def.size ?? 22) * (0.42 + k * 0.5)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = 'rgba(255,236,180,' + (0.55 + k * 0.45).toFixed(2) + ')'
      ctx.beginPath()
      ctx.arc(e.x, e.y - lift - (e.def.size ?? 22) * 0.6, s, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  /*
   * ITS OWN LAMP, WHICH WORKS AT NOON.
   *
   * `emits` only exists inside the night pass, so through the whole of act one
   * — which is daylight now that the sky is hinged on Floriano — the rocket
   * had no light at all and the flicker below was invisible. This is the same
   * pulse painted directly over the world, additively, so a lit fuse coming at
   * you reads at midday and at midnight for the same reason.
   */
  if (e.awake && e.def.id === 'rocket' && e.def.emits) {
    const em = e.def.emits
    const beat = emitPulse(g, e)
    const lr = em.radius * 0.55 * Math.min(1.6, beat)
    const ly = e.y - (e.def.hover ?? 0) - 8
    const grd = ctx.createRadialGradient(e.x, ly, 0, e.x, ly, lr)
    const a = Math.min(0.5, 0.13 * beat)
    grd.addColorStop(0, 'rgba(' + em.r + ',' + em.g + ',' + em.b + ',' + a.toFixed(3) + ')')
    grd.addColorStop(1, 'rgba(' + em.r + ',' + em.g + ',' + em.b + ',0)')
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = grd
    ctx.fillRect(e.x - lr, ly - lr, lr * 2, lr * 2)
    ctx.restore()
  }

  /*
   * A ROCKET UNDER POWER. The one enemy that is scenery until it is not, so
   * the difference between dormant and live has to be unmissable — a stroked
   * orange line was not.
   */
  if (e.awake && e.def.id === 'rocket') {
    const sp = Math.hypot(e.vx, e.vy) || 1
    loopFx(
      g, ctx, 'burn',
      e.x - (e.vx / sp) * 13, e.y - lift - 8 - (e.vy / sp) * 13,
      0.85, e.seed,
    )
  } else if (e.awake && e.def.sheetActive) {
    const sp = Math.hypot(e.vx, e.vy) || 1
    ctx.strokeStyle = 'rgba(255,170,90,0.55)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(e.x, e.y - lift - 8)
    ctx.lineTo(e.x - (e.vx / sp) * 16, e.y - lift - 8 - (e.vy / sp) * 16)
    ctx.stroke()
  }

  /*
   * A MACHINE PAST HALF HEALTH. `broken` is the same flag that swapped the
   * mecha's sheet; before this, that swap and one line of dialogue were the
   * only marks the halfway point left.
   */
  if (e.broken && e.def.id === 'chara_mecha') {
    loopFx(g, ctx, 'fire', e.x + 10, e.y - lift - 30, 1.15, e.seed)
    loopFx(g, ctx, 'fire', e.x - 14, e.y - lift - 16, 0.8, e.seed + 0.4)
  }

  // A broken thing arcs with the energy it is about to throw.
  if (hurt && e.def.brokenBurst) {
    const charge = 1 - Math.max(0, e.burstCd) / e.def.brokenBurst.interval
    const r = (e.def.size ?? 22) * (0.45 + charge * 0.28)
    ctx.strokeStyle = 'rgba(150,240,255,' + (0.20 + charge * 0.55).toFixed(2) + ')'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(e.x, e.y - lift - (e.def.size ?? 22) * 0.45, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Balas Venenosas: a green wash, plus a pip per stack so the investment in
  // a big target is visible.
  if (e.poisonStacks > 0) {
    const s = (e.def.size ?? 22) * 0.5
    ctx.fillStyle = 'rgba(126,214,86,0.30)'
    ctx.beginPath()
    ctx.ellipse(e.x, e.y - s * 0.55, s * 0.5, s * 0.62, 0, 0, Math.PI * 2)
    ctx.fill()
    const bub = (g.time * 2.2 + e.seed * 7) % 1
    ctx.fillStyle = 'rgba(168,238,120,' + (0.8 - bub * 0.8).toFixed(2) + ')'
    ctx.fillRect(Math.round(e.x - 1 + Math.sin(e.seed * 12) * 5), Math.round(e.y - s - bub * 14), 2, 2)
    ctx.fillStyle = '#9ff05a'
    for (let k = 0; k < e.poisonStacks; k++) {
      ctx.fillRect(Math.round(e.x - e.poisonStacks * 2 + k * 4), Math.round(e.y - s * 2 - 6), 3, 3)
    }
  }

  /*
   * THE SHIELD, drawn as a dome rather than as a tint.
   *
   * It has to read as a SURFACE the shots are stopping against, because the
   * player's next thought is supposed to be "so what do I break instead" — a
   * flashing sprite would read as "I am hurting it slowly", which is the exact
   * wrong conclusion and would cost them the whole stage.
   */
  if (e.shielded && loopFx(g, ctx, 'dome', e.x, e.y - lift - 20,
    ((e.def.size ?? 40) * 2.1) / 190, e.seed, 0.85)) {
    // The sheet has it.
  } else if (e.shielded) {
    const rr = (e.def.size ?? 40) * 0.95
    const pulse = 0.5 + Math.sin(g.time * 4) * 0.5
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const dome = ctx.createRadialGradient(
      e.x, e.y - lift - rr * 0.45, rr * 0.2, e.x, e.y - lift - rr * 0.45, rr,
    )
    dome.addColorStop(0, 'rgba(90,240,190,0)')
    dome.addColorStop(0.72, 'rgba(90,240,190,' + (0.10 + pulse * 0.08).toFixed(2) + ')')
    dome.addColorStop(1, 'rgba(150,255,220,' + (0.30 + pulse * 0.22).toFixed(2) + ')')
    ctx.fillStyle = dome
    ctx.beginPath()
    ctx.arc(e.x, e.y - lift - rr * 0.45, rr, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = 'rgba(170,255,225,' + (0.30 + pulse * 0.3).toFixed(2) + ')'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(e.x, e.y - lift - rr * 0.45, rr, 0, Math.PI * 2)
    ctx.stroke()
  }

  /*
   * Health bar for anything that deserves one — and one of the big ones does.
   *
   * It is the only thing that separates a mini-boss from a sprite that failed
   * to die: without it the player empties half a magazine into a cow and has
   * no way to tell whether the damage is landing at all.
   */
  /*
   * AN ESTAGIÁRIO, AND IT HAS TO READ AS "NOT DAMAGE".
   *
   * This is the only thing in the game that is coming at you and does NOT
   * hurt, so it has to look wrong on purpose: a blue smear rather than a
   * green body, spiralling rather than walking, with the paperwork in front
   * of it. If it looked like the rest of the horde the player would dodge it
   * with everything else, never learn what it does, and conclude the game
   * randomly breaks their controls.
   *
   * The trail is the read at speed — they move at 168, which is half again a
   * player's walk, and a stamped sprite at that rate is a flicker.
   */
  if (e.def.inverts) {
    const sp = Math.hypot(e.vx, e.vy) || 1
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let k = 3; k >= 1; k--) {
      ctx.globalAlpha = (1 - k / 4) * 0.5
      ctx.fillStyle = '#7f9cff'
      const tx = e.x - (e.vx / sp) * k * 7
      const ty = e.y - lift - 6 - (e.vy / sp) * k * 7
      const s2 = 6 - k
      ctx.fillRect(Math.round(tx - s2 / 2), Math.round(ty - s2 / 2), s2, s2)
    }
    // Two arrows chasing each other round it: the symbol of what it does.
    const a3 = g.time * 5 + e.seed * 9
    ctx.globalAlpha = 0.75
    ctx.strokeStyle = '#c8d8ff'
    ctx.lineWidth = 1.5
    for (let k = 0; k < 2; k++) {
      const a4 = a3 + k * Math.PI
      ctx.beginPath()
      ctx.arc(e.x, e.y - lift - 8, 11, a4, a4 + 1.5)
      ctx.stroke()
    }
    ctx.restore()
  }

  /*
   * O ALIEN DE RH holds the contract out in front of him, and it catches the
   * light. One small thing so he is not just a blue alien in a crowd of blue
   * things — the paper is the whole character.
   */
  if (e.def.shot === 'clt') {
    const paper2 = g.assets.icon('proj_clt')
    if (paper2) {
      const side = e.flip ? -1 : 1
      const bob2 = Math.sin(g.time * 3 + e.seed * 7) * 1.2
      ctx.save()
      ctx.globalAlpha = 0.95
      ctx.translate(e.x + side * 11, e.y - lift - 13 + bob2)
      ctx.rotate(side * 0.35)
      ctx.drawImage(paper2, -6, -6, 12, 12)
      ctx.restore()
    }
  }

  /*
   * ON FIRE. Drawn on the body, looping, for as long as it burns.
   *
   * Over the sprite rather than under it: the flame is ON the thing, and a
   * flame drawn under a cow is a cow standing next to a fire.
   */
  if (e.burnT > 0) {
    loopFx(g, ctx, 'alight', e.x, e.y - lift - (e.def.size ?? 22) * 0.4,
      (e.def.size ?? 22) / 18, e.seed, Math.min(1, e.burnT * 1.5))
  }

  /*
   * AND A LOVER, so you can tell which one it is at a glance.
   *
   * A turned body keeps its own sprite — it is still a Grande Gordo, it has
   * simply changed its mind — so the only thing marking it is a ring under it
   * and a heart over it. The ring closes as its time runs out, which IS the
   * clock: when it reaches the body, the body drops.
   */
  if (e.allyT > 0) {
    const k = Math.min(1, e.allyT / 20)
    ctx.save()
    ctx.globalAlpha = 0.3 + 0.3 * k
    ctx.strokeStyle = '#ff8ec8'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(e.x, e.y, e.radius + 12 * k, (e.radius + 12 * k) * 0.45, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.55 + Math.sin(g.time * 5 + e.seed * 9) * 0.35
    ctx.fillStyle = '#ff8ec8'
    ctx.font = '7px ' + PIXEL
    ctx.textAlign = 'center'
    ctx.fillText('\u2665', e.x, e.y - lift - (e.def.size ?? 22) - 6)
    ctx.restore()
    ctx.textAlign = 'left'
  }

  /*
   * EXECUTAR IS OFFERING THIS ONE.
   *
   * Brackets closing on it, in the red the finisher uses. Only ever one body
   * on screen wears these — `updateExecutar` picks a single candidate, because
   * a screen of marked bodies is a list rather than an offer.
   */
  // Matched by identity now, not by position: two bodies standing on the same
  // spot used to both wear the mark. See `Enemy.uid`.
  if (g.execOn && e.uid === g.execUid) drawExecMark(g, ctx, e, lift)

  if ((e.def.elite || e.buffed) && e.hp < e.maxHp) {
    const w = Math.max(24, e.radius * 2.4)
    const h = 3
    const y = e.y - (e.def.size ?? 28) * big - 10
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, h + 2)
    ctx.fillStyle = '#d94f4f'
    ctx.fillRect(e.x - w / 2, y, w * (e.hp / e.maxHp), h)
  }
}

/**
 * EXECUTAR'S MARK, and it is loud on purpose.
 *
 * The old one was four thin corner brackets and a 6px letter. In a crowd, at
 * this zoom, over a sprite that is already flashing from being shot, it was
 * genuinely easy to miss — and it carried no information at all about how
 * long the offer stood, because until now there was no window to show.
 *
 * SEVEN THINGS, and each one answers a different question:
 *
 *   THE TETHER      where is it? A dashed line from him to the body, so the
 *                   eye is led to it instead of having to find it.
 *   THE GROUND RING a red disc under the body, which is the layer the player
 *                   is already reading for hazards.
 *   THE CLOCK       an arc around the body that empties over the four seconds.
 *                   This is the answer to "how long do I have".
 *   THE BRACKETS    still there, but they CLOSE IN as the clock runs down, so
 *                   the shape itself is a second copy of the timer.
 *   THE KEY         a proper key cap with a dark plate behind it, big enough
 *                   to read over any sprite, bobbing.
 *   THE URGENCY     everything flashes faster and turns white in the last
 *                   second, so a lost window is felt rather than discovered.
 *   THE SKULL RING  a ring that closes on the body each beat, like something
 *                   being lined up.
 */
function drawExecMark(
  g: Game, ctx: CanvasRenderingContext2D, e: Enemy, lift: number,
) {
  const X = ABILITIES.executar
  // 1 the moment it was marked, 0 when the offer expires.
  const left = Math.max(0, Math.min(1, g.execT / X.window))
  const urgent = left < 0.28
  const beat = urgent ? 20 : 9
  const pulse = 0.5 + Math.sin(g.time * beat) * 0.5
  const col = urgent ? '#ffffff' : '#ff6b6b'

  const size = e.def.size ?? 22
  const cy = e.y - lift - size * 0.4
  const p = g.player

  ctx.save()

  // ---- where it is ------------------------------------------------------
  ctx.globalAlpha = 0.2 + pulse * 0.22
  ctx.strokeStyle = col
  ctx.lineWidth = 1
  ctx.setLineDash([4, 5])
  ctx.lineDashOffset = -g.time * 26
  ctx.beginPath()
  ctx.moveTo(p.x, p.y - 12)
  ctx.lineTo(e.x, cy)
  ctx.stroke()
  ctx.setLineDash([])

  // ---- on the floor, where hazards live ---------------------------------
  const gr = size * 0.7 + 6
  const disc = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, gr)
  disc.addColorStop(0, urgent ? 'rgba(255,255,255,0.34)' : 'rgba(255,80,80,0.32)')
  disc.addColorStop(1, 'rgba(255,60,60,0)')
  ctx.globalAlpha = 0.6 + pulse * 0.4
  ctx.fillStyle = disc
  ctx.beginPath()
  ctx.ellipse(e.x, e.y, gr, gr * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()

  const r = size * 0.55 + 7

  // ---- the clock --------------------------------------------------------
  ctx.globalAlpha = 0.22
  ctx.strokeStyle = col
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(e.x, cy, r + 4, 0, Math.PI * 2)
  ctx.stroke()

  ctx.globalAlpha = 0.95
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(e.x, cy, r + 4, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2)
  ctx.stroke()
  ctx.lineCap = 'butt'

  // ---- a ring closing on it, once a beat --------------------------------
  const close = (g.time * (urgent ? 2.4 : 1.4)) % 1
  ctx.globalAlpha = (1 - close) * 0.5
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(e.x, cy, r + 4 + close * -14 + 14, 0, Math.PI * 2)
  ctx.stroke()

  /*
   * THE BRACKETS TIGHTEN AS THE CLOCK EMPTIES.
   *
   * A second, redundant copy of the timer in a different visual channel: on a
   * screen with forty bodies on it the arc can be lost, and the SHAPE closing
   * in is read peripherally in a way a thin line is not.
   */
  const br = r + 8 - (1 - left) * 6
  const arm = 5
  ctx.globalAlpha = 0.7 + pulse * 0.3
  ctx.lineWidth = 2
  ctx.beginPath()
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    ctx.moveTo(e.x + sx * br, cy + sy * br - sy * arm)
    ctx.lineTo(e.x + sx * br, cy + sy * br)
    ctx.lineTo(e.x + sx * br - sx * arm, cy + sy * br)
  }
  ctx.stroke()

  // ---- and what to press ------------------------------------------------
  const ky = e.y - lift - size - 14 + Math.sin(g.time * (urgent ? 14 : 6)) * 2
  const kw = 15
  const kh = 15
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(0,0,0,0.8)'
  ctx.fillRect(e.x - kw / 2, ky - kh / 2, kw, kh)
  ctx.strokeStyle = col
  ctx.lineWidth = 1
  ctx.strokeRect(e.x - kw / 2 + 0.5, ky - kh / 2 + 0.5, kw - 1, kh - 1)
  ctx.fillStyle = col
  ctx.font = '9px ' + PIXEL
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('X', e.x, ky + 1)
  ctx.textBaseline = 'alphabetic'

  ctx.restore()
  ctx.textAlign = 'left'
}

/**
 * HER, HALF OUT OF THE GROUND, CROSSING IT.
 *
 * The first cell of the minhoca strip is the pose for breaking the surface, so
 * it doubles as the travelling state and nothing here is drawn by hand. Held
 * rather than animated: the rise plays when she actually surfaces, and looping
 * it while she is under would read as her coming up over and over.
 *
 * A shallow bob and a dust trail are the only things added, and both are about
 * MOTION rather than about the creature — a stationary sprite sliding across
 * the caatinga reads as a decal being dragged, and these are what make it read
 * as something moving under the dirt.
 */
function drawBurrowed(g: Game, ctx: CanvasRenderingContext2D, e: Enemy) {
  const sheet = e.def.sheet ? g.assets.sheet(e.def.sheet) : undefined
  const t = g.time
  const sp = Math.hypot(e.vx, e.vy)

  ctx.save()

  // The hole she is sitting in, so she is IN the ground rather than on it.
  ctx.globalAlpha = 0.45
  ctx.fillStyle = '#241a12'
  ctx.beginPath()
  ctx.ellipse(e.x, e.y, (e.def.size ?? 24) * 0.42, (e.def.size ?? 24) * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  if (sheet) {
    const bob = Math.sin(t * 6 + e.seed * 6.283) * 1.2
    ctx.drawImage(
      e.flip ? sheet.flipped : sheet.img,
      0, 0, sheet.fw, sheet.fh,
      Math.round(e.x - sheet.fw / 2), Math.round(e.y - sheet.fh + bob), sheet.fw, sheet.fh,
    )
  }

  // Dirt kicked out behind her, only while she is actually crossing ground.
  if (sp > 4) {
    ctx.fillStyle = '#8a6a49'
    for (let k = 0; k < 4; k++) {
      const f = ((Math.sin((k + e.seed) * 91.7) * 43758.5453) % 1 + 1) % 1
      const back = ((t * 1.6 + f) % 1)
      const bx = e.x - (e.vx / sp) * back * 20 + Math.sin(t * 7 + k) * 3
      const by = e.y - (e.vy / sp) * back * 12 - back * 5
      ctx.globalAlpha = (1 - back) * 0.7
      const sz = Math.max(1, Math.round(3 - back * 2))
      ctx.fillRect(Math.round(bx), Math.round(by), sz, sz)
    }
  }
  ctx.restore()
}

/**
 * COBSON, WALKING THROUGH.
 *
 * Drawn from the same walk sheet the enemies use and nothing else — no
 * outline, no highlight, no marker over his head. He is a man in a yellow
 * shirt in a game where everything else is green or dead, which is all the
 * distinction he needs, and dressing him up as an OBJECTIVE would be exactly
 * wrong: there is nothing to do about him.
 *
 * The line above his head is drawn here rather than through the bark system on
 * purpose. `g.say` is O Indígena's voice and the bark box is his box; putting
 * somebody else's shouting in it would make the player read it as his.
 */
function drawCobson(g: Game, ctx: CanvasRenderingContext2D) {
  const c = g.cobson
  if (!c) return
  const sheet = g.assets.sheet('cobson')

  // Fading out as he leaves, so he does not simply blink off the edge.
  const gone = c.phase === 'leave' ? Math.min(1, c.t / 3.4) : 0
  ctx.save()
  ctx.globalAlpha = 1 - gone * gone

  shadow(ctx, c.x, c.y, 9)

  if (sheet) {
    // Planted while he hands the corn over: a man standing still should not be
    // playing a walk cycle at you.
    const moving = c.phase !== 'gift'
    const f = moving ? Math.floor(g.time * 6) % sheet.frames : 0
    ctx.drawImage(
      c.dir < 0 ? sheet.flipped : sheet.img,
      f * sheet.fw, 0, sheet.fw, sheet.fh,
      Math.round(c.x - sheet.fw / 2), Math.round(c.y - sheet.fh), sheet.fw, sheet.fh,
    )
  } else {
    ctx.fillStyle = '#ffd21f'
    ctx.fillRect(Math.round(c.x - 7), Math.round(c.y - 22), 14, 22)
  }

  if (c.lineT > 0) {
    ctx.font = '7px ' + PIXEL
    ctx.textAlign = 'center'
    const w = ctx.measureText(c.line).width + 10
    const y = c.y - 40
    ctx.globalAlpha = (1 - gone) * Math.min(1, c.lineT * 3)
    ctx.fillStyle = 'rgba(12,14,16,0.86)'
    ctx.fillRect(Math.round(c.x - w / 2), y - 10, Math.round(w), 14)
    ctx.fillStyle = '#ffd21f'
    ctx.fillText(c.line, c.x, y)
    ctx.textAlign = 'left'
  }
  ctx.restore()
}

/**
 * PLACEHOLDER MONSTER.
 * Every enemy without art renders as this: a bobbing blob in the def's colour
 * with two eyes, so waves are still readable while the real sprites get drawn.
 */
function drawPlaceholder(ctx: CanvasRenderingContext2D, e: Enemy) {
  const s = (e.def.size ?? 22) * (e.buffed ? CONFIG.MINIBOSS.scale : 1)
  const bob = Math.sin(e.anim * 7 + e.seed * 6.283) * 1.6
  const x = e.x
  const y = e.y - s / 2 + bob
  const hit = e.flash > 0

  ctx.fillStyle = hit ? '#ffffff' : e.def.color
  ctx.beginPath()
  ctx.ellipse(x, y, s * 0.42, s * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.30)'
  ctx.beginPath()
  ctx.ellipse(x, y + s * 0.16, s * 0.42, s * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()

  if (!hit) {
    const dir = e.flip ? -1 : 1
    ctx.fillStyle = '#101418'
    ctx.fillRect(x + dir * s * 0.06 - 3, y - s * 0.16, 3, 4)
    ctx.fillRect(x + dir * s * 0.06 + 3, y - s * 0.16, 3, 4)
  }
}

// ---------------------------------------------------------------- BULLETS --

function drawBullets(g: Game, ctx: CanvasRenderingContext2D) {
  const items = g.bullets.items
  const fish = g.assets.icon('up_tambaqui')
  const flag = g.assets.icon('proj_flag')
  const janela = g.assets.icon('proj_janela')
  const missile = g.assets.icon('proj_missile')
  const twister = g.assets.effect('tornado')
  const nota = g.assets.icon('proj_nota')

  for (let i = 0; i < items.length; i++) {
    const b = items[i]

    // A MANIFESTAÇÃO throws flags. They tumble, and they are big enough to
    // read as objects rather than as bullet soup.
    if (b.kind === 'flag') {
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.spin + g.time * 5)
      if (flag) ctx.drawImage(flag, -11, -11, 22, 22)
      else { ctx.fillStyle = '#d64a4a'; ctx.fillRect(-7, -7, 14, 10) }
      ctx.restore()
      continue
    }

    /*
     * A JANELA. Four panes, tumbling.
     *
     * Drawn large and with a hard white frame because it has to be readable
     * coming BACK — a boomerang the player cannot see returning is just
     * unfair damage from behind. The colours are the obvious ones.
     */
    if (b.kind === 'janela') {
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.spin)
      if (janela) {
        // A dark plate behind it, because the drawn logo is mostly light and
        // a boomerang has to stay readable against pale ground on the way back.
        ctx.fillStyle = 'rgba(0,0,0,0.30)'
        ctx.fillRect(-11, -11, 22, 22)
        ctx.drawImage(janela, -11, -11, 22, 22)
      } else {
        const pane = [
          ['#f25022', -9, -9], ['#7fba00', 1, -9],
          ['#00a4ef', -9, 1], ['#ffb900', 1, 1],
        ] as const
        for (const [col, px, py] of pane) {
          ctx.fillStyle = col
          ctx.fillRect(px, py, 8, 8)
        }
      }
      ctx.restore()
      continue
    }

    /*
     * A NOTE. It rocks rather than spins — a quaver has an up, and tumbling it
     * end over end would read as debris. The rock runs on the same phase as
     * the weave in `updateBullets`, so it leans into its own turns.
     */
    if (b.kind === 'nota') {
      if (nota) {
        const s = 22
        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(Math.sin(b.age * ABILITIES.cantarolar.swayRate + b.spin) * 0.42)
        // A little breathing, so a note held on screen for four seconds is
        // never quite still.
        const k = s * (1 + Math.sin(b.age * 7 + b.spin) * 0.06)
        ctx.drawImage(nota, -k / 2, -k / 2, k, k)
        ctx.restore()
      } else {
        ctx.fillStyle = '#8ad0ff'
        ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill()
      }
      continue
    }

    /*
     * A MISSILE. The drawn one, pointed the way it is going.
     *
     * The sheet has two of them side by side; only the left is used. Slicing
     * the strip properly would buy an animation nobody can see on an object
     * that crosses the screen in a second and a half.
     */
    /*
     * A HEAD, TUMBLING.
     *
     * It spins on its own travel rather than on a clock, so a skull that has
     * just bounced visibly changes direction — the bounce is the read of the
     * whole ability and a sprite rotating at a constant rate hides it.
     *
     * One of four faces, chosen off the seed baked in when it was thrown, so a
     * screen with six in the air is six different heads and each keeps its own
     * for the whole flight.
     */
    /*
     * A CONTRACT, tumbling end over end.
     *
     * Rotated on its own travel like the skull is, for the same reason: these
     * arrive off a SPINNING boss, and a projectile that holds one orientation
     * while its source turns reads as a sprite rather than as a thrown object.
     */
    if (b.kind === 'clt') {
      const paper = g.assets.icon('proj_clt')
      const sz = 16
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.age * 6 + b.spin)
      if (paper) ctx.drawImage(paper, -sz / 2, -sz / 2, sz, sz)
      else { ctx.fillStyle = '#cfe4ff'; ctx.fillRect(-3, -5, 6, 10) }
      ctx.restore()
      continue
    }

    if (b.kind === 'skull') {
      const face = g.assets.icon(
        (['skull_1', 'skull_2', 'skull_3', 'skull_4'] as const)[
          Math.floor(b.spin * 4 / (Math.PI * 2)) & 3
        ],
      )
      const sz = 16
      ctx.save()
      // A little green trail, because it is an alien head and it is leaking.
      ctx.globalAlpha = 0.3
      ctx.strokeStyle = '#8ef0a0'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      const sp2 = Math.hypot(b.vx, b.vy) || 1
      ctx.lineTo(b.x - (b.vx / sp2) * 13, b.y - (b.vy / sp2) * 13)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.translate(b.x, b.y)
      ctx.rotate(b.age * 11)
      if (face) ctx.drawImage(face, -sz / 2, -sz / 2, sz, sz)
      else { ctx.fillStyle = '#e8e0cc'; ctx.fillRect(-4, -4, 8, 8) }
      ctx.restore()
      continue
    }

    if (b.kind === 'missile') {
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(Math.atan2(b.vy, b.vx))
      // The exhaust, so a turning missile shows its turn.
      ctx.strokeStyle = 'rgba(140,255,190,0.5)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-9, 0)
      ctx.lineTo(-22 - Math.random() * 8, 0)
      ctx.stroke()
      if (missile) {
        const half = missile.width / 2
        ctx.drawImage(missile, 0, 0, half, missile.height, -11, -8, 22, 16)
      } else {
        ctx.fillStyle = '#cfe8d8'
        ctx.fillRect(-8, -3, 16, 6)
      }
      ctx.restore()
      continue
    }

    /*
     * A TORNADO — a real churning column now, in the one dust-brown variant of
     * the nine the sheet ships with.
     *
     * It used to be three nested ellipses counter-rotating, because a single
     * spinning sprite at that size read as a wobbling blob and the shear
     * between the rings was the only thing that said "spinning". A sheet that
     * actually animates says it on its own.
     *
     * `b.spin` is a random angle set at spawn and reused here as a phase
     * offset, so two tornados on screen are not in lockstep.
     */
    if (b.kind === 'tornado') {
      drawTornado(g, ctx, b, twister)
      continue
    }

    // TAMBAQUI — the card's own icon is the fish in flight, so drawing it once
    // puts it on the upgrade screen and in the air at the same time.
    if (b.kind === 'tambaqui') {
      const ang = Math.atan2(b.vy, b.vx)
      ctx.save()
      ctx.translate(b.x, b.y)
      // Tumbling end over end, because a thrown fish does.
      ctx.rotate(ang + b.spin + g.time * 11)
      if (fish) ctx.drawImage(fish, -11, -11, 22, 22)
      else drawFishShape(ctx)
      ctx.restore()
      continue
    }

    /*
     * EVERYTHING ELSE IS THE SAME ROUND IN A DIFFERENT COLOUR.
     *
     * Which colour is a balance decision, not a rendering one: the whole
     * reason there are six ammo types is that you can tell which is loaded
     * without reading the HUD, so each one names its own in `bullets.ts`. The
     * horde gets magenta and nothing the player can fire does, because a round
     * coming at you must never read as one of yours.
     *
     * Drawn additively — these sheets are light on black, and normal
     * compositing leaves a grey card wherever a pixel is not quite
     * transparent. `b.spin` is a random angle from spawn, reused as a phase
     * offset so a volley does not pulse in unison.
     */
    const key = b.friendly
      ? (b.ammo ? AMMO[b.ammo].fx : 'bullet_gold')
      : (b.kind === 'glow' || b.kind === 'raio') ? 'bullet_green' : 'bullet_magenta'
    const art = g.assets.effect(key)
    if (art) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      // Bigger rounds are bigger on screen. A shotgun pellet and a rocket
      // should not be the same object in two colours.
      drawEffect(ctx, art, b.x, b.y, g.time + b.spin, 0.6 + b.radius * 0.14)
      ctx.restore()
      continue
    }

    // Fallback: the tracer this used to be, if a sheet failed to load.
    const sp = Math.hypot(b.vx, b.vy) || 1
    const tx = (b.vx / sp) * 7
    const ty = (b.vy / sp) * 7
    const ammo = b.ammo ? AMMO[b.ammo] : null
    ctx.strokeStyle = b.friendly
      ? (ammo?.tracer ?? 'rgba(255,214,120,0.85)')
      : 'rgba(255,96,96,0.85)'
    ctx.lineWidth = b.radius * 1.6
    ctx.beginPath()
    ctx.moveTo(b.x - tx, b.y - ty)
    ctx.lineTo(b.x + tx * 0.5, b.y + ty * 0.5)
    ctx.stroke()
    ctx.fillStyle = b.friendly ? (ammo?.core ?? '#fff6d8') : '#ffd8d8'
    ctx.beginPath()
    ctx.arc(b.x, b.y, b.radius * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * PLACEHOLDER FISH, drawn at the origin for the caller's transform.
 * Delete this the day `/upgrades/tambaqui.png` exists.
 */

/**
 * O TORNADO DO INDÍGENA.
 *
 * A sheet on its own cannot be a tornado in a three-quarter view. The sheet is
 * a top-down whirl — right for the ground, and a disc when that is all there
 * is — so the funnel is built around it in four pieces, each doing a job the
 * others cannot:
 *
 *   THE SCAR    a dust ellipse dragged along the ground under it, which is
 *               what says the thing is TOUCHING DOWN rather than floating.
 *   THE COLUMN  eight stacked rings, tapering to a waist and flaring at the
 *               top, each rotated further round than the one below it. That
 *               twist down the stack is the whole illusion: a funnel is not a
 *               cone, it is a cone that is shearing.
 *   THE CHURN   the sheet itself, at the base, where the debris actually is.
 *   THE DEBRIS  a dozen specks on their own orbits, rising as they go round
 *               and re-entering at the bottom, so the column is visibly
 *               EATING and not merely spinning.
 *
 * It also leans into its own travel. A tornado crossing the screen upright is
 * a spinning top; one raked back off vertical is weather going somewhere.
 */
function drawTornado(
  g: Game, ctx: CanvasRenderingContext2D, b: Bullet, twister: Effect | undefined,
) {
  const R = ABILITIES.tornado.radius
  // Its own clock, offset per tornado so two on screen are never in lockstep.
  const t = g.time * 2.6 + b.spin
  const lean = Math.max(-1, Math.min(1, b.vx / (ABILITIES.tornado.speed || 1)))

  // ---- the scar it drags -------------------------------------------------
  ctx.save()
  ctx.globalAlpha = 0.3
  ctx.fillStyle = '#6b5a3e'
  ctx.beginPath()
  ctx.ellipse(b.x, b.y, R * 1.5, R * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // ---- the column --------------------------------------------------------
  /*
   * DRAWN NORMALLY, NOT ADDITIVELY. Both layers started out on `lighter` and
   * the whole funnel came out near-white — dust is a thing light does not get
   * through, so adding it to the ground behind it is exactly backwards. It
   * occludes now, and the only part still allowed to glow is the debris.
   */
  const RINGS = 13
  ctx.save()
  for (let i = 0; i < RINGS; i++) {
    const k = i / (RINGS - 1)
    // Narrow at the waist, flaring at both ends — a funnel, not a cone.
    const width = R * (1.0 - k * 0.78 + k * k * 1.15)
    const y = b.y - k * R * 4.8
    // Each ring further round than the last: this is the shear.
    const a = t * (1.5 + k * 0.7) + k * 2.6
    const wob = Math.cos(a) * width * 0.16 + lean * k * k * R * 1.5
    // Denser at the waist, thinning out at both ends so the column has no
    // hard top and no hard bottom — it arrives out of the air and goes into
    // the ground.
    const fade = (0.62 - Math.abs(k - 0.42) * 0.62) * 0.9
    ctx.globalAlpha = Math.max(0, fade)
    // Alternating bands, so the shear between rings is visible as banding
    // rather than having to be inferred from the wobble alone.
    ctx.fillStyle = i % 2 === 0 ? 'rgba(178,152,104,0.85)' : 'rgba(128,106,70,0.8)'
    ctx.beginPath()
    ctx.ellipse(b.x + wob, y, width, width * 0.34, Math.sin(a) * 0.22, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // ---- the churn the sheet is actually good at ---------------------------
  if (twister) {
    ctx.save()
    ctx.globalAlpha = 0.85
    drawEffect(ctx, twister, b.x, b.y - R * 0.35, g.time + b.spin, 1.15)
    ctx.restore()
  }

  // ---- and what it has picked up ----------------------------------------
  ctx.save()
  ctx.fillStyle = 'rgba(232,214,168,0.9)'
  for (let i = 0; i < 12; i++) {
    // Rises through the column and comes back in at the bottom.
    const climb = ((t * 0.42 + i / 12) % 1)
    const a = t * 2.1 + i * 2.4
    const width = R * (1.0 - climb * 0.78 + climb * climb * 1.15)
    const x = b.x + Math.cos(a) * width + lean * climb * climb * R * 1.5
    const y = b.y - climb * R * 4.8 + Math.sin(a) * width * 0.3
    ctx.globalAlpha = (1 - climb) * 0.85
    const sz = 3 - climb * 1.5
    ctx.fillRect(Math.round(x), Math.round(y), sz, sz)
  }
  ctx.restore()
}

function drawFishShape(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#8a97a8'
  ctx.beginPath()
  ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-8, 0)
  ctx.lineTo(-14, -5)
  ctx.lineTo(-14, 5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#dfe6ee'
  ctx.fillRect(-2, 1, 7, 2)
  ctx.fillStyle = '#1b2028'
  ctx.fillRect(4, -2, 2, 2)
}

// ------------------------------------------------------------------ BOMBS --

/**
 * BOMBAS DO LOURO.
 *
 * The throw is drawn as an arc by lifting the sprite off its own shadow — the
 * shadow stays on the ground and tracks the landing spot, which is the only
 * cue the player has for where to not be standing.
 */
/**
 * THE ANVIL'S GROUND HALF: the shadow it casts coming down, and the iron
 * itself once it has arrived.
 *
 * Drawn with the floor rather than with the ordnance, so the warning is under
 * the crowd it is warning you about and the landed anvil is something the
 * player walks in front of instead of behind.
 */
function drawAnvilGround(g: Game, ctx: CanvasRenderingContext2D) {
  const items = g.bombs.items
  const art = g.assets.icon('up_bigorna')
  const REST = ABILITIES.bigorna.rest

  for (let i = 0; i < items.length; i++) {
    const b = items[i]
    if (!b.anvil) continue

    // Squared, to match the fall in `updateBombs` — the shadow has to tighten
    // at the rate the thing above it is actually coming down.
    const k = b.exploded ? 1 : Math.min(1, b.t / b.flight) ** 2
    // Down at the end, so the whole thing leaves the road together rather than
    // being deleted off it.
    const gone = b.exploded ? Math.max(0, Math.min(1, b.rest / (REST * 0.45))) : 1

    ctx.save()
    ctx.globalAlpha = gone

    // Wide and faint at the top of the fall, tight and black at the bottom.
    const rx = b.radius * (1.5 - k * 0.62)
    ctx.fillStyle = 'rgba(0,0,0,' + (0.14 + k * 0.4).toFixed(3) + ')'
    ctx.beginPath()
    ctx.ellipse(b.tx, b.ty, rx, rx * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()

    // The rim is the warning, so it goes the moment there is nothing left to
    // warn anybody about.
    if (!b.exploded) {
      ctx.strokeStyle = 'rgba(255,120,96,' + (0.25 + k * 0.5).toFixed(3) + ')'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(b.tx, b.ty, rx, rx * 0.4, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    /*
     * AND THE IRON, LYING IN IT.
     *
     * On impact it squashes once for about a tenth of a second — wider than it
     * is tall, driven a couple of pixels into the dirt — and then it just sits
     * there. That one frame is most of the weight; the rest is the dust.
     */
    if (b.exploded && art) {
      const hit = Math.max(0, (REST - b.rest) / 0.12)
      const squash = hit < 1 ? 1 - hit : 0
      const w = 35 * (1 + squash * 0.22)
      const h = 35 * (1 - squash * 0.26)
      ctx.drawImage(art, Math.round(b.x - w / 2), Math.round(b.y - h + 3), w, h)
    }
    ctx.restore()
  }
}

function drawBombs(g: Game, ctx: CanvasRenderingContext2D) {
  const items = g.bombs.items
  const art = g.assets.icon('up_bomba')
  const anvil = g.assets.icon('up_bigorna')

  for (let i = 0; i < items.length; i++) {
    const b = items[i]

    // The detonation itself is a sheet now; see `updateBombs`. An anvil is the
    // exception: it goes on lying where it landed, so it draws past that.
    if (b.exploded && !b.anvil) continue

    const flying = b.t < b.flight

    /*
     * AN ANVIL IS A SHADOW THAT GETS BIGGER.
     *
     * No landing ring and no arc: it comes straight down out of nothing, and
     * the only warning is a shadow on the ground that tightens and darkens as
     * the thing above it gets closer. That is the whole telegraph, it is the
     * one everybody already understands, and it does the job a dashed circle
     * was doing much worse.
     */
    /*
     * ONLY THE AIRBORNE HALF IS DRAWN HERE.
     *
     * The shadow and the landed iron belong on the ground with the blood and
     * the dust — see `drawAnvilGround`. Left in this pass, a thing that sits
     * in the road for the best part of a second sat on top of the player
     * instead, and the one card in the game whose whole point is where you are
     * standing was covering where you were standing.
     */
    if (b.anvil) {
      if (!b.exploded && anvil) {
        const k = (b.t / b.flight) ** 2
        const s = 22 + k * 13
        ctx.drawImage(anvil, Math.round(b.x - s / 2), Math.round(b.y - s), s, s)
      }
      continue
    }

    const lift = flying ? Math.sin((b.t / b.flight) * Math.PI) * 46 : 0

    /*
     * The landing zone, so it can be read and avoided.
     */
    ctx.strokeStyle = b.hostile ? 'rgba(120,255,190,0.6)' : 'rgba(255,170,80,0.5)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(b.tx, b.ty, b.radius, b.radius * 0.42, 0, 0, Math.PI * 2); ctx.stroke()
    shadow(ctx, b.x, b.y, 7)

    // Once it lands the fuse blinks, faster as it runs out.
    const armed = !flying
    const blink = armed && Math.floor(b.fuse * 14) % 2 === 0
    ctx.save()
    ctx.translate(b.x, b.y - lift - 8)
    ctx.rotate(flying ? b.t * 9 : 0)
    if (art && !b.hostile) ctx.drawImage(art, -11, -11, 22, 22)
    else {
      ctx.fillStyle = b.hostile ? '#1d3a30' : '#2a2a30'
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill()
      if (b.hostile) {
        ctx.fillStyle = '#7effc8'
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.restore()
    if (blink) {
      ctx.fillStyle = b.hostile ? 'rgba(150,255,210,0.85)' : 'rgba(255,240,190,0.85)'
      ctx.beginPath(); ctx.arc(b.x, b.y - lift - 8, 13, 0, Math.PI * 2); ctx.fill()
    }
  }
}

// ------------------------------------------------------------------ BARK --

/**
 * What O Indígena is saying, in a bubble over his head.
 *
 * Drawn on the canvas rather than in the HUD because it has to sit exactly
 * above him while he runs, and the HUD only updates fifteen times a second —
 * a DOM bubble would swim behind the character.
 *
 * It fades at both ends and never blocks the view of what is in front of him,
 * which is the whole reason it sits above rather than below.
 */
// ------------------------------------------------------------------ A NAVÉ --

/**
 * THE LIGHT ON THE ROAD.
 *
 * Drawn in two halves, in two different passes, because it is one object that
 * exists at two heights: the circle belongs on the ground with the blood and
 * the salt, and the ship belongs above everything that flies. Splitting them
 * is what lets the player and the horde walk THROUGH the beam rather than in
 * front of or behind it.
 */
function drawBeamGround(g: Game, ctx: CanvasRenderingContext2D) {
  const a = g.abduct
  if (a.glow <= 0.01) return
  const R = CONFIG.ABDUCT.beam
  const pulse = 0.5 + Math.sin(g.time * 6) * 0.5

  // The glow it lays on the dirt.
  const grd = ctx.createRadialGradient(a.x, a.y, R * 0.1, a.x, a.y, R)
  grd.addColorStop(0, 'rgba(150,255,170,' + (0.42 * a.glow).toFixed(3) + ')')
  grd.addColorStop(0.6, 'rgba(96,224,142,' + (0.20 * a.glow).toFixed(3) + ')')
  grd.addColorStop(1, 'rgba(80,200,120,0)')
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.scale(1, 0.5)
  ctx.fillStyle = grd
  ctx.beginPath(); ctx.arc(a.x, a.y / 0.5, R, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  // And the edge of it, which is the line that matters — inside is caught,
  // outside is not, so it is drawn hard rather than feathered.
  ctx.strokeStyle = 'rgba(190,255,200,' + ((0.45 + pulse * 0.35) * a.glow).toFixed(3) + ')'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.ellipse(a.x, a.y, R, R * 0.5, 0, 0, Math.PI * 2); ctx.stroke()

  /*
   * The churn inside it, kept well under the rim and well under half strength.
   * At full it read as an explosion sitting on the road — which is the one
   * thing this must not look like, because an explosion is over and this is a
   * place you have to leave.
   */
  loopFx(g, ctx, 'alienaura', a.x, a.y, (R * 1.35) / 150, 0.31, 0.34 * a.glow)

  /*
   * AND THE DIRT IT IS LIFTING.
   *
   * A ring of grit spiralling INWARD along the ground before it goes up the
   * column. This is the tell the hazard did not have: the light said "here",
   * and nothing said "and it is pulling". A player who can see the ground
   * being dragged toward a point knows to be somewhere else without having to
   * be caught once to learn it.
   *
   * Positions are a hash of the index and the clock — no pool, no allocation,
   * exactly like the rain.
   */
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 18; i++) {
    const seed = i * 7.113
    const f = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1
    // 1 at the rim, 0 at the middle, and round again.
    const k = 1 - ((g.time * 0.85 + f) % 1)
    const ang = f * Math.PI * 2 + (1 - k) * 2.6
    const rr = R * (0.15 + k * 0.95)
    const px = a.x + Math.cos(ang) * rr
    const py = a.y + Math.sin(ang) * rr * 0.5
    ctx.globalAlpha = (1 - Math.abs(k - 0.5) * 1.6) * 0.8 * a.glow
    ctx.fillStyle = '#cdffd8'
    ctx.fillRect(Math.round(px), Math.round(py), 2, 2)
  }
  ctx.restore()
}

function drawNave(g: Game, ctx: CanvasRenderingContext2D) {
  const a = g.abduct
  if (a.glow <= 0.01) return
  const A = CONFIG.ABDUCT
  /*
   * IT FLINCHES WHEN HE DOES.
   *
   * `jolt` is set for a sixth of a second by every A/D press that counted, and
   * the whole column brightens by half. That is what tells the player their
   * mashing is landing — the struggle bar is behind them, over their own head,
   * and nobody looks at it while they are hammering two keys.
   */
  const jolt = 1 + (a.jolt > 0 ? a.jolt / A_JOLT : 0) * 0.55
  const sheet = g.assets.sheet('chara_nave')

  /*
   * AS HIGH AS THE CAMERA WILL ALLOW.
   *
   * `alt` is what it wants; the view is what it gets. The zoom clamps to a
   * fixed multiple of the window, so on a short window the whole world above
   * about a hundred units is simply not on screen — and a mothership nobody
   * can see is a green circle with no explanation attached. So it is pinned
   * just inside the top edge whenever the wanted height is off it, and reads
   * as very high up by being small rather than by being far away.
   */
  const wanted = a.y - A.alt
  const ceiling = g.camera.y - g.camera.viewH / 2
    + (sheet ? sheet.fh * A.naveScale : 40) * 0.6 + 6
  const sy = Math.max(ceiling, wanted) + Math.sin(g.time * 1.7) * 5

  /*
   * THE COLUMN. A cone rather than a cylinder, wide at the ship and narrow at
   * the ground, which is backwards from a spotlight and right for this: what
   * is being drawn is a thing pulling upward, and it should point at where it
   * is pulling TO.
   */
  const R = A.beam
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const col = ctx.createLinearGradient(a.x, sy, a.x, a.y)
  col.addColorStop(0, 'rgba(150,255,175,' + (0.30 * a.glow * jolt).toFixed(3) + ')')
  col.addColorStop(1, 'rgba(110,235,150,' + (0.07 * a.glow * jolt).toFixed(3) + ')')
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.moveTo(a.x - R * 0.62, sy)
  ctx.lineTo(a.x + R * 0.62, sy)
  ctx.lineTo(a.x + R, a.y)
  ctx.lineTo(a.x - R, a.y)
  ctx.closePath()
  ctx.fill()

  // Rungs climbing it, so the column reads as something moving upward rather
  // than as a painted triangle.
  ctx.strokeStyle = 'rgba(200,255,210,' + (0.20 * a.glow * jolt).toFixed(3) + ')'
  ctx.lineWidth = 1
  for (let i = 0; i < 5; i++) {
    const k = ((g.time * 0.55 + i / 5) % 1)
    const y = a.y - k * A.alt
    const w = R * (0.62 + (1 - k) * 0.38)
    ctx.globalAlpha = (1 - k) * a.glow
    ctx.beginPath(); ctx.ellipse(a.x, y, w, w * 0.22, 0, 0, Math.PI * 2); ctx.stroke()
  }
  /*
   * AND THINGS GOING UP IT.
   *
   * The rungs say the column is moving; these say it is CARRYING something.
   * Specks lifted off the ground and drawn up the cone, shrinking as they go
   * because the far end of it is a long way away — which is the only cue in
   * the whole hazard that says how high the ship actually is.
   *
   * They tighten toward the axis as they rise, following the cone, so the
   * beam reads as a funnel rather than as a lit triangle with sparks in it.
   */
  for (let i = 0; i < 14; i++) {
    const seed = i * 11.37
    const f = ((Math.sin(seed) * 24634.6345) % 1 + 1) % 1
    const climb = ((g.time * (0.5 + f * 0.4) + f) % 1)
    const w = R * (1 - climb * 0.38)
    const px = a.x + Math.cos(f * Math.PI * 2 + climb * 3.4) * w * (1 - climb * 0.5)
    const py = a.y - climb * (a.y - sy)
    ctx.globalAlpha = (1 - climb) * 0.9 * a.glow
    ctx.fillStyle = '#e6fff0'
    const s = Math.max(1, Math.round(3 - climb * 2))
    ctx.fillRect(Math.round(px), Math.round(py), s, s)
  }
  ctx.globalAlpha = 1
  ctx.restore()

  if (sheet) {
    const frame = sheet.fps > 0 ? Math.floor(g.time * sheet.fps) : 0
    ctx.save()
    ctx.globalAlpha = Math.min(1, a.glow * 1.4)
    // Drawn from its middle rather than its feet: it has none.
    const k = CONFIG.ABDUCT.naveScale
    drawSheet(ctx, sheet, frame, a.x, sy + (sheet.fh * k) / 2, a.dx < 0, k)
    ctx.restore()
  } else {
    ctx.fillStyle = 'rgba(40,70,58,' + a.glow.toFixed(2) + ')'
    ctx.beginPath(); ctx.ellipse(a.x, sy, 60, 18, 0, 0, Math.PI * 2); ctx.fill()
  }
}

function drawBark(g: Game, ctx: CanvasRenderingContext2D) {
  bubble(g, ctx, g.bark, g.player.x, g.player.y, 'rgba(12,14,16,0.88)', 'rgba(244,236,216,0.30)')

  /*
   * AND WHATEVER THE BOSS IS SAYING, in its own bubble over its own head.
   *
   * A separate channel rather than the player's, because during a fight the
   * two of them talk constantly and sharing one would mean the boss's lines —
   * the rarer and more interesting half — are the ones that get eaten. Placed
   * against `bossRef` at draw time, so it cannot outlive what said it.
   */
  const boss = g.bossRef
  if (boss && g.bossBark) {
    bubble(
      g, ctx, g.bossBark, boss.x,
      boss.y - (boss.def.hover ?? 0) - (boss.def.size ?? 40) * 0.55,
      'rgba(8,20,10,0.9)', 'rgba(140,240,150,0.45)',
    )
  }
}

/** One speech bubble, wherever it belongs. */
function bubble(
  g: Game, ctx: CanvasRenderingContext2D,
  bark: { text: string; t: number } | null,
  ax: number, ay: number, fill: string, edge: string,
) {
  if (!bark) return

  const alpha = bark.t < 0.18 ? bark.t / 0.18
    : bark.t > 2.2 ? Math.max(0, 1 - (bark.t - 2.2) / 0.4)
    : 1
  if (alpha <= 0) return

  /*
   * SMALL, because it is a comment and not an announcement.
   *
   * It was 7px wrapped at 168 units with twelve units of leading, which on a
   * phone in portrait is a panel covering most of the width of the screen and
   * a good part of its height — over a fight, in the middle of which is the
   * thing the player is actually trying to look at. He talks constantly; a
   * bubble that big turns every third line into an obstruction.
   *
   * 6px at 140 is a little under two thirds the area. Still readable at the
   * smallest zoom the camera clamps to, and small enough to be scenery.
   *
   * 140 AND NOT LESS, because `wrapBark` caps at three lines and THROWS THE
   * REST AWAY. The longest line anybody says is 54 characters, and every
   * glyph in this face is a full em wide: 140 units holds 23 per line, so
   * three of them clear the worst case with room. Narrower than that and the
   * long barks quietly lose their last few words.
   */
  ctx.font = '6px ' + PIXEL
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  // Wrapped rather than stretched. A single long line makes a bubble wide
  // enough to cover most of a small screen, and on a short viewport it lands
  // right on top of the HUD.
  const lines = wrapBark(ctx, bark.text, 140)
  const padX = 4
  const padY = 4
  const lineH = 9
  let w = 0
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width)
  w = Math.ceil(w) + padX * 2
  const h = lines.length * lineH + padY * 2 - 2

  // Rises slightly as it appears, so it reads as being spoken. Clamped into
  // the view: the camera keeps the player near the middle of the screen, so on
  // a short window a three-line bubble would otherwise have its first line
  // cut off above the top edge.
  const x = Math.round(ax - w / 2)
  const viewTop = g.camera.y - g.camera.viewH / 2 + 3
  const y = Math.round(Math.max(viewTop, ay - 36 - h - Math.min(4, bark.t * 22)))

  ctx.globalAlpha = alpha
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = edge
  ctx.fillRect(x, y, w, 1)
  ctx.fillRect(x, y + h - 1, w, 1)
  ctx.fillRect(x, y, 1, h)
  ctx.fillRect(x + w - 1, y, 1, h)
  // Tail pointing down at whoever is speaking.
  ctx.fillStyle = fill
  ctx.fillRect(Math.round(ax) - 2, y + h, 4, 3)
  ctx.fillRect(Math.round(ax) - 1, y + h + 3, 2, 2)

  ctx.fillStyle = '#f4ecd8'
  lines.forEach((line, i) => ctx.fillText(line, x + padX, y + padY + i * lineH))

  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/** Greedy word wrap, capped at three lines so a bubble stays a bubble. */
function wrapBark(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? line + ' ' + word : word
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line)
      line = word
      if (lines.length === 3) break
    } else {
      line = next
    }
  }
  if (line && lines.length < 3) lines.push(line)
  return lines
}

// --------------------------------------------------------------- RETICLE --

/**
 * Marks whatever the revolver has decided to shoot.
 *
 * The gun fires on its own, so without this the effect of moving the mouse is
 * invisible — the player has no way to learn that pointing changes anything.
 * Four corner ticks, drawn small enough to stay out of the way of the fight.
 */
function drawReticle(g: Game, ctx: CanvasRenderingContext2D) {
  if (!g.aimTargetActive) return
  const x = g.aimTargetX
  const y = g.aimTargetY
  const r = 11 + Math.sin(g.time * 8) * 1.2
  const arm = 4

  /*
   * IT INVERTS WHATEVER IS UNDER IT.
   *
   * A fixed colour cannot work here. The reticle was warm yellow, which is
   * legible over the church's stone and effectively invisible over the sand
   * of the caatinga, over a fire, over the daylight wash at midday — and it is
   * over exactly those things whenever it matters, because it lives wherever
   * the player is pointing.
   *
   * `difference` against white is a true photographic negative of the pixels
   * behind it, so it is bright over dark ground and dark over bright ground
   * and cannot ever be the same colour as what it is standing on. It also
   * moves with the picture rather than sitting on top of it, which is what
   * makes it read as part of the scene.
   *
   * ONE HOLE IN THAT: mid-grey inverts to mid-grey. So the corners are laid
   * down twice — a hairline of hard black underneath, then the inverting
   * stroke over it. The outline is what survives the one colour the negative
   * cannot beat.
   */
  const corners = (w: number) => {
    ctx.lineWidth = w
    ctx.beginPath()
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      ctx.moveTo(x + sx * r, y + sy * r - sy * arm)
      ctx.lineTo(x + sx * r, y + sy * r)
      ctx.lineTo(x + sx * r - sx * arm, y + sy * r)
    }
    ctx.stroke()
  }

  ctx.save()
  ctx.lineCap = 'square'
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  corners(3)

  ctx.globalCompositeOperation = 'difference'
  ctx.strokeStyle = '#fff'
  corners(1.5)

  // And a dot in the middle, which is the pixel the shot is actually going to.
  ctx.fillStyle = '#fff'
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2)
  ctx.restore()
}

// ------------------------------------------------------------------- RAIN --

/**
 * DANÇA DA CHUVA, drawn where it actually is: around him.
 *
 * A disc on the ground, a rim so the edge is unambiguous, and streaks falling
 * inside it. The streaks fall on a shared clock offset per streak rather than
 * being randomised each frame — random per frame is what made the first
 * version read as static rather than as rain, because nothing ever appeared to
 * MOVE, it just flickered in different places.
 *
 * The rim tightens over the last second, so the ability announces its own
 * ending instead of simply vanishing.
 */
function drawRain(g: Game, ctx: CanvasRenderingContext2D) {
  const p = g.player
  if (p.rainT <= 0) return
  const stacks = p.abilities.chuva.stacks
  if (stacks <= 0) return

  const radius = at(ABILITIES.chuva.radius, stacks)
  const cy = p.y - 8
  const ending = Math.min(1, p.rainT / 0.9)

  /*
   * DANCA DA CHUVA — ONE SPRITE, FALLING, AND NOTHING ELSE.
   *
   * There used to be five things stacked here: a filled blue disc on the
   * ground, three drifting cloud sprites overhead, a sheet of animated
   * streaks, a splash ring under every drop, and a procedural streak fallback
   * beneath all of it. Each was defensible on its own and together they were
   * mud — five kinds of blue over the same two hundred units, not one of them
   * reading as the thing the ability actually is.
   *
   * What is left is the raindrop, drawn a great many times. Weather is not a
   * complicated image; it is a simple one repeated, and the drop already looks
   * like rain, which none of the rest did.
   *
   * THE RING SURVIVES, and only the ring. The filled disc went with everything
   * else — it was a shadow on the floor, not weather — but the outline stays,
   * because this is an area you are meant to keep enemies inside and knowing
   * exactly where it stops is the whole of playing it well.
   */
  ctx.save()
  ctx.globalAlpha = (0.55 + Math.sin(g.time * 6) * 0.12) * ending
  ctx.strokeStyle = '#bfe4ff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(p.x, cy, radius * (0.86 + 0.14 * ending), radius * 0.55 * (0.86 + 0.14 * ending),
    0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  /*
   * AND THE RAIN.
   *
   * Positions come from a hash of the index and the clock — no pool, no
   * allocation, and the whole field is one loop of `drawImage`. `fall` is
   * normalised 0..1 and every drop carries its own phase, so at any instant
   * the column is full at every height instead of pulsing in unison.
   *
   * Denser than it was, because it is carrying the effect by itself now: what
   * used to be a scattering of drops over a pile of other artwork has to be an
   * actual downpour.
   */
  const drop = g.assets.icon('drop')
  if (!drop) return

  const n = Math.max(28, Math.round(radius / 3.2))
  const top = cy - 92
  ctx.save()
  for (let k = 0; k < n; k++) {
    const seed = k * 12.9898
    const fx1 = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1
    const fy1 = ((Math.sin(seed * 1.7) * 24634.6345) % 1 + 1) % 1
    const a = fx1 * Math.PI * 2
    const rr = Math.sqrt(fy1) * radius * 0.92
    const dx = p.x + Math.cos(a) * rr
    const dy0 = cy + Math.sin(a) * rr * 0.55
    // 0 up in the air, 1 on the ground, and round again.
    const fall = ((g.time * (1.5 + fy1 * 0.9) + fx1) % 1)
    const y = top + (dy0 - top) * fall
    const s = 7
    // Fades in as it enters the top of the column rather than appearing there.
    ctx.globalAlpha = ending * (fall < 0.12 ? fall / 0.12 : 1)
    ctx.drawImage(drop, Math.round(dx - s / 2), Math.round(y - s / 2), s, s)
  }
  ctx.restore()
}

// ----------------------------------------------------------------- STORMS --

/**
 * DANÇA DA CHUVA and COGUMELO: the two things that sit on the floor and hurt.
 *
 * Both are drawn under the actors, because a hazard the horde is standing in
 * has to be readable THROUGH the horde — painted on top it would just be a
 * disc hiding the enemies the player is trying to shoot.
 *
 * The waiting period is drawn differently from the working one on purpose. A
 * patch that has not started yet is an outline; once it bites it fills in. The
 * player has to be able to tell at a glance which of the two they are looking
 * at, because walking into one is fine and walking into the other is not.
 */
/**
 * A BLACK COPY OF AN ICON, made once and kept.
 *
 * Sheets get their silhouettes at load — see `assets` — but icons are plain
 * `<img>` elements and there is nowhere to hang one. This builds it the first
 * time it is asked for and memoises on the image itself, which is fine because
 * there are five bolts and they are the only thing that wants it.
 */
const darkCopies = new WeakMap<CanvasImageSource, HTMLCanvasElement>()

/**
 * A SHEET FILLED WITH FIRE, and its mirror.
 *
 * Built from the WHITE silhouette the hit flash already pre-renders, so the
 * shape is the sprite's own alpha and it follows every frame of the walk cycle
 * without anybody drawing a second set of art.
 *
 * Filled with a vertical gradient rather than a flat colour, because a body on
 * fire is white at the feet and red at the shoulders — a flat orange wash is
 * a costume, not a fire.
 *
 * Cached per sheet and both facings baked at once: mirroring with
 * save/scale/restore is a full context state change, and this is drawn every
 * frame for as long as the button is held.
 */
const hotCopies = new Map<Sheet, { plain: HTMLCanvasElement; flipped: HTMLCanvasElement }>()

function hotCopy(sheet: Sheet) {
  const had = hotCopies.get(sheet)
  if (had) return had

  const w = sheet.fw * sheet.frames
  const h = sheet.fh
  if (w <= 0 || h <= 0) return null

  const make = (src: CanvasImageSource) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')!
    x.imageSmoothingEnabled = false
    x.drawImage(src, 0, 0)
    x.globalCompositeOperation = 'source-in'
    const grd = x.createLinearGradient(0, 0, 0, h)
    grd.addColorStop(0, '#ff5a1e')
    grd.addColorStop(0.55, '#ffb43c')
    grd.addColorStop(1, '#fff0c8')
    x.fillStyle = grd
    x.fillRect(0, 0, w, h)
    return c
  }

  const out = { plain: make(sheet.white), flipped: make(sheet.whiteFlipped) }
  hotCopies.set(sheet, out)
  return out
}

function darkCopy(img: HTMLImageElement): HTMLCanvasElement | null {
  if (!img.width) return null
  const had = darkCopies.get(img)
  if (had) return had
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const x = c.getContext('2d')!
  x.imageSmoothingEnabled = false
  x.drawImage(img, 0, 0)
  x.globalCompositeOperation = 'source-in'
  x.fillStyle = '#0a0b0d'
  x.fillRect(0, 0, c.width, c.height)
  darkCopies.set(img, c)
  return c
}

function drawStorms(g: Game, ctx: CanvasRenderingContext2D) {
  const shroom = g.assets.icon('item_cogumelo')

  for (const st of g.storms) {
    const pending = st.delay > 0

    /*
     * A PRIVADA. The cogumelo's shape in water, and no burst at the end —
     * so the rim never tightens, it simply stops. Somewhere to fight in
     * rather than somewhere to leave, which is the whole of the difference.
     */
    if (st.kind === 'privada') {
      /*
       * OUT OF THE BOWL, NOT OFF THE FLOOR.
       *
       * The spray was centred on the storm's own point, which is where the
       * toilet's FEET are — so it came out of the ground beside it and the
       * object read as scenery standing next to an unrelated puddle. Sixteen
       * units up is the rim, which is where a privada sprays from.
       *
       * Two passes: a wide one on the ground where the damage actually is, and
       * a tighter one at the rim where it is coming from. The ground pass is
       * the honest one — the ring below is what the player is judging — and
       * the rim pass is what connects it to the object.
       */
      loopFx(g, ctx, 'splashwater', st.x, st.y, (st.radius * 2.2) / 96, st.age,
        pending ? 0.2 : 0.5)
      loopFx(g, ctx, 'splashwater', st.x, st.y - 16, (st.radius * 1.1) / 96, st.age + 2.3,
        pending ? 0.25 : 0.75)

      /*
       * AND THE PRIVADA ITSELF, standing in the middle of it.
       *
       * The area was the only thing being drawn, which made the card read as
       * "a puddle happens near you" rather than as a man putting a toilet
       * down in the road. The object is the joke; the spray is the ability.
       *
       * It arrives with a bounce over the delay \u2014 dropped rather than faded
       * in \u2014 and shakes on its own clock the whole time it is working.
       */
      const loo = g.assets.icon('item_privada')
      if (loo) {
        const drop = pending ? Math.min(1, 1 - st.delay / 0.35) : 1
        const hop = pending ? (1 - drop) * 26 : 0
        const shake = pending ? 0 : Math.sin(g.time * 21 + st.x) * 0.7
        const sz = 26 * (0.7 + drop * 0.3)
        ctx.save()
        ctx.globalAlpha = 0.3
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.ellipse(st.x, st.y, sz * 0.34, sz * 0.13, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        ctx.drawImage(
          loo,
          Math.round(st.x - sz / 2 + shake), Math.round(st.y - sz + 3 - hop), sz, sz,
        )
      }
      ctx.save()
      ctx.globalAlpha = 0.34 + Math.sin(g.time * 5) * 0.1
      ctx.strokeStyle = '#b98c4e'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(st.x, st.y, st.radius, st.radius * 0.5, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      continue
    }

    /*
     * RAIO DE TUPÃ, once it has landed.
     *
     * One of five drawn forks, anchored by its FOOT on the body it struck and
     * running upward off the top of the screen — which is the way lightning
     * is actually seen, and the reason the art is drawn hanging downward. It
     * is on screen for about a sixth of a second and blinks twice in that
     * time, because a bolt that fades out is a torch beam.
     */
    if (st.kind === 'raio' && (st.flash ?? 0) > 0) {
      // The key is built from a number, so it needs the cast the typed table
      // cannot infer. There are exactly five and `strike` only ever picks 1-5.
      const art = g.assets.icon(('bolt_' + (st.bolt ?? 1)) as IconKey)
      if (art) {
        const lit = Math.floor((st.flash ?? 0) * 40) % 2 === 0
        /*
         * DRAWN AT ITS OWN SIZE, and that is a fit rather than a preference.
         * The tallest fork is 123 pixels; the camera shows about 225 world
         * units. At the 1.6x it started at, everything above the strike ran
         * off the top of the screen and all anybody saw was the thin tail —
         * the trunk, which is the part that reads as lightning, was never on
         * screen at all.
         */
        const w = art.width
        const h = art.height
        const x0 = Math.round(st.x - w / 2)
        const y0 = Math.round(st.y - h)

        /*
         * OUTLINED, THEN SOLID, THEN ADDITIVE.
         *
         * The art is cream and the caatinga is a bright green, so additive
         * alone was pale on pale and the fork simply was not there. The dark
         * silhouette offset a pixel each way is the same trick every piece of
         * text in this game uses, and it is what makes lightning legible
         * against ground of any colour; the solid pass gives it its body and
         * the additive pass on top makes it read as light rather than paint.
         */
        const shade = darkCopy(art)
        ctx.save()
        ctx.globalAlpha = (lit ? 0.85 : 0.4)
        if (shade) {
          ctx.drawImage(shade, x0 - 1, y0, w, h)
          ctx.drawImage(shade, x0 + 1, y0, w, h)
          ctx.drawImage(shade, x0, y0 + 1, w, h)
        }
        ctx.globalAlpha = lit ? 1 : 0.5
        ctx.drawImage(art, x0, y0, w, h)
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = lit ? 0.9 : 0.35
        ctx.drawImage(art, x0, y0, w, h)
        ctx.restore()
      }
      // A hot patch where it earthed.
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = Math.min(1, (st.flash ?? 0) * 5)
      const grd = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, 46)
      grd.addColorStop(0, 'rgba(255,250,214,0.85)')
      grd.addColorStop(1, 'rgba(255,236,150,0)')
      ctx.fillStyle = grd
      ctx.beginPath(); ctx.ellipse(st.x, st.y, 46, 22, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
      continue
    }

    /*
     * SALT, where a Saleiro has been. It has to read as ground rather than as
     * an effect — you are meant to notice you are standing in it, not watch it
     * arrive — so it is a flat crusted patch with no pulse and no outline.
     */
    if (st.kind === 'sal') {
      const fade = Math.min(1, st.life / 1.6)
      ctx.save()
      ctx.globalAlpha = 0.5 * fade
      ctx.fillStyle = '#e8e2d0'
      ctx.beginPath()
      ctx.ellipse(st.x, st.y, st.radius, st.radius * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
      // Grain, so it is crusted salt rather than a white disc.
      ctx.globalAlpha = 0.55 * fade
      ctx.fillStyle = '#fffdf4'
      for (let k = 0; k < 14; k++) {
        const a = (k * 2.399) % (Math.PI * 2)
        const rr = Math.sqrt(((k * 0.618) % 1)) * st.radius
        ctx.fillRect(st.x + Math.cos(a) * rr, st.y + Math.sin(a) * rr * 0.55, 2, 2)
      }
      ctx.restore()
      continue
    }

    // ---- COGUMELO ----
    // The ring is the damage; the sprite in the middle is the fuse. It swells
    // as it gets closer to going off, which is the only warning anyone gets.
    const t = 1 - Math.max(0, st.life) / 3
    ctx.save()
    if (pending) {
      ctx.globalAlpha = 0.55
      ctx.strokeStyle = '#e8b45a'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.ellipse(st.x, st.y, st.radius * 0.7, st.radius * 0.38, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.globalAlpha = 0.26 + t * 0.2
      ctx.fillStyle = '#7a5a2c'
      ctx.beginPath()
      ctx.ellipse(st.x, st.y, st.radius, st.radius * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
      // A rim that tightens as the fuse burns down.
      ctx.globalAlpha = 0.5 + Math.sin(st.age * (6 + t * 22)) * 0.3
      ctx.strokeStyle = t > 0.72 ? '#ffd24a' : '#e8b45a'
      ctx.lineWidth = 2 + t * 2
      ctx.beginPath()
      ctx.ellipse(st.x, st.y, st.radius, st.radius * 0.55, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()

    const grow = pending
      ? 0.45 + (1 - st.delay / 0.7) * 0.55
      : 1 + Math.sin(st.age * (5 + t * 20)) * 0.08 + t * 0.25
    const size = 26 * grow
    if (shroom) {
      ctx.drawImage(shroom, Math.round(st.x - size / 2), Math.round(st.y - size + 4), size, size)
    } else {
      ctx.fillStyle = '#e8c07a'
      ctx.beginPath()
      ctx.ellipse(st.x, st.y - size * 0.5, size * 0.45, size * 0.3, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/**
 * PLAYING EFFECTS, in one of two layers.
 *
 * The split matters more than it looks. A blood spray under a body reads as
 * something that happened to it; the same spray over the top hides the next
 * three enemies walking through it. A detonation is the other way round —
 * drawn under the crowd it looks like a decal, and the whole point is that it
 * went off in the air between you and them.
 *
 * Additive on purpose for everything except blood: these sheets are drawn as
 * light on black, and compositing them normally over the caatinga leaves a
 * grey box wherever the artist left a not-quite-transparent pixel.
 */
function drawFx(g: Game, ctx: CanvasRenderingContext2D, ground: boolean) {
  const items = g.fx.items
  for (let i = 0; i < items.length; i++) {
    const f = items[i]
    if (f.ground !== ground) continue
    const fx = g.assets.effect(f.key)
    if (!fx) continue
    const def = EFFECTS[f.key as EffectKey] as { pop?: boolean } | undefined

    /*
     * PIGMENT STAYS ON NORMAL COMPOSITING.
     *
     * Additive is right for the sheets that are drawn as light on black, and
     * wrong for anything drawn as paint with an outline — `lighter` throws
     * away the dark pixels, so an outlined sprite loses its outline and a red
     * one turns pink over the caatinga. Blood was already excepted; a `pop`
     * still is a drawing, so it is excepted for the same reason.
     */
    const lit = !f.key.startsWith('blood') && !def?.pop
    if (lit) { ctx.save(); ctx.globalCompositeOperation = 'lighter' }

    if (def?.pop) {
      /*
       * ONE DRAWING, GIVEN A LIFE. Starts a shade small and grows about a
       * third, and fades on a curve that holds near full for the first half
       * and drops away — so the swipe is legible on the frame it lands and
       * gone before the next body walks into the radius.
       */
      const k = f.life > 0 ? Math.min(1, f.t / f.life) : 1
      drawEffect(ctx, fx, f.x, f.y, f.t, f.scale * (0.78 + k * 0.34), f.rot, 1 - k * k)
    } else {
      drawEffect(ctx, fx, f.x, f.y, f.t, f.scale, f.rot)
    }
    if (lit) ctx.restore()
  }
}

// ---------------------------------------------------------------- PICKUPS --

function drawPickups(g: Game, ctx: CanvasRenderingContext2D) {
  const items = g.pickups.items
  const who = g.player
  /*
   * ONLY THE ONES ON SCREEN.
   *
   * There was no cull here, which was survivable while the floor held five
   * hundred things and is not now that it holds two thousand four hundred: a
   * loop of `drawImage` over every orb ever dropped, most of them kilometres
   * behind him, on every frame. The bounds are generous by a tile so a glow
   * cannot pop in at the edge.
   */
  const cam = g.camera
  const vx0 = cam.x - cam.viewW / 2 - 40
  const vx1 = cam.x + cam.viewW / 2 + 40
  const vy0 = cam.y - cam.viewH / 2 - 40
  const vy1 = cam.y + cam.viewH / 2 + 40
  const milho = g.assets.icon('item_milho')
  const milhoMini = g.assets.icon('item_milho_mini')
  const milhoBoss = g.assets.icon('item_milho_boss')
  const pao = g.assets.icon('item_pao')
  const bomba = g.assets.icon('item_bomba')
  const estrela = g.assets.icon('item_estrela')
  const totem = g.assets.icon('item_totem')

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.x < vx0 || it.x > vx1 || it.y < vy0 || it.y > vy1) continue
    // A slow bob so a field of loot is not a field of static stamps.
    const bob = Math.sin(it.age * 4 + it.x * 0.05) * 1.4

    /*
     * WHAT BEING SUCKED IN LOOKS LIKE.
     *
     * A streak behind anything that is actually travelling. One orb crossing
     * the screen at four hundred units a second is a sprite that teleports
     * between frames; forty of them converging is forty sprites teleporting,
     * which reads as flicker rather than as a current. The tail is what turns
     * the same motion into something moving.
     *
     * Only past half speed, so an orb the player merely walked near does not
     * grow a comet tail — the streak has to MEAN travelling fast, or it
     * stops meaning anything. Drawn toward where it came from, which is
     * directly away from the player, because that is where it is homing to.
     */
    if (it.magnetised && it.speed > 230) {
      const bx = it.x - who.x
      const by = it.y - (who.y - 12)
      const bd = Math.hypot(bx, by) || 1
      const len = Math.min(26, (it.speed - 230) * 0.075)
      ctx.save()
      ctx.strokeStyle = it.kind === 'corn_boss' ? 'rgba(255,206,120,0.55)'
        : it.kind === 'corn_mini' ? 'rgba(130,240,180,0.5)'
        : 'rgba(255,232,138,0.42)'
      ctx.lineWidth = it.kind === 'xp' ? 2 : 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(it.x, it.y + bob)
      ctx.lineTo(it.x + (bx / bd) * len, it.y + bob + (by / bd) * len)
      ctx.stroke()
      ctx.restore()
    }

    // A totem is a landmark, not loot: it gets a glow so it can be spotted
    // from across the caatinga, which is the only way anyone finds one.
    if (it.kind === 'totem') {
      const pulse = 0.5 + Math.sin(it.age * 2.6) * 0.5
      const r = 20 + pulse * 8
      const grd = ctx.createRadialGradient(it.x, it.y - 6, 2, it.x, it.y - 6, r)
      grd.addColorStop(0, 'rgba(201,160,255,' + (0.42 + pulse * 0.2).toFixed(2) + ')')
      grd.addColorStop(1, 'rgba(201,160,255,0)')
      ctx.fillStyle = grd
      ctx.fillRect(it.x - r, it.y - 6 - r, r * 2, r * 2)
      shadow(ctx, it.x, it.y, 7)
      if (totem) ctx.drawImage(totem, Math.round(it.x - 12), Math.round(it.y - 24 + bob * 0.5), 24, 24)
      else { ctx.fillStyle = '#e8dcc0'; ctx.fillRect(it.x - 5, it.y - 20, 10, 20) }
      continue
    }

    /*
     * THE RARE CORNS GET A GLOW AND A SIZE.
     *
     * A mini-boss dies somewhere in a field of four hundred bodies, all of
     * which are dropping identical yellow cobs; a drop that is worth thirty
     * ordinary ones and looks exactly like them is a drop nobody walks back
     * for. The halo is what makes it findable — the same trick the totem uses,
     * for the same reason.
     */
    /*
     * THE EXPLOSIVE ONE THROBS, in a colour nothing else on the floor uses.
     *
     * Every other pickup says "come and get me" and means it. This one is a
     * decision, so it has to be legible as a DIFFERENT KIND OF THING from
     * across the field — hence the red, and hence a pulse fast enough to read
     * as a fuse rather than as the gentle bob everything else does.
     */
    /*
     * THE STAR SPINS AND SHINES, because it is the best thing on the floor.
     *
     * Gold, and turning — nothing else in the game rotates, so the motion
     * alone identifies it across a field of two thousand static orbs without
     * the player having to recognise the sprite.
     */
    if (it.kind === 'star') {
      const beat = 0.5 + Math.sin(it.age * 4) * 0.5
      const r = 26 + beat * 12
      const grd = ctx.createRadialGradient(it.x, it.y, 2, it.x, it.y, r)
      grd.addColorStop(0, 'rgba(255,225,140,' + (0.4 + beat * 0.3).toFixed(2) + ')')
      grd.addColorStop(1, 'rgba(255,225,140,0)')
      ctx.fillStyle = grd
      ctx.fillRect(it.x - r, it.y - r, r * 2, r * 2)
      const s = 24
      ctx.save()
      ctx.translate(it.x, it.y + bob)
      ctx.rotate(it.age * 1.6)
      if (estrela) ctx.drawImage(estrela, -s / 2, -s / 2, s, s)
      else { ctx.fillStyle = '#ffe08a'; ctx.fillRect(-5, -5, 10, 10) }
      ctx.restore()
      continue
    }

    if (it.kind === 'bomb') {
      const beat = 0.5 + Math.sin(it.age * 7.5) * 0.5
      const r = 20 + beat * 12
      const grd = ctx.createRadialGradient(it.x, it.y, 2, it.x, it.y, r)
      grd.addColorStop(0, 'rgba(255,120,70,' + (0.30 + beat * 0.3).toFixed(2) + ')')
      grd.addColorStop(1, 'rgba(255,120,70,0)')
      ctx.fillStyle = grd
      ctx.fillRect(it.x - r, it.y - r, r * 2, r * 2)
      const s = 20 + beat * 2
      if (bomba) ctx.drawImage(bomba, Math.round(it.x - s / 2), Math.round(it.y - s / 2 + bob), s, s)
      else {
        ctx.fillStyle = '#ff7846'
        ctx.beginPath(); ctx.arc(it.x, it.y, 6, 0, Math.PI * 2); ctx.fill()
      }
      continue
    }

    const rare = it.kind === 'corn_mini' || it.kind === 'corn_boss'
    if (rare) {
      const boss = it.kind === 'corn_boss'
      const pulse = 0.5 + Math.sin(it.age * 3.4) * 0.5
      const r = (boss ? 26 : 18) + pulse * (boss ? 10 : 6)
      const rgb = boss ? '255,206,120' : '130,240,180'
      const grd = ctx.createRadialGradient(it.x, it.y, 2, it.x, it.y, r)
      grd.addColorStop(0, 'rgba(' + rgb + ',' + (0.34 + pulse * 0.22).toFixed(2) + ')')
      grd.addColorStop(1, 'rgba(' + rgb + ',0)')
      ctx.fillStyle = grd
      ctx.fillRect(it.x - r, it.y - r, r * 2, r * 2)
    }

    const art = rare
      ? (it.kind === 'corn_boss' ? milhoBoss : milhoMini)
      : it.kind === 'xp' ? milho : pao

    if (art) {
      // The icons are drawn at 32px; loot should read smaller than a person.
      const s = it.kind === 'corn_boss' ? 26 : it.kind === 'corn_mini' ? 21
        : it.kind === 'xp' ? 16 : 18
      ctx.drawImage(art, Math.round(it.x - s / 2), Math.round(it.y - s / 2 + bob), s, s)
      continue
    }

    const pulse = 1 + Math.sin(it.age * 5) * 0.12
    if (it.kind === 'xp' || rare) {
      ctx.fillStyle = '#5adcff'
      ctx.beginPath()
      ctx.moveTo(it.x, it.y - 4 * pulse)
      ctx.lineTo(it.x + 3 * pulse, it.y)
      ctx.lineTo(it.x, it.y + 4 * pulse)
      ctx.lineTo(it.x - 3 * pulse, it.y)
      ctx.closePath(); ctx.fill()
    } else {
      ctx.fillStyle = '#ff6b6b'
      ctx.fillRect(it.x - 1.5, it.y - 5, 3, 10)
      ctx.fillRect(it.x - 5, it.y - 1.5, 10, 3)
    }
  }
}

// ------------------------------------------------------------------ TAPES --

/**
 * LOST MEDIA phantoms.
 *
 * They must NOT look like a second player, or every fight becomes a question
 * of which one you are. So: washed out, tinted, scan-lined, and jittering a
 * pixel or two — the visual language of a bad transfer. The horizontal tear
 * that crawls up each one is the tell that sells it as footage rather than as
 * a translucent ally.
 */
function drawTapes(g: Game, ctx: CanvasRenderingContext2D) {
  if (g.tapes.length === 0) return
  const sheet = g.assets.sheet('player_gun_walk') ?? g.assets.sheet('player_idle')
  if (!sheet) return

  for (const t of g.tapes) {
    // Fades in over the first moment and out over the last, so a tape starting
    // and a tape ending are both events rather than pop-ins.
    const inK = Math.min(1, t.t / 0.3)
    const outK = Math.min(1, (t.life - t.t) / 0.5)
    const alpha = 0.55 * inK * outK
    // Tracking error.
    const jx = (Math.random() - 0.5) * 1.6
    const jy = (Math.random() - 0.5) * 1.2

    const frame = Math.floor(t.t * 8) % sheet.frames
    const fy = t.y + jy + CONFIG.PLAYER.footOffset

    ctx.save()
    /*
     * THE SILHOUETTE FIRST, then the sprite over it.
     *
     * The loader already builds a pure-white copy of every strip for the hit
     * flash, and layering it under a half-transparent sprite is what makes the
     * phantom read as overexposed footage rather than as a translucent ally.
     *
     * The first version tinted with `source-atop` and a fill rect. That does
     * not do what it looks like it does: a composite operation applies to the
     * WHOLE canvas, not to the sprite drawn immediately before it, so the fill
     * painted a solid grey block over the background as well. Same for the
     * scanlines. Anything clipped to a sprite has to be built from the sprite.
     */
    // The silhouette is the UNDERLAYER, not the picture: enough to blow the
    // highlights out, not so much that it stops being recognisably him.
    ctx.globalAlpha = alpha * 0.4
    drawSheet(ctx, sheet, frame, t.x + jx, fy, t.flip, 1, true)
    ctx.globalAlpha = alpha * 0.95
    drawSheet(ctx, sheet, frame, t.x + jx, fy, t.flip)

    // A chromatic ghost a pixel off, which is most of the bad-transfer look.
    ctx.globalAlpha = alpha * 0.22
    drawSheet(ctx, sheet, frame, t.x + jx - 2, fy, t.flip, 1, true)
    ctx.restore()

    // One tear crawling up it. Thin enough that overlapping the ground behind
    // it reads as interference rather than as a rectangle.
    const tear = -34 + ((g.time * 46 + t.head * 7) % 38)
    ctx.save()
    ctx.globalAlpha = alpha * 0.5
    ctx.fillStyle = '#d8c0ff'
    ctx.fillRect(t.x - 11, t.y + tear, 22, 1)
    ctx.restore()
  }
}

// ------------------------------------------------------------------- ORBS --

/**
 * THE REBIMBOCAS, which for a long time were not drawn at all.
 *
 * That was the whole of the "it doesn't work" bug: the ring dealt damage from
 * thin air, so there was nothing to tell the player it existed, nothing to
 * tell them one had been spent, and nothing to aim the ability with.
 *
 * They spin, they cast a small shadow so they read as objects rather than as
 * UI, and the newest one flashes for a moment as it is forged — the gaps are
 * the ability's whole state and they have to be legible at a glance.
 */
/**
 * THE ESCUDO VOADOR, going round.
 *
 * Same ring maths as `updateFlyingShield` and it must stay that way  + DASH +  a shield
 * drawn anywhere except where it catches things is worse than no shield, since
 * the player learns a position that is a lie.
 *
 * A drone that has just eaten something goes dark and small for its reload,
 * which is the only feedback saying the thing has a cadence at all. Without it
 * a fan of five getting thinned rather than stopped reads as the shield
 * failing at random.
 */
/**
 * WHERE THE CORN IS BEING PULLED TO.
 *
 * Three gold rings racing outward from him on staggered clocks, thinning as
 * they go. Stroked rather than filled and drawn from a path rather than a
 * sheet, which is the whole point: the sheet version of this was `nebula`, a
 * pale cloud three hundred units across, and it covered the field at exactly
 * the moment the field was the interesting part.
 *
 * OUTWARD, not inward, even though the corn is coming in. A ring collapsing
 * toward him would be drawn over the orbs while they travel and read as a
 * second set of things moving; one leaving him reads as the CAUSE, gets to the
 * edge of the screen before the corn is halfway, and is gone.
 *
 * Squashed to the same 0.55 the game draws every ground circle at, so it lies
 * on the dirt with the rain ring and the beam rather than standing up in front
 * of him.
 */
/**
 * QUEIMA ROSCA — the ring he is standing in the middle of.
 *
 * The sheet is a fire seen from ABOVE, which is the shape an aura is; `fire`
 * is a plume seen from the side and would read as a bonfire he is next to.
 * Over the top of it goes a hard rim, because the whole of playing this well
 * is knowing exactly where the ring stops, and a feathered sheet never says.
 *
 * Additive, so it reads as light rather than as paint: now that night falls on
 * Floriano, the ring a man is burning inside should be the brightest thing on
 * the street, which is what it would be.
 */
/**
 * THE AIR OVER THE FIRE, BENDING.
 *
 * The one cue that says HEAT rather than "orange things". Everything else in
 * the effect is light added on top of the picture; this is the picture itself
 * being moved, which is what hot air actually does to what is behind it.
 *
 * HOW, without a shader. The frame is already finished and sitting in the
 * canvas, so it is read back one horizontal strip at a time and redrawn a few
 * pixels sideways, with the offset running off two sine waves at unrelated
 * rates. That is a per-scanline horizontal displacement — the same operation a
 * refraction shader performs, done with about twenty blits.
 *
 * THREE THINGS KEEP IT CHEAP AND HONEST:
 *
 *   1. Strips are 3 device pixels tall and there are at most ~26 of them, so
 *      the cost is a couple of dozen small blits, not a per-pixel pass.
 *   2. It only reads the band ABOVE the ring, where rising air would be, and
 *      it fades out with height — a shimmer with a hard top edge reads as a
 *      rectangle rather than as air.
 *   3. It runs AFTER `drawDaylight`, so at night the haze bends the lit
 *      street rather than the raw one, and before the HUD, which must never
 *      wobble.
 *
 * Skipped entirely off screen, and skipped when the strip would be under a
 * pixel wide — `drawImage` with a zero-width source throws.
 */
function drawHeat(g: Game, ctx: CanvasRenderingContext2D) {
  const p = g.player
  if (!p.burning || p.abilities.queima.stacks <= 0) return

  const cam = g.camera
  const zoom = cam.zoom
  // The same number the rim is drawn with, so the column of bent air sits on
  // the ring rather than on where the ring was before the meter moved it.
  const radius = queimaRadius(p)
  const heat = p.burnHeat

  // World to screen. Shake is deliberately not applied: the haze is sampling
  // a frame that was drawn WITH the shake, so adding it again would double it.
  const sx = (p.x - cam.x) * zoom + g.canvas.width / 2
  const sy = (p.y - 6 - cam.y) * zoom + g.canvas.height / 2
  const rw = radius * zoom * 1.05
  // Rising air is taller than it is wide.
  const rh = radius * zoom * 1.35

  const top = Math.round(sy - rh)
  const bottom = Math.round(sy + radius * 0.5 * zoom)
  if (bottom < 0 || top > g.canvas.height) return

  const STRIP = 3
  const t = g.time
  ctx.save()
  for (let y = Math.max(0, top); y < Math.min(g.canvas.height - STRIP, bottom); y += STRIP) {
    // 1 at the ring, 0 at the top of the column: the wobble grows as the air
    // rises and the strip fades with it.
    const k = 1 - (bottom - y) / Math.max(1, bottom - top)
    const fade = Math.sin(Math.min(1, Math.max(0, 1 - k)) * Math.PI)
    if (fade <= 0.02) continue

    const wob = (Math.sin(y * 0.09 + t * (7 + heat * 5))
      + Math.sin(y * 0.041 - t * (4.5 + heat * 3)) * 0.6)
    const shift = Math.round(wob * (1 + k * 2.2) * zoom * (0.35 + heat * 0.45))
    if (shift === 0) continue

    const x0 = Math.round(sx - rw)
    const w = Math.round(rw * 2)
    if (w < 2) continue
    const from = Math.max(0, Math.min(g.canvas.width - w, x0))
    if (w > g.canvas.width) continue

    // Barely there when it is cold, and unmistakable at the top: the haze is
    // the one part of the effect that reaches ABOVE the ring, so it is what
    // sells a full meter to a player who is looking at the crowd.
    ctx.globalAlpha = (0.28 + heat * 0.34) * fade
    ctx.drawImage(g.canvas, from, y, w, STRIP, from + shift, y, w, STRIP)
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

/**
 * QUEIMA ROSCA, AS ONE FIRE.
 *
 * It used to be nine small flames spaced around the ellipse, because the
 * sunburn sheet has a filled white-hot core and blowing one copy up to the
 * full ring width buried the player inside a white disc. Nine copies kept the
 * middle clear — and read as nine lamps sitting on a circle. Fire is not a
 * ring of lamps.
 *
 * ONE SPRITE, BIG, AND SEE-THROUGH. The core is not the problem once the whole
 * thing is drawn at about half opacity: he reads clearly through his own fire,
 * which is the correct picture anyway (a man on fire, not a man behind fire),
 * and the sheet finally gets to be the thing it was drawn as.
 *
 * EVERYTHING HERE RIDES THE METER. Colour, opacity, the rim's pulse rate, how
 * high the embers go and whether there is smoke at all: `p.burnHeat` from 0 to
 * 1. That is deliberate — the meter decides damage, radius and the price per
 * second, and a player should never have to look away from the fight to read
 * it. Cold is a low dirty orange; at the top it is white and shaking.
 *
 * LAYERS, bottom to top, and they are not interchangeable:
 *
 *   THE SCORCH  the ground going dark under him, drawn NORMALLY so it actually
 *               darkens. Everything above is additive, and additive alone can
 *               only make a picture brighter — which is why an early version
 *               looked like a lamp: nothing was being burnt.
 *   THE BED     a radial that is coldest at his feet and hottest at the rim.
 *               Fire burns at its boundary, and the boundary is the one number
 *               the player is actually judging.
 *   THE FIRE    the sheet. One copy, centred, ring-sized, half opaque.
 *   THE EMBERS  specks lifting off and going out — the only part that leaves
 *               the circle, and the only cue that the air itself is moving.
 *   THE RIM     drawn last and hard, with the meter as an arc inside it.
 */
function drawQueima(g: Game, ctx: CanvasRenderingContext2D) {
  const p = g.player
  const stacks = p.abilities.queima.stacks
  if (stacks <= 0) return

  const t = g.time
  const cy = p.y - 6

  /*
   * COOLING OFF, after a vent.
   *
   * A blown-out ring with smoke coming off it and a bar that refills. Drawn at
   * all because an ability that simply stops responding is indistinguishable
   * from an ability that broke — the player has to be able to see that it is
   * coming back and roughly when.
   */
  if (p.burnLock > 0) {
    const Q = ABILITIES.queima
    // 0 the instant it vented, 1 when it is usable again.
    const back = 1 - p.burnLock / Q.lock
    const radius = at(Q.radius, stacks) * Q.hotRadius

    ctx.save()
    ctx.globalAlpha = 0.45 * (1 - back)
    const dead = ctx.createRadialGradient(p.x, cy, radius * 0.1, p.x, cy, radius)
    dead.addColorStop(0, 'rgba(38,12,6,0.9)')
    dead.addColorStop(1, 'rgba(18,8,8,0)')
    ctx.fillStyle = dead
    ctx.beginPath()
    ctx.ellipse(p.x, cy, radius, radius * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    smoke(ctx, p.x, cy, radius, t, (1 - back) * 0.8)

    // The bar, as an arc closing on the ring. Grey while it fills, gold on the
    // frame it completes, so the moment it is usable has a tell of its own.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = back > 0.98 ? '#ffd47a' : '#8a6a4a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(p.x, cy, radius, radius * 0.55, 0, -Math.PI / 2, -Math.PI / 2 + back * Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    return
  }

  if (!p.burning) return

  const heat = p.burnHeat
  const radius = queimaRadius(p)

  // ---- the ground, actually burnt --------------------------------------
  ctx.save()
  ctx.globalAlpha = 0.4 + heat * 0.25
  const scorch = ctx.createRadialGradient(p.x, cy, radius * 0.1, p.x, cy, radius)
  scorch.addColorStop(0, 'rgba(46,10,4,0.85)')
  scorch.addColorStop(0.7, 'rgba(30,8,6,0.5)')
  scorch.addColorStop(1, 'rgba(20,6,6,0)')
  ctx.fillStyle = scorch
  ctx.beginPath()
  ctx.ellipse(p.x, cy, radius, radius * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  /*
   * THE BED OF HEAT.
   *
   * Coldest at his feet and hottest at the rim, for two reasons: fire burns at
   * its boundary, and the middle of the circle is where the PLAYER is — an
   * early version put the white stop at the centre and he vanished into his own
   * ability, which for a power whose whole risk is walking it into a crowd is
   * the worst possible place to lose him.
   *
   * The breathing gets faster and shallower as it heats, which is most of why
   * a full meter reads as something about to go off.
   */
  const rate = 7 + heat * 9
  const breathe = 0.86 + Math.sin(t * rate) * (0.07 - heat * 0.03) + Math.sin(t * (rate * 1.6)) * 0.04
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const bed = ctx.createRadialGradient(p.x, cy, 1, p.x, cy, radius * breathe)
  bed.addColorStop(0, 'rgba(255,120,40,' + (0.04 + heat * 0.05).toFixed(3) + ')')
  bed.addColorStop(0.35, 'rgba(255,140,44,' + (0.10 + heat * 0.10).toFixed(3) + ')')
  bed.addColorStop(0.7, 'rgba(255,' + Math.round(170 + heat * 60) + ',' + Math.round(70 + heat * 70) + ','
    + (0.20 + heat * 0.18).toFixed(3) + ')')
  bed.addColorStop(0.9, 'rgba(255,' + Math.round(210 + heat * 45) + ',' + Math.round(140 + heat * 90) + ','
    + (0.24 + heat * 0.22).toFixed(3) + ')')
  bed.addColorStop(1, 'rgba(220,70,20,0)')
  ctx.fillStyle = bed
  ctx.beginPath()
  ctx.ellipse(p.x, cy, radius * breathe, radius * 0.58 * breathe, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // THE FIRE ITSELF. One sprite, centred, as wide as the ring, hollow.
  bigFire(g, ctx, p.x, cy, radius * FIRE_SPAN, 0.4 + heat * 0.2)

  // ---- and what lifts off it --------------------------------------------
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const embers = 10 + Math.round(heat * 12)
  for (let k = 0; k < embers; k++) {
    const seed = k * 12.9898
    const f = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1
    // 0 on the ring, 1 gone out.
    const rise = ((t * (0.6 + f * 0.5) + f) % 1)
    const a = f * Math.PI * 2 + rise * 0.7
    const rr = radius * (0.5 + f * 0.5)
    const ex = p.x + Math.cos(a) * rr + Math.sin(t * 5 + k) * 3
    const ey = cy + Math.sin(a) * rr * 0.55 - rise * (38 + heat * 34)
    // Cooling as it climbs: white to yellow to a dull red, then nothing.
    ctx.globalAlpha = (1 - rise) * (1 - rise) * (0.7 + heat * 0.3)
    ctx.fillStyle = rise < 0.25 ? '#fff3cf' : rise < 0.6 ? '#ffc45a' : '#e2561c'
    const sz = Math.max(1, Math.round(3 - rise * 2))
    ctx.fillRect(Math.round(ex), Math.round(ey), sz, sz)
  }
  ctx.restore()

  // Smoke only once it is genuinely hot. Below that it is a fire; above it, it
  // is a fire that is about to be a problem.
  if (heat > 0.45) smoke(ctx, p.x, cy, radius, t, (heat - 0.45) * 1.4)

  /*
   * WHERE IT STOPS, AND HOW CLOSE IT IS TO LETTING GO.
   *
   * The rim is the damage boundary and is drawn hard because the whole of
   * playing this well is knowing exactly where it ends. The arc INSIDE it is
   * the meter, filling clockwise from the top — in the world, on the thing it
   * describes, rather than in a corner of the HUD the player is not looking at
   * while surrounded.
   *
   * Both pulse faster as it climbs, and the last fifth flashes white.
   */
  const pulse = 0.5 + Math.sin(t * (9 + heat * 22)) * 0.5
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.42 + heat * 0.2 + pulse * (0.25 + heat * 0.25)
  ctx.strokeStyle = heat > 0.8 ? '#fff4d2' : heat > 0.45 ? '#ffd47a' : '#e79a3c'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(p.x, cy, radius, radius * 0.55, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.globalAlpha = 0.75
  ctx.strokeStyle = heat > 0.8 ? '#ffffff' : '#ffb43d'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(
    p.x, cy, radius * 0.9, radius * 0.5, 0,
    -Math.PI / 2, -Math.PI / 2 + heat * Math.PI * 2,
  )
  ctx.stroke()
  ctx.restore()
}

/**
 * ONE BIG FIRE WITH ITS MIDDLE TAKEN OUT.
 *
 * The sunburn sheet is a disc of flame with a filled white-hot core, and drawn
 * additively at ring size that core is a white plate: measured straight off the
 * canvas, the centre came back at 241,236,170 even with the meter cold and the
 * sprite at half opacity. The player stands exactly there. For a power whose
 * entire risk is walking it into a crowd, losing the man inside his own fire is
 * the worst thing the effect can do.
 *
 * Lowering the alpha until he shows through takes the fire down with him """ + DASH + """ it
 * stops being fire and becomes a stain. So the sprite is composited in an
 * offscreen buffer first and a soft radial hole is punched through it with
 * `destination-out`, then the whole thing goes down additively in one blit. The
 * flame keeps its brightness where it belongs (at the rim, which is also where
 * the damage is) and there is a clear well in the middle for him to stand in.
 *
 * ONE BUFFER, kept between frames. Allocating a 320px canvas every frame for
 * the whole time a button is held is a garbage-collection pause with a fire
 * drawn on it.
 */
let fireBuf: HTMLCanvasElement | null = null
/**
 * How much of the sprite's radius the well takes out.
 *
 * Measured rather than guessed: at 0.30 the hole ate 60% of the sheet's radius
 * and the flames with it, and the probe came back barely warmer than bare
 * caatinga. At 0.16 the middle reads as a dark well and the ring is still fire.
 */
const HOLE = 0.1

/**
 * HOW WIDE THE BUFFER IS DRAWN, against the ring's radius.
 *
 * Measured off the sheet frame by frame rather than guessed: `16_sunburn`'s
 * flame is an annulus that reaches only 0.41 to 0.55 of its own cell radius,
 * the rest of every frame being transparent padding. So the buffer has to be
 * laid down about four times the ring's radius for the FLAME to land on the
 * ring, and the padding around it simply draws nothing.
 *
 * THE SPRITE IS NEVER OVERSIZED INSIDE THE BUFFER to achieve that. An earlier
 * attempt scaled it up 3.4x so its art filled the 320px square — and the art
 * ran past the square, so what got composited was a fire with the BUFFER'S
 * CORNERS on it: a hard-edged bright rectangle sitting in the caatinga. The
 * padding is the thing that keeps the edges soft, and it has to survive.
 *
 * The annulus breathes between 0.41 and 0.55 across the animation, so the fire
 * moves in and out around the rim by itself. That is free, and it is better
 * than a ring that sits exactly on the line every frame.
 */
const FIRE_SPAN = 4.1

function bigFire(
  g: Game, ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number, alpha: number,
) {
  const fx = g.assets.effect('firering')
  if (!fx) return
  const S = 320
  if (!fireBuf) {
    fireBuf = document.createElement('canvas')
    fireBuf.width = S
    fireBuf.height = S
  }
  const b = fireBuf.getContext('2d')
  if (!b) return

  b.setTransform(1, 0, 0, 1, 0, 0)
  b.globalCompositeOperation = 'source-over'
  b.globalAlpha = 1
  b.clearRect(0, 0, S, S)
  // Sized to the buffer rather than to the world: the blit below does the
  // scaling, so the sheet is always sampled at the same resolution and the
  // hole is always the same fraction of it.
  drawEffect(b, fx, S / 2, S / 2, g.time, S / fx.w, 0, 1)

  b.globalCompositeOperation = 'destination-out'
  const hole = b.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * HOLE)
  hole.addColorStop(0, 'rgba(0,0,0,1)')
  hole.addColorStop(0.55, 'rgba(0,0,0,0.8)')
  hole.addColorStop(1, 'rgba(0,0,0,0)')
  b.fillStyle = hole
  b.fillRect(0, 0, S, S)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = alpha
  // Squashed, because the ring lies on the ground and everything else about
  // this effect is drawn as an ellipse at the same 0.55.
  ctx.drawImage(fireBuf, x - size / 2, y - (size * 0.62) / 2, size, size * 0.62)
  ctx.restore()
}

/**
 * DIRTY GREY SPECKS GOING UP, drawn normally rather than additively.
 *
 * Smoke that is `lighter` is not smoke — it brightens what is behind it, and
 * the one thing smoke does is take light away. Shared by the burning ring and
 * the blown-out one after a vent, which is the whole reason it is a function:
 * the cooldown should look like the same fire, just over.
 */
function smoke(
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, t: number, amount: number,
) {
  if (amount <= 0.02) return
  ctx.save()
  for (let k = 0; k < 9; k++) {
    const seed = k * 7.31 + 2.1
    const f = ((Math.sin(seed) * 20443.17) % 1 + 1) % 1
    const rise = ((t * (0.28 + f * 0.22) + f) % 1)
    const a = f * Math.PI * 2
    const rr = radius * (0.35 + f * 0.5)
    const sx = x + Math.cos(a) * rr + Math.sin(t * 1.7 + k) * (6 + rise * 14)
    const sy = y + Math.sin(a) * rr * 0.55 - rise * (60 + radius * 0.5)
    // Thins as it climbs and spreads, the way a column does.
    ctx.globalAlpha = Math.sin(rise * Math.PI) * 0.22 * amount
    ctx.fillStyle = rise < 0.4 ? '#4a3f3a' : '#6a6260'
    const sz = Math.round(2 + rise * 4)
    ctx.fillRect(Math.round(sx), Math.round(sy), sz, sz)
  }
  ctx.restore()
}

function drawStarPull(g: Game, ctx: CanvasRenderingContext2D) {
  if (g.starPull <= 0) return
  const p = g.player
  const life = 0.75
  // 0 the instant it fired, 1 as it finishes.
  const t = 1 - g.starPull / life

  ctx.save()
  ctx.lineCap = "round"
  for (let i = 0; i < 3; i++) {
    // Staggered, so it is a pulse rather than one thick line.
    const k = t - i * 0.16
    if (k <= 0 || k >= 1) continue
    // Fast out of the gate and easing as it goes, like a shockwave does.
    const r = 26 + (1 - (1 - k) * (1 - k)) * 210
    ctx.globalAlpha = (1 - k) * 0.7
    ctx.strokeStyle = i === 0 ? "#fff2c4" : "#ffcf5e"
    ctx.lineWidth = 3.5 - i
    ctx.beginPath()
    ctx.ellipse(p.x, p.y - 8, r, r * 0.55, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawFlyingShields(g: Game, ctx: CanvasRenderingContext2D) {
  const p = g.player
  const stacks = p.abilities.escudo_voador.stacks
  if (stacks <= 0) return
  const S = ABILITIES.escudo_voador
  const n = at(S.count, stacks)
  const reload = at(S.reload, stacks)
  const art = g.assets.icon('item_voador')

  for (let i = 0; i < n; i++) {
    const ang = p.shieldSpin + (i / n) * Math.PI * 2
    const x = p.x + Math.cos(ang) * S.radius
    const y = p.y - 12 + Math.sin(ang) * S.radius * 0.7
    // 1 armed, 0 the instant it caught something.
    const k = 1 - Math.max(0, Math.min(1, (p.shieldCd[i] ?? 0) / reload))

    // Behind him it sits smaller, so the ring reads as a circle on the ground.
    const depth = 0.86 + Math.sin(ang) * 0.14
    const sz = Math.round(S.size * 1.9 * depth * (0.62 + k * 0.38))

    // Armed, it carries a little of its own light.
    if (k > 0.5) {
      const glow = (k - 0.5) * 2
      const r = sz * 1.5
      const grd = ctx.createRadialGradient(x, y, 1, x, y, r)
      grd.addColorStop(0, 'rgba(110,240,190,' + (0.3 * glow).toFixed(2) + ')')
      grd.addColorStop(1, 'rgba(110,240,190,0)')
      ctx.fillStyle = grd
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }

    ctx.save()
    ctx.globalAlpha = 0.35 + k * 0.65
    if (art) ctx.drawImage(art, Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz)
    else {
      ctx.fillStyle = k > 0.5 ? '#6ef0be' : '#3a6a58'
      ctx.fillRect(Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz)
    }
    ctx.restore()
  }
}

function drawOrbs(g: Game, ctx: CanvasRenderingContext2D) {
  const p = g.player
  if (p.orbs.length === 0) return
  const O = ABILITIES.orbital
  const art = g.assets.icon('up_bullet_around')
  const cy = p.y - 12

  for (let i = 0; i < p.orbs.length; i++) {
    const ang = p.orbs[i] + p.orbSpin
    const x = p.x + Math.cos(ang) * O.radius
    const y = cy + Math.sin(ang) * O.radius * 0.62

    // Behind him they sit lower and smaller, so the ring reads as a circle on
    // the ground rather than a flat disc pasted over his head.
    const depth = 0.86 + Math.sin(ang) * 0.14
    const sz = Math.round(O.size * 2.1 * depth)

    ctx.save()
    ctx.globalAlpha = 0.25
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(x, cy + Math.sin(ang) * O.radius * 0.62 + 12, sz * 0.4, sz * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    /*
     * A SHORT ARC OF SMEAR BEHIND EACH ONE.
     *
     * They turn at three radians a second now, which is fast enough that a
     * single stamped sprite strobes rather than orbits. Three ghosts at
     * earlier angles on the same ring cost nothing and turn the ring into
     * something that is visibly MOVING — which matters, because the whole read
     * of this ability is which parts of the circle are still armed.
     */
    for (let t = 3; t >= 1; t--) {
      const ta = ang - t * 0.16
      const tx = p.x + Math.cos(ta) * O.radius
      const ty = cy + Math.sin(ta) * O.radius * 0.62
      const ts = sz * (1 - t * 0.16)
      ctx.save()
      ctx.globalAlpha = (1 - t / 4) * 0.34
      ctx.translate(tx, ty)
      ctx.rotate(g.time * 5 + i - t * 0.4)
      if (art) ctx.drawImage(art, -ts / 2, -ts / 2, ts, ts)
      ctx.restore()
    }

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(g.time * 5 + i)
    if (art) ctx.drawImage(art, -sz / 2, -sz / 2, sz, sz)
    else {
      ctx.fillStyle = '#b9b2a4'
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz)
    }
    ctx.restore()
  }
}

// ------------------------------------------------------------------ GUIDE --

/**
 * THE ARROW, and the only reason the road is not missed.
 *
 * With a band of asphalt running east, direction was free — you looked down
 * and the world told you where to go. An open field owes you that answer some
 * other way, so this is it: an arrow orbiting the player, pointing along the
 * route at a spot some way ahead of wherever he currently is.
 *
 * IT AIMS AHEAD, NOT AT THE NEAREST POINT. Pointing at the closest bit of
 * route would swing wildly whenever he stepped across it and would say
 * "you are here" rather than "go that way". Looking a fixed distance further
 * on makes it lead him round the bends instead of into them.
 *
 * It fades out while he is on course and on the path, because an arrow that
 * never stops shouting is one you stop reading. Wander off, or turn around,
 * and it comes back.
 */
function drawGuide(g: Game, ctx: CanvasRenderingContext2D) {
  if (g.arenaLocked) return
  const p = g.player
  const route = g.chunks.route

  const here = route.nearest(p.x, p.y)
  /*
   * ONCE THE MICROSOFT IS DOWN, THE ARROW STOPS BEING A COMPASS.
   *
   * For the whole game up to here it points a little way further along the
   * route, which is right while the answer is "keep walking". After act two
   * the answer is a specific door, and an arrow that still only says "onward"
   * would leave the player wandering a square looking for the thing the game
   * just told them about. So it locks onto the church, at full brightness,
   * with the distance on it.
   */
  const toChurch = g.bossesDone.has('streets') && g.act3.phase === 'outside'
  const look = toChurch
    ? CHURCH_DOOR
    : Math.min(route.total, Math.max(here.d, p.reach) + 420)
  const goal = route.pointAt(look)
  const ang = Math.atan2(goal.y - (p.y - 14), goal.x - p.x)

  /*
   * Loud when it is needed, quiet when it is not: strays off the corridor and
   * facing the wrong way both bring it back up.
   */
  const strayed = Math.min(1, here.lateral / 340)
  const facing = Math.atan2(p.aimY, p.aimX)
  let off = Math.abs(((ang - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
  off = Math.min(1, off / 1.5)
  const alpha = toChurch ? 1 : 0.3 + 0.62 * Math.max(strayed, off)

  const r = 44
  const cx = p.x + Math.cos(ang) * r
  const cy = p.y - 14 + Math.sin(ang) * r
  const bob = Math.sin(g.time * 4) * 2

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(cx, cy + bob)
  ctx.rotate(ang)

  /*
   * THE ARROW ITSELF, from the UI pack, drawn twice.
   *
   * A faint copy trailing behind the bright one, so the thing has a direction
   * of travel rather than simply an orientation — which is the difference
   * between a sign and a nudge. It swells a little on the beat the whole
   * marker bobs on, because a compass that breathes is one the eye returns to.
   */
  const art = g.assets.icon('guide_arrow')
  if (art) {
    const w = 22 + Math.sin(g.time * 4) * 1.5
    const h2 = w * (art.height / art.width)
    ctx.globalAlpha = alpha * 0.32
    ctx.drawImage(art, Math.round(-w / 2 - 9), Math.round(-h2 / 2), w, h2)
    ctx.globalAlpha = alpha
    ctx.drawImage(art, Math.round(-w / 2), Math.round(-h2 / 2), w, h2)
  } else {
    // Kept for a build with no art: the chevron this used to be.
    ctx.strokeStyle = '#ffe98a'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(-7, -8)
    ctx.lineTo(4, 0)
    ctx.lineTo(-7, 8)
    ctx.stroke()
  }
  ctx.restore()

  /*
   * How far there is left to go, under the arrow. Only while he is off the
   * path — on it, the arrow alone is enough and the number is clutter.
   */
  if (toChurch || strayed > 0.35) {
    const target = toChurch ? CHURCH_DOOR : route.total
    const left = Math.max(0, Math.round((target - Math.max(here.d, p.reach)) / 10) * 10)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#ffe98a'
    ctx.font = '6px ' + PIXEL
    ctx.textAlign = 'center'
    ctx.fillText(toChurch ? 'IGREJA ' + left + 'm' : left + 'm', cx, cy + bob + 20)
    ctx.restore()
  }
}

// --------------------------------------------------------------- FLOATERS --

function drawFloaters(g: Game, ctx: CanvasRenderingContext2D) {
  const items = g.floaters.items
  ctx.font = '6px ' + PIXEL
  ctx.textAlign = 'center'
  for (let i = 0; i < items.length; i++) {
    const f = items[i]
    ctx.globalAlpha = Math.min(1, f.life / (f.maxLife * 0.5))
    ctx.fillStyle = '#000'
    ctx.fillText(f.text, f.x + 1, f.y + 1)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
}

// --------------------------------------------------------------- INTERIOR --

/**
 * INSIDE THE CHURCH.
 *
 * The floor tile alone does not make a room. What sells an interior is that
 * the light stops coming from everywhere: the edges of the view go dark, and
 * what is left comes down in shafts from windows that are not drawn, because
 * they are above the top of the camera and always will be.
 *
 * Painted in WORLD space, over the ground and under everything alive, so the
 * shafts stay nailed to the floor as he walks rather than sliding with the
 * camera like a screen effect — which is what would make it read as a filter
 * on the game instead of as a place.
 */
function drawInterior(g: Game, ctx: CanvasRenderingContext2D) {
  const cam = g.camera
  const x = cam.x - cam.viewW / 2
  const y = cam.y - cam.viewH / 2
  const w = cam.viewW
  const h = cam.viewH

  // Cold, and quite dark. The green comes from what is parked in the room.
  ctx.fillStyle = 'rgba(10,16,20,0.46)'
  ctx.fillRect(x, y, w, h)

  /*
   * SHAFTS. Positioned on a fixed world lattice rather than relative to the
   * camera, so they are objects in the room. Only the two or three on screen
   * cost anything.
   */
  const step = 260
  const first = Math.floor(x / step) * step
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let sx = first; sx < x + w + step; sx += step) {
    const flick = 0.82 + Math.sin(g.time * 0.7 + sx * 0.01) * 0.18
    const grd = ctx.createLinearGradient(sx, y, sx + 54, y + h)
    grd.addColorStop(0, 'rgba(180,214,255,' + (0.075 * flick).toFixed(3) + ')')
    grd.addColorStop(0.55, 'rgba(150,200,255,' + (0.038 * flick).toFixed(3) + ')')
    grd.addColorStop(1, 'rgba(140,190,255,0)')
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.moveTo(sx, y)
    ctx.lineTo(sx + 66, y)
    ctx.lineTo(sx + 128, y + h)
    ctx.lineTo(sx + 44, y + h)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // A vignette, so the walls of the room are implied at the edge of sight.
  const vig = ctx.createRadialGradient(
    cam.x, cam.y, Math.min(w, h) * 0.28, cam.x, cam.y, Math.max(w, h) * 0.72,
  )
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(4,8,10,0.55)')
  ctx.fillStyle = vig
  ctx.fillRect(x, y, w, h)
}

// ------------------------------------------------------------------ ARENA --

function drawArena(g: Game, ctx: CanvasRenderingContext2D, time: number) {
  const a = g.activeArena
  if (!a) return
  const x = a.centerX - a.halfW
  const y = a.centerY - a.halfH
  const w = a.halfW * 2
  const h = a.halfH * 2
  const pulse = 0.35 + Math.sin(time * 3) * 0.12
  // The barrier belongs to whatever closed it, so it wears the enemy's green.
  ctx.strokeStyle = 'rgba(111,217,122,' + pulse.toFixed(3) + ')'
  ctx.lineWidth = 6
  ctx.strokeRect(x, y, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,' + (pulse * 0.5).toFixed(3) + ')'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)
}


// ------------------------------------------------------------------ LIGHT --

/**
 * THE HOUR OF THE DAY, laid over the finished frame.
 *
 * Two passes and a buffer.
 *
 *   THE WASH is a single rectangle in `multiply`, which is what a change of
 *   light actually is: everything keeps its own colour and loses some of it to
 *   the colour of the sky. Alpha-blending a flat colour over the top instead
 *   would wash the whole frame toward grey and take the pixel art with it.
 *
 *   THE LAMPS punch back. The wash goes into an offscreen buffer first, holes
 *   are cut in it where the lights are with `destination-out`, and only then
 *   is it composited — so a street lamp is not a bright circle painted on top
 *   of the dark, it is a place the dark never reached. That is the difference
 *   between a glow sticker and a light.
 *
 *   THE BLOOM is the warm half hour, an additive sheet in `lighter` while the
 *   sun is low, and nothing at all before or after.
 *
 * The buffer runs at half resolution. It costs a quarter of the fill and the
 * upscale blurs the light pools for free, which is what they want anyway.
 */

/** Reused between frames. Allocating two canvases at 60Hz is not a plan. */
let lightBuf: HTMLCanvasElement | null = null

function lightBuffer(w: number, h: number) {
  if (!lightBuf) lightBuf = document.createElement('canvas')
  if (lightBuf.width !== w || lightBuf.height !== h) {
    lightBuf.width = w
    lightBuf.height = h
  }
  return lightBuf
}

/** Every prop in view, reused so the light pass allocates nothing. */
const lampBuf: Prop[] = []

function drawDaylight(g: Game, ctx: CanvasRenderingContext2D) {
  /*
   * INDOORS IS ITS OWN LIGHT.
   *
   * The church already has a vignette and shafts through windows that are
   * above the top of the camera. Laying an outdoor sunset over that would be
   * describing weather nobody in the room can see.
   */
  if (g.act3.phase !== 'outside') return

  const sky = skyAt(timeOfDay(g.player.reach))
  const cam = g.camera
  const W = g.canvas.width
  const H = g.canvas.height
  const sx = W / cam.viewW
  const sy = H / cam.viewH
  const x0 = cam.x - cam.viewW / 2
  const y0 = cam.y - cam.viewH / 2
  const toX = (wx: number) => (wx - x0) * sx
  const toY = (wy: number) => (wy - y0) * sy

  /*
   * The wash is skipped at midday, when there is nothing to wash with — but
   * the air pass at the bottom of this function is NOT, because rays and dust
   * and a vignette are exactly what a midday frame is missing. This used to
   * return early on both and the first ten minutes of the road had no
   * atmosphere at all.
   */
  // ---- the wash, with holes where the lights are ------------------------
  if (sky.depth > 0.002) {
    const bw = Math.max(1, W >> 1)
    const bh = Math.max(1, H >> 1)
    const buf = lightBuffer(bw, bh)
    const bg = buf.getContext('2d')!
    bg.globalCompositeOperation = 'source-over'
    bg.clearRect(0, 0, bw, bh)
    bg.fillStyle = 'rgb(' + (sky.r | 0) + ',' + (sky.g | 0) + ',' + (sky.b | 0) + ')'
    bg.fillRect(0, 0, bw, bh)

    if (sky.night > 0.02) {
      bg.globalCompositeOperation = 'destination-out'

      /*
       * STREET LAMPS. The light comes off the top of the post, not its foot,
       * and Floriano put one every hundred and thirty units down the lane for
       * exactly this evening.
       */
      const pad = 140
      g.chunks.props.query(x0 - pad, y0 - pad, x0 + cam.viewW + pad, y0 + cam.viewH + pad, lampBuf)
      for (let i = 0; i < lampBuf.length; i++) {
        const p = lampBuf[i]
        if (p.icon !== 'e_luz') continue
        hole(bg, toX(p.x) / 2, toY(p.y - p.h * 0.78) / 2, 96 * sx / 2, sky.night * 0.95)
      }

      /*
       * AND HE CARRIES A LITTLE OF HIS OWN.
       *
       * Not a torch and not a mechanic — just enough that the ground he is
       * standing on is never in question. This is the line between a night
       * that looks good and a night that plays badly, and it is worth being
       * unsubtle about.
       */
      hole(bg, toX(g.player.x) / 2, toY(g.player.y - 12) / 2, 54 * sx / 2, sky.night * 0.55)

      /*
       * AND WHATEVER OUT THERE IS LIT.
       *
       * A Glowie, a pillar of alien tech, a building with a lit window for a
       * head. Same two passes the lamps get — a hole in the wash so the ground
       * under it stays visible, then the colour over the top further down —
       * because a thing that "glows" and lights nothing around it is just a
       * bright sprite, and at night that reads as a sticker.
       */
      for (let i = g.enemies.items.length - 1; i >= 0; i--) {
        const e = g.enemies.items[i]
        const em = e.def.emits
        // A dormant rocket is a pipe on the ground; only a lit one is a light.
        if (!em || (e.def.detectRange !== undefined && !e.awake)) continue
        // The rocket's light is not steady. See `emitPulse`.
        const beat = emitPulse(g, e)
        hole(
          bg, toX(e.x) / 2, toY(e.y - (e.def.hover ?? 0) - 8) / 2,
          em.radius * sx * Math.min(1.5, beat) / 2,
          Math.min(1, sky.night * em.strength * 0.95 * beat),
        )
      }

      /*
       * AND THE SHIP LIGHTS THE ROAD UNDER IT.
       *
       * By the time the passes get frequent it is dusk over Floriano, and a
       * green circle painted under a night wash is a grey circle. It has to
       * punch through the same way a street lamp does or the one hazard that
       * is entirely about seeing it coming stops being visible exactly when it
       * starts happening often.
       */
      if (g.abduct.glow > 0.01) {
        const a = g.abduct
        hole(bg, toX(a.x) / 2, toY(a.y) / 2,
          CONFIG.ABDUCT.beam * 2.1 * sx / 2, sky.night * a.glow)
      }
    }

    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = sky.depth
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(buf, 0, 0, W, H)
    ctx.restore()
  }

  // ---- the warm half hour ------------------------------------------------
  if (sky.warmA > 0.002) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = 'rgba(' + (sky.warmR | 0) + ',' + (sky.warmG | 0) + ','
      + (sky.warmB | 0) + ',' + sky.warmA.toFixed(3) + ')'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  // ---- and the lamps themselves glow -------------------------------------
  if (sky.night > 0.05) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < lampBuf.length; i++) {
      const p = lampBuf[i]
      if (p.icon !== 'e_luz') continue
      const lx = toX(p.x)
      const ly = toY(p.y - p.h * 0.78)
      const r = 76 * sx
      const grd = ctx.createRadialGradient(lx, ly, 0, lx, ly, r)
      // Sodium orange, because that is what is actually on a pole in Piauí.
      grd.addColorStop(0, 'rgba(255,201,112,' + (0.42 * sky.night).toFixed(3) + ')')
      grd.addColorStop(0.45, 'rgba(255,170,74,' + (0.15 * sky.night).toFixed(3) + ')')
      grd.addColorStop(1, 'rgba(255,150,60,0)')
      ctx.fillStyle = grd
      ctx.fillRect(lx - r, ly - r, r * 2, r * 2)
    }

    /*
     * THE COLOUR OF EACH ONE, over the top of the wash.
     *
     * Additive and small: the hole above is what makes the ground readable,
     * and this is only what tells you the light is green rather than sodium.
     */
    for (let i = g.enemies.items.length - 1; i >= 0; i--) {
      const e = g.enemies.items[i]
      const em = e.def.emits
      if (!em || (e.def.detectRange !== undefined && !e.awake)) continue
      const ex = toX(e.x)
      const ey = toY(e.y - (e.def.hover ?? 0) - 8)
      const beat = emitPulse(g, e)
      const r = em.radius * 0.8 * sx * Math.min(1.6, beat)
      const k = Math.min(1, sky.night * em.strength * beat)
      const grd = ctx.createRadialGradient(ex, ey, 0, ex, ey, r)
      grd.addColorStop(0, 'rgba(' + em.r + ',' + em.g + ',' + em.b + ',' + (0.34 * k).toFixed(3) + ')')
      grd.addColorStop(0.5, 'rgba(' + em.r + ',' + em.g + ',' + em.b + ',' + (0.12 * k).toFixed(3) + ')')
      grd.addColorStop(1, 'rgba(' + em.r + ',' + em.g + ',' + em.b + ',0)')
      ctx.fillStyle = grd
      ctx.fillRect(ex - r, ey - r, r * 2, r * 2)
    }

    // The beam's own colour, over the top of everything, so at night it is
    // the brightest thing on the road — which is what it would be.
    if (g.abduct.glow > 0.01) {
      const a = g.abduct
      const bx = toX(a.x)
      const by = toY(a.y)
      const r = CONFIG.ABDUCT.beam * 2.2 * sx
      const grd = ctx.createRadialGradient(bx, by, 0, bx, by, r)
      const k = sky.night * a.glow
      grd.addColorStop(0, 'rgba(150,255,175,' + (0.34 * k).toFixed(3) + ')')
      grd.addColorStop(0.5, 'rgba(96,224,142,' + (0.12 * k).toFixed(3) + ')')
      grd.addColorStop(1, 'rgba(80,200,120,0)')
      ctx.fillStyle = grd
      ctx.fillRect(bx - r, by - r, r * 2, r * 2)
    }
    ctx.restore()
  }

  drawAir(g, ctx, sky, W, H)
}

/**
 * THE AIR BETWEEN THE CAMERA AND THE GROUND.
 *
 * Everything above this point is about how bright the WORLD is. This is about
 * what is in front of it — the bars of light coming across the road, the sun
 * off past the corner, the dust hanging in it, and the corners of the frame
 * going down. None of it touches gameplay and none of it can: it is drawn last
 * and it is all additive except the vignette.
 *
 * There are no shaders here because there is no GL context here. What there is
 * instead is four screen-space passes that cost about as much as one sprite,
 * and the reason they read as light rather than as gradients is that all four
 * agree with `shadow()` about where the sun is.
 */
function drawAir(
  g: Game, ctx: CanvasRenderingContext2D, sky: Sky, W: number, H: number,
) {
  // Where the sun is, off past the corner of the frame in its own direction.
  const reachOut = Math.hypot(W, H) * 0.62
  const sx = W / 2 + SUN_DIR_X * reachOut
  const sy = H / 2 + SUN_DIR_Y * reachOut

  // ---- the sun itself ----------------------------------------------------
  if (sky.sunA > 0.004) {
    /*
     * TIGHT. At the diagonal it covered the whole frame and stopped being a
     * sun — it was a sepia filter with a bright corner, and the ground lost
     * all of its contrast under it. Kept to about half the screen so it reads
     * as a source with a falloff rather than as a grade.
     */
    const r = Math.hypot(W, H) * 0.5
    const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r)
    grd.addColorStop(0, 'rgba(255,236,186,' + (sky.sunA * 0.55).toFixed(3) + ')')
    grd.addColorStop(0.35, 'rgba(255,186,104,' + (sky.sunA * 0.2).toFixed(3) + ')')
    grd.addColorStop(1, 'rgba(255,150,70,0)')
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  // ---- the rays ----------------------------------------------------------
  if (sky.rays > 0.004) drawShafts(g, ctx, sky, W, H, sx, sy)

  // ---- what is floating in it -------------------------------------------
  if (sky.dust > 0.02) {
    /*
     * SCREEN-SPACE ON PURPOSE. Motes parked in the world would slide across
     * the frame at walking pace and read as debris on the ground; motes in
     * front of the camera drift on their own and read as air. They are the
     * cheapest thing here by an order of magnitude and they do more for the
     * light than the rays do.
     */
    const drift = g.time * 5
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < MOTES; i++) {
      const seed = i * 12.9898
      const fx = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1
      const fy = ((Math.sin(seed * 1.7) * 24634.6345) % 1 + 1) % 1
      const sp = 0.35 + fy * 0.9
      const x = (fx * W + drift * sp * 6) % (W + 40) - 20
      const y = (fy * H + Math.sin(g.time * 0.5 + i) * 9 + drift * sp) % (H + 40) - 20
      const tw = 0.45 + 0.55 * Math.sin(g.time * (1.1 + fx) + i * 2.4)
      const a = sky.dust * 0.2 * tw
      if (a < 0.01) continue
      ctx.fillStyle = 'rgba(255,240,206,' + a.toFixed(3) + ')'
      ctx.fillRect(x, y, 2, 2)
    }
    ctx.restore()
  }

  // ---- and the corners go down ------------------------------------------
  /*
   * Drawn BEFORE the dither below, along with everything else here, because
   * this is the widest and shallowest gradient on the screen and therefore the
   * worst offender for the banding the dither exists to break up.
   */
  if (sky.vig > 0.004) {
    const grd = ctx.createRadialGradient(
      W / 2, H * 0.48, Math.min(W, H) * 0.30,
      W / 2, H * 0.48, Math.hypot(W, H) * 0.62,
    )
    grd.addColorStop(0, 'rgba(6,7,10,0)')
    grd.addColorStop(0.62, 'rgba(6,7,10,' + (sky.vig * 0.38).toFixed(3) + ')')
    grd.addColorStop(1, 'rgba(4,5,8,' + sky.vig.toFixed(3) + ')')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, W, H)
  }

  dither(ctx, W, H)
}

/**
 * THE REASON ANY OF THIS HAD LINES IN IT.
 *
 * Everything above lays wide, shallow gradients across the whole frame — the
 * shafts, the sun, the wash, and worst of all the vignette, which travels from
 * nothing to about a hundred and twenty levels over six hundred pixels. Eight
 * bits per channel cannot express that as a ramp; it expresses it as a
 * staircase with a step every five pixels, and a staircase of concentric steps
 * across a screen is read by the eye as scan lines. It is not the shafts, and
 * no amount of refining them fixes it.
 *
 * The fix is the standard one: a pixel of noise, under the quantisation step,
 * so the boundary between two levels is dissolved instead of drawn. One 64x64
 * tile built once at load, laid over the frame at about two percent.
 *
 * STATIC, not animated. Rolling the offset every frame is what a film grain
 * does, and on pixel art at this scale it crawls — the noise has to sit still
 * so it reads as the texture of the image rather than as something happening.
 */
let ditherTile: HTMLCanvasElement | null = null

function dither(ctx: CanvasRenderingContext2D, W: number, H: number) {
  if (!ditherTile) {
    const t = document.createElement('canvas')
    t.width = 64
    t.height = 64
    const c = t.getContext('2d')!
    const img = c.createImageData(64, 64)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      // Half the pixels lift, half push down: the average is unchanged, so
      // this dissolves the steps without brightening or dulling the frame.
      const up = Math.random() < 0.5
      d[i] = d[i + 1] = d[i + 2] = up ? 255 : 0
      d[i + 3] = Math.random() * 255
    }
    c.putImageData(img, 0, 0)
    ditherTile = t
  }
  ctx.save()
  ctx.globalAlpha = 0.022
  ctx.imageSmoothingEnabled = false
  const p = ctx.createPattern(ditherTile, 'repeat')
  if (p) {
    ctx.fillStyle = p
    ctx.fillRect(0, 0, W, H)
  }
  ctx.restore()
}

/*
 * ========================================================== LIGHT SHAFTS ==
 *
 * VOLUMETRIC LIGHT SCATTERING AS A POST-PROCESS — Kenny Mitchell, GPU Gems 3
 * chapter 13. It is the technique nearly every game shipped for a decade and
 * it is worth stating what it actually is, because what was here before was
 * not it.
 *
 * WHAT WAS HERE BEFORE: seven triangles fanned out from a point with a
 * gradient down each one. That draws something ray-SHAPED, but a shaft of
 * light is not a shape — it is the part of the air the light reached. Hand-
 * drawn wedges know nothing about the world they are laid over, so they slide
 * across a building instead of coming from behind it, and the moment you
 * notice that you cannot stop noticing it.
 *
 * THE ACTUAL ALGORITHM, in three parts:
 *
 *   1. AN OCCLUSION BUFFER. Render the light bright and everything that
 *      blocks it black. This is the whole idea: the shafts are defined by
 *      what is IN THE WAY, which is why they bend around a house.
 *   2. A RADIAL BLUR of that buffer, from the light's screen position. The
 *      paper does it per-pixel — walk from the pixel toward the light taking
 *      NUM_SAMPLES samples, each one attenuated by `decay^i` and scaled by
 *      `weight`. It is a summation along a ray.
 *   3. ADDITIVELY COMPOSITE the result over the finished frame.
 *
 * HOW IT IS DONE HERE, without a GL context. Step 2 reordered: instead of one
 * loop per pixel walking toward the light, one blit per SAMPLE of the whole
 * buffer scaled about the light. Drawing the buffer at scale `1 - i*step`
 * centred on the light point is exactly "sample every pixel one step nearer
 * the light", so fourteen blits give the same summation the shader's fourteen
 * texture reads would. This is the same construction UDK used for its own god
 * rays and it is the reason the effect is affordable in 2D at all.
 *
 * The buffer is quarter resolution on both axes — a sixteenth of the pixels —
 * which costs nothing and is invisible, because the output of a radial blur
 * is by definition smooth along the ray.
 */

/**
 * The occlusion map, the coarse pass, and the finished shafts. Reused; never
 * reallocated. Four because the blur is done in two passes, over a softened
 * copy of the map — see `drawShafts`.
 */
const shaftBufs: (HTMLCanvasElement | null)[] = [null, null, null, null]

function scratch(which: 0 | 1 | 2 | 3, w: number, h: number) {
  let c = shaftBufs[which]
  if (!c) { c = document.createElement('canvas'); shaftBufs[which] = c }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  return c
}

/** Occluders in view, reused so the pass allocates nothing. */
const occProps: Prop[] = []

/*
 * The paper's four knobs, and they mean here exactly what they mean there.
 * `density` is how far along the ray the samples reach, `decay` is the
 * exponential falloff between them, `weight` scales each one and `exposure`
 * is the coarse control on the lot.
 */
const SHAFT = {
  /*
   * TAPS PER PASS. There are two passes, so this is the square root of the
   * sample count — ten here is a hundred effective taps for twenty blits,
   * which is what the paper's own NUM_SAMPLES is set to.
   */
  samples: 10,
  density: 0.92,
  decay: 0.93,
  weight: 1,
  /*
   * HIGH, and safe to be. The composite is additive, so everywhere the shaft
   * buffer is dark it contributes exactly nothing — the only thing exposure
   * can brighten is a place light actually reached. Most of the buffer is
   * black once a street's worth of buildings has been punched out of it,
   * which is why this number has to be several times what a wash would want.
   */
  exposure: 2.8,
  /** How far the light itself reaches, as a fraction of the buffer diagonal. */
  reach: 1.5,
  /** Where its falloff starts. Held high so the holes punched in it bite. */
  hold: 0.58,
}

/*
 * THE SUM OF THE DECAY SERIES, so the accumulation is an AVERAGE.
 *
 * Fourteen additive blits of the same buffer is fourteen times the buffer,
 * and the paper leaves it to `weight` and `exposure` to bring that back down
 * by hand. Doing it by hand here meant the whole frame blew out the moment
 * anything else changed, so the normalisation is computed instead: divide by
 * the total the series would reach and the blur returns the brightness it was
 * given, with `exposure` the only thing left to tune.
 */
const SHAFT_NORM = (1 - Math.pow(SHAFT.decay, SHAFT.samples)) / (1 - SHAFT.decay)

/**
 * The same sum for the COARSE pass, whose taps are `samples` apart and whose
 * weights are therefore `decay^samples` apart.
 */
const SHAFT_STRIDE = Math.pow(SHAFT.decay, SHAFT.samples)
const SHAFT_NORM_COARSE =
  (1 - Math.pow(SHAFT_STRIDE, SHAFT.samples)) / (1 - SHAFT_STRIDE)

function drawShafts(
  g: Game, ctx: CanvasRenderingContext2D, sky: Sky,
  W: number, H: number, sunX: number, sunY: number,
) {
  const bw = Math.max(8, W >> 2)
  const bh = Math.max(8, H >> 2)
  const lx = sunX / 4
  const ly = sunY / 4

  // ---- 1. the occlusion buffer ------------------------------------------
  const occ = scratch(0, bw, bh)
  const o = occ.getContext('2d')!
  o.setTransform(1, 0, 0, 1, 0, 0)
  o.globalCompositeOperation = 'source-over'
  o.clearRect(0, 0, bw, bh)

  /*
   * THE LIGHT. Transparent stands in for the paper's black: what is not lit
   * contributes nothing to an additive composite, which is the same thing.
   */
  /*
   * TIGHT, and mostly off the edge of the buffer. The sun sits just outside
   * the corner, so what is on screen is the near edge of its falloff — the
   * corner is lit, the far side of the frame is not, and the shafts have
   * somewhere to travel FROM. A gradient reaching the whole buffer is not a
   * light, it is a wash, and blurring a wash gives you a brighter wash.
   */
  const reach = Math.hypot(bw, bh) * SHAFT.reach
  const lit = o.createRadialGradient(lx, ly, 0, lx, ly, reach)
  lit.addColorStop(0, 'rgba(255,246,220,1)')
  lit.addColorStop(SHAFT.hold, 'rgba(255,224,168,0.72)')
  lit.addColorStop(1, 'rgba(255,190,120,0)')
  o.fillStyle = lit
  o.fillRect(0, 0, bw, bh)

  /*
   * AND WHAT IS IN THE WAY, punched straight out of it. `destination-out`
   * uses the source's alpha, so a sprite's own transparency is the silhouette
   * and no separate occlusion art has to exist. This is the part the wedges
   * could never do.
   */
  o.globalCompositeOperation = 'destination-out'
  const cam = g.camera
  const k = bw / cam.viewW
  const x0 = cam.x - cam.viewW / 2
  const y0 = cam.y - cam.viewH / 2
  const bx = (wx: number) => (wx - x0) * k
  const by = (wy: number) => (wy - y0) * (bh / cam.viewH)

  // Props are the good occluders: a house is a hole in the sky, a cactus is a
  // slot in it. Queried well past the view because they draw upward from a
  // foot that may be below the bottom of the screen.
  const pad = 120
  g.chunks.props.query(x0 - pad, y0 - pad, x0 + cam.viewW + pad, y0 + cam.viewH + pad, occProps)
  for (let i = 0; i < occProps.length; i++) {
    const p = occProps[i]
    const img = g.assets.icon(p.icon)
    if (!img || !img.width) continue
    o.drawImage(img, bx(p.x - p.w / 2), by(p.y - p.h), p.w * k, p.h * (bh / cam.viewH))
  }

  /*
   * Bodies, but only the ones big enough to cast anything at a quarter of the
   * resolution. A cow is four pixels here and there can be two hundred of
   * them; putting every one of them in costs the whole budget and changes
   * nothing anybody can see.
   */
  const items = g.enemies.items
  for (let i = 0; i < items.length; i++) {
    const e = items[i]
    const size = (e.def.size ?? 22) * (e.buffed ? CONFIG.MINIBOSS.scale : 1)
    if (size < 34 && !e.def.elite) continue
    const sheet = e.def.sheet ? g.assets.sheet(e.def.sheet) : undefined
    if (!sheet) continue
    const frame = sheet.fps > 0 ? Math.floor(e.anim * sheet.fps) : 0
    const w = sheet.fw * k
    const h = sheet.fh * (bh / cam.viewH)
    o.drawImage(
      sheet.img, (frame % sheet.frames) * sheet.fw, 0, sheet.fw, sheet.fh,
      bx(e.x) - w / 2, by(e.y - (e.def.hover ?? 0)) - h, w, h,
    )
  }

  // And him. He is the one thing on screen the player is always looking at,
  // so his own shaft is the one that sells the whole effect.
  const ps = g.assets.sheet('player_idle')
  if (ps) {
    const w = ps.fw * k
    const h = ps.fh * (bh / cam.viewH)
    o.drawImage(
      ps.img, 0, 0, ps.fw, ps.fh,
      bx(g.player.x) - w / 2, by(g.player.y) - h, w, h,
    )
  }

  /*
   * A HALF-PIXEL OF SOFTNESS FIRST.
   *
   * The silhouettes punched above have hard edges, and a hard edge dragged
   * along a ray is a hard-edged streak with a visible staircase down each
   * side. One round trip through a half-size canvas is a box blur that costs
   * two blits, and it is enough: what comes out of the radial blur after this
   * has no edge sharp enough to alias.
   */
  {
    const hw = Math.max(4, bw >> 1)
    const hh = Math.max(4, bh >> 1)
    const soft = scratch(3, hw, hh)
    const sc = soft.getContext('2d')!
    sc.setTransform(1, 0, 0, 1, 0, 0)
    sc.globalCompositeOperation = 'source-over'
    sc.imageSmoothingEnabled = true
    sc.clearRect(0, 0, hw, hh)
    sc.drawImage(occ, 0, 0, hw, hh)
    o.setTransform(1, 0, 0, 1, 0, 0)
    o.globalCompositeOperation = 'source-over'
    o.imageSmoothingEnabled = true
    o.clearRect(0, 0, bw, bh)
    o.drawImage(soft, 0, 0, bw, bh)
  }

  /*
   * ---- 2. the radial blur, toward the light, IN TWO PASSES ---------------
   *
   * Fourteen blits along a ray leaves fourteen visible steps, and the eye
   * reads a row of evenly-spaced steps as scan lines. The honest fix is more
   * taps, and the cheap way to get them is to blur twice:
   *
   *   FINE   ten taps a step apart          -> covers one stride
   *   COARSE ten taps a STRIDE apart, over  -> covers the whole distance
   *          the result of the first
   *
   * Composing the two lands taps at every one of the hundred fine positions,
   * with the weight at combined index `i + j*samples` coming out as
   * `decay^i * decay^(j*samples)` — which is `decay^(i + j*samples)`, exactly
   * the weight the single-pass version would have used. A hundred samples for
   * the price of twenty, and the steps are now closer together than the
   * quarter-resolution buffer can resolve, which is why they disappear.
   *
   * (Scaling composes by multiplication rather than addition, so the far taps
   * end up a few percent closer together than a true uniform spacing. That is
   * a slight compression at the tail of a streak and nothing anybody can see;
   * banding is about even SPACING, and these are still even.)
   */
  const step = SHAFT.density / (SHAFT.samples * SHAFT.samples - 1)
  const coarse = scratch(1, bw, bh)
  const shaft = scratch(2, bw, bh)

  const pass = (
    dst: CanvasRenderingContext2D, src: CanvasImageSource,
    taps: number, decay: number, norm: number,
  ) => {
    dst.setTransform(1, 0, 0, 1, 0, 0)
    dst.globalCompositeOperation = 'source-over'
    dst.clearRect(0, 0, bw, bh)
    dst.globalCompositeOperation = 'lighter'
    dst.imageSmoothingEnabled = true
    let illum = 1
    for (let i = 0; i < SHAFT.samples; i++) {
      const scale = 1 - taps * i
      dst.globalAlpha = (illum * SHAFT.weight) / norm
      dst.setTransform(scale, 0, 0, scale, lx * (1 - scale), ly * (1 - scale))
      dst.drawImage(src, 0, 0)
      illum *= decay
    }
    dst.setTransform(1, 0, 0, 1, 0, 0)
    dst.globalAlpha = 1
    dst.globalCompositeOperation = 'source-over'
  }

  pass(coarse.getContext('2d')!, occ, step, SHAFT.decay, SHAFT_NORM)
  pass(shaft.getContext('2d')!, coarse, step * SHAFT.samples, SHAFT_STRIDE, SHAFT_NORM_COARSE)

  // ---- 3. over the frame -------------------------------------------------
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = Math.min(1, sky.rays * SHAFT.exposure)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(shaft, 0, 0, W, H)
  ctx.restore()
}

/** Enough to read as air, few enough to cost nothing. */
const MOTES = 46


/** Erases a soft circle out of the wash, so the world under it stays lit. */
function hole(
  g: CanvasRenderingContext2D, x: number, y: number, r: number, strength: number,
) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r)
  grd.addColorStop(0, 'rgba(0,0,0,' + strength.toFixed(3) + ')')
  grd.addColorStop(0.5, 'rgba(0,0,0,' + (strength * 0.55).toFixed(3) + ')')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(x - r, y - r, r * 2, r * 2)
}

// ----------------------------------------------------------------- ENDING --

/**
 * SOUL, COMING DOWN.
 *
 * Drawn in world space with the actors so the church floor is underneath him,
 * with a shaft of light following him down. Nothing else is alive by this
 * point — the boss is gone and the director is held — so he does not need to
 * be sorted against anything.
 */
function drawEndingWorld(g: Game, ctx: CanvasRenderingContext2D) {
  const e = g.ending
  if (e.step !== 'descend' && e.step !== 'kiss' && e.step !== 'kissed') return

  const sheet = g.assets.sheet('soul')
  const h = sheet ? sheet.fh : 22
  // From above the top of the view down to the floor.
  const top = g.camera.y - g.camera.viewH / 2 - h
  const y = top + (e.soulY - top) * e.descent

  /*
   * THE LIGHT HE COMES DOWN IN.
   *
   * A cone rather than a glow: the church already has shafts through windows
   * nobody can see, and this is one more of them arriving where it is needed.
   * It fades as he lands, because once he is standing there the light has done
   * its job and would only be in the way of his face.
   */
  const lit = 1 - Math.max(0, (e.descent - 0.72) / 0.28) * 0.75
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const grd = ctx.createLinearGradient(e.soulX, top, e.soulX, e.soulY + 8)
  grd.addColorStop(0, 'rgba(255,246,214,' + (0.16 * lit).toFixed(3) + ')')
  grd.addColorStop(1, 'rgba(255,232,170,0)')
  ctx.fillStyle = grd
  ctx.beginPath()
  ctx.moveTo(e.soulX - 26, top)
  ctx.lineTo(e.soulX + 26, top)
  ctx.lineTo(e.soulX + 44, e.soulY + 8)
  ctx.lineTo(e.soulX - 44, e.soulY + 8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // The pool he is landing in.
  if (e.descent > 0.5) {
    const k = (e.descent - 0.5) / 0.5
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const pool = ctx.createRadialGradient(e.soulX, e.soulY, 0, e.soulX, e.soulY, 46)
    pool.addColorStop(0, 'rgba(255,244,206,' + (0.22 * k).toFixed(3) + ')')
    pool.addColorStop(1, 'rgba(255,232,170,0)')
    ctx.fillStyle = pool
    ctx.beginPath()
    ctx.ellipse(e.soulX, e.soulY, 46, 20, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  shadow(ctx, e.soulX, e.soulY, 7 * Math.min(1, e.descent + 0.3))
  if (sheet) {
    drawSheet(ctx, sheet, 0, e.soulX, y, false)
  } else {
    ctx.fillStyle = '#f0e6d2'
    ctx.fillRect(Math.round(e.soulX) - 5, Math.round(y) - 20, 10, 20)
  }

  /*
   * HEARTS, and they are the only thing in the game that is not damage.
   *
   * Spawned from the state rather than the effect pool: the pool is cleared by
   * a reset and stepped by the simulation, and neither of those is running.
   */
  if (e.step === 'kissed') {
    const n = 7
    for (let i = 0; i < n; i++) {
      const t = Math.max(0, e.t - i * 0.13)
      if (t <= 0) continue
      const life = Math.min(1, t / 2.2)
      const a = 1 - life
      if (a <= 0) continue
      const hx = e.soulX - 4 + Math.sin(i * 2.1 + t * 2) * (12 + i * 3)
      const hy = e.soulY - 18 - life * 62
      ctx.globalAlpha = a
      heart(ctx, hx, hy, 2 + (i % 2))
    }
    ctx.globalAlpha = 1
  }
}

/** Two squares and a triangle. It is a heart at this size and nothing else. */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = '#ff5f7a'
  ctx.fillRect(x - s, y - s, s, s)
  ctx.fillRect(x, y - s, s, s)
  ctx.fillRect(x - s, y, s * 2, s)
  ctx.fillRect(x - s * 0.5, y + s, s, s)
}

/**
 * THE BLACK SCREEN, the close-up, and the two prompts.
 *
 * Screen space, above everything including the world — the first half of this
 * sequence is not happening in the church, it is happening about ten
 * centimetres from his face.
 */
function drawEndingScreen(g: Game, ctx: CanvasRenderingContext2D) {
  const e = g.ending
  const W = g.canvas.width
  const H = g.canvas.height
  const veil = endingVeil(e)

  if (veil > 0.001) {
    ctx.fillStyle = 'rgba(4,4,6,' + veil.toFixed(3) + ')'
    ctx.fillRect(0, 0, W, H)
  }

  // ---- the close-up ------------------------------------------------------
  if (e.step === 'wounded' || e.step === 'shot' || e.step === 'hold') {
    const wounded = e.step === 'wounded'
    const fx = g.assets.effect(wounded ? 'chara_wounded' : 'chara_finish')
    if (fx) {
      /*
       * Sized to the SHORT edge, so a wide window does not crop his head off
       * and a tall one does not leave him swimming in black.
       */
      /*
       * Sized to leave the bottom fifth of the screen alone, because that is
       * where the instruction goes. A close-up that fills the frame edge to
       * edge is a better picture and a worse prompt.
       */
      const scale = Math.min(W / fx.w, H / fx.h) * 0.78
      // `hold` sits on the last frame of the kill rather than replaying it.
      const t = e.step === 'hold' ? 99 : e.t
      drawEffect(ctx, fx, W / 2, H * 0.46, t, scale)
    }
  }

  // ---- what to do about it -----------------------------------------------
  if (e.step === 'wounded') {
    /*
     * A RETICLE ON HIS FOREHEAD, and a word.
     *
     * The prompt pulses; the crosshair does not. One of them is asking for
     * attention and the other is telling you exactly where to put it, and a
     * crosshair that throbbed would be doing the first job badly.
     */
    const cx = W / 2
    const cy = H * 0.26
    const r = Math.min(W, H) * 0.055
    ctx.strokeStyle = 'rgba(255,90,90,0.9)'
    ctx.lineWidth = Math.max(2, r * 0.09)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - r * 1.5, cy); ctx.lineTo(cx - r * 0.45, cy)
    ctx.moveTo(cx + r * 0.45, cy); ctx.lineTo(cx + r * 1.5, cy)
    ctx.moveTo(cx, cy - r * 1.5); ctx.lineTo(cx, cy - r * 0.45)
    ctx.moveTo(cx, cy + r * 0.45); ctx.lineTo(cx, cy + r * 1.5)
    ctx.stroke()

    prompt(g, ctx, 'CLICA', 'ACABA COM ELE', H * 0.88)
  }

  if (e.step === 'kiss') prompt(g, ctx, 'CLICA', 'DÁ UM BEIJO NELE', H * 0.84)

  if (e.step === 'kissed') {
    const a = Math.min(1, e.t / 0.6) * Math.max(0, 1 - (e.t - 2.4) / 1)
    if (a > 0) {
      ctx.save()
      ctx.globalAlpha = a
      ctx.font = Math.round(Math.min(W, H) * 0.032) + 'px ' + PIXEL
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#000'
      ctx.fillText('FLORIANO TÁ SALVA', W / 2 + 2, H * 0.16 + 2)
      ctx.fillStyle = '#ffe98a'
      ctx.fillText('FLORIANO TÁ SALVA', W / 2, H * 0.16)
      ctx.restore()
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
  }
}

/** The one instruction on screen, pulsing so it cannot be missed. */
function prompt(
  g: Game, ctx: CanvasRenderingContext2D, word: string, under: string, y: number,
) {
  const W = g.canvas.width
  /*
   * PULSED OFF THE SEQUENCE'S OWN CLOCK, not the world's.
   *
   * `g.time` only advances while the simulation runs, and the simulation is
   * exactly what has stopped — driving the pulse from it left the prompt
   * frozen at whatever brightness the last frame of the fight happened to
   * land on, which for one seed was almost invisible.
   */
  const pulse = 0.62 + Math.sin(g.ending.t * 5) * 0.38
  const big = Math.round(Math.min(W, g.canvas.height) * 0.042)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = big + 'px ' + PIXEL
  ctx.globalAlpha = pulse
  ctx.fillStyle = '#000'
  ctx.fillText(word, W / 2 + 2, y + 2)
  ctx.fillStyle = '#fff4d0'
  ctx.fillText(word, W / 2, y)
  ctx.globalAlpha = 0.85
  ctx.font = Math.round(big * 0.42) + 'px ' + PIXEL
  ctx.fillStyle = '#000'
  ctx.fillText(under, W / 2 + 1, y + big * 0.92 + 1)
  ctx.fillStyle = '#c9bfa4'
  ctx.fillText(under, W / 2, y + big * 0.92)
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// -------------------------------------------------------------- SCREEN FX --


/**
 * REVIVA, THE PART ON THE FLOOR.
 *
 * A ring thrown out from where he fell, drawn under the bodies it is throwing
 * so it reads as a force coming off the ground rather than a decal over the
 * top of a crowd. It travels the distance the shove actually reached, which is
 * the whole reason it is convincing: the ring arrives at each enemy on the
 * frame that enemy starts moving.
 */
function drawReviveWave(g: Game, ctx: CanvasRenderingContext2D) {
  const p = g.player
  if (p.reviveT <= 0) return
  const R = CONFIG.REVIVE
  // 0 the instant he is saved, 1 by the end.
  const k = 1 - p.reviveT / R.time
  if (k > 0.75) return

  const t = Math.min(1, k / 0.75)
  const rr = R.push * (0.1 + t * 1.15)
  const fade = 1 - t

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // The body of it.
  const grd = ctx.createRadialGradient(p.x, p.y, rr * 0.55, p.x, p.y, rr)
  grd.addColorStop(0, 'rgba(120,255,150,0)')
  grd.addColorStop(0.75, 'rgba(160,255,180,' + (0.26 * fade).toFixed(3) + ')')
  grd.addColorStop(1, 'rgba(230,255,220,0)')
  ctx.fillStyle = grd
  ctx.save()
  ctx.scale(1, 0.55)
  ctx.beginPath(); ctx.arc(p.x, p.y / 0.55, rr, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  // And its edge, which is the part that reads as a wave rather than a glow.
  ctx.strokeStyle = 'rgba(215,255,225,' + (0.85 * fade).toFixed(3) + ')'
  ctx.lineWidth = 3 * fade + 1
  ctx.beginPath()
  ctx.ellipse(p.x, p.y, rr, rr * 0.55, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/**
 * REVIVA, THE PART OVER THE WHOLE SCREEN.
 *
 * White, hard, then gone. This is the thing that was missing: a shake and a
 * small green word cannot compete with four hundred bodies and a hundred
 * damage numbers, and the player genuinely did not notice they had died. A
 * frame of full white is not competing with anything.
 *
 * It clears fast — most of it is gone within the dead stop — because a long
 * white fade is a loading screen. What holds the moment open afterwards is the
 * slow motion, not the light.
 */
function drawReviveFlash(g: Game, ctx: CanvasRenderingContext2D) {
  const p = g.player
  if (p.reviveT <= 0) return
  const R = CONFIG.REVIVE
  const k = 1 - p.reviveT / R.time

  // Full white for an instant, then a quick falloff, then a green wash that
  // hangs on through the slow motion so the whole sequence stays tinted.
  const white = k < 0.06 ? 1 : Math.max(0, 1 - (k - 0.06) / 0.16)
  const tint = Math.max(0, 1 - k / 0.55)

  if (white > 0.002) {
    ctx.fillStyle = 'rgba(238,255,242,' + (white * 0.92).toFixed(3) + ')'
    ctx.fillRect(0, 0, g.canvas.width, g.canvas.height)
  }
  if (tint > 0.002) {
    const W = g.canvas.width
    const H = g.canvas.height
    const grd = ctx.createRadialGradient(
      W / 2, H * 0.5, Math.min(W, H) * 0.12,
      W / 2, H * 0.5, Math.hypot(W, H) * 0.55,
    )
    grd.addColorStop(0, 'rgba(150,255,175,0)')
    grd.addColorStop(1, 'rgba(90,235,130,' + (0.34 * tint).toFixed(3) + ')')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, W, H)
  }
}

function drawScreenFx(g: Game, ctx: CanvasRenderingContext2D) {
  const p = g.player

  // Touch stick. Drawn on the canvas rather than in the HUD because it has to
  // track the finger every frame, and React is only updated 15 times a second.
  const stick = g.input.stick
  if (stick) {
    const dpr = g.canvas.width / (g.canvas.clientWidth || g.canvas.width)
    const ox = stick.ox * dpr
    const oy = stick.oy * dpr
    let dx = (stick.x - stick.ox) * dpr
    let dy = (stick.y - stick.oy) * dpr
    const max = 56 * dpr
    const len = Math.hypot(dx, dy)
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 2 * dpr
    ctx.beginPath(); ctx.arc(ox, oy, max, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath(); ctx.arc(ox + dx, oy + dy, 20 * dpr, 0, Math.PI * 2); ctx.fill()
  }

  /*
   * SOMETHING IS DRAINING HIM RIGHT NOW.
   *
   * Separate from the low-health vignette below, and it has to be: that one
   * says how much health is left, this one says health is LEAVING. A player
   * standing in salt at eighty per cent gets no warning from a vignette keyed
   * to how hurt they already are, and the whole complaint being fixed here is
   * that damage over time arrived with nothing on screen attached to it.
   *
   * A hard, fast pulse rather than a steady wash — steady reads as an
   * atmosphere, and this is meant to read as an alarm. See `Player.dotT`.
   */
  if (p.dotT > 0) {
    const k = Math.min(1, p.dotT / 0.1)
    const beat = 0.55 + Math.sin(g.time * 26) * 0.45
    const grd = ctx.createRadialGradient(
      g.canvas.width / 2, g.canvas.height / 2, g.canvas.height * 0.2,
      g.canvas.width / 2, g.canvas.height / 2, g.canvas.height * 0.62,
    )
    grd.addColorStop(0, 'rgba(190,20,20,0)')
    grd.addColorStop(1, 'rgba(190,20,20,' + (0.42 * k * beat).toFixed(3) + ')')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, g.canvas.width, g.canvas.height)
  }

  const hurt = 1 - p.hp / p.maxHp
  if (hurt > 0.55) {
    const a = (hurt - 0.55) / 0.45
    const grd = ctx.createRadialGradient(
      g.canvas.width / 2, g.canvas.height / 2, g.canvas.height * 0.28,
      g.canvas.width / 2, g.canvas.height / 2, g.canvas.height * 0.72,
    )
    grd.addColorStop(0, 'rgba(140,0,0,0)')
    grd.addColorStop(1, 'rgba(140,0,0,' + (0.55 * a).toFixed(3) + ')')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, g.canvas.width, g.canvas.height)
  }
}
