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

/**
 * Mehrspurige Straßen (seit v5.38, Daniels Wunsch „2 Straßenlinien nebeneinander“): Straßenzellen nebeneinander bilden ein Band.
 * isRoad(i) sagt, ob Zelle i Straße ist. Je Zelle: hl/vl = Länge der waagrechten/senkrechten Straßenreihe durch die Zelle;
 * dir 1 = Band läuft waagrecht (hl > vl), 2 = senkrecht, 0 = Kreuzung, Platz oder Einzelzelle; width = Breite des Bandes in Zellen
 * (alle Zellen quer durch das Band laufen in dieselbe Richtung), idx = Lage der Zelle im Band (0 = oben bzw. links);
 * lanes = Fahrspuren je Richtung für die Kapazität: min(hl, vl), höchstens maxLanes (Kreuzungen zählen so viel wie ihr breitestes Band).
 */
export function laneGrid(cols, rows, isRoad, maxLanes = 4) {
  const n = cols * rows;
  const hl = new Uint16Array(n);
  const vl = new Uint16Array(n);
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; ) {
      if (!isRoad(r * cols + q)) {
        q++;
        continue;
      }
      let e = q;
      while (e < cols && isRoad(r * cols + e)) e++;
      for (let k = q; k < e; k++) hl[r * cols + k] = e - q;
      q = e;
    }
  }
  for (let q = 0; q < cols; q++) {
    for (let r = 0; r < rows; ) {
      if (!isRoad(r * cols + q)) {
        r++;
        continue;
      }
      let e = r;
      while (e < rows && isRoad(e * cols + q)) e++;
      for (let k = r; k < e; k++) vl[k * cols + q] = e - r;
      r = e;
    }
  }
  const dir = new Uint8Array(n);
  const width = new Uint8Array(n);
  const idx = new Uint8Array(n);
  const lanes = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (hl[i]) lanes[i] = Math.min(maxLanes, hl[i], vl[i]);
  // waagrechte Bänder: senkrechte Reihe, in der jede Zelle waagrecht läuft (hl > vl)
  for (let q = 0; q < cols; q++) {
    for (let r = 0; r < rows; r++) {
      const i = r * cols + q;
      if (!vl[i] || (r > 0 && vl[i - cols])) continue; // Anfang einer senkrechten Reihe
      const w = vl[i];
      let ok = w <= 255;
      for (let k = 0; ok && k < w; k++) ok = hl[i + k * cols] > w;
      if (ok) for (let k = 0; k < w; k++) {
        dir[i + k * cols] = 1;
        width[i + k * cols] = w;
        idx[i + k * cols] = k;
      }
    }
  }
  // senkrechte Bänder: waagrechte Reihe, in der jede Zelle senkrecht läuft (vl > hl)
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const i = r * cols + q;
      if (!hl[i] || (q > 0 && hl[i - 1])) continue;
      const w = hl[i];
      let ok = w <= 255;
      for (let k = 0; ok && k < w; k++) ok = vl[i + k] > w;
      if (ok) for (let k = 0; k < w; k++) {
        dir[i + k] = 2;
        width[i + k] = w;
        idx[i + k] = k;
      }
    }
  }
  return { hl, vl, dir, width, idx, lanes };
}
