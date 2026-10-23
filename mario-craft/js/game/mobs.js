// Mobs (PLAN §6, PRD §5). Kein DOM. Zombie, Zischer, Silberfischchen, Skelett, Spinne, Schleim, Glutgeist,
// Leerenläufer; Monster-Spawner (Kachel M).
// Leerenläufer: m.state 'calm' | 'angry'. m.invuln = Schonzeit nach einem Stampfer (Renderer blinkt damit).
// createMob erwartet die Fußmitte (wie parseLevel-Spawns); gespeichert wird die linke obere Ecke.
// Lebende Zombies und Zischer nutzen m.timer als Wende-Cooldown nach einem Wandtreffer.
// Zischer: state 'walk' | 'fuse' (m.fuse = Zündschnur in s). Explodiert er, ist state 'gone' (ohne Punkt, ohne Flip).
// Tote Mobs fallen kopfüber ohne Kollision und werden nach DEAD_TIME entfernt.
import { PHYS } from '../data/physics.js';
import { MOBS, SPAWNER } from '../data/mobs.js';
import { TILE_BY_ID, TILE_IDS } from '../data/tiles.js';
import { moveAndCollide } from './collide.js';
import { explode } from './explode.js';
import { spawnProjectile } from './projectiles.js';

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
const SIGHT_X = 10 * T;          // Skelett sieht den Spieler bis 10 Kacheln (x) ...
const SIGHT_Y = 3 * T;           // ... und bis 3 Kacheln (y)
const SKEL_APPROACH = 12 * T;    // darüber steht das Skelett still
const SKEL_AIM_TIME = 0.4;       // s Anim 'shoot' vor dem Pfeil
const SKEL_ARROW_VX = 150;
const SKEL_ARROW_VY = -40;
const SPIDER_CLIMB_VY = -60;     // px/s Kletteraufstieg an einer Wand (ohne Schwerkraft)
const SPIDER_JUMP_VY = -260;
const SPIDER_JUMP_VX = 110;
const SPIDER_COOLDOWN = 1.5;     // s zwischen zwei Sprüngen
const SLIME_WAIT = 0.8;          // s am Boden vor dem nächsten Hüpfer
const SLIME_SQUASH = 0.2;        // letzte s des Wartens: Anim 'squash'
const SLIME_JUMP_VY = -240;
const SLIME_SMALL_JUMP_VY = -200;
const SPLIT_VX = 60;             // Startgeschwindigkeit der beiden kleinen Schleime
const SPLIT_VY = -150;
const SPLIT_DX = 6;              // px links/rechts vom großen Schleim

// Mob an der Fußmitte (x, y) erzeugen.
export function createMob(type, x, y) {
  const d = MOBS[type];
  if (!d) throw new Error(`Unbekannter Mob-Typ: ${type}`);
  return {
    type, x: x - d.w / 2, y: y - d.h, w: d.w, h: d.h,
    vx: 0, vy: 0, face: -1, anim: 'walk', animTime: 0,
    active: false, dead: false, state: 'walk', timer: 0,
    hp: d.hp, onGround: false, flip: false, fuse: 0, shootT: 0, spawned: false,
    timer2: 0, climb: false,   // timer2: Zweitzeit je Typ (Skelett-Schussanim, Spinnen-Sprungcooldown, Schleim-Warten)
    invuln: 0,                 // s Schonzeit nach einem Stampfer (nur Leerenläufer)
    y0: y - d.h,               // Schwebehöhe (Glutgeist wippt um sie)
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

function applyGravity(m, dt) {
  m.vy = Math.min(m.vy + PHYS.gravity * dt, PHYS.maxFall);
}

// Richtung zum Spieler (±1) von der Mitte des Mobs aus.
function faceTo(p, m) {
  return (p.x + p.w / 2) - (m.x + m.w / 2) < 0 ? -1 : 1;
}

// Feste oder Plattform-Kachel 1 px vor der Fußkante? Sonst ist es eine Kante.
function groundAhead(map, m, dir) {
  const fx = dir > 0 ? m.x + m.w + 1 : m.x - 1;
  const t = TILE_BY_ID[map.get(Math.floor(fx / T), Math.floor((m.y + m.h + 1) / T))];
  return t.solid || t.oneWay;
}

// Feste Kachel in Blickrichtung neben dem Körper (über die ganze Körperhöhe)?
function wallAhead(map, m, dir) {
  const c = Math.floor((dir > 0 ? m.x + m.w + 1 : m.x - 1) / T);
  const r0 = Math.floor(m.y / T), r1 = Math.floor((m.y + m.h - E) / T);
  for (let r = r0; r <= r1; r++) {
    if (map.isSolid(c, r)) return true;
  }
  return false;
}

// Skelett: hält 4–6 Kacheln Abstand. Schuss: m.shootT = Zeit seit dem letzten Schuss, m.state 'aim' = Anim 'shoot'
// für SKEL_AIM_TIME (m.timer2 = Restzeit), danach Pfeil. Dreht an Wänden, bleibt an Kanten stehen.
function moveSkeleton(game, m, dt) {
  const d = MOBS.skeleton;
  const p = game.player;
  const dxp = (p.x + p.w / 2) - (m.x + m.w / 2);
  const dyp = (p.y + p.h / 2) - (m.y + m.h / 2);
  const ax = Math.abs(dxp);
  const toward = dxp < 0 ? -1 : 1;
  const cooling = m.timer > 0;
  let dir = 0;
  m.shootT += dt;

  if (m.state === 'aim') {
    m.timer2 -= dt;
    if (m.timer2 <= 0) {
      m.state = 'walk';
      m.face = toward;
      spawnProjectile(game, 'enemyArrow', m.x + m.w / 2 + toward * 8, m.y + 10, toward * SKEL_ARROW_VX, SKEL_ARROW_VY);
    }
  } else if (m.shootT >= d.shootEvery && ax < SIGHT_X && Math.abs(dyp) < SIGHT_Y) {
    m.shootT = 0;
    m.state = 'aim';
    m.timer2 = SKEL_AIM_TIME;
    m.face = toward;
  } else {
    if (cooling) {
      m.timer = Math.max(0, m.timer - dt);
      dir = m.face;
    } else if (ax < d.keep[0] * T) {
      dir = -toward;
    } else if (ax > d.keep[1] * T && ax < SKEL_APPROACH) {
      dir = toward;
    }
    if (!cooling) m.face = dir !== 0 ? dir : toward;
    if (dir !== 0 && m.onGround && !groundAhead(game.map, m, dir)) dir = 0;
  }

  m.vx = dir * d.speed;
  m.anim = m.state === 'aim' ? 'shoot' : 'walk';
  applyGravity(m, dt);
  const res = moveAndCollide(m, game.map, dt);
  m.onGround = res.onGround;
  m.animTime += dt;
  // Wand in Gehrichtung: beim Anlaufen zum Spieler (oder im Cooldown) umdrehen; auf der Flucht steht es still.
  if (res.hitWall !== 0 && res.hitWall === dir && (cooling || dir === toward)) {
    m.face = -res.hitWall;
    m.timer = TURN_COOLDOWN;
  }
}

// Spinne: schnell auf den Spieler zu. Stößt sie seitlich an eine feste Kachel, klettert sie (m.climb,
// vy = SPIDER_CLIMB_VY, ohne Schwerkraft) solange die Wand in Blickrichtung fest ist. Sprung (m.state 'jump')
// ab jumpRange Kacheln, dann SPIDER_COOLDOWN Sperre (m.timer2).
function moveSpider(game, m, dt) {
  const d = MOBS.spider;
  const p = game.player;
  const dxp = (p.x + p.w / 2) - (m.x + m.w / 2);
  const toward = dxp < 0 ? -1 : 1;
  m.timer2 = Math.max(0, m.timer2 - dt);
  if (m.climb && !wallAhead(game.map, m, m.face)) m.climb = false;
  if (!m.climb) m.face = toward;

  if (m.climb) {
    m.vx = m.face * d.speed;
    m.vy = SPIDER_CLIMB_VY;
    m.anim = 'walk';
  } else {
    applyGravity(m, dt);
    if (m.state === 'jump') {
      m.vx = m.face * SPIDER_JUMP_VX;
      m.anim = 'jump';
    } else {
      m.vx = m.face * d.speed;
      m.anim = 'walk';
      if (m.onGround && m.timer2 <= 0 && Math.abs(dxp) < d.jumpRange * T) {
        m.state = 'jump';
        m.timer2 = SPIDER_COOLDOWN;
        m.vx = m.face * SPIDER_JUMP_VX;
        m.vy = SPIDER_JUMP_VY;
        m.anim = 'jump';
      }
    }
  }

  const res = moveAndCollide(m, game.map, dt);
  m.onGround = res.onGround;
  m.animTime += dt;
  if (res.hitWall !== 0) m.climb = true;
  if (m.state === 'jump' && res.onGround) m.state = 'walk';
}

// Schleim und kleiner Schleim: wartet am Boden (SLIME_WAIT, letzte SLIME_SQUASH s Anim 'squash'), dann Sprung
// zum Spieler mit vx = face × speed × 2. m.state 'wait' | 'air'. Die Teilung steckt in killMob (splitSlime).
function moveSlime(game, m, dt) {
  const d = MOBS[m.type];
  if (m.state !== 'wait' && m.state !== 'air') {
    m.state = 'wait';
    m.timer2 = SLIME_WAIT;
  }
  applyGravity(m, dt);
  if (m.state === 'wait') {
    m.vx = 0;
    if (!m.onGround) m.timer2 = SLIME_WAIT;
    else m.timer2 -= dt;
    m.anim = m.timer2 <= SLIME_SQUASH ? 'squash' : 'stand';
    if (m.timer2 <= 0 && m.onGround) {
      m.face = faceTo(game.player, m);
      m.vx = m.face * d.speed * 2;
      m.vy = m.type === 'slime' ? SLIME_JUMP_VY : SLIME_SMALL_JUMP_VY;
      m.state = 'air';
      m.anim = 'jump';
    }
  } else {
    m.anim = 'jump';
  }
  const res = moveAndCollide(m, game.map, dt);
  m.onGround = res.onGround;
  m.animTime += dt;
  if (m.state === 'air' && res.onGround) {
    m.state = 'wait';
    m.timer2 = SLIME_WAIT;
    m.vx = 0;
  }
}

// Freie Fläche für eine Box (px): keine feste Kachel in den überlappten Zellen.
function boxFree(map, x, y, w, h) {
  const c0 = Math.floor(x / T), c1 = Math.floor((x + w - E) / T);
  const r0 = Math.floor(y / T), r1 = Math.floor((y + h - E) / T);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (map.isSolid(c, r)) return false;
    }
  }
  return true;
}

// Glutgeist: schwebt ohne Schwerkraft, wippt um y0. Innerhalb range Kacheln driftet er zum Spieler, sonst steht er.
// Feste Kacheln blockieren nur die Bewegung (keine Kollisionsauflösung). Salve alle shootEvery s, solange der
// Spieler in Reichweite ist (Timer läuft immer, die Salve kommt beim Eintritt in Reichweite).
function moveGlutgeist(game, m, dt) {
  const d = MOBS.glutgeist;
  const p = game.player;
  const pcx = p.x + p.w / 2;
  const pcy = p.y + p.h / 2;
  const mcx = m.x + m.w / 2;
  const mcy = m.y + m.h / 2;
  const dxp = pcx - mcx;
  const dyp = pcy - mcy;
  const R = d.range * T;
  const inRange = dxp * dxp + dyp * dyp < R * R;
  m.face = dxp < 0 ? -1 : 1;
  m.onGround = false;
  m.anim = 'walk';
  m.animTime += dt;

  m.vx = inRange ? m.face * d.speed : 0;
  const nx = m.x + m.vx * dt;
  if (boxFree(game.map, nx, m.y, m.w, m.h)) m.x = nx;
  else m.vx = 0;
  const ny = m.y0 + Math.sin(m.animTime * (2 * Math.PI / d.bobPeriod)) * d.bobAmp;
  m.vy = 0;
  if (boxFree(game.map, m.x, ny, m.w, m.h)) m.y = ny;

  m.shootT += dt;
  if (inRange && m.shootT >= d.shootEvery) {
    m.shootT = 0;
    glutSalvo(game, m, mcx, mcy, pcx, pcy);
  }
}

// Salve: `shots` Feuerkugeln von (sx, sy) Richtung (tx, ty), fächerförmig um `fan` rad auseinander.
function glutSalvo(game, m, sx, sy, tx, ty) {
  const d = MOBS.glutgeist;
  const base = Math.atan2(ty - sy, tx - sx);
  const half = (d.shots - 1) / 2;
  for (let k = 0; k < d.shots; k++) {
    const a = base + (k - half) * d.fan;
    spawnProjectile(game, 'fire', sx, sy, Math.cos(a) * d.shotSpeed, Math.sin(a) * d.shotSpeed);
  }
}

// Leerenläufer calm: läuft hin und her, dreht an Wänden und Kanten. Angry: läuft auf den Spieler zu.
function moveLaeufer(game, m, dt) {
  const d = MOBS.leerenlaeufer;
  if (m.state !== 'angry') m.state = 'calm';
  if (m.state === 'angry') {
    m.face = faceTo(game.player, m);
    m.vx = m.face * d.angrySpeed;
  } else {
    if (m.timer > 0) m.timer = Math.max(0, m.timer - dt);
    else if (m.onGround && !groundAhead(game.map, m, m.face)) {
      m.face = -m.face;
      m.timer = TURN_COOLDOWN;
    }
    m.vx = m.face * d.speed;
  }
  applyGravity(m, dt);
  const res = moveAndCollide(m, game.map, dt);
  m.onGround = res.onGround;
  m.animTime += dt;
  if (m.state !== 'angry' && res.hitWall !== 0) {
    m.face = -res.hitWall;
    m.timer = TURN_COOLDOWN;
  }
}

// Teleport neben den Spieler: teleportDist px vor ihm in Blickrichtung, Füße auf Spielerfüßen. Nur auf freie
// Fläche; sonst bleibt der Läufer, wo er ist.
function teleportLaeufer(game, m) {
  const p = game.player;
  const side = p.face < 0 ? -1 : 1;
  const nx = p.x + p.w / 2 + side * MOBS.leerenlaeufer.teleportDist - m.w / 2;
  const ny = p.y + p.h - m.h;
  if (!boxFree(game.map, nx, ny, m.w, m.h)) return;
  m.x = nx;
  m.y = ny;
  m.vx = 0;
  m.vy = 0;
  m.face = -side;
  game.emit('teleport');
}

// Spieler prallt von einem Stampfer ab (Sprung gehalten = höher).
function bouncePlayer(game) {
  game.player.vy = -(game.jumpHeld ? PHYS.stompBounceHold : PHYS.stompBounce);
}

// Leerenläufer-Kontakt: Stern tötet. Calm: Berührung macht ihn angry und teleportiert ihn. Angry: Stampfen nimmt
// 1 hp (Schonzeit), Seitenkontakt verletzt. Während der Schonzeit prallt der Spieler nur ab.
function touchLaeufer(game, m, prevFeet) {
  const p = game.player;
  const stomp = p.vy > 0 && prevFeet <= m.y + m.h * 0.5;
  if (p.star > 0) {
    killMob(game, m, 'star');
    return;
  }
  if (m.state !== 'angry') {
    m.state = 'angry';
    teleportLaeufer(game, m);
    if (stomp) bouncePlayer(game);
    return;
  }
  if (stomp) {
    if (m.invuln <= 0) hitMob(game, m, 'stomp');
    bouncePlayer(game);
    return;
  }
  if (p.invuln <= 0) game.hurtPlayer('mob');
}

// Bewegung je Typ. Neue Typen als eigener case; default läuft wie zombie.
function moveMobType(game, m, dt) {
  switch (m.type) {
    case 'glutgeist':
      moveGlutgeist(game, m, dt);
      break;
    case 'leerenlaeufer':
      moveLaeufer(game, m, dt);
      break;
    case 'zischer':
      moveZischer(game, m, dt);
      break;
    case 'skeleton':
      moveSkeleton(game, m, dt);
      break;
    case 'spider':
      moveSpider(game, m, dt);
      break;
    case 'slime':
    case 'slimeSmall':
      moveSlime(game, m, dt);
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
  if (m.type === 'leerenlaeufer') {
    touchLaeufer(game, m, prevFeet);
    return;
  }
  const stompable = MOBS[m.type].stompable !== false;
  if (stompable && p.vy > 0 && prevFeet <= m.y + m.h * 0.5) {
    if (m.type === 'zischer') {
      igniteZischer(game, m, MOBS.zischer.stompFuse);
      game.emit('stomp');
    } else {
      hitMob(game, m, 'stomp');
    }
    bouncePlayer(game);
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

    if (m.invuln > 0) m.invuln = Math.max(0, m.invuln - dt);
    moveMobType(game, m, dt);
    if (m.dead) continue;   // Zischer ist in diesem Schritt explodiert
    if (m.y > fallLimit) {
      removeAt(mobs, i);
      continue;
    }
    if (!MOBS[m.type].flies && hazardAtFeet(game.map, m)) {
      killMob(game, m, 'lava');
      continue;
    }
    touchPlayer(game, m, prevFeet);
  }
}

// Treffer: explosion/lava/star töten sofort, sonst −1 HP. Ein Stampfer während der Schonzeit (m.invuln) zählt nicht.
// Überlebt der Mob einen Stampfer, gibt es die Schonzeit aus MOBS (invulnTime) und den Stampf-Ton.
export function hitMob(game, m, how) {
  if (m.dead) return;
  if (how === 'stomp' && m.invuln > 0) return;
  if (how === 'explosion' || how === 'lava' || how === 'star') m.hp = 0;
  else m.hp -= 1;
  if (m.hp <= 0) {
    killMob(game, m, how);
    return;
  }
  if (how === 'stomp') {
    m.invuln = MOBS[m.type].invulnTime ?? 0;
    game.emit('stomp');
  }
}

// Schleim-Teilung (Stampfen/Pfeil): großer Schleim verschwindet, zwei kleine springen links und rechts ab.
// Wie der Zischer ist der Mob vorher als tot markiert, damit updateDead ihn im nächsten Schritt entfernt.
function splitSlime(game, m, how) {
  m.dead = true;
  m.state = 'gone';
  m.hp = 0;
  m.vx = 0;
  m.vy = 0;
  m.timer = 0;
  game.addScore(KILL_SCORE);
  if (how === 'stomp') game.emit('stomp');
  const fx = m.x + m.w / 2;
  const fy = m.y + m.h;
  for (const sgn of [-1, 1]) {
    const c = game.spawnMob('slimeSmall', fx + sgn * SPLIT_DX, fy);
    if (!c) continue;
    c.state = 'air';   // fliegt mit dem Abprall, bis er landet
    c.anim = 'jump';
    c.vx = sgn * SPLIT_VX;
    c.vy = SPLIT_VY;
  }
}

// Tod: kopfüber fallen, nach DEAD_TIME entfernen, Punkte, Stampf-Ton.
// Schleim teilt sich bei Stampfen und Pfeil; Explosion, Lava und Stern töten ihn ohne Teilung.
export function killMob(game, m, how) {
  if (m.dead) return;
  if (m.type === 'slime' && (how === 'stomp' || how === 'arrow')) {
    splitSlime(game, m, how);
    return;
  }
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
