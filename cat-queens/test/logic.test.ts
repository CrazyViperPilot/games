import { describe, expect, it } from 'vitest';
import { buildBoard } from '../src/core/board';
import { generatePuzzle, growRegions, makeUnique, randomSolution } from '../src/core/generator';
import { CAT, CROSS, EMPTY, LEVEL, findStep, hasContradiction, normalize, placeCat, solveLogically, type Technique } from '../src/core/logic';
import { createRng } from '../src/core/rng';
import { parseRegions } from './helpers';

/** Viele eindeutige Rätsel ohne Schwierigkeitsfilter (n=5..10). */
function corpus(count: number) {
  const rng = createRng('logic-corpus');
  const out: { n: number; regions: number[]; solution: number[] }[] = [];
  while (out.length < count) {
    const n = 5 + (out.length % 6);
    const solution = randomSolution(n, rng);
    const regions = makeUnique(n, growRegions(n, solution, rng), solution, rng);
    if (regions) out.push({ n, regions, solution });
  }
  return out;
}

describe('logic', () => {
  const puzzles = corpus(90);

  it('jeder Schritt ist korrekt: Katzen nur auf Lösungsfelder, X nie auf Lösungsfelder', () => {
    const used: Record<Technique, number> = { single: 0, confine: 0, attack: 0, group: 0, lookahead: 0 };
    for (const p of puzzles) {
      const sol = new Set(p.solution.map((c, r) => r * p.n + c));
      const res = solveLogically(buildBoard(p.n, p.regions));
      for (const step of res.steps) {
        used[step.technique]++;
        if (step.action === 'cat') expect(sol.has(step.cells[0]), `${step.technique} setzt falsche Katze`).toBe(true);
        else for (const c of step.cells) expect(sol.has(c), `${step.technique} streicht Lösungsfeld`).toBe(false);
      }
      expect(res.solved).toBe(true);
      for (const c of sol) expect(res.state[c]).toBe(CAT);
    }
    // Jede Technik kommt im Korpus vor (sonst wäre sie ungetestet).
    for (const t of Object.keys(used) as Technique[]) expect(used[t], t).toBeGreaterThan(0);
  });

  it('normalize streicht Zeile, Spalte, Region und Nachbarn einer Katze', () => {
    const { n, regions } = parseRegions(['aabbb', 'aabcc', 'ddbcc', 'ddeec', 'deeec']);
    const b = buildBoard(n, regions);
    const marks = new Uint8Array(25);
    marks[12] = CAT; // Mitte, Region b
    const s = normalize(b, marks);
    for (const c of [10, 11, 13, 14, 2, 7, 17, 22, 6, 8, 16, 18, 3, 4]) expect(s[c], `Zelle ${c}`).toBe(CROSS);
    expect(s[0]).toBe(EMPTY);
    expect(s[24]).toBe(EMPTY);
  });

  it('erkennt Widersprüche', () => {
    const { n, regions } = parseRegions(['aabbb', 'aabcc', 'ddbcc', 'ddeec', 'deeec']);
    const b = buildBoard(n, regions);
    const s = new Uint8Array(25);
    expect(hasContradiction(b, s)).toBe(false);
    s[0] = CAT;
    s[6] = CAT; // berührt und gleiche Region
    expect(hasContradiction(b, s)).toBe(true);
    const t = new Uint8Array(25);
    for (const c of [0, 1, 5, 6]) t[c] = CROSS; // Region a ohne freies Feld
    expect(hasContradiction(b, t)).toBe(true);
  });

  it('single: letztes freies Feld einer Region wird Katze', () => {
    const { n, regions } = parseRegions(['aabbb', 'aabcc', 'ddbcc', 'ddeec', 'deeec']);
    const b = buildBoard(n, regions);
    const s = new Uint8Array(25);
    s[0] = CROSS;
    s[1] = CROSS;
    s[5] = CROSS;
    const step = findStep(b, s)!;
    expect(step.technique).toBe('single');
    expect(step.action).toBe('cat');
    expect(step.cells).toEqual([6]);
  });

  it('confine: Region ganz in einer Zeile streicht den Rest der Zeile', () => {
    // Region a liegt nur in Zeile 0 (Felder 0,1)
    const { n, regions } = parseRegions(['aabbb', 'cccbb', 'cddde', 'cddee', 'cdeee']);
    const b = buildBoard(n, regions);
    const step = findStep(b, new Uint8Array(25), LEVEL.confine)!;
    expect(step.technique).toBe('confine');
    expect(step.sources[0].kind).toBe('region');
    expect(step.targets[0]).toMatchObject({ kind: 'row', index: 0 });
    expect(step.cells).toEqual([2, 3, 4]);
  });

  it('lässt sich mit maxLevel begrenzen', () => {
    for (const p of puzzles.slice(0, 20)) {
      const res = solveLogically(buildBoard(p.n, p.regions), undefined, LEVEL.confine);
      for (const s of res.steps) expect(s.level).toBeLessThanOrEqual(LEVEL.confine);
    }
  });

  it('placeCat setzt Katze und streicht', () => {
    const { n, regions } = parseRegions(['aabbb', 'aabcc', 'ddbcc', 'ddeec', 'deeec']);
    const b = buildBoard(n, regions);
    const s = new Uint8Array(25);
    placeCat(b, s, 0);
    expect(s[0]).toBe(CAT);
    expect(s[1]).toBe(CROSS);
    expect(s[6]).toBe(CROSS);
  });

  it('löst auch erzeugte schwere Rätsel vollständig', () => {
    const p = generatePuzzle({ seed: 'logic-hard', difficulty: 'hard' });
    expect(solveLogically(buildBoard(p.n, p.regions)).solved).toBe(true);
  });
});
