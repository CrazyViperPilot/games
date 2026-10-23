// Gegner, Bosse und Boss-Geschosse (PLAN §5, PRD §3, §5). Kein DOM.
// Gegner:  { type, x, y, w, h, vx, vy, face, anim, animTime, active, done, ox, oy,
//            state: 'walk'|'shell'|'kicked'|'dead', flip, timer, safe, hopTimer, onGround, hidden }
//          x, y = linke obere Ecke; ox, oy = Startposition; hidden = Lavaball in seiner Quelle.
// Boss:    { type: 'boss', kind, x, y, w, h, vx, vy, face, anim, animTime, active, ox, oy,
//            state: 'walk'|'jump'|'dizzy'|'defeated', timer, hp, fireHp, invuln, jumpTimer,
//            rockTimer, fireTimer, rockN, onGround, airborne }
// Geschoss: { type: 'rock'|'flame', x, y, w, h, vx, vy, face, anim, animTime, active, life }
import { PHYS } from '../data/physics.js';
import { ENEMIES, BOSSES } from '../data/enemies.js';
import { TUNE } from '../data/combat.js';
import { TILE_BY_ID } from '../data/tiles.js';
import { moveAndCollide } from './collide.js';

const T = PHYS.tile;
const G = PHYS.gravity;
const MAXF = PHYS.maxFall;

// Erster inaktiver Eintrag eines festen Pools oder null.
export function acquire(pool) {
  for (let i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i];
  return null;
}

// Achsenparalleles Rechteck-Überlappen.
export function rectHit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Gegner, der gerade spielt und treffbar ist.
export function isLive(e) {
  return e.active && !e.done && e.state !== 'dead' && !e.hidden;
}

export function createEnemy(type, sx, sy) {
  const d = ENEMIES[type];
  const x = sx - d.w / 2, y = sy - d.h;
  return {
    type, x, y, w: d.w, h: d.h, ox: x, oy: y, vx: 0, vy: 0, face: -1,
    anim: 'walk', animTime: 0, active: false, done: false,
    state: 'walk', flip: false, timer: d.every || 0, safe: 0, hopTimer: d.hopEvery || 0,
    onGround: false, hidden: type === 'lavaball',
  };
}

export function createBoss(kind, sx, sy) {
  const d = BOSSES[kind];
  const x = sx - d.w / 2, y = sy - d.h;
  return {
    type: 'boss', kind, x, y, w: d.w, h: d.h, ox: x, oy: y, vx: 0, vy: 0, face: -1,
    anim: 'walk', animTime: 0, active: false,
    state: 'walk', timer: 0, hp: d.hp, fireHp: d.fireHp || 0, invuln: 0,
    jumpTimer: kind === 'golem' ? TUNE.golemJumpEvery : (d.jumpEvery || 0),
    rockTimer: d.rockEvery || 0, fireTimer: d.fireEvery || 0, rockN: 0,
    onGround: false, airborne: false,
  };
}

function setAnim(e, name, dt) {
  if (e.anim !== name) { e.anim = name; e.animTime = 0; } else e.animTime += dt;
}

// Liegt vor dem Körper (in Blickrichtung, unten) kein Boden mehr?
function ledgeAhead(map, e) {
  const x = e.face > 0 ? e.x + e.w + 1 : e.x - 1;
  const info = TILE_BY_ID[map.get(Math.floor(x / T), Math.floor((e.y + e.h + 1) / T))];
  return !(info.solid || info.oneWay);
}

// Gegner abschießen: flip = fällt nach oben weg, sonst platt liegen.
export function killEnemy(game, e, flip) {
  if (e.type === 'lavaball') return;
  e.state = 'dead';
  e.vx = 0;
  e.flip = flip;
  if (flip) { e.vy = TUNE.flipVy; e.timer = TUNE.deadFlipTime; e.anim = 'flip'; }
  else { e.vy = 0; e.timer = TUNE.squashTime; e.anim = 'squash'; }
  e.animTime = 0;
}

function knock(game, e) {
  if (e.type === 'lavaball') return;
  killEnemy(game, e, true);
  game.addScore(TUNE.pointsKill);
  game.emit('kick');
}

function stompPoints(game) {
  const pts = TUNE.pointsStomp[Math.min(game.chain, TUNE.pointsStomp.length - 1)];
  game.chain++;
  return pts;
}

// Spieler fällt und war vorher mit der Unterkante über der Mitte des Ziels.
function isStomp(p, t, prevFeet) {
  return p.vy > 0 && prevFeet <= t.y + t.h / 2;
}

// Abprall nach dem Stampfen; Spieler sitzt danach auf dem Ziel (kein Überlappen mehr).
function stompBounce(game, t) {
  const p = game.player;
  p.y = t.y - p.h;
  p.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
  p.onGround = false;
  p.jumping = false;
}

// ---- Gegner-Bewegung ----

function walkStep(game, e, dt) {
  const d = ENEMIES[e.type];
  const map = game.map;
  const speed = e.state === 'kicked' ? PHYS.shellSpeed : d.speed;
  if (e.safe > 0) e.safe = Math.max(0, e.safe - dt);
  e.vy = Math.min(e.vy + G * dt, MAXF);
  e.vx = e.state === 'shell' ? 0 : e.face * speed;
  const r = moveAndCollide(e, map, dt);
  e.onGround = r.onGround;
  if (r.hitWall !== 0) e.face = -r.hitWall;
  else if (d.turnAtEdge && r.onGround && ledgeAhead(map, e)) e.face = -e.face;
  e.vx = e.state === 'shell' ? 0 : e.face * speed;
  setAnim(e, e.state === 'shell' ? 'shell' : e.state === 'kicked' ? 'kicked' : e.onGround ? 'walk' : 'fall', dt);
}

function hopStep(game, e, dt) {
  const d = ENEMIES.hopper;
  const map = game.map;
  const p = game.player;
  if (e.onGround) {
    e.hopTimer -= dt;
    if (e.hopTimer <= 0) {
      e.hopTimer = d.hopEvery;
      const pc = p.x + p.w / 2, ec = e.x + e.w / 2;
      if (pc !== ec) e.face = pc > ec ? 1 : -1;
      e.vy = -d.hopSpeed;
      e.onGround = false;
    }
  }
  e.vx = e.onGround ? 0 : e.face * d.speed * 2;
  e.vy = Math.min(e.vy + G * dt, MAXF);
  const r = moveAndCollide(e, map, dt);
  e.onGround = r.onGround;
  if (r.hitWall !== 0) e.face = -r.hitWall;
  setAnim(e, e.onGround ? 'walk' : 'hop', dt);
}

// Lavaball: springt aus seiner Quelle (e.oy = Ruheposition), verschwindet darin bis zum nächsten Sprung.
function lavaStep(e, dt) {
  const d = ENEMIES.lavaball;
  if (e.hidden) {
    e.timer -= dt;
    if (e.timer <= 0) { e.hidden = false; e.vy = -d.jumpSpeed; }
    return;
  }
  e.vy += G * dt;
  e.y += e.vy * dt;
  if (e.vy > 0 && e.y >= e.oy) {
    e.y = e.oy;
    e.vy = 0;
    e.hidden = true;
    e.timer = d.every;
  }
  setAnim(e, 'jump', dt);
}

function deadStep(e, dt) {
  e.timer -= dt;
  if (e.flip) {
    e.vy = Math.min(e.vy + G * dt, MAXF);
    e.y += e.vy * dt;
  }
  if (e.timer <= 0 || e.y > PHYS.rows * T + 32) { e.active = false; e.done = true; }
}

// Gehen zwei laufende Gegner aufeinander zu, drehen sie um.
function turnFrom(a, b) {
  if (a.state !== 'walk' || a.type === 'hopper') return;
  if ((a.face > 0 && b.x > a.x) || (a.face < 0 && b.x < a.x)) a.face = -a.face;
}

// Berührung eines Gegners mit dem Spieler.
function contact(game, e, prevFeet) {
  const p = game.player;
  if (e.type === 'lavaball') { game.hurtPlayer('lava'); return; }
  if (p.star > 0) {
    killEnemy(game, e, true);
    game.addScore(TUNE.pointsKill);
    game.emit('stomp');
    return;
  }
  const stomp = isStomp(p, e, prevFeet);
  if (e.state === 'shell') {
    if (stomp) { stompBounce(game, e); game.emit('stomp'); return; }
    e.state = 'kicked';
    e.face = p.x + p.w / 2 < e.x + e.w / 2 ? 1 : -1;
    e.vx = e.face * PHYS.shellSpeed;
    e.safe = TUNE.shellKickSafe;
    game.emit('kick');
    return;
  }
  if (e.state === 'kicked') {
    if (stomp) {
      e.state = 'shell';
      e.vx = 0;
      stompBounce(game, e);
      game.addScore(stompPoints(game));
      game.emit('stomp');
      return;
    }
    if (e.safe <= 0) game.hurtPlayer('shell');
    return;
  }
  if (stomp && ENEMIES[e.type].stompable) {
    if (e.type === 'beetle') { e.state = 'shell'; e.vx = 0; e.anim = 'shell'; }
    else killEnemy(game, e, false);
    stompBounce(game, e);
    game.addScore(stompPoints(game));
    game.emit('stomp');
    return;
  }
  game.hurtPlayer(e.type);
}

// Aktiviert, bewegt und prüft alle Gegner (ein Schritt).
export function updateEnemies(game, dt, prevFeet) {
  const list = game.enemies;
  const lim = game.camX + game.viewW + 32;
  const far = game.camX - 2 * game.viewW;
  const bottom = PHYS.rows * T + 32;

  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.done) continue;
    if (!e.active) {
      if (e.ox >= lim) continue;
      e.active = true;
      e.x = e.ox;
      e.y = e.oy;
    }
    if (e.x + e.w < far) { e.active = false; e.done = true; continue; }
    if (e.state === 'dead') { deadStep(e, dt); continue; }
    if (e.type === 'lavaball') lavaStep(e, dt);
    else if (e.type === 'hopper') hopStep(game, e, dt);
    else walkStep(game, e, dt);
    if (e.y > bottom) { e.active = false; e.done = true; }
  }

  // Gegner untereinander.
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!isLive(a) || a.type === 'lavaball') continue;
    for (let j = i + 1; j < list.length; j++) {
      if (!isLive(a)) break;
      const b = list[j];
      if (!isLive(b) || b.type === 'lavaball') continue;
      if (!rectHit(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)) continue;
      if (a.state === 'kicked' || b.state === 'kicked') {
        if (a.state === 'kicked' && b.state !== 'kicked') knock(game, b);
        else if (b.state === 'kicked' && a.state !== 'kicked') knock(game, a);
        continue;
      }
      turnFrom(a, b);
      turnFrom(b, a);
    }
  }

  // Berührung mit dem Spieler.
  const p = game.player;
  for (let i = 0; i < list.length; i++) {
    if (game.state !== 'play') return;
    const e = list[i];
    if (!isLive(e)) continue;
    if (!rectHit(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) continue;
    contact(game, e, prevFeet);
  }
}

// Gegner auf einem gestoßenen Block (Oberkante = Blockoberkante) werden besiegt.
export function killEnemiesOn(game, c, r) {
  const top = r * T, x0 = c * T, x1 = x0 + T;
  const list = game.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!isLive(e) || e.type === 'lavaball' || !e.onGround) continue;
    if (Math.abs(e.y + e.h - top) > 1.5) continue;
    if (e.x + e.w <= x0 || e.x >= x1) continue;
    knock(game, e);
  }
}

// ---- Bosse ----

// Ein Treffer auf den Boss (how: 'stomp' | 'star' | 'fire').
export function damageBoss(game, how) {
  const b = game.boss;
  if (!b || !b.active || b.state === 'defeated' || b.invuln > 0) return;
  b.invuln = TUNE.stompInvuln;
  if (how === 'fire' && b.kind === 'dragon') b.fireHp -= 1;
  else b.hp -= 1;
  game.emit(how === 'stomp' ? 'stomp' : 'kick');
  if (b.hp <= 0 || (b.kind === 'dragon' && b.fireHp <= 0)) {
    b.state = 'defeated';
    b.timer = TUNE.bossDefeatTime;
    b.vx = 0;
    b.vy = TUNE.bossFallVy;
    game.defeatBoss();
  }
}

function bossContact(game, b, prevFeet) {
  const p = game.player;
  if (b.state === 'defeated' || !rectHit(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) return;
  if (p.star > 0) { damageBoss(game, 'star'); return; }
  const stompable = b.kind !== 'golem' || b.state === 'dizzy';
  if (stompable && isStomp(p, b, prevFeet)) {
    stompBounce(game, b);
    damageBoss(game, 'stomp');
    return;
  }
  game.hurtPlayer('boss');
}

function spawnFlame(game, b) {
  const s = acquire(game.shots);
  if (!s) return;
  s.type = 'flame';
  s.w = TUNE.flameW;
  s.h = TUNE.flameH;
  s.x = b.face > 0 ? b.x + b.w : b.x - s.w;
  s.y = b.y + 10;
  s.face = b.face;
  s.vx = b.face * TUNE.flameSpeed;
  s.vy = 0;
  s.life = TUNE.flameLife;
  s.anim = 'flame';
  s.animTime = 0;
  s.active = true;
}

function spawnRock(game, b) {
  const s = acquire(game.shots);
  if (!s) return;
  const p = game.player;
  const off = TUNE.rockOffsets[b.rockN % TUNE.rockOffsets.length];
  b.rockN++;
  s.type = 'rock';
  s.w = TUNE.rockSize;
  s.h = TUNE.rockSize;
  s.x = p.x + p.w / 2 - s.w / 2 + off;
  s.y = Math.max(0, p.y - 96);
  s.face = 1;
  s.vx = 0;
  s.vy = 0;
  s.life = TUNE.rockTime;
  s.anim = 'rock';
  s.animTime = 0;
  s.active = true;
}

// Boss-Zustandsautomat (ein Schritt). Aktiviert wie Gegner, sobald er nah genug ist.
export function updateBoss(game, dt, prevFeet) {
  const b = game.boss;
  if (!b) return;
  if (!b.active) {
    if (b.ox < game.camX + game.viewW + 32) b.active = true;
    return;
  }
  const map = game.map;
  if (b.state === 'defeated') {
    b.timer -= dt;
    b.vy = Math.min(b.vy + G * dt, MAXF);
    b.y += b.vy * dt;
    if (b.timer <= 0) b.active = false;
    return;
  }
  const d = BOSSES[b.kind];
  if (b.invuln > 0) b.invuln = Math.max(0, b.invuln - dt);

  if (b.kind === 'dragon') {
    // Fliegt auf seiner Höhe hin und her, speit alle fireEvery ein Feuer in Blickrichtung.
    b.vx = b.face * d.speed;
    b.vy = 0;
    const r = moveAndCollide(b, map, dt);
    if (r.hitWall !== 0) b.face = -r.hitWall;
    b.vx = b.face * d.speed;
    b.fireTimer -= dt;
    if (b.fireTimer <= 0) { b.fireTimer = d.fireEvery; spawnFlame(game, b); }
    setAnim(b, 'fly', dt);
  } else {
    if (b.kind === 'golem' && b.state === 'dizzy') {
      b.vx = 0;
      b.timer -= dt;
      if (b.timer <= 0) b.state = 'walk';
    } else {
      b.vx = b.face * d.speed;
      b.jumpTimer -= dt;
      if (b.onGround && b.jumpTimer <= 0) {
        b.vy = -(b.kind === 'golem' ? TUNE.golemJump : TUNE.rootJump);
        b.jumpTimer = b.kind === 'golem' ? TUNE.golemJumpEvery : d.jumpEvery;
        b.onGround = false;
        b.airborne = true;
      }
    }
    b.vy = Math.min(b.vy + G * dt, MAXF);
    const r = moveAndCollide(b, map, dt);
    b.onGround = r.onGround;
    if (b.kind === 'golem' && b.airborne && r.onGround) {
      b.airborne = false;
      b.state = 'dizzy';
      b.timer = d.dizzy;
    }
    if (r.hitWall !== 0) b.face = -r.hitWall;
    else if (b.onGround && ledgeAhead(map, b)) b.face = -b.face;
    if (b.kind === 'golem') {
      b.rockTimer -= dt;
      if (b.rockTimer <= 0) { b.rockTimer = d.rockEvery; spawnRock(game, b); }
    }
    setAnim(b, b.state === 'dizzy' ? 'dizzy' : b.onGround ? 'walk' : 'jump', dt);
  }
  bossContact(game, b, prevFeet);
}

// ---- Geschosse (Felsen, Drachenfeuer) ----

export function updateShots(game, dt) {
  const map = game.map;
  const p = game.player;
  const bottom = PHYS.rows * T;
  for (let i = 0; i < game.shots.length; i++) {
    const s = game.shots[i];
    if (!s.active) continue;
    s.animTime += dt;
    if (s.type === 'rock') {
      s.vy = Math.min(s.vy + G * dt, MAXF);
      const r = moveAndCollide(s, map, dt);
      if (r.onGround) s.life -= dt;
    } else {
      s.vx = s.face * TUNE.flameSpeed;
      s.vy = 0;
      const r = moveAndCollide(s, map, dt);
      if (r.hitWall !== 0) { s.active = false; continue; }
      s.life -= dt;
    }
    if (s.life <= 0 || s.y > bottom) { s.active = false; continue; }
    if (rectHit(p.x, p.y, p.w, p.h, s.x, s.y, s.w, s.h)) {
      s.active = false;
      game.hurtPlayer(s.type);
      if (game.state !== 'play') return;
    }
  }
}
