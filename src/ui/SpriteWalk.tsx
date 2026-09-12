import { useEffect, useRef } from 'react'
import type { Assets } from '../game/core/assets'
import type { SheetKey } from '../game/data/sprites'

/**
 * A SLICED SPRITE SHEET, ANIMATING, IN THE DOM.
 *
 * The menu is React and the game is canvas, and they share nothing — but the
 * loader has already done the hard part by the time a menu exists: it has
 * measured the hand-drawn strip, cut it on the emptiest columns and repacked
 * it into uniform cells anchored at the feet. All this has to do is step
 * through those cells.
 *
 * It runs its own rAF rather than borrowing the game's loop, because the menu
 * is alive while the simulation is not.
 */
export function SpriteWalk(
  { assets, sheet = 'player_gun_walk', scale = 5, fps }:
  { assets: Assets | null; sheet?: SheetKey; scale?: number; fps?: number },
) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !assets) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    let raf = 0
    let sized = false
    const t0 = performance.now()

    /*
     * The sheet is looked up EVERY FRAME rather than once up front.
     *
     * `Assets` is a single object created in the Game constructor and filled in
     * later by `load()`, so its identity never changes — which means a React
     * effect that bailed out early because the art had not arrived yet would
     * never be re-run and the sprite would sit blank for ever. Resolving each
     * frame is one map lookup and it makes the component simply start working
     * the moment the sheet lands.
     */
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const s = assets.sheet(sheet) ?? assets.sheet('player_idle')
      if (!s) return

      if (!sized) {
        canvas.width = Math.round(s.fw * scale)
        canvas.height = Math.round(s.fh * scale)
        ctx.imageSmoothingEnabled = false
        sized = true
      }

      const rate = fps ?? (s.fps > 0 ? s.fps : 8)
      const frame = s.frames > 1 ? Math.floor(((now - t0) / 1000) * rate) % s.frames : 0
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(
        s.img,
        frame * s.fw, 0, s.fw, s.fh,
        0, 0, canvas.width, canvas.height,
      )
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [assets, sheet, scale, fps])

  return <canvas ref={ref} className="spritewalk" aria-hidden="true" />
}
