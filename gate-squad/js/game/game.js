// Game-Klasse: Zustand, Update-Reihenfolge, Truppen-Verluste, Kill-Logik, Spielende.
import { CFG } from '../config.js';
import { Pool } from '../core/pool.js';
import { mulberry32 } from '../core/rng.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { BAL, hpMult, coinsForResult } from '../data/balance.js';
import { MAX_TIER } from '../data/weapons.js';
import { getLevel } from '../data/levels.js';
import { createSquad, squadRadius, recomputeStats, updateSquad } from '../entities/squad.js';
import { updateBullets, updateGrenades, updateEnemyBullets } from '../entities/projectiles.js';
import { updateEnemies } from '../entities/enemies.js';
import { updateGates } from '../entities/gates.js';
import { updateCrates } from '../entities/crates.js';
import { spawnBoss, updateBoss } from '../entities/boss.js';
import { createParticle, updateParticles, burst, emit, floatText } from '../entities/particles.js';
import { LevelRunner } from './levelRunner.js';

// Scroll-Tempo von Toren und Kisten in der Boss-Phase (Einheiten/s).
// TODO: nach data/balance.js verschieben, sobald dort Platz ist.
const BOSS_PUSH_SPEED = 120;
const DEFAULT_H = 800;
const END_DELAY_WON = 1.2;
const END_DELAY_LOST = 1.0;

const bulletFactory = () => ({
  active: false, x: 0, y: 0, vx: 0, vy: 0, dmg: 0, life: 0,
  pierce: 0, len: 0, width: 0, color: '#ffffff', hitId: 0, gateRow: -1,
});
const enemyBulletFactory = () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0 });
const grenadeFactory = () => ({
  active: false, kind: 'gl', x0: 0, y0: 0, x: 0, y: 0, tx: 0, ty: 0, t: 0, dur: 0.7, dmg: 0, radius: 0,
  landed: false, fuse: 0, vx: 0, vy: 0,
});
const enemyFactory = () => ({
  active: false, def: null, x: 0, y: 0, hp: 0, maxHp: 0, shield: 0, maxShield: 0, r: 0,
  state: 'walk', timer: 0, aimX: 0, aimY: 0, flash: 0, walk: 0, uid: 0,
});

export class Game {
  constructor({ save, onEnd, onHudChange } = {}) {
    this.save = save;
    this.onEnd = onEnd || (() => {});
    this.onHudChange = onHudChange || (() => {});

    this.W = CFG.WORLD_W;
    this.H = DEFAULT_H;
    this.SQUAD_Y = this.H - CFG.SQUAD_OFFSET;

    this.state = 'idle';
    this.phase = 'run';
    this.levelNum = 0;
    this.level = null;
    this.hpMul = 1;
    this.rng = mulberry32(1);
    this.rowSeq = 0;
    this.uidSeq = 0;

    this.distance = 0;
    this.scroll = 0;
    this.objSpeed = 0;
    this.time = 0;
    this.kills = 0;
    this.coinsEarned = 0;
    this.loot = 0;
    this.shake = 0;
    this.banner = null;
    this.debug = { god: false };

    // Ende-Verzögerung: state wird erst nach dem Timer auf 'won'/'lost' gesetzt.
    this.endPending = null;
    this.endTimer = 0;

    this.squad = createSquad();
    this.bullets = new Pool(bulletFactory, CFG.POOL.bullets);
    this.enemyBullets = new Pool(enemyBulletFactory, CFG.POOL.enemyBullets);
    this.grenades = new Pool(grenadeFactory, CFG.POOL.grenades);
    this.enemies = new Pool(enemyFactory, CFG.POOL.enemies);
    this.particles = new Pool(createParticle, CFG.POOL.particles);
    this.particleCount = 0;

    this.gates = [];
    this.crates = [];
    this.boss = null;
    this.levelRunner = new LevelRunner();

    this._hud = { count: -1, tier: -1, att: -1, specs: -1 };
  }

  resize(W, H, desktop = false) {
    this.W = W > 0 ? W : CFG.WORLD_W;
    this.H = H > 0 ? H : DEFAULT_H;
    this.SQUAD_Y = this.H - (desktop ? CFG.SQUAD_OFFSET_DESKTOP : CFG.SQUAD_OFFSET);
    this.squad.y = this.SQUAD_Y;
  }

  start(levelNumber) {
    const n = levelNumber;
    const up = (this.save && this.save.upgrades) || {};

    this.level = getLevel(n);
    this.levelNum = n;
    this.hpMul = hpMult(n);
    this.rng = mulberry32(n * 7919 + 17);
    this.rowSeq = 0;
    this.uidSeq = 0;

    this.bullets.clear();
    this.enemyBullets.clear();
    this.grenades.clear();
    this.enemies.clear();
    this.particles.clear();
    this.particleCount = 0;
    this.gates = [];
    this.crates = [];
    this.boss = null;

    this.distance = 0;
    this.time = 0;
    this.kills = 0;
    this.coinsEarned = 0;
    this.loot = 0;
    this.peak = 0;
    this.bossTime = 0;
    this.bossFight = 0;
    this.shake = 0;
    this.phase = 'run';
    this.scroll = this.level.scroll;
    this.objSpeed = this.scroll;
    this.state = 'play';
    this.endPending = null;
    this.endTimer = 0;
    this.banner = { text: this.level.name, t: 2, color: CFG.COLORS.orange };

    const sq = this.squad;
    sq.count = BAL.START_SQUAD + (up.squad || 0);
    sq.shownCount = sq.count;
    sq.weaponTier = Math.min(MAX_TIER, up.weapon || 0);
    sq.attachments = [];
    sq.specs.length = 0;
    sq.specMuzzle.fill(0);
    sq.specTimer.fill(0);
    sq.x = this.W / 2;
    sq.y = this.SQUAD_Y;
    sq.radius = squadRadius(sq.count);
    sq.fireTimer = 0;
    sq.grenadeTimer = 0;
    sq.muzzle = 0;
    sq.hurt = 0;
    sq.walk = 0;
    recomputeStats(this);

    this.levelRunner.reset(this.level);

    this._hud.count = -1;
    this._syncHud();
  }

  update(dt, input) {
    if (this.state !== 'play') return;

    if (this.endPending) {
      this._tickEnding(dt);
      return;
    }

    this.time += dt;
    if (this.squad.count > this.peak) this.peak = this.squad.count;
    if (this.phase === 'boss') this.bossTime += dt;
    updateSquad(this, dt, input);

    if (this.phase === 'run') this.distance += this.scroll * dt;
    this.levelRunner.update(this);

    this.objSpeed = this.phase === 'boss' ? BOSS_PUSH_SPEED : this.scroll;

    updateBullets(this, dt);
    updateGrenades(this, dt);
    updateEnemies(this, dt);
    updateEnemyBullets(this, dt);
    updateGates(this, dt);
    updateCrates(this, dt);
    if (this.boss) updateBoss(this, dt);
    updateParticles(this, dt);

    this._checkEvents();

    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    this.shake = Math.max(0, this.shake - 30 * dt) * 0.92;
    this._syncHud();
  }

  // Phasenwechsel (Level-Ende → Boss) und Sieg-/Niederlage-Erkennung.
  _checkEvents() {
    if (this.phase === 'run' && this.distance >= this.level.length && this.levelRunner.done) {
      this.phase = 'boss';
      this.scroll = 0;
      this.objSpeed = BOSS_PUSH_SPEED;
      spawnBoss(this);
      this.bossMax = Math.round(this.boss.maxHp);
      this.banner = { text: 'BOSS: ' + this.boss.def.name, t: 2.5, color: CFG.COLORS.bad };
      audio.explosion(1.5);
      this.shake = 6;
      return;
    }
    if (this.boss && this.boss.hp <= 0) {
      this._beginWin();
      return;
    }
    if (this.squad.count <= 0) {
      this._beginEnding(false);
    }
  }

  _beginWin() {
    const boss = this.boss;
    const bx = boss.x;
    const by = boss.y;
    burst(this, 'debris', bx, by, 24, { speed: 200 });
    burst(this, 'smoke', bx, by, 14, { speed: 90, life: 0.9, size: 12 });
    emit(this, 'ring', bx, by, { size: 12, life: 0.5 });
    emit(this, 'flash', bx, by, { size: 60, life: 0.2 });
    audio.explosion(2);
    this.shake = 14;
    haptics.heavy();
    this.boss = null;
    this._beginEnding(true);
  }

  _beginEnding(won) {
    this.endPending = won ? 'won' : 'lost';
    this.endTimer = won ? END_DELAY_WON : END_DELAY_LOST;
  }

  // Während der Verzögerung: nur Partikel und Shake laufen, keine Verluste oder Spawns.
  _tickEnding(dt) {
    this.shake = Math.max(0, this.shake - 30 * dt) * 0.92;
    updateParticles(this, dt);
    this.endTimer -= dt;
    if (this.endTimer <= 0) this._finish();
  }

  _finish() {
    const won = this.endPending === 'won';
    this.endPending = null;
    this.state = won ? 'won' : 'lost';
    const survivors = Math.max(0, Math.floor(this.squad.count));
    this.coinsEarned = coinsForResult({
      won, level: this.levelNum, survivors, kills: this.kills, loot: this.loot,
    });
    if (won) audio.win();
    else audio.lose();
    this.onEnd({ won, level: this.levelNum, survivors, coins: this.coinsEarned, kills: this.kills });
  }

  // Einziger Weg, Soldaten zu verlieren. Clamp ≥ 0 (god-Modus: ≥ 1).
  loseSoldiers(n, x, y) {
    if (this.state !== 'play' || this.endPending) return;
    const sq = this.squad;
    const before = sq.count;
    if (before <= 0 || n <= 0) return;
    const floor = this.debug.god ? 1 : 0;
    const after = Math.max(floor, before - n);
    const lost = before - after;
    if (lost <= 0) return;
    sq.count = after;
    // Verluste treffen zuerst normale Soldaten; danach fallen Spezialisten (zuletzt erhaltene zuerst).
    if (sq.specs.length > after) sq.specs.length = after;
    sq.hurt = 1;
    burst(this, 'spark', x, y, 6, { speed: 140, color: CFG.COLORS.bad });
    floatText(this, x, y - 14, '-' + lost, CFG.COLORS.bad);
    haptics.bump();
  }

  // Gegner besiegt: Zähler, Partikel, Release. Münzen gibt es erst am Ende.
  killEnemy(e) {
    if (!e.active) return;
    this.kills++;
    this.loot += e.def.coins * BAL.LOOT_PER_COIN;
    this.coinsEarned = Math.floor(this.loot);
    burst(this, 'debris', e.x, e.y, 3, { speed: 110 });
    if (this.rng() < 0.4) emit(this, 'smoke', e.x, e.y, { life: 0.5 });
    if (this.rng() < 0.03) floatText(this, e.x, e.y - 12, '+◆', CFG.COLORS.orange);
    audio.hit();
    this.enemies.release(e);
  }

  // HUD nur bei Änderung von Anzahl, Waffe oder Attachments benachrichtigen.
  _syncHud() {
    const sq = this.squad;
    const h = this._hud;
    const att = sq.attachments.length;
    if (h.count !== sq.count || h.tier !== sq.weaponTier || h.att !== att || h.specs !== sq.specs.length) {
      h.specs = sq.specs.length;
      h.count = sq.count;
      h.tier = sq.weaponTier;
      h.att = att;
      this.onHudChange();
    }
  }
}
