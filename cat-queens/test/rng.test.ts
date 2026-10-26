import { describe, expect, it } from 'vitest';
import { createRng, hashString } from '../src/core/rng';

describe('rng', () => {
  it('liefert bei gleichem Seed dieselbe Folge', () => {
    const a = createRng('daily-2026-10-26');
    const b = createRng('daily-2026-10-26');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('liefert bei anderem Seed eine andere Folge', () => {
    const a = createRng('a');
    const b = createRng('b');
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it('bleibt in den Grenzen und ist grob gleichverteilt', () => {
    const rng = createRng(42);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const v = rng.int(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      buckets[v]++;
    }
    for (const b of buckets) expect(b).toBeGreaterThan(1700);
  });

  it('mischt ohne Elemente zu verlieren', () => {
    const arr = createRng(1).shuffle([...Array(20).keys()]);
    expect([...arr].sort((x, y) => x - y)).toEqual([...Array(20).keys()]);
  });

  it('hasht stabil (Tagesrätsel muss auf allen Geräten gleich sein)', () => {
    expect(hashString('daily-2026-10-26')).toBe(hashString('daily-2026-10-26'));
    expect(hashString('')).toBe(0x811c9dc5);
  });
});
