// Stadt (PRD §15), Straßennetz (seit v5.20, AP4): Erreichbarkeit über Straßen, Anschluss eines Gebäudes ans Lager der Hauptstadt
// oder an ein Zielnetz (connectRoad; Startviertel und Stadt-KI). Kein DOM, deterministisch.
import { CITY } from '../../data/city.js';
import { KINDS } from '../../data/citykinds.js';
import { mainAccess } from '../transport.js';
import { DEPOSITS, anchorOf, isPart, cellsOf, cellRect, cellFree, roadAt, accessCells, canZone, buildAllowed, nbrsOf } from './cells.js';
import { rebuildList, placeBuilt } from './state.js';

/**
 * Straßenzellen, die über Straßen von den Startzellen `starts` aus erreichbar sind (seit v5.20, AP4): Breitensuche, höchstens
 * CITY.transport.maxDist Schritte (wie der Lieferweg). Liefert ein Uint8Array je Zelle, 1 = erreichbar.
 */
function roadReach(c, starts) {
  const n = c.cols * c.rows;
  const reach = new Uint8Array(n);
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (const i of starts) {
    if (dist[i] >= 0) continue;
    dist[i] = 0;
    reach[i] = 1;
    queue[tail++] = i;
  }
  const maxDist = CITY.transport.maxDist;
  while (head < tail) {
    const i = queue[head++];
    if (dist[i] >= maxDist) continue;
    for (const j of nbrsOf(c, i)) {
      if (dist[j] >= 0 || !roadAt(c, j)) continue;
      dist[j] = dist[i] + 1;
      reach[j] = 1;
      queue[tail++] = j;
    }
  }
  return reach;
}

/** Straßen zum Lager der Hauptstadt (roadReach ab mainAccess). */
export function mainRoadReach(game, c) {
  return roadReach(c, mainAccess(game, c));
}

/** Zellen, deren Rechteck die Zone des Lagers schneidet (wie mainAccess, aber für alle Zellen, nicht nur Straßen; seit v5.20, AP4). */
function mainZone(game, c) {
  const n = c.cols * c.rows;
  const zone = new Uint8Array(n);
  const m = game.mainFob(c.team);
  if (!m) return zone;
  const T = game.grid.tile;
  const e = CITY.fobMargin + c.cell;
  const x0 = m.cx * T - e;
  const x1 = (m.cx + m.w) * T + e;
  const y0 = m.cy * T - e;
  const y1 = (m.cy + m.h) * T + e;
  for (let i = 0; i < n; i++) {
    const r = cellRect(c, i % c.cols, Math.floor(i / c.cols));
    if (r.x0 < x1 && r.x1 > x0 && r.y0 < y1 && r.y1 > y0) zone[i] = 1;
  }
  return zone;
}

/**
 * Straßenanschluss für das Gebäude mit Anker a (seit v5.20, AP4): legt Straßen von seinen freien Nachbarzellen bis zur nächsten
 * Straßenzelle, die mit dem Lager verbunden ist. Nur ausweisbare, leere, freie Zellen ohne Vorkommen; höchstens
 * CITY.transport.connectMax neue Zellen. Mit `pay` über game.issue (kostet Baumaterial je Zelle), sonst direkt wie beim Startviertel.
 * Optional `goal` (Uint8Array wie roadReach): Ziel statt des Lagers, z. B. das Netz eines Stahlwerks für eine Erzmine (Ausbau der KI).
 * Rückgabe: Zahl der gelegten Zellen; 0, wenn der Anschluss schon besteht; −1, wenn es keinen Weg gibt oder das Baumaterial fehlt.
 */
export function connectRoad(game, c, a, pay, goal = null) {
  const anchor = anchorOf(c, a);
  const reach = goal ?? mainRoadReach(game, c);
  // Ohne Ziel (Lager): auch eine freie Zelle in der Zone des Lagers ist Anschluss, sie wird Straße dort
  const zone = goal ? null : mainZone(game, c);
  const atEnd = (i) => !!zone?.[i] || nbrsOf(c, i).some((j) => reach[j]);
  if (accessCells(c, anchor).some((j) => reach[j])) return 0;
  const max = CITY.transport.connectMax;
  const n = c.cols * c.rows;
  // Baugebiet (seit v5.78) gilt für Anschlüsse, die der Spieler oder die KI bezahlen (pay); das Startviertel (pay false) baut ohne Regel
  const ok = (j) => (pay ? buildAllowed(game, c, j, 'road') : canZone(game, c, j)) && !c.kind[j] && !c.deposit[j] && cellFree(game, c, j % c.cols, Math.floor(j / c.cols));
  const prev = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const cells = cellsOf(c, anchor);
  let frontier = [];
  for (const i of cells) {
    for (const j of nbrsOf(c, i)) {
      if (seen[j] || !ok(j)) continue;
      seen[j] = 1;
      frontier.push(j);
    }
  }
  // Breitensuche in Schichten: Schicht d hat Wege mit d neuen Zellen; Ende, sobald eine Zelle an eine verbundene Straße grenzt
  let end = -1;
  for (let d = 1; d <= max && frontier.length && end < 0; d++) {
    const next = [];
    for (const i of frontier) {
      if (atEnd(i)) {
        end = i;
        break;
      }
      if (d === max) continue;
      for (const j of nbrsOf(c, i)) {
        if (seen[j] || !ok(j)) continue;
        seen[j] = 1;
        prev[j] = i;
        next.push(j);
      }
    }
    frontier = next;
  }
  if (end < 0) return -1;
  const path = [];
  for (let i = end; i >= 0; i = prev[i]) path.push(i);
  if (pay) {
    const main = game.mainFob(c.team);
    if (!main || main.store.bm < CITY.costBm.road * path.length || game.teams[c.team].res.money < CITY.cost.road * path.length) return -1;
    for (const i of path) {
      const col = i % c.cols;
      const row = (i - col) / c.cols;
      game.issue(c.team, { type: 'city', kind: 'road', c0: col, r0: row, c1: col, r1: row });
    }
  } else {
    for (const i of path) placeBuilt(game, c, i, 'road');
    rebuildList(c);
  }
  return path.length;
}

// ---- KI: baut in Ringen um die Hauptstadt nach außen, dazu kleine Viertel an vorderen FOBs (seit v4.82),
// Förderanlagen auf Vorkommen im Gebiet, Markt und Angriffe auf die gegnerische Stadt (seit v4.83) ----

/**
 * Ziel des Anschlusses einer Förderanlage oder eines Werks mit Lieferweg (seit v5.20, AP4): das Straßennetz der Werke, an die es liefert
 * (Erz → Hütte, Holz und Stein → BM-Werk, Öl → Raffinerie, Roheisen → Stahlwerk). Gibt es keines, null (das Lager gilt).
 */
export function goalOf(c, a, k) {
  const want = k === 'mine' ? { wood: ['bm'], stone: ['bm'], ore: ['smelter'], oil: ['fuel', 'kero'] }[DEPOSITS[c.deposit[a] - 1]] : k === 'smelter' ? ['steel'] : null;
  if (!want) return null;
  const starts = [];
  for (const i of c.list) {
    if (isPart(c, i) || !c.level[i] || !want.includes(KINDS[c.kind[i] - 1])) continue;
    for (const j of accessCells(c, i)) starts.push(j);
  }
  return starts.length ? roadReach(c, starts) : null;
}
