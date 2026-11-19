// Simfurt – Leben auf der Karte (L1): S-Bahnen, Boote, Fußgänger, Löschzüge, Rauch und Flammen.
// Reine Optik: liest den Spielstand (s) und ändert ihn nie. Zufall über Math.random (die Simulation bleibt unberührt).
// Wegfindung: Züge und Löschzüge per BFS (pro Ereignis), Boote und Fußgänger als Zufallswege ohne Umkehr.
import { T_WATER, T_TREES, Z_C, Z_B, Z_I, BUILD } from './data.js';
import { railComponents } from './sim.js';

/** Optik-Werte: Geschwindigkeiten (Kacheln/s bzw. px/s), Anzahlen, Zeiten. */
export const LIFE = {
  trainMax: 8, trainSpeed: [2.2, 2.9], trainDwell: [1.2, 2.6], trainWagons: [2, 3],
  boatMax: 6, boatWater: 30, boatSpeed: [0.45, 0.7],
  pedMax: 80, pedPerPop: 50, pedSpeed: [0.28, 0.42], pedLeash: 4, pedMinZoom: 0.7,
  truckSpeed: 2.4, truckPathMax: 400,
  partMax: 400, scanEvery: 2.5, fireScanEvery: 0.5,
};

const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
const PED_COL = ['#2d3e50', '#c0392b', '#f39c12', '#8e44ad', '#16a085', '#ecf0f1', '#34495e', '#d35400'];
const CAR_RED = '#d03a2e', TRAIN_BODY = '#f2f4f5', TRAIN_STRIPE = '#d23a2e', TRAIN_WIN = '#2b3a4d';
const PUFF_NAMES = ['smoke', 'dust', 'dark', 'flame', 'core'];   // Partikelart → Sprite (Index = p.kind)
const PUFF_CORE = [0.85, 0.8, 0.9, 0.95, 1];                     // Deckkraft der Sprite-Mitte je Art

// ---------------------------------------------------------------- Sprites und Zeichenhilfen (gecacht)
const COLORS = {
  warm: [255, 196, 110], white: [240, 246, 255], red: [255, 60, 50], green: [90, 255, 130], blue: [70, 140, 255],
  flame: [255, 150, 40], smoke: [200, 200, 206], dust: [196, 176, 138], dark: [62, 60, 62], core: [255, 236, 150],
};
const sprCache = new Map();
/** Weicher radialer Fleck in Farbe name; a0 = Deckkraft in der Mitte. Einmal erzeugt, gecacht. */
function spr(key, name, a0) {
  let c = sprCache.get(key); if (c) return c;
  const [r, gg, b] = COLORS[name];
  c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, `rgba(${r},${gg},${b},${a0})`); gr.addColorStop(0.45, `rgba(${r},${gg},${b},${a0 * 0.4})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  sprCache.set(key, c); return c;
}
/** Lichtfleck für die Nacht-Lichtebene lg (additiv). */
function light(lg, name, sx, sy, w, h, alpha) {
  lg.globalCompositeOperation = 'lighter'; lg.globalAlpha = alpha;
  lg.drawImage(spr('g' + name, name, 0.9), sx - w / 2, sy - h / 2, w, h);
  lg.globalAlpha = 1;
}
/** Kachelkoordinaten (float) → Bildschirm-Weltkoordinaten; ersten Punkt mit moveTo, sonst lineTo. */
function pt(g, x, y, first) {
  const sx = (x - y) * 32, sy = (x + y) * 16;
  if (first) g.moveTo(sx, sy); else g.lineTo(sx, sy);
}
/** Viereck in Kachelkoordinaten, gefüllt. */
function quad(g, x0, y0, x1, y1, x2, y2, x3, y3, fill) {
  g.beginPath(); pt(g, x0, y0, true); pt(g, x1, y1); pt(g, x2, y2); pt(g, x3, y3); g.closePath();
  g.fillStyle = fill; g.fill();
}
/** Streifen um Mitte (cx,cy) entlang Richtung (dx,dy), Halblänge L, quer von o0 bis o1 (Kachelanteile). */
function band(g, cx, cy, dx, dy, L, o0, o1, fill) {
  const px = -dy, py = dx;
  quad(g, cx + dx * L + px * o0, cy + dy * L + py * o0, cx + dx * L + px * o1, cy + dy * L + py * o1,
    cx - dx * L + px * o1, cy - dy * L + py * o1, cx - dx * L + px * o0, cy - dy * L + py * o0, fill);
}

// ---------------------------------------------------------------- Pfad-Position (ohne Allokation)
/** Ergebnis von pathPos: Kachelmitte (float) und Richtung (Einheitsschritt der Kachel). */
const SC = { x: 0, y: 0, dx: 1, dy: 0 };
/** Position auf dem Pfad Q (Kachelindizes) bei Bogenlänge a (1 = eine Kachel); schreibt in SC. */
function pathPos(Q, a, n) {
  const len = Q.length;
  if (len < 2) { const p = Q[0], x = p % n; SC.x = x + 0.5; SC.y = (p - x) / n + 0.5; SC.dx = 1; SC.dy = 0; return; }
  let k = Math.floor(a); if (k < 0) k = 0; else if (k > len - 2) k = len - 2;
  let f = a - k; if (f < 0) f = 0; else if (f > 1) f = 1;
  const p0 = Q[k], p1 = Q[k + 1];
  const x0 = p0 % n, y0 = (p0 - x0) / n, x1 = p1 % n, y1 = (p1 - x1) / n;
  SC.x = x0 + 0.5 + (x1 - x0) * f; SC.y = y0 + 0.5 + (y1 - y0) * f; SC.dx = x1 - x0; SC.dy = y1 - y0;
}
/** Feld benachbarter Kachel j, das zum Gebäude b gehört, aber nicht belegt ist (Gleis/Straße am Bahnhof/Wache). */
function adjTile(s, b, arr, n) {
  for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) {
    for (let k = 0; k < 4; k++) {
      const X = xx + DX[k], Y = yy + DY[k];
      if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
      const j = Y * n + X;
      if (arr[j] && !s.occ[j]) return j;
    }
  }
  return -1;
}
/** Hat ein Zonen-Nachbar Gewerbe oder Bank (Stufe ≥ 1) im Umkreis 2? Dann ist die Straßenkachel Fußgänger-Startpunkt. */
function commerceNear(s, j, n) {
  const x = j % n, y = (j - x) / n;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const X = x + dx, Y = y + dy;
    if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
    const k = Y * n + X;
    if (s.lvl[k] && (s.zone[k] === Z_C || s.zone[k] === Z_B)) return true;
  }
  return false;
}

export class Life {
  constructor() {
    this.vw = { x0: 0, y0: 0, x1: 1e9, y1: 1e9, zoom: 1 };      // sichtbarer Kachelbereich (vom letzten Frame)
    this.pool = [];
    for (let k = 0; k < LIFE.partMax; k++) this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, r0: 1, r1: 1, al: 0, kind: 0 });
    this.pIdx = 0; this.puffImgs = null;
    this.s = null; this.n = 0; this.NN = 0; this.fireN = 0; this.fireList = null;
    this.reset();
  }

  /** Neue Karte / neuer Spielstand: alle Fahrzeuge, Fußgänger und Partikel weg (wird beim Start einer Stadt gerufen). */
  reset() {
    this.s = null;
    this.t = 0; this.wind = 0;
    this.trains = []; this.boats = []; this.peds = []; this.pedN = 0; this.trucks = [];
    this.scanT = 0; this.fireT = 0; this.fireN = 0;
    for (const p of this.pool) p.life = 0;
    this.pIdx = 0;
  }

  /** Sichtbereich für die Zeichnung setzen; gibt das wiederverwendete Objekt zurück. */
  view(x0, y0, x1, y1, zoom) {
    const v = this.vw; v.x0 = x0; v.y0 = y0; v.x1 = x1; v.y1 = y1; v.zoom = zoom; return v;
  }

  /** Kartenbezogene Zustände neu aufbauen (Karte/Spielstand gewechselt). Gelände ist fest, daher Wasser nur hier. */
  init(s) {
    const NN = s.terrain.length, n = Math.round(Math.sqrt(NN));
    this.s = s; this.n = n; this.NN = NN;
    this.visit = new Uint32Array(NN); this.gen = 0;
    this.prev = new Int32Array(NN); this.q = new Int32Array(NN);
    this.park = new Uint8Array(NN); this.stationSet = new Uint8Array(NN);
    this.fireAcc = new Float32Array(NN); this.fireList = new Int32Array(NN); this.fireN = 0;
    this.anchors = []; this.ems = []; this.netAll = []; this.stationsActive = 0;
    this.trains = []; this.boats = []; this.peds = []; this.pedN = 0; this.trucks = [];
    // Zusammenhängende Wasserflächen (Nummer je Kachel, −1 = kein Wasser)
    this.water = new Int32Array(NN).fill(-1); this.waterSize = []; this.waterTotal = 0;
    const q = this.q; let c = 0;
    for (let i0 = 0; i0 < NN; i0++) {
      if (s.terrain[i0] !== T_WATER || this.water[i0] >= 0) continue;
      let h = 0, t = 0; q[t++] = i0; this.water[i0] = c;
      while (h < t) {
        const i = q[h++], x = i % n, y = (i - x) / n;
        for (let k = 0; k < 4; k++) {
          if (k === 0 && x === 0 || k === 1 && x === n - 1 || k === 2 && y === 0 || k === 3 && y === n - 1) continue;
          const j = i + (k === 0 ? -1 : k === 1 ? 1 : k === 2 ? -n : n);
          if (s.terrain[j] === T_WATER && this.water[j] < 0) { this.water[j] = c; q[t++] = j; }
        }
      }
      this.waterSize.push(t); c++;
    }
    for (let k = 0; k < c; k++) if (this.waterSize[k] >= LIFE.boatWater) this.waterTotal += this.waterSize[k];
    this.scanT = 0; this.fireT = 0;   // sofort abtasten
  }

  /** Ein Schritt (dt in Sekunden). Läuft auch bei Pause (Optik). */
  step(s, dt) {
    if (s !== this.s || s.terrain.length !== this.NN) this.init(s);
    this.t += dt;
    this.wind = 4 + 3 * Math.sin(this.t * 0.2);
    if ((this.scanT -= dt) <= 0) { this.scanT = LIFE.scanEvery; this.scan(s); }
    if ((this.fireT -= dt) <= 0) { this.fireT = LIFE.fireScanEvery; this.scanFire(s); }
    this.stepTrains(s, dt);
    this.stepTrucks(s, dt);
    this.stepBoats(s, dt);
    this.stepPeds(s, dt);
    this.emit(s, dt);
    this.stepParticles(dt);
  }

  // ------------------------------------------------------------ Abtastung (alle paar Sekunden, nicht pro Frame)
  scan(s) {
    const n = this.n, NN = this.NN;
    // Gleisnetze: Bahnhöfe, Netze mit ≥ 2 Bahnhöfen (oder Anschluss am Kartenrand) sind aktiv
    this.netAll = []; this.stationsActive = 0; this.stationSet.fill(0);
    const rails = s.bld.filter((b) => BUILD[b.type].kind === 'rail');
    if (rails.length) {
      const rn = railComponents(s);
      const cnt = new Int32Array(rn.count), stations = [];
      for (const b of rails) {
        const j = adjTile(s, b, s.rail, n);
        if (j >= 0) { stations.push(j); cnt[rn.comp[j]]++; }
      }
      const active = new Uint8Array(rn.count);
      for (let c = 0; c < rn.count; c++) active[c] = cnt[c] >= 2 || (rn.touchesEdge[c] && cnt[c] >= 1) ? 1 : 0;
      for (const j of stations) {
        this.stationSet[j] = 1;
        if (active[rn.comp[j]]) { this.netAll.push(j); this.stationsActive++; }
      }
      // Kartenrand-Gleisenden aktiver Netze: Wendepunkte für Züge (Anschluss an Nachbarstädte)
      for (let j = 0; j < NN; j++) {
        if (!s.rail[j]) continue;
        const c = rn.comp[j];
        if (!active[c] || !rn.touchesEdge[c]) continue;
        const x = j % n, y = (j - x) / n;
        if (x === 0 || y === 0 || x === n - 1 || y === n - 1) this.netAll.push(j);
      }
      if (this.netAll.length < 2) this.netAll = [];
    }
    // Feuerwachen mit Zufahrt: Straßenkachel am Gebäude; Löschzug je Wache
    const old = new Map();
    for (const k of this.trucks) old.set(k.bid, k);
    this.trucks = [];
    for (const b of s.bld) {
      if (BUILD[b.type].kind !== 'fire') continue;
      const entry = adjTile(s, b, s.road, n);
      if (entry < 0) continue;
      let k = old.get(b.id);
      if (!k) k = { bid: b.id, on: false, Q: [], s: 0, state: 0, dest: -1, entry };
      k.entry = entry; this.trucks.push(k);
    }
    // Begehbare Flächen: Parks und Wahrzeichen (Fußgänger zeichnen dort in der Luftebene)
    this.park.fill(0); this.anchors = [];
    for (const b of s.bld) {
      const k = BUILD[b.type];
      if (k.kind !== 'park' && k.cat !== 'land') continue;
      for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) {
        const j = yy * n + xx; this.park[j] = 1; this.anchors.push(j);
      }
    }
    // Straßen bei Gewerbe/Banken als Startpunkte
    for (let j = 0; j < NN; j++) if (s.road[j] && commerceNear(s, j, n)) this.anchors.push(j);
    // Rauchquellen: Industrie Stufe ≥ 2, Gaskraftwerk, Müllverbrennung, Deponie (Staub)
    this.ems = [];
    for (let j = 0; j < NN; j++) {
      if (s.zone[j] === Z_I && s.lvl[j] >= 2 && !s.occ[j]) {
        const x = j % n, y = (j - x) / n;
        this.ems.push({ x: x + 0.72, y: y + 0.26, z: s.lvl[j] >= 3 ? 46 : 34, rate: 0.45, acc: 0, dust: 0 });
      }
    }
    for (const b of s.bld) {
      if (b.type === 'gas') this.ems.push({ x: b.x + 1.62, y: b.y + 1.47, z: 58, rate: 1.0, acc: 0, dust: 0 });
      else if (b.type === 'incin') this.ems.push({ x: b.x + 1.6, y: b.y + 1.0, z: 66, rate: 0.8, acc: 0, dust: 0 });
      else if (b.type === 'dump') this.ems.push({ x: b.x + 1.5, y: b.y + 1.5, z: 20, rate: 0.3, acc: 0, dust: 1 });
    }
  }

  /** Brandliste (alle 0,5 s) und Löschzug-Einsätze: je Wache höchstens ein Fahrzeug unterwegs. */
  scanFire(s) {
    const n = this.n, NN = this.NN, fl = this.fireList;
    let c = 0;
    for (let j = 0; j < NN; j++) if (s.fire[j]) fl[c++] = j;
    this.fireN = c;
    for (const k of this.trucks) {
      if (k.on || c === 0) continue;
      const ex = k.entry % n, ey = (k.entry - ex) / n;
      let best = -1, bd = 1e9;
      for (let m = 0; m < c; m++) {
        const j = fl[m];
        if (this.fireCovered(j)) continue;
        const jx = j % n, d = Math.abs(jx - ex) + Math.abs((j - jx) / n - ey);
        if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) continue;
      const path = this.bfsPath(s, s.road, k.entry, -1, LIFE.truckPathMax, best);
      if (!path) continue;
      k.on = true; k.Q = path; k.s = 0; k.state = 0; k.dest = path[path.length - 1];
    }
  }
  /** Brand im Umkreis 2 bereits von einem Löschzug belegt? */
  fireCovered(j) {
    const n = this.n, x = j % n, y = (j - x) / n;
    for (const k of this.trucks) {
      if (!k.on || k.state === 2) continue;
      const dx = k.dest % n, dy = (k.dest - dx) / n;
      if (Math.abs(dx - x) <= 2 && Math.abs(dy - y) <= 2) return true;
    }
    return false;
  }
  /** Brand im Umkreis r um Kachel d? */
  fireNear(d, r) {
    const n = this.n, dx = d % n, dy = (d - dx) / n;
    for (let m = 0; m < this.fireN; m++) {
      const j = this.fireList[m], jx = j % n, jy = (j - jx) / n;
      if (Math.abs(jx - dx) <= r && Math.abs(jy - dy) <= r) return true;
    }
    return false;
  }

  /**
   * Breitensuche. arr = begehbare Kacheln (s.rail/s.road). Ziel: Kachel `to` (exakt) oder, bei fire ≥ 0,
   * die Kachel mit kleinster Entfernung zum Brand (höchstens `limit` Schritte). Gibt Pfad from…end oder null.
   */
  bfsPath(s, arr, from, to, limit, fire) {
    const n = this.n, vis = this.visit, prev = this.prev, q = this.q, g = ++this.gen;
    const fx = fire >= 0 ? fire % n : 0, fy = fire >= 0 ? (fire - fx) / n : 0;
    let h = 0, t = 0, end = -1, bestD = 1e9;
    q[t++] = from; vis[from] = g; prev[from] = -1;
    while (h < t) {
      const i = q[h++], x = i % n, y = (i - x) / n;
      if (fire >= 0) {
        const d = Math.abs(x - fx) + Math.abs(y - fy);
        if (d < bestD) { bestD = d; end = i; }
        if (d <= 1 || h >= limit) break;
      } else if (i === to) { end = i; break; }
      for (let k = 0; k < 4; k++) {
        let j;
        if (k === 0) { if (x === 0) continue; j = i - 1; }
        else if (k === 1) { if (x === n - 1) continue; j = i + 1; }
        else if (k === 2) { if (y === 0) continue; j = i - n; }
        else { if (y === n - 1) continue; j = i + n; }
        if (!arr[j] || vis[j] === g) continue;
        vis[j] = g; prev[j] = i; q[t++] = j;
      }
    }
    if (end < 0) return null;
    const path = [];
    for (let i = end; i >= 0; i = prev[i]) path.push(i);
    return path.reverse();
  }

  // ------------------------------------------------------------ S-Bahnen
  stepTrains(s, dt) {
    const want = Math.min(LIFE.trainMax, this.stationsActive);
    let act = 0;
    for (const t of this.trains) if (t.on) act++;
    if (act < want && this.netAll.length >= 2) { if (this.spawnTrain()) act++; }
    else if (act > want) { for (const t of this.trains) if (t.on) { t.on = false; break; } }
    for (const t of this.trains) if (t.on) this.trainStep(s, t, dt);
  }
  spawnTrain() {
    let t = this.trains.find((q) => !q.on);
    if (!t) {
      if (this.trains.length >= LIFE.trainMax) return false;
      t = { on: false, Q: null, s: 0, state: 1, dwell: 0, speed: 0, nW: 2, fail: 0 };
      this.trains.push(t);
    }
    const all = this.netAll;
    t.on = true; t.Q = [all[(Math.random() * all.length) | 0]]; t.s = 0; t.state = 1; t.fail = 0;
    t.dwell = Math.random() * LIFE.trainDwell[1];
    t.speed = LIFE.trainSpeed[0] + Math.random() * (LIFE.trainSpeed[1] - LIFE.trainSpeed[0]);
    t.nW = LIFE.trainWagons[0] + ((Math.random() * (LIFE.trainWagons[1] - LIFE.trainWagons[0] + 1)) | 0);
    return true;
  }
  trainStep(s, t, dt) {
    const Q = t.Q, len = Q.length;
    if (t.state === 0) {                                  // Fahrt
      t.s += t.speed * dt;
      if (t.s >= len - 1) {
        t.s = len - 1; t.state = 1;
        t.dwell = this.stationSet[Q[len - 1]] ? LIFE.trainDwell[0] + Math.random() * (LIFE.trainDwell[1] - LIFE.trainDwell[0]) : 0.4;
      }
    } else {                                              // Halt am Bahnhof
      t.dwell -= dt;
      if (t.dwell <= 0 && !this.routeNext(s, t)) { t.dwell = 1; if (t.fail > 6) t.on = false; }
    }
    // Gleis vor dem Zug noch vorhanden? Sonst Zug verschwindet (wird später neu gesetzt)
    const Q2 = t.Q, head = Math.floor(t.s), ahead = Math.min(Q2.length - 1, head + 1);
    if (!s.rail[Q2[head]] || !s.rail[Q2[ahead]]) t.on = false;
  }
  /** Neue Fahrt zu einem zufälligen Ziel (BFS über Gleise). Der Schwanz des alten Pfads bleibt für die Wagen erhalten. */
  routeNext(s, t) {
    const Q = t.Q, len = Q.length, here = Q[len - 1], all = this.netAll;
    if (all.length < 2) return false;
    let target = -1;
    for (let k = 0; k < 4 && target < 0; k++) { const c = all[(Math.random() * all.length) | 0]; if (c !== here) target = c; }
    const path = target >= 0 ? this.bfsPath(s, s.rail, here, target, this.NN, -1) : null;
    if (!path) { t.fail++; return false; }
    const a = Math.max(0, len - 13), NQ = Q.slice(a);
    for (let k = 1; k < path.length; k++) NQ.push(path[k]);
    t.Q = NQ; t.s = len - 1 - a; t.state = 0; t.fail = 0;
    return true;
  }
  drawTrain(g, lg, t, v) {
    const n = this.n, Q = t.Q;
    pathPos(Q, t.s, n);
    if (SC.x < v.x0 - 2 || SC.x > v.x1 + 2 || SC.y < v.y0 - 2 || SC.y > v.y1 + 2) return;
    const night = !!lg;
    if (night) lg.globalCompositeOperation = 'lighter';
    for (let j = 0; j < t.nW; j++) {
      pathPos(Q, t.s - j * 0.6, n);
      const cx = SC.x, cy = SC.y, dx = SC.dx, dy = SC.dy, L = 0.25, px = -dy * 0.1, py = dx * 0.1;
      quad(g, cx + dx * L + px, cy + dy * L + py, cx + dx * L - px, cy + dy * L - py,
        cx - dx * L - px, cy - dy * L - py, cx - dx * L + px, cy - dy * L + py, TRAIN_BODY);
      band(g, cx, cy, dx, dy, L, -0.03, 0.03, TRAIN_STRIPE);
      band(g, cx, cy, dx, dy, L * 0.9, 0.055, 0.085, TRAIN_WIN);
      band(g, cx, cy, dx, dy, L * 0.9, -0.085, -0.055, TRAIN_WIN);
      if (night) {   // Fensterband leuchtet, vorne Frontlicht
        band(lg, cx, cy, dx, dy, L * 0.9, 0.055, 0.085, 'rgba(255,214,140,.7)');
        band(lg, cx, cy, dx, dy, L * 0.9, -0.085, -0.055, 'rgba(255,214,140,.7)');
        if (j === 0) { const hx = cx + dx * 0.3, hy = cy + dy * 0.3; light(lg, 'white', (hx - hy) * 32, (hx + hy) * 16, 12, 10, 0.9); }
      }
    }
  }

  // ------------------------------------------------------------ Löschzüge
  stepTrucks(s, dt) {
    for (const k of this.trucks) {
      if (!k.on) continue;
      const Q = k.Q, len = Q.length;
      if (k.state === 0) {                                   // Anfahrt
        k.s += LIFE.truckSpeed * dt;
        if (k.s >= len - 1) { k.s = len - 1; k.state = 1; }
      } else if (k.state === 1) {                            // am Brand: bleibt, solange es im Umkreis brennt
        if (!s.road[k.dest]) { k.on = false; continue; }
        if (!this.fireNear(k.dest, 2)) { k.state = 2; k.Q = Q.slice().reverse(); k.s = 0; }
        continue;
      } else {                                               // Rückfahrt zur Wache
        k.s += LIFE.truckSpeed * dt;
        if (k.s >= len - 1) { k.on = false; continue; }
      }
      const ahead = Q[Math.min(len - 1, Math.floor(k.s) + 1)];
      if (!s.road[ahead]) k.on = false;
    }
  }
  drawTruck(g, lg, k, v) {
    const n = this.n;
    pathPos(k.Q, k.s, n);
    const cx = SC.x, cy = SC.y, dx = SC.dx, dy = SC.dy;
    if (cx < v.x0 - 2 || cx > v.x1 + 2 || cy < v.y0 - 2 || cy > v.y1 + 2) return;
    const L = 0.26, px = -dy * 0.11, py = dx * 0.11;
    quad(g, cx + dx * L + px, cy + dy * L + py, cx + dx * L - px, cy + dy * L - py,
      cx - dx * L - px, cy - dy * L - py, cx - dx * L + px, cy - dy * L + py, CAR_RED);
    band(g, cx, cy, dx, dy, L, -0.03, 0.03, '#f4f4f4');
    const sx = (cx - cy) * 32, sy = (cx + cy) * 16;
    const flash = k.state <= 1 && (Math.floor(this.t * 5) & 1) === 1;   // Blaulicht blinkt (nur auf der Fahrt zum Brand)
    const barCol = k.state <= 1 ? (flash ? '#3d7bff' : '#ff3b30') : '#8a8f96';
    g.fillStyle = barCol; g.fillRect(sx - 3, sy - 7, 6, 2.5);
    if (lg) light(lg, flash ? 'blue' : 'red', sx, sy - 6, 26, 26, k.state <= 1 ? 0.9 : 0.25);
  }

  // ------------------------------------------------------------ Boote
  stepBoats(s, dt) {
    const want = this.waterTotal > 0 ? Math.min(LIFE.boatMax, 1 + Math.floor(this.waterTotal / 120)) : 0;
    let act = 0;
    for (const b of this.boats) if (b.on) act++;
    if (act < want) { if (this.spawnBoat(s)) act++; }
    else if (act > want) { for (const b of this.boats) if (b.on) { b.on = false; break; } }
    for (const b of this.boats) {
      if (!b.on) continue;
      b.f += b.v * dt;
      while (b.f >= 1) { b.f -= 1; b.prev = b.cur; b.cur = b.nxt; b.nxt = this.boatNext(s, b.cur, b.prev); }
    }
  }
  spawnBoat(s) {
    let j = -1;
    for (let tries = 0; tries < 800 && j < 0; tries++) {
      const q = (Math.random() * this.NN) | 0, c = this.water[q];
      if (c >= 0 && this.waterSize[c] >= LIFE.boatWater) j = q;
    }
    if (j < 0) return false;
    let b = this.boats.find((q) => !q.on);
    if (!b) {
      if (this.boats.length >= LIFE.boatMax) return false;
      b = { on: false, cur: 0, nxt: 0, prev: -1, f: 0, v: 0, kind: 0 };
      this.boats.push(b);
    }
    b.on = true; b.cur = j; b.prev = -1; b.nxt = this.boatNext(s, j, -1); b.f = Math.random();
    b.v = LIFE.boatSpeed[0] + Math.random() * (LIFE.boatSpeed[1] - LIFE.boatSpeed[0]);
    b.kind = Math.random() < 0.45 ? 1 : 0;   // 0 Ausflugsschiff (weiß), 1 Lastkahn (dunkel, lang)
    return true;
  }
  /** Nächste Wasserkachel: zufällig, nie zurück (außer in einer Sackgasse). */
  boatNext(s, cur, prev) {
    const n = this.n, x = cur % n, y = (cur - x) / n;
    let pick = -1, cnt = 0;
    for (let k = 0; k < 4; k++) {
      if ((k === 0 && x === 0) || (k === 1 && x === n - 1) || (k === 2 && y === 0) || (k === 3 && y === n - 1)) continue;
      const j = cur + (k === 0 ? -1 : k === 1 ? 1 : k === 2 ? -n : n);
      if (j === prev || s.terrain[j] !== T_WATER) continue;
      cnt++; if (Math.random() * cnt < 1) pick = j;
    }
    return pick >= 0 ? pick : (prev >= 0 ? prev : cur);
  }
  drawBoat(g, lg, b, v) {
    const n = this.n;
    const ax = b.cur % n + 0.5, ay = Math.floor(b.cur / n) + 0.5;
    const bx = b.nxt % n + 0.5, by = Math.floor(b.nxt / n) + 0.5;
    const cx = ax + (bx - ax) * b.f, cy = ay + (by - ay) * b.f;
    if (cx < v.x0 - 2 || cx > v.x1 + 2 || cy < v.y0 - 2 || cy > v.y1 + 2) return;
    if (this.s.road[Math.floor(cx) + Math.floor(cy) * n]) return;   // unter der Brücke: nicht sichtbar
    let dx = bx - ax, dy = by - ay; const dl = Math.hypot(dx, dy);
    if (dl < 1e-6) { dx = 1; dy = 0; } else { dx /= dl; dy /= dl; }
    const px = -dy, py = dx;
    const L = b.kind ? 0.5 : 0.36, hw = b.kind ? 0.1 : 0.085;
    // Kielwasser (hinter dem Heck, zwei Linien)
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
    g.beginPath();
    pt(g, cx - dx * L + px * hw, cy - dy * L + py * hw, true); pt(g, cx - dx * (L + 0.5) + px * (hw + 0.2), cy - dy * (L + 0.5) + py * (hw + 0.2));
    pt(g, cx - dx * L - px * hw, cy - dy * L - py * hw, true); pt(g, cx - dx * (L + 0.5) - px * (hw + 0.2), cy - dy * (L + 0.5) - py * (hw + 0.2));
    g.stroke();
    // Rumpf (Bug spitz)
    g.beginPath();
    pt(g, cx - dx * L + px * hw, cy - dy * L + py * hw, true);
    pt(g, cx + dx * (L - 0.12) + px * hw, cy + dy * (L - 0.12) + py * hw);
    pt(g, cx + dx * (L + 0.08), cy + dy * (L + 0.08));
    pt(g, cx + dx * (L - 0.12) - px * hw, cy + dy * (L - 0.12) - py * hw);
    pt(g, cx - dx * L - px * hw, cy - dy * L - py * hw);
    g.closePath();
    g.fillStyle = b.kind ? '#4b4f57' : '#f4f7fa'; g.fill();
    if (b.kind) quad(g, cx - dx * 0.3 + px * 0.06, cy - dy * 0.3 + py * 0.06, cx + dx * 0.2 + px * 0.06, cy + dy * 0.2 + py * 0.06,
      cx + dx * 0.2 - px * 0.06, cy + dy * 0.2 - py * 0.06, cx - dx * 0.3 - px * 0.06, cy - dy * 0.3 - py * 0.06, '#9a7a52');
    else quad(g, cx - dx * 0.16 + px * 0.06, cy - dy * 0.16 + py * 0.06, cx + dx * 0.12 + px * 0.06, cy + dy * 0.12 + py * 0.06,
      cx + dx * 0.12 - px * 0.06, cy + dy * 0.12 - py * 0.06, cx - dx * 0.16 - px * 0.06, cy - dy * 0.16 - py * 0.06, '#c9d6e3');
    if (lg) { // Positionslichter: Mast weiß, Bug rot (linke Seite) und grün (rechte Seite)
      lg.globalCompositeOperation = 'lighter';
      const mx = cx + dx * 0.05, my = cy + dy * 0.05;
      light(lg, 'white', (mx - my) * 32, (mx + my) * 16, 8, 8, 0.9);
      const fx = cx + dx * (L - 0.05), fy = cy + dy * (L - 0.05);
      const rx = fx - px * hw * 1.5, ry = fy - py * hw * 1.5, gx = fx + px * hw * 1.5, gy = fy + py * hw * 1.5;
      light(lg, 'red', (rx - ry) * 32, (rx + ry) * 16, 8, 8, 0.9);
      light(lg, 'green', (gx - gy) * 32, (gx + gy) * 16, 8, 8, 0.9);
    }
  }

  // ------------------------------------------------------------ Fußgänger
  walkable(s, j) {
    if (s.road[j]) return true;
    if (s.rail[j] || s.terrain[j] === T_WATER || s.terrain[j] === T_TREES) return false;
    return this.park[j] === 1 || !s.occ[j];
  }
  stepPeds(s, dt) {
    const pop = s.stats ? s.stats.pop : 0;
    const want = this.anchors.length ? Math.min(LIFE.pedMax, Math.floor(pop / LIFE.pedPerPop)) : 0;
    if (this.pedN > want) this.pedN = want;
    while (this.pedN < want) {
      let p = this.peds[this.pedN];
      if (!p) { p = { x: 0, y: 0, tx: 0, ty: 0, cur: 0, nxt: 0, prev: -1, home: 0, v: 0, pause: 0, phase: 0, col: '#000', air: false }; this.peds.push(p); }
      this.pedSpawn(p); this.pedN++;
    }
    for (let k = 0; k < this.pedN; k++) {
      const p = this.peds[k];
      if (p.pause > 0) { p.pause -= dt; continue; }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), st = p.v * dt;
      if (d <= st) { p.x = p.tx; p.y = p.ty; this.pedArrive(s, p); }
      else { p.x += dx / d * st; p.y += dy / d * st; }
    }
  }
  pedSpawn(p) {
    const n = this.n, a = this.anchors[(Math.random() * this.anchors.length) | 0];
    p.home = a; p.cur = a; p.nxt = a; p.prev = -1;
    p.x = (a % n) + 0.5; p.y = Math.floor(a / n) + 0.5; p.tx = p.x; p.ty = p.y;
    p.v = LIFE.pedSpeed[0] + Math.random() * (LIFE.pedSpeed[1] - LIFE.pedSpeed[0]);
    p.pause = Math.random() * 3; p.phase = Math.random() * 6.28;
    p.col = PED_COL[(Math.random() * PED_COL.length) | 0]; p.air = this.park[a] === 1;
  }
  /** Am Ziel angekommen: Kachel übernehmen, mal stehen bleiben, nächsten Nachbarn wählen (ohne Umkehr, in der Leine). */
  pedArrive(s, p) {
    const n = this.n;
    p.prev = p.cur; p.cur = p.nxt; p.air = this.park[p.cur] === 1;
    if (Math.random() < 0.2) p.pause = 0.8 + Math.random() * 2.2;
    const cx = p.cur % n, cy = (p.cur - cx) / n, hx = p.home % n, hy = (p.home - hx) / n;
    let pick = -1, cnt = 0;
    for (let k = 0; k < 4; k++) {
      if ((k === 0 && cx === 0) || (k === 1 && cx === n - 1) || (k === 2 && cy === 0) || (k === 3 && cy === n - 1)) continue;
      const j = p.cur + (k === 0 ? -1 : k === 1 ? 1 : k === 2 ? -n : n);
      if (j === p.prev || !this.walkable(s, j)) continue;
      const jx = j % n, jy = (j - jx) / n;
      if (Math.abs(jx - hx) + Math.abs(jy - hy) > LIFE.pedLeash) continue;
      cnt++; if (Math.random() * cnt < 1) pick = j;
    }
    if (pick < 0) pick = (p.prev >= 0 && this.walkable(s, p.prev)) ? p.prev : p.cur;   // Sackgasse: umkehren
    if (pick === p.cur) p.pause = 1;
    p.nxt = pick; p.tx = (pick % n) + 0.5; p.ty = Math.floor(pick / n) + 0.5;
  }
  drawPeds(g, v, air) {
    const tt = this.t;
    for (let k = 0; k < this.pedN; k++) {
      const p = this.peds[k];
      if (p.air !== air) continue;
      if (p.x < v.x0 - 1 || p.x > v.x1 + 2 || p.y < v.y0 - 1 || p.y > v.y1 + 2) continue;
      const sx = (p.x - p.y) * 32, sy = (p.x + p.y) * 16;
      const bob = p.pause > 0 ? 0 : Math.abs(Math.sin(tt * 9 + p.phase)) * 0.9;
      g.fillStyle = p.col; g.fillRect(sx - 1.2, sy - 5.5 - bob, 2.4, 4);
      g.fillStyle = '#e8c39e'; g.fillRect(sx - 1, sy - 8 - bob, 2, 2.2);
    }
  }

  // ------------------------------------------------------------ Rauch und Flammen (Partikel-Pool, keine Allokation)
  visT(x, y, m) { const v = this.vw; return x >= v.x0 - m && x <= v.x1 + m && y >= v.y0 - m && y <= v.y1 + m; }
  /** Neues Partikel aus dem Pool (ältestes wird überschrieben). tx/ty Kachel, z Höhe in px, kind siehe PUFF_NAMES. */
  puff(tx, ty, z, kind) {
    const p = this.pool[this.pIdx]; this.pIdx = (this.pIdx + 1) % LIFE.partMax;
    p.x = (tx - ty) * 32 + (Math.random() - 0.5) * 3; p.y = (tx + ty) * 16 - z + (Math.random() - 0.5) * 2;
    p.age = 0; p.kind = kind;
    if (kind === 1) { p.vx = this.wind * 0.5; p.vy = -(3 + Math.random() * 3); p.life = 2 + Math.random(); p.r0 = 2; p.r1 = 5 + Math.random() * 3; p.al = 0.35; }
    else if (kind === 2) { p.vx = this.wind * (0.6 + 0.4 * Math.random()); p.vy = -(9 + Math.random() * 6); p.life = 2.5 + Math.random() * 2; p.r0 = 3; p.r1 = 9 + Math.random() * 5; p.al = 0.6; }
    else { p.vx = this.wind * (0.6 + 0.4 * Math.random()); p.vy = -(7 + Math.random() * 6); p.life = 3 + Math.random() * 2; p.r0 = 2.5; p.r1 = 7 + Math.random() * 5; p.al = 0.55; }
  }
  /** Flamme (orange) mit gelbem Kern; kind 3/4. */
  flame(tx, ty) {
    const p = this.pool[this.pIdx]; this.pIdx = (this.pIdx + 1) % LIFE.partMax;
    p.x = (tx - ty) * 32 + (Math.random() - 0.5) * 6; p.y = (tx + ty) * 16 - 3 - Math.random() * 5;
    p.vx = (Math.random() - 0.5) * 6 + this.wind * 0.3; p.vy = -(18 + Math.random() * 14);
    p.age = 0; p.life = 0.5 + Math.random() * 0.4; p.r0 = 4.5; p.r1 = 1.5; p.al = 0.95; p.kind = 3;
  }
  emit(s, dt) {
    const n = this.n;
    for (const e of this.ems) {
      if (!this.visT(e.x, e.y, 3)) { e.acc = 0; continue; }
      e.acc += e.rate * dt;
      while (e.acc >= 1) { e.acc -= 1; this.puff(e.x, e.y, e.z, e.dust ? 1 : 0); }
    }
    const fl = this.fireList;
    for (let m = 0; m < this.fireN; m++) {
      const j = fl[m], x = j % n, y = (j - x) / n;
      if (!this.visT(x + 0.5, y + 0.5, 2)) continue;
      this.fireAcc[j] += dt * 6;
      while (this.fireAcc[j] >= 1) {
        this.fireAcc[j] -= 1;
        this.flame(x + 0.5, y + 0.5);
        if (Math.random() < 0.5) { const q = this.pool[this.pIdx]; this.pIdx = (this.pIdx + 1) % LIFE.partMax; q.x = (x - y) * 32; q.y = (x + y + 1) * 16 - 4; q.vx = this.wind * 0.3; q.vy = -(14 + Math.random() * 6); q.age = 0; q.life = 0.3; q.r0 = 3; q.r1 = 1; q.al = 1; q.kind = 4; }
        if (Math.random() < 0.3) this.puff(x + 0.5, y + 0.5, 14, 2);
      }
    }
  }
  stepParticles(dt) {
    const wind = this.wind;
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.age += dt;
      if (p.age >= p.life) { p.life = 0; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx += (wind - p.vx) * 0.5 * dt;
      p.vy *= 1 - 0.3 * dt;
    }
  }
  drawParticles(g) {
    const imgs = this.puffImgs || (this.puffImgs = PUFF_NAMES.map((nm, k) => spr('p' + nm, nm, PUFF_CORE[k])));
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      const f = p.age / p.life;
      const r = p.r0 + (p.r1 - p.r0) * f;
      const a = p.kind >= 3 ? 1 - f : Math.min(1, f * 4) * (1 - f);
      g.globalAlpha = Math.max(0, Math.min(1, p.al * a));
      g.drawImage(imgs[p.kind], p.x - r, p.y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
  }
  /** Flammen leuchten nachts (Lichtebene). */
  lightFire(lg, v, time) {
    const n = this.n, fl = this.fireList, tt = time * 0.01;
    for (let m = 0; m < this.fireN; m++) {
      const j = fl[m], x = j % n, y = (j - x) / n;
      if (x + 0.5 < v.x0 - 1 || x + 0.5 > v.x1 + 1 || y + 0.5 < v.y0 - 1 || y + 0.5 > v.y1 + 1) continue;
      light(lg, 'flame', (x - y) * 32, (x + y + 1) * 16 - 8, 60, 42, 0.5 + 0.25 * Math.sin(tt * 7 + j));
    }
  }

  // ------------------------------------------------------------ Zeichnung (Renderer-Hooks)
  /** Boden-Ebene: direkt nach den Autos (vor den Objekten). lg = Nacht-Lichtebene oder null. */
  drawGround(g, lg, v) {
    g.save();
    for (const t of this.trains) if (t.on) this.drawTrain(g, lg, t, v);
    for (const b of this.boats) if (b.on) this.drawBoat(g, lg, b, v);
    for (const k of this.trucks) if (k.on) this.drawTruck(g, lg, k, v);
    if (v.zoom >= LIFE.pedMinZoom) this.drawPeds(g, v, false);
    g.restore();
    if (lg) { lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1; }
  }
  /** Luft-Ebene: nach den Objekten, vor Flut und Tönung. Rauch und Flammen liegen darüber. */
  drawAir(g, lg, v, time) {
    g.save();
    if (v.zoom >= LIFE.pedMinZoom) this.drawPeds(g, v, true);
    if (lg) this.lightFire(lg, v, time);
    this.drawParticles(g);
    g.restore();
    if (lg) { lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1; }
  }
}
