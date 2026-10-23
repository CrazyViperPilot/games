// Generator für Level w3-4 „Leerendrache“ (Boss-Level, Welt 3, Theme end). Schreibt ../w3-4.js.
// Aufruf: node js/data/levels/gen/w3-4.mjs
// Aufbau: Endstein-Inseln (Zugang, Zischer, Leerenläufer) → Eingangstür → Arena (40 × 20).
// Arena: Eingang links (Rampe aufs Obsidian-Deck), vier Säulen mit Kristallen auf dem Deck,
// Landeplatz (flacher Boden) in der Mitte, Portal rechts am Boden.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 150, H = 56;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

// ---- Zeichenhilfen (Spalte c, Zeile r; r = 0 oben) ----
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch;
};
const put = (c, r, ch) => { g[r][c] = ch; };
// Endstein-Insel: obere Zeile t (fest), darunter 2 Zeilen, Rest ist Leere.
const island = (x0, x1, t) => fill(x0, t, x1, t + 2, 'E');

// ---- Rand: links/rechts Grundgestein, unten Leere (Sturz = Leben verloren), oben Himmel.
fill(0, 0, 0, H - 1, 'Z');
fill(W - 1, 0, W - 1, H - 1, 'Z');

// ---- Zugang: Inseln von links nach rechts (Abstiege mit Lücke 2, Aufstiege mit Lücke 3, Sprünge ≤ 4 hoch).
island(1, 10, 22);    // I1 Start
island(14, 20, 20);   // I2
island(24, 31, 19);   // I3
island(34, 41, 21);   // I4
island(45, 52, 19);   // I5
island(55, 62, 21);   // I6
island(65, 72, 23);   // I7
island(76, 83, 21);   // I8
island(86, 91, 24);   // I9
island(94, 99, 28);   // I10
island(102, 105, 36); // I11 Vorplatz der Arena

// ---- Arena: 40 × 20 Innenraum (Spalten 107–146, Zeilen 16–35), Boden Zeilen 36–38 (E).
const AX0 = 107, AX1 = 146, AT = 16, FLOOR = 36;
fill(106, 15, 147, 15, 'X');                  // Decke
fill(106, 15, 106, 38, 'X');                  // linke Wand
fill(147, 15, 147, 38, 'X');                  // rechte Wand
fill(106, 33, 106, 35, '.');                  // Eingang links (3 hoch)
fill(AX0, FLOOR, AX1, FLOOR + 2, 'E');        // Arena-Boden (Endstein)
fill(AX0, AT, AX1, FLOOR - 1, '.');           // Innenraum (Luft)

// Arena-Tür (Luft, wird beim Bosskampf zur Barriere), eine Spalte vor dem Eingang.
for (let r = 33; r <= 35; r++) put(105, r, ':');

// Rampe vom Eingang auf das Deck.
fill(108, 33, 108, 35, 'E');
fill(109, 30, 109, 35, 'E');

// Deck (Obsidian) auf Zeile 28–29, Schussstand auf Zeile 27. Säulen 2 breit, von Boden bis Deck (8 hoch).
fill(110, 28, 125, 29, 'X');
for (const c0 of [112, 116, 120, 124]) fill(c0, 30, c0 + 1, 35, 'X');

// Kristalle auf den Säulenoberseiten (Luft über dem Deck). Schussstand 2 Felder daneben.
const crystals = [[113, 27], [117, 27], [121, 27], [125, 27]];
for (const [c, r] of crystals) put(c, r, 'y');

// Rückseite der Abstiegsstufen: Stufen vom Deck zum Arena-Boden rechts.
fill(126, 33, 126, 35, 'E');
fill(127, 30, 127, 35, 'E');

// Drache (Start in der Luft über der Mitte, 10 Felder über dem Boden), Portal rechts am Boden.
put(126, 26, '@');
put(144, 35, 'F');
put(128, 33, '|'); put(141, 33, '|');

// ---- Zugang: Oberflächen-Deko, Erze, Diamanten, Truhen, Betten, Gegner, Smaragde.
put(12, 19, '|'); put(45, 17, '|');

// Diamanten: 2 frei, 1 Diamanterz (Eisenhacke = Startausrüstung des Levels).
put(16, 19, '*');
put(48, 18, '*');
put(40, 21, '4');

// Truhen (Inhalt in `chests`): Rüstung vor dem ersten Zischer, Bogen, Apfel, Smaragde.
const chests = {
  '8,21': 'armor',
  '26,18': 'bow',
  '60,20': 'apple',
  '80,20': 'emeralds',
};
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r, '?');
}

// Bett vor der Arena (nach dem schwierigsten Abschnitt), genau 1 Stück.
put(103, 35, 'K');
put(3, 21, 'P');

// Gegner (alle auf festem Boden): Zischer und Leerenläufer.
const mobs = [
  [28, 18, 'c'],   // Zischer auf I3
  [38, 20, 'e'],   // Leerenläufer auf I4
  [49, 18, 'c'],   // Zischer auf I5
  [70, 22, 'c'],   // Zischer auf I7
  [79, 20, 'e'],   // Leerenläufer auf I8
];
for (const [c, r, ch] of mobs) put(c, r, ch);

// Smaragde entlang des Weges (Gruppen).
const gems = [
  [4, 21], [5, 21], [6, 21], [9, 21],          // I1
  [15, 19], [17, 19], [18, 19], [19, 19],      // I2
  [24, 18], [25, 18], [29, 18], [30, 18],      // I3
  [35, 20], [36, 20], [37, 20], [39, 20],      // I4
  [46, 18], [47, 18], [51, 18], [52, 18],      // I5
  [56, 20], [57, 20], [58, 20], [62, 20],      // I6
  [66, 22], [67, 22], [68, 22], [72, 22],      // I7
  [77, 20], [78, 20], [82, 20], [83, 20],      // I8
  [87, 23], [88, 23], [89, 23], [90, 23],      // I9
  [95, 27], [96, 27], [97, 27], [98, 27],      // I10
  [102, 35], [104, 35],                        // Vorplatz
  [130, 35], [132, 35], [134, 35], [137, 35], [139, 35], [141, 35], // Arena-Boden
];
for (const [c, r] of gems) put(c, r, 'o');

// ---- Ausgabe ----
const rows = g.map((line) => line.join(''));
const chestLines = Object.entries(chests).map(([k, v]) => `    '${k}': '${v}',`).join('\n');
const out = `// Level w3-4 „Leerendrache“ (Boss-Level). Erzeugt von js/data/levels/gen/w3-4.mjs – nicht von Hand ändern.
export default {
  id: 'w3-4',
  world: 3,
  theme: 'end',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: {
${chestLines}
  },
  boss: 'drache',
  pick: 2,
};
`;

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, '..', 'w3-4.js'), out);
console.log(`w3-4.js geschrieben: ${W} x ${H}`);
