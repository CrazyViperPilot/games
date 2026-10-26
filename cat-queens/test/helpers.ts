import type { Puzzle } from '../src/core/board';

/** Alle Lösungen per roher Aufzählung aller Permutationen (nur für kleine n, als Gegenprobe zum Solver). */
export function bruteForceSolutions(n: number, regions: readonly number[]): number[][] {
  const out: number[][] = [];
  const perm: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const rec = () => {
    if (perm.length === n) {
      const regs = new Set(perm.map((c, r) => regions[r * n + c]));
      const apart = perm.every((c, r) => r === 0 || Math.abs(c - perm[r - 1]) > 1);
      if (regs.size === n && apart) out.push([...perm]);
      return;
    }
    for (let c = 0; c < n; c++) {
      if (used[c]) continue;
      used[c] = true;
      perm.push(c);
      rec();
      perm.pop();
      used[c] = false;
    }
  };
  rec();
  return out;
}

/** Rätsel aus Textzeilen, je Zeichen eine Region (a, b, c ...). */
export function parseRegions(rows: string[]): { n: number; regions: number[] } {
  const n = rows.length;
  const regions = rows.join('').split('').map((ch) => ch.charCodeAt(0) - 97);
  return { n, regions };
}

export function solutionSet(p: Puzzle): Set<number> {
  return new Set(p.solution.map((c, r) => r * p.n + c));
}
