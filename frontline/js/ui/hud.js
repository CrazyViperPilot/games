// DOM-HUD (PLAN §5 ui/hud.js, §11.4): Ressourcen, Punkte, Zone, Zeit, Auswahl, Befehlskarte und Meldungen.
// Schreibt das DOM höchstens 5× pro Sekunde und nur, wenn sich der HTML-Text geändert hat.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { builderState, fobLabel, orderText } from './status.js';

const RES_KEYS = ['money', 'bm', 'mun', 'fuel'];
const MSG_LIFE = 6000; // ms
const MSG_MAX = 5;
const DOM_EVERY = 200; // ms
const NODE_NAME = { bm: 'Baumaterial', mun: 'Munition', fuel: 'Treibstoff' };
const NEG_COLOR = '#e5484d'; // Verbrauch (negative Netto-Rate)
const COLOR = { bm: '#a0703f', mun: '#7f93ad', fuel: '#9b7bc4', cargo: '#c9a227' };
const PRESET_NAME = { mix: 'Gemischt', bm: 'Baumaterial', mun: 'Munition', fuel: 'Treibstoff' };
const STORE_CAP = BALANCE.logistics.storeCap;
const TRUCK_CAP = BALANCE.logistics.truckCapacity;
const SITE_BM = BALANCE.construction.fobMaterial;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (f) => `${Math.max(0, Math.min(1, f)) * 100}%`;
const hpColor = (f) => (f > 0.5 ? '#7dd38b' : f > 0.25 ? '#e0b44a' : '#e5484d');
const bar = (f, cls = '', color = '') => `<div class="bar ${cls}"><i style="width:${pct(f)}${color ? `;background:${color}` : ''}"></i></div>`;

function fmtRate(v) {
  if (Math.abs(v) < 0.05) return '0';
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
}

function fmtTime(s) {
  const t = Math.max(0, Math.floor(s));
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Zeile „Name · Balken · Zahl / Obergrenze“ (Einheiten: Munition, Treibstoff, Ladung). */
function gauge(label, val, max, color) {
  const v = Math.max(0, Math.floor(val));
  return `<div class="gauge"><div class="gl"><span>${label}</span><b>${v} / ${max}</b></div>${bar(val / max, '', color)}</div>`;
}

/** Lagerzeile einer FOB: Sorte, Balken, Zahl / Obergrenze. */
function storeRow(label, val, cap, color) {
  return `<div class="srow"><span>${label}</span>${bar(val / cap, 'store', color)}<b>${Math.floor(val)} / ${cap}</b></div>`;
}

export class Hud {
  /**
   * @param {HTMLElement} root  leerer Container; die HUD-Struktur wird hier erzeugt
   * @param {object} app       optional: { status(), changeSpeed(dir), cycleSpeed(), togglePause(), toggleHelp(), debug }
   */
  constructor(root, game, team, controller, app = {}) {
    this.root = root;
    this.game = game;
    this.team = team;
    this.controller = controller;
    this.app = app;
    this.lastDom = -1e9;
    this.selHtml = '';
    this.cmdHtml = '';
    this.entries = [];
    this.msgs = [];

    root.innerHTML = this.template();
    root.hidden = false;
    const q = (s) => root.querySelector(s);
    this.minimapCanvas = q('.mm canvas');
    this.msgEl = q('[data-msgs]');
    this.selEl = q('[data-sel]');
    this.cmdEl = q('[data-cmd]');
    this.timeEl = q('[data-time]');
    this.zoneEl = q('[data-zone]');
    this.hotEl = q('[data-hot]');
    this.speedBtn = q('[data-act=speed]');
    this.pauseBtn = q('[data-act=pause]');
    this.res = {};
    for (const k of RES_KEYS) {
      this.res[k] = { box: q(`[data-res=${k}]`), val: q(`[data-res=${k}] .val`), rate: q(`[data-res=${k}] .rate`) };
    }
    this.pts = [0, 1].map((t) => ({
      fill: q(`[data-pf="${t}"]`),
      prog: q(`[data-pp="${t}"]`),
      num: q(`[data-pn="${t}"]`),
    }));

    this.onClick = (e) => this.click(e);
    root.addEventListener('click', this.onClick);
  }

  template() {
    const g = this.game;
    const res = RES_KEYS.map(
      (k) =>
        `<div class="res res-${k}" data-res="${k}"><i class="dot"></i><span class="lbl">${BALANCE.resNames[k]}</span>` +
        `<b class="val">0</b><small class="rate">+0/s</small></div>`,
    ).join('');
    const pts = [0, 1]
      .map(
        (t) =>
          `<div class="pt" style="--c:${BALANCE.teamColors[t]}"><span class="pt-name">${BALANCE.teamNames[t]}</span>` +
          `<div class="pt-track"><i class="pt-fill" data-pf="${t}"></i><i class="pt-prog" data-pp="${t}"></i></div>` +
          `<b class="pt-num" data-pn="${t}">0 / ${g.winPoints}</b></div>`,
      )
      .join('');
    return `
      <header class="top">
        <div class="res-row">${res}</div>
        <div class="pts">${pts}</div>
        <div class="zone" data-zone>neutral</div>
        <div class="zone hotz" data-hot title="Hot Zone: kleiner Kreis in der Konfliktzone, zieht zu aktiven Bohrern. Geld und Punkte für den Besitzer.">HOT</div>
        <div class="clock">
          ${this.app.debug ? '<span class="dbg">DEBUG</span>' : ''}
          <span class="time" data-time>00:00</span>
          <button type="button" class="btn-sm" data-act="speed" title="Spielgeschwindigkeit (+ / -)">1×</button>
          <button type="button" class="btn-sm" data-act="pause" title="Pause (P)">Pause</button>
          <button type="button" class="btn-sm" data-act="help" title="Hilfe (F1)">Hilfe</button>
        </div>
      </header>
      <div class="msgs" data-msgs></div>
      <div class="bottom">
        <div class="panel mm"><canvas aria-label="Übersicht"></canvas></div>
        <div class="panel sel" data-sel></div>
        <div class="panel cmd" data-cmd></div>
      </div>`;
  }

  click(e) {
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'speed') this.app.cycleSpeed?.();
      else if (act.dataset.act === 'pause') this.app.togglePause?.();
      else if (act.dataset.act === 'help') this.app.toggleHelp?.();
      return;
    }
    const cb = e.target.closest('.cbtn');
    if (cb) {
      const en = this.entries[Number(cb.dataset.i)];
      if (en) {
        if (en.enabled) en.action();
        else this.controller.message(en.reason || en.tip);
      }
      this.refresh();
      return;
    }
    const msg = e.target.closest('.msg.go');
    if (msg) {
      const m = this.msgs[Number(msg.dataset.m)];
      if (m && m.pos) this.controller.camera.centerOn(m.pos.x, m.pos.y);
    }
  }

  /** Aktualisiert alle Teile, höchstens alle 200 ms (außer force). */
  update(force = false) {
    const now = performance.now();
    if (!force && now - this.lastDom < DOM_EVERY) return;
    this.lastDom = now;
    this.updateTop();
    this.updateSelection();
    this.updateCommands();
    this.expire(now);
  }

  refresh() {
    this.update(true);
  }

  updateTop() {
    const g = this.game;
    const t = g.teams[this.team];
    for (const k of RES_KEYS) {
      const el = this.res[k];
      const v = t.income[k];
      const neg = v <= -0.05; // Netto-Verbrauch (Munition/Treibstoff)
      el.val.textContent = String(Math.floor(t.res[k]));
      el.rate.textContent = `${neg ? '−' : '+'}${fmtRate(Math.abs(v))}/s`;
      el.rate.style.color = neg ? NEG_COLOR : '';
      // Lagersorten: Summe aller fertigen FOB-Lager; Geld ist global
      const lines = [k === 'money' ? 'Geld (global, nicht pro FOB)' : 'Summe aller FOB-Lager'];
      if (t.used[k] !== undefined) lines.push(`verbraucht: ${Math.floor(t.used[k])}`);
      const tip = lines.join('\n');
      if (el.box.title !== tip) el.box.title = tip;
    }
    for (let i = 0; i < 2; i++) {
      const tm = g.teams[i];
      const p = this.pts[i];
      p.fill.style.width = pct(tm.points / g.winPoints);
      p.prog.style.width = pct(tm.pointProgress / BALANCE.pointInterval);
      p.num.textContent = `${tm.points} / ${g.winPoints}`;
    }
    const z = g.zone;
    let label;
    let col;
    if (z.contested) {
      label = 'umkämpft';
      col = '#e8ece4';
    } else if (z.owner >= 0) {
      label = `Zone: ${BALANCE.teamNames[z.owner]}`;
      col = BALANCE.teamColors[z.owner];
    } else {
      label = 'neutral';
      col = '#9aa596';
    }
    const [c0, c1] = BALANCE.teamColors;
    this.zoneEl.innerHTML =
      `<span class="zone-state" style="color:${col}">${label}</span>` +
      `<span class="zone-cnt"><b style="color:${c0}">${z.counts[0]}</b><i>:</i><b style="color:${c1}">${z.counts[1]}</b></span>`;
    const hz = g.hot;
    const hc = hz.contested ? '#e8ece4' : hz.owner >= 0 ? BALANCE.teamColors[hz.owner] : '#9aa596';
    const hl = hz.contested ? 'HOT umkämpft' : hz.owner >= 0 ? `HOT ${BALANCE.teamNames[hz.owner]}` : 'HOT neutral';
    this.hotEl.innerHTML =
      `<span class="zone-state" style="color:${hc}">${hl}</span>` +
      `<span class="zone-cnt"><b style="color:${c0}">${hz.counts[0]}</b><i>:</i><b style="color:${c1}">${hz.counts[1]}</b></span>`;
    this.timeEl.textContent = fmtTime(g.time);
    const st = this.app.status ? this.app.status() : { paused: false, speed: 1 };
    this.speedBtn.textContent = `${st.speed}×`;
    this.pauseBtn.textContent = st.paused ? 'Weiter' : 'Pause';
  }

  updateSelection() {
    const c = this.controller;
    const sel = c.selected();
    const hint = c.hint();
    let html = hint ? `<div class="hint">${esc(hint)}</div>` : '';
    if (!sel.length) {
      html +=
        '<div class="empty">Nichts ausgewählt</div>' +
        '<div class="muted small">Klick wählt, Rahmen für mehrere, Rechtsklick befiehlt. F1 zeigt alle Tasten.</div>';
    } else if (sel.length === 1) {
      html += sel[0].kind === 'unit' ? this.unitInfo(sel[0]) : this.buildingInfo(sel[0]);
    } else {
      html += this.multiInfo(sel);
    }
    if (html !== this.selHtml) {
      this.selHtml = html;
      this.selEl.innerHTML = html;
    }
  }

  /** Einzelne Einheit: HP, Vorrat (Munition/Treibstoff), LKW-Ladung, Auftrag. */
  unitInfo(u) {
    const f = u.hp / u.maxHp;
    let h =
      `<div class="title">${esc(u.def.name)}</div>${bar(f, 'hp', hpColor(f))}` +
      `<div class="muted small">${Math.ceil(u.hp)} / ${u.maxHp} HP · ${esc(orderText(this.game, u))}</div>`;
    if (u.def.ammoMax) {
      h += gauge('Munition', u.ammo, u.def.ammoMax, COLOR.mun);
      if (u.def.range > 0 && u.ammo < u.def.ammoPerShot) h += `<div class="warn small">Keine Munition – feuert nicht</div>`;
    }
    if (u.def.fuelMax) {
      h += gauge('Treibstoff', u.fuel, u.def.fuelMax, COLOR.fuel);
      if (u.fuel <= 0) h += `<div class="warn small">Kein Treibstoff – nur 25 % Tempo</div>`;
    }
    if (u.def.seats) {
      h += gauge('Passagiere', u.passengers.length, u.def.seats, COLOR.cargo);
    }
    if (u.def.cargoCap) {
      const c = u.cargo;
      const sum = c.bm + c.mun + c.fuel;
      h += gauge('Ladung', sum, u.def.cargoCap, COLOR.cargo);
      h +=
        `<div class="muted small">${Math.floor(c.bm)} BM · ${Math.floor(c.mun)} MUN · ${Math.floor(c.fuel)} TS` +
        ` · Ladungsart: ${PRESET_NAME[u.preset] || u.preset}</div>`;
    }
    return h;
  }

  /** Gebäude: FOB (Lager, Baustelle), Baustelle (Fortschritt, Status), Förderanlage, Ausbildung. */
  buildingInfo(b) {
    const g = this.game;
    const f = b.hp / b.maxHp;
    const name = b.type === 'fob' ? fobLabel(g, b) : b.def.name;
    let h = `<div class="title">${esc(name)}</div>${bar(f, 'hp', hpColor(f))}`;
    if (!b.built) {
      h += `<div class="muted small">${esc(this.siteStatus(b))}</div>${bar(b.progress, 'prog')}`;
    } else {
      h += '<div class="muted small">Einsatzbereit</div>';
    }
    if (b.type === 'fob') {
      h +=
        '<div class="muted small lagerhead">Lager dieser FOB</div>' +
        storeRow('BM', b.store.bm, STORE_CAP, COLOR.bm) +
        storeRow('MUN', b.store.mun, STORE_CAP, COLOR.mun) +
        storeRow('TS', b.store.fuel, STORE_CAP, COLOR.fuel);
    }
    if (b.type === 'extractor' && b.nodeId) {
      const n = g.nodeById.get(b.nodeId);
      if (n) h += `<div class="muted small">Fördert ${NODE_NAME[n.type]} · ${b.def.yields[n.type]}/s</div>`;
      if (b.built) {
        const sup = g.supplierOf(b);
        h += sup
          ? `<div class="muted small">Liefert an ${esc(fobLabel(g, sup))}</div>`
          : `<div class="warn small">Keine FOB in Reichweite – ruht</div>`;
      }
    }
    if (b.def.weapon && b.def.weapon.shell && b.built) {
      const w = b.def.weapon;
      h += b.fireTarget
        ? `<div class="muted small">Ziel gewählt · Schuss alle ${w.cooldown} s · Reichweite ${w.range} px</div>`
        : `<div class="muted small">Kein Ziel: G oder Rechtsklick wählt eins · Reichweite ${w.range} px</div>`;
      const sup = g.supplierOf(b);
      if (!sup) h += `<div class="warn small">Keine FOB in Reichweite – keine Munition</div>`;
      else if (sup.store.mun < w.ammoPerShot) h += `<div class="warn small">FOB ohne Munition – feuert nicht</div>`;
    }
    if (b.drill && b.built) h += this.drillInfo(b);
    if (b.queue.length) {
      const ut = UNITS[b.queue[0].unit ?? b.queue[0]];
      const shown = Math.min(ut.buildTime, b.queueTime).toFixed(0);
      h +=
        `<div class="queue"><div class="small">${esc(ut.name)}: ${shown} / ${ut.buildTime} s</div>` +
        `${bar(b.queueTime / ut.buildTime, 'prog')}` +
        `<div class="muted small">Warteschlange: ${b.queue.map((e) => esc(UNITS[e.unit ?? e].name)).join(', ')}</div></div>`;
    }
    return h;
  }

  /** Bohrer: Phase und Restzeit. */
  drillInfo(b) {
    const g = this.game;
    const d = b.drill;
    const cfg = b.def.drill;
    const left = Math.max(0, Math.ceil((d.state === 'active' ? d.endAt : d.readyAt) - g.time));
    const txt = {
      warmup: `Wärmt auf · bereit in ${left} s`,
      ready: 'Bereit: G aktiviert (braucht Treibstoff in der FOB)',
      active: `Aktiv · noch ${left} s · ${cfg.fuelPerSec} TS/s aus der FOB`,
      cooldown: `Abkühlen · bereit in ${left} s`,
    }[d.state];
    return `<div class="muted small">${esc(txt)}</div>`;
  }

  /** Status einer Baustelle: Material (FOB-Baustelle), dann Baufahrzeug/Bauer, sonst Fortschritt. */
  siteStatus(b) {
    if (b.type === 'fob' && !b.supplied && b.store.bm < SITE_BM) {
      return `Wartet auf Material (${Math.min(Math.floor(b.store.bm), SITE_BM)}/${SITE_BM})`;
    }
    const st = builderState(this.game, b);
    if (st === 'near') return `Im Bau · ${Math.floor(b.progress * 100)} %`;
    if (st === 'assigned') return 'Baufahrzeug unterwegs';
    return b.type === 'wall' || b.type === 'gate' ? 'Wartet auf Infanterie oder Baufahrzeug' : 'Wartet auf Baufahrzeug';
  }

  /** Mehrfachauswahl: Anzahl je Typ, Einheiten ohne Munition/Treibstoff. */
  multiInfo(sel) {
    const units = sel.filter((e) => e.kind === 'unit');
    const blds = sel.length - units.length;
    const counts = new Map();
    for (const e of sel) counts.set(e.def.name, (counts.get(e.def.name) || 0) + 1);
    const title = [units.length ? `${units.length} Einheiten` : '', blds ? `${blds} Gebäude` : ''].filter(Boolean).join(' · ');
    const chips = [...counts].map(([n, c]) => `<span>${c}× ${esc(n)}</span>`).join('');
    const noAmmo = units.filter((u) => u.def.range > 0 && u.def.ammoMax && u.ammo < u.def.ammoPerShot).length;
    const noFuel = units.filter((u) => u.def.fuelMax && u.fuel <= 0).length;
    const warn = [noAmmo ? `${noAmmo} ohne Munition` : '', noFuel ? `${noFuel} ohne Treibstoff` : ''].filter(Boolean);
    return (
      `<div class="title">${title}</div><div class="chips">${chips}</div>` +
      (warn.length ? `<div class="warn small">${esc(warn.join(' · '))}</div>` : '')
    );
  }

  updateCommands() {
    const entries = this.controller.commandCard();
    this.entries = entries;
    const html = entries
      .map(
        (e, i) =>
          `<button type="button" class="cbtn${e.enabled ? '' : ' off'}${e.active ? ' on' : ''}" data-i="${i}" ` +
          `data-tip="${esc(e.enabled ? e.tip : e.reason || e.tip)}">` +
          `<span class="cl">${esc(e.label)}</span>` +
          `${e.cost ? `<span class="cc">${esc(e.cost)}</span>` : ''}` +
          `${e.hotkey ? `<span class="ck">${esc(e.hotkey)}</span>` : ''}</button>`,
      )
      .join('');
    if (html !== this.cmdHtml) {
      this.cmdHtml = html;
      this.cmdEl.innerHTML = html;
    }
  }

  /** Meldung anzeigen (höchstens 5, je 6 s). pos = {x, y} in Welt: Klick springt dorthin. */
  pushMessage(text, pos = null) {
    const now = performance.now();
    if (this.msgs.some((m) => m.text === text && now - m.t < 1500)) return;
    this.msgs.push({ text, pos, t: now });
    if (this.msgs.length > MSG_MAX) this.msgs.splice(0, this.msgs.length - MSG_MAX);
    this.renderMsgs();
  }

  renderMsgs() {
    this.msgEl.innerHTML = this.msgs
      .map((m, i) => `<div class="msg${m.pos ? ' go' : ''}" data-m="${i}">${esc(m.text)}</div>`)
      .join('');
  }

  expire(now) {
    const n = this.msgs.length;
    this.msgs = this.msgs.filter((m) => now - m.t < MSG_LIFE);
    if (this.msgs.length !== n) this.renderMsgs();
  }

  destroy() {
    this.root.removeEventListener('click', this.onClick);
    this.root.innerHTML = '';
    this.root.hidden = true;
  }
}
