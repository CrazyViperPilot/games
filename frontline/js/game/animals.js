// Tiere (nach den Jagdtieren aus Age of Empires II): Rehe und Wildschweine ziehen in Rudeln über die Wiesen außerhalb der Zone und
// fliehen vor Einheiten und Explosionen. Rein optisch, keine Entities: sie blockieren nichts und lassen sich nicht beschießen. Wer sie
// fliehen sieht, ahnt, wo der Gegner fährt. Eigener Zufall (deterministisch je Seed), der übrige Spielablauf bleibt unberührt.
import { BALANCE } from '../data/balance.js';
import { makeRng } from '../core/rng.js';

const A = BALANCE.animals;
const W = BALANCE.map.width;
const H = BALANCE.map.height;
const KINDS = ['deer', 'boar', 'deer', 'deer']; // Art je Rudelpaar (reihum)
const ZONE_GAP = 250; // Abstand der Weiden zur Zonenkante
const SPAWN_GAP = 1400; // Abstand der Rudel zu den Startpunkten
const GROUP_GAP = 1100; // Abstand der Rudel untereinander
const WANDER = 110; // so weit grast ein Tier um die Rudelmitte
const MIGRATE = [16, 34]; // s, nach so langer Zeit zieht das Rudel weiter
const MIGRATE_DIST = [220, 480];

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Zelle frei für Tiere (kein Gelände-, Wald- oder Gebäudehindernis, im Feld). */
function open(game, x, y) {
  const g = game.grid;
  return x > 60 && y > 60 && x < W - 60 && y < H - 60 && g.free(g.toCell(x), g.toCell(y));
}

/** Gerade Strecke über offenen Boden (alle 32 px geprüft). */
function clearLine(game, x1, y1, x2, y2) {
  const n = Math.max(1, Math.ceil(dist(x1, y1, x2, y2) / 32));
  for (let i = 1; i <= n; i++) if (!open(game, x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n)) return false;
  return true;
}

/** Weide: offen, nicht in oder nahe der Zone. */
function meadow(game, x, y) {
  const z = game.zone;
  return open(game, x, y) && dist(x, y, z.x, z.y) > z.r + ZONE_GAP;
}

export function createAnimals(game) {
  game.animals = [];
  game.animalGroups = [];
  game.animalTimer = 0;
  const rng = makeRng((Math.imul(game.seed | 0, 2246822519) ^ 0xa5a5f00d) >>> 0);
  game.animalRng = rng;
  const groups = [];
  const near = (x, y) => groups.some((g) => dist(x, y, g.cx, g.cy) < GROUP_GAP);
  for (let p = 0; p < A.pairs; p++) {
    const kind = KINDS[p % KINDS.length];
    for (let t = 0; t < 300; t++) {
      const x = Math.round(rng.range(500, W - 500));
      const y = Math.round(rng.range(500, H - 500));
      const ok = [[x, y], [W - x, H - y]].every(
        ([px, py]) => meadow(game, px, py) && game.map.spawns.every((s) => dist(px, py, s.x, s.y) > SPAWN_GAP) && !near(px, py),
      );
      if (!ok) continue;
      const [lo, hi] = A[kind];
      const n = rng.int(lo, hi);
      const spots = [];
      for (let k = 0; k < n * 6 && spots.length < n; k++) {
        const a = rng.next() * Math.PI * 2;
        const d = 12 + rng.next() * 50;
        const sx = Math.round(x + Math.cos(a) * d);
        const sy = Math.round(y + Math.sin(a) * d);
        if (open(game, sx, sy) && open(game, W - sx, H - sy)) spots.push([sx, sy, rng.next() * Math.PI * 2]);
      }
      if (spots.length < lo) continue;
      for (const mirror of [false, true]) {
        const g = { id: groups.length, kind, cx: mirror ? W - x : x, cy: mirror ? H - y : y, migrateAt: rng.range(...MIGRATE) };
        groups.push(g);
        for (const [sx, sy, ang] of spots) {
          const ax = mirror ? W - sx : sx;
          const ay = mirror ? H - sy : sy;
          game.animals.push({
            id: game.animals.length + 1,
            kind,
            group: g.id,
            x: ax,
            y: ay,
            angle: mirror ? ang + Math.PI : ang,
            tx: ax,
            ty: ay,
            speed: 0,
            state: 'graze',
            until: rng.range(1, 6),
            step: 0, // zurückgelegter Weg (Gangart im Bild)
          });
        }
      }
      break;
    }
  }
  game.animalGroups = groups;
}

/** Nächste Gefahr für ein Tier: Einheit in Schreckweite (je Art) oder frischer Knall. → {x, y} oder null. */
function threatNear(game, a) {
  const S = A.scare;
  let best = null;
  let bd = Infinity;
  for (const u of game.units) {
    if (!u.alive || u.house) continue;
    const r = u.def.air ? S.air : u.def.armor === 'inf' ? S.inf : S.vehicle;
    const d = dist(a.x, a.y, u.x, u.y);
    if (d < r && d < bd) {
      best = u;
      bd = d;
    }
  }
  if (best) return best;
  for (const e of game.effects) {
    if (e.type !== 'explosion' || e.t > A.think) continue;
    const d = dist(a.x, a.y, e.x, e.y);
    if (d < S.boom && d < bd) {
      best = e;
      bd = d;
    }
  }
  return best;
}

/** Fluchtziel weg von (fx, fy): geradeaus weg, sonst schräg (bis 90°), auf offenem Boden; lieber außerhalb der Zone. */
function fleeTarget(game, a, fx, fy, rng) {
  const base = Math.atan2(a.y - fy, a.x - fx);
  const d = rng.range(...A.flee);
  let fallback = null;
  for (const off of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
    const ang = base + off + rng.range(-0.2, 0.2);
    const x = a.x + Math.cos(ang) * d;
    const y = a.y + Math.sin(ang) * d;
    if (meadow(game, x, y)) return { x, y };
    if (!fallback && open(game, x, y)) fallback = { x, y };
  }
  return fallback;
}

function setGoal(a, x, y, speed, state) {
  a.tx = x;
  a.ty = y;
  a.speed = speed;
  a.state = state;
}

/** Entscheidungen alle `think` s: Gefahr → das ganze Rudel flieht; sonst grasen, ein paar Schritte gehen, weiterziehen. */
function think(game, time) {
  const rng = game.animalRng;
  const scared = new Map(); // Rudel → Gefahr
  for (const a of game.animals) {
    if (scared.has(a.group)) continue;
    const t = threatNear(game, a);
    if (t) scared.set(a.group, t);
  }
  for (const g of game.animalGroups) {
    const t = scared.get(g.id);
    if (t) {
      const members = game.animals.filter((a) => a.group === g.id);
      let sx = 0;
      let sy = 0;
      for (const a of members) {
        if (a.state !== 'flee' || dist(a.x, a.y, a.tx, a.ty) < 60) {
          const q = fleeTarget(game, a, t.x, t.y, rng);
          if (q) setGoal(a, q.x, q.y, A.run[a.kind] * rng.range(0.9, 1.1), 'flee');
        }
        sx += a.tx;
        sy += a.ty;
      }
      // die Rudelmitte zieht mit (dort grast es danach)
      if (members.length) {
        g.cx = sx / members.length;
        g.cy = sy / members.length;
      }
      g.migrateAt = time + rng.range(...MIGRATE);
      continue;
    }
    if (time >= g.migrateAt) {
      // weiterziehen: neue Rudelmitte auf einer Weide in der Nähe
      g.migrateAt = time + rng.range(...MIGRATE);
      for (let k = 0; k < 8; k++) {
        const ang = rng.next() * Math.PI * 2;
        const d = rng.range(...MIGRATE_DIST);
        const x = g.cx + Math.cos(ang) * d;
        const y = g.cy + Math.sin(ang) * d;
        if (!meadow(game, x, y) || !clearLine(game, g.cx, g.cy, x, y)) continue;
        g.cx = x;
        g.cy = y;
        break;
      }
    }
  }
  for (const a of game.animals) {
    if (a.state === 'flee' && scared.has(a.group)) continue;
    if (a.state === 'flee' && dist(a.x, a.y, a.tx, a.ty) > 20) continue; // erst ankommen
    if (a.state === 'flee') {
      a.state = 'graze';
      a.speed = 0;
      a.until = time + rng.range(2, 5);
      continue;
    }
    if (a.state === 'walk' && dist(a.x, a.y, a.tx, a.ty) > 6) continue;
    if (a.state === 'walk') {
      a.state = 'graze';
      a.speed = 0;
      a.until = time + rng.range(3, 9);
      continue;
    }
    if (time < a.until) continue;
    const g = game.animalGroups[a.group];
    const far = dist(a.x, a.y, g.cx, g.cy) > WANDER * 2; // zurückgeblieben: trabt hinterher
    for (let k = 0; k < 6; k++) {
      const ang = rng.next() * Math.PI * 2;
      const d = rng.next() * WANDER;
      const x = g.cx + Math.cos(ang) * d;
      const y = g.cy + Math.sin(ang) * d;
      if (!open(game, x, y) || !clearLine(game, a.x, a.y, x, y)) continue;
      setGoal(a, x, y, A.walk * rng.range(0.8, 1.2) * (far ? 2 : 1), 'walk');
      break;
    }
    a.until = time + rng.range(3, 9);
  }
}

/** Bewegung je Schritt; ein Hindernis vor dem Tier beendet den Gang (nächste Entscheidung sucht ein neues Ziel). */
export function updateAnimals(game, dt) {
  if (!game.animals?.length) return;
  game.animalTimer += dt;
  if (game.animalTimer >= A.think) {
    game.animalTimer = 0;
    think(game, game.time);
  }
  for (const a of game.animals) {
    if (!(a.speed > 0)) continue;
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) {
      a.speed = 0;
      continue;
    }
    const s = Math.min(d, a.speed * dt);
    const nx = a.x + (dx / d) * s;
    const ny = a.y + (dy / d) * s;
    a.angle = Math.atan2(dy, dx);
    if (!open(game, nx, ny)) {
      a.tx = a.x;
      a.ty = a.y;
      a.speed = 0;
      continue;
    }
    a.x = nx;
    a.y = ny;
    a.step += s;
  }
}
