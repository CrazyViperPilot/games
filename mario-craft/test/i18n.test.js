import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from '../js/data/strings.js';
import { t, setLang, LANGS } from '../js/core/i18n.js';

test('i18n: de und pl haben dieselben Schlüssel', () => {
  const de = Object.keys(STRINGS.de).sort();
  const pl = Object.keys(STRINGS.pl).sort();
  assert.deepEqual(pl, de);
});

test('i18n: keine leeren Werte', () => {
  for (const lang of Object.keys(STRINGS)) {
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      assert.equal(typeof value, 'string', `${lang}.${key} ist kein Text`);
      assert.ok(value.trim().length > 0, `${lang}.${key} ist leer`);
    }
  }
});

test('i18n: Sprachen und Platzhalter', () => {
  assert.deepEqual(LANGS, ['de', 'pl']);
  setLang('pl');
  assert.equal(t('start'), 'Graj');
  assert.equal(t('gameOverText', { world: 'Zamek' }), 'Wracasz na poziom 1 świata „Zamek” z 3 życiami.');
  setLang('de');
  assert.equal(t('start'), 'Spielen');
  assert.equal(t('gameOverText', { world: 'Burg' }), 'Zurück zu Level 1 von Burg, mit 3 Leben.');
  setLang('xx');
  assert.equal(t('start'), 'Spielen', 'unbekannte Sprache fällt auf Deutsch zurück');
  assert.equal(t('gibtsNicht'), 'gibtsNicht', 'unbekannter Schlüssel liefert den Schlüssel');
});
