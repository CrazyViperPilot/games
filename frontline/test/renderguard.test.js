// Einfrieren im Spiel (v5.105 gemeldet): eine gegnerische Granate im Sichtfeld ließ game.sees werfen (Granaten haben kein def), und die
// Ausnahme im Zeichenschritt hielt die Bildschleife für immer an. Beides ist abgesichert.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createShell } from '../js/game/entities.js';
import { createLoop } from '../js/core/loop.js';

test('sees: gegnerische Granate im Sichtfeld wirft nicht', () => {
  const g = new Game({ seed: 3 });
  const own = g.units.find((u) => u.team === 0);
  g.fog[0].visible.fill(1);
  const p = createShell(g.newId(), 1, own.x, own.y, own.x + 50, own.y, { shellSpeed: 300, damage: {}, splash: 30 });
  assert.doesNotThrow(() => g.sees(0, p));
  assert.equal(g.sees(0, p), true);
});

test('Bildschleife: ein Fehler beim Zeichnen oder im Spielschritt hält sie nicht an, die Meldung kommt einmal', () => {
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => (frames.push(fn), frames.length);
  globalThis.cancelAnimationFrame = () => {};
  const errs = [];
  const orig = console.error;
  console.error = (e) => errs.push(e);
  try {
    let renders = 0;
    let updates = 0;
    const loop = createLoop({
      update: () => {
        updates++;
        throw new Error('Spielschritt kaputt');
      },
      render: () => {
        renders++;
        throw new Error('Zeichnen kaputt');
      },
    });
    loop.start();
    for (let k = 0; k < 5; k++) frames[frames.length - 1](k * 100);
    assert.equal(renders, 5, 'jedes Bild wird weiter gezeichnet');
    assert.ok(updates > 0, 'Spielschritte laufen weiter');
    assert.equal(frames.length, 6, 'nach jedem Bild ist das nächste angefordert');
    assert.equal(errs.length, 2, 'jede Fehlermeldung nur einmal');
    loop.stop();
  } finally {
    console.error = orig;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  }
});

test('lineCells: ungültige Koordinaten liefern keine Zellen statt einer Endlosschleife, Bruchzahlen werden gerundet', async () => {
  const { lineCells } = await import('../js/game/grid.js');
  assert.deepEqual(lineCells(0, 0, NaN, 3), []);
  assert.deepEqual(lineCells(0, 0, Infinity, 3), []);
  assert.deepEqual(lineCells(0, 0, 2.4, 0.6), lineCells(0, 0, 2, 1), 'gerundet wie ganze Zahlen');
  assert.deepEqual(lineCells(0, 0, 3, 0), [[0, 0], [1, 0], [2, 0], [3, 0]]);
});

test('Mauerbefehl mit fehlender Koordinate: Ablehnung statt Einfrieren', () => {
  const g = new Game({ seed: 3 });
  const eng = g.units.find((u) => u.team === 0 && u.def.builder === 'all');
  const r = g.issue(0, { type: 'buildWall', ids: [eng.id], x1: eng.x, y1: eng.y, x2: undefined, y2: eng.y });
  assert.equal(r.ok, false);
});
