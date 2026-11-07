// Gemalte Einheiten (seit v5.27): jede Einheitenart hat ein Modell für beide Teams, alle Körper sind gültig (endliche Punkte,
// Flächen mit mindestens drei Ecken, aufgesetzte Teile hängen an einem Körper desselben Modells), und ohne Canvas (Node) melden
// die Zeichenfunktionen false, damit der Renderer die einfache Form zeichnet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../js/data/units.js';
import { unitModel, unitModelTypes, unitLook, drawUnitIso, drawUnitTop, drawWreckIso, drawWreckTop } from '../js/render/unitpaint.js';

function checkSolids(name, solids) {
  assert.ok(solids.length > 0, `${name}: keine Körper`);
  const own = new Set(solids);
  for (const so of solids) {
    assert.match(so.col, /^#[0-9a-f]{6}$/i, `${name}: Farbe ${so.col}`);
    assert.ok(so.c.every(Number.isFinite), `${name}: Mitte`);
    if (so.on) assert.ok(own.has(so.on), `${name}: aufgesetztes Teil ohne Träger im Modell`);
    for (const f of so.faces) {
      assert.ok(f.length >= 3, `${name}: Fläche mit ${f.length} Ecken`);
      for (const p of f) assert.ok(p.length === 3 && p.every(Number.isFinite), `${name}: Punkt ${p}`);
    }
  }
}

test('jede Einheitenart hat ein gemaltes Modell', () => {
  const types = new Set(unitModelTypes());
  for (const type of Object.keys(UNITS)) assert.ok(types.has(type), `kein Modell für ${type}`);
});

test('Modelle sind gültig, je Team, Gehbild und Zustand der F-16', () => {
  for (const type of unitModelTypes()) {
    for (const team of [0, 1, 2]) {
      const looks = UNITS[type]?.armor === 'inf' ? [0, 1, 2, 3, 4].map((frame) => ({ frame })) : [{}, { missiles: 0, gear: true }];
      for (const o of looks) {
        const m = unitModel(type, team, o);
        assert.ok(m, `${type}: kein Modell`);
        checkSolids(type, m.S);
        if (m.turret) {
          assert.ok(Number.isFinite(m.turret.x), `${type}: Drehpunkt des Turms`);
          checkSolids(`${type} Turm`, m.turret.S);
        }
      }
    }
  }
});

test('F-22: Raketen nur am Boden in offenen Schächten sichtbar, je Vorrat ein Bild, im Flug eines', () => {
  const def = UNITS.f22;
  const jet = (rounds, parked) => ({ id: 1, type: 'f22', team: 0, def, parked, jet: { phase: parked ? 'park' : 'air' }, weapons: [{ spec: def.weapons[0], rounds }] });
  assert.deepEqual(unitLook(jet(6, true), 0), { missiles: 6, gear: true });
  assert.deepEqual(unitLook(jet(2.6, true), 0), { missiles: 2, gear: true }, 'beim Nachladen zählen nur volle Raketen');
  assert.deepEqual(unitLook(jet(6, false), 0), unitLook(jet(0, false), 0), 'im Flug: Schächte zu, ein Bild für jeden Vorrat');
  const n = (o) => unitModel('f22', 0, o).S.length;
  for (let k = 0; k <= 6; k++) checkSolids(`f22 mit ${k} Raketen`, unitModel('f22', 0, { missiles: k, gear: true }).S);
  for (let k = 1; k <= 6; k++) assert.ok(n({ missiles: k, gear: true }) > n({ missiles: k - 1, gear: true }), `${k} Raketen sichtbar`);
  assert.equal(n({ missiles: 6 }), n({}), 'ohne Fahrwerk keine Raketen zu sehen');
  assert.equal(unitModel('f22', 0, {}).nozzle.ys.length, 2, 'zwei Düsen, zwei Nachbrenner');
});

test('Teams unterscheiden sich in der Farbe, Gehbilder in der Haltung', () => {
  const cols = (m) => m.S.map((so) => so.col).join();
  assert.notEqual(cols(unitModel('tank', 0)), cols(unitModel('tank', 1)));
  const legs = (m) => JSON.stringify(m.S[0].faces);
  assert.notEqual(legs(unitModel('rifleman', 0, { frame: 0 })), legs(unitModel('rifleman', 0, { frame: 2 })));
});

test('ohne Canvas zeichnen die Funktionen nichts und melden false', () => {
  const cam = { zoom: 1, rot: 0 };
  const u = { id: 1, type: 'tank', team: 0, x: 0, y: 0, angle: 0, def: UNITS.tank };
  assert.equal(drawUnitIso({}, cam, u, { x: 0, y: 0 }), false);
  assert.equal(drawUnitTop({}, u, 1), false);
  assert.equal(drawWreckIso({}, cam, { type: 'tank', angle: 0 }, { x: 0, y: 0 }), false);
  assert.equal(drawWreckTop({}, { type: 'tank', angle: 0, x: 0, y: 0 }, 1), false);
  assert.equal(drawWreckTop({}, { type: 'rifleman', angle: 0, x: 0, y: 0 }, 1), false);
  assert.equal(drawUnitIso({}, cam, { ...u, type: 'unbekannt' }, { x: 0, y: 0 }), false);
});
