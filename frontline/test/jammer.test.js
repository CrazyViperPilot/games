import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jamFactor } from '../js/game/combat.js';
import { UNITS } from '../js/data/units.js';
import { CITY } from '../js/data/city.js';
import { BUILDINGS } from '../js/data/buildings.js';

const SAM = { id: 'sam', guided: true, hitChance: 0.9 };
const FLAK = { id: 'flak', hitChance: 0.85 };
const jam = (x, y, team = 1, alive = true) => ({ type: 'jammer', team, x, y, alive, house: false });
const tgt = (x, y, team = 1) => ({ x, y, team });

test('Störsender: Werte in units.js, Fabrikhalle ausbildbar, nicht in der Hauptstadt', () => {
  assert.equal(UNITS.jammer.weapons.length, 0);
  assert.equal(UNITS.jammer.jam, 0.35);
  assert.equal(UNITS.jammer.jamRange, 300);
  assert.ok(CITY.produces.factory.includes('jammer'));
  assert.ok(!BUILDINGS.fob.produces.includes('jammer'), 'Hauptstadt-Menü bleibt voll (Regel 4)');
  const keys = CITY.produces.factory.map((t) => UNITS[t].hotkey);
  assert.equal(new Set(keys).size, keys.length, 'Fabrikmenü: keine doppelte Taste');
});

test('Störsender: senkt Trefferchance Lenkwaffen im Umkreis, nicht Flak', () => {
  const g = { units: [jam(100, 100)] };
  assert.equal(jamFactor(g, tgt(150, 100), SAM), 1 - 0.35);
  assert.equal(jamFactor(g, tgt(150, 100), FLAK), 1, 'Flak ist keine Lenkwaffe');
  assert.equal(jamFactor(g, tgt(100 + 301, 100), SAM), 1, 'außerhalb jamRange');
});

test('Störsender: nur lebende Störsender des Ziel-Teams, nicht stapelnd', () => {
  assert.equal(jamFactor({ units: [jam(0, 0, 1, false)] }, tgt(10, 0), SAM), 1, 'tot');
  assert.equal(jamFactor({ units: [jam(0, 0, 0)] }, tgt(10, 0, 1), SAM), 1, 'anderes Team');
  const two = { units: [jam(0, 0), jam(5, 0)] };
  assert.equal(jamFactor(two, tgt(10, 0), SAM), 1 - 0.35, 'zwei Störsender stapeln nicht');
});
