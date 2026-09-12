import type { CSSProperties, ReactNode } from 'react'

/**
 * Kenney's 9-slice panels, done with CSS `border-image` instead of nine
 * absolutely-positioned divs. The source PNGs are 48x48 with 16px corners, so
 * `border-image-slice: 16 fill` carves them up correctly and `scale` decides
 * how chunky the frame reads at the app's resolution.
 */
const SKINS = {
  brown: '/ui/PixelUIpack/9-Slice/Ancient/brown.png',
  brownInlay: '/ui/PixelUIpack/9-Slice/Ancient/brown_inlay.png',
  grey: '/ui/PixelUIpack/9-Slice/Ancient/grey.png',
  greyInlay: '/ui/PixelUIpack/9-Slice/Ancient/grey_inlay.png',
  tan: '/ui/PixelUIpack/9-Slice/Ancient/tan.png',
  green: '/ui/PixelUIpack/9-Slice/Colored/green.png',
  red: '/ui/PixelUIpack/9-Slice/Colored/red.png',
  blue: '/ui/PixelUIpack/9-Slice/Colored/blue.png',
  yellow: '/ui/PixelUIpack/9-Slice/Colored/yellow.png',
  greenPressed: '/ui/PixelUIpack/9-Slice/Colored/green_pressed.png',
  /*
   * THE ONE THE REST OF THE GAME USES NOW.
   *
   * Bamboo frame, dark board. Built at 16x16 with a 5px corner out of the UI
   * sheet's own four colours in the sheet's own order — dark rim, green, lit
   * edge, dark line, face — so a dialog is made of the same material as the
   * sign on the front door. The Kenney skins above are still here for the
   * level-up cards, which are a different object and read as one.
   */
  bamboo: '/ui/panel_bamboo.png',
} as const

export type Skin = keyof typeof SKINS

/** The Kenney sheets are 48x48 with 16px corners; the bamboo one is 16x16
 *  with 5px corners, and the slice has to follow the file it came from. */
const SLICE: Partial<Record<Skin, number>> = { bamboo: 5 }

export function panelStyle(skin: Skin, scale = 3): CSSProperties {
  const s = SLICE[skin] ?? 16
  return {
    borderStyle: 'solid',
    borderWidth: s * scale + 'px',
    borderImageSource: 'url(' + SKINS[skin] + ')',
    borderImageSlice: s + ' fill',
    borderImageWidth: s * scale + 'px',
    borderImageRepeat: 'stretch',
    imageRendering: 'pixelated',
  }
}

export function Panel({
  skin = 'brown', scale = 3, children, className, style,
}: {
  skin?: Skin
  scale?: number
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={className} style={{ ...panelStyle(skin, scale), ...style }}>
      {children}
    </div>
  )
}

/**
 * O BOTÃO DE BAMBU.
 *
 * The three pills off the UI sheet — one PNG each, 48x16, three-sliced so the
 * rounded caps stay exactly as drawn while the middle stretches to whatever
 * width the button needs. `--pill` is the integer scale, and it is an integer
 * on purpose: pixel art at 2.6x is pixel art with some rows twice as tall as
 * the others.
 *
 * TONES, and what they mean, everywhere in the game:
 *   olive — go. The thing this screen exists for.
 *   tan   — everything else you might do here.
 *   brown — the one you might regret. Never the default focus.
 *
 * The label and the little arrow are positioned rather than in flow, because
 * the border-image eats thirteen of the sixteen rows as border and anything
 * left in normal flow lands in the three-pixel gap between them.
 */
export function Pill({
  tone = 'tan', className, onClick, disabled, autoFocus, children,
}: {
  tone?: 'olive' | 'tan' | 'brown'
  className?: string
  onClick?: () => void
  disabled?: boolean
  autoFocus?: boolean
  children?: ReactNode
}) {
  return (
    <button
      className={'pill pill-' + tone + (className ? ' ' + className : '')}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
    >
      <span className="pill-cue" aria-hidden="true" />
      <span className="pill-label">{children}</span>
    </button>
  )
}
