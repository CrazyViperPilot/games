// Licht (PLAN §6, §8): Himmelslicht pro Spalte + Eigenlicht, dann BFS mit Abnahme 1 je Schritt.
// Keine Allokation pro Aufruf außer beim ersten Mal bzw. bei geänderter Größe.
import { TILE_BY_ID } from '../data/tiles.js';

const MAX = 15;
const TILE_COUNT = 64;

// Lookup-Tabellen nach Kachel-id (einmal beim Laden gebaut).
const SOLID = new Uint8Array(TILE_COUNT);
const WATER = new Uint8Array(TILE_COUNT);
const EMIT = new Uint8Array(TILE_COUNT);
for (let id = 0; id < TILE_COUNT; id++) {
  const t = TILE_BY_ID[id];
  SOLID[id] = t.solid ? 1 : 0;
  WATER[id] = t.water ? 1 : 0;
  EMIT[id] = t.light | 0;
}

// Vorab angelegte Queue. Jede Zelle wird pro Zunahme ihres Werts höchstens einmal eingereiht
// (Werte 0..15), also reichen 16 × Zellen Einträge ohne Ringpuffer.
let queue = new Int32Array(0);

/**
 * Berechnet das Licht je Zelle (Index c + r*cols).
 * Himmel: 15 von oben bis zur ersten festen Kachel (die bekommt ebenfalls das Himmelslicht);
 * Wasser lässt Himmelslicht durch und senkt es um 1 je Zelle.
 * Eigenlicht (tiles.light) ist zusätzliche Quelle; BFS: Nachbar = max(eigen, aktuell − 1).
 * Feste Zellen empfangen Licht, geben es aber nur weiter, wenn sie selbst eine Lichtquelle sind.
 * @param {{cols:number, rows:number, tiles:Uint8Array}} map
 * @param {Uint8Array} [out] wird wiederverwendet, wenn die Länge stimmt
 * @returns {Uint8Array}
 */
export function computeLight(map, out) {
  const cols = map.cols;
  const rows = map.rows;
  const tiles = map.tiles;
  const n = cols * rows;
  const light = out && out.length === n ? out : new Uint8Array(n);

  // Eigenlicht als Startwert.
  for (let i = 0; i < n; i++) light[i] = EMIT[tiles[i]];

  // Himmelslicht: von oben nach unten je Spalte.
  for (let c = 0; c < cols; c++) {
    let s = MAX;
    for (let r = 0; r < rows; r++) {
      const i = r * cols + c;
      const id = tiles[i];
      if (SOLID[id]) {
        if (s > light[i]) light[i] = s;
        break;
      }
      if (WATER[id] && s > 0) s--;
      if (s > light[i]) light[i] = s;
    }
  }

  // Quellen einreihen: Luft/Nicht-feste mit Wert > 1 sowie feste Lichtquellen mit Wert > 1.
  if (queue.length < 16 * n) queue = new Int32Array(16 * n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    const v = light[i];
    if (v <= 1) continue;
    const id = tiles[i];
    if (!SOLID[id] || EMIT[id] > 0) queue[tail++] = i;
  }

  // BFS in 4 Richtungen.
  while (head < tail) {
    const i = queue[head++];
    const nv = light[i] - 1;
    if (nv < 1) continue;
    const c = i % cols;
    const r = (i - c) / cols;
    if (c > 0) relax(i - 1, nv);
    if (c < cols - 1) relax(i + 1, nv);
    if (r > 0) relax(i - cols, nv);
    if (r < rows - 1) relax(i + cols, nv);
  }

  function relax(j, nv) {
    if (light[j] >= nv) return;
    light[j] = nv;
    const id = tiles[j];
    if (nv > 1 && (!SOLID[id] || EMIT[id] > 0)) queue[tail++] = j;
  }

  return light;
}

/**
 * Licht an Zelle (c, r). Oberhalb des Levels 15 (Himmel), links/rechts/unten außerhalb 0.
 */
export function lightAt(light, map, c, r) {
  if (r < 0) return MAX;
  if (c < 0 || c >= map.cols || r >= map.rows) return 0;
  return light[r * map.cols + c];
}
