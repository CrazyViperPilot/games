// Logik-Löser wie ein Mensch: findet Schritt für Schritt Schlussfolgerungen.
// Grundlage für den Hinweis-Knopf und für die Schwierigkeitsmessung im Generator.

import type { Board, Unit } from './board';

export const EMPTY = 0;
export const CROSS = 1;
export const CAT = 2;
export type Mark = typeof EMPTY | typeof CROSS | typeof CAT;

export type Technique = 'single' | 'confine' | 'attack' | 'group' | 'lookahead';

/** Schwierigkeitsstufe je Technik (Gruppe mit 3+ Einheiten zählt 5). */
export const LEVEL: Record<Technique, number> = { single: 1, confine: 2, attack: 3, group: 4, lookahead: 6 };

export interface Step {
  technique: Technique;
  level: number;
  /** 'cat': Katze in cells[0] setzen. 'cross': alle cells ausschließen. */
  action: 'cat' | 'cross';
  cells: number[];
  /** Einheiten, die die Begründung tragen (single: die Einheit; confine/group: die eingeschlossenen Einheiten). */
  sources: Unit[];
  /** confine/group: die Einheiten, in denen Felder wegfallen. attack: die Einheit, die leer würde. */
  targets: Unit[];
}

/** Kopie des Zustands, in der jede Katze ihre Zeile, Spalte, Region und Nachbarn ausschließt. */
export function normalize(board: Board, marks: ArrayLike<number>): Uint8Array {
  const state = Uint8Array.from(marks as ArrayLike<number>);
  for (let i = 0; i < state.length; i++) if (state[i] === CAT) crossAround(board, state, i);
  return state;
}

export function crossAround(board: Board, state: Uint8Array, cell: number): void {
  for (const u of board.unitsOfCell[cell]) for (const c of u.cells) if (state[c] === EMPTY) state[c] = CROSS;
  for (const c of board.neighbors[cell]) if (state[c] === EMPTY) state[c] = CROSS;
}

export function placeCat(board: Board, state: Uint8Array, cell: number): void {
  state[cell] = CAT;
  crossAround(board, state, cell);
}

export function applyStep(board: Board, state: Uint8Array, step: Step): void {
  if (step.action === 'cat') placeCat(board, state, step.cells[0]);
  else for (const c of step.cells) state[c] = CROSS;
}

/** Widerspruch: zwei Katzen in einer Einheit oder berührend, oder eine Einheit ohne Katze und ohne freies Feld. */
export function hasContradiction(board: Board, state: Uint8Array): boolean {
  for (const u of board.units) {
    let cats = 0;
    let free = 0;
    for (const c of u.cells) {
      if (state[c] === CAT) cats++;
      else if (state[c] === EMPTY) free++;
    }
    if (cats > 1 || (cats === 0 && free === 0)) return true;
  }
  for (let i = 0; i < state.length; i++) {
    if (state[i] === CAT && board.neighbors[i].some((nb) => state[nb] === CAT)) return true;
  }
  return false;
}

export function isSolved(board: Board, state: Uint8Array): boolean {
  let cats = 0;
  for (let i = 0; i < state.length; i++) if (state[i] === CAT) cats++;
  return cats === board.n && !hasContradiction(board, state);
}

interface UnitInfo {
  unit: Unit;
  satisfied: boolean;
  cands: number[];
}

function unitInfos(board: Board, state: Uint8Array): UnitInfo[] {
  return board.units.map((unit) => {
    const cands: number[] = [];
    let satisfied = false;
    for (const c of unit.cells) {
      if (state[c] === CAT) satisfied = true;
      else if (state[c] === EMPTY) cands.push(c);
    }
    return { unit, satisfied, cands };
  });
}

const KIND_SLOT = { row: 0, col: 1, region: 2 } as const;

function findSingle(infos: UnitInfo[]): Step | null {
  for (const info of infos) {
    if (!info.satisfied && info.cands.length === 1) {
      return { technique: 'single', level: LEVEL.single, action: 'cat', cells: [info.cands[0]], sources: [info.unit], targets: [] };
    }
  }
  return null;
}

function findConfine(board: Board, state: Uint8Array, infos: UnitInfo[]): Step | null {
  // Regionen zuerst: "Region liegt ganz in einer Zeile/Spalte" ist der häufigste Fall.
  const order = [...infos.slice(2 * board.n), ...infos.slice(0, 2 * board.n)];
  for (const info of order) {
    if (info.satisfied || info.cands.length < 2) continue;
    const kinds = info.unit.kind === 'region' ? (['row', 'col'] as const) : (['region'] as const);
    for (const kind of kinds) {
      const slot = KIND_SLOT[kind];
      const target = board.unitsOfCell[info.cands[0]][slot];
      if (!info.cands.every((c) => board.unitsOfCell[c][slot] === target)) continue;
      const inSource = new Set(info.unit.cells);
      const cells = target.cells.filter((c) => state[c] === EMPTY && !inSource.has(c));
      if (cells.length) return { technique: 'confine', level: LEVEL.confine, action: 'cross', cells, sources: [info.unit], targets: [target] };
    }
  }
  return null;
}

function findAttack(board: Board, state: Uint8Array, infos: UnitInfo[]): Step | null {
  const hit = new Uint8Array(state.length);
  for (let cell = 0; cell < state.length; cell++) {
    if (state[cell] !== EMPTY) continue;
    hit.fill(0);
    for (const u of board.unitsOfCell[cell]) for (const c of u.cells) hit[c] = 1;
    for (const c of board.neighbors[cell]) hit[c] = 1;
    const own = board.unitsOfCell[cell];
    for (const info of infos) {
      if (info.satisfied || own.includes(info.unit)) continue;
      if (info.cands.every((c) => hit[c])) {
        return { technique: 'attack', level: LEVEL.attack, action: 'cross', cells: [cell], sources: [], targets: [info.unit] };
      }
    }
  }
  return null;
}

const GROUP_PAIRS = [
  ['region', 'row'],
  ['region', 'col'],
  ['row', 'region'],
  ['col', 'region'],
  ['row', 'col'],
  ['col', 'row'],
] as const;

function findGroup(board: Board, state: Uint8Array, infos: UnitInfo[], maxK: number): Step | null {
  const n = board.n;
  const byKind = { row: infos.slice(0, n), col: infos.slice(n, 2 * n), region: infos.slice(2 * n) };
  for (let k = 2; k <= maxK; k++) {
    for (const [srcKind, tgtKind] of GROUP_PAIRS) {
      const open = byKind[srcKind].filter((i) => !i.satisfied);
      if (open.length <= k) continue;
      const slot = KIND_SLOT[tgtKind];
      const srcSlot = KIND_SLOT[srcKind];
      const pick: UnitInfo[] = [];
      let found: Step | null = null;
      const rec = (start: number): boolean => {
        if (pick.length === k) {
          const spanned = new Set<Unit>();
          for (const info of pick) for (const c of info.cands) spanned.add(board.unitsOfCell[c][slot]);
          if (spanned.size !== k) return false;
          const srcUnits = new Set(pick.map((p) => p.unit));
          const cells: number[] = [];
          for (const t of spanned) {
            for (const c of t.cells) if (state[c] === EMPTY && !srcUnits.has(board.unitsOfCell[c][srcSlot])) cells.push(c);
          }
          if (!cells.length) return false;
          const level = k === 2 ? LEVEL.group : LEVEL.group + 1;
          found = { technique: 'group', level, action: 'cross', cells, sources: pick.map((p) => p.unit), targets: [...spanned] };
          return true;
        }
        for (let i = start; i < open.length; i++) {
          pick.push(open[i]);
          if (rec(i + 1)) return true;
          pick.pop();
        }
        return false;
      };
      if (rec(0)) return found;
    }
  }
  return null;
}

/** Spielt einfache Schritte (bis maxLevel) durch; true, wenn ein Widerspruch entsteht. */
function leadsToContradiction(board: Board, state: Uint8Array, maxLevel: number): boolean {
  for (let guard = 0; guard < board.n * board.n * 2; guard++) {
    if (hasContradiction(board, state)) return true;
    const step = findStep(board, state, maxLevel);
    if (!step) return false;
    applyStep(board, state, step);
  }
  return false;
}

function findLookahead(board: Board, state: Uint8Array): Step | null {
  for (let cell = 0; cell < state.length; cell++) {
    if (state[cell] !== EMPTY) continue;
    const trial = state.slice();
    placeCat(board, trial, cell);
    if (leadsToContradiction(board, trial, LEVEL.attack)) {
      return { technique: 'lookahead', level: LEVEL.lookahead, action: 'cross', cells: [cell], sources: [], targets: [] };
    }
  }
  return null;
}

/**
 * Nächster logischer Schritt mit der leichtesten Technik bis maxLevel, sonst null.
 * Der Zustand muss normalisiert sein (siehe normalize).
 */
export function findStep(board: Board, state: Uint8Array, maxLevel = LEVEL.lookahead): Step | null {
  const infos = unitInfos(board, state);
  return (
    findSingle(infos) ??
    (maxLevel >= LEVEL.confine ? findConfine(board, state, infos) : null) ??
    (maxLevel >= LEVEL.attack ? findAttack(board, state, infos) : null) ??
    (maxLevel >= LEVEL.group ? findGroup(board, state, infos, maxLevel >= LEVEL.group + 1 ? 4 : 2) : null) ??
    (maxLevel >= LEVEL.lookahead ? findLookahead(board, state) : null)
  );
}

export interface LogicResult {
  solved: boolean;
  steps: Step[];
  /** Schwerste benötigte Technik (0, wenn nichts nötig war). */
  maxLevel: number;
  /** Summe der Stufen aller Schritte außer "single": wie viel Nachdenken das Rätsel kostet. */
  score: number;
  /** Anzahl Schritte je Technik. */
  counts: Record<Technique, number>;
  state: Uint8Array;
}

/** Löst nur mit Logik (ohne Raten). solved=false heißt: Logik reicht nicht, man müsste raten. */
export function solveLogically(board: Board, start?: ArrayLike<number>, maxLevel = LEVEL.lookahead): LogicResult {
  const state = start ? normalize(board, start) : new Uint8Array(board.n * board.n);
  const steps: Step[] = [];
  const counts: Record<Technique, number> = { single: 0, confine: 0, attack: 0, group: 0, lookahead: 0 };
  let score = 0;
  let top = 0;
  for (;;) {
    if (hasContradiction(board, state)) break;
    if (isSolved(board, state)) break;
    const step = findStep(board, state, maxLevel);
    if (!step) break;
    applyStep(board, state, step);
    steps.push(step);
    counts[step.technique]++;
    if (step.technique !== 'single') score += step.level;
    top = Math.max(top, step.level);
  }
  return { solved: isSolved(board, state), steps, maxLevel: top, score, counts, state };
}
