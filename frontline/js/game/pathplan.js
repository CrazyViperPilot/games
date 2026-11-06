// Wegplanung der Bodeneinheiten (seit v5.61, Review-Paket P8): kein Simulationsschritt soll durch die Wegsuche ruckeln.
// - Wegbudget: je Schritt höchstens BALANCE.path.budget untersuchte Zellen; danach warten weitere Einheiten (Platzhalter im Weg
//   mit wait: 'queue') und kommen in der Reihenfolge ihres Anstellens in den nächsten Schritten dran.
// - Lange Suche: braucht ein Weg mehr als BALANCE.path.slice Zellen, rechnet ihn eine lange Suche (eine zur Zeit, game.pathLong)
//   je Schritt um slice Zellen weiter; die Einheit wartet (wait: 'long'). Ändert sich die Passierbarkeit, beginnt sie neu.
// - Geteilte Wege: Einheiten, die nahe beieinander starten und nahe beieinander ankommen, übernehmen einen eben gefundenen Weg
//   (Einstieg und Ausstieg per freier Sichtlinie), statt selbst zu suchen.
// Alles hängt nur vom Spielzustand ab (gleicher Seed = gleiche Partie; Laden und Weiterspielen bleibt gleich). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { findUnitPath, adoptLong, startLong, stepLong, longPath, longValid, gridHash, lineOfSight, pathStats } from './pathfinding.js';

const near = (ax, ay, bx, by, r) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by) <= r * r;

/** Plant den Weg einer Bodeneinheit zu (x, y): sofort, wenn das Wegbudget reicht und niemand wartet, sonst hinten anstellen. */
export function planUnitPath(game, u, x, y) {
  u.pathIndex = 0;
  if (game.pathBacklog || (game.pathWork || 0) >= BALANCE.path.budget) {
    game.pathSeq = (game.pathSeq || 0) + 1;
    u.path = [{ x, y, wait: 'queue', seq: game.pathSeq }];
  } else searchPath(game, u, x, y);
}

/** Art des Wartens auf einen Weg ('queue': Wegbudget aufgebraucht, 'long': lange Suche), sonst false. */
export function pathPending(u) {
  return u.path.length === 1 && u.path[0].wait ? u.path[0].wait : false;
}

/** Sucht jetzt: geteilter Weg, sonst Suche bis BALANCE.path.slice Zellen, sonst lange Suche. */
function searchPath(game, u, x, y) {
  u.pathIndex = 0;
  const shared = sharePath(game, u, x, y);
  if (shared) {
    u.path = shared;
    return;
  }
  // Ein ähnlicher Weg wird schon lang gesucht: mitwarten und ihn danach teilen
  if (similarLong(game, u, x, y)) {
    u.path = [{ x, y, wait: 'long' }];
    return;
  }
  const n0 = pathStats.nodes;
  const path = findUnitPath(game.grid, u.x, u.y, x, y, u.team, BALANCE.path);
  game.pathWork = (game.pathWork || 0) + pathStats.nodes - n0;
  if (path) {
    u.path = path;
    remember(game, u, x, y, path);
    return;
  }
  u.path = [{ x, y, wait: 'long' }];
  if (game.pathLong) return; // eine andere lange Suche läuft: anstellen
  const st = adoptLong(); // die abgebrochene Suche läuft als lange Suche weiter
  if (!st) return;
  game.pathLong = { id: u.id, sx: u.x, sy: u.y, x, y, done: st.expanded, hash: gridHash(game.grid) };
  live = { desc: game.pathLong, st };
}

/**
 * Plant zurückgestellte Wege: erst ein Stück der langen Suche (je Schritt BALANCE.path.slice Zellen, außerhalb des Budgets), dann
 * die wartenden Einheiten in der Reihenfolge ihres Anstellens, solange das Wegbudget reicht. Aufruf zu Beginn von updateMovement;
 * game.update setzt game.pathWork und game.pathShare am Ende jedes Schritts zurück.
 */
export function planPending(game) {
  const P = BALANCE.path;
  advanceLong(game, P.slice);
  const wait = game.units.filter((u) => u.alive && pathPending(u) === 'queue').sort((a, b) => a.path[0].seq - b.path[0].seq);
  let k = 0;
  for (; k < wait.length && (game.pathWork || 0) < P.budget; k++) searchPath(game, wait[k], wait[k].path[0].x, wait[k].path[0].y);
  game.pathBacklog = k < wait.length; // neue Anfragen stellen sich hinten an
  // Reicht das Budget noch, rechnen lange Suchen damit weiter
  while (!game.pathBacklog && (game.pathWork || 0) < P.budget) {
    const n0 = pathStats.nodes;
    if (!advanceLong(game, P.budget - game.pathWork)) break;
    game.pathWork += pathStats.nodes - n0;
  }
}

// Laufende lange Suche: { desc: game.pathLong, st } (Arbeitsstand, nicht im Spielstand; nach dem Laden oder wenn ein anderes Spiel
// den Arbeitsspeicher benutzt hat, wird bis desc.done nachgerechnet, bei gleicher Passierbarkeit mit genau demselben Ergebnis)
let live = null;

/** Rechnet die lange Suche um höchstens n Zellen weiter (beginnt die nächste, wenn keine läuft); false, wenn keine wartet. */
function advanceLong(game, n) {
  const P = BALANCE.path;
  let L = game.pathLong;
  let u = L ? game.getEntity(L.id) : null;
  if (L && (!u?.alive || pathPending(u) !== 'long' || u.path[0].x !== L.x || u.path[0].y !== L.y)) L = game.pathLong = null; // neuer Befehl
  if (!L) {
    u = game.units.find((v) => v.alive && pathPending(v) === 'long');
    if (!u) return false;
    L = game.pathLong = { id: u.id, sx: u.x, sy: u.y, x: u.path[0].x, y: u.path[0].y, done: 0, hash: gridHash(game.grid) };
  } else {
    const h = gridHash(game.grid);
    if (h !== L.hash) L = game.pathLong = { id: u.id, sx: u.x, sy: u.y, x: L.x, y: L.y, done: 0, hash: h }; // Gelände geändert: neu
  }
  if (!live || live.desc !== L || !longValid(live.st)) {
    live = { desc: L, st: startLong(game.grid, L.sx, L.sy, L.x, L.y, u.team, P) };
    if (L.done > 0) stepLong(live.st, L.done); // bis zum gespeicherten Stand nachrechnen
  }
  const over = stepLong(live.st, n);
  L.done = live.st.expanded ?? 0;
  if (!over) return true;
  const path = longPath(live.st);
  game.pathLong = null;
  live = null;
  u.path = path;
  u.pathIndex = 0;
  remember(game, u, L.x, L.y, path, L.sx, L.sy);
  // Wer auf einen ähnlichen Weg wartet, übernimmt ihn
  for (const v of game.units) {
    if (v === u || !v.alive || pathPending(v) !== 'long' || v.team !== u.team) continue;
    const p = sharePath(game, v, v.path[0].x, v.path[0].y);
    if (p) {
      v.path = p;
      v.pathIndex = 0;
    }
  }
  return true;
}

/** Merkt einen gefundenen Weg für diesen Schritt (game.pathShare, höchstens BALANCE.path.shareKeep Wege). */
function remember(game, u, x, y, path, sx = u.x, sy = u.y) {
  if (path.length < 2) return; // kurze Wege lohnen das Teilen nicht
  const list = (game.pathShare ??= []);
  list.push({ team: u.team, sx, sy, x, y, path });
  if (list.length > BALANCE.path.shareKeep) list.shift();
}

/** Wartet schon eine Einheit des Teams mit nahem Start und nahem Ziel auf eine lange Suche? */
function similarLong(game, u, x, y) {
  const P = BALANCE.path;
  for (const v of game.units) {
    if (v === u || !v.alive || v.team !== u.team || pathPending(v) !== 'long') continue;
    const L = game.pathLong?.id === v.id ? game.pathLong : null;
    if (near(L ? L.sx : v.x, L ? L.sy : v.y, u.x, u.y, P.shareStart) && near(v.path[0].x, v.path[0].y, x, y, P.shareGoal)) return true;
  }
  return false;
}

/** Ein gemerkter Weg mit nahem Start und nahem Ziel, angepasst an Start und Ziel dieser Einheit; null, wenn keiner passt. */
function sharePath(game, u, x, y) {
  const P = BALANCE.path;
  for (const e of game.pathShare ?? []) {
    if (e.team !== u.team || !near(e.sx, e.sy, u.x, u.y, P.shareStart) || !near(e.x, e.y, x, y, P.shareGoal)) continue;
    const p = joinPath(game.grid, u, x, y, e.path);
    if (p) return p;
  }
  return null;
}

/**
 * Einstieg: der erste Wegpunkt (unter den ersten drei) mit freier Sicht von der Einheit, dann so weit voran, wie die Sicht reicht.
 * Ausstieg: der letzte Wegpunkt ab dort mit freier Sicht zum eigenen Ziel. Wegpunkte werden kopiert (kein geteiltes Objekt).
 */
function joinPath(grid, u, x, y, path) {
  const vis = (a, b) => lineOfSight(grid, a.x, a.y, b.x, b.y, u.team);
  let j = -1;
  for (let k = 0; k < path.length && k < 3 && j < 0; k++) if (vis(u, path[k])) j = k;
  if (j < 0) return null;
  while (j + 1 < path.length && vis(u, path[j + 1])) j++;
  const goal = { x, y };
  for (let m = path.length - 1; m >= j; m--) {
    if (!vis(path[m], goal)) continue;
    const out = path.slice(j, m + 1).map((p) => ({ x: p.x, y: p.y }));
    out.push(goal);
    return out;
  }
  return null;
}
