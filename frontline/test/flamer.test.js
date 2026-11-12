import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
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
/** Sekunden, bis das Ziel tot ist (Schütze von Team 0 bei x, Ziel von Team 1 in `dist`), höchstens `max`. */
function timeToKill(type, dist, max = 60) {
  const { g, x, y } = scene();
  g.spawnUnit(type, 0, x, y);
  const foe = g.spawnUnit('rifleman', 1, x + dist, y);
  for (let t = 0; t < max; t += DT) {
    if (!foe.alive) return t;
    g.update(DT);
  }
  return max;
}

test('Flammenwerfer: Infanterie, Reichweite 70, Splash 25, Besatzer-Faktor 2, Kaserne bildet aus', () => {
  const u = UNITS.flamer;
  assert.equal(u.armor, 'inf');
  assert.equal(u.cost.money, UNITS.rifleman.cost.money, 'Preis wie Schütze');
  const w = u.weapons[0];
  assert.equal(w.range, 70);
  assert.equal(w.splash, 25);
  assert.equal(w.occupantMul, 2);
  assert.ok(CITY.produces.barracks.includes('flamer'));
});

test('Flammenwerfer tötet einen Schützen schneller als ein Schütze', () => {
  const flame = timeToKill('flamer', 40);
  const rifle = timeToKill('rifleman', 150);
  assert.ok(flame < rifle, `Flammenwerfer ${flame.toFixed(1)} s, Schütze ${rifle.toFixed(1)} s`);
});

test('Flammenstrahl trifft auch Gegner im Umkreis des Ziels', () => {
  const { g, x, y } = scene();
  g.spawnUnit('flamer', 0, x, y);
  const main = g.spawnUnit('rifleman', 1, x + 40, y);
  const side = g.spawnUnit('rifleman', 1, x + 40, y + 15); // 15 px neben dem Ziel, innerhalb Splash 25
  const far = g.spawnUnit('rifleman', 1, x + 40, y + 60); // außerhalb
  const sideHp = side.hp;
  const farHp = far.hp;
  run(g, 0.6);
  assert.ok(main.hp < UNITS.rifleman.hp, 'Ziel getroffen');
  assert.ok(side.hp < sideHp, 'Nebenziel im Splash getroffen');
  assert.equal(far.hp, farHp, 'Ziel außerhalb des Splash unverletzt');
});
