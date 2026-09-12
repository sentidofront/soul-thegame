import {
  SHEETS, TILES, ICONS,
  type SheetDef, type SheetKey, type TileDef, type TileKey, type IconKey,
} from '../data/sprites'
import { EFFECTS, type EffectDef, type EffectKey } from '../data/effects'

/**
 * A loaded sheet, already normalised into a uniform strip.
 *
 * Whatever the source PNG looked like, by the time gameplay sees it every
 * frame is exactly `fw` x `fh` and the character's feet sit on the bottom row,
 * horizontally centred. That is what lets the renderer treat all art the same.
 */
export interface Sheet {
  img: CanvasImageSource
  /** Horizontally mirrored copy, frame indices unchanged. */
  flipped: CanvasImageSource
  /**
   * Pure white silhouettes of the same strips, for the hit flash.
   *
   * Brightening a sprite by re-drawing it additively barely shows on dark art —
   * these enemies are mostly browns and dark greens, and a hit read as a faint
   * shimmer. A white silhouette punched over the frame is unmissable, and
   * pre-rendering it costs one canvas per sheet at load instead of a composite
   * operation per hit per frame.
   */
  white: CanvasImageSource
  whiteFlipped: CanvasImageSource
  /**
   * Pure BLACK silhouettes of the same strips, for the shadow on the ground.
   *
   * The shadow used to be an ellipse under everything, which is fine until you
   * look at it: a man, a cow and a mothership all standing on the same oval.
   * A silhouette squashed onto the floor and leaned away from the sun is the
   * same cost — one blit — and it is actually the shape of the thing casting
   * it. Pre-rendered here for the same reason `white` is: tinting per sprite
   * per frame is a full context state change several hundred times a frame.
   */
  dark: CanvasImageSource
  darkFlipped: CanvasImageSource
  fw: number
  fh: number
  frames: number
  fps: number
  loop: boolean
  ok: boolean
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // Filenames straight out of an art tool may contain spaces or accents.
    img.src = encodeURI(src)
    img.onload = () => resolve(img)
    img.onerror = () => {
      console.warn('[assets] missing: ' + src)
      resolve(null)
    }
  })
}

function readPixels(img: HTMLImageElement) {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.imageSmoothingEnabled = false
  g.drawImage(img, 0, 0)
  return g.getImageData(0, 0, img.width, img.height)
}

interface FrameBox { x0: number; x1: number; cx: number; bottom: number; top: number }

/**
 * Works out where each frame actually starts and ends.
 *
 * Hand-drawn strips are almost never on a clean grid — the poses in this
 * project sit at pitches of 15, 17 and 19 pixels inside the same 64px file.
 * Slicing those on a uniform 64/3 grid chops arms off and lets the next pose
 * bleed into the current one.
 *
 * So instead of trusting a grid, we look at the art: take the ideal cut
 * positions, then slide each one to the emptiest column nearby. On a properly
 * gridded sheet the emptiest column IS the grid line, so this stays correct
 * for art that is exported cleanly later.
 */
function findFrames(data: ImageData, frames: number, mode: 'auto' | 'grid'): FrameBox[] {
  const { width, height } = data
  const px = data.data

  const colCount = new Int32Array(width)
  for (let x = 0; x < width; x++) {
    let n = 0
    for (let y = 0; y < height; y++) if (px[(y * width + x) * 4 + 3] > 8) n++
    colCount[x] = n
  }

  /*
   * Ideal cut positions are spaced across the DRAWN CONTENT, not across the
   * canvas. A 64px sheet with both poses squeezed into the left 40px is common
   * — the artist works at the left edge and leaves the rest of the frame empty
   * — and spacing cuts across the full width puts the ideal cut inside the
   * blank right half. Every column there is empty, so an "emptiest column
   * nearest the ideal" search happily cuts there and packs every pose into
   * frame one.
   */
  let contentStart = 0
  let contentEnd = width - 1
  while (contentStart < width - 1 && colCount[contentStart] === 0) contentStart++
  while (contentEnd > contentStart && colCount[contentEnd] === 0) contentEnd--
  const span = contentEnd - contentStart + 1

  const cuts: number[] = [0]
  const pitch = span / frames
  for (let i = 1; i < frames; i++) {
    const ideal = contentStart + i * pitch
    if (mode === 'grid') { cuts.push(Math.round(ideal)); continue }
    const reach = Math.max(2, Math.floor(pitch * 0.45))
    let best = Math.round(ideal)
    let bestScore = Infinity
    const lo = Math.max(1, Math.round(ideal) - reach)
    const hi = Math.min(width - 1, Math.round(ideal) + reach)
    for (let x = lo; x <= hi; x++) {
      // Emptiest column wins; ties break toward the ideal position.
      const score = colCount[x] * 1000 + Math.abs(x - ideal)
      if (score < bestScore) { bestScore = score; best = x }
    }
    cuts.push(best)
  }
  cuts.push(width)

  const boxes: FrameBox[] = []
  for (let i = 0; i < frames; i++) {
    const x0 = cuts[i]
    const x1 = cuts[i + 1] - 1
    let minX = -1
    let maxX = -1
    let top = height
    let bottom = -1
    for (let x = x0; x <= x1; x++) {
      if (colCount[x] === 0) continue
      if (minX < 0) minX = x
      maxX = x
      for (let y = 0; y < height; y++) {
        if (px[(y * width + x) * 4 + 3] > 8) { if (y < top) top = y; if (y > bottom) bottom = y }
      }
    }
    if (minX < 0) { minX = x0; maxX = x1; top = 0; bottom = height - 1 }

    // Horizontal anchor comes from the TOP of the pose (head and shoulders),
    // not the whole silhouette. A walk cycle swings its legs and a drawn arm
    // extends sideways; centring on the full bounding box would make the
    // character slide left and right on every frame.
    const stableBottom = top + Math.max(1, Math.round((bottom - top) * 0.45))
    let sMin = -1
    let sMax = -1
    for (let x = minX; x <= maxX; x++) {
      for (let y = top; y <= stableBottom; y++) {
        if (px[(y * width + x) * 4 + 3] > 8) { if (sMin < 0) sMin = x; sMax = x; break }
      }
    }
    if (sMin < 0) { sMin = minX; sMax = maxX }

    boxes.push({ x0: minX, x1: maxX, cx: (sMin + sMax + 1) / 2, bottom, top })
  }
  return boxes
}

/**
 * Repaints the frames into a uniform strip: every cell the same size, each
 * pose centred on its stable anchor with its feet on the bottom row.
 */
function normalise(img: HTMLImageElement, boxes: FrameBox[]) {
  let cellW = 1
  let cellH = 1
  for (const b of boxes) {
    cellW = Math.max(cellW, Math.ceil((b.cx - b.x0) * 2), Math.ceil((b.x1 + 1 - b.cx) * 2))
    cellH = Math.max(cellH, b.bottom - b.top + 1)
  }
  cellW += 2
  cellH += 1

  const c = document.createElement('canvas')
  c.width = cellW * boxes.length
  c.height = cellH
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false

  boxes.forEach((b, i) => {
    const w = b.x1 - b.x0 + 1
    const h = b.bottom - b.top + 1
    const dx = i * cellW + Math.round(cellW / 2 - (b.cx - b.x0))
    const dy = cellH - h
    g.drawImage(img, b.x0, b.top, w, h, dx, dy, w, h)
  })

  return { canvas: c, cellW, cellH }
}

/** A solid white copy of a strip, keeping its alpha. */
function whiten(src: HTMLCanvasElement): HTMLCanvasElement {
  return tinted(src, '#ffffff')
}

/** The same, in black, for shadows. */
function blacken(src: HTMLCanvasElement): HTMLCanvasElement {
  return tinted(src, '#000000')
}

/** A flat-coloured copy of a strip, keeping its alpha. */
function tinted(src: HTMLCanvasElement, colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  g.drawImage(src, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = colour
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/** Mirrors every cell of a strip in place, so frame N stays frame N. */
function flipStrip(src: HTMLCanvasElement, fw: number, fh: number, frames: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, fw * frames)
  c.height = Math.max(1, fh)
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  for (let i = 0; i < frames; i++) {
    g.save()
    g.translate(i * fw + fw, 0)
    g.scale(-1, 1)
    g.drawImage(src, i * fw, 0, fw, fh, 0, 0, fw, fh)
    g.restore()
  }
  return c
}

/**
 * Turns a texture that does not tile into one that does.
 *
 * A ground texture only repeats invisibly if its right edge continues into its
 * own left edge. Hand-painted ones almost never do, and the mismatch shows up
 * in game as a hard 100-unit lattice across the whole map.
 *
 * The fix is done once, at load: blend the tile with a copy of itself shifted
 * half a tile in both directions, weighted so the shifted copy takes over near
 * the edges. The shifted copy's edge pixels come from the middle of the
 * original, and its left and right edges sample the SAME source column — so
 * the result is continuous across the join by construction. Near the middle,
 * where the shifted copy has its own seam, the weight is zero and the original
 * shows through untouched.
 *
 * This is a rescue, not a substitute for tileable art: it averages two halves
 * of the texture near the edges, which costs a little contrast there.
 */
function makeSeamless(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.width
  const h = img.height
  const read = document.createElement('canvas')
  read.width = w
  read.height = h
  const rg = read.getContext('2d', { willReadFrequently: true })!
  rg.imageSmoothingEnabled = false
  rg.drawImage(img, 0, 0)
  const src = rg.getImageData(0, 0, w, h)
  const out = rg.createImageData(w, h)

  /*
   * THE MEAN OF EACH CHANNEL, needed to put the contrast back.
   *
   * Averaging two decorrelated samples of the same noise does not just move
   * the pixel, it FLATTENS it: the variance of a 50/50 mix is half that of
   * either source. Left alone, that turns the blended band into a ring of
   * mush inside every tile — and a ring repeated every hundred units reads as
   * a grid however seamless the joins themselves are. It was the last visible
   * lattice in the caatinga after mirroring and two scales of mottle had dealt
   * with everything else.
   *
   * Rescaling each blended pixel away from the channel mean by
   * 1/sqrt((1-t)^2 + t^2) restores exactly the variance the mix removed: 1 at
   * the edges where nothing is mixed, 1.41 at the halfway point where the loss
   * is worst.
   */
  let mr = 0
  let mg = 0
  let mb = 0
  const n = w * h
  for (let i = 0; i < n; i++) {
    mr += src.data[i * 4]
    mg += src.data[i * 4 + 1]
    mb += src.data[i * 4 + 2]
  }
  mr /= n; mg /= n; mb /= n
  const mean = [mr, mg, mb]

  for (let y = 0; y < h; y++) {
    // 1 at the top and bottom edges, 0 across the middle.
    const fy = 1 - Math.sin((Math.PI * y) / h)
    const by = (y + (h >> 1)) % h
    for (let x = 0; x < w; x++) {
      const fx = 1 - Math.sin((Math.PI * x) / w)
      const t = Math.max(fx, fy)
      const k = 1 / Math.sqrt((1 - t) * (1 - t) + t * t)
      const bx = (x + (w >> 1)) % w
      const a = (y * w + x) * 4
      const b = (by * w + bx) * 4
      for (let c = 0; c < 3; c++) {
        const mix = src.data[a + c] * (1 - t) + src.data[b + c] * t
        const v = mean[c] + (mix - mean[c]) * k
        out.data[a + c] = v < 0 ? 0 : v > 255 ? 255 : v
      }
      // Alpha is coverage, not colour: mixing it is right, boosting it is not.
      out.data[a + 3] = src.data[a + 3] * (1 - t) + src.data[b + 3] * t
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.putImageData(out, 0, 0)
  return canvas
}


/**
 * A LOADED EFFECT SHEET.
 *
 * Deliberately much thinner than `Sheet`: no mirrored copy, no white
 * silhouette, and above all no normalisation. Cells are read straight out of
 * the grid at their source position, so every frame of an explosion stays
 * registered to the same centre — which is the whole reason effects do not go
 * through the character loader.
 */
export interface Effect {
  img: CanvasImageSource
  /** Cell size in the source. */
  cw: number
  ch: number
  /** Columns in the source grid. */
  cols: number
  /** Index of the first cell used. */
  first: number
  frames: number
  fps: number
  loop: boolean
  /** Draw size in world units. */
  w: number
  h: number
  /** How solid it draws. */
  alpha: number
  /** Seconds one play takes. */
  duration: number
  ok: boolean
}

/**
 * Recolours a whole sheet once, at load.
 *
 * The frost sheet is the only thing that needs it — Dança da Chuva is a
 * downpour and the art is drawn as ice — and doing it here rather than per
 * frame means the cost is one canvas at start-up instead of a filter on every
 * draw call for the rest of the run.
 */
function recolour(
  img: HTMLImageElement, hue: number, sat: number, tint: string | undefined,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  if (hue !== 0 || sat !== 1) g.filter = 'hue-rotate(' + hue + 'deg) saturate(' + sat + ')'
  g.drawImage(img, 0, 0)
  if (tint) {
    /*
     * `source-atop` is safe HERE and nowhere else.
     *
     * It paints only where the destination already has alpha — which on a
     * canvas holding nothing but this sheet is exactly the drawn pixels. Run
     * on the game's own canvas the same operation covers the whole frame in a
     * coloured card, which is a mistake this codebase has already made once.
     */
    g.filter = 'none'
    g.globalCompositeOperation = 'source-atop'
    g.fillStyle = tint
    g.fillRect(0, 0, c.width, c.height)
  }
  return c
}

function blank(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  return c
}

export class Assets {
  private sheets = new Map<string, Sheet>()
  private tiles = new Map<string, CanvasImageSource | null>()
  private icons = new Map<string, HTMLImageElement | null>()
  private effects = new Map<string, Effect>()
  /** Slice report, dumped to the console so art problems are visible in dev. */
  readonly report: Record<string, string> = {}

  async load(): Promise<void> {
    /*
     * WAIT FOR THE FACE.
     *
     * `ctx.font` fails silently: ask for a webfont that has not finished
     * decoding and the canvas draws in the fallback with no warning, which
     * shows up as the bark and the damage numbers being in the wrong face for
     * the first second of every run. Cheap to wait for, and everything else
     * here is loading anyway.
     */
    if (document.fonts) {
      try {
        await Promise.all([
          document.fonts.load('7px "Press Start 2P"'),
          document.fonts.load('6px "Press Start 2P"'),
        ])
      } catch { /* the fallback stack is still perfectly legible */ }
    }

    const sheetEntries = Object.entries(SHEETS) as [string, SheetDef][]
    const tileEntries = Object.entries(TILES) as [string, TileDef][]
    const iconEntries = Object.entries(ICONS) as [string, string][]

    await Promise.all([
      ...sheetEntries.map(async ([key, def]) => {
        const img = await loadImage(def.src)
        if (!img) {
          this.sheets.set(key, {
            img: blank(), flipped: blank(), white: blank(), whiteFlipped: blank(),
            dark: blank(), darkFlipped: blank(),
            fw: 1, fh: 1, frames: 1, fps: 0, loop: false, ok: false,
          })
          return
        }
        const boxes = findFrames(readPixels(img), def.frames, def.slice ?? 'auto')
        const { canvas, cellW, cellH } = normalise(img, boxes)
        const flipped = flipStrip(canvas, cellW, cellH, def.frames)
        this.sheets.set(key, {
          img: canvas,
          flipped,
          white: whiten(canvas),
          whiteFlipped: whiten(flipped),
          dark: blacken(canvas),
          darkFlipped: blacken(flipped),
          fw: cellW, fh: cellH, frames: def.frames,
          fps: def.fps, loop: def.loop ?? true, ok: true,
        })
        this.report[key] =
          img.width + 'x' + img.height + ' -> ' + def.frames + ' x ' + cellW + 'x' + cellH +
          '  cuts@[' + boxes.map((b) => b.x0 + '-' + b.x1).join(', ') + ']'
      }),
      ...tileEntries.map(async ([key, def]) => {
        const img = await loadImage(def.src)
        this.tiles.set(key, img && def.seamless ? makeSeamless(img) : img)
      }),
      ...iconEntries.map(async ([key, src]) => {
        this.icons.set(key, await loadImage(src))
      }),
      ...(Object.entries(EFFECTS) as [string, EffectDef][]).map(async ([key, def]) => {
        const img = await loadImage(def.src)
        const ch = def.ch ?? def.cw
        if (!img) {
          this.effects.set(key, {
            img: blank(), cw: 1, ch: 1, cols: 1, first: 0, frames: 1,
            fps: 0, loop: false, w: 1, h: 1, alpha: 1, duration: 1, ok: false,
          })
          return
        }
        const src = def.hue !== undefined || def.sat !== undefined || def.tint
          ? recolour(img, def.hue ?? 0, def.sat ?? 1, def.tint)
          : img
        this.effects.set(key, {
          img: src,
          cw: def.cw, ch,
          cols: def.cols ?? Math.max(1, Math.floor(img.width / def.cw)),
          first: def.first ?? 0,
          frames: def.frames,
          fps: def.fps,
          loop: def.loop ?? false,
          w: def.size,
          h: Math.round(def.size * (ch / def.cw)),
          alpha: def.alpha ?? 1,
          duration: def.frames / def.fps,
          ok: true,
        })
      }),
    ])

    if (import.meta.env.DEV) console.table(this.report)
  }

  /** Returns undefined for keys with no art yet — callers fall back to a placeholder. */
  sheet(key: SheetKey | string): Sheet | undefined {
    const s = this.sheets.get(key as string)
    return s && s.ok ? s : undefined
  }

  tile(key: TileKey): CanvasImageSource | null {
    return this.tiles.get(key) ?? null
  }

  icon(key: IconKey): HTMLImageElement | null {
    return this.icons.get(key) ?? null
  }

  effect(key: EffectKey | string): Effect | undefined {
    const e = this.effects.get(key as string)
    return e && e.ok ? e : undefined
  }
}

/**
 * Draws one frame of an effect, centred on (x, y).
 *
 * `t` is seconds since it started. A looping sheet wraps; a one-shot clamps to
 * its last frame, so a caller that draws one frame late shows the end of the
 * animation rather than the beginning of the next play.
 */
export function drawEffect(
  ctx: CanvasRenderingContext2D, fx: Effect,
  x: number, y: number, t: number,
  scale = 1, rot = 0, alpha = 1,
) {
  alpha *= fx.alpha
  let f = Math.floor(t * fx.fps)
  if (fx.loop) f = ((f % fx.frames) + fx.frames) % fx.frames
  else f = Math.max(0, Math.min(fx.frames - 1, f))
  const cell = fx.first + f
  const sx = (cell % fx.cols) * fx.cw
  const sy = Math.floor(cell / fx.cols) * fx.ch
  const w = fx.w * scale
  const h = fx.h * scale

  if (rot === 0 && alpha === 1) {
    ctx.drawImage(fx.img, sx, sy, fx.cw, fx.ch, x - w / 2, y - h / 2, w, h)
    return
  }
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  if (rot !== 0) ctx.rotate(rot)
  ctx.drawImage(fx.img, sx, sy, fx.cw, fx.ch, -w / 2, -h / 2, w, h)
  ctx.restore()
}
