// Explosionen, TNT-Zündung und TNT-Timer (PLAN §6; PRD §5). Radien in Kacheln, Positionen in px (Mittelpunkt).
// Mob, Boss und Spieler: Körper als linke obere Ecke (x, y) mit w, h; im Kreis zählt der Mittelpunkt.
import { PHYS } from '../data/physics.js';
import { TILE_IDS } from '../data/tiles.js';
import { breakTile } from './dig.js';

const T = PHYS.tile;
const AIR_ID = TILE_IDS.air;
const TNT_ID = TILE_IDS.tnt;
const TNT_SLOTS = 8;
const TNT_RADIUS = 2.5;       // Kacheln, Explosion eines gezündeten TNT
const TNT_CHAIN_FUSE = 0.5;   // s Zündschnur für TNT in Reichweite einer Explosion
const SHAKE = 0.3;

function tntPool(game) {
  if (!game.tnt) {
    game.tnt = Array.from({ length: TNT_SLOTS }, () => ({ active: false, x: 0, y: 0, timer: 0, fuse: 0 }));
  }
  return game.tnt;
}

// Liegt der Punkt (px) innerhalb des Kreises mit Mittelpunkt (x, y) und quadrierten Radius r2?
function inside(px, py, x, y, r2) {
  const dx = px - x;
  const dy = py - y;
  return dx * dx + dy * dy <= r2;
}

// Explosion an (x, y) in px mit Radius radiusTiles (Kacheln). Schreibt nur über game-Methoden und game.map.
export function explode(game, x, y, radiusTiles) {
  const map = game.map;
  const R = radiusTiles * T;
  const R2 = R * R;
  const cMin = Math.max(0, Math.floor((x - R) / T));
  const cMax = Math.min(map.cols - 1, Math.floor((x + R) / T));
  const rMin = Math.max(0, Math.floor((y - R) / T));
  const rMax = Math.min(map.rows - 1, Math.floor((y + R) / T));

  // Kacheln: TNT zündet nur, alles andere bricht (breakTile lässt Obsidian und Grundgestein stehen).
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      if (!inside((c + 0.5) * T, (r + 0.5) * T, x, y, R2)) continue;
      const id = map.get(c, r);
      if (id === AIR_ID) continue;
      if (id === TNT_ID) igniteTnt(game, c, r, TNT_CHAIN_FUSE);
      else breakTile(game, c, r, 'explosion');
    }
  }

  // Mobs: lebende aktive Mobs im Kreis sterben. Zischer lösen dabei keine weitere Explosion aus.
  const mobs = game.mobs || [];
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (!m.active || m.state === 'dead') continue;
    if (inside(m.x + m.w / 2, m.y + m.h / 2, x, y, R2)) game.killMob(m, 'explosion');
  }

  // Boss: nur Schaden, wenn sein Mittelpunkt im Kreis liegt.
  const b = game.boss;
  if (b && b.active && b.state !== 'defeated' && inside(b.x + b.w / 2, b.y + b.h / 2, x, y, R2)) {
    game.damageBoss?.('explosion');
  }

  // Spieler: verletzt, außer unverwundbar oder mit Stern.
  const p = game.player;
  if (p && !p.dead && !(p.invuln > 0) && !(p.star > 0) && inside(p.x + p.w / 2, p.y + p.h / 2, x, y, R2)) {
    game.hurtPlayer('explosion');
  }

  game.spawnSmoke?.(x, y);
  game.shake = Math.max(game.shake || 0, SHAKE);
  game.emit('explode', { x, y });
}

// Zündet TNT auf (c, r): Kachel wird Luft, Eintrag im TNT-Pool. Ist der Pool voll, explodiert es sofort.
export function igniteTnt(game, c, r, fuse = 2.0) {
  const map = game.map;
  if (map.get(c, r) !== TNT_ID) return;
  map.set(c, r, AIR_ID);
  game.markDirty(c, r);
  game.lightDirty = true;

  const x = (c + 0.5) * T;
  const y = (r + 0.5) * T;
  const pool = tntPool(game);
  let slot = null;
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) { slot = pool[i]; break; }
  }
  if (!slot) {
    explode(game, x, y, TNT_RADIUS);
    return;
  }
  slot.active = true;
  slot.x = x;
  slot.y = y;
  slot.timer = fuse;
  slot.fuse = fuse;
  game.emit('fuse');
}

// Zählt die Zündschnüre herunter; abgelaufenes TNT explodiert.
export function updateTnt(game, dt) {
  const pool = game.tnt;
  if (!pool) return;
  for (let i = 0; i < pool.length; i++) {
    const t = pool[i];
    if (!t.active) continue;
    t.timer -= dt;
    if (t.timer <= 0) {
      t.active = false;
      explode(game, t.x, t.y, TNT_RADIUS);
    }
  }
}
