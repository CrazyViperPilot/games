// Bootstrap (PLAN §5 main.js): Startmenü, Spiel erzeugen, Schleife, URL-Parameter, Service Worker.
// URL: ?seed=N (feste Karte) · ?speed=N (Startgeschwindigkeit) · ?debug=1 (Karte aufgedeckt, M = +1000, bis 10×).
import { BALANCE } from './data/balance.js';
import { Game } from './game/game.js';
import { loadMap } from './game/mapdata.js';
import { AI } from './ai/ai.js';
import { createLoop } from './core/loop.js';
import { Camera } from './render/camera.js';
import { Renderer } from './render/renderer.js';
import { Minimap } from './render/minimap.js';
import { Controller } from './ui/controller.js';
import { Input } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { showStartMenu, showPause, showHelp, showEnd, hideOverlay } from './ui/menu.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const REVEAL = DEBUG && params.get('fog') !== '1'; // Debug deckt die Karte auf; `fog=1` behält den Nebel (Sicht prüfen)
// Ansicht: ?iso=1 / ?iso=0 oder zuletzt gewählt (V bzw. Schaltfläche); Standard 2D
function loadIso() {
  if (params.has('iso')) return params.get('iso') === '1';
  try {
    return localStorage.getItem('frontline-iso') === '1';
  } catch {
    return false;
  }
}
// Kasse: Das Geld des Spielers bleibt von Runde zu Runde (localStorage); beide Teams starten mit demselben Betrag.
const WALLET_KEY = 'frontline-kasse';
function loadWallet() {
  if (DEBUG) return BALANCE.startRes.money;
  try {
    const v = Number.parseInt(localStorage.getItem(WALLET_KEY), 10);
    if (Number.isFinite(v)) return Math.min(BALANCE.walletMax, Math.max(BALANCE.startRes.money, v));
  } catch {
    /* ohne Speicher: Startgeld */
  }
  return BALANCE.startRes.money;
}
function saveWallet(v) {
  if (DEBUG) return;
  try {
    localStorage.setItem(WALLET_KEY, String(Math.min(BALANCE.walletMax, Math.max(0, Math.floor(v)))));
  } catch {
    /* ohne Speicher: gilt nur für diese Sitzung */
  }
}
function resetWallet() {
  try {
    localStorage.removeItem(WALLET_KEY);
  } catch {
    /* nichts zu tun */
  }
}
const URL_SEED = Number.parseInt(params.get('seed'), 10);
const URL_SPEED = Number.parseFloat(params.get('speed'));
const SPEEDS = DEBUG ? [1, 2, 3, 5, 10] : [1, 2, 3];
const HUMAN = 0; // Blau
const AI_TEAM = 1; // Rot

const canvas = document.getElementById('view');
const hudRoot = document.getElementById('hud');
const overlay = document.getElementById('overlay');

let session = null; // laufendes Spiel: { game, ai, camera, renderer, minimap, controller, hud, input, loop, … }
let settings = { difficulty: 'normal', winPoints: BALANCE.winPoints };

function nearestSpeedIndex(v) {
  let best = 0;
  for (let i = 1; i < SPEEDS.length; i++) {
    if (Math.abs(SPEEDS[i] - v) < Math.abs(SPEEDS[best] - v)) best = i;
  }
  return best;
}

function resume() {
  if (session) session.loop.paused = false;
}

function clearCanvas() {
  const ctx = canvas.getContext('2d');
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
}

function stopSession() {
  const s = session;
  if (!s) return;
  session = null;
  s.loop.stop();
  s.input.destroy();
  window.removeEventListener('resize', s.onResize);
  s.hud.destroy();
  clearCanvas();
}

function quitToMenu() {
  stopSession();
  showStartMenu(overlay, startGame, { wallet: loadWallet, resetWallet });
}

/** Aktionen für Hilfe, Tastatur und HUD. */
const app = {
  debug: DEBUG,
  status() {
    const s = session;
    return s ? { paused: s.loop.paused, speed: s.loop.speed } : { paused: false, speed: 1 };
  },
  overlayOpen: () => !overlay.hidden,
  closeOverlay() {
    const kind = overlay.dataset.kind;
    if (kind === 'help') hideOverlay(overlay);
    else if (kind === 'pause') {
      hideOverlay(overlay);
      resume();
    }
  },
  togglePause() {
    const s = session;
    if (!s || s.ended) return;
    if (s.loop.paused) {
      hideOverlay(overlay);
      resume();
    } else {
      s.loop.paused = true;
      showPause(overlay, resume, quitToMenu);
    }
  },
  toggleView() {
    const s = session;
    if (!s) return;
    s.camera.iso = !s.camera.iso;
    s.camera.clamp();
    try {
      localStorage.setItem('frontline-iso', s.camera.iso ? '1' : '0');
    } catch {
      /* ohne Speicher: gilt nur für diese Sitzung */
    }
    s.hud.pushMessage(s.camera.iso ? 'Ansicht: isometrisch (V)' : 'Ansicht: 2D von oben (V)');
    s.hud.refresh();
  },
  rotateView(dir) {
    const s = session;
    if (!s) return;
    if (!s.camera.iso) {
      s.hud.pushMessage('Drehen geht nur in der isometrischen Ansicht (V)');
      return;
    }
    s.camera.rotate(dir);
    s.hud.pushMessage(`Ansicht gedreht (${s.camera.rot * 90}°)`);
  },
  toggleHelp() {
    if (overlay.dataset.kind === 'help') {
      hideOverlay(overlay);
      return;
    }
    if (!overlay.hidden || !session || session.ended) return;
    showHelp(overlay);
  },
  changeSpeed(dir) {
    const s = session;
    if (!s) return;
    const j = Math.min(SPEEDS.length - 1, Math.max(0, nearestSpeedIndex(s.loop.speed) + dir));
    s.loop.speed = SPEEDS[j];
    s.hud.pushMessage(`Tempo ${SPEEDS[j]}×`);
  },
  cycleSpeed() {
    const s = session;
    if (!s) return;
    s.loop.speed = SPEEDS[(nearestSpeedIndex(s.loop.speed) + 1) % SPEEDS.length];
    s.hud.pushMessage(`Tempo ${s.loop.speed}×`);
  },
  debugMoney() {
    const s = session;
    if (!DEBUG || !s) return;
    const team = s.game.teams[HUMAN];
    team.res.money += 1000;
    s.hud.pushMessage('Debug: +1000 Geld');
  },
};

function startSpeed() {
  return Number.isFinite(URL_SPEED) ? Math.min(10, Math.max(0.25, URL_SPEED)) : 1;
}

/** Ein Bild: Eingabe, Ereignisse, Zeichnen, HUD und Spielende. */
function frame(s) {
  const now = performance.now();
  const dt = Math.min(0.1, (now - (s.last ?? now)) / 1000);
  s.last = now;
  s.input.update(dt);

  for (const ev of s.game.drainEvents()) {
    if (ev.type !== 'message' || (ev.team !== HUMAN && ev.team !== -1)) continue;
    s.controller.noteEvent(ev);
    s.hud.pushMessage(ev.text, Number.isFinite(ev.x) ? { x: ev.x, y: ev.y } : null);
  }

  s.renderer.render(s.controller.view);
  s.minimap.render();
  s.hud.update();

  const g = s.game;
  if (g.winner !== null && !s.ended) {
    s.ended = true;
    saveWallet(g.teams[HUMAN].res.money);
    showEnd(
      overlay,
      {
        winner: g.winner,
        team: HUMAN,
        reason: g.winReason,
        stats: { time: g.time, points: [g.teams[0].points, g.teams[1].points], winPoints: g.winPoints },
      },
      () => startGame(settings),
    );
  }
}

function startGame(opts) {
  settings = opts;
  stopSession();
  hideOverlay(overlay);

  const seed = Number.isFinite(URL_SEED) ? URL_SEED : Math.floor(Math.random() * 1e9) + 1;
  const map = opts.mapId && opts.mapId !== 'random' ? loadMap(opts.mapId) : null; // gespeicherte Karte, sonst aus dem Seed
  const game = new Game({ seed, winPoints: opts.winPoints, startMoney: loadWallet(), map });
  const ai = new AI(game, AI_TEAM, opts.difficulty);
  const camera = new Camera(BALANCE.map.width, BALANCE.map.height);
  camera.iso = loadIso();
  const renderer = new Renderer(canvas, game, camera, HUMAN);
  const controller = new Controller(game, HUMAN, camera);
  const hud = new Hud(hudRoot, game, HUMAN, controller, app);
  controller.onMessage = (text) => hud.pushMessage(text);
  const minimap = new Minimap(hud.minimapCanvas, game, camera, HUMAN);

  const home = controller.homeBase();
  if (home) camera.centerOn(home.x, home.y);
  if (REVEAL) {
    renderer.revealAll = true;
    minimap.revealAll = true;
  }
  const input = new Input({ canvas, minimap, camera, controller, hud, app });
  const onResize = () => {
    renderer.resize();
    minimap.resize();
  };
  window.addEventListener('resize', onResize);

  const s = { game, ai, camera, renderer, minimap, controller, hud, input, onResize, loop: null, ended: false, last: null };
  s.loop = createLoop({
    tickRate: BALANCE.tickRate,
    update(dt) {
      ai.update(dt);
      game.update(dt);
      if (REVEAL) game.fog[HUMAN].revealAll(); // Simulation setzt den Nebel alle 0,25 s neu
    },
    render: () => frame(s),
  });
  s.loop.speed = startSpeed();
  session = s;
  if (DEBUG) window.frontline = s; // Konsole/Tests: Zugriff auf Spielzustand
  s.loop.start();
}

showStartMenu(overlay, startGame);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
