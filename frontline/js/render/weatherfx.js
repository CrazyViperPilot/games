// Wetter im Bild (v4.51, seit v5.47 neu gemalt, Daniels Wunsch „schaue welche Assets noch nicht verbessert wurden und verbessere diese
// genau wie die anderen“): Regen in drei Tiefen (ferne Schnüre dünn und blass, nahe lang und hell), schräg im wechselnden Wind, mit
// Spritzern am Boden (Ring und zwei Tröpfchen); Schnee als runde, weiche Flocken in drei Tiefen, die in Böen
// treiben und taumeln; Nebel als Dunst mit flachen, ziehenden Schwaden und dichterem Rand. Zeichnet in Bildschirmkoordinaten über die
// Welt (unter Lebensbalken und Hinweisen); die Stärke folgt dem Übergang des Wetters (weather.mix). Kein Zustand außer festen
// Zufallswerten je Tropfen und zwei kleinen Bildern (Flocke, Nebel). Nur Bild, die Wirkung des Wetters steht in js/game/weather.js.
import { makeRng } from '../core/rng.js';

const MAX = 600; // Tropfen bzw. Flocken höchstens
const rng = makeRng(0x7e47);
const DROPS = Array.from({ length: MAX }, () => [rng.next(), rng.next(), rng.next()]);
const FOG_SCALE = 4; // Nebelbild in 1/4 der Bildschirmgröße
let fogLayer = null;
let flake = null; // weiche Flocke, einmal gemalt (false = kein Canvas, dann Quadrate)
const makeLayer = () =>
  typeof document !== 'undefined' ? document.createElement('canvas') : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : null;

// Regen: [ab Tiefe, bis Tiefe, Deckkraft, Strichbreite] – fern dünn und blass, nah breit und hell
const RAIN_LAYERS = [
  [0, 0.45, 0.2, 0.7],
  [0.45, 0.85, 0.34, 1],
  [0.85, 1.01, 0.5, 1.4],
];
// Schnee: [ab Tiefe, bis Tiefe, Deckkraft, Größe von, bis (px), Fallen von, bis (px/s)]
const SNOW_LAYERS = [
  [0, 0.45, 0.78, 1.4, 2.1, 16, 28],
  [0.45, 0.86, 0.9, 2.3, 3.3, 30, 46],
  [0.86, 1.01, 0.85, 4, 6, 52, 72],
];

const frac = (x) => x - Math.floor(x);
const hash = (i, k) => frac(Math.sin(i * 127.1 + k * 311.7) * 43758.5453);

/** Böen (−1 … 1): zwei langsame Wellen. */
const gust = (t) => 0.6 * Math.sin(t * 0.21) + 0.4 * Math.sin(t * 0.53 + 1.3);

/** Weg des Windes bis zur Zeit t (px, Integral von 14 + 22 · Böe): Flocken treiben stetig, auch wenn die Böe wechselt. */
export const windDrift = (t) => 14 * t - 22 * ((0.6 / 0.21) * Math.cos(t * 0.21) + (0.4 / 0.53) * Math.cos(t * 0.53 + 1.3));

/** Anteil eines Wetters am Bild (Übergang: das alte blendet aus, das neue ein). */
function share(w, kind) {
  return (w.kind === kind ? w.mix : 0) + (w.prev === kind ? 1 - w.mix : 0);
}

const rgba = (rgb, a) => `rgba(${rgb},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** Wetter über die Welt zeichnen (ctx in CSS-Pixeln, Transform = dpr). cam: Kamera (Nebelschwaden ziehen mit der Karte). */
export function drawWeather(ctx, weather, cssW, cssH, now, cam) {
  if (!weather?.on) return;
  const t = now / 1000;
  const rain = share(weather, 'rain');
  const snow = share(weather, 'snow');
  const fog = share(weather, 'fog');
  if (rain > 0.01) drawRain(ctx, rain, cssW, cssH, t);
  if (snow > 0.01) drawSnow(ctx, snow, cssW, cssH, t);
  if (fog > 0.01) drawFog(ctx, fog, cssW, cssH, t, cam);
}

// ---------- Regen ----------

function drawRain(ctx, rain, cssW, cssH, t) {
  // trübes Licht unter den Wolken (einfarbig: ein Verlauf über das ganze Bild kostet ohne Grafikchip spürbar Zeit)
  ctx.fillStyle = rgba('22,32,48', 0.2 * rain);
  ctx.fillRect(0, 0, cssW, cssH);
  const area = cssW * cssH;
  const n = Math.min(MAX, Math.round((area / 2000) * rain));
  const span = cssH + 60;
  const W = cssW + 120;
  const slant = 0.16 + 0.09 * gust(t); // Neigung der Schnüre (dx je dy), mit den Böen
  const a0 = Math.min(1, rain * 1.4);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [lo, hi, a, lw] of RAIN_LAYERS) {
    ctx.strokeStyle = rgba('206,218,236', a * a0);
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [pa, pb, c] = DROPS[i];
      if (c < lo || c >= hi) continue;
      const fall = 700 + 520 * c; // px/s, nahe Tropfen schneller
      const y = ((pb * span + t * fall) % span) - 30;
      const x = ((((pa * W - y * slant) % W) + W) % W) - 60;
      const len = 8 + 18 * c;
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * slant, y + len);
    }
    ctx.stroke();
  }
  // Spritzer am Boden: Ring, der aufgeht und verblasst, dazu zwei Tröpfchen, die hochspringen (je Spritzer neue Stelle)
  const m = Math.min(260, Math.round((area / 4200) * rain));
  const young = [];
  const old = [];
  const dots = [];
  for (let i = 0; i < m; i++) {
    const [pa, , c] = DROPS[i];
    const ph = t / (0.5 + 0.35 * c) + pa * 7;
    const cyc = Math.floor(ph);
    const g = (ph - cyc) / 0.45; // der Ring lebt 45 % der Zeit
    if (g >= 1) continue;
    const x = hash(i, cyc) * cssW;
    const y = 30 + hash(i + 977, cyc) * (cssH - 30);
    (g < 0.5 ? young : old).push(x, y, 1.2 + 5.5 * g);
    if (g < 0.55) {
      const s = g / 0.55;
      const h = 14 * s * (1 - s);
      const d = 1.5 + 4 * s;
      dots.push(x - d, y - h, x + d * 0.8, y - h * 0.8);
    }
  }
  ctx.lineWidth = 0.9;
  for (const [list, a] of [[young, 0.5], [old, 0.24]]) {
    if (!list.length) continue;
    ctx.strokeStyle = rgba('216,228,244', a * a0);
    ctx.beginPath();
    for (let k = 0; k < list.length; k += 3) {
      const [x, y, r] = [list[k], list[k + 1], list[k + 2]];
      ctx.moveTo(x + r, y);
      ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  if (dots.length) {
    ctx.fillStyle = rgba('226,236,250', 0.62 * a0);
    ctx.beginPath();
    for (let k = 0; k < dots.length; k += 2) ctx.rect(dots[k] - 0.6, dots[k + 1] - 0.6, 1.2, 1.2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- Schnee ----------

/** Weiche, runde Flocke (32 px) mit zartem Schatten nach rechts unten (sonst auf Schnee unsichtbar), einmal gemalt; ohne Canvas null. */
function flakeImage() {
  if (flake !== null) return flake || null;
  const c = makeLayer();
  if (!c) {
    flake = false;
    return null;
  }
  c.width = 32;
  c.height = 32;
  const f = c.getContext('2d');
  const disc = (x, y, r, stops) => {
    const g = f.createRadialGradient(x, y, 0, x, y, r);
    for (const [at, col] of stops) g.addColorStop(at, col);
    f.fillStyle = g;
    f.fillRect(0, 0, 32, 32);
  };
  disc(17.5, 18, 13, [[0, 'rgba(96,112,140,0.42)'], [0.6, 'rgba(96,112,140,0.2)'], [1, 'rgba(96,112,140,0)']]);
  disc(15, 15, 13, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(252,253,255,0.95)'], [0.72, 'rgba(244,248,255,0.45)'], [1, 'rgba(240,246,255,0)']]);
  flake = c;
  return c;
}

function drawSnow(ctx, snow, cssW, cssH, t) {
  // heller Schleier
  ctx.fillStyle = rgba('218,227,238', 0.12 * snow);
  ctx.fillRect(0, 0, cssW, cssH);
  const n = Math.min(MAX, Math.round(((cssW * cssH) / 1700) * snow));
  const span = cssH + 30;
  const W = cssW + 60;
  const drift = windDrift(t);
  const img = flakeImage();
  const a0 = Math.min(1, snow * 1.5);
  ctx.save();
  for (const [lo, hi, alpha, s0, s1, v0, v1] of SNOW_LAYERS) {
    ctx.globalAlpha = alpha * a0;
    if (!img) {
      ctx.fillStyle = '#f6f9ff';
      ctx.beginPath();
    }
    for (let i = 0; i < n; i++) {
      const [a, b, c] = DROPS[i];
      if (c < lo || c >= hi) continue;
      const k = (c - lo) / (hi - lo); // Tiefe in der Schicht
      const y = ((b * span + t * (v0 + (v1 - v0) * k)) % span) - 15;
      const sway = Math.sin(t * (0.7 + c) + a * 40) * (4 + 10 * c); // taumeln
      const x = ((((a * W + drift * (0.4 + c) + sway) % W) + W) % W) - 30; // nahe Flocken treiben schneller
      const s = s0 + (s1 - s0) * k;
      if (img) ctx.drawImage(img, x - s, y - s, 2 * s, 2 * s);
      else ctx.rect(x - s / 2, y - s / 2, s, s);
    }
    if (!img) ctx.fill();
  }
  ctx.restore();
}

// ---------- Nebel ----------

function drawFog(ctx, fog, cssW, cssH, t, cam) {
  // Dunst, Schwaden und dichter Rand in einem kleinen Bild (1/4 Größe), hochskaliert: Nebel darf weich sein, das spart Füllrate
  const fw = Math.max(1, Math.ceil(cssW / FOG_SCALE));
  const fh = Math.max(1, Math.ceil(cssH / FOG_SCALE));
  fogLayer ??= makeLayer() ?? false;
  if (!fogLayer) {
    ctx.fillStyle = rgba('198,206,208', 0.3 * fog);
    ctx.fillRect(0, 0, cssW, cssH);
    return;
  }
  if (fogLayer.width !== fw) fogLayer.width = fw;
  if (fogLayer.height !== fh) fogLayer.height = fh;
  const f = fogLayer.getContext('2d');
  f.clearRect(0, 0, fw, fh);
  f.fillStyle = rgba('198,206,208', 0.2 * fog);
  f.fillRect(0, 0, fw, fh);
  // flache Schwaden (Bänke) ziehen langsam und mit der Karte (Parallaxe); nahe Bänke größer und schneller
  const ox = cam ? (-cam.x * cam.zoom * 0.25) / FOG_SCALE : 0;
  const oy = cam ? (-cam.y * cam.zoom * 0.25) / FOG_SCALE : 0;
  const big = Math.max(fw, fh);
  for (let k = 0; k < 7; k++) {
    const [a, b, c] = DROPS[k];
    const R = big * (0.32 + 0.3 * c);
    const wx = fw + 2 * R;
    const x = ((((a * wx + (t * (8 + 5 * c)) / FOG_SCALE + ox * (0.6 + 0.6 * c)) % wx) + wx) % wx) - R;
    const hy = fh + R;
    const y = ((((b * hy + oy * (0.4 + 0.4 * c)) % hy) + hy) % hy) - R / 4;
    f.save();
    f.translate(x, y);
    f.scale(1, 0.42 + 0.2 * b);
    const gr = f.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, rgba('216,222,224', (0.2 + 0.1 * c) * fog));
    gr.addColorStop(0.55, rgba('214,220,222', (0.1 + 0.05 * c) * fog));
    gr.addColorStop(1, 'rgba(214,220,222,0)');
    f.fillStyle = gr;
    f.fillRect(-R, -R, 2 * R, 2 * R);
    f.restore();
  }
  const cx = fw / 2;
  const cy = fh / 2;
  const edge = f.createRadialGradient(cx, cy, Math.min(fw, fh) * 0.3, cx, cy, Math.hypot(cx, cy));
  edge.addColorStop(0, 'rgba(200,207,210,0)');
  edge.addColorStop(1, rgba('200,207,210', 0.42 * fog));
  f.fillStyle = edge;
  f.fillRect(0, 0, fw, fh);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogLayer, 0, 0, fw, fh, 0, 0, fw * FOG_SCALE, fh * FOG_SCALE);
}
