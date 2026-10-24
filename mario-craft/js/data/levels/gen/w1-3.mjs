// Generator für Level w1-3 „Der erste Dungeon“ (Welt 1, Theme overworld).
// Aufruf: node js/data/levels/gen/w1-3.mjs  → schreibt js/data/levels/w1-3.js.
// Aufbau: Oberfläche links (Spalten 1–15), Rampe aus Bruchstein (16–29), Eingang (Zeilen 26–27),
// Dungeon im Berg (Spalten 30–134, Bergdecke Zeile 6), Aufstieg im Leiterschacht Spalte 123 und
// Tunnel zur Oberfläche rechts (Spalten 135–158), Portal bei (150, 13).
// Hauptweg ohne Graben: Eingang → Raum A → Gang → Raum B (Hacke) → Leiter → Raum C → Gang D (TNT)
// → Raum D → Leiter → Raum E → Schleimschacht → Leiter → Tunnel → Portal.
import { writeFileSync } from 'node:fs';
import { ensureHeadroom } from './headroom.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 160;
const H = 52;
const g = Array.from({ length: H }, () => Array(W).fill('S'));

const put = (c, r, ch) => {
  if (c >= 0 && c < W && r >= 0 && r < H) g[r][c] = ch;
};
const fill = (c0, r0, c1, r1, ch) => {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(c, r, ch);
};
const dots = (list, ch) => {
  for (const [c, r] of list) put(c, r, ch);
};
const isAir = (c, r) => c >= 0 && c < W && r >= 0 && r < H && g[r][c] === '.';

// 1. Rand, Himmel, Oberfläche, Rampe, Berg, Schacht
fill(0, 0, 0, H - 1, 'Z');
fill(W - 1, 0, W - 1, H - 1, 'Z');
fill(0, H - 1, W - 1, H - 1, 'Z');
fill(1, 0, W - 2, 13, '.'); // Himmel
fill(1, 14, 15, 14, 'G'); // Oberfläche links
fill(1, 15, 15, 16, '#');
for (let c = 16; c <= 29; c++) { // Rampe aus Bruchstein, Stufe pro Spalte
  const top = c - 1;
  fill(c, 14, c, top - 1, '.');
  fill(c, top, c, H - 2, 'C');
}
fill(30, 6, 134, H - 2, 'S'); // Berg (Decke Zeile 6), darüber Himmel
fill(135, 14, 158, 14, 'G'); // Oberfläche rechts
fill(135, 15, 158, 16, '#');
fill(123, 12, 134, 13, '.'); // Tunnel zur Oberfläche rechts
fill(123, 14, 123, 39, 'H'); // Aufstiegsleiter

// 2. Hohlräume: Eingang, Räume, Gänge
fill(30, 26, 39, 27, '.'); // Eingang
fill(40, 22, 52, 27, '.'); // Raum A
fill(53, 26, 62, 27, '.'); // Gang AB
fill(63, 22, 75, 27, '.'); // Raum B
fill(64, 34, 84, 39, '.'); // Raum C
fill(85, 37, 95, 39, '.'); // Gang D (3 hoch)
fill(96, 32, 108, 39, '.'); // Raum D (Spawner)
fill(103, 44, 117, 47, '.'); // Raum E
fill(118, 44, 122, 47, '.'); // Gang E2
fill(123, 40, 123, 47, '.'); // Schacht über dem Schleim

// 3. Leitern (Abstieg) und Wände aus Steinziegeln
fill(70, 27, 70, 39, 'H'); // Schacht B → C
fill(102, 39, 102, 47, 'H'); // Schacht D → E
for (let r = 16; r <= H - 2; r++) {
  for (let c = 30; c <= 134; c++) {
    if (g[r][c] === 'S' && (isAir(c - 1, r) || isAir(c + 1, r) || isAir(c, r - 1) || isAir(c, r + 1))) {
      g[r][c] = 'B';
    }
  }
}

// 4. Besondere Blöcke
put(123, 48, 'J'); // Schleimblock am Schachtboden
fill(99, 36, 101, 36, '='); // Plattform für das Diamant-Podest
put(109, 35, 'M'); // Monster-Spawner in der Wand von Raum D
put(90, 39, '!'); // TNT im Gang D (umgehbar über der Kante)
dots([[74, 40], [76, 40]], '4'); // Diamanterz (Eisenhacke nötig)
dots([[91, 36], [92, 36], [93, 36]], '2'); // Eisenerz (Steinhacke nötig)
dots([[55, 25], [56, 25]], '1'); // Kohle
dots([[86, 36], [87, 36], [88, 36]], '5'); // getarnter Stein

// 5. Fackeln, Deko
dots([[33, 26], [42, 22], [50, 22], [58, 26], [66, 22], [74, 22], [66, 34], [82, 34], [98, 32], [106, 32], [106, 44], [116, 44]], '|');
dots([[8, 13], [12, 13], [140, 13]], ',');

// 6. Spieler, Ziel, Bett
put(2, 13, 'P');
put(150, 13, 'F');
put(78, 39, 'K');
put(100, 35, '*'); // freier Diamant auf dem Podest

// 7. Truhen
const chests = { '49,27': 'armor', '72,27': 'pick_iron', '112,47': 'emeralds', '111,39': 'cake' };
for (const key of Object.keys(chests)) {
  const [c, r] = key.split(',').map(Number);
  put(c, r, '?');
}

// 8. Gegner
dots([[46, 27], [76, 39], [120, 47]], 'z');
dots([[66, 27], [104, 39], [108, 47]], 's');
dots([[93, 39], [116, 47]], 'c');
dots([[86, 39], [88, 39]], 'f');

// 9. Smaragde in Gruppen entlang des Weges
dots([[4, 13], [6, 13], [11, 13], [12, 13], [13, 13]], 'o');
dots([[31, 27], [32, 27], [36, 27], [37, 27]], 'o');
dots([[41, 27], [42, 27], [43, 27], [44, 27]], 'o');
dots([[55, 27], [56, 27], [58, 27], [59, 27]], 'o');
dots([[64, 27], [65, 27], [68, 27], [69, 27], [74, 27], [75, 27]], 'o');
dots([[66, 39], [67, 39], [68, 39], [72, 39], [73, 39], [74, 39]], 'o');
dots([[86, 38], [87, 38], [88, 38], [90, 38], [92, 38]], 'o');
dots([[97, 39], [98, 39], [100, 39], [101, 39], [105, 39], [106, 39], [107, 39]], 'o');
dots([[104, 47], [105, 47], [106, 47], [110, 47], [111, 47], [114, 47], [115, 47]], 'o');
dots([[118, 47], [119, 47]], 'o');
dots([[125, 13], [126, 13]], 'o');
dots([[137, 13], [138, 13], [139, 13], [142, 13], [143, 13], [144, 13]], 'o');

// Grundgesteinswand von oben bis in den Fels: die Oberfläche ist gesperrt, der Weg führt durch die Tiefe.
for (let r = 0; r <= 37; r++) put(80, r, 'Z');

// Ausgabe
// ---- Kopffreiheit vor Skeletten (Pfeilen ausweichen = springen können), siehe headroom.mjs.
ensureHeadroom(g, W, H);

const rows = g.map((r) => r.join(''));
const out = `// Generiert von js/data/levels/gen/w1-3.mjs. Nicht von Hand ändern, sondern den Generator anpassen.
export default {
  id: 'w1-3',
  world: 1,
  theme: 'overworld',
  rows: [
${rows.map((r) => `    '${r}',`).join('\n')}
  ],
  chests: {
${Object.entries(chests).map(([k, v]) => `    '${k}': '${v}',`).join('\n')}
  },
  pick: 0,
};
`;
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, '..', 'w1-3.js'), out);
console.log(`w1-3: ${W} x ${H} geschrieben`);
