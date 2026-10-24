// Ablauf eines Levels (PLAN §2, §6, §13; PRD §2–§7). Kein DOM. update(dt, input) = ein fester Schritt.
// Lesbar für Renderer/HUD: map, light, player, mobs[], boss, projectiles[], pickups[], falling[], particles[], tnt[],
// dig, crystals[], camX, camY, shake, time, emeralds, lives, diamonds[3], pick, score, state: 'play'|'dying'|'won'|'over'.
// Geänderte Kacheln: game.dirty[0..dirtyCount) enthält r*cols+c; nach dem Zeichnen clearDirty() aufrufen.
// game.light wird nach einem Schritt mit lightDirty neu berechnet (danach lightDirty = false); der Renderer liest game.light je Bild.
// Kristalle: { x, y, w, h, alive } mit linker oberer Ecke in px (wie alle anderen Rechtecke).
import { PHYS } from '../data/physics.js';
import { TILE_BY_ID, TILE_IDS } from '../data/tiles.js';
import { parseLevel } from './level.js';
import { createPlayer, setPower, updatePlayer } from './player.js';
import { updateDig, headBreak } from './dig.js';
import { computeLight } from './light.js';
import * as Explode from './explode.js';
import * as Projectiles from './projectiles.js';
import * as Items from './items.js';
import * as Mobs from './mobs.js';
import { createBoss } from './bosses.js';

const T = PHYS.tile;
const E = 1e-6;
const AIR_ID = TILE_IDS.air;
const BARRIER_ID = TILE_IDS.barrier;

const POWERS = ['plain', 'armor', 'bow'];   // aufsteigend
const DEATH_TIME = 1.5;         // s Sterben vor Neustart bzw. Game Over
const DEATH_HOP = -200;         // px/s Startsprung beim Tod
const RESPAWN_INVULN = 1;       // s Unverwundbarkeit nach dem Neustart
const EMERALDS_PER_LIFE = 100;
const MAX_MOBS = 48;
const DIAMOND_COUNT = 3;
const DIAMOND_REACH = 24;       // px: Erz-Diamant zur Gem-Mitte
const GEM_REACH = 10;           // px: Spieler zur Gem-Mitte
const BED_REACH = 20;           // px
const GEM_HALF = 8;             // px: Mitte eines Gegenstands über seiner Unterkante (Zelle 16)
const HEAD_Y = 4;               // px unter der Oberkante: Kopfpunkt für Lava
const FALL_MARGIN = 32;         // px unter rows*T, ab dem der Sturz tödlich ist
const CRYSTAL_RADIUS = 1.0;     // Kacheln
const CRYSTAL_W = 12, CRYSTAL_H = 18;
const GOAL_W = 32, GOAL_H = 48;
const CAM_X_LO = 0.40, CAM_X_HI = 0.55;   // Totzone horizontal (Anteil der Sichtbreite)
const CAM_Y_LO = 0.40, CAM_Y_HI = 0.60;   // Totzone vertikal (Anteil der Sichthöhe)
const PROJECTILE_POOL = 16;
const PICKUP_POOL = 40;
const PARTICLE_POOL = 96;
const FALLING_POOL = 8;
const TNT_POOL = 8;

// Pools (Größen wie in PLAN §10). Objektformen = die der Module, die sie benutzen.
function makePool(n, make) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(make());
  return out;
}
const newProjectile = () => ({ active: false, type: 'arrow', x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, life: 0, stuck: false, owner: null });
const newPickup = () => ({ active: false, kind: '', x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, life: 0, onGround: false });
const newParticle = () => ({ active: false, kind: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, tile: 0, frame: 0 });
const newFalling = () => ({ active: false, tile: 0, c: 0, x: 0, y: 0, vy: 0 });
const newTnt = () => ({ active: false, x: 0, y: 0, timer: 0, fuse: 0 });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Quadrat des Abstands von Punkt (x, y) zum Rechteck p (linke obere Ecke, w, h).
function dist2ToRect(x, y, p) {
  const dx = x < p.x ? p.x - x : x > p.x + p.w ? x - p.x - p.w : 0;
  const dy = y < p.y ? p.y - y : y > p.y + p.h ? y - p.y - p.h : 0;
  return dx * dx + dy * dy;
}

export class Game {
  constructor({ level, save, onEvent, viewW = 384, viewH = 240 } = {}) {
    const s = save || {};
    const map = parseLevel(level);
    this.map = map;
    this.onEvent = onEvent || null;
    this.viewW = viewW;
    this.viewH = viewH;
    this.state = 'play';
    this.time = 0;
    this.score = 0;
    this.lives = s.lives ?? PHYS.lives;
    this.hearts = PHYS.maxHearts;
    this.emeralds = s.emeralds ?? 0;
    this.pick = Math.max(s.pick ?? 0, map.pick);
    this.diamonds = [false, false, false];
    this.jumpHeld = false;
    this.checkpointReached = false;
    this.bossDefeated = false;
    this.respawnAt = { x: map.start.x, y: map.start.y };
    this.dyingT = 0;
    this.shake = 0;
    this.camX = 0;
    this.camY = 0;

    const power = POWERS.includes(s.power) ? s.power : 'plain';
    this.player = createPlayer(map.start.x, map.start.y, power);

    // Gegner aus den Spawns; Spawn '@' (type 'boss') erzeugt den Boss des Levels (map.boss, z. B. 'slimeking').
    this.mobs = [];
    this.boss = null;
    for (let i = 0; i < map.spawns.length; i++) {
      const sp = map.spawns[i];
      if (sp.type === 'boss') this.boss = createBoss(map.boss, sp.x, sp.y);
      else this.mobs.push(Mobs.createMob(sp.type, sp.x, sp.y));
    }

    this.crystals = map.crystals.map((cr) => ({
      x: cr.x - CRYSTAL_W / 2, y: cr.y - CRYSTAL_H, w: CRYSTAL_W, h: CRYSTAL_H, alive: true,
    }));

    // Diamant-Gems bekommen einen festen Platz (slot 0..2) in diamonds[] in Reihenfolge der Karte.
    let slot = 0;
    for (let i = 0; i < map.gems.length; i++) {
      if (map.gems[i].diamond) map.gems[i].slot = slot++;
    }

    this.projectiles = makePool(PROJECTILE_POOL, newProjectile);
    this.pickups = makePool(PICKUP_POOL, newPickup);
    // Essen im Level (Zeichen a = Brot, q = Steak) liegt als Gegenstand ohne Verfallszeit.
    for (let i = 0; i < map.foods.length; i++) {
      const f = map.foods[i];
      const it = Items.spawnPickup(this, f.kind, f.x, f.y);
      if (it) { it.vx = 0; it.vy = 0; }
    }
    this.particles = makePool(PARTICLE_POOL, newParticle);
    this.falling = makePool(FALLING_POOL, newFalling);
    this.tnt = makePool(TNT_POOL, newTnt);
    this.dig = { active: false, c: 0, r: 0, progress: 0, stage: 0, failCd: 0, soundCd: 0 };

    this.dirty = new Int32Array(256);
    this.dirtyCount = 0;
    this.dirtyAll = false;

    this.light = computeLight(map);
    this.lightDirty = false;
    this.snapCamera();
  }

  // ---------- Ereignisse, Kacheln, Anzeige ----------

  emit(name, data) {
    if (this.onEvent) this.onEvent(name, data);
  }

  setView(w, h) {
    this.viewW = w;
    this.viewH = h;
    this.snapCamera();
  }

  markDirty(c, r) {
    if (this.dirtyCount < this.dirty.length) this.dirty[this.dirtyCount++] = r * this.map.cols + c;
    else this.dirtyAll = true;
  }

  clearDirty() {
    this.dirtyCount = 0;
    this.dirtyAll = false;
  }

  // ---------- Kamera (PLAN §2) ----------

  // Sofort auf den Spieler zentrieren (Start, Neustart, Größenänderung).
  snapCamera() {
    const p = this.player;
    this._setCamera(p.x + p.w / 2 - this.viewW / 2, p.y + p.h / 2 - this.viewH / 2);
  }

  // Ganzzahlig und begrenzt. Ist das Level kleiner als die Sicht: links bzw. unten bündig.
  _setCamera(x, y) {
    const maxX = this.map.cols * T - this.viewW;
    const maxY = this.map.rows * T - this.viewH;
    this.camX = maxX <= 0 ? 0 : Math.round(clamp(x, 0, maxX));
    this.camY = maxY <= 0 ? maxY : Math.round(clamp(y, 0, maxY));
  }

  // Totzone: horizontal 40–55 %, vertikal 40–60 % der Sicht. Außerhalb wird die Kamera nachgezogen.
  _updateCamera() {
    const p = this.player;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const vw = this.viewW, vh = this.viewH;
    let x = this.camX, y = this.camY;
    const sx = cx - x;
    if (sx < CAM_X_LO * vw) x = cx - CAM_X_LO * vw;
    else if (sx > CAM_X_HI * vw) x = cx - CAM_X_HI * vw;
    const sy = cy - y;
    if (sy < CAM_Y_LO * vh) y = cy - CAM_Y_LO * vh;
    else if (sy > CAM_Y_HI * vh) y = cy - CAM_Y_HI * vh;
    this._setCamera(x, y);
  }

  // ---------- Schritt ----------

  update(dt, input) {
    this.jumpHeld = !!input.jump;
    if (this.state === 'dying') this._updateDying(dt);
    else if (this.state === 'play') this._stepPlay(dt, input);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    this._updateCamera();
    if (this.lightDirty) {
      this.light = computeLight(this.map, this.light);
      this.lightDirty = false;
    }
  }

  _stepPlay(dt, input) {
    const p = this.player;
    this.time += dt;

    const prevFeet = p.y + p.h;
    const wasGround = p.onGround;
    const res = updatePlayer(this, dt, input);
    if (res.hitHead) headBreak(this, res.hitHead.c, res.hitHead.r);
    if (wasGround && !p.onGround && p.vy < 0) this.emit('jump');

    updateDig(this, dt, input);
    if (input.firePressed && p.power === 'bow') Projectiles.spawnPlayerArrow(this);

    Mobs.updateMobs(this, dt, prevFeet);
    Mobs.updateSpawners(this, dt);
    if (this.state !== 'play') return;

    this.boss?.update?.(this, dt, prevFeet);
    if (this.state !== 'play') return;

    Projectiles.updateProjectiles(this, dt);
    Explode.updateTnt(this, dt);
    Items.updatePickups(this, dt);
    Items.updateFalling(this, dt);
    Items.updateParticles(this, dt);
    if (this.state !== 'play') return;

    this._collectGems();
    this._checkHazards();
    if (this.state !== 'play') return;
    this._checkCheckpoint();
    this._checkGoal();
  }

  // Sterben: Fallen ohne Kollision, nach DEATH_TIME Leben abziehen und neu starten oder Game Over.
  _updateDying(dt) {
    const p = this.player;
    this.dyingT -= dt;
    p.vy = Math.min(p.vy + PHYS.gravity * dt, PHYS.maxFall);
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
    this.player = createPlayer(at.x, at.y, 'plain');
    this.player.invuln = RESPAWN_INVULN;
    this.hearts = PHYS.maxHearts;
    this.dig.active = false;
    this.dig.progress = 0;
    this.dig.stage = 0;
    this.snapCamera();
    this.state = 'play';
    this.emit('hudChange');
  }

  // Smaragde und Diamanten einsammeln (Gegenstände sind Punkte, Abstand zum Spieler-Rechteck).
  _collectGems() {
    const p = this.player;
    const gems = this.map.gems;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      if (g.taken || dist2ToRect(g.x, g.y - GEM_HALF, p) > GEM_REACH * GEM_REACH) continue;
      g.taken = true;
      if (g.diamond) {
        this.collectDiamond(g.slot);
      } else {
        this.addEmeralds(1);
        this.emit('emerald');
      }
    }
  }

  // Lava an Fuß- oder Kopfpunkt und Sturz unter die Karte kosten ein Leben.
  _checkHazards() {
    const p = this.player;
    const map = this.map;
    if (p.y > map.rows * T + FALL_MARGIN) { this.loseLife('fall'); return; }
    const c = Math.floor((p.x + p.w / 2) / T);
    const feet = Math.floor((p.y + p.h - E) / T);
    const head = Math.floor((p.y + HEAD_Y) / T);
    if (TILE_BY_ID[map.get(c, feet)].hazard || TILE_BY_ID[map.get(c, head)].hazard) this.loseLife('lava');
  }

  // Bett: berührt → Checkpoint (einmal).
  _checkCheckpoint() {
    const cp = this.map.checkpoint;
    if (!cp || this.checkpointReached) return;
    if (dist2ToRect(cp.x, cp.y - GEM_HALF, this.player) >= BED_REACH * BED_REACH) return;
    this.checkpointReached = true;
    this.respawnAt = { x: cp.x, y: cp.y };
    this.emit('checkpoint');
  }

  // Portal: 32×48 über der Zielzelle. Boss-Level erst nach dem Sieg.
  _checkGoal() {
    const map = this.map;
    if (map.boss && !this.bossDefeated) return;
    const p = this.player;
    const gx = map.goal.x - GOAL_W / 2;
    const gy = map.goal.y - GOAL_H;
    if (!(p.x < gx + GOAL_W && p.x + p.w > gx && p.y < gy + GOAL_H && p.y + p.h > gy)) return;
    this.state = 'won';
    this.emit('levelDone', {
      time: this.time,
      emeralds: this.emeralds,
      diamonds: this.diamonds.filter(Boolean).length,
      score: this.score,
      pick: this.pick,
    });
    this.emit('portal');
  }

  // ---------- Leben und Schaden ----------

  // Treffer durch Gegner, Geschoss, Explosion: kostet Herzen (PHYS.heartDamage, mit Rüstung weniger); bei 0 Herzen Leben verloren.
  hurtPlayer(cause) {
    const p = this.player;
    if (this.state !== 'play' || p.dead) return;
    if (p.invuln > 0 || p.star > 0) return;
    let dmg = PHYS.heartDamage[cause] ?? 1;
    if (p.power !== 'plain') dmg = Math.max(1, dmg - 1);
    this.hearts = Math.max(0, this.hearts - dmg);
    if (this.hearts <= 0) { this.loseLife(cause); return; }
    p.invuln = PHYS.hurtInvuln;
    this.emit('hurt');
    this.emit('hudChange');
  }

  // Skelett-Pfeil: lähmt kurz (keine Schadens- oder Lebensfolge), danach Schonzeit.
  stunPlayer() {
    const p = this.player;
    if (this.state !== 'play' || p.dead) return;
    if (p.invuln > 0 || p.star > 0) return;
    p.stun = PHYS.stunTime;
    p.invuln = PHYS.stunInvuln;
    p.vx = 0;
    this.emit('hurt');
  }

  // Sterben beginnt. Das Leben wird erst nach DEATH_TIME abgezogen (_updateDying).
  loseLife(cause) {
    if (this.state !== 'play') return;
    const p = this.player;
    this.state = 'dying';
    this.dyingT = DEATH_TIME;
    p.dead = true;
    p.anim = 'dead';
    p.animTime = 0;
    p.vx = 0;
    p.vy = DEATH_HOP;
    this.emit('die', { cause });
    this.emit('lifeLost', { cause, lives: this.lives });
  }

  // Herzen auffüllen. Gibt false zurück, wenn schon alle voll sind.
  heal(n) {
    if (this.hearts >= PHYS.maxHearts) return false;
    this.hearts = Math.min(PHYS.maxHearts, this.hearts + n);
    this.emit('hudChange');
    return true;
  }

  gainLife() {
    this.lives++;
    this.hearts = PHYS.maxHearts;
    this.emit('oneup');
    this.emit('hudChange');
  }

  // Je 100 Smaragde ein Leben; der Zähler zeigt den Rest.
  addEmeralds(n) {
    if (!n) return;
    this.emeralds += n;
    while (this.emeralds >= EMERALDS_PER_LIFE) {
      this.emeralds -= EMERALDS_PER_LIFE;
      this.gainLife();
    }
    this.emit('hudChange');
  }

  addScore(n) {
    if (!n) return;
    this.score += n;
    this.emit('hudChange');
  }

  // Nur aufwerten: plain < armor < bow.
  givePower(name) {
    const want = POWERS.indexOf(name);
    if (want < 0) return;
    const p = this.player;
    if (want > POWERS.indexOf(p.power)) setPower(p, name);
  }

  // Spitzhacke bleibt gespeichert: nur aufwerten.
  givePick(level) {
    if (level > this.pick) this.pick = level;
  }

  // ---------- Diamanten ----------

  // Diamant Nummer i (0..2) sammeln. Gibt false zurück, wenn er schon gesammelt ist.
  collectDiamond(i) {
    if (!(i >= 0 && i < DIAMOND_COUNT) || this.diamonds[i]) return false;
    this.diamonds[i] = true;
    this.emit('diamond', { index: i });
    this.emit('hudChange');
    return true;
  }

  // Erz-Diamant bei (x, y) in px: nächstes offenes Diamant-Gem in Reichweite, sonst der erste freie Platz.
  collectDiamondAt(x, y) {
    const gems = this.map.gems;
    let best = null;
    let bestD = DIAMOND_REACH * DIAMOND_REACH;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      if (!g.diamond || g.taken) continue;
      const dx = g.x - x;
      const dy = g.y - GEM_HALF - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = g; }
    }
    if (best) {
      best.taken = true;
      return this.collectDiamond(best.slot);
    }
    // Erst Plätze ohne offenes Gem, sonst irgendeinen freien.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < DIAMOND_COUNT; i++) {
        if (this.diamonds[i]) continue;
        if (pass === 0 && this._slotPending(i)) continue;
        return this.collectDiamond(i);
      }
    }
    return false;
  }

  _slotPending(i) {
    const gems = this.map.gems;
    for (let k = 0; k < gems.length; k++) {
      if (gems[k].diamond && !gems[k].taken && gems[k].slot === i) return true;
    }
    return false;
  }

  // ---------- Boss (Platzhalter bis A11–A13) ----------

  // Bosskampf beginnt: Arena-Türen (`:`) werden zu Barrieren.
  lockArena() {
    for (const d of this.map.doors) {
      this.map.set(d.c, d.r, BARRIER_ID);
      this.markDirty(d.c, d.r);
    }
    this.lightDirty = true;
  }

  // Sieg: Arena-Barrieren verschwinden, das Portal wird aktiv.
  defeatBoss() {
    this.bossDefeated = true;
    const map = this.map;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (map.get(c, r) === BARRIER_ID) {
          map.set(c, r, AIR_ID);
          this.markDirty(c, r);
        }
      }
    }
    this.lightDirty = true;
  }

  damageBoss(how) {
    this.boss?.damage?.(this, how);
  }

  // ---------- Forwarder auf Module (PLAN §13) ----------

  spawnMob(type, footX, footY) {
    if (this.mobs.length >= MAX_MOBS) return null;
    const m = Mobs.createMob(type, footX, footY);
    m.active = true;
    this.mobs.push(m);
    return m;
  }

  killMob(m, how) {
    Mobs.killMob(this, m, how);
  }

  hitMob(m, how) {
    Mobs.hitMob(this, m, how);
  }

  openChest(c, r) {
    return Items.openChest(this, c, r);
  }

  startFalling(c, r) {
    return Items.startFalling(this, c, r);
  }

  spawnDebris(c, r, tileId) {
    Items.spawnDebris(this, c, r, tileId);
  }

  spawnSmoke(x, y) {
    Items.spawnSmoke(this, x, y);
  }

  igniteTnt(c, r, fuse = 2.0) {
    Explode.igniteTnt(this, c, r, fuse);
  }

  // Kristall: zerstört, kleine Explosion in seiner Mitte.
  hitCrystal(cr) {
    if (cr.alive === false) return;
    cr.alive = false;
    Explode.explode(this, cr.x + cr.w / 2, cr.y + cr.h / 2, CRYSTAL_RADIUS);
  }
}
