// Gegenstände, Blockstöße, Feuerbälle und Effekte (PLAN §5, PRD §6). Kein DOM.
// Gegenstand/Feuerball/Effekt-Objekte: { type, x, y, w, h, vx, vy, face, anim, animTime, active,
//   state, timer, targetY, life, c, r }. Bumps: { active, c, r, timer }. Partikel: { active, x, y, w, h, vx, vy, life }.
import { PHYS } from '../data/physics.js';
import { TILES, TILE_BY_ID, USED_TILE } from '../data/tiles.js';
import { TUNE } from '../data/combat.js';
import { moveAndCollide } from './collide.js';
import { setPower } from './player.js';
import { acquire, rectHit, isLive, killEnemy, damageBoss } from './enemies.js';

const T = PHYS.tile;
const R = PHYS.rows;
const G = PHYS.gravity;
const MAXF = PHYS.maxFall;
const HARD_ID = TILES['H'].id;
const USED_ID = USED_TILE.id;
const COIN_ENTRY = { kind: 'coin', left: 1 };
const SIZE = { mushroom: [12, 12], flower: [12, 12], star: [12, 12], oneup: [12, 12], coinpop: [8, 12] };
const SPEED = { mushroom: TUNE.mushroomSpeed, oneup: TUNE.mushroomSpeed, star: TUNE.starSpeed, flower: 0 };

function setUsed(game, c, r) {
  game.map.set(c, r, USED_ID);
  game.markDirty(c, r);
  bumpBlock(game, c, r);
}

function bumpBlock(game, c, r) {
  const b = acquire(game.bumps);
  if (!b) return;
  b.active = true;
  b.c = c;
  b.r = r;
  b.timer = TUNE.bumpTime;
}

function breakBrick(game, c, r) {
  game.map.set(c, r, 0);
  game.markDirty(c, r);
  for (let i = 0; i < 4; i++) {
    const q = acquire(game.particles);
    if (!q) break;
    const col = i & 1, row = i >> 1;
    q.active = true;
    q.x = c * T + col * 8 + 2;
    q.y = r * T + row * 8 + 2;
    q.w = 4;
    q.h = 4;
    q.vx = col ? 60 : -60;
    q.vy = -180 - row * 40;
    q.life = TUNE.debrisLife;
  }
  game.emit('breakBlock');
}

// Münze spritzt aus dem Block hoch; zählt sofort.
function spawnCoinPop(game, c, r) {
  const it = acquire(game.items);
  if (it) {
    it.type = 'coinpop';
    it.w = SIZE.coinpop[0];
    it.h = SIZE.coinpop[1];
    it.x = c * T + (T - it.w) / 2;
    it.y = r * T - it.h;
    it.vx = 0;
    it.vy = 0;
    it.anim = 'coin';
    it.animTime = 0;
    it.state = 'pop';
    it.timer = TUNE.coinPopTime;
    it.active = true;
  }
  game.collectCoin();
}

// Gegenstand steigt aus dem Block. Pilz, Stern, 1-Up laufen danach, Blume bleibt stehen.
function spawnItem(game, type, c, r) {
  const it = acquire(game.items);
  if (!it) return null;
  it.type = type;
  it.w = SIZE[type][0];
  it.h = SIZE[type][1];
  it.x = c * T + (T - it.w) / 2;
  it.y = (r + 1) * T - it.h;
  it.targetY = r * T - it.h;
  it.face = 1;
  it.vx = 0;
  it.vy = 0;
  it.anim = type;
  it.animTime = 0;
  it.state = 'emerge';
  it.timer = 0;
  it.active = true;
  return it;
}

// Kopfstoß an einen Block (Kachel-Zelle c, r).
export function hitBlock(game, c, r) {
  const map = game.map;
  const info = TILE_BY_ID[map.get(c, r)];
  switch (info.kind) {
    case 'bonus': {
      const entry = game.blockContent.get(r * map.cols + c) || COIN_ENTRY;
      if (entry.kind === 'coins10') {
        spawnCoinPop(game, c, r);
        entry.left -= 1;
        if (entry.left <= 0) setUsed(game, c, r);
        else bumpBlock(game, c, r);
      } else if (entry.kind === 'coin') {
        spawnCoinPop(game, c, r);
        setUsed(game, c, r);
      } else {
        let kind = entry.kind;
        if (kind === 'mushroom' || kind === 'flower') {
          kind = game.player.power === 'small' ? 'mushroom' : 'flower';
        }
        spawnItem(game, kind, c, r);
        setUsed(game, c, r);
        game.emit('appear');
      }
      break;
    }
    case 'brick':
      if (game.player.power === 'small') {
        bumpBlock(game, c, r);
        game.emit('bump');
      } else {
        breakBrick(game, c, r);
      }
      break;
    case 'hard':
    case 'used':
      bumpBlock(game, c, r);
      game.emit('bump');
      break;
    default:
      break;
  }
}

function collect(game, it) {
  const p = game.player;
  if (it.type === 'mushroom') {
    if (p.power === 'small') setPower(p, 'big');
    game.addScore(TUNE.pointsPowerup);
    game.emit('powerup');
  } else if (it.type === 'flower') {
    if (p.power !== 'fire') setPower(p, 'fire');
    game.addScore(TUNE.pointsPowerup);
    game.emit('powerup');
  } else if (it.type === 'star') {
    p.star = PHYS.starTime;
    game.addScore(TUNE.pointsPowerup);
    game.emit('powerup');
  } else if (it.type === 'oneup') {
    game.gainLife();
  }
  game.emit('hudChange');
}

// Gegenstände bewegen sich, werden eingesammelt und verschwinden nach unten.
export function updateItems(game, dt) {
  const items = game.items;
  const map = game.map;
  const p = game.player;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.active) continue;
    if (it.type === 'coinpop') {
      it.y -= TUNE.coinPopRise * dt;
      it.timer -= dt;
      if (it.timer <= 0) it.active = false;
      continue;
    }
    if (it.state === 'emerge') {
      it.y -= TUNE.itemRise * dt;
      if (it.y <= it.targetY) {
        it.y = it.targetY;
        it.state = it.type === 'flower' ? 'still' : 'walk';
        it.vx = it.face * SPEED[it.type];
      }
    } else if (it.state === 'walk') {
      it.vy = Math.min(it.vy + G * dt, MAXF);
      const r = moveAndCollide(it, map, dt);
      if (r.hitWall !== 0) it.face = -r.hitWall;
      if (it.type === 'star' && r.onGround) it.vy = -TUNE.starHop;
      it.vx = it.face * SPEED[it.type];
    }
    it.animTime += dt;
    if (it.y > R * T) { it.active = false; continue; }
    if (it.state !== 'emerge' && !p.dead && rectHit(p.x, p.y, p.w, p.h, it.x, it.y, it.w, it.h)) {
      collect(game, it);
      it.active = false;
    }
  }
}

// Feuerball aus der Blume (max. PHYS.maxFireballs gleichzeitig).
export function spawnFireball(game) {
  const p = game.player;
  const f = acquire(game.fireballs);
  if (!f) return;
  f.type = 'fireball';
  f.w = 8;
  f.h = 8;
  f.face = p.face;
  f.x = p.face > 0 ? p.x + p.w : p.x - f.w;
  f.y = p.y + p.h / 2 - f.h / 2;
  f.vx = f.face * PHYS.fireballSpeed;
  f.vy = 0;
  f.anim = 'spin';
  f.animTime = 0;
  f.active = true;
  game.emit('fireball');
}

// Feuerbälle: hüpfen über den Boden, verschwinden an Wänden, treffen Gegner und Boss.
export function updateFireballs(game, dt) {
  const map = game.map;
  const fb = game.fireballs;
  for (let i = 0; i < fb.length; i++) {
    const f = fb[i];
    if (!f.active) continue;
    f.animTime += dt;
    f.vy = Math.min(f.vy + G * dt, MAXF);
    f.vx = f.face * PHYS.fireballSpeed;
    const r = moveAndCollide(f, map, dt);
    if (r.hitWall !== 0 || f.y > R * T) { f.active = false; continue; }
    if (r.onGround) f.vy = -PHYS.fireballBounce;

    const list = game.enemies;
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      if (!isLive(e) || e.type === 'lavaball') continue;
      if (rectHit(f.x, f.y, f.w, f.h, e.x, e.y, e.w, e.h)) {
        killEnemy(game, e, true);
        game.addScore(TUNE.pointsKill);
        game.emit('kick');
        f.active = false;
        break;
      }
    }
    if (!f.active) continue;
    const b = game.boss;
    if (b && b.active && b.state !== 'defeated' && rectHit(f.x, f.y, f.w, f.h, b.x, b.y, b.w, b.h)) {
      damageBoss(game, 'fire');
      f.active = false;
    }
  }
}

// Blockwackeln, Ziegelbruchstücke.
export function updateEffects(game, dt) {
  const bumps = game.bumps;
  for (let i = 0; i < bumps.length; i++) {
    const b = bumps[i];
    if (!b.active) continue;
    b.timer -= dt;
    if (b.timer <= 0) b.active = false;
  }
  const parts = game.particles;
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    if (!q.active) continue;
    q.life -= dt;
    if (q.life <= 0) { q.active = false; continue; }
    q.vy += G * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
}
