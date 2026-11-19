// Simfurt – isometrischer Canvas-Renderer. Sprites werden einmal gezeichnet und zwischengespeichert.
import { N, T_WATER, T_TREES, Z_R, Z_C, Z_I, Z_B, ZONES, BUILD } from './data.js';

export const TW = 64, TH = 32;
const SS = 2;                                   // Sprite-Auflösung (Supersampling)
const sprites = new Map();
// Lichtpass (Nacht): Sprite-Funktionen zeichnen unverändert, aber Füllungen werden schwarz
// (Gebäude-Silhouette verdeckt Licht dahinter); nur Fenster bekommen Lichtfarbe.
let LIGHT = false, lightFill = '#000', lightCool = false;
let SPR = { fw: 1, fh: 1 };                     // Fläche des gerade gezeichneten Sprites (für Schatten im Rahmen)
const lightCtx = (g) => new Proxy(g, {
  get(t, k) { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
  set(t, k, v) { t[k] = (k === 'fillStyle' || k === 'strokeStyle') ? lightFill : v; return true; },
});

// ---------------------------------------------------------------- Farben
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
export function shade(hex, f) { const [r, g, b] = hexToRgb(hex); return '#' + [r, g, b].map((v) => clamp8(v * f).toString(16).padStart(2, '0')).join(''); }
const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return '#' + A.map((v, i) => clamp8(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const rnd = (seed) => { let h = Math.imul(seed + 1, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- Sprite-Werkzeuge
/** Erzeugt einen Sprite für eine Fläche fw×fh Kacheln mit maximaler Höhe hmax px. Lokale Ursprung: Spitze (oben) der Fläche. */
function sprite(key, fw, fh, hmax, draw, light = false, cool = false) {
  let sp = sprites.get(key);
  if (sp) return sp;
  const ox = fh * 32 + 4, oy = hmax + 4;
  const w = (fw + fh) * 32 + 8, h = (fw + fh) * 16 + hmax + 8;
  // Lichtsprites: gleiche Geometrie (w, h, ox, oy), aber 1× Auflösung – sie werden ohnehin skaliert gezeichnet
  const ss = light ? 1 : SS;
  const c = document.createElement('canvas'); c.width = w * ss; c.height = h * ss;
  const g = c.getContext('2d'); g.scale(ss, ss);
  SPR = { fw, fh };
  if (light) {
    LIGHT = true; lightFill = '#000'; lightCool = cool;
    try { draw(lightCtx(g), { ox, oy }); } finally { LIGHT = false; lightFill = '#000'; }
  } else draw(g, { ox, oy });
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
/**
 * Quader: [u0,u1]×[v0,v1], von z0 bis z0+H. Sichtbar: Oberseite, linke Fläche (+v), rechte Fläche (+u).
 * Optik: Schlagschatten nach rechts unten (nur z0 = 0), weicher Vertikalverlauf der Fassaden, Kanten-Highlights
 * (Licht von links oben), dunkle Bodenkante. Im Licht-Pass (LIGHT) entfallen diese Zutaten – Silhouette bleibt schwarz.
 */
function prism(g, o, u0, v0, u1, v1, z0, H, col, opt = {}) {
  const z1 = z0 + H;
  if (!LIGHT && z0 === 0 && opt.sh !== false) groundShadow(g, o, u0, v0, u1, v1);
  const L = [[X(o, u0, v1), Y(o, u0, v1, z0)], [X(o, u1, v1), Y(o, u1, v1, z0)], [X(o, u1, v1), Y(o, u1, v1, z1)], [X(o, u0, v1), Y(o, u0, v1, z1)]];
  const R = [[X(o, u1, v1), Y(o, u1, v1, z0)], [X(o, u1, v0), Y(o, u1, v0, z0)], [X(o, u1, v0), Y(o, u1, v0, z1)], [X(o, u1, v1), Y(o, u1, v1, z1)]];
  poly(g, L, faceFill(g, col, opt.l ?? 1.0, (X(o, u0, v1) + X(o, u1, v1)) / 2, (Y(o, u0, v1, z1) + Y(o, u1, v1, z1)) / 2, (Y(o, u0, v1, z0) + Y(o, u1, v1, z0)) / 2), opt.line);
  poly(g, R, faceFill(g, col, opt.r ?? 0.72, (X(o, u1, v1) + X(o, u1, v0)) / 2, (Y(o, u1, v1, z1) + Y(o, u1, v0, z1)) / 2, (Y(o, u1, v1, z0) + Y(o, u1, v0, z0)) / 2), opt.line);
  flat(g, o, u0, v0, u1, v1, opt.top ?? shade(col, 1.18), z1);
  if (!LIGHT && opt.hl !== false) edgeHL(g, o, u0, v0, u1, v1, z0, z1);
  if (opt.win) windows(g, o, u0, v0, u1, v1, z0, H, opt.win);
}
/** Fassadenfläche mit weichem Vertikalverlauf (oben heller). Im Licht-Pass einfarbig (wird ohnehin schwarz). */
function faceFill(g, col, f, x, yTop, yBot) {
  if (LIGHT) return shade(col, f);
  const gr = g.createLinearGradient(x, yTop, x, yBot);
  gr.addColorStop(0, shade(col, f * 1.08)); gr.addColorStop(1, shade(col, f * 0.88));
  return gr;
}
/** Schlagschatten am Boden: halbtransparente Fläche nach rechts unten, begrenzt auf den Sprite-Rahmen. */
function groundShadow(g, o, u0, v0, u1, v1) {
  const du = Math.max(0, Math.min(0.12, SPR.fw + 0.1 - u1)), dv = Math.max(0, Math.min(0.03, SPR.fh + 0.1 - v1));
  flat(g, o, u0 + du, v0 + dv, u1 + du, v1 + dv, 'rgba(12,30,42,.26)');
}
/** Kanten-Highlights: obere Vorderkanten und linke Ecke hell, Bodenkante dunkel (Licht von links oben). */
function edgeHL(g, o, u0, v0, u1, v1, z0, z1) {
  const P = (u, v, z) => [X(o, u, v), Y(o, u, v, z)];
  g.lineWidth = 0.9; g.strokeStyle = 'rgba(255,255,255,.42)';
  let p = P(u0, v1, z1); g.beginPath(); g.moveTo(p[0], p[1]);
  p = P(u0, v0, z1); g.lineTo(p[0], p[1]); p = P(u1, v0, z1); g.lineTo(p[0], p[1]); g.stroke();
  p = P(u0, v1, z0); g.strokeStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(p[0], p[1]);
  p = P(u0, v1, z1); g.lineTo(p[0], p[1]); g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(10,20,30,.3)'; g.beginPath();
  p = P(u0, v1, z0); g.moveTo(p[0], p[1]); p = P(u1, v1, z0); g.lineTo(p[0], p[1]); p = P(u1, v0, z0); g.lineTo(p[0], p[1]); g.stroke();
}
/** Punkt auf einer Fassade: a ∈ [0,1] entlang der Front (L: +u, R: −v), z = Höhe. */
function facePt(o, side, u0, v0, u1, v1, a, z) {
  if (side === 'L') { const u = u0 + (u1 - u0) * a; return [X(o, u, v1), Y(o, u, v1, z)]; }
  const v = v1 - (v1 - v0) * a; return [X(o, u1, v), Y(o, u1, v, z)];
}
/** Balkone: helle Platte mit Schattenkante unter jeder Fensterreihe (auf jeder `step`-ten Reihe). Nur Tagpass. */
function balconies(g, o, side, u0, v0, u1, v1, z0, H, rows, step) {
  if (LIGHT) return;
  const rh = (H - 4) / rows, P = (a, z) => facePt(o, side, u0, v0, u1, v1, a, z);
  for (let r = 1; r < rows; r += step) {
    const zb = z0 + (r + 0.25) * rh + 0.2, zt = zb + 1.6;
    poly(g, [P(0.1, zt), P(0.9, zt), P(0.9, zb), P(0.1, zb)], '#e8e1d1', 'rgba(60,50,40,.35)');
    poly(g, [P(0.1, zb), P(0.9, zb), P(0.9, zb - 0.9), P(0.1, zb - 0.9)], 'rgba(20,25,35,.28)');
  }
}
/** Glas-Spiegelung: zwei schräge helle Bänder auf einer Fassade (Verlauf von oben links). Nur Tagpass. */
function sheen(g, o, side, u0, v0, u1, v1, z0, z1) {
  if (LIGHT) return;
  const P = (a, z) => facePt(o, side, u0, v0, u1, v1, a, z), zb = z0 + 2, zt = z1 - 2;
  poly(g, [P(0.2, zb), P(0.34, zb), P(0.46, zt), P(0.32, zt)], 'rgba(255,255,255,.16)');
  poly(g, [P(0.62, zb), P(0.66, zb), P(0.78, zt), P(0.74, zt)], 'rgba(255,255,255,.1)');
}
/** Klimageräte: 1–3 kleine helle Kästen auf einem Flachdach (Höhe z). */
function acUnits(g, o, u0, v0, u1, v1, z, n = 2) {
  const spots = [[0.14, 0.14], [0.6, 0.18], [0.16, 0.6]];
  for (let k = 0; k < n; k++) {
    const [a, b] = spots[k % 3], u = u0 + (u1 - u0) * a, v = v0 + (v1 - v0) * b;
    prism(g, o, u, v, u + 0.14, v + 0.12, z, 4, '#e3e8eb', { top: '#f6f8fa', sh: false, hl: false });
  }
}
/** Dachgarten: Rasenfläche mit zwei dunkleren Büschen auf dem Flachdach. */
function roofGarden(g, o, u0, v0, u1, v1, z) {
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, ru = (u1 - u0) * 0.34, rv = (v1 - v0) * 0.34;
  ellipseFlat(g, o, cu, cv, ru, rv, z, '#5aa650');
  ellipseFlat(g, o, cu - ru * 0.5, cv - rv * 0.2, ru * 0.36, rv * 0.3, z + 0.6, '#3e8a42');
  ellipseFlat(g, o, cu + ru * 0.4, cv + rv * 0.35, ru * 0.3, rv * 0.26, z + 0.6, '#2f7a3a');
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
      if (LIGHT) { // Nachtpass: gleiche Fenster, nur ≈ 55 % leuchten (Banken kühlweiß, sonst warmgelb)
        if (rnd((w.seed || 0) * 131 + r * 17 + c * 7 + (side === 'L' ? 3 : 5) + 4096) >= 0.55) continue;
        lightFill = lightCool ? '#d4ebff' : '#ffd98a';
        g.fillStyle = lightFill;
      } else {
        const lit = rnd((w.seed || 0) * 131 + r * 17 + c * 7 + (side === 'L' ? 1 : 2)) < (w.lit ?? 0.35);
        g.fillStyle = lit ? (w.litc || '#ffe9a8') : (w.dark || 'rgba(20,30,50,.55)');
      }
      g.fillRect(c * cw + cw * 0.22, -(r + 1) * rh + rh * 0.2 - 2, cw * 0.56, rh * 0.55);
    }
    g.restore();
  }
  if (LIGHT) lightFill = '#000';
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
/** Schatten eines Baumes am Boden (Licht von links oben → nach rechts unten). */
function treeShadow(g, x, y, s, rx) {
  g.fillStyle = 'rgba(12,35,15,.26)'; g.beginPath(); g.ellipse(x + 3.5 * s, y + 0.6 * s, rx * s, 2.6 * s, 0, 0, 7); g.fill();
}
/** Laubbaum: runde Krone, dunklere Unterseite rechts, Lichtfleck oben links. */
function tree(g, x, y, s = 1, c = '#2f7a3c') {
  treeShadow(g, x, y, s, 6.5);
  g.fillStyle = '#5a3d22'; g.fillRect(x - 1 * s, y - 4 * s, 2 * s, 5 * s);
  g.fillStyle = shade(c, 0.8); g.beginPath(); g.ellipse(x + 0.6 * s, y - 7.8 * s, 6.1 * s, 6.4 * s, 0, 0, 7); g.fill();
  g.fillStyle = c; g.beginPath(); g.ellipse(x - 0.9 * s, y - 9.6 * s, 5 * s, 5 * s, 0, 0, 7); g.fill();
  g.fillStyle = shade(c, 1.25); g.beginPath(); g.ellipse(x - 2.5 * s, y - 11.4 * s, 2.2 * s, 1.9 * s, 0, 0, 7); g.fill();
}
/** Nadelbaum (Tanne): drei gestaffelte Dreiecke, links hell, rechts dunkel. Höchstens ~25 px über dem Fuß. */
function conifer(g, x, y, s = 1, c = '#2a6e3a') {
  treeShadow(g, x, y, s, 5);
  g.fillStyle = '#5a3d22'; g.fillRect(x - 0.8 * s, y - 3 * s, 1.6 * s, 4 * s);
  for (let i = 0; i < 3; i++) {
    const base = y - (2 + i * 5) * s, apex = base - 11 * s, hw = (5.2 - i * 1.1) * s;
    g.fillStyle = shade(c, 1.05); g.beginPath(); g.moveTo(x, apex); g.lineTo(x - hw, base); g.lineTo(x, base); g.closePath(); g.fill();
    g.fillStyle = shade(c, 0.74); g.beginPath(); g.moveTo(x, apex); g.lineTo(x, base); g.lineTo(x + hw, base); g.closePath(); g.fill();
  }
}
/** Busch: zwei flache Ballen mit Schatten. */
function bush(g, x, y, s = 1, c = '#3f8f45') {
  treeShadow(g, x, y, s, 5.5);
  g.fillStyle = shade(c, 0.8); g.beginPath(); g.ellipse(x + 0.6 * s, y - 3.4 * s, 5.4 * s, 3.8 * s, 0, 0, 7); g.fill();
  g.fillStyle = c; g.beginPath(); g.ellipse(x - 0.6 * s, y - 4.6 * s, 4.6 * s, 3.4 * s, 0, 0, 7); g.fill();
  g.fillStyle = shade(c, 1.22); g.beginPath(); g.ellipse(x - 2 * s, y - 6 * s, 1.8 * s, 1.1 * s, 0, 0, 7); g.fill();
}

// ---------------------------------------------------------------- Boden
const GRASS = ['#6fae52', '#74b356', '#6aa84f', '#78b65a'];
function groundSprite(key, fn) { return sprite(key, 1, 1, 0, fn); }

/** Kleine Farbtupfer und Grasbüschel auf einer Kachel (deterministisch je Variante). */
function grassSpeckle(g, o, variant, n, tuft) {
  for (let k = 0; k < n; k++) {
    const u = 0.08 + rnd(variant * 31 + k) * 0.84, v = 0.08 + rnd(variant * 17 + k * 3 + 90) * 0.84;
    g.fillStyle = rnd(variant * 5 + k + 7) < 0.6 ? 'rgba(40,90,30,.2)' : 'rgba(214,246,160,.16)';
    g.beginPath(); g.ellipse(X(o, u, v), Y(o, u, v), 1.2 + rnd(k + variant) * 0.8, 0.7, 0, 0, 7); g.fill();
  }
  if (!tuft) return;
  g.strokeStyle = 'rgba(36,82,28,.5)'; g.lineWidth = 0.8;
  for (let k = 0; k < 4; k++) {
    const u = 0.15 + rnd(variant * 13 + k * 7 + 3) * 0.7, v = 0.15 + rnd(variant * 19 + k * 5 + 11) * 0.7, x = X(o, u, v), y = Y(o, u, v);
    g.beginPath(); g.moveTo(x - 1.5, y); g.lineTo(x - 2.2, y - 2.6); g.moveTo(x, y); g.lineTo(x, y - 3.2); g.moveTo(x + 1.5, y); g.lineTo(x + 2.3, y - 2.4); g.stroke();
  }
}
/** Hell-Dunkel-Verlauf über eine Kachel (oben heller, unten dunkler). */
function tileShade(g, o, a0, a1) {
  const gr = g.createLinearGradient(X(o, 0, 0), Y(o, 0, 0), X(o, 1, 1), Y(o, 1, 1));
  gr.addColorStop(0, `rgba(255,255,220,${a0})`); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(20,50,20,${a1})`);
  flat(g, o, 0, 0, 1, 1, gr);
}
function rgba(hex, a) { const [r, gg, b] = hexToRgb(hex); return `rgba(${r},${gg},${b},${a})`; }
export function grassSprite(variant) {
  return groundSprite('gr' + variant, (g, o) => {
    flat(g, o, 0, 0, 1, 1, GRASS[variant & 3]);
    tileShade(g, o, 0.05, 0.05);
    grassSpeckle(g, o, variant, 16, true);
  });
}
export function waterSprite(frame, mask) {
  return groundSprite(`w${frame}_${mask}`, (g, o) => {
    flat(g, o, 0, 0, 1, 1, frame ? '#3b80bd' : '#4089c8');
    // Tiefenverlauf: an jeder Uferseite gestapelte helle Streifen (Ufer heller, Mitte dunkler)
    const sides = [mask & 1, mask & 2, mask & 4, mask & 8];
    const strip = [(w) => [0, 0, 1, w], (w) => [1 - w, 0, 1, 1], (w) => [0, 1 - w, 1, 1], (w) => [0, 0, w, 1]];
    for (const [w, a] of [[0.34, 0.06], [0.22, 0.07], [0.1, 0.09]]) {
      for (let s = 0; s < 4; s++) if (sides[s]) { const [u0, v0, u1, v1] = strip[s](w); flat(g, o, u0, v0, u1, v1, `rgba(170,230,250,${a})`); }
    }
    // Ufer: N=(y-1) → Kante Spitze→rechts; E=(x+1) → rechts→unten; S=(y+1) → unten→links; W=(x-1) → links→Spitze.
    // Sandkante (a→b Landseite, c→d Wasserseite) mit Böschungslinie und hellem Schaumsaum.
    const P = (p) => [X(o, p[0], p[1]), Y(o, p[0], p[1])];
    const edge = (a, b, c, d) => {
      poly(g, [P(a), P(b), P(d), P(c)], 'rgba(222,204,156,.94)');
      const off = [(c[0] - a[0]) * 0.22, (c[1] - a[1]) * 0.22];
      g.lineCap = 'round'; g.lineWidth = 0.9; g.strokeStyle = 'rgba(96,78,50,.4)';
      g.beginPath(); g.moveTo(...P(c)); g.lineTo(...P(d)); g.stroke();
      g.lineWidth = 0.7; g.strokeStyle = 'rgba(235,250,255,.4)';
      g.beginPath(); g.moveTo(...P([c[0] + off[0], c[1] + off[1]])); g.lineTo(...P([d[0] + off[0], d[1] + off[1]])); g.stroke();
    };
    if (mask & 1) edge([0, 0], [1, 0], [0, 0.14], [1, 0.14]);
    if (mask & 2) edge([1, 0], [1, 1], [0.86, 0], [0.86, 1]);
    if (mask & 4) edge([0, 1], [1, 1], [0, 0.86], [1, 0.86]);
    if (mask & 8) edge([0, 0], [0, 1], [0.14, 0], [0.14, 1]);
    // Glanzlinien: je Bild (frame) andere Positionen → sie flackern beim Wechsel
    g.strokeStyle = frame ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.26)'; g.lineWidth = 0.8; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const u = 0.25 + rnd(frame * 7 + k + mask) * 0.5, v = 0.25 + rnd(frame * 3 + k * 5 + mask) * 0.5, len = 3 + rnd(frame * 11 + k) * 2.5;
      g.beginPath(); g.moveTo(X(o, u, v) - len, Y(o, u, v)); g.lineTo(X(o, u, v) + len, Y(o, u, v)); g.stroke();
    }
  });
}
export function zoneSprite(z, variant) {
  const col = ZONES[z].color, base = GRASS[variant & 3];
  return groundSprite(`zn${z}_${variant & 3}`, (g, o) => {
    flat(g, o, 0, 0, 1, 1, base);
    // weicher Übergang: mehrere schwach gefärbte Ringe von außen nach innen statt harter Kanten
    for (let k = 0; k < 4; k++) { const i = 0.04 + k * 0.035; flat(g, o, i, i, 1 - i, 1 - i, rgba(col, 0.2 + k * 0.07)); }
    grassSpeckle(g, o, variant, 6, false);
  });
}
export function lotSprite(z) {
  const body = z === Z_I ? '#8d8a82' : z === Z_B ? '#9ea4ae' : '#a2ab92';
  return groundSprite('lot' + z, (g, o) => {
    flat(g, o, 0, 0, 1, 1, '#8a9a78'); flat(g, o, 0.04, 0.04, 0.96, 0.96, body);
    tileShade(g, o, 0.04, 0.05);
    // Schotter und eine Fahrspur der Baustelle
    for (let k = 0; k < 12; k++) {
      const u = 0.08 + rnd(z * 41 + k) * 0.84, v = 0.08 + rnd(z * 23 + k * 3 + 5) * 0.84;
      g.fillStyle = rnd(z * 9 + k) < 0.5 ? 'rgba(60,55,45,.22)' : 'rgba(255,255,255,.2)';
      g.beginPath(); g.ellipse(X(o, u, v), Y(o, u, v), 0.9, 0.6, 0, 0, 7); g.fill();
    }
    flat(g, o, 0.28, 0.46, 0.72, 0.52, 'rgba(70,64,52,.16)');
  });
}
export function roadSprite(mask, bridge, water) {
  return groundSprite(`rd${mask}_${bridge ? 1 : 0}`, (g, o) => {
    const W = 0.3, CW = 0.37;                       // halbe Fahrbahn- bzw. Gehwegbreite (Bordstein)
    const bits = [mask & 1, mask & 2, mask & 4, mask & 8];
    // Rechteck eines Arms (0 N, 1 O, 2 S, 3 W) mit halber Breite h, inklusive Mitte
    const arm = (a, h) => (a === 0 ? [0.5 - h, 0, 0.5 + h, 0.5 + h] : a === 1 ? [0.5 - h, 0.5 - h, 1, 0.5 + h] : a === 2 ? [0.5 - h, 0.5 - h, 0.5 + h, 1] : [0, 0.5 - h, 0.5 + h, 0.5 + h]);
    const band = (h, fill) => {
      flat(g, o, 0.5 - h, 0.5 - h, 0.5 + h, 0.5 + h, fill);
      for (let a = 0; a < 4; a++) if (bits[a]) flat(g, o, ...arm(a, h), fill);
    };
    if (bridge) {
      // Brücke: Schatten von Fahrbahn und Geländer aufs Wasser (rechts unten), dann das Deck
      flat(g, o, 0, 0, 1, 1, '#3f86c3');
      g.save(); g.translate(3, 2.5); band(W + 0.02, 'rgba(6,26,44,.3)'); g.restore();
      band(W, '#5d6670');
    } else {
      flat(g, o, 0, 0, 1, 1, '#9aa389');            // Grünstreifen
      band(CW + 0.015, 'rgba(40,46,36,.22)');       // Bordsteinschatten
      band(CW, '#c6c4b6');                          // Gehweg
      band(W, '#4d5159');                           // Fahrbahn
    }
    // Mittelstreifen gestrichelt
    g.strokeStyle = bridge ? '#e8d874' : '#ecd98a'; g.lineWidth = 1; g.setLineDash([3, 3]);
    const seg = (a, b) => { g.beginPath(); g.moveTo(X(o, a[0], a[1]), Y(o, a[0], a[1])); g.lineTo(X(o, b[0], b[1]), Y(o, b[0], b[1])); g.stroke(); };
    if (mask & 1) seg([0.5, 0], [0.5, 0.5]); if (mask & 4) seg([0.5, 0.5], [0.5, 1]); if (mask & 2) seg([0.5, 0.5], [1, 0.5]); if (mask & 8) seg([0, 0.5], [0.5, 0.5]);
    g.setLineDash([]);
    // Zebrastreifen an Kreuzungen (3 oder 4 Arme): weiße Balken quer über die Fahrbahn, Stufe nicht im Sprite-Schlüssel
    if (!bridge && bits[0] + bits[1] + bits[2] + bits[3] === 4) {
      const step = (2 * W) / 4, ZW = 'rgba(246,244,236,.7)';
      for (let a = 0; a < 4; a++) {
        if (!bits[a]) continue;
        for (let k = 0; k < 4; k++) {
          const p = 0.5 - W + k * step + step * 0.22, q = step * 0.52;
          if (a === 0) flat(g, o, p, 0.21, p + q, 0.31, ZW);
          else if (a === 2) flat(g, o, p, 0.69, p + q, 0.79, ZW);
          else if (a === 1) flat(g, o, 0.69, p, 0.79, p + q, ZW);
          else flat(g, o, 0.21, p, 0.31, p + q, ZW);
        }
      }
    }
    if (bridge) { // Geländer mit Schatten (Schiene auf z = 3 → Schatten um 2,5 px versetzt)
      const rails = (col, lw, dx, dy) => {
        g.save(); g.translate(dx, dy); g.strokeStyle = col; g.lineWidth = lw;
        const rail = (u0, v0, u1, v1) => { g.beginPath(); g.moveTo(X(o, u0, v0), Y(o, u0, v0, 3)); g.lineTo(X(o, u1, v1), Y(o, u1, v1, 3)); g.stroke(); };
        if (mask & (1 | 4)) { rail(0.5 - W, 0, 0.5 - W, 1); rail(0.5 + W, 0, 0.5 + W, 1); }
        if (mask & (2 | 8)) { rail(0, 0.5 - W, 1, 0.5 - W); rail(0, 0.5 + W, 1, 0.5 + W); }
        g.restore();
      };
      rails('rgba(6,26,44,.35)', 1.6, 2.5, 2.5);
      rails('#d9dde2', 1.5, 0, 0);
    }
  });
}

/**
 * Gleis (S-Bahn): Schotterband, Schwellen und zwei Schienen entlang der Verbindungen (Maske wie bei Straßen;
 * ohne Verbindung ein waagrechtes Stück). bridge: Gleisbrücke über Wasser mit Stahldeck und Geländer.
 * cross: Bahnübergang – weiß-rote Schranken quer über die Straße (die Straßenkachel liegt darunter).
 * Transparent außerhalb des Bandes, daher wird der Sprite über den Boden bzw. die Straße gelegt.
 */
export function railSprite(mask, bridge, cross) {
  return groundSprite(`rl${mask}_${bridge ? 1 : 0}_${cross ? 1 : 0}`, (g, o) => {
    const mm = mask || 10;                  // ohne Verbindung: waagrechtes Gleisstück
    const B = bridge ? 0.17 : 0.22;         // halbe Breite des Bandes
    const RW = 0.075;                       // halber Schienenabstand
    const ballast = bridge ? '#6f757c' : '#a89f8a';
    const sleeper = bridge ? '#4b5058' : '#6b5a44';
    const arms = [[mm & 1, 0.5, 0, 0.5, 0.5, true], [mm & 2, 0.5, 0.5, 1, 0.5, false], [mm & 4, 0.5, 0.5, 0.5, 1, true], [mm & 8, 0, 0.5, 0.5, 0.5, false]];
    const seg = (u0, v0, u1, v1, col, lw, z = 0) => {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      g.moveTo(X(o, u0, v0), Y(o, u0, v0, z)); g.lineTo(X(o, u1, v1), Y(o, u1, v1, z)); g.stroke();
    };
    flat(g, o, 0.5 - B, 0.5 - B, 0.5 + B, 0.5 + B, ballast);
    for (const [on, u0, v0, u1, v1, vert] of arms) {
      if (!on) continue;
      if (vert) flat(g, o, 0.5 - B, v0, 0.5 + B, v1, ballast);
      else flat(g, o, u0, 0.5 - B, u1, 0.5 + B, ballast);
    }
    for (const [on, u0, v0, u1, v1, vert] of arms) {
      if (!on) continue;
      for (const f of [0.2, 0.5, 0.85]) { // Schwellen
        if (vert) { const v = v0 + (v1 - v0) * f; seg(0.5 - B - 0.02, v, 0.5 + B + 0.02, v, sleeper, 1.6); }
        else { const u = u0 + (u1 - u0) * f; seg(u, 0.5 - B - 0.02, u, 0.5 + B + 0.02, sleeper, 1.6); }
      }
      // Schienen bis zur Mitte, damit die Ecken schließen
      if (vert) {
        const a = v0 === 0.5 ? 0.5 - RW : v0, b = v1 === 0.5 ? 0.5 + RW : v1;
        seg(0.5 - RW, a, 0.5 - RW, b, '#dfe4e8', 1.3); seg(0.5 + RW, a, 0.5 + RW, b, '#dfe4e8', 1.3);
      } else {
        const a = u0 === 0.5 ? 0.5 - RW : u0, b = u1 === 0.5 ? 0.5 + RW : u1;
        seg(a, 0.5 - RW, b, 0.5 - RW, '#dfe4e8', 1.3); seg(a, 0.5 + RW, b, 0.5 + RW, '#dfe4e8', 1.3);
      }
      if (bridge) { // Geländer
        if (vert) { seg(0.5 - B, v0, 0.5 - B, v1, '#d9dde2', 1.2, 3); seg(0.5 + B, v0, 0.5 + B, v1, '#d9dde2', 1.2, 3); }
        else { seg(u0, 0.5 - B, u1, 0.5 - B, '#d9dde2', 1.2, 3); seg(u0, 0.5 + B, u1, 0.5 + B, '#d9dde2', 1.2, 3); }
      }
    }
    if (cross) { // Schranken beidseits des Gleises, über die Straße
      const t = B + 0.05;
      for (const a of arms) {
        if (!a[0]) continue;
        for (const sg of [-1, 1]) {
          const p = a[5] ? [0.5 + sg * t, 0.5 - 0.3, 0.5 + sg * t, 0.5 + 0.3] : [0.5 - 0.3, 0.5 + sg * t, 0.5 + 0.3, 0.5 + sg * t];
          seg(p[0], p[1], p[2], p[3], '#f4f4f4', 2.4);
          g.setLineDash([3, 3]); seg(p[0], p[1], p[2], p[3], '#d23a2e', 2.4); g.setLineDash([]);
        }
      }
    }
  });
}

// ---------------------------------------------------------------- Zonengebäude
const WALL_R = ['#f1e2c0', '#f0d38a', '#e8b9a0', '#d9e0cc', '#efe9dc'];
const ROOF_R = ['#b8452f', '#a1432c', '#7c3b2e', '#8c5a3c'];
const GLASS = ['#5b8fb8', '#4f9aa8', '#7a8fb0', '#6d9a9a'];

export function zoneBuilding(z, lvl, vr, light = false) {
  const v = vr & 31;
  return sprite(`${light ? 'L' : ''}zb${z}_${lvl}_${v}`, 1, 1, z === Z_B ? 240 : 120, (g, o) => {
    const wall = WALL_R[v % WALL_R.length], roof = ROOF_R[(v >> 2) % ROOF_R.length];
    if (z === Z_R) {
      if (lvl === 1) {
        prism(g, o, 0.2, 0.22, 0.8, 0.78, 0, 13, wall, { win: { c: 3, rows: 1, lit: 0.3, seed: v } });
        gable(g, o, 0.16, 0.18, 0.84, 0.82, 13, 11, roof, v & 1 ? 'u' : 'v');
        // Gärtchen
        g.fillStyle = '#4f9a45'; g.beginPath(); g.ellipse(X(o, 0.12, 0.9), Y(o, 0.12, 0.9), 4, 2.5, 0, 0, 7); g.fill();
      } else if (lvl === 2) {
        prism(g, o, 0.1, 0.12, 0.9, 0.88, 0, 33, wall, { win: { c: 5, rows: 3, lit: 0.35, seed: v } });
        if (v & 1) balconies(g, o, 'L', 0.1, 0.12, 0.9, 0.88, 0, 33, 3, 1);
        if (v & 2) balconies(g, o, 'R', 0.1, 0.12, 0.9, 0.88, 0, 33, 3, 1);
        gable(g, o, 0.08, 0.1, 0.92, 0.9, 33, 9, roof, v & 1 ? 'u' : 'v');
      } else {
        const col = mix(['#d8d4cb', '#c9c2b4', '#bfc8cf', '#cfc0b2'][v & 3], '#ffffff', 0.05);
        prism(g, o, 0.12, 0.12, 0.88, 0.88, 0, 62, col, { win: { c: 5, rows: 7, lit: 0.4, seed: v } });
        if (v & 1) balconies(g, o, 'L', 0.12, 0.12, 0.88, 0.88, 0, 62, 7, 2);
        if (v & 4) balconies(g, o, 'R', 0.12, 0.12, 0.88, 0.88, 0, 62, 7, 2);
        if (v & 2) roofGarden(g, o, 0.12, 0.12, 0.88, 0.88, 62); else acUnits(g, o, 0.12, 0.12, 0.88, 0.88, 62, 2);
        prism(g, o, 0.3, 0.3, 0.7, 0.7, 62, 8, '#aab0b4');   // Aufbau auf dem Dach
      }
    } else if (z === Z_C) {
      if (lvl === 1) {
        prism(g, o, 0.12, 0.14, 0.88, 0.86, 0, 15, ['#f0d9a5', '#e2ecef', '#ecc2b3'][v % 3], { win: { c: 3, rows: 1, lit: 0.5, litc: '#bfe6ff', seed: v } });
        // Markise
        poly(g, [[X(o, 0.12, 0.9), Y(o, 0.12, 0.9, 11)], [X(o, 0.88, 0.9), Y(o, 0.88, 0.9, 11)], [X(o, 0.88, 0.98), Y(o, 0.88, 0.98, 8)], [X(o, 0.12, 0.98), Y(o, 0.12, 0.98, 8)]], ['#d5392e', '#2f7bd0', '#3aa35a'][v % 3]);
      } else if (lvl === 2) {
        prism(g, o, 0.1, 0.1, 0.9, 0.9, 0, 40, GLASS[v & 3], { win: { c: 5, rows: 5, lit: 0.45, dark: 'rgba(210,235,255,.5)', seed: v } });
        sheen(g, o, 'L', 0.1, 0.1, 0.9, 0.9, 0, 40); sheen(g, o, 'R', 0.1, 0.1, 0.9, 0.9, 0, 40);
        prism(g, o, 0.3, 0.3, 0.7, 0.7, 40, 5, '#8e9aa5');
      } else {
        prism(g, o, 0.12, 0.12, 0.88, 0.88, 0, 56, GLASS[v & 3], { win: { c: 5, rows: 8, lit: 0.45, dark: 'rgba(210,235,255,.5)', seed: v } });
        sheen(g, o, 'L', 0.12, 0.12, 0.88, 0.88, 0, 56); sheen(g, o, 'R', 0.12, 0.12, 0.88, 0.88, 0, 56);
        if (v & 1) roofGarden(g, o, 0.12, 0.12, 0.88, 0.88, 56); else acUnits(g, o, 0.12, 0.12, 0.88, 0.88, 56, 2);
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
      sheen(g, o, 'L', 0.2, 0.2, 0.8, 0.8, 0, H); sheen(g, o, 'R', 0.2, 0.2, 0.8, 0.8, 0, H);
      if (lvl >= 2) prism(g, o, 0.14, 0.14, 0.86, 0.86, 0, 8, shade(gl, 0.9));
      if (lvl >= 3 && top !== 0) acUnits(g, o, 0.2, 0.2, 0.8, 0.8, H, 2);   // Klimageräte auf dem Flachdach
      if (top === 0) { pyramid(g, o, 0.2, 0.2, 0.8, 0.8, H, 22 + lvl * 4, '#c9d3da'); }
      else if (top === 1) { prism(g, o, 0.34, 0.34, 0.66, 0.66, H, 8, '#cfd5da'); g.fillStyle = '#e8eef0'; g.fillRect(X(o, 0.5, 0.5) - 1, Y(o, 0.5, 0.5, H + 8 + 26) , 2, 26); }
      else if (top === 2) { prism(g, o, 0.2, 0.2, 0.46, 0.8, H, 12 + lvl * 3, shade(gl, 1.05), { win: { c: 2, rows: 2, lit: 0.3, seed: v } }); }
      else { prism(g, o, 0.3, 0.3, 0.7, 0.7, H, 6, '#d6dcdf'); g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(X(o, 0.5, 0.5), Y(o, 0.5, 0.5, H + 7), 1.6, 0, 7); g.fill(); }
    }
  }, light, z === Z_B);
}

// ---------------------------------------------------------------- Dienste und Wahrzeichen
function pad(g, o, w, h, col = '#a9b09a') { flat(g, o, 0, 0, w, h, col); flat(g, o, 0.04, 0.04, w - 0.04, h - 0.04, shade(col, 1.06)); }

export function buildingSprite(key, light = false) {
  const d = BUILD[key];
  const hmax = { fraport: 90, ctower: 260, maintower: 230, mtower: 230, dom: 190, uni: 100, gas: 110, wind: 120, hbf: 90, dike: 20, pump: 60, tower: 100, treat: 36, incin: 110, dump: 40, recyc: 40, sbahn: 50 }[key] || 100;
  return sprite((light ? 'L' : '') + 'b_' + key, d.w, d.h, hmax, (g, o) => {
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
      case 'sbahn': {
        // S-Bahnhof: Bahnsteig mit gelber Kante, Glasdach auf Stützen, blaues S-Schild
        pad(g, o, w, h, '#b5b9bc');
        flat(g, o, 0.1, 0.18, 1.9, 0.86, '#d7dadd');
        flat(g, o, 0.1, 0.78, 1.9, 0.86, '#e0b030');
        for (const [u, v] of [[0.14, 0.24], [1.84, 0.24], [0.14, 0.8], [1.84, 0.8]]) prism(g, o, u, v, u + 0.08, v + 0.08, 0, 22, '#5c6368');
        prism(g, o, 0.06, 0.14, 1.94, 0.9, 22, 4, '#3f6e8f', { top: '#9cc4dc' });
        g.fillStyle = '#0b5cad'; g.beginPath(); g.arc(X(o, 1, 0.5), Y(o, 1, 0.5, 36), 7, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('S', X(o, 1, 0.5), Y(o, 1, 0.5, 36)); break;
      }
      case 'dike': {
        // Ufergras, darauf ein niedriger grüner Erdwall; die Steinkante liegt auf der Flussseite (+v)
        flat(g, o, 0, 0, 1, 1, '#6aa04c');
        prism(g, o, 0.03, 0.2, 0.97, 0.7, 0, 6, '#6f8f4e', { top: '#8fb066', l: 0.9, r: 0.68, sh: false });
        prism(g, o, 0.03, 0.64, 0.97, 0.74, 0, 4, '#a59f92', { top: '#cbc5b7', l: 0.95, r: 0.75, sh: false });
        break;
      }
      case 'pump': {
        // Pumpenhaus am Ufer, davor ein blaues Becken
        pad(g, o, w, h, '#8fa08a');
        ellipseFlat(g, o, 1.42, 1.38, 0.56, 0.46, 0, '#1f4f86');
        ellipseFlat(g, o, 1.42, 1.38, 0.46, 0.37, 1, '#4a9ad8');
        ellipseFlat(g, o, 1.34, 1.3, 0.14, 0.11, 2, '#bfe4ff');
        prism(g, o, 0.14, 0.18, 0.86, 0.78, 0, 24, '#dfe6ea', { win: { c: 3, rows: 1, lit: 0.3, seed: 2 } });
        gable(g, o, 0.11, 0.15, 0.89, 0.81, 24, 10, '#2f5f8a', 'u');
        break;
      }
      case 'tower': {
        // Wasserturm: Säule mit Kessel oben
        pad(g, o, w, h, '#a8ad9f');
        prism(g, o, 0.42, 0.42, 0.58, 0.58, 0, 60, '#c5ccd2', { top: '#dfe5ea', win: { c: 1, rows: 3, lit: 0.1, seed: 3 } });
        const cx = X(o, 0.5, 0.5), cy = Y(o, 0.5, 0.5, 76);
        g.fillStyle = '#7fb6df'; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill();
        g.fillStyle = '#c9e6fa'; g.beginPath(); g.arc(cx - 3, cy - 3, 3, 0, 7); g.fill();
        break;
      }
      case 'treat': {
        // Klärbecken: runder Beton-Rand, grün-blaues Wasser
        pad(g, o, w, h, '#9aa98a');
        ellipseFlat(g, o, 1.0, 1.0, 0.72, 0.72, 0, '#8f989c');
        for (let z = 0; z < 8; z += 2) ellipseFlat(g, o, 1.0, 1.0, 0.72, 0.72, z, z % 4 ? '#c9d0d3' : '#b5bcc0');
        ellipseFlat(g, o, 1.0, 1.0, 0.6, 0.6, 8, '#4fb3a0');
        ellipseFlat(g, o, 1.0, 1.0, 0.34, 0.34, 8, '#2f8f9a');
        prism(g, o, 1.5, 0.12, 1.86, 0.48, 0, 12, '#d7dde0', { top: '#e6ebee' });
        break;
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
        sheen(g, o, 'L', 1.7, 0.4, 2.8, 2.6, 0, 40); sheen(g, o, 'R', 1.7, 0.4, 2.8, 2.6, 0, 40);
        icon(g, o, 1, 1.4, 40, '🏢', 16); break;
      }
      case 'mtower': {
        flat(g, o, 0, 0, 1, 1, '#a9a99a');
        prism(g, o, 0.24, 0.24, 0.76, 0.76, 0, 170, '#c9a98c', { win: { c: 4, rows: 22, lit: 0.18, dark: 'rgba(70,60,60,.5)', seed: 9 } });
        sheen(g, o, 'L', 0.24, 0.24, 0.76, 0.76, 0, 170); sheen(g, o, 'R', 0.24, 0.24, 0.76, 0.76, 0, 170);
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
        sheen(g, o, 'L', 0.2, 0.2, 0.8, 0.8, 0, 200); sheen(g, o, 'R', 0.2, 0.2, 0.8, 0.8, 0, 200);
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
      case 'dump': {
        // Deponie: abgedeckter Erdhügel mit grüner Kuppe
        pad(g, o, w, h, '#8a7d5a');
        ellipseFlat(g, o, 1.5, 1.5, 1.35, 1.35, 0, '#6b5b3e');
        ellipseFlat(g, o, 1.5, 1.5, 1.0, 1.0, 4, '#7d6e4f');
        ellipseFlat(g, o, 1.5, 1.5, 0.6, 0.6, 9, '#9c8f70');
        ellipseFlat(g, o, 1.5, 1.5, 0.3, 0.3, 13, '#4f9a45');
        icon(g, o, 1.5, 1.5, 22, '🗑', 13); break;
      }
      case 'incin': {
        // Müllverbrennung: Halle mit Schornstein und Rauchfahne
        pad(g, o, w, h, '#8f9489');
        prism(g, o, 0.15, 0.2, 1.2, 1.85, 0, 22, '#8e8a84', { win: { c: 3, rows: 1, lit: 0.2, seed: 4 } });
        for (let z = 0; z < 60; z += 4) ellipseFlat(g, o, 1.6, 1.0, 0.2, 0.2, z, z % 8 ? '#77716b' : '#6e6a66');
        ellipseFlat(g, o, 1.6, 1.0, 0.2, 0.2, 60, '#5b5552');
        g.fillStyle = 'rgba(205,205,205,.6)';
        g.beginPath(); g.arc(X(o, 1.6, 1.0), Y(o, 1.6, 1.0, 70), 5, 0, 7); g.fill();
        g.beginPath(); g.arc(X(o, 1.6, 1.0) + 4, Y(o, 1.6, 1.0, 82), 3.5, 0, 7); g.fill();
        icon(g, o, 0.67, 1.0, 24, '🔥', 12); break;
      }
      case 'recyc': {
        // Recyclinghof: vier farbige Container
        pad(g, o, w, h, '#9fb08a');
        const cols = ['#3a7bd5', '#e0b030', '#3d8f5a', '#8a8a8a'];
        for (let k = 0; k < 4; k++) { const u = 0.15 + (k % 2) * 0.95, v = 0.2 + Math.floor(k / 2) * 0.95; prism(g, o, u, v, u + 0.7, v + 0.6, 0, 12, cols[k]); }
        icon(g, o, 1.0, 1.0, 16, '♻', 13); break;
      }
      default: pad(g, o, w, h); prism(g, o, 0.15, 0.15, w - 0.15, h - 0.15, 0, 24, d.color); icon(g, o, w / 2, h / 2, 26, d.icon);
    }
  }, light, false);
}

export function treeSprite(variant) {
  return sprite('tree' + (variant & 7), 1, 1, 30, (g, o) => {
    flat(g, o, 0, 0, 1, 1, GRASS[variant & 3]);
    tileShade(g, o, 0.05, 0.05);
    grassSpeckle(g, o, variant + 3, 8, true);
    const pos = [[0.3, 0.3], [0.7, 0.35], [0.5, 0.65], [0.25, 0.75], [0.75, 0.8]];
    const n = 3 + (variant & 1) + ((variant >> 1) & 1);
    // Formen mischen sich je Variante: Laubbaum (rund), Tanne, Busch; Farbvarianz je Baum
    pos.slice(0, n).sort((a, b) => a[0] + a[1] - (b[0] + b[1])).forEach(([u, v], k) => {
      const x = X(o, u, v), y = Y(o, u, v), s = 0.95 + rnd(variant * 3 + k) * 0.3, c = ['#2f7a3c', '#3a8a40', '#2a6e38', '#4a9444'][(variant + k) & 3];
      const kind = (variant + k * 2) % 3;
      if (kind === 0) tree(g, x, y, s, c); else if (kind === 1) conifer(g, x, y, s, shade(c, 0.9)); else bush(g, x, y, s * 0.9, shade(c, 1.05));
    });
  });
}

// ---------------------------------------------------------------- Heatmap-Farben
function heat(v) { // 0..1 → grün → gelb → rot
  const t = Math.max(0, Math.min(1, v));
  const r = t < 0.5 ? 80 + t * 2 * 175 : 255, g = t < 0.5 ? 220 : 220 - (t - 0.5) * 2 * 190;
  return `rgba(${r | 0},${g | 0},60,.55)`;
}
const cool = (v) => { const t = Math.max(0, Math.min(1, v)); return `rgba(${(60 + (1 - t) * 160) | 0},${(90 + t * 130) | 0},${(220 - t * 40) | 0},.5)`; };

// ---------------------------------------------------------------- Tag & Nacht
/** Maximale Abdunklung (0 = Tag). */
export const MAX_DARK = 0.62;
/** Tageszeit t ∈ [0,1) (0 = Mitternacht, 0,5 = Mittag) → Abdunklung 0 … MAX_DARK, weicher Übergang. */
export function darkness(t) {
  const raw = (1 + Math.cos(2 * Math.PI * t)) / 2;       // 1 um Mitternacht, 0 am Mittag
  const x = Math.max(0, Math.min(1, (raw - 0.35) / 0.5));
  return MAX_DARK * x * x * (3 - 2 * x);
}
const TINT_STEPS = 48;
const TINT = [];   // vorberechnete Tönungen je Nachtanteil (keine Allokation pro Frame)
for (let k = 0; k <= TINT_STEPS; k++) {
  const n = k / TINT_STEPS;                               // Anteil Nacht
  const dusk = (1 - Math.abs(2 * n - 1)) * 0.7;           // Übergang (Dämmerung): orange/rosa, Nacht: dunkelblau
  const r = 18 + (255 - 18) * dusk, gg = 26 + (140 - 26) * dusk, b = 70 + (150 - 70) * dusk;
  TINT[k] = `rgba(${r | 0},${gg | 0},${b | 0},${(MAX_DARK * n).toFixed(3)})`;
}
const GLOW_RGB = { lamp: [255, 196, 110], head: [255, 248, 215], beacon: [255, 70, 60], base: [255, 200, 120] };
const glows = {};
/** Weicher Lichtfleck (radialer Verlauf), einmal gezeichnet und gecacht. */
function glow(name) {
  let c = glows[name]; if (c) return c;
  const [r, gg, b] = GLOW_RGB[name];
  c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, `rgba(${r},${gg},${b},0.9)`); gr.addColorStop(0.4, `rgba(${r},${gg},${b},0.35)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  glows[name] = c; return c;
}
// Lichtebene: lg = Lichtpuffer mit derselben Transformation wie die Szene. Gebäude-Silhouetten sind dort
// schwarz und verdecken Licht dahinter; die Ebene wird danach additiv („lighter“) über die getönte Szene gelegt.
const BEACON_Z = { mtower: 206, maintower: 182, ctower: 256 };   // Höhe der Dachspitze (Pixel über Boden)
const lightSprite = (lg, sp, tx, ty) => lg.drawImage(sp.c, (tx - ty) * 32 - sp.ox, (tx + ty) * 16 - sp.oy, sp.w, sp.h);
function lampAt(lg, x, y) {
  lg.globalCompositeOperation = 'lighter';
  lg.drawImage(glow('lamp'), (x - y) * 32 - 22, (x + y) * 16 + 2, 44, 28);
}
function beacon(lg, cx, cy, z) { // blinkendes rotes Positionslicht, cx/cy = Mitte der Grundfläche
  lg.globalCompositeOperation = 'lighter';
  lg.drawImage(glow('beacon'), cx - 8, cy - z - 8, 16, 16);
  lg.fillStyle = '#ff4a3d'; lg.fillRect(cx - 1, cy - z - 1, 2, 2);
}
function nightZone(lg, z, l, vr, x, y, blink) {
  lg.globalCompositeOperation = 'source-over';
  lightSprite(lg, zoneBuilding(z, l, vr, true), x, y);
  if (blink && z === Z_B && l >= 3) beacon(lg, (x - y) * 32, (x + y) * 16 + 16, l >= 4 ? 226 : 176);
}
function nightBuilding(lg, b, blink) {
  lg.globalCompositeOperation = 'source-over';
  lightSprite(lg, buildingSprite(b.type, true), b.x, b.y);
  if (BUILD[b.type].cat !== 'land') return;
  // Wahrzeichen: Glow am Sockel (Mitte der Grundfläche)
  const cx = (b.x - b.y) * 32 + (b.w - b.h) * 16, cy = (b.x + b.y) * 16 + (b.w + b.h) * 8;
  const W = (b.w + b.h) * 26, H = (b.w + b.h) * 15;
  lg.globalCompositeOperation = 'lighter';
  lg.drawImage(glow('base'), cx - W / 2, cy - H / 2, W, H);
  if (blink && BEACON_Z[b.type]) beacon(lg, cx, cy, BEACON_Z[b.type]);
}

// ---------------------------------------------------------------- Nachbarstädte (H1): Schilder am Kartenrand
const SIGN_FONT = 'bold 13px system-ui,"Noto Sans",sans-serif';
const SIGN_ARROW = ['↙', '↖', '↗', '↘']; // Kante N/O/S/W: Pfeil zeigt isometrisch in die Karte
const signs = new Map();
/** Schild mit Namen (Sprite je Name, Kante und Verbindung gecacht). */
function signSprite(name, edge, linked) {
  const key = name + '|' + edge + '|' + (linked ? 1 : 0);
  let sp = signs.get(key); if (sp) return sp;
  const label = SIGN_ARROW[edge] + ' ' + name, ss = 2, h = 20;
  let c = document.createElement('canvas'); let g = c.getContext('2d'); g.font = SIGN_FONT;
  const w = Math.ceil(g.measureText(label).width) + 14;
  c.width = w * ss; c.height = h * ss;
  g = c.getContext('2d'); g.scale(ss, ss); g.font = SIGN_FONT;
  g.fillStyle = linked ? 'rgba(26,94,50,.9)' : 'rgba(20,28,40,.78)'; g.fillRect(0, 0, w, h);
  g.strokeStyle = linked ? '#7af09a' : 'rgba(200,212,224,.55)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1);
  g.fillStyle = linked ? '#e8fff0' : '#e6ecf2'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, w / 2, h / 2 + 0.5);
  sp = { c, w, h }; signs.set(key, sp); return sp;
}

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
    c.x = Math.max(-lim * 0.95, Math.min(lim * 0.95, c.x)); c.y = Math.max(-40, Math.min(N * 32 + 40, c.y));
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
    // Tag & Nacht: bei Tag (d ≤ 0,05) kein Lichtpuffer, keine Mehrkosten
    const dk = darkness(ui.daytime ?? 0.5), night = dk > 0.05;
    let lg = null, blink = false;
    if (night) {
      if (!this.lcv) this.lcv = document.createElement('canvas');
      if (this.lcv.width !== this.cv.width || this.lcv.height !== this.cv.height) { this.lcv.width = this.cv.width; this.lcv.height = this.cv.height; }
      lg = this.lcv.getContext('2d');
      lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, this.lcv.width, this.lcv.height);
      lg.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (this.w / 2 - cam.x * cam.z), dpr * (this.h / 2 - cam.y * cam.z));
      blink = (ui.time % 1200) < 300;
    }
    const T = s.terrain, idx = (x, y) => y * N + x;
    const wat = (x, y) => x >= 0 && y >= 0 && x < N && y < N && T[idx(x, y)] === T_WATER;
    const roadAt = (x, y) => x >= 0 && y >= 0 && x < N && y < N && s.road[idx(x, y)] === 1;
    const railAt = (x, y) => x >= 0 && y >= 0 && x < N && y < N && s.rail[idx(x, y)] === 1;

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
      if (s.rail[i]) { // Gleis (auf Straße = Bahnübergang, auf Wasser = Gleisbrücke) über den Boden gelegt
        const rm = (railAt(x, y - 1) ? 1 : 0) | (railAt(x + 1, y) ? 2 : 0) | (railAt(x, y + 1) ? 4 : 0) | (railAt(x - 1, y) ? 8 : 0);
        draw(railSprite(rm, T[i] === T_WATER, !!s.road[i]), x, y);
      }
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
      if (lg) { lg.globalCompositeOperation = 'lighter'; lg.drawImage(glow('head'), sx + (dx - dy) * 4 - 5, sy + (dx + dy) * 2 - 4, 10, 8); }
    }
    g.restore();
    // --- Leben (L1): S-Bahnen, Boote, Löschzüge, Fußgänger auf dem Boden (vor den Objekten, wie Autos)
    if (this.life) this.life.drawGround(g, lg, this.life.view(x0, y0, x1, y1, cam.z));

    // --- Objekte (diagonal sortiert)
    for (let sum = x0 + y0; sum <= x1 + y1; sum++) {
      for (let x = Math.max(x0, sum - y1); x <= Math.min(x1, sum - y0); x++) {
        const y = sum - x, i = idx(x, y);
        const bid = s.occ[i];
        if (bid) {
          const b = s.bld.find((q) => q.id === bid);
          if (b && x === b.x + b.w - 1 && y === b.y + b.h - 1) { const sp = buildingSprite(b.type); g.drawImage(sp.c, (b.x - b.y) * 32 - sp.ox, (b.x + b.y) * 16 - sp.oy, sp.w, sp.h); if (lg) nightBuilding(lg, b, blink); }
        } else if (s.zone[i] && s.lvl[i]) {
          draw(zoneBuilding(s.zone[i], s.lvl[i], s.vr[i]), x, y);
          if (lg) nightZone(lg, s.zone[i], s.lvl[i], s.vr[i], x, y, blink);
        } else if (T[i] === T_TREES && !s.road[i] && !s.rail[i]) draw(treeSprite((x * 5 + y * 11) & 7), x, y);
        if (lg && !bid && s.road[i] && !((x + y) & 1)) lampAt(lg, x, y); // jede 2. Straßenkachel
      }
    }
    // --- Rauch und Flammen (L1) über den Objekten, vor der Flut
    if (this.life) this.life.drawAir(g, lg, this.life.view(x0, y0, x1, y1, cam.z), ui.time);
    // --- Flut
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (s.flood[idx(x, y)]) this.diamond(x, y, 'rgba(60,130,220,.45)');
    // --- Nacht: Tönung über die Szene, danach die Lichtebene additiv. Overlays kommen erst danach (ohne Abdunklung).
    if (lg) {
      const k = Math.round(Math.min(1, dk / MAX_DARK) * TINT_STEPS);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = TINT[k]; g.fillRect(0, 0, this.cv.width, this.cv.height);
      g.globalCompositeOperation = 'lighter'; g.drawImage(this.lcv, 0, 0);
      g.restore();
    }
    // --- Nachbarstädte (H1): nach der Tönung, damit Schilder auch nachts lesbar sind
    if (s.trade && s.trade.neighbors) this.drawNeighbors(s, g);
    // --- Overlay
    const m = s.maps;
    if (ui.overlay && ui.overlay !== 'none' && m) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = idx(x, y); if (T[i] === T_WATER && !s.road[i] && !s.rail[i]) continue;
        let col = null;
        switch (ui.overlay) {
          case 'power': col = s.powered[i] ? 'rgba(250,215,60,.45)' : (s.zone[i] || s.occ[i] ? 'rgba(200,40,40,.5)' : null); break;
          case 'water': col = s.watered[i] ? 'rgba(70,190,255,.45)' : (s.zone[i] || s.occ[i] ? 'rgba(200,40,40,.5)' : null); break;
          case 'rail': if (s.rail[i]) col = 'rgba(160,110,240,.75)'; else if (m.rail[i] > 0.01) col = m.rail[i] > 0.5 ? 'rgba(160,110,240,.45)' : 'rgba(160,110,240,.2)'; break;
          case 'traffic': if (s.road[i]) col = heat(m.traffic[i] / 1.6); break;
          case 'crime': col = heat(m.crime[i] / 70); break;
          case 'pollution': col = heat(m.pol[i] / 70); break;
          case 'garbage': if (m.garb[i] > 0.01) col = heat(m.garb[i] / 8); break;
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
  /** Je Nachbarstadt ein Schild außerhalb der Karte an ihrer Kante (am Anschluss, sonst Kantenmitte); verbunden = grün, Anschlusskacheln grün markiert. */
  drawNeighbors(s, g) {
    const links = s.trade.links || [];
    for (const nb of s.trade.neighbors) {
      const ln = links.find((l) => l.edge === nb.edge) || null;
      const i = ln ? (ln.tile >= 0 ? ln.tile : ln.rtile) : -1;
      const along = i >= 0 ? ((nb.edge === 0 || nb.edge === 2) ? i % N : Math.floor(i / N)) : N / 2;
      if (ln) {
        if (ln.tile >= 0) this.diamond(ln.tile % N, Math.floor(ln.tile / N), 'rgba(90,230,120,.42)');
        if (ln.rtile >= 0) this.diamond(ln.rtile % N, Math.floor(ln.rtile / N), 'rgba(90,230,120,.42)');
      }
      const t = along + 0.5;
      const ax = nb.edge === 0 ? t : nb.edge === 1 ? N + 1.6 : nb.edge === 2 ? t : -1.6;
      const ay = nb.edge === 0 ? -1.6 : nb.edge === 1 ? t : nb.edge === 2 ? N + 1.6 : t;
      const sx = (ax - ay) * 32, sy = (ax + ay) * 16;
      const sp = signSprite(nb.name, nb.edge, !!ln);
      g.drawImage(sp.c, sx - sp.w / 2, sy - sp.h / 2, sp.w, sp.h);
    }
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
