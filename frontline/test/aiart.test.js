// KI: Gepard gegen Luftziele, Panzerhaubitze ab einer größeren Armee, Haubitze hinter der Armee (seit v5.26).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { GEPARD_PER_AIR, ART_FROM, ART_BEHIND } from '../js/data/ai.js';

const DT = 0.1;
function run(g, ai, s) {
  for (let i = 0; i < Math.round(s / DT); i++) {
    ai.update(DT);
    g.update(DT);
  }
}
const queued = (g, team, unit) => g.buildings.concat([]).filter((b) => b.alive && b.team === team).reduce((n, b) => n + (b.queue ?? []).filter((e) => (e.unit ?? e) === unit).length, 0);
const has = (g, team, unit) => g.units.some((u) => u.alive && u.team === team && u.type === unit) || queued(g, team, unit) > 0;

test('KI bildet Gepard aus, sobald sie gegnerische Luftfahrzeuge sieht', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const m = g.mainFob(1);
  g.teams[1].res.money = 20000;
  run(g, ai, 20);
  assert.equal(has(g, 1, 'gepard'), false, 'ohne Luftziele kein Gepard');
  for (let k = 0; k < 4; k++) {
    const h = g.spawnUnit('gunship', 0, m.x + 250 + k * 30, m.y + 250);
    h.hp = 1e6;
    h.weapons.forEach((w) => (w.rounds = 0));
  }
  assert.ok(4 * GEPARD_PER_AIR > 0);
  for (let s = 0; s < 120 && !has(g, 1, 'gepard'); s += 5) {
    g.teams[1].res.money = 20000;
    run(g, ai, 5);
  }
  assert.ok(has(g, 1, 'gepard'), 'Gepard in Ausbildung oder fertig');
});

test('KI bildet ab einer größeren Armee Panzerhaubitzen aus und stellt sie hinter die Armee', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const m = g.mainFob(1);
  for (let k = 0; k < ART_FROM + 5; k++) g.spawnUnit(k % 2 ? 'ifv' : 'rifleman', 1, m.x + 300 + (k % 5) * 25, m.y + 300 + Math.floor(k / 5) * 25);
  for (let s = 0; s < 240 && !g.units.some((u) => u.alive && u.team === 1 && u.type === 'pzh'); s += 5) {
    g.teams[1].res.money = 20000;
    run(g, ai, 5);
  }
  const pzh = g.units.find((u) => u.alive && u.team === 1 && u.type === 'pzh');
  assert.ok(pzh, 'Panzerhaubitze ausgebildet');
  run(g, ai, 30);
  const army = g.units.filter((u) => u.alive && u.team === 1 && u.def.range > 0 && !u.def.indirect && !u.def.hero && !u.def.jet);
  const cx = army.reduce((a, u) => a + u.x, 0) / army.length;
  const cy = army.reduce((a, u) => a + u.y, 0) / army.length;
  const d = Math.hypot(pzh.x - cx, pzh.y - cy);
  assert.ok(d > ART_BEHIND * 0.4 && d < ART_BEHIND * 2.5, `Haubitze steht hinter der Armee (${Math.round(d)} px)`);
});
