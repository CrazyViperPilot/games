// Heliport als Landeplatz der Hubschrauber (seit v5.50, PRD §15 „Heliport“, Daniels Wunsch „den Heliport an den Flughafen
// angleichen“): ein Hubschrauber je Heliport, dort ausgebildet; er startet und landet dort senkrecht, tankt gelandet Kerosin aus dem
// nächsten Kerosintank und lädt aus dem Munitionslager (Umkreis CITY.air.supplyRadius, wie die Jets). Start und Landung sperren die
// Heliports im Umkreis kurz (mit Tower kürzer). Heimflug bei knappem Treibstoff oder leeren Waffen. Kein DOM, deterministisch.
//
// Zustand am Hubschrauber: u.heli = { home: Id des Heliports, phase: 'landed' | 'takeoff' | 'air' | 'landing', t, alt (0 Boden … 1) }.
// Ohne u.heli (ohne Stadt, alte Spielstände, Hubschrauber aus der Hauptstadt) fliegt er wie bisher.
import { CITY } from '../data/city.js';
import { KINDS, KIND_ID } from './city.js';
import { supplier } from './aircraft.js';
import { driveTo, setIdle, planPath } from './movement.js';
import { modOf } from './research.js';

const AIR = CITY.air;
const H = AIR.heli;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Ist e ein fertiger, lebender Heliport einer Stadt? */
export function isHeliport(game, e) {
  if (!e || !e.alive || e.cityCell == null) return false;
  const c = game.city?.[e.team];
  return !!c && KINDS[c.kind[e.cityCell] - 1] === 'heliport' && c.level[e.cityCell] > 0;
}

/** Steht der Hubschrauber auf seinem Heliport oder startet bzw. landet er gerade (dann schießt er nicht und gilt als Bodenziel)? */
export const heliGrounded = (u) => !!u.heli && u.heli.phase !== 'air';

/** Flughöhe 0 … 1 für die Darstellung (ohne Landeplatz immer 1). */
export const heliAlt = (u) => (u.heli ? u.heli.alt : 1);

/** Hubschrauber, die zu Heliport e gehören (dort, in der Luft oder in seiner Warteschlange). */
export function helisAt(game, e) {
  let n = 0;
  for (const u of game.units) if (u.alive && u.heli?.home === e.id) n++;
  return n + (e.queue?.length ?? 0);
}

/** Neuer Hubschrauber aus der Ausbildung (economy.js): steht gelandet auf seinem Heliport. */
export function landHeliNew(game, u, e) {
  u.heli = { home: e.id, phase: 'landed', t: 0, alt: 0 };
  u.x = e.x;
  u.y = e.y;
  u.prevX = e.x;
  u.prevY = e.y;
  setIdle(u);
}

/** Sperrzeit nach Start oder Landung an Heliport e: mit Tower im Umkreis kürzer. */
function sepOf(game, c, e) {
  for (const [i, t] of c.ents) {
    if (t.alive && c.kind[i] === KIND_ID.atc && c.level[i] && dist(t.x, t.y, e.x, e.y) <= AIR.atcRadius * c.cell) return H.sepAtc;
  }
  return H.sep;
}

/** Darf u an Heliport e starten oder landen? Kein anderer Start/keine andere Landung im Umkreis sepRadius läuft noch. */
function padFree(game, c, e, u) {
  const R = H.sepRadius * c.cell;
  for (const [id, b] of Object.entries(c.padBusy ?? {})) {
    if (b.until <= game.time || b.by === u.id) continue;
    const o = game.getEntity(+id);
    if (o && dist(o.x, o.y, e.x, e.y) <= R) return false;
  }
  return true;
}

/** Restzeit der Luftraumsperre an Heliport e (für die Anzeige), 0 frei. */
export function padBusy(game, e) {
  const c = game.city?.[e.team];
  if (!c) return 0;
  const R = H.sepRadius * c.cell;
  let left = 0;
  for (const [id, b] of Object.entries(c.padBusy ?? {})) {
    const o = game.getEntity(+id);
    if (o && dist(o.x, o.y, e.x, e.y) <= R) left = Math.max(left, b.until - game.time);
  }
  return left;
}

function lockPad(game, c, e, u) {
  c.padBusy ??= {};
  c.padBusy[e.id] = { until: game.time + sepOf(game, c, e), by: u.id };
}

/** Will der Befehl den gelandeten Hubschrauber in die Luft? (Landen auf dem eigenen Heliport nicht.) */
const wantsOut = (u) => u.order.type !== 'idle' && !(u.order.type === 'land' && u.order.targetId === u.heli.home);

/** Bordwaffen leer (nur Hubschrauber mit Waffen)? */
const dry = (u) => u.weapons.length > 0 && !u.weapons.some((w) => w.rounds >= 1);

/** Gelandet: tanken (Kerosintank), nachladen (Munitionslager); fehlt das Lager in der Nähe, Mangelmeldung. */
function supply(game, u, e, dt) {
  const mod = modOf(game, u, 'rearm');
  if (u.def.fuelMax && u.fuel < u.def.fuelMax) {
    const t = supplier(game, e, KIND_ID.ktank);
    const want = u.def.fuelMax - u.fuel;
    const got = t ? Math.min(want, t.stock, (AIR.tank.rate[game.city[e.team].level[t.cityCell]] * dt) / mod) : 0;
    if (t) t.stock -= got;
    u.fuel += got;
    if (!t) game.shortage(u.team, 'kero');
  }
  if (u.ammo < u.def.ammoMax) {
    const d = supplier(game, e, KIND_ID.mdepot);
    const want = u.def.ammoMax - u.ammo;
    const got = d ? Math.min(want, d.stock, (AIR.depot.rate[game.city[e.team].level[d.cityCell]] * dt) / mod) : 0;
    if (d) d.stock -= got;
    u.ammo += got;
    game.teams[u.team].used.mun += got;
    if (!d) game.shortage(u.team, 'mun');
  }
}

/** Auf dem Heliport festhalten (Start, Landung, gelandet). */
function hold(u, e) {
  u.x = e.x;
  u.y = e.y;
  u.path = [];
  u.pathIndex = 0;
}

/** Zum Heliport e fliegen lassen (Befehl land). */
function sendHome(u, e) {
  u.order = { type: 'land', x: e.x, y: e.y, targetId: e.id };
  u.targetId = null;
  u.path = [];
  u.pathIndex = 0;
}

/** Alle Hubschrauber mit Landeplatz einen Schritt (nach updateMovement). */
export function updateHelis(game, dt) {
  if (!game.city) return;
  for (const u of game.units) {
    if (!u.alive || !u.heli || u.def.jet) continue;
    const h = u.heli;
    const c = game.city[u.team];
    const home = game.getEntity(h.home);
    const homeOk = isHeliport(game, home) && home.team === u.team;
    if (h.phase !== 'air' && !homeOk) {
      // Heliport zerstört: am Boden mit ihm verloren, beim Start oder der Landung durchstarten
      if (h.phase === 'landed') {
        u.hp = 0;
        u.alive = false;
        continue;
      }
      h.phase = 'air';
      h.alt = 1;
    }
    if (h.phase === 'landed') {
      hold(u, home);
      h.alt = 0;
      supply(game, u, home, dt);
      if (u.order.type === 'land') setIdle(u);
      if (wantsOut(u) && u.fuel > 0 && padFree(game, c, home, u)) {
        lockPad(game, c, home, u);
        h.phase = 'takeoff';
        h.t = 0;
      }
    } else if (h.phase === 'takeoff') {
      hold(u, home);
      h.t += dt;
      h.alt = Math.min(1, h.t / H.liftTime);
      if (h.t >= H.liftTime) {
        h.phase = 'air';
        if (Number.isFinite(u.order.x)) planPath(game, u, u.order.x, u.order.y); // Weg zum Befehlsziel (am Boden festgehalten, darum jetzt)
      }
    } else if (h.phase === 'landing') {
      const pad = game.getEntity(u.order.targetId) ?? home;
      hold(u, pad);
      h.t += dt;
      h.alt = Math.max(0, 1 - h.t / H.liftTime);
      if (h.t >= H.liftTime) {
        h.phase = 'landed';
        h.alt = 0;
        h.home = pad.id;
        setIdle(u);
      }
    } else {
      h.alt = 1;
      // Heimflug: Treibstoff nur noch für den Heimweg oder Waffen leer (nicht bei Lade-, Pendel- und Absetzaufträgen)
      if (homeOk && ['idle', 'move', 'attack', 'attackMove'].includes(u.order.type) && u.def.fuelMax) {
        const need = (dist(u.x, u.y, home.x, home.y) / Math.max(1, u.def.speed)) * (u.def.fuelPerSec || 0) * H.home + H.reserve * (u.def.fuelPerSec || 0);
        if (u.fuel <= need || dry(u)) {
          if (!h.warned) game.message(u.team, `${u.def.name} kehrt zum Heliport zurück (${u.fuel <= need ? 'Treibstoff' : 'Munition'})`, u.x, u.y);
          h.warned = true;
          sendHome(u, home);
        }
      }
      if (u.order.type !== 'land') continue;
      h.warned = false;
      const pad = game.getEntity(u.order.targetId);
      if (!isHeliport(game, pad) || pad.team !== u.team || (pad.id !== h.home && helisAt(game, pad) > 0)) {
        setIdle(u);
        continue;
      }
      if (driveTo(game, u, pad.x, pad.y, 40, dt) !== 'arrived') continue; // über dem Heliport (Wegende liegt bis 32 px davor)
      if (!padFree(game, c, pad, u)) continue; // über dem Heliport warten, bis der Luftraum frei ist
      lockPad(game, c, pad, u);
      h.home = pad.id;
      h.phase = 'landing';
      h.t = 0;
    }
  }
}

/** Zusatzprüfung der Ausbildung am Heliport: ein Hubschrauber je Heliport. Fehlertext oder null. */
export function heliTrainCheck(game, b, unit) {
  if (!isHeliport(game, b)) return null;
  return helisAt(game, b) > 0 ? 'Heliport belegt (ein Hubschrauber je Heliport)' : null;
}

/**
 * Befehl `{ type: 'land', ids, airportId }` mit einem Heliport als Ziel (seit v5.50; game.js wählt zwischen diesem und cmdLand der
 * Jets): gewählte Hubschrauber fliegen hin und landen. Jeder Heliport nimmt einen Hubschrauber: seinen eigenen oder, wenn er frei
 * ist, den ersten Gewählten (der damit dort zu Hause ist); die übrigen landen auf freien Heliports in der Nähe.
 */
export function cmdHeliLand(game, team, cmd) {
  const e = game.getEntity(cmd.airportId);
  if (!isHeliport(game, e) || e.team !== team) return { ok: false, reason: 'Eigenen fertigen Heliport wählen' };
  const helis = game.ownUnits(team, cmd.ids).filter((u) => u.def.air && !u.def.jet);
  if (!helis.length) return { ok: false, reason: 'Kein Hubschrauber gewählt' };
  const c = game.city[team];
  const pads = [...c.ents.entries()]
    .filter(([i, p]) => p.alive && KINDS[c.kind[i] - 1] === 'heliport' && c.level[i])
    .map(([, p]) => p)
    .sort((a, b) => (a === e ? -1 : b === e ? 1 : dist(a.x, a.y, e.x, e.y) - dist(b.x, b.y, e.x, e.y)));
  const taken = new Set();
  let n = 0;
  for (const u of helis) {
    const own = u.heli && pads.find((p) => p.id === u.heli.home);
    const pad = own && !taken.has(own.id) ? own : pads.find((p) => !taken.has(p.id) && helisAt(game, p) === 0);
    if (!pad) continue;
    taken.add(pad.id);
    u.heli ??= { home: pad.id, phase: 'air', t: 0, alt: 1 }; // Hubschrauber ohne Heliport (alte Stände): bekommt diesen
    u.order = { type: 'land', x: pad.x, y: pad.y, targetId: pad.id };
    u.targetId = null;
    u.path = [];
    u.pathIndex = 0;
    n++;
  }
  if (!n) return { ok: false, reason: 'Kein freier Heliport (ein Hubschrauber je Heliport)' };
  return { ok: true, count: n };
}
