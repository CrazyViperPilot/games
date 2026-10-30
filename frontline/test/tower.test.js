// Festung: gebaute Gefechtstürme mit Besatzung, Dachaufbau, Einsturz, Festungsbefehl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { BALANCE } from '../js/data/balance.js';
import { BUILDINGS } from '../js/data/buildings.js';

const DT = 1 / BALANCE.tickRate;
const run = (g, s) => {
  for (let i = 0; i < Math.round(s / DT); i++) g.update(DT);
};

function setup() {
  const g = new Game({ map: createEmptyMap('Festung') });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  const fob = g.buildings.find((b) => b.main && b.team === 0);
  return { g, fob };
}

/** Fertiger Turm 5 Zellen rechts neben der Haupt-FOB. */
function tower(g, fob) {
  return g.spawnBuilding('tower', 0, fob.cx + 6, fob.cy, { built: true });
}

test('Turm: Soldaten ziehen ein (höchstens cap), sind geschützt, Rest bleibt draußen', () => {
  const { g, fob } = setup();
  const t = tower(g, fob);
  const men = [0, 1, 2, 3, 4].map((i) => g.spawnUnit('rifleman', 0, t.x - 80, t.y + i * 14));
  assert.equal(g.issue(0, { type: 'garrison', ids: men.map((u) => u.id), houseId: t.id }).ok, true);
  run(g, 15);
  assert.equal(t.occupants.length, BUILDINGS.tower.cap);
  assert.equal(t.team, 0);
  assert.equal(men.filter((u) => u.house === t.id).length, BUILDINGS.tower.cap);
  // Gegner kann den Turm nicht besetzen
  const foe = g.spawnUnit('rifleman', 1, t.x + 60, t.y);
  assert.equal(g.issue(1, { type: 'garrison', ids: [foe.id], houseId: t.id }).ok, false);
});

test('Dachaufbau: wird bezahlt, braucht Zeit, feuert nur mit Besatzung; nur einer je Turm', () => {
  const { g, fob } = setup();
  const t = tower(g, fob);
  assert.equal(g.issue(0, { type: 'roof', buildingId: t.id, kind: 'bogus' }).ok, false);
  assert.equal(g.issue(0, { type: 'roof', buildingId: t.id, kind: 'mortar' }).ok, true);
  assert.equal(g.issue(0, { type: 'roof', buildingId: t.id, kind: 'flak' }).ok, false);
  run(g, BUILDINGS.tower.roofs.mortar.time + 1);
  assert.equal(t.roof, 'mortar');
  assert.ok(t.def.weapon.shell);
  // Ziel in Reichweite, aber keine Besatzung: kein Schuss
  const foe = g.spawnUnit('rifleman', 1, t.x + 400, t.y);
  assert.equal(g.issue(0, { type: 'mortarTarget', ids: [t.id], x: foe.x, y: foe.y }).ok, true);
  run(g, 3);
  assert.equal(g.projectiles.length + g.effects.filter((e) => e.type === 'muzzle').length, 0);
  const m = g.spawnUnit('rifleman', 0, t.x - 70, t.y);
  g.issue(0, { type: 'garrison', ids: [m.id], houseId: t.id });
  run(g, 25);
  assert.ok(t.cooldown > 0 || g.projectiles.length > 0 || foe.hp < foe.maxHp || !foe.alive, 'Mörser hat gefeuert');
});

test('Einsturz: Besatzung fällt verletzt heraus', () => {
  const { g, fob } = setup();
  const t = tower(g, fob);
  const m = g.spawnUnit('rifleman', 0, t.x - 70, t.y);
  g.issue(0, { type: 'garrison', ids: [m.id], houseId: t.id });
  run(g, 10);
  assert.equal(m.house, t.id);
  t.hp = 0;
  g.cleanup();
  assert.equal(m.house, 0);
  assert.ok(m.hp < m.maxHp);
});

test('Festungsbefehl: Ring mit Toren und Türmen um die FOB', () => {
  const { g, fob } = setup();
  const r = g.issue(0, { type: 'fortify', buildingId: fob.id });
  assert.equal(r.ok, true, r.reason);
  const mine = g.buildings.filter((b) => b.team === 0);
  assert.equal(mine.filter((b) => b.type === 'tower').length, BALANCE.fortress.towers);
  assert.equal(mine.filter((b) => b.type === 'gate').length, 4);
  assert.ok(mine.filter((b) => b.type === 'wall').length >= 20);
  // zweiter Aufruf ergänzt nichts Doppeltes
  const n = g.buildings.length;
  g.issue(0, { type: 'fortify', buildingId: fob.id });
  assert.equal(g.buildings.length, n);
});
