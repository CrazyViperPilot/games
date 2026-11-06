// Offline-Liste (seit v5.55, Review-Paket P2; CLAUDE.md Regel 6): jede Datei, die der Browser lädt, steht in sw.js unter ASSETS.
// Geladen = von index.html und editor.html verlinkt (Skript, Stylesheet, Manifest, Icon), Icons im Manifest und jedes Modul,
// das von js/main.js bzw. js/editor/editor.js aus über `import`/`export … from`/`import()` erreichbar ist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const rel = (p) => relative(ROOT, p).split('\\').join('/');

/** ASSETS aus sw.js als Pfade relativ zum Ordner (ohne './'); './' selbst entfällt. */
function assets() {
  const block = read('sw.js').match(/const ASSETS = \[([\s\S]*?)\];/)[1];
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\.\//, '')).filter(Boolean);
}

/** Alle Module, die von den Einstiegen aus erreichbar sind (relative Pfade). */
function modules(entries) {
  const out = new Set();
  const todo = [...entries];
  while (todo.length) {
    const f = todo.pop();
    if (out.has(f)) continue;
    out.add(f);
    const src = read(f);
    const specs = [...src.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g)];
    for (const m of specs) {
      const spec = m[1] ?? m[2] ?? m[3];
      assert.ok(spec.startsWith('.'), `${f}: Import '${spec}' nicht relativ (Regel 5)`);
      const target = rel(normalize(join(ROOT, dirname(f), spec)));
      assert.ok(existsSync(join(ROOT, target)), `${f}: Import '${spec}' fehlt`);
      todo.push(target);
    }
  }
  return out;
}

test('sw.js: jede vom Browser geladene Datei steht in ASSETS, jeder Eintrag existiert, keiner doppelt', () => {
  const list = assets();
  assert.equal(new Set(list).size, list.length, `ASSETS doppelt: ${list.filter((a, i) => list.indexOf(a) !== i).join(', ')}`);
  for (const a of list) assert.ok(existsSync(join(ROOT, a)), `ASSETS: ${a} gibt es nicht`);
  const loaded = new Set(['index.html', 'editor.html']);
  const entries = [];
  for (const html of ['index.html', 'editor.html']) {
    for (const m of read(html).matchAll(/(?:src|href)="([^"#?]+)"/g)) {
      if (/^[a-z]+:/i.test(m[1])) continue; // externe Adressen gibt es nicht (Regel 5), sonst fiele es hier nicht auf
      loaded.add(m[1]);
      if (m[1].endsWith('.js')) entries.push(m[1]);
    }
  }
  for (const icon of JSON.parse(read('manifest.json')).icons) loaded.add(icon.src);
  assert.ok(entries.includes('js/main.js') && entries.includes('js/editor/editor.js'), `Einstiege: ${entries.join(', ')}`);
  for (const m of modules(entries)) loaded.add(m);
  const missing = [...loaded].filter((f) => !list.includes(f));
  assert.deepEqual(missing, [], 'fehlen in sw.js ASSETS (offline nicht verfügbar)');
});
