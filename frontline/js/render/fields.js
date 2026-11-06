// Äcker und Weiden (seit v5.44, Daniels Wunsch „schaue welche Assets noch nicht verbessert wurden“): scharf je Bild gemalt wie
// Feldwege und Gleise (ways.js) statt unscharf im Geländebild (das sie für Minimap und Karteneditor behält). Äcker je Frucht mit
// Bestandsmuster (Weizen mit Ähren und Mohn, grüne Saat, gepflügte Schollen, blühender Raps), Reihen, Fahrgassen und Vorgewende;
// Weiden mit Grasmuster, Klee, Trampelpfad zum Tor, Zaun aus Pfosten und zwei Latten (in Iso aufrecht) und Stahltor. Ein Feldrain
// deckt den weichen Rand des Geländebilds. Herbst: Weizen als Stoppelfeld mit Strohschwaden, Saat und Raps als junges Grün, Acker
// frisch gepflügt; Winter: Schnee, Furchen, Stoppeln und Grasbüschel schauen heraus, Schnee auf Pfosten und Latten.
// Heu- und Strohballen sind eigene 3D-Körper (props.js), ihre Lage liefert fieldBales. Pfade je Feld in der Kachel seiner Mitte,
// gebaut zusammen mit den Feldwegen (bei anderer Drehung oder anderem Gelände), je Bild nur die sichtbaren Kacheln gefüllt.
// Nur Darstellung, keine Spielregel.

const CHUNK = 1024; // Kachel der Pfade (Weltpixel), wie ways.js
const STEP = 24; // Abtastung entlang (Gelände)
const LINE_STEP = 48; // Abtastung schmaler Linien (Reihen, Fahrgassen), spart Punkte
const BAND = 40; // Flächen in Bändern dieser Breite (Gelände auch quer)
const ROW = 8; // Reihenabstand
const TRAM = 72; // Abstand der Fahrgassen
const TRACK = 7; // Abstand der beiden Spuren einer Fahrgasse
const HEAD = 16; // Vorgewende an beiden Enden
const RAIN = 6; // Feldrain außen (deckt den weichen Rand des Geländebilds)
const POST_GAP = 30; // Pfostenabstand am Zaun
const GATE = 24; // Torbreite
const POST_H = 8.5; // Pfostenhöhe
const RAILS = [3.4, 6.4]; // Höhe der Latten
const TEX = 64; // Weltpixel je Musterkachel
const TEX_PX = 256; // Bildpunkte je Musterkachel
const PAD = 300; // mehr als die halbe Diagonale des größten Felds (Auswahl der Kacheln nach der Feldmitte)
const CROPS = ['wheat', 'green', 'soil', 'rape'];

// ---------- Farben ----------

const COL = {
  summer: {
    rain: 'rgba(98,118,60,0.9)',
    'row:wheat': 'rgba(116,88,34,0.42)',
    'row:green': 'rgba(44,66,24,0.45)',
    'row:soil': 'rgba(52,37,22,0.6)',
    'row:rape': 'rgba(112,124,36,0.38)',
    'ridge:soil': 'rgba(158,128,92,0.5)',
    'tram:wheat': 'rgba(128,102,56,0.85)',
    'tram:green': 'rgba(112,94,62,0.8)',
    'tram:rape': 'rgba(86,104,40,0.85)',
    'edge:wheat': 'rgba(128,104,46,0.8)',
    'edge:green': 'rgba(70,92,40,0.8)',
    'edge:soil': 'rgba(70,52,32,0.8)',
    'edge:rape': 'rgba(150,140,44,0.8)',
    worn: 'rgba(132,116,78,0.4)',
    trail: 'rgba(138,118,80,0.38)',
    patchDark: 'rgba(66,92,42,0.09)',
    patchLight: 'rgba(150,172,98,0.07)',
  },
  autumn: {
    rain: 'rgba(118,114,62,0.9)',
    'row:wheat': 'rgba(150,128,74,0.4)',
    'row:green': 'rgba(86,120,48,0.62)',
    'row:soil': 'rgba(38,26,16,0.62)',
    'row:rape': 'rgba(38,56,24,0.45)',
    'ridge:soil': 'rgba(132,104,74,0.5)',
    'swath:wheat': 'rgba(226,210,150,0.92)',
    'tram:wheat': 'rgba(124,104,66,0.6)',
    'tram:green': 'rgba(70,54,36,0.55)',
    'tram:rape': 'rgba(84,70,46,0.7)',
    'edge:wheat': 'rgba(150,130,80,0.8)',
    'edge:green': 'rgba(78,62,40,0.8)',
    'edge:soil': 'rgba(56,40,26,0.8)',
    'edge:rape': 'rgba(52,70,32,0.8)',
    worn: 'rgba(124,106,70,0.4)',
    trail: 'rgba(128,108,72,0.38)',
    patchDark: 'rgba(92,96,50,0.09)',
    patchLight: 'rgba(172,162,100,0.07)',
  },
  winter: {
    rain: 'rgba(232,237,241,0.88)',
    'row:wheat': 'rgba(150,160,174,0.45)',
    'row:green': 'rgba(140,152,166,0.5)',
    'row:soil': 'rgba(132,128,128,0.55)',
    'row:rape': 'rgba(140,152,166,0.5)',
    'ridge:soil': 'rgba(255,255,255,0.7)',
    'tram:wheat': 'rgba(160,168,180,0.55)',
    'tram:green': 'rgba(160,168,180,0.55)',
    'tram:rape': 'rgba(160,168,180,0.55)',
    'edge:wheat': 'rgba(170,176,186,0.6)',
    'edge:green': 'rgba(170,176,186,0.6)',
    'edge:soil': 'rgba(170,176,186,0.6)',
    'edge:rape': 'rgba(170,176,186,0.6)',
    worn: null, // im Winter keine Tiere auf der Weide: kein Pfad im Schnee
    trail: null,
    patchDark: 'rgba(190,201,212,0.12)',
    patchLight: 'rgba(255,255,255,0.16)',
  },
};
const FENCE = { fenceBase: 'rgba(36,30,18,0.32)', rail: '#8d6e49', gate: '#a3a9ab', post: '#64492f', cap: '#f4f6f8' };

// Musterkachel je Fläche und Jahreszeit, dazu die Farbe weit herausgezoomt (ohne Muster)
const TEX_OF = {
  summer: { wheat: 'wheat', green: 'green', soil: 'soil', rape: 'rape', pasture: 'grass' },
  autumn: { wheat: 'stubble', green: 'sprout', soil: 'soilWet', rape: 'leafy', pasture: 'grassAut' },
  winter: { wheat: 'snowStubble', green: 'snowSprout', soil: 'snowSoil', rape: 'snowLeafy', pasture: 'snowGrass' },
};
const FLAT = {
  wheat: '#c8ad5d',
  green: '#6f8f3f',
  soil: '#6c5339',
  rape: '#d6c43f',
  grass: '#6c8a4a',
  stubble: '#cbb677',
  sprout: '#6a5c3c',
  soilWet: '#5c4632',
  leafy: '#516c35',
  grassAut: '#7b8246',
  snowStubble: '#e6e9ea',
  snowSprout: '#e5e9ec',
  snowSoil: '#e2e5e8',
  snowLeafy: '#e5e9ec',
  snowGrass: '#e6eaed',
};

// ---------- Zufall und Rahmen ----------

/** Zufallszahlen fest je Feld oder Muster. */
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
const seedOf = (f) => (Math.imul(Math.round(f.x) | 0, 73856093) ^ Math.imul(Math.round(f.y) | 0, 19349663) ^ 0x5bd1e995) >>> 0;

/**
 * Rahmen eines Felds: a läuft entlang der Reihen (lange Seite, Länge len), b quer dazu (Breite span), W(a, b) ist der Weltpunkt.
 * B ist A um 90° gedreht (wie die Normale der Wege), damit alle Flächen denselben Umlaufsinn haben.
 */
function frameOf(f) {
  const an = f.angle || 0;
  const c = Math.cos(an);
  const s = Math.sin(an);
  const long = f.w >= f.h;
  const A = long ? [c, s] : [-s, c];
  const B = [-A[1], A[0]];
  return { A, B, len: long ? f.w : f.h, span: long ? f.h : f.w, W: (a, b) => [f.x + A[0] * a + B[0] * b, f.y + A[1] * a + B[1] * b] };
}

// ---------- Ballen ----------

const bales = new WeakMap();

/**
 * Heu- und Strohballen eines Felds (fest je Lage): auf Weiden 1–3 Heuballen, auf Weizenfeldern nach der Ernte (nur Herbst, only)
 * 2–5 Strohballen auf den Schwaden. { x, y, a: Richtung der Achse, kind: 'hay' | 'straw', only? }.
 */
export function fieldBales(f) {
  let list = bales.get(f);
  if (list) return list;
  list = [];
  const r = rng32(seedOf(f) ^ 0x2c1b3c6d);
  const fr = frameOf(f);
  const free = (x, y) => list.every((o) => Math.hypot(o.x - x, o.y - y) > 26);
  if (f.kind === 'pasture') {
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0, tries = 0; k < n && tries < 20; tries++) {
      const [x, y] = fr.W((r() - 0.5) * Math.max(0, fr.len - 60), (r() - 0.5) * Math.max(0, fr.span - 60));
      if (!free(x, y)) continue;
      list.push({ x, y, a: r() * Math.PI, kind: 'hay' });
      k++;
    }
  } else if (f.crop === 'wheat') {
    const n = 2 + Math.floor(r() * 4);
    const swaths = [];
    for (let b = -fr.span / 2 + 14; b < fr.span / 2 - 8; b += 30) swaths.push(b);
    const along = Math.atan2(fr.A[1], fr.A[0]);
    for (let k = 0, tries = 0; k < n && tries < 30 && swaths.length; tries++) {
      const b = swaths[Math.floor(r() * swaths.length)];
      const [x, y] = fr.W((r() - 0.5) * Math.max(0, fr.len - 2 * HEAD - 24), b);
      if (!free(x, y)) continue;
      list.push({ x, y, a: along + (r() - 0.5) * 0.5, kind: 'straw', only: 'autumn' });
      k++;
    }
  }
  bales.set(f, list);
  return list;
}

// ---------- Pfade ----------

/** Sammelt die Pfade je Kachel und Ebene; P projiziert einen Weltpunkt in Pfadkoordinaten, up: Iso mit Höhe (sonst von oben). */
class Builder {
  constructor(P, up) {
    this.P = P;
    this.up = up;
    this.chunks = new Map();
    this.key = '0,0';
  }

  /** Alle folgenden Teile in die Kachel der Feldmitte (die Auswahl beim Zeichnen sucht mit PAD um den Bildausschnitt). */
  at(f) {
    this.key = `${Math.floor(f.x / CHUNK)},${Math.floor(f.y / CHUNK)}`;
  }

  path(layer) {
    let c = this.chunks.get(this.key);
    if (!c) {
      const [cx, cy] = this.key.split(',').map(Number);
      this.chunks.set(this.key, (c = { cx, cy, layers: {} }));
    }
    return (c.layers[layer] ??= new Path2D());
  }

  /** Streifen im Feldrahmen von a0 nach a1, quer von lo bis hi, entlang alle step abgetastet. */
  along(layer, fr, a0, a1, lo, hi, step = STEP) {
    if (a1 - a0 < 0.5 || hi - lo < 0.05) return;
    const path = this.path(layer);
    const n = Math.max(1, Math.ceil((a1 - a0) / step));
    for (let i = 0; i <= n; i++) {
      const [px, py] = this.P(...fr.W(a0 + ((a1 - a0) * i) / n, hi));
      if (i) path.lineTo(px, py);
      else path.moveTo(px, py);
    }
    for (let i = n; i >= 0; i--) {
      const [px, py] = this.P(...fr.W(a0 + ((a1 - a0) * i) / n, lo));
      path.lineTo(px, py);
    }
    path.closePath();
  }

  /** Querstreifen bei a (Breite 2 · hw) von b0 bis b1, gleicher Umlaufsinn wie along. */
  across(layer, fr, a, b0, b1, hw) {
    if (b1 - b0 < 0.5) return;
    const path = this.path(layer);
    const n = Math.max(1, Math.ceil((b1 - b0) / STEP));
    let [px, py] = this.P(...fr.W(a - hw, b1));
    path.moveTo(px, py);
    for (let i = 0; i <= n; i++) {
      [px, py] = this.P(...fr.W(a + hw, b1 - ((b1 - b0) * i) / n));
      path.lineTo(px, py);
    }
    for (let i = 0; i <= n; i++) {
      [px, py] = this.P(...fr.W(a - hw, b0 + ((b1 - b0) * i) / n));
      path.lineTo(px, py);
    }
    path.closePath();
  }

  /** Fläche [a0, a1] × [b0, b1] in Bändern (folgt dem Gelände auch quer). */
  area(layer, fr, a0, a1, b0, b1) {
    const nb = Math.max(1, Math.ceil((b1 - b0) / BAND));
    for (let j = 0; j < nb; j++) this.along(layer, fr, a0, a1, b0 + ((b1 - b0) * j) / nb, b0 + ((b1 - b0) * (j + 1)) / nb);
  }

  /** Streifen entlang der Weltstrecke p → q, quer lo … hi (Normale wie bei den Wegen), mit Abweichung wob(s) der Mitte. */
  seg(layer, p, q, lo, hi, wob = null) {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 0.5) return;
    const ux = (q[0] - p[0]) / L;
    const uy = (q[1] - p[1]) / L;
    const nx = -uy;
    const ny = ux;
    const path = this.path(layer);
    const n = Math.max(1, Math.ceil(L / (wob ? STEP / 2 : STEP)));
    for (let i = 0; i <= n; i++) {
      const s = (L * i) / n;
      const o = hi + (wob ? wob(s) : 0);
      const [px, py] = this.P(p[0] + ux * s + nx * o, p[1] + uy * s + ny * o);
      if (i) path.lineTo(px, py);
      else path.moveTo(px, py);
    }
    for (let i = n; i >= 0; i--) {
      const s = (L * i) / n;
      const o = lo + (wob ? wob(s) : 0);
      const [px, py] = this.P(p[0] + ux * s + nx * o, p[1] + uy * s + ny * o);
      path.lineTo(px, py);
    }
    path.closePath();
  }

  /** Scheibe am Boden (Umlaufsinn wie die Streifen). */
  disc(layer, x, y, r) {
    const path = this.path(layer);
    const n = Math.max(12, Math.min(28, Math.round(r)));
    for (let i = 0; i < n; i++) {
      const a = -(i / n) * Math.PI * 2;
      const [px, py] = this.P(x + Math.cos(a) * r, y + Math.sin(a) * r);
      if (i) path.lineTo(px, py);
      else path.moveTo(px, py);
    }
    path.closePath();
  }

  /** Ellipse am Boden (Halbachsen rx, ry, gedreht um rot), Umlaufsinn wie disc. */
  blob(layer, x, y, rx, ry, rot) {
    const path = this.path(layer);
    const n = 20;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = -(i / n) * Math.PI * 2;
      const ex = Math.cos(a) * rx;
      const ey = Math.sin(a) * ry;
      const [px, py] = this.P(x + ex * c - ey * s, y + ex * s + ey * c);
      if (i) path.lineTo(px, py);
      else path.moveTo(px, py);
    }
    path.closePath();
  }

  /** Viereck aus Pfadpunkten, immer im selben Umlaufsinn (aufrechte Teile derselben Ebene vereinen sich). */
  quad(layer, pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      s += ax * by - bx * ay;
    }
    const q = s < 0 ? pts.slice().reverse() : pts;
    const path = this.path(layer);
    q.forEach(([px, py], i) => (i ? path.lineTo(px, py) : path.moveTo(px, py)));
    path.closePath();
  }

  /** Pfosten am Weltpunkt: in Iso aufrecht von h0 bis h1 (halbe Breite hw im Bild), von oben ein Quadrat. */
  post(layer, x, y, h0, h1, hw) {
    if (!this.up) {
      const r = hw * 1.3;
      this.quad(layer, [this.P(x - r, y - r), this.P(x + r, y - r), this.P(x + r, y + r), this.P(x - r, y + r)]);
      return;
    }
    const [px, py] = this.P(x, y);
    this.quad(layer, [[px - hw, py - h0], [px + hw, py - h0], [px + hw, py - h1], [px - hw, py - h1]]);
  }

  /** Latte von p nach q in Höhe h (Dicke t): in Iso ein schmales Band über dem Boden, von oben ein Strich. */
  rail(layer, p, q, h, t) {
    if (!this.up) {
      this.seg(layer, p, q, -t * 0.6, t * 0.6);
      return;
    }
    const [ax, ay] = this.P(p[0], p[1]);
    const [bx, by] = this.P(q[0], q[1]);
    this.quad(layer, [[ax, ay - h - t / 2], [bx, by - h - t / 2], [bx, by - h + t / 2], [ax, ay - h + t / 2]]);
  }
}

/** Acker: Bestand, Reihen zwischen den Vorgewenden, zwei Querreihen je Vorgewende, Fahrgassen, Schwaden (Weizen), Rand. */
function buildCrop(B, fr, f) {
  const c = CROPS.includes(f.crop) ? f.crop : 'wheat';
  const L2 = fr.len / 2;
  const S2 = fr.span / 2;
  B.area(`base:${c}`, fr, -L2, L2, -S2, S2);
  const a0 = -L2 + HEAD;
  const a1 = L2 - HEAD;
  for (let b = -S2 + ROW / 2; b < S2 - 1; b += ROW) {
    B.along(`row:${c}`, fr, a0, a1, b - 0.8, b + 0.8, LINE_STEP);
    if (c === 'soil' && b + ROW / 2 < S2 - 1.5) B.along('ridge:soil', fr, a0, a1, b + ROW / 2 - 0.9, b + ROW / 2 + 0.9, LINE_STEP);
  }
  for (const e of [-1, 1]) for (const d of [5, 5 + ROW]) B.across(`row:${c}`, fr, e * (L2 - d), -S2 + 3, S2 - 3, 0.8);
  if (c !== 'soil') {
    const ah = L2 - HEAD / 2;
    for (let b = -S2 + TRAM / 2; b < S2 - TRAM / 4; b += TRAM) {
      for (const o of [-TRACK / 2, TRACK / 2]) B.along(`tram:${c}`, fr, -ah, ah, b + o - 1, b + o + 1, LINE_STEP);
    }
    for (const e of [-1, 1]) for (const o of [-TRACK / 2, TRACK / 2]) B.across(`tram:${c}`, fr, e * ah + o, -S2 + HEAD / 2, S2 - HEAD / 2, 1);
  }
  if (c === 'wheat') for (let b = -S2 + 14; b < S2 - 8; b += 30) B.along('swath:wheat', fr, a0 + 4, a1 - 4, b - 2.4, b + 2.4, LINE_STEP);
  B.along(`edge:${c}`, fr, -L2, L2, S2 - 1.6, S2);
  B.along(`edge:${c}`, fr, -L2, L2, -S2, -S2 + 1.6);
  B.across(`edge:${c}`, fr, -L2 + 0.8, -S2, S2, 0.8);
  B.across(`edge:${c}`, fr, L2 - 0.8, -S2, S2, 0.8);
}

/** Weide: Gras, ausgetretene Stelle und Pfad am Tor, Zaun aus Pfosten und zwei Latten, Stahltor mit Strebe. */
function buildPasture(B, fr, f) {
  const r = rng32(seedOf(f));
  const L2 = fr.len / 2;
  const S2 = fr.span / 2;
  B.area('base:pasture', fr, -L2, L2, -S2, S2);
  // große helle und dunkle Stellen je Weide (gegen die Wiederholung des Musters)
  for (let i = 0; i < 9; i++) {
    const rx = 18 + r() * 34;
    const ry = rx * (0.5 + r() * 0.4);
    const rot = r() * Math.PI;
    const [x, y] = fr.W((r() - 0.5) * Math.max(0, fr.len - 2 * rx), (r() - 0.5) * Math.max(0, fr.span - 2 * rx));
    for (let k = 0; k < 3; k++) B.blob(`${i % 2 ? 'patchLight' : 'patchDark'}${k}`, x, y, rx * (1 - k * 0.28), ry * (1 - k * 0.28), rot); // weicher Rand
  }
  const in2 = 2.5;
  const cs = [[-L2 + in2, -S2 + in2], [L2 - in2, -S2 + in2], [L2 - in2, S2 - in2], [-L2 + in2, S2 - in2]];
  const gateSide = Math.floor(r() * 4);
  const gateT = 0.3 + r() * 0.4;
  for (let k = 0; k < 4; k++) {
    const [a0, b0] = cs[k];
    const [a1, b1] = cs[(k + 1) % 4];
    const len = Math.hypot(a1 - a0, b1 - b0);
    const at = (t) => fr.W(a0 + ((a1 - a0) * t) / len, b0 + ((b1 - b0) * t) / len);
    let runs = [[0, len]];
    if (k === gateSide) {
      const gc = gateT * len;
      const g0 = gc - GATE / 2;
      const g1 = gc + GATE / 2;
      runs = [[0, g0], [g1, len]];
      // Tor: zwei kräftige Pfosten, drei Rohre und eine Strebe; davor ausgetretene Erde und ein Pfad in die Weide
      const p = at(g0);
      const q = at(g1);
      for (const h of [2.6, 4.8, 7]) B.rail('gate', p, q, h, 0.8);
      if (B.up) {
        const [ax, ay] = B.P(p[0], p[1]);
        const [bx, by] = B.P(q[0], q[1]);
        B.quad('gate', [[ax, ay - 2.2], [ax, ay - 3.2], [bx, by - 7.4], [bx, by - 6.4]]);
      }
      for (const t of [g0, g1]) {
        const [x, y] = at(t);
        B.post('post', x, y, 0, POST_H + 0.8, 1.25);
        B.post('cap', x, y, POST_H + 0.6, POST_H + 1.6, 1.25);
      }
      const [gx, gy] = at(gc);
      const dx = f.x - gx;
      const dy = f.y - gy;
      const dl = Math.hypot(dx, dy) || 1;
      const ux = dx / dl;
      const uy = dy / dl;
      B.disc('worn', gx + ux * 14, gy + uy * 14, 13);
      const reach = Math.min(dl * 0.9, 40 + r() * 70);
      const p1 = r() * 997;
      const wob = (s) => 2.2 * Math.sin(s * 0.045 + p1);
      B.seg('trail', [gx + ux * 6, gy + uy * 6], [gx + ux * reach, gy + uy * reach], -3, 3, wob);
    }
    for (const [t0, t1] of runs) {
      if (t1 - t0 < 2) continue;
      B.seg('fenceBase', at(t0), at(t1), -0.9, 0.9);
      const m = Math.max(1, Math.round((t1 - t0) / POST_GAP));
      for (let i = 0; i < m; i++) {
        const p = at(t0 + ((t1 - t0) * i) / m);
        const q = at(t0 + ((t1 - t0) * (i + 1)) / m);
        for (const h of RAILS) B.rail('rail', p, q, h, 0.95);
        if (B.up) B.rail('cap', p, q, RAILS[1] + 0.85, 0.6);
      }
      for (let i = 0; i <= m; i++) {
        const [x, y] = at(t0 + ((t1 - t0) * i) / m);
        B.post('post', x, y, 0, POST_H, 0.85);
        B.post('cap', x, y, POST_H - 0.2, POST_H + 0.8, 0.85);
      }
    }
  }
}

/**
 * Alle Pfade der Äcker und Weiden einer Karte (relief und u wie buildWays: mit Gelände in Pfadkoordinaten, sonst flach in
 * Weltkoordinaten). Gibt die Kacheln { cx, cy, layers } zurück.
 */
export function buildFields(map, relief, u) {
  const up = !!(u && relief);
  const P = up ? (x, y) => [x * u[0] + y * u[2], x * u[1] + y * u[3] - relief.displayAt(x, y)] : (x, y) => [x, y];
  const B = new Builder(P, up);
  for (const f of map.town?.fields ?? []) {
    if (!(f.w > 4 && f.h > 4)) continue;
    const fr = frameOf(f);
    B.at(f);
    // Rain nur als Rahmen (3 px unter die Fläche): die Mitte deckt die Grundfläche ohnehin, so wird sie nicht doppelt gefüllt
    const L = fr.len / 2;
    const S = fr.span / 2;
    B.area('rain', fr, -L - RAIN, L + RAIN, -S - RAIN, -S + 3);
    B.area('rain', fr, -L - RAIN, L + RAIN, S - 3, S + RAIN);
    B.area('rain', fr, -L - RAIN, -L + 3, -S + 3, S - 3);
    B.area('rain', fr, L - 3, L + RAIN, -S + 3, S - 3);
    if (f.kind === 'pasture') buildPasture(B, fr, f);
    else buildCrop(B, fr, f);
  }
  return B.chunks;
}

// ---------- Muster ----------

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

/** Weiche helle und dunkle Stellen im Bestand. */
function patches(g, r, cols, n, r0, r1, a0, a1) {
  for (let i = 0; i < n; i++) {
    const x = r() * TEX_PX;
    const y = r() * TEX_PX;
    const rr = r0 + r() * (r1 - r0);
    const e = 0.55 + r() * 0.4;
    const rot = r() * Math.PI;
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.globalAlpha = a0 + r() * (a1 - a0);
    wrap(x, y, rr, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, rr, rr * e, rot, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.globalAlpha = 1;
}

/** Körner, Blüten, Blätter: kleine Ellipsen (Halbachsen s0 … s1, flach e). */
function grains(g, r, cols, n, s0, s1, e, alpha) {
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const x = r() * TEX_PX;
    const y = r() * TEX_PX;
    const rr = s0 + r() * (s1 - s0);
    const rot = r() * Math.PI;
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    wrap(x, y, rr, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, rr, rr * e, rot, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.globalAlpha = 1;
}

/** Halme und Grasblätter: kurze Striche (Länge l0 … l1, Breite w). */
function blades(g, r, cols, n, l0, l1, w, alpha) {
  g.globalAlpha = alpha;
  g.lineWidth = w;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r() * TEX_PX;
    const y = r() * TEX_PX;
    const l = l0 + r() * (l1 - l0);
    const a = r() * Math.PI * 2;
    const dx = Math.cos(a) * l;
    const dy = Math.sin(a) * l;
    g.strokeStyle = cols[Math.floor(r() * cols.length)];
    wrap(x, y, l, (px, py) => {
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + dx, py + dy);
      g.stroke();
    });
  }
  g.globalAlpha = 1;
}

/** Erdschollen mit Licht von links oben und Schatten rechts unten. */
function clods(g, r, cols, n, s0, s1, alpha = 1) {
  for (let i = 0; i < n; i++) {
    const x = r() * TEX_PX;
    const y = r() * TEX_PX;
    const rr = s0 + r() * (s1 - s0);
    const e = 0.55 + r() * 0.35;
    const rot = r() * Math.PI;
    const col = cols[Math.floor(r() * cols.length)];
    wrap(x, y, rr + 2, (px, py) => {
      g.globalAlpha = 0.3 * alpha;
      g.fillStyle = '#000000';
      g.beginPath();
      g.ellipse(px + rr * 0.35, py + rr * 0.4, rr, rr * e, rot, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = alpha;
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(px, py, rr, rr * e, rot, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.22 * alpha;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(px - rr * 0.25, py - rr * 0.25, rr * 0.45, rr * e * 0.4, rot, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.globalAlpha = 1;
}

const SNOW = ['#dfe6eb', '#f5f8fa', '#d3dce3', '#ecf0f3'];

/** Schneedecke: weiche bläuliche Mulden und Glitzer. */
function snowBase(g, r) {
  patches(g, r, SNOW, 34, 10, 30, 0.12, 0.26);
  grains(g, r, ['#ffffff', '#cfd8df'], 900, 0.6, 1.3, 0.8, 0.5);
}

// Musterkacheln: Grundfarbe und Malfunktion (Kachel 256 Bildpunkte = 64 Weltpixel)
const PAINTERS = {
  wheat: ['#c8ad5d', (g, r) => {
    patches(g, r, ['#b99d4c', '#d6bd6e', '#ab8f44', '#dcc37a'], 28, 14, 40, 0.18, 0.34);
    grains(g, r, ['#d9c070', '#b89b4a', '#e3cd84', '#a88c40'], 3200, 1.5, 2.6, 0.55, 0.75);
    grains(g, r, ['#8a6f30', '#7a6029'], 900, 0.7, 1.2, 0.8, 0.5);
    grains(g, r, ['#c0392b', '#d24b33'], 9, 1.4, 2, 0.9, 0.95); // Mohn
    grains(g, r, ['#4a6fd0'], 4, 1.2, 1.6, 0.9, 0.9); // Kornblumen
  }],
  green: ['#6f8f3f', (g, r) => {
    patches(g, r, ['#62803a', '#7e9d48', '#577334', '#8aa852'], 26, 14, 40, 0.18, 0.32);
    blades(g, r, ['#7fa04a', '#5f7d34', '#8cab55', '#567230', '#9bb862'], 3000, 3, 7, 1.3, 0.7);
  }],
  soil: ['#6e553a', (g, r) => {
    patches(g, r, ['#5f4930', '#7a5f41', '#54402b', '#86694a'], 24, 14, 40, 0.2, 0.35);
    grains(g, r, ['#5b4630', '#83664a', '#4d3b28'], 2200, 0.6, 1.2, 0.8, 0.5);
    clods(g, r, ['#7a5f42', '#6a5139', '#866a4c', '#5d472f'], 520, 2, 4.5);
  }],
  rape: ['#d8c63e', (g, r) => {
    patches(g, r, ['#cbb734', '#e4d457', '#b9a82f', '#c2b23a'], 26, 14, 40, 0.18, 0.32);
    grains(g, r, ['#7e8f36', '#6d7f2f'], 700, 1, 1.8, 0.7, 0.6);
    grains(g, r, ['#f0e06a', '#e8d24a', '#f6ea86', '#d9c43a'], 3800, 1, 1.9, 0.85, 0.85);
  }],
  grass: ['#6c8a4a', (g, r) => {
    patches(g, r, ['#62803f', '#799650', '#587339', '#86a05b'], 30, 10, 30, 0.12, 0.22);
    blades(g, r, ['#7a9852', '#5d7a3c', '#87a45d', '#52703a'], 2600, 2.5, 5.5, 1.1, 0.6);
    grains(g, r, ['#4f6a33', '#46602e'], 46, 3, 5.5, 0.7, 0.4); // Büschel
    grains(g, r, ['#f2f2ea'], 26, 1, 1.4, 0.9, 0.9); // Klee
    grains(g, r, ['#e8d84a'], 16, 0.9, 1.3, 0.9, 0.9); // Löwenzahn
  }],
  stubble: ['#cbb677', (g, r) => {
    patches(g, r, ['#c0aa68', '#d8c588', '#b29c5c', '#e2d199'], 26, 14, 40, 0.2, 0.34);
    blades(g, r, ['#e6d59f', '#d9c78c'], 700, 3, 7, 1, 0.7); // Stroh
    grains(g, r, ['#8f7a45', '#7d6a3c', '#a08a52'], 2600, 0.7, 1.3, 0.8, 0.75); // Stoppeln
  }],
  sprout: ['#6a5a3c', (g, r) => {
    patches(g, r, ['#5f4f34', '#76654a', '#55462e'], 22, 14, 40, 0.2, 0.34);
    clods(g, r, ['#74624a', '#665640', '#7f6c52'], 260, 1.5, 3.2);
    blades(g, r, ['#6f9440', '#5f8338', '#7ea54b'], 1400, 1.5, 3.5, 1.1, 0.8);
  }],
  soilWet: ['#5c4632', (g, r) => {
    patches(g, r, ['#4f3c2a', '#6a523b', '#463525'], 24, 14, 40, 0.2, 0.36);
    grains(g, r, ['#4b3a29', '#6e5640'], 2000, 0.6, 1.2, 0.8, 0.5);
    clods(g, r, ['#6a523b', '#5c4733', '#76604a', '#523f2d'], 560, 2, 4.8);
  }],
  leafy: ['#516c35', (g, r) => {
    patches(g, r, ['#5a4a32', '#4a6331', '#5f7a3a'], 22, 14, 40, 0.2, 0.34);
    grains(g, r, ['#5f8a3c', '#6c9a45', '#47622d', '#78a64e'], 760, 2.5, 4.5, 0.6, 0.9);
    grains(g, r, ['#3b5426'], 300, 0.8, 1.4, 0.8, 0.6);
  }],
  grassAut: ['#7b8246', (g, r) => {
    patches(g, r, ['#868a4c', '#6e753e', '#949553', '#686f3b'], 30, 10, 30, 0.12, 0.22);
    blades(g, r, ['#8e9152', '#6c733d', '#a29c5c', '#79803f'], 2400, 2.5, 5.5, 1.1, 0.6);
    grains(g, r, ['#5d6534'], 40, 3, 5.5, 0.7, 0.4);
  }],
  snowStubble: ['#e9edef', (g, r) => {
    snowBase(g, r);
    grains(g, r, ['#a89a72', '#8f8260', '#b8ab84'], 700, 0.6, 1.1, 0.8, 0.75);
  }],
  snowSprout: ['#e8ecef', (g, r) => {
    snowBase(g, r);
    grains(g, r, ['#7a8f58', '#6a7f4c'], 260, 0.6, 1.2, 0.8, 0.7);
    grains(g, r, ['#8c7b62'], 160, 0.6, 1.1, 0.8, 0.6);
  }],
  snowSoil: ['#e4e8eb', (g, r) => {
    snowBase(g, r);
    clods(g, r, ['#8a7762', '#7a6854', '#968470'], 220, 1.2, 2.6, 0.55);
  }],
  snowLeafy: ['#e8ecef', (g, r) => {
    snowBase(g, r);
    grains(g, r, ['#5f7a45', '#6e8a50'], 240, 1.2, 2.4, 0.6, 0.7);
  }],
  snowGrass: ['#e9edf0', (g, r) => {
    snowBase(g, r);
    blades(g, r, ['#7d8f5c', '#6d7f50', '#8f9a6a'], 600, 1.5, 3.5, 0.9, 0.6);
  }],
};

const patterns = new Map();

function patternOf(ctx, kind) {
  if (patterns.has(kind)) return patterns.get(kind);
  const spec = PAINTERS[kind];
  let pat = null;
  const c = spec ? makeCanvas(TEX_PX, TEX_PX) : null;
  if (c && ctx.createPattern) {
    const g = c.getContext('2d');
    g.fillStyle = spec[0];
    g.fillRect(0, 0, TEX_PX, TEX_PX);
    let seed = 0;
    for (const ch of kind) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    spec[1](g, rng32(seed));
    pat = ctx.createPattern(c, 'repeat');
  }
  patterns.set(kind, pat);
  return pat;
}

// ---------- Zeichnen ----------

const ORDER = [
  'rain',
  ...CROPS.map((c) => `base:${c}`),
  'base:pasture',
  'patchDark0',
  'patchDark1',
  'patchDark2',
  'patchLight0',
  'patchLight1',
  'patchLight2',
  'worn',
  'trail',
  ...CROPS.map((c) => `row:${c}`),
  'ridge:soil',
  'swath:wheat',
  ...CROPS.filter((c) => c !== 'soil').map((c) => `tram:${c}`),
  ...CROPS.map((c) => `edge:${c}`),
  'fenceBase',
  'rail',
  'gate',
  'post',
  'cap',
];
const FINE = /^(row|ridge|tram|trail|rail|gate|post|cap|fenceBase)/; // erst ab mittlerem Zoom

/** Füllung einer Ebene: Muster (an die Bodenebene angepasst) oder Farbe; null = in dieser Jahreszeit nicht zeichnen. */
function fillOf(ctx, layer, season, mat, z) {
  if (layer === 'swath:wheat' && season !== 'autumn') return null;
  if (layer === 'cap' && season !== 'winter') return null;
  const [kind, what] = layer.split(':');
  if (kind === 'base') {
    const tex = (TEX_OF[season] ?? TEX_OF.summer)[what];
    if (z >= 0.3) {
      const pat = patternOf(ctx, tex);
      if (pat) {
        if (mat && pat.setTransform) pat.setTransform(mat);
        return pat;
      }
    }
    return FLAT[tex];
  }
  const key = /^patch(Dark|Light)\d$/.test(layer) ? layer.slice(0, -1) : layer; // drei Ringe je Fleck, gleiche Farbe
  return FENCE[key] ?? (COL[season] ?? COL.summer)[key] ?? null;
}

/**
 * Äcker und Weiden der sichtbaren Kacheln (R: sichtbarer Weltausschnitt). Die Transformation setzt drawWays (flach unter der
 * Welt-Transformation oder in Pfadkoordinaten mit Gelände); mat legt die Muster auf die Bodenebene.
 */
export function drawFieldLayers(ctx, chunks, R, season, mat, z) {
  if (!chunks?.size) return;
  const c0 = Math.floor((R.x0 - PAD) / CHUNK);
  const c1 = Math.floor((R.x1 + PAD) / CHUNK);
  const r0 = Math.floor((R.y0 - PAD) / CHUNK);
  const r1 = Math.floor((R.y1 + PAD) / CHUNK);
  const shown = [];
  for (const c of chunks.values()) if (c.cx >= c0 && c.cx <= c1 && c.cy >= r0 && c.cy <= r1) shown.push(c);
  if (!shown.length) return;
  const fine = z >= 0.4;
  ctx.globalAlpha = 1;
  for (const layer of ORDER) {
    if (!fine && FINE.test(layer)) continue;
    let any = false;
    for (const c of shown) if (c.layers[layer]) any = true;
    if (!any) continue;
    const fill = fillOf(ctx, layer, season, mat, z);
    if (!fill) continue;
    ctx.fillStyle = fill;
    for (const c of shown) {
      const p = c.layers[layer];
      if (p) ctx.fill(p);
    }
  }
}
