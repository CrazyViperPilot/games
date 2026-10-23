// Vorgerenderte Level-Abschnitte (PLAN §6). Je 16 Zellen Breite (256 px) × 15 Zeilen (240 px).
// Animierte Teile (Bonusblock, Lava-Oberfläche, Münzen, Bewegungen) zeichnet der Renderer als Overlay.
// Kachel-Zeichen laut data/tiles.js; Kachel 14 (Barriere) und 4 (verstecktes Feld) werden nicht gezeichnet.
const CELLS_X = 16;
const T = 16;
const CH_W = CELLS_X * T;   // 256
const CH_H = 15 * T;        // 240

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Kachel-Id -> Sprite-Name (ohne Welt-Präfix) für Zellen ohne Sonderlogik.
const SIMPLE = { 2: 'brick', 3: 'bonus', 5: 'hard', 13: 'used', 8: 'spikes', 7: 'lava' };

export function buildChunks(map, sprites, theme) {
  const cols = map.cols;
  const rows = map.rows;
  const nChunks = Math.ceil(cols / CELLS_X);
  const atlas = sprites.atlas;
  const get = sprites.get;
  const chunks = [];
  for (let i = 0; i < nChunks; i++) {
    const cv = makeCanvas(CH_W, CH_H);
    const cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    chunks.push(cv);
  }
  const N = {};
  for (const k of ['ground_top', 'ground', 'brick', 'hard', 'bonus', 'used', 'plat_l', 'plat_m', 'plat_r', 'plat_s',
    'pipe_cl', 'pipe_cr', 'pipe_bl', 'pipe_br', 'lava', 'spikes', 'deco']) N[k] = `${theme}/${k}`;

  // Zeichnet eine Sprite-Region in den Abschnitt der Zelle (c, r).
  function blit(ctx, name, frame, lx, ly) {
    const s = get(name, frame, false);
    ctx.drawImage(atlas, s.sx, s.sy, s.w, s.h, lx, ly, s.w, s.h);
  }

  function drawCell(c, r) {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    const ci = (c / CELLS_X) | 0;
    const ctx = chunks[ci].getContext('2d');
    const lx = (c - ci * CELLS_X) * T, ly = r * T;
    ctx.clearRect(lx, ly, T, T);
    const id = map.get(c, r);
    if (id === 0 || id === 4 || id === 14) return;
    if (id === 1) {
      // Grasoberkante, wenn darüber nichts Festes liegt.
      blit(ctx, map.isSolid(c, r - 1) ? N.ground : N.ground_top, 0, lx, ly);
      return;
    }
    if (id === 6) {
      // Einseitige Plattform: obere Hälfte der Zelle, Ende wo der Nachbar keine Plattform ist.
      const l = map.get(c - 1, r) !== 6, rt = map.get(c + 1, r) !== 6;
      const name = l && rt ? N.plat_s : l ? N.plat_l : rt ? N.plat_r : N.plat_m;
      blit(ctx, name, 0, lx, ly);
      return;
    }
    if (id === 9) {
      // Röhrenkörper: linke Hälfte, wenn links keine Röhre ist, sonst rechte.
      blit(ctx, map.get(c - 1, r) === 9 ? N.pipe_br : N.pipe_bl, 0, lx, ly);
      return;
    }
    if (id === 10) { blit(ctx, N.pipe_cl, 0, lx, ly); return; }
    if (id === 11) { blit(ctx, N.pipe_cr, 0, lx, ly); return; }
    if (id === 12) { blit(ctx, N.deco, 0, lx, ly); return; }
    const simple = SIMPLE[id];
    if (simple) blit(ctx, N[simple] || `${theme}/${simple}`, 0, lx, ly);
  }

  function redrawCell(c, r) {
    drawCell(c, r);
    // Darunter liegende Zelle hängt von der Oberkante ab (Gras/Füllung).
    drawCell(c, r + 1);
  }

  function redrawAll() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) drawCell(c, r);
  }

  redrawAll();
  return { chunks, redrawCell, redrawAll, cellsPerChunk: CELLS_X, chunkWidth: CH_W, chunkHeight: CH_H };
}
