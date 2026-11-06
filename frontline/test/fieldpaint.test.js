// Äcker und Weiden scharf gemalt (fields.js, seit v5.44): die Pfade haben nur endliche Punkte (flach und Iso mit Gelände), jede
// Ebene wird in mindestens einer Jahreszeit gezeichnet, Ballen liegen fest im Feld und zeichnen in jeder Drehung und Jahreszeit
// (Iso und 2D, ohne Canvas direkt auf die Zeichenfläche).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap } from '../js/game/map.js';
import { reliefOf } from '../js/game/relief.js';
import { buildFields, drawFieldLayers, fieldBales } from '../js/render/fields.js';
import { drawBaleIso, drawBaleShadowIso, drawBaleTop } from '../js/render/props.js';
import { BALANCE } from '../js/data/balance.js';

/** Pfad ohne Canvas: zählt Punkte und merkt sich nicht endliche. */
class FakePath {
  constructor() {
    this.n = 0;
    this.bad = 0;
  }
  moveTo(x, y) {
    this.n++;
    if (!Number.isFinite(x) || !Number.isFinite(y)) this.bad++;
  }
  lineTo(x, y) {
    this.moveTo(x, y);
  }
  closePath() {}
}

/** Zeichenfläche, die jeden Aufruf annimmt und prüft, dass alle Zahlen endlich und alle Farben lesbar sind. */
function fakeCtx() {
  const calls = [];
  const filled = new Set();
  const ctx = new Proxy(
    {},
    {
      get(target, k) {
        if (k in target) return target[k];
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
        if (k === 'fill') return (p) => (p instanceof FakePath ? filled.add(p) : calls.push(k));
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
  return { ctx, calls, filled };
}

const SEASONS = ['summer', 'autumn', 'winter'];
const U = [0.707, 0.354, -0.707, 0.354]; // Iso-Achsen wie bei Drehung 0

const inField = (f, x, y, pad = 0) => {
  const c = Math.cos(f.angle || 0);
  const s = Math.sin(f.angle || 0);
  const lx = (x - f.x) * c + (y - f.y) * s;
  const ly = -(x - f.x) * s + (y - f.y) * c;
  return Math.abs(lx) <= f.w / 2 - pad && Math.abs(ly) <= f.h / 2 - pad;
};

function withPath(fn) {
  const old = globalThis.Path2D;
  globalThis.Path2D = FakePath;
  try {
    return fn();
  } finally {
    globalThis.Path2D = old;
  }
}

test('Pfade: flach und Iso mit Gelände nur endliche Punkte, Äcker mit Reihen, Weiden mit Zaun', () => {
  for (const seed of [1, 4242]) {
    const m = generateMap(seed);
    assert.ok(m.town.fields.length > 0);
    for (const [relief, u] of [[null, null], [reliefOf(m), U]]) {
      const chunks = withPath(() => buildFields(m, relief, u));
      const names = new Set();
      let n = 0;
      for (const c of chunks.values()) {
        for (const [k, p] of Object.entries(c.layers)) {
          names.add(k);
          n += p.n;
          assert.equal(p.bad, 0, `Seed ${seed} ${relief ? 'Iso' : 'flach'}: ${p.bad} kaputte Punkte in ${k}`);
        }
      }
      assert.ok(n > 1000, `${n} Punkte`);
      for (const k of ['rain', 'base:pasture', 'rail', 'post', 'gate', 'fenceBase']) assert.ok(names.has(k), `Ebene ${k}`);
      assert.ok([...names].some((k) => k.startsWith('row:')), 'Reihen');
      assert.ok([...names].some((k) => k.startsWith('edge:')), 'Feldränder');
    }
  }
});

test('Zeichnen: jede gebaute Ebene kommt in einer Jahreszeit dran, weit weg zeichnet nichts, weit herausgezoomt ohne Feinheiten', () => {
  const m = generateMap(4242);
  const chunks = withPath(() => buildFields(m, null, null));
  const all = new Set();
  for (const c of chunks.values()) for (const p of Object.values(c.layers)) all.add(p);
  const R = { x0: 0, y0: 0, x1: BALANCE.map.width, y1: BALANCE.map.height };
  const seen = new Set();
  for (const season of SEASONS) {
    const { ctx, filled } = fakeCtx();
    drawFieldLayers(ctx, chunks, R, season, null, 1);
    for (const p of filled) seen.add(p);
    // weit herausgezoomt: Grundflächen ja, feine Linien nicht, alles ohne Muster mit Farbe
    const far = fakeCtx();
    drawFieldLayers(far.ctx, chunks, R, season, null, 0.2);
    assert.ok(far.filled.size > 0 && far.filled.size < filled.size, `${season}: ${far.filled.size} von ${filled.size}`);
    assert.equal(typeof far.ctx.fillStyle, 'string');
  }
  assert.equal(seen.size, all.size, `${all.size - seen.size} Pfade werden nie gezeichnet`);
  const off = fakeCtx();
  drawFieldLayers(off.ctx, chunks, { x0: -9000, y0: -9000, x1: -8000, y1: -8000 }, 'summer', null, 1);
  assert.equal(off.filled.size, 0);
});

test('Ballen: fest je Feld, im Feld, nicht übereinander; Weiden Heu, Weizen Stroh nur im Herbst, andere Äcker keine', () => {
  let hay = 0;
  let straw = 0;
  for (const seed of [1, 3, 8, 4242]) {
    for (const f of generateMap(seed).town.fields) {
      const list = fieldBales(f);
      assert.equal(fieldBales(f), list, 'zwischengespeichert');
      assert.deepEqual(fieldBales({ ...f }), list, 'gleiche Lage, gleiche Ballen');
      for (const b of list) {
        assert.ok(inField(f, b.x, b.y, 4), `Ballen außerhalb des Felds bei ${b.x},${b.y}`);
        assert.ok(Number.isFinite(b.a));
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) > 26);
      if (f.kind === 'pasture') {
        assert.ok(list.length >= 1 && list.length <= 3 && list.every((b) => b.kind === 'hay' && !b.only));
        hay += list.length;
      } else if (f.crop === 'wheat') {
        assert.ok(list.length <= 5 && list.every((b) => b.kind === 'straw' && b.only === 'autumn'));
        straw += list.length;
      } else assert.equal(list.length, 0);
    }
  }
  assert.ok(hay > 0 && straw > 0, `${hay} Heu, ${straw} Stroh`);
});

test('Ballen zeichnen in 16 Richtungen, jeder Drehung und Jahreszeit (Iso und 2D)', () => {
  const camOf = (rot, zoom = 1.3) => ({ rot, zoom, worldToScreen: (x, y) => ({ x: x * 0.7, y: y * 0.35 }) });
  for (const kind of ['hay', 'straw']) {
    for (let i = 0; i < 16; i++) {
      const b = { x: 800 + i * 37, y: 1200 - i * 11, a: (i / 16) * Math.PI * 2, kind };
      for (const season of SEASONS) {
        for (const rot of [0, 1, 2, 3]) {
          const { ctx, calls } = fakeCtx();
          assert.equal(drawBaleIso(ctx, camOf(rot), b, season), true);
          assert.ok(calls.length > 10, `${kind} ${i} Drehung ${rot}: ${calls.length} Aufrufe`);
          // ohne Canvas gibt es kein Schattenbild: false, der Renderer lässt den Schatten weg
          assert.equal(drawBaleShadowIso(ctx, camOf(rot), b, 2), false);
        }
        const { ctx, calls } = fakeCtx();
        assert.equal(drawBaleTop(ctx, b, 0.9, season), true);
        assert.ok(calls.length > 5, `${kind} ${i} 2D`);
      }
    }
  }
});
