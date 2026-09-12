import { useState } from 'react'

/**
 * A 32x32 piece of pixel art, with a graceful answer for art that does not
 * exist yet.
 *
 * Half this game's icons are still being drawn. An `<img>` pointing at a file
 * that is not there renders as a broken-image glyph — the ugliest possible
 * failure, and one that makes a half-finished build look broken rather than
 * unfinished. So a failed load swaps in the card's own symbol on a dashed
 * tile, which reads as "not drawn yet" instead of "something went wrong".
 */
export function PixelIcon({
  src, glyph, size = 32, className,
}: {
  src: string
  glyph: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed || !src) {
    return (
      <span
        className={'pixicon pixicon-missing' + (className ? ' ' + className : '')}
        style={{ width: size, height: size, fontSize: size * 0.55 }}
        aria-hidden="true"
      >
        {glyph}
      </span>
    )
  }

  return (
    <img
      className={'pixicon' + (className ? ' ' + className : '')}
      src={encodeURI(src)}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
    />
  )
}
