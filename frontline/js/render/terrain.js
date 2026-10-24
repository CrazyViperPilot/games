// Geländebild der Karte in 1/4 Maßstab (PLAN §5 render/terrain.js). Einmal pro Karte erzeugt, zwischengespeichert.
import { makeRng } from '../core/rng.js';

export const TERRAIN_SCALE = 0.25;
const cache = new WeakMap();
const cacheIso = new WeakMap(); // Boden ohne Gebäude und Bäume (die zeichnet die isometrische Ansicht als Körper)

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
export function buildTerrain(map, iso = false) {
  const cache_ = iso ? cacheIso : cache;
  if (cache_.has(map)) return cache_.get(map);
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

  drawRoads(ctx, map, S);
  drawRail(ctx, map, S);
  drawTown(ctx, map, S, iso);
  if (!iso) for (const t of map.trees ?? []) tree(ctx, t.x * S, t.y * S, t.r * S);

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

  cache_.set(map, canvas);
  return canvas;
}

const TRAIN_COLOR = { loco: '#b3423a', container: '#3f8a5e', tank: '#7c8190' };

function disc(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function tree(ctx, x, y, r) {
  disc(ctx, x + r * 0.2, y + r * 0.25, r, 'rgba(10,22,10,0.35)');
  disc(ctx, x, y, r, '#2f5028');
  disc(ctx, x - r * 0.25, y - r * 0.25, r * 0.55, '#43733a');
}

/** Straßen der Stadt und Feldwege (Asphalt mit Mittellinie bzw. Erdweg). */
function drawRoads(ctx, map, S) {
  const roads = map.town?.roads;
  if (!roads) return;
  ctx.lineCap = 'butt';
  for (const r of roads) {
    ctx.strokeStyle = r.dirt ? '#7b6a48' : '#4d504c';
    ctx.lineWidth = r.w * S;
    ctx.beginPath();
    ctx.moveTo(r.x1 * S, r.y1 * S);
    ctx.lineTo(r.x2 * S, r.y2 * S);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(230,220,150,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  for (const r of roads) {
    if (r.dirt) continue;
    ctx.moveTo(r.x1 * S, r.y1 * S);
    ctx.lineTo(r.x2 * S, r.y2 * S);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Bahnlinie: Schotterbett, Schwellen und zwei Schienen (Straßen kreuzen sie auf gleicher Höhe). */
function drawRail(ctx, map, S) {
  const r = map.town?.rail;
  if (!r) return;
  const y = r.y * S;
  const x1 = r.x1 * S;
  const x2 = r.x2 * S;
  const bed = 40 * S;
  ctx.fillStyle = '#6b665c';
  ctx.fillRect(x1, y - bed / 2, x2 - x1, bed);
  ctx.fillStyle = '#4a3a2c';
  const sw = Math.max(1.5, 3 * S);
  for (let x = x1; x < x2; x += 12 * S) ctx.fillRect(x, y - bed * 0.45, sw, bed * 0.9);
  ctx.fillStyle = '#b9bcbd';
  const rw = Math.max(1, 2.2 * S);
  ctx.fillRect(x1, y - bed * 0.28 - rw / 2, x2 - x1, rw);
  ctx.fillRect(x1, y + bed * 0.28 - rw / 2, x2 - x1, rw);
}

/** Parks, Gebäude (Häuser, Hallen, Fabriken), Autos und Stadtbäume. */
function drawTown(ctx, map, S, iso = false) {
  const t = map.town;
  if (!t) return;
  for (const p of t.parks) {
    disc(ctx, p.x * S, p.y * S, p.r * S, 'rgba(110,150,80,0.55)');
  }
  for (const b of iso ? [] : t.buildings) {
    const x = (b.x - b.w / 2) * S;
    const y = (b.y - b.h / 2) * S;
    const w = b.w * S;
    const h = b.h * S;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 2, y + 2.5, w, h);
    if (b.kind === 'house') {
      ctx.fillStyle = (b.x + b.y) % 3 < 1 ? '#8c4a38' : (b.x + b.y) % 3 < 2 ? '#a15a3c' : '#7d5a47';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + w / 2, y, w / 2, h); // Dachfirst: eine Dachhälfte dunkler
    } else if (b.kind === 'hall') {
      ctx.fillStyle = '#8d949a';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < 5; k++) {
        ctx.moveTo(x + (w * k) / 5, y);
        ctx.lineTo(x + (w * k) / 5, y + h);
      }
      ctx.stroke();
    } else if (b.kind === 'train') {
      ctx.fillStyle = TRAIN_COLOR[b.part] ?? '#777';
      ctx.fillRect(x + w * 0.04, y + h * 0.1, w * 0.92, h * 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + w * 0.04, y + h * 0.1, w * 0.92, h * 0.25);
    } else {
      ctx.fillStyle = '#5f6366';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#74797c';
      for (let k = 0; k < 3; k++) {
        if (w >= h) ctx.fillRect(x + 2 + (k * (w - 4)) / 3, y + 2, (w - 4) / 3 - 2, h - 4);
        else ctx.fillRect(x + 2, y + 2 + (k * (h - 4)) / 3, w - 4, (h - 4) / 3 - 2);
      }
      disc(ctx, x + w * 0.85, y + h * 0.2, Math.max(2, 20 * S), '#3b3d3f'); // Schornstein
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }
  for (const c of t.cars) {
    const cw = (c.vertical ? 18 : 36) * S;
    const ch = (c.vertical ? 36 : 18) * S;
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x * S - cw / 2, c.y * S - ch / 2, cw, ch);
  }
  if (!iso) for (const tr of t.trees) tree(ctx, tr.x * S, tr.y * S, tr.r * S);
}
