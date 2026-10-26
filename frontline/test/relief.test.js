import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Relief, RELIEF, COARSE_N, FINE_N, reliefOf, setRelief } from '../js/game/relief.js';
import { generateMap } from '../js/game/map.js';
import { accessRoutes, checkMap, normalizeMap, createEmptyMap } from '../js/game/mapdata.js';
import { Grid } from '../js/game/grid.js';
import { BALANCE } from '../js/data/balance.js';

const W = BALANCE.map.width;
const TILE = BALANCE.map.tile;

test('Gelände: Speichern und Laden ergibt dieselben Höhen (2er-Schritte)', () => {
  const r = new Relief();
  for (let i = 0; i < r.coarse.length; i++) r.coarse[i] = Math.round(Math.sin(i * 0.37) * 60) * 2 + 100;
  r.refine();
  const back = Relief.decode(r.encode());
  assert.ok(back);
  assert.ok(back.coarse.every((v, i) => v === r.coarse[i]));
  assert.equal(Relief.decode('kaputt'), null);
  assert.equal(Relief.decode(btoa('zu kurz')), null);
});

test('Gelände: Teil-Neuberechnung (Editor-Pinsel) gleicht der vollen', () => {
  const a = new Relief();
  const b = new Relief();
  for (let j = 30; j <= 40; j++) {
    for (let i = 0; i <= 6; i++) {
      a.coarse[j * COARSE_N + i] += 50 + i * j;
      b.coarse[j * COARSE_N + i] += 50 + i * j;
    }
  }
  a.refine();
  b.refine(0, 30, 6, 40);
  assert.ok(b.fine.every((v, i) => v === a.fine[i]));
  assert.equal(b.hi, a.hi);
});

test('Gelände: Seen, Gipfel und zu steile Hänge sind im Raster Hindernisse, sanfte Hügel nicht', () => {
  const r = new Relief();
  const set = (i, j, h) => (r.coarse[j * COARSE_N + i] = h);
  for (let j = 10; j < 14; j++) for (let i = 10; i < 14; i++) set(i, j, -80); // See
  set(40, 40, 380); // Nadel: steil
  for (let j = 70; j < 80; j++) for (let i = 70; i < 80; i++) set(i, j, 40 + (i - 70) * 6); // sanfte Rampe (0,09)
  r.refine();
  const g = new Grid(W / TILE, W / TILE, TILE);
  g.rasterizeRelief(r);
  const cell = (x, y) => g.terrain[g.idx(g.toCell(x), g.toCell(y))];
  assert.equal(cell(12 * 64, 12 * 64), 1, 'See');
  assert.equal(cell(40 * 64 + 20, 40 * 64), 1, 'Steilhang');
  assert.equal(cell(75 * 64, 75 * 64), 0, 'Rampe begehbar');
  assert.equal(cell(4000, 6000), 0, 'flach');
  assert.equal(r.displayAt(12 * 64, 12 * 64), RELIEF.water, 'Wasser ist eben');
});

test('Kartengenerator: Gelände punktsymmetrisch, Zone sanft und frei, Starts frei, mindestens 3 Zugänge je Seite', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const map = generateMap(seed);
    const r = reliefOf(map);
    assert.ok(r, `Seed ${seed}: Gelände vorhanden`);
    assert.ok(r.hi > 150, `Seed ${seed}: es gibt Berge (höchster Punkt ${r.hi.toFixed(0)})`);
    for (let k = 0; k < 400; k++) {
      const x = (k * 977) % W;
      const y = (k * 1531) % W;
      assert.ok(Math.abs(r.heightAt(x, y) - r.heightAt(W - x, W - y)) < 1e-3, `Seed ${seed}: symmetrisch bei ${x},${y}`);
    }
    const z = map.zone;
    for (let row = 0; row < FINE_N - 1; row++) {
      for (let c = 0; c < FINE_N - 1; c++) {
        if (Math.hypot((c + 0.5) * TILE - z.x, (row + 0.5) * TILE - z.y) > z.r) continue;
        assert.ok(!r.cellBlocked(c, row) && r.cellSlope(c, row) <= 0.25, `Seed ${seed}: Zonenzelle ${c},${row} zu steil oder Wasser`);
      }
    }
    assert.deepEqual(checkMap(normalizeMap(map)), [], `Seed ${seed}: spielbar`);
    const routes = accessRoutes(normalizeMap(map), 3);
    assert.ok(routes.every((n) => n >= 3), `Seed ${seed}: Zugänge ${routes}`);
  }
});

test('Karteneditor-Daten: Gelände bleibt beim Normalisieren erhalten, kaputtes fällt weg, flache Karten bleiben flach', () => {
  const m = createEmptyMap();
  assert.equal(reliefOf(m), null);
  const r = new Relief();
  r.coarse[70 * COARSE_N + 70] = 200;
  r.refine();
  setRelief(m, r);
  const back = normalizeMap(JSON.parse(JSON.stringify(m)));
  assert.equal(reliefOf(back).coarse[70 * COARSE_N + 70], 200);
  assert.equal(normalizeMap({ ...m, relief: 'xyz' }).relief, undefined);
  setRelief(m, null);
  assert.equal(m.relief, undefined);
});
