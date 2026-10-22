// Deterministischer Zufallsgenerator (mulberry32). Gleicher Seed = gleiche Folge.

/**
 * @param {number} seed
 * @returns {{ next(): number, range(a: number, b: number): number, int(a: number, b: number): number, pick(arr: any[]): any }}
 *   next() liefert Werte in [0, 1); int() ist inklusiv.
 */
export function makeRng(seed) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}
