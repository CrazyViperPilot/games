// Geländebild der Karte in 1/4 Maßstab (PLAN §5 render/terrain.js). Einmal pro Karte erzeugt, zwischengespeichert.
import { makeRng } from '../core/rng.js';

export const TERRAIN_SCALE = 0.25;
const cache = new WeakMap();

function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('Kein Canvas verfügbar');
}

/**
 * Bodenbild: Bodenrauschen, Hindernisse (Felsen grau, Wald dunkelgrün), dezentes Raster.
 * Deterministisch aus den Hindernissen der Karte. Gleiche Karte → gleiches (gecachtes) Canvas.
 * @returns {HTMLCanvasElement|OffscreenCanvas} Breite = width * TERRAIN_SCALE
 */
export function buildTerrain(map) {
  if (cache.has(map)) return cache.get(map);
  const W = map.width;
  const H = map.height;
  const S = TERRAIN_SCALE;
  const tile = map.tile;
  const canvas = makeCanvas(Math.round(W * S), Math.round(H * S));
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  let seed = 12345;
  for (const o of map.obstacles) seed = (seed * 31 + Math.round(o.x * 7 + o.y * 13 + o.r)) >>> 0;
  const rng = makeRng(seed);

  // Grundfarbe und weiche Flecken
  ctx.fillStyle = '#56603f';
  ctx.fillRect(0, 0, w, h);
  const patches = ['#5e6a46', '#4b5737', '#687249', '#4f5b3a', '#616c4a'];
  for (let i = 0; i < 900; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const r = 6 + rng.next() * 22;
    ctx.globalAlpha = 0.25 + rng.next() * 0.25;
    ctx.fillStyle = rng.pick(patches);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rng.next() * 0.6), rng.next() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Feinkörnung
  ctx.globalAlpha = 1;
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = rng.next() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,220,0.08)';
    ctx.fillRect(rng.next() * w, rng.next() * h, 1, 1);
  }

  // Hindernisse: Wald (Kreis aus Baumkronen) bzw. Fels (grauer Block mit Schatten).
  // Die Art richtet sich nach dem Radius, damit die punktsymmetrischen Partner gleich aussehen.
  for (const o of map.obstacles) {
    const cx = o.x * S;
    const cy = o.y * S;
    const rr = o.r * S;
    const forest = Math.round(o.r) % 2 === 0;
    if (forest) {
      ctx.fillStyle = 'rgba(15,28,14,0.55)';
      ctx.beginPath();
      ctx.arc(cx + 1.5, cy + 2, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#263f24';
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
      const trees = Math.max(4, Math.round(o.r / 9));
      for (let i = 0; i < trees; i++) {
        const a = rng.next() * Math.PI * 2;
        const d = Math.sqrt(rng.next()) * rr * 0.8;
        const tr = Math.max(1.2, rr * (0.14 + rng.next() * 0.12));
        ctx.fillStyle = rng.next() < 0.5 ? '#34552e' : '#1c3019';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, tr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(cx + 2, cy + 2.5, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a7d78';
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a8aca6';
      ctx.beginPath();
      ctx.arc(cx - rr * 0.25, cy - rr * 0.25, rr * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5c5f5a';
      ctx.beginPath();
      ctx.arc(cx + rr * 0.2, cy + rr * 0.25, rr * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Dezentes Raster alle 4 Zellen (128 px)
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  const step = tile * 4 * S;
  ctx.beginPath();
  for (let x = 0; x <= w; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  cache.set(map, canvas);
  return canvas;
}
