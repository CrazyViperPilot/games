// Logistik: LKW laden, entladen, pendeln und das Nachfüllen der Einheiten (docs/verlauf.md §11.2, §11.3). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { CITY } from '../data/city.js';
import { KINDS } from '../data/citykinds.js';
import { driveTo, setIdle, nearestPassable } from './movement.js';
import { addAmmo } from './entities.js';
import { anchorOf, sizeOf } from './city/cells.js';

const L = BALANCE.logistics;
const CARGO = ['bm', 'mun', 'fuel'];
export const PRESETS = ['mix', 'bm', 'mun', 'fuel'];
const TRUCK_ORDERS = new Set(['load', 'unload', 'route']);
const BOARD_REACH = BALANCE.logistics.boardReach; // Infanterie steigt ein, wenn sie so nah am Hubschrauber ist
const DROP_RING = BALANCE.logistics.dropRing; // Absetzen: Abstand der Passagiere um den Hubschrauber
const EPS = 1e-9;
const PICKUP_KINDS = new Set(CITY.pickup.kinds); // Werke mit Ausgangslager (CITY.pickup, seit v5.69)

const fail = (reason) => ({ ok: false, reason });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export const cargoSum = (c) => c.bm + c.mun + c.fuel;

/** Auftrag mit Werk als Ladequelle (order.work = Anker im Stadtraster) statt FOB? */
const atWork = (o) => o.work != null;

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

/**
 * Eigenes fertiges Werk der Stadt mit Ausgangslager (CITY.pickup.kinds) an Zelle i (Anker oder ein Teil des Großbaus) oder null.
 * Seit v5.69: Ladequelle für LKW, auch für die Oberfläche (Rechtsklick).
 */
export function ownWork(game, team, i) {
  const c = game.city?.[team];
  if (!c || !Number.isInteger(i) || i < 0 || i >= c.kind.length) return null;
  const a = anchorOf(c, i);
  if (!c.level[a] || !PICKUP_KINDS.has(KINDS[c.kind[a] - 1])) return null;
  return game.getEntity(c.ents.get(a)?.id);
}

/** Ankunftsabstand am Werk: wie an der FOB plus halbe Kantenlänge des Werks (Mitte). */
function workReach(game, u, a) {
  const c = game.city[u.team];
  return L.transferReach + (c.cell * sizeOf(KINDS[c.kind[a] - 1])) / 2;
}

// ---- Befehle --------------------------------------------------------------------

/**
 * { type: 'load', ids, fobId, preset? } oder { type: 'load', ids, work, preset? }: LKW fährt zur fertigen FOB und lädt; mit `work`
 * (Zellindex eines eigenen Werks, seit v5.69) fährt er zum Werk und holt dessen Ware aus dem Ausgangslager.
 */
export function cmdLoad(game, team, cmd) {
  const trucks = trucksOf(game, team, cmd.ids);
  if (!trucks.length) return fail('Kein eigener LKW gewählt');
  if (cmd.preset !== undefined && !PRESETS.includes(cmd.preset)) return fail('Unbekannte Ladungsart');
  let src;
  let work = null;
  if (cmd.work != null) {
    src = ownWork(game, team, cmd.work);
    if (!src) return fail('Kein eigenes fertiges Werk mit Ausgangslager gewählt');
    work = anchorOf(game.city[team], cmd.work);
  } else {
    src = ownFob(game, team, cmd.fobId, true);
    if (!src) return fail('Keine fertige eigene FOB gewählt');
  }
  for (const u of trucks) {
    applyPreset(u, cmd.preset);
    giveOrder(u, { type: 'load', x: src.x, y: src.y, targetId: src.id, work });
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

/**
 * { type: 'route', ids, fromId, toId, preset? } oder { type: 'route', ids, fromWork, toId, preset? }: pendelt zwischen zwei eigenen FOBs,
 * mit `fromWork` (Zellindex eines Werks, seit v5.69) startet die Fahrt am Ausgangslager des Werks.
 */
export function cmdRoute(game, team, cmd) {
  const trucks = trucksOf(game, team, cmd.ids);
  if (!trucks.length) return fail('Kein eigener LKW gewählt');
  let from;
  let work = null;
  if (cmd.fromWork != null) {
    from = ownWork(game, team, cmd.fromWork);
    if (from) work = anchorOf(game.city[team], cmd.fromWork);
  } else from = ownFob(game, team, cmd.fromId, true);
  const to = ownFob(game, team, cmd.toId, false);
  if (!from || !to) return fail('Route braucht einen eigenen Start (fertige FOB oder Werk) und eine eigene FOB als Ziel');
  if (from === to) return fail('Start und Ziel sind gleich');
  if (cmd.preset !== undefined && !PRESETS.includes(cmd.preset)) return fail('Unbekannte Ladungsart');
  for (const u of trucks) {
    applyPreset(u, cmd.preset);
    giveOrder(u, { type: 'route', x: from.x, y: from.y, fromId: from.id, toId: to.id, phase: 'load', targetId: from.id, work });
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

/** Obergrenze je Sorte im Lager eines Gebäudes: Hauptstadt capitalCap, sonst storeCap. */
export const storeCapOf = (b) => (b.main ? L.capitalCap : L.storeCap);

/** Ein Entladeschritt in das Lager der FOB (bis storeCapOf je Sorte). 'done', wenn nichts mehr abgeht. */
function unloadStep(u, fob, dt) {
  let budget = L.transferRate * dt;
  let moved = false;
  for (const k of CARGO) {
    if (budget <= EPS) break;
    const room = storeCapOf(fob) - fob.store[k];
    const amt = Math.min(budget, u.cargo[k], room);
    if (amt <= EPS) continue;
    u.cargo[k] = Math.max(0, u.cargo[k] - amt);
    fob.store[k] += amt;
    budget -= amt;
    moved = true;
  }
  return moved ? 'busy' : 'done';
}

/**
 * Merker je Werk (seit v5.69, c.pickClaim): 1 am Anker, wenn ihm gerade ein eigener LKW zugeteilt ist (Ladeauftrag oder Route ab
 * diesem Werk, egal in welcher Phase). Nur darüber zweigt das Werk Ware in sein Ausgangslager ab (economy.js).
 */
function claimWorks(game) {
  for (const c of game.city ?? []) c.pickClaim.fill(0);
  for (const u of game.units) {
    if (!u.alive || !TRUCK_ORDERS.has(u.order.type) || !atWork(u.order)) continue;
    const c = game.city?.[u.team];
    if (c) c.pickClaim[u.order.work] = 1;
  }
}

/**
 * Ein Ladeschritt am Ausgangslager eines Werks (seit v5.69): nur die Ware dieses Werks, die Ladungsart des LKW gilt hier nicht.
 * Lädt, bis der LKW voll ist oder das Werkslager leer (dann 'empty', ohne zu warten). Gleiche Rückgabe wie loadStep.
 */
function loadWork(game, u, a, dt) {
  const c = game.city?.[u.team];
  if (!c) return 'empty';
  const cap = u.def.cargoCap;
  const total = cargoSum(u.cargo);
  if (total >= cap - EPS) return 'full';
  if (c.out[a] <= EPS) return 'empty';
  const k = CITY.chain[KINDS[c.kind[a] - 1]].to; // Ware des Werks (Kette CITY.chain)
  const amt = Math.min(L.transferRate * dt, c.out[a], cap - total);
  c.out[a] -= amt;
  u.cargo[k] += amt;
  return c.out[a] <= EPS ? 'empty' : 'busy';
}

/** Ein Ladeschritt an der Quelle des Auftrags: Werk (order.work) oder FOB. */
function loadFrom(game, u, dest, dt) {
  return atWork(u.order) ? loadWork(game, u, u.order.work, dt) : loadStep(u, dest, dt);
}

/** Ein LKW-Schritt: fahren zum Ziel, dann laden/entladen gemäß Auftrag. */
function stepTruck(game, u, dt) {
  const o = u.order;
  let dest;
  if (o.type === 'route') {
    const from = game.getEntity(o.fromId);
    const to = game.getEntity(o.toId);
    if (!from || !to) {
      game.message(u.team, atWork(o) && !from ? 'Werk nicht mehr da' : 'Route unterbrochen', u.x, u.y);
      setIdle(u);
      return;
    }
    dest = o.phase === 'load' ? from : to;
  } else {
    dest = game.getEntity(o.targetId);
    if (!dest) {
      if (atWork(o)) game.message(u.team, 'Werk nicht mehr da', u.x, u.y);
      setIdle(u);
      return;
    }
  }
  // Ladestelle Werk: Ankunft an der Werksmitte (plus halbe Kantenlänge), sonst wie an der FOB
  const loadsHere = o.type === 'load' || (o.type === 'route' && o.phase === 'load');
  const reach = loadsHere && atWork(o) ? workReach(game, u, o.work) : L.transferReach;
  const st = driveTo(game, u, dest.x, dest.y, reach, dt);
  if (st === 'stuck') {
    if (o.type === 'route') game.message(u.team, 'Route unterbrochen', u.x, u.y);
    else game.message(u.team, atWork(o) ? 'LKW kommt nicht zum Werk' : 'LKW kommt nicht zur FOB', u.x, u.y);
    setIdle(u);
    return;
  }
  if (st !== 'arrived') return;

  if (o.type === 'load') {
    if (loadFrom(game, u, dest, dt) !== 'busy') setIdle(u);
    return;
  }
  if (o.type === 'unload') {
    if (unloadStep(u, dest, dt) === 'done') setIdle(u);
    return;
  }
  // Pendeln: laden am Start (FOB oder Werk), abladen am Ziel, wieder laden
  if (o.phase === 'load') {
    const r = loadFrom(game, u, dest, dt);
    // Am Werk füllt sich das Lager nur langsam (der LKW lädt laufend nach): dort mit Teilladung erst nach CITY.pickup.wait s am Werk
    // abfahren (sonst Kleinstfuhren); an einer FOB sofort, sobald ihr Lager leer ist
    const loaded = cargoSum(u.cargo) > EPS;
    const leave = atWork(o) ? loaded && (o.waited = (o.waited || 0) + dt) >= CITY.pickup.wait : r === 'empty' && loaded;
    if (r === 'full' || leave) {
      o.phase = 'unload';
      o.waited = 0;
    }
  } else if (unloadStep(u, dest, dt) === 'done') {
    o.phase = 'load';
  }
}

// ---- Hubschrauber: Einsteigen und Absetzen ------------------------------------------

/** Darf `rider` in `vehicle` einsteigen? Hubschrauber nehmen Infanterie und Baufahrzeuge, Bodenfahrzeuge nur Infanterie. */
export function canSeat(vehicle, rider) {
  return rider.def.canRide && !rider.crate && (vehicle.def.air || rider.def.armor === 'inf');
}

/**
 * Ort, zu dem Einsteiger laufen: beim Hubschrauber die Stelle, wo er steht. Ein abgestellter Jet (Stellplatz, Paket E13) steht im
 * Gebäudeblock des Stellplatzes: dort der nächste begehbare Punkt, sonst ist er nicht erreichbar.
 */
function boardPoint(game, heli, team) {
  if (!heli.parked) return { x: heli.x, y: heli.y };
  return nearestPassable(game.grid, heli.x, heli.y, team) || { x: heli.x, y: heli.y };
}

/** { type: 'board', ids, heliId }: Infanterie/Baufahrzeuge gehen zu einem eigenen Hubschrauber und steigen ein. */
export function cmdBoard(game, team, cmd) {
  const heli = game.getEntity(cmd.heliId);
  if (!heli || heli.kind !== 'unit' || heli.team !== team || !(heli.def.seats > 0)) return fail('Kein eigenes Transportfahrzeug');
  const riders = game.ownUnits(team, cmd.ids).filter((u) => u !== heli && canSeat(heli, u));
  if (!riders.length) {
    if (game.ownUnits(team, cmd.ids).some((u) => u.crate)) return fail('Kistenträger steigen nicht ein');
    return fail(heli.def.air ? 'Nur Infanterie und Baufahrzeuge steigen ein' : 'Nur Infanterie steigt hier ein');
  }
  if (heli.passengers.length >= heli.def.seats) return fail('Fahrzeug ist voll');
  for (const u of riders) {
    const p = boardPoint(game, heli, u.team);
    giveOrder(u, { type: 'board', x: p.x, y: p.y, targetId: heli.id });
  }
  return { ok: true, count: riders.length };
}

/** { type: 'dropoff', ids, x, y }: Hubschrauber fliegt zum Punkt und setzt alle Passagiere ab. */
export function cmdDropoff(game, team, cmd) {
  const helis = game.ownUnits(team, cmd.ids).filter((u) => u.def.seats > 0);
  if (!helis.length) return fail('Kein Transportfahrzeug gewählt');
  if (!helis.some((h) => h.passengers.length > 0)) return fail('Keine Passagiere an Bord');
  const x = Math.min(Math.max(cmd.x, 0), game.map.width);
  const y = Math.min(Math.max(cmd.y, 0), game.map.height);
  for (const h of helis) if (h.passengers.length) giveOrder(h, { type: 'dropoff', x, y, targetId: null });
  return { ok: true, count: helis.length };
}

/** Einsteigen: hinlaufen, dann aus der Welt nehmen (alive = false bis zum Absetzen; cleanup räumt auf). */
function stepBoard(game, u, dt) {
  const heli = game.getEntity(u.order.targetId);
  if (!heli || heli.team !== u.team || !(heli.def.seats > 0) || !canSeat(heli, u)) {
    setIdle(u);
    return;
  }
  const p = heli.parked ? u.order : heli; // abgestellter Jet: der Punkt am Stellplatz (boardPoint), sonst das Fahrzeug selbst
  const st = driveTo(game, u, p.x, p.y, BOARD_REACH, dt);
  if (st === 'stuck') {
    game.message(u.team, 'Kein Weg zum Fahrzeug', u.x, u.y);
    setIdle(u);
    return;
  }
  if (st !== 'arrived') return;
  if (heli.passengers.length >= heli.def.seats) {
    game.message(u.team, 'Fahrzeug ist voll', heli.x, heli.y);
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
  if (!src.infinite) game.teams[u.team].flow[k] += amt; // aus der unendlichen Hauptstadt zählt nicht als Verbrauch
}

/** Nachfüllen aller Einheiten mit Bedarf; Verbrauch aus den Lagern wird als Rate je Team gemerkt. */
function resupply(game, passDt) {
  for (const t of game.teams) t.flow = { bm: 0, mun: 0, fuel: 0 };
  for (const u of game.units) {
    if (!u.alive || u.def.jet || (u.heli && u.heli.phase !== 'air')) continue; // Jets tanken und laden nur am Stellplatz (aircraft.js), Hubschrauber auf dem Heliport nur dort (helipad.js, seit v5.51)
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
  claimWorks(game);
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
