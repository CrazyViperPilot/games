// Versionen vergeben (tools/release.mjs, seit v5.81): Einträge aus docs/changes/ bekommen fortlaufende Versionen, der Cache wird
// einmal erhöht, offene Einträge sind gültig.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRelease, checkChange, pendingChanges, topVersion } from '../tools/release.mjs';

const LOG = '# Änderungsverlauf\n\n> Hinweis\n\n- v5.80: **Alt**: Text. Cache v191.\n- v5.79: **Älter**.\n';
const SW = "const CACHE_VERSION = 'frontline-v191';\nconst X = 1;\n";

test('release: zwei Einträge werden v5.81 und v5.82 (neueste oben), Cache einmal + 1', () => {
  const { newLog, newSw, versions, cache } = applyRelease(LOG, SW, [{ text: '**Erst**: a.' }, { text: '**Dann**: b.' }]);
  assert.deepEqual(versions, ['v5.81', 'v5.82']);
  assert.equal(cache, 192);
  assert.match(newSw, /frontline-v192/);
  const tops = [...newLog.matchAll(/^- (v\d+\.\d+)/gm)].map((m) => m[1]);
  assert.deepEqual(tops, ['v5.82', 'v5.81', 'v5.80', 'v5.79']);
  assert.ok(newLog.includes('- v5.82: **Dann**: b. Cache v192.'));
  assert.ok(newLog.startsWith('# Änderungsverlauf\n\n> Hinweis\n\n- v5.82'));
});

test('release: Einträge prüfen (eine Zeile, Titel, keine Versionsnummer)', () => {
  assert.equal(checkChange('**Titel**: Text.'), null);
  assert.ok(checkChange('Titel ohne Sterne'));
  assert.ok(checkChange('**A**\n**B**'));
  assert.ok(checkChange('- v5.90: **A**'));
  assert.deepEqual(topVersion(LOG), [5, 80]);
});

test('release: offene Einträge in docs/changes/ sind gültig', () => {
  for (const c of pendingChanges()) assert.equal(checkChange(c.text), null, `docs/changes/${c.name}`);
});
