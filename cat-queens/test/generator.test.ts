import { describe, expect, it } from 'vitest';
import { buildBoard, isValidSolution, regionsConnected, solutionCells } from '../src/core/board';
import {
  DIFFICULTIES,
  dailyDifficulty,
  dailyPuzzle,
  dateKey,
  generatePuzzle,
  growRegions,
  makeUnique,
  randomSolution,
  regionSizes,
  type Difficulty,
} from '../src/core/generator';
import { solveLogically } from '../src/core/logic';
import { createRng } from '../src/core/rng';
import { solve } from '../src/core/solver';

const SEEDS_PER_DIFFICULTY = 12;

describe('randomSolution', () => {
  it('erzeugt für n=5..10 gültige Stellungen (je eine pro Zeile/Spalte, keine Berührung)', () => {
    const rng = createRng('sol');
    for (let n = 5; n <= 10; n++) {
      for (let i = 0; i < 50; i++) {
        const sol = randomSolution(n, rng);
        expect(new Set(sol).size).toBe(n);
        for (let r = 1; r < n; r++) expect(Math.abs(sol[r] - sol[r - 1])).toBeGreaterThan(1);
      }
    }
  });
});

describe('growRegions', () => {
  it('füllt das Gitter mit n zusammenhängenden Regionen, je eine Lösungskatze darin', () => {
    const rng = createRng('grow');
    for (let n = 5; n <= 10; n++) {
      for (let i = 0; i < 30; i++) {
        const sol = randomSolution(n, rng);
        const regions = growRegions(n, sol, rng);
        expect(regions.every((r) => r >= 0 && r < n)).toBe(true);
        expect(regionsConnected(n, regions)).toBe(true);
        const regs = sol.map((c, r) => regions[r * n + c]);
        expect(new Set(regs).size).toBe(n);
      }
    }
  });
});

describe('makeUnique', () => {
  it('liefert entweder null oder Regionen mit genau der gewünschten Lösung', () => {
    const rng = createRng('unique');
    let ok = 0;
    for (let i = 0; i < 40; i++) {
      const n = 6 + (i % 3);
      const sol = randomSolution(n, rng);
      const regions = makeUnique(n, growRegions(n, sol, rng), sol, rng);
      if (!regions) continue;
      ok++;
      const res = solve(n, regions, 2);
      expect(res.count).toBe(1);
      expect(res.solutions[0]).toEqual(sol);
      expect(regionsConnected(n, regions)).toBe(true);
    }
    expect(ok).toBeGreaterThan(20);
  });
});

describe.each(['easy', 'medium', 'hard'] as Difficulty[])('generatePuzzle(%s)', (difficulty) => {
  const spec = DIFFICULTIES[difficulty];
  const puzzles = Array.from({ length: SEEDS_PER_DIFFICULTY }, (_, i) => generatePuzzle({ seed: `test-${i}`, difficulty }));

  it('hat eine erlaubte Größe', () => {
    for (const p of puzzles) expect(spec.sizes).toContain(p.n);
  });

  it('Regionen sind vollständig und zusammenhängend', () => {
    for (const p of puzzles) {
      expect(p.regions).toHaveLength(p.n * p.n);
      expect(regionsConnected(p.n, p.regions)).toBe(true);
      expect(regionSizes(p.n, p.regions).filter((s) => s === 1).length).toBeLessThanOrEqual(spec.maxTinyRegions);
    }
  });

  it('die Lösung ist gültig', () => {
    for (const p of puzzles) expect(isValidSolution(p.n, p.regions, solutionCells(p.solution))).toBe(true);
  });

  it('hat GENAU EINE Lösung (Backtracking)', () => {
    for (const p of puzzles) {
      const res = solve(p.n, p.regions, 2);
      expect(res.count).toBe(1);
      expect(res.solutions[0]).toEqual(p.solution);
    }
  });

  it('ist ohne Raten lösbar und passt zur Schwierigkeit', () => {
    for (const p of puzzles) {
      const logic = solveLogically(buildBoard(p.n, p.regions));
      expect(logic.solved).toBe(true);
      expect(p.rating.maxLevel).toBeGreaterThanOrEqual(spec.minLevel);
      expect(p.rating.maxLevel).toBeLessThanOrEqual(spec.maxLevel);
      expect(p.rating.score).toBeGreaterThanOrEqual(spec.minScore);
    }
  });

  it('ist deterministisch (gleicher Seed = gleiches Rätsel)', () => {
    const again = generatePuzzle({ seed: 'test-0', difficulty });
    expect(again.regions).toEqual(puzzles[0].regions);
    expect(again.solution).toEqual(puzzles[0].solution);
  });

  it('verschiedene Seeds ergeben verschiedene Rätsel', () => {
    expect(new Set(puzzles.map((p) => p.regions.join(''))).size).toBe(puzzles.length);
  });
});

describe('feste Größen', () => {
  it('erzeugt für jede Größe 5..10 ein eindeutiges Rätsel', () => {
    for (let n = 5; n <= 10; n++) {
      const difficulty: Difficulty = n <= 6 ? 'easy' : n <= 8 ? 'medium' : 'hard';
      const p = generatePuzzle({ seed: `size-${n}`, difficulty, n });
      expect(p.n).toBe(n);
      expect(solve(n, p.regions, 2).count).toBe(1);
      expect(regionsConnected(n, p.regions)).toBe(true);
    }
  });
});

describe('Tagesrätsel', () => {
  it('Seed ist das Datum: gleicher Tag = gleiches Rätsel, anderer Tag = anderes', () => {
    const a = dailyPuzzle(new Date(2026, 9, 26, 8, 0));
    const b = dailyPuzzle(new Date(2026, 9, 26, 23, 59));
    const c = dailyPuzzle(new Date(2026, 9, 27, 8, 0));
    expect(a.regions).toEqual(b.regions);
    expect(a.seed).toBe('daily-2026-10-26');
    expect(c.regions).not.toEqual(a.regions);
    expect(solve(a.n, a.regions, 2).count).toBe(1);
  });

  it('Schwierigkeit steigt über die Woche (Mo leicht ... So schwer)', () => {
    // 26.10.2026 ist ein Montag
    const week = [0, 1, 2, 3, 4, 5, 6].map((d) => dailyDifficulty(new Date(2026, 9, 26 + d)));
    expect(week).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'hard']);
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
