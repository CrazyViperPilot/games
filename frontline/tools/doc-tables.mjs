// Erzeugt die Wertetabellen des PRD (§6 in docs/prd/einheiten.md, Forschung in docs/prd/wetter-forschung.md, seit v5.79) aus js/data/ (Einheiten, Gebäude, Waffen), damit das PRD nie veraltet.
// Aufruf: `npm run docs` (schreibt die Dateien unter docs/prd/). test/doctables.test.js schlägt fehl, wenn die Tabellen nicht mehr zur Config passen.
// Die Tabellen stehen in den Dateien unter docs/prd/ zwischen <!-- auto:NAME:start --> und <!-- auto:NAME:end -->; dazwischen nichts von Hand ändern.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { RESEARCH } from '../js/data/research.js';
import { researchEffect } from '../js/game/research.js';

export const PRD_DIR = fileURLToPath(new URL('../docs/prd/', import.meta.url)); // Themen-Dateien des PRD (seit v5.79)
export const PRD_FILES = readdirSync(PRD_DIR).filter((f) => f.endsWith('.md')).sort().map((f) => PRD_DIR + f);

const CLASSES = ['inf', 'light', 'heavy', 'struct', 'air', 'jet'];
const CLASS_NAMES = { inf: 'Inf', light: 'Leicht', heavy: 'Schwer', struct: 'Geb', air: 'Luft', jet: 'Flugzeug' };
const UNIT_NAMES = Object.fromEntries(Object.entries(UNITS).map(([k, u]) => [k, u.name]));

/** Zahl deutsch (Komma), höchstens 3 Nachkommastellen. */
const fmt = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');
const pct = (f) => `${fmt(f * 100)} %`;
const dmg = (d, c) => (d && d[c] !== undefined ? fmt(d[c]) : c === 'jet' && d && d.air !== undefined ? fmt(d.air) : '–'); // Flugzeug: ohne eigenen Wert wie Luft
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
    String(u.slots ?? 1),
    fmt(u.hp),
    fmt(u.speed),
    fmt(u.sight),
    u.range ? fmt(u.range) : '–',
    costText(u.cost),
    `${fmt(u.buildTime)} s`,
    u.fuelMax ? `${fmt(u.fuelMax)} / ${fmt(u.fuelPerSec)}` : '–',
  ]);
  return table(['Einheit', 'Taste', 'Plätze', 'HP', 'Tempo', 'Sicht', 'Reichweite', 'Preis', 'Ausbildung', 'Treibstoff (max / je s)'], rows);
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
  if (CLASSES.filter((c) => c !== 'air' && c !== 'jet').every((c) => !w.damage?.[c]) && w.damage?.air) notes.push('nur Luftziele');
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
    if (w.moneyPerShot) notes.push(`dazu ${fmt(w.moneyPerShot)} Geld je Schuss`);
    if (b.aa) {
      const extra = b.aa.moneyPerShot ? `, alle ${fmt(b.aa.cooldown)} s, je Versuch ${fmt(b.aa.ammoPerShot)} Munition und ${fmt(b.aa.moneyPerShot)} Geld` : '';
      notes.push(`fängt Mörsergranaten ab (${fmt(b.aa.range)} px, ${pct(b.aa.chance)}${extra})`);
    }
    rows.push([`${b.name} (Gebäude)`, fmt(w.range), fmt(w.cooldown), '–', w.ammoPerShot ? fmt(w.ammoPerShot) : '–', ...CLASSES.map((c) => dmg(w.damage, c)), notes.join('; ') || '–']);
  }
  return table(['Waffe', 'Reichweite', 'Kadenz (s)', 'Schuss', 'Munition je Schuss', ...CLASSES.map((c) => CLASS_NAMES[c]), 'Hinweis'], rows);
}

/** Forschungsbaum (seit v5.04): je Stufe Preis und Zeit, je Ast die Forschung mit ihrer Wirkung. */
function researchTable() {
  const rows = [];
  for (let t = 1; t <= RESEARCH.tiers; t++) {
    for (const [lane, L] of Object.entries(RESEARCH.lanes)) {
      const k = `${lane}${t}`;
      rows.push([String(t), `${L.icon} ${L.name}`, RESEARCH.items[k].name, `\`${k}\``, `${fmt(RESEARCH.items[k].money)} Geld, ${fmt(RESEARCH.items[k].time)} s`, researchEffect(k)]);
    }
  }
  return table(['Stufe', 'Ast', 'Forschung', 'Schlüssel', 'Preis, Zeit', 'Wirkung'], rows);
}

/** Alle erzeugten Tabellen: Name → Markdown. */
export function renderTables() {
  return { units: unitsTable(), buildings: buildingsTable(), weapons: weaponsTable(), research: researchTable() };
}

/**
 * Setzt die Tabellen zwischen die Markierungen im Text. Tabellen, deren Markierung im Text fehlt, bleiben weg; mit `strict` ist eine
 * fehlende Markierung ein Fehler (Prüfung über alle Dateien in applyAll).
 */
export function applyTables(text, tables = renderTables(), strict = false) {
  for (const [name, md] of Object.entries(tables)) {
    const start = `<!-- auto:${name}:start -->`;
    const end = `<!-- auto:${name}:end -->`;
    const i = text.indexOf(start);
    const j = text.indexOf(end);
    if (i < 0 || j < i) {
      if (strict) throw new Error(`Markierung ${start} … ${end} fehlt`);
      continue;
    }
    text = `${text.slice(0, i + start.length)}\n${md}\n${text.slice(j)}`;
  }
  return text;
}

/**
 * Alle PRD-Dateien (seit v5.79 aufgeteilt): Pfad → { before, after }. Jede Tabelle muss in genau einer Datei ihre Markierung haben
 * (Einheiten, Gebäude, Waffen in docs/prd/einheiten.md, Forschung in docs/prd/wetter-forschung.md).
 */
export function applyAll(tables = renderTables()) {
  const out = {};
  const found = {};
  for (const path of PRD_FILES) {
    const before = readFileSync(path, 'utf8');
    for (const name of Object.keys(tables)) if (before.includes(`<!-- auto:${name}:start -->`)) found[name] = (found[name] ?? 0) + 1;
    out[path] = { before, after: applyTables(before, tables) };
  }
  const bad = Object.keys(tables).filter((n) => found[n] !== 1);
  if (bad.length) throw new Error(`Tabellen ohne genau eine Markierung in docs/prd/: ${bad.join(', ')}`);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let changed = 0;
  for (const [path, { before, after }] of Object.entries(applyAll())) {
    if (after === before) continue;
    writeFileSync(path, after);
    changed++;
  }
  console.log(changed ? `PRD-Tabellen aktualisiert (${changed} Datei(en) in docs/prd/)` : 'PRD-Tabellen schon aktuell');
}
