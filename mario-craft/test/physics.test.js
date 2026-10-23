import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { TILES, TILE_BY_ID, TILE_IDS, PICKS } from '../js/data/tiles.js';
import { parseLevel } from '../js/game/level.js';

const T = PHYS.tile;

// Baut ein Level aus `rows` Zeilen à `cols` Zeichen. Standard '.', Ausnahmen über `cells` ("c,r" → Zeichen).
// Unterste Zeile ist Stein (Z), damit Level gültig und der Boden fest ist.
function level(cells = {}, { cols = 12, rows = 8 } = {}) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      if (key in cells) s += cells[key];
      else s += r === rows - 1 ? 'Z' : '.';
    }
    out.push(s);
  }
  return out;
}

const BASE = { P: [1, 6], F: [10, 6], K: [3, 6] };
function baseCells(extra = {}) {
  const cells = {};
  for (const [ch, [c, r]] of Object.entries(BASE)) cells[`${c},${r}`] = ch;
  return { ...cells, ...extra };
}

test('Kachel-IDs und Lookup', () => {
  assert.equal(TILE_IDS.bedrock, 18);
  assert.equal(TILE_IDS.air, 0);
  assert.equal(TILE_IDS.spawner, 16);
  assert.equal(TILES.M.id, 16);
  assert.equal(TILES.S.art, 'blk_stone');
  assert.equal(TILE_BY_ID[40].kind, 'barrier');
  assert.equal(TILE_BY_ID[40].art, null);
  assert.equal(TILE_BY_ID[40].ch, null);
  assert.equal(TILE_BY_ID[41].kind, 'chestopen');
  assert.equal(TILE_BY_ID[41].ch, null);
  for (let x = 0; x < 64; x++) assert.ok(TILE_BY_ID[x], `TILE_BY_ID[${x}] fehlt`);
  assert.equal(TILE_BY_ID[63].kind, 'air');
});

test('Kachel-Eigenschaften nach PLAN §3', () => {
  assert.equal(TILES['='].oneWay, true);
  assert.equal(TILES['='].solid, false);
  assert.equal(TILES.H.climb, true);
  assert.equal(TILES.L.hazard, true);
  assert.equal(TILES.L.light, 15);
  assert.equal(TILES['~'].water, true);
  assert.equal(TILES.J.bounce, true);
  assert.equal(TILES.A.falls, true);
  assert.equal(TILES['4'].minPick, 2);
  assert.equal(TILES.X.minPick, 3);
  assert.equal(TILES.Z.hard, null);
  assert.equal(TILES['|'].light, 14);
  assert.equal(TILES.M.light, 3);
  assert.equal(TILES.G.climb, false);
  assert.deepEqual(TILES['1'].drop, { emeralds: 1 });
  assert.equal(TILES['4'].drop, 'diamond');
  assert.equal(TILES['5'].drop, 'silverfish');
  assert.equal(PICKS.length, 4);
  assert.equal(PICKS[3].name, 'diamond');
});

test('Parser: Kacheln, surface und Startpunkte', () => {
  const map = parseLevel({ id: 't', theme: 'overworld', rows: level(baseCells({ '4,3': '#', '5,4': 'S' })) });
  assert.equal(map.cols, 12);
  assert.equal(map.rows, 8);
  assert.ok(map.tiles instanceof Uint8Array);
  assert.equal(map.get(4, 3), TILES['#'].id);
  assert.equal(map.get(5, 4), TILES.S.id);
  assert.equal(map.get(1, 6), TILES['.'].id); // P ist keine Kachel
  assert.ok(map.surface instanceof Int16Array);
  assert.equal(map.surface[0], 7);
  assert.equal(map.surface[4], 3);
  assert.equal(map.surface[5], 4);
  assert.deepEqual(map.start, { x: 1.5 * T, y: 7 * T });
  assert.deepEqual(map.goal, { x: 10.5 * T, y: 7 * T });
  assert.deepEqual(map.checkpoint, { x: 3.5 * T, y: 7 * T });
  assert.equal(map.id, 't');
  assert.equal(map.theme, 'overworld');
  assert.deepEqual(map.chests, {});
  assert.equal(map.pick, 0);
  assert.equal(map.boss, undefined);
});

test('Parser: gems, diamonds, crystals, spawns', () => {
  const cells = baseCells({
    '2,1': 'o', '8,1': '*', '6,2': 'y',
    '2,5': 'c', '3,5': 'z', '4,5': 's', '5,5': 'r', '6,5': 'm', '7,5': 'f', '8,5': 'g', '9,5': 'e',
    '9,3': '@',
  });
  const map = parseLevel({ id: 'g', rows: level(cells) });

  assert.equal(map.gems.length, 2);
  assert.deepEqual(map.gems[0], { x: 2.5 * T, y: 2 * T, diamond: false, taken: false });
  assert.equal(map.gems[1].diamond, true);
  assert.equal(map.gems.filter((g) => g.diamond).length, 1);

  assert.deepEqual(map.crystals, [{ x: 6.5 * T, y: 3 * T }]);

  const types = map.spawns.map((s) => s.type);
  // Reihenfolge zeilenweise von oben: @ steht in Zeile 3, die Gegner in Zeile 5.
  assert.deepEqual(types, ['boss', 'zischer', 'zombie', 'skeleton', 'spider', 'slime', 'silverfish', 'glutgeist', 'leerenlaeufer']);
  assert.ok(map.spawns.every((s) => s.type !== 'crystal'), 'y darf kein Spawn sein');
  assert.deepEqual(map.spawns[0], { type: 'boss', x: 9.5 * T, y: 4 * T });
});

test('Parser: chests, pick und boss aus der Definition', () => {
  const map = parseLevel({
    id: 'c', theme: 'nether', boss: 'dreikopf', pick: 2,
    chests: { '4,6': 'bow', '5,6': 'emeralds' },
    rows: level(baseCells({ '7,3': '?' })),
  });
  assert.deepEqual(map.chests, { '4,6': 'bow', '5,6': 'emeralds' });
  assert.equal(map.pick, 2);
  assert.equal(map.boss, 'dreikopf');
  assert.equal(map.theme, 'nether');
});

test('get außerhalb der Ränder', () => {
  const map = parseLevel({ id: 'o', rows: level(baseCells(), { cols: 12, rows: 8 }) });
  assert.equal(map.get(-1, 3), TILE_IDS.bedrock);
  assert.equal(map.get(12, 3), TILE_IDS.bedrock);
  assert.equal(map.get(3, -1), TILE_IDS.bedrock);
  assert.equal(map.get(3, 8), TILE_IDS.air);
  assert.equal(map.get(3, 50), TILE_IDS.air);
  assert.equal(map.isSolid(-1, 0), true);
  assert.equal(map.isSolid(3, 8), false);
});

test('set und isSolid', () => {
  const map = parseLevel({ id: 's', rows: level(baseCells()) });
  map.set(0, 0, TILE_IDS.stone);
  assert.equal(map.get(0, 0), TILE_IDS.stone);
  assert.equal(map.isSolid(0, 0), true);
  assert.doesNotThrow(() => map.set(-1, 0, 1));
  assert.doesNotThrow(() => map.set(0, 99, 1));
});

test('Fehlerfälle werfen', () => {
  const ok = level(baseCells());
  const withCell = (key, ch) => level(baseCells({ [key]: ch }));
  assert.throws(() => parseLevel({ id: 'e', rows: level({ '10,6': 'F', '3,6': 'K' }) }), /kein P/);
  assert.throws(() => parseLevel({ id: 'e', rows: level({ '1,6': 'P', '3,6': 'K' }) }), /kein F/);
  assert.throws(() => parseLevel({ id: 'e', rows: withCell('5,6', 'P') }), /mehr als ein P/);
  assert.throws(() => parseLevel({ id: 'e', rows: withCell('5,6', 'F') }), /mehr als ein F/);
  assert.throws(() => parseLevel({ id: 'e', rows: withCell('5,6', 'K') }), /mehr als ein K/);
  assert.throws(() => parseLevel({ id: 'e', rows: withCell('5,6', 'q') }), /unbekanntes Zeichen/);
  assert.throws(() => parseLevel({ id: 'e', rows: level(baseCells({ '5,6': '@', '6,6': '@' })) }), /mehr als ein @/);
  assert.throws(() => parseLevel({ id: 'e', rows: ok.slice(0, 7) }), /Zeilen/);
  assert.throws(() => parseLevel({ id: 'e', rows: [...ok.slice(0, 7), ok[7] + '.'] }), /Zeile 7/);
  assert.throws(() => parseLevel({ id: 'e' }), /rows fehlt/);
});
