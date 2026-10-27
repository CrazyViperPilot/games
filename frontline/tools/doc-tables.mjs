// Erzeugt die Wertetabellen in PRD.md §6 aus js/data/ (Einheiten, Gebäude, Waffen), damit das PRD nie veraltet.
// Aufruf: `npm run docs` (schreibt PRD.md). test/doctables.test.js schlägt fehl, wenn die Tabellen nicht mehr zur Config passen.
// Die Tabellen stehen in PRD.md zwischen <!-- auto:NAME:start --> und <!-- auto:NAME:end -->; dazwischen nichts von Hand ändern.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { BUILDINGS } from '../js/data/buildings.js';

export const PRD_PATH = fileURLToPath(new URL('../PRD.md', import.meta.url));

const CLASSES = ['inf', 'light', 'heavy', 'struct', 'air'];
const CLASS_NAMES = { inf: 'Inf', light: 'Leicht', heavy: 'Schwer', struct: 'Geb', air: 'Luft' };
const UNIT_NAMES = Object.fromEntries(Object.entries(UNITS).map(([k, u]) => [k, u.name]));

/** Zahl deutsch (Komma), höchstens 3 Nachkommastellen. */
const fmt = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');
const pct = (f) => `${fmt(f * 100)} %`;
const dmg = (d, c) => (d && d[c] !== undefined ? fmt(d[c]) : '–');
const costText = (cost) =>
  Object.entries(cost ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${fmt(v)} ${BALANCE.resNames[k]}`)
    .join(', ') || '–';
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

function unitsTable() {
  const rows = Object.entries(UNITS).map(([k, u]) => [
    u.name,
    u.hotkey ?? '–',
    String(BALANCE.research.unitTier[k] ?? 1),
    String(u.slots ?? 1),
    fmt(u.hp),
    fmt(u.speed),
    fmt(u.sight),
    u.range ? fmt(u.range) : '–',
    costText(u.cost),
    `${fmt(u.buildTime)} s`,
    u.fuelMax ? `${fmt(u.fuelMax)} / ${fmt(u.fuelPerSec)}` : '–',
  ]);
  return table(['Einheit', 'Taste', 'Stufe', 'Plätze', 'HP', 'Tempo', 'Sicht', 'Reichweite', 'Preis', 'Ausbildung', 'Treibstoff (max / je s)'], rows);
}

function buildingsTable() {
  const rows = Object.entries(BUILDINGS).map(([, b]) => [b.name, b.hotkey ?? '–', fmt(b.hp), `${b.w}×${b.h}`, costText(b.cost), `${fmt(b.buildTime)} s`]);
  return table(['Gebäude', 'Taste (Baumenü)', 'HP', 'Größe (Zellen)', 'Kosten', 'Bauzeit'], rows);
}

function weaponNote(w) {
  const notes = [];
  if (w.targets) notes.push(`bevorzugt gegen ${w.targets.map((c) => CLASS_NAMES[c] ?? UNIT_NAMES[c] ?? c).join(', ')}`);
  if (w.hits?.inf) notes.push(`Soldat: ${w.hits.inf} Treffer`);
  if (w.hitChance) notes.push(`Trefferchance ${pct(w.hitChance)}${w.speedRef ? ' × Tempo-Faktor' : ''} × Entfernungs-Faktor`);
  if (CLASSES.filter((c) => c !== 'air').every((c) => !w.damage?.[c]) && w.damage?.air) notes.push('nur Luftziele');
  return notes.join('; ') || '–';
}

function weaponsTable() {
  const rows = [];
  for (const u of Object.values(UNITS)) {
    for (const w of u.weapons ?? []) {
      rows.push([`${u.name}: ${w.name}`, fmt(w.range), fmt(w.cooldown), fmt(w.rounds), fmt(w.munCost), ...CLASSES.map((c) => dmg(w.damage, c)), weaponNote(w)]);
    }
  }
  for (const b of Object.values(BUILDINGS)) {
    const w = b.weapon;
    if (!w) continue;
    const notes = [];
    if (w.minRange) notes.push(`min. ${fmt(w.minRange)} px`);
    if (w.splash) notes.push(`Fläche ${fmt(w.splash)} px`);
    if (w.shell) notes.push('Granate mit Flugzeit');
    if (!w.ammoPerShot) notes.push('kostenlos');
    if (b.aa) notes.push(`fängt Mörsergranaten ab (${fmt(b.aa.range)} px, ${pct(b.aa.chance)})`);
    rows.push([`${b.name} (Gebäude)`, fmt(w.range), fmt(w.cooldown), '–', w.ammoPerShot ? fmt(w.ammoPerShot) : '–', ...CLASSES.map((c) => dmg(w.damage, c)), notes.join('; ') || '–']);
  }
  return table(['Waffe', 'Reichweite', 'Kadenz (s)', 'Schuss', 'Munition je Schuss', ...CLASSES.map((c) => CLASS_NAMES[c]), 'Hinweis'], rows);
}

/** Alle erzeugten Tabellen: Name → Markdown. */
export function renderTables() {
  return { units: unitsTable(), buildings: buildingsTable(), weapons: weaponsTable() };
}

/** Setzt die Tabellen zwischen die Markierungen im PRD-Text. Fehlt eine Markierung, gibt es einen Fehler. */
export function applyTables(text, tables = renderTables()) {
  for (const [name, md] of Object.entries(tables)) {
    const start = `<!-- auto:${name}:start -->`;
    const end = `<!-- auto:${name}:end -->`;
    const i = text.indexOf(start);
    const j = text.indexOf(end);
    if (i < 0 || j < i) throw new Error(`PRD.md: Markierung ${start} … ${end} fehlt`);
    text = `${text.slice(0, i + start.length)}\n${md}\n${text.slice(j)}`;
  }
  return text;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const before = readFileSync(PRD_PATH, 'utf8');
  const after = applyTables(before);
  if (after !== before) writeFileSync(PRD_PATH, after);
  console.log(after === before ? 'PRD.md: Tabellen schon aktuell' : 'PRD.md: Tabellen aktualisiert');
}
