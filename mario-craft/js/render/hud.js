// HUD und Bedienknöpfe (PLAN §6, §7, PRD §4, §8). Alles aus dem Atlas: Ziffern und Zeichen sind Pixel-Glyphen
// (Sprite font_*), kein fillText. Die Sprites werden über bindHud() einmal gesetzt (Renderer ruft es auf).
import { BOSSES } from '../data/mobs.js';
import { PHYS } from '../data/physics.js';

let S = null;

const DIGITS = ['font_0', 'font_1', 'font_2', 'font_3', 'font_4', 'font_5', 'font_6', 'font_7', 'font_8', 'font_9'];
const ADV = 4;                  // Glyphenbreite 4 px inkl. Schatten
const PAUSE_X_OFF = 28;         // Pause-Knopf rechts (24 px + Rand)
const PAUSE_Y = 4;
const PICK_NAMES = ['it_pick_stone', 'it_pick_stone', 'it_pick_iron', 'it_pick_diamond'];
const BOSS_BAR_W = 80, BOSS_BAR_H = 4;
const BOSS_PARTS_FULL = 4;      // Slimeking: ab 4 Teilen volle Anzeige
const BTN_NAME = { left: 'btn_left', right: 'btn_right', jump: 'btn_jump', fire: 'btn_fire', dig: 'btn_dig' };

export function bindHud(sprites) {
  S = sprites;
}

// Zeichnet eine Sprite-Region an Pixelposition (ganzzahlig).
function blit(ctx, name, frame, x, y) {
  const s = S.get(name, frame, false);
  ctx.drawImage(S.atlas, s.sx, s.sy, s.w, s.h, x | 0, y | 0, s.w, s.h);
}

// Zahl mit führenden Nullen auf `len` Stellen, ab (x, y). Gibt die Breite zurück.
function drawNum(ctx, n, len, x, y) {
  let v = n < 0 ? 0 : n | 0;
  for (let i = len - 1; i >= 0; i--) {
    const d = v % 10;
    v = (v - d) / 10;
    blit(ctx, DIGITS[d], 0, x + i * ADV, y);
  }
  return len * ADV;
}

// Text aus Glyphen (nur Ziffern, ':', 'x', Großbuchstaben aus der Schrift). Gibt die Breite zurück.
export function drawText(ctx, text, x, y) {
  let cx = x;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== ' ') blit(ctx, `font_${ch === ':' ? 'colon' : ch}`, 0, cx, y);
    cx += ADV;
  }
  return cx - x;
}

const PHYS_HEARTS = PHYS.maxHearts;
// Herz 7×6 Pixel (Zeilen als Bitmaske), mit dunklem Rand für Lesbarkeit auf hellem Hintergrund.
const HEART = [0b0110110, 0b1111111, 0b1111111, 0b0111110, 0b0011100, 0b0001000];
function drawHeart(ctx, x, y, full) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(x - 1, y - 1, 9, 8);
  ctx.fillStyle = full ? '#e0383f' : '#4a2a2e';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) if (HEART[r] & (1 << (6 - c))) ctx.fillRect(x + c, y + r, 1, 1);
  }
  if (full) {
    ctx.fillStyle = '#ff9aa0';
    ctx.fillRect(x + 1, y + 1, 1, 1);
  }
}

// Anteil der Boss-Energie 0..1 (Slimeking: Teile, sonst HP).
function bossRatio(b) {
  if (b.kind === 'slimeking') {
    const n = b.parts ? b.parts.length : 0;
    return Math.min(n, BOSS_PARTS_FULL) / BOSS_PARTS_FULL;
  }
  const def = BOSSES[b.kind];
  if (!def || !def.hp) return 1;
  const r = b.hp / def.hp;
  return r < 0 ? 0 : r > 1 ? 1 : r;
}

// Oben links: Smaragde, Leben, Diamant-Slots, Zeit, Spitzhacke mit Stufe; oben rechts der Pause-Knopf.
// Unten Mitte: Energieleiste des aktiven Bosses.
export function drawHud(ctx, game, w, h) {
  if (!S) return;
  const y = 4;
  let x = 4;
  // Smaragde (2-stellig, Rest unter 100)
  blit(ctx, 'hud_emerald', 0, x, y);
  x += 10;
  blit(ctx, 'font_x', 0, x, y + 2);
  x += 5;
  x += drawNum(ctx, game.emeralds, 2, x, y + 2) + 3;
  // Leben: Kopf mit Zahl
  blit(ctx, 'hud_head', 0, x, y);
  x += 11;
  blit(ctx, 'font_x', 0, x, y + 2);
  x += 5;
  x += drawNum(ctx, game.lives, game.lives >= 10 ? 2 : 1, x, y + 2) + 3;
  // Diamant-Slots (gefüllt, wenn gesammelt)
  for (let i = 0; i < 3; i++) {
    blit(ctx, game.diamonds[i] ? 'hud_diamond' : 'hud_slot', 0, x, y);
    x += 11;
  }
  x += 4;
  // Zeit mm:ss
  const t = game.time | 0;
  x += drawNum(ctx, (t / 60) | 0, 2, x, y + 2);
  blit(ctx, 'font_colon', 0, x, y + 2);
  x += 4;
  x += drawNum(ctx, t % 60, 2, x, y + 2) + 6;
  // Spitzhacke (bei 0 Holz-Platzhalter, halb transparent) mit Stufe
  const pick = game.pick | 0;
  const pname = PICK_NAMES[pick] || PICK_NAMES[0];
  if (pick === 0) ctx.globalAlpha = 0.5;
  blit(ctx, pname, 0, x, y);
  ctx.globalAlpha = 1;
  drawNum(ctx, pick, 1, x + 13, y + 2);
  // Herzen (zweite Zeile): volle rot, verlorene dunkel
  for (let i = 0; i < PHYS_HEARTS; i++) drawHeart(ctx, 4 + i * 9, y + 14, i < game.hearts);
  // Pause
  blit(ctx, 'pause', 0, w - PAUSE_X_OFF, PAUSE_Y);
  // Boss-Energie
  const b = game.boss;
  if (b && b.active) {
    const bx = ((w - BOSS_BAR_W) / 2) | 0;
    const by = h - BOSS_BAR_H - 6;
    ctx.fillStyle = '#000000';
    ctx.fillRect(bx - 1, by - 1, BOSS_BAR_W + 2, BOSS_BAR_H + 2);
    ctx.fillStyle = '#4a0f14';
    ctx.fillRect(bx, by, BOSS_BAR_W, BOSS_BAR_H);
    ctx.fillStyle = '#e0383f';
    ctx.fillRect(bx, by, Math.round(BOSS_BAR_W * bossRatio(b)), BOSS_BAR_H);
  }
}

// Bedienknöpfe: input.buttons = [{ id, x, y, r, base, down, visible }] (Mittelpunkt x, y). Pause zeichnet drawHud.
// Ruhend halbtransparent (0.45), gedrückt 0.9. Größe = Sprite × r / base (Knopfgröße). Alpha wird wiederhergestellt.
export function drawControls(ctx, input, w, h) {
  if (!S || !input || !input.buttons) return;
  const list = input.buttons;
  const prevAlpha = ctx.globalAlpha;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.visible || b.id === 'pause') continue;
    const name = BTN_NAME[b.id];
    if (!name) continue;
    const s = S.get(name, b.down ? 1 : 0, false);
    const k = b.base ? b.r / b.base : 1;
    const dw = Math.round(s.w * k), dh = Math.round(s.h * k);
    ctx.globalAlpha = b.down ? 0.9 : 0.45;
    ctx.drawImage(S.atlas, s.sx, s.sy, s.w, s.h, Math.round(b.x - dw / 2), Math.round(b.y - dh / 2), dw, dh);
  }
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}
