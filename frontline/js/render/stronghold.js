// Besetzte Häuser gemalt (seit v5.48, Daniels Wunsch „schaue welche Assets noch nicht verbessert wurden und verbessere diese genau wie
// die anderen“): Bis v5.47 sah ein besetztes Haus aus wie jedes andere, nur das Schild darüber verriet Besatzung und Ausbau. Jetzt weht
// am besetzten Haus eine Fahne in Teamfarbe (Mast an der linken Ecke, das Tuch flattert), und die Ausbauten des Häuserkampfs (PRD §7)
// stehen sichtbar am Haus: Sandsäcke in zwei Lagen vor den Wänden (Lücke als Durchgang), ein MG-Nest an der vorderen Ecke (Ring aus
// Sandsäcken, MG auf Dreibein mit Munitionskiste) und Stacheldraht in Rollen auf Pfählen mit Abstand ums Haus (Durchgang vorn). Ausbauten
// bleiben, wenn die Besatzung geht, und verschwinden mit dem Einsturz. Iso je Drehung zwei Bilder (hinter und vor dem Haus) über
// spritecache.js, 2D ein Bild von oben; die Fahne wird jedes Bild neu gezeichnet. Nur Bild.
import { sprite, blit, spriteDpr } from './spritecache.js';
import { G, box, poly, OUTLINE, stroke, snowy, roofSnowOn, shade, tint, rectF, rectS, lineT, circle } from './isokit.js';
import { ISO_K } from './camera.js';

const BAG = '#b9a477'; // Sandsack (Jute)
const BAG_TOP = '#ccb88b';
const WIRE = '#9a9ea4'; // verzinkter Draht, hell gegen Gras und Erde
const WIRE_DARK = 'rgba(30,32,34,0.55)';
const POST = '#6b5338';
const MG = '#2b2e30';
const BOX = '#58613f'; // Munitionskiste
const OFF = 14; // Abstand des Drahts von der Wand
const BAG_L = 6.2; // Länge eines Sacks
const BAG_D = 3.4; // Tiefe eines Sacks (quer zur Wand)
const BAG_H = 2.25; // Höhe einer Lage
const GAP = 4.6; // halber Durchgang in der Mitte jeder Wand

/** Ausbauten eines Hauses als Bitmaske: 1 Sandsäcke, 2 MG-Nest, 4 Stacheldraht. */
export function worksMask(h) {
  const w = h?.works ?? {};
  return (w.sandbags ? 1 : 0) | (w.mgnest ? 2 : 0) | (w.wire ? 4 : 0);
}

const q8 = (x) => Math.max(40, Math.round(x / 8) * 8);

// ---------- Bauteile (isometrisch) ----------

/** Säcke einer Wand: Reihe entlang der Achse (axis 'u': Wand bei u = at, Säcke entlang v), zwei Lagen versetzt, Durchgang in der Mitte. */
function wallBags(axis, at, a0, a1, gapMid = true) {
  const out = [[], []];
  for (let layer = 0; layer < 2; layer++) {
    const off = layer ? BAG_L / 2 : 0;
    for (let a = a0 - off; a < a1 - 0.6; a += BAG_L) {
      const s0 = Math.max(a0, a + 0.12);
      const s1 = Math.min(a1, a + BAG_L - 0.12);
      if (s1 - s0 < 1.4) continue;
      if (gapMid && Math.abs((s0 + s1) / 2) < GAP) continue;
      const d0 = at - BAG_D / 2 + (layer ? 0.3 : 0);
      const d1 = at + BAG_D / 2 - (layer ? 0.3 : 0);
      out[layer].push(axis === 'u' ? [d0, d1, s0, s1] : [s0, s1, d0, d1]);
    }
  }
  return out;
}

/** Ein Sack: Quader mit abgesetzter Oberseite und Naht (fein). */
function bag(g, [u0, u1, v0, v1], h0) {
  box(g, u0, u1, v0, v1, h0, h0 + BAG_H, BAG, snowy(BAG_TOP), 'rgba(70,56,34,0.75)');
  if (g.fine) {
    const { P } = g;
    const um = (u0 + u1) / 2;
    const vm = (v0 + v1) / 2;
    // Naht quer über die Oberseite (Abbindung)
    if (u1 - u0 > v1 - v0) stroke(g, [P(um, v0, h0 + BAG_H), P(um, v1, h0 + BAG_H)], 'rgba(90,72,44,0.45)', 0.25);
    else stroke(g, [P(u0, vm, h0 + BAG_H), P(u1, vm, h0 + BAG_H)], 'rgba(90,72,44,0.45)', 0.25);
  }
}

/** Stacheldraht von (u0, v0) nach (u1, v1): Pfähle, Rolle als Schraube um die Linie; gap = halber Durchgang in der Mitte (0 = keiner). */
function wireRun(g, u0, v0, u1, v1, gap = 0) {
  const { P } = g;
  const len = Math.hypot(u1 - u0, v1 - v0);
  const du = (u1 - u0) / len;
  const dv = (v1 - v0) / len;
  const open = (t) => gap > 0 && Math.abs(t - len / 2) < gap;
  const posts = Math.max(2, Math.round(len / 12));
  for (let k = 0; k <= posts; k++) {
    const t = (k / posts) * len;
    if (open(t)) continue;
    stroke(g, [P(u0 + du * t, v0 + dv * t, 0), P(u0 + du * t, v0 + dv * t, 5.4)], POST, 0.6);
  }
  // Schatten der Rolle am Boden (versetzt nach rechts unten), mit Lücke wie der Draht
  const half = gap > 0 ? [[0, len / 2 - gap], [len / 2 + gap, len]] : [[0, len]];
  for (const [a, b] of half) {
    const sh = (t) => P(u0 + du * t + 1.2, v0 + dv * t + 1.2, 0);
    stroke(g, [sh(a), sh(b)], 'rgba(0,0,0,0.16)', 3.2);
  }
  const step = g.fine ? 0.5 : 0.9;
  let pts = [];
  const flush = () => {
    if (pts.length > 1) {
      stroke(g, pts, WIRE_DARK, 0.62);
      stroke(g, pts, WIRE, 0.34);
    }
    pts = [];
  };
  for (let t = 0; t <= len + 1e-6; t += step) {
    if (open(t)) {
      flush();
      continue;
    }
    const th = (t / 3.2) * Math.PI * 2; // eine Windung je 3,2
    const side = Math.cos(th) * 2;
    pts.push(P(u0 + du * t - dv * side, v0 + dv * t + du * side, 2.5 + Math.sin(th) * 2.2));
  }
  flush();
}

/** MG-Nest bei (u, v): Ring aus Säcken mit Zugang zum Haus (−u, −v), MG auf Dreibein nach +u, Munitionskiste. */
function mgNest(g, u, v) {
  const { P } = g;
  const ring = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.31;
    if (Math.cos(a - Math.PI * 1.25) > 0.82) continue; // Zugang zum Haus
    ring.push([u + Math.cos(a) * 4.8, v + Math.sin(a) * 4.8]);
  }
  ring.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const back = ring.filter(([a, b]) => a + b <= u + v);
  const front = ring.filter(([a, b]) => a + b > u + v);
  const sack = ([a, b]) => box(g, a - 1.4, a + 1.4, b - 1.4, b + 1.4, 0, 2.6, BAG, snowy(BAG_TOP), 'rgba(70,56,34,0.75)');
  back.forEach(sack);
  // Boden im Nest, Kiste, Dreibein, MG
  poly(g, [P(u - 3.2, v - 3.2, 0.05), P(u + 3.2, v - 3.2, 0.05), P(u + 3.2, v + 3.2, 0.05), P(u - 3.2, v + 3.2, 0.05)], 'rgba(60,48,30,0.35)', null);
  box(g, u - 2.6, u - 0.8, v + 0.6, v + 1.8, 0, 1.3, BOX, tint(BOX, 0.12));
  for (const [a, b] of [[-1.3, -1], [-1.3, 1], [1.4, 0]]) stroke(g, [P(u, v, 3.1), P(u + a, v + b, 0)], MG, 0.32);
  box(g, u - 0.9, u + 1.2, v - 0.4, v + 0.4, 3, 3.9, MG, tint(MG, 0.15), null);
  stroke(g, [P(u + 1.2, v, 3.45), P(u + 6.4, v, 3.6)], MG, 0.42); // Lauf
  stroke(g, [P(u + 5.2, v, 3.58), P(u + 5.4, v - 0.6, 2.9), P(u + 5.6, v + 0.6, 2.9)], MG, 0.22); // Zweibein vorn
  if (g.fine) stroke(g, [P(u - 0.3, v + 0.4, 3.3), P(u - 1.6, v + 1.2, 1.3)], '#b8952f', 0.3); // Gurt
  front.forEach(sack);
}

/** Bild hinter dem Haus (part 'back': Draht der hinteren Seiten) oder davor ('front': Säcke, MG-Nest, vorderer Draht). */
function paintIso(c, s, W, D, mask, part) {
  const g = G(c, s);
  const U = W / 2;
  const V = D / 2;
  if (part === 'back') {
    if (mask & 4) {
      wireRun(g, -U - OFF, -V - OFF, U + OFF, -V - OFF);
      wireRun(g, -U - OFF, -V - OFF, -U - OFF, V + OFF);
    }
    return;
  }
  if (mask & 1) {
    // vordere Wände (+u rechts, +v links), Ecke geschlossen; erst die untere Lage, dann die obere, je von hinten nach vorn
    const a = wallBags('u', U + BAG_D / 2 + 0.1, -V, V);
    const b = wallBags('v', V + BAG_D / 2 + 0.1, -U, U + BAG_D + 0.1);
    for (let layer = 0; layer < 2; layer++) {
      const all = [...a[layer], ...b[layer]].sort((p, q) => p[0] + p[1] + p[2] + p[3] - (q[0] + q[1] + q[2] + q[3]));
      for (const r of all) bag(g, r, layer * BAG_H);
    }
  }
  if (mask & 2) mgNest(g, U + 8, V + 8);
  if (mask & 4) {
    wireRun(g, U + OFF, -V - OFF, U + OFF, V + OFF);
    wireRun(g, -U - OFF, V + OFF, U + OFF, V + OFF, 6);
  }
}

/** Bildausmaße eines Teils in Einheiten um die Hausmitte (Iso). */
function boundsIso(W, D) {
  const u = W / 2 + OFF + 4;
  const v = D / 2 + OFF + 4;
  const K = ISO_K;
  return [(-u - v) * K - 4, (-u - v) * K * 0.5 - 10, (u + v) * K + 4, (u + v) * K * 0.5 + 4];
}

/**
 * Ausbauten eines Hauses isometrisch (Ankerpunkt = Hausmitte am Boden, Kamera mit Geländehöhe gesetzt): part 'back' vor dem Haus
 * zeichnen, 'front' danach. h: Haus aus garrison.js (pw, ph, works).
 */
export function drawHouseWorksIso(ctx, cam, h, part) {
  const mask = worksMask(h);
  if (!mask || (part === 'back' && !(mask & 4))) return false;
  const odd = cam.rot % 2 === 1;
  const W = q8(odd ? h.ph : h.pw);
  const D = q8(odd ? h.pw : h.ph);
  const snow = roofSnowOn() ? 1 : 0;
  const q = cam.worldToScreen(h.x, h.y);
  const z = cam.zoom;
  const dpr = spriteDpr();
  const e = sprite(`hw|${part}|${W}|${D}|${mask}|${snow}`, z * dpr, boundsIso(W, D), (c, s) => paintIso(c, s, W, D, mask, part));
  if (e === false) return false;
  if (e) {
    blit(ctx, e, q.x, q.y, z);
    return true;
  }
  ctx.save();
  ctx.translate(q.x, q.y);
  ctx.scale(1 / dpr, 1 / dpr);
  paintIso(ctx, z * dpr, W, D, mask, part);
  ctx.restore();
  return true;
}

/** Fahne (Bildschirm-Pixel, jedes Bild neu): Mast von (x, y) bis top nach oben, Tuch nach links, flattert mit der Zeit t (s). */
function flag(ctx, x, y, top, k, color, t, seed) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.6 * k;
  ctx.beginPath();
  ctx.moveTo(x + 0.8 * k, y);
  ctx.lineTo(x + 0.8 * k, y - top + 1);
  ctx.stroke();
  ctx.strokeStyle = '#d8d8d2';
  ctx.lineWidth = 1.1 * k;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - top - 1.5 * k);
  ctx.stroke();
  ctx.fillStyle = '#e8c547';
  ctx.beginPath();
  ctx.arc(x, y - top - 1.8 * k, 1.1 * k, 0, Math.PI * 2);
  ctx.fill();
  // Tuch in 5 Streifen, die Welle läuft vom Mast weg
  const L = 13 * k;
  const H = 8 * k;
  const n = 5;
  const wave = (i) => Math.sin(t * 5.2 + seed - i * 1.15) * 1.3 * k * (i / n);
  for (let i = 0; i < n; i++) {
    const xa = x - (L * i) / n;
    const xb = x - (L * (i + 1)) / n;
    const ya = y - top + wave(i);
    const yb = y - top + wave(i + 1);
    ctx.fillStyle = i % 2 ? shade(color, 0.12) : color;
    ctx.beginPath();
    ctx.moveTo(xa + 0.2, ya);
    ctx.lineTo(xb, yb);
    ctx.lineTo(xb, yb + H);
    ctx.lineTo(xa + 0.2, ya + H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x, y - top);
  for (let i = 1; i <= n; i++) ctx.lineTo(x - (L * i) / n, y - top + wave(i));
  ctx.lineTo(x - L, y - top + wave(n) + H);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(x - (L * i) / n, y - top + wave(i) + H);
  ctx.stroke();
  ctx.restore();
}

const POLE = { house: 40, hall: 50, factory: 58, station: 46 };

/** Fahne am besetzten Haus (Iso): Mast an der linken Ecke des Hauses (außen), jede Drehung. */
export function drawHouseFlagIso(ctx, cam, h, color, t) {
  const odd = cam.rot % 2 === 1;
  const U = (odd ? h.ph : h.pw) / 2;
  const V = (odd ? h.pw : h.ph) / 2;
  const q = cam.worldToScreen(h.x, h.y);
  const z = cam.zoom;
  const [px, py] = G(ctx, z).P(-U - 4, V + 4, 0);
  flag(ctx, q.x + px, q.y + py, (POLE[h.type] ?? 44) * z, z, color, t, -h.id * 0.7);
  return true;
}

// ---------- 2D von oben ----------

function paintTop(c, s, w, hh, mask) {
  c.scale(s, s);
  const U = w / 2;
  const V = hh / 2;
  if (mask & 4) {
    // Draht: Schlingen um das Haus, Pfähle, Durchgang unten in der Mitte
    const o = OFF;
    const loops = (x0, y0, x1, y1, gap = 0) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const dx = (x1 - x0) / len;
      const dy = (y1 - y0) / len;
      c.beginPath();
      for (let t = 0; t <= len; t += 2.1) {
        if (gap && Math.abs(t - len / 2) < gap) continue;
        const x = x0 + dx * t;
        const y = y0 + dy * t;
        c.moveTo(x + 1.7, y);
        c.arc(x, y, 1.7, 0, Math.PI * 2);
      }
      c.save();
      c.translate(0.9, 0.9);
      c.strokeStyle = 'rgba(0,0,0,0.25)';
      c.lineWidth = 0.7;
      c.stroke();
      c.restore();
      c.strokeStyle = WIRE_DARK;
      c.lineWidth = 0.75;
      c.stroke();
      c.strokeStyle = WIRE;
      c.lineWidth = 0.42;
      c.stroke();
      const posts = Math.max(2, Math.round(len / 12));
      for (let k = 0; k <= posts; k++) {
        const t = (k / posts) * len;
        if (gap && Math.abs(t - len / 2) < gap) continue;
        circle(c, x0 + dx * t, y0 + dy * t, 0.75, POST);
      }
    };
    loops(-U - o, -V - o, U + o, -V - o);
    loops(U + o, -V - o, U + o, V + o);
    loops(-U - o, V + o, U + o, V + o, 6);
    loops(-U - o, -V - o, -U - o, V + o);
  }
  if (mask & 1) {
    // Säcke ringsum (von oben eine Lage sichtbar, obere versetzt als Naht), Schatten nach rechts unten
    const row = (x0, y0, x1, y1, vertical) => {
      const len = vertical ? y1 - y0 : x1 - x0;
      for (let a = 0; a < len - 0.6; a += BAG_L) {
        const s0 = a + 0.12;
        const s1 = Math.min(len, a + BAG_L - 0.12);
        const mid = (vertical ? y0 : x0) + (s0 + s1) / 2;
        if (Math.abs(mid) < GAP) continue;
        const r = vertical ? [x0, y0 + s0, x1, y0 + s1] : [x0 + s0, y0, x0 + s1, y1];
        rectF(c, r[0] + 0.7, r[1] + 0.7, r[2] + 0.7, r[3] + 0.7, 'rgba(0,0,0,0.22)');
        rectS(c, r[0], r[1], r[2], r[3], BAG, 'rgba(70,56,34,0.7)', 0.3);
        const cx = (r[0] + r[2]) / 2;
        const cy = (r[1] + r[3]) / 2;
        lineT(c, vertical ? [[r[0] + 0.4, cy], [r[2] - 0.4, cy]] : [[cx, r[1] + 0.4], [cx, r[3] - 0.4]], 'rgba(90,72,44,0.45)', 0.25);
      }
    };
    const d = BAG_D;
    row(-U - d - 0.1, -V - d - 0.1, U + d + 0.1, -V - 0.1, false);
    row(-U - d - 0.1, V + 0.1, U + d + 0.1, V + d + 0.1, false);
    row(-U - d - 0.1, -V, -U - 0.1, V, true);
    row(U + 0.1, -V, U + d + 0.1, V, true);
  }
  if (mask & 2) {
    // MG-Nest unten rechts: Ring aus Säcken, Kiste, MG nach rechts
    const x = U + 8;
    const y = V + 8;
    circle(c, x + 0.8, y + 0.8, 6.2, 'rgba(0,0,0,0.2)');
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.31;
      if (Math.cos(a - Math.PI * 1.25) > 0.82) continue;
      const bx = x + Math.cos(a) * 4.8;
      const by = y + Math.sin(a) * 4.8;
      rectS(c, bx - 1.4, by - 1.4, bx + 1.4, by + 1.4, BAG, 'rgba(70,56,34,0.7)', 0.3);
    }
    rectS(c, x - 2.6, y + 0.6, x - 0.8, y + 1.8, BOX, 'rgba(0,0,0,0.4)', 0.25);
    lineT(c, [[x - 0.9, y], [x + 6.4, y]], MG, 0.55);
    rectF(c, x - 0.9, y - 0.45, x + 1.2, y + 0.45, MG);
  }
}

/** Ausbauten von oben (2D, Weltkoordinaten, Kamera-Transformation gesetzt). */
export function drawHouseWorksTop(ctx, h, zoom) {
  const mask = worksMask(h);
  if (!mask) return false;
  const w = Math.round(h.pw);
  const hh = Math.round(h.ph);
  const m = OFF + 4;
  const e = sprite(`hwt|${w}|${hh}|${mask}`, zoom * spriteDpr(), [-w / 2 - m, -hh / 2 - m, w / 2 + m + 2, hh / 2 + m + 2], (c, s) => paintTop(c, s, w, hh, mask));
  if (e === false) return false;
  if (e) {
    blit(ctx, e, h.x, h.y, 1);
    return true;
  }
  ctx.save();
  ctx.translate(h.x, h.y);
  paintTop(ctx, 1, w, hh, mask);
  ctx.restore();
  return true;
}

/** Fahne von oben (2D, Weltkoordinaten): Mast an der linken unteren Ecke, Tuch nach links, flattert. */
export function drawHouseFlagTop(ctx, h, color, t) {
  const x = h.x - h.pw / 2 - 4;
  const y = h.y + h.ph / 2 + 4;
  ctx.save();
  // Schatten des Tuchs am Boden, dann Tuch (leicht gewellt), Mast als Punkt
  const L = 12;
  const H = 6;
  const wave = (i) => Math.sin(t * 5.2 - h.id * 0.7 - i * 1.15) * 0.9 * (i / 4);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x - L + 3, y - H / 2 + 3, L, H);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? shade(color, 0.12) : color;
    ctx.beginPath();
    ctx.moveTo(x - (L * i) / 4, y - H / 2 + wave(i));
    ctx.lineTo(x - (L * (i + 1)) / 4, y - H / 2 + wave(i + 1));
    ctx.lineTo(x - (L * (i + 1)) / 4, y + H / 2 + wave(i + 1));
    ctx.lineTo(x - (L * i) / 4, y + H / 2 + wave(i));
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x - L, y - H / 2, L, H);
  circle(ctx, x, y, 1.5, '#d8d8d2');
  circle(ctx, x, y, 0.7, '#e8c547');
  ctx.restore();
  return true;
}

