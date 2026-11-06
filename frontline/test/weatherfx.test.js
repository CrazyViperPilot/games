// Wetter im Bild (weatherfx.js, seit v5.47 neu gemalt): Regen, Schnee und Nebel zeichnen in jeder Stärke, auch im Übergang und nach
// langer Spielzeit, nur mit endlichen Zahlen und lesbaren Farben (ohne Canvas direkt auf die Zeichenfläche); ohne Wetter nichts; der
// Wind treibt die Flocken stetig (kein Springen, wenn die Böe wechselt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawWeather, windDrift } from '../js/render/weatherfx.js';

/** Zeichenfläche, die jeden Aufruf annimmt und prüft, dass alle Zahlen endlich und alle Farben lesbar sind. */
function fakeCtx() {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get(target, k) {
        if (k in target) return target[k];
        if (k === 'createRadialGradient' || k === 'createLinearGradient') {
          return (...args) => {
            for (const a of args) assert.ok(Number.isFinite(a), `${String(k)}(${args.join(', ')})`);
            return { addColorStop: (at, col) => assert.ok(Number.isFinite(at) && !/NaN|undefined/.test(col), `Farbstopp ${at} ${col}`) };
          };
        }
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

const cam = { x: 5200, y: 7300, zoom: 1.3 };

test('Regen, Schnee und Nebel zeichnen in jeder Stärke, im Übergang und nach langer Zeit', () => {
  for (const kind of ['rain', 'snow', 'fog']) {
    for (const mix of [0.05, 0.4, 1]) {
      for (const now of [0, 16.7, 123456.7, 9.87e6]) {
        const { ctx, calls } = fakeCtx();
        drawWeather(ctx, { on: true, kind, prev: 'clear', mix }, 915, 412, now, cam);
        assert.ok(calls.includes('fillRect'), `${kind} ${mix} ${now}: Schleier`);
        if (kind === 'rain') assert.ok(calls.includes('stroke') && calls.includes('ellipse'), 'Schnüre und Spritzer');
        if (kind === 'snow') assert.ok(calls.includes('rect') || calls.includes('drawImage'), 'Flocken');
      }
    }
  }
  // Übergang Regen → Schnee: beides im Bild; ohne Kamera geht es auch
  const { ctx, calls } = fakeCtx();
  drawWeather(ctx, { on: true, kind: 'snow', prev: 'rain', mix: 0.5 }, 1280, 800, 5000, null);
  assert.ok(calls.includes('ellipse') && calls.includes('rect'));
});

test('ohne Wetter oder bei klarem Himmel wird nichts gezeichnet', () => {
  for (const w of [null, { on: false, kind: 'rain', prev: 'clear', mix: 1 }, { on: true, kind: 'clear', prev: 'clear', mix: 1 }]) {
    const { ctx, calls } = fakeCtx();
    drawWeather(ctx, w, 900, 600, 1000, cam);
    assert.equal(calls.length, 0);
  }
});

test('Wind: Flocken treiben stetig, je Bild höchstens ein paar Pixel, im Mittel nach rechts', () => {
  let max = 0;
  for (let t = 0; t < 4000; t += 0.731) max = Math.max(max, Math.abs(windDrift(t + 1 / 60) - windDrift(t)));
  assert.ok(max < 1.2, `${max} px je Bild`);
  assert.ok(windDrift(600) - windDrift(0) > 600 * 8, 'treibt nach rechts');
});
