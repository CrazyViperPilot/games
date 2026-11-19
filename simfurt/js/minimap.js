// Simfurt – Minikarte: Draufsicht als Raute (Kachel (x,y) → ((x−y), (x+y)/2) wie in der isometrischen Ansicht).
// Zeigt das Sichtfeld als Rahmen; Antippen, Klicken oder Ziehen springt mit der Kamera dorthin.
import { N, ZONES, BUILD, T_WATER, T_TREES } from './data.js';

const CSS_W = 112, CSS_H = 64;      // Größe in CSS-px (Raute ist 2:1, daher flacher als quadratisch)
const REFRESH_MS = 500;             // Kartenbild höchstens alle 500 ms neu erstellen
const KEY = 'simfurt-mini';

// Farben (gepackt 0xRRGGBB). Zonen und Gebäude kommen aus data.js.
const COL = { water: 0x3e86c4, flood: 0x5aa0ff, forest: 0x2f7a3c, grass: 0x6fae52, road: 0x5a5f66, bridge: 0xc9ced6, fire: 0xff3b30 };

const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
const pack = (r, g, b) => (cl(r) << 16) | (cl(g) << 8) | cl(b);
const ch = (c, sh) => (c >> sh) & 255;
const hexPk = (h) => parseInt(h.slice(1), 16);
function mixPk(a, b, t) { return pack(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * t, ch(a, 8) + (ch(b, 8) - ch(a, 8)) * t, ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t); }
function shadePk(c, f) { return pack(ch(c, 16) * f, ch(c, 8) * f, ch(c, 0) * f); }

// Zonenfarben: unbebaut (Parzelle) und je Stufe heller/dunkler abgestuft.
const ZT = [];
for (const k of Object.keys(ZONES)) {
  const d = ZONES[k], zc = hexPk(d.color);
  const lvl = [0];
  for (let l = 1; l <= d.max; l++) lvl.push(shadePk(zc, 0.7 + 0.15 * l));
  ZT[Number(k)] = { lot: mixPk(COL.grass, zc, 0.45), lvl };
}
const bcache = new Map();
function bColor(type) {
  let c = bcache.get(type);
  if (c === undefined) { const d = BUILD[type]; c = d && d.color ? hexPk(d.color) : 0x9aa0a6; bcache.set(type, c); }
  return c;
}
const clampN = (v, n) => Math.max(0, Math.min(n - 1, v));
const sheetOpen = () => { const sh = document.getElementById('sheet'); return !!sh && !sh.hidden; };
function readPref() {
  try { const v = localStorage.getItem(KEY); if (v === '1') return true; if (v === '0') return false; } catch { /* kein Speicher */ }
  return (window.innerWidth || 0) >= 700;
}

export class MiniMap {
  constructor(canvas, renderer) {
    this.cv = canvas; this.r = renderer; this.ctx = canvas.getContext('2d');
    this.box = canvas.parentElement;
    this.btn = this.box ? this.box.querySelector('#miniTog') : null;
    this.onJump = null;                       // optional: (tx, ty) → nach dem Sprung (main setzt needDraw)
    this.cssW = CSS_W; this.cssH = CSS_H; this.dpr = 1;
    this.n = 0; this.off = null; this.octx = null; this.img = null; this.layer = null;
    this.s = 1; this.ox = 0; this.oy = 0;     // Projektion: X = ox + (x−y)·s, Y = oy + (x+y)·s/2 (CSS-px)
    this.src = null; this.sig = -1; this.dirty = true; this.imgT = -1e9;
    this.kx = NaN; this.ky = NaN; this.kz = NaN; this.kw = NaN; this.kh = NaN;
    this.drag = null;
    this.alloc(N);
    this.resize();
    this.applyOpen(readPref());
    if (this.btn) this.btn.addEventListener('click', (e) => { e.stopPropagation(); this.setOpen(!this.open); });
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.drag = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* egal */ }
      this.jumpAt(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.drag === null || e.pointerId !== this.drag) return;
      e.stopPropagation(); this.jumpAt(e);
    });
    const end = (e) => {
      e.stopPropagation();
      if (this.drag === e.pointerId) { this.drag = null; try { canvas.releasePointerCapture(e.pointerId); } catch { /* egal */ } }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Canvas-Auflösung an Bildschirm/DPR anpassen (nach jedem Resize aufrufen). */
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = this.cv.clientWidth || CSS_W; this.cssH = this.cv.clientHeight || CSS_H;
    this.cv.width = Math.round(this.cssW * this.dpr); this.cv.height = Math.round(this.cssH * this.dpr);
    this.layout();
  }

  /** Ein-/Ausklappen (Speichern in localStorage 'simfurt-mini'). */
  setOpen(v) {
    this.applyOpen(v);
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* egal */ }
  }
  applyOpen(v) {
    this.open = v;
    if (this.box) this.box.classList.toggle('open', v);
    if (this.btn) this.btn.setAttribute('aria-expanded', String(v));
    if (v) { this.imgT = -1e9; this.dirty = true; this.kx = NaN; }
  }

  /**
   * Zeichnet die Minikarte. Das Kartenbild wird höchstens alle 500 ms neu aufgebaut
   * (bei Monatswechsel, Bauaktionen mit force=true oder Kartengrößenwechsel); der Rahmen bei Kamerawechsel.
   * Nichts wird gezeichnet, solange ausgeklappt nicht, oder das Menü-Sheet offen ist.
   */
  draw(s, force = false) {
    if (!s || !this.open || sheetOpen()) return;
    const now = performance.now();
    if (N !== this.n) this.alloc(N);
    if (s !== this.src) { this.src = s; this.dirty = true; }
    const sig = s.year * 12 + s.month;
    if (sig !== this.sig) { this.sig = sig; this.dirty = true; }
    if (force) this.dirty = true;
    let rebuilt = false;
    if (this.dirty && now - this.imgT >= REFRESH_MS) { this.buildImage(s); this.imgT = now; this.dirty = false; rebuilt = true; }
    const c = this.r.cam, r = this.r;
    const moved = c.x !== this.kx || c.y !== this.ky || c.z !== this.kz || r.w !== this.kw || r.h !== this.kh;
    if (!rebuilt && !moved) return;
    if (moved) { this.kx = c.x; this.ky = c.y; this.kz = c.z; this.kw = r.w; this.kh = r.h; }
    this.paint();
  }

  alloc(n) {
    this.n = n;
    const off = document.createElement('canvas'); off.width = n; off.height = n;
    this.off = off; this.octx = off.getContext('2d');
    this.img = this.octx.createImageData(n, n);
    this.layer = new Uint32Array(n * n);
    this.dirty = true;
    this.layout();
  }

  layout() {
    const n = this.n || N;
    this.s = Math.min((this.cssW - 6) / (2 * n), (this.cssH - 6) / n);
    this.ox = this.cssW / 2;
    this.oy = (this.cssH - n * this.s) / 2;
    this.kx = NaN;                              // Rahmen neu zeichnen
  }

  /** Kartenbild: eine Pixelzeile je Kachel in `layer`, dann per putImageData ins Offscreen-Canvas. */
  buildImage(s) {
    const n = this.n, tot = n * n, T = s.terrain, zone = s.zone, lvl = s.lvl, road = s.road, L = this.layer;
    const fire = s.fire, flood = s.flood;
    for (let i = 0; i < tot; i++) {
      let c = T[i] === T_WATER ? COL.water : T[i] === T_TREES ? COL.forest : COL.grass;
      const z = zone[i];
      if (z && T[i] !== T_WATER) { const t = ZT[z]; if (t) c = lvl[i] ? t.lvl[Math.min(lvl[i], t.lvl.length - 1)] : t.lot; }
      if (road[i]) c = T[i] === T_WATER ? COL.bridge : COL.road;
      if (flood && flood[i]) c = COL.flood;
      L[i] = c;
    }
    for (const b of s.bld) {
      const c = bColor(b.type);
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (x >= 0 && y >= 0 && x < n && y < n) L[y * n + x] = c;
    }
    if (fire) for (let i = 0; i < tot; i++) if (fire[i]) L[i] = COL.fire;
    const d = this.img.data;
    for (let i = 0, k = 0; i < tot; i++, k += 4) { const c = L[i]; d[k] = c >> 16; d[k + 1] = (c >> 8) & 255; d[k + 2] = c & 255; d[k + 3] = 255; }
    this.octx.putImageData(this.img, 0, 0);
  }

  /** Bild skaliert (Raute, ohne Glättung) plus Sichtfeld-Rahmen. */
  paint() {
    const g = this.ctx, r = this.r, dpr = this.dpr, k = this.s, ox = this.ox, oy = this.oy;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.imageSmoothingEnabled = false;
    // Kachel-Einheiten → Gerätepixel: X = (x−y)·k, Y = (x+y)·k/2
    g.setTransform(dpr * k, dpr * k / 2, -dpr * k, dpr * k / 2, dpr * ox, dpr * oy);
    g.drawImage(this.off, 0, 0);
    // Rahmen: die vier Bildschirmecken in Kachelkoordinaten, dann in die Raute projiziert
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c0 = r.toTile(0, 0), c1 = r.toTile(r.w, 0), c2 = r.toTile(r.w, r.h), c3 = r.toTile(0, r.h);
    g.beginPath();
    const corners = [c0, c1, c2, c3];
    for (let i = 0; i < 4; i++) {
      const [tx, ty] = corners[i];
      const px = ox + (tx - ty) * k, py = oy + (tx + ty) * k / 2;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = '#fff'; g.stroke();
  }

  /** Pointer-Position → Kachel → Kamera dorthin. */
  jumpAt(e) {
    const rc = this.cv.getBoundingClientRect();
    const sx = rc.width ? this.cssW / rc.width : 1, sy = rc.height ? this.cssH / rc.height : 1;
    const u = (e.clientX - rc.left) * sx - this.ox, v = (e.clientY - rc.top) * sy - this.oy;
    const k = this.s, n = this.n;
    const tx = clampN((u + 2 * v) / (2 * k), n), ty = clampN((2 * v - u) / (2 * k), n);
    this.r.centerOn(tx, ty);
    if (this.onJump) this.onJump(tx, ty);
  }
}
