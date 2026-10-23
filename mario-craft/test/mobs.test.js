import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { TILE_IDS } from '../js/data/tiles.js';
import { parseLevel } from '../js/game/level.js';
import { createPlayer } from '../js/game/player.js';
import { breakTile } from '../js/game/dig.js';
import {
  createMob, updateMobs, hitMob, killMob, rectHit, updateSpawners,
} from '../js/game/mobs.js';

const DIRT = TILE_IDS.dirt;
const AIR = TILE_IDS.air;

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
    lightDirty: false,
    shake: 0,
    dirty: [],
    emeralds: 0,
    emit(name) { this.events.push(name); },
    addScore(n) { this.score += n; },
    hurtPlayer() { this.hurts++; },
    markDirty(c, r) { this.dirty.push([c, r]); },
    addEmeralds(n) { this.emeralds += n; },
    killMob(m, how) { killMob(this, m, how); },
    spawnMob(type, x, y) { const m = createMob(type, x, y); this.mobs.push(m); return m; },
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

test('Zischer läuft nur in Aggro-Reichweite (8 Kacheln) auf den Spieler zu', () => {
  const g = makeGame({}, [20, GROUND]);
  const far = spawn(g, 'zischer', 300); // 280 px > 8 × 16 px
  step(g, 120);
  assert.equal(far.x, 300 - 6, 'steht still');

  const near = spawn(g, 'zischer', 100); // 80 px ≤ 128 px
  step(g);
  assert.equal(near.face, -1);
  const x0 = near.x;
  step(g, 59); // ca. 0,5 s bei 40 px/s
  assert.ok(Math.abs((x0 - near.x) - 20) < 1, `Strecke ${x0 - near.x}`);
});

test('Zischer zündet bei 1,5 Kacheln, steht still und explodiert nach 1,5 s', () => {
  // Zischer-Mitte liegt bei y 162, Explosion bei x ≈ 44: Zelle (2,8) im Radius, (8,8) außerhalb.
  const g = makeGame({ '2,8': '#', '8,8': '#' }, [20, GROUND]);
  const m = spawn(g, 'zischer', 100);
  let guard = 0;
  while (m.state !== 'fuse' && guard++ < 600) step(g);
  assert.equal(m.state, 'fuse', 'gezündet');
  assert.equal(m.anim, 'fuse');
  assert.equal(m.fuse, 1.5);
  assert.ok(g.events.includes('fuse'));

  const x = m.x;
  step(g, 100); // ca. 0,83 s
  assert.equal(m.x, x, 'steht still');
  assert.equal(m.dead, false);
  step(g, 68); // insgesamt ca. 1,4 s
  assert.equal(m.dead, false, 'Zündschnur läuft noch');
  assert.equal(g.map.get(2, 8), DIRT);

  step(g, 24); // insgesamt ca. 1,6 s
  assert.equal(g.map.get(2, 8), AIR, 'Block im Radius gesprengt');
  assert.equal(g.map.get(8, 8), DIRT, 'Block außerhalb bleibt');
  assert.ok(g.events.includes('explode'));
  assert.equal(g.mobs.length, 0, 'Zischer entfernt');
  assert.equal(g.score, 0, 'kein Punkt für die Explosion');
  assert.ok(!g.events.includes('stomp'));
  assert.equal(g.hurts, 1, 'Spieler im Radius wird durch die Explosion verletzt');
});

test('Stampfen zündet den Zischer: Abprall, Zündschnur 1,0 s, kein Schaden, kein Punkt', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zischer', 300);
  g.player = createPlayer(300, m.y + 4);
  g.player.vy = 200;
  step(g, 1, m.y);
  assert.equal(m.state, 'fuse');
  assert.equal(m.fuse, 1.0);
  assert.equal(m.dead, false);
  assert.equal(g.player.vy, -PHYS.stompBounce);
  assert.equal(g.hurts, 0);
  assert.equal(g.score, 0);
});

test('Seitlicher Kontakt zündet den Zischer statt den Spieler direkt zu verletzen', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zischer', 300);
  g.player = createPlayer(300, GROUND);
  step(g, 1, GROUND);
  assert.equal(m.state, 'fuse');
  assert.equal(m.fuse, 1.0);
  assert.equal(g.hurts, 0);
  assert.equal(m.dead, false);
});

test('Pfeil tötet den Zischer ohne Explosion', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'zischer', 300);
  step(g);
  hitMob(g, m, 'arrow');
  assert.equal(m.dead, true);
  assert.equal(g.score, 100);
  step(g, 200);
  assert.ok(!g.events.includes('explode'));
  assert.equal(g.hurts, 0);
  assert.equal(g.mobs.length, 0);
});

test('Silberfischchen läuft flink (75 px/s) auf den Spieler zu', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'silverfish', 100);
  step(g);
  assert.equal(m.face, -1);
  const x0 = m.x;
  step(g, 59); // ca. 0,5 s
  assert.ok(Math.abs((x0 - m.x) - 37.5) < 1, `Strecke ${x0 - m.x}`);
});

test('Silberfischchen verletzt bei seitlichem Kontakt und stirbt beim Stampfen', () => {
  const g = makeGame({}, [20, GROUND]);
  const m = spawn(g, 'silverfish', 40);
  let guard = 0;
  while (g.hurts === 0 && guard++ < 100) step(g);
  assert.ok(g.hurts >= 1, 'Spieler verletzt');
  assert.equal(m.dead, false);

  const g2 = makeGame({}, [20, GROUND]);
  const s = spawn(g2, 'silverfish', 300);
  g2.player = createPlayer(300, s.y + 4);
  g2.player.vy = 200;
  step(g2, 1, s.y);
  assert.equal(s.dead, true);
  assert.equal(g2.hurts, 0);
  assert.equal(g2.score, 100);
});

// Spawner bei Spalte 30, Reihe 10; Spieler 5 Kacheln entfernt (in Reichweite).
function spawners(g, n) {
  for (let i = 0; i < n; i++) updateSpawners(g, DT);
}

test('Spawner erzeugt nach 4 s einen Zombie über sich, nicht früher', () => {
  const g = makeGame({ '30,10': 'M' }, [400, GROUND]);
  spawners(g, 470); // ca. 3,9 s
  assert.equal(g.mobs.length, 0);
  spawners(g, 20); // ca. 4,1 s
  assert.equal(g.mobs.length, 1);
  const m = g.mobs[0];
  assert.equal(m.type, 'zombie');
  assert.equal(m.x + m.w / 2, 30.5 * T);
  assert.equal(m.y + m.h, 10 * T, 'steht auf der Zelle über dem Spawner');
  assert.ok(g.events.includes('spawn'));
});

test('Spawner hält höchstens 3 lebende Mobs und wechselt die Typen ab', () => {
  const g = makeGame({ '30,10': 'M' }, [400, GROUND]);
  spawners(g, 120 * 30); // 30 s
  assert.equal(g.mobs.length, 3);
  assert.deepEqual(g.mobs.map((m) => m.type), ['zombie', 'skeleton', 'zombie']);
});

test('Spawner ersetzt einen getöteten Mob beim nächsten Takt', () => {
  const g = makeGame({ '30,10': 'M' }, [400, GROUND]);
  spawners(g, 120 * 13); // Mobs bei 4, 8 und 12 s
  assert.equal(g.mobs.length, 3);
  killMob(g, g.mobs[0], 'arrow');
  spawners(g, 120 * 4); // nächster Takt bei 16 s
  assert.equal(g.mobs.filter((m) => !m.dead).length, 3);
  assert.equal(g.mobs.length, 4, 'ein neuer Mob, der tote ist noch nicht entfernt');
});

test('Spawner erzeugt nichts außerhalb von 10 Kacheln', () => {
  const g = makeGame({ '30,10': 'M' }, [20, GROUND]); // ca. 29 Kacheln entfernt
  spawners(g, 120 * 20);
  assert.equal(g.mobs.length, 0);
});

test('Spawner weicht seitlich aus, wenn die Zelle darüber fest ist', () => {
  const g = makeGame({ '30,10': 'M', '30,9': '#' }, [400, GROUND]);
  spawners(g, 120 * 5);
  assert.equal(g.mobs.length, 1);
  const m = g.mobs[0];
  assert.equal(m.x + m.w / 2, 29.5 * T, 'links vom Spawner');
  assert.equal(m.y + m.h, 11 * T, 'Fuß auf der Spawner-Reihe');
});

test('Abgebauter Spawner verschwindet und erzeugt keine Mobs mehr', () => {
  const g = makeGame({ '30,10': 'M' }, [400, GROUND]);
  spawners(g, 10);
  assert.equal(g.spawners.length, 1);
  breakTile(g, 30, 10, 'dig');
  spawners(g, 120 * 20);
  assert.equal(g.spawners.length, 0);
  assert.equal(g.mobs.length, 0);
});
