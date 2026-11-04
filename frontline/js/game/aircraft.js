// Kampfflugzeuge und Flughafen (seit v5.03, PRD §6 „F-16“, §15 „Flughafen“): Jets (def.jet) fliegen immer, drehen nur mit
// begrenzter Rate (BALANCE.jets.turn) und kreisen um ihren Befehlspunkt. Sie starten von einem eigenen Flughafen (10 × 10-Großbau
// der Stadt, capacity Plätze), fliegen ohne Raketen oder mit knappem Treibstoff selbst zurück, landen und werden dort betankt,
// munitioniert (aus dem Lager der Hauptstadt) und repariert. Abgestellte Jets (u.parked) stehen im Hangar: niemand kann sie
// angreifen (entities.isFoe); fällt der Flughafen, gehen sie mit ihm verloren. Ohne Flughafen stürzt ein Jet ab, wenn der
// Treibstoff leer ist. Geschossen wird in combat.js wie bei allen Einheiten. Kein DOM, deterministisch.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { KIND_ID } from './city.js';
import { resolveTarget, canAttack, isFoe } from './entities.js';
import { setIdle } from './movement.js';
import { modOf } from './research.js';

const J = BALANCE.jets;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/**
 * Anlage des Flughafens relativ zu seiner Mitte (px, das Quadrat reicht bis ±320): zwei Start- und Landebahnen (waagrecht), Rollweg,
 * Vorfeld mit capacity Stellplätzen (5 Spalten × 4 Reihen), Hangars und Tower. Spiel (Start, Landung, Stellplätze) und Bild
 * (render/bigbuild.js) nutzen dieselben Maße.
 */
export const AIRPORT = {
  runways: [
    { y: -258, x0: -296, x1: 296, w: 36 },
    { y: -176, x0: -296, x1: 296, w: 36 },
  ],
  taxi: { y: -104, x0: -280, x1: 280, w: 18 },
  apron: { x0: -304, x1: 72, y0: -70, y1: 300 },
  slots: Array.from({ length: 20 }, (_, k) => ({ x: -262 + (k % 5) * 76, y: -22 + Math.floor(k / 5) * 82 })),
  hangars: [
    { x: 196, y: -26, w: 196, h: 76 },
    { x: 196, y: 64, w: 196, h: 76 },
    { x: 196, y: 154, w: 196, h: 76 },
  ],
  tower: { x: 236, y: 256 },
  takeoff: { x: -250, y: -258 }, // Startpunkt (Bahn 1, Westende, Richtung Osten)
  landing: { x: 0, y: -176 }, // Landepunkt (Bahn 2)
};

/** Ist e ein Flughafen (Ziel-Entity der Stadt)? */
export function isAirport(game, e) {
  if (!e || e.type !== 'city' || !e.alive) return false;
  const c = game.city?.[e.team];
  return !!c && c.kind[e.cityCell] === KIND_ID.airport && c.level[e.cityCell] > 0;
}

/** Lebende fertige Flughäfen eines Teams. */
export function airportsOf(game, team) {
  const c = game.city?.[team];
  if (!c) return [];
  const out = [];
  for (const [i, e] of c.ents) if (e.alive && c.kind[i] === KIND_ID.airport && c.level[i] > 0) out.push(e);
  return out;
}

/** Jets, die zu Flughafen e gehören (stationiert, in der Luft oder in seiner Warteschlange). */
export function jetsAt(game, e) {
  let n = 0;
  for (const u of game.units) if (u.alive && u.jet?.home === e.id) n++;
  return n + (e.queue?.length ?? 0);
}

/** Freie Plätze eines Flughafens. */
export const freeSpace = (game, e) => J.capacity - jetsAt(game, e);

/** Weltpunkt eines Punkts der Anlage (lokal relativ zur Mitte). */
const at = (e, p) => ({ x: e.x + p.x, y: e.y + p.y });

/** Nächster eigener Flughafen mit Platz (oder der eigene Heimatflughafen), sonst null. */
function homeFor(game, u) {
  const own = game.getEntity(u.jet.home);
  if (own && isAirport(game, own)) return own;
  let best = null;
  let bestD = Infinity;
  for (const e of airportsOf(game, u.team)) {
    if (freeSpace(game, e) <= 0) continue;
    const d = dist(e.x, e.y, u.x, u.y);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Abgestellt: auf einen freien Stellplatz des Flughafens e, Nase nach Norden. */
function park(game, u, e) {
  const used = new Set();
  for (const o of game.units) if (o.alive && o !== u && o.parked && o.jet?.home === e.id) used.add(o.jet.slot);
  let k = 0;
  while (used.has(k) && k < AIRPORT.slots.length - 1) k++;
  const p = at(e, AIRPORT.slots[k]);
  u.x = p.x;
  u.y = p.y;
  u.prevX = p.x;
  u.prevY = p.y;
  u.angle = -Math.PI / 2;
  u.parked = true;
  u.jet.home = e.id;
  u.jet.slot = k;
  u.jet.ready = false;
  setIdle(u);
}

/** Neue F-16 aus der Ausbildung (economy.js): gleich im Hangar ihres Flughafens. */
export function parkNew(game, u, e) {
  u.jet = { home: e.id, slot: -1, ready: false, warned: false };
  park(game, u, e);
  u.jet.ready = isFull(u);
}

/** Voll betankt, voll munitioniert und unversehrt? */
const isFull = (u) => u.fuel >= u.def.fuelMax - 1e-6 && u.ammo >= u.def.ammoMax - 1e-6 && u.hp >= u.maxHp - 1e-6;

/** Keine einzige volle Rakete mehr. */
const dry = (u) => !u.weapons.some((w) => w.rounds >= 1);

/** Wie weit ein Befehl den Jet in die Luft schickt: Bewegung, Angriff, Angriffsmarsch. */
const wantsOut = (u) => u.order.type === 'move' || u.order.type === 'attack' || u.order.type === 'attackMove';

/** Am Boden: tanken, nachladen und reparieren aus dem Lager der Hauptstadt; auf Befehl starten, wenn bereit. */
function stepParked(game, u, dt) {
  const e = game.getEntity(u.jet.home);
  if (!e || !isAirport(game, e)) {
    u.hp = 0; // Flughafen zerstört: die abgestellten Jets gehen mit ihm verloren
    u.alive = false;
    return;
  }
  const p = at(e, AIRPORT.slots[u.jet.slot] ?? AIRPORT.slots[0]);
  u.x = p.x;
  u.y = p.y;
  const main = game.mainFob(u.team);
  const f = dt / (J.rearm * modOf(game, u, 'rearm')); // Schnellwartung (Forschung)
  if (u.fuel < u.def.fuelMax) {
    const want = Math.min(u.def.fuelMax - u.fuel, u.def.fuelMax * f);
    const got = main ? (main.infinite ? want : Math.min(want, main.store.fuel)) : 0;
    if (main && !main.infinite) main.store.fuel -= got;
    u.fuel += got;
    if (got < want - 1e-9) game.shortage(u.team, 'fuel');
  }
  if (u.ammo < u.def.ammoMax) {
    const want = Math.min(u.def.ammoMax - u.ammo, u.def.ammoMax * f);
    const got = main ? (main.infinite ? want : Math.min(want, main.store.mun)) : 0;
    if (main && !main.infinite) main.store.mun -= got;
    u.ammo += got;
    game.teams[u.team].used.mun += got;
    if (got < want - 1e-9) game.shortage(u.team, 'mun');
  }
  if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * J.repair * dt);
  const was = u.jet.ready;
  u.jet.ready = isFull(u);
  if (u.jet.ready && !was && !wantsOut(u)) game.message(u.team, `${u.def.name} startbereit`, u.x, u.y);
  if (!wantsOut(u)) return;
  if (!u.jet.ready) {
    if (!u.jet.warned) game.message(u.team, `${u.def.name} wird noch betankt und munitioniert`, u.x, u.y);
    u.jet.warned = true;
    return;
  }
  // Start: an den Anfang der Bahn, Richtung Osten
  const s = at(e, AIRPORT.takeoff);
  u.x = s.x;
  u.y = s.y;
  u.prevX = s.x;
  u.prevY = s.y;
  u.angle = 0;
  u.parked = false;
  u.jet.warned = false;
  u.jet.slot = -1;
  u.anchorX = u.order.x ?? u.x;
  u.anchorY = u.order.y ?? u.y;
}

/** Ein Flugschritt Richtung (tx, ty): Nase höchstens turn × dt drehen, dann mit voller Geschwindigkeit geradeaus. */
function fly(u, tx, ty, dt, speed = u.def.speed) {
  const want = Math.atan2(ty - u.y, tx - u.x);
  let d = want - u.angle;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const m = J.turn * dt;
  u.angle += Math.max(-m, Math.min(m, d));
  const v = speed * dt;
  u.x = Math.min(BALANCE.map.width, Math.max(0, u.x + Math.cos(u.angle) * v));
  u.y = Math.min(BALANCE.map.height, Math.max(0, u.y + Math.sin(u.angle) * v));
}

/** Kreisen um (ox, oy) im Abstand orbit: Ziel ein Stück voraus auf dem Kreis. */
function circle(u, ox, oy, dt) {
  const a = Math.atan2(u.y - oy, u.x - ox) + 0.7;
  fly(u, ox + Math.cos(a) * J.orbit, oy + Math.sin(a) * J.orbit, dt, u.jet.speed);
}

/** Liegt (x, y) auf dem Gelände eines eigenen Flughafens? Dann landet der Jet dort (Rechtsklick auf den eigenen Flughafen). */
function airportAt(game, team, x, y) {
  for (const e of airportsOf(game, team)) {
    const h = (e.w * BALANCE.map.tile) / 2;
    if (Math.abs(x - e.x) <= h && Math.abs(y - e.y) <= h) return e;
  }
  return null;
}

/** In der Luft: Treibstoff, Heimweg, Befehl (Ziel verfolgen, Punkt anfliegen, kreisen), Landung. */
function stepAirborne(game, u, dt) {
  const burn = u.def.fuelPerSec * modOf(game, u, 'fuel') * dt; // konforme Tanks (Forschung)
  u.fuel = Math.max(0, u.fuel - burn);
  game.teams[u.team].used.fuel += burn;
  u.jet.speed = u.def.speed * modOf(game, u, 'speed'); // Nachbrenner (Forschung)
  if (u.fuel <= 0) {
    u.hp = 0; // leer: Absturz
    u.alive = false;
    game.message(u.team, `${u.def.name} abgestürzt: kein Treibstoff`, u.x, u.y);
    return;
  }
  const o = u.order;
  let home = homeFor(game, u);
  // freiwillig landen: Befehlspunkt auf einem eigenen Flughafen
  const asked = o.type === 'move' ? airportAt(game, u.team, o.x, o.y) : null;
  if (asked && freeSpace(game, asked) + (u.jet.home === asked.id ? 1 : 0) > 0) home = asked;
  const toHome = home ? dist(u.x, u.y, home.x + AIRPORT.landing.x, home.y + AIRPORT.landing.y) : 0;
  const bingo = home && u.fuel <= (toHome / u.jet.speed) * u.def.fuelPerSec * modOf(game, u, 'fuel') * J.reserve + J.margin;
  // Rückkehr wegen Treibstoff oder Raketen bleibt bis zur Landung (u.jet.rtb), auf Befehl nur, solange der Befehl gilt
  if (u.jet.rtb === 'asked' && !asked) u.jet.rtb = false;
  if (home && (u.jet.rtb || bingo || dry(u) || asked)) {
    const l = at(home, AIRPORT.landing);
    const why = u.jet.rtb || (bingo ? 'fuel' : dry(u) ? 'ammo' : 'asked');
    if (!u.jet.rtb && why !== 'asked') game.message(u.team, `${u.def.name} kehrt zum Flughafen zurück (${why === 'fuel' ? 'Treibstoff' : 'keine Raketen'})`, u.x, u.y);
    u.jet.rtb = why;
    if (dist(u.x, u.y, l.x, l.y) <= J.landReach) {
      u.jet.rtb = false;
      park(game, u, home);
      return;
    }
    fly(u, l.x, l.y, dt, u.jet.speed);
    return;
  }
  if (!home && !u.jet.lost) {
    u.jet.lost = true;
    game.message(u.team, `${u.def.name}: kein Flughafen mit freiem Platz`, u.x, u.y);
  } else if (home) u.jet.lost = false;
  u.jet.rtb = false;
  if (o.type === 'attack') {
    const t = resolveTarget(game, o.targetId);
    if (!canAttack(u.team, t)) {
      setIdle(u);
      return;
    }
    fly(u, t.x, t.y, dt, u.jet.speed);
    return;
  }
  if (o.type === 'move' || o.type === 'attackMove') {
    if (o.type === 'attackMove' && u.targetId !== null) {
      const t = resolveTarget(game, u.targetId);
      if (isFoe(u.team, t)) {
        fly(u, t.x, t.y, dt, u.jet.speed);
        return;
      }
    }
    if (dist(u.x, u.y, o.x, o.y) > J.orbit) {
      fly(u, o.x, o.y, dt, u.jet.speed);
      return;
    }
    const x = o.x;
    const y = o.y;
    setIdle(u);
    u.anchorX = x; // um den Befehlspunkt kreisen, nicht um die Stelle, an der der Kreis begann
    u.anchorY = y;
    u.order.x = x;
    u.order.y = y;
  }
  // untätig: Ziel aus der Zielsuche (combat.js) verfolgen, solange es nahe am Ankerpunkt ist; sonst kreisen
  if (u.targetId !== null) {
    const t = resolveTarget(game, u.targetId);
    if (isFoe(u.team, t) && dist(t.x, t.y, u.anchorX, u.anchorY) <= u.def.sight + J.orbit) {
      fly(u, t.x, t.y, dt, u.jet.speed);
      return;
    }
    u.targetId = null;
  }
  circle(u, u.anchorX, u.anchorY, dt);
}

/** Alle Jets einen Schritt (nach updateMovement; Bewegung der Jets nur hier). */
export function updateAircraft(game, dt) {
  for (const u of game.units) {
    if (!u.alive || !u.def.jet) continue;
    u.jet ??= { home: 0, slot: -1, ready: true, warned: false };
    if (u.parked) stepParked(game, u, dt);
    else stepAirborne(game, u, dt);
    u.path = [];
    u.pathIndex = 0;
  }
}

/** Zusatzprüfung der Ausbildung (game.cmdTrain): Platz im Flughafen. Fehlertext oder null. */
export function trainCheck(game, b, unit) {
  if (!UNITS[unit]?.jet) return null;
  if (!isAirport(game, b)) return 'Nur ein fertiger Flughafen bildet Flugzeuge aus';
  if (freeSpace(game, b) <= 0) return `Flughafen voll (${J.capacity} Flugzeuge)`;
  return null;
}
