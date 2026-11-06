// v5.38: Straßen nebeneinander bilden ein mehrspuriges Band: Spuren je Richtung = Breite, Kapazität × Spuren (höchstens maxLanes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { laneGrid } from '../js/game/roads.js';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { canZone, roadAt } from '../js/game/city/cells.js';
import { transportOf } from '../js/game/transport.js';

/** Raster aus Textzeilen: '#' = Straße. */
function grid(lines) {
  const rows = lines.length;
  const cols = lines[0].length;
  const set = new Set();
  lines.forEach((l, r) => [...l].forEach((ch, q) => ch === '#' && set.add(r * cols + q)));
  return { cols, rows, g: laneGrid(cols, rows, (i) => set.has(i)) };
}

test('laneGrid: Bänder, Breite, Lage, Kreuzung', () => {
  const { cols, g } = grid([
    '..........',
    '##########',
    '##########',
    '....#.....',
    '....#.....',
    '###########'.slice(0, 10),
    '..........',
  ]);
  const at = (q, r) => r * cols + q;
  assert.equal(g.dir[at(1, 1)], 1);
  assert.equal(g.width[at(1, 1)], 2);
  assert.deepEqual([g.idx[at(1, 1)], g.idx[at(1, 2)]], [0, 1]);
  assert.equal(g.lanes[at(1, 1)], 2, 'zwei Spuren je Richtung');
  assert.equal(g.dir[at(4, 1)], 0, 'Einmündung der Querstraße: kein reines Band');
  assert.ok(g.lanes[at(4, 1)] >= 2, 'Kreuzung bremst das Band nicht');
  assert.equal(g.dir[at(4, 3)], 2, 'Querstraße senkrecht');
  assert.equal(g.width[at(4, 3)], 1);
  assert.equal(g.lanes[at(4, 3)], 1);
  assert.equal(g.lanes[at(1, 5)], 1, 'einspurig');
});

test('laneGrid: drei nebeneinander = drei Spuren, höchstens maxLanes', () => {
  const { cols, g } = grid(['########', '########', '########', '........']);
  assert.equal(g.width[cols + 2], 3);
  assert.equal(g.lanes[cols + 2], 3);
  const big = laneGrid(12, 6, () => true, 4);
  assert.equal(big.lanes[2 * 12 + 3], 4, 'gedeckelt');
});

test('Transport: Kapazität einer Straße × Spuren je Richtung', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const m = g.mainFob(0);
  g.teams[0].res.money = 1e6;
  m.store.bm = 30000;
  // freie Fläche 10 × 4 nahe der Hauptstadt
  let a = null;
  for (let r = 2; r < c.rows - 6 && !a; r++) for (let q = 2; q < c.cols - 12 && !a; q++) {
    let ok = true;
    for (let y = r - 1; ok && y <= r + 3; y++) for (let x = q - 1; ok && x <= q + 10; x++) { const j = y * c.cols + x; ok = canZone(g, c, j) && !c.kind[j] && !roadAt(c, j) && !c.deposit[j]; }
    if (ok && Math.hypot(q * c.cell - m.x, r * c.cell - m.y) < 2500) a = { q, r };
  }
  assert.ok(a, 'Platz');
  assert.ok(g.issue(0, { type: 'city', kind: 'road', c0: a.q, r0: a.r, c1: a.q + 9, r1: a.r + 1 }).ok);
  const tr = transportOf(g, c);
  const i = a.r * c.cols + a.q + 4;
  assert.equal(tr.lanes[i], 2);
  assert.equal(tr.cap[i], CITY.transport.cap * 2);
});
