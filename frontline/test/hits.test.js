import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { UNITS } from '../js/data/units.js';
import { shotDamage, sectorOf } from '../js/game/combat.js';

const g = new Game({ seed: 3 });
const mk = (type, team, x, y, angle = 0) => {
  const u = g.spawnUnit(type, team, x, y);
  u.angle = angle;
  return u;
};
const wp = (type, id) => UNITS[type].weapons.find((w) => w.id === id);

// Zahl der Treffer, bis das Ziel (volle HP) tot ist
function hitsToKill(shooter, wid, target) {
  const spec = wp(shooter.type, wid);
  let hp = target.maxHp;
  let n = 0;
  while (hp > 0 && n < 100) {
    hp -= shotDamage(spec, shooter, target);
    n++;
  }
  return n;
}

test('Seiten: vorn, seitlich, hinten relativ zur Fahrtrichtung', () => {
  const t = mk('tank', 1, 500, 500, 0); // schaut nach +x
  assert.equal(sectorOf({ x: 600, y: 500 }, t), 'front');
  assert.equal(sectorOf({ x: 500, y: 600 }, t), 'side');
  assert.equal(sectorOf({ x: 400, y: 500 }, t), 'rear');
});

test('Schütze braucht 4 Treffer gegen Schützen', () => {
  assert.equal(hitsToKill(mk('rifleman', 0, 0, 0), 'rifle', mk('rifleman', 1, 50, 0)), 4);
});

test('Panzer und Schützenpanzer gegen Schützen', () => {
  const s = mk('rifleman', 1, 50, 0);
  assert.equal(hitsToKill(mk('tank', 0, 0, 0), 'cannon', s), 1);
  assert.equal(hitsToKill(mk('tank', 0, 0, 0), 'mg', s), 2);
  assert.equal(hitsToKill(mk('ifv', 0, 0, 0), 'grenade', s), 1);
  assert.equal(hitsToKill(mk('ifv', 0, 0, 0), 'mg', s), 2);
});

const sectors = (shooterType, wid, targetType) =>
  [[100, 0], [0, 100], [-100, 0]].map(([x, y]) => hitsToKill(mk(shooterType, 0, 500 + x, 500 + y), wid, mk(targetType, 1, 500, 500, 0)));

test('Panzer gegen Panzer und Schützenpanzer: vorn/seitlich/hinten', () => {
  assert.deepEqual(sectors('tank', 'cannon', 'tank'), [4, 3, 2]);
  assert.deepEqual(sectors('tank', 'cannon', 'ifv'), [3, 3, 2]);
});

test('Schützenpanzer-Granaten gegen Panzer: vorn/seitlich/hinten', () => {
  assert.deepEqual(sectors('ifv', 'grenade', 'tank'), [10, 8, 7]);
});
