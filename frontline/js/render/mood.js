// Lichtstimmung (v4.70, reine Optik): eine Tönung über der Welt wie Morgenlicht, Mittag, Abendrot oder Mondschein. Ändert keine Spielregel
// und nichts an der Simulation (Sicht, Wetter, KI bleiben gleich). Je Frame nur drei Füllungen über den ganzen Bildschirm
// (Multiplikation, Lichtschein einer Seite, Vignette); die Verläufe sind je Bildgröße zwischengespeichert.
import { makeRng } from '../core/rng.js';

/** Einstellungen des Startmenüs: aus, Zufall (aus dem Seed, nach Jahreszeit gewichtet) oder eine feste Stimmung. */
export const MOOD_SETTINGS = ['off', 'random', 'morning', 'day', 'evening', 'night'];
export const MOOD_NAMES = { morning: 'Morgen', day: 'Tag', evening: 'Abend', night: 'Nacht' };

/**
 * mult: Farbe der Multiplikation (255 = unverändert) · glow: Lichtschein [r, g, b, Stärke] von der Seite `x`/`y` (0 … 1 im Bild) ·
 * vig: Stärke der dunklen Ränder · `tint`: Farbe der Ränder.
 */
export const MOODS = {
  morning: { mult: [255, 240, 232], glow: [255, 196, 150, 0.2], gx: 0.08, gy: 0.18, vig: 0.12, tint: [60, 40, 70] },
  day: { mult: [255, 255, 255], glow: [255, 244, 214, 0.06], gx: 0.5, gy: 0.0, vig: 0.08, tint: [30, 30, 40] },
  evening: { mult: [255, 214, 178], glow: [255, 150, 70, 0.26], gx: 0.95, gy: 0.2, vig: 0.2, tint: [70, 30, 40] },
  night: { mult: [150, 168, 222], glow: [120, 150, 255, 0.14], gx: 0.3, gy: 0.0, vig: 0.28, tint: [8, 10, 40] },
};

/** Gewichte der Zufallswahl je Jahreszeit (Winter kühler und früh/spät, Herbst mit viel Abendrot). */
const ODDS = {
  summer: { morning: 2, day: 5, evening: 3, night: 1 },
  autumn: { morning: 2, day: 2, evening: 5, night: 2 },
  winter: { morning: 3, day: 2, evening: 2, night: 3 },
};

/** Stimmung für diese Partie: setting 'off' | 'random' | feste Stimmung; Zufall deterministisch aus dem Seed. Rückgabe null = keine. */
export function pickMood(setting, seed, season = 'summer') {
  if (setting in MOODS) return setting;
  if (setting !== 'random') return null;
  const odds = Object.entries(ODDS[season] ?? ODDS.summer);
  const rng = makeRng((Math.imul(seed | 0, 2246822519) ^ 0x11677) >>> 0);
  let r = rng.next() * odds.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of odds) {
    r -= w;
    if (r < 0) return k;
  }
  return odds[0][0];
}

let cacheKey = '';
let glowGrad = null;
let vigGrad = null;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Stimmung über die Welt zeichnen (ctx in CSS-Pixeln, Transform = dpr). */
export function drawMood(ctx, mood, cssW, cssH) {
  const m = MOODS[mood];
  if (!m) return;
  const key = `${mood}|${cssW}|${cssH}`;
  if (key !== cacheKey) {
    cacheKey = key;
    const gr = Math.max(cssW, cssH) * 0.85;
    glowGrad = ctx.createRadialGradient(m.gx * cssW, m.gy * cssH, 0, m.gx * cssW, m.gy * cssH, gr);
    glowGrad.addColorStop(0, rgba(m.glow, m.glow[3]));
    glowGrad.addColorStop(1, rgba(m.glow, 0));
    vigGrad = ctx.createRadialGradient(cssW / 2, cssH / 2, Math.min(cssW, cssH) * 0.45, cssW / 2, cssH / 2, Math.hypot(cssW, cssH) * 0.55);
    vigGrad.addColorStop(0, rgba(m.tint, 0));
    vigGrad.addColorStop(1, rgba(m.tint, m.vig));
  }
  ctx.save();
  if (m.mult[0] + m.mult[1] + m.mult[2] < 765) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba(m.mult, 1);
    ctx.fillRect(0, 0, cssW, cssH);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.restore();
}
