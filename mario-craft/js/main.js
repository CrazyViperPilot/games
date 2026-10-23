// Bootstrap (PLAN §2, §3, §5, §6, §7): Skalierung, Menüfluss, Ton und Vibration, Fortschritt speichern,
// Vollbild und Querformat beim ersten Antippen, ?debug=1, Service Worker.
// Fester Schritt 1/120 s (PHYS.step, im Loop). Ohne Level (LEVELS leer) läuft die Levelauswahl mit „bald“.
import { createLoop } from './core/loop.js';
import { Input, BTN_SCALE } from './core/input.js';
import { audio, playEvent } from './core/audio.js';
import { loadSave, writeSave } from './core/save.js';
import { setLang, getLang, defaultLang, t } from './core/i18n.js';
import { LEVELS } from './data/levels/index.js';
import { Game } from './game/game.js';
import { Renderer } from './render/renderer.js';
import { buildSprites } from './render/sprites.js';
import * as menu from './ui/menu.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const canvas = document.getElementById('view');
const rotateEl = document.getElementById('rotate');

const save = loadSave();
setLang(save.lang || defaultLang());
audio.setEnabled(save.sound);

// ---------- Skalierung (PLAN §2) ----------
const layout = { dpr: 1, scale: 1, viewW: 384, viewH: 240 };
const getLayout = () => layout;
const isPortrait = () => window.innerHeight > window.innerWidth;

function computeLayout() {
  const dpr = window.devicePixelRatio || 1;
  const physW = Math.round(window.innerWidth * dpr);
  const physH = Math.round(window.innerHeight * dpr);
  const scale = Math.max(1, Math.round(physH / 240));
  layout.dpr = dpr;
  layout.scale = scale;
  // Abgerundet, damit das Canvas nie über den Bildschirm hinausragt (384×240 bzw. 480×216).
  layout.viewH = Math.max(200, Math.floor(physH / scale));
  layout.viewW = Math.max(1, Math.floor(physW / scale));
}

// ---------- Objekte ----------
const sprites = buildSprites();
const renderer = new Renderer(canvas, sprites, { debug: DEBUG });
const input = new Input(canvas, getLayout);
const btnSize = () => (BTN_SCALE[save.btnSize] ? save.btnSize : 'normal');
input.setButtonScale(BTN_SCALE[btnSize()]);

let game = null;
let levelIndex = 0;
let mode = 'menu'; // 'menu' | 'play' | 'paused' | 'done' | 'over'
let loop = null;

function applyLayout() {
  computeLayout();
  renderer.setView(layout.viewW, layout.viewH);
  canvas.style.width = `${(layout.viewW * layout.scale) / layout.dpr}px`;
  canvas.style.height = `${(layout.viewH * layout.scale) / layout.dpr}px`;
  if (game) game.setView(layout.viewW, layout.viewH);
  rotateEl.hidden = !isPortrait();
}

function applyStatic() {
  document.documentElement.lang = getLang();
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
}

// Spiel setzen und Renderer auf dessen Level umstellen (game = null: nichts zu zeichnen).
function setGame(g) {
  game = g;
  if (g) renderer.setLevel(g.map, g.map.theme);
}

// ---------- Spielstand ----------
function unlockedIndex() {
  const i = LEVELS.findIndex((d) => d.id === save.unlocked);
  return i < 0 ? 0 : i;
}

// Debug: alle Level frei.
function viewSave() {
  return DEBUG && LEVELS.length ? { ...save, unlocked: LEVELS[LEVELS.length - 1].id } : save;
}

// Leben, Smaragde, Figur und beste Spitzhacke aus dem Spiel in den Spielstand übernehmen (ohne Schreiben).
function syncSave() {
  if (!game) return;
  save.lives = Math.max(1, game.lives);
  save.emeralds = game.emeralds;
  save.power = game.player.power;
  save.pick = Math.max(save.pick, game.pick);
}

// Zwischenstand schreiben (Pause, Menü, Tab verlassen).
function persistProgress() {
  if (!game || (mode !== 'play' && mode !== 'paused')) return;
  syncSave();
  writeSave(save);
}

// Levelende: Bestwerte, Diamanten (je Platz einmal gesammelt), Freischalten des nächsten Levels, Speichern.
function finishLevel(res) {
  const def = LEVELS[levelIndex];
  const old = save.levels[def.id] || {};
  const diamonds = [0, 1, 2].map((i) => !!(old.diamonds && old.diamonds[i]) || !!game.diamonds[i]);
  save.levels[def.id] = {
    done: true,
    bestTime: old.bestTime == null ? res.time : Math.min(old.bestTime, res.time),
    emeralds: Math.max(old.emeralds || 0, game.emeralds),
    diamonds,
  };
  const next = levelIndex + 1;
  const hasNext = next < LEVELS.length && menu.isPlayable(LEVELS[next]);
  if (hasNext && unlockedIndex() < next) save.unlocked = LEVELS[next].id;
  syncSave();
  writeSave(save);
  mode = 'done';
  menu.showLevelDone({ time: res.time, emeralds: game.emeralds, diamonds, hasNext }, doneCb);
}

function gameOver() {
  // Game Over: zurück zu Level 1 der Welt, Leben wieder 3, Figur klein. Smaragde und Spitzhacke bleiben.
  syncSave();
  save.lives = 3;
  save.power = 'plain';
  writeSave(save);
  mode = 'over';
  menu.showGameOver(overCb, LEVELS[levelIndex].world);
}

// ---------- Spielereignisse ----------
function buzz(ms) {
  if (!audio.enabled || !navigator.vibrate) return;
  try { navigator.vibrate(ms); } catch (_) { /* nicht unterstützt */ }
}

// Game ruft onEvent(name, data) (PLAN §6). Töne laufen über playEvent; unbekannte Namen tun dort nichts.
function onEvent(name, data) {
  playEvent(name);
  if (name === 'hurt') buzz(40);
  else if (name === 'stomp') buzz(15);
  else if (name === 'explode') buzz(60);
  else if (name === 'levelDone') finishLevel(data);
  else if (name === 'gameOver') gameOver();
}

// ---------- Spielfluss ----------
function newGame(index) {
  levelIndex = index;
  return new Game({
    level: LEVELS[index],
    save: { lives: save.lives, emeralds: save.emeralds, pick: save.pick, power: save.power },
    onEvent,
    viewW: layout.viewW,
    viewH: layout.viewH,
  });
}

// Einmaliger Hinweis in Level 1-1 (Graben), danach nie wieder.
function showHint(key) {
  let seen = false;
  try { seen = localStorage.getItem('mariocraft-hint-' + key) === '1'; } catch (_) { /* egal */ }
  if (seen) return;
  try { localStorage.setItem('mariocraft-hint-' + key, '1'); } catch (_) { /* egal */ }
  const el = document.createElement('div');
  el.className = 'hint';
  el.textContent = t(key);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 8000);
}

function startLevel(index) {
  if (!LEVELS[index]) return;
  setGame(newGame(index));
  if (index === 0) showHint('hint1');
  input.setFireVisible(game.player.power === 'bow');
  mode = 'play';
  menu.hideAll();
}

function openPause() {
  mode = 'paused';
  menu.showPause(pauseCb, btnSize());
}

function resume() {
  mode = 'play';
  menu.hideAll();
}

function showStart() {
  mode = 'menu';
  menu.showStart(startCb);
}

function showLevels() {
  mode = 'menu';
  menu.showLevelSelect(viewSave(), levelsCb);
}

function setLanguage(l) {
  setLang(l);
  save.lang = getLang();
  writeSave(save);
  applyStatic();
  menu.refresh();
}

function setSound(on) {
  audio.setEnabled(on);
  save.sound = !!on;
  writeSave(save);
  menu.refresh();
}

function setButtonSize(k) {
  if (!BTN_SCALE[k]) return;
  save.btnSize = k;
  writeSave(save);
  input.setButtonScale(BTN_SCALE[k]);
  menu.refresh();
}

function startCb(act, v) {
  if (act === 'play') showLevels();
  else if (act === 'lang') setLanguage(v);
  else if (act === 'sound') setSound(v);
}

function levelsCb(act, v) {
  if (act === 'back') showStart();
  else if (act === 'level') {
    const def = LEVELS[v];
    if (!menu.isPlayable(def)) return;
    if (DEBUG || v <= unlockedIndex()) startLevel(v);
  }
}

function pauseCb(act, v) {
  if (act === 'resume') resume();
  else if (act === 'restart') {
    persistProgress();
    startLevel(levelIndex);
  } else if (act === 'levels') {
    persistProgress();
    showLevels();
  } else if (act === 'lang') setLanguage(v);
  else if (act === 'sound') setSound(v);
  else if (act === 'btnsize') setButtonSize(v);
}

function doneCb(act) {
  if (act === 'next') startLevel(levelIndex + 1);
  else if (act === 'again') startLevel(levelIndex);
  else if (act === 'levels') showLevels();
}

function overCb(act) {
  if (act === 'retry') {
    const world = LEVELS[levelIndex].world;
    const first = LEVELS.findIndex((d) => d.id === `w${world}-1`);
    if (first >= 0) startLevel(first);
    else showLevels();
  }
}

// ---------- Loop ----------
function update(dt) {
  // Touch-Knöpfe nur im Spiel; Titel, Levelauswahl und Pause zeigen keine.
  input.setControlsOn(mode === 'play');
  const st = input.state;
  if (st.pausePressed) {
    if (mode === 'play') openPause();
    else if (mode === 'paused') resume();
  }
  // Hochformat: Spiel steht still, der Hinweis „Bitte Gerät drehen“ liegt darüber.
  if (mode === 'play' && game && !isPortrait()) {
    input.setFireVisible(game.player.power === 'bow');
    game.update(dt, st);
  }
  input.endStep();
}

function render() {
  if (game) renderer.render(game, input, loop ? loop.fps : 0);
}

// Erstes Antippen: Ton starten, Vollbild und Querformat anfordern. Fehler werden ignoriert.
function firstGesture() {
  audio.init();
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      const p = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {});
    }
  } catch (_) { /* ohne Vollbild weiter */ }
  try {
    const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape');
    if (p && p.catch) p.catch(() => {});
  } catch (_) { /* nicht unterstützt */ }
}

// ---------- Start ----------
applyLayout();
applyStatic();
window.addEventListener('resize', applyLayout);
window.addEventListener('orientationchange', applyLayout);
window.addEventListener('pointerdown', firstGesture, { once: true, capture: true });
window.addEventListener('keydown', firstGesture, { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (mode === 'play') openPause();
    persistProgress();
  }
});
window.addEventListener('pagehide', persistProgress);

// Hintergrund des Startbildschirms: Level 1, steht still. Ohne Level kein Hintergrund.
setGame(LEVELS.length ? newGame(0) : null);
showStart();

loop = createLoop(update, render);
loop.start();

if (DEBUG) {
  window.__mc = {
    get game() { return game; },
    save,
    input,
  };
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
