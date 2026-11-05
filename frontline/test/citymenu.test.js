// v5.36: Baumenü der Stadt in Gruppen; jede baubare Art steht genau einmal darin, alte Arten (Flughafen) fehlen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS } from '../js/game/city.js';
import { CITY } from '../js/data/city.js';
import { TOOL_GROUPS } from '../js/ui/citypanel.js';

test('Baumenü: Gruppen in Daniels Reihenfolge, jede baubare Art genau einmal', () => {
  const names = TOOL_GROUPS.map(([n]) => n);
  assert.deepEqual(names.slice(0, 7), ['Grundlagen', 'Wohnen & Gewerbe', 'Förderung', 'Ressourcen', 'Einheiten', 'Stadt', 'Fliegerhorst']);
  const all = TOOL_GROUPS.flatMap(([, ks]) => ks);
  assert.equal(new Set(all).size, all.length, 'keine doppelt');
  for (const k of KINDS) assert.equal(all.includes(k), !CITY.retired.includes(k), k);
  assert.ok(all.includes('erase'));
});
