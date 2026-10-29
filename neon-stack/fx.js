// Neon Stack – Effekte: Nachtstadt-Hintergrund (vorgerendert), Regen, Flugautos, Partikel.
(function () {
  'use strict';

  // deterministischer Zufall für den Hintergrund, damit er bei jedem Resize gleich aussieht
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const NEON = ['#00f0ff', '#ff2fd0', '#fcee09', '#ff003c', '#3dff8b', '#ff9a1f'];

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  let W = 0, H = 0, D = 1, BD = 1; // BD: Auflösung des Hintergrunds (bewusst niedrig, spart Leistung)
  let sky = null, layers = [], signs = [], vignette = null, scan = null, plain = null;
  let cars = [], drops = [];
  const SPEEDS = [5, 11, 22];

  // ---- Himmel mit Mond/Sonne ----
  function buildSky() {
    const c = mk(W * BD, H * BD);
    const x = c.getContext('2d');
    x.scale(BD, BD);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#04010d');
    g.addColorStop(0.45, '#12052b');
    g.addColorStop(0.72, '#3a0a4a');
    g.addColorStop(0.9, '#8a1450');
    g.addColorStop(1, '#ff4a5e');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // große Sonne mit Streifen
    const r = Math.min(W, H) * 0.26;
    const cx = W * 0.7, cy = H * 0.5;
    const sg = x.createLinearGradient(0, cy - r, 0, cy + r);
    sg.addColorStop(0, '#fcee09');
    sg.addColorStop(0.5, '#ff7a2f');
    sg.addColorStop(1, '#ff2fd0');
    x.save();
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.clip();
    x.globalAlpha = 0.55;
    x.fillStyle = sg;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const yy = cy + r * (-0.1 + i * 0.12);
      x.fillRect(cx - r, yy, r * 2, (i + 1) * 1.1);
    }
    x.restore();
    // ferne Sterne
    const rnd = rng(11);
    x.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) {
      x.globalAlpha = 0.15 + rnd() * 0.45;
      x.fillRect(rnd() * W, rnd() * H * 0.5, 1, 1);
    }
    x.globalAlpha = 1;
    return c;
  }

  // ---- Häuserzeile: Breite exakt W, damit sie nahtlos kachelt ----
  function buildLayer(idx, seed) {
    const c = mk(W * BD, H * BD);
    const x = c.getContext('2d');
    x.scale(BD, BD);
    const rnd = rng(seed);
    const cfg = [
      { body: '#160a2c', hMin: 0.22, hMax: 0.5, wMin: 28, wMax: 70, win: 0.13, edge: false },
      { body: '#0d0620', hMin: 0.26, hMax: 0.62, wMin: 34, wMax: 90, win: 0.28, edge: true },
      { body: '#050310', hMin: 0.3, hMax: 0.72, wMin: 44, wMax: 120, win: 0.55, edge: true },
    ][idx];
    const baseY = H;
    const firstH = H * (cfg.hMin + rnd() * (cfg.hMax - cfg.hMin));
    let px = 0;
    const list = [];
    while (px < W) {
      let bw = cfg.wMin + rnd() * (cfg.wMax - cfg.wMin);
      let bh = H * (cfg.hMin + rnd() * (cfg.hMax - cfg.hMin));
      if (px + bw > W - cfg.wMin * 0.6) { bw = W - px; bh = firstH; }
      list.push({ x: px, w: bw, h: bh });
      px += bw;
    }
    for (const b of list) {
      x.fillStyle = cfg.body;
      x.fillRect(b.x, baseY - b.h, b.w + 0.5, b.h);
      // Antenne
      if (rnd() < 0.35) {
        x.fillRect(b.x + b.w * (0.3 + rnd() * 0.4), baseY - b.h - 10 - rnd() * 24, 1.5, 40);
      }
      // Kante mit Neonlicht
      if (cfg.edge && rnd() < 0.6) {
        const col = NEON[Math.floor(rnd() * 3)];
        x.fillStyle = col;
        x.globalAlpha = idx === 2 ? 0.8 : 0.45;
        x.fillRect(b.x, baseY - b.h, b.w, 1.2);
        x.globalAlpha = 1;
      }
      // Fenster
      const step = idx === 2 ? 9 : idx === 1 ? 7 : 5;
      const ws = idx === 2 ? 3.5 : idx === 1 ? 2.5 : 1.6;
      for (let wy = baseY - b.h + 8; wy < baseY - 6; wy += step) {
        for (let wx = b.x + 5; wx < b.x + b.w - 5; wx += step) {
          if (rnd() < cfg.win) {
            const col = rnd() < 0.55 ? '#fcee09' : rnd() < 0.5 ? '#00f0ff' : '#ff2fd0';
            x.fillStyle = col;
            x.globalAlpha = 0.25 + rnd() * 0.6;
            x.fillRect(wx, wy, ws, ws * 1.4);
          }
        }
      }
      x.globalAlpha = 1;
      // senkrechtes Neonschild an manchen Häusern der vorderen Ebenen
      if (idx >= 1 && b.w > 50 && rnd() < 0.4) {
        const col = NEON[Math.floor(rnd() * NEON.length)];
        const sw = 5, sh = 30 + rnd() * 60;
        const sx = b.x + b.w - 10, sy = baseY - b.h + 20 + rnd() * (b.h * 0.3);
        x.shadowColor = col;
        x.shadowBlur = 10;
        x.fillStyle = col;
        x.globalAlpha = 0.9;
        x.fillRect(sx, sy, sw, sh);
        x.shadowBlur = 0;
        x.globalAlpha = 1;
      }
    }
    return c;
  }

  function buildSign(text, color, w, h) {
    const c = mk((w + 24) * D, (h + 24) * D);
    const x = c.getContext('2d');
    x.scale(D, D);
    x.translate(12, 12);
    x.shadowColor = color;
    x.shadowBlur = 14;
    x.strokeStyle = color;
    x.lineWidth = 2;
    x.strokeRect(1, 1, w - 2, h - 2);
    x.font = `700 ${Math.floor(h * 0.6)}px "Rajdhani","Bahnschrift","Roboto Condensed","Arial Narrow",system-ui,sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = color;
    x.fillText(text, w / 2, h / 2 + 1);
    x.fillText(text, w / 2, h / 2 + 1);
    return { cv: c, w: w + 24, h: h + 24 };
  }

  function buildOverlays() {
    // Vignette
    vignette = mk(W * BD, H * BD);
    let x = vignette.getContext('2d');
    x.scale(BD, BD);
    const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.62)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // Scanlines (Kachel)
    scan = mk(4 * D, 3 * D);
    x = scan.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.fillRect(0, 2 * D, 4 * D, 1 * D);
    // Klassik-Hintergrund: ruhiges dunkles Gitter
    plain = mk(W * BD, H * BD);
    x = plain.getContext('2d');
    x.scale(BD, BD);
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b0b12');
    bg.addColorStop(1, '#14141c');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(252,238,9,0.035)';
    x.lineWidth = 1;
    x.beginPath();
    for (let i = -H; i < W; i += 28) {
      x.moveTo(i, H);
      x.lineTo(i + H, 0);
    }
    x.stroke();
  }

  function resize(w, h, dpr) {
    W = w; H = h; D = dpr; BD = Math.min(dpr, 1.25);
    cache = null; cacheAcc = 1;
    sky = buildSky();
    layers = [buildLayer(0, 21), buildLayer(1, 33), buildLayer(2, 47)];
    signs = [
      Object.assign(buildSign('RAMEN', '#ff2fd0', 78, 26), { fx: 0.12, fy: 0.46, layer: 1, ph: 0 }),
      Object.assign(buildSign('CYBER DOC', '#00f0ff', 96, 24), { fx: 0.52, fy: 0.58, layer: 2, ph: 2 }),
      Object.assign(buildSign('24H', '#fcee09', 52, 24), { fx: 0.82, fy: 0.4, layer: 1, ph: 4 }),
      Object.assign(buildSign('NET-RUN', '#ff003c', 84, 24), { fx: 0.3, fy: 0.7, layer: 2, ph: 6 }),
    ];
    buildOverlays();
    const rnd = rng(5);
    cars = Array.from({ length: 7 }, () => ({
      x: rnd() * W, y: H * (0.18 + rnd() * 0.45), v: (rnd() < 0.5 ? -1 : 1) * (30 + rnd() * 70),
      s: 0.5 + rnd() * 1.1, c: rnd() < 0.5 ? '#ffd9a0' : '#ff3050',
    }));
    drops = Array.from({ length: Math.round(Math.min(160, W * H / 3500)) }, () => ({
      x: rnd() * W, y: rnd() * H, l: 8 + rnd() * 16, v: 520 + rnd() * 420,
    }));
  }

  // ---- Hintergrund zeichnen ----
  // Die Stadt ist langsam – sie wird nur ~15× pro Sekunde in einen Zwischenspeicher gemalt und pro Bild einmal kopiert.
  let cache = null, cacheCtx = null, cacheAcc = 1;
  function paintCity(ctx, t, dt) {
    ctx.drawImage(sky, 0, 0, W, H);
    for (let i = 0; i < 3; i++) {
      const off = (t * SPEEDS[i]) % W;
      ctx.drawImage(layers[i], -off, 0, W, H);
      ctx.drawImage(layers[i], W - off, 0, W, H);
      // Schilder dieser Ebene (flackernd) – bewegen sich mit der Ebene mit
      for (const s of signs) {
        if (s.layer !== i) continue;
        let sx = s.fx * W - off;
        if (sx < -s.w) sx += W;
        const flick = 0.7 + 0.3 * Math.sin(t * 7 + s.ph) * (Math.sin(t * 1.3 + s.ph) > 0.8 ? 0.2 : 1);
        ctx.globalAlpha = Math.max(0.25, flick) * 0.9;
        ctx.drawImage(s.cv, sx, s.fy * H, s.w, s.h);
      }
      ctx.globalAlpha = 1;
      if (i === 0) drawCars(ctx, t, dt, 0.5);
      if (i === 1) drawCars(ctx, t, dt, 1);
    }
    // Bodennebel
    const g = ctx.createLinearGradient(0, H * 0.7, 0, H);
    g.addColorStop(0, 'rgba(255,47,208,0)');
    g.addColorStop(1, 'rgba(255,47,208,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.7, W, H * 0.3);
  }

  function drawCity(ctx, t, dt) {
    cacheAcc += dt;
    if (cacheAcc >= 0.066) {
      if (!cache || cache.width !== Math.round(W * BD)) {
        cache = mk(W * BD, H * BD);
        cacheCtx = cache.getContext('2d', { alpha: false });
      }
      cacheCtx.setTransform(BD, 0, 0, BD, 0, 0);
      paintCity(cacheCtx, t, cacheAcc);
      cacheAcc = 0;
    }
    if (cache) ctx.drawImage(cache, 0, 0, W, H);
    drawRain(ctx, dt);
  }

  function drawCars(ctx, t, dt, depth) {
    ctx.globalCompositeOperation = 'lighter';
    for (const c of cars) {
      if ((c.s > 0.95) !== (depth === 1)) continue;
      c.x += c.v * dt;
      if (c.x > W + 40) c.x = -40;
      if (c.x < -40) c.x = W + 40;
      const dir = Math.sign(c.v);
      const len = 16 + c.s * 20;
      const g = ctx.createLinearGradient(c.x, 0, c.x - dir * len, 0);
      g.addColorStop(0, c.c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(c.x, c.x - dir * len), c.y, len, 1.6 * c.s + 0.6);
      ctx.fillStyle = '#fff';
      ctx.fillRect(c.x - 1, c.y - 0.2, 2, 2 * c.s);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawRain(ctx, dt) {
    ctx.strokeStyle = 'rgba(170,205,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of drops) {
      d.y += d.v * dt;
      d.x -= d.v * dt * 0.12;
      if (d.y > H) { d.y = -d.l; d.x = Math.random() * (W + 60); }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.l * 0.12, d.y - d.l);
    }
    ctx.stroke();
  }

  function drawPlain(ctx) { ctx.drawImage(plain, 0, 0, W, H); }

  function drawOverlay(ctx, strength) {
    ctx.drawImage(vignette, 0, 0, W, H);
    const p = ctx.createPattern(scan, 'repeat');
    if (p) {
      ctx.save();
      ctx.scale(1 / D, 1 / D);
      ctx.globalAlpha = strength;
      ctx.fillStyle = p;
      ctx.fillRect(0, 0, W * D, H * D);
      ctx.restore();
    }
  }

  // ---- Partikel ----
  const parts = [];
  const MAX_PARTS = 420;
  function spark(x, y, color, n, power, up) {
    for (let i = 0; i < n && parts.length < MAX_PARTS; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.25 + Math.random()) * power;
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (up || 0),
        life: 0, max: 0.45 + Math.random() * 0.55, s: 1.5 + Math.random() * 2.5, c: color, g: 600,
      });
    }
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  function drawParts(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  function clearParts() { parts.length = 0; }

  window.NeonFx = { resize, drawCity, drawPlain, drawOverlay, spark, updateParts, drawParts, clearParts, NEON };
})();
