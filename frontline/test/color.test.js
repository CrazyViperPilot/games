// Farb- und Rechenhilfen der Darstellung (js/render/color.js, Review Q-05, seit v5.64): eine Quelle für alle Malmodule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rgbOf, hexOf, mix, clamp, hashXY } from '../js/render/color.js';

const RENDER = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'js', 'render');

test('hashXY: fester Streuwert wie die früheren Kopien (Bilder bleiben gleich)', () => {
  const old = (x, y) => (Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(y) | 0, 19349663)) >>> 0;
  for (const [x, y] of [[0, 0], [12.4, 99.6], [-37, 5], [8191, 10240], [1e6, -3.5]]) assert.equal(hashXY(x, y), old(x, y));
  assert.equal(hashXY(17), old(17, 0), 'y fehlt = 0');
  assert.ok(Number.isInteger(hashXY(5, 9)) && hashXY(5, 9) >= 0);
});

test('clamp, rgbOf, hexOf, mix', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.deepEqual(rgbOf('#b58248'), [181, 130, 72]);
  assert.deepEqual(rgbOf('rgb(1,2,3)'), [1, 2, 3]);
  assert.equal(hexOf([300, -4, 15.6]), '#ff0010');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
});

test('keine eigenen Kopien von clamp und hashXY mehr in js/render', () => {
  for (const f of readdirSync(RENDER)) {
    if (!f.endsWith('.js') || f === 'color.js') continue;
    const src = readFileSync(join(RENDER, f), 'utf8');
    assert.ok(!/const clamp = \(v, lo, hi\)/.test(src), `${f}: eigene clamp-Kopie`);
    assert.ok(!/Math\.imul\([^)]*73856093\) \^ Math\.imul\([^)]*19349663\)\) >>> 0/.test(src), `${f}: ausgeschriebener hashXY`);
  }
});
