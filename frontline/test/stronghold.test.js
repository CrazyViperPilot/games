// Besetzte Häuser gemalt (stronghold.js, seit v5.48): Ausbauten (Sandsäcke, MG-Nest, Stacheldraht) zeichnen in jeder Kombination,
// Größe, Drehung und Jahreszeit nur mit endlichen Zahlen und lesbaren Farben (Iso hinter und vor dem Haus, 2D), die Fahne flattert ohne
// kaputte Werte; der Renderer zeigt ein Haus nur, wenn man es sehen darf (eigenes, erkannte Besatzung, erkundetes leeres mit Ausbau).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worksMask, drawHouseWorksIso, drawHouseWorksTop, drawHouseFlagIso, drawHouseFlagTop } from '../js/render/stronghold.js';
import { setRoofSnow } from '../js/render/season.js';
import { Renderer } from '../js/render/renderer.js';

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

const cam = (rot = 0, zoom = 1.4) => ({ rot, zoom, worldToScreen: (x, y) => ({ x: (x - y) * 0.7, y: (x + y) * 0.35 }) });
const WORKS = [{}, { sandbags: true }, { mgnest: true }, { sandbags: true, mgnest: true }, { wire: true }, { sandbags: true, wire: true }, { mgnest: true, wire: true }, { sandbags: true, mgnest: true, wire: true }];
const house = (works, pw = 92, ph = 68, type = 'house') => ({ id: -7, type, x: 5400, y: 5800, pw, ph, works, occupants: [], team: -1 });

test('Ausbauten als Bitmaske', () => {
  WORKS.forEach((w, n) => assert.equal(worksMask({ works: w }), n));
  assert.equal(worksMask(null), 0);
  assert.equal(worksMask({}), 0);
});

test('Iso: jede Kombination, Größe, Drehung und Jahreszeit; hinter dem Haus nur Draht, ohne Ausbau nichts', () => {
  for (const [pw, ph, type] of [[92, 68, 'house'], [48, 44, 'house'], [150, 110, 'factory'], [120, 70, 'station']]) {
    for (const [n, w] of WORKS.entries()) {
      for (const snow of [false, true]) {
        setRoofSnow(snow);
        for (let rot = 0; rot < 4; rot++) {
          const h = house(w, pw, ph, type);
          const front = fakeCtx();
          assert.equal(drawHouseWorksIso(front.ctx, cam(rot), h, 'front'), n > 0, `vorn ${n}`);
          if (n) assert.ok(front.calls.length > 20, `vorn ${n}: ${front.calls.length} Aufrufe`);
          const back = fakeCtx();
          assert.equal(drawHouseWorksIso(back.ctx, cam(rot), h, 'back'), (n & 4) > 0, `hinten ${n}`);
          if (!(n & 4)) assert.equal(back.calls.length, 0);
        }
      }
    }
  }
  setRoofSnow(false);
});

test('2D: jede Kombination; Fahne in Iso und 2D zu jeder Zeit', () => {
  for (const [n, w] of WORKS.entries()) {
    const { ctx, calls } = fakeCtx();
    assert.equal(drawHouseWorksTop(ctx, house(w), 1.3), n > 0);
    if (n) assert.ok(calls.length > 10, `${n}: ${calls.length} Aufrufe`);
  }
  for (const t of [0, 1.7, 12345.6]) {
    for (const type of ['house', 'hall', 'factory', 'station']) {
      for (let rot = 0; rot < 4; rot++) {
        const { ctx, calls } = fakeCtx();
        assert.equal(drawHouseFlagIso(ctx, cam(rot), house({}, 90, 70, type), '#3b82f6', t), true);
        assert.ok(calls.length > 8);
      }
    }
    const { ctx, calls } = fakeCtx();
    assert.equal(drawHouseFlagTop(ctx, house({}), '#e0553a', t), true);
    assert.ok(calls.length > 5);
  }
});

test('Renderer zeigt besetzte und ausgebaute Häuser nur, wenn man sie sehen darf', () => {
  let seen = false;
  const ren = { team: 0, revealAll: false, game: { sees: () => seen } };
  const shown = (h, known = () => true) => Renderer.prototype.fortShown.call(ren, h, known);
  const own = { ...house({}), team: 0, occupants: [{}] };
  const foe = { ...house({ wire: true }), team: 1, occupants: [{}] };
  const empty = house({ sandbags: true });
  assert.equal(shown(own), true, 'eigenes besetztes Haus');
  assert.equal(shown(foe), false, 'fremde Besatzung nicht erkannt');
  seen = true;
  assert.equal(shown(foe), true, 'fremde Besatzung erkannt');
  assert.equal(shown(empty), true, 'leeres Haus mit Ausbau, erkundet');
  assert.equal(shown(empty, () => false), false, 'leeres Haus mit Ausbau, unerkundet');
  assert.equal(shown(house({})), false, 'leeres Haus ohne Ausbau');
  ren.revealAll = true;
  seen = false;
  assert.equal(shown(foe), true, 'alles aufgedeckt');
});
