// Simfurt – isometrischer Canvas-Renderer. Sprites werden einmal gezeichnet und zwischengespeichert.
import { N, T_WATER, T_TREES, Z_R, Z_C, Z_I, Z_B, ZONES, BUILD } from './data.js';

export const TW = 64, TH = 32;
const SS = 2;                                   // Sprite-Auflösung (Supersampling)
const sprites = new Map();

// ---------------------------------------------------------------- Farben
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
export function shade(hex, f) { const [r, g, b] = hexToRgb(hex); return '#' + [r, g, b].map((v) => clamp8(v * f).toString(16).padStart(2, '0')).join(''); }
const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return '#' + A.map((v, i) => clamp8(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const rnd = (seed) => { let h = Math.imul(seed + 1, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- Sprite-Werkzeuge
/** Erzeugt einen Sprite für eine Fläche fw×fh Kacheln mit maximaler Höhe hmax px. Lokale Ursprung: Spitze (oben) der Fläche. */
function sprite(key, fw, fh, hmax, draw) {
  let sp = sprites.get(key);
  if (sp) return sp;
  const ox = fh * 32 + 4, oy = hmax + 4;
  const w = (fw + fh) * 32 + 8, h = (fw + fh) * 16 + hmax + 8;
  const c = document.createElement('canvas'); c.width = w * SS; c.height = h * SS;
  const g = c.getContext('2d'); g.scale(SS, SS);
  draw(g, { ox, oy });
  sp = { c, ox, oy, w, h };
  sprites.set(key, sp);
  return sp;
}
const X = (o, u, v) => o.ox + (u - v) * 32;
const Y = (o, u, v, z = 0) => o.oy + (u + v) * 16 - z;
function poly(g, pts, fill, stroke) {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 0.7; g.stroke(); }
}
/** Flache Fläche am Boden (Kachelraum). */
function flat(g, o, u0, v0, u1, v1, fill, z = 0) {
  poly(g, [[X(o, u0, v0), Y(o, u0, v0, z)], [X(o, u1, v0), Y(o, u1, v0, z)], [X(o, u1, v1), Y(o, u1, v1, z)], [X(o, u0, v1), Y(o, u0, v1, z)]], fill);
}
/** Quader: [u0,u1]×[v0,v1], von z0 bis z0+H. Sichtbar: Oberseite, linke Fläche (+v), rechte Fläche (+u). */
function prism(g, o, u0, v0, u1, v1, z0, H, col, opt = {}) {
  const z1 = z0 + H;
  const L = [[X(o, u0, v1), Y(o, u0, v1, z0)], [X(o, u1, v1), Y(o, u1, v1, z0)], [X(o, u1, v1), Y(o, u1, v1, z1)], [X(o, u0, v1), Y(o, u0, v1, z1)]];
  const R = [[X(o, u1, v1), Y(o, u1, v1, z0)], [X(o, u1, v0), Y(o, u1, v0, z0)], [X(o, u1, v0), Y(o, u1, v0, z1)], [X(o, u1, v1), Y(o, u1, v1, z1)]];
  poly(g, L, shade(col, opt.l ?? 1.0), opt.line); poly(g, R, shade(col, opt.r ?? 0.72), opt.line);
  flat(g, o, u0, v0, u1, v1, opt.top ?? shade(col, 1.18), z1);
  if (opt.win) windows(g, o, u0, v0, u1, v1, z0, H, opt.win);
}
/** Fenster auf beiden Sichtflächen. win: {c: Spalten pro Kachel-Einheit, rows, lit, dark, seed} */
function windows(g, o, u0, v0, u1, v1, z0, H, w) {
  const rows = w.rows ?? Math.max(1, Math.floor(H / 9));
  const rh = (H - 4) / rows;
  for (const side of ['L', 'R']) {
    const len = side === 'L' ? u1 - u0 : v1 - v0;
    const cols = Math.max(1, Math.round(len * (w.c ?? 4)));
    const bx = side === 'L' ? [X(o, u0, v1), Y(o, u0, v1, z0)] : [X(o, u1, v1), Y(o, u1, v1, z0)];
    const dx = side === 'L' ? 32 : 32, dy = side === 'L' ? 16 : -16;   // pro Kachel-Einheit entlang der Kante
    g.save(); g.translate(bx[0], bx[1]); g.transform(1, dy / dx, 0, 1, 0, 0);
    const cw = (len * 32) / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lit = rnd((w.seed || 0) * 131 + r * 17 + c * 7 + (side === 'L' ? 1 : 2)) < (w.lit ?? 0.35);
      g.fillStyle = lit ? (w.litc || '#ffe9a8') : (w.dark || 'rgba(20,30,50,.55)');
      g.fillRect(c * cw + cw * 0.22, -(r + 1) * rh + rh * 0.2 - 2, cw * 0.56, rh * 0.55);
    }
    g.restore();
  }
}
/** Satteldach: Firstachse entlang u (axis 'u') oder v. */
function gable(g, o, u0, v0, u1, v1, z, H, col, axis = 'u') {
  if (axis === 'u') {
    const vm = (v0 + v1) / 2;
    poly(g, [[X(o, u1, v1), Y(o, u1, v1, z)], [X(o, u1, v0), Y(o, u1, v0, z)], [X(o, u1, vm), Y(o, u1, vm, z + H)]], shade(col, 0.6));
    poly(g, [[X(o, u0, v1), Y(o, u0, v1, z)], [X(o, u1, v1), Y(o, u1, v1, z)], [X(o, u1, vm), Y(o, u1, vm, z + H)], [X(o, u0, vm), Y(o, u0, vm, z + H)]], shade(col, 1.0));
    poly(g, [[X(o, u0, vm), Y(o, u0, vm, z + H)], [X(o, u1, vm), Y(o, u1, vm, z + H)], [X(o, u1, v0), Y(o, u1, v0, z)], [X(o, u0, v0), Y(o, u0, v0, z)]], shade(col, 0.8));
  } else {
    const um = (u0 + u1) / 2;
    poly(g, [[X(o, u0, v1), Y(o, u0, v1, z)], [X(o, u1, v1), Y(o, u1, v1, z)], [X(o, um, v1), Y(o, um, v1, z + H)]], shade(col, 0.95));
    poly(g, [[X(o, um, v1), Y(o, um, v1, z + H)], [X(o, u1, v1), Y(o, u1, v1, z)], [X(o, u1, v0), Y(o, u1, v0, z)], [X(o, um, v0), Y(o, um, v0, z + H)]], shade(col, 0.7));
    poly(g, [[X(o, u0, v1), Y(o, u0, v1, z)], [X(o, um, v1), Y(o, um, v1, z + H)], [X(o, um, v0), Y(o, um, v0, z + H)], [X(o, u0, v0), Y(o, u0, v0, z)]], shade(col, 1.15));
  }
}
function pyramid(g, o, u0, v0, u1, v1, z, H, col) {
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  const T = [X(o, um, vm), Y(o, um, vm, z + H)];
  poly(g, [[X(o, u0, v1), Y(o, u0, v1, z)], [X(o, u1, v1), Y(o, u1, v1, z)], T], shade(col, 1.05));
  poly(g, [[X(o, u1, v1), Y(o, u1, v1, z)], [X(o, u1, v0), Y(o, u1, v0, z)], T], shade(col, 0.7));
}
function ellipseFlat(g, o, cu, cv, ru, rv, z, fill) {
  g.save(); g.transform(32, 16, -32, 16, X(o, 0, 0), Y(o, 0, 0, z));
  g.beginPath(); g.ellipse(cu, cv, ru, rv, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.restore();
}
function icon(g, o, cu, cv, z, ch, size = 16) {
  g.font = `${size}px "Segoe UI Emoji","Noto Color Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.fillText(ch, X(o, cu, cv), Y(o, cu, cv, z));
}
function tree(g, x, y, s = 1, c = '#2f7a3c') {
  g.fillStyle = '#5a3d22'; g.fillRect(x - 1 * s, y - 4 * s, 2 * s, 5 * s);
  g.fillStyle = shade(c, 0.85); g.beginPath(); g.ellipse(x, y - 8 * s, 6 * s, 6.5 * s, 0, 0, 7); g.fill();
  g.fillStyle = c; g.beginPath(); g.ellipse(x - 1.5 * s, y - 10 * s, 4.5 * s, 4.8 * s, 0, 0, 7); g.fill();
}

// ---------------------------------------------------------------- Boden
const GRASS = ['#6fae52', '#74b356', '#6aa84f', '#78b65a'];
function groundSprite(key, fn) { return sprite(key, 1, 1, 0, fn); }

export function grassSprite(variant) {
  return groundSprite('gr' + variant, (g, o) => {
    flat(g, o, 0, 0, 1, 1, GRASS[variant & 3]);
    for (let k = 0; k < 5; k++) { const u = rnd(variant * 9 + k) , v = rnd(variant * 5 + k + 40); g.fillStyle = 'rgba(40,90,30,.28)'; g.fillRect(X(o, u, v) - 1, Y(o, u, v), 2, 1); }
  });
}
export function waterSprite(frame, mask) {
  return groundSprite(`w${frame}_${mask}`, (g, o) => {
    flat(g, o, 0, 0, 1, 1, frame ? '#3e86c4' : '#4290cf');
    // Ufer: N=(y-1) → Kante Spitze→rechts; E=(x+1) → rechts→unten; S=(y+1) → unten→links; W=(x-1) → links→Spitze
    const edge = (a, b, c, d) => poly(g, [[X(o, a[0], a[1]), Y(o, a[0], a[1])], [X(o, b[0], b[1]), Y(o, b[0], b[1])], [X(o, d[0], d[1]), Y(o, d[0], d[1])], [X(o, c[0], c[1]), Y(o, c[0], c[1])]], 'rgba(214,196,150,.8)');
    if (mask & 1) edge([0, 0], [1, 0], [0, 0.14], [1, 0.14]);
    if (mask & 2) edge([1, 0], [1, 1], [0.86, 0], [0.86, 1]);
    if (mask & 4) edge([0, 1], [1, 1], [0, 0.86], [1, 0.86]);
    if (mask & 8) edge([0, 0], [0, 1], [0.14, 0], [0.14, 1]);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.8;
    for (let k = 0; k < 3; k++) { const u = 0.2 + rnd(frame * 7 + k + mask) * 0.6, v = 0.2 + rnd(frame * 3 + k * 5 + mask) * 0.6; g.beginPath(); g.moveTo(X(o, u, v) - 4, Y(o, u, v)); g.lineTo(X(o, u, v) + 4, Y(o, u, v)); g.stroke(); }
  });
}
export function zoneSprite(z, variant) {
  const col = ZONES[z].color;
  return groundSprite(`zn${z}_${variant & 3}`, (g, o) => {
    flat(g, o, 0, 0, 1, 1, GRASS[variant & 3]);
    flat(g, o, 0.06, 0.06, 0.94, 0.94, mix(GRASS[variant & 3], col, 0.5));
    flat(g, o, 0.14, 0.14, 0.86, 0.86, mix(GRASS[variant & 3], col, 0.28));
  });
}
export function lotSprite(z) {
  return groundSprite('lot' + z, (g, o) => {
    flat(g, o, 0, 0, 1, 1, '#8a9a78'); flat(g, o, 0.04, 0.04, 0.96, 0.96, z === Z_I ? '#8d8a82' : z === Z_B ? '#9ea4ae' : '#a2ab92');
  });
}
export function roadSprite(mask, bridge, water) {
  return groundSprite(`rd${mask}_${bridge ? 1 : 0}`, (g, o) => {
    if (bridge) flat(g, o, 0, 0, 1, 1, '#3f86c3');
    else flat(g, o, 0, 0, 1, 1, '#9aa389');
    const W = 0.3;
    const arms = [[mask & 1, 0.5 - W, 0, 0.5 + W, 0.5 + 0.0], [mask & 2, 0.5, 0.5 - W, 1, 0.5 + W], [mask & 4, 0.5 - W, 0.5, 0.5 + W, 1], [mask & 8, 0, 0.5 - W, 0.5, 0.5 + W]];
    const asphalt = bridge ? '#5d6670' : '#4d5159';
    flat(g, o, 0.5 - W, 0.5 - W, 0.5 + W, 0.5 + W, asphalt);
    for (const [on, u0, v0, u1, v1] of arms) if (on) flat(g, o, u0, v0, u1, v1, asphalt);
    if (!mask) { flat(g, o, 0.5 - W, 0.5 - W, 0.5 + W, 0.5 + W, asphalt); }
    // Mittellinie
    g.strokeStyle = '#e8d874'; g.lineWidth = 1; g.setLineDash([3, 3]);
    const seg = (a, b) => { g.beginPath(); g.moveTo(X(o, a[0], a[1]), Y(o, a[0], a[1])); g.lineTo(X(o, b[0], b[1]), Y(o, b[0], b[1])); g.stroke(); };
    if (mask & 1) seg([0.5, 0], [0.5, 0.5]); if (mask & 4) seg([0.5, 0.5], [0.5, 1]); if (mask & 2) seg([0.5, 0.5], [1, 0.5]); if (mask & 8) seg([0, 0.5], [0.5, 0.5]);
    g.setLineDash([]);
    if (bridge) { // Geländer
      g.strokeStyle = '#d9dde2'; g.lineWidth = 1.5;
      const rail = (u0, v0, u1, v1) => { g.beginPath(); g.moveTo(X(o, u0, v0), Y(o, u0, v0, 3)); g.lineTo(X(o, u1, v1), Y(o, u1, v1, 3)); g.stroke(); };
      if (mask & (1 | 4)) { rail(0.5 - W, 0, 0.5 - W, 1); rail(0.5 + W, 0, 0.5 + W, 1); }
      if (mask & (2 | 8)) { rail(0, 0.5 - W, 1, 0.5 - W); rail(0, 0.5 + W, 1, 0.5 + W); }
    }
  });
}

// ---------------------------------------------------------------- Zonengebäude
const WALL_R = ['#f1e2c0', '#f0d38a', '#e8b9a0', '#d9e0cc', '#efe9dc'];
const ROOF_R = ['#b8452f', '#a1432c', '#7c3b2e', '#8c5a3c'];
const GLASS = ['#5b8fb8', '#4f9aa8', '#7a8fb0', '#6d9a9a'];

export function zoneBuilding(z, lvl, vr) {
  const v = vr & 31;
  return sprite(`zb${z}_${lvl}_${v}`, 1, 1, z === Z_B ? 220 : 120, (g, o) => {
    const wall = WALL_R[v % WALL_R.length], roof = ROOF_R[(v >> 2) % ROOF_R.length];
    if (z === Z_R) {
      if (lvl === 1) {
        prism(g, o, 0.2, 0.22, 0.8, 0.78, 0, 13, wall, { win: { c: 3, rows: 1, lit: 0.3, seed: v } });
        gable(g, o, 0.16, 0.18, 0.84, 0.82, 13, 11, roof, v & 1 ? 'u' : 'v');
        // Gärtchen
        g.fillStyle = '#4f9a45'; g.beginPath(); g.ellipse(X(o, 0.12, 0.9), Y(o, 0.12, 0.9), 4, 2.5, 0, 0, 7); g.fill();
      } else if (lvl === 2) {
        prism(g, o, 0.1, 0.12, 0.9, 0.88, 0, 33, wall, { win: { c: 5, rows: 3, lit: 0.35, seed: v } });
        gable(g, o, 0.08, 0.1, 0.92, 0.9, 33, 9, roof, v & 1 ? 'u' : 'v');
      } else {
        const col = mix(['#d8d4cb', '#c9c2b4', '#bfc8cf', '#cfc0b2'][v & 3], '#ffffff', 0.05);
        prism(g, o, 0.12, 0.12, 0.88, 0.88, 0, 62, col, { win: { c: 5, rows: 7, lit: 0.4, seed: v } });
        prism(g, o, 0.3, 0.3, 0.7, 0.7, 62, 8, '#aab0b4');
      }
    } else if (z === Z_C) {
      if (lvl === 1) {
        prism(g, o, 0.12, 0.14, 0.88, 0.86, 0, 15, ['#f0d9a5', '#e2ecef', '#ecc2b3'][v % 3], { win: { c: 3, rows: 1, lit: 0.5, litc: '#bfe6ff', seed: v } });
        // Markise
        poly(g, [[X(o, 0.12, 0.9), Y(o, 0.12, 0.9, 11)], [X(o, 0.88, 0.9), Y(o, 0.88, 0.9, 11)], [X(o, 0.88, 0.98), Y(o, 0.88, 0.98, 8)], [X(o, 0.12, 0.98), Y(o, 0.12, 0.98, 8)]], ['#d5392e', '#2f7bd0', '#3aa35a'][v % 3]);
      } else if (lvl === 2) {
        prism(g, o, 0.1, 0.1, 0.9, 0.9, 0, 40, GLASS[v & 3], { win: { c: 5, rows: 5, lit: 0.45, dark: 'rgba(210,235,255,.5)', seed: v } });
        prism(g, o, 0.3, 0.3, 0.7, 0.7, 40, 5, '#8e9aa5');
      } else {
        prism(g, o, 0.12, 0.12, 0.88, 0.88, 0, 56, GLASS[v & 3], { win: { c: 5, rows: 8, lit: 0.45, dark: 'rgba(210,235,255,.5)', seed: v } });
        prism(g, o, 0.24, 0.24, 0.76, 0.76, 56, 26, shade(GLASS[v & 3], 0.95), { win: { c: 4, rows: 3, lit: 0.45, dark: 'rgba(210,235,255,.5)', seed: v + 3 } });
      }
    } else if (z === Z_I) {
      const wall = ['#b9b5aa', '#a9b0b6', '#c2aa8c'][v % 3];
      if (lvl === 1) {
        prism(g, o, 0.12, 0.14, 0.88, 0.86, 0, 13, wall, { win: { c: 3, rows: 1, lit: 0.1, seed: v } });
        gable(g, o, 0.1, 0.12, 0.9, 0.88, 13, 5, '#7b6f66', 'u');
        prism(g, o, 0.66, 0.2, 0.78, 0.32, 13, 15, '#8a4b3c');
      } else if (lvl === 2) {
        prism(g, o, 0.08, 0.1, 0.92, 0.9, 0, 18, wall, { win: { c: 4, rows: 1, lit: 0.1, seed: v } });
        for (let k = 0; k < 3; k++) gable(g, o, 0.08 + k * 0.28, 0.1, 0.36 + k * 0.28, 0.9, 18, 6, '#6e7480', 'v');
        prism(g, o, 0.74, 0.14, 0.86, 0.26, 18, 22, '#8a4b3c'); prism(g, o, 0.6, 0.14, 0.7, 0.24, 18, 16, '#8a4b3c');
      } else {
        prism(g, o, 0.06, 0.08, 0.94, 0.92, 0, 24, wall, { win: { c: 5, rows: 2, lit: 0.15, seed: v } });
        prism(g, o, 0.1, 0.12, 0.5, 0.5, 24, 8, '#8d939a');
        for (const [u, vv, h] of [[0.7, 0.2, 40], [0.82, 0.3, 34], [0.62, 0.34, 28]]) { prism(g, o, u, vv, u + 0.1, vv + 0.1, 24, h, '#9a4c3a'); }
        ellipseFlat(g, o, 0.3, 0.75, 0.16, 0.16, 24, '#a9b4bc'); prism(g, o, 0.16, 0.6, 0.44, 0.9, 0, 24, '#c9ced2', { top: '#d8dde0' });
      }
    } else {
      const heights = [0, 70, 104, 142, 188];
      const H = heights[lvl];
      const gl = ['#4a7fae', '#3f8f9c', '#6c7fa5', '#8a9aa6'][v & 3];
      const top = v % 4;
      prism(g, o, 0.2, 0.2, 0.8, 0.8, 0, H, gl, { win: { c: 5, rows: Math.floor(H / 7), lit: 0.32, dark: 'rgba(225,240,255,.55)', seed: v } });
      if (lvl >= 2) prism(g, o, 0.14, 0.14, 0.86, 0.86, 0, 8, shade(gl, 0.9));
      if (top === 0) { pyramid(g, o, 0.2, 0.2, 0.8, 0.8, H, 22 + lvl * 4, '#c9d3da'); }
      else if (top === 1) { prism(g, o, 0.34, 0.34, 0.66, 0.66, H, 8, '#cfd5da'); g.fillStyle = '#e8eef0'; g.fillRect(X(o, 0.5, 0.5) - 1, Y(o, 0.5, 0.5, H + 8 + 26) , 2, 26); }
      else if (top === 2) { prism(g, o, 0.2, 0.2, 0.46, 0.8, H, 12 + lvl * 3, shade(gl, 1.05), { win: { c: 2, rows: 2, lit: 0.3, seed: v } }); }
      else { prism(g, o, 0.3, 0.3, 0.7, 0.7, H, 6, '#d6dcdf'); g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(X(o, 0.5, 0.5), Y(o, 0.5, 0.5, H + 7), 1.6, 0, 7); g.fill(); }
    }
  });
}

// ---------------------------------------------------------------- Dienste und Wahrzeichen
function pad(g, o, w, h, col = '#a9b09a') { flat(g, o, 0, 0, w, h, col); flat(g, o, 0.04, 0.04, w - 0.04, h - 0.04, shade(col, 1.06)); }

export function buildingSprite(key) {
  const d = BUILD[key];
  const hmax = { fraport: 90, ctower: 260, maintower: 230, mtower: 230, dom: 190, uni: 100, gas: 110, wind: 120, hbf: 90 }[key] || 100;
  return sprite('b_' + key, d.w, d.h, hmax, (g, o) => {
    const w = d.w, h = d.h;
    switch (key) {
      case 'gas': {
        pad(g, o, w, h, '#8f9489');
        prism(g, o, 0.15, 0.9, 1.1, 1.8, 0, 16, '#9aa0a6', { win: { c: 3, rows: 1, lit: 0.1 } });
        for (const [u, v] of [[0.55, 0.45], [1.45, 0.55]]) { // Kühltürme
          ellipseFlat(g, o, u, v, 0.34, 0.34, 0, '#cfd3d6');
          for (let z = 0; z < 40; z += 2) ellipseFlat(g, o, u, v, 0.34 - Math.sin(z / 40 * 3) * 0.06, 0.34 - Math.sin(z / 40 * 3) * 0.06, z, z % 4 ? '#d9dde0' : '#c3c8cc');
          ellipseFlat(g, o, u, v, 0.3, 0.3, 40, '#7a8086');
        }
        prism(g, o, 1.55, 1.4, 1.7, 1.55, 0, 52, '#a64a3a'); icon(g, o, 0.55, 1.45, 24, '⚡', 14); break;
      }
      case 'wind': {
        pad(g, o, w, h, '#8fb36e');
        for (const [u, v] of [[0.55, 0.5], [1.4, 1.3]]) {
          const px = X(o, u, v), py = Y(o, u, v);
          g.strokeStyle = '#f2f4f5'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 56); g.stroke();
          g.lineWidth = 1.8;
          for (let a = 0; a < 3; a++) { const an = a * 2.094 + 0.6; g.beginPath(); g.moveTo(px, py - 56); g.lineTo(px + Math.cos(an) * 22, py - 56 + Math.sin(an) * 22); g.stroke(); }
        } break;
      }
      case 'solar': {
        pad(g, o, w, h, '#8fa07a');
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const u = 0.1 + i * 0.95, v = 0.1 + j * 0.95;
          prism(g, o, u, v, u + 0.8, v + 0.8, 0, 3, '#243c78', { top: '#2f4f9e' });
          g.strokeStyle = 'rgba(180,200,255,.5)'; g.lineWidth = 0.5;
          flat(g, o, u + 0.38, v, u + 0.42, v + 0.8, 'rgba(180,200,255,.5)', 3);
        } break;
      }
      case 'park': {
        flat(g, o, 0, 0, 1, 1, '#5aa04a'); flat(g, o, 0.38, 0, 0.62, 1, '#d6c79a');
        tree(g, X(o, 0.2, 0.25), Y(o, 0.2, 0.25), 1); tree(g, X(o, 0.78, 0.7), Y(o, 0.78, 0.7), 1.1, '#3d8a3a'); tree(g, X(o, 0.8, 0.2), Y(o, 0.8, 0.2), 0.9, '#4aa04a'); tree(g, X(o, 0.2, 0.78), Y(o, 0.2, 0.78), 0.9, '#4aa04a');
        break;
      }
      case 'apple': {
        flat(g, o, 0, 0, 1, 1, '#a8b08a');
        prism(g, o, 0.18, 0.2, 0.8, 0.8, 0, 14, '#e8d9b8', { win: { c: 3, rows: 1, lit: 0.8, seed: 3 } });
        gable(g, o, 0.14, 0.16, 0.84, 0.84, 14, 12, '#8d3a2a', 'u');
        g.fillStyle = '#6b4a2a'; g.fillRect(X(o, 0.2, 0.95) - 3, Y(o, 0.2, 0.95) - 8, 6, 8); icon(g, o, 0.5, 0.95, 20, '🍏', 11); break;
      }
      case 'metro': {
        flat(g, o, 0, 0, 1, 1, '#9fa596');
        prism(g, o, 0.25, 0.25, 0.75, 0.75, 0, 9, '#c9ccd0');
        g.fillStyle = '#1f6a43'; g.fillRect(X(o, 0.5, 0.5) - 8, Y(o, 0.5, 0.5, 30), 16, 16); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('U', X(o, 0.5, 0.5), Y(o, 0.5, 0.5, 22));
        g.fillStyle = '#555'; g.fillRect(X(o, 0.5, 0.5) - 1, Y(o, 0.5, 0.5, 14), 2, 14); break;
      }
      case 'police': case 'fire': case 'school': case 'clinic': case 'uni': {
        pad(g, o, w, h, '#a8ad9f');
        const hh = { police: 22, fire: 20, school: 22, clinic: 36, uni: 40 }[key];
        prism(g, o, 0.14, 0.14, w - 0.14, h - 0.14, 0, hh, d.color, { win: { c: 3, rows: Math.max(1, Math.floor(hh / 12)), lit: 0.4, seed: 5 } });
        if (key === 'fire') { prism(g, o, 0.3, 0.7, 0.6, 0.9, 0, 12, '#f2d54a'); }
        if (key === 'uni') { prism(g, o, 0.9, 0.9, 2.1, 2.1, hh, 14, '#d9c7a0'); pyramid(g, o, 1.1, 1.1, 1.9, 1.9, hh + 14, 14, '#7e8a78'); }
        if (key === 'clinic') { g.fillStyle = '#d33'; const cx = X(o, w / 2, h / 2), cy = Y(o, w / 2, h / 2, hh); g.fillRect(cx - 7, cy - 2, 14, 4); g.fillRect(cx - 2, cy - 7, 4, 14); }
        else icon(g, o, w / 2, h / 2, hh + 2, d.icon, 15);
        break;
      }
      case 'roemer': {
        pad(g, o, w, h, '#b6aa94');
        const cols = ['#bd4f3a', '#d7c39a', '#a8452f'];
        for (let i = 0; i < 3; i++) {
          const u0 = 0.2 + i * 0.52, hh = 30 + (i === 1 ? 6 : 0);
          prism(g, o, u0, 0.5, u0 + 0.48, 1.6, 0, hh, cols[i], { win: { c: 4, rows: 3, lit: 0.35, seed: i } });
          gable(g, o, u0, 0.5, u0 + 0.48, 1.6, hh, 14 + i * 3, '#6b3a2c', 'v');
        } break;
      }
      case 'dom': {
        pad(g, o, w, h, '#b3ab98');
        prism(g, o, 0.2, 0.9, 1.7, 1.6, 0, 28, '#b0553c', { win: { c: 3, rows: 2, lit: 0.1, seed: 2 } });
        gable(g, o, 0.2, 0.9, 1.7, 1.6, 28, 16, '#59606a', 'u');
        prism(g, o, 0.15, 0.2, 0.75, 0.8, 0, 90, '#a54b34', { win: { c: 2, rows: 8, lit: 0.05, seed: 4 } });
        pyramid(g, o, 0.15, 0.2, 0.75, 0.8, 90, 52, '#5c6b62'); break;
      }
      case 'oper': {
        pad(g, o, w, h, '#c5bfae');
        prism(g, o, 0.2, 0.3, 1.8, 1.7, 0, 34, '#e5dcc6', { win: { c: 4, rows: 2, lit: 0.5, seed: 1 } });
        gable(g, o, 0.2, 0.3, 1.8, 1.7, 34, 14, '#6fa18c', 'u');
        g.strokeStyle = '#faf6ea'; g.lineWidth = 2; for (let k = 0; k < 7; k++) { const u = 0.32 + k * 0.2; g.beginPath(); g.moveTo(X(o, u, 1.72), Y(o, u, 1.72, 2)); g.lineTo(X(o, u, 1.72), Y(o, u, 1.72, 30)); g.stroke(); }
        flat(g, o, 0.2, 1.7, 1.8, 1.9, '#d9d0b8'); break;
      }
      case 'zoo': {
        pad(g, o, w, h, '#74b55a');
        flat(g, o, 0.3, 0.3, 2.7, 0.5, '#d7c9a0'); flat(g, o, 0.3, 0.5, 0.5, 2.7, '#d7c9a0');
        for (const [u, v] of [[0.8, 1.1], [1.6, 0.9], [2.3, 1.6], [1.2, 2.2], [2.4, 2.4], [0.6, 2.5]]) tree(g, X(o, u, v), Y(o, u, v), 1.2, '#3b9040');
        prism(g, o, 1.1, 1.3, 1.9, 1.9, 0, 10, '#c8a15a', { win: { c: 3, rows: 1, lit: 0 } }); icon(g, o, 1.5, 1.6, 36, '🦒', 24); icon(g, o, 2.3, 0.9, 12, '🐘', 16); break;
      }
      case 'palm': {
        pad(g, o, w, h, '#78b85c');
        prism(g, o, 0.2, 0.3, 2.8, 1.7, 0, 18, '#bfe3d2', { win: { c: 5, rows: 2, lit: 0.1, dark: 'rgba(70,140,110,.5)', seed: 2 }, top: '#a8d6c3' });
        gable(g, o, 0.2, 0.3, 2.8, 1.7, 18, 14, '#a5dcc4', 'u'); icon(g, o, 1.5, 1, 40, '🌴', 20); break;
      }
      case 'hbf': {
        pad(g, o, w, h, '#b0aca0');
        prism(g, o, 0.15, 0.3, 2.85, 1.7, 0, 34, '#cfc8b6', { win: { c: 4, rows: 2, lit: 0.4, seed: 3 } });
        gable(g, o, 0.15, 0.3, 2.85, 1.7, 34, 18, '#8fb3c4', 'u');
        prism(g, o, 1.25, 0.1, 1.75, 0.6, 34, 36, '#cfc8b6'); g.fillStyle = '#fff'; g.beginPath(); g.arc(X(o, 1.5, 0.35) + 0, Y(o, 1.5, 0.35, 56), 3.5, 0, 7); g.fill(); break;
      }
      case 'arena': {
        pad(g, o, w, h, '#a8aea0');
        ellipseFlat(g, o, 1.5, 1.5, 1.35, 1.35, 0, '#555a60');
        for (let z = 0; z < 26; z += 2) ellipseFlat(g, o, 1.5, 1.5, 1.35, 1.35, z, z % 4 ? '#c9ced3' : '#b6bbc1');
        ellipseFlat(g, o, 1.5, 1.5, 1.15, 1.15, 26, '#3d8a45'); ellipseFlat(g, o, 1.5, 1.5, 0.7, 0.7, 26, '#46a050'); icon(g, o, 1.5, 1.5, 34, '⚽', 14); break;
      }
      case 'messe': {
        pad(g, o, w, h, '#b9bdc0');
        prism(g, o, 0.2, 0.2, 1.4, 1.2, 0, 26, '#c3ced6', { win: { c: 3, rows: 2, lit: 0.3, dark: 'rgba(60,90,130,.5)', seed: 5 } });
        prism(g, o, 0.2, 1.4, 1.4, 2.8, 0, 26, '#c3ced6', { win: { c: 3, rows: 2, lit: 0.3, dark: 'rgba(60,90,130,.5)', seed: 6 } });
        prism(g, o, 1.7, 0.4, 2.8, 2.6, 0, 40, '#8aa9c2', { win: { c: 4, rows: 4, lit: 0.4, dark: 'rgba(230,245,255,.6)', seed: 7 } });
        icon(g, o, 1, 1.4, 40, '🏢', 16); break;
      }
      case 'mtower': {
        flat(g, o, 0, 0, 1, 1, '#a9a99a');
        prism(g, o, 0.24, 0.24, 0.76, 0.76, 0, 170, '#c9a98c', { win: { c: 4, rows: 22, lit: 0.18, dark: 'rgba(70,60,60,.5)', seed: 9 } });
        pyramid(g, o, 0.24, 0.24, 0.76, 0.76, 170, 34, '#7a8a8a'); break;
      }
      case 'maintower': {
        flat(g, o, 0, 0, 1, 1, '#a9a99a');
        prism(g, o, 0.22, 0.22, 0.78, 0.78, 0, 176, '#4a86b2', { win: { c: 5, rows: 24, lit: 0.2, dark: 'rgba(215,240,255,.55)', seed: 4 } });
        prism(g, o, 0.16, 0.16, 0.84, 0.84, 176, 5, '#e8eef0'); break;
      }
      case 'ctower': {
        flat(g, o, 0, 0, 1, 1, '#a9a99a');
        prism(g, o, 0.2, 0.2, 0.8, 0.8, 0, 200, '#dfe6e8', { win: { c: 4, rows: 28, lit: 0.15, dark: 'rgba(120,140,155,.5)', seed: 8 } });
        g.fillStyle = '#e8eef0'; g.fillRect(X(o, 0.5, 0.5) - 1, Y(o, 0.5, 0.5, 200 + 52), 2, 52);
        g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(X(o, 0.5, 0.5), Y(o, 0.5, 0.5, 254), 2, 0, 7); g.fill(); break;
      }
      case 'fraport': {
        pad(g, o, w, h, '#9a9f9a');
        flat(g, o, 0, 2.2, 5, 2.8, '#4a4f55'); g.strokeStyle = '#fff'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(o, 0.1, 2.5), Y(o, 0.1, 2.5)); g.lineTo(X(o, 4.9, 2.5), Y(o, 4.9, 2.5)); g.stroke(); g.setLineDash([]);
        prism(g, o, 0.3, 0.3, 3.4, 1.2, 0, 22, '#c9d3da', { win: { c: 3, rows: 2, lit: 0.4, dark: 'rgba(40,80,120,.5)', seed: 2 } });
        prism(g, o, 3.7, 0.3, 4.7, 1.9, 0, 26, '#b8c5cf', { win: { c: 3, rows: 2, lit: 0.4, dark: 'rgba(40,80,120,.5)', seed: 3 } });
        prism(g, o, 0.6, 1.4, 1.3, 1.8, 0, 8, '#a6adb3'); prism(g, o, 4.3, 2.0, 4.5, 2.1, 0, 44, '#8a9096'); icon(g, o, 2.2, 1.7, 22, '✈', 22); break;
      }
      default: pad(g, o, w, h); prism(g, o, 0.15, 0.15, w - 0.15, h - 0.15, 0, 24, d.color); icon(g, o, w / 2, h / 2, 26, d.icon);
    }
  });
}

export function treeSprite(variant) {
  return sprite('tree' + (variant & 7), 1, 1, 30, (g, o) => {
    flat(g, o, 0, 0, 1, 1, GRASS[variant & 3]);
    const pos = [[0.3, 0.3], [0.7, 0.35], [0.5, 0.65], [0.25, 0.75], [0.75, 0.8]];
    const n = 3 + (variant & 1) + ((variant >> 1) & 1);
    pos.slice(0, n).sort((a, b) => a[0] + a[1] - (b[0] + b[1])).forEach(([u, v], k) => tree(g, X(o, u, v), Y(o, u, v), 0.95 + rnd(variant * 3 + k) * 0.3, ['#2f7a3c', '#3a8a40', '#2a6e38', '#4a9444'][(variant + k) & 3]));
  });
}

// ---------------------------------------------------------------- Heatmap-Farben
function heat(v) { // 0..1 → grün → gelb → rot
  const t = Math.max(0, Math.min(1, v));
  const r = t < 0.5 ? 80 + t * 2 * 175 : 255, g = t < 0.5 ? 220 : 220 - (t - 0.5) * 2 * 190;
  return `rgba(${r | 0},${g | 0},60,.55)`;
}
const cool = (v) => { const t = Math.max(0, Math.min(1, v)); return `rgba(${(60 + (1 - t) * 160) | 0},${(90 + t * 130) | 0},${(220 - t * 40) | 0},.5)`; };

// ---------------------------------------------------------------- Renderer
export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.cam = { x: 0, y: (N * TH) / 4 + 60, z: 0.75 };
    this.w = 0; this.h = 0; this.dpr = 1;
    this.cars = [];
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr; this.w = this.cv.clientWidth; this.h = this.cv.clientHeight;
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
  }
  /** Bildschirm → Kachel (float). */
  toTile(sx, sy) {
    const wx = (sx - this.w / 2) / this.cam.z + this.cam.x, wy = (sy - this.h / 2) / this.cam.z + this.cam.y;
    const a = wx / 32, b = wy / 16;
    return [(a + b) / 2, (b - a) / 2];
  }
  tileCenter(x, y) { return [(x - y) * 32 + this.cam.x * 0, (x + y) * 16 + 16]; }
  clampCam() {
    const c = this.cam; const lim = N * 32 + 120;
    c.x = Math.max(-lim * 0.75, Math.min(lim * 0.75, c.x)); c.y = Math.max(-40, Math.min(N * 32 + 40, c.y));
    c.z = Math.max(0.3, Math.min(2.4, c.z));
  }
  centerOn(tx, ty) { this.cam.x = (tx - ty) * 32; this.cam.y = (tx + ty) * 16 + 16; this.clampCam(); }

  /** Zeichnet die Szene. ui: {overlay, ghost:{key,x,y,w,h,ok}, sel:[tiles], hover:[x,y], time} */
  draw(s, ui) {
    const g = this.g, cam = this.cam, dpr = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1a2a3a'; g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (this.w / 2 - cam.x * cam.z), dpr * (this.h / 2 - cam.y * cam.z));
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    // sichtbarer Kachelbereich
    const c = [this.toTile(0, 0), this.toTile(this.w, 0), this.toTile(0, this.h), this.toTile(this.w, this.h)];
    const x0 = Math.max(0, Math.floor(Math.min(...c.map((p) => p[0]))) - 2), x1 = Math.min(N - 1, Math.ceil(Math.max(...c.map((p) => p[0]))) + 2);
    const y0 = Math.max(0, Math.floor(Math.min(...c.map((p) => p[1]))) - 2), y1 = Math.min(N - 1, Math.ceil(Math.max(...c.map((p) => p[1]))) + 2 + 6);
    const frame = Math.floor(ui.time / 700) & 1;
    const draw = (sp, tx, ty) => g.drawImage(sp.c, (tx - ty) * 32 - sp.ox, (tx + ty) * 16 - sp.oy, sp.w, sp.h);
    const T = s.terrain, idx = (x, y) => y * N + x;
    const wat = (x, y) => x >= 0 && y >= 0 && x < N && y < N && T[idx(x, y)] === T_WATER;
    const roadAt = (x, y) => x >= 0 && y >= 0 && x < N && y < N && s.road[idx(x, y)] === 1;

    // --- Boden
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      if (s.road[i]) {
        const mask = (roadAt(x, y - 1) ? 1 : 0) | (roadAt(x + 1, y) ? 2 : 0) | (roadAt(x, y + 1) ? 4 : 0) | (roadAt(x - 1, y) ? 8 : 0);
        // Brücken-Enden ohne Nachbarn bekommen Verbindung zur Wasserseite
        draw(roadSprite(mask, T[i] === T_WATER), x, y);
      } else if (T[i] === T_WATER) {
        const mask = (!wat(x, y - 1) ? 1 : 0) | (!wat(x + 1, y) ? 2 : 0) | (!wat(x, y + 1) ? 4 : 0) | (!wat(x - 1, y) ? 8 : 0);
        draw(waterSprite(frame, mask), x, y);
      } else if (s.zone[i] && !s.occ[i]) {
        draw(s.lvl[i] ? lotSprite(s.zone[i]) : zoneSprite(s.zone[i], (x * 3 + y * 5) & 3), x, y);
      } else draw(grassSprite((x * 7 + y * 13 + (x ^ y)) & 3), x, y);
    }
    // --- Autos
    g.save();
    for (const car of this.cars) {
      const dx = car.nx - car.x, dy = car.ny - car.y;
      const px = car.x + 0.5 + car.pos * dx - dy * 0.14, py = car.y + 0.5 + car.pos * dy + dx * 0.14;
      if (px < x0 || px > x1 + 1 || py < y0 || py > y1 + 1) continue;
      const sx = (px - py) * 32, sy = (px + py) * 16;
      g.fillStyle = car.color; g.fillRect(sx - 3, sy - 3, 6, 4);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(sx - 2, sy - 3, 3, 1.5);
    }
    g.restore();

    // --- Objekte (diagonal sortiert)
    for (let sum = x0 + y0; sum <= x1 + y1; sum++) {
      for (let x = Math.max(x0, sum - y1); x <= Math.min(x1, sum - y0); x++) {
        const y = sum - x, i = idx(x, y);
        const bid = s.occ[i];
        if (bid) {
          const b = s.bld.find((q) => q.id === bid);
          if (b && x === b.x + b.w - 1 && y === b.y + b.h - 1) { const sp = buildingSprite(b.type); g.drawImage(sp.c, (b.x - b.y) * 32 - sp.ox, (b.x + b.y) * 16 - sp.oy, sp.w, sp.h); }
        } else if (s.zone[i] && s.lvl[i]) {
          draw(zoneBuilding(s.zone[i], s.lvl[i], s.vr[i]), x, y);
        } else if (T[i] === T_TREES && !s.road[i]) draw(treeSprite((x * 5 + y * 11) & 7), x, y);
        if (s.fire[i]) {
          g.font = '20px "Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(frame ? '🔥' : '🧯', (x - y) * 32, (x + y) * 16 + 8 - (frame ? 6 : 2));
          g.fillText('🔥', (x - y) * 32, (x + y) * 16 + 4 - (frame ? 2 : 8));
        }
      }
    }
    // --- Flut
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (s.flood[idx(x, y)]) this.diamond(x, y, 'rgba(60,130,220,.45)');
    // --- Overlay
    const m = s.maps;
    if (ui.overlay && ui.overlay !== 'none' && m) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = idx(x, y); if (T[i] === T_WATER && !s.road[i]) continue;
        let col = null;
        switch (ui.overlay) {
          case 'power': col = s.powered[i] ? 'rgba(250,215,60,.45)' : (s.zone[i] || s.occ[i] ? 'rgba(200,40,40,.5)' : null); break;
          case 'traffic': if (s.road[i]) col = heat(m.traffic[i] / 1.6); break;
          case 'crime': col = heat(m.crime[i] / 70); break;
          case 'pollution': col = heat(m.pol[i] / 70); break;
          case 'value': col = cool(m.value[i] / 80); break;
          case 'fire': col = cool(m.fire[i]); break;
          case 'health': col = cool(m.health[i]); break;
          case 'edu': col = cool(m.edu[i]); break;
        }
        if (col) this.diamond(x, y, col);
      }
    }
    // --- Auswahl / Geisterbild
    if (ui.sel) for (const [x, y, ok] of ui.sel) this.diamond(x, y, ok === false ? 'rgba(230,60,60,.5)' : 'rgba(255,255,255,.38)');
    if (ui.ghost) {
      const gh = ui.ghost;
      for (let yy = gh.y; yy < gh.y + gh.h; yy++) for (let xx = gh.x; xx < gh.x + gh.w; xx++) this.diamond(xx, yy, gh.ok ? 'rgba(80,230,120,.5)' : 'rgba(230,60,60,.55)');
      if (gh.key && gh.ok) {
        g.globalAlpha = 0.7; const sp = buildingSprite(gh.key);
        g.drawImage(sp.c, (gh.x - gh.y) * 32 - sp.ox, (gh.x + gh.y) * 16 - sp.oy, sp.w, sp.h); g.globalAlpha = 1;
      }
    }
    if (ui.hover && !ui.ghost && !ui.sel) this.diamond(ui.hover[0], ui.hover[1], 'rgba(255,255,255,.28)');
    if (ui.pick) this.diamondStroke(ui.pick[0], ui.pick[1]);
  }
  diamond(x, y, fill) {
    const g = this.g, px = (x - y) * 32, py = (x + y) * 16;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + 32, py + 16); g.lineTo(px, py + 32); g.lineTo(px - 32, py + 16); g.closePath(); g.fillStyle = fill; g.fill();
  }
  diamondStroke(x, y) {
    const g = this.g, px = (x - y) * 32, py = (x + y) * 16;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + 32, py + 16); g.lineTo(px, py + 32); g.lineTo(px - 32, py + 16); g.closePath(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  }
}
