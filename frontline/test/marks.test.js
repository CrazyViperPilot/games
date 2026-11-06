// Anzeigen auf der Karte gemalt (marks.js, seit v5.50): jede Markierung zeichnet in 2D und Iso, gewählt und überfahren, bei jedem Zoom
// nur mit endlichen Zahlen und lesbaren Farben. Ohne Canvas (Node) malt marks.js direkt, darum sieht der Fake-Canvas jeden Strich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawSelectMark, drawDragFrame, drawGauge, drawCargoGauge, drawStarMark, drawCareMark, drawNoAmmoMark, drawMoveRing, drawSlotMark, strokeTrail, drawArrowHead, drawFootRing, drawRallyFlag } from '../js/render/marks.js';
import { drawBar, drawStar } from '../js/render/sprites.js';

/** Zeichenfläche, die jeden Aufruf annimmt und prüft, dass alle Zahlen endlich und alle Farben lesbar sind. */
function fakeCtx() {
  const calls = [];
  const colors = [];
  const ctx = new Proxy(
    {},
    {
      get(target, k) {
        if (k in target) return target[k];
        if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') return () => assert.fail(`${k}: keine Verläufe je Markierung`);
        if (k === 'measureText') return (t) => ({ width: String(t).length * 6 });
        return (...args) => {
          for (const a of args) if (typeof a === 'number') assert.ok(Number.isFinite(a), `${String(k)}(${args.join(', ')})`);
          calls.push(k);
        };
      },
      set(target, k, v) {
        if (typeof v === 'number') assert.ok(Number.isFinite(v), `${String(k)} = ${v}`);
        if (typeof v === 'string') assert.ok(!/NaN|undefined|null|Infinity/.test(v), `${String(k)} = ${v}`);
        if (k === 'shadowBlur') assert.equal(v, 0, 'keine Schatten-Unschärfe');
        if ((k === 'fillStyle' || k === 'strokeStyle') && typeof v === 'string') colors.push(v);
        target[k] = v;
        return true;
      },
    },
  );
  return { ctx, calls, colors };
}

const ZOOMS = [0.25, 0.6, 1, 1.6];
const unit = (radius) => ({ kind: 'unit', x: 5000, y: 4000, def: { radius } });

test('Auswahlring und Hover: Einheiten, Kisten, Gebäude, Häuser in 2D und Iso bei jedem Zoom', () => {
  const things = [unit(7), unit(16), unit(30), { kind: 'crate', x: 10, y: 20 }, { kind: 'building', x: 800, y: 900, w: 2, h: 2 }, { kind: 'building', x: 800, y: 900, w: 5, h: 5 }, { kind: 'house', x: 300, y: 200, pw: 92, ph: 68 }];
  for (const e of things) {
    for (const z of ZOOMS) {
      for (const iso of [false, true]) {
        for (const hover of [false, true]) {
          const f = fakeCtx();
          drawSelectMark(f.ctx, e, z, hover, iso, z * 2.625);
          assert.ok(f.calls.includes('stroke') || f.calls.includes('strokeRect'), `${e.kind} z=${z}`);
          // dunkler Saum und heller Kern: lesbar auf Schnee und auf dunklem Gras
          assert.ok(f.colors.some((c) => /rgba\(8,12,10/.test(c)), 'Saum');
          assert.ok(f.colors.some((c) => /#f4f7f2|244,247,242/.test(c)), 'heller Kern');
        }
      }
    }
  }
});

test('Auswahlrahmen beim Aufziehen: jede Richtung, auch winzig und leer', () => {
  for (const d of [{ x1: 10, y1: 10, x2: 300, y2: 200 }, { x1: 300, y1: 200, x2: 10, y2: 10 }, { x1: 5, y1: 5, x2: 7, y2: 6 }, { x1: 5, y1: 5, x2: 5, y2: 5 }]) {
    const f = fakeCtx();
    drawDragFrame(f.ctx, d);
    if (d.x1 !== d.x2) assert.ok(f.calls.includes('strokeRect'));
  }
});

test('Balken über den Einheiten: Leben mit Vierteln, Munition, Treibstoff, Ladung; jeder Anteil, auch kaputte Werte', () => {
  for (const z of ZOOMS) {
    for (const frac of [0, 0.25, 0.5, 1, -1, 7, NaN]) {
      const f = fakeCtx();
      drawGauge(f.ctx, 100, 50, 24, 4 / z, frac, '#6fd16a', 1 / z, true);
      assert.ok(f.calls.filter((k) => k === 'fillRect').length >= 2, 'Platte und Füllung bzw. leerer Teil');
      assert.ok(f.colors.some((c) => /rgba\(10,12,10/.test(c)), 'dunkle Platte');
      const g = fakeCtx();
      drawBar(g.ctx, 0, 0, 24, 3 / z, frac, '#7f93ad', 1 / z);
      drawCargoGauge(g.ctx, 0, 0, 24, 3 / z, [[frac, '#a0703f'], [0.4, '#d9b600'], [0.9, '#9b7bc4']], 1 / z);
    }
  }
});

test('Stern, Heilkreuz und Warnzeichen: jede Größe und jeder Zoom endlich und lesbar', () => {
  for (const z of ZOOMS) {
    for (const draw of [(c) => drawStarMark(c, 10, 20, 8 / z, z), (c) => drawStar(c, 10, 20, 8 / z, z), (c) => drawCareMark(c, 10, 20, z), (c) => drawNoAmmoMark(c, 10, 20, z)]) {
      const f = fakeCtx();
      draw(f.ctx);
      assert.ok(f.calls.includes('fill'), 'gefüllt');
      assert.ok(f.colors.some((c) => /rgba\((8,12,10|30,20,0)/.test(c)), 'dunkler Saum');
    }
  }
});

test('Befehle: Wegziel über die ganze Lebensdauer, Formationspunkte, Linien mit Saum, Pfeil, Sammelpunkt-Fahne', () => {
  for (const z of ZOOMS) {
    for (const iso of [false, true]) {
      for (const k of [0, 0.3, 0.99, 1, 1.5]) {
        const f = fakeCtx();
        drawMoveRing(f.ctx, 100, 200, k, z, iso);
        if (k < 1) assert.ok(f.calls.includes('stroke'), `Ring k=${k}`);
        else assert.equal(f.calls.length, 0, 'verblasst: nichts');
      }
    }
    for (const a of [0.9, 0.2, 0, -1]) {
      const f = fakeCtx();
      drawSlotMark(f.ctx, 10, 10, z, a);
      if (a > 0) assert.ok(f.calls.includes('fill'));
    }
    const f = fakeCtx();
    f.ctx.beginPath();
    f.ctx.moveTo(0, 0);
    f.ctx.lineTo(300, 100);
    strokeTrail(f.ctx, 'rgba(222,182,52,0.95)', 2 / z, [10 / z, 7 / z]);
    drawArrowHead(f.ctx, 300, 100, 0.3, 6.5 / z, 'rgba(222,182,52,0.95)', 1 / z);
    drawFootRing(f.ctx, 300, 100, 5 / z, '#ffd65a', 1 / z);
    drawRallyFlag(f.ctx, 300, 100, 1 / z);
    drawRallyFlag(f.ctx, 300, 100, 1);
    assert.ok(f.calls.filter((c) => c === 'stroke').length >= 6);
    assert.ok(f.colors.some((c) => /rgba\(8,12,10/.test(c)), 'Saum');
  }
});
