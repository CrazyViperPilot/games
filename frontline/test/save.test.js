// Spielstand: Speichern, JSON, Laden und Weiterspielen muss bitgenau dasselbe ergeben wie ohne Unterbrechung.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { pack, unpack } from '../js/core/snapshot.js';

const DT = 0.05;
const run = (g, ai, n) => {
  for (let i = 0; i < n; i++) {
    ai.update(DT);
    g.update(DT);
  }
};

test('Laden und Weiterspielen ist identisch zum durchgehenden Spiel', async () => {
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
  run(g1, a1, 1200);
  run(g2, a2, 1200);
  assert.deepEqual(snapshotGame(g2, a2), snapshotGame(g1, a1));
  console.log('Spielstand gz-Bytes:', bytes.length);
});

test('Stadt mit Stau (v5.20): Stau-Faktor c.congestion wird gespeichert, Laden und Weiterspielen bleibt identisch', async () => {
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
