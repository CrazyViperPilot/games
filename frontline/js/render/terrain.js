// Geländebild der Karte in 1/4 Maßstab (PLAN §5 render/terrain.js). Einmal pro Karte erzeugt, zwischengespeichert.
import { makeRng } from '../core/rng.js';
import { reliefOf } from '../game/relief.js';
import { reliefLayers } from './reliefimg.js';

export const TERRAIN_SCALE = 0.25;
// Je Ansicht ein Bild: '2d' mit Gebäuden und Bäumen, 'iso' ohne (die zeichnet die isometrische Ansicht als Körper),
// 'gl' wie 'iso', aber ohne Schummerung, Fels und Wasser (die rechnet der WebGL-Boden selbst)
const caches = { '2d': new WeakMap(), iso: new WeakMap(), gl: new WeakMap() };

/**
 * Ausstattung eines Parks (deterministisch aus Lage und Größe): Bäume am Rand, vier Bänke am Rundweg.
 * Nur Dekoration, nicht im Wegenetz. Rundweg: Kreis mit Radius `path`.
 */
export function parkDeco(p) {
  let seed = (Math.round(p.x) * 73856093) ^ (Math.round(p.y) * 19349663) ^ Math.round(p.r * 83492791);
  const rng = makeRng(seed >>> 0);
  const path = p.r * 0.55;
  const trees = [];
  const n = Math.max(4, Math.round(p.r / 24));
  for (let i = 0; i < n; i++) {
    const a = ((i + rng.next() * 0.6) / n) * Math.PI * 2;
    const d = p.r * (0.74 + rng.next() * 0.16);
    trees.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: 11 + rng.next() * 7 });
  }
  const benches = [];
  const a0 = rng.next() * Math.PI;
  for (let k = 0; k < 4; k++) {
    const a = a0 + (k * Math.PI) / 2;
    benches.push({ x: p.x + Math.cos(a) * path, y: p.y + Math.sin(a) * path, a: a + Math.PI / 2, rx: Math.cos(a), ry: Math.sin(a) });
  }
  return { trees, benches, path };
}

/** Karte wurde verändert (Editor): zwischengespeicherte Geländebilder verwerfen. */
export function invalidateTerrain(map) {
  for (const c of Object.values(caches)) c.delete(map);
}

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
 * Bodenbild: Bodenrauschen, Gelände (Fels, Seen, Schummerung), Hindernisse (Felsen grau, Wald dunkelgrün), dezentes Raster.
 * Deterministisch aus der Karte. Gleiche Karte → gleiches (gecachtes) Canvas. mode: '2d', 'iso' oder 'gl' (true = 'iso').
 * @returns {HTMLCanvasElement|OffscreenCanvas} Breite = width * TERRAIN_SCALE
 */
export function buildTerrain(map, mode = '2d') {
  if (mode === true) mode = 'iso';
  else if (!mode) mode = '2d';
  const iso = mode !== '2d';
  const cache_ = caches[mode];
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

  // Gelände: Fels, Ufer und Seen unter Straßen und Stadt, die Schummerung zuletzt über alles
  const relief = mode === 'gl' ? null : reliefOf(map);
  const layers = relief ? reliefLayers(relief, W, H) : null;
  if (layers) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layers.mat, 0, 0, w, h);
  }

  drawMapObjects(ctx, map, S, iso, rng);

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

  if (layers) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.drawImage(layers.shade, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  cache_.set(map, canvas);
  return canvas;
}

/** Straßen, Bahn, Stadt, Bäume und Hindernisse einer Karte auf ein Canvas (Maßstab S). Auch der Karteneditor nutzt das. */
export function drawMapObjects(ctx, map, S, iso, rng) {
  drawFields(ctx, map, S);
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
}

const TRAIN_COLOR = { loco: '#b3423a', container: '#3f8a5e', tank: '#7c8190' };
// Äcker je Frucht: Grund, Furchen, Feldrand (gepflügt zusätzlich helle Kämme)
const CROP_LOOK = {
  wheat: { base: '#b5a055', row: '#9a8641', edge: '#8a7a3c' },
  green: { base: '#7b9542', row: '#657f37', edge: '#5a7032' },
  soil: { base: '#6c5338', row: '#54402b', edge: '#4c3a27', ridge: '#7f6343' },
  rape: { base: '#cdbd3f', row: '#b3a333', edge: '#978b2e' },
};
const PASTURE = { base: '#66804a', patch: '#718c50', fence: '#7d6142', bale: '#c9b26a' };

/**
 * Äcker und Weiden (town.fields): Äcker mit Furchen in Längsrichtung und dunklerem Rand, Weiden mit helleren Flecken, Zaun mit
 * Pfosten und ein paar Heuballen. Nur Boden; die Zufallsdetails hängen an der Lage des Felds (kein gemeinsamer Zufall).
 */
function drawFields(ctx, map, S) {
  for (const f of map.town?.fields ?? []) {
    const rng = makeRng(((Math.round(f.x) * 73856093) ^ (Math.round(f.y) * 19349663)) >>> 0);
    const w = f.w * S;
    const h = f.h * S;
    ctx.save();
    ctx.translate(f.x * S, f.y * S);
    if (f.angle) ctx.rotate(f.angle);
    if (f.kind === 'pasture') {
      ctx.fillStyle = PASTURE.base;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = PASTURE.patch;
      for (let i = 0; i < 7; i++) {
        const r = (18 + rng.next() * 40) * S;
        ctx.globalAlpha = 0.35 + rng.next() * 0.3;
        ctx.beginPath();
        ctx.ellipse((rng.next() - 0.5) * (w - 2 * r), (rng.next() - 0.5) * (h - 2 * r), r, r * (0.5 + rng.next() * 0.4), rng.next() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (let i = rng.int(1, 3); i > 0; i--) {
        const bx = (rng.next() - 0.5) * (w - 40 * S);
        const by = (rng.next() - 0.5) * (h - 40 * S);
        disc(ctx, bx + 2 * S, by + 2.5 * S, 8 * S, 'rgba(30,30,10,0.35)');
        disc(ctx, bx, by, 8 * S, PASTURE.bale);
      }
      // Zaun mit Pfosten
      ctx.strokeStyle = PASTURE.fence;
      ctx.lineWidth = Math.max(0.8, 2.5 * S);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = PASTURE.fence;
      const post = Math.max(1, 5 * S);
      const along = (x0, y0, x1, y1) => {
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / (40 * S)));
        for (let k = 0; k <= n; k++) ctx.fillRect(x0 + ((x1 - x0) * k) / n - post / 2, y0 + ((y1 - y0) * k) / n - post / 2, post, post);
      };
      along(-w / 2, -h / 2, w / 2, -h / 2);
      along(-w / 2, h / 2, w / 2, h / 2);
      along(-w / 2, -h / 2, -w / 2, h / 2);
      along(w / 2, -h / 2, w / 2, h / 2);
    } else {
      const L = CROP_LOOK[f.crop] ?? CROP_LOOK.wheat;
      ctx.fillStyle = L.base;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      // leichte Farbunterschiede im Bestand
      for (let i = 0; i < 3; i++) {
        const r = (40 + rng.next() * 60) * S;
        ctx.globalAlpha = 0.1 + rng.next() * 0.08;
        ctx.fillStyle = rng.next() < 0.5 ? L.row : L.edge;
        ctx.beginPath();
        ctx.ellipse((rng.next() - 0.5) * w * 0.6, (rng.next() - 0.5) * h * 0.6, r, r * 0.6, rng.next() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Furchen in Längsrichtung, am Rand das Vorgewende
      const long = w >= h;
      const span = long ? h : w;
      const len = long ? w : h;
      const step = 12 * S;
      const head = Math.min(18 * S, len * 0.1);
      const rows = (color, off) => {
        ctx.strokeStyle = color;
        ctx.beginPath();
        for (let d = -span / 2 + step * off; d < span / 2; d += step) {
          if (long) {
            ctx.moveTo(-len / 2 + head, d);
            ctx.lineTo(len / 2 - head, d);
          } else {
            ctx.moveTo(d, -len / 2 + head);
            ctx.lineTo(d, len / 2 - head);
          }
        }
        ctx.stroke();
      };
      ctx.lineWidth = Math.max(0.6, 4 * S);
      rows(L.row, 0.5);
      if (L.ridge) {
        ctx.lineWidth = Math.max(0.4, 2.5 * S);
        rows(L.ridge, 1);
      }
      ctx.strokeStyle = L.edge;
      ctx.lineWidth = Math.max(0.8, 5 * S);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }
}

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

/** Schnittpunkte und Stoßstellen der Straßen (Kreuzungen, T- und L-Einmündungen): [{x, y, r, dirt}]. */
export function roadJunctions(roads) {
  const out = [];
  const seg = (r) => ({ x: r.x1, y: r.y1, dx: r.x2 - r.x1, dy: r.y2 - r.y1 });
  for (let i = 0; i < roads.length; i++) {
    const a = roads[i];
    const A = seg(a);
    for (let j = i + 1; j < roads.length; j++) {
      const b = roads[j];
      const B = seg(b);
      const den = A.dx * B.dy - A.dy * B.dx;
      if (Math.abs(den) < 1e-6) continue; // parallel
      const t = ((B.x - A.x) * B.dy - (B.y - A.y) * B.dx) / den;
      const u = ((B.x - A.x) * A.dy - (B.y - A.y) * A.dx) / den;
      const la = Math.hypot(A.dx, A.dy) || 1;
      const lb = Math.hypot(B.dx, B.dy) || 1;
      // Toleranz: Enden dürfen knapp daneben liegen (Breite der anderen Straße)
      const ta = (b.w / 2 + 4) / la;
      const tb = (a.w / 2 + 4) / lb;
      if (t < -ta || t > 1 + ta || u < -tb || u > 1 + tb) continue;
      out.push({ x: A.x + t * A.dx, y: A.y + t * A.dy, r: Math.max(a.w, b.w) / 2, dirt: !!a.dirt && !!b.dirt });
    }
  }
  return out;
}

/** Straßen der Stadt und Feldwege (Asphalt mit Mittellinie bzw. Erdweg); an Kreuzungen und Einmündungen eine durchgehende Fläche. */
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
  // Kreuzungsfläche über den Mittellinien
  for (const j of roadJunctions(roads)) {
    const x = j.x * S;
    const y = j.y * S;
    const r = j.r * S;
    ctx.fillStyle = j.dirt ? '#7b6a48' : '#4d504c';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.02, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Gleise einer Karte: neue Form `rails` (freie Strecken) oder die ältere `rail` (eine Linie quer über die Karte). */
export function railList(town) {
  const list = (town?.rails ?? []).slice();
  if (town?.rail && Number.isFinite(town.rail.y)) list.push({ x1: 0, y1: town.rail.y, x2: (town.rail.x2 ?? 9024), y2: town.rail.y });
  return list;
}

const RAIL_BED = 40;

/** Gleise: Schotterbett, Schwellen und zwei Schienen je Strecke; wo Gleise sich treffen oder kreuzen, ein durchgehendes Bett (Weiche/Kreuzung). */
function drawRail(ctx, map, S) {
  const rails = railList(map.town);
  if (!rails.length) return;
  const bed = RAIL_BED * S;
  const each = (fn) => {
    for (const r of rails) {
      const len = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
      if (len < 1) continue;
      ctx.save();
      ctx.translate(r.x1 * S, r.y1 * S);
      ctx.rotate(Math.atan2(r.y2 - r.y1, r.x2 - r.x1));
      fn(len * S);
      ctx.restore();
    }
  };
  ctx.fillStyle = '#6b665c';
  each((l) => ctx.fillRect(0, -bed / 2, l, bed));
  const joints = roadJunctions(rails.map((r) => ({ ...r, w: RAIL_BED })));
  ctx.fillStyle = '#6b665c';
  for (const j of joints) {
    ctx.beginPath();
    ctx.arc(j.x * S, j.y * S, (RAIL_BED / 2) * S, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#4a3a2c';
  const sw = Math.max(1.5, 3 * S);
  each((l) => {
    for (let x = 0; x < l; x += 12 * S) ctx.fillRect(x, -bed * 0.45, sw, bed * 0.9);
  });
  ctx.fillStyle = '#b9bcbd';
  const rw = Math.max(1, 2.2 * S);
  each((l) => {
    ctx.fillRect(0, -bed * 0.28 - rw / 2, l, rw);
    ctx.fillRect(0, bed * 0.28 - rw / 2, l, rw);
  });
}

/** Parks, Gebäude (Häuser, Hallen, Fabriken), Autos und Stadtbäume. */
function drawTown(ctx, map, S, iso = false) {
  const t = map.town;
  if (!t) return;
  for (const p of t.parks) {
    disc(ctx, p.x * S, p.y * S, p.r * S, 'rgba(110,150,80,0.55)');
    // Rundweg
    ctx.strokeStyle = 'rgba(205,195,150,0.55)';
    ctx.lineWidth = Math.max(1, 12 * S);
    ctx.beginPath();
    ctx.arc(p.x * S, p.y * S, p.r * 0.55 * S, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const b of iso ? [] : t.buildings) {
    let x = (b.x - b.w / 2) * S;
    let y = (b.y - b.h / 2) * S;
    const w = b.w * S;
    const h = b.h * S;
    const turned = !!b.angle; // Züge und Bahnsteige entlang schräger Gleise
    if (turned) {
      ctx.save();
      ctx.translate(b.x * S, b.y * S);
      ctx.rotate(b.angle);
      x = -w / 2;
      y = -h / 2;
    }
    if (b.kind !== 'platform') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + 2, y + 2.5, w, h);
    }
    if (b.kind === 'platform') {
      ctx.fillStyle = '#a7a8a2';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#d9b73a'; // Sicherheitsstreifen an beiden Längskanten
      const e = Math.max(1, 2.5 * S);
      ctx.fillRect(x, y, w, e);
      ctx.fillRect(x, y + h - e, w, e);
      ctx.fillStyle = 'rgba(70,76,80,0.55)'; // Bahnsteigdach
      ctx.fillRect(x + w * 0.07, y + h * 0.1, w * 0.86, h * 0.8);
    } else if (b.kind === 'station') {
      ctx.fillStyle = '#c4b28f';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#7d4b3d'; // Satteldach: eine Hälfte dunkler
      if (w >= h) {
        ctx.fillRect(x + w * 0.04, y + h * 0.1, w * 0.92, h * 0.4);
        ctx.fillStyle = '#6a3f33';
        ctx.fillRect(x + w * 0.04, y + h * 0.5, w * 0.92, h * 0.4);
      } else {
        ctx.fillRect(x + w * 0.1, y + h * 0.04, w * 0.4, h * 0.92);
        ctx.fillStyle = '#6a3f33';
        ctx.fillRect(x + w * 0.5, y + h * 0.04, w * 0.4, h * 0.92);
      }
      ctx.fillStyle = '#f2efe4'; // Uhr am Turm
      const cx = w >= h ? x + w * 0.14 : x + w / 2;
      const cy = w >= h ? y + h / 2 : y + h * 0.14;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, 9 * S), 0, Math.PI * 2);
      ctx.fill();
    } else if (b.kind === 'house') {
      ctx.fillStyle = (b.x + b.y) % 3 < 1 ? '#8c4a38' : (b.x + b.y) % 3 < 2 ? '#a15a3c' : '#7d5a47';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + w / 2, y, w / 2, h); // Dachfirst: eine Dachhälfte dunkler
    } else if (b.kind === 'tower') {
      ctx.fillStyle = '#4d565a'; // Stahlgerüst von oben: Beine in den Ecken, Kabine mit grünem Dachrand
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#8b9284';
      ctx.fillRect(x + w * 0.04, y + h * 0.04, w * 0.92, h * 0.92);
      ctx.strokeStyle = '#68854f';
      ctx.lineWidth = Math.max(2, 5 * S);
      ctx.strokeRect(x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.88);
      ctx.fillStyle = '#777e74';
      ctx.fillRect(x + w * 0.2, y + h * 0.2, w * 0.38, h * 0.34);
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
    } else if (b.kind === 'wall') {
      ctx.fillStyle = '#a29f94';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x, y, w, Math.min(h, 2));
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
    if (turned) ctx.restore();
  }
  if (!iso) {
    for (const c of t.cars) {
      const cw = (c.vertical ? 18 : 36) * S;
      const ch = (c.vertical ? 36 : 18) * S;
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x * S - cw / 2, c.y * S - ch / 2, cw, ch);
      ctx.fillStyle = 'rgba(40,60,80,0.7)'; // Windschutz- und Heckscheibe
      if (c.vertical) ctx.fillRect(c.x * S - cw * 0.4, c.y * S - ch * 0.22, cw * 0.8, ch * 0.44);
      else ctx.fillRect(c.x * S - cw * 0.22, c.y * S - ch * 0.4, cw * 0.44, ch * 0.8);
    }
    for (const p of t.parks) {
      const d = parkDeco(p);
      for (const b of d.benches) {
        ctx.save();
        ctx.translate(b.x * S, b.y * S);
        ctx.rotate(b.a);
        ctx.fillStyle = '#7a5a3a';
        ctx.fillRect(-9 * S, -3 * S, 18 * S, 6 * S);
        ctx.restore();
      }
      for (const tr of d.trees) tree(ctx, tr.x * S, tr.y * S, tr.r * S);
    }
    for (const tr of t.trees) tree(ctx, tr.x * S, tr.y * S, tr.r * S);
  }
}
