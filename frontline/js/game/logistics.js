// Logistik: LKW laden, entladen, pendeln und das Nachfüllen der Einheiten (PLAN.md §11.2, §11.3). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { driveTo, setIdle } from './movement.js';

const L = BALANCE.logistics;
const CARGO = ['bm', 'mun', 'fuel'];
export const PRESETS = ['mix', 'bm', 'mun', 'fuel'];
const TRUCK_ORDERS = new Set(['load', 'unload', 'route']);
const EPS = 1e-9;

const fail = (reason) => ({ ok: false, reason });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export const cargoSum = (c) => c.bm + c.mun + c.fuel;

/** Auftrag setzen; alter Weg und Ziel der Einheit verwerfen. */
function giveOrder(u, order) {
  u.order = order;
  u.targetId = null;
  u.path = [];
  u.pathIndex = 0;
}

/** Eigene LKW aus den IDs; ohne IDs leer. */
function trucksOf(game, team, ids) {
  return game.ownUnits(team, ids).filter((u) => u.type === 'truck');
}

/** Ladungsart setzen (falls angegeben) und prüfen. Liefert false bei unbekannter Art. */
function applyPreset(u, preset) {
  if (preset === undefined) return true;
  if (!PRESETS.includes(preset)) return false;
  u.preset = preset;
  return true;
}

/** Eigene fertige FOB per ID oder null. */
function ownFob(game, team, id, needBuilt) {
  const f = game.getEntity(id);
  if (!f || f.team !== team || f.type !== 'fob') return null;
  if (needBuilt && !f.built) return null;
  return f;
}

// ---- Befehle --------------------------------------------------------------------

/** { type: 'load', ids, fobId, preset? }: LKW fährt zur fertigen FOB und lädt. */
export function cmdLoad(game, team, cmd) {
  const trucks = trucksOf(game, team, cmd.ids);
  if (!trucks.length) return fail('Kein eigener LKW gewählt');
  const fob = ownFob(game, team, cmd.fobId, true);
  if (!fob) return fail('Keine fertige eigene FOB gewählt');
  if (cmd.preset !== undefined && !PRESETS.includes(cmd.preset)) return fail('Unbekannte Ladungsart');
  for (const u of trucks) {
    applyPreset(u, cmd.preset);
    giveOrder(u, { type: 'load', x: fob.x, y: fob.y, targetId: fob.id });
  }
  return { ok: true, count: trucks.length };
}

/** { type: 'unload', ids, fobId }: LKW fährt zur eigenen FOB (auch Baustelle) und entlädt alles. */
export function cmdUnload(game, team, cmd) {
  const trucks = trucksOf(game, team, cmd.ids);
  if (!trucks.length) return fail('Kein eigener LKW gewählt');
  const fob = ownFob(game, team, cmd.fobId, false);
  if (!fob) return fail('Keine eigene FOB gewählt');
  for (const u of trucks) giveOrder(u, { type: 'unload', x: fob.x, y: fob.y, targetId: fob.id });
  return { ok: true, count: trucks.length };
}

/** { type: 'route', ids, fromId, toId, preset? }: pendelt zwischen zwei eigenen FOBs. */
export function cmdRoute(game, team, cmd) {
  const trucks = trucksOf(game, team, cmd.ids);
  if (!trucks.length) return fail('Kein eigener LKW gewählt');
  const from = ownFob(game, team, cmd.fromId, true);
  const to = ownFob(game, team, cmd.toId, false);
  if (!from || !to) return fail('Route braucht zwei eigene FOBs (Start fertig)');
  if (from === to) return fail('Start und Ziel sind gleich');
  if (cmd.preset !== undefined && !PRESETS.includes(cmd.preset)) return fail('Unbekannte Ladungsart');
  for (const u of trucks) {
    applyPreset(u, cmd.preset);
    giveOrder(u, { type: 'route', x: from.x, y: from.y, fromId: from.id, toId: to.id, phase: 'load', targetId: from.id });
  }
  return { ok: true, count: trucks.length };
}

/** { type: 'setPreset', ids, preset }: Ladungsart ändern, ohne Auftrag zu ändern. */
export function cmdSetPreset(game, team, cmd) {
  const trucks = trucksOf(game, team, cmd.ids);
  if (!trucks.length) return fail('Kein eigener LKW gewählt');
  if (!PRESETS.includes(cmd.preset)) return fail('Unbekannte Ladungsart');
  for (const u of trucks) u.preset = cmd.preset;
  return { ok: true, count: trucks.length };
}

// ---- Laden und Entladen ----------------------------------------------------------

/**
 * Ein Ladeschritt am Lager der FOB. 'full' = Ladung voll, 'empty' = passende Sorte im Lager leer, 'busy' = geladen.
 * Preset 'mix': je Tick die Sorte mit der kleinsten Ladung, die im Lager vorhanden ist.
 */
function loadStep(u, fob, dt) {
  const cap = L.truckCapacity;
  const total = cargoSum(u.cargo);
  if (total >= cap - EPS) return 'full';
  let best = null;
  for (const k of CARGO) {
    if (u.preset !== 'mix' && u.preset !== k) continue;
    if (fob.store[k] <= EPS) continue;
    if (best === null || u.cargo[k] < u.cargo[best]) best = k;
  }
  if (best === null) return 'empty';
  const amt = Math.min(L.transferRate * dt, fob.store[best], cap - total);
  fob.store[best] -= amt;
  u.cargo[best] += amt;
  return 'busy';
}

/** Ein Entladeschritt in das Lager der FOB (bis storeCap je Sorte). 'done', wenn nichts mehr abgeht. */
function unloadStep(u, fob, dt) {
  let budget = L.transferRate * dt;
  let moved = false;
  for (const k of CARGO) {
    if (budget <= EPS) break;
    const room = L.storeCap - fob.store[k];
    const amt = Math.min(budget, u.cargo[k], room);
    if (amt <= EPS) continue;
    u.cargo[k] = Math.max(0, u.cargo[k] - amt);
    fob.store[k] += amt;
    budget -= amt;
    moved = true;
  }
  return moved ? 'busy' : 'done';
}

/** Ein LKW-Schritt: fahren zum Ziel, dann laden/entladen gemäß Auftrag. */
function stepTruck(game, u, dt) {
  const o = u.order;
  let dest;
  if (o.type === 'route') {
    const from = game.getEntity(o.fromId);
    const to = game.getEntity(o.toId);
    if (!from || !to) {
      game.message(u.team, 'Route unterbrochen', u.x, u.y);
      setIdle(u);
      return;
    }
    dest = o.phase === 'load' ? from : to;
  } else {
    dest = game.getEntity(o.targetId);
    if (!dest) {
      setIdle(u);
      return;
    }
  }

  const st = driveTo(game, u, dest.x, dest.y, L.transferReach, dt);
  if (st === 'stuck') {
    if (o.type === 'route') game.message(u.team, 'Route unterbrochen', u.x, u.y);
    else game.message(u.team, 'LKW kommt nicht zur FOB', u.x, u.y);
    setIdle(u);
    return;
  }
  if (st !== 'arrived') return;

  if (o.type === 'load') {
    if (loadStep(u, dest, dt) !== 'busy') setIdle(u);
    return;
  }
  if (o.type === 'unload') {
    if (unloadStep(u, dest, dt) === 'done') setIdle(u);
    return;
  }
  // Pendeln: laden am Start, abladen am Ziel, wieder laden
  if (o.phase === 'load') {
    const r = loadStep(u, dest, dt);
    if (r === 'full' || (r === 'empty' && cargoSum(u.cargo) > EPS)) o.phase = 'unload';
  } else if (unloadStep(u, dest, dt) === 'done') {
    o.phase = 'load';
  }
}

// ---- Nachfüllen -------------------------------------------------------------------

/** Quelle für Munition/Treibstoff: eigene fertige FOB im Bauradius mit Vorrat, sonst eigener LKW mit Ladung in Reichweite. */
function findSource(game, u, k) {
  const R = BALANCE.fob.buildRadius;
  for (const b of game.buildings) {
    if (!b.alive || !b.built || b.team !== u.team || b.type !== 'fob') continue;
    if (b.store[k] <= EPS) continue;
    if (dist(b.x, b.y, u.x, u.y) <= R) return b;
  }
  for (const t of game.units) {
    if (!t.alive || t === u || t.team !== u.team || t.type !== 'truck') continue;
    if (t.cargo[k] <= EPS) continue;
    if (dist(t.x, t.y, u.x, u.y) <= L.truckSupplyRange) return t;
  }
  return null;
}

/** Füllt eine Sorte einer Einheit aus der Quelle nach (Rate je Sekunde × Takt, begrenzt durch Vorrat und Bedarf). */
function feed(game, u, k, passDt) {
  const max = k === 'mun' ? u.def.ammoMax : u.def.fuelMax;
  const have = k === 'mun' ? u.ammo : u.fuel;
  const need = max - have;
  if (!(need > EPS)) return;
  const src = findSource(game, u, k);
  if (!src) return;
  const stock = src.kind === 'building' ? src.store : src.cargo;
  const amt = Math.min(L.resupplyRate * passDt, need, stock[k]);
  if (amt <= 0) return;
  stock[k] -= amt;
  if (k === 'mun') u.ammo += amt;
  else u.fuel += amt;
  game.teams[u.team].flow[k] += amt;
}

/** Nachfüllen aller Einheiten mit Bedarf; Verbrauch aus den Lagern wird als Rate je Team gemerkt. */
function resupply(game, passDt) {
  for (const t of game.teams) t.flow = { bm: 0, mun: 0, fuel: 0 };
  for (const u of game.units) {
    if (!u.alive) continue;
    if (u.def.ammoMax > 0) feed(game, u, 'mun', passDt);
    if (u.def.fuelMax > 0) feed(game, u, 'fuel', passDt);
  }
  for (const t of game.teams) {
    for (const k of CARGO) t.flow[k] /= passDt;
  }
}

/**
 * Logistik-Schritt: LKW-Aufträge fahren und laden, alle resupplyInterval s Nachfüllen.
 * team.flow (Verbrauch aus Lagern je s) wird bis zum nächsten Nachfüllen in team.rate abgezogen.
 */
export function updateLogistics(game, dt) {
  for (const u of game.units) {
    if (u.alive && TRUCK_ORDERS.has(u.order.type)) stepTruck(game, u, dt);
  }
  game.logiTimer -= dt;
  if (game.logiTimer <= 0) {
    game.logiTimer = L.resupplyInterval;
    resupply(game, L.resupplyInterval);
  }
}
