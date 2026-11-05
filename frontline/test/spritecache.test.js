// Bildspeicher (spritecache.js): Was im laufenden oder im vorigen Bild gebraucht wurde, fällt beim Aufräumen nicht heraus (seit
// v5.29). Sonst würde eine sehr volle Ansicht (größter Zoom auf dem Handy, Wald neben der Kartenstadt) Bild für Bild einen Teil des
// Sichtbaren wegwerfen und neu malen. Alte Bilder fallen weiter heraus. Ein Schein-Canvas ersetzt das echte (Node hat keins).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ translate() {} }) }) };
const { sprite, spriteFrame, spriteStats } = await import('../js/render/spritecache.js');

const BIG = [0, 0, 1000, 1000]; // ≈ 1 Mio. Bildpunkte je Bild bei Maßstab 1, die Obergrenze liegt bei 10 Mio.
let painted = 0;
const paint = () => {
  painted++;
};
const draw = (keys) => {
  spriteFrame(1);
  for (const k of keys) assert.ok(sprite(k, 1, BIG, paint), `${k} fehlt`);
};
const keys = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i}`);

test('volle Ansicht: das Sichtbare bleibt, nur Neues wird gemalt', () => {
  const view = keys('a', 30); // 30 Mio. Bildpunkte, dreimal mehr als die Obergrenze
  draw(view);
  assert.equal(painted, 30);
  for (let f = 0; f < 3; f++) draw([`neu${f}`, ...view]); // je Bild ein neues Bild davor (löst das Aufräumen aus)
  assert.equal(painted, 33);
});

test('was zwei Bilder lang nicht gebraucht wurde, fällt beim Aufräumen heraus', () => {
  const before = spriteStats().sprites;
  const view = keys('b', 12);
  draw(view);
  draw(view); // die Bilder aus dem ersten Test sind jetzt zwei Bilder alt
  draw(['nochneu', ...view]);
  const after = spriteStats();
  assert.ok(before > 30);
  assert.equal(after.sprites, 13);
  assert.ok(after.pixels > 10e6); // die Grenze ist weich: das Sichtbare bleibt ganz
});
