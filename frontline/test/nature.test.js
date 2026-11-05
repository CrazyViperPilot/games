// Gemalte Natur (seit v5.28): Felsen- und Tiermodelle sind gültig (endliche Punkte, Flächen mit mindestens drei Ecken), die
// Waldarten liefern nur bekannte Baumarten, und ohne Canvas (Node) melden die Zeichenfunktionen false (der Renderer zeichnet dann
// den einfachen Ersatz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  natureModels,
  forestKind,
  forestSpecies,
  SPECIES,
  drawTreeIso,
  drawTreeTop,
  drawBushIso,
  drawBushTop,
  drawRockIso,
  drawRockTop,
  drawAnimalIso,
  drawAnimalTopP,
  depositSprite,
} from '../js/render/nature.js';

test('Felsen und Tiere: alle Modelle gültig', () => {
  const all = natureModels();
  assert.ok(all.length > 20);
  for (const { name, m } of all) {
    assert.ok(m.S.length > 0, `${name}: keine Körper`);
    for (const so of m.S) {
      assert.match(so.col, /^#[0-9a-f]{6}$/i, `${name}: Farbe ${so.col}`);
      assert.ok(so.c.every(Number.isFinite), `${name}: Mitte`);
      for (const f of so.faces) {
        assert.ok(f.length >= 3, `${name}: Fläche mit ${f.length} Ecken`);
        for (const p of f) assert.ok(p.length === 3 && p.every(Number.isFinite), `${name}: Punkt ${p}`);
      }
    }
  }
});

test('Waldarten liefern nur bekannte Baumarten', () => {
  const kinds = new Set();
  for (let i = 0; i < 40; i++) kinds.add(forestKind({ x: i * 137, y: i * 91, r: 60 + i }));
  assert.deepEqual([...kinds].sort(), ['laub', 'misch', 'nadel']);
  for (const k of kinds) for (let u = 0; u < 1; u += 0.05) assert.ok(SPECIES.includes(forestSpecies(k, u)), `${k} ${u}`);
});

test('ohne Canvas zeichnen die Funktionen nichts und melden false', () => {
  const cam = { zoom: 1, rot: 0, worldToScreen: (x, y) => ({ x, y }) };
  const t = { x: 10, y: 20, r: 16, sp: 'spruce' };
  for (const season of ['summer', 'autumn', 'winter']) {
    assert.equal(drawTreeIso({}, cam, t, season), false);
    assert.equal(drawTreeTop({}, { x: 5, y: 7, r: 14 }, season, 1), false);
    assert.equal(drawBushIso({}, cam, { x: 1, y: 2, r: 9, k: 'fern' }, season), false);
    assert.equal(drawBushTop({}, { x: 1, y: 2, r: 9 }, season, 1), false);
    assert.equal(drawRockIso({}, cam, { x: 3, y: 4, r: 15 }, season), false);
    assert.equal(drawRockTop({}, { x: 3, y: 4, r: 15 }, season, 1), false);
    for (const type of ['wood', 'stone', 'ore', 'oil']) assert.equal(depositSprite(type, 1, season, 2), null);
  }
  const a = { id: 3, kind: 'deer', x: 0, y: 0, angle: 1, speed: 30, step: 12, state: 'walk' };
  assert.equal(drawAnimalIso({}, cam, a, { x: 0, y: 0 }, 0), false);
  assert.equal(drawAnimalTopP({}, { ...a, kind: 'boar' }, 1, 0), false);
});
