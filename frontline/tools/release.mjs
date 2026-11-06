// Versionen vergeben (seit v5.81): Damit parallele Agenten sich nicht in Versionsnummern, Cache-Version und Änderungsverlauf
// in die Quere kommen, schreibt jedes Paket seinen Eintrag als eigene Datei nach docs/changes/ (ohne Versionsnummer). Erst beim
// Zusammenführen auf main vergibt dieses Skript die Nummern: je Datei die nächste freie Version (oben im Änderungsverlauf),
// einmal je Lauf CACHE_VERSION in sw.js + 1, dann löscht es die eingesammelten Dateien.
//
// Eintrag (docs/changes/<thema>.md, eine Zeile, Markdown wie im Änderungsverlauf, ohne „- vX.YY:“):
//   **Staubwolke am Bagger** (§6 „Bagger“, nur Bild): Solange ein Bagger …
// Aufruf (im Ordner frontline/, auf dem neuesten main):  npm run release        (nur ansehen: npm run release -- --dry)
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
export const CHANGES_DIR = HERE('docs/changes/');
const CHANGELOG = HERE('docs/changelog.md');
const SW = HERE('sw.js');

/** Einträge in docs/changes/ (ohne README.md), älteste zuerst (Dateizeit, dann Name). */
export function pendingChanges(dir = CHANGES_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => ({ file: dir + f, name: f, t: statSync(dir + f).mtimeMs, text: readFileSync(dir + f, 'utf8').trim() }))
    .sort((a, b) => a.t - b.t || a.name.localeCompare(b.name));
}

/** Prüft einen Eintrag: eine Zeile, beginnt mit **Titel**, keine eigene Versionsnummer. Rückgabe: Fehlertext oder null. */
export function checkChange(text) {
  if (!text) return 'leer';
  if (text.includes('\n')) return 'mehr als eine Zeile';
  if (!text.startsWith('**')) return 'muss mit **Titel** beginnen';
  if (/^-?\s*v\d+\.\d+/.test(text)) return 'keine Versionsnummer angeben (vergibt npm run release)';
  return null;
}

/** Höchste Version oben im Änderungsverlauf, z. B. [5, 80]. */
export function topVersion(log) {
  const m = log.match(/^- v(\d+)\.(\d+)/m);
  if (!m) throw new Error('docs/changelog.md: keine Version gefunden');
  return [Number(m[1]), Number(m[2])];
}

/** Neuer Änderungsverlauf und neues sw.js für die Einträge (rein, ohne Dateizugriff). */
export function applyRelease(log, sw, changes) {
  let [major, minor] = topVersion(log);
  const m = sw.match(/const CACHE_VERSION = 'frontline-v(\d+)';/);
  if (!m) throw new Error('sw.js: CACHE_VERSION nicht gefunden');
  const cache = Number(m[1]) + 1;
  const lines = changes.map((c) => {
    minor++;
    return `- v${major}.${minor}: ${c.text} Cache v${cache}.`;
  });
  const i = log.search(/^- v\d+\.\d+/m);
  const newLog = log.slice(0, i) + lines.reverse().join('\n') + '\n' + log.slice(i);
  const newSw = sw.replace(m[0], `const CACHE_VERSION = 'frontline-v${cache}';`);
  return { newLog, newSw, versions: lines.map((l) => l.slice(2, l.indexOf(':'))).reverse(), cache };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dry = process.argv.includes('--dry');
  const changes = pendingChanges();
  if (!changes.length) {
    console.log('Keine Einträge in docs/changes/: nichts zu tun.');
    process.exit(0);
  }
  const bad = changes.map((c) => [c.name, checkChange(c.text)]).filter(([, e]) => e);
  if (bad.length) {
    for (const [n, e] of bad) console.error(`docs/changes/${n}: ${e}`);
    process.exit(1);
  }
  const { newLog, newSw, versions, cache } = applyRelease(readFileSync(CHANGELOG, 'utf8'), readFileSync(SW, 'utf8'), changes);
  changes.forEach((c, k) => console.log(`${versions[k]}  ← docs/changes/${c.name}`));
  console.log(`CACHE_VERSION → frontline-v${cache}`);
  if (dry) process.exit(0);
  writeFileSync(CHANGELOG, newLog);
  writeFileSync(SW, newSw);
  for (const c of changes) unlinkSync(c.file);
  console.log('Eingetragen. Jetzt npm test, committen, nach main pushen.');
}
