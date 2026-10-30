// Erzeugt die Felsen- und Busch-Bilder der isometrischen Ansicht (assets/iso/rocks/rock-a|b|c|d.png, assets/iso/bushes/bush-a|b|c.png).
// Eigene Grafik (gemalt mit Canvas, Zufall fest gesetzt), keine fremden Ressourcen. Aufruf: node tools/gen-rocks.mjs
// Licht kommt von links oben (wie bei den Bäumen); Felsen grau mit Kanten, Büsche grün (damit season.js Herbst/Winter einfärben kann).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../assets/iso/', import.meta.url));

const page = await (await chromium.launch()).newPage();
const results = await page.evaluate(() => {
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  }
  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  // ---------- Felsen ----------
  const RW = 128;
  const RH = 104;
  /** Felsbrocken: unregelmäßige Kuppe, Flächen nach Lichtrichtung hell/dunkel, Risse, Körnung, Moos an der Unterkante. */
  function boulder(ctx, rnd, cx, base, rx, ry, tone) {
    const N = 11;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = Math.PI + (i / N) * Math.PI; // linker Fuß über die Kuppe zum rechten Fuß
      const k = 0.8 + rnd() * 0.25;
      pts.push({ x: cx + Math.cos(a) * rx * k, y: base + Math.sin(a) * ry * k * (i === 0 || i === N ? 0.15 : 1) });
    }
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.quadraticCurveTo(cx, base + ry * 0.28, pts[0].x, pts[0].y);
      ctx.closePath();
    };
    const g = ctx.createLinearGradient(cx - rx, base - ry, cx + rx * 0.9, base + ry * 0.2);
    g.addColorStop(0, tone[0]);
    g.addColorStop(0.5, tone[1]);
    g.addColorStop(1, tone[2]);
    outline();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    outline();
    ctx.clip();
    // Flächen: Dreiecke vom Scheitel zu den Umrisspunkten, links hell, rechts dunkel
    const top = { x: cx - rx * 0.12 + (rnd() - 0.5) * rx * 0.2, y: base - ry * 0.78 };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const lit = -((a.x + b.x) / 2 - cx) / rx;
      ctx.fillStyle = lit > 0 ? `rgba(255,252,240,${0.05 + lit * 0.2 + rnd() * 0.05})` : `rgba(20,22,30,${0.06 - lit * 0.26 + rnd() * 0.05})`;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,26,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
    }
    // kleine Bruchflächen
    for (let i = 0; i < 6; i++) {
      const x = cx + (rnd() - 0.5) * rx * 1.5;
      const y = base - ry * (0.15 + rnd() * 0.55);
      const s = 5 + rnd() * 10;
      ctx.fillStyle = (cx - x) / rx > 0 ? 'rgba(255,255,245,0.12)' : 'rgba(10,10,20,0.14)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + s, y + s * 0.3);
      ctx.lineTo(x + s * 0.4, y + s * 0.9);
      ctx.closePath();
      ctx.fill();
    }
    // Risse
    ctx.strokeStyle = 'rgba(15,15,20,0.45)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      let x = cx + (rnd() - 0.5) * rx * 1.2;
      let y = base - ry * (0.2 + rnd() * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += (rnd() - 0.4) * 8;
        y += 3 + rnd() * 6;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Körnung
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(cx + (rnd() - 0.5) * rx * 2, base - rnd() * ry, 1 + rnd() * 1.5, 1 + rnd());
    }
    // Moos: matte grüne Flecken nahe am Boden
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `rgba(86,112,52,${0.25 + rnd() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(cx + (rnd() - 0.2) * rx * 1.6, base - rnd() * ry * 0.3, 4 + rnd() * 6, 2 + rnd() * 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    outline();
    ctx.strokeStyle = 'rgba(16,16,22,0.55)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  const TONES = [
    ['#b4b4ac', '#8a8a84', '#55555a'],
    ['#bdb7a8', '#8f8a7c', '#5a564f'],
    ['#a9adb0', '#7f8589', '#4c5258'],
  ];
  function rockImage(seed, kind) {
    const rnd = rng(seed);
    const c = mk(RW, RH);
    const ctx = c.getContext('2d');
    const cx = RW / 2;
    const base = RH - 12;
    const sh = ctx.createRadialGradient(cx + 6, base + 3, 4, cx + 6, base + 3, 54);
    sh.addColorStop(0, 'rgba(0,0,0,0.38)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(cx + 6, base + 3, 54, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    const tone = TONES[kind % TONES.length];
    if (kind === 0) {
      boulder(ctx, rnd, cx, base, 44, 56, tone); // einzelner Block
    } else if (kind === 1) {
      boulder(ctx, rnd, cx + 4, base, 54, 40, tone); // breit und flach, mit kleinem Begleiter
      boulder(ctx, rnd, cx - 38, base + 2, 22, 22, TONES[0]);
    } else if (kind === 2) {
      boulder(ctx, rnd, cx - 8, base - 4, 38, 54, tone); // großer Block mit zwei kleinen davor
      boulder(ctx, rnd, cx + 30, base + 2, 24, 26, TONES[1]);
      boulder(ctx, rnd, cx - 36, base + 4, 18, 18, TONES[2]);
    } else {
      boulder(ctx, rnd, cx - 20, base, 34, 44, tone); // zwei mittlere Brocken
      boulder(ctx, rnd, cx + 26, base + 2, 30, 36, TONES[1]);
    }
    return c;
  }

  // ---------- Büsche ----------
  const BW = 72;
  const BH = 56;
  function blob(ctx, rnd, x, y, r, tone) {
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, tone[0]);
    g.addColorStop(0.5, tone[1]);
    g.addColorStop(1, tone[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    const n = Math.round(r * 1.2);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * r * 0.9;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      const lit = (px - x) * -0.5 + (py - y) * -0.8;
      ctx.fillStyle = lit > 0 ? `rgba(190,235,110,${0.12 + rnd() * 0.18})` : `rgba(10,50,20,${0.12 + rnd() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(px, py, 1.6 + rnd() * 2.2, 1.1 + rnd() * 1.5, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function bushImage(seed, kind) {
    const rnd = rng(seed);
    const c = mk(BW, BH);
    const ctx = c.getContext('2d');
    const cx = BW / 2;
    const base = BH - 6;
    const dark = ['#6a9e3a', '#3c7a2c', '#1d4a1e'];
    const mid = ['#a8d85a', '#5fa535', '#2c6a28'];
    const high = ['#c4e870', '#78b840', '#3a8030'];
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx + 2, base + 1, 28, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const blobs = [];
    const count = kind === 1 ? 7 : 5;
    const spreadX = kind === 1 ? 26 : 18;
    const hgt = kind === 2 ? 30 : 20;
    for (let i = 0; i < count; i++) {
      blobs.push({ x: cx + (i / (count - 1) - 0.5) * 2 * spreadX + (rnd() - 0.5) * 4, y: base - 7 - rnd() * 5, r: 9 + rnd() * 4, t: dark });
    }
    for (let i = 0; i < count - 1; i++) {
      blobs.push({ x: cx + (rnd() - 0.5) * spreadX * 1.3, y: base - hgt * (0.45 + rnd() * 0.3), r: 9 + rnd() * 4, t: mid });
    }
    blobs.push({ x: cx - 4 + rnd() * 6, y: base - hgt * 0.95, r: 8 + rnd() * 3, t: high });
    blobs.sort((p, q) => p.y - q.y);
    for (const b of blobs) blob(ctx, rnd, b.x, b.y, b.r, b.t);
    return c;
  }

  return {
    rocks: [0, 1, 2, 3].map((k) => rockImage(101 + k * 17, k).toDataURL('image/png')),
    bushes: [0, 1, 2].map((k) => bushImage(7 + k * 13, k).toDataURL('image/png')),
  };
});
const save = (file, url) => writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
mkdirSync(`${ROOT}rocks`, { recursive: true });
mkdirSync(`${ROOT}bushes`, { recursive: true });
['a', 'b', 'c', 'd'].forEach((n, i) => save(`${ROOT}rocks/rock-${n}.png`, results.rocks[i]));
['a', 'b', 'c'].forEach((n, i) => save(`${ROOT}bushes/bush-${n}.png`, results.bushes[i]));
await page.context().browser().close();
