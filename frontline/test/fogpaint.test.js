// Kriegsnebel gemalt (seit v5.49): Weichzeichner (1-2-1) hält gleichmäßige Flächen und trennt die Kanäle; die Nebelschicht (Minimap,
// ohne WebGL) ist frei in Sicht, abgedunkelt über Erkundetem, dunkel mit Wolken über Unerforschtem (Minimap ohne Wolken); der WebGL-Nebel
// bekommt je Zelle Sicht und Erkundet als zwei weichgezeichnete Bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blur121, fogTone, updateFogLayer, Renderer } from '../js/render/renderer.js';

const COLS = 40;
const ROWS = 30;

/** Nebel wie js/game/fog.js: in Sicht ein Kreis um (cx, cy), erkundet ein größerer. */
function fogOf(seeR, knownR, cx = 12, cy = 14) {
  const n = COLS * ROWS;
  const fog = { cols: COLS, rows: ROWS, visible: new Uint8Array(n), explored: new Uint8Array(n) };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const d = Math.hypot(c - cx, r - cy);
      fog.visible[r * COLS + c] = d <= seeR ? 1 : 0;
      fog.explored[r * COLS + c] = d <= knownR ? 1 : 0;
    }
  }
  return fog;
}

const layerOf = (clouds = true) => ({ image: { data: new Uint8ClampedArray(COLS * ROWS * 4) }, ctx: { putImageData() {} }, clouds });
const px = (layer, c, r) => Array.from(layer.image.data.subarray((r * COLS + c) * 4, (r * COLS + c) * 4 + 4));

test('Weichzeichner: gleichmäßige Flächen bleiben, Kanäle mischen sich nicht, Kanten werden stetig', () => {
  for (const v of [0, 150, 255]) {
    const a = new Uint8Array(COLS * ROWS).fill(v);
    blur121(a, new Uint8Array(a.length), COLS, ROWS, 1);
    assert.ok(a.every((x) => x === v), `Fläche ${v}`);
  }
  const two = new Uint8Array(COLS * ROWS * 2);
  for (let i = 0; i < COLS * ROWS; i++) two[2 * i] = 255;
  blur121(two, new Uint8Array(two.length), COLS, ROWS, 2);
  for (let i = 0; i < COLS * ROWS; i++) assert.ok(two[2 * i] === 255 && two[2 * i + 1] === 0, `Zelle ${i}`);
  // senkrechte Kante: links 255, rechts 0 → fällt stetig, weit weg unverändert
  const e = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < 20; c++) e[r * COLS + c] = 255;
  blur121(e, new Uint8Array(e.length), COLS, ROWS, 1);
  const row = Array.from(e.subarray(5 * COLS, 6 * COLS));
  for (let c = 1; c < COLS; c++) assert.ok(row[c] <= row[c - 1], `fällt bei ${c}: ${row.join(',')}`);
  assert.equal(row[17], 255);
  assert.equal(row[22], 0);
  assert.ok(row[19] > 128 && row[19] < 255 && row[20] > 0 && row[20] < 128, row.slice(17, 23).join(','));
});

test('Wolkentöne: fest, Stufen 0 … 15, nicht gleichförmig', () => {
  const t = fogTone(COLS, ROWS);
  assert.deepEqual(t, fogTone(COLS, ROWS));
  assert.ok(t.every((x) => Number.isInteger(x) && x >= 0 && x <= 15));
  assert.ok(Math.max(...t) - Math.min(...t) >= 5, 'Wolken sichtbar');
});

test('Nebelschicht: frei in Sicht, abgedunkelt über Erkundetem, dunkel mit Wolken über Unerforschtem', () => {
  const fog = fogOf(5, 11);
  const layer = layerOf();
  updateFogLayer(layer, fog, false);
  assert.equal(px(layer, 12, 14)[3], 0, 'Mitte in Sicht');
  const known = px(layer, 12, 14 - 8);
  assert.equal(known[3], 150, 'erkundet');
  assert.ok(known[2] > known[0], `kühl: ${known}`);
  const dark = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 30; c < COLS; c++) {
      const p = px(layer, c, r);
      assert.equal(p[3], 255, `unerforscht ${c},${r}`);
      assert.ok(p[0] < 40 && p[1] < 40 && p[2] < 45, `dunkel: ${p}`);
      dark.push(p[0]);
    }
  }
  assert.ok(Math.max(...dark) - Math.min(...dark) >= 4, 'Wolken');
  // Rand weich: zwischen Sicht und Erkundet liegen Zwischenstufen
  const edge = [];
  for (let c = 12; c < 30; c++) edge.push(px(layer, c, 14)[3]);
  assert.ok(edge.some((a) => a > 0 && a < 150), `weich: ${edge}`);
  for (let i = 1; i < edge.length; i++) assert.ok(edge[i] >= edge[i - 1], `steigt: ${edge}`);
  // alles aufgedeckt
  updateFogLayer(layer, fog, true);
  for (let i = 3; i < layer.image.data.length; i += 4) assert.equal(layer.image.data[i], 0);
  // Minimap: ohne Wolken gleichmäßig dunkel
  const plain = layerOf(false);
  updateFogLayer(plain, fogOf(0, 0, -50, -50), false);
  const first = px(plain, 0, 0);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) assert.deepEqual(px(plain, c, r), first);
  assert.ok(first[3] === 255 && first[0] < 20);
});

test('WebGL-Nebel: je Zelle Sicht und Erkundet als zwei weichgezeichnete Bytes', () => {
  const fog = fogOf(5, 11);
  const ren = {};
  const out = Renderer.prototype.fogData.call(ren, fog);
  assert.equal(out.cols, COLS);
  assert.equal(out.rows, ROWS);
  assert.equal(out.data.length, COLS * ROWS * 2);
  const at = (c, r) => [out.data[(r * COLS + c) * 2], out.data[(r * COLS + c) * 2 + 1]];
  assert.deepEqual(at(12, 14), [255, 255], 'in Sicht');
  assert.deepEqual(at(12, 6), [0, 255], 'erkundet');
  assert.deepEqual(at(35, 14), [0, 0], 'unerforscht');
  const [v, k] = at(17, 14); // Sichtrand
  assert.ok(v > 0 && v < 255 && k === 255, `${v}, ${k}`);
  // wiederholt: gleiche Puffer, gleiches Ergebnis
  const again = Renderer.prototype.fogData.call(ren, fog);
  assert.equal(again.data, out.data);
  assert.deepEqual(at(17, 14), [v, k]);
});

test('Nebel wird nur neu gerechnet, wenn er sich geändert hat (fog.version)', () => {
  const fog = { ...fogOf(5, 11), version: 1 };
  const ren = {};
  const a = Renderer.prototype.fogData.call(ren, fog);
  const stamp = a.stamp;
  fog.visible.fill(0); // ohne neue Version: bleibt
  assert.equal(Renderer.prototype.fogData.call(ren, fog).stamp, stamp);
  assert.equal(a.data[(14 * COLS + 12) * 2], 255);
  fog.version++;
  const b = Renderer.prototype.fogData.call(ren, fog);
  assert.ok(b.stamp > stamp);
  assert.equal(b.data[(14 * COLS + 12) * 2], 0);
  // Nebelschicht genauso, Aufdecken zählt mit
  const layer = layerOf();
  let puts = 0;
  layer.ctx.putImageData = () => puts++;
  updateFogLayer(layer, fog, false);
  updateFogLayer(layer, fog, false);
  assert.equal(puts, 1);
  updateFogLayer(layer, fog, true);
  fog.version++;
  updateFogLayer(layer, fog, true);
  assert.equal(puts, 3);
});
