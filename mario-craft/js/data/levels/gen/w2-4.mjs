// Generator für Level w2-4 „Dreikopf-Kerker“ (Boss-Level, Welt 2, depths, 140 × 50).
// Aufruf: node js/data/levels/gen/w2-4.mjs  → schreibt js/data/levels/w2-4.js.
// Weg: kurze Oberfläche (links) → Schacht → vier Dungeon-Gänge, jeweils nach rechts, durch Leitern
// verbunden (Band 1 bis 4, Zeilen 19–21, 27–29, 35–37, 44–46) → Arena unten rechts (Spalten 100–137).
// Bett und Truhen liegen vor der Arena. Die Arena-Tür `:` (Spalte 99) wird beim Bosskampf zur Barriere.
import { writeFileSync } from 'node:fs';
import { ensureHeadroom } from './headroom.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 140, H = 50;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

// ---- Zeichenhilfen (Spalte c, Zeile r; r = 0 oben) ----
const put = (c, r, ch) => { if (c >= 0 && c < W && r >= 0 && r < H) g[r][c] = ch; };
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch);
};
const cells = (list, ch) => list.forEach(([c, r]) => put(c, r, ch));

// ---- Terrain ----
// Rand: links/rechts/unten Grundgestein. Fels überall ab Zeile 14, Himmel nur über dem Eingang links.
fill(0, 0, 0, H - 1, 'Z');
fill(W - 1, 0, W - 1, H - 1, 'Z');
fill(0, H - 1, W - 1, H - 1, 'Z');
fill(1, 14, W - 2, H - 2, 'S');
fill(22, 0, W - 2, 13, 'S');        // Decke über dem Dungeon (die Oberfläche endet bei Spalte 19)
// Kurze Oberfläche: Gras auf Erde, Zeilen 14–16.
fill(1, 14, 19, 14, 'G');
fill(1, 15, 19, 16, '#');

// ---- Gänge und Schächte (Luft) ----
fill(20, 14, 21, 18, '.');          // Eingangsschacht vom Gras
fill(20, 19, 57, 21, '.');          // Band 1 (3 hoch), Boden Zeile 22
fill(56, 22, 57, 26, '.');          // Schacht A zu Band 2
fill(54, 27, 90, 29, '.');          // Band 2 (3 hoch), Boden Zeile 30
fill(88, 30, 89, 34, '.');          // Schacht B zu Band 3
fill(60, 35, 89, 37, '.');          // Band 3 (3 hoch), Boden Zeile 38
fill(60, 38, 61, 43, '.');          // Schacht C zu Band 4
fill(60, 44, 99, 46, '.');          // Band 4 (3 hoch), Boden Zeile 47, endet an der Arena-Tür

// Böden und Decken aus Steinziegel / Bruchstein (nur Deko, die Gänge bleiben unverändert).
fill(22, 22, 55, 22, 'B');
fill(54, 30, 87, 30, 'B');
fill(62, 38, 87, 38, 'B');
fill(60, 47, 99, 47, 'B');
fill(58, 26, 90, 26, 'C');          // Decke Band 2 (Bruchstein)
fill(62, 34, 87, 34, 'C');          // Decke Band 3 (Schacht B bleibt frei)
fill(62, 43, 99, 43, 'C');          // Decke Band 4

// Lavasee im Fels, nur durch Graben erreichbar (Abstand zum Schacht B).
fill(93, 31, 97, 33, 'L');

// ---- Boss-Arena (Spalten 100–137, Zeilen 28–47) ----
fill(100, 28, 137, 28, 'X');        // Decke
fill(100, 28, 100, 47, 'X');        // linke Wand
fill(137, 28, 137, 47, 'X');        // rechte Wand
fill(101, 29, 136, 46, '.');        // Innenraum, 36 × 18
fill(101, 47, 136, 47, 'B');        // Boden aus Steinziegel, keine Lava
put(100, 44, '.'); put(100, 45, '.'); put(100, 46, '.');   // Eingang von links (3 hoch)
// Plattformen (Slabs, nur von oben betretbar): Stufen von 4 zu 4 Zeilen.
fill(104, 43, 108, 43, '=');
fill(112, 39, 116, 39, '=');
fill(124, 35, 128, 35, '=');

// ---- Leitern (nach dem Ausheben) ----
fill(20, 14, 20, 21, 'H');          // Eingangsschacht
fill(56, 22, 56, 29, 'H');          // Schacht A
fill(88, 30, 88, 37, 'H');          // Schacht B
fill(60, 38, 60, 45, 'H');          // Schacht C

// ---- Dekoration, Licht und Pflanzen ----
cells([[4, 13], [10, 13]], ',');
cells([[17, 13]], '|');
cells([[24, 19], [48, 19]], '|');   // Fackeln Band 1
cells([[74, 27]], '|');             // Fackel Band 2
cells([[70, 35]], '|');             // Fackel Band 3
cells([[96, 44]], '|');             // Fackel Band 4
cells([[103, 30], [134, 30]], '|'); // Fackeln Arena
cells([[118, 46]], '|');

// ---- Erze (nur Deko oder Geheimnis; Gold und Erz in der Wand brauchen Hacke) ----
cells([[28, 18], [46, 18]], '2');   // Eisen in der Decke von Band 1
cells([[24, 18]], '1');             // Kohle
cells([[74, 40], [40, 25]], '1');   // Kohle im Fels (Geheimnis)
cells([[45, 24]], '3');             // Gold im Fels (Geheimnis, Band 1 nach unten graben)

// ---- Smaragde (Gruppen entlang des Weges) ----
const gems = [
  [5, 13], [6, 13], [7, 13], [12, 13], [13, 13],                       // Oberfläche
  [24, 21], [25, 21], [26, 21], [38, 21], [39, 21], [52, 21], [53, 21], // Band 1
  [58, 28], [59, 28], [60, 28], [64, 28], [65, 28], [72, 28], [73, 28], [80, 28], [81, 28], // Band 2
  [62, 36], [63, 36], [66, 36], [67, 36], [78, 36], [79, 36], [84, 36], [85, 36],          // Band 3
  [62, 45], [63, 45], [64, 45], [70, 45], [71, 45], [72, 45], [88, 45], [89, 45], [90, 45], [91, 45], // Band 4
  [106, 42], [107, 42], [114, 38], [115, 38], [126, 34], [127, 34],    // Arena (auf den Slabs)
];
cells(gems, 'o');

// ---- Diamanten (genau 3) ----
put(68, 28, '*');                   // Band 2, frei
put(86, 36, '*');                   // Band 3, frei
put(78, 43, '4');                   // Diamanterz in der Decke von Band 4: braucht Eisenhacke (Truhe in Band 2)

// ---- Truhen (Inhalt in `chests`, in der Decke über dem Gang) ----
const chests = {
  '34,18': 'armor',                 // Band 1, vor dem ersten Skelett
  '62,26': 'bow',                   // Band 2, vor dem ersten Skelett
  '82,26': 'pick_iron',             // Band 2: Eisenhacke für das Diamanterz
  '64,34': 'apple',                 // Band 3
  '66,43': 'emeralds',              // Band 4
};
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r, '?');
}

// ---- Bett vor der Arena, Start, Portal, Boss ----
put(92, 46, 'K');
put(2, 13, 'P');
put(131, 46, 'F');                  // Portal am Arena-Boden, rechts
put(121, 38, '@');                  // Dreikopf, 8 Zeilen über dem Boden, Mitte-rechts

// ---- Gegner (alle auf festem Boden) ----
cells([[48, 21]], 'r');             // Spinne, Band 1
cells([[62, 30]], 'M');             // Spawner im Boden von Band 2
cells([[70, 29]], 's');             // Skelett, Band 2
cells([[78, 29]], 'c');             // Zischer, Band 2
cells([[76, 34]], 'M');             // Spawner in der Decke von Band 3
cells([[66, 37]], 's');             // Skelett, Band 3
cells([[72, 37]], 'r');             // Spinne, Band 3
cells([[82, 46]], 'c');             // Zischer, Band 4

// ---- Arena-Tür (Luft, wird beim Bosskampf zur Barriere) ----
for (let r = 44; r <= 46; r++) put(99, r, ':');

// ---- Ausgabe ----
// ---- Kopffreiheit vor Skeletten (Pfeilen ausweichen = springen können), siehe headroom.mjs.
ensureHeadroom(g, W, H);

const rows = g.map((line) => line.join(''));
const chestLines = Object.entries(chests).map(([k, v]) => `  '${k}': '${v}',`).join('\n');
const out = `// Level w2-4 „Dreikopf-Kerker“ (Boss-Level, Welt 2). Erzeugt von js/data/levels/gen/w2-4.mjs – nicht von Hand ändern.
export default {
  id: 'w2-4',
  world: 2,
  theme: 'depths',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: {
${chestLines}
  },
  boss: 'dreikopf',
  pick: 1,
};
`;

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'w2-4.js');
writeFileSync(target, out);
console.log(`geschrieben: ${target} (${W} x ${H})`);
