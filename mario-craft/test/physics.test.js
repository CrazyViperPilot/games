import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { parseLevel } from '../js/game/level.js';
import { createPlayer, updatePlayer } from '../js/game/player.js';

const T = PHYS.tile;
const DT = PHYS.step;
const R = PHYS.rows;
const FLOOR_TOP = (R - 1) * T; // Boden in der letzten Zeile

// Baut R Zeilen; draw(c, r) liefert ein Zeichen (Standard '.').
function rowsOf(cols, draw) {
  const out = [];
  for (let r = 0; r < R; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) s += draw(c, r) ?? '.';
    out.push(s);
  }
  return out;
}

// Ohne eigene Zielfahne wird am rechten Ende der Spielerzeile ein F gesetzt (Parser verlangt es).
function makeGame(rows) {
  if (!rows.some((row) => row.includes('F'))) {
    const cols = rows[0].length;
    rows = rows.slice();
    rows[R - 2] = rows[R - 2].slice(0, cols - 1) + 'F';
  }
  const map = parseLevel({ id: 'test', theme: 'meadow', rows });
  const player = createPlayer(map.start.x, map.start.y, 'small');
  return { map, player, platforms: [] };
}

function idle() {
  return { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
}

function step(g, inp) {
  updatePlayer(g, DT, inp);
}

function feet(p) {
  return p.y + p.h;
}

function settle(g, inp) {
  for (let i = 0; i < 5; i++) step(g, inp);
  assert.ok(g.player.onGround, 'Spieler steht nach dem Einschwingen auf dem Boden');
}

// Boden über die ganze Breite, Spieler startet auf Spalte `startCol` der Zeile R-2.
function flatFloor(cols, startCol) {
  return rowsOf(cols, (c, r) => {
    if (r === R - 1) return '#';
    if (r === R - 2 && c === startCol) return 'P';
    return '.';
  });
}

// Gehaltener Sprung von der aktuellen Position; liefert die größte Höhe in px.
function jumpAndMeasure(g, inp) {
  const p = g.player;
  const base = feet(p);
  let top = base;
  inp.jumpPressed = true;
  inp.jump = true;
  for (let i = 0; i < 600; i++) {
    step(g, inp);
    inp.jumpPressed = false;
    top = Math.min(top, feet(p));
    if (i > 2 && p.onGround) break;
  }
  return base - top;
}

test('Sprunghöhe stehend ≥ 4 Kacheln', () => {
  const g = makeGame(flatFloor(40, 5));
  const inp = idle();
  settle(g, inp);
  const h = jumpAndMeasure(g, inp);
  assert.ok(h >= 4 * T, `Höhe ${h} px, erwartet ≥ ${4 * T} px`);
});

test('Sprunghöhe gerannt ≥ 5 Kacheln', () => {
  const g = makeGame(flatFloor(80, 5));
  const inp = idle();
  settle(g, inp);
  inp.right = true;
  for (let i = 0; i < 120; i++) step(g, inp); // 1 s halten: Renntempo erreicht
  assert.ok(Math.abs(g.player.vx) >= PHYS.runSpeed - 1, `vx ${g.player.vx} vor dem Sprung`);
  const h = jumpAndMeasure(g, inp);
  assert.ok(h >= 5 * T, `Höhe ${h} px, erwartet ≥ ${5 * T} px`);
});

test('Rennsprung überwindet eine Lücke von 6 Kacheln', () => {
  // Boden Spalten 0–9, Lücke 10–15 (6 Kacheln), Boden ab 16.
  const rows = rowsOf(60, (c, r) => {
    if (r === R - 1 && (c < 10 || c >= 16)) return '#';
    if (r === R - 2 && c === 1) return 'P';
    return '.';
  });
  const g = makeGame(rows);
  const p = g.player;
  const inp = idle();
  settle(g, inp);
  inp.right = true;

  let jumped = false;
  let vxAtJump = 0;
  let jumpIndex = -1;
  for (let i = 0; i < 900; i++) {
    inp.jumpPressed = false;
    // Absprung an der Kante: Körper hat noch Boden unter den Füßen.
    if (!jumped && p.onGround && p.x + p.w / 2 >= 150) {
      jumped = true;
      jumpIndex = i;
      vxAtJump = p.vx;
      inp.jumpPressed = true;
      inp.jump = true;
    }
    step(g, inp);
    if (jumped && p.onGround && i > jumpIndex) break;
  }

  assert.ok(vxAtJump >= PHYS.runSpeed - 1, `Absprung mit vx ${vxAtJump}, erwartet Renntempo`);
  assert.ok(jumped && p.onGround, 'Spieler ist auf dem Boden jenseits der Lücke gelandet');
  assert.ok(p.x + p.w / 2 >= 16 * T, `Landung bei x ${p.x + p.w / 2}, erwartet ≥ ${16 * T}`);
  assert.ok(Math.abs(feet(p) - FLOOR_TOP) < 0.5, `Füße bei ${feet(p)}, erwartet ${FLOOR_TOP}`);
});

// Verlässt die Figur die Kante und drückt danach nach `wait` Schritten Sprung. Liefert, ob sie abgesprungen ist.
function jumpAfterLeaving(wait) {
  const rows = rowsOf(40, (c, r) => {
    if (r === R - 1 && c < 10) return '#';
    if (r === R - 2 && c === 8) return 'P';
    return '.';
  });
  const g = makeGame(rows);
  const p = g.player;
  const inp = idle();
  settle(g, inp);

  inp.right = true;
  let i = 0;
  while (p.onGround && i < 300) {
    step(g, inp);
    i++;
  }
  assert.ok(!p.onGround, 'Spieler hat die Kante verlassen');

  inp.right = false;
  for (let k = 0; k < wait; k++) step(g, inp);
  inp.jumpPressed = true;
  inp.jump = true;
  step(g, inp);
  return p.vy < 0;
}

test('Coyote Time: Sprung kurz nach dem Verlassen der Kante ist möglich', () => {
  assert.equal(jumpAfterLeaving(4), true);
});

test('Coyote Time: Sprung nach Ablauf der Coyote Time ist nicht möglich', () => {
  assert.equal(jumpAfterLeaving(14), false);
});

// Boden, Spieler startet in Zeile 8 (80 px über dem Boden) in der Luft.
function fallLevel() {
  return makeGame(rowsOf(40, (c, r) => {
    if (r === R - 1) return '#';
    if (r === 8 && c === 5) return 'P';
    return '.';
  }));
}

test('Jump Buffer: Sprungdruck kurz vor der Landung wird beim Aufkommen ausgeführt', () => {
  const g = fallLevel();
  const p = g.player;
  const inp = idle();
  let pressed = false;
  for (let i = 0; i < 300; i++) {
    inp.jumpPressed = false;
    if (!pressed && feet(p) >= FLOOR_TOP - 8) {
      pressed = true;
      assert.equal(p.onGround, false, 'Druck wird in der Luft gedrückt');
      inp.jumpPressed = true;
    }
    step(g, inp);
    if (pressed && p.onGround) break;
  }
  assert.ok(pressed && p.onGround, 'Landung nach dem Druck');
  step(g, inp); // erster Schritt auf dem Boden
  assert.ok(p.vy < 0, 'Sprung aus dem Puffer nach der Landung');
});

test('Jump Buffer: Sprungdruck verfällt nach 0,1 s', () => {
  const g = fallLevel();
  const p = g.player;
  const inp = idle();
  inp.jumpPressed = true;
  step(g, inp);
  inp.jumpPressed = false;
  for (let i = 0; i < 300 && !p.onGround; i++) step(g, inp);
  assert.ok(p.onGround, 'gelandet');
  step(g, inp);
  assert.ok(p.vy >= 0, 'kein Sprung, Puffer ist abgelaufen');
});

test("Plattform '=' ist nur von oben begehbar", () => {
  // Boden in der letzten Zeile, Plattform in Zeile 10 (Oberkante bei y = 160).
  const base = (startRow, startCol) => rowsOf(30, (c, r) => {
    if (r === R - 1) return '#';
    if (r === 10 && c >= 10 && c <= 13) return '=';
    if (r === startRow && c === startCol) return 'P';
    return '.';
  });

  // a) Von unten durch die Plattform springen.
  const gA = makeGame(base(R - 2, 11));
  const inpA = idle();
  settle(gA, inpA);
  let minFeet = feet(gA.player);
  inpA.jumpPressed = true;
  inpA.jump = true;
  for (let i = 0; i < 200; i++) {
    step(gA, inpA);
    inpA.jumpPressed = false;
    minFeet = Math.min(minFeet, feet(gA.player));
    if (i > 2 && gA.player.onGround) break;
  }
  assert.ok(minFeet < 10 * T, `Füße bei ${minFeet} px, erwartet über der Plattform (< ${10 * T})`);

  // b) Von oben fallen und auf der Plattform landen.
  const gB = makeGame(base(7, 11));
  const inpB = idle();
  for (let i = 0; i < 300 && !gB.player.onGround; i++) step(gB, inpB);
  for (let i = 0; i < 10; i++) step(gB, inpB); // sinkt in wenigen Schritten exakt auf die Oberkante
  assert.ok(Math.abs(feet(gB.player) - 10 * T) < 0.5, `Füße bei ${feet(gB.player)}, erwartet ${10 * T}`);
  assert.equal(gB.player.onGround, true);
  for (let i = 0; i < 30; i++) step(gB, inpB);
  assert.ok(Math.abs(feet(gB.player) - 10 * T) < 0.5, 'Figur bleibt auf der Plattform stehen');
});

test('Parser: Start, Ziel, Checkpoint und Münzen in Weltpixeln', () => {
  const rows = rowsOf(20, (c, r) => {
    if (r === R - 1) return '#';
    if (r === R - 2 && c === 5) return 'P';
    if (r === R - 2 && c === 9) return 'F';
    if (r === R - 3 && c === 3) return 'K';
    if (r === R - 3 && c === 4) return 'o';
    if (r === R - 3 && c === 5) return '*';
    return '.';
  });
  const map = parseLevel({ id: 'p', theme: 'cave', rows });
  assert.deepEqual(map.start, { x: 5.5 * T, y: (R - 1) * T });
  assert.deepEqual(map.goal, { x: 9.5 * T, y: (R - 1) * T });
  assert.deepEqual(map.checkpoint, { x: 3.5 * T, y: (R - 2) * T });
  assert.deepEqual(map.coins, [
    { x: 4.5 * T, y: (R - 2) * T, star: false },
    { x: 5.5 * T, y: (R - 2) * T, star: true },
  ]);
  assert.equal(map.get(5, R - 2), 0, 'Entitäten sind keine Kacheln');
  assert.equal(map.isSolid(0, R - 1), true);
  assert.equal(map.isSolid(0, 0), false);
  assert.equal(map.isSolid(-1, 0), true, 'links außerhalb ist fest');
  assert.equal(map.isSolid(0, R + 5), false, 'unter dem Level ist offen');
});

test('Parser: falsche Zeilenzahl wirft einen Fehler', () => {
  const rows = rowsOf(10, (c, r) => (r === 0 ? 'P' : '.')).slice(0, R - 1);
  assert.throws(() => parseLevel({ id: 'x', rows }), /Zeilen/);
});

test('Parser: ungleiche Zeilenlänge wirft einen Fehler', () => {
  const rows = rowsOf(10, (c, r) => (r === R - 1 ? '#' : (r === R - 2 && c === 0 ? 'P' : '.')));
  rows[3] = rows[3] + '.';
  assert.throws(() => parseLevel({ id: 'x', rows }), /Zeile 3/);
});

test('Parser: unbekanntes Zeichen wirft einen Fehler', () => {
  const rows = rowsOf(10, (c, r) => {
    if (r === R - 1) return '#';
    if (r === R - 2 && c === 0) return 'P';
    if (r === 2 && c === 4) return 'X';
    return '.';
  });
  assert.throws(() => parseLevel({ id: 'x', rows }), /unbekanntes Zeichen "X"/);
});

test('Parser: fehlender Spielerstart wirft einen Fehler', () => {
  const rows = rowsOf(10, (c, r) => (r === R - 1 ? '#' : '.'));
  assert.throws(() => parseLevel({ id: 'x', rows }), /kein P/);
});
