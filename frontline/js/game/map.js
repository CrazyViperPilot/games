// Kartenerzeugung (PLAN.md §5, game/map.js). Punktsymmetrisch, deterministisch je Seed. Kein DOM.
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
const MAX_ATTEMPTS = 20;
const OBSTACLE_PAIRS = 14;
const EXTRA_PAIRS = 6;
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

  // Vorkommen-Position zulässig: Abstand zu allen platzierten (die Menge ist punktsymmetrisch)
  const canNode = (p) => {
    if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) return false;
    if (dist(p.x, p.y, W - p.x, H - p.y) < MIN_GAP) return false;
    return placed.every((q) => dist(p.x, p.y, q.x, q.y) >= MIN_GAP);
  };
  const addPair = (type, p) => {
    const m = mirror(p);
    nodes.push({ type, x: p.x, y: p.y }, { type, x: m.x, y: m.y });
    placed.push(p, m);
  };

  // 1. Je Spawn ein Vorkommen jeder Sorte. Winkel: Mitte ± Versatz, paarweise ≥ 60° auseinander,
  //    Richtung Kartenmitte gestreut. Zuordnung Sorte -> Winkel zufällig.
  const sp = SPAWNS[0];
  const toCenter = Math.atan2(CY - sp.y, CX - sp.x);
  const D = Math.PI / 180;
  const oc = rng.range(-20, 20) * D;
  const offsets = [oc - rng.range(60, 75) * D, oc, oc + rng.range(60, 75) * D];
  const order = [...SORTS];
  for (let k = order.length - 1; k > 0; k--) {
    const j = rng.int(0, k);
    [order[k], order[j]] = [order[j], order[k]];
  }
  for (let k = 0; k < SORTS.length; k++) {
    const a = toCenter + offsets[k];
    let p = null;
    for (let t = 0; t < 100 && !p; t++) {
      const rad = rng.range(220, 380);
      const q = roundPt(sp.x + rad * Math.cos(a), sp.y + rad * Math.sin(a));
      if (canNode(q)) p = q;
    }
    // Ausweichplan: Radius 380 (bei ≥ 60° Winkel genügt das für den Mindestabstand)
    if (!p) {
      p = roundPt(sp.x + 380 * Math.cos(a), sp.y + 380 * Math.sin(a));
      if (!canNode(p)) return null;
    }
    addPair(order[k], p);
  }

  // 2. Zusätzliche Paare verteilt (Sorten reihum), die ersten ZONE_PAIRS innerhalb der Konfliktzone
  for (let i = 0; i < EXTRA_PAIRS; i++) {
    const type = SORTS[i % SORTS.length];
    const inZone = i < ZONE_PAIRS;
    let p = null;
    for (let t = 0; t < 300 && !p; t++) {
      let q;
      if (inZone) {
        const rad = rng.range(250, ZONE_R - 200);
        const a = rng.range(0, TWO_PI);
        q = roundPt(CX + rad * Math.cos(a), CY + rad * Math.sin(a));
      } else {
        q = roundPt(rng.range(150, W - 150), rng.range(150, H - 150));
        if (dist(q.x, q.y, CX, CY) < ZONE_R + 150) continue;
      }
      if (SPAWNS.some((s) => dist(q.x, q.y, s.x, s.y) < 600)) continue;
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
