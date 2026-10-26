// Kartendaten für Karteneditor und gespeicherte Karten: Format, Prüfung, Speicher (localStorage). Kein DOM-Zugriff außer localStorage.
import { BALANCE } from '../data/balance.js';
import { Grid } from './grid.js';
import { findPath } from './pathfinding.js';
import { Relief, reliefOf } from './relief.js';
import { countRoutes } from './landscape.js';

const W = BALANCE.map.width;
const H = BALANCE.map.height;
const TILE = BALANCE.map.tile;
export const MAP_FORMAT = 1;
export const BUILDING_KINDS = ['house', 'factory', 'hall', 'tower', 'train', 'station', 'platform', 'wall']; // wall: Mauer um Fabrikgelände
const TURNABLE = ['train', 'platform']; // dürfen beliebig gedreht sein (`angle`, Bogenmaß)
const SPAWN_CLEAR = 180; // freier Platz um einen Startpunkt (Haupt-FOB und Startunits)

/** Leere Karte: nur Startpunkte in den Ecken und die Konfliktzone in der Mitte. */
export function createEmptyMap(name = 'Neue Karte') {
  return normalizeMap({
    name,
    obstacles: [],
    town: { roads: [], buildings: [], parks: [], cars: [], trees: [], rails: [] },
    trees: [],
    spawns: [
      { x: 700, y: H - 700 },
      { x: W - 700, y: 700 },
    ],
    zone: { x: W / 2, y: H / 2, r: BALANCE.zone.r },
  });
}

const num = (v, d) => (Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Beliebiges Kartenobjekt (generiert oder aus JSON) → vollständige, bereinigte Karte. Wirft bei unbrauchbaren Daten. */
export function normalizeMap(src) {
  if (!src || typeof src !== 'object') throw new Error('Keine Karte');
  const town = src.town ?? {};
  const pt = (o) => ({ x: clamp(num(o.x, 0), 0, W), y: clamp(num(o.y, 0), 0, H) });
  const circ = (o, lo, hi) => ({ ...pt(o), r: clamp(num(o.r, lo), lo, hi) });
  const arr = (a) => (Array.isArray(a) ? a : []);
  const spawns = arr(src.spawns).map(pt);
  if (spawns.length !== 2) throw new Error('Eine Karte braucht genau zwei Startpunkte');
  const zone = circ(src.zone ?? { x: W / 2, y: H / 2, r: BALANCE.zone.r }, 200, 4000);
  // Gleise: freie Strecken; die ältere Form (eine Bahnlinie quer über die Karte, `rail: {y}`) wird übernommen
  const railSrc = arr(town.rails).slice();
  if (town.rail && Number.isFinite(town.rail.y)) railSrc.push({ x1: 0, y1: town.rail.y, x2: W, y2: town.rail.y });
  const rails = railSrc.map((r) => ({
    x1: clamp(num(r.x1, 0), 0, W),
    y1: clamp(num(r.y1, 0), 0, H),
    x2: clamp(num(r.x2, 0), 0, W),
    y2: clamp(num(r.y2, 0), 0, H),
  }));
  return {
    name: String(src.name ?? 'Karte').slice(0, 40),
    width: W,
    height: H,
    tile: TILE,
    obstacles: arr(src.obstacles).map((o) => circ(o, 20, 400)),
    town: {
      roads: arr(town.roads).map((r) => ({
        x1: clamp(num(r.x1, 0), 0, W),
        y1: clamp(num(r.y1, 0), 0, H),
        x2: clamp(num(r.x2, 0), 0, W),
        y2: clamp(num(r.y2, 0), 0, H),
        w: clamp(num(r.w, 64), 20, 200),
        ...(r.dirt ? { dirt: true } : {}),
      })),
      buildings: arr(town.buildings).map((b) => ({
        ...pt(b),
        w: clamp(num(b.w, 90), 24, 600),
        h: clamp(num(b.h, 70), 24, 600),
        kind: BUILDING_KINDS.includes(b.kind) ? b.kind : 'house',
        ...(TURNABLE.includes(b.kind) && Number.isFinite(b.angle) && Math.abs(b.angle) > 1e-3 ? { angle: clamp(b.angle, -Math.PI * 2, Math.PI * 2) } : {}),
        ...(b.kind === 'train' ? { part: ['loco', 'container', 'tank'].includes(b.part) ? b.part : 'container' } : {}),
      })),
      parks: arr(town.parks).map((p) => circ(p, 40, 400)),
      cars: arr(town.cars).map((c) => ({ ...pt(c), vertical: !!c.vertical, color: String(c.color || '#b8b8b0').slice(0, 9) })),
      trees: arr(town.trees).map((t) => circ(t, 6, 40)),
      rails,
    },
    trees: arr(src.trees).map((t) => circ(t, 6, 40)),
    spawns,
    zone,
    // Höhengelände (relief.js) als Text; fehlt es oder ist es kaputt, ist die Karte flach
    ...(typeof src.relief === 'string' && Relief.decode(src.relief) ? { relief: src.relief } : {}),
  };
}

export const cloneMap = (m) => normalizeMap(JSON.parse(JSON.stringify(m)));

/** Umschließendes Rechteck eines (evtl. gedrehten) Gebäudes: {x, y, w, h}. */
export function footprint(b) {
  if (!b.angle) return { x: b.x, y: b.y, w: b.w, h: b.h };
  const c = Math.abs(Math.cos(b.angle));
  const s = Math.abs(Math.sin(b.angle));
  return { x: b.x, y: b.y, w: b.w * c + b.h * s, h: b.w * s + b.h * c };
}

/** Rechtecke, die den Weg versperren: alle Gebäude außer Bahnsteigen (begehbar), gedrehte als Umschließendes. */
export function blockers(buildings) {
  return buildings.filter((b) => b.kind !== 'platform').map(footprint);
}

/** Zusammenfassung für Menü und Editor. */
export function describeMap(m) {
  const t = m.town;
  return { buildings: t.buildings.length, roads: t.roads.length, trees: t.trees.length + m.trees.length, obstacles: m.obstacles.length };
}

/**
 * Prüft, ob die Karte spielbar ist. Liefert eine Liste Probleme (leer = in Ordnung).
 * Startpunkte brauchen freien Platz, und von Start 1 müssen Zonenmitte und Start 2 erreichbar sein.
 */
export function checkMap(map) {
  const problems = [];
  const hit = (x, y, r) => {
    for (const o of map.obstacles) if (Math.hypot(o.x - x, o.y - y) < o.r + r) return true;
    for (const b of blockers(map.town.buildings)) if (Math.abs(b.x - x) < b.w / 2 + r && Math.abs(b.y - y) < b.h / 2 + r) return true;
    for (const t of [...map.town.trees, ...map.trees]) if (Math.hypot(t.x - x, t.y - y) < t.r + r) return true;
    return false;
  };
  map.spawns.forEach((s, i) => {
    if (s.x < 250 || s.y < 250 || s.x > W - 250 || s.y > H - 250) problems.push(`Startpunkt ${i + 1} liegt zu nah am Kartenrand`);
    if (hit(s.x, s.y, SPAWN_CLEAR)) problems.push(`Startpunkt ${i + 1}: Gebäude, Bäume oder Hindernisse im Umkreis von ${SPAWN_CLEAR} px`);
  });
  if (Math.hypot(map.spawns[0].x - map.spawns[1].x, map.spawns[0].y - map.spawns[1].y) < 2500) problems.push('Die Startpunkte liegen zu nah beieinander');
  const relief = reliefOf(map);
  if (relief) {
    map.spawns.forEach((s, i) => {
      const c0 = Math.floor((s.x - SPAWN_CLEAR) / TILE);
      const r0 = Math.floor((s.y - SPAWN_CLEAR) / TILE);
      let bad = false;
      for (let r = r0; r <= Math.floor((s.y + SPAWN_CLEAR) / TILE) && !bad; r++) {
        for (let c = c0; c <= Math.floor((s.x + SPAWN_CLEAR) / TILE) && !bad; c++) {
          if (c < 0 || r < 0 || c >= W / TILE || r >= H / TILE) continue;
          if (Math.hypot((c + 0.5) * TILE - s.x, (r + 0.5) * TILE - s.y) <= SPAWN_CLEAR && relief.cellBlocked(c, r)) bad = true;
        }
      }
      if (bad) problems.push(`Startpunkt ${i + 1}: Gelände zu steil oder unter Wasser`);
    });
  }
  if (problems.length) return problems;
  const grid = mapGrid(map);
  const [a, b] = map.spawns;
  const reaches = (path, x, y) => path.length > 0 && Math.hypot(path[path.length - 1].x - x, path[path.length - 1].y - y) < TILE * 2;
  if (hit(map.zone.x, map.zone.y, 40)) {
    // Zonenmitte verstellt: einen Punkt am Zonenrand prüfen
    const zx = map.zone.x + map.zone.r * 0.5;
    if (!reaches(findPath(grid, a.x, a.y, zx, map.zone.y, 0), zx, map.zone.y)) problems.push('Die Konfliktzone ist von Startpunkt 1 nicht erreichbar');
  } else if (!reaches(findPath(grid, a.x, a.y, map.zone.x, map.zone.y, 0), map.zone.x, map.zone.y)) {
    problems.push('Die Konfliktzone ist von Startpunkt 1 nicht erreichbar');
  }
  if (!reaches(findPath(grid, a.x, a.y, b.x, b.y, 0), b.x, b.y)) problems.push('Startpunkt 2 ist von Startpunkt 1 nicht erreichbar');
  if (!reaches(findPath(grid, b.x, b.y, map.zone.x, map.zone.y, 0), map.zone.x, map.zone.y) && !problems.length) problems.push('Die Konfliktzone ist von Startpunkt 2 nicht erreichbar');
  return problems;
}

/** Raster mit allen Hindernissen der Karte (Gelände eingeschlossen), wie im Spiel. */
function mapGrid(map) {
  const grid = new Grid(W / TILE, H / TILE, TILE);
  grid.rasterizeObstacles(map.obstacles);
  grid.rasterizeRects(blockers(map.town.buildings));
  grid.rasterizeTrees([...map.town.trees, ...map.trees]);
  grid.rasterizeRelief(reliefOf(map));
  return grid;
}

/**
 * Getrennte Zugänge von jedem Startpunkt in die Konfliktzone (höchstens want), wie der Kartengenerator sie zählt: Wege,
 * die sich außerhalb von Startgelände und Zone nicht berühren. Für „Prüfen“ im Editor.
 */
export function accessRoutes(map, want = 4) {
  const grid = mapGrid(map);
  const z = map.zone;
  // Ziel: freie Zelle nächst der Zonenmitte (die Mitte selbst kann verbaut sein)
  let to = null;
  const zc = grid.toCell(z.x);
  const zr = grid.toCell(z.y);
  for (let d = 0; d < 30 && !to; d++) {
    for (let r = zr - d; r <= zr + d && !to; r++) {
      for (let c = zc - d; c <= zc + d; c++) {
        if (Math.max(Math.abs(c - zc), Math.abs(r - zr)) === d && grid.passable(c, r, 0)) {
          to = { x: grid.center(c), y: grid.center(r) };
          break;
        }
      }
    }
  }
  if (!to) return map.spawns.map(() => 0);
  return map.spawns.map((s) =>
    countRoutes(grid, s, to, {
      want,
      keepOut: [
        { x: s.x, y: s.y, r: 900 },
        { x: z.x, y: z.y, r: z.r },
      ],
    }),
  );
}

// ---- Speicher (localStorage) ------------------------------------------------------

const KEY = 'frontline-karten';

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // voll oder gesperrt
  }
}

/** Gespeicherte Karten: [{ id, name, saved, map }] (neueste zuerst). */
export function listMaps() {
  return readAll()
    .filter((e) => e && e.id && e.map)
    .sort((a, b) => (b.saved || 0) - (a.saved || 0));
}

export function loadMap(id) {
  const e = readAll().find((x) => x.id === id);
  if (!e) return null;
  try {
    return normalizeMap({ ...e.map, name: e.name });
  } catch {
    return null;
  }
}

/** Speichert eine Karte (neue ID, wenn keine angegeben). Liefert die ID oder null bei Speicherfehler. */
export function saveMap(map, id = null) {
  const list = readAll();
  const key = id || `k${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const entry = { id: key, name: map.name || 'Karte', saved: Date.now(), map };
  const i = list.findIndex((x) => x.id === key);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  return writeAll(list) ? key : null;
}

export function deleteMap(id) {
  return writeAll(readAll().filter((x) => x.id !== id));
}
