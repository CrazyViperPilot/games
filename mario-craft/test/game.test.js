import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { TUNE } from '../js/data/combat.js';
import { Game } from '../js/game/game.js';
import { LEVELS } from '../js/data/levels/index.js';

const T = PHYS.tile;
const R = PHYS.rows;
const DT = PHYS.step;
const FLOOR = (R - 1) * T; // Oberkante des Bodens in der letzten Zeile

function rowsOf(cols, draw) {
  const out = [];
  for (let r = 0; r < R; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) s += draw(c, r) ?? '.';
    out.push(s);
  }
  return out;
}

// Level-Definition; ohne eigene Zielfahne wird ein F ganz rechts auf Bodenhöhe gesetzt.
function level(cols, draw, extra = {}) {
  const rows = rowsOf(cols, draw);
  if (!rows.some((row) => row.includes('F'))) {
    rows[R - 2] = rows[R - 2].slice(0, cols - 1) + 'F';
  }
  return { id: 'test', theme: 'meadow', rows, ...extra };
}

function idle() {
  return { left: false, right: false, jump: false, fire: false, jumpPressed: false, firePressed: false };
}

function collector() {
  const events = [];
  return { events, onEvent: (name, data) => events.push({ name, data }) };
}

function named(events, name) {
  return events.filter((e) => e.name === name);
}

// Schritte ausführen, bis `done()` wahr ist oder max Schritte erreicht sind. Liefert die Schrittzahl.
function runUntil(g, input, max, done) {
  let n = 0;
  while (n < max && !done()) {
    g.update(DT, input);
    input.jumpPressed = false;
    input.firePressed = false;
    n++;
  }
  return n;
}

// Boden über alle Spalten. Ohne eigenes P steht der Spieler bei Spalte 2 auf dem Boden.
function floorLevel(cols, extra = {}, cells = {}) {
  const hasP = Object.values(cells).includes('P');
  const merged = hasP ? cells : { ...cells, '2,13': 'P' };
  return level(cols, (c, r) => {
    const v = merged[`${c},${r}`];
    if (v !== undefined) return v;
    if (r === R - 1) return '#';
    return '.';
  }, extra);
}

test('Stampfen besiegt einen Läufer und gibt 100 Punkte', () => {
  // Läufer steht bei Spalte 12 auf dem Boden, Spieler fällt von oben darauf.
  const def = floorLevel(40, {}, { '12,13': 'g', '12,10': 'P' });
  const c = collector();
  const g = new Game({ level: def, save: {}, onEvent: c.onEvent });
  const walker = g.enemies[0];
  runUntil(g, idle(), 300, () => walker.state === 'dead');
  assert.equal(walker.state, 'dead', 'Läufer ist besiegt');
  assert.equal(g.score, 100, 'erster Stampfer bringt 100 Punkte');
  assert.equal(named(c.events, 'stomp').length, 1, 'Event stomp');
  assert.equal(g.state, 'play', 'Spieler bleibt am Leben');
});

test('Stachling verletzt den Spieler bei Berührung (klein = Leben verloren)', () => {
  // Stachling läuft nach links auf den nach rechts laufenden Spieler zu.
  const def = floorLevel(40, {}, { '30,13': 's', '5,13': 'P' });
  const c = collector();
  const g = new Game({ level: def, save: {}, onEvent: c.onEvent });
  const input = idle();
  input.right = true;
  runUntil(g, input, 1000, () => g.state !== 'play');
  assert.equal(g.state, 'dying', 'Berührung mit dem Stachling kostet ein Leben');
  assert.equal(named(c.events, 'die').length, 1, 'Event die');
});

test('Stachling verletzt groß/Feuer nur herunterstufend', () => {
  const def = floorLevel(40, {}, { '30,13': 's', '5,13': 'P' });
  const c = collector();
  const g = new Game({ level: def, save: { power: 'fire' }, onEvent: c.onEvent });
  const input = idle();
  input.right = true;
  runUntil(g, input, 1000, () => g.player.power !== 'fire');
  assert.equal(g.player.power, 'big', 'Feuer -> groß');
  assert.equal(g.state, 'play');
  assert.ok(g.player.invuln > 0, 'danach unverwundbar');
  g.player.invuln = 0;
  runUntil(g, input, 1000, () => g.player.power === 'small' || g.state !== 'play');
  assert.equal(g.player.power, 'small', 'groß -> klein');
  assert.equal(g.state, 'play', 'noch kein Leben verloren');
});

test('Panzerkäfer: Stampfen macht ihn zum Panzer, Antippen kickt ihn', () => {
  const def = floorLevel(40, {}, { '14,13': 'k' });
  const c = collector();
  const g = new Game({ level: def, save: {}, onEvent: c.onEvent });
  const beetle = g.enemies[0];
  g.player.x = 14 * T + T / 2 - g.player.w / 2 - 1;
  g.player.y = 10 * T - g.player.h;
  runUntil(g, idle(), 300, () => beetle.state === 'shell');
  assert.equal(beetle.state, 'shell', 'ruhender Panzer nach dem Stampfen');
  assert.equal(beetle.active && !beetle.done, true, 'Panzer lebt noch');

  // Spieler steht links vom Panzer auf dem Boden und läuft nach rechts.
  g.player.x = beetle.x - g.player.w - 4;
  g.player.y = FLOOR - g.player.h;
  g.player.vy = 0;
  const input = idle();
  input.right = true;
  runUntil(g, input, 300, () => beetle.state === 'kicked');
  assert.equal(beetle.state, 'kicked', 'Panzer wird gekickt');
  assert.equal(beetle.face, 1, 'Kick weg vom Spieler (nach rechts)');
  assert.equal(beetle.vx, PHYS.shellSpeed);
  assert.ok(named(c.events, 'kick').length >= 1, 'Event kick');
});

test('Bonusblock: Pilz bei klein, Blume bei groß', () => {
  for (const [power, want] of [['small', 'mushroom'], ['big', 'flower']]) {
    const def = floorLevel(30, { items: { '10,11': 'mushroom' } }, { '10,11': '?', '10,13': 'P' });
    const c = collector();
    const g = new Game({ level: def, save: { power }, onEvent: c.onEvent });
    const input = idle();
    input.jump = true;
    input.jumpPressed = true;
    runUntil(g, input, 300, () => g.items.some((it) => it.active && it.type === want));
    const item = g.items.find((it) => it.active);
    assert.ok(item, `${power}: ein Gegenstand kommt aus dem Block`);
    assert.equal(item.type, want, `${power}: ${want}`);
    assert.equal(g.map.get(10, 11), 13, 'Block ist danach leer (used)');
    assert.equal(named(c.events, 'appear').length, 1, 'Event appear');
  }
});

test('100 Münzen ergeben ein Extraleben', () => {
  const def = floorLevel(30, {}, { '8,13': 'o' });
  const c = collector();
  const g = new Game({ level: def, save: { coins: 99, lives: 3 }, onEvent: c.onEvent });
  const input = idle();
  input.right = true;
  runUntil(g, input, 400, () => g.lives === 4);
  assert.equal(g.lives, 4, 'Leben +1');
  assert.equal(g.coins, 0, 'Zähler zurückgesetzt');
  assert.equal(named(c.events, 'oneup').length, 1, 'Event oneup');
});

test('Zielfahne: Zustand won und Event levelDone', () => {
  const def = floorLevel(30);
  const c = collector();
  const g = new Game({ level: def, save: {}, onEvent: c.onEvent });
  const input = idle();
  input.right = true;
  runUntil(g, input, 3000, () => g.state !== 'play');
  assert.equal(g.state, 'won');
  const done = named(c.events, 'levelDone');
  assert.equal(done.length, 1);
  const d = done[0].data;
  assert.equal(typeof d.time, 'number');
  assert.equal(d.coins, 0);
  assert.equal(d.starCoins.length, 3);
  assert.ok(d.score > 0, 'Flaggenpunkte');
});

test('Checkpoint-Respawn: nach Grube am Checkpoint, klein, Leben -1', () => {
  // Grube zwischen Spalte 10 und 19; Checkpoint in Spalte 8.
  const def = level(60, (c, r) => {
    if (r === R - 1 && (c < 10 || c >= 20)) return '#';
    if (r === R - 2 && c === 3) return 'P';
    if (r === R - 2 && c === 8) return 'K';
    return '.';
  });
  const c = collector();
  const g = new Game({ level: def, save: {}, onEvent: c.onEvent });
  const input = idle();
  input.right = true;
  runUntil(g, input, 1500, () => g.state !== 'play');
  assert.equal(g.state, 'dying', 'in die Grube gefallen');
  assert.equal(g.checkpointReached, true, 'Checkpoint wurde überquert');
  input.right = false;
  runUntil(g, input, 300, () => g.state === 'play');
  assert.equal(g.state, 'play');
  const cp = g.map.checkpoint;
  assert.ok(Math.abs(g.player.x + g.player.w / 2 - cp.x) < 0.5, 'Neustart am Checkpoint');
  assert.equal(g.player.h, PHYS.player.small.h, 'klein');
  assert.equal(g.lives, PHYS.lives - 1);
});

test('Grube kostet ein Leben und Neustart am Start', () => {
  const def = level(40, (c, r) => {
    if (r === R - 1 && (c < 10 || c >= 20)) return '#';
    if (r === R - 2 && c === 5) return 'P';
    return '.';
  });
  const c = collector();
  const g = new Game({ level: def, save: {}, onEvent: c.onEvent });
  const input = idle();
  input.right = true;
  runUntil(g, input, 1500, () => g.state !== 'play');
  assert.equal(g.state, 'dying');
  assert.equal(named(c.events, 'die').length, 1);
  input.right = false;
  runUntil(g, input, 300, () => g.state === 'play');
  assert.equal(g.lives, PHYS.lives - 1, 'ein Leben verloren');
  assert.ok(Math.abs(g.player.x + g.player.w / 2 - g.map.start.x) < 0.5, 'Neustart am Start');
});

test('Boss Wurzelkönig ist nach 3 Stampfern besiegt und gibt die Zielfahne frei', () => {
  // Arena mit Boden; Boss in Spalte 40, Zielfahne in Spalte 55.
  const def = level(60, (c, r) => {
    if (r === R - 1) return '#';
    if (r === R - 2 && c === 5) return 'P';
    if (r === R - 2 && c === 40) return 'b';
    if (r === R - 2 && c === 55) return 'F';
    return '.';
  }, { boss: 'rootking' });
  const c = collector();
  const g = new Game({ level: def, save: {}, onEvent: c.onEvent, viewW: 1000 });
  const b = g.boss;
  assert.ok(b, 'Boss ist angelegt');
  assert.equal(b.hp, 3);
  assert.ok(g.barrier.length > 0, 'Wand vor der Zielfahne ist gesetzt');

  for (let k = 0; k < 3; k++) {
    const hpBefore = b.hp;
    // Über den Boss setzen und fallen lassen.
    g.player.x = b.x + b.w / 2 - g.player.w / 2;
    g.player.y = b.y - 40;
    g.player.vy = 0;
    g.player.onGround = false;
    runUntil(g, idle(), 200, () => b.hp !== hpBefore || g.state !== 'play');
    assert.equal(b.hp, hpBefore - 1, `Stampfer ${k + 1} trifft`);
    // Weg vom Boss und Unverwundbarkeit abwarten.
    g.player.x = 5 * T;
    g.player.y = FLOOR - g.player.h;
    g.player.vy = 0;
    runUntil(g, idle(), 150, () => false);
  }
  assert.equal(b.state, 'defeated', 'Boss besiegt');
  assert.equal(g.bossDefeated, true);
  assert.equal(g.barrier.every((cell) => g.map.get(cell.c, cell.r) === 0), true, 'Wand entfernt');
  assert.ok(named(c.events, 'stomp').length >= 3);
});

test('Alle 12 Level starten und überstehen 600 Schritte ohne Eingabe', () => {
  for (const def of LEVELS) {
    const c = collector();
    const g = new Game({ level: def, save: {}, onEvent: c.onEvent });
    const input = idle();
    for (let i = 0; i < 600; i++) g.update(DT, input);
    assert.ok(['play', 'dying', 'over'].includes(g.state), `${def.id}: Zustand ${g.state}`);
    assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.y), `${def.id}: Spieler endlich`);
  }
});
