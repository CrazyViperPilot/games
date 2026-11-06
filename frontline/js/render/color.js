// Farbhilfen der Darstellung (seit v5.59, Review-Paket P6, Befund Q-05 Farben): einmal hier statt je Malmodul (nature.js,
// unitpaint.js, sprites.js, citylayer.js hatten eigene Kopien). Nur Rechnen mit Farbtexten, kein Zeichnen, kein DOM.

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
