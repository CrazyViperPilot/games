// HUD und Bedienknöpfe (PLAN §7, PRD §8). Alles aus dem Atlas: Ziffern und Zeichen sind Pixel-Glyphen
// (Sprite font_*), kein fillText. Die Sprites werden über bindHud() einmal gesetzt (Renderer ruft es auf).
let S = null;

const DIGITS = ['font_0', 'font_1', 'font_2', 'font_3', 'font_4', 'font_5', 'font_6', 'font_7', 'font_8', 'font_9'];
const ADV = 4; // Glyphenbreite 4 px inkl. Schatten
const PAUSE_X_OFF = 28; // Abstand rechts
const PAUSE_Y = 4;

export function bindHud(sprites) {
  S = sprites;
}

// Zeichnet eine Sprite-Region an Pixelposition (ganzzahlig).
function blit(ctx, name, frame, x, y, flip = false) {
  const s = S.get(name, frame, flip);
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

// Oben: Münzen, Leben, Sternmünzen, Zeit; oben rechts der Pause-Knopf (24×24).
export function drawHud(ctx, game, w, h) {
  if (!S) return;
  const y = 4;
  // Münzen
  blit(ctx, 'coin', 0, 4, y);
  blit(ctx, 'font_x', 0, 18, y + 3);
  drawNum(ctx, game.coins, 2, 24, y + 3);
  // Leben: kleines Männchen mit Zahl
  blit(ctx, 'pl_s_n', 0, 46, y - 2);
  blit(ctx, 'font_x', 0, 60, y + 3);
  drawNum(ctx, game.lives, 1, 64, y + 3);
  // Sternmünzen (3 Slots, gefüllt wenn gesammelt)
  for (let i = 0; i < 3; i++) {
    const got = game.starCoins && game.starCoins[i];
    blit(ctx, got ? 'coinstar' : 'starslot', 0, 80 + i * 14, y);
  }
  // Zeit mm:ss
  const t = game.time | 0;
  const mm = (t / 60) | 0, ss = t % 60;
  const tx = 128;
  drawNum(ctx, mm, 2, tx, y + 3);
  blit(ctx, 'font_colon', 0, tx + 8, y + 3);
  drawNum(ctx, ss, 2, tx + 12, y + 3);
  // Pause
  blit(ctx, 'pause', 0, w - PAUSE_X_OFF, PAUSE_Y);
}

// Bedienknöpfe: input.buttons = [{ id, x, y, r, down, visible }]. Pause wird von drawHud gezeichnet.
const BTN_NAME = { left: 'btn_left', right: 'btn_right', jump: 'btn_jump', fire: 'btn_fire' };
export function drawControls(ctx, input, w, h) {
  if (!S || !input || !input.buttons) return;
  const list = input.buttons;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.visible || b.id === 'pause') continue;
    const name = BTN_NAME[b.id];
    if (!name) continue;
    const s = S.get(name, b.down ? 1 : 0, false);
    ctx.drawImage(S.atlas, s.sx, s.sy, s.w, s.h, Math.round(b.x - s.w / 2), Math.round(b.y - s.h / 2), s.w, s.h);
  }
}
