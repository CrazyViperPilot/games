// Fliegerhorst gemalt (airbase.js, seit v5.42): jeder Baustein zeichnet in jeder Stufe und Drehung ohne Fehler und nur mit endlichen
// Zahlen (Iso und 2D, auch ohne Canvas), Überdachung und Shelter liegen als ein Teil über dem Jet (over mit Grundriss).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { airbaseBodies, airbaseGround, drawAirbaseIso, drawAirbaseTop } from '../js/render/airbase.js';
import { bigPlan } from '../js/render/bigbuild.js';

/** Zeichenfläche, die jeden Aufruf annimmt und prüft, dass alle Zahlen endlich sind. */
function fakeCtx() {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get(target, k) {
        if (k in target) return target[k];
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
        return (...args) => {
          for (const a of args) if (typeof a === 'number') assert.ok(Number.isFinite(a), `${String(k)}(${args.join(', ')})`);
          calls.push(k);
        };
      },
      set(target, k, v) {
        if (typeof v === 'number') assert.ok(Number.isFinite(v), `${String(k)} = ${v}`);
        target[k] = v;
        return true;
      },
    },
  );
  return { ctx, calls };
}

const KINDS = ['stand', 'atc', 'ktank', 'mdepot'];

test('alle Bausteine zeichnen in jeder Stufe und Drehung (Iso und 2D)', () => {
  for (const k of KINDS) {
    for (const lv of [1, 2, 3]) {
      const parts = airbaseBodies(k, lv);
      assert.ok(parts.length > 0, `${k} ${lv}`);
      for (const p of parts) {
        for (const rot of [0, 1, 2, 3]) {
          const { ctx, calls } = fakeCtx();
          const cam = { rot, zoom: 1.3, worldToScreen: (x, y) => ({ x: x * 0.7, y: y * 0.35 }) };
          drawAirbaseIso(ctx, cam, p, '#3d7bd9');
          assert.ok(calls.length > 0, `${k} ${lv} ${p.id} Drehung ${rot}`);
        }
        const { ctx, calls } = fakeCtx();
        drawAirbaseTop(ctx, p, '#3d7bd9', 1.3);
        assert.ok(calls.length > 0, `${k} ${lv} ${p.id} 2D`);
      }
      for (const g of airbaseGround(k, lv, 64)) {
        const nums = g.t === 'poly' ? g.pts.flat() : [g.x0, g.y0, g.x1, g.y1];
        for (const n of nums) assert.ok(Number.isFinite(n), `${k} ${lv} Boden`);
      }
    }
  }
});

test('Stellplatz: Stufe 2 Überdachung und Stufe 3 Shelter als ein Teil über dem Jet, Grundriss im Stellplatz', () => {
  const ids = (lv) => airbaseBodies('stand', lv).map((p) => p.id);
  assert.ok(!ids(1).includes('canopy') && !ids(1).includes('has'));
  for (const [lv, id] of [[2, 'canopy'], [3, 'has']]) {
    const over = airbaseBodies('stand', lv).filter((p) => p.over);
    assert.deepEqual(over.map((p) => p.id), [id]);
    const p = over[0];
    for (const v of [p.x0, p.x1, p.y0, p.y1]) assert.ok(Math.abs(v) <= 64, `${id} im Stellplatz`);
    assert.ok(p.x0 < -40 && p.x1 > 40 && p.y0 < -40 && p.y1 > 40, `${id} deckt den Jet ab`);
    // bigbuild verschiebt den Grundriss mit in die Welt (Tiefenordnung nach der vordersten Ecke im Renderer)
    const q = bigPlan('stand', lv, 1000, 2000, 128).bodies.find((b) => b.over);
    assert.equal(q.x0, p.x0 + 1000);
    assert.equal(q.y1, p.y1 + 2000);
  }
});
