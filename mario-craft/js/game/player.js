// Spielerphysik v2 (PLAN §5, §6; PRD §3). Alle Zahlen kommen aus PHYS.
// Feste Größe PHYS.player. Rückgabe von updatePlayer wird wiederverwendet (gilt nur bis zum nächsten Aufruf).
import { PHYS } from '../data/physics.js';
import { TILE_BY_ID } from '../data/tiles.js';
import { moveAndCollide } from './collide.js';

const T = PHYS.tile;
const E = 1e-6;
const OUT = { hitHead: null };
const SLIME_MIN_VY = 200;

function approach(v, target, amount) {
  if (v < target) return Math.min(v + amount, target);
  if (v > target) return Math.max(v - amount, target);
  return v;
}

function setAnim(p, anim, dt) {
  if (anim !== p.anim) {
    p.anim = anim;
    p.animTime = 0;
  } else {
    p.animTime += dt;
  }
}

// x, y = Mitte der Füße (wie start im Level). Der Körper wird als linke obere Ecke gespeichert.
export function createPlayer(x, y, power = 'plain') {
  const { w, h } = PHYS.player;
  return {
    x: x - w / 2, y: y - h, w, h,
    vx: 0, vy: 0, face: 1, power,
    onGround: false, inWater: false, climbing: false,
    runTimer: 0, coyote: 0, jumpBuffer: 0, jumping: false,
    invuln: 0, star: 0,          // Restzeit in s
    anim: 'stand', animTime: 0, dead: false, digging: false,
  };
}

// Ändert nur den Zustand der Figur (Größe bleibt).
export function setPower(player, power) {
  player.power = power;
}

// Überlappt die Hitbox eine Kletter-Kachel (Mittelpunkt-Spalte, irgendeine Zeile der Hitbox)?
function overlapsClimb(p, map) {
  const c = Math.floor((p.x + p.w / 2) / T);
  const r0 = Math.floor(p.y / T), r1 = Math.floor((p.y + p.h - E) / T);
  for (let r = r0; r <= r1; r++) {
    if (TILE_BY_ID[map.get(c, r)].climb) return true;
  }
  return false;
}

// Mittelpunkt der Hitbox in Wasser?
function centerInWater(p, map) {
  const c = Math.floor((p.x + p.w / 2) / T);
  const r = Math.floor((p.y + p.h / 2) / T);
  return TILE_BY_ID[map.get(c, r)].water;
}

export function updatePlayer(game, dt, input) {
  const p = game.player;
  const map = game.map;
  OUT.hitHead = null;
  if (p.dead) {
    setAnim(p, 'dead', dt);
    return OUT;
  }

  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (p.star > 0) p.star = Math.max(0, p.star - dt);

  // Umgebung zu Beginn des Schritts: Wasser (Mittelpunkt) und Klettern (Leiter/Ranke).
  const wet = centerInWater(p, map);
  if (wet && !p.inWater) game.emit('splash');
  p.inWater = wet;
  // Festhalten: bleibt in der Leiter, solange die Hitbox sie überlappt (vy ist im Klettern 0).
  p.climbing = overlapsClimb(p, map) && (input.jump || input.dig || p.vy > 0 || p.climbing);

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
  // Klettern: halbes Renntempo. Wasser: speedMult.
  const onG = p.onGround;
  const running = p.runTimer >= PHYS.runDelay;
  let top = running ? PHYS.runSpeed : PHYS.walkSpeed;
  if (p.climbing) top = PHYS.runSpeed * 0.5;
  else if (p.inWater) top *= PHYS.water.speedMult;
  const target = dir * top;
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

  if (p.climbing || p.inWater) {
    // Klettern und Schwimmen ersetzen den Bodensprung.
    p.jumpBuffer = 0;
    p.coyote = 0;
    p.jumping = false;
    if (p.inWater && input.jumpPressed) p.vy = -PHYS.water.swim;   // Schwimmzug, auch ohne Boden
  } else {
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
  }

  // Vertikal: Klettern (keine Schwerkraft), Wasser, normale Schwerkraft.
  if (p.climbing) {
    p.vy = input.jump ? -PHYS.climbSpeed : input.dig ? PHYS.climbSpeed : 0;
  } else if (p.inWater) {
    p.vy = Math.min(p.vy + PHYS.water.gravity * dt, PHYS.water.maxFall);
  } else {
    const g = input.jump && p.vy < 0 ? PHYS.gravityHold : PHYS.gravity;
    p.vy = Math.min(p.vy + g * dt, PHYS.maxFall);
  }

  // Bewegung und Kollision.
  const vyBefore = p.vy;
  const res = moveAndCollide(p, map, dt);
  p.onGround = res.onGround;

  // Schleimblock: Landung aus Fallgeschwindigkeit schleudert hoch.
  if (p.onGround && !p.climbing && vyBefore > SLIME_MIN_VY && TILE_BY_ID[res.groundId].bounce) {
    p.vy = -PHYS.slimeBounce * (input.jump ? 1.1 : 1);
    p.onGround = false;
    p.jumping = false;
    p.coyote = 0;
  }
  if (p.onGround) p.jumping = false;

  // Animation.
  let anim;
  if (p.climbing) anim = 'climb';
  else if (p.inWater) anim = 'swim';
  else if (!p.onGround) anim = p.vy < 0 ? 'jump' : 'fall';
  else if (p.digging) anim = 'dig';
  else if (Math.abs(p.vx) > 1) anim = Math.abs(p.vx) > PHYS.walkSpeed + 1 ? 'run' : 'walk';
  else anim = 'stand';
  setAnim(p, anim, dt);

  OUT.hitHead = res.hitHead;
  return OUT;
}
