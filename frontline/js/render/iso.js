// Isometrische Darstellung: Transformationen und Grundkörper mit Höhe (Quader, Bäume, Felsen). Gebäude mit Details: isobuild.js.
// Die Spiellogik bleibt 2D; hier wird nur gezeichnet. Alle Funktionen zeichnen in CSS-Pixeln (Transform = dpr).
import { BALANCE } from '../data/balance.js';
import { shade, tint, hexA, fitText } from './sprites.js';

const TILE = BALANCE.map.tile;
const OUTLINE = 'rgba(0,0,0,0.55)';

/** Höhe (Bildschirm-Pixel bei Zoom 1) der Stadtgebäude und der Spielgebäude je Typ. */
export const TOWN_H = { house: 46, hall: 60, tower: 118, factory: 92, station: 54, platform: 8 };
export const BUILD_H = {
  fob: 58,
  radio: 14, // Sockel des Sendemasts (der Mast selbst ist höher, isobuild.drawRadioMast)
  depot: 50,
  helipad: 5,
  extractor: 36,
  drill: 54,
  mortar: 30,
  aa: 38,
  wall: 30,
  gate: 24,
};
/** Flughöhe der Hubschrauber und Hebung normaler Einheiten über dem Boden (Bildschirm-Pixel bei Zoom 1). */
export const AIR_LIFT = 46;
export const GROUND_LIFT = 4;
export const unitLift = (u) => (u.def.air ? AIR_LIFT : GROUND_LIFT);
export const buildingHeight = (b) => BUILD_H[b.type] ?? 40;

/** Transform: Weltpunkt (wx, wy) landet im Bildschirmpunkt (sx, sy), Boden isometrisch, `scale` um diesen Punkt. */
export function setIsoAt(ctx, cam, dpr, sx, sy, wx, wy, scale = 1) {
  const [a, b, c, d] = cam.isoMatrix(cam.zoom * scale);
  ctx.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * (sx - (a * wx + c * wy)), dpr * (sy - (b * wx + d * wy)));
}

/** Transform: aufrecht (nicht verzerrt), Weltpunkt (wx, wy) landet in (sx, sy); Maße in Welteinheiten × zoom. */
export function setUprightAt(ctx, cam, dpr, sx, sy, wx, wy) {
  const z = cam.zoom;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (sx - z * wx), dpr * (sy - z * wy));
}

/** Bodenebene der ganzen Welt isometrisch (Gelände, Zone, Nebel …); mit Gelände auf der festen Höhe von cam.pin() (sonst 0). */
export function setIsoGround(ctx, cam, dpr) {
  const o = cam.worldToScreenFlat(0, 0);
  if (cam.relief && cam.pinned !== null) o.y -= cam.pinned * cam.zoom;
  const [a, b, c, d] = cam.isoMatrix();
  ctx.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * o.x, dpr * o.y);
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/**
 * Quader mit Grundfläche [x0,x1]×[y0,y1] (Welt) und Höhe h (Bildschirm-Pixel, mit Zoom skaliert).
 * Sichtbar sind Dach und die zwei dem Betrachter zugewandten Wände (je nach Drehung). opts.base hebt den Quader an (Stockwerk darüber).
 * Liefert die Dachecken (Bildschirm) für Beschriftungen; `.walls` beschreibt die sichtbaren Wände für Details (siehe wallPoint).
 */
export function drawBox(ctx, cam, x0, y0, x1, y1, h, color, opts = {}) {
  const z = cam.zoom;
  const H = h * z;
  const BASE = (opts.base ?? 0) * z;
  const wp = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => {
    const p = cam.worldToScreen(x, y);
    return { x: p.x, y: p.y - BASE };
  });
  const up = (p) => ({ x: p.x, y: p.y - H });
  const roof = opts.roof ?? tint(color, 0.18);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE;
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  // Boden-Schatten (versetzt nach links unten, weg vom Licht)
  if (!opts.noShadow && H > 2 && !BASE) {
    const s = H * 0.35;
    poly(ctx, wp.map((p) => ({ x: p.x - s, y: p.y + s * 0.5 })));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
  }
  // Die zwei Wände an der vordersten Ecke (größtes y am Bildschirm)
  let f = 0;
  for (let i = 1; i < 4; i++) if (wp[i].y > wp[f].y) f = i;
  const walls = [];
  for (const i of [(f + 3) % 4, f]) {
    // Kante i verbindet Ecke i und i+1
    const P = wp[i];
    const Q = wp[(i + 1) % 4];
    poly(ctx, [P, Q, up(Q), up(P)]);
    const left = (P.x + Q.x) / 2 < wp[f].x;
    ctx.fillStyle = left ? (opts.wallS ?? shade(color, 0.62)) : (opts.wallE ?? shade(color, 0.45));
    ctx.fill();
    ctx.stroke();
    walls.push({ edge: i, left, z, base: BASE, cam, x0, y0, x1, y1, len: i % 2 ? y1 - y0 : x1 - x0 });
  }
  // Dach
  const top = wp.map(up);
  if (!opts.noTop) {
    poly(ctx, top);
    ctx.fillStyle = roof;
    ctx.fill();
    ctx.stroke();
  }
  top.walls = walls;
  ctx.restore();
  return top;
}

/**
 * Quader um (cx, cy) mit Länge `len` (entlang `ang`) und Breite `wid`, beliebig gedreht (Züge, Bahnsteige entlang schräger Gleise).
 * Zeichnet Schatten, die dem Betrachter zugewandten Wände und das Dach. opts.base hebt an, opts.roof/wallS/wallE färben.
 */
export function drawRotBox(ctx, cam, cx, cy, len, wid, ang, h, color, opts = {}) {
  const z = cam.zoom;
  const H = h * z;
  const BASE = (opts.base ?? 0) * z;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const L = len / 2;
  const Wd = wid / 2;
  const world = [[-L, -Wd], [L, -Wd], [L, Wd], [-L, Wd]].map(([lx, ly]) => ({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c }));
  const wp = world.map((q) => {
    const p = cam.worldToScreen(q.x, q.y);
    return { x: p.x, y: p.y - BASE };
  });
  const up = (p) => ({ x: p.x, y: p.y - H });
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE;
  if (!opts.noShadow && H > 2 && !BASE) {
    const sh = H * 0.35;
    poly(ctx, wp.map((p) => ({ x: p.x - sh, y: p.y + sh * 0.5 })));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    const A = world[i];
    const B = world[(i + 1) % 4];
    const mx = (A.x + B.x) / 2;
    const my = (A.y + B.y) / 2;
    let nx = B.y - A.y;
    let ny = -(B.x - A.x);
    const nl = Math.hypot(nx, ny) || 1;
    nx = (nx / nl) * 10;
    ny = (ny / nl) * 10;
    if (((mx - cx) * nx + (my - cy) * ny) < 0) { nx = -nx; ny = -ny; }
    if (cam.depth(mx + nx, my + ny) - cam.depth(mx, my) <= 0) continue; // Rückseite
    const P = wp[i];
    const Q = wp[(i + 1) % 4];
    poly(ctx, [P, Q, up(Q), up(P)]);
    const left = cam.worldToScreen(mx + nx, my + ny).x < cam.worldToScreen(mx, my).x;
    ctx.fillStyle = left ? (opts.wallS ?? shade(color, 0.62)) : (opts.wallE ?? shade(color, 0.45));
    ctx.fill();
    ctx.stroke();
  }
  const top = wp.map(up);
  poly(ctx, top);
  ctx.fillStyle = opts.roof ?? tint(color, 0.18);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  return top;
}

/**
 * Punkt auf einer Wand von drawBox: t = Lage entlang der Wand (0–1, in Richtung der Kante), hpx = Höhe über dem Wandfuß in
 * Bildschirm-Pixeln (bei Zoom 1), off = Abstand von der Wand nach außen in Welt-Pixeln (Balkone, Vordächer).
 * Kanten: 0 Nord (y0), 1 Ost (x1), 2 Süd (y1), 3 West (x0).
 */
export function wallPoint(w, t, hpx, off = 0) {
  const e = w.edge;
  let x;
  let y;
  let nx = 0;
  let ny = 0;
  if (e === 0) { x = w.x0 + (w.x1 - w.x0) * t; y = w.y0; ny = -1; }
  else if (e === 1) { x = w.x1; y = w.y0 + (w.y1 - w.y0) * t; nx = 1; }
  else if (e === 2) { x = w.x1 - (w.x1 - w.x0) * t; y = w.y1; ny = 1; }
  else { x = w.x0; y = w.y1 - (w.y1 - w.y0) * t; nx = -1; }
  const p = w.cam.worldToScreen(x + nx * off, y + ny * off);
  return { x: p.x, y: p.y - w.base - hpx * w.z };
}

/** Viereck auf einer Wand (t0–t1 entlang, h0–h1 Höhe in Pixeln, off nach außen). */
export function wallQuad(w, t0, t1, h0, h1, off = 0) {
  return [wallPoint(w, t0, h0, off), wallPoint(w, t1, h0, off), wallPoint(w, t1, h1, off), wallPoint(w, t0, h1, off)];
}

/** Baum: Schatten, Stamm und zwei Kronenkugeln (aufrecht). */
export function drawTree(ctx, cam, t) {
  const z = cam.zoom;
  const p = cam.worldToScreen(t.x, t.y);
  const r = t.r * z;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(p.x - r * 0.4, p.y + r * 0.1, r * 1.0, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a3624';
  ctx.fillRect(p.x - r * 0.18, p.y - r * 1.1, r * 0.36, r * 1.1);
  ctx.fillStyle = '#244a22';
  ctx.beginPath();
  ctx.arc(p.x, p.y - r * 1.5, r * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34693a';
  ctx.beginPath();
  ctx.arc(p.x - r * 0.25, p.y - r * 1.8, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
}

/** Fels: Schatten und flacher Brocken (aufrecht). */
export function drawRock(ctx, cam, o) {
  const z = cam.zoom;
  const p = cam.worldToScreen(o.x, o.y);
  const r = o.r * z;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(p.x - r * 0.25, p.y + r * 0.1, r * 0.95, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6c6f6a';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - r * 0.15, r * 0.8, r * 0.62, 0, Math.PI, 0);
  ctx.ellipse(p.x, p.y - r * 0.15, r * 0.8, r * 0.38, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#9a9e98';
  ctx.beginPath();
  ctx.ellipse(p.x - r * 0.2, p.y - r * 0.55, r * 0.4, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

export { fitText, hexA };
