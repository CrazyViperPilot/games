import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { parseLevel } from '../js/game/level.js';
import { createPlayer } from '../js/game/player.js';
import {
  createMob, updateMobs, hitMob, killMob, rectHit, updateSpawners,
} from '../js/game/mobs.js';

const T = PHYS.tile;
const DT = PHYS.step;
const COLS = 60;
const ROWS = 12;
const GROUND = (ROWS - 1) * T; // Fußlinie auf der untersten Zeile (Z)

// Level: unterste Zeile Stein, sonst Luft. `extra` überschreibt Zellen ("c,r" → Zeichen).
function makeRows(extra = {}) {
  const cells = { '1,10': 'P', '58,10': 'F', ...extra };
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let s = '';
    for (let c = 0; c < COLS; c++) {
      const key = `${c},${r}`;
      if (key in cells) s += cells[key];
      else s += r === ROWS - 1 ? 'Z' : '.';
    }
    rows.push(s);
  }
  return rows;
}

// Mock-game mit echter Karte, Spieler (Fußmitte) und Zählern für Ereignisse und Schaden.
function makeGame(extra = {}, [px, py] = [20, GROUND]) {
  const map = parseLevel({ id: 'test', theme: 'overworld', rows: makeRows(extra) });
  return {
    map,
    player: createPlayer(px, py),
    mobs: [],
    camX: 0,
    camY: 0,
    viewW: 384,
    viewH: 240,
    jumpHeld: false,
    score: 0,
    hurts: 0,
    events: [],
    emit(name) { this.events.push(name); },
    addScore(n) { this.score += n; },
    hurtPlayer() { this.hurts++; },
  };
}

// Schritte ausführen. prevFeet optional (sonst Fußposition des Spielers jetzt, Spieler steht still).
function step(g, n = 1, prevFeet = null) {
  for (let i = 0; i < n; i++) {
    const pf = prevFeet ?? g.player.y + g.player.h;
    updateMobs(g, DT, pf);
  }
}

function spawn(g, type, x) {
  const m = createMob(type, x, GROUND);
  g.mobs.push(m);
  return m;
}

test('createMob: Felder aus MOBS, Fußmitte wird zur linken oberen Ecke', () => {
  const m = createMob('zombie', 100, GROUND);
  assert.equal(m.type, 'zombie');
  assert.equal(m.w, 12);
  assert.equal(m.h, 26);
  assert.equal(m.x, 94);
  assert.equal(m.y, GROUND - 26);
  assert.equal(m.hp, 1);
  assert.equal(m.active, false);
  assert.equal(m.dead, false);
  assert.equal(m.face, -1);
  assert.throws(() => createMob('gibtsnicht', 0, 0));
});

test('rectHit: Überlappung ja, Berührung an der Kante nein', () => {
  assert.equal(rectHit(0, 0, 10, 10, 5, 5, 10, 10), true);
  assert.equal(rectHit(0, 0, 10, 10, 10, 0, 10, 10), false);
  assert.equal(rectHit(0, 0, 10, 10, 0, 10, 10, 10), false);
});

test('Zombie wird erst in Sichtweite aktiv und bleibt stehen, solange er inaktiv ist', () => {
  const g = makeGame();
  const far = spawn(g, 'zombie', 700); // > viewW + 64
  step(g);
  assert.equal(far.active, false);
  assert.equal(far.x, 700 - 6);

  const near = spawn(g, 'zombie', 300);
  step(g);
  assert.equal(near.active, true);
});

test('Zombie wird inaktiv, wenn die Kamera ihn weit genug verlässt', () => {
  const g = makeGame();
  const m = spawn(g, 'zombie', 300);
  step(g);
  assert.equal(m.active, true);
  g.camX = 1500; // |300 − 1500| > 3 × 384
  const x = m.x;
  step(g, 10);
  assert.equal(m.active, false);
  assert.equal(m.x, x);
});

test('Zombie läuft auf den Spieler zu (links, dann rechts)', () => {
  const g = makeGame({}, [200, GROUND]);
  const m = spawn(g, 'zombie', 300);
  step(g);
  assert.equal(m.face, -1);
  const x0 = m.x;
  step(g, 120); // 1 s bei 25 px/s
  assert.ok(Math.abs((x0 - m.x) - 25) < 0.5, `Strecke ${x0 - m.x}`);

  g.player.x = 380 - 6; // Spieler jetzt rechts
  step(g);
  assert.equal(m.face, 1);
});

test('Zombie behält seine Richtung, wenn der Spieler weiter als 10 Kacheln weg ist', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zombie', 300); // Abstand 280 px > 160 px
  m.face = 1;
  step(g, 5);
  assert.equal(m.face, 1);
});

test('Zombie dreht an einer Wand', () => {
  const g = makeGame({ '10,10': 'S', '10,9': 'S' }, [240, GROUND]);
  const m = spawn(g, 'zombie', 100);
  m.face = 1; // läuft auf die Wand bei x = 160 zu
  let guard = 0;
  while (m.face !== -1 && guard++ < 600) step(g);
  assert.equal(m.face, -1, 'Zombie hat sich an der Wand umgedreht');
  assert.ok(m.x + m.w <= 160 + 1e-6, 'Zombie steht vor der Wand');
  const x0 = m.x;
  step(g, 30); // Cooldown: weg von der Wand
  assert.ok(m.x < x0);
});

test('Zombie fällt von einer Kante und dreht nicht um', () => {
  const g = makeGame({ '4,11': '.', '5,11': '.' }, [20, GROUND]);
  const m = spawn(g, 'zombie', 100);
  step(g, 120); // 1 s: läuft zur Kante, fällt
  assert.ok(m.y > GROUND - 26, 'Zombie ist gefallen');
  assert.equal(m.onGround, false);
  assert.equal(m.face, -1);
  step(g, 240); // fällt unter die Karte und wird entfernt
  assert.equal(g.mobs.length, 0);
});

test('Stampfen tötet den Zombie, der Spieler prallt ab', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zombie', 300);
  g.player = createPlayer(300, m.y + 4); // Füße 4 px in den Zombie
  g.player.vy = 200;
  step(g, 1, m.y); // Füße vorher auf Höhe der Zombie-Oberkante
  assert.equal(m.dead, true);
  assert.equal(g.score, 100);
  assert.ok(g.events.includes('stomp'));
  assert.equal(g.player.vy, -PHYS.stompBounce);
  assert.equal(g.hurts, 0);
});

test('Stampfen mit gehaltenem Sprung prallt höher ab', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zombie', 300);
  g.player = createPlayer(300, m.y + 4);
  g.player.vy = 200;
  g.jumpHeld = true;
  step(g, 1, m.y);
  assert.equal(m.dead, true);
  assert.equal(g.player.vy, -PHYS.stompBounceHold);
});

test('Seitlicher Kontakt fügt Schaden zu', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zombie', 300);
  g.player = createPlayer(300, GROUND); // gleiche Höhe, nicht fallend
  step(g, 1, GROUND);
  assert.equal(g.hurts, 1);
  assert.equal(m.dead, false);
});

test('Unverwundbar: kein Schaden bei seitlichem Kontakt', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zombie', 300);
  g.player = createPlayer(300, GROUND);
  g.player.invuln = 1.5;
  step(g, 1, GROUND);
  assert.equal(g.hurts, 0);
  assert.equal(m.dead, false);
});

test('Stern: Zombie stirbt bei seitlichem Kontakt, ohne Schaden', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zombie', 300);
  g.player = createPlayer(300, GROUND);
  g.player.star = 5;
  step(g, 1, GROUND);
  assert.equal(m.dead, true);
  assert.equal(g.hurts, 0);
  assert.equal(g.score, 100);
  assert.ok(!g.events.includes('stomp'));
});

test('Toter Mob wird nach 1,2 s entfernt', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zombie', 300);
  step(g);
  hitMob(g, m, 'explosion');
  assert.equal(m.dead, true);
  step(g, 100); // ca. 0,83 s
  assert.equal(g.mobs.length, 1);
  step(g, 60); // insgesamt ca. 1,33 s
  assert.equal(g.mobs.length, 0);
});

test('Pfeil: Zombie hat 1 HP und stirbt; Doppeltod zählt nicht doppelt', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zombie', 300);
  step(g);
  hitMob(g, m, 'arrow');
  killMob(g, m, 'arrow');
  assert.equal(m.dead, true);
  assert.equal(g.score, 100);
});

test('Lava tötet den Zombie', () => {
  const g = makeGame({ '10,10': 'L' }, [20, GROUND]);
  const m = spawn(g, 'zombie', 168); // Mitte in Spalte 10, Füße in der Lava-Zelle
  step(g);
  assert.equal(m.dead, true);
  assert.equal(g.score, 100);
  assert.ok(!g.events.includes('stomp'));
});

test('updateSpawners ist vorerst leer (A8)', () => {
  const g = makeGame();
  assert.doesNotThrow(() => updateSpawners(g, DT));
});
