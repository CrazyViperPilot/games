// Boss/Fahrzeug: Einfahrt, seitliches Pendeln, Granaten-Telegraph, Kontakt mit der Truppe.
import { BAL, bossHp } from '../data/balance.js';
import { BOSSES } from '../data/enemies.js';
import { audio } from '../core/audio.js';
import { burst, emit } from './particles.js';

const SHELL_SLOTS = 6;
const ENTER_SPEED = 60;
const SHELL_SPREAD = 40;
const CONTACT_TICK = 0.5;

export function spawnBoss(game) {
  const level = game.level;
  const def = BOSSES[level.boss] || BOSSES.boss_apc;
  const hp = bossHp(level.bossHp, game.levelNum);
  const shells = [];
  for (let i = 0; i < SHELL_SLOTS; i++) {
    shells.push({ active: false, x: 0, y: 0, t: 0, dur: 0 });
  }
  game.boss = {
    def,
    x: game.W / 2,
    y: -def.h,
    w: def.w,
    h: def.h,
    hp,
    maxHp: hp,
    dir: 1,
    entering: true,
    shellTimer: 0,
    shells,
    flash: 0,
    turret: 0,
    contactAcc: 0,
    contactTimer: 0,
  };
}

// Granaten-Volley: die erste Granate zielt exakt auf die Truppe, weitere mit Versatz.
function fireVolley(game, b) {
  const sq = game.squad;
  const n = b.def.shellsPerVolley;
  for (let k = 0; k < n; k++) {
    let s = null;
    for (let i = 0; i < b.shells.length; i++) {
      if (!b.shells[i].active) {
        s = b.shells[i];
        break;
      }
    }
    if (!s) return;
    s.active = true;
    s.t = 0;
    s.dur = BAL.BOSS_SHELL_TELEGRAPH;
    if (k === 0) {
      s.x = sq.x;
      s.y = game.SQUAD_Y;
    } else {
      let x = sq.x + (game.rng() * 2 - 1) * SHELL_SPREAD;
      if (x < 0) x = 0;
      else if (x > game.W) x = game.W;
      s.x = x;
      s.y = game.SQUAD_Y + (game.rng() * 2 - 1) * SHELL_SPREAD;
    }
  }
}

// Einschlag: Explosion; Truppe im Radius verliert einen Teil (gedeckelt).
function impact(game, x, y) {
  const sq = game.squad;
  audio.explosion(1);
  game.shake = Math.max(game.shake, 6);
  emit(game, 'flash', x, y, { size: 26, life: 0.15 });
  burst(game, 'debris', x, y, 8, { speed: 130 });
  burst(game, 'smoke', x, y, 5, { speed: 40, life: 0.8, size: 10 });

  const dx = x - sq.x;
  const dy = y - sq.y;
  const reach = BAL.BOSS_SHELL_RADIUS + sq.radius * 0.5;
  if (sq.count > 0 && Math.sqrt(dx * dx + dy * dy) < reach) {
    const n = Math.min(
      BAL.BOSS_SHELL_MAX_KILLS,
      Math.max(1, Math.ceil(sq.count * BAL.BOSS_SHELL_KILL_FRAC)),
    );
    game.loseSoldiers(n, sq.x, sq.y);
  }
}

// Boss-Update: Einfahrt, Pendeln, Vorrücken, Granaten, Kontakt. Ruft game.loseSoldiers.
export function updateBoss(game, dt) {
  const b = game.boss;
  if (!b) return;
  const def = b.def;
  const sq = game.squad;
  const W = game.W;

  b.flash *= Math.max(0, 1 - dt * 10);

  if (b.entering) {
    b.y += ENTER_SPEED * dt;
    if (b.y >= BAL.BOSS_STOP_Y) {
      b.y = BAL.BOSS_STOP_Y;
      b.entering = false;
    }
  } else {
    b.y += def.advance * dt;

    const minX = b.w / 2 + 10;
    const maxX = W - b.w / 2 - 10;
    b.x += b.dir * def.speed * dt;
    if (b.x <= minX) {
      b.x = minX;
      b.dir = 1;
    } else if (b.x >= maxX) {
      b.x = maxX;
      b.dir = -1;
    }

    b.shellTimer += dt;
    if (b.shellTimer >= def.shellInterval) {
      b.shellTimer = 0;
      fireVolley(game, b);
    }
  }

  // Geschützrohr zeigt zur Truppe (0 = nach unten).
  b.turret = Math.atan2(sq.x - b.x, sq.y - b.y);

  for (let i = 0; i < b.shells.length; i++) {
    const s = b.shells[i];
    if (!s.active) continue;
    s.t += dt;
    if (s.t >= s.dur) {
      s.active = false;
      impact(game, s.x, s.y);
    }
  }

  // Kontakt: Boss berührt die Truppe → 20 % pro Sekunde, mindestens 1 Soldat pro 0.5 s.
  const bottom = b.y + b.h / 2;
  if (bottom >= sq.y - sq.radius && sq.count > 0) {
    b.contactAcc += BAL.BOSS_CONTACT_LOSS_PER_SEC * sq.count * dt;
    b.contactTimer += dt;
    if (b.contactTimer >= CONTACT_TICK) {
      const n = Math.max(1, Math.round(b.contactAcc));
      b.contactAcc = 0;
      b.contactTimer = 0;
      game.loseSoldiers(n, sq.x, sq.y);
    }
  } else {
    b.contactAcc = 0;
    b.contactTimer = 0;
  }
}
