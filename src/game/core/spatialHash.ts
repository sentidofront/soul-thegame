/**
 * Uniform grid broad-phase.
 *
 * Rebuilt from scratch every tick (cheap: one pass over the enemy array) and
 * queried by bullets, the player, and the enemy separation pass. Without it,
 * 400 bullets against 700 enemies is 280k distance checks per tick; with it,
 * each query touches only the handful of enemies in the overlapping cells.
 *
 * Stores INDICES into a dense array, not object references, so it stays valid
 * as long as it is rebuilt after any removal.
 */
export class SpatialHash {
  private cells = new Map<number, number[]>()
  private spare: number[][] = []

  constructor(private readonly cell: number) {}

  /** Injective for |cellY| < 50000, which is far beyond any world we generate. */
  private key(cx: number, cy: number) { return cx * 100000 + cy }

  clear() {
    for (const arr of this.cells.values()) { arr.length = 0; this.spare.push(arr) }
    this.cells.clear()
  }

  insert(index: number, x: number, y: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell))
    let arr = this.cells.get(k)
    if (!arr) { arr = this.spare.pop() ?? []; this.cells.set(k, arr) }
    arr.push(index)
  }

  /** Appends every index within the cells overlapping the circle into `out`. */
  query(x: number, y: number, radius: number, out: number[]): number[] {
    out.length = 0
    const c = this.cell
    const x0 = Math.floor((x - radius) / c)
    const x1 = Math.floor((x + radius) / c)
    const y0 = Math.floor((y - radius) / c)
    const y1 = Math.floor((y + radius) / c)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy))
        if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i])
      }
    }
    return out
  }
}
