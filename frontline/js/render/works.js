// Werke als 2 × 2-Großbauten (seit v5.08, PRD §15): BM-Werk (Ziegelei mit Holzlager), Munitionswerk (Bunker mit Riesenpatrone),
// Raffinerie (großer Öltank, Destillationstürme) und Stahlwerk (Hochofen mit Winderhitzern); seit v5.19 außerdem Hütte (Hochofen mit
// Glut, Schornstein) und Kerosin-Raffinerie (Kugeltanks mit blauen Tankringen). Jede Anlage ist vierfach symmetrisch
// (Drehung um 90° ergibt dasselbe Bild), darum zeichnet die Iso-Ansicht wie bei der Universität für jede Drehung der Karte dasselbe
// Bild. Stufe 2 und 3 fügen Türme, Lager und Schornsteine hinzu. 2D: dieselbe Anlage von oben.
// Nur Zeichnen (liest b = { x, y, kind, level, color, damage }; Mitte des Quadrats in Weltkoordinaten, es reicht bis ±64).
// Grundformen (frustum, cyl, seam, coneRoof, cap, circle, ball) nutzen seit v5.14 auch die 1 × 1-Stadtgebäude (townhouses.js).
import { iso, poly, box, lit, pyramid, FACE, OUTLINE, DETAIL } from './university.js';
import { shade, tint } from './sprites.js';
import { snowy } from './season.js';

export const WORKS_KINDS = ['bm', 'mun', 'fuel', 'steel', 'smelter', 'kero'];
/** Boden unter dem fertigen Werk (Pflaster, Schotter, Erde). */
export const WORKS_GROUND = { bm: '#b39a74', mun: '#8b9273', fuel: '#8f9398', steel: '#7a756f', smelter: '#7d6a5c', kero: '#8a9aa6' };

const TANK = '#e9ecef'; // Öltank: helles Silber
const PIPE = '#9aa1a8';
const BRICK = '#a9523b';
const WOOD = '#b98a52';
const CONCRETE = '#9a9c8e';
const BRASS = '#d4a94a';
const COPPER = '#b5643a';
const OLIVE = '#6f7448';
const STEEL = '#5b6570';
const RUST = '#6e4a3b';
const GLOW = '#ffb347';
const BLUE = '#2f7fd1'; // Tankringe der Kerosin-Raffinerie
const SLAG = '#6f675e'; // Hütte: Hallen aus dunklem Stein

// Maße je Stufe (Weltpixel ab der Mitte)
const FUEL = [null,
  { tank: 25, tankH: 22, small: 10, smallH: 14, at: 44, col: 0, colH: 0, flare: false },
  { tank: 29, tankH: 26, small: 10, smallH: 16, at: 45, col: 5.5, colH: 50, flare: false },
  { tank: 32, tankH: 30, small: 11, smallH: 18, at: 46, col: 6, colH: 62, flare: true }];
const STEELW = [null,
  { hall: 24, hallH: 12, furn: 12, furnH: 40, stove: 8, stoveH: 30, at: 40, chim: 0, chimH: 0 },
  { hall: 26, hallH: 14, furn: 13, furnH: 48, stove: 9, stoveH: 38, at: 41, chim: 0, chimH: 0 },
  { hall: 27, hallH: 15, furn: 14, furnH: 54, stove: 9.5, stoveH: 42, at: 42, chim: 4, chimH: 68 }];
const MUN = [null,
  { bunk: 22, bunkH: 13, shell: 8, shellH: 20, crate: 9, crateH: 9, at: 42, pallets: false, mounds: false },
  { bunk: 25, bunkH: 15, shell: 9, shellH: 24, crate: 10, crateH: 14, at: 43, pallets: true, mounds: false },
  { bunk: 27, bunkH: 16, shell: 10, shellH: 27, crate: 10, crateH: 14, at: 43, pallets: true, mounds: true }];
const BM = [null,
  { hall: 22, hallH: 14, chim: 5, chimH: 44, logs: 11, logsH: 10, at: 42, bricks: false, roof: false },
  { hall: 24, hallH: 15, chim: 6, chimH: 54, logs: 12, logsH: 12, at: 43, bricks: true, roof: true },
  { hall: 26, hallH: 16, chim: 6.5, chimH: 62, logs: 12, logsH: 14, at: 43, bricks: true, roof: true }];
// Hütte (seit v5.19): hoher Hochofenschacht mit Glut oben, Gießhalle; ab Stufe 2 Schornstein an der hinteren Ecke
const SMELT = [null,
  { hall: 22, hallH: 12, tower: 9, towerH: 46, at: 40, chim: 0, chimH: 0 },
  { hall: 24, hallH: 13, tower: 10, towerH: 58, at: 41, chim: 4, chimH: 60 },
  { hall: 26, hallH: 14, tower: 11, towerH: 70, at: 42, chim: 4.5, chimH: 80 }];
// Kerosin-Raffinerie (seit v5.19): Kugeltanks (2, 3, 4 je Stufe) mit blauen Ringen, Pumpenhaus in der Mitte; ab Stufe 3 Fackel
const KERO = [null,
  { tank: 13, tankH: 22, at: 24, n: 2, pump: 8, pumpH: 9, stack: 0, stackH: 0 },
  { tank: 14, tankH: 26, at: 25, n: 3, pump: 9, pumpH: 11, stack: 0, stackH: 0 },
  { tank: 15, tankH: 30, at: 26, n: 4, pump: 10, pumpH: 13, stack: 3, stackH: 46 }];
/** Tankpositionen je Anzahl Tanks (diagonal, dann die Ecken). */
const KERO_TANKS = { 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [1, -1], [-1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]] };

const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const EDGES = [[-1, 0], [0, -1], [1, 0], [0, 1]];

/** Höhe (Weltpixel) des höchsten Teils, für das Schild darüber. */
export function worksLift(kind, level) {
  const lv = Math.max(1, Math.min(3, level | 0));
  if (kind === 'fuel') return Math.max(FUEL[lv].tankH + 10, FUEL[lv].colH) + 14;
  if (kind === 'steel') return Math.max(STEELW[lv].hallH + STEELW[lv].furnH, STEELW[lv].chimH) + 12;
  if (kind === 'mun') return MUN[lv].bunkH + MUN[lv].shellH * 1.6 + 12;
  if (kind === 'smelter') return Math.max(SMELT[lv].hallH + SMELT[lv].towerH + 8, SMELT[lv].chimH) + 12;
  if (kind === 'kero') return Math.max(KERO[lv].tankH + 10, KERO[lv].stackH + 6) + 14;
  return BM[lv].chimH + 12;
}

// ---------- Grundformen (isometrisch) ----------

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
function band(g, u, v, r, h0, h1, color) {
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
function flame(g, u, v, h, s = 1) {
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

/** Schatten eines Quaders oder Zylinders (nach links unten wie bei den anderen Gebäuden). */
function shadowBox(g, u0, u1, v0, v1, h) {
  const { P } = g;
  const o = h * 0.35;
  const pts = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)].map(([x, y]) => [x - o * g.z, y + o * 0.5 * g.z]);
  poly(g, pts, 'rgba(0,0,0,0.18)', null);
}
function shadowCyl(g, u, v, r, h) {
  const { P, ctx, z } = g;
  const [x, y] = P(u, v);
  const o = h * 0.35 * z;
  ctx.beginPath();
  ctx.ellipse(x - o * 0.6, y + o * 0.3, r * z + o * 0.5, (r * z) / 2 + o * 0.25, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill();
}

/** Fahne in Teamfarbe an einem Mast ab (u, v, h). */
function flag(g, u, v, h, color, len = 12) {
  const { P, ctx, z } = g;
  const [x, y0] = P(u, v, h);
  const [, y1] = P(u, v, h + len);
  ctx.strokeStyle = '#d9d4c4';
  ctx.lineWidth = Math.max(1, 1.3 * z);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(x, y1, 9 * z, 5.5 * z);
}

/** Zeichnet die Teile (Tiefe = u + v) von hinten nach vorne. */
function paint(items) {
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.f();
}

// ---------- Raffinerie: großer Öltank in der Auffangwanne, kleine Tanks in den Ecken, Destillationstürme mit Fackel ----------

function fuelIso(g, L, color) {
  const items = [];
  const T = L.tank;
  for (const [su, sv] of CORNERS) {
    const u = su * L.at;
    const v = sv * L.at;
    items.push({ d: u + v, f: () => {
      cyl(g, u, v, L.small, 0, L.smallH, TANK, false);
      seam(g, u, v, L.small, L.smallH * 0.5);
      coneRoof(g, u, v, L.small, L.smallH, 3, '#d9dde1');
    } });
  }
  if (L.col) {
    for (const [su, sv] of EDGES) {
      const u = su * 50;
      const v = sv * 50;
      items.push({ d: u + v, f: () => {
        // Rohrleitung vom Tank zum Turm, dann der Turm mit Bühnen
        const a = T + 6;
        if (su) box(g, Math.min(su * a, u), Math.max(su * a, u), -2, 2, 3, 6, PIPE);
        else box(g, -2, 2, Math.min(sv * a, v), Math.max(sv * a, v), 3, 6, PIPE);
        cyl(g, u, v, L.col, 0, L.colH, '#cfd4d9');
        for (const f of [0.35, 0.65, 0.92]) cyl(g, u, v, L.col + 1.6, L.colH * f, L.colH * f + 1.5, '#7d858d');
        if (L.flare) flame(g, u, v, L.colH, 0.8);
      } });
    }
  }
  items.push({ d: 0, f: () => {
    cyl(g, 0, 0, T + 6, 0, 3, CONCRETE); // Auffangwanne
    cyl(g, 0, 0, T, 3, 3 + L.tankH, TANK, false);
    seam(g, 0, 0, T, 3 + L.tankH * 0.33);
    seam(g, 0, 0, T, 3 + L.tankH * 0.66);
    band(g, 0, 0, T, 3 + L.tankH - 6, 3 + L.tankH - 2.5, color); // Band in Teamfarbe
    coneRoof(g, 0, 0, T, 3 + L.tankH, 6, '#dfe3e7');
    if (g.z >= DETAIL) {
      // Treppe außen am Tank (vorne links)
      const { P, ctx, z } = g;
      const [x0, y0] = P(-T * 0.2, T * 0.98, 3);
      const [x1, y1] = P(-T * 0.86, T * 0.5, 3 + L.tankH);
      ctx.strokeStyle = 'rgba(70,75,85,0.75)';
      ctx.lineWidth = Math.max(0.8, 1.6 * z);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  } });
  for (const [su, sv] of CORNERS) shadowCyl(g, su * L.at, sv * L.at, L.small, L.smallH);
  shadowCyl(g, 0, 0, T, L.tankH);
  paint(items);
}

function fuelTop(ctx, x, y, L, color) {
  const T = L.tank;
  circle(ctx, x + 5, y + 5, T + 2, 'rgba(0,0,0,0.25)');
  for (const [su, sv] of CORNERS) circle(ctx, x + su * L.at + 3, y + sv * L.at + 3, L.small, 'rgba(0,0,0,0.25)');
  ring(ctx, x, y, T + 6, CONCRETE);
  if (L.col) {
    for (const [su, sv] of EDGES) {
      const u = x + su * 50;
      const v = y + sv * 50;
      ctx.fillStyle = PIPE;
      if (su) ctx.fillRect(Math.min(x + su * (T + 6), u), y - 2, Math.abs(u - x - su * (T + 6)), 4);
      else ctx.fillRect(x - 2, Math.min(y + sv * (T + 6), v), 4, Math.abs(v - y - sv * (T + 6)));
      circle(ctx, u + 4, v + 4, L.col + 1.5, 'rgba(0,0,0,0.3)');
      ball(ctx, u, v, L.col + 1.5, '#7d858d');
      ball(ctx, u, v, L.col, '#cfd4d9');
      if (L.flare) ball(ctx, u, v, 2.5, GLOW);
    }
  }
  for (const [su, sv] of CORNERS) {
    ball(ctx, x + su * L.at, y + sv * L.at, L.small, TANK);
    circle(ctx, x + su * L.at, y + sv * L.at, 2, '#9aa1a8');
  }
  ball(ctx, x, y, T, TANK);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, T - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(80,85,95,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, T * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  circle(ctx, x, y, 3, '#8d949b');
}

// ---------- Stahlwerk: Hochofen auf der Gießhalle, vier Winderhitzer, ab Stufe 3 rot-weiße Schornsteine ----------

function steelIso(g, L, color) {
  const items = [];
  for (const [su, sv] of CORNERS) {
    const u = su * L.at;
    const v = sv * L.at;
    items.push({ d: u + v, f: () => {
      cyl(g, u, v, L.stove, 0, L.stoveH, '#8d939a', false);
      seam(g, u, v, L.stove, L.stoveH * 0.3);
      seam(g, u, v, L.stove, L.stoveH * 0.65);
      cap(g, u, v, L.stove, L.stoveH, '#9aa0a7', 0.9);
    } });
  }
  if (L.chim) {
    for (const [su, sv] of EDGES) {
      const u = su * 52;
      const v = sv * 52;
      items.push({ d: u + v, f: () => {
        cyl(g, u, v, L.chim, 0, L.chimH, '#f1efe9', false);
        for (const f of [0.15, 0.45, 0.75]) band(g, u, v, L.chim, L.chimH * f, L.chimH * f + L.chimH * 0.13, '#c8372d');
        cyl(g, u, v, L.chim + 0.6, L.chimH - 2, L.chimH, '#3a3a3a');
      } });
    }
  }
  items.push({ d: 0, f: () => {
    const H = L.hallH;
    const s = L.hall;
    box(g, -s, s, -s, s, 0, H, STEEL, shade(STEEL, 0.15));
    if (g.z >= DETAIL) {
      // glühende Fensterbänder der Gießhalle
      const { P } = g;
      poly(g, [P(-s + 4, s + 0.2, H * 0.35), P(s - 4, s + 0.2, H * 0.35), P(s - 4, s + 0.2, H * 0.6), P(-s + 4, s + 0.2, H * 0.6)], lit(GLOW, ...FACE.s), null);
      poly(g, [P(s + 0.2, -s + 4, H * 0.35), P(s + 0.2, s - 4, H * 0.35), P(s + 0.2, s - 4, H * 0.6), P(s + 0.2, -s + 4, H * 0.6)], lit(GLOW, ...FACE.e), null);
    }
    const F = L.furn;
    const fh = L.furnH;
    frustum(g, 0, 0, F, F * 0.82, H, H + fh * 0.62, RUST, false);
    band(g, 0, 0, F * 0.86, H + fh * 0.3, H + fh * 0.34, '#3b2d27');
    cyl(g, 0, 0, F + 3, H + fh * 0.62, H + fh * 0.66, '#4a4f55'); // Gichtbühne
    frustum(g, 0, 0, F * 0.8, F * 0.45, H + fh * 0.66, H + fh, RUST, true);
    // Glut oben
    const { P, ctx, z } = g;
    const [cx, cy] = P(0, 0, H + fh);
    const R = F * 0.45 * z;
    const glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 2.4);
    glow.addColorStop(0, 'rgba(255,230,140,0.95)');
    glow.addColorStop(0.35, 'rgba(255,150,60,0.6)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 2.4, R * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    flag(g, F * 0.3, F * 0.3, H + fh, color, 10);
  } });
  shadowBox(g, -L.hall, L.hall, -L.hall, L.hall, L.hallH + L.furnH * 0.6);
  for (const [su, sv] of CORNERS) shadowCyl(g, su * L.at, sv * L.at, L.stove, L.stoveH);
  paint(items);
}

function steelTop(ctx, x, y, L, color) {
  const s = L.hall;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x - s + 6, y - s + 6, s * 2, s * 2);
  for (const [su, sv] of CORNERS) circle(ctx, x + su * L.at + 4, y + sv * L.at + 4, L.stove, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = shade(STEEL, 0.1);
  ctx.fillRect(x - s, y - s, s * 2, s * 2);
  ctx.fillStyle = tint(STEEL, 0.12);
  ctx.fillRect(x - s, y - s, s * 2, s * 0.5);
  ctx.fillStyle = GLOW; // Oberlichter mit Glut
  for (const [su, sv] of EDGES) ctx.fillRect(x + su * (s - 6) - (sv ? s * 0.5 : 2), y + sv * (s - 6) - (su ? s * 0.5 : 2), sv ? s : 4, su ? s : 4);
  for (const [su, sv] of CORNERS) {
    ball(ctx, x + su * L.at, y + sv * L.at, L.stove, '#9aa0a7');
  }
  if (L.chim) {
    for (const [su, sv] of EDGES) {
      ball(ctx, x + su * 52, y + sv * 52, L.chim + 1, '#f1efe9');
      ctx.strokeStyle = '#c8372d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + su * 52, y + sv * 52, L.chim - 0.5, 0, Math.PI * 2);
      ctx.stroke();
      circle(ctx, x + su * 52, y + sv * 52, L.chim * 0.5, '#2e2e2e');
    }
  }
  ball(ctx, x, y, L.furn + 3, '#4a4f55');
  ball(ctx, x, y, L.furn, RUST);
  const glow = ctx.createRadialGradient(x, y, 1, x, y, L.furn * 0.7);
  glow.addColorStop(0, '#fff2a8');
  glow.addColorStop(0.5, GLOW);
  glow.addColorStop(1, 'rgba(230,90,30,0.9)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, L.furn * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(x + L.furn * 0.3, y - L.furn * 0.3 - 5, 8, 5);
}

// ---------- Munitionswerk: Betonbunker mit Warnstreifen, darauf eine Riesenpatrone, Kistenstapel, Granatenpaletten, Erdbunker ----------

/** Patrone: Messinghülse und kupferne Spitze, Mitte (u, v), steht auf Höhe h. */
function cartridge(g, u, v, r, h, len) {
  cyl(g, u, v, r * 1.08, h, h + len * 0.08, shade(BRASS, 0.15), false); // Rand
  cyl(g, u, v, r, h + len * 0.08, h + len * 0.62, BRASS, false);
  cyl(g, u, v, r * 0.98, h + len * 0.62, h + len * 0.68, shade(COPPER, 0.1), false);
  cap(g, u, v, r * 0.98, h + len * 0.68, COPPER, 1.9);
}

function munIso(g, L, color) {
  const items = [];
  for (const [su, sv] of CORNERS) {
    const u = su * L.at;
    const v = sv * L.at;
    items.push({ d: u + v, f: () => {
      if (L.mounds) {
        // Erdbunker: begrünter Hügel mit Betonkante
        box(g, u - 13, u + 13, v - 13, v + 13, 0, 3, CONCRETE);
        pyramid(g, u, v, 13, 3, 13, '#6c8a46');
        return;
      }
      const c = L.crate;
      box(g, u - c, u + c, v - c, v + c, 0, L.crateH * 0.55, OLIVE, tint(OLIVE, 0.1));
      box(g, u - c * 0.7, u + c * 0.7, v - c * 0.7, v + c * 0.7, L.crateH * 0.55, L.crateH, shade(OLIVE, 0.05), tint(OLIVE, 0.15));
      if (g.z >= DETAIL) {
        const { P } = g;
        poly(g, [P(u - c * 0.5, v + c + 0.2, L.crateH * 0.22), P(u + c * 0.5, v + c + 0.2, L.crateH * 0.22), P(u + c * 0.5, v + c + 0.2, L.crateH * 0.32), P(u - c * 0.5, v + c + 0.2, L.crateH * 0.32)], '#e0c040', null);
        poly(g, [P(u + c + 0.2, v - c * 0.5, L.crateH * 0.22), P(u + c + 0.2, v + c * 0.5, L.crateH * 0.22), P(u + c + 0.2, v + c * 0.5, L.crateH * 0.32), P(u + c + 0.2, v - c * 0.5, L.crateH * 0.32)], shade('#e0c040', 0.2), null);
      }
    } });
  }
  if (L.pallets) {
    for (const [su, sv] of EDGES) {
      const u = su * 48;
      const v = sv * 48;
      items.push({ d: u + v, f: () => {
        box(g, u - 8, u + 8, v - 8, v + 8, 0, 3, WOOD);
        const spots = [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]];
        for (const [a, b] of spots) cartridge(g, u + a, v + b, 2.6, 3, 12);
      } });
    }
  }
  items.push({ d: 0, f: () => {
    const s = L.bunk;
    const H = L.bunkH;
    box(g, -s, s, -s, s, 0, H, CONCRETE, shade(CONCRETE, 0.08));
    const { P } = g;
    // Band in Teamfarbe an beiden sichtbaren Wänden
    poly(g, [P(-s, s + 0.2, H * 0.55), P(s, s + 0.2, H * 0.55), P(s, s + 0.2, H * 0.72), P(-s, s + 0.2, H * 0.72)], lit(color, ...FACE.s), null);
    poly(g, [P(s + 0.2, -s, H * 0.55), P(s + 0.2, s, H * 0.55), P(s + 0.2, s, H * 0.72), P(s + 0.2, -s, H * 0.72)], lit(color, ...FACE.e), null);
    if (g.z >= DETAIL) {
      // Tore (dunkel) und gelb-schwarze Warnstreifen am Dachrand
      poly(g, [P(-6, s + 0.3, 0), P(6, s + 0.3, 0), P(6, s + 0.3, H * 0.48), P(-6, s + 0.3, H * 0.48)], '#3b3d36', null);
      poly(g, [P(s + 0.3, -6, 0), P(s + 0.3, 6, 0), P(s + 0.3, 6, H * 0.48), P(s + 0.3, -6, H * 0.48)], '#2f312b', null);
      const w = 3.5;
      for (const [a0, a1, b0, b1] of [[-s, s, -s, -s + w], [-s, s, s - w, s], [-s, -s + w, -s + w, s - w], [s - w, s, -s + w, s - w]]) {
        poly(g, [P(a0, b0, H), P(a1, b0, H), P(a1, b1, H), P(a0, b1, H)], '#e3c02e', null);
      }
      for (let t = -s + 2; t < s - 2; t += 7) {
        for (const [ua, va, ub, vb] of [[t, -s, t + 3, -s + w], [t, s - w, t + 3, s], [-s, t, -s + w, t + 3], [s - w, t, s, t + 3]]) poly(g, [P(ua, va, H), P(ub, va, H), P(ub, vb, H), P(ua, vb, H)], '#2a2a26', null);
      }
    }
    cartridge(g, 0, 0, L.shell, H, L.shellH * 1.6);
  } });
  shadowBox(g, -L.bunk, L.bunk, -L.bunk, L.bunk, L.bunkH + L.shellH);
  paint(items);
}

function munTop(ctx, x, y, L, color) {
  const s = L.bunk;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x - s + 5, y - s + 5, s * 2, s * 2);
  ctx.fillStyle = CONCRETE;
  ctx.fillRect(x - s, y - s, s * 2, s * 2);
  ctx.fillStyle = '#e3c02e';
  ctx.fillRect(x - s, y - s, s * 2, 3.5);
  ctx.fillRect(x - s, y + s - 3.5, s * 2, 3.5);
  ctx.fillRect(x - s, y - s, 3.5, s * 2);
  ctx.fillRect(x + s - 3.5, y - s, 3.5, s * 2);
  ctx.fillStyle = '#2a2a26';
  for (let t = -s + 2; t < s - 2; t += 7) {
    ctx.fillRect(x + t, y - s, 3, 3.5);
    ctx.fillRect(x + t, y + s - 3.5, 3, 3.5);
    ctx.fillRect(x - s, y + t, 3.5, 3);
    ctx.fillRect(x + s - 3.5, y + t, 3.5, 3);
  }
  ctx.fillStyle = color;
  ctx.fillRect(x - s + 6, y - s + 6, 8, 5);
  // Patrone von oben: Hülsenrand, Spitze
  circle(ctx, x + 4, y + 4, L.shell + 1, 'rgba(0,0,0,0.3)');
  ball(ctx, x, y, L.shell * 1.08, BRASS);
  ball(ctx, x, y, L.shell * 0.85, COPPER);
  circle(ctx, x - L.shell * 0.25, y - L.shell * 0.25, L.shell * 0.22, tint(COPPER, 0.45));
  for (const [su, sv] of CORNERS) {
    const u = x + su * L.at;
    const v = y + sv * L.at;
    if (L.mounds) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(u - 13 + 4, v - 13 + 4, 26, 26);
      tri4(ctx, u, v, 13, '#6c8a46');
      continue;
    }
    const c = L.crate;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(u - c + 4, v - c + 4, c * 2, c * 2);
    ctx.fillStyle = OLIVE;
    ctx.fillRect(u - c, v - c, c * 2, c * 2);
    ctx.fillStyle = tint(OLIVE, 0.15);
    ctx.fillRect(u - c * 0.7, v - c * 0.7, c * 1.4, c * 1.4);
    ctx.fillStyle = '#e0c040';
    ctx.fillRect(u - c * 0.5, v - 1, c, 2);
  }
  if (L.pallets) {
    for (const [su, sv] of EDGES) {
      const u = x + su * 48;
      const v = y + sv * 48;
      ctx.fillStyle = WOOD;
      ctx.fillRect(u - 8, v - 8, 16, 16);
      for (const [a, b] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
        ball(ctx, u + a, v + b, 2.8, BRASS);
        circle(ctx, u + a, v + b, 1.6, COPPER);
      }
    }
  }
}

// ---------- BM-Werk: Ziegelei mit hohem Backsteinschornstein, Holzstapel in den Ecken, ab Stufe 2 Ziegelpaletten ----------

function bmIso(g, L, color) {
  const items = [];
  for (const [su, sv] of CORNERS) {
    const u = su * L.at;
    const v = sv * L.at;
    items.push({ d: u + v, f: () => {
      const c = L.logs;
      box(g, u - c, u + c, v - c, v + c, 0, L.logsH, WOOD, tint(WOOD, 0.15));
      if (g.z < DETAIL) return;
      // Stammenden an den sichtbaren Seiten
      const { P, ctx, z } = g;
      ctx.fillStyle = '#e3c595';
      ctx.strokeStyle = 'rgba(90,60,30,0.55)';
      ctx.lineWidth = Math.max(0.5, 0.7 * z);
      const rows = Math.max(2, Math.round(L.logsH / 4.5));
      for (let k = 0; k < rows; k++) {
        const h = (L.logsH * (k + 0.5)) / rows;
        for (let t = -c + 2.5; t < c - 1; t += 4.5) {
          for (const [pu, pv] of [[u + t, v + c + 0.3], [u + c + 0.3, v + t]]) {
            const [px, py] = P(pu, pv, h);
            ctx.beginPath();
            ctx.arc(px, py, 1.9 * z, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
    } });
  }
  if (L.bricks) {
    for (const [su, sv] of EDGES) {
      const u = su * 49;
      const v = sv * 49;
      items.push({ d: u + v, f: () => {
        box(g, u - 8, u + 8, v - 8, v + 8, 0, 2.5, WOOD);
        box(g, u - 7, u + 7, v - 7, v + 7, 2.5, 11, '#c4603f', '#cf7050');
        if (g.z < DETAIL) return;
        const { P, ctx, z } = g;
        ctx.strokeStyle = 'rgba(240,220,200,0.55)';
        ctx.lineWidth = Math.max(0.5, 0.7 * z);
        ctx.beginPath();
        for (const h of [5, 8]) {
          for (const [a, b] of [[P(u - 7, v + 7, h), P(u + 7, v + 7, h)], [P(u + 7, v - 7, h), P(u + 7, v + 7, h)]]) {
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
          }
        }
        ctx.stroke();
      } });
    }
  }
  items.push({ d: 0, f: () => {
    const s = L.hall;
    const H = L.hallH;
    box(g, -s, s, -s, s, 0, H, BRICK, '#7d7064');
    if (g.z >= DETAIL) {
      // Ofenöffnungen (Rundbögen, dunkel) an den sichtbaren Wänden
      const { P } = g;
      for (let t = -s + 6; t <= s - 6; t += 8) {
        poly(g, [P(t - 2.2, s + 0.2, 0), P(t + 2.2, s + 0.2, 0), P(t + 2.2, s + 0.2, H * 0.45), P(t, s + 0.2, H * 0.58), P(t - 2.2, s + 0.2, H * 0.45)], '#3a2620', null);
        poly(g, [P(s + 0.2, t - 2.2, 0), P(s + 0.2, t + 2.2, 0), P(s + 0.2, t + 2.2, H * 0.45), P(s + 0.2, t, H * 0.58), P(s + 0.2, t - 2.2, H * 0.45)], '#2e1e19', null);
      }
    }
    if (L.roof) pyramid(g, 0, 0, s + 2, H, 12, '#6b4a3c');
    // Backsteinschornstein mit Band in Teamfarbe
    const c = L.chim;
    box(g, -c, c, -c, c, L.roof ? H + 6 : H, L.chimH, BRICK, '#3a2a24');
    box(g, -c - 1, c + 1, -c - 1, c + 1, L.chimH - 7, L.chimH - 4, color, color);
    box(g, -c - 0.8, c + 0.8, -c - 0.8, c + 0.8, L.chimH - 2, L.chimH, shade(BRICK, 0.2), '#2a201c');
  } });
  for (const [su, sv] of CORNERS) shadowBox(g, su * L.at - L.logs, su * L.at + L.logs, sv * L.at - L.logs, sv * L.at + L.logs, L.logsH);
  shadowBox(g, -L.hall, L.hall, -L.hall, L.hall, L.hallH + 10);
  paint(items);
}

function bmTop(ctx, x, y, L, color) {
  const s = L.hall;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x - s + 5, y - s + 5, s * 2, s * 2);
  if (L.roof) tri4(ctx, x, y, s + 2, '#6b4a3c');
  else {
    ctx.fillStyle = BRICK;
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
    ctx.fillStyle = '#7d7064';
    ctx.fillRect(x - s + 3, y - s + 3, s * 2 - 6, s * 2 - 6);
  }
  const c = L.chim;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x - c + 8, y - c + 8, c * 2, c * 2);
  ctx.fillStyle = color;
  ctx.fillRect(x - c - 1.5, y - c - 1.5, c * 2 + 3, c * 2 + 3);
  ctx.fillStyle = BRICK;
  ctx.fillRect(x - c, y - c, c * 2, c * 2);
  ctx.fillStyle = '#2a201c';
  ctx.fillRect(x - c * 0.55, y - c * 0.55, c * 1.1, c * 1.1);
  for (const [su, sv] of CORNERS) {
    const u = x + su * L.at;
    const v = y + sv * L.at;
    const l = L.logs;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(u - l + 4, v - l + 4, l * 2, l * 2);
    ctx.fillStyle = tint(WOOD, 0.15);
    ctx.fillRect(u - l, v - l, l * 2, l * 2);
    ctx.strokeStyle = 'rgba(110,75,40,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = -l + 4; t < l; t += 4) {
      ctx.moveTo(u - l, v + t);
      ctx.lineTo(u + l, v + t);
    }
    ctx.stroke();
  }
  if (L.bricks) {
    for (const [su, sv] of EDGES) {
      const u = x + su * 49;
      const v = y + sv * 49;
      ctx.fillStyle = WOOD;
      ctx.fillRect(u - 8, v - 8, 16, 16);
      ctx.fillStyle = '#cf7050';
      ctx.fillRect(u - 7, v - 7, 14, 14);
      ctx.strokeStyle = 'rgba(240,220,200,0.6)';
      ctx.beginPath();
      ctx.moveTo(u - 7, v);
      ctx.lineTo(u + 7, v);
      ctx.moveTo(u, v - 7);
      ctx.lineTo(u, v + 7);
      ctx.stroke();
    }
  }
}

// ---------- 2D-Hilfen ----------

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
function ring(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, r - 2, 0, Math.PI * 2);
  ctx.stroke();
}
/** Walmdach oder Hügel von oben: vier Dreiecke, Licht von links oben. */
function tri4(ctx, x, y, s, color) {
  const C = snowy(color);
  const t = (pts, f) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = f;
    ctx.fill();
  };
  t([[x - s, y - s], [x + s, y - s], [x, y]], tint(C, 0.22));
  t([[x - s, y - s], [x - s, y + s], [x, y]], tint(C, 0.08));
  t([[x - s, y + s], [x + s, y + s], [x, y]], shade(C, 0.15));
  t([[x + s, y - s], [x + s, y + s], [x, y]], shade(C, 0.3));
}

// ---------- Hütte: Hochofenschacht mit Glut, Gießhalle, Schornstein ----------

function smelterIso(g, L, color) {
  const items = [];
  const H = L.hallH;
  const s = L.hall;
  const T = L.tower;
  const HT = L.towerH;
  if (L.chim) {
    items.push({ d: -2 * L.at, f: () => {
      const u = -L.at;
      const v = -L.at;
      cyl(g, u, v, L.chim, 0, L.chimH, '#f1efe9', false);
      for (const f of [0.2, 0.5, 0.8]) band(g, u, v, L.chim, L.chimH * f, L.chimH * f + L.chimH * 0.1, '#c8372d');
      cyl(g, u, v, L.chim + 0.6, L.chimH - 2, L.chimH, '#3a3a3a');
    } });
  }
  items.push({ d: 0, f: () => {
    box(g, -s, s, -s, s, 0, H, SLAG, shade(SLAG, 0.15));
    if (g.z >= DETAIL) {
      // glühende Fensterbänder der Gießhalle
      const { P } = g;
      poly(g, [P(-s + 4, s + 0.2, H * 0.3), P(s - 4, s + 0.2, H * 0.3), P(s - 4, s + 0.2, H * 0.6), P(-s + 4, s + 0.2, H * 0.6)], lit(GLOW, ...FACE.s), null);
    }
    frustum(g, 0, 0, T, T * 0.78, H, H + HT, '#7d5a48', false); // Hochofenschacht
    for (const f of [0.3, 0.6]) band(g, 0, 0, T * 0.92, H + HT * f, H + HT * f + 2.5, '#3b2d27');
    cyl(g, 0, 0, T + 2.5, H + HT * 0.7, H + HT * 0.74, '#4a4f55'); // Gichtbühne
    frustum(g, 0, 0, T * 0.78, T * 0.5, H + HT * 0.74, H + HT, '#5b4337', true); // Gichtkopf
    // Glut oben
    const { P, ctx, z } = g;
    const [cx, cy] = P(0, 0, H + HT);
    const R = T * 0.5 * z;
    const glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 2.4);
    glow.addColorStop(0, 'rgba(255,230,140,0.95)');
    glow.addColorStop(0.35, 'rgba(255,150,60,0.6)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 2.4, R * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    flag(g, T * 0.3, T * 0.3, H + HT, color, 10);
  } });
  shadowBox(g, -s, s, -s, s, H + HT * 0.3);
  if (L.chim) shadowCyl(g, -L.at, -L.at, L.chim, L.chimH);
  paint(items);
}

function smelterTop(ctx, x, y, L, color) {
  const s = L.hall;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x - s + 6, y - s + 6, s * 2, s * 2);
  ctx.fillStyle = shade(SLAG, 0.1);
  ctx.fillRect(x - s, y - s, s * 2, s * 2);
  ctx.fillStyle = tint(SLAG, 0.12);
  ctx.fillRect(x - s, y - s, s * 2, s * 0.5);
  ctx.fillStyle = GLOW; // Oberlichter mit Glut
  for (const [su, sv] of EDGES) ctx.fillRect(x + su * (s - 6) - (sv ? s * 0.5 : 2), y + sv * (s - 6) - (su ? s * 0.5 : 2), sv ? s : 4, su ? s : 4);
  if (L.chim) {
    circle(ctx, x - L.at + 4, y - L.at + 4, L.chim, 'rgba(0,0,0,0.28)');
    ball(ctx, x - L.at, y - L.at, L.chim + 1, '#f1efe9');
    ctx.strokeStyle = '#c8372d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x - L.at, y - L.at, L.chim - 0.5, 0, Math.PI * 2);
    ctx.stroke();
    circle(ctx, x - L.at, y - L.at, L.chim * 0.5, '#2e2e2e');
  }
  circle(ctx, x + 4, y + 4, L.tower + 2, 'rgba(0,0,0,0.28)');
  ball(ctx, x, y, L.tower + 2, '#4a4f55'); // Gichtbühne
  ball(ctx, x, y, L.tower, '#7d5a48');
  const glow = ctx.createRadialGradient(x, y, 1, x, y, L.tower * 0.7);
  glow.addColorStop(0, '#fff2a8');
  glow.addColorStop(0.5, GLOW);
  glow.addColorStop(1, 'rgba(230,90,30,0.9)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, L.tower * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color; // Teamfarbe am Rand der Halle
  ctx.fillRect(x + s - 8, y - s, 8, 5);
}

// ---------- Kerosin-Raffinerie: Kugeltanks mit blauen Ringen, Pumpenhaus, Fackel ----------

function keroIso(g, L, color) {
  const items = [];
  for (const [su, sv] of KERO_TANKS[L.n]) {
    const u = su * L.at;
    const v = sv * L.at;
    items.push({ d: u + v, f: () => {
      cyl(g, u, v, L.tank, 0, L.tankH, TANK, false);
      band(g, u, v, L.tank * 1.02, L.tankH * 0.3, L.tankH * 0.3 + 2.5, BLUE); // blaue Tankringe
      band(g, u, v, L.tank * 1.02, L.tankH * 0.62, L.tankH * 0.62 + 2.5, BLUE);
      cap(g, u, v, L.tank, L.tankH, '#d9dde1', 0.6); // gewölbte Kuppe
      seam(g, u, v, L.tank, L.tankH * 0.5);
    } });
  }
  items.push({ d: 0, f: () => {
    cyl(g, 0, 0, L.pump + 3, 0, 2, CONCRETE); // Auffangwanne
    box(g, -L.pump, L.pump, -L.pump, L.pump, 2, 2 + L.pumpH, '#c9ced4', shade('#c9ced4', 0.15));
    box(g, -L.pump, L.pump, -L.pump, -L.pump + 3, 2 + L.pumpH - 2, 2 + L.pumpH, color); // Teamfarbe am Dachrand
  } });
  if (L.stack) {
    items.push({ d: -L.pump - 6, f: () => {
      const v = -L.pump - 6;
      cyl(g, 0, v, L.stack, 0, L.stackH, '#cfd4d9', false);
      for (const f of [0.35, 0.7]) cyl(g, 0, v, L.stack + 1, L.stackH * f, L.stackH * f + 1.5, '#7d858d');
      flame(g, 0, v, L.stackH, 0.8);
    } });
  }
  for (const [su, sv] of KERO_TANKS[L.n]) shadowCyl(g, su * L.at, sv * L.at, L.tank, L.tankH);
  shadowBox(g, -L.pump, L.pump, -L.pump, L.pump, 2 + L.pumpH);
  paint(items);
}

function keroTop(ctx, x, y, L, color) {
  const tanks = KERO_TANKS[L.n];
  for (const [su, sv] of tanks) circle(ctx, x + su * L.at + 4, y + sv * L.at + 4, L.tank + 1, 'rgba(0,0,0,0.25)');
  ring(ctx, x, y, L.at + L.tank + 5, CONCRETE); // Auffangring
  for (const [su, sv] of tanks) {
    const u = x + su * L.at;
    const v = y + sv * L.at;
    ball(ctx, u, v, L.tank, TANK);
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(u, v, L.tank - 2, 0, Math.PI * 2);
    ctx.stroke();
    circle(ctx, u, v, 2.5, '#9aa1a8');
  }
  circle(ctx, x + 3, y + 3, L.pump + 1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = '#c9ced4'; // Pumpenhaus
  ctx.fillRect(x - L.pump, y - L.pump, L.pump * 2, L.pump * 2);
  ctx.fillStyle = color;
  ctx.fillRect(x - L.pump, y - L.pump, L.pump * 2, 3);
  if (L.stack) {
    const v = y - L.pump - 6;
    ball(ctx, x, v, L.stack + 0.5, '#cfd4d9');
    ball(ctx, x, v, 2, GLOW);
  }
}

// ---------- Einstieg ----------

const ISO = { fuel: [fuelIso, FUEL], steel: [steelIso, STEELW], mun: [munIso, MUN], bm: [bmIso, BM], smelter: [smelterIso, SMELT], kero: [keroIso, KERO] };
const TOP = { fuel: [fuelTop, FUEL], steel: [steelTop, STEELW], mun: [munTop, MUN], bm: [bmTop, BM], smelter: [smelterTop, SMELT], kero: [keroTop, KERO] };

/** Isometrisch: ganze Anlage in einem Zug, gleiches Bild für jede Drehung der Karte (vierfach symmetrisch). */
export function drawWorksIso(ctx, cam, b) {
  const [fn, LV] = ISO[b.kind] ?? ISO.bm;
  const g = iso(ctx, cam, b);
  ctx.save();
  ctx.lineJoin = 'round';
  fn(g, LV[Math.max(1, Math.min(3, b.level | 0))], b.color);
  ctx.restore();
}

/** 2D von oben (Weltkoordinaten, Kontext skaliert). Der Boden liegt schon darunter (citylayer.js). */
export function drawWorksTop(ctx, b) {
  const [fn, LV] = TOP[b.kind] ?? TOP.bm;
  ctx.save();
  fn(ctx, b.x, b.y, LV[Math.max(1, Math.min(3, b.level | 0))], b.color);
  if ((b.damage ?? 0) > 0) {
    ctx.fillStyle = `rgba(20,10,5,${(0.5 * b.damage).toFixed(2)})`; // beschädigt: dunkler
    ctx.fillRect(b.x - 58, b.y - 58, 116, 116);
  }
  ctx.restore();
}
