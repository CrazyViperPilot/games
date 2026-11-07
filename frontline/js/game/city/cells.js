// Stadt (PRD §15), Zellgeometrie und Straßenzugang: Raster, Großbauten (Anker, Quadrat), Zelle frei, Straße daneben, Zugangszellen.
// Blattmodul ohne Rückimporte (nur Daten): transport.js, aircraft.js, research.js und die Darstellung lesen hier, ohne einen
// Importzyklus zu bilden (Review A-01, seit v5.60). Kein DOM, deterministisch.
import { CITY } from '../../data/city.js';
import { KINDS, KIND_ID, FLAT_KINDS } from '../../data/citykinds.js';

/** Flache Zellen (seit v5.35): Straße, Start-/Landebahn und Rollfeld (seit v5.37) wachsen nicht, haben kein Gebäude und zählen als Straßenanschluss. */
const FLAT_ID = new Uint8Array(KINDS.length + 1);
for (const k of FLAT_KINDS) FLAT_ID[KIND_ID[k]] = 1;
export const isFlat = (id) => FLAT_ID[id] === 1;

/** Rohstoffvorkommen (Code im Raster `deposit`): 0 keins. */
export const DEPOSITS = ['wood', 'stone', 'ore', 'oil'];
export const DEPOSIT_NAME = { wood: 'Wald', stone: 'Fels', ore: 'Erz', oil: 'Öl' };
export const MINE_NAME = { wood: 'Holzfäller', stone: 'Steinbruch', ore: 'Erzmine', oil: 'Ölquelle' };

/** Liegt die Zelle mit linker oberer Ecke (cx0, cy0) unter oder am Rand einer Hauptstadt (CITY.fobMargin)? */
export function nearMain(mains, T, cx0, cy0) {
  const S = CITY.cell;
  const m = CITY.fobMargin;
  return mains.some((b) => cx0 < (b.cx + b.w) * T + m && cx0 + S > b.cx * T - m && cy0 < (b.cy + b.h) * T + m && cy0 + S > b.cy * T - m);
}

/** Zelle (Spalte, Zeile) eines Weltpunkts. */
export function cellAt(c, x, y) {
  return [Math.floor((x - c.x0) / c.cell), Math.floor((y - c.y0) / c.cell)];
}

/** Zellindex aus Spalte und Zeile. */
export const idx = (c, col, row) => row * c.cols + col;

// ---- Großbauten (seit v5.00, CITY.size): ein Gebäude über n × n Zellen, verwaltet über seine Mittelzelle (Anker) ----

/** Kantenlänge (Zellen) eines Gebäudes dieser Art: CITY.size oder 1. */
export function sizeOf(kind) {
  return CITY.size[kind] ?? 1;
}

/** Mittelzelle des Großbaus, zu dem Zelle i gehört; bei Einzelzellen i selbst. */
export function anchorOf(c, i) {
  const p = c.part?.[i];
  return p ? p - 1 : i;
}

/** Zelle i gehört zu einem Großbau, ist aber nicht seine Mitte (wächst, zählt und trifft nicht selbst). */
export function isPart(c, i) {
  const p = c.part?.[i];
  return !!p && p - 1 !== i;
}

/**
 * Ausdehnung eines n × n-Großbaus um seinen Anker in Zellen: [lo, hi] (Zellen links/oben bzw. rechts/unten des Ankers). Ungerade n:
 * der Anker ist die Mitte; gerade n (seit v5.03): der Anker ist die linke obere der vier Mittelzellen (eine Zelle mehr nach rechts unten).
 */
export function bigSpan(n) {
  const lo = Math.floor((n - 1) / 2);
  return [lo, n - 1 - lo];
}

/** Mitte (px) und halbe Kantenlänge eines n × n-Großbaus mit Anker a. */
export function bigCenter(c, a, n) {
  const [lo, hi] = bigSpan(n);
  const q = a % c.cols;
  const r = (a - q) / c.cols;
  const off = ((hi - lo) / 2 + 0.5) * c.cell;
  return { x: c.x0 + q * c.cell + off, y: c.y0 + r * c.cell + off, half: (n * c.cell) / 2 };
}

/**
 * Anker des n × n-Quadrats eines Großbaus der Art `kind`, dessen Mitte dem Weltpunkt (x, y) am nächsten liegt (seit v5.08, Bauvorschau:
 * das Quadrat folgt dem Finger; bei gerader Kantenlänge liegt der Finger nahe der Mitte statt in der linken oberen Mittelzelle).
 */
export function bigAnchorAt(c, kind, x, y) {
  const n = sizeOf(kind);
  const [lo] = bigSpan(n);
  const q = Math.round((x - c.x0) / c.cell - n / 2) + lo;
  const r = Math.round((y - c.y0) / c.cell - n / 2) + lo;
  return [Math.min(c.cols - 1, Math.max(0, q)), Math.min(c.rows - 1, Math.max(0, r))];
}

/** Zellen des n × n-Quadrats um den Anker a (ohne Prüfung der Kartengrenzen; bigFits prüft sie). */
export function bigCells(c, a, n) {
  const [lo, hi] = bigSpan(n);
  const q = a % c.cols;
  const r = (a - q) / c.cols;
  const out = [];
  for (let y = r - lo; y <= r + hi; y++) for (let x = q - lo; x <= q + hi; x++) out.push(y * c.cols + x);
  return out;
}

/** Alle Zellen des Gebäudes in Zelle i (Großbau: das ganze Quadrat, sonst nur i). */
export function cellsOf(c, i) {
  if (!c.part?.[i]) return [i];
  const a = c.part[i] - 1;
  return bigCells(c, a, sizeOf(KINDS[c.kind[a] - 1]));
}

/**
 * Passt ein n × n-Großbau mit Mitte a? Alle Zellen auf der Karte, ausweisbar, ohne Hindernis oder fremdes Gebäude und `free(j)`
 * (Standard: leer).
 */
export function bigFits(game, c, a, n, free = (j) => !c.kind[j], ok = (j) => canZone(game, c, j)) {
  const [lo, hi] = bigSpan(n);
  const q = a % c.cols;
  const r = (a - q) / c.cols;
  if (q - lo < 0 || r - lo < 0 || q + hi >= c.cols || r + hi >= c.rows) return false;
  for (let y = r - lo; y <= r + hi; y++) {
    for (let x = q - lo; x <= q + hi; x++) {
      const j = y * c.cols + x;
      if (!ok(j) || !free(j) || !cellFree(game, c, x, y)) return false;
    }
  }
  return true;
}

/**
 * Mitte für einen Großbau der Art `kind`, der die Zelle (col, row) enthält: zuerst genau dort, sonst so weit verschoben,
 * dass er passt (erst gerade, dann schräg). −1, wenn nichts passt.
 */
export function fitBig(game, c, col, row, kind, free, ok) {
  const n = sizeOf(kind);
  const [lo, hi] = bigSpan(n);
  const offs = [];
  for (let dy = -hi; dy <= lo; dy++) for (let dx = -hi; dx <= lo; dx++) offs.push([dx, dy]); // Anker so, dass (col, row) im Quadrat liegt
  offs.sort((p, o) => Math.abs(p[0]) + Math.abs(p[1]) - Math.abs(o[0]) - Math.abs(o[1]) || Math.max(Math.abs(p[0]), Math.abs(p[1])) - Math.max(Math.abs(o[0]), Math.abs(o[1])));
  for (const [dx, dy] of offs) {
    const x = col + dx;
    const y = row + dy;
    if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) continue;
    if (!bigFits(game, c, y * c.cols + x, n, free, ok)) continue;
    // Mit Prüfung `ok` und Baugebiet: Anschlusspflicht des ganzen Großbaus (eine Randzelle an einer Straße zum Lager genügt)
    if (ok && roadLinkWhy(game, c, bigCells(c, y * c.cols + x, n), kind)) continue;
    return y * c.cols + x;
  }
  return -1;
}

/** Rechteck einer Stadtzelle auf der Karte (px). */
export function cellRect(c, col, row) {
  const x = c.x0 + col * c.cell;
  const y = c.y0 + row * c.cell;
  return { x0: x, y0: y, x1: x + c.cell, y1: y + c.cell, x: x + c.cell / 2, y: y + c.cell / 2 };
}

/** Kacheln einer Zelle (Spalte, Zeile im Spielraster) durchlaufen. */
export function eachTile(game, c, col, row, fn) {
  const T = game.grid.tile;
  const r = cellRect(c, col, row);
  for (let y = r.y0 / T; y < r.y1 / T; y++) for (let x = r.x0 / T; x < r.x1 / T; x++) fn(x, y);
}

/** Gebäude entsteht: Fläche frei (kein anderes Gebäude, kein Hindernis)? */
export function cellFree(game, c, col, row) {
  let ok = true;
  eachTile(game, c, col, row, (x, y) => {
    const i = game.grid.idx(x, y);
    if (game.grid.terrain[i] || (game.grid.struct[i] && game.grid.struct[i] !== c.gridId)) ok = false;
  });
  return ok;
}

/** Stadtgebäude abgerissen: Zelle wieder begehbar. */
export function releaseCell(game, c, col, row) {
  eachTile(game, c, col, row, (x, y) => {
    const i = game.grid.idx(x, y);
    if (game.grid.struct[i] === c.gridId) game.grid.struct[i] = 0;
  });
}

/** Eigene Straße oder Stadtstraße der Karte (Zone, Brücke; seit v5.03) in Zelle i? */
export function roadAt(c, i) {
  return isFlat(c.kind[i]) || !!c.mapRoads?.[i]; // seit v5.35 auch die Start-/Landebahn (Rollen, Anschluss)
}

/** Hat die Zelle eine Straße als direkten Nachbarn (4er-Nachbarschaft)? Stadtstraßen der Karte zählen mit. */
function roadNext(c, col, row) {
  return (
    (col > 0 && roadAt(c, idx(c, col - 1, row))) ||
    (col < c.cols - 1 && roadAt(c, idx(c, col + 1, row))) ||
    (row > 0 && roadAt(c, idx(c, col, row - 1))) ||
    (row < c.rows - 1 && roadAt(c, idx(c, col, row + 1)))
  );
}

/** Arten, die ihren Straßenanschluss auch über genau eine Zelle gleicher Art bekommen (seit v5.05 auch das Baumaterial-Werk). */
const CHAIN = new Set(['res', 'com', 'bm'].map((k) => KIND_ID[k]));

/** Straßenanschluss: Nachbar ist Straße. Wohnen, Gewerbe und BM-Werk reichen auch über genau eine Zelle gleicher Art
 *  (Wohnen-Wohnen-Straße ok, BM-Werk-BM-Werk-Straße ok, Wohnen-Gewerbe-Straße für Wohnen nicht); die Zelle dazwischen muss selbst
 *  direkt an der Straße liegen. */
export function hasRoad(c, col, row) {
  const i0 = idx(c, col, row);
  if (c.part?.[i0]) {
    // Großbau: irgendeine seiner Zellen an der Straße; das 2 × 2-BM-Werk (seit v5.08) auch über ein benachbartes BM-Werk, das selbst
    // direkt an der Straße liegt (wie die Einzelzellen seit v5.05)
    const all = cellsOf(c, i0);
    const direct = (cs) => cs.some((j) => roadNext(c, j % c.cols, Math.floor(j / c.cols)));
    if (direct(all)) return true;
    const k = c.kind[i0];
    if (!CHAIN.has(k)) return false;
    const a = anchorOf(c, i0);
    for (const j of all) {
      const q = j % c.cols;
      const r = (j - q) / c.cols;
      for (const [x, y] of [[q - 1, r], [q + 1, r], [q, r - 1], [q, r + 1]]) {
        if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) continue;
        const n = idx(c, x, y);
        if (c.kind[n] === k && anchorOf(c, n) !== a && direct(cellsOf(c, n))) return true;
      }
    }
    return false;
  }
  if (roadNext(c, col, row)) return true;
  const k = c.kind[idx(c, col, row)];
  if (!CHAIN.has(k)) return false;
  return (
    (col > 0 && c.kind[idx(c, col - 1, row)] === k && roadNext(c, col - 1, row)) ||
    (col < c.cols - 1 && c.kind[idx(c, col + 1, row)] === k && roadNext(c, col + 1, row)) ||
    (row > 0 && c.kind[idx(c, col, row - 1)] === k && roadNext(c, col, row - 1)) ||
    (row < c.rows - 1 && c.kind[idx(c, col, row + 1)] === k && roadNext(c, col, row + 1))
  );
}

/** Straßenzellen (4er-Nachbarschaft) um die Zellen `cells`, ohne Doppelte, an `out` angehängt. */
function roadsAround(c, cells, out) {
  for (const j of cells) {
    const q = j % c.cols;
    const r = (j - q) / c.cols;
    for (const [x, y] of [[q - 1, r], [q + 1, r], [q, r - 1], [q, r + 1]]) {
      if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) continue;
      const n = idx(c, x, y);
      if (roadAt(c, n) && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/**
 * Anschluss eines Gebäudes für den Transport (seit v5.20, PRD §15): alle Straßenzellen, die an eine seiner Zellen grenzen (Gebäude
 * mit Anker a, Großbau inklusive). Hat es keine, gilt wie in hasRoad die Kette: Anschluss eines direkt benachbarten Gebäudes gleicher
 * Art (nur Wohnen, Gewerbe, BM-Werk). Liefert ein Array der Zellenindizes (leer = kein Anschluss).
 */
export function accessCells(c, a) {
  const anchor = anchorOf(c, a);
  const k = c.kind[anchor];
  const cells = cellsOf(c, anchor);
  const own = roadsAround(c, cells, []);
  if (own.length || !CHAIN.has(k)) return own;
  const out = [];
  for (const j of cells) {
    const q = j % c.cols;
    const r = (j - q) / c.cols;
    for (const [x, y] of [[q - 1, r], [q + 1, r], [q, r - 1], [q, r + 1]]) {
      if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) continue;
      const n = idx(c, x, y);
      if (c.kind[n] !== k || anchorOf(c, n) === anchor) continue;
      roadsAround(c, cellsOf(c, anchorOf(c, n)), out);
    }
  }
  return out;
}

/** Darf `team` die Zelle i ausweisen? Nicht gesperrt, nicht vom Gegner belegt (überall auf der Karte). */
export function canZone(game, c, i) {
  if (c.blocked[i]) return false; // seit v4.87 überall, nicht nur im Gebiet (das Gebiet nutzt nur noch die KI)
  if (c.mapRoads?.[i]) return false; // Stadtstraße der Karte (Zone, Brücke): gehört niemandem, bleibt Straße
  for (const o of game.city) if (o !== c && o.kind[i]) return false;
  return true;
}

/** Meldungen, warum das Baugebiet eine Zelle sperrt (Schlüssel aus buildWhy). */
export const BUILD_BLOCK = {
  territory: 'Nur im eigenen Gebiet bauen (Gebiet wächst mit FOBs und Gebäuden)',
  unexplored: 'Unerkundetes Gelände: erst aufklären',
  enemy: 'Zu nah am Feind',
  zone: 'Nicht in der Konfliktzone',
  road: 'Nur an einer Straße bauen, die mit dem Lager der Hauptstadt verbunden ist',
};

/**
 * Straßenzellen um das Lager der Hauptstadt (seit v5.20, AP4; liegt seit dem Paket „Straßen“ hier, transport.js reicht sie weiter):
 * Straßen, deren Rechteck die Zone um die Hauptstadt (Gebäude + CITY.fobMargin + eine Zelle) schneidet.
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
  // nur der Zellbereich um das Rechteck (die genaue Prüfung folgt je Zelle)
  const q0 = Math.max(0, Math.floor((x0 - c.x0) / c.cell) - 1);
  const q1 = Math.min(c.cols - 1, Math.floor((x1 - c.x0) / c.cell) + 1);
  const r0 = Math.max(0, Math.floor((y0 - c.y0) / c.cell) - 1);
  const r1 = Math.min(c.rows - 1, Math.floor((y1 - c.y0) / c.cell) + 1);
  for (let row = r0; row <= r1; row++) {
    for (let col = q0; col <= q1; col++) {
      const i = row * c.cols + col;
      if (!roadAt(c, i)) continue;
      const r = cellRect(c, col, row);
      if (r.x0 < x1 && r.x1 > x0 && r.y0 < y1 && r.y1 > y0) out.push(i);
    }
  }
  return out;
}

// Anschlusspflicht (Paket „Straßen“, Teil 1): je Stadt eine Maske „Zelle grenzt an eine Straße, die mit dem Lager der Hauptstadt
// verbunden ist“ (höchstens CITY.transport.maxDist Schritte wie der Lieferweg). Zwischenspeicher, nicht im Spielstand: neu, sobald
// sich die Stadt (c.ver; Straßen, Bagger) oder die Hauptstadt ändert. So kostet jede Zellprüfung nur einen Feldzugriff.
const LINK_CACHE = new WeakMap(); // Stadt → { ver, main, mask }

export function roadLinked(game, c) {
  const m = game.mainFob(c.team);
  const key = m ? `${m.id}:${m.cx}:${m.cy}` : '';
  const hit = LINK_CACHE.get(c);
  if (hit && hit.ver === c.ver && hit.main === key) return hit.mask;
  const n = c.cols * c.rows;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let tail = 0;
  for (const i of mainAccess(game, c)) {
    if (dist[i] >= 0) continue;
    dist[i] = 0;
    queue[tail++] = i;
  }
  const maxDist = CITY.transport.maxDist;
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    if (dist[i] >= maxDist) continue;
    for (const j of nbrsOf(c, i)) {
      if (dist[j] >= 0 || !roadAt(c, j)) continue;
      dist[j] = dist[i] + 1;
      queue[tail++] = j;
    }
  }
  const mask = new Uint8Array(n);
  for (let h = 0; h < tail; h++) for (const j of nbrsOf(c, queue[h])) mask[j] = 1;
  LINK_CACHE.set(c, { ver: c.ver, main: key, mask });
  return mask;
}

/** Gilt die Anschlusspflicht für die Zellenart `kind`? Nicht für Straße, Bahn, Rollfeld und CITY.build.roadFree (Förderanlagen). */
function needsLink(game, kind) {
  return !!game.buildRules && CITY.build.needRoad && !(kind && (isFlat(KIND_ID[kind]) || CITY.build.roadFree.includes(kind)));
}

/**
 * Anschlusspflicht eines ganzen Gebäudes aus den Zellen `cells` (Großbau: alle Zellen des Quadrats): 'road', wenn keine Zelle an einer
 * Straße zum Lager liegt; Wohnen, Gewerbe und BM-Werk dürfen wie bei hasRoad auch über ein direkt benachbartes Gebäude gleicher Art
 * angeschlossen sein, das selbst an einer solchen Straße liegt. Sonst (oder ohne Baugebiet) null.
 */
export function roadLinkWhy(game, c, cells, kind) {
  if (!needsLink(game, kind)) return null;
  const mask = roadLinked(game, c);
  if (cells.some((j) => mask[j])) return null;
  const id = KIND_ID[kind];
  if (kind && CHAIN.has(id)) {
    const own = new Set(cells);
    for (const j of cells) {
      for (const q of nbrsOf(c, j)) {
        if (own.has(q) || c.kind[q] !== id) continue;
        if (cellsOf(c, anchorOf(c, q)).some((x) => mask[x])) return null;
      }
    }
  }
  return 'road';
}

// Feindnähe je Team (Zwischenspeicher, nicht im Spielstand): Uint8Array über das Stadtraster, 1 = Zellmitte höchstens CITY.build.enemyR
// von einer sichtbaren gegnerischen Bodeneinheit oder einem gegnerischen Gebäude bzw. Stadtgebäude (ohne Straßen). Einmal je Takt
// ENEMY_EVERY s Spielzeit neu gestempelt (Einheiten bewegen sich in der Zeit kaum), sofort neu, wenn eine Stadt (ver) oder die Zahl
// der Gebäude sich ändert. So kostet jede Zellprüfung nur einen Feldzugriff (KI-Suchen, Baumodus je Bild).
const ENEMY_CACHE = new WeakMap(); // Game → { slot, nb, vers, near: [Uint8Array|null, …] }
const ENEMY_EVERY = 0.5; // s: Takt der Neuberechnung (reine Rechenhilfe, keine Spielregel)

function enemyNear(game, c) {
  const team = c.team;
  const cities = game.city ?? [];
  const slot = Math.floor(game.time / ENEMY_EVERY);
  let hit = ENEMY_CACHE.get(game);
  const fresh = hit && hit.slot === slot && hit.nb === game.buildings.length && cities.every((o, t) => (o ? o.ver : -1) === hit.vers[t]);
  if (!fresh) {
    hit = { slot, nb: game.buildings.length, vers: cities.map((o) => (o ? o.ver : -1)), near: [null, null] };
    ENEMY_CACHE.set(game, hit);
  }
  if (hit.near[team]) return hit.near[team];
  const near = new Uint8Array(c.cols * c.rows);
  const R = CITY.build.enemyR;
  const rc = Math.ceil(R / c.cell);
  const stamp = (x, y) => {
    const cc = Math.floor((x - c.x0) / c.cell);
    const cr = Math.floor((y - c.y0) / c.cell);
    for (let r = Math.max(0, cr - rc); r <= Math.min(c.rows - 1, cr + rc); r++) {
      const dy = c.y0 + (r + 0.5) * c.cell - y;
      for (let q = Math.max(0, cc - rc); q <= Math.min(c.cols - 1, cc + rc); q++) {
        const dx = c.x0 + (q + 0.5) * c.cell - x;
        if (dx * dx + dy * dy <= R * R) near[r * c.cols + q] = 1;
      }
    }
  };
  const seen = game.fog[team];
  for (const u of game.units) {
    if (u.alive && u.team !== team && !u.def.air && seen.isVisible(u.x, u.y)) stamp(u.x, u.y);
  }
  for (const b of game.buildings) {
    if (b.alive && b.team !== team) stamp(b.x, b.y);
  }
  for (const o of cities) {
    if (!o || o.team === team) continue;
    for (const j of o.list) {
      if (isFlat(o.kind[j])) continue; // Straßen des Gegners zählen nicht
      const col = j % o.cols;
      const x = o.x0 + (col + 0.5) * o.cell;
      const y = o.y0 + ((j - col) / o.cols + 0.5) * o.cell;
      stamp(x, y);
    }
  }
  hit.near[team] = near;
  return near;
}

/**
 * Baugebiet (seit v5.78, nur mit game.buildRules): Grund, warum Zelle i für eine Zellenart `kind` gesperrt ist, oder null.
 * Gründe (Schlüssel von BUILD_BLOCK): `territory` nicht im eigenen Gebiet (c.claim; Straßen `kind` 'road' dürfen außerhalb liegen),
 * `unexplored` nie aufgedeckt, `zone` in der Konfliktzone (CITY.build.noZone), `enemy` nahe (CITY.build.enemyR) einer sichtbaren
 * gegnerischen Bodeneinheit oder eines gegnerischen Gebäudes, `road` (Paket „Straßen“) nicht an einer Straße zum Lager der Hauptstadt
 * (Einzelzellen; Großbauten über fitBig/roadLinkWhy; nicht für Straßen und CITY.build.roadFree). Ohne Regel immer null. Kein Zufall, nur lesen.
 */
export function buildWhy(game, c, i, kind) {
  if (!game.buildRules) return null;
  if (kind !== 'road' && !c.claim[i]) return 'territory';
  const col = i % c.cols;
  const x = c.x0 + (col + 0.5) * c.cell;
  const y = c.y0 + ((i - col) / c.cols + 0.5) * c.cell;
  if (!game.fog[c.team].isExplored(x, y)) return 'unexplored';
  const z = game.zone;
  if (CITY.build.noZone && z && (x - z.x) ** 2 + (y - z.y) ** 2 <= z.r * z.r) return 'zone';
  if (enemyNear(game, c)[i]) return 'enemy';
  // Anschlusspflicht (Paket „Straßen“): Einzelzellen hier; Großbauten prüft fitBig als Ganzes (roadLinkWhy). Ohne `kind` (strenge
  // Prüfung, KI-Suche) zählt nur die Maske selbst.
  if (!kind || sizeOf(kind) === 1) return roadLinkWhy(game, c, [i], kind);
  return null;
}

/**
 * Darf das Team (Stadt c) Zelle i für `kind` ausweisen? canZone und, mit Baugebiet, buildWhy. `kind` 'road' für Straßen.
 * Ohne `kind` gilt die strengere Prüfung für Gebäude.
 */
export function buildAllowed(game, c, i, kind) {
  return canZone(game, c, i) && buildWhy(game, c, i, kind) === null;
}

/** Die 4er-Nachbarzellen von Zelle i (Kartenrand beachtet). */
export function nbrsOf(c, i) {
  const col = i % c.cols;
  const row = (i - col) / c.cols;
  const out = [];
  if (col > 0) out.push(i - 1);
  if (col < c.cols - 1) out.push(i + 1);
  if (row > 0) out.push(i - c.cols);
  if (row < c.rows - 1) out.push(i + c.cols);
  return out;
}
