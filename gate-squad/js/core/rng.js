// Seeded RNG (mulberry32). Liefert eine Funktion, die Zahlen in [0,1) erzeugt.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Zufallszahl in [a, b)
export function randRange(rng, a, b) {
  return a + (b - a) * rng();
}

// Ganzzahl in [a, b] (inklusive)
export function randInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

// Zufälliges Element aus arr
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
