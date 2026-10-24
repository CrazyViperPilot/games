// Generator für Level w2-2 „Die Schlucht“ (Welt 2, depths, 170 × 60).
// Aufruf: node js/data/levels/gen/w2-2.mjs  → schreibt js/data/levels/w2-2.js.
// Hauptweg: Oberfläche links → Abstieg an der linken Schluchtwand (Leitern, Simse)
// → unterirdischer Fluss unten → Aufstieg an der rechten Wand (Ranke) → Gang unter der
// Oberfläche → Höhlenkammer mit Simsen → Schleimsprung → Schacht mit Leiter → Portal rechts.
import { writeFileSync } from 'node:fs';
import { addFood } from './food.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 170, H = 60;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

const put = (c, r, ch) => { if (c >= 0 && c < W && r >= 0 && r < H) g[r][c] = ch; };
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch);
};
const hline = (c0, c1, r, ch) => fill(c0, r, c1, r, ch);
const vline = (c, r0, r1, ch) => fill(c, r0, c, r1, ch);
const gems = (list) => list.forEach(([c, r]) => put(c, r, 'o'));

// ---- Grundaufbau: Himmel, Gras (Zeile 14), Erde, Stein, Grundgestein unten und an den Seiten.
hline(0, W - 1, 14, 'G');
fill(0, 15, W - 1, 16, '#');
fill(0, 17, W - 1, 58, 'S');
hline(0, W - 1, 59, 'Z');
vline(0, 0, 59, 'Z');
vline(W - 1, 0, 59, 'Z');

// ---- Schlucht: Luft von Zeile 14 bis 51 zwischen Spalte 33 und 55, Fluss in Zeile 52–53, Boden Zeile 54.
fill(33, 14, 55, 51, '.');
fill(33, 52, 55, 53, '.');
fill(34, 52, 55, 53, '~');
put(10, 13, ','); put(23, 13, ','); put(4, 13, ',');

// ---- Abstieg links: Leiter LA (Spalte 33) → Sims L1 → Leiter LB (Spalte 39) → Sims L2 → Leiter LC (Spalte 46) → Fluss.
vline(33, 14, 26, 'H');
hline(33, 38, 27, 'B');
vline(39, 26, 36, 'H');
hline(40, 45, 37, 'C');
vline(46, 36, 51, 'H');

// ---- Aufstieg rechts: Ranke an der Schluchtwand, dann Gang E1 durch die Wand unter der Oberfläche.
vline(55, 37, 51, 'V');
fill(56, 36, 72, 38, '.');

// ---- Höhlenkammer K1 (Spalten 73–88) mit Sims und Leiter.
fill(73, 29, 88, 38, '.');
hline(80, 86, 34, 'C');
vline(79, 33, 38, 'H');

// ---- Gang E2 (Zeilen 36–38), Schleimsprung bei Spalte 110, Sims und Schacht zur Oberfläche.
fill(89, 36, 109, 38, '.');
put(110, 39, 'J');
fill(110, 29, 111, 38, '.');
fill(112, 29, 116, 31, '.');
hline(112, 116, 32, 'C');
vline(117, 13, 31, 'H');
fill(118, 15, 118, 31, '.');

// ---- Seitenhöhle unter Gang E1 (Spinnen an den Wänden), Zugang über Leiter in Spalte 68 (Nebenweg).
fill(60, 41, 76, 49, '.');
vline(68, 39, 48, 'H');
put(66, 42, '|');

// ---- Erze, Torchen und Diamanterz im Boden des Gangs E2 (nur mit Eisenhacke).
put(96, 39, '4');

// ---- Fackeln (nicht fest, reine Lichtquellen in der Luft).
for (const [c, r] of [[37, 25], [60, 36], [80, 30], [100, 36], [114, 29], [118, 25], [139, 12], [152, 12]]) put(c, r, '|');

// ---- Truhen (Inhalt in `chests`). Bogen liegt vor dem ersten Skelett, Bett in der Mitte.
const chests = {
  '29,14': 'bow',         // Oberfläche, im Gras
  '35,27': 'emeralds',    // Sims L1
  '31,33': 'cake',        // versteckt im Fels neben der Schlucht
  '64,39': 'pick_iron',   // Boden von Gang E1
};
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r, '?');
}
put(76, 38, 'K');         // Bett in der Höhlenkammer K1
put(3, 13, 'P');          // Start an der Oberfläche
put(160, 13, 'F');        // Portal rechts an der Oberfläche

// ---- Diamanten (genau 3: zwei frei, eines als Erz).
put(43, 36, '*');         // über dem Sims L2
put(84, 32, '*');         // über dem Sims in K1
// Diamanterz (96,39) siehe oben.

// ---- Smaragde (Gruppen entlang des Weges).
gems([
  [5, 13], [6, 13], [12, 13], [13, 13], [18, 13], [19, 13],           // Oberfläche
  [34, 26], [36, 26],                                                 // über L1
  [40, 35], [41, 35], [42, 35], [44, 35],                             // über L2
  [47, 44], [47, 46], [47, 48],                                       // neben Leiter LC
  [58, 37], [66, 37], [67, 37],                                       // Gang E1
  [74, 37], [75, 37], [77, 37], [81, 32], [82, 32], [87, 37], [88, 37], // Kammer K1
  [92, 37], [94, 37], [104, 37], [106, 37],                           // Gang E2
  [113, 30], [114, 30], [115, 30], [118, 22], [118, 26],              // Schacht/Sims
  [125, 13], [130, 13], [135, 13], [140, 13], [145, 13], [150, 13], [155, 13], // Oberfläche rechts
  [62, 49], [63, 49], [70, 49], [71, 49], [73, 45], [74, 45],         // Seitenhöhle
]);

// ---- Gegner (auf festem Boden, Zelle darunter fest).
const mobs = [
  [12, 13, 'z'],   // Zombie an der Oberfläche
  [42, 36, 's'],   // Skelett auf Sims L2
  [45, 36, 'm'],   // Schleim (groß) auf Sims L2
  [62, 38, 'r'],   // Spinne in Gang E1
  [74, 38, 'm'],   // Schleim (groß) in K1
  [83, 33, 's'],   // Skelett auf Sims in K1
  [100, 38, 'c'],  // Zischer in Gang E2
  [145, 13, 'z'],  // Zombie an der Oberfläche rechts
  [61, 49, 'r'],   // Spinne in der Seitenhöhle
  [75, 49, 'r'],   // Spinne in der Seitenhöhle
  [66, 49, 's'],   // Skelett in der Seitenhöhle
];
for (const [c, r, ch] of mobs) put(c, r, ch);

// Oberfläche sperren: Grundgesteinswand von Zeile 0 bis 35 bei Spalte 95 (der Gang E2 bei Zeile 36–38 bleibt offen).
for (let r = 0; r <= 35; r++) put(95, r, 'Z');

// ---- Ausgabe.
// ---- Essen verteilen (Herzen regenerieren), siehe food.mjs.
addFood(g, W, H);

const rows = g.map((row) => row.join(''));
const out = `// Level w2-2 „Die Schlucht“ – erzeugt von js/data/levels/gen/w2-2.mjs (nicht von Hand ändern).
export default {
  id: 'w2-2',
  world: 2,
  theme: 'depths',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: { ${Object.entries(chests).map(([k, v]) => `'${k}': '${v}'`).join(', ')} },
  pick: 1,
};
`;
const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'w2-2.js');
writeFileSync(target, out);
console.log(`geschrieben: ${target} (${W} x ${H})`);
