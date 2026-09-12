/**
 * Small, fast, seedable PRNG (mulberry32).
 *
 * Procedural generation must be deterministic: the chunk at (12, -3) has to
 * look identical every time it is regenerated after being evicted from the
 * cache. So world generation never touches Math.random() — it derives a local
 * RNG from (worldSeed, chunkX, chunkY).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mixes three integers into one well-distributed 32-bit seed. */
export function hash3(a: number, b: number, c: number): number {
  let h = 2166136261 >>> 0
  h = Math.imul(h ^ (a & 0xffff), 16777619)
  h = Math.imul(h ^ ((a >>> 16) & 0xffff), 16777619)
  h = Math.imul(h ^ (b & 0xffff), 16777619)
  h = Math.imul(h ^ ((b >>> 16) & 0xffff), 16777619)
  h = Math.imul(h ^ (c & 0xffff), 16777619)
  return h >>> 0
}

/** Smooth 1D value noise — used for the meandering road and biome edges. */
export function noise1(x: number, seed = 1): number {
  const i = Math.floor(x)
  const f = x - i
  const s = f * f * (3 - 2 * f)
  const a = (hash3(i, seed, 0) >>> 8) / 16777216
  const b = (hash3(i + 1, seed, 0) >>> 8) / 16777216
  return a + (b - a) * s
}
