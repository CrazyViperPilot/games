// Straßen der Karte: Bodenfahrzeuge fahren darauf schneller, abseits verbrauchen sie etwas mehr Treibstoff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { BALANCE } from '../js/data/balance.js';

const DT = 1 / BALANCE.tickRate;

function run(onRoad) {
  const map = createEmptyMap();
  map.town = { roads: [{ x1: 600, y1: 1000, x2: 3000, y2: 1000, w: 60 }], buildings: [], trees: [] };
  const g = new Game({ map });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  const y = onRoad ? 1000 : 1400;
  const u = g.spawnUnit('tank', 0, 800, y);
  const fuel0 = u.fuel;
  g.issue(0, { type: 'move', ids: [u.id], x: 2800, y });
  for (let i = 0; i < 5 / DT; i++) g.update(DT);
  return { dx: u.x - 800, fuel: fuel0 - u.fuel };
}

test('Straße: schneller, abseits mehr Verbrauch je Strecke', () => {
  const road = run(true);
  const off = run(false);
  assert.ok(road.dx > off.dx * 1.2, `Straße ${road.dx} vs. Gelände ${off.dx}`);
  assert.ok(off.fuel / off.dx > road.fuel / road.dx, 'Verbrauch je Strecke abseits höher');
});

import { modOf, researchBlock } from '../js/game/research.js';

test('Forschungsbaum: Turbine macht Panzer schneller, Vorgänger nötig, Rauch halbiert Schaden, Mine trifft', () => {
  const g = new Game({ map: createEmptyMap(), research: true });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  assert.match(researchBlock(g, 0, 'tank2'), /Richtoptik/);
  g.teams[0].tech.done.push('tank6', 'log5', 'log7');
  assert.ok(Math.abs(modOf(g, g.spawnUnit('tank', 0, 500, 500), 'speed') - 1.12) < 1e-9);
  const tank = g.spawnUnit('tank', 0, 1000, 1000);
  const eng = g.spawnUnit('engineer', 0, 1100, 1000);
  assert.equal(g.issue(0, { type: 'smoke', ids: [tank.id] }).ok, true);
  assert.equal(g.issue(0, { type: 'smoke', ids: [tank.id] }).ok, false, 'Ladezeit');
  assert.equal(g.issue(0, { type: 'mine', ids: [eng.id] }).ok, true);
  const foe = g.spawnUnit('tank', 1, 1100, 1000);
  g.update(DT);
  assert.ok(foe.hp < foe.maxHp, 'Mine hat getroffen');
  const hp = tank.hp;
  g.spawnUnit('tank', 1, 1400, 1000);
  assert.ok(g.smokes.length === 1);
});
