// main.js – Bootstrap: Save, Audio, UI, Game, Renderer, Loop, Input, Service Worker, Debug/Autoplay.
import { Loop } from './core/loop.js';
import { Input } from './core/input.js';
import { audio } from './core/audio.js';
import { haptics } from './core/haptics.js';
import { loadSave, writeSave } from './core/save.js';
import { BAL, upgradeCost } from './data/balance.js';
import { UPGRADES } from './data/upgrades.js';
import { Game } from './game/game.js';
import { Renderer } from './render/renderer.js';
import { UI } from './ui/ui.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const AUTOPLAY = params.get('autoplay') === '1';
const CHAIN = params.get('chain') === '1';
const SPEED = DEBUG ? Math.max(1, Math.min(16, parseInt(params.get('speed'), 10) || 1)) : 1;

let save = null;
let canvas = null;
let pauseBtn = null;
let renderer = null;
let game = null;
let input = null;
let loop = null;
let ui = null;
let bot = null;
let currentLevel = 1;
let curDt = 0;

// Autopilot-Eingabe: liefert die Bot-Verschiebung statt Pointer-Eingabe.
const botInput = { consumeDeltaX: () => (bot ? bot.delta(game, curDt) : 0) };

// ---------- Schnittstelle für die UI ----------

const api = {
  getSave: () => save,
  setSave: (s) => {
    save = s;
    if (game) game.save = s;
  },
  startLevel: (n) => startLevel(n),
  resume: () => resume(),
  restart: () => startLevel(currentLevel),
  toMenu: () => toMenu(),
  debug: DEBUG,
};

// ---------- Spielablauf ----------

function startLevel(n) {
  if (!game) return;
  currentLevel = n;
  ui.hideAll();
  input.reset();
  loop.paused = false;
  game.start(n);
  pauseBtn.classList.remove('hidden');
}

function pause() {
  if (!game || game.state !== 'play') return;
  loop.paused = true;
  pauseBtn.classList.add('hidden');
  ui.showPause();
}

function resume() {
  loop.paused = false;
  input.reset();
  ui.hideAll();
  if (game.state === 'play') pauseBtn.classList.remove('hidden');
}

function toMenu() {
  game.state = 'idle';
  loop.paused = false;
  pauseBtn.classList.add('hidden');
  ui.showMenu();
}

function onEnd(result) {
  const { won, level, survivors, coins, kills } = result;

  save.coins = (save.coins || 0) + (coins || 0);
  if (won) {
    const key = String(level);
    const prev = save.best[key];
    save.unlocked = Math.max(save.unlocked, level + 1);
    save.best[key] = {
      survivors: Math.max(prev ? prev.survivors : 0, survivors),
      coins: Math.max(prev ? prev.coins : 0, coins),
    };
    if (level > BAL.ENDLESS_START - 1) {
      save.endlessBest = Math.max(save.endlessBest, level);
    }
  }
  writeSave(save);

  pauseBtn.classList.add('hidden');
  if (won) audio.win();
  else audio.lose();
  ui.showResult(result);

  if (AUTOPLAY) {
    window.__results.push({ level, won, survivors, coins, kills, time: Math.round(game.time), tier: game.squad.weaponTier, att: game.squad.attachments.length, peak: game.peak, bossT: Math.round(game.bossFight || 0), bossHp: game.bossMax });
    if (CHAIN) {
      // Test-Autopilot kauft wie ein Spieler das günstigste Upgrade, solange Münzen reichen (?shop=1).
      if (params.get('shop') === '1') autoShop();
      const next = won ? level + 1 : level;
      setTimeout(() => startLevel(next), 1500);
    }
  }
}

function autoShop() {
  for (;;) {
    let best = null;
    let bestCost = Infinity;
    for (const u of UPGRADES) {
      const lvl = save.upgrades[u.id] || 0;
      if (lvl >= u.max) continue;
      const c = upgradeCost(u, lvl);
      if (c < bestCost) { best = u; bestCost = c; }
    }
    if (!best || bestCost > save.coins) break;
    save.coins -= bestCost;
    save.upgrades[best.id]++;
  }
  writeSave(save);
}

// ---------- Loop ----------

function update(dt) {
  if (!game || game.state !== 'play') return;
  curDt = dt;
  const src = AUTOPLAY && bot ? botInput : input;
  // Debug-Zeitraffer (?speed=N) für automatisierte Durchläufe.
  for (let i = 0; i < SPEED && game.state === 'play'; i++) game.update(dt, src);
}

function render() {
  if (!renderer || !game) return;
  // Im Menü (state 'idle') zeichnet der Renderer den animierten Hintergrund.
  renderer.render(game, loop.fps, DEBUG);
}

function onResize() {
  if (!renderer || !game) return;
  const { W, H } = renderer.resize();
  game.resize(W, H, renderer.desktop);
}

// ---------- Globale Ereignisse ----------

function onVisibility() {
  if (document.hidden) {
    pause();
    audio.suspend();
  } else {
    audio.resume();
  }
}

// Audio erst nach der ersten Nutzergeste initialisieren (Browser-Autoplay-Regeln).
function initAudioOnce() {
  audio.init();
  window.removeEventListener('pointerdown', initAudioOnce, true);
  window.removeEventListener('keydown', initAudioOnce, true);
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function isTyping(e) {
  const t = e.target;
  return !!t && (t.tagName === 'INPUT' || t.isContentEditable);
}

// ---------- Debug ----------

function setupDebug() {
  window.__gs = { renderer, game, save: () => save, ui, startLevel, loop };

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hud-btn hud-bl';
  btn.setAttribute('aria-label', 'Unverwundbarkeit umschalten');

  const refresh = () => {
    const on = !!game.debug.god;
    btn.textContent = on ? 'GOD ✓' : 'GOD';
    btn.classList.toggle('on', on);
  };
  const toggle = () => {
    game.debug.god = !game.debug.god;
    refresh();
  };

  btn.addEventListener('click', () => {
    audio.click();
    haptics.tap();
    toggle();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' && !e.repeat && !isTyping(e)) toggle();
  });

  document.body.appendChild(btn);
  refresh();
}

// ---------- Boot ----------

async function boot() {
  save = await loadSave();
  audio.setEnabled(save.settings.sound);
  haptics.setEnabled(save.settings.vibration);

  canvas = document.getElementById('game');
  pauseBtn = document.getElementById('pauseBtn');

  renderer = new Renderer(canvas);
  game = new Game({ save, onEnd, onHudChange() {} });
  input = new Input(canvas, () => renderer.scale);
  input.attach();
  ui = new UI(document.getElementById('ui'), api);

  if (AUTOPLAY) {
    try {
      const mod = await import('./game/bot.js');
      if (mod && typeof mod.delta === 'function') bot = mod;
      if (bot && bot.setMode) bot.setMode(params.get('bot'));
    } catch (_) {
      bot = null; // Bot fehlt: Pointer-Eingabe bleibt aktiv
    }
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  onResize();

  loop = new Loop(update, render);

  pauseBtn.addEventListener('click', () => pause());
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', () => pause());

  if (document.readyState === 'complete') registerSW();
  else window.addEventListener('load', registerSW, { once: true });

  if (DEBUG) setupDebug();

  if (AUTOPLAY) {
    window.__results = [];
    startLevel(Number(params.get('level')) || 1);
  } else {
    ui.showMenu();
  }
  loop.start();
}

window.addEventListener('pointerdown', initAudioOnce, true);
window.addEventListener('keydown', initAudioOnce, true);

boot().catch((err) => console.error('Gate Squad: Start fehlgeschlagen', err));
