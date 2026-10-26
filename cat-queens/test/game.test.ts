import { describe, expect, it } from 'vitest';
import { CAT, CROSS, EMPTY } from '../src/core/logic';
import { Game } from '../src/game/game';
import { currentStreak, emptyStats, formatTime, previousDay, recordSolve } from '../src/game/stats';
import { parseRegions } from './helpers';

const fx = parseRegions(['ddaac', 'dbcac', 'deccc', 'decee', 'eeeee']);
const puzzle = { ...fx, solution: [3, 1, 4, 0, 2] };
const solCell = (r: number) => r * 5 + puzzle.solution[r];

describe('Game', () => {
  it('Tippen: leer → X → Katze → leer', () => {
    const g = new Game(puzzle);
    g.tap(0);
    expect(g.marks[0]).toBe(CROSS);
    g.tap(0);
    expect(g.marks[0]).toBe(CAT);
    g.tap(0);
    expect(g.marks[0]).toBe(EMPTY);
  });

  it('Wischen setzt X auf leere Felder, lässt Katzen stehen und ist ein Rückgängig-Schritt', () => {
    const g = new Game(puzzle);
    g.tap(2);
    g.tap(2); // Katze
    g.beginGesture();
    for (const c of [0, 1, 2, 3, 4]) g.swipe(c, false);
    g.endGesture();
    expect([...g.marks.slice(0, 5)]).toEqual([CROSS, CROSS, CAT, CROSS, CROSS]);
    g.undo();
    expect([...g.marks.slice(0, 5)]).toEqual([EMPTY, EMPTY, CAT, EMPTY, EMPTY]);
  });

  it('Wischen ab einem X entfernt X', () => {
    const g = new Game(puzzle);
    g.beginGesture();
    [0, 1, 2].forEach((c) => g.swipe(c, false));
    g.endGesture();
    g.beginGesture();
    [0, 1].forEach((c) => g.swipe(c, true));
    g.endGesture();
    expect([...g.marks.slice(0, 3)]).toEqual([EMPTY, EMPTY, CROSS]);
  });

  it('markiert Regelverstöße und volle X-Reihen rot', () => {
    const g = new Game(puzzle);
    g.tap(0);
    g.tap(0);
    g.tap(6);
    g.tap(6); // berührt Katze auf 0
    expect([...g.errors()].sort()).toEqual([0, 6]);
    const h = new Game(puzzle);
    h.beginGesture();
    for (let c = 0; c < 5; c++) h.swipe(c, false);
    h.endGesture();
    expect([...h.errors()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('erkennt den Sieg und sperrt danach Eingaben', () => {
    const g = new Game(puzzle);
    for (let r = 0; r < 5; r++) {
      g.tap(solCell(r));
      g.tap(solCell(r));
    }
    expect(g.solved).toBe(true);
    g.tap(solCell(0));
    expect(g.marks[solCell(0)]).toBe(CAT);
    expect(g.undo()).toBe(false);
  });

  it('Neustart leert alles und lässt sich rückgängig machen', () => {
    const g = new Game(puzzle);
    g.tap(0);
    g.tap(7);
    g.restart();
    expect(g.marks.every((m) => m === EMPTY)).toBe(true);
    g.undo();
    expect(g.marks[0]).toBe(CROSS);
    expect(g.marks[7]).toBe(CROSS);
  });

  it('speichert und lädt den Spielstand', () => {
    const g = new Game(puzzle);
    g.tap(3);
    g.elapsedMs = 12345;
    g.hints = 2;
    const h = new Game(puzzle, JSON.parse(JSON.stringify(g.save())));
    expect(h.marks[3]).toBe(CROSS);
    expect(h.elapsedMs).toBe(12345);
    expect(h.hints).toBe(2);
    h.undo();
    expect(h.marks[3]).toBe(EMPTY);
  });
});

describe('Statistik', () => {
  it('zählt gelöste Rätsel und Bestzeiten nur ohne Hinweis', () => {
    const s = emptyStats();
    expect(recordSolve(s, { difficulty: 'easy', timeMs: 60000, hints: 0 }).newBest).toBe(true);
    expect(recordSolve(s, { difficulty: 'easy', timeMs: 30000, hints: 1 }).newBest).toBe(false);
    expect(recordSolve(s, { difficulty: 'easy', timeMs: 50000, hints: 0 }).newBest).toBe(true);
    expect(s.solved.easy).toBe(3);
    expect(s.best.easy).toBe(50000);
    expect(s.hintsUsed).toBe(1);
  });

  it('zählt die Tages-Serie und setzt sie nach einer Lücke zurück', () => {
    const s = emptyStats();
    for (const d of ['2026-10-30', '2026-10-31', '2026-11-01']) recordSolve(s, { difficulty: 'hard', timeMs: 1000, hints: 0, daily: d });
    expect(s.streak).toBe(3);
    recordSolve(s, { difficulty: 'hard', timeMs: 1000, hints: 0, daily: '2026-11-01' }); // doppelt zählt nicht
    expect(s.streak).toBe(3);
    expect(currentStreak(s, '2026-11-02')).toBe(3);
    expect(currentStreak(s, '2026-11-03')).toBe(0);
    recordSolve(s, { difficulty: 'easy', timeMs: 1000, hints: 0, daily: '2026-11-04' });
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(3);
  });

  it('rechnet Tage und Zeiten richtig', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
    expect(formatTime(65000)).toBe('1:05');
    expect(formatTime(3725000)).toBe('1:02:05');
  });
});
