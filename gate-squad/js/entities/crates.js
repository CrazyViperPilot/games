// Attachment-Kisten: werden beschossen oder von der Truppe berührt und geben ein Attachment.
import { crateHp } from '../data/balance.js';
import { burst, emit } from './particles.js';
import { addAttachment } from './squad.js';

const SPAWN_Y = -40;
const RADIUS = 15;

export function spawnCrate(game, ev) {
  const hp = crateHp(game.levelNum);
  game.crates.push({
    x: (ev.x !== undefined ? ev.x : 0.5) * game.W,
    y: SPAWN_Y,
    r: RADIUS,
    hp,
    maxHp: hp,
    opened: false,
    flash: 0,
  });
}

function openCrate(game, c) {
  c.opened = true;
  c.hp = 0;
  burst(game, 'debris', c.x, c.y, 8, { speed: 140 });
  burst(game, 'smoke', c.x, c.y, 4, { speed: 40, life: 0.6, size: 8 });
  emit(game, 'ring', c.x, c.y, { size: 10, life: 0.3 });
  addAttachment(game);
}

// Schaden durch Kugel; bei hp ≤ 0 wird die Kiste geöffnet (Attachment sofort aktiv).
export function hitCrate(game, c, dmg) {
  if (c.opened) return;
  c.flash = 1;
  c.hp -= dmg;
  if (c.hp <= 0) openCrate(game, c);
}

// Kisten scrollen mit objSpeed; Truppe läuft hinein → ebenfalls geöffnet. Entfernt geöffnete/ausgelaufene.
export function updateCrates(game, dt) {
  const crates = game.crates;
  const sq = game.squad;
  const sqY = game.SQUAD_Y;
  const speed = game.objSpeed;
  for (let i = crates.length - 1; i >= 0; i--) {
    const c = crates[i];
    c.y += speed * dt;
    c.flash *= Math.max(0, 1 - dt * 10);
    if (!c.opened) {
      const dx = c.x - sq.x;
      const dy = c.y - sqY;
      const rr = sq.radius + c.r;
      if (dx * dx + dy * dy < rr * rr) openCrate(game, c);
    }
    if (c.opened || c.y > game.H + 60) crates.splice(i, 1);
  }
}
