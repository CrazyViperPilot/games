// Straßentransport (PRD §15 „Straßentransport“, seit v5.19, AP2): Wege über Straßenzellen von Förderung und Werken zu ihren Zielen
// (Werke, Lager der Hauptstadt), Pendlerwege zur nächsten bewohnten Wohnzelle und Stau je Straßenzelle. Dieses Modul rechnet nur Wege
// und Stau, es ändert nichts am Spiel. Kein DOM. Der Zustand liegt in einer WeakMap je Stadt und wird nicht gespeichert.
import { CITY } from '../data/city.js';
import { KINDS, KIND_ID, KIND_NAME, DEPOSITS, WORKS_KINDS, isPart, roadAt, accessCells, cellRect } from './city.js';

/** Ziel je Rohstoff der Förderung (Vorkommen) und je Zwischenprodukt: Gruppe der Zielwerke (Breitensuche-Feld, siehe groupOf). */
const MINE_GROUP = { wood: 'bm', stone: 'bm', ore: 'smelter', oil: 'oil' };
/** Werkart → Gruppe der Zielgebäude, an die ihr Rohstoff geliefert wird (Öl: Raffinerie oder Kerosin-Raffinerie). */
const GROUP_OF_KIND = { bm: 'bm', smelter: 'smelter', steel: 'steel', fuel: 'oil', kero: 'oil' };
/** Produkte fahren zum Lager der Hauptstadt (`'main'`). */
const PRODUCT_KINDS = ['bm', 'steel', 'fuel', 'kero', 'mun'];
/** Arbeitsstätten mit Pendlerweg: alle Werke, Förderung, Gewerbe, Markt, Kraftwerk, Uni und Rechenzentrum. */
const WORKPLACE_KINDS = [...WORKS_KINDS, 'mine', 'com', 'market', 'power', 'uni', 'dc'];
/** Kennung des Lagers der Hauptstadt im Breitensuche-Feld (Besitzer). Gebäude haben als Besitzer ihren Anker (≥ 0). */
const MAIN = -1;
/** Breitensuche-Warteschlange, einmal angelegt und wiederverwendet (nur innerhalb von nearestField genutzt). */
let QUEUE = new Int32Array(0);

/** Zustand je Stadt (WeakMap), nicht im Spielstand. */
const STATE = new WeakMap();

/** Gruppen der Breitensuche-Felder, die transportOf anlegt. */
const GROUPS = ['bm', 'smelter', 'steel', 'oil', 'res', 'main'];

/**
 * Breitensuche von mehreren Startzellen (Quellen) aus über Straßenzellen (cap > 0), höchstens CITY.transport.maxDist Schritte.
 * `sources`: Array von { cells: Zellenindizes (Straßen am Ziel), owner: Kennung des Ziels }. Liefert { dist, prev, owner } je Zelle:
 * dist −1 = nicht erreichbar, prev −1 bei Quellen, owner = Ziel der nächsten Quelle. `out` (optional) wird wiederverwendet.
 */
export function nearestField(c, sources, cap, out = null) {
  const n = c.cols * c.rows;
  const f = out ?? { dist: new Int32Array(n), prev: new Int32Array(n), owner: new Int32Array(n) };
  const { dist, prev, owner } = f;
  dist.fill(-1);
  prev.fill(-1);
  owner.fill(-1);
  if (QUEUE.length < n) QUEUE = new Int32Array(n);
  const q = QUEUE;
  let head = 0;
  let tail = 0;
  for (const s of sources) {
    for (const i of s.cells) {
      if (!(cap[i] > 0) || dist[i] >= 0) continue;
      dist[i] = 0;
      owner[i] = s.owner;
      q[tail++] = i;
    }
  }
  const maxDist = CITY.transport.maxDist;
  const cols = c.cols;
  while (head < tail) {
    const i = q[head++];
    const d = dist[i];
    if (d >= maxDist) continue;
    const col = i % cols;
    const row = (i - col) / cols;
    for (let k = 0; k < 4; k++) {
      let j;
      if (k === 0) { if (col === 0) continue; j = i - 1; } else if (k === 1) { if (col === cols - 1) continue; j = i + 1; } else if (k === 2) { if (row === 0) continue; j = i - cols; } else { if (row === c.rows - 1) continue; j = i + cols; }
      if (!(cap[j] > 0) || dist[j] >= 0) continue;
      dist[j] = d + 1;
      prev[j] = i;
      owner[j] = owner[i];
      q[tail++] = j;
    }
  }
  return f;
}

/**
 * Kürzester Weg von einer der Zellen `starts` (Anschluss des Gebäudes) zu seinem Ziel im Feld. Liefert { path, owner } mit path als
 * Int32Array der Straßenzellen (erste = Start, letzte = Ziel-Anschluss), oder null, wenn keine Start-Zelle das Feld erreicht.
 */
export function pathFrom(field, starts) {
  let best = -1;
  let bd = Infinity;
  for (const s of starts) {
    const d = field.dist[s];
    if (d >= 0 && d < bd) {
      bd = d;
      best = s;
    }
  }
  if (best < 0) return null;
  const path = new Int32Array(bd + 1);
  let i = best;
  for (let k = 0; k <= bd; k++) {
    path[k] = i;
    i = field.prev[i];
  }
  return { path, owner: field.owner[best] };
}

/** Wirkung eines Weges: kleinster Stau-Faktor auf ihm (leerer Weg: 1, kein Weg (null): 0, es kommt nichts an). */
export function pathEff(tr, path) {
  if (!path) return 0;
  let m = 1;
  for (let k = 0; k < path.length; k++) {
    const f = tr.factor[path[k]];
    if (f < m) m = f;
  }
  return m;
}

/** Last `amount` (Einheiten je s) auf alle Zellen des Weges legen. Kein Weg (null): nichts. */
export function addLoad(tr, path, amount) {
  if (!path) return;
  for (let k = 0; k < path.length; k++) tr.load[path[k]] += amount;
}

/** Last aller Straßenzellen auf 0 setzen (zu Beginn jedes Schritts). */
export function beginLoads(tr) {
  const list = tr.list;
  for (let k = 0; k < list.length; k++) tr.load[list[k]] = 0;
}

/**
 * Stau-Faktor aus Last und Kapazität glätten (Ende des Schritts): Ziel = min(1, cap / Last), f += (Ziel − f) × min(1, dt / smooth).
 * Die Wirkung gilt also erst im nächsten Schritt (eine Runde Verzögerung).
 */
export function settleLoads(tr, dt) {
  const smooth = CITY.transport.smooth;
  const k = smooth > 0 ? Math.min(1, dt / smooth) : 1;
  const list = tr.list;
  for (let m = 0; m < list.length; m++) {
    const i = list[m];
    const L = tr.load[i];
    const cap = tr.cap[i];
    const target = L > cap ? cap / L : 1;
    tr.factor[i] += (target - tr.factor[i]) * k;
  }
}

/**
 * Straßenzellen am Lager der Hauptstadt: alle Straßen, deren Zellrechteck das Rechteck der Hauptstadt, erweitert um
 * CITY.fobMargin + CITY.cell px, schneidet. Leer ohne Hauptstadt.
 */
export function mainAccess(game, c) {
  const m = game.mainFob(c.team);
  if (!m) return [];
  const T = game.grid.tile;
  const e = CITY.fobMargin + c.cell;
  const x0 = m.cx * T - e;
  const x1 = (m.cx + m.w) * T + e;
  const y0 = m.cy * T - e;
  const y1 = (m.cy + m.h) * T + e;
  const out = [];
  const n = c.cols * c.rows;
  for (let i = 0; i < n; i++) {
    if (!roadAt(c, i)) continue;
    const r = cellRect(c, i % c.cols, Math.floor(i / c.cols));
    if (r.x0 < x1 && r.x1 > x0 && r.y0 < y1 && r.y1 > y0) out.push(i);
  }
  return out;
}

/** Neuen Zustand anlegen: Typed Arrays je Zelle, einmal (Feld-Puffer und Last/Stau werden wiederverwendet). */
function newTransport(c) {
  const n = c.cols * c.rows;
  const fields = {};
  for (const g of GROUPS) fields[g] = { dist: new Int32Array(n), prev: new Int32Array(n), owner: new Int32Array(n) };
  return {
    routes: new Map(),
    commute: new Map(),
    mun: new Map(),
    shop: new Map(),
    load: new Float32Array(n),
    factor: new Float32Array(n).fill(1),
    cap: new Float32Array(n),
    list: new Int32Array(0), // Straßenzellen mit Kapazität
    fields,
  };
}

/** Gruppe des Lieferanten (Anker a): wo sein Produkt oder Rohstoff hinfährt. null = keine Lieferung. */
function groupOf(c, a) {
  const k = KINDS[c.kind[a] - 1];
  if (k === 'mine') return MINE_GROUP[DEPOSITS[c.deposit[a] - 1]] ?? null;
  if (k === 'smelter') return 'steel'; // Roheisen → Stahlwerk
  if (PRODUCT_KINDS.includes(k)) return 'main';
  return null;
}

/** Weg vom Gebäude a zum nächsten Ziel der Gruppe; ohne Weg { to: null, path: null, dist: 0 }. */
function routeOf(c, tr, a, group) {
  const hit = pathFrom(tr.fields[group], accessCells(c, a));
  if (!hit) return { to: null, path: null, dist: 0 };
  return { to: hit.owner === MAIN ? 'main' : hit.owner, path: hit.path, dist: hit.path.length };
}

/** Berechnet Wege, Pendler und Stau-Puffer neu (Aufruf aus transportOf). */
function build(game, c, tr) {
  const n = c.cols * c.rows;
  const capRoad = CITY.transport.cap;
  const capMap = CITY.transport.mapCap;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const own = c.kind[i] === KIND_ID.road;
    tr.cap[i] = own ? capRoad : c.mapRoads?.[i] ? capMap : 0;
    if (tr.cap[i] > 0) count++;
    else tr.factor[i] = 1;
  }
  tr.list = new Int32Array(count);
  let m = 0;
  for (let i = 0; i < n; i++) if (tr.cap[i] > 0) tr.list[m++] = i;

  // Quellen je Gruppe: fertige Gebäude (Anker), Wohnen nur bewohnt (Stufe ≥ 1, nicht geflohen)
  const src = { bm: [], smelter: [], steel: [], oil: [], res: [] };
  const anchors = []; // fertige Gebäude (Anker)
  for (const i of c.list) {
    if (isPart(c, i) || !c.level[i]) continue;
    anchors.push(i);
    const k = KINDS[c.kind[i] - 1];
    const g = GROUP_OF_KIND[k];
    if (g) src[g].push({ cells: accessCells(c, i), owner: i });
    if (k === 'res' && c.flee[i] === 0) src.res.push({ cells: accessCells(c, i), owner: i });
  }
  const mainSrc = { cells: mainAccess(game, c), owner: MAIN };
  for (const g of ['bm', 'smelter', 'steel', 'oil', 'res']) nearestField(c, src[g], tr.cap, tr.fields[g]);
  nearestField(c, [mainSrc], tr.cap, tr.fields.main);

  const routes = new Map();
  const commute = new Map();
  const mun = new Map();
  const shop = new Map();
  for (const a of anchors) {
    const k = KINDS[c.kind[a] - 1];
    const g = groupOf(c, a);
    if (g) routes.set(a, routeOf(c, tr, a, g));
    if (WORKPLACE_KINDS.includes(k)) commute.set(a, pathFrom(tr.fields.res, accessCells(c, a))?.path ?? null);
    if (k === 'mun') mun.set(a, pathFrom(tr.fields.main, accessCells(c, a))?.path ?? null);
    if (k === 'com' || k === 'market') shop.set(a, pathFrom(tr.fields.main, accessCells(c, a))?.path ?? null);
  }
  tr.routes = routes;
  tr.commute = commute;
  tr.mun = mun;
  tr.shop = shop;
}

/**
 * Transportzustand der Stadt eines Teams (lazy, je Stadt eine WeakMap). Neu berechnet, wenn sich c.ver, die Hauptstadt oder
 * c.mapRoads ändern oder seit der letzten Berechnung mindestens CITY.transport.reroute s vergangen sind (Zeit: game.time).
 * Liefert { routes, commute, mun, shop, load, factor, cap, list }:
 *   routes:  Map<Anker, { to: Anker | 'main' | null, path: Int32Array | null, dist }>  Lieferweg je Förderung und Werk
 *   commute: Map<Anker, Int32Array | null>  Pendlerweg je Arbeitsstätte (null = kein Wohnen erreichbar)
 *   mun:     Map<Anker, Int32Array | null>  Weg Munitionswerk → Lager
 *   shop:    Map<Anker, Int32Array | null>  Weg Gewerbe/Markt → Lager
 *   load, factor, cap: Float32Array je Stadtzelle; list: Int32Array der Straßenzellen
 * `dist` = Anzahl der Straßenzellen auf dem Weg (0, wenn es kein Ziel gibt).
 */
export function transportOf(game, c) {
  const main = game.mainFob(c.team);
  const now = game.time;
  let st = STATE.get(c);
  if (!st) {
    st = { tr: newTransport(c), built: false, ver: -1, main: null, mapRoads: undefined, time: 0 };
    STATE.set(c, st);
  }
  const fresh = st.built && st.ver === c.ver && st.main === main && st.mapRoads === c.mapRoads && now >= st.time && now - st.time < CITY.transport.reroute;
  if (!fresh) {
    build(game, c, st.tr);
    st.built = true;
    st.ver = c.ver;
    st.main = main;
    st.mapRoads = c.mapRoads;
    st.time = now;
  }
  return st.tr;
}

/**
 * Anzeige eines Gebäudes (nur lesen): { to: 'Lager' | Name des Zielwerks | null, dist, eff, commuteEff, noHome }.
 * eff = Wirkung des Lieferwegs (0 ohne Weg), commuteEff = Wirkung des Pendlerwegs (0 ohne Wohnen; 1, wenn das Gebäude kein Arbeitsplatz ist),
 * noHome = Arbeitsstätte ohne erreichbare Wohnung.
 */
export function transportInfo(game, c, anker) {
  const tr = transportOf(game, c);
  const r = tr.routes.get(anker);
  let to = null;
  let dist = 0;
  let eff = 0;
  if (r && r.to !== null) {
    to = r.to === 'main' ? 'Lager' : KIND_NAME[KINDS[c.kind[r.to] - 1]];
    dist = r.dist;
    eff = pathEff(tr, r.path);
  }
  let commuteEff = 1;
  let noHome = false;
  if (tr.commute.has(anker)) {
    const p = tr.commute.get(anker);
    noHome = p === null;
    commuteEff = pathEff(tr, p);
  }
  return { to, dist, eff, commuteEff, noHome };
}

