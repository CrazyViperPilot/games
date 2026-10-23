// Generator für Level w1-4 „Riesenschleim“ (Boss-Level, Welt 1). Schreibt ../w1-4.js.
// Aufruf: node js/data/levels/gen/w1-4.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 130, H = 46;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

// ---- Zeichenhilfen (Spalte c, Zeile r; r = 0 oben) ----
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch;
};
const put = (c, r, ch) => { g[r][c] = ch; };

// ---- Terrain ----
// Rand: links/rechts/unten Grundgestein.
fill(0, 0, 0, H - 1, 'Z');
fill(W - 1, 0, W - 1, H - 1, 'Z');
fill(0, H - 1, W - 1, H - 1, 'Z');
// Fels: alles ab Spalte 25 ist Stein, dazu die Erde unter der kurzen Oberfläche (Spalten 1–24).
fill(25, 0, W - 2, H - 2, 'S');
fill(1, 14, 24, H - 2, 'S');
fill(1, 14, 24, 14, 'G');   // Gras (Oberfläche)
fill(1, 15, 24, 16, '#');   // Erde
// Himmel: Spalten 1–24, Zeilen 0–13 bleiben Luft.

// ---- Höhlengänge (Luft) ----
fill(21, 14, 23, 21, '.');  // Schacht 1 (vom Gras nach unten)
fill(24, 19, 46, 21, '.');  // Gang C1 (3 hoch), Boden Zeile 22
fill(46, 22, 48, 29, '.');  // Schacht 2
fill(47, 25, 70, 29, '.');  // Raum R2 (5 hoch), Boden Zeile 30
fill(66, 30, 68, 39, '.');  // Schacht 3
fill(66, 40, 90, 42, '.');  // Gang E (3 hoch) bis zum Arena-Eingang
fill(40, 23, 41, 24, '.');  // Geheimtasche hinter dem Boden von C1 (nur mit Graben)

// ---- Boss-Arena (Spalten 90–119, Zeilen 31–43) ----
fill(90, 31, 119, 31, 'X'); // Decke
fill(90, 31, 90, 39, 'X');  // linke Wand oberhalb des Eingangs
fill(119, 31, 119, 42, 'X'); // rechte Wand
fill(91, 32, 118, 42, '.'); // Innenraum; Boden Zeile 43 (Stein)
fill(90, 40, 90, 42, '.');  // Eingang von links, 3 hoch

// ---- Leitern (nach dem Ausheben, damit sie nicht überschrieben werden) ----
fill(21, 13, 21, 21, 'H');  // Schacht 1
fill(46, 21, 46, 29, 'H');  // Schacht 2
fill(66, 29, 66, 41, 'H');  // Schacht 3

// ---- Oberfläche und Deko ----
put(4, 13, ','); put(9, 13, ','); put(17, 13, ',');
put(34, 19, '|');           // Fackel in C1
put(92, 32, '|');           // Fackeln in der Arena
put(117, 32, '|');

// ---- Erze in der Wand (Kohle, unkritisch) ----
put(12, 18, '1'); put(30, 18, '1'); put(60, 24, '1');
put(75, 37, '1'); put(100, 36, '1');

// ---- Smaragde (Gruppen entlang des Weges) ----
const gems = [
  [5, 13], [6, 13], [7, 13], [15, 13], [16, 13],          // Oberfläche
  [24, 21], [25, 21], [26, 21], [30, 21], [31, 21], [32, 21],
  [37, 21], [38, 21], [39, 21], [42, 21], [43, 21], [44, 21], // C1
  [48, 29], [49, 29], [50, 29], [53, 27], [54, 27], [55, 27], // R2
  [63, 27], [64, 27], [65, 27],
  [67, 36], [68, 36], [67, 37],                            // Schacht 3
  [72, 41], [73, 41], [76, 41], [77, 41], [80, 41], [81, 41], // Gang E
];
for (const [c, r] of gems) put(c, r, 'o');

// ---- Diamanten (genau 3) ----
put(36, 21, '*');   // in C1, frei
put(62, 28, '*');   // in R2, frei
put(41, 23, '*');   // Geheimtasche: nur durch Graben von (40,21) nach unten

// ---- Truhen (Inhalt in `chests`) ----
const chests = {
  '70,42': 'armor',
  '74,42': 'bow',
  '78,42': 'apple',
  '58,29': 'emeralds',
};
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r, '?');
}

// ---- Bett vor der Arena, Start, Portal, Boss ----
put(86, 42, 'K');
put(2, 13, 'P');
put(116, 42, 'F');          // am rechten Arena-Rand, am Boden
put(110, 42, '@');          // Boss-Start, rechte Hälfte der Arena

// ---- Gegner (alle auf Boden) ----
const mobs = [
  [11, 13, 'z'],   // Zombie an der Oberfläche
  [33, 21, 'z'],   // Zombie in C1
  [28, 21, 'm'],   // Schleim (groß) in C1
  [52, 29, 'c'],   // Zischer in R2
  [55, 29, 'z'],   // Zombie in R2
  [61, 29, 'm'],   // Schleim (groß) in R2
  [64, 29, 's'],   // Skelett in R2
  [82, 42, 'r'],   // Spinne in Gang E
];
for (const [c, r, ch] of mobs) put(c, r, ch);
// Arena-Tür (Luft, wird beim Bosskampf zur Barriere)
for (let r = 40; r <= 42; r++) put(89, r, ':');

// ---- Ausgabe ----
const rows = g.map((line) => line.join(''));
const chestLines = Object.entries(chests).map(([k, v]) => `    '${k}': '${v}',`).join('\n');
const out = `// Level w1-4 „Riesenschleim“ (Boss-Level). Erzeugt von js/data/levels/gen/w1-4.mjs – nicht von Hand ändern.
export default {
  id: 'w1-4',
  world: 1,
  theme: 'overworld',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: {
${chestLines}
  },
  boss: 'slimeking',
  pick: 0,
};
`;

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, '..', 'w1-4.js'), out);
console.log(`w1-4.js geschrieben: ${W} x ${H}`);
