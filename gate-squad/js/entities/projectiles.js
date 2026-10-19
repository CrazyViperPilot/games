// Spieler-Kugeln, Granaten und Gegner-Kugeln (alle gepoolt). Arbeiten auf `game`.
import { BAL } from '../data/balance.js';
import { audio } from '../core/audio.js';
import { burst, emit } from './particles.js';
import { hitGate } from './gates.js';
import { hitCrate } from './crates.js';

// hitId-Marker: Kugel hat den Boss bereits getroffen (Gegner-uids sind immer > 0).
const BOSS_UID = -2;

// Kollisionsreihenfolge pro Kugel: Tore → Kisten → Boss → Gegner.
export function updateBullets(game, dt) {
  const pool = game.bullets;
  const items = pool.items;
  const gates = game.gates;
  const crates = game.crates;
  const enemies = game.enemies.items;

  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    if (!b.active) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.y < -20) {
      pool.release(b);
      continue;
    }

    // (1) Tore: Kugel lädt das Tor einmal auf (gateRow merkt die Reihe) und fliegt mit
    //     BAL.GATE_PASS_DMG weiter – Gegner hinter Toren bleiben angreifbar.
    for (let g = 0; g < gates.length; g++) {
      const gate = gates[g];
      if (gate.used || (gate.kind === 'weapon' && !gate.locked) || b.gateRow === gate.row) continue;
      if (b.x >= gate.x && b.x <= gate.x + gate.w &&
          b.y >= gate.y - gate.h / 2 && b.y <= gate.y + gate.h / 2) {
        hitGate(game, gate, b.dmg);
        b.gateRow = gate.row;
        b.dmg *= BAL.GATE_PASS_DMG;
        break;
      }
    }

    // (2) Kisten (Kreis) blockieren die Kugel
    let done = false;
    for (let c = 0; c < crates.length && !done; c++) {
      const cr = crates[c];
      if (cr.opened) continue;
      const dx = b.x - cr.x;
      const dy = b.y - cr.y;
      if (dx * dx + dy * dy < cr.r * cr.r) {
        hitCrate(game, cr, b.dmg);
        done = true;
      }
    }
    if (done) {
      pool.release(b);
      continue;
    }

    // (3) Boss (Rechteck; nicht solange er mit y < 0 einfährt)
    const boss = game.boss;
    if (boss && b.hitId !== BOSS_UID && !boss.entering &&
        Math.abs(b.x - boss.x) < boss.w / 2 && Math.abs(b.y - boss.y) < boss.h / 2) {
      boss.hp -= b.dmg;
      boss.flash = 1;
      emit(game, 'spark', b.x, b.y);
      if (b.pierce > 0) {
        b.pierce--;
        b.hitId = BOSS_UID;
      } else {
        pool.release(b);
        continue;
      }
    }

    // (4) Gegner (Kreis). Kugeln fliegen nach oben: Gegner unterhalb der Kugel werden übersprungen.
    for (let e = 0; e < enemies.length; e++) {
      const en = enemies[e];
      if (!en.active || en.uid === b.hitId) continue;
      if (en.y > b.y + en.r + 6) continue;
      const dx = b.x - en.x;
      const dy = b.y - en.y;
      const rr = en.r + 2;
      if (dx * dx + dy * dy > rr * rr) continue;

      en.flash = 1;
      if (en.shield > 0 && b.vy < 0) {
        // Schild frontal: schluckt die Kugel, Schaden nur auf den Schild.
        en.shield = Math.max(0, en.shield - b.dmg);
        burst(game, 'spark', b.x, b.y, 4, { speed: 140 });
        audio.hit();
        done = true;
      } else {
        en.hp -= b.dmg;
        emit(game, 'spark', b.x, b.y);
        if (en.hp <= 0) game.killEnemy(en);
        if (b.pierce > 0) {
          b.pierce--;
          b.hitId = en.uid;
        } else {
          done = true;
        }
      }
      break;
    }
    if (done) pool.release(b);
  }
}

// Granaten fliegen auf ihr Ziel (Bogen wird vom Renderer aus t/dur gezeichnet) und explodieren.
export function updateGrenades(game, dt) {
  const pool = game.grenades;
  const items = pool.items;
  for (let i = 0; i < items.length; i++) {
    const g = items[i];
    if (!g.active) continue;
    g.t += dt;
    const p = g.t / g.dur;
    if (p >= 1) {
      explodeGrenade(game, g);
      pool.release(g);
      continue;
    }
    g.x = g.x0 + (g.tx - g.x0) * p;
    g.y = g.y0 + (g.ty - g.y0) * p;
  }
}

// Flächenschaden. Ignoriert Schilde (nur HP), trifft den Boss, wenn sein Rechteck im Radius liegt.
function explodeGrenade(game, g) {
  const r = g.radius;
  const items = game.enemies.items;
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    if (!e.active) continue;
    const dx = e.x - g.tx;
    const dy = e.y - g.ty;
    const rr = r + e.r;
    if (dx * dx + dy * dy < rr * rr) {
      e.hp -= g.dmg;
      e.flash = 1;
      if (e.hp <= 0) game.killEnemy(e);
    }
  }
  const boss = game.boss;
  if (boss && Math.abs(boss.x - g.tx) < boss.w / 2 + r && Math.abs(boss.y - g.ty) < boss.h / 2 + r) {
    boss.hp -= g.dmg;
    boss.flash = 1;
  }

  burst(game, 'debris', g.tx, g.ty, 10, { speed: 160 });
  burst(game, 'smoke', g.tx, g.ty, 6, { speed: 50, life: 0.7, size: 10 });
  emit(game, 'ring', g.tx, g.ty, { size: 8, life: 0.35 });
  emit(game, 'flash', g.tx, g.ty, { size: 30, life: 0.12 });
  audio.explosion(0.8);
  game.shake = Math.max(game.shake, 4);
}

// Gegner-Kugeln (Scharfschütze): treffen die Truppe → 1 Soldat weniger.
export function updateEnemyBullets(game, dt) {
  const pool = game.enemyBullets;
  const items = pool.items;
  const sq = game.squad;
  const sqY = game.SQUAD_Y;
  const H = game.H;
  const r2 = sq.radius * sq.radius;
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    if (!b.active) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y > H + 20) {
      pool.release(b);
      continue;
    }
    const dx = b.x - sq.x;
    const dy = b.y - sqY;
    if (dx * dx + dy * dy < r2) {
      game.loseSoldiers(1, b.x, b.y);
      pool.release(b);
    }
  }
}
