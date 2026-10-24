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
