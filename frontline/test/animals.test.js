// Tiere: Rudel punktsymmetrisch außerhalb der Zone, grasen und ziehen weiter, fliehen vor Einheiten und Explosionen; reine Optik.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { BALANCE } from '../js/data/balance.js';

const A = BALANCE.animals;
const DT = 1 / BALANCE.tickRate;
const W = BALANCE.map.width;
const H = BALANCE.map.height;
const run = (g, s) => {
  for (let i = 0; i < Math.round(s / DT); i++) g.update(DT);
};

test('Rudel: Rehe und Wildschweine paarweise punktsymmetrisch auf freiem Boden außerhalb der Zone, keine Entities', () => {
  for (const seed of [1, 3, 8]) {
    const g = new Game({ seed });
    assert.equal(g.animalGroups.length, 2 * A.pairs, `Seed ${seed}`);
    assert.ok(g.animals.some((a) => a.kind === 'deer') && g.animals.some((a) => a.kind === 'boar'));
    for (let i = 0; i < g.animalGroups.length; i += 2) {
      const [p, q] = [g.animalGroups[i], g.animalGroups[i + 1]];
      assert.deepEqual([p.cx + q.cx, p.cy + q.cy, p.kind], [W, H, q.kind], 'Spiegelbild');
      const n = g.animals.filter((a) => a.group === p.id).length;
      assert.equal(n, g.animals.filter((a) => a.group === q.id).length);
      assert.ok(n >= A[p.kind][0] && n <= A[p.kind][1]);
    }
    for (const a of g.animals) {
      assert.ok(g.grid.free(g.grid.toCell(a.x), g.grid.toCell(a.y)), 'freier Boden');
      assert.ok(Math.hypot(a.x - g.zone.x, a.y - g.zone.y) > g.zone.r, 'außerhalb der Zone');
      assert.ok(!g.entities.has(a.id) || g.entities.get(a.id) !== a, 'kein Ziel');
    }
  }
});

test('Grasen und Weiterziehen: ohne Störung bewegen sich die Tiere langsam, bleiben auf freiem Boden und beim Rudel', () => {
  const g = new Game({ seed: 3 });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  const start = g.animals.map((a) => [a.x, a.y]);
  for (let k = 0; k < 6; k++) {
    run(g, 10);
    for (const a of g.animals) {
      assert.ok(g.grid.free(g.grid.toCell(a.x), g.grid.toCell(a.y)));
      assert.ok(a.state !== 'flee', 'niemand stört');
      assert.ok(a.speed <= A.walk * 2.4 + 1e-9, 'gehen oder traben, kein Galopp');
      const grp = g.animalGroups[a.group];
      assert.ok(Math.hypot(a.x - grp.cx, a.y - grp.cy) < 700, 'beim Rudel');
    }
  }
  assert.ok(g.animals.filter((a, i) => Math.hypot(a.x - start[i][0], a.y - start[i][1]) > 30).length > g.animals.length / 2, 'sie ziehen umher');
});

test('Flucht: ein Fahrzeug in Schreckweite verjagt das ganze Rudel, es läuft schnell weg und grast danach wieder', () => {
  const g = new Game({ seed: 3 });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  const grp = g.animalGroups[0];
  const herd = g.animals.filter((a) => a.group === grp.id);
  const a0 = herd[0];
  const tank = g.spawnUnit('tank', 0, a0.x + A.scare.vehicle - 60, a0.y);
  const d0 = herd.map((a) => Math.hypot(a.x - tank.x, a.y - tank.y));
  run(g, 0.5);
  for (const a of herd) assert.equal(a.state, 'flee', 'das ganze Rudel flieht');
  assert.ok(herd.some((a) => a.speed > A.walk * 3), 'im Galopp');
  run(g, 2);
  herd.forEach((a, i) => assert.ok(Math.hypot(a.x - tank.x, a.y - tank.y) > d0[i], 'weiter weg'));
  tank.alive = false;
  g.cleanup();
  run(g, 8);
  assert.ok(herd.every((a) => a.state !== 'flee'), 'wieder ruhig');
});

test('Flucht vor Knall: eine Explosion in boom-Weite scheucht auf, Infanterie erst näher als ein Fahrzeug', () => {
  const g = new Game({ seed: 3 });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  const grp = g.animalGroups[2];
  const herd = g.animals.filter((a) => a.group === grp.id);
  const a0 = herd[0];
  const man = g.spawnUnit('rifleman', 0, a0.x + A.scare.inf + 80, a0.y); // zu weit für einen Soldaten
  run(g, 0.6);
  assert.ok(herd.every((a) => a.state !== 'flee'), 'ein Soldat in 260 px stört nicht');
  man.alive = false;
  g.cleanup();
  g.addEffect('explosion', a0.x + A.scare.boom - 80, a0.y);
  run(g, 0.3);
  assert.ok(herd.every((a) => a.state === 'flee'), 'der Knall verjagt sie');
});

test('Gleicher Seed, gleiche Tiere; leere Karte ohne Platz für Tiere läuft trotzdem', () => {
  const a = new Game({ seed: 5 });
  const b = new Game({ seed: 5 });
  run(a, 20);
  run(b, 20);
  assert.deepEqual(a.animals.map((x) => [x.x, x.y]), b.animals.map((x) => [x.x, x.y]));
  const e = new Game({ map: createEmptyMap() });
  run(e, 5);
  assert.ok(Array.isArray(e.animals));
});
