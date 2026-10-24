// Gegenstände, Portal, Bett, Geschosse, Effekte und HUD-Symbole (PRD §6, PLAN §7).
// Zeichenraster entstehen im Code oder sind als Raster notiert; '.' = transparent. Kontur dunkel (Zeichen k).
// Export: ITEM_ART = { name: { pal, frames: [Zeichenraster, ...] } }

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
// Außenkontur: jedes Pixel mit transparentem Nachbarn (Bildrand zählt als transparent) wird zu ch.
function outline(g, ch = 'k') {
  const h = g.length, w = g[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : g[y][x]);
  return g.map((row, y) => row.split('').map((p, x) => {
    if (p === '.') return '.';
    const edge = at(x - 1, y) === '.' || at(x + 1, y) === '.' || at(x, y - 1) === '.' || at(x, y + 1) === '.';
    return edge ? ch : p;
  }).join(''));
}
// Zeichen überlagern: f(x, y) liefert ein Zeichen oder null (dann bleibt das Pixel).
const overlay = (g, f) => g.map((row, y) => row.split('').map((p, x) => f(x, y) || p).join(''));
const inEll = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const superEll = (x, y, cx, cy, rx, ry, n) => Math.abs((x + 0.5 - cx) / rx) ** n + Math.abs((y + 0.5 - cy) / ry) ** n <= 1;
// Punkt-in-Polygon (Strahlverfahren), geprüft wird die Pixelmitte; pts = [[x, y], ...]
function inPoly(x, y, pts) {
  const px = x + 0.5, py = y + 0.5;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Polygon auf Zielgröße skalieren (Vorlage ist 12×12)
const scalePts = (pts, w, h) => pts.map(([x, y]) => [x * (w / 12), y * (h / 12)]);

// ---------- Edelsteine ----------
const K = '#0c0a10';
const PAL_GEM_G = { k: K, L: '#7dff8f', g: '#2fbf4f', d: '#14803a', D: '#0b4d24', w: '#f4fff5' };
const PAL_GEM_D = { k: K, C: '#e6fffb', c: '#5ff0e0', d: '#22b8ad', D: '#0f7a74', W: '#ffffff' };
// Smaragd: abgeschrägter Schliff, helle Tischfläche oben, Facetten links/rechts
function emeraldFrame(w, h, sparks) {
  const body = grid(w, h, (x, y) => (superEll(x, y, w / 2, h / 2, w / 2, h / 2, 3)
    ? (y + 0.5 < h * 0.3 ? 'L' : x + 0.5 < w / 2 ? 'g' : y + 0.5 > h * 0.72 ? 'D' : 'd') : null));
  return overlay(outline(body, 'k'), (x, y) => (sparks.some(([sx, sy]) => x === sx && y === sy) ? 'w' : null));
}
// Diamant: Fünfeck mit flacher Tischfläche und Spitze unten
const DIAMOND_PTS = [[0.5, 3.5], [3, 0.5], [9, 0.5], [11.5, 3.5], [6, 11.5]];
function diamondFrame(w, h, sparks) {
  const pts = scalePts(DIAMOND_PTS, w, h);
  const body = grid(w, h, (x, y) => {
    if (!inPoly(x, y, pts)) return null;
    if (y + 0.5 < h * 0.3) return 'C';
    if (x + 0.5 < w / 2) return 'c';
    return y + 0.5 > h * 0.6 ? 'D' : 'd';
  });
  return overlay(outline(body, 'k'), (x, y) => (sparks.some(([sx, sy]) => x === sx && y === sy) ? 'W' : null));
}

// ---------- Rüstung, Bogen, Apfel, Kuchen ----------
const PAL_ARMOR = { k: K, i: '#c9ced6', I: '#eef1f5', j: '#8a919c', r: '#5c6370', b: '#7a4a24', y: '#ffd23f' };
function armorFrame() {
  const g = grid(12, 12, (x, y) => {
    if (y === 1 && (x === 1 || x === 10 || (x >= 4 && x <= 7))) return null;    // Hals, Schulterecken
    if (y >= 1 && y <= 3 && x >= 1 && x <= 10) return 'i';                      // Schultern
    if (y >= 3 && y <= 7 && (x <= 1 || x >= 10)) return 'i';                    // Armschienen
    if (y >= 3 && y <= 9 && x >= 2 && x <= 9) return 'i';                       // Brust
    if (y === 10 && x >= 3 && x <= 8) return 'j';                               // Saum
    return null;
  });
  return outline(overlay(g, (x, y) => {
    if (x === 5 || x === 6) return y >= 3 && y <= 9 ? 'j' : null;               // Mittelnaht
    if (x === 3 && y >= 4 && y <= 7) return 'I';                                // Glanz
    if (y === 8 && x >= 2 && x <= 9) return 'b';                                // Gürtel
    if (y === 8 && (x === 5 || x === 6)) return 'y';                            // Schnalle
    if ((x === 2 || x === 9) && y === 2) return 'r';                            // Nieten
    return null;
  }), 'k');
}
const PICK_K = '#1d1322';                                                       // Kontur für Hacke und Bogen (1 px)
const PAL_BOW = { k: PICK_K, w: '#8a5a2b', W: '#5a3a1b', S: '#e8e4d8' };
function bowFrame() {
  // Bogen: Ring-Ausschnitt links (Mitte x = 10), Enden oben und unten bei x = 9
  const body = grid(12, 12, (x, y) => {
    const d = Math.sqrt(((x + 0.5 - 10) / 9) ** 2 + ((y + 0.5 - 5.5) / 5.5) ** 2);
    if (x + 0.5 < 10 && Math.abs(d - 1) < 0.2) return x + 0.5 < 4 ? 'W' : 'w';
    return null;
  });
  const g = outline(body, 'k');
  return overlay(g, (x, y) => (x === 9 && y >= 1 && y <= 10 ? 'S' : null));    // Sehne senkrecht
}
const PAL_APPLE = { k: K, Y: '#ffd23f', y: '#fff1a8', o: '#c99a1a', s: '#3f8f2a', l: '#5fbf3a' };
function appleFrame() {
  const g = grid(10, 12, (x, y) => {
    if (inPoly(x, y, [[6, 1], [9, 0], [8, 2.5]])) return 'l';                   // Blatt
    if (inRect(x, y, 4, 0, 5, 1)) return 's';                                   // Stiel
    if (!inEll(x, y, 4.5, 6.9, 3.9, 4.5)) return null;
    if (inEll(x, y, 4.5, 2.4, 1.2, 1.1)) return null;                           // Einbuchtung oben
    if (inEll(x, y, 3, 5, 1.5, 1.5)) return 'y';                                // Glanz
    return x > 4.5 && y > 7 ? 'o' : 'Y';
  });
  return outline(g, 'k');
}
const PAL_CAKE = { k: K, w: '#fff4f8', p: '#ff7aa8', y: '#f2c36b', Y: '#d9a24a', b: '#7a4a24', B: '#5a3416' };
const CAKE = [
  '..............',
  '.wwwwwwwwwwww.',
  '.wwpwwwwwwpww.',
  '.wwwwwwwwwwww.',
  '.yyyyyyyyyyyy.',
  '.yYyyyyYyyyyY.',
  '.yyyyyyyyyyyy.',
  '.bbbbbbbbbbbb.',
  '.bBbbbbbbbbBb.',
  '..............',
];

// ---------- Spitzhacke (drei Köpfe: Stein, Eisen, Diamant; Holzstiel) ----------
// Eine Vorlage für alle drei Köpfe: M = Kopf, L = Licht, S = Schatten, H/h = Holzstiel (hell/dunkel).
// Kontur (k) nur am Kopf, nicht am Stiel. Kopf oben, Stiel diagonal nach links unten.
const PICK_ROWS = [
  '....MMMM....',
  '..MMMMMMSS..',
  '.MLLMMMMMSS.',
  'LMMMMhHSSS..',
  '.....hH.....',
  '....hH......',
  '...hH.......',
  '..hH........',
  '..hH........',
  '.hH.........',
  'hH..........',
  '............',
];
function pickFrame() {
  const head = 'MLS';
  return PICK_ROWS.map((row, y) => row.split('').map((p, x) => {
    if (!head.includes(p)) return p;
    const edge = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      .some(([ax, ay]) => ax < 0 || ay < 0 || ax >= 12 || ay >= 12 || PICK_ROWS[ay][ax] === '.');
    return edge ? 'k' : p;
  }).join(''));
}
const PICK_PAL = (main, light, shade) => ({ k: PICK_K, M: main, L: light, S: shade, H: '#8a5a2b', h: '#5a3a1b' });
const PAL_PICK_STONE = PICK_PAL('#8b8f99', '#c3c8d2', '#6b707a');
const PAL_PICK_IRON = PICK_PAL('#e6e9ef', '#f7f9fc', '#aab1be');
const PAL_PICK_DIAMOND = PICK_PAL('#4be8e0', '#b8fffa', '#2bb8b0');

// ---------- Portal (32×48, Obsidianrahmen, wabernde Füllung) ----------
const PAL_PORTAL = { o: '#15102a', O: '#2b2350', p: '#4a3d7a', a: '#2a0f4f', b: '#5a22a8', c: '#9d5cff', d: '#e0c2ff' };
function portalFrame(f) {
  return grid(32, 48, (x, y) => {
    if (!inRect(x, y, 3, 3, 28, 44)) {
      const h = (x * 37 + y * 19) % 11;
      return h === 0 ? 'O' : h === 5 ? 'p' : 'o';
    }
    if (x === 3 || x === 28 || y === 3 || y === 44) return 'a';                 // dunkler Innenrand
    const v = Math.sin(x * 0.55 + f * 1.57) + Math.cos(y * 0.4 - f * 1.2 + x * 0.15) + Math.sin((x + y) * 0.22 + f * 0.8);
    return 'abcd'[Math.max(0, Math.min(3, Math.floor((v + 3) / 1.5)))];
  });
}

// ---------- Bett (32×12, Seitenansicht, Kissen links) ----------
const PAL_BED = { W: '#7a4a24', w: '#b07a44', D: '#5a3416', r: '#c8323c', R: '#e0525a', d: '#8e2028', p: '#f4f1ee', g: '#c9c3bb' };
function bedFrame() {
  return grid(32, 12, (x, y) => {
    if (inRect(x, y, 0, 1, 1, 11)) return y === 1 ? 'w' : 'W';                  // Kopfteil
    if (inRect(x, y, 2, 3, 8, 5)) return y === 5 ? 'g' : 'p';                   // Kissen
    if (inRect(x, y, 9, 4, 30, 8)) {
      if (y === 4) return 'R';
      if (y === 8) return 'd';
      return x === 20 ? 'd' : 'r';                                              // Decke mit Falte
    }
    if (inRect(x, y, 30, 5, 31, 11)) return 'W';                                // Fußteil
    if (y === 9 && x >= 2 && x <= 29) return 'w';                               // Rahmen oben
    if (y === 10 && x >= 2 && x <= 29) return 'W';
    if (y === 11 && (x <= 3 || (x >= 26 && x <= 29))) return 'D';               // Beine
    return null;
  });
}

// ---------- Geschosse und Effekte ----------
const PAL_ARROW = { f: '#d9d9d9', w: '#a0643a', i: '#c9ced6', I: '#ffffff' };
const ARROW = [
  ['ff.....ii.', '.wwwwwwiiI', 'ff.....ii.'],
];
const PAL_SKULL8 = { K: '#0d0c12', G: '#4a4a5c', e: '#b58cff', t: '#d8d8e4' };
function skull8Frame() {
  const g = outline(grid(8, 8, (x, y) => (inEll(x, y, 4, 3.5, 3.6, 3.2) || inRect(x, y, 2, 5, 5, 6) ? 'K' : null)), 'G');
  return overlay(g, (x, y) => {
    if (inRect(x, y, 1, 2, 2, 3) || inRect(x, y, 5, 2, 6, 3)) return 'e';   // Augen glimmen
    if (y === 6 && (x === 3 || x === 4)) return 't';                         // Zähne
    return null;
  });
}
const PAL_FIRE = { Y: '#fff27a', O: '#ffa62b', R: '#e8382f' };
function fireFrame() {
  return grid(8, 8, (x, y) => {
    const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 4);
    if (d > 3.7) return null;
    return d < 1.8 ? 'Y' : d < 2.9 ? 'O' : 'R';
  });
}
const PAL_SMOKE = { A: '#8a8e9bee', B: '#8a8e9bcc', C: '#8a8e9b99', D: '#8a8e9b66' };
function smokeFrame(f) {
  const r = 3.2 + f * 1.5;
  const ch = 'ABCD'[f];
  const blobs = [[8, 8, r], [5.5, 9, r * 0.7], [10.5, 6.5, r * 0.75]];
  return grid(16, 16, (x, y) => (blobs.some(([cx, cy, rr]) => inEll(x, y, cx, cy, rr, rr * 0.85)) ? ch : null));
}
const PAL_SPARK = { Y: '#fff27a', W: '#ffffff', y: '#ffe066' };
const SPARK = [
  ['.YY.', 'YWWY', 'YWWY', '.YY.'],
  ['....', '.yy.', '.yy.', '....'],
];

// ---------- HUD-Symbole ----------
const PAL_HUD_SLOT = { k: K, g: '#6b6b78' };
function slotFrame() {
  const fill = grid(9, 9, (x, y) => (inPoly(x, y, scalePts(DIAMOND_PTS, 9, 9)) ? 'x' : null));
  return outline(fill, 'g').map((row) => row.replace(/x/g, '.'));          // nur der Umriss bleibt
}
const PAL_HUD_HEAD = { k: K, h: '#f0801e', H: '#ffb35c', d: '#b5520f', g: '#7a4a24', s: '#f7c79a', S: '#d9925f' };
function hudHeadFrame() {
  const g = grid(9, 9, (x, y) => {
    if (y <= 2 && x >= 1 && x <= 7) return y === 0 && (x === 2 || x === 3) ? 'H' : 'h';   // orange Kappe
    if (y === 3 && x <= 8) return 'd';                                                    // Schirm
    if (y === 4 && x >= 1 && x <= 7) return 'g';                                          // Haaransatz
    if ((x === 1 || x === 7) && y === 5) return 'g';                                      // Haare an den Seiten
    if (x >= 2 && x <= 6 && y >= 5 && y <= 7) return 's';                                 // Gesicht
    if (x >= 3 && x <= 5 && y === 8) return 's';                                          // Kinn
    return null;
  });
  return overlay(outline(g, 'k'), (x, y) => {
    if (y === 6 && (x === 3 || x === 5)) return 'k';                                      // Augen
    if (y === 7 && x === 4) return 'S';                                                   // Mund
    return null;
  });
}
const PAL_HUD_GEM = PAL_GEM_G;
const PAL_HUD_DIA = PAL_GEM_D;

const PAL_BREAD = { k: K, y: '#e8b65a', Y: '#c98a2e', l: '#f6d98a' };
const BREAD = [
  '..............',
  '...yyyyyyyy...',
  '..ylyyyyyyYy..',
  '.yylyyylyyyYy.',
  '.yyyyyyyyyyYy.',
  '.YyyyyyyyyyYY.',
  '..YYYYYYYYYY..',
  '..............',
];
const PAL_STEAK = { k: K, r: '#b8322f', R: '#8a2020', w: '#f3e4cf', b: '#5a2a18' };
const STEAK = [
  '..............',
  '....rrrrrr....',
  '..rrrrrrrrrr..',
  '.rrwwrrrrrrrR.',
  '.rrwwrrbbrrrR.',
  '.rrrrrrbbrrRR.',
  '..rrrrrrrrRR..',
  '....RRRRRR....',
  '..............',
];

export const ITEM_ART = {
  it_bread: { pal: PAL_BREAD, frames: [outline(BREAD, 'k')] },
  it_steak: { pal: PAL_STEAK, frames: [outline(STEAK, 'k')] },
  it_emerald: { pal: PAL_GEM_G, frames: [emeraldFrame(10, 12, [[2, 3]]), emeraldFrame(10, 12, [[6, 7]])] },
  it_diamond: { pal: PAL_GEM_D, frames: [diamondFrame(12, 12, [[3, 2]]), diamondFrame(12, 12, [[8, 4]])] },
  it_armor: { pal: PAL_ARMOR, frames: [armorFrame()] },
  it_bow: { pal: PAL_BOW, frames: [bowFrame()] },
  it_apple: { pal: PAL_APPLE, frames: [appleFrame()] },
  it_cake: { pal: PAL_CAKE, frames: [outline(CAKE, 'k')] },
  it_pick_stone: { pal: PAL_PICK_STONE, frames: [pickFrame()] },
  it_pick_iron: { pal: PAL_PICK_IRON, frames: [pickFrame()] },
  it_pick_diamond: { pal: PAL_PICK_DIAMOND, frames: [pickFrame()] },
  portal: { pal: PAL_PORTAL, frames: [0, 1, 2, 3].map(portalFrame) },
  bed: { pal: PAL_BED, frames: [bedFrame()] },
  pr_arrow: { pal: PAL_ARROW, frames: ARROW },
  pr_skull: { pal: PAL_SKULL8, frames: [skull8Frame()] },
  pr_fire: { pal: PAL_FIRE, frames: [fireFrame()] },
  fx_smoke: { pal: PAL_SMOKE, frames: [0, 1, 2, 3].map(smokeFrame) },
  fx_spark: { pal: PAL_SPARK, frames: SPARK },
  hud_emerald: { pal: PAL_HUD_GEM, frames: [emeraldFrame(8, 9, [])] },
  hud_diamond: { pal: PAL_HUD_DIA, frames: [diamondFrame(9, 9, [[2, 2]])] },
  hud_slot: { pal: PAL_HUD_SLOT, frames: [slotFrame()] },
  hud_head: { pal: PAL_HUD_HEAD, frames: [hudHeadFrame()] },
};
