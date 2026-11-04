// Großbauten der Stadt ohne eigenes Bild (seit v5.03, PRD §15): Kraftwerk (2 × 2, hoher Schornstein und Kühlturm), Kaserne (4 × 4,
// Unterkünfte mit Ziegeldach um einen Exerzierplatz, Wache, Fahrzeuge; seit v5.11 mit Fenstern, Toren und Bäumen), Fabrikhalle
// (8 × 8, Montagehalle mit Sheddach, Verwaltung, Lackiererei, Schornsteine, Fahrzeughof mit fertigen Fahrzeugen, Portalkran) und
// Flughafen (10 × 10, zwei Start- und Landebahnen, Rollweg, Vorfeld mit 20 Stellplätzen, Hangars und Tower). Jede Anlage ist eine
// Liste von Teilen in Weltkoordinaten: Boden (Flächen, Linien) und Körper (Quader, Zylinder, Fahnen). Die 2D-Ansicht zeichnet sie
// von oben, die Iso-Ansicht jeden Körper einzeln in der Tiefenordnung (so stehen Einheiten richtig davor oder dahinter) und für jede
// Drehung der Karte richtig. Nur Zeichnen, keine Spielregeln; die Maße des Flughafens kommen aus game/aircraft.js (AIRPORT).
import { AIRPORT } from '../game/aircraft.js';
import { drawBox } from './iso.js';
import { shade, tint } from './sprites.js';

/** Großbauten, die hier gezeichnet werden (die Universität hat ihr eigenes Bild, university.js). */
export const BIG_KINDS = new Set(['power', 'barracks', 'factory', 'airport']);

const CONCRETE = '#b3afa4';
/** Fahrzeuge auf Höfen (seit v5.11): Länge, Breite, Höhe der Wanne (Weltpixel). */
export const VEH = { tank: { l: 32, w: 17, h: 7 }, apc: { l: 28, w: 15, h: 10 }, truck: { l: 30, w: 13, h: 15 }, jeep: { l: 19, w: 11, h: 9 } };
export const VEH_COLOR = '#5f6b3e';
const GLASS = '#6f93ad';

// ---- Anlagen: Boden und Körper je Art und Stufe (lokal, Mitte 0/0) ----

/** Boden einer Anlage: [{ t: 'rect', x0, y0, x1, y1, c } | { t: 'line', x0, y0, x1, y1, c, w } | { t: 'disc', x, y, r, c }]. */
function groundOf(k, lv, half) {
  const g = [];
  const rect = (x0, y0, x1, y1, c) => g.push({ t: 'rect', x0, y0, x1, y1, c });
  const line = (x0, y0, x1, y1, c, w) => g.push({ t: 'line', x0, y0, x1, y1, c, w });
  if (k === 'power') {
    rect(-half + 3, -half + 3, half - 3, half - 3, '#bdb8ab');
    rect(-58, 16, -10, 58, '#33312d'); // Kohlelager
    rect(-56, 18, -12, 56, '#26241f');
  } else if (k === 'barracks') {
    // Kaserne (seit v5.11): Rasen, Exerzierplatz mit Fahne, Wege, Fahrzeugplatz vor dem Schuppen, Zufahrt mit Wache von Süden
    rect(-half + 3, -half + 3, half - 3, half - 3, '#8ea364');
    rect(-84, -84, 64, -62, '#b9b49a'); // Gehweg vor der Unterkunft Nord
    rect(-84, -84, -62, 44, '#b9b49a'); // Gehweg vor der Unterkunft West
    rect(-60, -62, 62, 42, '#66685f'); // Exerzierplatz
    line(-54, -56, 56, -56, '#e2dfd2', 1.6);
    line(56, -56, 56, 36, '#e2dfd2', 1.6);
    line(56, 36, -54, 36, '#e2dfd2', 1.6);
    line(-54, 36, -54, -56, '#e2dfd2', 1.6);
    for (let x = -40; x <= 40; x += 16) line(x, 22, x + 8, 22, '#e2dfd2', 1.6); // Antrittslinie
    rect(-8, -18, 8, -2, '#b9b49a'); // Sockel des Fahnenmasts
    rect(36, 42, 62, half - 3, '#5d5f5a'); // Zufahrt
    for (let y = 52; y < half - 8; y += 18) line(49, y, 49, y + 8, '#e2dfd2', 1.4);
    rect(-42, 56, 36, 124, '#7b7c76'); // Fahrzeugplatz
    for (let x = -36; x <= 30; x += 22) line(x, 62, x, 82, '#e3d46a', 1.4);
    if (lv >= 2) {
      rect(68, 46, 122, 86, '#c9b27a'); // Hindernisbahn (Sand)
      for (let x = 76; x <= 114; x += 9.5) line(x, 50, x, 82, '#6b4f33', 2.2); // Hürden und Balken
      line(70, 66, 120, 66, '#8a6a45', 1.2);
    }
    const f = half - 6;
    for (const [x0, y0, x1, y1] of [[-f, -f, f, -f], [f, -f, f, f], [f, f, 66, f], [32, f, -f, f], [-f, f, -f, -f]]) line(x0, y0, x1, y1, '#4a4a42', 2.5); // Zaun (Lücke an der Zufahrt)
  } else if (k === 'factory') {
    // Fabrikhalle (seit v5.11): Betonhof, Fahrzeughof mit Stellplätzen zur Straße, Rasen vor der Verwaltung
    rect(-half + 3, -half + 3, half - 3, half - 3, '#a9a69c');
    rect(-244, 128, 244, 246, '#8c8a82'); // Fahrzeughof
    for (let x = -216; x <= 216; x += 48) line(x, 140, x, 232, '#e3d46a', 2); // Stellplätze
    line(-half + 10, 120, half - 10, 120, '#e3d46a', 3);
    rect(108, -32, 248, -6, '#86a05e'); // Rasen vor der Verwaltung
    rect(170, -36, 186, -6, '#c9c4b4'); // Weg zum Eingang
    rect(-236, -40, 96, -12, '#9b988f'); // Vorplatz der Montagehalle
    for (let x = -200; x <= 60; x += 72) line(x, -38, x, -14, '#e3d46a', 1.6);
    if (lv >= 2) rect(184, 46, 248, 118, '#96938a'); // Containerlager
  } else if (k === 'airport') {
    const A = AIRPORT;
    rect(-half + 3, -half + 3, half - 3, half - 3, '#6f8a52'); // Gras
    rect(A.apron.x0, A.apron.y0, A.apron.x1, A.apron.y1, '#a7a69e'); // Vorfeld
    rect(110, -70, 300, 210, '#a7a69e'); // vor den Hangars
    const t = A.taxi;
    rect(t.x0, t.y - t.w / 2, t.x1, t.y + t.w / 2, '#4b4d49'); // Rollweg
    for (const x of [t.x0, t.x1]) rect(x - t.w / 2, A.runways[0].y, x + t.w / 2, t.y + t.w / 2, '#4b4d49'); // Verbindungen zu den Bahnen
    rect(-40 - t.w / 2, t.y, -40 + t.w / 2, A.apron.y0, '#4b4d49'); // zum Vorfeld
    line(t.x0, t.y, t.x1, t.y, '#e3c63a', 1.6);
    for (const r of A.runways) {
      rect(r.x0, r.y - r.w / 2, r.x1, r.y + r.w / 2, '#3e403d');
      line(r.x0 + 4, r.y - r.w / 2 + 3, r.x1 - 4, r.y - r.w / 2 + 3, '#ecebe4', 1.6);
      line(r.x0 + 4, r.y + r.w / 2 - 3, r.x1 - 4, r.y + r.w / 2 - 3, '#ecebe4', 1.6);
      for (let x = r.x0 + 60; x < r.x1 - 60; x += 40) line(x, r.y, x + 20, r.y, '#ecebe4', 2); // Mittellinie
      for (const [xa, s] of [[r.x0 + 10, 1], [r.x1 - 10, -1]]) for (let k2 = -3; k2 <= 3; k2++) if (k2) line(xa, r.y + k2 * 4.2, xa + s * 26, r.y + k2 * 4.2, '#ecebe4', 2.4); // Schwellen
    }
    for (const p of A.slots) {
      line(p.x, p.y - 26, p.x, p.y + 24, '#e3c63a', 1.4); // Stellplatz: Leitlinie und Haltebalken
      line(p.x - 14, p.y - 26, p.x + 14, p.y - 26, '#e3c63a', 1.4);
    }
  }
  return g;
}

/**
 * Körper einer Anlage: [{ t: 'box', x0, y0, x1, y1, h, base, c, roof, …Schmuck } | { t: 'cyl', x, y, r, r1, h, base, c, band }
 * | { t: 'flag', x, y, h } | { t: 'veh', v, x, y, ax, h } | { t: 'tree', x, y, r }]. Schmuck eines Quaders (seit v5.11, gezeichnet in
 * isobuild.js): gable = Firsthöhe des Satteldachs, saw = { n, rh } Sheddach, win = Fensterreihen [[h0, h1]] mit Abstand wg und Breite ww,
 * gates = { e: Wände, n, w, h } Rolltore, door = Wände mit Tür, stripe = Band in Teamfarbe, ribs = Wellblech-Rippen.
 * Wände: 0 Norden (y0), 1 Osten (x1), 2 Süden (y1), 3 Westen (x0).
 */
function bodiesOf(k, lv, half) {
  const b = [];
  const box = (x0, y0, x1, y1, h, c, roof, base = 0, deco = null) => b.push({ t: 'box', x0, y0, x1, y1, h, base, c, roof, ...deco });
  const veh = (v, x, y, ax) => b.push({ t: 'veh', v, x, y, ax, h: VEH[v].h }); // Fahrzeug, Front nach +ax
  const cyl = (x, y, r, h, c, o = {}) => b.push({ t: 'cyl', x, y, r, r1: o.r1 ?? r, h, base: o.base ?? 0, c, band: o.band ?? null });
  if (k === 'power') {
    box(-58, -58, 12, 8, 26 + 4 * lv, '#c9c3b5', '#878c90'); // Turbinenhalle
    box(-24, -48, 14, -10, 48 + 8 * lv, '#b7b0a2', '#6f7377'); // Kesselhaus
    cyl(34, -34, 7, 118 + 22 * lv, '#d8d4cc', { r1: 5, band: '#c0392b' }); // Schornstein (hoch)
    cyl(30, 30, 27, 62 + 8 * lv, '#cfcac0', { r1: 19 }); // Kühlturm
    if (lv >= 3) cyl(-44, -30, 5, 96, '#d8d4cc', { r1: 4, band: '#c0392b' });
  } else if (k === 'barracks') {
    // Kaserne (seit v5.11): zwei Unterkünfte mit Ziegeldach, Fahrzeugschuppen mit Toren, Wache mit Schranke, Fahrzeuge, Bäume;
    // Stufe 2: Stabsgebäude und Schützenpanzer; Stufe 3: Wachtürme in den Ecken und ein Panzer auf dem Exerzierplatz.
    const W = '#ddd2b0';
    const TILE = '#a65040';
    const rows2 = [[5, 10], [15, 20]];
    box(-118, -96, -82, 44, 24, W, TILE, 0, { gable: 11, win: rows2, wg: 13, ww: 5, door: [1] }); // Unterkunft West
    box(-62, -118, 76, -86, 24, W, TILE, 0, { gable: 11, win: rows2, wg: 13, ww: 5, door: [2] }); // Unterkunft Nord
    box(-104, 60, -44, 110, 18, '#7b8058', '#5d6450', 0, { gates: { e: [1], n: 2, w: 17, h: 13 }, ribs: true }); // Fahrzeugschuppen
    box(70, 92, 96, 114, 13, W, '#56603a', 0, { win: [[5, 10]], wg: 10, ww: 6, door: [3] }); // Wache
    box(64, 89, 68, 117, 2, '#55585b', '#55585b', 13); // Vordach der Wache
    box(34, 103.5, 66, 106.5, 2.5, '#e8e4d4', '#d23a3a', 7); // Schranke
    box(63, 102, 67, 108, 9, '#d23a3a', '#e8e4d4'); // Pfosten der Schranke
    b.push({ t: 'flag', x: 0, y: -10, h: 64 });
    veh('truck', -20, 92, 'y');
    veh('jeep', 22, 96, 'y');
    for (const [x, y] of [[96, -100], [114, -74], [-62, 52], [-28, 46]]) b.push({ t: 'tree', x, y, r: 9 });
    if (lv >= 2) {
      box(82, -56, 120, 32, 30, '#e4dcc4', '#8a4434', 0, { gable: 10, win: [[5, 11], [15, 21], [23, 28]], wg: 12, ww: 5, door: [3] }); // Stabsgebäude
      veh('apc', 0, 94, 'y');
    }
    if (lv >= 3) {
      for (const [x, y] of [[-116, -116], [116, -116], [116, 116], [-116, 116]]) {
        box(x - 5, y - 5, x + 5, y + 5, 34, '#6b5a44', '#6b5a44'); // Wachturm: Gerüst
        box(x - 9, y - 9, x + 9, y + 9, 9, '#7b8058', '#56603a', 34, { win: [[3, 7]], wg: 8, ww: 6 }); // Kanzel
      }
      veh('tank', -32, -30, 'x');
    }
  } else if (k === 'factory') {
    // Fabrikhalle (seit v5.11): Montagehalle mit Sheddach und Toren, Verwaltung mit Fensterbändern und Streifen in Teamfarbe,
    // Schornstein, Tanklager, fertige Fahrzeuge auf dem Hof; Stufe 2: Lackiererei, zweite Halle, Containerlager; Stufe 3: dritte
    // Halle, zweiter Schornstein, Portalkran über den Containern, mehr Fahrzeuge.
    const HALL = '#bcc1bd';
    box(-236, -236, 96, -44, 44, HALL, '#8e959a', 0, { saw: { n: 8, rh: 14 }, gates: { e: [2], n: 3, w: 46, h: 32 }, win: [[34, 40]], wg: 22, ww: 14, ribs: true }); // Montagehalle
    box(120, -100, 236, -40, 36, '#e4e0d4', '#7b7f82', 0, { win: [[6, 12], [17, 23], [27, 32]], wg: 10, ww: 7, stripe: true, door: [2] }); // Verwaltung
    box(168, -40, 188, -28, 1.5, '#55585b', '#6d7174', 13); // Vordach am Eingang
    for (const [x, y] of [[142, -80], [210, -62]]) box(x - 6, y - 5, x + 6, y + 5, 5, '#9a9fa3', '#b9bec1', 36); // Klimageräte
    cyl(60, -26, 9, 104, '#9a948a', { r1: 7, band: '#c0392b' }); // Schornstein
    cyl(146, 30, 15, 28, '#dfe3e6'); // Tanklager
    cyl(184, 30, 15, 28, '#dfe3e6');
    for (const [x, y] of [[124, -18], [232, -18]]) b.push({ t: 'tree', x, y, r: 9 });
    const yard = lv >= 3 ? 9 : lv >= 2 ? 6 : 4;
    const kinds = ['tank', 'truck', 'apc', 'tank', 'truck', 'apc', 'tank', 'jeep', 'apc'];
    for (let i = 0; i < yard; i++) veh(kinds[i], -192 + 48 * i, 186, 'y');
    if (lv >= 2) {
      box(120, -236, 236, -124, 34, '#c9c6bc', '#8a8f92', 0, { gates: { e: [2], n: 1, w: 40, h: 24 }, win: [[26, 31]], wg: 16, ww: 10 }); // Lackiererei
      for (const x of [140, 178, 216]) box(x - 7, -190, x + 7, -176, 7, '#8d9296', '#6d7276', 34); // Abluft
      box(-236, -6, -64, 100, 34, HALL, '#7d858b', 0, { gable: 16, gates: { e: [2], n: 3, w: 32, h: 24 }, win: [[27, 32]], wg: 20, ww: 12, ribs: true }); // zweite Halle
      const CT = ['#b5523b', '#3c6e9e', '#c9a13a', '#5f7f4f'];
      [[190, 52, 0], [190, 70, 0], [190, 88, 0], [190, 52, 14], [190, 106, 0], [190, 70, 14]].forEach(([x, y, z], n) => box(x, y, x + 44, y + 15, 14, CT[n % 4], shade(CT[n % 4], 0.1), z)); // Container
    }
    if (lv >= 3) {
      box(-40, -6, 96, 100, 32, HALL, '#7d858b', 0, { gable: 14, gates: { e: [2], n: 2, w: 32, h: 22 }, ribs: true }); // dritte Halle
      cyl(100, -26, 8, 92, '#9a948a', { r1: 6, band: '#c0392b' });
      for (const [x, y] of [[182, 44], [182, 118], [240, 44], [240, 118]]) box(x - 3, y - 3, x + 3, y + 3, 46, '#d9a21b', '#d9a21b'); // Portalkran: Stützen
      for (const x of [182, 240]) box(x - 3, 41, x + 3, 121, 5, '#d9a21b', '#e8b52c', 46); // Kranbahn
      box(179, 78, 243, 86, 6, '#d9a21b', '#e8b52c', 51); // Brücke
      box(204, 76, 216, 88, 5, '#55585b', '#6d7174', 57); // Laufkatze
    }
  } else if (k === 'airport') {
    AIRPORT.hangars.slice(0, Math.max(1, lv)).forEach((h) => box(h.x - h.w / 2, h.y - h.h / 2, h.x + h.w / 2, h.y + h.h / 2, 34, '#c4c8c8', '#9aa3a8'));
    const T = AIRPORT.tower;
    box(T.x - 20, T.y - 20, T.x + 20, T.y + 20, 18, '#d4d1c8', '#9da1a3'); // Sockel
    cyl(T.x, T.y, 7, 58, '#e6e3da', { base: 18 }); // Schaft
    cyl(T.x, T.y, 15, 13, GLASS, { base: 76, r1: 16 }); // Kanzel
    cyl(T.x, T.y, 17, 3, '#55595c', { base: 89 }); // Dach
    if (lv >= 2) box(96, 220, 176, 300, 22, '#d9d4c6', '#7b7f82'); // Abfertigung
    for (const y of [240, 286]) cyl(296, y, 13, 18, '#e3e0d6'); // Tanklager
  }
  return b;
}

/** Größe, Stufe und Mitte → Anlage { ground, bodies } in Weltkoordinaten (Mitte cx, cy). */
export function bigPlan(k, lv, cx, cy, size) {
  const half = size / 2;
  const mv = (o) => {
    const p = { ...o };
    for (const key of ['x', 'x0', 'x1']) if (key in p) p[key] += cx;
    for (const key of ['y', 'y0', 'y1']) if (key in p) p[key] += cy;
    return p;
  };
  const bodies = bodiesOf(k, Math.max(1, lv), half).map(mv);
  if (k === 'barracks' || k === 'factory') for (const p of bodies) p.fine = true; // seit v5.11: weichere Wände und Schmuck (isobuild.js)
  return { ground: groundOf(k, Math.max(1, lv), half).map(mv), bodies };
}

/** Höchster Punkt einer Anlage (Weltpixel): Schild darüber. */
export function bigTop(k, lv) {
  return Math.max(30, ...bodiesOf(k, Math.max(1, lv), 0).map((p) => (p.base ?? 0) + p.h + (p.gable ?? p.saw?.rh ?? 0)));
}

// ---- Boden (citylayer.js stellt die Zeichenhilfen: Fläche, Linie, Kreis auf dem Gelände) ----

/** Boden einer gebauten Anlage über die Hilfen `g` = { rect(x0, y0, x1, y1, color), line(x0, y0, x1, y1, color, width) }. */
export function drawBigGround(g, plan) {
  for (const p of plan.ground) {
    if (p.t === 'rect') g.rect(p.x0, p.y0, p.x1, p.y1, p.c);
    else if (p.t === 'line') g.line(p.x0, p.y0, p.x1, p.y1, p.c, p.w);
  }
}

// ---- 2D von oben ----

/** Körper von oben: Schatten nach rechts unten (länger, je höher), Dach, Lichtseite; Zylinder als Kreis. Team = Fahne und Streifen. */
export function drawBigTop(ctx, plan, color, damage = 0) {
  for (const p of plan.bodies) {
    const s = Math.min(40, ((p.base ?? 0) + p.h + (p.gable ?? 0)) * 0.22);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    if (p.t === 'box') ctx.fillRect(p.x0 + s, p.y0 + s, p.x1 - p.x0, p.y1 - p.y0);
    else if (p.t === 'cyl' || p.t === 'tree') {
      ctx.beginPath();
      ctx.arc(p.x + s, p.y + s, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.t === 'veh') {
      const [hx, hy] = vehHalf(p);
      ctx.fillRect(p.x - hx + 3, p.y - hy + 3, hx * 2, hy * 2);
    }
  }
  for (const p of plan.bodies) {
    if (p.t === 'box') boxTop(ctx, p, color);
    else if (p.t === 'cyl') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c;
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,30,30,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r1 * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = p.band ?? shade(p.c, 0.35);
      ctx.fill();
    } else if (p.t === 'flag') {
      ctx.fillStyle = '#d8d8d0';
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      ctx.fillStyle = color;
      ctx.fillRect(p.x + 1.5, p.y - 1.5, 14, 9);
    } else if (p.t === 'veh') vehTop(ctx, p);
    else if (p.t === 'tree') {
      ctx.fillStyle = '#2f5a2a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4f8a3c';
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (damage > 0.05) {
    ctx.fillStyle = `rgba(20,10,5,${(0.5 * damage).toFixed(2)})`;
    for (const p of plan.bodies) if (p.t === 'box') ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
  }
}

/** Dach eines Quaders von oben: flach, Satteldach (zwei Hälften mit First) oder Sheddach (Streifen mit Glas). */
function boxTop(ctx, p, color) {
  const w = p.x1 - p.x0;
  const h = p.y1 - p.y0;
  const roof = p.roof;
  ctx.lineWidth = 1;
  if (p.gable) {
    const alongX = w >= h;
    ctx.fillStyle = tint(roof, 0.12);
    if (alongX) ctx.fillRect(p.x0, p.y0, w, h / 2);
    else ctx.fillRect(p.x0, p.y0, w / 2, h);
    ctx.fillStyle = shade(roof, 0.18);
    if (alongX) ctx.fillRect(p.x0, p.y0 + h / 2, w, h / 2);
    else ctx.fillRect(p.x0 + w / 2, p.y0, w / 2, h);
    ctx.strokeStyle = shade(roof, 0.45);
    ctx.beginPath();
    if (alongX) {
      ctx.moveTo(p.x0, p.y0 + h / 2);
      ctx.lineTo(p.x1, p.y0 + h / 2);
    } else {
      ctx.moveTo(p.x0 + w / 2, p.y0);
      ctx.lineTo(p.x0 + w / 2, p.y1);
    }
    ctx.stroke();
  } else if (p.saw) {
    const step = w / p.saw.n;
    for (let i = 0; i < p.saw.n; i++) {
      const a = p.x0 + i * step;
      const gr = ctx.createLinearGradient(a, 0, a + step, 0);
      gr.addColorStop(0, shade(roof, 0.2));
      gr.addColorStop(1, tint(roof, 0.15));
      ctx.fillStyle = gr;
      ctx.fillRect(a, p.y0, step, h);
      ctx.fillStyle = '#6f93ad';
      ctx.fillRect(a + step - 4, p.y0, 4, h);
    }
  } else {
    ctx.fillStyle = roof;
    ctx.fillRect(p.x0, p.y0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(p.x0, p.y0, w, h / 2);
  }
  if (p.stripe) {
    ctx.fillStyle = color;
    ctx.fillRect(p.x0, p.y1 - 3, w, 3);
  }
  ctx.strokeStyle = 'rgba(30,30,30,0.35)';
  ctx.strokeRect(p.x0, p.y0, w, h);
}

/** Halbe Ausdehnung eines Fahrzeugs in x und y. */
export function vehHalf(p) {
  const d = VEH[p.v];
  return p.ax === 'x' ? [d.l / 2, d.w / 2] : [d.w / 2, d.l / 2];
}

/** Fahrzeug von oben: Wanne, Ketten oder Kabine, Turm mit Rohr. */
function vehTop(ctx, p) {
  const [hx, hy] = vehHalf(p);
  const ax = p.ax === 'x';
  const d = VEH[p.v];
  ctx.fillStyle = shade(VEH_COLOR, 0.3);
  ctx.fillRect(p.x - hx, p.y - hy, hx * 2, hy * 2);
  ctx.fillStyle = VEH_COLOR;
  ctx.fillRect(p.x - hx + (ax ? 1 : 2.5), p.y - hy + (ax ? 2.5 : 1), hx * 2 - (ax ? 2 : 5), hy * 2 - (ax ? 5 : 2));
  const f = d.l / 2; // Front nach +x bzw. +y
  const at = (u, v) => (ax ? [p.x + u, p.y + v] : [p.x + v, p.y + u]);
  if (p.v === 'truck') {
    const [cx, cy] = at(f - 5, 0);
    ctx.fillStyle = '#4f5a33';
    ctx.fillRect(cx - (ax ? 5 : hx), cy - (ax ? hy : 5), ax ? 10 : hx * 2, ax ? hy * 2 : 10);
    const [tx, ty] = at(-4, 0);
    ctx.fillStyle = '#7a8150'; // Plane
    ctx.fillRect(tx - (ax ? 11 : hx - 1), ty - (ax ? hy - 1 : 11), ax ? 22 : hx * 2 - 2, ax ? hy * 2 - 2 : 22);
  } else if (p.v !== 'jeep') {
    const [tx, ty] = at(-2, 0);
    ctx.fillStyle = tint(VEH_COLOR, 0.12);
    ctx.beginPath();
    ctx.arc(tx, ty, p.v === 'tank' ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    const [bx, by] = at(f + (p.v === 'tank' ? 10 : 2), 0);
    ctx.strokeStyle = '#3d4528';
    ctx.lineWidth = p.v === 'tank' ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(bx, by);
    ctx.stroke();
  } else {
    const [wx, wy] = at(2, 0);
    ctx.fillStyle = '#34495e'; // Frontscheibe
    ctx.fillRect(wx - (ax ? 1.5 : hx - 1), wy - (ax ? hy - 1 : 1.5), ax ? 3 : hx * 2 - 2, ax ? hy * 2 - 2 : 3);
  }
}

// ---- Isometrisch ----

/** Ein Körper einer Anlage isometrisch (Transformation: Bildschirm, dpr gesetzt; Höhe: cam.pin vom Renderer). */
export function drawBigPart(ctx, cam, p, color) {
  if (p.t === 'box') {
    drawBox(ctx, cam, p.x0, p.y0, p.x1, p.y1, p.h, p.c, { base: p.base, roof: p.roof, noShadow: p.base > 0 });
    return;
  }
  const z = cam.zoom;
  const q = cam.worldToScreen(p.x, p.y);
  if (p.t === 'flag') {
    ctx.strokeStyle = '#e4e4dc';
    ctx.lineWidth = Math.max(1, 1.6 * z);
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(q.x, q.y - p.h * z);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(q.x, q.y - p.h * z, 16 * z, 10 * z);
    return;
  }
  // Zylinder (Schornstein, Kühlturm, Tower): unten Radius r, oben r1; Kreis in der Iso-Ansicht = Ellipse r × r/2
  const y0 = q.y - p.base * z;
  const y1 = y0 - p.h * z;
  const R0 = p.r * z;
  const R1 = p.r1 * z;
  ctx.save();
  const grad = ctx.createLinearGradient(q.x - R0, 0, q.x + R0, 0);
  grad.addColorStop(0, tint(p.c, 0.12));
  grad.addColorStop(0.45, shade(p.c, 0.1));
  grad.addColorStop(1, shade(p.c, 0.45));
  if (!p.base) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; // Schatten nach links unten
    ctx.beginPath();
    ctx.ellipse(q.x - p.h * z * 0.3, q.y + p.h * z * 0.15, R0 * 1.1, R0 * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(q.x - R1, y1);
  ctx.lineTo(q.x - R0, y0);
  ctx.ellipse(q.x, y0, R0, R0 / 2, 0, Math.PI, 0, true);
  ctx.lineTo(q.x + R1, y1);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,30,20,0.45)';
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.stroke();
  if (p.band) {
    // rot-weiße Ringe unter der Mündung (Schornstein)
    for (const f of [0.86, 0.94]) {
      const yy = y0 + (y1 - y0) * f;
      const rr = R0 + (R1 - R0) * f;
      ctx.beginPath();
      ctx.ellipse(q.x, yy, rr, rr / 2, 0, 0, Math.PI);
      ctx.lineWidth = Math.max(1.5, p.h * z * 0.04);
      ctx.strokeStyle = p.band;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.ellipse(q.x, y1, R1, R1 / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = p.r1 < p.r * 0.8 ? '#3a3734' : tint(p.c, 0.18); // Kühlturm und Schornstein: offene Mündung
  ctx.fill();
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.strokeStyle = 'rgba(40,30,20,0.45)';
  ctx.stroke();
  ctx.restore();
}

/** Mittelpunkt und Fußabdruck eines Körpers (für Tiefenordnung und Geländehöhe im Renderer). */
export function partFoot(p) {
  if (p.t === 'veh') {
    const [hx, hy] = vehHalf(p);
    return { x: p.x, y: p.y, w: hx * 2, h: hy * 2 };
  }
  if (p.t === 'box') return { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2, w: p.x1 - p.x0, h: p.y1 - p.y0 };
  const r = p.r ?? 4;
  return { x: p.x, y: p.y, w: r * 2, h: r * 2 };
}
