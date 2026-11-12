import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { CITY } from '../js/data/city.js';
import { UNITS } from '../js/data/units.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit
const DT = 0.05;
const mk = () => classic(new Game({ seed: 7 }));
function run(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}
/** Szene weit weg von der Basis: alle Startarmeen weg, Team 0 bei (x, y). */
function scene() {
  const g = mk();
  for (const u of g.units) u.alive = false;
  const z = g.zone;
  return { g, x: z.x + 1500, y: z.y };
}

test('MANPADS: Infanterie, nur Luftziele, Werte wie SAM mit Reichweite 300, Schaden 250, 12 s Nachladen', () => {
  const u = UNITS.manpads;
  assert.equal(u.armor, 'inf');
  assert.equal(u.cost.money, UNITS.at.cost.money, 'Preis wie Panzerabwehrsoldat');
  const w = u.weapons[0];
  assert.deepEqual(w.targets, ['air']);
  assert.equal(w.range, 300);
  assert.equal(w.damage.air, 250);
  assert.equal(w.cooldown, 12);
});

test('MANPADS: in Hauptstadt, Kaserne ausbildbar, Taste frei', () => {
  assert.ok(BUILDINGS.fob.produces.includes('manpads'));
  assert.ok(CITY.produces.barracks.includes('manpads'));
  const keys = BUILDINGS.fob.produces.map((t) => UNITS[t].hotkey);
  assert.equal(new Set(keys).size, keys.length, 'keine doppelte Taste in der Hauptstadt');
});

test('MANPADS: schießt auf Hubschrauber, nicht auf Panzer', () => {
  const { g, x, y } = scene();
  const man = g.spawnUnit('manpads', 0, x, y);
  const heli = g.spawnUnit('gunship', 1, x + 200, y);
  heli.hp = 1e6;
  const rounds = () => man.weapons[0].rounds;
  const start = rounds();
  run(g, 1);
  assert.ok(rounds() < start, 'Rakete gegen Hubschrauber abgefeuert');
  run(g, 20);
  const tank = g.spawnUnit('tank', 1, x + 200, y + 30);
  tank.hp = 1e6;
  const before = rounds();
  const tankHp = tank.hp;
  run(g, 15);
  assert.equal(tank.hp, tankHp, 'Panzer nicht beschossen');
  assert.ok(rounds() <= before, 'Munition nicht für Panzer');
});
