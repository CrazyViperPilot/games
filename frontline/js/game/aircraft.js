// Kampfflugzeuge und Flughafen (seit v5.03, PRD §6 „F-16“, §15 „Flughafen“): Jets (def.jet) fliegen immer, drehen nur mit
// begrenzter Rate (BALANCE.jets.turn) und kreisen um ihren Befehlspunkt. Sie starten von einem eigenen Flughafen (10 × 10-Großbau
// der Stadt, capacity Plätze): seit v5.15 rollen sie vom Stellplatz über den Rollweg zu Bahn 1, starten nach einem Startlauf und
// steigen; zur Landung fliegen sie eine Platzrunde, sinken im Endanflug auf Bahn 2, rollen aus und rollen zum Stellplatz
// (u.jet.phase: park, taxiOut, roll, air, rollout, taxiIn; u.jet.alt 0…1 Höhe). Befehl `land` wählt den Flughafen.
// Sie fliegen ohne Raketen oder mit knappem Treibstoff selbst zurück, landen und werden dort betankt,
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
 * Vorfeld mit capacity Stellplätzen (5 Spalten × 4 Reihen). Spiel (Start, Landung, Stellplätze) und Bild (render/airport.js) nutzen
 * dieselben Maße; das Vorfeld reicht seit v5.22 bis an den Rollweg und über die fünfte Rollgasse. Hangars, Tower und die übrigen
 * Bauten sind nur Bild (render/airport.js).
 */
export const AIRPORT = {
  runways: [
    { y: -258, x0: -296, x1: 296, w: 36 },
    { y: -176, x0: -296, x1: 296, w: 36 },
  ],
  taxi: { y: -104, x0: -280, x1: 280, w: 18 },
  apron: { x0: -304, x1: 100, y0: -95, y1: 300 },
  slots: Array.from({ length: 20 }, (_, k) => ({ x: -262 + (k % 5) * 76, y: -22 + Math.floor(k / 5) * 82 })),
  landing: { x: 0, y: -176 }, // Mitte von Bahn 2 (Landebahn; Heimweg-Rechnung)
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

/** Rollen am Boden (Stellplatz → Startbahn, Landebahn → Stellplatz), Startlauf und Ausrollen; dort schießt ein Jet nicht. */
const GROUND = new Set(['taxiOut', 'roll', 'rollout', 'taxiIn']);

/** Steht der Jet am Boden (abgestellt, rollt, startet oder rollt aus)? */
export const jetGrounded = (u) => !!u.def?.jet && (!!u.parked || GROUND.has(u.jet?.phase));

/** Flughöhe 0 (Boden) … 1 (Reiseflughöhe) für die Darstellung. */
export const jetAlt = (u) => (u.parked ? 0 : (u.jet?.alt ?? 1));

export const LANE = 38; // Rollgasse rechts neben jeder Spalte der Stellplätze (halber Abstand der Spalten)
export const ROW_GAP = 41; // Gasse zwischen zwei Reihen der Stellplätze (halber Abstand der Reihen)

/** Freier Stellplatz des Flughafens e (abgestellte und hereinrollende Jets belegen ihren Platz). */
function freeSlot(game, u, e) {
  const used = new Set();
  for (const o of game.units) if (o.alive && o !== u && o.jet?.home === e.id && o.jet.slot >= 0) used.add(o.jet.slot);
  let k = 0;
  while (used.has(k) && k < AIRPORT.slots.length - 1) k++;
  return k;
}

/** Abgestellt: auf Stellplatz k (fehlt er: einen freien) des Flughafens e, Nase nach Norden. */
function park(game, u, e, k = freeSlot(game, u, e)) {
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
  u.jet.phase = 'park';
  u.jet.alt = 0;
  u.jet.v = 0;
  u.jet.route = null;
  u.jet.rtb = false;
  u.jet.dir = u.jet.side = undefined;
  u.jet.rtbHome = null;
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

/** Eigener Flughafen, auf dem der Befehl `land` (oder ein Bewegungsbefehl auf das Gelände) den Jet landen lässt, sonst null. */
function landTarget(game, u) {
  const o = u.order;
  if (o.type === 'land') {
    const e = game.getEntity(o.targetId);
    return e && e.team === u.team && isAirport(game, e) ? e : null;
  }
  return o.type === 'move' ? airportAt(game, u.team, o.x, o.y) : null;
}

/** Wie weit ein Befehl den Jet in die Luft schickt: Bewegung, Angriff, Angriffsmarsch, Landen auf einem anderen Flughafen. */
const wantsOut = (u) => u.order.type === 'move' || u.order.type === 'attack' || u.order.type === 'attackMove' || (u.order.type === 'land' && u.order.targetId !== u.jet.home);

/**
 * Rollweg vom Stellplatz k zum Anfang von Bahn 1 (Weltpunkte): nach vorn in die Gasse zwischen den Reihen, in die Rollgasse neben
 * der Spalte, nach Norden zum Rollweg, auf ihm nach Westen, über Bahn 2 bis zum Haltepunkt vor Bahn 1 (hold), dann auf die Bahn.
 */
function taxiOutRoute(e, k) {
  const s = AIRPORT.slots[k];
  const T = AIRPORT.taxi;
  const [R1, R2] = AIRPORT.runways;
  const hold = (R1.y + R1.w / 2 + R2.y - R2.w / 2) / 2;
  const pts = [[s.x, s.y - ROW_GAP], [s.x + LANE, s.y - ROW_GAP], [s.x + LANE, T.y], [T.x0, T.y], [T.x0, hold, true], [T.x0, R1.y]];
  return pts.map(([x, y, h]) => ({ ...at(e, { x, y }), hold: !!h }));
}

/** Rollweg von Bahn 2 (bei lokal x) zum Stellplatz k: zum Rollweg, zur Rollgasse der Spalte, in die Gasse hinter der Reihe, vorwärts hinein. */
function taxiInRoute(e, k, x) {
  const s = AIRPORT.slots[k];
  const T = AIRPORT.taxi;
  const xe = Math.min(T.x1, Math.max(T.x0, x));
  const pts = [[xe, T.y], [s.x + LANE, T.y], [s.x + LANE, s.y + ROW_GAP], [s.x, s.y + ROW_GAP], [s.x, s.y]];
  return pts.map(([px, py]) => ({ ...at(e, { x: px, y: py }), hold: false }));
}

/** Nase höchstens rate × dt in Richtung want drehen. */
function turnTo(u, want, m) {
  let d = want - u.angle;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  u.angle += Math.max(-m, Math.min(m, d));
}

/** Rollt vor u ein anderer Jet desselben Flughafens in dieselbe Richtung (Abstand halten)? */
function blockedAhead(game, u) {
  const cx = Math.cos(u.angle);
  const cy = Math.sin(u.angle);
  for (const o of game.units) {
    if (o === u || !o.alive || !o.def.jet || o.parked || !GROUND.has(o.jet?.phase) || o.jet.home !== u.jet.home) continue;
    const dx = o.x - u.x;
    const dy = o.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d > J.gap || d < 1e-6) continue;
    if (dx * cx + dy * cy > 0.6 * d && Math.cos(o.angle - u.angle) > 0.3) return true;
  }
  return false;
}

/** Hält ein anderer Jet desselben Flughafens die Startbahn (rollt auf sie oder startet)? */
const runwayTaken = (game, u) => game.units.some((o) => o !== u && o.alive && o.def.jet && o.jet?.lock && o.jet.home === u.jet.home);

/** Ein Rollschritt entlang u.jet.route. true, wenn der letzte Punkt erreicht ist. */
function taxi(game, u, dt) {
  const r = u.jet.route;
  const p = r[u.jet.idx];
  if (!p) return true;
  if (p.hold && Math.hypot(p.x - u.x, p.y - u.y) < 1) {
    // Haltepunkt vor der Startbahn: warten, bis sie frei ist, dann sie für sich belegen
    if (runwayTaken(game, u)) return false;
    u.jet.lock = true;
    u.jet.idx++;
    return false;
  }
  const want = Math.atan2(p.y - u.y, p.x - u.x);
  turnTo(u, want, J.taxiTurn * dt);
  if (blockedAhead(game, u) && (u.jet.wait = (u.jet.wait ?? 0) + dt) < J.taxiWait) return false; // Abstand zum Vordermann
  u.jet.wait = 0;
  const d = Math.hypot(p.x - u.x, p.y - u.y);
  const step = J.taxi * dt;
  if (d <= step) {
    u.x = p.x;
    u.y = p.y;
    if (!p.hold) u.jet.idx++;
    return u.jet.idx >= r.length;
  }
  u.x += ((p.x - u.x) / d) * step;
  u.y += ((p.y - u.y) / d) * step;
  return false;
}

/** Am Boden: tanken, nachladen und reparieren aus dem Lager der Hauptstadt; auf Befehl zur Startbahn rollen, wenn bereit. */
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
    // Mit Stadt tankt die F-16 Kerosin aus dem Stadtlager (seit v5.20), ohne Stadt wie bisher Treibstoff aus dem Lager der Hauptstadt
    const city = game.city?.[u.team];
    let got;
    if (city) {
      got = Math.min(want, city.kero);
      city.kero -= got;
    } else {
      got = main ? (main.infinite ? want : Math.min(want, main.store.fuel)) : 0;
      if (main && !main.infinite) main.store.fuel -= got;
    }
    u.fuel += got;
    if (got < want - 1e-9) game.shortage(u.team, city ? 'kero' : 'fuel'); // mit Stadt fehlt Kerosin (eigene Meldung, seit dem Review)
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
  if (u.order.type === 'land') setIdle(u); // steht schon auf diesem Flughafen
  if (u.jet.ready && !was && !wantsOut(u)) game.message(u.team, `${u.def.name} startbereit`, u.x, u.y);
  if (!wantsOut(u)) return;
  if (!u.jet.ready) {
    if (!u.jet.warned) game.message(u.team, `${u.def.name} wird noch betankt und munitioniert`, u.x, u.y);
    u.jet.warned = true;
    return;
  }
  // Start: vom Stellplatz über den Rollweg zur Startbahn (der Stellplatz bleibt belegt, bis der Jet auf der Bahn steht)
  u.parked = false;
  u.jet.warned = false;
  u.jet.phase = 'taxiOut';
  u.jet.route = taxiOutRoute(e, u.jet.slot >= 0 ? u.jet.slot : 0);
  u.jet.idx = 0;
  u.jet.alt = 0;
  u.jet.v = 0;
  u.anchorX = u.order.x ?? u.x;
  u.anchorY = u.order.y ?? u.y;
}

/** Rollen zur Startbahn; am Ende auf der Bahn (Startlauf). Ohne Flughafen ist der Jet verloren. */
function stepTaxiOut(game, u, dt) {
  const e = game.getEntity(u.jet.home);
  if (!e || !isAirport(game, e)) {
    u.hp = 0;
    u.alive = false;
    return;
  }
  if (!taxi(game, u, dt)) return;
  u.jet.phase = 'roll';
  u.jet.route = null;
  u.jet.slot = -1;
  u.jet.v = J.taxi;
}

/** Startlauf auf Bahn 1 nach Osten: Nase auf die Bahn drehen, beschleunigen, bei rotate × Reisetempo abheben. */
function stepRoll(game, u, dt) {
  const full = u.def.speed * modOf(game, u, 'speed');
  turnTo(u, 0, J.taxiTurn * dt);
  if (Math.abs(u.angle) > 0.05) return; // erst ausrichten
  u.jet.v = Math.min(full, u.jet.v + J.accel * dt);
  u.x += u.jet.v * dt;
  if (u.jet.v >= J.rotate * full) {
    u.jet.phase = 'air';
    u.jet.alt = 0;
    u.jet.lift = true; // Steigflug: erst geradeaus, dann frei
    u.jet.lock = false;
  }
}

/** Ausrollen auf Bahn 2: bremsen bis zum Rolltempo, dann über den Rollweg zum reservierten Stellplatz. */
function stepRollout(game, u, dt) {
  const e = game.getEntity(u.jet.home);
  if (!e || !isAirport(game, e)) {
    u.hp = 0;
    u.alive = false;
    return;
  }
  const R = AIRPORT.runways[1];
  const d = u.jet.dir ?? 1;
  turnTo(u, d > 0 ? 0 : Math.PI, J.taxiTurn * dt);
  u.jet.v = Math.max(J.taxi, u.jet.v - J.decel * dt);
  u.x += Math.cos(u.angle) * u.jet.v * dt;
  u.y += (e.y + R.y - u.y) * Math.min(1, 4 * dt); // auf die Mittellinie
  const left = d > 0 ? e.x + R.x1 - 40 - u.x : u.x - (e.x + R.x0 + 40); // Bahn bis zum Ende
  if (u.jet.v > J.taxi && left > 0) return;
  u.jet.phase = 'taxiIn';
  u.jet.route = taxiInRoute(e, u.jet.slot, u.x - e.x);
  u.jet.idx = 0;
}

/** Rollen zum Stellplatz; dort abstellen (tanken, nachladen). */
function stepTaxiIn(game, u, dt) {
  const e = game.getEntity(u.jet.home);
  if (!e || !isAirport(game, e)) {
    u.hp = 0;
    u.alive = false;
    return;
  }
  if (taxi(game, u, dt)) park(game, u, e, u.jet.slot);
}

/** Ein Flugschritt Richtung (tx, ty): Nase höchstens turn × dt × tf drehen, dann mit dem Tempo des Jets geradeaus. */
function fly(u, tx, ty, dt, tf = 1) {
  turnTo(u, Math.atan2(ty - u.y, tx - u.x), J.turn * dt * tf);
  const v = u.jet.v * dt;
  u.x = Math.min(BALANCE.map.width, Math.max(0, u.x + Math.cos(u.angle) * v));
  u.y = Math.min(BALANCE.map.height, Math.max(0, u.y + Math.sin(u.angle) * v));
}

/** Kreisen um (ox, oy) im Abstand orbit: Ziel ein Stück voraus auf dem Kreis. */
function circle(u, ox, oy, dt, tf) {
  const a = Math.atan2(u.y - oy, u.x - ox) + 0.7;
  fly(u, ox + Math.cos(a) * J.orbit, oy + Math.sin(a) * J.orbit, dt, tf);
}

/** Liegt (x, y) auf dem Gelände eines eigenen Flughafens? Dann landet der Jet dort (Rechtsklick auf den eigenen Flughafen). */
function airportAt(game, team, x, y) {
  for (const e of airportsOf(game, team)) {
    const h = (e.w * BALANCE.map.tile) / 2;
    if (Math.abs(x - e.x) <= h && Math.abs(y - e.y) <= h) return e;
  }
  return null;
}

/** Landerichtung auf Bahn 2: +1 von Westen nach Osten, −1 umgekehrt; von der Seite, auf der die Platzrunde in die Karte passt. */
function landDir(e) {
  const R = AIRPORT.runways[1];
  const need = J.final + J.base + 600;
  const west = e.x + R.x0 - need;
  const east = BALANCE.map.width - (e.x + R.x1) - need;
  return west >= 0 || west >= east ? 1 : -1;
}

/**
 * Landeanflug auf Bahn 2 des Flughafens e (wie eine Platzrunde; d = Landerichtung, landDir): Liegt der Jet noch nicht vor dem
 * Eindrehpunkt (Schwelle − base) oder fehlt ihm zum Ausrichten der Platz, fliegt er im Gegenanflug seitlich versetzt hinaus; dann dreht
 * er in den Endanflug (Kurs auf einen Punkt voraus auf der Mittellinie), wird langsamer, sinkt im Gleitpfad, setzt an der Aufsetzmarke
 * auf und rollt aus. Verpasst er die Marke, steigt er wieder und fliegt die Runde neu (Durchstarten).
 */
function approach(game, u, e, dt) {
  const R = AIRPORT.runways[1];
  const d = (u.jet.dir ??= landDir(e));
  const tx = e.x + (d > 0 ? R.x0 : R.x1); // Schwelle
  const ty = e.y + R.y;
  const along = (u.x - tx) * d; // Strecke hinter der Schwelle in Landerichtung (davor negativ)
  const head = Math.cos(u.angle) * d; // 1 = Nase in Landerichtung
  const full = u.jet.speed;
  const dy = u.y - ty;
  const near = dist(u.x, u.y, tx, ty) < J.final * 2.5;
  const aligned = head > 0.95 && Math.abs(dy) < 30;
  const onFinal = head > 0.85 && Math.abs(dy) < 80 && along < J.touch + J.zone && along > -J.final * 2;
  const room = J.touch - along >= Math.abs(dy) * 1.5 + J.glide * 0.6; // genug Strecke, um auf die Mittellinie einzudrehen
  const clampX = (x) => Math.min(BALANCE.map.width - 100, Math.max(100, x));
  const clampY = (y) => Math.min(BALANCE.map.height - 100, Math.max(100, y));
  let want = full;
  if (onFinal || (along < -J.base && room)) {
    // Endanflug: Ziel ein Stück voraus auf der Mittellinie (dreht sicher auf die Bahn ein)
    fly(u, tx + d * Math.min(along + 300, J.touch + 300), ty, dt);
    const glide = onFinal && aligned ? Math.max(0, (J.touch - along) / J.glide) : 1;
    u.jet.alt = glide < u.jet.alt ? Math.max(glide, u.jet.alt - (2 * dt) / J.climb) : Math.min(1, u.jet.alt + dt / J.climb);
    if (onFinal && along >= J.touch - 2 && u.jet.alt <= 0.02) {
      // in der Aufsetzzone (Marke bis Marke + zone) am Boden
      u.jet.phase = 'rollout'; // aufgesetzt
      u.jet.alt = 0;
      u.jet.home = e.id;
      u.jet.slot = freeSlot(game, u, e);
      u.jet.rtb = false;
      return;
    }
    want = J.approach * full;
  } else {
    // Gegenanflug: seitlich der Bahn (Seite, auf der er ankommt) hinaus, bis Platz zum Eindrehen ist
    u.jet.side ??= dy >= 0 ? 1 : -1;
    if (clampY(ty + u.jet.side * J.pattern) !== ty + u.jet.side * J.pattern) u.jet.side = -u.jet.side; // Kartenrand
    const off = along < -J.base ? Math.max(J.pattern, Math.min(Math.abs(dy), J.pattern * 2)) : J.pattern;
    fly(u, clampX(tx - d * (J.final + J.base + 400)), clampY(ty + u.jet.side * off), dt);
    u.jet.alt = Math.min(1, u.jet.alt + dt / J.climb);
    if (near) want = J.downwind * full;
  }
  u.jet.v = u.jet.v > want ? Math.max(want, u.jet.v - J.slow * dt) : Math.min(want, u.jet.v + J.accel * dt);
}

/** In der Luft: Treibstoff, Heimweg, Befehl (Ziel verfolgen, Punkt anfliegen, kreisen), Landung. */
function stepAirborne(game, u, dt) {
  const burn = u.def.fuelPerSec * modOf(game, u, 'fuel') * dt; // konforme Tanks (Forschung)
  u.fuel = Math.max(0, u.fuel - burn);
  game.teams[u.team].used.fuel += burn;
  u.jet.speed = u.def.speed * modOf(game, u, 'speed'); // Nachbrenner (Forschung)
  u.jet.v ??= u.jet.speed;
  u.jet.alt ??= 1;
  if (u.fuel <= 0) {
    u.hp = 0; // leer: Absturz
    u.alive = false;
    game.message(u.team, `${u.def.name} abgestürzt: kein Treibstoff`, u.x, u.y);
    return;
  }
  // Steigflug nach dem Start: zuerst geradeaus, mit der Höhe frei wendig
  const tf = u.jet.lift ? Math.min(1, u.jet.alt / 0.5) : 1;
  if (u.jet.lift && u.jet.alt >= 1) u.jet.lift = false;
  const o = u.order;
  let home = homeFor(game, u);
  // freiwillig landen: Befehl „Landen“ oder Befehlspunkt auf einem eigenen Flughafen
  let asked = landTarget(game, u);
  if (asked && !(freeSpace(game, asked) + (u.jet.home === asked.id ? 1 : 0) > 0)) {
    game.message(u.team, `${u.def.name}: Flughafen voll`, u.x, u.y);
    setIdle(u);
    asked = null;
  } else if (!asked && o.type === 'land') setIdle(u); // Flughafen weg
  if (asked) home = asked;
  const toHome = home ? dist(u.x, u.y, home.x + AIRPORT.landing.x, home.y + AIRPORT.landing.y) + J.final : 0;
  const bingo = home && u.fuel <= (toHome / u.jet.speed) * u.def.fuelPerSec * modOf(game, u, 'fuel') * J.reserve + J.margin;
  // Rückkehr wegen Treibstoff oder Raketen bleibt bis zur Landung (u.jet.rtb), auf Befehl nur, solange der Befehl gilt
  if (u.jet.rtb === 'asked' && !asked) u.jet.rtb = false;
  if (home && (u.jet.rtb || bingo || dry(u) || asked)) {
    const why = u.jet.rtb || (bingo ? 'fuel' : dry(u) ? 'ammo' : 'asked');
    if (!u.jet.rtb && why !== 'asked') game.message(u.team, `${u.def.name} kehrt zum Flughafen zurück (${why === 'fuel' ? 'Treibstoff' : 'keine Raketen'})`, u.x, u.y);
    if (u.jet.rtbHome !== home.id) u.jet.side = u.jet.dir = undefined; // neue Platzrunde
    u.jet.rtbHome = home.id;
    u.jet.rtb = why;
    if (u.jet.lift) {
      fly(u, u.x + Math.cos(u.angle) * 300, u.y + Math.sin(u.angle) * 300, dt, tf); // erst steigen
      u.jet.alt = Math.min(1, u.jet.alt + dt / J.climb);
      return;
    }
    approach(game, u, home, dt);
    return;
  }
  u.jet.rtbHome = null;
  u.jet.side = u.jet.dir = undefined;
  // Höhe und Tempo zurück auf Reiseflug
  u.jet.alt = Math.min(1, u.jet.alt + dt / J.climb);
  u.jet.v = Math.min(u.jet.speed, u.jet.v + J.accel * dt);
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
    fly(u, t.x, t.y, dt, tf);
    return;
  }
  if (o.type === 'move' || o.type === 'attackMove') {
    if (o.type === 'attackMove' && u.targetId !== null) {
      const t = resolveTarget(game, u.targetId);
      if (isFoe(u.team, t)) {
        fly(u, t.x, t.y, dt, tf);
        return;
      }
    }
    if (dist(u.x, u.y, o.x, o.y) > J.orbit) {
      fly(u, o.x, o.y, dt, tf);
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
      fly(u, t.x, t.y, dt, tf);
      return;
    }
    u.targetId = null;
  }
  circle(u, u.anchorX, u.anchorY, dt, tf);
}

/** Alle Jets einen Schritt (nach updateMovement; Bewegung der Jets nur hier). */
export function updateAircraft(game, dt) {
  for (const u of game.units) {
    if (!u.alive || !u.def.jet) continue;
    u.jet ??= { home: 0, slot: -1, ready: true, warned: false };
    u.jet.phase ??= u.parked ? 'park' : 'air';
    if (u.parked) stepParked(game, u, dt);
    else if (u.jet.phase === 'taxiOut') stepTaxiOut(game, u, dt);
    else if (u.jet.phase === 'roll') stepRoll(game, u, dt);
    else if (u.jet.phase === 'rollout') stepRollout(game, u, dt);
    else if (u.jet.phase === 'taxiIn') stepTaxiIn(game, u, dt);
    else stepAirborne(game, u, dt);
    u.path = [];
    u.pathIndex = 0;
  }
}

/**
 * Befehl `{ type: 'land', ids, airportId }` (seit v5.15): gewählte Flugzeuge landen auf dem eigenen Flughafen airportId (Landeanflug,
 * Ausrollen, Rollen zum Stellplatz). Abgestellte Jets eines anderen Flughafens starten und fliegen hinüber.
 */
export function cmdLand(game, team, cmd) {
  const e = game.getEntity(cmd.airportId);
  if (!e || e.team !== team || !isAirport(game, e)) return { ok: false, reason: 'Eigenen fertigen Flughafen wählen' };
  const jets = game.ownUnits(team, cmd.ids).filter((u) => u.def.jet);
  if (!jets.length) return { ok: false, reason: 'Kein Flugzeug gewählt' };
  const homed = jets.filter((u) => u.jet?.home === e.id).length;
  if (freeSpace(game, e) + homed <= 0) return { ok: false, reason: `Flughafen voll (${J.capacity} Flugzeuge)` };
  for (const u of jets) {
    u.order = { type: 'land', x: e.x, y: e.y, targetId: e.id };
    u.targetId = null;
  }
  return { ok: true, count: jets.length };
}

/** Zusatzprüfung der Ausbildung (game.cmdTrain): Platz im Flughafen. Fehlertext oder null. */
export function trainCheck(game, b, unit) {
  if (!UNITS[unit]?.jet) return null;
  if (!isAirport(game, b)) return 'Nur ein fertiger Flughafen bildet Flugzeuge aus';
  if (freeSpace(game, b) <= 0) return `Flughafen voll (${J.capacity} Flugzeuge)`;
  return null;
}
