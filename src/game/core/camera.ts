import { CONFIG } from '../config'

/**
 * The camera owns the world -> screen transform.
 *
 * Zoom is always an INTEGER. Pixel art scaled by 2.5x gets uneven pixel widths
 * and shimmers when it moves; integer zoom keeps every source pixel the same
 * size on screen. The camera's screen offset is rounded for the same reason.
 */
export class Camera {
  x = 0
  y = 0
  zoom = 3
  width = 0
  height = 0
  private shake = 0
  /**
   * THE LEAD, SMOOTHED, and it is smoothed separately from the position.
   *
   * The camera already eases toward its goal, but the GOAL itself used to jump
   * the moment the stick changed direction — so the easing was chasing a
   * target that teleported, and what came out was a swing. Easing the lead
   * first means a reversal moves the goal gradually, and the camera never has
   * anything sudden to catch up with.
   */
  private leadX = 0
  private leadY = 0

  resize(cssW: number, cssH: number) {
    this.width = cssW
    this.height = cssH
    const raw = Math.floor(cssH / CONFIG.VIEW_HEIGHT)
    this.zoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, raw || CONFIG.MIN_ZOOM))
  }

  /** Visible world-space rectangle, used to cull chunks and entities. */
  get viewW() { return this.width / this.zoom }
  get viewH() { return this.height / this.zoom }

  follow(tx: number, ty: number, dt: number, leadX = 0, leadY = 0) {
    // About a third of a second to turn the lead around, which is slower than
    // anybody changes direction and is exactly the point.
    const k = 1 - Math.pow(0.02, dt)
    this.leadX += (leadX - this.leadX) * k
    this.leadY += (leadY - this.leadY) * k
    const goalX = tx + this.leadX * CONFIG.CAM_LOOKAHEAD
    const goalY = ty + this.leadY * CONFIG.CAM_LOOKAHEAD
    // Frame-rate independent exponential smoothing.
    const t = 1 - Math.pow(CONFIG.CAM_SMOOTH, dt)
    this.x += (goalX - this.x) * t
    this.y += (goalY - this.y) * t
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3.2)
  }

  addShake(amount: number) { this.shake = Math.min(1, this.shake + amount) }

  /**
   * How much the screen is already moving.
   *
   * Read by the things that fire OFTEN — a big body going down, with four
   * hundred of them on the field — so they can decline to add to a shake that
   * is already running. Without it the late game is a permanent tremor, which
   * is the exact opposite of what a shake is for: it stops meaning anything
   * the moment it never stops.
   */
  get shaking() { return this.shake }

  /** Applies the world transform to a context. Call inside save()/restore(). */
  apply(ctx: CanvasRenderingContext2D) {
    let ox = this.width / 2 - this.x * this.zoom
    let oy = this.height / 2 - this.y * this.zoom
    if (this.shake > 0) {
      const s = this.shake * this.shake * 7 * this.zoom
      ox += (Math.random() * 2 - 1) * s
      oy += (Math.random() * 2 - 1) * s
    }
    ctx.setTransform(this.zoom, 0, 0, this.zoom, Math.round(ox), Math.round(oy))
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.width / 2) / this.zoom + this.x,
      y: (sy - this.height / 2) / this.zoom + this.y,
    }
  }
}
