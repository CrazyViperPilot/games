// Hinweis-Knopf: erst Fehler zeigen, sonst den nächsten logisch ableitbaren Schritt.

import { buildBoard, type Puzzle, type Unit } from './board';
import { CAT, CROSS, findStep, normalize, type Step } from './logic';

export type Hint =
  /** Eine gesetzte Katze steht falsch. */
  | { kind: 'wrong-cat'; cell: number }
  /** Ein X liegt auf einem Feld, auf das eine Katze gehört. */
  | { kind: 'wrong-cross'; cell: number }
  /** Logischer Schritt; cell ist das hervorzuhebende Feld (bei 'cross' das erste von step.cells). */
  | { kind: 'step'; cell: number; step: Step }
  /** Logik findet nichts (sollte bei erzeugten Rätseln nicht vorkommen): Lösungsfeld zeigen. */
  | { kind: 'reveal'; cell: number }
  | { kind: 'solved' };

/**
 * marks: je Zelle 0 (leer), 1 (X), 2 (Katze) – so wie der Spieler sie gesetzt hat.
 * Fehler gehen vor, damit der Hinweis nie auf falschen Annahmen aufbaut.
 */
export function getHint(puzzle: Puzzle, marks: ArrayLike<number>): Hint {
  const { n, solution } = puzzle;
  const isSol = (cell: number) => solution[Math.floor(cell / n)] === cell % n;
  let correctCats = 0;
  for (let cell = 0; cell < n * n; cell++) {
    if (marks[cell] === CAT && !isSol(cell)) return { kind: 'wrong-cat', cell };
  }
  for (let cell = 0; cell < n * n; cell++) {
    if (marks[cell] === CROSS && isSol(cell)) return { kind: 'wrong-cross', cell };
    if (marks[cell] === CAT) correctCats++;
  }
  if (correctCats === n) return { kind: 'solved' };
  const board = buildBoard(n, puzzle.regions);
  const step = findStep(board, normalize(board, marks));
  if (step) return { kind: 'step', cell: step.cells[0], step };
  const cell = solution.map((c, r) => r * n + c).find((c) => marks[c] !== CAT)!;
  return { kind: 'reveal', cell };
}

/** Name einer Einheit für Erklärtexte, z. B. "Zeile 3" oder "Region Blau". */
export function unitName(unit: Unit, regionName: (index: number) => string): string {
  if (unit.kind === 'row') return `Zeile ${unit.index + 1}`;
  if (unit.kind === 'col') return `Spalte ${unit.index + 1}`;
  return `Region ${regionName(unit.index)}`;
}

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`);

/** Deutscher Erklärtext zu einem Hinweis. */
export function describeHint(hint: Hint, regionName: (index: number) => string = (i) => String(i + 1)): string {
  switch (hint.kind) {
    case 'wrong-cat':
      return 'Diese Katze steht an der falschen Stelle.';
    case 'wrong-cross':
      return 'Dieses X ist falsch: Hier gehört eine Katze hin.';
    case 'reveal':
      return 'Hier gehört eine Katze hin.';
    case 'solved':
      return 'Alles gelöst!';
    case 'step': {
      const s = hint.step;
      const name = (u: Unit) => unitName(u, regionName);
      switch (s.technique) {
        case 'single':
          return `In ${name(s.sources[0])} ist nur noch ein Feld frei, dort muss die Katze hin.`;
        case 'confine':
          return `Alle freien Felder von ${name(s.sources[0])} liegen in ${name(s.targets[0])}. Die Katze dort gehört also zu ${name(s.sources[0])}, die übrigen Felder von ${name(s.targets[0])} fallen weg.`;
        case 'attack':
          return `Eine Katze auf diesem Feld würde ${name(s.targets[0])} jedes freie Feld nehmen. Hier kann also keine Katze sitzen.`;
        case 'group':
          return `${list(s.sources.map(name))} liegen ganz in ${list(s.targets.map(name))}. Diese ${s.sources.length} Katzen füllen sie aus, alle anderen Felder dort fallen weg.`;
        case 'lookahead':
          return 'Probier es gedanklich: Eine Katze hier führt nach wenigen Schritten zu einem Widerspruch. Also kommt hier ein X hin.';
      }
    }
  }
}
