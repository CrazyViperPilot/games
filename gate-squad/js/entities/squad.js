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
const MAX_SOLDIERS = 999;

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

  const interval = 1 / st.fireRate;
  sq.fireTimer += dt;
  let guard = 0;
  while (sq.fireTimer >= interval && guard < 3) {
    sq.fireTimer -= interval;
    guard++;
    fireVolley(game, sq, st);
  }
  if (sq.fireTimer >= interval) sq.fireTimer = 0;

  if (st.grenade) {
    sq.grenadeTimer += dt;
    if (sq.grenadeTimer >= BAL.GRENADE_INTERVAL) {
      sq.grenadeTimer -= BAL.GRENADE_INTERVAL;
      fireGrenade(game, sq, st);
    }
  }
}

// Eine Salve: jeder Schütze (max. CFG.MAX_SHOOTERS) feuert eine Kugel gerade nach oben mit Streuung.
function fireVolley(game, sq, st) {
  const w = sq.weapon;
  const shooters = Math.min(sq.count, CFG.MAX_SHOOTERS);
  const dmg = (st.damage * sq.count) / shooters;
  const spread = st.spread * DEG;
  const life = st.range / st.bulletSpeed;

  for (let i = 0; i < shooters; i++) {
    const slot = sq.slots[i];
    const a = (Math.random() * 2 - 1) * spread;
    const b = game.bullets.get();
    b.x = sq.x + slot.ox;
    b.y = sq.y - 12 + slot.oy * 0.25;
    b.vx = Math.sin(a) * st.bulletSpeed;
    b.vy = -Math.cos(a) * st.bulletSpeed;
    b.dmg = dmg;
    b.life = life;
    b.pierce = st.pierce;
    b.len = w.bulletLen;
    b.width = w.bulletWidth;
    b.color = w.color;
    b.hitId = 0;
  }

  audio.shot(w.id);
  sq.muzzle = 1;

  // Mündungsfeuer an zwei Schützen, gelegentlich eine Hülse (Partikel-Budget wird in emit geprüft).
  for (let k = 0; k < 2; k++) {
    const slot = sq.slots[Math.floor(Math.random() * shooters)];
    emit(game, 'flash', sq.x + slot.ox, sq.y - 14 + slot.oy * 0.25);
  }
  if (Math.random() < 0.5) {
    const slot = sq.slots[Math.floor(Math.random() * shooters)];
    emit(game, 'casing', sq.x + slot.ox, sq.y - 10, {
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
  g.dmg = BAL.GRENADE_BASE + BAL.GRENADE_DMG_FACTOR * st.damage * Math.max(1, sq.count / 10);
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
