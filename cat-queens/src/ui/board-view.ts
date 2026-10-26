// Spielfeld im DOM: Regionen mit Farben, Mustern und dicken Grenzen; Eingabe per Tippen und Wischen.

import type { Puzzle } from '../core/board';
import { CAT, CROSS } from '../core/logic';
import { CAT_SVG, CROSS_SVG } from './art';

export interface Highlight {
  /** Felder, um die es geht (pulsierender Rahmen). */
  cells: number[];
  /** Felder der begründenden Zeilen/Spalten/Regionen (leicht hervorgehoben). */
  area: number[];
  /** Fehlerhinweis statt Logikschritt. */
  error?: boolean;
}

export interface BoardInput {
  /** Finger/Maus auf Feld gedrückt. */
  down(cell: number): void;
  /** Weitergewischt; cells = alle neu überstrichenen Felder in Reihenfolge. */
  move(cells: number[]): void;
  /** Losgelassen oder abgebrochen. */
  up(): void;
}

export class BoardView {
  private n = 0;
  private cells: HTMLDivElement[] = [];
  private last = -1;
  private active = false;

  constructor(private el: HTMLElement, private input: BoardInput) {
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', () => this.onUp());
    el.addEventListener('pointercancel', () => this.onUp());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setPuzzle(p: Puzzle): void {
    this.n = p.n;
    this.el.style.setProperty('--n', String(p.n));
    this.el.innerHTML = '';
    this.cells = [];
    const n = p.n;
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const reg = p.regions[i];
      const d = document.createElement('div');
      const cls = ['cell', `r${reg}`];
      if (r === 0 || p.regions[i - n] !== reg) cls.push('bt');
      if (r === n - 1 || p.regions[i + n] !== reg) cls.push('bb');
      if (c === 0 || p.regions[i - 1] !== reg) cls.push('bl');
      if (c === n - 1 || p.regions[i + 1] !== reg) cls.push('br');
      d.className = cls.join(' ');
      d.setAttribute('role', 'gridcell');
      this.el.appendChild(d);
      this.cells.push(d);
    }
  }

  render(marks: ArrayLike<number>, errors: Set<number>, hl: Highlight | null, won: boolean): void {
    const hlCells = new Set(hl?.cells ?? []);
    const hlArea = new Set(hl?.area ?? []);
    this.el.classList.toggle('won', won);
    this.el.classList.toggle('hinting', !!hl && hl.area.length > 0);
    let catIndex = 0;
    this.cells.forEach((d, i) => {
      const m = marks[i];
      const want = m === CAT ? 'cat' : m === CROSS ? 'x' : '';
      if (d.dataset.mark !== want) {
        d.dataset.mark = want;
        d.innerHTML = m === CAT ? CAT_SVG : m === CROSS ? CROSS_SVG : '';
      }
      if (m === CAT) d.style.setProperty('--i', String(catIndex++));
      d.classList.toggle('err', errors.has(i));
      d.classList.toggle('hl', hlCells.has(i));
      d.classList.toggle('hl-err', !!hl?.error && hlCells.has(i));
      d.classList.toggle('area', hlArea.has(i));
    });
  }

  private cellAt(e: PointerEvent): number {
    const rect = this.el.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * this.n);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * this.n);
    if (r < 0 || c < 0 || r >= this.n || c >= this.n) return -1;
    return r * this.n + c;
  }

  private onDown(e: PointerEvent): void {
    if (e.button > 0) return;
    const cell = this.cellAt(e);
    if (cell < 0) return;
    e.preventDefault();
    this.el.setPointerCapture(e.pointerId);
    this.active = true;
    this.last = cell;
    this.input.down(cell);
  }

  private onMove(e: PointerEvent): void {
    if (!this.active) return;
    const cell = this.cellAt(e);
    if (cell < 0 || cell === this.last) return;
    this.input.move(this.line(this.last, cell));
    this.last = cell;
  }

  private onUp(): void {
    if (!this.active) return;
    this.active = false;
    this.input.up();
  }

  /** Felder zwischen a (ausschließlich) und b (einschließlich), damit schnelles Wischen nichts überspringt. */
  private line(a: number, b: number): number[] {
    const n = this.n;
    const [r0, c0, r1, c1] = [Math.floor(a / n), a % n, Math.floor(b / n), b % n];
    const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
    const out: number[] = [];
    for (let s = 1; s <= steps; s++) {
      const cell = Math.round(r0 + ((r1 - r0) * s) / steps) * n + Math.round(c0 + ((c1 - c0) * s) / steps);
      if (!out.includes(cell)) out.push(cell);
    }
    return out;
  }
}
