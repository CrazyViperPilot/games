import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { unitHitChance } from '../js/game/combat.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';

const DT = 0.05;
const mk = (opts) => classic(new Game(opts));
function run(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}
/** Szene weit weg von der Basis: alle Startarmeen weg, Team 0 bei (x, y). */
function scene(seed = 7) {
  const g = mk({ seed });
  for (const u of g.units) u.alive = false;
  const z = g.zone;
  return { g, x: z.x + 1500, y: z.y };
}

test('Einheitenlimit: 300 Plätze, Flak und SAM belegen je 2', () => {
  assert.equal(BALANCE.slotCap, 300);
  assert.equal(UNITS.flak.slots, 2);
  assert.equal(UNITS.sam.slots, 2);
  assert.equal(UNITS.flak.hotkey, 'J');
  assert.equal(UNITS.sam.hotkey, 'N');
  assert.equal(BALANCE.research.unitTier.flak, 2);
  assert.equal(BALANCE.research.unitTier.sam, 3);
});

test('Flak: 20 Munition je Schuss und schießt nur auf Luftziele', () => {
  const { g, x, y } = scene();
  const flak = g.spawnUnit('flak', 0, x, y);
  const heli = g.spawnUnit('littlebird', 1, x + 150, y);
  heli.hp = 1e6; // überlebt die Schüsse, damit das Feuer weitergeht
  const rifle = g.spawnUnit('rifleman', 1, x - 150, y);
  const before = flak.weapons[0].rounds;
  run(g, 3);
  const shots = before - flak.weapons[0].rounds;
  assert.ok(shots >= 3, `mehrere Schüsse, nicht ${shots}`);
  assert.equal(g.teams[0].used.mun, shots * 20, 'je Schuss 20 Munition');
  assert.equal(rifle.hp, rifle.def.hp, 'Infanterie bleibt verschont');
});

test('Flak: Trefferchance sinkt mit dem Tempo des Ziels', () => {
  const { g, x, y } = scene();
  const flak = g.spawnUnit('flak', 0, x, y);
  const heli = g.spawnUnit('littlebird', 1, x + 200, y);
  const w = flak.weapons[0].spec;
  heli.speedNow = 0;
  const still = unitHitChance(flak, heli, w);
  heli.speedNow = UNITS.littlebird.speed;
  const fast = unitHitChance(flak, heli, w);
  assert.ok(Math.abs(still - w.hitChance * (1 - BALANCE.airFire.falloff * 200 / w.range)) < 1e-9, 'stehendes Ziel: volle Chance');
  assert.ok(fast < still * 0.5, `schnelles Ziel trifft selten (${fast.toFixed(2)} gegen ${still.toFixed(2)})`);
});

test('SAM: 250 Munition je Rakete, 10 s Nachladezeit', () => {
  const { g, x, y } = scene();
  const sam = g.spawnUnit('sam', 0, x, y);
  g.spawnUnit('gunship', 1, x + 300, y);
  sam.hp = 1e6; // der Gunship darf die Rampe nicht vorher zerstören
  const rounds = () => sam.weapons[0].rounds;
  const start = rounds();
  run(g, 0.5);
  assert.equal(start - rounds(), 1, 'erste Rakete');
  assert.equal(g.teams[0].used.mun, 250);
  run(g, 8.5); // insgesamt 9 s: noch keine zweite
  assert.equal(start - rounds(), 1, 'Nachladezeit läuft');
  run(g, 2); // 11 s: die zweite Rakete ist raus
  assert.equal(start - rounds(), 2);
  assert.equal(g.teams[0].used.mun, 500);
});

test('SAM: Wärmesuchrakete ist nicht vom Tempo des Ziels abhängig', () => {
  const { g, x, y } = scene();
  const sam = g.spawnUnit('sam', 0, x, y);
  const heli = g.spawnUnit('transporter', 1, x + 200, y);
  const w = sam.weapons[0].spec;
  heli.speedNow = 0;
  const still = unitHitChance(sam, heli, w);
  heli.speedNow = UNITS.transporter.speed;
  assert.equal(unitHitChance(sam, heli, w), still);
});

test('Tempo: gemessen aus der Verschiebung, auch bei Logistikflügen', () => {
  const { g, x, y } = scene();
  const heli = g.spawnUnit('littlebird', 1, x, y);
  run(g, 0.2);
  heli.x += 170 * DT; // Flug ohne stepUnit, wie ein Logistikbefehl
  run(g, DT);
  assert.ok(Math.abs(heli.speedNow - 170) < 1e-6, `Tempo ${heli.speedNow}`);
});
