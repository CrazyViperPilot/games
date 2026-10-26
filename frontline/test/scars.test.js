// Sichtbarer Schaden: Wracks zerstörter Fahrzeuge und Gebäude, Krater von Mörsereinschlägen, Sichtstand, Obergrenzen und Ablauf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { addCrater } from '../js/game/scars.js';
import { BALANCE } from '../js/data/balance.js';

const S = BALANCE.scars;
const DT = 1 / BALANCE.tickRate;
const TILE = BALANCE.map.tile;

/** Leere Karte ohne Startunits (nur die Haupt-FOBs bleiben). */
function emptyGame() {
  const g = new Game({ map: createEmptyMap('Narben') });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  return g;
}

const run = (g, s) => {
  for (let i = 0; i < Math.round(s / DT); i++) g.update(DT);
};

test('Fahrzeuge und Hubschrauber hinterlassen ein Wrack mit Brandfleck, Infanterie und eingestiegene Passagiere nicht', () => {
  const g = emptyGame();
  const tank = g.spawnUnit('tank', 0, 3000, 3000);
  tank.angle = 0.7;
  const heli = g.spawnUnit('littlebird', 1, 3400, 3000);
  const man = g.spawnUnit('rifleman', 0, 3200, 3200);
  const rider = g.spawnUnit('rifleman', 0, 3300, 3300);
  rider.alive = false; // wie beim Einsteigen
  tank.hp = 0;
  heli.hp = 0;
  man.hp = 0;
  g.update(DT);
  assert.equal(g.wrecks.length, 2);
  const [w, h] = g.wrecks;
  assert.deepEqual([w.kind, w.type, w.team, w.x, w.y, w.angle], ['unit', 'tank', 0, 3000, 3000, 0.7]);
  assert.equal(h.type, 'littlebird');
  assert.equal(h.air, true);
  assert.equal(g.craters.length, 2, 'Brandfleck unter jedem Wrack');
  assert.ok(g.craters.every((c) => g.wrecks.some((x) => x.x === c.x && x.y === c.y)));
});

test('Zerstörte Gebäude lassen Trümmer und einen großen Brandfleck zurück, abgerissene nicht; ein Neubau räumt die Trümmer weg', () => {
  const g = emptyGame();
  const cx = g.grid.toCell(3000);
  const cy = g.grid.toCell(3000);
  const fob = g.spawnBuilding('fob', 0, cx, cy, { built: true });
  const other = g.spawnBuilding('fob', 0, cx + 8, cy, { built: true });
  fob.hp = 0;
  g.update(DT);
  assert.equal(g.wrecks.length, 1);
  const w = g.wrecks[0];
  assert.equal(w.kind, 'building');
  assert.equal(w.w, fob.w * TILE);
  assert.ok(Math.abs(w.x - fob.x) < 1e-9 && Math.abs(w.y - fob.y) < 1e-9, 'auf der Grundfläche');
  assert.equal(g.craters.length, 1);
  assert.ok(g.craters[0].r > 40, 'großer Brandfleck');
  assert.equal(g.issue(0, { type: 'demolish', buildingId: other.id }).ok, true);
  g.update(DT);
  assert.equal(g.wrecks.length, 1, 'Abriss hinterlässt nichts');
  g.spawnBuilding('fob', 0, cx, cy, { built: true });
  assert.equal(g.wrecks.length, 0, 'Neubau räumt auf');
});

test('Mörsereinschlag hinterlässt einen Krater an der Einschlagstelle', () => {
  const g = emptyGame();
  const home = g.mainFob(0);
  const m = g.spawnBuilding('mortar', 0, home.cx + 5, home.cy - 4, { built: true });
  const tx = m.x + 500;
  const ty = m.y;
  assert.equal(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: tx, y: ty }).ok, true);
  run(g, 8);
  assert.ok(g.craters.length >= 1, `${g.craters.length} Krater`);
  for (const c of g.craters) {
    assert.ok(Math.hypot(c.x - tx, c.y - ty) < 1e-6);
    assert.equal(c.r, S.craterR);
  }
});

test('Sichtstand: eine Narbe sieht nur, wer ihre Stelle gesehen hat; Obergrenzen und Ablauf', () => {
  const g = emptyGame();
  const home = g.mainFob(0);
  g.updateFog();
  addCrater(g, home.x + 60, home.y); // in eigener Sicht von Blau
  const c = g.craters[0];
  assert.equal(c.seen & 1, 1);
  assert.equal(c.seen & 2, 0, 'Rot hat die Stelle nie gesehen');
  g.spawnUnit('rifleman', 1, c.x + 30, c.y);
  g.updateFog();
  assert.equal(c.seen & 2, 2, 'jetzt auch Rot');
  // Obergrenze: die ältesten fallen weg
  for (let i = 0; i < S.craterMax + 10; i++) addCrater(g, 1000 + i, 1000);
  assert.equal(g.craters.length, S.craterMax);
  assert.equal(g.craters[0].x, 1000 + 10);
  for (let i = 0; i < S.wreckMax + 5; i++) {
    const u = g.spawnUnit('truck', 0, 2000 + i * 3, 2000);
    u.hp = 0;
  }
  g.update(DT);
  assert.equal(g.wrecks.length, S.wreckMax);
  // Ablauf: Krater nach craterLife, Wracks nach wreckLife
  run(g, S.craterLife + 1);
  assert.equal(g.craters.length, 0);
  assert.ok(g.wrecks.length > 0);
  run(g, S.wreckLife - S.craterLife);
  assert.equal(g.wrecks.length, 0);
});
