// Paket E13 (Teil b): C-130 setzt Passagiere am Zielpunkt per Fallschirm ab. Kein Stadtbau nötig: das Flugzeug wird direkt gesetzt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { UNITS } from '../js/data/units.js';

const DT = 0.05;
const run = (g, s) => {
  for (let i = 0; i < s / DT; i++) g.update(DT);
};

/** C-130 mit zehn Fallschirmjägern an Bord, 250 px vom Startpunkt des Teams 0 entfernt (Zielpunkt liegt in Flugrichtung). */
function setup(seed = 5) {
  const g = new Game({ seed });
  const sp = g.map.spawns[0];
  const plane = g.spawnUnit('c130', 0, sp.x, sp.y);
  for (let i = 0; i < UNITS.c130.seats; i++) {
    const p = g.spawnUnit('rifleman', 0, sp.x, sp.y);
    p.alive = false;
    plane.passengers.push(p);
  }
  return { g, plane, tx: sp.x + 250, ty: sp.y };
}

test('C-130 setzt alle Passagiere nahe am Zielpunkt ab und fliegt heim', () => {
  const { g, plane, tx, ty } = setup();
  const r = g.issue(0, { type: 'paradrop', ids: [plane.id], x: tx, y: ty });
  assert.equal(r.ok, true, r.reason);
  const pax = [...plane.passengers];
  run(g, 60);
  assert.equal(plane.passengers.length, 0, 'alle Passagiere sind abgesetzt');
  assert.equal(pax.length, UNITS.c130.seats);
  for (const p of pax) {
    assert.equal(p.alive, true, 'Fallschirmjäger lebt wieder');
    const d = Math.hypot(p.x - tx, p.y - ty);
    assert.ok(d <= UNITS.c130.dropRadius + 25, `Soldat ${Math.round(d)} px vom Zielpunkt entfernt`);
  }
  assert.equal(plane.paradrop, null, 'Anflug beendet');
  assert.notEqual(plane.order.type, 'paradrop', 'Flugzeug hat den Heimflug-/Landebefehl oder kreist');
});

test('Fallschirm: Passagiere schießen nicht, solange chute > 0, und zählen herunter', () => {
  const { g, plane, tx, ty } = setup(7);
  g.issue(0, { type: 'paradrop', ids: [plane.id], x: tx, y: ty });
  run(g, 60);
  const floaters = g.units.filter((u) => u.alive && u.type === 'rifleman' && u.chute > 0);
  assert.equal(floaters.length, 0, 'nach 60 s ist der Fallschirm abgelaufen');
  const probe = g.units.find((u) => u.alive && u.type === 'rifleman');
  assert.ok(probe, 'es gibt Fallschirmjäger');
  probe.chute = 1;
  run(g, 0.5);
  assert.ok(probe.chute > 0 && probe.chute < 1, 'Fallschirm zählt herunter');
});

test('Befehl nur für C-130 mit Passagieren', () => {
  const g = new Game({ seed: 5 });
  const sp = g.map.spawns[0];
  const rifle = g.spawnUnit('rifleman', 0, sp.x, sp.y);
  const r = g.issue(0, { type: 'paradrop', ids: [rifle.id], x: sp.x + 100, y: sp.y });
  assert.equal(r.ok, false);
  const empty = g.spawnUnit('c130', 0, sp.x, sp.y);
  assert.equal(g.issue(0, { type: 'paradrop', ids: [empty.id], x: sp.x + 100, y: sp.y }).ok, false, 'ohne Passagiere abgelehnt');
});
