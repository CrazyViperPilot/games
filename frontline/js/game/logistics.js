// Logistik: LKW laden, entladen, pendeln und das Nachfüllen der Einheiten (PLAN.md §11.2, §11.3). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { driveTo, setIdle, nearestPassable } from './movement.js';
import { addAmmo } from './entities.js';

const L = BALANCE.logistics;
const CARGO = ['bm', 'mun', 'fuel'];
export const PRESETS = ['mix', 'bm', 'mun', 'fuel'];
const TRUCK_ORDERS = new Set(['load', 'unload', 'route']);
const BOARD_REACH = 45; // Infanterie steigt ein, wenn sie so nah am Hubschrauber ist
const DROP_RING = 26; // Absetzen: Abstand der Passagiere um den Hubschrauber
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

/** Eigene Lastträger (LKW, Transporthubschrauber) aus den IDs; ohne IDs leer. */
function trucksOf(game, team, ids) {
  return game.ownUnits(team, ids).filter((u) => u.def.cargoCap > 0);
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
  const cap = u.def.cargoCap;
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

// ---- Hubschrauber: Einsteigen und Absetzen ------------------------------------------

/** { type: 'board', ids, heliId }: Infanterie/Baufahrzeuge gehen zu einem eigenen Hubschrauber und steigen ein. */
export function cmdBoard(game, team, cmd) {
  const heli = game.getEntity(cmd.heliId);
  if (!heli || heli.kind !== 'unit' || heli.team !== team || !(heli.def.seats > 0)) return fail('Kein eigener Transporthubschrauber');
  const riders = game.ownUnits(team, cmd.ids).filter((u) => u.def.canRide);
  if (!riders.length) return fail('Nur Infanterie und Baufahrzeuge steigen ein');
  if (heli.passengers.length >= heli.def.seats) return fail('Hubschrauber ist voll');
  for (const u of riders) giveOrder(u, { type: 'board', x: heli.x, y: heli.y, targetId: heli.id });
  return { ok: true, count: riders.length };
}

/** { type: 'dropoff', ids, x, y }: Hubschrauber fliegt zum Punkt und setzt alle Passagiere ab. */
export function cmdDropoff(game, team, cmd) {
  const helis = game.ownUnits(team, cmd.ids).filter((u) => u.def.seats > 0);
  if (!helis.length) return fail('Kein Transporthubschrauber gewählt');
  if (!helis.some((h) => h.passengers.length > 0)) return fail('Keine Passagiere an Bord');
  const x = Math.min(Math.max(cmd.x, 0), game.map.width);
  const y = Math.min(Math.max(cmd.y, 0), game.map.height);
  for (const h of helis) if (h.passengers.length) giveOrder(h, { type: 'dropoff', x, y, targetId: null });
  return { ok: true, count: helis.length };
}

/** Einsteigen: hinlaufen, dann aus der Welt nehmen (alive = false bis zum Absetzen; cleanup räumt auf). */
function stepBoard(game, u, dt) {
  const heli = game.getEntity(u.order.targetId);
  if (!heli || heli.team !== u.team || !(heli.def.seats > 0)) {
    setIdle(u);
    return;
  }
  const st = driveTo(game, u, heli.x, heli.y, BOARD_REACH, dt);
  if (st === 'stuck') {
    game.message(u.team, 'Kein Weg zum Hubschrauber', u.x, u.y);
    setIdle(u);
    return;
  }
  if (st !== 'arrived') return;
  if (heli.passengers.length >= heli.def.seats) {
    game.message(u.team, 'Hubschrauber ist voll', heli.x, heli.y);
    setIdle(u);
    return;
  }
  setIdle(u);
  u.alive = false;
  heli.passengers.push(u);
}

/** Absetzen: hinfliegen, Passagiere im Kreis ablegen. */
function stepDropoff(game, h, dt) {
  const o = h.order;
  const st = driveTo(game, h, o.x, o.y, 40, dt);
  if (st !== 'arrived') return;
  const n = h.passengers.length;
  h.passengers.forEach((p, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const spot = nearestPassable(game.grid, h.x + Math.cos(a) * DROP_RING, h.y + Math.sin(a) * DROP_RING, h.team) || { x: h.x, y: h.y };
    p.x = spot.x;
    p.y = spot.y;
    p.alive = true;
    setIdle(p);
    game.units.push(p);
    game.entities.set(p.id, p);
  });
  h.passengers = [];
  game.message(h.team, 'Truppen abgesetzt', h.x, h.y);
  setIdle(h);
}

// ---- Nachfüllen -------------------------------------------------------------------

/** Quelle für Munition/Treibstoff/Baumaterial (Soldaten): eigene fertige FOB im Bauradius mit Vorrat, sonst eigener LKW mit Ladung in Reichweite. */
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
  const max = k === 'mun' ? u.def.ammoMax : k === 'bm' ? u.def.bmCap : u.def.fuelMax;
  const have = k === 'mun' ? u.ammo : k === 'bm' ? u.cargo.bm : u.fuel;
  const need = max - have;
  if (!(need > EPS)) return;
  const src = findSource(game, u, k);
  if (!src) return;
  const stock = src.kind === 'building' ? src.store : src.cargo;
  const rate = k === 'mun' ? L.ammoRate : k === 'bm' ? L.bmRate : L.resupplyRate; // Munition fließt schneller (große Magazine)
  const amt = Math.min(rate * passDt, need, stock[k]);
  if (amt <= 0) return;
  stock[k] -= amt;
  if (k === 'mun') addAmmo(u, amt);
  else if (k === 'bm') u.cargo.bm += amt;
  else u.fuel += amt;
  if (!src.infinite) game.teams[u.team].flow[k] += amt; // aus der unendlichen Haupt-FOB zählt nicht als Verbrauch
}

/** Nachfüllen aller Einheiten mit Bedarf; Verbrauch aus den Lagern wird als Rate je Team gemerkt. */
function resupply(game, passDt) {
  for (const t of game.teams) t.flow = { bm: 0, mun: 0, fuel: 0 };
  for (const u of game.units) {
    if (!u.alive) continue;
    if (u.def.ammoMax > 0) feed(game, u, 'mun', passDt);
    if (u.def.fuelMax > 0) feed(game, u, 'fuel', passDt);
    if (u.def.bmCap > 0) feed(game, u, 'bm', passDt);
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
    if (!u.alive) continue;
    const o = u.order.type;
    if (TRUCK_ORDERS.has(o)) stepTruck(game, u, dt);
    else if (o === 'board') stepBoard(game, u, dt);
    else if (o === 'dropoff') stepDropoff(game, u, dt);
  }
  game.logiTimer -= dt;
  if (game.logiTimer <= 0) {
    game.logiTimer = L.resupplyInterval;
    resupply(game, L.resupplyInterval);
  }
}
