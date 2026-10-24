// Generator für Level w3-1 „Glutwelt“ (Welt 3, theme nether, 150 × 46, pick 2).
// Aufruf: node js/data/levels/gen/w3-1.mjs  → schreibt js/data/levels/w3-1.js.
// Hauptweg: Oberfläche links → Schacht (Leiter) → Korridor (Bogentruhe) → Netherziegel-Halle
// → Schacht (Leiter) → Lavahöhle mit Bett → Aufstieg (Leiter) → Oberfläche rechts → Portal.
import { writeFileSync } from 'node:fs';
import { addFood } from './food.mjs';
import { ensureHeadroom } from './headroom.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 150, H = 46;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

const put = (c, r, ch) => { if (c >= 0 && c < W && r >= 0 && r < H) g[r][c] = ch; };
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch);
};
const hline = (c0, c1, r, ch) => fill(c0, r, c1, r, ch);
const vline = (c, r0, r1, ch) => fill(c, r0, c, r1, ch);
const gems = (list) => list.forEach(([c, r]) => put(c, r, 'o'));

// ---- Grundaufbau: Himmel oben, Netherrack als Oberfläche und Fels darunter, Grundgestein unten und an den Seiten.
hline(0, W - 1, 14, 'N');
fill(0, 15, W - 1, 44, 'N');
hline(0, W - 1, 45, 'Z');
vline(0, 0, 45, 'Z');
vline(W - 1, 0, 45, 'Z');

// ---- Oberfläche: flache rote Landschaft mit zwei Stufen; Lavateich im Dip (nicht überspringbar, Rand 1 hoch).
hline(10, 13, 13, 'N');             // Hügel links (Stufe)
hline(130, 133, 13, 'N');           // Stufe rechts
hline(112, 114, 13, 'U');           // Glutstein-Block als Stufe
fill(56, 14, 63, 15, '.');          // Dip (Luft)
fill(56, 16, 63, 17, 'L');          // Lavateich, Boden N (Zeile 18)

// ---- Schacht 1 (Oberfläche → Korridor): 2 breit, Leiter in der linken Spalte.
fill(18, 14, 19, 26, '.');
vline(18, 14, 26, 'H');

// ---- Korridor (Zeilen 24–26, Boden R in Zeile 27).
fill(20, 24, 44, 26, '.');
hline(20, 44, 27, 'R');
put(28, 23, 'U'); put(38, 23, 'U');
put(43, 24, '|');

// ---- Netherziegel-Halle (Zeilen 18–26, Decke R in Zeile 17, Boden R in Zeile 27).
fill(45, 18, 65, 26, '.');
hline(45, 63, 27, 'R');
hline(45, 66, 17, 'R');
vline(66, 17, 33, 'R');
put(50, 17, 'U'); put(58, 17, 'U');
put(48, 18, '|'); put(60, 18, '|');

// ---- Schacht 2 (Halle → Lavahöhle): 2 breit, Leiter in der linken Spalte (Spalte 64).
fill(64, 27, 65, 33, '.');

// ---- Lavahöhle (Zeilen 34–37, Boden N in Zeile 38, Decke N in Zeile 33). Breite Strecke bis zum Aufstieg.
fill(60, 34, 99, 37, '.');
put(70, 33, 'U'); put(78, 33, 'U'); put(92, 33, 'U');
put(76, 34, '|');
vline(64, 27, 37, 'H');             // Leiter Schacht 2 (bis auf den Boden der Höhle)

// ---- Aufstieg (Spalten 98–99 Luft, Leiter in Spalte 97 bis zur Oberfläche).
fill(98, 15, 99, 33, '.');
vline(97, 13, 37, 'H');

// ---- Unterirdische Geheimnisse: Obsidianboden über einer Nische (Spitzhacke Diamant nötig, Graben nach unten).
put(87, 38, 'X');
fill(85, 39, 89, 41, '.');

// ---- Oberfläche rechts: Luft über dem Netherrack, Portal nahe der rechten Kante.
// (Zeile 14 ist bereits N, Zeile 13 frei.)

// ---- Truhen (Inhalt in der Level-Datei). Bogen vor dem ersten Zischer und Skelett.
const chests = {
  '24,26': 'bow',
  '52,26': 'armor',
  '36,26': 'emeralds',
  '80,37': 'pick_diamond',
  '126,13': 'apple',
};
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r, '?');
}

// ---- Bett nach dem schwierigsten Abschnitt (Lavahöhle), kurz vor dem Aufstieg; Start, Portal.
put(92, 37, 'K');
put(3, 13, 'P');
put(140, 13, 'F');

// ---- Fackeln an der Oberfläche (Licht am Lavateich).
put(9, 13, '|'); put(54, 13, '|'); put(65, 13, '|');

// ---- Gegner (auf festem Boden, Zelle darunter fest; Glutgeister fliegen).
for (const [c, r] of [[32, 26], [41, 26], [49, 26], [59, 26], [74, 37], [86, 37], [106, 13], [120, 13]]) {
  put(c, r, (c === 32 || c === 59 || c === 74 || c === 106) ? 'c' : 's');
}
put(56, 21, 'g'); put(70, 34, 'g'); put(132, 9, 'g');

// ---- Smaragde (entlang des Weges) und Diamanten.
gems([
  [5, 12], [6, 12], [7, 12], [12, 12], [22, 12], [23, 12], [30, 12], [31, 12], [44, 12], [45, 12],
  [66, 12], [67, 12], [78, 12], [79, 12], [88, 12], [89, 12], [104, 12], [105, 12], [120, 12], [121, 12],
  [138, 12], [139, 12],
  [25, 25], [26, 25], [29, 25], [35, 25], [36, 25], [42, 25],
  [46, 25], [47, 25], [54, 25], [55, 25], [61, 25], [62, 25], [60, 19], [61, 19],
  [65, 30], [65, 31],
  [68, 35], [70, 35], [74, 35], [76, 35], [82, 35], [84, 35], [94, 35], [95, 35],
  [98, 20], [99, 20], [98, 28], [99, 28],
]);
put(57, 26, '*');   // Halle, auf dem Weg
put(88, 40, '*');   // Nische unter dem Obsidianboden
put(96, 22, '4');   // Diamanterz in der Schachtwand (Eisenhacke, Start-Hacke 2)

// Grundgesteinswand von oben bis in den Fels: die Oberfläche ist gesperrt, der Weg führt durch die Tiefe.
// Spalte 79, Tiefe 34 (per /tmp/wall.mjs: Portal bleibt ohne Graben erreichbar; Gang darunter 3 hoch).
for (let r = 0; r <= 34; r++) put(79, r, 'Z');

// ---- Ausgabe.
// ---- Essen verteilen (Herzen regenerieren), siehe food.mjs.
addFood(g, W, H);

// ---- Kopffreiheit vor Skeletten (Pfeilen ausweichen = springen können), siehe headroom.mjs.
ensureHeadroom(g, W, H);

const rows = g.map((row) => row.join(''));
const out = `// Level w3-1 „Glutwelt“ – erzeugt von js/data/levels/gen/w3-1.mjs (nicht von Hand ändern).
export default {
  id: 'w3-1',
  world: 3,
  theme: 'nether',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: { ${Object.entries(chests).map(([k, v]) => `'${k}': '${v}'`).join(', ')} },
  pick: 2,
};
`;
const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'w3-1.js');
writeFileSync(target, out);
console.log(`geschrieben: ${target} (${W} x ${H})`);
