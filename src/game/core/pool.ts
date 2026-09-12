/**
 * A dense object pool.
 *
 * `items` holds only live objects, packed with no holes, so the hot loops are
 * a plain indexed for-loop over contiguous data. Removal is swap-with-last
 * (O(1)) and the dead object is recycled instead of garbage — at 700 enemies
 * spawning and dying continuously, allocation is what would cause frame hitches.
 *
 * Because removal reorders the array, iterate BACKWARDS when removing.
 */
export class Pool<T> {
  readonly items: T[] = []
  private free: T[] = []

  constructor(private factory: () => T, readonly max: number) {}

  get count() { return this.items.length }
  get full() { return this.items.length >= this.max }

  /** Returns null when the pool is at capacity — callers must handle it. */
  spawn(): T | null {
    if (this.items.length >= this.max) return null
    const obj = this.free.pop() ?? this.factory()
    this.items.push(obj)
    return obj
  }

  removeAt(i: number) {
    const obj = this.items[i]
    const last = this.items.pop()!
    if (i < this.items.length) this.items[i] = last
    this.free.push(obj)
  }

  clear() {
    while (this.items.length) this.free.push(this.items.pop()!)
  }
}
