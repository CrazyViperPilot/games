// Bosse (PLAN §6, §9; PRD §2, §5). Kein DOM. createBoss(kind, x, y): x, y = Fußmitte des Spawns '@'.
// Gemeinsame Felder: { kind, x, y, w, h, vx, vy, face, anim, animTime, active, state, hp, invuln, parts, onGround,
//   update(game, dt, prevFeet), damage(game, how) }. update/damage rufen updateBoss/damageBoss auf.
// state: 'idle' (Arena noch nicht betreten) → 'fight' (active = true) → 'defeated' (active = false, danach nichts mehr).
// Riesenschleim (slimeking): parts = Teile { size 'l'|'m', anim 'boss_slime_l'|'boss_slime_m', x, y, w, h, vx, vy,
//   onGround, state 'live', hopT, invuln, animTime, gone }. Der Boss-Körper (x, y, w, h, vx, vy, onGround, anim)
//   ist eine Kopie des größten lebenden Teils; hp = Anzahl Teile (Anzeige).
// Treffer: Stampfen (fallend, Füße über der Teil-Mitte) und Pfeil/Explosion teilen ein Teil. Schleime aus einem
// mittleren Teil sind Mobs mit m.fromBoss = true; der Boss ist besiegt, wenn keine Teile und keine solchen Mobs leben.
import { PHYS } from '../data/physics.js';
import { BOSSES } from '../data/mobs.js';
import { moveAndCollide } from './collide.js';

const T = PHYS.tile;
const ARENA_LEAD = 20 * T;      // px: ab so weit links vom Boss (x des Körpers) ist die Arena aktiv
const SPLIT_INVULN = 0.5;       // s Unverwundbarkeit eines neu entstandenen Teils
const HIT_SCORE = 500;
const DEFEAT_SCORE = 5000;
const SLIME_SPAWN_DX = 8;       // px: die zwei Schleime aus einem mittleren Teil liegen ± 8 px um die Mitte
const SLIME_PART_DX = 12;       // px: Mitten der zwei mittleren Teile aus einem großen Teil ± 12 px
const SPLIT_VX = 60;            // px/s: Abstoß der mittleren Teile nach dem Teilen
const SPLIT_VY = -250;
const OFF_LEVEL = 64;           // px unter dem Level: ein Teil fällt aus der Welt und zählt als verloren

const SLIME_DATA = BOSSES.slimeking;
const SLIME = {
  l: { size: SLIME_DATA.w, hopEvery: SLIME_DATA.hopEvery, hopVy: SLIME_DATA.hopVy, hopVx: 70 },
  m: { size: SLIME_DATA.split.w, hopEvery: 1.2, hopVy: -320, hopVx: 90 },
};

// ---------- Aufbau ----------

// Boss an der Fußmitte (x, y) erzeugen. Unbekannter Typ ist ein Fehler.
export function createBoss(kind, x, y) {
  if (!Object.hasOwn(KINDS, kind)) throw new Error(`Unbekannter oder noch nicht implementierter Boss: ${kind}`);
  return KINDS[kind](x, y);
}

const KINDS = { slimeking: makeSlimeKing };

function newBoss(kind, x, y, w, h) {
  const b = {
    kind, x, y, w, h, vx: 0, vy: 0, face: -1, anim: '', animTime: 0,
    active: false, state: 'idle', hp: 0, invuln: 0, parts: [], onGround: false,
    update: (game, dt, prevFeet) => stepBoss(game, b, dt, prevFeet),
    damage: (game, how) => hitBoss(game, b, how),
  };
  return b;
}

// Teil an der Fußmitte (footX, footY) mit Startgeschwindigkeit.
function makePart(size, footX, footY, vx, vy) {
  const s = SLIME[size];
  const w = s.size;
  return {
    size, anim: size === 'l' ? 'boss_slime_l' : 'boss_slime_m',
    x: footX - w / 2, y: footY - w, w, h: w, vx, vy,
    onGround: false, state: 'live', hopT: s.hopEvery, invuln: 0, animTime: 0, gone: false,
  };
}

function pushPart(b, size, footX, footY, vx, vy) {
  const part = makePart(size, footX, footY, vx, vy);
  part.invuln = SPLIT_INVULN;
  b.parts.push(part);
}

function makeSlimeKing(x, y) {
  const w = SLIME_DATA.w, h = SLIME_DATA.h;
  const b = newBoss('slimeking', x - w / 2, y - h, w, h);
  b.parts.push(makePart('l', x, y, 0, 0));
  syncBody(b);
  return b;
}

// ---------- Schritt und Schaden (auch über game.boss) ----------

// Schritt für game.boss (PLAN §6). Ohne Boss passiert nichts.
export function updateBoss(game, dt, prevFeet) {
  if (game.boss) stepBoss(game, game.boss, dt, prevFeet);
}

// Pfeil oder Explosion für game.boss (PLAN §6). how: 'arrow' | 'explosion'.
export function damageBoss(game, how) {
  if (game.boss) hitBoss(game, game.boss, how);
}

function stepBoss(game, b, dt, prevFeet) {
  if (b.state === 'defeated') return;
  if (b.state === 'idle') {
    if (game.player.x < b.x - ARENA_LEAD) return;
    b.state = 'fight';
    b.active = true;
    game.lockArena?.();
    game.emit('bossStart');
  }

  const parts = b.parts;
  for (let i = 0; i < parts.length; i++) movePart(game, parts[i], dt);
  touchParts(game, b, prevFeet);
  compactParts(b);
  syncBody(b);
  checkDefeat(game, b);
}

function hitBoss(game, b, how) {
  if (b.state !== 'fight') return;
  const target = largestPart(b.parts);
  if (!target || target.invuln > 0) return;
  splitPart(game, b, target);
  compactParts(b);
  syncBody(b);
  checkDefeat(game, b);
}

// ---------- Teile ----------

// Ein Teil: Schwerkraft, Sprung zum Spieler alle hopEvery s (nur am Boden), Kollision mit der Karte.
function movePart(game, part, dt) {
  const map = game.map;
  const s = SLIME[part.size];
  part.invuln = Math.max(0, part.invuln - dt);
  part.animTime += dt;
  part.hopT -= dt;
  part.vy = Math.min(part.vy + PHYS.gravity * dt, PHYS.maxFall);
  if (part.onGround) {
    if (part.hopT <= 0) {
      const p = game.player;
      const dir = p.x + p.w / 2 >= part.x + part.w / 2 ? 1 : -1;
      part.vx = dir * s.hopVx;
      part.vy = s.hopVy;
      part.hopT = s.hopEvery;
    } else {
      part.vx = 0;
    }
  }
  const res = moveAndCollide(part, map, dt);
  part.onGround = res.onGround;
  if (part.y > map.rows * T + OFF_LEVEL) part.gone = true;
}

function overlapsPlayer(part, p) {
  return part.x < p.x + p.w && part.x + part.w > p.x && part.y < p.y + p.h && part.y + part.h > p.y;
}

// Kontakt Spieler–Teile: Stampfen teilt (mit Abprall), Stern teilt, sonst seitlich Schaden.
// prevFeet = Fußposition des Spielers vor dem Schritt. Neu entstandene Teile werden erst im nächsten Schritt geprüft.
function touchParts(game, b, prevFeet) {
  const p = game.player;
  const parts = b.parts;
  const n = parts.length;
  for (let i = 0; i < n; i++) {
    const part = parts[i];
    if (part.gone || !overlapsPlayer(part, p)) continue;
    if (p.vy > 0 && prevFeet <= part.y + part.h * 0.5) {
      if (part.invuln <= 0) splitPart(game, b, part);
      p.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
      continue;
    }
    if (p.star > 0) {
      if (part.invuln <= 0) splitPart(game, b, part);
      continue;
    }
    if (p.invuln <= 0) game.hurtPlayer('boss');
  }
}

// Teil trifft: großes → 2 mittlere (Abstoß nach links/rechts); mittleres → 2 Schleim-Mobs (fromBoss).
// Das getroffene Teil wird als gone markiert und erst von compactParts entfernt.
function splitPart(game, b, part) {
  part.gone = true;
  const cx = part.x + part.w / 2;
  const foot = part.y + part.h;
  if (part.size === 'l') {
    pushPart(b, 'm', cx - SLIME_PART_DX, foot, -SPLIT_VX, SPLIT_VY);
    pushPart(b, 'm', cx + SLIME_PART_DX, foot, SPLIT_VX, SPLIT_VY);
  } else {
    for (let k = -1; k <= 1; k += 2) {
      const m = game.spawnMob('slimeSmall', cx + k * SLIME_SPAWN_DX, foot);
      if (m) m.fromBoss = true;
    }
  }
  game.addScore(HIT_SCORE);
  game.emit('bossHit', { size: part.size });
}

function compactParts(b) {
  const parts = b.parts;
  let n = 0;
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].gone) parts[n++] = parts[i];
  }
  parts.length = n;
}

// Größtes lebendes Teil (bei Gleichstand das erste).
function largestPart(parts) {
  let best = null;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.gone && (best === null || p.w > best.w)) best = p;
  }
  return best;
}

// Boss-Körper = größtes Teil; hp = Anzahl Teile (Anzeige).
function syncBody(b) {
  b.hp = b.parts.length;
  const big = largestPart(b.parts);
  if (!big) return;
  b.x = big.x;
  b.y = big.y;
  b.w = big.w;
  b.h = big.h;
  b.vx = big.vx;
  b.vy = big.vy;
  b.onGround = big.onGround;
  if (big.vx !== 0) b.face = big.vx < 0 ? -1 : 1;
  b.anim = big.anim;
  b.animTime = big.animTime;
}

// Besiegt: keine Teile mehr und kein lebender Schleim aus dem Boss.
function checkDefeat(game, b) {
  if (b.parts.length > 0) return;
  const mobs = game.mobs || [];
  for (let i = 0; i < mobs.length; i++) {
    if (mobs[i].fromBoss && !mobs[i].dead) return;
  }
  b.state = 'defeated';
  b.active = false;
  b.hp = 0;
  game.addScore(DEFEAT_SCORE);
  game.emit('bossHit', { defeated: true });
  game.defeatBoss();
}
