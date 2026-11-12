import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { UNITS } from '../js/data/units.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit
const DT = 0.05;
const mk = () => classic(new Game({ seed: 7 }));
function run(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}

test('Sanitäter: unbewaffnet, Infanterie, in Hauptstadt und Kaserne ausbildbar', () => {
  assert.equal(UNITS.medic.weapons.length, 0);
  assert.equal(UNITS.medic.armor, 'inf');
  assert.equal(UNITS.medic.cost.money, UNITS.rifleman.cost.money * 1.5);
  assert.ok(BUILDINGS.fob.produces.includes('medic'));
  assert.equal(new Set(BUILDINGS.fob.produces.map((t) => UNITS[t].hotkey)).size, BUILDINGS.fob.produces.length);
});

test('Sanitäter heilt verletzten Schützen im Umkreis, nicht außerhalb, nicht sich selbst', () => {
  const g = mk();
  const x = 3000, y = 3000;
  const med = g.spawnUnit('medic', 0, x, y);
  const near = g.spawnUnit('rifleman', 0, x + 40, y);
  const far = g.spawnUnit('rifleman', 0, x + 300, y);
  near.hp = 50;
  far.hp = 50;
  med.hp = 50;
  run(g, 5);
  assert.ok(near.hp > 50 + 25, `Schütze im Umkreis geheilt (${near.hp.toFixed(1)})`);
  assert.equal(far.hp, 50, 'außerhalb des Umkreises nicht geheilt');
  assert.equal(med.hp, 50, 'heilt sich nicht selbst');
});

test('Sanitäter heilt nicht Soldaten im Haus', () => {
  const g = mk();
  const med = g.spawnUnit('medic', 0, 3000, 3000);
  const man = g.spawnUnit('rifleman', 0, 3030, 3000);
  man.hp = 50;
  man.house = -1;
  run(g, 3);
  assert.equal(man.hp, 50);
});
