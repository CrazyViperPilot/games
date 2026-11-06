// Kleinkram der Karte gemalt (seit v5.43, Daniels Wunsch „eine Gruppe nach der anderen“): geparkte Autos (Limousine, Kombi,
// Kleinwagen, Transporter), Parkbänke und Versorgungskisten, seit v5.44 auch Heu- und Strohballen auf Weiden und Stoppelfeldern. Autos und Bänke sind kleine 3D-Modelle aus Körpern wie die Einheiten
// (Mini-Renderer PAINT aus unitpaint.js, Licht der Gebäude), die Kiste ist mit den Bauteilen der Gebäude gemalt (isokit.js).
// Jede Variante wird je Maßstab und Blickrichtung einmal in ein Bild gemalt (spritecache.js) und danach nur kopiert.
// Iso: Autos in 4 Richtungen (sie stehen an x oder y ausgerichtet), Bänke in 16 Richtungen (folgen dem Rundweg), Kisten je Drehung.
// Damit Räder, Radkästen und Lehnen richtig vor oder hinter der Karosserie liegen, malt jedes Modell seine Teile je Blickrichtung
// in fester Reihenfolge (Gruppen statt Sortierung nach der Mitte). Schatten in Iso: Umriss von oben flach am Boden (wie die
// Einheiten). 2D: dasselbe Modell genau von oben, frei gedreht, mit Umriss-Schatten. Nur Darstellung, keine Spielregel.
import { PAINT } from './unitpaint.js';
import { sprite, blit, spriteDpr } from './spritecache.js';
import { setIsoAt } from './iso.js';
import { box as kbox, FACE, flat, G, lit, onFace, OUTLINE, poly, rectF, stroke } from './isokit.js';

const TAU = Math.PI * 2;
const K = Math.SQRT1_2;
const { box, cyl, loft, prX, prY, on, fine, paintSolids, boundsOf, viewAngle, sectorOf, nearKeys, getSprite, mix } = PAINT;
const hashXY = (x, y) => (Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(y) | 0, 19349663)) >>> 0;
const SNOW = '#eef2f4';
const seasonKey = (season) => (season === 'winter' ? 'w' : 's');

/** Gruppen nacheinander malen (innerhalb einer Gruppe sortiert der Mini-Renderer nach der Tiefe). */
function paintGroups(ctx, groups, yaw, view) {
  for (const grp of groups) if (grp.length) paintSolids(ctx, grp, yaw, view);
}

/** Welche Seite (+y) und welches Ende (+x) eines Modells im Iso-Bild vorn liegen, wenn es um yaw gedreht ist. */
const nearSide = (yaw) => (Math.cos(yaw) - Math.sin(yaw) > 0 ? 1 : -1);
const nearEnd = (yaw) => (Math.cos(yaw) + Math.sin(yaw) > 0 ? 1 : -1);

/** Iso: Umriss von oben (Bild key) flach auf dem Boden unter (x, y), um angle gedreht, k Welt-Pixel je Modelleinheit. */
function groundShadow(ctx, cam, dpr, e, x, y, angle, k, alpha) {
  const p = cam.worldToScreen(x, y);
  setIsoAt(ctx, cam, dpr, p.x, p.y, x, y, k);
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  blit(ctx, e, 0, 0, 1);
  ctx.globalAlpha = 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** 2D: Modellbild e (und Schatten sh) bei (x, y), um angle gedreht, k Welt-Pixel je Modelleinheit; ohne Canvas direkt malen. */
function placeTop(ctx, e, sh, x, y, angle, k, off, direct) {
  ctx.save();
  ctx.translate(x, y);
  if (sh) {
    ctx.save();
    ctx.translate(off, off * 1.2);
    ctx.rotate(angle);
    ctx.scale(k, k);
    ctx.globalAlpha = 0.3;
    blit(ctx, sh, 0, 0, 1);
    ctx.restore();
  }
  ctx.rotate(angle);
  ctx.scale(k, k);
  if (e) blit(ctx, e, 0, 0, 1);
  else direct(ctx);
  ctx.restore();
}

// ---------- Geparkte Autos ----------
// Modellkoordinaten: x nach vorn, y nach rechts, z nach oben (Modelleinheiten; im Bild × CAR_ISO bzw. × CAR_TOP Welt-Pixel).

const CAR_ISO = 1.5; // Iso: wie die Einheiten etwas größer als die Grundfläche (so groß wie die früheren Bild-Autos)
const CAR_TOP = 1.35; // 2D
const CAR_PICK = ['sedan', 'sedan', 'sedan', 'estate', 'estate', 'hatch', 'hatch', 'van'];
const TYRE = '#1f2123';
const RIM = '#a9afb3';
const ARCH = '#17191b';
const CGLASS = '#2e4254';
const TRIM = '#35393c';
const GRILLE = '#26292c';
const HEAD = '#f3edcf';
const TAIL = '#b3322b';
const PLATE = '#e6e3d8';

/**
 * Formen: Seitenprofil der Karosserie [x, z], halbe Breite hw, Räder (x, Radius, Breite), Unterkante zb, Glashaus (Grundriss unten
 * lo und oben hi, halbe Breite wl/wh, Höhen z0/z1), Säulen (x-Bereiche), Türfugen, Spiegel, Lichter und Stoßfänger.
 */
const SHAPES = {
  sedan: {
    prof: [[-11.6, 1.25], [-11.75, 3.7], [-11.3, 4.75], [-7.4, 5.05], [5.8, 4.9], [9.9, 4.35], [11.5, 3.55], [11.7, 2.3], [11.6, 1.25]],
    l0: -11.75, l1: 11.7, hw: 4.9, zb: 1.25, wx: [7.3, -7.3], r: 2.15, tw: 1.35,
    cab: { lo: [-7.3, 4.9], hi: [-4.5, 1.5], wl: 4.45, wh: 3.75, z0: 4.95, z1: 8.3 },
    pil: [[-1.75, -1.05]], seams: [3.9, -1.4, -6.5], mir: [4.0, 4.9, 5.3, 6.1],
    head: [2.95, 3.6], grille: [2.35, 3.15], tail: [3.55, 4.35], bump: 2.35,
  },
  estate: {
    prof: [[-11.8, 1.25], [-11.95, 4.7], [-11.6, 5.15], [5.8, 4.9], [9.9, 4.35], [11.5, 3.55], [11.7, 2.3], [11.6, 1.25]],
    l0: -11.95, l1: 11.7, hw: 4.9, zb: 1.25, wx: [7.3, -7.4], r: 2.15, tw: 1.35,
    cab: { lo: [-11.3, 4.9], hi: [-10.8, 1.5], wl: 4.45, wh: 3.75, z0: 5.0, z1: 8.4 },
    pil: [[-1.75, -1.05], [-7.0, -6.3]], seams: [3.9, -1.4, -6.6], mir: [4.0, 4.9, 5.3, 6.1], rails: true,
    head: [2.95, 3.6], grille: [2.35, 3.15], tail: [3.7, 4.95], bump: 2.35,
  },
  hatch: {
    prof: [[-9.7, 1.15], [-9.85, 4.9], [-9.5, 5.35], [4.9, 5.1], [8.3, 4.45], [9.65, 3.4], [9.85, 2.2], [9.75, 1.15]],
    l0: -9.85, l1: 9.85, hw: 4.6, zb: 1.15, wx: [6.3, -6.1], r: 1.95, tw: 1.25,
    cab: { lo: [-9.3, 4.1], hi: [-8.6, 0.9], wl: 4.15, wh: 3.55, z0: 5.2, z1: 8.9 },
    pil: [[-2.75, -2.05]], seams: [3.3, -2.4], mir: [3.3, 4.1, 5.5, 6.3],
    head: [2.85, 3.5], grille: [2.25, 3.05], tail: [3.85, 4.85], bump: 2.25,
  },
  van: {
    prof: [[-12.7, 1.45], [-12.8, 11.3], [-12.3, 11.8], [7.0, 11.8], [7.9, 11.3], [11.6, 7.1], [12.6, 5.9], [12.8, 3.0], [12.75, 1.45]],
    l0: -12.8, l1: 12.8, hw: 5.3, zb: 1.45, wx: [8.6, -8.6], r: 2.35, tw: 1.45,
    cab: null,
    seams: [6.3, 3.4, -2.6], mir: [9.8, 10.6, 7.6, 8.8], strip: [3.3, 4.0],
    head: [4.7, 5.55], grille: [3.4, 4.85], tail: [3.0, 6.6], bump: 2.8,
  },
};

/** Radkasten: Bogen um die Radmitte (x, zc) mit Radius r, nur oberhalb der Unterkante zb (Profil [x, z]). */
function archProfile(x, zc, r, zb) {
  const a0 = Math.asin(Math.max(-1, Math.min(1, (zb - zc) / r)));
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = a0 + ((Math.PI - 2 * a0) * i) / 10;
    pts.push([x + Math.cos(a) * r, zc + Math.sin(a) * r]);
  }
  return pts;
}

/** Rechteck-Grundriss x0 … x1, y ±w (für loft). */
const rect = (x0, x1, w) => [[x0, -w], [x1, -w], [x1, w], [x0, w]];

/** Dünne Platte auf der schrägen Strecke a → b eines Seitenprofils (Frontscheibe des Transporters), quer von −w bis w. */
function slab(a, b, w, col, t0 = 0.08, t1 = 0.92) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz);
  const nx = dz / l;
  const nz = -dx / l;
  const s = nx * (a[0] + b[0]) + nz * (a[1] + b[1]) < 0 ? -1 : 1; // Normale nach außen (weg von der Mitte)
  const P = (t, o) => [a[0] + dx * t + s * nx * o, a[1] + dz * t + s * nz * o];
  return prX([P(t0, 0.02), P(t1, 0.02), P(t1, 0.13), P(t0, 0.13)], -w, w, col, { noLine: true });
}

const carModels = new Map();

/**
 * Auto als Gruppen von Körpern. v = 'top' (2D: alles, nach Höhe sortiert) oder Blickrichtung `${Seite}${Ende}` ('+', '-'): dann
 * liegen hintere Räder unten, Radkästen, vordere Räder, Spiegel, Lichter und Stoßfänger der vorderen Seite und des vorderen Endes
 * kommen nach der Karosserie. season 'w': Schnee auf Dach, Motorhaube und Kofferraum.
 */
function carModel(kind, col, v, season) {
  const key = `${kind}|${col}|${v}|${season}`;
  let m = carModels.get(key);
  if (m) return m;
  const D = SHAPES[kind];
  const top = v === 'top';
  const sides = top ? [-1, 1] : [v[0] === '+' ? 1 : -1];
  const ends = top ? [-1, 1] : [v[1] === '+' ? 1 : -1];
  const snow = season === 'w' ? { top: { col: SNOW, at: 0.62 } } : {};
  const hw = D.hw;
  const far = [];
  const body = [prX(D.prof, -hw, hw, col, snow)];
  const ends1 = [];
  const glass = [];
  const roof = [];
  const side = [];
  const tyre = (x, sd, o = {}) => cyl([x, sd * (hw - D.tw), D.r], [x, sd * (hw + 0.02), D.r], D.r, D.r, 12, TYRE, o);
  // hintere Räder (nur der untere Rand ist unter der Karosserie zu sehen)
  if (!top) for (const x of D.wx) far.push(tyre(x, -sides[0], { under: true }));
  // Stoßfänger, Lichter, Kühlergrill und Kennzeichen an den vorderen Enden
  for (const e of ends) {
    const x = e > 0 ? D.l1 : D.l0;
    ends1.push(box(x - e * 0.55, x + e * 0.3, -hw + 0.12, hw - 0.12, D.zb, D.bump, TRIM));
    for (const sd of [-1, 1]) {
      const y0 = sd * (hw - (kind === 'van' && e < 0 ? 1.0 : 1.55));
      const y1 = sd * (hw - 0.32);
      const [z0, z1] = e > 0 ? D.head : D.tail;
      ends1.push(box(x - e * 0.45, x + e * 0.06, Math.min(y0, y1), Math.max(y0, y1), z0, z1, e > 0 ? HEAD : TAIL, { noLine: true }));
    }
    if (e > 0) ends1.push(box(x - 0.35, x + 0.04, -hw + 1.75, hw - 1.75, D.grille[0], D.grille[1], GRILLE, { noLine: true }));
    const pz = e > 0 ? D.zb + 0.2 : D.bump + 0.15;
    ends1.push(fine(box(x + e * 0.3, x + e * 0.38, -1.15, 1.15, pz, pz + 0.62, PLATE, { noLine: true })));
  }
  // Glashaus mit Dach und Säulen (Transporter: Frontscheibe und Seitenfenster auf dem Kasten)
  if (D.cab) {
    const C = D.cab;
    glass.push(loft(rect(C.lo[0], C.lo[1], C.wl), rect(C.hi[0], C.hi[1], C.wh), C.z0, C.z1, CGLASS));
    roof.push(loft(rect(C.hi[0] - 0.12, C.hi[1] + 0.12, C.wh + 0.12), rect(C.hi[0] + 0.3, C.hi[1] - 0.3, C.wh - 0.35), C.z1 - 0.02, C.z1 + 0.42, col, snow));
    for (const [p0, p1] of D.pil) roof.push(loft(rect(p0, p1, C.wl + 0.07), rect(p0 + 0.1, p1 - 0.1, C.wh + 0.07), C.z0 + 0.05, C.z1, col));
    if (D.rails) for (const sd of [-1, 1]) roof.push(fine(box(C.hi[0] + 0.6, C.hi[1] - 0.8, sd * (C.wh - 0.65) - 0.18, sd * (C.wh - 0.65) + 0.18, C.z1 + 0.4, C.z1 + 0.75, '#2b2e30', { noLine: true })));
  } else {
    glass.push(slab([7.9, 11.3], [11.6, 7.1], hw - 0.55, CGLASS));
    for (const sd of sides) {
      const y = sd * (hw + 0.02);
      glass.push(prX([[6.5, 7.7], [10.4, 7.7], [7.85, 10.9], [6.5, 10.9]], Math.min(y, y + sd * 0.08), Math.max(y, y + sd * 0.08), CGLASS, { noLine: true }));
    }
  }
  // vordere Seite: Schweller, Türfugen, Spiegel, Radkästen, Räder mit Felgen
  for (const sd of sides) {
    const y0 = sd * hw;
    const y1 = sd * (hw + 0.04);
    const ys = [Math.min(y0, y1), Math.max(y0, y1)];
    side.push(box(D.l0 + 2.4, D.l1 - 2.4, ...ys, D.zb, D.zb + 0.6, TRIM, { noLine: true, only: 'iso' }));
    if (D.strip) side.push(box(D.l0 + 0.4, D.l1 - 0.5, ...ys, D.strip[0], D.strip[1], TRIM, { noLine: true, only: 'iso' }));
    for (const x of D.seams) side.push(fine(box(x - 0.05, x + 0.05, ...ys, D.zb + 0.7, (D.cab ? D.cab.z0 : 10.9) - 0.15, mix(col, '#000000', 0.35), { noLine: true, only: 'iso' })));
    const [mx0, mx1, mz0, mz1] = D.mir;
    const my = [sd * (hw - 0.1), sd * (hw + 0.85)];
    side.push(fine(box(mx0, mx1, Math.min(...my), Math.max(...my), mz0, mz1, col)));
    for (const x of D.wx) {
      const yy = [sd * (hw + 0.05), sd * (hw + 0.09)];
      if (!top) side.push(prX(archProfile(x, D.r, D.r + 0.45, D.zb), Math.min(...yy), Math.max(...yy), ARCH, { noLine: true }));
      side.push(tyre(x, sd));
      const yh = [sd * (hw + 0.02), sd * (hw + 0.1)];
      side.push(cyl([x, Math.min(...yh), D.r], [x, Math.max(...yh), D.r], D.r * 0.56, D.r * 0.56, 8, RIM, { noLine: true }));
      if (!top) side.push(fine(cyl([x, Math.min(...yh), D.r], [x, Math.max(...yh) + sd * 0.04, D.r], D.r * 0.2, D.r * 0.2, 6, '#5a6064', { noLine: true })));
    }
  }
  if (top) {
    const S = [...side, ...body, ...ends1, ...glass, ...roof];
    m = { S, groups: [S] };
  } else {
    // Reihenfolge: hinten, Karosserie, vordere Enden, Glas, Dach, vordere Seite (Räder liegen über der Karosserie)
    const groups = [far, body, ends1, glass, roof];
    for (const s of side) groups.push([s]);
    m = { S: groups.flat(), groups };
  }
  carModels.set(key, m);
  return m;
}

/** Aussehen eines geparkten Autos (fest je Lage): Form und Richtung (an x oder y, nach vorn oder hinten). */
function carLook(c) {
  const h = hashXY(c.x, c.y);
  return { kind: CAR_PICK[(h >>> 5) % CAR_PICK.length], angle: (c.vertical ? Math.PI / 2 : 0) + ((h >>> 11) & 1 ? Math.PI : 0) };
}

const colorOf = (c) => (typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#b8b8b0');

/** Geparktes Auto der Karte in Iso (Fuß am Weltpunkt). false = noch kein Bild (der Renderer zeichnet solange den einfachen Ersatz). */
export function drawMapCarIso(ctx, cam, c, season = 'summer') {
  const L = carLook(c);
  const col = colorOf(c);
  const sec = sectorOf(viewAngle(cam, L.angle), 4);
  const yaw = (sec / 4) * TAU;
  const sn = seasonKey(season);
  const m = carModel(L.kind, col, `${nearSide(yaw) > 0 ? '+' : '-'}${nearEnd(yaw) > 0 ? '+' : '-'}`, sn);
  const f = cam.zoom * CAR_ISO;
  const e = sprite(`mc|${L.kind}|${col}|${sn}|${sec}`, f * spriteDpr(), boundsOf(m, m.S, yaw, true), (cx, s) => paintGroups(cx, m.groups, yaw, { iso: true, s }));
  if (e === false) return false;
  const p = cam.worldToScreen(c.x, c.y);
  if (e) blit(ctx, e, p.x, p.y, f);
  else {
    ctx.save();
    ctx.translate(p.x, p.y);
    paintGroups(ctx, m.groups, yaw, { iso: true, s: f });
    ctx.restore();
  }
  return true;
}

/** Iso: Schatten eines Autos (Umriss von oben am Boden). false = noch kein Bild. */
export function drawMapCarShadowIso(ctx, cam, c, dpr) {
  const L = carLook(c);
  const m = carModel(L.kind, '#808080', 'top', 's');
  const e = sprite(`mcs|${L.kind}`, cam.zoom * CAR_ISO * spriteDpr(), boundsOf(m, m.S, 0, false), (cx, s) => paintSolids(cx, m.S, 0, { iso: false, s, shadow: true }));
  if (!e) return false;
  groundShadow(ctx, cam, dpr, e, c.x, c.y, L.angle, CAR_ISO, 0.34);
  return true;
}

/** Geparktes Auto von oben (2D, Weltkoordinaten, Kamera-Transformation gesetzt). false = noch kein Bild. */
export function drawMapCarTop(ctx, c, zoom = 1, season = 'summer') {
  const L = carLook(c);
  const col = colorOf(c);
  const sn = seasonKey(season);
  const m = carModel(L.kind, col, 'top', sn);
  const sc = zoom * spriteDpr() * CAR_TOP;
  const b = boundsOf(m, m.S, 0, false);
  const e = sprite(`mct|${L.kind}|${col}|${sn}`, sc, b, (cx, s) => paintSolids(cx, m.S, 0, { iso: false, s }));
  if (e === false) return false;
  const ms = carModel(L.kind, '#808080', 'top', 's');
  const sh = sprite(`mcs|${L.kind}`, sc, boundsOf(ms, ms.S, 0, false), (cx, s) => paintSolids(cx, ms.S, 0, { iso: false, s, shadow: true }));
  placeTop(ctx, e, sh, c.x, c.y, L.angle, CAR_TOP, 2.2, (cx) => paintSolids(cx, m.S, 0, { iso: false, s: zoom * CAR_TOP }));
  return true;
}

// ---------- Parkbänke ----------
// Modell in Welt-Pixeln: x entlang der Bank, y nach hinten (Lehne, zeigt vom Rundweg weg nach außen), z nach oben.

const IRON = '#2f3336';
const WOOD = '#a7784a';
const BENCH_N = 16; // Richtungen in Iso

const benchModels = new Map();

/**
 * Bank aus Gusseisen-Wangen (Beine, Sitzträger, Armlehnen, Lehnenstützen) und Holzlatten (drei im Sitz, zwei in der schrägen
 * Lehne). v: 'top' (2D), 'bn' (Lehne vorn: Betrachter hinter der Bank) oder 'bf' (Lehne hinten). season 'w': Schnee auf den Latten.
 */
function benchModel(v, season) {
  const key = `${v}|${season}`;
  let m = benchModels.get(key);
  if (m) return m;
  const snow = season === 'w' ? { top: { col: SNOW, at: 0.6 } } : {};
  const legs = [];
  const arms = [];
  const posts = [];
  for (const x of [-7.4, 7.4]) {
    legs.push(cyl([x, -2.3, 0], [x, -2.15, 4.3], 0.42, 0.36, 4, IRON));
    legs.push(cyl([x, 2.35, 0], [x, 2.2, 4.3], 0.42, 0.36, 4, IRON));
    legs.push(cyl([x, -2.75, 4.25], [x, 2.5, 4.25], 0.32, 0.32, 4, IRON)); // Sitzträger
    arms.push(cyl([x, -2.55, 4.5], [x, -2.85, 6.9], 0.3, 0.27, 4, IRON)); // Armlehnenstütze
    arms.push(cyl([x, -3.05, 6.95], [x, 2.55, 6.95], 0.36, 0.36, 4, IRON, snow)); // Armlehne
    posts.push(cyl([x, 2.2, 4.3], [x, 3.3, 10.2], 0.36, 0.3, 4, IRON)); // Lehnenstütze
  }
  const seat = [[-2.75, -1.3], [-1.05, 0.4], [0.65, 2.1]].map(([y0, y1]) => box(-9, 9, y0, y1, 4.45, 5.0, WOOD, snow));
  // Lehnenlatten vor den Stützen, in der Neigung der Lehne
  const d = [0.183, 0.983]; // Richtung der Stütze (y, z)
  const n = [-0.983, 0.183]; // nach vorn
  const back = [3.5, 5.4].map((t) => {
    const cy = 2.2 + d[0] * t + n[0] * 0.55;
    const cz = 4.3 + d[1] * t + n[1] * 0.55;
    const pt = (a, b) => [cy + d[0] * a + n[0] * b, cz + d[1] * a + n[1] * b];
    return prY([pt(-0.8, -0.25), pt(0.8, -0.25), pt(0.8, 0.25), pt(-0.8, 0.25)], -9, 9, mix(WOOD, '#000000', 0.06));
  });
  let groups;
  if (v === 'top') groups = [[...legs, ...seat, ...arms, ...posts, ...back]];
  else if (v === 'bn') groups = [legs, seat, arms, back, posts];
  else groups = [legs, posts, back, seat, arms];
  m = { S: groups.flat(), groups };
  benchModels.set(key, m);
  return m;
}

/** Drehung des Modells: Längsachse entlang des Rundwegs, Lehne (+y) nach außen (b.rx, b.ry). */
const benchYaw = (b) => Math.atan2(-b.rx, b.ry);

/** Parkbank in Iso (Fuß am Weltpunkt), in 16 Richtungen. false = noch kein Bild. */
export function drawBenchIso(ctx, cam, b, season = 'summer') {
  const sec = sectorOf(viewAngle(cam, benchYaw(b)), BENCH_N);
  const yaw = (sec / BENCH_N) * TAU;
  const sn = seasonKey(season);
  const m = benchModel(nearSide(yaw) > 0 ? 'bn' : 'bf', sn);
  const f = cam.zoom;
  const make = (k) => `bk|${sn}|${k}`;
  const e = getSprite(make(sec), f * spriteDpr(), boundsOf(m, m.S, yaw, true), (cx, s) => paintGroups(cx, m.groups, yaw, { iso: true, s }), nearKeys(make, sec, BENCH_N));
  if (e === false) return false;
  const p = cam.worldToScreen(b.x, b.y);
  if (e) blit(ctx, e, p.x, p.y, f);
  else {
    ctx.save();
    ctx.translate(p.x, p.y);
    paintGroups(ctx, m.groups, yaw, { iso: true, s: f });
    ctx.restore();
  }
  return true;
}

/** Iso: Schatten einer Bank (Umriss von oben am Boden). false = noch kein Bild. */
export function drawBenchShadowIso(ctx, cam, b, dpr) {
  const m = benchModel('top', 's');
  const e = sprite('bks', cam.zoom * spriteDpr(), boundsOf(m, m.S, 0, false), (cx, s) => paintSolids(cx, m.S, 0, { iso: false, s, shadow: true }));
  if (!e) return false;
  groundShadow(ctx, cam, dpr, e, b.x, b.y, benchYaw(b), 1, 0.26);
  return true;
}

/** Parkbank von oben (2D, Weltkoordinaten). false = noch kein Bild. */
export function drawBenchTop(ctx, b, zoom = 1, season = 'summer') {
  const sn = seasonKey(season);
  const m = benchModel('top', sn);
  const sc = zoom * spriteDpr();
  const bounds = boundsOf(m, m.S, 0, false);
  const e = sprite(`bkt|${sn}`, sc, bounds, (cx, s) => paintSolids(cx, m.S, 0, { iso: false, s }));
  if (e === false) return false;
  const ms = benchModel('top', 's');
  const sh = sprite('bks', sc, boundsOf(ms, ms.S, 0, false), (cx, s) => paintSolids(cx, ms.S, 0, { iso: false, s, shadow: true }));
  placeTop(ctx, e, sh, b.x, b.y, benchYaw(b), 1, 1.6, (cx) => paintSolids(cx, m.S, 0, { iso: false, s: zoom }));
  return true;
}

// ---------- Heu- und Strohballen (seit v5.44) ----------
// Rundballen liegend, Achse entlang x (Modelleinheiten = Welt-Pixel), Lage und Richtung aus fields.js (fieldBales).

const HAY = '#c2a65a';
const STRAW = '#dcc88a';
const BALE_R = 6.2;
const BALE_L = 10.5;
const BALE_N = 8; // Richtungen in Iso (der Ballen sieht von beiden Enden gleich aus)

const baleModels = new Map();

/**
 * Ballen: glatter Zylinder mit gewickelten Ringen an der Stirnseite. v: 'top' (2D, ohne Stirnseiten) oder '+' / '-' (welches Ende
 * im Iso-Bild vorn liegt: nur dort die Ringe, sonst schienen sie durch). season 'w': Schnee oben.
 */
function baleModel(kind, v, season) {
  const key = `${kind}|${v}|${season}`;
  let m = baleModels.get(key);
  if (m) return m;
  const col = kind === 'straw' ? STRAW : HAY;
  const snow = season === 'w' ? { top: { col: SNOW, at: 0.55 } } : {};
  const z = BALE_R;
  const body = cyl([-BALE_L / 2, 0, z], [BALE_L / 2, 0, z], BALE_R, BALE_R, 16, col, snow);
  const S = [body];
  if (v !== 'top') {
    const e = v === '+' ? 1 : -1;
    const x = (e * BALE_L) / 2;
    S.push(on(body, cyl([x, 0, z], [x + e * 0.05, 0, z], BALE_R * 0.78, BALE_R * 0.78, 16, mix(col, '#000000', 0.1))));
    S.push(on(body, cyl([x + e * 0.05, 0, z], [x + e * 0.1, 0, z], BALE_R * 0.5, BALE_R * 0.5, 14, mix(col, '#ffffff', 0.08))));
    S.push(on(body, cyl([x + e * 0.1, 0, z], [x + e * 0.15, 0, z], BALE_R * 0.22, BALE_R * 0.22, 10, mix(col, '#000000', 0.18))));
  }
  m = { S };
  baleModels.set(key, m);
  return m;
}

/** Ballen in Iso (Fuß am Weltpunkt) in 8 Richtungen. false = noch kein Bild. */
export function drawBaleIso(ctx, cam, b, season = 'summer') {
  const sec = sectorOf(viewAngle(cam, b.a), BALE_N);
  const yaw = (sec / BALE_N) * TAU;
  const sn = seasonKey(season);
  const m = baleModel(b.kind, nearEnd(yaw) > 0 ? '+' : '-', sn);
  const f = cam.zoom;
  const make = (k) => `bl|${b.kind}|${sn}|${k}`;
  const e = getSprite(make(sec), f * spriteDpr(), boundsOf(m, m.S, yaw, true), (cx, s) => paintSolids(cx, m.S, yaw, { iso: true, s }), nearKeys(make, sec, BALE_N));
  if (e === false) return false;
  const p = cam.worldToScreen(b.x, b.y);
  if (e) blit(ctx, e, p.x, p.y, f);
  else {
    ctx.save();
    ctx.translate(p.x, p.y);
    paintSolids(ctx, m.S, yaw, { iso: true, s: f });
    ctx.restore();
  }
  return true;
}

/** Iso: Schatten eines Ballens (Umriss von oben am Boden). false = noch kein Bild. */
export function drawBaleShadowIso(ctx, cam, b, dpr) {
  const m = baleModel('hay', 'top', 's');
  const e = sprite('bls', cam.zoom * spriteDpr(), boundsOf(m, m.S, 0, false), (cx, s) => paintSolids(cx, m.S, 0, { iso: false, s, shadow: true }));
  if (!e) return false;
  groundShadow(ctx, cam, dpr, e, b.x, b.y, b.a, 1, 0.3);
  return true;
}

/** Ballen von oben (2D, Weltkoordinaten). false = noch kein Bild. */
export function drawBaleTop(ctx, b, zoom = 1, season = 'summer') {
  const sn = seasonKey(season);
  const m = baleModel(b.kind, 'top', sn);
  const sc = zoom * spriteDpr();
  const e = sprite(`blt|${b.kind}|${sn}`, sc, boundsOf(m, m.S, 0, false), (cx, s) => paintSolids(cx, m.S, 0, { iso: false, s }));
  if (e === false) return false;
  const ms = baleModel('hay', 'top', 's');
  const sh = sprite('bls', sc, boundsOf(ms, ms.S, 0, false), (cx, s) => paintSolids(cx, ms.S, 0, { iso: false, s, shadow: true }));
  placeTop(ctx, e, sh, b.x, b.y, b.a, 1, 2.2, (cx) => paintSolids(cx, m.S, 0, { iso: false, s: zoom }));
  return true;
}

// ---------- Versorgungskisten ----------
// Olivgrüne Holzkiste mit dunklen Rahmenleisten, abgesetztem Deckel, zwei Spanngurten (über den Deckel und eine Seite), gelber
// Plombe und hellem Schablonen-Aufdruck. Gemalt in Einheiten einer Kiste mit 16 Welt-Pixeln Kantenlänge, im Bild × s / 16.

const CRATE = '#66713c';
const CRATE_LID = '#77844a';
const BATTEN = '#4e592c';
const STRAP = '#2c3120';
const SEAL = '#e8b830';
const STENCIL = '#e1dbbb';
const CA = 8; // halbe Kantenlänge
const CH = 11.5; // Höhe

/** Kiste isometrisch: Gurte laufen in der Welt entlang y, in der Ansicht also entlang v (gerade Drehung) oder u (ungerade). */
function crateIso(g, odd, shadowOn) {
  const { P } = g;
  const A = CA;
  const H = CH;
  if (shadowOn) flat(g, -A + 0.3, A + 1.2, -A + 0.6, A + 3.4, 'rgba(0,0,0,0.26)');
  kbox(g, -A, A, -A, A, 0, H, CRATE, CRATE);
  // Fugen der Bretter auf beiden sichtbaren Seiten
  for (const h of [H / 3, (2 * H) / 3]) stroke(g, [P(-A, A, h), P(A, A, h), P(A, -A, h)], 'rgba(28,32,14,0.42)', 0.28);
  // Rahmenleisten an den Kanten der sichtbaren Seiten
  const fr = 1.35;
  for (const face of ['s', 'e']) {
    const pt = onFace(g, face, A);
    const c = lit(BATTEN, ...FACE[face]);
    const q = (a0, a1, h0, h1) => poly(g, [pt(a0, h0, 0.04), pt(a1, h0, 0.04), pt(a1, h1, 0.04), pt(a0, h1, 0.04)], c, null);
    q(-A, -A + fr, 0, H);
    q(A - fr, A, 0, H);
    q(-A, A, 0, fr);
    q(-A, A, H - fr, H);
  }
  // Deckel: dunkler Rand, hellere Füllung mit Fugen
  const T = (u, v) => P(u, v, H + 0.02);
  poly(g, [T(-A, -A), T(A, -A), T(A, A), T(-A, A)], lit(BATTEN, ...FACE.top), null);
  const i = A - fr;
  poly(g, [T(-i, -i), T(i, -i), T(i, i), T(-i, i)], lit(CRATE_LID, ...FACE.top), null);
  for (const a of [-2.2, 2.2]) stroke(g, odd ? [T(a, -i), T(a, i)] : [T(-i, a), T(i, a)], 'rgba(30,36,14,0.35)', 0.22);
  // Spanngurte über den Deckel und die vordere Seite, in der sie liegen
  const strapFace = odd ? 'e' : 's';
  const sp = onFace(g, strapFace, A);
  const sc = lit(STRAP, ...FACE[strapFace]);
  for (const [a0, a1] of [[-3.7, -2.35], [2.35, 3.7]]) {
    const top = odd ? [T(-A, a0), T(A, a0), T(A, a1), T(-A, a1)] : [T(a0, -A), T(a1, -A), T(a1, A), T(a0, A)];
    poly(g, top, lit(STRAP, ...FACE.top), null);
    poly(g, [sp(a0, 0, 0.08), sp(a1, 0, 0.08), sp(a1, H, 0.08), sp(a0, H, 0.08)], sc, null);
    poly(g, [sp(a0, 4.6, 0.12), sp(a1, 4.6, 0.12), sp(a1, 5.6, 0.12), sp(a0, 5.6, 0.12)], lit('#8c8f86', ...FACE[strapFace]), null); // Schnalle
  }
  // Schablonen-Aufdruck auf der anderen Seite
  const stFace = odd ? 's' : 'e';
  const st = onFace(g, stFace, A);
  const stc = lit(STENCIL, ...FACE[stFace]);
  for (const [w, h0] of [[3.4, 7.0], [2.4, 5.5], [3.0, 4.0]]) poly(g, [st(-w, h0, 0.06), st(w, h0, 0.06), st(w, h0 + 0.75, 0.06), st(-w, h0 + 0.75, 0.06)], stc, null);
  // gelbe Plombe in der Mitte
  kbox(g, -1.1, 1.1, -1.1, 1.1, H, H + 0.6, SEAL, SEAL, 'rgba(60,44,0,0.6)');
  // Umriss
  stroke(g, [P(-A, A, 0), P(A, A, 0), P(A, -A, 0), P(A, -A, H), P(-A, -A, H), P(-A, A, H), P(-A, A, 0)], OUTLINE, 0.5);
}

const CRATE_ISO_BOUNDS = [-(CA + CA + 3.4) * K - 1.5, -(2 * CA) * K * 0.5 - CH - 2, (CA + 1.2 + CA) * K + 1.5, (CA + 1.2 + CA + 3.4) * K * 0.5 + 1.5];

/**
 * Versorgungskiste in Iso: Kantenlänge s (Welt-Pixel), base = Höhe über dem Boden (auf dem Rücken eines Trägers), glow = liegt am
 * Boden (pulsierender Schimmer, damit man sie findet). false = noch kein Bild.
 */
export function drawCrateIso(ctx, cam, x, y, s = 16, base = 0, glow = 0) {
  const odd = (cam.rot | 0) % 2 === 1 ? 1 : 0;
  const sh = base > 0 ? 0 : 1;
  const f = (cam.zoom * s) / 16;
  const e = sprite(`cr|${odd}|${sh}`, f * spriteDpr(), CRATE_ISO_BOUNDS, (cx, sc) => crateIso(G(cx, sc), odd, sh));
  if (e === false) return false;
  const p = cam.worldToScreen(x, y);
  if (glow > 0) {
    ctx.fillStyle = `rgba(232,184,48,${(0.22 * glow).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s * 1.4 * cam.zoom, s * 0.7 * cam.zoom, 0, 0, TAU);
    ctx.fill();
  }
  const py = p.y - base * cam.zoom;
  if (e) blit(ctx, e, p.x, py, f);
  else {
    ctx.save();
    ctx.translate(p.x, py);
    crateIso(G(ctx, f), odd, sh);
    ctx.restore();
  }
  return true;
}

/** Kiste von oben in Einheiten (Mitte im Ursprung): Schatten, Rahmen, Deckel mit Fugen, Gurte entlang y, Plombe. */
function crateTop(c) {
  const A = CA;
  const i = A - 1.35;
  rectF(c, -A + 1.6, -A + 2, A + 1.6, A + 2, 'rgba(0,0,0,0.3)');
  rectF(c, -A, -A, A, A, BATTEN);
  rectF(c, -i, -i, i, i, CRATE_LID);
  c.strokeStyle = 'rgba(30,36,14,0.35)';
  c.lineWidth = 0.25;
  c.beginPath();
  for (const a of [-2.2, 2.2]) {
    c.moveTo(-i, a);
    c.lineTo(i, a);
  }
  c.stroke();
  rectF(c, -i, -i, i, -i + 0.6, 'rgba(255,255,255,0.12)'); // Licht von links oben
  rectF(c, -i, -i, -i + 0.6, i, 'rgba(255,255,255,0.12)');
  for (const [a0, a1] of [[-3.7, -2.35], [2.35, 3.7]]) rectF(c, a0, -A, a1, A, STRAP);
  rectF(c, -1.1, -1.1, 1.1, 1.1, SEAL);
  c.strokeStyle = 'rgba(60,44,0,0.6)';
  c.lineWidth = 0.3;
  c.strokeRect(-1.1, -1.1, 2.2, 2.2);
  c.strokeStyle = OUTLINE;
  c.lineWidth = 0.5;
  c.strokeRect(-A, -A, 2 * A, 2 * A);
}

/**
 * Versorgungskiste von oben (2D, Weltkoordinaten): Kantenlänge s, glow = liegt am Boden (Schimmer). Ersetzt die einfache Kiste aus
 * sprites.js, die nur noch der Karteneditor nutzt. false = noch kein Bild.
 */
export function drawCrateTop(ctx, x, y, s = 16, zoom = 1, glow = 0) {
  const k = s / 16;
  const e = sprite('crt', zoom * spriteDpr() * k, [-CA - 1, -CA - 1, CA + 2.6, CA + 3], (c, sc) => {
    c.scale(sc, sc);
    crateTop(c);
  });
  if (e === false) return false;
  if (glow > 0) {
    ctx.fillStyle = `rgba(232,184,48,${(0.18 * glow).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, s * 1.25, 0, TAU);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (e) blit(ctx, e, 0, 0, 1);
  else crateTop(ctx);
  ctx.restore();
  return true;
}
