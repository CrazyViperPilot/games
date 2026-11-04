// Zeichenbaukasten für gemalte Gebäude (seit v5.18, PRD §15): Grundformen (Zylinder, Kegelstumpf, Hauben, Flamme) und Bauteile
// (Fenster, Türen, Dächer, Zäune, Bäume, Autos, Förderbänder, Schienen …) in örtlichen Iso-Koordinaten, dazu dieselben Teile von
// oben für die 2D-Ansicht. Genutzt von townhouses.js (1 × 1-Stadtgebäude) und works.js (Werke und Kraftwerk); die weiteren
// Gebäudegruppen bauen darauf auf.
// Iso: u = Welt-x, v = Welt-y ab dem Ankerpunkt, h = Höhe; sichtbar sind die Wand nach +v (Fläche 's', links), die Wand nach +u
// (Fläche 'e', rechts) und das Dach, Licht von links oben. G(ctx, s) liefert den Zeichenkontext (s Gerätepixel je Einheit).
// 2D (Namen auf …Top): Weltkoordinaten ab dem Ankerpunkt, der Kontext ist schon skaliert. Nur Zeichnen.
import { ISO_K } from './camera.js';
import { poly, box, lit, FACE, OUTLINE, DETAIL, pyramid } from './university.js';
import { shade, tint } from './sprites.js';
import { snowy, roofSnowOn } from './season.js';

export { poly, box, lit, FACE, OUTLINE, DETAIL, pyramid, shade, tint, snowy, roofSnowOn };

// ---------- Grundformen (isometrisch) ----------

export const GLOW = '#ffb347';

/** Kegelstumpf (r0 unten, r1 oben) mit Mitte (u, v) von h0 bis h1; r0 = r1 ergibt einen Zylinder. Licht von links. */
export function frustum(g, u, v, r0, r1, h0, h1, color, top = true) {
  const { P, ctx, z } = g;
  const [cx, y0] = P(u, v, h0);
  const [, y1] = P(u, v, h1);
  const R0 = r0 * z;
  const R1 = r1 * z;
  const grad = ctx.createLinearGradient(cx - R0, 0, cx + R0, 0);
  grad.addColorStop(0, tint(color, 0.12));
  grad.addColorStop(0.45, shade(color, 0.1));
  grad.addColorStop(1, shade(color, 0.48));
  ctx.beginPath();
  ctx.moveTo(cx - R1, y1);
  ctx.lineTo(cx - R0, y0);
  ctx.ellipse(cx, y0, R0, R0 / 2, 0, Math.PI, 0, true);
  ctx.lineTo(cx + R1, y1);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.stroke();
  if (!top) return;
  ctx.beginPath();
  ctx.ellipse(cx, y1, R1, R1 / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = tint(color, 0.2);
  ctx.fill();
  ctx.stroke();
}

export const cyl = (g, u, v, r, h0, h1, color, top = true) => frustum(g, u, v, r, r, h0, h1, color, top);

/** Farbiges Band rund um einen Zylinder (nur die vordere Hälfte), von h0 bis h1. */
export function band(g, u, v, r, h0, h1, color) {
  const { P, ctx, z } = g;
  const [cx, y0] = P(u, v, h0);
  const [, y1] = P(u, v, h1);
  const R = r * z + 0.3;
  const grad = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
  grad.addColorStop(0, tint(color, 0.1));
  grad.addColorStop(1, shade(color, 0.45));
  ctx.beginPath();
  ctx.moveTo(cx - R, y1);
  ctx.lineTo(cx - R, y0);
  ctx.ellipse(cx, y0, R, R / 2, 0, Math.PI, 0, true);
  ctx.lineTo(cx + R, y1);
  ctx.ellipse(cx, y1, R, R / 2, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
}

/** Feine Naht (vordere Hälfte eines Kreises) auf Höhe h. */
export function seam(g, u, v, r, h, color = 'rgba(60,60,70,0.35)') {
  if (g.z < DETAIL) return;
  const { P, ctx, z } = g;
  const [cx, y] = P(u, v, h);
  ctx.beginPath();
  ctx.ellipse(cx, y, r * z, (r * z) / 2, 0, 0, Math.PI);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.5, 0.8 * z);
  ctx.stroke();
}

/** Flaches Kegeldach über einem Zylinder (Öltank): Spitze rh über dem Rand. */
export function coneRoof(g, u, v, r, h, rh, color) {
  const { P, ctx, z } = g;
  const [cx, y] = P(u, v, h);
  const [, ty] = P(u, v, h + rh);
  const R = r * z;
  const grad = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
  grad.addColorStop(0, tint(color, 0.25));
  grad.addColorStop(1, shade(color, 0.25));
  ctx.beginPath();
  ctx.moveTo(cx - R, y);
  ctx.lineTo(cx, ty);
  ctx.lineTo(cx + R, y);
  ctx.ellipse(cx, y, R, R / 2, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.stroke();
}

/** Halbkugel- oder Spitzhaube (Winderhitzer, Geschossspitze) mit Radius r auf Höhe h; tall = Höhe/Radius. */
export function cap(g, u, v, r, h, color, tall = 1) {
  const { P, ctx, z } = g;
  const [cx, cy] = P(u, v, h);
  const R = r * z;
  const grad = ctx.createRadialGradient(cx - R * 0.4, cy - R * tall * 0.7, R * 0.1, cx, cy - R * tall * 0.3, R * 1.4 * Math.max(1, tall * 0.8));
  grad.addColorStop(0, tint(color, 0.35));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, shade(color, 0.45));
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R / 2, 0, 0, Math.PI);
  ctx.ellipse(cx, cy, R, R * tall, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.stroke();
}

/** Flamme (Fackel) über dem Punkt (u, v, h). */
export function flame(g, u, v, h, s = 1) {
  const { P, ctx, z } = g;
  const [x, y] = P(u, v, h);
  const H = 11 * s * z;
  const W = 4 * s * z;
  const grad = ctx.createLinearGradient(0, y, 0, y - H);
  grad.addColorStop(0, '#fff2a8');
  grad.addColorStop(0.45, GLOW);
  grad.addColorStop(1, 'rgba(230,80,30,0.85)');
  ctx.beginPath();
  ctx.moveTo(x - W, y);
  ctx.quadraticCurveTo(x - W * 1.2, y - H * 0.5, x, y - H);
  ctx.quadraticCurveTo(x + W * 1.2, y - H * 0.5, x + W, y);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
}

export function circle(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Kreis mit Licht von links oben (Tank, Turm von oben). */
export function ball(ctx, x, y, r, color) {
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  grad.addColorStop(0, tint(color, 0.25));
  grad.addColorStop(1, shade(color, 0.22));
  circle(ctx, x, y, r, grad);
  ctx.strokeStyle = 'rgba(40,40,40,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function ring(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, r - 2, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------- Farben, Zufall, Zeichenkontext und Bauteile (isometrisch) ----------
export const GLASS = '#34506d';
export const WARM = '#f3d885';
export const SILL = '#ece7dc';
export const LAWN = '#86b35c';
export const LAWN2 = '#92bd67';
export const HEDGE = '#4f7e3a';
export const PATH = '#dccfb2';
export const PAVE = '#c4bdae';
export const PLAZA = '#d3cab8';
export const ASPH = '#676b66';
export const DECK = '#8f8d86'; // Flachdach (Dachpappe, Kies)
export const WHITE = '#eeece6';

export const CAR_COLORS = ['#c0392b', '#2e5c8a', '#e8e4da', '#3d3d3d', '#d9a441', '#5b8a4e', '#8e9aa3'];

// Winter (wie die Bäume der Karte): Krone gedämpft dunkelgrün, oben Schnee
export const LEAF_SNOW = ['#eef3f7', '#5f7766', '#33473a'];

export const leaves = (t) => (roofSnowOn() ? LEAF_SNOW : LEAF[((t % 3) + 3) % 3]);

export const LEAF = [
  ['#a3d273', '#5f9c41', '#2f5f25'],
  ['#b6d067', '#71993a', '#3f5f21'],
  ['#8fc77e', '#4c8b50', '#265a34'],
];

export const rnd = (n) => ((Math.imul(n | 0, 2654435761) >>> 0) % 1000) / 1000;

export const clampLv = (lv) => Math.max(1, Math.min(3, lv | 0));

/** Zeichenkontext: s Gerätepixel je Einheit, Zellmitte im Ursprung. fine = genug Pixel für Feinheiten (Fensterrahmen, Ziegel). */
export function G(ctx, s) {
  const k = ISO_K * s;
  return { ctx, z: s, fine: s >= 1.15, P: (u, v, h = 0) => [(u - v) * k, (u + v) * k * 0.5 - h * s] };
}

/** Punkt auf einer Wand: Fläche 's' (Ebene v = plane, Achse u) oder 'e' (Ebene u = plane, Achse v); off ragt aus der Wand. */
export const onFace = (g, face, plane) => (face === 's' ? (a, h, off = 0) => g.P(a, plane + off, h) : (a, h, off = 0) => g.P(plane + off, a, h));

export function stroke(g, pts, color = OUTLINE, w = 0.9) {
  const { ctx } = g;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.6, w * g.z);
  ctx.stroke();
}

/** Fläche am Boden (oder auf Höhe h). */
export function flat(g, u0, u1, v0, v1, color, h = 0) {
  const { P } = g;
  poly(g, [P(u0, v0, h), P(u1, v0, h), P(u1, v1, h), P(u0, v1, h)], color, null);
}

/** Schatten nach links unten (wie Werke und Häuser der Karte): Grundriss, nach +v verlängert. */
export function shadow(g, u0, u1, v0, v1, h, a = 0.2) {
  flat(g, u0 - 0.5, u1, v0, v1 + Math.min(11, h * 0.28) + 0.6, `rgba(0,0,0,${a})`);
}

/** Dunkler Sockel unten an beiden sichtbaren Wänden. */
export function plinth(g, u0, u1, v0, v1, color, h = 1.6) {
  const { P } = g;
  poly(g, [P(u0, v1, 0), P(u1, v1, 0), P(u1, v1, h), P(u0, v1, h)], lit(shade(color, 0.3), ...FACE.s), null);
  poly(g, [P(u1, v0, 0), P(u1, v1, 0), P(u1, v1, h), P(u1, v0, h)], lit(shade(color, 0.3), ...FACE.e), null);
}

/** Waagrechte Linie rund um beide sichtbaren Wände (Geschossdecke, Gesims). */
export function ledge(g, u0, u1, v0, v1, h, color = 'rgba(0,0,0,0.18)', w = 0.8) {
  const { P } = g;
  stroke(g, [P(u0, v1, h), P(u1, v1, h), P(u1, v0, h)], color, w);
}

/** Farbband auf beiden sichtbaren Wänden von h0 bis h1. */
export function wallBand(g, u0, u1, v0, v1, h0, h1, color) {
  const { P } = g;
  poly(g, [P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1)], lit(color, ...FACE.s), null);
  poly(g, [P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1)], lit(color, ...FACE.e), null);
}

/** Fenster mit Rahmen und Spiegelung an den Stellen at (Mitte entlang der Wand), je Reihe [h0, h1]; manche warm beleuchtet. */
export function winsAt(g, face, plane, at, rows, ww, o = {}) {
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
export function wins(g, face, plane, a0, a1, n, rows, ww, o = {}) {
  const step = (a1 - a0) / n;
  winsAt(g, face, plane, Array.from({ length: n }, (_, i) => a0 + step * (i + 0.5)), rows, ww, o);
}

/** Tür mit hellem Rahmen. */
export function door(g, face, plane, a, w, h, col = '#6a4a32') {
  const pt = onFace(g, face, plane);
  poly(g, [pt(a - w / 2 - 0.6, 0), pt(a + w / 2 + 0.6, 0), pt(a + w / 2 + 0.6, h + 0.6), pt(a - w / 2 - 0.6, h + 0.6)], lit(SILL, ...FACE[face]), null);
  poly(g, [pt(a - w / 2, 0), pt(a + w / 2, 0), pt(a + w / 2, h), pt(a - w / 2, h)], lit(col, ...FACE[face]), OUTLINE);
}

/** Satteldach über [u0,u1]×[v0,v1], Traufe auf h, First rh höher; axis = Richtung des Firsts, sichtbarer Giebel an u1 bzw. v1. */
export function gable(g, axis, u0, u1, v0, v1, h, rh, roof, wall, extra = null, o = 1.6) {
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
export function hip(g, u0, u1, v0, v1, h, rh, roof, extra = null, o = 1.3) {
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
export function parapet(g, u0, u1, v0, v1, h, wall, deck = DECK, rim = 1.1) {
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
export function balcony(g, face, plane, a0, a1, h, d, rail) {
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
export function awning(g, face, plane, a0, a1, h, d, drop, cols, n = 8) {
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
export function tree(g, u, v, s = 1, t = 0) {
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
export function conifer(g, u, v, s = 1) {
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
export function bush(g, u, v, s = 1, t = 0) {
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
export function car(g, u, v, along, color) {
  const [hu, hv] = along === 'u' ? [4.3, 2.1] : [2.1, 4.3];
  flat(g, u - hu, u + hu, v - hv, v + hv + 1.1, 'rgba(0,0,0,0.22)');
  box(g, u - hu, u + hu, v - hv, v + hv, 0.6, 3.1, color, tint(color, 0.08));
  const [cu, cv] = along === 'u' ? [2.4, 1.8] : [1.8, 2.4];
  const du = along === 'u' ? -0.5 : 0;
  const dv = along === 'u' ? 0 : -0.5;
  box(g, u + du - cu, u + du + cu, v + dv - cv, v + dv + cv, 3.1, 4.8, '#2c3a47', tint(color, 0.12));
}

/** Krankenwagen oder Lieferwagen: hoher Kasten mit Band, Fahrerhaus vorn (+u bzw. +v), optional Blaulicht. */
export function van(g, u, v, along, color, band, light = false) {
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
export function lamp(g, u, v, h = 9) {
  const { P } = g;
  stroke(g, [P(u, v, 0), P(u, v, h)], '#3e4246', 0.9);
  box(g, u - 0.8, u + 0.8, v - 0.8, v + 0.8, h - 1.2, h, '#f1df9a', '#55595d');
}

/** Fahnenmast mit Fahne in Teamfarbe. */
export function flagpole(g, u, v, h0, len, color) {
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
export function acUnit(g, u, v, h, s = 2.4, col = '#b9bdc0') {
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

export const k3 = (n) => ((n % 3) + 3) % 3;

/** Kreisscheibe in einer Wandebene (Uhr, Stirnseite eines Stamms): Mitte a (entlang der Wand) auf Höhe h; off ragt aus der Wand. */
export function disc(g, face, plane, a, h, r, fill, line = OUTLINE, off = 0, n = 16) {
  const pt = onFace(g, face, plane);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    pts.push(pt(a + r * Math.cos(t), h + r * Math.sin(t), off));
  }
  poly(g, pts, fill, line);
}

/** Kreis am Boden (oder auf Höhe h) als Eckpunkte. */
export function groundRing(g, u, v, r, h = 0, n = 24) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    pts.push(g.P(u + r * Math.cos(t), v + r * Math.sin(t), h));
  }
  return pts;
}

/** Rundbogenfenster (Rechteck bis h1, darüber ein Halbkreis) mit hellem Rahmen. */
export function archWins(g, face, plane, at, h0, h1, ww, o = {}) {
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
export function fanWin(g, face, plane, a, h, r) {
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
export function vault(g, axis, u0, u1, v0, v1, h, rh, roof, wall, n = 10) {
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
export function cobble(g, color = '#d2c6ad') {
  flat(g, -25, 25, -25, 25, color);
  if (!g.fine) return;
  const { P } = g;
  for (let k = -21; k <= 21; k += 6) {
    stroke(g, [P(k, -25, 0), P(k, 25, 0)], 'rgba(0,0,0,0.06)', 0.5);
    stroke(g, [P(-25, k, 0), P(25, k, 0)], 'rgba(0,0,0,0.06)', 0.5);
  }
}

/** Kiste (Holz) oder Steinblock. */
export function crate(g, u, v, s = 1.1, h = 2.2, col = '#a07a4f') {
  box(g, u - s, u + s, v - s, v + s, 0, h, col, tint(col, 0.14));
}

/** Zaun um [u0,u1]×[v0,v1]: part 'back' = hintere Seiten (vor dem Gebäude malen), 'front' = vordere Seiten (danach). */
export function fence(g, u0, u1, v0, v1, part, h = 3.2) {
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

/** Senkrechte Rippen der Metallverkleidung. */
export function ribs(g, u0, u1, v0, v1, h0, h1, step = 1.8) {
  if (!g.fine) return;
  const { P } = g;
  for (let a = u0 + step; a < u1 - 0.3; a += step) stroke(g, [P(a, v1, h0), P(a, v1, h1)], 'rgba(255,255,255,0.08)', 0.5);
  for (let a = v0 + step; a < v1 - 0.3; a += step) stroke(g, [P(u1, a, h0), P(u1, a, h1)], 'rgba(0,0,0,0.14)', 0.5);
}

/** Lüfter (Gehäuse mit dunklem Rotor) auf Höhe h. */
export function fan(g, u, v, h, r) {
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

/** Parabolantenne auf einem Sockel. */
export function dish(g, u, v, h, r) {
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
export function mast(g, u, v, h0, h1, r0, r1, color = '#a7adb2', light = true) {
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
  if (!light) return;
  const [x, y] = P(u, v, h1 + 0.8);
  circle(g.ctx, x, y, Math.max(0.9, 1.2 * g.z), '#ff4a3a');
}

/** Holzstapel: Prisma aus Stämmen entlang u, Stirnseiten (Kreise) an u1. */
export function logPile(g, u0, u1, v0, v1, rows) {
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

/** Offener Schuppen: Stützen, Inhalt (fill), Satteldach. */
export function shed(g, u0, u1, v0, v1, H, rh, roof, fill) {
  const { P } = g;
  shadow(g, u0, u1, v0, v1, H + rh, 0.14);
  stroke(g, [P(u0, v0, 0), P(u0, v0, H)], '#6b5a48', 1);
  stroke(g, [P(u1, v0, 0), P(u1, v0, H)], '#6b5a48', 1);
  fill?.();
  stroke(g, [P(u0, v1, 0), P(u0, v1, H)], '#6b5a48', 1);
  stroke(g, [P(u1, v1, 0), P(u1, v1, H)], '#6b5a48', 1);
  gable(g, 'u', u0, u1, v0, v1, H, rh, roof, '#8b6a48');
}

/** Bretterstapel. */
export function planks(g, u0, u1, v0, v1, h) {
  box(g, u0, u1, v0, v1, 0, h, '#d4ad78', '#e2c28f');
  if (!g.fine) return;
  const { P } = g;
  for (let k = 0.7; k < h; k += 0.7) stroke(g, [P(u0, v1, k), P(u1, v1, k), P(u1, v0, k)], 'rgba(90,60,30,0.35)', 0.4);
  for (let k = 0.8; k < h - 0.3; k += 1.4) stroke(g, [P(u0, v1, k), P(u1, v1, k)], 'rgba(60,40,20,0.25)', 0.5);
}

/** Radlader (gelb) mit Schaufel nach +u. */
export function loader(g, u, v) {
  flat(g, u - 4, u + 5, v - 2.4, v + 3.6, 'rgba(0,0,0,0.2)');
  for (const [a, b] of [[u - 2.6, v - 2.2], [u + 2, v - 2.2]]) box(g, a - 1.1, a + 1.1, b - 0.5, b, 0, 2.2, '#2f3134');
  box(g, u - 3.8, u + 3, v - 1.8, v + 1.8, 1, 3.6, '#e2b021', '#e9c24a');
  box(g, u - 3.4, u - 0.6, v - 1.6, v + 1.6, 3.6, 6.6, '#e2b021', '#e9c24a');
  const { P } = g;
  poly(g, [P(u - 3.4, v + 1.6, 4.4), P(u - 0.6, v + 1.6, 4.4), P(u - 0.6, v + 1.6, 6.2), P(u - 3.4, v + 1.6, 6.2)], lit('#34506d', ...FACE.s), null);
  for (const [a, b] of [[u - 2.6, v + 2.2], [u + 2, v + 2.2]]) box(g, a - 1.1, a + 1.1, b - 0.1, b + 0.4, 0, 2.2, '#2f3134');
  box(g, u + 3.4, u + 5.4, v - 2.2, v + 2.2, 0.4, 2.4, '#5d6064');
}

/** Schüttkegel (Kies, Erz). */
export function heap(g, u, v, r, h, color) {
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
export function conveyor(g, u0, v0, h0, u1, v1, h1, w = 1.3) {
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

/** Bagger (gelb) mit Ausleger nach +u, auf Höhe h. */
export function excavator(g, u, v, h) {
  box(g, u - 3.5, u + 3.5, v - 2.6, v + 2.6, h, h + 1.6, '#3b3b3b');
  box(g, u - 3, u + 2.2, v - 2.2, v + 2.2, h + 1.6, h + 4, '#e2b021', '#e9c24a');
  box(g, u - 0.2, u + 2.2, v - 2.2, v - 0.2, h + 4, h + 6.6, '#e2b021', '#e9c24a');
  const pt = onFace(g, 's', v + 0.6);
  stroke(g, [pt(u + 1.6, h + 4), pt(u + 6.5, h + 8.6), pt(u + 9.4, h + 3)], '#d39d14', 1.3);
  poly(g, [pt(u + 8.4, h + 3.4), pt(u + 10.8, h + 3), pt(u + 10.2, h + 0.8), pt(u + 8.6, h + 1.2)], lit('#5d6064', ...FACE.s));
}

/** Muldenkipper (gelbe Mulde mit Kies, helles Fahrerhaus vorn bei +u). */
export function truck(g, u, v) {
  flat(g, u - 5, u + 5.5, v - 2.4, v + 3.8, 'rgba(0,0,0,0.2)');
  box(g, u - 5, u + 1.6, v - 2.2, v + 2.2, 0.9, 4.4, '#e2b021', '#c99a14');
  box(g, u - 4.4, u + 1, v - 1.6, v + 1.6, 4.4, 5.2, '#bdb6a8', '#cfc8ba', null);
  box(g, u + 1.8, u + 5, v - 2, v + 2, 0.9, 5, '#d4d0c6', '#e0ddd5');
  const { P } = g;
  poly(g, [P(u + 5, v - 1.6, 3), P(u + 5, v + 1.6, 3), P(u + 5, v + 1.6, 4.6), P(u + 5, v - 1.6, 4.6)], lit('#34506d', ...FACE.e), null);
  for (const a of [u - 3.4, u + 3.4]) box(g, a - 1, a + 1, v + 2, v + 2.5, 0, 1.9, '#2f3134');
}

/** Speichenrad (Seilscheibe) in einer Wandebene. */
export function wheel(g, face, plane, a, h, r, color) {
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

/** Schienen entlang u mit Schwellen. */
export function rails(g, u0, u1, v) {
  const { P } = g;
  if (g.fine) for (let a = u0; a <= u1; a += 1.6) stroke(g, [P(a, v - 1.5, 0), P(a, v + 1.5, 0)], '#6b5a48', 0.75);
  for (const d of [-0.95, 0.95]) stroke(g, [P(u0, v + d, 0.25), P(u1, v + d, 0.25)], '#45484b', 0.6);
}

// ---------- Bauteile von oben (2D) ----------

export function rectF(c, x0, y0, x1, y1, fill) {
  c.fillStyle = fill;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
}

export function rectS(c, x0, y0, x1, y1, fill, line = 'rgba(0,0,0,0.35)', w = 0.5) {
  rectF(c, x0, y0, x1, y1, fill);
  c.strokeStyle = line;
  c.lineWidth = w;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

export function polyF(c, pts, fill) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/** Schatten nach rechts unten (wie die Großbauten in 2D), länger je höher. */
export function shadowTop(c, x0, y0, x1, y1, h) {
  const s = Math.min(16, h * 0.22);
  polyF(c, [[x0, y0], [x1, y0], [x1 + s, y0 + s], [x1 + s, y1 + s], [x0 + s, y1 + s], [x0, y1]], 'rgba(0,0,0,0.26)');
}

/** Satteldach von oben: First entlang x ('u') oder y ('v'); Licht von links oben. */
export function gableTop(c, x0, y0, x1, y1, axis, roof, o = 1.5) {
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
export function hipTop(c, x0, y0, x1, y1, roof, o = 1.3) {
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
export function flatTop(c, x0, y0, x1, y1, rim, deck = DECK) {
  rectS(c, x0, y0, x1, y1, tint(rim, 0.1));
  rectF(c, x0 + 1.2, y0 + 1.2, x1 - 1.2, y1 - 1.2, deck);
  rectF(c, x0 + 1.2, y0 + 1.2, x1 - 1.2, y0 + 2, 'rgba(0,0,0,0.18)');
  rectF(c, x0 + 1.2, y0 + 2, x0 + 2, y1 - 1.2, 'rgba(0,0,0,0.18)');
}

export function treeTop(c, x, y, r, t = 0) {
  circle(c, x + r * 0.45, y + r * 0.45, r, 'rgba(0,0,0,0.25)');
  const L = LEAF[k3(t)];
  const grad = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  grad.addColorStop(0, L[0]);
  grad.addColorStop(0.6, L[1]);
  grad.addColorStop(1, L[2]);
  circle(c, x, y, r, grad);
}

export function carTop(c, x, y, along, color) {
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

/** Markise von oben: Streifen entlang x von x0 bis x1, Tiefe y0…y1. */
export function awningTop(c, x0, x1, y0, y1, cols, n = 8) {
  for (let i = 0; i < n; i++) rectF(c, x0 + ((x1 - x0) * i) / n, y0, x0 + ((x1 - x0) * (i + 1)) / n, y1, cols[i % 2]);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 0.4;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

export function acTop(c, x, y, s = 2.4) {
  rectS(c, x - s, y - s * 0.7, x + s, y + s * 0.7, '#c4c8cb', 'rgba(0,0,0,0.4)', 0.35);
  circle(c, x, y, s * 0.5, '#5f6468');
}

export function lineT(c, pts, color, w) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke();
}

export function cobbleTop(c, color = '#d2c6ad') {
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

/** Tonnendach von oben (First entlang axis): Verlauf quer zur Achse, Licht von links oben. */
export function vaultTop(c, x0, y0, x1, y1, axis, roof, skylight = true) {
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
export function pyramidTop(c, x0, y0, x1, y1, roof) {
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

export function fenceTop(c, x0, y0, x1, y1) {
  c.save();
  c.setLineDash([1.6, 0.9]);
  c.strokeStyle = 'rgba(55,60,66,0.75)';
  c.lineWidth = 0.45;
  c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  c.restore();
}

export function dishTop(c, x, y, r) {
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
export function latticeTop(c, x, y, s, len, color) {
  lineT(c, [[x, y], [x + len * 0.7, y + len * 0.7]], 'rgba(0,0,0,0.28)', s * 1.2);
  rectF(c, x - s, y - s, x + s, y + s, 'rgba(0,0,0,0.15)');
  c.strokeStyle = color;
  c.lineWidth = 0.6;
  c.strokeRect(x - s, y - s, 2 * s, 2 * s);
  lineT(c, [[x - s, y - s], [x + s, y + s]], color, 0.45);
  lineT(c, [[x + s, y - s], [x - s, y + s]], color, 0.45);
}

export function vanTop(c, x, y, along, color, band, light) {
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

export function tankTop(c, x, y, r, color = '#dedbd2') {
  circle(c, x + r * 0.35, y + r * 0.35, r, 'rgba(0,0,0,0.25)');
  ball(c, x, y, r, color);
  c.strokeStyle = 'rgba(0,0,0,0.2)';
  c.lineWidth = 0.35;
  c.beginPath();
  c.arc(x, y, r * 0.6, 0, Math.PI * 2);
  c.stroke();
}

export function heapTop(c, x, y, r, color) {
  circle(c, x + r * 0.35, y + r * 0.35, r, 'rgba(0,0,0,0.22)');
  const grad = c.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.3, x, y, r);
  grad.addColorStop(0, tint(color, 0.25));
  grad.addColorStop(1, shade(color, 0.3));
  circle(c, x, y, r, grad);
}

/** Holzstapel von oben: Stämme entlang x mit hellen Enden rechts. */
export function logsTop(c, x0, y0, x1, y1, rows) {
  rectF(c, x0 + 0.8, y0 + 0.8, x1 + 0.8, y1 + 1.4, 'rgba(0,0,0,0.22)');
  const h = (y1 - y0) / rows;
  for (let k = 0; k < rows; k++) {
    const a = y0 + k * h;
    rectS(c, x0, a, x1, a + h, k % 2 ? '#7d5734' : '#8a6440', 'rgba(40,25,10,0.45)', 0.3);
    circle(c, x1, a + h / 2, h / 2, '#dcb47e');
  }
}

export function planksTop(c, x0, y0, x1, y1) {
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

export function yellowTop(c, x0, y0, x1, y1) {
  rectF(c, x0 + 0.8, y0 + 0.8, x1 + 0.8, y1 + 0.8, 'rgba(0,0,0,0.25)');
  rectS(c, x0, y0, x1, y1, '#e2b021', 'rgba(0,0,0,0.45)', 0.35);
}

export function railsTop(c, x0, x1, y) {
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
