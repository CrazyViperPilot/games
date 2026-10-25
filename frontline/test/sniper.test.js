import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit (siehe economy.test.js)
const DT = 0.05;
const mk = (opts) => classic(new Game(opts));
function run(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}
/** Szene weit weg von der Basis: Scharfschütze (Team 0) bei (x, y), Gegner (Team 1) in Abstand dx. */
function scene(seed = 7) {
  const g = mk({ seed });
  for (const u of g.units) u.alive = false; // Startarmeen weg
  const z = g.zone;
  return { g, x: z.x + 1500, y: z.y };
}

test('Scharfschütze: in der Haupt-FOB ausbildbar (Taste T), kostet Geld, lange Nachladezeit', () => {
  assert.ok(UNITS.sniper);
  assert.equal(UNITS.sniper.hotkey, 'T');
  assert.equal(UNITS.sniper.cost.money, 220);
  assert.equal(UNITS.sniper.weapons[0].cooldown, 8);
  const g = mk({ seed: 7 });
  const fob = g.buildings.find((b) => b.team === 0 && b.main);
  assert.ok(fob.produces.includes('sniper'));
  g.teams[0].res.money = 1000;
  const r = g.issue(0, { type: 'train', buildingId: fob.id, unit: 'sniper' });
  assert.ok(r.ok, r.reason);
  assert.equal(g.teams[0].res.money, 780);
  run(g, UNITS.sniper.buildTime + 2);
  assert.equal(g.units.filter((u) => u.alive && u.team === 0 && u.type === 'sniper').length, 1);
});

test('Scharfschütze: ein Schuss tötet einen vollen Soldaten aus großer Entfernung, danach lange Nachladezeit', () => {
  const { g, x, y } = scene();
  const s = g.spawnUnit('sniper', 0, x, y);
  const a = g.spawnUnit('rifleman', 1, x + 400, y); // außerhalb der Gewehrreichweite (200), innerhalb von 480
  const b = g.spawnUnit('rifleman', 1, x + 420, y + 10);
  run(g, 1.5);
  assert.ok(!a.alive || !b.alive, 'ein Ziel gefallen');
  assert.equal([a, b].filter((u) => !u.alive).length, 1, 'nur ein Schuss in den ersten Sekunden');
  assert.ok(s.alive);
  run(g, 9);
  assert.equal([a, b].filter((u) => !u.alive).length, 2, 'nach 8 s der zweite Schuss');
});

test('Scharfschütze: wirkt kaum gegen Fahrzeuge und Gebäude', () => {
  const spec = UNITS.sniper.weapons[0];
  assert.ok(spec.damage.light < 10 && spec.damage.heavy < 5 && spec.damage.struct < 5);
});

test('Tarnung: Gegner sehen den Scharfschützen nur nahe oder kurz nach einem Schuss', () => {
  const { g, x, y } = scene();
  const s = g.spawnUnit('sniper', 0, x, y);
  s.weapons[0].rounds = 0; // schießt nicht, sonst verrät ihn der erste Schuss
  const foe = g.spawnUnit('rifleman', 1, x + 300, y);
  foe.weapons[0].rounds = 0;
  run(g, 0.5);
  g.fog[1].mark(x, y, 400); // Zelle ist eingesehen, nur die Tarnung zählt
  assert.equal(g.sees(1, s), false, 'in 300 px nicht entdeckt');
  assert.equal(g.sees(0, s), true, 'eigene sehen ihn immer');
  foe.x = x + BALANCE.stealth.detectRange - 10;
  assert.equal(g.sees(1, s), true, 'nahe entdeckt');
  foe.x = x + 300;
  s.revealedUntil = g.time + BALANCE.stealth.revealTime;
  assert.equal(g.sees(1, s), true, 'nach einem Schuss kurz sichtbar');
  g.time += BALANCE.stealth.revealTime + 1;
  assert.equal(g.sees(1, s), false, 'danach wieder getarnt');
});

test('Tarnung: Gegner schießt nicht auf einen unentdeckten Scharfschützen, dieser schießt zuerst', () => {
  const { g, x, y } = scene();
  const s = g.spawnUnit('sniper', 0, x, y);
  const foe = g.spawnUnit('rifleman', 1, x + 250, y); // Gewehr-Reichweite 200: außer Reichweite, aber sichtbar nicht
  g.fog[1].mark(x, y, 600);
  run(g, 1.5);
  assert.ok(!foe.alive, 'Gegner gefallen');
  assert.equal(s.hp, s.def.hp, 'Scharfschütze unverletzt');
});
