// Paket E11: Kamikazedrohne (`fpv`). Vorbild Aufklärungsdrohne (drone): Heliport mit Stadt, 0 Passagiere, Treibstoff 40.
// Im Angriffsbefehl fliegt sie zum Ziel und explodiert bei Kontakt (≤ 20 px), danach ist sie weg.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { UNITS } from '../js/data/units.js';
import { updateFpv } from '../js/game/fpv.js';

const DT = 0.05;
const run = (g, s) => {
  for (let i = 0; i < s / DT; i++) g.update(DT);
};

test('Werte: 60 HP, Sicht 250, schnell, 0 Passagiere, Treibstoff 40, Schadenswerte', () => {
  const f = UNITS.fpv;
  assert.ok(f, 'Einheit fpv');
  assert.equal(f.air, true);
  assert.equal(f.hp, 60);
  assert.equal(f.sight, 250);
  assert.equal(f.seats, 0);
  assert.equal(f.fuelMax, 40);
  assert.ok(f.speed > UNITS.drone.speed, 'schneller als die Aufklärungsdrohne');
  assert.ok(f.hp < UNITS.drone.hp, 'weniger HP als die Aufklärungsdrohne');
  assert.ok(f.range > 0, 'Reichweite nur für den Angriffsbefehl');
  assert.equal(f.blast.damage.heavy, 700);
  assert.equal(f.blast.damage.light, 500);
  assert.equal(f.blast.damage.struct, 300);
  assert.equal(f.blast.splash, 30);
  assert.ok(f.hotkey, 'Taste');
});

test('Ausbildung nur am Heliport (mit Stadt), nicht in der Hauptstadt', () => {
  assert.ok(CITY.produces.heliport.includes('fpv'));
  for (const [k, list] of Object.entries(CITY.produces)) if (k !== 'heliport') assert.ok(!list.includes('fpv'), k);
  assert.ok(!BUILDINGS.fob.produces.includes('fpv'), 'Hauptstadt-Menü unverändert');
  assert.equal(CITY.metalCost.fpv, 30);
});

test('Angriffsbefehl: Drohne fliegt ins Ziel, trifft den Panzer und ist danach weg', () => {
  const g = new Game({ seed: 3, city: true });
  const tank = g.spawnUnit('tank', 1, 4000, 4000);
  const f = g.spawnUnit('fpv', 0, 4000 + 300, 4000);
  const hp0 = tank.hp;
  const r = g.issue(0, { type: 'attack', ids: [f.id], targetId: tank.id });
  assert.equal(r.ok, true);
  run(g, 30);
  assert.equal(f.alive, false, 'Drohne explodiert');
  assert.equal(f.hp, 0);
  assert.ok(!tank.alive || tank.hp < hp0, 'Panzer getroffen');
});

test('ohne Angriffsbefehl oder fern vom Ziel: keine Explosion', () => {
  const g = new Game({ seed: 3, city: true });
  const tank = g.spawnUnit('tank', 1, 4000, 4000);
  const idle = g.spawnUnit('fpv', 0, 4000 + 300, 4000);
  const hp0 = tank.hp;
  run(g, 5);
  assert.equal(idle.alive, true, 'untätige Drohne bleibt');
  assert.equal(tank.hp, hp0);
  // Ziel weit weg: updateFpv tut nichts, solange der Abstand über 20 px liegt
  const far = g.spawnUnit('fpv', 0, 4000 - 800, 4000);
  far.order = { type: 'attack', x: tank.x, y: tank.y, targetId: tank.id };
  far.targetId = tank.id;
  updateFpv(g, DT);
  assert.equal(far.alive, true, 'Drohne fern vom Ziel explodiert nicht');
});
