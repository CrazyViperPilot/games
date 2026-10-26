// Kartenerzeugung (PLAN.md §5, game/map.js). Punktsymmetrisch, deterministisch je Seed. Kein DOM.
import { BALANCE } from '../data/balance.js';
import { makeRng } from '../core/rng.js';
import { Grid } from './grid.js';
import { findPath } from './pathfinding.js';
import { setRelief, RELIEF } from './relief.js';
import { buildLandscape, groundOk, countRoutes, RIVER_SIZE } from './landscape.js';
import { openBridges } from './river.js';

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
 * river: je ein Fluss vor jeder Startecke mit Brücken und Furten (v4.53; ohne ihn bleibt jede Karte wie zuvor).
 * @returns {{ width, height, tile, obstacles: {x,y,r}[], town: {roads, buildings, parks, cars, trees, fields}, trees: {x,y,r}[] (Bäume außerhalb der Stadt; wie die Stadtbäume blockierend), spawns: {x,y}[], zone: {x,y,r}, crates: {x,y}[] (Versorgungskisten), relief: string (Höhengelände, relief.js), fords?: {x,y,r}[], bridges?: {x1,y1,x2,y2}[] (nur mit Fluss) }}
 */
export function generateMap(seed, { river = false } = {}) {
  for (let k = 0; k < MAX_ATTEMPTS; k++) {
    const map = tryBuild(seed + k, river);
    if (map) return map;
  }
  throw new Error('Karte konnte nicht erzeugt werden');
}

function tryBuild(seed, river = false) {
  const rng = makeRng(seed);
  // 0. Gelände: Hügel, Bergrücken und Seen (wahlweise Flüsse); Zufahrten, Bahn, Startpunkte und Stadt bleiben frei befahrbar
  const land = buildLandscape(seed, { spawns: SPAWNS, zone: { x: CX, y: CY, r: ZONE_R }, roads: accessRoads(), railY: CY }, { river });
  const { relief, fords, bridges, clearings, crossings } = land;
  if (!gentleZone(relief)) return null;
  const cleared = (x, y, r) => clearings.some((c) => dist(x, y, c.x, c.y) < c.r + r); // Zufahrt einer Brücke oder Furt
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
      if (cleared(x, y, r)) continue; // die Zufahrten sind punktsymmetrisch: das Spiegelbild ist damit auch frei
      ob = { x, y, r };
    }
    if (!ob) return null;
    obstacles.push(ob, { x: W - ob.x, y: H - ob.y, r: ob.r });
  }

  // 2. Zusammenhang prüfen: Spawn 0 erreicht Zonenmitte (auf mehreren Wegen) und Spawn 1
  const town = buildTown(rng);
  if (river) town.roads = cutRoads(town.roads, relief); // Feldwege enden am Ufer, die Brücke trägt sie hinüber
  const outposts = buildOutposts(rng, obstacles, relief, clearings);
  town.buildings.push(...outposts.buildings);
  const trees = scatterTrees(rng, obstacles, [...outposts.areas, ...clearings], relief);
  const grid = blockGrid(obstacles, town.buildings, [...town.trees, ...trees], relief, fords, bridges);
  if (!isConnected(grid)) return null;
  if (river && !crossingsOk(grid, crossings)) return null;
  // 3. Versorgungskisten zuletzt: die Zufallszahlen davor (und damit alle bisherigen Karten) bleiben gleich
  const crates = placeCrates(rng, grid);
  // 4. Äcker, Weiden und Feldwege mit eigenem Zufall (nur Boden): auch die Kisten bleiben je Seed, wo sie waren
  placeFarms(seed, town, outposts.buildings, obstacles, trees, relief);

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
    ...(river ? { fords, bridges } : {}),
  };
  setRelief(map, relief);
  return map;
}

const CROSS_REGION = 1500; // so viele Zellen erreicht man von jedem Ufer einer Querung mindestens (sonst liegt sie in einer Tasche)

/** Zellen, die von (x, y) aus erreichbar sind, höchstens cap (Breitensuche); within: nur in diesem Kreis {x, y, r}. */
function regionSize(grid, x, y, cap, within = null, goal = null) {
  const c0 = grid.toCell(x);
  const r0 = grid.toCell(y);
  if (!grid.passable(c0, r0, 0)) return { n: 0, hit: false };
  const gi = goal ? grid.idx(grid.toCell(goal.x), grid.toCell(goal.y)) : -1;
  const seen = new Set([grid.idx(c0, r0)]);
  const queue = [grid.idx(c0, r0)];
  for (let k = 0; k < queue.length && seen.size < cap; k++) {
    const i = queue[k];
    if (i === gi) return { n: seen.size, hit: true };
    const c = i % grid.cols;
    const r = (i - c) / grid.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (!grid.passable(nc, nr, 0)) continue;
      if (within && dist(grid.center(nc), grid.center(nr), within.x, within.y) > within.r) continue;
      const j = grid.idx(nc, nr);
      if (seen.has(j)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return { n: seen.size, hit: seen.has(gi) };
}

/**
 * Jede Brücke und Furt führt wirklich hinüber: beide Ufer (RW + 250 px quer zur Mitte) sind frei, auf kurzem Weg über die Querung
 * verbunden und gehören, wenn alle Querungen gesperrt sind, je zu einem großen Gebiet (keine Tasche hinter Fels oder See).
 */
function crossingsOk(grid, crossings) {
  const off = RIVER_SIZE.halfW + 250;
  const banks = crossings.map((q) => [
    { x: q.x - q.nx * off, y: q.y - q.ny * off },
    { x: q.x + q.nx * off, y: q.y + q.ny * off },
  ]);
  for (let k = 0; k < crossings.length; k++) {
    const [a, b] = banks[k];
    if (!regionSize(grid, a.x, a.y, Infinity, { x: crossings[k].x, y: crossings[k].y, r: off + 200 }, b).hit) return false;
  }
  // alle Querungen zu: Brücken wieder gesperrt, Furten auch
  const closed = new Grid(grid.cols, grid.rows, grid.tile);
  closed.terrain.set(grid.terrain);
  closed.struct.set(grid.struct);
  for (const i of grid.bridgeCells ?? []) closed.terrain[i] = 1;
  if (grid.ford) for (let i = 0; i < grid.ford.length; i++) if (grid.ford[i]) closed.terrain[i] = 1;
  return banks.every((pair) => pair.every((p) => regionSize(closed, p.x, p.y, CROSS_REGION).n >= CROSS_REGION));
}

/** Straßen ohne ihre Stücke über Wasser (Abtastung alle 8 px); was kürzer als 40 px bleibt, entfällt. */
function cutRoads(roads, relief) {
  const out = [];
  for (const r of roads) {
    const len = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
    const n = Math.max(1, Math.ceil(len / 8));
    const wet = (i) => relief.heightAt(r.x1 + ((r.x2 - r.x1) * i) / n, r.y1 + ((r.y2 - r.y1) * i) / n) < RELIEF.water + 1;
    let start = null;
    const push = (i0, i1) => {
      if (((i1 - i0) / n) * len < 40) return;
      const at = (i) => [Math.round(r.x1 + ((r.x2 - r.x1) * i) / n), Math.round(r.y1 + ((r.y2 - r.y1) * i) / n)];
      const [x1, y1] = at(i0);
      const [x2, y2] = at(i1);
      out.push({ ...r, x1, y1, x2, y2 });
    };
    for (let i = 0; i <= n; i++) {
      if (!wet(i)) start ??= i;
      else if (start !== null) {
        push(start, i - 1);
        start = null;
      }
    }
    if (start === 0) out.push(r);
    else if (start !== null) push(start, n);
  }
  return out;
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

/** Raster mit allem, was den Weg versperrt (wie im Spiel: Furten passierbar, Brücken offen). */
function blockGrid(obstacles, buildings, trees, relief, fords = [], bridges = []) {
  const grid = new Grid(W / TILE, H / TILE, TILE);
  grid.rasterizeObstacles(obstacles);
  grid.rasterizeRects(buildings);
  grid.rasterizeTrees(trees);
  grid.rasterizeRelief(relief, fords);
  grid.bridgeCells = openBridges(grid, bridges, relief).flat(); // geöffnete Fahrbahnzellen (Prüfung der Querungen)
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
function buildOutposts(rng, obstacles, relief = null, clearings = []) {
  const buildings = [];
  const areas = [];
  const fits = (x, y, r) =>
    clearings.every((c) => dist(x, y, c.x, c.y) > c.r + r) && // Zufahrten der Brücken und Furten (punktsymmetrisch)
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

const FARM_CHANCE = 0.75; // so viele Einzelhäuser außerhalb der Zone werden Gehöfte mit Feldern
const FARM_TRIES = 8; // Anordnungen je Gehöft (die mit der meisten Feldfläche gewinnt)
const FIELD_BLOCKS = 8; // freie Flure (Paare): zwei Feldreihen beiderseits eines Feldwegs, ohne Haus
const FIELD_GAP = 24; // Feldrain zwischen zwei Feldern
const FIELD_YARD = 54; // Abstand Haus–Feldreihe (darin läuft der Feldweg entlang)
const TRACK_W = 26; // Feldweg
const TRACK_REACH = 1800; // so weit führt ein Feldweg höchstens zur nächsten Straße oder zum Nachbargehöft
const CROP_ROLL = [['wheat', 0.35], ['green', 0.6], ['soil', 0.8], ['rape', 1]]; // Weizen, junge Saat, gepflügt, Raps

/** Punkt im (gedrehten) Rechteck {x, y, w, h, angle}, Rand um pad erweitert. */
function inBox(b, px, py, pad = 0) {
  const a = b.angle || 0;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const lx = (px - b.x) * c + (py - b.y) * sn;
  const ly = -(px - b.x) * sn + (py - b.y) * c;
  return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad;
}

/** Abstand eines Punkts zur Strecke, mit Fußpunkt. */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return { d: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), x: x1 + t * dx, y: y1 + t * dy };
}

/** Stützpunkte über die Fläche eines Felds (Raster alle ~40 px, Ränder eingeschlossen). */
function fieldPoints(f) {
  const pts = [];
  const nx = Math.max(1, Math.ceil(f.w / 40));
  const ny = Math.max(1, Math.ceil(f.h / 40));
  const c = Math.cos(f.angle || 0);
  const sn = Math.sin(f.angle || 0);
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const lx = (i / nx - 0.5) * f.w;
      const ly = (j / ny - 0.5) * f.h;
      pts.push([f.x + lx * c - ly * sn, f.y + lx * sn + ly * c]);
    }
  }
  return pts;
}

const boxR = (b) => Math.hypot(b.w, b.h) / 2;

/**
 * Äcker und Weiden, punktsymmetrisch: um die Einzelhäuser außerhalb der Zone (Gehöfte) je eine Reihe von 1–3 Feldern auf einer Seite
 * des Hauses mit einem Feldweg zwischen Haus und Feldern; dazu freie Flure (zwei Feldreihen beiderseits eines Feldwegs). Feldwege
 * führen weiter zur nächsten Straße, zu einem anderen Feldweg oder zum Nachbargehöft. Nur Boden: Felder und Feldwege blockieren
 * nichts, Bäume darauf fallen weg. Eigener Zufall, damit der Rest der Karte je Seed gleich bleibt.
 * Schreibt town.fields und hängt die Feldwege an town.roads (dirt) an.
 */
function placeFarms(seed, town, outpostBuildings, obstacles, trees, relief) {
  const rng = makeRng((Math.imul(seed, 2654435761) ^ 0x5eed) >>> 0);
  const fields = [];
  const tracks = [];
  const roads = town.roads;
  const buildings = town.buildings;
  const dry = (x, y) => !relief || groundOk(relief, x, y);
  // Feld frei? Erst grob nach Abstand vorsortieren, dann jeden Stützpunkt (und sein Spiegelbild) prüfen
  const fieldOk = (f) => {
    const R = boxR(f);
    const sides = [[f.x, f.y], [W - f.x, H - f.y]];
    const near = (list, r) => list.filter((o) => sides.some(([x, y]) => dist(x, y, o.x, o.y) < R + r(o)));
    const obs = near(obstacles, (o) => o.r + 20);
    const bld = near(buildings, (b) => boxR(b) + 25);
    const fld = near(fields, (o) => boxR(o) + FIELD_GAP);
    const rds = roads.filter((r) => sides.some(([x, y]) => segDist(x, y, r.x1, r.y1, r.x2, r.y2).d < R + r.w));
    return fieldPoints(f).every(([x, y]) =>
      [[x, y], [W - x, H - y]].every(
        ([px, py]) =>
          px > 150 && py > 150 && px < W - 150 && py < H - 150 &&
          !inRail(py, 30) &&
          dist(px, py, CX, CY) > ZONE_R + 120 &&
          SPAWNS.every((sp) => dist(px, py, sp.x, sp.y) > 650) &&
          obs.every((o) => dist(px, py, o.x, o.y) > o.r + 15) &&
          bld.every((b) => !inBox(b, px, py, 20)) &&
          fld.every((o) => !inBox(o, px, py, FIELD_GAP / 2)) &&
          rds.every((r) => segDist(px, py, r.x1, r.y1, r.x2, r.y2).d > r.w / 2 + 12) &&
          dry(px, py),
      ),
    );
  };
  // Feldweg von A nach B: frei von Wald, Wasser, fremden Gebäuden und Feldern (Haus am Anfang/Ende und ihr Spiegelbild zählen nicht)
  const mine = (b, o) => !!o && ((b.x === o.x && b.y === o.y) || (b.x === W - o.x && b.y === H - o.y));
  const trackOk = (x1, y1, x2, y2, ownA = null, ownB = null) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 30));
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n;
      const y = y1 + ((y2 - y1) * i) / n;
      for (const [px, py] of [[x, y], [W - x, H - y]]) {
        if (px < 60 || py < 60 || px > W - 60 || py > H - 60 || dist(px, py, CX, CY) < ZONE_R - 60) return false;
        if (obstacles.some((o) => dist(px, py, o.x, o.y) < o.r + 8)) return false;
        if (buildings.some((b) => !mine(b, ownA) && !mine(b, ownB) && inBox(b, px, py, 6))) return false;
        if (fields.some((f) => inBox(f, px, py, -4))) return false;
        if (!dry(px, py)) return false;
      }
    }
    return true;
  };
  const addTrack = (x1, y1, x2, y2) => {
    const r = { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), w: TRACK_W, dirt: true };
    const m = { x1: W - r.x1, y1: H - r.y1, x2: W - r.x2, y2: H - r.y2, w: TRACK_W, dirt: true };
    tracks.push(r, m);
    return [r, m];
  };
  // Blickrahmen: u zeigt von der Mitte zur Feldreihe, v läuft die Reihe entlang; Seite 0–3 = rechts, unten, links, oben (gedreht um angle)
  const frame = (angle, side) => {
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    const alongX = side % 2 === 0;
    const sg = side < 2 ? 1 : -1;
    const u = alongX ? [c * sg, sn * sg] : [-sn * sg, c * sg];
    return { angle, alongX, u, v: [-u[1], u[0]] };
  };
  const randAngle = () => (rng.next() < 0.4 ? 0 : Math.round(rng.range(-0.35, 0.35) * 100) / 100);
  const randWidths = (lo, hi) => {
    const out = [];
    for (let k = rng.int(lo, hi); k > 0; k--) out.push(Math.round(rng.range(170, 320)));
    return out;
  };
  // Feldreihe um (ax, ay): Felder der Tiefe `depth` nebeneinander entlang v, ihre Mitte bei u = uc; nur die freien kommen mit
  const row = (ax, ay, fr, uc, depth, widths, shift) => {
    const total = widths.reduce((a, b) => a + b, 0) + FIELD_GAP * (widths.length - 1);
    let v = -total / 2 + shift;
    const out = [];
    for (const wv of widths) {
      const vc = v + wv / 2;
      v += wv + FIELD_GAP;
      const roll = rng.next();
      const cr = rng.next();
      const f = {
        x: Math.round(ax + fr.u[0] * uc + fr.v[0] * vc),
        y: Math.round(ay + fr.u[1] * uc + fr.v[1] * vc),
        w: fr.alongX ? depth : wv,
        h: fr.alongX ? wv : depth,
        ...(fr.angle ? { angle: fr.angle } : {}),
        kind: roll < 0.3 ? 'pasture' : 'field',
      };
      if (f.kind === 'field') f.crop = CROP_ROLL.find(([, p]) => cr <= p)[0];
      if (fieldOk(f)) out.push({ f, v0: vc - wv / 2, v1: vc + wv / 2 });
    }
    return out;
  };
  const area = (list) => list.reduce((a, c) => a + c.f.w * c.f.h, 0);
  const commit = (list) => {
    for (const { f } of list) fields.push(f, { ...f, x: W - f.x, y: H - f.y });
  };
  // Weg entlang v bei u = ut über die Spanne [v0, v1] um (ax, ay)
  const lane = (ax, ay, fr, ut, v0, v1) => [ax + fr.u[0] * ut + fr.v[0] * v0, ay + fr.u[1] * ut + fr.v[1] * v0, ax + fr.u[0] * ut + fr.v[0] * v1, ay + fr.u[1] * ut + fr.v[1] * v1];

  // 1. Gehöfte: Feldreihe neben dem Haus, Feldweg dazwischen
  const farms = [];
  for (let i = 0; i < outpostBuildings.length; i += 2) {
    const h = outpostBuildings[i];
    if (h.kind !== 'house' || rng.next() >= FARM_CHANCE) continue;
    let best = null;
    for (let t = 0; t < FARM_TRIES; t++) {
      const fr = frame(randAngle(), rng.int(0, 3));
      const halfU = (Math.abs(fr.u[0]) * h.w + Math.abs(fr.u[1]) * h.h) / 2;
      const depth = Math.round(rng.range(170, 300));
      const got = row(h.x, h.y, fr, halfU + FIELD_YARD + depth / 2, depth, randWidths(1, 3), rng.range(-60, 60));
      if (got.length && (!best || area(got) > area(best.got))) best = { fr, halfU, got };
    }
    if (!best) continue;
    commit(best.got);
    const v0 = Math.min(0, ...best.got.map((c) => c.v0)) - 10;
    const v1 = Math.max(0, ...best.got.map((c) => c.v1)) + 10;
    const ln = lane(h.x, h.y, best.fr, best.halfU + FIELD_YARD / 2, v0, v1);
    const own = trackOk(...ln, h) ? addTrack(...ln) : [];
    farms.push({ x: h.x, y: h.y, b: h, ends: [[h.x, h.y]], own });
  }
  // 2. Freie Flure: zwei Feldreihen beiderseits eines Feldwegs
  for (let i = 0; i < FIELD_BLOCKS; i++) {
    for (let t = 0; t < 40; t++) {
      const x = rng.range(400, W - 400);
      const y = rng.range(400, H - 400);
      if (dist(x, y, CX, CY) < ZONE_R + 400) continue;
      const angle = randAngle();
      const fr = frame(angle, 0);
      const back = frame(angle, 2);
      const depth = Math.round(rng.range(180, 300));
      const uc = TRACK_W / 2 + FIELD_GAP / 2 + depth / 2;
      const widths = randWidths(2, 3);
      const got = [...row(x, y, fr, uc, depth, widths, 0), ...row(x, y, back, uc, depth, widths, 0).map((c) => ({ ...c, v0: -c.v1, v1: -c.v0 }))];
      if (got.length < 3) continue;
      commit(got);
      const ln = lane(x, y, fr, 0, Math.min(...got.map((c) => c.v0)) - 10, Math.max(...got.map((c) => c.v1)) + 10);
      const own = trackOk(...ln) ? addTrack(...ln) : [];
      farms.push({ x, y, b: null, ends: [[ln[0], ln[1]], [ln[2], ln[3]]], own });
      break;
    }
  }
  // 3. Anbindung: vom Haus bzw. Wegende zur nächsten Straße oder einem schon gebauten Feldweg, sonst zum nächsten Gehöft
  for (const fm of farms) {
    const cands = [];
    for (const [sx, sy] of fm.ends) {
      for (const r of [...roads, ...tracks]) {
        if (fm.own.includes(r)) continue; // der eigene Weg an der Feldreihe bindet nicht an
        const q = segDist(sx, sy, r.x1, r.y1, r.x2, r.y2);
        if (q.d > 40 && q.d < TRACK_REACH) cands.push({ d: q.d, sx, sy, x: q.x, y: q.y, to: null });
      }
      for (const o of farms) {
        const d = dist(sx, sy, o.x, o.y);
        if (o !== fm && o.b && d < TRACK_REACH) cands.push({ d: d * 1.15, sx, sy, x: o.x, y: o.y, to: o.b });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (const q of cands.slice(0, 8)) {
      if (!trackOk(q.sx, q.sy, q.x, q.y, fm.b, q.to)) continue;
      addTrack(q.sx, q.sy, q.x, q.y);
      break;
    }

  }
  // Bäume auf Feldern und Feldwegen fallen weg (paarweise: Felder und Wege sind punktsymmetrisch)
  for (let i = trees.length - 1; i >= 0; i--) {
    const t = trees[i];
    if (fields.some((f) => inBox(f, t.x, t.y, t.r)) || tracks.some((r) => segDist(t.x, t.y, r.x1, r.y1, r.x2, r.y2).d < r.w / 2 + t.r)) trees.splice(i, 1);
  }
  town.fields = fields;
  roads.push(...tracks);
}
