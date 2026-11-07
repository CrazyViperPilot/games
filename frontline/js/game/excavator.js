// Bagger (seit v5.35, PRD §6 „Bagger“): Befehl `dig` räumt Stadtzellen eine nach der anderen. Der Bagger fährt zur Zelle, arbeitet
// BALANCE.excavator.digTime s und räumt dann: eine Stadtstraße der Karte (Konfliktzone; nicht Brückenfahrbahnen) verschwindet für beide
// Teams, Bäume und leere Häuser wie mit „Räumen“, ein eigenes Stadtgebäude wird abgerissen (auch eine Förderanlage; das Vorkommen
// bleibt). Gegnerische Gebäude zerstört er langsam mit seiner Schaufel (Waffe, combat.js). Seit dem Paket „Straßen“ räumt er Schutt
// zerstörter Straßen (die Straße ist wieder da) und reißt gegnerische Straßen ab. Kein DOM, deterministisch.
import { BALANCE } from '../data/balance.js';
import { cmdCity } from './city/commands.js';
import { driveTo, setIdle } from './movement.js';
import { MAP_ROAD } from './roads.js';
import { clearable, clearRubble } from './roadwar.js';
import { KIND_ID } from '../data/citykinds.js';
import { rebuildList } from './city/state.js';

const X = BALANCE.excavator;

/** Kann der Bagger von `team` die Stadtzelle i räumen (Stadtstraße der Karte, Hindernis, eigenes Gebäude)? */
export function diggable(game, team, i) {
  if (game.roads?.kind[i] === MAP_ROAD) return true;
  if (clearable(game, team, i)) return true; // Schutt einer eigenen Straße oder Stadtstraße (Paket „Straßen“): räumen
  const c = game.city?.[team];
  if (!c) return false;
  if (c.kind[i]) return true; // eigene Zelle (Straße, Gebäude, Ausweisung)
  for (const o of game.city) if (o !== c && o.kind[i]) return o.kind[i] === KIND_ID.road; // gegnerische Straße: abreißen (Paket „Straßen“); Gebäude: angreifen statt baggern
  return !!c.blocked[i]; // Bäume, Häuser (cmdCity entscheidet, ob es geht)
}

/** Raster der Stadtzellen (Stadt oder, ohne Stadt, die Stadtstraßen der Karte). */
const gridOf = (game, team) => game.city?.[team] ?? game.roads ?? null;

/**
 * Befehl `{ type: 'dig', ids, c0, r0, c1, r1, append }`: gewählte Bagger räumen die Zellen des Rechtecks (Stadtraster), die nächste
 * zuerst. append hängt an den laufenden Auftrag an.
 */
export function cmdDig(game, team, cmd) {
  const units = game.ownUnits(team, cmd.ids).filter((u) => u.def.digger && !u.house);
  if (!units.length) return { ok: false, reason: 'Kein Bagger gewählt' };
  const G = gridOf(game, team);
  if (!G) return { ok: false, reason: 'Hier gibt es nichts zu baggern' };
  const c0 = Math.max(0, Math.min(cmd.c0, cmd.c1) | 0);
  const c1 = Math.min(G.cols - 1, Math.max(cmd.c0, cmd.c1) | 0);
  const r0 = Math.max(0, Math.min(cmd.r0, cmd.r1) | 0);
  const r1 = Math.min(G.rows - 1, Math.max(cmd.r0, cmd.r1) | 0);
  const cells = [];
  for (let r = r0; r <= r1; r++) for (let q = c0; q <= c1; q++) if (diggable(game, team, r * G.cols + q)) cells.push(r * G.cols + q);
  if (!cells.length) return { ok: false, reason: 'Dort gibt es nichts zu baggern (Brücken, Fels, Wasser und gegnerische Gebäude nicht; Gegner angreifen)' };
  const S = G.cell;
  const u0 = units[0];
  cells.sort((a, b) => {
    const da = Math.hypot(((a % G.cols) + 0.5) * S - u0.x, (Math.floor(a / G.cols) + 0.5) * S - u0.y);
    const db = Math.hypot(((b % G.cols) + 0.5) * S - u0.x, (Math.floor(b / G.cols) + 0.5) * S - u0.y);
    return da - db || a - b;
  });
  for (const u of units) {
    const old = cmd.append && u.order.type === 'dig' ? u.order.cells.slice(u.order.idx) : [];
    u.order = { type: 'dig', cells: [...old, ...cells.filter((i) => !old.includes(i))], idx: 0, t: 0, x: u.x, y: u.y, targetId: null };
    u.targetId = null;
    u.path = [];
    u.pathIndex = 0;
  }
  return { ok: true, count: units.length, cells: cells.length };
}

/** Zelle i räumen (nach der Arbeitszeit). true, wenn etwas weg ist. */
function dig(game, team, i) {
  if (clearRubble(game, i)) return true; // Schutt: die Straße ist wieder da (Paket „Straßen“)
  for (const o of game.city ?? []) {
    if (o.team === team || o.kind[i] !== KIND_ID.road) continue;
    o.kind[i] = 0; // gegnerische Straße abreißen (Paket „Straßen“): ohne Schutt, die Zelle ist frei
    o.level[i] = 0;
    rebuildList(o);
    for (const c of game.city) c.ver++;
    return true;
  }
  const R = game.roads;
  if (R?.kind[i] === MAP_ROAD) {
    R.kind[i] = 0; // Stadtstraße der Karte: weg für beide Teams (c.mapRoads ist dasselbe Feld)
    (R.dug ??= new Uint8Array(R.kind.length))[i] = 1; // movement.js: dort kein Straßentempo mehr (1 je abgetragene Zelle)
    R.ver = (R.ver ?? 0) + 1;
    for (const c of game.city ?? []) c.ver++; // Wege neu (transport.js, Fliegerhorst)
    return true;
  }
  const c = game.city?.[team];
  if (!c) return false;
  const q = i % c.cols;
  const r = (i - q) / c.cols;
  return cmdCity(game, team, { type: 'city', kind: 'erase', c0: q, r0: r, c1: q, r1: r, demolish: true }).ok;
}

/** Bagger einen Schritt: zur nächsten Zelle fahren, arbeiten, räumen (in game.update nach dem Bauen). */
export function updateDig(game, dt) {
  for (const u of game.units) {
    if (!u.alive || u.order.type !== 'dig') continue;
    const o = u.order;
    const G = gridOf(game, u.team);
    if (!G) {
      setIdle(u);
      continue;
    }
    while (o.idx < o.cells.length && !diggable(game, u.team, o.cells[o.idx])) o.idx++; // schon weg
    if (o.idx >= o.cells.length) {
      setIdle(u);
      continue;
    }
    const i = o.cells[o.idx];
    const x = ((i % G.cols) + 0.5) * G.cell;
    const y = (Math.floor(i / G.cols) + 0.5) * G.cell;
    o.x = x;
    o.y = y;
    if (driveTo(game, u, x, y, X.reach, dt) !== 'arrived') {
      o.t = 0;
      continue;
    }
    o.t += dt;
    if (o.t < X.digTime) continue;
    o.t = 0;
    if (dig(game, u.team, i)) game.addEffect('explosion', x, y, u.team, x, y, 'dig');
    o.idx++;
  }
}
