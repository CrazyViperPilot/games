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

test('Hindernisse und Vorkommen sind punktsymmetrisch', () => {
  const map = generateMap(3);
  for (const o of map.obstacles) {
    assert.ok(
      map.obstacles.some((p) => p.x === W - o.x && p.y === H - o.y && p.r === o.r),
      `kein Partner für Hindernis (${o.x}, ${o.y})`,
    );
  }
  for (const n of map.nodes) {
    assert.ok(
      map.nodes.some((p) => p.type === n.type && p.x === W - n.x && p.y === H - n.y),
      `kein Partner für Vorkommen ${n.id}`,
    );
  }
});

test('Spawns liegen auf der Karte und sind punktsymmetrisch', () => {
  const map = generateMap(4);
  assert.deepStrictEqual(map.spawns, [
    { x: 600, y: 4200 },
    { x: 4200, y: 600 },
  ]);
  assert.deepStrictEqual(map.zone, { x: W / 2, y: H / 2, r: BALANCE.zone.r });
});

test('kein Vorkommen im 700-px-Umkreis eines Spawns (§12.2)', () => {
  for (const seed of [1, 2, 3, 5, 6, 7, 8, 13]) {
    const map = generateMap(seed);
    for (const s of map.spawns) {
      for (const n of map.nodes) {
        assert.ok(Math.hypot(n.x - s.x, n.y - s.y) > 700, `Seed ${seed}: Vorkommen ${n.id} bei Spawn`);
      }
    }
  }
});

test('je 3 Vorkommen-Paare pro Sorte, 2 Paare in der Zone, übrige im Band 900–2200 px um einen Spawn', () => {
  for (const seed of [1, 2, 3, 5, 6, 7, 8, 13]) {
    const map = generateMap(seed);
    const ids = new Set(map.nodes.map((n) => n.type));
    assert.deepStrictEqual([...ids].sort(), ['bm', 'fuel', 'mun']);
    for (const t of ['bm', 'mun', 'fuel']) {
      assert.equal(map.nodes.filter((n) => n.type === t).length, 6, `Seed ${seed}: Sorte ${t}`);
    }
    const inZone = map.nodes.filter((n) => Math.hypot(n.x - map.zone.x, n.y - map.zone.y) <= map.zone.r);
    assert.equal(inZone.length, 4, `Seed ${seed}: 2 Paare in der Zone`);
    for (const n of map.nodes) {
      if (inZone.includes(n)) continue;
      const d = Math.min(...map.spawns.map((s) => Math.hypot(n.x - s.x, n.y - s.y)));
      assert.ok(d >= 900 && d <= 2200, `Seed ${seed}: Vorkommen ${n.id} im Abstand ${d.toFixed(0)} zum Spawn`);
    }
  }
});

test('Vorkommen-IDs sind 1..n und haben Mindestabstand', () => {
  const map = generateMap(6);
  assert.equal(map.nodes.length, 18, '9 Paare');
  map.nodes.forEach((n, i) => assert.equal(n.id, i + 1));
  for (let i = 0; i < map.nodes.length; i++) {
    for (let j = i + 1; j < map.nodes.length; j++) {
      const a = map.nodes[i];
      const b = map.nodes[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 250, `Vorkommen ${a.id} und ${b.id} zu nah`);
    }
  }
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
