// Kleinkram der Karte gemalt (props.js und Wachturm in maptown.js, seit v5.43): geparkte Autos, Parkbänke, Versorgungskisten und
// Wachturm zeichnen in jeder Drehung, Richtung und Jahreszeit ohne Fehler, nur mit endlichen Zahlen und gültigen Farben (Iso und 2D,
// ohne Canvas direkt auf die Zeichenfläche).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  drawMapCarIso,
  drawMapCarShadowIso,
  drawMapCarTop,
  drawBenchIso,
  drawBenchShadowIso,
  drawBenchTop,
  drawCrateIso,
  drawCrateTop,
} from '../js/render/props.js';
import { drawMapIso, drawMapTop } from '../js/render/maptown.js';
import { setRoofSnow } from '../js/render/season.js';
import { BALANCE } from '../js/data/balance.js';

/** Zeichenfläche, die jeden Aufruf annimmt und prüft, dass alle Zahlen endlich und alle Farben lesbar sind. */
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
        if (typeof v === 'string') assert.ok(!/NaN|undefined|null/.test(v), `${String(k)} = ${v}`);
        target[k] = v;
        return true;
      },
    },
  );
  return { ctx, calls };
}

const camOf = (rot, zoom = 1.3) => ({ rot, zoom, worldToScreen: (x, y) => ({ x: x * 0.7, y: y * 0.35 }) });
const COLORS = ['#b8b8b0', '#8a2f2f', '#2f4f7a', '#d0c060', '#3b3b3b', '#d8d8d8', '#4f7a4f', undefined];
const SEASONS = ['summer', 'autumn', 'winter'];

test('geparkte Autos: alle Formen, Farben, Richtungen und Jahreszeiten (Iso und 2D)', () => {
  let n = 0;
  for (let i = 0; i < 48; i++) {
    const c = { x: 300 + i * 173, y: 900 + ((i * 97) % 700), vertical: i % 2 === 1, color: COLORS[i % COLORS.length] };
    for (const season of SEASONS) {
      for (const rot of [0, 1, 2, 3]) {
        const { ctx, calls } = fakeCtx();
        assert.equal(drawMapCarIso(ctx, camOf(rot), c, season), true);
        assert.ok(calls.length > 20, `Auto ${i} Drehung ${rot}: ${calls.length} Aufrufe`);
        // ohne Canvas gibt es kein Schattenbild: false, der Renderer lässt den Schatten weg
        assert.equal(drawMapCarShadowIso(ctx, camOf(rot), c, 2), false);
        n++;
      }
      const { ctx, calls } = fakeCtx();
      assert.equal(drawMapCarTop(ctx, c, 1.2, season), true);
      assert.ok(calls.length > 10, `Auto ${i} 2D`);
    }
  }
  assert.equal(n, 48 * 3 * 4);
});

test('Parkbänke: 32 Richtungen am Rundweg, alle Drehungen (Iso und 2D)', () => {
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const b = { x: 1000 + Math.cos(a) * 60, y: 1000 + Math.sin(a) * 60, a: a + Math.PI / 2, rx: Math.cos(a), ry: Math.sin(a) };
    for (const season of ['summer', 'winter']) {
      for (const rot of [0, 1, 2, 3]) {
        const { ctx, calls } = fakeCtx();
        assert.equal(drawBenchIso(ctx, camOf(rot), b, season), true);
        assert.ok(calls.length > 20, `Bank ${i} Drehung ${rot}`);
        assert.equal(drawBenchShadowIso(ctx, camOf(rot), b, 2), false);
      }
      const { ctx, calls } = fakeCtx();
      assert.equal(drawBenchTop(ctx, b, 0.8, season), true);
      assert.ok(calls.length > 10, `Bank ${i} 2D`);
    }
  }
});

test('Versorgungskisten: am Boden mit Schimmer, gelagert und auf dem Rücken eines Trägers (Iso und 2D)', () => {
  for (const [s, base, glow] of [[16, 0, 1], [13, 0, 0], [10, 24, 0], [16, 0, 0.4]]) {
    for (const rot of [0, 1, 2, 3]) {
      const { ctx, calls } = fakeCtx();
      assert.equal(drawCrateIso(ctx, camOf(rot, 1.6), 500, 700, s, base, glow), true);
      assert.ok(calls.length > 20, `Kiste ${s} Drehung ${rot}`);
      assert.equal(calls.includes('ellipse'), glow > 0, 'Schimmer nur am Boden');
    }
    const { ctx, calls } = fakeCtx();
    assert.equal(drawCrateTop(ctx, 500, 700, s, 1.1, glow), true);
    assert.ok(calls.length > 10, `Kiste ${s} 2D`);
    assert.equal(calls.includes('arc'), glow > 0, 'Schimmer nur am Boden (2D)');
  }
});

test('Wachturm: jede Seite der Karte, jede Drehung, mit und ohne Schnee, auch kleiner (Iso und 2D)', () => {
  const W = BALANCE.map.width;
  const H = BALANCE.map.height;
  const spots = [
    [W / 2, H / 2 + 600],
    [W / 2 - 600, H / 2],
    [W / 2, H / 2 - 600],
    [W / 2 + 600, H / 2],
  ];
  try {
    for (const snow of [false, true]) {
      setRoofSnow(snow);
      for (const [x, y] of spots) {
        for (const w of [80, 64]) {
          const b = { kind: 'tower', x, y, w, h: w };
          for (const rot of [0, 1, 2, 3]) {
            const { ctx, calls } = fakeCtx();
            assert.equal(drawMapIso(ctx, camOf(rot), b), true);
            assert.ok(calls.length > 200, `Turm ${x},${y} Drehung ${rot}: ${calls.length} Aufrufe`);
          }
          const { ctx, calls } = fakeCtx();
          assert.equal(drawMapTop(ctx, b, 1.2), true);
          assert.ok(calls.length > 50, `Turm ${x},${y} 2D`);
        }
      }
    }
  } finally {
    setRoofSnow(false);
  }
});
