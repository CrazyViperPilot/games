// Fliegerhorst gemalt (seit v5.42, PRD §15; Bausteine seit v5.35, Stellplatz-Stufen seit v5.39): Stellplatz (Stufe 1 offen mit
// Bodenstromgerät, Feuerlöscher, Flutlicht und Leitkegeln; Stufe 2 Überdachung: Stahlstützen mit Kopfbändern, Fachwerkbinder,
// seitlicher Windschutz und Satteldach aus Wellblech; Stufe 3 Flugzeugschutzbau nach dem Vorbild der Hardened Aircraft Shelter:
// Betonröhre mit Tarnanstrich, Tor nach Norden wie die Nase des Jets mit beiseitegeschobenen Torflügeln, Rückwand mit Abgasöffnung,
// Erdanschüttung an den Seiten), Tower (Betriebsgebäude mit Glaskanzel, Windsack, Parkplatz; Radar ab Stufe 2, Wetterradar-Kuppel in
// Stufe 3), Kerosintank (2 bis 4 Tanks in einer Auffangwanne, Rohre, Pumpenhaus, Ladebühne mit Tankwagen) und Munitionslager (1 bis 3
// erdbedeckte Bunker mit Betonstirn und Stahltor, Blitzschutzmasten, Zaun mit Tor und Wache, Gabelstapler mit Munitionskisten;
// Wachturm in Stufe 3). Jedes Teil wird wie die Werke (works.js) über spritecache.js einmal je Maßstab gemalt (Bauteile aus isokit.js
// und works.js; Tower, Radar, Flutlicht und Windsack stammen vom alten Flughafen und stehen seit v5.56 hier). Überdachung und Shelter
// liegen in der Welt fest und werden je Drehung passend gemalt; sie liegen als ein
// Teil über dem abgestellten Jet (over), Dach und Röhre halb durchsichtig, damit der Jet zu sehen bleibt. Den Boden (Beton mit Fugen,
// Führungslinie, Parkplatz, Schotter) liefert airbaseGround für bigbuild.js. Örtliche Koordinaten ab der Mitte des Bausteins (±64):
// x nach Osten, y nach Süden. Nur Zeichnen, keine Spielregeln.
import { ISO_K } from './camera.js';
import { CITY } from '../data/city.js';
import {
  CAR_COLORS, DECK, FACE, G, OUTLINE, acTop, acUnit, band, box, car, carTop, circle, cyl, dish, dishTop, door, fence, flagpole,
  flat, flatTop, frustum, lamp, latticeTop, lineT, lit, mast, onFace, parapet, poly, polyF, rectF, rectS, shade, shadow, shadowTop,
  snowy, stroke, tint, wins,
} from './isokit.js';
import { roofSnowOn } from './season.js';
import { sprite, blit, spriteDpr } from './spritecache.js';
import {
  blockTop, bund, discTop, forklift, forkliftTop, lorry, lorryTop, pallet, palletTop, pipe, pipeTop, ringTop, roundShadow,
  shadowRound, strip, tank, walls,
} from './works.js';

const TAU = Math.PI * 2;
const K = ISO_K;
const ROT = [
  [1, 0, 0, 1],
  [0, -1, 1, 0],
  [-1, 0, 0, -1],
  [0, 1, -1, 0],
]; // wie camera.js
/** Weltrichtung (dx, dy) in Ansichtsachsen (u, v) bei Drehung rot. */
const view = (rot, dx, dy) => {
  const [a, b, c, d] = ROT[rot & 3];
  return [a * dx + b * dy, c * dx + d * dy];
};

const CONCW = '#d9d5ca'; // helle Betonwand (Tower)
const CONC = '#aba89e'; // Beton der Stellflächen
const JOINT = 'rgba(60,58,50,0.2)';
const SHELL = '#aeaa9e'; // Shelter
const HEAD = '#bcb8ac'; // Stirnwand des Shelters
const EARTH = '#7d6c4f';
const GRASS = '#7f9a52';
const GRASS2 = '#6f8a48';
const LAWN = '#86a05e';
const OLIVE = '#5f6b3e';
const YEL = '#e3c43a';
const WHITE = '#f2f0e6';
const RED = '#c0392b';
const TANKC = '#b3b896'; // Kerosintanks: helles Graugrün
const GRAVEL = '#9a978b';

// ---------- Boden (bigbuild.js zeichnet ihn je Bild, mit Gelände) ----------

/**
 * Boden eines Bausteins als Liste { t: 'rect' | 'line' | 'poly', …, c, w?, fine?, grass? } (örtlich, Zeichenfolge; gleiche Farben
 * hintereinander zeichnet bigbuild.js in einem Pfad). fine = nur bei genug Zoom, grass = im Winter Schnee.
 */
export function airbaseGround(k, lv, half) {
  const g = [];
  const h = half - 3;
  const rect = (x0, y0, x1, y1, c, o = {}) => g.push({ t: 'rect', x0, y0, x1, y1, c, ...o });
  const line = (x0, y0, x1, y1, c, w, o = {}) => g.push({ t: 'line', x0, y0, x1, y1, c, w, ...o });
  const blob = (x, y, rx, ry, c) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * TAU;
      pts.push([x + rx * Math.cos(t) * (1 + 0.18 * Math.sin(3 * t)), y + ry * Math.sin(t)]);
    }
    g.push({ t: 'poly', pts, c, fine: true });
  };
  const joints = (x0, y0, x1, y1, step = 32) => {
    for (let x = Math.ceil((x0 + 1) / step) * step; x < x1 - 1; x += step) line(x, y0, x, y1, JOINT, 0.7, { fine: true });
    for (let y = Math.ceil((y0 + 1) / step) * step; y < y1 - 1; y += step) line(x0, y, x1, y, JOINT, 0.7, { fine: true });
  };
  if (k === 'stand') {
    // Beton mit Fugen; Stufe 1 und 2 Führungslinie von Süden bis zur Haltemarke (Stufe 2 im Schatten des Dachs), Stufe 3 Linie vom
    // Tor im Norden in den Shelter, Torschienen, dunkler Innenraum und Warnschraffur hinter der Abgasöffnung
    rect(-h, -h, h, h, CONC);
    joints(-h, -h, h, h);
    const SLOT = CITY.air.standSlot * CITY.cell; // Abstand je Platz von der Mitte (zwei F-16 je Stellplatz)
    blob(2, 8, 7, 4, 'rgba(30,30,28,0.16)'); // Ölflecken unter dem Jet
    blob(-4, 18, 4, 2.5, 'rgba(30,30,28,0.12)');
    if (lv < 3) {
      for (const [a, b, c2, d] of [[-h + 5, -h + 5, h - 5, -h + 5], [h - 5, -h + 5, h - 5, h - 4], [-h + 5, -h + 5, -h + 5, h - 4]]) line(a, b, c2, d, WHITE, 1.3);
      // je Platz (zwei F-16 nebeneinander, CITY.air.standSlot = 0,4 Zellen von der Mitte): Führungslinie und Haltemarke
      for (const x of [-SLOT, SLOT]) {
        line(x, h - 1, x, -24, YEL, 2.2); // Führungslinie bis zur Haltemarke
        line(x - 9, -27, x + 9, -27, YEL, 2.6);
      }
      for (const x of [-SLOT, SLOT]) line(x, -6, x, 10, YEL, 1.2, { fine: true }); // Fahrwerksmarken je Platz
      for (const [x, y] of [[-5, 22], [5, 22], [-17, -4], [17, -4]]) rect(x - 1.4, y - 1, x + 1.4, y + 1, '#565a5e', { fine: true }); // Verzurrpunkte
      if (lv === 2) rect(-57, -55, 63, 60, 'rgba(0,0,0,0.13)'); // Schatten des Dachs
    } else {
      const { W, N, S, D } = HS;
      rect(-W + 1, N, W - 1, S, 'rgba(18,18,16,0.3)'); // Innenraum
      for (const x of [-SLOT, SLOT]) {
        line(x, -h + 1, x, 30, YEL, 2.2); // Führungslinie vom Tor, je Platz
        line(x - 8, 30, x + 8, 30, YEL, 2.6);
      }
      for (const y of [N - D - 1.2, N - D - 2.8]) line(-h + 1, y, h - 1, y, '#4f5357', 0.9); // Torschienen
      for (let x = -14; x < 14; x += 4) line(x, S + D + 13, x + 3, S + D + 6, 'rgba(227,196,58,0.7)', 1.4, { fine: true }); // Warnschraffur
    }
  } else if (k === 'atc') {
    rect(-h, -h, h, h, LAWN, { grass: '#e3e8ec' });
    rect(-52, -50, 10, 16, '#bdb9ae'); // Platz um den Tower
    joints(-52, -50, 10, 16, 16);
    rect(-6, 16, 2, 34, '#c9c4b4'); // Weg zum Parkplatz
    rect(2, 32, 61, 60, '#5d5f5a'); // Parkplatz
    for (const x of [8, 20, 32, 44, 56]) line(x, 34, x, 46, WHITE, 1, { fine: true });
    line(4, 47, 60, 47, WHITE, 1, { fine: true });
    if (lv >= 2) rect(18, -34, 56, 4, GRAVEL); // Radarplatz
    if (lv >= 3) rect(-58, 26, -22, 60, GRAVEL); // Platz der Kuppel
  } else if (k === 'ktank') {
    rect(-h, -h, h, h, GRAVEL);
    rect(-57, -61, 57, 19, '#8f8e86'); // Boden der Auffangwanne
    joints(-57, -61, 57, 19, 19);
    rect(-50, 24, 56, 61, '#6a6c67'); // Ladestraße
    for (const x of [-46, -2]) line(x, 58, x, 50, YEL, 1.2, { fine: true });
    line(-48, 42, 54, 42, 'rgba(240,238,228,0.35)', 0.8, { fine: true });
  } else if (k === 'mdepot') {
    rect(-h, -h, h, h, GRASS2, { grass: '#e3e8ec' });
    rect(-58, 2, 58, 30, GRAVEL); // Vorplatz
    rect(-10, 30, 10, h, '#5d5f5a'); // Zufahrt zum Tor
    line(0, 34, 0, h - 2, 'rgba(240,238,228,0.5)', 0.9, { fine: true });
    for (const x of [-48, -40, -32]) rect(x, 18, x + 6, 24, 'rgba(60,56,46,0.25)', { fine: true }); // Abstellflächen
  }
  return g;
}

// ---------- Teile ----------

/** Ausdehnung je Teil um den Ankerpunkt [x0, x1, y0, y1, Höhe] (Welt = Ansicht bei Drehung 0). */
const EXT = {
  gpu: [-8, 8, -5, 5, 8],
  ext: [-3, 3, -3, 3, 8],
  cone: [-2, 2, -2, 2, 5],
  flood: [-4, 4, -3, 3, 40],
  canopy: [-62, 62, -62, 56, 36],
  has: [-62, 62, -62, 60, 40],
  tower: [-26, 26, -26, 30, 98],
  sock: [-3, 14, -3, 6, 16],
  lot: [-27, 27, -11, 11, 11],
  radar: [-18, 18, -18, 18, 46],
  radome: [-15, 15, -15, 15, 40],
  kfarm: [-58, 58, -62, 62, 34],
  depot: [-62, 62, -62, 62, 34],
};
/** Teile, die in der Welt fest liegen (je Drehung eigenes Bild): Überdachung und Shelter (Tor nach Norden). */
const FIXED = new Set(['canopy', 'has']);

/**
 * Körper eines Bausteins: [{ t: 'ab', id, x, y, fw, fh (Grundriss), h (Höhe), lv }] (örtlich). Überdachung und Shelter liegen als
 * ein Teil über dem abgestellten Jet (over mit Grundriss x0 … y1 wie seit v5.39: Iso nach der vordersten Ecke einsortiert, 2D nach
 * den Einheiten); ihr Dach und ihre Röhre sind halb durchsichtig gemalt.
 */
export function airbaseBodies(k, lv) {
  const out = [];
  const part = (id, x, y, o = {}) => {
    const [x0, x1, y0, y1, h] = EXT[id];
    out.push({ t: 'ab', id, x, y, fw: x1 - x0, fh: y1 - y0, h, lv, ...o });
  };
  if (k === 'stand') {
    const over = (id) => {
      const [x0, x1, y0, y1] = EXT[id];
      part(id, 0, 0, { over: true, x0, y0, x1, y1 });
    };
    if (lv >= 3) {
      over('has');
      part('gpu', -28, 30); // im Shelter, durch die Röhre zu sehen
      part('ext', 38, 34);
    } else if (lv === 2) {
      over('canopy');
      part('gpu', 32, 40);
      part('ext', -34, 42);
    } else {
      part('flood', 52, -52);
      part('gpu', 42, 32);
      part('ext', -44, 34);
      for (const [x, y] of [[-28, 56], [28, 56], [-54, -30], [54, -30]]) part('cone', x, y);
    }
  } else if (k === 'atc') {
    part('tower', -22, -20);
    part('sock', 46, -50);
    part('lot', 32, 40);
    if (lv >= 2) part('radar', 37, -15);
    if (lv >= 3) part('radome', -40, 43);
  } else if (k === 'ktank') part('kfarm', 0, 0);
  else if (k === 'mdepot') part('depot', 0, 0);
  return out;
}

// ---------- Bauteile (Iso) ----------

/** Halbellipse des Querschnitts: Winkel t von 0 (Westen, x = −W) über den Scheitel (π/2) bis π (Osten). */
const arc = (W, H, t) => [-W * Math.cos(t), H * Math.sin(t)];
const NSEG = 18;

/**
 * Zeichenhilfen in Weltachsen für ein fest liegendes Teil bei Drehung rot (x nach Osten, y nach Süden ab dem Anker): Bildpunkt W,
 * Ansichtspunkt uv, Licht lt und Sichtbarkeit vis für Weltnormalen, Weltquader → Quader der Ansicht q.
 */
function worldG(g, rot) {
  const [a, b, c, d] = ROT[rot & 3];
  const U = (x, y) => a * x + b * y;
  const V = (x, y) => c * x + d * y;
  return {
    W: (x, y, h = 0) => g.P(U(x, y), V(x, y), h),
    uv: (x, y) => [U(x, y), V(x, y)],
    lt: (col, nx, ny, nh) => lit(col, U(nx, ny), V(nx, ny), nh),
    vis: (nx, ny, nh = 0) => U(nx, ny) + V(nx, ny) + K * nh > 1e-6,
    q: (x0, x1, y0, y1) => {
      const us = [U(x0, y0), U(x1, y1)];
      const vs = [V(x0, y0), V(x1, y1)];
      return [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    },
  };
}

/** Weltquader (x0 … x1, y0 … y1, Höhe h0 … h1) mit den sichtbaren Seiten. */
const wbox = (g, w, x0, x1, y0, y1, h0, h1, wall, top = wall, line = OUTLINE) => box(g, ...w.q(x0, x1, y0, y1), h0, h1, wall, top, line);

/** Zwischenfläche in Größe des Bilds mit derselben Transformation (null ohne Canvas, z. B. in den Tests). */
function scratch(ctx) {
  const cv = ctx.canvas;
  if (!cv?.width || typeof ctx.getTransform !== 'function') return null;
  let t = null;
  if (typeof document !== 'undefined' && document.createElement) {
    t = document.createElement('canvas');
    t.width = cv.width;
    t.height = cv.height;
  } else if (typeof OffscreenCanvas !== 'undefined') t = new OffscreenCanvas(cv.width, cv.height);
  const c = t?.getContext('2d');
  if (!c) return null;
  c.setTransform(ctx.getTransform());
  c.lineJoin = 'round';
  c.lineCap = 'round';
  return c;
}

/**
 * paint(ctx2) halb durchsichtig (Deckkraft a) auf ctx: erst deckend auf eine Zwischenfläche, dann in einem Zug, damit sich
 * Überlappungen nicht addieren. So bleibt der abgestellte Jet unter Dach und Röhre sichtbar (wie seit v5.39).
 */
function seeThrough(ctx, a, paint) {
  const t = scratch(ctx);
  ctx.save();
  ctx.globalAlpha = a;
  if (t) {
    paint(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(t.canvas, 0, 0);
  } else paint(ctx);
  ctx.restore();
}

/** Fläche outer mit Loch hole (gerade-ungerade-Regel). */
function polyHole(g, outer, hole, fill) {
  const { ctx } = g;
  ctx.beginPath();
  for (const pts of [outer, hole]) {
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  ctx.fill('evenodd');
}

// Überdachung (Stufe 2, Stahldach auf Stützen wie seit v5.39): Stützen bei x = ±CX in den Reihen CY, Windschutz bis SH hoch, Traufe
// auf CE, First CR über x = 0, Dach von y = RN bis RS und x = ±RW. Deckkraft des Dachs SEE2, der Shelter-Röhre SEE3.
const CAN = { CX: 54, CY: [-54, -4, 46], CE: 26.5, CR: 32, RN: -61, RS: 53, RW: 61, SH: 13 };
const ROOF = '#98a2a8'; // verzinktes Wellblech
const COL = '#6f777c'; // Stahl der Stützen und Binder
const PANEL = '#86918c'; // Windschutz
const SEE2 = 0.56;
const SEE3 = 0.64;

/**
 * Überdachung: Fundamente, Stützen mit Kopfbändern, Traufpfetten, seitlicher Windschutz aus Wellblech, drei Fachwerkbinder und das
 * halb durchsichtige Satteldach (Wellen, Rinnen, Firstkappe, Ortgang). Die hintere Seite zuerst, das Dach zuletzt.
 */
function canopyIso(g, rot) {
  const w = worldG(g, rot);
  const { W } = w;
  const { CX, CY, CE, CR, RN, RS, RW, SH } = CAN;
  const side = (sx) => {
    const x = sx * CX;
    const xo = x + sx * 1.8;
    const xi = x + sx * 3;
    for (const y of CY) {
      wbox(g, w, x - 3, x + 3, y - 3, y + 3, 0, 1, '#b8b4aa'); // Fundament
      wbox(g, w, x - 1.8, x + 1.8, y - 1.8, y + 1.8, 1, CE - 0.4, COL, tint(COL, 0.12)); // Stütze
      if (g.fine && w.vis(sx, 0)) stroke(g, [W(xi - sx * 1.2, y, 1.2), W(xi - sx * 1.2, y, CE - 0.6)], 'rgba(0,0,0,0.25)', 0.5); // Steg
    }
    wbox(g, w, Math.min(xo, xi), Math.max(xo, xi), CY[0], CY[2], 1, SH, PANEL, tint(PANEL, 0.12)); // Windschutz
    if (w.vis(sx, 0)) {
      if (g.fine) for (let y = CY[0] + 2.2; y < CY[2] - 1; y += 2.2) stroke(g, [W(xi, y, 1.5), W(xi, y, SH - 0.5)], 'rgba(0,0,0,0.13)', 0.45);
      stroke(g, [W(xi, CY[0], 1.2), W(xi, CY[2], 1.2)], 'rgba(30,32,30,0.5)', 0.8);
      stroke(g, [W(xi, CY[0], SH), W(xi, CY[2], SH)], 'rgba(235,238,236,0.35)', 0.6);
    }
    if (g.fine) {
      for (const y of CY) {
        for (const s of [-1, 1]) {
          if (y + s * 8 > RN + 3 && y + s * 8 < RS - 3) stroke(g, [W(x, y + s * 1.8, CE - 7.5), W(x, y + s * 8, CE - 1.4)], shade(COL, 0.1), 0.9); // Kopfband
        }
      }
    }
    wbox(g, w, x - 1.6, x + 1.6, RN + 3, RS - 3, CE - 2.4, CE, shade(COL, 0.05), tint(COL, 0.18)); // Traufpfette
  };
  const near = w.vis(1, 0) ? 1 : -1;
  side(-near);
  // Fachwerkbinder unter dem Dach: Untergurt, Obergurt, Streben im Zickzack
  const top = (x) => CE + (CR - 1.4 - CE) * (1 - Math.abs(x) / CX);
  for (const y of CY) {
    stroke(g, [W(-CX, y, CE - 2.2), W(CX, y, CE - 2.2)], shade(COL, 0.1), 0.9);
    stroke(g, [W(-CX, y, CE), W(0, y, CR - 1.4), W(CX, y, CE)], shade(COL, 0.1), 1);
    if (g.fine) {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const x = -CX + (k * 2 * CX) / 12;
        pts.push(W(x, y, k % 2 ? top(x) : CE - 2.2));
      }
      stroke(g, pts, shade(COL, 0.05), 0.55);
    }
  }
  side(near);
  // Satteldach halb durchsichtig
  seeThrough(g.ctx, SEE2, (c) => {
    const h = { ...g, ctx: c };
    const roof = snowy(ROOF);
    for (const sx of [-1, 1]) {
      const n = [sx * (CR - CE), 0, RW];
      if (!w.vis(...n)) continue;
      poly(h, [W(sx * RW, RN, CE), W(sx * RW, RS, CE), W(0, RS, CR), W(0, RN, CR)], w.lt(roof, ...n), null);
      if (h.fine) for (let y = RN + 3.4; y < RS - 1; y += 3.4) stroke(h, [W(sx * RW, y, CE), W(0, y, CR)], 'rgba(40,46,50,0.2)', 0.5); // Wellen
      stroke(h, [W(sx * RW, RN, CE), W(sx * RW, RS, CE)], 'rgba(36,40,44,0.65)', 1.3); // Rinne
    }
    stroke(h, [W(0, RN, CR + 0.3), W(0, RS, CR + 0.3)], tint(roof, 0.3), 1.5); // Firstkappe
  });
  // Umriss des Dachs deckend: Rinnen, Ortgang und First bleiben klar, die Fläche durchsichtig
  const edge = 'rgba(44,50,54,0.8)';
  for (const sx of [-1, 1]) stroke(g, [W(sx * RW, RN, CE), W(sx * RW, RS, CE)], edge, 1.1);
  for (const y of [RN, RS]) stroke(g, [W(-RW, y, CE), W(0, y, CR), W(RW, y, CE)], edge, 0.9);
  stroke(g, [W(0, RN, CR + 0.3), W(0, RS, CR + 0.3)], 'rgba(230,234,236,0.3)', 0.8);
}

// Shelter (Stufe 3, nach dem Vorbild der Hardened Aircraft Shelter wie seit v5.39): Betonröhre längs y, halbe Breite W, Scheitel H,
// von y = N (Tor, Norden: die Nase des Jets zeigt dorthin) bis S (Rückwand, Süden); Stirnwand D dick und B größer als die Röhre;
// Toröffnung halbe Breite WO, Höhe HO; Torflügel DW breit; Erdanschüttung: Krone auf Höhe E bis x = ±C, Böschung bis x = ±F.
const HS = { W: 46, H: 32, N: -50, S: 46, D: 4, B: 3, WO: 32, HO: 24, DW: 26, E: 15, C: 47, F: 62 };
// Tarnflecken (Lage längs, Winkel im Querschnitt, Ausdehnung, Farbe)
const CAMO = [
  [-34, 1.5, 13, 0.32, 0],
  [2, 2.2, 16, 0.4, 1],
  [30, 1.3, 12, 0.3, 2],
  [-12, 1.05, 10, 0.2, 2],
  [22, 2.7, 13, 0.28, 0],
  [-38, 2.6, 10, 0.3, 1],
  [-16, 1.95, 9, 0.25, 0],
  [37, 2.3, 8, 0.25, 1],
];
const CAMO_COL = ['rgba(84,100,60,0.62)', 'rgba(150,132,96,0.55)', 'rgba(62,64,58,0.5)'];

/** Querschnitt (Halbellipse Wa × Ha) bei y als Punktliste von t0 bis t1. */
function arcPts(w, y, Wa, Ha, t0 = 0, t1 = Math.PI, n = NSEG) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const [x, h] = arc(Wa, Ha, t0 + ((t1 - t0) * k) / n);
    pts.push(w.W(x, y, h));
  }
  return pts;
}

/** Sichtbare Streifen einer Röhre (Wa × Ha) von y0 bis y1 zwischen den Winkeln t0 und t1. */
function tubeStrips(g, w, y0, y1, Wa, Ha, col, t0 = 0, t1 = Math.PI) {
  const n = Math.max(3, Math.round((NSEG * (t1 - t0)) / Math.PI));
  for (let k = 0; k < n; k++) {
    const ta = t0 + ((t1 - t0) * k) / n;
    const tb = t0 + ((t1 - t0) * (k + 1)) / n;
    const tm = (ta + tb) / 2;
    const nx = -Ha * Math.cos(tm);
    const nh = Wa * Math.sin(tm);
    if (!w.vis(nx, 0, nh)) continue;
    const [xa, ha] = arc(Wa, Ha, ta);
    const [xb, hb] = arc(Wa, Ha, tb);
    poly(g, [w.W(xa, y0, ha), w.W(xa, y1, ha), w.W(xb, y1, hb), w.W(xb, y0, hb)], w.lt(col, nx, 0, nh), null);
  }
}

/** Toröffnung bei y als Punktliste: Rechteck mit gerundeten oberen Ecken. */
function openingPts(w, y) {
  const { WO, HO } = HS;
  const r = 5;
  const pts = [w.W(-WO, y, 0)];
  for (let k = 0; k <= 4; k++) {
    const a = Math.PI - (k / 4) * (Math.PI / 2);
    pts.push(w.W(-WO + r + r * Math.cos(a), y, HO - r + r * Math.sin(a)));
  }
  for (let k = 0; k <= 4; k++) {
    const a = Math.PI / 2 - (k / 4) * (Math.PI / 2);
    pts.push(w.W(WO - r + r * Math.cos(a), y, HO - r + r * Math.sin(a)));
  }
  pts.push(w.W(WO, y, 0));
  return pts;
}

/** Erdanschüttung an der Seite sx (−1 Westen, +1 Osten) von y = N bis S + D: Krone (Gras), Böschung, Stirnflächen bis an die Wände. */
function earthFill(g, w, sx) {
  const { W: Wd, H, N, S, D, E, C, F } = HS;
  const xi = sx * Wd * Math.sqrt(1 - (E / H) ** 2); // hier trifft die Krone die Röhre
  const y0 = N;
  const y1 = S + D;
  const nS = [sx * E, 0, F - C];
  for (const [y, ny, Wa, Ha] of [[y0, -1, Wd, H], [y1, 1, Wd + 1, H + 1]]) {
    if (!w.vis(0, ny)) continue;
    // Stirnfläche aus Erde zwischen Wand und Böschung (innen entlang der Röhre bzw. der Rückwand)
    const te = Math.asin(Math.min(1, E / Ha));
    const pts = [w.W(sx * C, y, E), w.W(sx * F, y, 0)];
    for (let k = 0; k <= 6; k++) {
      const [x, h] = arc(Wa, Ha, sx > 0 ? Math.PI - (te * k) / 6 : (te * k) / 6);
      pts.push(w.W(x, y, h));
    }
    poly(g, pts, w.lt(snowy(EARTH), 0, ny, 0), OUTLINE);
  }
  poly(g, [w.W(xi, y0, E), w.W(sx * C, y0, E), w.W(sx * C, y1, E), w.W(xi, y1, E)], w.lt(snowy(GRASS), 0, 0, 1), null); // Krone
  if (w.vis(...nS)) {
    poly(g, [w.W(sx * C, y0, E), w.W(sx * F, y0, 0), w.W(sx * F, y1, 0), w.W(sx * C, y1, E)], w.lt(snowy(GRASS2), ...nS), null); // Böschung
    if (g.fine) {
      // Grasbüschel und Erdflecken
      for (let i = 0; i < 36; i++) {
        const y = y0 + 2 + (((i * 37) % 97) / 97) * (y1 - y0 - 4);
        const f = 0.12 + (((i * 53) % 71) / 71) * 0.76;
        const p = w.W(sx * (C + (F - C) * f), y, E * (1 - f));
        stroke(g, [p, [p[0] + 0.5 * g.z, p[1] - 1.3 * g.z]], i % 4 ? 'rgba(40,62,26,0.45)' : 'rgba(120,96,60,0.5)', 0.5);
      }
    }
    stroke(g, [w.W(sx * F, y0, 0), w.W(sx * F, y1, 0)], 'rgba(40,52,30,0.35)', 0.8);
  }
  if (g.fine) {
    for (let y = y0 + 3; y < y1 - 2; y += 4.6) {
      const p = w.W(sx * (C - 3), y, E);
      stroke(g, [[p[0] - 0.6 * g.z, p[1]], [p[0] + 0.6 * g.z, p[1] - 0.8 * g.z]], 'rgba(46,70,30,0.5)', 0.5);
    }
  }
  stroke(g, [w.W(sx * C, y0, E), w.W(sx * C, y1, E)], 'rgba(255,255,240,0.2)', 0.7); // Kante der Krone
}

/** Stirnwand (Norden, y = N − D … N): Kante und die zur Kamera gewandte Seite mit Toröffnung; vorn Lampe und Fugen. */
function headwall(g, w) {
  const { W: Wd, H, N, D, B, WO, HO } = HS;
  const Wb = Wd + B;
  const Hb = H + B;
  const front = w.vis(0, -1);
  const y = front ? N - D : N;
  tubeStrips(g, w, N - D, N, Wb, Hb, snowy(HEAD)); // Kante
  const outer = arcPts(w, y, Wb, Hb);
  polyHole(g, outer, openingPts(w, y), w.lt(HEAD, 0, front ? -1 : 1, 0));
  stroke(g, outer, OUTLINE, 0.8);
  if (!front) return;
  stroke(g, openingPts(w, y), 'rgba(36,34,30,0.7)', 1.3);
  if (g.fine) for (const x of [-WO - 5, WO + 5]) stroke(g, [w.W(x, y, 0), w.W(x, y, Hb * Math.sqrt(Math.max(0, 1 - (x / Wb) ** 2)))], 'rgba(0,0,0,0.12)', 0.5); // Fugen
  wbox(g, w, -2, 2, y - 1.2, y, HO + 2.4, HO + 3.6, '#f6e7b0', '#6d7276'); // Lampe über dem Tor
}

/** Beiseitegeschobene Torflügel mit Führungsrahmen; vorn Rippen, Band in Teamfarbe und Warnschild. */
function doors(g, w, team) {
  const { N, D, WO, HO, DW } = HS;
  const y0 = N - D - 4;
  const y1 = N - D;
  const front = w.vis(0, -1);
  for (const sx of [-1, 1]) {
    const xf = sx * (WO - 2 + DW + 1.5);
    wbox(g, w, Math.min(xf, xf + sx * 3.5), Math.max(xf, xf + sx * 3.5), y0 - 1.5, y1 + 2, 0, HO + 3, '#8e8b82', '#a29f95'); // Rahmen
    const lo = Math.min(sx * (WO - 2), sx * (WO - 2 + DW));
    const hi = Math.max(sx * (WO - 2), sx * (WO - 2 + DW));
    wbox(g, w, lo, hi, y0, y1, 0.4, HO + 1, '#78806c', '#8a917e'); // Torflügel
    if (!front) continue;
    const F = (x, h) => w.W(x, y0, h);
    poly(g, [F(lo, 13.2), F(hi, 13.2), F(hi, 15.4), F(lo, 15.4)], w.lt(team, 0, -1, 0), null);
    if (g.fine) {
      for (let x = lo + 2.9; x < hi - 0.5; x += 2.9) stroke(g, [F(x, 0.8), F(x, HO + 0.6)], 'rgba(0,0,0,0.13)', 0.45);
      poly(g, [F(lo + 3, 4), F(lo + 8, 4), F(lo + 8, 7), F(lo + 3, 7)], w.lt(YEL, 0, -1, 0), null); // Warnschild
    }
  }
}

/** Röhre (halb durchsichtig): Streifen über der Anschüttung, Tarnflecken, Fugen, Schmutzstreifen, Lüfter, Blitzableiter. */
function tubeIso(g, w) {
  const { W: Wd, H, N, S, E } = HS;
  const te = Math.asin(E / H);
  const s = w.vis(1, 0) ? 1 : -1; // sichtbare Flanke Osten (+1) oder Westen
  const tl = Math.atan2(H, K * Wd); // Rand der Sichtbarkeit
  const [t0, t1] = s > 0 ? [Math.max(te, tl), Math.PI - te] : [te, Math.min(Math.PI - te, Math.PI - tl)];
  tubeStrips(g, w, N, S, Wd, H, snowy(SHELL), te, Math.PI - te);
  const winter = roofSnowOn();
  for (const [yc, tc, ry, rt, ci] of CAMO) {
    const tm = s > 0 ? tc : Math.PI - tc;
    const pts = [];
    for (let k = 0; k < 14; k++) {
      const f = (k / 14) * TAU;
      const wob = 1 + 0.22 * Math.sin(3 * f + yc);
      const y = Math.max(N + 0.5, Math.min(S - 0.5, yc + ry * Math.cos(f) * wob));
      const t = Math.max(t0 + 0.03, Math.min(t1 - 0.02, tm + rt * Math.sin(f) * wob));
      const [x, h] = arc(Wd, H, t);
      pts.push(w.W(x, y, h));
    }
    poly(g, pts, winter ? 'rgba(120,128,120,0.12)' : CAMO_COL[ci], null);
  }
  if (g.fine) {
    for (let y = N + 12; y < S - 2; y += 12) stroke(g, arcPts(w, y, Wd, H, t0, t1, 10), 'rgba(0,0,0,0.11)', 0.5); // Fugen der Ringe
    for (let i = 0; i < 9; i++) {
      // Schmutzstreifen die Flanke hinab
      const y = N + 6 + (((i * 41) % 83) / 83) * (S - N - 12);
      const pts = [];
      for (let t = 1.75 + (i % 3) * 0.12; t <= Math.PI - te; t += 0.12) {
        const [x, h] = arc(Wd, H, s > 0 ? t : Math.PI - t);
        pts.push(w.W(x, y + Math.sin(t * 3 + i) * 0.6, h));
      }
      stroke(g, pts, 'rgba(48,46,40,0.13)', 1.3);
    }
    for (const y of [-22, 16]) {
      cyl(g, ...w.uv(0, y), 1.6, H - 0.4, H + 2.6, '#8d9296'); // Lüfter
      cyl(g, ...w.uv(0, y), 2.2, H + 2.6, H + 3.2, '#6d7276');
    }
    stroke(g, [w.W(0, S - 8, H), w.W(0, S - 8, H + 9)], '#5a5f63', 0.6); // Blitzableiter
  }
  const xe = s * Wd * Math.cos(te);
  stroke(g, [w.W(xe, N, E), w.W(xe, S, E)], 'rgba(40,36,30,0.4)', 0.8); // Fuge zur Anschüttung
  for (const y of [N, S]) stroke(g, arcPts(w, y, Wd, H, te, Math.PI - te, 12), 'rgba(40,36,30,0.3)', 0.7);
}

/** Umriss der Röhre deckend (Rand der Sicht und Fuge zur Stirnwand), damit sie trotz Durchsicht als Körper lesbar bleibt. */
function tubeEdge(g, w) {
  const { W: Wd, H, N, S, E } = HS;
  const s = w.vis(1, 0) ? 1 : -1;
  const tl = Math.atan2(H, K * Wd);
  const [x, h] = arc(Wd, H, s > 0 ? tl : Math.PI - tl);
  if (h > E) stroke(g, [w.W(x, N, h), w.W(x, S, h)], 'rgba(52,48,40,0.7)', 0.9);
  const te = Math.asin(E / H);
  stroke(g, arcPts(w, N, Wd, H, te, Math.PI - te, 14), 'rgba(52,48,40,0.55)', 0.8);
}

/** Rückwand (Süden, y = S … S + D): Kante über der Anschüttung; zur Kamera die Fläche mit Abgasöffnung, Haube und Nebentür. */
function rearWall(g, w) {
  const { W: Wd, H, S, D, E } = HS;
  const Wr = Wd + 1;
  const Hr = H + 1;
  const y = S + D;
  const te = Math.asin(E / Hr);
  tubeStrips(g, w, S, y, Wr, Hr, snowy(HEAD), te, Math.PI - te);
  if (!w.vis(0, 1)) return;
  poly(g, arcPts(w, y, Wr, Hr), w.lt(HEAD, 0, 1, 0), OUTLINE);
  const F = (x, h) => w.W(x, y, h);
  const dark = w.lt('#3b3e40', 0, 1, 0);
  poly(g, [F(-11, 7), F(11, 7), F(11, 17), F(-11, 17)], dark, OUTLINE); // Abgasöffnung
  if (g.fine) for (let h = 8.4; h < 17; h += 1.5) stroke(g, [F(-10.6, h), F(10.6, h)], 'rgba(150,154,156,0.6)', 0.5); // Jalousie
  for (const x of [-13, 12]) wbox(g, w, x, x + 1, y, y + 4, 6.5, 17, '#8f9396'); // Wangen
  wbox(g, w, -13, 13, y, y + 4, 17, 18.6, '#8f9396', '#a3a7aa'); // Haube
  poly(g, [F(25, 0), F(31, 0), F(31, 9), F(25, 9)], w.lt('#55606a', 0, 1, 0), OUTLINE); // Nebentür
  wbox(g, w, 27, 29, y, y + 0.8, 10.2, 11.2, '#f6e7b0', '#6d7276'); // Lampe
  if (g.fine) {
    for (let x = -26; x < 26; x += 4) poly(g, [F(x, 0), F(x + 2, 0), F(x + 3.4, 1.6), F(x + 1.4, 1.6)], 'rgba(30,30,30,0.5)', null); // Sockelschraffur
    poly(g, [F(-27, 0), F(27, 0), F(27, 1.6), F(-27, 1.6)], 'rgba(227,196,58,0.55)', null);
  }
}

/**
 * Shelter: hinter der Röhre liegende Teile zuerst (Torflügel und Stirnwand, wenn das Tor von der Kamera weg zeigt), dann die
 * Anschüttung (hintere Seite zuerst), Röhre und Rückwand halb durchsichtig, zuletzt Stirnwand und Torflügel, wenn das Tor zur Kamera
 * zeigt (Öffnung ausgeschnitten: dort sieht man den Jet). Schatten nur neben dem Bau, nicht über dem Jet.
 */
function hasIso(g, team, rot) {
  const w = worldG(g, rot);
  const { N, S, D, F } = HS;
  const front = w.vis(0, -1);
  const near = w.vis(1, 0) ? 1 : -1;
  const [u0, u1, , v1] = w.q(-F, F, N - D - 6, S + D + 4);
  flat(g, u0 + 2, u1, v1, v1 + 9, 'rgba(0,0,0,0.2)'); // Schatten
  if (!front) {
    doors(g, w, team);
    headwall(g, w);
  }
  earthFill(g, w, -near);
  earthFill(g, w, near);
  if (front) rearWall(g, w);
  seeThrough(g.ctx, SEE3, (c) => tubeIso({ ...g, ctx: c }, w));
  tubeEdge(g, w);
  if (!front) {
    rearWall(g, w);
    return;
  }
  headwall(g, w);
  const { ctx } = g;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  openingPts(w, N - D).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  stroke(g, openingPts(w, N - D), 'rgba(36,34,30,0.7)', 1.3);
  doors(g, w, team);
}

/** Bodenstromgerät: gelber Anhänger mit Lüftungsgitter, Kabeltrommel und Deichsel. */
function gpu(g) {
  const { P } = g;
  flat(g, -6.4, 7, -3.2, 5, 'rgba(0,0,0,0.2)');
  for (const u of [-3.6, 3.6]) box(g, u - 1.1, u + 1.1, 2.6, 3.2, 0, 2.2, '#2f3134'); // Räder
  box(g, -6, 6, -3, 3, 1.4, 6, '#d9a21b', '#e8b53a');
  const pe = onFace(g, 'e', 6);
  poly(g, [pe(-2, 2.4), pe(2, 2.4), pe(2, 5), pe(-2, 5)], lit('#4a4f53', ...FACE.e), null);
  if (g.fine) for (let h = 2.9; h < 5; h += 0.6) stroke(g, [pe(-1.8, h), pe(1.8, h)], 'rgba(200,200,200,0.35)', 0.35);
  const ps = onFace(g, 's', 3);
  poly(g, [ps(-5, 4.4), ps(-1, 4.4), ps(-1, 5.2), ps(-5, 5.2)], lit('#2b2d2f', ...FACE.s), null);
  cyl(g, 2.5, 0, 1.9, 6, 7.2, '#3e4246'); // Kabeltrommel
  stroke(g, [P(-6, 0, 2), P(-8.6, 0, 1)], '#3a3d40', 0.8); // Deichsel
  stroke(g, [P(2.5, 1.9, 6.6), P(4.5, 4.6, 0.2), P(9, 3.4, 0)], '#1f2124', 0.6); // Kabel
}

/** Feuerlöscher auf Rädern (rot). */
function extinguisher(g) {
  flat(g, -2, 2.6, -1.6, 2.8, 'rgba(0,0,0,0.18)');
  box(g, -1.6, 1.6, 1.3, 1.8, 0, 1.6, '#2f3134');
  cyl(g, 0, 0, 1.5, 0.8, 5.6, RED);
  cyl(g, 0, 0, 0.6, 5.6, 6.6, '#3a3d40');
  stroke(g, [g.P(-1.2, 0, 6), g.P(-2.4, 1.2, 4)], '#1f2124', 0.5);
}

/** Leitkegel (orange mit weißem Band). */
function cone(g) {
  box(g, -1.7, 1.7, -1.7, 1.7, 0, 0.4, '#d0601e');
  frustum(g, 0, 0, 1.4, 0.25, 0.4, 4.2, '#ea7a2e', false);
  band(g, 0, 0, 0.95, 1.9, 2.6, WHITE);
}

/** Parkplatz am Tower: Autos je Stufe (in Stufe 3 ein Dienstwagen in Oliv), zwei Laternen. */
function lot(g, lv) {
  const n = lv >= 3 ? 4 : lv >= 2 ? 3 : 2;
  const spots = [-18, -6, 6, 18];
  lamp(g, -24, -8, 10);
  for (let i = 0; i < n; i++) car(g, spots[i], 0, 'v', i === 3 ? OLIVE : CAR_COLORS[(i * 3 + 1) % CAR_COLORS.length]);
  lamp(g, 24, -8, 10);
}

/** Wetterradar: Betonsockel mit Tür, weiße Kuppel aus Feldern, Band in Teamfarbe. */
function radome(g, team) {
  walls(g, -9, 9, -9, 9, 12, '#d3d0c6', { band: team });
  door(g, 's', 9, 3, 3, 6, '#55606a');
  parapet(g, -9, 9, -9, 9, 12, '#d3d0c6', DECK);
  const { P, ctx, z } = g;
  const r = 12;
  const [x, y] = P(0, 0, 12 + r * 0.82);
  const R = r * z;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(x, P(0, 0, 12)[1], R * 0.9, R * 0.45, 0, 0, TAU);
  ctx.fill();
  const grad = ctx.createRadialGradient(x - R * 0.35, y - R * 0.45, R * 0.1, x, y, R * 1.15);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.6, '#e6e9ec');
  grad.addColorStop(1, '#a4abb1');
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(0.6, 0.8 * z);
  ctx.stroke();
  if (g.fine) {
    // Felder der Kuppel (Breiten- und Längenlinien)
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = 'rgba(120,130,138,0.35)';
    ctx.lineWidth = Math.max(0.4, 0.4 * z);
    for (const f of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.ellipse(x, y + f * R, R * Math.sqrt(1 - f * f), R * 0.3 * Math.sqrt(1 - f * f), 0, 0, TAU);
      ctx.stroke();
    }
    for (const f of [-0.6, -0.2, 0.2, 0.6]) {
      ctx.beginPath();
      ctx.ellipse(x, y, Math.abs(f) * R, R, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Tanklager: Auffangwanne (Betonmauer) mit 2, 3 oder 4 Tanks (Band in Teamfarbe), Rohre über die Mauer zum Sammelrohr, Pumpenhaus,
 * Ladebühne mit Dach und Ladearmen über dem Tankwagen (Stufe 3 zwei Tankwagen), Warnschilder, Laternen.
 */
function kfarm(g, team, lv) {
  const B = [-56, 56, -60, 18];
  const T = lv >= 3
    ? [[-27, -40, 15, 30], [27, -40, 15, 30], [-27, -4, 15, 30], [27, -4, 15, 30]]
    : lv >= 2
      ? [[-36, -24, 15, 28], [0, -24, 15, 28], [36, -24, 15, 28]]
      : [[-25, -24, 18, 26], [25, -24, 18, 26]];
  bund(g, B[0], B[1], B[2], B[3], 'back', 3);
  const sorted = [...T].sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
  for (const [u, v, r, H] of sorted) tank(g, u, v, r, H, { band: team, color: TANKC });
  // Rohre von den Tanks über die Mauer zum Sammelrohr
  const front = T.filter(([, v]) => v === Math.max(...T.map((t) => t[1])));
  for (const [u, v, r] of front) pipe(g, [[u, v + r * 0.8, 2], [u, 23, 3.8]], 1.3);
  bund(g, B[0], B[1], B[2], B[3], 'front', 3);
  pipe(g, [[Math.min(...front.map((t) => t[0])), 23, 3.8], [30, 23, 3.8], [30, 31, 3.8]], 1.5);
  // Pumpenhaus
  walls(g, 28, 52, 30, 46, 10, '#cfc9bb');
  parapet(g, 28, 52, 30, 46, 10, '#cfc9bb', DECK);
  door(g, 's', 46, 35, 3.2, 6, '#55606a');
  wins(g, 'e', 52, 33, 43, 2, [[5, 7.6]], 2.4);
  // Ladebühne mit Dach, dahinter die Tankwagen
  const P = g.P;
  for (const u of [-44, -8]) stroke(g, [P(u, 30, 0), P(u, 30, 13)], '#6b7177', 1);
  box(g, -44, -8, 30, 35, 0, 4.6, '#a7a69d', '#b8b7ae');
  for (let u = -42; u <= -10; u += 8) stroke(g, [P(u, 35, 4.6), P(u, 35, 7.4)], '#d9a21b', 0.5); // Geländer
  stroke(g, [P(-44, 35, 7.4), P(-8, 35, 7.4)], '#d9a21b', 0.6);
  if (lv >= 3) lorry(g, -26, 54, 'u', OLIVE, 'tank', { tank: '#8c9466', band: team });
  lorry(g, -26, 42, 'u', OLIVE, 'tank', { tank: '#8c9466', band: team });
  for (const u of [-34, -18]) stroke(g, [P(u, 34, 6.5), P(u + 2, 40, 9.5), P(u + 3, 42, 5.6)], '#3f4447', 0.8); // Ladearme
  for (const u of [-44, -8]) stroke(g, [P(u, 37, 0), P(u, 37, 13)], '#6b7177', 1);
  box(g, -46, -6, 28, 39, 12.6, 13.8, '#9aa1a8', snowy('#b9bfc4'));
  // Warnschilder an der Mauer, Laternen
  const pt = onFace(g, 's', B[3]);
  for (const u of [-46, 46]) {
    poly(g, [pt(u, 0.6), pt(u + 1.8, 2.1), pt(u, 3.6), pt(u - 1.8, 2.1)], YEL, OUTLINE);
  }
  lamp(g, 56, 22, 11);
  lamp(g, -54, 22, 11);
}

/**
 * Erdbedeckter Munitionsbunker: Grashügel über einer Tonne, Stirnwand aus Beton mit Flügelmauern, zweiflügliges Stahltor mit
 * Schild in Teamfarbe, Lüfter auf dem Scheitel. Tor nach +v bei v = 0, Hügel bis v = −56.
 */
function igloo(g, u0, team) {
  const W = 17;
  const H = 15;
  const w0 = worldG(g, 0);
  const w = { ...w0, W: (x, y, h = 0) => w0.W(u0 + x, y, h) };
  shadow(g, u0 - W, u0 + W, -56, 2, H, 0.2);
  tubeStrips(g, w, -56, 0, W, H, snowy(GRASS));
  if (g.fine) {
    const tv = Math.atan2(H, K * W); // erster sichtbarer Winkel
    for (let i = 0; i < 26; i++) {
      const a = -54 + ((i * 29) % 53) / 53 * 52;
      const t = tv + 0.05 + ((i * 17) % 31) / 31 * (Math.PI - tv - 0.1);
      const [x, h] = arc(W, H, t);
      const p = w.W(x, a, h);
      stroke(g, [p, [p[0] + 0.5 * g.z, p[1] - 1.2 * g.z]], i % 5 ? 'rgba(44,66,28,0.5)' : 'rgba(120,96,60,0.5)', 0.5);
    }
  }
  cyl(g, u0, -32, 1.4, H - 0.3, H + 3.2, '#8d9296'); // Lüfter
  cyl(g, u0, -32, 2, H + 3.2, H + 3.8, '#6d7276');
  // Stirnwand und Flügelmauern
  box(g, u0 - 20, u0 - 17, 0, 9, 0, 8, '#b5b1a5', '#c4c0b4');
  box(g, u0 - 19, u0 + 19, -1.5, 1.5, 0, 16.5, '#bdb9ad', '#cbc7bb');
  box(g, u0 + 17, u0 + 20, 0, 9, 0, 8, '#b5b1a5', '#c4c0b4');
  const pt = onFace(g, 's', 1.5);
  poly(g, [pt(u0 - 7, 0), pt(u0 + 7, 0), pt(u0 + 7, 10), pt(u0 - 7, 10)], lit('#56604c', ...FACE.s), OUTLINE);
  stroke(g, [pt(u0, 0), pt(u0, 10)], 'rgba(20,24,18,0.6)', 0.6);
  if (g.fine) {
    for (let h = 1.6; h < 10; h += 1.6) stroke(g, [pt(u0 - 6.6, h), pt(u0 + 6.6, h)], 'rgba(255,255,255,0.08)', 0.4);
    for (let k = 0; k < 6; k++) {
      const c = u0 - 7 + k * (14 / 6);
      poly(g, [pt(c, 10), pt(c + 14 / 12, 10), pt(c + 14 / 12, 11), pt(c, 11)], k % 2 ? '#2a2a28' : YEL, null); // Warnstreifen
    }
  }
  poly(g, [pt(u0 - 4, 12.2), pt(u0 + 4, 12.2), pt(u0 + 4, 14.6), pt(u0 - 4, 14.6)], lit(team, ...FACE.s), OUTLINE);
}

/** Blitzschutzmast (Gittermast mit Spitze). */
function rod(g, u, v, h) {
  const { P } = g;
  stroke(g, [P(u, v, 0), P(u, v, h)], '#7d848a', 0.9);
  stroke(g, [P(u, v, h), P(u, v, h + 3)], '#5a5f63', 0.5);
}

/** Zaunstück von (a0, b0) nach (a1, b1). */
function fenceSeg(g, a0, b0, a1, b1, h = 4) {
  const { P } = g;
  const col = 'rgba(66,72,78,0.8)';
  for (const hh of [h, h * 0.55]) stroke(g, [P(a0, b0, hh), P(a1, b1, hh)], col, 0.4);
  const n = Math.max(1, Math.round(Math.hypot(a1 - a0, b1 - b0) / 5));
  for (let j = 0; j <= n; j++) {
    const t = j / n;
    const a = a0 + (a1 - a0) * t;
    const b = b0 + (b1 - b0) * t;
    stroke(g, [P(a, b, 0), P(a, b, h + 0.4)], col, 0.55);
  }
}

/** Wachturm (Stahlbeine, Kanzel mit Fenstern und Dach). */
function watchtower(g, u, v) {
  const { P } = g;
  shadow(g, u - 4, u + 4, v - 4, v + 4, 26, 0.16);
  for (const [a, b] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) stroke(g, [P(u + a, v + b, 0), P(u + a * 0.8, v + b * 0.8, 20)], '#5a5f52', 0.9);
  box(g, u - 4.6, u + 4.6, v - 4.6, v + 4.6, 20, 26, '#7b8058', '#6b704c');
  wins(g, 's', v + 4.6, u - 3.6, u + 3.6, 2, [[22.4, 24.8]], 2.6);
  wins(g, 'e', u + 4.6, v - 3.6, v + 3.6, 2, [[22.4, 24.8]], 2.6);
  box(g, u - 5.6, u + 5.6, v - 5.6, v + 5.6, 26, 27.2, '#56603a', '#646e44');
}

/**
 * Munitionslager: Zaun (hinten), 1 bis 3 Bunker nebeneinander mit Blitzschutzmasten, Vorplatz mit Gabelstapler und Paletten voller
 * Munitionskisten, Wache mit Schranke am Tor (vorn Mitte), Zaun vorn mit Torlücke; Stufe 3 ein Wachturm in der hinteren Ecke.
 */
function depot(g, team, lv) {
  const F = 60;
  fenceSeg(g, -F, F, -F, -F);
  fenceSeg(g, -F, -F, F, -F);
  if (lv >= 3) watchtower(g, -50, -50);
  const xs = lv >= 3 ? [-40, 0, 40] : lv >= 2 ? [-24, 24] : [0];
  for (const u of xs) {
    rod(g, u - 20, -54, 24);
    rod(g, u + 20, -54, 24);
  }
  for (const u of xs) igloo(g, u, team);
  for (const u of xs) {
    rod(g, u - 22, 5, 22);
    rod(g, u + 22, 5, 22);
  }
  // Vorplatz: Paletten mit Munitionskisten, Gabelstapler
  for (const [u, v] of [[-50, 21], [-42, 21], [-34, 21], [-50, 13]]) pallet(g, u, v, 2.6, 3.4, OLIVE);
  if (lv >= 2) for (const [u, v] of [[36, 16], [44, 16]]) pallet(g, u, v, 2.6, 3.4, '#6b5a3a');
  forklift(g, -20, 20, OLIVE);
  // Wache mit Schranke am Tor
  walls(g, 16, 26, 38, 48, 8, '#d5cfbf');
  parapet(g, 16, 26, 38, 48, 8, '#d5cfbf', DECK);
  wins(g, 's', 48, 17.5, 24.5, 2, [[3.6, 6.2]], 2.6);
  wins(g, 'e', 26, 39.5, 46.5, 2, [[3.6, 6.2]], 2.6);
  const { P } = g;
  box(g, 12.4, 14.2, 50, 52, 0, 4.4, '#d23a3a', '#e8e4d4');
  stroke(g, [P(13.3, 51, 4), P(-11, 51, 4)], '#e8e4d4', 1.1);
  if (g.fine) for (let u = 10; u > -11; u -= 5) stroke(g, [P(u, 51, 4), P(u - 2.5, 51, 4)], '#d23a3a', 1.1);
  fenceSeg(g, -F, F, -12, F);
  fenceSeg(g, 12, F, F, F);
  fenceSeg(g, F, F, F, -F);
}

// ---------- Tower, Radar, Flutlicht, Windsack (vom alten Flughafen, bis v5.55 render/airport.js) ----------

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

function radarTop(c) {
  rectS(c, -16, -16, 16, 16, '#a39d90', 'rgba(66,72,78,0.8)', 0.6);
  blockTop(c, 4, 2, 14, 14, 7, '#d3d0c6');
  latticeTop(c, -5, -5, 4, 38, '#c9cdd0');
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

// ---------- Bauteile von oben (2D) ----------

/** Überdachung von oben: Stützen, Windschutz und Binder unter dem halb durchsichtigen Satteldach (Wellen, First, Rinnen). */
function canopyTop(c) {
  const { CX, CY, RN, RS, RW } = CAN;
  for (const sx of [-1, 1]) {
    const a = sx * (CX + 1.8);
    const b = sx * (CX + 3);
    rectS(c, Math.min(a, b), CY[0], Math.max(a, b), CY[2], PANEL, 'rgba(0,0,0,0.35)', 0.3);
    for (const y of CY) rectS(c, sx * CX - 1.8, y - 1.8, sx * CX + 1.8, y + 1.8, COL, 'rgba(0,0,0,0.4)', 0.3);
    lineT(c, [[sx * CX, RN + 3], [sx * CX, RS - 3]], COL, 1.6);
  }
  for (const y of CY) lineT(c, [[-CX, y], [CX, y]], shade(COL, 0.1), 1);
  seeThrough(c, SEE2, (d) => {
    const roof = snowy(ROOF);
    const grad = d.createLinearGradient(-RW, 0, RW, 0);
    grad.addColorStop(0, tint(roof, 0.14));
    grad.addColorStop(0.499, tint(roof, 0.04));
    grad.addColorStop(0.501, shade(roof, 0.1));
    grad.addColorStop(1, shade(roof, 0.2));
    rectS(d, -RW, RN, RW, RS, grad, 'rgba(0,0,0,0.45)', 0.5);
    d.strokeStyle = 'rgba(40,46,50,0.2)';
    d.lineWidth = 0.45;
    d.beginPath();
    for (let y = RN + 3.4; y < RS - 1; y += 3.4) {
      d.moveTo(-RW, y);
      d.lineTo(RW, y);
    }
    d.stroke();
    lineT(d, [[0, RN], [0, RS]], tint(roof, 0.3), 1.3);
    for (const x of [-RW, RW]) lineT(d, [[x, RN], [x, RS]], 'rgba(36,40,44,0.6)', 1);
  });
}

/** Shelter von oben: Anschüttung, Torflügel mit Band in Teamfarbe, Stirnwand; Röhre und Rückwand halb durchsichtig über dem Jet. */
function hasTop(c, team) {
  const { W: Wd, H, N, S, D, B, WO, DW, E, F } = HS;
  const xi = Wd * Math.sqrt(1 - (E / H) ** 2);
  rectF(c, F, N + 6, F + 6, S + D + 6, 'rgba(0,0,0,0.22)'); // Schatten rechts und unten neben dem Bau
  rectF(c, -F + 6, S + D, F, S + D + 6, 'rgba(0,0,0,0.22)');
  for (const sx of [-1, 1]) {
    const grad = c.createLinearGradient(sx * xi, 0, sx * F, 0);
    grad.addColorStop(0, tint(snowy(GRASS), 0.12));
    grad.addColorStop(0.3, snowy(GRASS));
    grad.addColorStop(1, shade(snowy(GRASS2), sx > 0 ? 0.25 : 0.04));
    rectS(c, Math.min(sx * xi, sx * F), N, Math.max(sx * xi, sx * F), S + D, grad, 'rgba(0,0,0,0.3)', 0.4); // Anschüttung
    const lo = Math.min(sx * (WO - 2), sx * (WO - 2 + DW));
    const hi = Math.max(sx * (WO - 2), sx * (WO - 2 + DW));
    rectS(c, lo, N - D - 4, hi, N - D, '#78806c', 'rgba(0,0,0,0.4)', 0.35); // Torflügel
    rectF(c, lo, N - D - 4, hi, N - D - 2.9, team);
    const xf = sx * (WO - 2 + DW + 1.5);
    rectS(c, Math.min(xf, xf + sx * 3.5), N - D - 5.5, Math.max(xf, xf + sx * 3.5), N - D + 2, '#a29f95', 'rgba(0,0,0,0.4)', 0.35); // Rahmen
  }
  rectS(c, -Wd - B, N - D, Wd + B, N, snowy(HEAD), 'rgba(0,0,0,0.4)', 0.4); // Stirnwand
  seeThrough(c, SEE3, (d) => {
    const grad = d.createLinearGradient(-xi, 0, xi, 0);
    grad.addColorStop(0, tint(snowy(SHELL), 0.22));
    grad.addColorStop(0.5, snowy(SHELL));
    grad.addColorStop(1, shade(snowy(SHELL), 0.28));
    rectS(d, -xi, N, xi, S, grad, 'rgba(0,0,0,0.4)', 0.5);
    if (!roofSnowOn()) {
      for (const [yc, tc, ry, rt, ci] of CAMO) {
        // unregelmäßige Flecken wie in der Iso-Ansicht (Lage quer aus dem Winkel im Querschnitt)
        const xc = Math.max(-xi + 6, Math.min(xi - 6, -Wd * Math.cos(tc)));
        const pts = [];
        for (let k = 0; k < 14; k++) {
          const f = (k / 14) * TAU;
          const wob = 1 + 0.22 * Math.sin(3 * f + yc);
          pts.push([Math.max(-xi, Math.min(xi, xc + Wd * rt * 0.8 * Math.sin(f) * wob)), Math.max(N, Math.min(S, yc + ry * Math.cos(f) * wob))]);
        }
        polyF(d, pts, CAMO_COL[ci]);
      }
    }
    d.strokeStyle = 'rgba(0,0,0,0.12)';
    d.lineWidth = 0.5;
    d.beginPath();
    for (let y = N + 12; y < S - 2; y += 12) {
      d.moveTo(-xi, y);
      d.lineTo(xi, y);
    }
    d.stroke();
    circle(d, 0, -22, 2.2, '#8d9296');
    circle(d, 0, 16, 2.2, '#8d9296');
    rectS(d, -Wd - 1, S, Wd + 1, S + D, snowy(HEAD), 'rgba(0,0,0,0.4)', 0.4); // Rückwand
    rectS(d, -13, S + D, 13, S + D + 4, '#a3a7aa', 'rgba(0,0,0,0.4)', 0.35); // Haube über der Abgasöffnung
  });
}

function gpuTop(c) {
  rectF(c, -5, -2, 7.5, 4.5, 'rgba(0,0,0,0.25)');
  rectS(c, -6, -3, 6, 3, '#e3b02c', 'rgba(0,0,0,0.45)', 0.35);
  circle(c, 2.5, 0, 1.9, '#3e4246');
  lineT(c, [[-6, 0], [-8.6, 0]], '#3a3d40', 0.7);
}

function extTop(c) {
  circle(c, 0.8, 0.8, 1.6, 'rgba(0,0,0,0.25)');
  circle(c, 0, 0, 1.5, RED);
}

function coneTop(c) {
  rectF(c, -1.7, -1.7, 1.7, 1.7, '#d0601e');
  circle(c, 0, 0, 1.1, '#ea7a2e');
  circle(c, 0, 0, 0.45, WHITE);
}

function lotTop(c, lv) {
  const n = lv >= 3 ? 4 : lv >= 2 ? 3 : 2;
  const spots = [-18, -6, 6, 18];
  for (let i = 0; i < n; i++) carTop(c, spots[i], 0, 'v', i === 3 ? OLIVE : CAR_COLORS[(i * 3 + 1) % CAR_COLORS.length]);
  for (const x of [-24, 24]) circle(c, x, -8, 1.1, '#f1df9a');
}

function radomeTop(c, team) {
  blockTop(c, -9, -9, 9, 9, 12, '#d3d0c6');
  roundShadow(c, 0, 0, 12, 36, 0.24);
  discTop(c, 0, 0, 12, '#eef0f2');
  ringTop(c, 0, 0, 12.6, team, 0.8);
}

function kfarmTop(c, team, lv) {
  const T = lv >= 3
    ? [[-27, -40, 15], [27, -40, 15], [-27, -4, 15], [27, -4, 15]]
    : lv >= 2
      ? [[-36, -24, 15], [0, -24, 15], [36, -24, 15]]
      : [[-25, -24, 18], [25, -24, 18]];
  c.strokeStyle = '#bab5a9';
  c.lineWidth = 1.6;
  c.strokeRect(-56, -60, 112, 78);
  for (const [x, y, r] of T) {
    roundShadow(c, x, y, r, 28);
    discTop(c, x, y, r, TANKC);
    ringTop(c, x, y, r - 1.4, team, 1.4);
    circle(c, x, y, 2, shade(TANKC, 0.2));
  }
  pipeTop(c, [[Math.min(...T.map((t) => t[0])), 23], [30, 23], [30, 31]], 1.4);
  blockTop(c, 28, 30, 52, 46, 10, '#cfc9bb');
  rectF(c, -44, 30, -8, 35, '#a7a69d');
  if (lv >= 3) lorryTop(c, -26, 54, 'u', OLIVE, 'tank', { tank: '#8c9466', band: team });
  lorryTop(c, -26, 42, 'u', OLIVE, 'tank', { tank: '#8c9466', band: team });
  rectF(c, -46, 28, -6, 39, 'rgba(185,191,196,0.55)');
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  c.lineWidth = 0.4;
  c.strokeRect(-46, 28, 40, 11);
}

function depotTop(c, team, lv) {
  c.save();
  c.setLineDash([1.6, 0.9]);
  c.strokeStyle = 'rgba(55,60,66,0.75)';
  c.lineWidth = 0.5;
  c.beginPath();
  c.moveTo(-12, 60);
  c.lineTo(-60, 60);
  c.lineTo(-60, -60);
  c.lineTo(60, -60);
  c.lineTo(60, 60);
  c.lineTo(12, 60);
  c.stroke();
  c.restore();
  const xs = lv >= 3 ? [-40, 0, 40] : lv >= 2 ? [-24, 24] : [0];
  for (const x of xs) {
    shadowTop(c, x - 17, -56, x + 17, 0, 15);
    const grad = c.createLinearGradient(x - 17, 0, x + 17, 0);
    grad.addColorStop(0, tint(snowy(GRASS), 0.2));
    grad.addColorStop(0.5, snowy(GRASS));
    grad.addColorStop(1, shade(snowy(GRASS), 0.3));
    rectS(c, x - 17, -56, x + 17, 0, grad, 'rgba(0,0,0,0.3)', 0.4);
    rectS(c, x - 19, -1.5, x + 19, 1.5, '#cbc7bb', 'rgba(0,0,0,0.4)', 0.35);
    rectF(c, x - 4, 1.5, x + 4, 2.6, team);
    circle(c, x, -32, 1.6, '#8d9296');
  }
  for (const [x, y] of [[-50, 21], [-42, 21], [-34, 21], [-50, 13]]) palletTop(c, x, y, 2.6, OLIVE);
  if (lv >= 2) for (const [x, y] of [[36, 16], [44, 16]]) palletTop(c, x, y, 2.6, '#6b5a3a');
  forkliftTop(c, -20, 20, OLIVE);
  blockTop(c, 16, 38, 26, 48, 8, '#d5cfbf');
  lineT(c, [[13, 51], [-11, 51]], '#d23a3a', 1);
  if (lv >= 3) {
    shadowTop(c, -55.6, -55.6, -44.4, -44.4, 26);
    rectS(c, -55.6, -55.6, -44.4, -44.4, '#646e44', 'rgba(0,0,0,0.4)', 0.4);
  }
}

// ---------- Schnittstelle ----------

const ROT_KEY = (p, rot) => (FIXED.has(p.id) ? rot : 0);

/** Grenzen eines Iso-Bilds aus der Ausdehnung in der Ansicht (Schatten nach +v, Rand). */
function isoBounds(u0, u1, v0, v1, h) {
  const pad = 4;
  return [(u0 - v1 - 11) * K - pad, (u0 + v0) * K * 0.5 - h - pad, (u1 - v0) * K + pad, (u1 + v1 + 11) * K * 0.5 + pad];
}

/** Ausdehnung eines Teils in der Ansicht (fest liegende Teile gedreht). */
function viewExt(p, rot) {
  const [x0, x1, y0, y1, h] = EXT[p.id];
  if (!FIXED.has(p.id) || !rot) return [x0, x1, y0, y1, h];
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => view(rot, x, y));
  const us = pts.map((q) => q[0]);
  const vs = pts.map((q) => q[1]);
  return [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs), h];
}

function paintIso(ctx, s, p, color, rot) {
  const g = G(ctx, s);
  switch (p.id) {
    case 'canopy': return canopyIso(g, rot);
    case 'has': return hasIso(g, color, rot);
    case 'gpu': return gpu(g);
    case 'ext': return extinguisher(g);
    case 'cone': return cone(g);
    case 'flood': return flood(g);
    case 'tower': return tower(g, color);
    case 'sock': return sock(g);
    case 'lot': return lot(g, p.lv);
    case 'radar': return radar(g);
    case 'radome': return radome(g, color);
    case 'kfarm': return kfarm(g, color, p.lv);
    case 'depot': return depot(g, color, p.lv);
  }
}

function paintTop(ctx, s, p, color) {
  ctx.scale(s, s);
  switch (p.id) {
    case 'canopy': return canopyTop(ctx);
    case 'has': return hasTop(ctx, color);
    case 'gpu': return gpuTop(ctx);
    case 'ext': return extTop(ctx);
    case 'cone': return coneTop(ctx);
    case 'flood': return floodTop(ctx);
    case 'tower': return towerTop(ctx, color);
    case 'sock': return sockTop(ctx);
    case 'lot': return lotTop(ctx, p.lv);
    case 'radar': return radarTop(ctx);
    case 'radome': return radomeTop(ctx, color);
    case 'kfarm': return kfarmTop(ctx, color, p.lv);
    case 'depot': return depotTop(ctx, color, p.lv);
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

/** Ein Teil isometrisch (Ankerpunkt = Mitte, Höhe vom Renderer gesetzt). */
export function drawAirbaseIso(ctx, cam, p, color) {
  const rot = ROT_KEY(p, cam.rot);
  const snow = roofSnowOn() ? 1 : 0;
  const key = `ab|${p.id}|${p.lv}|${rot}|${color}|${snow}`;
  const q = cam.worldToScreen(p.x, p.y);
  const z = cam.zoom;
  const dpr = spriteDpr();
  const e = sprite(key, z * dpr, isoBounds(...viewExt(p, rot)), (c, s) => paintIso(c, s, p, color, rot));
  if (e === false) return; // wird im nächsten Bild gemalt
  if (e) blit(ctx, e, q.x, q.y, z);
  else {
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.scale(1 / dpr, 1 / dpr);
    paintIso(ctx, z * dpr, p, color, rot);
    ctx.restore();
  }
  if (p.id === 'radar') {
    ctx.save();
    ctx.translate(q.x, q.y);
    radarAntenna(G(ctx, z), now() / 1100);
    ctx.restore();
  } else if (p.id === 'tower' && Math.floor(now() / 700) % 2 === 0) {
    // Warnlicht auf der Antenne blinkt
    const x = q.x + -2 * K * z;
    const y = q.y + -2 * K * 0.5 * z - 94.6 * z;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 5 * z);
    grad.addColorStop(0, 'rgba(255,90,70,0.95)');
    grad.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 5 * z, y - 5 * z, 10 * z, 10 * z);
  }
}

/** Ein Teil von oben (Weltkoordinaten, Kamera-Transformation gesetzt). */
export function drawAirbaseTop(ctx, p, color, zoom = 1) {
  const key = `abt|${p.id}|${p.lv}|${color}|${roofSnowOn() ? 1 : 0}`;
  const [x0, x1, y0, y1] = EXT[p.id];
  const e = sprite(key, zoom * spriteDpr(), [x0 - 3, y0 - 3, x1 + 18, y1 + 18], (c, s) => paintTop(c, s, p, color));
  const ox = p.x;
  const oy = p.y;
  if (e) blit(ctx, e, ox, oy, 1);
  else if (e === null) {
    ctx.save();
    ctx.translate(ox, oy);
    paintTop(ctx, 1, p, color);
    ctx.restore();
  }
  if (p.id === 'radar') {
    const t = now() / 1100;
    const cc = Math.cos(t) * 9;
    const ss = Math.sin(t) * 9;
    lineT(ctx, [[p.x - 5 - cc, p.y - 5 - ss], [p.x - 5 + cc, p.y - 5 + ss]], '#eef0f1', 2.2);
  }
}
