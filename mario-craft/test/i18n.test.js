import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from '../js/data/strings.js';
import { t, setLang, LANGS } from '../js/core/i18n.js';

// Erlaubt: Buchstaben (inkl. Sonderzeichen der jeweiligen Sprache, siehe unten), Ziffern, Leerzeichen,
// Satzzeichen, Anführungszeichen, Pfeile und Symbole der Oberfläche, Platzhalter-Klammern.
const COMMON = /^[\p{L}\p{N}\s.,!?:;'"„“”‚‘’\-–&/·()◀▶←→↑↓◆◇★☆●{}+%]*$/u;
const EXTRA = { de: 'äöüßÄÖÜ', pl: 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ' };
const FORBIDDEN = /Münz|Pilz|Stern|Feuerblume|Monet|Gwiazd|Grzyb|Kwiat/;

test('i18n: de und pl haben dieselben Schlüssel', () => {
  const de = Object.keys(STRINGS.de).sort();
  const pl = Object.keys(STRINGS.pl).sort();
  assert.deepEqual(pl, de);
});

test('i18n: Level-Namen für alle 165 Level vorhanden', () => {
  for (const lang of LANGS) {
    for (let w = 1; w <= 5; w++) {
      for (let l = 1; l <= 33; l++) {
        assert.ok(STRINGS[lang][`lv_w${w}_${l}`], `${lang}.lv_w${w}_${l} fehlt`);
      }
    }
  }
});

test('i18n: keine leeren Werte', () => {
  for (const lang of Object.keys(STRINGS)) {
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      assert.equal(typeof value, 'string', `${lang}.${key} ist kein Text`);
      assert.ok(value.trim().length > 0, `${lang}.${key} ist leer`);
    }
  }
});

test('i18n: Platzhalter in DE und PL identisch', () => {
  const holders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(STRINGS.de)) {
    assert.deepEqual(holders(STRINGS.pl[key]), holders(STRINGS.de[key]), `Platzhalter bei ${key}`);
  }
});

test('i18n: nur erlaubte Zeichen (Sonderzeichen je Sprache)', () => {
  for (const lang of LANGS) {
    const allowedLetters = new Set(EXTRA[lang]);
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      assert.match(value, COMMON, `${lang}.${key} enthält unerlaubte Zeichen: ${value}`);
      for (const ch of value) {
        if (/\p{L}/u.test(ch) && ch.charCodeAt(0) > 127) {
          assert.ok(allowedLetters.has(ch), `${lang}.${key} enthält „${ch}“, das in dieser Sprache nicht vorkommt`);
        }
      }
    }
  }
});

test('i18n: keine Mario-Begriffe mehr', () => {
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      assert.doesNotMatch(value, FORBIDDEN, `${lang}.${key} enthält einen alten Begriff`);
    }
  }
});

test('i18n: Sprachen und Platzhalter', () => {
  assert.deepEqual(LANGS, ['de', 'pl']);
  setLang('pl');
  assert.equal(t('start'), 'Graj');
  assert.equal(t('gameOverText', { world: t('w3') }), 'Wracasz na poziom 1 świata „Nether i Pustka” z 3 życiami.');
  assert.equal(t('diamondsOf', { n: 2 }), '2 z 3');
  setLang('de');
  assert.equal(t('start'), 'Spielen');
  assert.equal(t('gameOverText', { world: t('w1') }), 'Zurück zu Level 1 von Oberwelt, mit 3 Leben.');
  assert.equal(t('diamondsOf', { n: 2 }), '2 von 3');
  setLang('xx');
  assert.equal(t('start'), 'Spielen', 'unbekannte Sprache fällt auf Deutsch zurück');
  assert.equal(t('gibtsNicht'), 'gibtsNicht', 'unbekannter Schlüssel liefert den Schlüssel');
});
