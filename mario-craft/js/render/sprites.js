// Atlas-Bau und UI-Art (PLAN §6, §7). Die Spielgrafik (Blöcke, Held, Mobs, Bosse, Gegenstände) liegt in
// render/art/*.js als { name: { pal, frames, flip? } }; hier werden sie zu SPRITES vereinigt.
// Figuren sind Zeichenraster: ein Zeichen = ein Pixel, '.' = transparent.
// Paletten bilden Zeichen auf Farben ab ('#rrggbb' oder '#rrggbbaa').
// buildSprites() zeichnet alles einmal in ein Atlas-Canvas inkl. gespiegelter Varianten.
// get(name, frame, flip) -> { sx, sy, w, h } (vorab angelegte Objekte, keine Allokation pro Aufruf).

import { BLOCK_ART } from './art/blocks.js';
import { HERO_ART } from './art/hero.js';
import { MOB_ART } from './art/mobs.js';
import { BOSS_ART } from './art/bosses.js';
import { ITEM_ART } from './art/items.js';

// ---------- Hilfsfunktionen ----------
const rowsOf = (w, h, f) => {
  const out = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += f(x, y) || '.';
    out.push(s);
  }
  return out;
};

// ---------- Paletten (UI) ----------
const PAL_PAUSE = { o: '#0b0a1466', O: '#ffffffcc', x: '#ffffffee' };
const PAL_BTN = {
  up: { o: '#0b0a1459', O: '#ffffff99', x: '#ffffffcc' },
  down: { o: '#ffffff66', O: '#ffffffee', x: '#0b0a14dd' },
};
const PAL_FONT = { w: '#ffffff', k: '#000000aa' };

// Welten (Parallax/Himmel je Theme; Kacheln kommen aus art/blocks.js).
export const THEMES = ['overworld', 'depths', 'nether', 'end', 'paradise', 'sky'];

// ---------- Schrift (3×5 Glyphen, im Atlas als 4×6 mit Schatten) ----------
const GLYPHS = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '..#', '..#'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'], colon: ['...', '.#.', '...', '.#.', '...'], x: ['...', '#.#', '.#.', '#.#', '...'],
  dash: ['...', '...', '###', '...', '...'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'], P: ['##.', '#.#', '##.', '#..', '#..'], S: ['###', '#..', '###', '..#', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], A: ['.#.', '#.#', '###', '#.#', '#.#'], space: ['...', '...', '...', '...', '...'],
};
const FONT_SPRITES = {};
for (const key of Object.keys(GLYPHS)) {
  const bm = GLYPHS[key];
  const g = rowsOf(4, 6, (x, y) => {
    if (y < 5 && x < 3 && bm[y][x] === '#') return 'w';
    if (y >= 1 && x >= 1 && y - 1 < 5 && x - 1 < 3 && bm[y - 1][x - 1] === '#') return 'k';
    return null;
  });
  FONT_SPRITES[key] = g;
}

// ---------- UI-Art ----------
const UI_ART = {
  pause: { pal: PAL_PAUSE, frames: [rowsOf(24, 24, (x, y) => {
    if (x < 1 || y < 1 || x > 22 || y > 22) return null;
    if (x <= 1 || y <= 1 || x >= 22 || y >= 22) return 'O';
    if ((x >= 7 && x <= 9) || (x >= 14 && x <= 16)) return (y >= 6 && y <= 17) ? 'x' : 'o';
    return 'o';
  })], flip: false },
  ...Object.fromEntries(Object.keys(FONT_SPRITES).map((k) => [`font_${k}`, { pal: PAL_FONT, frames: [FONT_SPRITES[k]], flip: false }])),
};

// Bedien-Knöpfe: Kreis mit Symbol, Frame 0 = normal, 1 = gedrückt. Radien wie PLAN §7.
const BTN_R = { left: 24, right: 24, jump: 30, fire: 20, dig: 24, stair: 24 };
function buttonFrames(id, down) {
  const r = BTN_R[id];
  const size = 2 * r + 1;
  const pal = down ? PAL_BTN.down : PAL_BTN.up;
  return rowsOf(size, size, (x, y) => {
    const dx = x - r, dy = y - r;
    const d2 = dx * dx + dy * dy;
    if (d2 > r * r) return null;
    if (d2 > (r - 2) * (r - 2)) return 'O';
    let sym = false;
    const s = r * 0.42;
    if (id === 'left') sym = dx <= 0 && dx >= -s && Math.abs(dy) <= (s + dx) * 0.9;
    if (id === 'right') sym = dx >= 0 && dx <= s && Math.abs(dy) <= (s - dx) * 0.9;
    if (id === 'jump') sym = dy <= 0 && dy >= -s && Math.abs(dx) <= (s + dy) * 0.9;
    if (id === 'fire') sym = (dy >= -s * 0.2 && dy <= s * 0.9 && dx * dx + (dy - s * 0.25) ** 2 <= (s * 0.55) ** 2) || (dy < s * 0.2 && dy >= -s && Math.abs(dx) <= (dy + s) * 0.35);
    if (id === 'dig') {
      // Spitzhacke: Stiel von unten links (-8,8) nach oben rechts (6,-6), 2 px dick (dx+dy ∈ {0,1});
      // Kopf = Halbkreisbogen um (6,-6), Radius 5, 2 px dick, auf der Seite nach oben rechts.
      const handle = (dx + dy === 0 || dx + dy === 1) && dx >= -8 && dx <= 6;
      const hx = dx - 6, hy = dy + 6, dh = Math.hypot(hx, hy);
      const head = dh >= 3.8 && dh <= 5.8 && hx - hy >= 0;
      sym = handle || head;
    }
    if (id === 'stair') {
      // Treppe: drei aufsteigende, gefüllte Stufen (je 6 px breit, 5 px höher), unten links nach oben rechts.
      const k = Math.floor((dx + 9) / 6);
      sym = dx >= -9 && dx <= 8 && dy <= 9 && dy >= 4 - 5 * k;
    }
    return sym ? 'x' : 'o';
  });
}
for (const id of Object.keys(BTN_R)) {
  UI_ART[`btn_${id}`] = { pal: PAL_BTN.up, frames: [buttonFrames(id, false), buttonFrames(id, true)], flip: false, palByFrame: [PAL_BTN.up, PAL_BTN.down] };
}

// ---------- Sprite-Tabelle ----------
// Schlüssel = Name im Atlas. Vereinigung aller *_ART-Module plus UI-Art.
export const SPRITES = {
  ...BLOCK_ART,
  ...HERO_ART,
  ...MOB_ART,
  ...BOSS_ART,
  ...ITEM_ART,
  ...UI_ART,
};

export function allSpriteNames() {
  return Object.keys(SPRITES);
}

// Prüft alle Raster auf gleiche Breite pro Sprite. Gibt Fehlertexte zurück (leer = ok).
export function checkSprites() {
  const errs = [];
  for (const [name, def] of Object.entries(SPRITES)) {
    def.frames.forEach((g, i) => {
      const w = g[0].length;
      g.forEach((row, y) => { if (row.length !== w) errs.push(`${name} frame ${i} row ${y}: ${row.length} statt ${w}`); });
    });
  }
  return errs;
}

// ---------- Atlas ----------
function parseColor(hex) {
  if (hex === '.' || hex === undefined) return 0;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  // Little-endian ABGR für Uint32Array
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
const BLANK = { sx: 0, sy: 0, w: 1, h: 1 };

// Gleicht Zeilen auf die häufigste Breite an: überlange Zeilen verlieren rechts Punkte, kurze erhalten Punkte.
function fitGrid(g) {
  const count = new Map();
  for (const r of g) count.set(r.length, (count.get(r.length) || 0) + 1);
  let w = g[0].length, best = -1;
  for (const [len, n] of count) if (n > best) { best = n; w = len; }
  return g.map((r) => {
    let s = r;
    while (s.length > w && s.endsWith('.')) s = s.slice(0, -1);
    if (s.length > w) s = s.slice(0, w);
    return s.padEnd(w, '.');
  });
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Baut alle Sprites in ein Atlas-Canvas. Rückgabe: { atlas, get(name, frame, flip), size }.
export function buildSprites() {
  // Liste der Einträge inkl. vertikal gespiegelter Varianten.
  const entries = [];
  for (const [name, def] of Object.entries(SPRITES)) {
    const pal = def.palByFrame ? null : def.pal;
    const frames = def.frames.map((g, i) => ({ g, pal: def.palByFrame ? def.palByFrame[i] : pal }));
    entries.push({ name, frames, flip: def.flip !== false });
    if (def.vflip) {
      entries.push({ name: `${name}_v`, frames: [{ g: [...def.frames[0]].reverse(), pal: pal || def.pal }], flip: def.flip !== false });
    }
  }
  // Schrift und Knöpfe brauchen eigene Paletten je Frame, siehe oben.

  // Palettentabellen vorbereiten: Zeichen -> u32.
  const palCache = new Map();
  const palTable = (pal) => {
    let t = palCache.get(pal);
    if (!t) {
      t = {};
      for (const k of Object.keys(pal)) t[k] = parseColor(pal[k]);
      palCache.set(pal, t);
    }
    return t;
  };

  // Zeilenpacken (Regal): Breite 512.
  const ATLAS_W = 512;
  const index = Object.create(null);
  let x = 0, y = 0, rowH = 0;
  const placed = [];
  // Ein Platz für den leeren Sprite (1×1).
  const place = (w, h) => {
    if (x + w > ATLAS_W) { x = 0; y += rowH + 1; rowH = 0; }
    const at = { sx: x, sy: y, w, h };
    x += w + 1;
    rowH = Math.max(rowH, h);
    return at;
  };
  index.__blank = { n: 1, rects: [BLANK, BLANK] };
  const blank = place(1, 1);
  Object.assign(BLANK, { sx: blank.sx, sy: blank.sy });
  for (const e of entries) {
    const n = e.frames.length;
    const rects = new Array(n * 2);
    for (let i = 0; i < n; i++) {
      const g = (e.frames[i].g = fitGrid(e.frames[i].g));
      const w = g[0].length, h = g.length;
      rects[i * 2] = place(w, h);
      rects[i * 2 + 1] = place(w, h);
      placed.push({ e, i, normal: rects[i * 2], flipped: rects[i * 2 + 1], g, pal: e.frames[i].pal });
    }
    index[e.name] = { n, rects, flip: e.flip };
  }
  const ATLAS_H = Math.max(1, y + rowH + 1);

  const canvas = makeCanvas(ATLAS_W, ATLAS_H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(ATLAS_W, ATLAS_H);
  const px = new Uint32Array(img.data.buffer);

  for (const p of placed) {
    const t = palTable(p.pal);
    const { g, normal, flipped } = p;
    const w = normal.w, h = normal.h;
    for (let yy = 0; yy < h; yy++) {
      const row = g[yy];
      for (let xx = 0; xx < w; xx++) {
        const ch = row[xx];
        const c = ch === '.' || t[ch] === undefined ? 0 : t[ch];
        px[(normal.sy + yy) * ATLAS_W + normal.sx + xx] = c;
        px[(flipped.sy + yy) * ATLAS_W + flipped.sx + (w - 1 - xx)] = c;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  index.__blank.rects[0] = BLANK;
  index.__blank.rects[1] = BLANK;

  // get: ohne Allokation; fehlende Namen liefern das leere Feld.
  function get(name, frame = 0, flip = false) {
    const e = index[name];
    if (!e) return BLANK;
    const i = (frame % e.n + e.n) % e.n;
    return e.rects[i * 2 + (flip ? 1 : 0)];
  }
  return { atlas: canvas, get, size: { w: ATLAS_W, h: ATLAS_H } };
}
