// Generator für Level w1-1 „Wiese“ (Welt 1, overworld, 110 × 32).
// Aufruf: node js/data/levels/gen/w1-1.mjs  → schreibt js/data/levels/w1-1.js.
// Weg: Wiese (Start links, Hügel, Teiche, 3 Bäume) → Schacht mit Leiter → Höhle 1 (Bett, Zombie)
//      → Ausstieg → Wiese 2 (Teich) → Schacht → Höhle 2 (Zombie) → Ausstieg → Wiese 3 (Zischer) → Portal.
// Grabe-Lernstück: Smaragd-Versteck unter Gras und Erde, Hinweis-Smaragde am Rand. Der Hauptweg braucht kein Graben.
import { writeFileSync } from 'node:fs';
import { addFood } from './food.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const COLS = 110;
const ROWS = 32;
const GROUND = 13; // Standard-Oberfläche: Gras in Zeile 13

const g = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));

// ---- Hilfsfunktionen auf dem Zeichen-Array ----
function put(c, r, ch) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
  g[r][c] = ch;
}
function fill(c0, r0, c1, r1, ch) {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch);
}
function hline(c0, c1, r, ch) { fill(c0, r, c1, r, ch); }
function vline(c, r0, r1, ch) { fill(c, r0, c, r1, ch); }
function tree(x) {
  // Stamm 2 hoch (Sprung auf den Stamm), Krone 3 Zeilen darüber: passierbar, aber als Hindernis spürbar.
  vline(x, GROUND - 2, GROUND - 1, 'T');
  hline(x - 1, x + 1, 7, 'Y');
  put(x, 6, 'Y');
}

// ---- 1. Rand: links, rechts und unten Grundgestein ----
vline(0, 0, ROWS - 1, 'Z');
vline(COLS - 1, 0, ROWS - 1, 'Z');
hline(0, COLS - 1, ROWS - 1, 'Z');

// ---- 2. Gelände: Oberfläche je Spalte, darunter Erde (2) und Stein ----
const top = Array(COLS).fill(GROUND);
// Hügel (Stufen von 1): Spalten 12–19, Kuppe auf Zeile 11.
for (const [c, t] of [[12, 12], [13, 12], [14, 11], [15, 11], [16, 11], [17, 11], [18, 12], [19, 12]]) top[c] = t;
const ponds = [27, 28, 29, 66, 67]; // Teiche: Wasser auf Zeile 13, Erde darunter
for (let c = 1; c < COLS - 1; c++) {
  const t = top[c];
  if (ponds.includes(c)) {
    put(c, GROUND, '~');
    fill(c, GROUND + 1, c, GROUND + 2, '#');
  } else {
    put(c, t, 'G');
    fill(c, t + 1, c, t + 2, '#');
  }
  fill(c, t + 3, c, ROWS - 2, 'S');
}

// ---- 3. Bäume (Wiese 1) ----
tree(8);
tree(24);
tree(33);

// ---- 4. Schacht 1 (Spalten 38–39) mit Leiter in 38, dann Höhle 1 ----
vline(38, GROUND, 20, 'H');            // Leiter von der Oberfläche bis zur Höhle
vline(39, GROUND, 17, '.');            // freier Schacht daneben (2 breit)
fill(39, 18, 57, 20, '.');             // Höhle 1: 3 hoch (Zeilen 18–20), Boden Zeile 21, Decke Zeile 17
// Ausstieg 1 (Spalten 57–58): Luftloch in der Oberfläche, Leiter in 58 nach oben
fill(57, 12, 57, 20, '.');
vline(58, 12, 20, 'H');

// ---- 5. Smaragd-Versteck (Grabe-Lernstück) unter Gras und Erde, Hinweis am Rand ----
fill(45, 15, 46, 15, '.');
put(45, 16, '.');

// ---- 6. Schacht 2 (Spalten 72–73) mit Leiter in 72, dann Höhle 2 ----
vline(72, GROUND, 26, 'H');
fill(73, GROUND, 73, 26, '.');
fill(74, 24, 88, 26, '.');             // Höhle 2: Zeilen 24–26, Boden Zeile 27
// Ausstieg 2 (Spalten 89–90): Luftloch, Leiter in 90 nach oben
fill(89, 12, 89, 26, '.');
vline(90, 12, 26, 'H');

// ---- 7. Entitäten, Truhen, Fackeln ----
put(3, 12, 'P');                       // Start links auf der Wiese
put(106, 12, 'F');                     // Portal am rechten Ende, Oberfläche
put(52, 20, 'K');                      // Bett in der Mitte (Höhle 1)
put(46, 20, 'z');                      // Zombie 1 (Höhle 1)
put(84, 26, 'z');                      // Zombie 2 (Höhle 2)
put(96, 12, 'c');                      // Zischer auf freier Wiese (ab Spalte 60)

put(49, 17, '?');                      // Truhe 1: armor (Decke Höhle 1)
put(83, 23, '?');                      // Truhe 2: pick_stone (Decke Höhle 2)
put(76, 23, '?');                      // Truhe 3: emeralds (Decke Höhle 2)

put(15, 9, '*');                       // Diamant 1: über der Hügelkuppe
put(47, 20, '*');                      // Diamant 2: Höhle 1
put(76, 25, '*');                      // Diamant 3: Höhle 2
// genau 3 Diamanten (`*`), kein Diamanterz nötig

put(44, 18, '|');                      // Fackeln
put(53, 18, '|');
put(78, 24, '|');
put(86, 24, '|');

// Smaragde (30–60) in Gruppen entlang des Weges; Hinweis-Smaragde am Rand des Verstecks
const emeralds = [
  [14, 10], [15, 10], [16, 10], [17, 10],   // Hügel
  [29, 10], [30, 10], [31, 10],             // am Teich
  [44, 12], [47, 12],                       // Hinweis am Rand des Verstecks
  [45, 15], [46, 15], [45, 16],             // Versteck unter Erde
  [40, 19], [41, 19], [54, 19], [55, 19],   // Höhle 1
  [62, 12], [63, 12], [64, 12], [65, 12],   // Wiese 2
  [79, 24], [80, 24], [81, 24], [82, 24],   // Höhle 2
  [86, 25], [87, 25],
  [93, 12], [94, 12], [95, 12],             // Wiese 3
  [100, 10], [101, 10], [102, 10], [103, 10],
  [104, 12], [105, 12],
];
for (const [c, r] of emeralds) put(c, r, 'o');

// ---- 8. Ausgabe ----
// ---- Essen verteilen (Herzen regenerieren), siehe food.mjs.
addFood(g, COLS, ROWS);

const rows = g.map((row) => row.join(''));
const chests = { '49,17': 'armor', '83,23': 'pick_stone', '76,23': 'emeralds' };

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'w1-1.js');
const body = `// Level w1-1 „Wiese“ (Welt 1). Generiert von js/data/levels/gen/w1-1.mjs – nicht von Hand ändern.
export default {
  id: 'w1-1',
  world: 1,
  theme: 'overworld',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: { ${Object.entries(chests).map(([k, v]) => `'${k}': '${v}'`).join(', ')} },
  pick: 0,
};
`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(out, body);
  console.log(`geschrieben: ${out} (${COLS} × ${ROWS})`);
}

export { rows, chests };
