import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../js/data/levels/index.js';
import { parseLevel } from '../js/game/level.js';
import { TILE_IDS } from '../js/data/tiles.js';
import { explore, reachable, cellOf } from './helpers/reach.js';

// ---- Hilfen für handgebaute Testkarten ----
function rect(fill, c0, c1, r0, r1, ch) {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fill[`${c},${r}`] = ch;
  return fill;
}
function grid(cols, rows, fill) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) s += fill[`${c},${r}`] ?? '.';
    out.push(s);
  }
  return out;
}
function world(cols, rows, fill) {
  return parseLevel({ id: 'test', theme: 'overworld', rows: grid(cols, rows, fill) });
}
// Boden in Zeile 7 (Standzeile 6). Pit unter Zeile 7 ist Luft = Grube.
function flat(cols = 30) {
  return rect({}, 0, cols - 1, 7, 7, 'S');
}

// ---- Selbsttests von reachable/explore ----

test('laufen: ebene Strecke, Ziel am Ende erreichbar, Standkachel im Set', () => {
  const fill = flat();
  fill['1,6'] = 'P';
  fill['27,6'] = 'F';
  const map = world(30, 10, fill);
  assert.ok(explore(map, { pick: -1 }).touches(27, 6));
  assert.ok(reachable(map, { pick: -1 }).has(6 * map.cols + 27));
});

test('springen: Lücke 3 breit überspringbar, 7 breit nicht', () => {
  for (const [gap, expected] of [[3, true], [7, false]]) {
    const fill = flat();
    rect(fill, 10, 9 + gap, 7, 7, '.');
    fill['9,6'] = 'P';
    fill['25,6'] = 'F';
    const map = world(30, 10, fill);
    assert.equal(explore(map, { pick: -1 }).touches(25, 6), expected, `Lücke ${gap}`);
  }
});

test('springen: Wand 3 hoch überspringbar', () => {
  const fill = flat();
  rect(fill, 15, 15, 4, 6, 'S');
  fill['5,6'] = 'P';
  fill['25,6'] = 'F';
  assert.ok(explore(world(30, 10, fill), { pick: -1 }).touches(25, 6));
});

test('Wand 6 hoch: ohne Graben nicht, mit Hacke (pick 0) erreichbar', () => {
  const fill = flat();
  rect(fill, 15, 15, 1, 6, 'S');
  fill['5,6'] = 'P';
  fill['25,6'] = 'F';
  const map = world(30, 10, fill);
  assert.equal(explore(map, { pick: -1 }).touches(25, 6), false, 'ohne Graben darf sie nicht überwindbar sein');
  assert.ok(explore(map, { pick: 0 }).touches(25, 6), 'mit Graben muss sie erreichbar sein');
});

test('schwimmen: Becken nur über Wasser verlassbar (Wand 3 hoch am Ufer)', () => {
  const fill = rect({}, 0, 29, 7, 7, 'S');
  rect(fill, 21, 29, 7, 7, 'S');
  rect(fill, 10, 19, 5, 7, '~');
  rect(fill, 20, 20, 5, 7, 'S');
  fill['9,6'] = 'P';
  fill['25,6'] = 'F';
  assert.ok(explore(world(30, 10, fill), { pick: -1 }).touches(25, 6));
});

test('klettern: Turm nur über Leiter erreichbar', () => {
  const build = (ladder) => {
    const fill = rect({}, 0, 20, 7, 7, 'S');
    rect(fill, 10, 12, 2, 6, 'S');
    if (ladder) rect(fill, 9, 9, 1, 6, 'H');
    fill['5,6'] = 'P';
    fill['12,1'] = 'F';
    return world(21, 10, fill);
  };
  assert.ok(explore(build(true), { pick: -1 }).touches(12, 1));
  assert.equal(explore(build(false), { pick: -1 }).touches(12, 1), false);
});

test('Lava: 7 breiter Teich ist tödlich (auch mit Hacke)', () => {
  const fill = flat();
  rect(fill, 10, 16, 7, 7, 'L');
  fill['9,6'] = 'P';
  fill['20,6'] = 'F';
  const map = world(30, 10, fill);
  assert.equal(explore(map, { pick: -1 }).touches(20, 6), false);
  assert.equal(explore(map, { pick: 0 }).touches(20, 6), false);
});

test('Schleimblock: senkrecht 7 hoch nur mit Schleim', () => {
  // Boden Zeile 13, Standzeile 12. Plattform Zeile 5 (Standzeile 4), 8 Kacheln über dem Start.
  const build = (floorCh) => {
    const fill = rect({}, 0, 19, 13, 13, 'S');
    fill['9,13'] = floorCh;
    rect(fill, 11, 13, 5, 5, 'S');
    fill['9,12'] = 'P';
    fill['12,4'] = 'F';
    return world(20, 14, fill);
  };
  assert.ok(explore(build('J'), { pick: -1 }).touches(12, 4), 'mit Schleim');
  assert.equal(explore(build('S'), { pick: -1 }).touches(12, 4), false, 'ohne Schleim');
});

// ---- Level-Prüfung ----

if (LEVELS.length === 0) {
  test('LEVELS ist leer: Erreichbarkeit der Level wird ab D2 geprüft (nur Selbsttests laufen)', () => {});
}

for (const def of LEVELS) {
  const map = parseLevel(def);
  const boss = map.spawns.find((s) => s.type === 'boss');
  const fromArena = def.boss && boss ? { start: boss, bossDefeated: true } : {};
  const goal = cellOf(map.goal);

  test(`${def.id}: Portal erreichbar${fromArena.start ? ' (Boss-Arena, Sieg angenommen)' : ''}`, () => {
    const r = explore(map, { ...fromArena, pick: 'auto' });
    assert.ok(r.touches(goal.c, goal.r), `Portal bei ${goal.c},${goal.r} nicht erreichbar`);
  });

  test(`${def.id}: alle Diamanten, Bett und Truhen erreichbar (pick auto)`, () => {
    const r = explore(map, { pick: 'auto' });
    const bad = [];
    for (const g of map.gems) {
      if (!g.diamond) continue;
      const cell = cellOf(g);
      if (!r.touches(cell.c, cell.r)) bad.push(`Diamant ${cell.c},${cell.r}`);
    }
    for (let i = 0; i < map.tiles.length; i++) {
      if (map.tiles[i] !== TILE_IDS.diamondore) continue;
      const c = i % map.cols, row = Math.floor(i / map.cols);
      if (!r.touchesSolid(c, row) || !r.canDig(c, row)) bad.push(`Diamanterz ${c},${row}`);
    }
    if (map.checkpoint) {
      const bed = cellOf(map.checkpoint);
      if (!r.touches(bed.c, bed.r)) bad.push(`Bett ${bed.c},${bed.r}`);
    }
    for (const key of Object.keys(map.chests)) {
      const [c, row] = key.split(',').map(Number);
      if (!r.touchesSolid(c, row) || !r.canDig(c, row)) bad.push(`Truhe ${key}`);
    }
    assert.deepEqual(bad, []);
  });

  if (def.id === 'w1-1') {
    test('w1-1: Portal ohne Graben erreichbar', () => {
      assert.ok(explore(map, { pick: -1 }).touches(goal.c, goal.r));
    });
  }
}
