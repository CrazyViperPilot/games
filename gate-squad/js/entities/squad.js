// Truppe: Formation, Bewegung, Feuern, Granaten, Waffen- und Attachment-Upgrades.
// Alle Funktionen arbeiten auf `game` (kein Import von game.js, daher keine Zirkularität).
import { CFG } from '../config.js';
import { BAL } from '../data/balance.js';
import { WEAPONS, MAX_TIER, getWeapon } from '../data/weapons.js';
import { ATTACHMENTS, ATTACHMENT_IDS, computeStats } from '../data/attachments.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { emit, floatText } from './particles.js';

const DEG = Math.PI / 180;
const ORANGE = CFG.COLORS.orange;
const BANNER_T = 1.6;
const MAX_SOLDIERS = BAL.MAX_SOLDIERS;

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

  // Gestaffeltes Feuer: jeder Schütze feuert mit stats.fireRate, aber zeitversetzt (kontinuierlicher Strom).
  const shooters = Math.min(sq.count, CFG.MAX_SHOOTERS);
  sq.fireTimer += dt * st.fireRate * shooters;
  let n = 0;
  while (sq.fireTimer >= 1 && n < shooters) {
    sq.fireTimer -= 1;
    n++;
    sq.shotIdx = (sq.shotIdx + 1) % shooters;
    fireBullet(game, sq, st, sq.slots[sq.shotIdx], shooters);
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

// Nächster Gegner oberhalb im Zielkegel und in Reichweite (einmal pro Tick). Boss als Fallback.
function findAimTarget(game, sq, st) {
  sq.hasAim = false;
  let best = st.range * 0.95;
  const items = game.enemies.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    if (!e.active) continue;
    const dy = sq.y - e.y;
    if (dy <= 10) continue;
    const dx = e.x - sq.x;
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
function fireBullet(game, sq, st, slot, shooters) {
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
  b.dmg = st.damage * Math.pow(sq.count / shooters, BAL.FIREPOWER_EXP);
  b.life = st.range / st.bulletSpeed;
  b.pierce = st.pierce;
  b.len = w.bulletLen;
  b.width = w.bulletWidth;
  b.color = w.color;
  b.hitId = 0;
  b.gateRow = -1;

  // Mündungsfeuer am Schützen, gelegentlich eine Hülse (Partikel-Budget wird in emit geprüft).
  if (Math.random() < 0.5) emit(game, 'flash', b.x, b.y - 2);
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
