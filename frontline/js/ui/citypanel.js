// Baumodus der Stadt (PRD §15, seit v4.82 direkt auf der Karte): Werkzeugleiste rechts, schmaler Streifen mit Zahlen oben.
// Mit einem Finger oder der linken Maustaste zieht man auf der Karte ein Rechteck (Input ruft begin/move/end), zwei Finger
// schieben und zoomen weiter. Das Spiel läuft weiter. Liest game.city und ändert es nur über game.issue(team, { type: 'city', … }).
// Dazu das Marktmenü (MarketPanel, seit v4.94): Fenster zum Handeln, geöffnet über Geldanzeige, Markt-Auswahl oder „Handel“.
import { CITY } from '../data/city.js';
import { BALANCE } from '../data/balance.js';
import { GOODS, CITY_STORE_GOODS, cellAt, hasMarket, sizeOf, bigAnchorAt } from '../game/city.js';
import { CITY_KINDS, KIND, KIND_COLOR, KIND_ICON, BUILD_MENU } from '../data/citykinds.js';
import { GOOD_NAME as GOOD_LONG, GOOD_SHORT } from '../data/goods.js';

// Werkzeuge, Farben, Symbole, Kurznamen, Tipps und Gruppen des Baumenüs kommen seit v5.59 aus dem Register js/data/citykinds.js
// (Daniels Gruppen seit v5.36: Grundlagen, Wohnen & Gewerbe, Förderung, Ressourcen, Einheiten, Stadt, Fliegerhorst; eine Art ohne
// Gruppe landet unter „Weitere“). Waren (Marktmenü) aus js/data/goods.js.
export const CITY_COLORS = KIND_COLOR;
export const CITY_ICON = KIND_ICON;
const ICON = CITY_ICON;
const SHORT = Object.fromEntries(CITY_KINDS.map((e) => [e.key, e.short ?? e.name]));
/** Tipp je Werkzeug (Text; Tipps mit Zahlen rechnet das Register aus CITY). */
export const CITY_TIP = Object.fromEntries(CITY_KINDS.filter((e) => e.tip).map((e) => [e.key, typeof e.tip === 'function' ? e.tip(CITY) : e.tip]));
const GOOD_NAME = GOOD_SHORT;
/** Werkzeuge in Gruppen: [[Gruppe, [Werkzeug …]] …] (ohne nicht mehr baubare Arten). */
export const TOOL_GROUPS = BUILD_MENU;
const fmt = (v, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

export class CityPanel {
  constructor(parent, game, team, onMessage = () => {}, onShow = null, onTrade = null) {
    this.onShow = onShow; // (x, y) => Kamera auf die Stadt (main.js)
    this.onTrade = onTrade; // () => Marktmenü öffnen (main.js)
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
      <div class="city-tools">${TOOL_GROUPS.map(([group, tools]) => `<div class="ctool-head">${group}</div>${tools.map((k) => {
        const n = k === 'erase' ? 1 : sizeOf(k);
        const price = k === 'erase' ? 'gratis' : [CITY.cost[k] ? `${CITY.cost[k]} G` : '', CITY.costBm[k] ? `${CITY.costBm[k]} BM` : '', n > 1 ? `${n}×${n}` : ''].filter(Boolean).join(' + ').replace(/ \+ (\d+×)/, ' · $1');
        const name = KIND[k].name;
        return `<button type="button" class="ctool" data-tool="${k}" title="${name}${CITY_TIP[k] ? `: ${CITY_TIP[k]}` : ''}" style="--c:${CITY_COLORS[k]}"><i>${ICON[k]}</i><span>${SHORT[k]}</span><small>${price}</small></button>`;
      }).join('')}`).join('')}</div>
      <div class="city-acts"><button type="button" class="btn-sm city-fold" data-fold title="Menü einklappen (Stadt-Knopf klappt es wieder auf)">▴ Einklappen</button><button type="button" class="btn-sm" data-tradeview title="Marktmenü: kaufen und verkaufen (braucht einen fertigen Markt)">Handel</button><button type="button" class="btn-sm" data-show>Zur Stadt</button><button type="button" class="btn-sm city-done" data-close>Fertig (Y)</button></div>`;
    parent.appendChild(strip);
    parent.appendChild(root);
    this.root = root;
    this.strip = strip;
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.toggle(false);
      if (e.target.closest('[data-fold]')) this.fold(true);
      if (e.target.closest('[data-show]')) {
        const m = this.game.mainFob(this.team);
        if (m) this.onShow?.(m.x, m.y);
      }
      if (e.target.closest('[data-tradeview]')) this.onTrade?.();
      const t = e.target.closest('[data-tool]');
      if (t) {
        this.tool = t.dataset.tool;
        this.mark();
      }
    });
    this.mark();
  }

  mark() {
    this.root.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === this.tool)));
  }

  /** Menü einklappen (Baumodus bleibt, mehr Platz auf dem Bildschirm) oder wieder aufklappen. */
  fold(on) {
    this.folded = on;
    this.root.hidden = on || !this.open;
    this.strip.hidden = on || !this.open;
    document.body.classList.toggle('city-folded', on && this.open);
    if (!on && this.open) this.update(true);
  }

  toggle(on = !this.open) {
    this.open = on;
    this.folded = false;
    document.body.classList.remove('city-folded');
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
    if (sizeOf(this.tool) > 1) this.move(wx, wy);
  }

  move(wx, wy) {
    if (!this.drag) return;
    [this.drag.c1, this.drag.r1] = this.cell(wx, wy);
    if (sizeOf(this.tool) > 1) {
      // Großbau: das Quadrat folgt dem Finger (seit v5.08 mit der Mitte am Finger, auch bei gerader Kantenlänge)
      [this.drag.c1, this.drag.r1] = bigAnchorAt(this.game.city[this.team], this.tool, wx, wy);
      [this.drag.c0, this.drag.r0] = [this.drag.c1, this.drag.r1];
    }
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
    else if (res.occupied) this.onMessage('Belegte Zellen bleiben, wie sie sind: erst räumen');
    else if (res.kept) this.onMessage('Geräumt; Rohstoffvorkommen und Förderanlagen bleiben stehen (Förderanlage einzeln wählen und abreißen)');
    else if (res.felled) this.onMessage(`Bäume gefällt: ${res.felled} ${res.felled === 1 ? 'Zelle' : 'Zellen'} frei zum Bauen`);
    else if (res.noRoad) this.onMessage('Gebäude wachsen nur mit Straße daneben (Wohnen/Gewerbe auch über eine Zelle gleicher Art)');
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
    const c = g.city[this.team];
    const stahl = `Stahl ${fmt(c.metal)} ${s.metal >= 0 ? '+' : ''}${fmt(s.metal, 1)}`;
    const kero = `Kerosin ${fmt(c.kero)} +${fmt(s.kero, 1)}`; // Kerosin im Stadtlager, Ertrag je s (seit v5.20)
    const store = m ? `${stahl} · Förderung Holz ${fmt(raw.wood, 1)} Stein ${fmt(raw.stone, 1)} Erz ${fmt(raw.ore, 1)} Öl ${fmt(raw.oil, 1)} · Lager BM ${fmt(m.store.bm)} +${fmt(s.bm, 1)} · MUN ${fmt(m.store.mun)} +${fmt(s.mun, 1)} · TS ${fmt(m.store.fuel)} +${fmt(s.fuel, 1)} · ${kero}` : `${stahl} · ${kero} · Hauptstadt zerstört`;
    // Straßentransport (seit v5.20): kleinster Stau-Faktor auf den benutzten Straßen, Waren ohne Weg je s
    const jam = s.jam ?? 1;
    const jamTxt = Math.round(jam * 100) < 100 ? ` · <b class="warn">Stau ${fmt(Math.round(jam * 100))} %</b>` : '';
    const lostTxt = (s.lost ?? 0) > 0 ? ` · <b class="warn">ohne Weg ${fmt(s.lost, 1)}/s</b>` : '';
    this.strip.innerHTML = `<span>Strom ${fmt(s.powerSupply)}/${fmt(s.powerUse)}${s.powerRatio < 1 ? ' ⚠' : ''} · Zufriedenheit ${fmt(s.happy * 100)} % · Einwohner ${fmt(s.pop)}/${fmt(s.housing)}${fled} · Truppen ${fmt(s.drafted)} · frei ${fmt(Math.max(0, s.free))} · Arbeit ${fmt(s.workers)}/${fmt(s.jobs)} · Steuern +${fmt(s.money, 1)}/s</span><span class="city-store">${store}${jamTxt}${lostTxt}</span>`;
  }

  destroy() {
    document.body.classList.remove('city-mode');
    this.root.remove();
    this.strip.remove();
  }
}

/**
 * Marktmenü (PRD §15, seit v4.94): kleines Fenster oben in der Mitte, das Spiel läuft weiter. Je Ware Bestand, Verkaufen und
 * Kaufen in Losen (CITY.market.lot). Öffnet über die Geldanzeige oben, die Aktion „Handel“ eines gewählten Markts oder den
 * Knopf „Handel“ im Baumodus, nur mit fertigem Markt. Handelt nur über game.issue(team, { type: 'trade', … }).
 */
export class MarketPanel {
  constructor(parent, game, team, onMessage = () => {}) {
    this.game = game;
    this.team = team;
    this.onMessage = onMessage;
    this.open = false;
    const M = CITY.market;
    const root = document.createElement('div');
    root.className = 'market';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Markt');
    root.innerHTML = `
      <div class="mk-head"><b>⚖ Markt</b><span class="mk-money" data-mk-money></span><button type="button" class="btn-sm mk-close" data-mk-close title="Schließen (Esc)" aria-label="Schließen">✕</button></div>
      <div class="mk-rows">${GOODS.map((g) => `<div class="mk-row"><span class="mk-good" title="${GOOD_LONG[g]}${CITY_STORE_GOODS.includes(g) ? ' (Stadtlager)' : ' (Lager der Hauptstadt)'}"><b>${GOOD_NAME[g]}</b><small data-mk-have="${g}">0</small></span>` +
        `<button type="button" class="btn-sm mk-sell" data-trade="${g}" data-dir="sell" title="${M.lot} ${GOOD_LONG[g]} verkaufen">Verkaufen <b>+${M.sell[g]}</b></button>` +
        `<button type="button" class="btn-sm mk-buy" data-trade="${g}" data-dir="buy" title="${M.lot} ${GOOD_LONG[g]} kaufen">Kaufen <b>−${M.buy[g]}</b></button></div>`).join('')}</div>
      <small class="mk-note">Je ${M.lot} Stück, Preise in Geld. BM, MUN, TS im Lager der Hauptstadt, Stahl und Kerosin im Stadtlager.</small>`;
    parent.appendChild(root);
    this.root = root;
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-mk-close]')) {
        this.toggle(false);
        return;
      }
      const tr = e.target.closest('[data-trade]');
      if (!tr) return;
      const res = this.game.issue(this.team, { type: 'trade', good: tr.dataset.trade, dir: tr.dataset.dir });
      if (!res.ok) this.onMessage(res.reason);
      this.update(true);
    });
  }

  /** Öffnen (nur mit fertigem Markt, sonst Hinweis) oder schließen. */
  toggle(on = !this.open) {
    if (on && !hasMarket(this.game, this.team)) {
      this.onMessage('Erst einen Markt bauen: Stadt (Y) → Werkzeug Markt');
      on = false;
    }
    this.open = on;
    this.root.hidden = !on;
    if (on) this.update(true);
  }

  update(force = false) {
    if (!this.open) return;
    const now = performance.now();
    if (!force && now - (this.last || 0) < 250) return;
    this.last = now;
    if (!hasMarket(this.game, this.team)) {
      this.toggle(false); // Markt zerstört oder abgerissen
      this.onMessage('Kein Markt mehr: Handel geschlossen');
      return;
    }
    const g = this.game;
    const M = CITY.market;
    const L = BALANCE.logistics;
    const money = g.teams[this.team].res.money;
    const main = g.mainFob(this.team);
    this.root.querySelector('[data-mk-money]').textContent = `Geld ${fmt(Math.floor(money))}`;
    for (const k of GOODS) {
      const inCity = CITY_STORE_GOODS.includes(k);
      const have = inCity ? g.city[this.team][k] : main ? main.store[k] : 0;
      this.root.querySelector(`[data-mk-have="${k}"]`).textContent = main || inCity ? fmt(Math.floor(have)) : '–';
      const sell = this.root.querySelector(`[data-trade="${k}"][data-dir="sell"]`);
      const buy = this.root.querySelector(`[data-trade="${k}"][data-dir="buy"]`);
      // ausgegraut, aber antippbar: der Grund kommt dann als Meldung
      sell.classList.toggle('off', (!main && !inCity) || have < M.lot);
      buy.classList.toggle('off', (!main && !inCity) || money < M.buy[k] || have + M.lot > (inCity ? L.storeCap : L.capitalCap));
    }
  }

  destroy() {
    this.root.remove();
  }
}
