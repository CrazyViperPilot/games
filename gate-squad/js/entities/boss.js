// Boss (Kampfpanzer): Einfahrt, Pendeln, Vorrücken, Turm mit begrenzter Drehgeschwindigkeit,
// Ziel-Laser → Schuss aus dem Rohr → sichtbare Granate zum Einschlagpunkt, Kontakt mit der Truppe.
import { BAL, bossHp } from '../data/balance.js';
import { BOSSES } from '../data/enemies.js';
import { audio } from '../core/audio.js';
import { burst, emit } from './particles.js';

const SHELL_SLOTS = 6;
const ENTER_SPEED = 140;
const CONTACT_TICK = 0.5;

export function spawnBoss(game) {
  const level = game.level;
  const def = BOSSES[level.boss] || BOSSES.boss_apc;
  const hp = bossHp(level.bossHp, game.levelNum);
  const shells = [];
  for (let i = 0; i < SHELL_SLOTS; i++) {
    shells.push({ active: false, sx: 0, sy: 0, x: 0, y: 0, t: 0, dur: 0 });
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
    shellTimer: def.shellInterval - BAL.BOSS_FIRST_SHOT - BAL.BOSS_AIM_TIME,
    shells,
    flash: 0,
    turret: Math.PI / 2,
    recoil: 0,
    aiming: 0,
    aimX: game.W / 2,
    aimY: game.SQUAD_Y,
    track: 0,
    volleyLeft: 0,
    volleyGap: 0,
    contactAcc: 0,
    contactTimer: 0,
  };
}

// Rohrspitze in Weltkoordinaten (Turm-Mitte = Boss-Mitte, Rohrlänge BAL.BOSS_BARREL·h).
export function bossMuzzle(b, out) {
  const len = b.h * BAL.BOSS_BARREL;
  out.x = b.x + Math.cos(b.turret) * len;
  out.y = turretY(b) + Math.sin(b.turret) * len;
  return out;
}

const _m = { x: 0, y: 0 };

function turretY(b) {
  return b.y + BAL.BOSS_TURRET_DY * b.h;
}

// Kleinster Winkelabstand a − b im Bereich (−π, π].
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Ein Schuss: Granate fliegt sichtbar vom Rohr zum (beim Zielen eingefrorenen) Zielpunkt.
function fireShell(game, b, offset) {
  let s = null;
  for (let i = 0; i < b.shells.length; i++) {
    if (!b.shells[i].active) {
      s = b.shells[i];
      break;
    }
  }
  if (!s) return;
  bossMuzzle(b, _m);
  let tx = b.aimX + offset;
  if (tx < 10) tx = 10;
  else if (tx > game.W - 10) tx = game.W - 10;
  s.active = true;
  s.sx = _m.x;
  s.sy = _m.y;
  s.x = tx;
  s.y = b.aimY;
  s.t = 0;
  const dx = s.x - s.sx;
  const dy = s.y - s.sy;
  s.dur = Math.max(0.2, Math.sqrt(dx * dx + dy * dy) / BAL.BOSS_SHELL_SPEED);
  b.recoil = 1;
  game.shake = Math.max(game.shake, 3);
  emit(game, 'flash', _m.x, _m.y, { size: 22, life: 0.12 });
  burst(game, 'smoke', _m.x, _m.y, 4, { speed: 50, life: 0.6, size: 8 });
  audio.shot('m82');
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

// Feuerzyklus: Zielen (Laser, Ziel folgt der Truppe) → Ziel einfrieren → Salve sobald der Turm ausgerichtet ist.
function updateFiring(game, b, dt) {
  const def = b.def;
  const sq = game.squad;
  b.shellTimer += dt;

  if (b.volleyLeft > 0) {
    b.volleyGap -= dt;
    if (b.volleyGap <= 0) {
      const k = def.shellsPerVolley - b.volleyLeft;
      const off = k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2) * BAL.BOSS_VOLLEY_SPREAD;
      fireShell(game, b, off);
      b.volleyLeft--;
      b.volleyGap = BAL.BOSS_VOLLEY_GAP;
    }
    return;
  }

  const aimStart = def.shellInterval - BAL.BOSS_AIM_TIME;
  if (b.shellTimer < aimStart) {
    b.aiming = 0;
    return;
  }
  b.aiming = Math.min(1, ((b.shellTimer - aimStart) / BAL.BOSS_AIM_TIME) * 1.5);
  if (b.shellTimer < def.shellInterval - BAL.BOSS_AIM_LOCK) {
    b.aimX = sq.x;
    b.aimY = game.SQUAD_Y;
  }
  const want = Math.atan2(b.aimY - turretY(b), b.aimX - b.x);
  if (b.shellTimer >= def.shellInterval && Math.abs(angleDiff(want, b.turret)) < 0.12) {
    b.shellTimer = 0;
    b.aiming = 0;
    b.volleyLeft = def.shellsPerVolley;
    b.volleyGap = 0;
  }
}

// Boss-Update: Einfahrt, Pendeln, Vorrücken, Turm, Granaten, Kontakt. Ruft game.loseSoldiers.
export function updateBoss(game, dt) {
  const b = game.boss;
  if (!b) return;
  const def = b.def;
  const sq = game.squad;
  const W = game.W;

  b.flash *= Math.max(0, 1 - dt * 10);
  b.recoil *= Math.max(0, 1 - dt * 4);

  if (b.entering) {
    b.y += ENTER_SPEED * dt;
    b.track += ENTER_SPEED * dt;
    const stopY = game.SQUAD_Y - BAL.BOSS_STOP_DIST;
    if (b.y >= stopY) {
      b.y = stopY;
      b.entering = false;
    }
  } else {
    b.y += def.advance * dt;
    game.bossFight += dt;

    const minX = b.w / 2 + 10;
    const maxX = W - b.w / 2 - 10;
    b.x += b.dir * def.speed * dt;
    b.track += (def.speed + def.advance) * dt;
    if (b.x <= minX) {
      b.x = minX;
      b.dir = 1;
    } else if (b.x >= maxX) {
      b.x = maxX;
      b.dir = -1;
    }
    updateFiring(game, b, dt);
  }

  // Turm dreht mit begrenzter Geschwindigkeit: beim Zielen zum Ziel, sonst zur Truppe.
  const locked = b.aiming > 0 || b.volleyLeft > 0;
  const tx = locked ? b.aimX : sq.x;
  const ty = locked ? b.aimY : game.SQUAD_Y;
  const diff = angleDiff(Math.atan2(ty - turretY(b), tx - b.x), b.turret);
  const step = BAL.BOSS_TURRET_SPEED * dt;
  b.turret += diff > step ? step : diff < -step ? -step : diff;

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
