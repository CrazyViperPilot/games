// Statistik am Spielende (seit v5.65): Zähler je Team in game.js (newStats), Ausbildung in economy.js.
// Die Zähler dienen nur der Anzeige; sie dürfen den Spielverlauf nicht verändern (test/golden.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, newStats } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { classic } from './classic.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { pack, unpack } from '../js/core/snapshot.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';

BALANCE.slotCap = 1000; // dieser Test prüft nicht das Einheitenlimit (siehe economy.test.js)
const DT = 0.05;
const mk = (opts) => classic(new Game(opts));
const run = (g, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) g.update(DT);
};
const snap = (g) => JSON.parse(JSON.stringify(g.teams.map((t) => t.stats)));

test('Statistik: jedes Team startet mit null Zählern', () => {
  const g = mk({ seed: 7 });
  assert.deepEqual(newStats(), { trained: 0, lost: 0, kills: 0, buildingsLost: 0, buildingsKilled: 0, peakUnits: 0 });
  for (const t of g.teams) {
    assert.deepEqual(t.stats, newStats());
    assert.equal(t.earned, 0);
  }
});

test('Statistik: Ausbildung zählt bei Team 0 hoch, Startarmee nicht', () => {
  const g = mk({ seed: 7 });
  const fob = g.buildings.find((b) => b.team === 0 && b.main);
  g.teams[0].res.money = 1000;
  run(g, 0.1);
  assert.equal(g.teams[0].stats.trained, 0, 'Startarmee zählt nicht');
  const r = g.issue(0, { type: 'train', buildingId: fob.id, unit: 'sniper' });
  assert.ok(r.ok, r.reason);
  run(g, UNITS.sniper.buildTime + 2);
  assert.equal(g.teams[0].stats.trained, 1);
  assert.equal(g.teams[1].stats.trained, 0);
});

test('Statistik: Verluste und Abschüsse je Team in cleanup()', () => {
  const g = mk({ seed: 7 });
  for (const u of g.units) u.alive = false; // Startarmeen weg, damit kein Kampf stört
  const x = g.zone.x + 1500;
  const y = g.zone.y;
  const foe = g.spawnUnit('rifleman', 1, x, y);
  foe.hp = 0; // gefallen
  run(g, DT);
  assert.equal(g.teams[1].stats.lost, 1, 'Team 1 verliert eine Einheit');
  assert.equal(g.teams[0].stats.kills, 1, 'Team 0 hat einen Abschuss');
  assert.equal(g.teams[0].stats.lost, 0);
  assert.equal(g.teams[1].stats.kills, 0);
});

test('Statistik: Passagiere ohne Trefferpunkte zählen nicht als Verlust', () => {
  const g = mk({ seed: 7 });
  for (const u of g.units) u.alive = false;
  const x = g.zone.x + 1500;
  const p = g.spawnUnit('rifleman', 1, x, g.zone.y);
  p.alive = false; // ausgestiegen oder im Fahrzeug verschwunden, hp > 0
  run(g, DT);
  assert.equal(g.teams[1].stats.lost, 0);
  assert.equal(g.teams[0].stats.kills, 0);
});

test('Statistik: Gebäude zerstört und verloren, Mauern und Tore zählen nicht', () => {
  const g = mk({ seed: 7 });
  const main = g.buildings.find((b) => b.team === 1 && b.main);
  const cx = g.grid.toCell(main.x) + 8;
  const cy = g.grid.toCell(main.y) + 8;
  const fob = g.spawnBuilding('fob', 1, cx, cy, { built: true });
  fob.hp = 0;
  run(g, DT);
  assert.equal(g.teams[1].stats.buildingsLost, 1);
  assert.equal(g.teams[0].stats.buildingsKilled, 1);
  const wall = g.spawnBuilding('wall', 1, cx + 4, cy, { built: true });
  wall.hp = 0;
  run(g, DT);
  assert.equal(g.teams[1].stats.buildingsLost, 1, 'Mauer zählt nicht');
  assert.equal(g.teams[0].stats.buildingsKilled, 1, 'Mauer zählt nicht');
});

test('Statistik: Höchste Armeegröße bleibt stehen, wenn Einheiten fallen', () => {
  const g = mk({ seed: 7 });
  run(g, 1.5); // mindestens eine Stichprobe
  const start = g.units.filter((u) => u.alive && u.team === 0).length;
  assert.ok(g.teams[0].stats.peakUnits >= start, 'Stichprobe deckt den Startstand ab');
  for (const u of g.units) if (u.team === 0) u.hp = 0;
  run(g, 1.5);
  assert.equal(g.teams[0].stats.peakUnits >= start, true, 'Spitzenwert sinkt nicht');
  assert.ok(g.teams[0].stats.peakUnits <= 1000);
});

test('Statistik: Spielstand ohne stats (älter als v5.65) lädt mit Nullen weiter', async () => {
  const g1 = mk({ seed: 9 });
  const a1 = new AI(g1, 1, 'normal');
  run(g1, 3);
  for (const t of g1.teams) {
    delete t.stats;
    delete t.earned;
  }
  delete g1.statTimer;
  const bytes = await pack(snapshotGame(g1, a1));
  const { game: g2, ai: a2 } = restoreGame(await unpack(bytes));
  for (const t of g2.teams) {
    assert.deepEqual(t.stats, newStats());
    assert.equal(t.earned, 0);
  }
  assert.equal(g2.statTimer, 0);
  run(g2, 2);
  assert.ok(g2.teams[0].stats.peakUnits > 0, 'Zähler laufen nach dem Laden weiter');
});

test('Statistik: Spielstand mit Zählern bleibt bitgleich beim Weiterspielen', async () => {
  const g1 = mk({ seed: 9 });
  const a1 = new AI(g1, 1, 'normal');
  run(g1, 20);
  const { game: g2, ai: a2 } = restoreGame(await unpack(await pack(snapshotGame(g1, a1))));
  assert.deepEqual(snap(g2), snap(g1));
  run(g1, 20);
  run(g2, 20);
  assert.deepEqual(snap(g2), snap(g1));
  assert.deepEqual(snapshotGame(g2, a2), snapshotGame(g1, a1));
});
