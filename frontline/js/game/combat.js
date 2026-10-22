// Kampf: Zielsuche, Direktfeuer, Mörser und Granaten, Flugabwehr, Schaden (PLAN.md §5). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { createShell, inRange, radiusOf } from './entities.js';
import { buildHash, nearby } from './movement.js';

const SCAN = BALANCE.scanInterval;
const MAX_UNIT_RADIUS = 16; // größter Einheitenradius (Trefferkreis-Suche)
const BASE_WARN_INTERVAL = 20; // s zwischen zwei Meldungen „Basis wird angegriffen“

/** Waffenwerte einer Einheit oder eines Gebäudes; null, wenn unbewaffnet. */
export function weaponOf(e) {
  if (e.kind === 'unit') {
    if (!e.def.range || !e.def.damage) return null;
    return {
      range: e.def.range,
      minRange: 0,
      cooldown: e.def.cooldown,
      damage: e.def.damage,
      splash: 0,
      shell: false,
      ammoPerShot: e.def.ammoPerShot || 0,
    };
  }
  return e.def.weapon ?? null;
}

const dmgKey = (e) => (e.kind === 'building' ? 'struct' : e.def.armor);

/** Zieht Munition für einen Schuss ab. false (Mangelmeldung) wenn der Teamvorrat nicht reicht; ohne Verbrauch immer true. */
function takeAmmo(game, s, need, dt) {
  if (!(need > 0)) return true;
  if (game.teams[s.team].res.mun < need) {
    game.shortage(s.team, 'mun');
    return false;
  }
  game.useRes(s.team, 'mun', need, dt);
  return true;
}

function warnBase(game, target) {
  const team = game.teams[target.team];
  if (game.time - team.lastWarn <= BASE_WARN_INTERVAL) return;
  const r = BALANCE.fob.buildRadius;
  const inBase = game.buildings.some(
    (b) => b.alive && b.built && b.team === target.team && b.type === 'fob' && Math.hypot(b.x - target.x, b.y - target.y) <= r,
  );
  if (!inBase) return;
  team.lastWarn = game.time;
  game.message(target.team, 'Basis wird angegriffen', target.x, target.y);
}

/** Fügt Schaden zu, setzt lastHitTime und markiert Tote. */
export function hit(game, target, amount) {
  if (!target.alive || !(amount > 0)) return;
  target.hp -= amount;
  target.lastHitTime = game.time;
  if (target.hp <= 0) target.alive = false;
  warnBase(game, target);
}

/**
 * Zielsuche für einen Schützen: zuerst Einheiten (nächste sichtbare), sonst Gebäude (ohne Mauern/Tore).
 * Idle-Einheiten suchen nur innerhalb der Leine um ihren Ankerpunkt.
 */
function findTarget(game, hash, s, radius, minRange, allowBuildings) {
  const team = s.team;
  const leashed = s.kind === 'unit' && s.order.type === 'idle';
  let best = null;
  let bestD = Infinity;
  const consider = (e) => {
    if (!e.alive || e.team === team) return;
    if (leashed && Math.hypot(e.x - s.anchorX, e.y - s.anchorY) > BALANCE.leash + radiusOf(e)) return;
    const d = Math.hypot(e.x - s.x, e.y - s.y);
    if (d < minRange || d > radius + radiusOf(e)) return;
    if (!game.isVisible(team, e.x, e.y)) return;
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  };
  for (const e of nearby(hash, s.x, s.y, radius + MAX_UNIT_RADIUS)) consider(e);
  if (best || !allowBuildings) return best;
  for (const b of game.buildings) {
    if (b.def.blocksAll || b.def.gate) continue;
    consider(b);
  }
  return best;
}

function fireDirect(game, s, t, w) {
  const dmg = w.damage[dmgKey(t)] || 0;
  if ((w.damage.light || 0) >= 60) {
    // Panzerabwehr / Kampfpanzer: Geschoss plus kleine Explosion
    game.addEffect('shell', s.x, s.y, s.team, t.x, t.y);
    game.addEffect('explosion', t.x, t.y, s.team);
  } else {
    game.addEffect('tracer', s.x, s.y, s.team, t.x, t.y);
  }
  s.cooldown = w.cooldown;
  hit(game, t, dmg);
}

function fireShell(game, s, tx, ty, w) {
  game.projectiles.push(createShell(game.newId(), s.team, s.x, s.y, tx, ty, w));
  game.addEffect('muzzle', s.x, s.y, s.team);
  s.cooldown = w.cooldown;
}

/**
 * Schießt auf t, wenn Abklingzeit abgelaufen und t in Reichweite (Mörser: Mindestreichweite und Sicht).
 * Ohne Munition wird nicht geschossen; die Abklingzeit läuft dann nicht an.
 */
function tryFire(game, s, t, w, dt) {
  if (s.cooldown > 0) return;
  if (w.shell) {
    const d = Math.hypot(t.x - s.x, t.y - s.y);
    if (d < w.minRange || !inRange(s, t, w.range)) return;
    if (!game.isVisible(s.team, t.x, t.y)) return;
    if (!takeAmmo(game, s, w.ammoPerShot, dt)) return;
    fireShell(game, s, t.x, t.y, w);
    return;
  }
  if (!inRange(s, t, w.range)) return;
  if (!takeAmmo(game, s, w.ammoPerShot, dt)) return;
  fireDirect(game, s, t, w);
}

/** Flugabwehr: jede bereite Flugabwehr fängt die nächste gegnerische Granate in Reichweite mit `chance` ab. */
function interceptShells(game, dt) {
  for (const b of game.buildings) {
    if (!b.alive || !b.built || !b.def.aa || b.aaCooldown > 0) continue;
    let best = null;
    let bestD = Infinity;
    for (const p of game.projectiles) {
      if (!p.alive || p.team === b.team) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d <= b.def.aa.range && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    if (!best) continue;
    if (!takeAmmo(game, b, b.def.aa.ammoPerShot, dt)) continue;
    b.aaCooldown = b.def.aa.cooldown;
    if (game.rng.next() < b.def.aa.chance) {
      best.alive = false;
      game.addEffect('intercept', best.x, best.y, b.team);
      game.message(b.team, 'Granate abgefangen', best.x, best.y);
    }
  }
}

/** Einschlag: Flächenschaden mit linearem Abfall über `splash` an alle gegnerischen Entities. */
function impact(game, p) {
  p.alive = false;
  game.addEffect('explosion', p.tx, p.ty, p.team);
  const R = p.splash || 1;
  for (const list of [game.units, game.buildings]) {
    for (const e of list) {
      if (!e.alive || e.team === p.team) continue;
      const d = Math.max(0, Math.hypot(e.x - p.tx, e.y - p.ty) - radiusOf(e));
      if (d >= R) continue;
      const dmg = (p.damage[dmgKey(e)] || 0) * (1 - d / R);
      hit(game, e, dmg);
    }
  }
}

function updateProjectiles(game, dt) {
  for (const p of game.projectiles) {
    if (!p.alive) continue;
    p.t += dt;
    const f = Math.min(1, p.t / p.duration);
    p.x = p.sx + (p.tx - p.sx) * f;
    p.y = p.sy + (p.ty - p.sy) * f;
  }
  interceptShells(game, dt);
  for (const p of game.projectiles) {
    if (p.alive && p.t >= p.duration) impact(game, p);
  }
  game.projectiles = game.projectiles.filter((p) => p.alive);
}

/** Ein Kampfschritt: Abklingzeiten, Zielsuche, Feuer, Granaten. */
export function updateCombat(game, dt) {
  const { units, buildings } = game;
  for (const u of units) {
    if (!u.alive) continue;
    u.cooldown = Math.max(0, u.cooldown - dt);
    u.scanTimer -= dt;
  }
  for (const b of buildings) {
    if (!b.alive) continue;
    b.cooldown = Math.max(0, b.cooldown - dt);
    b.aaCooldown = Math.max(0, b.aaCooldown - dt);
    b.scanTimer -= dt;
  }

  const hash = buildHash(units.filter((u) => u.alive));

  for (const u of units) {
    if (!u.alive) continue;
    const w = weaponOf(u);
    if (!w) continue;
    const o = u.order.type;
    if (o === 'move' || o === 'buildFob') continue; // Marschierende Einheiten feuern nicht automatisch
    if (o === 'attack') {
      const t = game.getEntity(u.order.targetId);
      if (t && t.team !== u.team) tryFire(game, u, t, w, dt);
      continue;
    }
    // idle / attackMove: automatische Zielsuche
    if (u.scanTimer <= 0) {
      u.scanTimer = SCAN;
      const t = findTarget(game, hash, u, u.def.sight, 0, true);
      u.targetId = t ? t.id : null;
    }
    if (u.targetId !== null) {
      const t = game.getEntity(u.targetId);
      if (t) tryFire(game, u, t, w, dt);
    }
  }

  for (const b of buildings) {
    if (!b.alive || !b.built) continue;
    const w = weaponOf(b);
    if (!w) continue;
    if (b.scanTimer <= 0) {
      b.scanTimer = SCAN;
      const t = findTarget(game, hash, b, w.range, w.minRange, true);
      b.targetId = t ? t.id : null;
    }
    if (b.targetId !== null) {
      const t = game.getEntity(b.targetId);
      if (t) tryFire(game, b, t, w, dt);
    }
  }

  updateProjectiles(game, dt);
}
