// Effekte, Rauch, Feuer, Krater und Trümmer (seit v5.34, Daniels Wunsch „eine Gruppe nach der anderen“, letzte Gruppe):
// Explosionen mit Lichtblitz, Feuerball aus weichen Flammenwolken, Rauchwolke, Funkenflug und Druckring; Leuchtspuren als
// glühender Kopf mit Schweif; Mündungsfeuer als Stern; Abfangen (Phalanx) als Detonation in der Luft; Mörsergranate mit
// Rauchspur und Zielring; Rauchsäulen aus weichen, von links oben beleuchteten Schwaden; Feuer mit Flammenzungen, Lichtschein
// und Funken; Krater mit Mulde, Auswurf und Brocken, große Brandflecken mit Rußstrahlen; Gebäudetrümmer von oben mit
// Schutthügeln, Mauerecke und verkohlten Balken; Minen als Panzerminen.
// 2D: Weltkoordinaten (Kamera-Transformation gesetzt). Iso: Bodenteile in der Bodenebene (setIsoGround), Feuerball, Funken,
// Leuchtspuren und Mündungsfeuer aufrecht in Bildschirmkoordinaten (drawEffectUp, CSS-Pixel, Maße × Zoom). Weiche Flecken
// sind kleine, einmal gemalte Bilder (dot), damit viele gleichzeitige Effekte flüssig bleiben. Nur Darstellung.
import { shade, tint } from './sprites.js';
import { clamp, hashXY } from './color.js';

const TAU = Math.PI * 2;
const ease = (k) => 1 - (1 - k) * (1 - k); // erst schnell, dann langsam
const OUTLINE = 'rgba(0,0,0,0.65)';

/** Kleiner Zufallsgenerator je Narbe bzw. Effekt (gleiche Form in jedem Bild). */
export function scarRng(seed) {
  let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
}

/** [r, g, b] aus '#rrggbb' oder 'rgb(r,g,b)' (Ergebnis von shade/tint). */
function rgb(col) {
  if (col.startsWith('rgb')) return col.match(/\d+/g).slice(0, 3).map(Number);
  const n = parseInt(col.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------- Weiche Flecken ----------

const dots = new Map();
const SOFT = 0; // weich, gleichmäßig (Licht, Blitz, Schein)
const LIT = 1; // weiche Schwade, von links oben beleuchtet (Rauchsäulen)
const PUFF = 2; // Wolke mit festerem Rand, beleuchtet (Feuerball, Explosionsrauch, Flakwolke)
/**
 * Fleck 64 × 64 in Farbe col (innen deckend, außen durchsichtig), je Farbe und Art einmal gemalt; LIT und PUFF hell oben links mit
 * dunklerem Rand. null ohne Canvas (Tests), dann zeichnet blob einen einfachen Kreis.
 */
function dot(col, style = SOFT) {
  const key = `${col}|${style}`;
  if (dots.has(key)) return dots.get(key);
  let c = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    if (g && g.createRadialGradient) {
      const [r, gr, b] = rgb(col);
      const [lr, lg, lb] = rgb(tint(col, style === PUFF ? 0.38 : 0.32));
      const [dr, dg, db] = [r, gr, b].map((v) => Math.round(v * (style === PUFF ? 0.66 : 0.72)));
      const grad = style ? g.createRadialGradient(24, 22, 1, 32, 32, 31) : g.createRadialGradient(32, 32, 0, 32, 32, 32);
      if (style === PUFF) {
        grad.addColorStop(0, `rgba(${lr},${lg},${lb},1)`);
        grad.addColorStop(0.5, `rgba(${r},${gr},${b},1)`);
        grad.addColorStop(0.84, `rgba(${dr},${dg},${db},0.95)`);
        grad.addColorStop(0.93, `rgba(${dr},${dg},${db},0.5)`);
        grad.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
      } else if (style === LIT) {
        grad.addColorStop(0, `rgba(${lr},${lg},${lb},1)`);
        grad.addColorStop(0.5, `rgba(${r},${gr},${b},0.92)`);
        grad.addColorStop(0.82, `rgba(${dr},${dg},${db},0.5)`);
        grad.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
      } else {
        grad.addColorStop(0, `rgba(${r},${gr},${b},1)`);
        grad.addColorStop(0.45, `rgba(${r},${gr},${b},0.62)`);
        grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      }
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    } else c = null;
  }
  dots.set(key, c);
  return c;
}

/** Fleck mit Mitte (x, y), Halbmesser r, Deckkraft a, Art style (SOFT, LIT, PUFF; aktuelle Transformation). */
function blob(ctx, col, x, y, r, a, style = SOFT) {
  if (a <= 0.004 || r <= 0) return;
  const img = dot(col, +style);
  ctx.globalAlpha = clamp(a, 0, 1);
  if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  else {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, TAU);
    ctx.fill();
  }
}

// ---------- Explosion ----------

const SIZE = { hit: 0.75, building: 1.7 };
const FIRE = ['#fff4c4', '#ffd25e', '#f79a32', '#e0601e', '#a83a1a', '#5a2a1a']; // heiß → abgekühlt
const parts = new WeakMap();
/** Feste Teile einer Explosion: Flammenwolken, Rauchwolken, Funken, Brocken (Richtung, Abstand, Größe). */
function partsOf(e) {
  let p = parts.get(e);
  if (p) return p;
  const rnd = scarRng(hashXY(e.x * 3, e.y * 7));
  const list = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  p = {
    fire: list(8, (i) => ({ a: (i / 8) * TAU + rnd() * 0.8, d: 0.3 + rnd() * 0.7, s: 0.7 + rnd() * 0.5, up: rnd() })),
    smoke: list(5, (i) => ({ a: (i / 5) * TAU + rnd(), d: 0.5 + rnd() * 0.6, s: 0.8 + rnd() * 0.45, up: rnd() })),
    sparks: list(10, () => ({ a: rnd() * TAU, v: 0.6 + rnd() * 0.7, up: 0.5 + rnd() * 0.9 })),
    debris: list(6, () => ({ a: rnd() * TAU, v: 0.5 + rnd() * 0.6, up: 0.7 + rnd() * 0.6, s: 0.8 + rnd() * 0.8, r: rnd() * TAU })),
  };
  parts.set(e, p);
  return p;
}
const fireCol = (k, i) => FIRE[clamp(Math.floor(k * 5 + (i % 3) * 0.5), 0, FIRE.length - 1)];
const smokeIn = (k) => 0.72 * clamp((k - 0.1) * 5, 0, 1) * Math.pow(1 - k, 0.7); // Rauch kommt nach dem Blitz

/** Explosion von oben (2D, Weltkoordinaten): Druckring, Blitz, Rauch, Feuerball aus beleuchteten Flammenwolken, Brocken, Funken. */
function explosionTop(ctx, e, z, k) {
  const S = SIZE[e.snd] ?? 1;
  const P = partsOf(e);
  const q = ease(k);
  ring(ctx, e.x, e.y, S * (6 + 30 * q), S * 1.6 * (1 - k) + 0.3, 0.45 * (1 - k) * (1 - k));
  if (k < 0.25) blob(ctx, '#fff6d8', e.x, e.y, S * (16 + 20 * k), 1 - k / 0.25);
  for (const s of P.smoke) {
    const d = S * (5 + 15 * q) * s.d;
    blob(ctx, '#3b3733', e.x + Math.cos(s.a) * d + k * S * 8, e.y + Math.sin(s.a) * d, S * (7 + 15 * q) * s.s, smokeIn(k), PUFF);
  }
  P.fire.forEach((f, i) => {
    const d = S * (2 + 10 * q) * f.d;
    blob(ctx, fireCol(k, i), e.x + Math.cos(f.a) * d, e.y + Math.sin(f.a) * d, S * (4.5 + 7 * q) * f.s, 0.95 * Math.pow(1 - k, 1.2), PUFF);
  });
  if (k < 0.4) blob(ctx, '#fff3c0', e.x, e.y, S * (5 + 5 * k), 1 - k / 0.4); // heißer Kern
  ctx.globalAlpha = 1;
  if (S >= 1) debris(ctx, P, e.x, e.y, k, S, (d, t) => [Math.cos(d.a) * d.v * t * 70 * S, Math.sin(d.a) * d.v * t * 70 * S]);
  sparks(ctx, P, e.x, e.y, k, S, 1 / z, (sp, t) => [Math.cos(sp.a) * sp.v * t * 60 * S, Math.sin(sp.a) * sp.v * t * 60 * S]);
}

/** Explosion aufrecht (Iso, Bildschirmkoordinaten): Feuerball steigt, Rauch darüber, Funken und Brocken im Bogen. f = Pixel je Einheit. */
function explosionUp(ctx, e, px, py, f, k) {
  const S = SIZE[e.snd] ?? 1;
  const P = partsOf(e);
  const q = ease(k);
  const cy = py - S * f * (5 + 15 * q); // Mitte des Feuerballs
  for (const s of P.smoke) {
    const d = S * f * (4 + 13 * q) * s.d;
    blob(ctx, '#3b3733', px + Math.cos(s.a) * d + k * S * f * 7, cy - S * f * (5 + 16 * k) * (0.4 + s.up * 0.6) + Math.sin(s.a) * d * 0.45, S * f * (7 + 14 * q) * s.s, smokeIn(k), PUFF);
  }
  if (k < 0.25) blob(ctx, '#fff6d8', px, cy, S * f * (16 + 20 * k), 1 - k / 0.25);
  P.fire.forEach((fl, i) => {
    const d = S * f * (2 + 10 * q) * fl.d;
    blob(ctx, fireCol(k, i), px + Math.cos(fl.a) * d, cy + Math.sin(fl.a) * d * 0.6 - fl.up * S * f * 5 * q, S * f * (4.5 + 7 * q) * fl.s, 0.95 * Math.pow(1 - k, 1.2), PUFF);
  });
  if (k < 0.4) blob(ctx, '#fff3c0', px, cy, S * f * (5 + 5 * k), 1 - k / 0.4);
  ctx.globalAlpha = 1;
  const arc = (v, up, t, sp) => [Math.cos(v.a) * v.v * t * sp * S * f, (-up * t * 46 + 40 * t * t) * S * f];
  if (S >= 1) debris(ctx, P, px, cy, k, S * f, (d, t) => arc(d, d.up * 1.2, t, 56));
  sparks(ctx, P, px, cy, k, S, 1, (sp, t) => arc(sp, sp.up, t, 52));
}

/** Funken: kurze, glühende Striche entlang ihrer Bahn (pos(sp, t) = Versatz zur Zeit t). w = Pixelbreite in Zeicheneinheiten. */
function sparks(ctx, P, x, y, k, S, w, pos) {
  if (k > 0.85) return;
  ctx.strokeStyle = `rgba(255,214,130,${(1 - k / 0.85) * 0.95})`;
  ctx.lineWidth = Math.max(0.6 * w, 1.1 * w * S);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const t0 = Math.max(0, k - 0.08);
  for (const sp of P.sparks) {
    const [ax, ay] = pos(sp, t0);
    const [bx, by] = pos(sp, k);
    ctx.moveTo(x + ax, y + ay);
    ctx.lineTo(x + bx, y + by);
  }
  ctx.stroke();
}

/** Brocken: dunkle, kantige Stücke fliegen nach außen (pos wie bei sparks), s = Größe in Zeicheneinheiten. */
function debris(ctx, P, x, y, k, s, pos) {
  ctx.fillStyle = '#2a2622';
  ctx.globalAlpha = Math.min(1, (1 - k) * 2.5) * clamp((k - 0.06) * 12, 0, 1); // erst nach dem Blitz sichtbar
  for (const d of P.debris) {
    const [dx, dy] = pos(d, k);
    const r = 1.4 * s * d.s;
    ctx.save();
    ctx.translate(x + dx, y + dy);
    ctx.rotate(d.r + k * 9 * d.v);
    ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function ring(ctx, x, y, r, w, a) {
  if (a <= 0.01) return;
  ctx.strokeStyle = `rgba(255,236,200,${a})`;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}

/**
 * Rauchband entlang pts (ältester Punkt zuerst): hinten breit und durchsichtig, vorn schmal und dichter; ein zweites, breiteres
 * Band mit wenig Deckkraft macht den Rand weich. w0/w1 = Breite hinten/vorn, a = Deckkraft vorn.
 */
function ribbon(ctx, pts, w0, w1, a) {
  const n = pts.length;
  if (n < 2) return;
  for (const [k, al] of [[1.9, a * 0.3], [1, a]]) {
    const L = [];
    const R = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[Math.min(n - 1, i + 1)];
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const l = Math.hypot(dx, dy) || 1;
      const w = ((w0 + (w1 - w0) * (i / (n - 1))) * k) / 2;
      L.push([pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w]);
      R.push([pts[i][0] + (dy / l) * w, pts[i][1] - (dx / l) * w]);
    }
    const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
    g.addColorStop(0, 'rgba(214,211,204,0)');
    g.addColorStop(0.6, `rgba(214,211,204,${al * 0.55})`);
    g.addColorStop(1, `rgba(236,233,226,${al})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    L.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------- Leuchtspur, Mündungsfeuer, Abfangen ----------

/** Leuchtspur von (x1, y1) nach (x2, y2): glühender Kopf mit Schweif fliegt zum Ziel. px = ein Bildschirmpixel in Zeicheneinheiten. */
function tracer(ctx, x1, y1, x2, y2, k, px, flak) {
  const h = Math.min(1, k * 1.35);
  const t0 = Math.max(0, h - 0.45);
  const at = (t) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  const [ax, ay] = at(t0);
  const [cx, cy] = at(t0 + (h - t0) * 0.45);
  const [bx, by] = at(h);
  ctx.lineCap = 'round';
  ctx.strokeStyle = flak ? 'rgba(255,96,40,0.38)' : 'rgba(255,176,64,0.38)';
  ctx.lineWidth = 3.4 * px;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.strokeStyle = flak ? 'rgba(255,206,160,0.95)' : 'rgba(255,248,214,0.97)';
  ctx.lineWidth = 1.3 * px;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

const MISSILE = /rpg|rocket|aim|sam/; // Lenkwaffen und Raketen ziehen eine Rauchspur
const FLAK = /flak|twin|sam/; // Flugabwehr: rötliche Leuchtspur

/**
 * Geschoss im Direktschuss (Effekt shell, 0,3 s) von (x1, y1) nach (x2, y2): Kanone als heller, dicker Leuchtkopf; Panzerfaust,
 * Raketen und Lenkwaffen mit Feuerstrahl und grauer Rauchspur, die sich hinter dem Kopf ausbreitet und verblasst.
 */
function projectile(ctx, x1, y1, x2, y2, k, px, snd) {
  if (!MISSILE.test(snd ?? '')) {
    tracer(ctx, x1, y1, x2, y2, k, px * 1.35, false);
    return;
  }
  const h = Math.min(1, k * 1.15);
  const at = (t) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  ribbon(ctx, [at(Math.max(0, h - 0.8)), at(Math.max(0, h - 0.35)), at(h)], 7 * px, 1.6 * px, 0.75 * (1 - k * 0.5)); // Rauchspur
  const [hx, hy] = at(h);
  const [bx, by] = at(Math.max(0, h - 0.06));
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,170,60,0.9)';
  ctx.lineWidth = 2.2 * px;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  blob(ctx, '#fff0c0', hx, hy, 3.4 * px, 1);
  ctx.globalAlpha = 1;
}

/** Mündungsfeuer: Stern aus Flammenspitzen mit hellem Kern; ang = Schussrichtung (null = rundum). s = Größe in Zeicheneinheiten. */
function muzzle(ctx, x, y, ang, k, s) {
  const a = 1 - k;
  blob(ctx, '#ffcf70', x, y, s * 2.2, 0.55 * a);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(255,222,130,${a})`;
  const spikes = ang === null ? [0, 1, 2, 3, 4, 5].map((i) => [(i / 6) * TAU + 0.3, 1]) : [[ang, 1.8], [ang + 0.75, 0.8], [ang - 0.75, 0.8], [ang + 2, 0.45], [ang - 2, 0.45]];
  const L = s * (1.7 - 0.6 * k);
  ctx.beginPath();
  for (const [g, l] of spikes) {
    const c = Math.cos(g);
    const n = Math.sin(g);
    ctx.moveTo(x - n * s * 0.35, y + c * s * 0.35);
    ctx.lineTo(x + c * L * l, y + n * L * l);
    ctx.lineTo(x + n * s * 0.35, y - c * s * 0.35);
  }
  ctx.fill();
  blob(ctx, '#fffbe8', x, y, s * 0.7, a);
  ctx.globalAlpha = 1;
}

/** Abfangen (Phalanx trifft eine Granate): Blitz, kleine Rauchwolke, Ring und Splitter. s = Größe. */
function intercept(ctx, x, y, k, s, px) {
  const a = 1 - k;
  const g = ease(Math.min(1, k * 2));
  blob(ctx, '#34312e', x + k * s * 0.5, y - k * s * 0.4, s * (0.7 + 1.1 * g), 0.85 * clamp(k * 6, 0, 1) * Math.pow(a, 0.6), PUFF); // Flakwolke
  if (k < 0.35) blob(ctx, '#fff6d8', x, y, s * (1.1 + k * 1.4), 1 - k / 0.35);
  if (k < 0.2) blob(ctx, '#ffc65a', x, y, s * 0.55, 1 - k / 0.2);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = `rgba(255,214,150,${a})`;
  ctx.lineWidth = 1 * px;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const g = (i / 7) * TAU + 0.4;
    const d0 = s * (0.4 + 1.6 * k);
    const d1 = d0 + s * 0.35;
    ctx.moveTo(x + Math.cos(g) * d0, y + Math.sin(g) * d0 + k * k * s);
    ctx.lineTo(x + Math.cos(g) * d1, y + Math.sin(g) * d1 + k * k * s);
  }
  ctx.stroke();
}

/**
 * Effekt (game.effects): tracer (Leuchtspur), shell (Geschoss), explosion, intercept (Abfangen), muzzle (Mündungsfeuer).
 * 2D: alles von oben (Weltkoordinaten). groundOnly (Iso, Bodenebene): nur der Druckring und der Lichtschein am Boden, den Rest
 * zeichnet drawEffectUp aufrecht.
 */
export function drawEffect(ctx, e, zoom = 1, groundOnly = false) {
  const z = zoom || 1;
  const k = clamp(e.t / e.life, 0, 1);
  ctx.save();
  if (groundOnly) {
    if (e.type === 'explosion') {
      const S = SIZE[e.snd] ?? 1;
      blob(ctx, '#ffb45a', e.x, e.y, S * (18 + 14 * k), 0.5 * (1 - k)); // Feuerschein am Boden
      ctx.globalAlpha = 1;
      ring(ctx, e.x, e.y, S * (6 + 30 * ease(k)), S * 1.6 * (1 - k) + 0.3, 0.45 * (1 - k) * (1 - k));
    } else if (e.type === 'muzzle') blob(ctx, '#ffcf70', e.x, e.y, 9, 0.35 * (1 - k));
    ctx.restore();
    return;
  }
  switch (e.type) {
    case 'tracer':
      tracer(ctx, e.x, e.y, e.x2, e.y2, k, 1 / z, FLAK.test(e.snd ?? ''));
      break;
    case 'shell':
      projectile(ctx, e.x, e.y, e.x2 ?? e.x, e.y2 ?? e.y, k, 1 / z, e.snd);
      break;
    case 'explosion':
      explosionTop(ctx, e, z, k);
      break;
    case 'intercept':
      intercept(ctx, e.x, e.y, k, 10, 1 / z);
      break;
    case 'muzzle': {
      const far = Math.hypot((e.x2 ?? e.x) - e.x, (e.y2 ?? e.y) - e.y) > 1;
      muzzle(ctx, e.x, e.y, far && e.snd !== 'mortar' ? Math.atan2(e.y2 - e.y, e.x2 - e.x) : null, k, 4.2);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** Höhe (Einheiten) von Mündung und Ziel einer Leuchtspur bzw. der Detonation beim Abfangen über dem Boden (Iso). */
const GUN_H = 9;
const HIT_H = 6;
const AIRBURST_H = 72;

/**
 * Aufrechte Teile eines Effekts in Iso (Transformation dpr, Bildschirmkoordinaten): Feuerball, Rauch und Funken der Explosion,
 * Leuchtspur in Mündungshöhe, Mündungsfeuer, Abfangen in der Luft. at(x, y) liefert den Bildschirmpunkt am Boden (Gelände, Brücke).
 */
export function drawEffectUp(ctx, e, cam, at = (x, y) => cam.worldToScreen(x, y)) {
  const f = cam.zoom;
  const k = clamp(e.t / e.life, 0, 1);
  const p = at(e.x, e.y);
  ctx.save();
  switch (e.type) {
    case 'explosion':
      explosionUp(ctx, e, p.x, p.y, f, k);
      break;
    case 'tracer':
    case 'shell': {
      const q = at(e.x2 ?? e.x, e.y2 ?? e.y);
      const px = Math.max(0.8, f * 0.9);
      if (e.type === 'shell') projectile(ctx, p.x, p.y - GUN_H * f, q.x, q.y - HIT_H * f, k, px, e.snd);
      else tracer(ctx, p.x, p.y - GUN_H * f, q.x, q.y - HIT_H * f, k, px, FLAK.test(e.snd ?? ''));
      break;
    }
    case 'intercept':
      intercept(ctx, p.x, p.y - AIRBURST_H * f, k, 10 * f, Math.max(0.8, f));
      break;
    case 'muzzle': {
      const q = at(e.x2 ?? e.x, e.y2 ?? e.y);
      const far = Math.hypot(q.x - p.x, q.y - p.y) > 2 && e.snd !== 'mortar';
      muzzle(ctx, p.x, p.y - GUN_H * f, far ? Math.atan2(q.y - p.y, q.x - p.x) : -Math.PI / 2, k, 4.2 * f);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

// ---------- Mörsergranate ----------

const ARC = (f) => 14 + 90 * Math.sin(Math.PI * f); // Flughöhe über dem Boden (wie der Iso-Renderer seit v4.x)

/** Zielring einer Mörsergranate am Boden (gestrichelt, mit Kreuz); Iso in der Bodenebene, 2D in drawShell. */
export function drawShellTarget(ctx, s, zoom = 1) {
  const z = zoom || 1;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,170,70,0.6)';
  ctx.lineWidth = 1.1 / z;
  ctx.setLineDash([3 / z, 3 / z]);
  ctx.beginPath();
  ctx.arc(s.tx, s.ty, 8, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(s.tx + dx * 4, s.ty + dy * 4);
    ctx.lineTo(s.tx + dx * 11, s.ty + dy * 11);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Granate an pts (Bildschirm- bzw. Weltpunkte der Flugbahn, ältester zuerst, letzter = Kopf): graue Rauchspur, Glühen am Heck,
 * dunkler Granatkörper entlang der Flugrichtung. u = Größe (Zeicheneinheiten je Einheit), lw = ein Pixel.
 */
function shellBody(ctx, pts, u, lw) {
  const n = pts.length;
  const [hx, hy] = pts[n - 1];
  const [qx, qy] = pts[Math.max(0, n - 2)];
  ribbon(ctx, pts, 6 * u, 1.4 * u, 0.6);
  const ang = Math.atan2(hy - qy, hx - qx);
  blob(ctx, '#ffc35c', hx - Math.cos(ang) * 2.2 * u, hy - Math.sin(ang) * 2.2 * u, 3.4 * u, 0.9);
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  ctx.fillStyle = '#2e302b';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8 * lw;
  ctx.beginPath();
  ctx.ellipse(0, 0, 3 * u, 1.35 * u, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(0.4 * u, -0.5 * u, 1.6 * u, 0.4 * u, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Punkte der Flugbahn kurz vor f (ältester zuerst) als [x, y] über proj(x, y, f). */
function trail(s, f, proj) {
  const pts = [];
  for (let i = 6; i >= 0; i--) {
    const fi = f - i * 0.028;
    if (fi < 0) continue;
    pts.push(proj(s.sx + (s.tx - s.sx) * fi, s.sy + (s.ty - s.sy) * fi, fi));
  }
  if (pts.length < 2) pts.unshift(proj(s.sx, s.sy, 0));
  return pts;
}

/**
 * Mörsergranate in der Luft von oben (2D, Weltkoordinaten): Zielring, Schatten am Boden (je höher, desto weiter versetzt und
 * blasser), darüber die Granate mit Rauchspur, im Scheitel etwas größer.
 */
export function drawShell(ctx, s, zoom = 1) {
  const z = zoom || 1;
  drawShellTarget(ctx, s, z);
  const f = s.duration ? clamp(s.t / s.duration, 0, 1) : 0;
  const h = ARC(f);
  const u = Math.max(1, 1.2 / z) * (1 + 0.35 * Math.sin(Math.PI * f));
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.28 - 0.14 * (h / 104)})`;
  ctx.beginPath();
  ctx.ellipse(s.x + h * 0.22, s.y + h * 0.3, 2.6 * u, 1.3 * u, Math.atan2(s.ty - s.sy, s.tx - s.sx), 0, TAU);
  ctx.fill();
  shellBody(ctx, trail(s, f, (x, y) => [x, y]), u, 1 / z);
  ctx.restore();
}

/** Mörsergranate in Iso (Bildschirmkoordinaten, Transformation dpr): Bogen über dem Boden mit Rauchspur. at wie drawEffectUp. */
export function drawShellIso(ctx, cam, s, at = (x, y) => cam.worldToScreen(x, y)) {
  const z = cam.zoom;
  const f = s.duration ? clamp(s.t / s.duration, 0, 1) : 0;
  ctx.save();
  shellBody(ctx, trail(s, f, (x, y, fi) => {
    const p = at(x, y);
    return [p.x, p.y - ARC(fi) * z];
  }), Math.max(1, 1.15 * z), 1);
  ctx.restore();
}

// ---------- Rauch und Feuer ----------

/**
 * Rauchsäule: weiche, von links oben beleuchtete Schwaden steigen vom Fußpunkt (x, y), treiben mit dem Wind nach rechts, werden
 * größer und heller. s = Grundgröße (Einheiten der aktuellen Transformation), k = Stärke 0–1, t = Zeit in s, seed je Quelle.
 */
export function drawSmoke(ctx, x, y, s, k, t, seed) {
  const n = 4 + Math.round(5 * k);
  const off = (Math.abs(seed) % 997) / 997;
  const list = [];
  for (let i = 0; i < n; i++) list.push((t * 0.22 + i / n + off) % 1);
  list.sort((a, b) => b - a); // alte (hohe) Schwaden zuerst, die jungen dunklen am Fuß davor
  ctx.save();
  for (const ph of list) {
    const r = s * (0.6 + 1.8 * ph);
    const px = x + s * (2.2 * ph + 0.4 * Math.sin(ph * 6 + off * 40));
    const py = y - s * 6.2 * ph;
    const a = (0.45 + 0.5 * k) * Math.pow(1 - ph, 1.05) * Math.min(1, ph * 7);
    blob(ctx, ph < 0.2 ? '#2e2c29' : ph < 0.5 ? '#54504c' : '#8a8782', px, py, r * 1.25, a, LIT);
  }
  ctx.restore();
}

/**
 * Nebelwand (Fähigkeit): dichte, helle Schwaden, die sich langsam am Ort wälzen statt aufzusteigen; unten grauer, oben fast weiß.
 * s = Größe eines Teils der Wand, k = Dichte 0–1 (Auf- und Abklingen), t = Zeit in s, seed je Teil.
 */
export function drawSmokeScreen(ctx, x, y, s, k, t, seed) {
  const off = ((Math.abs(seed) % 997) / 997) * TAU;
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const g = off + i * 1.7 + t * 0.15 * (i % 2 ? 1 : -1);
    const px = x + Math.cos(g) * s * 0.45 + Math.sin(t * 0.4 + i) * s * 0.1;
    const py = y + Math.sin(g) * s * 0.3 - s * (0.15 + 0.12 * i);
    blob(ctx, i < 2 ? '#b9b6ae' : '#e4e1da', px, py, s * (1.05 + 0.2 * Math.sin(t * 0.7 + i * 2 + off)), 0.55 * k, LIT);
  }
  ctx.restore();
}

/** Feuer am Fußpunkt (x, y): Lichtschein, vier flackernde Flammenzungen (rot, orange, gelb) und aufsteigende Funken. */
export function drawFire(ctx, x, y, s, t, seed) {
  const off = (Math.abs(seed) % 101) * 0.7;
  ctx.save();
  blob(ctx, '#ff9a3c', x, y - s * 0.5, s * 2.1, 0.26 + 0.07 * Math.sin(t * 13 + off));
  ctx.globalAlpha = 1;
  const tongue = (fx, w, h, sway, col, a) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(fx - w, y);
    ctx.quadraticCurveTo(fx - w * 1.05, y - h * 0.55, fx + sway, y - h);
    ctx.quadraticCurveTo(fx + w * 1.05, y - h * 0.55, fx + w, y);
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < 4; i++) {
    const c = Math.abs(i - 1.5);
    const fl = 0.7 + 0.3 * Math.sin(t * (9 + i * 2.7) + off + i * 1.7);
    const h = s * (1.55 - c * 0.38) * fl;
    const w = s * (0.34 - c * 0.06);
    const fx = x + (i - 1.5) * s * 0.3;
    const sway = Math.sin(t * 7 + i * 1.3 + off) * s * 0.14;
    tongue(fx, w, h, sway, '#d2401a', 0.85);
    tongue(fx, w * 0.72, h * 0.74, sway * 0.8, '#f2862a', 0.85);
    tongue(fx, w * 0.42, h * 0.46, sway * 0.6, '#ffd66e', 0.9);
  }
  ctx.fillStyle = '#ffb347';
  for (let j = 0; j < 4; j++) {
    const ph = (t * 0.55 + j / 4 + off) % 1;
    ctx.globalAlpha = (1 - ph) * 0.9;
    ctx.beginPath();
    ctx.arc(x + Math.sin(j * 2.3 + off + ph * 3) * s * 0.5 + ph * s * 0.4, y - s * (1 + 3 * ph), Math.max(0.35, s * 0.07) * (1 - ph * 0.6), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- Krater und Brandflecken ----------

/** Unregelmäßiger Ring von Punkten um (x, y) mit Halbmesser r (Abweichung j), n Punkte, als Pfad. */
function lobes(ctx, rnd, x, y, r, j, n, sy = 1) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const g = (i / n) * TAU;
    const rr = r * (1 - j / 2 + rnd() * j);
    if (i) ctx.lineTo(x + Math.cos(g) * rr, y + Math.sin(g) * rr * sy);
    else ctx.moveTo(x + Math.cos(g) * rr, y + Math.sin(g) * rr * sy);
  }
  ctx.closePath();
}

/**
 * Krater bzw. Brandfleck am Boden (Weltkoordinaten, auch Iso-Bodenebene). Bis Halbmesser 30 ein Krater: Rußhof, heller Auswurf
 * mit Lappen, dunkle Mulde mit beleuchteter Innenwand rechts unten, verstreute Erdbrocken. Größer (unter Gebäudetrümmern) ein
 * Brandfleck mit Rußstrahlen und Asche. a = Deckkraft.
 */
export function drawCrater(ctx, c, a = 1) {
  const rnd = scarRng(c.id);
  const r = c.r;
  const x = c.x;
  const y = c.y;
  ctx.save();
  blob(ctx, '#17130f', x, y, r * 1.45, 0.55 * a); // Rußhof
  ctx.globalAlpha = a;
  if (r > 30) {
    ctx.fillStyle = 'rgba(16,13,10,0.2)';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const g = (i / 16) * TAU + rnd() * 0.3;
      const len = r * (0.75 + rnd() * 0.45);
      const w = 0.05 + rnd() * 0.06;
      ctx.moveTo(x + Math.cos(g - w) * r * 0.3, y + Math.sin(g - w) * r * 0.3);
      ctx.lineTo(x + Math.cos(g) * len, y + Math.sin(g) * len);
      ctx.lineTo(x + Math.cos(g + w) * r * 0.3, y + Math.sin(g + w) * r * 0.3);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(14,12,10,0.5)';
    lobes(ctx, rnd, x, y, r * 0.6, 0.3, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,146,138,0.4)'; // Asche
    for (let i = 0; i < 16; i++) {
      const g = rnd() * TAU;
      const d = r * rnd() * 0.7;
      const s = 1 + rnd() * 2.2;
      ctx.fillRect(x + Math.cos(g) * d, y + Math.sin(g) * d, s, s * 0.7);
    }
    ctx.restore();
    return;
  }
  // Auswurf: heller Erdwall mit Lappen, die Seite zum Licht (links oben) heller
  ctx.fillStyle = 'rgba(112,94,68,0.62)';
  lobes(ctx, rnd, x, y, r * 1.05, 0.34, 18);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,128,96,0.42)';
  lobes(ctx, rnd, x - r * 0.12, y - r * 0.12, r * 0.86, 0.3, 14);
  ctx.fill();
  // Mulde: dunkel, Innenwand rechts unten beleuchtet
  ctx.fillStyle = '#2a231c';
  lobes(ctx, rnd, x, y, r * 0.66, 0.22, 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(126,104,78,0.55)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.13, y + r * 0.13, r * 0.46, r * 0.42, 0.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1c1814';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.05, y - r * 0.05, r * 0.4, r * 0.36, 0.6, 0, TAU);
  ctx.fill();
  // Erdbrocken
  for (let i = 0; i < 9; i++) {
    const g = rnd() * TAU;
    const d = r * (1 + rnd() * 0.75);
    const s = 1 + rnd() * r * 0.08;
    ctx.fillStyle = i % 3 ? '#4a3d2e' : '#7b6a52';
    ctx.save();
    ctx.translate(x + Math.cos(g) * d, y + Math.sin(g) * d);
    ctx.rotate(rnd() * TAU);
    ctx.fillRect(-s / 2, -s / 3, s, s * 0.7);
    ctx.restore();
  }
  ctx.restore();
}

// ---------- Wracks und Trümmer von oben ----------

const WRECK = '#2b2825'; // ausgebrannter Rumpf
const WRECK_DARK = '#191715';
const WRECK_LIGHT = '#4a443d';

/** Fahrzeugwrack von oben ohne Modell (Ersatz für drawWreckTop in unitpaint.js): Rumpf, verdrehter Turm bzw. Heckausleger. */
export function drawWreck(ctx, w, zoom = 1, a = 1) {
  const rnd = scarRng(w.id);
  const z = zoom || 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(w.x, w.y);
  ctx.rotate(w.angle);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1 / z;
  if (w.air) {
    const len = w.type === 'transporter' ? 24 : w.type === 'gunship' ? 20 : 15;
    const wid = w.type === 'transporter' ? 7 : 6;
    ctx.fillStyle = WRECK_DARK;
    ctx.save();
    ctx.rotate(0.5 + rnd() * 0.6); // Heckausleger abgeknickt
    ctx.fillRect(-len * 0.95, -1.2, len * 0.55, 2.4);
    ctx.restore();
    ctx.fillStyle = WRECK;
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.5, wid, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = WRECK_LIGHT;
    ctx.lineWidth = 1.4 / z;
    ctx.beginPath();
    const r0 = rnd() * Math.PI;
    for (let k = 0; k < 2; k++) {
      const ang = r0 + k * 1.9;
      const l = len * (0.45 + rnd() * 0.35);
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * l, Math.sin(ang) * l);
    }
    ctx.stroke();
  } else {
    const tracked = w.type === 'tank' || w.type === 'ifv' || w.type === 'engineer';
    const hl = w.type === 'tank' ? 14 : w.type === 'ifv' ? 12 : 9;
    const hw = w.type === 'tank' ? 9 : w.type === 'ifv' ? 7 : 6;
    if (tracked) {
      ctx.fillStyle = WRECK_DARK;
      ctx.fillRect(-hl, -hw - 3, hl * 2, 3);
      ctx.fillRect(-hl, hw, hl * 2 * (0.55 + rnd() * 0.3), 3); // eine Kette gerissen
    }
    ctx.fillStyle = WRECK;
    ctx.fillRect(-hl + 1, -hw, hl * 2 - 2, hw * 2);
    ctx.strokeRect(-hl + 1, -hw, hl * 2 - 2, hw * 2);
    ctx.fillStyle = WRECK_LIGHT;
    ctx.fillRect(-hl * 0.5, -hw * 0.5, hl * 0.6, hw * 0.4); // Rostfleck
    if (w.type === 'tank' || w.type === 'ifv') {
      ctx.rotate(rnd() * TAU); // Turm verdreht
      ctx.fillStyle = WRECK_DARK;
      ctx.fillRect(0, -1.3, w.type === 'tank' ? 16 : 10, 2.6);
      ctx.fillStyle = WRECK;
      ctx.beginPath();
      ctx.arc(0, 0, w.type === 'tank' ? 6.5 : 5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Gebäudetrümmer von oben (Weltkoordinaten): verkohlter Boden, Schutthügel mit heller Lichtseite, eine stehende Mauerecke,
 * verkohlte Balken und verstreute Brocken; Mauern und Tore (small) nur ein Betonschutthaufen; eingestürzte Stadthäuser (ruin)
 * staubig mit Ziegeln, Holzbalken und einer Mauerecke in der Wandfarbe (wall).
 */
export function drawWreckRubble(ctx, w, a = 1) {
  const rnd = scarRng(w.id);
  const x0 = w.x - w.w / 2;
  const y0 = w.y - w.h / 2;
  const W = w.w;
  const H = w.h;
  ctx.save();
  ctx.globalAlpha = a;
  // Boden: verkohlt bzw. Betonstaub, unregelmäßiger Rand
  ctx.fillStyle = w.small ? '#7d786f' : w.ruin ? '#7a7367' : '#34302b';
  ctx.beginPath();
  const edge = () => 2 + rnd() * 4;
  const pts = [];
  for (let i = 0; i < 8; i++) pts.push([x0 + (W * i) / 8, y0 + edge()]);
  for (let i = 0; i < 8; i++) pts.push([x0 + W - edge(), y0 + (H * i) / 8]);
  for (let i = 8; i > 0; i--) pts.push([x0 + (W * i) / 8, y0 + H - edge()]);
  for (let i = 8; i > 0; i--) pts.push([x0 + edge(), y0 + (H * i) / 8]);
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  const cols = w.small ? ['#9b958a', '#868076', '#aaa498'] : w.ruin ? ['#a39c90', '#8f887c', '#b3aa9b', '#9a6a52'] : ['#6b655c', '#5a554e', '#7a736a', '#8a7f70'];
  // Schutthügel: Schatten rechts unten, Körper, Lichtseite links oben
  const n = w.small ? 2 : clamp(Math.round((W * H) / 2600), 3, 8);
  for (let i = 0; i < n; i++) {
    const r = Math.min(W, H) * (w.small ? 0.3 : 0.12 + rnd() * 0.12);
    const cx = x0 + r + rnd() * Math.max(1, W - 2 * r);
    const cy = y0 + r + rnd() * Math.max(1, H - 2 * r);
    const col = cols[i % cols.length];
    const seed = rnd() * 1e6;
    const heap = (dx, dy, k, fill) => {
      const rr = scarRng(seed);
      ctx.fillStyle = fill;
      lobes(ctx, rr, cx + dx, cy + dy, r * k, 0.45, 11);
      ctx.fill();
    };
    heap(r * 0.18, r * 0.22, 1, 'rgba(0,0,0,0.35)');
    heap(0, 0, 1, col);
    heap(-r * 0.2, -r * 0.22, 0.58, tint(col, 0.2));
  }
  if (!w.small) {
    // Mauerecke: zwei Wandstücke an einer Ecke, oben hell, Bruchkante gezackt
    const ex = rnd() < 0.5 ? x0 + 4 : x0 + W - 4;
    const ey = rnd() < 0.5 ? y0 + 4 : y0 + H - 4;
    const sx = ex < w.x ? 1 : -1;
    const sy = ey < w.y ? 1 : -1;
    const lx = W * (0.35 + rnd() * 0.25);
    const ly = H * (0.3 + rnd() * 0.25);
    ctx.lineCap = 'butt';
    const wall = w.wall ?? '#8c867b';
    for (const [col, wd] of [['rgba(0,0,0,0.4)', 7], [wall, 5], [tint(wall, 0.3), 2]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = wd;
      ctx.beginPath();
      ctx.moveTo(ex + sx * lx, ey);
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex, ey + sy * ly);
      ctx.stroke();
    }
    // Balken: verkohlt, bei eingestürzten Häusern Holz
    ctx.strokeStyle = w.ruin ? '#5b4631' : '#1e1a16';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const bx = x0 + 8 + rnd() * (W - 16);
      const by = y0 + 8 + rnd() * (H - 16);
      const g = rnd() * Math.PI;
      const l = Math.min(W, H) * (0.18 + rnd() * 0.2);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(g) * l, by + Math.sin(g) * l);
    }
    ctx.stroke();
  }
  // Brocken
  const m = clamp(Math.round((W * H) / 450), 6, 26);
  for (let i = 0; i < m; i++) {
    const s = 2 + rnd() * Math.min(7, W * 0.08);
    ctx.fillStyle = i % 4 ? cols[i % cols.length] : w.small || w.ruin ? '#cfc9bd' : '#3f3a34';
    ctx.save();
    ctx.translate(x0 + 3 + rnd() * (W - 6), y0 + 3 + rnd() * (H - 6));
    ctx.rotate(rnd() * TAU);
    ctx.fillRect(-s / 2, -s / 3, s, s * 0.66);
    ctx.restore();
  }
  ctx.restore();
}

// ---------- Mine ----------

/** Eigene Mine: Panzermine (olivgrüne Scheibe mit Rand, Druckplatte, Zünderkappe mit rotem Punkt); der Gegner sieht sie nicht. */
export function drawMine(ctx, x, y, z) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x + 1.2 * z, y + 1.4 * z, 9 * z, 6 * z, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3c402e';
  ctx.beginPath();
  ctx.ellipse(x, y, 9 * z, 6 * z, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(0.6, 0.8 * z);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y, 7.6 * z, 5 * z, 0, Math.PI * 0.95, Math.PI * 1.7);
  ctx.stroke();
  ctx.fillStyle = shade('#5a5f45', 0.05);
  ctx.beginPath();
  ctx.ellipse(x, y, 5.4 * z, 3.6 * z, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#26281f';
  ctx.beginPath();
  ctx.ellipse(x, y, 2.2 * z, 1.5 * z, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e04030';
  ctx.beginPath();
  ctx.arc(x, y - 0.2 * z, 1.1 * z, 0, TAU);
  ctx.fill();
  ctx.restore();
}
