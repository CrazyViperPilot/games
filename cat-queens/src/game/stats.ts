// Statistik: gelöste Rätsel, Bestzeiten, Tages-Streak. Reine Logik, gespeichert wird in storage.ts.

import type { Difficulty } from '../core/generator';

export interface Stats {
  solved: Record<Difficulty, number>;
  /** Bestzeit in ms je Stufe (nur Rätsel ohne Hinweis). */
  best: Partial<Record<Difficulty, number>>;
  /** Gelöste Tagesrätsel: Datum (JJJJ-MM-TT) → Zeit in ms. */
  daily: Record<string, number>;
  streak: number;
  bestStreak: number;
  /** Letzter Tag mit gelöstem Tagesrätsel. */
  lastDaily: string | null;
  hintsUsed: number;
}

export function emptyStats(): Stats {
  return { solved: { easy: 0, medium: 0, hard: 0 }, best: {}, daily: {}, streak: 0, bestStreak: 0, lastDaily: null, hintsUsed: 0 };
}

/** Tag davor als JJJJ-MM-TT (Kalenderrechnung ohne Zeitzonenfehler). */
export function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}

export interface SolveRecord {
  difficulty: Difficulty;
  timeMs: number;
  hints: number;
  /** Datum, wenn es das Tagesrätsel war. */
  daily?: string;
}

/** Trägt ein gelöstes Rätsel ein. Gibt zurück, ob es eine neue Bestzeit ist. */
export function recordSolve(stats: Stats, rec: SolveRecord): { newBest: boolean } {
  stats.solved[rec.difficulty]++;
  stats.hintsUsed += rec.hints;
  let newBest = false;
  if (rec.hints === 0) {
    const old = stats.best[rec.difficulty];
    if (old === undefined || rec.timeMs < old) {
      stats.best[rec.difficulty] = rec.timeMs;
      newBest = true;
    }
  }
  if (rec.daily && stats.daily[rec.daily] === undefined) {
    stats.daily[rec.daily] = rec.timeMs;
    if (stats.lastDaily === rec.daily) {
      // schon gezählt
    } else if (stats.lastDaily && previousDay(rec.daily) === stats.lastDaily) {
      stats.streak++;
    } else {
      stats.streak = 1;
    }
    if (!stats.lastDaily || rec.daily > stats.lastDaily) stats.lastDaily = rec.daily;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  }
  return { newBest };
}

/** Aktueller Streak zum Anzeigen: verfällt, wenn gestern und heute kein Tagesrätsel gelöst wurde. */
export function currentStreak(stats: Stats, today: string): number {
  if (!stats.lastDaily) return 0;
  if (stats.lastDaily === today || stats.lastDaily === previousDay(today)) return stats.streak;
  return 0;
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
