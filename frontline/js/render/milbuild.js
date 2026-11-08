// Militärgebäude in 2D und Iso (seit v5.21, PRD §9): FOB (Zentrale), Mauer, Tor, Mörser, Flugabwehr, Phalanx, Gefechtsturm
// (mit Dachaufbau Mörser, Flak oder SAM), Sendemast, Bohrer und die Baustellen davon. Wie die Stadtgebäude wird jedes Bild über
// spritecache.js einmal je Maßstab gemalt und danach nur kopiert; isometrisch für jede Drehung dasselbe Bild (Daniel dreht nie),
// nur Mauern und Tore richten sich nach ihren Nachbarn in Blickrichtung. Örtliche Koordinaten ab der Mitte des Gebäudes in
// Weltpixeln (u = +x, v = +y), Bauteile aus isokit.js. Teamfarbe: Rand um den Platz, Dächer, Bänder und Fahnen.
// Nur Zeichnen: liest b = { type, team, cx, cy, w, x, y, built, progress, hp, maxHp, roof, main }.
import {
  poly, box, lit, OUTLINE, shade, tint, snowy, roofSnowOn, cyl, cap, circle, ball, G, stroke, flat, shadow, wallBand, wins, door, parapet, vault, flagpole, acUnit, dish, mast, fence, lamp, car, rnd, rectF, rectS, polyF, shadowTop, flatTop, lineT, vaultTop, acTop, dishTop, latticeTop, carTop,
} from './isokit.js';
import { sprite, blit, spriteDpr } from './spritecache.js';

export const MIL_TYPES = new Set(['fob', 'wall', 'gate', 'mortar', 'aa', 'phalanx', 'tower', 'radio', 'drill']);

const TAU = Math.PI * 2;
const SAND = '#c4b088'; // Sandsäcke
const HESCO = '#c4b892'; // Drahtkörbe mit Sand (Vlies khaki)
const FILL = '#ab9a74'; // Sand oben in den Körben
const OLIVE = '#5f6b3e';
const CANVAS = '#6b7350'; // Zeltplane
const DIRT = '#9b9480';
const GRAVEL = '#a8a294';
const PAD = '#b3b0a6'; // Betonplatte
const CONC = '#b9bab2'; // Beton der Mauern
const GUN = '#2c302b';
const RED = '#c0392b';
const MAST_H = 170; // Höhe des Sendemasts über dem Fundament (wie vorher)

// ---------- Bauteile (Iso) ----------

/** Körper mit beliebigem konvexem Grundriss pts von h0 bis h1: sichtbare Seiten (nach Licht) und Deckel. */
function prism(g, pts, h0, h1, color, top = color, line = OUTLINE) {
  const { P } = g;
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1];
  const sg = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const [a, b] = pts[i];
    const [c, d] = pts[(i + 1) % n];
    const nu = (d - b) * sg;
    const nv = -(c - a) * sg;
    if (nu + nv <= 0) continue; // Seite zeigt von der Kamera weg
    poly(g, [P(a, b, h0), P(c, d, h0), P(c, d, h1), P(a, b, h1)], lit(color, nu, nv, 0), null);
  }
  poly(g, pts.map(([a, b]) => P(a, b, h1)), lit(snowy(top), 0, 0, 1), line);
}

/** Gedrehter Quader: Mitte c = [u, v, h], halbe Achsen ax, ay, az (je [u, v, h]); malt die zur Kamera zeigenden Flächen. */
function obox(g, c, ax, ay, az, color) {
  const { P } = g;
  const pt = (i, j, k) => P(c[0] + i * ax[0] + j * ay[0] + k * az[0], c[1] + i * ax[1] + j * ay[1] + k * az[1], c[2] + i * ax[2] + j * ay[2] + k * az[2]);
  const faces = [
    [ax, [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [ax.map((x) => -x), [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
    [ay, [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [ay.map((x) => -x), [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    [az, [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [az.map((x) => -x), [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
  ];
  for (const [n, q] of faces) {
    if (n[0] + n[1] + n[2] * 0.71 <= 0) continue; // Blickrichtung (1, 1, 0,71)
    poly(g, q.map(([i, j, k]) => pt(i, j, k)), lit(color, ...n));
  }
}

/** Rohr (Geschützrohr, Mörser) von a nach b, je [u, v, h], Breite w, mit heller Kante. */
function tube(g, a, b, w, col = GUN) {
  const pa = g.P(...a);
  const pb = g.P(...b);
  stroke(g, [pa, pb], col, w);
  const o = w * 0.22 * g.z;
  stroke(g, [[pa[0] - o, pa[1] - o], [pb[0] - o, pb[1] - o]], tint(col, 0.35), w * 0.3);
}

/**
 * Ring aus Sandsäcken um (u, v) zwischen ri und ro, von h0 bis h1, mit Lücke [a0, a1] (Winkel, 0 = +u, π/2 = +v).
 * part 'back' = hintere Hälfte (vor dem Inhalt malen), 'front' = vordere (danach), sonst beide.
 */
function bagRing(g, u, v, ri, ro, h0, h1, gap = null, part = null) {
  const N = 22;
  const segs = [];
  for (let k = 0; k < N; k++) {
    const t0 = (k / N) * TAU;
    const t1 = ((k + 1) / N) * TAU;
    const tm = (t0 + t1) / 2;
    if (gap && tm > gap[0] && tm < gap[1]) continue;
    const d = Math.cos(tm) + Math.sin(tm);
    if ((part === 'back' && d > 0) || (part === 'front' && d <= 0)) continue;
    segs.push([t0, t1, d]);
  }
  segs.sort((a, b) => a[2] - b[2]);
  for (const [t0, t1, d] of segs) {
    const [c0, s0, c1, s1] = [Math.cos(t0), Math.sin(t0), Math.cos(t1), Math.sin(t1)];
    prism(g, [[u + ri * c0, v + ri * s0], [u + ro * c0, v + ro * s0], [u + ro * c1, v + ro * s1], [u + ri * c1, v + ri * s1]], h0, h1, SAND, tint(SAND, 0.06), 'rgba(90,75,45,0.35)');
    if (!g.fine) continue;
    const r = d > 0 ? ro : ri; // sichtbare Seite: außen vorn, innen hinten
    const hm = (h0 + h1) / 2;
    stroke(g, [g.P(u + r * c0, v + r * s0, hm), g.P(u + r * c1, v + r * s1, hm)], 'rgba(90,75,45,0.4)', 0.35);
  }
}

/** Gerade Wand aus Sandsäcken (achsparallel). */
function bagWall(g, u0, u1, v0, v1, h) {
  box(g, u0, u1, v0, v1, 0, h, tint(SAND, 0.08), snowy(tint(SAND, 0.14)), 'rgba(90,75,45,0.4)');
  if (!g.fine) return;
  const { P } = g;
  for (let k = 1; k < 3; k++) stroke(g, [P(u0, v1, (h * k) / 3), P(u1, v1, (h * k) / 3), P(u1, v0, (h * k) / 3)], 'rgba(90,75,45,0.35)', 0.35);
}

/** HESCO-Wall: Drahtkörbe voll Sand (je etwa 5 breit), achsparallel, mit Drahtgitter und dunklen Korbfugen. */
function hesco(g, u0, u1, v0, v1, h) {
  box(g, u0, u1, v0, v1, 0, h, HESCO, snowy(FILL));
  if (!g.fine) return;
  const { P } = g;
  const mesh = 'rgba(90,80,60,0.13)';
  for (let k = 1; k < 4; k++) stroke(g, [P(u0, v1, (h * k) / 4), P(u1, v1, (h * k) / 4), P(u1, v0, (h * k) / 4)], mesh, 0.3);
  for (let a = u0 + 1.25; a < u1 - 0.2; a += 1.25) stroke(g, [P(a, v1, 0.2), P(a, v1, h - 0.2)], mesh, 0.3);
  for (let a = v0 + 1.25; a < v1 - 0.2; a += 1.25) stroke(g, [P(u1, a, 0.2), P(u1, a, h - 0.2)], mesh, 0.3);
  for (let a = u0 + 5; a < u1 - 0.5; a += 5) stroke(g, [P(a, v1, 0), P(a, v1, h), P(a, v0, h)], 'rgba(70,60,40,0.45)', 0.45);
  for (let a = v0 + 5; a < v1 - 0.5; a += 5) stroke(g, [P(u1, a, 0), P(u1, a, h), P(u0, a, h)], 'rgba(70,60,40,0.45)', 0.45);
}

/** Platz mit Rand in Teamfarbe (zeigt, wem das Gebäude gehört). */
function pad(g, e, color, team) {
  flat(g, -e, e, -e, e, snowy(color));
  const { P } = g;
  const i = e - 1.4;
  stroke(g, [P(-i, -i), P(i, -i), P(i, i), P(-i, i), P(-i, -i)], team, 1.1);
}

/** Militär-LKW mit Plane (Fahrerhaus bei +u bzw. +v), Teamzeichen auf der Plane. */
function milTruck(g, u, v, along, team) {
  const U = along === 'u';
  const L = 7.5;
  const W = 2.5;
  const bx = (a0, a1, c0, c1, h0, h1, col, top) => (U ? box(g, u + a0, u + a1, v + c0, v + c1, h0, h1, col, top) : box(g, u + c0, u + c1, v + a0, v + a1, h0, h1, col, top));
  if (U) flat(g, u - L, u + L + 0.6, v - W, v + W + 1.8, 'rgba(0,0,0,0.22)');
  else flat(g, u - W, u + W + 0.6, v - L, v + L + 1.8, 'rgba(0,0,0,0.22)');
  for (const a of [-5.4, -2.8, 5]) bx(a - 1.1, a + 1.1, W - 0.4, W + 0.1, 0, 2.1, '#2a2c2b');
  bx(-L, L - 0.2, -W + 0.4, W - 0.4, 1, 1.9, '#3a3d38');
  bx(-L, 2.8, -W, W, 1.9, 7.2, '#56613b', snowy('#606b43'));
  bx(-3, -0.6, -1.2, 1.2, 7.2, 7.25, team, team);
  bx(3.2, L, -W, W, 1.9, 6.2, OLIVE, snowy(tint(OLIVE, 0.1)));
  const { P } = g;
  if (U) poly(g, [P(u + L, v - W + 0.4, 4), P(u + L, v + W - 0.4, 4), P(u + L, v + W - 0.4, 5.6), P(u + L, v - W + 0.4, 5.6)], '#2c3a47', null);
  else poly(g, [P(u - W + 0.4, v + L, 4), P(u + W - 0.4, v + L, 4), P(u + W - 0.4, v + L, 5.6), P(u - W + 0.4, v + L, 5.6)], '#2c3a47', null);
}

/** Stapel olivgrüner Munitionskisten. */
function crates(g, u, v, n, seed = 0) {
  for (let k = 0; k < n; k++) {
    const a = u + (k % 2) * 4.6;
    const b = v + Math.floor(k / 2) * 3.4;
    const h = 2.4 * (1 + Math.floor(rnd(seed + k * 7) * 2));
    box(g, a - 2.1, a + 2.1, b - 1.5, b + 1.5, 0, h, '#56613b', snowy('#66724a'));
    if (g.fine) stroke(g, [g.P(a - 2.1, b + 1.5, h * 0.5), g.P(a + 2.1, b + 1.5, h * 0.5), g.P(a + 2.1, b - 1.5, h * 0.5)], 'rgba(0,0,0,0.25)', 0.35);
  }
}

/** Fässer (Treibstoff) in einer Gruppe. */
function drums(g, u, v, n) {
  for (let k = 0; k < n; k++) {
    const a = u + (k % 3) * 2.6;
    const b = v + Math.floor(k / 3) * 2.6;
    cyl(g, a, b, 1.15, 0, 3.4, '#4f5d3a', true);
  }
}

/** Generator mit Auspuff. */
function generator(g, u0, u1, v0, v1) {
  box(g, u0, u1, v0, v1, 0, 4.6, OLIVE, snowy(tint(OLIVE, 0.08)));
  if (g.fine) for (let a = v0 + 1; a < v1 - 0.5; a += 1) stroke(g, [g.P(u1, a, 1.2), g.P(u1, a, 3.6)], 'rgba(0,0,0,0.3)', 0.3);
  cyl(g, u0 + 1.2, v0 + 1.2, 0.5, 4.6, 7.4, '#3a3d38', true);
}

/** Schranke rot-weiß zwischen (u0, v) und (u1, v) auf Höhe h. */
function barrier(g, u0, u1, v, h) {
  box(g, u0 - 0.8, u0 + 0.8, v - 0.8, v + 0.8, 0, h + 1, '#d0cdc3');
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = u0 + 0.8 + ((u1 - u0 - 0.8) * k) / n;
    const b = u0 + 0.8 + ((u1 - u0 - 0.8) * (k + 1)) / n;
    box(g, a, b, v - 0.35, v + 0.35, h, h + 0.7, k % 2 ? '#f0ede4' : RED);
  }
}

/** Ruß und dunklere Farben für stark beschädigte Gebäude (nur auf schon Gemaltes); k = Größe der Flecken (nach Gebäudegröße). */
function soot(ctx, s, bounds, seed, iso, k = 1) {
  const [x0, y0, x1, y1] = bounds;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(30,22,16,0.3)';
  ctx.fillRect(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
  const w = x1 - x0;
  const h = (iso ? Math.min(y1 - y0, 80) : y1 - y0) * 0.8;
  const yb = iso ? y1 - h - 6 : y0;
  for (let n = 0; n < 6; n++) {
    const x = (x0 + w * (0.15 + 0.7 * rnd(seed + n * 13))) * s;
    const y = (yb + h * (0.1 + 0.8 * rnd(seed + n * 29))) * s;
    const r = (5 + 8 * rnd(seed + n * 7)) * k * s;
    const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    grad.addColorStop(0, 'rgba(15,12,10,0.65)');
    grad.addColorStop(1, 'rgba(15,12,10,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  ctx.restore();
}

// ---------- Gebäude (Iso) ----------

/** FOB (Zentrale, 3 × 3): HESCO-Wall mit Zufahrt und Schranke, Gefechtsstand mit Dach in Teamfarbe, Mannschaftszelt, Radarmast, Fahrzeuge, Nachschub. */
function fob(g, T) {
  flat(g, -46, 46, -46, 46, snowy(GRAVEL));
  flat(g, 6, 20, 14, 46, '#968f7f'); // Fahrspur zum Tor
  flat(g, -20, 41, 4, 18, '#968f7f');
  hesco(g, -46, 46, -46, -42, 7);
  hesco(g, -46, -42, -42, 46, 7);
  // Radarmast mit Gerätecontainer hinten rechts
  box(g, 16, 26, -38, -31, 0, 6.5, '#c9cbc3', snowy('#d6d8d0'));
  wallBand(g, 16, 26, -38, -31, 4.6, 5.4, T);
  door(g, 's', -31, 21, 2.2, 4.6, '#4f5a63');
  mast(g, 32, -32, 0, 36, 3, 0.9, '#9aa0a5', true);
  dish(g, 32, -32, 36, 3.4);
  // Gefechtsstand (Fertigbau) mit Dach in Teamfarbe
  shadow(g, -38, -8, -38, -16, 13);
  box(g, -38, -8, -38, -16, 0, 12, '#b9b5a2');
  wins(g, 's', -16, -38, -8, 5, [[4.5, 8]], 2.8, { frame: false, lit: 0.3, seed: 3 });
  wins(g, 'e', -8, -38, -16, 4, [[4.5, 8]], 2.8, { frame: false, lit: 0.3, seed: 9 });
  door(g, 's', -16, -12.5, 2.6, 5.2, '#4f5a63');
  box(g, -15, -10, -16, -13.5, 0, 0.8, '#9a978b'); // Stufe
  parapet(g, -38, -8, -38, -16, 12, '#b9b5a2', shade(T, 0.12));
  acUnit(g, -32, -30, 11.6, 2.4);
  acUnit(g, -25, -30, 11.6, 2.4);
  dish(g, -14, -33, 11.6, 2.4);
  stroke(g, [g.P(-35, -20, 12), g.P(-35, -20, 26)], '#55595d', 0.5); // Funkantennen
  stroke(g, [g.P(-31, -20, 12), g.P(-31, -20, 22)], '#55595d', 0.5);
  // Mannschaftszelt mit Generator
  vault(g, 'u', -38, -12, -8, 2, 0, 7.5, CANVAS, '#7d8560', 10);
  generator(g, -8, -2, -8, -3);
  // Nachschub: Kisten und Fässer
  crates(g, -38, 12, 6, 5);
  crates(g, -26, 12, 4, 11);
  drums(g, -36, 26, 6);
  // Fahrzeuge
  milTruck(g, 30, -10, 'v', T);
  car(g, 33, 12, 'v', OLIVE);
  // Fahne und Laterne an der Zufahrt
  flagpole(g, 2, 34, 0, 22, T);
  lamp(g, 22, 22, 9);
  // Wachhäuschen und Schranke
  box(g, 22, 27, 34, 39, 0, 6, '#c9c4b4', snowy('#5a5e60'));
  wins(g, 's', 39, 22, 27, 1, [[2.6, 4.6]], 2.6, { frame: false, lit: 0.6 });
  barrier(g, 6, 20, 41.5, 3.6);
  // vordere Wälle mit Lücke für das Tor (rechter Wall zuerst, er liegt dahinter)
  hesco(g, 42, 46, -42, 42, 7);
  hesco(g, 20, 46, 42, 46, 7);
  hesco(g, -42, 6, 42, 46, 7);
}

/** Mörserstellung (2 × 2): Sandsackring mit Zugang, Mörser auf Bodenplatte mit Zweibein, Munitionskisten, Fahne. */
function mortar(g, T) {
  pad(g, 30, DIRT, T);
  poly(g, ringPts(g, 0, 0, 15.5), '#7c7562', null); // Boden der Grube
  flagpole(g, -13, -13, 6, 14, T);
  bagRing(g, 0, 0, 15, 20.5, 0, 6.2, [0.35, 1.25], 'back');
  crates(g, -10, 3, 3, 2);
  // Mörser: Bodenplatte, Rohr schräg nach hinten rechts, Zweibein, Richtaufsatz
  const { P } = g;
  poly(g, ringPts(g, 1, 3, 3.4, 0.5), '#3d403b');
  stroke(g, [P(5.4, -3.6, 8.5), P(3.6, -6.8, 0.3)], '#3a3d38', 0.6);
  stroke(g, [P(5.4, -3.6, 8.5), P(8, -2.2, 0.3)], '#3a3d38', 0.6);
  tube(g, [1, 3, 1.2], [9.5, -9.5, 17], 2.4);
  box(g, 3.2, 4.6, -1.2, 0.2, 5.2, 6.8, '#4a4f45');
  bagRing(g, 0, 0, 15, 20.5, 0, 6.2, [0.35, 1.25], 'front');
  crates(g, 19, 18, 2, 7);
}

const ringPts = (g, u, v, r, h = 0, n = 24) => Array.from({ length: n }, (_, k) => g.P(u + r * Math.cos((k / n) * TAU), v + r * Math.sin((k / n) * TAU), h));

/** Zwillingsrohre ab c = [u, v, h] in Richtung d (Einheitsvektor), Länge len, Abstand sp. */
function twin(g, c, d, len, sp, w = 1.5) {
  const pu = 0.707;
  for (const s of [-1, 1]) {
    const a = [c[0] + s * sp * pu, c[1] + s * sp * pu, c[2]];
    tube(g, a, [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len], w);
    const m = [a[0] + d[0] * len * 0.86, a[1] + d[1] * len * 0.86, a[2] + d[2] * len * 0.86];
    tube(g, m, [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len], w * 1.7); // Mündungsbremse
  }
}

/** Flugabwehr (2 × 2): Betonrund mit Sandsackwall, Zwillingsflak auf Drehkranz mit Schild in Teamfarbe, Radaranhänger, Kisten. */
function aa(g, T) {
  pad(g, 30, DIRT, T);
  poly(g, ringPts(g, 0, 0, 19), '#aaa79b', null);
  flagpole(g, -16, -16, 5, 14, T);
  // Radaranhänger in der rechten Ecke
  box(g, 20, 29, -28, -19, 1.4, 5.8, '#6b7350', snowy('#757d58'));
  for (const a of [-26, -21]) box(g, 28.6, 29.2, a - 1, a + 1, 0, 2.2, '#2a2c2b');
  dish(g, 24.5, -23.5, 5.8, 3);
  bagRing(g, 0, 0, 19, 23.5, 0, 5.2, [0.4, 1.2], 'back');
  cyl(g, 0, 0, 9, 0, 2.4, '#5d6158', true);
  box(g, -6, -3.5, -5, 5, 2.4, 8.5, shade(T, 0.1), snowy(T)); // Schild links
  box(g, -3.5, 4.5, -4, 4, 2.4, 7.6, OLIVE, snowy(tint(OLIVE, 0.08)));
  twin(g, [0.5, -0.5, 8.2], [0.45, -0.45, 0.77], 20, 1.6);
  box(g, 1, 5.5, 2.5, 5, 2.4, 5.4, '#4a5236'); // Sitz
  bagRing(g, 0, 0, 19, 23.5, 0, 5.2, [0.4, 1.2], 'front');
  crates(g, -27, 19, 3, 9);
}

/** Phalanx (2 × 2): Betonsockel mit Teamband, weißer Radardom auf dem Drehgestell, Gatling-Rohr, Leitstand-Container, Generator. */
function phalanx(g, T) {
  pad(g, 30, PAD, T);
  // Warnmarkierung um den Sockel
  const { P } = g;
  stroke(g, [P(-11, -11), P(11, -11), P(11, 11), P(-11, 11), P(-11, -11)], '#d8b630', 1);
  box(g, -8, 8, -8, 8, 0, 6, '#8f9591', snowy('#9ea4a0'));
  wallBand(g, -8, 8, -8, 8, 3.6, 5, T);
  cyl(g, 0, 0, 6.2, 6, 9.6, '#d2d5d0', true);
  box(g, -3.8, 3.8, -3.2, 3.2, 9.6, 15.5, '#dfe2dd', snowy('#e6e9e4'));
  // Radardom
  cyl(g, -0.6, -0.6, 4.4, 15.5, 23, '#eef0ec', false);
  cap(g, -0.6, -0.6, 4.4, 23, '#eef0ec', 0.95);
  // Gatling: Rohrbündel nach vorn rechts oben, Munitionstrommel davor
  tube(g, [2.4, -1.6, 12.6], [13.5, -11, 20.5], 3);
  tube(g, [12.3, -10, 19.6], [14.6, -12, 21.3], 3.8, '#3a3e3a');
  cyl(g, 1.6, 2.4, 2, 9.6, 13.2, '#c9ccc6', true);
  // Leitstand und Generator
  box(g, 12, 26, 10, 20, 0, 8, '#c8cbc4', snowy('#d2d5ce'));
  wallBand(g, 12, 26, 10, 20, 6, 7, T);
  door(g, 's', 20, 16, 2.4, 5, '#4f5a63');
  acUnit(g, 22, 13, 7.6, 2.2);
  generator(g, -25, -15, 14, 21);
  lamp(g, -22, -22, 11);
}

/** Gefechtsturm (2 × 2): Betonschaft mit Schießscharten, auskragende Kanzel mit Sehschlitzen und Teamband, Dach mit Aufbau. */
function tower(g, T, roof) {
  pad(g, 30, DIRT, T);
  shadow(g, -22, 22, -22, 22, 58, 0.22);
  // Schaft
  box(g, -17, 17, -17, 17, 0, 42, '#a9aaa2');
  const slit = { frame: false, glass: '#22261f', lit: 0 };
  wins(g, 's', 17, -17, 17, 3, [[13, 16.5], [27, 30.5]], 2, slit);
  wins(g, 'e', 17, -17, 17, 3, [[13, 16.5], [27, 30.5]], 2, slit);
  if (g.fine) for (const h of [21, 35]) stroke(g, [g.P(-17, 17, h), g.P(17, 17, h), g.P(17, -17, h)], 'rgba(0,0,0,0.12)', 0.5);
  door(g, 's', 17, -6, 5, 8.5, '#4a4f45');
  bagWall(g, -12, 0, 21, 24, 6); // Splitterschutz vor der Tür
  // Kanzel
  box(g, -21, 21, -21, 21, 40, 41.5, '#8f908a');
  box(g, -21, 21, -21, 21, 41.5, 55, '#9c9d95');
  wins(g, 's', 21, -21, 21, 5, [[45, 48.5]], 5, slit);
  wins(g, 'e', 21, -21, 21, 5, [[45, 48.5]], 5, slit);
  wallBand(g, -21, 21, -21, 21, 51.5, 53.5, T);
  parapet(g, -21, 21, -21, 21, 55, '#9c9d95', '#8a8b83');
  const H = 55;
  box(g, -16, -11, 9, 14, H, H + 1.2, '#6f716b'); // Dachluke
  if (roof === 'mortar') {
    bagRing(g, 0, 0, 5, 8.5, H, H + 3);
    tube(g, [0, 1, H + 0.6], [7, -7.5, H + 13], 2.2);
  } else if (roof === 'flak') {
    cyl(g, 0, 0, 5.5, H, H + 1.6, '#5d6158', true);
    box(g, -3, 3, -3, 3, H + 1.6, H + 5.4, OLIVE, tint(OLIVE, 0.08));
    twin(g, [0.4, -0.4, H + 5], [0.45, -0.45, 0.77], 14, 1.2, 1.2);
  } else if (roof === 'sam') {
    cyl(g, 0, 0, 5, H, H + 1.8, '#5d6158', true);
    const d = [0.42, -0.42, 0.8];
    const p = [0.707, 0.707, 0];
    const nrm = [-0.566, 0.566, 0.6]; // d × p (ungefähr), zeigt nach oben
    obox(g, [1.2, -1.2, H + 7], d.map((x) => x * 7), p.map((x) => x * 3.6), nrm.map((x) => x * 2.4), '#d9dcd4');
    const { P, ctx, z } = g;
    for (const [s, t] of [[-1.6, -1], [1.6, -1], [-1.6, 1], [1.6, 1]]) {
      const c = [1.2 + d[0] * 7 + p[0] * s + nrm[0] * t, -1.2 + d[1] * 7 + p[1] * s + nrm[1] * t, H + 7 + d[2] * 7 + p[2] * s + nrm[2] * t];
      const [x, y] = P(...c);
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.ellipse(x, y, 1 * z, 0.75 * z, 0, 0, TAU);
      ctx.fill();
    }
  } else {
    stroke(g, [g.P(-15, -15, H), g.P(-15, -15, H + 14)], '#55595d', 0.55); // Funkantenne
    box(g, 12, 16, -16, -12, H, H + 3, '#5d6158'); // Scheinwerfer
  }
  flagpole(g, 16, 16, H, 15, T);
}

/** Sendemast (2 × 2): Fundament, rot-weißer Gittermast mit Abspannseilen, Schüsseln in Teamfarbe, Gerätehaus, Zaun. */
function radio(g, T) {
  flat(g, -30, 30, -30, 30, snowy(GRAVEL));
  const { P, ctx, z } = g;
  stroke(g, [P(-28.6, -28.6), P(28.6, -28.6), P(28.6, 28.6), P(-28.6, 28.6), P(-28.6, -28.6)], T, 1.1);
  poly(g, [P(-7, 0), P(7, 0), P(1.2, 46), P(-1.2, 46)], 'rgba(0,0,0,0.16)', null); // langer Schatten des Masts
  fence(g, -27, 27, -27, 27, 'back', 4.5);
  // Gerätehaus und Kabelbrücke
  box(g, -25, -9, 8, 22, 0, 8, '#cfd0c8', snowy('#d9dad2'));
  wallBand(g, -25, -9, 8, 22, 6, 7, T);
  door(g, 's', 22, -17, 2.6, 5.2, '#4f5a63');
  acUnit(g, -13, 15, 7.6, 2.2);
  box(g, -9, -4, 13, 15, 6, 7, '#8a8f94');
  generator(g, 12, 21, 14, 21);
  box(g, -9, 9, -9, 9, 0, 3, CONC, snowy(tint(CONC, 0.05)));
  // Gittermast: vier Beine, Abschnitte rot-weiß, Kreuzstreben auf allen Seiten
  const H0 = 3;
  const n = 7;
  const r0 = 7.5;
  const r1 = 1.4;
  const rad = (h) => r0 + ((r1 - r0) * (h - H0)) / MAST_H;
  const leg = (su, sv, h) => P(su * rad(h), sv * rad(h), h);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  // Abspannseile (hinten zuerst)
  ctx.lineCap = 'round';
  for (const f of [0.42, 0.8]) {
    for (const [su, sv] of corners) {
      const h = H0 + MAST_H * f;
      stroke(g, [leg(su, sv, h), P(su * 26, sv * 26, 0)], 'rgba(215,218,210,0.7)', 0.35);
    }
  }
  for (let k = 0; k < n; k++) {
    const h0 = H0 + (MAST_H * k) / n;
    const h1 = H0 + (MAST_H * (k + 1)) / n;
    const col = k % 2 ? '#f2f0ea' : RED;
    for (let i = 0; i < 4; i++) {
      const [au, av] = corners[i];
      const [bu, bv] = corners[(i + 1) % 4];
      const back = au + av + bu + bv < 0; // hintere Seite dünner und dunkler
      const w = back ? 0.3 : 0.4;
      const c = back ? 'rgba(70,70,70,0.55)' : 'rgba(55,55,55,0.8)';
      stroke(g, [leg(au, av, h0), leg(bu, bv, h1)], c, w);
      stroke(g, [leg(bu, bv, h0), leg(au, av, h1)], c, w);
    }
    for (const [su, sv] of corners) stroke(g, [leg(su, sv, h0), leg(su, sv, h1)], su + sv < 0 ? shade(col, 0.25) : col, 1.1);
  }
  // Richtfunkschüsseln in Teamfarbe und Antennenfelder oben
  for (const [h, su, sv] of [[H0 + MAST_H * 0.62, 1, 0], [H0 + MAST_H * 0.5, 0, 1]]) {
    const [x, y] = P(su * (rad(h) + 2.6), sv * (rad(h) + 2.6), h);
    ctx.fillStyle = T;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(0.6, 0.8 * z);
    ctx.beginPath();
    ctx.ellipse(x, y, 3.6 * z, 4.8 * z, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  for (const [su, sv] of [[1, 0], [0, 1], [-1, 0]]) {
    const h = H0 + MAST_H - 10;
    const r = rad(h) + 0.9;
    box(g, su * r - 0.7, su * r + 0.7, sv * r - 0.7, sv * r + 0.7, h - 4, h + 4, '#e3e4de');
  }
  stroke(g, [P(0, 0, H0 + MAST_H), P(0, 0, H0 + MAST_H + 16)], '#d9d9d2', 0.9);
  fence(g, -27, 27, -27, 27, 'front', 4.5);
}

/** Bohrer (2 × 2): Unterbau mit Streben, gelber Bohrturm mit Flaschenzug, Fahrerkabine in Teamfarbe, Rohrlager, Spülungstanks. */
function drill(g, T) {
  pad(g, 30, '#9b9178', T);
  const { P } = g;
  // Spülungstanks hinten rechts
  box(g, 10, 28, -28, -14, 0, 7, '#7d8a8f', snowy('#8d9a9f'));
  if (g.fine) for (const a of [16, 22]) stroke(g, [P(a, -14, 0.5), P(a, -14, 6.5)], 'rgba(0,0,0,0.2)', 0.4);
  stroke(g, [P(10, -14, 8.6), P(28, -14, 8.6), P(28, -28, 8.6)], '#d8b630', 0.45); // Geländer
  generator(g, -28, -18, -28, -20);
  // Unterbau mit Kreuzstreben
  box(g, -11, 11, -11, 11, 0, 10, '#6d7277', snowy('#7d8287'));
  if (g.fine) {
    stroke(g, [P(-11, 11, 0.5), P(11, 11, 9.5)], 'rgba(220,220,210,0.35)', 0.5);
    stroke(g, [P(-11, 11, 9.5), P(11, 11, 0.5)], 'rgba(220,220,210,0.35)', 0.5);
    stroke(g, [P(11, -11, 0.5), P(11, 11, 9.5)], 'rgba(0,0,0,0.3)', 0.5);
    stroke(g, [P(11, -11, 9.5), P(11, 11, 0.5)], 'rgba(0,0,0,0.3)', 0.5);
  }
  // Bohrturm: gelbe Beine, Querstreben, Krone, Flaschenzug
  const H0 = 10;
  const H1 = 66;
  const rad = (h) => 9 + ((2 - 9) * (h - H0)) / (H1 - H0);
  const lg = (su, sv, h) => P(su * rad(h), sv * rad(h), h);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const YEL = '#d9b13a';
  for (const [su, sv] of corners.filter(([a, b]) => a + b < 0)) stroke(g, [lg(su, sv, H0), lg(su, sv, H1)], shade(YEL, 0.3), 0.9);
  for (let h = H0; h < H1 - 1; h += 8) {
    for (let i = 0; i < 4; i++) {
      const [au, av] = corners[i];
      const [bu, bv] = corners[(i + 1) % 4];
      const back = au + av + bu + bv < 0;
      stroke(g, [lg(au, av, h), lg(bu, bv, Math.min(H1, h + 8))], back ? 'rgba(120,95,30,0.5)' : 'rgba(150,120,40,0.85)', back ? 0.3 : 0.4);
      stroke(g, [lg(au, av, h), lg(bu, bv, h)], back ? 'rgba(120,95,30,0.5)' : 'rgba(150,120,40,0.85)', back ? 0.3 : 0.45);
    }
  }
  stroke(g, [P(0, 0, H1), P(0, 0, 38)], '#3a3d38', 0.4);
  stroke(g, [P(0.6, 0.6, H1), P(0.6, 0.6, 38)], '#3a3d38', 0.4);
  box(g, -1.6, 1.6, -1.6, 1.6, 33, 38, '#e0b021');
  stroke(g, [P(0, 0, 33), P(0, 0, 10)], '#5a5f63', 0.9); // Bohrgestänge
  for (const [su, sv] of corners.filter(([a, b]) => a + b >= 0)) stroke(g, [lg(su, sv, H0), lg(su, sv, H1)], YEL, 1.1);
  box(g, -3, 3, -3, 3, H1, H1 + 3, '#8a8f94', snowy('#9aa0a4'));
  // Bohrmeisterhaus in Teamfarbe neben dem Unterbau
  box(g, 13, 22, -8, 1, 0, 7.5, T, snowy(tint(T, 0.15)));
  wins(g, 's', 1, 14, 21, 2, [[3.6, 6]], 2.6, { frame: false, lit: 0.5 });
  wins(g, 'e', 22, -7, 0, 1, [[3.6, 6]], 3.4, { frame: false, lit: 0.5 });
  // Rohrlager und Rampe zum Bohrboden
  for (let k = 0; k < 3; k++) for (let j = 0; j < 4 - k; j++) {
    const v = 16 + j * 2 + k;
    const h = 1 + k * 1.7;
    stroke(g, [P(-28, v, h), P(-8, v, h)], '#7d6b5a', 1.5);
    stroke(g, [P(-28, v, h + 0.5), P(-8, v, h + 0.5)], 'rgba(255,255,255,0.18)', 0.4);
  }
  poly(g, [P(-6, 26, 0), P(-1, 26, 0), P(-1, 11, 10), P(-6, 11, 10)], lit('#8a8f94', 0, 0.6, 0.8));
  stroke(g, [P(-1, 26, 3), P(-1, 11, 13)], '#d8b630', 0.45); // Geländer
  flagpole(g, 24, 22, 0, 16, T);
}

/** Teile eines Mauerstücks: [u0, u1, v0, v1, Pfeiler?]. Gerade Stücke sind eine durchgehende Wand, Ecken, Enden und Abzweige
 *  bekommen einen Pfeiler, von dem die Arme zu den Nachbarn gehen (Maske: 1 = +u, 2 = +v, 4 = −u, 8 = −v; Reihenfolge von hinten). */
function wallParts(m) {
  const t = 2.6;
  const p = 3.6;
  if (m === 0) return [[-12, 12, -t, t, false]]; // einzelnes Stück
  if (m === 5) return [[-16, 16, -t, t, false]];
  if (m === 10) return [[-t, t, -16, 16, false]];
  const parts = [];
  if (m & 8) parts.push([-t, t, -16, -p, false]);
  if (m & 4) parts.push([-16, -p, -t, t, false]);
  parts.push([-p, p, -p, p, true]);
  if (m & 1) parts.push([p, 16, -t, t, false]);
  if (m & 2) parts.push([-t, t, p, 16, false]);
  return parts;
}

const WALL_H = 22;

/** Mauerstück (1 × 1): Betonwände (T-Wall) mit Fuß, Fugen je Platte und Teamband, zu den Nachbarn hin verbunden. */
function wall(g, T, m) {
  const H = WALL_H;
  const parts = wallParts(m);
  for (const [u0, u1, v0, v1] of parts) flat(g, u0, u1, v0, v1 + 6.8, 'rgba(0,0,0,0.16)');
  const { P } = g;
  for (const [u0, u1, v0, v1, post] of parts) {
    const alongU = u1 - u0 > v1 - v0;
    const fu = post ? 0.8 : alongU ? 0 : 1.4;
    const fv = post ? 0.8 : alongU ? 1.4 : 0;
    box(g, u0 - fu, u1 + fu, v0 - fv, v1 + fv, 0, 2.2, shade(CONC, 0.1), snowy(shade(CONC, 0.04)));
    box(g, u0, u1, v0, v1, 2.2, post ? H + 1.6 : H, CONC, snowy(tint(CONC, 0.12)));
    wallBand(g, u0, u1, v0, v1, H - 4.4, H - 2.8, T);
    if (!g.fine || post) continue;
    const step = 32 / 6; // Platten je Feld
    if (alongU) for (let a = Math.ceil((u0 + 0.5) / step) * step; a < u1 - 0.5; a += step) stroke(g, [P(a, v1, 2.2), P(a, v1, H)], 'rgba(0,0,0,0.16)', 0.4);
    else for (let a = Math.ceil((v0 + 0.5) / step) * step; a < v1 - 0.5; a += step) stroke(g, [P(u1, a, 2.2), P(u1, a, H)], 'rgba(0,0,0,0.16)', 0.4);
  }
}

/** Tor (1 × 1): zwei Pfeiler mit Kappen in Teamfarbe, Schiebetor aus Stahl, rot-weiße Schranke; along = 'u' oder 'v'. */
function gate(g, T, along) {
  const H = 23;
  const U = along === 'u';
  const bx = (a0, a1, c0, c1, h0, h1, col, top) => (U ? box(g, a0, a1, c0, c1, h0, h1, col, top) : box(g, c0, c1, a0, a1, h0, h1, col, top));
  bx(-16, -11, -3.6, 3.6, 0, H, CONC, snowy(tint(CONC, 0.12)));
  bx(-16.4, -10.6, -4, 4, H, H + 1.6, T, snowy(T));
  // Torflügel: Rahmen und Stäbe
  const { P } = g;
  const Q = U ? (a, c, h) => P(a, c, h) : (a, c, h) => P(c, a, h);
  const c = 0;
  for (const h of [2, 15.5]) stroke(g, [Q(-11, c, h), Q(11, c, h)], '#4a4f55', 1.1);
  for (let a = -10; a <= 10.1; a += 2.5) stroke(g, [Q(a, c, 1), Q(a, c, 16)], '#5a6066', 0.6);
  stroke(g, [Q(-11, c, 8.5), Q(11, c, 8.5)], T, 1.2);
  bx(-11, 11, 4.5, 5.2, 8, 8.8, RED);
  if (g.fine) for (let a = -8; a < 11; a += 6) bx(a, a + 3, 4.45, 5.25, 7.95, 8.85, '#f0ede4');
  bx(11, 16, -3.6, 3.6, 0, H, CONC, snowy(tint(CONC, 0.12)));
  bx(10.6, 16.4, -4, 4, H, H + 1.6, T, snowy(T));
}

// Tor aus zwei Hälften (2 Felder breit): jede Hälfte malt ihren äußeren Betonpfeiler, einen schweren Stahlflügel und ihr Stück des
// Querträgers; die Mitte des Tors bildet ein Riegelbalken, den beide Hälften je zur Hälfte malen.
const STEEL = '#3f4852';
const STEEL_HI = '#6c7883';
const STEEL_DK = '#2b3138';
const WARN = '#e3b422';
const PIL_H = 31; // Betonpfeiler (höher als die Mauer)
const LEAF_TOP = 24; // Oberkante des Flügels
const LEAF_A0 = -8.6; // Flügel und Träger beginnen am Pfeiler (a = −16 … −8,6) und reichen bis zur Torfuge (a = 16)

/** Tor-Hälfte (1 × 1) mit Partner: along = 'u'/'v' (Richtung des Paars), sgn = +1, wenn die andere Hälfte bei +u bzw. +v liegt. */
function gateLeaf(g, T, along, sgn) {
  const U = along === 'u';
  const A = (a) => sgn * a;
  const { P, ctx } = g;
  const bx = (a0, a1, c0, c1, h0, h1, col, top) => {
    const x0 = Math.min(A(a0), A(a1));
    const x1 = Math.max(A(a0), A(a1));
    if (U) box(g, x0, x1, c0, c1, h0, h1, col, top);
    else box(g, c0, c1, x0, x1, h0, h1, col, top);
  };
  const Q = U ? (a, c, h) => P(A(a), c, h) : (a, c, h) => P(c, A(a), h);
  const pq = (pts, fill) => poly(g, pts.map(([a, c, h]) => Q(a, c, h)), fill, null);
  const pillar = () => {
    bx(-16.6, -7.8, -4.8, 4.8, 0, 2, shade(CONC, 0.1), snowy(shade(CONC, 0.04)));
    bx(-16, -8.4, -4.2, 4.2, 2, PIL_H, CONC, snowy(tint(CONC, 0.12)));
    const x0 = Math.min(A(-16), A(-8.4));
    const x1 = Math.max(A(-16), A(-8.4));
    if (U) wallBand(g, x0, x1, -4.2, 4.2, PIL_H - 8, PIL_H - 6.2, T);
    else wallBand(g, -4.2, 4.2, x0, x1, PIL_H - 8, PIL_H - 6.2, T);
    if (g.fine) for (const h of [9, 17, 25]) stroke(g, [Q(-16, 4.2, h), Q(-8.4, 4.2, h)], 'rgba(0,0,0,0.16)', 0.4);
    bx(-16.6, -7.8, -4.8, 4.8, PIL_H, PIL_H + 1.8, T, snowy(T));
    bx(-13.6, -10.8, -1.4, 1.4, PIL_H + 1.8, PIL_H + 4.4, '#e69a1e', '#ffd36a'); // Warnleuchte
  };
  const lo = Math.min(A(-16), A(16));
  const hi = Math.max(A(-16), A(16));
  if (U) flat(g, lo, hi, -4, 4 + 6.8, 'rgba(0,0,0,0.16)');
  else flat(g, -4, 4 + 6.8, lo, hi, 'rgba(0,0,0,0.16)');
  if (sgn > 0) pillar();
  // Stahlflügel: dicker Körper, Rahmen, zwei Felder mit Kreuzverstrebung, Warnstreifen unten, Nieten
  bx(LEAF_A0, 16, -1.4, 1.4, 1.2, LEAF_TOP, STEEL, snowy(STEEL_HI));
  const f = 1.4; // Vorderseite (c = +f)
  const a0 = LEAF_A0 + 0.6;
  const a1 = 15.2;
  pq([[a0, f, 5.6], [a1, f, 5.6], [a1, f, 1.6], [a0, f, 1.6]], '#1c1e22');
  for (let a = a0; a + 4.2 <= a1 + 0.01; a += 4.2) pq([[a, f, 1.6], [a + 2.1, f, 1.6], [a + 4.2, f, 5.6], [a + 2.1, f, 5.6]], WARN);
  const hm = 14.4;
  for (const [h0, h1] of [[6.4, hm - 0.7], [hm + 0.7, LEAF_TOP - 1.2]]) {
    pq([[a0, f + 0.05, h0], [a1, f + 0.05, h0], [a1, f + 0.05, h1], [a0, f + 0.05, h1]], 'rgba(20,26,32,0.38)');
    stroke(g, [Q(a0, f, h0), Q(a1, f, h0), Q(a1, f, h1), Q(a0, f, h1), Q(a0, f, h0)], STEEL_HI, 0.8);
    stroke(g, [Q(a0, f, h0), Q(a1, f, h1)], '#59646f', 0.9);
    stroke(g, [Q(a0, f, h1), Q(a1, f, h0)], '#59646f', 0.9);
    stroke(g, [Q(a0, f, h0), Q(a1, f, h1)], 'rgba(255,255,255,0.12)', 0.3);
  }
  stroke(g, [Q(LEAF_A0, f, hm), Q(16, f, hm)], STEEL_HI, 1);
  stroke(g, [Q(LEAF_A0 + 0.2, f, 1.4), Q(LEAF_A0 + 0.2, f, LEAF_TOP)], STEEL_HI, 1.1);
  if (g.fine) {
    const rv = g.z * 0.42;
    for (const h of [6.4 - 0.9, hm - 0.7 - 0.9, hm + 0.7 + 0.9, LEAF_TOP - 0.55]) {
      for (let a = a0 + 1.2; a < a1; a += 3.4) {
        const [x, y] = Q(a, f, h);
        circle(ctx, x, y, rv, '#8d98a2');
      }
    }
  }
  // Torlauf: Laufrolle unten an der Fuge
  bx(14.4, 16, -1.8, 1.8, 0, 2.6, STEEL_DK);
  // Riegelbalken in der Mitte (halbe Breite je Hälfte)
  bx(14.8, 16, -1.9, 1.9, 2.6, LEAF_TOP, STEEL_DK, STEEL);
  // Querträger über dem Tor: Stahlkasten mit Warnband
  bx(LEAF_A0, 16, -2.7, 2.7, LEAF_TOP, LEAF_TOP + 4.4, STEEL_DK, snowy(STEEL));
  const c2 = 2.7;
  pq([[LEAF_A0, c2, LEAF_TOP + 1.1], [16, c2, LEAF_TOP + 1.1], [16, c2, LEAF_TOP + 3.3], [LEAF_A0, c2, LEAF_TOP + 3.3]], '#1c1e22');
  for (let a = LEAF_A0 + 0.4; a + 3.2 <= 16.01; a += 3.2) pq([[a, c2, LEAF_TOP + 1.1], [a + 1.6, c2, LEAF_TOP + 1.1], [a + 3.2, c2, LEAF_TOP + 3.3], [a + 1.6, c2, LEAF_TOP + 3.3]], WARN);
  if (sgn < 0) pillar();
}

/** Baustelle: aufgewühlter Boden, Bauzaun, wachsender Rohbau mit Gerüst, Baustoffe; p = Fortschritt 0 … 1 (gestuft). */
function site(g, T, type, w, p) {
  const e = w * 16 - 2;
  flat(g, -e, e, -e, e, '#8f846f');
  const H = Math.max(2, (SITE_H[type] ?? 30) * p);
  const c = w === 1 ? 7 : e * 0.62;
  const { P } = g;
  fence(g, -e + 1, e - 1, -e + 1, e - 1, 'back', w === 1 ? 3 : 4.5);
  // Rohbau mit Bewehrung oben
  box(g, -c, c, -c, c, 0, H, '#a6a69e', snowy('#b4b4ac'));
  if (g.fine) for (let a = -c + 2; a < c; a += 3) stroke(g, [P(a, c, H), P(a, c, H + 2.6)], '#7a5a40', 0.35);
  // Gerüst um den Rohbau
  if (w > 1) {
    const o = c + 2.2;
    for (let a = -o; a <= o + 0.1; a += (2 * o) / Math.max(2, Math.round(o / 5))) {
      for (const [u, v] of [[a, o], [o, a]]) stroke(g, [P(u, v, 0), P(u, v, H + 3)], '#9aa0a6', 0.55);
    }
    for (let h = 5; h < H + 2; h += 6) {
      stroke(g, [P(-o, o, h), P(o, o, h), P(o, -o, h)], '#9aa0a6', 0.45);
      box(g, -o, o, o - 1.2, o, h - 0.4, h, '#b98d4f');
      box(g, o - 1.2, o, -o, o, h - 0.4, h, '#b98d4f');
    }
  }
  // Baustoffe: Palette mit Säcken, Steine, bei der FOB ein Kran
  if (w > 1) {
    box(g, -e + 3, -e + 9, e - 9, e - 3, 0, 0.7, '#9c7a52');
    box(g, -e + 3.3, -e + 8.7, e - 8.7, e - 3.3, 0.7, 3.2, '#d8d2c0', snowy('#e2dccb'));
    box(g, e - 9, e - 3, -e + 3, -e + 8, 0, 2.8, '#9d9e98');
  }
  if (w >= 3) {
    mast(g, -e + 5, -e + 5, 0, 52, 1.8, 1.8, '#d9b13a', false);
    stroke(g, [P(-e + 5, -e + 5, 52), P(e - 10, -e + 5, 52)], '#d9b13a', 1.1);
    stroke(g, [P(-e + 5, -e + 5, 52), P(-e - 4, -e + 5, 52)], '#d9b13a', 1.1);
    box(g, -e - 5, -e - 1, -e + 3.5, -e + 6.5, 49.5, 52, '#7d8287');
    stroke(g, [P(e - 14, -e + 5, 52), P(e - 14, -e + 5, Math.max(H + 4, 14))], '#3a3d38', 0.4);
  }
  fence(g, -e + 1, e - 1, -e + 1, e - 1, 'front', w === 1 ? 3 : 4.5);
  if (w > 1) {
    // Bauzaun-Planen in Teamfarbe
    stroke(g, [P(-e + 4, e - 1, 2.4), P(e - 4, e - 1, 2.4)], T, 1.4);
    stroke(g, [P(e - 1, e - 4, 2.4), P(e - 1, -e + 4, 2.4)], T, 1.4);
  }
}

/** Höhe des fertigen Rohbaus je Typ auf der Baustelle (Weltpixel). */
const SITE_H = { fob: 14, wall: 20, gate: 20, mortar: 6, aa: 8, phalanx: 10, tower: 50, radio: 10, drill: 12 };

// ---------- 2D von oben ----------
// x = u, y = v; Licht von links oben, Schatten nach rechts unten (wie isokit.js).

function padTop(c, e, color, team) {
  rectF(c, -e, -e, e, e, color);
  c.strokeStyle = team;
  c.lineWidth = 1.1;
  c.strokeRect(-e + 1.4, -e + 1.4, 2 * e - 2.8, 2 * e - 2.8);
}

function hescoTop(c, x0, y0, x1, y1, h = 7) {
  shadowTop(c, x0, y0, x1, y1, h);
  rectS(c, x0, y0, x1, y1, FILL, 'rgba(60,50,35,0.55)', 0.4);
  c.strokeStyle = 'rgba(60,50,35,0.45)';
  c.lineWidth = 0.35;
  c.beginPath();
  if (x1 - x0 >= y1 - y0) for (let a = x0 + 5; a < x1; a += 5) {
    c.moveTo(a, y0);
    c.lineTo(a, y1);
  }
  else for (let a = y0 + 5; a < y1; a += 5) {
    c.moveTo(x0, a);
    c.lineTo(x1, a);
  }
  c.stroke();
}

/** Sandsackring von oben. */
function bagRingTop(c, x, y, ri, ro, gap = null) {
  const a0 = gap ? gap[1] : 0;
  const a1 = gap ? gap[0] + TAU : TAU;
  c.save();
  c.lineCap = 'butt';
  c.strokeStyle = 'rgba(0,0,0,0.22)';
  c.lineWidth = ro - ri;
  c.beginPath();
  c.arc(x + 1.4, y + 1.4, (ri + ro) / 2, a0, a1);
  c.stroke();
  c.strokeStyle = SAND;
  c.beginPath();
  c.arc(x, y, (ri + ro) / 2, a0, a1);
  c.stroke();
  c.strokeStyle = 'rgba(90,75,45,0.45)';
  c.lineWidth = 0.35;
  for (let t = a0; t < a1; t += 0.28) {
    c.beginPath();
    c.moveTo(x + ri * Math.cos(t), y + ri * Math.sin(t));
    c.lineTo(x + ro * Math.cos(t), y + ro * Math.sin(t));
    c.stroke();
  }
  c.restore();
}

/** Rohr von oben (Linie mit heller Kante). */
function tubeTop(c, a, b, w, col = GUN) {
  lineT(c, [[a[0] + 1, a[1] + 1], [b[0] + 2.5, b[1] + 2.5]], 'rgba(0,0,0,0.22)', w);
  lineT(c, [a, b], col, w);
  lineT(c, [[a[0] - w * 0.2, a[1] - w * 0.2], [b[0] - w * 0.2, b[1] - w * 0.2]], tint(col, 0.35), w * 0.3);
}

function flagTop(c, x, y, color) {
  lineT(c, [[x, y], [x + 3.4, y + 3.4]], 'rgba(0,0,0,0.25)', 0.5);
  rectS(c, x + 0.3, y - 0.7, x + 4.8, y + 1.3, color, 'rgba(0,0,0,0.35)', 0.25);
  circle(c, x, y, 0.65, '#e9e9e9');
}

function cratesTop(c, x, y, n, seed = 0) {
  for (let k = 0; k < n; k++) {
    const a = x + (k % 2) * 4.6;
    const b = y + Math.floor(k / 2) * 3.4;
    const h = 2.4 * (1 + Math.floor(rnd(seed + k * 7) * 2));
    shadowTop(c, a - 2.1, b - 1.5, a + 2.1, b + 1.5, h);
    rectS(c, a - 2.1, b - 1.5, a + 2.1, b + 1.5, h > 3 ? '#6d794f' : '#5f6b43', 'rgba(0,0,0,0.4)', 0.3);
  }
}

function drumsTop(c, x, y, n) {
  for (let k = 0; k < n; k++) {
    const a = x + (k % 3) * 2.6;
    const b = y + Math.floor(k / 3) * 2.6;
    circle(c, a + 0.6, b + 0.6, 1.15, 'rgba(0,0,0,0.25)');
    circle(c, a, b, 1.15, '#56653f');
    circle(c, a - 0.3, b - 0.3, 0.35, '#8a9a70');
  }
}

function truckTop(c, x, y, along, team) {
  const U = along === 'u';
  const R = (a0, a1, b0, b1, fill) => (U ? rectS(c, x + a0, y + b0, x + a1, y + b1, fill, 'rgba(0,0,0,0.4)', 0.3) : rectS(c, x + b0, y + a0, x + b1, y + a1, fill, 'rgba(0,0,0,0.4)', 0.3));
  if (U) rectF(c, x - 6.5, y - 1.5, x + 8.5, y + 3.5, 'rgba(0,0,0,0.25)');
  else rectF(c, x - 1.5, y - 6.5, x + 3.5, y + 8.5, 'rgba(0,0,0,0.25)');
  R(-7.5, 2.8, -2.5, 2.5, '#5c6740');
  R(-3, -0.6, -1.2, 1.2, team);
  R(3.2, 7.5, -2.5, 2.5, OLIVE);
  R(6.5, 7.5, -2, 2, '#2c3a47');
}

function generatorTop(c, x0, y0, x1, y1) {
  shadowTop(c, x0, y0, x1, y1, 5);
  rectS(c, x0, y0, x1, y1, OLIVE, 'rgba(0,0,0,0.4)', 0.3);
  circle(c, x0 + 1.2, y0 + 1.2, 0.6, '#2c2e2b');
}

function fobTop(c, T) {
  rectF(c, -46, -46, 46, 46, GRAVEL);
  rectF(c, 6, 14, 20, 46, '#968f7f');
  rectF(c, -20, 4, 46, 18, '#968f7f');
  // Radarmast und Container
  shadowTop(c, 16, -38, 26, -31, 7);
  flatTop(c, 16, -38, 26, -31, '#c9cbc3', '#d6d8d0');
  latticeTop(c, 32, -32, 3, 40, '#9aa0a5');
  dishTop(c, 32, -32, 3.4);
  // Gefechtsstand
  shadowTop(c, -38, -38, -8, -16, 12);
  flatTop(c, -38, -38, -8, -16, '#b9b5a2', shade(T, 0.12));
  acTop(c, -32, -30, 2.4);
  acTop(c, -25, -30, 2.4);
  dishTop(c, -14, -33, 2.4);
  // Zelt, Generator, Nachschub
  shadowTop(c, -38, -8, -12, 2, 8);
  vaultTop(c, -38, -8, -12, 2, 'u', CANVAS, false);
  generatorTop(c, -8, -8, -2, -3);
  cratesTop(c, -38, 12, 6, 5);
  cratesTop(c, -26, 12, 4, 11);
  drumsTop(c, -36, 26, 6);
  truckTop(c, 30, -10, 'v', T);
  carTop(c, 33, 12, 'v', OLIVE);
  flagTop(c, 2, 34, T);
  circle(c, 22, 22, 0.8, '#4a4f55');
  shadowTop(c, 22, 34, 27, 39, 6);
  rectS(c, 22, 34, 27, 39, '#5a5e60', 'rgba(0,0,0,0.45)', 0.35);
  c.save();
  c.setLineDash([1.6, 1.6]);
  lineT(c, [[6, 41.5], [20, 41.5]], RED, 0.8);
  c.lineDashOffset = 1.6;
  lineT(c, [[6, 41.5], [20, 41.5]], '#f0ede4', 0.8);
  c.restore();
  hescoTop(c, -46, -46, 46, -42);
  hescoTop(c, -46, -42, -42, 46);
  hescoTop(c, -42, 42, 6, 46);
  hescoTop(c, 20, 42, 46, 46);
  hescoTop(c, 42, -42, 46, 42);
}

function mortarTop(c, T) {
  padTop(c, 30, DIRT, T);
  circle(c, 0, 0, 15.5, '#7c7562');
  bagRingTop(c, 0, 0, 15, 20.5, [0.35, 1.25]);
  cratesTop(c, -10, 3, 3, 2);
  circle(c, 1, 3, 3.4, '#3d403b');
  tubeTop(c, [1, 3], [9.5, -9.5], 2.4);
  flagTop(c, -13, -13, T);
  cratesTop(c, 19, 18, 2, 7);
}

function aaTop(c, T) {
  padTop(c, 30, DIRT, T);
  circle(c, 0, 0, 19, '#aaa79b');
  bagRingTop(c, 0, 0, 19, 23.5, [0.4, 1.2]);
  circle(c, 1, 1, 9, 'rgba(0,0,0,0.2)');
  circle(c, 0, 0, 9, '#5d6158');
  rectS(c, -6, -5, -3.5, 5, T, 'rgba(0,0,0,0.4)', 0.3);
  rectS(c, -3.5, -4, 4.5, 4, OLIVE, 'rgba(0,0,0,0.4)', 0.3);
  for (const s of [-1, 1]) tubeTop(c, [0.5 + s * 1.13, -0.5 + s * 1.13], [0.5 + s * 1.13 + 9, -0.5 + s * 1.13 - 9], 1.5);
  shadowTop(c, 12, 12, 22, 18, 6);
  rectS(c, 12, 12, 22, 18, '#6b7350', 'rgba(0,0,0,0.4)', 0.3);
  dishTop(c, 17, 15, 3);
  cratesTop(c, -20, 14, 3, 9);
  flagTop(c, -16, -16, T);
}

function phalanxTop(c, T) {
  padTop(c, 30, PAD, T);
  c.strokeStyle = '#d8b630';
  c.lineWidth = 1;
  c.strokeRect(-11, -11, 22, 22);
  shadowTop(c, -8, -8, 8, 8, 20);
  rectS(c, -8, -8, 8, 8, '#9ea4a0', T, 1.2);
  circle(c, 0, 0, 6.2, '#d2d5d0');
  tubeTop(c, [2.4, -1.6], [13.5, -11], 3);
  ball(c, -0.6, -0.6, 4.4, '#eef0ec');
  shadowTop(c, 12, 10, 26, 20, 8);
  flatTop(c, 12, 10, 26, 20, '#c8cbc4', '#d2d5ce');
  rectF(c, 12, 19.2, 26, 20, T);
  acTop(c, 22, 13, 2.2);
  generatorTop(c, -25, 14, -15, 21);
  circle(c, -22, -22, 0.8, '#4a4f55');
}

function towerTop(c, T, roof) {
  padTop(c, 30, DIRT, T);
  shadowTop(c, -21, -21, 21, 21, 60);
  rectS(c, -12, 21, 0, 24, SAND, 'rgba(90,75,45,0.5)', 0.3);
  flatTop(c, -21, -21, 21, 21, '#9c9d95', '#8a8b83');
  c.strokeStyle = T;
  c.lineWidth = 1.2;
  c.strokeRect(-20.4, -20.4, 40.8, 40.8);
  rectS(c, -16, 9, -11, 14, '#6f716b', 'rgba(0,0,0,0.45)', 0.35); // Dachluke
  if (roof === 'mortar') {
    bagRingTop(c, 0, 0, 5, 8.5);
    tubeTop(c, [0, 1], [7, -7.5], 2.2);
  } else if (roof === 'flak') {
    circle(c, 0, 0, 5.5, '#5d6158');
    rectS(c, -3, -3, 3, 3, OLIVE, 'rgba(0,0,0,0.4)', 0.3);
    for (const s of [-1, 1]) tubeTop(c, [0.4 + s * 0.85, -0.4 + s * 0.85], [0.4 + s * 0.85 + 6.3, -0.4 + s * 0.85 - 6.3], 1.2);
  } else if (roof === 'sam') {
    circle(c, 0, 0, 5, '#5d6158');
    c.save();
    c.translate(1.2, -1.2);
    c.rotate(-Math.PI / 4);
    rectS(c, -2, -3.6, 9, 3.6, '#d9dcd4', 'rgba(0,0,0,0.45)', 0.35);
    for (const s of [-1.6, 1.6]) circle(c, 8.4, s, 0.9, RED);
    c.restore();
  } else {
    circle(c, -15, -15, 0.6, '#55595d');
    rectS(c, 12, -16, 16, -12, '#5d6158', 'rgba(0,0,0,0.4)', 0.3);
  }
  flagTop(c, 16, 16, T);
}

function radioTop(c, T) {
  rectF(c, -30, -30, 30, 30, GRAVEL);
  c.strokeStyle = T;
  c.lineWidth = 1.1;
  c.strokeRect(-28.6, -28.6, 57.2, 57.2);
  c.save();
  c.setLineDash([1.6, 0.9]);
  c.strokeStyle = 'rgba(55,60,66,0.75)';
  c.lineWidth = 0.45;
  c.strokeRect(-27, -27, 54, 54);
  c.restore();
  shadowTop(c, -25, 8, -9, 22, 8);
  flatTop(c, -25, 8, -9, 22, '#cfd0c8', '#d9dad2');
  rectF(c, -25, 21.2, -9, 22, T);
  acTop(c, -13, 15, 2.2);
  generatorTop(c, 12, 14, 21, 21);
  rectS(c, -9, -9, 9, 9, CONC, 'rgba(0,0,0,0.35)', 0.4);
  // Mast von oben: langer schmaler Schatten, Seile, vier Beine laufen rot-weiß zur Spitze zusammen, Schüsseln in Teamfarbe
  polyF(c, [[-5, 5], [5, -5], [44.5, 43.5], [43.5, 44.5]], 'rgba(0,0,0,0.2)');
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lineT(c, [[su * 4, sv * 4], [su * 26, sv * 26]], 'rgba(225,228,220,0.75)', 0.35);
  c.strokeStyle = 'rgba(60,60,60,0.45)';
  c.lineWidth = 0.35;
  for (let k = 1; k < 7; k += 2) {
    const r = 7.5 - (6.1 * k) / 7;
    c.strokeRect(-r, -r, 2 * r, 2 * r);
  }
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let k = 0; k < 7; k++) {
      const r0 = 7.5 - (6.1 * k) / 7;
      const r1 = 7.5 - (6.1 * (k + 1)) / 7;
      lineT(c, [[su * r0, sv * r0], [su * r1, sv * r1]], k % 2 ? '#f2f0ea' : RED, 0.9);
    }
  }
  for (const [x, y] of [[6.4, 0], [0, 6.4]]) {
    circle(c, x + 0.8, y + 0.8, 2.4, 'rgba(0,0,0,0.25)');
    circle(c, x, y, 2.4, '#e8e9e4');
    circle(c, x, y, 1.7, T);
  }
  rectS(c, -1.4, -1.4, 1.4, 1.4, RED, 'rgba(0,0,0,0.4)', 0.3);
  circle(c, 0, 0, 0.8, '#ff4a3a');
}

function drillTop(c, T) {
  padTop(c, 30, '#9b9178', T);
  shadowTop(c, 10, -28, 28, -14, 7);
  rectS(c, 10, -28, 28, -14, '#8d9a9f', 'rgba(0,0,0,0.4)', 0.35);
  c.strokeStyle = '#d8b630';
  c.lineWidth = 0.45;
  c.strokeRect(10.5, -27.5, 17, 13);
  generatorTop(c, -28, -28, -18, -20);
  for (let k = 0; k < 3; k++) for (let j = 0; j < 4 - k; j++) {
    const y = 16 + j * 2 + k;
    lineT(c, [[-28, y], [-6, y]], '#7d6b5a', 1.5);
    lineT(c, [[-28, y - 0.4], [-6, y - 0.4]], 'rgba(255,255,255,0.18)', 0.4);
  }
  rectS(c, -11, 18, -4, 22, '#8a8f94', 'rgba(0,0,0,0.35)', 0.3);
  shadowTop(c, -11, -11, 11, 11, 66);
  rectS(c, -11, -11, 11, 11, '#7d8287', 'rgba(0,0,0,0.45)', 0.4);
  // Bohrturm von oben: Gitterkegel
  c.strokeStyle = '#d9b13a';
  c.lineWidth = 0.9;
  c.strokeRect(-9, -9, 18, 18);
  c.lineWidth = 0.5;
  c.strokeRect(-5.5, -5.5, 11, 11);
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lineT(c, [[su * 9, sv * 9], [su * 2, sv * 2]], '#d9b13a', 0.7);
  rectS(c, -3, -3, 3, 3, '#9aa0a4', 'rgba(0,0,0,0.4)', 0.3);
  rectS(c, 3, 3, 10.5, 10.5, T, 'rgba(0,0,0,0.45)', 0.35);
  flagTop(c, 24, 22, T);
}

/** Mauer von oben: dieselben Teile wie isometrisch, Teamstreifen auf der Krone. */
function wallTop(c, T, m) {
  const parts = wallParts(m);
  for (const [x0, x1, y0, y1] of parts) shadowTop(c, x0, y0, x1, y1, WALL_H);
  for (const [x0, x1, y0, y1, post] of parts) {
    const alongU = x1 - x0 > y1 - y0;
    const fu = post ? 0.8 : alongU ? 0 : 1.4;
    const fv = post ? 0.8 : alongU ? 1.4 : 0;
    rectF(c, x0 - fu, y0 - fv, x1 + fu, y1 + fv, shade(CONC, 0.18));
  }
  for (const [x0, x1, y0, y1, post] of parts) rectS(c, x0, y0, x1, y1, post ? tint(CONC, 0.18) : tint(CONC, 0.1), 'rgba(0,0,0,0.3)', 0.3);
  for (const [x0, x1, y0, y1, post] of parts) {
    if (post) continue;
    if (x1 - x0 > y1 - y0) rectF(c, x0, -0.5, x1, 0.5, T);
    else rectF(c, -0.5, y0, 0.5, y1, T);
  }
  if (parts.some((q) => q[4])) rectS(c, -1.6, -1.6, 1.6, 1.6, T, 'rgba(0,0,0,0.35)', 0.3); // Kappe des Pfeilers
}

function gateTop(c, T, along) {
  const R = along === 'u' ? (x0, y0, x1, y1, f, l, w) => rectS(c, x0, y0, x1, y1, f, l, w) : (x0, y0, x1, y1, f, l, w) => rectS(c, y0, x0, y1, x1, f, l, w);
  const L = along === 'u' ? (pts, col, w) => lineT(c, pts, col, w) : (pts, col, w) => lineT(c, pts.map(([a, b]) => [b, a]), col, w);
  for (const a of [-16, 11]) {
    if (along === 'u') shadowTop(c, a, -3.6, a + 5, 3.6, 23);
    else shadowTop(c, -3.6, a, 3.6, a + 5, 23);
  }
  R(-16.4, -4, -10.6, 4, T, 'rgba(0,0,0,0.45)', 0.4);
  R(10.6, -4, 16.4, 4, T, 'rgba(0,0,0,0.45)', 0.4);
  L([[-11, 0], [11, 0]], '#4a4f55', 1.6);
  L([[-11, 0], [11, 0]], T, 0.6);
  c.save();
  c.setLineDash([3, 3]);
  L([[-11, 4.9], [11, 4.9]], RED, 0.8);
  c.lineDashOffset = 3;
  L([[-11, 4.9], [11, 4.9]], '#f0ede4', 0.8);
  c.restore();
}

/** Tor-Hälfte von oben (siehe gateLeaf): Pfeiler mit Kappe, Stahlflügel in einem Rahmen aus zwei Trägern mit Verstrebung und Warnmitte. */
function gateLeafTop(c, T, along, sgn) {
  const U = along === 'u';
  const A = (a) => sgn * a;
  const rect = (a0, c0, a1, c1, fill, line, w) => {
    const x0 = Math.min(A(a0), A(a1));
    const x1 = Math.max(A(a0), A(a1));
    if (U) rectS(c, x0, c0, x1, c1, fill, line, w);
    else rectS(c, c0, x0, c1, x1, fill, line, w);
  };
  const L = (pts, col, w) => lineT(c, pts.map(([a, k]) => (U ? [A(a), k] : [k, A(a)])), col, w);
  const sh = (a0, c0, a1, c1, h) => {
    const x0 = Math.min(A(a0), A(a1));
    const x1 = Math.max(A(a0), A(a1));
    if (U) shadowTop(c, x0, c0, x1, c1, h);
    else shadowTop(c, c0, x0, c1, x1, h);
  };
  sh(-16, -4.2, -8.4, 4.2, PIL_H);
  sh(LEAF_A0, -2.7, 16, 2.7, LEAF_TOP);
  rect(LEAF_A0, -2.7, 16, 2.7, STEEL, 'rgba(0,0,0,0.5)', 0.4);
  rect(LEAF_A0 + 0.6, -1.5, 15.4, 1.5, '#4d5762', 'rgba(0,0,0,0.35)', 0.3);
  for (let a = LEAF_A0 + 0.6; a < 15.4; a += 4) L([[a, -2.7], [a, 2.7]], STEEL_DK, 0.7); // Querstreben
  L([[LEAF_A0 + 0.6, -1.5], [15.4, 1.5]], '#6c7883', 0.5);
  L([[LEAF_A0 + 0.6, 1.5], [15.4, -1.5]], '#6c7883', 0.5);
  c.save();
  c.setLineDash([1.6, 1.6]);
  L([[LEAF_A0 + 0.6, 0], [16, 0]], WARN, 0.9);
  c.restore();
  rect(14.8, -2.7, 16, 2.7, STEEL_DK, 'rgba(0,0,0,0.5)', 0.3);
  rect(-16.4, -4.6, -8, 4.6, tint(CONC, 0.12), 'rgba(0,0,0,0.4)', 0.4);
  rect(-14.4, -2.8, -10, 2.8, T, 'rgba(0,0,0,0.45)', 0.35);
  rect(-13, -1.2, -11.4, 1.2, '#e69a1e', 'rgba(0,0,0,0.3)', 0.2);
}

function siteTop(c, T, type, w, p) {
  const e = w * 16 - 2;
  rectF(c, -e, -e, e, e, '#8f846f');
  const H = Math.max(2, (SITE_H[type] ?? 30) * p);
  const k = w === 1 ? 7 : e * 0.62;
  shadowTop(c, -k, -k, k, k, H);
  rectS(c, -k, -k, k, k, '#b4b4ac', 'rgba(0,0,0,0.4)', 0.4);
  c.strokeStyle = '#7a5a40';
  c.lineWidth = 0.3;
  c.beginPath();
  for (let a = -k + 2; a < k; a += 3) {
    c.moveTo(a, -k);
    c.lineTo(a, k);
    c.moveTo(-k, a);
    c.lineTo(k, a);
  }
  c.stroke();
  if (w > 1) {
    const o = k + 2.2;
    c.strokeStyle = '#b98d4f';
    c.lineWidth = 1.2;
    c.strokeRect(-o, -o, 2 * o, 2 * o);
    rectS(c, -e + 3, e - 9, -e + 9, e - 3, '#d8d2c0', 'rgba(0,0,0,0.35)', 0.3);
    rectS(c, e - 9, -e + 3, e - 3, -e + 8, '#9d9e98', 'rgba(0,0,0,0.35)', 0.3);
  }
  c.save();
  c.setLineDash([1.6, 0.9]);
  c.strokeStyle = 'rgba(214,120,40,0.85)';
  c.lineWidth = 0.6;
  c.strokeRect(-e + 1, -e + 1, 2 * e - 2, 2 * e - 2);
  c.restore();
  if (w > 1) {
    lineT(c, [[-e + 4, e - 1], [e - 4, e - 1]], T, 1.2);
    lineT(c, [[e - 1, e - 4], [e - 1, -e + 4]], T, 1.2);
  }
}

// ---------- Schnittstelle ----------

const ROT = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]]; // wie camera.js
let walls = new Set(); // "cx,cy" aller Mauern und Tore, vom Renderer je Bild gesetzt
let leafGates = new Set(); // "cx,cy" der Torhälften (leaf gesetzt), für die Frage, ob die andere Hälfte steht

/** Mauern und Tore merken (je Bild, für die Verbindungen zu den Nachbarn). */
export function setMilWalls(list) {
  walls = new Set();
  leafGates = new Set();
  for (const b of list) {
    if (!b.alive || (b.type !== 'wall' && b.type !== 'gate')) continue;
    walls.add(`${b.cx},${b.cy}`);
    if (b.type === 'gate' && b.leaf !== undefined && b.built) leafGates.add(`${b.cx},${b.cy}`);
  }
}

/** Nachbarn in örtlicher Richtung (nach Drehung der Ansicht): 1 = +u, 2 = +v, 4 = −u, 8 = −v. */
function wallMask(b, rot) {
  const [ra, rb, rc, rd] = ROT[rot] ?? ROT[0];
  let m = 0;
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    if (!walls.has(`${b.cx + dx},${b.cy + dy}`)) continue;
    const lu = ra * dx + rb * dy;
    const lv = rc * dx + rd * dy;
    m |= lu > 0 ? 1 : lv > 0 ? 2 : lu < 0 ? 4 : 8;
  }
  return m;
}

const siteStep = (b) => Math.max(0, Math.min(8, Math.floor((b.progress || 0) * 8)));
/** Was das Bild bestimmt: Variante je Typ (Mauer: Nachbarn, Tor: Richtung, Turm: Dachaufbau, Baustelle: Stufe). */
function variant(b, rot) {
  if (!b.built) return `s${siteStep(b)}`;
  if (b.type === 'wall') return wallMask(b, rot);
  if (b.type === 'gate' && b.leaf !== undefined) {
    // Torhälfte: Partner in örtlicher Richtung (nach Drehung der Ansicht); fehlt er, wird sie wie ein altes Einzeltor gemalt
    const k = b.leaf === 0 ? 1 : -1;
    const dx = b.axis === 'y' ? 0 : k;
    const dy = b.axis === 'y' ? k : 0;
    if (leafGates.has(`${b.cx + dx},${b.cy + dy}`)) {
      const [ra, rb, rc, rd] = ROT[rot] ?? ROT[0];
      const lu = ra * dx + rb * dy;
      const lv = rc * dx + rd * dy;
      return lu ? `L${lu > 0 ? 'u+' : 'u-'}` : `L${lv > 0 ? 'v+' : 'v-'}`;
    }
  }
  if (b.type === 'gate') {
    const m = wallMask(b, rot);
    return m & 5 || !(m & 10) ? 'u' : 'v';
  }
  if (b.type === 'tower') return b.roof ?? '-';
  return '';
}

/** Höhe des höchsten Punkts im Iso-Bild über der Gebäudemitte (Weltpixel; gemessen, mit Reserve). */
const TALL = { fob: 50, wall: 28, gate: 40, mortar: 22, aa: 30, phalanx: 28, tower: 74, radio: 196, drill: 72 };
const SITE_TALL = (b) => (b.w >= 3 ? 56 : (SITE_H[b.type] ?? 30) + 8);

function paintIsoMil(ctx, s, b, color, v) {
  const g = G(ctx, s);
  if (!b.built) {
    site(g, color, b.type, b.w, (siteStep(b) + 0.5) / 8.5);
    return;
  }
  const T = color;
  switch (b.type) {
    case 'fob': return fob(g, T);
    case 'mortar': return mortar(g, T);
    case 'aa': return aa(g, T);
    case 'phalanx': return phalanx(g, T);
    case 'tower': return tower(g, T, v === '-' ? null : v);
    case 'radio': return radio(g, T);
    case 'drill': return drill(g, T);
    case 'wall': return wall(g, T, v);
    case 'gate': return v[0] === 'L' ? gateLeaf(g, T, v[1], v[2] === '+' ? 1 : -1) : gate(g, T, v);
  }
}

function paintTopMil(ctx, s, b, color, v) {
  ctx.scale(s, s);
  if (!b.built) {
    siteTop(ctx, color, b.type, b.w, (siteStep(b) + 0.5) / 8.5);
    return;
  }
  const T = color;
  switch (b.type) {
    case 'fob': return fobTop(ctx, T);
    case 'mortar': return mortarTop(ctx, T);
    case 'aa': return aaTop(ctx, T);
    case 'phalanx': return phalanxTop(ctx, T);
    case 'tower': return towerTop(ctx, T, v === '-' ? null : v);
    case 'radio': return radioTop(ctx, T);
    case 'drill': return drillTop(ctx, T);
    case 'wall': return wallTop(ctx, T, v);
    case 'gate': return v[0] === 'L' ? gateLeafTop(ctx, T, v[1], v[2] === '+' ? 1 : -1) : gateTop(ctx, T, v);
  }
}

const damaged = (b) => (b.built && b.hp < b.maxHp * 0.5 ? 1 : 0);
const isMil = (b) => MIL_TYPES.has(b.type) && !(b.main && b.type === 'fob');

/** Iso-Bild eines Militärgebäudes (Ankerpunkt = Mitte des Grundrisses). false = nicht zuständig (Hauptstadt, andere Typen). */
export function drawMilIso(ctx, cam, b, color) {
  if (!isMil(b)) return false;
  const v = variant(b, cam.rot);
  const dmg = damaged(b);
  const snow = roofSnowOn() ? 1 : 0;
  const key = `mi|${b.type}|${v}|${color}|${snow}|${dmg}`;
  const half = b.w * 16;
  const tall = b.built ? TALL[b.type] : SITE_TALL(b);
  const bounds = [-half * 1.42 - 6, -tall - 4, half * 1.42 + 6, half * 0.71 + 6];
  const p = cam.worldToScreen(b.x, b.y);
  const z = cam.zoom;
  const dpr = spriteDpr();
  const e = sprite(key, z * dpr, bounds, (c, s) => {
    paintIsoMil(c, s, b, color, v);
    if (dmg) soot(c, s, bounds, b.type.length * 31 + half, true, Math.min(1.2, half / 32));
  });
  if (e === false) return true; // wird im nächsten Bild gemalt
  if (e) blit(ctx, e, p.x, p.y, z);
  else {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1 / dpr, 1 / dpr);
    paintIsoMil(ctx, z * dpr, b, color, v);
    ctx.restore();
  }
  if (b.type === 'radio' && b.built) {
    // Flugwarnlicht oben blinkt (nicht im Bild, damit es blinken kann)
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (Math.floor(now / 600) % 2 === 0) {
      const y = p.y - (3 + MAST_H + 1) * z;
      const grad = ctx.createRadialGradient(p.x, y, 0, p.x, y, 7 * z);
      grad.addColorStop(0, 'rgba(255,90,70,0.95)');
      grad.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - 7 * z, y - 7 * z, 14 * z, 14 * z);
    }
  }
  return true;
}

/** 2D von oben (Kamera-Transformation gesetzt, Weltkoordinaten). false = nicht zuständig. */
export function drawMilTop(ctx, b, color, zoom = 1) {
  if (!isMil(b)) return false;
  const v = variant(b, 0);
  const dmg = damaged(b);
  const key = `mt|${b.type}|${v}|${color}|${dmg}`;
  const half = b.w * 16;
  const bounds = [-half - 4, -half - 4, half + 18, half + 18];
  const e = sprite(key, zoom * spriteDpr(), bounds, (c, s) => {
    paintTopMil(c, s, b, color, v);
    if (dmg) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.translate(1 - bounds[0] * s, 1 - bounds[1] * s);
      soot(c, s, bounds, b.type.length * 17 + half, false, Math.min(1, half / 32));
    }
  });
  if (e) blit(ctx, e, b.x, b.y, 1);
  else if (e === null) {
    ctx.save();
    ctx.translate(b.x, b.y);
    paintTopMil(ctx, 1, b, color, v);
    ctx.restore();
  }
  return true;
}
