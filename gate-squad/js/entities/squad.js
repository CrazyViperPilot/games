// Truppe: Formation, Bewegung, Feuern, Granaten, Waffen- und Attachment-Upgrades.
// Alle Funktionen arbeiten auf `game` (kein Import von game.js, daher keine Zirkularität).
import { CFG } from '../config.js';
import { BAL } from '../data/balance.js';
import { WEAPONS, MAX_TIER, getWeapon } from '../data/weapons.js';
import { ATTACHMENTS, ATTACHMENT_IDS, computeStats } from '../data/attachments.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { emit, burst, floatText } from './particles.js';
import { SPECIALISTS } from '../data/specialists.js';
import { specMult } from '../data/balance.js';

const DEG = Math.PI / 180;
const ORANGE = CFG.COLORS.orange;
const BANNER_T = 1.6;
const MAX_SOLDIERS = BAL.MAX_SOLDIERS;
const MAX_SPECS = BAL.MAX_SPECS;

// Radius der Truppe (Kollisionsradius) abhängig von der sichtbaren Anzahl.
export function squadRadius(count) {
  return BAL.FORMATION_SPACING * 0.9 * Math.sqrt(Math.min(count, CFG.MAX_DRAWN_SOLDIERS)) + 7;
}

export function createSquad() {
  // Formation: Sonnenblumen-Anordnung (Slot i: Winkel i·2.39996, Radius ∝ sqrt(i)).
  const slots = [];
  for (let i = 0; i < CFG.MAX_DRAWN_SOLDIERS; i++) {
    const a = i * 2.39996;
    const r = BAL.FORMATION_SPACING * 0.9 * Math.sqrt(i);
    slots.push({ ox: Math.cos(a) * r, oy: Math.sin(a) * r });
  }
  return {
    x: 0,
    y: 0,
    count: 0,
    shownCount: 0,
    weaponTier: 0,
    weapon: WEAPONS[0],
    attachments: [],
    stats: null,
    radius: squadRadius(0),
    slots,
    specs: [],
    specMuzzle: new Float32Array(MAX_SPECS),
    specTimer: new Float32Array(MAX_SPECS),
    fireTimer: 0,
    shotIdx: 0,
    hasAim: false,
    aimX: 0,
    aimY: 0,
    soundTimer: 0,
    grenadeTimer: 0,
    muzzle: 0,
    hurt: 0,
    walk: 0,
  };
}

// Waffe und Stats aus Tier, Attachments und permanenten Upgrades neu berechnen.
export function recomputeStats(game) {
  const sq = game.squad;
  sq.weapon = getWeapon(sq.weaponTier);
  sq.stats = computeStats(sq.weapon, sq.attachments, game.save && game.save.upgrades);
}

// Bewegung, Animation, Feuern und Granaten. input.consumeDeltaX() liefert das Fingerdelta in Welt-Einheiten.
export function updateSquad(game, dt, input) {
  const sq = game.squad;
  sq.y = game.SQUAD_Y;
  sq.radius = squadRadius(sq.count);

  if (input) {
    const dx = input.consumeDeltaX();
    if (dx) sq.x += dx;
  }
  const lo = sq.radius;
  const hi = game.W - sq.radius;
  if (sq.x < lo) sq.x = lo;
  else if (sq.x > hi) sq.x = hi;

  sq.walk += dt * 8;
  const decay = Math.max(0, 1 - dt * 10);
  sq.muzzle *= decay;
  sq.hurt *= decay;
  const diff = sq.count - sq.shownCount;
  sq.shownCount = Math.abs(diff) < 0.05 ? sq.count : sq.shownCount + diff * Math.min(1, dt * 6);

  if (sq.count <= 0 || !sq.stats) return;
  const st = sq.stats;

  findAimTarget(game, sq, st);
  updateSpecialists(game, sq, dt);

  // Gestaffeltes Feuer der normalen Soldaten (Spezialisten belegen die ersten Slots und feuern separat).
  const nSpec = sq.specs.length;
  const regular = sq.count - nSpec;
  const shooters = Math.min(regular, CFG.MAX_SHOOTERS);
  const freeSlots = Math.max(1, CFG.MAX_DRAWN_SOLDIERS - nSpec);
  let n = 0;
  if (shooters > 0) {
    sq.fireTimer += dt * st.fireRate * shooters;
    while (sq.fireTimer >= 1 && n < shooters) {
      sq.fireTimer -= 1;
      n++;
      sq.shotIdx = (sq.shotIdx + 1) % shooters;
      fireBullet(game, sq, st, sq.slots[nSpec + (sq.shotIdx % freeSlots)], shooters, regular);
    }
  }
  if (sq.fireTimer >= 1) sq.fireTimer = 0;
  sq.soundTimer -= dt;
  if (n > 0 && sq.soundTimer <= 0) {
    sq.soundTimer = 1 / st.fireRate;
    audio.shot(sq.weapon.id);
    sq.muzzle = 1;
  }

  if (st.grenade) {
    sq.grenadeTimer += dt;
    if (sq.grenadeTimer >= BAL.GRENADE_INTERVAL) {
      sq.grenadeTimer -= BAL.GRENADE_INTERVAL;
      fireGrenade(game, sq, st);
    }
  }
}

// Ziele (einmal pro Tick, ein Durchlauf): Trupp = nächster Gegner im Zielkegel (Boss als Fallback);
// Spezialisten = nächster Gegner überhaupt, zähester Gegner, Anzahl naher Gegner (für C4).
const T = { near: null, nearD: 0, tough: null, toughHp: 0, closeN: 0, closeX: 0, closeY: 0 };

function findAimTarget(game, sq, st) {
  sq.hasAim = false;
  let best = st.range * 0.95;
  T.near = null;
  T.nearD = 1e9;
  T.tough = null;
  T.toughHp = 0;
  T.closeN = 0;
  T.closeX = 0;
  T.closeY = 0;
  const demoR = SPECIALISTS.demo.triggerRange;
  const toughR = SPECIALISTS.sniper.range;
  const items = game.enemies.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    if (!e.active) continue;
    const dy = sq.y - e.y;
    if (dy <= -10 || e.y < 0) continue;
    const dx = e.x - sq.x;
    const d2 = dx * dx + dy * dy;
    if (d2 < T.nearD) {
      T.nearD = d2;
      T.near = e;
    }
    if (e.maxHp > T.toughHp && d2 < toughR * toughR) {
      T.toughHp = e.maxHp;
      T.tough = e;
    }
    if (d2 < demoR * demoR) {
      T.closeN++;
      T.closeX += e.x;
      T.closeY += e.y;
    }
    if (dy <= 10) continue;
    if (Math.abs(dx) > dy * 0.55 + sq.radius) continue;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) {
      best = d;
      sq.aimX = e.x;
      sq.aimY = e.y;
      sq.hasAim = true;
    }
  }
  const boss = game.boss;
  if (!sq.hasAim && boss && !boss.entering && sq.y - boss.y - boss.h / 2 < st.range) {
    sq.aimX = Math.max(boss.x - boss.w * 0.35, Math.min(boss.x + boss.w * 0.35, sq.x));
    sq.aimY = boss.y;
    sq.hasAim = true;
  }
}

// Ein Schuss eines Schützen gerade nach oben mit Streuung. Schaden skaliert mit count/shooters.
function fireBullet(game, sq, st, slot, shooters, regular) {
  const w = sq.weapon;
  const spread = st.spread * DEG;
  const b = game.bullets.get();
  b.x = sq.x + slot.ox;
  b.y = sq.y - 12 + slot.oy * 0.25;
  // Automatisches Zielen innerhalb des Kegels BAL.AIM_CONE, sonst gerade nach oben.
  let a = (Math.random() * 2 - 1) * spread;
  if (sq.hasAim) {
    let aim = Math.atan2(sq.aimX - b.x, b.y - sq.aimY);
    if (aim > BAL.AIM_CONE) aim = BAL.AIM_CONE;
    else if (aim < -BAL.AIM_CONE) aim = -BAL.AIM_CONE;
    a += aim;
  }
  b.vx = Math.sin(a) * st.bulletSpeed;
  b.vy = -Math.cos(a) * st.bulletSpeed;
  b.dmg = st.damage * Math.pow(regular / shooters, BAL.FIREPOWER_EXP);
  b.life = st.range / st.bulletSpeed;
  b.pierce = st.pierce;
  b.len = w.bulletLen;
  b.width = w.bulletWidth;
  b.color = w.color;
  b.hitId = 0;
  b.gateRow = -1;

  // Mündungsfeuer am Schützen, gelegentlich eine Hülse (Partikel-Budget wird in emit geprüft).
  if (Math.random() < 0.12) emit(game, 'flash', b.x, b.y - 2, { size: 6 });
  if (Math.random() < 0.2) {
    emit(game, 'casing', b.x, sq.y - 10, {
      vx: 40 + Math.random() * 40,
      vy: -60 - Math.random() * 40,
      life: 0.5,
    });
  }
}

// Granate (UGL): Ziel = nächster Gegner oder Boss oberhalb des Squads in Reichweite, sonst gerade nach oben.
function fireGrenade(game, sq, st) {
  let tx = sq.x;
  let ty = sq.y - 260;
  let best = st.range;

  const items = game.enemies.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    if (!e.active) continue;
    const dy = sq.y - e.y;
    if (dy <= 0) continue;
    const dx = e.x - sq.x;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) {
      best = d;
      tx = e.x;
      ty = e.y;
    }
  }
  const boss = game.boss;
  if (boss && !boss.entering) {
    const dy = sq.y - boss.y;
    if (dy > 0) {
      const dx = boss.x - sq.x;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) {
        best = d;
        tx = boss.x;
        ty = boss.y;
      }
    }
  }

  const g = game.grenades.get();
  g.kind = 'gl';
  g.landed = false;
  g.fuse = 0;
  g.x0 = sq.x;
  g.y0 = sq.y - 12;
  g.x = g.x0;
  g.y = g.y0;
  g.tx = tx;
  g.ty = ty;
  g.t = 0;
  g.dur = 0.7;
  g.dmg = BAL.GRENADE_BASE + BAL.GRENADE_DMG_FACTOR * st.damage * Math.max(1, Math.sqrt(sq.count / 4));
  g.radius = BAL.GRENADE_RADIUS;
}

// ---------- Spezialisten ----------

function specDamage(game, def) {
  const up = game.save && game.save.upgrades ? game.save.upgrades.damage || 0 : 0;
  return def.damage * specMult(game.levelNum) * (1 + 0.08 * up);
}

function updateSpecialists(game, sq, dt) {
  const specs = sq.specs;
  const boss = game.boss;
  const bossReady = boss && !boss.entering;
  T.nearD = Math.sqrt(T.nearD);
  for (let i = 0; i < specs.length; i++) {
    sq.specMuzzle[i] *= Math.max(0, 1 - dt * 12);
    const def = SPECIALISTS[specs[i]];
    if (!def) continue;
    const slot = sq.slots[i];
    const x = sq.x + slot.ox;
    const y = sq.y - 12 + slot.oy * 0.25;
    sq.specTimer[i] += dt;

    if (def.id === 'rpg') {
      if (bossReady && sq.specTimer[i] >= def.cooldown) {
        sq.specTimer[i] = (game.rng() * 0.4);
        fireRocket(game, x, y, boss);
        sq.specMuzzle[i] = 1;
      }
      continue;
    }

    if (def.id === 'demo') {
      if (sq.specTimer[i] >= def.cooldown && T.near &&
          (T.closeN >= def.triggerCount || T.nearD < def.closeRange)) {
        sq.specTimer[i] = 0;
        const tx = T.closeN >= def.triggerCount ? T.closeX / T.closeN : T.near.x;
        const ty = T.closeN >= def.triggerCount ? T.closeY / T.closeN : T.near.y;
        throwC4(game, x, y, tx, ty, specDamage(game, def), def);
        sq.specMuzzle[i] = 1;
      }
      continue;
    }

    // Schützen: Ziel nach Typ wählen, Feuerrate über Timer.
    let tx = 0;
    let ty = 0;
    let has = false;
    if (def.aim === 'tough' && T.tough) {
      tx = T.tough.x;
      ty = T.tough.y;
      has = true;
    } else if (T.near && T.nearD < def.range) {
      tx = T.near.x;
      ty = T.near.y;
      has = true;
    }
    if (!has && bossReady && sq.y - boss.y - boss.h / 2 < def.range) {
      tx = boss.x;
      ty = boss.y;
      has = true;
    }
    const interval = 1 / def.fireRate;
    if (!has) {
      if (sq.specTimer[i] > interval) sq.specTimer[i] = interval;
      continue;
    }
    let shots = 0;
    while (sq.specTimer[i] >= interval && shots < 3) {
      sq.specTimer[i] -= interval;
      shots++;
      fireSpecBullet(game, def, x, y, tx, ty, specDamage(game, def));
    }
    if (shots) sq.specMuzzle[i] = 1;
  }
}

function fireSpecBullet(game, def, x, y, tx, ty, dmg) {
  const a = Math.atan2(tx - x, y - ty) + (Math.random() * 2 - 1) * def.spread * DEG;
  const b = game.bullets.get();
  b.x = x;
  b.y = y;
  b.vx = Math.sin(a) * def.bulletSpeed;
  b.vy = -Math.cos(a) * def.bulletSpeed;
  b.dmg = dmg;
  b.life = def.range / def.bulletSpeed;
  b.pierce = def.pierce;
  b.len = def.bulletLen;
  b.width = def.bulletWidth;
  b.color = def.bulletColor;
  b.hitId = 0;
  b.gateRow = -1;
  if (def.id === 'sniper') audio.shot('m82');
}

function throwC4(game, x, y, tx, ty, dmg, def) {
  const g = game.grenades.get();
  g.kind = 'c4';
  g.x0 = x;
  g.y0 = y;
  g.x = x;
  g.y = y;
  g.tx = tx;
  g.ty = ty;
  g.t = 0;
  g.dur = def.flight;
  g.dmg = dmg;
  g.radius = def.radius;
  g.landed = false;
  g.fuse = def.fuse;
  g.vx = 0;
  g.vy = 0;
}

function fireRocket(game, x, y, boss) {
  const g = game.grenades.get();
  const dx = boss.x - x;
  const dy = boss.y - y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const sp = SPECIALISTS.rpg.rocketSpeed;
  g.kind = 'rocket';
  g.x0 = x;
  g.y0 = y;
  g.x = x;
  g.y = y;
  g.tx = boss.x;
  g.ty = boss.y;
  g.t = 0;
  g.dur = 4;
  g.dmg = 0;
  g.radius = 30;
  g.landed = false;
  g.fuse = 0;
  // leicht seitlich gestreuter Start, damit die Raketen fächern
  g.vx = (dx / d) * sp + (game.rng() * 2 - 1) * 120;
  g.vy = (dy / d) * sp;
  burst(game, 'smoke', x, y + 6, 3, { speed: 40, life: 0.5, size: 6 });
  audio.explosion(0.5);
}

// Spezialist-Kiste: neuer Soldat mit Spezialisierung (+1).
export function addSpecialist(game, id) {
  const sq = game.squad;
  const def = SPECIALISTS[id];
  if (!def) return;
  if (sq.specs.length < MAX_SPECS) sq.specs.push(id);
  addSoldiers(game, 1);
  game.banner = { text: def.name, t: BANNER_T, color: def.color };
  floatText(game, sq.x, sq.y - 40, '+' + def.short, def.color);
  audio.upgrade();
  haptics.tap();
}

// RPG-Kiste: immer +1 – ein normaler Soldat wird zum reinen RPG-Schützen (fehlt einer, kommt einer dazu).
export function addRpg(game) {
  const sq = game.squad;
  if (sq.specs.length >= MAX_SPECS) return;
  if (sq.count - sq.specs.length <= 0) addSoldiers(game, 1);
  sq.specs.push('rpg');
  const n = countSpec(sq, 'rpg');
  game.banner = { text: 'RPG ' + n, t: BANNER_T, color: SPECIALISTS.rpg.color };
  floatText(game, sq.x, sq.y - 40, 'RPG +1', SPECIALISTS.rpg.color);
  audio.crate();
  haptics.tap();
}

export function countSpec(sq, id) {
  let n = 0;
  for (let i = 0; i < sq.specs.length; i++) if (sq.specs[i] === id) n++;
  return n;
}

function addSoldiers(game, n) {
  const sq = game.squad;
  sq.count = Math.min(MAX_SOLDIERS, sq.count + n);
}

// Waffen-Upgrade (Waffentor oder Tor-Belohnung). Behält die letzten Attachments.
// Bei Max-Tier stattdessen +5 Soldaten.
export function upgradeWeapon(game) {
  const sq = game.squad;
  if (sq.weaponTier >= MAX_TIER) {
    addSoldiers(game, 5);
    floatText(game, sq.x, sq.y - 40, '+5', CFG.COLORS.good);
    audio.upgrade();
    haptics.bump();
    return;
  }
  sq.weaponTier += 1;
  sq.attachments = sq.attachments.slice(-BAL.KEEP_ATTACHMENTS_ON_UPGRADE);
  recomputeStats(game);
  game.banner = { text: sq.weapon.name, t: BANNER_T, color: ORANGE };
  audio.upgrade();
  haptics.bump();
}

// Zufälliges, noch nicht ausgerüstetes Attachment. Sind alle da: +3 Soldaten.
export function addAttachment(game) {
  const sq = game.squad;
  const free = [];
  for (let i = 0; i < ATTACHMENT_IDS.length; i++) {
    const id = ATTACHMENT_IDS[i];
    if (!sq.attachments.includes(id)) free.push(id);
  }
  if (free.length === 0) {
    addSoldiers(game, BAL.FULL_ATTACH_BONUS_SOLDIERS);
    floatText(game, sq.x, sq.y - 40, '+' + BAL.FULL_ATTACH_BONUS_SOLDIERS, CFG.COLORS.good);
    audio.crate();
    haptics.tap();
    return;
  }
  const id = free[Math.floor(game.rng() * free.length)];
  const att = ATTACHMENTS[id];
  sq.attachments.push(id);
  recomputeStats(game);
  game.banner = { text: att.name, t: BANNER_T, color: att.color };
  floatText(game, sq.x, sq.y - 40, att.name, att.color);
  audio.crate();
  haptics.tap();
}
