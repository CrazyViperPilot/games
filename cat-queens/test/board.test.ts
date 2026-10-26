import { describe, expect, it } from 'vitest';
import { buildBoard, findViolations, isValidSolution, regionsConnected, touching } from '../src/core/board';
import { parseRegions } from './helpers';

describe('board', () => {
  const { n, regions } = parseRegions(['aabbb', 'aabcc', 'ddbcc', 'ddeec', 'deeec']);

  it('baut Zeilen, Spalten und Regionen', () => {
    const b = buildBoard(n, regions);
    expect(b.units).toHaveLength(15);
    expect(b.rows[2].cells).toEqual([10, 11, 12, 13, 14]);
    expect(b.cols[1].cells).toEqual([1, 6, 11, 16, 21]);
    expect(b.regionUnits[0].cells).toEqual([0, 1, 5, 6]);
    expect(b.unitsOfCell[12].map((u) => u.id)).toEqual([2, 7, 11]);
  });

  it('kennt Nachbarn inklusive Diagonalen', () => {
    const b = buildBoard(n, regions);
    expect(b.neighbors[0].sort((x, y) => x - y)).toEqual([1, 5, 6]);
    expect(b.neighbors[12]).toHaveLength(8);
    expect(touching(5, 0, 6)).toBe(true);
    expect(touching(5, 0, 2)).toBe(false);
    expect(touching(5, 4, 5)).toBe(false); // Zeilenumbruch ist keine Nachbarschaft
  });

  it('prüft den Zusammenhang der Regionen', () => {
    expect(regionsConnected(n, regions)).toBe(true);
    // Region a in zwei Teilen
    expect(regionsConnected(3, [0, 1, 0, 1, 1, 1, 2, 2, 2])).toBe(false);
    // Region fehlt
    expect(regionsConnected(3, [0, 0, 0, 1, 1, 1, 1, 1, 1])).toBe(false);
    // diagonal reicht nicht
    expect(regionsConnected(3, [0, 1, 1, 1, 0, 1, 2, 2, 2])).toBe(false);
  });

  it('findet Regelverstöße', () => {
    expect(findViolations(n, regions, [0, 2])).toEqual([{ cells: [0, 2], reason: 'row' }]);
    expect(findViolations(n, regions, [0, 10])).toEqual([{ cells: [0, 10], reason: 'col' }]);
    expect(findViolations(n, regions, [0, 6]).map((v) => v.reason).sort()).toEqual(['region', 'touch']);
    expect(findViolations(n, regions, [1, 7]).map((v) => v.reason)).toEqual(['touch']);
    expect(findViolations(n, regions, [0, 12])).toEqual([]);
  });

  it('erkennt gültige Lösungen', () => {
    const fx = parseRegions(['ddaac', 'dbcac', 'deccc', 'decee', 'eeeee']);
    const cats = [3, 1, 4, 0, 2].map((c, r) => r * 5 + c);
    expect(isValidSolution(fx.n, fx.regions, cats)).toBe(true);
    expect(isValidSolution(fx.n, fx.regions, cats.slice(0, 4))).toBe(false);
    expect(isValidSolution(fx.n, fx.regions, [...cats.slice(0, 4), 21])).toBe(false);
  });
});
