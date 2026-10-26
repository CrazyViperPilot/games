// Gitter-Grundlagen: Zellen, Einheiten (Zeile, Spalte, Region), Nachbarschaft, Regeln.

/** Ein Rätsel. Zellen sind zeilenweise nummeriert: Zelle = Zeile * n + Spalte. */
export interface Puzzle {
  n: number;
  /** Region (0..n-1) je Zelle, Länge n*n. */
  regions: number[];
  /** solution[zeile] = Spalte der Katze. */
  solution: number[];
}

export type UnitKind = 'row' | 'col' | 'region';

export interface Unit {
  kind: UnitKind;
  /** Nummer innerhalb der Art (Zeile 0..n-1 usw.). */
  index: number;
  /** Laufende Nummer über alle Einheiten: Zeilen 0..n-1, Spalten n..2n-1, Regionen 2n..3n-1. */
  id: number;
  cells: number[];
}

export interface Board {
  n: number;
  regions: number[];
  units: Unit[];
  rows: Unit[];
  cols: Unit[];
  regionUnits: Unit[];
  /** Je Zelle die drei Einheiten [Zeile, Spalte, Region]. */
  unitsOfCell: Unit[][];
  /** Je Zelle die bis zu 8 Nachbarzellen. */
  neighbors: number[][];
}

export function buildBoard(n: number, regions: readonly number[]): Board {
  const rows: Unit[] = [];
  const cols: Unit[] = [];
  const regionUnits: Unit[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({ kind: 'row', index: i, id: i, cells: [] });
    cols.push({ kind: 'col', index: i, id: n + i, cells: [] });
    regionUnits.push({ kind: 'region', index: i, id: 2 * n + i, cells: [] });
  }
  const unitsOfCell: Unit[][] = [];
  const neighbors: number[][] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = r * n + c;
      const reg = regions[cell];
      rows[r].cells.push(cell);
      cols[c].cells.push(cell);
      regionUnits[reg].cells.push(cell);
      unitsOfCell.push([rows[r], cols[c], regionUnits[reg]]);
      const nb: number[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < n && cc >= 0 && cc < n) nb.push(rr * n + cc);
        }
      }
      neighbors.push(nb);
    }
  }
  return { n, regions: [...regions], units: [...rows, ...cols, ...regionUnits], rows, cols, regionUnits, unitsOfCell, neighbors };
}

/** Zwei Zellen berühren sich (auch diagonal). */
export function touching(n: number, a: number, b: number): boolean {
  const dr = Math.abs(Math.floor(a / n) - Math.floor(b / n));
  const dc = Math.abs((a % n) - (b % n));
  return a !== b && dr <= 1 && dc <= 1;
}

/** Alle Regionen 0..n-1 vorhanden und jede zusammenhängend (4er-Nachbarschaft)? */
export function regionsConnected(n: number, regions: readonly number[]): boolean {
  if (regions.length !== n * n) return false;
  for (let reg = 0; reg < n; reg++) {
    const cells = [];
    for (let i = 0; i < n * n; i++) if (regions[i] === reg) cells.push(i);
    if (cells.length === 0) return false;
    const seen = new Set<number>([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const cell = stack.pop()!;
      const r = Math.floor(cell / n);
      const c = cell % n;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        const nb = rr * n + cc;
        if (regions[nb] === reg && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    if (seen.size !== cells.length) return false;
  }
  return true;
}

export interface Violation {
  /** Betroffene Katzen-Zellen, die rot markiert werden. */
  cells: number[];
  reason: 'row' | 'col' | 'region' | 'touch';
}

/** Regelverstöße unter den gesetzten Katzen (zwei in einer Einheit oder berührend). */
export function findViolations(n: number, regions: readonly number[], cats: readonly number[]): Violation[] {
  const out: Violation[] = [];
  const groups: Record<'row' | 'col' | 'region', Map<number, number[]>> = { row: new Map(), col: new Map(), region: new Map() };
  for (const cell of cats) {
    const keys: [keyof typeof groups, number][] = [['row', Math.floor(cell / n)], ['col', cell % n], ['region', regions[cell]]];
    for (const [kind, k] of keys) {
      const list = groups[kind].get(k) ?? [];
      list.push(cell);
      groups[kind].set(k, list);
    }
  }
  for (const kind of ['row', 'col', 'region'] as const) {
    for (const list of groups[kind].values()) if (list.length > 1) out.push({ cells: list, reason: kind });
  }
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      if (touching(n, cats[i], cats[j])) out.push({ cells: [cats[i], cats[j]], reason: 'touch' });
    }
  }
  return out;
}

/** Ist die Katzenmenge eine vollständige, gültige Lösung? */
export function isValidSolution(n: number, regions: readonly number[], cats: readonly number[]): boolean {
  return cats.length === n && new Set(cats).size === n && findViolations(n, regions, cats).length === 0;
}

/** solution[zeile] = spalte -> Zellenliste. */
export function solutionCells(solution: readonly number[]): number[] {
  return solution.map((c, r) => r * solution.length + c);
}
