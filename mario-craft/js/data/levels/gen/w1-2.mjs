// Generator für Level w1-2 „Wald und Höhlen“ (Welt 1, overworld, 150 × 42).
// Aufruf: node js/data/levels/gen/w1-2.mjs  → schreibt js/data/levels/w1-2.js.
// Hauptweg: Wald → Schacht (Leiter) → Eingangshalle → Korridor mit Bett → Schleimnische
// → Schlucht mit Plattformen und Ranke → Oberfläche rechts → Portal.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 150, H = 42;
const g = Array.from({ length: H }, () => Array(W).fill('.'));

const put = (c, r, ch) => { if (c >= 0 && c < W && r >= 0 && r < H) g[r][c] = ch; };
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch);
};
const hline = (c0, c1, r, ch) => fill(c0, r, c1, r, ch);
const vline = (c, r0, r1, ch) => fill(c, r0, c, r1, ch);
const gems = (list) => list.forEach(([c, r]) => put(c, r, 'o'));
// Baum: 2 hohe Stamm (Standfläche auf Zeile 11), Krone in Zeile 7–8 (Lücke darüber für den Sprung).
const tree = (x) => { vline(x, 12, 13, 'T'); hline(x - 1, x + 1, 7, 'Y'); hline(x - 2, x + 2, 8, 'Y'); };

// ---- Grundaufbau: Himmel oben, Gras auf Erde, Stein darunter, Grundgestein unten und an den Seiten.
hline(0, W - 1, 14, 'G');
fill(0, 15, W - 1, 16, '#');
fill(0, 17, W - 1, 40, 'S');
hline(0, W - 1, 41, 'Z');
vline(0, 0, 41, 'Z');
vline(W - 1, 0, 41, 'Z');

// ---- Oberwelt: Bäume, Teich, Pflanzen.
for (const x of [8, 14, 30, 36, 41, 56, 68, 88, 126, 141]) tree(x);
fill(19, 14, 24, 15, '~');          // Teich, zwei tief
hline(19, 24, 16, 'S');             // Becken
put(11, 13, ','); put(25, 13, ','); put(45, 13, ',');

// ---- Schacht: 2 breit, 20 tief (Zeilen 14–33), Leiter in der linken Spalte.
fill(46, 14, 47, 33, '.');
vline(46, 14, 33, 'H');

// ---- Eingangshalle (Zeilen 34–37) mit Wasserbecken.
fill(36, 34, 60, 37, '.');
hline(52, 55, 37, '~');

// ---- Korridor zum Bett (Zeilen 36–38), bis zur Schluchtwand.
fill(61, 36, 95, 38, '.');
put(82, 38, 'J');                   // Schleimblock am Boden der Schleimnische

// ---- Schleimnische (hoch bis Zeile 26) mit Kammer darüber und Vorsprung (Stufe bei Zeile 30–31).
fill(81, 26, 90, 29, '.');
fill(81, 30, 83, 37, '.');
hline(84, 90, 30, 'S');
hline(84, 90, 31, 'S');

// ---- Schlucht: offen bis zur Oberfläche, Boden Zeile 39.
fill(96, 14, 119, 38, '.');
hline(97, 100, 36, 'B'); hline(97, 100, 37, 'B');   // A
hline(103, 106, 33, 'B'); hline(103, 106, 34, 'B'); // B
hline(109, 112, 30, 'B'); hline(109, 112, 31, 'B'); // C
hline(114, 117, 27, 'B'); hline(114, 117, 28, 'B'); // D
hline(116, 119, 24, 'B'); hline(116, 119, 25, 'B'); // E
vline(119, 13, 22, 'V');                             // Ranke an der Schluchtwand

// ---- Erze und Licht in den Wänden / Decken.
put(38, 33, '2'); put(58, 33, '2'); put(61, 33, '1'); put(72, 34, '1');
put(95, 20, '1'); put(120, 20, '2');
for (const [c, r] of [[44, 37], [50, 37], [68, 37], [86, 37], [82, 27], [101, 33], [113, 26], [128, 13]]) put(c, r, '|');

// ---- Truhen (Inhalt in der Level-Datei), Bett, Start, Portal.
const chests = { '27,14': 'emeralds', '37,37': 'bow', '39,37': 'pick_stone', '63,38': 'apple' };
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r, '?');
}
put(75, 38, 'K');
put(3, 13, 'P');
put(135, 13, 'F');

// ---- Gegner (auf festem Boden, Zelle darunter fest).
for (const [c, r] of [[12, 13], [33, 13], [58, 13], [57, 37], [64, 38]]) put(c, r, 'z');
put(88, 38, 's');
put(93, 38, 'c');
put(108, 38, 'r');

// ---- Smaragde (entlang des Weges) und Diamanten.
gems([
  [5, 11], [6, 11], [11, 11], [12, 11], [16, 11], [17, 11], [25, 11], [26, 11], [27, 11], [28, 11], [33, 11], [34, 11],
  [47, 18], [47, 22], [47, 26], [47, 30],
  [40, 35], [41, 35], [44, 35], [45, 35], [48, 35], [49, 35], [56, 35], [57, 35],
  [64, 36], [66, 36], [70, 36], [73, 36], [77, 36], [91, 36],
  [81, 33], [83, 33], [81, 28], [83, 28],
  [98, 34], [100, 34], [104, 31], [106, 31], [110, 28], [112, 28], [114, 25], [115, 25],
  [122, 12], [123, 12], [130, 12], [131, 12], [133, 12], [134, 12], [136, 12], [137, 12],
]);
put(21, 12, '*');   // frei über dem Teich, auf dem Weg
put(105, 31, '*');  // auf der Schlucht-Plattform B
put(88, 28, '*');   // Umweg über den Schleimblock (Schleimnische, Kammer)

// ---- Ausgabe.
const rows = g.map((row) => row.join(''));
const out = `// Level w1-2 „Wald und Höhlen“ – erzeugt von js/data/levels/gen/w1-2.mjs (nicht von Hand ändern).
export default {
  id: 'w1-2',
  world: 1,
  theme: 'overworld',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: { ${Object.entries(chests).map(([k, v]) => `'${k}': '${v}'`).join(', ')} },
  pick: 0,
};
`;
const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'w1-2.js');
writeFileSync(target, out);
console.log(`geschrieben: ${target} (${W} x ${H})`);
