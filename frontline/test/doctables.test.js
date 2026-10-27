// Die Wertetabellen in PRD.md §6 müssen zur Config passen (erzeugt mit `npm run docs`, tools/doc-tables.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyTables, PRD_PATH } from '../tools/doc-tables.mjs';

test('PRD-Tabellen sind aktuell (sonst: npm run docs)', () => {
  const prd = readFileSync(PRD_PATH, 'utf8');
  assert.ok(applyTables(prd) === prd, 'PRD.md-Tabellen passen nicht mehr zu js/data/: `npm run docs` ausführen');
});
