// DOM-HUD (docs/verlauf.md §5 ui/hud.js, §11.4): Ressourcen, Punkte, Zone, Zeit, Auswahl, Befehlskarte und Meldungen.
// Schreibt das DOM höchstens 5× pro Sekunde und nur, wenn sich der HTML-Text geändert hat.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { lacksAmmo, isFoe } from '../game/entities.js';
import { storedCrates } from '../game/crates.js';
import { heightMult } from '../game/combat.js';
import { radios, radioLeft } from '../game/radio.js';
import { SEASON_NAMES, WEATHER_NAMES, weatherEffect } from '../game/weather.js';
import { RESEARCH_KEYS } from '../game/research.js';

// Wettersymbole (16 × 16, Strichfarbe = currentColor)
const WX_ICON = {
  clear: '<circle cx="8" cy="8" r="3" fill="currentColor"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
  rain: '<path d="M4.5 9.5h7a2.4 2.4 0 0 0 .2-4.8A3.4 3.4 0 0 0 5.2 4.6 2.5 2.5 0 0 0 4.5 9.5z" fill="currentColor" stroke="none"/><path d="M5.5 11.5l-1 2.5M8.5 11.5l-1 2.5M11.5 11.5l-1 2.5"/>',
  fog: '<path d="M2 4.5h12M3.5 8h10M2 11.5h12"/>',
  snow: '<path d="M8 1.8v12.4M2.6 4.9l10.8 6.2M2.6 11.1l10.8-6.2M6.6 2.6L8 4l1.4-1.4M6.6 13.4L8 12l1.4 1.4"/>',
};
const WX_COLOR = { clear: '#f2c94c', rain: '#8fb3d9', fog: '#c8ccc4', snow: '#e8f1fb' };
import { builderState, fobLabel, orderText } from './status.js';

const RES_KEYS = ['money', 'bm', 'mun', 'fuel'];
const SHORT_RES = { bm: 'BM', mun: 'MUN', fuel: 'TS' }; // Front-Lager: Summe der FOB-Lager ohne Haupt-FOB
const MSG_LIFE = 6000; // ms
const MSG_MAX = 5;
const DOM_EVERY = 200; // ms
const NEG_COLOR = '#e5484d'; // Verbrauch (negative Netto-Rate)
const COLOR = { bm: '#a0703f', mun: '#7f93ad', fuel: '#9b7bc4', cargo: '#c9a227' };
const PRESET_NAME = { mix: 'Gemischt', bm: 'Baumaterial', mun: 'Munition', fuel: 'Treibstoff' };
const STORE_CAP = BALANCE.logistics.storeCap;
const TRUCK_CAP = BALANCE.logistics.truckCapacity;
const SITE_BM = BALANCE.construction.fobMaterial;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (f) => `${Math.max(0, Math.min(1, f)) * 100}%`;
const hpColor = (f) => (f > 0.5 ? '#7dd38b' : f > 0.25 ? '#e0b44a' : '#e5484d');
const fmtDe = (v) => String(v).replace('.', ',');
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
    this.radioEl = q('[data-radio]');
    this.wxEl = q('[data-wx]');
    this.wxKey = '';
    this.capFill = q('[data-cap]');
    this.speedBtn = q('[data-act=speed]');
    this.pauseBtn = q('[data-act=pause]');
    this.viewBtn = q('[data-act=view]');
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
        `<div class="res res-${k}" data-res="${k}"><i class="dot"></i><span class="lbl">${k === 'money' ? BALANCE.resNames[k] : `Front ${SHORT_RES[k]}`}</span>` +
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
        <div class="cap" title="Punktebalken: füllt sich für das Team mit mehr Spielern in der Konfliktzone (Hot Zone zählt doppelt). Voll = 1 Punkt."><i data-cap></i></div>
        <div class="zone hotz" data-hot title="Hot Zone: kleiner Kreis in der Konfliktzone, zieht zu aktiven Bohrern. Einheiten darin bringen doppeltes Zonengeld und zählen bei der Punktewertung doppelt.">HOT</div>
        <div class="zone radioz" data-radio hidden title="Sendemast: steht er die volle Zeit, gewinnt sein Team. Zerstören setzt die Zeit zurück."></div>
        <div class="clock">
          ${this.app.debug ? '<span class="dbg">DEBUG</span>' : ''}
          ${g.weather?.on ? '<button type="button" class="wx" data-act="weather" data-wx></button>' : ''}
          <span class="time" data-time>00:00</span>
          <button type="button" class="btn-sm" data-act="speed" title="Spielgeschwindigkeit (+ / -)">1×</button>
          <button type="button" class="btn-sm" data-act="pause" title="Pause (P)">Pause</button>
          <button type="button" class="btn-sm" data-act="rotl" title="Isometrische Ansicht nach links drehen (,)">⟲</button>
          <button type="button" class="btn-sm" data-act="view" title="Ansicht umschalten: 2D / isometrisch (V)">2D</button>
          <button type="button" class="btn-sm" data-act="rotr" title="Isometrische Ansicht nach rechts drehen (.)">⟳</button>
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
      else if (act.dataset.act === 'view') this.app.toggleView?.();
      else if (act.dataset.act === 'rotl') this.app.rotateView?.(-1);
      else if (act.dataset.act === 'rotr') this.app.rotateView?.(1);
      else if (act.dataset.act === 'weather') this.controller.message(this.weatherText());
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
      const lines = [k === 'money' ? `Geld (global): je Einheit in der Konfliktzone ${fmtDe(BALANCE.zone.unitIncome)}/s, in der Hot Zone ${fmtDe(BALANCE.hot.unitIncome)}/s, je eingelagerte Versorgungskiste ${fmtDe(BALANCE.crates.income)}/s; bleibt von Runde zu Runde` : 'Front-Lager: Summe der FOB-Lager ohne Haupt-FOB (die hat unendlich)'];
      if (t.used[k] !== undefined) lines.push(`verbraucht: ${Math.floor(t.used[k])}`);
      const tip = lines.join('\n');
      if (el.box.title !== tip) el.box.title = tip;
    }
    for (let i = 0; i < 2; i++) {
      const tm = g.teams[i];
      const p = this.pts[i];
      p.fill.style.width = pct(tm.points / g.winPoints);
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
    // Geld des eigenen Teams aus der Zone: je Einheit in der Zone, in der Hot Zone das Doppelte
    const me = this.team;
    const hzCount = g.hot ? g.hot.counts[me] : 0;
    const nCrates = storedCrates(g, me);
    const crateTxt = nCrates ? `, ${nCrates} Kiste${nCrates > 1 ? 'n' : ''}` : '';
    const inc =
      `<span class="zone-inc" title="Geld aus der Konfliktzone (je Einheit ${fmtDe(BALANCE.zone.unitIncome)}/s, in der Hot Zone ${fmtDe(BALANCE.hot.unitIncome)}/s) und aus Versorgungskisten (je ${fmtDe(BALANCE.crates.income)}/s)">` +
      `+${fmtRate(t.rate.money)} Geld/s (${z.counts[me]} Einheiten in der Zone, ${hzCount} in der Hot Zone${crateTxt})</span>`;
    this.zoneEl.innerHTML =
      `<span class="zone-state" style="color:${col}">${label}</span>` +
      `<span class="zone-cnt"><b style="color:${c0}">${z.counts[0]}</b><i>:</i><b style="color:${c1}">${z.counts[1]}</b></span>` +
      `<span class="zone-cnt" title="Wertung (Hot Zone doppelt)"><small>Wertung</small> <b style="color:${c0}">${z.weight[0]}</b><i>:</i><b style="color:${c1}">${z.weight[1]}</b></span>` +
      inc;
    const bar = z.bar;
    this.capFill.style.width = pct(bar.p);
    this.capFill.style.background = bar.team >= 0 ? BALANCE.teamColors[bar.team] : 'transparent';
    const hz = g.hot;
    const hc = hz.contested ? '#e8ece4' : hz.owner >= 0 ? BALANCE.teamColors[hz.owner] : '#9aa596';
    const hl = hz.contested ? 'HOT umkämpft' : hz.owner >= 0 ? `HOT ${BALANCE.teamNames[hz.owner]}` : 'HOT neutral';
    this.hotEl.innerHTML =
      `<span class="zone-state" style="color:${hc}">${hl}</span>` +
      `<span class="zone-cnt"><b style="color:${c0}">${hz.counts[0]}</b><i>:</i><b style="color:${c1}">${hz.counts[1]}</b></span>`;
    // Sendemast: Restzeit je fertigem Mast (beide Seiten sehen sie)
    const masts = radios(g);
    this.radioEl.hidden = !masts.length;
    if (masts.length === 1) {
      const b = masts[0];
      this.radioEl.innerHTML = `<span class="zone-state" style="color:${BALANCE.teamColors[b.team]}">Sendemast ${BALANCE.teamNames[b.team]}</span><b class="zone-cnt">${fmtTime(radioLeft(b))}</b>`;
    } else if (masts.length) {
      // zwei Masten: je eine kompakte Zeile
      this.radioEl.innerHTML = masts
        .map((b) => `<span class="radio-row" style="color:${BALANCE.teamColors[b.team]}">Mast ${BALANCE.teamNames[b.team]} <b>${fmtTime(radioLeft(b))}</b></span>`)
        .join('');
    }
    this.updateWeather();
    this.timeEl.textContent = fmtTime(g.time);
    const st = this.app.status ? this.app.status() : { paused: false, speed: 1 };
    this.speedBtn.textContent = `${st.speed}×`;
    this.pauseBtn.textContent = st.paused ? 'Weiter' : 'Pause';
    this.viewBtn.textContent = this.controller.camera.iso ? 'Iso' : '2D';
  }

  /** Wetter in Worten: „Winter, Nebel: Sicht −35 %, Fahrzeuge −10 %“. */
  weatherText() {
    const w = this.game.weather;
    const eff = weatherEffect(w.kind, w.season);
    return `${SEASON_NAMES[w.season]}, ${WEATHER_NAMES[w.kind]}${eff ? `: ${eff}` : ': keine Einschränkung'}`;
  }

  /** Wetteranzeige oben (Symbol und Name; nur neu, wenn sich etwas ändert). */
  updateWeather() {
    const w = this.game.weather;
    if (!this.wxEl || !w?.on) return;
    const key = `${w.season}/${w.kind}`;
    if (key === this.wxKey) return;
    this.wxKey = key;
    this.wxEl.style.color = WX_COLOR[w.kind];
    this.wxEl.title = `${this.weatherText()} (antippen für Details)`;
    this.wxEl.innerHTML =
      `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${WX_ICON[w.kind]}</svg>` +
      `<span class="wx-name"><small>${SEASON_NAMES[w.season]}</small> ${WEATHER_NAMES[w.kind]}</span>`;
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
    if (u.house) h += this.houseInfo(u);
    if (u.crate) h += `<div class="muted small">Trägt eine Versorgungskiste: ${Math.round(BALANCE.crates.carrySpeed * 100)} % Tempo, schießt nicht · K = ablegen</div>`;
    if (this.game.relief && !u.def.air) h += this.heightInfo(u);
    if (u.weapons.length) {
      for (const w of u.weapons) h += gauge(w.spec.name, Math.floor(w.rounds), w.spec.rounds, COLOR.mun);
      h += `<div class="muted small">Nachladen in der FOB: ${Math.ceil(u.def.ammoMax - u.ammo)} Munition fehlen</div>`;
      if (lacksAmmo(u)) h += `<div class="warn small">Keine Munition – feuert nicht</div>`;
    }
    if (u.def.bmCap) {
      h += gauge('Baumaterial', Math.floor(u.cargo.bm), u.def.bmCap, COLOR.bm);
      h += `<div class="muted small">Baut Mauern und Tore aus getragenem Baumaterial (nachladen in einer FOB)</div>`;
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

  /** Besatzer eines Stadthauses: Haus, Plätze, Zustand. */
  houseInfo(u) {
    const h = this.game.getEntity(u.house);
    if (!h) return '';
    const f = h.hp / h.maxHp;
    return (
      `<div class="muted small">Im Gebäude: ${esc(h.def.name)} · ${h.occupants.length} / ${h.def.cap} Plätze · Zustand ${Math.ceil(f * 100)} %</div>` +
      bar(f, 'hp', hpColor(f)) +
      '<div class="muted small">Geschützt, schießt ab der Hauswand · O = aussteigen</div>'
    );
  }

  /** Standhöhe; zeigt der Zeiger auf einen sichtbaren Gegner, auch den Höhenvorteil gegen ihn. */
  heightInfo(u) {
    const g = this.game;
    let line = `Standhöhe ${Math.round(g.groundHeight(u) + (u.house ? BALANCE.garrison.floor : 0))}`;
    const t = g.getEntity(this.controller.view.hoverId);
    if (isFoe(u.team, t) && u.weapons.length && g.sees(u.team, t)) {
      const m = heightMult(g, u, t);
      const p = Math.round(Math.abs(m - 1) * 100);
      if (p >= 1) line += m > 1 ? ` · Ziel tiefer: +${p} % Schaden` : ` · Ziel höher: −${p} % Schaden`;
    }
    return `<div class="muted small">${esc(line)}</div>`;
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
    const crates = b.type === 'fob' ? storedCrates(g, b.team, b.id) : 0;
    if (crates) h += `<div class="muted small">${crates} Versorgungskiste${crates > 1 ? 'n' : ''} eingelagert: +${fmtDe(crates * BALANCE.crates.income)} Geld/s</div>`;
    if (b.type === 'fob' && b.infinite) {
      h += '<div class="muted small lagerhead">Unendlich Baumaterial, Munition und Treibstoff · bildet alle Einheiten aus (nur gegen Geld)</div>';
      h += this.reinforceInfo(b);
      if (g.research) h += this.researchInfo(b.team);
    } else if (b.type === 'fob') {
      h +=
        '<div class="muted small lagerhead">Lager dieser FOB (LKW füllen es aus der Haupt-FOB)</div>' +
        storeRow('BM', b.store.bm, STORE_CAP, COLOR.bm) +
        storeRow('MUN', b.store.mun, STORE_CAP, COLOR.mun) +
        storeRow('TS', b.store.fuel, STORE_CAP, COLOR.fuel);
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
      // die ersten trainSlots Aufträge laufen gleichzeitig, je mit eigenem Fortschritt
      const slots = Math.min(BALANCE.trainSlots, b.queue.length);
      let rows = '';
      for (let i = 0; i < slots; i++) {
        const ut = UNITS[b.queue[i].unit];
        const shown = Math.min(ut.buildTime, b.queueTimes[i]).toFixed(0);
        rows += `<div class="small">${esc(ut.name)}: ${shown} / ${ut.buildTime} s</div>${bar(b.queueTimes[i] / ut.buildTime, 'prog')}`;
      }
      const rest = b.queue.slice(slots);
      if (rest.length) rows += `<div class="muted small">Warteschlange: ${rest.map((e) => esc(UNITS[e.unit].name)).join(', ')}</div>`;
      h += `<div class="queue">${rows}</div>`;
    }
    return h;
  }

  /** Haupt-FOB: Soldaten-Nachschub (Restzeit bis zum nächsten Schützen oder Ruhezustand). */
  reinforceInfo(b) {
    const g = this.game;
    const R = BALANCE.reinforce;
    const t = g.teams[b.team];
    const soldiers = g.soldierCount(b.team);
    const label = `Soldaten ${soldiers}/${R.soldierMin}, Plätze ${g.slotsUsed(b.team)}/${BALANCE.slotCap}`;
    if (soldiers >= R.soldierMin) {
      return `<div class="muted small">Nachschub ruht (${label})</div>`;
    }
    const left = Math.max(0, Math.ceil(R.interval - t.reinforceTimer)); // 0, solange kein Feld frei ist
    return `<div class="muted small">Nachschub: ${esc(UNITS[R.unit].name)} in ${left} s (${label})</div>`;
  }

  /** Haupt-FOB mit Forschung: Stufe, erforschte Verbesserungen, laufende Forschung mit Fortschritt. */
  researchInfo(team) {
    const tech = this.game.teams[team].tech;
    const items = BALANCE.research.items;
    const ups = RESEARCH_KEYS.filter((k) => !items[k].tier && tech.done.includes(k)).map((k) => items[k].name);
    let h = `<div class="small research">Stufe ${tech.tier} von 3${ups.length ? ` · ${esc(ups.join(', '))}` : ''}</div>`;
    const cur = tech.cur;
    if (cur) {
      const it = items[cur.key];
      h += `<div class="small">Forschung ${esc(it.name)}: ${Math.min(it.time, cur.t).toFixed(0)} / ${it.time} s</div>${bar(cur.t / it.time, 'prog research')}`;
    } else if (tech.tier < 3) {
      h += '<div class="muted small">U = Forschung (nächste Stufe, Verbesserungen)</div>';
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
    const noAmmo = units.filter((u) => lacksAmmo(u)).length;
    const noFuel = units.filter((u) => u.def.fuelMax && u.fuel <= 0).length;
    const warn = [noAmmo ? `${noAmmo} ohne Munition` : '', noFuel ? `${noFuel} ohne Treibstoff` : ''].filter(Boolean);
    const inside = units.filter((u) => u.house).length;
    return (
      `<div class="title">${title}</div><div class="chips">${chips}</div>` +
      (inside ? `<div class="muted small">${inside} im Gebäude · O = aussteigen</div>` : '') +
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
