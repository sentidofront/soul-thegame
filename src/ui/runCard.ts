import { clockOf, type Summary } from '../game/data/record'

/**
 * THE RUN, AS A PICTURE.
 *
 * The end screen could be copied as text and downloaded as a .txt, and both
 * of those are things you do with a receipt. Nobody posts a receipt. What a
 * player wants after twenty-five minutes is the thing they can drop into a
 * group chat, and that is one image with the title, the numbers and the
 * BUILD ICONS on it — the tiles they spent the whole run picking.
 *
 * DRAWN, NOT SCREENSHOTTED. Rasterising the DOM needs html2canvas, which is a
 * dependency, a CDN, and a renderer that gets the pixel font's baseline wrong
 * anyway. A canvas is fifty lines, has no dependency, and lets the card be a
 * different composition from the screen: the screen has to fit a phone in
 * portrait, the card gets to be a poster.
 *
 * TWO PASSES OVER THE HEIGHT. A build is one card or twenty, so the poster is
 * drawn onto a generously tall canvas, the final `y` is remembered, and the
 * used region is copied into a second canvas cut to exactly that. Measuring
 * first would mean writing every layout rule twice.
 */

/** The poster's own coordinate space. Everything below is in these units. */
const W = 680
const PAD = 34
/** Rendered at 2x so the pixel font and the 32px art stay sharp when zoomed. */
const SCALE = 2

const GOLD = '#ffd479'
const INK = '#f4ecd8'
const DIM = '#a3977f'
const FAINT = '#7b7263'
const RED = '#e06060'
const GREEN = '#9bf08a'
const BG = '#0b0d0e'

const TITLE_FACE = '"Press Start 2P", ui-monospace, monospace'

/** Colours the card frame borrows from the rarity ribbon on the real cards. */
const RARITY: Record<string, string> = {
  comum: '#8b8271',
  incomum: '#8fe08a',
  raro: '#6fd0ff',
  lendario: '#ffb43d',
}

// ------------------------------------------------------------------ ART -----

/**
 * The 32x32 art, fetched once per call.
 *
 * Every one of these is already in the browser's cache — the game preloaded
 * the whole icon registry before the menu appeared — so this resolves on the
 * same frame in practice. A missing file resolves to null rather than
 * rejecting: one undrawn icon must not cost the player their card.
 */
function loadIcon(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return }
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = encodeURI(src)
  })
}

// ----------------------------------------------------------------- TEXT -----

interface Pen {
  ctx: CanvasRenderingContext2D
  y: number
}

function font(ctx: CanvasRenderingContext2D, px: number, spacing = 0) {
  ctx.font = px + 'px ' + TITLE_FACE
  // Chrome only, and the card is legible without it. Never worth a throw.
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = spacing + 'px' } catch { /* older browser */ }
}

function centred(p: Pen, text: string, px: number, colour: string, spacing = 0) {
  font(p.ctx, px, spacing)
  p.ctx.fillStyle = colour
  p.ctx.textAlign = 'center'
  p.ctx.fillText(text, W / 2, p.y + px)
  p.y += px
}

/**
 * Breaks on words, and on characters when a single word is wider than the
 * column — the titles are short but a build card's name is not, and one
 * unbroken word running off the edge is the failure that makes a generated
 * image look broken rather than full.
 */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word
    if (ctx.measureText(next).width <= max) { line = next; continue }
    if (line) out.push(line)
    if (ctx.measureText(word).width <= max) { line = word; continue }
    let chunk = ''
    for (const ch of word) {
      if (ctx.measureText(chunk + ch).width > max) { out.push(chunk); chunk = ch }
      else chunk += ch
    }
    line = chunk
  }
  if (line) out.push(line)
  return out
}

function paragraph(p: Pen, text: string, px: number, colour: string, lead: number) {
  font(p.ctx, px)
  p.ctx.fillStyle = colour
  p.ctx.textAlign = 'center'
  for (const line of wrap(p.ctx, text, W - PAD * 2)) {
    p.y += px
    p.ctx.fillText(line, W / 2, p.y)
    p.y += lead
  }
}

function rule(p: Pen, alpha = 0.22) {
  p.ctx.fillStyle = 'rgba(255,212,121,' + alpha + ')'
  p.ctx.fillRect(PAD, p.y, W - PAD * 2, 1)
  p.y += 1
}

// ---------------------------------------------------------------- BLOCKS ----

/** One figure: a small dim label with a big number under it. */
function figure(ctx: CanvasRenderingContext2D, x: number, y: number, k: string, v: string) {
  font(ctx, 6, 1)
  ctx.fillStyle = FAINT
  ctx.textAlign = 'center'
  ctx.fillText(k, x, y)
  font(ctx, 13)
  ctx.fillStyle = INK
  ctx.fillText(v, x, y + 20)
}

/**
 * A ROW OF CARD TILES, wrapping, each with its art and its stack count.
 *
 * This is the block the whole feature exists for. The tile is the card's own
 * 32px art on a dark square with the rarity's colour around it, which is
 * exactly what the level-up screen showed when the player picked it — so the
 * poster reads as the build they remember rather than as a list of nouns.
 */
function tiles(
  p: Pen,
  items: { icon: HTMLImageElement | null; glyph: string; stacks: number; rarity: string }[],
) {
  const T = 44
  const gap = 7
  const perRow = Math.max(1, Math.floor((W - PAD * 2 + gap) / (T + gap)))
  const rows = Math.ceil(items.length / perRow)
  const ctx = p.ctx

  /*
   * ROUNDED, because a 1px stroke on a half pixel is a 50% grey line.
   *
   * The row is centred, so its left edge lands on .5 for any odd tile count
   * and the `x + 0.5` that normally SNAPS a hairline was landing it back on
   * the boundary instead — which is why an eight-tile row had two crisp
   * borders and six mushy ones.
   */
  for (let r = 0; r < rows; r++) {
    const row = items.slice(r * perRow, (r + 1) * perRow)
    const width = row.length * T + (row.length - 1) * gap
    let x = Math.round((W - width) / 2)
    const y = Math.round(p.y)
    for (const it of row) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      ctx.fillRect(x, y, T, T)
      ctx.strokeStyle = RARITY[it.rarity] ?? RARITY.comum
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1)

      if (it.icon) {
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(it.icon, x + 4, y + 4, T - 8, T - 8)
      } else {
        font(ctx, 16)
        ctx.fillStyle = DIM
        ctx.textAlign = 'center'
        ctx.fillText(it.glyph, x + T / 2, y + T / 2 + 6)
      }

      // The count sits ON the tile's corner, the way it does in the HUD.
      if (it.stacks > 1) {
        const tag = '×' + it.stacks
        font(ctx, 8)
        const w = ctx.measureText(tag).width + 4
        ctx.fillStyle = 'rgba(0,0,0,0.85)'
        ctx.fillRect(x + T - w - 1, y + T - 12, w, 11)
        ctx.fillStyle = GOLD
        ctx.textAlign = 'center'
        ctx.fillText(tag, x + T - w / 2 - 1, y + T - 3)
      }
      x += T + gap
    }
    p.y += T + gap
  }
  p.y -= gap
}

/** Small caps heading over a block. */
function heading(p: Pen, text: string) {
  p.y += 16
  centred(p, text, 6, FAINT, 3)
  p.y += 8
}

/** Boxed text, used for the boss list and the medals. */
function chips(p: Pen, items: string[], colour: string, tintA: number) {
  const ctx = p.ctx
  font(ctx, 6, 0.5)
  const H = 16
  const gap = 5
  let line: { t: string; w: number }[] = []
  const flush = () => {
    if (!line.length) return
    const total = line.reduce((n, c) => n + c.w, 0) + (line.length - 1) * gap
    let x = (W - total) / 2
    for (const c of line) {
      ctx.fillStyle = 'rgba(255,212,121,' + tintA + ')'
      ctx.fillRect(x, p.y, c.w, H)
      ctx.strokeStyle = colour
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, p.y + 0.5, c.w - 1, H - 1)
      ctx.fillStyle = colour
      ctx.textAlign = 'center'
      ctx.fillText(c.t, x + c.w / 2, p.y + 11)
      x += c.w + gap
    }
    p.y += H + gap
    line = []
  }
  for (const t of items) {
    const w = ctx.measureText(t).width + 12
    const total = line.reduce((n, c) => n + c.w, 0) + line.length * gap + w
    if (line.length && total > W - PAD * 2) flush()
    line.push({ t, w })
  }
  flush()
  p.y -= gap
}

// ------------------------------------------------------------------ CARD ----

/**
 * Draws the poster and hands back a PNG.
 *
 * Returns null rather than throwing on any failure. The button that calls
 * this is on the screen a player reaches by dying, and an exception there
 * would replace the summary with a blank page.
 */
export async function runCardBlob(r: Summary): Promise<Blob | null> {
  try {
    // The face has been on screen for the whole run, but canvas keeps its own
    // idea of what is loaded and silently falls back to monospace without it.
    if (document.fonts) {
      await document.fonts.load('13px ' + TITLE_FACE)
      await document.fonts.load('6px ' + TITLE_FACE)
      await document.fonts.ready
    }

    const art = await Promise.all(r.build.map((b) => loadIcon(b.icon)))
    const ammoArt = await Promise.all(r.ammo.map((a) => loadIcon(a.icon)))

    const tall = document.createElement('canvas')
    tall.width = W * SCALE
    tall.height = 2600 * SCALE
    const ctx = tall.getContext('2d')
    if (!ctx) return null
    ctx.scale(SCALE, SCALE)
    ctx.textBaseline = 'alphabetic'

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, 2600)

    const p: Pen = { ctx, y: PAD }

    // ---- who made this, and what it is ------------------------------------
    centred(p, 'SOUL', 20, GOLD, 6)
    p.y += 10
    centred(p, 'FLORIANO SOB ATAQUE', 7, DIM, 4)
    p.y += 20
    rule(p)
    p.y += 20

    // ---- how it ended ------------------------------------------------------
    centred(p, r.verdict, 9, r.won ? GREEN : RED, 4)
    p.y += 22

    /*
     * THE TITLE SHRINKS TO FIT RATHER THAN WRAPPING.
     *
     * It is the one thing on the poster that has to read at thumbnail size in
     * a chat window, and a two-line headline in a square pixel face at this
     * width stops being a headline. Every title in the pool fits at 26; the
     * step-down is there for the long ones.
     */
    let size = 26
    font(ctx, size)
    while (size > 12 && ctx.measureText(r.title).width > W - PAD * 2) {
      size -= 1
      font(ctx, size)
    }
    ctx.fillStyle = '#000'
    ctx.textAlign = 'center'
    ctx.fillText(r.title, W / 2 + 2, p.y + size + 2)
    ctx.fillStyle = GOLD
    ctx.fillText(r.title, W / 2, p.y + size)
    p.y += size + 16

    paragraph(p, r.why, 7, DIM, 8)
    p.y += 6
    centred(p, r.won ? 'A IGREJA' : 'CHEGOU EM: ' + r.actName.toUpperCase(), 6, FAINT, 2)
    p.y += 22
    rule(p)

    // ---- the numbers -------------------------------------------------------
    const figs: [string, string][] = [
      ['TEMPO', clockOf(r.seconds)],
      ['ABATIDOS', String(r.kills)],
      ['NÍVEL', String(r.level)],
      ['PRECISÃO', Math.round(r.accuracy * 100) + '%'],
      ['RITMO', Math.round(r.pace) + '/min'],
      ['DISTÂNCIA', r.distance + 'm'],
      ['DANO', short(r.stats.damage)],
      ['MAIOR GOLPE', short(r.stats.bestHit)],
      ['GRANDES', String(r.stats.miniBosses)],
      ['TIROS', String(r.stats.shots)],
      ['SEM ENCOSTAR', clockOf(r.stats.bestStreak)],
      ['TOMBOS', String(r.deaths)],
      ['CURA', short(r.stats.healed)],
      ['SOFRIDO', short(r.stats.taken)],
      ['ABDUZIDO', r.stats.escaped + '/' + r.stats.grabbed],
    ]
    p.y += 26
    const cols = 3
    const colW = (W - PAD * 2) / cols
    for (let i = 0; i < figs.length; i++) {
      const cx = PAD + colW * (i % cols) + colW / 2
      const cy = p.y + Math.floor(i / cols) * 46
      figure(ctx, cx, cy, figs[i][0], figs[i][1])
    }
    p.y += Math.ceil(figs.length / cols) * 46 + 8
    rule(p)

    // ---- what he put down --------------------------------------------------
    if (r.bosses.length) {
      heading(p, 'CHEFES')
      chips(p, r.bosses, 'rgba(111,217,122,0.6)', 0.05)
      p.y += 6
    }

    // ---- what he was carrying ---------------------------------------------
    const group = (head: string, kinds: string[]) => {
      const idx = r.build
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => kinds.includes(b.kind))
      if (!idx.length) return
      heading(p, head)
      tiles(p, idx.map(({ b, i }) => ({
        icon: art[i], glyph: b.glyph, stacks: b.stacks, rarity: b.rarity,
      })))
      p.y += 10
      // The names under the tiles, because art alone does not tell somebody
      // reading the image which of two similar tiles you actually took.
      paragraph(p, idx.map(({ b }) =>
        b.name + (b.stacks > 1 ? ' ×' + b.stacks : '')).join('  ·  '),
      6, DIM, 7)
    }
    group('PODERES', ['power', 'special'])

    if (r.ammo.length) {
      heading(p, 'MUNIÇÃO')
      tiles(p, r.ammo.map((_a, i) => ({
        icon: ammoArt[i], glyph: '●', stacks: 1, rarity: 'raro',
      })))
      p.y += 10
      paragraph(p, r.ammo.map((a) => a.name).join('  ·  '), 6, DIM, 7)
    }

    group('MELHORIAS', ['stat'])

    if (r.medals.length) {
      heading(p, 'MEDALHAS')
      chips(p, r.medals, 'rgba(255,212,121,0.45)', 0.08)
    }

    // ---- signature ---------------------------------------------------------
    p.y += 24
    rule(p, 0.14)
    p.y += 16
    centred(p, 'INDIGENA STUDIOS', 6, FAINT, 4)
    p.y += 10
    centred(p, new Date().toLocaleDateString('pt-BR'), 6, '#5d564c', 2)
    p.y += PAD

    // ---- cut to what was used ---------------------------------------------
    const H = Math.ceil(p.y)
    const out = document.createElement('canvas')
    out.width = W * SCALE
    out.height = H * SCALE
    const oc = out.getContext('2d')
    if (!oc) return null
    oc.imageSmoothingEnabled = false
    oc.drawImage(tall, 0, 0, W * SCALE, H * SCALE, 0, 0, W * SCALE, H * SCALE)

    // A gold hairline around the whole poster, drawn last so nothing overlaps
    // it and it survives the crop.
    oc.strokeStyle = 'rgba(255,212,121,0.35)'
    oc.lineWidth = SCALE
    oc.strokeRect(SCALE / 2, SCALE / 2, out.width - SCALE, out.height - SCALE)

    return await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), 'image/png'))
  } catch {
    return null
  }
}

/** 12.4k rather than 12403 — the poster has three columns, not three inches. */
function short(n: number): string {
  const v = Math.round(n)
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M'
  if (v >= 10000) return Math.round(v / 1000) + 'k'
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k'
  return String(v)
}

/** `soul-o-santo-de-floriano.png`, so a folder of them is readable. */
export function runCardName(r: Summary): string {
  const slug = r.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return 'soul-' + (slug || 'corrida') + '.png'
}
