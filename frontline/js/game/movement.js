// Bewegung: Wegfolgen, Verfolgung, LKW-Bau-Ankunft und Trennung (PLAN.md §5). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { findPath } from './pathfinding.js';
import { inRange } from './entities.js';

const REPATH = 1.0; // Neuplanung bei Verfolgung (s)
const BLOCK_REPATH = 0.5; // Neuplanung nach blockiertem Wegpunkt (s)
const FOB_REACH = 48; // LKW gilt als am Ziel
const ARRIVE = 0.5; // Wegpunkt erreicht (px)
const FINAL_ARRIVE = 32; // Endziel erreicht (px): Einheiten am selben Sammelpunkt drängeln sich sonst ewig in 'move'
export const HASH_CELL = 128; // räumliches Hash-Gitter

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Plant den Weg einer Einheit zu (x, y) neu. */
export function planPath(game, u, x, y) {
  u.goalX = x;
  u.goalY = y;
  u.path = findPath(game.grid, u.x, u.y, x, y, u.team);
  u.pathIndex = 0;
}

/** Setzt eine Einheit auf idle; Ankerpunkt = aktuelle Position. */
export function setIdle(u) {
  u.order = { type: 'idle', x: u.x, y: u.y, targetId: null };
  u.anchorX = u.x;
  u.anchorY = u.y;
  u.targetId = null;
  u.path = [];
  u.pathIndex = 0;
}

/** Nächste passierbare Zellmitte für `team` (Ringsuche). null, wenn keine gefunden. */
export function nearestPassable(grid, x, y, team) {
  const c0 = grid.toCell(x);
  const r0 = grid.toCell(y);
  if (grid.passable(c0, r0, team)) return { x, y };
  for (let rad = 1; rad <= 30; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        if (grid.passable(c0 + dc, r0 + dr, team)) {
          return { x: grid.center(c0 + dc), y: grid.center(r0 + dr) };
        }
      }
    }
  }
  return null;
}

function hashKey(c, r) {
  return c * 100003 + r;
}

/** Hash-Gitter: Map Zellschlüssel -> Liste der Entities (Position zum Aufbauzeitpunkt). */
export function buildHash(list, cell = HASH_CELL) {
  const m = new Map();
  for (const e of list) {
    const k = hashKey(Math.floor(e.x / cell), Math.floor(e.y / cell));
    let arr = m.get(k);
    if (!arr) {
      arr = [];
      m.set(k, arr);
    }
    arr.push(e);
  }
  return m;
}

/** Alle Entities im Hash, deren Zelle den Kreis (x, y, r) berührt (Kandidaten, noch nicht geprüft). */
export function nearby(hash, x, y, r, cell = HASH_CELL) {
  const out = [];
  const c0 = Math.floor((x - r) / cell);
  const c1 = Math.floor((x + r) / cell);
  const r0 = Math.floor((y - r) / cell);
  const r1 = Math.floor((y + r) / cell);
  for (let c = c0; c <= c1; c++) {
    for (let rr = r0; rr <= r1; rr++) {
      const arr = hash.get(hashKey(c, rr));
      if (arr) for (const e of arr) out.push(e);
    }
  }
  return out;
}

/** Verschiebt nur, wenn die Zielzelle für das Team passierbar ist. */
function tryMove(grid, u, x, y) {
  if (grid.passable(grid.toCell(x), grid.toCell(y), u.team)) {
    u.x = x;
    u.y = y;
    return true;
  }
  return false;
}

/** Ein Schritt Richtung (tx, ty) um höchstens `step`; gleitet notfalls an einer Achse entlang. */
function stepToward(grid, u, tx, ty, step) {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return true;
  u.angle = Math.atan2(dy, dx);
  const nx = u.x + (dx / d) * step;
  const ny = u.y + (dy / d) * step;
  if (tryMove(grid, u, nx, ny)) return true;
  if (tryMove(grid, u, nx, u.y)) return true;
  return tryMove(grid, u, u.x, ny);
}

/** Folgt dem Weg mit Tempo `speed * dt`. false, wenn ein Wegpunkt blockiert ist (neu planen). */
function followPath(game, u, dt) {
  const grid = game.grid;
  let budget = u.def.speed * dt;
  while (budget > 1e-9 && u.pathIndex < u.path.length) {
    const wp = u.path[u.pathIndex];
    if (!grid.passable(grid.toCell(wp.x), grid.toCell(wp.y), u.team)) return false;
    const arrive = u.pathIndex === u.path.length - 1 ? FINAL_ARRIVE : ARRIVE;
    const d = dist(wp.x, wp.y, u.x, u.y);
    if (d < arrive) {
      u.pathIndex++;
      continue;
    }
    const step = Math.min(d, budget);
    if (!stepToward(grid, u, wp.x, wp.y, step)) return false;
    budget -= step;
    if (dist(wp.x, wp.y, u.x, u.y) < arrive) u.pathIndex++;
  }
  return true;
}

function replanBlocked(game, u) {
  if (u.repathTimer > 0) return;
  planPath(game, u, u.goalX, u.goalY);
  u.repathTimer = BLOCK_REPATH;
}

/** Verfolgung eines Ziels: stehen bleiben in Reichweite, sonst Weg höchstens 1×/s neu planen. */
function chase(game, u, t, dt) {
  if (u.def.range > 0 && inRange(u, t, u.def.range)) {
    if (u.path.length) {
      u.path = [];
      u.pathIndex = 0;
    }
    return;
  }
  if (u.repathTimer <= 0) {
    planPath(game, u, t.x, t.y);
    u.repathTimer = REPATH;
  }
  if (u.pathIndex < u.path.length && !followPath(game, u, dt)) replanBlocked(game, u);
}

/** LKW mit Befehl buildFob: am Ziel (≤ 48 px) Gebäude errichten, sonst weiterfahren. */
function stepTruck(game, u, dt) {
  const o = u.order;
  const atTarget = () => dist(o.x, o.y, u.x, u.y) <= FOB_REACH;
  if (atTarget()) {
    game.finishFob(u);
    return;
  }
  if (u.pathIndex < u.path.length && !followPath(game, u, dt)) replanBlocked(game, u);
  if (atTarget()) {
    game.finishFob(u);
    return;
  }
  if (u.pathIndex >= u.path.length) game.abortFob(u, 'Ziel nicht erreichbar');
}

function stepUnit(game, u, dt) {
  const o = u.order;
  if (o.type === 'attack') {
    const t = game.getEntity(o.targetId);
    if (!t || t.team === u.team) {
      setIdle(u);
      return;
    }
    chase(game, u, t, dt);
    return;
  }
  if (o.type === 'buildFob') {
    stepTruck(game, u, dt);
    return;
  }

  // Automatisch gewähltes Ziel (idle / attackMove)
  if (u.targetId !== null) {
    const t = game.getEntity(u.targetId);
    const leashed = o.type === 'idle' && t && dist(t.x, t.y, u.anchorX, u.anchorY) > BALANCE.leash;
    if (t && t.team !== u.team && !leashed) {
      chase(game, u, t, dt);
      return;
    }
    // Ziel verloren: zurück zum Befehl bzw. zum Ankerpunkt
    u.targetId = null;
    if (o.type === 'attackMove') planPath(game, u, o.x, o.y);
    else if (o.type === 'idle') planPath(game, u, u.anchorX, u.anchorY);
  }

  if (u.pathIndex < u.path.length && !followPath(game, u, dt)) replanBlocked(game, u);
  if (u.pathIndex >= u.path.length && (o.type === 'move' || o.type === 'attackMove')) setIdle(u);
}

// Trennung: überlappende Einheiten auseinanderschieben, nie in unpassierbare Zellen.
function resolvePair(grid, a, b) {
  const rs = a.def.radius + b.def.radius;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rs * rs) return;
  const d = Math.sqrt(d2);
  let nx;
  let ny;
  if (d < 1e-6) {
    const ang = ((a.id * 37 + b.id * 91) % 360) * (Math.PI / 180);
    nx = Math.cos(ang);
    ny = Math.sin(ang);
  } else {
    nx = dx / d;
    ny = dy / d;
  }
  const push = (rs - d) / 2;
  tryMove(grid, a, a.x - nx * push, a.y - ny * push);
  tryMove(grid, b, b.x + nx * push, b.y + ny * push);
}

function separate(game) {
  const grid = game.grid;
  const list = game.units.filter((u) => u.alive);

  // Einheiten in unpassierbaren Zellen (z. B. durch neue Gebäude) zur nächsten freien Zelle schieben
  for (const u of list) {
    if (!grid.passable(grid.toCell(u.x), grid.toCell(u.y), u.team)) {
      const p = nearestPassable(grid, u.x, u.y, u.team);
      if (p) {
        u.x = p.x;
        u.y = p.y;
      }
    }
  }

  const hash = buildHash(list);
  for (const a of list) {
    for (const b of nearby(hash, a.x, a.y, HASH_CELL)) {
      if (b.id <= a.id || !b.alive) continue;
      resolvePair(grid, a, b);
    }
  }
}

/** Bewegt alle Einheiten um dt und trennt sie danach. */
export function updateMovement(game, dt) {
  for (const u of game.units) {
    if (!u.alive) continue;
    u.repathTimer = Math.max(0, u.repathTimer - dt);
    stepUnit(game, u, dt);
  }
  separate(game);
}
