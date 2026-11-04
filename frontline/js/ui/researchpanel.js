// Forschungsbaum (PRD §7 „Forschung“, seit v5.04 nach dem Technologiebaum aus Civilization): eigenes Fenster, geöffnet über den Knopf
// „Forschung“ rechts oben oder den Befehl „Forschung“ (U) der Hauptstadt. Links der Baum: Stufen 1–10 als Spalten (Kopf mit
// „fertig / nötig“), Äste als Zeilen, Linien zum Vorgänger; waagrecht scrollbar. Rechts die Warteschlange (laufende Forschung und
// bis zu RESEARCH.queueMax wartende, je mit ✕) und Einzelheiten zur gewählten Forschung mit „Erforschen“ bzw. „Einreihen“.
// Das Spiel läuft weiter. Liest game.teams[team].tech und ändert es nur über game.issue (research, cancelResearch).
import { BALANCE } from '../data/balance.js';
import { RESEARCH } from '../data/research.js';
import { researchBlock, researchEffect, researchSpeed } from '../game/research.js';
import { cityLevel, citySum } from '../game/city.js';

const R = RESEARCH;
const LANES = Object.keys(R.lanes);
const TIERS = Array.from({ length: R.tiers }, (_, i) => i + 1);
const fmt = (v) => Math.floor(v).toLocaleString('de-DE');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class ResearchPanel {
  constructor(parent, game, team, onMessage = () => {}) {
    this.game = game;
    this.team = team;
    this.onMessage = onMessage;
    this.open = false;
    this.sel = null;
    const node = (lane, tier) => {
      const k = `${lane}${tier}`;
      return `<button type="button" class="rs-node" data-rs="${k}" style="grid-row:${LANES.indexOf(lane) + 2};grid-column:${tier + 1}"><i class="rs-fill"></i><span>${esc(R.items[k].short ?? R.items[k].name)}</span><small data-rs-sub></small></button>`;
    };
    const root = document.createElement('div');
    root.className = 'research';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Forschung');
    root.innerHTML = `
      <div class="rs-head"><b>🔬 Forschung</b><span class="rs-stat" data-rs-stat></span>
        <span class="rs-money" data-rs-money></span><button type="button" class="btn-sm rs-close" data-rs-close title="Schließen (Esc)" aria-label="Schließen">✕</button></div>
      <div class="rs-body">
        <div class="rs-scroll" data-rs-scroll>
          <div class="rs-grid" style="--tiers:${R.tiers};--lanes:${LANES.length}">
            <div class="rs-corner"></div>
            ${TIERS.map((t) => `<div class="rs-tier" data-rs-tier="${t}" style="grid-column:${t + 1}"><b>Stufe ${t}</b><small></small></div>`).join('')}
            ${LANES.map((l, i) => `<div class="rs-lane" style="grid-row:${i + 2}" title="${esc(R.lanes[l].name)}"><i>${R.lanes[l].icon}</i><span>${esc(R.lanes[l].name)}</span></div>`).join('')}
            ${LANES.map((l) => TIERS.map((t) => node(l, t)).join('')).join('')}
          </div>
        </div>
        <div class="rs-side">
          <div class="rs-cur" data-rs-cur></div>
          <div class="rs-info" data-rs-info></div>
        </div>
      </div>`;
    parent.appendChild(root);
    this.root = root;
    this.buttons = [...root.querySelectorAll('[data-rs]')];
    this.tierHeads = [...root.querySelectorAll('[data-rs-tier]')];
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-rs-close]')) return this.toggle(false);
      const cancel = e.target.closest('[data-rs-cancel]');
      if (cancel) {
        const res = this.game.issue(this.team, { type: 'cancelResearch', key: cancel.dataset.rsCancel });
        if (!res.ok) this.onMessage(res.reason);
        return this.update(true);
      }
      if (e.target.closest('[data-rs-start]')) return this.start(this.sel);
      const b = e.target.closest('[data-rs]');
      if (b) {
        this.sel = b.dataset.rs;
        this.update(true);
      }
    });
  }

  /** Forschung starten oder einreihen (nur die Hauptstadt forscht; Grund sonst als Meldung). */
  start(key) {
    const main = this.game.mainFob(this.team);
    if (!key || !main) return this.onMessage('Keine Hauptstadt: Forschung ruht');
    const res = this.game.issue(this.team, { type: 'research', buildingId: main.id, key });
    if (!res.ok) this.onMessage(res.reason);
    this.update(true);
  }

  toggle(on = !this.open) {
    if (on && !this.game.research) {
      this.onMessage('Forschung ist in dieser Partie ausgeschaltet');
      on = false;
    }
    this.open = on;
    this.root.hidden = !on;
    document.body.classList.toggle('research-open', on);
    if (on) {
      this.sel = this.firstPick();
      this.update(true);
      // die aktuelle Stufe ins Bild rücken
      const head = this.tierHeads[Math.max(0, this.game.teams[this.team].tech.tier - 2)];
      const sc = this.root.querySelector('[data-rs-scroll]');
      const lane = this.root.querySelector('.rs-lane');
      if (head && sc) sc.scrollLeft = Math.max(0, head.offsetLeft - (lane?.offsetWidth ?? 120) - 16); // rechts neben die Astnamen
    }
  }

  /** Beim Öffnen gewählt: laufende Forschung, sonst die erste, die jetzt ginge, sonst die erste nicht erforschte. */
  firstPick() {
    const tech = this.game.teams[this.team].tech;
    if (tech.cur) return tech.cur.key;
    const keys = this.buttons.map((b) => b.dataset.rs).sort((a, b) => R.items[a].tier - R.items[b].tier);
    return keys.find((k) => this.state(k).s === 'ok') ?? keys.find((k) => !tech.done.includes(k)) ?? keys[0];
  }

  /** Zustand: done · cur · queued (Platz) · ok (jetzt möglich) · poor (nur Geld fehlt) · lock (Grund). */
  state(key) {
    const g = this.game;
    const tech = g.teams[this.team].tech;
    const it = R.items[key];
    if (tech.done.includes(key)) return { s: 'done' };
    if (tech.cur?.key === key) return { s: 'cur' };
    const q = tech.queue.indexOf(key);
    if (q >= 0) return { s: 'queued', n: q + 1 };
    const why = researchBlock(g, this.team, key);
    if (why) return { s: 'lock', why };
    const money = g.teams[this.team].res.money;
    if (money < it.money) return { s: 'poor', why: `Fehlt: ${Math.ceil(it.money - money)} ${BALANCE.resNames.money}` };
    return { s: 'ok' };
  }

  update(force = false) {
    if (!this.open) return;
    const now = performance.now();
    if (!force && now - (this.last || 0) < 250) return;
    this.last = now;
    const g = this.game;
    const tech = g.teams[this.team].tech;
    this.root.querySelector('[data-rs-money]').textContent = `Geld ${fmt(g.teams[this.team].res.money)}`;
    const sp = researchSpeed(g, this.team);
    this.root.querySelector('[data-rs-stat]').textContent =
      `Stufe ${tech.tier} / ${R.tiers} · ${tech.done.length} erforscht${g.city ? ` · Tempo ${Math.round(sp * 100)} %` : ''}`;
    for (const b of this.buttons) {
      const k = b.dataset.rs;
      const st = this.state(k);
      const it = R.items[k];
      const prev = it.req ? this.state(it.req).s : 'done';
      b.className = `rs-node ${st.s}${k === this.sel ? ' pick' : ''}${it.tier > 1 ? ` link-${prev === 'done' ? 'done' : prev === 'cur' || prev === 'queued' ? 'plan' : 'open'}` : ''}`;
      b.querySelector('[data-rs-sub]').textContent =
        st.s === 'done' ? '✓' : st.s === 'cur' ? `${Math.floor((tech.cur.t / it.time) * 100)} %` : st.s === 'queued' ? `Platz ${st.n}` : st.s === 'lock' ? '🔒' : `${it.money} G`;
      b.querySelector('.rs-fill').style.width = st.s === 'cur' ? `${Math.min(100, (tech.cur.t / it.time) * 100)}%` : '0';
    }
    // Stufenköpfe: wie viele fertig, offen oder gesperrt
    for (const h of this.tierHeads) {
      const t = Number(h.dataset.rsTier);
      const n = tech.done.filter((k) => R.items[k]?.tier === t).length;
      h.className = `rs-tier${t <= tech.tier ? ' open' : ''}${n >= R.perTier ? ' full' : ''}`;
      h.querySelector('small').textContent = t > tech.tier ? '🔒' : `${Math.min(n, R.perTier)} / ${R.perTier}${n > R.perTier ? ` (+${n - R.perTier})` : ''}`;
    }
    this.root.querySelector('[data-rs-cur]').innerHTML = this.queueHtml();
    this.root.querySelector('[data-rs-info]').innerHTML = this.infoHtml();
  }

  /** Warteschlange: laufende Forschung mit Balken und Restzeit, dahinter die wartenden; je ✕ zum Abbrechen. */
  queueHtml() {
    const g = this.game;
    const tech = g.teams[this.team].tech;
    if (!g.mainFob(this.team)) return '<b class="rs-warn">Keine Hauptstadt: Forschung ruht</b>';
    const sp = researchSpeed(g, this.team);
    let h = `<b>Warteschlange</b>`;
    if (g.city && cityLevel(g, this.team, 'uni') < 1) h += '<small class="rs-warn">Ohne Universität ruht die Forschung (Stadt: Universität bauen)</small>';
    if (!tech.cur) return `${h}<span class="rs-muted">Keine Forschung läuft. Bis zu ${R.queueMax + 1} lassen sich einreihen.</span>`;
    const it = R.items[tech.cur.key];
    const left = sp > 0 ? Math.ceil((it.time - tech.cur.t) / sp) : Infinity;
    h += `<div class="rs-q cur"><span>${esc(it.name)}</span><button type="button" class="btn-sm" data-rs-cancel="${tech.cur.key}" title="Abbrechen: das Geld kommt ganz zurück">✕</button></div>` +
      `<div class="rs-bar"><i style="width:${Math.min(100, (tech.cur.t / it.time) * 100)}%"></i></div>` +
      `<small class="rs-muted">${Number.isFinite(left) ? `noch ${left} s` : 'steht'}${g.city && Number.isFinite(left) ? ` · ${citySum(g, this.team, 'dc')} Rechenzentrum-Stufen` : ''}</small>`;
    tech.queue.forEach((k, i) => {
      h += `<div class="rs-q"><span>${i + 1}. ${esc(R.items[k].name)}</span><button type="button" class="btn-sm" data-rs-cancel="${k}" title="Aus der Warteschlange nehmen (Geld zurück; was davon abhängt, fällt auch heraus)">✕</button></div>`;
    });
    for (let i = tech.queue.length; i < R.queueMax; i++) h += `<div class="rs-q free"><span>${i + 1}. frei</span></div>`;
    return h;
  }

  infoHtml() {
    const k = this.sel;
    const it = R.items[k];
    if (!it) return '';
    const st = this.state(k);
    const eff = researchEffect(k);
    const req = [`Stufe ${it.tier}`];
    if (it.req) req.push(`nach ${R.items[it.req].name}`);
    if (this.game.city) req.push('Universität');
    const tech = this.game.teams[this.team].tech;
    const busy = !!tech.cur;
    const btn =
      st.s === 'done' ? '<span class="rs-ok">✓ Erforscht</span>'
      : st.s === 'cur' ? '<span class="rs-ok">Wird erforscht …</span>'
      : st.s === 'queued' ? `<span class="rs-ok">Wartet (Platz ${st.n})</span>`
      : `<button type="button" class="btn-sm rs-go${st.s === 'ok' ? '' : ' off'}" data-rs-start${st.why ? ` title="${esc(st.why)}"` : ''}>${busy ? 'Einreihen' : 'Erforschen'} · ${it.money} G</button>`;
    const time = this.game.city ? `${it.time} s (ohne Rechenzentrum)` : `${it.time} s`;
    return `<b>${esc(it.name)}</b><small class="rs-muted">${R.lanes[it.lane].icon} ${esc(R.lanes[it.lane].name)} · Stufe ${it.tier}</small>` +
      `<p>${esc(eff)}</p><small class="rs-muted">${it.money} Geld · ${time} · ${esc(req.join(' · '))}</small>` +
      `${st.why ? `<small class="rs-warn">${esc(st.why)}</small>` : ''}${btn}`;
  }

  destroy() {
    document.body.classList.remove('research-open');
    this.root.remove();
  }
}
