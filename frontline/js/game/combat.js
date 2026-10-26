// Kampf: Zielsuche, Direktfeuer, Mörser und Granaten, Flugabwehr, Schaden (PLAN.md §5, §11.2). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { createShell, inRange, radiusOf, isFoe, canAttack, resolveTarget } from './entities.js';
import { buildHash, nearby } from './movement.js';
import { damageHouse } from './garrison.js';
import { addCrater } from './scars.js';
import { auraCooldown } from './commander.js';
import { weatherSight } from './weather.js';
import { armorMul, opticsMul } from './research.js';
import { damageBridge, deckDist } from './river.js';

const SCAN = BALANCE.scanInterval;
const MAX_UNIT_RADIUS = 16; // größter Einheitenradius (Trefferkreis-Suche)
const BASE_WARN_INTERVAL = 20; // s zwischen zwei Meldungen „Basis wird angegriffen“
// Aufträge, bei denen nicht automatisch geschossen wird (Marsch, Bau, Reparatur, Logistik)
const NO_FIRE = new Set(['move', 'build', 'repair', 'load', 'unload', 'route', 'pickup', 'deliver']);
const GAR = BALANCE.garrison;

/** Waffenwerte eines Gebäudes; null, wenn unbewaffnet. (Einheiten haben mehrere Waffen: u.weapons.) */
export function weaponOf(e) {
  return e.kind === 'unit' ? null : (e.def.weapon ?? null);
}

const dmgKey = (e) => (e.kind === 'building' ? 'struct' : e.def.armor);

/** Reichweite aus einem Stadthaus zählt ab der Hauswand (die Besatzer schießen aus den Fenstern). */
const reachBonus = (game, u) => (u.house ? (game.entities.get(u.house)?.reach ?? 0) : 0);

/** Schadensfaktor gegen Stadthäuser: schwere Waffen (Kanone, RPG, Granaten, Mörser) mehr, Handwaffen weniger. */
export const houseMult = (damage) => ((damage.struct || 0) >= GAR.heavy ? GAR.heavyMult : GAR.lightMult);

/** Seite, auf der der Schütze das Ziel trifft: 'front' (±45° zur Fahrtrichtung), 'rear' (±45° hinten), sonst 'side'. */
export function sectorOf(s, t) {
  let d = Math.atan2(s.y - t.y, s.x - t.x) - (t.angle || 0);
  d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
  return d <= Math.PI / 4 ? 'front' : d >= (3 * Math.PI) / 4 ? 'rear' : 'side';
}

/**
 * Schaden eines Direkttreffers. Hat die Waffe für das Ziel (Typ, sonst Panzerklasse) eine Trefferzahl (`hits`),
 * töten genau so viele Treffer das volle Ziel; sonst gilt die Schadenstabelle der Panzerklasse.
 * mult (z. B. Höhenvorteil): Schaden × mult, bei Trefferzahlen gerundet n / mult Treffer (mindestens 1).
 */
export function shotDamage(spec, s, t, mult = 1) {
  if (t.kind === 'house' || t.kind === 'bridge') return (spec.damage.struct || 0) * mult * houseMult(spec.damage);
  const table = spec.hits;
  const entry = table && t.kind === 'unit' ? (table[t.type] ?? table[t.def.armor]) : undefined;
  if (entry === undefined) return (spec.damage[dmgKey(t)] || 0) * mult;
  const n = typeof entry === 'number' ? entry : entry[sectorOf(s, t)];
  const k = mult === 1 ? n : Math.max(1, Math.round(n / mult));
  return (t.def.hp / k) * 1.001;
}

/** Schusshöhe: Gelände unter dem Schützen bzw. Ziel, Besatzer eines Hauses ein Stockwerk höher; Hubschrauber zählen nicht (null). */
function standHeight(game, e) {
  if (e.kind === 'unit' && e.def.air) return null;
  return game.groundHeight(e) + (e.house ? GAR.floor : 0);
}

/**
 * Höhenvorteil im Direktfeuer (Age of Empires II): steht der Schütze höher, bis +bonus Schaden, steht er tiefer, bis −bonus.
 * Unter `dead` Höhenunterschied kein Effekt, voll ab `full`. 1 auf flachen Karten und mit Hubschraubern.
 */
export function heightMult(game, s, t) {
  if (!game.relief) return 1;
  const hs = standHeight(game, s);
  const ht = standHeight(game, t);
  if (hs === null || ht === null) return 1;
  const H = BALANCE.height;
  const dh = hs - ht;
  const f = Math.min(1, Math.max(0, (Math.abs(dh) - H.dead) / (H.full - H.dead)));
  return 1 + Math.sign(dh) * f * H.bonus;
}

/**
 * Zieht Munition für einen Schuss eines Gebäudes aus dem Lager seines Versorgers (supplierOf) ab.
 * false (Mangelmeldung), wenn es nicht reicht.
 */
function takeAmmo(game, s, need) {
  if (!(need > 0)) return true;
  const stats = game.teams[s.team].used;
  const sup = game.supplierOf(s);
  if (!sup || sup.store.mun < need) {
    game.shortage(s.team, 'mun');
    return false;
  }
  sup.store.mun -= need;
  stats.mun += need;
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

/** Fügt Schaden zu, setzt lastHitTime und markiert Tote. Stadthäuser: garrison.damageHouse, Brücken: river.damageBridge. Einheiten: erforschte Panzerung. */
export function hit(game, target, amount) {
  if (!target.alive || !(amount > 0)) return;
  if (target.kind === 'house') {
    damageHouse(game, target, amount);
    return;
  }
  if (target.kind === 'bridge') {
    damageBridge(game, target, amount);
    return;
  }
  if (target.kind === 'unit') amount *= armorMul(game, target, amount);
  target.hp -= amount;
  target.lastHitTime = game.time;
  if (target.hp <= 0) {
    target.alive = false;
    game.bounty(target);
  }
  warnBase(game, target);
}

/**
 * Zielsuche für einen Schützen: zuerst Einheiten (nächste sichtbare, Besatzer zählen nicht), dann vom Gegner besetzte Häuser,
 * sonst Gebäude (ohne Mauern/Tore). Idle-Einheiten suchen nur innerhalb der Leine um ihren Ankerpunkt.
 */
function findTarget(game, hash, s, radius, minRange, allowBuildings, dmg) {
  const team = s.team;
  const leashed = s.kind === 'unit' && s.order.type === 'idle';
  let best = null;
  let bestD = Infinity;
  const consider = (e) => {
    if (!e.alive || !isFoe(team, e) || e.house) return;
    if (!(dmg[dmgKey(e)] > 0)) return; // z. B. Mörser und Panzer können keine Hubschrauber treffen
    if (leashed && Math.hypot(e.x - s.anchorX, e.y - s.anchorY) > Math.max(BALANCE.leash, radius) + radiusOf(e)) return;
    const d = Math.hypot(e.x - s.x, e.y - s.y);
    if (d < minRange || d > radius + radiusOf(e)) return;
    if (!game.sees(team, e)) return;
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  };
  for (const e of nearby(hash, s.x, s.y, radius + MAX_UNIT_RADIUS)) consider(e);
  if (best) return best;
  for (const h of game.garrisoned) consider(h);
  if (best || !allowBuildings) return best;
  for (const b of game.buildings) {
    if (b.def.blocksAll || b.def.gate) continue;
    consider(b);
  }
  return best;
}

function fireDirect(game, s, t, w) {
  const dmg = shotDamage(w, s, t, heightMult(game, s, t));
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

/**
 * Einheit schießt auf t. Waffenwahl unter den schussbereiten Waffen in Reichweite, die dem Ziel schaden:
 * zuerst eine Waffe, die für die Panzerklasse des Ziels vorgesehen ist (targets), sonst die mit dem
 * besten Schaden je Munition. Ohne einen vollen Schuss: Mangelmeldung, keine Abklingzeit.
 */
function tryFireUnit(game, u, t) {
  const key = dmgKey(t);
  const bonus = reachBonus(game, u);
  const reach = opticsMul(game, u.team); // Wärmebildoptik: weiter
  let pick = null;
  let pickScore = -1;
  let dry = false;
  for (const w of u.weapons) {
    const dmg = w.spec.damage[key] || 0;
    if (!(dmg > 0) || !inRange(u, t, w.spec.range * reach + bonus) || w.cd > 0) continue;
    if (w.rounds < 1) {
      dry = true;
      continue;
    }
    const score = (w.spec.targets && w.spec.targets.includes(key) ? 1e6 : 0) + dmg / w.spec.munCost;
    if (score > pickScore) {
      pick = w;
      pickScore = score;
    }
  }
  if (!pick) {
    if (dry) game.shortage(u.team, 'mun');
    return;
  }
  pick.rounds -= 1;
  pick.cd = auraCooldown(u, pick.spec.cooldown); // Kommandeur in der Nähe: schneller
  game.teams[u.team].used.mun += pick.spec.munCost;
  if ((pick.spec.damage.light || 0) >= 60) {
    game.addEffect('shell', u.x, u.y, u.team, t.x, t.y);
    game.addEffect('explosion', t.x, t.y, u.team);
  } else {
    game.addEffect('tracer', u.x, u.y, u.team, t.x, t.y);
  }
  if (u.def.stealth) u.revealedUntil = game.time + BALANCE.stealth.revealTime; // ein Schuss verrät die Stellung
  hit(game, t, shotDamage(pick.spec, u, t, heightMult(game, u, t)));
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
function tryFire(game, s, t, w) {
  if (s.cooldown > 0) return;
  if (w.shell) {
    const d = Math.hypot(t.x - s.x, t.y - s.y);
    if (d < w.minRange || !inRange(s, t, w.range)) return;
    if (!game.isVisible(s.team, t.x, t.y)) return;
    if (!takeAmmo(game, s, w.ammoPerShot)) return;
    fireShell(game, s, t.x, t.y, w);
    return;
  }
  if (!inRange(s, t, w.range)) return;
  if (!takeAmmo(game, s, w.ammoPerShot)) return;
  fireDirect(game, s, t, w);
}

/** Mörser mit gewähltem Ziel: schießt alle `cooldown` s dorthin, solange das Lager der FOB Munition hat. */
function fireAtGround(game, b, w) {
  if (b.cooldown > 0) return;
  const t = b.fireTarget;
  const d = Math.hypot(t.x - b.x, t.y - b.y);
  if (d < w.minRange || d > w.range) return;
  if (!takeAmmo(game, b, w.ammoPerShot)) return;
  fireShell(game, b, t.x, t.y, w);
}

/** Flugabwehr: jede bereite Flugabwehr fängt die nächste gegnerische Granate in Reichweite mit `chance` ab. */
function interceptShells(game) {
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
    if (!takeAmmo(game, b, b.def.aa.ammoPerShot)) continue;
    b.aaCooldown = b.def.aa.cooldown;
    if (game.rng.next() < b.def.aa.chance) {
      best.alive = false;
      game.addEffect('intercept', best.x, best.y, b.team);
      game.message(b.team, 'Granate abgefangen', best.x, best.y);
    }
  }
}

/** Einschlag: Flächenschaden mit linearem Abfall über `splash` an alle gegnerischen Entities (Besatzer schützt ihr Haus) und an Brücken. */
function impact(game, p) {
  p.alive = false;
  game.addEffect('explosion', p.tx, p.ty, p.team);
  addCrater(game, p.tx, p.ty);
  const R = p.splash || 1;
  for (const h of game.garrisoned) {
    if (!h.alive || !isFoe(p.team, h)) continue;
    const d = Math.hypot(Math.max(0, Math.abs(h.x - p.tx) - h.pw / 2), Math.max(0, Math.abs(h.y - p.ty) - h.ph / 2));
    if (d < R) hit(game, h, (p.damage.struct || 0) * houseMult(p.damage) * (1 - d / R));
  }
  for (const b of game.bridges ?? []) {
    if (b.broken) continue;
    const d = deckDist(b, p.tx, p.ty);
    if (d < R) hit(game, b, (p.damage.struct || 0) * houseMult(p.damage) * (1 - d / R));
  }
  for (const list of [game.units, game.buildings]) {
    for (const e of list) {
      if (!e.alive || e.team === p.team || e.house) continue;
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
  interceptShells(game);
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
    for (const w of u.weapons) w.cd = Math.max(0, w.cd - dt);
    u.scanTimer -= dt;
  }
  for (const b of buildings) {
    if (!b.alive) continue;
    b.cooldown = Math.max(0, b.cooldown - dt);
    b.aaCooldown = Math.max(0, b.aaCooldown - dt);
    b.scanTimer -= dt;
  }

  const hash = buildHash(units.filter((u) => u.alive));
  const sightMul = weatherSight(game); // Regen, Nebel und Schnee verkürzen die Zielsuche
  const optics = [opticsMul(game, 0), opticsMul(game, 1)]; // Wärmebildoptik verlängert sie

  for (const u of units) {
    if (!u.alive || !u.weapons.length || u.crate) continue; // Kistenträger haben die Hände voll
    const o = u.order.type;
    if (NO_FIRE.has(o)) continue;
    if (o === 'attack') {
      const t = resolveTarget(game, u.order.targetId);
      if (canAttack(u.team, t)) tryFireUnit(game, u, t);
      continue;
    }
    // idle / attackMove: automatische Zielsuche
    if (u.scanTimer <= 0) {
      u.scanTimer = SCAN;
      const t = findTarget(game, hash, u, u.def.sight * sightMul * optics[u.team] + reachBonus(game, u), 0, true, u.def.damage);
      u.targetId = t ? t.id : null;
    }
    if (u.targetId !== null) {
      const t = resolveTarget(game, u.targetId);
      if (isFoe(u.team, t)) tryFireUnit(game, u, t);
    }
  }

  for (const b of buildings) {
    if (!b.alive || !b.built) continue;
    const w = weaponOf(b);
    if (!w) continue;
    if (w.shell && b.fireTarget) {
      fireAtGround(game, b, w); // gewähltes Ziel: kein automatisches Feuer
      continue;
    }
    if (b.scanTimer <= 0) {
      b.scanTimer = SCAN;
      const t = findTarget(game, hash, b, w.range, w.minRange, true, w.damage);
      b.targetId = t ? t.id : null;
    }
    if (b.targetId !== null) {
      const t = resolveTarget(game, b.targetId);
      if (isFoe(b.team, t)) tryFire(game, b, t, w);
    }
  }

  updateProjectiles(game, dt);
}
