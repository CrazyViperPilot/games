// Renderer v2 (PLAN §2, §8, PRD §7). Zeichnet in ein Canvas mit interner Auflösung viewW × viewH.
// Reihenfolge je Frame: Kachel-Änderungen, Himmel und Parallax, Chunks, animierte Kacheln, Riss, fallender Sand,
// TNT, Gegenstände, Gegner, Boss, Spieler, Geschosse und Partikel, Dunkelheit, dann HUD und Knöpfe.
// Keine Allokation im Frame: Namen und Farben sind Konstanten, Dunkelheit wird in einen vorab angelegten Puffer gezeichnet.
import { buildChunks } from './tilecache.js';
import { drawHud, drawControls, drawText, bindHud } from './hud.js';
import { THEMES } from './sprites.js';
import { TILE_BY_ID } from '../data/tiles.js';

const T = 16;
const CHUNK = 256;
const BG_W = 256;                 // Kachelbreite der Parallax-Ebenen
const PARA_FAR = 0.15, PARA_NEAR = 0.35;
const SHAKE_PX = 2;
const TAU = Math.PI * 2;

// Dunkelheit: Stufe p deckt Licht LO[p]..HI[p] ab (0 = am dunkelsten).
const DARK_LO = [0, 2, 5, 9];
const DARK_HI = [1, 4, 8, 12];
const DARK_FILL = ['rgba(8,6,16,0.9)', 'rgba(8,6,16,0.75)', 'rgba(8,6,16,0.55)', 'rgba(8,6,16,0.3)'];

// Sternen-Tönung für Stern-Zustand (ctx.filter, vorab angelegt).
const HUE = ['hue-rotate(0deg)', 'hue-rotate(60deg)', 'hue-rotate(120deg)', 'hue-rotate(180deg)', 'hue-rotate(240deg)', 'hue-rotate(300deg)'];

const ANIM_NAMES = ['blk_lava', 'blk_water', 'blk_torch'];   // Reihenfolge wie tilecache.ANIM_OF
const WALL_DIRT = 'wall_dirt', WALL_STONE = 'wall_stone', WALL_NETHER = 'wall_nether', WALL_END = 'wall_end';

const MOB_SPRITE = {
  zischer: 'mob_zischer', zombie: 'mob_zombie', skeleton: 'mob_skeleton', spider: 'mob_spider',
  slime: 'mob_slime_big', slimeSmall: 'mob_slime_small', silverfish: 'mob_silverfish',
  glutgeist: 'mob_glutgeist', leerenlaeufer: 'mob_leerenlaeufer',
};
const PICKUP_SPRITE = {
  emerald: 'it_emerald', diamond: 'it_diamond', armor: 'it_armor', bow: 'it_bow', apple: 'it_apple',
  cake: 'it_cake', pick_stone: 'it_pick_stone', pick_iron: 'it_pick_iron', pick_diamond: 'it_pick_diamond',
};
const PROJ_SPRITE = { arrow: 'pr_arrow', enemyArrow: 'pr_arrow', skull: 'pr_skull', fire: 'pr_fire' };

// Held: Namen je Power und Animation; run nutzt die Lauf-Frames von walk.
const HERO_NAME = {};
for (const power of ['plain', 'armor', 'bow']) {
  const names = {};
  for (const anim of ['stand', 'walk', 'jump', 'fall', 'climb', 'swim', 'dig', 'dead']) names[anim] = `hero_${power}_${anim}`;
  names.run = names.walk;
  HERO_NAME[power] = names;
}
const HERO_RATE = { walk: 8, run: 12, climb: 6, swim: 4, dig: 8 };

// ---------- Farben und Hintergründe (einmal je Level gezeichnet) ----------

const SKY = {
  overworld: [[0, '#3d8fe6'], [0.55, '#8fd0ff'], [1, '#dff3ff']],
  depths: [[0, '#161b28'], [1, '#353d52']],
  nether: [[0, '#140404'], [0.55, '#4a0e0a'], [1, '#b8400f']],
  end: [[0, '#05020b'], [1, '#1d0c33']],
};

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
function hex2(v) { return clamp255(v).toString(16).padStart(2, '0'); }
function mixHex(a, b, u) {
  const r = parseInt(a.slice(1, 3), 16) + (parseInt(b.slice(1, 3), 16) - parseInt(a.slice(1, 3), 16)) * u;
  const g = parseInt(a.slice(3, 5), 16) + (parseInt(b.slice(3, 5), 16) - parseInt(a.slice(3, 5), 16)) * u;
  const bl = parseInt(a.slice(5, 7), 16) + (parseInt(b.slice(5, 7), 16) - parseInt(a.slice(5, 7), 16)) * u;
  return `#${hex2(r)}${hex2(g)}${hex2(bl)}`;
}
function colorAt(stops, t) {
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const a = stops[k - 1], b = stops[k];
      return mixHex(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
    }
  }
  return stops[stops.length - 1][1];
}

// Himmelsverlauf in 16 Bändern (Pixel-Look, ohne Pfade pro Frame).
function paintSky(g, w, h, stops) {
  const N = 16;
  for (let i = 0; i < N; i++) {
    g.fillStyle = colorAt(stops, (i + 0.5) / N);
    const y0 = Math.floor((h * i) / N);
    g.fillRect(0, y0, w, Math.ceil(h / N) + 1);
  }
}

// Deterministischer Zufall für Sterne und Glut (Build-Zeit).
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Periodische Silhouette über 256 px (Summe von Sinus mit ganzzahligen Frequenzen).
function silhouette(g, h, base, amp, color, phase) {
  g.fillStyle = color;
  for (let x = 0; x < BG_W; x++) {
    const t = (x / BG_W) * TAU;
    const wob = Math.sin(3 * t + phase) + 0.5 * Math.sin(7 * t + 1.3 + phase) + 0.3 * Math.sin(11 * t + 0.4);
    const top = Math.round(h * base - amp * wob);
    g.fillRect(x, top, 1, h - top);
  }
}

// Wolke aus Ellipsen mit hellerer Unterkante (mit Umlauf, damit die Kachel nahtlos ist).
function cloud(g, x, y, r) {
  for (const dx of [-BG_W, 0, BG_W]) {
    const cx = x + dx;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(cx, y, r * 2, r * 0.8, 0, 0, TAU);
    g.ellipse(cx - r * 0.9, y - r * 0.5, r * 0.9, r * 0.8, 0, 0, TAU);
    g.ellipse(cx + r * 0.9, y - r * 0.4, r * 0.8, r * 0.7, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#dcecff';
    g.fillRect(cx - r * 2, y, r * 4, Math.max(1, Math.round(r * 0.4)));
  }
}

// Sterne (1×1 bzw. 2×2) zufällig auf 256 × h.
function stars(g, h, count, color, big, seed, maxY) {
  const rand = rng(seed);
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * BG_W);
    const y = Math.floor(rand() * h * maxY);
    const s = big && rand() < 0.3 ? 2 : 1;
    g.fillRect(x, y, s, s);
  }
}

// Glutpunkte (Nether, nahe Silhouette).
function embers(g, h, count, seed) {
  const rand = rng(seed);
  g.fillStyle = '#ff7a1a';
  for (let i = 0; i < count; i++) {
    g.fillRect(Math.floor(rand() * BG_W), Math.floor(h * (0.55 + rand() * 0.3)), 1, 1);
  }
}

// Ebenen eines Themes: { far, near } als Funktionen (g, h) -> void. far = 0,15, near = 0,35.
const LAYERS = {
  overworld: {
    far: (g, h) => {
      cloud(g, 30, Math.round(h * 0.42), 6);
      cloud(g, 110, Math.round(h * 0.36), 5);
      cloud(g, 190, Math.round(h * 0.5), 7);
      cloud(g, 240, Math.round(h * 0.33), 4);
    },
    near: (g, h) => silhouette(g, h, 0.6, h * 0.07, '#6cc06a', 0.0),
  },
  depths: {
    far: (g, h) => silhouette(g, h, 0.45, h * 0.1, '#262d3f', 0.8),
    near: (g, h) => silhouette(g, h, 0.6, h * 0.12, '#171c29', 2.1),
  },
  nether: {
    far: (g, h) => silhouette(g, h, 0.5, h * 0.12, '#3a0d0a', 0.4),
    near: (g, h) => {
      silhouette(g, h, 0.7, h * 0.08, '#250606', 1.7);
      embers(g, h, 14, 7);
    },
  },
  end: {
    far: (g, h) => stars(g, h, 40, '#6a5a92', false, 11, 0.8),
    near: (g, h) => stars(g, h, 14, '#f0e6ff', true, 23, 0.7),
  },
};

function newCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Zeichnet eine Ebene (256 × h) mit Pfaden in einen neuen Canvas. Läuft nur beim Levelwechsel.
function makeLayer(fn, h) {
  const cv = newCanvas(BG_W, h);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  fn(g, h);
  return cv;
}

export class Renderer {
  constructor(canvas, sprites, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprites = sprites;
    this.debug = !!opts.debug;
    this.viewW = canvas.width || 384;
    this.viewH = canvas.height || 240;
    this.map = null;
    this.theme = null;
    this.tiles = null;
    this.skyCv = null;
    this.paraFar = null;
    this.paraNear = null;
    this.darkCv = null;
    this.dctx = null;
    this.offX = 0;          // Verschiebung Welt → Bildschirm (−camX + Wackeln)
    this.offY = 0;
    this.sx = 0;            // Wackel-Versatz (±2 px) dieses Frames
    this.sy = 0;
    this._last = performance.now();
    this._max = 0;
    this._shownMax = 0;
    this._winStart = this._last;
    bindHud(sprites);
    this.ctx.imageSmoothingEnabled = false;
    this._makeDark();
  }

  // Offscreen-Puffer für die Dunkelheit (Größe = Sicht).
  _makeDark() {
    this.darkCv = newCanvas(this.viewW, this.viewH);
    this.dctx = this.darkCv.getContext('2d');
    this.dctx.imageSmoothingEnabled = false;
  }

  setView(viewW, viewH) {
    const changed = viewW !== this.viewW || viewH !== this.viewH;
    this.viewW = viewW;
    this.viewH = viewH;
    if (this.canvas.width !== viewW) this.canvas.width = viewW;
    if (this.canvas.height !== viewH) this.canvas.height = viewH;
    this.ctx.imageSmoothingEnabled = false;
    if (changed) {
      this._makeDark();
      if (this.theme) this._buildBg();
    }
  }

  setLevel(map, theme) {
    this.map = map;
    this.theme = THEMES.includes(theme) ? theme : 'overworld';
    this.tiles = buildChunks(map, this.sprites, this.theme);
    this._buildBg();
  }

  // Himmel (Verlauf über die ganze Sicht) und zwei kachelbare Parallax-Ebenen je Theme.
  _buildBg() {
    const w = this.viewW, h = this.viewH;
    const sky = newCanvas(w, h);
    const g = sky.getContext('2d');
    g.imageSmoothingEnabled = false;
    paintSky(g, w, h, SKY[this.theme]);
    this.skyCv = sky;
    const layers = LAYERS[this.theme];
    this.paraFar = makeLayer(layers.far, h);
    this.paraNear = makeLayer(layers.near, h);
  }

  // Kachelbare Ebene: x um camX·f, y um halbes camY verschoben (Bild ist höchstens so hoch wie die Sicht).
  _drawPara(cv, f, camX, camY) {
    const ctx = this.ctx;
    let x = -(Math.floor(camX * f) % BG_W) + this.sx;
    if (x > 0) x -= BG_W;
    const y = -Math.floor(camY / 2) + this.sy;
    for (; x < this.viewW; x += BG_W) ctx.drawImage(cv, x, y);
  }

  // Zeichnet ein Sprite; (wx, wyBottom) in Weltkoordinaten: horizontal Mitte, vertikal Unterkante.
  _put(name, frame, flip, wx, wyBottom) {
    const s = this.sprites.get(name, frame, flip);
    const dx = Math.round(wx + this.offX - s.w / 2);
    const dy = Math.round(wyBottom + this.offY - s.h);
    if (dx + s.w < 0 || dx > this.viewW || dy + s.h < 0 || dy > this.viewH) return;
    this.ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, dx, dy, s.w, s.h);
  }

  // Wie _put, aber kopfüber (tote Mobs): Spiegelung an der horizontalen Achse der Sprite-Mitte.
  _putFlipV(name, frame, flip, wx, wyBottom) {
    const s = this.sprites.get(name, frame, flip);
    const dx = Math.round(wx + this.offX - s.w / 2);
    const dy = Math.round(wyBottom + this.offY - s.h);
    if (dx + s.w < 0 || dx > this.viewW || dy + s.h < 0 || dy > this.viewH) return;
    const g = this.ctx;
    g.save();
    g.translate(0, dy + s.h);
    g.scale(1, -1);
    g.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, dx, 0, s.w, s.h);
    g.restore();
  }

  // Zeichnet ein Sprite mit linker oberer Ecke in Weltkoordinaten (ganzzahlig gerundet).
  _blitTL(name, frame, x, y) {
    const s = this.sprites.get(name, frame, false);
    const dx = Math.round(x + this.offX), dy = Math.round(y + this.offY);
    if (dx + s.w < 0 || dx > this.viewW || dy + s.h < 0 || dy > this.viewH) return;
    this.ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, dx, dy, s.w, s.h);
  }

  // Deterministisches Wackeln (±2 px) aus der Spielzeit.
  _shakeOffset(game) {
    if (!(game.shake > 0)) { this.sx = 0; this.sy = 0; return; }
    const k = (game.time * 60) | 0;
    const h = Math.imul(k, 2654435761) >>> 0;
    this.sx = (h % 5) - SHAKE_PX;
    this.sy = ((h >>> 8) % 5) - SHAKE_PX;
  }

  // Dunkelheit (PLAN §8): je sichtbarer Zelle l = max(Licht, 15 − 2 × Abstand zum Spieler).
  _drawDark(game) {
    const map = this.map;
    const light = game.light;
    const cols = map.cols, rows = map.rows;
    if (!light || light.length !== cols * rows) return;
    const vw = this.viewW, vh = this.viewH;
    const ox = this.offX, oy = this.offY;
    const p = game.player;
    const pc = (p.x + p.w / 2) / T, pr = (p.y + p.h / 2) / T;
    const c0 = Math.max(0, Math.floor(-ox / T) - 1), c1 = Math.min(cols - 1, Math.floor((vw - ox) / T) + 1);
    const r0 = Math.max(0, Math.floor(-oy / T) - 1), r1 = Math.min(rows - 1, Math.floor((vh - oy) / T) + 1);
    const d = this.dctx;
    d.clearRect(0, 0, vw, vh);
    for (let pass = 0; pass < DARK_FILL.length; pass++) {
      d.fillStyle = DARK_FILL[pass];
      const lo = DARK_LO[pass], hi = DARK_HI[pass];
      for (let r = r0; r <= r1; r++) {
        const dy = r + 0.5 - pr;
        const row = r * cols;
        for (let c = c0; c <= c1; c++) {
          let l = light[row + c];
          const dx = c + 0.5 - pc;
          const pl = 15 - 2 * Math.sqrt(dx * dx + dy * dy);
          if (pl > l) l = pl | 0;
          if (l >= lo && l <= hi) d.fillRect(c * T + ox, r * T + oy, T, T);
        }
      }
    }
    this.ctx.drawImage(this.darkCv, 0, 0);
  }

  // Schrift im Debug-Modus (fps und längster Frame).
  _drawDebug(ctx, fps) {
    const text = `FPS ${Math.round(fps)} MS ${Math.round(this._shownMax)}`;
    ctx.fillStyle = '#000000';
    ctx.fillRect(2, 20, text.length * 4 + 2, 8);
    drawText(ctx, text, 3, 21);
  }

  _timing() {
    const now = performance.now();
    const dt = now - this._last;
    this._last = now;
    if (dt > this._max) this._max = dt;
    if (now - this._winStart >= 1000) {
      this._shownMax = this._max;
      this._max = 0;
      this._winStart = now;
    }
  }

  render(game, input, fps = 0) {
    const ctx = this.ctx;
    const vw = this.viewW, vh = this.viewH;
    const map = this.map;
    if (this.debug) this._timing();
    if (!map) return;

    // (1) Kachel-Änderungen einarbeiten.
    if (game.dirtyAll) {
      this.tiles.redrawAll();
    } else {
      for (let i = 0; i < game.dirtyCount; i++) {
        const idx = game.dirty[i];
        const c = idx % map.cols;
        const r = (idx - c) / map.cols;
        this.tiles.redrawCell(c, r);
      }
    }
    game.clearDirty();

    const camX = game.camX | 0, camY = game.camY | 0;
    this._shakeOffset(game);
    this.offX = -camX + this.sx;
    this.offY = -camY + this.sy;
    const ox = this.offX, oy = this.offY;

    // (2) Himmel und Parallax (nur die Ebenen, die Erde deckt darunter ab).
    ctx.drawImage(this.skyCv, this.sx, this.sy);
    this._drawPara(this.paraFar, PARA_FAR, camX, camY);
    this._drawPara(this.paraNear, PARA_NEAR, camX, camY);

    // (3) Chunks, die das Bild überlappen.
    const chunks = this.tiles.chunks;
    const ncy = chunks.length, ncx = chunks[0].length;
    const cx0 = Math.max(0, Math.floor((camX - SHAKE_PX) / CHUNK));
    const cx1 = Math.min(ncx - 1, Math.floor((camX + vw + SHAKE_PX) / CHUNK));
    const cy0 = Math.max(0, Math.floor((camY - SHAKE_PX) / CHUNK));
    const cy1 = Math.min(ncy - 1, Math.floor((camY + vh + SHAKE_PX) / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        ctx.drawImage(chunks[cy][cx], cx * CHUNK + ox, cy * CHUNK + oy);
      }
    }

    // (4) Animierte Kacheln (sichtbare): Rückwand darunter, dann der Frame.
    const anim = this.tiles.animated;
    const fr = (game.time * 6) | 0;
    const theme = this.theme;
    for (let i = 0; i < anim.length; i += 3) {
      const c = anim[i], r = anim[i + 1];
      const x = c * T + ox, y = r * T + oy;
      if (x + T < 0 || x > vw || y + T < 0 || y > vh) continue;
      const surf = map.surface[c];
      if (r > surf) {
        const wall = theme === 'nether' ? WALL_NETHER : theme === 'end' ? WALL_END
          : (r <= surf + 4 ? WALL_DIRT : WALL_STONE);
        const ws = this.sprites.get(wall, 0, false);
        ctx.drawImage(this.sprites.atlas, ws.sx, ws.sy, ws.w, ws.h, x, y, T, T);
      }
      const s = this.sprites.get(ANIM_NAMES[anim[i + 2]], fr, false);
      ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, x, y, s.w, s.h);
    }

    // (5) Riss beim Graben.
    const dig = game.dig;
    if (dig && dig.active) {
      const s = this.sprites.get('crack', dig.stage, false);
      ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, dig.c * T + ox, dig.r * T + oy, s.w, s.h);
    }

    // (7) Fallender Sand, TNT, Gegenstände, Gems, Truhen (Kacheln), Bett, Portal, Kristalle.
    const falling = game.falling;
    for (let i = 0; i < falling.length; i++) {
      const f = falling[i];
      if (f.active) this._blitTL(TILE_BY_ID[f.tile].art, 0, f.x, f.y);
    }

    const tnts = game.tnt;
    if (tnts) {
      const blink = ((game.time * 5) | 0) & 1;
      for (let i = 0; i < tnts.length; i++) {
        const t = tnts[i];
        if (!t.active) continue;
        const c = Math.floor(t.x / T), r = Math.floor(t.y / T);
        const x = c * T + ox, y = r * T + oy;
        const s = this.sprites.get('blk_tnt', 0, false);
        ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, x, y, T, T);
        if (blink) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.6;
          ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, x, y, T, T);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }

    const pickups = game.pickups;
    for (let i = 0; i < pickups.length; i++) {
      const it = pickups[i];
      if (!it.active) continue;
      const name = PICKUP_SPRITE[it.kind];
      if (name) this._put(name, (game.time * 6) | 0, false, it.x, it.y);
    }

    const gems = map.gems;
    const gemFrame = (game.time * 6) | 0;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      if (g.taken) continue;
      this._put(g.diamond ? 'it_diamond' : 'it_emerald', gemFrame, false, g.x, g.y);
    }

    if (map.checkpoint) this._put('bed', 0, false, map.checkpoint.x, map.checkpoint.y);
    if (map.goal && (!map.boss || game.bossDefeated)) {
      this._put('portal', (game.time * 8) | 0, false, map.goal.x, map.goal.y);
    }

    const crystals = game.crystals;
    if (crystals) {
      for (let i = 0; i < crystals.length; i++) {
        const cr = crystals[i];
        if (cr.alive) this._put('crystal', ((game.time * 4) | 0) & 1, false, cr.x + cr.w / 2, cr.y + cr.h);
      }
    }

    // (8) Gegner.
    const mobs = game.mobs;
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (!m.active || m.state === 'gone') continue;
      let name = MOB_SPRITE[m.type];
      if (!name) continue;
      let frame = (m.animTime * 6) | 0;
      if (m.type === 'zischer' && m.state === 'fuse') {
        name = 'mob_zischer_fuse';
        frame = (game.time * 10) | 0;
      } else if (m.type === 'skeleton' && m.anim === 'shoot') {
        name = 'mob_skeleton_shoot';
        frame = 0;
      }
      const flip = m.face < 0;
      const wx = m.x + m.w / 2, wy = m.y + m.h;
      if (m.flip) this._putFlipV(name, 0, flip, wx, wy);
      else this._put(name, frame, flip, wx, wy);
    }

    // (9) Boss (blinkt bei Unverwundbarkeit).
    const b = game.boss;
    if (b && b.active) {
      const blinkOff = b.invuln > 0 && ((game.time * 12.5) | 0) & 1;
      if (!blinkOff) {
        if (b.parts && b.parts.length) {
          for (let i = 0; i < b.parts.length; i++) {
            const q = b.parts[i];
            if (q.active === false) continue;
            this._put(q.size === 'l' ? 'boss_slime_l' : 'boss_slime_m', (game.time * 4) | 0, q.face < 0, q.x + q.w / 2, q.y + q.h);
          }
        } else {
          let name = null, frame = (game.time * 4) | 0;
          if (b.kind === 'slimeking') name = 'boss_slime_l';
          else if (b.kind === 'dreikopf') name = 'boss_dreikopf';
          else if (b.kind === 'drache') {
            name = b.state === 'perch' ? 'boss_drache_perch' : 'boss_drache';
            frame = (game.time * 6) | 0;
          }
          if (name) this._put(name, frame, b.face < 0, b.x + b.w / 2, b.y + b.h);
        }
      }
    }

    // (10) Spieler: 16×28, Hitbox 12×26 (Mitte unten), blinkt bei Verwundbarkeit, Stern = Farbwechsel.
    const p = game.player;
    const pBlink = p.invuln > 0 && (((game.time * 12.5) | 0) & 1);
    if (!pBlink) {
      const names = HERO_NAME[p.power] || HERO_NAME.plain;
      const name = names[p.anim] || names.stand;
      const frame = (p.animTime * (HERO_RATE[p.anim] || 1)) | 0;
      const starred = p.star > 0;
      if (starred) ctx.filter = HUE[((game.time * 10) | 0) % HUE.length];
      this._put(name, frame, p.face < 0, p.x + p.w / 2, p.y + p.h);
      if (starred) ctx.filter = 'none';
    }

    // (11) Geschosse und Partikel.
    const projs = game.projectiles;
    for (let i = 0; i < projs.length; i++) {
      const o = projs[i];
      if (!o.active) continue;
      const name = PROJ_SPRITE[o.type];
      if (name) this._put(name, 0, o.vx < 0, o.x + o.w / 2, o.y + o.h);
    }

    const parts = game.particles;
    for (let i = 0; i < parts.length; i++) {
      const q = parts[i];
      if (!q.active) continue;
      if (q.kind === 'smoke') {
        this._put('fx_smoke', q.frame, false, q.x, q.y + 8);
        continue;
      }
      // Bröckchen: 4×4-Ausschnitt aus der Mitte des Block-Sprites.
      const art = TILE_BY_ID[q.tile].art;
      if (!art) continue;
      const s = this.sprites.get(art, 0, false);
      if (s.w < 16) continue;
      const dx = Math.round(q.x + ox), dy = Math.round(q.y + oy);
      if (dx + 4 < 0 || dx > vw || dy + 4 < 0 || dy > vh) continue;
      ctx.drawImage(this.sprites.atlas, s.sx + 6, s.sy + 6, 4, 4, dx, dy, 4, 4);
    }

    // (12) Dunkelheit.
    this._drawDark(game);

    // (13) HUD und Knöpfe.
    drawHud(ctx, game, vw, vh);
    drawControls(ctx, input, vw, vh);
    if (this.debug) this._drawDebug(ctx, fps);
  }
}
