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
  { x: 700, y: 8324 },
  { x: 8324, y: 700 },
];
const SORTS = ['bm', 'mun', 'fuel'];
const MIN_GAP = 250; // Mindestabstand zwischen Vorkommen
const MAX_ATTEMPTS = 20;
const OBSTACLE_PAIRS = 32;
const EXTRA_PAIRS = 12;
const ZONE_PAIRS = 6; // davon liegen so viele Paare in der Konfliktzone
const TWO_PI = Math.PI * 2;

const mirror = (p) => ({ x: W - p.x, y: H - p.y });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const roundPt = (x, y) => ({ x: Math.round(x), y: Math.round(y) });
const reaches = (path, x, y) => path.length > 0 && path[path.length - 1].x === x && path[path.length - 1].y === y;

/**
 * Erzeugt eine Karte. Scheitert die Platzierung oder ist die Karte nicht zusammenhängend,
 * wird mit seed + 1, + 2, … neu versucht (max. 20×).
 * @returns {{ width, height, tile, obstacles: {x,y,r}[], town: {roads, buildings, parks, cars, trees}, nodes: {id,type,x,y}[], spawns: {x,y}[], zone: {x,y,r} }}
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
      if (dist(x, y, CX, CY) < ZONE_R + r + 40) continue; // Stadt bleibt frei von Felsen/Wald
      if (SPAWNS.some((s) => dist(x, y, s.x, s.y) < 600 + r)) continue;
      if (nodes.some((n) => dist(x, y, n.x, n.y) < r + 90)) continue;
      ob = { x, y, r };
    }
    if (!ob) return null;
    obstacles.push(ob, { x: W - ob.x, y: H - ob.y, r: ob.r });
  }

  // 4. Zusammenhang prüfen: Spawn 0 erreicht Zonenmitte und Spawn 1
  const town = buildTown(rng, nodes);
  if (!isConnected(obstacles, town.buildings)) return null;

  return {
    width: W,
    height: H,
    tile: TILE,
    obstacles,
    town,
    nodes: nodes.map((n, i) => ({ id: i + 1, type: n.type, x: n.x, y: n.y })),
    spawns: SPAWNS.map((s) => ({ x: s.x, y: s.y })),
    zone: { x: CX, y: CY, r: ZONE_R },
  };
}

function isConnected(obstacles, buildings = []) {
  const grid = new Grid(W / TILE, H / TILE, TILE);
  grid.rasterizeObstacles(obstacles);
  grid.rasterizeRects(buildings);
  const [a, b] = SPAWNS;
  if (!reaches(findPath(grid, a.x, a.y, CX, CY, 0), CX, CY)) return false;
  return reaches(findPath(grid, a.x, a.y, b.x, b.y, 0), b.x, b.y);
}

// ---- Osteuropäische Stadt in der Konfliktzone (punktsymmetrisch um die Zonenmitte) ----
const BLOCK = 400; // Häuserblock (Straßenraster)
const ROAD_W = 64;
const AVENUE_W = 92; // die zwei Straßen am Zentrumsplatz
const CAR_COLORS = ['#b8b8b0', '#8a2f2f', '#2f4f7a', '#d0c060', '#3b3b3b', '#d8d8d8', '#4f7a4f'];

/**
 * Straßenraster, Häuser, Hallen, Fabriken, Parks, geparkte Autos und Bäume.
 * Gebäude (Rechtecke {x,y,w,h,kind}) sind unpassierbar, alles andere ist Dekoration.
 */
function buildTown(rng, nodes) {
  const roads = [];
  const buildings = [];
  const parks = [];
  const cars = [];
  const trees = [];
  const span = Math.floor((ZONE_R - 150) / BLOCK); // Blöcke je Richtung vom Zentrum

  // Straßen zwischen den Blöcken, an der Zonenkante gekappt (Kreissehne)
  for (let k = -span - 1; k <= span; k++) {
    const off = (k + 0.5) * BLOCK;
    const half = Math.sqrt(Math.max(0, (ZONE_R - 60) ** 2 - off * off));
    if (half < 100) continue;
    const w = Math.abs(off) < BLOCK / 2 + 1 ? AVENUE_W : ROAD_W;
    roads.push({ x1: CX + off, y1: CY - half, x2: CX + off, y2: CY + half, w });
    roads.push({ x1: CX - half, y1: CY + off, x2: CX + half, y2: CY + off, w });
  }
  // Zufahrtsstraßen (Feldwege) von den Spawns zur Stadtkante
  for (const s of SPAWNS) {
    const a = Math.atan2(CY - s.y, CX - s.x);
    roads.push({
      x1: s.x,
      y1: s.y,
      x2: CX - Math.cos(a) * (ZONE_R - 80),
      y2: CY - Math.sin(a) * (ZONE_R - 80),
      w: 52,
      dirt: true,
    });
  }

  const nearNode = (x, y, pad) => nodes.some((n) => dist(x, y, n.x, n.y) < pad);
  // Paarweise (Original + Spiegelbild) eintragen
  const addBuilding = (b) => {
    if (nearNode(b.x, b.y, Math.hypot(b.w, b.h) / 2 + 40)) return;
    buildings.push(b, { ...b, x: W - b.x, y: H - b.y });
  };
  const addTree = (x, y) => {
    if (nearNode(x, y, 60)) return;
    const r = Math.round(rng.range(12, 20));
    trees.push({ x, y, r }, { x: W - x, y: H - y, r });
  };
  const addCar = (x, y, vertical, color) => {
    if (nearNode(x, y, 60)) return;
    cars.push({ x, y, vertical, color }, { x: W - x, y: H - y, vertical, color });
  };

  // Zentrumsplatz: Park (nur Dekoration), bleibt frei begehbar
  const plaza = { x: CX, y: CY, r: 150 };
  parks.push(plaza);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TWO_PI;
    trees.push({ x: Math.round(CX + Math.cos(a) * 110), y: Math.round(CY + Math.sin(a) * 110), r: 14 });
  }

  for (let i = -span; i <= span; i++) {
    for (let j = -span; j <= span; j++) {
      if (i < 0 || (i === 0 && j <= 0)) continue; // nur eine Hälfte, der Rest wird gespiegelt
      const bx = CX + i * BLOCK;
      const by = CY + j * BLOCK;
      if (dist(bx, by, CX, CY) > ZONE_R - 230) continue;
      const roll = rng.next();
      if (roll < 0.34) {
        // Wohnhäuser
        for (const [sx, sy] of [[-90, -90], [90, -90], [-90, 90], [90, 90]]) {
          if (rng.next() < 0.2) continue;
          addBuilding({
            x: Math.round(bx + sx + rng.range(-10, 10)),
            y: Math.round(by + sy + rng.range(-10, 10)),
            w: Math.round(rng.range(80, 100)),
            h: Math.round(rng.range(64, 86)),
            kind: 'house',
          });
        }
        addTree(bx + rng.range(-20, 20), by + rng.range(-20, 20));
      } else if (roll < 0.54) {
        // Fabrik mit Schornstein
        const flip = rng.next() < 0.5;
        addBuilding({
          x: Math.round(bx + rng.range(-15, 15)),
          y: Math.round(by + rng.range(-15, 15)),
          w: flip ? 170 : 260,
          h: flip ? 260 : 170,
          kind: 'factory',
        });
      } else if (roll < 0.72) {
        // Halle(n)
        addBuilding({ x: bx, y: Math.round(by - 80), w: 290, h: 100, kind: 'hall' });
        if (rng.next() < 0.6) addBuilding({ x: bx, y: Math.round(by + 90), w: 220, h: 80, kind: 'hall' });
      } else if (roll < 0.88) {
        // kleiner Park
        parks.push({ x: bx, y: by, r: 150 });
        parks.push({ x: W - bx, y: H - by, r: 150 });
        const n = Math.round(rng.range(7, 12));
        for (let t = 0; t < n; t++) addTree(bx + rng.range(-135, 135), by + rng.range(-135, 135));
      } else {
        // zwei Häuser und Bäume
        addBuilding({ x: bx - 80, y: by - 70, w: 96, h: 76, kind: 'house' });
        addBuilding({ x: bx + 80, y: by + 70, w: 90, h: 70, kind: 'house' });
        for (let t = 0; t < 4; t++) addTree(bx + rng.range(-140, 140), by + rng.range(-140, 140));
      }
      // geparkte Autos am Straßenrand
      const nCars = Math.floor(rng.range(0, 4));
      for (let c = 0; c < nCars; c++) {
        const col = CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)];
        const side = rng.next() < 0.5 ? -1 : 1;
        const t = rng.range(-130, 130);
        if (rng.next() < 0.5) addCar(Math.round(bx + t), Math.round(by + side * 150), false, col);
        else addCar(Math.round(bx + side * 150), Math.round(by + t), true, col);
      }
    }
  }
  return { roads, buildings, parks, cars, trees };
}
