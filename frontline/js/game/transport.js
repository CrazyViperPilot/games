// Straßentransport (PRD §15 „Straßentransport“, seit v5.20, AP2): Wege über Straßenzellen von Förderung und Werken zu ihren Zielen
// (Werke, Lager der Hauptstadt), Pendlerwege zur nächsten bewohnten Wohnzelle und Stau je Straßenzelle. Dieses Modul rechnet nur Wege
// und Stau, es ändert nichts am Spiel. Kein DOM. Wege, Lasten und Puffer liegen in einer WeakMap je Stadt und werden nicht gespeichert
// (sie folgen allein aus dem Stand der Stadt); gespeichert wird nur der geglättete Stau-Faktor je Zelle (c.congestion), damit ein
// geladener Spielstand genau so weiterläuft wie das Spiel ohne Unterbrechung.
import { laneGrid } from './roads.js';
import { CITY } from '../data/city.js';
import { WORKS, WORKPLACE_KINDS, KINDS, KIND_ID, KIND_NAME } from '../data/citykinds.js'; // Arbeitsstätten mit Pendlerweg: alle Arten mit Arbeitsplätzen
import { GOODS } from '../data/goods.js';
import { DEPOSITS, isPart, roadAt, accessCells, mainAccess, cellsOf, anchorOf, nbrsOf } from './city/cells.js';
export { mainAccess }; // liegt seit dem Paket „Straßen“ in cells.js (Anschlusspflicht des Baugebiets)

/** Ziel je Rohstoff der Förderung (Vorkommen) und je Zwischenprodukt: Gruppe der Zielwerke (Breitensuche-Feld, siehe groupOf). */
const MINE_GROUP = { wood: 'bm', stone: 'bm', ore: 'smelter', oil: 'oil' };
/** Werkart → Gruppe der Zielgebäude, an die ihr Rohstoff geliefert wird (Öl: Raffinerie oder Kerosin-Raffinerie). */
const GROUP_OF_KIND = { bm: 'bm', smelter: 'smelter', steel: 'steel', fuel: 'oil', kero: 'oil' };
/** Produkte fahren zum Lager der Hauptstadt (`'main'`): Werke, deren Ware ein Lager hat (Register js/data/goods.js; Roheisen nicht). */
const PRODUCT_KINDS = WORKS.filter((k) => GOODS[CITY.chain[k].to]?.store);
/** Kennung des Lagers der Hauptstadt im Breitensuche-Feld (Besitzer). Gebäude haben als Besitzer ihren Anker (≥ 0). */
const MAIN = -1;
/** Weg ohne Straßenzellen (Lieferung direkt an ein angrenzendes Werk, seit Paket „Direkte Lieferung“): Länge 0, Wirkung 1, keine Last. */
const NO_PATH = new Int32Array(0);
/** Breitensuche-Warteschlange, einmal angelegt und wiederverwendet (nur innerhalb von nearestField genutzt). */
let QUEUE = new Int32Array(0);

/** Zustand je Stadt (WeakMap), nicht im Spielstand. */
const STATE = new WeakMap();

/** Abstand zu 1, ab dem ein Stau-Faktor ohne Last als frei gilt (Rechengenauigkeit, kein Spielwert). */
const FREE_EPS = 1e-4;

/** Gruppen der Breitensuche-Felder, die transportOf anlegt. */
const GROUPS = ['bm', 'smelter', 'steel', 'oil', 'res', 'main'];

/** Ausbildungsgebäude der Stadt (CITY.produces: Kaserne, Fabrikhalle, Heliport, Stellplatz), versorgt über ihren Weg zum Lager (Paket „Straßen“). */
const TRAINERS = new Set(Object.keys(CITY.produces).map((k) => KIND_ID[k]));

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

/** Last `amount` (Einheiten je s) auf alle Zellen des Weges legen. Kein Weg (null): nichts. Merkt die Zellen in der Liste `active`. */
export function addLoad(tr, path, amount) {
  if (!path) return;
  const { load, on, active } = tr;
  for (let k = 0; k < path.length; k++) {
    const i = path[k];
    if (!on[i]) {
      on[i] = 1;
      active[tr.nActive++] = i;
    }
    load[i] += amount;
  }
}

/**
 * Last auf 0 setzen (zu Beginn jedes Schritts). Nur die Zellen der Liste `active` (mit Last oder Stau) tragen etwas, so läuft der
 * Schritt nicht über alle Straßen der Karte.
 */
export function beginLoads(tr) {
  const { load, active } = tr;
  for (let k = 0; k < tr.nActive; k++) load[active[k]] = 0;
}

/** Kleinster Stau-Faktor der Zellen, die in diesem Schritt Last tragen (1 ohne Last). */
export function minFactor(tr) {
  const { load, factor, active } = tr;
  let m = 1;
  for (let k = 0; k < tr.nActive; k++) {
    const i = active[k];
    if (load[i] > 0 && factor[i] < m) m = factor[i];
  }
  return m;
}

/**
 * Stau-Faktor aus Last und Kapazität glätten (Ende des Schritts): Ziel = min(1, cap / Last), f += (Ziel − f) × min(1, dt / smooth).
 * Die Wirkung gilt also erst im nächsten Schritt (eine Runde Verzögerung).
 */
export function settleLoads(tr, dt) {
  const smooth = CITY.transport.smooth;
  const k = smooth > 0 ? Math.min(1, dt / smooth) : 1;
  const { load, factor, active, on } = tr;
  let w = 0;
  for (let m = 0; m < tr.nActive; m++) {
    const i = active[m];
    const L = load[i];
    const cap = tr.cap[i];
    const target = L > cap ? cap / L : 1;
    let f = factor[i] + (target - factor[i]) * k;
    // ohne Last und fast frei: ganz frei und aus der Liste (sonst bliebe der Wert in Float32 knapp unter 1 hängen)
    if (L === 0 && f > 1 - FREE_EPS) f = 1;
    factor[i] = f;
    if (L === 0 && f === 1) on[i] = 0;
    else active[w++] = i;
  }
  tr.nActive = w;
}

/**
 * Straßenzellen am Lager der Hauptstadt: alle Straßen, deren Zellrechteck das Rechteck der Hauptstadt, erweitert um
 * CITY.fobMargin + CITY.cell px, schneidet. Leer ohne Hauptstadt.
 */

/** Neuen Zustand anlegen: Typed Arrays je Zelle, einmal (Feld-Puffer und Last/Stau werden wiederverwendet). */
function newTransport(c) {
  const n = c.cols * c.rows;
  // Stau-Faktor je Zelle: liegt in der Stadt (gespeichert, createTeamCity/migrateCity); fehlt er (Teststädte), eigener Puffer
  const factor = c.congestion?.length === n ? c.congestion : new Float32Array(n).fill(1);
  const fields = {};
  for (const g of GROUPS) fields[g] = { dist: new Int32Array(n), prev: new Int32Array(n), owner: new Int32Array(n) };
  return {
    routes: new Map(),
    commute: new Map(),
    mun: new Map(),
    shop: new Map(),
    depot: new Map(), // seit v5.35: Kerosintank und Munitionslager ↔ Lager
    supply: new Map(), // Paket „Straßen“: Ausbildungsgebäude ↔ Lager
    load: new Float32Array(n),
    factor,
    cap: new Float32Array(n),
    list: new Int32Array(0), // Straßenzellen mit Kapazität
    active: new Int32Array(n), // Straßenzellen mit Last oder Stau (die ersten nActive), nur sie rechnet der Schritt
    nActive: 0,
    on: new Uint8Array(n), // 1 = Zelle steht in active
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

/**
 * Angrenzende Zielwerke des Lieferanten a (Paket „Direkte Lieferung“): Anker aus `owners`, deren Zellen eine 4er-Nachbarzelle einer
 * Zelle von a haben. Sortiert nach Anker (fest, unabhängig von der Reihenfolge der Suche).
 */
function adjacentOwners(c, a, owners) {
  const mine = cellsOf(c, a);
  const out = [];
  for (const o of owners) {
    if (o === a) continue;
    if (mine.some((j) => nbrsOf(c, j).some((n) => c.kind[n] && anchorOf(c, n) === o))) out.push(o);
  }
  return out.sort((p, q) => p - q);
}

/**
 * Weg vom Gebäude a zum nächsten Ziel der Gruppe; ohne Weg { to: null, path: null, dist: 0 }. Grenzt ein Zielwerk der Gruppe direkt
 * an (`adj`, Anker sortiert), ist das erste davon das Ziel, mit leerem Weg (dist 0).
 */
function routeOf(c, tr, a, group, adj = []) {
  if (adj.length) return { to: adj[0], path: NO_PATH, dist: 0 };
  const hit = pathFrom(tr.fields[group], accessCells(c, a));
  if (!hit) return { to: null, path: null, dist: 0 };
  return { to: hit.owner === MAIN ? 'main' : hit.owner, path: hit.path, dist: hit.path.length };
}

/**
 * Anschluss eines Ausbildungsgebäudes oder Lagers des Fliegerhorsts an das Straßennetz (Paket „Straßen“): seine Straßenzellen
 * (accessCells); an Rollfeld oder Bahn erreicht es die Straße über diese Betonflächen (sie tragen selbst keinen Verkehr), dann zählen
 * die Straßen an ihrem Rand (wie beim Anschluss ans Lager, der Bahn und Rollfeld als Straße zählt).
 */
function supplyAccess(c, tr, a) {
  const start = accessCells(c, a);
  const out = start.filter((i) => tr.cap[i] > 0);
  const seen = new Set(start);
  const queue = start.filter((i) => !(tr.cap[i] > 0)); // Bahn und Rollfeld (flach, ohne Kapazität)
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    const col = i % c.cols;
    const row = (i - col) / c.cols;
    for (const [x, y] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]) {
      if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) continue;
      const j = y * c.cols + x;
      if (seen.has(j) || !roadAt(c, j)) continue;
      seen.add(j);
      if (tr.cap[j] > 0) out.push(j);
      else queue.push(j);
    }
  }
  return out;
}

/** Berechnet Wege, Pendler und Stau-Puffer neu (Aufruf aus transportOf). */
function build(game, c, tr) {
  const n = c.cols * c.rows;
  const capRoad = CITY.transport.cap;
  const capMap = CITY.transport.mapCap;
  let count = 0;
  tr.nActive = 0;
  // Mehrspurig (seit v5.38): parallele Straßen bilden ein Band, Kapazität × Spuren je Richtung (CITY.transport.maxLanes)
  const L = laneGrid(c.cols, c.rows, (i) => c.kind[i] === KIND_ID.road || !!c.mapRoads?.[i], CITY.transport.maxLanes);
  tr.lanes = L.lanes;
  for (let i = 0; i < n; i++) {
    const own = c.kind[i] === KIND_ID.road;
    tr.cap[i] = (own ? capRoad : c.mapRoads?.[i] ? capMap : 0) * (L.lanes[i] || 1);
    if (tr.cap[i] > 0) {
      count++;
      // Liste der Zellen mit Last oder Stau neu (auch nach dem Laden eines Spielstands: Stau-Faktor < 1)
      if (tr.on[i] || tr.factor[i] < 1) {
        tr.on[i] = 1;
        tr.active[tr.nActive++] = i;
      }
    } else {
      tr.factor[i] = 1; // keine Straße (mehr): frei
      tr.load[i] = 0;
      tr.on[i] = 0;
    }
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
  // Alle erreichbaren Zielwerke je Lieferant (seit v5.75): ein Breitensuche-Feld je Werk; die Lieferung wird in updateCity nach freier
  // Abnahme aufgeteilt (Öl auf Raffinerie und Kerosin-Raffinerie, Holz und Stein auf alle BM-Werke …)
  const perWork = {};
  for (const g of ['bm', 'smelter', 'steel', 'oil']) perWork[g] = src[g].map((s) => ({ owner: s.owner, field: nearestField(c, [s], tr.cap) }));
  nearestField(c, [mainSrc], tr.cap, tr.fields.main);

  const routes = new Map();
  const alts = new Map();
  const commute = new Map();
  const mun = new Map();
  const shop = new Map();
  const depot = new Map();
  const supply = new Map();
  for (const a of anchors) {
    const k = KINDS[c.kind[a] - 1];
    const g = groupOf(c, a);
    const works = g && perWork[g] ? perWork[g] : null;
    // Angrenzende Zielwerke (Paket „Direkte Lieferung“): ohne Straße, Weg der Länge 0, vor allen Straßenwegen
    const adj = works ? adjacentOwners(c, a, works.map((w) => w.owner)) : [];
    if (g) routes.set(a, routeOf(c, tr, a, g, adj));
    if (works) {
      const acc = accessCells(c, a);
      const list = adj.map((to) => ({ to, path: NO_PATH, dist: 0 }));
      const road = [];
      for (const w of works) {
        if (adj.includes(w.owner)) continue; // schon als direkter Nachbar gezählt
        const hit = pathFrom(w.field, acc);
        if (hit) road.push({ to: w.owner, path: hit.path, dist: hit.path.length });
      }
      road.sort((p, q) => p.dist - q.dist || p.to - q.to); // nächstes zuerst, bei Gleichstand nach Anker (fest)
      alts.set(a, list.concat(road));
    }
    if (WORKPLACE_KINDS.includes(k)) commute.set(a, pathFrom(tr.fields.res, accessCells(c, a))?.path ?? null);
    if (k === 'mun') mun.set(a, pathFrom(tr.fields.main, accessCells(c, a))?.path ?? null);
    if (k === 'com' || k === 'market') shop.set(a, pathFrom(tr.fields.main, accessCells(c, a))?.path ?? null);
    if (k === 'ktank' || k === 'mdepot') depot.set(a, pathFrom(tr.fields.main, supplyAccess(c, tr, a))?.path ?? null); // Fliegerhorst (seit v5.35; seit Paket „Straßen“ auch über Bahn und Rollfeld)
    if (TRAINERS.has(c.kind[a])) supply.set(a, pathFrom(tr.fields.main, supplyAccess(c, tr, a))?.path ?? null); // Ausbildung (Paket „Straßen“)
  }
  tr.routes = routes;
  tr.alts = alts;
  tr.commute = commute;
  tr.mun = mun;
  tr.shop = shop;
  tr.depot = depot;
  tr.supply = supply;
}

/**
 * Transportzustand der Stadt eines Teams (lazy, je Stadt eine WeakMap). Neu berechnet nur, wenn sich c.ver (Bau, Abriss, Wachstum,
 * Ruinen, seit v5.20 auch Flucht und Rückkehr der Bewohner), die Hauptstadt oder c.mapRoads ändern. Die Wege hängen nur vom Stand der
 * Stadt ab: ein geladener Spielstand ergibt dieselben Wege, und Aufrufe der Anzeige ändern nichts am Spiel.
 * Liefert { routes, commute, mun, shop, load, factor, cap, list, active, nActive }:
 *   routes:  Map<Anker, { to: Anker | 'main' | null, path: Int32Array | null, dist }>  Lieferweg je Förderung und Werk (zum nächsten Ziel)
 *   alts:    Map<Anker, [{ to, path, dist }]>  alle erreichbaren Zielwerke je Förderung bzw. Hütte, nächstes zuerst (seit v5.75)
 *   commute: Map<Anker, Int32Array | null>  Pendlerweg je Arbeitsstätte (null = kein Wohnen erreichbar)
 *   mun:     Map<Anker, Int32Array | null>  Weg Munitionswerk → Lager
 *   shop:    Map<Anker, Int32Array | null>  Weg Gewerbe/Markt → Lager
 *   depot:   Map<Anker, Int32Array | null>  Weg Kerosintank/Munitionslager → Lager (seit v5.35)
 *   supply:  Map<Anker, Int32Array | null>  Weg Ausbildungsgebäude → Lager (Paket „Straßen“; Stellplatz über Rollfeld und Bahn)
 *   load, factor, cap: Float32Array je Stadtzelle (factor = c.congestion); list: Int32Array der Straßenzellen;
 *   active (die ersten nActive): Straßenzellen mit Last oder Stau
 * `dist` = Anzahl der Straßenzellen auf dem Weg (0, wenn es kein Ziel gibt).
 */
export function transportOf(game, c) {
  const main = game.mainFob(c.team);
  let st = STATE.get(c);
  if (!st) {
    st = { tr: newTransport(c), built: false, ver: -1, main: null, mapRoads: undefined };
    STATE.set(c, st);
  }
  const fresh = st.built && st.ver === c.ver && st.main === main && st.mapRoads === c.mapRoads;
  if (!fresh) {
    build(game, c, st.tr);
    st.built = true;
    st.ver = c.ver;
    st.main = main;
    st.mapRoads = c.mapRoads;
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
  // Alle erreichbaren Zielwerke (seit v5.75): die Lieferung wird nach freier Abnahme auf sie verteilt
  const targets = (tr.alts?.get(anker) ?? []).map((x) => KIND_NAME[KINDS[c.kind[x.to] - 1]]);
  return { to, dist, eff, commuteEff, noHome, targets };
}


/**
 * Versorgung eines Ausbildungsgebäudes der Stadt (Paket „Straßen“, Teil 2; nur lesen): { path, dist, v, eff, rate }. dist = Straßenzellen
 * des Wegs zum Lager, v = Versorgungsgrad nach der Weglänge (CITY.supply), eff = Stau-Faktor des Wegs, rate = v × eff = Tempo der
 * Ausbildung. Ohne Weg (oder ohne fertiges Gebäude) rate 0.
 */
export function supplyOf(game, c, a) {
  const path = transportOf(game, c).supply.get(a) ?? null;
  if (!path) return { path: null, dist: 0, v: 0, eff: 0, rate: 0 };
  const S = CITY.supply;
  const dist = path.length;
  const v = Math.max(S.min, 1 - S.perCell * Math.max(0, dist - S.free));
  const eff = pathEff(transportOf(game, c), path);
  return { path, dist, v, eff, rate: v * eff };
}

/** Tempo der Ausbildung im Gebäude e (Ziel-Entity der Stadt; andere Gebäude: 1). */
export function trainRate(game, e) {
  if (e.type !== 'city') return 1;
  const c = game.city?.[e.team];
  return c ? supplyOf(game, c, e.cityCell).rate : 1;
}
