// Neon Stack – Darstellung, Eingabe und Ablauf. Spielregeln stehen in logic.js, Ton in audio.js, Hintergrund in fx.js.
// Zwei Modi: "classic" (reines Tetris im Cyber-Look) und "neon" (Regen, Glitch, Partikel, Schüttelei, Synthwave).
(() => {
  'use strict';
  const L = window.NeonLogic;
  const A = window.NeonAudio;
  const FX = window.NeonFx;
  const COLS = L.COLS, VIS = L.VISIBLE, HID = L.HIDDEN;
  const FONT = '"Rajdhani","Bahnschrift","Barlow Condensed","Roboto Condensed","Arial Narrow",system-ui,sans-serif';
  const COLORS = ['#000000', '#00f0ff', '#fcee09', '#ff2fd0', '#3dff8b', '#ff1744', '#3d7bff', '#ff9a1f', '#5b5870'];
  const TYPE_COLOR = {};
  L.TYPES.forEach((t) => { TYPE_COLOR[t] = COLORS[L.ID[t]]; });
  const YELLOW = '#fcee09', CYAN = '#00f0ff', RED = '#ff003c', PINK = '#ff2fd0';
  const DAS = 150, ARR = 42, SOFT_FIRST = 70, SOFT_REPEAT = 34;
  const KEY = 'neonstack-';

  // ---------- Speicher ----------
  function load(k, d) {
    try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  }
  function store(k, v) {
    try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* privat/voll */ }
  }
  function drop(k) {
    try { localStorage.removeItem(KEY + k); } catch (e) { /* egal */ }
  }
  const settings = Object.assign({ sound: true, music: true, vibrate: true }, load('settings', {}));
  const best = Object.assign({ classic: 0, neon: 0 }, load('best', {}));

  // ---------- Elemente ----------
  const $ = (s) => document.querySelector(s);
  const cv = $('#stage');
  const ctx = cv.getContext('2d', { alpha: false });
  const padEl = $('#pad');
  const pauseBtn = $('#btn-pause');
  const menuEl = $('#menu'), pauseEl = $('#pause'), overEl = $('#over');

  // ---------- Zustand ----------
  let scene = 'menu'; // menu | play | pause | over
  let mode = 'classic';
  let fancy = false;
  let game = null;
  let countdown = 0;
  let lastCountTick = -1;
  let overAt = 0;
  let time = 0;
  let W = 0, H = 0, D = 1;
  let lay = null;
  let dispScore = 0;
  let shakeAmp = 0, shakeT = 0, glitch = 0;
  const flashes = [], banners = [], pops = [], trails = [];
  const sprites = new Map();

  // ---------- Layout ----------
  function safeInsets() {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;visibility:hidden;left:0;top:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(p);
    const cs = getComputedStyle(p);
    const r = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    p.remove();
    return r;
  }

  function computeLayout() {
    const s = safeInsets();
    const b = Math.min(W * 0.155, H * 0.22, 92);
    const br = Math.min(W * 0.195, H * 0.27, 108);
    const padH = Math.max(b, br) + 14 + s.b;
    const mx = Math.max(12, s.l, s.r);
    const portrait = W <= H * 1.05;
    const l = { portrait, padH };
    if (portrait) {
      const top = s.t + 8;
      const hudH = Math.round(Math.min(Math.max(H * 0.085, 60), 88));
      const gap = 8;
      const availTop = top + hudH + gap;
      const availBot = H - padH - 8;
      const cell = Math.max(8, Math.floor(Math.min((W - 2 * mx) / COLS, (availBot - availTop) / VIS)));
      l.cell = cell;
      l.fx = Math.round((W - cell * COLS) / 2);
      l.fy = Math.round(availTop + Math.max(0, (availBot - availTop - cell * VIS) / 2));
      l.hold = { x: mx, y: top, w: hudH, h: hudH };
      const nw = Math.round(hudH * 1.95);
      l.next = { x: W - mx - nw, y: top, w: nw, h: hudH, vertical: false };
      const sx = l.hold.x + l.hold.w + gap;
      l.stats = { x: sx, y: top, w: l.next.x - gap - sx, h: hudH };
      l.pause = { x: l.stats.x + l.stats.w - 34, y: top + 2 };
    } else {
      const top = s.t + 8;
      const cell = Math.max(8, Math.floor((H - top - Math.max(8, s.b)) / VIS));
      l.cell = cell;
      l.fx = Math.round((W - cell * COLS) / 2);
      l.fy = Math.round(top + (H - top - Math.max(8, s.b) - cell * VIS) / 2);
      const side = Math.max(60, l.fx - mx - 10);
      const hs = Math.min(side, 120);
      l.hold = { x: l.fx - 10 - hs, y: l.fy, w: hs, h: hs };
      const sh = Math.max(70, Math.min(100, H - padH - l.fy - hs - 20));
      l.stats = { x: Math.max(mx, l.fx - 10 - side), y: l.fy + hs + 8, w: Math.min(side, hs + 40), h: sh };
      const nh = Math.min(cell * 11, H - padH - l.fy - 50);
      l.next = { x: l.fx + cell * COLS + 10, y: l.fy, w: Math.min(side, 120), h: Math.max(180, nh), vertical: true };
      l.pause = { x: l.next.x, y: l.fy + l.next.h + 8 };
    }
    return l;
  }

  function resize() {
    D = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * D);
    cv.height = Math.round(H * D);
    lay = computeLayout();
    sprites.clear();
    FX.resize(W, H, D);
    pauseBtn.style.left = lay.pause.x + 'px';
    pauseBtn.style.top = lay.pause.y + 'px';
    pauseBtn.style.right = 'auto';
  }

  // ---------- Farben & Sprites ----------
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return `rgb(${r},${g},${b})`;
  }

  // Zelle mit abgeschnittenen Ecken (oben rechts, unten links)
  function cellPath(g, x, y, s, inset, cut) {
    const i = inset;
    g.beginPath();
    g.moveTo(x + i, y + i);
    g.lineTo(x + s - i - cut, y + i);
    g.lineTo(x + s - i, y + i + cut);
    g.lineTo(x + s - i, y + s - i);
    g.lineTo(x + i + cut, y + s - i);
    g.lineTo(x + i, y + s - i - cut);
    g.closePath();
  }

  function makeSprite(color, size, fx) {
    const pad = fx ? Math.ceil(size * 0.5) : 0;
    const c = document.createElement('canvas');
    c.width = c.height = size + pad * 2;
    const g = c.getContext('2d');
    const cut = size * 0.24;
    const gap = Math.max(1, Math.round(size * 0.045));
    if (fx) {
      g.shadowColor = color;
      g.shadowBlur = size * 0.5;
      g.fillStyle = color;
      g.globalAlpha = 0.75;
      cellPath(g, pad, pad, size, gap, cut);
      g.fill();
      g.shadowBlur = 0;
      g.globalAlpha = 1;
    }
    const grad = g.createLinearGradient(pad, pad, pad + size, pad + size);
    if (fx) {
      grad.addColorStop(0, shade(color, 0.45));
      grad.addColorStop(0.45, color);
      grad.addColorStop(1, shade(color, -0.5));
    } else {
      grad.addColorStop(0, shade(color, 0.12));
      grad.addColorStop(1, shade(color, -0.25));
    }
    g.fillStyle = grad;
    cellPath(g, pad, pad, size, gap, cut);
    g.fill();
    // dunkles Innenfeld
    g.fillStyle = 'rgba(0,0,12,0.34)';
    cellPath(g, pad, pad, size, size * 0.24, cut * 0.4);
    g.fill();
    // Leiterbahn-Details
    g.strokeStyle = shade(color, 0.65);
    g.globalAlpha = 0.8;
    g.lineWidth = Math.max(1, size * 0.04);
    g.beginPath();
    g.moveTo(pad + size * 0.24, pad + size * 0.62);
    g.lineTo(pad + size * 0.42, pad + size * 0.62);
    g.lineTo(pad + size * 0.5, pad + size * 0.52);
    g.lineTo(pad + size * 0.76, pad + size * 0.52);
    g.stroke();
    g.fillStyle = shade(color, 0.8);
    g.fillRect(pad + size * 0.7, pad + size * 0.7, size * 0.07, size * 0.07);
    g.globalAlpha = 1;
    // Kante
    g.strokeStyle = shade(color, fx ? 0.75 : 0.5);
    g.lineWidth = Math.max(1, size * 0.05);
    g.globalAlpha = 0.9;
    cellPath(g, pad, pad, size, gap + g.lineWidth / 2, cut);
    g.stroke();
    g.globalAlpha = 1;
    return { cv: c, pad };
  }

  function sprite(id, cell, fx) {
    const size = Math.round(cell * D);
    const key = id + '|' + size + '|' + (fx ? 1 : 0);
    let s = sprites.get(key);
    if (!s) {
      s = makeSprite(COLORS[id] || COLORS[8], size, fx);
      sprites.set(key, s);
    }
    return s;
  }

  function blit(id, x, y, cell, alpha) {
    const s = sprite(id, cell, fancy);
    const p = s.pad / D;
    if (alpha != null && alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(s.cv, x - p, y - p, s.cv.width / D, s.cv.height / D);
    if (alpha != null && alpha !== 1) ctx.globalAlpha = 1;
  }

  // ---------- Zeichenhelfer ----------
  function chamferPath(x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + c);
    ctx.closePath();
  }

  function text(str, x, y, size, color, align, glow) {
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(size * 0.05) + 'px';
    if (glow && fancy) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  }

  function fitText(str, x, y, size, maxW, color, align, glow) {
    ctx.font = `700 ${size}px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(size * 0.05) + 'px';
    const w = ctx.measureText(str).width;
    if (w > maxW) size = Math.max(10, Math.floor(size * maxW / w));
    text(str, x, y, size, color, align, glow);
  }

  function panel(r, label, color) {
    chamferPath(r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = fancy ? 'rgba(8,6,18,0.62)' : 'rgba(10,10,18,0.9)';
    ctx.fill();
    ctx.strokeStyle = color || 'rgba(252,238,9,0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (label) text(label, r.x + 8, r.y + 14, 11, color || YELLOW, 'left');
  }

  const fmt = (n) => Math.round(n).toLocaleString('de-DE');

  // Teil mittig in ein Rechteck zeichnen
  function mini(type, r, s, alpha) {
    const shape = L.SHAPES[type][0];
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const [cx, cy] of shape) { x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy); }
    const w = (x1 - x0 + 1) * s, h = (y1 - y0 + 1) * s;
    const ox = r.x + (r.w - w) / 2, oy = r.y + (r.h - h) / 2;
    for (const [cx, cy] of shape) blit(L.ID[type], Math.round(ox + (cx - x0) * s), Math.round(oy + (cy - y0) * s), s, alpha);
  }

  // ---------- Zeichnen ----------
  function drawHud(t) {
    const g = game;
    // HOLD
    panel(lay.hold, 'HOLD', CYAN);
    if (g.hold) {
      const r = lay.hold;
      mini(g.hold, { x: r.x, y: r.y + 12, w: r.w, h: r.h - 12 }, Math.floor(r.h * 0.17), g.holdUsed ? 0.35 : 1);
    }
    // NEXT
    const n = lay.next;
    panel(n, 'NEXT', PINK);
    if (!n.vertical) {
      const big = Math.floor(n.h * 0.2), sm = Math.max(7, Math.floor(n.h * 0.135));
      const bw = Math.round(n.w * 0.52);
      mini(g.queue[0], { x: n.x, y: n.y + 12, w: bw, h: n.h - 12 }, big);
      const half = (n.h - 14) / 2;
      mini(g.queue[1], { x: n.x + bw, y: n.y + 14, w: n.w - bw, h: half }, sm, 0.85);
      mini(g.queue[2], { x: n.x + bw, y: n.y + 14 + half, w: n.w - bw, h: half }, sm, 0.7);
    } else {
      const slot = (n.h - 16) / 3;
      for (let i = 0; i < 3; i++) mini(g.queue[i], { x: n.x, y: n.y + 16 + i * slot, w: n.w, h: slot }, Math.floor(slot * 0.2) + 1, 1 - i * 0.18);
    }
    // Werte
    const s = lay.stats;
    const pw = s.w - 38;
    text('SCORE', s.x + 4, s.y + 13, 11, YELLOW, 'left');
    fitText(fmt(dispScore), s.x + 4, s.y + Math.round(s.h * 0.55), Math.round(s.h * 0.4), pw, '#ffffff', 'left', 10);
    const lv = String(g.level).padStart(2, '0');
    text('LEVEL', s.x + 4, s.y + s.h - 6, 11, CYAN, 'left');
    text(lv, s.x + 46, s.y + s.h - 5, 15, '#ffffff', 'left');
    text('LINES', s.x + 80, s.y + s.h - 6, 11, PINK, 'left');
    text(String(g.lines), s.x + 124, s.y + s.h - 5, 15, '#ffffff', 'left');
    // Combo / B2B Marker
    let mark = '';
    if (g.b2b) mark += 'B2B ';
    if (g.combo > 0) mark += 'COMBO ' + g.combo;
    if (mark) text(mark.trim(), s.x + 4, s.y + Math.round(s.h * 0.55) + 14, 11, YELLOW, 'left', 8);
  }

  function stackHeight(b) {
    for (let y = HID; y < L.ROWS; y++) if (b[y].some((v) => v)) return L.ROWS - y;
    return 0;
  }

  function drawField(t) {
    const g = game;
    const { fx, fy, cell } = lay;
    const fw = cell * COLS, fh = cell * VIS;
    const danger = stackHeight(g.board) >= 17;
    const beat = fancy ? A.beat() : 0;

    // Hintergrund & Gitter
    chamferPath(fx - 4, fy - 4, fw + 8, fh + 8, 14);
    ctx.fillStyle = fancy ? 'rgba(5,4,14,0.74)' : 'rgba(7,7,12,0.94)';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx, fy, fw, fh);
    ctx.clip();
    ctx.strokeStyle = fancy ? 'rgba(0,240,255,0.08)' : 'rgba(252,238,9,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < COLS; i++) { ctx.moveTo(fx + i * cell + 0.5, fy); ctx.lineTo(fx + i * cell + 0.5, fy + fh); }
    for (let j = 1; j < VIS; j++) { ctx.moveTo(fx, fy + j * cell + 0.5); ctx.lineTo(fx + fw, fy + j * cell + 0.5); }
    ctx.stroke();
    if (fancy) { // wandernder Lichtstreifen
      const sy = fy + ((t * 60) % (fh + 60)) - 30;
      const lg = ctx.createLinearGradient(0, sy - 30, 0, sy + 30);
      lg.addColorStop(0, 'rgba(0,240,255,0)');
      lg.addColorStop(0.5, 'rgba(0,240,255,0.06)');
      lg.addColorStop(1, 'rgba(0,240,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(fx, sy - 30, fw, 60);
    }

    // feste Blöcke
    for (let r = 0; r < VIS; r++) {
      const row = g.board[r + HID];
      for (let c = 0; c < COLS; c++) {
        const v = row[c];
        if (v) blit(v, fx + c * cell, fy + r * cell, cell);
      }
    }

    // Ghost + aktives Teil
    if (g.cur && !g.over) {
      const cur = g.cur;
      const gy = L.ghostY(g);
      const col = TYPE_COLOR[cur.type];
      if (gy !== cur.y) {
        const pulse = fancy ? 0.5 + 0.25 * Math.sin(t * 6) : 0.55;
        for (const [px, py] of L.cells(cur.type, cur.rot, cur.x, gy)) {
          const r = py - HID;
          if (r < 0) continue;
          const x = fx + px * cell, y = fy + r * cell;
          cellPath(ctx, x, y, cell, 2, cell * 0.24);
          ctx.fillStyle = col;
          ctx.globalAlpha = fancy ? 0.1 : 0.07;
          ctx.fill();
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = col;
          ctx.lineWidth = fancy ? 1.6 : 1.4;
          if (fancy) ctx.setLineDash([cell * 0.22, cell * 0.14]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }
      // sanfter Fall (nur im Neon-Modus)
      let yOff = 0;
      if (fancy && !L.grounded(g)) yOff = Math.min(1, g.gravAcc / L.gravityMs(g.level)) * cell * 0.9;
      const lockGlow = g.lockTimer > 0 && L.grounded(g) ? g.lockTimer / L.LOCK_DELAY : 0;
      for (const [px, py] of L.cells(cur.type, cur.rot, cur.x, cur.y)) {
        const r = py - HID;
        if (r < -1) continue;
        blit(L.ID[cur.type], fx + px * cell, fy + r * cell + yOff, cell, 1 - lockGlow * 0.35);
      }
    }

    // Hard-Drop-Spuren
    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i];
      const age = (t - tr.t0) / 0.28;
      if (age >= 1) { trails.splice(i, 1); continue; }
      const x = fx + tr.col * cell, y0 = fy + (tr.top - HID) * cell, y1 = fy + (tr.bottom - HID) * cell;
      const gr = ctx.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, tr.color);
      ctx.globalAlpha = (1 - age) * 0.7;
      ctx.fillStyle = gr;
      ctx.fillRect(x + cell * 0.1, y0, cell * 0.8, y1 - y0);
      ctx.globalAlpha = 1;
    }

    // Zeilen-Blitz
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const age = (t - f.t0) / f.dur;
      if (age >= 1) { flashes.splice(i, 1); continue; }
      const y = fy + f.row * cell;
      ctx.globalAlpha = (1 - age) * 0.95;
      ctx.fillStyle = '#ffffff';
      const hh = fancy ? cell * (1 - age * 0.6) : cell;
      ctx.fillRect(fx, y + (cell - hh) / 2, fw, hh);
      ctx.globalAlpha = 1;
    }

    if (fancy) FX.drawParts(ctx);
    ctx.restore();

    // Rahmen
    const pulse = fancy ? 0.55 + 0.45 * Math.max(beat, 0.2 + 0.2 * Math.sin(t * 2)) : 1;
    const frameCol = danger ? RED : fancy ? CYAN : YELLOW;
    chamferPath(fx - 4, fy - 4, fw + 8, fh + 8, 14);
    ctx.strokeStyle = frameCol;
    ctx.lineWidth = 2;
    if (fancy) {
      ctx.shadowColor = frameCol;
      ctx.shadowBlur = (danger ? 18 : 10) * pulse * (danger ? 0.7 + 0.3 * Math.sin(t * 12) : 1);
    }
    ctx.globalAlpha = danger && !fancy ? 0.6 + 0.4 * Math.sin(t * 8) : 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    // Eckmarken
    ctx.strokeStyle = fancy ? PINK : YELLOW;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(fx - 4, fy + 22); ctx.lineTo(fx - 4, fy + 8);
    ctx.moveTo(fx + fw + 4, fy + fh - 22); ctx.lineTo(fx + fw + 4, fy + fh - 8);
    ctx.stroke();
  }

  function drawFloaters(t) {
    const { fx, fy, cell } = lay;
    const fw = cell * COLS, fh = cell * VIS;
    // Banner (mittig im Feld)
    for (let i = banners.length - 1; i >= 0; i--) {
      const b = banners[i];
      const age = (t - b.t0) / b.dur;
      if (age >= 1) { banners.splice(i, 1); continue; }
    }
    let slot = 0;
    for (const b of banners) {
      const age = (t - b.t0) / b.dur;
      const ease = 1 - Math.pow(1 - Math.min(1, age * 5), 3);
      const alpha = age > 0.7 ? (1 - age) / 0.3 : 1;
      const size = Math.round(cell * (b.big ? 1.9 : 1.05) * (fancy ? 0.7 + 0.3 * ease : 1));
      const y = fy + fh * 0.32 + slot * cell * 1.5;
      slot += b.big ? 1.3 : 0.8;
      ctx.globalAlpha = Math.max(0, alpha);
      const cx = fx + fw / 2;
      if (fancy && (age < 0.25 || Math.random() < 0.06)) {
        ctx.globalCompositeOperation = 'lighter';
        text(b.text, cx - 3 - (1 - ease) * 10, y, size, RED, 'center');
        text(b.text, cx + 3 + (1 - ease) * 10, y, size, CYAN, 'center');
        ctx.globalCompositeOperation = 'source-over';
      }
      text(b.text, cx, y, size, b.color, 'center', 16);
      ctx.globalAlpha = 1;
    }
    // Punkte-Pops
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      const age = (t - p.t0) / 1.0;
      if (age >= 1) { pops.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - age;
      text(p.text, p.x, p.y - age * cell * 2, Math.round(cell * 0.8), p.color, 'center', 8);
      ctx.globalAlpha = 1;
    }
    // Countdown
    if (countdown > 0) {
      const n = Math.ceil(countdown / 600);
      const frac = (countdown % 600) / 600;
      ctx.globalAlpha = 0.4 + 0.6 * frac;
      text(String(Math.max(1, Math.min(3, n))), fx + fw / 2, fy + fh * 0.5, Math.round(cell * (3 + (1 - frac))), YELLOW, 'center', 24);
      ctx.globalAlpha = 1;
    }
  }

  function applyGlitch() {
    if (glitch <= 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const k = Math.min(1, glitch / 0.3);
    const n = 3 + Math.floor(k * 6);
    for (let i = 0; i < n; i++) {
      const sy = Math.floor(Math.random() * cv.height);
      const sh = Math.floor((4 + Math.random() * 38) * D);
      const off = Math.round((Math.random() - 0.5) * 60 * D * k);
      ctx.drawImage(cv, 0, sy, cv.width, sh, off, sy, cv.width, sh);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28 * k;
    ctx.drawImage(cv, -4 * D, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function render(dt) {
    ctx.setTransform(D, 0, 0, D, 0, 0);
    const attract = scene === 'menu';
    if (fancy || attract) FX.drawCity(ctx, time, dt);
    else FX.drawPlain(ctx);

    if (!attract && game) {
      ctx.save();
      if (shakeT > 0) ctx.translate((Math.random() - 0.5) * shakeAmp * shakeT * 3, (Math.random() - 0.5) * shakeAmp * shakeT * 3);
      drawHud(time);
      drawField(time);
      drawFloaters(time);
      ctx.restore();
    }
    if (fancy) applyGlitch();
  }

  // ---------- Eingabe ----------
  const held = { left: false, right: false, down: false };
  const rep = { left: 0, right: 0, down: 0 };
  let lastDir = null;
  const vib = (p) => { if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* ignorieren */ } } };

  function canPlay() { return scene === 'play' && countdown <= 0 && game && !game.over; }

  function press(act) {
    if (!canPlay()) return;
    A.resume();
    const now = performance.now();
    if (act === 'cw') { L.rotate(game, 1); vib(5); }
    else if (act === 'ccw') { L.rotate(game, -1); vib(5); }
    else if (act === 'left' || act === 'right') {
      held[act] = true;
      lastDir = act;
      L.move(game, act === 'left' ? -1 : 1);
      rep[act] = now + DAS;
    } else if (act === 'down') {
      held.down = true;
      L.softDrop(game);
      rep.down = now + SOFT_FIRST;
    }
    handleEvents();
  }

  function release(act) {
    if (act === 'left' || act === 'right') {
      held[act] = false;
      if (lastDir === act) lastDir = held.left ? 'left' : held.right ? 'right' : null;
    } else if (act === 'down') held.down = false;
  }
  function releaseAll() {
    held.left = held.right = held.down = false;
    lastDir = null;
    document.querySelectorAll('.pad-btn.on').forEach((b) => b.classList.remove('on'));
  }

  function repeatInput() {
    if (!canPlay()) return;
    const now = performance.now();
    const dir = lastDir && held[lastDir] ? lastDir : held.left ? 'left' : held.right ? 'right' : null;
    if (dir) {
      let n = 0;
      while (now >= rep[dir] && n++ < 6) {
        if (!L.move(game, dir === 'left' ? -1 : 1)) { rep[dir] = now + ARR; break; }
        rep[dir] += ARR;
      }
    }
    if (held.down) {
      let n = 0;
      while (now >= rep.down && n++ < 6) {
        L.softDrop(game);
        rep.down += SOFT_REPEAT;
      }
    }
  }

  padEl.querySelectorAll('.pad-btn').forEach((btn) => {
    const act = btn.dataset.act;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
      btn.classList.add('on');
      press(act);
    });
    const up = () => { btn.classList.remove('on'); release(act); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Wischgesten auf dem Spielfeld: runter = Sofort-Drop, hoch = Hold; Tippen aufs HOLD-Feld = Hold
  let swipe = null;
  cv.addEventListener('pointerdown', (e) => {
    if (scene !== 'play') return;
    A.resume();
    swipe = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  });
  cv.addEventListener('pointerup', (e) => {
    if (!swipe || swipe.id !== e.pointerId || !canPlay()) { swipe = null; return; }
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y, dt = performance.now() - swipe.t;
    swipe = null;
    const min = Math.max(48, lay.cell * 2);
    if (dt < 600 && Math.abs(dy) > min && Math.abs(dy) > Math.abs(dx) * 1.4) {
      if (dy > 0) { L.hardDrop(game); } else { L.holdPiece(game); }
      handleEvents();
    } else if (Math.hypot(dx, dy) < 14) {
      const h = lay.hold;
      if (e.clientX >= h.x && e.clientX <= h.x + h.w && e.clientY >= h.y && e.clientY <= h.y + h.h) {
        L.holdPiece(game);
        handleEvents();
      }
    }
  });
  cv.addEventListener('pointercancel', () => { swipe = null; });

  const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', KeyZ: 'ccw', KeyY: 'ccw', KeyX: 'cw', ArrowUp: 'cw' };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (scene === 'play') pauseGame(); else if (scene === 'pause') resumeGame();
      return;
    }
    if (scene !== 'play') return;
    if (e.code === 'Space') { e.preventDefault(); if (canPlay()) { L.hardDrop(game); handleEvents(); } return; }
    if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { if (canPlay()) { L.holdPiece(game); handleEvents(); } return; }
    const a = KEYMAP[e.code];
    if (a) { e.preventDefault(); press(a); }
  });
  window.addEventListener('keyup', (e) => {
    const a = KEYMAP[e.code];
    if (a) release(a);
  });

  // ---------- Ereignisse aus der Logik ----------
  const MESSAGES = { 1: 'SINGLE', 2: 'DOUBLE', 3: 'TRIPLE', 4: 'TETRIS' };
  let moveSfxAt = 0;

  function banner(textStr, color, big, dur) {
    banners.push({ text: textStr, color, big, t0: time, dur: dur || 1.3 });
    while (banners.length > 4) banners.shift();
  }

  function onLock(e) {
    const { fx, fy, cell } = lay;
    const col = TYPE_COLOR[e.type];
    // Spur beim Sofort-Drop
    if (e.hard && e.dist > 1 && fancy) {
      const cols = new Map();
      for (const [px, py] of e.cells) cols.set(px, Math.min(cols.has(px) ? cols.get(px) : 99, py));
      cols.forEach((bottom, c) => trails.push({ col: c, top: Math.max(HID, bottom - e.dist), bottom, t0: time, color: col }));
    }
    if (fancy) {
      for (const [px, py] of e.cells) {
        const r = py - HID;
        if (r < 0) continue;
        FX.spark(fx + (px + 0.5) * cell, fy + (r + 1) * cell, col, e.hard ? 3 : 1, 120, 60);
      }
      if (e.hard) { shakeAmp = Math.max(shakeAmp, 1.6 + Math.min(6, e.dist) * 0.25); shakeT = Math.max(shakeT, 0.18); }
    }

    if (e.lines > 0) {
      for (const y of e.rows) {
        const r = y - HID;
        if (r >= 0) flashes.push({ row: r, t0: time, dur: fancy ? 0.34 : 0.18 });
      }
      if (fancy) {
        e.rows.forEach((y, i) => {
          const r = y - HID;
          if (r < 0) return;
          for (let c = 0; c < COLS; c++) {
            const id = e.rowData[i][c];
            FX.spark(fx + (c + 0.5) * cell, fy + (r + 0.5) * cell, COLORS[id] || '#fff', e.lines >= 4 ? 4 : 2, 220 + e.lines * 40, 140);
          }
        });
        shakeAmp = Math.max(shakeAmp, 2 + e.lines * 1.4);
        shakeT = Math.max(shakeT, 0.25 + e.lines * 0.06);
        if (e.lines >= 4 || e.tspin === 'full') glitch = Math.max(glitch, 0.35);
      }
      const mid = e.rows.length ? fy + ((e.rows[e.rows.length - 1] - HID) * cell) : fy + lay.cell * 10;
      pops.push({ text: '+' + fmt(e.gain), x: fx + cell * COLS / 2, y: Math.max(fy + cell, mid), t0: time, color: '#ffffff' });

      let main = '';
      if (e.tspin === 'full') main = 'T-SPIN ' + (MESSAGES[e.lines] || '');
      else if (e.tspin === 'mini') main = 'MINI T-SPIN ' + (MESSAGES[e.lines] || '');
      else if (e.lines >= 4) main = 'TETRIS';
      else if (fancy || e.lines >= 3) main = MESSAGES[e.lines];
      if (main) banner(main.trim(), e.lines >= 4 ? YELLOW : e.tspin ? PINK : CYAN, true);
      if (e.b2b) banner('BACK-TO-BACK', YELLOW, false);
      if (e.combo >= 1) banner('COMBO ×' + e.combo, CYAN, false);
      if (e.perfect) { banner('PERFECT CLEAR', PINK, true, 1.8); if (fancy) glitch = 0.5; }

      if (e.perfect) A.sfx('perfect');
      else if (e.lines >= 4) A.sfx('tetris');
      else if (e.tspin) A.sfx('tspin');
      else A.sfx('clear', e.lines);
      if (e.combo >= 1) setTimeout(() => A.sfx('combo', e.combo), 160);
      vib(e.lines >= 4 ? [20, 30, 40] : [14]);
    } else {
      if (e.tspin) {
        banner(e.tspin === 'mini' ? 'MINI T-SPIN' : 'T-SPIN', PINK, false);
        A.sfx('tspin');
        if (e.gain) pops.push({ text: '+' + fmt(e.gain), x: fx + (e.x + 1.5) * cell, y: fy + (e.y - HID) * cell, t0: time, color: '#ffffff' });
      } else A.sfx(e.hard ? 'hard' : 'lock');
      vib(e.hard ? 12 : 8);
    }
    if (e.levelUp) {
      banner('LEVEL ' + e.level, YELLOW, true, 1.6);
      A.sfx('level');
      A.setLevel(e.level);
      if (fancy) glitch = Math.max(glitch, 0.4);
    }
    saveGame();
  }

  function handleEvents() {
    if (!game) return;
    for (const e of L.drainEvents(game)) {
      switch (e.t) {
        case 'move': {
          const now = performance.now();
          if (now - moveSfxAt > 40) { A.sfx('move'); moveSfxAt = now; }
          break;
        }
        case 'rotate': A.sfx('rotate'); break;
        case 'hold': A.sfx('hold'); break;
        case 'lock': onLock(e); break;
        case 'over': gameOver(); break;
        default: break;
      }
    }
  }

  // ---------- Ablauf ----------
  function saveGame() {
    if (!game || game.over) return;
    store('save', { mode, state: L.serialize(game), at: Date.now() });
  }

  function loadSave() {
    const s = load('save', null);
    if (!s || !s.state) return null;
    const g = L.deserialize(s.state);
    if (!g || g.over) return null;
    return { mode: s.mode === 'neon' ? 'neon' : 'classic', game: g };
  }

  function setFancy(on) {
    fancy = on;
    document.body.classList.toggle('fx', on);
    sprites.clear();
  }

  function startGame(m, saved) {
    mode = m;
    setFancy(m === 'neon');
    game = saved || L.createGame({});
    dispScore = game.score;
    flashes.length = banners.length = pops.length = trails.length = 0;
    FX.clearParts();
    shakeT = 0; glitch = 0;
    releaseAll();
    menuEl.hidden = true; pauseEl.hidden = true; overEl.hidden = true;
    padEl.hidden = false; pauseBtn.hidden = false;
    scene = 'play';
    countdown = 1800;
    lastCountTick = -1;
    A.sound = settings.sound; A.music = settings.music;
    A.resume();
    A.setLevel(game.level);
    if (fancy && settings.music) A.startMusic(game.level); else A.stopMusic();
    if (!saved) saveGame();
  }

  function pauseGame() {
    if (scene !== 'play') return;
    scene = 'pause';
    releaseAll();
    A.stopMusic();
    saveGame();
    syncToggles();
    pauseEl.hidden = false;
  }

  function resumeGame() {
    if (scene !== 'pause') return;
    pauseEl.hidden = true;
    scene = 'play';
    countdown = 1200;
    lastCountTick = -1;
    A.resume();
    if (fancy && settings.music) A.startMusic(game.level);
  }

  function toMenu() {
    scene = 'menu';
    releaseAll();
    A.stopMusic();
    pauseEl.hidden = true; overEl.hidden = true;
    padEl.hidden = true; pauseBtn.hidden = true;
    setFancy(false);
    refreshMenu();
    menuEl.hidden = false;
  }

  function gameOver() {
    if (scene === 'over') return;
    scene = 'over';
    releaseAll();
    A.stopMusic();
    A.sfx('over');
    vib([40, 40, 80]);
    if (fancy) { glitch = 1.2; shakeAmp = 6; shakeT = 0.6; }
    drop('save');
    const isBest = game.score > best[mode];
    if (isBest) { best[mode] = game.score; store('best', best); }
    overAt = performance.now() + (fancy ? 900 : 450);
    $('#o-score').textContent = fmt(game.score);
    $('#o-info').textContent = `${mode === 'neon' ? 'NEON-MODUS' : 'KLASSIK'} · LEVEL ${game.level} · ${game.lines} ZEILEN`;
    $('#o-best').hidden = !(isBest && game.score > 0);
  }

  function refreshMenu() {
    $('#best-classic').textContent = fmt(best.classic);
    $('#best-neon').textContent = fmt(best.neon);
    const s = loadSave();
    const b = $('#btn-resume');
    b.hidden = !s;
    if (s) $('#resume-info').textContent = `${s.mode === 'neon' ? 'Neon-Modus' : 'Klassik'} · Level ${s.game.level} · ${fmt(s.game.score)} Punkte`;
    syncToggles();
  }

  function syncToggles() {
    const set = (id, label, on) => {
      const el = $(id);
      if (!el) return;
      el.setAttribute('aria-pressed', String(on));
      el.innerHTML = `${label} <em>${on ? 'AN' : 'AUS'}</em>`;
    };
    set('#t-sound', 'TON', settings.sound);
    set('#t-music', 'MUSIK', settings.music);
    set('#t-vib', 'VIBRATION', settings.vibrate);
    set('#p-sound', 'TON', settings.sound);
    set('#p-music', 'MUSIK', settings.music);
  }

  function toggle(key) {
    settings[key] = !settings[key];
    store('settings', settings);
    A.sound = settings.sound; A.music = settings.music;
    if (key === 'music' && scene === 'pause') { /* wird beim Fortsetzen gestartet */ }
    if (key === 'vibrate' && settings.vibrate) vib(30);
    A.resume();
    A.sfx('click');
    syncToggles();
  }

  // Menü verdrahten
  $('#btn-classic').addEventListener('click', () => { A.resume(); A.sfx('click'); startGame('classic'); });
  $('#btn-neon').addEventListener('click', () => { A.resume(); A.sfx('click'); startGame('neon'); });
  $('#btn-resume').addEventListener('click', () => {
    const s = loadSave();
    A.resume();
    if (s) startGame(s.mode, s.game);
  });
  $('#t-sound').addEventListener('click', () => toggle('sound'));
  $('#t-music').addEventListener('click', () => toggle('music'));
  $('#t-vib').addEventListener('click', () => toggle('vibrate'));
  $('#p-sound').addEventListener('click', () => toggle('sound'));
  $('#p-music').addEventListener('click', () => toggle('music'));
  pauseBtn.addEventListener('click', () => { A.resume(); A.sfx('click'); pauseGame(); });
  $('#btn-continue').addEventListener('click', () => { A.sfx('click'); resumeGame(); });
  $('#btn-restart').addEventListener('click', () => { A.sfx('click'); startGame(mode); });
  $('#btn-tomenu').addEventListener('click', () => { A.sfx('click'); toMenu(); });
  $('#btn-again').addEventListener('click', () => { A.sfx('click'); startGame(mode); });
  $('#btn-over-menu').addEventListener('click', () => { A.sfx('click'); toMenu(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (scene === 'play') pauseGame();
      A.stopMusic();
    }
  });
  window.addEventListener('blur', () => { if (scene === 'play') pauseGame(); });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));

  // ---------- Hauptschleife ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    if (glitch > 0) glitch = Math.max(0, glitch - dt);

    if (scene === 'play' && game) {
      if (countdown > 0) {
        const before = Math.ceil(countdown / 600);
        countdown = Math.max(0, countdown - dt * 1000);
        const after = Math.ceil(countdown / 600);
        if (after !== before || lastCountTick < 0) {
          lastCountTick = after;
          if (countdown > 0) A.sfx('count'); else A.sfx('go');
        }
      } else {
        repeatInput();
        L.tick(game, dt * 1000);
        handleEvents();
      }
      dispScore += (game.score - dispScore) * Math.min(1, dt * (fancy ? 9 : 40));
      if (Math.abs(game.score - dispScore) < 1) dispScore = game.score;
    } else if (scene === 'over' && game) {
      dispScore = game.score;
      if (overAt && now >= overAt) { overAt = 0; overEl.hidden = false; }
    }
    if (fancy) FX.updateParts(dt);
    render(dt);
    requestAnimationFrame(frame);
  }

  // ---------- Start ----------
  document.body.classList.add('fx'); // Menü zeigt die Nachtstadt
  resize();
  refreshMenu();
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  // Für Tests
  window.__neon = { get game() { return game; }, get scene() { return scene; }, startGame, L, press, release, state: () => ({ scene, mode, countdown }) };
})();
