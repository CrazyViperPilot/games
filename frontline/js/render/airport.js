// Flughafen (10 × 10, seit v5.22 neu gezeichnet, PRD §15). Boden: zwei Start- und Landebahnen mit Schwellen, Kennziffern
// (09L/27R, 09R/27L), Zielpunkt- und Aufsetzzonenmarken, Gummiabrieb, Rand-, Schwellen- und Anflugbefeuerung, PAPI; Rollweg mit
// Verbindungen, Haltelinien und blauen Randfeuern; Vorfeld bis an den Rollweg mit Fugen, Rollgassen (dort rollen die Jets wirklich,
// game/aircraft.js), Stellplätzen, Gerätefeldern und Betriebsstraße; Hangarvorfeld, Zufahrt und Parkplatz. Bauten als eigene Körper
// (Tiefenordnung in der Iso-Ansicht, bigbuild.js reicht sie durch): Hangars mit Tonnendach und halb offenem Tor (je Stufe einer
// mehr), Tower mit Glaskanzel, Tanklager mit Tankwagen, Staffelgebäude (ab Stufe 2), Feuerwache und Radar mit drehender Antenne
// (Stufe 3), Parkplatz, Flutlichtmasten, Windsack, Bäume. Wie die Werke (works.js) wird jeder Körper über spritecache.js einmal
// je Maßstab gemalt (Bauteile aus isokit.js), in der Iso-Ansicht für jede Drehung dasselbe Bild (nur der Hangar liegt je Drehung
// längs oder quer). Örtliche Koordinaten ab der Mitte des Flughafens: x nach Osten, y nach Süden. Nur Zeichnen.
import { AIRPORT, LANE, ROW_GAP } from '../game/aircraft.js';
import {
  CAR_COLORS, DECK, FACE, G, HEDGE, OUTLINE, acTop, acUnit, band, box, car, carTop, circle, cyl, dish, dishTop, door, fan,
  fence, flagpole, flat, flatTop, frustum, lamp, latticeTop, lineT, lit, mast, onFace, parapet, poly, rectF, rectS, ribs, rnd,
  shadow, shadowTop, snowy, stroke, tint, vault, vaultTop, wallBand, wins,
} from './isokit.js';
import { roofSnowOn } from './season.js';
import { sprite, blit, spriteDpr } from './spritecache.js';
import {
  blockTop, bund, discTop, gate, lorry, lorryTop, pipe, pipeTop, ringTop, roundShadow, shadowRound, strip, tank, walls,
} from './works.js';

const TAU = Math.PI * 2;
const K = Math.SQRT1_2; // wie ISO_K
const A = AIRPORT;
const [R1, R2] = A.runways;
const T = A.taxi;

// ---------- Lage der Bauten östlich des Vorfelds (örtlich) ----------

const HX = [138, 206, 274]; // Hangars: Mitte x (je Stufe einer mehr), Tor nach Süden zum Hangarvorfeld
const HY = -47; // Mitte y der Hangars (Tiefe −86 … −8)
const HAPRON = { x0: 100, y0: -8, x1: 314, y1: 64 };
const ROAD = { x0: 207, x1: 221, y0: 64, y1: 317 };
const PARK = { x0: 114, y0: 256, x1: 198, y1: 310 };
const AT = { tower: [262, 110], ops: [156, 108], fuel: [262, 202], fire: [156, 196], radar: [264, 285], park: [156, 283] };
const FLOODS = [-262, -134, -6, 90];
const SOCK = [-305, -136];
const TREES = [[306, 76, 8], [310, 150, 7], [309, 300, 8], [234, 306, 7], [106, 150, 7], [106, 246, 7], [304, 252, 7]];

/** Örtliche Ausdehnung je Körper (u0, u1, v0, v1 ohne Drehung, Höhe), für Grundriss, Bildgrenzen und Schild. */
const EXT = {
  hangar: [-32, 32, -39, 52, 36],
  tower: [-26, 26, -26, 30, 98],
  ops: [-42, 42, -30, 38, 30],
  fuel: [-36, 36, -42, 46, 26],
  fire: [-42, 42, -32, 34, 36],
  radar: [-18, 18, -18, 18, 46],
  park: [-42, 42, -26, 26, 9],
  flood: [-3, 3, -3, 3, 40],
  sock: [-3, 14, -3, 6, 16],
};

/** Körper je Stufe: { t: 'ap', id, x, y, fw, fh (Grundriss), h (Höhe), lv, n } und Bäume { t: 'tree', x, y, r } (örtlich). */
export function airportBodies(lv) {
  const out = [];
  const part = (id, x, y, n = 0) => {
    const [u0, u1, v0, v1, h] = EXT[id];
    out.push({ t: 'ap', id, x, y, fw: Math.min(u1 - u0, id === 'hangar' ? 64 : 999), fh: id === 'hangar' ? 78 : v1 - v0, h, lv, n });
  };
  HX.slice(0, Math.max(1, lv)).forEach((x, n) => part('hangar', x, HY, n));
  part('tower', ...AT.tower);
  part('fuel', ...AT.fuel);
  part('park', ...AT.park);
  if (lv >= 2) part('ops', ...AT.ops);
  if (lv >= 3) {
    part('fire', ...AT.fire);
    part('radar', ...AT.radar);
  }
  for (const x of FLOODS) part('flood', x, 306);
  part('sock', ...SOCK);
  for (const [x, y, r] of TREES) out.push({ t: 'tree', x, y, r });
  return out;
}

// ---------- Boden ----------

const GRASS = '#6f8a52';
const GRASS2 = '#7d985c'; // gemähte Streifen
const SNOW = '#e3e8ec';
const SNOW2 = '#d5dce2';
const ASPH_R = '#3d3f3c'; // Bahn
const ASPH_T = '#4a4c48'; // Rollweg, Straße, Parkplatz
const CONC = '#aaa9a1'; // Vorfeld
const JOINT = 'rgba(60,58,50,0.17)';
const RUBBER = 'rgba(22,22,22,0.22)';
const RUBBER2 = 'rgba(22,22,22,0.1)';
const WHITE = '#ecebe4';
const YEL = '#e3c63a';
const RED = '#c0392b';
const LIGHT = '#fff3c4';
const BLUE = '#4f86ff';
const GREEN = '#57e37f';

// Ziffern und Buchstaben als Striche (x 0…1, y 0…2, y nach unten)
const SEG = { a: [0, 0, 1, 0], b: [1, 0, 1, 1], c: [1, 1, 1, 2], d: [0, 2, 1, 2], e: [0, 1, 0, 2], f: [0, 0, 0, 1], g: [0, 1, 1, 1] };
const GLYPH = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 7: 'abc', 9: 'abcdfg', L: 'fed', R: 'efabg' };
function glyph(ch) {
  const segs = [...(GLYPH[ch] ?? '')].map((k) => SEG[k]);
  if (ch === 'R') segs.push([0.3, 1, 1, 2]);
  return segs;
}

/**
 * Boden des Flughafens als Liste { t: 'rect' | 'line' | 'poly', …, c, w?, fine?, grass? } in örtlichen Koordinaten, in Zeichenfolge
 * und nach Farben geordnet (bigbuild.js zeichnet gleiche Farben in einem Pfad). fine = nur bei genug Zoom, grass = im Winter Schnee.
 */
export function airportGround(lv) {
  const out = [];
  const R = (x0, y0, x1, y1, c, fine = false) => out.push({ t: 'rect', x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), c, fine });
  const L = (x0, y0, x1, y1, c, w, fine = false) => out.push({ t: 'line', x0, y0, x1, y1, c, w, fine });
  const Q = (pts, c) => out.push({ t: 'poly', pts, c });
  const E = 317;
  // Rasen mit gemähten Streifen
  out.push({ t: 'rect', x0: -E, y0: -E, x1: E, y1: E, c: GRASS, grass: SNOW });
  for (let y = -E; y < E; y += 40) out.push({ t: 'rect', x0: -E, y0: y, x1: E, y1: Math.min(E, y + 20), c: GRASS2, grass: SNOW2 });
  // Asphalt: Rollweg, Verbindungen (mit Ausrundungen), Straße, Parkplatz
  const hw = T.w / 2;
  const ends = [T.x0, T.x1];
  const mids = [-140, 0, 140];
  R(T.x0 - hw, T.y - hw, T.x1 + hw, T.y + hw, ASPH_T);
  for (const x of ends) R(x - hw, R1.y, x + hw, T.y, ASPH_T);
  for (const x of mids) R(x - hw, R2.y, x + hw, T.y, ASPH_T);
  R(ROAD.x0, ROAD.y0, ROAD.x1, ROAD.y1, ASPH_T);
  R(PARK.x0, PARK.y0, PARK.x1, PARK.y1, ASPH_T);
  R(PARK.x1, 270, ROAD.x0, 296, ASPH_T);
  R(ROAD.x1, 232, 300, 246, ASPH_T); // Ladestraße am Tanklager
  const fil = 7;
  const fillet = (x, y, sx, sy) => Q([[x + sx * (hw + fil), y], [x + sx * hw, y], [x + sx * hw, y + sy * fil]], ASPH_T);
  const r1s = R1.y + R1.w / 2;
  const r2n = R2.y - R2.w / 2;
  const r2s = R2.y + R2.w / 2;
  const tn = T.y - hw;
  for (const x of [...ends, ...mids]) {
    const sides = x === T.x0 ? [1] : x === T.x1 ? [-1] : [-1, 1];
    for (const s of sides) fillet(x, tn, s, -1); // am Rollweg
    for (const s of [-1, 1]) fillet(x, r2s, s, 1); // an Bahn 2 (Süden)
    if (ends.includes(x)) for (const s of [-1, 1]) {
      fillet(x, r2n, s, -1); // an Bahn 2 (Norden)
      fillet(x, r1s, s, 1); // an Bahn 1
    }
  }
  // Bahnen
  for (const r of A.runways) R(r.x0, r.y - r.w / 2, r.x1, r.y + r.w / 2, ASPH_R);
  // Beton: Vorfeld, Hangarvorfeld, Vorplätze
  const ap = A.apron;
  R(ap.x0, ap.y0, ap.x1, ap.y1, CONC);
  R(HAPRON.x0, HAPRON.y0, HAPRON.x1, HAPRON.y1, CONC);
  R(PARK.x0, 138, ROAD.x0, 146, CONC); // vor dem Staffelgebäude
  R(ROAD.x1, 118, 236, 128, CONC); // zum Tower
  if (lv >= 3) R(PARK.x0, 228, ROAD.x0, 246, CONC); // vor der Feuerwache
  // Beton mit ausgebesserten Platten (heller und dunkler) und Ölflecken an den Stellplätzen
  const slab = (k, c) => {
    for (let i = 0; i < 26; i++) {
      const q = Math.floor(rnd(i * 7 + k) * 21) - 2;
      const w = Math.floor(rnd(i * 13 + k * 3) * 19);
      const x = -262 - 38 + q * 19;
      const y = -22 - 20.5 * 3 + w * 20.5;
      if (x >= ap.x0 && x + 19 <= ap.x1 && y >= ap.y0 && y + 20.5 <= ap.y1) R(x, y, x + 19, y + 20.5, c);
    }
  };
  slab(1, 'rgba(255,255,255,0.07)');
  slab(2, 'rgba(0,0,0,0.05)');
  for (const s of A.slots) R(s.x - 5, s.y - 9, s.x + 5, s.y + 12, 'rgba(40,36,30,0.09)');
  // Gummiabrieb in den Aufsetzzonen
  for (const r of A.runways) {
    for (const d of [1, -1]) {
      const x = d > 0 ? r.x0 : r.x1;
      R(x + d * 46, r.y - 6, x + d * 170, r.y + 6, RUBBER);
      R(x + d * 36, r.y - 10, x + d * 230, r.y + 10, RUBBER2);
    }
  }
  // Fugen im Beton (im Raster der Stellplätze)
  for (let x = -262 - 38; x < ap.x1 - 2; x += 19) L(x, ap.y0, x, ap.y1, JOINT, 0.6, true);
  for (let y = -22 - 20.5 * 3; y < ap.y1 - 2; y += 20.5) if (y > ap.y0 + 2) L(ap.x0, y, ap.x1, y, JOINT, 0.6, true);
  for (let x = HAPRON.x0 + 19; x < HAPRON.x1 - 2; x += 19) L(x, HAPRON.y0, x, HAPRON.y1, JOINT, 0.6, true);
  for (let y = HAPRON.y0 + 18; y < HAPRON.y1 - 2; y += 18) L(HAPRON.x0, y, HAPRON.x1, y, JOINT, 0.6, true);
  // Weiß, Flächen: Schwellen, Zielpunkt, Aufsetzzone
  for (const r of A.runways) {
    for (const d of [1, -1]) {
      const x = d > 0 ? r.x0 : r.x1;
      for (const c of [-12.5, -9.5, -6.5, -3.5, 3.5, 6.5, 9.5, 12.5]) R(x + d * 4, r.y + c - 1, x + d * 20, r.y + c + 1, WHITE);
      for (const c of [-7, 7]) R(x + d * 58, r.y + c - 1.5, x + d * 80, r.y + c + 1.5, WHITE);
      [[92, [4.5, 7.5, 10.5]], [114, [4.5, 7.5]], [136, [4.5]]].forEach(([a, cs]) => {
        for (const c of cs) for (const s of [-1, 1]) R(x + d * a, r.y + s * c - 0.9, x + d * (a + 10), r.y + s * c + 0.9, WHITE, true);
      });
    }
  }
  // Weiß, Linien: Randlinien, Mittellinie, Kennziffern, Betriebsstraße, Parkplatz, Straße
  A.runways.forEach((r, i) => {
    for (const s of [-1, 1]) L(r.x0 + 2, r.y + s * 15.5, r.x1 - 2, r.y + s * 15.5, WHITE, 1.1);
    for (let x = r.x0 + 58; x < r.x1 - 58 - 14; x += 28) L(x, r.y, x + 15, r.y, WHITE, 1.5);
    for (const d of [1, -1]) {
      const xt = d > 0 ? r.x0 : r.x1;
      const num = d > 0 ? '09' : '27';
      const side = (i === 0) === d > 0 ? 'L' : 'R';
      const S = 6;
      const W = 7;
      const put = (ch, a0, off) => {
        for (const [gx0, gy0, gx1, gy1] of glyph(ch)) {
          const P = (gx, gy) => [xt + d * (a0 + (2 - gy) * S), r.y + d * (off + (gx - 0.5) * W)];
          L(...P(gx0, gy0), ...P(gx1, gy1), WHITE, 1.3, true);
        }
      };
      put(num[0], 24, -5.5);
      put(num[1], 24, 5.5);
      put(side, 40, 0);
    }
  });
  L(ap.x0, 273, ap.x1, 273, WHITE, 0.8, true);
  for (let x = ap.x0 + 4; x < ap.x1 - 8; x += 16) L(x, 286.5, x + 8, 286.5, WHITE, 0.8, true);
  for (let x = PARK.x0 + 4; x <= PARK.x1 - 4; x += 10) {
    L(x, PARK.y0 + 2, x, PARK.y0 + 16, WHITE, 0.7, true);
    L(x, PARK.y1 - 16, x, PARK.y1 - 2, WHITE, 0.7, true);
  }
  for (let y = ROAD.y0 + 6; y < ROAD.y1 - 4; y += 16) L(214, y, 214, y + 8, WHITE, 0.8, true);
  // Gelb: Mittellinien, Haltelinien, Rollgassen, Stellplätze, Hangar, Vorfeldrand
  L(T.x0, T.y, T.x1, T.y, YEL, 1.2);
  for (const x of ends) {
    L(x, r1s, x, r2n, YEL, 1.2);
    L(x, r2s, x, T.y, YEL, 1.2);
  }
  for (const x of mids) L(x, r2s, x, T.y, YEL, 1.2);
  const hold = (x, ye, s) => {
    for (const o of [9, 10.8]) L(x - hw, ye + s * o, x + hw, ye + s * o, YEL, 0.9, true);
    for (const o of [4, 5.8]) for (let a = x - hw + 0.5; a < x + hw - 1; a += 4.5) L(a, ye + s * o, a + 2.5, ye + s * o, YEL, 0.9, true);
  };
  for (const x of ends) {
    hold(x, r2s, 1);
    hold(x, r2n, -1);
    hold(x, r1s, 1);
  }
  for (const x of mids) hold(x, r2s, 1);
  const cols = A.slots.slice(0, 5).map((s) => s.x);
  const rows = [];
  for (let k = 0; k < A.slots.length; k += 5) rows.push(A.slots[k].y);
  const gaps = [...rows.map((y) => y - ROW_GAP), rows[rows.length - 1] + ROW_GAP];
  for (const x of cols) L(x + LANE, T.y, x + LANE, gaps[gaps.length - 1], YEL, 1.1);
  for (const y of gaps) L(cols[0], y, cols[cols.length - 1] + LANE, y, YEL, 1.1);
  for (const s of A.slots) {
    L(s.x, s.y + ROW_GAP, s.x, s.y - ROW_GAP, YEL, 1.1);
    L(s.x - 7, s.y - 24, s.x + 7, s.y - 24, YEL, 1.8, true);
  }
  const hs = HX.slice(0, Math.max(1, lv));
  L(cols[cols.length - 1] + LANE, 28, hs[hs.length - 1], 28, YEL, 1.1);
  for (const x of hs) L(x - 4, 28, x - 4, HAPRON.y0, YEL, 1.1);
  L(ap.x0 + 2, ap.y0, ap.x0 + 2, ap.y1 - 2, YEL, 1);
  L(ap.x0 + 2, ap.y1 - 2, ap.x1 - 2, ap.y1 - 2, YEL, 1);
  L(ap.x1 - 2, HAPRON.y1, ap.x1 - 2, ap.y1 - 2, YEL, 1);
  // Rot: Gerätefelder (schraffiert) links der ersten Spalte
  for (const y of [-40, 42, 124, 206]) {
    const x0 = ap.x0 + 3;
    const x1 = cols[0] - 18;
    for (const [a, b, c2, d] of [[x0, y, x1, y], [x1, y, x1, y + 34], [x1, y + 34, x0, y + 34], [x0, y + 34, x0, y]]) L(a, b, c2, d, RED, 0.8, true);
    for (let k = 0; k < 4; k++) L(x0, y + 8 + k * 8, x1, y + k * 8, RED, 0.6, true);
  }
  // Befeuerung: Bahnränder, Anflug, Rollweg (blau), PAPI, Schwellen (grün)
  const dot = (x, y, c, s = 0.9) => R(x - s, y - s, x + s, y + s, c, true);
  for (const r of A.runways) {
    for (let x = r.x0 + 6; x <= r.x1 - 6; x += 24) for (const s of [-1, 1]) dot(x, r.y + s * 17.4, LIGHT);
    for (const d of [1, -1]) {
      const x = d > 0 ? r.x0 : r.x1;
      for (const a of [6, 12, 18]) dot(x - d * a, r.y, LIGHT);
      for (const c of [-8, -4, 4, 8]) dot(x - d * 12, r.y + c, LIGHT);
    }
  }
  for (let x = T.x0; x <= T.x1; x += 32) {
    if ([...ends, ...mids].some((c) => Math.abs(c - x) < hw + 4)) continue;
    dot(x, T.y - hw - 1.5, BLUE, 0.8);
    dot(x, T.y + hw + 1.5, BLUE, 0.8);
  }
  for (const x of [...ends, ...mids]) {
    for (let y = r2s + 6; y < tn - 2; y += 14) for (const s of [-1, 1]) dot(x + s * (hw + 1.5), y, BLUE, 0.8);
    if (ends.includes(x)) for (let y = r1s + 6; y < r2n - 2; y += 14) for (const s of [-1, 1]) dot(x + s * (hw + 1.5), y, BLUE, 0.8);
  }
  A.runways.forEach((r) => {
    for (const d of [1, -1]) {
      const x = d > 0 ? r.x0 : r.x1;
      const yl = r.y - d * 24; // links vom Anflug
      for (let k = 0; k < 4; k++) dot(x + d * (68 + k * 4), yl, k < 2 ? '#ffffff' : '#ff4a3a', 1.1);
    }
  });
  for (const r of A.runways) for (const x of [r.x0 + 0.8, r.x1 - 0.8]) L(x, r.y - 17, x, r.y + 17, GREEN, 1.6, true);
  return out;
}

// ---------- Bauteile (Iso) ----------

const METAL = '#b4bbbe'; // Wellblech der Hangars
const ROOF = '#8f989d';
const DOOR = '#c9ced0';
const CONCW = '#d9d5ca'; // helle Betonwand
const OLIVE = '#5f6b3e';
const FIRE = '#c62d22';

/** Punkt auf einem Tonnendach (wie vault in isokit.js): Winkel t (0 … π quer), Lage a längs. */
const vaultAt = (M, cm, w, h, rh, t, a) => M(a, cm - w * Math.cos(t), h + rh * Math.sin(t));

/** Ziffer als Striche auf einer Wand: pt(along, h); Mitte a, Unterkante h0, Höhe 2·s, Breite s; dir = ±1 (Leserichtung). */
function digitOn(g, pt, ch, a, h0, s, dir, color, w = 1.2) {
  for (const [x0, y0, x1, y1] of glyph(ch)) stroke(g, [pt(a + dir * (x0 - 0.5) * s, h0 + (2 - y0) * s), pt(a + dir * (x1 - 0.5) * s, h0 + (2 - y1) * s)], color, w);
}

/** Schlepper (gelb) längs axis bei (u, v). */
function tug(g, u, v, along) {
  const U = along === 'u';
  const bx = (a0, a1, c0, c1, h0, h1, col) => (U ? box(g, u + a0, u + a1, v + c0, v + c1, h0, h1, col) : box(g, u + c0, u + c1, v + a0, v + a1, h0, h1, col));
  if (U) flat(g, u - 4, u + 4.6, v - 2.6, v + 3.8, 'rgba(0,0,0,0.22)');
  else flat(g, u - 2.6, u + 3.2, v - 4, v + 5.2, 'rgba(0,0,0,0.22)');
  bx(-4, 4, -2.4, 2.4, 0.5, 2.6, '#d9a21b');
  bx(-3.6, -0.8, -1.8, 1.8, 2.6, 4.6, '#2c3a47');
  bx(-3.8, -0.6, -2, 2, 4.6, 5, '#e3b02c');
}

/** Militärjeep (oliv) längs axis. */
function jeep(g, u, v, along) {
  car(g, u, v, along, OLIVE);
}

/**
 * Hangar mit Tonnendach: Achse längs a (−38 … 38), quer c (Schale −30 … 22, Anbau 22 … 31). Tor im sichtbaren Giebel bei a = 38
 * (halb offen, drinnen ein Jet), Werkstattanbau an der sichtbaren Längsseite, Oberlichter und Lüfter, Band in Teamfarbe, Nummer.
 */
function hangar(g, team, n, axis) {
  const { P } = g;
  const AV = axis === 'v';
  const M = AV ? (a, c, h) => P(c, a, h) : (a, c, h) => P(a, c, h);
  const BX = (a0, a1, c0, c1, h0, h1, wall, top) => (AV ? box(g, c0, c1, a0, a1, h0, h1, wall, top) : box(g, a0, a1, c0, c1, h0, h1, wall, top));
  const gFace = AV ? 's' : 'e';
  const sFace = AV ? 'e' : 's';
  const a0 = -38;
  const a1 = 38;
  const c0 = -30;
  const c1 = 22;
  const H = 10;
  const RH = 22;
  const cm = (c0 + c1) / 2;
  const w = (c1 - c0) / 2;
  if (AV) shadow(g, c0, c1 + 9, a0, a1, H + RH);
  else shadow(g, a0, a1, c0, c1 + 9, H + RH);
  BX(a0, a1, c0, c1, 0, H, METAL);
  if (AV) ribs(g, c0, c1, a0, a1, 1, H - 0.3, 2.2);
  else ribs(g, a0, a1, c0, c1, 1, H - 0.3, 2.2);
  if (AV) vault(g, 'v', c0, c1, a0, a1, H, RH, ROOF, METAL, 14);
  else vault(g, 'u', a0, a1, c0, c1, H, RH, ROOF, METAL, 14);
  // Oberlichter auf der vorderen Dachhälfte, Lüfter auf dem First
  const sky = lit('#a9cddd', ...(AV ? [0.5, 0, 0.86] : [0, 0.5, 0.86]));
  for (let a = a0 + 6; a < a1 - 8; a += 16) {
    const q = [vaultAt(M, cm, w + 0.9, H, RH, 0.62 * Math.PI, a), vaultAt(M, cm, w + 0.9, H, RH, 0.62 * Math.PI, a + 10), vaultAt(M, cm, w + 0.9, H, RH, 0.7 * Math.PI, a + 10), vaultAt(M, cm, w + 0.9, H, RH, 0.7 * Math.PI, a)];
    poly(g, q, sky, 'rgba(60,80,90,0.45)');
  }
  for (const a of [-24, 0, 24]) {
    const [u, v] = AV ? [cm, a] : [a, cm];
    fan(g, u, v, H + RH - 0.4, 2.2);
  }
  // Tor: sechs Flügel, die mittleren zwei aufgeschoben; drinnen dunkel mit Jet
  const gpt = onFace(g, gFace, a1);
  const dir = AV ? 1 : -1; // Leserichtung auf dem Giebel
  const d0 = -25;
  const d1 = 17;
  const DH = 19;
  const pw = (d1 - d0) / 6;
  const open0 = d0 + pw * 2;
  const open1 = d0 + pw * 4;
  poly(g, [gpt(d0 - 0.8, 0), gpt(d1 + 0.8, 0), gpt(d1 + 0.8, DH + 0.9), gpt(d0 - 0.8, DH + 0.9)], lit('#5d6468', ...FACE[gFace]), null);
  poly(g, [gpt(open0, 0), gpt(open1, 0), gpt(open1, DH), gpt(open0, DH)], '#22272b', null);
  // Jet im Hangar: Rumpf, Kanzel, Flügel von vorn
  const jm = (open0 + open1) / 2;
  if (g.fine) {
    const { ctx, z } = g;
    stroke(g, [gpt(jm - 6, 3.8, -2), gpt(jm + 6, 3.8, -2)], '#6e767b', 1.1); // Flügel
    stroke(g, [gpt(jm, 0, -2), gpt(jm, 2.6, -2)], '#2d3134', 0.8); // Bugrad
    const [x, y] = gpt(jm, 4.2, -2);
    ctx.beginPath();
    ctx.ellipse(x, y, 1.9 * z, 1.9 * z, 0, 0, TAU);
    ctx.fillStyle = '#8e969b';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y - 2.3 * z, 1.1 * z, 1.4 * z, 0, 0, TAU);
    ctx.fillStyle = '#c8a54a'; // Kanzel (goldbedampft)
    ctx.fill();
  }
  // Flügel: die geöffneten liegen vor den äußeren
  const panel = (p0, p1, off, col) => {
    poly(g, [gpt(p0, 0, off), gpt(p1, 0, off), gpt(p1, DH, off), gpt(p0, DH, off)], lit(col, ...FACE[gFace]), OUTLINE);
    if (g.fine) for (let k = 2.5; k < DH - 1; k += 2.5) stroke(g, [gpt(p0 + 0.3, k, off), gpt(p1 - 0.3, k, off)], 'rgba(0,0,0,0.1)', 0.4);
  };
  panel(d0, d0 + pw, 0, DOOR);
  panel(d1 - pw, d1, 0, DOOR);
  panel(d0 + pw * 0.95, d0 + pw * 1.95, 0.9, tint(DOOR, 0.05));
  panel(d1 - pw * 1.95, d1 - pw * 0.95, 0.9, tint(DOOR, 0.05));
  // Torsturz mit Band in Teamfarbe, Nummer, Lampe
  poly(g, [gpt(d0 - 1, DH + 0.9), gpt(d1 + 1, DH + 0.9), gpt(d1 + 1, DH + 2.6), gpt(d0 - 1, DH + 2.6)], lit(team, ...FACE[gFace]), null);
  digitOn(g, gpt, String(n + 1), cm, DH + 4.2, 2.6, dir, '#f4f2ea', 1.3);
  box(g, ...(AV ? [cm - 1.2, cm + 1.2, a1, a1 + 1.2] : [a1, a1 + 1.2, cm - 1.2, cm + 1.2]), DH + 11, DH + 12, '#f1df9a', '#55595d');
  // Werkstattanbau an der Längsseite mit Fenstern und Tür
  const W0 = -30;
  const W1 = 14;
  BX(W0, W1, c1, c1 + 9, 0, 12, '#d4d1c6', DECK);
  if (AV) wallBand(g, c1, c1 + 9, W0, W1, 10.4, 11.4, team);
  else wallBand(g, W0, W1, c1, c1 + 9, 10.4, 11.4, team);
  strip(g, sFace, c1 + 9, W0 + 3, W1 - 9, 4.6, 8.4, 3);
  door(g, sFace, c1 + 9, W1 - 4.5, 3.4, 7, '#55606a');
  door(g, gFace, W1, c1 + 4.5, 3.4, 7, '#55606a');
  acUnit(g, ...(AV ? [c1 + 4.5, -16] : [-16, c1 + 4.5]), 12, 2);
  // Schlepper oder Tankwagen vor dem Tor
  if (n % 2 === 0) tug(g, ...(AV ? [cm + 9, a1 + 9] : [a1 + 9, cm + 9]), AV ? 'v' : 'u');
  else lorry(g, ...(AV ? [cm + 14, a1 + 10] : [a1 + 10, cm + 14]), AV ? 'v' : 'u', OLIVE, 'tank', { tank: '#8c9466', band: team });
}

/** Glaskanzel des Towers: schräge Scheiben (r0 unten, r1 oben) mit Sprossen auf der sichtbaren Hälfte. */
function cab(g, u, v, r0, r1, h0, h1) {
  const { P, ctx, z } = g;
  frustum(g, u, v, r0, r1, h0, h1, '#4d7591', false);
  if (!g.fine) return;
  for (let k = 0; k < 10; k++) {
    const t = -Math.PI / 4 + (k / 9) * Math.PI;
    const a = [u + r0 * Math.cos(t), v + r0 * Math.sin(t)];
    const b = [u + r1 * Math.cos(t), v + r1 * Math.sin(t)];
    stroke(g, [P(a[0], a[1], h0), P(b[0], b[1], h1)], 'rgba(30,38,44,0.75)', 0.6);
  }
  const [x, y] = P(u, v, h0 + (h1 - h0) * 0.62);
  ctx.beginPath();
  ctx.ellipse(x - r1 * 0.3 * z, y, r1 * 0.32 * z, r1 * 0.09 * z, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();
}

/** Tower: zweigeschossiger Betriebsbau, runder Schaft, Kanzel mit Umgang, Dach mit Antennen und Radarschüssel. */
function tower(g, team) {
  const { P } = g;
  walls(g, -24, 24, -24, 24, 14, CONCW, { band: team });
  strip(g, 's', 24, -20, -6, 3.2, 6.4, 3);
  strip(g, 's', 24, -20, 20, 8.6, 11.4, 3);
  strip(g, 'e', 24, -20, 20, 3.2, 6.4, 3);
  strip(g, 'e', 24, -20, 20, 8.6, 11.4, 3);
  door(g, 's', 24, 6, 6, 6.4, '#4f5a63');
  box(g, 1, 11, 24, 29, 6.6, 7.4, '#6d7174', '#7d8184'); // Vordach
  parapet(g, -24, 24, -24, 24, 14, CONCW, DECK);
  acUnit(g, -14, -14, 14, 2.4);
  acUnit(g, 14, -12, 14, 2.4);
  dish(g, -15, 12, 14, 3.2);
  shadowRound(g, 4, 2, 8, 70, 0.18);
  cyl(g, 4, 2, 7.5, 14, 64, '#e4e1d8', false);
  if (g.fine) {
    const a = P(4 - 1.2, 2 + 7.4, 18);
    const b = P(4 - 1.2, 2 + 7.4, 60);
    stroke(g, [a, b], 'rgba(52,80,109,0.75)', 1.4); // Fensterschlitz des Treppenhauses
  }
  band(g, 4, 2, 7.5, 40, 41.2, '#c9c5ba');
  cyl(g, 4, 2, 13.5, 64, 68, '#d6d2c8'); // Boden der Kanzel
  cab(g, 4, 2, 12, 14.6, 68, 78);
  cyl(g, 4, 2, 15.6, 78, 80.6, '#4a4f53'); // Dach
  const { ctx, z } = g;
  // Umgang
  const [x, y] = P(4, 2, 68);
  ctx.beginPath();
  ctx.ellipse(x, y, 14.6 * z, 7.3 * z, 0, 0, Math.PI);
  ctx.strokeStyle = 'rgba(60,64,68,0.8)';
  ctx.lineWidth = Math.max(0.6, 0.7 * z);
  ctx.stroke();
  stroke(g, [P(-2, 0, 80.6), P(-2, 0, 94)], '#6b7177', 0.8);
  stroke(g, [P(9, 5, 80.6), P(9, 5, 89)], '#6b7177', 0.7);
  dish(g, 6, -4, 80.6, 2.6);
  flagpole(g, 20, 30, 0, 22, team);
}

/** Staffelgebäude: dreigeschossiger Block mit Fensterbändern, gläserner Eingangshalle mit Vordach, Fahnen. */
function ops(g, team) {
  const W = '#ddd6c6';
  walls(g, -40, 40, -26, 16, 20, W, { band: team });
  for (const [h0, h1] of [[3, 5.8], [8.6, 11.4], [14.2, 17]]) {
    strip(g, 's', 16, -36, -12, h0, h1, 3);
    strip(g, 's', 16, 12, 36, h0, h1, 3);
    strip(g, 'e', 40, -22, 12, h0, h1, 3);
  }
  parapet(g, -40, 40, -26, 16, 20, W, DECK);
  acUnit(g, -26, -14, 20, 2.6);
  acUnit(g, -14, -14, 20, 2.6);
  acUnit(g, 24, -8, 20, 2.6);
  dish(g, 30, 6, 20, 3);
  // Eingangshalle aus Glas mit Vordach
  shadow(g, -10, 10, 16, 26, 12, 0.14);
  box(g, -10, 10, 16, 26, 0, 12, '#5f8aa6', '#7a8a96');
  if (g.fine) {
    const pt = onFace(g, 's', 26);
    for (let a = -8; a < 10; a += 4) stroke(g, [pt(a, 0), pt(a, 12)], 'rgba(230,236,240,0.6)', 0.45);
    const pe = onFace(g, 'e', 10);
    for (let a = 18; a < 26; a += 4) stroke(g, [pe(a, 0), pe(a, 12)], 'rgba(230,236,240,0.6)', 0.45);
  }
  door(g, 's', 26, 0, 5, 6.5, '#2f3b46');
  box(g, -14, 14, 16, 31, 12, 13.2, '#e8e4da', '#cfcac0');
  // Hecken, Fahnen, Laternen
  box(g, 16, 38, 24, 28, 0, 2.6, HEDGE, tint(HEDGE, 0.12));
  box(g, -38, -16, 24, 28, 0, 2.6, HEDGE, tint(HEDGE, 0.12));
  flagpole(g, -30, 33, 0, 22, team);
  flagpole(g, -24, 33, 0, 22, '#e8e4da');
  flagpole(g, -18, 33, 0, 22, team);
  lamp(g, 30, 33, 9);
  lamp(g, 6, 34, 9);
}

/** Tanklager: Auffangwanne mit 2 bis 4 Tanks (Band in Teamfarbe), Rohre zum Pumpenhaus, Ladestelle mit Tankwagen. */
function fuel(g, team, lv) {
  flat(g, -34, 34, -40, 22, '#a39d90');
  bund(g, -34, 34, -40, 22, 'back');
  const tanks = [[-16, -22, 12, 18], [16, -22, 12, 18]];
  if (lv >= 2) tanks.push([-16, 6, 11, 16]);
  if (lv >= 3) tanks.push([16, 6, 9, 14]);
  for (const [u, v, r, H] of tanks) tank(g, u, v, r, H, { band: team });
  bund(g, -34, 34, -40, 22, 'front');
  // Rohre zur Ladestelle
  pipe(g, [[-16, -22, 2], [-16, 30, 2]], 1.2);
  pipe(g, [[16, -22, 2], [16, 0, 2], [0, 0, 2], [0, 30, 2]], 1.2);
  // Pumpenhaus und Ladebrücke mit Tankwagen
  walls(g, 18, 32, 28, 40, 8, '#cfc9bb');
  parapet(g, 18, 32, 28, 40, 8, '#cfc9bb', DECK);
  door(g, 's', 40, 25, 3, 5.6, '#55606a');
  for (const u of [-24, 8]) stroke(g, [g.P(u, 30, 0), g.P(u, 30, 11)], '#6b7177', 1);
  lorry(g, -8, 37, 'u', OLIVE, 'tank', { tank: '#8c9466', band: team });
  for (const u of [-24, 8]) stroke(g, [g.P(u, 44, 0), g.P(u, 44, 11)], '#6b7177', 1);
  box(g, -26, 10, 29, 45, 11, 12.4, '#9aa1a8', snowy('#b9bfc4')); // Dach der Ladebrücke
}

/** Feuerwehrfahrzeug (rot, weißer Streifen, Blaulicht), längs axis, Front nach +a. */
function fireTruck(g, u, v, along, ladder = false) {
  const U = along === 'u';
  const L = 8;
  const W = 2.6;
  const bx = (a0, a1, c0, c1, h0, h1, col, top) => (U ? box(g, u + a0, u + a1, v + c0, v + c1, h0, h1, col, top) : box(g, u + c0, u + c1, v + a0, v + a1, h0, h1, col, top));
  if (U) flat(g, u - L, u + L + 0.6, v - W, v + W + 1.8, 'rgba(0,0,0,0.22)');
  else flat(g, u - W, u + W + 0.8, v - L, v + L + 1.6, 'rgba(0,0,0,0.22)');
  for (const a of [-5.5, -2.5, 5]) bx(a - 1, a + 1, W - 0.4, W + 0.1, 0, 1.9, '#2f3134');
  bx(-L, L - 3.4, -W, W, 0.8, 6.4, FIRE, tint(FIRE, 0.08));
  bx(L - 3.4, L, -W, W, 0.8, 5.6, FIRE, tint(FIRE, 0.1));
  const { P } = g;
  if (U) {
    poly(g, [P(u - L, v + W, 3), P(u + L, v + W, 3), P(u + L, v + W, 3.8), P(u - L, v + W, 3.8)], lit('#f2efe6', ...FACE.s), null);
    poly(g, [P(u + L, v - W + 0.4, 3.4), P(u + L, v + W - 0.4, 3.4), P(u + L, v + W - 0.4, 5.1), P(u + L, v - W + 0.4, 5.1)], lit('#2c3a47', ...FACE.e), null);
  } else {
    poly(g, [P(u + W, v - L, 3), P(u + W, v + L, 3), P(u + W, v + L, 3.8), P(u + W, v - L, 3.8)], lit('#f2efe6', ...FACE.e), null);
    poly(g, [P(u - W + 0.4, v + L, 3.4), P(u + W - 0.4, v + L, 3.4), P(u + W - 0.4, v + L, 5.1), P(u - W + 0.4, v + L, 5.1)], lit('#2c3a47', ...FACE.s), null);
  }
  bx(L - 2.6, L - 1, -1.6, 1.6, 5.6, 6.4, '#3d7bf0', '#7fb0ff');
  if (ladder) {
    for (const c of [-1.2, 1.2]) stroke(g, U ? [P(u - L - 1.5, v + c, 7), P(u + L - 3.6, v + c, 7)] : [P(u + c, v - L - 1.5, 7), P(u + c, v + L - 3.6, 7)], '#d9dcdf', 0.6);
  }
}

/** Feuerwache: Fahrzeughalle mit drei Toren (eines offen), Obergeschoss, Schlauchturm, zwei Löschfahrzeuge davor. */
function fire(g, team) {
  const W = '#e6e0d3';
  walls(g, -40, 24, -28, 12, 16, W, { band: FIRE });
  const doors = [-30, -14, 2];
  doors.forEach((a, k) => {
    if (k === 1) {
      const pt = onFace(g, 's', 12);
      poly(g, [pt(a - 6.6, 0), pt(a + 6.6, 0), pt(a + 6.6, 11.6), pt(a - 6.6, 11.6)], lit(FIRE, ...FACE.s), null);
      poly(g, [pt(a - 6, 0), pt(a + 6, 0), pt(a + 6, 11), pt(a - 6, 11)], '#262a2d', null);
    } else gate(g, 's', 12, a, 12, 11, '#d8dadb');
  });
  strip(g, 's', 12, -38, 10, 12.4, 14.6, 3);
  strip(g, 'e', 24, -24, 8, 4, 7, 3);
  strip(g, 'e', 24, -24, 8, 12.4, 14.6, 3);
  parapet(g, -40, 24, -28, 12, 16, W, DECK);
  // Schlauchturm
  walls(g, 24, 34, -28, -16, 34, W, { band: FIRE });
  for (const h of [12, 20, 28]) wins(g, 'e', 34, -26, -18, 1, [[h, h + 3]], 2.4);
  parapet(g, 24, 34, -28, -16, 34, W, DECK);
  flagpole(g, 29, -22, 34, 10, team);
  // Löschfahrzeuge vor der Halle
  fireTruck(g, -30, 23, 'v', true);
  fireTruck(g, 2, 22, 'v');
}

/** Radar: umzäunter Platz, Gerätecontainer, Gitterturm mit Plattform; die Antenne dreht sich (drawRadarAntenna, jedes Bild). */
function radar(g) {
  flat(g, -16, 16, -16, 16, '#a39d90');
  fence(g, -16, 16, -16, 16, 'back');
  walls(g, 4, 14, 2, 14, 7, '#d3d0c6');
  parapet(g, 4, 14, 2, 14, 7, '#d3d0c6', DECK);
  door(g, 's', 14, 9, 2.6, 5, '#55606a');
  shadowRound(g, -5, -5, 5, 38, 0.16);
  mast(g, -5, -5, 0, 34, 5, 3, '#c9cdd0', false);
  box(g, -9, -1, -9, -1, 34, 35.4, '#9aa1a8', '#b9bfc4');
  cyl(g, -5, -5, 1.2, 35.4, 38, '#6b7177');
  fence(g, -16, 16, -16, 16, 'front');
}

/** Drehende Radarantenne über dem Turm (jedes Bild neu): Reflektor als gebogene Fläche, Winkel t. */
function radarAntenna(g, t) {
  const { P, ctx, z } = g;
  const u = -5;
  const v = -5;
  const L = 9;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const pts = [];
  for (let k = 0; k <= 8; k++) {
    const q = (k / 8) * 2 - 1;
    const bow = (1 - q * q) * 1.6; // nach vorn gewölbt
    pts.push([u + c * q * L - s * bow, v + s * q * L + c * bow]);
  }
  const top = pts.map(([a, b]) => P(a, b, 43));
  const bot = pts.map(([a, b]) => P(a, b, 39));
  const face = Math.cos(t) * 0.7 + Math.sin(t) * 0.7; // zur Kamera?
  ctx.beginPath();
  top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
  ctx.closePath();
  ctx.fillStyle = face > 0 ? '#eef0f1' : '#b8bec3';
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.6 * z);
  ctx.stroke();
  stroke(g, [P(u, v, 38), P(u - s * 3.4, v + c * 3.4, 41)], '#55595d', 0.7);
}

/** Parkplatz: Autos je Stufe (und ein Jeep), Laternen. */
function park(g, lv) {
  const n = [0, 4, 6, 9][lv];
  const spots = [];
  for (let k = 0; k < 8; k++) spots.push([-37 + k * 10, -18]);
  for (let k = 0; k < 8; k++) spots.push([-37 + k * 10, 18]);
  const pick = [1, 4, 6, 9, 12, 2, 14, 7, 10];
  for (let i = 0; i < n; i++) {
    const [u, v] = spots[pick[i]];
    if (i === 2) jeep(g, u, v, 'v');
    else car(g, u, v, 'v', CAR_COLORS[(i * 3 + 1) % CAR_COLORS.length]);
  }
  lamp(g, -42, 0, 10);
  lamp(g, 0, 0, 10);
  lamp(g, 40, 0, 10);
}

/** Flutlichtmast am Vorfeld. */
function flood(g) {
  const { P } = g;
  stroke(g, [P(0, 0, 0), P(0, 0, 37)], '#6b7177', 1.4);
  box(g, -3.2, 3.2, -1.2, 1.2, 36, 38.6, '#d4d6d2', '#9aa0a5');
  const pt = onFace(g, 's', 1.2);
  if (g.fine) for (const a of [-2.2, 0, 2.2]) poly(g, [pt(a - 0.8, 36.6), pt(a + 0.8, 36.6), pt(a + 0.8, 38), pt(a - 0.8, 38)], '#fff3c4', null);
}

/** Windsack auf einem Mast (rot-weiß gestreift, nach Osten). */
function sock(g) {
  const { P } = g;
  stroke(g, [P(0, 0, 0), P(0, 0, 15)], '#d9d6cc', 0.9);
  const seg = 4;
  for (let k = 0; k < seg; k++) {
    const a0 = 1 + k * 2.6;
    const a1 = a0 + 2.6;
    const r0 = 1.5 - k * 0.22;
    const r1 = r0 - 0.22;
    const drop = 0.5 * k;
    poly(g, [P(a0, 0.6, 14.6 - drop + r0), P(a1, 0.8, 14.6 - drop - 0.5 + r1), P(a1, 0.8, 14.6 - drop - 0.5 - r1), P(a0, 0.6, 14.6 - drop - r0)], k % 2 ? '#f2efe6' : '#e2572f', OUTLINE);
  }
}

// ---------- Bauteile von oben (2D) ----------

function hangarTop(c, team, n) {
  shadowTop(c, -30, -38, 31, 38, 32);
  vaultTop(c, -30, -38, 22, 38, 'v', ROOF, false);
  for (let y = -32; y < 30; y += 16) rectS(c, 6, y, 12, y + 10, '#a9cddd', 'rgba(60,80,90,0.5)', 0.35);
  for (const y of [-24, 0, 24]) circle(c, -4, y, 2, '#8d9398');
  flatTop(c, 22, -30, 31, 14, '#d4d1c6');
  acTop(c, 26.5, -16, 2);
  rectF(c, -25, 37, 17, 39, '#5d6468');
  rectF(c, -11, 37.4, 3, 39, '#22272b');
  rectF(c, -26, 35.4, 18, 37, team);
  // Nummer auf dem Dach (von Süden lesbar)
  for (const [x0, y0, x1, y1] of glyph(String(n + 1))) lineT(c, [[-4 + (x0 - 0.5) * 7, 18 + y0 * 7], [-4 + (x1 - 0.5) * 7, 18 + y1 * 7]], '#f4f2ea', 1.6);
  if (n % 2 === 0) {
    rectF(c, -6.4, 42, -1.6, 50, 'rgba(0,0,0,0.25)');
    rectS(c, -7.4, 41, -2.6, 49, '#d9a21b', 'rgba(0,0,0,0.4)', 0.3);
  } else lorryTop(c, 0, 48, 'v', OLIVE, 'tank', { tank: '#8c9466', band: team });
}

function towerTop(c, team) {
  shadowTop(c, -24, -24, 24, 24, 14);
  flatTop(c, -24, -24, 24, 24, CONCW);
  rectF(c, -24, 22.6, 24, 24, team);
  acTop(c, -14, -14, 2.4);
  acTop(c, 14, -12, 2.4);
  dishTop(c, -15, 12, 3.2);
  roundShadow(c, 4, 2, 15.6, 94, 0.26);
  discTop(c, 4, 2, 15.6, '#4a4f53');
  ringTop(c, 4, 2, 13.9, '#4d7591', 1.6);
  dishTop(c, 6, -4, 2.6);
  circle(c, -2, 0, 1, '#ff4a3a');
  rectF(c, 20, 30, 28, 34, team);
}

function opsTop(c, team) {
  blockTop(c, -40, -26, 40, 16, 20, '#ddd6c6');
  rectF(c, -40, 14.6, 40, 16, team);
  acTop(c, -26, -14, 2.6);
  acTop(c, -14, -14, 2.6);
  acTop(c, 24, -8, 2.6);
  dishTop(c, 30, 6, 3);
  rectS(c, -14, 16, 14, 31, '#cfcac0', 'rgba(0,0,0,0.35)', 0.4);
  rectS(c, 16, 24, 38, 28, HEDGE);
  rectS(c, -38, 24, -16, 28, HEDGE);
  for (const [x, col] of [[-30, team], [-24, '#e8e4da'], [-18, team]]) rectF(c, x, 31, x + 5, 34, col);
}

function fuelTop(c, team, lv) {
  rectS(c, -34, -40, 34, 22, '#a39d90', '#bab5a9', 1.4);
  const tanks = [[-16, -22, 12], [16, -22, 12]];
  if (lv >= 2) tanks.push([-16, 6, 11]);
  if (lv >= 3) tanks.push([16, 6, 9]);
  for (const [x, y, r] of tanks) {
    roundShadow(c, x, y, r, 18);
    discTop(c, x, y, r, '#e9ecef');
    ringTop(c, x, y, r - 1.2, team, 1.2);
  }
  pipeTop(c, [[-16, -10], [-16, 30]], 1.2);
  pipeTop(c, [[16, -10], [16, 0], [0, 0], [0, 30]], 1.2);
  blockTop(c, 18, 28, 32, 40, 8, '#cfc9bb');
  lorryTop(c, -8, 37, 'u', OLIVE, 'tank', { tank: '#8c9466', band: team });
  rectF(c, -26, 29, 10, 45, 'rgba(185,191,196,0.55)');
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  c.lineWidth = 0.4;
  c.strokeRect(-26, 29, 36, 16);
}

function fireTruckTop(c, x, y, ladder) {
  rectF(c, x - 1.6, y - 7, x + 4.4, y + 9.4, 'rgba(0,0,0,0.25)');
  rectS(c, x - 2.6, y - 8, x + 2.6, y + 8, FIRE, 'rgba(0,0,0,0.45)', 0.35);
  rectF(c, x - 2.6, y + 4.6, x + 2.6, y + 8, tint(FIRE, 0.12));
  rectF(c, x - 1.6, y + 5.6, x + 1.6, y + 6.4, '#3d7bf0');
  if (ladder) for (const d of [-1.2, 1.2]) rectF(c, x + d - 0.3, y - 9, x + d + 0.3, y + 4, '#d9dcdf');
}

function fireTop(c, team) {
  blockTop(c, -40, -28, 24, 12, 16, '#e6e0d3');
  rectF(c, -40, 10.6, 24, 12, FIRE);
  blockTop(c, 24, -28, 34, -16, 34, '#e6e0d3');
  rectF(c, 28, -23, 33, -20, team);
  fireTruckTop(c, -30, 23, true);
  fireTruckTop(c, 2, 22, false);
}

function radarTop(c) {
  rectS(c, -16, -16, 16, 16, '#a39d90', 'rgba(66,72,78,0.8)', 0.6);
  blockTop(c, 4, 2, 14, 14, 7, '#d3d0c6');
  latticeTop(c, -5, -5, 4, 38, '#c9cdd0');
}

function parkTop(c, lv) {
  const n = [0, 4, 6, 9][lv];
  const spots = [];
  for (let k = 0; k < 8; k++) spots.push([-37 + k * 10, -18]);
  for (let k = 0; k < 8; k++) spots.push([-37 + k * 10, 18]);
  const pick = [1, 4, 6, 9, 12, 2, 14, 7, 10];
  for (let i = 0; i < n; i++) {
    const [x, y] = spots[pick[i]];
    carTop(c, x, y, 'v', i === 2 ? OLIVE : CAR_COLORS[(i * 3 + 1) % CAR_COLORS.length]);
  }
  for (const x of [-42, 0, 40]) circle(c, x, 0, 1.1, '#f1df9a');
}

function floodTop(c) {
  lineT(c, [[0, 0], [8, 8]], 'rgba(0,0,0,0.25)', 1.4);
  rectS(c, -3.2, -1.2, 3.2, 1.2, '#d4d6d2', 'rgba(0,0,0,0.4)', 0.3);
}

function sockTop(c) {
  lineT(c, [[0, 0], [3, 3]], 'rgba(0,0,0,0.25)', 0.8);
  for (let k = 0; k < 4; k++) rectF(c, 1 + k * 2.6, -1.2 + k * 0.15, 3.6 + k * 2.6, 1.2 - k * 0.15, k % 2 ? '#f2efe6' : '#e2572f');
  circle(c, 0, 0, 0.9, '#d9d6cc');
}

// ---------- Schnittstelle ----------

const ROT_ODD = (rot) => (rot & 1) === 1;

/** Grenzen eines Iso-Bilds aus der örtlichen Ausdehnung (Schatten nach +v, Rand). */
function isoBounds(u0, u1, v0, v1, h) {
  const pad = 4;
  return [(u0 - v1 - 11) * K - pad, (u0 + v0) * K * 0.5 - h - pad, (u1 - v0) * K + pad, (u1 + v1 + 11) * K * 0.5 + pad];
}

function paintIso(ctx, s, p, color, axis) {
  const g = G(ctx, s);
  switch (p.id) {
    case 'hangar': return hangar(g, color, p.n, axis);
    case 'tower': return tower(g, color);
    case 'ops': return ops(g, color);
    case 'fuel': return fuel(g, color, p.lv);
    case 'fire': return fire(g, color);
    case 'radar': return radar(g);
    case 'park': return park(g, p.lv);
    case 'flood': return flood(g);
    case 'sock': return sock(g);
  }
}

function paintTop(ctx, s, p, color) {
  ctx.scale(s, s);
  switch (p.id) {
    case 'hangar': return hangarTop(ctx, color, p.n);
    case 'tower': return towerTop(ctx, color);
    case 'ops': return opsTop(ctx, color);
    case 'fuel': return fuelTop(ctx, color, p.lv);
    case 'fire': return fireTop(ctx, color);
    case 'radar': return radarTop(ctx);
    case 'park': return parkTop(ctx, p.lv);
    case 'flood': return floodTop(ctx);
    case 'sock': return sockTop(ctx);
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

/** Ein Körper des Flughafens isometrisch (Ankerpunkt = Mitte des Grundrisses, Höhe vom Renderer gesetzt). */
export function drawAirportIso(ctx, cam, p, color) {
  const swap = p.id === 'hangar' && ROT_ODD(cam.rot);
  const axis = swap ? 'u' : 'v';
  const snow = roofSnowOn() ? 1 : 0;
  const key = `ap|${p.id}|${p.lv}|${p.n}|${axis}|${color}|${snow}`;
  const [u0, u1, v0, v1, h] = EXT[p.id];
  const bounds = swap ? isoBounds(v0, v1, u0, u1, h) : isoBounds(u0, u1, v0, v1, h);
  const q = cam.worldToScreen(p.x, p.y);
  const z = cam.zoom;
  const dpr = spriteDpr();
  const e = sprite(key, z * dpr, bounds, (c, s) => paintIso(c, s, p, color, axis));
  if (e === false) return; // wird im nächsten Bild gemalt
  if (e) blit(ctx, e, q.x, q.y, z);
  else {
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.scale(1 / dpr, 1 / dpr);
    paintIso(ctx, z * dpr, p, color, axis);
    ctx.restore();
  }
  if (p.id === 'radar') {
    ctx.save();
    ctx.translate(q.x, q.y);
    radarAntenna(G(ctx, z), now() / 1100);
    ctx.restore();
  } else if (p.id === 'tower' && Math.floor(now() / 700) % 2 === 0) {
    // Warnlicht auf der Antenne blinkt
    const x = q.x + (-2 - 0) * K * z;
    const y = q.y + (-2 + 0) * K * 0.5 * z - 94.6 * z;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 5 * z);
    grad.addColorStop(0, 'rgba(255,90,70,0.95)');
    grad.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 5 * z, y - 5 * z, 10 * z, 10 * z);
  }
}

/** Ein Körper des Flughafens von oben (Weltkoordinaten, Kamera-Transformation gesetzt). */
export function drawAirportTop(ctx, p, color, zoom = 1) {
  const key = `apt|${p.id}|${p.lv}|${p.n}|${color}`;
  const [u0, u1, v0, v1] = EXT[p.id];
  const bounds = [u0 - 3, v0 - 3, u1 + 18, v1 + 18];
  const e = sprite(key, zoom * spriteDpr(), bounds, (c, s) => paintTop(c, s, p, color));
  if (e) blit(ctx, e, p.x, p.y, 1);
  else if (e === null) {
    ctx.save();
    ctx.translate(p.x, p.y);
    paintTop(ctx, 1, p, color);
    ctx.restore();
  }
  if (p.id === 'radar') {
    const t = now() / 1100;
    const c = Math.cos(t) * 9;
    const s = Math.sin(t) * 9;
    lineT(ctx, [[p.x - 5 - c, p.y - 5 - s], [p.x - 5 + c, p.y - 5 + s]], '#eef0f1', 2.2);
  }
}
