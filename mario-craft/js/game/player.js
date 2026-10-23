// Spielerphysik (PLAN §5, PRD §4). Alle Zahlen kommen aus PHYS.
// Rückgabe von updatePlayer wird wiederverwendet (gilt nur bis zum nächsten Aufruf).
import { PHYS } from '../data/physics.js';
import { moveAndCollide } from './collide.js';

const OUT = { hitHead: null };
const NO_PLATFORMS = [];
const EPS = 0.5;

function approach(v, target, amount) {
  if (v < target) return Math.min(v + amount, target);
  if (v > target) return Math.max(v - amount, target);
  return v;
}

function sizeOf(power) {
  return PHYS.player[power === 'small' ? 'small' : 'big'];
}

// x, y = Mitte der Füße (wie start im Level). Der Körper wird als linke obere Ecke gespeichert.
export function createPlayer(x, y, power = 'small') {
  const s = sizeOf(power);
  return {
    x: x - s.w / 2, y: y - s.h, w: s.w, h: s.h,
    vx: 0, vy: 0, face: 1, power,
    onGround: false, runTimer: 0, coyote: 0, jumpBuffer: 0, jumping: false,
    invuln: 0, star: 0,          // Restzeit in s
    anim: 'stand', animTime: 0, dead: false,
  };
}

// Passt die Größe an; die Füße bleiben am selben y.
export function setPower(player, power) {
  const s = sizeOf(power);
  const bottom = player.y + player.h;
  player.power = power;
  player.w = s.w;
  player.h = s.h;
  player.y = bottom - s.h;
}

// Steht die Figur auf einer bewegten Plattform, wird sie um deren Bewegung in diesem Schritt mitgenommen.
// Plattform: { x, y, w, h, dx, dy }, x/y = Position vor diesem Schritt.
function carry(p, platforms) {
  const feet = p.y + p.h;
  for (let i = 0; i < platforms.length; i++) {
    const pl = platforms[i];
    if (p.x + p.w <= pl.x || p.x >= pl.x + pl.w) continue;
    if (p.onGround && Math.abs(feet - pl.y) < EPS) {
      p.x += pl.dx || 0;
      p.y = pl.y + (pl.dy || 0) - p.h;
      return;
    }
  }
}

// Landung auf einer bewegten Plattform von oben (nach der Bewegung dieses Schritts).
function landOnPlatforms(p, platforms, feetBefore) {
  if (p.vy < 0) return false;
  const feet = p.y + p.h;
  for (let i = 0; i < platforms.length; i++) {
    const pl = platforms[i];
    if (p.x + p.w <= pl.x || p.x >= pl.x + pl.w) continue;
    const top = pl.y + (pl.dy || 0);
    if (feetBefore <= top + EPS && feet >= top) {
      p.y = top - p.h;
      p.vy = 0;
      return true;
    }
  }
  return false;
}

export function updatePlayer(game, dt, input) {
  const p = game.player;
  const map = game.map;
  OUT.hitHead = null;
  if (p.dead) return OUT;

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (p.star > 0) p.star = Math.max(0, p.star - dt);

  const platforms = game.platforms || NO_PLATFORMS;
  if (platforms.length) carry(p, platforms);

  // Richtung und Renntempo: nach runDelay gehaltener Richtung, Reset bei Loslassen oder Wechsel.
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir === 0) {
    p.runTimer = 0;
  } else if (dir !== p.face) {
    p.face = dir;
    p.runTimer = 0;
  } else {
    p.runTimer = Math.min(p.runTimer + dt, PHYS.runDelay);
  }

  // Horizontal: beschleunigen, bremsen, wenden. In der Luft mit airAccelMult.
  const onG = p.onGround;
  const running = p.runTimer >= PHYS.runDelay;
  const target = dir * (running ? PHYS.runSpeed : PHYS.walkSpeed);
  const mult = onG ? 1 : PHYS.airAccelMult;
  let rate;
  if (dir === 0) rate = PHYS.decel * mult;
  else if (p.vx * dir < 0) rate = PHYS.turnDecel * mult;
  else rate = PHYS.accel * mult;
  p.vx = approach(p.vx, target, rate * dt);

  // Sprung: Puffer für Sprungdruck kurz vor der Landung, Coyote Time nach Kantenverlassen.
  if (input.jumpPressed) p.jumpBuffer = PHYS.jumpBuffer;
  else if (p.jumpBuffer > 0) p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (onG) p.coyote = PHYS.coyote;
  else if (p.coyote > 0) p.coyote = Math.max(0, p.coyote - dt);

  if (p.jumpBuffer > 0 && p.coyote > 0) {
    const fast = Math.abs(p.vx) > PHYS.walkSpeed + 1;
    p.vy = -(PHYS.jumpSpeed + (fast ? PHYS.runJumpBonus : 0));
    p.jumping = true;
    p.jumpBuffer = 0;
    p.coyote = 0;
    p.onGround = false;
  }

  // Variable Sprunghöhe: Loslassen während des Aufstiegs kappt vy.
  if (p.jumping && !input.jump && p.vy < 0) {
    p.vy *= PHYS.jumpCut;
    p.jumping = false;
  }
  const g = input.jump && p.vy < 0 ? PHYS.gravityHold : PHYS.gravity;
  p.vy = Math.min(p.vy + g * dt, PHYS.maxFall);

  // Bewegung und Kollision.
  const feetBefore = p.y + p.h;
  const res = moveAndCollide(p, map, dt);
  p.onGround = res.onGround;
  if (!p.onGround && platforms.length && landOnPlatforms(p, platforms, feetBefore)) {
    p.onGround = true;
  }
  if (p.onGround) p.jumping = false;

  // Animation.
  let anim;
  if (!p.onGround) anim = p.vy < 0 ? 'jump' : 'fall';
  else if (dir !== 0 && p.vx * dir < 0 && Math.abs(p.vx) > 30) anim = 'turn';
  else if (Math.abs(p.vx) > 1) anim = Math.abs(p.vx) > PHYS.walkSpeed + 1 ? 'run' : 'walk';
  else anim = 'stand';
  if (anim !== p.anim) {
    p.anim = anim;
    p.animTime = 0;
  } else {
    p.animTime += dt;
  }

  OUT.hitHead = res.hitHead;
  return OUT;
}
