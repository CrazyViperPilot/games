// Gegenstände, Truhen, fallender Sand und Partikel (PLAN §6, PRD §4, §6). Kein DOM, keine Allokation im Update:
// alle Objekte kommen aus Pools, die beim ersten Zugriff am game-Objekt angelegt werden.
//   game.pickups   (16)  { active, kind, x, y, w, h, vx, vy, life, onGround }   x,y = Mitte-Unterkante
//   game.particles (96)  { active, kind, x, y, vx, vy, life, tile, frame }      kind 'debris' | 'smoke'
//   game.falling   (8)   { active, tile, c, x, y, vy }                          x,y = Oberkante links (px)
import { PHYS } from '../data/physics.js';
import { TILE_BY_ID, TILE_IDS } from '../data/tiles.js';
import { moveAndCollide } from './collide.js';

const T = PHYS.tile;
const E = 1e-6;
const G = PHYS.gravity;
const MAXF = PHYS.maxFall;
const AIR = TILE_IDS.air;
const CHESTOPEN = TILE_IDS.chestopen;

const PICKUP_POOL = 16;
const PARTICLE_POOL = 96;
const FALLING_POOL = 8;
const PICKUP_LIFE = 30;          // s, außer Diamanten
const PICKUP_HOP = -160;         // px/s, kleiner Hüpfer beim Spawn
const PICKUP_FRICTION = 12;      // 1/s, Abbremsen auf dem Boden
const HOP_VX = [30, -30, 15, -15, 22, -22];   // deterministisch über einen Zähler
const CHEST_EMERALDS = 3;
const DEBRIS_LIFE = 0.6;
const SMOKE_LIFE = 0.5;
const SMOKE_FRAMES = 4;
const HURT_VY = 150;             // px/s, schneller fallender Sand verletzt beim Aufprall

const KINDS = new Set([
  'emerald', 'diamond', 'armor', 'bow', 'apple', 'cake', 'pick_stone', 'pick_iron', 'pick_diamond',
]);
// Würfel-Muster: [x-Versatz, y-Versatz, vx, vy] in px (6 Stück je Block).
const DEBRIS_PATTERN = [
  [2, 2, -60, -150], [10, 3, 55, -170], [4, 9, -40, -110],
  [12, 10, 70, -90], [7, 5, 10, -200], [9, 13, -20, -60],
];
// Rauch-Muster: [x-Versatz, y-Versatz, vx]; alle steigen mit SMOKE_VY.
const SMOKE_PATTERN = [[-4, 0, -8], [0, -3, 8], [4, -1, 0]];
const SMOKE_VY = -20;

// Gemeinsamer Körper für moveAndCollide (wird nicht gespeichert).
const BODY = { x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0 };

function newPickup() {
  return { active: false, kind: '', x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, life: 0, onGround: false };
}
function newParticle() {
  return { active: false, kind: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, tile: 0, frame: 0 };
}
function newFalling() {
  return { active: false, tile: 0, c: 0, x: 0, y: 0, vy: 0 };
}

function makePool(n, make) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(make());
  return out;
}

// Pools lazy am game anlegen (einmal).
function initPools(game) {
  if (game.pickups) return;
  game.pickups = makePool(PICKUP_POOL, newPickup);
  game.particles = makePool(PARTICLE_POOL, newParticle);
  game.falling = makePool(FALLING_POOL, newFalling);
}

function findFree(list) {
  for (let i = 0; i < list.length; i++) {
    if (!list[i].active) return list[i];
  }
  return null;
}

// Feste Kachel oder Plattform (von oben) – für fallenden Sand.
function solidOrOneWay(id) {
  const t = TILE_BY_ID[id];
  return t.solid || t.oneWay;
}

function solidAt(map, x, y) {
  return TILE_BY_ID[map.get(Math.floor(x / T), Math.floor(y / T))].solid;
}

// ---------- Gegenstände ----------

// Gegenstand an (x, y) = Mitte-Unterkante erzeugen. Gibt das Objekt zurück oder null (unbekannt / Pool voll).
export function spawnPickup(game, kind, x, y) {
  initPools(game);
  if (!KINDS.has(kind)) return null;
  const it = findFree(game.pickups);
  if (!it) return null;
  const seq = (game.itemSeq = (game.itemSeq | 0) + 1);
  it.active = true;
  it.kind = kind;
  it.w = kind === 'emerald' ? 10 : 12;
  it.h = 12;
  it.x = x;
  it.y = y;
  it.vx = HOP_VX[seq % HOP_VX.length];
  it.vy = PICKUP_HOP;
  it.life = kind === 'diamond' ? Infinity : PICKUP_LIFE;
  it.onGround = false;
  return it;
}

function overlapsPlayer(p, it) {
  const l = it.x - it.w / 2;
  const t = it.y - it.h;
  return p.x < l + it.w && p.x + p.w > l && p.y < it.y && p.y + p.h > t;
}

function collectPickup(game, it) {
  it.active = false;
  switch (it.kind) {
    case 'emerald':
      game.addEmeralds(1);
      game.emit('emerald');
      break;
    case 'diamond':
      game.collectDiamondAt?.(it.x, it.y);   // Event 'diamond' kommt von Game.collectDiamond
      break;
    case 'armor':
      game.givePower('armor');
      game.emit('powerup');
      break;
    case 'bow':
      game.givePower('bow');
      game.emit('powerup');
      break;
    case 'apple':
      game.player.star = PHYS.starTime;
      game.emit('powerup');
      break;
    case 'cake':
      game.gainLife();
      break;
    case 'pick_stone':
      game.givePick(1);
      game.emit('powerup');
      break;
    case 'pick_iron':
      game.givePick(2);
      game.emit('powerup');
      break;
    case 'pick_diamond':
      game.givePick(3);
      game.emit('powerup');
      break;
  }
}

// Physik (Schwerkraft, Kollision, Reibung am Boden), Timeout, Einsammeln.
export function updatePickups(game, dt) {
  initPools(game);
  const list = game.pickups;
  const map = game.map;
  const p = game.player;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (!it.active) continue;
    it.life -= dt;
    if (it.life <= 0) {
      it.active = false;
      continue;
    }
    BODY.x = it.x - it.w / 2;
    BODY.y = it.y - it.h;
    BODY.w = it.w;
    BODY.h = it.h;
    BODY.vx = it.vx;
    BODY.vy = Math.min(it.vy + G * dt, MAXF);
    const res = moveAndCollide(BODY, map, dt);
    it.x = BODY.x + it.w / 2;
    it.y = BODY.y + it.h;
    it.vx = BODY.vx;
    it.vy = BODY.vy;
    it.onGround = res.onGround;
    if (it.onGround) it.vx -= it.vx * Math.min(1, PICKUP_FRICTION * dt);
    if (p && !p.dead && overlapsPlayer(p, it)) collectPickup(game, it);
  }
}

// Truhe öffnen: Kachel wird chestopen, Inhalt erscheint über ihr. Gibt false zurück, wenn es keine Truhe ist.
export function openChest(game, c, r) {
  const map = game.map;
  if (TILE_BY_ID[map.get(c, r)].kind !== 'chest') return false;
  initPools(game);
  map.set(c, r, CHESTOPEN);
  game.markDirty(c, r);
  const content = (map.chests || {})[c + ',' + r];
  const x = (c + 0.5) * T;
  const y = r * T;
  if (content && content !== 'emeralds' && KINDS.has(content)) {
    spawnPickup(game, content, x, y);
  } else {
    for (let i = 0; i < CHEST_EMERALDS; i++) spawnPickup(game, 'emerald', x, y);
  }
  game.emit('chest');
  return true;
}

// ---------- Fallender Sand ----------

// Sand bei (c, r) aus der Karte nehmen und fallen lassen. Die Sandkacheln darüber folgen rekursiv.
// Gibt false zurück, wenn die Kachel kein Sand ist oder kein Platz im Pool ist.
export function startFalling(game, c, r) {
  initPools(game);
  const map = game.map;
  const id = map.get(c, r);
  if (!TILE_BY_ID[id].falls) return false;
  const f = findFree(game.falling);
  if (!f) return false;
  map.set(c, r, AIR);
  game.markDirty(c, r);
  game.lightDirty = true;
  f.active = true;
  f.tile = id;
  f.c = c;
  f.x = c * T;
  f.y = r * T;
  f.vy = 0;
  startFalling(game, c, r - 1);
  return true;
}

// Ein Block bricht beim Aufprall: als Würfel-Effekt, ohne Landung.
function shatter(game, f) {
  f.active = false;
  spawnDebris(game, f.c, Math.round(f.y / T), f.tile);
}

function stepFalling(game, f, dt) {
  const map = game.map;
  const p = game.player;
  const oldBottom = f.y + T;
  f.vy = Math.min(f.vy + G * dt, MAXF);
  const ny = f.y + f.vy * dt;
  const newBottom = ny + T;

  // Erste feste Zeile, deren Oberkante in diesem Schritt überschritten wird.
  let landRow = -1;
  const kLo = Math.ceil(oldBottom / T - E);
  const kHi = Math.ceil(newBottom / T - E) - 1;
  for (let k = kLo; k <= kHi; k++) {
    if (solidOrOneWay(map.get(f.c, k))) {
      landRow = k - 1;
      break;
    }
  }
  const y = landRow >= 0 ? landRow * T : ny;

  // Aufprall auf den Spieler (Rechtecktest).
  if (p && !p.dead) {
    const bx = f.c * T;
    if (p.x < bx + T && p.x + p.w > bx && p.y < y + T && p.y + p.h > y) {
      if (f.vy > HURT_VY) game.hurtPlayer('sand');
      shatter(game, f);
      return;
    }
  }

  if (landRow >= 0) {
    map.set(f.c, landRow, f.tile);
    game.markDirty(f.c, landRow);
    game.lightDirty = true;
    f.active = false;
    return;
  }
  f.y = ny;
  // Unter der Karte verloren.
  if (f.y > (map.rows + 2) * T) f.active = false;
}

export function updateFalling(game, dt) {
  initPools(game);
  const list = game.falling;
  for (let i = 0; i < list.length; i++) {
    if (list[i].active) stepFalling(game, list[i], dt);
  }
}

// ---------- Partikel ----------

// Block-Bröckchen (6 Würfel) an Zelle (c, r).
export function spawnDebris(game, c, r, tileId) {
  initPools(game);
  for (let i = 0; i < DEBRIS_PATTERN.length; i++) {
    const q = findFree(game.particles);
    if (!q) break;
    const d = DEBRIS_PATTERN[i];
    q.active = true;
    q.kind = 'debris';
    q.x = c * T + d[0];
    q.y = r * T + d[1];
    q.vx = d[2];
    q.vy = d[3];
    q.life = DEBRIS_LIFE;
    q.tile = tileId;
    q.frame = 0;
  }
}

// Rauchwolke (3 Partikel) bei (x, y).
export function spawnSmoke(game, x, y) {
  initPools(game);
  for (let i = 0; i < SMOKE_PATTERN.length; i++) {
    const q = findFree(game.particles);
    if (!q) break;
    const s = SMOKE_PATTERN[i];
    q.active = true;
    q.kind = 'smoke';
    q.x = x + s[0];
    q.y = y + s[1];
    q.vx = s[2];
    q.vy = SMOKE_VY;
    q.life = SMOKE_LIFE;
    q.tile = 0;
    q.frame = 0;
  }
}

export function updateParticles(game, dt) {
  initPools(game);
  const list = game.particles;
  const map = game.map;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (!q.active) continue;
    q.life -= dt;
    if (q.life <= 0) {
      q.active = false;
      continue;
    }
    if (q.kind === 'smoke') {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      const age = SMOKE_LIFE - q.life;
      q.frame = Math.min(SMOKE_FRAMES - 1, Math.floor(age * SMOKE_FRAMES / SMOKE_LIFE));
    } else {
      q.vy = Math.min(q.vy + G * dt, MAXF);
      const nx = q.x + q.vx * dt;
      if (solidAt(map, nx, q.y)) q.vx = 0;
      else q.x = nx;
      const ny = q.y + q.vy * dt;
      if (solidAt(map, q.x, ny)) q.vy = 0;
      else q.y = ny;
    }
  }
}
