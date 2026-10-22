import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../js/game/grid.js';
import { findPath, lineOfSight } from '../js/game/pathfinding.js';

const TILE = 32;
const COLS = 20;
const ROWS = 20;
const cen = (c) => c * TILE + TILE / 2;

function newGrid() {
  return new Grid(COLS, ROWS, TILE);
}

// Vertikale Wand in Spalte `col` von Zeile `from` bis `to` (inklusive)
function wall(grid, col, from, to) {
  for (let r = from; r <= to; r++) grid.terrain[grid.idx(col, r)] = 1;
}

test('Weg führt um ein Hindernis herum', () => {
  const g = newGrid();
  wall(g, 10, 0, 15); // Lücke bei Zeile 16..19
  const sx = cen(2), sy = cen(2), tx = cen(18), ty = cen(2);
  assert.equal(lineOfSight(g, sx, sy, tx, ty, 0), false);

  const path = findPath(g, sx, sy, tx, ty, 0);
  assert.ok(path.length > 0);
  assert.deepStrictEqual(path[path.length - 1], { x: tx, y: ty });

  // Jedes Segment ist frei; der Weg muss die Lücke (Zeilen 16..19) nutzen
  let prev = { x: sx, y: sy };
  for (const p of path) {
    assert.ok(lineOfSight(g, prev.x, prev.y, p.x, p.y, 0), 'Segment kreuzt Hindernis');
    prev = p;
  }
  assert.ok(path.some((p) => Math.floor(p.y / TILE) >= 16), 'Weg nutzt die Lücke nicht');
});

test('Mauer blockiert vollständig: Weg endet an der erreichbaren Zelle nahe dem Ziel', () => {
  const g = newGrid();
  wall(g, 10, 0, ROWS - 1);
  const path = findPath(g, cen(2), cen(2), cen(18), cen(2), 0);
  assert.ok(path.length > 0);
  const last = path[path.length - 1];
  assert.ok(last.x < 10 * TILE, 'Ende liegt hinter der Mauer');
  assert.ok(!(last.x === cen(18) && last.y === cen(2)), 'exaktes Ziel darf nicht erreicht sein');
  for (const p of path) assert.ok(Math.floor(p.x / TILE) < 10);
});

test('Tor ist nur für das eigene Team passierbar', () => {
  const g = newGrid();
  // Wand in Spalte 10 mit Tor (Gebäude-ID 1, Team 0) in Zeile 5..7
  wall(g, 10, 0, ROWS - 1);
  for (let r = 5; r <= 7; r++) {
    g.terrain[g.idx(10, r)] = 0;
    const i = g.idx(10, r);
    g.struct[i] = 1;
    g.gateTeam[i] = 0;
  }
  assert.equal(g.passable(10, 6, 0), true, 'eigenes Team passiert das Tor');
  assert.equal(g.passable(10, 6, 1), false, 'fremdes Team darf das Tor nicht passieren');

  const own = findPath(g, cen(2), cen(2), cen(18), cen(2), 0);
  assert.deepStrictEqual(own[own.length - 1], { x: cen(18), y: cen(2) });

  const enemy = findPath(g, cen(2), cen(2), cen(18), cen(2), 1);
  const last = enemy[enemy.length - 1];
  assert.ok(last.x < 10 * TILE, 'Gegner kommt nicht durchs Tor');
});

test('Start- gleich Zielzelle ergibt leeren Weg', () => {
  const g = newGrid();
  assert.deepStrictEqual(findPath(g, cen(3), cen(3), cen(3) + 5, cen(3), 0), []);
});

test('Sichtlinie scheitert, wenn sie genau durch eine Ecke zweier Hindernisse läuft', () => {
  const g = newGrid();
  // Zellen (5,4) und (4,5) blockiert; Diagonale von (4,4) nach (5,5) läuft durch deren gemeinsame Ecke
  g.terrain[g.idx(5, 4)] = 1;
  g.terrain[g.idx(4, 5)] = 1;
  assert.equal(lineOfSight(g, cen(4), cen(4), cen(5), cen(5), 0), false);
  assert.equal(lineOfSight(g, cen(4), cen(4), cen(4) + 3, cen(4), 0), true);
});
