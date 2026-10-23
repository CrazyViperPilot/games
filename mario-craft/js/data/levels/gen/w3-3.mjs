// Generator für Level w3-3 „Schwebeinseln“ (Welt 3, Theme end, 200 × 64). Schreibt ../w3-3.js.
// Aufruf: node js/data/levels/gen/w3-3.mjs
// Aufbau: Start oben links auf Insel 1, Abstieg über schwebende Inseln (Sprünge und Fälle auf die
// nächste, tiefere Insel, Sprunglücken höchstens 2 Kacheln), tiefste Insel 6 mit Schleim-Katapult,
// Aufstieg über Inseln 7–13 (Sprünge bis 3 hoch, Schleim-Katapulte 8 hoch), Slab-Brücke zur letzten
// Insel, Portal oben rechts. Unter den Inseln ist offene Leere (Zeilen 55–63), Sturz = Leben verloren.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 200, H = 64;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

const put = (c, r, ch) => { if (c >= 0 && c < W && r >= 0 && r < H) g[r][c] = ch; };
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch);
};
// Entität (Gegner, Gegenstand, Smaragd, Start, Portal, Bett) nur auf Luft setzen, darunter fester Boden.
const ent = (c, r, ch) => {
  if (g[r][c] !== '.') throw new Error(`Feld ${c},${r} ist belegt (${g[r][c]})`);
  g[r][c] = ch;
};
// Insel: flache Oberseite in Zeile `top` (Spalten c0..c1), nach unten konisch.
const island = (c0, c1, top, depth = 6) => {
  for (let k = 0; k < depth; k++) {
    const shrink = Math.round(k * 0.55);
    fill(c0 + shrink, top + k, c1 - shrink, top + k, 'E');
  }
};

// ---- Rand: links/rechts Grundgestein, unten offene Leere (Zeile 63 ist Luft).
fill(0, 0, 0, H - 1, 'Z');
fill(W - 1, 0, W - 1, H - 1, 'Z');

// ---- Inseln. Oberseite = Zeile `top`; Stehen auf Zeile top-1.
const ISLANDS = [
  [1, 24, 14, 7],   // 1  Start
  [27, 38, 22],     // 2
  [41, 52, 30],     // 3
  [55, 66, 38],     // 4
  [69, 80, 46],     // 5
  [83, 94, 54],     // 6  tiefste Insel
  [93, 102, 46],    // 7  Bett
  [105, 114, 43],   // 8
  [114, 123, 35],   // 9
  [126, 135, 32],   // 10
  [135, 144, 24],   // 11
  [147, 156, 21],   // 12
  [156, 165, 13],   // 13
  [172, 186, 13],   // 14 Portal
];
for (const [c0, c1, top, depth] of ISLANDS) island(c0, c1, top, depth);

// ---- Schleim-Katapulte: Schleimblock auf der Oberseite, Landung 8 Kacheln höher in der Nachbarinsel.
put(92, 54, 'J');   // Insel 6 → Insel 7
put(113, 43, 'J');  // Insel 8 → Insel 9
put(134, 32, 'J');  // Insel 10 → Insel 11
put(155, 21, 'J');  // Insel 12 → Insel 13

// ---- Slab-Brücke (flach, auf Oberseite-Höhe der Inseln 13 und 14).
fill(166, 13, 171, 13, '=');

// ---- Obsidian-Hindernisse: eine Stufe auf dem Weg (Insel 4), zwei Pfeiler am Rand der Insel 6,
// Turm hinter dem Portal auf Insel 14.
put(62, 37, 'X');
put(94, 52, 'X');
put(94, 53, 'X');
fill(185, 10, 185, 12, 'X');

// ---- Truhen: liegen als Teil der Oberseite (Oberseiten-Kachel ersetzt).
const chests = {
  '10,14': 'armor',     // Insel 1, vor dem ersten Gegner
  '30,22': 'bow',       // Insel 2, vor dem ersten Zischer
  '79,46': 'apple',     // Insel 5
  '160,13': 'emeralds', // Insel 13
};
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r + 0, '?');
}

// ---- Start, Bett, Portal, Diamanten (frei, auf Inseln).
ent(3, 13, 'P');
ent(96, 45, 'K');
ent(183, 12, 'F');
ent(35, 21, '*');
ent(99, 45, '*');
ent(140, 23, '*');

// ---- Gegner (alle auf der Oberseite der Insel, nicht am Rand).
const mobs = [
  [34, 21, 'r'], [47, 29, 'c'],
  [60, 37, 's'], [64, 37, 'e'],
  [71, 45, 'r'], [75, 45, 'c'],
  [86, 53, 's'], [108, 42, 'r'],
  [118, 34, 'e'], [128, 31, 's'],
  [138, 23, 'r'], [150, 20, 'c'],
  [163, 12, 's'], [176, 12, 'e'],
];
for (const [c, r, ch] of mobs) ent(c, r, ch);

// ---- Fackeln (Licht auf den Inseln).
for (const [c, r] of [[14, 13], [50, 29], [89, 53], [101, 45], [170, 12]]) ent(c, r, '|');

// ---- Smaragde (Gruppen entlang des Weges, auch über den Sprüngen).
const gems = [
  [6, 13], [7, 13], [10, 13], [16, 13],
  [29, 21], [31, 21], [32, 21], [36, 21],
  [43, 29], [44, 29], [45, 29], [49, 29],
  [56, 37], [57, 37], [58, 37], [63, 37],
  [70, 45], [73, 45], [77, 45],
  [92, 48],
  [84, 53], [85, 53], [90, 53], [91, 53],
  [94, 45], [95, 45], [97, 45], [98, 45], [100, 45],
  [106, 42], [107, 42], [110, 42], [111, 42], [112, 42],
  [115, 34], [116, 34], [121, 34], [122, 34],
  [127, 31], [130, 31], [133, 31],
  [136, 23], [142, 23], [143, 23],
  [148, 20], [152, 20], [153, 20], [154, 20],
  [157, 12], [158, 12], [162, 12],
  [167, 12], [169, 12],
  [173, 12], [174, 12], [180, 12], [181, 12],
];
for (const [c, r] of gems) ent(c, r, 'o');

// ---- Erz in den Inseln (nicht auf dem Weg, nur für Neugierige mit Hacke).
put(30, 25, '1');
put(46, 33, '1');
put(118, 38, '1');

// ---- Ausgabe.
const rows = g.map((row) => row.join(''));
const out = `// Level w3-3 „Schwebeinseln“ – erzeugt von js/data/levels/gen/w3-3.mjs (nicht von Hand ändern).
export default {
  id: 'w3-3',
  world: 3,
  theme: 'end',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: { ${Object.entries(chests).map(([k, v]) => `'${k}': '${v}'`).join(', ')} },
  pick: 2,
};
`;
const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'w3-3.js');
writeFileSync(target, out);
console.log(`geschrieben: ${target} (${W} x ${H})`);
