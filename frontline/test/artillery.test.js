// Flakpanzer Gepard und Panzerhaubitze (seit v5.19): Ausbildung, Waffen, Feuer auf einen Punkt, Forschungsast „Artillerie und Gepard“.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic } from './classic.js';
import { UNITS } from '../js/data/units.js';
import { RESEARCH } from '../js/data/research.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { CITY } from '../js/data/city.js';
import { unitHitChance } from '../js/game/combat.js';
import { modOf, researchEffect } from '../js/game/research.js';

const DT = 0.05;
function run(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}
function scene(seed = 7, opts = {}) {
  const g = classic(new Game({ seed, ...opts }));
  for (const u of g.units) u.alive = false;
  const z = g.zone;
  return { g, x: z.x + 1500, y: z.y };
}

test('Gepard und Panzerhaubitze: in der Hauptstadt und (mit Stadt) in der Fabrikhalle ausbildbar', () => {
  for (const k of ['gepard', 'pzh']) {
    assert.ok(BUILDINGS.fob.produces.includes(k), `${k} in der Hauptstadt`);
    assert.ok(CITY.produces.factory.includes(k), `${k} in der Fabrikhalle`);
  }
  const g = classic(new Game({ seed: 7 }));
  const m = g.mainFob(0);
  g.teams[0].res.money = 5000;
  assert.ok(g.issue(0, { type: 'train', buildingId: m.id, unit: 'gepard' }).ok);
  assert.ok(g.issue(0, { type: 'train', buildingId: m.id, unit: 'pzh' }).ok);
  run(g, UNITS.pzh.buildTime + 2);
  assert.ok(g.units.some((u) => u.alive && u.type === 'gepard' && u.team === 0));
  assert.ok(g.units.some((u) => u.alive && u.type === 'pzh' && u.team === 0));
});

test('Gepard: trifft schnelle Flugzeuge viel besser als die Flak und schießt Hubschrauber ab', () => {
  const { g, x, y } = scene();
  const gep = g.spawnUnit('gepard', 0, x, y);
  const flak = g.spawnUnit('flak', 0, x, y + 40);
  const jet = { x: x + 200, y, speedNow: UNITS.f16.speed };
  const pg = unitHitChance(gep, jet, gep.weapons[0].spec);
  const pf = unitHitChance(flak, jet, flak.weapons[0].spec);
  assert.ok(pg > 1.8 * pf, `Gepard ${pg.toFixed(2)} gegen Flak ${pf.toFixed(2)}`);
  flak.alive = false;
  const heli = g.spawnUnit('gunship', 1, x + 300, y);
  heli.weapons.forEach((w) => (w.rounds = 0));
  run(g, 12);
  assert.equal(heli.alive, false, 'Kampfhubschrauber abgeschossen');
});

test('Panzerhaubitze: Granaten mit Splash weit über die eigene Sicht, nicht unter der Mindestreichweite', () => {
  const { g, x, y } = scene();
  const pzh = g.spawnUnit('pzh', 0, x, y);
  const w = UNITS.pzh.weapons[0];
  const spotter = g.spawnUnit('rifleman', 0, x + 1000, y); // Sicht des Teams
  const foe = g.spawnUnit('ifv', 1, x + 1100, y);
  foe.hp = 1e6;
  foe.weapons.forEach((q) => (q.rounds = 0));
  spotter.hp = 1e6;
  const near = g.spawnUnit('rifleman', 1, x + 120, y); // zu nah für die Haubitze
  near.weapons.forEach((q) => (q.rounds = 0));
  near.hp = 1e6;
  run(g, 1);
  assert.ok(pzh.weapons[0].rounds < w.rounds, 'feuert auf das weit entfernte Ziel');
  assert.ok(g.projectiles.length > 0, 'Granate in der Luft');
  run(g, 4);
  assert.ok(foe.hp < 1e6, 'Einschlag trifft');
  assert.equal(near.hp, 1e6, 'unter der Mindestreichweite: kein Treffer');
});

test('Panzerhaubitze: Feuer auf einen Punkt (mortarTarget), Reichweite geprüft, Stopp löscht das Ziel', () => {
  const { g, x, y } = scene();
  const pzh = g.spawnUnit('pzh', 0, x, y);
  const far = g.issue(0, { type: 'mortarTarget', ids: [pzh.id], x: x + 5000, y });
  assert.equal(far.ok, false);
  assert.match(far.reason, /Reichweite/);
  assert.match(g.issue(0, { type: 'mortarTarget', ids: [pzh.id], x: x + 100, y }).reason, /zu nah/);
  assert.ok(g.issue(0, { type: 'mortarTarget', ids: [pzh.id], x: x + 800, y: y + 100 }).ok);
  const r0 = pzh.weapons[0].rounds;
  run(g, 1);
  assert.equal(pzh.weapons[0].rounds, r0 - 1, 'schießt auf den Punkt, ohne Gegner');
  const p = g.projectiles.at(-1);
  assert.ok(Math.hypot(p.tx - (x + 800), p.ty - (y + 100)) <= UNITS.pzh.weapons[0].spread + 1e-6, 'Streuung höchstens spread');
  assert.ok(g.issue(0, { type: 'stop', ids: [pzh.id] }).ok);
  assert.equal(pzh.fireTarget, null);
});

test('Forschung: 8. Ast „Artillerie und Gepard“ verbessert Reichweite, Tank, Genauigkeit, Kadenz; Gepard zählt auch zur Flugabwehr', () => {
  assert.equal(Object.keys(RESEARCH.lanes).length, 8);
  assert.equal(RESEARCH.lanes.art.items.length, RESEARCH.tiers);
  const stats = new Set(RESEARCH.lanes.art.items.flatMap((it) => Object.values(it.fx).flatMap((st) => Object.keys(st))));
  for (const s of ['range', 'fuel', 'acc', 'rof']) assert.ok(stats.has(s), `verbessert ${s}`);
  assert.match(researchEffect('art4'), /Streuung der Granaten −20 %/);
  const { g, x, y } = scene(7, { research: true });
  const gep = g.spawnUnit('gepard', 0, x, y);
  const pzh = g.spawnUnit('pzh', 0, x, y + 50);
  g.teams[0].tech.done.push('art1', 'art2', 'art3', 'art4', 'mech2');
  assert.ok(Math.abs(modOf(g, pzh, 'range') - 1.08) < 1e-9);
  assert.ok(Math.abs(modOf(g, pzh, 'fuel') - 0.85) < 1e-9);
  assert.ok(Math.abs(modOf(g, pzh, 'acc') - 1.25) < 1e-9);
  assert.ok(Math.abs(modOf(g, gep, 'range') - 1.08 * 1.08) < 1e-9, 'Gepard: eigener Ast und Flugabwehr (Suchradar)');
});
