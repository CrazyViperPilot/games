// Absetzen aus der C-130 (Paket E13, Teil b): ein Transportflugzeug mit Passagieren fliegt zum Punkt (Befehl paradrop) und
// setzt sie dort mit dem Fallschirm ab. Kein DOM.
// Zustand: u.paradrop = { x, y } solange das Flugzeug anfliegt (aircraft.js überspringt es dann); u.chute (s) je Passagier nach dem
// Absetzen: solange > 0 schießt er nicht (combat.js). Werte: UNITS.c130 (dropReach, dropRadius, chuteTime).
// Nach dem Absetzen bekommt das Flugzeug den vorhandenen Landebefehl zu seinem Stellplatz (cmdLand, aircraft.js).
import { UNITS } from '../data/units.js';
import { nearestPassable, setIdle } from './movement.js';
import { cmdLand } from './aircraft.js';

const C = UNITS.c130;
const fail = (reason) => ({ ok: false, reason });

/** { type: 'paradrop', ids, x, y }: fliegende C-130 mit Passagieren fliegen zum Punkt und setzen sie dort ab. */
export function cmdParadrop(game, team, cmd) {
  if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) return fail('Kein Punkt gewählt');
  const planes = game.ownUnits(team, cmd.ids).filter((u) => u.type === 'c130' && u.passengers.length > 0);
  if (!planes.length) return fail('Kein Transportflugzeug mit Passagieren gewählt');
  // Fliegend: sofort anfliegen. Am Stellplatz (E15): erst über die vorhandene Startlogik starten (aircraft.js wantsOut); im Flug
  // setzt stepRoll dann u.paradrop. Am Boden rollend: nein.
  const ok = planes.filter((u) => u.parked || !u.jet?.phase || u.jet.phase === 'air');
  if (!ok.length) return fail('Flugzeug rollt noch am Boden');
  const x = Math.min(Math.max(cmd.x, 0), game.map.width);
  const y = Math.min(Math.max(cmd.y, 0), game.map.height);
  for (const u of ok) {
    if (!u.parked) u.paradrop = { x, y };
    u.order = { type: 'paradrop', x, y, targetId: null };
    u.targetId = null;
  }
  return { ok: true, count: ok.length };
}

/** Schritt je Tick: Flugzeuge im Anflug, Fallschirm-Zeiten der Passagiere. */
export function updateParadrop(game, dt) {
  for (const u of game.units) {
    if (!u.alive) continue;
    if (u.chute > 0) u.chute = Math.max(0, u.chute - dt);
    if (u.paradrop) approach(game, u, dt);
  }
}

/** Geradeaus auf den Punkt, Tempo wie in UNITS.c130; im Umkreis dropReach wird abgesetzt. */
function approach(game, u, dt) {
  const o = u.paradrop;
  const dx = o.x - u.x;
  const dy = o.y - u.y;
  const d = Math.hypot(dx, dy);
  if (d > C.dropReach) {
    const s = Math.min(d, C.speed * dt) / d;
    u.x += dx * s;
    u.y += dy * s;
    u.angle = Math.atan2(dy, dx);
    return;
  }
  drop(game, u, o);
}

/** Alle Passagiere wieder lebendig setzen, im Umkreis dropRadius um den Punkt, dann Heimflug. */
function drop(game, u, o) {
  const n = u.passengers.length;
  for (const p of u.passengers) {
    const a = game.rng.next() * Math.PI * 2;
    const r = Math.sqrt(game.rng.next()) * C.dropRadius;
    const spot = nearestPassable(game.grid, o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, p.team) || { x: o.x, y: o.y };
    p.x = spot.x;
    p.y = spot.y;
    p.alive = true;
    p.chute = C.chuteTime;
    setIdle(p);
    if (!game.units.includes(p)) game.units.push(p);
    game.entities.set(p.id, p);
  }
  u.passengers = [];
  u.paradrop = null;
  game.message(u.team, `${n} Fallschirmjäger abgesetzt`, u.x, u.y);
  const home = game.getEntity(u.jet?.home);
  const r = home ? cmdLand(game, u.team, { ids: [u.id], airportId: home.id }) : { ok: false };
  if (!r.ok) setIdle(u); // kein Stellplatz mit Weg zur Bahn: das Flugzeug kreist, Landung von Hand
}
