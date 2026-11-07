// Straßen zerstören und räumen (Paket „Straßen“, Teil 3, PRD §15 „Straßentransport“): Einheiten mit Granaten oder Raketen beschießen
// auf ausdrücklichen Befehl (`shellRoad`) eine Straßenzelle, bis sie zu Schutt wird; Schutt unterbricht alle Wege (Lieferwege, Pendler,
// Versorgung der Ausbildung, Anschluss ans Lager). Baufahrzeuge (`clearRubble`) und Bagger (`dig`, excavator.js) räumen Schutt und
// stellen die Straße wieder her. Werte: CITY.roadWar (js/data/city.js). Kein DOM, deterministisch.
//
// Zustand im Spiel (gespeichert): game.roadHp { Zelle: übrige Trefferpunkte } nur für beschädigte Zellen, game.rubble { Zelle: { owner } }
// für Schutt (owner = Team der eigenen Straße, −1 = Stadtstraße der Karte). Zellen im Stadtraster (CITY.cell, wie game.roads).
import { CITY } from '../data/city.js';
import { KIND_ID } from '../data/citykinds.js';
import { MAP_ROAD } from './roads.js';
import { driveTo, setIdle } from './movement.js';
import { addCrater } from './scars.js';
import { placeBuilt, rebuildList } from './city/state.js';

const W = CITY.roadWar;

/** Spalten des Stadtrasters (Stadt oder, ohne Stadt, die Stadtstraßen der Karte); 0 ohne Raster. */
function colsOf(game) {
  return game.city?.[0]?.cols ?? game.roads?.cols ?? 0;
}

/** Mitte der Zelle i (Weltkoordinaten). */
export function cellCenter(game, i) {
  const cols = colsOf(game);
  const S = CITY.cell;
  return { x: ((i % cols) + 0.5) * S, y: (Math.floor(i / cols) + 0.5) * S };
}

/**
 * Ist Zelle i eine Straße, die man beschießen kann? { owner } (Team der eigenen Stadtstraße oder −1 für eine Stadtstraße der Karte),
 * sonst null. Brücken, Bahn und Rollfeld nicht.
 */
export function roadTarget(game, i) {
  for (const c of game.city ?? []) if (c.kind[i] === KIND_ID.road) return { owner: c.team };
  if (game.roads?.kind[i] === MAP_ROAD) return { owner: -1 };
  return null;
}

/** Liegt auf Zelle i Schutt einer zerstörten Straße? */
export function isRubble(game, i) {
  return !!game.rubble?.[i];
}

/** Waffe einer Einheit, mit der sie Straßen beschießt: die stärkste gegen Bauten (damage.struct ≥ CITY.roadWar.minStruct) mit Vorrat. */
export function roadWeapon(u) {
  if (u.def.jet || !u.weapons) return null;
  let best = null;
  for (const w of u.weapons) {
    const s = w.spec.damage?.struct ?? 0;
    if (s < W.minStruct || (best && s <= best.spec.damage.struct)) continue;
    best = w;
  }
  return best;
}

/** Kann die Einheit Straßen beschießen (Waffe vorhanden, Vorrat egal)? */
export const canShellRoads = (u) => !!roadWeapon(u);

/** Wege neu rechnen lassen (Stadt-Wege, Anschluss, Darstellung): Stand jeder Stadt und der Stadtstraßen der Karte. */
function touch(game) {
  for (const c of game.city ?? []) c.ver++;
  if (game.roads) game.roads.ver = (game.roads.ver ?? 0) + 1;
}

/** Straße auf Zelle i wird zu Schutt (Meldung an den Besitzer, Krater). */
export function destroyRoad(game, i) {
  const t = roadTarget(game, i);
  if (!t) return false;
  if (t.owner >= 0) {
    const c = game.city[t.owner];
    c.kind[i] = 0;
    c.level[i] = 0;
    rebuildList(c);
  } else {
    const R = game.roads;
    R.kind[i] = 0;
    (R.dug ??= new Uint8Array(R.kind.length))[i] = 1; // kein Straßentempo mehr (movement.js)
  }
  (game.rubble ??= {})[i] = { owner: t.owner };
  if (game.roadHp) delete game.roadHp[i];
  touch(game);
  const { x, y } = cellCenter(game, i);
  addCrater(game, x, y, W.craterR);
  if (t.owner >= 0) game.message(t.owner, 'Straße zerstört: Wege unterbrochen', x, y);
  return true;
}

/** Schaden `dmg` auf die Straße in Zelle i; bei 0 Trefferpunkten Schutt. true, wenn sie zerstört wurde. */
export function damageRoad(game, i, dmg) {
  if (!roadTarget(game, i)) return false;
  const hp = (game.roadHp ??= {});
  hp[i] = (hp[i] ?? W.hp) - dmg;
  if (hp[i] > 0) return false;
  return destroyRoad(game, i);
}

/** Schutt auf Zelle i räumen: die Straße ist wieder da (eigene Straße des Besitzers bzw. Stadtstraße der Karte). */
export function clearRubble(game, i) {
  const r = game.rubble?.[i];
  if (!r) return false;
  delete game.rubble[i];
  if (r.owner >= 0) {
    const c = game.city?.[r.owner];
    if (c && !c.kind[i]) {
      placeBuilt(game, c, i, 'road');
      rebuildList(c);
    }
  } else if (game.roads) {
    game.roads.kind[i] = MAP_ROAD;
    if (game.roads.dug) game.roads.dug[i] = 0;
  }
  touch(game);
  return true;
}

/** Darf `team` den Schutt auf Zelle i räumen? Eigene Straßen und Stadtstraßen der Karte. */
export function clearable(game, team, i) {
  const r = game.rubble?.[i];
  return !!r && (r.owner === team || r.owner < 0);
}

/** Zellen eines Rechtecks im Stadtraster, die `ok(i)` erfüllen, nach Abstand zu (x, y) sortiert. */
function cellsIn(game, cmd, ok, x, y) {
  const cols = colsOf(game);
  if (!cols) return [];
  const rows = game.city?.[0]?.rows ?? game.roads?.rows ?? 0;
  const c0 = Math.max(0, Math.min(cmd.c0, cmd.c1 ?? cmd.c0) | 0);
  const c1 = Math.min(cols - 1, Math.max(cmd.c0, cmd.c1 ?? cmd.c0) | 0);
  const r0 = Math.max(0, Math.min(cmd.r0, cmd.r1 ?? cmd.r0) | 0);
  const r1 = Math.min(rows - 1, Math.max(cmd.r0, cmd.r1 ?? cmd.r0) | 0);
  const out = [];
  for (let r = r0; r <= r1; r++) for (let q = c0; q <= c1; q++) if (ok(r * cols + q)) out.push(r * cols + q);
  const d = (i) => {
    const p = cellCenter(game, i);
    return Math.hypot(p.x - x, p.y - y);
  };
  return out.sort((a, b) => d(a) - d(b) || a - b);
}

/**
 * Befehl `{ type: 'shellRoad', ids, c0, r0, c1?, r1? }`: gewählte Einheiten mit Granaten oder Raketen (roadWeapon) fahren in
 * Reichweite und beschießen die Straßenzellen des Rechtecks, die nächste zuerst, bis jede zu Schutt ist. Eigene Straßen auch (Sprengen).
 */
export function cmdShellRoad(game, team, cmd) {
  const units = game.ownUnits(team, cmd.ids).filter((u) => canShellRoads(u) && !u.house);
  if (!units.length) return { ok: false, reason: 'Keine Einheit mit Granaten oder Raketen gewählt (Panzer, Schützenpanzer, Panzerabwehr, Kampfhubschrauber, Haubitze)' };
  const cells = cellsIn(game, cmd, (i) => !!roadTarget(game, i), units[0].x, units[0].y);
  if (!cells.length) return { ok: false, reason: 'Dort ist keine Straße (Brücken, Bahn und Rollfeld nicht)' };
  for (const u of units) {
    u.order = { type: 'shellRoad', cells: [...cells], idx: 0, x: u.x, y: u.y, targetId: null };
    u.targetId = null;
    u.path = [];
    u.pathIndex = 0;
  }
  return { ok: true, count: units.length, cells: cells.length };
}

/**
 * Befehl `{ type: 'clearRubble', ids, c0, r0, c1?, r1? }`: gewählte Baufahrzeuge räumen den Schutt im Rechteck (eigene Straßen und
 * Stadtstraßen der Karte), je Zelle CITY.roadWar.clearTime s; danach ist die Straße wieder da.
 */
export function cmdClearRubble(game, team, cmd) {
  const units = game.ownUnits(team, cmd.ids).filter((u) => u.def.builder === 'all' && !u.house);
  if (!units.length) return { ok: false, reason: 'Kein Baufahrzeug gewählt' };
  const cells = cellsIn(game, cmd, (i) => clearable(game, team, i), units[0].x, units[0].y);
  if (!cells.length) return { ok: false, reason: 'Dort liegt kein Schutt einer eigenen Straße oder Stadtstraße' };
  for (const u of units) {
    u.order = { type: 'clearRubble', cells: [...cells], idx: 0, t: 0, x: u.x, y: u.y, targetId: null };
    u.targetId = null;
    u.path = [];
    u.pathIndex = 0;
  }
  return { ok: true, count: units.length, cells: cells.length };
}

/** Ein Schritt: Einheiten beim Beschuss von Straßen und Baufahrzeuge beim Räumen (in game.update nach den Baggern). */
export function updateRoadWar(game, dt) {
  for (const u of game.units) {
    if (!u.alive) continue;
    const o = u.order;
    if (o.type === 'shellRoad') shellStep(game, u, o, dt);
    else if (o.type === 'clearRubble') clearStep(game, u, o, dt);
  }
}

function shellStep(game, u, o, dt) {
  while (o.idx < o.cells.length && !roadTarget(game, o.cells[o.idx])) o.idx++; // schon Schutt
  const w = roadWeapon(u);
  if (o.idx >= o.cells.length || !w) {
    setIdle(u);
    return;
  }
  const i = o.cells[o.idx];
  const { x, y } = cellCenter(game, i);
  o.x = x;
  o.y = y;
  const range = w.spec.range * W.rangeMul;
  if (driveTo(game, u, x, y, range, dt) !== 'arrived') return;
  if (w.spec.minRange && Math.hypot(u.x - x, u.y - y) < w.spec.minRange) return; // Haubitze zu nah: kein Schuss
  if (w.cd > 0 || w.rounds <= 0) return; // Abklingzeit (combat.js zählt sie herunter) oder ohne Munition: warten
  w.rounds -= 1;
  w.cd = w.spec.cooldown;
  game.teams[u.team].used.mun += w.spec.munCost;
  game.addEffect('shell', u.x, u.y, u.team, x, y, w.spec.id);
  game.addEffect('explosion', x, y, u.team, x, y, 'hit');
  if (damageRoad(game, i, w.spec.damage.struct)) o.idx++;
}

function clearStep(game, u, o, dt) {
  while (o.idx < o.cells.length && !clearable(game, u.team, o.cells[o.idx])) o.idx++; // schon geräumt
  if (o.idx >= o.cells.length) {
    setIdle(u);
    return;
  }
  const i = o.cells[o.idx];
  const { x, y } = cellCenter(game, i);
  o.x = x;
  o.y = y;
  if (driveTo(game, u, x, y, W.clearReach, dt) !== 'arrived') {
    o.t = 0;
    return;
  }
  o.t += dt;
  if (o.t < W.clearTime) return;
  o.t = 0;
  if (clearRubble(game, i)) game.addEffect('explosion', x, y, u.team, x, y, 'dig');
  o.idx++;
}
