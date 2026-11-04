// Stadtgebäude 1 × 1 (seit v5.14, PRD §15): Wohnen, Gewerbe, Markt, Rechenzentrum, Krankenhaus, Heliport und die Förderanlagen
// (Holzfäller, Steinbruch, Erzmine, Ölquelle), jedes mit eigenem Aussehen je Ausbaustufe, in 2D (von oben) und isometrisch.
//   Wohnen:  Einfamilienhaus mit Garten und Garage → Doppelhaus mit Balkonen → Wohnblock mit fünf Geschossen
//   Gewerbe: Laden mit Markise und Café-Tischen → Geschäftshaus mit zwei Läden → Bürohochhaus aus Glas
//   Markt:   Wochenmarkt mit Ständen und Brunnen → Markthalle → Markthalle mit Uhrturm
//   Rechenzentrum, Krankenhaus, Heliport und die Förderanlagen wachsen mit der Stufe (mehr Technik, mehr Gebäude).
// Wohnen und Gewerbe gibt es in drei Farbvarianten (fest je Zelle). Wie Universität und Werke zeichnet die Iso-Ansicht für jede
// Drehung der Karte dasselbe Bild (Daniel dreht nie). Damit auch große Städte flüssig bleiben, wird jede Variante über
// spritecache.js einmal je Maßstab gemalt und danach nur noch kopiert.
// Örtliche Koordinaten: u = Welt-x, v = Welt-y ab der Zellmitte (Zelle ±32, Grundstücksrand ab ±27), h = Höhe. Iso sichtbar sind
// die Wand nach +v (links, Fläche 's'), die Wand nach +u (rechts, Fläche 'e') und das Dach; Licht von links oben.
// Nur Zeichnen: liest b = { x, y, ck, level, color, variant, dep } (ck = Zellenart der Stadt, dep = Vorkommen der Förderanlage).
import { ISO_K } from './camera.js';
import { poly, box, lit, FACE, OUTLINE, pyramid } from './university.js';
import { frustum, cyl, seam, coneRoof, cap, circle, ball } from './works.js';
import { shade, tint } from './sprites.js';
import { snowy, roofSnowOn } from './season.js';
import { sprite, blit, spriteFrame } from './spritecache.js';

/** Zellenarten, die hier gezeichnet werden (alle 1 × 1-Gebäude der Stadt). */
export const TOWN_KINDS = new Set(['res', 'com', 'market', 'dc', 'hospital', 'heliport', 'mine']);

const GLASS = '#34506d';
const WARM = '#f3d885';
const SILL = '#ece7dc';
const LAWN = '#86b35c';
const LAWN2 = '#92bd67';
const HEDGE = '#4f7e3a';
const PATH = '#dccfb2';
const PAVE = '#c4bdae';
const PLAZA = '#d3cab8';
const ASPH = '#676b66';
const DECK = '#8f8d86'; // Flachdach (Dachpappe, Kies)
const WHITE = '#eeece6';
const CAR_COLORS = ['#c0392b', '#2e5c8a', '#e8e4da', '#3d3d3d', '#d9a441', '#5b8a4e', '#8e9aa3'];
// Winter (wie die Bäume der Karte): Krone gedämpft dunkelgrün, oben Schnee
const LEAF_SNOW = ['#eef3f7', '#5f7766', '#33473a'];
const leaves = (t) => (roofSnowOn() ? LEAF_SNOW : LEAF[((t % 3) + 3) % 3]);
const LEAF = [
  ['#a3d273', '#5f9c41', '#2f5f25'],
  ['#b6d067', '#71993a', '#3f5f21'],
  ['#8fc77e', '#4c8b50', '#265a34'],
];
// Höhe des höchsten Punkts über der Zellmitte im Iso-Bild (Weltpixel, hinten stehende Teile zählen höher): Größe des Bilds
// und Höhe des Schilds darüber, je Art und Stufe (Förderanlagen je Vorkommen)
const TALL = {
  res: [0, 39, 41, 81],
  com: [0, 29, 56, 124],
  market: [0, 36, 32, 59],
  dc: [0, 28, 35, 84],
  hospital: [0, 31, 39, 47],
  heliport: [0, 39, 41, 43],
};
const MINE_TALL = { wood: [0, 40, 40, 40], stone: [0, 19, 19, 19], ore: [0, 44, 49, 55], oil: [0, 19, 24, 60] };
// Arten und Stufen, deren Bild die Teamfarbe zeigt (Fahnen, Bänder); nur diese bekommen je Team ein eigenes Bild
const TEAM_SHOWN = new Set(['com3', 'market3', 'dc3', 'mine:oil']);

const rnd = (n) => ((Math.imul(n | 0, 2654435761) >>> 0) % 1000) / 1000;
const clampLv = (lv) => Math.max(1, Math.min(3, lv | 0));

// ---------- Grundformen (isometrisch, örtliche Koordinaten) ----------

/** Zeichenkontext: s Gerätepixel je Einheit, Zellmitte im Ursprung. fine = genug Pixel für Feinheiten (Fensterrahmen, Ziegel). */
function G(ctx, s) {
  const k = ISO_K * s;
  return { ctx, z: s, fine: s >= 1.15, P: (u, v, h = 0) => [(u - v) * k, (u + v) * k * 0.5 - h * s] };
}

/** Punkt auf einer Wand: Fläche 's' (Ebene v = plane, Achse u) oder 'e' (Ebene u = plane, Achse v); off ragt aus der Wand. */
const onFace = (g, face, plane) => (face === 's' ? (a, h, off = 0) => g.P(a, plane + off, h) : (a, h, off = 0) => g.P(plane + off, a, h));

function stroke(g, pts, color = OUTLINE, w = 0.9) {
  const { ctx } = g;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.6, w * g.z);
  ctx.stroke();
}

/** Fläche am Boden (oder auf Höhe h). */
function flat(g, u0, u1, v0, v1, color, h = 0) {
  const { P } = g;
  poly(g, [P(u0, v0, h), P(u1, v0, h), P(u1, v1, h), P(u0, v1, h)], color, null);
}

/** Schatten nach links unten (wie Werke und Häuser der Karte): Grundriss, nach +v verlängert. */
function shadow(g, u0, u1, v0, v1, h, a = 0.2) {
  flat(g, u0 - 0.5, u1, v0, v1 + Math.min(11, h * 0.28) + 0.6, `rgba(0,0,0,${a})`);
}

/** Dunkler Sockel unten an beiden sichtbaren Wänden. */
function plinth(g, u0, u1, v0, v1, color, h = 1.6) {
  const { P } = g;
  poly(g, [P(u0, v1, 0), P(u1, v1, 0), P(u1, v1, h), P(u0, v1, h)], lit(shade(color, 0.3), ...FACE.s), null);
  poly(g, [P(u1, v0, 0), P(u1, v1, 0), P(u1, v1, h), P(u1, v0, h)], lit(shade(color, 0.3), ...FACE.e), null);
}

/** Waagrechte Linie rund um beide sichtbaren Wände (Geschossdecke, Gesims). */
function ledge(g, u0, u1, v0, v1, h, color = 'rgba(0,0,0,0.18)', w = 0.8) {
  const { P } = g;
  stroke(g, [P(u0, v1, h), P(u1, v1, h), P(u1, v0, h)], color, w);
}

/** Farbband auf beiden sichtbaren Wänden von h0 bis h1. */
function wallBand(g, u0, u1, v0, v1, h0, h1, color) {
  const { P } = g;
  poly(g, [P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1)], lit(color, ...FACE.s), null);
  poly(g, [P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1)], lit(color, ...FACE.e), null);
}

/** Fenster mit Rahmen und Spiegelung an den Stellen at (Mitte entlang der Wand), je Reihe [h0, h1]; manche warm beleuchtet. */
function winsAt(g, face, plane, at, rows, ww, o = {}) {
  const pt = onFace(g, face, plane);
  const glass = lit(o.glass ?? GLASS, ...FACE[face]);
  const warm = face === 's' ? WARM : shade(WARM, 0.16);
  const frame = o.frame === false ? null : lit(o.frame ?? SILL, ...FACE[face]);
  rows.forEach(([h0, h1], r) => {
    at.forEach((a, i) => {
      if (o.skip?.(i, r)) return;
      const x0 = a - ww / 2;
      const x1 = a + ww / 2;
      if (g.fine && frame) poly(g, [pt(x0 - 0.45, h0 - 0.6), pt(x1 + 0.45, h0 - 0.6), pt(x1 + 0.45, h1 + 0.45), pt(x0 - 0.45, h1 + 0.45)], frame, null);
      const on = rnd((o.seed ?? 0) + i * 31 + r * 17 + (face === 's' ? 0 : 7)) < (o.lit ?? 0.2);
      poly(g, [pt(x0, h0), pt(x1, h0), pt(x1, h1), pt(x0, h1)], on ? warm : glass, null);
      if (g.fine && !on) poly(g, [pt(x0, h1), pt(x0 + ww * 0.5, h1), pt(x0, h0 + (h1 - h0) * 0.35)], 'rgba(255,255,255,0.17)', null);
      if (o.cross && g.fine) stroke(g, [pt(a, h0), pt(a, h1)], 'rgba(235,232,224,0.8)', 0.5); // Fensterkreuz
      if (o.shutter) {
        poly(g, [pt(x0 - 1.5, h0), pt(x0 - 0.45, h0), pt(x0 - 0.45, h1), pt(x0 - 1.5, h1)], lit(o.shutter, ...FACE[face]), null);
        poly(g, [pt(x1 + 0.45, h0), pt(x1 + 1.5, h0), pt(x1 + 1.5, h1), pt(x1 + 0.45, h1)], lit(o.shutter, ...FACE[face]), null);
      }
    });
  });
}

/** n Fenster gleichmäßig zwischen a0 und a1. */
function wins(g, face, plane, a0, a1, n, rows, ww, o = {}) {
  const step = (a1 - a0) / n;
  winsAt(g, face, plane, Array.from({ length: n }, (_, i) => a0 + step * (i + 0.5)), rows, ww, o);
}

/** Tür mit hellem Rahmen. */
function door(g, face, plane, a, w, h, col = '#6a4a32') {
  const pt = onFace(g, face, plane);
  poly(g, [pt(a - w / 2 - 0.6, 0), pt(a + w / 2 + 0.6, 0), pt(a + w / 2 + 0.6, h + 0.6), pt(a - w / 2 - 0.6, h + 0.6)], lit(SILL, ...FACE[face]), null);
  poly(g, [pt(a - w / 2, 0), pt(a + w / 2, 0), pt(a + w / 2, h), pt(a - w / 2, h)], lit(col, ...FACE[face]), OUTLINE);
}

/** Schaufenster als Glasband mit Pfosten, Auslagen und Glastür bei doorAt. */
function storefront(g, face, plane, a0, a1, h0, h1, step, doorAt, seed = 0) {
  const pt = onFace(g, face, plane);
  poly(g, [pt(a0 - 0.5, h0 - 0.6), pt(a1 + 0.5, h0 - 0.6), pt(a1 + 0.5, h1 + 0.5), pt(a0 - 0.5, h1 + 0.5)], lit('#3c3f42', ...FACE[face]), null);
  poly(g, [pt(a0, h0), pt(a1, h0), pt(a1, h1), pt(a0, h1)], lit('#5a7f99', ...FACE[face]), null);
  if (g.fine) {
    // Auslagen: bunte Waren im unteren Teil, warmes Licht dahinter
    const n = Math.max(2, Math.round((a1 - a0) / 2.2));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
      if (doorAt !== null && Math.abs(a - doorAt) < 2.6) continue;
      const c = ['#e2b04a', '#c8574a', '#6aa35a', '#e8e2d2', '#4f86b8'][(seed + i * 3) % 5];
      poly(g, [pt(a - 0.7, h0), pt(a + 0.7, h0), pt(a + 0.7, h0 + 1.6 + rnd(seed + i) * 1.6), pt(a - 0.7, h0 + 1.6 + rnd(seed + i) * 1.6)], lit(c, ...FACE[face]), null);
    }
    poly(g, [pt(a0, h1), pt(a0 + (a1 - a0) * 0.3, h1), pt(a0, h0 + (h1 - h0) * 0.2)], 'rgba(255,255,255,0.14)', null);
  }
  const segs = [];
  for (let a = a0 + step; a < a1 - 0.5; a += step) segs.push(a);
  for (const a of segs) stroke(g, [pt(a, h0), pt(a, h1)], 'rgba(40,44,48,0.7)', 0.6);
  if (doorAt !== null) {
    poly(g, [pt(doorAt - 1.7, 0), pt(doorAt + 1.7, 0), pt(doorAt + 1.7, h1 - 0.8), pt(doorAt - 1.7, h1 - 0.8)], lit('#2a3c4a', ...FACE[face]), OUTLINE);
    if (g.fine) stroke(g, [pt(doorAt, 0), pt(doorAt, h1 - 0.8)], 'rgba(200,205,210,0.7)', 0.5);
  }
}

/** Satteldach über [u0,u1]×[v0,v1], Traufe auf h, First rh höher; axis = Richtung des Firsts, sichtbarer Giebel an u1 bzw. v1. */
function gable(g, axis, u0, u1, v0, v1, h, rh, roof, wall, extra = null, o = 1.6) {
  const { P } = g;
  const R = snowy(roof);
  const edge = shade(roof, 0.4);
  if (axis === 'u') {
    const vm = (v0 + v1) / 2;
    const w = (v1 - v0) / 2;
    const he = h - (o * rh) / w;
    const a0 = u0 - 0.8;
    const a1 = u1 + 0.8;
    poly(g, [P(a0, v0 - o, he), P(a1, v0 - o, he), P(a1, vm, h + rh), P(a0, vm, h + rh)], lit(R, 0, -rh, w));
    extra?.();
    poly(g, [P(u1, v0, h), P(u1, v1, h), P(u1, vm, h + rh)], lit(wall, ...FACE.e));
    const front = [P(a0, vm, h + rh), P(a1, vm, h + rh), P(a1, v1 + o, he), P(a0, v1 + o, he)];
    poly(g, front, lit(R, 0, rh, w));
    if (g.fine) {
      for (const t of [0.25, 0.5, 0.75]) stroke(g, [P(a0, vm + (v1 + o - vm) * t, h + rh - (h + rh - he) * t), P(a1, vm + (v1 + o - vm) * t, h + rh - (h + rh - he) * t)], 'rgba(0,0,0,0.12)', 0.5);
    }
    stroke(g, [P(a1, v0 - o, he), P(a1, vm, h + rh), P(a1, v1 + o, he)], edge, 1.1);
  } else {
    const um = (u0 + u1) / 2;
    const w = (u1 - u0) / 2;
    const he = h - (o * rh) / w;
    const b0 = v0 - 0.8;
    const b1 = v1 + 0.8;
    poly(g, [P(u0 - o, b0, he), P(u0 - o, b1, he), P(um, b1, h + rh), P(um, b0, h + rh)], lit(R, -rh, 0, w));
    extra?.();
    poly(g, [P(u0, v1, h), P(u1, v1, h), P(um, v1, h + rh)], lit(wall, ...FACE.s));
    poly(g, [P(um, b0, h + rh), P(um, b1, h + rh), P(u1 + o, b1, he), P(u1 + o, b0, he)], lit(R, rh, 0, w));
    if (g.fine) {
      for (const t of [0.25, 0.5, 0.75]) stroke(g, [P(um + (u1 + o - um) * t, b0, h + rh - (h + rh - he) * t), P(um + (u1 + o - um) * t, b1, h + rh - (h + rh - he) * t)], 'rgba(0,0,0,0.12)', 0.5);
    }
    stroke(g, [P(u0 - o, b1, he), P(um, b1, h + rh), P(u1 + o, b1, he)], edge, 1.1);
  }
}

/** Walmdach über [u0,u1]×[v0,v1] (First entlang der längeren Seite); extra malt zwischen hinteren und vorderen Flächen. */
function hip(g, u0, u1, v0, v1, h, rh, roof, extra = null, o = 1.3) {
  const { P } = g;
  const R = snowy(roof);
  u0 -= o;
  u1 += o;
  v0 -= o;
  v1 += o;
  const he = h - 0.7;
  if (u1 - u0 >= v1 - v0) {
    const w = (v1 - v0) / 2;
    const vm = (v0 + v1) / 2;
    const r1 = P(u0 + w, vm, h + rh);
    const r2 = P(u1 - w, vm, h + rh);
    poly(g, [P(u0, v0, he), P(u1, v0, he), r2, r1], lit(R, 0, -rh, w));
    poly(g, [P(u0, v0, he), r1, P(u0, v1, he)], lit(R, -rh, 0, w));
    extra?.();
    poly(g, [P(u1, v0, he), P(u1, v1, he), r2], lit(R, rh, 0, w));
    poly(g, [P(u0, v1, he), r1, r2, P(u1, v1, he)], lit(R, 0, rh, w));
    stroke(g, [P(u1, v1, he), r2, r1], shade(roof, 0.35), 0.8);
  } else {
    const w = (u1 - u0) / 2;
    const um = (u0 + u1) / 2;
    const r1 = P(um, v0 + w, h + rh);
    const r2 = P(um, v1 - w, h + rh);
    poly(g, [P(u0, v0, he), P(u0, v1, he), r2, r1], lit(R, -rh, 0, w));
    poly(g, [P(u0, v0, he), r1, P(u1, v0, he)], lit(R, 0, -rh, w));
    extra?.();
    poly(g, [P(u0, v1, he), P(u1, v1, he), r2], lit(R, 0, rh, w));
    poly(g, [P(u1, v0, he), r1, r2, P(u1, v1, he)], lit(R, rh, 0, w));
    stroke(g, [P(u1, v1, he), r2, r1], shade(roof, 0.35), 0.8);
  }
}

/** Flachdach mit Attika: vertiefte Dachfläche und die zwei sichtbaren Innenseiten der Brüstung (nach dem Quader malen). */
function parapet(g, u0, u1, v0, v1, h, wall, deck = DECK, rim = 1.1) {
  const { P } = g;
  const a0 = u0 + rim;
  const a1 = u1 - rim;
  const b0 = v0 + rim;
  const b1 = v1 - rim;
  const d = h - 1.3;
  poly(g, [P(a0, b0, d), P(a1, b0, d), P(a1, b1, d), P(a0, b1, d)], lit(snowy(deck), ...FACE.top), null);
  poly(g, [P(a0, b0, d), P(a0, b1, d), P(a0, b1, h), P(a0, b0, h)], lit(wall, ...FACE.e), null);
  poly(g, [P(a0, b0, d), P(a1, b0, d), P(a1, b0, h), P(a0, b0, h)], lit(wall, ...FACE.s), null);
}

/** Balkon vor einer Wand: Platte, Brüstung (farbig) und Handlauf; a0…a1 entlang der Wand, d tief, Boden auf h. */
function balcony(g, face, plane, a0, a1, h, d, rail) {
  const p = onFace(g, face, plane);
  const side = face === 's' ? FACE.e : FACE.s;
  const slab = '#e3dfd5';
  poly(g, [p(a0, h, 0), p(a1, h, 0), p(a1, h, d), p(a0, h, d)], lit(slab, ...FACE.top), null);
  poly(g, [p(a0, h - 1, d), p(a1, h - 1, d), p(a1, h, d), p(a0, h, d)], lit(slab, ...FACE[face]), null);
  poly(g, [p(a1, h - 1, 0), p(a1, h - 1, d), p(a1, h, d), p(a1, h, 0)], lit(slab, ...side), null);
  const top = h + 4.2;
  poly(g, [p(a1, h, 0), p(a1, h, d), p(a1, top, d), p(a1, top, 0)], lit(rail, ...side), OUTLINE);
  poly(g, [p(a0, h, d), p(a1, h, d), p(a1, top, d), p(a0, top, d)], lit(rail, ...FACE[face]), OUTLINE);
  if (g.fine) stroke(g, [p(a0, top, d), p(a1, top, d), p(a1, top, 0)], 'rgba(245,245,240,0.85)', 0.6);
}

/** Markise mit Streifen (cols abwechselnd), ragt d vor die Wand und fällt dabei um drop; vorn ein Volant. */
function awning(g, face, plane, a0, a1, h, d, drop, cols, n = 8) {
  const p = onFace(g, face, plane);
  const nrm = face === 's' ? [0, drop, d] : [drop, 0, d];
  for (let i = 0; i < n; i++) {
    const b0 = a0 + ((a1 - a0) * i) / n;
    const b1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const c = cols[i % 2];
    poly(g, [p(b0, h, 0), p(b1, h, 0), p(b1, h - drop, d), p(b0, h - drop, d)], lit(c, ...nrm), null);
    poly(g, [p(b0, h - drop, d), p(b1, h - drop, d), p(b1, h - drop - 1.5, d), p(b0, h - drop - 1.5, d)], lit(c, ...FACE[face]), null);
  }
  stroke(g, [p(a0, h, 0), p(a0, h - drop, d), p(a0, h - drop - 1.5, d), p(a1, h - drop - 1.5, d), p(a1, h - drop, d), p(a1, h, 0)], OUTLINE, 0.7);
}

/** Laubbaum: Schatten, Stamm, Krone aus drei Kugeln (t wählt das Grün). */
function tree(g, u, v, s = 1, t = 0) {
  const { P, ctx, z } = g;
  const [gx, gy] = P(u, v, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(gx - 3 * s * z, gy + 1.6 * s * z, 8 * s * z, 4 * s * z, 0, 0, Math.PI * 2);
  ctx.fill();
  const [, ty] = P(u, v, 9 * s);
  ctx.strokeStyle = '#5a4030';
  ctx.lineWidth = Math.max(1, 1.9 * s * z);
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx, ty);
  ctx.stroke();
  const L = leaves(t);
  for (const [dx, dh, rr] of [[-2.7, 12.5, 5.6], [2.6, 13.5, 5.3], [0, 17, 6.2]]) {
    const [cx, cy] = P(u, v, dh * s);
    const R = rr * s * z;
    const X = cx + dx * s * z;
    const grad = ctx.createRadialGradient(X - R * 0.35, cy - R * 0.45, R * 0.1, X, cy, R * 1.1);
    grad.addColorStop(0, L[0]);
    grad.addColorStop(0.55, L[1]);
    grad.addColorStop(1, L[2]);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(X, cy, R, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Nadelbaum: drei gestapelte Kegel. */
function conifer(g, u, v, s = 1) {
  const { P, ctx, z } = g;
  const [gx, gy] = P(u, v, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(gx - 3 * s * z, gy + 1.5 * s * z, 6.5 * s * z, 3.2 * s * z, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(gx - 0.9 * s * z, gy - 5 * s * z, 1.8 * s * z, 5 * s * z);
  for (const [h0, h1, r] of [[3, 15, 6.4], [9, 21, 5], [15, 27, 3.6]]) {
    const [, y0] = P(u, v, h0 * s);
    const [, y1] = P(u, v, h1 * s);
    const R = r * s * z;
    const grad = ctx.createLinearGradient(gx - R, 0, gx + R, 0);
    grad.addColorStop(0, roofSnowOn() ? '#e8eff2' : '#5d9a52');
    grad.addColorStop(0.5, roofSnowOn() ? '#3d5c46' : '#2f6b3a');
    grad.addColorStop(1, '#1d4628');
    ctx.beginPath();
    ctx.moveTo(gx - R, y0);
    ctx.quadraticCurveTo(gx, y0 + R * 0.35, gx + R, y0);
    ctx.lineTo(gx, y1);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

/** Busch (eine flache Kugel). */
function bush(g, u, v, s = 1, t = 0) {
  const { P, ctx, z } = g;
  const [x, y] = P(u, v, 2.6 * s);
  const R = 3.8 * s * z;
  const L = leaves(t);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x - 1.5 * z, y + 2.6 * s * z, R, R / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  const grad = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R * 1.1);
  grad.addColorStop(0, L[0]);
  grad.addColorStop(0.6, L[1]);
  grad.addColorStop(1, L[2]);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y, R, R * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Auto (Kasten mit Kabine), along = 'u' oder 'v'. */
function car(g, u, v, along, color) {
  const [hu, hv] = along === 'u' ? [4.3, 2.1] : [2.1, 4.3];
  flat(g, u - hu, u + hu, v - hv, v + hv + 1.1, 'rgba(0,0,0,0.22)');
  box(g, u - hu, u + hu, v - hv, v + hv, 0.6, 3.1, color, tint(color, 0.08));
  const [cu, cv] = along === 'u' ? [2.4, 1.8] : [1.8, 2.4];
  const du = along === 'u' ? -0.5 : 0;
  const dv = along === 'u' ? 0 : -0.5;
  box(g, u + du - cu, u + du + cu, v + dv - cv, v + dv + cv, 3.1, 4.8, '#2c3a47', tint(color, 0.12));
}

/** Krankenwagen oder Lieferwagen: hoher Kasten mit Band, Fahrerhaus vorn (+u bzw. +v), optional Blaulicht. */
function van(g, u, v, along, color, band, light = false) {
  const [hu, hv] = along === 'u' ? [5, 2.3] : [2.3, 5];
  flat(g, u - hu, u + hu, v - hv, v + hv + 1.3, 'rgba(0,0,0,0.22)');
  box(g, u - hu, u + hu, v - hv, v + hv, 0.6, 6, color, tint(color, 0.05));
  const { P } = g;
  if (band) {
    if (along === 'u') poly(g, [P(u - hu, v + hv, 2.4), P(u + hu, v + hv, 2.4), P(u + hu, v + hv, 3.5), P(u - hu, v + hv, 3.5)], lit(band, ...FACE.s), null);
    else poly(g, [P(u + hu, v - hv, 2.4), P(u + hu, v + hv, 2.4), P(u + hu, v + hv, 3.5), P(u + hu, v - hv, 3.5)], lit(band, ...FACE.e), null);
  }
  // Frontscheibe am vorderen Ende
  if (along === 'u') poly(g, [P(u + hu, v - hv + 0.5, 3.4), P(u + hu, v + hv - 0.5, 3.4), P(u + hu, v + hv - 0.5, 5.4), P(u + hu, v - hv + 0.5, 5.4)], lit('#2c3a47', ...FACE.e), null);
  else poly(g, [P(u - hu + 0.5, v + hv, 3.4), P(u + hu - 0.5, v + hv, 3.4), P(u + hu - 0.5, v + hv, 5.4), P(u - hu + 0.5, v + hv, 5.4)], lit('#2c3a47', ...FACE.s), null);
  if (light) {
    const [lu, lv] = along === 'u' ? [u + hu - 1.6, v] : [u, v + hv - 1.6];
    box(g, lu - 0.8, lu + 0.8, lv - 1.4, lv + 1.4, 6, 6.9, '#3d7bf0', '#7fb0ff');
  }
}

/** Laterne. */
function lamp(g, u, v, h = 9) {
  const { P } = g;
  stroke(g, [P(u, v, 0), P(u, v, h)], '#3e4246', 0.9);
  box(g, u - 0.8, u + 0.8, v - 0.8, v + 0.8, h - 1.2, h, '#f1df9a', '#55595d');
}

/** Fahnenmast mit Fahne in Teamfarbe. */
function flagpole(g, u, v, h0, len, color) {
  const { P, ctx, z } = g;
  const [x, y0] = P(u, v, h0);
  const [, y1] = P(u, v, h0 + len);
  ctx.strokeStyle = '#d9d6cc';
  ctx.lineWidth = Math.max(0.8, 1.1 * z);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x + 8 * z, y1 + 1.2 * z);
  ctx.lineTo(x + 8 * z, y1 + 5.6 * z);
  ctx.lineTo(x, y1 + 5 * z);
  ctx.closePath();
  ctx.fill();
}

/** Lüftungs- oder Klimakasten auf dem Dach. */
function acUnit(g, u, v, h, s = 2.4, col = '#b9bdc0') {
  box(g, u - s, u + s, v - s * 0.7, v + s * 0.7, h, h + s * 1.1, col, tint(col, 0.12));
  if (g.fine) {
    const { P, ctx, z } = g;
    const [x, y] = P(u, v, h + s * 1.1);
    ctx.fillStyle = '#5f6468';
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.55 * z, s * 0.28 * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- Wohnen ----------

const RES_WALL = ['#f1e7d3', '#e8cfa8', '#d8dfe1'];
const RES_ROOF = ['#b4513a', '#56606a', '#8e5a3e'];
const RES_ACC = ['#4f86b8', '#5f9a52', '#d08a3a'];

/** Hecke hinten und links am Grundstück. */
function hedges(g) {
  const H = snowy(HEDGE);
  box(g, -25, 25, -25, -22.8, 0, 4, HEDGE, H);
  box(g, -25, -22.8, -22.8, 25, 0, 4, HEDGE, H);
}

function lawn(g, stripes = true) {
  flat(g, -25, 25, -25, 25, snowy(LAWN));
  if (stripes && g.fine && !roofSnowOn()) for (const k of [-17.5, -7.5, 2.5, 12.5]) flat(g, k, k + 5, -25, 25, LAWN2);
}

/** Stufe 1: Einfamilienhaus mit Satteldach, Fensterläden, Garage, Auto in der Einfahrt und Garten. */
function res1(g, o) {
  const wall = RES_WALL[o.v];
  const acc = RES_ACC[o.v];
  lawn(g);
  flat(g, -6, -1.6, 6, 25, PATH);
  flat(g, 11, 23, 3, 25, PAVE);
  hedges(g);
  tree(g, 17, -17, 1, o.v + 1);
  shadow(g, -16, 8, -12, 6, 24);
  shadow(g, 11, 23, -10, 3, 9);
  box(g, -16, 8, -12, 6, 0, 15, wall);
  plinth(g, -16, 8, -12, 6, wall);
  winsAt(g, 's', 6, [-12, 3.5], [[3.6, 9.6]], 3.4, { seed: o.seed, shutter: acc, cross: true });
  door(g, 's', 6, -4, 3.4, 9.2, shade(acc, 0.25));
  winsAt(g, 'e', 8, [-7.5, 1.5], [[3.6, 9.6]], 3.4, { seed: o.seed + 3, shutter: acc, cross: true });
  box(g, -6.8, -1.2, 6, 8.4, 10, 10.8, '#e6e2d8');
  gable(g, 'u', -16, 8, -12, 6, 15, 11, RES_ROOF[o.v], wall, () => box(g, -11, -8.6, -9.6, -7.2, 15, 29.5, '#a0574a', '#6f3d33'));
  winsAt(g, 'e', 8, [-3], [[16.2, 20.6]], 2.6, { seed: o.seed + 5 });
  // Garage mit Sektionaltor
  box(g, 11, 23, -10, 3, 0, 9, tint(wall, 0.08), '#a9a7a0');
  const { P } = g;
  poly(g, [P(12.4, 3, 0), P(21.6, 3, 0), P(21.6, 3, 7.2), P(12.4, 3, 7.2)], lit('#d4d6d6', ...FACE.s), OUTLINE);
  if (g.fine) for (const h of [1.8, 3.6, 5.4]) stroke(g, [P(12.4, 3, h), P(21.6, 3, h)], 'rgba(0,0,0,0.18)', 0.5);
  car(g, 17, 14, 'v', CAR_COLORS[o.seed % CAR_COLORS.length]);
  bush(g, -19.5, 19.5, 1.1, o.v);
  bush(g, 6, 20, 0.8, o.v + 2);
}

/** Stufe 2: Doppelhaus mit Walmdach, zwei Eingängen, Balkonen und Dachfenstern. */
function res2(g, o) {
  const wall = RES_WALL[o.v];
  const acc = RES_ACC[o.v];
  lawn(g);
  flat(g, -7, 3, 9, 25, PATH);
  flat(g, 18.4, 24.6, -6, 25, PAVE);
  hedges(g);
  tree(g, 19, -19, 0.95, o.v);
  shadow(g, -20, 16, -14, 9, 32);
  box(g, -20, 16, -14, 9, 0, 22, wall);
  plinth(g, -20, 16, -14, 9, wall);
  ledge(g, -20, 16, -14, 9, 11.2);
  winsAt(g, 's', 9, [-16.2, -10.8, 7.8, 12.6], [[3.6, 9.2]], 3.2, { seed: o.seed, cross: true });
  door(g, 's', 9, -5, 3.2, 8.8, shade(acc, 0.2));
  door(g, 's', 9, 1, 3.2, 8.8, shade(acc, 0.2));
  box(g, -7.4, 3.4, 9, 11.6, 9.6, 10.4, '#e6e2d8');
  winsAt(g, 's', 9, [-5, 1], [[14.6, 19.6]], 2.2, { seed: o.seed + 1 });
  winsAt(g, 's', 9, [-15.4, -11.6, 6.6, 10.4], [[12.4, 20]], 2.4, { seed: o.seed + 2, lit: 0.3 });
  balcony(g, 's', 9, -18, -9, 12, 3, acc);
  balcony(g, 's', 9, 4, 13, 12, 3, acc);
  wins(g, 'e', 16, -14, 9, 3, [[3.6, 9.2], [13.6, 19.6]], 3.2, { seed: o.seed + 4, cross: true });
  hip(g, -20, 16, -14, 9, 22, 10, RES_ROOF[o.v], () => box(g, -9, -6.6, -8.5, -6.1, 24, 33, '#a0574a', '#6f3d33'));
  // Dachfenster auf der vorderen Dachfläche
  const { P } = g;
  for (const u of [-12, 7]) {
    const a = [u - 2, 10.2, 22.9];
    const b = [u + 2, 10.2, 22.9];
    poly(g, [P(a[0], 6.2, 24.6), P(b[0], 6.2, 24.6), P(b[0], 3.4, 26.8), P(a[0], 3.4, 26.8)], '#3d566d', 'rgba(230,230,225,0.7)');
  }
  car(g, 21.5, 8, 'v', CAR_COLORS[(o.seed + 2) % CAR_COLORS.length]);
  tree(g, -20, 19.5, 0.9, o.v + 2);
  bush(g, 10, 20.5, 0.9, o.v);
}

/** Stufe 3: Wohnblock mit fünf Geschossen, Balkonen je Wohnung, Eingang mit Vordach; Dach mit Solarzellen, Grün oder Technik. */
function res3(g, o) {
  const wall = RES_WALL[o.v];
  const acc = RES_ACC[o.v];
  const H = 60;
  flat(g, -25, 25, -25, 25, PAVE);
  flat(g, -25, 25, 17, 25, snowy(LAWN));
  flat(g, 21.5, 25, -25, 17, snowy(LAWN));
  tree(g, 22.5, -21, 0.85, o.v);
  shadow(g, -21, 18, -20, 13, H);
  box(g, -21, 18, -20, 13, 0, H, wall);
  wallBand(g, -21, 18, -20, 13, 0, 11, shade(wall, 0.12)); // Erdgeschoss etwas dunkler
  plinth(g, -21, 18, -20, 13, wall, 1.2);
  for (const h of [12, 24, 36, 48]) ledge(g, -21, 18, -20, 13, h, 'rgba(0,0,0,0.14)', 0.7);
  const rows = [[3.6, 9.4], [15.4, 21.2], [27.4, 33.2], [39.4, 45.2], [51.4, 57.2]];
  wins(g, 'e', 18, -20, 13, 4, rows, 3.6, { seed: o.seed, lit: 0.28 });
  // Vorderseite: Eingang, Fenster, Balkontüren, Balkone
  storefront(g, 's', 13, -4.6, 1.6, 0.6, 8.6, 3.1, -1.5, o.seed);
  box(g, -6.4, 3.4, 13, 16.8, 8.8, 9.6, '#e6e2d8');
  winsAt(g, 's', 13, [-17.5, -11, 7.5, 14], [[3.6, 9.2]], 3.2, { seed: o.seed + 1 });
  const cols = [-13, -1.5, 10];
  for (let k = 1; k <= 4; k++) {
    const h = 12 * k;
    winsAt(g, 's', 13, [-19, -7.25, 4.25, 15.8], [[h + 3.4, h + 9.2]], 2.8, { seed: o.seed + k * 5, lit: 0.3 });
    winsAt(g, 's', 13, cols, [[h + 1.2, h + 9.8]], 3.2, { seed: o.seed + k * 9, lit: 0.25, frame: false });
    for (const c of cols) balcony(g, 's', 13, c - 3.7, c + 3.7, h + 0.6, 3, acc);
  }
  // Dach
  box(g, -21.6, 18.6, -20.6, 13.6, H, H + 1.6, tint(wall, 0.1));
  parapet(g, -21.6, 18.6, -20.6, 13.6, H + 1.6, tint(wall, 0.1));
  const R = H + 0.3;
  if (o.v === 0) {
    // Solarzellen in Reihen, schräg zur Sonne
    const { P } = g;
    for (const v0 of [-15, -8.5, -2]) {
      poly(g, [P(-3, v0, R + 0.4), P(14, v0, R + 0.4), P(14, v0 + 4.6, R + 2.4), P(-3, v0 + 4.6, R + 2.4)], '#2b4a78', 'rgba(170,190,215,0.8)');
      if (g.fine) for (let u = 1; u < 14; u += 4.2) stroke(g, [P(u, v0, R + 0.4), P(u, v0 + 4.6, R + 2.4)], 'rgba(170,190,215,0.55)', 0.4);
    }
  } else if (o.v === 1) {
    // Gründach mit Beeten
    flat(g, -2, 16.4, -18.4, 11.4, snowy('#7aa556'), R);
    for (const [u, v] of [[2, -14], [9, -6], [4, 4], [12, 7]]) bush(g, u, v, 0.55, k3(u + v));
    flat(g, -2, 16.4, -2, 0, '#b9b2a2', R + 0.05);
  } else {
    for (const [u, v] of [[2, -12], [9, -12], [5, -2]]) acUnit(g, u, v, R, 2.6);
  }
  box(g, -15, -6, -16, -8, R, R + 7.5, tint(wall, 0.06), '#a29f97');
  // Vorplatz: Bäume, Fahrräder
  tree(g, -21, 21, 0.85, o.v + 1);
  tree(g, 21.5, 21, 0.75, o.v + 2);
  if (g.fine) {
    const { P } = g;
    for (const u of [5.5, 7.5, 9.5]) stroke(g, [P(u, 15.5, 0.2), P(u, 17.8, 0.2), P(u, 17.8, 2.4)], '#3e4a56', 0.7);
  }
}
const k3 = (n) => ((n % 3) + 3) % 3;

// ---------- Gewerbe ----------

const COM_FACADE = ['#e4d8bf', '#b05f45', '#a3acb1'];
const COM_AWN = [['#c8423a', '#f3eee4'], ['#3f8a4f', '#f3eee4'], ['#3a6fb3', '#f3eee4']];
const COM_GLASS = ['#4b7aa3', '#3d8580', '#86694a'];

/** Café-Tisch mit Sonnenschirm. */
function cafe(g, u, v, cols) {
  cyl(g, u, v, 1.4, 0, 2.6, '#e9e6de');
  box(g, u - 2.8, u - 1.8, v - 0.6, v + 0.6, 0, 1.6, '#7a5a3e');
  box(g, u + 1.8, u + 2.8, v - 0.6, v + 0.6, 0, 1.6, '#7a5a3e');
  const { P } = g;
  stroke(g, [P(u, v, 2.6), P(u, v, 7.4)], '#6d6a62', 0.6);
  frustum(g, u, v, 4.6, 0.3, 6.6, 8.6, cols[0], false);
}

/** Werbeschild auf dem Dach: zwei Stützen und eine Tafel zur Straße (+v). */
function billboard(g, u0, u1, v, h, hh, col) {
  const { P } = g;
  for (const u of [u0 + 1.5, u1 - 1.5]) stroke(g, [P(u, v, h), P(u, v, h + 2.4)], '#55595d', 1);
  poly(g, [P(u0, v + 0.2, h + 2.4), P(u1, v + 0.2, h + 2.4), P(u1, v + 0.2, h + 2.4 + hh), P(u0, v + 0.2, h + 2.4 + hh)], lit(col, ...FACE.s), OUTLINE);
  poly(g, [P(u0 + 1, v + 0.3, h + 3.6), P(u1 - 1, v + 0.3, h + 3.6), P(u1 - 1, v + 0.3, h + 1.4 + hh), P(u0 + 1, v + 0.3, h + 1.4 + hh)], lit(tint(col, 0.75), ...FACE.s), null);
  if (g.fine) {
    poly(g, [P(u0 + 2, v + 0.4, h + 4.6), P(u0 + (u1 - u0) * 0.6, v + 0.4, h + 4.6), P(u0 + (u1 - u0) * 0.6, v + 0.4, h + 6), P(u0 + 2, v + 0.4, h + 6)], lit(shade(col, 0.2), ...FACE.s), null);
  }
}

/** Stufe 1: Laden mit Schaufenstern, gestreifter Markise, Schild, Café-Tischen und Parkplatz. */
function com1(g, o) {
  const wall = COM_FACADE[o.v];
  const aw = COM_AWN[o.v];
  flat(g, -25, 25, -25, 25, PLAZA);
  flat(g, 15, 25, -25, 2, ASPH);
  const { P } = g;
  for (const v of [-16.5, -8]) stroke(g, [P(15.5, v, 0), P(24.5, v, 0)], 'rgba(240,240,235,0.8)', 0.6);
  car(g, 20, -20.6, 'u', CAR_COLORS[(o.seed + 1) % CAR_COLORS.length]);
  car(g, 20, -12.2, 'u', CAR_COLORS[(o.seed + 4) % CAR_COLORS.length]);
  shadow(g, -18, 12, -18, 4, 14);
  box(g, -18, 12, -18, 4, 0, 14, wall);
  plinth(g, -18, 12, -18, 4, wall, 1);
  storefront(g, 's', 4, -16.5, 10.5, 1.2, 9.8, 3.4, -3, o.seed);
  storefront(g, 'e', 12, -15.5, 1, 1.2, 9.8, 3.3, null, o.seed + 3);
  // Schild über den Schaufenstern
  poly(g, [P(-17.4, 4, 10.8), P(11.4, 4, 10.8), P(11.4, 4, 13.4), P(-17.4, 4, 13.4)], lit(aw[0], ...FACE.s), OUTLINE);
  if (g.fine) for (let u = -13; u < 8; u += 2.6) poly(g, [P(u, 4.1, 11.6), P(u + 1.7, 4.1, 11.6), P(u + 1.7, 4.1, 12.6), P(u, 4.1, 12.6)], '#f6f1e6', null);
  awning(g, 's', 4, -17.2, 11.2, 10.6, 5, 2.3, aw, 12);
  parapet(g, -18, 12, -18, 4, 14, tint(wall, 0.05));
  acUnit(g, -9, -10, 12.8, 2.5);
  acUnit(g, 2, -12, 12.8, 1.8);
  for (const u of [-12.5, -2.5, 7.5]) cafe(g, u, 15.5, aw);
  bush(g, -21.5, 21, 0.9, o.v);
  bush(g, 13, 21.5, 0.8, o.v + 1);
}

/** Stufe 2: Geschäftshaus mit zwei Läden im Erdgeschoss, zwei Bürogeschossen, Gesimsen und Werbetafel auf dem Dach. */
function com2(g, o) {
  const wall = COM_FACADE[o.v];
  const H = 38;
  flat(g, -25, 25, -25, 25, PLAZA);
  shadow(g, -21, 18, -19, 11, H);
  box(g, -21, 18, -19, 11, 0, H, wall);
  plinth(g, -21, 18, -19, 11, wall, 1);
  storefront(g, 's', 11, -19.4, -3.2, 1.2, 10.4, 3.2, -11, o.seed);
  storefront(g, 's', 11, 0.6, 16.4, 1.2, 10.4, 3.2, 8.5, o.seed + 2);
  storefront(g, 'e', 18, -17.5, 9.5, 1.2, 10.4, 3.4, null, o.seed + 5);
  wallBand(g, -21, 18, -19, 11, 12.2, 14.2, tint(wall, 0.35)); // Gesims über den Läden
  wins(g, 's', 11, -21, 18, 7, [[16.6, 23.6], [27.2, 34.2]], 3.2, { seed: o.seed, lit: 0.3, cross: true });
  wins(g, 'e', 18, -19, 11, 5, [[16.6, 23.6], [27.2, 34.2]], 3.2, { seed: o.seed + 9, lit: 0.3, cross: true });
  awning(g, 's', 11, -19.8, -2.8, 11.6, 4.6, 2.2, COM_AWN[o.v], 8);
  awning(g, 's', 11, 0.2, 16.8, 11.6, 4.6, 2.2, COM_AWN[(o.v + 1) % 3], 8);
  box(g, -21.6, 18.6, -19.6, 11.6, H, H + 1.6, tint(wall, 0.3));
  parapet(g, -21.6, 18.6, -19.6, 11.6, H + 1.6, tint(wall, 0.3));
  acUnit(g, -12, -12, H + 0.3, 2.8);
  acUnit(g, -4, -12, H + 0.3, 2.8);
  billboard(g, 2, 16, -16, H + 0.3, 7.5, ['#d9442f', '#2f74c0', '#e0a92e'][o.seed % 3]);
  lamp(g, -22.5, 19);
  lamp(g, 21, 19);
  bush(g, 21.5, -21.5, 0.9, o.v);
}

/** Glasfassade: Spiegelung (oben heller), Geschossbänder, Pfosten, einzelne helle Fenster, helle Eckkante. */
function curtain(g, u0, u1, v0, v1, h0, h1, gl, seed) {
  const { P, ctx } = g;
  const faces = [
    ['s', [P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1)], (a, h) => P(a, v1, h), u0, u1],
    ['e', [P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1)], (a, h) => P(u1, a, h), v0, v1],
  ];
  for (const [f, pts, pt, a0, a1] of faces) {
    const top = pts[2][1];
    const bot = pts[0][1];
    const grad = ctx.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, lit(tint(gl, 0.45), ...FACE[f]));
    grad.addColorStop(0.55, lit(gl, ...FACE[f]));
    grad.addColorStop(1, lit(shade(gl, 0.2), ...FACE[f]));
    poly(g, pts, grad, OUTLINE);
    const fl = 7.4;
    const cols = Math.max(2, Math.round((a1 - a0) / 3.4));
    if (g.fine) {
      // einzelne beleuchtete Felder
      for (let h = h0, r = 0; h < h1 - 2; h += fl, r++) {
        for (let c = 0; c < cols; c++) {
          if (rnd(seed + r * 41 + c * 7 + (f === 's' ? 0 : 3)) > 0.12) continue;
          const b0 = a0 + ((a1 - a0) * c) / cols;
          const b1 = a0 + ((a1 - a0) * (c + 1)) / cols;
          poly(g, [pt(b0, h + 0.6), pt(b1, h + 0.6), pt(b1, h + fl - 0.6), pt(b0, h + fl - 0.6)], f === 's' ? 'rgba(243,216,133,0.75)' : 'rgba(214,190,115,0.7)', null);
        }
      }
      for (let c = 1; c < cols; c++) {
        const a = a0 + ((a1 - a0) * c) / cols;
        stroke(g, [pt(a, h0), pt(a, h1)], 'rgba(20,30,40,0.22)', 0.45);
      }
    }
    for (let h = h0 + fl; h < h1 - 1; h += fl) stroke(g, [pt(a0, h), pt(a1, h)], 'rgba(225,232,238,0.55)', 0.7);
  }
  stroke(g, [P(u1, v1, h0), P(u1, v1, h1)], 'rgba(235,240,245,0.85)', 1.1);
  poly(g, [P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1)], lit('#9ea4a8', ...FACE.top), OUTLINE);
}

/** Stufe 3: Bürohochhaus aus Glas auf einem Sockel mit Lobby, Krone mit Band in Teamfarbe, Antenne, Fahnen auf dem Vorplatz. */
function com3(g, o) {
  const gl = COM_GLASS[o.v];
  const H = 96;
  flat(g, -25, 25, -25, 25, '#d8d1c2');
  if (g.fine) {
    const { P } = g;
    for (let k = -20; k <= 20; k += 8) {
      stroke(g, [P(k, -25, 0), P(k, 25, 0)], 'rgba(0,0,0,0.06)', 0.5);
      stroke(g, [P(-25, k, 0), P(25, k, 0)], 'rgba(0,0,0,0.06)', 0.5);
    }
  }
  shadow(g, -21, 19, -19, 13, H, 0.22);
  // Sockel mit Lobby
  box(g, -21, 19, -19, 13, 0, 9, '#cfd2d2', '#a6b08f');
  storefront(g, 's', 13, -19.5, 17.5, 0.6, 7.6, 4.1, -1.5, o.seed);
  storefront(g, 'e', 19, -17.5, 11.5, 0.6, 7.6, 4.1, null, o.seed + 4);
  if (g.fine) for (const [u, v] of [[16, -16], [16, 10.5], [-18, 10.5]]) bush(g, u, v, 0.45, o.v);
  curtain(g, -15, 13, -15, 9, 9, H, gl, o.seed);
  // Krone: Technikgeschoss, Band in Teamfarbe, Antenne
  box(g, -13, 11, -13, 7, H, H + 5, '#c8ccd0', '#a9aeb3');
  wallBand(g, -13, 11, -13, 7, H + 3, H + 4.4, o.color);
  if (g.fine) {
    const { P } = g;
    for (let a = -11; a < 11; a += 1.6) stroke(g, [P(a, 7, H + 0.6), P(a, 7, H + 2.6)], 'rgba(0,0,0,0.25)', 0.4);
  }
  const { P, ctx, z } = g;
  stroke(g, [P(-5, -5, H + 5), P(-5, -5, H + 22)], '#5d6266', 1.1);
  stroke(g, [P(4, -9, H + 5), P(4, -9, H + 13)], '#5d6266', 0.8);
  const [ax, ay] = P(-5, -5, H + 22);
  ctx.fillStyle = '#ff4a3a';
  ctx.beginPath();
  ctx.arc(ax, ay, Math.max(1, 1.3 * z), 0, Math.PI * 2);
  ctx.fill();
  // Vordach am Eingang, Fahnen und Bäume auf dem Vorplatz
  box(g, -6.5, 3.5, 13, 17.5, 7.2, 8, '#e1e4e5');
  for (const u of [-18, -14, -10]) flagpole(g, u, 21.5, 0, 15, o.color);
  tree(g, 18, 21, 0.85, o.v);
  tree(g, 22, -21, 0.8, o.v + 1);
}

// ---------- Weitere Grundformen ----------

/** Kreisscheibe in einer Wandebene (Uhr, Stirnseite eines Stamms): Mitte a (entlang der Wand) auf Höhe h; off ragt aus der Wand. */
function disc(g, face, plane, a, h, r, fill, line = OUTLINE, off = 0, n = 16) {
  const pt = onFace(g, face, plane);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    pts.push(pt(a + r * Math.cos(t), h + r * Math.sin(t), off));
  }
  poly(g, pts, fill, line);
}

/** Kreis am Boden (oder auf Höhe h) als Eckpunkte. */
function groundRing(g, u, v, r, h = 0, n = 24) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    pts.push(g.P(u + r * Math.cos(t), v + r * Math.sin(t), h));
  }
  return pts;
}

/** Rundbogenfenster (Rechteck bis h1, darüber ein Halbkreis) mit hellem Rahmen. */
function archWins(g, face, plane, at, h0, h1, ww, o = {}) {
  const pt = onFace(g, face, plane);
  const r = ww / 2;
  const shape = (a, e) => {
    const pts = [pt(a - r - e, h0 - e), pt(a + r + e, h0 - e)];
    for (let k = 0; k <= 8; k++) {
      const t = (k / 8) * Math.PI;
      pts.push(pt(a + (r + e) * Math.cos(t), h1 + (r + e) * Math.sin(t)));
    }
    return pts;
  };
  at.forEach((a, i) => {
    if (g.fine) poly(g, shape(a, 0.55), lit(o.frame ?? SILL, ...FACE[face]), null);
    const on = rnd((o.seed ?? 0) + i * 13 + (face === 's' ? 0 : 5)) < (o.lit ?? 0.2);
    poly(g, shape(a, 0), on ? WARM : lit(o.glass ?? GLASS, ...FACE[face]), null);
    if (g.fine) {
      stroke(g, [pt(a, h0), pt(a, h1 + r)], 'rgba(235,232,224,0.75)', 0.45);
      stroke(g, [pt(a - r, h1), pt(a + r, h1)], 'rgba(235,232,224,0.75)', 0.45);
    }
  });
}

/** Halbrundes Fächerfenster (Giebel der Markthalle). */
function fanWin(g, face, plane, a, h, r) {
  const pt = onFace(g, face, plane);
  const half = (rr) => {
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = (k / 12) * Math.PI;
      pts.push(pt(a + rr * Math.cos(t), h + rr * Math.sin(t)));
    }
    return pts;
  };
  if (g.fine) poly(g, half(r + 0.7), lit(SILL, ...FACE[face]), null);
  poly(g, half(r), lit(GLASS, ...FACE[face]), null);
  if (!g.fine) return;
  for (let k = 1; k < 5; k++) {
    const t = (k / 5) * Math.PI;
    stroke(g, [pt(a, h), pt(a + r * Math.cos(t), h + r * Math.sin(t))], 'rgba(235,232,224,0.8)', 0.45);
  }
}

/**
 * Tonnendach über [u0,u1]×[v0,v1], First entlang axis ('u' oder 'v'); Traufe auf h, Scheitel rh höher. Der sichtbare Giebel
 * (Bogen in Wandfarbe) liegt an u1 bzw. v1.
 */
function vault(g, axis, u0, u1, v0, v1, h, rh, roof, wall, n = 10) {
  const { P } = g;
  const R = snowy(roof);
  const alongU = axis === 'u';
  const [a0, a1, c0, c1] = alongU ? [u0, u1, v0, v1] : [v0, v1, u0, u1];
  const M = alongU ? (a, c, hh) => P(a, c, hh) : (a, c, hh) => P(c, a, hh);
  const cm = (c0 + c1) / 2;
  const w = (c1 - c0) / 2;
  const o = 0.9; // Überstand an den Seiten
  const at = (ww, t) => [cm - ww * Math.cos(t), h + rh * Math.sin(t)];
  for (let k = 0; k < n; k++) {
    const ta = (k / n) * Math.PI;
    const tb = ((k + 1) / n) * Math.PI;
    const tm = (ta + tb) / 2;
    const [ca, ha] = at(w + o, ta);
    const [cb, hb] = at(w + o, tb);
    const nc = -rh * Math.cos(tm);
    const nh = (w + o) * Math.sin(tm);
    poly(g, [M(a0 - 0.6, ca, ha), M(a1, ca, ha), M(a1, cb, hb), M(a0 - 0.6, cb, hb)], lit(R, ...(alongU ? [0, nc, nh] : [nc, 0, nh])), null);
    if (g.fine && k % 2) stroke(g, [M(a0 - 0.6, cb, hb), M(a1, cb, hb)], 'rgba(0,0,0,0.1)', 0.45);
  }
  const gab = [M(a1, c0, h), M(a1, c1, h)];
  for (let k = n; k >= 0; k--) {
    const [c, hh] = at(w, (k / n) * Math.PI);
    gab.push(M(a1, c, hh));
  }
  poly(g, gab, lit(wall, ...(alongU ? FACE.e : FACE.s)));
  const rim = [];
  for (let k = 0; k <= n; k++) {
    const [c, hh] = at(w + o, (k / n) * Math.PI);
    rim.push(M(a1 + 0.4, c, hh));
  }
  stroke(g, rim, shade(roof, 0.3), 1.5);
}

/** Pflaster eines Platzes mit feinen Fugen. */
function cobble(g, color = '#d2c6ad') {
  flat(g, -25, 25, -25, 25, color);
  if (!g.fine) return;
  const { P } = g;
  for (let k = -21; k <= 21; k += 6) {
    stroke(g, [P(k, -25, 0), P(k, 25, 0)], 'rgba(0,0,0,0.06)', 0.5);
    stroke(g, [P(-25, k, 0), P(25, k, 0)], 'rgba(0,0,0,0.06)', 0.5);
  }
}

/** Kiste (Holz) oder Steinblock. */
function crate(g, u, v, s = 1.1, h = 2.2, col = '#a07a4f') {
  box(g, u - s, u + s, v - s, v + s, 0, h, col, tint(col, 0.14));
}

/** Zaun um [u0,u1]×[v0,v1]: part 'back' = hintere Seiten (vor dem Gebäude malen), 'front' = vordere Seiten (danach). */
function fence(g, u0, u1, v0, v1, part, h = 3.2) {
  const { P } = g;
  const sides = part === 'back' ? [[[u0, v1], [u0, v0]], [[u0, v0], [u1, v0]]] : [[[u0, v1], [u1, v1]], [[u1, v1], [u1, v0]]];
  const col = 'rgba(66,72,78,0.8)';
  for (const [[a0, b0], [a1, b1]] of sides) {
    for (const hh of [h, h * 0.55]) stroke(g, [P(a0, b0, hh), P(a1, b1, hh)], col, 0.4);
    const n = Math.max(1, Math.round(Math.hypot(a1 - a0, b1 - b0) / 4.5));
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const a = a0 + (a1 - a0) * t;
      const b = b0 + (b1 - b0) * t;
      stroke(g, [P(a, b, 0), P(a, b, h + 0.3)], col, 0.55);
    }
  }
}

// ---------- Markt ----------

const STALL = [['#e6b422', '#f6f0df'], ['#c8423a', '#f6f0df'], ['#3f8a4f', '#f6f0df'], ['#3a6fb3', '#f6f0df'], ['#e07b2a', '#f6f0df']];
const MARKET_ROOF = '#6e9d8e'; // Kupfer mit Patina
const MARKET_WALL = ['#b8664c', '#d6c29a', '#c9a27e'];

/** Marktstand: Tisch mit Waren, Pfosten und gestreiftes Zeltdach (First entlang u). */
function stall(g, u, v, cols, seed) {
  const hw = 4.2;
  const hd = 2.6;
  const { P } = g;
  flat(g, u - hw, u + hw, v - hd, v + hd + 1.8, 'rgba(0,0,0,0.16)');
  stroke(g, [P(u - hw, v - hd, 0), P(u - hw, v - hd, 6.6)], '#6b5a48', 0.7);
  box(g, u - hw + 0.6, u + hw - 0.6, v - hd + 0.7, v + hd - 0.7, 0, 3, '#8a6242', '#a57a52');
  for (let k = 0; k < 4; k++) {
    const a = u - hw + 1.6 + k * 1.9;
    const c = ['#e2b04a', '#c8574a', '#6aa35a', '#e8892e', '#9b59b6', '#f0e6c8'][(seed + k) % 6];
    box(g, a - 0.75, a + 0.75, v - 1, v + 1, 3, 3.8, c, tint(c, 0.18), null);
  }
  for (const [a, b] of [[u + hw, v - hd], [u - hw, v + hd], [u + hw, v + hd]]) stroke(g, [P(a, b, 0), P(a, b, 6.6)], '#6b5a48', 0.7);
  const n = 6;
  const H = 6.6;
  const T = 8.8;
  for (const side of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const a0 = u - hw - 0.4 + ((2 * hw + 0.8) * k) / n;
      const a1 = u - hw - 0.4 + ((2 * hw + 0.8) * (k + 1)) / n;
      poly(g, [P(a0, v + side * (hd + 0.5), H), P(a1, v + side * (hd + 0.5), H), P(a1, v, T), P(a0, v, T)], lit(cols[k % 2], 0, side * 2.2, hd), null);
    }
  }
  poly(g, [P(u + hw + 0.4, v - hd - 0.5, H), P(u + hw + 0.4, v + hd + 0.5, H), P(u + hw + 0.4, v, T)], lit(cols[0], ...FACE.e), null);
  stroke(g, [P(u - hw - 0.4, v + hd + 0.5, H), P(u + hw + 0.4, v + hd + 0.5, H), P(u + hw + 0.4, v, T), P(u + hw + 0.4, v - hd - 0.5, H)], OUTLINE, 0.6);
}

/** Brunnen: Becken mit Wasser, Säule mit Schale und Strahl. */
function fountain(g, u, v, r) {
  const { ctx, z, P } = g;
  flat(g, u - r, u + r, v - r, v + r + 1.2, 'rgba(0,0,0,0.12)');
  cyl(g, u, v, r, 0, 1.8, '#bdb6a6', false);
  const [x, y] = P(u, v, 1.8);
  ctx.fillStyle = '#ddd7ca';
  ctx.beginPath();
  ctx.ellipse(x, y, r * z, (r * z) / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  const grad = ctx.createLinearGradient(x - r * z, y, x + r * z, y);
  grad.addColorStop(0, '#8cc1e2');
  grad.addColorStop(1, '#4f8fbf');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y + 0.15 * z, (r - 0.8) * z, ((r - 0.8) * z) / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  cyl(g, u, v, 0.7, 1.5, 4.8, '#cfc8b8');
  frustum(g, u, v, 0.8, 2.3, 4.5, 5.3, '#cfc8b8');
  const [sx, sy] = P(u, v, 7.4);
  ctx.fillStyle = 'rgba(205,232,250,0.85)';
  ctx.beginPath();
  ctx.ellipse(sx, sy, 0.9 * z, 1.9 * z, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Uhr an einer Wand. */
function clockFace(g, face, plane, a, h, r) {
  disc(g, face, plane, a, h, r + 0.5, lit('#3b3f44', ...FACE[face]), null, 0.12);
  disc(g, face, plane, a, h, r, '#f4f1e6', null, 0.2);
  const pt = onFace(g, face, plane);
  stroke(g, [pt(a, h, 0.25), pt(a, h + r * 0.75, 0.25)], '#2b2b2b', 0.55);
  stroke(g, [pt(a, h, 0.25), pt(a + r * 0.5, h - r * 0.2, 0.25)], '#2b2b2b', 0.7);
}

/** Uhrturm mit Gesims, Uhren an beiden sichtbaren Seiten, Zeltdach, goldener Kugel und Fahne in Teamfarbe. */
function clockTower(g, u0, u1, v0, v1, H, wall, team) {
  const um = (u0 + u1) / 2;
  const vm = (v0 + v1) / 2;
  shadow(g, u0, u1, v0, v1, H + 10);
  box(g, u0, u1, v0, v1, 0, H, wall);
  plinth(g, u0, u1, v0, v1, wall);
  ledge(g, u0, u1, v0, v1, H * 0.36, 'rgba(255,255,255,0.35)', 0.9);
  ledge(g, u0, u1, v0, v1, H * 0.68, 'rgba(255,255,255,0.35)', 0.9);
  archWins(g, 's', v1, [um], H * 0.4, H * 0.58, 2.6, { seed: 3 });
  archWins(g, 'e', u1, [vm], H * 0.4, H * 0.58, 2.6, { seed: 4 });
  door(g, 's', v1, um, 3, 6.5, '#5b3b22');
  box(g, u0 - 0.7, u1 + 0.7, v0 - 0.7, v1 + 0.7, H, H + 1.2, tint(wall, 0.3));
  clockFace(g, 's', v1, um, H * 0.84, 2.7);
  clockFace(g, 'e', u1, vm, H * 0.84, 2.7);
  const rh = 11;
  pyramid(g, um, vm, (u1 - u0) / 2 + 0.9, H + 1.2, rh, MARKET_ROOF);
  const [bx, by] = g.P(um, vm, H + 1.2 + rh + 0.8);
  ball(g.ctx, bx, by, 1.3 * g.z, '#e3b43a');
  flagpole(g, um, vm, H + rh + 3, 8, team);
}

/** Stufe 1: Wochenmarkt mit vier Ständen um einen Brunnen. */
function market1(g, o) {
  cobble(g);
  tree(g, -21, -21, 0.85, o.v);
  stall(g, -12, -13, STALL[0], o.seed);
  stall(g, 12, -13, STALL[1 + (o.v % 2)], o.seed + 1);
  lamp(g, 20, -20);
  fountain(g, 0, 0, 5);
  stall(g, -12, 12, STALL[3], o.seed + 2);
  lamp(g, -20, 20);
  crate(g, 19.5, -2.5);
  crate(g, 19.5, 0.2);
  crate(g, 22.2, -1.2, 1, 1.8);
  stall(g, 12, 12, STALL[4], o.seed + 3);
  tree(g, 21.5, 21.5, 0.75, o.v + 1);
}

/** Markthalle mit Tonnendach, Rundbogenfenstern, großem Tor und Fächerfenster im Giebel. */
function hall(g, u0, u1, v0, v1, H, rh, wall, seed) {
  const vm = (v0 + v1) / 2;
  shadow(g, u0, u1, v0, v1, H + rh);
  box(g, u0, u1, v0, v1, 0, H, wall);
  plinth(g, u0, u1, v0, v1, wall);
  const n = Math.max(3, Math.round((u1 - u0) / 7));
  const step = (u1 - u0) / n;
  const doorAt = u0 + step * Math.floor(n / 2) + step / 2;
  const at = [];
  for (let k = 0; k < n; k++) if (u0 + step * (k + 0.5) !== doorAt) at.push(u0 + step * (k + 0.5));
  archWins(g, 's', v1, at, 2.8, H - 4, 3.2, { seed });
  archWins(g, 'e', u1, [v0 + (v1 - v0) * 0.2, v1 - (v1 - v0) * 0.2], 2.8, H - 6.5, 2.8, { seed: seed + 2 });
  // Tor: Rundbogen mit Flügeln
  const pt = onFace(g, 's', v1);
  const R = 3.2;
  const gate = (e) => {
    const pts = [pt(doorAt - R - e, 0), pt(doorAt + R + e, 0)];
    for (let k = 0; k <= 8; k++) {
      const t = (k / 8) * Math.PI;
      pts.push(pt(doorAt + (R + e) * Math.cos(t), H - 5 + (R + e) * Math.sin(t)));
    }
    return pts;
  };
  poly(g, gate(0.8), lit(tint(wall, 0.45), ...FACE.s), null);
  poly(g, gate(0), lit('#5c4330', ...FACE.s), OUTLINE);
  if (g.fine) stroke(g, [pt(doorAt, 0), pt(doorAt, H - 5 + R)], 'rgba(0,0,0,0.3)', 0.5);
  wallBand(g, u0, u1, v0, v1, H - 1.2, H, tint(wall, 0.4)); // Gesims
  vault(g, 'u', u0, u1, v0, v1, H, rh, MARKET_ROOF, wall);
  fanWin(g, 'e', u1, vm, H, Math.min(rh, (v1 - v0) / 2) * 0.72);
  // Oberlicht am First
  const { P } = g;
  const top = H + rh;
  poly(g, [P(u0 + 2, vm - 1.6, top - 0.15), P(u1 - 2, vm - 1.6, top - 0.15), P(u1 - 2, vm + 1.6, top - 0.25), P(u0 + 2, vm + 1.6, top - 0.25)], '#9cc3d5', 'rgba(60,80,90,0.5)');
}

/** Stufe 2: Markthalle, davor Stände unter Markisen. */
function market2(g, o) {
  const wall = MARKET_WALL[o.v];
  cobble(g);
  hall(g, -21, 11, -20, 4, 11, 8, wall, o.seed);
  tree(g, 21, -21, 0.8, o.v);
  stall(g, 19, -9, STALL[(o.v + 1) % 5], o.seed + 1);
  lamp(g, -22, 7.5);
  stall(g, -13, 14, STALL[0], o.seed + 2);
  stall(g, 3, 14, STALL[(o.v + 3) % 5], o.seed + 3);
  crate(g, 16, 6.5);
  crate(g, 18.6, 6.5, 1, 1.8);
  tree(g, 21.5, 15, 0.8, o.v + 1);
}

/** Stufe 3: Markthalle mit Uhrturm und Fahne. */
function market3(g, o) {
  const wall = MARKET_WALL[o.v];
  cobble(g, '#d6caae');
  hall(g, -23, 7, -16, 8, 12, 8.5, wall, o.seed);
  clockTower(g, 12, 21, -24, -15, 34, tint(wall, 0.1), o.color);
  stall(g, 18, -4, STALL[(o.v + 2) % 5], o.seed + 1);
  lamp(g, 10.5, 11);
  stall(g, -15, 16, STALL[0], o.seed + 2);
  stall(g, 1, 16, STALL[(o.v + 1) % 5], o.seed + 3);
  tree(g, 20, 13, 0.75, o.v);
  tree(g, 21.5, 21.5, 0.7, o.v + 2);
}

// ---------- Rechenzentrum ----------

const DC_WALL = '#5a636b';
const DC_RIM = '#4b535a';
const DC_LED = '#5ae4ec';

/** Senkrechte Rippen der Metallverkleidung. */
function ribs(g, u0, u1, v0, v1, h0, h1, step = 1.8) {
  if (!g.fine) return;
  const { P } = g;
  for (let a = u0 + step; a < u1 - 0.3; a += step) stroke(g, [P(a, v1, h0), P(a, v1, h1)], 'rgba(255,255,255,0.08)', 0.5);
  for (let a = v0 + step; a < v1 - 0.3; a += step) stroke(g, [P(u1, a, h0), P(u1, a, h1)], 'rgba(0,0,0,0.14)', 0.5);
}

/** Leuchtband (ohne Schattierung, wirkt selbstleuchtend). */
function glowBand(g, u0, u1, v0, v1, h0, h1, color = DC_LED) {
  const { P } = g;
  poly(g, [P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1)], color, null);
  poly(g, [P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1)], shade(color, 0.14), null);
}

/** Lüfter (Gehäuse mit dunklem Rotor) auf Höhe h. */
function fan(g, u, v, h, r) {
  cyl(g, u, v, r, h, h + 1.1, '#8d9398', false);
  const { ctx, z } = g;
  const [x, y] = g.P(u, v, h + 1.1);
  ctx.fillStyle = '#2b2f33';
  ctx.beginPath();
  ctx.ellipse(x, y, r * z, (r * z) / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!g.fine) return;
  ctx.strokeStyle = '#80868b';
  ctx.lineWidth = Math.max(0.5, 0.45 * z);
  ctx.beginPath();
  ctx.moveTo(x - r * z * 0.85, y);
  ctx.lineTo(x + r * z * 0.85, y);
  ctx.moveTo(x, y - r * z * 0.42);
  ctx.lineTo(x, y + r * z * 0.42);
  ctx.stroke();
}

/** Notstrom-Aggregat: Container mit Lüftungsschlitzen und Auspuff. */
function generator(g, u, v) {
  box(g, u - 4, u + 4, v - 2, v + 2, 0, 5, '#6b7d5c', '#7d8f6c');
  if (g.fine) {
    const { P } = g;
    for (let a = u - 3; a < u + 3.6; a += 1.2) stroke(g, [P(a, v + 2, 0.8), P(a, v + 2, 4.2)], 'rgba(0,0,0,0.2)', 0.4);
  }
  cyl(g, u - 2.6, v - 0.6, 0.6, 5, 9, '#5d6064');
}

/** Rückkühler: Kasten mit zwei Lüftern oben. */
function chiller(g, u, v, h = 0) {
  box(g, u - 3.2, u + 3.2, v - 2.1, v + 2.1, h, h + 3.4, '#cfd3d6', '#bfc4c8');
  fan(g, u - 1.6, v, h + 3.4, 1.3);
  fan(g, u + 1.6, v, h + 3.4, 1.3);
}

/** Parabolantenne auf einem Sockel. */
function dish(g, u, v, h, r) {
  cyl(g, u, v, r * 0.22, h, h + r * 0.9, '#9aa0a5');
  const { ctx, z } = g;
  const [x, y] = g.P(u, v, h + r * 1.25);
  const R = r * z;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.55);
  const grad = ctx.createRadialGradient(-R * 0.3, -R * 0.2, R * 0.1, 0, 0, R);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#b4b9bd');
  ctx.beginPath();
  ctx.ellipse(0, 0, R, R * 0.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.8 * z);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-R * 0.1, -R * 0.78);
  ctx.strokeStyle = '#6d7277';
  ctx.stroke();
  ctx.restore();
}

/** Gittermast mit Streben und rotem Licht. */
function mast(g, u, v, h0, h1, r0, r1, color = '#a7adb2') {
  const { P } = g;
  const leg = (su, sv) => stroke(g, [P(u + su * r0, v + sv * r0, h0), P(u + su * r1, v + sv * r1, h1)], color, 0.9);
  leg(1, -1);
  leg(-1, 1);
  const n = Math.max(3, Math.round((h1 - h0) / 5));
  const zs = [];
  const ze = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const h = h0 + (h1 - h0) * t;
    const r = r0 + (r1 - r0) * t;
    const s = k % 2 ? 1 : -1;
    zs.push(P(u + s * r, v + r, h));
    ze.push(P(u + r, v + s * r, h));
  }
  stroke(g, zs, color, 0.5);
  stroke(g, ze, color, 0.5);
  leg(1, 1);
  const [x, y] = P(u, v, h1 + 0.8);
  circle(g.ctx, x, y, Math.max(0.9, 1.2 * g.z), '#ff4a3a');
}

/** Halle des Rechenzentrums: Metallverkleidung mit Rippen, Leuchtband, Flachdach mit Brüstung. */
function dcHall(g, u0, u1, v0, v1, H) {
  shadow(g, u0, u1, v0, v1, H);
  box(g, u0, u1, v0, v1, 0, H, DC_WALL, '#6b737a');
  ribs(g, u0, u1, v0, v1, 0.8, H - 3.4);
  glowBand(g, u0, u1, v0, v1, H - 3, H - 2.2);
  box(g, u0 - 0.4, u1 + 0.4, v0 - 0.4, v1 + 0.4, H, H + 1.2, DC_RIM);
  parapet(g, u0 - 0.4, u1 + 0.4, v0 - 0.4, v1 + 0.4, H + 1.2, DC_RIM, '#7c8287');
  // Eingang mit Vordach
  storefront(g, 's', v1, u0 + 3, u0 + 9, 0.4, 6.8, 3, u0 + 6, 7);
  box(g, u0 + 2.2, u0 + 9.8, v1, v1 + 3, 6.8, 7.5, '#d5d8da');
}

/** Stufe 1: Datenhalle mit Lüftern, Notstrom und Zaun. */
function dc1(g, o) {
  flat(g, -25, 25, -25, 25, '#c3c5bf');
  flat(g, -25, 25, 13, 25, snowy(LAWN));
  fence(g, -24, 24, -24, 24, 'back');
  dcHall(g, -19, 9, -17, 5, 12);
  for (const v of [-12, -5]) for (const u of [-13, -5, 3]) fan(g, u, v, 12.4, 2.2);
  generator(g, 16, -19);
  car(g, 17, 3, 'v', CAR_COLORS[(o.seed + 3) % CAR_COLORS.length]);
  bush(g, -18, 19, 0.9, o.v);
  bush(g, 6, 19.5, 0.8, o.v + 1);
  fence(g, -24, 24, -24, 24, 'front');
}

/** Stufe 2: größere Halle, Antenne auf dem Dach, Rückkühler daneben. */
function dc2(g, o) {
  flat(g, -25, 25, -25, 25, '#c3c5bf');
  flat(g, -25, 25, 15, 25, snowy(LAWN));
  fence(g, -24, 24, -24, 24, 'back');
  dcHall(g, -22, 10, -21, 6, 16);
  for (const v of [-16, -9]) for (const u of [-17, -10, -3, 4]) fan(g, u, v, 16.4, 2.2);
  dish(g, 4, 0, 16.4, 3.6);
  chiller(g, 18, -16);
  chiller(g, 18, -7);
  chiller(g, 18, 2);
  generator(g, 15, 11);
  bush(g, -19, 20, 0.9, o.v);
  fence(g, -24, 24, -24, 24, 'front');
}

/** Stufe 3: Halle mit gläsernem Leitstand auf dem Dach, Gittermast, Kühler und Dieseltanks. */
function dc3(g, o) {
  flat(g, -25, 25, -25, 25, '#c3c5bf');
  fence(g, -24, 24, -24, 24, 'back');
  const H = 18;
  dcHall(g, -23, 9, -22, 6, H);
  curtain(g, -23, -9, -22, -8, H + 0.3, H + 16, '#3e6f8f', o.seed);
  wallBand(g, -23, -9, -22, -8, H + 13.6, H + 14.6, o.color);
  mast(g, -16, -15, H + 16, 70, 2.2, 0.5);
  for (const [u, v] of [[-3, -17], [4, -17], [-3, -10], [4, -10], [-17, -3], [-10, -3], [-3, -3], [4, -3]]) fan(g, u, v, H + 0.4, 2.2);
  chiller(g, 17, -16);
  chiller(g, 17, -7);
  dish(g, 17, 1, 0, 3.4);
  for (const [u, v] of [[15.5, 13], [21, 18]]) {
    cyl(g, u, v, 2.8, 0, 7, '#d8d6cf');
    if (g.fine) seam(g, u, v, 2.8, 3.5);
  }
  fence(g, -24, 24, -24, 24, 'front');
}

// ---------- Krankenhaus ----------

const HOSP = '#f1f0ec';
const RED = '#d8313b';

/** Fensterband (Klinik): durchgehendes Glas mit Pfosten, einzelne Felder hell. */
function ribbon(g, face, plane, a0, a1, h0, h1, seed = 0) {
  const pt = onFace(g, face, plane);
  poly(g, [pt(a0, h0), pt(a1, h0), pt(a1, h1), pt(a0, h1)], lit('#46637d', ...FACE[face]), null);
  if (!g.fine) return;
  const n = Math.max(2, Math.round((a1 - a0) / 2.6));
  for (let k = 0; k < n; k++) {
    const b0 = a0 + ((a1 - a0) * k) / n;
    const b1 = a0 + ((a1 - a0) * (k + 1)) / n;
    if (rnd(seed + k * 7 + (face === 's' ? 0 : 3)) < 0.22) poly(g, [pt(b0, h0), pt(b1, h0), pt(b1, h1), pt(b0, h1)], face === 's' ? 'rgba(243,216,133,0.8)' : 'rgba(214,190,115,0.75)', null);
    if (k) stroke(g, [pt(b0, h0), pt(b0, h1)], 'rgba(235,235,230,0.8)', 0.45);
  }
  poly(g, [pt(a0, h1), pt(a0 + (a1 - a0) * 0.22, h1), pt(a0, h0)], 'rgba(255,255,255,0.12)', null);
}

/** Schild auf dem Dach: weiße Tafel mit rotem Kreuz zur Straße (+v). */
function roofSign(g, u0, u1, v, h, hh) {
  const { P } = g;
  for (const u of [u0 + 1, u1 - 1]) stroke(g, [P(u, v, h), P(u, v, h + 1.2)], '#7d8186', 0.8);
  box(g, u0, u1, v - 0.5, v + 0.5, h + 1.2, h + 1.2 + hh, '#f6f5f1');
  const pt = onFace(g, 's', v + 0.5);
  const a = (u0 + u1) / 2;
  const c = h + 1.2 + hh / 2;
  const s = hh * 0.36;
  const t = s * 0.36;
  poly(g, [pt(a - s, c - t), pt(a + s, c - t), pt(a + s, c + t), pt(a - s, c + t)], RED, null);
  poly(g, [pt(a - t, c - s), pt(a + t, c - s), pt(a + t, c + s), pt(a - t, c + s)], RED, null);
}

/** Rotes Kreuz flach auf dem Dach (weißes Feld). */
function roofCross(g, u, v, h, s) {
  const t = s * 0.34;
  flat(g, u - s - 1, u + s + 1, v - s - 1, v + s + 1, '#fbfaf7', h);
  flat(g, u - s, u + s, v - t, v + t, RED, h);
  flat(g, u - t, u + t, v - s, v + s, RED, h);
}

/** Hubschrauber-Landeplatz (Boden oder Dach): dunkle Scheibe, weißer Ring, „H“, Randlichter. */
function helipad(g, u, v, r, h = 0) {
  poly(g, groundRing(g, u, v, r + 1, h), '#8f8e86', null);
  poly(g, groundRing(g, u, v, r, h), '#45484c', null);
  poly(g, groundRing(g, u, v, r * 0.86, h), '#ecebe4', null);
  poly(g, groundRing(g, u, v, r * 0.76, h), '#45484c', null);
  const b = r * 0.38;
  const w = r * 0.27;
  const t = r * 0.075;
  const m = '#f2f0e6';
  flat(g, u - w - t, u - w + t, v - b, v + b, m, h);
  flat(g, u + w - t, u + w + t, v - b, v + b, m, h);
  flat(g, u - w, u + w, v - t, v + t, m, h);
  if (!g.fine) return;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const [x, y] = g.P(u + (r + 0.45) * Math.cos(a), v + (r + 0.45) * Math.sin(a), h);
    circle(g.ctx, x, y, Math.max(0.6, 0.55 * g.z), k % 2 ? '#ffe27a' : '#8af08f');
  }
}

/** Klinikbau: weiß, Fensterbänder je Geschoss, Flachdach mit Brüstung. */
function clinic(g, u0, u1, v0, v1, floors, seed) {
  const H = floors * 7;
  shadow(g, u0, u1, v0, v1, H);
  box(g, u0, u1, v0, v1, 0, H, HOSP, '#d9d8d2');
  plinth(g, u0, u1, v0, v1, '#c9c7c0', 1);
  for (let f = 0; f < floors; f++) {
    const h0 = f * 7 + 2.4;
    ribbon(g, 's', v1, u0 + 1.6, u1 - 1.6, h0, h0 + 3.4, seed + f * 11);
    ribbon(g, 'e', u1, v0 + 1.6, v1 - 1.6, h0, h0 + 3.4, seed + f * 13);
    if (f) ledge(g, u0, u1, v0, v1, f * 7, 'rgba(0,0,0,0.08)', 0.6);
  }
  box(g, u0 - 0.4, u1 + 0.4, v0 - 0.4, v1 + 0.4, H, H + 1.6, '#e3e2dc');
  parapet(g, u0 - 0.4, u1 + 0.4, v0 - 0.4, v1 + 0.4, H + 1.6, '#e3e2dc', '#c9c8c1');
  return H;
}

/** Eingangshalle aus Glas mit Vordach auf Stützen. */
function lobby(g, u0, u1, v0, v1, H, seed) {
  shadow(g, u0, u1, v0, v1, H);
  box(g, u0, u1, v0, v1, 0, H, '#e8e7e2');
  storefront(g, 's', v1, u0 + 1, u1 - 1, 0.4, H - 1.4, 3, (u0 + u1) / 2, seed);
  storefront(g, 'e', u1, v0 + 1, v1 - 1, 0.4, H - 1.4, 3, null, seed + 1);
  box(g, u0 - 0.3, u1 + 0.3, v0 - 0.3, v1 + 0.3, H, H + 0.8, '#d9d8d2');
}

function canopy(g, u0, u1, v0, v1, h) {
  const { P } = g;
  for (const u of [u0 + 0.8, u1 - 0.8]) stroke(g, [P(u, v1 - 0.8, 0), P(u, v1 - 0.8, h)], '#9aa0a5', 0.8);
  box(g, u0, u1, v0, v1, h, h + 0.8, '#eceae4');
}

/** Stufe 1: Klinik mit zwei Geschossen, Vordach, Schild und Krankenwagen. */
function hosp1(g, o) {
  lawn(g, false);
  flat(g, -25, 25, 9, 25, '#c9c4b8');
  flat(g, 3, 25, 11, 25, ASPH);
  const { P } = g;
  for (const u of [8, 13, 18]) stroke(g, [P(u, 12, 0), P(u, 18, 0)], 'rgba(240,240,235,0.8)', 0.5);
  tree(g, 21, -20, 0.85, o.v);
  const H = clinic(g, -19, 13, -17, 4, 2, o.seed);
  roofCross(g, -9, -7, H + 0.35, 4);
  roofSign(g, 1, 10, 3, H + 1.6, 5.5);
  canopy(g, -9, 1, 4, 9, 6.2);
  van(g, 10.5, 15, 'u', '#f4f3ef', RED, true);
  tree(g, -21, 20, 0.85, o.v + 1);
  bush(g, -12, 21, 0.8, o.v + 2);
}

/** Stufe 2: drei Geschosse, gläserne Eingangshalle, zwei Krankenwagen. */
function hosp2(g, o) {
  lawn(g, false);
  flat(g, -25, 25, 10, 25, '#c9c4b8');
  flat(g, 9, 25, 3, 25, ASPH);
  tree(g, 21, -21, 0.8, o.v);
  const H = clinic(g, -21, 15, -19, 1, 3, o.seed);
  roofCross(g, -10, -9, H + 0.35, 4.5);
  roofSign(g, 5, 13.5, 0.5, H + 1.6, 6);
  lobby(g, -12, 4, 1, 9, 7.5, o.seed);
  canopy(g, -9, 1, 9, 14, 6);
  van(g, 14.5, 9, 'v', '#f4f3ef', RED, true);
  van(g, 20.5, 9, 'v', '#f4f3ef', RED, false);
  tree(g, -21, 19, 0.85, o.v + 1);
  bush(g, 5, 21, 0.8, o.v);
}

/** Stufe 3: vier Geschosse mit Hubschrauber-Landeplatz auf dem Dach. */
function hosp3(g, o) {
  lawn(g, false);
  flat(g, -25, 25, 10, 25, '#c9c4b8');
  flat(g, 9, 25, 3, 25, ASPH);
  const H = clinic(g, -22, 16, -21, 1, 4, o.seed);
  helipad(g, -8, -10, 7.6, H + 0.35);
  box(g, 7, 13, -18, -12, H + 0.3, H + 4.5, '#e3e2dc', '#c9c8c1');
  roofSign(g, 6, 14.5, 0.5, H + 1.6, 6);
  lobby(g, -12, 4, 1, 9, 7.5, o.seed);
  canopy(g, -9, 1, 9, 14, 6);
  van(g, 14.5, 9, 'v', '#f4f3ef', RED, true);
  van(g, 20.5, 9, 'v', '#f4f3ef', RED, true);
  tree(g, -21, 19, 0.85, o.v + 1);
  tree(g, 21.5, -21.5, 0.75, o.v);
  bush(g, 5, 21, 0.8, o.v);
}

// ---------- Heliport ----------

const APRON = '#b7b5ac';

function apron(g) {
  flat(g, -25, 25, -25, 25, APRON);
  if (!g.fine) return;
  const { P } = g;
  for (let k = -15; k <= 15; k += 10) {
    stroke(g, [P(k, -25, 0), P(k, 25, 0)], 'rgba(0,0,0,0.08)', 0.5);
    stroke(g, [P(-25, k, 0), P(25, k, 0)], 'rgba(0,0,0,0.08)', 0.5);
  }
}

/** Kontrollturm: schmaler Schaft, Glaskanzel, Dach mit Antenne. */
function ctlTower(g, u, v, H) {
  shadow(g, u - 3.2, u + 3.2, v - 3.2, v + 3.2, H + 6);
  box(g, u - 3.2, u + 3.2, v - 3.2, v + 3.2, 0, H, '#dcd8ce');
  winsAt(g, 's', v + 3.2, [u], [[H * 0.3, H * 0.3 + 2.4], [H * 0.62, H * 0.62 + 2.4]], 1.8, { seed: 5 });
  door(g, 'e', u + 3.2, v, 2.2, 4.6, '#55606a');
  box(g, u - 4.4, u + 4.4, v - 4.4, v + 4.4, H, H + 0.8, '#cfcbc1');
  box(g, u - 4.1, u + 4.1, v - 4.1, v + 4.1, H + 0.8, H + 4.8, '#3f6684', '#3f6684');
  if (g.fine) {
    const { P } = g;
    for (let a = -4.1 + 2.05; a < 4.1; a += 2.05) {
      stroke(g, [P(u + a, v + 4.1, H + 0.8), P(u + a, v + 4.1, H + 4.8)], 'rgba(225,230,235,0.75)', 0.45);
      stroke(g, [P(u + 4.1, v + a, H + 0.8), P(u + 4.1, v + a, H + 4.8)], 'rgba(225,230,235,0.75)', 0.45);
    }
  }
  box(g, u - 4.7, u + 4.7, v - 4.7, v + 4.7, H + 4.8, H + 5.8, '#eceae4');
  const { P } = g;
  stroke(g, [P(u + 1.5, v - 1.5, H + 5.8), P(u + 1.5, v - 1.5, H + 11)], '#55595d', 0.7);
  const [x, y] = P(u + 1.5, v - 1.5, H + 11.3);
  circle(g.ctx, x, y, Math.max(0.8, 1 * g.z), '#ff4a3a');
}

/** Windsack an einem Mast (orange und weiß gestreift). */
function windsock(g, u, v) {
  const { P } = g;
  stroke(g, [P(u, v, 0), P(u, v, 9.5)], '#cfd2d4', 0.8);
  const seg = [[0, 1.3], [1.6, 1.15], [3.2, 0.95], [4.8, 0.75], [6.2, 0.6]];
  for (let k = 0; k < seg.length - 1; k++) {
    const [a0, r0] = seg[k];
    const [a1, r1] = seg[k + 1];
    const d = 0.25; // hängt etwas durch
    poly(g, [P(u + a0, v, 9.2 + r0 - a0 * d * 0.3), P(u + a1, v, 9.2 + r1 - a1 * d * 0.3 - 0.2), P(u + a1, v, 9.2 - r1 - a1 * d * 0.3 - 0.2), P(u + a0, v, 9.2 - r0 - a0 * d * 0.3)], k % 2 ? '#f4f1ea' : '#f07a2a', 'rgba(60,40,30,0.4)');
  }
}

/** Treibstofftank (stehend, mit Ring). */
function fuelTank(g, u, v, r, h) {
  cyl(g, u, v, r, 0, h, '#d9d6cc');
  if (g.fine) seam(g, u, v, r, h * 0.5);
  cap(g, u, v, r, h, '#d9d6cc', 0.35);
}

/** Hangar mit Tonnendach (First entlang v) und großem Tor nach vorn. */
function hangar(g, u0, u1, v0, v1, H, rh, seed) {
  shadow(g, u0, u1, v0, v1, H + rh);
  box(g, u0, u1, v0, v1, 0, H, '#c9cbc6', '#b4b7b2');
  ribs(g, u0, u1, v0, v1, 0.6, H - 0.4, 2.2);
  vault(g, 'v', u0, u1, v0, v1, H, rh, '#8d9aa4', '#c9cbc6');
  const pt = onFace(g, 's', v1);
  const a0 = u0 + 2;
  const a1 = u1 - 2;
  poly(g, [pt(a0, 0), pt(a1, 0), pt(a1, H + rh * 0.55), pt(a0, H + rh * 0.55)], lit('#7d8a93', ...FACE.s), OUTLINE);
  if (g.fine) for (let a = a0 + 2.3; a < a1 - 0.5; a += 2.3) stroke(g, [pt(a, 0), pt(a, H + rh * 0.55)], 'rgba(0,0,0,0.22)', 0.5);
  winsAt(g, 'e', u1, [v0 + 3.5, v0 + 8], [[3, 5.6]], 2.4, { seed });
}

/** Stufe 1: Landeplatz, Kontrollturm und Windsack. */
function heli1(g, o) {
  apron(g);
  ctlTower(g, -19, -19, 12);
  windsock(g, 18, -21);
  helipad(g, 3, 3, 14.5);
  void o;
}

/** Stufe 2: dazu Tanklager und ein höherer Turm. */
function heli2(g, o) {
  apron(g);
  ctlTower(g, -19, -19, 14);
  windsock(g, 18, -21);
  helipad(g, 3, 3, 14.5);
  fuelTank(g, -20.5, 13.5, 2.8, 6);
  fuelTank(g, -14.5, 19.5, 2.8, 6);
  void o;
}

/** Stufe 3: Hangar, Kontrollturm, Tanklager, Landeplatz nach vorn verschoben. */
function heli3(g, o) {
  apron(g);
  ctlTower(g, -19, -19, 16);
  hangar(g, 6, 24, -24, -8, 8, 6.5, o.seed);
  helipad(g, -4, 6, 13.5);
  fuelTank(g, -21.5, 17, 2.6, 6);
  fuelTank(g, -17, 21.5, 2.6, 6);
  windsock(g, 19, 13);
}

// ---------- Förderanlagen ----------

/** Holzstapel: Prisma aus Stämmen entlang u, Stirnseiten (Kreise) an u1. */
function logPile(g, u0, u1, v0, v1, rows) {
  const { P } = g;
  const r = (v1 - v0) / (2 * rows);
  const H = r * (2 + 1.7 * (rows - 1));
  const vm = (v0 + v1) / 2;
  flat(g, u0, u1 + 0.6, v0, v1 + 2.2, 'rgba(0,0,0,0.18)');
  poly(g, [P(u0, v0, 0), P(u1, v0, 0), P(u1, vm, H), P(u0, vm, H)], lit('#6e4c2e', 0, -H, r * rows), null);
  poly(g, [P(u0, vm, H), P(u1, vm, H), P(u1, v1, 0), P(u0, v1, 0)], lit('#7d5734', 0, H, r * rows), OUTLINE);
  if (g.fine) {
    for (let k = 1; k < rows; k++) {
      const t = k / rows;
      stroke(g, [P(u0, vm + (v1 - vm) * t, H * (1 - t)), P(u1, vm + (v1 - vm) * t, H * (1 - t))], 'rgba(40,25,10,0.35)', 0.5);
    }
  }
  poly(g, [P(u1, v0, 0), P(u1, v1, 0), P(u1, vm, H)], lit('#5d4027', ...FACE.e), null);
  for (let row = 0; row < rows; row++) {
    for (let k = 0; k < rows - row; k++) {
      const vv = v0 + r * (1 + row) + k * 2 * r;
      const hh = r + row * r * 1.7;
      disc(g, 'e', u1, vv, hh, r * 0.92, '#dcb47e', 'rgba(110,70,35,0.7)', 0.1, 10);
      if (g.fine) disc(g, 'e', u1, vv, hh, r * 0.42, '#c99a62', null, 0.15, 8);
    }
  }
}

/** Blockhütte mit Satteldach, Schornstein, Tür und Fenster. */
function cabin(g, u0, u1, v0, v1, H, rh, roof, seed) {
  const wall = '#8b5e3a';
  shadow(g, u0, u1, v0, v1, H + rh);
  box(g, u0, u1, v0, v1, 0, H, wall);
  if (g.fine) for (let h = 1.3; h < H; h += 1.45) ledge(g, u0, u1, v0, v1, h, 'rgba(40,25,10,0.32)', 0.5);
  door(g, 's', v1, u0 + (u1 - u0) * 0.28, 2.8, 5.6, '#5b3b22');
  winsAt(g, 's', v1, [u0 + (u1 - u0) * 0.72], [[2.6, 5.2]], 2.4, { seed, cross: true, frame: '#d9c7a5' });
  winsAt(g, 'e', u1, [(v0 + v1) / 2], [[2.6, 5.2]], 2.2, { seed: seed + 1, cross: true, frame: '#d9c7a5' });
  const cu = u0 + (u1 - u0) * 0.75;
  gable(g, 'u', u0, u1, v0, v1, H, rh, roof, wall, () => box(g, cu - 1, cu + 1, v0 + 1.4, v0 + 3.4, H, H + rh + 3, '#8f8a82', '#6f6a63'));
}

/** Baumstumpf. */
function stump(g, u, v) {
  cyl(g, u, v, 1.2, 0, 1.3, '#7a5634');
}

/** Offener Schuppen: Stützen, Inhalt (fill), Satteldach. */
function shed(g, u0, u1, v0, v1, H, rh, roof, fill) {
  const { P } = g;
  shadow(g, u0, u1, v0, v1, H + rh, 0.14);
  stroke(g, [P(u0, v0, 0), P(u0, v0, H)], '#6b5a48', 1);
  stroke(g, [P(u1, v0, 0), P(u1, v0, H)], '#6b5a48', 1);
  fill?.();
  stroke(g, [P(u0, v1, 0), P(u0, v1, H)], '#6b5a48', 1);
  stroke(g, [P(u1, v1, 0), P(u1, v1, H)], '#6b5a48', 1);
  gable(g, 'u', u0, u1, v0, v1, H, rh, roof, '#8b6a48');
}

/** Sägetisch mit Kreissäge und Stamm. */
function sawTable(g, u0, u1, v) {
  box(g, u0, u1, v - 1.4, v + 1.4, 0, 2.6, '#6d7277', '#8a8f94');
  logPile(g, u0 + 1, u0 + (u1 - u0) * 0.6, v - 0.9, v + 0.9, 1);
  disc(g, 's', v, u0 + (u1 - u0) * 0.75, 2.6, 1.8, '#c9ccd0', 'rgba(60,60,60,0.6)', 0, 14);
}

/** Bretterstapel. */
function planks(g, u0, u1, v0, v1, h) {
  box(g, u0, u1, v0, v1, 0, h, '#d4ad78', '#e2c28f');
  if (!g.fine) return;
  const { P } = g;
  for (let k = 0.7; k < h; k += 0.7) stroke(g, [P(u0, v1, k), P(u1, v1, k), P(u1, v0, k)], 'rgba(90,60,30,0.35)', 0.4);
  for (let k = 0.8; k < h - 0.3; k += 1.4) stroke(g, [P(u0, v1, k), P(u1, v1, k)], 'rgba(60,40,20,0.25)', 0.5);
}

/** Radlader (gelb) mit Schaufel nach +u. */
function loader(g, u, v) {
  flat(g, u - 4, u + 5, v - 2.4, v + 3.6, 'rgba(0,0,0,0.2)');
  for (const [a, b] of [[u - 2.6, v - 2.2], [u + 2, v - 2.2]]) box(g, a - 1.1, a + 1.1, b - 0.5, b, 0, 2.2, '#2f3134');
  box(g, u - 3.8, u + 3, v - 1.8, v + 1.8, 1, 3.6, '#e2b021', '#e9c24a');
  box(g, u - 3.4, u - 0.6, v - 1.6, v + 1.6, 3.6, 6.6, '#e2b021', '#e9c24a');
  const { P } = g;
  poly(g, [P(u - 3.4, v + 1.6, 4.4), P(u - 0.6, v + 1.6, 4.4), P(u - 0.6, v + 1.6, 6.2), P(u - 3.4, v + 1.6, 6.2)], lit('#34506d', ...FACE.s), null);
  for (const [a, b] of [[u - 2.6, v + 2.2], [u + 2, v + 2.2]]) box(g, a - 1.1, a + 1.1, b - 0.1, b + 0.4, 0, 2.2, '#2f3134');
  box(g, u + 3.4, u + 5.4, v - 2.2, v + 2.2, 0.4, 2.4, '#5d6064');
}

/** Holzfäller: Hütte, Holzstapel, Nadelbäume und Stümpfe; Stufe 2 mit Sägeschuppen, Stufe 3 mit Sägewerk und Radlader. */
function wood(g, lv, o) {
  flat(g, -25, 25, -25, 25, snowy('#7f9157'));
  flat(g, -10, 22, -8, 22, '#9c8462');
  conifer(g, -21, -21, 0.9);
  conifer(g, -12, -22.5, 0.85);
  conifer(g, -22.5, -11, 0.9);
  if (lv === 1) {
    cabin(g, -4, 9, -20, -11, 6.5, 4.5, '#5b4636', o.seed);
    logPile(g, -19, -9, 2, 8, 2);
    logPile(g, 2, 15, -4, 2, 3);
    conifer(g, 21, -20, 0.9);
    stump(g, 17, 9);
    stump(g, 20, 15);
    stump(g, -4, 17);
    crate(g, 8, 12, 1, 1.4, '#7a5634');
    conifer(g, -20, 19, 0.85);
  } else if (lv === 2) {
    cabin(g, -21, -10, -9, 0, 6, 4.5, '#5b4636', o.seed);
    shed(g, 2, 22, -22, -10, 6.5, 4, '#6b5847', () => sawTable(g, 5, 19, -16));
    logPile(g, -19, -7, 5, 11, 3);
    logPile(g, 3, 17, 1, 7, 3);
    stump(g, 20, 12);
    stump(g, 9, 18);
    conifer(g, -21, 20, 0.85);
    conifer(g, 21, 20, 0.8);
  } else {
    // Sägewerk: geschlossene Halle mit Tor und Absaugung
    const wall = '#9a7a56';
    shadow(g, -2, 22, -23, -9, 16);
    box(g, -2, 22, -23, -9, 0, 9, wall);
    if (g.fine) for (let a = 0; a < 22; a += 1.6) stroke(g, [g.P(a, -9, 0.3), g.P(a, -9, 9)], 'rgba(50,30,15,0.25)', 0.45);
    const pt = onFace(g, 's', -9);
    poly(g, [pt(5, 0), pt(13, 0), pt(13, 7), pt(5, 7)], lit('#5b4636', ...FACE.s), OUTLINE);
    gable(g, 'u', -2, 22, -23, -9, 9, 5.5, '#5f5a52', wall, () => {
      cyl(g, 4, -18, 1.8, 13, 18, '#a9aeb2');
      frustum(g, 4, -18, 0.5, 1.8, 10.5, 13, '#a9aeb2', false);
    });
    cabin(g, -22, -12, -22, -14, 5.5, 4, '#5b4636', o.seed);
    logPile(g, -21, -8, -6, 2, 4);
    logPile(g, -21, -10, 5, 11, 3);
    planks(g, 6, 14, 3, 7, 3.2);
    planks(g, 15, 22, 3, 7, 2.4);
    loader(g, -2, 12);
    planks(g, 8, 18, 12, 16, 2.6);
    conifer(g, -21, 21, 0.85);
    conifer(g, 21.5, 20.5, 0.75);
  }
}

/** Steinbruch-Grube mit Absätzen (hinten und links sichtbar), auf die Öffnung beschnitten. */
function quarryPit(g, u0, u1, v0, v1, steps, d, s, rock) {
  const { P, ctx } = g;
  const D = steps * d;
  ctx.save();
  ctx.beginPath();
  [P(u0, v0, 0), P(u1, v0, 0), P(u1, v1, 0), P(u0, v1, 0)].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
  flat(g, u0 - D, u1, v0 - D, v1, lit(shade(rock, 0.18), ...FACE.top), -D);
  for (let k = 0; k < steps; k++) {
    const a = u0 + k * s;
    const b = v0 + k * s;
    const h0 = -k * d;
    const h1 = -(k + 1) * d;
    poly(g, [P(a, b, h0), P(u1 + 4, b, h0), P(u1 + 4, b, h1), P(a, b, h1)], lit(shade(rock, 0.06), ...FACE.s), null);
    poly(g, [P(a, b, h0), P(a, v1 + 4, h0), P(a, v1 + 4, h1), P(a, b, h1)], lit(shade(rock, 0.1), ...FACE.e), null);
    if (k < steps - 1) {
      const a2 = a + s;
      const b2 = b + s;
      poly(g, [P(a, b, h1), P(u1 + 4, b, h1), P(u1 + 4, b2, h1), P(a2, b2, h1), P(a2, v1 + 4, h1), P(a, v1 + 4, h1)], lit(tint(rock, 0.06), ...FACE.top), null);
    }
    if (g.fine) stroke(g, [P(a, v1 + 4, h1 + 0.2), P(a, b, h1 + 0.2), P(u1 + 4, b, h1 + 0.2)], 'rgba(0,0,0,0.12)', 0.5);
  }
  ctx.restore();
  stroke(g, [P(u0, v1, 0), P(u0, v0, 0), P(u1, v0, 0)], 'rgba(255,255,255,0.35)', 0.8);
  stroke(g, [P(u0, v1, 0), P(u1, v1, 0), P(u1, v0, 0)], 'rgba(60,50,40,0.35)', 0.7);
}

/** Schüttkegel (Kies, Erz). */
function heap(g, u, v, r, h, color) {
  const { ctx, P, z } = g;
  const [x, y] = P(u, v, 0);
  const [, ty] = P(u, v, h);
  const R = r * z;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x - R * 0.3, y + R * 0.12, R * 1.05, R * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  const grad = ctx.createLinearGradient(x - R, 0, x + R, 0);
  grad.addColorStop(0, tint(color, 0.18));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, shade(color, 0.4));
  ctx.beginPath();
  ctx.moveTo(x - R, y);
  ctx.quadraticCurveTo(x - R * 0.35, ty + (y - ty) * 0.1, x, ty);
  ctx.quadraticCurveTo(x + R * 0.35, ty + (y - ty) * 0.1, x + R, y);
  ctx.ellipse(x, y, R, R / 2, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.8 * z);
  ctx.stroke();
  if (!g.fine) return;
  ctx.fillStyle = shade(color, 0.3);
  for (let k = 0; k < 9; k++) {
    const a = rnd(k * 17 + u) * 1.6 - 0.8;
    const b = rnd(k * 29 + v);
    const px = x + a * R * (1 - b * 0.8);
    const py = y - (y - ty) * b * 0.85 + R * 0.12;
    ctx.fillRect(px, py, Math.max(1, 0.5 * z), Math.max(1, 0.5 * z));
  }
}

/** Förderband von (u0,v0,h0) nach (u1,v1,h1) auf Stützen. */
function conveyor(g, u0, v0, h0, u1, v1, h1, w = 1.3) {
  const { P } = g;
  const L = Math.hypot(u1 - u0, v1 - v0);
  const n = Math.max(1, Math.round(L / 7));
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    const h = h0 + (h1 - h0) * t;
    if (h > 0.5) stroke(g, [P(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, 0), P(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, h)], '#5d6266', 0.7);
  }
  const pu = (-(v1 - v0) / L) * (w / 2);
  const pv = ((u1 - u0) / L) * (w / 2);
  poly(g, [P(u0 + pu, v0 + pv, h0), P(u1 + pu, v1 + pv, h1), P(u1 - pu, v1 - pv, h1), P(u0 - pu, v0 - pv, h0)], '#3b3e41', OUTLINE);
  stroke(g, [P(u0 + pu, v0 + pv, h0 + 0.7), P(u1 + pu, v1 + pv, h1 + 0.7)], '#9aa0a5', 0.5);
}

/** Brecher: Kasten mit Trichter oben. */
function crusher(g, u, v, H, col = '#6f7a80') {
  shadow(g, u - 3.5, u + 3.5, v - 3.5, v + 3.5, H + 3);
  box(g, u - 3.5, u + 3.5, v - 3.5, v + 3.5, 0, H, col, tint(col, 0.1));
  frustum(g, u, v, 1.8, 3.6, H, H + 3, '#8a9399', false);
  const { ctx, z } = g;
  const [x, y] = g.P(u, v, H + 3);
  ctx.fillStyle = '#3a3d40';
  ctx.beginPath();
  ctx.ellipse(x, y, 3.6 * z, 1.8 * z, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Bagger (gelb) mit Ausleger nach +u, auf Höhe h. */
function excavator(g, u, v, h) {
  box(g, u - 3.5, u + 3.5, v - 2.6, v + 2.6, h, h + 1.6, '#3b3b3b');
  box(g, u - 3, u + 2.2, v - 2.2, v + 2.2, h + 1.6, h + 4, '#e2b021', '#e9c24a');
  box(g, u - 0.2, u + 2.2, v - 2.2, v - 0.2, h + 4, h + 6.6, '#e2b021', '#e9c24a');
  const pt = onFace(g, 's', v + 0.6);
  stroke(g, [pt(u + 1.6, h + 4), pt(u + 6.5, h + 8.6), pt(u + 9.4, h + 3)], '#d39d14', 1.3);
  poly(g, [pt(u + 8.4, h + 3.4), pt(u + 10.8, h + 3), pt(u + 10.2, h + 0.8), pt(u + 8.6, h + 1.2)], lit('#5d6064', ...FACE.s));
}

/** Muldenkipper (gelbe Mulde mit Kies, helles Fahrerhaus vorn bei +u). */
function truck(g, u, v) {
  flat(g, u - 5, u + 5.5, v - 2.4, v + 3.8, 'rgba(0,0,0,0.2)');
  box(g, u - 5, u + 1.6, v - 2.2, v + 2.2, 0.9, 4.4, '#e2b021', '#c99a14');
  box(g, u - 4.4, u + 1, v - 1.6, v + 1.6, 4.4, 5.2, '#bdb6a8', '#cfc8ba', null);
  box(g, u + 1.8, u + 5, v - 2, v + 2, 0.9, 5, '#d4d0c6', '#e0ddd5');
  const { P } = g;
  poly(g, [P(u + 5, v - 1.6, 3), P(u + 5, v + 1.6, 3), P(u + 5, v + 1.6, 4.6), P(u + 5, v - 1.6, 4.6)], lit('#34506d', ...FACE.e), null);
  for (const a of [u - 3.4, u + 3.4]) box(g, a - 1, a + 1, v + 2, v + 2.5, 0, 1.9, '#2f3134');
}

/** Steinbruch: Grube mit Absätzen, Blöcke, Hütte; Stufe 2 mit Förderband, Brecher und Kies, Stufe 3 mit Bagger und Kipper. */
function stone(g, lv, o) {
  const rock = '#b9b2a5';
  flat(g, -25, 25, -25, 25, '#b0a794');
  if (lv === 1) {
    quarryPit(g, -23, 5, -23, 5, 3, 3, 3.4, rock);
    for (const [u, v] of [[13, -21], [17, -21], [21, -21], [15, -17], [19, -17]]) crate(g, u, v, 1.6, 2.6, '#d2cdc2');
    crate(g, 17, -19, 1.5, 5, '#d2cdc2');
    hut(g, 9, 21, 9, 17, 5.5, 3.6, '#8d7d6a', '#6b5f52', 'u');
  } else {
    quarryPit(g, -23, 3, -23, 3, lv === 3 ? 4 : 3, 3, 3.2, rock);
    if (lv === 3) excavator(g, -16, -15, -3);
    crusher(g, 16, -15, lv === 3 ? 9 : 6, '#6f7a80');
    conveyor(g, -6, -6, -5, 12.5, -14, lv === 3 ? 11 : 8.5);
    heap(g, 18, 3, 6, 6, '#bdb6a8');
    if (lv === 3) heap(g, 8, 11, 5, 5, '#a9a194');
    for (const [u, v] of [[-19, 12], [-15, 12], [-19, 16]]) crate(g, u, v, 1.6, 2.6, '#d2cdc2');
    if (lv === 3) truck(g, -2, 18);
  }
  bush(g, -21, 21, 0.8, o.v);
  if (lv === 1) {
    rubble(g, 10, 2);
    rubble(g, -2, 13);
  }
}

/** Kleine Hütte mit Satteldach (First entlang axis), Tür und Fenster. */
function hut(g, u0, u1, v0, v1, H, rh, wall, roof, axis) {
  shadow(g, u0, u1, v0, v1, H + rh);
  box(g, u0, u1, v0, v1, 0, H, wall);
  plinth(g, u0, u1, v0, v1, wall, 1);
  door(g, 's', v1, u0 + (u1 - u0) * 0.3, 2.6, 4.6, '#5b4a3a');
  winsAt(g, 'e', u1, [(v0 + v1) / 2], [[2.2, 4.4]], 2.2, { seed: 9, cross: true });
  gable(g, axis, u0, u1, v0, v1, H, rh, roof, wall);
}

/** Ein paar lose Steine. */
function rubble(g, u, v) {
  for (const [du, dv, s] of [[0, 0, 1], [1.8, 0.6, 0.7], [0.6, 1.8, 0.8]]) box(g, u + du - s, u + du + s, v + dv - s, v + dv + s, 0, s * 1.2, '#a59d8f', '#c2bbae');
}

/** Speichenrad (Seilscheibe) in einer Wandebene. */
function wheel(g, face, plane, a, h, r, color) {
  const pt = onFace(g, face, plane);
  const rim = [];
  for (let k = 0; k <= 24; k++) {
    const t = (k / 24) * Math.PI * 2;
    rim.push(pt(a + r * Math.cos(t), h + r * Math.sin(t)));
  }
  stroke(g, rim, color, 1.1);
  if (g.fine) {
    for (let k = 0; k < 4; k++) {
      const t = (k / 4) * Math.PI;
      stroke(g, [pt(a + r * Math.cos(t), h + r * Math.sin(t)), pt(a - r * Math.cos(t), h - r * Math.sin(t))], color, 0.45);
    }
  }
  disc(g, face, plane, a, h, r * 0.18, color, null, 0, 8);
}

/** Förderturm: Stahlgerüst mit Streben, Bühne und Seilscheibe(n); gibt die Höhe des Scheibenmittelpunkts zurück. */
function headframe(g, u, v, w, H, color, wheels = 1) {
  const { P } = g;
  const u0 = u - w;
  const u1 = u + w;
  const v0 = v - w;
  const v1 = v + w;
  const dark = shade(color, 0.2);
  for (const [a, b, wd] of [[u0, v0, 1], [u1, v0, 1.2], [u0, v1, 1.2]]) stroke(g, [P(a, b, 0), P(a, b, H)], dark, wd);
  const n = Math.max(3, Math.round(H / 5));
  for (let k = 0; k < n; k++) {
    const h0 = (H * k) / n;
    const h1 = (H * (k + 1)) / n;
    stroke(g, [P(u0, v1, h0), P(u1, v1, h1)], color, 0.55);
    stroke(g, [P(u1, v1, h0), P(u0, v1, h1)], color, 0.55);
    stroke(g, [P(u1, v0, h0), P(u1, v1, h1)], color, 0.55);
    stroke(g, [P(u1, v1, h0), P(u1, v0, h1)], color, 0.55);
    stroke(g, [P(u0, v1, h1), P(u1, v1, h1), P(u1, v0, h1)], color, 0.5);
  }
  stroke(g, [P(u1, v1, 0), P(u1, v1, H)], dark, 1.3);
  box(g, u0 - 0.9, u1 + 0.9, v0 - 0.9, v1 + 0.9, H, H + 1.2, color);
  const r = w + 1.4;
  const hc = H + 1.2 + r;
  for (const dv of wheels === 2 ? [-w * 0.6, w * 0.6] : [0]) {
    stroke(g, [P(u - r * 0.55, v + dv, H + 1.2), P(u, v + dv, hc), P(u + r * 0.55, v + dv, H + 1.2)], dark, 0.8);
    wheel(g, 's', v + dv, u, hc, r, '#2f3236');
  }
  return { hc, r };
}

/** Maschinenhaus aus Ziegeln mit Rundbogenfenstern und Satteldach (First entlang u). */
function brickHouse(g, u0, u1, v0, v1, H, rh, seed) {
  const wall = '#a35a40';
  shadow(g, u0, u1, v0, v1, H + rh);
  box(g, u0, u1, v0, v1, 0, H, wall);
  plinth(g, u0, u1, v0, v1, wall);
  const n = Math.max(2, Math.round((u1 - u0) / 5));
  const at = [];
  for (let k = 0; k < n; k++) at.push(u0 + ((u1 - u0) * (k + 0.5)) / n);
  archWins(g, 's', v1, at, 2.4, H - 3, 2.4, { seed, frame: '#e2cfb4' });
  archWins(g, 'e', u1, [(v0 + v1) / 2], 2.4, H - 3, 2.4, { seed: seed + 1, frame: '#e2cfb4' });
  gable(g, 'u', u0, u1, v0, v1, H, rh, '#4f4f52', wall);
}

/** Schienen entlang u mit Schwellen. */
function rails(g, u0, u1, v) {
  const { P } = g;
  if (g.fine) for (let a = u0; a <= u1; a += 1.6) stroke(g, [P(a, v - 1.5, 0), P(a, v + 1.5, 0)], '#6b5a48', 0.75);
  for (const d of [-0.95, 0.95]) stroke(g, [P(u0, v + d, 0.25), P(u1, v + d, 0.25)], '#45484b', 0.6);
}

/** Förderwagen auf den Schienen, mit Erz beladen. */
function oreCart(g, u, v, ore) {
  box(g, u - 2, u + 2, v - 1.3, v + 1.3, 0.6, 3, '#5d6266', '#6d7276');
  box(g, u - 1.6, u + 1.6, v - 1, v + 1, 3, 3.8, ore, tint(ore, 0.12), null);
}

/** Erzmine: Förderturm mit Seilscheibe, Maschinenhaus, Erzhalde, Gleis mit Wagen; Stufe 3 mit Doppelscheibe und Erzbunker. */
function ore(g, lv, o) {
  const ORE = '#8a4b2e';
  const RUST = '#a33a2a';
  flat(g, -25, 25, -25, 25, '#9b8b77');
  const H = [0, 22, 27, 31][lv];
  const w = [0, 3.2, 3.5, 3.9][lv];
  const hu = -13;
  const hv = -13;
  const { hc, r } = headframe(g, hu, hv, w, H, RUST, lv === 3 ? 2 : 1);
  const [x0, x1] = lv === 1 ? [1, 15] : [2, 19];
  const [y0, y1] = lv === 1 ? [-19, -8] : [-21, -8];
  const hh = lv === 1 ? 8 : 10;
  brickHouse(g, x0, x1, y0, y1, hh, 5, o.seed);
  const { P } = g;
  for (const dv of lv === 3 ? [-w * 0.6, w * 0.6] : [0]) stroke(g, [P(hu + r, hv + dv, hc), P(x0, (y0 + y1) / 2 + dv * 0.5, hh + 2.6)], '#2a2a2a', 0.4);
  if (lv === 2) brickHouse(g, -23, -13, 4, 12, 6, 4, o.seed + 3);
  rails(g, -4, 24, lv === 3 ? 20 : 5);
  if (lv === 3) {
    // Erzbunker auf Stützen, Förderband vom Turm
    for (const [a, b] of [[8, 5], [17, 5], [8, 14], [17, 14]]) stroke(g, [P(a, b, 0), P(a, b, 6)], '#55595d', 1);
    box(g, 7, 18, 4, 15, 6, 13, '#6d5446', '#7d6456');
    frustum(g, 12.5, 9.5, 0.9, 3, 3.5, 6, '#55595d', false);
    conveyor(g, hu + w + 1, hv + w + 1, H * 0.55, 9, 7, 13.3);
    heap(g, -15, 15, 7.5, 7, ORE);
    oreCart(g, 13, 20, ORE);
    oreCart(g, 19, 20, ORE);
  } else {
    heap(g, lv === 1 ? -14 : 14, lv === 1 ? 14 : 15, lv === 1 ? 6.5 : 7.5, lv === 1 ? 5.5 : 6.5, ORE);
    oreCart(g, 9, 5, ORE);
    if (lv === 2) oreCart(g, 15, 5, ORE);
  }
  lamp(g, -2, -2, 9);
}

/** Pferdekopfpumpe in der Ebene v (Schwinge entlang u, Pferdekopf bei +u). */
function pumpjack(g, u, v) {
  const pt = (a, h) => g.P(u + a, v, h);
  flat(g, u - 7, u + 8, v - 1.6, v + 3, 'rgba(0,0,0,0.18)');
  box(g, u - 7, u + 6, v - 1.5, v + 1.5, 0, 0.8, '#9a958a');
  stroke(g, [pt(-1.8, 0.8), pt(0, 9.6), pt(1.8, 0.8)], '#5d6266', 1.2);
  box(g, u - 5.8, u - 3.6, v - 1.2, v + 1.2, 0.8, 3.4, '#5d6266');
  disc(g, 's', v + 1.4, u - 4.7, 3.2, 2.3, '#3f4448', OUTLINE, 0, 14);
  stroke(g, [pt(-3.6, 4.2), pt(-6.6, 10.1)], '#3f4448', 0.8);
  stroke(g, [pt(-6.9, 10.3), pt(5, 9.2)], '#d8a227', 2.1);
  poly(g, [g.P(u + 4.6, v, 10.7), g.P(u + 6.8, v, 10), g.P(u + 7.6, v, 7.7), g.P(u + 7.1, v, 5.4), g.P(u + 5.4, v, 7.6), g.P(u + 4.6, v, 8.6)], lit('#d8a227', ...FACE.s));
  stroke(g, [pt(7.2, 5.4), pt(7.2, 1.6)], '#c9cdd0', 0.5);
  box(g, u + 6.4, u + 8, v - 0.8, v + 0.8, 0, 1.8, '#6b7075');
}

/** Öltank mit flachem Kegeldach, Naht und Leiter. */
function oilTank(g, u, v, r, h, team) {
  shadow(g, u - r, u + r, v - r, v + r, h, 0.16);
  cyl(g, u, v, r, 0, h, '#dedbd2', false);
  if (g.fine) {
    seam(g, u, v, r, h * 0.33);
    seam(g, u, v, r, h * 0.66);
  }
  const { P } = g;
  const [x0, y0] = P(u, v, 0);
  const [, y1] = P(u, v, h);
  const { ctx, z } = g;
  ctx.fillStyle = team;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x0 - r * z * 0.65, y1 + (y0 - y1) * 0.2, r * z * 0.5, (y0 - y1) * 0.12);
  ctx.globalAlpha = 1;
  coneRoof(g, u, v, r, h, r * 0.3, '#c9c6bc');
  stroke(g, [P(u + r * 0.7, v + r * 0.7, 0), P(u + r * 0.7, v + r * 0.7, h)], '#7d8186', 0.5);
}

/** Bohrturm auf Unterbau: vier Beine (sichtbar drei), Streben, Bühne oben. */
function derrick(g, u, v, w, H, color = '#b5452f') {
  const { P } = g;
  const base = 4.4;
  box(g, u - w - 2, u + w + 2, v - w - 2, v + w + 2, 0, base, '#7d7a72', '#8f8c84');
  const top = w * 0.22;
  const dark = shade(color, 0.2);
  const leg = (su, sv, wd) => stroke(g, [P(u + su * w, v + sv * w, base), P(u + su * top, v + sv * top, H)], dark, wd);
  leg(-1, -1, 0.9);
  leg(1, -1, 1.1);
  leg(-1, 1, 1.1);
  const n = Math.max(4, Math.round((H - base) / 5.5));
  for (let k = 0; k < n; k++) {
    const t0 = k / n;
    const t1 = (k + 1) / n;
    const r0 = w + (top - w) * t0;
    const r1 = w + (top - w) * t1;
    const h0 = base + (H - base) * t0;
    const h1 = base + (H - base) * t1;
    stroke(g, [P(u - r0, v + r0, h0), P(u + r1, v + r1, h1)], color, 0.5);
    stroke(g, [P(u + r0, v + r0, h0), P(u - r1, v + r1, h1)], color, 0.5);
    stroke(g, [P(u + r0, v - r0, h0), P(u + r1, v + r1, h1)], color, 0.5);
    stroke(g, [P(u + r0, v + r0, h0), P(u + r1, v - r1, h1)], color, 0.5);
    stroke(g, [P(u - r1, v + r1, h1), P(u + r1, v + r1, h1), P(u + r1, v - r1, h1)], color, 0.45);
  }
  leg(1, 1, 1.3);
  box(g, u - top - 0.8, u + top + 0.8, v - top - 0.8, v + top + 0.8, H, H + 1.8, '#7d7a72');
  box(g, u + w + 2, u + w + 6.5, v - 2.2, v + 2.2, 0, 3.2, '#6a6f74', '#7a7f84');
}

/** Ölquelle: Pferdekopfpumpe, Tank, Ölfleck; Stufe 2 zwei Pumpen und zwei Tanks, Stufe 3 Bohrturm. */
function oil(g, lv, o) {
  flat(g, -25, 25, -25, 25, '#a99c83');
  const { P, ctx, z } = g;
  const stain = (u, v, r) => {
    const [x, y] = P(u, v, 0);
    ctx.fillStyle = 'rgba(25,22,20,0.5)';
    ctx.beginPath();
    ctx.ellipse(x, y, r * z * 1.3, r * z * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const pipe = (pts) => stroke(g, pts.map(([u, v]) => P(u, v, 0.6)), '#6b7075', 0.8);
  if (lv === 1) {
    stain(2, -5, 3);
    oilTank(g, 14, -14, 5, 9, o.color);
    pipe([[2, -6], [9, -6], [9, -11]]);
    pumpjack(g, -5, -6);
    for (const [u, v] of [[5, 10], [7.4, 10.6], [6, 12.6]]) cyl(g, u, v, 0.9, 0, 2.4, '#3d5a7a');
  } else if (lv === 2) {
    stain(-6, -12, 2.6);
    stain(9, 8, 2.6);
    oilTank(g, 14, -15, 4.6, 9, o.color);
    oilTank(g, 19.5, -4, 3.6, 7.5, o.color);
    pipe([[-6, -13], [8, -13], [10, -14]]);
    pipe([[9, 7], [16, 7], [17.5, -1]]);
    pumpjack(g, -13, -12);
    hut(g, -22, -14, 9, 19, 5, 3, '#c9c4b8', '#6a6f74', 'v');
    pumpjack(g, 2, 8);
  } else {
    derrick(g, -12, -12, 5, 46);
    oilTank(g, 15, -15, 4.6, 10, o.color);
    oilTank(g, 20, -4.5, 3.6, 8, o.color);
    stain(9, 9, 2.6);
    pipe([[-4, -12], [11, -12]]);
    pipe([[9, 8], [16, 8], [18, -1]]);
    for (const [u, v] of [[-20, 9], [-20, 11], [-20, 13]]) box(g, u - 0.6, u + 14, v - 0.6, v + 0.6, 0, 1.2, '#7d8186', '#9aa0a5');
    pumpjack(g, 2, 9);
  }
}

const MINE_PAINT = { wood, stone, ore, oil };

function mine(g, lv, o) {
  (MINE_PAINT[o.dep] ?? ore)(g, lv, o);
}

// ---------- Ablauf ----------

const ISO = {
  res: [res1, res2, res3],
  com: [com1, com2, com3],
  market: [market1, market2, market3],
  dc: [dc1, dc2, dc3],
  hospital: [hosp1, hosp2, hosp3],
  heliport: [heli1, heli2, heli3],
  mine: [(g, o) => mine(g, 1, o), (g, o) => mine(g, 2, o), (g, o) => mine(g, 3, o)],
};

/** Ersatz für Arten ohne eigenes Bild (noch nicht gezeichnet): schlichter Quader mit Flachdach. */
function plain(g, lv, o) {
  const wall = '#c9c4b8';
  const s = 14 + lv * 3;
  shadow(g, -s, s, -s, s, 12 + lv * 6);
  box(g, -s, s, -s, s, 0, 12 + lv * 6, wall);
  parapet(g, -s, s, -s, s, 12 + lv * 6, wall);
  void o;
}

function paintIso(ctx, s, b, lv) {
  const g = G(ctx, s);
  const o = { v: b.variant % 3, seed: b.variant * 7 + 11, color: b.color, dep: b.dep };
  const f = ISO[b.ck]?.[lv - 1];
  if (f) f(g, o);
  else plain(g, lv, o);
}

// ---------- 2D von oben (Weltkoordinaten ab der Zellmitte) ----------

function rectF(c, x0, y0, x1, y1, fill) {
  c.fillStyle = fill;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
}
function rectS(c, x0, y0, x1, y1, fill, line = 'rgba(0,0,0,0.35)', w = 0.5) {
  rectF(c, x0, y0, x1, y1, fill);
  c.strokeStyle = line;
  c.lineWidth = w;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
}
function polyF(c, pts, fill) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}
/** Schatten nach rechts unten (wie die Großbauten in 2D), länger je höher. */
function shadowTop(c, x0, y0, x1, y1, h) {
  const s = Math.min(16, h * 0.22);
  polyF(c, [[x0, y0], [x1, y0], [x1 + s, y0 + s], [x1 + s, y1 + s], [x0 + s, y1 + s], [x0, y1]], 'rgba(0,0,0,0.26)');
}
/** Satteldach von oben: First entlang x ('u') oder y ('v'); Licht von links oben. */
function gableTop(c, x0, y0, x1, y1, axis, roof, o = 1.5) {
  x0 -= o;
  y0 -= o;
  x1 += o;
  y1 += o;
  if (axis === 'u') {
    const ym = (y0 + y1) / 2;
    rectF(c, x0, y0, x1, ym, tint(roof, 0.12));
    rectF(c, x0, ym, x1, y1, shade(roof, 0.2));
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 0.4;
    c.beginPath();
    for (let y = y0 + 2; y < y1 - 1; y += 2.2) {
      c.moveTo(x0, y);
      c.lineTo(x1, y);
    }
    c.stroke();
    c.strokeStyle = shade(roof, 0.45);
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(x0, ym);
    c.lineTo(x1, ym);
    c.stroke();
  } else {
    const xm = (x0 + x1) / 2;
    rectF(c, x0, y0, xm, y1, tint(roof, 0.12));
    rectF(c, xm, y0, x1, y1, shade(roof, 0.2));
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 0.4;
    c.beginPath();
    for (let x = x0 + 2; x < x1 - 1; x += 2.2) {
      c.moveTo(x, y0);
      c.lineTo(x, y1);
    }
    c.stroke();
    c.strokeStyle = shade(roof, 0.45);
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(xm, y0);
    c.lineTo(xm, y1);
    c.stroke();
  }
  c.strokeStyle = 'rgba(0,0,0,0.4)';
  c.lineWidth = 0.5;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
}
/** Walmdach von oben: vier Flächen, Nord und West hell, Süd und Ost dunkel. */
function hipTop(c, x0, y0, x1, y1, roof, o = 1.3) {
  x0 -= o;
  y0 -= o;
  x1 += o;
  y1 += o;
  const w = Math.min(x1 - x0, y1 - y0) / 2;
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  const [a, b] = x1 - x0 >= y1 - y0 ? [[x0 + w, ym], [x1 - w, ym]] : [[xm, y0 + w], [xm, y1 - w]];
  polyF(c, [[x0, y0], [x1, y0], b, a], tint(roof, 0.16));
  polyF(c, [[x0, y0], a, [x0, y1]], tint(roof, 0.04));
  polyF(c, [[x1, y0], [x1, y1], b], shade(roof, 0.14));
  polyF(c, [[x0, y1], a, b, [x1, y1]], shade(roof, 0.24));
  c.strokeStyle = shade(roof, 0.45);
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(...a);
  c.lineTo(...b);
  c.lineTo(x1, y0);
  c.moveTo(x0, y1);
  c.lineTo(...a);
  c.moveTo(...b);
  c.lineTo(x1, y1);
  c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.4)';
  c.lineWidth = 0.5;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
}
/** Flachdach von oben: Attika als Rand, Dachfläche, Schattenkante innen oben links. */
function flatTop(c, x0, y0, x1, y1, rim, deck = DECK) {
  rectS(c, x0, y0, x1, y1, tint(rim, 0.1));
  rectF(c, x0 + 1.2, y0 + 1.2, x1 - 1.2, y1 - 1.2, deck);
  rectF(c, x0 + 1.2, y0 + 1.2, x1 - 1.2, y0 + 2, 'rgba(0,0,0,0.18)');
  rectF(c, x0 + 1.2, y0 + 2, x0 + 2, y1 - 1.2, 'rgba(0,0,0,0.18)');
}
function treeTop(c, x, y, r, t = 0) {
  circle(c, x + r * 0.45, y + r * 0.45, r, 'rgba(0,0,0,0.25)');
  const L = LEAF[k3(t)];
  const grad = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  grad.addColorStop(0, L[0]);
  grad.addColorStop(0.6, L[1]);
  grad.addColorStop(1, L[2]);
  circle(c, x, y, r, grad);
}
function carTop(c, x, y, along, color) {
  const [hx, hy] = along === 'u' ? [4.3, 2.1] : [2.1, 4.3];
  rectF(c, x - hx + 0.8, y - hy + 0.8, x + hx + 0.8, y + hy + 0.8, 'rgba(0,0,0,0.25)');
  rectS(c, x - hx, y - hy, x + hx, y + hy, color, 'rgba(0,0,0,0.45)', 0.4);
  if (along === 'u') {
    rectF(c, x - 2.6, y - 1.6, x + 1.8, y + 1.6, '#2c3a47');
    rectF(c, x - 1.6, y - 1.6, x + 0.8, y + 1.6, tint(color, 0.12));
  } else {
    rectF(c, x - 1.6, y - 2.6, x + 1.6, y + 1.8, '#2c3a47');
    rectF(c, x - 1.6, y - 1.6, x + 1.6, y + 0.8, tint(color, 0.12));
  }
}
function lawnTop(c) {
  rectF(c, -25, -25, 25, 25, LAWN);
  for (const k of [-17.5, -7.5, 2.5, 12.5]) rectF(c, k, -25, k + 5, 25, LAWN2);
}
function hedgeTop(c) {
  rectS(c, -25, -25, 25, -22.8, HEDGE, 'rgba(0,0,0,0.25)', 0.4);
  rectS(c, -25, -22.8, -22.8, 25, HEDGE, 'rgba(0,0,0,0.25)', 0.4);
}
/** Markise von oben: Streifen entlang x von x0 bis x1, Tiefe y0…y1. */
function awningTop(c, x0, x1, y0, y1, cols, n = 8) {
  for (let i = 0; i < n; i++) rectF(c, x0 + ((x1 - x0) * i) / n, y0, x0 + ((x1 - x0) * (i + 1)) / n, y1, cols[i % 2]);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 0.4;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
}
function acTop(c, x, y, s = 2.4) {
  rectS(c, x - s, y - s * 0.7, x + s, y + s * 0.7, '#c4c8cb', 'rgba(0,0,0,0.4)', 0.35);
  circle(c, x, y, s * 0.5, '#5f6468');
}

function res1Top(c, o) {
  lawnTop(c);
  rectF(c, -6, 6, -1.6, 25, PATH);
  rectF(c, 11, 3, 23, 25, PAVE);
  hedgeTop(c);
  shadowTop(c, -16, -12, 8, 6, 24);
  shadowTop(c, 11, -10, 23, 3, 9);
  gableTop(c, -16, -12, 8, 6, 'u', RES_ROOF[o.v]);
  rectS(c, -11, -9.6, -8.6, -7.2, '#a0574a');
  rectS(c, 11, -10, 23, 3, '#b3b1aa');
  carTop(c, 17, 14, 'v', CAR_COLORS[o.seed % CAR_COLORS.length]);
  treeTop(c, 17, -17, 7, o.v + 1);
  circle(c, -19.5, 19.5, 3.8, LEAF[k3(o.v)][1]);
  circle(c, 6, 20, 3, LEAF[k3(o.v + 2)][1]);
}
function res2Top(c, o) {
  lawnTop(c);
  rectF(c, -7, 9, 3, 25, PATH);
  rectF(c, 18.4, -6, 24.6, 25, PAVE);
  hedgeTop(c);
  shadowTop(c, -20, -14, 16, 9, 32);
  hipTop(c, -20, -14, 16, 9, RES_ROOF[o.v]);
  for (const x of [-12, 7]) rectS(c, x - 2, 3.4, x + 2, 6.2, '#3d566d', 'rgba(230,230,225,0.7)', 0.4);
  rectS(c, -9, -8.5, -6.6, -6.1, '#a0574a');
  rectS(c, -18, 9, -9, 12, RES_ACC[o.v]);
  rectS(c, 4, 9, 13, 12, RES_ACC[o.v]);
  carTop(c, 21.5, 8, 'v', CAR_COLORS[(o.seed + 2) % CAR_COLORS.length]);
  treeTop(c, 19, -19, 6.5, o.v);
  treeTop(c, -20, 19.5, 6, o.v + 2);
  circle(c, 10, 20.5, 3.2, LEAF[k3(o.v)][1]);
}
function res3Top(c, o) {
  const wall = RES_WALL[o.v];
  rectF(c, -25, -25, 25, 25, PAVE);
  rectF(c, -25, 17, 25, 25, LAWN);
  rectF(c, 21.5, -25, 25, 17, LAWN);
  shadowTop(c, -21, -20, 18, 13, 60);
  for (const x of [-13, -1.5, 10]) rectS(c, x - 3.7, 13, x + 3.7, 16, RES_ACC[o.v]);
  flatTop(c, -21.6, -20.6, 18.6, 13.6, wall);
  if (o.v === 0) for (const y of [-15, -8.5, -2]) rectS(c, -3, y, 14, y + 4.6, '#2b4a78', 'rgba(170,190,215,0.8)', 0.4);
  else if (o.v === 1) {
    rectF(c, -2, -18.4, 16.4, 11.4, '#7aa556');
    for (const [x, y] of [[2, -14], [9, -6], [4, 4], [12, 7]]) circle(c, x, y, 2.2, LEAF[k3(x + y)][1]);
  } else for (const [x, y] of [[2, -12], [9, -12], [5, -2]]) acTop(c, x, y, 2.6);
  shadowTop(c, -15, -16, -6, -8, 7);
  rectS(c, -15, -16, -6, -8, '#a29f97');
  rectS(c, -6.4, 13, 3.4, 16.8, '#e1ddd3');
  treeTop(c, 22.5, -21, 6, o.v);
  treeTop(c, -21, 21, 6, o.v + 1);
  treeTop(c, 21.5, 21, 5.4, o.v + 2);
}
function com1Top(c, o) {
  const aw = COM_AWN[o.v];
  rectF(c, -25, -25, 25, 25, PLAZA);
  rectF(c, 15, -25, 25, 2, ASPH);
  c.strokeStyle = 'rgba(240,240,235,0.8)';
  c.lineWidth = 0.5;
  c.beginPath();
  for (const y of [-16.5, -8]) {
    c.moveTo(15.5, y);
    c.lineTo(24.5, y);
  }
  c.stroke();
  carTop(c, 20, -20.6, 'u', CAR_COLORS[(o.seed + 1) % CAR_COLORS.length]);
  carTop(c, 20, -12.2, 'u', CAR_COLORS[(o.seed + 4) % CAR_COLORS.length]);
  shadowTop(c, -18, -18, 12, 4, 14);
  flatTop(c, -18, -18, 12, 4, COM_FACADE[o.v]);
  acTop(c, -9, -10, 2.5);
  acTop(c, 2, -12, 1.8);
  awningTop(c, -17.2, 11.2, 4, 9, aw, 12);
  for (const x of [-12.5, -2.5, 7.5]) {
    circle(c, x + 1, 16.5, 4.6, 'rgba(0,0,0,0.2)');
    circle(c, x, 15.5, 4.6, aw[0]);
    circle(c, x, 15.5, 1.6, aw[1]);
  }
  circle(c, -21.5, 21, 3.4, LEAF[k3(o.v)][1]);
  circle(c, 13, 21.5, 3, LEAF[k3(o.v + 1)][1]);
}
function com2Top(c, o) {
  const wall = COM_FACADE[o.v];
  rectF(c, -25, -25, 25, 25, PLAZA);
  shadowTop(c, -21.6, -19.6, 18.6, 11.6, 38);
  awningTop(c, -19.8, -2.8, 11, 15.6, COM_AWN[o.v], 8);
  awningTop(c, 0.2, 16.8, 11, 15.6, COM_AWN[(o.v + 1) % 3], 8);
  flatTop(c, -21.6, -19.6, 18.6, 11.6, tint(wall, 0.3));
  acTop(c, -12, -12, 2.8);
  acTop(c, -4, -12, 2.8);
  rectS(c, 2, -16.6, 16, -15.4, ['#d9442f', '#2f74c0', '#e0a92e'][o.seed % 3]);
  for (const [x, y] of [[-22.5, 19], [21, 19]]) circle(c, x, y, 1.2, '#f1df9a');
  circle(c, 21.5, -21.5, 3.4, LEAF[k3(o.v)][1]);
}
function com3Top(c, o) {
  const gl = COM_GLASS[o.v];
  rectF(c, -25, -25, 25, 25, '#d8d1c2');
  shadowTop(c, -15, -15, 13, 9, 100);
  rectS(c, -21, -19, 19, 13, '#a6b08f');
  rectS(c, -15, -15, 13, 9, '#9ea4a8', 'rgba(0,0,0,0.5)', 0.6); // Dach des Turms, am Rand ein Streifen Glas
  rectF(c, -15, -15, 13, -14.1, tint(gl, 0.35));
  rectF(c, -15, -14.1, -14.1, 9, tint(gl, 0.35));
  rectS(c, -13, -13, 11, 7, '#c8ccd0');
  acTop(c, 5, -9, 1.8);
  acTop(c, 5, -4, 1.8);
  c.strokeStyle = o.color;
  c.lineWidth = 1.2;
  c.strokeRect(-12.4, -12.4, 22.8, 18.8);
  circle(c, -5, -5, 1.4, '#ff4a3a');
  rectS(c, -6.5, 13, 3.5, 17.5, '#e1e4e5');
  for (const x of [-18, -14, -10]) {
    circle(c, x, 21.5, 0.8, '#d9d6cc');
    rectF(c, x, 20.7, x + 5, 22.3, o.color);
  }
  treeTop(c, 18, 21, 5.4, o.v);
  treeTop(c, 22, -21, 5, o.v + 1);
}

// --- 2D: Markt, Rechenzentrum, Krankenhaus, Heliport, Förderanlagen ---

function lineT(c, pts, color, w) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke();
}
function cobbleTop(c, color = '#d2c6ad') {
  rectF(c, -25, -25, 25, 25, color);
  c.strokeStyle = 'rgba(0,0,0,0.06)';
  c.lineWidth = 0.4;
  c.beginPath();
  for (let k = -21; k <= 21; k += 6) {
    c.moveTo(k, -25);
    c.lineTo(k, 25);
    c.moveTo(-25, k);
    c.lineTo(25, k);
  }
  c.stroke();
}
/** Marktstand von oben: gestreiftes Zeltdach mit First entlang x. */
function stallTop(c, x, y, cols) {
  rectF(c, x - 4.2, y - 2.4, x + 5.8, y + 4.4, 'rgba(0,0,0,0.2)');
  for (let k = 0; k < 6; k++) {
    const a = x - 4.6 + (9.2 * k) / 6;
    rectF(c, a, y - 3.1, a + 9.2 / 6, y, tint(cols[k % 2], 0.08));
    rectF(c, a, y, a + 9.2 / 6, y + 3.1, shade(cols[k % 2], 0.12));
  }
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 0.4;
  c.strokeRect(x - 4.6, y - 3.1, 9.2, 6.2);
}
function fountainTop(c, x, y, r) {
  circle(c, x + 0.8, y + 0.8, r, 'rgba(0,0,0,0.18)');
  circle(c, x, y, r, '#cfc8b8');
  const grad = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.5, x, y, r);
  grad.addColorStop(0, '#9ccbe8');
  grad.addColorStop(1, '#4f8fbf');
  circle(c, x, y, r - 0.9, grad);
  circle(c, x, y, 2.2, '#cfc8b8');
  circle(c, x, y, 1, '#e8f4fb');
}
/** Tonnendach von oben (First entlang axis): Verlauf quer zur Achse, Licht von links oben. */
function vaultTop(c, x0, y0, x1, y1, axis, roof, skylight = true) {
  const g = axis === 'u' ? c.createLinearGradient(0, y0, 0, y1) : c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, tint(roof, 0.28));
  g.addColorStop(0.5, roof);
  g.addColorStop(1, shade(roof, 0.35));
  rectS(c, x0 - 0.8, y0 - 0.8, x1 + 0.8, y1 + 0.8, g, 'rgba(0,0,0,0.4)', 0.5);
  c.strokeStyle = 'rgba(0,0,0,0.1)';
  c.lineWidth = 0.35;
  c.beginPath();
  if (axis === 'u') {
    for (let y = y0 + 2.4; y < y1; y += 2.4) {
      c.moveTo(x0, y);
      c.lineTo(x1, y);
    }
  } else {
    for (let x = x0 + 2.4; x < x1; x += 2.4) {
      c.moveTo(x, y0);
      c.lineTo(x, y1);
    }
  }
  c.stroke();
  if (!skylight) return;
  if (axis === 'u') rectS(c, x0 + 2, (y0 + y1) / 2 - 1.6, x1 - 2, (y0 + y1) / 2 + 1.6, '#9cc3d5', 'rgba(60,80,90,0.5)', 0.35);
  else rectS(c, (x0 + x1) / 2 - 1.6, y0 + 2, (x0 + x1) / 2 + 1.6, y1 - 2, '#9cc3d5', 'rgba(60,80,90,0.5)', 0.35);
}
/** Zeltdach (Pyramide) von oben. */
function pyramidTop(c, x0, y0, x1, y1, roof) {
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  polyF(c, [[x0, y0], [x1, y0], [xm, ym]], tint(roof, 0.18));
  polyF(c, [[x0, y0], [xm, ym], [x0, y1]], tint(roof, 0.05));
  polyF(c, [[x1, y0], [x1, y1], [xm, ym]], shade(roof, 0.16));
  polyF(c, [[x0, y1], [xm, ym], [x1, y1]], shade(roof, 0.28));
  c.strokeStyle = 'rgba(0,0,0,0.4)';
  c.lineWidth = 0.5;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
}
function fanTopV(c, x, y, r) {
  circle(c, x, y, r, '#8d9398');
  circle(c, x, y, r * 0.78, '#2b2f33');
  lineT(c, [[x - r * 0.7, y], [x + r * 0.7, y]], '#80868b', 0.35);
  lineT(c, [[x, y - r * 0.7], [x, y + r * 0.7]], '#80868b', 0.35);
}
function fenceTop(c, x0, y0, x1, y1) {
  c.save();
  c.setLineDash([1.6, 0.9]);
  c.strokeStyle = 'rgba(55,60,66,0.75)';
  c.lineWidth = 0.45;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  c.restore();
}
function dishTop(c, x, y, r) {
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath();
  c.ellipse(x + r * 0.6, y + r * 0.6, r, r * 0.7, -0.6, 0, Math.PI * 2);
  c.fill();
  const grad = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.3, x, y, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#b4b9bd');
  c.fillStyle = grad;
  c.beginPath();
  c.ellipse(x, y, r, r * 0.7, -0.6, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 0.35;
  c.stroke();
}
/** Gitterturm von oben: Quadrat mit Kreuz, langer Schatten nach rechts unten, Licht an der Spitze. */
function latticeTop(c, x, y, s, len, color) {
  lineT(c, [[x, y], [x + len * 0.7, y + len * 0.7]], 'rgba(0,0,0,0.28)', s * 1.2);
  rectF(c, x - s, y - s, x + s, y + s, 'rgba(0,0,0,0.15)');
  c.strokeStyle = color;
  c.lineWidth = 0.6;
  c.strokeRect(x - s, y - s, 2 * s, 2 * s);
  lineT(c, [[x - s, y - s], [x + s, y + s]], color, 0.45);
  lineT(c, [[x + s, y - s], [x - s, y + s]], color, 0.45);
}
function crossTop(c, x, y, s) {
  rectF(c, x - s - 1, y - s - 1, x + s + 1, y + s + 1, '#fbfaf7');
  const t = s * 0.34;
  rectF(c, x - s, y - t, x + s, y + t, RED);
  rectF(c, x - t, y - s, x + t, y + s, RED);
}
function padTop(c, x, y, r) {
  circle(c, x, y, r + 1, '#8f8e86');
  circle(c, x, y, r, '#45484c');
  circle(c, x, y, r * 0.86, '#ecebe4');
  circle(c, x, y, r * 0.76, '#45484c');
  const b = r * 0.38;
  const w = r * 0.27;
  const t = r * 0.075;
  rectF(c, x - w - t, y - b, x - w + t, y + b, '#f2f0e6');
  rectF(c, x + w - t, y - b, x + w + t, y + b, '#f2f0e6');
  rectF(c, x - w, y - t, x + w, y + t, '#f2f0e6');
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    circle(c, x + (r + 0.45) * Math.cos(a), y + (r + 0.45) * Math.sin(a), 0.45, k % 2 ? '#ffe27a' : '#8af08f');
  }
}
function vanTop(c, x, y, along, color, band, light) {
  const [hx, hy] = along === 'u' ? [5, 2.3] : [2.3, 5];
  rectF(c, x - hx + 0.9, y - hy + 0.9, x + hx + 0.9, y + hy + 0.9, 'rgba(0,0,0,0.25)');
  rectS(c, x - hx, y - hy, x + hx, y + hy, color, 'rgba(0,0,0,0.45)', 0.35);
  if (band) {
    if (along === 'u') rectF(c, x - hx, y - 0.5, x + hx, y + 0.5, band);
    else rectF(c, x - 0.5, y - hy, x + 0.5, y + hy, band);
  }
  if (light) {
    if (along === 'u') rectF(c, x + hx - 2.2, y - 1.4, x + hx - 1, y + 1.4, '#3d7bf0');
    else rectF(c, x - 1.4, y + hy - 2.2, x + 1.4, y + hy - 1, '#3d7bf0');
  }
}
function tankTop(c, x, y, r, color = '#dedbd2') {
  circle(c, x + r * 0.35, y + r * 0.35, r, 'rgba(0,0,0,0.25)');
  ball(c, x, y, r, color);
  c.strokeStyle = 'rgba(0,0,0,0.2)';
  c.lineWidth = 0.35;
  c.beginPath();
  c.arc(x, y, r * 0.6, 0, Math.PI * 2);
  c.stroke();
}
function conTop(c, x, y, r) {
  circle(c, x + r * 0.5, y + r * 0.5, r, 'rgba(0,0,0,0.28)');
  const grad = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.2, x, y, r);
  grad.addColorStop(0, '#5d9a52');
  grad.addColorStop(0.6, '#2f6b3a');
  grad.addColorStop(1, '#1d4628');
  c.fillStyle = grad;
  c.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const rr = k % 2 ? r * 0.72 : r;
    const px = x + rr * Math.cos(a);
    const py = y + rr * Math.sin(a);
    if (k) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  c.closePath();
  c.fill();
  circle(c, x - r * 0.15, y - r * 0.15, r * 0.25, '#6aa85d');
}
function heapTop(c, x, y, r, color) {
  circle(c, x + r * 0.35, y + r * 0.35, r, 'rgba(0,0,0,0.22)');
  const grad = c.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.3, x, y, r);
  grad.addColorStop(0, tint(color, 0.25));
  grad.addColorStop(1, shade(color, 0.3));
  circle(c, x, y, r, grad);
}
/** Holzstapel von oben: Stämme entlang x mit hellen Enden rechts. */
function logsTop(c, x0, y0, x1, y1, rows) {
  rectF(c, x0 + 0.8, y0 + 0.8, x1 + 0.8, y1 + 1.4, 'rgba(0,0,0,0.22)');
  const h = (y1 - y0) / rows;
  for (let k = 0; k < rows; k++) {
    const a = y0 + k * h;
    rectS(c, x0, a, x1, a + h, k % 2 ? '#7d5734' : '#8a6440', 'rgba(40,25,10,0.45)', 0.3);
    circle(c, x1, a + h / 2, h / 2, '#dcb47e');
  }
}
function stumpTop(c, x, y) {
  circle(c, x, y, 1.2, '#7a5634');
  circle(c, x, y, 0.8, '#d8b07c');
}
function planksTop(c, x0, y0, x1, y1) {
  rectF(c, x0 + 0.7, y0 + 0.7, x1 + 0.7, y1 + 0.7, 'rgba(0,0,0,0.22)');
  rectS(c, x0, y0, x1, y1, '#e2c28f', 'rgba(90,60,30,0.45)', 0.3);
  c.strokeStyle = 'rgba(90,60,30,0.3)';
  c.lineWidth = 0.3;
  c.beginPath();
  for (let y = y0 + 0.9; y < y1; y += 0.9) {
    c.moveTo(x0, y);
    c.lineTo(x1, y);
  }
  c.stroke();
}
function yellowTop(c, x0, y0, x1, y1) {
  rectF(c, x0 + 0.8, y0 + 0.8, x1 + 0.8, y1 + 0.8, 'rgba(0,0,0,0.25)');
  rectS(c, x0, y0, x1, y1, '#e2b021', 'rgba(0,0,0,0.45)', 0.35);
}
/** Grube von oben: Absätze als ineinander liegende Rechtecke, Wände oben und links im Schatten. */
function pitTop(c, x0, y0, x1, y1, steps, s, rock) {
  for (let k = 0; k <= steps; k++) {
    const a = x0 + k * s;
    const b = y0 + k * s;
    rectF(c, a, b, x1, y1, shade(rock, 0.06 * k));
    if (k < steps) {
      rectF(c, a, b, x1, b + s * 0.45, 'rgba(0,0,0,0.18)');
      rectF(c, a, b, a + s * 0.45, y1, 'rgba(0,0,0,0.22)');
    }
  }
  c.strokeStyle = 'rgba(60,50,40,0.45)';
  c.lineWidth = 0.4;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
}
function railsTop(c, x0, x1, y) {
  c.strokeStyle = '#6b5a48';
  c.lineWidth = 0.6;
  c.beginPath();
  for (let x = x0; x <= x1; x += 1.6) {
    c.moveTo(x, y - 1.5);
    c.lineTo(x, y + 1.5);
  }
  c.stroke();
  lineT(c, [[x0, y - 0.95], [x1, y - 0.95]], '#45484b', 0.45);
  lineT(c, [[x0, y + 0.95], [x1, y + 0.95]], '#45484b', 0.45);
}
function pumpjackTop(c, x, y) {
  rectF(c, x - 7 + 0.8, y - 1.5 + 0.8, x + 6 + 0.8, y + 1.5 + 0.8, 'rgba(0,0,0,0.22)');
  rectS(c, x - 7, y - 1.5, x + 6, y + 1.5, '#9a958a', 'rgba(0,0,0,0.35)', 0.3);
  lineT(c, [[x + 2, y + 2], [x + 9.5, y + 6]], 'rgba(0,0,0,0.25)', 1.3);
  circle(c, x - 4.7, y, 1.7, '#3f4448');
  lineT(c, [[x - 6.9, y], [x + 5, y]], '#d8a227', 1.4);
  polyF(c, [[x + 4.6, y - 1.2], [x + 7.6, y - 0.9], [x + 7.6, y + 0.9], [x + 4.6, y + 1.2]], '#c99520');
  rectS(c, x + 6.4, y - 0.8, x + 8, y + 0.8, '#6b7075', 'rgba(0,0,0,0.4)', 0.3);
}

function market1Top(c, o) {
  cobbleTop(c);
  stallTop(c, -12, -13, STALL[0]);
  stallTop(c, 12, -13, STALL[1 + (o.v % 2)]);
  stallTop(c, -12, 12, STALL[3]);
  stallTop(c, 12, 12, STALL[4]);
  fountainTop(c, 0, 0, 5);
  for (const [x, y] of [[19.5, -2.5], [19.5, 0.2], [22.2, -1.2]]) rectS(c, x - 1.1, y - 1.1, x + 1.1, y + 1.1, '#b88e5e', 'rgba(0,0,0,0.4)', 0.3);
  for (const [x, y] of [[20, -20], [-20, 20]]) circle(c, x, y, 1, '#f1df9a');
  treeTop(c, -21, -21, 5.6, o.v);
  treeTop(c, 21.5, 21.5, 5, o.v + 1);
}
function hallTop(c, x0, y0, x1, y1, h) {
  shadowTop(c, x0, y0, x1, y1, h);
  vaultTop(c, x0, y0, x1, y1, 'u', MARKET_ROOF);
}
function market2Top(c, o) {
  cobbleTop(c);
  hallTop(c, -21, -20, 11, 4, 19);
  stallTop(c, 19, -9, STALL[(o.v + 1) % 5]);
  stallTop(c, -13, 14, STALL[0]);
  stallTop(c, 3, 14, STALL[(o.v + 3) % 5]);
  treeTop(c, 21, -21, 5.4, o.v);
  treeTop(c, 21.5, 15, 5.4, o.v + 1);
}
function market3Top(c, o) {
  cobbleTop(c, '#d6caae');
  hallTop(c, -23, -16, 7, 8, 20.5);
  shadowTop(c, 12, -24, 21, -15, 52);
  pyramidTop(c, 11.1, -24.9, 21.9, -14.1, MARKET_ROOF);
  ball(c, 16.5, -19.5, 1.2, '#e3b43a');
  rectF(c, 16.5, -20.3, 21.5, -18.7, o.color);
  stallTop(c, 18, -4, STALL[(o.v + 2) % 5]);
  stallTop(c, -15, 16, STALL[0]);
  stallTop(c, 1, 16, STALL[(o.v + 1) % 5]);
  treeTop(c, 20, 13, 5, o.v);
  treeTop(c, 21.5, 21.5, 4.8, o.v + 2);
}

function dcHallTop(c, x0, y0, x1, y1, h) {
  shadowTop(c, x0, y0, x1, y1, h);
  flatTop(c, x0 - 0.4, y0 - 0.4, x1 + 0.4, y1 + 0.4, DC_RIM, '#7c8287');
  rectF(c, x0 + 2.2, y1, x0 + 9.8, y1 + 3, '#d5d8da');
}
function generatorTop(c, x, y) {
  rectF(c, x - 4 + 1, y - 2 + 1, x + 4 + 1, y + 2 + 1, 'rgba(0,0,0,0.25)');
  rectS(c, x - 4, y - 2, x + 4, y + 2, '#7d8f6c', 'rgba(0,0,0,0.4)', 0.35);
  circle(c, x - 2.6, y - 0.6, 0.7, '#3d4044');
}
function chillerTop(c, x, y) {
  rectF(c, x - 3.2 + 0.8, y - 2.1 + 0.8, x + 3.2 + 0.8, y + 2.1 + 0.8, 'rgba(0,0,0,0.25)');
  rectS(c, x - 3.2, y - 2.1, x + 3.2, y + 2.1, '#cfd3d6', 'rgba(0,0,0,0.4)', 0.3);
  fanTopV(c, x - 1.6, y, 1.3);
  fanTopV(c, x + 1.6, y, 1.3);
}
function dc1Top(c, o) {
  rectF(c, -25, -25, 25, 25, '#c3c5bf');
  rectF(c, -25, 13, 25, 25, LAWN);
  dcHallTop(c, -19, -17, 9, 5, 12);
  for (const y of [-12, -5]) for (const x of [-13, -5, 3]) fanTopV(c, x, y, 2.2);
  generatorTop(c, 16, -19);
  carTop(c, 17, 3, 'v', CAR_COLORS[(o.seed + 3) % CAR_COLORS.length]);
  circle(c, -18, 19, 3.2, LEAF[k3(o.v)][1]);
  circle(c, 6, 19.5, 2.8, LEAF[k3(o.v + 1)][1]);
  fenceTop(c, -24, -24, 24, 24);
}
function dc2Top(c, o) {
  rectF(c, -25, -25, 25, 25, '#c3c5bf');
  rectF(c, -25, 15, 25, 25, LAWN);
  dcHallTop(c, -22, -21, 10, 6, 16);
  for (const y of [-16, -9]) for (const x of [-17, -10, -3, 4]) fanTopV(c, x, y, 2.2);
  dishTop(c, 4, 0, 3.6);
  for (const y of [-16, -7, 2]) chillerTop(c, 18, y);
  generatorTop(c, 15, 11);
  circle(c, -19, 20, 3.2, LEAF[k3(o.v)][1]);
  fenceTop(c, -24, -24, 24, 24);
}
function dc3Top(c, o) {
  rectF(c, -25, -25, 25, 25, '#c3c5bf');
  dcHallTop(c, -23, -22, 9, 6, 18);
  for (const [x, y] of [[-3, -17], [4, -17], [-3, -10], [4, -10], [-17, -3], [-10, -3], [-3, -3], [4, -3]]) fanTopV(c, x, y, 2.2);
  shadowTop(c, -23, -22, -9, -8, 34);
  rectS(c, -23, -22, -9, -8, '#8f979c', 'rgba(0,0,0,0.45)', 0.5);
  rectF(c, -23, -22, -9, -21.2, tint('#3e6f8f', 0.35));
  rectF(c, -23, -21.2, -22.2, -8, tint('#3e6f8f', 0.35));
  rectS(c, -22, -21, -10, -9, '#9ea4a8', o.color, 0.8);
  latticeTop(c, -16, -15, 2.2, 52, '#a7adb2');
  circle(c, -16, -15, 1, '#ff4a3a');
  for (const y of [-16, -7]) chillerTop(c, 17, y);
  dishTop(c, 17, 1, 3.4);
  tankTop(c, 15.5, 13, 2.8);
  tankTop(c, 21, 18, 2.8);
  fenceTop(c, -24, -24, 24, 24);
}

function clinicTop(c, x0, y0, x1, y1, h) {
  shadowTop(c, x0, y0, x1, y1, h);
  flatTop(c, x0 - 0.4, y0 - 0.4, x1 + 0.4, y1 + 0.4, '#e3e2dc', '#c9c8c1');
}
function signTop(c, x0, x1, y) {
  rectF(c, x0 + 1, y + 0.5, x1 + 1.8, y + 2, 'rgba(0,0,0,0.25)');
  rectS(c, x0, y - 0.5, x1, y + 0.5, '#f6f5f1', 'rgba(0,0,0,0.4)', 0.3);
  rectF(c, (x0 + x1) / 2 - 1.2, y - 0.5, (x0 + x1) / 2 + 1.2, y + 0.5, RED);
}
function hospGround(c, x0) {
  rectF(c, -25, -25, 25, 25, LAWN);
  rectF(c, -25, 10, 25, 25, '#c9c4b8');
  rectF(c, x0, 3, 25, 25, ASPH);
}
function hosp1Top(c, o) {
  rectF(c, -25, -25, 25, 25, LAWN);
  rectF(c, -25, 9, 25, 25, '#c9c4b8');
  rectF(c, 3, 11, 25, 25, ASPH);
  lineT(c, [[8, 12], [8, 18]], 'rgba(240,240,235,0.8)', 0.4);
  lineT(c, [[13, 12], [13, 18]], 'rgba(240,240,235,0.8)', 0.4);
  lineT(c, [[18, 12], [18, 18]], 'rgba(240,240,235,0.8)', 0.4);
  clinicTop(c, -19, -17, 13, 4, 14);
  crossTop(c, -9, -7, 4);
  signTop(c, 1, 10, 3);
  rectS(c, -9, 4, 1, 9, '#eceae4', 'rgba(0,0,0,0.35)', 0.3);
  vanTop(c, 10.5, 15, 'u', '#f4f3ef', RED, true);
  treeTop(c, 21, -20, 5.6, o.v);
  treeTop(c, -21, 20, 5.6, o.v + 1);
  circle(c, -12, 21, 2.8, LEAF[k3(o.v + 2)][1]);
}
function hosp2Top(c, o, lv = 2) {
  hospGround(c, 9);
  const floors = lv === 3 ? 4 : 3;
  const [x0, y0, x1, y1] = lv === 3 ? [-22, -21, 16, 1] : [-21, -19, 15, 1];
  clinicTop(c, x0, y0, x1, y1, floors * 7);
  if (lv === 3) {
    padTop(c, -8, -10, 7.6);
    rectS(c, 7, -18, 13, -12, '#e3e2dc', 'rgba(0,0,0,0.4)', 0.35);
    signTop(c, 6, 14.5, 0.5);
  } else {
    crossTop(c, -10, -9, 4.5);
    signTop(c, 5, 13.5, 0.5);
  }
  shadowTop(c, -12, 1, 4, 9, 7.5);
  flatTop(c, -12.3, 0.7, 4.3, 9.3, '#d9d8d2', '#cfcdc6');
  rectS(c, -9, 9, 1, 14, '#eceae4', 'rgba(0,0,0,0.35)', 0.3);
  vanTop(c, 14.5, 9, 'v', '#f4f3ef', RED, true);
  vanTop(c, 20.5, 9, 'v', '#f4f3ef', RED, lv === 3);
  treeTop(c, -21, 19, 5.6, o.v + 1);
  if (lv === 3) treeTop(c, 21.5, -21.5, 5, o.v);
  else treeTop(c, 21, -21, 5.4, o.v);
  circle(c, 5, 21, 2.8, LEAF[k3(o.v)][1]);
}

function apronTop(c) {
  rectF(c, -25, -25, 25, 25, APRON);
  c.strokeStyle = 'rgba(0,0,0,0.08)';
  c.lineWidth = 0.4;
  c.beginPath();
  for (let k = -15; k <= 15; k += 10) {
    c.moveTo(k, -25);
    c.lineTo(k, 25);
    c.moveTo(-25, k);
    c.lineTo(25, k);
  }
  c.stroke();
}
function ctlTowerTop(c, x, y, h) {
  shadowTop(c, x - 4.7, y - 4.7, x + 4.7, y + 4.7, h);
  rectS(c, x - 4.7, y - 4.7, x + 4.7, y + 4.7, '#3f6684', 'rgba(0,0,0,0.45)', 0.4);
  rectS(c, x - 3.8, y - 3.8, x + 3.8, y + 3.8, '#eceae4', 'rgba(0,0,0,0.3)', 0.3);
  circle(c, x + 1.5, y - 1.5, 0.8, '#ff4a3a');
}
function sockTop(c, x, y) {
  circle(c, x, y, 0.6, '#cfd2d4');
  polyF(c, [[x, y - 1.2], [x + 6, y - 0.5], [x + 6, y + 0.5], [x, y + 1.2]], '#f07a2a');
  rectF(c, x + 2, y - 1, x + 3.6, y + 1, '#f4f1ea');
}
function heli1Top(c, o, lv = 1) {
  apronTop(c);
  if (lv === 3) {
    padTop(c, -4, 6, 13.5);
    shadowTop(c, 6, -24, 24, -8, 14.5);
    vaultTop(c, 6, -24, 24, -8, 'v', '#8d9aa4', false);
    tankTop(c, -21.5, 17, 2.6, '#d9d6cc');
    tankTop(c, -17, 21.5, 2.6, '#d9d6cc');
    sockTop(c, 19, 13);
  } else {
    padTop(c, 3, 3, 14.5);
    sockTop(c, 18, -21);
    if (lv === 2) {
      tankTop(c, -20.5, 13.5, 2.8, '#d9d6cc');
      tankTop(c, -14.5, 19.5, 2.8, '#d9d6cc');
    }
  }
  ctlTowerTop(c, -19, -19, 12 + lv * 2 + 6);
  void o;
}

function woodTop(c, lv, o) {
  rectF(c, -25, -25, 25, 25, '#7f9157');
  rectF(c, -10, -8, 22, 22, '#9c8462');
  if (lv === 1) {
    shadowTop(c, -4, -20, 9, -11, 11);
    gableTop(c, -4, -20, 9, -11, 'u', '#5b4636');
    logsTop(c, -19, 2, -9, 8, 2);
    logsTop(c, 2, -4, 15, 2, 3);
    for (const [x, y] of [[17, 9], [20, 15], [-4, 17]]) stumpTop(c, x, y);
    rectS(c, 7, 11, 9, 13, '#7a5634', 'rgba(0,0,0,0.4)', 0.3);
    conTop(c, 21, -20, 5.8);
    conTop(c, -20, 19, 5.5);
  } else if (lv === 2) {
    shadowTop(c, -21, -9, -10, 0, 10.5);
    gableTop(c, -21, -9, -10, 0, 'u', '#5b4636');
    shadowTop(c, 2, -22, 22, -10, 10.5);
    gableTop(c, 2, -22, 22, -10, 'u', '#6b5847');
    logsTop(c, -19, 5, -7, 11, 3);
    logsTop(c, 3, 1, 17, 7, 3);
    stumpTop(c, 20, 12);
    stumpTop(c, 9, 18);
    conTop(c, -21, 20, 5.5);
    conTop(c, 21, 20, 5.2);
  } else {
    shadowTop(c, -2, -23, 22, -9, 14.5);
    gableTop(c, -2, -23, 22, -9, 'u', '#5f5a52');
    circle(c, 4, -18, 1.8, '#a9aeb2');
    shadowTop(c, -22, -22, -12, -14, 9.5);
    gableTop(c, -22, -22, -12, -14, 'u', '#5b4636');
    logsTop(c, -21, -6, -8, 2, 4);
    logsTop(c, -21, 5, -10, 11, 3);
    planksTop(c, 6, 3, 14, 7);
    planksTop(c, 15, 3, 22, 7);
    planksTop(c, 8, 12, 18, 16);
    yellowTop(c, -5.8, 10.2, 3, 13.8);
    rectF(c, 1.4, 9.8, 3.4, 14.2, '#5d6064');
    conTop(c, -21, 21, 5.5);
    conTop(c, 21.5, 20.5, 4.9);
  }
  conTop(c, -21, -21, 5.8);
  conTop(c, -12, -22.5, 5);
  conTop(c, -22.5, -11, 5.3);
}
function stoneTop(c, lv, o) {
  const rock = '#b9b2a5';
  rectF(c, -25, -25, 25, 25, '#b0a794');
  const block = (x, y, s) => {
    rectF(c, x - s + 0.6, y - s + 0.6, x + s + 0.6, y + s + 0.6, 'rgba(0,0,0,0.22)');
    rectS(c, x - s, y - s, x + s, y + s, '#d8d3c8', 'rgba(0,0,0,0.35)', 0.3);
  };
  if (lv === 1) {
    pitTop(c, -23, -23, 5, 5, 3, 3.4, rock);
    for (const [x, y] of [[13, -21], [17, -21], [21, -21], [15, -17], [19, -17]]) block(x, y, 1.6);
    block(17, -19, 1.5);
    shadowTop(c, 9, 9, 21, 17, 9);
    gableTop(c, 9, 9, 21, 17, 'u', '#6b5f52');
    for (const [x, y] of [[10, 2], [-2, 13]]) circle(c, x, y, 1.2, '#a59d8f');
  } else {
    pitTop(c, -23, -23, 3, 3, lv === 3 ? 4 : 3, 3.2, rock);
    if (lv === 3) {
      yellowTop(c, -19.5, -17.6, -13.8, -12.4);
      lineT(c, [[-14, -15], [-6.6, -15]], '#d39d14', 1);
    }
    lineT(c, [[-6, -6], [12.5, -14]], '#3b3e41', 1.3);
    shadowTop(c, 12.5, -18.5, 19.5, -11.5, lv === 3 ? 12 : 9);
    rectS(c, 12.5, -18.5, 19.5, -11.5, '#6f7a80', 'rgba(0,0,0,0.45)', 0.4);
    circle(c, 16, -15, 3, '#3a3d40');
    heapTop(c, 18, 3, 6, '#bdb6a8');
    if (lv === 3) heapTop(c, 8, 11, 5, '#a9a194');
    for (const [x, y] of [[-19, 12], [-15, 12], [-19, 16]]) block(x, y, 1.6);
    if (lv === 3) {
      yellowTop(c, -7, 15.8, -0.4, 20.2);
      rectS(c, -0.2, 16, 3, 20, '#d4d0c6', 'rgba(0,0,0,0.4)', 0.3);
    }
  }
  circle(c, -21, 21, 2.8, LEAF[k3(o.v)][1]);
}
function oreTop(c, lv, o) {
  const ORE = '#8a4b2e';
  const RUST = '#a33a2a';
  rectF(c, -25, -25, 25, 25, '#9b8b77');
  const [x0, x1] = lv === 1 ? [1, 15] : [2, 19];
  const [y0, y1] = lv === 1 ? [-19, -8] : [-21, -8];
  railsTop(c, -4, 24, lv === 3 ? 20 : 5);
  shadowTop(c, x0, y0, x1, y1, 13);
  gableTop(c, x0, y0, x1, y1, 'u', '#4f4f52');
  if (lv === 2) {
    shadowTop(c, -23, 4, -13, 12, 10);
    gableTop(c, -23, 4, -13, 12, 'u', '#4f4f52');
  }
  const w = [0, 3.2, 3.5, 3.9][lv];
  latticeTop(c, -13, -13, w + 0.9, [0, 30, 36, 40][lv], RUST);
  lineT(c, [[-13 - w - 1.4, -13], [-13 + w + 1.4, -13]], '#2f3236', 0.8);
  lineT(c, [[-13 + w, -13], [x0, (y0 + y1) / 2]], '#2a2a2a', 0.3);
  if (lv === 3) {
    shadowTop(c, 7, 4, 18, 15, 13);
    rectS(c, 7, 4, 18, 15, '#7d6456', 'rgba(0,0,0,0.45)', 0.4);
    lineT(c, [[-8, -8], [9, 7]], '#3b3e41', 1.3);
    heapTop(c, -15, 15, 7.5, ORE);
    for (const x of [13, 19]) rectS(c, x - 2, 18.7, x + 2, 21.3, ORE, 'rgba(0,0,0,0.5)', 0.35);
  } else {
    heapTop(c, lv === 1 ? -14 : 14, lv === 1 ? 14 : 15, lv === 1 ? 6.5 : 7.5, ORE);
    for (const x of lv === 2 ? [9, 15] : [9]) rectS(c, x - 2, 3.7, x + 2, 6.3, ORE, 'rgba(0,0,0,0.5)', 0.35);
  }
  circle(c, -2, -2, 1, '#f1df9a');
}
function oilTop(c, lv, o) {
  rectF(c, -25, -25, 25, 25, '#a99c83');
  const stain = (x, y, r) => {
    c.fillStyle = 'rgba(25,22,20,0.5)';
    c.beginPath();
    c.ellipse(x, y, r * 1.3, r, 0, 0, Math.PI * 2);
    c.fill();
  };
  const pipe = (pts) => lineT(c, pts, '#6b7075', 0.6);
  if (lv === 1) {
    stain(2, -5, 3);
    pipe([[2, -6], [9, -6], [9, -11]]);
    pumpjackTop(c, -5, -6);
    tankTop(c, 14, -14, 5);
    for (const [x, y] of [[5, 10], [7.4, 10.6], [6, 12.6]]) circle(c, x, y, 0.9, '#3d5a7a');
  } else if (lv === 2) {
    stain(-6, -12, 2.6);
    stain(9, 8, 2.6);
    pipe([[-6, -13], [8, -13], [10, -14]]);
    pipe([[9, 7], [16, 7], [17.5, -1]]);
    pumpjackTop(c, -13, -12);
    pumpjackTop(c, 2, 8);
    tankTop(c, 14, -15, 4.6);
    tankTop(c, 19.5, -4, 3.6);
    shadowTop(c, -22, 9, -14, 19, 8);
    gableTop(c, -22, 9, -14, 19, 'v', '#6a6f74');
  } else {
    stain(9, 9, 2.6);
    pipe([[-4, -12], [11, -12]]);
    pipe([[9, 8], [16, 8], [18, -1]]);
    rectF(c, -20.6, 8.4, -5.4, 13.6, 'rgba(0,0,0,0.18)');
    for (const y of [9, 11, 13]) rectS(c, -20.6, y - 0.6, -6, y + 0.6, '#9aa0a5', 'rgba(0,0,0,0.35)', 0.25);
    pumpjackTop(c, 2, 9);
    tankTop(c, 15, -15, 4.6);
    tankTop(c, 20, -4.5, 3.6);
    rectS(c, -19, -19, -5, -5, '#8f8c84', 'rgba(0,0,0,0.45)', 0.4);
    rectS(c, -5, -14.2, -0.5, -9.8, '#7a7f84', 'rgba(0,0,0,0.4)', 0.3);
    latticeTop(c, -12, -12, 5, 44, '#b5452f');
    rectS(c, -13.9, -13.9, -10.1, -10.1, '#7d7a72', 'rgba(0,0,0,0.45)', 0.3);
  }
  void o;
}
function mineTop(c, lv, o) {
  ({ wood: woodTop, stone: stoneTop, ore: oreTop, oil: oilTop }[o.dep] ?? oreTop)(c, lv, o);
}

const TOP = {
  res: [res1Top, res2Top, res3Top],
  com: [com1Top, com2Top, com3Top],
  market: [market1Top, market2Top, market3Top],
  dc: [dc1Top, dc2Top, dc3Top],
  hospital: [hosp1Top, (c, o) => hosp2Top(c, o, 2), (c, o) => hosp2Top(c, o, 3)],
  heliport: [(c, o) => heli1Top(c, o, 1), (c, o) => heli1Top(c, o, 2), (c, o) => heli1Top(c, o, 3)],
  mine: [(c, o) => mineTop(c, 1, o), (c, o) => mineTop(c, 2, o), (c, o) => mineTop(c, 3, o)],
};

function plainTop(c, lv) {
  const s = 14 + lv * 3;
  shadowTop(c, -s, -s, s, s, 12 + lv * 6);
  flatTop(c, -s, -s, s, s, '#c9c4b8');
}

function paintTop(ctx, s, b, lv) {
  ctx.scale(s, s);
  const o = { v: b.variant % 3, seed: b.variant * 7 + 11, color: b.color, dep: b.dep };
  const f = TOP[b.ck]?.[lv - 1];
  if (f) f(ctx, o);
  else plainTop(ctx, lv);
}

// ---------- Schnittstelle ----------

let dpr = 1;

/** Zu Beginn jedes Bilds (Renderer): Gerätepixel je CSS-Pixel merken und das Zeitbudget des Zwischenspeichers zurücksetzen. */
export function beginTownFrame(ratio) {
  dpr = ratio || 1;
  spriteFrame();
}

const tallOf = (ck, lv, dep) => (ck === 'mine' ? (MINE_TALL[dep] ?? MINE_TALL.ore)[lv] : TALL[ck]?.[lv]) ?? 40;
const teamKey = (ck, lv, dep, color) => (TEAM_SHOWN.has(ck === 'mine' ? `mine:${dep}` : ck + lv) ? color : '');

/** Höhe (Weltpixel) über dem höchsten Teil, für das Schild darüber (dep: Vorkommen der Förderanlage). */
export function townLift(ck, level, dep = null) {
  return tallOf(ck, clampLv(level), dep) + 6;
}

/** Isometrisch: Gebäude b als Bild aus dem Zwischenspeicher (für jede Drehung dasselbe), Ankerpunkt = Zellmitte am Boden. */
export function drawTownIso(ctx, cam, b, season = 'summer') {
  const lv = clampLv(b.level);
  const tall = tallOf(b.ck, lv, b.dep);
  const key = `i|${b.ck}|${lv}|${b.variant % 3}|${b.dep ?? ''}|${teamKey(b.ck, lv, b.dep, b.color)}|${season === 'winter' ? 1 : 0}`;
  const p = cam.worldToScreen(b.x, b.y);
  const z = cam.zoom;
  const e = sprite(key, z * dpr, [-41, -(tall + 1), 39, 21], (c, s) => paintIso(c, s, b, lv)); // Ausmaße gemessen (alle Varianten)
  if (e === false) return; // wird im nächsten Bild gemalt
  if (e) {
    blit(ctx, e, p.x, p.y, z);
    return;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1 / dpr, 1 / dpr);
  paintIso(ctx, z * dpr, b, lv);
  ctx.restore();
}

/** 2D von oben: Gebäude b als Bild aus dem Zwischenspeicher (Weltkoordinaten, Kamera-Transformation gesetzt). */
export function drawTownTop(ctx, b, zoom) {
  const lv = clampLv(b.level);
  const key = `t|${b.ck}|${lv}|${b.variant % 3}|${b.dep ?? ''}|${teamKey(b.ck, lv, b.dep, b.color)}`;
  const e = sprite(key, zoom * dpr, [-28, -28, 33, 31], (c, s) => paintTop(c, s, b, lv));
  if (e === false) return;
  if (e) {
    blit(ctx, e, b.x, b.y, 1);
    return;
  }
  ctx.save();
  ctx.translate(b.x, b.y);
  paintTop(ctx, 1, b, lv);
  ctx.restore();
}

void ball;
void coneRoof;
void WHITE;
