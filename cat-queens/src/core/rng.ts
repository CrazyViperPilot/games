// Deterministischer Zufall: gleicher Seed ergibt auf jedem Gerät dasselbe Rätsel.

/** Hash eines Strings auf 32 Bit (FNV-1a), Grundlage für Seeds wie "daily-2026-10-26". */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Gleichverteilt in [0, 1). */
  next(): number;
  /** Ganzzahl in [0, max). */
  int(max: number): number;
  /** Zufälliges Element. */
  pick<T>(arr: readonly T[]): T;
  /** Mischt das Array in place und gibt es zurück. */
  shuffle<T>(arr: T[]): T[];
}

/** Mulberry32: klein, schnell, gut genug für Rätsel. */
export function createRng(seed: number | string): Rng {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (max: number): number => Math.floor(next() * max);
  return {
    next,
    int,
    pick: (arr) => arr[int(arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },
  };
}
