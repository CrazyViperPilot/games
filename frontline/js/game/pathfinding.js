// Pfadsuche (A*, 8 Nachbarn) und Sichtlinie. Kein DOM.
// Die Arbeitsspeicher (Typed Arrays, Binärheap) werden pro Grid-Größe wiederverwendet. Einheiten planen über findUnitPath
// (unerreichbare Ziele billig, lange Suchen über mehrere Schritte, seit v5.61), Kartenbau über findPath.

const SQRT2 = Math.SQRT2;
const H_WEIGHT = 1.05; // Gewicht der Heuristik bei Hangkosten
const DIAG_EXTRA = SQRT2 - 1;
// Index 0-3: orthogonal, 4-7: diagonal
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Arbeitsspeicher einer Suche für `size` Zellen (Typed Arrays, Binärheap, Stempel statt Löschen). */
function makeWorkspace(size) {
  const cap = Math.max(1024, size);
  return {
    size,
    g: new Float32Array(size),
    parent: new Int32Array(size),
    seen: new Uint32Array(size), // Zellen-Stempel: gültig, wenn === stamp
    closed: new Uint32Array(size),
    hCell: new Int32Array(cap), // Binärheap: Zellenindex
    hKey: new Float32Array(cap), // Binärheap: f-Wert
    hSize: 0,
    stamp: 0,
    fseen: new Uint32Array(size), // Taschenprüfung (findUnitPath): Stempel der gefluteten Zellen
    queue: new Int32Array(size),
    fstamp: 0,
  };
}

// Zwei Arbeitsspeicher, je bei gleicher Größe wiederverwendet: `ws` für Suchen am Stück, `wsLong` für die eine lange Suche, die
// über mehrere Simulationsschritte läuft (startLong/stepLong)
let ws = null;
let wsLong = null;

function getWorkspace(size) {
  if (!ws || ws.size !== size) ws = makeWorkspace(size);
  return ws;
}

function getLongWorkspace(size) {
  if (!wsLong || wsLong.size !== size) wsLong = makeWorkspace(size);
  return wsLong;
}

/** Neue Suche im Arbeitsspeicher: leerer Heap, neuer Stempel. */
function reset(w) {
  w.hSize = 0;
  w.stamp++;
  if (w.stamp >= 0xfffffff0) {
    w.seen.fill(0);
    w.closed.fill(0);
    w.stamp = 1;
  }
  if (w.fstamp >= 0xfffffff0) {
    w.fseen.fill(0);
    w.fstamp = 1;
  }
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

/** Gezählte Arbeit aller Suchen (untersuchte Zellen plus Zellen der Taschenprüfung); movement.js misst daran das Wegbudget je Schritt. */
export const pathStats = { nodes: 0 };

/**
 * Sucht einen Weg von (sx, sy) nach (tx, ty) in Weltkoordinaten.
 * Ergebnis: Wegpunkte {x, y} ohne Start. Letzter Punkt = exaktes Ziel, wenn das Ziel erreicht wurde.
 * Ist das Ziel unerreichbar (oder nicht passierbar), endet der Weg an der erreichbaren Zelle nahe dem Ziel.
 * [] wenn Start- und Zielzelle gleich sind oder nichts erreichbar ist.
 * maxNodes: höchstens so viele untersuchte Zellen; Standard 20000, auf großen Rastern ein Viertel der Zellen (seit v5.14: die Grenze
 * wächst mit der Karte mit, 346 × 346 Kacheln → 29929, damit lange Umwege über Brücken weiter gefunden werden).
 * Kartenbau und Kartenprüfung nutzen diese Suche (Ergebnis je Seed unverändert); Einheiten planen über findUnitPath.
 */
export function findPath(grid, sx, sy, tx, ty, team, maxNodes = defaultMax(grid)) {
  const q = query(grid, sx, sy, tx, ty, team);
  if (!q) return [];
  const w = getWorkspace(grid.cols * grid.rows);
  const st = begin(w, grid, q, maxNodes, q.goalOpen, -1);
  advance(st, Infinity);
  return finish(st);
}

function defaultMax(grid) {
  return Math.max(20000, Math.ceil((grid.cols * grid.rows) / 4));
}

/** Start- und Zielzelle (ins Feld geklemmt); null, wenn beide gleich sind. goalOpen: Ziel im Feld und passierbar. */
function query(grid, sx, sy, tx, ty, team) {
  const clamp = (v, n) => Math.min(Math.max(v, 0), n - 1);
  const sc = clamp(grid.toCell(sx), grid.cols);
  const sr = clamp(grid.toCell(sy), grid.rows);
  const tc = clamp(grid.toCell(tx), grid.cols);
  const tr = clamp(grid.toCell(ty), grid.rows);
  if (sc === tc && sr === tr) return null;
  const goalOpen = grid.inBounds(grid.toCell(tx), grid.toCell(ty)) && grid.passable(tc, tr, team);
  return { sx, sy, tx, ty, sc, sr, tc, tr, team, goalOpen };
}

/**
 * Weg für eine Einheit (seit v5.61, Review-Paket P8). Wie findPath, aber
 * - ein unerreichbares Ziel kostet keine volle Suche mehr: Ist die Zielzelle versperrt (Gebäude, Wasser) oder liegt sie in einer
 *   abgeschlossenen Tasche (Flutung von dort endet nach höchstens P.pocket Zellen, ohne den Start zu finden, z. B. hinter fremden
 *   Mauern), gilt die nächste passierbare Zelle außerhalb solcher Taschen (Ringsuche bis P.ring Zellen); die Suche endet, sobald sie
 *   eine Zelle in diesem Abstand zum Ziel erreicht. Der Weg endet dann wie bei findPath an der erreichbaren Zelle nahe dem Ziel.
 * - die Suche untersucht hier höchstens P.slice Zellen. Reicht das nicht, liefert sie null: dann sucht startLong/stepLong den Weg
 *   über mehrere Schritte (movement.js).
 */
export function findUnitPath(grid, sx, sy, tx, ty, team, P) {
  const q = query(grid, sx, sy, tx, ty, team);
  if (!q) return [];
  const w = getWorkspace(grid.cols * grid.rows);
  const stopDD = unitGoal(grid, w, q, P);
  const st = begin(w, grid, q, defaultMax(grid), q.goalOpen && stopDD < 0, stopDD);
  if (advance(st, P.slice)) return finish(st);
  lastCut = st;
  return null;
}

let lastCut = null; // zuletzt nach P.slice abgebrochene Suche (adoptLong)

/**
 * Übernimmt die zuletzt von findUnitPath abgebrochene Suche als lange Suche (tauscht die Arbeitsspeicher, nichts wird doppelt
 * gerechnet). null, wenn der Arbeitsspeicher inzwischen eine andere Suche begonnen hat.
 */
export function adoptLong() {
  const st = lastCut;
  lastCut = null;
  if (!st || st.w !== ws || ws.stamp !== st.stamp) return null;
  const t = wsLong;
  wsLong = ws;
  ws = t;
  return st;
}

/** Prüfsumme der Passierbarkeit (Terrain, Gebäude, Tore): eine lange Suche beginnt neu, wenn sie sich ändert. */
export function gridHash(grid) {
  let h = 0x811c9dc5 | 0;
  const mix = (a) => {
    const words = a.byteOffset % 4 === 0 ? new Int32Array(a.buffer, a.byteOffset, a.byteLength >> 2) : null;
    const n = words ? words.length : 0;
    for (let i = 0; i < n; i++) h = Math.imul(h ^ words[i], 16777619);
    const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = n * 4; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
  };
  mix(grid.terrain);
  mix(grid.struct);
  mix(grid.gateTeam);
  return h >>> 0;
}

/** Lange Suche (findUnitPath reichte P.slice nicht) im eigenen Arbeitsspeicher; weiter mit stepLong, Weg mit longPath. */
export function startLong(grid, sx, sy, tx, ty, team, P) {
  const q = query(grid, sx, sy, tx, ty, team);
  if (!q) return { over: true, path: [] };
  const w = getLongWorkspace(grid.cols * grid.rows);
  reset(w); // eigener Stempel für die Taschenprüfung
  const stopDD = unitGoal(grid, w, q, P);
  return begin(w, grid, q, defaultMax(grid), q.goalOpen && stopDD < 0, stopDD);
}

/** Rechnet die lange Suche um höchstens n Zellen weiter; true, wenn sie fertig ist. */
export function stepLong(st, n) {
  return advance(st, n);
}

/** Gehört der Arbeitsspeicher noch dieser langen Suche (keine andere hat seitdem begonnen)? */
export function longValid(st) {
  return st.path !== undefined || st.w.stamp === st.stamp;
}

/** Weg der fertigen langen Suche. */
export function longPath(st) {
  return st.path ?? finish(st);
}

/**
 * Ziel einer Einheitensuche: -1, wenn die Zielzelle frei und erreichbar scheint (Suche bis dorthin); sonst der quadrierte
 * Zellenabstand der nächsten freien Zelle außerhalb abgeschlossener Taschen (Suche endet in diesem Abstand), -1 ohne solche Zelle.
 */
function unitGoal(grid, w, q, P) {
  const cols = grid.cols;
  const startI = q.sr * cols + q.sc;
  const ex = ++w.fstamp; // Stempel der gefundenen Taschen
  const flood = { left: P.pocket * 2 }; // Flutungen je Suche zusammen höchstens so viele Zellen
  if (q.goalOpen && !pocket(grid, w, q.tr * cols + q.tc, startI, q.team, P.pocket, ex, flood)) return -1;
  for (;;) {
    const near = nearestFree(grid, w, q.tc, q.tr, q.team, P.ring, ex);
    if (!near) return -1;
    if (near.i === startI || !pocket(grid, w, near.i, startI, q.team, P.pocket, ex, flood)) return near.dd;
    if (flood.left <= 0) return -1;
  }
}

/**
 * Flutet (4 Nachbarn) von Zelle `from` über passierbare Zellen. true, wenn die Fläche abgeschlossen ist (höchstens `limit` Zellen)
 * und den Start nicht enthält; ihre Zellen tragen dann den Stempel `ex` (nearestFree lässt sie aus). flood.left zählt die Zellen
 * aller Flutungen einer Suche herunter; ist es aufgebraucht, gilt die Fläche als offen.
 */
function pocket(grid, w, from, startI, team, limit, ex, flood) {
  const cols = grid.cols;
  const n = cols * grid.rows;
  const { terrain, struct, gateTeam } = grid;
  const fseen = w.fseen;
  const q = w.queue;
  const tmp = ++w.fstamp; // eigener Stempel je Flutung
  const max = Math.min(limit, flood.left);
  let head = 0;
  let tail = 0;
  q[tail++] = from;
  fseen[from] = tmp;
  let open = false;
  while (head < tail) {
    const i = q[head++];
    if (i === startI) {
      open = true;
      break;
    }
    const c = i % cols;
    for (let k = 0; k < 4 && !open; k++) {
      if ((k === 0 && c === cols - 1) || (k === 1 && c === 0)) continue;
      const j = k === 0 ? i + 1 : k === 1 ? i - 1 : k === 2 ? i + cols : i - cols;
      if (j < 0 || j >= n || fseen[j] === tmp || fseen[j] === ex) continue;
      if (terrain[j] !== 0 || (struct[j] !== 0 && gateTeam[j] !== team)) continue;
      if (tail >= max) open = true;
      else {
        fseen[j] = tmp;
        q[tail++] = j;
      }
    }
    if (open) break;
  }
  pathStats.nodes += tail;
  flood.left -= tail;
  if (open) return false;
  for (let k = 0; k < tail; k++) fseen[q[k]] = ex; // abgeschlossene Tasche: bleibt ausgeschlossen
  return true;
}

/** Nächste passierbare Zelle (Abstand zur Zielzelle, gleich weit: zuerst kleinere Zeile, dann Spalte) außerhalb der Taschen; null, wenn keine. */
function nearestFree(grid, w, tc, tr, team, maxRad, ex) {
  const cols = grid.cols;
  const fseen = w.fseen;
  let best = -1;
  let bestD = Infinity;
  let until = maxRad;
  for (let rad = 1; rad <= until; rad++) {
    for (let r = tr - rad; r <= tr + rad; r++) {
      const edge = r === tr - rad || r === tr + rad;
      for (let c = tc - rad; c <= tc + rad; c += edge ? 1 : 2 * rad) {
        if (!grid.inBounds(c, r)) continue;
        const i = r * cols + c;
        if (fseen[i] === ex || !grid.passable(c, r, team)) continue;
        const d = (c - tc) * (c - tc) + (r - tr) * (r - tr);
        if (d < bestD || (d === bestD && i < best)) {
          best = i;
          bestD = d;
        }
      }
    }
    // weiter außen liegt nichts Näheres mehr, sobald rad² ≥ bestD
    if (best >= 0) until = Math.min(until, Math.ceil(Math.sqrt(bestD)));
  }
  return best >= 0 ? { i: best, dd: bestD } : null;
}

/**
 * Beginnt eine A*-Suche im Arbeitsspeicher w. goalExact: die Zielzelle ist passierbar und beendet die Suche. stopDD ≥ 0: die Suche
 * endet an der ersten untersuchten Zelle mit quadriertem Zellenabstand ≤ stopDD zum Ziel (findUnitPath). Sonst endet der Weg an der
 * untersuchten Zelle nächst dem Ziel.
 */
function begin(w, grid, q, maxNodes, goalExact, stopDD) {
  reset(w);
  const cols = grid.cols;
  const startI = q.sr * cols + q.sc;
  // Mit Hangkosten leicht gewichtete Heuristik: kaum längere Wege, aber viel weniger untersuchte Zellen (sonst reicht maxNodes nicht)
  const st = { w, grid, q, stamp: w.stamp, startI, goalI: q.tr * cols + q.tc, goalExact, stopDD, hw: grid.cost ? H_WEIGHT : 1 };
  st.maxNodes = grid.cost ? maxNodes * 2 : maxNodes; // variable Kosten: die Suche untersucht mehr Zellen
  w.g[startI] = 0;
  w.parent[startI] = -1;
  w.seen[startI] = w.stamp;
  heapPush(w, startI, heuristic(q.sc, q.sr, q.tc, q.tr));
  // Bester Näherungspunkt, falls das Ziel nicht erreicht wird
  st.best = startI;
  st.bestD = (q.sc - q.tc) * (q.sc - q.tc) + (q.sr - q.tr) * (q.sr - q.tr);
  st.found = false;
  st.over = false; // fertig (Ziel, Abstand stopDD, Heap leer oder maxNodes)
  st.expanded = 0;
  return st;
}

/** Untersucht höchstens n weitere Zellen; true, wenn die Suche fertig ist. */
function advance(st, n) {
  if (st.over) return true;
  const { w, grid, q, stamp, startI, goalI, goalExact, stopDD, hw, maxNodes } = st;
  if (w.stamp !== stamp) throw new Error('Wegsuche: Arbeitsspeicher wurde von einer anderen Suche benutzt');
  const cols = grid.cols;
  const rows = grid.rows;
  const { tc, tr, team } = q;
  const cost = grid.cost; // Hänge kosten mehr (Zehntel je Zelle)
  const { g, parent, seen, closed } = w;
  const { terrain, struct, gateTeam } = grid;
  // Passierbar für das Team; die Startzelle gilt immer als passierbar (wie grid.passable, ohne Feldprüfung)
  const isOpen = (j) => j === startI || (terrain[j] === 0 && (struct[j] === 0 || gateTeam[j] === team));
  let best = st.best;
  let bestD = st.bestD;
  let expanded = st.expanded;
  const stopAt = Math.min(maxNodes, expanded + n);
  let over = false;

  while (w.hSize > 0 && expanded < stopAt) {
    const i = heapPop(w);
    if (closed[i] === stamp) continue;
    closed[i] = stamp;
    expanded++;

    if (i === goalI && goalExact) {
      st.found = true;
      over = true;
      break;
    }

    const c = i % cols;
    const r = (i - c) / cols;
    const dd = (c - tc) * (c - tc) + (r - tr) * (r - tr);
    if (dd < bestD || (dd === bestD && g[i] < g[best])) {
      best = i;
      bestD = dd;
    }
    if (dd <= stopDD) {
      best = i;
      over = true;
      break;
    }

    const gi = g[i];
    for (let k = 0; k < 8; k++) {
      const nc = c + DX[k];
      const nr = r + DY[k];
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = nr * cols + nc;
      if (!isOpen(ni)) continue;
      // Diagonal nur, wenn beide Orthogonalen passierbar sind
      if (k >= 4 && (!isOpen(r * cols + nc) || !isOpen(nr * cols + c))) continue;
      if (closed[ni] === stamp) continue;
      const ng = gi + (k < 4 ? 1 : SQRT2) * (cost ? 1 + cost[ni] / 10 : 1);
      if (seen[ni] === stamp && g[ni] <= ng) continue;

      seen[ni] = stamp;
      g[ni] = ng;
      parent[ni] = i;
      heapPush(w, ni, ng + hw * heuristic(nc, nr, tc, tr));
    }
  }
  pathStats.nodes += expanded - st.expanded;
  st.best = best;
  st.bestD = bestD;
  st.expanded = expanded;
  st.over = over || w.hSize === 0 || expanded >= maxNodes;
  return st.over;
}

/** Weg einer fertigen Suche: Zellen zurück zum Start, dann String-Pulling. */
function finish(st) {
  const { w, grid, q, startI, goalI } = st;
  const { sx, sy, tx, ty, team } = q;
  const cols = grid.cols;
  const cost = grid.cost;
  const g = w.g;
  const parent = w.parent;
  const found = st.found;
  const endI = found ? goalI : st.best;
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

  // String-Pulling: vom aktuellen Anker so weit wie möglich per Sichtlinie springen. Mit Hangkosten nur, wenn die Abkürzung nicht
  // teurer ist als der gefundene Weg bis dorthin (sonst zöge sie den Talweg wieder über den Hügel).
  const out = [];
  let ax = sx;
  let ay = sy;
  let ag = 0; // Wegkosten bis zum Anker
  const gAt = (k) => g[cells[cells.length - 1 - k]];
  let i = 0;
  while (i < pts.length) {
    let last = i;
    for (let k = i; k < pts.length; k++) {
      if (!lineOfSight(grid, ax, ay, pts[k].x, pts[k].y, team)) break;
      if (cost && k > i && lineCost(grid, ax, ay, pts[k].x, pts[k].y) > (gAt(k) - ag) * 1.02 + 0.3) break;
      last = k;
    }
    out.push(pts[last]);
    ax = pts[last].x;
    ay = pts[last].y;
    ag = gAt(last);
    i = last + 1;
  }
  return out;
}

/** Kosten einer geraden Strecke in Zellen (wie g der Suche: Länge in Zellen × (1 + Hangkosten)), Zellen in halben Schritten abgetastet. */
function lineCost(grid, x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / (grid.tile / 2)));
  const cost = grid.cost;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5) / n;
    const c = Math.floor((x0 + (x1 - x0) * f) / grid.tile);
    const r = Math.floor((y0 + (y1 - y0) * f) / grid.tile);
    sum += 1 + (grid.inBounds(c, r) ? cost[r * grid.cols + c] : 0) / 10;
  }
  return (sum * len) / n / grid.tile;
}

/**
 * Sichtlinie zwischen zwei Weltpunkten: alle durchquerten Zellen müssen passierbar sein
 * (Startzelle ausgenommen). Bei genau durch eine Ecke laufender Linie müssen beide Orthogonalen frei sein.
 */
export function lineOfSight(grid, x0, y0, x1, y1, team) {
  const ok = (c, r) => grid.passable(c, r, team);
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
      if (!ok(c + sC, r) || !ok(c, r + sR)) return false;
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
    if (!ok(c, r)) return false;
  }
  return true;
}
