// Höhengelände als Bild für die 2D-Ansicht, die Minimap, den Karteneditor und die Iso-Ansicht ohne WebGL:
// Schummerung (Licht aus Nordwest), Fels an steilen Hängen, Ufer und Seen. Farben wie im WebGL-Boden (ground.js).
import { RELIEF } from '../game/relief.js';

export const RELIEF_SCALE = 1 / 8; // Bildpunkte je Weltpixel (1 Bildpunkt = 8 px)
const LIGHT_2D = (() => {
  const l = [-0.55, -0.55, 0.62];
  const n = Math.hypot(...l);
  return l.map((v) => v / n);
})();

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * fx;
  const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * fx;
  return a + (b - a) * fy;
}

function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/**
 * Ein Bildpunkt am Weltpunkt (x, y): lit = Helligkeit (1 = eben), mat = Farbe und Deckkraft des Materials (Fels, Ufer,
 * Wasser, Höhenfärbung) über dem Gras.
 */
function sample(relief, x, y, out) {
  const h = relief.heightAt(x, y);
  const g = relief.gradAt(x, y, 12);
  const slope = Math.hypot(g.x, g.y);
  const nx = -g.x * 2.4; // von oben gesehen etwas stärker überhöht, damit Hügel sichtbar werden
  const ny = -g.y * 2.4;
  const nl = Math.hypot(nx, ny, 1);
  const L = LIGHT_2D;
  const dot = (nx * L[0] + ny * L[1] + L[2]) / nl;
  out.lit = clamp(1 + 1.05 * (dot - L[2]), 0.6, 1.35);
  const hh = clamp((h - 70) / 220, 0, 1);
  const n1 = vnoise(x / 46, y / 46);
  const n2 = vnoise(x / 26, y / 26); // gröber als im WebGL-Boden: ein Bildpunkt sind 8 px
  // Höhenfärbung (oben trockener), dann Fels, dann Ufer
  let r = 200;
  let gg = 186;
  let b = 120;
  let a = hh * 0.2;
  const rk = Math.max(smooth(RELIEF.rock, RELIEF.steep + 0.03, slope + (n1 - 0.5) * 0.1), smooth(RELIEF.peak - 40, RELIEF.peak, h));
  if (rk > 0) {
    const strata = 0.5 + 0.5 * Math.sin(h * 0.32 + n1 * 5);
    const t = clamp(n1 * 0.6 + hh * 0.45 + strata * 0.08, 0, 1);
    const f = 0.9 + 0.16 * n2;
    const rr = (87 + (140 - 87) * t) * f;
    const rg = (82 + (133 - 82) * t) * f;
    const rb = (74 + (120 - 74) * t) * f;
    const k = rk / Math.max(1e-6, a + rk - a * rk);
    r += (rr - r) * k;
    gg += (rg - gg) * k;
    b += (rb - b) * k;
    a = a + rk - a * rk;
  }
  const shore = (1 - smooth(RELIEF.water + 1, RELIEF.water + 10, h)) * 0.85;
  if (shore > 0) {
    const k = shore / Math.max(1e-6, a + shore - a * shore);
    r += (153 - r) * k;
    gg += (140 - gg) * k;
    b += (105 - b) * k;
    a = a + shore - a * shore;
  }
  if (h < RELIEF.water) {
    const d = RELIEF.water - h;
    const t = smooth(0, 50, d);
    const foam = (1 - smooth(0, 2.2, d)) * 0.55;
    r = 77 + (26 - 77) * t;
    gg = 128 + (56 - 128) * t;
    b = 128 + (79 - 128) * t;
    r += (199 - r) * foam;
    gg += (214 - gg) * foam;
    b += (209 - b) * foam;
    a = 1;
    out.lit = 1;
  }
  out.r = r;
  out.g = gg;
  out.b = b;
  out.a = a;
  return out;
}

/** Bildausschnitt [c0, c1) × [r0, r1) (Bildpunkte) der Ebenen neu berechnen; (ox, oy) = Lage der Ebenen im Gesamtbild. */
function paint(relief, layers, c0, r0, c1, r1, ox = 0, oy = 0) {
  const { mat, shade } = layers;
  const w = c1 - c0;
  const h = r1 - r0;
  if (w <= 0 || h <= 0) return;
  const step = 1 / RELIEF_SCALE;
  const md = mat ? mat.getContext('2d').createImageData(w, h) : null;
  const sd = shade ? shade.getContext('2d').createImageData(w, h) : null;
  const o = {};
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      sample(relief, (c0 + i + 0.5) * step, (r0 + j + 0.5) * step, o);
      const k = (j * w + i) * 4;
      if (md) {
        md.data[k] = o.r;
        md.data[k + 1] = o.g;
        md.data[k + 2] = o.b;
        md.data[k + 3] = o.a * 255;
      }
      if (sd) {
        const v = clamp(0.5 + (o.lit - 1) * 0.55, 0, 1) * 255;
        sd.data[k] = sd.data[k + 1] = sd.data[k + 2] = v;
        sd.data[k + 3] = 255;
      }
    }
  }
  if (md) mat.getContext('2d').putImageData(md, c0 - ox, r0 - oy);
  if (sd) shade.getContext('2d').putImageData(sd, c0 - ox, r0 - oy);
}

/**
 * Ebenen für das Geländebild der Karte (Größe = Karte × RELIEF_SCALE): mat = Material über dem Gras (normal überblenden),
 * shade = Schummerung (Grau, 50 % = eben; mit „soft-light“ über das fertige Bild legen).
 */
export function reliefLayers(relief, width, height) {
  const w = Math.round(width * RELIEF_SCALE);
  const h = Math.round(height * RELIEF_SCALE);
  const layers = { mat: makeCanvas(w, h), shade: makeCanvas(w, h) };
  paint(relief, layers, 0, 0, w, h);
  return layers;
}

const TILE = 128; // Kachelgröße des Editor-Bodens in Bildpunkten (= 1024 px Karte)

/**
 * Geländebild für den Karteneditor in Kacheln (mat und shade wie reliefLayers), damit der Pinsel nur kleine Bilder neu
 * schreibt. Jede Kachel hat 1 Bildpunkt Rand (für glatte Übergänge beim Skalieren). Zeichnen mit drawReliefTiles.
 */
export function reliefTiles(relief, width, height) {
  const w = Math.round(width * RELIEF_SCALE);
  const h = Math.round(height * RELIEF_SCALE);
  const t = { tiles: [] };
  for (let r0 = 0; r0 < h; r0 += TILE) {
    for (let c0 = 0; c0 < w; c0 += TILE) {
      const tw = Math.min(TILE, w - c0);
      const th = Math.min(TILE, h - r0);
      const tile = { c0, r0, w: tw, h: th, mat: makeCanvas(tw + 2, th + 2), shade: makeCanvas(tw + 2, th + 2) };
      t.tiles.push(tile);
      paintTile(relief, tile, c0 - 1, r0 - 1, c0 + tw + 1, r0 + th + 1);
    }
  }
  return t;
}

function paintTile(relief, tile, c0, r0, c1, r1) {
  const a0 = Math.max(c0, tile.c0 - 1);
  const b0 = Math.max(r0, tile.r0 - 1);
  const a1 = Math.min(c1, tile.c0 + tile.w + 1);
  const b1 = Math.min(r1, tile.r0 + tile.h + 1);
  paint(relief, tile, a0, b0, a1, b1, tile.c0 - 1, tile.r0 - 1);
}

/** Weltrechteck [x0, x1] × [y0, y1] des Editor-Geländebilds neu zeichnen (nach Heben, Senken, Glätten, Ebnen). */
export function updateReliefTiles(t, relief, x0, y0, x1, y1) {
  const c0 = Math.floor(x0 * RELIEF_SCALE) - 1;
  const r0 = Math.floor(y0 * RELIEF_SCALE) - 1;
  const c1 = Math.ceil(x1 * RELIEF_SCALE) + 1;
  const r1 = Math.ceil(y1 * RELIEF_SCALE) + 1;
  for (const tile of t.tiles) {
    if (tile.c0 - 1 >= c1 || tile.r0 - 1 >= r1 || tile.c0 + tile.w + 1 <= c0 || tile.r0 + tile.h + 1 <= r0) continue;
    paintTile(relief, tile, c0, r0, c1, r1);
  }
}

/**
 * Sichtbare Kacheln einer Ebene ('mat' oder 'shade') zeichnen. ctx steht auf Bildschirm-Pixeln (Transformation 1:1),
 * (ox, oy) = Bildschirmlage des Kartenursprungs, s = Bildschirm-Pixel je Weltpixel. Kanten auf ganze Pixel, damit keine
 * Fugen entstehen.
 */
export function drawReliefTiles(ctx, t, layer, ox, oy, s, vw, vh) {
  const k = s / RELIEF_SCALE;
  for (const tile of t.tiles) {
    const x0 = Math.round(ox + tile.c0 * k);
    const y0 = Math.round(oy + tile.r0 * k);
    const x1 = Math.round(ox + (tile.c0 + tile.w) * k);
    const y1 = Math.round(oy + (tile.r0 + tile.h) * k);
    if (x1 <= 0 || y1 <= 0 || x0 >= vw || y0 >= vh) continue;
    ctx.drawImage(tile[layer], 1, 1, tile.w, tile.h, x0, y0, x1 - x0, y1 - y0);
  }
}
