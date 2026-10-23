// Mobs (PLAN §6, PRD §5). Kein DOM. Gerüst mit Zombie; weitere Typen kommen als `case` in moveMobType dazu.
// createMob erwartet die Fußmitte (wie parseLevel-Spawns); gespeichert wird die linke obere Ecke.
// Lebende Zombies nutzen m.timer als Wende-Cooldown nach einem Wandtreffer.
// Tote Mobs fallen kopfüber ohne Kollision und werden nach DEAD_TIME entfernt.
import { PHYS } from '../data/physics.js';
import { MOBS } from '../data/mobs.js';
import { TILE_BY_ID } from '../data/tiles.js';
import { moveAndCollide } from './collide.js';

const T = PHYS.tile;
const E = 1e-6;
const ACTIVATE_MARGIN = 64;   // px um den Bildschirm, ab dem ein Mob aktiv wird
const DEACT_X_SCREENS = 3;    // Bildschirmbreiten horizontal bis zur Deaktivierung
const DEACT_Y_SCREENS = 2;    // Bildschirmhöhen vertikal bis zur Deaktivierung
const DEAD_TIME = 1.2;        // s bis ein toter Mob entfernt wird
const DEAD_VY = -200;         // px/s Startsprung beim Tod (kopfüber)
const KILL_SCORE = 100;
const AGGRO_RANGE = 10 * T;   // px: ab hier dreht der Zombie nicht mehr zum Spieler
const TURN_COOLDOWN = 0.5;    // s nach Wandtreffer, in denen der Zombie nicht zum Spieler dreht

// Mob an der Fußmitte (x, y) erzeugen.
export function createMob(type, x, y) {
  const d = MOBS[type];
  if (!d) throw new Error(`Unbekannter Mob-Typ: ${type}`);
  return {
    type, x: x - d.w / 2, y: y - d.h, w: d.w, h: d.h,
    vx: 0, vy: 0, face: -1, anim: 'walk', animTime: 0,
    active: false, dead: false, state: 'walk', timer: 0,
    hp: d.hp, onGround: false, flip: false, fuse: 0, shootT: 0, spawned: false,
  };
}

// Achsenparalleler Rechtecktest (Berührung an der Kante zählt nicht).
export function rectHit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Entfernt mobs[i] per swap-pop (Reihenfolge egal, kein filter).
function removeAt(mobs, i) {
  const last = mobs.pop();
  if (i < mobs.length) mobs[i] = last;
}

// Aktivierung: in Sichtweite (+ Rand) aktiv; aktiv bleibt, bis weit genug weg.
function updateActivity(game, m) {
  const M = ACTIVATE_MARGIN;
  if (!m.active) {
    if (m.x >= game.camX - M && m.x <= game.camX + game.viewW + M &&
        m.y >= game.camY - M && m.y <= game.camY + game.viewH + M) {
      m.active = true;
    }
  } else if (Math.abs(m.x - game.camX) > DEACT_X_SCREENS * game.viewW ||
             Math.abs(m.y - game.camY) > DEACT_Y_SCREENS * game.viewH) {
    m.active = false;
  }
}

// Zombie: läuft auf den Spieler zu, dreht an Wänden, fällt von Kanten.
function moveZombie(game, m, dt) {
  const p = game.player;
  if (m.timer > 0) {
    m.timer = Math.max(0, m.timer - dt);
  } else {
    const dxp = (p.x + p.w / 2) - (m.x + m.w / 2);
    if (dxp !== 0 && Math.abs(dxp) < AGGRO_RANGE) m.face = dxp > 0 ? 1 : -1;
  }
  m.vx = m.face * MOBS[m.type].speed;
  m.vy = Math.min(m.vy + PHYS.gravity * dt, PHYS.maxFall);
  const res = moveAndCollide(m, game.map, dt);
  m.onGround = res.onGround;
  if (res.hitWall !== 0) {
    m.face = -res.hitWall;
    m.timer = TURN_COOLDOWN;
  }
  m.animTime += dt;
}

// Bewegung je Typ. Neue Typen als eigener case; default läuft wie zombie.
function moveMobType(game, m, dt) {
  switch (m.type) {
    case 'zombie':
      moveZombie(game, m, dt);
      break;
    default:
      moveZombie(game, m, dt);
      break;
  }
}

// Tote Mobs: nur Schwerkraft, keine Kollision, Ablauf über m.timer.
function updateDead(game, m, dt) {
  m.vx = 0;
  m.vy = Math.min(m.vy + PHYS.gravity * dt, PHYS.maxFall);
  m.y += m.vy * dt;
  m.timer -= dt;
}

// Ist die Kachel an den Füßen (untere Hitbox-Kante, Mittelspalte) ein Hazard?
function hazardAtFeet(map, m) {
  const c = Math.floor((m.x + m.w / 2) / T);
  const r = Math.floor((m.y + m.h - E) / T);
  return TILE_BY_ID[map.get(c, r)].hazard;
}

// Kontakt mit dem Spieler: Stampfen, Seitenkontakt (Schaden, Stern, Invulnerabilität).
// prevFeet = Fußposition des Spielers vor dem Schritt.
function touchPlayer(game, m, prevFeet) {
  const p = game.player;
  if (!rectHit(m.x, m.y, m.w, m.h, p.x, p.y, p.w, p.h)) return;
  const stompable = MOBS[m.type].stompable !== false;
  if (stompable && p.vy > 0 && prevFeet <= m.y + m.h * 0.5) {
    hitMob(game, m, 'stomp');
    p.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
    return;
  }
  if (p.star > 0) {
    killMob(game, m, 'star');
    return;
  }
  if (p.invuln <= 0) game.hurtPlayer('mob');
}

// Alle Mobs eines Schritts. game.mobs = Array, entfernte Mobs per swap-pop (rückwärts iteriert).
export function updateMobs(game, dt, prevFeet) {
  const mobs = game.mobs;
  const fallLimit = game.map.rows * T + 64;
  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i];
    if (m.dead) {
      updateDead(game, m, dt);
      if (m.timer <= 0) removeAt(mobs, i);
      continue;
    }
    updateActivity(game, m);
    if (!m.active) continue;

    moveMobType(game, m, dt);
    if (m.y > fallLimit) {
      removeAt(mobs, i);
      continue;
    }
    if (hazardAtFeet(game.map, m)) {
      killMob(game, m, 'lava');
      continue;
    }
    touchPlayer(game, m, prevFeet);
  }
}

// Treffer: explosion/lava/star töten sofort, sonst −1 HP.
export function hitMob(game, m, how) {
  if (m.dead) return;
  if (how === 'explosion' || how === 'lava' || how === 'star') m.hp = 0;
  else m.hp -= 1;
  if (m.hp <= 0) killMob(game, m, how);
}

// Tod: kopfüber fallen, nach DEAD_TIME entfernen, Punkte, Stampf-Ton.
export function killMob(game, m, how) {
  if (m.dead) return;
  m.dead = true;
  m.state = 'dead';
  m.flip = true;
  m.hp = 0;
  m.vx = 0;
  m.vy = DEAD_VY;
  m.timer = DEAD_TIME;
  game.addScore(KILL_SCORE);
  if (how === 'stomp') game.emit('stomp');
}

// Monster-Spawner (Kachel M): wird in A8 gefüllt.
export function updateSpawners(game, dt) {
  // A8
}
