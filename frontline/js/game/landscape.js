// Landschaft der Zufallskarte: Höhengelände mit welligem Grund, Hügeln, Bergrücken (Fels, unpassierbar) und Seen.
// Punktsymmetrisch wie die übrige Karte. Dazu die Prüfung, ob mehrere getrennte Wege in die Konfliktzone führen. Kein DOM.
import { BALANCE } from '../data/balance.js';
import { makeRng } from '../core/rng.js';
import { Relief, RELIEF, COARSE_N } from './relief.js';
import { findPath } from './pathfinding.js';

const W = BALANCE.map.width;
const H = BALANCE.map.height;
const TWO_PI = Math.PI * 2;

const HILLS = 7; // Hügelpaare außerhalb der Stadt (passierbar)
const ZONE_HILLS = 2; // sanfte Hügelpaare in der Stadt
const RIDGES = 4; // Bergrücken-Paare (steile Flanken = Fels, unpassierbar)
const LAKES = 2; // Seepaare
const SPAWN_FLAT = 650; // ebene Fläche um die Startpunkte, danach weicher Übergang bis SPAWN_BLEND
const SPAWN_BLEND = 1050;
const BASE_LEVEL = 36; // mittlere Höhe des Grundes über dem Wasserspiegel-Bezug 0
const DRY_LEVEL = RELIEF.water + 22; // Mindesthöhe an Wegen, in der Stadt und an den Startpunkten

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Abstand Punkt → Strecke und Lage t (0–1) auf der Strecke. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

/** Wertrauschen (glatt interpoliert) aus dem Zufallsgenerator. */
function makeNoise(rng) {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rng.next() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const v = (x, y) => vals[perm[perm[x & 255] + (y & 255)]];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const w = fy * fy * (3 - 2 * fy);
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * u;
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * u;
    return a + (b - a) * w;
  };
}

/**
 * Höhengelände der Zufallskarte.
 * @param {number} seed
 * @param {{ spawns: {x,y}[], zone: {x,y,r}, roads: {x1,y1,x2,y2}[], railY: number }} keep Bereiche, die frei bleiben
 * @returns {{ relief: Relief, ridges: object[], lakes: object[], hills: object[] }}
 */
export function buildLandscape(seed, keep) {
  const rng = makeRng((seed * 2654435761) ^ 0x5bd1e995);
  const noise = makeNoise(rng);
  const { spawns, zone, roads, railY } = keep;
  const ZR = zone.r;

  // Freiraum eines Punktes mit Einflussradius `reach` zu Zone, Startpunkten, Zufahrten, Bahn und Rand
  const clear = (x, y, reach, zoneGap = 0) =>
    x > 150 && y > 150 && x < W - 150 && y < H - 150 &&
    dist(x, y, zone.x, zone.y) > ZR + reach + zoneGap &&
    spawns.every((s) => dist(x, y, s.x, s.y) > SPAWN_BLEND + reach) &&
    roads.every((r) => segDist(x, y, r.x1, r.y1, r.x2, r.y2).d > reach + 40) &&
    Math.abs(y - railY) > reach + 60;
  const mirror = (p) => ({ x: W - p.x, y: H - p.y });

  // Bergrücken: Linienzug aus zwei Strecken, Querschnitt glockenförmig, Kamm mit Gipfeln und auslaufenden Enden
  const ridges = [];
  const ridgePts = (rd) => {
    const out = [];
    for (let s = 0; s < rd.pts.length - 1; s++) {
      const a = rd.pts[s];
      const b = rd.pts[s + 1];
      const n = Math.ceil(dist(a.x, a.y, b.x, b.y) / 90);
      for (let k = 0; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    return out;
  };
  for (let i = 0; i < RIDGES; i++) {
    for (let t = 0; t < 400; t++) {
      const sigma = rng.range(230, 310);
      const h = rng.range(190, 250);
      const x0 = rng.range(300, W - 300);
      const y0 = rng.range(300, H - 300);
      let a = rng.next() * TWO_PI;
      const pts = [{ x: x0, y: y0 }];
      for (let s = 0; s < 2; s++) {
        const len = rng.range(480, 900);
        const p = pts[pts.length - 1];
        pts.push({ x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len });
        a += rng.range(-0.7, 0.7);
      }
      const rd = { pts, sigma, h, phase: rng.next() * 10, bumps: rng.range(2, 4) };
      const samples = ridgePts(rd);
      const reach = 2.3 * sigma;
      if (!samples.every((p) => clear(p.x, p.y, reach))) continue;
      const others = ridges.flatMap((o) => ridgePts(o).map((q) => ({ q, s: o.sigma })));
      if (!samples.every((p) => others.every(({ q, s }) => dist(p.x, p.y, q.x, q.y) > 1.8 * (sigma + s)))) continue;
      if (!samples.every((p) => samples.every((q) => dist(p.x, p.y, W - q.x, H - q.y) > 3.6 * sigma))) continue;
      ridges.push(rd, { ...rd, pts: pts.map(mirror) });
      break;
    }
  }

  // Seen: Mulde unter den Wasserspiegel, Ufer flach auslaufend
  const lakes = [];
  const nearRidge = (x, y, gap) => ridges.some((rd) => ridgePts(rd).some((q) => dist(x, y, q.x, q.y) < gap + 2 * rd.sigma));
  for (let i = 0; i < LAKES; i++) {
    for (let t = 0; t < 300; t++) {
      const r = rng.range(260, 420);
      const x = rng.range(300, W - 300);
      const y = rng.range(300, H - 300);
      if (!clear(x, y, 1.9 * r, 80) || nearRidge(x, y, 2.2 * r)) continue;
      if (lakes.some((l) => dist(x, y, l.x, l.y) < 2.4 * (r + l.r) + 200)) continue;
      if (dist(x, y, W - x, H - y) < 3.4 * r) continue;
      // Uferlinie unregelmäßig: Radius schwankt mit dem Winkel (Buchten, Landzungen)
      const wob = [rng.range(0.08, 0.16), rng.next() * TWO_PI, rng.range(0.05, 0.1), rng.next() * TWO_PI];
      lakes.push({ x, y, r, wob }, { x: W - x, y: H - y, r, wob: [wob[0], wob[1] + Math.PI * 3, wob[2], wob[3] + Math.PI * 5] });
      break;
    }
  }

  // Hügel: sanft genug, dass man hinauffahren kann (max. Neigung ≈ 0,6 · h / σ)
  const hills = [];
  for (let i = 0; i < HILLS; i++) {
    for (let t = 0; t < 300; t++) {
      const h = rng.range(80, 150);
      const sigma = Math.max(2.4 * h, rng.range(330, 520));
      const x = rng.range(200, W - 200);
      const y = rng.range(200, H - 200);
      const dz = dist(x, y, zone.x, zone.y);
      if (dz < ZR + 2 * sigma && h > 0.2 * sigma) continue; // an der Stadt nur ganz flache Hügel
      if (dz < ZR - 200) continue;
      if (lakes.some((l) => dist(x, y, l.x, l.y) < 2.4 * l.r + 2 * sigma)) continue;
      if (spawns.some((s) => dist(x, y, s.x, s.y) < SPAWN_FLAT)) continue;
      if (dist(x, y, W - x, H - y) < 3 * sigma) continue;
      hills.push({ x, y, h, sigma }, { x: W - x, y: H - y, h, sigma });
      break;
    }
  }
  for (let i = 0; i < ZONE_HILLS; i++) {
    const a = rng.next() * TWO_PI;
    const d = rng.range(700, ZR - 900);
    const x = zone.x + Math.cos(a) * d;
    const y = zone.y + Math.sin(a) * d;
    const h = rng.range(40, 70);
    const sigma = rng.range(480, 650);
    hills.push({ x, y, h, sigma }, { x: W - x, y: H - y, h, sigma });
  }

  // Höhe je Grobpunkt
  const n = COARSE_N;
  const res = RELIEF.res;
  const coarse = new Float32Array(n * n);
  const base = (x, y) =>
    46 * noise(x / 2600 + 3.1, y / 2600 + 7.7) + 22 * noise(x / 1300 + 11.3, y / 1300 + 1.9) + 10 * noise(x / 650 + 5.5, y / 650 + 13.1);
  const ridgeAt = (rd, x, y) => {
    let best = Infinity;
    let along = 0;
    let total = 0;
    let at = 0;
    for (let s = 0; s < rd.pts.length - 1; s++) {
      const a = rd.pts[s];
      const b = rd.pts[s + 1];
      const L = dist(a.x, a.y, b.x, b.y);
      const q = segDist(x, y, a.x, a.y, b.x, b.y);
      if (q.d < best) {
        best = q.d;
        at = total + q.t * L;
      }
      total += L;
    }
    along = at / total;
    if (best > 3 * rd.sigma) return 0;
    const env = smooth(0, 0.22, along) * smooth(1, 0.78, along);
    const crest = rd.h * env * (0.8 + 0.2 * Math.sin(along * rd.bumps * TWO_PI + rd.phase));
    // Querschnitt spitz zulaufend: Flanken und Kamm sind steil (Fels), der Fuß läuft flach aus
    const f = Math.max(0, 1 - best / (2.4 * rd.sigma));
    return crest * f ** 1.7;
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * res;
      const y = j * res;
      const dz = dist(x, y, zone.x, zone.y);
      // Grund: punktsymmetrisch gemittelt, in der Stadt stark gedämpft
      let h = BASE_LEVEL + 0.7 * (base(x, y) + base(W - x, H - y)) * (0.25 + 0.75 * smooth(ZR - 700, ZR + 800, dz));
      for (const hl of hills) h += hl.h * Math.exp(-((dist(x, y, hl.x, hl.y) / hl.sigma) ** 2));
      let peak = 0;
      for (const rd of ridges) peak = Math.max(peak, ridgeAt(rd, x, y));
      h += peak;
      // Seen: flache Mulde, Ufer laufen weit und sanft aus (kein Krater)
      for (const l of lakes) {
        const th = Math.atan2(y - l.y, x - l.x);
        const d = dist(x, y, l.x, l.y) / (1 + l.wob[0] * Math.sin(3 * th + l.wob[1]) + l.wob[2] * Math.sin(5 * th + l.wob[3]));
        const w = 1 - smooth(0.85 * l.r, 2.7 * l.r, d);
        if (w <= 0) continue;
        const bed = d < l.r ? RELIEF.water - 48 * (1 - (d / l.r) ** 2) : RELIEF.water + 3;
        h += (bed - h) * w;
      }
      // Zufahrten, Bahn und Stadt liegen nie unter Wasser (kein Tümpel auf dem Weg)
      let near = Math.abs(y - railY);
      for (const r of roads) near = Math.min(near, segDist(x, y, r.x1, r.y1, r.x2, r.y2).d);
      const dry = Math.max(1 - smooth(70, 260, near), 1 - smooth(ZR, ZR + 300, dz));
      if (h < DRY_LEVEL) h += (DRY_LEVEL - h) * dry;
      // Gipfel weich begrenzen (Speicherformat reicht bis 382)
      if (h > 330) h = 330 + (h - 330) * 0.5;
      coarse[j * n + i] = Math.max(-118, Math.min(372, h));
    }
  }
  // Startpunkte eben (Haupt-FOB und Startaufstellung), weicher Übergang
  for (const s of spawns) {
    const level = Math.max(DRY_LEVEL, coarse[Math.round(s.y / res) * n + Math.round(s.x / res)]);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = smooth(SPAWN_FLAT, SPAWN_BLEND, dist(i * res, j * res, s.x, s.y));
        coarse[j * n + i] = level + (coarse[j * n + i] - level) * k;
      }
    }
  }
  // Exakt punktsymmetrisch (Rundungsreste der Mittelung ausgleichen)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = (n - 1 - j) * n + (n - 1 - i);
      if (a < b) coarse[a] = coarse[b] = (coarse[a] + coarse[b]) / 2;
    }
  }
  return { relief: new Relief(coarse), ridges, lakes, hills };
}

/** Gelände um (x, y) im Radius r eignet sich für Wald, Gehöfte oder Bäume: kein Wasser, nicht steiler als maxSlope. */
export function groundOk(relief, x, y, r = 0, maxSlope = RELIEF.rock) {
  if (!relief) return true;
  const pts = [[x, y]];
  if (r > 0) for (let k = 0; k < 8; k++) pts.push([x + Math.cos((k * TWO_PI) / 8) * r, y + Math.sin((k * TWO_PI) / 8) * r]);
  for (const [px, py] of pts) {
    if (relief.heightAt(px, py) < RELIEF.water + 8) return false;
    const g = relief.gradAt(px, py);
    if (Math.hypot(g.x, g.y) > maxSlope) return false;
  }
  return true;
}

/**
 * Zählt getrennte Wege von `from` nach `to` (bis `want`): Weg suchen, den Korridor um ihn (Radius `band`) sperren, erneut
 * suchen. Kreise in `keepOut` (Startbereich, Konfliktzone) werden nie gesperrt. Das Raster bleibt unverändert.
 */
export function countRoutes(grid, from, to, { want = 3, band = 340, keepOut = [] } = {}) {
  const saved = grid.terrain.slice();
  const t = grid.tile;
  const rc = Math.ceil(band / t);
  let found = 0;
  try {
    for (let k = 0; k < want; k++) {
      const path = findPath(grid, from.x, from.y, to.x, to.y, 0, grid.cols * grid.rows + 10);
      const last = path[path.length - 1];
      if (!last || Math.hypot(last.x - to.x, last.y - to.y) > t * 2) break;
      found++;
      let px = from.x;
      let py = from.y;
      for (const p of path) {
        const n = Math.max(1, Math.ceil(dist(px, py, p.x, p.y) / t));
        for (let s = 0; s <= n; s++) {
          const x = px + ((p.x - px) * s) / n;
          const y = py + ((p.y - py) * s) / n;
          if (keepOut.some((o) => dist(x, y, o.x, o.y) < o.r)) continue;
          const c0 = grid.toCell(x);
          const r0 = grid.toCell(y);
          for (let dr = -rc; dr <= rc; dr++) {
            for (let dc = -rc; dc <= rc; dc++) {
              if (dc * dc + dr * dr > rc * rc || !grid.inBounds(c0 + dc, r0 + dr)) continue;
              const cx = grid.center(c0 + dc);
              const cy = grid.center(r0 + dr);
              if (keepOut.some((o) => dist(cx, cy, o.x, o.y) < o.r)) continue;
              grid.terrain[grid.idx(c0 + dc, r0 + dr)] = 1;
            }
          }
        }
        px = p.x;
        py = p.y;
      }
    }
  } finally {
    grid.terrain.set(saved);
  }
  return found;
}
