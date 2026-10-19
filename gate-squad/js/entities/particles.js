// Partikel (gepoolt): Funken, Rauch, Mündungsfeuer, Trümmer, Schwebetexte, Ringe, Hülsen.
// Arbeitet auf `game` (game.particles = Pool, game.particleCount = Budget-Zähler).
import { CFG } from '../config.js';

const NO_OPTS = {};
const GRAVITY = 420;

const DEFAULTS = {
  spark: { life: 0.3, size: 2, color: '#ffd27a' },
  smoke: { life: 0.6, size: 6, color: '#9aa08e' },
  flash: { life: 0.08, size: 10, color: '#fff1a8' },
  debris: { life: 0.5, size: 3, color: '#5a5f4c' },
  text: { life: 0.9, size: 14, color: CFG.COLORS.text },
  ring: { life: 0.35, size: 8, color: CFG.COLORS.orange },
  casing: { life: 0.6, size: 2, color: '#c9b458' },
};

export function createParticle() {
  return {
    active: false, kind: 'spark', x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 0, size: 1, color: '#ffffff', text: '',
  };
}

// Einzelnes Partikel erzeugen. Respektiert das Partikel-Budget (CFG.POOL.particles).
export function emit(game, kind, x, y, opts) {
  if (game.particleCount >= CFG.POOL.particles) return null;
  const o = opts || NO_OPTS;
  const d = DEFAULTS[kind] || DEFAULTS.spark;
  const p = game.particles.get();
  game.particleCount++;
  p.kind = kind;
  p.x = x;
  p.y = y;
  p.vx = o.vx || 0;
  p.vy = o.vy || 0;
  p.life = o.life || d.life;
  p.maxLife = p.life;
  p.size = o.size || d.size;
  p.color = o.color || d.color;
  p.text = o.text || '';
  return p;
}

// n Partikel radial um (x, y). Nur bei Ereignissen aufrufen, nicht pro Frame.
export function burst(game, kind, x, y, n, opts) {
  const o = opts || NO_OPTS;
  const speed = o.speed || 120;
  const up = o.up || 0;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.35 + 0.65 * Math.random());
    emit(game, kind, x, y, {
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s + up,
      life: o.life,
      size: o.size,
      color: o.color,
    });
  }
}

// Schwebetext (steigt langsam auf und verblasst).
export function floatText(game, x, y, text, color) {
  return emit(game, 'text', x, y, { text, color, vy: -45, life: 0.9 });
}

export function updateParticles(game, dt) {
  const pool = game.particles;
  const items = pool.items;
  let alive = 0;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      pool.release(p);
      continue;
    }
    const k = p.kind;
    if (k !== 'text') {
      if (k === 'spark' || k === 'debris' || k === 'casing') {
        p.vy += GRAVITY * dt;
      } else if (k === 'smoke') {
        p.vy -= 6 * dt;
        p.size += 14 * dt;
      } else if (k === 'ring') {
        p.size += 60 * dt;
      }
      const drag = Math.max(0, 1 - 3 * dt);
      p.vx *= drag;
      p.vy *= drag;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    alive++;
  }
  game.particleCount = alive;
}
