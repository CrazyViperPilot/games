// Gegner: Spawn-Muster, Bewegung, Scharfschütze (Telegraph + Schuss), Kontakt mit der Truppe.
import { BAL } from '../data/balance.js';
import { ENEMIES } from '../data/enemies.js';
import { randRange } from '../core/rng.js';
import { burst } from './particles.js';

const SPAWN_Y = -40;

// Einzelnen Gegner aus dem Pool erzeugen. HP/Schild skaliert mit game.hpMul.
export function spawnEnemy(game, def, x, y) {
  const e = game.enemies.get();
  const hpMul = game.hpMul;
  e.def = def;
  e.x = x;
  e.y = y;
  e.hp = def.hp * hpMul;
  e.maxHp = e.hp;
  e.shield = def.shieldHp * hpMul;
  e.maxShield = e.shield;
  e.r = def.radius;
  e.state = 'walk';
  e.timer = 0;
  e.aimX = 0;
  e.aimY = 0;
  e.flash = 0;
  e.walk = game.rng() * 6.28;
  e.uid = ++game.uidSeq;
  return e;
}

// Welle nach Muster um Zentrum x (ev.x als Anteil 0..1 der Breite, sonst zufällig 0.25–0.75).
export function spawnWave(game, ev) {
  const def = ENEMIES[ev.enemy];
  if (!def) return;
  const n = Math.max(1, Math.round((ev.count || 1) * (ev.enemy === 'apc' || ev.enemy === 'sniper' ? 1 : BAL.WAVE_COUNT_MULT)));
  const W = game.W;
  const r = def.radius;
  const cx = (ev.x !== undefined ? ev.x : randRange(game.rng, 0.25, 0.75)) * W;
  const pattern = ev.pattern || 'line';

  for (let i = 0; i < n; i++) {
    let x = cx;
    let y = SPAWN_Y;
    if (pattern === 'line') {
      x = cx + (i - (n - 1) / 2) * 26;
    } else if (pattern === 'v') {
      if (i > 0) {
        const j = Math.ceil(i / 2);
        const s = i % 2 ? -1 : 1;
        x = cx + s * j * 22;
        y = SPAWN_Y - j * 20;
      }
    } else if (pattern === 'column') {
      y = SPAWN_Y - i * 30;
    } else if (pattern === 'random') {
      x = randRange(game.rng, r, W - r);
      y = SPAWN_Y - randRange(game.rng, 0, 160);
    } else if (pattern === 'horde') {
      // dichter, länglicher Pulk um cx (Horden): Breite wächst mit der Anzahl
      const spread = Math.min(W * 0.42, 40 + n * 4);
      x = cx + (game.rng() * 2 - 1) * spread;
      y = SPAWN_Y - game.rng() * (60 + n * 7);
    } else if (pattern === 'wall') {
      const perRow = Math.ceil(n / 2);
      const row = i % 2;
      const col = Math.floor(i / 2);
      x = r + (perRow > 1 ? (col * (W - 2 * r)) / (perRow - 1) : (W - 2 * r) / 2);
      y = SPAWN_Y - row * 30;
    }
    if (x < r) x = r;
    else if (x > W - r) x = W - r;
    const e = spawnEnemy(game, def, x, y);
    if (pattern === 'horde') {
      // Horden sind Kanonenfutter: weniger HP
      e.hp *= BAL.HORDE_HP;
      e.maxHp = e.hp;
    }
  }
}

function fireSniper(game, e) {
  const b = game.enemyBullets.get();
  const dx = e.aimX - e.x;
  const dy = e.aimY - e.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  b.x = e.x;
  b.y = e.y;
  b.vx = (dx / len) * BAL.ENEMY_BULLET_SPEED;
  b.vy = (dy / len) * BAL.ENEMY_BULLET_SPEED;
}

// Scharfschütze: stoppt, zielt (Telegraph, Position eingefroren), schießt, wiederholt.
function updateSniper(game, e, dt) {
  e.timer += dt;
  if (e.state === 'stopped') {
    if (e.timer >= BAL.SNIPER_INTERVAL) {
      e.state = 'aim';
      e.timer = 0;
      e.aimX = game.squad.x;
      e.aimY = game.SQUAD_Y;
    }
  } else if (e.state === 'aim') {
    if (e.timer >= BAL.SNIPER_TELEGRAPH) {
      fireSniper(game, e);
      e.state = 'stopped';
      e.timer = 0;
    }
  }
}

// Alle aktiven Gegner: Bewegung, Homing, Scharfschütze, Kontakt, Aufräumen unter dem Bildschirm.
export function updateEnemies(game, dt) {
  const pool = game.enemies;
  const items = pool.items;
  const sq = game.squad;
  const sqY = game.SQUAD_Y;
  const H = game.H;
  const W = game.W;

  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    if (!e.active) continue;
    const def = e.def;
    e.walk += dt * 6;
    e.flash *= Math.max(0, 1 - dt * 10);

    if (e.state === 'walk') {
      e.y += (game.scroll + def.speed) * dt;
      // stopY = Abstand über der Truppenlinie, an dem der Gegner anhält.
      if (def.stopY > 0 && e.y >= sqY - def.stopY) {
        e.y = sqY - def.stopY;
        e.state = 'stopped';
        e.timer = 0;
      }
      // Homing: seitlich Richtung Truppe, nur oberhalb der Truppenlinie.
      if (def.homing > 0 && e.y < sqY) {
        const dx = sq.x - e.x;
        const step = def.homing * dt;
        if (dx > step) e.x += step;
        else if (dx < -step) e.x -= step;
        else e.x = sq.x;
      }
    } else {
      updateSniper(game, e, dt);
    }

    if (e.x < e.r) e.x = e.r;
    else if (e.x > W - e.r) e.x = W - e.r;

    // Kontakt: kostet Soldaten, Gegner stirbt ohne Münzen.
    if (Math.abs(e.y - sqY) < e.r + 10 && Math.abs(e.x - sq.x) < sq.radius + e.r) {
      game.loseSoldiers(def.contact, e.x, e.y);
      burst(game, 'smoke', e.x, e.y, 4, { speed: 60 });
      pool.release(e);
      continue;
    }

    // Unter dem Bildschirm: ohne Strafe entfernen.
    if (e.y > H + 30) pool.release(e);
  }
}
