import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, loadSave, writeSave } from '../js/core/save.js';

const KEY = 'mariocraft-save';

// Gemockter localStorage (Node hat keinen eigenen).
function mockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
}

function setStorage(s) {
  Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true });
}

let original;
beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete globalThis.localStorage;
});

test('default: Format v2 mit Startwerten', () => {
  const d = defaultSave();
  assert.deepEqual(d, {
    v: 2,
    lang: null,
    sound: true,
    unlocked: 'w1-1',
    lives: 3,
    emeralds: 0,
    power: 'plain',
    pick: 0,
    levels: {},
  });
});

test('load: ohne gespeicherten Stand -> default', () => {
  setStorage(mockStorage());
  assert.deepEqual(loadSave(), defaultSave());
});

test('load: v1-Stand wird zurückgesetzt, nur lang und sound bleiben', () => {
  setStorage(mockStorage({
    [KEY]: JSON.stringify({
      v: 1, lang: 'pl', sound: false, unlocked: 'w3-2', lives: 9, coins: 40,
      power: 'big', levels: { 'w1-1': { done: true } },
    }),
  }));
  const s = loadSave();
  assert.equal(s.lang, 'pl');
  assert.equal(s.sound, false);
  assert.equal(s.unlocked, 'w1-1');
  assert.equal(s.lives, 3);
  assert.equal(s.emeralds, 0);
  assert.equal(s.power, 'plain');
  assert.equal(s.pick, 0);
  assert.deepEqual(s.levels, {});
});

test('load: v1 mit ungültiger Sprache und Ton -> Standardwerte', () => {
  setStorage(mockStorage({
    [KEY]: JSON.stringify({ v: 1, lang: 'xx', sound: 'ja' }),
  }));
  const s = loadSave();
  assert.equal(s.lang, null);
  assert.equal(s.sound, true);
});

test('load: unbekannte Version -> default', () => {
  setStorage(mockStorage({ [KEY]: JSON.stringify({ v: 3, lang: 'de', emeralds: 5 }) }));
  assert.deepEqual(loadSave(), defaultSave());
});

test('load: kaputtes JSON und Nicht-Objekte -> default', () => {
  for (const raw of ['{kaputt', 'null', '42', '"text"', '[]']) {
    setStorage(mockStorage({ [KEY]: raw }));
    assert.deepEqual(loadSave(), defaultSave(), `Eingabe ${raw}`);
  }
});

test('load: ungültige Werte in v2 werden verworfen', () => {
  setStorage(mockStorage({
    [KEY]: JSON.stringify({
      v: 2,
      lang: 'en',
      sound: 'an',
      unlocked: 7,
      lives: 0,
      emeralds: -1,
      power: 'big',
      pick: 4,
      levels: [],
    }),
  }));
  const s = loadSave();
  assert.equal(s.lang, null);
  assert.equal(s.sound, true);
  assert.equal(s.unlocked, 'w1-1');
  assert.equal(s.lives, 3);
  assert.equal(s.emeralds, 0);
  assert.equal(s.power, 'plain');
  assert.equal(s.pick, 0);
  assert.deepEqual(s.levels, {});
});

test('load: lives außerhalb 1..99 und nicht ganzzahlige Werte werden verworfen', () => {
  for (const bad of [0, 100, 2.5, '3', null]) {
    setStorage(mockStorage({ [KEY]: JSON.stringify({ v: 2, lives: bad, emeralds: 1.5, pick: '1' }) }));
    const s = loadSave();
    assert.equal(s.lives, 3, `lives ${bad}`);
    assert.equal(s.emeralds, 0);
    assert.equal(s.pick, 0);
  }
});

test('load: power ∈ plain|armor|bow, pick ∈ 0..3 werden übernommen', () => {
  for (const p of ['plain', 'armor', 'bow']) {
    setStorage(mockStorage({ [KEY]: JSON.stringify({ v: 2, power: p }) }));
    assert.equal(loadSave().power, p);
  }
  for (const k of [0, 1, 2, 3]) {
    setStorage(mockStorage({ [KEY]: JSON.stringify({ v: 2, pick: k }) }));
    assert.equal(loadSave().pick, k);
  }
});

test('load: gültiger v2-Stand bleibt erhalten', () => {
  const save = {
    v: 2,
    lang: 'de',
    sound: false,
    unlocked: 'w2-1',
    lives: 5,
    emeralds: 42,
    power: 'armor',
    pick: 2,
    levels: { 'w1-1': { done: true, bestTime: 95, emeralds: 12, diamonds: [true, false, true] } },
  };
  setStorage(mockStorage({ [KEY]: JSON.stringify(save) }));
  assert.deepEqual(loadSave(), save);
});

test('write/load Kreislauf', () => {
  const st = mockStorage();
  setStorage(st);
  const save = { ...defaultSave(), lang: 'pl', emeralds: 7, power: 'bow', pick: 3 };
  writeSave(save);
  assert.ok(st.store.has(KEY));
  assert.deepEqual(loadSave(), save);
});

test('write: schreibt unter dem Schlüssel mariocraft-save', () => {
  const st = mockStorage();
  setStorage(st);
  writeSave(defaultSave());
  assert.equal(JSON.parse(st.store.get(KEY)).v, 2);
});

test('write: wirft nicht, wenn localStorage fehlt oder blockiert ist', () => {
  setStorage({
    getItem() { throw new Error('blockiert'); },
    setItem() { throw new Error('blockiert'); },
  });
  assert.doesNotThrow(() => writeSave(defaultSave()));
  assert.deepEqual(loadSave(), defaultSave());

  delete globalThis.localStorage;
  assert.doesNotThrow(() => writeSave(defaultSave()));
  assert.deepEqual(loadSave(), defaultSave());
});
