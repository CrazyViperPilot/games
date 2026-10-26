// localStorage mit eigenem Präfix; jede Lese-/Schreibaktion ist abgesichert (privater Modus, voller Speicher).

import type { Difficulty, GeneratedPuzzle } from '../core/generator';
import type { SavedGame } from './game';
import { emptyStats, type Stats } from './stats';

const PREFIX = 'catqueens-';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* Speicher voll oder gesperrt: Spiel läuft trotzdem weiter */
  }
}

export type Theme = 'auto' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  patterns: boolean;
}

export const loadSettings = (): Settings => ({ theme: 'auto', patterns: true, ...read<Settings>('settings') });
export const saveSettings = (s: Settings) => write('settings', s);

export function loadStats(): Stats {
  const s = read<Stats>('stats');
  const base = emptyStats();
  return s ? { ...base, ...s, solved: { ...base.solved, ...s.solved }, best: { ...s.best }, daily: { ...s.daily } } : base;
}
export const saveStats = (s: Stats) => write('stats', s);

/** Spielmodus: Tagesrätsel eines Datums oder freies Spiel einer Stufe. */
export type Mode = { kind: 'daily'; date: string } | { kind: 'free'; difficulty: Difficulty };

export const modeKey = (m: Mode) => (m.kind === 'daily' ? `daily-${m.date}` : `free-${m.difficulty}`);

export interface StoredGame {
  mode: Mode;
  puzzle: GeneratedPuzzle;
  game: SavedGame;
}

export const loadGame = (m: Mode) => read<StoredGame>(`game-${modeKey(m)}`);
export const saveGame = (g: StoredGame) => write(`game-${modeKey(g.mode)}`, g);
export const clearGame = (m: Mode) => write(`game-${modeKey(m)}`, null);

/** Vorbereitetes nächstes Rätsel je Stufe (im Hintergrund erzeugt). */
export const loadNext = (d: Difficulty) => read<GeneratedPuzzle>(`next-${d}`);
export const saveNext = (d: Difficulty, p: GeneratedPuzzle | null) => write(`next-${d}`, p);

/** Alte Tagesrätsel-Spielstände aufräumen (älter als heute). */
export function pruneDailyGames(today: string): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      const m = k?.match(/^catqueens-game-daily-(\d{4}-\d{2}-\d{2})$/);
      if (k && m && m[1] < today) localStorage.removeItem(k);
    }
  } catch {
    /* egal */
  }
}
