// AABB-Kollision gegen Kacheln (PLAN §5).
// Achtung: Das Ergebnisobjekt und hitHead werden wiederverwendet; sie gelten nur bis zum nächsten Aufruf.
import { PHYS } from '../data/physics.js';
import { TILE_BY_ID } from '../data/tiles.js';

const T = PHYS.tile;
const E = 1e-6;

const RESULT = { hitHead: null, onGround: false, hitWall: 0 };
const HEAD = { c: 0, r: 0 };

// Ist der Körper an dieser Position in einer festen Kachel?
function blocked(map, x, y, w, h) {
  const c0 = Math.floor(x / T), c1 = Math.floor((x + w - E) / T);
  const r0 = Math.floor(y / T), r1 = Math.floor((y + h - E) / T);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (TILE_BY_ID[map.get(c, r)].solid) return true;
    }
  }
  return false;
}

// Kopfstoß nah an einer Blockkante: seitliche Korrektur um wenige px, wenn das die Kante sauber freigibt.
function nudgeDelta(body, c) {
  const L = c * T, R = L + T;
  const left = body.x + body.w - L;   // Überlappung, wenn nach links geschoben wird
  const right = R - body.x;           // Überlappung, wenn nach rechts geschoben wird
  const k = PHYS.cornerNudge;
  if (left > 0 && left <= k && right > k) return -left;
  if (right > 0 && right <= k && left > k) return right;
  return 0;
}

// Steht der Körper auf einer festen Kachel oder einer Plattform ('=' von oben)?
function standing(body, map, c0, c1) {
  const bottom = body.y + body.h;
  const r = Math.floor((bottom + 1) / T);
  for (let c = c0; c <= c1; c++) {
    const info = TILE_BY_ID[map.get(c, r)];
    if (info.solid) return true;
    if (info.oneWay && bottom <= r * T + 0.01) return true;
  }
  return false;
}

// body = { x, y, w, h, vx, vy } (x, y = linke obere Ecke). Verändert x, y, vx, vy des Körpers.
// Ergebnis: { hitHead: {c,r}|null, onGround, hitWall: -1|0|1 }. hitWall: 1 = Wand rechts, -1 = Wand links.
// Blockierte Achsen setzen die Geschwindigkeit auf 0.
export function moveAndCollide(body, map, dt) {
  const w = body.w, h = body.h;
  RESULT.hitHead = null;
  RESULT.hitWall = 0;
  RESULT.onGround = false;

  // ---- X ----
  const dx = body.vx * dt;
  if (dx !== 0) {
    const r0 = Math.floor(body.y / T), r1 = Math.floor((body.y + h - E) / T);
    if (dx > 0) {
      const right = body.x + w;
      const kLo = Math.ceil(right / T - E), kHi = Math.floor((right + dx) / T + E);
      outerR: for (let k = kLo; k <= kHi; k++) {
        for (let r = r0; r <= r1; r++) {
          if (TILE_BY_ID[map.get(k, r)].solid) {
            body.x = k * T - w;
            body.vx = 0;
            RESULT.hitWall = 1;
            break outerR;
          }
        }
      }
    } else {
      const left = body.x;
      const kHi = Math.floor(left / T + E), kLo = Math.ceil((left + dx) / T - E);
      outerL: for (let m = kHi; m >= kLo; m--) {
        for (let r = r0; r <= r1; r++) {
          if (TILE_BY_ID[map.get(m - 1, r)].solid) {
            body.x = m * T;
            body.vx = 0;
            RESULT.hitWall = -1;
            break outerL;
          }
        }
      }
    }
    if (RESULT.hitWall === 0) body.x += dx;
  }

  // ---- Y ----
  const c0 = Math.floor(body.x / T), c1 = Math.floor((body.x + w - E) / T);
  const dy = body.vy * dt;
  let landed = false;
  if (dy > 0) {
    const ob = body.y + h, nb = ob + dy;
    const kLo = Math.ceil(ob / T - E), kHi = Math.floor(nb / T + E);
    outerD: for (let k = kLo; k <= kHi; k++) {
      for (let c = c0; c <= c1; c++) {
        const info = TILE_BY_ID[map.get(c, k)];
        // Plattform '=' nur, wenn die Unterkante vorher darüber lag (k*T >= ob, ist hier immer erfüllt).
        if (info.solid || info.oneWay) {
          body.y = k * T - h;
          body.vy = 0;
          landed = true;
          break outerD;
        }
      }
    }
    if (!landed) body.y += dy;
  } else if (dy < 0) {
    const ot = body.y, nt = ot + dy;
    let moveUp = true;
    const kHi = Math.floor(ot / T + E), kLo = Math.ceil(nt / T - E);
    outerU: for (let k = kHi; k >= kLo; k--) {
      for (let c = c0; c <= c1; c++) {
        if (TILE_BY_ID[map.get(c, k - 1)].solid) {
          const d = nudgeDelta(body, c);
          if (d !== 0 && !blocked(map, body.x + d, nt, w, h)) {
            body.x += d;            // Kante freigegeben, Aufstieg geht weiter
          } else {
            body.y = k * T;
            body.vy = 0;
            HEAD.c = c;
            HEAD.r = k - 1;
            RESULT.hitHead = HEAD;
            moveUp = false;
          }
          break outerU;
        }
      }
    }
    if (moveUp) body.y = nt;
  }

  if (landed) {
    RESULT.onGround = true;
  } else if (body.vy >= 0) {
    RESULT.onGround = standing(body, map, c0, c1);
  }
  return RESULT;
}
