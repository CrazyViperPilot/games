// Canvas-Setup (DPR ≤ CFG.DPR_MAX), Weltskalierung, Screen-Shake, zeichnet die gesamte Szene.
// Zeichenreihenfolge: Hintergrund, Boss-Telegraphs, Tore, Kisten, Gegner, Sniper-Laser, Boss,
// Truppe, Spieler-Kugeln, Granaten, Gegner-Kugeln, Partikel, HUD (ohne Shake), Banner (im HUD).

import { CFG } from '../config.js';
import { BAL } from '../data/balance.js';
import { getWeapon } from '../data/weapons.js';
import { Background } from './background.js';
import { drawBoss, drawCrate, drawEnemy, drawGate, drawParticle, drawSoldier } from './sprites.js';
import { drawHud } from './hud.js';

const TAU = Math.PI * 2;

// Sniper-Laser: dünne rote Linie von Schütze zum Ziel, Alpha pulsiert.
function drawLaser(ctx, e, t) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 18);
  ctx.globalAlpha = 0.35 + 0.5 * pulse;
  ctx.strokeStyle = '#ff3b30';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(e.aimX, e.aimY);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Boss-Telegraph: roter Kreis, Füllsektor = t/dur.
function drawShell(ctx, s, t) {
  const R = BAL.BOSS_SHELL_RADIUS;
  const f = s.dur > 0 ? Math.min(1, Math.max(0, s.t / s.dur)) : 1;
  const pulse = 0.5 + 0.5 * Math.sin(t * 10);

  ctx.globalAlpha = 0.18 + 0.14 * pulse;
  ctx.fillStyle = '#e04a3a';
  ctx.beginPath();
  ctx.arc(s.x, s.y, R, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.arc(s.x, s.y, R * 0.96, -Math.PI / 2, -Math.PI / 2 + TAU * f);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.5 + 0.5 * pulse;
  ctx.strokeStyle = '#e04a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(s.x, s.y, R, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Spieler-Kugel als Linie (Schweif entgegen der Flugrichtung).
function drawBullet(ctx, b) {
  const sp = Math.hypot(b.vx, b.vy) || 1;
  const dx = (b.vx / sp) * b.len;
  const dy = (b.vy / sp) * b.len;
  ctx.strokeStyle = b.color;
  ctx.lineWidth = b.width;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - dx, b.y - dy);
  ctx.stroke();
}

// Granate: Schatten am Boden, Kugel in Höhe sin(π·t/dur)·40.
function drawGrenade(ctx, g) {
  const f = g.dur > 0 ? Math.min(1, Math.max(0, g.t / g.dur)) : 1;
  const h = Math.sin(Math.PI * f) * 40;

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(g.x, g.y, 4 + h * 0.03, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#6a7a4a';
  ctx.beginPath();
  ctx.arc(g.x, g.y - h, 4.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#b8c48a';
  ctx.beginPath();
  ctx.arc(g.x - 1.2, g.y - h - 1.2, 1.5, 0, TAU);
  ctx.fill();
}

// Gegner-Kugel: rot leuchtend (weicher Halo + heller Kern).
function drawEnemyBullet(ctx, b) {
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ff3b2a';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 4.2, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ff7a5a';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 1.9, 0, TAU);
  ctx.fill();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bg = new Background();
    this.W = CFG.WORLD_W;
    this.H = 0;
    this._pxPerUnit = 1;

    // Vorab gebundene Callbacks für Pool.forEach (keine Closures pro Frame)
    this._t = 0;
    this._cbEnemy = (e) => drawEnemy(this.ctx, e);
    this._cbLaser = (e) => {
      if (e.state === 'aim' && e.def && e.def.id === 'sniper') drawLaser(this.ctx, e, this._t);
    };
    this._cbBullet = (b) => drawBullet(this.ctx, b);
    this._cbGrenade = (g) => drawGrenade(this.ctx, g);
    this._cbEnemyBullet = (b) => drawEnemyBullet(this.ctx, b);
    this._cbParticle = (p) => drawParticle(this.ctx, p);

    this.resize();
  }

  // Canvas auf Fenstergröße und DPR setzen. Welt: W = WORLD_W, H aus Seitenverhältnis.
  resize() {
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, CFG.DPR_MAX);
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;

    this.W = CFG.WORLD_W;
    this.H = Math.round((this.W * cssH) / cssW);
    this._pxPerUnit = this.canvas.width / this.W;
    return { W: this.W, H: this.H };
  }

  // CSS-Pixel pro Welteinheit (für Input).
  get scale() {
    return window.innerWidth / this.W;
  }

  // game = null oder state 'idle': nur animierter Hintergrund.
  render(game, fps, showFps) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const ppu = this._pxPerUnit;
    const now = performance.now() / 1000;

    // Vollflächig leeren (Shake darf keine Ränder zeigen)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = CFG.COLORS.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!game || game.state === 'idle') {
      ctx.setTransform(ppu, 0, 0, ppu, 0, 0);
      this.bg.draw(ctx, W, H, now * 40);
      return;
    }

    // Screen-Shake
    const sh = game.shake > 0 ? game.shake : 0;
    const sx = sh > 0 ? (Math.random() * 2 - 1) * sh : 0;
    const sy = sh > 0 ? (Math.random() * 2 - 1) * sh : 0;
    this._t = now;

    ctx.setTransform(ppu, 0, 0, ppu, sx * ppu, sy * ppu);

    // 1. Hintergrund
    this.bg.draw(ctx, W, H, game.distance || 0);

    // 2. Boss-Telegraphs
    const boss = game.boss;
    if (boss && boss.shells) {
      for (let i = 0; i < boss.shells.length; i++) {
        const s = boss.shells[i];
        if (s.active) drawShell(ctx, s, now);
      }
    }

    // 3. Tore
    const gates = game.gates;
    const nextWeapon = getWeapon((game.squad.weaponTier || 0) + 1).name;
    const squadCount = game.squad.count;
    for (let i = 0; i < gates.length; i++) {
      drawGate(ctx, gates[i], squadCount, nextWeapon);
    }

    // 4. Kisten
    const crates = game.crates;
    for (let i = 0; i < crates.length; i++) {
      if (!crates[i].opened) drawCrate(ctx, crates[i]);
    }

    // 5. Gegner, danach Sniper-Laser
    game.enemies.forEach(this._cbEnemy);
    game.enemies.forEach(this._cbLaser);

    // 6. Boss
    if (boss) drawBoss(ctx, boss);

    // 7. Truppe
    const sq = game.squad;
    const slots = sq.slots;
    const drawN = Math.min(slots.length, Math.round(sq.count));
    const shooters = CFG.MAX_SHOOTERS;
    const muzzle = sq.muzzle || 0;
    const hurt = sq.hurt || 0;
    for (let i = 0; i < drawN; i++) {
      const s = slots[i];
      drawSoldier(ctx, sq.x + s.ox, sq.y + s.oy, (sq.walk || 0) + i * 1.7, i < shooters ? muzzle : 0, hurt);
    }

    // 8. Spieler-Kugeln (additiv)
    ctx.globalCompositeOperation = 'lighter';
    game.bullets.forEach(this._cbBullet);
    ctx.globalCompositeOperation = 'source-over';

    // 9. Granaten, Gegner-Kugeln, Partikel
    game.grenades.forEach(this._cbGrenade);
    ctx.globalCompositeOperation = 'lighter';
    game.enemyBullets.forEach(this._cbEnemyBullet);
    ctx.globalCompositeOperation = 'source-over';
    game.particles.forEach(this._cbParticle);
    ctx.globalAlpha = 1;

    // 10. HUD und Banner ohne Shake
    ctx.setTransform(ppu, 0, 0, ppu, 0, 0);
    drawHud(ctx, game, W, H, fps, showFps);
  }
}
