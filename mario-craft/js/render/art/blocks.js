// Blockwelt-Texturen (PLAN §3, §7, §8). Reine Daten, erzeugt aus festen Seeds:
// deterministisch (mulberry32, kein Math.random), kein DOM, keine Imports.
// Raster 16×16, '.' = transparent. Licht kommt von oben links, alle Kacheln sind nahtlos.

const T = 16;
const N = T * T;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (v) => ((v % T) + T) % T;
const at = (x, y) => wrap(y) * T + wrap(x);
const blank = () => new Array(N).fill('.');
const put = (a, x, y, ch) => { a[at(x, y)] = ch; };
const toRows = (a) => {
  const rows = [];
  for (let y = 0; y < T; y++) rows.push(a.slice(y * T, y * T + T).join(''));
  return rows;
};
const tex = (pal, frames) => ({ pal, frames, flip: false });

// Periodische 3×3-Glättung (haelt Kacheln nahtlos)
function smooth(a) {
  const o = new Array(N);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += a[at(x + dx, y + dy)];
      o[y * T + x] = s / 9;
    }
  }
  return o;
}

// Wertefeld: geglättet (passes), mit Körnung (grain), Licht von oben links (light)
function field(r, { passes = 1, grain = 0.3, light = 0 } = {}) {
  const raw = Array.from({ length: N }, () => r());
  let s = raw;
  for (let i = 0; i < passes; i++) s = smooth(s);
  const out = new Array(N);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = y * T + x;
      out[i] = s[i] * (1 - grain) + raw[i] * grain + light * (1 - (x + y) / 30);
    }
  }
  return out;
}

// Zeichen nach Rang zuordnen: spec = [[zeichen, anteil], ...] von dunkel nach hell
function ranked(values, spec) {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const out = new Array(N);
  let acc = 0;
  let k = 0;
  for (const [ch, share] of spec) {
    acc += share;
    const end = Math.round(acc * N);
    for (; k < end && k < N; k++) out[order[k]] = ch;
  }
  while (k < N) out[order[k++]] = spec[spec.length - 1][0];
  return out;
}

function quantile(values, q) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(q * (s.length - 1))];
}

// ---------- Seeds (fest, damit Ausgabe stabil bleibt) ----------
const SEED = {
  grass: 11, dirt: 12, sand: 13, stone: 50, cobble: 14, stonebrick: 15, planks: 16, log: 17,
  leaves: 18, coal: 19, iron: 20, gold: 21, diamond: 22, tnt: 23, spawner: 24, obsidian: 25,
  bedrock: 26, netherrack: 27, netherbrick: 28, glowstone: 29, endstone: 30, chest: 31,
  slab: 32, ladder: 33, vine: 34, lava: 35, water: 36, slime: 37, torch: 38, plant: 39,
  wdirt: 40, wstone: 41, wnether: 42, wend: 43, crack: 44,
};

// ---------- Paletten ----------
const PAL_GRASS = { 1: '#7cc24a', 2: '#56a435', 3: '#3d7d25', 4: '#8f5d36', 5: '#6e4327', 6: '#a8714a' };
const PAL_DIRT = { 4: '#8f5d36', 5: '#6e4327', 6: '#a8714a', 7: '#55341d' };
const PAL_SAND = { 1: '#f4e6b4', 2: '#e2cc86', 3: '#c4ad68', 4: '#d6c07a' };
const PAL_STONE = { 1: '#a3a3a3', 2: '#8a8a8a', 3: '#66666a', 4: '#4b4b50' };
const PAL_COBBLE = { 1: '#a9a9a9', 2: '#8c8c8c', 3: '#6e6e6e', 4: '#4a4a4a' };
const PAL_STONEBRICK = { 1: '#a6a9ac', 2: '#8a8d90', 3: '#666a6e', 4: '#4a4d50', 5: '#55585b' };
const PAL_PLANKS = { 1: '#cd9d62', 2: '#b6854c', 3: '#9a6b3a', 4: '#6b4424' };
const PAL_LOG = { 1: '#8a6440', 2: '#6e4a2c', 3: '#55381f', 4: '#3a2615' };
const PAL_LEAVES = { 1: '#4f9a3c', 2: '#3a7d2d', 3: '#2a5e21', 4: '#1d4519' };
const PAL_TNT = { 1: '#e0523f', 2: '#c0392b', 3: '#8e2519', 4: '#f2efe6', 5: '#3a1a14' };
const PAL_SPAWNER = { g: '#ffb347', h: '#c4602a', i: '#5c2612', k: '#2a2a30', j: '#34343c', d: '#14141a' };
const PAL_OBSIDIAN = { 1: '#2b1b46', 2: '#1d1230', 3: '#120a1f', 4: '#4a3675' };
const PAL_BEDROCK = { 1: '#4d4d4f', 2: '#363638', 3: '#232325', 4: '#131314', 5: '#6a6a6c' };
const PAL_NETHERRACK = { 1: '#a24e3c', 2: '#8a3a30', 3: '#6e2a24', 4: '#4f1c18', 5: '#3a1210' };
const PAL_NETHERBRICK = { 1: '#7a2a30', 2: '#5c1c23', 3: '#40121a', 4: '#25090d' };
const PAL_GLOW = { 1: '#fff3b0', 2: '#ffd95a', 3: '#f2b33c', 4: '#c98a22', 5: '#b06d18' };
const PAL_ENDSTONE = { 1: '#fbf7d6', 2: '#efe6a6', 3: '#dcd28a', 4: '#c4b96a', 5: '#a89f55' };
const PAL_CHEST = { o: '#3d2210', 1: '#c28a4a', 2: '#a06a34', 3: '#7a4c24', 4: '#f0c64a', 5: '#a07c20' };
const PAL_CHESTOPEN = { o: '#3d2210', 1: '#c28a4a', 2: '#a06a34', 3: '#7a4c24', i: '#2a1608', j: '#4a2e16' };
const PAL_LADDER = { 1: '#c9955a', 2: '#a8723c', 3: '#6e4524' };
const PAL_VINE = { 1: '#6fbf4a', 2: '#3f8f2e', 3: '#2a6320' };
const PAL_LAVA = { 1: '#a8320f', 2: '#e0531a', 3: '#ff8c1a', 4: '#ffd23f', 5: '#ffe985' };
const PAL_WATER = { 1: '#8ec5ffcc', 2: '#3d7fe0b0', 3: '#2456b8d0', 4: '#d8f0ffe6' };
const PAL_SLIME = { 1: '#d6ffc0d8', 2: '#8ee87aa8', 3: '#4cc24ccc', 4: '#2f9a3fd0' };
const PAL_TORCH = { 1: '#9a6a3a', 2: '#7a4e2a', 3: '#55351c', 4: '#fff27a', 5: '#ffb13b', 6: '#ff6a1a' };
const PAL_PLANT = { 1: '#7fcf4e', 2: '#4f9e33', 3: '#2f6f22', 4: '#e0343a', 5: '#f5d742', 6: '#f7f7f0' };
const PAL_WDIRT = { 1: '#5a4836', 2: '#4a3a2b', 3: '#3c2f22', 4: '#30261c' };
const PAL_WSTONE = { 1: '#5a5a5e', 2: '#4a4a4e', 3: '#3c3c40', 4: '#2f2f33' };
const PAL_WNETHER = { 1: '#4d1f1d', 2: '#3f1716', 3: '#321112', 4: '#260c0d' };
const PAL_WEND = { 1: '#5a5739', 2: '#4a4730', 3: '#3c3a26', 4: '#2f2d1d' };
const PAL_CRACK = { 1: '#100c09ee', 2: '#2b221bcc' };

// ---------- Generatoren ----------

function grassTex() {
  const r = mulberry32(SEED.grass);
  const a = blank();
  // unregelmäßige Kante: Grasschicht 3 oder 4 px tief
  const depth = Array.from({ length: T }, () => (r() < 0.5 ? 3 : 4));
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const d = depth[x];
      const n = r();
      let ch;
      if (y < d) {
        if (y === 0) ch = n < 0.6 ? '1' : '2';
        else if (y === d - 1) ch = n < 0.45 ? '3' : '2';
        else ch = n < 0.2 ? '3' : n < 0.5 ? '1' : '2';
      } else if (y === d && d === 3 && n < 0.35) {
        ch = '3'; // hängender Grashalm
      } else {
        ch = n < 0.08 ? '6' : n < 0.35 ? '5' : '4';
      }
      put(a, x, y, ch);
    }
  }
  return tex(PAL_GRASS, [toRows(a)]);
}

function dirtTex() {
  const f = field(mulberry32(SEED.dirt), { passes: 1, grain: 0.7, light: 0.1 });
  return tex(PAL_DIRT, [toRows(ranked(f, [['7', 0.1], ['5', 0.3], ['4', 0.35], ['6', 0.25]]))]);
}

function sandTex() {
  const f = field(mulberry32(SEED.sand), { passes: 0, grain: 1, light: 0.1 });
  return tex(PAL_SAND, [toRows(ranked(f, [['3', 0.15], ['4', 0.3], ['2', 0.35], ['1', 0.2]]))]);
}

// Stein-Basis (auch Grundlage für Erze und Infested)
function stoneFlat(seed) {
  const f = field(mulberry32(seed), { passes: 1, grain: 0.45, light: 0.12 });
  return ranked(f, [['4', 0.08], ['3', 0.3], ['2', 0.37], ['1', 0.25]]);
}

function stoneTex(seed) {
  return tex(PAL_STONE, [toRows(stoneFlat(seed))]);
}

function cobbleTex() {
  const r = mulberry32(SEED.cobble);
  const a = blank();
  for (let band = 0; band < 4; band++) {
    const y0 = band * 4;
    // Steinbreiten einer Reihe, Summe = 16
    const widths = [];
    let s = 0;
    while (s < T) {
      let w = 3 + Math.floor(r() * 4);
      if (T - (s + w) < 3) w = T - s;
      widths.push(w);
      s += w;
    }
    const off = band % 2 === 0 ? 0 : 1 + Math.floor(r() * 3);
    const sid = [];
    const start = new Array(T).fill(false);
    let pos = 0;
    widths.forEach((w, i) => {
      start[pos] = true;
      for (let k = 0; k < w; k++) sid.push(i);
      pos += w;
    });
    const tone = widths.map(() => (r() < 0.3 ? '1' : r() < 0.7 ? '2' : '3'));
    for (let x = 0; x < T; x++) {
      const sx = wrap(x - off);
      for (let k = 0; k < 4; k++) {
        const n = r();
        let ch;
        if (k === 0 || start[sx]) ch = '4'; // Fuge
        else if (k === 1) ch = '1';         // Lichtkante oben
        else if (k === 3) ch = '3';         // Schattenkante unten
        else ch = n < 0.12 ? '3' : tone[sid[sx]];
        put(a, x, y0 + k, ch);
      }
    }
  }
  return tex(PAL_COBBLE, [toRows(a)]);
}

function stonebrickTex() {
  const r = mulberry32(SEED.stonebrick);
  const a = blank();
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const lx = x % 8;
      const ly = y % 8;
      const n = r();
      let ch;
      if (lx === 7 || ly === 7) ch = '4';
      else if (lx === 0 || ly === 0) ch = '1';
      else if (lx === 6 || ly === 6) ch = '3';
      else ch = n < 0.08 ? '5' : n < 0.14 ? '3' : '2';
      put(a, x, y, ch);
    }
  }
  return tex(PAL_STONEBRICK, [toRows(a)]);
}

const PLANK_JOINTS = [[7], [3, 11], [5], [1, 12]];
function planksFlat(r, rows) {
  const a = blank();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < T; x++) {
      const g = y >> 2;
      const ly = y & 3;
      const n = r();
      let ch;
      if (ly === 3 || PLANK_JOINTS[g].includes(x)) ch = '4';
      else if (ly === 0) ch = n < 0.6 ? '1' : '2';
      else ch = n < 0.15 ? '3' : n < 0.3 ? '1' : '2';
      put(a, x, y, ch);
    }
  }
  return a;
}

function planksTex() {
  return tex(PAL_PLANKS, [toRows(planksFlat(mulberry32(SEED.planks), T))]);
}

function logTex() {
  const r = mulberry32(SEED.log);
  const a = blank();
  // senkrechte Maserung: jede Spalte hat eigenen Grundton
  const col = Array.from({ length: T }, () => {
    const n = r();
    return n < 0.25 ? '3' : n < 0.45 ? '1' : '2';
  });
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const n = r();
      let ch = col[x];
      if (n < 0.07) ch = '4';                 // Rindenrisse
      else if (x === 0 && ch === '2') ch = '1';
      put(a, x, y, ch);
    }
  }
  return tex(PAL_LOG, [toRows(a)]);
}

function leavesTex() {
  const f = field(mulberry32(SEED.leaves), { passes: 1, grain: 0.4, light: 0.15 });
  const flat = ranked(f, [['4', 0.2], ['3', 0.3], ['2', 0.3], ['1', 0.2]]);
  const cut = quantile(f, 0.22);
  for (let i = 0; i < N; i++) if (f[i] < cut) flat[i] = '.'; // Löcher
  return tex(PAL_LEAVES, [toRows(flat)]);
}

// Erz = Stein-Basis + farbige Flecken ('a' Hauptfarbe, 'b' Glanz oben links)
function oreTex(seed, count, main, hi) {
  const r = mulberry32(seed);
  const a = stoneFlat(SEED.stone);
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(r() * T);
    const cy = Math.floor(r() * T);
    const cells = [[cx, cy]];
    if (r() < 0.9) cells.push([cx + 1, cy]);
    if (r() < 0.8) cells.push([cx, cy + 1]);
    if (r() < 0.7) cells.push([cx - 1, cy]);
    if (r() < 0.6) cells.push([cx, cy - 1]);
    if (r() < 0.5) cells.push([cx + 1, cy + 1]);
    if (r() < 0.4) cells.push([cx - 1, cy + 1]);
    const has = (x, y) => cells.some(([u, v]) => wrap(u) === wrap(x) && wrap(v) === wrap(y));
    for (const [x, y] of cells) put(a, x, y, has(x - 1, y) || has(x, y - 1) ? 'a' : 'b');
  }
  return tex({ ...PAL_STONE, a: main, b: hi }, [toRows(a)]);
}

function tntTex() {
  const r = mulberry32(SEED.tnt);
  const a = blank();
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const n = r();
      let ch;
      if (x === 0 || y === 0 || x === 15 || y === 15) ch = '3';
      else if (y >= 4 && y <= 10) ch = '4';                 // weißes Band
      else if (x === 1 || y === 1) ch = '1';
      else ch = n < 0.15 ? '3' : n < 0.35 ? '1' : '2';
      put(a, x, y, ch);
    }
  }
  // Schrift-Andeutung "TNT" auf dem Band
  const LETTERS = {
    T: ['###', '.#.', '.#.', '.#.', '.#.'],
    N: ['#.#', '##.', '#.#', '#.#', '#.#'],
  };
  ['T', 'N', 'T'].forEach((w, i) => {
    const x0 = 2 + i * 4;
    LETTERS[w].forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) if (row[dx] === '#') put(a, x0 + dx, 5 + dy, '5');
    });
  });
  return tex(PAL_TNT, [toRows(a)]);
}

function spawnerTex() {
  const r = mulberry32(SEED.spawner);
  const a = blank();
  const BARS = [2, 6, 9, 13];
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const n = r();
      let ch;
      if (BARS.includes(x) || BARS.includes(y)) {
        ch = 'd'; // Käfigstäbe
      } else {
        const t = Math.hypot(x - 7.5, y - 7.5) / 9;
        ch = t < 0.35 ? 'g' : t < 0.6 ? 'h' : t < 0.85 ? 'i' : n < 0.5 ? 'k' : 'j';
      }
      put(a, x, y, ch);
    }
  }
  return tex(PAL_SPAWNER, [toRows(a)]);
}

function obsidianTex() {
  const f = field(mulberry32(SEED.obsidian), { passes: 1, grain: 0.5, light: 0.05 });
  const flat = ranked(f, [['3', 0.3], ['2', 0.5], ['1', 0.2]]);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      if (wrap(x - y) === 3 || wrap(x - y) === 9) {
        if (f[at(x, y)] > 0.35) put(flat, x, y, '4'); // dezenter Glanzstreifen
      }
    }
  }
  return tex(PAL_OBSIDIAN, [toRows(flat)]);
}

function bedrockTex() {
  const r = mulberry32(SEED.bedrock);
  const a = blank();
  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      const v = r();
      const ch = v < 0.25 ? '1' : v < 0.55 ? '2' : v < 0.85 ? '3' : '4';
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) put(a, bx * 2 + dx, by * 2 + dy, ch);
    }
  }
  for (let i = 0; i < N; i++) if (r() < 0.03) a[i] = '5';
  return tex(PAL_BEDROCK, [toRows(a)]);
}

function netherrackTex() {
  const f = field(mulberry32(SEED.netherrack), { passes: 1, grain: 0.35, light: 0.1 });
  return tex(PAL_NETHERRACK, [toRows(ranked(f, [['5', 0.12], ['4', 0.2], ['3', 0.28], ['2', 0.25], ['1', 0.15]]))]);
}

function netherbrickTex() {
  const r = mulberry32(SEED.netherbrick);
  const a = blank();
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const band = y >> 2;
      const ly = y & 3;
      const joint = (x + (band % 2) * 4) % 8 === 7;
      const n = r();
      let ch;
      if (ly === 3 || joint) ch = '4';
      else if (ly === 0) ch = n < 0.7 ? '1' : '2';
      else if (ly === 2) ch = '3';
      else ch = n < 0.12 ? '3' : '2';
      put(a, x, y, ch);
    }
  }
  return tex(PAL_NETHERBRICK, [toRows(a)]);
}

function glowstoneTex() {
  const f = field(mulberry32(SEED.glowstone), { passes: 1, grain: 0.5 });
  return tex(PAL_GLOW, [toRows(ranked(f, [['5', 0.08], ['4', 0.2], ['3', 0.34], ['2', 0.25], ['1', 0.13]]))]);
}

function endstoneTex() {
  const f = field(mulberry32(SEED.endstone), { passes: 0, grain: 1, light: 0.1 });
  return tex(PAL_ENDSTONE, [toRows(ranked(f, [['5', 0.08], ['4', 0.12], ['3', 0.3], ['2', 0.28], ['1', 0.22]]))]);
}

// Truhenkörper (y 7..14) mit Seitenbändern; Deckel-/Rand-Zeilen bauen die Aufrufer
function chestBody(a, r, lock) {
  for (let y = 7; y <= 14; y++) {
    for (let x = 1; x <= 14; x++) {
      const n = r();
      let ch = n < 0.15 ? '3' : n < 0.25 ? '1' : '2';
      if (y === 7) ch = '1';
      if (x === 3 || x === 12) ch = '3';
      put(a, x, y, ch);
    }
  }
  if (lock) {
    for (let y = 6; y <= 9; y++) for (let x = 7; x <= 8; x++) put(a, x, y, '4');
    for (let y = 6; y <= 9; y++) put(a, 8, y, '5');
    for (let x = 7; x <= 8; x++) put(a, x, 9, '5');
  }
}

function chestTex() {
  const r = mulberry32(SEED.chest);
  const a = blank();
  for (let x = 0; x < T; x++) { put(a, x, 0, 'o'); put(a, x, 15, 'o'); }
  for (let y = 0; y < T; y++) { put(a, 0, y, 'o'); put(a, 15, y, 'o'); }
  for (let x = 1; x <= 14; x++) {
    put(a, x, 6, 'o');                                  // Deckelnaht
    put(a, x, 1, '1');                                  // Deckel-Lichtkante
    for (let y = 2; y <= 5; y++) {
      const n = r();
      put(a, x, y, n < 0.15 ? '3' : n < 0.3 ? '1' : '2');
    }
  }
  chestBody(a, r, true);
  return tex(PAL_CHEST, [toRows(a)]);
}

function chestOpenTex() {
  const r = mulberry32(SEED.chest + 1000);
  const a = blank();
  for (let x = 0; x < T; x++) { put(a, x, 0, 'o'); put(a, x, 4, 'o'); put(a, x, 6, 'o'); put(a, x, 15, 'o'); }
  for (let y = 0; y < T; y++) { put(a, 0, y, 'o'); put(a, 15, y, 'o'); }
  for (let x = 1; x <= 14; x++) {
    put(a, x, 1, '1');
    for (let y = 2; y <= 3; y++) put(a, x, y, r() < 0.2 ? '3' : '2');
    put(a, x, 5, r() < 0.3 ? 'j' : 'i');                // Inneres der Truhe
  }
  chestBody(a, r, false);
  return tex(PAL_CHESTOPEN, [toRows(a)]);
}

function slabTex() {
  return tex(PAL_PLANKS, [toRows(planksFlat(mulberry32(SEED.slab), 8))]);
}

function ladderTex() {
  const a = blank();
  for (let y = 0; y < T; y++) {
    put(a, 2, y, '1');
    put(a, 3, y, '2');
    put(a, 12, y, '2');
    put(a, 13, y, '3');
  }
  for (const y of [2, 6, 10, 14]) {
    for (let x = 2; x <= 13; x++) {
      put(a, x, y, '1');
      put(a, x, y + 1, '3');
    }
  }
  return tex(PAL_LADDER, [toRows(a)]);
}

function vineTex() {
  const r = mulberry32(SEED.vine);
  const a = blank();
  const strands = [
    { x: 3, to: 15, wiggle: true },
    { x: 9, to: 9, wiggle: false },
    { x: 13, to: 14, wiggle: false },
  ];
  for (const s of strands) {
    for (let y = 0; y <= s.to; y++) {
      const x = s.wiggle && (y === 7 || y === 8) ? s.x + 1 : s.x;
      put(a, x, y, '3');
      if (r() < 0.2) put(a, x + 1, y, r() < 0.5 ? '1' : '2'); // Blättchen
      if (r() < 0.12) put(a, x - 1, y, '2');
    }
  }
  return tex(PAL_VINE, [toRows(a)]);
}

function plantTex() {
  const r = mulberry32(SEED.plant);
  const a = blank();
  for (const base of [1, 4, 7, 10, 13]) {
    const cx = base + Math.floor(r() * 2);
    const h = 3 + Math.floor(r() * 4);
    const lean = r() < 0.5 ? -1 : 1;
    for (const o of [-1, 0, 1]) {
      if (r() < 0.25) continue;
      for (let k = 0; k < h; k++) {
        const x = cx + o + (k === h - 1 ? lean : 0);
        const ch = k === h - 1 ? '1' : r() < 0.5 ? '2' : '3';
        put(a, x, 15 - k, ch);
      }
    }
    if (r() < 0.4) put(a, cx + lean, 15 - h, ['4', '5', '6'][Math.floor(r() * 3)]); // Blüte
  }
  return tex(PAL_PLANT, [toRows(a)]);
}

function lavaTex() {
  const base = field(mulberry32(SEED.lava), { passes: 1, grain: 0.4 });
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const vals = base.map((v, i) => {
      const x = i % T;
      const y = (i - x) / T;
      return v
        + 0.25 * Math.sin((2 * Math.PI * (x + y)) / T + (f * Math.PI) / 2)
        + 0.2 * Math.cos((2 * Math.PI * (2 * x - y)) / T + (f * Math.PI) / 2);
    });
    frames.push(toRows(ranked(vals, [['1', 0.12], ['2', 0.25], ['3', 0.3], ['4', 0.2], ['5', 0.13]])));
  }
  return tex(PAL_LAVA, frames);
}

function waterTex() {
  const base = field(mulberry32(SEED.water), { passes: 1, grain: 0.6 });
  const deep = ranked(base, [['3', 0.3], ['2', 0.7]]);
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const a = blank();
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const w = [0, 1, 2, 1][y % 4];
        let ch = deep[y * T + x];
        if (y === 0) ch = (x + 2 * f) % 5 === 0 ? '4' : '1';            // Oberfläche
        else if (y % 8 === 1 && wrap(x + 2 * f + w) % 8 < 3) ch = '1';  // wandernde Wellen
        put(a, x, y, ch);
      }
    }
    frames.push(toRows(a));
  }
  return tex(PAL_WATER, frames);
}

function slimeTex() {
  const r = mulberry32(SEED.slime);
  const a = blank();
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      if ((x === 0 || x === 15) && (y === 0 || y === 15)) continue; // abgerundete Ecken
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const core = x >= 5 && x <= 10 && y >= 5 && y <= 10;
      const n = r();
      let ch;
      if (edge) ch = '3';
      else if (core) ch = '4';
      else if (x + y < 5 && n < 0.7) ch = '1';
      else ch = '2';
      put(a, x, y, ch);
    }
  }
  return tex(PAL_SLIME, [toRows(a)]);
}

function torchTex() {
  const r = mulberry32(SEED.torch);
  const SWAY = [0, 0.5, 0, -0.5];
  const TOP = [1, 1, 2, 1];
  const H = [6, 5, 6, 5];
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const a = blank();
    for (let y = 7; y < T; y++) { put(a, 7, y, '1'); put(a, 8, y, '3'); } // Stab
    const cx = 7.5 + SWAY[f];
    for (let y = TOP[f]; y < TOP[f] + H[f]; y++) {
      const t = (y - TOP[f]) / H[f];
      const hw = 3 * (1 - Math.abs(t - 0.6) * 1.2);
      for (let x = 0; x < T; x++) {
        const dx = Math.abs(x + 0.5 - cx);
        if (dx > hw) continue;
        if (dx > hw - 0.8 && r() < 0.3) continue; // ausgefranster Rand
        put(a, x, y, dx < hw * 0.35 ? '4' : dx < hw * 0.7 ? '5' : '6');
      }
    }
    frames.push(toRows(a));
  }
  return tex(PAL_TORCH, frames);
}

function wallTex(seed, pal, spec, mortarGrid) {
  const flat = ranked(field(mulberry32(seed), { passes: 1, grain: 0.5, light: 0.05 }), spec);
  if (mortarGrid) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (x % 8 === 7 || y % 8 === 7) put(flat, x, y, '4');
    }
  }
  return tex(pal, [toRows(flat)]);
}

function crackTex() {
  const r = mulberry32(SEED.crack);
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  const paths = [];
  for (let p = 0; p < 4; p++) {
    const path = [];
    let x = 6 + Math.floor(r() * 4);
    let y = 6 + Math.floor(r() * 4);
    let dir = Math.floor(r() * 4);
    for (let s = 0; s < 18; s++) {
      if (x < 0 || x > 15 || y < 0 || y > 15) break;
      path.push([x, y]);
      if (r() < 0.35) dir = (dir + (r() < 0.5 ? 1 : 3)) % 4;
      x += DX[dir];
      y += DY[dir];
    }
    paths.push(path);
  }
  // Risse wachsen gleichzeitig nach außen: Punkte nach Schritt verschachtelt
  const order = [];
  for (let s = 0; s < 18; s++) for (const path of paths) if (path[s]) order.push(path[s]);
  const LIMIT = [8, 20, 36, 56];
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const a = blank();
    const shown = order.slice(0, LIMIT[f]);
    for (const [x, y] of shown) put(a, x, y, '1');
    if (f >= 2) {
      for (const [x, y] of shown) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx > 15 || ny > 15) continue;
          if (a[at(nx, ny)] === '.' && r() < 0.35) put(a, nx, ny, '2');
        }
      }
    }
    frames.push(toRows(a));
  }
  return tex(PAL_CRACK, frames);
}

// ---------- Export ----------
export const BLOCK_ART = {
  blk_grass: grassTex(),
  blk_dirt: dirtTex(),
  blk_sand: sandTex(),
  blk_stone: stoneTex(SEED.stone),
  blk_cobble: cobbleTex(),
  blk_stonebrick: stonebrickTex(),
  blk_planks: planksTex(),
  blk_log: logTex(),
  blk_leaves: leavesTex(),
  blk_coal: oreTex(SEED.coal, 4, '#1c1c1c', '#4d4d4d'),
  blk_iron: oreTex(SEED.iron, 4, '#d9a07c', '#f4d6bc'),
  blk_gold: oreTex(SEED.gold, 3, '#f5cd2c', '#fff3a6'),
  blk_diamondore: oreTex(SEED.diamond, 3, '#33d6c8', '#c9fff7'),
  blk_infested: stoneTex(SEED.stone), // identisch zu blk_stone
  blk_tnt: tntTex(),
  blk_spawner: spawnerTex(),
  blk_obsidian: obsidianTex(),
  blk_bedrock: bedrockTex(),
  blk_netherrack: netherrackTex(),
  blk_netherbrick: netherbrickTex(),
  blk_glowstone: glowstoneTex(),
  blk_endstone: endstoneTex(),
  blk_chest: chestTex(),
  blk_chestopen: chestOpenTex(),
  blk_slab: slabTex(),
  blk_ladder: ladderTex(),
  blk_vine: vineTex(),
  blk_lava: lavaTex(),
  blk_water: waterTex(),
  blk_slime: slimeTex(),
  blk_torch: torchTex(),
  blk_plant: plantTex(),
  wall_dirt: wallTex(SEED.wdirt, PAL_WDIRT, [['4', 0.15], ['3', 0.3], ['2', 0.35], ['1', 0.2]], false),
  wall_stone: wallTex(SEED.wstone, PAL_WSTONE, [['4', 0.1], ['3', 0.3], ['2', 0.35], ['1', 0.25]], true),
  wall_nether: wallTex(SEED.wnether, PAL_WNETHER, [['4', 0.15], ['3', 0.3], ['2', 0.35], ['1', 0.2]], false),
  wall_end: wallTex(SEED.wend, PAL_WEND, [['4', 0.15], ['3', 0.3], ['2', 0.35], ['1', 0.2]], false),
  crack: crackTex(),
};
