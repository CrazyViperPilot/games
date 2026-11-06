// KI-Lücken (seit v5.67, P6): Luftabwehr nach Art der Luftgegner (Gepard, Flak, SAM), Scharfschützen gegen viele Soldaten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { UNITS } from '../js/data/units.js';
import { AIR_PER, AIR_MAX, AIR_MEMORY, SNIPER_FROM, SNIPER_ARMY, SNIPER_SHARE } from '../js/data/ai.js';

const DT = 0.1;
function run(g, ai, s) {
  for (let i = 0; i < Math.round(s / DT); i++) {
    ai.update(DT);
    g.update(DT);
  }
}
const queued = (g, team, unit) => g.buildings.filter((b) => b.alive && b.team === team).reduce((n, b) => n + (b.queue ?? []).filter((e) => (e.unit ?? e) === unit).length, 0);
const has = (g, team, unit) => g.units.some((u) => u.alive && u.team === team && u.type === unit) || queued(g, team, unit) > 0;

/** Zustand für counterMix: gesehene Gegner (def aus UNITS) und eigene Kampfeinheiten. */
const situation = (foes, own = 0) => ({ enemies: foes.map((type) => ({ def: UNITS[type] })), combat: Array.from({ length: own }, () => ({})) });
const sumOf = (mix) => Object.values(mix).reduce((a, v) => a + v, 0);

test('Luftabwehr: gesehene Hubschrauber → Gepard und Flak, kein SAM', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const mix = ai.counterMix(situation(['gunship', 'gunship', 'gunship', 'gunship', 'gunship']));
  assert.ok(mix.gepard > 0, 'Gepard');
  assert.ok(mix.flak > 0, 'Flak');
  assert.equal(mix.sam, undefined, 'kein SAM gegen Hubschrauber');
  assert.ok(Math.abs(sumOf(mix) - 1) < 1e-9, 'Mischung ergibt 1');
  const total = 5 * AIR_PER;
  assert.ok(Math.abs(mix.gepard - total * 0.6) < 1e-9, 'Gepard 60 % der Hubschrauber-Luftabwehr');
  assert.ok(Math.abs(mix.flak - total * 0.4) < 1e-9, 'Flak 40 % der Hubschrauber-Luftabwehr');
});

test('Luftabwehr: gesehene Flugzeuge → SAM und Gepard, keine Flak', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const mix = ai.counterMix(situation(['f16', 'f16']));
  assert.ok(mix.sam > 0, 'SAM');
  assert.ok(mix.gepard > 0, 'Gepard');
  assert.equal(mix.flak, undefined, 'keine Flak gegen Flugzeuge');
  assert.ok(Math.abs(mix.sam - 2 * AIR_PER * 0.7) < 1e-9, 'SAM 70 % des Luftanteils');
});

test('Luftabwehr: höchstens AIR_MAX der Kampfeinheiten', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const many = Array(30).fill('gunship').concat(Array(30).fill('f16'));
  const mix = ai.counterMix(situation(many));
  const air = (mix.gepard ?? 0) + (mix.flak ?? 0) + (mix.sam ?? 0);
  assert.ok(Math.abs(air - AIR_MAX) < 1e-9, `Luftabwehr ${air} = AIR_MAX ${AIR_MAX}`);
});

test('Luftabwehr: ohne Sicht nach AIR_MEMORY keine mehr', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  assert.ok(ai.counterMix(situation(['gunship'])).flak > 0);
  g.time += AIR_MEMORY * 0.5;
  assert.ok(ai.counterMix(situation([])).flak > 0, 'innerhalb des Gedächtnisses gemerkt');
  g.time += AIR_MEMORY;
  assert.equal(ai.counterMix(situation([])).flak, undefined, 'nach dem Gedächtnis vergessen');
  assert.equal(ai.counterMix(situation([])).gepard, undefined);
});

test('Leicht: keine Luftabwehr und keine Scharfschützen', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'easy');
  const mix = ai.counterMix(situation(['gunship', 'f16', ...Array(SNIPER_FROM).fill('rifleman')], SNIPER_ARMY));
  for (const u of ['gepard', 'flak', 'sam', 'sniper']) assert.equal(mix[u], undefined, u);
});

test('Scharfschützen erst ab den Schwellen', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const foes = Array(SNIPER_FROM).fill('rifleman');
  assert.equal(ai.counterMix(situation(foes.slice(1), SNIPER_ARMY)).sniper, undefined, 'zu wenig gesehene Soldaten');
  assert.equal(ai.counterMix(situation(foes, SNIPER_ARMY - 1)).sniper, undefined, 'zu kleine eigene Armee');
  const mix = ai.counterMix(situation(foes, SNIPER_ARMY));
  assert.ok(Math.abs(mix.sniper - SNIPER_SHARE) < 1e-9, 'Anteil wie konfiguriert');
  assert.ok(Math.abs(sumOf(mix) - 1) < 1e-9);
});

test('KI gibt tatsächlich Befehl für Luftabwehr, wenn Hubschrauber gesehen werden', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const m = g.mainFob(1);
  g.teams[1].res.money = 20000;
  for (let k = 0; k < 4; k++) {
    const h = g.spawnUnit('gunship', 0, m.x + 250 + k * 30, m.y + 250);
    h.hp = 1e6;
    h.weapons.forEach((w) => (w.rounds = 0));
  }
  for (let s = 0; s < 120 && !(has(g, 1, 'flak') || has(g, 1, 'gepard')); s += 5) {
    g.teams[1].res.money = 20000;
    run(g, ai, 5);
  }
  assert.ok(has(g, 1, 'flak') || has(g, 1, 'gepard'), 'Flak oder Gepard in Ausbildung oder fertig');
});

test('KI bildet Scharfschützen aus, wenn viele Soldaten sichtbar sind', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const m = g.mainFob(1);
  for (let k = 0; k < SNIPER_ARMY; k++) g.spawnUnit('rifleman', 1, m.x + 300 + (k % 4) * 25, m.y + 300 + Math.floor(k / 4) * 25);
  for (let k = 0; k < SNIPER_FROM; k++) {
    const e = g.spawnUnit('rifleman', 0, m.x + 150 + (k % 5) * 20, m.y + 150 + Math.floor(k / 5) * 20); // nah genug, um sichtbar zu sein
    e.hp = 1e6; // unverwundbar und ohne Munition, damit die eigene Armee nicht vorher stirbt
    e.weapons.forEach((w) => (w.rounds = 0));
  }
  for (let s = 0; s < 240 && !has(g, 1, 'sniper'); s += 5) {
    g.teams[1].res.money = 20000;
    run(g, ai, 5);
  }
  assert.ok(has(g, 1, 'sniper'), 'Scharfschütze in Ausbildung oder fertig');
});
