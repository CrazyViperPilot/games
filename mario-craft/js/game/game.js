// Ablauf eines Levels (PLAN §5, PRD §2–§7). Kein DOM. update(dt, input) = ein fester Schritt.
// Lesbar für Renderer/HUD: map, player, enemies[], items[], fireballs[], shots[], particles[], platforms[],
// boss, bumps[], camX, viewW, time, coins, lives, starCoins[3], score, state, collectedCoins.
// Renderer: map.coins[i].taken, map.hidden entfällt (versteckte Blöcke sind Kachel 0 bis zum Treffer).
// Geänderte Kacheln: game.dirty[0..dirtyCount) enthält r*cols+c; nach dem Zeichnen clearDirty() aufrufen.
// Plattform: { x, y, w, h, dx, dy, path, active, ... } – x/y oben links, y = Oberkante. Inaktive nicht zeichnen.
import { PHYS } from '../data/physics.js';
import { TILES, TILE_BY_ID, BARRIER_TILE } from '../data/tiles.js';
import { TUNE } from '../data/combat.js';
import { parseLevel } from './level.js';
import { createPlayer, setPower, updatePlayer } from './player.js';
import { createEnemy, createBoss, updateEnemies, updateBoss, updateShots, killEnemiesOn, rectHit } from './enemies.js';
import { hitBlock, spawnFireball, updateFireballs, updateItems, updateEffects } from './items.js';

const T = PHYS.tile;
const R = PHYS.rows;
const G = PHYS.gravity;
const INVIS_ID = TILES['!'].id;
const BARRIER_ID = BARRIER_TILE.id;
const POOL_ITEMS = 16;
const POOL_SHOTS = 6;
const POOL_PARTICLES = 64;
const POOL_BUMPS = 4;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function blank() {
  return {
    type: '', x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, face: 1, anim: '', animTime: 0,
    active: false, state: '', timer: 0, targetY: 0, life: 0, c: 0, r: 0,
  };
}

function makePool(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(blank());
  return out;
}

// Plattform: Kachel-Einheiten → px. 'h'/'v' pendeln über range, 'fall' fällt nach 0,5 s Stehzeit mit speed px/s.
function makePlatform(pd) {
  const x = pd.c * T, y = pd.r * T;
  return {
    x, y, w: pd.w * T, h: T / 2, dx: 0, dy: 0,
    path: pd.path, ox: x, oy: y, range: (pd.range || 0) * T, speed: pd.speed || 0,
    off: 0, dir: 1, state: 'still', timer: 0, active: true,
  };
}

export class Game {
  constructor({ level, save, onEvent, viewW = 384 } = {}) {
    const s = save || {};
    const map = parseLevel(level);
    this.map = map;
    this.onEvent = onEvent || null;
    this.viewW = viewW;
    this.state = 'play';
    this.time = 0;
    this.score = 0;
    this.lives = s.lives ?? PHYS.lives;
    this.coins = s.coins ?? 0;
    this.collectedCoins = 0;
    this.starCoins = [false, false, false];
    this.chain = 0;
    this.jumpHeld = false;
    this.dyingT = 0;
    this.bossDefeated = false;
    this.checkpointReached = false;
    this.respawnAt = { x: map.start.x, y: map.start.y };
    this.camX = 0;

    this.player = createPlayer(map.start.x, map.start.y, s.power || 'small');
    this.platforms = map.platforms.map(makePlatform);

    this.enemies = [];
    for (const sp of map.spawns) {
      if (sp.type !== 'boss') this.enemies.push(createEnemy(sp.type, sp.x, sp.y));
    }
    this.boss = null;
    if (map.boss) {
      const sp = map.spawns.find((q) => q.type === 'boss');
      this.boss = sp
        ? createBoss(map.boss, sp.x, sp.y)
        : createBoss(map.boss, map.goal.x - 8 * T, (R) * T);
    }

    this.items = makePool(POOL_ITEMS);
    this.fireballs = makePool(PHYS.maxFireballs);
    this.shots = makePool(POOL_SHOTS);
    this.particles = makePool(POOL_PARTICLES);
    this.bumps = makePool(POOL_BUMPS);

    this.dirty = new Int32Array(64);
    this.dirtyCount = 0;
    this.dirtyAll = false;

    // Versteckte Blöcke: leer bis zum Kopfstoß von unten.
    this.hidden = [];
    const tiles = map.tiles;
    for (let idx = 0; idx < tiles.length; idx++) {
      if (tiles[idx] === INVIS_ID) {
        const c = idx % map.cols;
        tiles[idx] = 0;
        this.hidden.push({ c, r: (idx - c) / map.cols });
      }
    }

    // Inhalt der Bonusblöcke, Schlüssel = r*cols + c.
    this.blockContent = new Map();
    for (const key of Object.keys(map.items)) {
      const [c, r] = key.split(',').map(Number);
      this.blockContent.set(r * map.cols + c, { kind: map.items[key], left: 10 });
    }

    // Münzen: Sternmünzen nach x nummeriert (starIdx 0..2).
    for (const coin of map.coins) { coin.taken = false; coin.starIdx = -1; }
    const stars = map.coins.filter((c) => c.star).sort((a, b) => a.x - b.x);
    stars.forEach((c, i) => { c.starIdx = i; });

    // Unsichtbare Wand 2 Kacheln vor der Zielfahne (nur Boss-Levels, nur auf leeren Zellen).
    this.barrier = [];
    if (map.boss) {
      const bc = Math.floor(map.goal.x / T) - TUNE.barrierDist;
      for (let r = 0; r < R; r++) {
        if (map.get(bc, r) === 0) {
          map.set(bc, r, BARRIER_ID);
          this.barrier.push({ c: bc, r });
        }
      }
    }

    this._follow();
  }

  emit(name, data) {
    if (this.onEvent) this.onEvent(name, data);
  }

  addScore(n) {
    if (!n) return;
    this.score += n;
    this.emit('hudChange');
  }

  collectCoin() {
    this.collectedCoins++;
    this.coins++;
    this.emit('coin');
    if (this.coins >= PHYS.coinsPerLife) {
      this.coins -= PHYS.coinsPerLife;
      this.gainLife();
    }
    this.emit('hudChange');
  }

  gainLife() {
    this.lives++;
    this.emit('oneup');
    this.emit('hudChange');
  }

  markDirty(c, r) {
    if (this.dirtyCount < this.dirty.length) this.dirty[this.dirtyCount++] = r * this.map.cols + c;
    else this.dirtyAll = true;
  }

  clearDirty() {
    this.dirtyCount = 0;
    this.dirtyAll = false;
  }

  // Treffer durch Gegner, Geschoss oder Lava-Kontakt: stuft die Figur herunter oder kostet ein Leben.
  hurtPlayer(cause) {
    const p = this.player;
    if (this.state !== 'play' || p.dead) return;
    if (p.invuln > 0 || p.star > 0) return;
    if (p.power === 'small') { this.loseLife(cause); return; }
    setPower(p, p.power === 'fire' ? 'big' : 'small');
    p.invuln = PHYS.hurtInvuln;
    this.emit('hurt');
    this.emit('hudChange');
  }

  // Leben verloren: 1,5 s Sterben, danach Neustart (siehe _updateDying).
  loseLife(cause) {
    if (this.state !== 'play') return;
    const p = this.player;
    this.state = 'dying';
    this.dyingT = TUNE.deathTime;
    p.dead = true;
    p.vx = 0;
    p.vy = cause === 'pit' ? 0 : TUNE.deathHop;
    this.emit('die', { cause });
    this.emit('lifeLost', { cause, lives: this.lives });
  }

  defeatBoss() {
    this.bossDefeated = true;
    for (const cell of this.barrier) {
      this.map.set(cell.c, cell.r, 0);
      this.markDirty(cell.c, cell.r);
    }
    this.addScore(TUNE.bossDefeatPoints);
    this.emit('stomp');
  }

  update(dt, input) {
    this.jumpHeld = input.jump;
    if (this.state === 'dying') { this._updateDying(dt); return; }
    if (this.state !== 'play') return;
    const p = this.player;
    this.time += dt;

    this._movePlatforms(dt);
    const prevFeet = p.y + p.h;
    const prevTop = p.y;
    const wasGround = p.onGround;
    const res = updatePlayer(this, dt, input);
    if (p.onGround) this.chain = 0;
    if (wasGround && !p.onGround && p.vy < 0) this.emit('jump');
    if (res.hitHead) this._headHit(res.hitHead.c, res.hitHead.r);
    this._checkHidden(prevTop);
    this._advancePlatforms();

    if (input.firePressed && p.power === 'fire') spawnFireball(this);
    updateFireballs(this, dt);
    updateEnemies(this, dt, prevFeet);
    if (this.state !== 'play') return;
    updateBoss(this, dt, prevFeet);
    if (this.state !== 'play') return;
    updateShots(this, dt);
    if (this.state !== 'play') return;
    updateItems(this, dt);
    updateEffects(this, dt);
    this._checkCoins();
    this._checkCheckpoint();
    this._checkGoal();
    if (this.state !== 'play') return;
    this._checkHazards();
    if (this.state !== 'play') return;
    this._follow();
  }

  _headHit(c, r) {
    hitBlock(this, c, r);
    killEnemiesOn(this, c, r);
  }

  // Unsichtbarer Block: Die Figur steigt von unten durch seine Unterkante → Block wird fest.
  _checkHidden(prevTop) {
    const p = this.player;
    if (!(p.y < prevTop)) return;
    for (let i = 0; i < this.hidden.length; i++) {
      const h = this.hidden[i];
      if (!h) continue;
      const bottom = (h.r + 1) * T;
      if (prevTop >= bottom - 0.01 && p.y < bottom && p.x < (h.c + 1) * T && p.x + p.w > h.c * T) {
        p.y = bottom;
        p.vy = 0;
        this.map.set(h.c, h.r, TILES['H'].id);
        this.markDirty(h.c, h.r);
        this.hidden[i] = null;
        bumpBlockAt(this, h.c, h.r);
        this.emit('appear');
        return;
      }
    }
  }

  _standingOn(pl) {
    const p = this.player;
    return !p.dead && p.onGround && p.x + p.w > pl.x && p.x < pl.x + pl.w
      && Math.abs(p.y + p.h - pl.y) < 0.5;
  }

  // Bewegt Plattformen für diesen Schritt (dx/dy); Position wird in _advancePlatforms übernommen.
  _movePlatforms(dt) {
    for (let i = 0; i < this.platforms.length; i++) {
      const pl = this.platforms[i];
      if (!pl.active) { pl.dx = 0; pl.dy = 0; continue; }
      if (pl.path === 'fall') {
        pl.dx = 0;
        if (pl.state === 'still') {
          pl.dy = 0;
          pl.timer = this._standingOn(pl) ? pl.timer + dt : 0;
          if (pl.timer >= TUNE.fallDelay) pl.state = 'falling';
        } else {
          pl.dy = pl.speed * dt;
        }
      } else {
        pl.off += pl.dir * pl.speed * dt;
        if (pl.off >= pl.range) { pl.off = pl.range; pl.dir = -1; }
        else if (pl.off <= 0) { pl.off = 0; pl.dir = 1; }
        const nx = pl.ox + (pl.path === 'h' ? pl.off : 0);
        const ny = pl.oy + (pl.path === 'v' ? pl.off : 0);
        pl.dx = nx - pl.x;
        pl.dy = ny - pl.y;
      }
    }
  }

  _advancePlatforms() {
    for (let i = 0; i < this.platforms.length; i++) {
      const pl = this.platforms[i];
      if (!pl.active) continue;
      pl.x += pl.dx;
      pl.y += pl.dy;
      if (pl.path === 'fall' && pl.state === 'falling' && pl.y > R * T + 16) {
        pl.active = false;
        pl.y = 1e6;
      }
    }
  }

  _checkCoins() {
    const p = this.player;
    const coins = this.map.coins;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.taken) continue;
      if (!rectHit(p.x, p.y, p.w, p.h, c.x - 6, c.y - 14, 12, 12)) continue;
      c.taken = true;
      if (c.star) {
        if (c.starIdx >= 0 && c.starIdx < this.starCoins.length) this.starCoins[c.starIdx] = true;
        this.emit('coin');
        this.emit('hudChange');
      } else {
        this.collectCoin();
      }
    }
  }

  _checkCheckpoint() {
    const cp = this.map.checkpoint;
    if (!cp || this.checkpointReached) return;
    const p = this.player;
    if (p.x + p.w / 2 >= cp.x) {
      this.checkpointReached = true;
      this.respawnAt = { x: cp.x, y: cp.y };
      this.emit('checkpoint');
    }
  }

  _checkGoal() {
    const goal = this.map.goal;
    const p = this.player;
    if (p.x + p.w < goal.x - 2) return;
    if (this.boss && !this.bossDefeated) return;
    const top = 2 * T, bottom = (R - 1) * T;
    const frac = clamp((bottom - (p.y + p.h)) / (bottom - top), 0, 1);
    this.addScore(TUNE.pointsFlagMin + Math.round(frac * (TUNE.pointsFlagMax - TUNE.pointsFlagMin)));
    this.state = 'won';
    this.emit('goal');
    this.emit('levelDone', {
      time: this.time, coins: this.collectedCoins, starCoins: this.starCoins.slice(), score: this.score,
    });
  }

  // Grube (unter dem Level) oder Gefahrenkachel (Lava, Stacheln) kostet ein Leben.
  _checkHazards() {
    const p = this.player;
    const map = this.map;
    if (p.y > R * T) { this.loseLife('pit'); return; }
    const c0 = Math.floor(p.x / T), c1 = Math.floor((p.x + p.w - 0.01) / T);
    const r0 = Math.floor(p.y / T), r1 = Math.floor((p.y + p.h - 0.01) / T);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (TILE_BY_ID[map.get(c, r)].hazard) { this.loseLife('hazard'); return; }
      }
    }
  }

  _updateDying(dt) {
    const p = this.player;
    this.dyingT -= dt;
    p.vy = Math.min(p.vy + G * dt, PHYS.maxFall);
    p.y += p.vy * dt;
    if (this.dyingT > 0) return;
    this.lives -= 1;
    if (this.lives <= 0) {
      this.lives = 0;
      this.state = 'over';
      this.emit('hudChange');
      this.emit('gameOver');
      return;
    }
    const at = this.respawnAt;
    this.player = createPlayer(at.x, at.y, 'small');
    this.camX = this._clampCam(at.x - 0.4 * this.viewW);
    this.state = 'play';
    this.emit('hudChange');
  }

  _clampCam(x) {
    const max = Math.max(0, this.map.cols * T - this.viewW);
    return Math.round(clamp(x, 0, max));
  }

  // Kamera: Totzone 35–50 % der Breite; scrollt nur nach rechts. Die Figur kann nicht hinter den Bildrand.
  _follow() {
    const p = this.player;
    const center = p.x + p.w / 2;
    if (center - this.camX > 0.5 * this.viewW) {
      this.camX = this._clampCam(center - 0.5 * this.viewW);
    }
    if (p.x < this.camX) {
      p.x = this.camX;
      if (p.vx < 0) p.vx = 0;
    }
  }
}

// Wackeln an einer Zelle (ohne Treffer-Logik).
function bumpBlockAt(game, c, r) {
  for (let i = 0; i < game.bumps.length; i++) {
    const b = game.bumps[i];
    if (!b.active) {
      b.active = true;
      b.c = c;
      b.r = r;
      b.timer = TUNE.bumpTime;
      return;
    }
  }
}
