// Generator für Level w2-3 „Lavasee“ (Welt 2, depths, 180 × 56).
// Aufruf: node js/data/levels/gen/w2-3.mjs  → schreibt js/data/levels/w2-3.js.
// Hauptweg: Oberfläche → Schacht (Leiter) → Eingangshalle (Truhe Rüstung) → Korridor (Bogen)
// → Zischer-Halle (Truhe Eisenhacke) → Schacht → Ufer → Lavasee über Obsidian-Brücken und Slabs
// → Ufer rechts mit Bett → Leitern hoch → Oberfläche rechts → Portal.
import { writeFileSync } from 'node:fs';
import { addFood } from './food.mjs';
import { ensureHeadroom } from './headroom.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 180, H = 56;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

// Grundgesteinswand (Oberfläche sperren): Spalte WALL.c von Zeile 0 bis WALL.d. c = 0 → keine Wand.
const WALL = { c: 62, d: 25 };

const put = (c, r, ch) => { if (c >= 0 && c < W && r >= 0 && r < H) g[r][c] = ch; };
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch);
};
const hline = (c0, c1, r, ch) => fill(c0, r, c1, r, ch);
const vline = (c, r0, r1, ch) => fill(c, r0, c, r1, ch);
const gems = (list) => list.forEach(([c, r]) => put(c, r, 'o'));

// ---- Grundaufbau: Himmel, Gras auf Erde, Stein darunter, Grundgestein unten und an den Seiten.
hline(0, W - 1, 14, 'G');
fill(0, 15, W - 1, 16, '#');
fill(0, 17, W - 1, 54, 'S');
hline(0, W - 1, 55, 'Z');
vline(0, 0, 55, 'Z');
vline(W - 1, 0, 55, 'Z');

// ---- Dungeon-Mauerwerk (Steinziegel) als Blöcke, danach werden Hallen und Gänge herausgeschnitten.
fill(34, 23, 58, 31, 'B');   // Eingangshalle H1 mit Decke und Boden
fill(57, 25, 77, 29, 'B');   // Korridor C1 (Decke Zeile 25, Boden Zeile 29)
fill(76, 18, 100, 31, 'B');  // Zischer-Halle H2 mit Wänden, Decke und Boden
fill(100, 18, 100, 31, 'B'); // rechte Wand von H2 (verhindert Absturz in den See)

// ---- Oberfläche: kleine Stufe aus Bruchstein und Pflanzen.
fill(20, 13, 23, 13, 'C');
put(7, 13, ',');
put(18, 13, ',');

// ---- Abstieg: Schacht 2 breit, Leiter, von der Oberfläche in die Eingangshalle.
fill(36, 14, 37, 23, '.');
vline(36, 14, 29, 'H');

// ---- Eingangshalle H1 (Zeilen 24–29) und Korridor C1 (Zeilen 26–28, 3 hoch).
fill(36, 24, 56, 29, '.');
fill(57, 26, 76, 28, '.');

// ---- Zischer-Halle H2 (Zeilen 19–30, 11 hoch).
fill(77, 19, 99, 30, '.');

// ---- Schacht H2 → Ufer (Leiter in Spalte 92), Ufer-Höhle darunter.
fill(92, 31, 93, 40, '.');
vline(92, 31, 40, 'H');
fill(88, 32, 99, 40, '.');

// ---- Lavasee-Kammer: Luft Zeilen 31–40, Oberfläche des Sees Zeile 42, Boden Zeile 51.
fill(100, 31, 146, 40, '.');
fill(100, 41, 142, 41, '.');   // Luft über dem See (Brücken liegen auf Zeile 41)
fill(100, 42, 142, 50, 'L');   // Lava
// Ufer rechts (Spalten 143–146) bleibt fester Stein, Zeile 41 = Boden.

// ---- Obsidian-Brücken (X) und Slabs (=) über den See. Stehfläche jeweils eine Zeile darüber.
fill(103, 41, 105, 41, 'X');   // I1
fill(109, 41, 111, 41, 'X');   // I2
fill(117, 41, 119, 41, 'X');   // I3
fill(123, 41, 125, 41, 'X');   // I4
fill(131, 41, 133, 41, 'X');   // I5
fill(137, 41, 139, 41, 'X');   // I6
fill(113, 39, 115, 39, '=');   // Slab über Lücke I2–I3
fill(127, 39, 129, 39, '=');   // Slab über Lücke I4–I5

// ---- Aufstieg rechts: großer Schacht (Zeilen 14–40), Leiter in Spalte 150, Slabs als Rast.
fill(147, 15, 160, 40, '.');   // Zeile 14 bleibt Gras (Dach), nur die Leiterspalte ist offen
vline(150, 14, 40, 'H');
put(150, 13, 'H');   // Ausstieg auf die Oberfläche
fill(152, 28, 156, 28, '=');
fill(152, 20, 156, 20, '=');

// ---- Geheimtasche unter C1: nur mit Graben erreichbar (Boden über ihr wird abgebaut).
fill(66, 30, 67, 31, '.');

// ---- Erze in den Wänden (Kohle, Eisen), Erz-Diamanten (je Hacke Eisen), Getarnte Steine.
put(42, 23, '1'); put(60, 25, '2'); put(120, 30, '1');
put(95, 31, '4');   // Diamanterz am Boden der Zischer-Halle (über dem Ufer)
put(161, 30, '4');  // Diamanterz in der Wand des Aufstiegs
put(50, 23, '5'); put(76, 22, '5'); put(100, 25, '5');  // getarnte Steine (Silberfischchen)

// ---- Fallen: TNT in Decke und Geheimtasche-Wand (nicht auf dem Hauptweg), Spawner in Decken.
put(90, 18, '!');
put(68, 30, '!');
put(46, 23, 'M');   // Spawner über der Eingangshalle
put(84, 18, 'M');   // Spawner über der Zischer-Halle

// ---- Fackeln.
for (const [c, r] of [[53, 24], [74, 26], [88, 20], [115, 31], [155, 33], [152, 15]]) put(c, r, '|');

// ---- Truhen (Inhalt in der Level-Datei). Keine Truhe auf dem Weg blockiert den Gang.
const chests = {
  '48,29': 'armor',        // Eingangshalle: vor dem ersten Skelett und Zischer
  '62,28': 'bow',          // Korridor C1
  '78,30': 'emeralds',     // Eingang der Zischer-Halle
  '86,30': 'pick_iron',    // Zischer-Halle, Voraussetzung für die Erz-Diamanten
  '156,40': 'pick_diamond',// Ufer rechts, am Aufstieg
};
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r, '?');
}

// ---- Start, Bett, Portal.
put(3, 13, 'P');
put(149, 40, 'K');          // Bett nach dem Lavasee, vor dem Aufstieg
put(165, 13, 'F');          // Portal nahe der Oberfläche rechts

// ---- Gegner (alle auf festem Boden).
for (const [c, r, ch] of [
  [27, 13, 'z'],   // Zombie auf der Oberfläche
  [52, 29, 'z'],   // Zombie in der Eingangshalle
  [72, 28, 's'],   // Skelett im Korridor
  [84, 30, 'c'],   // Zischer in der Zischer-Halle
  [98, 40, 's'],   // Skelett am Ufer, schießt über den See
  [154, 40, 'r'],  // Spinne im Aufstieg
  [157, 40, 'c'],  // Zischer im Aufstieg
]) put(c, r, ch);

// ---- Smaragde (Gruppen entlang des Weges) und Diamanten.
gems([
  // Oberfläche
  [4, 13], [5, 13], [9, 13], [10, 13], [13, 13], [14, 13], [30, 13], [31, 13], [32, 13],
  // Eingangshalle
  [40, 28], [41, 28], [44, 28], [45, 28], [52, 28], [53, 28],
  // Korridor
  [60, 27], [61, 27], [64, 27], [65, 27], [70, 27], [71, 27],
  // Zischer-Halle
  [80, 27], [81, 27], [88, 27], [89, 27], [94, 25], [95, 25], [82, 22], [83, 22],
  // Ufer und Brücken
  [90, 39], [91, 39], [96, 39], [97, 39],
  [104, 39], [110, 39], [114, 37], [118, 39], [124, 39], [128, 37], [132, 39], [138, 39],
  // Aufstieg
  [148, 38], [149, 38], [152, 27], [154, 27], [157, 19], [159, 19], [152, 16], [153, 16],
]);
put(67, 31, '*');   // Diamant in der Geheimtasche unter C1 (nur mit Graben)
put(146, 33, 'o');  // Reserve-Smaragd am Ufer-Eingang der Kammer

// ---- Grundgesteinswand über der Oberfläche (von Zeile 0 bis in den Fels), siehe NACHTRAG.
if (WALL.c > 0) for (let r = 0; r <= WALL.d; r++) put(WALL.c, r, 'Z');

// ---- Ausgabe.
// ---- Essen verteilen (Herzen regenerieren), siehe food.mjs.
addFood(g, W, H);

// ---- Kopffreiheit vor Skeletten (Pfeilen ausweichen = springen können), siehe headroom.mjs.
ensureHeadroom(g, W, H);

const rows = g.map((row) => row.join(''));
const out = `// Level w2-3 „Lavasee“ – erzeugt von js/data/levels/gen/w2-3.mjs (nicht von Hand ändern).
export default {
  id: 'w2-3',
  world: 2,
  theme: 'depths',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: { ${Object.entries(chests).map(([k, v]) => `'${k}': '${v}'`).join(', ')} },
  pick: 1,
};
`;
const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'w2-3.js');
writeFileSync(target, out);
console.log(`geschrieben: ${target} (${W} x ${H})`);
