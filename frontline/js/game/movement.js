// Bewegung: Wegfolgen, Verfolgung, Fahrhelfer für LKW/Bauer und Trennung (PLAN.md §5, §11). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { findPath, lineOfSight } from './pathfinding.js';
import { inRange } from './entities.js';

const REPATH = 1.0; // Neuplanung bei Verfolgung (s)
const BLOCK_REPATH = 0.5; // Neuplanung nach blockiertem Wegpunkt (s)
const ARRIVE = 0.5; // Wegpunkt erreicht (px)
const FINAL_ARRIVE = 32; // Endziel erreicht (px): Einheiten am selben Sammelpunkt drängeln sich sonst ewig in 'move'
const CORNER = 48; // nahe einer Wegecke: bei freier Sicht gleich zum nächsten Wegpunkt (sonst Stau an der Ecke)
export const HASH_CELL = 128; // räumliches Hash-Gitter
const TILE = BALANCE.map.tile;

/** Aufträge, die logistics.js und construction.js selbst fahren (updateMovement lässt sie aus). */
export const OWN_DRIVERS = new Set(['load', 'unload', 'route', 'build', 'repair', 'board', 'dropoff']);

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Plant den Weg einer Einheit zu (x, y) neu. */
export function planPath(game, u, x, y) {
  u.goalX = x;
  u.goalY = y;
  if (u.def.air) {
    u.path = [{ x, y }]; // Hubschrauber fliegen geradeaus
    u.pathIndex = 0;
    return;
  }
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

/** Abstand Punkt → Fußabdruck eines Gebäudes (0 innerhalb). */
export function footDist(x, y, b) {
  const x0 = b.cx * TILE;
  const y0 = b.cy * TILE;
  const dx = Math.max(x0 - x, 0, x - (x0 + b.w * TILE));
  const dy = Math.max(y0 - y, 0, y - (y0 + b.h * TILE));
  return Math.hypot(dx, dy);
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

/** Folgt dem Weg mit Tempo `speed * speedMul * dt`. false, wenn ein Wegpunkt blockiert ist (neu planen). */
/** Flug: geradeaus zum Wegpunkt, ohne Gelände- oder Gebäudeprüfung. */
function followAir(u, dt) {
  let budget = u.def.speed * u.speedMul * dt;
  while (budget > 1e-9 && u.pathIndex < u.path.length) {
    const wp = u.path[u.pathIndex];
    const d = dist(wp.x, wp.y, u.x, u.y);
    const arrive = u.pathIndex === u.path.length - 1 ? FINAL_ARRIVE : ARRIVE;
    if (d < arrive) {
      u.pathIndex++;
      continue;
    }
    const step = Math.min(d, budget);
    u.angle = Math.atan2(wp.y - u.y, wp.x - u.x);
    u.x += ((wp.x - u.x) / d) * step;
    u.y += ((wp.y - u.y) / d) * step;
    budget -= step;
    if (dist(wp.x, wp.y, u.x, u.y) < arrive) u.pathIndex++;
  }
  return true;
}

/**
 * Tempofaktor am Hang für eine Fahrt in Richtung (dx, dy): bergauf langsamer, bergab etwas schneller; Fahrzeuge spüren es
 * stärker als Infanterie. 1 auf flachen Karten und für Hubschrauber.
 */
export function slopeFactor(relief, u, dx, dy) {
  if (!relief || u.def.air) return 1;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return 1;
  const g = relief.gradAt(u.x, u.y);
  const grade = (g.x * dx + g.y * dy) / d; // > 0 bergauf
  const S = BALANCE.slope;
  const inf = u.def.armor === 'inf';
  const f = grade >= 0 ? 1 - grade * (inf ? S.upInf : S.upVeh) : 1 - grade * (inf ? S.downInf : S.downVeh);
  return Math.min(S.max, Math.max(S.min, f));
}

function followPath(game, u, dt) {
  if (u.def.air) return followAir(u, dt);
  const grid = game.grid;
  let budget = u.def.speed * u.speedMul * dt;
  if (game.relief && u.pathIndex < u.path.length) {
    const wp = u.path[u.pathIndex];
    budget *= slopeFactor(game.relief, u, wp.x - u.x, wp.y - u.y);
  }
  while (budget > 1e-9 && u.pathIndex < u.path.length) {
    const wp = u.path[u.pathIndex];
    if (!grid.passable(grid.toCell(wp.x), grid.toCell(wp.y), u.team)) return false;
    const final = u.pathIndex === u.path.length - 1;
    const d = dist(wp.x, wp.y, u.x, u.y);
    if (d < (final ? FINAL_ARRIVE : ARRIVE)) {
      u.pathIndex++;
      continue;
    }
    // Ecke abkürzen: drängeln sich viele Einheiten um denselben Eckpunkt, erreicht ihn sonst keine genau
    if (!final && d < CORNER) {
      const nx = u.path[u.pathIndex + 1];
      if (lineOfSight(grid, u.x, u.y, nx.x, nx.y, u.team)) {
        u.pathIndex++;
        continue;
      }
    }
    const step = Math.min(d, budget);
    if (!stepToward(grid, u, wp.x, wp.y, step)) return false;
    budget -= step;
    if (dist(wp.x, wp.y, u.x, u.y) < (final ? FINAL_ARRIVE : ARRIVE)) u.pathIndex++;
  }
  return true;
}

function replanBlocked(game, u) {
  if (u.repathTimer > 0) return;
  planPath(game, u, u.goalX, u.goalY);
  u.repathTimer = BLOCK_REPATH;
}

/**
 * Fährt einen Schritt auf dem geplanten Weg. Fahrzeuge verbrauchen Treibstoff aus u.fuel nur,
 * wenn sie sich wirklich bewegen; leer → Meldung (Tempo wird in updateMovement gesetzt).
 */
export function drive(game, u, dt) {
  const x0 = u.x;
  const y0 = u.y;
  const ok = followPath(game, u, dt);
  if (!ok) replanBlocked(game, u);
  const fps = u.def.fuelPerSec || 0;
  if (fps > 0 && (u.x !== x0 || u.y !== y0)) {
    if (u.fuel > 0) {
      const used = Math.min(u.fuel, fps * dt);
      u.fuel -= used;
      game.teams[u.team].used.fuel += used;
    }
    if (u.fuel <= 0) game.shortage(u.team, 'fuel');
  }
  return ok;
}

/**
 * Fährt zu (tx, ty), bis Abstand ≤ reach. Mit `bld` zählt der Abstand zum Fußabdruck des Gebäudes.
 * Liefert 'arrived' (Weg gelöscht), 'driving' oder 'stuck' (frische Planung ohne Weg).
 */
export function driveTo(game, u, tx, ty, reach, dt, bld = null) {
  if (bld ? footDist(u.x, u.y, bld) <= reach : dist(u.x, u.y, tx, ty) <= reach) {
    u.path = [];
    u.pathIndex = 0;
    return 'arrived';
  }
  const needPlan = u.goalX !== tx || u.goalY !== ty || u.pathIndex >= u.path.length;
  if (needPlan) {
    if (u.repathTimer > 0) return 'driving'; // Neuplanung gedrosselt
    planPath(game, u, tx, ty);
    u.repathTimer = REPATH;
    if (u.path.length === 0) return 'stuck';
  }
  if (u.pathIndex < u.path.length) drive(game, u, dt);
  if (bld ? footDist(u.x, u.y, bld) <= reach : dist(u.x, u.y, tx, ty) <= reach) {
    u.path = [];
    u.pathIndex = 0;
    return 'arrived';
  }
  return 'driving';
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
  if (u.pathIndex < u.path.length) drive(game, u, dt);
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

  if (u.pathIndex < u.path.length) drive(game, u, dt);
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

/** Trennung aller lebenden Einheiten (nach allen Bewegungsschritten eines Ticks aufrufen). */
export function separate(game) {
  const grid = game.grid;
  const list = game.units.filter((u) => u.alive && !u.def.air); // Hubschrauber schweben über allem

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

/**
 * Bewegt die Einheiten um dt (ohne LKW- und Bauaufträge; die fahren logistics.js bzw. construction.js).
 * Setzt Repath-Timer und Tempo (25 % bei Fahrzeugen ohne Treibstoff). Trennung: separate(game).
 */
export function updateMovement(game, dt) {
  for (const u of game.units) {
    if (!u.alive) continue;
    u.repathTimer = Math.max(0, u.repathTimer - dt);
    u.speedMul = (u.def.fuelPerSec || 0) > 0 && u.fuel <= 0 ? BALANCE.fuelSlowMul : 1;
    if (OWN_DRIVERS.has(u.order.type)) continue;
    stepUnit(game, u, dt);
  }
}
