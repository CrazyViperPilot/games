// Simfurt – Simulation (reine Logik, ohne DOM). Ein Tick = ein Monat.
import {
  N, setMapSize, START_MONEY, START_YEAR, T_GRASS, T_WATER, T_TREES, Z_NONE, Z_R, Z_C, Z_I, Z_B, ZONES, BUILD,
  ROAD_COST, BRIDGE_COST, BULLDOZE_COST, ROAD_UPKEEP, ZONE_UNLOCK, MILESTONES, MONTHS,
} from './data.js';

export let NN = N * N;
export function setSize(n) { setMapSize(n); NN = n * n; }
export const idx = (x, y) => y * N + x;
export const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

export function rand(s) {
  s.rng = (s.rng + 0x6D2B79F5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (s, n) => Math.floor(rand(s) * n);
const hash = (i, k = 0) => { let h = Math.imul(i + 1 + k * 7919, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- Neue Stadt / Karte
export function newCity({ name = 'Simfurt', seed = 1, size = 64 } = {}) {
  setSize(size);
  const s = {
    v: 1, size, name, seed, rng: (seed * 2654435761) >>> 0, year: START_YEAR, month: 0, money: START_MONEY, loan: 0,
    rates: { r: 9, c: 9, i: 9 }, disasters: true,
    terrain: new Uint8Array(NN), road: new Uint8Array(NN), zone: new Uint8Array(NN), lvl: new Uint8Array(NN),
    vr: new Uint8Array(NN), occ: new Uint16Array(NN), fire: new Uint8Array(NN), flood: new Uint8Array(NN),
    bld: [], nextId: 1, ms: 0, msgs: [], hist: [], occupancy: 0.5, demand: { r: 0.5, c: 0.2, i: 0.5, b: 0 },
    stats: null, fin: { inc: 0, exp: 0, net: 0, parts: {} }, ticks: 0, seen: {},
  };
  generateMap(s);
  say(s, 'Willkommen in ' + name + '! Zonen anlegen, Straße und Strom nicht vergessen.', 'info');
  refresh(s);
  return s;
}

function noise(s, cells) {
  const g = []; for (let i = 0; i < (cells + 1) * (cells + 1); i++) g.push(rand(s));
  return (x, y) => {
    const fx = (x / N) * cells, fy = (y / N) * cells;
    const ix = Math.min(cells - 1, Math.floor(fx)), iy = Math.min(cells - 1, Math.floor(fy));
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * (cells + 1) + ix], b = g[iy * (cells + 1) + ix + 1], c = g[(iy + 1) * (cells + 1) + ix], d = g[(iy + 1) * (cells + 1) + ix + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function generateMap(s) {
  const p1 = rand(s) * 6.28, p2 = rand(s) * 6.28, amp = 6 + rand(s) * 4, mid = N * (0.45 + rand(s) * 0.1);
  for (let x = 0; x < N; x++) {
    const cy = mid + Math.sin(x * 0.095 + p1) * amp + Math.sin(x * 0.23 + p2) * 2.5;
    const w = 2.2 + Math.sin(x * 0.17 + p2) * 0.7;
    for (let y = 0; y < N; y++) if (Math.abs(y - cy) < w) s.terrain[idx(x, y)] = T_WATER;
  }
  // Seitenarm (Nidda-artig) von Norden in den Main
  let nx = 10 + Math.floor(rand(s) * 40);
  for (let y = 0; y < N; y++) {
    const cy = mid + Math.sin(nx * 0.095 + p1) * amp;
    if (y > cy - 4) break;
    nx += (rand(s) - 0.5) * 1.4;
    const xi = Math.round(nx); if (xi > 1 && xi < N - 2) { s.terrain[idx(xi, y)] = T_WATER; }
  }
  const sc = N / 64, n1 = noise(s, Math.round(6 * sc)), n2 = noise(s, Math.round(14 * sc));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (s.terrain[i] === T_WATER) continue;
    const v = n1(x, y) * 0.6 + n2(x, y) * 0.4;
    if (v > 0.62) s.terrain[i] = T_TREES;
  }
  // Startfläche am Fluss freihalten
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (s.terrain[i] === T_TREES && (x > N * 0.28 && x < N * 0.72 && y > N * 0.22 && y < N * 0.78) && hash(i, 3) < 0.65) s.terrain[i] = T_GRASS;
  }
}

// ---------------------------------------------------------------- Nachrichten
export function say(s, text, kind = 'info') {
  s.msgs.push({ y: s.year, m: s.month, text, kind });
  if (s.msgs.length > 60) s.msgs.shift();
  if (s.onMsg) s.onMsg(s.msgs[s.msgs.length - 1]);
}

// ---------------------------------------------------------------- Abfragen
export const isLand = (s, x, y) => inb(x, y) && s.terrain[idx(x, y)] !== T_WATER;
export const roadAt = (s, x, y) => inb(x, y) && s.road[idx(x, y)] === 1;
export const buildingAt = (s, x, y) => (inb(x, y) && s.occ[idx(x, y)] ? s.bld.find((b) => b.id === s.occ[idx(x, y)]) : null);
export const countType = (s, type) => s.bld.reduce((n, b) => n + (b.type === type ? 1 : 0), 0);

export function unlocked(s, key) {
  const pop = s.stats ? s.stats.pop : 0;
  const peak = s.peakPop || pop;
  const need = BUILD[key] ? BUILD[key].unlock : ZONE_UNLOCK[key] ?? 0;
  return Math.max(pop, peak * 0.9) >= need;
}
export const unlockNeed = (key) => (BUILD[key] ? BUILD[key].unlock : ZONE_UNLOCK[key] ?? 0);

// ---------------------------------------------------------------- Werkzeuge
export function toolCost(s, tool, x, y) {
  if (!inb(x, y)) return -1;
  const i = idx(x, y);
  if (tool === 'road') {
    if (s.road[i]) return -1;
    if (s.occ[i] || s.lvl[i]) return -1;
    return s.terrain[i] === T_WATER ? BRIDGE_COST : ROAD_COST;
  }
  if (tool.startsWith('zone')) {
    const z = Number(tool.slice(4));
    if (s.terrain[i] === T_WATER || s.road[i] || s.occ[i] || s.zone[i] === z) return -1;
    return ZONES[z].cost;
  }
  if (tool === 'bulldoze') {
    if (s.occ[i]) { const b = buildingAt(s, x, y); return b && BUILD[b.type].unique ? BULLDOZE_COST * 10 : BULLDOZE_COST * 5; }
    if (s.road[i] || s.zone[i] || s.terrain[i] === T_TREES) return BULLDOZE_COST;
    return -1;
  }
  return -1;
}

/** Wendet ein Kachelwerkzeug an. Gibt Kosten (>=0) zurück oder -1 bei Ablehnung. */
export function applyTool(s, tool, x, y) {
  const c = toolCost(s, tool, x, y);
  if (c < 0) return -1;
  if (s.money < c) return -2;
  const i = idx(x, y);
  if (tool === 'road') {
    s.road[i] = 1; s.zone[i] = 0; s.lvl[i] = 0; if (s.terrain[i] === T_TREES) s.terrain[i] = T_GRASS;
  } else if (tool.startsWith('zone')) {
    const z = Number(tool.slice(4));
    s.zone[i] = z; s.lvl[i] = 0; s.vr[i] = rint(s, 256); if (s.terrain[i] === T_TREES) s.terrain[i] = T_GRASS;
  } else if (tool === 'bulldoze') {
    if (s.occ[i]) removeBuilding(s, buildingAt(s, x, y));
    else if (s.road[i]) s.road[i] = 0;
    else if (s.zone[i]) { s.zone[i] = 0; s.lvl[i] = 0; s.fire[i] = 0; }
    else if (s.terrain[i] === T_TREES) s.terrain[i] = T_GRASS;
    s.fire[i] = 0;
  }
  s.money -= c;
  s.dirty = true;
  return c;
}

export function canPlace(s, key, x, y) {
  const d = BUILD[key];
  if (!d) return 'unbekannt';
  if (d.unique && countType(s, key)) return 'Gibt es schon';
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    if (!inb(xx, yy)) return 'Außerhalb';
    const i = idx(xx, yy);
    if (s.terrain[i] === T_WATER) return 'Wasser';
    if (s.road[i]) return 'Straße im Weg';
    if (s.occ[i]) return 'Gebäude im Weg';
    if (s.lvl[i] > 0) return 'Bebaute Zone im Weg';
  }
  return '';
}

export function placeBuilding(s, key, x, y) {
  const d = BUILD[key];
  const why = canPlace(s, key, x, y);
  if (why) return { ok: false, why };
  if (!unlocked(s, key)) return { ok: false, why: 'Noch gesperrt' };
  if (s.money < d.cost) return { ok: false, why: 'Zu wenig Geld' };
  const b = { id: s.nextId++, type: key, x, y, w: d.w, h: d.h, fire: 0 };
  s.bld.push(b);
  for (let yy = y; yy < y + d.h; yy++) for (let xx = x; xx < x + d.w; xx++) {
    const i = idx(xx, yy);
    s.occ[i] = b.id; s.zone[i] = 0; s.lvl[i] = 0; s.fire[i] = 0;
    if (s.terrain[i] === T_TREES) s.terrain[i] = T_GRASS;
  }
  s.money -= d.cost;
  s.dirty = true;
  return { ok: true, b };
}

export function removeBuilding(s, b) {
  if (!b) return;
  for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) { const i = idx(xx, yy); s.occ[i] = 0; s.fire[i] = 0; }
  s.bld = s.bld.filter((o) => o !== b);
  s.dirty = true;
}

export function takeLoan(s) { if (s.loan >= 50000) return false; s.loan += 10000; s.money += 10000; return true; }
export function repayLoan(s) { if (s.loan < 10000 || s.money < 10000) return false; s.loan -= 10000; s.money -= 10000; return true; }

// ---------------------------------------------------------------- Karten (Abdeckung, Verschmutzung, Verkehr ...)
const mk = () => new Float32Array(NN);
function stamp(map, cx, cy, r, v, max = false) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(N - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r) continue;
    const a = v * (1 - d / r);
    const i = y * N + x;
    if (max) { if (a > map[i]) map[i] = a; } else map[i] += a;
  }
}

const hasRoadNear = (s, x, y) => {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && roadAt(s, x + dx, y + dy)) return true;
  return false;
};

/** Berechnet alle abgeleiteten Karten und Kennzahlen. */
export function refresh(s) {
  const m = s.maps = { power: mk(), police: mk(), fire: mk(), health: mk(), edu: mk(), park: mk(), metro: mk(), pol: mk(), crime: mk(), value: mk(), traffic: mk(), happy: mk() };
  let cap = 0, load = 0;
  const bcen = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  for (const b of s.bld) {
    const d = BUILD[b.type]; const [cx, cy] = bcen(b);
    switch (d.kind) {
      case 'power': stamp(m.power, cx, cy, d.r, 1, true); cap += d.cap; stamp(m.pol, cx, cy, 7, d.pol * 1.4); break;
      case 'police': stamp(m.police, cx, cy, d.r, 1, true); break;
      case 'fire': stamp(m.fire, cx, cy, d.r, 1, true); break;
      case 'health': stamp(m.health, cx, cy, d.r, 1, true); break;
      case 'edu': stamp(m.edu, cx, cy, d.r, d.lvl === 2 ? 1 : 0.6, true); break;
      case 'park': stamp(m.park, cx, cy, d.r, 1, true); break;
      case 'metro': stamp(m.metro, cx, cy, d.r, 1, true); break;
      case 'happy': stamp(m.park, cx, cy, d.r, d.happy > 0 ? 1 : 0, true); stamp(m.happy, cx, cy, d.r, d.happy, false); if (d.pol) stamp(m.pol, cx, cy, 6, d.pol); break;
    }
    if (d.kind !== 'power') load += 2;
  }
  // Brownout
  const powered = new Uint8Array(NN);
  for (let i = 0; i < NN; i++) if (m.power[i] > 0) load += 0; // Platzhalter, Last unten
  let jobsC = 0, jobsI = 0, jobsB = 0, capR = 0, lots = 0;
  const active = new Uint8Array(NN);
  let totalLoad = load;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y); const z = s.zone[i], l = s.lvl[i];
    if (!z || !l) continue;
    if (m.power[i] > 0 && hasRoadNear(s, x, y)) { totalLoad += ZONES[z].load[l]; active[i] = 1; }
  }
  const ratio = cap > 0 ? Math.min(1, cap / Math.max(1, totalLoad)) : 0;
  s.powerRatio = ratio; s.powerCap = cap; s.powerLoad = totalLoad;
  for (let i = 0; i < NN; i++) powered[i] = m.power[i] > 0 && (ratio >= 1 || hash(i, 11) < ratio) ? 1 : 0;
  s.powered = powered;

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y); const z = s.zone[i], l = s.lvl[i];
    if (!z || !l) continue;
    lots++;
    const act = active[i] && powered[i];
    s.vr[i] = s.vr[i]; // unverändert
    // Verschmutzung / Verkehr / Kriminalität entstehen auch ohne Strom
    if (z === Z_I) stamp(m.pol, x + 0.5, y + 0.5, 5, l * 9);
    if (z === Z_R || z === Z_C || z === Z_B) stamp(m.crime, x + 0.5, y + 0.5, 4, (z === Z_R ? l * 2 : l * 3));
    if (!act) continue;
    if (z === Z_R) capR += ZONES[z].pop[l];
    else if (z === Z_C) jobsC += ZONES[z].jobs[l];
    else if (z === Z_I) jobsI += ZONES[z].jobs[l];
    else jobsB += ZONES[z].jobs[l];
  }
  for (const b of s.bld) { const [cx, cy] = bcen(b); if (BUILD[b.type].kind === 'power' || BUILD[b.type].kind === 'happy') continue; stamp(m.crime, cx, cy, 3, 2); }
  // Polizei senkt Kriminalität
  for (let i = 0; i < NN; i++) m.crime[i] = Math.max(0, Math.min(100, m.crime[i] * (1 - 0.85 * m.police[i]) * 1.5));
  for (let i = 0; i < NN; i++) {
    m.pol[i] = Math.min(100, m.pol[i] * 1.0);
    if (s.terrain[i] === T_TREES) m.pol[i] *= 0.7;
  }

  // Verkehr
  const roads = [];
  for (let i = 0; i < NN; i++) if (s.road[i]) roads.push(i);
  const seenTag = new Int32Array(NN); let tag = 0;
  const q = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y); const z = s.zone[i], l = s.lvl[i];
    if (!z || !l || !active[i]) continue;
    const zz = ZONES[z];
    const trips = (zz.pop[l] || zz.jobs[l]) * 0.4 * (1 - 0.5 * m.metro[i]);
    let start = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (roadAt(s, x + dx, y + dy)) { start = idx(x + dx, y + dy); break; }
    if (start < 0) for (let dy = -1; dy <= 1 && start < 0; dy++) for (let dx = -1; dx <= 1; dx++) if (roadAt(s, x + dx, y + dy)) { start = idx(x + dx, y + dy); break; }
    if (start < 0) continue;
    tag++; q.length = 0; q.push(start, 0); seenTag[start] = tag;
    for (let h = 0; h < q.length; h += 2) {
      const ci = q[h], dd = q[h + 1];
      m.traffic[ci] += trips * Math.pow(0.72, dd);
      if (dd >= 6) continue;
      const cx = ci % N, cy = (ci / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy; if (!roadAt(s, nx, ny)) continue;
        const ni = idx(nx, ny); if (seenTag[ni] === tag) continue; seenTag[ni] = tag; q.push(ni, dd + 1);
      }
    }
  }
  let tSum = 0, cSum = 0;
  for (const i of roads) { const c = m.traffic[i] / 55; m.traffic[i] = Math.min(3, c); tSum += m.traffic[i]; if (c > 1) cSum++; }
  const cong = roads.length ? tSum / roads.length : 0;

  // Grundwert
  const dens = new Float32Array(NN);
  for (let i = 0; i < NN; i++) if (s.lvl[i] > 0) dens[i] = s.lvl[i];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (s.terrain[i] === T_WATER) continue;
    let nearW = false;
    for (let dy = -3; dy <= 3 && !nearW; dy++) for (let dx = -3; dx <= 3; dx++) if (inb(x + dx, y + dy) && s.terrain[idx(x + dx, y + dy)] === T_WATER) { nearW = true; break; }
    let near = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (inb(x + dx, y + dy)) near += dens[idx(x + dx, y + dy)];
    let v = 34 + (nearW ? 12 : 0) + Math.min(18, near * 0.45) + m.park[i] * 12 + m.police[i] * 5 + m.fire[i] * 4 + m.health[i] * 6 + m.edu[i] * 8 + m.happy[i] * 3 + m.metro[i] * 6
      - m.pol[i] * 0.4 - m.crime[i] * 0.2;
    if (s.road[i]) v -= Math.min(10, m.traffic[i] * 5);
    m.value[i] = Math.max(0, Math.min(100, v));
  }

  // Kennzahlen
  const workers = capR * s.occupancy * 0.5;
  const jobs = jobsC + jobsI + jobsB;
  const pop = Math.round(capR * s.occupancy);
  let rLots = 0, covHealth = 0, covEdu = 0, covPolice = 0, covFire = 0, covPark = 0, crimeSum = 0, polSum = 0, valSum = 0;
  for (let i = 0; i < NN; i++) {
    if (!s.zone[i] || !s.lvl[i]) continue;
    const w = s.zone[i] === Z_R ? s.lvl[i] : 0.3;
    rLots += w; covHealth += m.health[i] * w; covEdu += m.edu[i] * w; covPolice += m.police[i] * w; covFire += m.fire[i] * w; covPark += Math.min(1, m.park[i] * 1.6) * w;
    crimeSum += m.crime[i] * w; polSum += m.pol[i] * w; valSum += m.value[i] * w;
  }
  const f = (v) => (rLots ? v / rLots : 0);
  const landmark = s.bld.reduce((n, b) => n + (BUILD[b.type].kind === 'happy' ? BUILD[b.type].happy : 0), 0);
  const avgTax = (s.rates.r * pop + s.rates.c * jobsC + s.rates.i * jobsI + s.rates.c * jobsB) / Math.max(1, pop + jobs);
  const unemp = workers > 0 ? Math.max(0, workers - jobs) / workers : 0;
  const parts = {
    tax: -Math.max(0, avgTax - 9) * 2.2 + Math.max(0, 9 - avgTax) * 0.8,
    crime: -f(crimeSum) * 0.35, pol: -f(polSum) * 0.3, traffic: -cong * 14,
    health: 8 * f(covHealth), edu: 6 * f(covEdu), police: 6 * f(covPolice), fire: 4 * f(covFire), park: 9 * f(covPark),
    landmark: Math.min(12, landmark * 1.4), jobs: -unemp * 25, power: ratio < 1 && lots ? -(1 - ratio) * 30 : 0,
  };
  const happy = Math.max(0, Math.min(100, 66 + Object.values(parts).reduce((a, b) => a + b, 0)));
  s.stats = {
    pop, capR, workers: Math.round(workers), jobs, jobsC, jobsI, jobsB, lots, happy, unemp, avgTax, cong, congRoads: cSum,
    crime: f(crimeSum), pollution: f(polSum), value: f(valSum), parts, roads: roads.length, covPolice: f(covPolice), covFire: f(covFire),
    covHealth: f(covHealth), covEdu: f(covEdu),
  };
  s.peakPop = Math.max(s.peakPop || 0, pop);
  s.dirty = false;
}

// ---------------------------------------------------------------- Nachfrage
function demandStep(s) {
  const st = s.stats;
  const workers = st.capR * 0.5; // Arbeitskräfte bei voller Belegung
  const jobs = st.jobs;
  const taxPen = (r) => (r - 9) * 0.045;
  const hap = (st.happy - 55) / 90;
  const smooth = (a, b) => a + (b - a) * 0.35;
  const dr = 0.3 + 1.3 * (jobs - workers) / (jobs + workers + 30) + hap - taxPen(s.rates.r) - (st.capR === 0 ? 0 : 0);
  const di = 0.35 + 1.1 * (workers - jobs) / (workers + jobs + 30) - taxPen(s.rates.i) - st.pollution / 160;
  const dc = 0.15 + 1.4 * (st.pop * 0.28 - st.jobsC) / (st.pop * 0.28 + st.jobsC + 40) - taxPen(s.rates.c) + (st.jobsI > 0 ? 0.1 : 0);
  const db = st.pop < 2500 ? -0.2 : Math.min(1, (st.pop - 2500) / 6000 + 0.2) - taxPen(s.rates.c) - 0.35 * (1 - Math.min(1, st.covEdu * 1.5)) + (st.jobsB * 2 < st.capR * 0.5 ? 0.25 : -0.15);
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  s.demand = { r: smooth(s.demand.r, clamp(dr)), c: smooth(s.demand.c, clamp(dc)), i: smooth(s.demand.i, clamp(di)), b: smooth(s.demand.b, clamp(db)) };
}

// ---------------------------------------------------------------- Wachstum
const MINVAL = { [Z_R]: [0, 0, 26, 48], [Z_C]: [0, 0, 24, 46], [Z_I]: [0, 0, 18, 36], [Z_B]: [0, 0, 44, 60, 74] };
function growStep(s) {
  const m = s.maps;
  const dmap = { [Z_R]: s.demand.r, [Z_C]: s.demand.c, [Z_I]: s.demand.i, [Z_B]: s.demand.b };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y); const z = s.zone[i];
    if (!z || s.occ[i] || s.fire[i]) continue;
    const l = s.lvl[i], zz = ZONES[z], d = dmap[z];
    const act = s.powered[i] && hasRoadNear(s, x, y);
    if (l === 0) {
      if (act && d > 0.03 && m.crime[i] < 90 && rand(s) < 0.12 + d * 0.5) { s.lvl[i] = 1; s.vr[i] = rint(s, 256); s.dirty = true; }
    } else if (!act) {
      if (rand(s) < 0.1) { s.lvl[i] = l - 1; s.dirty = true; }
    } else if (d < -0.25 && rand(s) < 0.05) { s.lvl[i] = l - 1; s.dirty = true; }
    else if (l < zz.max && d > 0.12 && m.value[i] >= MINVAL[z][l + 1] && (z !== Z_B || l < 2 || m.edu[i] > 0.15) && (z !== Z_R || m.pol[i] < 45) && rand(s) < 0.03 + d * 0.12) { s.lvl[i] = l + 1; s.dirty = true; }
    else if (l > 1 && m.value[i] < MINVAL[z][l] - 14 && rand(s) < 0.04) { s.lvl[i] = l - 1; s.dirty = true; }
  }
}

// ---------------------------------------------------------------- Finanzen
function financeStep(s) {
  const st = s.stats; const r = s.rates;
  const tR = st.pop * 0.085 * r.r * (0.7 + st.value / 120);
  const tC = st.jobsC * 0.11 * r.c * (0.7 + st.value / 120);
  const tI = st.jobsI * 0.1 * r.i;
  const tB = st.jobsB * 0.28 * r.c * (0.7 + st.value / 100);
  let tour = 0, up = 0;
  for (const b of s.bld) { const d = BUILD[b.type]; up += d.up; if (d.tour) tour += d.tour * (0.5 + st.happy / 200); }
  const roads = st.roads * ROAD_UPKEEP;
  const interest = s.loan * 0.004;
  const inc = tR + tC + tI + tB + tour;
  const exp = up + roads + interest;
  s.money += inc - exp;
  s.fin = { inc, exp, net: inc - exp, parts: { tR, tC, tI, tB, tour, up, roads, interest } };
}

// ---------------------------------------------------------------- Katastrophen
function eventsStep(s) {
  if (!s.disasters) return;
  const m = s.maps;
  // Feuer ausbreiten / löschen
  const burning = [];
  for (let i = 0; i < NN; i++) if (s.fire[i]) burning.push(i);
  for (const i of burning) {
    const x = i % N, y = (i / N) | 0;
    if (rand(s) < 0.15 + 0.75 * m.fire[i]) { s.fire[i] = 0; continue; }
    s.fire[i]++;
    if (s.fire[i] > 3) {
      s.fire[i] = 0;
      if (s.occ[i]) { const b = buildingAt(s, x, y); if (b && !BUILD[b.type].unique) removeBuilding(s, b); }
      else { s.lvl[i] = 0; }
      s.dirty = true;
      continue;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = inb(x + dx, y + dy) ? idx(x + dx, y + dy) : -1;
      if (ni >= 0 && !s.fire[ni] && (s.lvl[ni] || (s.occ[ni] && !BUILD[buildingAt(s, x + dx, y + dy).type].unique)) && rand(s) < 0.1 * (1 - m.fire[ni])) s.fire[ni] = 1;
    }
  }
  // neuer Brand
  const st = s.stats;
  if (st.lots > 8 && rand(s) < 0.02 + st.jobsI / 12000) {
    for (let k = 0; k < 20; k++) {
      const i = rint(s, NN);
      if ((s.lvl[i] > 0 || (s.occ[i] && !BUILD[buildingAt(s, i % N, (i / N) | 0).type].unique)) && !s.fire[i] && rand(s) > m.fire[i]) { s.fire[i] = 1; say(s, 'Feuer ausgebrochen! Eine Feuerwehr in der Nähe würde helfen.', 'bad'); break; }
    }
  }
  // Hochwasser: Main tritt im Frühjahr über die Ufer
  if (s.month === 1 && st.lots > 30 && rand(s) < 0.08) {
    let hit = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = idx(x, y); if (s.terrain[i] === T_WATER) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (inb(x + dx, y + dy) && s.terrain[idx(x + dx, y + dy)] === T_WATER) { near = true; break; }
      if (!near) continue;
      s.flood[i] = 3;
      if (s.lvl[i] > 0 && rand(s) < 0.4) { s.lvl[i]--; hit++; }
    }
    s.dirty = true;
    say(s, 'Hochwasser! Der Main ist über die Ufer getreten' + (hit ? ` – ${hit} Gebäude beschädigt.` : '.'), 'bad');
  }
  for (let i = 0; i < NN; i++) if (s.flood[i]) s.flood[i]--;
}

// ---------------------------------------------------------------- Berater & Meilensteine
function adviceStep(s) {
  const st = s.stats; const k = (key, text, kind = 'bad', every = 6) => {
    if (!s.seen[key] || s.ticks - s.seen[key] >= every * 12) { s.seen[key] = s.ticks; say(s, text, kind); }
  };
  if (st.lots > 5 && s.powerRatio < 0.99) k('power', s.powerCap ? 'Stromengpass! Zu wenig Kraftwerke für die ganze Stadt.' : 'Kein Strom! Baue ein Kraftwerk in der Nähe der Zonen.', 'bad', 1);
  if (s.money < 0) k('money', 'Die Stadtkasse ist leer! Steuern erhöhen oder Ausgaben senken.', 'bad', 1);
  if (st.unemp > 0.25) k('jobs', 'Hohe Arbeitslosigkeit: Gewerbe und Industrie fehlen.', 'bad', 2);
  if (st.cong > 0.8) k('traffic', 'Dauerstau auf den Straßen. Mehr Straßen oder U-Bahn-Stationen helfen.', 'bad', 2);
  if (st.crime > 40) k('crime', 'Die Kriminalität steigt. Polizeireviere bauen!', 'bad', 2);
  if (st.pollution > 40) k('pol', 'Die Luft ist dick. Industrie weiter weg von den Wohngebieten bauen.', 'bad', 2);
  if (st.avgTax > 13) k('tax', 'Die Steuern sind hoch. Die Leute murren.', 'bad', 2);
  if (s.demand.r > 0.5 && st.lots > 10) k('dr', 'Viele wollen hier wohnen: Wohnzonen ausweisen.', 'info', 3);
  if (s.demand.c > 0.5 && st.lots > 10) k('dc', 'Geschäfte fehlen: Gewerbezonen ausweisen.', 'info', 3);
  if (s.demand.i > 0.5 && st.lots > 10) k('di', 'Arbeit gesucht: Industriezonen ausweisen.', 'info', 3);
  if (st.pop >= 3000 && s.demand.b > 0.3) k('db', 'Banken drängen nach Frankfurt: Bankenviertel anlegen (braucht Bildung).', 'info', 3);
  while (s.ms < MILESTONES.length && st.pop >= MILESTONES[s.ms].pop) {
    const ms = MILESTONES[s.ms++];
    say(s, `${ms.title}! ${st.pop.toLocaleString('de-DE')} Einwohner. ${ms.msg}`, 'good');
    if (s.onMilestone) s.onMilestone(ms);
  }
}

// ---------------------------------------------------------------- Tick
export function tick(s) {
  s.ticks++;
  s.month++;
  if (s.month >= 12) {
    s.month = 0; s.year++;
    s.hist.push({ y: s.year, pop: s.stats.pop, money: Math.round(s.money), happy: Math.round(s.stats.happy) });
    if (s.hist.length > 120) s.hist.shift();
  }
  refresh(s);
  demandStep(s);
  // Belegung nähert sich der Zufriedenheit an
  const target = Math.max(0.25, Math.min(1, 0.3 + s.stats.happy / 100 * 0.8));
  s.occupancy += (target - s.occupancy) * 0.12;
  growStep(s);
  if (s.dirty) refresh(s);
  financeStep(s);
  eventsStep(s);
  adviceStep(s);
}

export const dateStr = (s) => `${MONTHS[s.month]} ${s.year}`;

// ---------------------------------------------------------------- Abfrage einer Kachel (für das Info-Fenster)
export function tileInfo(s, x, y) {
  if (!inb(x, y)) return null;
  const i = idx(x, y); const m = s.maps;
  const lines = [];
  const b = buildingAt(s, x, y);
  let title = 'Freifläche';
  if (b) { const d = BUILD[b.type]; title = d.name; lines.push(d.desc); lines.push(`Unterhalt ${d.up} €/Monat`); }
  else if (s.terrain[i] === T_WATER) title = s.road[i] ? 'Brücke über den Main' : 'Main';
  else if (s.road[i]) title = 'Straße';
  else if (s.zone[i]) {
    const zz = ZONES[s.zone[i]]; title = `${zz.name}${s.lvl[i] ? ' – Stufe ' + s.lvl[i] : ' (unbebaut)'}`;
    if (s.lvl[i]) lines.push(zz.pop[s.lvl[i]] ? `Wohnplatz für ${zz.pop[s.lvl[i]]} Einwohner` : `${zz.jobs[s.lvl[i]]} Arbeitsplätze`);
    if (!hasRoadNear(s, x, y)) lines.push('⚠ Keine Straße in der Nähe');
    if (!s.powered[i]) lines.push('⚠ Kein Strom');
  } else if (s.terrain[i] === T_TREES) title = 'Wald';
  if (s.fire[i]) lines.push('🔥 Es brennt!');
  if (s.flood[i]) lines.push('🌊 Überschwemmt');
  lines.push(`Grundwert ${Math.round(m.value[i])} · Kriminalität ${Math.round(m.crime[i])} · Dreck ${Math.round(m.pol[i])}`);
  if (s.road[i]) lines.push(`Verkehr ${Math.round(m.traffic[i] * 55)} / 55`);
  return { title, lines };
}
