import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { CITY } from '../js/data/city.js';
import { UNITS } from '../js/data/units.js';
import { updateMines, mineVisible } from '../js/game/mines.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { AI } from '../js/ai/ai.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit
const DT = 0.05;
const S = BALANCE.sapper;
const mk = () => classic(new Game({ seed: 7 }));
/** Eigene Hauptstadt-FOB mit Munition im Lager; dort liegen die Minen. */
function fobOf(g) {
  return g.buildings.find((b) => b.alive && b.built && b.team === 0 && b.type === 'fob');
}

test('Pionier: Infanterie, Kaserne (nicht Hauptstadt), Taste F im Kasernenmenü frei', () => {
  assert.equal(UNITS.sapper.armor, 'inf');
  assert.equal(UNITS.sapper.hotkey, 'F');
  assert.ok(CITY.produces.barracks.includes('sapper'));
  assert.ok(!BUILDINGS.fob.produces.includes('sapper'), 'Hauptstadt-Menü bleibt voll (Regel 4)');
  const keys = CITY.produces.barracks.map((t) => UNITS[t].hotkey);
  assert.equal(new Set(keys).size, keys.length, 'Kasernenmenü: keine doppelte Taste');
});

test('Pionier legt eine Mine an der Klickstelle, Munition wird abgebucht; Schütze legt keine', () => {
  const g = mk();
  const f = fobOf(g);
  f.store.mun = 500;
  const s = g.spawnUnit('sapper', 0, f.x + 30, f.y);
  const r = g.issue(0, { type: 'layMine', ids: [s.id], x: f.x + 60, y: f.y });
  assert.equal(r.ok, true, r.reason);
  assert.equal(g.sapperMines.length, 1);
  assert.equal(g.sapperMines[0].team, 0);
  assert.equal(f.store.mun, 500 - S.mineCost.mun);
  const rifle = g.spawnUnit('rifleman', 0, f.x + 30, f.y + 20);
  assert.equal(g.issue(0, { type: 'layMine', ids: [rifle.id], x: f.x + 60, y: f.y }).ok, false);
});

test('Höchstens maxMines aktive Minen je Pionier', () => {
  const g = mk();
  const f = fobOf(g);
  f.store.mun = 1000;
  const s = g.spawnUnit('sapper', 0, f.x + 30, f.y);
  for (let i = 0; i < S.maxMines; i++) assert.equal(g.issue(0, { type: 'layMine', ids: [s.id], x: f.x + 60, y: f.y + i * 3 }).ok, true);
  assert.equal(g.issue(0, { type: 'layMine', ids: [s.id], x: f.x + 60, y: f.y + 60 }).ok, false);
});

test('Gegnerisches Panzerfahrzeug löst die Mine aus und nimmt Schaden; Infanterie löst nicht aus', () => {
  const g = mk();
  const f = fobOf(g);
  const m = { x: f.x + 60, y: f.y, team: 0, owner: 0, clear: 0 };
  g.sapperMines.push(m);
  const inf = g.spawnUnit('rifleman', 1, m.x, m.y);
  const hp0 = inf.hp;
  updateMines(g, DT);
  assert.equal(g.sapperMines.length, 1, 'Infanterie löst nicht aus');
  assert.equal(inf.hp, hp0);
  const tank = g.spawnUnit('tank', 1, m.x, m.y);
  const th = tank.hp;
  updateMines(g, DT);
  assert.equal(g.sapperMines.length, 0, 'Fahrzeug löst aus, Mine ist weg');
  assert.ok(tank.hp < th, 'Fahrzeug nimmt Schaden');
});

test('Gegnerischer Pionier räumt die Mine nach clearTime', () => {
  const g = mk();
  const f = fobOf(g);
  g.sapperMines.push({ x: f.x + 60, y: f.y, team: 0, owner: 0, clear: 0 });
  g.spawnUnit('sapper', 1, f.x + 70, f.y);
  for (let t = 0; t < S.clearTime / DT - 5; t++) updateMines(g, DT);
  assert.equal(g.sapperMines.length, 1, 'noch nicht geräumt');
  for (let t = 0; t < 10; t++) updateMines(g, DT);
  assert.equal(g.sapperMines.length, 0, 'geräumt');
});

test('Sichtbarkeit: gegnerische Mine nur nahe eines Pioniers (60 px) oder einer Einheit (25 px)', () => {
  const m = { x: 0, y: 0, team: 0, owner: 0, clear: 0 };
  const fake = (units) => ({ units: units.map(([type, x, y]) => ({ alive: true, team: 1, type, x, y, house: false })) });
  assert.equal(mineVisible(fake([['rifleman', 100, 0]]), 1, m), false);
  assert.equal(mineVisible(fake([['rifleman', 20, 0]]), 1, m), true, 'Einheit ≤ 25 px');
  assert.equal(mineVisible(fake([['sapper', 50, 0]]), 1, m), true, 'Pionier ≤ 60 px');
  assert.equal(mineVisible(fake([['rifleman', 50, 0]]), 1, m), false, 'Infanterie allein reicht nicht bis 60 px');
  assert.equal(mineVisible(fake([]), 0, m), true, 'eigene Minen immer sichtbar');
});

test('Minen bleiben im Spielstand erhalten', () => {
  const g = mk();
  g.sapperMines.push({ x: 5, y: 6, team: 0, owner: 1, clear: 0 });
  const { game } = restoreGame(snapshotGame(g, new AI(g, 1, 'normal')));
  assert.deepEqual(game.sapperMines.map((m) => [m.x, m.y, m.team, m.owner]), [[5, 6, 0, 1]]);
});
