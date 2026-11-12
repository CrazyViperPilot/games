import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { CITY } from '../js/data/city.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit (siehe economy.test.js)
const DT = 0.05;
const mk = (opts) => classic(new Game(opts));
function run(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}
/** Szene weit weg von der Basis: Aufklärungsfahrzeug (Team 0) bei (x, y), Gegner (Team 1) daneben. */
function scene(seed = 7) {
  const g = mk({ seed });
  for (const u of g.units) u.alive = false; // Startarmeen weg
  const z = g.zone;
  return { g, x: z.x + 1500, y: z.y };
}

test('Aufklärungsfahrzeug: Fabrikhalle (Taste K), nicht in der Hauptstadt, Werte', () => {
  assert.ok(UNITS.scout);
  assert.equal(UNITS.scout.hotkey, 'K');
  assert.equal(UNITS.scout.sight, 520);
  assert.equal(UNITS.scout.seats, 2);
  assert.equal(UNITS.scout.stillCamo, 3);
  assert.ok(CITY.produces.factory.includes('scout'));
  const g = mk({ seed: 7 });
  const fob = g.buildings.find((b) => b.team === 0 && b.main);
  assert.ok(!fob.produces.includes('scout'), 'Hauptstadt bildet es nicht aus (Regel 4)');
});

test('Aufklärungsfahrzeug: fährt schneller als der LKW und hat eine MG', () => {
  assert.ok(UNITS.scout.speed > UNITS.truck.speed);
  assert.equal(UNITS.scout.weapons[0].id, 'mg');
});

test('Aufklärungsfahrzeug: stehend nach 3 s getarnt, beim Fahren nicht', () => {
  const { g, x, y } = scene();
  const s = g.spawnUnit('scout', 0, x, y);
  s.weapons[0].rounds = 0; // schießt nicht, sonst verrät es der Schuss
  const foe = g.spawnUnit('rifleman', 1, x + 300, y);
  foe.weapons[0].rounds = 0;
  g.fog[1].mark(x, y, 400); // Zelle ist eingesehen, nur die Tarnung zählt
  run(g, 1);
  assert.equal(g.sees(1, s), true, 'vor 3 s Stillstand noch sichtbar');
  run(g, 3);
  assert.equal(g.sees(1, s), false, 'nach 3 s Stillstand getarnt');
  assert.equal(g.sees(0, s), true, 'eigene sehen es immer');
  foe.x = x + BALANCE.stealth.detectRange - 10;
  assert.equal(g.sees(1, s), true, 'nahe entdeckt');
  foe.x = x + 300;
  g.issue(0, { type: 'move', ids: [s.id], x: x + 400, y });
  run(g, 1);
  assert.ok(s.speedNow > 1, 'fährt');
  assert.equal(s.still, 0);
  assert.equal(g.sees(1, s), true, 'fahrend sichtbar');
});

test('Aufklärungsfahrzeug: ein Schuss deckt es kurz auf', () => {
  const { g, x, y } = scene();
  const s = g.spawnUnit('scout', 0, x, y);
  s.weapons[0].rounds = 0; // ohne Schüsse, die Aufdeckung kommt nur von der Testzeile
  const foe = g.spawnUnit('rifleman', 1, x + 300, y);
  foe.weapons[0].rounds = 0;
  g.fog[1].mark(x, y, 400);
  run(g, 4); // im Lauf nähert sich der Gegner ggf.
  assert.equal(g.sees(1, s), false, 'getarnt');
  g.fog[1].mark(x, y, 400); // die Sicht lief während des Stillstands aus dem Feld
  // im Lauf können sich beide verschoben haben (Gedränge, Annäherung): hier wieder 300 px Abstand
  s.x = x; s.y = y;
  foe.x = x + 300; foe.y = y;
  s.revealedUntil = g.time + BALANCE.stealth.revealTime;
  assert.equal(g.sees(1, s), true, 'nach dem Schuss kurz sichtbar');
  g.time += BALANCE.stealth.revealTime + 1;
  assert.equal(g.sees(1, s), false, 'danach wieder getarnt');
});
