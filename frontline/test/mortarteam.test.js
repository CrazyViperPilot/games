import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { CITY } from '../js/data/city.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { UNITS } from '../js/data/units.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit
const DT = 0.05;
const mk = (opts) => classic(new Game(opts));
function run(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}
/** Szene weit weg von der Basis: Mörsertrupp (Team 0) bei (x, y), Gegner (Team 1) am Zielpunkt. */
function scene(seed = 7) {
  const g = mk({ seed });
  for (const u of g.units) u.alive = false; // Startarmeen weg
  const z = g.zone;
  return { g, x: z.x + 1500, y: z.y };
}

test('Mörsertrupp: nur in der Kaserne ausbildbar (Taste E), nicht in der Hauptstadt', () => {
  const u = UNITS.mortarteam;
  assert.ok(u);
  assert.equal(u.hotkey, 'E');
  assert.equal(u.cost.money, 90);
  assert.equal(u.indirect, true, 'Zielsuche über die Reichweite wie die Panzerhaubitze');
  assert.ok(CITY.produces.barracks.includes('mortarteam'));
  assert.ok(!BUILDINGS.fob.produces.includes('mortarteam'), 'nicht in der Hauptstadt');
});

test('Mörsertrupp: Reichweite 700, Mindestreichweite 150, Kadenz 5 s, Granate mit Splash', () => {
  const w = UNITS.mortarteam.weapons[0];
  assert.equal(w.range, 700);
  assert.equal(w.minRange, 150);
  assert.equal(w.cooldown, 5);
  assert.equal(w.shell, true);
  assert.equal(w.splash, 60);
});

test('Mörsertrupp: Feuer auf Punkt (mortarTarget) schießt, Reichweite geprüft, Einschlag trifft Gegner', () => {
  const { g, x, y } = scene();
  const m = g.spawnUnit('mortarteam', 0, x, y);
  assert.match(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: x + 5000, y }).reason, /Reichweite/);
  assert.match(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: x + 100, y }).reason, /zu nah/);
  const tx = x + 400;
  const foe = g.spawnUnit('rifleman', 1, tx, y);
  foe.hp = 1e6;
  assert.ok(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: tx, y }).ok);
  const r0 = m.weapons[0].rounds;
  run(g, 1);
  assert.equal(m.weapons[0].rounds, r0 - 1, 'schießt auf den Punkt');
  run(g, 1);
  assert.equal(m.weapons[0].rounds, r0 - 1, 'Kadenz 5 s: keine zweite Granate sofort');
  run(g, 5);
  assert.ok(foe.hp < 1e6, 'Einschlag trifft den Gegner am Zielpunkt');
  assert.ok(g.issue(0, { type: 'stop', ids: [m.id] }).ok);
  assert.equal(m.fireTarget, null);
});
