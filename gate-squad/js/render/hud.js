// HUD im Canvas (Welteinheiten, ohne Screen-Shake). Oberes Band, Levelfortschritt,
// Boss-HP, Banner und FPS. Der DOM-Pause-Button liegt oben rechts; dort bleibt Platz frei.

import { CFG } from '../config.js';
import { drawAttachmentIcon, drawSoldier } from './sprites.js';

const C = CFG.COLORS;
const PAUSE_RESERVE = 58; // Einheiten rechts oben für #pauseBtn

const F_COUNT = '800 34px system-ui, sans-serif';
const F_WEAPON = '800 16px system-ui, sans-serif';
const F_COINS = '800 15px system-ui, sans-serif';
const F_SMALL = '800 10px system-ui, sans-serif';
const F_BOSS = '800 11px system-ui, sans-serif';
const F_BANNER = '800 36px system-ui, sans-serif';

const ATT_SLOTS = 5;
const ATT_SIZE = 16;
const ATT_GAP = 4;

// Banner-Zustand (nur Anzeige): Einblendzeit wird aus der Restzeit abgeleitet.
let _bannerRef = null;
let _bannerT0 = 0;
let _bannerLast = 0;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// game: Spielzustand (Felder siehe PLAN.md §10). W, H: Welt-Größe. fps: Messwert.
export function drawHud(ctx, game, W, H, fps, showFps) {
  const HH = CFG.HUD_H;
  const sq = game.squad;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.textBaseline = 'middle';

  // ---- Oberes Band
  ctx.fillStyle = 'rgba(12,14,10,0.8)';
  ctx.fillRect(0, 0, W, HH);
  ctx.fillStyle = C.orange;
  ctx.fillRect(0, HH - 2, W, 2);

  // Truppenzahl mit Soldaten-Symbol (links)
  ctx.save();
  ctx.translate(15, HH / 2);
  ctx.scale(1.3, 1.3);
  drawSoldier(ctx, 0, 0, (game.time || 0) * 9, 0, 0);
  ctx.restore();

  const shown = sq.shownCount != null ? sq.shownCount : sq.count;
  ctx.font = F_COUNT;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.text;
  ctx.fillText(String(Math.round(shown)), 36, HH / 2);

  // Waffenname (Mitte) + Attachment-Icons darunter
  ctx.font = F_WEAPON;
  ctx.textAlign = 'center';
  ctx.fillStyle = C.orange;
  ctx.fillText(sq.weapon ? sq.weapon.name.toUpperCase() : '', W / 2, 19);

  const atts = sq.attachments || [];
  const rowW = ATT_SLOTS * ATT_SIZE + (ATT_SLOTS - 1) * ATT_GAP;
  const rowX = W / 2 - rowW / 2;
  const rowY = 36;
  for (let i = 0; i < ATT_SLOTS; i++) {
    const x0 = rowX + i * (ATT_SIZE + ATT_GAP);
    if (i < atts.length) {
      drawAttachmentIcon(ctx, atts[i], x0, rowY, ATT_SIZE);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(x0, rowY, ATT_SIZE, ATT_SIZE);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, rowY + 0.5, ATT_SIZE - 1, ATT_SIZE - 1);
    }
  }

  // Münzen dieses Laufs (rechts, Platz für den Pause-Button)
  ctx.font = F_COINS;
  ctx.textAlign = 'right';
  ctx.fillStyle = C.orange;
  ctx.fillText('◆ ' + (game.coinsEarned || 0), W - PAUSE_RESERVE, HH / 2);

  // ---- Levelfortschritt unter dem Band
  const len = game.level && game.level.length > 0 ? game.level.length : 1;
  const p = clamp01((game.distance || 0) / len);
  const bx = 8;
  const bw = W - 16;
  const by = HH + 6;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bx, by, bw, 3);
  ctx.fillStyle = C.orange;
  ctx.fillRect(bx, by, bw * p, 3);

  // Boss-Symbol am Ende der Strecke
  const inBoss = game.phase === 'boss';
  ctx.fillStyle = '#2a2f2b';
  ctx.fillRect(bx + bw - 13, by - 3, 13, 9);
  ctx.strokeStyle = inBoss ? C.bad : C.muted;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + bw - 12.5, by - 2.5, 12, 8);
  ctx.font = F_SMALL;
  ctx.textAlign = 'center';
  ctx.fillStyle = inBoss ? C.bad : C.muted;
  ctx.fillText('B', bx + bw - 6.5, by + 2);

  ctx.font = F_SMALL;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.muted;
  ctx.fillText('LEVEL ' + (game.levelNum || 1), bx, HH + 18);

  // ---- Boss-HP (nur Boss-Phase)
  const boss = game.boss;
  if (inBoss && boss && boss.maxHp > 0) {
    const ratio = clamp01(boss.hp / boss.maxHp);
    const y0 = HH + 26;
    const h = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, y0, bw, h);
    ctx.fillStyle = '#c8382a';
    ctx.fillRect(bx, y0, bw * ratio, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, y0 + 0.5, bw - 1, h - 1);
    ctx.font = F_BOSS;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.text;
    ctx.fillText(boss.def.name.toUpperCase(), bx + 6, y0 + h / 2);
  }

  // ---- Banner (kantig, kursiv, dunkle Kontur)
  const bn = game.banner;
  if (bn) {
    if (bn !== _bannerRef || bn.t > _bannerLast + 1e-6) {
      _bannerRef = bn;
      _bannerT0 = bn.t;
    }
    _bannerLast = bn.t;
    const age = Math.max(0, _bannerT0 - bn.t);
    const inK = clamp01(age / 0.25);
    const outK = clamp01(bn.t / 0.3);
    const a = Math.min(inK, outK);
    if (a > 0) {
      const e = 1 - (1 - inK) * (1 - inK);
      const s = 1.35 - 0.35 * e;
      ctx.save();
      ctx.translate(W / 2, H * 0.38);
      ctx.transform(s, 0, -0.2 * s, s, 0, 0); // Kursiv
      ctx.globalAlpha = a;
      ctx.font = F_BANNER;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 8;
      ctx.strokeStyle = C.bg;
      ctx.strokeText(bn.text, 0, 0);
      ctx.fillStyle = bn.color || C.orange;
      ctx.fillText(bn.text, 0, 0);
      ctx.restore();
    }
  }

  // ---- FPS (unten links)
  if (showFps) {
    ctx.font = F_SMALL;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.fillText('FPS ' + Math.round(fps || 0), 6, H - 8);
  }

  ctx.restore();
}
