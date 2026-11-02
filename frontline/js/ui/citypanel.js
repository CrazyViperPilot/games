// Baumodus der Stadt (PRD §15, seit v4.82 direkt auf der Karte): Werkzeugleiste rechts, schmaler Streifen mit Zahlen oben.
// Mit einem Finger oder der linken Maustaste zieht man auf der Karte ein Rechteck (Input ruft begin/move/end), zwei Finger
// schieben und zoomen weiter. Das Spiel läuft weiter. Liest game.city und ändert es nur über game.issue(team, { type: 'city', … }).
import { CITY } from '../data/city.js';
import { KINDS, KIND_NAME, GOODS, cellAt } from '../game/city.js';

export const CITY_COLORS = { road: '#8a8f86', res: '#4f8f5a', com: '#4a78b0', bm: '#a0703f', mun: '#8b96a8', fuel: '#9b7bc4', steel: '#7f8c99', mine: '#c9a14a', market: '#d6b84a', erase: '#d05050' };
const ICON = { road: '▬', res: '⌂', com: '▣', bm: '⚒', mun: '✸', fuel: '⛽', steel: '⛓', mine: '⛏', market: '⚖', erase: '✕' };
const SHORT = { road: 'Straße', res: 'Wohnen', com: 'Gewerbe', bm: 'BM-Werk', mun: 'Mun.-Werk', fuel: 'Raffinerie', steel: 'Stahlwerk', mine: 'Förderung', market: 'Markt', erase: 'Räumen' };
const TIP = {
  bm: 'Baumaterial aus Holz und Stein (Holzfäller, Steinbruch)', mun: 'Munition aus Metall', fuel: 'Treibstoff aus Öl (Ölquelle)',
  steel: 'Metall aus Erz (Erzmine)', mine: 'Nur auf Rohstoffvorkommen: Holzfäller, Steinbruch, Erzmine oder Ölquelle; braucht keine Straße',
  market: 'Handel: Überschuss verkaufen, Knappes teuer kaufen (Knopf Handel)', road: 'Kostet Baumaterial aus dem Haupt-Lager',
};
const GOOD_NAME = { bm: 'BM', mun: 'MUN', fuel: 'TS', metal: 'Metall' };
const TOOLS = [...KINDS, 'erase'];
const fmt = (v, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

export class CityPanel {
  constructor(parent, game, team, onMessage = () => {}, onShow = null) {
    this.onShow = onShow; // (x, y) => Kamera auf die Stadt (main.js)
    this.game = game;
    this.team = team;
    this.onMessage = onMessage;
    this.tool = 'road';
    this.drag = null; // { c0, r0, c1, r1 } in Kartenzellen, während ein Rechteck gezogen wird
    this.open = false;
    const strip = document.createElement('div');
    strip.className = 'city-strip';
    strip.hidden = true;
    const root = document.createElement('div');
    root.className = 'city-bar';
    root.hidden = true;
    root.innerHTML = `
      <div class="city-tools">${TOOLS.map((k) => {
        const price = k === 'erase' ? 'gratis' : CITY.costBm[k] ? `${CITY.costBm[k]} BM` : `${CITY.cost[k]} G`;
        const name = k === 'erase' ? 'Räumen' : KIND_NAME[k];
        return `<button type="button" class="ctool" data-tool="${k}" title="${name}${TIP[k] ? `: ${TIP[k]}` : ''}" style="--c:${CITY_COLORS[k]}"><i>${ICON[k]}</i><span>${SHORT[k]}</span><small>${price}</small></button>`;
      }).join('')}</div>
      <div class="city-trade" hidden><small>Je ${CITY.market.lot} Stück, Preise in Geld</small>${GOODS.map((g) => `<div class="trow"><b>${GOOD_NAME[g]}</b><button type="button" class="btn-sm" data-trade="${g}" data-dir="sell" title="${CITY.market.lot} ${GOOD_NAME[g]} verkaufen">Verk. +${CITY.market.sell[g]}</button><button type="button" class="btn-sm" data-trade="${g}" data-dir="buy" title="${CITY.market.lot} ${GOOD_NAME[g]} kaufen">Kauf −${CITY.market.buy[g]}</button></div>`).join('')}</div>
      <div class="city-acts"><button type="button" class="btn-sm" data-tradeview>Handel</button><button type="button" class="btn-sm" data-show>Zur Stadt</button><button type="button" class="btn-sm city-done" data-close>Fertig (Y)</button></div>`;
    parent.appendChild(strip);
    parent.appendChild(root);
    this.root = root;
    this.strip = strip;
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.toggle(false);
      if (e.target.closest('[data-show]')) {
        const m = this.game.mainFob(this.team);
        if (m) this.onShow?.(m.x, m.y);
      }
      if (e.target.closest('[data-tradeview]')) this.showTrade(this.root.querySelector('.city-trade').hidden);
      const tr = e.target.closest('[data-trade]');
      if (tr) {
        const res = this.game.issue(this.team, { type: 'trade', good: tr.dataset.trade, dir: tr.dataset.dir });
        if (!res.ok) this.onMessage(res.reason);
        this.update(true);
      }
      const t = e.target.closest('[data-tool]');
      if (t) {
        this.tool = t.dataset.tool;
        this.mark();
      }
    });
    this.mark();
  }

  /** Handel statt Werkzeugen zeigen (oder zurück). */
  showTrade(on) {
    this.root.querySelector('.city-trade').hidden = !on;
    this.root.querySelector('.city-tools').hidden = on;
    this.root.querySelector('[data-tradeview]').textContent = on ? 'Bauen' : 'Handel';
  }

  mark() {
    this.root.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === this.tool)));
  }

  toggle(on = !this.open) {
    this.open = on;
    this.root.hidden = !on;
    this.strip.hidden = !on;
    this.drag = null;
    document.body.classList.toggle('city-mode', on);
    if (on) this.update(true);
  }

  /** Zelle unter einem Weltpunkt, auf die Karte begrenzt. */
  cell(wx, wy) {
    const c = this.game.city[this.team];
    const [col, row] = cellAt(c, wx, wy);
    return [Math.min(c.cols - 1, Math.max(0, col)), Math.min(c.rows - 1, Math.max(0, row))];
  }

  begin(wx, wy) {
    const [c, r] = this.cell(wx, wy);
    this.drag = { c0: c, r0: r, c1: c, r1: r };
  }

  move(wx, wy) {
    if (!this.drag) return;
    [this.drag.c1, this.drag.r1] = this.cell(wx, wy);
  }

  cancel() {
    this.drag = null;
  }

  end(wx, wy) {
    if (!this.drag) return;
    this.move(wx, wy);
    const d = this.drag;
    this.drag = null;
    const res = this.game.issue(this.team, { type: 'city', kind: this.tool, ...d });
    if (!res.ok) this.onMessage(res.reason);
    else if (res.broke) this.onMessage(this.tool === 'road' ? 'Zu wenig Baumaterial für alle Zellen' : 'Zu wenig Geld für alle Zellen');
    else if (res.noRoad) this.onMessage('Gebäude wachsen nur mit einer Straße direkt daneben');
    this.update(true);
  }

  update(force = false) {
    if (!this.open) return;
    const now = performance.now();
    if (!force && now - (this.last || 0) < 250) return;
    this.last = now;
    const g = this.game;
    const s = g.city[this.team].stats;
    const m = g.mainFob(this.team);
    const fled = s.fled ? ` (${fmt(s.fled)} geflohen)` : '';
    const raw = s.raw;
    const store = m ? `Metall ${fmt(g.city[this.team].metal)} ${s.metal >= 0 ? '+' : ''}${fmt(s.metal, 1)} · Förderung Holz ${fmt(raw.wood, 1)} Stein ${fmt(raw.stone, 1)} Erz ${fmt(raw.ore, 1)} Öl ${fmt(raw.oil, 1)} · Lager BM ${fmt(m.store.bm)} +${fmt(s.bm, 1)} · MUN ${fmt(m.store.mun)} +${fmt(s.mun, 1)} · TS ${fmt(m.store.fuel)} +${fmt(s.fuel, 1)}` : 'Haupt-FOB zerstört';
    this.strip.innerHTML = `<span>Einwohner ${fmt(s.pop)}/${fmt(s.housing)}${fled} · Truppen ${fmt(s.drafted)} · frei ${fmt(Math.max(0, s.free))} · Arbeit ${fmt(s.workers)}/${fmt(s.jobs)} · Steuern +${fmt(s.money, 1)}/s</span><span class="city-store">${store}</span>`;
  }

  destroy() {
    document.body.classList.remove('city-mode');
    this.root.remove();
    this.strip.remove();
  }
}
