// Forschungsmenü (PRD §7 „Forschungsstufen“, seit v4.97): eigenes Fenster mit dem ganzen Baum, geöffnet über den Knopf
// „Forschung“ rechts oben (unter „Stadt“) oder den Befehl „Forschung“ (U) der Hauptstadt. Oben die Stufen, darunter je Ast eine
// Spalte, rechts Einzelheiten zur gewählten Forschung und die laufende Forschung. Antippen wählt, „Erforschen“ startet.
// Das Spiel läuft weiter. Liest game.teams[team].tech und ändert es nur über game.issue (research, cancelResearch).
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { CITY } from '../data/city.js';
import { RESEARCH_KEYS, researchBlock, researchEffect, tierUnits } from '../game/research.js';
import { cityLevel, powerRatio } from '../game/city.js';

const R = BALANCE.research;
const BRANCHES = ['veh', 'wpn', 'abl', 'ai'];
const ICON = { veh: '⚙', wpn: '✛', abl: '✦', ai: '🖥' };
const fmt = (v) => Math.floor(v).toLocaleString('de-DE');
// Name auf dem Knopf: lange Namen kürzer
const label = (k) => (R.items[k].name.length > 18 ? R.items[k].short : R.items[k].name);

export class ResearchPanel {
  constructor(parent, game, team, onMessage = () => {}) {
    this.game = game;
    this.team = team;
    this.onMessage = onMessage;
    this.open = false;
    this.sel = null;
    const branches = BRANCHES.filter((b) => b !== 'ai' || game.city); // KI nur mit Stadt (Rechenzentrum)
    const item = (k) => {
      const it = R.items[k];
      const mark = it.req === 'branch' ? '★ ' : it.req ? '↳ ' : '';
      return `<button type="button" class="rs-item" data-rs="${k}"><i class="rs-fill"></i><span>${mark}${label(k)}</span><small data-rs-sub></small></button>`;
    };
    const root = document.createElement('div');
    root.className = 'research';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Forschung');
    root.innerHTML = `
      <div class="rs-head"><b>🔬 Forschung</b>
        <div class="rs-tiers"><span class="rs-item rs-t1 done"><span>Stufe 1</span><small>Start</small></span><i>→</i>${item('tier2')}<i>→</i>${item('tier3')}</div>
        <span class="rs-money" data-rs-money></span><button type="button" class="btn-sm rs-close" data-rs-close title="Schließen (Esc)" aria-label="Schließen">✕</button></div>
      <div class="rs-body">
        <div class="rs-tree" style="--n:${branches.length}">${branches.map((b) => `<div class="rs-col"><h4>${ICON[b]} ${R.branches[b]}</h4>${RESEARCH_KEYS.filter((k) => R.items[k].branch === b).map(item).join('')}</div>`).join('')}</div>
        <div class="rs-side">
          <div class="rs-cur" data-rs-cur></div>
          <div class="rs-info" data-rs-info></div>
        </div>
      </div>`;
    parent.appendChild(root);
    this.root = root;
    this.buttons = [...root.querySelectorAll('[data-rs]')];
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-rs-close]')) return this.toggle(false);
      if (e.target.closest('[data-rs-cancel]')) {
        const res = this.game.issue(this.team, { type: 'cancelResearch' });
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

  /** Forschung starten (nur die Hauptstadt forscht; Grund sonst als Meldung). */
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
    }
  }

  /** Beim Öffnen gewählt: laufende Forschung, sonst die erste, die jetzt ginge, sonst die nächste Stufe. */
  firstPick() {
    const tech = this.game.teams[this.team].tech;
    if (tech.cur) return tech.cur.key;
    const keys = this.buttons.map((b) => b.dataset.rs);
    return keys.find((k) => this.state(k).s === 'ok') ?? (tech.tier < 2 ? 'tier2' : 'tier3');
  }

  /** Zustand eines Ziels: done · cur · ok (jetzt möglich) · poor (nur Geld fehlt) · lock (Grund). */
  state(key) {
    const g = this.game;
    const tech = g.teams[this.team].tech;
    const it = R.items[key];
    if (tech.done.includes(key) || (it.tier && tech.tier >= it.tier)) return { s: 'done' };
    if (tech.cur?.key === key) return { s: 'cur' };
    const why = researchBlock(g, this.team, key, true);
    if (why) return { s: 'lock', why };
    const money = g.teams[this.team].res.money;
    if (money < it.money) return { s: 'poor', why: `Fehlt: ${Math.ceil(it.money - money)} ${BALANCE.resNames.money}` };
    return tech.cur ? { s: 'wait', why: 'Es läuft schon eine Forschung (eine zugleich)' } : { s: 'ok' };
  }

  /** Forschungstempo (Stadt: Uni beschleunigt, Strommangel bremst), wie updateResearch. */
  speed() {
    const g = this.game;
    if (!g.city) return 1;
    return (1 + CITY.uniSpeed * Math.max(0, cityLevel(g, this.team, 'uni') - 1)) * powerRatio(g, this.team);
  }

  update(force = false) {
    if (!this.open) return;
    const now = performance.now();
    if (!force && now - (this.last || 0) < 250) return;
    this.last = now;
    const g = this.game;
    const tech = g.teams[this.team].tech;
    this.root.querySelector('[data-rs-money]').textContent = `Geld ${fmt(g.teams[this.team].res.money)}`;
    for (const b of this.buttons) {
      const k = b.dataset.rs;
      const st = this.state(k);
      const it = R.items[k];
      b.className = `rs-item ${st.s}${k === this.sel ? ' pick' : ''}`;
      b.querySelector('[data-rs-sub]').textContent =
        st.s === 'done' ? '✓ erforscht' : st.s === 'cur' ? `läuft ${Math.floor((tech.cur.t / it.time) * 100)} %` : st.s === 'lock' ? `🔒 ${this.short(k)}` : `${it.money} G · ${it.time} s`;
      b.querySelector('.rs-fill').style.width = st.s === 'cur' ? `${Math.min(100, (tech.cur.t / it.time) * 100)}%` : '0';
    }
    this.root.querySelector('[data-rs-cur]').innerHTML = this.curHtml();
    this.root.querySelector('[data-rs-info]').innerHTML = this.infoHtml();
  }

  /** Kurzer Sperrgrund auf dem Knopf. */
  short(k) {
    const it = R.items[k];
    const tech = this.game.teams[this.team].tech;
    if (it.req === 'branch') return 'ganzer Ast';
    if (it.req && !tech.done.includes(it.req)) return R.items[it.req].short ?? R.items[it.req].name;
    if (tech.tier < it.needs) return `Stufe ${it.needs}`;
    if (it.dc) return 'Rechenz.';
    if (it.tier) return it.tier === 3 && cityLevel(this.game, this.team, 'uni') >= 1 ? `Uni ${CITY.uniForTier3}` : 'Uni';
    return 'gesperrt';
  }

  curHtml() {
    const g = this.game;
    const tech = g.teams[this.team].tech;
    if (!g.mainFob(this.team)) return '<b class="rs-warn">Keine Hauptstadt: Forschung ruht</b>';
    if (!tech.cur) return '<span class="rs-muted">Keine Forschung läuft</span>';
    const it = R.items[tech.cur.key];
    const sp = this.speed();
    const left = sp > 0 ? Math.ceil((it.time - tech.cur.t) / sp) : Infinity;
    return `<span>Läuft: <b>${it.name}</b></span><div class="rs-bar"><i style="width:${Math.min(100, (tech.cur.t / it.time) * 100)}%"></i></div>` +
      `<span class="rs-muted">${Number.isFinite(left) ? `noch ${left} s` : 'steht (kein Strom)'}${sp !== 1 && Number.isFinite(left) ? ` · Tempo ${Math.round(sp * 100)} %` : ''}</span>` +
      `<button type="button" class="btn-sm" data-rs-cancel title="Abbrechen: das Geld kommt ganz zurück">Abbrechen</button>`;
  }

  infoHtml() {
    const k = this.sel;
    const it = R.items[k];
    if (!it) return '';
    const st = this.state(k);
    const eff = researchEffect(k);
    const req = [];
    if (it.needs > 1) req.push(`ab Stufe ${it.needs}`);
    if (it.req === 'branch') req.push(`alle anderen im Ast ${R.branches[it.branch]}`);
    else if (it.req) req.push(`nach ${R.items[it.req].name}`);
    if (it.dc) req.push('Rechenzentrum');
    if (it.tier && this.game.city) req.push(it.tier === 2 ? 'Universität' : `Universität Stufe ${CITY.uniForTier3}`);
    const units = it.tier ? tierUnits(it.tier).map((u) => UNITS[u].name).join(', ') : '';
    const head = it.tier ? `<b>${it.name}</b>` : `<b>${it.name}</b><small class="rs-muted">${R.branches[it.branch]}</small>`;
    const body = it.tier ? `Schaltet frei: ${units}` : eff ? eff[0].toUpperCase() + eff.slice(1) : '';
    const btn =
      st.s === 'done' ? '<span class="rs-ok">✓ Erforscht</span>'
      : st.s === 'cur' ? '<span class="rs-ok">Wird erforscht …</span>'
      : `<button type="button" class="btn-sm rs-go${st.s === 'ok' ? '' : ' off'}" data-rs-start${st.why ? ` title="${st.why}"` : ''}>Erforschen · ${it.money} G</button>`;
    return `${head}<p>${body}</p><small class="rs-muted">${it.money} Geld · ${it.time} s${req.length ? ` · ${req.join(' · ')}` : ''}</small>` +
      `${st.why ? `<small class="rs-warn">${st.why}</small>` : ''}${btn}`;
  }

  destroy() {
    document.body.classList.remove('research-open');
    this.root.remove();
  }
}
