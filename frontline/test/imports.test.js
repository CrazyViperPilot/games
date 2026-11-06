// Importgraph (Review A-01, seit v5.60): kein Zyklus aus statischen Importen in js/, die Stadt-KI liegt in js/ai/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Alle .js-Dateien unter js/ mit ihren statischen Importen (relativ zu ROOT). */
function graph() {
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js')) files.push(p);
    }
  };
  walk(join(ROOT, 'js'));
  const edges = new Map();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const to = [];
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)) to.push(relative(ROOT, resolve(dirname(f), m[1])));
    edges.set(relative(ROOT, f), to);
  }
  return edges;
}

test('Importe: jede Datei existiert, kein Zyklus', () => {
  const edges = graph();
  for (const [f, list] of edges) for (const t of list) assert.ok(existsSync(join(ROOT, t)), `${f} importiert fehlende Datei ${t}`);
  const state = new Map(); // 1 in Arbeit, 2 fertig
  const stack = [];
  const visit = (v) => {
    state.set(v, 1);
    stack.push(v);
    for (const w of edges.get(v) ?? []) {
      if (state.get(w) === 1) assert.fail(`Importzyklus: ${[...stack.slice(stack.indexOf(w)), w].join(' -> ')}`);
      if (!state.has(w)) visit(w);
    }
    stack.pop();
    state.set(v, 2);
  };
  for (const v of edges.keys()) if (!state.has(v)) visit(v);
});

test('Stadt: Zellgeometrie ist ein Blattmodul, die Stadt-KI liegt in js/ai', () => {
  const edges = graph();
  for (const t of edges.get('js/game/city/cells.js')) assert.ok(t.startsWith('js/data/'), `cells.js importiert ${t}`);
  for (const [f, list] of edges) {
    if (!f.startsWith('js/game/')) continue;
    assert.ok(!list.includes('js/ai/cityai.js'), `${f}: Simulation importiert die Stadt-KI`);
  }
  assert.ok(!existsSync(join(ROOT, 'js/game/city.js')), 'js/game/city.js ist seit v5.60 in js/game/city/ aufgeteilt');
});
