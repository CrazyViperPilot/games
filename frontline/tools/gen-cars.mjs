// Erzeugt das Bilderblatt der zivilen Autos der isometrischen Ansicht (assets/iso/cars/cars.png).
// Eigene Grafik (mit Canvas aus Flächen gemalt, keine fremden Ressourcen). Aufruf: node tools/gen-cars.mjs
// Blatt: Spalte = Lackfarbe (wie CAR_COLORS in js/game/map.js), Zeile = Form (Limousine, Kombi, Transporter) × Richtung (A, B).
// Richtung A: Längsachse läuft im Bild nach rechts unten, B nach links unten. Licht von links oben (wie bei den Bäumen).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../assets/iso/cars/', import.meta.url));
const COLORS = ['#b8b8b0', '#8a2f2f', '#2f4f7a', '#d0c060', '#3b3b3b', '#d8d8d8', '#4f7a4f']; // wie CAR_COLORS in js/game/map.js
const CELL_W = 96;
const CELL_H = 80;
const ORIGIN = { x: 48, y: 56 }; // Mitte des Wagens am Boden

const page = await (await chromium.launch()).newPage();
const url = await page.evaluate(
  ({ COLORS, CELL_W, CELL_H, ORIGIN }) => {
    const S = 2; // Bildpunkte je Bildschirm-Pixel bei Zoom 1
    const K = Math.SQRT1_2;
    const L = 36; // Länge und Breite wie im Spiel (Weltpixel)
    const WD = 18;
    // Profile (Länge l, Höhe h), Dachlinie von hinten nach vorn; Fenster als Polygon in der Seitenwand
    const SHAPES = [
      { top: [[-18, 8], [-12, 9], [-7, 13], [4, 13], [10, 9], [18, 8]], low: 3, win: [[-9.5, 9.6], [-6, 12.4], [3, 12.4], [7.5, 9.6]], wheels: [-11, 11] }, // Limousine
      { top: [[-18, 9], [-16.5, 13], [3, 13.5], [10, 9], [18, 8]], low: 3, win: [[-15.5, 9.8], [-14.5, 12.6], [2.5, 12.8], [7.5, 9.8]], wheels: [-11, 11] }, // Kombi
      { top: [[-18, 6], [-18, 14.5], [9, 14.5], [13, 9], [18, 8]], low: 3, win: [[-16, 9.5], [-16, 13.5], [7.5, 13.5], [11, 9.5]], wheels: [-11.5, 11.5] }, // Transporter
    ];
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const shade = (h, f) => {
      const [r, g, b] = hex(h).map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
      return `rgb(${r},${g},${b})`;
    };
    const c = document.createElement('canvas');
    c.width = CELL_W * COLORS.length;
    c.height = CELL_H * SHAPES.length * 2;
    const ctx = c.getContext('2d');

    function car(col, shape, dir, ox, oy) {
      // Achsen im Bild: Länge uL, Breite uW; Höhe nach oben
      const uL = dir === 0 ? [K * S, K * S * 0.5] : [-K * S, K * S * 0.5];
      const uW = dir === 0 ? [-K * S, K * S * 0.5] : [K * S, K * S * 0.5];
      const P = (l, w, h) => [ox + l * uL[0] + w * uW[0], oy + l * uL[1] + w * uW[1] - h * S * 0.85];
      const poly = (pts, fill, stroke) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      };
      const w0 = -WD / 2;
      const w1 = WD / 2;
      const sideF = dir === 0 ? 0.9 : 0.68; // Seitenwand sichtbar bei w = +, Stirnseite bei l = +
      const endF = dir === 0 ? 0.66 : 0.9;
      // Schatten am Boden (nach rechts unten versetzt)
      poly([P(-L / 2 + 1, w0 + 2, 0), P(L / 2 + 3, w0 + 2, 0), P(L / 2 + 3, w1 + 3, 0), P(-L / 2 + 1, w1 + 3, 0)].map(([x, y]) => [x + 3, y + 1]), 'rgba(0,0,0,0.3)');
      const t = shape.top;
      const low = shape.low;
      // Oberseiten (Dachlinie), hinten nach vorn
      for (let i = 0; i < t.length - 1; i++) {
        const [la, ha] = t[i];
        const [lb, hb] = t[i + 1];
        const slope = (hb - ha) / (lb - la);
        const glass = Math.abs(slope) > 0.35;
        const f = glass ? (slope > 0 ? 0.95 : 0.78) : 1.08 - Math.abs(slope) * 0.3;
        poly([P(la, w0, ha), P(la, w1, ha), P(lb, w1, hb), P(lb, w0, hb)], glass ? shade('#2c3e50', f * 1.25) : shade(col, f), 'rgba(0,0,0,0.25)');
      }
      // Stirnseite (vorn, l = +)
      const [lf, hf] = t[t.length - 1];
      poly([P(lf, w0, low), P(lf, w1, low), P(lf, w1, hf), P(lf, w0, hf)], shade(col, endF), 'rgba(0,0,0,0.35)');
      // Frontscheinwerfer und Stoßfänger
      poly([P(lf, w0 + 1.2, hf - 4), P(lf, w0 + 4.2, hf - 4), P(lf, w0 + 4.2, hf - 1.8), P(lf, w0 + 1.2, hf - 1.8)], '#f4efc8');
      poly([P(lf, w1 - 4.2, hf - 4), P(lf, w1 - 1.2, hf - 4), P(lf, w1 - 1.2, hf - 1.8), P(lf, w1 - 4.2, hf - 1.8)], '#f4efc8');
      poly([P(lf, w0, low + 0.3), P(lf, w1, low + 0.3), P(lf, w1, low + 1.6), P(lf, w0, low + 1.6)], shade('#222', 1));
      // Seitenwand (bei w = +W/2): Umriss aus Profil, darauf Fenster, Türkante, Räder
      const side = [P(-L / 2, w1, low), ...t.map(([l, h]) => P(l, w1, h)), P(L / 2, w1, low)];
      poly(side, shade(col, sideF), 'rgba(0,0,0,0.4)');
      // Zierlinie in halber Höhe und Türkante
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(...P(-L / 2 + 1, w1, 6.2));
      ctx.lineTo(...P(L / 2 - 1, w1, 6.2));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(...P(-1, w1, low + 1));
      ctx.lineTo(...P(-1, w1, shape.win[1][1]));
      ctx.stroke();
      poly(shape.win.map(([l, h]) => P(l, w1, h)), shade('#33485c', dir === 0 ? 1.1 : 0.85), 'rgba(0,0,0,0.4)');
      // Glanzstreifen im Fenster
      poly([P(shape.win[1][0], w1, shape.win[1][1] - 0.4), P(shape.win[1][0] + 3, w1, shape.win[1][1] - 0.4), P(shape.win[1][0] + 0.5, w1, shape.win[0][1] + 0.4), P(shape.win[0][0] + 0.2, w1, shape.win[0][1] + 0.4)], 'rgba(255,255,255,0.18)');
      // Räder: Kreise in der Seitenebene
      for (const lw of shape.wheels) {
        const pts = [];
        for (let a = 0; a < 20; a++) pts.push(P(lw + Math.cos((a / 20) * Math.PI * 2) * 3.4, w1 + 0.1, 3.4 + Math.sin((a / 20) * Math.PI * 2) * 3.4));
        poly(pts, '#17181a', 'rgba(0,0,0,0.6)');
        const hub = [];
        for (let a = 0; a < 12; a++) hub.push(P(lw + Math.cos((a / 12) * Math.PI * 2) * 1.5, w1 + 0.2, 3.4 + Math.sin((a / 12) * Math.PI * 2) * 1.5));
        poly(hub, '#a8adb2');
      }
    }

    COLORS.forEach((col, ci) => {
      SHAPES.forEach((shape, si) => {
        for (let dir = 0; dir < 2; dir++) car(col, shape, dir, ci * CELL_W + ORIGIN.x, (si * 2 + dir) * CELL_H + ORIGIN.y);
      });
    });
    return c.toDataURL('image/png');
  },
  { COLORS, CELL_W, CELL_H, ORIGIN },
);
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}cars.png`, Buffer.from(url.split(',')[1], 'base64'));
await page.context().browser().close();
