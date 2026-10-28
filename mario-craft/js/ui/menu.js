// Menüs als DOM-Overlays über dem Canvas (PLAN §5, PRD §2). Texte über t(), damit ein Sprachwechsel
// sofort wirkt: refresh() zeichnet den aktuellen Bildschirm neu. Sprache und Ton melden die Menüs per
// Callback an main.js, dort wird gespeichert. Bedienung nur per Tippen/Klicken auf Rechtecke.
import { LEVELS } from '../data/levels/index.js';
import { LANGS, getLang, t } from '../core/i18n.js';
import { audio } from '../core/audio.js';

// Welten, deren Level spielbar sind.
const OPEN_WORLDS = 5;
const WORLDS = [1, 2, 3, 4, 5];
const LEVELS_PER_WORLD = 33;
const PICK_KEYS = ['pickWood', 'pickStone', 'pickIron', 'pickDiamond'];
const BTN_SIZES = ['small', 'normal', 'large'];
const BTN_SIZE_KEYS = { small: 'btnSmall', normal: 'btnNormal', large: 'btnLarge' };

let root = null;
let cur = null; // { screen, args, cb }
let bound = false;

function el() {
  if (!root) root = document.getElementById('ui');
  if (!bound && root) {
    root.addEventListener('click', onClick);
    bound = true;
  }
  return root;
}

const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Level-Namensschlüssel: def.name, sonst lv_w<welt>_<nr> aus der id.
const levelKey = (id) => 'lv_' + id.replace('-', '_');

// Spielbar = in LEVELS eingetragen und Welt offen.
export function isPlayable(def) {
  return !!def && def.world <= OPEN_WORLDS;
}

function fmtTime(sec) {
  const s = Math.max(0, sec || 0);
  return `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
}

function fmtTenths(sec) {
  const s = Math.max(0, sec || 0);
  return `${fmtTime(s)}.${Math.floor((s * 10) % 10)}`;
}

// Diamant-Symbole für drei Plätze (gesammelt ◆, offen ◇).
function diamondRow(arr) {
  let out = '';
  for (let i = 0; i < 3; i++) out += arr && arr[i] ? '◆' : '◇';
  return out;
}

function unlockedIndex(save) {
  const i = LEVELS.findIndex((d) => d.id === save.unlocked);
  return i < 0 ? 0 : i;
}

function gearText(power) {
  if (power === 'bow') return `${t('armor')} + ${t('bow')}`;
  if (power === 'armor') return t('armor');
  return t('plain');
}

function langSeg() {
  const cur = getLang();
  const label = t('lang');
  return `<div class="seg" role="group" aria-label="${esc(label)}">${LANGS.map((l) => {
    const on = l === cur;
    return `<button class="seg-b${on ? ' on' : ''}" data-act="lang" data-arg="${l}" aria-pressed="${on}">${l.toUpperCase()}</button>`;
  }).join('')}</div>`;
}

function soundBtn() {
  const on = audio.enabled;
  return `<button class="btn" data-act="sound" data-arg="${on ? 0 : 1}">${t('sound')}: ${on ? t('on') : t('off')}</button>`;
}

// Knopfgröße: drei Auswahlknöpfe (klein / normal / groß), der gewählte ist „on“.
function sizeSeg(size) {
  const label = t('btnSize');
  return `<div class="seg" role="group" aria-label="${esc(label)}">${BTN_SIZES.map((k) => {
    const on = k === size;
    return `<button class="seg-b${on ? ' on' : ''}" data-act="btnsize" data-arg="${k}" aria-pressed="${on}">${t(BTN_SIZE_KEYS[k])}</button>`;
  }).join('')}</div>`;
}

function viewStart() {
  return `<section class="panel center">
    <h1 class="title">${t('title')}</h1>
    <button class="btn primary" data-act="play">${t('start')}</button>
    <div class="row">${langSeg()}${soundBtn()}</div>
    <p class="help">${t('controls')}</p>
    <p class="help">${t('dig')}</p>
    <p class="help">${t('keys')}</p>
  </section>`;
}

// Eine Kachel der Levelauswahl. Gesperrt/bald: disabled, sonst data-act="level".
function levelTile(label, name, state, def, rec, idx) {
  const boss = def && def.boss;
  if (state === 'open') {
    const info = rec && rec.done ? fmtTime(rec.bestTime) : (boss ? t(boss) : '–');
    return `<button class="tile${boss ? ' boss' : ''}" data-act="level" data-arg="${idx}" aria-label="${label} ${esc(name)}">`
      + `<span class="tn">${label}</span><span class="tsub">${esc(name)}</span>`
      + `<span class="tbest">${esc(info)}</span><span class="tstars">${diamondRow(rec && rec.diamonds)}</span></button>`;
  }
  const text = state === 'locked' ? t('locked') : t('soon');
  return `<button class="tile" disabled aria-label="${label} ${esc(name)} ${esc(text)}">`
    + `<span class="tn">${label}</span><span class="tsub">${esc(name)}</span><span class="tbest">${esc(text)}</span></button>`;
}

function viewLevels(save) {
  const unl = unlockedIndex(save);
  const pick = Math.min(PICK_KEYS.length - 1, Math.max(0, save.pick | 0));
  let html = `<section class="panel wide">
    <header class="head"><button class="btn small" data-act="back">← ${t('back')}</button><h2>${t('levels')}</h2></header>
    <p class="hint">${t('pickLabel')}: ${t(PICK_KEYS[pick])} · ${gearText(save.power)}</p>`;
  for (const w of WORLDS) {
    html += `<div class="world"><div class="wname">${t('w' + w)}</div><div class="tiles">`;
    for (let l = 1; l <= LEVELS_PER_WORLD; l++) {
      const id = `w${w}-${l}`;
      const label = `${w}-${l}`;
      const idx = LEVELS.findIndex((d) => d.id === id);
      const def = idx >= 0 ? LEVELS[idx] : null;
      const name = t(def && def.name ? def.name : levelKey(id));
      const rec = (save.levels && save.levels[id]) || null;
      let state = 'open';
      if (!isPlayable(def)) state = 'soon';
      else if (idx > unl) state = 'locked';
      html += levelTile(label, name, state, def, rec, idx);
    }
    html += '</div></div>';
  }
  return html + '</section>';
}

function viewPause(size) {
  return `<section class="panel center">
    <h2 class="big">${t('pause')}</h2>
    <div class="col">
      <button class="btn primary" data-act="resume">${t('resume')}</button>
      <button class="btn" data-act="restart">${t('restart')}</button>
      <button class="btn" data-act="levels">${t('levels')}</button>
    </div>
    <div class="row tight">${langSeg()}${soundBtn()}</div>
    <div class="row tight"><span class="lbl">${t('btnSize')}</span>${sizeSeg(size)}</div>
  </section>`;
}

function viewDone(r) {
  const n = r.diamonds.filter(Boolean).length;
  return `<section class="panel center">
    <h2 class="big">${t('levelDone')}</h2>
    <dl class="stats">
      <div><dt>${t('time')}</dt><dd>${fmtTenths(r.time)}</dd></div>
      <div><dt>${t('emeralds')}</dt><dd>${r.emeralds}</dd></div>
      <div><dt>${t('diamonds')}</dt><dd><span class="stars-big">${diamondRow(r.diamonds)}</span> <small>${t('diamondsOf', { n })}</small></dd></div>
    </dl>
    <div class="col">
      ${r.hasNext ? `<button class="btn primary" data-act="next">${t('next')}</button>` : ''}
      <button class="btn${r.hasNext ? '' : ' primary'}" data-act="again">${t('again')}</button>
      <button class="btn" data-act="levels">${t('levels')}</button>
    </div>
  </section>`;
}

function viewOver(world) {
  return `<section class="panel center">
    <h2 class="big">${t('gameOver')}</h2>
    <p>${t('gameOverText', { world: t('w' + world) })}</p>
    <button class="btn primary" data-act="retry">${t('again')}</button>
  </section>`;
}

const VIEWS = { start: viewStart, levels: viewLevels, pause: viewPause, done: viewDone, over: viewOver };

function draw() {
  if (!cur) return;
  const root = el();
  root.innerHTML = VIEWS[cur.screen](...cur.args);
  root.dataset.screen = cur.screen;
}

function show(screen, args, cb) {
  cur = { screen, args, cb };
  draw();
  el().hidden = false;
}

function onClick(e) {
  const b = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!b || b.disabled || !cur) return;
  audio.click();
  const cb = cur.cb;
  const act = b.dataset.act;
  const arg = b.dataset.arg;
  if (act === 'level') cb('level', Number(arg));
  else if (act === 'sound') cb('sound', arg === '1');
  else if (act === 'lang') cb('lang', arg);
  else if (act === 'btnsize') {
    cur.args = [arg]; // Auswahl sofort markieren, auch bei refresh()
    cb('btnsize', arg);
  } else cb(act);
}

// Titelbildschirm. cb('play') | cb('lang', 'de'|'pl') | cb('sound', bool)
export function showStart(cb) {
  show('start', [], cb);
}

// Levelauswahl. save.levels[id] = { done, bestTime, emeralds, diamonds: [b, b, b] }.
// cb('level', index) | cb('back')
export function showLevelSelect(save, cb) {
  show('levels', [save], cb);
}

// Pause. size = 'small' | 'normal' | 'large' (Knopfgröße). cb('resume' | 'restart' | 'levels' | 'lang', v | 'sound', bool | 'btnsize', size)
export function showPause(cb, size = 'normal') {
  show('pause', [size], cb);
}

// Levelende. result = { time, emeralds, diamonds: [b, b, b], hasNext }. cb('next' | 'again' | 'levels')
export function showLevelDone(result, cb) {
  show('done', [result], cb);
}

// Game Over. world = 1..3. cb('retry')
export function showGameOver(cb, world) {
  show('over', [world], cb);
}

// Zeichnet den offenen Bildschirm mit der aktuellen Sprache neu.
export function refresh() {
  draw();
}

export function hideAll() {
  cur = null;
  const r = el();
  r.hidden = true;
  r.innerHTML = '';
}
