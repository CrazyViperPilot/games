// Spielzustand eines Rätsels: Markierungen, Rückgängig, Regelverstöße, Sieg, Zeit.
// Ohne DOM, damit es sich testen lässt.

import { findViolations, isValidSolution, type Puzzle } from '../core/board';
import { CAT, CROSS, EMPTY } from '../core/logic';

export interface Change {
  cells: number[];
  before: number[];
}

export interface SavedGame {
  marks: number[];
  undo: Change[];
  elapsedMs: number;
  hints: number;
  solved: boolean;
}

const MAX_UNDO = 300;

export class Game {
  readonly n: number;
  marks: Uint8Array;
  undoStack: Change[] = [];
  elapsedMs = 0;
  hints = 0;
  solved = false;
  private pending: Change | null = null;

  constructor(readonly puzzle: Puzzle, saved?: SavedGame) {
    this.n = puzzle.n;
    this.marks = new Uint8Array(this.n * this.n);
    if (saved && saved.marks.length === this.marks.length) {
      this.marks.set(saved.marks);
      this.undoStack = saved.undo ?? [];
      this.elapsedMs = saved.elapsedMs ?? 0;
      this.hints = saved.hints ?? 0;
      this.solved = saved.solved ?? false;
    }
  }

  /** Beginnt eine Geste (Tippen oder Wischen); alle Änderungen bis endGesture sind ein Rückgängig-Schritt. */
  beginGesture(): void {
    this.pending = { cells: [], before: [] };
  }

  endGesture(): void {
    const p = this.pending;
    this.pending = null;
    if (p && p.cells.length) {
      this.undoStack.push(p);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    }
    this.checkSolved();
  }

  private set(cell: number, value: number): boolean {
    if (this.solved || this.marks[cell] === value) return false;
    const own = !this.pending;
    if (own) this.beginGesture();
    const p = this.pending!;
    if (!p.cells.includes(cell)) {
      p.cells.push(cell);
      p.before.push(this.marks[cell]);
    }
    this.marks[cell] = value;
    if (own) this.endGesture();
    return true;
  }

  /** Tippen: leer → X → Katze → leer. */
  tap(cell: number): void {
    const next = this.marks[cell] === EMPTY ? CROSS : this.marks[cell] === CROSS ? CAT : EMPTY;
    this.set(cell, next);
  }

  /** Wischen: leere Felder werden X (erase=true: X werden wieder leer). Katzen bleiben. */
  swipe(cell: number, erase: boolean): boolean {
    if (erase) return this.marks[cell] === CROSS ? this.set(cell, EMPTY) : false;
    return this.marks[cell] === EMPTY ? this.set(cell, CROSS) : false;
  }

  undo(): boolean {
    if (this.solved) return false;
    const last = this.undoStack.pop();
    if (!last) return false;
    last.cells.forEach((c, i) => (this.marks[c] = last.before[i]));
    return true;
  }

  /** Neustart: alles leeren (lässt sich rückgängig machen). */
  restart(): void {
    this.beginGesture();
    for (let c = 0; c < this.marks.length; c++) if (this.marks[c] !== EMPTY) this.set(c, EMPTY);
    this.endGesture();
  }

  cats(): number[] {
    const out: number[] = [];
    this.marks.forEach((m, i) => m === CAT && out.push(i));
    return out;
  }

  /**
   * Felder, die rot markiert werden: Katzen, die gegen eine Regel verstoßen, und alle Felder einer
   * Zeile/Spalte/Region, die komplett mit X gefüllt ist (dort passt keine Katze mehr).
   */
  errors(): Set<number> {
    const bad = new Set<number>();
    for (const v of findViolations(this.n, this.puzzle.regions, this.cats())) v.cells.forEach((c) => bad.add(c));
    const n = this.n;
    const groups: number[][] = [];
    for (let i = 0; i < n; i++) {
      groups.push([...Array(n).keys()].map((c) => i * n + c));
      groups.push([...Array(n).keys()].map((r) => r * n + i));
      groups.push([...Array(n * n).keys()].filter((c) => this.puzzle.regions[c] === i));
    }
    for (const g of groups) if (g.every((c) => this.marks[c] === CROSS)) g.forEach((c) => bad.add(c));
    return bad;
  }

  private checkSolved(): void {
    const cats = this.cats();
    if (!this.solved && cats.length === this.n && isValidSolution(this.n, this.puzzle.regions, cats)) this.solved = true;
  }

  save(): SavedGame {
    return { marks: [...this.marks], undo: this.undoStack.slice(-100), elapsedMs: Math.round(this.elapsedMs), hints: this.hints, solved: this.solved };
  }
}
