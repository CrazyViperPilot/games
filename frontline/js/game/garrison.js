// Häuserkampf: Infanterie besetzt Stadthäuser (Wohnhaus, Halle, Fabrik, Bahnhof), ist dort geschützt und schießt weiter.
// Schwere Waffen zerstören das Haus; dann fallen die Besatzer verletzt heraus und es bleibt eine Ruine (PRD §7). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { driveTo, setIdle, exitHouse } from './movement.js';

const G = BALANCE.garrison;
const TILE = BALANCE.map.tile;

const fail = (reason) => ({ ok: false, reason });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Nur Infanterie besetzt Häuser. */
export const canGarrison = (u) => u.def.armor === 'inf';

/**
 * Häuser aus den Stadtgebäuden der Karte (Arten aus BALANCE.garrison, nicht gedreht, keine Mauern). Sie sind Entities mit
 * negativen IDs (die IDs von Einheiten und Gebäuden bleiben gleich), Rüstung 'struct' und team −1, solange niemand drin ist.
 * pw/ph = Größe in px, cx/cy/w/h in Zellen wie bei Gebäuden; reach = halbe mittlere Seitenlänge (Reichweite ab Hauswand).
 */
export function createHouses(game) {
  game.houses = [];
  game.houseBySrc = new Map(); // Stadtgebäude der Karte → Haus (Renderer)
  game.garrisoned = []; // besetzte Häuser (Zielsuche)
  let id = -1;
  for (const b of game.map.town?.buildings ?? []) {
    const k = G.kinds[b.kind];
    if (!k || b.angle || b.w < G.minSize || b.h < G.minSize) continue;
    const h = {
      id: id--,
      kind: 'house',
      type: b.kind,
      team: -1,
      def: { name: k.name, armor: 'struct', hp: k.hp, cap: k.cap },
      x: b.x,
      y: b.y,
      pw: b.w,
      ph: b.h,
      cx: (b.x - b.w / 2) / TILE,
      cy: (b.y - b.h / 2) / TILE,
      w: b.w / TILE,
      h: b.h / TILE,
      reach: (b.w + b.h) / 4,
      hp: k.hp,
      maxHp: k.hp,
      alive: true,
      ruined: false,
      occupants: [],
      lastHitTime: -1e9,
      src: b,
    };
    game.houses.push(h);
    game.houseBySrc.set(b, h);
    game.entities.set(h.id, h);
  }
}

/** Das Haus, in dem die Einheit sitzt, oder null. */
export function houseOf(game, u) {
  return u.house ? (game.entities.get(u.house) ?? null) : null;
}

/** Plätze, die noch frei sind (Besatzer und Einheiten auf dem Weg hinein zählen). */
export function freeSeats(game, h, team) {
  let n = h.occupants.length;
  for (const u of game.units) if (u.alive && u.team === team && u.order.type === 'garrison' && u.order.targetId === h.id) n++;
  return h.def.cap - n;
}

/** Darf `team` dieses Haus betreten? Nicht eingestürzt und nicht vom Gegner besetzt. */
export function canEnter(h, team) {
  return !!h && h.kind === 'house' && h.alive && (h.team < 0 || h.team === team);
}

/**
 * { type: 'garrison', ids, houseId }: Infanterie geht in ein leeres oder eigenes Stadthaus. Die nächsten so viele, wie Plätze frei
 * sind, gehen hinein; wer keinen Platz bekommt, stellt sich daneben.
 */
export function cmdGarrison(game, team, cmd) {
  const h = game.getEntity(cmd.houseId);
  if (!h || h.kind !== 'house') return fail('Kein Gebäude zum Besetzen');
  if (!canEnter(h, team)) return fail('Gebäude ist vom Gegner besetzt');
  const list = game.ownUnits(team, cmd.ids).filter((u) => canGarrison(u) && u.house !== h.id);
  if (!list.length) {
    return fail(game.ownUnits(team, cmd.ids).some(canGarrison) ? 'Schon im Gebäude' : 'Nur Infanterie besetzt Gebäude');
  }
  const free = freeSeats(game, h, team);
  if (free <= 0) return fail('Gebäude ist voll');
  list.sort((a, b) => dist(a.x, a.y, h.x, h.y) - dist(b.x, b.y, h.x, h.y) || a.id - b.id);
  const go = list.slice(0, free);
  for (const u of go) {
    u.order = { type: 'garrison', x: h.x, y: h.y, targetId: h.id };
    u.targetId = null;
    u.path = [];
    u.pathIndex = 0;
    u.repathTimer = 0;
  }
  const rest = list.slice(free);
  if (rest.length) game.issue(team, { type: 'move', ids: rest.map((u) => u.id), x: h.x, y: h.y + h.ph / 2 + 40 });
  return { ok: true, count: go.length };
}

/** { type: 'ungarrison', ids }: gewählte Besatzer verlassen ihr Haus (ringsum an der Wand). */
export function cmdUngarrison(game, team, cmd) {
  const list = game.ownUnits(team, cmd.ids).filter((u) => u.house);
  if (!list.length) return fail('Niemand im Gebäude');
  for (const u of list) {
    exitHouse(game, u);
    setIdle(u);
  }
  return { ok: true, count: list.length };
}

/** Einheit betritt das Haus: steht in der Mitte, bewegt sich nicht mehr, Haus gehört ihrem Team. */
function enter(game, u, h) {
  if (u.house) exitHouse(game, u);
  u.house = h.id;
  u.x = h.x;
  u.y = h.y;
  u.fogKey = null;
  setIdle(u);
  h.occupants.push(u);
  h.team = u.team;
}

/** Auf dem Weg ins Haus: hinlaufen bis an die Wand, dann hinein (wenn Platz ist und kein Gegner zuvorkam). */
function stepWalker(game, u, dt) {
  const h = game.getEntity(u.order.targetId);
  if (!h || h.kind !== 'house') {
    setIdle(u);
    return;
  }
  if (!canEnter(h, u.team)) {
    game.notify(u.team, 'houseTaken', 'Gebäude ist vom Gegner besetzt', 3, h.x, h.y);
    setIdle(u);
    return;
  }
  const st = driveTo(game, u, h.x, h.y, G.enterReach, dt, h);
  if (st === 'stuck') {
    game.message(u.team, 'Kein Weg zum Gebäude', u.x, u.y);
    setIdle(u);
    return;
  }
  if (st !== 'arrived') return;
  if (h.occupants.length >= h.def.cap) {
    game.notify(u.team, 'houseFull', 'Gebäude ist voll', 3, h.x, h.y);
    setIdle(u);
    return;
  }
  enter(game, u, h);
}

/**
 * Schaden an einem Haus (aus combat.hit). Die Besatzer bleiben unverletzt, bis das Haus einstürzt: dann fallen sie mit
 * ejectDamage heraus, und es bleibt eine Ruine (versperrt den Weg weiter, kann nicht mehr besetzt werden).
 */
export function damageHouse(game, h, amount) {
  if (!h.alive || !(amount > 0)) return;
  h.hp -= amount;
  h.lastHitTime = game.time;
  for (const u of h.occupants) u.lastHitTime = game.time;
  if (h.hp > 0) return;
  h.hp = 0;
  h.alive = false;
  h.ruined = true;
  const team = h.team;
  const list = h.occupants.slice();
  for (const u of list) {
    exitHouse(game, u);
    setIdle(u);
    u.hp -= u.maxHp * G.ejectDamage;
    if (u.hp <= 0) {
      u.alive = false;
      game.bounty(u);
    }
  }
  h.occupants = [];
  h.team = -1;
  game.addEffect('explosion', h.x, h.y, -1);
  if (team >= 0) {
    game.message(team, `${h.def.name} eingestürzt – Besatzung verschüttet`, h.x, h.y);
    game.message(1 - team, `${h.def.name} eingestürzt – Besatzung vertrieben`, h.x, h.y);
  }
}

/** Tote Einheit aus ihrem Haus streichen (Game.cleanup). */
export function dropOccupant(game, u) {
  const h = houseOf(game, u);
  u.house = 0;
  if (!h) return;
  const i = h.occupants.indexOf(u);
  if (i >= 0) h.occupants.splice(i, 1);
  if (!h.occupants.length) h.team = -1;
}

/**
 * Ein Schritt (vor der Bewegung): Besatzer mit einem anderen Auftrag als Bereit/Angriff gehen hinaus (z. B. Einsteigen, Bauen),
 * Einheiten auf dem Weg laufen weiter, die Liste der besetzten Häuser wird erneuert.
 */
export function updateGarrison(game, dt) {
  for (const h of game.houses) {
    if (!h.occupants.length) continue;
    const gone = h.occupants.filter((u) => !u.alive || u.house !== h.id);
    for (const u of gone) if (u.house === h.id) u.house = 0;
    if (gone.length) h.occupants = h.occupants.filter((u) => !gone.includes(u));
    if (!h.occupants.length) h.team = -1;
    for (const u of h.occupants.slice()) {
      const o = u.order;
      if (o.type !== 'idle' && o.type !== 'attack') exitHouse(game, u, o.x, o.y);
    }
  }
  for (const u of game.units) {
    if (u.alive && u.order.type === 'garrison') stepWalker(game, u, dt);
  }
  game.garrisoned = game.houses.filter((h) => h.alive && h.occupants.length > 0);
}
