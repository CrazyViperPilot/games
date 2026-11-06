// Kartenstadt (seit v5.23, PRD §15): Gebäude der Karte, gemalt wie die Stadtgebäude, in 2D (von oben) und isometrisch.
//   Häuser in der Stadt: Altbau mit Walmdach und Zwerchgiebel, Klinkerhaus mit Balkonen, Fachwerkhaus, Neubau mit Flachdach
//   Gehöft (Haus mit Äckern daneben): Wohnhaus, Scheune und Silo; einzelne Häuser auf dem Land: Fachwerk- oder Klinkerhaus
//   Halle: Lagerhalle aus Wellblech mit Rolltoren, Rampen, Oberlichtern und Büro; Fabrik: Shedhalle, Bürobau, Schornstein, Silos, Hof
//   Mauern ums Fabrikgelände, der stehende Zug (Lok, Containerwagen, Kesselwagen), Bahnhof und Bahnsteig (Karteneditor)
//   Parks: Rasen, Rundweg, Wege, Blumenbeet oder Brunnen, Hecke (Boden); Bänke und Bäume bleiben eigene Körper
// Wie bei den anderen gemalten Bauten wird jede Variante einmal je Maßstab über spritecache.js gemalt und danach nur kopiert.
// Iso: für jede Drehung dasselbe Bild, bei ungerader Drehung mit getauschten Seiten (der Grundriss passt immer). Häuser nehmen das
// nächstkleinere Maß im 8-px-Raster (weniger Bilder), Hallen, Fabriken, Mauern und Zug ihr genaues Maß.
// Örtliche Koordinaten: Weltpixel ab der Mitte des Grundrisses; a = Längsachse, b = Querachse (iso u oder v, siehe frameOf).
// Nur Zeichnen: liest die Gebäude der Karte ({x, y, w, h, kind, part, angle}), die Felder (Gehöft) und die Gleise (Parks).
import { drawTreeTop } from './nature.js';
import { BALANCE } from '../data/balance.js';
import { ISO_K } from './camera.js';
import { sprite, blit, spriteDpr } from './spritecache.js';
import { parkDeco, railList } from './terrain.js';
import {
  acTop, acUnit, archWins, band, box, bush, cap, circle, cyl, disc, door, FACE, flat, frustum, G, gable, gableTop, GLASS, hip,
  hipTop, ledge, lit, OUTLINE, onFace, parapet, plinth, poly, rectF, rectS, ribs, roofSnowOn, shade, shadow, shadowTop, snowy,
  stroke, tint, carTop, LEAF, LEAF_SNOW, vault, vaultTop, wallBand, winsAt, balcony, crate, fan, flatTop, k3, lineT, polyF,
} from './isokit.js';
import { gate, lorry, lorryTop, pipe } from './works.js';
import { drawBenchTop, drawMapCarTop } from './props.js';

const K = ISO_K;
const hashXY = (x, y) => (Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(y) | 0, 19349663)) >>> 0;

// ---------- Farben ----------

const PLASTER = ['#efe6d2', '#e9d3a6', '#e8cbbd', '#d5dde0', '#dfe3c6', '#f3efe6'];
const TILES = ['#a8503a', '#8d4935', '#b9613f'];
const SLATE = '#535c66';
const BRICK = ['#a4553f', '#8e4636', '#b06d50'];
const SHUTTER = ['#4f7a4f', '#3f6f9f', '#9a3b32', '#76604c'];
const TIMBER = '#4d3627';
const FACH_WALL = '#f2ede1';
const NEU_WALL = ['#ebe8e1', '#d8d1c3', '#cdd5d8'];
const NEU_ACC = ['#d0763a', '#4f86b8', '#6d9a4c'];
const BARN = ['#8a4b33', '#7a5a3c', '#6f3f2f'];
const HALL_WALL = ['#c9ccc8', '#d4c8a8', '#a3b2be'];
const HALL_BAND = ['#2f6aa8', '#c0442f', '#2f8a5a', '#d08a24'];
const METAL_ROOF = '#9aa1a6';
const FACT_WALL = ['#a4553f', '#a9adaf', '#c8b994'];
const FACT_ROOF = '#6b7176';
const SKY = '#a9c8d8'; // Oberlicht, Shedverglasung
const CONC = '#b9b5aa';
const YARD = '#9d9b93';
const CONTAINER = ['#2f5f9a', '#c0442f', '#2f8a5a', '#d08a24', '#6d7378', '#8a2f5f'];

// ---------- Rahmen und Hilfen ----------

/** Rahmen entlang der langen Seite: a = Längsachse, b = Querachse; iso ist a = u (long 'u') oder a = v (long 'v'). */
function frameOf(long) {
  const L = long === 'u';
  return {
    L,
    R: (a0, a1, b0, b1) => (L ? [a0, a1, b0, b1] : [b0, b1, a0, a1]),
    at: (a, b) => (L ? [a, b] : [b, a]),
    side: L ? 's' : 'e', // sichtbare Längsseite, Ebene b = b1
    end: L ? 'e' : 's', // sichtbare Stirnseite, Ebene a = a1
    axis: L ? 'u' : 'v',
    cross: L ? 'v' : 'u',
    n: (na, nb, nh) => (L ? [na, nb, nh] : [nb, na, nh]), // Normale (a, b, h) → (u, v, h)
  };
}

/** Teil-Zeichenkontext im Maßstab k ab (cu, cv, ch): Bauteile im Stadtmaßstab (Lkw, Bäume, Leuchten) in Kartengröße. */
function sub(g, cu, cv, k, ch = 0) {
  return { ctx: g.ctx, z: g.z * k, fine: g.fine, P: (u, v, h = 0) => g.P(cu + u * k, cv + v * k, ch + h * k) };
}

/** Punkt (a, b, h) im Rahmen f. */
const pf = (g, f, a, b, h) => g.P(...f.at(a, b), h);

/** n gleich verteilte Stellen zwischen a0 + mg und a1 − mg, Abstand etwa sp. */
function spots(a0, a1, sp, mg = 5) {
  const len = a1 - a0 - 2 * mg;
  const n = Math.max(1, Math.floor(len / sp) + 1);
  if (n === 1) return [(a0 + a1) / 2];
  return Array.from({ length: n }, (_, i) => a0 + mg + (len * i) / (n - 1));
}

/** Waagrechte Holz- oder Fugenlinien auf den sichtbaren Wänden von h0 bis h1 (Abstand step). */
function courses(g, f, a0, a1, b0, b1, h0, h1, step, color) {
  if (!g.fine) return;
  for (let h = h0 + step; h < h1 - 0.3; h += step) {
    stroke(g, [pf(g, f, a0, b1, h), pf(g, f, a1, b1, h), pf(g, f, a1, b0, h)], color, 0.4);
  }
}

/** Fensterverdachung (helle Leiste) über Fenstern an den Stellen at. */
function lintels(g, face, plane, at, h, ww, color) {
  if (!g.fine) return;
  const pt = onFace(g, face, plane);
  for (const a of at) poly(g, [pt(a - ww / 2 - 0.9, h), pt(a + ww / 2 + 0.9, h), pt(a + ww / 2 + 0.9, h + 1.1), pt(a - ww / 2 - 0.9, h + 1.1)], lit(color, ...FACE[face]), null);
}

/** Blumenkästen unter Fenstern (fein). */
function flowerBoxes(g, face, plane, at, h, ww, seed) {
  if (!g.fine || roofSnowOn()) return;
  const pt = onFace(g, face, plane);
  at.forEach((a, i) => {
    const c = ['#d8473f', '#e06a9a', '#f0c23a'][(seed + i) % 3];
    poly(g, [pt(a - ww / 2, h - 1.4, 0.8), pt(a + ww / 2, h - 1.4, 0.8), pt(a + ww / 2, h, 0.8), pt(a - ww / 2, h, 0.8)], lit('#5d7a3a', ...FACE[face]), null);
    for (let k = 0; k < 3; k++) {
      const x = a - ww / 2 + (ww * (k + 0.5)) / 3;
      const [px, py] = pt(x, h + 0.4, 0.9);
      circle(g.ctx, px, py, Math.max(0.5, 0.75 * g.z), c);
    }
  });
}

/** Schornstein (Ziegel) mit Abdeckung. */
function chimney(g, f, a, b, h0, h1, col = '#8e5444') {
  box(g, ...f.R(a - 1.8, a + 1.8, b - 1.8, b + 1.8), h0, h1, col, shade(col, 0.2));
  box(g, ...f.R(a - 2.2, a + 2.2, b - 2.2, b + 2.2), h1, h1 + 0.9, '#6f6a66');
}

/** Höhe der vorderen Dachfläche eines Satteldachs (First entlang a, Traufe bei b1 auf H, First bm auf H + rh). */
const slopeH = (b, bm, w, H, rh) => H + rh - (Math.abs(b - bm) * rh) / w;

/** Dachfenster (flach in der vorderen Dachfläche eines Satteldachs entlang a): Mitte a, von b = bA bis bB. */
function roofWin(g, f, a, ww, bA, bB, bm, w, H, rh) {
  const P = (aa, bb) => pf(g, f, aa, bb, slopeH(bb, bm, w, H, rh) + 0.25);
  poly(g, [P(a - ww / 2, bA), P(a + ww / 2, bA), P(a + ww / 2, bB), P(a - ww / 2, bB)], '#3d566d', 'rgba(230,230,225,0.75)');
}

// ---------- Häuser ----------

/** Altbau (drei Geschosse): Putz, rustiziertes Erdgeschoss, Gesimse, hohe Fenster mit Verdachung, Walmdach mit Zwerchgiebel. */
function altbau(g, o) {
  const f = frameOf(o.long);
  const { a0, a1, b0, b1 } = o;
  const wall = PLASTER[o.c % PLASTER.length];
  const roof = o.c % 2 ? SLATE : TILES[o.c % 3];
  const H = 34;
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  shadow(g, ...R(a0, a1, b0, b1), H + 14);
  box(g, ...R(a0, a1, b0, b1), 0, H, wall);
  wallBand(g, ...R(a0, a1, b0, b1), 0, 10.4, shade(wall, 0.09));
  courses(g, f, a0, a1, b0, b1, 0, 10.4, 2.6, 'rgba(0,0,0,0.1)');
  plinth(g, ...R(a0, a1, b0, b1), wall, 1.4);
  wallBand(g, ...R(a0, a1, b0, b1), 10.4, 11.6, tint(wall, 0.3));
  ledge(g, ...R(a0, a1, b0, b1), 22.6, 'rgba(0,0,0,0.16)');
  const side = spots(a0, a1, 9.5, 6);
  const end = spots(b0, b1, 9.5, 6);
  const mid = Math.floor(side.length / 2);
  const dA = side[mid];
  winsAt(g, f.side, b1, side, [[2.8, 8.2]], 4, { seed: o.seed, skip: (i) => i === mid, cross: true });
  winsAt(g, f.side, b1, side, [[13.6, 20.2], [24.4, 30.8]], 4, { seed: o.seed + 1, cross: true });
  winsAt(g, f.end, a1, end, [[2.8, 8.2], [13.6, 20.2], [24.4, 30.8]], 4, { seed: o.seed + 2, cross: true });
  lintels(g, f.side, b1, side, 20.6, 4, tint(wall, 0.3));
  lintels(g, f.end, a1, end, 20.6, 4, tint(wall, 0.3));
  door(g, f.side, b1, dA, 5, 9, '#5b3a28');
  if (g.fine) disc(g, f.side, b1, dA, 9.6, 2.5, lit('#3d566d', ...FACE[f.side]), null, 0, 10);
  box(g, ...R(dA - 4.2, dA + 4.2, b1, b1 + 1.7), 0, 1.1, '#cbc4b4');
  box(g, ...R(a0 - 0.9, a1 + 0.9, b0 - 0.9, b1 + 0.9), H - 1.4, H, tint(wall, 0.24));
  const bm = (b0 + b1) / 2;
  hip(g, ...R(a0, a1, b0, b1), H, 13, roof, () => {
    chimney(g, f, a0 + (a1 - a0) * 0.26, bm - 3, H + 3, H + 17);
    chimney(g, f, a0 + (a1 - a0) * 0.74, bm - 3, H + 3, H + 17);
  });
  // Zwerchgiebel über dem Eingang
  const dw = 7;
  box(g, ...R(dA - dw, dA + dw, b1 - 7, b1), H - 0.5, H + 9, wall);
  winsAt(g, f.side, b1, [dA], [[H + 1.6, H + 7]], 4.4, { seed: o.seed + 3, cross: true });
  gable(g, f.cross, ...R(dA - dw, dA + dw, b1 - 7, b1), H + 9, 5, roof, wall);
}

/** Klinkerhaus (drei Geschosse): Ziegel mit weißen Fensterrahmen, Balkone, Satteldach mit Dachfenstern, Rundfenster im Giebel. */
function klinker(g, o) {
  const f = frameOf(o.long);
  const { a0, a1, b0, b1 } = o;
  const wall = BRICK[o.c % BRICK.length];
  const roof = TILES[(o.c + 1) % 3];
  const acc = SHUTTER[o.c % SHUTTER.length];
  const H = 33;
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  shadow(g, ...R(a0, a1, b0, b1), H + 15);
  box(g, ...R(a0, a1, b0, b1), 0, H, wall);
  courses(g, f, a0, a1, b0, b1, 0, H, 1.5, 'rgba(255,240,225,0.07)');
  plinth(g, ...R(a0, a1, b0, b1), '#6f6a66', 2);
  for (const h of [11, 22]) wallBand(g, ...R(a0, a1, b0, b1), h - 0.5, h + 0.5, tint(wall, 0.18));
  const side = spots(a0, a1, 10, 6);
  const end = spots(b0, b1, 10, 6);
  const balc = side.length >= 4 ? [1, side.length - 2] : [0];
  const dI = side.length >= 3 ? Math.floor(side.length / 2) : -1;
  const frame = '#f2efe6';
  winsAt(g, f.side, b1, side, [[2.6, 8.4]], 4.4, { seed: o.seed, frame, cross: true, skip: (i) => i === dI });
  winsAt(g, f.side, b1, side, [[13.6, 19.4], [24.6, 30.4]], 4.4, { seed: o.seed + 1, frame, cross: true, skip: (i) => balc.includes(i) });
  winsAt(g, f.side, b1, balc.map((i) => side[i]), [[11.6, 19.6], [22.6, 30.6]], 4.6, { seed: o.seed + 4, frame });
  winsAt(g, f.end, a1, end, [[2.6, 8.4], [13.6, 19.4], [24.6, 30.4]], 4.4, { seed: o.seed + 2, frame, cross: true });
  for (const i of balc) for (const h of [11.2, 22.2]) balcony(g, f.side, b1, side[i] - 4.6, side[i] + 4.6, h, 3.2, acc);
  if (dI >= 0) {
    door(g, f.side, b1, side[dI], 5, 9.2, '#3f5a6e');
    box(g, ...R(side[dI] - 4, side[dI] + 4, b1, b1 + 2.6), 9.8, 10.6, '#e6e2d8');
  } else door(g, f.end, a1, (b0 + b1) / 2, 5, 9.2, '#3f5a6e');
  const bm = (b0 + b1) / 2;
  const w = (b1 - b0) / 2;
  gable(g, f.axis, ...R(a0, a1, b0, b1), H, 15, roof, wall, () => chimney(g, f, a0 + (a1 - a0) * 0.3, bm - 2, H + 6, H + 19));
  if (g.fine) disc(g, f.end, a1, bm, H + 6, 2.3, lit(GLASS, ...FACE[f.end]), 'rgba(240,236,228,0.9)', 0, 12);
  for (const a of [a0 + (a1 - a0) * 0.3, a0 + (a1 - a0) * 0.7]) roofWin(g, f, a, 5, b1 - w * 0.62, b1 - w * 0.3, bm, w, H, 15);
}

/** Fachwerkhaus (zwei Geschosse): Fachwerk über dem Steinsockel, vorkragendes Obergeschoss, Läden, Blumenkästen, steiles Dach. */
function fachwerk(g, o) {
  const f = frameOf(o.long);
  const { a0, a1, b0, b1 } = o;
  const roof = TILES[o.c % 3];
  const acc = SHUTTER[(o.c + 1) % SHUTTER.length];
  const H = 22;
  const rh = Math.min(22, (b1 - b0) * 0.42);
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  shadow(g, ...R(a0, a1, b0, b1), H + rh);
  box(g, ...R(a0, a1, b0, b1), 0, 11, FACH_WALL);
  wallBand(g, ...R(a0, a1, b0, b1), 0, 3.4, '#b9a78a');
  box(g, ...R(a0, a1 + 0.9, b0, b1 + 0.9), 11, H, FACH_WALL);
  const timber = (A0, A1, B0, B1, h0, h1, step) => {
    const sideP = onFace(g, f.side, B1);
    const endP = onFace(g, f.end, A1);
    const beam = (pt, x0, x1, h) => stroke(g, [pt(x0, h), pt(x1, h)], TIMBER, 1.1);
    for (const [pt, x0, x1] of [[sideP, A0, A1], [endP, B0, B1]]) {
      beam(pt, x0, x1, h0 + 0.5);
      beam(pt, x0, x1, h1 - 0.5);
      const n = Math.max(2, Math.round((x1 - x0) / step));
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        stroke(g, [pt(x, h0), pt(x, h1)], TIMBER, 1);
        if (g.fine && i < n && i % 3 === 1) {
          const x2 = x0 + ((x1 - x0) * (i + 1)) / n;
          stroke(g, [pt(x, h0 + 0.5), pt(x2, h1 - 0.5)], TIMBER, 0.8);
          stroke(g, [pt(x2, h0 + 0.5), pt(x, h1 - 0.5)], TIMBER, 0.8);
        }
      }
    }
  };
  timber(a0, a1, b0, b1, 3.4, 11, 7.5);
  timber(a0, a1 + 0.9, b0, b1 + 0.9, 11, H, 7.5);
  const side = spots(a0, a1, 11, 7.5);
  const end = spots(b0, b1, 11, 7.5);
  const mid = Math.floor(side.length / 2);
  winsAt(g, f.side, b1, side, [[4.6, 8.8]], 3.4, { seed: o.seed, shutter: acc, cross: true, skip: (i) => i === mid });
  winsAt(g, f.side, b1 + 0.9, side, [[14, 18.8]], 3.4, { seed: o.seed + 1, shutter: acc, cross: true });
  flowerBoxes(g, f.side, b1 + 0.9, side, 14, 4.2, o.seed);
  winsAt(g, f.end, a1, end, [[4.6, 8.8]], 3.4, { seed: o.seed + 2, shutter: acc, cross: true });
  winsAt(g, f.end, a1 + 0.9, end, [[14, 18.8]], 3.4, { seed: o.seed + 3, shutter: acc, cross: true });
  door(g, f.side, b1, side[mid], 4.4, 8.6, '#6a4a32');
  const bm = (b0 + b1) / 2;
  const w = (b1 + 0.9 - b0) / 2;
  gable(g, f.axis, ...R(a0, a1 + 0.9, b0, b1 + 0.9), H, rh, roof, FACH_WALL, () => chimney(g, f, a0 + (a1 - a0) * 0.68, bm - 2, H + 5, H + rh + 3));
  // Fachwerk im Giebel
  const gp = onFace(g, f.end, a1 + 0.9);
  const top = (b) => slopeH(b, (b0 + b1 + 0.9) / 2, w, H, rh);
  for (const t of [0.25, 0.5, 0.75]) {
    const b = b0 + (b1 + 0.9 - b0) * t;
    stroke(g, [gp(b, H), gp(b, top(b) - 0.6)], TIMBER, 1);
  }
  const hb = H + rh * 0.45;
  const bw = w * 0.55;
  stroke(g, [gp(bm + 0.45 - bw, hb), gp(bm + 0.45 + bw, hb)], TIMBER, 1);
  if (g.fine) winsAt(g, f.end, a1 + 0.9, [bm + 0.45], [[H + 3, H + 7]], 3, { seed: o.seed + 5, cross: true });
}

/** Neubau (drei Geschosse): heller Putz, Fensterbänder, Balkone mit Glasbrüstung, Treppenhaus aus Glas, Flachdach mit Technik. */
function neubau(g, o) {
  const f = frameOf(o.long);
  const { a0, a1, b0, b1 } = o;
  const wall = NEU_WALL[o.c % NEU_WALL.length];
  const acc = NEU_ACC[o.c % NEU_ACC.length];
  const H = 36;
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  shadow(g, ...R(a0, a1, b0, b1), H);
  box(g, ...R(a0, a1, b0, b1), 0, H, wall);
  wallBand(g, ...R(a0, a1, b0, b1), 0, 11.6, shade(wall, 0.12));
  plinth(g, ...R(a0, a1, b0, b1), wall, 1.2);
  for (const h of [12, 24]) ledge(g, ...R(a0, a1, b0, b1), h, 'rgba(0,0,0,0.13)', 0.7);
  // Treppenhaus: Glasband in der Mitte der Stirnseite
  const bm = (b0 + b1) / 2;
  const ep = onFace(g, f.end, a1);
  poly(g, [ep(bm - 3, 1), ep(bm + 3, 1), ep(bm + 3, H - 1.5), ep(bm - 3, H - 1.5)], lit('#5a7f99', ...FACE[f.end]), OUTLINE);
  if (g.fine) for (const h of [12, 24]) stroke(g, [ep(bm - 3, h), ep(bm + 3, h)], 'rgba(230,232,235,0.7)', 0.5);
  const side = spots(a0, a1, 12, 7);
  const endL = spots(b0, bm - 4, 9, 4);
  const endR = spots(bm + 4, b1, 9, 4);
  winsAt(g, f.side, b1, side, [[3, 9.4]], 6, { seed: o.seed, frame: false });
  winsAt(g, f.end, a1, [...endL, ...endR], [[3, 9.4], [15, 21.4], [27, 33.4]], 4.6, { seed: o.seed + 2, frame: false });
  for (const h of [12, 24]) {
    winsAt(g, f.side, b1, side, [[h + 1, h + 9.6]], 6.4, { seed: o.seed + h, frame: false, lit: 0.25 });
    for (const a of side) balcony(g, f.side, b1, a - 5, a + 5, h + 0.5, 3.4, '#9fb8c8');
  }
  // Vordach über dem Eingang
  const dA = side[0] + (side[1] !== undefined ? (side[1] - side[0]) / 2 : 6);
  door(g, f.side, b1, dA, 4.6, 9, '#3a4650');
  box(g, ...R(dA - 5, dA + 5, b1, b1 + 4), 10, 10.8, acc);
  box(g, ...R(a0 - 0.5, a1 + 0.5, b0 - 0.5, b1 + 0.5), H, H + 1.4, tint(wall, 0.1));
  parapet(g, ...R(a0 - 0.5, a1 + 0.5, b0 - 0.5, b1 + 0.5), H + 1.4, tint(wall, 0.1));
  const r = H + 0.2;
  if (o.c === 0) {
    // Solarzellen in Reihen
    for (let b = b0 + 5; b < b1 - 8; b += 8) {
      const P = (a, bb, h) => pf(g, f, a, bb, h);
      poly(g, [P(a0 + 6, b, r + 0.5), P(a1 - 14, b, r + 0.5), P(a1 - 14, b + 5, r + 2.6), P(a0 + 6, b + 5, r + 2.6)], '#2b4a78', 'rgba(170,190,215,0.8)');
    }
  } else if (o.c === 1) {
    flat(g, ...R(a0 + 3, a1 - 3, b0 + 3, b1 - 3), snowy('#7aa556'), r);
    for (const t of [0.2, 0.45, 0.7]) bush(sub(g, ...f.at(a0 + (a1 - a0) * t, bm), 2.2, r), 0, 0, 0.8, k3(o.seed + Math.round(t * 20)));
  } else {
    for (const t of [0.25, 0.5]) acUnit(sub(g, ...f.at(a0 + (a1 - a0) * t, bm - 4), 2.4, r), 0, 0, 0, 2.6);
  }
  box(g, ...R(a1 - 12, a1 - 3, bm - 5, bm + 5), r, r + 6, tint(wall, 0.05), '#a29f97');
}

/** Gehöft: Wohnhaus (Giebel zur Straße), angebaute Scheune mit großem Tor, Silo dahinter. */
function gehoeft(g, o) {
  const f = frameOf(o.long);
  const { a0, a1, b0, b1 } = o;
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  const split = a0 + (a1 - a0) * 0.44;
  const wall = PLASTER[(o.c + 2) % PLASTER.length];
  const roof = TILES[o.c % 3];
  const barn = BARN[o.c % BARN.length];
  // Wohnhaus
  const H = 21;
  shadow(g, ...R(a0, split, b0, b1), H + 16);
  box(g, ...R(a0, split, b0, b1), 0, H, wall);
  wallBand(g, ...R(a0, split, b0, b1), 0, 3, '#b3a58c');
  plinth(g, ...R(a0, split, b0, b1), '#8d8574', 1.4);
  ledge(g, ...R(a0, split, b0, b1), 10.8, 'rgba(0,0,0,0.14)');
  const front = spots(a0, split, 9.5, 6);
  winsAt(g, f.side, b1, front, [[3.6, 8.6], [13.6, 18.6]], 3.6, { seed: o.seed, shutter: SHUTTER[o.c % 4], cross: true, skip: (i, r) => r === 0 && i === 0 });
  door(g, f.side, b1, front[0], 4.4, 8.6, '#6a4a32');
  box(g, ...R(front[0] - 3.6, front[0] + 3.6, b1, b1 + 1.6), 0, 1, '#bdb6a6');
  const rh = Math.min(17, (split - a0) * 0.5);
  gable(g, f.cross, ...R(a0, split, b0, b1), H, rh, roof, wall, () => chimney(g, f, (a0 + split) / 2 - 1, b0 + (b1 - b0) * 0.4, H + 6, H + rh + 2));
  winsAt(g, f.side, b1, [(a0 + split) / 2], [[H + 3, H + 8]], 3.4, { seed: o.seed + 3, cross: true });
  // Silo hinten an der Scheune
  const deep = b1 - b0 >= 50;
  const sb = deep ? b0 + 8 : b0 + (b1 - b0) / 2;
  const [su, sv] = f.at(a1 - 8, sb);
  shadow(g, su - 7, su + 7, sv - 7, sv + 7, 30, 0.16);
  cyl(g, su, sv, 7, 0, 42, '#cfd3d2', false);
  for (const h of [10, 20, 30]) band(g, su, sv, 7, h, h + 0.8, '#9ea6a8');
  cap(g, su, sv, 7, 42, '#8f999e', 0.7);
  // Scheune: Holzbretter, Tor mit Andreaskreuz, Luke im Giebel
  const bb0 = deep ? b0 + 16 : b0;
  const HB = 17;
  box(g, ...R(split + 0.5, a1, bb0, b1), 0, HB, barn);
  if (g.fine) {
    const sp = onFace(g, f.side, b1);
    const ep = onFace(g, f.end, a1);
    for (let a = split + 2.5; a < a1; a += 2.4) stroke(g, [sp(a, 0.4), sp(a, HB)], 'rgba(0,0,0,0.16)', 0.45);
    for (let b = bb0 + 2.4; b < b1; b += 2.4) stroke(g, [ep(b, 0.4), ep(b, HB)], 'rgba(0,0,0,0.18)', 0.45);
  }
  plinth(g, ...R(split + 0.5, a1, bb0, b1), '#8d8574', 1.6);
  const tA = (split + a1) / 2 + 1;
  const tp = onFace(g, f.side, b1);
  poly(g, [tp(tA - 8, 0), tp(tA + 8, 0), tp(tA + 8, 13.5), tp(tA - 8, 13.5)], lit(shade(barn, 0.25), ...FACE[f.side]), OUTLINE);
  stroke(g, [tp(tA, 0), tp(tA, 13.5)], 'rgba(0,0,0,0.45)', 0.6);
  for (const [x0, x1] of [[tA - 8, tA], [tA, tA + 8]]) {
    stroke(g, [tp(x0 + 0.6, 0.6), tp(x1 - 0.6, 12.9)], '#d9cdb4', 0.75);
    stroke(g, [tp(x1 - 0.6, 0.6), tp(x0 + 0.6, 12.9)], '#d9cdb4', 0.75);
    stroke(g, [tp(x0 + 0.6, 0.6), tp(x1 - 0.6, 0.6), tp(x1 - 0.6, 12.9), tp(x0 + 0.6, 12.9), tp(x0 + 0.6, 0.6)], '#d9cdb4', 0.6);
  }
  const rb = Math.min(15, (b1 - bb0) * 0.45);
  gable(g, f.axis, ...R(split + 0.5, a1, bb0, b1), HB, rb, roof === TILES[0] ? '#6b6560' : '#7a4234', barn);
  const ep = onFace(g, f.end, a1);
  const bmB = (bb0 + b1) / 2;
  poly(g, [ep(bmB - 3, HB + 1), ep(bmB + 3, HB + 1), ep(bmB + 3, HB + 6.5), ep(bmB - 3, HB + 6.5)], lit('#3b2a20', ...FACE[f.end]), OUTLINE);
  // Heuballen vor der Scheune
  if (g.fine) {
    for (const t of [0.12, 0.88]) {
      const a = split + (a1 - split) * t;
      if (Math.abs(a - tA) < 10) continue;
      const [u, v] = f.at(a, b1 - 2.6);
      cyl(g, u, v, 2.4, 0, 3.2, '#d6bf6e');
    }
  }
}

const HOUSE_STYLES = { alt: altbau, klinker, fach: fachwerk, neu: neubau, farm: gehoeft };
const HOUSE_TALL = { alt: 52, klinker: 53, fach: 46, neu: 46, farm: 48 };

// ---------- Häuser von oben ----------

/** Haus von oben (2D): Grundriss x0…x1 × y0…y1, Längsachse entlang x ('u') oder y ('v'). */
function houseTop(c, o) {
  const { x0, x1, y0, y1 } = o;
  const L = o.long === 'u';
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const chim = (x, y) => rectS(c, x - 1.8, y - 1.8, x + 1.8, y + 1.8, '#8e5444', 'rgba(0,0,0,0.5)', 0.4);
  if (o.style === 'farm') {
    const split = L ? x0 + (x1 - x0) * 0.44 : y0 + (y1 - y0) * 0.44;
    const deep = (L ? y1 - y0 : x1 - x0) >= 50;
    shadowTop(c, x0, y0, x1, y1, 30);
    const roof = snowy(TILES[o.c % 3]);
    const barnRoof = snowy(TILES[o.c % 3] === TILES[0] ? '#6b6560' : '#7a4234');
    if (L) {
      gableTop(c, x0, y0, split, y1, 'v', roof);
      gableTop(c, split + 0.5, deep ? y0 + 16 : y0, x1, y1, 'u', barnRoof);
      chim((x0 + split) / 2 - 1, y0 + (y1 - y0) * 0.4);
    } else {
      gableTop(c, x0, y0, x1, split, 'u', roof);
      gableTop(c, deep ? x0 + 16 : x0, split + 0.5, x1, y1, 'v', barnRoof);
      chim(x0 + (x1 - x0) * 0.4, (y0 + split) / 2 - 1);
    }
    const [sx, sy] = L ? [x1 - 8, deep ? y0 + 8 : cy] : [deep ? x0 + 8 : cx, y1 - 8];
    circle(c, sx + 3, sy + 3, 7.4, 'rgba(0,0,0,0.25)');
    circle(c, sx, sy, 7, snowy('#b9c1c4'));
    circle(c, sx - 1.5, sy - 1.5, 3.2, snowy('#d3d9db'));
    return;
  }
  const H = HOUSE_TALL[o.style];
  shadowTop(c, x0, y0, x1, y1, H);
  if (o.style === 'alt') {
    const roof = snowy(o.c % 2 ? SLATE : TILES[o.c % 3]);
    hipTop(c, x0, y0, x1, y1, roof);
    // Zwerchgiebel zur Straße (unten bzw. rechts)
    if (L) gableTop(c, cx - 7, y1 - 9, cx + 7, y1 + 0.5, 'v', roof, 0.6);
    else gableTop(c, x1 - 9, cy - 7, x1 + 0.5, cy + 7, 'u', roof, 0.6);
    for (const t of [0.26, 0.74]) (L ? chim(x0 + (x1 - x0) * t, cy - 3) : chim(cx - 3, y0 + (y1 - y0) * t));
  } else if (o.style === 'klinker' || o.style === 'fach') {
    const roof = snowy(o.style === 'klinker' ? TILES[(o.c + 1) % 3] : TILES[o.c % 3]);
    gableTop(c, x0, y0, x1, y1, L ? 'u' : 'v', roof);
    if (o.style === 'klinker') {
      for (const t of [0.3, 0.7]) {
        if (L) rectS(c, x0 + (x1 - x0) * t - 2.5, cy + 4, x0 + (x1 - x0) * t + 2.5, cy + 9, '#3d566d', 'rgba(230,230,225,0.7)', 0.4);
        else rectS(c, cx + 4, y0 + (y1 - y0) * t - 2.5, cx + 9, y0 + (y1 - y0) * t + 2.5, '#3d566d', 'rgba(230,230,225,0.7)', 0.4);
      }
      L ? chim(x0 + (x1 - x0) * 0.3, cy - 2) : chim(cx - 2, y0 + (y1 - y0) * 0.3);
    } else L ? chim(x0 + (x1 - x0) * 0.68, cy - 2) : chim(cx - 2, y0 + (y1 - y0) * 0.68);
  } else {
    flatTop(c, x0 - 0.5, y0 - 0.5, x1 + 0.5, y1 + 0.5, NEU_WALL[o.c % 3]);
    if (o.c === 0) {
      for (let k = (L ? y0 : x0) + 5; k < (L ? y1 : x1) - 8; k += 8) {
        if (L) rectS(c, x0 + 6, k, x1 - 14, k + 5, '#2b4a78', 'rgba(170,190,215,0.8)', 0.4);
        else rectS(c, k, y0 + 6, k + 5, y1 - 14, '#2b4a78', 'rgba(170,190,215,0.8)', 0.4);
      }
    } else if (o.c === 1) rectF(c, x0 + 3, y0 + 3, x1 - 3, y1 - 3, snowy('#7aa556'));
    else for (const t of [0.25, 0.5]) (L ? acTop(c, x0 + (x1 - x0) * t, cy - 4, 5) : acTop(c, cx - 4, y0 + (y1 - y0) * t, 5));
    if (L) rectS(c, x1 - 12, cy - 5, x1 - 3, cy + 5, '#a29f97');
    else rectS(c, cx - 5, y1 - 12, cx + 5, y1 - 3, '#a29f97');
  }
}

// ---------- Halle ----------

/** Rolltor (fein mit Lamellen) an der Längsseite bei a; dock = erhöht über einer Laderampe mit Torabdichtung. */
function rollDoor(g, f, a, plane, dock) {
  const pt = onFace(g, f.side, plane);
  const h0 = dock ? 3.6 : 0;
  const w = dock ? 7 : 8;
  const h1 = dock ? 15 : 16;
  poly(g, [pt(a - w - 1.2, h0), pt(a + w + 1.2, h0), pt(a + w + 1.2, h1 + 1.2), pt(a - w - 1.2, h1 + 1.2)], lit(dock ? '#2c2e30' : '#5a6066', ...FACE[f.side]), null);
  poly(g, [pt(a - w, h0), pt(a + w, h0), pt(a + w, h1), pt(a - w, h1)], lit('#c2c7ca', ...FACE[f.side]), OUTLINE);
  if (g.fine) for (let h = h0 + 1.5; h < h1 - 0.3; h += 1.5) stroke(g, [pt(a - w, h), pt(a + w, h)], 'rgba(0,0,0,0.16)', 0.4);
  if (!dock) {
    // Rammschutz in Gelb-Schwarz neben dem Tor
    for (const s of [-1, 1]) {
      const [u, v] = f.at(a + s * (w + 2.4), plane + 1.2);
      cyl(g, u, v, 0.9, 0, 4.4, '#e0b63a');
    }
  }
}

/** Lagerhalle: Wellblech mit Farbband, Rolltore und Laderampen an der Längsseite, Büro an der Stirnseite, Sattel- oder Tonnendach. */
function paintHall(g, o) {
  const f = frameOf(o.long);
  const { a0, a1, b0, b1 } = o;
  const wall = HALL_WALL[o.c % HALL_WALL.length];
  const bandC = HALL_BAND[o.c2 % HALL_BAND.length];
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  const H = 24;
  const bd = b1 - 6; // Wand, davor Vorfeld mit Rampen
  const bm = (b0 + bd) / 2;
  const w = (bd - b0) / 2;
  const rh = o.vault ? Math.min(14, w * 0.3) : Math.min(9, w * 0.2);
  flat(g, ...R(a0, a1, bd, b1), '#a9a79f');
  shadow(g, ...R(a0, a1, b0, bd), H + rh);
  box(g, ...R(a0, a1, b0, bd), 0, H, wall);
  ribs(g, ...R(a0, a1, b0, bd), 1.6, H - 3.8, 2.6);
  plinth(g, ...R(a0, a1, b0, bd), '#7c7f80', 1.6);
  wallBand(g, ...R(a0, a1, b0, bd), H - 3.8, H - 0.9, bandC);
  const office = a1 - 32;
  winsAt(g, f.side, bd, spots(office, a1, 7.5, 4.5), [[4.4, 9.2], [13.2, 18]], 4.6, { seed: o.seed });
  const ends = spots(b0, bd, 8, 6);
  const em = Math.floor(ends.length / 2);
  winsAt(g, f.end, a1, ends, [[4.4, 9.2]], 4.6, { seed: o.seed + 1, skip: (i) => i === em });
  winsAt(g, f.end, a1, ends, [[13.2, 18]], 4.6, { seed: o.seed + 2 });
  door(g, f.end, a1, ends[em], 5, 9.4, '#3a4650');
  const doors = [];
  for (let a = a0 + 17, i = 0; a < office - 9; a += 29, i++) doors.push([a, i % 2 === 1]);
  for (const [a, dock] of doors) rollDoor(g, f, a, bd, dock);
  for (const [a, dock] of doors) {
    if (!dock) continue;
    box(g, ...R(a - 9.5, a + 9.5, bd, bd + 4.6), 0, 3.6, '#a29e93', '#b9b5aa');
    if (g.fine) for (const s of [-1, 1]) box(g, ...R(a + s * 5 - 0.8, a + s * 5 + 0.8, bd + 4.6, bd + 5.4), 1.2, 3.4, '#262729');
  }
  // Firmenschild an der Längsseite neben dem Büro
  const sp = onFace(g, f.side, bd);
  const sa = office - 4;
  poly(g, [sp(sa - 9, 17.5), sp(sa + 1, 17.5), sp(sa + 1, 20.6), sp(sa - 9, 20.6)], lit('#f2efe6', ...FACE[f.side]), OUTLINE);
  poly(g, [sp(sa - 8.4, 18.1), sp(sa - 5, 18.1), sp(sa - 5, 20), sp(sa - 8.4, 20)], lit(bandC, ...FACE[f.side]), null);
  const P = (a, b, h) => pf(g, f, a, b, h);
  const sky = (bA, bB) => {
    for (let a = a0 + 8; a + 16 <= office - 6; a += 26) {
      const e = a + 16;
      poly(g, [P(a, bA, slopeH(bA, bm, w, H, rh) + 0.3), P(e, bA, slopeH(bA, bm, w, H, rh) + 0.3), P(e, bB, slopeH(bB, bm, w, H, rh) + 0.3), P(a, bB, slopeH(bB, bm, w, H, rh) + 0.3)], snowy(SKY), 'rgba(60,80,90,0.45)');
    }
  };
  if (o.vault) vault(g, f.axis, ...R(a0, a1, b0, bd), H, rh, METAL_ROOF, wall, 12);
  else {
    gable(g, f.axis, ...R(a0, a1, b0, bd), H, rh, METAL_ROOF, wall, () => sky(bm - w * 0.55, bm - w * 0.2));
    sky(bm + w * 0.2, bm + w * 0.55);
  }
  for (const t of [0.2, 0.45, 0.7]) {
    const [u, v] = f.at(a0 + (a1 - a0) * t, bm);
    cyl(g, u, v, 1.9, H + rh - 0.6, H + rh + 2.6, '#8d9398');
  }
}

function hallTop(c, o) {
  const L = o.long === 'u';
  const { x0, x1, y0, y1 } = o;
  // Vorfeld an der +y- bzw. +x-Seite, Halle davor
  const [hx1, hy1] = L ? [x1, y1 - 6] : [x1 - 6, y1];
  shadowTop(c, x0, y0, hx1, hy1, 30);
  if (L) rectF(c, x0, y1 - 6, x1, y1, '#a9a79f');
  else rectF(c, x1 - 6, y0, x1, y1, '#a9a79f');
  const roof = snowy(METAL_ROOF);
  if (o.vault) vaultTop(c, x0, y0, hx1, hy1, L ? 'u' : 'v', roof, false);
  else gableTop(c, x0, y0, hx1, hy1, L ? 'u' : 'v', roof);
  const ext = L ? hy1 - y0 : hx1 - x0;
  const office = (L ? x1 : y1) - 32;
  for (let a = (L ? x0 : y0) + 8; a + 16 <= office - 6; a += 26) {
    const e = a + 16;
    for (const k of [0.25, 0.6]) {
      const b0 = (L ? y0 : x0) + ext * k;
      if (L) rectS(c, a, b0, e, b0 + ext * 0.15, snowy(SKY), 'rgba(60,80,90,0.45)', 0.35);
      else rectS(c, b0, a, b0 + ext * 0.15, e, snowy(SKY), 'rgba(60,80,90,0.45)', 0.35);
    }
  }
  for (const t of [0.2, 0.45, 0.7]) {
    const a = (L ? x0 : y0) + ((L ? x1 : y1) - (L ? x0 : y0)) * t;
    const m = L ? (y0 + hy1) / 2 : (x0 + hx1) / 2;
    if (L) circle(c, a, m, 2, '#7d8388');
    else circle(c, m, a, 2, '#7d8388');
  }
  // Laderampen
  for (let a = (L ? x0 : y0) + 17, i = 0; a < office - 9; a += 29, i++) {
    if (i % 2 !== 1) continue;
    if (L) rectS(c, a - 9.5, y1 - 6, a + 9.5, y1 - 1.4, '#b9b5aa');
    else rectS(c, x1 - 6, a - 9.5, x1 - 1.4, a + 9.5, '#b9b5aa');
  }
}

// ---------- Fabrik ----------

/** Sheddach über a0…a1 × b0…b1 auf Höhe H: Zähne steigen nach +a an, senkrechte Verglasung zur Stirnseite. */
function sawRoof(g, f, a0, a1, b0, b1, H, rt, wall) {
  const n = Math.max(2, Math.round((a1 - a0) / 21));
  const len = (a1 - a0) / n;
  const P = (a, b, h) => pf(g, f, a, b, h);
  const roof = snowy(FACT_ROOF);
  for (let k = 0; k < n; k++) {
    const t0 = a0 + k * len;
    const t1 = t0 + len;
    poly(g, [P(t0, b0, H), P(t1, b0, H + rt), P(t1, b1, H + rt), P(t0, b1, H)], lit(roof, ...f.n(-rt, 0, len)), OUTLINE);
    poly(g, [P(t0, b1, H), P(t1, b1, H), P(t1, b1, H + rt)], lit(wall, ...FACE[f.side]), OUTLINE);
    poly(g, [P(t1, b0, H), P(t1, b1, H), P(t1, b1, H + rt), P(t1, b0, H + rt)], lit(SKY, ...FACE[f.end]), OUTLINE);
    if (g.fine) for (let b = b0 + 4; b < b1 - 1; b += 4) stroke(g, [P(t1, b, H + 0.3), P(t1, b, H + rt - 0.3)], 'rgba(60,70,80,0.55)', 0.45);
  }
}

/** Fabrik: Hof mit Silos und Lkw, Shedhalle mit Industriefenstern und Tor, Bürobau mit Schild, Schornstein hinten. */
function paintFactory(g, o) {
  const f = frameOf(o.long);
  const { a0, a1, b0, b1 } = o;
  const wall = FACT_WALL[o.c % FACT_WALL.length];
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  const yard = b1 - 34;
  flat(g, ...R(a0, a1, yard, b1), YARD);
  if (g.fine) {
    const P = (a, b) => pf(g, f, a, b, 0.1);
    stroke(g, [P(a0 + 46, yard + 3), P(a1 - 4, yard + 3)], 'rgba(230,200,60,0.75)', 0.6);
    for (let a = a1 - 58; a < a1 - 4; a += 9) stroke(g, [P(a, b1 - 1), P(a, b1 - 11)], 'rgba(240,240,235,0.7)', 0.5);
  }
  // Schornstein hinten links
  const [cu, cv] = f.at(a0 + 15, b0 + 15);
  shadow(g, cu - 7, cu + 7, cv - 7, cv + 7, 60, 0.14);
  frustum(g, cu, cv, 7.2, 5, 0, 116, '#9a4a38', false);
  band(g, cu, cv, 5.3, 100, 104.5, '#ece8e0');
  band(g, cu, cv, 5.1, 108, 112.5, '#c23b30');
  cyl(g, cu, cv, 5.6, 115, 118, '#4f5154');
  // Shedhalle
  const aE = a1 - 66;
  const bE = yard - 2;
  const H = 22;
  shadow(g, ...R(a0, aE, b0, bE), H + 10);
  box(g, ...R(a0, aE, b0, bE), 0, H, wall);
  plinth(g, ...R(a0, aE, b0, bE), '#6f6a66', 2);
  ledge(g, ...R(a0, aE, b0, bE), 18.6, 'rgba(0,0,0,0.15)');
  const sideW = spots(a0, aE - 26, 14, 9);
  winsAt(g, f.side, bE, sideW, [[5.4, 16.4]], 9, { seed: o.seed, frame: '#d9d6cc' });
  if (g.fine) {
    const pt = onFace(g, f.side, bE);
    for (const a of sideW) {
      stroke(g, [pt(a - 4.5, 11), pt(a + 4.5, 11)], 'rgba(220,220,214,0.7)', 0.45);
      for (const d of [-1.5, 1.5]) stroke(g, [pt(a + d, 5.4), pt(a + d, 16.4)], 'rgba(220,220,214,0.7)', 0.45);
    }
  }
  gate(g, f.side, bE, aE - 14, 15, 16, '#8e979d');
  winsAt(g, f.end, aE, spots(b0, bE, 13, 9), [[5.4, 16.4]], 8, { seed: o.seed + 1, frame: '#d9d6cc' });
  sawRoof(g, f, a0, aE, b0, bE, H, 10, wall);
  // Bürobau mit Schild
  const o0 = aE + 4;
  const ob0 = b0 + 10;
  const ob1 = yard - 3;
  const HO = 33;
  const ow = o.c === 1 ? '#c9c4b8' : '#b5654b';
  shadow(g, ...R(o0, a1, ob0, ob1), HO);
  box(g, ...R(o0, a1, ob0, ob1), 0, HO, ow);
  plinth(g, ...R(o0, a1, ob0, ob1), '#6f6a66', 1.6);
  for (const h of [11, 22]) wallBand(g, ...R(o0, a1, ob0, ob1), h - 0.6, h + 0.6, '#e8e3d8');
  const ow1 = spots(o0, a1, 7, 4.5);
  const ow2 = spots(ob0, ob1, 7, 4.5);
  const mid = Math.floor(ow1.length / 2);
  winsAt(g, f.side, ob1, ow1, [[2.8, 8.6]], 4.4, { seed: o.seed + 2, skip: (i) => i === mid });
  winsAt(g, f.side, ob1, ow1, [[13.6, 19.6], [24.6, 30.6]], 4.4, { seed: o.seed + 3 });
  winsAt(g, f.end, a1, ow2, [[2.8, 8.6], [13.6, 19.6], [24.6, 30.6]], 4.4, { seed: o.seed + 4 });
  door(g, f.side, ob1, ow1[mid], 5.4, 9.2, '#33414c');
  box(g, ...R(ow1[mid] - 5, ow1[mid] + 5, ob1, ob1 + 4), 9.8, 10.6, '#e6e2d8');
  box(g, ...R(o0 - 0.5, a1 + 0.5, ob0 - 0.5, ob1 + 0.5), HO, HO + 1.2, tint(ow, 0.12));
  parapet(g, ...R(o0 - 0.5, a1 + 0.5, ob0 - 0.5, ob1 + 0.5), HO + 1.2, tint(ow, 0.12));
  const am = (o0 + a1) / 2;
  acUnit(sub(g, ...f.at(am - 12, (ob0 + ob1) / 2 - 4), 2.4, HO), 0, 0, 0, 2.6);
  const logo = HALL_BAND[o.c2 % HALL_BAND.length];
  box(g, ...R(am - 15, am + 15, ob1 - 2.6, ob1 - 1.4), HO + 1.2, HO + 8.4, '#f2efe6');
  if (g.fine) {
    const lp = onFace(g, f.side, ob1 - 1.4);
    poly(g, [lp(am - 13.5, HO + 2.4), lp(am - 7.5, HO + 2.4), lp(am - 7.5, HO + 7.2), lp(am - 13.5, HO + 7.2)], lit(logo, ...FACE[f.side]), null);
    for (const h of [HO + 3.4, HO + 5.6]) stroke(g, [lp(am - 5.5, h), lp(am + 12.5, h)], 'rgba(60,64,70,0.75)', 0.9);
  }
  // Silos mit Rohr zur Halle, Paletten, Lkw
  for (const a of [a0 + 13, a0 + 31]) {
    const [u, v] = f.at(a, b1 - 15);
    shadow(g, u - 8, u + 8, v - 8, v + 8, 30, 0.14);
    cyl(g, u, v, 8, 0, 34, '#d7dad8', false);
    for (const h of [9, 18, 27]) band(g, u, v, 8, h, h + 0.7, '#a7aeb0');
    cap(g, u, v, 8, 34, '#9aa3a8', 0.45);
  }
  pipe(g, [[...f.at(a0 + 13, b1 - 15), 36], [...f.at(a0 + 13, yard - 2), 36], [...f.at(a0 + 13, yard - 2), H]].map(([u, v, h]) => [u, v, h]), 1.4, '#8d9499');
  if (g.fine) for (const a of [a0 + 52, a0 + 60]) crate(sub(g, ...f.at(a, b1 - 7), 2.6), 0, 0, 1.3, 2.2, '#a07a4f');
  const [lu, lv] = f.at(a0 + 104, b1 - 15);
  lorry(sub(g, lu, lv, 3), 0, 0, f.axis, HALL_BAND[(o.c2 + 1) % HALL_BAND.length], 'tarp');
}

function factoryTop(c, o) {
  const L = o.long === 'u';
  const { x0, x1, y0, y1 } = o;
  // in (a, b): a entlang der Längsachse, b quer; T bildet auf (x, y) ab
  const T = (a, b) => (L ? [a, b] : [b, a]);
  const RT = (a0, a1, b0, b1, fill, line) => {
    const [p, q] = [T(a0, b0), T(a1, b1)];
    if (line === undefined) rectF(c, Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1]), fill);
    else rectS(c, Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1]), fill, line, 0.5);
  };
  const [a0, a1, b0, b1] = L ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  const yard = b1 - 34;
  RT(a0, a1, yard, b1, YARD);
  const aE = a1 - 66;
  const bE = yard - 2;
  const [sx0, sy0] = T(a0, b0);
  const [sx1, sy1] = T(aE, bE);
  shadowTop(c, Math.min(sx0, sx1), Math.min(sy0, sy1), Math.max(sx0, sx1), Math.max(sy0, sy1), 34);
  // Sheddach: abwechselnd Dach und Glas quer zur Längsachse
  const n = Math.max(2, Math.round((aE - a0) / 21));
  const len = (aE - a0) / n;
  for (let k = 0; k < n; k++) {
    const t0 = a0 + k * len;
    RT(t0, t0 + len * 0.72, b0, bE, snowy(FACT_ROOF));
    RT(t0 + len * 0.72, t0 + len, b0, bE, SKY);
  }
  RT(a0, aE, b0, bE, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)');
  // Bürobau
  const o0 = aE + 4;
  const ob0 = b0 + 10;
  const ob1 = yard - 3;
  const [ox0, oy0] = T(o0, ob0);
  const [ox1, oy1] = T(a1, ob1);
  shadowTop(c, Math.min(ox0, ox1), Math.min(oy0, oy1), Math.max(ox0, ox1), Math.max(oy0, oy1), 33);
  const ow = o.c === 1 ? '#c9c4b8' : '#b5654b';
  flatTop(c, Math.min(ox0, ox1), Math.min(oy0, oy1), Math.max(ox0, ox1), Math.max(oy0, oy1), ow);
  const am = (o0 + a1) / 2;
  const [ax, ay] = T(am - 12, (ob0 + ob1) / 2 - 4);
  acTop(c, ax, ay, 5);
  RT(am - 15, am + 15, ob1 - 2.6, ob1 - 1.4, '#f2efe6', 'rgba(0,0,0,0.4)');
  // Schornstein, Silos, Lkw
  const [cx, cy] = T(a0 + 15, b0 + 15);
  circle(c, cx + 9, cy + 9, 7, 'rgba(0,0,0,0.22)');
  circle(c, cx, cy, 7, '#9a4a38');
  circle(c, cx, cy, 5.6, '#4f5154');
  circle(c, cx, cy, 3.6, '#1f2022');
  for (const a of [a0 + 13, a0 + 31]) {
    const [x, y] = T(a, b1 - 15);
    circle(c, x + 4, y + 4, 8, 'rgba(0,0,0,0.25)');
    circle(c, x, y, 8, snowy('#c9ced0'));
    circle(c, x - 2, y - 2, 3.8, snowy('#e2e6e7'));
  }
  const [lx, ly] = T(a0 + 104, b1 - 15);
  c.save();
  c.translate(lx, ly);
  c.scale(3, 3);
  lorryTop(c, 0, 0, L ? 'u' : 'v', HALL_BAND[(o.c2 + 1) % HALL_BAND.length], 'tarp');
  c.restore();
}

// ---------- Mauer ----------

/** Mauer ums Fabrikgelände: Betonfelder zwischen Pfeilern, Abdeckung, Stacheldraht; von hinten nach vorn gemalt. */
function paintWall(g, o) {
  const f = frameOf(o.long);
  const { a0, a1, b0, b1 } = o;
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  const H = 17;
  const t0 = b0 + (b1 - b0) * 0.25;
  const t1 = b1 - (b1 - b0) * 0.25;
  shadow(g, ...R(a0, a1, t0, t1), H, 0.16);
  const n = Math.max(1, Math.round((a1 - a0) / 26));
  const step = (a1 - a0) / n;
  const pier = (a) => box(g, ...R(a - 1.8, a + 1.8, b0 + 1.4, b1 - 1.4), 0, H + 2, tint(CONC, 0.06), tint(CONC, 0.2));
  for (let k = 0; k <= n; k++) {
    const a = a0 + k * step;
    if (k > 0) {
      const s0 = a - step + 1.8;
      const s1 = a - 1.8;
      box(g, ...R(s0, s1, t0, t1), 0, H, CONC, tint(CONC, 0.12));
      if (g.fine) {
        const pt = onFace(g, f.side, t1);
        for (const h of [5.6, 11.3]) stroke(g, [pt(s0, h), pt(s1, h)], 'rgba(0,0,0,0.1)', 0.45);
        for (const h of [H + 1.2, H + 2.6]) stroke(g, [pf(g, f, s0, (t0 + t1) / 2, h), pf(g, f, s1, (t0 + t1) / 2, h)], 'rgba(70,74,78,0.7)', 0.35);
      }
    }
    pier(Math.min(a1 - 1.8, Math.max(a0 + 1.8, a)));
  }
}

function wallTop(c, o) {
  const L = o.long === 'u';
  const { x0, x1, y0, y1 } = o;
  const [t0, t1] = L ? [y0 + (y1 - y0) * 0.25, y1 - (y1 - y0) * 0.25] : [x0 + (x1 - x0) * 0.25, x1 - (x1 - x0) * 0.25];
  if (L) {
    rectF(c, x0 + 4, t0 + 4, x1 + 4, t1 + 4, 'rgba(0,0,0,0.25)');
    rectS(c, x0, t0, x1, t1, shade(CONC, 0.08), 'rgba(0,0,0,0.45)', 0.5);
  } else {
    rectF(c, t0 + 4, y0 + 4, t1 + 4, y1 + 4, 'rgba(0,0,0,0.25)');
    rectS(c, t0, y0, t1, y1, shade(CONC, 0.08), 'rgba(0,0,0,0.45)', 0.5);
  }
  const [s0, s1] = L ? [x0, x1] : [y0, y1];
  const n = Math.max(1, Math.round((s1 - s0) / 26));
  for (let k = 0; k <= n; k++) {
    const a = Math.min(s1 - 1.8, Math.max(s0 + 1.8, s0 + ((s1 - s0) * k) / n));
    if (L) rectS(c, a - 1.8, y0 + 1.4, a + 1.8, y1 - 1.4, CONC, 'rgba(0,0,0,0.5)', 0.4);
    else rectS(c, x0 + 1.4, a - 1.8, x1 - 1.4, a + 1.8, CONC, 'rgba(0,0,0,0.5)', 0.4);
  }
}

// ---------- Zug ----------

/** Liegender Zylinder entlang a (Kessel): Mitte (b = 0, h = hc), Radius r, von a0 bis a1, mit Stirnboden bei a1. */
function barrel(g, f, a0, a1, hc, r, color) {
  const N = 14;
  const P = (a, t) => pf(g, f, a, r * Math.cos(t), hc + r * Math.sin(t));
  for (let k = 0; k < N; k++) {
    const t0 = (k / N) * Math.PI * 2;
    const t1 = ((k + 1) / N) * Math.PI * 2;
    const tm = (t0 + t1) / 2;
    if (Math.cos(tm) + K * Math.sin(tm) <= 0) continue; // abgewandte Seite
    poly(g, [P(a0, t0), P(a1, t0), P(a1, t1), P(a0, t1)], lit(color, ...f.n(0, Math.cos(tm), Math.sin(tm))), null);
  }
  const cap0 = [];
  for (let k = 0; k < 20; k++) {
    const t = (k / 20) * Math.PI * 2;
    cap0.push(P(a1, t));
  }
  poly(g, cap0, lit(color, ...FACE[f.end]), OUTLINE);
  stroke(g, [P(a0, -Math.PI / 2 + 0.35), P(a1, -Math.PI / 2 + 0.35)], 'rgba(0,0,0,0.25)', 0.5);
}

/** Drehgestell mit zwei Radsätzen bei a (sichtbare Seite). */
function bogie(g, f, a, b, color = '#2a2c2f') {
  box(g, ...f.R(a - 9, a + 9, -b, b), 1.4, 6.4, color, shade(color, 0.1));
  for (const d of [-5, 5]) disc(g, f.side, b + 0.25, a + d, 3.4, 3, lit('#3b3e42', ...FACE[f.side]), 'rgba(0,0,0,0.6)', 0, 12);
}

/** Lok (rot), Containerwagen oder Kesselwagen, Länge entlang a. */
function zugteil(g, o) {
  const f = frameOf(o.long);
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  const L = 46; // halbe Länge
  shadow(g, ...R(-L, L, -12, 12), 26, 0.18);
  if (o.part === 'loco') {
    bogie(g, f, -27, 10);
    bogie(g, f, 27, 10);
    box(g, ...R(-L + 1, L - 1, -12.5, 12.5), 6.4, 9.4, '#3a3d41');
    for (const s of [-1, 1]) box(g, ...R(s > 0 ? L - 1 : -L - 0.6, s > 0 ? L + 0.6 : -L + 1, -9, -6), 7, 9, '#2a2c2f');
    for (const s of [-1, 1]) box(g, ...R(s > 0 ? L - 1 : -L - 0.6, s > 0 ? L + 0.6 : -L + 1, 6, 9), 7, 9, '#2a2c2f');
    const red = '#b8443a';
    box(g, ...R(-L + 2, L - 2, -11.5, 11.5), 9.4, 28, red, '#8d9296');
    wallBand(g, ...R(-L + 2, L - 2, -11.5, 11.5), 13.4, 15, '#e9e6de');
    // Führerstände: Fenster vorn und an der Seite
    const ep = onFace(g, f.end, L - 2);
    for (const [c0, c1] of [[-9.5, -1], [1, 9.5]]) poly(g, [ep(c0, 19.5), ep(c1, 19.5), ep(c1, 25.8), ep(c0, 25.8)], lit('#2c3a47', ...FACE[f.end]), 'rgba(230,230,225,0.6)');
    if (g.fine) for (const c0 of [-6, 6]) disc(g, f.end, L - 2, c0, 12, 1.1, '#f6efc8', null, 0.2, 8);
    winsAt(g, f.side, 11.5, [-L + 8, L - 8], [[19.5, 25.6]], 5.6, { frame: false, glass: '#2c3a47', lit: 0 });
    if (g.fine) {
      const sp = onFace(g, f.side, 11.5);
      for (let a = -26; a <= 26; a += 13) {
        poly(g, [sp(a - 5, 17), sp(a + 5, 17), sp(a + 5, 25), sp(a - 5, 25)], lit('#7b2c25', ...FACE[f.side]), null);
        for (let h = 18; h < 25; h += 1.4) stroke(g, [sp(a - 5, h), sp(a + 5, h)], 'rgba(0,0,0,0.25)', 0.4);
      }
      poly(g, [sp(-3, 10.5), sp(3, 10.5), sp(3, 12.6), sp(-3, 12.6)], lit('#f2efe6', ...FACE[f.side]), null);
    }
    box(g, ...R(-L + 8, L - 8, -9, 9), 28, 29.6, '#8d9296', '#9ca1a5');
    for (const a of [-14, 0, 14]) fan(sub(g, ...f.at(a, 0), 2.4, 29.6), 0, 0, 0, 1.8);
    return;
  }
  bogie(g, f, -30, 9.5);
  bogie(g, f, 30, 9.5);
  box(g, ...R(-L + 0.5, L - 0.5, -11, 11), 6.4, 9, '#34373b');
  if (o.part === 'tank') {
    const col = ['#3d4146', '#d8d6d0', '#5f6b74'][o.c % 3];
    barrel(g, f, -L + 4, L - 4, 19.5, 10.5, col);
    for (const a of [-L + 10, L - 10]) {
      const sp = onFace(g, f.side, 9);
      stroke(g, [sp(a, 9), sp(a, 13)], '#2a2c2f', 1.2);
    }
    box(g, ...R(-6, 6, -10.5, 10.5), 29.4, 30.2, '#5c5f63');
    const [du, dv] = f.at(0, 0);
    cyl(g, du, dv, 3.2, 28.6, 32.6, tint(col, 0.08));
    if (g.fine) {
      const sp = onFace(g, f.side, 10.6);
      poly(g, [sp(18, 17), sp(24, 17), sp(24, 21), sp(18, 21)], lit('#e58a2a', ...FACE[f.side]), 'rgba(0,0,0,0.5)');
      for (let h = 10; h < 29; h += 2.2) stroke(g, [sp(-5, h), sp(-3, h)], '#3a3c3f', 0.45);
    }
    return;
  }
  // Containerwagen: zwei Container in fester Farbe je Wagen
  const cs = [CONTAINER[o.c % CONTAINER.length], CONTAINER[(o.c + 3) % CONTAINER.length]];
  [[-L + 1, -0.8], [0.8, L - 1]].forEach(([c0, c1], i) => {
    const col = cs[i];
    box(g, ...R(c0, c1, -10.5, 10.5), 9, 30, col, tint(col, 0.1));
    if (g.fine) {
      const sp = onFace(g, f.side, 10.5);
      for (let a = c0 + 1.6; a < c1 - 0.5; a += 1.6) stroke(g, [sp(a, 9.6), sp(a, 29.4)], 'rgba(0,0,0,0.13)', 0.45);
      stroke(g, [sp(c0 + 0.4, 29.4), sp(c1 - 0.4, 29.4)], 'rgba(255,255,255,0.18)', 0.5);
      poly(g, [sp(c0 + 4, 24), sp(c0 + 13, 24), sp(c0 + 13, 27), sp(c0 + 4, 27)], lit('#f2efe6', ...FACE[f.side]), null);
      const ep = onFace(g, f.end, c1);
      for (const b of [-5.2, 0, 5.2]) stroke(g, [ep(b, 9.6), ep(b, 29.4)], 'rgba(0,0,0,0.25)', 0.5);
    }
  });
}

function trainTop(c, o) {
  const L = o.long === 'u';
  const RT = (a0, a1, b0, b1, fill, line = 'rgba(0,0,0,0.45)') => (L ? rectS(c, a0, b0, a1, b1, fill, line, 0.5) : rectS(c, b0, a0, b1, a1, fill, line, 0.5));
  const H = 46;
  if (L) rectF(c, -H + 3, -11 + 3, H + 3, 11 + 3, 'rgba(0,0,0,0.25)');
  else rectF(c, -11 + 3, -H + 3, 11 + 3, H + 3, 'rgba(0,0,0,0.25)');
  if (o.part === 'loco') {
    RT(-H + 2, H - 2, -11.5, 11.5, '#b8443a');
    RT(-H + 8, H - 8, -9, 9, '#8d9296');
    for (const a of [-14, 0, 14]) {
      const [x, y] = L ? [a, 0] : [0, a];
      circle(c, x, y, 3.6, '#5f6468');
      circle(c, x, y, 2.4, '#2b2f33');
    }
    RT(H - 8, H - 2, -9, 9, '#2c3a47');
    RT(-H + 2, -H + 8, -9, 9, '#2c3a47');
    return;
  }
  RT(-H + 0.5, H - 0.5, -11, 11, '#34373b');
  if (o.part === 'tank') {
    const col = ['#3d4146', '#d8d6d0', '#5f6b74'][o.c % 3];
    const g = L ? c.createLinearGradient(0, -10.5, 0, 10.5) : c.createLinearGradient(-10.5, 0, 10.5, 0);
    g.addColorStop(0, tint(col, 0.3));
    g.addColorStop(0.5, col);
    g.addColorStop(1, shade(col, 0.35));
    RT(-H + 4, H - 4, -10.5, 10.5, g);
    RT(-6, 6, -10.5, 10.5, '#5c5f63');
    circle(c, 0, 0, 3.2, tint(col, 0.1));
    return;
  }
  const cs = [CONTAINER[o.c % CONTAINER.length], CONTAINER[(o.c + 3) % CONTAINER.length]];
  RT(-H + 1, -0.8, -10.5, 10.5, cs[0]);
  RT(0.8, H - 1, -10.5, 10.5, cs[1]);
  c.strokeStyle = 'rgba(0,0,0,0.14)';
  c.lineWidth = 0.4;
  c.beginPath();
  for (let a = -H + 3; a < H - 1; a += 2.4) {
    if (Math.abs(a) < 1.2) continue;
    if (L) {
      c.moveTo(a, -10.5);
      c.lineTo(a, 10.5);
    } else {
      c.moveTo(-10.5, a);
      c.lineTo(10.5, a);
    }
  }
  c.stroke();
}

// ---------- Bahnhof und Bahnsteig (Karteneditor) ----------

/** Bahnhof: Empfangshalle mit Uhrgiebel und Rundbogenfenstern, zwei Flügel mit Walmdach, Vordach über dem Eingang. */
function paintStation(g, o) {
  const f = frameOf(o.long);
  const { a0, a1, b0, b1 } = o;
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  const wall = '#cdb894';
  const roof = '#7d4b3d';
  const am = (a0 + a1) / 2;
  const hw = Math.min(40, (a1 - a0) * 0.16);
  const wing = (x0, x1) => {
    const H = 26;
    shadow(g, ...R(x0, x1, b0 + 8, b1 - 8), H + 12);
    box(g, ...R(x0, x1, b0 + 8, b1 - 8), 0, H, wall);
    plinth(g, ...R(x0, x1, b0 + 8, b1 - 8), '#8d8574', 2);
    ledge(g, ...R(x0, x1, b0 + 8, b1 - 8), 13, 'rgba(0,0,0,0.15)');
    archWins(g, f.side, b1 - 8, spots(x0, x1, 11, 6), 3, 8.5, 4.2, { seed: o.seed });
    archWins(g, f.side, b1 - 8, spots(x0, x1, 11, 6), 15.5, 20.5, 4.2, { seed: o.seed + 1 });
    if (x1 >= a1 - 0.1) archWins(g, f.end, a1, spots(b0 + 8, b1 - 8, 11, 6), 3, 8.5, 4.2, { seed: o.seed + 2 });
    hip(g, ...R(x0, x1, b0 + 8, b1 - 8), H, 12, roof);
  };
  wing(a0, am - hw);
  // Empfangshalle (Mitte), höher, Giebel zur Längsseite mit Uhr
  const H = 38;
  shadow(g, ...R(am - hw, am + hw, b0, b1), H + 18);
  box(g, ...R(am - hw, am + hw, b0, b1), 0, H, wall);
  plinth(g, ...R(am - hw, am + hw, b0, b1), '#8d8574', 2);
  archWins(g, f.side, b1, spots(am - hw, am + hw, 13, 8), 3, 14, 7, { seed: o.seed + 3 });
  archWins(g, f.side, b1, spots(am - hw, am + hw, 13, 8), 21, 29, 6, { seed: o.seed + 4 });
  gable(g, f.cross, ...R(am - hw, am + hw, b0, b1), H, 18, roof, wall);
  const cp = onFace(g, f.side, b1);
  disc(g, f.side, b1, am, H + 7, 4.6, lit('#f2efe4', ...FACE[f.side]), '#333', 0.1, 18);
  if (g.fine) stroke(g, [cp(am, H + 7, 0.2), cp(am, H + 10, 0.2), cp(am, H + 7, 0.2), cp(am + 2.2, H + 7, 0.2)], '#222', 0.6);
  box(g, ...R(am - hw + 4, am + hw - 4, b1, b1 + 7), 15, 16.2, '#5f6a70', '#7d878d');
  for (const s of [-1, 1]) {
    const [u, v] = f.at(am + s * (hw - 6), b1 + 6);
    cyl(g, u, v, 0.8, 0, 15, '#4a5054');
  }
  wing(am + hw, a1);
}

/** Bahnsteig: Platte mit gelben Sicherheitsstreifen, Dach auf Stützen, Bänke, Schild. */
function paintPlatform(g, o) {
  const f = frameOf(o.long);
  const { a0, a1, b0, b1 } = o;
  const R = (x0, x1, y0, y1) => f.R(x0, x1, y0, y1);
  const H = 6;
  box(g, ...R(a0, a1, b0, b1), 0, H, '#a7a8a2', '#bdbdb6');
  for (const b of [b0 + 1.5, b1 - 2.8]) flat(g, ...R(a0 + 0.5, a1 - 0.5, b, b + 1.3), '#d9b73a', H + 0.05);
  const r0 = a0 + (a1 - a0) * 0.15;
  const r1 = a1 - (a1 - a0) * 0.15;
  const bm = (b0 + b1) / 2;
  const posts = spots(r0, r1, 36, 6);
  for (const a of posts) {
    const [u, v] = f.at(a, bm);
    cyl(g, u, v, 0.9, H, H + 24, '#4d5458');
  }
  for (const a of posts.slice(0, -1)) {
    const [u, v] = f.at(a + 9, bm + 3);
    if (g.fine) box(g, u - (f.L ? 4 : 1), u + (f.L ? 4 : 1), v - (f.L ? 1 : 4), v + (f.L ? 1 : 4), H, H + 2.4, '#8a6a45');
  }
  box(g, ...R(r0, r1, bm - 10, bm + 10), H + 24, H + 25.6, '#6f7f7a', snowy('#8fa29b'));
  const [su, sv] = f.at(r0 + 4, bm);
  box(g, su - 0.6, su + 0.6, sv - 0.6, sv + 0.6, H + 18, H + 22, '#2f5f9a');
}

// ---------- Wachturm der Karte (seit v5.43 gemalt; bis v5.42 ein vorgerendertes Bild) ----------
// Stahlgerüst aus vier leicht geneigten Beinen auf Betonfüßen mit Kreuzstreben in zwei Feldern, Plattform mit Gitterrost und
// Geländer, Kanzel mit Fensterband, grün umrandetes Flachdach mit Gerätehaus, Radar, zwei Antennen (rotes Licht) und
// Suchscheinwerfer; außen eine Stahltreppe mit Podest auf der Seite, die von der Kartenmitte weg zeigt. Iso: je Drehung ein Bild,
// Treppe und Dachaufbauten liegen fest in der Welt (wie in 2D). Grundfläche 80 × 80 (MAPGEN.town.towerSize), sonst skaliert.

const TW = { R0: 33, R1: 27.5, DK: 54, DT: 56.6, D: 38.5, C: 30.5, CH: 79, RO: 34, RT: 83.5, SI: 38.9, SO: 42.3, S0: -32, S1: 20, LD: 8 };
// Beine unten/oben, Plattform unten/oben und halbe Breite, Kanzel, Dach; Treppe außen von SI bis SO, steigt von S0 bis S1, Podest LD
const TW_LEG = '#4f585d';
const TW_DECK = '#5b6266';
const TW_GRATE = '#7a8186';
const TW_WALL = '#8b9284';
const TW_RIM = '#68854f';
const TW_ROOF = '#a2a89d';
const TW_GLASS = '#2c4152';
const TW_RAIL = '#3d4448';
const TW_SIDE = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // Welt-Seite nach außen: Süd, West, Nord, Ost
const VROT = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]]; // wie camera.js: Ansicht (u, v) aus Welt (x, y)
// Dachaufbauten in der Welt (ab Turmmitte): Gerätehaus [x0, x1, y0, y1], Radar, Antennen [x, y, Spitze], Scheinwerfer
const TW_HUT = [-15, 6, -21, -2];
const TW_RADAR = [-4.5, -11.5];
const TW_ANT = [[-29, -29, 112], [-29, 27, 101]];
const TW_LAMP = [27, 27];

/** Seite des Turms, die von der Kartenmitte weg zeigt (dort steht die Treppe): Index in TW_SIDE. */
function towerSide(b) {
  const dx = b.x - BALANCE.map.width / 2;
  const dy = b.y - BALANCE.map.height / 2;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 3 : 1;
  return dy >= 0 ? 0 : 2;
}

/** Stahlträger (Bein, Stütze) als Linie mit heller Lichtkante links. */
function beam(g, a, b, w, col) {
  const { ctx, z } = g;
  stroke(g, [a, b], shade(col, 0.2), w);
  const off = w * z * 0.22;
  ctx.beginPath();
  ctx.moveTo(a[0] - off, a[1]);
  ctx.lineTo(b[0] - off, b[1]);
  ctx.strokeStyle = tint(col, 0.22);
  ctx.lineWidth = Math.max(0.4, w * z * 0.38);
  ctx.stroke();
}

/** Geländer an einer Kante der Plattform (Ansichtsseite 'n', 's', 'e', 'w'), mit Lücke gap = [a0, a1] für die Treppe. */
function twRail(g, edge, gap) {
  const { P } = g;
  const E = TW.D - 0.6;
  const h0 = TW.DT;
  const pt = edge === 's' || edge === 'n' ? (a, h) => P(a, edge === 's' ? E : -E, h) : (a, h) => P(edge === 'e' ? E : -E, a, h);
  const col = edge === 'n' || edge === 'w' ? 'rgba(50,56,60,0.7)' : TW_RAIL;
  const runs = gap ? [[-E, gap[0]], [gap[1], E]] : [[-E, E]];
  for (const [a0, a1] of runs) {
    if (a1 - a0 < 0.5) continue;
    for (const h of [h0 + 3.1, h0 + 6.2]) stroke(g, [pt(a0, h), pt(a1, h)], col, 0.42);
    const n = Math.max(1, Math.round((a1 - a0) / 9));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      stroke(g, [pt(a, h0), pt(a, h0 + 6.2)], col, 0.45);
    }
  }
}

/** Außentreppe mit Podest auf der Ansichtsseite face ('s', 'e', 'n', 'w'); steigt entlang der Seite in Richtung dir (±1). */
function twStairs(g, face, dir) {
  const { P } = g;
  const { DT } = TW;
  const alongU = face === 's' || face === 'n';
  const sb = face === 's' || face === 'e' ? 1 : -1;
  const pt = alongU ? (a, b, h) => P(a, b, h) : (a, b, h) => P(b, a, h);
  const nf = alongU ? FACE.s : FACE.e;
  const bi = sb * TW.SI;
  const bo = sb * TW.SO;
  const bFar = Math.min(bi, bo);
  const bNear = Math.max(bi, bo);
  const a0 = dir * TW.S0; // Fuß der Treppe
  const a1 = dir * TW.S1; // oben, am Podest
  const hAt = (a) => (DT * (a - a0)) / (a1 - a0);
  const steel = '#5d666b';
  const stringer = (b) => poly(g, [pt(a0, b, 0), pt(a1, b, DT - 2.3), pt(a1, b, DT + 0.4), pt(a0, b, 0.6)], lit(steel, ...nf), OUTLINE);
  const rail = (b) => {
    for (const h of [4.4, 8.6]) stroke(g, [pt(a0, b, h), pt(a1, b, DT + h)], TW_RAIL, h > 5 ? 0.45 : 0.35);
    for (const t of [0.02, 0.34, 0.67, 0.98]) {
      const a = a0 + (a1 - a0) * t;
      stroke(g, [pt(a, b, hAt(a)), pt(a, b, hAt(a) + 8.6)], TW_RAIL, 0.45);
    }
  };
  const flight = () => {
    rail(bFar);
    stringer(bFar);
    const N = 14;
    const tread = lit('#8b9296', ...FACE.top);
    const nose = lit('#6b7377', ...(alongU ? FACE.e : FACE.s));
    for (let i = 1; i <= N; i++) {
      const a = a0 + ((a1 - a0) * i) / (N + 1);
      const h = hAt(a);
      poly(g, [pt(a - 1.55, bFar, h), pt(a + 1.55, bFar, h), pt(a + 1.55, bNear, h), pt(a - 1.55, bNear, h)], tread, null);
      poly(g, [pt(a + 1.55, bFar, h), pt(a + 1.55, bNear, h), pt(a + 1.55, bNear, h - 0.7), pt(a + 1.55, bFar, h - 0.7)], nose, null);
    }
    stringer(bNear);
    rail(bNear);
  };
  const landing = () => {
    const ae = a1 + dir * TW.LD;
    const l0 = Math.min(a1, ae);
    const l1 = Math.max(a1, ae);
    const am = a1 + dir * (TW.LD - 2.5);
    beam(g, pt(am, (bi + bo) / 2, 0), pt(am, (bi + bo) / 2, DT - 1.8), 1.5, TW_LEG); // Stütze
    if (alongU) box(g, l0, l1, bFar, bNear, DT - 1.8, DT, TW_DECK, snowy(TW_GRATE));
    else box(g, bFar, bNear, l0, l1, DT - 1.8, DT, TW_DECK, snowy(TW_GRATE));
    for (const h of [DT + 4.4, DT + 8.6]) stroke(g, [pt(a1, bo, h), pt(ae, bo, h), pt(ae, bi, h)], TW_RAIL, 0.42);
    for (const [a, b] of [[ae, bo], [ae, bi], [a1 + dir * 4, bo]]) stroke(g, [pt(a, b, DT), pt(a, b, DT + 8.6)], TW_RAIL, 0.45);
  };
  // die Seite mit größerem a liegt näher am Betrachter
  if (dir > 0) {
    flight();
    landing();
  } else {
    landing();
    flight();
  }
}

/** Wachturm isometrisch; o.rot = Drehung der Ansicht, o.side = Treppenseite in der Welt (Index in TW_SIDE). */
function wachturm(g, o) {
  const { P } = g;
  const { R0, R1, DK, DT, D, C, CH, RO, RT } = TW;
  const [ra, rb, rc, rd] = VROT[o.rot];
  const V = (x, y) => [ra * x + rb * y, rc * x + rd * y];
  const VR = ([x0, x1, y0, y1]) => {
    const [u0, v0] = V(x0, y0);
    const [u1, v1] = V(x1, y1);
    return [Math.min(u0, u1), Math.max(u0, u1), Math.min(v0, v1), Math.max(v0, v1)];
  };
  const [nx, ny] = TW_SIDE[o.side];
  const [nu, nv] = V(nx, ny);
  const [tu, tv] = V(ny, -nx); // Richtung, in der die Treppe steigt
  const face = nv > 0 ? 's' : nu > 0 ? 'e' : nv < 0 ? 'n' : 'w';
  const dir = face === 's' || face === 'n' ? tu : tv;
  const front = face === 's' || face === 'e';
  const g0 = dir * (TW.S1 - 0.5);
  const g1 = dir * (TW.S1 + TW.LD + 0.5);
  const gap = [Math.min(g0, g1), Math.max(g0, g1)];
  shadow(g, -D, D, -D, D, 80, 0.2);
  if (!front) twStairs(g, face, dir);
  // Gerüst: hintere Seiten, Füße und hintere Beine, vordere Seiten, vorderes Bein
  const rad = (h) => R0 + ((R1 - R0) * h) / DK;
  const L = (su, sv, h) => P(su * rad(h), sv * rad(h), h);
  const H0 = 2.6;
  const HM = 28;
  const braces = (a, b, back) => {
    const col = back ? 'rgba(58,64,68,0.75)' : '#4a5357';
    const w = back ? 0.6 : 0.85;
    for (const [h0, h1] of [[H0, HM], [HM, DK]]) {
      stroke(g, [L(...a, h0), L(...b, h1)], col, w);
      stroke(g, [L(...b, h0), L(...a, h1)], col, w);
    }
    stroke(g, [L(...a, HM), L(...b, HM)], col, w + 0.3);
  };
  braces([-1, -1], [1, -1], true);
  braces([-1, -1], [-1, 1], true);
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, su * R0 - 3.8, su * R0 + 3.8, sv * R0 - 3.8, sv * R0 + 3.8, 0, H0, '#a9a69c', snowy('#b8b5ab'));
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1]]) beam(g, L(su, sv, H0), L(su, sv, DK), 3.1, TW_LEG);
  braces([-1, 1], [1, 1], false);
  braces([1, -1], [1, 1], false);
  beam(g, L(1, 1, H0), L(1, 1, DK), 3.1, TW_LEG);
  // Plattform mit Gitterrost, Geländer hinten
  box(g, -D, D, -D, D, DK, DT, TW_DECK, snowy(TW_GRATE));
  if (g.fine) {
    for (let a = -D + 3; a < D; a += 3) {
      stroke(g, [P(a, -D, DT), P(a, D, DT)], 'rgba(40,46,50,0.16)', 0.18);
      stroke(g, [P(-D, a, DT), P(D, a, DT)], 'rgba(40,46,50,0.16)', 0.18);
    }
  }
  twRail(g, 'n', face === 'n' ? gap : null);
  twRail(g, 'w', face === 'w' ? gap : null);
  // Kanzel: Sockelband, Brüstung, Fensterband, Tür zur Treppe
  box(g, -C, C, -C, C, DT, CH, TW_WALL);
  wallBand(g, -C, C, -C, C, DT, DT + 1.4, '#686e63');
  wallBand(g, -C, C, -C, C, DT + 8.2, DT + 9, '#c9cec3');
  const at = [0, 1, 2, 3, 4, 5].map((i) => -C + (C / 3) * (i + 0.5));
  for (const f of ['s', 'e']) winsAt(g, f, C, at, [[DT + 9, CH - 2.6]], (C / 3) * 0.86, { glass: TW_GLASS, frame: '#5d6559', lit: 0 });
  wallBand(g, -C, C, -C, C, CH - 1.2, CH, '#767c70');
  if (front) {
    const pt = onFace(g, face, C);
    const a = dir * (TW.S1 + TW.LD / 2);
    poly(g, [pt(a - 3, DT), pt(a + 3, DT), pt(a + 3, DT + 8.1), pt(a - 3, DT + 8.1)], lit('#454c45', ...FACE[face]), OUTLINE);
    poly(g, [pt(a - 1.9, DT + 4.8), pt(a + 1.9, DT + 4.8), pt(a + 1.9, DT + 7.2), pt(a - 1.9, DT + 7.2)], lit(TW_GLASS, ...FACE[face]), null);
  }
  twRail(g, 's', face === 's' ? gap : null);
  twRail(g, 'e', face === 'e' ? gap : null);
  // Dach mit grünem Rand; Aufbauten nach Tiefe
  box(g, -RO, RO, -RO, RO, CH, RT, TW_RIM);
  parapet(g, -RO, RO, -RO, RO, RT, TW_RIM, TW_ROOF, 1.2);
  const items = [];
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cu = su * (RO - 1.2);
    const cv = sv * (RO - 1.2);
    items.push({ d: cu + cv, draw: () => box(g, cu - 1.2, cu + 1.2, cv - 1.2, cv + 1.2, RT, RT + 1.5, '#5e7847') });
  }
  const [h0, h1, h2, h3] = VR(TW_HUT);
  items.push({
    d: (h0 + h1 + h2 + h3) / 2,
    draw: () => {
      box(g, h0, h1, h2, h3, RT - 1.3, RT + 8.5, '#8e958a', snowy(TW_ROOF));
      if (g.fine) {
        for (const [f, pl, a0] of [['s', h3, h0], ['e', h1, h2]]) {
          const pt = onFace(g, f, pl);
          for (let k = 0; k < 4; k++) stroke(g, [pt(a0 + 2, RT + 2.4 + k * 1.1, 0.05), pt(a0 + 8, RT + 2.4 + k * 1.1, 0.05)], 'rgba(40,44,40,0.45)', 0.3); // Lüftung
        }
      }
      const [ru, rv] = V(...TW_RADAR);
      cyl(g, ru, rv, 1.4, RT + 8.5, RT + 11.1, '#5d6458');
      const [b0, b1, b2, b3] = VR([TW_RADAR[0] - 8, TW_RADAR[0] + 8, TW_RADAR[1] - 0.8, TW_RADAR[1] + 0.8]);
      box(g, b0, b1, b2, b3, RT + 11.1, RT + 13.3, '#d3d7d0', snowy('#dfe2dc'));
    },
  });
  for (const [x, y, top] of TW_ANT) {
    const [u, v] = V(x, y);
    items.push({
      d: u + v,
      draw: () => {
        box(g, u - 0.9, u + 0.9, v - 0.9, v + 0.9, RT - 1.3, RT + 0.8, '#4d5458');
        stroke(g, [P(u, v, RT), P(u, v, top)], '#3a4044', 0.55);
        if (g.fine) for (const h of [top - 9, top - 5]) stroke(g, [P(u - 2.2, v, h), P(u + 2.2, v, h)], '#3a4044', 0.35);
        const [lx, ly] = P(u, v, top + 0.6);
        circle(g.ctx, lx, ly, 1.1 * g.z, '#d8352b');
      },
    });
  }
  const [lu, lv] = V(...TW_LAMP);
  items.push({
    d: lu + lv,
    draw: () => {
      cyl(g, lu, lv, 1.2, RT - 1.3, RT + 2.2, '#4d5458');
      cyl(g, lu, lv, 2.4, RT + 2.2, RT + 5.6, '#59616a');
      const [ex, ey] = P(lu + 1.5, lv + 1.5, RT + 3.9);
      g.ctx.fillStyle = '#f4ecc8';
      g.ctx.beginPath();
      g.ctx.ellipse(ex, ey, 1.5 * g.z, 1.3 * g.z, 0, 0, Math.PI * 2);
      g.ctx.fill();
    },
  });
  items.sort((p, q) => p.d - q.d);
  for (const it of items) it.draw();
  if (front) twStairs(g, face, dir);
}

/** Wachturm von oben (2D, Welt-Einheiten ab der Mitte): Schatten, Treppe, Plattform mit Geländer, Dach mit Aufbauten. */
function towerTop(c, side) {
  const { D, RO } = TW;
  const [nx, ny] = TW_SIDE[side];
  const W = (a, b) => [a * ny + b * nx, -a * nx + b * ny]; // a entlang der Seite (Richtung der Treppe), b nach außen
  shadowTop(c, -D, -D, D, D, 80);
  for (const [x, y, top] of TW_ANT) lineT(c, [[x, y], [x + (top - TW.RT) * 0.5, y + (top - TW.RT) * 0.5]], 'rgba(0,0,0,0.22)', 0.9);
  // Treppe und Podest außen
  const { SI, SO, S0, S1, LD } = TW;
  polyF(c, [W(S0, SI), W(S1, SI), W(S1, SO), W(S0, SO)], '#5d666b');
  for (let i = 1; i <= 14; i++) {
    const a = S0 + ((S1 - S0) * i) / 15;
    polyF(c, [W(a - 1.55, SI + 0.2), W(a + 1.55, SI + 0.2), W(a + 1.55, SO - 0.2), W(a - 1.55, SO - 0.2)], '#9aa1a5');
  }
  polyF(c, [W(S1 - 0.5, D - 1), W(S1 + LD + 0.5, D - 1), W(S1 + LD + 0.5, SO), W(S1 - 0.5, SO)], snowy(TW_GRATE));
  lineT(c, [W(S0, SI), W(S1, SI)], TW_RAIL, 0.5);
  lineT(c, [W(S0, SO), W(S1 + LD + 0.5, SO), W(S1 + LD + 0.5, D)], TW_RAIL, 0.6);
  // Plattform mit Gitterrost und Geländer
  rectF(c, -D, -D, D, D, snowy(TW_GRATE));
  c.strokeStyle = 'rgba(40,46,50,0.18)';
  c.lineWidth = 0.25;
  c.beginPath();
  for (let a = -D + 3; a < D; a += 3) {
    c.moveTo(a, -D);
    c.lineTo(a, D);
    c.moveTo(-D, a);
    c.lineTo(D, a);
  }
  c.stroke();
  c.strokeStyle = TW_RAIL;
  c.lineWidth = 0.6;
  c.strokeRect(-D + 0.6, -D + 0.6, 2 * D - 1.2, 2 * D - 1.2);
  polyF(c, [W(S1 - 0.5, D - 1.4), W(S1 + LD + 0.5, D - 1.4), W(S1 + LD + 0.5, SI), W(S1 - 0.5, SI)], snowy(TW_GRATE)); // Durchgang zum Podest
  // Dach: Schatten auf dem Laufsteg, grüner Rand, helle Dachhaut mit Bahnen, Eckpfosten
  rectF(c, -RO + 2.5, -RO + 2.5, RO + 2.5, RO + 2.5, 'rgba(0,0,0,0.22)');
  rectS(c, -RO, -RO, RO, RO, TW_RIM, 'rgba(0,0,0,0.45)', 0.6);
  rectF(c, -RO + 1.2, -RO + 1.2, RO - 1.2, RO - 1.2, snowy(TW_ROOF));
  c.strokeStyle = 'rgba(0,0,0,0.08)';
  c.lineWidth = 0.4;
  c.beginPath();
  for (let a = -RO + 9; a < RO - 2; a += 9) {
    c.moveTo(a, -RO + 1.2);
    c.lineTo(a, RO - 1.2);
  }
  c.stroke();
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rectF(c, su * (RO - 1.2) - 1.2, sv * (RO - 1.2) - 1.2, su * (RO - 1.2) + 1.2, sv * (RO - 1.2) + 1.2, shade(TW_RIM, 0.25));
  // Gerätehaus mit Lüftung, Radar
  const [x0, x1, y0, y1] = TW_HUT;
  rectF(c, x0 + 3, y0 + 3, x1 + 3, y1 + 3, 'rgba(0,0,0,0.25)');
  rectS(c, x0, y0, x1, y1, snowy(TW_ROOF), 'rgba(0,0,0,0.4)', 0.5);
  rectF(c, x0 + 1, y0 + 1, x1 - 1, y0 + 2, 'rgba(255,255,255,0.18)');
  const [rx, ry] = TW_RADAR;
  rectF(c, rx - 7, ry + 0.4, rx + 9, ry + 2.4, 'rgba(0,0,0,0.25)');
  rectS(c, rx - 8, ry - 0.8, rx + 8, ry + 0.8, snowy('#dfe2dc'), 'rgba(0,0,0,0.4)', 0.4);
  circle(c, rx, ry, 1.4, '#5d6458');
  // Antennen mit rotem Licht, Scheinwerfer
  for (const [x, y] of TW_ANT) {
    circle(c, x, y, 1.3, '#3a4044');
    circle(c, x, y, 0.7, '#d8352b');
  }
  const [lx, ly] = TW_LAMP;
  circle(c, lx + 1.5, ly + 1.5, 2.6, 'rgba(0,0,0,0.25)');
  circle(c, lx, ly, 2.4, '#59616a');
  circle(c, lx + 0.4, ly + 0.4, 1.3, '#f4ecc8');
}


// ---------- Auswahl ----------

let fieldMap = null;
let fields = [];
const infos = new WeakMap();

/** Zu Beginn jedes Bilds (Renderer): Felder der Karte merken (Gehöfte erkennt man an den Äckern daneben). */
export function setMapTown(map) {
  if (fieldMap === map) return;
  fieldMap = map;
  fields = map?.town?.fields ?? [];
}

/** Aussehen eines Gebäudes der Karte (fest je Lage): Hausart und Farben, Hallendach, Wagenfarbe. */
function infoOf(b) {
  let o = infos.get(b);
  if (o) return o;
  const seed = hashXY(b.x, b.y);
  o = { seed, c: (seed >>> 9) % 6, c2: (seed >>> 5) % 4, vault: (seed >>> 13) % 4 === 0 };
  if (b.kind === 'house') {
    const near = fields.some((f) => Math.abs(f.x - b.x) < f.w / 2 + b.w / 2 + 140 && Math.abs(f.y - b.y) < f.h / 2 + b.h / 2 + 140);
    const inTown = Math.hypot(b.x - BALANCE.map.width / 2, b.y - BALANCE.map.height / 2) < BALANCE.zone.r + 60;
    const r = (seed >>> 4) % 100;
    if (near && !inTown) o.style = 'farm';
    else if (!inTown) o.style = r < 60 ? 'fach' : 'klinker';
    else o.style = r < 34 ? 'alt' : r < 64 ? 'klinker' : r < 84 ? 'neu' : 'fach';
  }
  infos.set(b, o);
  return o;
}

// ---------- Schnittstelle ----------

const q8 = (n) => Math.max(40, 8 * Math.floor((n - 4) / 8));

function isoBounds(u0, u1, v0, v1, h) {
  const pad = 4;
  return [(u0 - v1 - 11) * K - pad, (u0 + v0) * K * 0.5 - h - pad, (u1 - v0) * K + pad, (u1 + v1 + 11) * K * 0.5 + pad];
}

/** Iso: Bild key (bounds in Einheiten) am Ankerpunkt b, sonst direkt malen. */
function put(ctx, cam, b, key, bounds, paint) {
  const q = cam.worldToScreen(b.x, b.y);
  const z = cam.zoom;
  const dpr = spriteDpr();
  const e = sprite(key, z * dpr, bounds, (c, s) => paint(G(c, s)));
  if (e === false) return true; // wird im nächsten Bild gemalt
  if (e) {
    blit(ctx, e, q.x, q.y, z);
    return true;
  }
  ctx.save();
  ctx.translate(q.x, q.y);
  ctx.scale(1 / dpr, 1 / dpr);
  paint(G(ctx, z * dpr));
  ctx.restore();
  return true;
}

/** 2D: Bild key in Weltkoordinaten am Ankerpunkt (x, y) (Kamera-Transformation gesetzt). */
function putTop(ctx, x, y, zoom, key, bounds, paint) {
  const e = sprite(key, zoom * spriteDpr(), bounds, (c, s) => {
    c.scale(s, s);
    paint(c);
  });
  if (e === false) return true;
  if (e) {
    blit(ctx, e, x, y, 1);
    return true;
  }
  ctx.save();
  ctx.translate(x, y);
  paint(ctx);
  ctx.restore();
  return true;
}

const PAINTERS = { hall: paintHall, factory: paintFactory, wall: paintWall, station: paintStation, platform: paintPlatform };
const TALL = { hall: 44, factory: 122, wall: 22, station: 60, platform: 34 };

/** Iso: Gebäude b der Karte gemalt; false = nicht hier (schräger Zug oder Bahnsteig). */
export function drawMapIso(ctx, cam, b) {
  if ((b.kind === 'train' || b.kind === 'platform') && b.angle) return false;
  const odd = cam.rot % 2 === 1;
  const info = infoOf(b);
  const snow = roofSnowOn() ? 1 : 0;
  if (b.kind === 'tower') {
    // Wachturm (seit v5.43): je Drehung ein Bild, Treppe auf der Seite weg von der Kartenmitte
    const k = Math.round(((b.w || 80) / 80) * 20) / 20 || 1;
    const rot = cam.rot | 0;
    const side = towerSide(b);
    const R = 43 * k;
    return put(ctx, cam, b, `mtw|${rot}|${side}|${k}|${snow}`, isoBounds(-R, R, -R, R, 115 * k), (g) => wachturm(k === 1 ? g : sub(g, 0, 0, k), { rot, side }));
  }
  if (b.kind === 'train') {
    const long = odd ? 'v' : 'u';
    const o = { ...info, long, part: b.part };
    return put(ctx, cam, b, `mz|${b.part}|${info.c}|${long}|${snow}`, isoBounds(-50, 50, -50, 50, 36), (g) => zugteil(g, o));
  }
  if (b.kind === 'house') {
    const W = q8(odd ? b.h : b.w);
    const D = q8(odd ? b.w : b.h);
    const A = Math.max(W, D);
    const B = Math.min(W, D);
    const o = { ...info, long: W >= D ? 'u' : 'v', a0: -A / 2, a1: A / 2, b0: -B / 2, b1: B / 2 };
    const paint = HOUSE_STYLES[info.style];
    return put(ctx, cam, b, `mh|${info.style}|${info.c}|${W}|${D}|${snow}`, isoBounds(-W / 2 - 2, W / 2 + 2, -D / 2 - 2, D / 2 + 2, HOUSE_TALL[info.style] + 4), (g) => paint(g, o));
  }
  const paint = PAINTERS[b.kind];
  if (!paint) return false;
  const W = odd ? b.h : b.w;
  const D = odd ? b.w : b.h;
  const A = Math.max(W, D);
  const B = Math.min(W, D);
  const m = b.kind === 'wall' || b.kind === 'platform' ? 0 : 2;
  const o = { ...info, long: W >= D ? 'u' : 'v', a0: -A / 2 + m, a1: A / 2 - m, b0: -B / 2 + m, b1: B / 2 - m };
  const key = `m${b.kind}|${info.c}|${info.c2}|${info.vault ? 1 : 0}|${W}|${D}|${snow}`;
  return put(ctx, cam, b, key, isoBounds(-W / 2 - 2, W / 2 + 2, -D / 2 - 2, D / 2 + 2, TALL[b.kind]), (g) => paint(g, o));
}

/** 2D: Gebäude b der Karte von oben (Weltkoordinaten, Kamera-Transformation gesetzt); false = nicht hier (schräg). */
export function drawMapTop(ctx, b, zoom) {
  const info = infoOf(b);
  const snow = roofSnowOn() ? 1 : 0;
  let W = b.w;
  let D = b.h;
  let paint;
  if (b.kind === 'tower') {
    const k = Math.round(((b.w || 80) / 80) * 20) / 20 || 1;
    const side = towerSide(b);
    return putTop(ctx, b.x, b.y, zoom, `mttw|${side}|${k}|${snow}`, [-45 * k, -45 * k, 60 * k, 60 * k], (c) => {
      if (k !== 1) c.scale(k, k);
      towerTop(c, side);
    });
  }
  if (b.kind === 'house') {
    W = q8(b.w);
    D = q8(b.h);
    paint = (c, o) => houseTop(c, o);
  } else if (b.kind === 'train') paint = (c, o) => trainTop(c, { ...o, part: b.part, long: 'u' });
  else paint = { hall: hallTop, factory: factoryTop, wall: wallTop, station: stationTop, platform: platformTop }[b.kind];
  if (!paint) return false;
  const m = b.kind === 'hall' || b.kind === 'factory' || b.kind === 'station' ? 2 : 0;
  const o = { ...info, long: W >= D ? 'u' : 'v', x0: -W / 2 + m, x1: W / 2 - m, y0: -D / 2 + m, y1: D / 2 - m };
  const key = `mt${b.kind}|${b.part ?? ''}|${info.style ?? ''}|${info.c}|${info.c2}|${info.vault ? 1 : 0}|${W}|${D}|${snow}`;
  const bounds = [-W / 2 - 3, -D / 2 - 3, W / 2 + 18, D / 2 + 18];
  if (!b.angle) return putTop(ctx, b.x, b.y, zoom, key, bounds, (c) => paint(c, o));
  // schräger Zug oder Bahnsteig (Editor): dasselbe Bild, gedreht
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);
  putTop(ctx, 0, 0, zoom, key, bounds, (c) => paint(c, o));
  ctx.restore();
  return true;
}

function stationTop(c, o) {
  const L = o.long === 'u';
  const { x0, x1, y0, y1 } = o;
  shadowTop(c, x0, y0, x1, y1, 40);
  const roof = snowy('#7d4b3d');
  const [a0, a1] = L ? [x0, x1] : [y0, y1];
  const am = (a0 + a1) / 2;
  const hw = Math.min(40, (a1 - a0) * 0.16);
  if (L) {
    hipTop(c, x0, y0 + 8, am - hw, y1 - 8, roof);
    hipTop(c, am + hw, y0 + 8, x1, y1 - 8, roof);
    gableTop(c, am - hw, y0, am + hw, y1, 'v', roof);
    rectS(c, am - hw + 4, y1, am + hw - 4, y1 + 7, '#7d878d');
  } else {
    hipTop(c, x0 + 8, y0, x1 - 8, am - hw, roof);
    hipTop(c, x0 + 8, am + hw, x1 - 8, y1, roof);
    gableTop(c, x0, am - hw, x1, am + hw, 'u', roof);
    rectS(c, x1, am - hw + 4, x1 + 7, am + hw - 4, '#7d878d');
  }
}

function platformTop(c, o) {
  const L = o.long === 'u';
  const { x0, x1, y0, y1 } = o;
  rectS(c, x0, y0, x1, y1, '#a7a8a2');
  const e = 1.4;
  if (L) {
    rectF(c, x0, y0 + 1.5, x1, y0 + 1.5 + e, '#d9b73a');
    rectF(c, x0, y1 - 1.5 - e, x1, y1 - 1.5, '#d9b73a');
    const r = (x1 - x0) * 0.15;
    rectF(c, x0 + r + 3, y0 + 5, x1 - r + 3, y1 - 1, 'rgba(0,0,0,0.2)');
    rectS(c, x0 + r, y0 + 2, x1 - r, y1 - 2, snowy('#8fa29b'));
  } else {
    rectF(c, x0 + 1.5, y0, x0 + 1.5 + e, y1, '#d9b73a');
    rectF(c, x1 - 1.5 - e, y0, x1 - 1.5, y1, '#d9b73a');
    const r = (y1 - y0) * 0.15;
    rectF(c, x0 + 5, y0 + r + 3, x1 - 1, y1 - r + 3, 'rgba(0,0,0,0.2)');
    rectS(c, x0 + 2, y0 + r, x1 - 2, y1 - r, snowy('#8fa29b'));
  }
}

// ---------- Parks ----------

const decoCache = new WeakMap();
/** Bänke und Bäume eines Parks (terrain.js parkDeco), je Park einmal berechnet. */
export function parkDecoOf(p) {
  let d = decoCache.get(p);
  if (!d) decoCache.set(p, (d = parkDeco(p)));
  return d;
}

/** Gleise, die den Park p schneiden: Band (Richtung, Abstand der Mitte) zum Aussparen. */
function railCuts(p, rails) {
  const out = [];
  for (const r of rails) {
    const len = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
    if (len < 1) continue;
    const dx = (r.x2 - r.x1) / len;
    const dy = (r.y2 - r.y1) / len;
    const t = (p.x - r.x1) * dx + (p.y - r.y1) * dy;
    if (t < -p.r || t > len + p.r) continue;
    const d = (p.x - r.x1) * -dy + (p.y - r.y1) * dx;
    if (Math.abs(d) < p.r + 24) out.push({ dx, dy, d });
  }
  return out;
}

const FLOWERS = ['#d8473f', '#f0c23a', '#9b5fc0', '#f2efe6', '#e06a9a'];

/** Park von oben, Mitte im Ursprung: Rasen mit Mähstreifen, Hecke, Rundweg, Wege, Blumenbeete, Mitte mit Brunnen oder Beet. */
function parkPaint(c, p, o) {
  const r = p.r;
  const winter = o.season === 'winter';
  const lawn = winter ? '#e3e8eb' : o.season === 'autumn' ? '#8c9b56' : '#7f9f56';
  const gravel = winter ? '#c9cdcf' : '#d9cca8';
  const edge = winter ? '#aeb4b7' : '#b4a47c';
  c.save();
  if (o.cuts.length) {
    // Gleise aussparen: Rechteck außen, Bänder innen, gerade-ungerade-Regel
    c.beginPath();
    c.rect(-r - 4, -r - 4, 2 * r + 8, 2 * r + 8);
    for (const { dx, dy, d } of o.cuts) {
      const nx = -dy;
      const ny = dx;
      const L = r + 10;
      const pts = [[-L, -d - 24], [L, -d - 24], [L, -d + 24], [-L, -d + 24]].map(([a, b]) => [a * dx + b * nx, a * dy + b * ny]);
      c.moveTo(...pts[0]);
      for (const q of pts.slice(1)) c.lineTo(...q);
      c.closePath();
    }
    c.clip('evenodd');
  }
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fillStyle = lawn;
  c.fill();
  if (!winter) {
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255,255,230,0.06)';
    for (let y = -r; y < r; y += 28) c.fillRect(-r, y, 2 * r, 14);
    c.restore();
  }
  c.lineCap = 'butt';
  c.strokeStyle = winter ? '#cfd8d2' : '#4f7a3a';
  c.lineWidth = 6;
  c.beginPath();
  c.arc(0, 0, r - 3, 0, Math.PI * 2);
  c.stroke();
  const rp = r * 0.55;
  const rc = o.center ? 30 : 0;
  const way = (pts, w) => {
    for (const [col, lw] of [[edge, w + 1.6], [gravel, w]]) {
      c.strokeStyle = col;
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(...pts[0]);
      c.lineTo(...pts[1]);
      c.stroke();
    }
  };
  for (let k = 0; k < 4; k++) {
    const a = o.a0 + Math.PI / 4 + (k * Math.PI) / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    way([[ca * (rc || rp), sa * (rc || rp)], [ca * (r + 1), sa * (r + 1)]], 9);
  }
  for (const [col, lw] of [[edge, 12.6], [gravel, 11]]) {
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    c.arc(0, 0, rp, 0, Math.PI * 2);
    c.stroke();
  }
  // Blumenbeete innen am Rundweg, zwischen den Wegen
  if (!winter) {
    for (let k = 0; k < 4; k++) {
      const a = o.a0 + (k * Math.PI) / 2;
      for (let j = -3; j <= 3; j++) {
        const t = a + j * 0.075;
        const x = Math.cos(t) * (rp - 12);
        const y = Math.sin(t) * (rp - 12);
        circle(c, x, y, 2.6, '#5f8a3e');
        circle(c, x, y, 1.6, FLOWERS[(o.seed + k + j + 3) % FLOWERS.length]);
      }
    }
  }
  if (o.center === 'fountain') {
    circle(c, 0, 0, 30, winter ? '#d0d3d4' : '#d6cfbf');
    c.strokeStyle = 'rgba(0,0,0,0.08)';
    c.lineWidth = 0.6;
    for (const rr of [24, 28]) {
      c.beginPath();
      c.arc(0, 0, rr, 0, Math.PI * 2);
      c.stroke();
    }
    circle(c, 1.5, 1.5, 20, 'rgba(0,0,0,0.18)');
    circle(c, 0, 0, 20, '#c9c2b2');
    const wg = c.createRadialGradient(-5, -5, 2, 0, 0, 17);
    wg.addColorStop(0, winter ? '#dfe9ef' : '#8cc0de');
    wg.addColorStop(1, winter ? '#b9cbd6' : '#4f86ad');
    circle(c, 0, 0, 16.6, wg);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 0.7;
    for (const rr of [9, 13]) {
      c.beginPath();
      c.arc(0, 0, rr, 0, Math.PI * 2);
      c.stroke();
    }
    circle(c, 0, 0, 5.5, '#c9c2b2');
    circle(c, 0, 0, 2.6, '#f4f8fb');
  } else if (o.center === 'bed') {
    circle(c, 1.5, 1.5, 22, 'rgba(0,0,0,0.15)');
    circle(c, 0, 0, 22, winter ? '#eef1f3' : '#6b4f36');
    if (!winter) {
      for (const [rr, n, col] of [[17.5, 22, FLOWERS[o.seed % 5]], [12.5, 16, FLOWERS[(o.seed + 1) % 5]], [7.5, 10, FLOWERS[(o.seed + 2) % 5]]]) {
        for (let k = 0; k < n; k++) {
          const t = (k / n) * Math.PI * 2;
          circle(c, Math.cos(t) * rr, Math.sin(t) * rr, 1.9, col);
        }
      }
      circle(c, 0, 0, 4, '#4f7e3a');
    }
  }
  c.restore();
}

/** Park p als Bodenbild: in 2D mit der Kamera-Transformation, iso mit der Bodentransformation (beide in Weltkoordinaten). */
export function drawPark(ctx, p, zoom, season, rails) {
  const cuts = railCuts(p, rails);
  const seed = hashXY(p.x, p.y);
  const centerFree = cuts.every((q) => Math.abs(q.d) > 46);
  const center = !centerFree ? null : seed % 3 === 0 ? 'bed' : 'fountain';
  const d = parkDecoOf(p);
  const b0 = d.benches[0];
  const a0 = b0 ? Math.atan2(b0.y - p.y, b0.x - p.x) : 0;
  const s = season === 'winter' || season === 'autumn' ? season : 'summer';
  const key = `pk|${Math.round(p.x)}|${Math.round(p.y)}|${p.r}|${s}`;
  putTop(ctx, p.x, p.y, zoom, key, [-p.r - 4, -p.r - 4, p.r + 4, p.r + 4], (c) => parkPaint(c, p, { cuts, center, a0, seed, season: s }));
}

// ---------- 2D: Kartenstadt über dem Gelände ----------

function benchTop(c, b) {
  c.save();
  c.translate(b.x, b.y);
  c.rotate(b.a);
  rectF(c, -9 + 1.5, -3 + 1.5, 9 + 1.5, 3 + 1.5, 'rgba(0,0,0,0.22)');
  rectS(c, -9, -3, 9, 3, '#8a6a45', 'rgba(0,0,0,0.5)', 0.5);
  rectF(c, -9, -3, 9, -1.4, '#5e4630');
  c.restore();
}

/**
 * 2D (seit v5.23): Parks, Gebäude, Bänke, Stadtbäume und geparkte Autos der Karte über dem Geländebild (das sie nicht mehr enthält).
 * Weltkoordinaten, Kamera-Transformation gesetzt; gone(x, y) = Baum gefällt (Räumen), ruined(b) = Haus ist Trümmer (die malt der
 * Renderer).
 */
export function drawMapTown2D(ctx, town, inRect, zoom, season, gone, ruined) {
  if (!town) return;
  const rails = railList(town);
  for (const p of town.parks ?? []) if (inRect(p.x, p.y, p.r)) drawPark(ctx, p, zoom, season, rails);
  for (const b of town.buildings ?? []) {
    if (!inRect(b.x, b.y, Math.max(b.w, b.h) / 2 + 20) || ruined(b)) continue;
    drawMapTop(ctx, b, zoom);
  }
  for (const p of town.parks ?? []) {
    if (!inRect(p.x, p.y, p.r)) continue;
    const d = parkDecoOf(p);
    for (const b of d.benches) if (!drawBenchTop(ctx, b, zoom, season)) benchTop(ctx, b); // gemalt (props.js, seit v5.43)
    for (const t of d.trees) if (!drawTreeTop(ctx, t, season, zoom)) townTree(ctx, t, season); // gemalt (nature.js, seit v5.28)
  }
  for (const t of town.trees ?? []) if (inRect(t.x, t.y, t.r) && !gone(t.x, t.y) && !drawTreeTop(ctx, t, season, zoom)) townTree(ctx, t, season);
}

/** 2D: parkende Autos der Karte, nach den Straßen der Stadt (sonst lägen sie darunter, wie bis v5.22); gemalt seit v5.43 (props.js). */
export function drawMapCars2D(ctx, town, inRect, zoom = 1, season = 'summer') {
  for (const c of town?.cars ?? []) {
    if (!inRect(c.x, c.y, 30) || drawMapCarTop(ctx, c, zoom, season)) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(4.2, 4.2);
    carTop(ctx, 0, 0, c.vertical ? 'v' : 'u', c.color);
    ctx.restore();
  }
}

// Kronen von oben je Jahreszeit (2D): Herbst wie die Iso-Bäume (iso.js), Winter mit Schnee (LEAF_SNOW)
const LEAF_AUTUMN = [['#d0a24e', '#a8652b', '#5e3418'], ['#dcb650', '#b38a2e', '#6a4a1c'], ['#bd7a3c', '#8d4c1e', '#55301a']];

function townTree(c, t, season) {
  const k = hashXY(t.x, t.y) % 3;
  const L = season === 'winter' ? LEAF_SNOW : season === 'autumn' ? LEAF_AUTUMN[k] : LEAF[k];
  const { x, y, r } = t;
  circle(c, x + r * 0.45, y + r * 0.45, r, 'rgba(0,0,0,0.25)');
  const grad = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  grad.addColorStop(0, L[0]);
  grad.addColorStop(0.6, L[1]);
  grad.addColorStop(1, L[2]);
  circle(c, x, y, r, grad);
}

// ---------- Minimap ----------

const MINI = { house: '#a4604a', hall: '#8d949a', factory: '#6d7277', tower: '#4d565a', wall: '#a29f94', train: '#b3423a', station: '#c4b28f', platform: '#a7a8a2' };

const MINI_PARK = { summer: '#6f8f4f', autumn: '#80894c', winter: '#dde3e6' };

/** Minimap: Parks und Gebäude der Karte als Flächen (je Farbe ein Pfad); Weltkoordinaten, Transformation gesetzt. */
export function drawMapTownMini(ctx, town, season = 'summer') {
  if (!town) return;
  ctx.fillStyle = MINI_PARK[season] ?? MINI_PARK.summer;
  ctx.beginPath();
  for (const p of town.parks ?? []) {
    ctx.moveTo(p.x + p.r, p.y);
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  }
  ctx.fill();
  for (const [kind, col] of Object.entries(MINI)) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (const b of town.buildings ?? []) if (b.kind === kind) ctx.rect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    ctx.fill();
  }
}
