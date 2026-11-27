// Tests für Datumslogik und Inhalte: node adventskalender/test/logic.test.js
'use strict';
const assert = require('assert');
const L = require('../logic.js');
const KINDER = require('../content.js');
const ART = require('../art.js');

const d = (j, m, t) => new Date(j, m - 1, t, 9);
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };

test('vor Dezember ist nichts offen', () => {
  assert.strictEqual(L.offenBis(d(2026, 11, 27)), 0);
  assert.strictEqual(L.offenBis(d(2026, 11, 30)), 0);
});
test('im Dezember bis heute offen', () => {
  assert.strictEqual(L.offenBis(d(2026, 12, 1)), 1);
  assert.strictEqual(L.offenBis(d(2026, 12, 13)), 13);
  assert.strictEqual(L.offenBis(d(2026, 12, 24)), 24);
  assert.strictEqual(L.offenBis(d(2026, 12, 31)), 24);
});
test('im Januar alles offen, danach wieder zu', () => {
  assert.strictEqual(L.offenBis(d(2027, 1, 5)), 24);
  assert.strictEqual(L.offenBis(d(2027, 2, 1)), 0);
});
test('Saisonjahr: Januar gehört zum Vorjahr', () => {
  assert.strictEqual(L.saisonJahr(d(2026, 12, 3)), 2026);
  assert.strictEqual(L.saisonJahr(d(2027, 1, 3)), 2026);
});
test('Tage bis zum Türchen', () => {
  assert.strictEqual(L.tageBis(1, d(2026, 11, 27)), 4);
  assert.strictEqual(L.tageBis(1, d(2026, 11, 30)), 1);
  assert.strictEqual(L.tageBis(5, d(2026, 12, 3)), 2);
  assert.strictEqual(L.tageBis(3, d(2026, 12, 3)), 0);
  assert.strictEqual(L.tageBis(24, d(2026, 3, 1)) > 250, true);
});
test('Reihenfolge enthält jedes Türchen genau einmal und ist je Kind fest', () => {
  for (const k of Object.keys(KINDER)) {
    const r = L.reihenfolge(k);
    assert.deepStrictEqual([...r].sort((a, b) => a - b), Array.from({ length: 24 }, (_, i) => i + 1));
    assert.deepStrictEqual(r, L.reihenfolge(k));
  }
  assert.notDeepStrictEqual(L.reihenfolge('kira'), L.reihenfolge('lea'));
});
test('Datum aus der Adresse', () => {
  const x = L.datumAusAdresse('?heute=2026-12-10', new Date());
  assert.strictEqual(x.getMonth(), 11); assert.strictEqual(x.getDate(), 10);
  const jetzt = new Date();
  assert.strictEqual(L.datumAusAdresse('', jetzt), jetzt);
});
test('Inhalte: 24 vollständige Türchen je Kind mit vorhandenem Bild', () => {
  const pflicht = { spruch: ['text'], finale: ['text'], witz: ['frage', 'pointe'], raetsel: ['frage', 'loesung'], quiz: ['frage', 'optionen'], auftrag: ['text'] };
  for (const [k, kind] of Object.entries(KINDER)) {
    assert.strictEqual(kind.tueren.length, 24, k);
    kind.tueren.forEach((t, i) => {
      const wo = `${k} Tag ${i + 1}`;
      assert.ok(pflicht[t.art], wo + ': unbekannte Art ' + t.art);
      assert.ok(t.titel, wo + ': Titel fehlt');
      assert.ok(ART.ART[t.bild], wo + ': Bild fehlt: ' + t.bild);
      pflicht[t.art].forEach((f) => assert.ok(t[f], `${wo}: ${f} fehlt`));
      if (t.art === 'quiz') assert.ok(t.richtig >= 0 && t.richtig < t.optionen.length, wo + ': richtig ungültig');
    });
    assert.strictEqual(kind.tueren[23].art, 'finale', k + ': Tag 24 ist das Finale');
  }
});
test('alle Bilder liefern SVG', () => {
  for (const name of ART.names) assert.ok(ART.get(name).startsWith('<svg'), name);
});
console.log(`${n} Tests bestanden`);
