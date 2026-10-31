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

import { fxMul, researchBlock } from '../js/game/research.js';

test('Forschungsbaum: Motor wirkt, Meisterschaft braucht den ganzen Ast, Rauch halbiert Schaden, Mine trifft', () => {
  const g = new Game({ map: createEmptyMap(), research: true });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  g.teams[0].tech.tier = 3;
  assert.match(researchBlock(g, 0, 'engine2'), /Motor I/);
  assert.match(researchBlock(g, 0, 'vmaster'), /Ast/);
  g.teams[0].tech.done.push('engine1', 'engine2', 'smoke', 'mines');
  assert.ok(Math.abs(fxMul(g, 0, 'speed') - 1.21) < 1e-9);
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
