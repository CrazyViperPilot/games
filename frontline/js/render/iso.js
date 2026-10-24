// Isometrische Darstellung (Prototyp): Transformationen und Körper mit Höhe (Häuser, Hallen, Fabriken, FOB, Bäume).
// Die Spiellogik bleibt 2D; hier wird nur gezeichnet. Alle Funktionen zeichnen in CSS-Pixeln (Transform = dpr).
import { BALANCE } from '../data/balance.js';
import { ISO_K } from './camera.js';
import { shade, tint, hexA, fitText, BUILD_ABBR } from './sprites.js';

const TILE = BALANCE.map.tile;
const OUTLINE = 'rgba(0,0,0,0.55)';

/** Höhe (Bildschirm-Pixel bei Zoom 1) der Stadtgebäude und der Spielgebäude je Typ. */
export const TOWN_H = { house: 46, hall: 60, factory: 92 };
export const BUILD_H = {
  fob: 64,
  depot: 58,
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
  const z = cam.zoom * scale;
  const a = z * ISO_K;
  const b = (z * ISO_K) / 2;
  ctx.setTransform(dpr * a, dpr * b, -dpr * a, dpr * b, dpr * (sx - (a * wx - a * wy)), dpr * (sy - (b * wx + b * wy)));
}

/** Transform: aufrecht (nicht verzerrt), Weltpunkt (wx, wy) landet in (sx, sy); Maße in Welteinheiten × zoom. */
export function setUprightAt(ctx, cam, dpr, sx, sy, wx, wy) {
  const z = cam.zoom;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (sx - z * wx), dpr * (sy - z * wy));
}

/** Bodenebene der ganzen Welt isometrisch (Gelände, Zone, Nebel …). */
export function setIsoGround(ctx, cam, dpr) {
  const c = cam.worldToScreen(0, 0);
  const z = cam.zoom;
  const a = z * ISO_K;
  const b = (z * ISO_K) / 2;
  ctx.setTransform(dpr * a, dpr * b, -dpr * a, dpr * b, dpr * c.x, dpr * c.y);
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/**
 * Quader mit Grundfläche [x0,x1]×[y0,y1] (Welt) und Höhe h (Bildschirm-Pixel, mit Zoom skaliert).
 * Sichtbar sind Dach und die zwei dem Betrachter zugewandten Wände (Ost x1 und Süd y1).
 * Liefert die Dachecken (Bildschirm) für Beschriftungen.
 */
export function drawBox(ctx, cam, x0, y0, x1, y1, h, color, opts = {}) {
  const z = cam.zoom;
  const H = h * z;
  const A = cam.worldToScreen(x0, y0);
  const B = cam.worldToScreen(x1, y0);
  const C = cam.worldToScreen(x1, y1);
  const D = cam.worldToScreen(x0, y1);
  const up = (p) => ({ x: p.x, y: p.y - H });
  const roof = opts.roof ?? tint(color, 0.18);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  ctx.strokeStyle = OUTLINE;
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  // Boden-Schatten (versetzt nach links unten, weg vom Licht)
  if (!opts.noShadow && H > 2) {
    const s = H * 0.35;
    poly(ctx, [A, B, C, D].map((p) => ({ x: p.x - s, y: p.y + s * 0.5 })));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
  }
  // Wände
  poly(ctx, [D, C, up(C), up(D)]); // Süd
  ctx.fillStyle = opts.wallS ?? shade(color, 0.62);
  ctx.fill();
  ctx.stroke();
  poly(ctx, [B, C, up(C), up(B)]); // Ost
  ctx.fillStyle = opts.wallE ?? shade(color, 0.45);
  ctx.fill();
  ctx.stroke();
  // Dach
  const top = [A, B, C, D].map(up);
  poly(ctx, top);
  ctx.fillStyle = roof;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  return top;
}

const WALL_COL = { house: '#c9b99a', hall: '#8d949a', factory: '#6b7073' };
const ROOF_COL = { house: ['#8c4a38', '#a15a3c', '#7d5a47'], hall: ['#9aa2a8'], factory: ['#585c5f'] };

/** Gebäude der Stadt (Haus, Halle, Fabrik) als Quader mit Dachfarbe; Fabrik mit Schornstein. */
export function drawTownBuilding(ctx, cam, b) {
  const hw = b.w / 2;
  const hh = b.h / 2;
  const roofs = ROOF_COL[b.kind];
  const roof = roofs[Math.abs(Math.round(b.x + b.y)) % roofs.length];
  const h = TOWN_H[b.kind];
  const top = drawBox(ctx, cam, b.x - hw, b.y - hh, b.x + hw, b.y + hh, h, WALL_COL[b.kind], {
    roof,
    wallS: shade(WALL_COL[b.kind], 0.78),
    wallE: shade(WALL_COL[b.kind], 0.58),
  });
  if (b.kind === 'house') {
    // Dachfirst
    const m1 = { x: (top[0].x + top[3].x) / 2, y: (top[0].y + top[3].y) / 2 };
    const m2 = { x: (top[1].x + top[2].x) / 2, y: (top[1].y + top[2].y) / 2 };
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(m1.x, m1.y);
    ctx.lineTo(m2.x, m2.y);
    ctx.stroke();
  } else if (b.kind === 'factory') {
    const c = cam.worldToScreen(b.x + hw * 0.7, b.y - hh * 0.6);
    const z = cam.zoom;
    const base = c.y - h * z;
    ctx.fillStyle = '#3b3d3f';
    ctx.fillRect(c.x - 5 * z, base - 52 * z, 10 * z, 52 * z);
    ctx.fillStyle = '#55585b';
    ctx.fillRect(c.x - 6 * z, base - 56 * z, 12 * z, 5 * z);
  }
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

/** Spielgebäude (Team): Quader in Teamfarbe mit Kürzel auf dem Dach plus einfache Aufbauten. */
export function drawTeamBuilding(ctx, cam, b, color) {
  const x0 = b.cx * TILE;
  const y0 = b.cy * TILE;
  const x1 = x0 + b.w * TILE;
  const y1 = y0 + b.h * TILE;
  const z = cam.zoom;
  const h = buildingHeight(b);
  const isWall = b.type === 'wall' || b.type === 'gate';
  if (!b.built) {
    // Baustelle: Gerüst-Quader wächst mit dem Fortschritt
    const g = Math.max(4, h * (b.progress || 0));
    drawBox(ctx, cam, x0, y0, x1, y1, g, color, { alpha: 0.55, noShadow: true });
    return;
  }
  const body = isWall ? (b.type === 'gate' ? '#7d827b' : '#8c9089') : color;
  const top = drawBox(ctx, cam, x0, y0, x1, y1, h, body, { roof: isWall ? '#b3b7b0' : tint(color, 0.25) });
  const cx = (top[0].x + top[2].x) / 2;
  const cy = (top[0].y + top[2].y) / 2;
  if (!isWall) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = Math.max(8, Math.min(13 * z, (b.w * TILE * z) * 0.45));
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.fillText(BUILD_ABBR[b.type] || b.def.name, cx, cy);
    ctx.restore();
  }
  ctx.save();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  if (b.type === 'fob') {
    // Mast mit Teamflagge
    ctx.strokeStyle = '#2b2f2b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(top[1].x - 6 * z, top[1].y + 4 * z);
    ctx.lineTo(top[1].x - 6 * z, top[1].y - 26 * z);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(top[1].x - 6 * z, top[1].y - 26 * z, 14 * z, 8 * z);
  } else if (b.type === 'drill') {
    // Bohrturm: Gittermast
    ctx.strokeStyle = '#d9d2b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10 * z, cy + 4 * z);
    ctx.lineTo(cx, cy - 52 * z);
    ctx.lineTo(cx + 10 * z, cy + 4 * z);
    ctx.moveTo(cx - 6 * z, cy - 16 * z);
    ctx.lineTo(cx + 6 * z, cy - 16 * z);
    ctx.moveTo(cx - 8 * z, cy - 5 * z);
    ctx.lineTo(cx + 8 * z, cy - 5 * z);
    ctx.stroke();
  } else if (b.type === 'mortar') {
    ctx.strokeStyle = '#23272a';
    ctx.lineWidth = 4 * z;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 8 * z, cy - 20 * z);
    ctx.stroke();
  } else if (b.type === 'aa') {
    ctx.strokeStyle = '#23272a';
    ctx.lineWidth = 3 * z;
    ctx.beginPath();
    ctx.moveTo(cx - 5 * z, cy);
    ctx.lineTo(cx - 9 * z, cy - 20 * z);
    ctx.moveTo(cx + 5 * z, cy);
    ctx.lineTo(cx + 1 * z, cy - 20 * z);
    ctx.stroke();
  } else if (b.type === 'extractor') {
    ctx.fillStyle = '#2b2f2b';
    ctx.beginPath();
    ctx.arc(cx, cy - 8 * z, 6 * z, 0, Math.PI * 2);
    ctx.fill();
  } else if (b.type === 'helipad') {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 26 * z, 13 * z, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (b.hp < b.maxHp) {
    ctx.fillStyle = `rgba(0,0,0,${(1 - b.hp / b.maxHp) * 0.4})`;
    poly(ctx, top);
    ctx.fill();
  }
  ctx.restore();
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
