// Pixel-Art im Code (PRD §9, PLAN §6). Figuren sind Zeichenraster: ein Zeichen = ein Pixel, '.' = transparent.
// Paletten bilden Zeichen auf Farben ab ('#rrggbb' oder '#rrggbbaa'). Kleine Muster (Kacheln, Kreise, Sterne,
// Bosse) entstehen aus einfachen Formen im Code und werden genauso als Raster behandelt.
// buildSprites() zeichnet alles einmal in ein Atlas-Canvas inkl. gespiegelter Varianten.
// get(name, frame, flip) -> { sx, sy, w, h } (vorab angelegte Objekte, keine Allokation pro Aufruf).

// ---------- Hilfsfunktionen ----------
const rowsOf = (w, h, f) => {
  const out = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += f(x, y) || '.';
    out.push(s);
  }
  return out;
};
// Innenkontur: gefüllte Pixel mit transparentem Nachbarn werden zu 'k'.
function outlined(g, ch = 'k') {
  const h = g.length, w = g[0].length;
  return g.map((row, y) => row.split('').map((p, x) => {
    if (p === '.') return '.';
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      || g[y][x - 1] === '.' || g[y][x + 1] === '.' || g[y - 1][x] === '.' || g[y + 1][x] === '.';
    return edge ? ch : p;
  }).join(''));
}
const inEll = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
function inStar(x, y, cx, cy, ro, ri) {
  const px = x + 0.5 - cx, py = y + 0.5 - cy;
  for (let k = 0; k < 10; k++) {
    // Punkt zwischen Spitzen (k gerade = außen) und Einbuchtungen; einfache Polygonprüfung
    const a0 = -Math.PI / 2 + (k * Math.PI) / 5, a1 = -Math.PI / 2 + ((k + 1) * Math.PI) / 5;
    const r0 = k % 2 === 0 ? ro : ri, r1 = k % 2 === 0 ? ri : ro;
    const ax = Math.cos(a0) * r0, ay = Math.sin(a0) * r0, bx = Math.cos(a1) * r1, by = Math.sin(a1) * r1;
    // Dreieck (Mittelpunkt, a, b) als Teil des Sterns
    const cross = (x1, y1, x2, y2, x3, y3) => (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
    const d1 = cross(0, 0, ax, ay, px, py), d2 = cross(ax, ay, bx, by, px, py), d3 = cross(bx, by, 0, 0, px, py);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

// ---------- Paletten ----------
const PAL_PLAYER = {
  k: '#1d1322', h: '#f0801e', H: '#ffb35c', d: '#b5520f', s: '#f7c79a', S: '#d9925f',
  b: '#2f6fd6', B: '#1f4aa0', y: '#ffd23f', g: '#7a4a24', z: '#7b4220', x: '#1d1322', m: '#5b3219',
};
const PAL_FIRE = { ...PAL_PLAYER, h: '#e8382f', H: '#ff8a7a', d: '#9e1b18', b: '#f4f6fb', B: '#b9c2d6' };
const PAL_STAR = [
  { ...PAL_PLAYER, b: '#e83a8f', B: '#a3205c', h: '#ffe14d', H: '#fff7b0', d: '#c9a400' },
  { ...PAL_PLAYER, b: '#2ec4a5', B: '#14806e', h: '#7d5cff', H: '#b9a6ff', d: '#4a2fb3' },
  { ...PAL_PLAYER, b: '#46d23c', B: '#1f8a1a', h: '#ff5ea8', H: '#ffb3d1', d: '#b82d70' },
];
const PAL_WALKER = {
  k: '#1d1322', C: '#b07cd0', c: '#7d3c98', d: '#55286b', w: '#fbeff9', s: '#f3dcb0', S: '#c9a77a',
  f: '#3b2a1e', x: '#1d1322', e: '#ffffff',
};
const PAL_BEETLE = { k: '#1d1322', G: '#7fd67a', g: '#3fa34d', D: '#1f6b33', e: '#ffffff', x: '#1d1322' };
const PAL_HOPPER = { k: '#1d1322', F: '#8fe3c1', f: '#2fb38a', D: '#17704f', e: '#ffffff', w: '#ffffff', x: '#1d1322' };
const PAL_SPIKY = { k: '#1d1322', b: '#8a5a3c', B: '#5a3524', t: '#f1efe6', T: '#c9c4b5', p: '#f2a7b5', e: '#ffffff', x: '#1d1322' };
const PAL_LAVABALL = { k: '#5a1204', o: '#ff7a1a', O: '#ffb31a', y: '#fff27a', D: '#b32a0a' };
const PAL_ROOT = {
  k: '#1d1322', r: '#7a4b26', R: '#b07a45', D: '#43260f', c: '#ffd23f', C: '#b8860b', L: '#4fbf4f', l: '#9be58a',
  e: '#ffe866', x: '#1d1322', w: '#ffffff',
};
const PAL_GOLEM = { k: '#1d1322', s: '#8d96a6', S: '#b8c0cf', d: '#5a6170', D: '#3c4250', e: '#ff5a2a', E: '#ffd23a', w: '#ffffff', x: '#1d1322' };
const PAL_DRAGON = {
  k: '#1d1322', r: '#d6402b', R: '#ff7a4d', d: '#8c1f1a', y: '#f2e6c2', Y: '#ffd23f', v: '#6c3fa8', V: '#9b6cd6',
  e: '#ffe066', w: '#ffffff', x: '#1d1322',
};
const PAL_MUSH = { k: '#1d1322', c: '#f2a33a', C: '#ffd27a', w: '#fff7e8', s: '#fbe7c6', S: '#d9b98b', x: '#1d1322' };
const PAL_1UP = { ...PAL_MUSH, c: '#3cb24a', C: '#8fe39a' };
const PAL_FLOWER = { k: '#1d1322', g: '#3c9b3c', l: '#7ad65a', r: '#ff5a3c', R: '#ffb03c', y: '#fff27a', w: '#ffffff' };
const PAL_STARITEM = { k: '#5a3a00', y: '#ffd23f', Y: '#fff3a6', o: '#e08a00', w: '#ffffff' };
const PAL_COIN = { k: '#5a3a00', c: '#ffc83d', C: '#fff0a0', d: '#c08a10' };
const PAL_COINSTAR = { k: '#3a0a22', c: '#ff5fa2', C: '#ffd0e6', d: '#b02f6e', w: '#ffffff' };
const PAL_SLOT = { k: '#6b7280', g: '#3b4150' };
const PAL_FIREBALL = { k: '#5a1204', o: '#ff7a1a', y: '#ffe066', r: '#c8300f', w: '#fff8c0' };
const PAL_ROCK = { k: '#1d1322', g: '#8b8f99', G: '#c3c8d2', d: '#4f5560' };
const PAL_FLAME = { k: '#7a1a06', y: '#ffe066', o: '#ff7a1a', r: '#e0301a', w: '#fff8d0' };
const PAL_LAVA = { k: '#5a1204', g: '#ffb13a', a: '#ffe066', b: '#ff6a1a', c: '#d8380f', d: '#8a1a06' };
const PAL_SPIKES = { k: '#1d1322', a: '#ffffff', b: '#c9ced6', c: '#8c929e', d: '#4d535e' };
const PAL_CHECK = { k: '#1d1322', p: '#c9ced6', P: '#8c929e', r: '#e0301a', R: '#ff7a5a', g: '#6b7280', G: '#9aa3ad' };
const PAL_GOAL = { k: '#1d1322', p: '#e6e9ef', P: '#9aa3ad', y: '#ffd23f', Y: '#fff3a6', r: '#e0301a', w: '#ffffff' };
const PAL_PAUSE = { o: '#0b0a1466', O: '#ffffffcc', x: '#ffffffee' };
const PAL_BTN = {
  up: { o: '#0b0a1459', O: '#ffffff99', x: '#ffffffcc' },
  down: { o: '#ffffff66', O: '#ffffffee', x: '#0b0a14dd' },
};
const PAL_FONT = { w: '#ffffff', k: '#000000aa' };

// Kachel-Paletten je Welt: gleiche Buchstaben, andere Farben.
// k Kontur, a Glanz, b Basis hell, c Basis mitte, d Basis dunkel, e Oberkante, f Fuge/Akzent, g Schimmer.
export const THEME_PALS = {
  meadow: { k: '#2a1a10', a: '#c8f5a0', b: '#b5703e', c: '#93552c', d: '#6a3a1e', e: '#63c044', f: '#2f7a22', g: '#fff3a0' },
  cave: { k: '#0f1420', a: '#c5e8ff', b: '#5f7394', c: '#4a5a7a', d: '#2c3749', e: '#5fd6c6', f: '#2a8f98', g: '#e0fff9' },
  castle: { k: '#17141c', a: '#e6e0f2', b: '#9a92aa', c: '#7a7290', d: '#4f4862', e: '#c9c2dd', f: '#3a3248', g: '#ffd23f' },
};
// Zusatzfarben für Ziegel, harten Block, Plattform, Röhre je Welt.
const BONUS_PAL = { k: '#5a3200', a: '#fff3a0', b: '#ffd23f', c: '#f0a500', d: '#b86e00', g: '#fff8c0', w: '#ffffff' };
const THEME_EXTRA = {
  meadow: {
    bonus: BONUS_PAL,
    brick: { k: '#2a1a10', a: '#ffa070', b: '#d8673a', c: '#b8482a', d: '#8a2f1c', f: '#f5d7b0' },
    hard: { k: '#1b1f26', a: '#d6dde6', b: '#9aa3ad', c: '#7b8490', d: '#545c68', f: '#3a4048' },
    plat: { k: '#3b2410', a: '#f7dca4', b: '#e0ae6a', c: '#b9864a', d: '#8a5a2a' },
    pipe: { k: '#0c2a14', a: '#b8f5a0', b: '#56c25a', c: '#2e9a3e', d: '#1c6b2a', f: '#0f4a1c' },
  },
  cave: {
    bonus: BONUS_PAL,
    brick: { k: '#0f1420', a: '#c0a0e8', b: '#7a58a0', c: '#5a3f7e', d: '#3a2656', f: '#c6b2dd' },
    hard: { k: '#0f1118', a: '#8c95ab', b: '#4f5666', c: '#3c4250', d: '#23272f', f: '#15181f' },
    plat: { k: '#0f1420', a: '#d4ecff', b: '#7fa4c8', c: '#5a80a6', d: '#36536f' },
    pipe: { k: '#0a1c1c', a: '#c8fff4', b: '#5fb8ae', c: '#3d8c85', d: '#26615b', f: '#163532' },
  },
  castle: {
    bonus: BONUS_PAL,
    brick: { k: '#17141c', a: '#c9606c', b: '#8c3340', c: '#6a2430', d: '#44161f', f: '#c9a7a0' },
    hard: { k: '#0f0e12', a: '#a39cae', b: '#6b6470', c: '#4b4550', d: '#2c2830', f: '#1a171d' },
    plat: { k: '#17110a', a: '#d8b89a', b: '#a6825f', c: '#7e5f42', d: '#4a3520' },
    pipe: { k: '#101418', a: '#e6f2ff', b: '#9aa7b8', c: '#6e7b8c', d: '#454f5e', f: '#2a313b' },
  },
};
export const THEMES = ['meadow', 'cave', 'castle'];

// ---------- Spieler ----------
// Klein 12×16: Kopf (7) + Körper (5) + Beine (4). Groß 16×32: Kopf (10) + Körper (10) + Beine (12).
const S_HEAD = [
  '...kkkkkk...',
  '..khhhhhhk..',
  '.khhHhhhhhk.',
  'kkkkkkkkkkkk',
  '..ksssssssk.',
  '..ksssssksk.',
  '..kssssssk..',
];
const S_BODY = {
  stand: ['...kSSSSk...', '..kbbbbbbk..', '..kbbybbbk..', '.skbbbbbbks.', '..kgggggk...'],
  run: ['...kSSSSk...', '..kbbbbbbk..', '..kbbybbbk..', '..kbbbbbbks.', '..kgggggk...'],
  jump: ['sk.kSSSSk.ks', 'skkbbbbbbkks', '..kbbybbbk..', '...kbbbbk...', '..kgggggk...'],
  fall: ['...kSSSSk...', '..kbbbbbbk..', 'sskbbybbbkss', '..kbbbbbbk..', '..kgggggk...'],
  turn: ['...kSSSSk...', '..kbbbbbbk..', '..kbbybbbks.', '.s.kbbbbbbk.', '..kgggggk...'],
};
const S_LEGS = {
  stand: ['..kbbk.kbbk.', '..kbbk.kbbk.', '.kzzk.kzzzk.', '.kzzzk.kzzzk'],
  walk1: ['..kbbk.kbbk.', '.kbbk..kbbk.', '.kzzk...kzzk', 'kzzzk...kzzk'],
  walk3: ['.kbbk.kbbk..', 'kbbk..kbbk..', 'kzzk..kzzzk.', '.kzzzk.kzzzk'],
  run: ['..kbbk.kbbk.', '.kbbk..kbbk.', 'kzzk...kzzk.', 'kzzzk...kzzk'],
  jump: ['..kbbkkbbk..', '..kbbbbbbk..', '..kzzzzzzk..', '..kkkkkkkk..'],
  fall: ['.kbbk...kbbk', '.kbbk...kbbk', 'kzzzk..kzzzk', 'kzzk....kzzk'],
};
const S_DEAD = [
  '...kkkkkk...',
  '..khhhhhhk..',
  '.khhHhhhhhk.',
  'kkkkkkkkkkkk',
  '..ksssssssk.',
  '..ksxssssxsk',
  '..kssssssk..',
  '...kSSSSk...',
  '..kbbbbbbk..',
  '..kbbybbbk..',
  '.skbbbbbbks.',
  '..kgggggk...',
  '..kbbk.kbbk.',
  '..kbbk.kbbk.',
  '.kzzk.kzzzk.',
  '.kzzzk.kzzzk',
];
const sFrame = (body, legs) => [...S_HEAD, ...body, ...legs];
// Reihenfolge = Frame-Index: 0 stand, 1–3 walk, 4–6 run, 7 jump, 8 fall, 9 turn, 10 dead.
const SMALL_FRAMES = [
  sFrame(S_BODY.stand, S_LEGS.stand), sFrame(S_BODY.stand, S_LEGS.walk1), sFrame(S_BODY.stand, S_LEGS.stand),
  sFrame(S_BODY.stand, S_LEGS.walk3), sFrame(S_BODY.run, S_LEGS.run), sFrame(S_BODY.run, S_LEGS.stand),
  sFrame(S_BODY.run, S_LEGS.walk3), sFrame(S_BODY.jump, S_LEGS.jump), sFrame(S_BODY.fall, S_LEGS.fall),
  sFrame(S_BODY.turn, S_LEGS.stand), S_DEAD,
];

const B_HEAD = [
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '..khhHhhhhhhhk..',
  'kkkkkkkkkkkkkkkk',
  '..ksssssssssk...',
  '..ksssssssksk...',
  '..kssssssssssk..',
  '..kssssssssk....',
  '...kSSSSSSk.....',
  '....kkkkkk......',
];
const B_BODY = {
  stand: [
    '..kbbbbbbbbk....', '.skbbbbbbbbks...', '.skbbbbybbbbks..', '..kbbbbbbbbbk...', '..kbbbbybbbbk...',
    '..kgggggggggk...', '...kgggyggggk...', '....kkkkkkkk....', '....kbbbbbbk....', '....kbbbbbbk....',
  ],
  run: [
    '..kbbbbbbbbk....', '.skbbbbbbbbks...', '.skbbbbybbbbks..', '..kbbbbbbbbbk...', '..kbbbbybbbbks..',
    '..kgggggggggk...', '...kgggyggggk...', '....kkkkkkkk....', '....kbbbbbbk....', '....kbbbbbbk....',
  ],
  jump: [
    'sk..kbbbbbbk..ks', 'skkkbbbbbbbbkkss', '..kbbbbybbbbk...', '..kbbbbbbbbbk...', '..kbbbybbbbk....',
    '..kgggggggggk...', '...kgggyggggk...', '....kkkkkkkk....', '....kbbbbbbk....', '....kbbbbbbk....',
  ],
  fall: [
    'ss.kbbbbbbbbk.ss', '.skbbbbbbbbbbks.', '.skbbbbybbbbks..', '..kbbbbbbbbbk...', '..kbbbbybbbbk...',
    '..kgggggggggk...', '...kgggyggggk...', '....kkkkkkkk....', '....kbbbbbbk....', '....kbbbbbbk....',
  ],
};
const B_LEGS = {
  stand: [
    '...kbbbkkbbbk...', '...kbbbkkbbbk...', '...kbbbkkbbbk...', '...kbbbkkbbbk...', '...kbbbkkbbbk...',
    '...kbbbkkbbbk...', '..kzzzzkkzzzzk..', '.kzzzzzkkzzzzzk.', '.kzzzzzzkzzzzzzk.', 'kzzzzzzzkkzzzzzzk',
    'kkkkkkkkkkkkkkkk', '................',
  ],
  walk1: [
    '...kbbbkk.kbbbk.', '...kbbbkk.kbbbk.', '...kbbbk..kbbbk.', '...kbbbk..kbbbk.', '...kbbbk..kbbbk.',
    '..kbbbk...kbbbk.', '..kzzzzk..kzzzzk', '.kzzzzzk..kzzzzzk', '.kzzzzzk...kzzzzk', 'kzzzzzzk...kzzzzk',
    'kkkkkkkk...kkkkkk', '................',
  ],
  walk3: [
    '.kbbbk..kbbbk...', '.kbbbk..kbbbk...', '.kbbbk..kbbbk...', '.kbbbk..kbbbk...', '.kbbbk...kbbbk..',
    '.kbbbk...kbbbk..', 'kzzzzk....kzzzzk.', 'kzzzzzk....kzzzzzk', '.kzzzzzk...kzzzzk', '.kzzzzk....kzzzzk',
    '.kkkkkk....kkkkkk', '................',
  ],
  jump: [
    '...kbbbkkbbbk...', '...kbbbbbbbbk...', '...kbbbbbbbbk...', '...kbbbbbbbbk...', '..kzzzzzzzzzk...',
    '..kzzzzzzzzzk...', '.kzzzzzzzzzzk...', '.kkkkkkkkkkkk...', '................', '................',
    '................', '................',
  ],
};
const bFrame = (body, legs) => [...B_HEAD, ...body, ...legs].map((s) => (s + '................').slice(0, 16));
const BIG_FRAMES = [
  bFrame(B_BODY.stand, B_LEGS.stand), bFrame(B_BODY.stand, B_LEGS.walk1), bFrame(B_BODY.stand, B_LEGS.stand),
  bFrame(B_BODY.stand, B_LEGS.walk3), bFrame(B_BODY.run, B_LEGS.walk1), bFrame(B_BODY.run, B_LEGS.stand),
  bFrame(B_BODY.run, B_LEGS.walk3), bFrame(B_BODY.jump, B_LEGS.jump), bFrame(B_BODY.fall, B_LEGS.stand),
  bFrame(B_BODY.jump, B_LEGS.stand), B_HEAD.map((s, i) => (i === 4 || i === 5 ? s.replace(/s/g, 'x') : s)).concat(B_BODY.stand, B_LEGS.stand).map((s) => (s + '................').slice(0, 16)),
];

// ---------- Gegner ----------
const WALKER = [
  '......kkkkkk....',
  '....kkCCCCCCkk..',
  '...kCCcccccccCk.',
  '..kCcwwcccccwwCk',
  '..kCcwwcccccwwck',
  '.kcccccccccccccc',
  'kkkkkkkkkkkkkkkk',
  '.kssxssksssxsk..',
  '.kssxssksssxsk..',
  '..kSssssssssSk..',
  '..kSSSSSSSSSSk..',
  '...kkkkkkkkkk...',
  '...kffkk.kkffk..',
  '...kffk....kffk.',
  '....kkk....kkk..',
  '................',
];
const WALKER_STEP = WALKER.map((s, r) => (r === 12 ? '..kffk..kkffk..' : r === 13 ? '..kffk.....kffk' : r === 14 ? '...kkk......kkk' : s));
const WALKER_SQ = [
  '................', '................', '................', '................', '................', '................',
  '..kkkkkkkkkkkk..', 'kkCCccccccccccCkk',
];
const BEETLE_1 = [
  '................', '...kkkkkkkk.....', '..kGGgggggkk....', '.kGgggggggggk...', 'kkGgDDgggggggk...',
  'kgggDDggggggggk.', 'kDDgggggggggggDk.', 'kDDDDDDDDDDDDDDk.', 'kkkkkkkkkkkkkkk.', 'kxkkkk.kkkkkk...',
  '.kk.kk.kkk.kk...', '.kk...kk...kk...', '................', '................', '................', '................',
];
const BEETLE_2 = [
  '................', '...kkkkkkkk.....', '..kGGgggggkk....', '.kGgggggggggk...', 'kkGgDDgggggggk...',
  'kgggDDggggggggk.', 'kDDgggggggggggDk.', 'kDDDDDDDDDDDDDDk.', 'kkkkkkkkkkkkkkk.', 'kxkkkk.kkkkkk...',
  '.kkk.kk.kk.kk...', '..kk..kk..kk....', '................', '................', '................', '................',
];
const BEETLE_SHELL = rowsOf(16, 16, (x, y) => (inEll(x, y, 8, 11, 7, 5) ? (y < 8 ? 'G' : (x + y) % 5 === 0 ? 'D' : 'g') : null));
const HOPPER_SIT = [
  '................', '..kkk....kkk....', '.kwwwkkkkwwwk...', '.kwxwkkkkwxwk...', '.kkkkFFFFkkkk....',
  '..kFFFFFFFFFk...', '.kFFFFFFFFFFFk...', '.kfffffffffffk...', '.kfffffffffffk...', 'kffffffffffffffk',
  'kffffffffffffffk', 'kffffffffffffffk', '.kDDDDDDDDDDDk.', 'kkDkkk...kkkDkk.', 'kDk.....kk...kDk', 'kk.......kk...k.',
];
const HOPPER_HOP = [
  '................', '...kk.......kk...', '..kwwkkkkkkwwk..', '..kwxwkkkkwxwk..', '..kkkkFFFFkkkk..',
  '.kFFFFFFFFFFFFk.', '.kFFFFFFFFFFFFk.', 'kFFFFFFFFFFFFFFk', 'kffffffffffffffk', 'kffffffffffffffk',
  'kffffffffffffffk', '.kDDDDDDDDDDDDk.', 'kkDk.kk....kk.kk', 'kDk...kk..kk...k', 'kk.........kk..', '................',
];
const HOPPER_SQ = [
  '................', '................', '................', '................', '................', '................',
  '................', '.kkkkkkkkkkkkkk.',
];
const SPIKY_1 = [
  '................', '..t..t..t..t....', '.tTt.tTt.tTt....', '.kkkkkkkkkkkkk..', 'kTtbbbbbbbbbbkk..',
  'ktBbbbbbbbbbbbbk.', 'kbbbbbbbbbbbbbpk.', 'kbBBBBBBBBBBBBek.', '.kbbbbbbbbbbbbk..', '.kkbbbbbbbbbbk...',
  '..kkkkkkkkkkk...', '..kpk....kpk....', '..kkk....kkk....', '................', '................', '................',
];
const SPIKY_2 = SPIKY_1.map((s, r) => (r === 11 ? '..kpkk..kpk....' : r === 12 ? '..kk.k..kkk....' : s));
const lavaBall = (f) => rowsOf(12, 12, (x, y) => {
  const wob = f === 0 ? 0 : (x + y) % 2;
  if (!inEll(x, y, 5.5, 5.5, 5.5 + wob * 0.3, 5.5 - wob * 0.3)) return null;
  if (inEll(x, y, 5.5, 6.5, 2.4, 2.4)) return 'y';
  if (inEll(x, y, 5.5, 5.5, 3.5, 3.5)) return 'O';
  if (inEll(x, y, 5.5, 5.5, 4.5, 4.5)) return 'o';
  return 'D';
});
const LAVABALL = [outlined(lavaBall(0)).map((s) => s), outlined(lavaBall(1))];

// Bosse (aus Formen; Innenkontur k).
const rootKing = (f) => outlined(rowsOf(32, 32, (x, y) => {
  const sway = f === 1 ? 1 : 0;
  if (inEll(x, y, 16, 8, 11, 6)) {
    if (inRect(x, y, 10, 5, 22, 6) && (y + x) % 3 === 0) return 'l';
    return (x + y) % 5 === 0 ? 'C' : 'c';
  }
  if (inRect(x, y, 6, 11, 25, 12)) return y === 11 ? 'k' : 'L';
  if (inEll(x, y, 16, 19, 11, 9)) {
    if (inEll(x, y, 11, 17, 2.6, 2.6)) return 'e';
    if (inEll(x, y, 21, 17, 2.6, 2.6)) return 'e';
    if (inRect(x, y, 9, 15, 13, 15) || inRect(x, y, 19, 15, 23, 15)) return 'k';
    return (x * 3 + y) % 7 === 0 ? 'D' : (x + y) % 4 === 0 ? 'R' : 'r';
  }
  for (const [rx, ry] of [[7, 26], [16, 27], [25, 26]]) {
    if (inEll(x, y, rx + (x < 16 ? sway * -1 : sway), 28, 2.6, 4.5)) return 'D';
  }
  return null;
}));
const golem = (f) => outlined(rowsOf(32, 40, (x, y) => {
  if (!inRect(x, y, 1, 1, 30, 38)) return null;
  if (x <= 2 || y <= 2) return 'S';
  if (x >= 28 || y >= 36) return 'D';
  if (inRect(x, y, 7, 13, 12, 19) || inRect(x, y, 19, 13, 24, 19)) {
    if (f === 1) return ((x + y) % 2 === 0 && (x === 8 || x === 9 || x === 20 || x === 21)) ? 'x' : 'k';
    if (inRect(x, y, 9, 15, 10, 17) || inRect(x, y, 21, 15, 22, 17)) return 'E';
    return 'e';
  }
  if (inRect(x, y, 8, 27, 23, 28)) return (x + y) % 3 === 0 ? 'k' : 'D';
  if ((x === 15 && y > 20 && y < 32) || (y === 22 && x > 12 && x < 18)) return 'D';
  return (x * 7 + y * 3) % 11 === 0 ? 'D' : 's';
}));
const inTri = (x, y, ax, ay, bx, by, cx, cy) => {
  const px = x + 0.5, py = y + 0.5;
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};
const dragon = (f) => outlined(rowsOf(40, 32, (x, y) => {
  // Flügel: f=0 hoch, f=1 tief (zwei Dreiecke über dem Rücken mit Fingern).
  const up = f === 0;
  if (inTri(x, y, 17, 13, up ? 26 : 25, up ? 1 : 9, up ? 38 : 37, up ? 9 : 16)) return (x + y) % 4 === 0 ? 'V' : 'v';
  // Horn
  if (inTri(x, y, 7, 7, 9, 1, 11, 7)) return 'y';
  // Kopf und Schnauze
  if (inEll(x, y, 9, 14, 7, 6)) {
    if (inEll(x, y, 6, 12, 1.4, 1.4)) return 'e';
    if (inRect(x, y, 2, 16, 4, 17)) return 'Y';
    if (inRect(x, y, 2, 15, 3, 15) && (x + y) % 2 === 0) return 'y';
    return y > 17 ? 'd' : 'r';
  }
  if (inRect(x, y, 1, 14, 5, 18) && !inEll(x, y, 9, 14, 7, 6)) return inRect(x, y, 1, 18, 2, 18) ? 'k' : 'R';
  // Körper
  if (inEll(x, y, 23, 20, 13, 7)) {
    if (y > 22) return (x * 5 + y) % 7 === 0 ? 'd' : 'Y';
    return (x + y) % 6 === 0 ? 'd' : 'r';
  }
  // Rückenstacheln
  for (let sx = 15; sx <= 31; sx += 4) {
    if (inTri(x, y, sx - 1, 14, sx + 1, 14, sx, 11)) return 'd';
  }
  // Beine
  if (inRect(x, y, 13, 25, 16, 30) || inRect(x, y, 28, 25, 31, 30)) return y === 30 ? 'k' : 'd';
  // Schwanz mit Spitze
  if (inEll(x, y, 36, 22, 4, 3)) return 'r';
  if (inTri(x, y, 38, 20, 39, 16, 39, 24)) return 'd';
  return null;
}));

// ---------- Items ----------
const MUSH = [
  '................', '.....kkkkkk.....', '...kkCCccccKk...', '..kCCccwwccckk..', '..kCcwwcccwwcck.',
  '.kCccwwcccccwwck', 'kkkkkkkkkkkkkkkk', '..kkssssssssk...', '..kssxssxxxsk..', '..kssssssssssk.',
  '...kSSSSSSSSk...', '....kSSSSSk.....', '.....kkkkk......', '................', '................', '................',
];
const FLOWER = [
  '................', '....kkk.kkk.....', '...kRRkkkRRk....', '..kRryykyyRRk...', '..kryyyyyyyrk...',
  '..kRyyyyyyRRk...', '...kRRkkkRRk....', '....kkgkkk......', '.....kgk.kkk....', '.....kgk.kgl....',
  '.....kgkkgkk....', '.....kglgk......', '.....kkgkk......', '......kgk.......', '......kgk.......', '......kkk.......',
];
const starPts = (f) => rowsOf(12, 12, (x, y) => {
  if (!inStar(x, y, 6, 6.2, 6, 2.6)) return null;
  if (f === 1 && inEll(x, y, 6, 6, 1.2, 1.2)) return 'Y';
  return 'y';
});
const STAR_ITEM = [outlined(starPts(0)), outlined(starPts(1))];
// Münze: Breite pulsiert durch Drehung (4 Frames).
const coinFrame = (f) => {
  const rx = [5.4, 4, 2.2, 4][f];
  const g = rowsOf(12, 12, (x, y) => {
    if (!inEll(x, y, 6, 6, rx, 5.6)) return null;
    if (!inEll(x, y, 6, 6, rx - 1.1, 4.5)) return 'k';
    if (rx > 3 && x + 0.5 < 6 - rx * 0.45) return 'C';
    if (rx > 3 && x + 0.5 > 6 + rx * 0.5) return 'd';
    return f === 2 ? 'd' : 'c';
  });
  return g;
};
const COIN = [0, 1, 2, 3].map(coinFrame);
const COINSTAR = [0, 1].map((f) => outlined(rowsOf(12, 12, (x, y) => {
  if (!inStar(x, y, 6, 6.2, 5.6, 2.5)) return null;
  if (inEll(x, y, 6, 6, 1.1, 1.1)) return 'w';
  return f === 0 ? 'c' : 'C';
})));
const STARSLOT = [outlined(rowsOf(12, 12, (x, y) => (inStar(x, y, 6, 6.2, 5.6, 2.5) ? 'g' : null)), 'k')];
const FIREBALL = [0, 1, 2, 3].map((f) => outlined(rowsOf(8, 8, (x, y) => {
  if (!inEll(x, y, 4, 4, 3.8, 3.8)) return null;
  const hx = f === 0 || f === 3 ? 2 : 5, hy = f < 2 ? 2 : 5;
  if (Math.abs(x - hx) < 1 && Math.abs(y - hy) < 1) return 'y';
  if (inEll(x, y, 4, 4, 2.2, 2.2)) return 'o';
  return 'r';
})));
const ROCK = [0, 1].map((f) => outlined(rowsOf(12, 12, (x, y) => {
  if (!inEll(x, y, 6, 6, 5.5, 5)) return null;
  if (inEll(x - (f ? 1 : 0), y - 1, 3.5, 2.8, 2, 1.5)) return 'G';
  return (x * 3 + y) % 7 === 0 ? 'd' : 'g';
})));
const FLAME = [0, 1].map((f) => outlined(rowsOf(16, 8, (x, y) => {
  const len = 16 - x;
  const h = (f === 0 ? 3.5 : 3) * Math.sin(Math.PI * Math.min(1, (x + 1) / 17)) + 1;
  const mid = 4 + (f ? 0.5 : 0);
  if (Math.abs(y + 0.5 - mid) > h) return null;
  if (x < 10 && Math.abs(y + 0.5 - mid) < h * 0.5) return 'w';
  if (x > 6 || len < 0) return 'o';
  return 'y';
})));

// Checkpoint und Zielfahne (aus Formen)
const CHECK_FLAG = (on) => rowsOf(16, 32, (x, y) => {
  if (x >= 2 && x <= 3 && y >= 1) return y === 1 ? 'k' : (x === 2 ? 'P' : 'p');
  if (x === 1 && y === 0) return 'k';
  if (y >= 4 && y <= 14 && x >= 4 && x <= 4 + Math.max(0, 11 - (y - 4) * 0.7)) return on ? (x > 10 ? 'R' : 'r') : (x > 10 ? 'G' : 'g');
  return null;
});
const CHECKPOINT = [outlined(CHECK_FLAG(false)), outlined(CHECK_FLAG(true))];
const GOAL = outlined(rowsOf(24, 96, (x, y) => {
  if (x >= 4 && x <= 5 && y >= 6) return x === 4 ? 'P' : 'p';
  if (inEll(x, y, 4.5, 4.5, 3, 3)) return 'y';
  if (x >= 6 && x <= 6 + 14 && y >= 8 && y <= 22 && y - 8 <= 14 - Math.abs(x - 6 - 7) * 0.6) return (x + y) % 4 === 0 ? 'w' : 'r';
  return null;
}));

// ---------- Kacheln ----------
// Ziegel, Stein, Bonus, Verbraucht, Platte, Röhre: Muster-Funktionen je Welt.
const brickTex = () => rowsOf(16, 16, (c, r) => {
  if (r === 7 || r === 15) return 'f';
  const off = r < 8 ? 0 : 4;
  if (((c + off) & 7) === 7) return 'f';
  if (r === 0 || r === 8) return 'a';
  if (r === 6 || r === 14) return 'd';
  return 'b';
});
const hardTex = () => rowsOf(16, 16, (c, r) => {
  if (c === 0 || r === 0) return 'a';
  if (c === 15 || r === 15) return 'd';
  if ((c === 3 || c === 12) && (r === 3 || r === 12)) return 'f';
  if (c === 2 || c === 13 || r === 2 || r === 13) return 'c';
  return 'b';
});
const groundTex = (top) => rowsOf(16, 16, (c, r) => {
  const v = (c * 374761 + r * 668265 + 7) % 97;
  if (top) {
    if (r === 0) return 'k';
    if (r <= 3) return ((c + r * 3) % 7 === 0) ? 'a' : (v % 5 === 0 ? 'f' : 'e');
    if (r === 4) return 'f';
  }
  if (c === 15 || r === 15) return 'd';
  if (v % 11 === 0) return 'c';
  if (v % 23 === 0) return 'a';
  return 'b';
});
const GLYPH_Q = ['.####.', '##..##', '....##', '...##.', '..##..', '......', '..##..'];
const bonusTex = (f) => rowsOf(16, 16, (c, r) => {
  if (c === 0 || r === 0) return 'a';
  if (c === 15 || r === 15) return 'd';
  const gx = c - 5, gy = r - 4;
  if (gx >= 0 && gx < 6 && gy >= 0 && gy < 7 && GLYPH_Q[gy][gx] === '#') return 'k';
  if ((f === 1 && c === 13 && r === 2) || (f === 2 && c === 2 && r === 13)) return 'w';
  return c === 1 || r === 1 ? 'g' : 'c';
});
const usedTex = () => rowsOf(16, 16, (c, r) => {
  if (c === 0 || r === 0) return 'c';
  if (c === 15 || r === 15) return 'd';
  if ((c === 2 || c === 13) && (r === 2 || r === 13)) return 'f';
  if (c === 1 || r === 1) return 'b';
  return 'c';
});
const platPiece = (l, r) => rowsOf(16, 8, (c, y) => {
  if (y === 7) return 'k';
  if ((l && c === 0) || (r && c === 15)) return 'k';
  if (y === 0) return 'a';
  if (y === 1) return 'b';
  if (y === 4 && c % 5 === 2) return 'd';
  return 'c';
});
const PIPE_CAP = (side) => rowsOf(16, 16, (c, y) => {
  const edge = side === 'l' ? c === 0 : c === 15;
  if (y <= 4) {
    if (y === 0 || y === 4 || edge) return 'k';
    if (side === 'l' ? c === 2 : c === 13) return 'a';
    return y < 2 ? 'b' : 'c';
  }
  if (edge) return 'k';
  if (side === 'l' && c === 2) return 'a';
  if (side === 'r' && c === 13) return 'd';
  return c === 1 || c === 14 ? 'c' : 'b';
});
const PIPE_BODY = (side) => rowsOf(16, 16, (c, y) => {
  if (c === 0 || c === 15) return 'k';
  if (side === 'l' && c === 2) return 'a';
  if (side === 'r' && c === 13) return 'd';
  return c === 1 || c === 14 ? 'c' : 'b';
});
const LAVA_BODY = rowsOf(16, 16, (c, r) => {
  if (r === 0) return 'g';
  const v = (c * 374761 + r * 668265 + 11) % 97;
  if (v > 90) return 'a';
  if (v < 8) return 'd';
  if (r > 10 && v < 30) return 'c';
  return r < 4 ? 'b' : 'c';
});
const LAVA_SURF = [0, 1, 2, 3].map((f) => rowsOf(16, 4, (c, r) => {
  const wave = ((c + f * 2) % 8) < 4;
  if (r === 0) return wave ? 'g' : 'a';
  if (r === 1) return wave ? 'a' : 'g';
  return 'b';
}));
const SPIKE_TILE = rowsOf(16, 16, (x, y) => {
  const t = x % 5;
  const top = t === 2 ? 3 : t === 1 || t === 3 ? 6 : 9;
  if (y < 10 && y >= top && Math.abs(x % 5 - 2) <= (y - top) / 2.5 + 0.2 && x % 5 !== 0) return y === top ? 'a' : (x % 5 === 2 ? 'a' : 'b');
  if (y >= 10 && y <= 15 && y < 14) return 'c';
  if (y === 15) return 'd';
  return null;
});
const DECO_BUSH = [
  '................', '................', '.....kkkkk......', '...kkeeeaekk....', '..keeeaeeeeek...',
  '.keeeeeeeefeek..', 'keeeaeefeeeeeek.', 'keeeeeeeeeaeeeek', 'kffeeeeeeefffeek', 'kfffffeeeffffffk',
  '.kffffffffffffk.', '..kkkkkkkkkkkk..', '.....kkkk.......', '................', '................', '................',
];
const DECO_CRYSTAL = [
  '................', '................', '.......k........', '......kak.......', '.....kaeak......',
  '.....keeek......', '....kaeeefk.....', '....keeeeek.....', '..kkkkkkkkkkk...', '.kaekkkkaekkk...',
  '.keeeeeeeeeek...', '.kffffffffffk...', '.kkkkkkkkkkkk...', '................', '................', '................',
];
const DECO_TORCH = [
  '................', '......g.........', '.....gge........', '.....gge........', '....ggeeg.......',
  '....gegeg.......', '.....ggg........', '......f.........', '......f.........', '......f.........',
  '.....fkf........', '....kfkfk.......', '......kk........', '......kk........', '................', '................',
];

// ---------- Schrift (3×5 Glyphen, im Atlas als 4×6 mit Schatten) ----------
const GLYPHS = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '..#', '..#'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'], colon: ['...', '.#.', '...', '.#.', '...'], x: ['...', '#.#', '.#.', '#.#', '...'],
  F: ['###', '#..', '##.', '#..', '#..'], P: ['##.', '#.#', '##.', '#..', '#..'], S: ['###', '#..', '###', '..#', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], A: ['.#.', '#.#', '###', '#.#', '#.#'], space: ['...', '...', '...', '...', '...'],
};
const FONT_SPRITES = {};
for (const key of Object.keys(GLYPHS)) {
  const bm = GLYPHS[key];
  const g = rowsOf(4, 6, (x, y) => {
    if (y < 5 && x < 3 && bm[y][x] === '#') return 'w';
    if (y >= 1 && x >= 1 && y - 1 < 5 && x - 1 < 3 && bm[y - 1][x - 1] === '#') return 'k';
    return null;
  });
  FONT_SPRITES[key] = g;
}

// ---------- Sprite-Tabelle ----------
// Schlüssel = Name im Atlas. frames: Zeichenraster; vflip: zusätzlich kopfüber als `${name}_v`; flip: gespiegelt.
const THEME_TILES = (theme) => {
  const pal = THEME_PALS[theme];
  const x = THEME_EXTRA[theme];
  return {
    [`${theme}/ground_top`]: { pal, frames: [groundTex(true)], flip: false },
    [`${theme}/ground`]: { pal, frames: [groundTex(false)], flip: false },
    [`${theme}/brick`]: { pal: x.brick, frames: [brickTex()], flip: false },
    [`${theme}/hard`]: { pal: x.hard, frames: [hardTex()], flip: false },
    [`${theme}/bonus`]: { pal: x.bonus, frames: [0, 1, 2].map(bonusTex), flip: false },
    [`${theme}/used`]: { pal: pal, frames: [usedTex()], flip: false },
    [`${theme}/plat_l`]: { pal: x.plat, frames: [platPiece(true, false)], flip: false },
    [`${theme}/plat_m`]: { pal: x.plat, frames: [platPiece(false, false)], flip: false },
    [`${theme}/plat_r`]: { pal: x.plat, frames: [platPiece(false, true)], flip: false },
    [`${theme}/plat_s`]: { pal: x.plat, frames: [platPiece(true, true)], flip: false },
    [`${theme}/pipe_cl`]: { pal: x.pipe, frames: [PIPE_CAP('l')], flip: false },
    [`${theme}/pipe_cr`]: { pal: x.pipe, frames: [PIPE_CAP('r')], flip: false },
    [`${theme}/pipe_bl`]: { pal: x.pipe, frames: [PIPE_BODY('l')], flip: false },
    [`${theme}/pipe_br`]: { pal: x.pipe, frames: [PIPE_BODY('r')], flip: false },
    [`${theme}/lava`]: { pal: PAL_LAVA, frames: [LAVA_BODY], flip: false },
    [`${theme}/lava_surf`]: { pal: PAL_LAVA, frames: LAVA_SURF, flip: false },
    [`${theme}/spikes`]: { pal: PAL_SPIKES, frames: [SPIKE_TILE], flip: false },
    [`${theme}/debris`]: { pal: x.brick, frames: [['.bbb', 'bdab', 'bbcb', 'dddd']], flip: false },
    [`${theme}/deco`]: {
      pal,
      frames: [theme === 'meadow' ? DECO_BUSH : theme === 'cave' ? DECO_CRYSTAL : DECO_TORCH],
      flip: false,
    },
  };
};

export const SPRITES = {
  // Held: klein (Feuer = Palette fire, Sterne = Palette star0..2)
  pl_s_n: { pal: PAL_PLAYER, frames: SMALL_FRAMES, flip: true },
  pl_s_0: { pal: PAL_STAR[0], frames: SMALL_FRAMES, flip: true },
  pl_s_1: { pal: PAL_STAR[1], frames: SMALL_FRAMES, flip: true },
  pl_s_2: { pal: PAL_STAR[2], frames: SMALL_FRAMES, flip: true },
  pl_b_n: { pal: PAL_PLAYER, frames: BIG_FRAMES, flip: true },
  pl_b_f: { pal: PAL_FIRE, frames: BIG_FRAMES, flip: true },
  pl_b_0: { pal: PAL_STAR[0], frames: BIG_FRAMES, flip: true },
  pl_b_1: { pal: PAL_STAR[1], frames: BIG_FRAMES, flip: true },
  pl_b_2: { pal: PAL_STAR[2], frames: BIG_FRAMES, flip: true },
  // Gegner
  walker: { pal: PAL_WALKER, frames: [WALKER, WALKER_STEP], flip: true, vflip: true },
  walker_sq: { pal: PAL_WALKER, frames: [WALKER_SQ], flip: true },
  beetle: { pal: PAL_BEETLE, frames: [BEETLE_1, BEETLE_2], flip: true, vflip: true },
  beetle_shell: { pal: PAL_BEETLE, frames: [BEETLE_SHELL], flip: false, vflip: true },
  hopper: { pal: PAL_HOPPER, frames: [HOPPER_SIT, HOPPER_HOP], flip: true, vflip: true },
  hopper_sq: { pal: PAL_HOPPER, frames: [HOPPER_SQ], flip: true },
  spiky: { pal: PAL_SPIKY, frames: [SPIKY_1, SPIKY_2], flip: true, vflip: true },
  lavaball: { pal: PAL_LAVABALL, frames: LAVABALL, flip: false },
  // Bosse
  rootking: { pal: PAL_ROOT, frames: [rootKing(0), rootKing(1)], flip: true, vflip: true },
  golem: { pal: PAL_GOLEM, frames: [golem(0), golem(1)], flip: false, vflip: true },
  dragon: { pal: PAL_DRAGON, frames: [dragon(0), dragon(1)], flip: true, vflip: true },
  // Gegenstände
  it_mush: { pal: PAL_MUSH, frames: [MUSH], flip: false },
  it_1up: { pal: PAL_1UP, frames: [MUSH], flip: false },
  it_flower: { pal: PAL_FLOWER, frames: [FLOWER], flip: false },
  it_star: { pal: PAL_STARITEM, frames: STAR_ITEM, flip: false },
  coin: { pal: PAL_COIN, frames: COIN, flip: false },
  coinstar: { pal: PAL_COINSTAR, frames: COINSTAR, flip: false },
  starslot: { pal: PAL_SLOT, frames: STARSLOT, flip: false },
  fireball: { pal: PAL_FIREBALL, frames: FIREBALL, flip: false },
  rock: { pal: PAL_ROCK, frames: ROCK, flip: false },
  flame: { pal: PAL_FLAME, frames: FLAME, flip: true },
  cp_off: { pal: PAL_CHECK, frames: [CHECKPOINT[0]], flip: false },
  cp_on: { pal: PAL_CHECK, frames: [CHECKPOINT[1]], flip: false },
  goal: { pal: PAL_GOAL, frames: [GOAL], flip: false },
  pause: { pal: PAL_PAUSE, frames: [rowsOf(24, 24, (x, y) => {
    if (x < 1 || y < 1 || x > 22 || y > 22) return null;
    if (x <= 1 || y <= 1 || x >= 22 || y >= 22) return 'O';
    if ((x >= 7 && x <= 9) || (x >= 14 && x <= 16)) return (y >= 6 && y <= 17) ? 'x' : 'o';
    return 'o';
  })], flip: false },
  // Schrift
  ...Object.fromEntries(Object.keys(FONT_SPRITES).map((k) => [`font_${k}`, { pal: PAL_FONT, frames: [FONT_SPRITES[k]], flip: false }])),
  ...THEME_TILES('meadow'), ...THEME_TILES('cave'), ...THEME_TILES('castle'),
};

// Bedien-Knöpfe: Kreis mit Symbol, Frame 0 = normal, 1 = gedrückt. Radien wie PLAN §7.
const BTN_R = { left: 24, right: 24, jump: 30, fire: 20 };
function buttonFrames(id, down) {
  const r = BTN_R[id];
  const size = 2 * r + 1;
  const pal = down ? PAL_BTN.down : PAL_BTN.up;
  return rowsOf(size, size, (x, y) => {
    const dx = x - r, dy = y - r;
    const d2 = dx * dx + dy * dy;
    if (d2 > r * r) return null;
    if (d2 > (r - 2) * (r - 2)) return 'O';
    let sym = false;
    const s = r * 0.42;
    if (id === 'left') sym = dx <= 0 && dx >= -s && Math.abs(dy) <= (s + dx) * 0.9;
    if (id === 'right') sym = dx >= 0 && dx <= s && Math.abs(dy) <= (s - dx) * 0.9;
    if (id === 'jump') sym = dy <= 0 && dy >= -s && Math.abs(dx) <= (s + dy) * 0.9;
    if (id === 'fire') sym = (dy >= -s * 0.2 && dy <= s * 0.9 && dx * dx + (dy - s * 0.25) ** 2 <= (s * 0.55) ** 2) || (dy < s * 0.2 && dy >= -s && Math.abs(dx) <= (dy + s) * 0.35);
    return sym ? 'x' : 'o';
  });
}
for (const id of Object.keys(BTN_R)) {
  SPRITES[`btn_${id}`] = { pal: PAL_BTN.up, frames: [buttonFrames(id, false), buttonFrames(id, true)], flip: false, palByFrame: [PAL_BTN.up, PAL_BTN.down] };
}

// Prüft alle Raster auf gleiche Breite pro Sprite. Gibt Fehlertexte zurück (leer = ok).
export function checkSprites() {
  const errs = [];
  for (const [name, def] of Object.entries(SPRITES)) {
    def.frames.forEach((g, i) => {
      const w = g[0].length;
      g.forEach((row, y) => { if (row.length !== w) errs.push(`${name} frame ${i} row ${y}: ${row.length} statt ${w}`); });
    });
  }
  return errs;
}

// ---------- Atlas ----------
function parseColor(hex) {
  if (hex === '.' || hex === undefined) return 0;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  // Little-endian ABGR für Uint32Array
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
const BLANK = { sx: 0, sy: 0, w: 1, h: 1 };

// Gleicht Zeilen auf die häufigste Breite an: überlange Zeilen verlieren rechts Punkte, kurze erhalten Punkte.
function fitGrid(g) {
  const count = new Map();
  for (const r of g) count.set(r.length, (count.get(r.length) || 0) + 1);
  let w = g[0].length, best = -1;
  for (const [len, n] of count) if (n > best) { best = n; w = len; }
  return g.map((r) => {
    let s = r;
    while (s.length > w && s.endsWith('.')) s = s.slice(0, -1);
    if (s.length > w) s = s.slice(0, w);
    return s.padEnd(w, '.');
  });
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Baut alle Sprites in ein Atlas-Canvas. Rückgabe: { atlas, get(name, frame, flip) }.
export function buildSprites() {
  // Liste der Einträge inkl. vertikal gespiegelter Varianten.
  const entries = [];
  for (const [name, def] of Object.entries(SPRITES)) {
    const pal = def.palByFrame ? null : def.pal;
    const frames = def.frames.map((g, i) => ({ g, pal: def.palByFrame ? def.palByFrame[i] : pal }));
    entries.push({ name, frames, flip: def.flip !== false });
    if (def.vflip) {
      entries.push({ name: `${name}_v`, frames: [{ g: [...def.frames[0]].reverse(), pal: pal || def.pal }], flip: def.flip !== false });
    }
  }
  // Schrift und Knöpfe brauchen eigene Paletten je Frame, siehe oben.

  // Palettentabellen vorbereiten: Zeichen -> u32.
  const palCache = new Map();
  const palTable = (pal) => {
    let t = palCache.get(pal);
    if (!t) {
      t = {};
      for (const k of Object.keys(pal)) t[k] = parseColor(pal[k]);
      palCache.set(pal, t);
    }
    return t;
  };

  // Zeilenpacken (Regal): Breite 512.
  const ATLAS_W = 512;
  const index = Object.create(null);
  let x = 0, y = 0, rowH = 0;
  const placed = [];
  // Ein Platz für den leeren Sprite (1×1).
  const place = (w, h) => {
    if (x + w > ATLAS_W) { x = 0; y += rowH + 1; rowH = 0; }
    const at = { sx: x, sy: y, w, h };
    x += w + 1;
    rowH = Math.max(rowH, h);
    return at;
  };
  index.__blank = { n: 1, rects: [BLANK, BLANK] };
  const blank = place(1, 1);
  Object.assign(BLANK, { sx: blank.sx, sy: blank.sy });
  for (const e of entries) {
    const n = e.frames.length;
    const rects = new Array(n * 2);
    for (let i = 0; i < n; i++) {
      const g = (e.frames[i].g = fitGrid(e.frames[i].g));
      const w = g[0].length, h = g.length;
      rects[i * 2] = place(w, h);
      rects[i * 2 + 1] = place(w, h);
      placed.push({ e, i, normal: rects[i * 2], flipped: rects[i * 2 + 1], g, pal: e.frames[i].pal });
    }
    index[e.name] = { n, rects, flip: e.flip };
  }
  const ATLAS_H = Math.max(1, y + rowH + 1);

  const canvas = makeCanvas(ATLAS_W, ATLAS_H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(ATLAS_W, ATLAS_H);
  const px = new Uint32Array(img.data.buffer);

  for (const p of placed) {
    const t = palTable(p.pal);
    const { g, normal, flipped } = p;
    const w = normal.w, h = normal.h;
    for (let yy = 0; yy < h; yy++) {
      const row = g[yy];
      for (let xx = 0; xx < w; xx++) {
        const ch = row[xx];
        const c = ch === '.' || t[ch] === undefined ? 0 : t[ch];
        px[(normal.sy + yy) * ATLAS_W + normal.sx + xx] = c;
        px[(flipped.sy + yy) * ATLAS_W + flipped.sx + (w - 1 - xx)] = c;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  index.__blank.rects[0] = BLANK;
  index.__blank.rects[1] = BLANK;

  // get: ohne Allokation; fehlende Namen liefern das leere Feld.
  function get(name, frame = 0, flip = false) {
    const e = index[name];
    if (!e) return BLANK;
    const i = (frame % e.n + e.n) % e.n;
    return e.rects[i * 2 + (flip ? 1 : 0)];
  }
  return { atlas: canvas, get, size: { w: ATLAS_W, h: ATLAS_H } };
}
