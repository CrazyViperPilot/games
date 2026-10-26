// Jahreszeiten im Bild (v4.51): Herbst färbt Wiesen gelblich und Laub gelb, orange und rot, Winter legt Schnee über Wiesen und Bäume
// (Straßen, Dächer und Fels bekommen nur eine dünne Schicht, Wasser bleibt). Ein Farbfilter je Pixel über fertige Bilder (Geländebild,
// Baum-Sprite), einmal je Bild und Jahreszeit erzeugt und zwischengespeichert. Dazu der Schnee auf den Dächern der Iso-Ansicht.

const cache = new WeakMap(); // Bild → { autumn, winter }

function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Weiches Rauschen 0 … 1 (zwei Sinuswellen), damit Laub und Schnee nicht gleichförmig wirken. */
const wave = (x, y, f) => 0.5 + 0.25 * Math.sin(x * 0.11 * f + Math.sin(y * 0.07 * f) * 2.2) + 0.25 * Math.sin(y * 0.13 * f + x * 0.05 * f);
const LEAF_N = [0.95, 0.55, 0]; // Herbstbäume (Sprite): je Färbung Gelb, Orange, Rotbraun
const TREE_TOP = 145; // Helligkeit, ab der eine Fläche des Baum-Sprites oben liegt (dort bleibt Schnee liegen)

/**
 * Filtert die Pixel (RGBA) für die Jahreszeit. kind: 'ground' (Geländebild: helles Grün = Wiese, dunkles = Wald und Bäume) oder
 * 'tree' (Baum-Sprite: alles Grün ist Laub; Herbst je variant eine Färbung, Winter dunkle Krone mit Schnee auf den hellen Oberseiten).
 * f: Maßstab des Rauschens (Pixel je Weltpixel), variant verschiebt es (andere Farben).
 */
export function tintPixels(d, w, h, season, kind = 'ground', f = 1, variant = 0) {
  const tree = kind === 'tree';
  const ox = variant * 97;
  const oy = variant * 61;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const L = 0.3 * r + 0.59 * g + 0.11 * b;
      const veg = g >= r && g >= b ? Math.min(1, (g - Math.max(r, b) + 4) / 16) : 0; // wie grün (Wiese, Laub)
      const water = b > r + 10 && b >= g;
      if (season === 'winter' && tree) {
        // Winterbaum: Krone gedämpft dunkelgrün, auf den Oberseiten Schnee
        const top = Math.max(0, Math.min(1, (L - TREE_TOP) / 10));
        const mr = r + (L * 0.5 - r) * 0.65 * veg;
        const mg = g + (L * 0.64 - g) * 0.65 * veg;
        const mb = b + (L * 0.56 - b) * 0.65 * veg;
        const cover = veg * (0.12 + 0.78 * top);
        d[i] = clamp(mr + (236 - mr) * cover);
        d[i + 1] = clamp(mg + (241 - mg) * cover);
        d[i + 2] = clamp(mb + (247 - mb) * cover);
      } else if (season === 'winter') {
        if (water) continue;
        const n = wave(x + ox, y + oy, f);
        // Schnee: Wiesen fast ganz, Laub teilweise, alles andere eine dünne Schicht; die Helligkeit bleibt (Schummerung, Kronen)
        const crown = Math.max(0, Math.min(1, (g - Math.max(r, b) - 24) / 12)); // kräftiges Grün: Baumkronen
        const cover = (0.3 + 0.6 * veg * (1 - 0.45 * crown)) * (0.88 + 0.24 * n);
        const k = Math.min(1.12, 0.52 + L / 190);
        d[i] = clamp(r + (222 * k - r) * cover);
        d[i + 1] = clamp(g + (229 * k - g) * cover);
        d[i + 2] = clamp(b + (238 * k - b) * cover);
      } else if (season === 'autumn') {
        if (veg <= 0) continue;
        const n = tree
          ? Math.max(0, Math.min(1, LEAF_N[variant % LEAF_N.length] + (wave(x, y, f) - 0.5) * 0.25))
          : wave(x + ox, y + oy, f);
        // kräftiges Grün (Laub, Baumkronen) bunt, mattes (Wiese, Weide) gelblich-oliv
        const leaf = tree ? 1 : Math.max(0, Math.min(1, (g - Math.max(r, b) - 24) / 12));
        // Laubfarbe zwischen Gelb (n 1), Orange und Rotbraun (n 0)
        const lr = 150 + 70 * n;
        const lg = 60 + 85 * n * n;
        const lb = 30 + 10 * n;
        const tr = lr * leaf + 132 * (1 - leaf);
        const tg = lg * leaf + 118 * (1 - leaf);
        const tb = lb * leaf + 58 * (1 - leaf);
        const tl = 0.3 * tr + 0.59 * tg + 0.11 * tb;
        const k = L / tl;
        const a = veg * (tree ? 0.8 : 0.55 + 0.3 * leaf);
        d[i] = clamp(r + (tr * k - r) * a);
        d[i + 1] = clamp(g + (tg * k - g) * a);
        d[i + 2] = clamp(b + (tb * k - b) * a);
      }
    }
  }
}

/** Bild in der Jahreszeit (Sommer: das Bild selbst). Für Bilder erst, wenn sie geladen sind. kind, f und variant wie tintPixels. */
export function seasonal(img, season, kind = 'ground', f = 1, variant = 0) {
  if (!img || !season || season === 'summer') return img;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return img; // lädt noch
  let m = cache.get(img);
  if (!m) cache.set(img, (m = {}));
  const key = `${season}${variant}`;
  if (!m[key]) {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    tintPixels(data.data, w, h, season, kind, f, variant);
    ctx.putImageData(data, 0, 0);
    m[key] = c;
  }
  return m[key];
}

// Schnee auf den Dächern (Iso): der Renderer schaltet ihn für die Häuser der Stadt ein (Spielgebäude behalten ihre Teamfarbe),
// drawBox, drawRotBox und die Satteldächer fragen hier nach
const ROOF_SNOW = 0.72;
let roofSnow = false;
const roofCache = new Map();
export function setRoofSnow(on) {
  roofSnow = !!on;
}
/** Dachfarbe unter Schnee (Hex-Farbe); ohne Schnee unverändert. */
export function snowy(color) {
  if (!roofSnow || typeof color !== 'string' || color[0] !== '#' || color.length !== 7) return color;
  let out = roofCache.get(color);
  if (!out) {
    const v = parseInt(color.slice(1), 16);
    const mix = (c, s) => Math.round(c + (s - c) * ROOF_SNOW);
    const r = mix((v >> 16) & 255, 226);
    const g = mix((v >> 8) & 255, 232);
    const b = mix(v & 255, 240);
    out = `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
    roofCache.set(color, out);
  }
  return out;
}
