// Generator für Level w3-2 „Glutbrücke“ (Welt 3, nether, 190 × 54).
// Aufruf: node js/data/levels/gen/w3-2.mjs  → schreibt js/data/levels/w3-2.js.
// Hauptweg: Oberfläche links → Schacht (Leiter) → Halle mit Bogen-Truhe und Skelett → Brücke über den
// Lavasee (Lücken ≤ 3, Pfeiler mit Zischern, Bett in der Mitte) → Schleim und Leiter nach oben → Portal rechts.
import { writeFileSync } from 'node:fs';
import { addFood } from './food.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 190, H = 54;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

const put = (c, r, ch) => { if (c >= 0 && c < W && r >= 0 && r < H) g[r][c] = ch; };
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch);
};
const hline = (c0, c1, r, ch) => fill(c0, r, c1, r, ch);
const vline = (c, r0, r1, ch) => fill(c, r0, c, r1, ch);
const gems = (list) => list.forEach(([c, r]) => put(c, r, 'o'));

// ---- Grundaufbau: Netherrack ab Zeile 14 (Oberfläche), Grundgestein unten und an den Seiten.
fill(0, 14, W - 1, 52, 'N');
hline(0, W - 1, 53, 'Z');
vline(0, 0, 53, 'Z');
vline(W - 1, 0, 53, 'Z');

// ---- Schacht von der Oberfläche in die Halle: 2 breit, Leiter in der linken Spalte.
fill(24, 13, 25, 33, '.');
vline(24, 13, 33, 'H');

// ---- Halle unter der Oberfläche (Zeilen 28–33), Ausgang nach rechts in die Glutkaverne.
fill(26, 28, 46, 33, '.');

// ---- Glutkaverne über dem Lavasee: Decke Zeile 28, Brücke auf Zeile 34, Lava darunter (Zeilen 35–50).
fill(47, 29, 160, 33, '.');
for (const c of [52, 74, 92, 116, 138, 150]) put(c, 28, 'U');  // Glowstone in der Decke
fill(47, 35, 140, 50, 'L');                                    // Lavasee
hline(47, 140, 34, 'R');                                       // Netherziegel-Brücke
for (const [a, b] of [[54, 56], [80, 82], [108, 110], [133, 135]]) hline(a, b, 34, '.'); // Lücken (≤ 3)
for (const [a, b] of [[66, 70], [95, 99], [120, 124]]) fill(a, 35, b, 50, 'N');       // Pfeiler unter der Brücke
for (const [c, r] of [[50, 29], [90, 29], [112, 29], [146, 29]]) put(c, r, '|');

// ---- Geheimnis: Stollen von der Schachtwand nach links (ohne Graben nicht erreichbar).
put(22, 30, '4');   // Diamanterz (braucht Eisen, Level-Hacke 2)
put(22, 31, '?');   // Geheimtruhe (Apfel), nur durch Graben

// ---- Aufstieg rechts: Schleimblock am Boden, Schacht mit Leiter bis zur Oberfläche.
fill(156, 15, 158, 32, '.');
put(157, 33, 'J');
vline(158, 14, 23, 'H');

// ---- Oberfläche rechts (Portal), Start.
put(3, 13, 'P');
put(180, 13, 'F');
put(101, 33, 'K');  // Bett nach dem schwierigen Brückenteil, in der Mitte des Weges

// ---- Truhen (Inhalt in der Level-Datei). Bogen vor dem ersten Skelett und Zischer.
const chests = { '30,33': 'bow', '44,33': 'emeralds', '146,33': 'pick_diamond', '22,31': 'apple' };
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r, '?');
}

// ---- Gegner: Skelett in der Halle, Zischer auf Pfeilern (nach dem Bogen), Glutgeister, Skelett, Schleim.
for (const [c, r, ch] of [[40, 33, 's'], [68, 33, 'c'], [60, 30, 'g'], [112, 30, 'g'], [122, 33, 'c'], [128, 33, 's'], [150, 33, 'm']]) {
  put(c, r, ch);
}

// ---- Smaragde (entlang des Weges) und Diamanten (1 Erz, 2 frei; genau 3).
gems([
  [5, 13], [6, 13], [9, 13], [10, 13], [14, 13], [15, 13],
  [25, 18], [25, 22], [25, 26],
  [30, 32], [31, 32], [36, 32], [37, 32], [41, 32], [42, 32],
  [50, 32], [51, 32], [58, 32], [59, 32], [60, 32], [74, 32], [75, 32], [76, 32],
  [86, 32], [87, 32], [88, 32], [104, 32], [105, 32], [114, 32], [115, 32], [128, 32], [129, 32], [130, 32],
  [143, 32], [144, 32], [147, 32], [148, 32], [152, 32], [153, 32],
  [156, 26], [156, 20],
  [165, 13], [166, 13], [170, 13], [171, 13], [175, 13], [176, 13], [184, 13],
]);
put(100, 32, '*');  // Diamant über der Brücke
put(150, 31, '*');  // Diamant in der Kaverne am Ende der Brücke

// Grundgesteinswand von der Oberfläche bis in den Fels (Spalte 44, Tiefe 24): die Oberfläche ist gesperrt,
// der Weg führt durch die Halle und die Kaverne. Passt zu wall.mjs (Portal bleibt ohne Graben erreichbar).
for (let r = 0; r <= 24; r++) put(44, r, 'Z');

// ---- Ausgabe.
// ---- Essen verteilen (Herzen regenerieren), siehe food.mjs.
addFood(g, W, H);

const rows = g.map((row) => row.join(''));
const out = `// Level w3-2 „Glutbrücke“ – erzeugt von js/data/levels/gen/w3-2.mjs (nicht von Hand ändern).
export default {
  id: 'w3-2',
  world: 3,
  theme: 'nether',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: { ${Object.entries(chests).map(([k, v]) => `'${k}': '${v}'`).join(', ')} },
  pick: 2,
};
`;
const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'w3-2.js');
writeFileSync(target, out);
console.log(`geschrieben: ${target} (${W} x ${H})`);
