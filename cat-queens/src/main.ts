// Katzen-Queens: Menü, Spielbildschirm, Timer, Hinweise, Statistik.

import './style.css';
import { dailyDifficulty, dateKey, DIFFICULTIES, type Difficulty, type GeneratedPuzzle } from './core/generator';
import { describeHint, getHint, type Hint } from './core/hints';
import { CAT } from './core/logic';
import { Game } from './game/game';
import { daily, prepareNext, takeFree } from './game/puzzles';
import { currentStreak, formatTime, recordSolve } from './game/stats';
import {
  clearGame,
  loadGame,
  loadSettings,
  loadStats,
  modeKey,
  pruneDailyGames,
  saveGame,
  saveSettings,
  saveStats,
  type Mode,
  type Settings,
} from './game/storage';
import { CROWN_CAT_SVG } from './ui/art';
import { BoardView, type Highlight } from './ui/board-view';
import { REGION_NAMES } from './ui/palette';

const DIFF_NAME: Record<Difficulty, string> = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings = loadSettings();
let stats = loadStats();

// ---------- Theme ----------
function applySettings(): void {
  const root = document.documentElement;
  if (settings.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  root.classList.toggle('no-patterns', !settings.patterns);
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#1d1a24' : '#f6f1ea');
  $('btn-theme').textContent = { auto: '◐ Auto', light: '☀ Hell', dark: '☾ Dunkel' }[settings.theme];
  $('btn-patterns').textContent = settings.patterns ? '▦ Muster an' : '□ Muster aus';
}

// ---------- Spielzustand ----------
let mode: Mode | null = null;
let puzzle: GeneratedPuzzle | null = null;
let game: Game | null = null;
let hint: Hint | null = null;
let running = false;
let lastTick = 0;
let gesture: { start: number; moved: boolean; erase: boolean } | null = null;

const view = new BoardView($('board'), {
  down(cell) {
    if (!game || game.solved) return;
    gesture = { start: cell, moved: false, erase: false };
  },
  move(cells) {
    if (!game || !gesture || game.solved) return;
    if (!gesture.moved) {
      gesture.moved = true;
      gesture.erase = game.marks[gesture.start] === 1;
      game.beginGesture();
      game.swipe(gesture.start, gesture.erase);
    }
    for (const c of cells) game.swipe(c, gesture.erase);
    changed(false);
  },
  up() {
    if (!game || !gesture) return;
    if (gesture.moved) game.endGesture();
    else if (!game.solved) game.tap(gesture.start);
    gesture = null;
    changed(true);
  },
});

function tick(): void {
  if (!running || !game) return;
  const now = performance.now();
  game.elapsedMs += now - lastTick;
  lastTick = now;
  $('timer').textContent = formatTime(game.elapsedMs);
}

function setRunning(on: boolean): void {
  tick();
  running = on && !!game && !game.solved && !document.hidden && $('screen-play').hidden === false && $('modal').hidden;
  lastTick = performance.now();
}

setInterval(tick, 250);
document.addEventListener('visibilitychange', () => {
  setRunning(true);
  if (document.hidden) persist();
});
setInterval(() => running && persist(), 5000);

function persist(): void {
  if (!mode || !puzzle || !game) return;
  tick();
  saveGame({ mode, puzzle, game: game.save() });
}

function highlightFor(h: Hint | null): Highlight | null {
  if (!h || !puzzle) return null;
  if (h.kind === 'wrong-cat' || h.kind === 'wrong-cross') return { cells: [h.cell], area: [], error: true };
  if (h.kind === 'reveal') return { cells: [h.cell], area: [] };
  if (h.kind !== 'step') return null;
  const s = h.step;
  const area = [...s.sources, ...(s.technique === 'attack' ? s.targets : [])].flatMap((u) => u.cells);
  return { cells: s.cells, area };
}

function render(): void {
  if (!game || !puzzle) return;
  view.render(game.marks, game.errors(), highlightFor(hint), game.solved);
  const cats = game.cats().length;
  $('count').innerHTML = `<b>${cats}</b>/${puzzle.n}`;
  $('count').classList.toggle('over', cats > puzzle.n);
  ($('btn-undo') as HTMLButtonElement).disabled = game.solved || game.undoStack.length === 0;
  ($('btn-hint') as HTMLButtonElement).disabled = game.solved;
  ($('btn-restart') as HTMLButtonElement).disabled = game.solved;
  $('timer').textContent = formatTime(game.elapsedMs);
  const box = $('hint-box');
  if (hint) {
    box.hidden = false;
    box.className = 'hint-box' + (hint.kind === 'wrong-cat' || hint.kind === 'wrong-cross' ? ' error' : '');
    box.textContent = describeHint(hint, (i) => REGION_NAMES[i]);
  } else if (game.solved) {
    box.hidden = false;
    box.className = 'hint-box done';
    box.textContent = `Gelöst in ${formatTime(game.elapsedMs)}`;
  } else {
    box.hidden = true;
  }
}

/** Nach jeder Eingabe: Hinweis weg, speichern, Sieg prüfen. */
function changed(final: boolean): void {
  hint = null;
  render();
  if (!final || !game) return;
  persist();
  if (game.solved) onSolved();
}

function onSolved(): void {
  if (!game || !puzzle || !mode) return;
  setRunning(false);
  render();
  const { newBest } = recordSolve(stats, {
    difficulty: puzzle.difficulty,
    timeMs: game.elapsedMs,
    hints: game.hints,
    daily: mode.kind === 'daily' ? mode.date : undefined,
  });
  saveStats(stats);
  if (mode.kind === 'free') clearGame(mode);
  else persist();
  try {
    navigator.vibrate?.([30, 40, 30]);
  } catch {
    /* egal */
  }
  const streak = currentStreak(stats, dateKey(new Date()));
  const lines = [
    `<div class="big-time">${formatTime(game.elapsedMs)}</div>`,
    newBest ? `<p class="badge">Neue Bestzeit für ${DIFF_NAME[puzzle.difficulty]}!</p>` : '',
    game.hints ? `<p class="muted">${game.hints} Hinweis${game.hints > 1 ? 'e' : ''} benutzt (Bestzeiten zählen nur ohne Hinweis)</p>` : '',
    mode.kind === 'daily' ? `<p>Tages-Serie: <b>${streak}</b> ${streak === 1 ? 'Tag' : 'Tage'}</p>` : '',
  ];
  const free = mode.kind === 'free' ? (mode.difficulty as Difficulty) : null;
  setTimeout(() => {
    showModal(
      `<div class="win-cat">${CROWN_CAT_SVG}</div><h2>Miau, geschafft!</h2>${lines.join('')}
       <div class="row">${free ? `<button class="primary" data-act="next">Nächstes Rätsel</button>` : ''}<button data-act="menu">Menü</button><button data-act="close">Ansehen</button></div>`,
      (act) => {
        if (act === 'next' && free) startFree(free);
        else if (act === 'menu') showMenu();
      },
    );
  }, 900);
}

// ---------- Bildschirme ----------
function showScreen(play: boolean): void {
  $('screen-menu').hidden = play;
  $('screen-play').hidden = !play;
  setRunning(true);
}

function showLoading(text: string): void {
  showModal(`<div class="loading">${CROWN_CAT_SVG}</div><p>${text}</p>`, undefined, false);
}

function startPuzzle(m: Mode, p: GeneratedPuzzle): void {
  persist();
  const stored = loadGame(m);
  mode = m;
  puzzle = stored && stored.puzzle.seed === p.seed ? stored.puzzle : p;
  game = new Game(puzzle, stored && stored.puzzle.seed === p.seed ? stored.game : undefined);
  hint = null;
  view.setPuzzle(puzzle);
  const label = m.kind === 'daily' ? `Tagesrätsel · ${DIFF_NAME[puzzle.difficulty]}` : DIFF_NAME[puzzle.difficulty];
  $('play-title').textContent = `${label} · ${puzzle.n}×${puzzle.n}`;
  hideModal();
  showScreen(true);
  render();
  persist();
}

async function startDaily(): Promise<void> {
  const date = dateKey(new Date());
  const m: Mode = { kind: 'daily', date };
  const stored = loadGame(m);
  if (stored) return startPuzzle(m, stored.puzzle);
  showLoading('Die Katzen suchen sich ihre Plätze …');
  startPuzzle(m, await daily(date));
}

async function startFree(d: Difficulty, resume = false): Promise<void> {
  const m: Mode = { kind: 'free', difficulty: d };
  const stored = loadGame(m);
  if (resume && stored && !stored.game.solved) return startPuzzle(m, stored.puzzle);
  clearGame(m);
  showLoading('Die Katzen suchen sich ihre Plätze …');
  startPuzzle(m, await takeFree(d));
}

function showMenu(): void {
  persist();
  hideModal();
  const today = new Date();
  const key = dateKey(today);
  const dd = dailyDifficulty(today);
  const dailyDone = stats.daily[key] !== undefined;
  const dailyStored = loadGame({ kind: 'daily', date: key });
  $('daily-sub').textContent = `${WEEKDAYS[today.getDay()]}, ${today.getDate()}.${today.getMonth() + 1}. · ${DIFF_NAME[dd]}`;
  $('daily-state').textContent = dailyDone
    ? `✓ ${formatTime(stats.daily[key])}`
    : dailyStored && dailyStored.game.marks.some((m) => m)
      ? 'weiterspielen'
      : '';
  const streak = currentStreak(stats, key);
  $('streak').textContent = streak ? `🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'} in Folge` : '';
  for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const btn = $(`free-${d}`);
    const stored = loadGame({ kind: 'free', difficulty: d });
    const sizes = DIFFICULTIES[d].sizes;
    const best = stats.best[d];
    btn.querySelector('.size')!.textContent = `${sizes[0]}×${sizes[0]} bis ${sizes[sizes.length - 1]}×${sizes[sizes.length - 1]}`;
    btn.querySelector('.best')!.textContent = best !== undefined ? `Bestzeit ${formatTime(best)}` : 'noch keine Bestzeit';
    const resume = btn.parentElement!.querySelector<HTMLButtonElement>('.resume')!;
    resume.hidden = !(stored && !stored.game.solved);
  }
  showScreen(false);
}

// ---------- Modal ----------
let modalHandler: ((act: string) => void) | undefined;

function showModal(html: string, onAct?: (act: string) => void, closable = true): void {
  $('modal-card').innerHTML = html;
  $('modal').hidden = false;
  $('modal').dataset.closable = String(closable);
  modalHandler = onAct;
  setRunning(false);
}

function hideModal(): void {
  $('modal').hidden = true;
  modalHandler = undefined;
  setRunning(true);
}

$('modal').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act) {
    const h = modalHandler;
    hideModal();
    h?.(act);
  } else if (t.id === 'modal' && $('modal').dataset.closable === 'true') hideModal();
});

function showStats(): void {
  const key = dateKey(new Date());
  const rows = (['easy', 'medium', 'hard'] as Difficulty[])
    .map((d) => `<tr><td>${DIFF_NAME[d]}</td><td>${stats.solved[d]}</td><td>${stats.best[d] !== undefined ? formatTime(stats.best[d]!) : '–'}</td></tr>`)
    .join('');
  showModal(
    `<h2>Statistik</h2>
     <table class="stats"><tr><th></th><th>Gelöst</th><th>Bestzeit</th></tr>${rows}</table>
     <p>Tagesrätsel gelöst: <b>${Object.keys(stats.daily).length}</b><br>
     Serie: <b>${currentStreak(stats, key)}</b> · Beste Serie: <b>${stats.bestStreak}</b><br>
     Hinweise benutzt: <b>${stats.hintsUsed}</b></p>
     <p class="muted">Bestzeiten zählen nur ohne Hinweis.</p>
     <div class="row"><button class="primary" data-act="close">Schließen</button></div>`,
  );
}

function showRules(): void {
  showModal(
    `<h2>So geht's</h2>
     <p>Setze in jede <b>Zeile</b>, jede <b>Spalte</b> und jede <b>Farbregion</b> genau <b>eine Katze</b>.
     Zwei Katzen dürfen sich <b>nicht berühren</b>, auch nicht schräg.</p>
     <p><b>Tippen:</b> leer → X → Katze → leer. Das X merkt dir Felder, auf denen keine Katze sein kann.<br>
     <b>Wischen:</b> über mehrere Felder ziehen setzt überall ein X (beginnst du auf einem X, wischst du X wieder weg).</p>
     <p>Fehler werden sofort rot. <b>Hinweis</b> zeigt zuerst Fehler, sonst den nächsten logischen Schritt mit Erklärung.</p>
     <p class="muted">Jedes Rätsel hat genau eine Lösung und ist ohne Raten lösbar. Das Tagesrätsel ist auf jedem Gerät gleich: Mo/Di leicht, Mi/Do mittel, Fr bis So schwer.</p>
     <div class="row"><button class="primary" data-act="close">Los geht's</button></div>`,
  );
}

// ---------- Knöpfe ----------
$('btn-daily').addEventListener('click', () => void startDaily());
for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
  $(`free-${d}`).addEventListener('click', () => void startFree(d));
  $(`free-${d}`).parentElement!.querySelector('.resume')!.addEventListener('click', () => void startFree(d, true));
}
$('btn-stats').addEventListener('click', showStats);
$('btn-rules').addEventListener('click', showRules);
$('btn-theme').addEventListener('click', () => {
  settings.theme = settings.theme === 'auto' ? 'light' : settings.theme === 'light' ? 'dark' : 'auto';
  saveSettings(settings);
  applySettings();
});
$('btn-patterns').addEventListener('click', () => {
  settings.patterns = !settings.patterns;
  saveSettings(settings);
  applySettings();
});
$('btn-back').addEventListener('click', showMenu);
$('btn-undo').addEventListener('click', () => {
  if (game?.undo()) changed(true);
});
$('btn-restart').addEventListener('click', () => {
  if (!game || game.solved) return;
  game.restart();
  changed(true);
});
$('btn-hint').addEventListener('click', () => {
  if (!game || !puzzle || game.solved) return;
  hint = getHint(puzzle, game.marks);
  if (hint.kind !== 'solved') game.hints++;
  persist();
  render();
});
document.addEventListener('keydown', (e) => {
  if ($('screen-play').hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') $('btn-undo').click();
  if (e.key === 'Escape') ($('modal').hidden ? showMenu : hideModal)();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySettings);

// ---------- Start ----------
$('logo').innerHTML = CROWN_CAT_SVG;
applySettings();
pruneDailyGames(dateKey(new Date()));
showMenu();
if (!localStorage.getItem('catqueens-seen-rules')) {
  try {
    localStorage.setItem('catqueens-seen-rules', '1');
  } catch {
    /* egal */
  }
  showRules();
}
// Vorrat fürs freie Spiel anlegen, nacheinander, damit der Worker nicht blockiert.
setTimeout(() => (['easy', 'medium', 'hard'] as Difficulty[]).forEach(prepareNext), 600);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

// Für Tests im Browser: aktueller Zustand.
(window as unknown as { catQueens: unknown }).catQueens = {
  get puzzle() {
    return puzzle;
  },
  get game() {
    return game;
  },
  CAT,
  modeKey,
};
