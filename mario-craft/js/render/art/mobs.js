// Mob-Sprites (PLAN §7, PRD §5). Blickrichtung rechts, Füße unten, jede Zeile eines Frames gleich lang.
// Eckiger Blockstil: Körper aus Rechtecken oder Formen, die Kontur kommt per Code (outline).
// Zeichen '.' = transparent. Paletten: '#rrggbb' oder '#rrggbbaa'.

// ---------- Hilfsfunktionen ----------
const grid = (w, h, f) => {
  const out = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += f(x, y) || '.';
    out.push(s);
  }
  return out;
};
// Malt Rechtecke [x0, y0, x1, y1, Zeichen] (Grenzen inklusive); spätere Einträge überschreiben frühere.
const paint = (w, h, ops) => {
  const g = Array.from({ length: h }, () => new Array(w).fill('.'));
  for (const [x0, y0, x1, y1, ch] of ops) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) if (x >= 0 && x < w && y >= 0 && y < h) g[y][x] = ch;
    }
  }
  return g.map((r) => r.join(''));
};
// Pixelkette von (x0,y0) nach (x1,y1) als [x, y]-Liste.
const linePts = (x0, y0, x1, y1) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const out = [];
  for (let i = 0; i <= n; i++) out.push([Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n)]);
  return out;
};
// Pixelkette als Rechteck-Ops für paint().
const lineOps = (x0, y0, x1, y1, ch) => linePts(x0, y0, x1, y1).map(([x, y]) => [x, y, x, y, ch]);
// Kontur: gefüllte Pixel mit transparentem Nachbarn (oder am Rand) werden zu ch.
const outline = (g, ch = 'k') => {
  const h = g.length, w = g[0].length;
  return g.map((row, y) => row.split('').map((p, x) => {
    if (p === '.') return '.';
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      || g[y][x - 1] === '.' || g[y][x + 1] === '.' || g[y - 1][x] === '.' || g[y + 1][x] === '.';
    return edge ? ch : p;
  }).join(''));
};
const inEll = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

// ---------- Zischer (12×24) ----------
const ZISCHER_PAL = {
  k: '#14200f', g: '#5cb847', G: '#93dc6e', d: '#2f7a2c', D: '#1e4d1b',
  h: '#f2fff0', H: '#ffffff', e: '#dff5d6', E: '#c9e9bd', // Aufhellung für mob_zischer_fuse
};
const ZISCHER_LIGHT = { g: 'h', G: 'H', d: 'e', D: 'E' };
const ZISCHER_BODY = [
  [0, 0, 11, 19, 'g'],
  [1, 1, 2, 1, 'G'], [1, 2, 1, 2, 'G'],                     // Licht oben links
  [10, 1, 10, 18, 'd'], [1, 18, 9, 18, 'D'], [0, 19, 11, 19, 'D'],
  [2, 4, 3, 5, 'd'], [8, 3, 8, 3, 'd'], [9, 8, 10, 9, 'd'], [2, 11, 2, 12, 'd'], [5, 12, 6, 12, 'd'],
  [3, 16, 3, 16, 'd'], [8, 16, 9, 17, 'd'],                 // Flecken
  // Gesicht: Augenbrauen innen hoch, Augen, Mund als Bogen (Mitte oben, Ecken unten)
  [4, 3, 4, 3, 'k'], [7, 3, 7, 3, 'k'], [3, 4, 3, 4, 'k'], [8, 4, 8, 4, 'k'],
  [3, 5, 4, 6, 'k'], [7, 5, 8, 6, 'k'],
  [4, 9, 7, 9, 'k'], [3, 10, 3, 10, 'k'], [8, 10, 8, 10, 'k'],
];
// Vier kurze Stummelbeine (Zeilen 20–23); Frame 1 hebt die beiden mittleren an.
const ZISCHER_LEGS_A = [[1, 20, 2, 23, 'D'], [4, 20, 5, 23, 'D'], [7, 20, 8, 23, 'D'], [10, 20, 11, 23, 'D']];
const ZISCHER_LEGS_B = [[0, 20, 1, 23, 'D'], [6, 20, 7, 23, 'D'], [3, 20, 4, 22, 'D'], [9, 20, 10, 22, 'D']];
const zischer = (legs) => outline(paint(12, 24, [...ZISCHER_BODY, ...legs]));
const ZISCHER_F0 = zischer(ZISCHER_LEGS_A);
const ZISCHER_F1 = zischer(ZISCHER_LEGS_B);
const lighten = (g) => g.map((r) => r.replace(/[gGdD]/g, (c) => ZISCHER_LIGHT[c]));

// ---------- Zombie (14×28) ----------
const ZOMBIE_PAL = {
  k: '#18221d', s: '#8aa894', S: '#5f7d69', h: '#2a3328', t: '#41c4b2', T: '#23857a',
  p: '#2e3f63', P: '#1d2a45', r: '#6b1d18',
};
const ZOMBIE_TOP = [
  [3, 0, 10, 1, 'h'],                                       // Haare
  [3, 2, 10, 7, 's'], [10, 2, 10, 7, 'S'], [3, 7, 10, 7, 'S'], // Gesicht
  [4, 4, 5, 4, 'k'], [8, 4, 9, 4, 'k'],                     // Augen
  [5, 6, 8, 6, 'k'], [6, 7, 7, 7, 'r'],                     // Mund
  [5, 8, 8, 8, 'S'],                                        // Hals
  [2, 9, 11, 17, 't'], [10, 9, 11, 17, 'T'],                // zerrissenes Hemd
  [5, 11, 6, 12, 'S'], [8, 14, 9, 15, 'S'],                 // Risse: Haut scheint durch
  [3, 17, 3, 17, '.'], [6, 17, 8, 17, '.'],                 // ausgefranster Saum
  [11, 10, 13, 11, 's'], [11, 11, 13, 11, 'S'],             // Arme nach vorn
  [2, 18, 11, 18, 'P'],                                     // Hosenbund
];
const ZOMBIE_LEGS_A = [
  [3, 19, 5, 25, 'p'], [8, 19, 10, 25, 'p'], [3, 25, 5, 25, 'P'], [8, 25, 10, 25, 'P'],
  [3, 26, 5, 27, 'h'], [8, 26, 10, 27, 'h'],
];
const ZOMBIE_LEGS_B = [
  [2, 19, 4, 25, 'p'], [9, 19, 11, 25, 'p'], [2, 25, 4, 25, 'P'], [9, 25, 11, 25, 'P'],
  [2, 26, 4, 27, 'h'], [9, 26, 11, 27, 'h'],
];
const zombie = (legs) => outline(paint(14, 28, [...ZOMBIE_TOP, ...legs]));

// ---------- Skelett (14×28) ----------
const SKEL_PAL = { k: '#1c1c22', b: '#d9dbe0', B: '#a9adb8', d: '#3a3832', w: '#8a5a2b', l: '#e8e0c8' };
const SKEL_TORSO = [
  [3, 0, 10, 6, 'b'], [3, 0, 3, 0, '.'], [10, 0, 10, 0, '.'], // Schädel mit abgerundeten Ecken
  [10, 1, 10, 5, 'B'],
  [4, 2, 5, 3, 'd'], [8, 2, 9, 3, 'd'],                       // Augenhöhlen
  [7, 4, 7, 4, 'd'],                                          // Nase
  [4, 5, 9, 5, 'B'], [5, 5, 5, 5, 'd'], [7, 5, 7, 5, 'd'], [9, 5, 9, 5, 'd'], // Zähne mit Lücken
  [6, 7, 7, 7, 'B'],                                          // Hals
  [3, 8, 10, 8, 'b'], [3, 10, 10, 10, 'b'], [3, 12, 10, 12, 'b'], [3, 14, 10, 14, 'b'], [3, 16, 10, 16, 'b'], // Rippen
  [6, 8, 7, 17, 'B'],                                         // Wirbelsäule
  [3, 18, 10, 19, 'B'], [6, 19, 7, 19, '.'],                  // Becken mit Lücke
];
const SKEL_ARMS_HANG = [
  [1, 8, 2, 11, 'b'], [1, 12, 2, 12, '.'], [1, 13, 2, 17, 'b'],     // linker Arm mit Gelenk-Lücke
  [11, 8, 12, 11, 'b'], [11, 12, 12, 12, '.'], [11, 13, 12, 17, 'b'],
];
const SKEL_LEGS_A = [
  [4, 20, 5, 26, 'b'], [8, 20, 9, 26, 'b'], [4, 23, 5, 23, 'B'], [8, 23, 9, 23, 'B'],
  [3, 27, 5, 27, 'B'], [7, 27, 9, 27, 'B'],
];
const SKEL_LEGS_B = [
  [3, 20, 4, 26, 'b'], [9, 20, 10, 26, 'b'], [3, 23, 4, 23, 'B'], [9, 23, 10, 23, 'B'],
  [2, 27, 4, 27, 'B'], [9, 27, 11, 27, 'B'],
];
const skeleton = (f) => outline(paint(14, 28, [...SKEL_TORSO, ...SKEL_ARMS_HANG, ...(f === 0 ? SKEL_LEGS_A : SKEL_LEGS_B)]));
const SKEL_SHOOT_ARMS = [
  ...lineOps(2, 9, 9, 12, 'b'),                               // hinterer Arm zur Sehne
  ...lineOps(11, 9, 13, 12, 'B'),                             // vorderer Arm am Bogen
  ...lineOps(12, 3, 13, 6, 'w'), [13, 6, 13, 18, 'w'], ...lineOps(13, 18, 12, 21, 'w'), // Bogen
  ...lineOps(12, 3, 9, 12, 'l'), ...lineOps(9, 12, 12, 21, 'l'),                        // gespannte Sehne
  ...lineOps(1, 12, 8, 12, 'l'),                                                         // Pfeil
];
const skeletonShoot = () => outline(paint(14, 28, [...SKEL_TORSO, ...SKEL_LEGS_A, ...SKEL_SHOOT_ARMS]));

// ---------- Spinne (24×12) ----------
const SPIDER_PAL = { k: '#0d0810', b: '#3a2a45', c: '#241a2b', B: '#5b4670', l: '#4b3d56', r: '#ff2a2a' };
const spiderLegs = (f) => {
  const roots = [[3, 3], [7, 2], [13, 3], [18, 3], [3, 9], [7, 10], [13, 9], [18, 9]];
  const tips = f === 0
    ? [[0, 1], [4, 0], [10, 0], [21, 1], [1, 11], [5, 11], [11, 11], [22, 11]]
    : [[1, 0], [6, 1], [12, 0], [22, 0], [0, 10], [4, 11], [12, 11], [21, 11]];
  return paint(24, 12, roots.flatMap(([x0, y0], i) => lineOps(x0, y0, tips[i][0], tips[i][1], 'l')));
};
const spiderBody = (x, y) => {
  if (inEll(x, y, 16, 5.5, 3.2, 2.7)) return (y === 4 && (x === 15 || x === 17)) ? 'r' : 'b'; // Kopf mit roten Augen
  if (inEll(x, y, 6, 6, 4.6, 3.9)) {                                                            // Hinterleib
    if ((x === 4 && y === 5) || (x === 7 && y === 7) || (x === 5 && y === 2)) return 'B';
    return x + y > 12 ? 'c' : 'b';
  }
  if (inEll(x, y, 11.5, 6, 2.4, 2.2)) return 'b';                                               // Brustteil
  if (inEll(x, y, 16, 5.5, 3.8, 3.3) || inEll(x, y, 6, 6, 5.4, 4.7) || inEll(x, y, 11.5, 6, 3, 2.8)) return 'k';
  return null;
};
const spider = (f) => {
  const legs = spiderLegs(f);
  return grid(24, 12, (x, y) => spiderBody(x, y) || legs[y][x]);
};

// ---------- Schleim (groß 16×16, klein 8×8; Farben mit Alpha) ----------
const SLIME_PAL = {
  O: '#2d8a3fdd', g: '#8cf27fa8', c: '#2fa84ecc', h: '#ffffffd9', e: '#0b2a12ff',
};
// Würfel mit abgerundeten Ecken; y0 = obere Grenze (gestaucht = kleiner y-Bereich), Augen und Mund je Frame.
const slime = (W, H, y0, cut, ey, ex, ew, mouth) => {
  const eyes = new Set();
  for (const x0 of ex) for (let dx = 0; dx < ew; dx++) for (let dy = 0; dy < 2; dy++) eyes.add(`${x0 + dx},${ey + dy}`);
  if (mouth) for (let x = mouth[0]; x <= mouth[1]; x++) eyes.add(`${x},${ey + 3}`);
  const g = grid(W, H, (x, y) => {
    if (y < y0) return null;
    if (eyes.has(`${x},${y}`)) return 'e';
    const cx = Math.min(x, W - 1 - x), cy = Math.min(y - y0, H - 1 - y);
    if (cx + cy < cut) return null;
    if (cx >= 3 && cy >= 3) return 'c';                       // dunkler Kern
    if ((cx === 1 && cy === 2) || (cx === 2 && cy === 1)) return 'h'; // Glanz
    return 'g';
  });
  return outline(g, 'O');
};
const SLIME_BIG = [slime(16, 16, 0, 3, 6, [4, 10], 2, [6, 9]), slime(16, 16, 5, 2, 9, [4, 10], 2, [6, 9])];
const SLIME_SMALL = [slime(8, 8, 0, 2, 3, [2, 5], 1, null), slime(8, 8, 3, 1, 5, [2, 5], 1, null)];

// ---------- Silberfischchen (12×6) ----------
const SF_PAL = { k: '#1d1d24', s: '#9aa0ab', S: '#6e7480', l: '#c9ced8', e: '#ff4848' };
const SF_BODY = [
  [0, 1, 2, 4, 'S'], [3, 1, 5, 4, 's'], [6, 1, 8, 4, 'S'], [9, 1, 11, 4, 'l'],
  [3, 1, 3, 4, 'k'], [6, 1, 6, 4, 'k'], [9, 1, 9, 4, 'k'],     // Segmentgrenzen
  [11, 2, 11, 2, 'e'],                                          // Auge
];
const SF_LEGS = [
  [[1, 0, 1, 0, 'k'], [4, 0, 4, 0, 'k'], [7, 0, 7, 0, 'k'], [2, 5, 2, 5, 'k'], [5, 5, 5, 5, 'k'], [8, 5, 8, 5, 'k']],
  [[2, 0, 2, 0, 'k'], [5, 0, 5, 0, 'k'], [8, 0, 8, 0, 'k'], [1, 5, 1, 5, 'k'], [4, 5, 4, 5, 'k'], [7, 5, 7, 5, 'k']],
];
const silverfish = (f) => outline(paint(12, 6, [...SF_BODY, ...SF_LEGS[f]]));

// ---------- Glutgeist (16×22) ----------
const GLUT_PAL = { k: '#2a1204', y: '#ffd23a', Y: '#fff3a0', a: '#ffa62b', o: '#ff7a1a', O: '#ffb347' };
const glut = (f) => {
  // Sechs schwebende Stäbe auf einem Ring; Frame 1 ist um 30° gedreht.
  const rods = new Map();
  for (let i = 0; i < 6; i++) {
    const a = ((i * 60 + f * 30) * Math.PI) / 180;
    for (let r = 5.5; r <= 8.01; r += 0.5) {
      const x = Math.round(8 + Math.cos(a) * r * 0.9), y = Math.round(10 + Math.sin(a) * r);
      rods.set(`${x},${y}`, i % 2 ? 'o' : 'O');
    }
  }
  const g = grid(16, 22, (x, y) => {
    const dx = (x + 0.5 - 8) / 4.6, dy = (y + 0.5 - 10) / 5;
    if (dx * dx + dy * dy <= 1) {
      if (y === 8 && (x === 5 || x === 6 || x === 9 || x === 10)) return 'k';    // Augen
      if (y === 11 && x >= 6 && x <= 9) return 'k';                              // Mund
      const s = (x - 8) + (y - 10);
      if (s < -4) return 'Y';
      if (s > 3) return 'a';
      return 'y';
    }
    return rods.get(`${x},${y}`) || null;
  });
  return outline(g, 'k');
};

// ---------- Leerenläufer (10×32) ----------
const LEER_PAL = { k: '#15101d', K: '#3a2a55', p: '#b35cff', P: '#6e2fb0' };
const leer = (f) => {
  const arms = f === 0 ? [[3, 9, 1, 27], [6, 9, 8, 27]] : [[3, 9, 0, 25], [6, 9, 9, 26]];
  const legs = f === 0 ? [[4, 23, 3, 31], [5, 23, 6, 31]] : [[4, 23, 2, 31], [5, 23, 7, 31]];
  const lines = new Map();
  for (const [x0, y0, x1, y1] of [...arms, ...legs]) for (const [x, y] of linePts(x0, y0, x1, y1)) lines.set(`${x},${y}`, 'K');
  const g = grid(10, 32, (x, y) => {
    if (lines.has(`${x},${y}`)) return lines.get(`${x},${y}`);
    if (y >= 1 && y <= 7 && x >= 3 && x <= 6 && !((x === 3 || x === 6) && (y === 1 || y === 7))) { // Kopf
      if (y === 3 && x >= 4) return 'p';
      if (y === 4 && x === 6) return 'P';
      return 'k';
    }
    if (y >= 9 && y <= 22 && x >= 3 && x <= 6) return 'k';                                       // Rumpf
    return null;
  });
  return outline(g, 'K');
};

export const MOB_ART = {
  mob_zischer: { pal: ZISCHER_PAL, frames: [ZISCHER_F0, ZISCHER_F1], flip: true },
  mob_zischer_fuse: { pal: ZISCHER_PAL, frames: [ZISCHER_F0, lighten(ZISCHER_F0)], flip: true },
  mob_zombie: { pal: ZOMBIE_PAL, frames: [zombie(ZOMBIE_LEGS_A), zombie(ZOMBIE_LEGS_B)], flip: true },
  mob_skeleton: { pal: SKEL_PAL, frames: [skeleton(0), skeleton(1)], flip: true },
  mob_skeleton_shoot: { pal: SKEL_PAL, frames: [skeletonShoot()], flip: true },
  mob_spider: { pal: SPIDER_PAL, frames: [spider(0), spider(1)], flip: true },
  mob_slime_big: { pal: SLIME_PAL, frames: SLIME_BIG, flip: true },
  mob_slime_small: { pal: SLIME_PAL, frames: SLIME_SMALL, flip: true },
  mob_silverfish: { pal: SF_PAL, frames: [silverfish(0), silverfish(1)], flip: true },
  mob_glutgeist: { pal: GLUT_PAL, frames: [glut(0), glut(1)], flip: true },
  mob_leerenlaeufer: { pal: LEER_PAL, frames: [leer(0), leer(1)], flip: true },
};
