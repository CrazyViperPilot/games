// Pfadsuche (A*, 8 Nachbarn) und Sichtlinie. Kein DOM.
// Die Arbeitsspeicher (Typed Arrays, Binärheap) werden pro Grid-Größe wiederverwendet.

const SQRT2 = Math.SQRT2;
const DIAG_EXTRA = SQRT2 - 1;
// Index 0-3: orthogonal, 4-7: diagonal
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

let ws = null; // Arbeitsspeicher, wird bei gleicher Größe wiederverwendet

function getWorkspace(size) {
  if (!ws || ws.size !== size) {
    const cap = Math.max(1024, size * 4);
    ws = {
      size,
      g: new Float32Array(size),
      parent: new Int32Array(size),
      seen: new Uint32Array(size), // Zellen-Stempel: gültig, wenn === stamp
      closed: new Uint32Array(size),
      hCell: new Int32Array(cap), // Binärheap: Zellenindex
      hKey: new Float32Array(cap), // Binärheap: f-Wert
      hSize: 0,
      stamp: 0,
    };
  }
  ws.hSize = 0;
  ws.stamp++;
  if (ws.stamp >= 0xfffffff0) {
    ws.seen.fill(0);
    ws.closed.fill(0);
    ws.stamp = 1;
  }
  return ws;
}

function heapGrow(w) {
  const cap = w.hCell.length * 2;
  const cell = new Int32Array(cap);
  const key = new Float32Array(cap);
  cell.set(w.hCell);
  key.set(w.hKey);
  w.hCell = cell;
  w.hKey = key;
}

function heapPush(w, cell, key) {
  if (w.hSize === w.hCell.length) heapGrow(w);
  const hc = w.hCell;
  const hk = w.hKey;
  let i = w.hSize++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (hk[p] <= key) break;
    hk[i] = hk[p];
    hc[i] = hc[p];
    i = p;
  }
  hk[i] = key;
  hc[i] = cell;
}

function heapPop(w) {
  const hc = w.hCell;
  const hk = w.hKey;
  const top = hc[0];
  const n = --w.hSize;
  if (n > 0) {
    const cell = hc[n];
    const key = hk[n];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      const m = r < n && hk[r] < hk[l] ? r : l;
      if (hk[m] >= key) break;
      hk[i] = hk[m];
      hc[i] = hc[m];
      i = m;
    }
    hk[i] = key;
    hc[i] = cell;
  }
  return top;
}

// Oktil-Heuristik (orthogonal 1, diagonal √2)
function heuristic(c, r, tc, tr) {
  const dx = Math.abs(c - tc);
  const dy = Math.abs(r - tr);
  return dx > dy ? dx + DIAG_EXTRA * dy : dy + DIAG_EXTRA * dx;
}

/**
 * Sucht einen Weg von (sx, sy) nach (tx, ty) in Weltkoordinaten.
 * Ergebnis: Wegpunkte {x, y} ohne Start. Letzter Punkt = exaktes Ziel, wenn das Ziel erreicht wurde.
 * Ist das Ziel unerreichbar (oder nicht passierbar), endet der Weg an der erreichbaren Zelle nahe dem Ziel.
 * [] wenn Start- und Zielzelle gleich sind oder nichts erreichbar ist.
 */
export function findPath(grid, sx, sy, tx, ty, team, maxNodes = 20000) {
  const cols = grid.cols;
  const rows = grid.rows;
  const clampC = (v) => Math.min(Math.max(v, 0), cols - 1);
  const clampR = (v) => Math.min(Math.max(v, 0), rows - 1);

  const sc = clampC(grid.toCell(sx));
  const sr = clampR(grid.toCell(sy));
  const tc = clampC(grid.toCell(tx));
  const tr = clampR(grid.toCell(ty));
  if (sc === tc && sr === tr) return [];

  // Das exakte Ziel gilt nur, wenn es im Feld liegt und passierbar ist
  const goalExact = grid.inBounds(grid.toCell(tx), grid.toCell(ty)) && grid.passable(tc, tr, team);

  const w = getWorkspace(cols * rows);
  const stamp = w.stamp;
  const { g, parent, seen, closed } = w;

  // Die Startzelle gilt immer als passierbar
  const isOpen = (c, r) => (c === sc && r === sr) || grid.passable(c, r, team);

  const startI = sr * cols + sc;
  const goalI = tr * cols + tc;
  g[startI] = 0;
  parent[startI] = -1;
  seen[startI] = stamp;
  heapPush(w, startI, heuristic(sc, sr, tc, tr));

  // Bester Näherungspunkt, falls das Ziel nicht erreicht wird
  let best = startI;
  let bestD = (sc - tc) * (sc - tc) + (sr - tr) * (sr - tr);
  let found = false;
  let expanded = 0;

  while (w.hSize > 0 && expanded < maxNodes) {
    const i = heapPop(w);
    if (closed[i] === stamp) continue;
    closed[i] = stamp;
    expanded++;

    if (i === goalI && goalExact) {
      found = true;
      break;
    }

    const c = i % cols;
    const r = (i - c) / cols;
    const dd = (c - tc) * (c - tc) + (r - tr) * (r - tr);
    if (dd < bestD || (dd === bestD && g[i] < g[best])) {
      best = i;
      bestD = dd;
    }

    for (let k = 0; k < 8; k++) {
      const nc = c + DX[k];
      const nr = r + DY[k];
      if (!grid.inBounds(nc, nr) || !isOpen(nc, nr)) continue;
      // Diagonal nur, wenn beide Orthogonalen passierbar sind
      if (k >= 4 && (!isOpen(c + DX[k], r) || !isOpen(c, r + DY[k]))) continue;

      const ni = nr * cols + nc;
      if (closed[ni] === stamp) continue;
      const ng = g[i] + (k < 4 ? 1 : SQRT2);
      if (seen[ni] === stamp && g[ni] <= ng) continue;

      seen[ni] = stamp;
      g[ni] = ng;
      parent[ni] = i;
      heapPush(w, ni, ng + heuristic(nc, nr, tc, tr));
    }
  }

  const endI = found ? goalI : best;
  if (endI === startI) return [];

  // Zellen vom Ziel zurück zum Start, dann umdrehen
  const cells = [];
  for (let j = endI; j !== startI; j = parent[j]) cells.push(j);

  const pts = [];
  for (let k = cells.length - 1; k >= 0; k--) {
    const j = cells[k];
    pts.push({ x: grid.center(j % cols), y: grid.center(Math.floor(j / cols)) });
  }
  if (found) pts[pts.length - 1] = { x: tx, y: ty };

  // String-Pulling: vom aktuellen Anker so weit wie möglich per Sichtlinie springen
  const out = [];
  let ax = sx;
  let ay = sy;
  let i = 0;
  while (i < pts.length) {
    let last = i;
    for (let k = i; k < pts.length; k++) {
      if (lineOfSight(grid, ax, ay, pts[k].x, pts[k].y, team)) last = k;
      else break;
    }
    out.push(pts[last]);
    ax = pts[last].x;
    ay = pts[last].y;
    i = last + 1;
  }
  return out;
}

/**
 * Sichtlinie zwischen zwei Weltpunkten: alle durchquerten Zellen müssen passierbar sein
 * (Startzelle ausgenommen). Bei genau durch eine Ecke laufender Linie müssen beide Orthogonalen frei sein.
 */
export function lineOfSight(grid, x0, y0, x1, y1, team) {
  const tile = grid.tile;
  let c = Math.floor(x0 / tile);
  let r = Math.floor(y0 / tile);
  const ec = Math.floor(x1 / tile);
  const er = Math.floor(y1 / tile);
  if (c === ec && r === er) return true;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const sC = dx >= 0 ? 1 : -1;
  const sR = dy >= 0 ? 1 : -1;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  // DDA: Parameter t in [0, 1] bis zur nächsten vertikalen/horizontalen Gitterlinie
  let tMaxX = adx > 0 ? (sC > 0 ? (c + 1) * tile - x0 : x0 - c * tile) / adx : Infinity;
  let tMaxY = ady > 0 ? (sR > 0 ? (r + 1) * tile - y0 : y0 - r * tile) / ady : Infinity;
  const tDeltaX = adx > 0 ? tile / adx : Infinity;
  const tDeltaY = ady > 0 ? tile / ady : Infinity;

  let guard = Math.abs(ec - c) + Math.abs(er - r) + 2;
  while ((c !== ec || r !== er) && guard-- > 0) {
    if (Math.abs(tMaxX - tMaxY) < 1e-9) {
      // Linie geht genau durch eine Ecke
      if (!grid.passable(c + sC, r, team) || !grid.passable(c, r + sR, team)) return false;
      c += sC;
      r += sR;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      c += sC;
      tMaxX += tDeltaX;
    } else {
      r += sR;
      tMaxY += tDeltaY;
    }
    if (!grid.passable(c, r, team)) return false;
  }
  return true;
}
