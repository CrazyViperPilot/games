// ui.js – DOM-Screens: Hauptmenü, Levelauswahl, Arsenal, Einstellungen, Pause, Ergebnis, Bestätigung.
// Alle Screens werden als innerHTML in #ui gerendert. Klicks laufen über eine Delegation am Root.
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';
import { writeSave, resetSave } from '../core/save.js';
import { UPGRADES } from '../data/upgrades.js';
import { WEAPONS } from '../data/weapons.js';
import { BAL, upgradeCost } from '../data/balance.js';

// Levelauswahl zeigt 1 … ENDLESS_START-1 (20 Level), darüber Endlos-Modus.
const LEVEL_COUNT = BAL.ENDLESS_START - 1;
// Anzeige-Schrittweite der prozentualen Upgrades (muss zur Logik passen, PLAN.md §5).
const STEP_PCT = { damage: 8, fireRate: 6 };

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export class UI {
  constructor(root, api) {
    this.root = root;
    this.api = api; // { getSave, setSave, startLevel, resume, restart, toMenu, debug }
    this._back = () => this.showMenu();
    this._lastResult = null;
    this._modal = null;
    this._confirmRes = null;

    this._acts = {
      start: () => this.api.startLevel(this.api.getSave().unlocked),
      levels: () => this.showLevels(),
      level: (arg) => this.api.startLevel(Number(arg)),
      endless: () => this.api.startLevel(Math.max(BAL.ENDLESS_START, this.api.getSave().unlocked)),
      jump: () => this._jump(),
      shop: () => this.showShop(),
      shopResult: () => this.showShop(() => this.showResult(this._lastResult)),
      settings: () => this.showSettings(),
      menu: () => this.showMenu(),
      back: () => this._back(),
      buy: (arg) => this._buy(arg),
      sound: () => this._toggle('sound'),
      vib: () => this._toggle('vibration'),
      reset: () => this._reset(),
      resume: () => this.api.resume(),
      restart: () => this.api.restart(),
      abort: () => this._abort(),
      toMenu: () => this.api.toMenu(),
      next: () => this.api.startLevel(this._lastResult.level + 1),
      cy: () => this._closeConfirm(true),
      cn: () => this._closeConfirm(false),
    };

    root.addEventListener('click', (e) => this._onClick(e));
  }

  // ---------- Grundgerüst ----------

  _onClick(e) {
    const btn = e.target instanceof Element ? e.target.closest('button[data-act]') : null;
    if (!btn || btn.disabled || btn.classList.contains('locked')) return;
    audio.click();
    haptics.tap();
    const fn = this._acts[btn.dataset.act];
    if (fn) fn(btn.dataset.arg);
  }

  _screen(html) {
    this.root.innerHTML = `<div class="screen">${html}</div>`;
  }

  hideAll() {
    this._closeConfirm(false);
    this.root.innerHTML = '';
  }

  // ---------- Hauptmenü ----------

  showMenu() {
    const s = this.api.getSave();
    this._screen(`
      <div class="menu-head">
        <h1 class="title">GATE SQUAD</h1>
        <p class="subtitle">Taktischer Tor-Shooter</p>
      </div>
      <p class="coin-line"><span class="coins">${s.coins}</span></p>
      <div class="menu-stack">
        <button class="btn primary" data-act="start">Einsatz starten</button>
        <button class="btn" data-act="levels">Levelauswahl</button>
        <button class="btn" data-act="shop">Arsenal</button>
        <button class="btn" data-act="settings">Einstellungen</button>
      </div>
      ${s.endlessBest > 0 ? `<p class="footnote">Endlos-Rekord: Level ${s.endlessBest}</p>` : ''}
    `);
  }

  // ---------- Levelauswahl ----------

  showLevels() {
    const s = this.api.getSave();
    const dbg = !!this.api.debug;
    let grid = '';
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const best = s.best[n];
      const locked = !dbg && n > s.unlocked;
      if (locked) {
        grid += `<button class="btn locked" aria-label="Level ${n} gesperrt">${n}</button>`;
      } else {
        const small = best ? `<small>${best.survivors}</small>` : '';
        grid += `<button class="btn${best ? ' done' : ''}" data-act="level" data-arg="${n}">${n}${small}</button>`;
      }
    }
    const endlessOk = dbg || s.unlocked > LEVEL_COUNT;
    const debugRow = dbg
      ? `<div class="debug-row">
           <input id="jumpLevel" class="debug-input" type="number" inputmode="numeric" min="1" max="999" placeholder="Level springen">
           <button class="btn small" data-act="jump">Springen</button>
         </div>`
      : '';

    this._screen(`
      <h2 class="screen-title">Levelauswahl</h2>
      <div class="grid-levels">${grid}</div>
      <button class="btn" data-act="endless"${endlessOk ? '' : ' disabled'}>Endlos-Modus (Level 21+)</button>
      ${debugRow}
      <button class="btn" data-act="menu">Zurück</button>
    `);

    if (dbg) {
      const inp = this.root.querySelector('#jumpLevel');
      if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._jump(); });
    }
  }

  _jump() {
    const inp = this.root.querySelector('#jumpLevel');
    const n = inp ? parseInt(inp.value, 10) : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 999) this.api.startLevel(n);
  }

  // ---------- Arsenal (Shop) ----------

  showShop(back = () => this.showMenu()) {
    this._back = back;
    const s = this.api.getSave();
    const rows = UPGRADES.map((u) => {
      const lvl = s.upgrades[u.id] || 0;
      const maxed = lvl >= u.max;
      const cost = maxed ? 0 : upgradeCost(u, lvl);
      const disabled = maxed || s.coins < cost;
      return `
        <div class="shop-item">
          <div class="info">
            <div class="name">${esc(u.name)}</div>
            <div class="desc">${esc(u.desc)}</div>
            <div class="desc effect">${esc(this._effect(u.id, lvl))}</div>
          </div>
          <span class="lvl">${lvl} / ${u.max}</span>
          <button class="btn small" data-act="buy" data-arg="${u.id}"${disabled ? ' disabled' : ''}>${maxed ? 'MAX' : `◆ ${cost}`}</button>
        </div>`;
    }).join('');

    this._screen(`
      <h2 class="screen-title">Arsenal</h2>
      <div class="panel stack">
        <div class="row"><span>Münzen</span><span class="coins">${s.coins}</span></div>
        ${rows}
      </div>
      <button class="btn" data-act="back">Zurück</button>
    `);
  }

  _effect(id, lvl) {
    switch (id) {
      case 'squad': return `Start-Truppe: ${BAL.START_SQUAD + lvl} Soldaten`;
      case 'damage': return `Schaden: +${lvl * STEP_PCT.damage} %`;
      case 'fireRate': return `Feuerrate: +${lvl * STEP_PCT.fireRate} %`;
      case 'weapon': return `Startwaffe: ${WEAPONS[lvl].name}`;
      default: return '';
    }
  }

  _buy(id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return;
    const s = this.api.getSave();
    const lvl = s.upgrades[id] || 0;
    if (lvl >= u.max) return;
    const cost = upgradeCost(u, lvl);
    if (s.coins < cost) return;
    s.coins -= cost;
    s.upgrades[id] = lvl + 1;
    writeSave(s);
    audio.coin();
    this.showShop(this._back);
  }

  // ---------- Einstellungen ----------

  showSettings() {
    const s = this.api.getSave();
    const toggle = (on, act, label) =>
      `<button class="toggle${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" data-act="${act}"></button>`;

    this._screen(`
      <h2 class="screen-title">Einstellungen</h2>
      <div class="panel stack">
        <div class="row"><span>Sound</span>${toggle(s.settings.sound, 'sound', 'Sound')}</div>
        <div class="row"><span>Vibration</span>${toggle(s.settings.vibration, 'vib', 'Vibration')}</div>
        <button class="btn danger" data-act="reset">Fortschritt zurücksetzen</button>
      </div>
      <button class="btn" data-act="menu">Zurück</button>
      <p class="version">v1.0 · offline spielbar</p>
    `);
  }

  _toggle(field) {
    const s = this.api.getSave();
    const on = !s.settings[field];
    s.settings[field] = on;
    writeSave(s);
    if (field === 'sound') {
      audio.setEnabled(on);
    } else {
      haptics.setEnabled(on);
      if (on) haptics.bump();
    }
    this.showSettings();
  }

  async _reset() {
    const ok = await this.confirm('Gesamten Fortschritt wirklich löschen? Münzen, Upgrades und Level gehen verloren.');
    if (!ok) return;
    const fresh = resetSave();
    this.api.setSave(fresh);
    audio.setEnabled(fresh.settings.sound);
    haptics.setEnabled(fresh.settings.vibration);
    this.showMenu();
  }

  // ---------- Pause ----------

  showPause() {
    this._screen(`
      <h2 class="title">PAUSE</h2>
      <div class="menu-stack">
        <button class="btn primary" data-act="resume">Weiter</button>
        <button class="btn" data-act="restart">Neustart</button>
        <button class="btn" data-act="abort">Hauptmenü</button>
      </div>
    `);
  }

  async _abort() {
    const ok = await this.confirm('Einsatz abbrechen?');
    if (ok) this.api.toMenu();
  }

  // ---------- Ergebnis ----------

  showResult(r) {
    this._lastResult = r;
    const head = r.won
      ? '<h2 class="title result-win">EINSATZ ERFOLGREICH</h2>'
      : '<h2 class="title result-lose">TRUPPE AUSGELÖSCHT</h2>';
    const primary = r.won
      ? '<button class="btn primary" data-act="next">Nächstes Level</button>'
        + '<button class="btn" data-act="restart">Wiederholen</button>'
      : '<button class="btn primary" data-act="restart">Nochmal</button>';

    this._screen(`
      ${head}
      <p class="subtitle">Level ${r.level}</p>
      <div class="stats">
        <div class="stat-box"><div class="stat">${r.survivors}</div><div class="subtitle">Überlebende</div></div>
        <div class="stat-box"><div class="stat">${r.kills}</div><div class="subtitle">Kills</div></div>
      </div>
      <p class="reward">+<span class="coins">${r.coins}</span></p>
      <div class="menu-stack">
        ${primary}
        <button class="btn" data-act="shopResult">Arsenal</button>
        <button class="btn" data-act="toMenu">Hauptmenü</button>
      </div>
    `);
  }

  // ---------- Bestätigungsdialog (eigener Modal, kein window.confirm) ----------

  confirm(text) {
    this._closeConfirm(false);
    return new Promise((resolve) => {
      this._confirmRes = resolve;
      const m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = `
        <div class="panel modal-panel" role="dialog" aria-modal="true">
          <p class="modal-text">${esc(text)}</p>
          <div class="modal-actions">
            <button class="btn" data-act="cn">Nein</button>
            <button class="btn primary" data-act="cy">Ja</button>
          </div>
        </div>`;
      this._modal = m;
      this.root.appendChild(m);
    });
  }

  _closeConfirm(ok) {
    if (this._modal) {
      this._modal.remove();
      this._modal = null;
    }
    const res = this._confirmRes;
    this._confirmRes = null;
    if (res) res(ok);
  }
}
