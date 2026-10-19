// Scrollender Boden: einmal vorgerenderte, vertikal nahtlose Kachel (Asphalt/Erde, Straße,
// Markierungen, Sandsäcke, Betonblöcke, Risse, Reifenspuren) plus gecachte Vignette.

import { CFG } from '../config.js';
import { mulberry32 } from '../core/rng.js';

const TW = 360; // logische Kachelbreite (= WORLD_W)
const TH = 512; // logische Kachelhöhe
const SCALE = 2; // Kachel-Auflösung: 2 Pixel je Welteinheit

export class Background {
  constructor() {
    const c = document.createElement('canvas');
    c.width = TW * SCALE;
    c.height = TH * SCALE;
    this.tile = c;
    this._vigW = 0;
    this._vigH = 0;
    this._vig = null;
    this._buildTile(c.getContext('2d'));
  }

  // Zeichnet die Kachel einmal. Elemente, die über den Rand ragen, werden bei -TH und +TH
  // nochmals gezeichnet, damit die Kachel nahtlos aneinander passt.
  _buildTile(ctx) {
    const rng = mulberry32(1337);
    const offs = [-TH, 0, TH];
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

    // Boden
    ctx.fillStyle = CFG.COLORS.ground;
    ctx.fillRect(0, 0, TW, TH);

    // Rauschen im Boden (Körnung)
    for (let i = 0; i < 1800; i++) {
      const x = rng() * TW;
      const y = rng() * TH;
      const s = 0.6 + rng() * 1.6;
      ctx.globalAlpha = 0.04 + rng() * 0.1;
      ctx.fillStyle = rng() < 0.5 ? '#0c0e0a' : '#5c6250';
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;

    // Straße (etwas heller) mit dezentem Rand
    const roadX = 60;
    const roadW = 240;
    ctx.fillStyle = CFG.COLORS.ground2;
    ctx.fillRect(roadX, 0, roadW, TH);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(roadX - 2, 0, 2, TH);
    ctx.fillRect(roadX + roadW, 0, 2, TH);

    // Rauschen auf der Straße
    for (let i = 0; i < 700; i++) {
      const x = roadX + rng() * roadW;
      const y = rng() * TH;
      ctx.globalAlpha = 0.03 + rng() * 0.06;
      ctx.fillStyle = rng() < 0.5 ? '#0c0e0a' : '#7b8068';
      ctx.fillRect(x, y, 1 + rng(), 1 + rng());
    }
    ctx.globalAlpha = 1;

    // Reifenspuren: periodische Sinuskurven (sin(2π·y/TH) → nahtlos)
    ctx.strokeStyle = 'rgba(10,12,8,0.22)';
    ctx.lineWidth = 4;
    const tracks = [roadX + 50, roadX + roadW - 50];
    for (let t = 0; t < tracks.length; t++) {
      ctx.beginPath();
      for (let y = 0; y <= TH; y += 4) {
        const x = tracks[t] + 1.5 * Math.sin((2 * Math.PI * y) / TH);
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Gestrichelte Mittellinie (Periode 64 → 8 Striche je Kachel, nahtlos)
    ctx.setLineDash([28, 36]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,184,64,0.32)';
    ctx.beginPath();
    ctx.moveTo(roadX + roadW / 2, 0);
    ctx.lineTo(roadX + roadW / 2, TH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Risse auf Straße und Rand
    ctx.strokeStyle = 'rgba(8,9,6,0.55)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 16; i++) {
      let x = rng() < 0.5 ? rng() * 50 + 4 : 306 + rng() * 50;
      if (i % 3 === 0) x = roadX + 20 + rng() * (roadW - 40);
      let y = rng() * TH;
      const segs = 5 + Math.floor(rng() * 5);
      for (let o = 0; o < offs.length; o++) {
        ctx.beginPath();
        ctx.moveTo(x, y + offs[o]);
        let cx = x;
        let cy = y;
        for (let s = 0; s < segs; s++) {
          cx += (rng() - 0.5) * 9;
          cy += 3 + rng() * 6;
          ctx.lineTo(cx, cy + offs[o]);
        }
        ctx.stroke();
      }
    }

    // Sandsäcke an beiden Rändern
    for (let i = 0; i < 46; i++) {
      const left = rng() < 0.5;
      const x = left ? 3 + rng() * 40 : 317 + rng() * 40;
      const y = rng() * TH;
      const shade = rng() < 0.5 ? '#6b6a4e' : '#5a5a40';
      for (let o = 0; o < offs.length; o++) {
        const yy = y + offs[o];
        rr(ctx, x, yy, 14, 7, 3);
        ctx.fillStyle = shade;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,230,0.08)';
        ctx.fillRect(x + 2, yy + 1, 10, 1);
      }
    }

    // Betonblöcke an den Rändern
    for (let i = 0; i < 9; i++) {
      const left = rng() < 0.5;
      const x = left ? 6 + rng() * 34 : 320 + rng() * 26;
      const y = rng() * TH;
      for (let o = 0; o < offs.length; o++) {
        const yy = y + offs[o];
        ctx.fillStyle = '#3e403a';
        ctx.fillRect(x, yy + 3, 16, 12);
        ctx.fillStyle = '#5d5f58';
        ctx.fillRect(x, yy, 16, 11);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x + 7, yy, 1, 11);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Zeichnet den Boden über die volle Weltfläche (W×H). scrollPos in Welteinheiten.
  // Der Aufrufer setzt die Welt-Transformation; die Vignette nutzt Weltkoordinaten.
  draw(ctx, W, H, scrollPos) {
    const off = ((scrollPos % TH) + TH) % TH;
    for (let y = -off; y < H; y += TH) {
      ctx.drawImage(this.tile, 0, y, W, TH);
    }

    // Vignette (Gradient nur bei Größenwechsel neu erzeugen)
    if (!this._vig || W !== this._vigW || H !== this._vigH) {
      const cx = W / 2;
      const cy = H / 2;
      const g = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
      this._vig = g;
      this._vigW = W;
      this._vigH = H;
    }
    ctx.fillStyle = this._vig;
    ctx.fillRect(0, 0, W, H);
  }
}

// Rechteck-Pfad mit Eckenradius (nur Pfad; Füllung macht der Aufrufer).
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
