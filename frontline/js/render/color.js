// Farb- und Rechenhilfen der Darstellung (seit v5.59, Review-Paket P6, Befund Q-05 Farben; hashXY und clamp seit v5.64, P11):
// einmal hier statt je Malmodul (nature.js, unitpaint.js, sprites.js, citylayer.js, fx.js, isobuild.js, maptown.js, props.js,
// camera.js, reliefimg.js hatten eigene Kopien). Nur Rechnen, kein Zeichnen, kein DOM.

/** Farbe als [r, g, b] (0 … 255): '#rrggbb' oder 'rgb(r,g,b)' (Ergebnis von shade/tint in sprites.js). */
export function rgbOf(c) {
  if (c.startsWith('rgb')) return c.match(/\d+/g).slice(0, 3).map(Number);
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** [r, g, b] als '#rrggbb' (gerundet, auf 0 … 255 begrenzt). */
export const hexOf = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Farbe a nach b mischen: t = 0 ergibt a, 1 ergibt b. Ergebnis '#rrggbb'. */
export function mix(a, b, t) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return hexOf(A.map((v, i) => v + (B[i] - v) * t));
}

/** Wert auf lo … hi begrenzen. */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Fester Streuwert (32 Bit, ohne Vorzeichen) für einen Punkt: gleiche Lage, gleiches Aussehen. Koordinaten werden gerundet. */
export const hashXY = (x, y = 0) => (Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(y) | 0, 19349663)) >>> 0;
