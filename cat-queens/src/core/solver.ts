// Backtracking-Solver: zählt Lösungen (bis zu einem Limit) und prüft so die Eindeutigkeit.

export interface SolveResult {
  /** Gefundene Lösungen, höchstens `limit`. */
  count: number;
  /** Die gefundenen Lösungen als solution[zeile] = spalte. */
  solutions: number[][];
  /** Besuchte Knoten (für Tests und Messungen). */
  nodes: number;
}

/**
 * Sucht Zeile für Zeile alle Katzenstellungen: je Zeile, Spalte und Region genau eine Katze,
 * keine zwei Katzen berühren sich. Bricht nach `limit` Lösungen ab (2 reicht für "eindeutig?").
 */
export function solve(n: number, regions: readonly number[], limit = 2): SolveResult {
  // Ab 11×11 wird die Zeile-für-Zeile-Suche zu langsam, dort verzweigt die schlauere Variante.
  if (n > 10) return solveMostConstrained(n, regions, limit);
  const solutions: number[][] = [];
  const cols = new Array<number>(n).fill(-1);
  let nodes = 0;
  // Pro Region: Bitmaske der Zeilen, in denen sie vorkommt (für die Vorausschau).
  const regionRows = new Array<number>(n).fill(0);
  for (let i = 0; i < n * n; i++) regionRows[regions[i]] |= 1 << Math.floor(i / n);

  const rec = (row: number, usedCols: number, usedRegions: number): boolean => {
    if (row === n) {
      solutions.push([...cols]);
      return solutions.length >= limit;
    }
    // Vorausschau: jede noch freie Region muss in einer der restlichen Zeilen liegen.
    const restRows = ((1 << n) - 1) & ~((1 << row) - 1);
    for (let reg = 0; reg < n; reg++) {
      if (!(usedRegions & (1 << reg)) && !(regionRows[reg] & restRows)) return false;
    }
    const prev = row > 0 ? cols[row - 1] : -10;
    for (let c = 0; c < n; c++) {
      if (usedCols & (1 << c)) continue;
      if (Math.abs(c - prev) <= 1) continue;
      const reg = regions[row * n + c];
      if (usedRegions & (1 << reg)) continue;
      nodes++;
      cols[row] = c;
      if (rec(row + 1, usedCols | (1 << c), usedRegions | (1 << reg))) return true;
    }
    cols[row] = -1;
    return false;
  };
  rec(0, 0, 0);
  return { count: solutions.length, solutions, nodes };
}

/** Genau eine Lösung? */
export function isUnique(n: number, regions: readonly number[]): boolean {
  return solve(n, regions, 2).count === 1;
}

/**
 * Wie `solve`, verzweigt aber immer in der Region mit den wenigsten noch möglichen Feldern.
 * Findet dieselben Lösungen, nur in anderer Reihenfolge, und ist bei großen Gittern viel schneller.
 */
function solveMostConstrained(n: number, regions: readonly number[], limit: number): SolveResult {
  const solutions: number[][] = [];
  const cols = new Array<number>(n).fill(-1); // cols[zeile] = spalte, -1 = leer
  const cells: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n * n; i++) cells[regions[i]].push(i);
  let nodes = 0;

  const free = (r: number, c: number, usedCols: number): boolean => {
    if (cols[r] !== -1 || usedCols & (1 << c)) return false;
    if (r > 0 && cols[r - 1] !== -1 && Math.abs(cols[r - 1] - c) <= 1) return false;
    if (r < n - 1 && cols[r + 1] !== -1 && Math.abs(cols[r + 1] - c) <= 1) return false;
    return true;
  };

  const rec = (placed: number, usedCols: number, usedRegions: number): boolean => {
    if (placed === n) {
      solutions.push([...cols]);
      return solutions.length >= limit;
    }
    let bestReg = -1;
    let bestCount = Infinity;
    for (let reg = 0; reg < n && bestCount > 1; reg++) {
      if (usedRegions & (1 << reg)) continue;
      let count = 0;
      for (const cell of cells[reg]) if (free(Math.floor(cell / n), cell % n, usedCols)) count++;
      if (count < bestCount) {
        bestCount = count;
        bestReg = reg;
      }
      if (count === 0) return false;
    }
    for (const cell of cells[bestReg]) {
      const r = Math.floor(cell / n);
      const c = cell % n;
      if (!free(r, c, usedCols)) continue;
      nodes++;
      cols[r] = c;
      if (rec(placed + 1, usedCols | (1 << c), usedRegions | (1 << bestReg))) return true;
      cols[r] = -1;
    }
    return false;
  };
  rec(0, 0, 0);
  return { count: solutions.length, solutions, nodes };
}
