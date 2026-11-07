// Gemalte Einheiten (seit v5.27): jede Einheitenart hat ein Modell für beide Teams, alle Körper sind gültig (endliche Punkte,
// Flächen mit mindestens drei Ecken, aufgesetzte Teile hängen an einem Körper desselben Modells), und ohne Canvas (Node) melden
// die Zeichenfunktionen false, damit der Renderer die einfache Form zeichnet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../js/data/units.js';
import { unitModel, unitModelTypes, unitLook, drawUnitIso, drawUnitTop, drawWreckIso, drawWreckTop, PAINT } from '../js/render/unitpaint.js';

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

test('U-2: Bild hängt nur vom Fahrwerk ab (Boden mit Stützrädern und hängenden Flügelspitzen, Flug gerade), malt ohne Fehler', () => {
  const def = UNITS.u2;
  assert.ok(def, 'UNITS.u2 fehlt');
  const plane = (phase, parked) => ({ id: 1, type: 'u2', team: 0, def, parked, jet: { phase, alt: parked ? 0 : 1 }, weapons: [] });
  for (const ph of ['taxiOut', 'roll', 'rollout', 'taxiIn']) assert.deepEqual(unitLook(plane(ph, false), 0), { gear: true }, `am Boden (${ph})`);
  assert.deepEqual(unitLook(plane('park', true), 0), { gear: true }, 'abgestellt');
  assert.deepEqual(unitLook(plane('air', false), 0), { gear: false }, 'im Flug');
  const air = unitModel('u2', 0, unitLook(plane('air', false), 0));
  const gnd = unitModel('u2', 0, unitLook(plane('park', true), 0));
  checkSolids('u2 Flug', air.S);
  checkSolids('u2 Boden', gnd.S);
  assert.ok(gnd.S.length > air.S.length, 'am Boden Fahrwerk und Stützräder');
  const pts = (m) => m.S.flatMap((so) => so.faces.flat());
  const span = (m, f) => f(...pts(m).map((p) => Math.abs(p[1])));
  const xs = pts(air).map((p) => p[0]);
  const len = Math.max(...xs) - Math.min(...xs);
  const ratio = (2 * span(air, Math.max)) / len;
  assert.ok(ratio > 1.5 && ratio < 1.7, `Spannweite ≈ 1,6 × Länge (${ratio.toFixed(2)})`);
  const tipZ = (m) => Math.min(...pts(m).filter((p) => Math.abs(p[1]) > 30).map((p) => p[2]));
  assert.ok(tipZ(gnd) < tipZ(air) - 0.8, 'Flügelspitzen hängen am Boden tiefer als im Flug');
  assert.ok(Math.min(...pts(gnd).map((p) => p[2])) < 0.05 && Math.min(...pts(air).map((p) => p[2])) > 1, 'nur am Boden reicht das Fahrwerk bis zum Boden');
  assert.ok(air.nozzle && air.nozzle.len < 1 && air.nozzle.flame, 'schwacher Abgasschein statt Nachbrenner');
  // Malen mit einem Canvas-Ersatz: alle Iso-Richtungen, von oben, Schatten und Wrack; Bildgrenzen umfassen die ganze Spannweite
  let bad = 0;
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { if (a.some((v) => typeof v === 'number' && !Number.isFinite(v))) bad++; }), set: (t, k, v) => ((t[k] = v), true) });
  for (const m of [air, gnd]) {
    for (let k = 0; k < 16; k++) {
      const yaw = (k / 16) * Math.PI * 2;
      PAINT.paintSolids(ctx, m.S, yaw, { iso: true, s: 2 });
      assert.ok(PAINT.boundsOf(m, m.S, yaw, true).every(Number.isFinite), `Bildgrenzen Richtung ${k}`);
    }
    PAINT.paintSolids(ctx, m.S, 0, { iso: false, s: 2 });
    PAINT.paintSolids(ctx, m.S, 0, { iso: false, s: 2, shadow: true });
    PAINT.paintSolids(ctx, m.S, 0, { iso: true, s: 2, charred: true });
    const [, y0, , y1] = PAINT.boundsOf(m, m.S, 0, false);
    assert.ok(y0 <= -span(m, Math.max) && y1 >= span(m, Math.max), 'Bild von oben schneidet die Flügel nicht ab');
  }
  assert.equal(bad, 0, 'keine ungültigen Zahlen beim Malen');
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
