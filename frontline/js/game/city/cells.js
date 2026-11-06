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
export function bigFits(game, c, a, n, free = (j) => !c.kind[j]) {
  const [lo, hi] = bigSpan(n);
  const q = a % c.cols;
  const r = (a - q) / c.cols;
  if (q - lo < 0 || r - lo < 0 || q + hi >= c.cols || r + hi >= c.rows) return false;
  for (let y = r - lo; y <= r + hi; y++) {
    for (let x = q - lo; x <= q + hi; x++) {
      const j = y * c.cols + x;
      if (!canZone(game, c, j) || !free(j) || !cellFree(game, c, x, y)) return false;
    }
  }
  return true;
}

/**
 * Mitte für einen Großbau der Art `kind`, der die Zelle (col, row) enthält: zuerst genau dort, sonst so weit verschoben,
 * dass er passt (erst gerade, dann schräg). −1, wenn nichts passt.
 */
export function fitBig(game, c, col, row, kind, free) {
  const n = sizeOf(kind);
  const [lo, hi] = bigSpan(n);
  const offs = [];
  for (let dy = -hi; dy <= lo; dy++) for (let dx = -hi; dx <= lo; dx++) offs.push([dx, dy]); // Anker so, dass (col, row) im Quadrat liegt
  offs.sort((p, o) => Math.abs(p[0]) + Math.abs(p[1]) - Math.abs(o[0]) - Math.abs(o[1]) || Math.max(Math.abs(p[0]), Math.abs(p[1])) - Math.max(Math.abs(o[0]), Math.abs(o[1])));
  for (const [dx, dy] of offs) {
    const x = col + dx;
    const y = row + dy;
    if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) continue;
    if (bigFits(game, c, y * c.cols + x, n, free)) return y * c.cols + x;
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
