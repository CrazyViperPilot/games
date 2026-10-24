// Geschosse (PLAN §6; PRD §5): Pfeile von Spieler und Skelett, Schädel und Feuer des Dreikopfs/Glutgeists.
// Geschoss-Position x, y = Mittelpunkt. Gegner, Boss, Spieler und Kristall: linke obere Ecke (x, y) mit w, h.
import { PHYS } from '../data/physics.js';
import { explode } from './explode.js';

const T = PHYS.tile;
const POOL = 16;
const SIZE = { arrow: [10, 3], enemyArrow: [10, 3], skull: [8, 8], fire: [8, 8] };
const LIFE = { arrow: 6, enemyArrow: 6, skull: 4, fire: 3 };   // s
const STUCK_TIME = 1;          // s, wie lange ein Pfeil in der Wand steckt
const SKULL_RADIUS = 1.5;      // Kacheln
const OFF_BOTTOM = 32;         // px unter dem Level, ab dem Pfeile verschwinden

function pool(game) {
  if (!game.projectiles) {
    game.projectiles = Array.from({ length: POOL }, () => ({
      active: false, type: 'arrow', x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, life: 0, stuck: false, owner: null,
    }));
  }
  return game.projectiles;
}

// Rechtecktest (linke obere Ecken, Breite, Höhe).
function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function solidAt(game, x, y) {
  return game.map.isSolid(Math.floor(x / T), Math.floor(y / T));
}

function hitsPlayer(game, o) {
  const p = game.player;
  return !!p && !p.dead && overlap(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, p.x, p.y, p.w, p.h);
}

// Spieler kann verletzt werden (nicht unverwundbar, kein Stern).
function canBeHurt(p) {
  return !(p.invuln > 0) && !(p.star > 0);
}

function moveBody(o, dt) {
  o.x += o.vx * dt;
  o.y += o.vy * dt;
}

function stick(o) {
  o.stuck = true;
  o.vx = 0;
  o.vy = 0;
  o.life = STUCK_TIME;
}

// Trefferprüfung eines Pfeils. Gibt true zurück, wenn der Pfeil verbraucht ist.
function arrowHit(game, o) {
  const bx = o.x - o.w / 2;
  const by = o.y - o.h / 2;
  if (o.type === 'enemyArrow') {
    const p = game.player;
    if (p && !p.dead && canBeHurt(p) && overlap(bx, by, o.w, o.h, p.x, p.y, p.w, p.h)) {
      game.stunPlayer?.();
      return true;
    }
    return false;
  }
  const mobs = game.mobs || [];
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (!m.active || m.state === 'dead') continue;
    if (overlap(bx, by, o.w, o.h, m.x, m.y, m.w, m.h)) {
      game.hitMob(m, 'arrow');
      return true;
    }
  }
  const b = game.boss;
  if (b && b.active && b.state !== 'defeated' && overlap(bx, by, o.w, o.h, b.x, b.y, b.w, b.h)) {
    game.damageBoss?.('arrow');
    return true;
  }
  const crystals = game.crystals || [];
  for (let i = 0; i < crystals.length; i++) {
    const cr = crystals[i];
    if (cr.alive === false) continue;
    if (overlap(bx, by, o.w, o.h, cr.x, cr.y, cr.w, cr.h)) {
      game.hitCrystal?.(cr);
      return true;
    }
  }
  return false;
}

// Erzeugt ein Geschoss aus dem Pool. Gibt das Objekt oder null (Pool voll) zurück.
export function spawnProjectile(game, type, x, y, vx, vy) {
  const size = SIZE[type];
  if (!size) return null;
  const list = pool(game);
  let o = null;
  for (let i = 0; i < list.length; i++) {
    if (!list[i].active) { o = list[i]; break; }
  }
  if (!o) return null;
  o.active = true;
  o.type = type;
  o.owner = type === 'arrow' ? 'player' : 'enemy';
  o.x = x;
  o.y = y;
  o.w = size[0];
  o.h = size[1];
  o.vx = vx;
  o.vy = vy;
  o.life = LIFE[type];
  o.stuck = false;
  return o;
}

// Bewegt alle Geschosse, prüft Wände, Gegner, Boss, Kristalle und Spieler.
export function updateProjectiles(game, dt) {
  const list = pool(game);
  const bottom = game.map.rows * T + OFF_BOTTOM;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!o.active) continue;
    o.life -= dt;

    if (o.type === 'arrow' || o.type === 'enemyArrow') {
      if (o.stuck) {
        if (o.life <= 0) o.active = false;
        continue;
      }
      if (o.life <= 0 || o.y > bottom) { o.active = false; continue; }
      o.vy += PHYS.arrowGravity * dt;
      moveBody(o, dt);
      if (solidAt(game, o.x, o.y)) { stick(o); continue; }
      if (arrowHit(game, o)) o.active = false;
    } else if (o.type === 'skull') {
      moveBody(o, dt);
      if (o.life <= 0 || solidAt(game, o.x, o.y) || hitsPlayer(game, o)) {
        o.active = false;
        explode(game, o.x, o.y, SKULL_RADIUS);
      }
    } else {
      // fire
      if (o.life <= 0) { o.active = false; continue; }
      moveBody(o, dt);
      if (solidAt(game, o.x, o.y)) {
        o.active = false;
      } else if (hitsPlayer(game, o) && canBeHurt(game.player)) {
        game.hurtPlayer('fire');
        o.active = false;
      }
    }
  }
}

// Spieler-Pfeil in Blickrichtung, nur wenn weniger als PHYS.maxArrows aktive Pfeile existieren.
export function spawnPlayerArrow(game) {
  const p = game.player;
  const list = pool(game);
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i].active && list[i].type === 'arrow') n++;
  }
  if (n >= PHYS.maxArrows) return null;
  const face = p.face < 0 ? -1 : 1;
  const o = spawnProjectile(game, 'arrow', p.x + p.w / 2 + face * 8, p.y + 10, face * PHYS.arrowSpeed, -30);
  if (o) game.emit('arrow');
  return o;
}
