import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel } from '../js/game/level.js';
import { computeLight, lightAt } from '../js/game/light.js';

// Setzt ein F (Ziel) in die letzte Spalte von Zeile 1; für Lichttests ohne eigene Ziel-Markierung.
function mk(rows) {
  const copy = rows.slice();
  copy[1] = copy[1].slice(0, -1) + 'F';
  return parseLevel({ id: 'light-test', theme: 'depths', rows: copy });
}

function at(light, map, c, r) {
  return light[r * map.cols + c];
}

test('offene Fläche unter Himmel ist überall 15', () => {
  const rows = [];
  for (let r = 0; r < 12; r++) rows.push('.'.repeat(20));
  rows[10] = '.P' + '.'.repeat(18);
  rows[11] = 'S'.repeat(20);
  const map = mk(rows);
  const light = computeLight(map);
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      assert.equal(at(light, map, c, r), 15, `Zelle ${c},${r}`);
    }
  }
});

test('Höhle unter 5 Stein-Zeilen ohne Öffnung ist 0', () => {
  const stone = 'S'.repeat(20);
  const air = '.'.repeat(20);
  const rows = [stone, stone, stone, stone, stone,
    air, air, air, air, air, stone];
  rows[6] = '.P' + '.'.repeat(18);
  const map = mk(rows);
  const light = computeLight(map);
  for (let r = 5; r <= 9; r++) {
    for (let c = 0; c < map.cols; c++) {
      assert.equal(at(light, map, c, r), 0, `Höhle ${c},${r}`);
    }
  }
});

test('Fackel in dunkler Höhle: Zelle 14, Nachbar 13, Abstand 3 → 11', () => {
  const stone = 'S'.repeat(20);
  const air = '.'.repeat(20);
  const rows = [stone, stone, stone, stone, stone,
    air, air, air, air, air, stone];
  rows[6] = '.P' + '.'.repeat(18);
  rows[7] = air.slice(0, 10) + '|' + air.slice(11);
  const map = mk(rows);
  const light = computeLight(map);
  assert.equal(at(light, map, 10, 7), 14);
  assert.equal(at(light, map, 11, 7), 13);
  assert.equal(at(light, map, 13, 7), 11);
  assert.equal(at(light, map, 10, 9), 12);
});

test('Lichtschacht nach unten erhellt die Höhle abnehmend', () => {
  const stone = 'S'.repeat(20);
  const rows = [];
  for (let r = 0; r < 5; r++) rows.push(stone.slice(0, 10) + '.' + stone.slice(11));
  const air = '.'.repeat(20);
  for (let r = 5; r < 10; r++) rows.push(air);
  rows.push(stone);
  rows[6] = '.P' + '.'.repeat(18);
  const map = mk(rows);
  const light = computeLight(map);
  assert.equal(at(light, map, 10, 0), 15);
  assert.equal(at(light, map, 10, 5), 15);
  for (let d = 1; d <= 6; d++) {
    assert.equal(at(light, map, 10 - d, 5), 15 - d, `Abstand ${d}`);
    assert.ok(at(light, map, 10 - d, 5) < at(light, map, 10 - d + 1, 5));
  }
  assert.equal(at(light, map, 10, 9), 15);
});

test('Wiederverwendung von out und lightAt', () => {
  const stone = 'S'.repeat(20);
  const rows = [stone, stone, stone, stone, stone,
    '.'.repeat(20), '.'.repeat(20), '.'.repeat(20), '.'.repeat(20), '.'.repeat(20), stone];
  rows[6] = '.P' + '.'.repeat(18);
  const map = mk(rows);
  const buf = new Uint8Array(map.cols * map.rows);
  const light = computeLight(map, buf);
  assert.equal(light, buf);
  assert.equal(lightAt(light, map, 3, -1), 15);
  assert.equal(lightAt(light, map, -1, 3), 0);
  assert.equal(lightAt(light, map, 3, map.rows + 2), 0);
  assert.equal(lightAt(light, map, 3, 7), 0);
});

test('Leistung: 250×70 Stein mit Höhlen und 40 Fackeln, computeLight im Schnitt < 3 ms', () => {
  const cols = 250;
  const rowsN = 70;
  // Deterministischer Zufall (LCG), damit der Lauf reproduzierbar ist.
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const grid = [];
  for (let r = 0; r < rowsN; r++) {
    const line = new Array(cols);
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rowsN - 1 || c === 0 || c === cols - 1) line[c] = 'Z';
      else if (r < 3) line[c] = rnd() < 0.1 ? '.' : 'G';
      else line[c] = rnd() < 0.3 ? '.' : 'S';
    }
    grid.push(line);
  }
  grid[1][2] = 'P';
  grid[1][cols - 3] = 'F';
  let torches = 0;
  while (torches < 40) {
    const c = 2 + Math.floor(rnd() * (cols - 4));
    const r = 3 + Math.floor(rnd() * (rowsN - 5));
    if (grid[r][c] === '.') {
      grid[r][c] = '|';
      torches++;
    }
  }
  const map = parseLevel({ id: 'light-perf', theme: 'depths', rows: grid.map((line) => line.join('')) });

  const buf = new Uint8Array(map.cols * map.rows);
  computeLight(map, buf); // Warmup (Queue-Allokation)
  const runs = 10;
  const t0 = performance.now();
  for (let k = 0; k < runs; k++) computeLight(map, buf);
  const avg = (performance.now() - t0) / runs;
  console.log(`computeLight 250x70: Schnitt ${avg.toFixed(3)} ms`);
  assert.ok(avg < 3, `Schnitt ${avg.toFixed(3)} ms`);
});
