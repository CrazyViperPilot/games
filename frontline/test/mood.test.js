// Lichtstimmung (reine Optik): Wahl deterministisch aus dem Seed, feste Stimmungen bleiben, aus = keine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMood, MOODS, MOOD_SETTINGS } from '../js/render/mood.js';

test('feste Stimmung und aus', () => {
  for (const k of Object.keys(MOODS)) assert.equal(pickMood(k, 5, 'summer'), k);
  assert.equal(pickMood('off', 5), null);
});

test('Zufall: gleicher Seed = gleiche Stimmung, alle Stimmungen kommen vor', () => {
  const seen = new Set();
  for (let s = 1; s < 200; s++) {
    const m = pickMood('random', s, 'autumn');
    assert.equal(m, pickMood('random', s, 'autumn'));
    assert.ok(m in MOODS);
    seen.add(m);
  }
  assert.equal(seen.size, Object.keys(MOODS).length);
});

test('Menüliste passt zu den Stimmungen', () => {
  for (const k of MOOD_SETTINGS) assert.ok(k === 'off' || k === 'random' || k in MOODS);
});
