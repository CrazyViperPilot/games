// Spielstand: Speichern, JSON, Laden und Weiterspielen muss bitgenau dasselbe ergeben wie ohne Unterbrechung.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { pack, unpack, encode, decode } from '../js/core/snapshot.js';
import { generateMap } from '../js/game/map.js';
import { demolish } from '../js/game/city/clearing.js';
import { CITY } from '../js/data/city.js';

const DT = 0.05;
const run = (g, ai, n) => {
  for (let i = 0; i < n; i++) {
    ai.update(DT);
    g.update(DT);
  }
};

test('Laden und Weiterspielen ist identisch zum durchgehenden Spiel [langsam]', async () => {
  const opts = { seed: 11, radio: true, weather: 'random', research: true, river: true, city: true };
  const g1 = new Game(opts);
  const a1 = new AI(g1, 1, 'normal');
  run(g1, a1, 1500);
  const snap = snapshotGame(g1, a1);
  const bytes = await pack(snap);
  const { game: g2, ai: a2 } = restoreGame(await unpack(bytes));
  assert.equal(g2.time, g1.time);
  assert.equal(g2.units.length, g1.units.length);
  assert.equal(g2.teams[0].res.bm, g1.teams[0].res.bm);
  assert.equal(g2.units[0].ammo, g1.units[0].ammo);
  sameDerived(g2, g1);
  // Abgeleitetes steht nicht im Stand (v5.62): Gelände nur als Grobraster, Raster nur als Unterschied, keine Sichtfelder der Entities
  const sg = gameOf(snap);
  assert.deepEqual(Object.keys(sg.relief), ['coarse'], 'Zufallskarte: nur das Grobraster des Geländes');
  assert.deepEqual(Object.keys(sg.grid).sort(), ['delta', 'keep']);
  assert.ok(!JSON.stringify(snap).includes('"fogCells"'), 'keine Sichtfelder im Stand');
  run(g1, a1, 1200);
  run(g2, a2, 1200);
  assert.deepEqual(snapshotGame(g2, a2), snapshotGame(g1, a1));
  console.log('Spielstand gz-Bytes:', bytes.length);
});

/** Wurzel-Spielobjekt eines Abbilds (Felder von Game), Verweise aufgelöst. */
function gameOf(snap) {
  const at = (v) => (v && v.$r !== undefined ? snap.table[v.$r] : v);
  return at(at(snap.root).game).p;
}

/** Beim Laden neu erzeugtes Gelände und Raster gleichen bitgenau dem Original. */
function sameDerived(g2, g1) {
  assert.deepEqual(Array.from(g2.relief?.fine ?? []), Array.from(g1.relief?.fine ?? []), 'Gelände (Feinraster)');
  assert.deepEqual(Object.keys(g2.grid), Object.keys(g1.grid));
  for (const k of Object.keys(g1.grid)) {
    const a = g1.grid[k];
    if (ArrayBuffer.isView(a)) assert.ok(g2.grid[k].constructor === a.constructor && Buffer.compare(Buffer.from(g2.grid[k].buffer), Buffer.from(a.buffer)) === 0, `Raster ${k}`);
    else assert.deepEqual(g2.grid[k], a, `Raster ${k}`);
  }
}

test('Karte aus dem Editor (Gelände aus map.relief): Stand ohne Gelände, Raster mit gerodeten Häusern, Weiterspielen identisch', async () => {
  const map = JSON.parse(JSON.stringify(generateMap(5, { river: true }))); // wie eine gespeicherte Karte: Gelände nur als Text
  const g1 = new Game({ seed: 5, map, city: true, river: true, startMoney: 5000 });
  const a1 = new AI(g1, 1, 'normal');
  run(g1, a1, 600);
  assert.equal(gameOf(snapshotGame(g1, a1)).relief, null, 'Gelände entspricht map.relief: nicht gespeichert');
  // Räumen streicht ein Haus aus der Karte: das Grundraster des Stands muss danach zur geänderten Karte passen
  const b = map.town.buildings.find((o) => CITY.clearable.includes(o.kind) && !o.angle && !g1.houseBySrc.get(o)?.occupants.length);
  const n = map.town.buildings.length;
  demolish(g1, b, { rects: [] });
  assert.equal(map.town.buildings.length, n - 1);
  const snap = snapshotGame(g1, a1);
  const { game: g2, ai: a2 } = restoreGame(await unpack(await pack(snap)));
  sameDerived(g2, g1);
  run(g1, a1, 600);
  run(g2, a2, 600);
  assert.deepEqual(snapshotGame(g2, a2), snapshotGame(g1, a1));
});

test('Stadt mit Stau (v5.20): Stau-Faktor c.congestion wird gespeichert, Laden und Weiterspielen bleibt identisch [langsam]', async () => {
  const g1 = new Game({ seed: 11, city: true, startMoney: 3000 });
  const a1 = new AI(g1, 1, 'normal');
  let k = 0;
  while (!g1.city[1].congestion.some((f) => f < 1) && k < 6000) {
    run(g1, a1, 1);
    k++;
  }
  run(g1, a1, 40); // mitten im Stau speichern
  const jam = Array.from(g1.city[1].congestion).filter((f) => f < 1).length;
  assert.ok(jam > 0, 'Straßen mit Stau vor dem Speichern');
  const { game: g2, ai: a2 } = restoreGame(await unpack(await pack(snapshotGame(g1, a1))));
  assert.ok(g2.city[1].congestion instanceof Float32Array, 'Typed Array bleibt Float32Array');
  assert.deepEqual(Array.from(g2.city[1].congestion), Array.from(g1.city[1].congestion));
  run(g1, a1, 400);
  run(g2, a2, 400);
  assert.deepEqual(Array.from(g2.city[1].congestion), Array.from(g1.city[1].congestion));
  assert.deepEqual(snapshotGame(g2, a2), snapshotGame(g1, a1));
});

test('Typed Arrays: gleichförmige als Füllwert plus Stellen (seit v5.62), bitgenau auch für -0, NaN und negative Füllwerte', () => {
  const f32 = new Float32Array(1000).fill(1);
  f32[3] = -0;
  f32[500] = NaN;
  f32[999] = 0.25;
  const i8 = new Int8Array(300).fill(-1);
  i8[7] = 5;
  const dense = Uint8Array.from({ length: 400 }, (_, i) => (i * 37) & 255);
  const f64 = new Float64Array(200);
  f64[1] = -0;
  const root = { f32, i8, dense, f64, short: new Uint16Array([0, 0, 9]) };
  const data = JSON.parse(JSON.stringify(encode(root, {}, {})));
  assert.equal(data.root.f32.n, 1000, 'Float32Array sparse');
  assert.equal(data.root.i8.n, 300, 'Int8Array sparse');
  assert.ok(data.root.dense.b, 'ungleichförmig: alle Bytes');
  const back = decode(data, {}, {});
  for (const k of Object.keys(root)) {
    assert.equal(back[k].constructor, root[k].constructor, k);
    assert.equal(Buffer.compare(Buffer.from(back[k].buffer), Buffer.from(root[k].buffer)), 0, k);
  }
});
