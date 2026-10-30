// Erzeugt die Baum-Bilder der isometrischen Standardansicht (assets/iso/trees/tree-a|b|c.png).
// Eigene Grafik (gemalt mit Canvas, Zufall fest gesetzt), keine fremden Ressourcen. Aufruf: node tools/gen-trees.mjs
// Licht kommt von links oben; Laub grün (damit season.js Herbst/Winter einfärben kann), Oberseiten hell (dort liegt Winterschnee).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../assets/iso/trees/', import.meta.url));
const W = 128;
const H = 160;

const page = await (await chromium.launch()).newPage();
const results = await page.evaluate(
  ({ W, H }) => {
    function rng(seed) {
      let s = seed >>> 0;
      return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    }
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    };
    function trunk(ctx, x, base, h, w, lean) {
      const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, '#6b4a2c');
      g.addColorStop(0.55, '#4d3320');
      g.addColorStop(1, '#33210f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - w * 1.5, base);
      ctx.quadraticCurveTo(x - w * 0.5, base - h * 0.3, x - w * 0.5 + lean, base - h);
      ctx.lineTo(x + w * 0.5 + lean, base - h);
      ctx.quadraticCurveTo(x + w * 0.5, base - h * 0.3, x + w * 1.5, base);
      ctx.closePath();
      ctx.fill();
    }
    // Eine Laubkugel: Verlauf von hell (links oben) nach dunkel (rechts unten), dazu kleine Blattflecken.
    function blob(ctx, rnd, x, y, r, tone) {
      const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
      const [l, m, d] = tone;
      g.addColorStop(0, l);
      g.addColorStop(0.5, m);
      g.addColorStop(1, d);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      const n = Math.round(r * 1.1);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const d2 = Math.sqrt(rnd()) * r * 0.92;
        const px = x + Math.cos(a) * d2;
        const py = y + Math.sin(a) * d2;
        const lit = (px - x) * -0.5 + (py - y) * -0.8; // links oben hell
        ctx.fillStyle = lit > 0 ? `rgba(190,235,110,${0.1 + rnd() * 0.18})` : `rgba(10,50,20,${0.12 + rnd() * 0.2})`;
        ctx.beginPath();
        ctx.ellipse(px, py, 2 + rnd() * 3.2, 1.5 + rnd() * 2.2, rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const TONES = [
      ['#a8d85a', '#5fa535', '#2c6a28'],
      ['#9cd05a', '#58a03a', '#26602a'],
      ['#b4dc62', '#68ac38', '#30722c'],
    ];
    // Laubbaum: Stamm, dahinter dunkle Kugeln, davor hellere, oben die hellste Kuppe
    function broadleaf(seed, tone, wide) {
      const rnd = rng(seed);
      const c = mk();
      const ctx = c.getContext('2d');
      const cx = W / 2;
      const base = H - 6;
      ctx.fillStyle = 'rgba(0,0,0,0)';
      trunk(ctx, cx, base, 58, 6, (rnd() - 0.5) * 4);
      const cy = 64;
      const dark = ['#6a9e3a', '#3c7a2c', '#1d4a1e'];
      const blobs = [];
      const ring = wide ? 9 : 7;
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * Math.PI * 2 + rnd() * 0.4;
        const rr = (wide ? 33 : 28) + rnd() * 6;
        blobs.push({ x: cx + Math.cos(a) * rr * 1.05, y: cy + Math.sin(a) * rr * 0.72 + 8, r: 19 + rnd() * 7, t: dark });
      }
      for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = 12 + rnd() * 18;
        blobs.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.6 + 2, r: 20 + rnd() * 7, t: tone });
      }
      blobs.push({ x: cx - 4 + rnd() * 6, y: cy - 20, r: 26 + rnd() * 4, t: tone });
      blobs.push({ x: cx - 12, y: cy - 10, r: 18, t: ['#c4e870', '#78b840', '#3a8030'] });
      blobs.sort((p, q) => p.y - q.y);
      for (const b of blobs) blob(ctx, rnd, b.x, b.y, b.r, b.t);
      return c;
    }
    // Fichte: mehrere Stockwerke aus gezackten Zweigfächern
    function spruce(seed) {
      const rnd = rng(seed);
      const c = mk();
      const ctx = c.getContext('2d');
      const cx = W / 2;
      const base = H - 6;
      trunk(ctx, cx, base, 36, 5, 0);
      const tiers = 6;
      for (let i = 0; i < tiers; i++) {
        const f = i / (tiers - 1);
        const yb = base - 22 - f * 92 + 22;
        const half = 40 - f * 30 + rnd() * 2;
        const hh = 34 - f * 8;
        const g = ctx.createLinearGradient(cx - half, yb - hh, cx + half, yb);
        g.addColorStop(0, '#6aa83e');
        g.addColorStop(0.5, '#3f7d30');
        g.addColorStop(1, '#1c4a22');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx, yb - hh);
        const steps = 7;
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          ctx.lineTo(cx + half * t * (k % 2 ? 1 : 0.88), yb - hh + hh * t * 0.92 + (k % 2 ? 0 : 3));
        }
        ctx.lineTo(cx + half, yb);
        ctx.quadraticCurveTo(cx, yb + 9, cx - half, yb);
        for (let k = steps; k >= 1; k--) {
          const t = k / steps;
          ctx.lineTo(cx - half * t * (k % 2 ? 1 : 0.88), yb - hh + hh * t * 0.92 + (k % 2 ? 0 : 3));
        }
        ctx.closePath();
        ctx.fill();
        // heller Streifen links oben
        ctx.fillStyle = 'rgba(190,235,120,0.28)';
        ctx.beginPath();
        ctx.moveTo(cx, yb - hh);
        ctx.lineTo(cx - half * 0.8, yb - 4);
        ctx.lineTo(cx - half * 0.35, yb - 6);
        ctx.closePath();
        ctx.fill();
      }
      return c;
    }
    return [broadleaf(11, TONES[0], false), broadleaf(23, TONES[1], true), spruce(5), broadleaf(37, TONES[2], false)].map((c) => c.toDataURL('image/png'));
  },
  { W, H },
);
['a', 'b', 'c', 'd'].forEach((n, i) => writeFileSync(`${OUT}tree-${n}.png`, Buffer.from(results[i].split(',')[1], 'base64')));
await page.context().browser().close();
