// Kartenerzeugung (PLAN.md §5, §12.2). Punktsymmetrisch, deterministisch je Seed. Kein DOM.
import { BALANCE } from '../data/balance.js';
import { makeRng } from '../core/rng.js';
import { Grid } from './grid.js';
import { findPath } from './pathfinding.js';

const W = BALANCE.map.width;
const H = BALANCE.map.height;
const TILE = BALANCE.map.tile;
const CX = W / 2;
const CY = H / 2;
const ZONE_R = BALANCE.zone.r;
const SPAWNS = [
  { x: 600, y: 4200 },
  { x: 4200, y: 600 },
];
const SORTS = ['bm', 'mun', 'fuel'];
const MIN_GAP = 250; // Mindestabstand zwischen Vorkommen
const SPAWN_CLEAR = 700; // kein Vorkommen näher an einem Spawn (§12.2)
const BAND_MIN = 900; // übrige Vorkommen liegen im Band um Spawn 0 (Spiegel: um Spawn 1)
const BAND_MAX = 2200;
const MAX_ATTEMPTS = 20;
const OBSTACLE_PAIRS = 14;
const NODE_PAIRS = 9; // Vorkommen-Paare insgesamt (je 3 pro Sorte)
const ZONE_PAIRS = 2; // davon liegen so viele Paare in der Konfliktzone
const TWO_PI = Math.PI * 2;

const mirror = (p) => ({ x: W - p.x, y: H - p.y });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const roundPt = (x, y) => ({ x: Math.round(x), y: Math.round(y) });
const reaches = (path, x, y) => path.length > 0 && path[path.length - 1].x === x && path[path.length - 1].y === y;

/**
 * Erzeugt eine Karte. Scheitert die Platzierung oder ist die Karte nicht zusammenhängend,
 * wird mit seed + 1, + 2, … neu versucht (max. 20×).
 * @returns {{ width, height, tile, obstacles: {x,y,r}[], nodes: {id,type,x,y}[], spawns: {x,y}[], zone: {x,y,r} }}
 */
export function generateMap(seed) {
  for (let k = 0; k < MAX_ATTEMPTS; k++) {
    const map = tryBuild(seed + k);
    if (map) return map;
  }
  throw new Error('Karte konnte nicht erzeugt werden');
}

function tryBuild(seed) {
  const rng = makeRng(seed);
  const nodes = []; // {type, x, y} ohne ID
  const placed = []; // alle Vorkommen-Positionen (inkl. Spiegel)

  // Vorkommen-Position zulässig: kein Spawn-Umkreis, Abstand zu allen platzierten (die Menge ist punktsymmetrisch)
  const canNode = (p) => {
    if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) return false;
    if (SPAWNS.some((s) => dist(p.x, p.y, s.x, s.y) <= SPAWN_CLEAR)) return false;
    if (dist(p.x, p.y, W - p.x, H - p.y) < MIN_GAP) return false;
    return placed.every((q) => dist(p.x, p.y, q.x, q.y) >= MIN_GAP);
  };
  const addPair = (type, p) => {
    const m = mirror(p);
    nodes.push({ type, x: p.x, y: p.y }, { type, x: m.x, y: m.y });
    placed.push(p, m);
  };

  // Paare (Sorten reihum). Die ersten ZONE_PAIRS liegen in der Konfliktzone, die übrigen im Band
  // BAND_MIN..BAND_MAX um Spawn 0 (ihre Spiegel liegen im Band um Spawn 1).
  const sp = SPAWNS[0];
  for (let i = 0; i < NODE_PAIRS; i++) {
    const type = SORTS[i % SORTS.length];
    const inZone = i < ZONE_PAIRS;
    let p = null;
    for (let t = 0; t < 300 && !p; t++) {
      const rad = inZone ? rng.range(250, ZONE_R - 200) : rng.range(BAND_MIN, BAND_MAX);
      const a = rng.range(0, TWO_PI);
      const base = inZone ? { x: CX, y: CY } : sp;
      const q = roundPt(base.x + rad * Math.cos(a), base.y + rad * Math.sin(a));
      if (!inZone && dist(q.x, q.y, CX, CY) < ZONE_R + 150) continue;
      if (!canNode(q)) continue;
      p = q;
    }
    if (!p) return null;
    addPair(type, p);
  }

  // 3. Hindernispaare (Felsen/Wald)
  const obstacles = [];
  for (let i = 0; i < OBSTACLE_PAIRS; i++) {
    let ob = null;
    for (let t = 0; t < 300 && !ob; t++) {
      const r = Math.round(rng.range(60, 180));
      const x = Math.round(rng.range(r, W - r));
      const y = Math.round(rng.range(r, H - r));
      if (dist(x, y, CX, CY) < 300) continue;
      if (SPAWNS.some((s) => dist(x, y, s.x, s.y) < 600 + r)) continue;
      if (nodes.some((n) => dist(x, y, n.x, n.y) < r + 90)) continue;
      ob = { x, y, r };
    }
    if (!ob) return null;
    obstacles.push(ob, { x: W - ob.x, y: H - ob.y, r: ob.r });
  }

  // 4. Zusammenhang prüfen: Spawn 0 erreicht Zonenmitte und Spawn 1
  if (!isConnected(obstacles)) return null;

  return {
    width: W,
    height: H,
    tile: TILE,
    obstacles,
    nodes: nodes.map((n, i) => ({ id: i + 1, type: n.type, x: n.x, y: n.y })),
    spawns: SPAWNS.map((s) => ({ x: s.x, y: s.y })),
    zone: { x: CX, y: CY, r: ZONE_R },
  };
}

function isConnected(obstacles) {
  const grid = new Grid(W / TILE, H / TILE, TILE);
  grid.rasterizeObstacles(obstacles);
  const [a, b] = SPAWNS;
  if (!reaches(findPath(grid, a.x, a.y, CX, CY, 0), CX, CY)) return false;
  return reaches(findPath(grid, a.x, a.y, b.x, b.y, 0), b.x, b.y);
}
