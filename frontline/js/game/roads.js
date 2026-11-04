// Stadtstraßen der Karte (seit v5.03, PRD §7 „Straßen“, §15): die Straßen der Zonenstadt (map.town.roads ohne Feldwege) und die
// Fahrbahnen der Brücken als Zellen im Stadtraster (CITY.cell). Sie gehören niemandem, zählen für beide Teams als Straße
// (Anschluss für Wohnen, Gewerbe und alle anderen Stadtgebäude) und lassen sich nicht abreißen oder überbauen. Eigene Straßen
// schließen an sie an. Sie entstehen bei jedem Spielstart neu aus der Karte (auch ohne Stadt, dann nur als Bild). Kein DOM.
import { CITY } from '../data/city.js';

/** Wert einer Zelle in game.roads.kind: 0 keine, 1 Straße der Zonenstadt, 2 Brückenfahrbahn. */
export const MAP_ROAD = 1;
export const BRIDGE_ROAD = 2;

/** Abstand eines Punkts zur Strecke (x1, y1)–(x2, y2). */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Sind alle Kacheln der Zelle (col, row) ohne Hindernis (Haus, Baum, Fels, Wasser)? */
function cellOpen(grid, S, col, row) {
  const k = S / grid.tile;
  for (let r = row * k; r < (row + 1) * k; r++) {
    for (let c = col * k; c < (col + 1) * k; c++) {
      if (c >= grid.cols || r >= grid.rows || grid.terrain[grid.idx(c, r)]) return false;
    }
  }
  return true;
}

/**
 * Stadtstraßen der Karte anlegen (`game.roads`): Zonenstraßen über die Zellen, deren Mitte höchstens eine Dreiviertelzelle
 * neben der Straßenachse liegt (gerade Straßen auf einer Zellreihe ergeben genau eine Reihe, schräge eine Treppe ohne Lücke);
 * Zellen mit Hindernis bleiben frei. Brücken: alle Zellen unter der Fahrbahnachse (seit v5.03 waagrecht oder senkrecht).
 */
export function createRoads(game) {
  const S = CITY.cell;
  const grid = game.grid;
  const cols = Math.floor((grid.cols * grid.tile) / S);
  const rows = Math.floor((grid.rows * grid.tile) / S);
  const kind = new Uint8Array(cols * rows);
  const reach = S * 0.75;
  for (const r of game.map.town?.roads ?? []) {
    if (r.dirt) continue;
    const c0 = Math.max(0, Math.floor((Math.min(r.x1, r.x2) - reach) / S));
    const c1 = Math.min(cols - 1, Math.floor((Math.max(r.x1, r.x2) + reach) / S));
    const r0 = Math.max(0, Math.floor((Math.min(r.y1, r.y2) - reach) / S));
    const r1 = Math.min(rows - 1, Math.floor((Math.max(r.y1, r.y2) + reach) / S));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (segDist((col + 0.5) * S, (row + 0.5) * S, r.x1, r.y1, r.x2, r.y2) > reach) continue;
        if (cellOpen(grid, S, col, row)) kind[row * cols + col] = MAP_ROAD;
      }
    }
  }
  for (const b of game.bridges ?? []) {
    const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
    const n = Math.max(1, Math.round(len / S));
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      const col = Math.floor((b.x1 + (b.x2 - b.x1) * f) / S);
      const row = Math.floor((b.y1 + (b.y2 - b.y1) * f) / S);
      if (col >= 0 && row >= 0 && col < cols && row < rows) kind[row * cols + col] = BRIDGE_ROAD;
    }
  }
  game.roads = { cols, rows, cell: S, kind };
}

/** Ist Zelle i (Stadtraster) eine Stadtstraße der Karte (Zone oder Brücke)? */
export function isMapRoad(game, i) {
  return !!game.roads?.kind[i];
}
