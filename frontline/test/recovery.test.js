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
/** Eigene Hauptstadt-FOB mit Baumaterial im Lager; dort werden die Bergepanzer und Panzer platziert. */
function fobOf(g) {
  return g.buildings.find((b) => b.alive && b.built && b.team === 0 && b.type === 'fob');
}

test('Bergepanzer: unbewaffnetes Fahrzeug, keine Luftfahrzeuge, in der Fabrikhalle ausbildbar', () => {
  assert.equal(UNITS.recovery.weapons.length, 0);
  assert.equal(UNITS.recovery.armor, 'light');
  assert.ok(!UNITS.recovery.air);
  assert.ok(CITY.produces.factory.includes('recovery'));
  assert.ok(!BUILDINGS.fob.produces.includes('recovery'), 'Hauptstadt-Menü bleibt voll (Regel 4)');
  const keys = CITY.produces.factory.map((t) => UNITS[t].hotkey);
  assert.equal(new Set(keys).size, keys.length, 'Fabrikmenü: keine doppelte Taste');
});

test('Bergepanzer repariert beschädigten Panzer im Umkreis und bezahlt Baumaterial', () => {
  const g = mk();
  const fob = fobOf(g);
  const rec = g.spawnUnit('recovery', 0, fob.x + 60, fob.y + 200);
  const tank = g.spawnUnit('tank', 0, rec.x + 40, rec.y);
  tank.hp = tank.maxHp - 100;
  const bm0 = fob.store.bm;
  run(g, 2);
  assert.ok(tank.hp > tank.maxHp - 100 + 15, `Panzer repariert (${tank.hp.toFixed(1)})`);
  assert.ok(fob.store.bm < bm0, 'Baumaterial wird verbraucht');
});

test('Bergepanzer repariert nicht außerhalb des Umkreises und keine Luftfahrzeuge', () => {
  const g = mk();
  const fob = fobOf(g);
  const rec = g.spawnUnit('recovery', 0, fob.x + 60, fob.y + 200);
  const far = g.spawnUnit('tank', 0, rec.x + 150, rec.y + 300); // außerhalb von 200 px: nicht untätig angesteuert
  far.hp = far.maxHp - 100;
  const air = g.spawnUnit('littlebird', 0, rec.x + 30, rec.y);
  air.hp = air.maxHp - 100;
  const hpAir = air.hp;
  run(g, 3);
  assert.equal(far.hp, far.maxHp - 100, 'außerhalb des Umkreises nicht repariert');
  assert.equal(air.hp, hpAir, 'Luftfahrzeug nicht repariert');
});

test('Untätiger Bergepanzer fährt zum beschädigten Panzer in 200 px und repariert ihn', () => {
  const g = mk();
  const fob = fobOf(g);
  const rec = g.spawnUnit('recovery', 0, fob.x + 60, fob.y + 200);
  const tank = g.spawnUnit('tank', 0, rec.x + 150, rec.y);
  tank.hp = tank.maxHp - 100;
  run(g, 25);
  assert.ok(tank.hp > tank.maxHp - 100, `Panzer wurde angefahren und repariert (${tank.hp.toFixed(1)})`);
});

test('Ohne Baumaterial keine Reparatur', () => {
  const g = mk();
  const fob = fobOf(g);
  fob.store.bm = 0;
  const rec = g.spawnUnit('recovery', 0, fob.x + 60, fob.y + 200);
  const tank = g.spawnUnit('tank', 0, rec.x + 40, rec.y);
  tank.hp = tank.maxHp - 100;
  run(g, 2);
  assert.equal(tank.hp, tank.maxHp - 100, 'ohne Baumaterial nicht repariert');
});
