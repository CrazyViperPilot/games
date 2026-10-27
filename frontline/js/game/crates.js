// Versorgungskisten (nach den Reliquien aus Age of Empires II): liegen abseits der Konfliktzone. Ein Soldat trägt eine zur eigenen
// fertigen FOB; jede eingelagerte Kiste bringt dem Team laufend Geld. Fällt der Träger oder die FOB, liegt sie wieder am Boden (PRD §7).
// Kein DOM.
import { BALANCE } from '../data/balance.js';
import { driveTo, setIdle, footDist } from './movement.js';

const C = BALANCE.crates;
const TILE = BALANCE.map.tile;
const CRATE_BASE = 100000; // Kisten-IDs −(CRATE_BASE + i), weit weg von den Häusern (−1, −2, …)
const STUCK_HOLD = BALANCE.crates.stuckHold; // s, die ein Träger ohne Weg zur FOB wartet, bis er es neu versucht
const STALL_TIME = BALANCE.crates.stallTime; // s ohne Fortkommen (Gedränge an der FOB): dann gilt die Kiste als abgeliefert, …
const STALL_REACH = BALANCE.crates.stallReach; // … wenn der Träger so nah an der FOB-Wand steht

const fail = (reason) => ({ ok: false, reason });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Nur Infanterie trägt Kisten, eine je Soldat. */
export const canCarry = (u) => u.def.armor === 'inf' && !u.crate;

/** Eigene fertige FOB (auch die Haupt-FOB): dort werden Kisten eingelagert. */
export const isDepot = (b, team) => !!b && b.alive && b.kind === 'building' && b.type === 'fob' && b.built && b.team === team;

/** Nächste freie Zellmitte (kein Gelände, kein Gebäude), damit beide Teams eine abgelegte Kiste erreichen. */
function nearestFree(grid, x, y) {
  const c0 = grid.toCell(x);
  const r0 = grid.toCell(y);
  if (grid.free(c0, r0)) return { x, y };
  for (let rad = 1; rad <= 30; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) === rad && grid.free(c0 + dc, r0 + dr)) {
          return { x: grid.center(c0 + dc), y: grid.center(r0 + dr) };
        }
      }
    }
  }
  return { x, y };
}

/**
 * Kisten der Karte als Entities (negative IDs, team −1, nie zerstörbar). state: 'ground' (liegt bei x, y), 'carried' (carrier =
 * Einheiten-ID, folgt dem Träger) oder 'stored' (fobId, liegt im Hof der FOB). holder = Team des Trägers bzw. der FOB (sonst −1).
 * game.crateSeen[team]: was das Team über Kisten am Boden weiß (Map ID → {x, y}); die Fundorte stehen auf der Karte.
 */
export function createCrates(game) {
  game.crates = (game.map.crates ?? []).map((src, i) => {
    const p = nearestFree(game.grid, src.x, src.y);
    const c = {
      id: -(CRATE_BASE + i),
      kind: 'crate',
      team: -1,
      def: { name: 'Versorgungskiste' },
      x: p.x,
      y: p.y,
      state: 'ground',
      carrier: 0,
      fobId: 0,
      holder: -1,
      alive: true,
    };
    game.entities.set(c.id, c);
    return c;
  });
  game.crateSeen = [0, 1].map(() => new Map(game.crates.map((c) => [c.id, { x: c.x, y: c.y }])));
}

/**
 * Lagebild der Kisten je Team (nach jedem Nebel-Update): eine Kiste am Boden in Sicht wird vermerkt; wer die vermerkte Stelle
 * sieht und dort keine Kiste mehr, streicht den Eintrag (aufgehoben, weggetragen).
 */
export function updateCrateIntel(game) {
  if (!game.crateSeen) return;
  for (let t = 0; t < game.crateSeen.length; t++) {
    const mem = game.crateSeen[t];
    for (const c of game.crates) {
      const m = mem.get(c.id);
      if (c.state === 'ground' && game.isVisible(t, c.x, c.y)) {
        if (!m || m.x !== c.x || m.y !== c.y) mem.set(c.id, { x: c.x, y: c.y });
      } else if (m && game.isVisible(t, m.x, m.y)) {
        mem.delete(c.id);
      }
    }
  }
}

/** Eingelagerte Kisten eines Teams (oder einer FOB, wenn fobId angegeben ist). */
export function storedCrates(game, team, fobId = 0) {
  let n = 0;
  for (const c of game.crates ?? []) if (c.state === 'stored' && c.holder === team && (!fobId || c.fobId === fobId)) n++;
  return n;
}

/** Platz der i-ten Kiste im Hof einer FOB: Reihen zu vier an der unteren linken Ecke. */
export function slotPos(f, i) {
  return {
    x: f.cx * TILE + 14 + (i % 4) * 17,
    y: (f.cy + f.h) * TILE - 12 - Math.floor(i / 4) * 15,
  };
}

/** Nächste eigene fertige FOB (Luftlinie) oder null. */
function nearestDepot(game, u) {
  let best = null;
  let bd = Infinity;
  for (const b of game.buildings) {
    if (!isDepot(b, u.team)) continue;
    const d = dist(b.x, b.y, u.x, u.y);
    if (d < bd) {
      best = b;
      bd = d;
    }
  }
  return best;
}

function giveOrder(u, order) {
  u.order = order;
  u.targetId = null;
  u.path = [];
  u.pathIndex = 0;
  u.repathTimer = 0;
}

/** Kiste ablegen (wo sie gerade ist); sie gehört dann wieder niemandem. */
function drop(game, c, x = c.x, y = c.y) {
  const p = nearestFree(game.grid, x, y);
  c.state = 'ground';
  c.carrier = 0;
  c.fobId = 0;
  c.holder = -1;
  c.x = p.x;
  c.y = p.y;
}

/** Träger macht sich auf den Weg zur nächsten eigenen FOB (ohne FOB bleibt er stehen). */
function startDeliver(game, u) {
  const f = nearestDepot(game, u);
  if (!f) return false;
  giveOrder(u, { type: 'deliver', x: f.x, y: f.y, targetId: f.id });
  return true;
}

/**
 * { type: 'pickup', ids, crateId }: der nächste gewählte Soldat ohne Kiste holt sie und bringt sie zur nächsten eigenen FOB,
 * die übrigen (ohne Kiste) gehen als Begleitschutz mit.
 */
export function cmdPickup(game, team, cmd) {
  const c = game.entities.get(cmd.crateId);
  if (!c || c.kind !== 'crate') return fail('Keine Versorgungskiste');
  if (c.state === 'stored') return fail('Kiste ist schon eingelagert');
  if (c.state === 'carried') return fail('Kiste wird schon getragen');
  const all = game.ownUnits(team, cmd.ids);
  const list = all.filter(canCarry);
  if (!list.length) return fail(all.some((u) => u.crate) ? 'Trägt schon eine Kiste' : 'Nur Infanterie trägt Kisten');
  list.sort((a, b) => dist(a.x, a.y, c.x, c.y) - dist(b.x, b.y, c.x, c.y) || a.id - b.id);
  const u = list[0];
  giveOrder(u, { type: 'pickup', x: c.x, y: c.y, targetId: c.id });
  const rest = all.filter((x) => x !== u && !x.crate);
  if (rest.length) game.issue(team, { type: 'move', ids: rest.map((x) => x.id), x: c.x, y: c.y + 40 });
  return { ok: true, id: u.id };
}

/** { type: 'deliver', ids, fobId }: Kistenträger bringen ihre Kiste zu dieser eigenen fertigen FOB. */
export function cmdDeliver(game, team, cmd) {
  const f = game.getEntity(cmd.fobId);
  if (!isDepot(f, team)) return fail('Eigene fertige FOB wählen');
  const list = game.ownUnits(team, cmd.ids).filter((u) => u.crate);
  if (!list.length) return fail('Niemand trägt eine Kiste');
  for (const u of list) giveOrder(u, { type: 'deliver', x: f.x, y: f.y, targetId: f.id });
  return { ok: true, count: list.length };
}

/** { type: 'dropCrate', ids }: Träger legen ihre Kiste ab (sie bleibt liegen, bis jemand sie wieder aufhebt). */
export function cmdDropCrate(game, team, cmd) {
  const list = game.ownUnits(team, cmd.ids).filter((u) => u.crate);
  if (!list.length) return fail('Niemand trägt eine Kiste');
  for (const u of list) {
    const c = game.entities.get(u.crate);
    u.crate = 0;
    if (c) drop(game, c, u.x, u.y);
    if (u.order.type === 'deliver') setIdle(u);
  }
  return { ok: true, count: list.length };
}

/** Unterwegs zur Kiste: hingehen, aufheben, dann zur FOB. Ist sie weg, bleibt der Soldat stehen. */
function stepPicker(game, u, dt) {
  const c = game.entities.get(u.order.targetId);
  if (!c || c.kind !== 'crate' || c.state !== 'ground' || u.crate) {
    if (c && c.state === 'carried' && game.entities.get(c.carrier)?.team !== u.team) {
      game.notify(u.team, 'crateGone', 'Der Gegner hat die Kiste zuerst', 5, c.x, c.y);
    }
    setIdle(u);
    return;
  }
  const st = driveTo(game, u, c.x, c.y, C.pickReach, dt);
  if (st === 'stuck') {
    game.message(u.team, 'Kein Weg zur Kiste', u.x, u.y);
    setIdle(u);
    return;
  }
  if (st !== 'arrived') return;
  u.crate = c.id;
  c.state = 'carried';
  c.carrier = u.id;
  c.holder = u.team;
  c.x = u.x;
  c.y = u.y;
  game.message(1 - u.team, 'Der Gegner hat eine Versorgungskiste aufgenommen', c.x, c.y);
  if (!startDeliver(game, u)) setIdle(u);
}

/** Träger auf dem Weg zur FOB: bis an die Wand, dann einlagern. Ist die FOB gefallen, nimmt er die nächste. */
function stepCarrier(game, u, dt) {
  const c = game.entities.get(u.crate);
  if (!c) {
    setIdle(u);
    return;
  }
  let f = game.getEntity(u.order.targetId);
  if (!isDepot(f, u.team)) {
    f = nearestDepot(game, u);
    if (!f) {
      setIdle(u);
      return;
    }
    giveOrder(u, { type: 'deliver', x: f.x, y: f.y, targetId: f.id });
  }
  const x0 = u.x;
  const y0 = u.y;
  let st = driveTo(game, u, f.x, f.y, C.deliverReach, dt, f);
  // Gedränge an der FOB (Sammelpunkt): wer nahe dran feststeckt, gibt die Kiste über die Köpfe weiter
  u.crateStall = Math.hypot(u.x - x0, u.y - y0) < 0.5 ? (u.crateStall || 0) + dt : 0;
  if (st === 'driving' && u.crateStall >= STALL_TIME && footDist(u.x, u.y, f) <= STALL_REACH) st = 'arrived';
  if (st === 'stuck') {
    game.notify(u.team, 'crateStuck', 'Kein Weg zur FOB', 10, u.x, u.y);
    u.crateHold = game.time + STUCK_HOLD;
    setIdle(u);
    return;
  }
  if (st !== 'arrived') return;
  const slot = game.crates.filter((x) => x.state === 'stored' && x.fobId === f.id).length;
  const p = slotPos(f, slot);
  c.state = 'stored';
  c.carrier = 0;
  c.fobId = f.id;
  c.holder = u.team;
  c.x = p.x;
  c.y = p.y;
  u.crate = 0;
  u.crateStall = 0;
  setIdle(u);
  game.message(u.team, `Versorgungskiste eingelagert: +${C.income} Geld/s`, f.x, f.y);
  game.message(1 - u.team, 'Der Gegner hat eine Versorgungskiste eingelagert', f.x, f.y);
}

/**
 * Ein Schritt (nach der Bewegung): Kisten folgen ihren Trägern oder fallen zu Boden (Träger tot, FOB gefallen); Holer und Träger
 * laufen; wer mit Kiste untätig steht, bringt sie zur nächsten eigenen FOB; jede eingelagerte Kiste zahlt `income` Geld/s.
 */
export function updateCrates(game, dt) {
  if (!game.crates || !game.crates.length) return;
  const lostAt = new Map(); // FOB-ID → Team, das dort Kisten verloren hat (eine Meldung je FOB)
  for (const c of game.crates) {
    const team = c.holder;
    if (c.state === 'carried') {
      const u = game.entities.get(c.carrier);
      if (u && u.alive && u.crate === c.id) {
        c.x = u.x;
        c.y = u.y;
        continue;
      }
      if (u && u.crate === c.id) u.crate = 0;
      drop(game, c);
      game.notify(team, 'crateDrop', 'Kistenträger gefallen – die Kiste liegt am Boden', 5, c.x, c.y);
    } else if (c.state === 'stored') {
      const f = game.entities.get(c.fobId);
      if (f && f.alive) {
        const t = game.teams[team];
        const perSec = C.income * t.incomeMult;
        t.rate.money += perSec;
        t.res.money += perSec * dt;
        continue;
      }
      lostAt.set(c.fobId, team);
      drop(game, c);
    }
  }
  for (const team of lostAt.values()) game.message(team, 'FOB verloren – ihre Versorgungskisten liegen am Boden');
  for (const u of game.units) {
    if (!u.alive) continue;
    const o = u.order.type;
    if (o === 'pickup') stepPicker(game, u, dt);
    else if (o === 'deliver') stepCarrier(game, u, dt);
    else if (u.crate && o === 'idle' && game.time >= (u.crateHold || 0)) startDeliver(game, u);
  }
}
