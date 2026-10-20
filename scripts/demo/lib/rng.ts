/**
 * Seeded randomness for the demo world. Every random choice is keyed by a stable string
 * (persona + date + what), so re-running the seed on the same day produces the same docs
 * with the same ids — the seed is idempotent by construction, not by a "did I run?" probe.
 */

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for fake data. Returns [0, 1). */
export function rngFrom(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One number in [0, 1) for a key — the common "roll the dice for this day" case. */
export function roll(key: string): number {
  return rngFrom(key)();
}

export function between(r: () => number, min: number, max: number): number {
  return min + r() * (max - min);
}

export function intBetween(r: () => number, min: number, max: number): number {
  return Math.floor(between(r, min, max + 1));
}

export function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

/** Approximately normal (Irwin–Hall of 4), mean 0, sd ≈ 1. */
export function gauss(r: () => number): number {
  return (r() + r() + r() + r() - 2) * Math.sqrt(3);
}
