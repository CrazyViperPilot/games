// Stadtansicht (PRD §15): Overlay mit Zonenraster und Werkzeugen zum Malen (Finger oder Maus). Das Spiel läuft weiter.
// Liest den Zustand (game.city) und ändert ihn nur über game.issue(team, { type: 'city', … }).
import { CITY } from '../data/city.js';
import { KINDS, KIND_NAME, hasRoad } from '../game/city.js';

const COLORS = { road: '#5a5f58', res: '#4f8f5a', com: '#4a78b0', bm: '#a0703f', mun: '#8b96a8', fuel: '#9b7bc4' };
const ICON = { road: '▬', res: '⌂', com: '▣', bm: '⚒', mun: '✸', fuel: '⛽' };
const TOOLS = [...KINDS, 'erase'];
const fmt = (v, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

export class CityPanel {
  constructor(parent, game, team, onMessage = () => {}, onShow = null) {
    this.onShow = onShow; // (x, y) => Kamera auf die Stadt (main.js)
    this.game = game;
    this.team = team;
    this.onMessage = onMessage;
    this.tool = 'road';
    this.drag = null; // { c0, r0, c1, r1 }
    this.open = false;
    const root = document.createElement('div');
    root.className = 'city';
    root.hidden = true;
    root.innerHTML = `
      <div class="city-head"><b>Stadt</b><span class="city-stats"></span><button type="button" class="btn-sm" data-show>Auf Karte zeigen</button><button type="button" class="btn-sm" data-close>Schließen (Y)</button></div>
      <div class="city-body">
        <div class="city-map"><canvas></canvas></div>
        <div class="city-tools">${TOOLS.map((k) => {
          const price = k === 'erase' ? 'kostenlos' : `${CITY.cost[k]} Geld`;
          const name = k === 'erase' ? 'Räumen' : KIND_NAME[k];
          return `<button type="button" class="ctool" data-tool="${k}" style="--c:${COLORS[k] ?? '#7a2f2f'}"><i>${k === 'erase' ? '✕' : ICON[k]}</i><span>${name}</span><small>${price}</small></button>`;
        }).join('')}</div>
      </div>
      <div class="city-foot"></div>`;
    parent.appendChild(root);
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.statsEl = root.querySelector('.city-stats');
    this.footEl = root.querySelector('.city-foot');
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.toggle(false);
      if (e.target.closest('[data-show]')) {
        const c = this.game.city[this.team];
        this.toggle(false);
        this.onShow?.(c.x0 + (c.cols * c.cell) / 2, c.y0 + (c.rows * c.cell) / 2);
      }
      const t = e.target.closest('[data-tool]');
      if (t) {
        this.tool = t.dataset.tool;
        this.mark();
      }
    });
    this.bindPointer();
    this.mark();
    this.onKey = (e) => {
      if (this.open && e.key === 'Escape') this.toggle(false);
    };
    window.addEventListener('keydown', this.onKey);
  }

  mark() {
    this.root.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === this.tool)));
  }

  toggle(on = !this.open) {
    this.open = on;
    this.root.hidden = !on;
    if (on) {
      this.resize();
      this.update(true);
    }
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const city = this.game.city[this.team];
    const dpr = window.devicePixelRatio || 1;
    this.cell = Math.max(8, Math.floor(Math.min(box.width / city.cols, box.height / city.rows)));
    this.canvas.style.width = `${this.cell * city.cols}px`;
    this.canvas.style.height = `${this.cell * city.rows}px`;
    this.canvas.width = this.cell * city.cols * dpr;
    this.canvas.height = this.cell * city.rows * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  cellAt(e) {
    const city = this.game.city[this.team];
    const r = this.canvas.getBoundingClientRect();
    const c = Math.min(city.cols - 1, Math.max(0, Math.floor((e.clientX - r.left) / this.cell)));
    const row = Math.min(city.rows - 1, Math.max(0, Math.floor((e.clientY - r.top) / this.cell)));
    return [c, row];
  }

  bindPointer() {
    const cv = this.canvas;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const [c, r] = this.cellAt(e);
      this.drag = { c0: c, r0: r, c1: c, r1: r };
      this.draw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      [this.drag.c1, this.drag.r1] = this.cellAt(e);
      this.draw();
    });
    const end = (e) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      if (e.type === 'pointercancel') return this.draw();
      const res = this.game.issue(this.team, { type: 'city', kind: this.tool, ...d });
      if (!res.ok) this.onMessage(res.reason);
      else if (res.broke) this.onMessage('Zu wenig Geld für alle Zellen');
      this.update(true);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  update(force = false) {
    if (!this.open) return;
    const now = performance.now();
    if (!force && now - (this.last || 0) < 200) return;
    this.last = now;
    this.draw();
    const g = this.game;
    const s = g.city[this.team].stats;
    const m = g.mainFob(this.team);
    const t = g.teams[this.team];
    this.statsEl.textContent = `Einwohner ${fmt(s.pop)} / ${fmt(s.housing)} · Arbeit ${fmt(s.workers)} / ${fmt(s.jobs)} · Steuern +${fmt(s.money, 1)} Geld/s · Kasse ${fmt(t.res.money)}`;
    this.footEl.textContent = m
      ? `Haupt-Lager: BM ${fmt(m.store.bm)} (+${fmt(s.bm, 1)}/s) · MUN ${fmt(m.store.mun)} (+${fmt(s.mun, 1)}/s) · TS ${fmt(m.store.fuel)} (+${fmt(s.fuel, 1)}/s)`
      : 'Haupt-FOB zerstört';
  }

  draw() {
    const ctx = this.ctx;
    const city = this.game.city[this.team];
    const n = this.cell;
    ctx.clearRect(0, 0, n * city.cols, n * city.rows);
    ctx.fillStyle = '#1a201a';
    ctx.fillRect(0, 0, n * city.cols, n * city.rows);
    for (let r = 0; r < city.rows; r++) {
      for (let c = 0; c < city.cols; c++) {
        const i = r * city.cols + c;
        const k = KINDS[city.kind[i] - 1];
        const x = c * n;
        const y = r * n;
        ctx.strokeStyle = '#ffffff12';
        ctx.strokeRect(x + 0.5, y + 0.5, n - 1, n - 1);
        if (city.blocked[i]) {
          ctx.fillStyle = '#0a0d0a'; // gesperrt: Haupt-FOB oder Hindernis
          ctx.fillRect(x + 1, y + 1, n - 2, n - 2);
          continue;
        }
        if (!k) continue;
        const lv = city.level[i];
        ctx.fillStyle = COLORS[k];
        if (k === 'road') {
          ctx.fillRect(x + 1, y + n * 0.3, n - 2, n * 0.4);
          continue;
        }
        const linked = hasRoad(city, c, r);
        ctx.globalAlpha = lv ? 1 : 0.35; // nur ausgewiesen = blass
        ctx.fillRect(x + 2, y + 2, n - 4, n - 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0d110d';
        ctx.font = `${Math.floor(n * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (lv) ctx.fillText('•'.repeat(lv), x + n / 2, y + n * 0.5);
        else if (!linked) ctx.fillText('?', x + n / 2, y + n * 0.5); // ohne Straßenanschluss
      }
    }
    const fob = this.game.mainFob(this.team);
    if (fob) {
      // Haupt-FOB an ihrer Stelle im Raster
      const T = this.game.grid.tile;
      const fx = ((fob.cx * T - city.x0) / city.cell) * n;
      const fy = ((fob.cy * T - city.y0) / city.cell) * n;
      const fw = ((fob.w * T) / city.cell) * n;
      ctx.fillStyle = this.game.teams[this.team].color;
      ctx.fillRect(fx, fy, fw, fw);
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.floor(n * 0.4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FOB', fx + fw / 2, fy + fw / 2);
    }
    const d = this.drag;
    if (d) {
      ctx.fillStyle = this.tool === 'erase' ? '#ff8a8a55' : `${COLORS[this.tool]}88`;
      const c0 = Math.min(d.c0, d.c1);
      const r0 = Math.min(d.r0, d.r1);
      ctx.fillRect(c0 * n, r0 * n, (Math.abs(d.c1 - d.c0) + 1) * n, (Math.abs(d.r1 - d.r0) + 1) * n);
    }
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
