// Wetter im Bild (v4.51): Regen als schräge Schnüre mit dunklerem Licht, Schnee als treibende Flocken, Nebel als heller Dunst mit
// ziehenden Schwaden und dichterem Rand. Zeichnet in Bildschirmkoordinaten über die Welt (unter Lebensbalken und Hinweisen); die
// Stärke folgt dem Übergang des Wetters (weather.mix). Kein Zustand außer festen Zufallswerten je Tropfen.
import { makeRng } from '../core/rng.js';

const MAX = 600; // Tropfen bzw. Flocken höchstens
const rng = makeRng(0x7e47);
const DROPS = Array.from({ length: MAX }, () => [rng.next(), rng.next(), rng.next()]);
const FOG_SCALE = 4; // Nebelbild in 1/4 der Bildschirmgröße
let fogLayer = null;
const makeLayer = () => (typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1));

/** Anteil eines Wetters am Bild (Übergang: das alte blendet aus, das neue ein). */
function share(w, kind) {
  return (w.kind === kind ? w.mix : 0) + (w.prev === kind ? 1 - w.mix : 0);
}

/** Wetter über die Welt zeichnen (ctx in CSS-Pixeln, Transform = dpr). cam: Kamera (Nebelschwaden ziehen mit der Karte). */
export function drawWeather(ctx, weather, cssW, cssH, now, cam) {
  if (!weather?.on) return;
  const t = now / 1000;
  const area = cssW * cssH;
  const rain = share(weather, 'rain');
  const snow = share(weather, 'snow');
  const fog = share(weather, 'fog');

  if (rain > 0.01) {
    ctx.fillStyle = `rgba(24,34,52,${(0.18 * rain).toFixed(3)})`;
    ctx.fillRect(0, 0, cssW, cssH);
    const n = Math.min(MAX, Math.round((area / 2400) * rain));
    const span = cssH + 60;
    ctx.strokeStyle = 'rgba(200,214,232,0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [a, b, c] = DROPS[i];
      const fall = 760 + 420 * c; // px/s
      const y = ((b * span + t * fall) % span) - 30;
      const x = (((a * (cssW + 80) - y * 0.22) % (cssW + 80)) + cssW + 80) % (cssW + 80) - 40;
      const len = 12 + 10 * c;
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.22, y + len);
    }
    ctx.stroke();
  }

  if (snow > 0.01) {
    ctx.fillStyle = `rgba(214,224,236,${(0.12 * snow).toFixed(3)})`;
    ctx.fillRect(0, 0, cssW, cssH);
    const n = Math.min(MAX, Math.round((area / 2600) * snow));
    const span = cssH + 20;
    ctx.fillStyle = 'rgba(246,249,255,0.88)';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [a, b, c] = DROPS[i];
      const fall = 26 + 40 * c;
      const y = ((b * span + t * fall) % span) - 10;
      const sway = Math.sin(t * (0.6 + c) + a * 40) * (6 + 10 * c);
      const x = ((((a * (cssW + 40) + t * 14 + sway) % (cssW + 40)) + cssW + 40) % (cssW + 40)) - 20;
      const s = 1.6 + 1.8 * c; // nahe Flocken größer und schneller
      ctx.rect(x - s / 2, y - s / 2, s, s);
    }
    ctx.fill();
  }

  if (fog > 0.01) {
    // Dunst, Schwaden und dichter Rand in einem kleinen Bild (1/4 Größe), hochskaliert: Nebel darf weich sein, das spart Füllrate
    const fw = Math.max(1, Math.ceil(cssW / FOG_SCALE));
    const fh = Math.max(1, Math.ceil(cssH / FOG_SCALE));
    fogLayer ??= makeLayer();
    if (fogLayer.width !== fw) fogLayer.width = fw;
    if (fogLayer.height !== fh) fogLayer.height = fh;
    const f = fogLayer.getContext('2d');
    f.clearRect(0, 0, fw, fh);
    f.fillStyle = `rgba(198,206,208,${(0.2 * fog).toFixed(3)})`;
    f.fillRect(0, 0, fw, fh);
    // Schwaden ziehen langsam und mit der Karte (Parallaxe)
    const R = Math.max(fw, fh) * 0.55;
    const ox = cam ? (-cam.x * cam.zoom * 0.25) / FOG_SCALE : 0;
    const oy = cam ? (-cam.y * cam.zoom * 0.25) / FOG_SCALE : 0;
    for (let k = 0; k < 4; k++) {
      const [a, b] = DROPS[k];
      const wx = fw + 2 * R;
      const x = ((((a * wx + (t * (10 + 4 * k)) / FOG_SCALE + ox) % wx) + wx) % wx) - R;
      const y = ((((b * (fh + R) + oy * 0.6) % (fh + R)) + fh + R) % (fh + R)) - R / 2;
      const gr = f.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(214,220,222,${(0.24 * fog).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(214,220,222,0)');
      f.fillStyle = gr;
      f.fillRect(0, 0, fw, fh);
    }
    const cx = fw / 2;
    const cy = fh / 2;
    const edge = f.createRadialGradient(cx, cy, Math.min(fw, fh) * 0.3, cx, cy, Math.hypot(cx, cy));
    edge.addColorStop(0, 'rgba(200,207,210,0)');
    edge.addColorStop(1, `rgba(200,207,210,${(0.42 * fog).toFixed(3)})`);
    f.fillStyle = edge;
    f.fillRect(0, 0, fw, fh);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fogLayer, 0, 0, fw, fh, 0, 0, fw * FOG_SCALE, fh * FOG_SCALE);
  }
}
