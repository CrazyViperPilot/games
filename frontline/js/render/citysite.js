// Baustellen der Stadt gemalt (seit v5.45, Daniels Wunsch „schaue welche Assets noch nicht verbessert wurden“): eine ausgewiesene
// oder gesetzte Zelle, die noch wächst (Stufe 0, CITY.growTime), ist eine Baustelle, die mit dem Fortschritt sichtbar wächst:
// Baugrube mit Bagger und Absteckpflöcken → Bodenplatte mit Anschlusseisen und Muldenkipper → Erdgeschoss mit Gerüst → Rohbau mit
// Geschossdecke → Dachstuhl mit Richtkranz. Bauzaun mit Planen in der Farbe der Zellenart (Wohnen grün, Gewerbe blau …), Dixi-Klo,
// Ziegel- und Sandhaufen; Großbauten mit Baukran und Baucontainern. Iso (für jede Drehung dasselbe Bild, wie die Stadtgebäude) und
// 2D von oben, je Maßstab zwischengespeichert (spritecache.js). Den Boden (Erde, Rand in der Farbe der Zellenart) malt citylayer.js,
// den Fortschrittsbalken drawCityBadges. Nur Zeichnen.
import { sprite, blit, spriteDpr } from './spritecache.js';
import {
  G,
  box,
  poly,
  lit,
  FACE,
  OUTLINE,
  stroke,
  shadow,
  wallBand,
  fence,
  heap,
  excavator,
  truck,
  mast,
  frustum,
  snowy,
  tint,
  shade,
  rectF,
  rectS,
  shadowTop,
  lineT,
  heapTop,
  fenceTop,
  planksTop,
  circle,
} from './isokit.js';

const STEPS = 5;
const SLAB = '#b9b6ad';
const PIT = '#5e4b39';
const PIT_WALL = '#6f5a44';
const SOIL = '#7b6249';
const SAND = '#d8bf86';
const BRICK = '#b5563c';
const BLOCK = '#d3cdbf';
const PALLET = '#9c7a52';
const TIMBER = '#b08850';
const SCAF = '#9aa0a6';
const PLANK = '#c79a5c';
const REBAR = '#7d4a2a';
const DIXI = '#2f7fbf';
const CRANE = '#d9b13a';
const BOX_OFFICE = '#6f8faa';
const INSIDE = '#8d8a83'; // Boden im offenen Rohbau
// Rohbau je Zellenart: Wohnen Kalksandstein (eine Variante Ziegel), sonst Beton
const WALLS = { res: ['#d8d2c3', '#dcd6c8', '#b9694c'], com: ['#bdbab2', '#c4c0b6', '#b4b1a9'] };
const WALL_DEFAULT = ['#b9b6ae', '#c0bdb5', '#b3b0a8'];

/** Bauabschnitt 0 … 4 aus dem Fortschritt f (0 … 1). */
export const siteStep = (f) => Math.max(0, Math.min(STEPS - 1, Math.floor((Number.isFinite(f) ? f : 0) * STEPS)));

/**
 * Maße einer Baustelle mit n × n Zellen (Weltpixel ab der Mitte): e Bauzaun (0 = keiner), L Reichweite der Baustoffe und Geräte,
 * U0 … V1 Grundriss des Rohbaus, Hf Höhe des fertigen Rohbaus, crane Höhe des Krans (0 = keiner). Ab 4 × 4 Zellen bleibt alles um
 * die Mitte (sonst würde das Bild sehr groß), der Rest ist Erde.
 */
function dims(n) {
  if (n <= 1) return { e: 26, L: 26, U0: -15, U1: 11, V0: -12, V1: 8, Hf: 18, crane: 0 };
  const half = n * 32 - 5;
  const c = Math.min(Math.round(half * 0.55), 44);
  return { e: n <= 3 ? half : 0, L: Math.min(half, 60), U0: -c, U1: c, V0: -c, V1: c - 2, Hf: n === 2 ? 24 : 28, crane: 50 + 8 * Math.min(2, n - 2) };
}

/** Lage der Geräte und Baustoffe (Iso und 2D gleich): Aushub/Steine hinten, Dixi hinten rechts, vorn Palette und Sand. */
function layout(d, flip) {
  const { L, U0, U1, V0, V1 } = d;
  return {
    back: [flip ? U1 + 6 : U0 - 3, V0 - 7],
    dixi: [L - 6, -L + 6],
    digger: [U0 - 6, (V0 + V1) / 2 + 2],
    truck: [U1 + 8, (V0 + V1) / 2],
    crane: [U0 - 7, V0 - 7],
    office: [-L + 8, L - 6],
    pallet: [flip ? L - 7 : -L + 7, L - 13],
    sand: [flip ? -L + 9 : L - 9, L - 9],
  };
}

/** Höhe des Rohbaus in Bauabschnitt step (Weltpixel, ohne Kran; für den Fortschrittsbalken darüber). */
export function siteTall(n, step) {
  const d = dims(n);
  return [9, 6, d.Hf * 0.42 + 3, d.Hf * 0.8 + 3, d.Hf + 14][step] ?? 10;
}

const wallOf = (ck, v) => (WALLS[ck] ?? WALL_DEFAULT)[((v % 3) + 3) % 3];

// ---------- Bauteile (isometrisch) ----------

/** Baugrube: Sohle tiefer, hintere Grubenwände sichtbar (beschnitten auf die Öffnung). */
function pit(g, U0, U1, V0, V1, d = 2.6) {
  const { ctx, P } = g;
  ctx.save();
  ctx.beginPath();
  for (const [i, p] of [P(U0, V0), P(U1, V0), P(U1, V1), P(U0, V1)].entries()) (i ? ctx.lineTo(...p) : ctx.moveTo(...p));
  ctx.closePath();
  ctx.clip();
  poly(g, [P(U0, V0, -d), P(U1, V0, -d), P(U1, V1, -d), P(U0, V1, -d)], PIT, null);
  poly(g, [P(U0, V0, 0), P(U1, V0, 0), P(U1, V0, -d), P(U0, V0, -d)], lit(PIT_WALL, ...FACE.s), null);
  poly(g, [P(U0, V0, 0), P(U0, V1, 0), P(U0, V1, -d), P(U0, V0, -d)], lit(PIT_WALL, ...FACE.e), null);
  ctx.restore();
  stroke(g, [P(U0, V1), P(U1, V1), P(U1, V0)], 'rgba(60,45,30,0.5)', 0.6);
}

/** Absteckpflöcke an den Ecken (rot-weiß) mit Schnur. */
function stakes(g, U0, U1, V0, V1) {
  const { P } = g;
  const c = [[U0 - 1, V0 - 1], [U1 + 1, V0 - 1], [U1 + 1, V1 + 1], [U0 - 1, V1 + 1]];
  if (g.fine) stroke(g, [...c, c[0]].map(([u, v]) => P(u, v, 2.2)), 'rgba(246,244,236,0.85)', 0.3);
  for (const [u, v] of c) {
    stroke(g, [P(u, v, 0), P(u, v, 4)], '#efe9da', 0.75);
    stroke(g, [P(u, v, 3), P(u, v, 4.3)], '#d0412f', 0.8);
  }
}

/** Anschlusseisen: kurze Stäbe rund um die Platte und an den Stützen. */
function rebar(g, U0, U1, V0, V1, h, step = 3) {
  if (!g.fine) return;
  const { P } = g;
  const up = 2.8;
  for (let u = U0 + 1; u <= U1 - 0.9; u += step) {
    stroke(g, [P(u, V0 + 1, h), P(u, V0 + 1, h + up)], REBAR, 0.35);
    stroke(g, [P(u, V1 - 1, h), P(u, V1 - 1, h + up)], REBAR, 0.35);
  }
  for (let v = V0 + 1 + step; v <= V1 - 1 - step + 0.1; v += step) {
    stroke(g, [P(U0 + 1, v, h), P(U0 + 1, v, h + up)], REBAR, 0.35);
    stroke(g, [P(U1 - 1, v, h), P(U1 - 1, v, h + up)], REBAR, 0.35);
  }
}

/** Öffnungen (Fenster, Tür) in einer sichtbaren Wand: Fläche 's' (Ebene v = plane) oder 'e' (Ebene u = plane). */
function openings(g, face, plane, a0, a1, rows, door = null) {
  if (!g.fine) return;
  const pt = face === 's' ? (a, h) => g.P(a, plane + 0.05, h) : (a, h) => g.P(plane + 0.05, a, h);
  const dark = lit('#3a3631', ...FACE[face]);
  const n = Math.max(1, Math.floor((a1 - a0) / 6));
  const step = (a1 - a0) / n;
  for (const [h0, h1] of rows) {
    for (let k = 0; k < n; k++) {
      const a = a0 + step * (k + 0.5);
      if (door !== null && h0 < 4 && Math.abs(a - door) < 3) continue;
      poly(g, [pt(a - 1.3, h0), pt(a + 1.3, h0), pt(a + 1.3, h1), pt(a - 1.3, h1)], dark, null);
    }
  }
  if (door !== null) poly(g, [pt(door - 1.2, 1.6), pt(door + 1.2, 1.6), pt(door + 1.2, 6.4), pt(door - 1.2, 6.4)], dark, null);
}

/** Offener Rohbau: innen Boden (Höhe hF) und Innenseiten der hinteren Wände, außen die beiden sichtbaren Wände bis H, Mauerkrone. */
function shell(g, U0, U1, V0, V1, H, wall, hF) {
  const { P } = g;
  const t = 1.2;
  const inner = shade(wall, 0.2);
  poly(g, [P(U0 + t, V0 + t, hF), P(U1 - t, V0 + t, hF), P(U1 - t, V1 - t, hF), P(U0 + t, V1 - t, hF)], lit(INSIDE, ...FACE.top), null);
  poly(g, [P(U0 + t, V0 + t, hF), P(U1 - t, V0 + t, hF), P(U1 - t, V0 + t, H), P(U0 + t, V0 + t, H)], lit(inner, ...FACE.s), null);
  poly(g, [P(U0 + t, V0 + t, hF), P(U0 + t, V1 - t, hF), P(U0 + t, V1 - t, H), P(U0 + t, V0 + t, H)], lit(inner, ...FACE.e), null);
  poly(g, [P(U0, V1, 1.6), P(U1, V1, 1.6), P(U1, V1, H), P(U0, V1, H)], lit(wall, ...FACE.s), OUTLINE);
  poly(g, [P(U1, V0, 1.6), P(U1, V1, 1.6), P(U1, V1, H), P(U1, V0, H)], lit(wall, ...FACE.e), OUTLINE);
  const crown = lit(tint(wall, 0.12), ...FACE.top);
  poly(g, [P(U0, V0, H), P(U1, V0, H), P(U1, V0 + t, H), P(U0, V0 + t, H)], crown, null);
  poly(g, [P(U0, V0, H), P(U0 + t, V0, H), P(U0 + t, V1, H), P(U0, V1, H)], crown, null);
  poly(g, [P(U0, V1 - t, H), P(U1, V1 - t, H), P(U1, V1, H), P(U0, V1, H)], crown, null);
  poly(g, [P(U1 - t, V0, H), P(U1, V0, H), P(U1, V1, H), P(U1 - t, V1, H)], crown, null);
}

/** Gerüst vor den beiden sichtbaren Wänden: Ständer, Beläge mit Bordbrett, Geländer, eine Diagonale. */
function scaffold(g, U0, U1, V0, V1, H) {
  const { P } = g;
  const o = 2.6;
  const top = H + 2.4;
  const levels = [];
  for (let L = 4; L <= H + 0.6; L += 4.5) levels.push(L);
  // rechte Wand (+u)
  for (let v = V0 - 1; v <= V1 + o + 0.1; v += (V1 + o - V0 + 1) / Math.max(2, Math.round((V1 + o - V0) / 6.5))) stroke(g, [P(U1 + o, v, 0), P(U1 + o, v, top)], SCAF, 0.55);
  for (const L of levels) box(g, U1 + 0.4, U1 + o, V0 - 1, V1 + o, L - 0.35, L, PLANK, tint(PLANK, 0.1), null);
  // linke Wand (+v)
  for (let u = U0 - 1; u <= U1 + o + 0.1; u += (U1 + o - U0 + 1) / Math.max(2, Math.round((U1 + o - U0) / 6.5))) stroke(g, [P(u, V1 + o, 0), P(u, V1 + o, top)], SCAF, 0.55);
  for (const L of levels) box(g, U0 - 1, U1 + o, V1 + 0.4, V1 + o, L - 0.35, L, PLANK, tint(PLANK, 0.1), null);
  for (const L of levels) stroke(g, [P(U0 - 1, V1 + o, L + 1.9), P(U1 + o, V1 + o, L + 1.9), P(U1 + o, V0 - 1, L + 1.9)], SCAF, 0.4);
  if (g.fine) {
    stroke(g, [P(U0 - 1, V1 + o, 0), P(U0 + 6, V1 + o, Math.min(top, 9))], SCAF, 0.4);
    stroke(g, [P(U1 + o, V0 - 1, 0), P(U1 + o, V0 + 6, Math.min(top, 9))], SCAF, 0.4);
  }
}

/** Plane in der Farbe der Zellenart am Gerüst (linke Wand). */
function banner(g, U0, U1, V1, h0, h1, zone) {
  const { P } = g;
  const v = V1 + 2.75;
  poly(g, [P(U0, v, h0), P(U1, v, h0), P(U1, v, h1), P(U0, v, h1)], lit(zone, ...FACE.s), 'rgba(30,30,30,0.35)');
  if (g.fine) stroke(g, [P(U0 + 0.8, v + 0.05, (h0 + h1) / 2), P(U1 - 0.8, v + 0.05, (h0 + h1) / 2)], 'rgba(255,255,255,0.55)', 0.5);
}

/** Dachstuhl (Satteldach, First entlang u) mit Richtkranz. */
function roofFrame(g, U0, U1, V0, V1, H, rh, zone, wreath = true) {
  const { P } = g;
  const vm = (V0 + V1) / 2;
  stroke(g, [P(U0, V1, H + 0.3), P(U1, V1, H + 0.3), P(U1, V0, H + 0.3)], shade(TIMBER, 0.15), 0.8);
  const n = Math.max(3, Math.round((U1 - U0) / 3.3));
  for (let k = 0; k <= n; k++) {
    const u = U0 + ((U1 - U0) * k) / n;
    stroke(g, [P(u, V0, H), P(u, vm, H + rh), P(u, V1, H)], TIMBER, 0.75);
  }
  stroke(g, [P(U0, vm, H + rh), P(U1, vm, H + rh)], shade(TIMBER, 0.1), 0.95);
  if (g.fine) for (const t of [0.33, 0.66]) stroke(g, [P(U0, V0 + (vm - V0) * t, H + rh * t), P(U1, V0 + (vm - V0) * t, H + rh * t)], tint(TIMBER, 0.1), 0.4);
  if (!wreath) return;
  const u = (U0 + U1) / 2;
  frustum(g, u, vm, 1.5, 0.15, H + rh, H + rh + 4.6, '#3d7a35', false);
  if (!g.fine) return;
  for (const [du, col] of [[-0.9, zone], [0.9, '#e8c547'], [0, '#d0412f']]) stroke(g, [P(u + du * 0.4, vm, H + rh + 2.4), P(u + du, vm + 0.6, H + rh + 0.4)], col, 0.4);
}

/** Bauzaun (Gitterzaun) mit Planen in der Farbe der Zellenart: part wie fence ('back' zuerst, 'front' zuletzt). */
function siteFence(g, e, part, zone) {
  fence(g, -e, e, -e, e, part, 3.4);
  if (part !== 'front') return;
  const { P } = g;
  const seg = 9;
  const n = Math.max(2, Math.floor((2 * e - 4) / seg));
  const len = (2 * e - 4) / n;
  for (let k = 0; k < n; k++) {
    if (k % 3 === 2) continue; // Lücken: der Zaun bleibt luftig
    const a0 = -e + 2 + k * len + 0.6;
    const a1 = a0 + len - 1.2;
    poly(g, [P(a0, e, 0.6), P(a1, e, 0.6), P(a1, e, 2.9), P(a0, e, 2.9)], lit(zone, ...FACE.s), null);
    poly(g, [P(e, a0, 0.6), P(e, a1, 0.6), P(e, a1, 2.9), P(e, a0, 2.9)], lit(zone, ...FACE.e), null);
  }
}

/** Dixi-Klo. */
function dixi(g, u, v) {
  box(g, u - 1.6, u + 1.6, v - 1.6, v + 1.6, 0, 6.2, DIXI, snowy('#e9ece8'));
  if (g.fine) stroke(g, [g.P(u - 0.6, v + 1.62, 0.4), g.P(u - 0.6, v + 1.62, 5.2)], 'rgba(0,0,0,0.3)', 0.4);
}

/** Palette mit Steinen (Ziegel oder Kalksandstein). */
function pallet(g, u, v, col) {
  box(g, u - 2.8, u + 2.8, v - 2.2, v + 2.2, 0, 0.8, PALLET);
  box(g, u - 2.5, u + 2.5, v - 1.9, v + 1.9, 0.8, 3.4, col, snowy(tint(col, 0.1)));
  if (g.fine) stroke(g, [g.P(u - 2.5, v + 1.95, 2.1), g.P(u + 2.5, v + 1.95, 2.1), g.P(u + 2.5, v - 1.9, 2.1)], 'rgba(0,0,0,0.18)', 0.4);
}

/** Baukran: Gittermast, Führerhaus, Ausleger nach +u mit Laufkatze und Haken, Gegenausleger mit Ballast. */
function crane(g, u, v, H, reach, hookH) {
  const { P } = g;
  mast(g, u, v, 0, H, 1.6, 1.6, CRANE, false);
  box(g, u - 2, u + 2, v - 2, v + 2, H, H + 1.2, shade(CRANE, 0.2));
  box(g, u + 0.4, u + 3, v + 0.6, v + 3, H - 3, H, '#e8e4d8', '#e8e4d8');
  const tip = u + reach;
  stroke(g, [P(u - reach * 0.32, v, H + 1.2), P(tip, v, H + 1.2)], CRANE, 1.1);
  stroke(g, [P(u, v, H + 1.2), P(u, v, H + 5.2)], CRANE, 0.8);
  stroke(g, [P(u - reach * 0.32, v, H + 1.2), P(u, v, H + 5.2), P(tip, v, H + 1.2)], shade(CRANE, 0.25), 0.4);
  box(g, u - reach * 0.32, u - reach * 0.32 + 3.2, v - 1.4, v + 1.4, H - 1.6, H + 1.2, '#8d9194');
  const hook = u + reach * 0.62;
  stroke(g, [P(hook, v, H + 1), P(hook, v, hookH + 1.2)], '#2e3133', 0.35);
  box(g, hook - 0.7, hook + 0.7, v - 0.7, v + 0.7, hookH, hookH + 1.2, '#d0412f');
}

/** Baucontainer (zwei übereinander) mit Fensterband. */
function office(g, u, v) {
  const { P } = g;
  for (const h of [0, 3.1]) {
    box(g, u - 4, u + 4, v - 1.7, v + 1.7, h, h + 3, BOX_OFFICE, snowy(tint(BOX_OFFICE, 0.15)));
    if (g.fine) poly(g, [P(u - 3, v + 1.75, h + 1.2), P(u + 3, v + 1.75, h + 1.2), P(u + 3, v + 1.75, h + 2.3), P(u - 3, v + 1.75, h + 2.3)], lit('#34506d', ...FACE.s), null);
  }
}

// ---------- Baustelle (isometrisch) ----------

function paintIso(ctx, s, b) {
  const g = G(ctx, s);
  const d = dims(b.n);
  const { U0, U1, V0, V1, Hf } = d;
  const step = b.step;
  const wall = b.wall;
  const zone = b.zone;
  const flip = b.variant === 2;
  const big = b.n > 1;
  const at = layout(d, flip);
  if (d.e) siteFence(g, d.e, 'back', zone);
  // hinten: Aushub bzw. Steine, Dixi, Kran
  if (step <= 1) heap(g, ...at.back, big ? 9 : 6.5, big ? 7 : 5, snowy(SOIL));
  else pallet(g, ...at.back, wall === wallOf('res', 2) ? BRICK : BLOCK);
  dixi(g, ...at.dixi);
  if (big && step >= 1) crane(g, ...at.crane, d.crane, U1 - U0 + 8, step >= 3 ? Hf * 0.9 : Hf * 0.5);
  if (step === 0) {
    pit(g, U0, U1, V0, V1);
    stakes(g, U0, U1, V0, V1);
  } else {
    const H = [0, 1.6, Hf * 0.42, Hf * 0.8, Hf][step];
    shadow(g, U0, U1, V0, V1, H, 0.16);
    box(g, U0, U1, V0, V1, 0, 1.6, SLAB, snowy(tint(SLAB, 0.06)));
    if (step === 1) rebar(g, U0, U1, V0, V1, 1.6, big ? 4 : 3);
    else {
      const floors = [7.6, 14.6, 21.6].filter((h) => h < H - 1);
      shell(g, U0, U1, V0, V1, H, wall, floors.length ? floors[floors.length - 1] + 0.8 : 1.6);
      const rows = [[2.8, 6.2], [9.8, 13.2], [16.8, 20.2], [23.8, 27]].filter(([, h1]) => h1 < H - 0.8);
      openings(g, 's', V1, U0 + 1, U1 - 1, rows, (U0 + U1) / 2 - (flip ? -3 : 3));
      openings(g, 'e', U1, V0 + 1, V1 - 1, rows);
      for (const h of floors) wallBand(g, U0, U1, V0, V1, h, h + 0.8, SLAB);
      if (step === 4) roofFrame(g, U0, U1, V0, V1, H, big ? 10 : 8.5, zone, !big);
      scaffold(g, U0, U1, V0, V1, H);
      banner(g, U0 + 1, U0 + 1 + Math.min(10, (U1 - U0) * 0.4), V1, 3, Math.min(H - 0.5, 10.5), zone);
    }
  }
  // vorn: Maschinen und Baustoffe
  if (step === 0) excavator(g, ...at.digger, 0);
  if (step === 1) truck(g, ...at.truck);
  if (big) office(g, ...at.office);
  pallet(g, ...at.pallet, BRICK);
  heap(g, ...at.sand, 4.4, 3.2, snowy(SAND));
  if (d.e) siteFence(g, d.e, 'front', zone);
}

// ---------- Baustelle (2D von oben) ----------

function paintTop(c, s, b) {
  c.scale(s, s);
  const d = dims(b.n);
  const { U0, U1, V0, V1, Hf } = d;
  const step = b.step;
  const zone = b.zone;
  const flip = b.variant === 2;
  const big = b.n > 1;
  const at = layout(d, flip);
  const [bx, by] = at.back;
  if (step <= 1) heapTop(c, bx, by, big ? 9 : 6.5, SOIL);
  else rectS(c, bx - 2.5, by - 1.9, bx + 2.5, by + 1.9, b.wall === wallOf('res', 2) ? BRICK : BLOCK);
  if (step === 0) {
    rectS(c, U0, V0, U1, V1, PIT, 'rgba(50,38,26,0.6)', 0.6);
    rectF(c, U0, V0, U1, V0 + 2, 'rgba(0,0,0,0.25)');
    rectF(c, U0, V0, U0 + 2, V1, 'rgba(0,0,0,0.18)');
    c.save();
    c.setLineDash([1.2, 0.8]);
    c.strokeStyle = 'rgba(246,244,236,0.8)';
    c.lineWidth = 0.3;
    c.strokeRect(U0 - 1, V0 - 1, U1 - U0 + 2, V1 - V0 + 2);
    c.restore();
    for (const [u, v] of [[U0 - 1, V0 - 1], [U1 + 1, V0 - 1], [U1 + 1, V1 + 1], [U0 - 1, V1 + 1]]) circle(c, u, v, 0.8, '#d0412f');
    // Bagger: Ketten, Oberwagen, Arm in die Grube
    const [x, y] = at.digger;
    rectF(c, x - 3.5 + 0.8, y - 2.6 + 0.8, x + 3.5 + 0.8, y + 2.6 + 0.8, 'rgba(0,0,0,0.25)');
    rectF(c, x - 3.5, y - 2.6, x + 3.5, y - 1.4, '#3b3b3b');
    rectF(c, x - 3.5, y + 1.4, x + 3.5, y + 2.6, '#3b3b3b');
    rectS(c, x - 3, y - 2.2, x + 2.2, y + 2.2, '#e2b021');
    rectF(c, x - 0.2, y - 2.2, x + 2.2, y - 0.2, '#9fb8c8');
    lineT(c, [[x + 1.6, y + 0.6], [x + 9, y + 0.6]], '#d39d14', 1.3);
    rectF(c, x + 8.4, y - 0.8, x + 10.6, y + 2, '#5d6064');
  } else {
    const H = [0, 1.6, Hf * 0.42, Hf * 0.8, Hf][step];
    shadowTop(c, U0, V0, U1, V1, H);
    rectS(c, U0, V0, U1, V1, SLAB);
    if (step === 1) {
      c.fillStyle = REBAR;
      const st = big ? 4 : 3;
      for (let u = U0 + 1; u <= U1 - 0.9; u += st) {
        c.fillRect(u - 0.3, V0 + 0.7, 0.6, 0.6);
        c.fillRect(u - 0.3, V1 - 1.3, 0.6, 0.6);
      }
      for (let v = V0 + 1 + st; v <= V1 - 1 - st + 0.1; v += st) {
        c.fillRect(U0 + 0.7, v - 0.3, 0.6, 0.6);
        c.fillRect(U1 - 1.3, v - 0.3, 0.6, 0.6);
      }
    } else {
      rectF(c, U0 + 1.2, V0 + 1.2, U1 - 1.2, V1 - 1.2, INSIDE);
      c.strokeStyle = tint(b.wall, 0.08);
      c.lineWidth = 1.2;
      c.strokeRect(U0 + 0.6, V0 + 0.6, U1 - U0 - 1.2, V1 - V0 - 1.2);
      c.strokeStyle = 'rgba(40,30,20,0.4)';
      c.lineWidth = 0.35;
      c.strokeRect(U0, V0, U1 - U0, V1 - V0);
      if (step === 4) {
        const vm = (V0 + V1) / 2;
        const n = Math.max(3, Math.round((U1 - U0) / 3.3));
        for (let k = 0; k <= n; k++) {
          const u = U0 + ((U1 - U0) * k) / n;
          lineT(c, [[u, V0], [u, V1]], TIMBER, 0.6);
        }
        lineT(c, [[U0, vm], [U1, vm]], shade(TIMBER, 0.1), 0.9);
        if (!big) circle(c, (U0 + U1) / 2, vm, 1.5, '#3d7a35');
      }
      // Gerüst rechts und unten (vor den sichtbaren Wänden)
      planksTop(c, U0 - 1, V1 + 0.4, U1 + 2.6, V1 + 2.6);
      planksTop(c, U1 + 0.4, V0 - 1, U1 + 2.6, V1 + 2.6);
      rectS(c, U0 + 1, V1 + 2.2, U0 + 1 + Math.min(10, (U1 - U0) * 0.4), V1 + 3, zone, 'rgba(30,30,30,0.35)', 0.3);
    }
  }
  if (step === 1) {
    // Muldenkipper
    const [x, y] = at.truck;
    rectF(c, x - 5 + 0.8, y - 2.2 + 0.8, x + 5 + 0.8, y + 2.2 + 0.8, 'rgba(0,0,0,0.25)');
    rectS(c, x - 5, y - 2.2, x + 1.6, y + 2.2, '#e2b021');
    rectF(c, x - 4.4, y - 1.6, x + 1, y + 1.6, '#bdb6a8');
    rectS(c, x + 1.8, y - 2, x + 5, y + 2, '#d4d0c6');
  }
  if (big && step >= 1) {
    // Kran von oben: Mast, Ausleger mit Laufkatze, Ballast
    const [u, v] = at.crane;
    const reach = U1 - U0 + 8;
    lineT(c, [[u - reach * 0.32 + 3, v + 3], [u + reach + 3, v + 3]], 'rgba(0,0,0,0.22)', 1.6);
    lineT(c, [[u - reach * 0.32, v], [u + reach, v]], CRANE, 1.1);
    rectS(c, u - 1.8, v - 1.8, u + 1.8, v + 1.8, CRANE);
    rectS(c, u - reach * 0.32, v - 1.4, u - reach * 0.32 + 3.2, v + 1.4, '#8d9194');
    rectF(c, u + reach * 0.62 - 0.7, v - 0.7, u + reach * 0.62 + 0.7, v + 0.7, '#d0412f');
  }
  // Dixi, Baustoffe, Container
  const [dx, dy] = at.dixi;
  rectF(c, dx - 1.6 + 0.9, dy - 1.6 + 0.9, dx + 1.6 + 1.6, dy + 1.6 + 1.6, 'rgba(0,0,0,0.22)');
  rectS(c, dx - 1.6, dy - 1.6, dx + 1.6, dy + 1.6, '#e9ece8', DIXI, 0.8);
  if (big) {
    const [ox, oy] = at.office;
    rectF(c, ox - 4 + 1, oy - 1.7 + 1, ox + 4 + 1.4, oy + 1.7 + 1.4, 'rgba(0,0,0,0.22)');
    rectS(c, ox - 4, oy - 1.7, ox + 4, oy + 1.7, BOX_OFFICE);
  }
  const [px, py] = at.pallet;
  rectS(c, px - 2.5, py - 1.9, px + 2.5, py + 1.9, BRICK);
  heapTop(c, ...at.sand, 4.4, SAND);
  if (d.e) {
    fenceTop(c, -d.e, -d.e, d.e, d.e);
    const n = Math.max(2, Math.floor((2 * d.e - 4) / 9));
    const len = (2 * d.e - 4) / n;
    for (let k = 0; k < n; k++) {
      if (k % 3 === 2) continue;
      const a0 = -d.e + 2 + k * len + 0.6;
      rectF(c, a0, d.e - 0.5, a0 + len - 1.2, d.e + 0.5, zone);
      rectF(c, d.e - 0.5, a0, d.e + 0.5, a0 + len - 1.2, zone);
    }
  }
}

// ---------- Schnittstelle ----------

/** Bildausmaße (Einheiten um den Ankerpunkt) einer Baustelle mit n × n Zellen. */
function boundsIso(n) {
  const d = dims(n);
  const half = Math.max(d.e, d.L) + 2;
  const k = Math.SQRT1_2;
  const tall = n > 1 ? d.crane + 8 : d.Hf + 16;
  return [-(2 * half * k + 6), -(half * k + tall), 2 * half * k + 6, half * k + 6];
}

const keyOf = (b) => `${b.n}|${b.step}|${b.variant % 3}|${b.zone}|${b.wall}`;

/**
 * Baustelle isometrisch, Ankerpunkt = Mitte am Boden. b: { x, y, n (Zellen je Seite), step (0 … 4, siteStep), variant (0 … 2),
 * zone (Farbe der Zellenart), wall (Farbe des Rohbaus, siteWall) }.
 */
export function drawSiteIso(ctx, cam, b, season = 'summer') {
  const key = `cs|${keyOf(b)}|${season === 'winter' ? 1 : 0}`;
  const p = cam.worldToScreen(b.x, b.y);
  const z = cam.zoom;
  const r = spriteDpr();
  const e = sprite(key, z * r, boundsIso(b.n), (c, s) => paintIso(c, s, b));
  if (e === false) return false;
  if (e) {
    blit(ctx, e, p.x, p.y, z);
    return true;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1 / r, 1 / r);
  paintIso(ctx, z * r, b);
  ctx.restore();
  return true;
}

/** Baustelle von oben (2D, Weltkoordinaten, Kamera-Transformation gesetzt). */
export function drawSiteTop(ctx, b, zoom) {
  const d = dims(b.n);
  const half = Math.max(d.e, d.L) + 6;
  const e = sprite(`cst|${keyOf(b)}`, zoom * spriteDpr(), [-half, -half, half + 4, half + 4], (c, s) => paintTop(c, s, b));
  if (e === false) return false;
  if (e) {
    blit(ctx, e, b.x, b.y, 1);
    return true;
  }
  ctx.save();
  ctx.translate(b.x, b.y);
  paintTop(ctx, 1, b);
  ctx.restore();
  return true;
}

/** Farbe des Rohbaus je Zellenart und Variante (Wohnen meist Kalksandstein, manchmal Ziegel; sonst Beton). */
export const siteWall = wallOf;
