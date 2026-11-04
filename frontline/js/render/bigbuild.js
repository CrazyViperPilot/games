// Großbauten der Stadt ohne eigenes Bild (seit v5.03, PRD §15): Kraftwerk (2 × 2, hoher Schornstein und Kühlturm), Kaserne (4 × 4,
// Unterkünfte um einen Exerzierplatz), Fabrikhalle (8 × 8, Montagehalle mit Sheddach, Lackiererei, Schornsteine, Fahrzeughof) und
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
const OLIVE = '#8d9468';
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
    rect(-half + 3, -half + 3, half - 3, half - 3, '#b9b49a');
    rect(-46, -40, 64, 58, '#5b5e58'); // Exerzierplatz
    line(-40, 9, 58, 9, '#e8e4d4', 2);
    line(9, -34, 9, 52, '#e8e4d4', 2);
    for (const [x0, y0, x1, y1] of [[-half + 6, -half + 6, half - 6, -half + 6], [half - 6, -half + 6, half - 6, half - 6], [half - 6, half - 6, -half + 6, half - 6], [-half + 6, half - 6, -half + 6, -half + 6]]) line(x0, y0, x1, y1, '#4a4a42', 2.5); // Zaun
  } else if (k === 'factory') {
    rect(-half + 3, -half + 3, half - 3, half - 3, '#a9a69c');
    rect(-236, 132, 236, 240, '#8f8c83'); // Fahrzeughof
    for (let x = -220; x <= 220; x += 44) line(x, 136, x, 236, '#e3d46a', 2); // Stellplätze
    line(-half + 10, 120, half - 10, 120, '#e3d46a', 3);
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

/** Körper einer Anlage: [{ t: 'box', x0, y0, x1, y1, h, base, c, roof } | { t: 'cyl', x, y, r, r1, h, base, c, band } | { t: 'flag', x, y, h }]. */
function bodiesOf(k, lv, half) {
  const b = [];
  const box = (x0, y0, x1, y1, h, c, roof, base = 0) => b.push({ t: 'box', x0, y0, x1, y1, h, base, c, roof });
  const cyl = (x, y, r, h, c, o = {}) => b.push({ t: 'cyl', x, y, r, r1: o.r1 ?? r, h, base: o.base ?? 0, c, band: o.band ?? null });
  if (k === 'power') {
    box(-58, -58, 12, 8, 26 + 4 * lv, '#c9c3b5', '#878c90'); // Turbinenhalle
    box(-24, -48, 14, -10, 48 + 8 * lv, '#b7b0a2', '#6f7377'); // Kesselhaus
    cyl(34, -34, 7, 118 + 22 * lv, '#d8d4cc', { r1: 5, band: '#c0392b' }); // Schornstein (hoch)
    cyl(30, 30, 27, 62 + 8 * lv, '#cfcac0', { r1: 19 }); // Kühlturm
    if (lv >= 3) cyl(-44, -30, 5, 96, '#d8d4cc', { r1: 4, band: '#c0392b' });
  } else if (k === 'barracks') {
    box(-116, -112, -22, -76, 22, OLIVE, '#5f6a45');
    box(-116, 76, -22, 112, 22, OLIVE, '#5f6a45');
    box(-116, -46, -64, 22, 18, '#7b8058', '#585e41'); // Fahrzeugschuppen
    if (lv >= 2) {
      box(22, -112, 112, -62, 30, '#a7a487', '#6b6e55'); // Stab
      box(76, -36, 112, 112, 22, OLIVE, '#5f6a45');
    }
    if (lv >= 3) for (const [x, y] of [[-112, 112], [112, -112]].map(([x, y]) => [x * 0.94, y * 0.94])) box(x - 7, y - 7, x + 7, y + 7, 46, '#6b6a5c', '#4e4d43'); // Wachtürme
    b.push({ t: 'flag', x: 9, y: 9, h: 64 });
  } else if (k === 'factory') {
    box(-236, -236, 96, -40, 46, '#b5b8b2', '#8e959a'); // Montagehalle
    for (let x = -226; x < 86; x += 38) box(x, -236, x + 18, -40, 10, '#9fa7ad', GLASS, 46); // Sheddach
    box(120, -96, 236, -36, 30, '#d9d4c6', '#7b7f82'); // Verwaltung
    cyl(64, -6, 9, 104, '#9a948a', { r1: 7, band: '#c0392b' });
    if (lv >= 2) {
      box(120, -236, 236, -120, 36, '#c2bfb4', '#8a8f92'); // Lackiererei
      box(-236, -10, -60, 104, 38, '#b5b8b2', '#8e959a'); // zweite Halle
    }
    if (lv >= 3) {
      box(-36, -10, 96, 104, 34, '#aeb2ac', '#878e93');
      cyl(100, -6, 8, 92, '#9a948a', { r1: 6, band: '#c0392b' });
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
  return { ground: groundOf(k, Math.max(1, lv), half).map(mv), bodies: bodiesOf(k, Math.max(1, lv), half).map(mv) };
}

/** Höchster Punkt einer Anlage (Weltpixel): Schild darüber. */
export function bigTop(k, lv) {
  return Math.max(30, ...bodiesOf(k, Math.max(1, lv), 0).map((p) => p.base + p.h));
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

/** Körper von oben: Schatten nach rechts unten (länger, je höher), Dach, Lichtseite; Zylinder als Kreis. Team = Fahne. */
export function drawBigTop(ctx, plan, color, damage = 0) {
  for (const p of plan.bodies) {
    const s = Math.min(40, (p.base + p.h) * 0.22);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    if (p.t === 'box') ctx.fillRect(p.x0 + s, p.y0 + s, p.x1 - p.x0, p.y1 - p.y0);
    else if (p.t === 'cyl') {
      ctx.beginPath();
      ctx.arc(p.x + s, p.y + s, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const p of plan.bodies) {
    if (p.t === 'box') {
      ctx.fillStyle = p.roof;
      ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, (p.y1 - p.y0) / 2);
      ctx.strokeStyle = 'rgba(30,30,30,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
    } else if (p.t === 'cyl') {
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
    }
  }
  if (damage > 0.05) {
    ctx.fillStyle = `rgba(20,10,5,${(0.5 * damage).toFixed(2)})`;
    for (const p of plan.bodies) if (p.t === 'box') ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
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
  if (p.t === 'box') return { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2, w: p.x1 - p.x0, h: p.y1 - p.y0 };
  const r = p.r ?? 4;
  return { x: p.x, y: p.y, w: r * 2, h: r * 2 };
}
