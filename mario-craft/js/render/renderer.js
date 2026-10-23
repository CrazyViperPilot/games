// Renderer (PLAN §2, §6, PRD §9). Zeichnet in ein Canvas mit interner Auflösung viewW × viewH.
// Reihenfolge: Parallax-Hintergrund, Kachel-Abschnitte, animierte Overlays, Plattformen, Gegenstände,
// Gegner, Boss, Spieler, Geschosse, Partikel, dann HUD und Bedienknöpfe.
import { buildChunks } from './tilecache.js';
import { drawHud, drawControls, drawText, bindHud } from './hud.js';
import { THEMES } from './sprites.js';

const T = 16;
const LEVEL_H = 15 * T;   // 240 px, Level unten bündig
const BG_W = 256;         // Kachelbreite der Parallax-Ebenen
const FAR = 0.2, NEAR = 0.5;

const PL_WALK = [1, 2, 3, 2];
const PL_RUN = [4, 5, 6, 5];
const ENEMY_NAMES = {
  walker: { base: 'walker', sq: 'walker_sq', v: 'walker_v' },
  beetle: { base: 'beetle', shell: 'beetle_shell', v: 'beetle_v' },
  hopper: { base: 'hopper', sq: 'hopper_sq', v: 'hopper_v' },
  spiky: { base: 'spiky', v: 'spiky_v' },
  lavaball: { base: 'lavaball', v: 'lavaball' },
};
const ITEM_NAMES = { mushroom: 'it_mush', flower: 'it_flower', star: 'it_star', oneup: 'it_1up' };
const BOSS_NAMES = { rootking: 'rootking', golem: 'golem', dragon: 'dragon' };

// ---------- Parallax-Hintergründe (je Welt, 256 px breit, kachelbar) ----------
const hashN = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// Abstand in x auf dem Ring 0..256.
const wrapD = (a, b) => {
  let d = (a - b) % BG_W;
  if (d > BG_W / 2) d -= BG_W;
  if (d < -BG_W / 2) d += BG_W;
  return d;
};
const TAU = Math.PI * 2;
const sinP = (x, k, ph = 0) => Math.sin((x / BG_W) * TAU * k + ph);
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
// Farbverlauf in Bändern (Pixel-Look).
function band(c0, c1, t, steps) {
  const q = Math.floor(t * steps) / steps;
  return mix(c0, c1, q);
}

// Liefert die RGBA-Farbe eines Pixels der Ebene (0 = transparent).
const LAYERS = {
  meadow: {
    far: (x, y, H) => {
      const t = y / H;
      if (y > H * (0.56 + 0.02 * sinP(x, 2, 1) + 0.02 * sinP(x, 3))) return hex('#9ad988');
      for (const [cx, cy, r] of [[34, 0.16, 15], [128, 0.10, 11], [204, 0.22, 17], [240, 0.08, 9]]) {
        const cyy = H * cy;
        if (Math.hypot(wrapD(x, cx), y - cyy) < r) return y - cyy > r * 0.4 ? hex('#dfefff') : hex('#ffffff');
        if (Math.hypot(wrapD(x, cx - r * 0.7), (y - cyy - r * 0.2) * 1.2) < r * 0.7) return hex('#ffffff');
      }
      return band(hex('#7fc8ff'), hex('#d9f2ff'), t, 6);
    },
    near: (x, y, H) => {
      const line = H * (0.78 + 0.03 * sinP(x, 2, 2));
      for (const [tx, tr] of [[20, 10], [92, 13], [170, 9], [226, 12]]) {
        const d = wrapD(x, tx);
        const top = line - tr * 1.6 - 10;
        if (Math.hypot(d, (y - (top + tr))) < tr && y < line) return hex('#2f8a3a');
        if (Math.abs(d) < 2 && y < line && y > top + tr) return hex('#6b4226');
      }
      if (y > line) return y > line + 6 ? hex('#3c7f36') : hex('#63b04a');
      return [0, 0, 0, 0];
    },
  },
  cave: {
    far: (x, y, H) => {
      const t = y / H;
      const hang = 14 + 8 * Math.abs(sinP(x, 3)) + 5 * Math.abs(sinP(x, 7, 1));
      if (y < hang) return hex('#2a2f4a');
      for (const [cx, cy] of [[40, 0.44], [150, 0.36], [214, 0.5]]) {
        if (Math.abs(wrapD(x, cx)) < 2 && Math.abs(y - H * cy) < 2) return hex('#8ef0ff');
      }
      return band(hex('#1a1f3a'), hex('#2e3360'), t, 5);
    },
    near: (x, y, H) => {
      const floor = H * 0.8 - 6 * Math.abs(sinP(x, 4, 0.5));
      const dx = wrapD(x, 70), dy = wrapD(x, 190);
      if (y > floor) return hex('#141829');
      if (Math.abs(dx) < 4 && y > floor - 16 + Math.abs(dx)) return hex('#1f2640');
      if (Math.abs(dy) < 3 && y > floor - 10 + Math.abs(dy)) return hex('#1f2640');
      if (hashN(x, y, 3) > 0.9998) return hex('#6fe0ff');
      return [0, 0, 0, 0];
    },
  },
  castle: {
    far: (x, y, H) => {
      const t = y / H;
      const top = H * 0.34 + 6 * Math.abs(sinP(x, 2));
      for (const [cx, w] of [[30, 26], [130, 30], [220, 22]]) {
        const d = wrapD(x, cx);
        if (Math.abs(d) < w / 2 && y > H * 0.2) {
          if (Math.abs(d) < 1.5 && y > H * 0.3 && y < H * 0.36) return hex('#ffb347');
          return hex('#2a0a14');
        }
      }
      if (y > top) return hex('#3a1020');
      return band(hex('#2a0a14'), hex('#6a1c28'), t, 6);
    },
    near: (x, y, H) => {
      const wall = H * 0.7;
      if (y < wall) return [0, 0, 0, 0];
      if (y < wall + 6 && ((Math.floor(x / 8) % 2) === 0)) return hex('#5a1a2a');
      if (y % 8 === 0) return hex('#2c0a14');
      const off = (Math.floor(y / 8) % 2) * 8;
      if ((x + off) % 16 === 0) return hex('#2c0a14');
      if (Math.abs(wrapD(x, 56)) < 3 && y > wall + 10 && y < wall + 22) return hex('#ffcf70');
      if (Math.abs(wrapD(x, 200)) < 3 && y > wall + 10 && y < wall + 22) return hex('#ffcf70');
      return hex('#4a1420');
    },
  },
};

// Erzeugt eine Ebene (256 × H) aus einer Pixelfunktion.
function makeLayer(fn, H) {
  const cv = makeCanvasLike(BG_W, H);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(BG_W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < BG_W; x++) {
      const c = fn(x, y, H);
      const i = (y * BG_W + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
function makeCanvasLike(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
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
    this.bgFar = null;
    this.bgNear = null;
    this.camX = 0;
    this.oy = 0;
    this.bonusCells = [];
    this.lavaCells = [];
    this.pl = null;
    this.N = null;
    this._last = performance.now();
    this._max = 0;
    this._shownMax = 0;
    this._winStart = this._last;
    bindHud(sprites);
    this.ctx.imageSmoothingEnabled = false;
  }

  setView(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
    if (this.canvas.width !== viewW) this.canvas.width = viewW;
    if (this.canvas.height !== viewH) this.canvas.height = viewH;
    this.ctx.imageSmoothingEnabled = false;
    if (this.theme) this._buildBg();
  }

  setLevel(map, theme) {
    this.map = map;
    this.theme = THEMES.includes(theme) ? theme : 'meadow';
    this.tiles = buildChunks(map, this.sprites, this.theme);
    this._buildBg();
    // Feste Listen für Overlays (Bonusblöcke, Lava-Oberflächen).
    this.bonusCells = [];
    this.lavaCells = [];
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const id = map.get(c, r);
        if (id === 3) this.bonusCells.push(c, r);
        if (id === 7 && map.get(c, r - 1) !== 7) this.lavaCells.push(c, r);
      }
    }
    const t = this.theme;
    this.N = {
      bonus: `${t}/bonus`, lavaSurf: `${t}/lava_surf`, debris: `${t}/debris`,
      plat_l: `${t}/plat_l`, plat_m: `${t}/plat_m`, plat_r: `${t}/plat_r`, plat_s: `${t}/plat_s`,
    };
    this.pl = ['pl_s_n', 'pl_s_0', 'pl_s_1', 'pl_s_2', 'pl_b_n', 'pl_b_f', 'pl_b_0', 'pl_b_1', 'pl_b_2'];
  }

  _buildBg() {
    if (!this.theme) return;
    const layers = LAYERS[this.theme];
    this.bgFar = makeLayer(layers.far, this.viewH);
    this.bgNear = makeLayer(layers.near, this.viewH);
  }

  // Zeichnet eine Hintergrundebene parallax über die ganze Breite.
  _drawBgLayer(ctx, cv, factor) {
    const off = (Math.floor(this.camX * factor)) % BG_W;
    for (let x = -off; x < this.viewW; x += BG_W) ctx.drawImage(cv, x, 0);
  }

  // Stellt einen Streifen des Hintergrunds an (x, y, w, h) wieder her (für Blockstöße).
  _eraseBg(ctx, x, y, w, h) {
    for (const [cv, f] of [[this.bgFar, FAR], [this.bgNear, NEAR]]) {
      const off = Math.floor(this.camX * f) % BG_W;
      let sx = (x + off) % BG_W;
      if (sx < 0) sx += BG_W;
      const first = Math.min(w, BG_W - sx);
      ctx.drawImage(cv, sx, y, first, h, x, y, first, h);
      if (first < w) ctx.drawImage(cv, 0, y, w - first, h, x + first, y, w - first, h);
    }
  }

  // Zeichnet ein Sprite; (wx, wyBottom) in Weltkoordinaten, Zentrum horizontal, Unterkante vertikal.
  _put(ctx, name, frame, flip, wx, wyBottom) {
    const s = this.sprites.get(name, frame, flip);
    const cx = wx - this.camX;
    if (cx + s.w < 0 || cx - s.w > this.viewW) return;
    const dx = Math.round(cx - s.w / 2);
    const dy = Math.round(wyBottom + this.oy - s.h);
    ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, dx, dy, s.w, s.h);
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

    // Kachel-Änderungen einarbeiten.
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

    this.camX = game.camX | 0;
    this.oy = vh - LEVEL_H;
    const camX = this.camX;
    const oy = this.oy;

    // Hintergrund
    this._drawBgLayer(ctx, this.bgFar, FAR);
    this._drawBgLayer(ctx, this.bgNear, NEAR);

    // Abschnitte: nur sichtbare
    const chunks = this.tiles.chunks;
    const first = Math.max(0, Math.floor(camX / 256));
    const last = Math.min(chunks.length - 1, Math.floor((camX + vw) / 256));
    for (let i = first; i <= last; i++) {
      ctx.drawImage(chunks[i], i * 256 - camX, oy);
    }

    // Bumps: Block wird 4 px hochgeschoben (Streifen darunter wird mit Hintergrund gefüllt).
    for (let i = 0; i < game.bumps.length; i++) {
      const b = game.bumps[i];
      if (!b.active) continue;
      const sx = b.c * T - camX, sy = b.r * T + oy;
      if (sx + T < 0 || sx > vw) continue;
      const ci = Math.floor(b.c / 16);
      const lx = (b.c - ci * 16) * T, ly = b.r * T;
      this._eraseBg(ctx, sx, sy + T - 4, T, 4);
      ctx.drawImage(chunks[ci], lx, ly, T, T, sx, sy - 4, T, T);
    }

    // Animierte Overlays: Bonusblöcke, Lava-Oberflächen
    const bonusF = ((game.time * 5) | 0) % 3;
    const lavaF = ((game.time * 8) | 0) & 3;
    const bc = this.bonusCells;
    for (let i = 0; i < bc.length; i += 2) {
      const c = bc[i], r = bc[i + 1];
      if (map.get(c, r) !== 3) continue;
      const sx = c * T - camX;
      if (sx + T < 0 || sx > vw) continue;
      const s = this.sprites.get(this.N.bonus, bonusF, false);
      ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, sx, r * T + oy, T, T);
    }
    const lc = this.lavaCells;
    for (let i = 0; i < lc.length; i += 2) {
      const c = lc[i], r = lc[i + 1];
      const sx = c * T - camX;
      if (sx + T < 0 || sx > vw) continue;
      const s = this.sprites.get(this.N.lavaSurf, lavaF, false);
      ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, sx, r * T + oy, T, 4);
    }

    // Plattformen (bewegt oder fallend), in 16-px-Stücken
    for (const pl of game.platforms) {
      if (!pl.active) continue;
      const n = Math.max(1, Math.round(pl.w / T));
      const py = Math.round(pl.y) + oy;
      for (let k = 0; k < n; k++) {
        const name = n === 1 ? this.N.plat_s : k === 0 ? this.N.plat_l : k === n - 1 ? this.N.plat_r : this.N.plat_m;
        const sx = Math.round(pl.x) + k * T - camX;
        if (sx + T < 0 || sx > vw) continue;
        const s = this.sprites.get(name, 0, false);
        ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, sx, py, T, 8);
      }
    }

    // Münzen (ohne eingesammelte), Zielfahne, Checkpoint
    const coinF = ((game.time * 10) | 0) & 3;
    for (const c of map.coins) {
      if (c.taken) continue;
      if (c.star) this._put(ctx, 'coinstar', ((game.time * 4) | 0) & 1, false, c.x, c.y - 2);
      else this._put(ctx, 'coin', coinF, false, c.x, c.y - 2);
    }
    if (map.checkpoint) this._put(ctx, game.checkpointReached ? 'cp_on' : 'cp_off', 0, false, map.checkpoint.x + 5.5, map.checkpoint.y);
    if (map.goal) this._put(ctx, 'goal', 0, false, map.goal.x + 7.5, map.goal.y);

    // Gegenstände
    for (let i = 0; i < game.items.length; i++) {
      const it = game.items[i];
      if (!it.active) continue;
      if (it.type === 'coinpop') {
        this._put(ctx, 'coin', ((it.animTime * 16) | 0) & 3, false, it.x + it.w / 2, it.y + it.h);
        continue;
      }
      const name = ITEM_NAMES[it.type];
      if (!name) continue;
      this._put(ctx, name, it.type === 'star' ? ((game.time * 10) | 0) & 1 : 0, false, it.x + it.w / 2, it.y + it.h);
    }

    // Feuerbälle
    for (let i = 0; i < game.fireballs.length; i++) {
      const f = game.fireballs[i];
      if (!f.active) continue;
      this._put(ctx, 'fireball', ((f.animTime * 16) | 0) & 3, false, f.x + f.w / 2, f.y + f.h);
    }

    // Gegner
    for (let i = 0; i < game.enemies.length; i++) {
      const e = game.enemies[i];
      if (!e.active || e.done || e.hidden) continue;
      const N = ENEMY_NAMES[e.type];
      if (!N) continue;
      let name = N.base, frame = ((e.animTime * 8) | 0) & 1, flip = e.face > 0;
      if (e.state === 'dead') {
        name = e.anim === 'squash' && N.sq ? N.sq : N.v;
        frame = 0;
      } else if ((e.state === 'shell' || e.state === 'kicked') && N.shell) {
        name = N.shell;
        frame = 0;
      } else if (!e.onGround && (e.type === 'hopper')) {
        frame = 1;
      }
      this._put(ctx, name, frame, flip, e.x + e.w / 2, e.y + e.h);
    }

    // Boss (blinkt bei Unverwundbarkeit)
    const b = game.boss;
    if (b && b.active && !((b.invuln > 0) && ((game.time * 16) | 0) & 1)) {
      const kind = BOSS_NAMES[b.kind];
      if (kind) {
        const defeated = b.state === 'defeated';
        const name = defeated ? `${kind}_v` : kind;
        const frame = b.kind === 'golem' ? (b.state === 'dizzy' ? 1 : 0) : ((b.animTime * 4) | 0) & 1;
        this._put(ctx, name, defeated ? 0 : frame, b.face > 0, b.x + b.w / 2, b.y + b.h);
      }
    }

    // Geschosse des Bosses
    for (let i = 0; i < game.shots.length; i++) {
      const s = game.shots[i];
      if (!s.active) continue;
      if (s.type === 'rock') this._put(ctx, 'rock', ((s.animTime * 6) | 0) & 1, false, s.x + s.w / 2, s.y + s.h);
      else this._put(ctx, 'flame', ((s.animTime * 12) | 0) & 1, s.vx < 0, s.x + s.w / 2, s.y + s.h);
    }

    // Spieler (Blinken bei Verwundbarkeit, Farbwechsel bei Stern)
    const p = game.player;
    if (!((p.invuln > 0) && ((game.time * 16) | 0) & 1)) {
      let frame = 0;
      if (p.dead) frame = 10;
      else if (p.anim === 'walk') frame = PL_WALK[((p.animTime * 10) | 0) & 3];
      else if (p.anim === 'run') frame = PL_RUN[((p.animTime * 14) | 0) & 3];
      else if (p.anim === 'jump') frame = 7;
      else if (p.anim === 'fall') frame = 8;
      else if (p.anim === 'turn') frame = 9;
      const name = this.pl[pickPlayer(p, game.time)];
      this._put(ctx, name, frame, p.face < 0, p.x + p.w / 2, p.y + p.h);
    }

    // Partikel (Ziegelbruch)
    for (let i = 0; i < game.particles.length; i++) {
      const q = game.particles[i];
      if (!q.active) continue;
      const sx = Math.round(q.x) - camX, sy = Math.round(q.y) + oy;
      if (sx < -4 || sx > vw) continue;
      const s = this.sprites.get(this.N.debris, 0, false);
      ctx.drawImage(this.sprites.atlas, s.sx, s.sy, s.w, s.h, sx, sy, s.w, s.h);
    }

    drawHud(ctx, game, vw, vh);
    drawControls(ctx, input, vw, vh);
    if (this.debug) this._drawDebug(ctx, fps);
  }
}

// Palette-Variante des Spielers: klein/groß, Feuer, Stern-Zyklus.
function pickPlayer(p, time) {
  const small = p.power === 'small';
  if (p.star > 0) {
    const k = ((time * 12) | 0) % 3;
    return small ? 1 + k : 6 + k;
  }
  if (small) return 0;
  return p.power === 'fire' ? 5 : 4;
}
