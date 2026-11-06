// Die Wertetabellen des PRD (docs/prd/, seit v5.79) müssen zur Config passen (erzeugt mit `npm run docs`, tools/doc-tables.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAll } from '../tools/doc-tables.mjs';

test('PRD-Tabellen sind aktuell (sonst: npm run docs)', () => {
  for (const [path, { before, after }] of Object.entries(applyAll())) {
    assert.ok(after === before, `${path}: Tabellen passen nicht mehr zu js/data/: \`npm run docs\` ausführen`);
  }
});
