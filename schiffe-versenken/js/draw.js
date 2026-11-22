// Zeichnet Meer, Schiffe, Treffer und Effekte auf Canvas – alles aus einfachen Formen, keine Bilder.
const SIZE = 10;
const FLEET = [5, 4, 3, 3, 2];
const SHIP_NAMES = ['Flugzeugträger', 'Schlachtschiff', 'Kreuzer', 'U-Boot', 'Zerstörer'];
const LETTERS = 'ABCDEFGHIJ';

function cellsOf(s) {
  const out = [];
  for (let i = 0; i < s.len; i++) out.push([s.x + (s.dir === 'h' ? i : 0), s.y + (s.dir === 'v' ? i : 0)]);
  return out;
}
function rand(seed) { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/* ---------- Meer ---------- */
function drawSea(ctx, x, y, w, h, t, tint) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  if (tint === 'enemy') { g.addColorStop(0, '#0f4a72'); g.addColorStop(0.6, '#0a3456'); g.addColorStop(1, '#072640'); }
  else { g.addColorStop(0, '#0f5a78'); g.addColorStop(0.6, '#0b4262'); g.addColorStop(1, '#08304a'); }
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // langsam treibende Lichtflecken
  for (let i = 0; i < 4; i++) {
    const cx = x + (((i * 0.31 + t * 0.012 * (i % 2 ? 1 : -1)) % 1) + 1) % 1 * w;
    const cy = y + (0.2 + 0.6 * rand(i + 3)) * h + Math.sin(t * 0.3 + i) * h * 0.05;
    const r = w * (0.25 + 0.15 * rand(i + 9));
    const lg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    lg.addColorStop(0, 'rgba(90,190,230,0.13)'); lg.addColorStop(1, 'rgba(90,190,230,0)');
    ctx.fillStyle = lg; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  // Wellenlinien
  const rows = 16, step = Math.max(5, w / 60);
  ctx.lineWidth = Math.max(1, w / 360);
  for (let k = 0; k < rows; k++) {
    const y0 = y + (k + 0.5) * h / rows;
    ctx.strokeStyle = k % 3 === 0 ? 'rgba(200,240,255,0.13)' : 'rgba(150,215,245,0.07)';
    ctx.beginPath();
    for (let px = x - step; px <= x + w + step; px += step) {
      const py = y0 + Math.sin(px * 0.045 + t * 1.1 + k * 1.7) * h * 0.006 + Math.sin(px * 0.012 - t * 0.5 + k) * h * 0.01;
      if (px === x - step) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // kleine Schaumkronen
  ctx.fillStyle = 'rgba(230,250,255,0.18)';
  for (let i = 0; i < 18; i++) {
    const ph = ((t * 0.15 + rand(i)) % 1);
    const a = Math.sin(ph * Math.PI);
    const cx = x + rand(i + 50) * w + ph * w * 0.03, cy = y + rand(i + 80) * h;
    ctx.globalAlpha = a;
    ctx.fillRect(cx, cy, w * 0.018, Math.max(1, h * 0.0035));
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ---------- Schiffe ---------- */
function hullPath(ctx, x0, x1, hw, c, sub) {
  ctx.beginPath();
  if (sub) {
    ctx.moveTo(x0 + hw, -hw);
    ctx.lineTo(x1 - c * 0.6, -hw);
    ctx.quadraticCurveTo(x1, -hw * 0.9, x1, 0);
    ctx.quadraticCurveTo(x1, hw * 0.9, x1 - c * 0.6, hw);
    ctx.lineTo(x0 + hw, hw);
    ctx.arc(x0 + hw, 0, hw, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
    return;
  }
  const r = hw * 0.45;
  ctx.moveTo(x0 + r, -hw);
  ctx.lineTo(x1 - c * 0.9, -hw);
  ctx.quadraticCurveTo(x1 - c * 0.25, -hw * 0.95, x1, 0);
  ctx.quadraticCurveTo(x1 - c * 0.25, hw * 0.95, x1 - c * 0.9, hw);
  ctx.lineTo(x0 + r, hw);
  ctx.quadraticCurveTo(x0, hw, x0, hw - r);
  ctx.lineTo(x0, -hw + r);
  ctx.quadraticCurveTo(x0, -hw, x0 + r, -hw);
  ctx.closePath();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function turret(ctx, x, hw, facing, twin, sunk) {
  ctx.fillStyle = sunk ? '#3a3f44' : '#56636f';
  ctx.strokeStyle = '#1b232b';
  ctx.lineWidth = hw * 0.08;
  const bw = hw * 0.13, bl = hw * 1.25;
  const offs = twin ? [-hw * 0.16, hw * 0.16] : [0];
  for (const o of offs) {
    ctx.fillRect(facing > 0 ? x : x - bl, o - bw / 2, bl, bw);
    ctx.strokeRect(facing > 0 ? x : x - bl, o - bw / 2, bl, bw);
  }
  ctx.beginPath(); ctx.arc(x, 0, hw * 0.46, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.arc(x - hw * 0.12, -hw * 0.14, hw * 0.16, 0, Math.PI * 2); ctx.fill();
}
function bridge(ctx, xa, xb, hw, sunk) {
  roundRect(ctx, xa, -hw * 0.62, xb - xa, hw * 1.24, hw * 0.2);
  ctx.fillStyle = sunk ? '#5a5f63' : '#d5dde4'; ctx.fill();
  ctx.strokeStyle = '#1b232b'; ctx.lineWidth = hw * 0.08; ctx.stroke();
  roundRect(ctx, xa + (xb - xa) * 0.35, -hw * 0.4, (xb - xa) * 0.5, hw * 0.8, hw * 0.12);
  ctx.fillStyle = sunk ? '#4b5055' : '#eef3f7'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#22303c';
  ctx.fillRect(xb - hw * 0.22, -hw * 0.38, hw * 0.12, hw * 0.76); // Fensterband vorn
}
function funnel(ctx, x, hw, t, sunk, c) {
  ctx.fillStyle = '#2a323a';
  ctx.beginPath(); ctx.ellipse(x, 0, hw * 0.34, hw * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = sunk ? '#555' : '#c0392b';
  ctx.beginPath(); ctx.ellipse(x, 0, hw * 0.34, hw * 0.3, 0, 0, Math.PI * 2); ctx.lineWidth = hw * 0.1; ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
  ctx.fillStyle = '#0d1115';
  ctx.beginPath(); ctx.ellipse(x, 0, hw * 0.2, hw * 0.17, 0, 0, Math.PI * 2); ctx.fill();
  if (sunk) return;
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.45 + i / 4) % 1;
    ctx.fillStyle = `rgba(200,205,210,${0.35 * (1 - ph)})`;
    ctx.beginPath(); ctx.arc(x - ph * c * 0.9, Math.sin(ph * 5 + i) * hw * 0.2, hw * (0.2 + ph * 0.45), 0, Math.PI * 2); ctx.fill();
  }
}
function mast(ctx, x, hw, t, sunk) {
  ctx.strokeStyle = '#1b232b'; ctx.lineWidth = hw * 0.1;
  ctx.beginPath(); ctx.moveTo(x, -hw * 0.5); ctx.lineTo(x, hw * 0.5); ctx.stroke();
  ctx.save(); ctx.translate(x, 0); ctx.rotate(sunk ? 0.6 : t * 2.2);
  ctx.strokeStyle = '#e9eef2'; ctx.lineWidth = hw * 0.12;
  ctx.beginPath(); ctx.moveTo(-hw * 0.35, 0); ctx.lineTo(hw * 0.35, 0); ctx.stroke();
  ctx.restore();
}
function jet(ctx, x, y, s) {
  ctx.fillStyle = '#a9b5c0'; ctx.strokeStyle = '#1b232b'; ctx.lineWidth = s * 0.08;
  ctx.beginPath();
  ctx.moveTo(x + s, y); ctx.lineTo(x - s * 0.2, y - s * 0.75); ctx.lineTo(x - s * 0.35, y - s * 0.75);
  ctx.lineTo(x - s * 0.05, y - s * 0.12); ctx.lineTo(x - s * 0.7, y - s * 0.12); ctx.lineTo(x - s * 0.9, y - s * 0.4);
  ctx.lineTo(x - s, y - s * 0.4); ctx.lineTo(x - s * 0.85, y); ctx.lineTo(x - s, y + s * 0.4); ctx.lineTo(x - s * 0.9, y + s * 0.4);
  ctx.lineTo(x - s * 0.7, y + s * 0.12); ctx.lineTo(x - s * 0.05, y + s * 0.12); ctx.lineTo(x - s * 0.35, y + s * 0.75);
  ctx.lineTo(x - s * 0.2, y + s * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke();
}

/**
 * Schiff vom Typ type (0..4) mit Bug in Fahrtrichtung (rechts bzw. unten).
 * px/py: linke obere Ecke der ersten Zelle, c: Zellgröße. opt: {sunk, wake, sel, bad, alpha}
 */
function drawShip(ctx, type, len, dir, px, py, c, t, opt = {}) {
  const L = len * c, sub = type === 3, carrier = type === 0, sunk = !!opt.sunk;
  const hw = c * (sub ? 0.24 : carrier ? 0.36 : 0.32);
  const x0 = c * 0.08, x1 = L - c * 0.06;
  ctx.save();
  if (dir === 'h') ctx.translate(px, py + c / 2); else { ctx.translate(px + c / 2, py); ctx.rotate(Math.PI / 2); }
  if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
  // Kielwasser und Bugwelle
  if (opt.wake && !sunk) {
    const wg = ctx.createLinearGradient(x0, 0, x0 - c * 0.5, 0);
    wg.addColorStop(0, 'rgba(235,250,255,0.28)'); wg.addColorStop(1, 'rgba(235,250,255,0)');
    ctx.fillStyle = wg;
    const wob = Math.sin(t * 3) * hw * 0.1;
    ctx.beginPath(); ctx.moveTo(x0 + c * 0.1, -hw * 0.6); ctx.quadraticCurveTo(x0 - c * 0.2, -hw * 0.7, x0 - c * 0.42, -hw * 1.1 + wob); ctx.lineTo(x0 - c * 0.42, hw * 1.1 - wob); ctx.quadraticCurveTo(x0 - c * 0.2, hw * 0.7, x0 + c * 0.1, hw * 0.6); ctx.fill();
    ctx.strokeStyle = 'rgba(235,250,255,0.3)'; ctx.lineWidth = c * 0.02;
    for (let k = 0; k < 3; k++) { const q = ((t * 0.7 + k / 3) % 1); ctx.globalAlpha = (opt.alpha ?? 1) * (1 - q); ctx.beginPath(); ctx.arc(x0 - q * c * 0.4, 0, hw * (0.5 + q * 0.6), Math.PI * 0.6, Math.PI * 1.4); ctx.stroke(); }
    ctx.globalAlpha = opt.alpha ?? 1;
    ctx.strokeStyle = 'rgba(235,250,255,0.5)'; ctx.lineWidth = c * 0.03;
    const bp = (t * 0.8) % 1;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x1 - c * 0.05, 0);
      ctx.quadraticCurveTo(x1 - c * 0.35, s * hw * 1.25, x1 - c * (0.55 + bp * 0.15), s * hw * (1.25 + bp * 0.2)); ctx.stroke();
    }
  }
  // Schatten
  ctx.fillStyle = 'rgba(0,10,20,0.35)';
  ctx.save(); ctx.translate(c * 0.05, c * 0.07); hullPath(ctx, x0, x1, hw, c, sub); ctx.fill(); ctx.restore();
  // Rumpf
  hullPath(ctx, x0, x1, hw, c, sub);
  const hg = ctx.createLinearGradient(0, -hw, 0, hw);
  if (sub) { hg.addColorStop(0, '#5b6b78'); hg.addColorStop(0.5, '#33414c'); hg.addColorStop(1, '#1f2a33'); }
  else { hg.addColorStop(0, '#c3ccd4'); hg.addColorStop(0.45, '#8a98a5'); hg.addColorStop(1, '#556270'); }
  ctx.fillStyle = hg; ctx.fill();
  ctx.lineWidth = c * 0.035; ctx.strokeStyle = '#141c23'; ctx.stroke();
  // Deck
  if (!sub) {
    hullPath(ctx, x0 + c * 0.08, x1 - c * 0.1, hw * 0.78, c * 0.9, false);
    ctx.fillStyle = carrier ? '#3f474f' : '#77828c'; ctx.fill();
    if (!carrier) {
      ctx.strokeStyle = 'rgba(30,40,50,0.25)'; ctx.lineWidth = c * 0.012;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x0 + c * 0.2, k * hw * 0.25); ctx.lineTo(x1 - c * 0.6, k * hw * 0.25); ctx.stroke(); }
    }
  }
  const at = (f) => x0 + (x1 - x0) * f;
  switch (type) {
    case 0: { // Flugzeugträger
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = c * 0.025; ctx.setLineDash([c * 0.12, c * 0.1]);
      ctx.beginPath(); ctx.moveTo(at(0.05), hw * 0.05); ctx.lineTo(at(0.86), hw * 0.05); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(at(0.1), hw * 0.3); ctx.lineTo(at(0.55), -hw * 0.45); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,210,60,0.7)';
      ctx.strokeRect(at(0.04), -hw * 0.55, c * 0.25, hw * 1.1);
      roundRect(ctx, at(0.55), hw * 0.38, c * 0.75, hw * 0.5, hw * 0.1);
      ctx.fillStyle = sunk ? '#555b60' : '#d5dde4'; ctx.fill(); ctx.strokeStyle = '#1b232b'; ctx.lineWidth = hw * 0.08; ctx.stroke();
      mast(ctx, at(0.55) + c * 0.45, hw * 0.55, t, sunk);
      jet(ctx, at(0.28), -hw * 0.25, hw * 0.45);
      jet(ctx, at(0.72), -hw * 0.3, hw * 0.45);
      jet(ctx, at(0.42), hw * 0.45, hw * 0.4);
      break;
    }
    case 1: // Schlachtschiff
      turret(ctx, at(0.1), hw, -1, true, sunk);
      bridge(ctx, at(0.36), at(0.58), hw, sunk);
      funnel(ctx, at(0.3), hw, t, sunk, c);
      mast(ctx, at(0.47), hw, t, sunk);
      turret(ctx, at(0.68), hw, 1, true, sunk);
      turret(ctx, at(0.82), hw, 1, true, sunk);
      break;
    case 2: // Kreuzer
      turret(ctx, at(0.14), hw, -1, false, sunk);
      funnel(ctx, at(0.36), hw, t, sunk, c);
      bridge(ctx, at(0.44), at(0.66), hw, sunk);
      mast(ctx, at(0.55), hw, t, sunk);
      turret(ctx, at(0.8), hw, 1, true, sunk);
      break;
    case 3: { // U-Boot
      ctx.strokeStyle = 'rgba(160,180,195,0.35)'; ctx.lineWidth = c * 0.02;
      ctx.beginPath(); ctx.moveTo(at(0.08), 0); ctx.lineTo(at(0.9), 0); ctx.stroke();
      ctx.fillStyle = '#202a32';
      ctx.beginPath(); ctx.moveTo(x0 + c * 0.05, 0); ctx.lineTo(x0 + c * 0.3, -hw * 1.5); ctx.lineTo(x0 + c * 0.4, -hw * 1.5); ctx.lineTo(x0 + c * 0.3, 0);
      ctx.lineTo(x0 + c * 0.4, hw * 1.5); ctx.lineTo(x0 + c * 0.3, hw * 1.5); ctx.closePath(); ctx.fill();
      roundRect(ctx, at(0.48), -hw * 0.55, c * 0.55, hw * 1.1, hw * 0.5);
      ctx.fillStyle = sunk ? '#333' : '#3b4954'; ctx.fill(); ctx.strokeStyle = '#11181e'; ctx.lineWidth = c * 0.03; ctx.stroke();
      ctx.fillStyle = '#11181e';
      ctx.fillRect(at(0.52), -hw * 1.1, c * 0.06, hw * 2.2); // Tiefenruder am Turm
      if (!sunk) { // Periskop mit kleiner Spur
        const pp = (t * 0.6) % 1;
        ctx.fillStyle = `rgba(230,250,255,${0.5 * (1 - pp)})`;
        ctx.beginPath(); ctx.arc(at(0.62) + c * 0.15, 0, hw * (0.2 + pp * 0.6), 0, Math.PI * 2); ctx.fill();
      }
      // leicht unter Wasser
      hullPath(ctx, x0, x1, hw, c, true);
      ctx.fillStyle = 'rgba(20,90,130,0.18)'; ctx.fill();
      break;
    }
    case 4: // Zerstörer
      roundRect(ctx, at(0.06), -hw * 0.5, c * 0.32, hw, hw * 0.12);
      ctx.fillStyle = '#5e6a75'; ctx.fill(); ctx.strokeStyle = '#1b232b'; ctx.lineWidth = hw * 0.08; ctx.stroke();
      ctx.fillStyle = '#1b232b';
      for (let k = 0; k < 3; k++) ctx.fillRect(at(0.08) + k * c * 0.09, -hw * 0.35, c * 0.05, hw * 0.7);
      funnel(ctx, at(0.4), hw, t, sunk, c);
      bridge(ctx, at(0.48), at(0.68), hw, sunk);
      turret(ctx, at(0.82), hw, 1, false, sunk);
      break;
  }
  if (sunk) {
    hullPath(ctx, x0, x1, hw, c, sub);
    ctx.fillStyle = 'rgba(25,12,8,0.5)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,90,70,0.85)'; ctx.lineWidth = c * 0.05; ctx.stroke();
  }
  if (opt.sel || opt.bad) {
    hullPath(ctx, x0 - c * 0.04, x1 + c * 0.04, hw + c * 0.06, c, sub);
    ctx.strokeStyle = opt.bad ? '#ff4d4d' : '#ffd34d';
    ctx.lineWidth = c * 0.07;
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = c * 0.3;
    ctx.stroke();
    if (opt.bad) { ctx.fillStyle = 'rgba(255,60,60,0.25)'; ctx.fill(); }
  }
  ctx.restore();
}

/* ---------- Markierungen ---------- */
function drawFire(ctx, cx, cy, c, t, seed, small) {
  const s = small ? 0.7 : 1;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, c * 0.5 * s);
  glow.addColorStop(0, 'rgba(255,170,60,0.75)'); glow.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, c * 0.5 * s, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 4; i++) {
    const f = Math.sin(t * (9 + i * 2.3) + seed * 7 + i) * 0.5 + 0.5;
    const ox = (rand(seed + i) - 0.5) * c * 0.35, oy = (rand(seed + i + 9) - 0.5) * c * 0.3 - f * c * 0.06;
    const r = c * (0.1 + 0.08 * f) * s;
    const fg = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
    fg.addColorStop(0, '#fff6c2'); fg.addColorStop(0.4, '#ffb02e'); fg.addColorStop(1, 'rgba(230,60,20,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.35 + i / 3 + rand(seed) ) % 1;
    ctx.fillStyle = `rgba(40,40,45,${0.45 * (1 - ph)})`;
    ctx.beginPath(); ctx.arc(cx + ph * c * 0.35 + Math.sin(ph * 6 + seed) * c * 0.06, cy - ph * c * 0.75, c * (0.1 + ph * 0.22) * s, 0, Math.PI * 2); ctx.fill();
  }
}
function drawMiss(ctx, cx, cy, c, t, seed) {
  const p = (t * 0.5 + rand(seed)) % 1;
  ctx.strokeStyle = `rgba(220,245,255,${0.35 * (1 - p)})`;
  ctx.lineWidth = c * 0.03;
  ctx.beginPath(); ctx.arc(cx, cy, c * (0.16 + p * 0.22), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(235,250,255,0.85)';
  ctx.beginPath(); ctx.arc(cx, cy, c * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(120,200,235,0.9)';
  ctx.beginPath(); ctx.arc(cx, cy, c * 0.05, 0, Math.PI * 2); ctx.fill();
}

/* ---------- Brett ---------- */
class BoardView {
  constructor(canvas, kind) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.kind = kind;              // 'enemy' | 'own'
    this.ships = [];               // {type, x, y, len, dir, sunk, sel, bad, alpha}
    this.grid = new Array(SIZE * SIZE).fill(0);
    this.target = null;            // {x, y} Fadenkreuz
    this.active = false;           // darf geschossen werden
    this.effects = [];
    this.shake = 0;
    this.labels = true;
  }
  resize(cssW) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = cssW;
    this.labels = cssW > 200;
    this.c = this.labels ? cssW / 10.55 : cssW / 10;
    this.o = this.labels ? this.c * 0.55 : 0;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssW + 'px';
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssW * dpr);
    this.dpr = dpr;
  }
  cellAt(ev) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left - this.o) / this.c);
    const y = Math.floor((ev.clientY - r.top - this.o) / this.c);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
    return { x, y };
  }
  /** Felder rund um versenkte Schiffe sind sicher Wasser. */
  knownWater() {
    const s = new Set();
    for (const sh of this.ships) {
      if (!sh.sunk) continue;
      for (const [x, y] of cellsOf(sh)) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) s.add(ny * SIZE + nx);
      }
    }
    return s;
  }
  addShot(x, y, res) { this.effects.push({ x, y, res, t0: performance.now() / 1000, sound: false }); }
  draw(t) {
    const { ctx, c, o, w } = this;
    if (!w) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, w);
    if (this.shake > 0) {
      const a = this.shake * c * 0.12;
      ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      this.shake = Math.max(0, this.shake - 0.04);
    }
    const bw = c * SIZE;
    // Rahmen + Beschriftung
    if (this.labels) {
      ctx.fillStyle = '#9fd3ee';
      ctx.font = `700 ${c * 0.36}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < SIZE; i++) {
        ctx.fillText(LETTERS[i], o + (i + 0.5) * c, o * 0.5);
        ctx.fillText(String(i + 1), o * 0.48, o + (i + 0.5) * c);
      }
    }
    ctx.save();
    roundRect(ctx, o, o, bw, bw, c * 0.18);
    ctx.clip();
    drawSea(ctx, o, o, bw, bw, t, this.kind);
    // Gitter
    ctx.strokeStyle = 'rgba(190,232,255,0.17)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < SIZE; i++) {
      ctx.moveTo(o + i * c, o); ctx.lineTo(o + i * c, o + bw);
      ctx.moveTo(o, o + i * c); ctx.lineTo(o + bw, o + i * c);
    }
    ctx.stroke();
    // Wasser neben versenkten Schiffen (nur Gegnerbrett)
    if (this.kind === 'enemy') {
      ctx.fillStyle = 'rgba(200,235,255,0.22)';
      for (const k of this.knownWater()) {
        if (this.grid[k] !== 0) continue;
        ctx.beginPath(); ctx.arc(o + (k % SIZE + 0.5) * c, o + (Math.floor(k / SIZE) + 0.5) * c, c * 0.05, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Schiffe
    for (const s of this.ships) drawShip(ctx, s.type, s.len, s.dir, o + s.x * c, o + s.y * c, c, t + s.type, { sunk: s.sunk, wake: !s.sunk, sel: s.sel, bad: s.bad, alpha: s.alpha });
    // Treffer / Wasser
    const sunkCells = new Set();
    for (const s of this.ships) if (s.sunk) for (const [x, y] of cellsOf(s)) sunkCells.add(y * SIZE + x);
    const now = performance.now() / 1000;
    const pending = new Set(this.effects.filter((e) => now - e.t0 < 0.55).map((e) => e.y * SIZE + e.x));
    for (let k = 0; k < SIZE * SIZE; k++) {
      const v = this.grid[k];
      if (!v || pending.has(k)) continue;
      const cx = o + (k % SIZE + 0.5) * c, cy = o + (Math.floor(k / SIZE) + 0.5) * c;
      if (v === 1) drawMiss(ctx, cx, cy, c, t, k);
      else {
        if (this.kind === 'enemy' && !sunkCells.has(k)) { // Treffer auf unbekanntes Schiff: Wrackteil
          ctx.fillStyle = 'rgba(120,20,15,0.55)';
          ctx.beginPath(); ctx.arc(cx, cy, c * 0.36, 0, Math.PI * 2); ctx.fill();
        }
        drawFire(ctx, cx, cy, c, t, k, sunkCells.has(k));
      }
    }
    // Fadenkreuz
    if (this.target && this.active) {
      const cx = o + (this.target.x + 0.5) * c, cy = o + (this.target.y + 0.5) * c;
      const pulse = 1 + Math.sin(t * 6) * 0.06;
      ctx.fillStyle = 'rgba(255,80,60,0.18)';
      ctx.fillRect(o + this.target.x * c, o, c, bw);
      ctx.fillRect(o, o + this.target.y * c, bw, c);
      ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = c * 0.06;
      ctx.beginPath(); ctx.arc(cx, cy, c * 0.36 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(cx + dx * c * 0.18, cy + dy * c * 0.18); ctx.lineTo(cx + dx * c * 0.52, cy + dy * c * 0.52); }
      ctx.stroke();
    }
    // Einschläge
    this.effects = this.effects.filter((e) => now - e.t0 < 1.6);
    for (const e of this.effects) {
      const age = now - e.t0;
      const cx = o + (e.x + 0.5) * c, cy = o + (e.y + 0.5) * c;
      if (age < 0.55) { // Granate im Anflug
        const p = age / 0.55;
        ctx.fillStyle = `rgba(0,0,0,${0.15 + p * 0.3})`;
        ctx.beginPath(); ctx.ellipse(cx, cy, c * 0.1 * (0.5 + p), c * 0.06 * (0.5 + p), 0, 0, Math.PI * 2); ctx.fill();
        const sy = cy - (1 - p) * c * 3;
        ctx.strokeStyle = 'rgba(255,230,180,0.6)'; ctx.lineWidth = c * 0.05;
        ctx.beginPath(); ctx.moveTo(cx, sy - c * 0.6); ctx.lineTo(cx, sy); ctx.stroke();
        ctx.fillStyle = '#ffe9b0';
        ctx.beginPath(); ctx.arc(cx, sy, c * 0.09, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (!e.sound) { e.sound = true; if (this.onImpact) this.onImpact(e); }
      const p = (age - 0.55) / 1.05;
      if (e.res === 'miss') {
        for (let r = 0; r < 3; r++) {
          const q = Math.max(0, p - r * 0.12);
          ctx.strokeStyle = `rgba(230,250,255,${(1 - q) * 0.8})`; ctx.lineWidth = c * 0.05 * (1 - q);
          ctx.beginPath(); ctx.arc(cx, cy, c * (0.1 + q * 0.7), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = `rgba(240,252,255,${1 - p})`;
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2, d = p * c * 0.55;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d - Math.sin(p * Math.PI) * c * 0.4, c * 0.06, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        const fr = c * (0.3 + p * (e.res === 'sunk' ? 1.6 : 0.9));
        const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
        fg.addColorStop(0, `rgba(255,250,210,${1 - p})`); fg.addColorStop(0.4, `rgba(255,150,40,${0.9 * (1 - p)})`); fg.addColorStop(1, 'rgba(200,40,10,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, fr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,200,90,${1 - p})`;
        for (let i = 0; i < 10; i++) {
          const a = rand(i + e.x * 13 + e.y) * Math.PI * 2, d = p * c * (0.6 + rand(i) * 0.8);
          ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, c * 0.07, c * 0.07);
        }
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(160,220,250,0.45)'; ctx.lineWidth = Math.max(1.5, c * 0.04);
    roundRect(ctx, o, o, bw, bw, c * 0.18); ctx.stroke();
    if (!this.active && this.kind === 'enemy' && this.dim) {
      ctx.fillStyle = 'rgba(3,14,26,0.35)';
      roundRect(ctx, o, o, bw, bw, c * 0.18); ctx.fill();
    }
  }
}

/** Kleine Silhouette eines Schiffs (Flottenübersicht). */
function shipIcon(type, cell, sunk) {
  const len = FLEET[type];
  const cv = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = len * cell * dpr; cv.height = cell * dpr;
  cv.style.width = len * cell + 'px'; cv.style.height = cell + 'px';
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  drawShip(ctx, type, len, 'h', 0, 0, cell, 0.3, { sunk });
  return cv;
}
