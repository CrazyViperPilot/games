// Feldwege und Gleise (seit v5.31): scharf je Bild gemalt statt unscharf im Geländebild (das sie für Minimap und Editor behält).
// Feldweg (schmal): Erde mit zwei Fahrspuren und Grasnarbe in der Mitte; Landweg (breit): Schotter mit zwei abgefahrenen
// Fahrstreifen und losem Schotter in der Mitte. Ränder leicht unregelmäßig, weicher Saum zur Wiese. Gleis: Schotterbett mit
// hellerer Krone, Betonschwellen, zwei Schienen mit Glanz; wo Gleise sich treffen ein durchgehendes Bett, wo ein Weg das Gleis
// kreuzt, liegt der Weg über den Schwellen und die Schienen bleiben sichtbar. Herbst etwas dunkler mit Laub, Winter verschneit
// (Spuren matschig, Schienen blank). Die Muster Asphalt und Gehwegplatten (groundPattern) nutzen auch Stadtstraßen und Brücken.
// Pfade je Kachel (1024 px) zwischengespeichert und je Bild nur die sichtbaren Kacheln gefüllt; neu gebaut, wenn sich Drehung oder
// Gelände ändern (wie die Stadtstraßen in citylayer.js). Seit v5.44 kommen davor die Äcker und Weiden (fields.js). Nur Darstellung.
import { railList, roadJunctions } from './terrain.js';
import { buildFields, drawFieldLayers } from './fields.js';

const CHUNK = 1024; // Kachel der Pfade (Weltpixel)
const STEP = 24; // Abtastung entlang der Wege (unregelmäßige Ränder, Gelände)
const RAIL_BED = 40; // Breite des Schotterbetts, wie terrain.js
const GAUGE = 11.2; // halbe Spurweite
const SLEEPER_GAP = 12; // Abstand der Schwellen
const SLEEPER_LEN = 15; // halbe Länge einer Schwelle
const SLEEPER_W = 1.7; // halbe Breite einer Schwelle
const TEX = 64; // Weltpixel je Musterkachel
const TEX_PX = 256; // Bildpunkte je Musterkachel

const PAL = {
  summer: {
    shoulder: 'rgba(66,60,38,0.3)',
    dirt: ['#9b8765', '#8a7656', '#a99573', '#7b684a', '#b3a487'],
    rut: ['#7a6849', '#6c5c40', '#867453', '#5f5139', '#8f7d5d'],
    gravel: ['#a39d8e', '#928c7e', '#b2ac9e', '#847e71', '#c1bcb0'],
    leaves: null,
    median: '#6c8244',
    ballast: ['#706a61', '#5f5a52', '#837d73', '#97918a', '#4f4b45'],
    crown: 'rgba(170,164,152,0.16)',
    railShoulder: 'rgba(52,48,40,0.2)',
    sleeper: '#b2aea4',
    sleeperShade: 'rgba(24,22,20,0.6)',
    rail: '#3e4043',
    railTop: '#d6d9db',
  },
  autumn: {
    shoulder: 'rgba(70,56,32,0.32)',
    dirt: ['#8f7754', '#7f6948', '#9c8460', '#6f5c3f', '#a5916f'],
    rut: ['#6c5a3e', '#5e4e35', '#796647', '#524530', '#7f6c4e'],
    gravel: ['#9a9385', '#898275', '#a9a294', '#7b7569', '#b8b2a6'],
    leaves: ['#b8642a', '#c9902f', '#8c3f22', '#d1a640'],
    median: '#7f7a43',
    ballast: ['#6b655c', '#5a554d', '#7e786e', '#928c84', '#4b4741'],
    crown: 'rgba(166,158,144,0.16)',
    railShoulder: 'rgba(56,48,36,0.2)',
    sleeper: '#aca89e',
    sleeperShade: 'rgba(24,22,20,0.6)',
    rail: '#433f3c',
    railTop: '#c9c8c4',
  },
  winter: {
    shoulder: 'rgba(120,128,138,0.14)',
    dirt: ['#e2e7eb', '#d2d9df', '#eef1f4', '#c4ccd4', '#f7f8f9'],
    rut: ['#a49d93', '#938b80', '#b3ada4', '#857d72', '#c2bdb6'],
    gravel: ['#dfe4e8', '#ced5db', '#eceff2', '#bfc7ce', '#f5f7f8'],
    leaves: null,
    median: '#edf0f3',
    ballast: ['#d6dbdf', '#8d8a85', '#e9ecef', '#b9bdc0', '#76736e'],
    crown: 'rgba(250,252,253,0.3)',
    railShoulder: 'rgba(110,116,124,0.12)',
    sleeper: '#cfcfca',
    sleeperShade: 'rgba(40,42,46,0.5)',
    rail: '#3f4144',
    railTop: '#eef0f2',
  },
};

// ---------- Muster (Erde, Spuren, Schotter) ----------

/** Zufallszahlen fest je Muster. */
function rng32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Malt fn an (x, y) und, wo es über den Rand ragt, auch gegenüber (nahtlos kachelbar). */
function wrap(x, y, r, fn) {
  for (const dx of [0, -TEX_PX, TEX_PX]) {
    if ((dx < 0 && x + r < TEX_PX) || (dx > 0 && x - r > 0)) continue;
    for (const dy of [0, -TEX_PX, TEX_PX]) {
      if ((dy < 0 && y + r < TEX_PX) || (dy > 0 && y - r > 0)) continue;
      fn(x + dx, y + dy);
    }
  }
}

/** Musterkachel: Grundfarbe, weiche Flecken, Körnung und Steinchen (stones: Anteil, size: Größe), dazu Laub im Herbst. */
function paintTile(cols, seed, stones, size, leaves) {
  const c = makeCanvas(TEX_PX, TEX_PX);
  if (!c) return null;
  const g = c.getContext('2d');
  const r = rng32(seed);
  g.fillStyle = cols[0];
  g.fillRect(0, 0, TEX_PX, TEX_PX);
  // weiche Flecken (helle und dunkle Stellen)
  for (let i = 0; i < 26; i++) {
    const x = r() * TEX_PX;
    const y = r() * TEX_PX;
    const rr = 14 + r() * 34;
    const col = cols[1 + Math.floor(r() * 4)];
    g.globalAlpha = 0.16 + r() * 0.16;
    wrap(x, y, rr, (px, py) => {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(px, py, rr, rr * (0.55 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    });
  }
  // Körnung
  g.globalAlpha = 0.35;
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = cols[1 + Math.floor(r() * 4)];
    const s = 1 + r() * 1.6;
    g.fillRect(r() * TEX_PX, r() * TEX_PX, s, s);
  }
  // Steinchen mit Licht von links oben
  g.globalAlpha = 1;
  const n = Math.round(stones * 900);
  for (let i = 0; i < n; i++) {
    const x = r() * TEX_PX;
    const y = r() * TEX_PX;
    const rr = size * (0.5 + r() * 0.9);
    const col = cols[1 + Math.floor(r() * 4)];
    const a = r() * Math.PI;
    const e = 0.6 + r() * 0.35;
    wrap(x, y, rr + 2, (px, py) => {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath();
      g.ellipse(px + rr * 0.3, py + rr * 0.35, rr, rr * e, a, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(px, py, rr, rr * e, a, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.beginPath();
      g.ellipse(px - rr * 0.25, py - rr * 0.25, rr * 0.45, rr * e * 0.4, a, 0, Math.PI * 2);
      g.fill();
    });
  }
  if (leaves) {
    for (let i = 0; i < 70; i++) {
      const x = r() * TEX_PX;
      const y = r() * TEX_PX;
      const col = leaves[Math.floor(r() * leaves.length)];
      const a = r() * Math.PI;
      wrap(x, y, 4, (px, py) => {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(px, py, 3.2, 1.6, a, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
  return c;
}

/** Asphalt: feine Körnung mit hellem Splitt, geflickte Stellen, Haarrisse. */
function paintAsphalt(base, season) {
  const c = makeCanvas(TEX_PX, TEX_PX);
  if (!c) return null;
  const g = c.getContext('2d');
  const r = rng32(71);
  g.fillStyle = base;
  g.fillRect(0, 0, TEX_PX, TEX_PX);
  for (let i = 0; i < 12; i++) {
    // weiche hellere und dunklere Stellen (Abrieb, Ölflecken), ohne harte Kanten und ohne helle Tupfen
    const x = r() * TEX_PX;
    const y = r() * TEX_PX;
    const w = 34 + r() * 60;
    const h = 20 + r() * 36;
    const dark = r() < 0.7;
    const a = r() * Math.PI;
    const al = (dark ? 0.012 : 0.007) + r() * 0.01;
    wrap(x, y, Math.max(w, h), (px, py) => {
      for (let k = 0; k < 5; k++) {
        g.globalAlpha = al;
        g.fillStyle = dark ? '#000' : '#fff';
        g.beginPath();
        g.ellipse(px, py, (w / 2) * (1 - k * 0.17), (h / 2) * (1 - k * 0.17), a, 0, Math.PI * 2);
        g.fill();
      }
    });
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 5200; i++) {
    const v = r();
    g.fillStyle = v < 0.45 ? 'rgba(0,0,0,0.22)' : v < 0.9 ? 'rgba(255,255,255,0.1)' : 'rgba(225,222,212,0.35)';
    g.fillRect(r() * TEX_PX, r() * TEX_PX, v < 0.9 ? 1 : 1.6, v < 0.9 ? 1 : 1.6);
  }
  g.strokeStyle = 'rgba(20,20,18,0.35)';
  g.lineWidth = 0.9;
  for (let i = 0; i < 4; i++) {
    let x = r() * TEX_PX;
    let y = r() * TEX_PX;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 22;
      y += (r() - 0.5) * 22;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  if (season === 'winter') {
    g.fillStyle = 'rgba(235,240,244,0.5)'; // Salzränder und Reif
    for (let i = 0; i < 900; i++) g.fillRect(r() * TEX_PX, r() * TEX_PX, 1.4, 1.4);
  }
  return c;
}

/** Gehwegplatten (4 Weltpixel), je Platte leicht anders getönt, Fugen; Winter verschneit, Herbst mit Laub. */
function paintPavers(base, joint, season, leaves) {
  const c = makeCanvas(TEX_PX, TEX_PX);
  if (!c) return null;
  const g = c.getContext('2d');
  const r = rng32(97);
  g.fillStyle = joint;
  g.fillRect(0, 0, TEX_PX, TEX_PX);
  const n = 16;
  const q = TEX_PX / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const t = (r() - 0.5) * 0.12;
      g.fillStyle = base;
      g.fillRect(i * q + 1, j * q + 1, q - 2, q - 2);
      g.fillStyle = t < 0 ? `rgba(0,0,0,${-t})` : `rgba(255,255,255,${t})`;
      g.fillRect(i * q + 1, j * q + 1, q - 2, q - 2);
      g.fillStyle = 'rgba(255,255,255,0.1)'; // Licht von links oben
      g.fillRect(i * q + 1, j * q + 1, q - 2, 1);
    }
  }
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
    g.fillRect(r() * TEX_PX, r() * TEX_PX, 1, 1);
  }
  if (season === 'winter') {
    g.globalAlpha = 0.55;
    g.fillStyle = '#eef2f5';
    g.fillRect(0, 0, TEX_PX, TEX_PX);
    g.globalAlpha = 1;
  }
  if (leaves) {
    for (let i = 0; i < 46; i++) {
      const x = r() * TEX_PX;
      const y = r() * TEX_PX;
      const col = leaves[Math.floor(r() * leaves.length)];
      const a = r() * Math.PI;
      wrap(x, y, 4, (px, py) => {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(px, py, 3, 1.5, a, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
  return c;
}

const STREET = {
  summer: { asphalt: '#4e514b', pavers: '#a3a197', joint: '#7d7b73' },
  autumn: { asphalt: '#4b4d48', pavers: '#9c9a90', joint: '#77756d' },
  winter: { asphalt: '#575a57', pavers: '#bfc3c4', joint: '#9a9ea0' },
};

const patterns = new Map(); // Art|Jahreszeit → CanvasPattern (oder null)

/**
 * Muster für Boden-Flächen (seit v5.31): 'asphalt', 'pavers' (Gehweg), 'dirt', 'rut', 'gravel', 'ballast'; null ohne Canvas.
 * Eine Kachel deckt TEX Weltpixel; patternMatrix(u) legt sie auf die Bodenebene.
 */
export function groundPattern(ctx, kind, season) {
  return patternOf(ctx, kind, season);
}

/** Transformation eines Musters: flach (Weltkoordinaten) oder auf die Iso-Achsen u (Pfadkoordinaten mit Gelände). */
export function patternMatrix(u) {
  if (typeof DOMMatrix === 'undefined') return null;
  const sc = TEX / TEX_PX;
  return u ? new DOMMatrix([u[0] * sc, u[1] * sc, u[2] * sc, u[3] * sc, 0, 0]) : new DOMMatrix([sc, 0, 0, sc, 0, 0]);
}
function patternOf(ctx, kind, season) {
  const key = `${kind}|${season}`;
  if (patterns.has(key)) return patterns.get(key);
  const P = PAL[season] ?? PAL.summer;
  let tile = null;
  if (kind === 'dirt') tile = paintTile(P.dirt, 11, 0.12, 2.2, P.leaves);
  else if (kind === 'rut') tile = paintTile(P.rut, 23, 0.08, 1.8, null);
  else if (kind === 'gravel') tile = paintTile(P.gravel, 37, 0.5, 2.4, P.leaves);
  else if (kind === 'ballast') tile = paintTile(P.ballast, 53, 1.6, 3.2, null);
  else if (kind === 'asphalt') tile = paintAsphalt((STREET[season] ?? STREET.summer).asphalt, season);
  else if (kind === 'pavers') tile = paintPavers((STREET[season] ?? STREET.summer).pavers, (STREET[season] ?? STREET.summer).joint, season, P.leaves);
  const pat = tile && ctx.createPattern ? ctx.createPattern(tile, 'repeat') : null;
  patterns.set(key, pat);
  return pat;
}

// ---------- Pfade ----------

/** Unregelmäßigkeit des Rands bei Weglänge s (fest je Weg und Seite). */
function wobble(seed, amp) {
  const p1 = (seed % 997) * 0.37;
  const p2 = (seed % 613) * 0.71;
  return (s) => amp * (0.6 * Math.sin(s * 0.027 + p1) + 0.4 * Math.sin(s * 0.083 + p2));
}
const NONE = () => 0;

/**
 * Zerlegt die Strecke [s0, s1] eines geraden Wegs an den Kachelgrenzen und ruft fn(sa, sb, Kachel) je Stück. Die Stücke stoßen
 * genau aneinander (keine doppelten halbdurchsichtigen Flächen).
 */
function pieces(x1, y1, ux, uy, s0, s1, fn) {
  const cuts = [s0, s1];
  for (const [p, d] of [[x1, ux], [y1, uy]]) {
    if (Math.abs(d) < 1e-9) continue;
    const a = p + d * s0;
    const b = p + d * s1;
    for (let k = Math.ceil(Math.min(a, b) / CHUNK); k * CHUNK < Math.max(a, b); k++) {
      const s = (k * CHUNK - p) / d;
      if (s > s0 && s < s1) cuts.push(s);
    }
  }
  cuts.sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const sa = cuts[i];
    const sb = cuts[i + 1];
    if (sb - sa < 0.01) continue;
    const sm = (sa + sb) / 2;
    fn(sa, sb, chunkKey(x1 + ux * sm, y1 + uy * sm));
  }
}

const chunkKey = (x, y) => `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;

/** Sammelt die Pfade je Kachel und Ebene; P projiziert einen Weltpunkt in Pfadkoordinaten. */
class Builder {
  constructor(P) {
    this.P = P;
    this.chunks = new Map();
  }

  path(key, layer) {
    let c = this.chunks.get(key);
    if (!c) {
      const [cx, cy] = key.split(',').map(Number);
      this.chunks.set(key, (c = { cx, cy, layers: {} }));
    }
    return (c.layers[layer] ??= new Path2D());
  }

  /** Streifen eines geraden Wegs zwischen den seitlichen Abständen lo < hi (+ links), von s0 bis s1, Ränder mit Unregelmäßigkeit. */
  strip(layer, x1, y1, ux, uy, s0, s1, lo, hi, wLo = NONE, wHi = NONE) {
    const nx = -uy;
    const ny = ux;
    pieces(x1, y1, ux, uy, s0, s1, (sa, sb, key) => {
      const path = this.path(key, layer);
      const n = Math.max(1, Math.ceil((sb - sa) / STEP));
      for (let i = 0; i <= n; i++) {
        const s = sa + ((sb - sa) * i) / n;
        const o = hi + wHi(s);
        const [px, py] = this.P(x1 + ux * s + nx * o, y1 + uy * s + ny * o);
        if (i) path.lineTo(px, py);
        else path.moveTo(px, py);
      }
      for (let i = n; i >= 0; i--) {
        const s = sa + ((sb - sa) * i) / n;
        const o = lo + wLo(s);
        const [px, py] = this.P(x1 + ux * s + nx * o, y1 + uy * s + ny * o);
        path.lineTo(px, py);
      }
      path.closePath();
    });
  }

  /** Scheibe (gleicher Umlaufsinn wie die Streifen, damit sich überlappende Flächen vereinen). */
  disc(layer, x, y, r) {
    const path = this.path(chunkKey(x, y), layer);
    const n = Math.max(12, Math.min(40, Math.round(r / 2)));
    for (let i = 0; i < n; i++) {
      const a = -(i / n) * Math.PI * 2;
      const [px, py] = this.P(x + Math.cos(a) * r, y + Math.sin(a) * r);
      if (i) path.lineTo(px, py);
      else path.moveTo(px, py);
    }
    path.closePath();
  }

  /** Viereck quer zum Weg bei s (Schwelle): along = halbe Breite entlang, half = halbe Länge quer. */
  quad(layer, x1, y1, ux, uy, s, along, half) {
    const nx = -uy;
    const ny = ux;
    const cx = x1 + ux * s;
    const cy = y1 + uy * s;
    const path = this.path(chunkKey(cx, cy), layer);
    const pts = [[-along, half], [along, half], [along, -half], [-along, -half]];
    pts.forEach(([a, b], i) => {
      const [px, py] = this.P(cx + ux * a + nx * b, cy + uy * a + ny * b);
      if (i) path.lineTo(px, py);
      else path.moveTo(px, py);
    });
    path.closePath();
  }
}

const hashSeg = (r) => (Math.imul(Math.round(r.x1) * 73856093 ^ Math.round(r.y1) * 19349663, 1) ^ Math.round(r.x2 * 83492791 + r.y2)) >>> 0;

/** Alle Pfade der Feldwege und Gleise einer Karte (relief: Pfadkoordinaten mit Gelände, u: Iso-Achsen bei Zoom 1). */
export function buildWays(map, relief, u) {
  const P = u && relief ? (x, y) => [x * u[0] + y * u[2], x * u[1] + y * u[3] - relief.displayAt(x, y)] : (x, y) => [x, y];
  const B = new Builder(P);
  const rails = railList(map.town);
  // Gleise: Saum, Bett, Krone, Schwellen (die Schienen kommen nach den Wegen, siehe drawWays)
  for (const r of rails) {
    const L = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
    if (L < 1) continue;
    const ux = (r.x2 - r.x1) / L;
    const uy = (r.y2 - r.y1) / L;
    const h = RAIL_BED / 2;
    B.strip('railShoulder', r.x1, r.y1, ux, uy, 0, L, -h - 5, h + 5);
    B.strip('ballast', r.x1, r.y1, ux, uy, 0, L, -h, h);
    B.strip('crown', r.x1, r.y1, ux, uy, 0, L, -h + 6, h - 6);
    for (let s = SLEEPER_GAP / 2; s < L; s += SLEEPER_GAP) {
      B.quad('sleeperShade', r.x1, r.y1, ux, uy, s + 0.5, SLEEPER_W + 0.5, SLEEPER_LEN + 0.6);
      B.quad('sleeper', r.x1, r.y1, ux, uy, s, SLEEPER_W, SLEEPER_LEN);
    }
    for (const side of [-1, 1]) {
      B.strip('rail', r.x1, r.y1, ux, uy, 0, L, side * GAUGE - 1.15, side * GAUGE + 1.15);
      B.strip('railTop', r.x1, r.y1, ux, uy, 0, L, side * GAUGE - 0.75, side * GAUGE - 0.05);
    }
  }
  for (const j of roadJunctions(rails.map((r) => ({ ...r, w: RAIL_BED })))) {
    B.disc('railShoulder', j.x, j.y, RAIL_BED / 2 + 5);
    B.disc('ballast', j.x, j.y, RAIL_BED / 2);
  }
  // Feldwege (schmal) und Landwege (breit)
  const dirt = (map.town?.roads ?? []).filter((r) => r.dirt);
  for (const r of dirt) {
    const L = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
    if (L < 1) continue;
    const ux = (r.x2 - r.x1) / L;
    const uy = (r.y2 - r.y1) / L;
    const h = r.w / 2;
    const seed = hashSeg(r);
    const wl = wobble(seed, 1.7);
    const wr = wobble(seed * 7 + 3, 1.7);
    const wide = r.w > 30;
    B.strip('shoulder', r.x1, r.y1, ux, uy, -h, L + h, -h - 4, h + 4, wr, wl);
    B.strip(wide ? 'gravel' : 'dirt', r.x1, r.y1, ux, uy, -h, L + h, -h, h, wr, wl);
    if (wide) {
      // Landweg: je Fahrtrichtung eine breite, dunklere Fahrbahn, in der Mitte loser heller Schotter
      for (const [c, k] of [[-0.25, 0], [0.25, 1]]) {
        const wo = wobble(seed + k * 131, 1.1);
        B.strip('wear', r.x1, r.y1, ux, uy, 0, L, c * r.w - r.w * 0.13, c * r.w + r.w * 0.13, wo, wo);
      }
      const wm = wobble(seed + 977, 0.8);
      B.strip('loose', r.x1, r.y1, ux, uy, 0, L, -r.w * 0.06, r.w * 0.06, wm, wm);
    } else {
      // Feldweg: zwei Fahrspuren, dazwischen Gras
      for (const [c, k] of [[-0.21, 0], [0.21, 1]]) {
        const wo = wobble(seed + k * 131, 0.6);
        B.strip('rut', r.x1, r.y1, ux, uy, 0, L, c * r.w - 2.2, c * r.w + 2.2, wo, wo);
      }
      const wm = wobble(seed + 977, 0.5);
      B.strip('median', r.x1, r.y1, ux, uy, h * 0.4, L - h * 0.4, -r.w * 0.07, r.w * 0.07, wm, wm);
    }
  }
  for (const j of roadJunctions(dirt)) {
    B.disc('shoulder', j.x, j.y, j.r + 4);
    B.disc(j.r > 15 ? 'gravel' : 'dirt', j.x, j.y, j.r);
  }
  return B.chunks;
}

// ---------- Zeichnen ----------

const cache = { key: '', map: null, relief: null, chunks: null, fields: null };

/** Füllfarbe einer Ebene: Muster (an die Bodenebene angepasst) oder einfache Farbe. */
function fillOf(ctx, layer, season, mat, z) {
  const P = PAL[season] ?? PAL.summer;
  const kind = { dirt: 'dirt', gravel: 'gravel', rut: 'rut', wear: 'rut', ballast: 'ballast' }[layer];
  if (kind && z >= 0.5) {
    const pat = patternOf(ctx, kind, season);
    if (pat) {
      if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(mat);
      return pat;
    }
  }
  return {
    shoulder: P.shoulder,
    dirt: P.dirt[0],
    gravel: P.gravel[0],
    rut: P.rut[0],
    wear: P.rut[0],
    loose: P.gravel[4],
    median: P.median,
    railShoulder: P.railShoulder,
    ballast: P.ballast[0],
    crown: P.crown,
    sleeperShade: P.sleeperShade,
    sleeper: P.sleeper,
    rail: P.rail,
    railTop: P.railTop,
  }[layer];
}

// Reihenfolge: Gleisbett und Schwellen, darüber die Wege (Bahnübergang), zuletzt die Schienen
const ORDER = ['railShoulder', 'ballast', 'crown', 'sleeperShade', 'sleeper', 'shoulder', 'dirt', 'gravel', 'wear', 'loose', 'rut', 'median', 'rail', 'railTop'];
const ALPHA = { wear: 0.42, loose: 0.3, rut: 0.85 }; // halbdurchsichtige Ebenen

/**
 * Feldwege und Gleise unter allem anderen (direkt nach dem Boden). Flach (2D, Iso ohne Gelände) unter der gesetzten
 * Welt-Transformation, mit Gelände in Pfadkoordinaten wie die Stadtstraßen (eine Transformation je Bild).
 */
export function drawWays(ren, ctx, season = 'summer') {
  const g = ren.game;
  const map = g.map;
  if (typeof Path2D === 'undefined') return;
  if (!map.town?.roads?.some((r) => r.dirt) && !railList(map.town).length && !map.town?.fields?.length) return;
  const cam = ren.camera;
  const drape = ren.draping();
  const z = cam.zoom;
  let ax = 0;
  let ay = 0;
  let u = null;
  if (drape) {
    const o = cam.worldToScreenFlat(0, 0);
    const e1 = cam.worldToScreenFlat(1000, 0);
    const e2 = cam.worldToScreenFlat(0, 1000);
    ax = o.x;
    ay = o.y;
    u = [(e1.x - o.x) / (1000 * z), (e1.y - o.y) / (1000 * z), (e2.x - o.x) / (1000 * z), (e2.y - o.y) / (1000 * z)];
  }
  const key = drape ? u.map((v) => v.toFixed(5)).join(',') : 'flat';
  if (key !== cache.key || cache.map !== map || cache.relief !== (drape ? cam.relief : null)) {
    cache.key = key;
    cache.map = map;
    cache.relief = drape ? cam.relief : null;
    cache.chunks = buildWays(map, drape ? cam.relief : null, u);
    cache.fields = buildFields(map, drape ? cam.relief : null, u);
  }
  const R = cam.visibleRect();
  const pad = 64;
  const c0 = Math.floor((R.x0 - pad) / CHUNK);
  const c1 = Math.floor((R.x1 + pad) / CHUNK);
  const r0 = Math.floor((R.y0 - pad) / CHUNK);
  const r1 = Math.floor((R.y1 + pad) / CHUNK);
  const shown = [];
  for (const c of cache.chunks.values()) if (c.cx >= c0 && c.cx <= c1 && c.cy >= r0 && c.cy <= r1) shown.push(c);
  ctx.save();
  if (drape) ctx.setTransform(ren.dpr * z, 0, 0, ren.dpr * z, ren.dpr * ax, ren.dpr * ay);
  const sc = TEX / TEX_PX;
  const mat = typeof DOMMatrix !== 'undefined' ? (u ? new DOMMatrix([u[0] * sc, u[1] * sc, u[2] * sc, u[3] * sc, 0, 0]) : new DOMMatrix([sc, 0, 0, sc, 0, 0])) : null;
  drawFieldLayers(ctx, cache.fields, R, season, mat, z); // Äcker und Weiden unter den Wegen (seit v5.44)
  if (!shown.length) {
    ctx.restore();
    return;
  }
  const fine = z >= 0.45; // Schwellen und Glanz nur nah genug
  for (const layer of ORDER) {
    if (!fine && (layer === 'sleeper' || layer === 'sleeperShade' || layer === 'railTop' || layer === 'crown')) continue;
    ctx.fillStyle = fillOf(ctx, layer, season, mat, z);
    ctx.globalAlpha = ALPHA[layer] ?? 1;
    for (const c of shown) {
      const p = c.layers[layer];
      if (p) ctx.fill(p);
    }
  }
  ctx.restore();
}
