// Rätselgenerator: Lösung würfeln, Regionen per Flood-Fill wachsen lassen,
// auf genau eine Lösung trimmen und die Schwierigkeit mit dem Logik-Löser messen.

import { buildBoard, regionsConnected, type Puzzle } from './board';
import { solveLogically, type LogicResult, type Technique } from './logic';
import { createRng, type Rng } from './rng';
import { solve } from './solver';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultySpec {
  /** Erlaubte Gittergrößen. */
  sizes: number[];
  /** Schwerste Technik muss in [minLevel, maxLevel] liegen (siehe LEVEL in logic.ts). */
  minLevel: number;
  maxLevel: number;
  /** Mindest-Denkaufwand (score aus solveLogically). */
  minScore: number;
  /** Höchstens so viele Regionen aus nur einem Feld (die verraten sofort eine Katze). */
  maxTinyRegions: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultySpec> = {
  easy: { sizes: [5, 6, 7], minLevel: 0, maxLevel: 2, minScore: 0, maxTinyRegions: 1 },
  medium: { sizes: [7, 8], minLevel: 3, maxLevel: 4, minScore: 8, maxTinyRegions: 1 },
  hard: { sizes: [9, 10], minLevel: 4, maxLevel: 6, minScore: 20, maxTinyRegions: 0 },
};

export interface Rating {
  maxLevel: number;
  score: number;
  steps: number;
  counts: Record<Technique, number>;
}

export interface GeneratedPuzzle extends Puzzle {
  seed: string;
  difficulty: Difficulty;
  rating: Rating;
  /** Versuche bis zum Treffer (für Messungen). */
  attempts: number;
}

/** Zufällige gültige Katzenstellung: je Zeile/Spalte eine, keine zwei berühren sich. */
export function randomSolution(n: number, rng: Rng): number[] {
  const cols: number[] = [];
  const used = new Set<number>();
  const rec = (row: number): boolean => {
    if (row === n) return true;
    const order = rng.shuffle([...Array(n).keys()]);
    for (const c of order) {
      if (used.has(c) || (row > 0 && Math.abs(c - cols[row - 1]) <= 1)) continue;
      used.add(c);
      cols.push(c);
      if (rec(row + 1)) return true;
      cols.pop();
      used.delete(c);
    }
    return false;
  };
  if (!rec(0)) throw new Error(`keine Lösung für n=${n}`);
  return cols;
}

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

function orthoNeighbors(n: number, cell: number): number[] {
  const r = Math.floor(cell / n);
  const c = cell % n;
  const out: number[] = [];
  for (const [dr, dc] of DIRS) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
  }
  return out;
}

/**
 * Lässt von jeder Katze aus eine Region wachsen, bis das Gitter voll ist.
 * Unterschiedliche Wachstumsgewichte sorgen für große und kleine Regionen.
 */
export function growRegions(n: number, solution: readonly number[], rng: Rng): number[] {
  const regions = new Array<number>(n * n).fill(-1);
  solution.forEach((c, r) => (regions[r * n + c] = r));
  const weights = solution.map(() => 0.35 + rng.next() * 1.65);
  let left = n * n - n;
  while (left > 0) {
    const frontier: number[][] = Array.from({ length: n }, () => []);
    for (let cell = 0; cell < n * n; cell++) {
      if (regions[cell] !== -1) continue;
      for (const nb of orthoNeighbors(n, cell)) {
        const reg = regions[nb];
        if (reg !== -1 && !frontier[reg].includes(cell)) frontier[reg].push(cell);
      }
    }
    let total = 0;
    for (let reg = 0; reg < n; reg++) if (frontier[reg].length) total += weights[reg];
    let roll = rng.next() * total;
    let chosen = -1;
    for (let reg = 0; reg < n; reg++) {
      if (!frontier[reg].length) continue;
      chosen = reg;
      roll -= weights[reg];
      if (roll < 0) break;
    }
    regions[rng.pick(frontier[chosen])] = chosen;
    left--;
  }
  return regions;
}

/** Bleibt die Region ohne `cell` zusammenhängend? */
function connectedWithout(n: number, regions: readonly number[], cell: number): boolean {
  const reg = regions[cell];
  const cells: number[] = [];
  for (let i = 0; i < n * n; i++) if (regions[i] === reg && i !== cell) cells.push(i);
  if (cells.length === 0) return false;
  const seen = new Set<number>([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of orthoNeighbors(n, cur)) {
      if (nb !== cell && regions[nb] === reg && !seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen.size === cells.length;
}

/**
 * Darf `cell` in Region `reg` wechseln? Kein Katzenfeld, grenzt an reg, alte Region bleibt
 * zusammenhängend und behält mindestens minSize Felder.
 */
function canMove(n: number, regions: readonly number[], solCells: Set<number>, cell: number, reg: number, minSize: number): boolean {
  return (
    !solCells.has(cell) &&
    regions.filter((r) => r === regions[cell]).length > minSize &&
    regions[cell] !== reg &&
    orthoNeighbors(n, cell).some((nb) => regions[nb] === reg) &&
    connectedWithout(n, regions, cell)
  );
}

/**
 * Passt Regionen an, bis nur noch die gewünschte Lösung passt. Ein Feld einer fremden Lösung,
 * das in eine Nachbarregion wechselt, macht diese fremde Lösung ungültig (eine Region hätte zwei
 * Katzen, eine keine). Je Runde werden solche Züge für einige fremde Lösungen gesammelt; es gewinnt
 * der Zug, nach dem am wenigsten Lösungen übrig bleiben. Gibt null zurück, wenn es nicht klappt.
 */
export function makeUnique(
  n: number,
  regions: number[],
  solution: readonly number[],
  rng: Rng,
  minSize = 1,
  maxRounds = 80,
  cap = 40,
): number[] | null {
  const solCells = new Set(solution.map((c, r) => r * n + c));
  let res = solve(n, regions, cap);
  for (let round = 0; round < maxRounds && res.count > 1; round++) {
    const others = rng.shuffle(res.solutions.filter((s) => s.some((c, r) => c !== solution[r]))).slice(0, 4);
    const seen = new Set<number>();
    const moves: [number, number][] = [];
    const add = (cell: number, reg: number): void => {
      const key = cell * n + reg;
      if (!seen.has(key) && canMove(n, regions, solCells, cell, reg, minSize)) {
        seen.add(key);
        moves.push([cell, reg]);
      }
    };
    for (const other of others) {
      other.forEach((c, r) => {
        const cell = r * n + c;
        for (const nb of orthoNeighbors(n, cell)) add(cell, regions[nb]);
      });
    }
    if (!moves.length) {
      // Notfalls irgendein Randfeld verschieben und weitersuchen.
      for (let k = 0; k < 40 && moves.length < 8; k++) {
        const cell = rng.int(n * n);
        add(cell, regions[rng.pick(orthoNeighbors(n, cell))]);
      }
      if (!moves.length) return null;
    }
    rng.shuffle(moves);
    let best: { cell: number; reg: number; res: ReturnType<typeof solve> } | null = null;
    for (const [cell, reg] of moves.slice(0, 16)) {
      const old = regions[cell];
      regions[cell] = reg;
      const r = solve(n, regions, best ? best.res.count : cap);
      regions[cell] = old;
      if (!best || r.count < best.res.count) best = { cell, reg, res: r };
      if (r.count === 1) break;
    }
    regions[best!.cell] = best!.reg;
    res = best!.res;
  }
  return res.count === 1 ? regions : null;
}

export function rate(logic: LogicResult): Rating {
  return { maxLevel: logic.maxLevel, score: logic.score, steps: logic.steps.length, counts: logic.counts };
}

function matches(spec: DifficultySpec, r: Rating): boolean {
  return r.maxLevel >= spec.minLevel && r.maxLevel <= spec.maxLevel && r.score >= spec.minScore;
}

export function regionSizes(n: number, regions: readonly number[]): number[] {
  const sizes = new Array<number>(n).fill(0);
  for (const reg of regions) sizes[reg]++;
  return sizes;
}

/** Abstand zur Zielschwierigkeit, um notfalls das beste Rätsel zu nehmen. */
function distance(spec: DifficultySpec, r: Rating): number {
  let d = 0;
  if (r.maxLevel < spec.minLevel) d += (spec.minLevel - r.maxLevel) * 10;
  if (r.maxLevel > spec.maxLevel) d += (r.maxLevel - spec.maxLevel) * 10;
  if (r.score < spec.minScore) d += spec.minScore - r.score;
  return d;
}

export interface GenerateOptions {
  seed: string;
  difficulty: Difficulty;
  /** Feste Größe statt Zufallswahl aus DIFFICULTIES[difficulty].sizes. */
  n?: number;
  maxAttempts?: number;
}

/**
 * Erzeugt ein eindeutig lösbares Rätsel, das ohne Raten lösbar ist und zur Schwierigkeit passt.
 * Rein deterministisch: gleicher Seed, gleiche Schwierigkeit, gleiches Rätsel.
 */
export function generatePuzzle(opts: GenerateOptions): GeneratedPuzzle {
  const spec = DIFFICULTIES[opts.difficulty];
  const rng = createRng(`${opts.seed}|${opts.difficulty}|${opts.n ?? ''}`);
  const n = opts.n ?? rng.pick(spec.sizes);
  const maxAttempts = opts.maxAttempts ?? 300;
  let best: GeneratedPuzzle | null = null;
  let bestDist = Infinity;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const solution = randomSolution(n, rng);
    const regions = makeUnique(n, growRegions(n, solution, rng), solution, rng, spec.maxTinyRegions === 0 ? 2 : 1);
    if (!regions || !regionsConnected(n, regions)) continue;
    if (regionSizes(n, regions).filter((s) => s === 1).length > spec.maxTinyRegions) continue;
    const logic = solveLogically(buildBoard(n, regions));
    if (!logic.solved) continue;
    const rating = rate(logic);
    const candidate: GeneratedPuzzle = { n, regions, solution, seed: opts.seed, difficulty: opts.difficulty, rating, attempts: attempt };
    if (matches(spec, rating)) return candidate;
    const d = distance(spec, rating);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  if (best) return best;
  throw new Error('Kein Rätsel gefunden');
}

const WEEKDAY_DIFFICULTY: Difficulty[] = ['hard', 'easy', 'easy', 'medium', 'medium', 'hard', 'hard'];

/** Datum als YYYY-MM-DD in Ortszeit. */
export function dateKey(date: Date): string {
  const p = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Schwierigkeit des Tagesrätsels: Mo/Di leicht, Mi/Do mittel, Fr bis So schwer. */
export function dailyDifficulty(date: Date): Difficulty {
  return WEEKDAY_DIFFICULTY[date.getDay()];
}

/** Tagesrätsel: Seed = Datum, auf jedem Gerät gleich. */
export function dailyPuzzle(date: Date): GeneratedPuzzle {
  return generatePuzzle({ seed: `daily-${dateKey(date)}`, difficulty: dailyDifficulty(date) });
}
