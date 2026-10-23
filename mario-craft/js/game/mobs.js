// Mobs (PLAN §6, PRD §5). Kein DOM. Zombie, Zischer, Silberfischchen; Monster-Spawner (Kachel M).
// createMob erwartet die Fußmitte (wie parseLevel-Spawns); gespeichert wird die linke obere Ecke.
// Lebende Zombies und Zischer nutzen m.timer als Wende-Cooldown nach einem Wandtreffer.
// Zischer: state 'walk' | 'fuse' (m.fuse = Zündschnur in s). Explodiert er, ist state 'gone' (ohne Punkt, ohne Flip).
// Tote Mobs fallen kopfüber ohne Kollision und werden nach DEAD_TIME entfernt.
import { PHYS } from '../data/physics.js';
import { MOBS, SPAWNER } from '../data/mobs.js';
import { TILE_BY_ID, TILE_IDS } from '../data/tiles.js';
import { moveAndCollide } from './collide.js';
import { explode } from './explode.js';

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
const ZISCHER_Y_RANGE = 4 * T; // px: vertikaler Aggro-Bereich des Zischers
const SPAWNER_ID = TILE_IDS.spawner;

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

// Zündet einen Zischer, oder kürzt die Zündschnur, wenn er schon brennt. Steht danach still.
function igniteZischer(game, m, fuse) {
  if (m.state !== 'fuse') {
    m.state = 'fuse';
    m.anim = 'fuse';
    m.fuse = fuse;
    m.vx = 0;
    game.emit('fuse');
  } else if (m.fuse > fuse) {
    m.fuse = fuse;
  }
}

// Zischer explodiert. Der Mob ist vorher als tot markiert, damit explode ihn nicht per killMob zählt.
function detonateZischer(game, m) {
  m.dead = true;
  m.state = 'gone';
  m.hp = 0;
  m.vx = 0;
  m.vy = 0;
  m.timer = 0;   // updateDead entfernt ihn beim nächsten Schritt
  explode(game, m.x + m.w / 2, m.y + m.h / 2, MOBS.zischer.radius);
}

// Zischer: läuft ab `aggro` Kacheln in x (|dy| < 4 Kacheln) auf den Spieler zu, sonst steht er still.
// Dreht an Wänden wie der Zombie. Kommt der Spieler näher als `fuseRange` (Mittelpunkte), zündet er sich.
function moveZischer(game, m, dt) {
  const d = MOBS.zischer;
  if (m.state === 'fuse') {
    m.vx = 0;
    m.vy = Math.min(m.vy + PHYS.gravity * dt, PHYS.maxFall);
    m.onGround = moveAndCollide(m, game.map, dt).onGround;
    m.animTime += dt;
    m.fuse -= dt;
    if (m.fuse <= 0) detonateZischer(game, m);
    return;
  }

  const p = game.player;
  const dxp = (p.x + p.w / 2) - (m.x + m.w / 2);
  const dyp = (p.y + p.h / 2) - (m.y + m.h / 2);
  const near = Math.abs(dxp) < d.aggro * T && Math.abs(dyp) < ZISCHER_Y_RANGE;
  if (m.timer > 0) {
    m.timer = Math.max(0, m.timer - dt);
  } else if (near && dxp !== 0) {
    m.face = dxp > 0 ? 1 : -1;
  }
  m.vx = near ? m.face * d.speed : 0;
  m.vy = Math.min(m.vy + PHYS.gravity * dt, PHYS.maxFall);
  const res = moveAndCollide(m, game.map, dt);
  m.onGround = res.onGround;
  if (res.hitWall !== 0) {
    m.face = -res.hitWall;
    m.timer = TURN_COOLDOWN;
  }
  m.animTime += dt;

  const dx = (p.x + p.w / 2) - (m.x + m.w / 2);
  const dy = (p.y + p.h / 2) - (m.y + m.h / 2);
  const R = d.fuseRange * T;
  if (dx * dx + dy * dy <= R * R) igniteZischer(game, m, d.fuse);
}

// Bewegung je Typ. Neue Typen als eigener case; default läuft wie zombie.
function moveMobType(game, m, dt) {
  switch (m.type) {
    case 'zischer':
      moveZischer(game, m, dt);
      break;
    case 'zombie':
    case 'silverfish':
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
// Zischer: Stampfen und Seitenkontakt zünden ihn (stompFuse), Schaden macht nur seine Explosion.
// prevFeet = Fußposition des Spielers vor dem Schritt.
function touchPlayer(game, m, prevFeet) {
  const p = game.player;
  if (!rectHit(m.x, m.y, m.w, m.h, p.x, p.y, p.w, p.h)) return;
  const stompable = MOBS[m.type].stompable !== false;
  if (stompable && p.vy > 0 && prevFeet <= m.y + m.h * 0.5) {
    if (m.type === 'zischer') {
      igniteZischer(game, m, MOBS.zischer.stompFuse);
      game.emit('stomp');
    } else {
      hitMob(game, m, 'stomp');
    }
    p.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
    return;
  }
  if (p.star > 0) {
    killMob(game, m, 'star');
    return;
  }
  if (m.type === 'zischer') {
    igniteZischer(game, m, MOBS.zischer.stompFuse);
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
    if (m.dead) continue;   // Zischer ist in diesem Schritt explodiert
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

// Spawner-Zellen einmalig aus der Karte sammeln (Timer startet voll, damit der erste Mob nach `every` s kommt).
function collectSpawners(game) {
  const map = game.map;
  const list = [];
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] === SPAWNER_ID) {
      list.push({ c: i % map.cols, r: Math.floor(i / map.cols), timer: SPAWNER.every, n: 0, alive: [] });
    }
  }
  game.spawners = list;
}

// Lebende Mobs des Spawners behalten: nicht tot und noch in game.mobs.
function pruneAlive(game, s) {
  const a = s.alive;
  let n = 0;
  for (let j = 0; j < a.length; j++) {
    if (!a[j].dead && game.mobs.includes(a[j])) a[n++] = a[j];
  }
  a.length = n;
}

// Erste freie (nicht feste) Zelle über, links, rechts vom Spawner. Gibt die Fußmitte in px zurück oder null.
function freeSpot(map, c, r) {
  if (!map.isSolid(c, r - 1)) return { x: (c + 0.5) * T, y: r * T };
  if (!map.isSolid(c - 1, r)) return { x: (c - 0.5) * T, y: (r + 1) * T };
  if (!map.isSolid(c + 1, r)) return { x: (c + 1.5) * T, y: (r + 1) * T };
  return null;
}

// Monster-Spawner (Kachel M): ist der Spieler ≤ range Kacheln entfernt, läuft der Timer. Alle `every` s
// erscheint ein Mob (Typ abwechselnd aus SPAWNER.types), solange weniger als `max` von ihm leben.
export function updateSpawners(game, dt) {
  if (!game.spawners) collectSpawners(game);
  const list = game.spawners;
  const map = game.map;
  const p = game.player;
  const R2 = (SPAWNER.range * T) * (SPAWNER.range * T);
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (map.get(s.c, s.r) !== SPAWNER_ID) {
      removeAt(list, i);
      continue;
    }
    pruneAlive(game, s);
    const dx = (p.x + p.w / 2) - (s.c + 0.5) * T;
    const dy = (p.y + p.h / 2) - (s.r + 0.5) * T;
    if (dx * dx + dy * dy > R2) continue;

    s.timer -= dt;
    if (s.timer > 0) continue;
    s.timer = SPAWNER.every;
    if (s.alive.length >= SPAWNER.max) continue;
    const spot = freeSpot(map, s.c, s.r);
    if (!spot) continue;
    const type = SPAWNER.types[s.n % SPAWNER.types.length];
    s.n++;
    const m = game.spawnMob(type, spot.x, spot.y) ?? game.mobs[game.mobs.length - 1];
    s.alive.push(m);
    game.emit('spawn');
  }
}
