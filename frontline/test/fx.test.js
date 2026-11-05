// Effekte, Rauch, Feuer, Krater und Trümmer (fx.js, seit v5.34): jede Art zeichnet über die ganze Lebensdauer ohne Fehler und
// nur mit endlichen Zahlen, auch ohne Canvas (Node: weiche Flecken als einfache Kreise), Narben sind je id gleich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawEffect, drawEffectUp, drawShell, drawShellIso, drawSmoke, drawFire, drawCrater, drawWreck, drawWreckRubble, drawMine, scarRng } from '../js/render/fx.js';

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

const cam = { zoom: 1.3, worldToScreen: (x, y) => ({ x: x * 0.7, y: y * 0.35 }) };
const LIFE = { tracer: 0.12, shell: 0.3, explosion: 0.5, intercept: 0.4, muzzle: 0.1, death: 0.1 };

test('alle Effektarten zeichnen über die ganze Lebensdauer (2D, Iso-Boden, Iso aufrecht)', () => {
  const kinds = [
    ['tracer', 'base'], ['tracer', 'flak'], ['tracer', 'twin35'], ['shell', 'cannon'], ['shell', 'rpg'], ['shell', 'aim'],
    ['explosion', 'hit'], ['explosion', 'building'], ['explosion', null], ['intercept', null], ['muzzle', 'mortar'], ['muzzle', null], ['death', 'inf'],
  ];
  for (const [type, snd] of kinds) {
    for (const k of [0, 0.1, 0.35, 0.7, 1]) {
      const e = { type, snd, x: 100, y: 80, x2: type === 'muzzle' && snd === 'mortar' ? 100 : 240, y2: 30, team: 0, t: k * LIFE[type], life: LIFE[type] };
      const { ctx, calls } = fakeCtx();
      drawEffect(ctx, e, 1.2);
      drawEffect(ctx, e, 0.5, true);
      drawEffectUp(ctx, e, cam);
      if (type !== 'death' && k < 1) assert.ok(calls.length > 0, `${type} ${snd} bei ${k} zeichnet nichts`);
    }
  }
});

test('Mörsergranate, Rauch, Feuer und Mine zeichnen mit endlichen Zahlen', () => {
  for (const f of [0, 0.02, 0.5, 1]) {
    const s = { sx: 0, sy: 0, tx: 300, ty: 120, x: 300 * f, y: 120 * f, t: f * 2, duration: 2 };
    drawShell(fakeCtx().ctx, s, 0.6);
    drawShellIso(fakeCtx().ctx, cam, s);
    drawShell(fakeCtx().ctx, { ...s, duration: 0 }, 1); // Granate ohne Flugzeit (sofortiger Einschlag)
  }
  for (const k of [0, 0.5, 1]) for (const t of [0, 3.7, 1000]) {
    drawSmoke(fakeCtx().ctx, 10, 10, 8, k, t, 12345);
    drawFire(fakeCtx().ctx, 10, 10, 6, t, -77);
  }
  drawMine(fakeCtx().ctx, 5, 5, 0.6);
});

test('Krater, Brandflecken, Wracks und Trümmer zeichnen und sehen je id gleich aus', () => {
  for (const r of [8, 22, 40, 90]) {
    const a = fakeCtx();
    const b = fakeCtx();
    drawCrater(a.ctx, { id: 7, x: 50, y: 50, r }, 0.8);
    drawCrater(b.ctx, { id: 7, x: 50, y: 50, r }, 0.8);
    assert.deepEqual(a.calls, b.calls);
  }
  for (const type of ['tank', 'ifv', 'truck', 'engineer', 'gunship', 'transporter']) drawWreck(fakeCtx().ctx, { id: 3, type, x: 0, y: 0, angle: 1, air: type === 'gunship' || type === 'transporter' }, 1, 0.7);
  for (const [w, h, small] of [[64, 64, false], [192, 128, false], [32, 32, true], [16, 96, true]]) drawWreckRubble(fakeCtx().ctx, { id: 9, x: 100, y: 100, w, h, small }, 0.9);
  const r1 = scarRng(42);
  const r2 = scarRng(42);
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2());
});
