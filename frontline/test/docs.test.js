// Doku-Abgleich: ARCHITEKTUR §6 nennt jeden Befehl aus dem Befehlsregister (game.issue), der Änderungsverlauf ist absteigend sortiert,
// und es gibt nur eine Fassung der Dokumente (PLAN.md liegt historisch in docs/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { COMMANDS } from '../js/game/commands.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('jeder Befehl des Befehlsregisters (js/game/commands.js) steht in ARCHITEKTUR §6 (Befehle)', () => {
  const cmds = Object.keys(COMMANDS);
  assert.ok(cmds.length > 30, 'zu wenige Befehle gefunden: Muster prüfen');
  const arch = read('../ARCHITEKTUR.md');
  const from = arch.indexOf('## 6. Befehle');
  const to = arch.indexOf('## 7. Dateien');
  assert.ok(from >= 0 && to > from, 'Abschnitt 6 in ARCHITEKTUR.md nicht gefunden');
  const section = arch.slice(from, to);
  const missing = cmds.filter((c) => !section.includes('`' + c + '`'));
  assert.deepEqual(missing, [], 'Befehle fehlen in ARCHITEKTUR §6: ' + missing.join(', '));
});

test('Änderungsverlauf (docs/changelog.md, seit v5.79): Versionen absteigend und ohne Dubletten', () => {
  const log = read('../docs/changelog.md');
  const keys = [...log.matchAll(/^- v(\d+)(?:\.(\d+))?/gm)].map((m) => [+m[1], m[2] === undefined ? 0 : +m[2]]);
  assert.ok(keys.length > 100, 'zu wenige Einträge gefunden');
  for (let i = 1; i < keys.length; i++) {
    const [a, b] = [keys[i - 1], keys[i]];
    const descending = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
    assert.ok(descending, `Reihenfolge vertauscht: v${a.join('.')} vor v${b.join('.')}`);
  }
});

test('Dokumente liegen einmal vor: PLAN.md ist nach docs/ verschoben, kein doppeltes verlauf.md im Wurzelordner', () => {
  assert.equal(existsSync(new URL('../PLAN.md', import.meta.url)), false, 'PLAN.md gehört nach docs/');
  assert.equal(existsSync(new URL('../verlauf.md', import.meta.url)), false, 'verlauf.md gibt es nur unter docs/');
  assert.ok(existsSync(new URL('../docs/plan-v5.20.md', import.meta.url)), 'docs/plan-v5.20.md fehlt');
});

test('PRD aufgeteilt (seit v5.79): der Einstieg PRD.md verlinkt jede Themen-Datei unter docs/prd/, und jede verlinkte Datei gibt es', () => {
  const prd = read('../PRD.md');
  const linked = [...prd.matchAll(/\]\(docs\/prd\/([a-z0-9-]+\.md)\)/g)].map((m) => m[1]);
  const files = readdirSync(new URL('../docs/prd/', import.meta.url)).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 10, 'zu wenige Themen-Dateien');
  assert.deepEqual(files.filter((f) => !linked.includes(f)), [], 'Themen-Datei ohne Eintrag in der Übersicht von PRD.md');
  assert.deepEqual(linked.filter((f) => !files.includes(f)), [], 'PRD.md verlinkt eine fehlende Datei');
  assert.ok(prd.length < 20000, `PRD.md soll Einstieg bleiben (${prd.length} Zeichen): Regeln gehören in docs/prd/`);
});
