import { describe, expect, it } from 'vitest';
import { isValidSolution } from '../src/core/board';
import { growRegions, randomSolution } from '../src/core/generator';
import { createRng } from '../src/core/rng';
import { isUnique, solve } from '../src/core/solver';
import { bruteForceSolutions, parseRegions } from './helpers';

describe('solver', () => {
  it('löst ein bekanntes eindeutiges 5×5-Rätsel', () => {
    const { n, regions } = parseRegions(['ddaac', 'dbcac', 'deccc', 'decee', 'eeeee']);
    const res = solve(n, regions, 10);
    expect(res.count).toBe(1);
    expect(res.solutions[0]).toEqual([3, 1, 4, 0, 2]);
    expect(bruteForceSolutions(n, regions)).toEqual(res.solutions);
  });

  it('findet alle 6 Lösungen eines mehrdeutigen 5×5-Bretts', () => {
    const { n, regions } = parseRegions(['abbbb', 'aabdb', 'cccdd', 'ccddd', 'eeeee']);
    const res = solve(n, regions, 10);
    expect(res.count).toBe(6);
    expect(res.solutions.map((s) => s.join())).toEqual(bruteForceSolutions(n, regions).map((s) => s.join()));
  });

  it('meldet mehrere Lösungen, wenn Regionen = Spalten', () => {
    const n = 6;
    const regions = Array.from({ length: n * n }, (_, i) => i % n);
    const res = solve(n, regions, 1000);
    expect(res.count).toBe(bruteForceSolutions(n, regions).length);
    expect(res.count).toBeGreaterThan(1);
    expect(isUnique(n, regions)).toBe(false);
  });

  it('meldet 0 Lösungen, wenn keine existiert (3×3)', () => {
    const n = 3; // 3×3 hat nie eine Lösung (Katzen berühren sich zwangsläufig)
    expect(solve(n, [0, 0, 0, 1, 1, 1, 2, 2, 2], 5).count).toBe(0);
  });

  it('stimmt auf 300 Zufallsbrettern (n=5..7) mit der rohen Aufzählung überein', () => {
    const rng = createRng('solver-check');
    for (let i = 0; i < 300; i++) {
      const n = 5 + (i % 3);
      const regions = growRegions(n, randomSolution(n, rng), rng);
      const brute = bruteForceSolutions(n, regions);
      const res = solve(n, regions, 100000);
      expect(res.count).toBe(brute.length);
      for (const s of res.solutions) expect(isValidSolution(n, regions, s.map((c, r) => r * n + c))).toBe(true);
    }
  });

  it('bricht beim Limit ab', () => {
    const n = 7;
    const regions = Array.from({ length: n * n }, (_, i) => i % n);
    expect(solve(n, regions, 2).count).toBe(2);
  });
});
