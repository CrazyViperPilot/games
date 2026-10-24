// Generator für Level w2-1 „Bergpfad“ (Welt 2, Theme depths, 140 × 44).
// Aufruf: node js/data/levels/gen/w2-1.mjs  → schreibt js/data/levels/w2-1.js.
// Hauptweg: Bergkamm links (Grat, Schlucht mit Sprung) → Schacht 1 (Leiter) → Halle A (Lavatümpel)
// → Schacht 2 (Leiter) → Halle B (Stollen, Eisenhacke-Truhe, Diamanterz) → Gang mit Bett
// → Schacht 3 (Leiter) → Plateau rechts → Portal.
// Die Oberfläche ist per Grundgesteinswand (Spalte WALL_C) gesperrt, der Weg führt durch den Berg.
import { writeFileSync } from 'node:fs';
import { addFood } from './food.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 140, H = 44;
const WALL_C = 70;          // Spalte der Oberflächensperre (wall.mjs)
const WALL_D = 30;          // Tiefe der Sperre (Zeile); muss über dem Gang (Zeile 34) bleiben

const g = Array.from({ length: H }, () => Array(W).fill('.'));
const put = (c, r, ch) => { if (c >= 0 && c < W && r >= 0 && r < H) g[r][c] = ch; };
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch);
};
const vline = (c, r0, r1, ch) => fill(c, r0, c, r1, ch);
const gems = (list) => list.forEach(([c, r]) => put(c, r, 'o'));

// ---- Oberflächenprofil: oberste feste Zeile je Spalte (Berg, Grat, Schlucht, Plateaus).
const top = new Array(W).fill(16);
const profile = [
  [13, 15], [14, 13], [15, 11], [16, 10], [17, 9], [18, 9], [19, 9], [20, 10], [21, 12], [22, 14], [23, 16],
  [27, 20], [28, 20], [29, 20],
  [43, 15], [44, 13], [45, 12], [46, 12], [47, 12], [48, 12], [49, 12], [50, 13], [51, 15],   // zweiter Grat
  [118, 13], [119, 13], [120, 13], [121, 13],
  [124, 20], [125, 20], [126, 20],                                                          // zweite Schlucht (Sprung)
];
for (const [c, t] of profile) top[c] = t;
top[0] = 0; top[W - 1] = 0;

// Gelände: Luft über der Oberfläche, Hänge aus Bruchstein, darunter Stein.
for (let c = 1; c < W - 1; c++) {
  fill(c, top[c], c, H - 2, 'S');
  put(c, top[c], 'C');
}
// Grundgestein links/rechts/unten.
vline(0, 0, H - 1, 'Z');
vline(W - 1, 0, H - 1, 'Z');
fill(0, H - 1, W - 1, H - 1, 'Z');

// ---- Schacht 1 (Oberfläche → Halle A): Leiter in Spalte 40, Luft in Spalte 41.
vline(40, 16, 24, 'H');
vline(41, 16, 24, '.');

// ---- Halle A (Zeilen 25–28), Boden Zeile 29. Lavatümpel links, Schacht 2 rechts.
fill(30, 25, 47, 28, '.');
fill(32, 28, 34, 28, 'L');           // Lavatümpel, weit vom Weg
// ---- Schacht 2 (Halle A → Halle B): Leiter in Spalte 46, Luft in Spalte 47.
vline(46, 29, 33, 'H');
vline(47, 29, 33, '.');

// ---- Halle B (Zeilen 34–37), Boden Zeile 38, Gang bis Spalte 100.
fill(36, 34, 100, 37, '.');
fill(38, 37, 40, 37, 'L');           // Lavatümpel am westlichen Ende der Halle

// ---- Schacht 3 (Halle B → Plateau rechts): Leiter in Spalte 100, Zeilen 16–37 (bis zum Gangboden,
// damit man vom Gang aus seitlich in die Leiter läuft).
vline(100, 16, 37, 'H');

// ---- Plateau rechts: Portal nahe der Oberfläche.
// (Spalte 101 Zeile 16 bleibt Fels und ist Standfläche am Schachtende.)

// ---- Erze und Licht.
put(29, 26, '1'); put(29, 27, '2'); put(48, 26, '3');          // Halle A
put(39, 20, '1'); put(42, 21, '2');                            // Schacht 1
put(45, 33, '2'); put(56, 33, '3'); put(78, 33, '1');          // Halle B / Gang (Decke)
put(88, 39, '3');                                              // unter dem Gang
put(110, 17, '2'); put(122, 17, '1');                          // Plateau rechts
for (const [c, r] of [[44, 25], [36, 25], [87, 36], [131, 15], [121, 12]]) put(c, r, '|');
put(10, 15, ','); put(60, 15, ',');

// ---- Truhen (Inhalt in der Level-Datei). Truhen liegen im Boden oder in der Decke, nie frei in der Luft.
const chests = {
  '33,16': 'armor',          // Oberfläche, vor dem ersten Skelett
  '64,16': 'emeralds',       // Oberfläche
  '62,34': 'pick_iron',      // Decke des Gangs (unter Fels), Kopfstoß von unten öffnet sie ohne Hacke
  '88,34': 'apple',          // Decke des Gangs, vor dem zweiten Zischer
};
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r, '?');
}

// ---- Diamanten: 2 frei, 1 Diamanterz (braucht Eisenhacke aus der Truhe).
put(58, 15, '*');   // Oberfläche
put(52, 34, '*');   // Halle B
put(68, 33, '4');   // Diamanterz in der Gangdecke

// ---- Bett (Checkpoint) nach dem schwierigsten Abschnitt, Start und Portal.
put(84, 37, 'K');
put(5, 15, 'P');
put(133, 15, 'F');

// ---- Gegner (jeweils auf festem Boden).
for (const [c, r] of [[8, 15], [42, 28], [78, 37]]) put(c, r, 'z');   // Zombies
for (const [c, r] of [[52, 15], [72, 37]]) put(c, r, 's');             // Skelette
for (const [c, r] of [[72, 15], [58, 37]]) put(c, r, 'r');             // Spinnen
for (const [c, r] of [[57, 15], [94, 37]]) put(c, r, 'c');             // Zischer

// ---- Smaragde entlang des Weges (nur auf Luftzellen).
gems([
  [5, 14], [6, 14], [11, 14], [12, 14], [30, 14], [31, 14], [17, 7], [18, 7], [28, 17], [28, 18], [38, 14], [39, 14],
  [41, 19], [41, 21],
  [36, 27], [37, 27], [44, 26], [45, 26],
  [47, 30], [47, 31],
  [49, 35], [50, 35], [54, 35], [55, 35], [60, 36], [61, 36],
  [66, 35], [70, 35], [74, 35], [76, 35], [80, 35], [82, 35], [86, 35], [92, 35], [96, 35], [98, 35],
  [86, 14], [90, 14],
  [104, 14], [106, 14], [108, 14], [112, 14], [116, 14], [119, 11], [120, 11],
  [124, 14], [126, 14], [128, 14], [130, 14], [136, 14], [137, 14],
]);

// ---- Oberflächensperre: Grundgesteinswand von Zeile 0 bis WALL_D.
for (let r = 0; r <= WALL_D; r++) put(WALL_C, r, 'Z');

// ---- Ausgabe.
// ---- Essen verteilen (Herzen regenerieren), siehe food.mjs.
addFood(g, W, H);

const rows = g.map((row) => row.join(''));
const out = `// Level w2-1 „Bergpfad“ – erzeugt von js/data/levels/gen/w2-1.mjs (nicht von Hand ändern).
export default {
  id: 'w2-1',
  world: 2,
  theme: 'depths',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: { ${Object.entries(chests).map(([k, v]) => `'${k}': '${v}'`).join(', ')} },
  pick: 1,
};
`;
const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'w2-1.js');
writeFileSync(target, out);
console.log(`geschrieben: ${target} (${W} x ${H})`);
