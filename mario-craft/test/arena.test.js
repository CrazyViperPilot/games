import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { TILE_IDS } from '../js/data/tiles.js';
import { Game } from '../js/game/game.js';
import { createBoss, restartBoss } from '../js/game/bosses.js';
import { LEVELS } from '../js/data/levels/index.js';

// Boss-Arena mit Tor (`:`): Tor schließt erst hinter der Figur, Tod oder Verlassen der Arena öffnen es wieder,
// der Boss wartet dann mit dem bisherigen Schaden (Bug 2026-10-27: nach dem Tod war man ausgesperrt).
const T = PHYS.tile;
const DT = 1 / 60;
const COLS = 60;
const ROWS = 14;
const DOOR_C = 20;
const BOSS_C = 40;
const BARRIER = TILE_IDS.barrier;
const AIR = TILE_IDS.air;

// Zeile 12 Boden (S), 13 Grundgestein. Wand aus Grundgestein über dem Tor (Spalte 20, Zeilen 0–8), Tor Zeilen 9–11.
function makeGame(kind = 'slimeking', save = { lives: 9, power: 'bow' }) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let s = '';
    for (let c = 0; c < COLS; c++) {
      if (r === ROWS - 1) s += 'Z';
      else if (r === ROWS - 2) s += 'S';
      else if (c === DOOR_C) s += r <= 8 ? 'Z' : ':';
      else if (r === 11 && c === 2) s += 'P';
      else if (r === 11 && c === 10) s += 'K';
      else if (r === 11 && c === BOSS_C) s += '@';
      else if (r === 11 && c === 58) s += 'F';
      else s += '.';
    }
    rows.push(s);
  }
  const events = [];
  const game = new Game({
    level: { id: 'arena-test', theme: 'overworld', rows, boss: kind },
    save,
    onEvent: (name) => events.push(name),
  });
  return { game, events };
}

function input(over = {}) {
  return {
    left: false, right: false, jump: false, dig: false, fire: false,
    jumpPressed: false, digPressed: false, firePressed: false, ...over,
  };
}

// Figur auf den Boden stellen, linke Kante bei x (px).
function place(game, x) {
  const p = game.player;
  p.x = x;
  p.y = 12 * T - p.h;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
}

function gateClosed(game) {
  for (let r = 9; r <= 11; r++) if (game.map.get(DOOR_C, r) !== BARRIER) return false;
  return true;
}

function gateOpen(game) {
  for (let r = 9; r <= 11; r++) if (game.map.get(DOOR_C, r) !== AIR) return false;
  return true;
}

// Sterben und warten, bis die Figur wieder steht.
function dieAndRespawn(game) {
  game.loseLife('test');
  for (let i = 0; i < 200 && game.state !== 'play'; i++) game.update(DT, input());
  assert.equal(game.state, 'play');
}

test('Arena-Tor: schließt erst, wenn die Figur ganz hinter der Türspalte steht', () => {
  const { game } = makeGame('slimeking');
  assert.ok(gateOpen(game));
  place(game, (DOOR_C + 1) * T - 4);   // steht noch 4 px in der Türspalte (Riesenschleim würde schon starten)
  game.update(DT, input());
  assert.equal(game.boss.state, 'idle');
  assert.ok(gateOpen(game), 'Tor darf nicht auf der Figur schließen');
  place(game, (DOOR_C + 1) * T + 1);
  game.update(DT, input());
  assert.equal(game.boss.state, 'fight');
  assert.ok(gateClosed(game));
});

test('Arena-Tor: nach dem Tod offen, Boss wartet mit seinem Schaden, Wiedereintritt schließt es', () => {
  const { game } = makeGame('dreikopf');
  game.checkpointReached = true;
  game.respawnAt = { x: 10.5 * T, y: 12 * T };
  place(game, 30 * T);
  game.update(DT, input());
  assert.equal(game.boss.state, 'fight');
  assert.ok(gateClosed(game));
  game.boss.hp = 5;
  Object.assign(game.projectiles[0], { active: true, type: 'skull', owner: 'enemy', x: 35 * T, y: 4 * T, w: 8, h: 8, vx: 0, vy: 0, life: 99 });
  dieAndRespawn(game);

  assert.ok(gateOpen(game), 'Tor offen nach dem Neustart am Bett');
  assert.equal(game.boss.state, 'idle');
  assert.equal(game.boss.active, false);
  assert.equal(game.boss.hp, 5, 'Schaden bleibt');
  assert.ok(game.projectiles.every((o) => !o.active || o.owner !== 'enemy'));

  // Vom Bett zurück in die Arena laufen: Kampf geht weiter, Tor wieder zu.
  let steps = 0;
  while (game.boss.state === 'idle' && steps < 600) {
    game.update(DT, input({ right: true }));
    steps++;
  }
  assert.equal(game.boss.state, 'fight', 'Figur kommt wieder in die Arena');
  assert.ok(game.player.x >= (DOOR_C + 1) * T);
  assert.ok(gateClosed(game));
  assert.equal(game.boss.hp, 5);
});

test('Arena-Tor: Arena verlassen (z. B. durchgegraben) öffnet das Tor', () => {
  const { game, events } = makeGame('slimeking');
  place(game, 30 * T);
  game.update(DT, input());
  assert.ok(gateClosed(game));
  place(game, 12 * T);                 // links vor dem Tor
  game.update(DT, input());
  assert.ok(gateOpen(game));
  assert.equal(game.boss.state, 'idle');
  assert.ok(events.includes('bossPause'));
});

test('Riesenschleim: Neustart behält die Teile, kleine Schleime leben weiter', () => {
  const { game } = makeGame('slimeking');
  place(game, 30 * T);
  game.update(DT, input());
  game.damageBoss('arrow');            // groß → 2 mittel
  assert.equal(game.boss.parts.length, 2);
  dieAndRespawn(game);
  const b = game.boss;
  assert.equal(b.state, 'idle');
  assert.deepEqual(b.parts.map((q) => q.size), ['m', 'm']);
  assert.equal(b.hp, 2);
  for (const q of b.parts) assert.ok(Math.abs(q.x + q.w / 2 - (BOSS_C + 0.5) * T) < 3 * T, 'Teile am Spawn');
});

test('restartBoss: Dreikopf und Drache behalten die Energie, unbeschädigt bleibt alles wie neu', () => {
  for (const kind of ['dreikopf', 'drache', 'schildkroete', 'eisengolem']) {
    const old = createBoss(kind, 400, 192);
    old.hp = 3;
    old.state = 'fight';
    old.active = true;
    const b = restartBoss(old, 400, 192);
    assert.equal(b.hp, 3, kind);
    assert.equal(b.state, 'idle', kind);
    assert.equal(b.active, false, kind);
  }
  const slime = createBoss('slimeking', 400, 192);
  const again = restartBoss(slime, 400, 192);
  assert.deepEqual(again.parts.map((q) => q.size), ['l']);
});

// Echte Boss-Level: im Kampf sterben, am Bett neu starten, zurück in die Arena laufen.
for (const id of ['w1-33', 'w2-33', 'w3-33', 'w4-33', 'w5-33']) {
  test(`${id}: nach dem Tod im Bosskampf kommt man wieder in die Arena`, () => {
    const def = LEVELS.find((l) => l.id === id);
    const game = new Game({ level: def, save: { lives: 5 } });
    const cp = game.map.checkpoint;
    const doorC = game.map.doors[0].c;
    game.checkpointReached = true;
    game.respawnAt = { x: cp.x, y: cp.y };
    const p = game.player;
    p.x = cp.x - p.w / 2;
    p.y = cp.y - p.h;
    let steps = 0;
    while (!game.boss.active && steps < 3000) { game.update(1 / 120, input({ right: true })); steps++; }
    assert.ok(game.boss.active, 'Kampf beginnt');
    assert.ok(game.player.x >= (doorC + 1) * T, 'Figur steht beim Schließen hinter der Tür');
    assert.equal(game.map.get(doorC, game.map.doors[0].r), BARRIER);

    dieAndRespawn(game);
    assert.equal(game.map.get(doorC, game.map.doors[0].r), AIR, 'Tor offen');
    steps = 0;
    while (!game.boss.active && steps < 3000) { game.update(1 / 120, input({ right: true })); steps++; }
    assert.ok(game.boss.active, 'Kampf geht weiter');
    assert.ok(game.player.x >= (doorC + 1) * T);
  });
}
