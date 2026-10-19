// Canvas-Setup (DPR ≤ CFG.DPR_MAX), Weltskalierung, Screen-Shake, zeichnet die gesamte Szene.
// Zeichenreihenfolge: Hintergrund, Boss-Ziele, Tore, Kisten, Gegner, Sniper-Laser, Boss,
// Truppe, Spieler-Kugeln, Granaten, Boss-Geschosse, Gegner-Kugeln, Partikel, HUD (ohne Shake).

import { CFG } from '../config.js';
import { BAL } from '../data/balance.js';
import { SPECIALISTS } from '../data/specialists.js';
import { getWeapon } from '../data/weapons.js';
import { Background } from './background.js';
import {
  drawBoss,
  drawCrate,
  drawEnemy,
  drawGate,
  drawParticle,
  drawSoldier,
  setSpriteResolution,
} from './sprites.js';
import { drawHud } from './hud.js';

const TAU = Math.PI * 2;
const C4_FUSE_REF = (SPECIALISTS.demo && SPECIALISTS.demo.fuse) || 0.5;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

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

// Boss-Ziel am Boden: roter Kreis, Füllsektor = t/dur.
function drawShellTarget(ctx, s, t) {
  const R = BAL.BOSS_SHELL_RADIUS;
  const f = s.dur > 0 ? clamp01(s.t / s.dur) : 1;
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

// Boss-Geschoss auf der Linie von Rohr (sx, sy) zum Ziel (x, y), Anteil t/dur.
function drawShellFlight(ctx, s) {
  if (typeof s.sx !== 'number' || typeof s.sy !== 'number') return;
  const f = s.dur > 0 ? clamp01(s.t / s.dur) : 1;
  const f0 = Math.max(0, f - 0.12);
  const dx = s.x - s.sx;
  const dy = s.y - s.sy;
  const px = s.sx + dx * f;
  const py = s.sy + dy * f;
  const tx = s.sx + dx * f0;
  const ty = s.sy + dy * f0;

  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#ffb07a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(px, py);
  ctx.stroke();

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.arc(px, py, 4.2, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff6d0';
  ctx.beginPath();
  ctx.arc(px, py, 2, 0, TAU);
  ctx.fill();
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

// Wurf-Granate ('gl'): Schatten am Boden, Kugel in Höhe sin(π·t/dur)·40.
function drawGlGrenade(ctx, g) {
  const f = g.dur > 0 ? clamp01(g.t / g.dur) : 1;
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

// C4: im Bogen als kleiner Block; liegend graues Paket mit Klebeband und blinkender LED.
// Blinkrate steigt, je kleiner fuse (Restzeit) ist.
function drawC4(ctx, g, now) {
  if (!g.landed) {
    const f = g.dur > 0 ? clamp01(g.t / g.dur) : 1;
    const h = Math.sin(Math.PI * f) * 30;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000000';
    ctx.fillRect(g.x - 3, g.y - 2, 6, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#4a4e46';
    ctx.fillRect(g.x - 4, g.y - h - 3, 8, 6);
    ctx.fillStyle = '#c9b26a';
    ctx.fillRect(g.x - 4, g.y - h - 0.9, 8, 1.8);
    return;
  }

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000000';
  ctx.fillRect(g.x - 5, g.y - 3, 11, 8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#6f736a';
  ctx.fillRect(g.x - 6, g.y - 4, 12, 8);
  ctx.strokeStyle = '#2a2d26';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(g.x - 5.6, g.y - 3.6, 11.2, 7.2);
  ctx.fillStyle = '#cdb46a';
  ctx.fillRect(g.x - 6, g.y - 1, 12, 2);

  const fuse = typeof g.fuse === 'number' ? Math.max(0, g.fuse) : C4_FUSE_REF;
  const rate = 2 + 14 * (1 - clamp01(fuse / C4_FUSE_REF));
  const on = Math.sin(now * rate * TAU) > -0.3;
  const lx = g.x + 3.5;
  const ly = g.y - 2.5;
  if (on) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(lx, ly, 2.8, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = on ? 1 : 0.25;
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(lx, ly, 1.3, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Rakete: Körper oliv, Spitze dunkel, Flamme hinten flackernd. Richtung = Geschwindigkeit.
function drawRocket(ctx, g, now) {
  const vx = g.vx || 0;
  const vy = g.vy || 0;
  const ang = vx || vy ? Math.atan2(vy, vx) : Math.PI / 2;
  const flick = 0.75 + 0.25 * Math.sin(now * 50 + g.y * 0.13);

  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(ang);

  // Flamme hinten
  const fl = 7 * flick;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ff9a2a';
  ctx.beginPath();
  ctx.moveTo(-5, -1.6);
  ctx.lineTo(-5 - fl, 0);
  ctx.lineTo(-5, 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe27a';
  ctx.beginPath();
  ctx.moveTo(-5, -0.7);
  ctx.lineTo(-5 - fl * 0.5, 0);
  ctx.lineTo(-5, 0.7);
  ctx.closePath();
  ctx.fill();

  // Körper und Leitwerk
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#5f6b3e';
  ctx.fillRect(-5, -1.7, 9.5, 3.4);
  ctx.fillStyle = '#3a4226';
  ctx.fillRect(-5.5, -3, 2.4, 6);
  // Spitze
  ctx.fillStyle = '#1c2015';
  ctx.beginPath();
  ctx.moveTo(4.5, -1.7);
  ctx.lineTo(8, 0);
  ctx.lineTo(4.5, 1.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
    this._cbGrenade = (g) => {
      const kind = g.kind || 'gl';
      if (kind === 'c4') drawC4(this.ctx, g, this._t);
      else if (kind === 'rocket') drawRocket(this.ctx, g, this._t);
      else drawGlGrenade(this.ctx, g);
    };
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
    // Vorgerenderte Gegner-Sprites an die neue Auflösung anpassen (Cache wird neu aufgebaut)
    setSpriteResolution(this._pxPerUnit);
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

    // 2. Boss-Ziele (Kreise am Boden)
    const boss = game.boss;
    if (boss && boss.shells) {
      for (let i = 0; i < boss.shells.length; i++) {
        const s = boss.shells[i];
        if (s.active) drawShellTarget(ctx, s, now);
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

    // 7. Truppe (Spezialisten belegen die ersten Slots, Index i ↔ specs[i])
    const sq = game.squad;
    const slots = sq.slots;
    const drawN = Math.min(slots.length, Math.round(sq.count));
    const shooters = CFG.MAX_SHOOTERS;
    const muzzle = sq.muzzle || 0;
    const hurt = sq.hurt || 0;
    const walk = sq.walk || 0;
    const specs = sq.specs || null;
    const specMuzzle = sq.specMuzzle || null;
    for (let i = 0; i < drawN; i++) {
      const s = slots[i];
      const sid = specs && i < specs.length ? specs[i] : null;
      let m;
      if (sid) m = specMuzzle && i < specMuzzle.length ? specMuzzle[i] : 0;
      else m = i < shooters ? muzzle : 0;
      drawSoldier(ctx, sq.x + s.ox, sq.y + s.oy, walk + i * 1.7, m, hurt, sid || undefined);
    }

    // 8. Spieler-Kugeln (additiv)
    ctx.globalCompositeOperation = 'lighter';
    game.bullets.forEach(this._cbBullet);
    ctx.globalCompositeOperation = 'source-over';

    // 9. Boss-Geschosse (in der Luft), Granaten, Gegner-Kugeln, Partikel
    if (boss && boss.shells) {
      for (let i = 0; i < boss.shells.length; i++) {
        const s = boss.shells[i];
        if (s.active) drawShellFlight(ctx, s);
      }
    }
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
