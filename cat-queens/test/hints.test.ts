import { describe, expect, it } from 'vitest';
import { generatePuzzle, type Difficulty } from '../src/core/generator';
import { describeHint, getHint } from '../src/core/hints';
import { CAT, CROSS, EMPTY } from '../src/core/logic';
import { solutionSet } from './helpers';

describe('Hinweise', () => {
  const easy = generatePuzzle({ seed: 'hint', difficulty: 'easy' });

  it('zeigt zuerst eine falsch gesetzte Katze', () => {
    const sol = solutionSet(easy);
    const wrong = [...Array(easy.n * easy.n).keys()].find((c) => !sol.has(c))!;
    const marks = new Uint8Array(easy.n * easy.n);
    marks[wrong] = CAT;
    expect(getHint(easy, marks)).toEqual({ kind: 'wrong-cat', cell: wrong });
  });

  it('zeigt ein X auf einem Katzenfeld als Fehler', () => {
    const cell = easy.solution[0];
    const marks = new Uint8Array(easy.n * easy.n);
    marks[cell] = CROSS;
    expect(getHint(easy, marks)).toEqual({ kind: 'wrong-cross', cell });
  });

  it('meldet gelöst, wenn alle Katzen richtig stehen', () => {
    const marks = new Uint8Array(easy.n * easy.n);
    for (const c of solutionSet(easy)) marks[c] = CAT;
    expect(getHint(easy, marks).kind).toBe('solved');
  });

  it.each(['easy', 'medium', 'hard'] as Difficulty[])('wer nur den Hinweisen folgt, löst %s-Rätsel – jeder Hinweis ist korrekt und neu', (difficulty) => {
    for (let i = 0; i < 6; i++) {
      const p = generatePuzzle({ seed: `hint-follow-${i}`, difficulty });
      const sol = solutionSet(p);
      const marks = new Uint8Array(p.n * p.n);
      let guard = 0;
      for (;;) {
        const hint = getHint(p, marks);
        if (hint.kind === 'solved') break;
        expect(hint.kind).toBe('step');
        if (hint.kind !== 'step') break;
        expect(describeHint(hint).length).toBeGreaterThan(10);
        if (hint.step.action === 'cat') {
          expect(sol.has(hint.cell)).toBe(true);
          expect(marks[hint.cell]).toBe(EMPTY);
          marks[hint.cell] = CAT;
        } else {
          for (const c of hint.step.cells) {
            expect(sol.has(c)).toBe(false);
            expect(marks[c]).toBe(EMPTY);
            marks[c] = CROSS;
          }
        }
        expect(++guard).toBeLessThan(200);
      }
    }
  });

  it('nutzt die Markierungen des Spielers (Hinweis bezieht sich auf freie Felder)', () => {
    const p = generatePuzzle({ seed: 'hint-partial', difficulty: 'medium' });
    const sol = solutionSet(p);
    const marks = new Uint8Array(p.n * p.n);
    // Spieler hat zwei richtige Katzen gesetzt, aber nichts gestrichen.
    [...sol].slice(0, 2).forEach((c) => (marks[c] = CAT));
    const hint = getHint(p, marks);
    expect(hint.kind).toBe('step');
    if (hint.kind === 'step') {
      for (const c of hint.step.cells) expect(marks[c]).toBe(EMPTY);
      // Felder, die schon durch eine gesetzte Katze wegfallen, werden nicht als Hinweis verkauft.
      if (hint.step.action === 'cross') for (const c of hint.step.cells) expect(sol.has(c)).toBe(false);
    }
  });

  it('erklärt Schritte auf Deutsch mit Regionsnamen', () => {
    const names = ['Rot', 'Blau', 'Grün', 'Gelb', 'Lila', 'Orange', 'Türkis', 'Rosa', 'Braun', 'Grau'];
    const marks = new Uint8Array(easy.n * easy.n);
    const hint = getHint(easy, marks);
    const text = describeHint(hint, (i) => names[i]);
    expect(text).toMatch(/Zeile|Spalte|Region|Katze|X/);
  });
});
