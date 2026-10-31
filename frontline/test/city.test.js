// Stadt (city.js, PRD §15): Zonen, Wachstum, Einwohner, Erträge ins Lager der Haupt-FOB, Befehl und KI-Bauplan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { AI } from '../js/ai/ai.js';

const run = (g, s) => { for (let t = 0; t < s * 20; t++) g.update(0.05); };
const paint = (g, kind, c0, r0, c1, r1, team = 0) => g.issue(team, { type: 'city', kind, c0, r0, c1, r1 });

test('ohne Stadt: unendliches Lager, Stadtbefehl abgelehnt', () => {
  const g = new Game({ seed: 3 });
  assert.equal(g.city, null);
  assert.equal(g.mainFob(0).infinite, true);
  assert.equal(paint(g, 'road', 0, 0, 1, 0).ok, false);
});

test('mit Stadt: endliches Startlager, Front-Summe ohne Haupt-FOB', () => {
  const g = new Game({ seed: 3, city: true });
  const m = g.mainFob(0);
  assert.equal(m.infinite, false);
  assert.deepEqual({ ...m.store }, CITY.startStock);
  assert.equal(g.teams[0].res.bm, 0);
});

test('Bauen kostet Geld, zu wenig Geld stoppt, Abriss ist kostenlos', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 100 });
  const r = paint(g, 'road', 0, 0, 9, 0); // 10 x 5 = 50
  assert.ok(r.ok);
  assert.equal(g.teams[0].res.money, 50);
  const r2 = paint(g, 'bm', 0, 1, 4, 1); // 5 x 40 > 50 Geld: nur 1 Zelle
  assert.equal(r2.placed, 1);
  assert.equal(r2.broke, true);
  assert.equal(paint(g, 'erase', 0, 1, 4, 1).ok, true);
  assert.equal(g.teams[0].res.money, 10);
  assert.equal(paint(g, 'res', 0, 1, 0, 1).ok, false); // zu wenig Geld (20 > 10)
});

test('Zone ohne Straße wächst nicht, mit Straße wird sie Gebäude', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 2000 });
  paint(g, 'res', 5, 5, 5, 5);
  run(g, CITY.growTime + 2);
  assert.equal(g.city[0].level[5 * CITY.cols + 5], 0);
  paint(g, 'road', 5, 4, 5, 4);
  run(g, CITY.growTime + 2);
  assert.equal(g.city[0].level[5 * CITY.cols + 5], 1);
});

test('Wohnen + Werk + Straße: Einwohner arbeiten, Lager und Geld wachsen', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  paint(g, 'road', 0, 2, 5, 2);
  paint(g, 'res', 0, 1, 5, 1);
  paint(g, 'bm', 0, 3, 5, 3);
  const m = g.mainFob(0);
  m.store.bm = 0;
  const money0 = g.teams[0].res.money;
  run(g, 120);
  const s = g.city[0].stats;
  assert.ok(s.pop > 8, `Einwohner ${s.pop}`);
  assert.ok(s.workers > 0 && s.bm > 0);
  assert.ok(m.store.bm > 50, `BM ${m.store.bm}`);
  assert.ok(g.teams[0].res.money > money0);
  assert.ok(m.store.bm <= 3000);
  assert.equal(g.city[1].stats.pop, 0, 'andere Stadt unberührt');
});

test('Ausbau nur bei Bedarf: Wohnen ohne Arbeit bleibt Stufe 1', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  paint(g, 'road', 0, 2, 3, 2);
  paint(g, 'res', 0, 1, 3, 1);
  run(g, CITY.growTime + CITY.upgradeTime * 3);
  assert.ok(g.city[0].level.slice(CITY.cols, CITY.cols + 4).every((l) => l === 1));
});

test('KI baut nach Bauplan und liefert Material', () => {
  const g = new Game({ seed: 5, city: true, startMoney: 2000 });
  const ai = new AI(g, 1, 'normal');
  const n0 = g.city[1].kind.filter(Boolean).length;
  for (let t = 0; t < 20 * 240; t++) { ai.update(0.05); g.update(0.05); }
  assert.ok(g.city[1].kind.filter(Boolean).length > n0 + 10);
  assert.ok(g.city[1].stats.pop > 0);
});
