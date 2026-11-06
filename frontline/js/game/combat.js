// Kampf: Zielsuche, Direktfeuer, Mörser und Granaten, Flugabwehr, Schaden (docs/verlauf.md §5, §11.2). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { createShell, inRange, radiusOf, isFoe, canAttack, resolveTarget } from './entities.js';
import { buildHash, nearby } from './movement.js';
import { damageHouse, houseFire, ruinCoverMul, houseCanFire } from './garrison.js';
import { addCrater } from './scars.js';
import { auraCooldown } from './commander.js';
import { weatherSight } from './weather.js';
import { armorMul, modOf, rangeMul, sightMul, dealtMul, smokeMul, hasUnlock } from './research.js';

/** Forschung „Autonome Türme“: Dachaufbauten feuern ohne Besatzung. */
const autoTurret = (game, team) => hasUnlock(game, team, 'autoturret');
import { damageBridge, deckDist } from './river.js';
import { forEnemyCity } from './city/query.js';
import { jetGrounded, parkedArmor } from './aircraft.js';

const SCAN = BALANCE.scanInterval;
const MAX_UNIT_RADIUS = 16; // größter Einheitenradius (Trefferkreis-Suche)
const BASE_WARN_INTERVAL = BALANCE.baseAttackWarn; // s zwischen zwei Meldungen „Basis wird angegriffen“
// Aufträge, bei denen nicht automatisch geschossen wird (Marsch, Bau, Reparatur, Logistik)
const NO_FIRE = new Set(['move', 'build', 'repair', 'load', 'unload', 'route', 'pickup', 'deliver', 'storm']);
const GAR = BALANCE.garrison;

/** Waffenwerte eines Gebäudes; null, wenn unbewaffnet. (Einheiten haben mehrere Waffen: u.weapons.) */
export function weaponOf(e) {
  return e.kind === 'unit' ? null : (e.def.weapon ?? null);
}

const dmgKey = (e) => (e.kind === 'building' ? 'struct' : e.def.jet ? (jetGrounded(e) ? 'light' : 'jet') : e.heli && e.heli.phase !== 'air' ? 'light' : e.def.armor); // Jet am Boden (seit v5.35) und Hubschrauber auf dem Heliport (seit v5.51): wie ein leichtes Fahrzeug

/**
 * Schaden einer Schadenstabelle gegen e. Flugzeuge (def.jet, seit v5.15) haben die eigene Klasse 'jet'; fehlt sie in der
 * Tabelle, gilt der Wert gegen Hubschrauber ('air'), so treffen Flak, SAM und Flugabwehr Jets wie bisher.
 */
const dmgVs = (table, e) => {
  const k = dmgKey(e);
  return (k === 'jet' ? (table.jet ?? table.air) : table[k]) || 0;
};

/** Ist die Waffe für die Klasse des Ziels vorgesehen (targets; Jets zählen wie 'air')? */
const meant = (spec, e) => {
  const k = dmgKey(e);
  return !!spec.targets && (spec.targets.includes(k) || (k === 'jet' && spec.targets.includes('air')));
};

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
  if (entry === undefined) return dmgVs(spec.damage, t) * mult;
  const n = typeof entry === 'number' ? entry : entry[sectorOf(s, t)];
  const k = mult === 1 ? n : Math.max(1, Math.round(n / mult));
  return (t.def.hp / k) * 1.001;
}

/** Schusshöhe: Gelände unter dem Schützen bzw. Ziel, Besatzer eines Hauses ein Stockwerk höher; Hubschrauber zählen nicht (null). */
function standHeight(game, e) {
  if (e.kind === 'unit' && e.def.air) return null;
  return game.groundHeight(e) + (e.house ? (game.entities.get(e.house)?.kind === 'building' ? BALANCE.fortress.floor : GAR.floor) : 0);
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
 * Zieht Munition für einen Schuss eines Gebäudes aus dem Lager seines Versorgers (supplierOf) ab, dazu `money` Geld aus der Kasse
 * (Phalanx: moneyPerShot). false (Mangelmeldung), wenn eins nicht reicht; dann wird nichts abgezogen.
 */
function takeAmmo(game, s, need, money = 0) {
  if (!(need > 0) && !(money > 0)) return true;
  const team = game.teams[s.team];
  const sup = need > 0 ? game.supplierOf(s) : null;
  if (need > 0 && (!sup || sup.store.mun < need)) {
    game.shortage(s.team, 'mun');
    return false;
  }
  if (money > 0 && team.res.money < money) {
    game.notify(s.team, 'ammoMoney', `${s.def.name}: zu wenig Geld für Munition`);
    return false;
  }
  if (sup) sup.store.mun -= need;
  team.used.mun += need;
  team.res.money -= money;
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

/** Fügt Schaden zu, setzt lastHitTime und markiert Tote. Stadthäuser: garrison.damageHouse, Brücken: river.damageBridge. Einheiten: erforschte Panzerung, Deckung an Ruinen (seit v5.66). */
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
  if (target.kind === 'unit') amount *= armorMul(game, target, amount) * smokeMul(game, target) * parkedArmor(game, target) * ruinCoverMul(game, target); // abgestellter Jet: Schutz des Stellplatzes (seit v5.35); Infanterie an einer Ruine: Deckung (seit v5.66)
  else if (target.kind === 'building') amount *= armorMul(game, target, amount); // Militärgebäude: Sandsäcke, Beton (Forschung)
  target.hp -= amount;
  target.lastHitTime = game.time;
  if (target.hp <= 0) {
    target.alive = false;
    game.bounty(target);
  }
  warnBase(game, target);
}

/**
 * Gemeinsame Zielsuche (Review Q-02): nächster sichtbarer Gegner im Umkreis R (ab minRange), dem `dmg` schadet; Besatzer zählen nicht,
 * Idle-Einheiten suchen nur innerhalb der Leine um ihren Ankerpunkt. Reihenfolge: Einheiten, vom Gegner besetzte Häuser, Gebäude (ohne
 * Mauern/Tore), zuletzt Gebäude der gegnerischen Stadt. prefer(e): bevorzugte Ziele schlagen jedes andere (sonst gilt die Entfernung);
 * die Suche endet, sobald das beste Ziel bevorzugt ist (ohne prefer: sobald eines da ist). unitsFirst: Einheiten schon vor den Häusern
 * als Ergebnis nehmen. buildings: false = keine Gebäude und keine Stadt.
 */
function searchTarget(game, hash, s, R, dmg, { minRange = 0, prefer = null, unitsFirst = false, buildings = true }) {
  const team = s.team;
  const leashed = s.kind === 'unit' && s.order.type === 'idle';
  let best = null;
  let bestScore = Infinity;
  const consider = (e) => {
    if (!e.alive || !isFoe(team, e) || e.house) return;
    if (!(dmgVs(dmg, e) > 0)) return; // z. B. Mörser und Panzer können keine Hubschrauber treffen, Soldaten keine Flugzeuge
    if (s.house && !houseCanFire(game, s, e)) return; // Besatzer sehen und zielen nur durch Fensterseiten (seit v5.67)
    if (leashed && Math.hypot(e.x - s.anchorX, e.y - s.anchorY) > Math.max(BALANCE.leash, R) + radiusOf(e)) return;
    const d = Math.hypot(e.x - s.x, e.y - s.y);
    if (d < minRange || d > R + radiusOf(e)) return;
    if (!game.sees(team, e)) return;
    const score = prefer && !prefer(e) ? d + 1e6 : d;
    if (score < bestScore) {
      best = e;
      bestScore = score;
    }
  };
  const done = () => best !== null && (!prefer || prefer(best));
  for (const e of nearby(hash, s.x, s.y, R + MAX_UNIT_RADIUS)) consider(e);
  if (unitsFirst && done()) return best;
  for (const h of game.garrisoned) consider(h);
  if (done() || !buildings) return best;
  for (const b of game.buildings) if (!b.def.blocksAll && !b.def.gate) consider(b);
  if (!best) forEnemyCity(game, team, s.x, s.y, R + 32, consider);
  return best;
}

/** Zielsuche für einen Schützen (Einheit oder Gebäude): Einheiten zuerst, dann besetzte Häuser, sonst Gebäude (searchTarget). */
function findTarget(game, hash, s, radius, minRange, allowBuildings, dmg) {
  return searchTarget(game, hash, s, radius, dmg, { minRange, unitsFirst: true, buildings: allowBuildings });
}

function fireDirect(game, s, t, w) {
  const dmg = shotDamage(w, s, t, heightMult(game, s, t)) * dealtMul(game, s, t); // Forschung (Stellungen)
  if ((w.damage.light || 0) >= 60) {
    // Panzerabwehr / Kampfpanzer: Geschoss plus kleine Explosion
    game.addEffect('shell', s.x, s.y, s.team, t.x, t.y, 'cannon');
    game.addEffect('explosion', t.x, t.y, s.team, t.x, t.y, 'hit');
  } else {
    game.addEffect('tracer', s.x, s.y, s.team, t.x, t.y, w.snd ?? 'base');
  }
  s.cooldown = w.cooldown * modOf(game, s, 'rof');
  hit(game, t, dmg);
}

/**
 * Trefferchance eines Flugabwehrschusses (BALANCE.airFire): Grundwert der Waffe, bei speedRef mal speedRef / (speedRef + Tempo des
 * Ziels), dazu weiter Abstand mit weniger Chance. Waffen ohne hitChance treffen immer (kein Wurf).
 */
export function unitHitChance(s, t, w) {
  let p = w.hitChance;
  if (w.speedRef) p *= w.speedRef / (w.speedRef + (t.speedNow || 0));
  return p * (1 - BALANCE.airFire.falloff * Math.min(1, Math.hypot(t.x - s.x, t.y - s.y) / w.range));
}

/**
 * Granate einer Artillerie-Einheit (Waffe mit shell, seit v5.19) auf den Punkt (tx, ty): streut zufällig um bis zu spread px
 * (Forschung acc verkleinert die Streuung), fliegt shellSpeed px/s und trifft mit Splash (impact).
 */
function fireUnitShell(game, u, w, tx, ty) {
  const r = (w.spec.spread ?? 0) / modOf(game, u, 'acc') * Math.sqrt(game.rng.next());
  const a = game.rng.next() * Math.PI * 2;
  const p = createShell(game.newId(), u.team, u.x, u.y, tx + Math.cos(a) * r, ty + Math.sin(a) * r, w.spec);
  p.mul = modOf(game, u, 'dmg');
  game.projectiles.push(p);
  game.addEffect('muzzle', u.x, u.y, u.team, tx, ty, 'mortar');
}

/** Waffe w der Einheit u feuert auf t (Vorrat, Abklingzeit, Effekt, Trefferwurf, Schaden). */
function fireWeapon(game, u, w, t) {
  w.rounds -= 1;
  w.cd = (auraCooldown(u, w.spec.cooldown) * modOf(game, u, 'rof')) / (u.house ? houseFire(game, u) : 1); // Kommandeur in der Nähe, MG-Nest im Haus: schneller
  game.teams[u.team].used.mun += w.spec.munCost;
  if (w.spec.shell) {
    fireUnitShell(game, u, w, t.x, t.y);
    return;
  }
  if ((w.spec.damage.light || 0) >= 60) {
    game.addEffect('shell', u.x, u.y, u.team, t.x, t.y, w.spec.id);
    game.addEffect('explosion', t.x, t.y, u.team, t.x, t.y, 'hit');
  } else {
    game.addEffect('tracer', u.x, u.y, u.team, t.x, t.y, w.spec.id);
  }
  if (u.def.stealth) u.revealedUntil = game.time + BALANCE.stealth.revealTime; // ein Schuss verrät die Stellung
  // Flak und SAM: Treffer nur mit Wurf (Trefferchance, siehe unitHitChance); daneben geht der Schuss, der Schaden bleibt aus
  if (w.spec.hitChance !== undefined && !(game.rng.next() < unitHitChance(u, t, w.spec) * modOf(game, u, 'acc') * modOf(game, t, 'evade'))) return; // Forschung: Zünder, Radar; Flares, Störsender des Ziels
  hit(game, t, shotDamage(w.spec, u, t, heightMult(game, u, t)) * dealtMul(game, u, t));
}

/** Reichweite der Waffe w von u gegen t (Forschung, Hauswand; Artillerie nicht unter minRange)? */
const weaponReaches = (game, u, w, t) =>
  inRange(u, t, w.spec.range * rangeMul(game, u) + reachBonus(game, u)) &&
  !(w.spec.minRange && Math.hypot(t.x - u.x, t.y - u.y) < w.spec.minRange) &&
  houseCanFire(game, u, t); // Besatzer schießen nur durch eine Fensterseite (seit v5.67)

/** Artillerie mit gewähltem Punkt (u.fireTarget, Befehl mortarTarget): feuert dorthin, solange Vorrat und Reichweite reichen. */
function unitFireAtGround(game, u) {
  const t = u.fireTarget;
  const d = Math.hypot(t.x - u.x, t.y - u.y);
  let dry = false;
  for (const w of u.weapons) {
    if (!w.spec.shell || w.cd > 0 || d > w.spec.range * rangeMul(game, u) || d < (w.spec.minRange ?? 0)) continue;
    if (w.rounds < 1) {
      dry = true;
      continue;
    }
    fireWeapon(game, u, w, t);
  }
  if (dry) game.shortage(u.team, 'mun');
}

/**
 * Einheit schießt auf t. Waffenwahl unter den schussbereiten Waffen in Reichweite, die dem Ziel schaden:
 * zuerst eine Waffe, die für die Panzerklasse des Ziels vorgesehen ist (targets), sonst die mit dem
 * besten Schaden je Munition. Ohne einen vollen Schuss: Mangelmeldung, keine Abklingzeit.
 */
function tryFireUnit(game, u, t) {
  let pick = null;
  let pickScore = -1;
  let dry = false;
  for (const w of u.weapons) {
    const dmg = dmgVs(w.spec.damage, t);
    if (!(dmg > 0) || !weaponReaches(game, u, w, t) || w.cd > 0) continue;
    if (w.rounds < 1) {
      dry = true;
      continue;
    }
    const score = (meant(w.spec, t) ? 1e6 : 0) + dmg / w.spec.munCost;
    if (score > pickScore) {
      pick = w;
      pickScore = score;
    }
  }
  if (!pick) {
    if (dry) game.shortage(u.team, 'mun');
    return;
  }
  fireWeapon(game, u, pick, t);
}

const bestClass = new WeakMap(); // Waffe (feste Daten) → Zielklasse mit dem höchsten Schaden; nicht in UNITS/BUILDINGS geschrieben

/** Bevorzugt die Waffe diese Zielklasse? Mit targets: diese Klassen; sonst die Klasse mit ihrem höchsten Schaden (MG: Infanterie). */
function prefers(spec, e) {
  if (spec.targets) return meant(spec, e);
  let best = bestClass.get(spec);
  if (best === undefined) bestClass.set(spec, (best = Object.entries(spec.damage).reduce((a, b) => (b[1] > a[1] ? b : a))[0]));
  return dmgKey(e) === best;
}

/**
 * Eigenes Ziel einer Waffe (parallel feuernde Einheiten, def.parallel): nächster sichtbarer Gegner in Reichweite, dem sie schadet,
 * zuerst einer der Klasse, die sie bevorzugt (prefers), sonst irgendeiner. null, wenn keiner.
 */
function weaponTarget(game, hash, u, w) {
  const R = w.spec.range * rangeMul(game, u) + reachBonus(game, u);
  return searchTarget(game, hash, u, R, w.spec.damage, { prefer: (e) => prefers(w.spec, e) });
}

/**
 * Parallel feuernde Einheit (def.parallel, seit v5.15: Kampf- und Schützenpanzer): jede Waffe schießt für sich, z. B. das MG auf
 * Soldaten und gleichzeitig die Hauptkanone auf ein Fahrzeug. t = Hauptziel (Befehl oder Zielsuche): eine Waffe, die dafür
 * vorgesehen ist, schießt darauf; die übrigen auf ihr eigenes Ziel (weaponTarget), sonst ebenfalls auf t.
 */
function fireParallel(game, u, t) {
  let dry = false;
  for (const w of u.weapons) {
    if (w.cd > 0) continue;
    const hits = (e) => !!e && e.alive !== false && dmgVs(w.spec.damage, e) > 0 && weaponReaches(game, u, w, e);
    const own = w.targetId != null ? resolveTarget(game, w.targetId) : null;
    const okT = hits(t); // Hauptziel: schon geprüft (Befehl: canAttack, z. B. auch Brücken; Zielsuche: isFoe)
    let aim = null;
    if (okT && prefers(w.spec, t)) aim = t;
    else if (isFoe(u.team, own) && hits(own)) aim = own;
    else if (okT) aim = t;
    if (!aim) continue;
    if (w.rounds < 1) {
      dry = true;
      continue;
    }
    fireWeapon(game, u, w, aim);
  }
  if (dry) game.shortage(u.team, 'mun');
}

function fireShell(game, s, tx, ty, w) {
  const p = createShell(game.newId(), s.team, s.x, s.y, tx, ty, w);
  p.mul = modOf(game, s, 'dmg'); // Forschung (Stellungen): stärkere Granaten
  game.projectiles.push(p);
  game.addEffect('muzzle', s.x, s.y, s.team, s.x, s.y, 'mortar');
  s.cooldown = w.cooldown * modOf(game, s, 'rof');
}

/**
 * Schießt auf t, wenn Abklingzeit abgelaufen und t in Reichweite (Mörser: Mindestreichweite und Sicht).
 * Ohne Munition wird nicht geschossen; die Abklingzeit läuft dann nicht an.
 */
function tryFire(game, s, t, w) {
  if (s.cooldown > 0) return;
  if (w.shell) {
    const d = Math.hypot(t.x - s.x, t.y - s.y);
    if (d < w.minRange || !inRange(s, t, w.range * rangeMul(game, s))) return;
    if (!game.isVisible(s.team, t.x, t.y)) return;
    if (!takeAmmo(game, s, w.ammoPerShot, w.moneyPerShot)) return;
    fireShell(game, s, t.x, t.y, w);
    return;
  }
  if (!inRange(s, t, w.range * rangeMul(game, s))) return; // Mörser-Feuerleitung, Bunkerbau (Forschung)
  if (!takeAmmo(game, s, w.ammoPerShot, w.moneyPerShot)) return;
  fireDirect(game, s, t, w);
}

/** Mörser mit gewähltem Ziel: schießt alle `cooldown` s dorthin, solange das Lager der FOB Munition hat. */
function fireAtGround(game, b, w) {
  if (b.cooldown > 0) return;
  const t = b.fireTarget;
  const d = Math.hypot(t.x - b.x, t.y - b.y);
  if (d < w.minRange || d > w.range * rangeMul(game, b)) return;
  if (!takeAmmo(game, b, w.ammoPerShot, w.moneyPerShot)) return;
  fireShell(game, b, t.x, t.y, w);
}

/** Flugabwehr und Phalanx: jede bereite fängt die nächste gegnerische Granate in Reichweite mit `chance` ab. */
function interceptShells(game) {
  for (const b of game.buildings) {
    if (!b.alive || !b.built || !b.def.aa || b.aaCooldown > 0 || (b.def.roofKind && !b.occupants.length && !autoTurret(game, b.team))) continue;
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
    if (!takeAmmo(game, b, b.def.aa.ammoPerShot, b.def.aa.moneyPerShot)) continue;
    b.aaCooldown = b.def.aa.cooldown;
    game.addEffect('tracer', b.x, b.y, b.team, best.x, best.y, b.def.weapon?.snd ?? 'flak'); // Feuerstoß zur Granate
    if (game.rng.next() < b.def.aa.chance * modOf(game, b, 'acc')) { // Abfangsystem (Forschung)
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
  const splash = (e) => {
    if (!e.alive || e.team === p.team || e.house) return; // seit v5.35 treffen Granaten auch abgestellte Jets (Schutz: parkedArmor)
    const d = Math.max(0, Math.hypot(e.x - p.tx, e.y - p.ty) - radiusOf(e));
    if (d >= R) return;
    const dmg = dmgVs(p.damage, e) * (1 - d / R) * (p.mul ?? 1);
    hit(game, e, dmg);
  };
  for (const list of [game.units, game.buildings]) for (const e of list) splash(e);
  forEnemyCity(game, p.team, p.tx, p.ty, R, splash); // Gebäude der gegnerischen Stadt
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
  const wx = weatherSight(game); // Regen, Nebel und Schnee verkürzen die Zielsuche (Forschung: Optik, Drohnen verlängern sie)

  for (const u of units) {
    if (!u.alive || !u.weapons.length || u.crate || u.parked || jetGrounded(u) || (u.heli && u.heli.phase !== 'air')) continue; // Kistenträger haben die Hände voll, Jets am Boden (Hangar, Rollen, Start, Ausrollen) schießen nicht
    const o = u.order.type;
    if (NO_FIRE.has(o)) continue;
    if (u.fireTarget && o !== 'attack') {
      unitFireAtGround(game, u); // Artillerie: Feuer auf den gewählten Punkt statt Zielsuche
      continue;
    }
    const par = u.def.parallel && u.weapons.length > 1;
    if (par && u.scanTimer <= 0) for (const w of u.weapons) w.targetId = weaponTarget(game, hash, u, w)?.id ?? null; // eigenes Ziel je Waffe
    if (o === 'attack') {
      if (par) u.scanTimer = u.scanTimer <= 0 ? SCAN : u.scanTimer;
      const t = resolveTarget(game, u.order.targetId);
      if (canAttack(u.team, t)) (par ? fireParallel : tryFireUnit)(game, u, t);
      continue;
    }
    // idle / attackMove: automatische Zielsuche
    if (u.scanTimer <= 0) {
      u.scanTimer = SCAN;
      const R = u.def.indirect ? u.def.range * rangeMul(game, u) : u.def.sight * wx * sightMul(game, u) + reachBonus(game, u); // Artillerie: so weit sie schießt (Sicht des Teams)
      const t = findTarget(game, hash, u, R, u.def.minRange || 0, true, u.def.damage);
      u.targetId = t ? t.id : null;
    }
    const t = u.targetId !== null ? resolveTarget(game, u.targetId) : null;
    if (par) fireParallel(game, u, isFoe(u.team, t) ? t : null);
    else if (isFoe(u.team, t)) tryFireUnit(game, u, t);
  }

  for (const b of buildings) {
    if (!b.alive || !b.built) continue;
    const w = weaponOf(b);
    if (!w || (b.def.roofKind && !b.occupants.length && !autoTurret(game, b.team))) continue; // Dachaufbau feuert nur mit Besatzung (oder Autonome Türme)
    if (w.shell && b.fireTarget) {
      fireAtGround(game, b, w); // gewähltes Ziel: kein automatisches Feuer
      continue;
    }
    if (b.scanTimer <= 0) {
      b.scanTimer = SCAN;
      const t = findTarget(game, hash, b, w.range * rangeMul(game, b), w.minRange, true, w.damage);
      b.targetId = t ? t.id : null;
    }
    if (b.targetId !== null) {
      const t = resolveTarget(game, b.targetId);
      if (isFoe(b.team, t)) tryFire(game, b, t, w);
    }
  }

  updateProjectiles(game, dt);
}
