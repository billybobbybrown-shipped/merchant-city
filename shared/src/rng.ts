// Deterministic RNG — same seed always produces the same world/asset.
export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts: number[]): number {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const rint = (rng: RNG, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

export const rrange = (rng: RNG, min: number, max: number) =>
  min + rng() * (max - min);

export const pick = <T>(rng: RNG, arr: readonly T[]): T =>
  arr[Math.floor(rng() * arr.length)];

export const chance = (rng: RNG, p: number) => rng() < p;
