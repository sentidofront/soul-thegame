import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

/**
 * THE PAGE IS A GAME, NOT A DOCUMENT.
 *
 * `user-scalable=no` in the viewport meta is a request, and two of the three
 * browsers that matter decline it: iOS Safari has ignored it since iOS 10, and
 * on a Mac trackpad a pinch is not a touch gesture at all — it arrives as a
 * wheel event with ctrl held, which no meta tag has ever governed. So the game
 * could be zoomed on both, and a zoomed canvas puts the cursor and the world
 * in different places, which is the last thing this particular game needs.
 *
 * Three listeners, all of them `passive: false` because a passive listener is
 * not allowed to prevent anything:
 *
 *   - ctrl+wheel, which is trackpad pinch and ctrl+scroll zoom on every
 *     desktop browser;
 *   - `gesturestart`/`change`/`end`, which is Safari's own pinch, on the phone
 *     and on the desktop;
 *   - a second tap inside 300ms, which is iOS double-tap-to-zoom.
 *
 * Deliberately NOT here: Cmd/Ctrl and +/-/0. That is the browser's own zoom
 * control and it belongs to the person using the browser — someone who needs
 * the game bigger is entitled to make it bigger. What is blocked is only the
 * zoom nobody asked for, arrived at by a gesture they were making at the game.
 */
function holdTheViewport() {
  const stop = (e: Event) => e.preventDefault()
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault() }, { passive: false })
  window.addEventListener('gesturestart', stop, { passive: false })
  window.addEventListener('gesturechange', stop, { passive: false })
  window.addEventListener('gestureend', stop, { passive: false })

  let lastTap = 0
  window.addEventListener('touchend', (e) => {
    const now = e.timeStamp
    if (now - lastTap < 300) e.preventDefault()
    lastTap = now
  }, { passive: false })
}
holdTheViewport()

const root = document.getElementById('root')
if (!root) throw new Error('#root não encontrado')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
