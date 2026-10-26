// Kartenerzeugung (PLAN.md §5, game/map.js). Punktsymmetrisch, deterministisch je Seed. Kein DOM.
import { BALANCE } from '../data/balance.js';
import { makeRng } from '../core/rng.js';
import { Grid } from './grid.js';
import { findPath } from './pathfinding.js';
import { setRelief } from './relief.js';
import { buildLandscape, groundOk, countRoutes } from './landscape.js';

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
const MAX_ATTEMPTS = 20;
const OBSTACLE_PAIRS = 32;
const MIN_ROUTES = 3; // so viele getrennte Wege führen mindestens von jedem Start in die Konfliktzone
const ZONE_SLOPE = 0.25; // in der Stadt ist kein Hang steiler (alle Wege gut befahrbar)
const TWO_PI = Math.PI * 2;

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const reaches = (path, x, y) => path.length > 0 && path[path.length - 1].x === x && path[path.length - 1].y === y;

/**
 * Erzeugt eine Karte. Scheitert die Platzierung oder ist die Karte nicht zusammenhängend,
 * wird mit seed + 1, + 2, … neu versucht (max. 20×).
 * @returns {{ width, height, tile, obstacles: {x,y,r}[], town: {roads, buildings, parks, cars, trees}, trees: {x,y,r}[] (Bäume außerhalb der Stadt; wie die Stadtbäume blockierend), spawns: {x,y}[], zone: {x,y,r}, crates: {x,y}[] (Versorgungskisten), relief: string (Höhengelände, relief.js) }}
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
  // 0. Gelände: Hügel, Bergrücken und Seen; Zufahrten, Bahn, Startpunkte und Stadt bleiben frei befahrbar
  const { relief } = buildLandscape(seed, { spawns: SPAWNS, zone: { x: CX, y: CY, r: ZONE_R }, roads: accessRoads(), railY: CY });
  if (!gentleZone(relief)) return null;
  // 1. Hindernispaare (Wald), nur auf festem, nicht zu steilem Grund
  const obstacles = [];
  for (let i = 0; i < OBSTACLE_PAIRS; i++) {
    let ob = null;
    for (let t = 0; t < 300 && !ob; t++) {
      const r = 2 * Math.round(rng.range(30, 90)); // immer gerade: nur Wald, keine Felsen
      const x = Math.round(rng.range(r, W - r));
      const y = Math.round(rng.range(r, H - r));
      if (dist(x, y, CX, CY) < ZONE_R + r + 40) continue; // Stadt bleibt frei von Felsen/Wald
      if (inRail(y, r)) continue; // Bahnlinie bleibt frei
      if (SPAWNS.some((s) => dist(x, y, s.x, s.y) < 600 + r)) continue;
      if (!groundOk(relief, x, y, r) || !groundOk(relief, W - x, H - y, r)) continue;
      ob = { x, y, r };
    }
    if (!ob) return null;
    obstacles.push(ob, { x: W - ob.x, y: H - ob.y, r: ob.r });
  }

  // 2. Zusammenhang prüfen: Spawn 0 erreicht Zonenmitte (auf mehreren Wegen) und Spawn 1
  const town = buildTown(rng);
  const outposts = buildOutposts(rng, obstacles, relief);
  town.buildings.push(...outposts.buildings);
  const trees = scatterTrees(rng, obstacles, outposts.areas, relief);
  const grid = blockGrid(obstacles, town.buildings, [...town.trees, ...trees], relief);
  if (!isConnected(grid)) return null;
  // 3. Versorgungskisten zuletzt: die Zufallszahlen davor (und damit alle bisherigen Karten) bleiben gleich
  const crates = placeCrates(rng, grid);

  const map = {
    width: W,
    height: H,
    tile: TILE,
    obstacles,
    town,
    trees,
    spawns: SPAWNS.map((s) => ({ x: s.x, y: s.y })),
    zone: { x: CX, y: CY, r: ZONE_R },
    crates,
  };
  setRelief(map, relief);
  return map;
}

/** Die Feldwege von den Startpunkten zur Stadtkante (dieselben Linien wie in buildTown). */
function accessRoads() {
  return SPAWNS.map((s) => {
    const a = Math.atan2(CY - s.y, CX - s.x);
    return { x1: s.x, y1: s.y, x2: CX - Math.cos(a) * (ZONE_R - 80), y2: CY - Math.sin(a) * (ZONE_R - 80) };
  });
}

/** In der Konfliktzone ist das Gelände überall sanft (keine Zelle steiler als ZONE_SLOPE, kein Wasser). */
function gentleZone(relief) {
  const c0 = Math.floor((CX - ZONE_R) / TILE);
  const c1 = Math.ceil((CX + ZONE_R) / TILE);
  for (let r = c0; r < c1; r++) {
    for (let c = c0; c < c1; c++) {
      if (dist((c + 0.5) * TILE, (r + 0.5) * TILE, CX, CY) > ZONE_R) continue;
      if (relief.cellSlope(c, r) > ZONE_SLOPE || relief.cellBlocked(c, r)) return false;
    }
  }
  return true;
}

/** Raster mit allem, was den Weg versperrt (wie im Spiel). */
function blockGrid(obstacles, buildings, trees, relief) {
  const grid = new Grid(W / TILE, H / TILE, TILE);
  grid.rasterizeObstacles(obstacles);
  grid.rasterizeRects(buildings);
  grid.rasterizeTrees(trees);
  grid.rasterizeRelief(relief);
  return grid;
}

function isConnected(grid) {
  const [a, b] = SPAWNS;
  const cy = CY - RAIL_HALF - 20; // Zonenmitte liegt unter dem Zug: Nachbarpunkt prüfen
  if (!reaches(findPath(grid, a.x, a.y, CX, cy, 0), CX, cy)) return false;
  if (!reaches(findPath(grid, a.x, a.y, b.x, b.y, 0), b.x, b.y)) return false;
  // Mehrere getrennte Zugänge zur Zone (die Karte ist punktsymmetrisch: Start 0 genügt)
  const keepOut = [{ x: a.x, y: a.y, r: 900 }, { x: CX, y: CY, r: ZONE_R }];
  return countRoutes(grid, a, { x: CX, y: cy }, { want: MIN_ROUTES, keepOut }) >= MIN_ROUTES;
}

// ---- Osteuropäische Stadt in der Konfliktzone (punktsymmetrisch um die Zonenmitte) ----
// Bahnlinie: gerade quer über die Karte durch die Zonenmitte (y = CY), Schienen sind begehbar, der stehende Zug in der Mitte nicht.
const RAIL_HALF = 40; // halbe Breite des Bahnkorridors, Gebäude, Bäume und Felsen bleiben davon frei
const TRAIN = [
  { part: 'tank', dx: -100 },
  { part: 'container', dx: 0 },
  { part: 'loco', dx: 100 },
];
const inRail = (y, pad = 0) => Math.abs(y - CY) < RAIL_HALF + pad;
const BLOCK = 400; // Häuserblock (Straßenraster)
const ROAD_W = 64;
const AVENUE_W = 92; // die zwei Straßen am Zentrumsplatz
const CAR_COLORS = ['#b8b8b0', '#8a2f2f', '#2f4f7a', '#d0c060', '#3b3b3b', '#d8d8d8', '#4f7a4f'];

/**
 * Straßenraster, Häuser, Hallen, Fabriken, Parks, geparkte Autos und Bäume.
 * Gebäude (Rechtecke {x,y,w,h,kind}) sind unpassierbar, alles andere ist Dekoration.
 */
const TOWER_SIZE = 80; // Grundfläche eines Wachturms
// oben (Mitte) und links (knapp über der Bahnlinie); unten und rechts entstehen als Spiegelbild
const TOWER_AT = [
  { x: CX, y: CY - 0.86 * ZONE_R },
  { x: CX - 0.86 * ZONE_R, y: CY - 190 },
];

function buildTown(rng) {
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

  // Paarweise (Original + Spiegelbild) eintragen
  const addBuilding = (b) => {
    buildings.push(b, { ...b, x: W - b.x, y: H - b.y });
  };
  const addTree = (x, y) => {
    const r = Math.round(rng.range(12, 20));
    trees.push({ x, y, r }, { x: W - x, y: H - y, r });
  };
  const addCar = (x, y, vertical, color) => {
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
  // Vier Wachtürme am Rand der Konfliktzone (oben, unten, links, rechts; punktsymmetrisch). Was dort im Weg steht, entfällt.
  for (const t of TOWER_AT) {
    for (const p of [t, { x: W - t.x, y: H - t.y }]) {
      const hit = (o, w, h) => Math.abs(o.x - p.x) < (w + TOWER_SIZE) / 2 + 30 && Math.abs(o.y - p.y) < (h + TOWER_SIZE) / 2 + 30;
      for (let i = buildings.length - 1; i >= 0; i--) if (hit(buildings[i], buildings[i].w, buildings[i].h)) buildings.splice(i, 1);
      for (let i = trees.length - 1; i >= 0; i--) if (hit(trees[i], trees[i].r * 2, trees[i].r * 2)) trees.splice(i, 1);
      for (let i = cars.length - 1; i >= 0; i--) if (hit(cars[i], 40, 40)) cars.splice(i, 1);
      buildings.push({ x: Math.round(p.x), y: Math.round(p.y), w: TOWER_SIZE, h: TOWER_SIZE, kind: 'tower' });
    }
  }
  // Bahnkorridor freiräumen, dann den stehenden Zug (Lok an der Ostseite) auf die Schiene stellen
  const free = (arr, pad) => arr.filter((o) => !inRail(o.y, pad(o)));
  const town = {
    roads,
    buildings: free(buildings, (b) => b.h / 2),
    parks,
    cars: free(cars, () => 20),
    trees: free(trees, (t) => t.r),
    rails: [{ x1: 0, y1: CY, x2: W, y2: CY }],
  };
  for (const c of TRAIN) town.buildings.push({ x: CX + c.dx, y: CY, w: 96, h: 46, kind: 'train', part: c.part });
  return town;
}

const OUTPOST_HOUSES = 22; // Einzelhäuser außerhalb der Zone (Paare)
const OUTPOST_HALLS = 6; // freistehende Hallen (Paare)
const OUTPOST_FACTORIES = 7; // Fabrikgelände mit Mauer (Paare)
const WALL_T = 16; // Mauerstärke
const WALL_MARGIN = 80; // Abstand der Mauer zur Fabrik (Platz zum Umfahren)
const WALL_GAP = 130; // Lücke in der Mauer (zwei gegenüberliegende Seiten)

/**
 * Vereinzelte Häuser, Hallen und Fabrikgelände außerhalb der Konfliktzone (punktsymmetrisch). Ein Fabrikgelände hat eine Mauer
 * mit zwei Lücken an gegenüberliegenden Seiten: durch die eine Lücke hinein, um die Fabrik herum, durch die andere hinaus.
 * @returns {{ buildings: {x,y,w,h,kind}[], areas: {x,y,r}[] }} areas = belegte Kreise (keine Bäume dort)
 */
function buildOutposts(rng, obstacles, relief = null) {
  const buildings = [];
  const areas = [];
  const fits = (x, y, r) =>
    [[x, y], [W - x, H - y]].every(
      ([px, py]) =>
        px > r + 300 &&
        py > r + 300 &&
        px < W - r - 300 &&
        py < H - r - 300 &&
        !inRail(py, r) &&
        dist(px, py, CX, CY) > ZONE_R + r + 150 &&
        SPAWNS.every((sp) => dist(px, py, sp.x, sp.y) > 700 + r) &&
        obstacles.every((o) => dist(px, py, o.x, o.y) > o.r + r + 40) &&
        areas.every((a) => dist(px, py, a.x, a.y) > a.r + r + 60) &&
        groundOk(relief, px, py, r, 0.22)
    );
  const place = (r, make) => {
    for (let t = 0; t < 600; t++) {
      const x = Math.round(rng.range(r + 300, W - r - 300));
      const y = Math.round(rng.range(r + 300, H - r - 300));
      if (!fits(x, y, r)) continue;
      const list = make(x, y);
      for (const b of list) buildings.push(b, { ...b, x: W - b.x, y: H - b.y });
      areas.push({ x, y, r }, { x: W - x, y: H - y, r });
      return;
    }
  };
  for (let i = 0; i < OUTPOST_FACTORIES; i++) {
    const flip = rng.next() < 0.5;
    const fw = flip ? 170 : 260;
    const fh = flip ? 260 : 170;
    const gapsOnX = rng.next() < 0.5; // Lücken links/rechts (sonst oben/unten)
    place(Math.hypot(fw, fh) / 2 + WALL_MARGIN + 30, (x, y) => {
      const list = [{ x, y, w: fw, h: fh, kind: 'factory' }];
      const A = fw / 2 + WALL_MARGIN; // halbe Ringbreite (Mitte der Mauer)
      const B = fh / 2 + WALL_MARGIN;
      const full = (cx, cy, w, h) => list.push({ x: cx, y: cy, w, h, kind: 'wall' });
      if (gapsOnX) {
        full(x, y - B, 2 * A + WALL_T, WALL_T); // Nord- und Südmauer ganz, Ost-/Westmauer mit Lücke
        full(x, y + B, 2 * A + WALL_T, WALL_T);
        for (const sx of [-1, 1]) {
          const len = B - WALL_GAP / 2;
          full(x + sx * A, y - WALL_GAP / 2 - len / 2, WALL_T, len);
          full(x + sx * A, y + WALL_GAP / 2 + len / 2, WALL_T, len);
        }
      } else {
        full(x - A, y, WALL_T, 2 * B + WALL_T);
        full(x + A, y, WALL_T, 2 * B + WALL_T);
        for (const sy of [-1, 1]) {
          const len = A - WALL_GAP / 2;
          full(x - WALL_GAP / 2 - len / 2, y + sy * B, len, WALL_T);
          full(x + WALL_GAP / 2 + len / 2, y + sy * B, len, WALL_T);
        }
      }
      return list;
    });
  }
  for (let i = 0; i < OUTPOST_HALLS; i++) {
    const flip = rng.next() < 0.5;
    place(160, (x, y) => [{ x, y, w: flip ? 100 : 290, h: flip ? 290 : 100, kind: 'hall' }]);
  }
  for (let i = 0; i < OUTPOST_HOUSES; i++) {
    place(80, (x, y) => [{ x, y, w: Math.round(rng.range(80, 100)), h: Math.round(rng.range(64, 86)), kind: 'house' }]);
  }
  return { buildings, areas };
}

const SCATTER_PAIRS = 350;

/** Einzelne Bäume und kleine Gruppen überall außerhalb der Stadt (punktsymmetrisch); sie blockieren wie Gebäude. */
function scatterTrees(rng, obstacles, keepOut = [], relief = null) {
  const trees = [];
  const ok = (x, y) =>
    x > 40 &&
    y > 40 &&
    x < W - 40 &&
    y < H - 40 &&
    !inRail(y, 20) &&
    dist(x, y, CX, CY) > ZONE_R + 30 &&
    SPAWNS.every((s) => dist(x, y, s.x, s.y) > 420) &&
    obstacles.every((o) => dist(x, y, o.x, o.y) > o.r + 25) &&
    keepOut.every((a) => dist(x, y, a.x, a.y) > a.r + 25) &&
    groundOk(relief, x, y);
  const add = (x, y) => {
    if (!ok(x, y) || !ok(W - x, H - y)) return;
    const r = Math.round(rng.range(10, 19));
    trees.push({ x, y, r }, { x: W - x, y: H - y, r });
  };
  for (let i = 0; i < SCATTER_PAIRS; i++) {
    const x = Math.round(rng.range(0, W));
    const y = Math.round(rng.range(0, H));
    add(x, y);
    if (rng.next() < 0.5) add(x + 40, y + 20); // Baumgruppe
  }
  return trees;
}

const CRATE_CLEAR = 40; // so weit ringsum ist der Boden um eine Kiste frei und erreichbar
const CRATE_ZONE = 350; // Abstand zur Zonenkante
const CRATE_SPAWN = 1300; // Abstand zu den Startpunkten
const CRATE_GAP = 900; // Abstand der Kisten untereinander

/** Zellen, die Start 0 zu Fuß erreicht (Breitensuche über die Nachbarzellen). */
function reachable(grid, from) {
  const seen = new Uint8Array(grid.cols * grid.rows);
  const c0 = grid.toCell(from.x);
  const r0 = grid.toCell(from.y);
  if (!grid.passable(c0, r0, 0)) return seen;
  const queue = [grid.idx(c0, r0)];
  seen[queue[0]] = 1;
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const c = i % grid.cols;
    const r = (i - c) / grid.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (!grid.passable(nc, nr, 0)) continue;
      const j = grid.idx(nc, nr);
      if (seen[j]) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

/**
 * Versorgungskisten (BALANCE.crates.pairs Paare, punktsymmetrisch) abseits von Zone und Startpunkten, auf freiem Boden, den Start 0
 * erreicht (das Spiegelbild erreicht Start 1 genauso). Findet sich für ein Paar kein Platz, gibt es eben weniger Kisten.
 */
function placeCrates(rng, grid) {
  const reach = reachable(grid, SPAWNS[0]);
  const open = (x, y) =>
    [[0, 0], [CRATE_CLEAR, 0], [-CRATE_CLEAR, 0], [0, CRATE_CLEAR], [0, -CRATE_CLEAR]].every(([dx, dy]) => {
      const c = grid.toCell(x + dx);
      const r = grid.toCell(y + dy);
      return grid.inBounds(c, r) && reach[grid.idx(c, r)] === 1;
    });
  const crates = [];
  for (let i = 0; i < BALANCE.crates.pairs; i++) {
    for (let t = 0; t < 300; t++) {
      const x = Math.round(rng.range(400, W - 400));
      const y = Math.round(rng.range(400, H - 400));
      const ok = [[x, y], [W - x, H - y]].every(
        ([px, py]) =>
          dist(px, py, CX, CY) > ZONE_R + CRATE_ZONE &&
          !inRail(py, 80) &&
          SPAWNS.every((s) => dist(px, py, s.x, s.y) > CRATE_SPAWN) &&
          crates.every((c) => dist(px, py, c.x, c.y) > CRATE_GAP) &&
          open(px, py),
      );
      if (!ok) continue;
      crates.push({ x, y }, { x: W - x, y: H - y });
      break;
    }
  }
  return crates;
}
