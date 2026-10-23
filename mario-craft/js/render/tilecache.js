// Tile-Cache (PLAN §6, §8): Level in 256×256-Quadrate (16×16 Zellen) vorrendern.
// Je Zelle: (1) Rückwand, wenn die Zelle nicht fest und nicht barrier ist und r > surface[c];
// (2) die Kachel selbst (TILE_BY_ID[id].art, null = nichts).
// Animierte Kacheln (lava, water, torch) stehen im Cache mit Frame 0; der Renderer überzeichnet sie.
// Rückgabe.animated = Int32Array aus Tripeln [c, r, artIndex] (0 lava, 1 water, 2 torch).
import { TILE_BY_ID, TILE_IDS } from '../data/tiles.js';

const CHUNK_CELLS = 16;          // Zellen je Chunk-Kante
const CELL = 16;                 // Pixel je Zelle
const CHUNK_PX = CHUNK_CELLS * CELL;  // 256
const AIR_ID = TILE_IDS.air;
const BARRIER_ID = TILE_IDS.barrier;

// Kachel-Id -> Index in animated (-1 = nicht animiert).
const ANIM_OF = new Int8Array(64).fill(-1);
ANIM_OF[TILE_IDS.lava] = 0;
ANIM_OF[TILE_IDS.water] = 1;
ANIM_OF[TILE_IDS.torch] = 2;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Rückwand-Sprite für Zelle (r) einer Spalte mit Oberfläche surf.
function wallName(theme, r, surf) {
  if (theme === 'nether') return 'wall_nether';
  if (theme === 'end') return 'wall_end';
  return r <= surf + 4 ? 'wall_dirt' : 'wall_stone';
}

export function buildChunks(map, sprites, theme = map.theme) {
  const cols = map.cols;
  const rows = map.rows;
  const ncx = Math.ceil(cols / CHUNK_CELLS);
  const ncy = Math.ceil(rows / CHUNK_CELLS);
  const atlas = sprites.atlas;

  const chunks = [];
  for (let cy = 0; cy < ncy; cy++) {
    const line = [];
    for (let cx = 0; cx < ncx; cx++) {
      const cv = makeCanvas(CHUNK_PX, CHUNK_PX);
      cv.getContext('2d').imageSmoothingEnabled = false;
      line.push(cv);
    }
    chunks.push(line);
  }

  // Flache Liste [c, r, a, c, r, a, ...] der animierten Zellen.
  const animFlat = [];
  const out = { chunks, cols: ncx, rows: ncy, redrawCell, redrawAll, animated: new Int32Array(0) };

  function blit(ctx, name, lx, ly) {
    const s = sprites.get(name, 0, false);
    if (s.w > 0 && s.h > 0) ctx.drawImage(atlas, s.sx, s.sy, s.w, s.h, lx, ly, s.w, s.h);
  }

  // Zeichnet Rückwand + Kachel der Zelle (c, r). Liefert den Animationsindex oder -1.
  function drawCell(c, r) {
    const ctx = chunks[r >> 4][c >> 4].getContext('2d');
    const lx = (c & (CHUNK_CELLS - 1)) * CELL;
    const ly = (r & (CHUNK_CELLS - 1)) * CELL;
    ctx.clearRect(lx, ly, CELL, CELL);

    const id = map.get(c, r);
    const t = TILE_BY_ID[id];
    const surf = map.surface[c];
    if (!t.solid && id !== BARRIER_ID && r > surf) {
      blit(ctx, wallName(theme, r, surf), lx, ly);
    }
    if (id === AIR_ID || !t.art) return -1;
    blit(ctx, t.art, lx, ly);
    return ANIM_OF[id];
  }

  // Aktualisiert den Eintrag einer Zelle in der animierten Liste.
  function setAnimated(c, r, a) {
    for (let i = 0; i < animFlat.length; i += 3) {
      if (animFlat[i] === c && animFlat[i + 1] === r) {
        animFlat.splice(i, 3);
        break;
      }
    }
    if (a >= 0) animFlat.push(c, r, a);
    out.animated = Int32Array.from(animFlat);
  }

  function redrawCell(c, r) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    setAnimated(c, r, drawCell(c, r));
  }

  function redrawAll() {
    for (let cy = 0; cy < ncy; cy++) {
      for (let cx = 0; cx < ncx; cx++) {
        chunks[cy][cx].getContext('2d').clearRect(0, 0, CHUNK_PX, CHUNK_PX);
      }
    }
    animFlat.length = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = drawCell(c, r);
        if (a >= 0) animFlat.push(c, r, a);
      }
    }
    out.animated = Int32Array.from(animFlat);
  }

  redrawAll();
  return out;
}
