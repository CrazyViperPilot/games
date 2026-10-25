import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap } from '../js/game/map.js';
import { BALANCE } from '../js/data/balance.js';
import { Grid } from '../js/game/grid.js';
import { findPath } from '../js/game/pathfinding.js';

const W = BALANCE.map.width;
const H = BALANCE.map.height;
const TILE = BALANCE.map.tile;

function gridFor(map) {
  const g = new Grid(W / TILE, H / TILE, TILE);
  g.rasterizeObstacles(map.obstacles);
  return g;
}

test('gleicher Seed erzeugt identische Karte', () => {
  assert.deepStrictEqual(generateMap(7), generateMap(7));
});

test('verschiedene Seeds erzeugen verschiedene Karten', () => {
  // Seeds 10 und 1000 liegen nicht in der Wiederholungskette des jeweils anderen
  assert.notDeepStrictEqual(generateMap(10).obstacles, generateMap(1000).obstacles);
});

test('Hindernisse sind punktsymmetrisch', () => {
  const map = generateMap(3);
  for (const o of map.obstacles) {
    assert.ok(
      map.obstacles.some((p) => p.x === W - o.x && p.y === H - o.y && p.r === o.r),
      `kein Partner für Hindernis (${o.x}, ${o.y})`,
    );
  }
});

test('Spawns liegen auf der Karte und sind punktsymmetrisch', () => {
  const map = generateMap(4);
  assert.deepStrictEqual(map.spawns, [
    { x: 700, y: 8324 },
    { x: 8324, y: 700 },
  ]);
  assert.deepStrictEqual(map.zone, { x: W / 2, y: H / 2, r: BALANCE.zone.r });
});

test('die Karte hat keine Ressourcenvorkommen mehr (Haupt-FOB hat unendlich Vorrat)', () => {
  const map = generateMap(6);
  assert.equal(map.nodes, undefined);
});

test('Spawns sind von der Zone aus über Wege erreichbar', () => {
  for (const seed of [1, 2, 3, 8, 13]) {
    const map = generateMap(seed);
    const grid = gridFor(map);
    const [s0, s1] = map.spawns;
    const toZone = findPath(grid, s0.x, s0.y, map.zone.x, map.zone.y, 0);
    const last = toZone[toZone.length - 1];
    assert.ok(last && last.x === map.zone.x && last.y === map.zone.y, `Seed ${seed}: Zone nicht erreichbar`);
    const toEnemy = findPath(grid, s0.x, s0.y, s1.x, s1.y, 0);
    const lastEnemy = toEnemy[toEnemy.length - 1];
    assert.ok(lastEnemy && lastEnemy.x === s1.x && lastEnemy.y === s1.y, `Seed ${seed}: Spawns nicht verbunden`);
  }
});

test('Fabrikgelände: durch die Lücke hinein, um die Fabrik herum und auf der Gegenseite hinaus', () => {
  for (const seed of [7, 11, 123]) {
    const map = generateMap(seed);
    const grid = new Grid(W / TILE, H / TILE, TILE);
    grid.rasterizeObstacles(map.obstacles);
    grid.rasterizeRects(map.town.buildings);
    grid.rasterizeTrees([...map.town.trees, ...map.trees]);
    const walls = map.town.buildings.filter((b) => b.kind === 'wall');
    const factories = map.town.buildings.filter((b) => b.kind === 'factory' && walls.some((w) => Math.hypot(w.x - b.x, w.y - b.y) < 300));
    assert.ok(factories.length >= 6, `Fabrikgelände vorhanden (Seed ${seed})`);
    for (const f of factories) {
      const A = f.w / 2 + 80 + 60;
      const B = f.h / 2 + 80 + 60;
      let ok = false;
      for (const [ax, ay, bx, by] of [[f.x - A, f.y, f.x + A, f.y], [f.x, f.y - B, f.x, f.y + B]]) {
        const p = findPath(grid, ax, ay, bx, by, 0);
        const reached = p.length > 0 && p[p.length - 1].x === bx && p[p.length - 1].y === by;
        // der Weg muss ins Gelände führen, nicht um die ganze Mauer herum
        if (reached && p.some((q) => Math.abs(q.x - f.x) < A - 60 && Math.abs(q.y - f.y) < B - 60)) ok = true;
      }
      assert.ok(ok, `Fabrik bei ${f.x},${f.y} (Seed ${seed}) ist durch die Lücken befahrbar`);
    }
  }
});

test('keine Felsen: alle Hindernisse sind Wald (gerader Radius)', () => {
  for (const o of generateMap(7).obstacles) assert.equal(Math.round(o.r) % 2, 0);
});

test('vier Wachtürme am Zonenrand (oben, unten, links, rechts), punktsymmetrisch, ohne Überlappung', () => {
  for (const seed of [1, 7, 21]) {
    const map = generateMap(seed);
    const towers = map.town.buildings.filter((b) => b.kind === 'tower');
    assert.equal(towers.length, 4, `Seed ${seed}`);
    const { x: zx, y: zy, r } = map.zone;
    for (const t of towers) {
      const d = Math.hypot(t.x - zx, t.y - zy);
      assert.ok(d > r * 0.8 && d < r * 0.95, `Turm ${t.x},${t.y} liegt am Zonenrand (${Math.round(d)})`);
      assert.ok(towers.some((o) => o.x === W - t.x && o.y === H - t.y), 'Spiegelbild vorhanden');
      for (const b of map.town.buildings) {
        if (b === t) continue;
        const overlap = Math.abs(b.x - t.x) < (b.w + t.w) / 2 && Math.abs(b.y - t.y) < (b.h + t.h) / 2;
        assert.ok(!overlap, `Turm ${t.x},${t.y} überlappt ein Gebäude (${b.kind})`);
      }
    }
    const dirs = new Set(towers.map((t) => (Math.abs(t.x - zx) > Math.abs(t.y - zy) ? (t.x < zx ? 'links' : 'rechts') : t.y < zy ? 'oben' : 'unten')));
    assert.equal(dirs.size, 4, 'je ein Turm oben, unten, links, rechts');
  }
});
