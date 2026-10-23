import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { Game } from '../js/game/game.js';
import { createBoss, updateBoss, damageBoss } from '../js/game/bosses.js';
import { explode } from '../js/game/explode.js';

const T = PHYS.tile;
const DT = 1 / 60;
const STEP = PHYS.step;
const COLS = 60;
const ROWS = 14;
const BOSS_C = 40;           // Spalte des Spawns '@'
const GROUND_Y = 12 * T;     // Oberkante der Standzeile (Zeile 12 = S)
const FAR_X = 400;           // Spieler weit weg von der Arena (Parkposition)

// Arena: Zeile 12 fest (S), Zeile 13 Grundgestein (Z), sonst Luft. P links, F rechts, '@' in der Mitte.
function makeRows(cells = {}) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let s = '';
    for (let c = 0; c < COLS; c++) {
      const key = `${c},${r}`;
      if (key in cells) s += cells[key];
      else if (r === ROWS - 1) s += 'Z';
      else if (r === ROWS - 2) s += 'S';
      else s += '.';
    }
    rows.push(s);
  }
  return rows;
}

function makeGame(save = { lives: 99, power: 'bow' }) {
  const events = [];
  const rows = makeRows({ '2,11': 'P', '58,11': 'F', [`${BOSS_C},11`]: '@' });
  const game = new Game({
    level: { id: 'test', theme: 'overworld', rows, boss: 'slimeking' },
    save,
    onEvent: (name, data) => events.push({ name, data }),
  });
  game.locks = 0;
  game.lockArena = () => { game.locks++; };
  const count = (name) => events.filter((e) => e.name === name).length;
  return { game, events, count };
}

function input(over = {}) {
  return {
    left: false, right: false, jump: false, dig: false, fire: false,
    jumpPressed: false, digPressed: false, firePressed: false, ...over,
  };
}

function run(game, steps, dt = DT) {
  for (let i = 0; i < steps; i++) game.update(dt, input());
}

// Boss aktivieren: Spieler knapp innerhalb der Arena-Grenze, ein Schritt.
function activate(game) {
  const b = game.boss;
  game.player.x = b.x - 20 * T + 1;
  game.update(DT, input());
  assert.equal(b.state, 'fight');
  return b;
}

// Spieler stellt sich weit weg von der Arena auf den Boden.
function park(game) {
  const p = game.player;
  p.x = FAR_X;
  p.y = GROUND_Y - p.h;
  p.vy = 0;
  p.onGround = true;
}

// Alle Teile einfrieren (kein Hüpfen, keine Berührung mit dem Spieler).
function freeze(game) {
  for (const part of game.boss.parts) part.hopT = 1e9;
}

// Spieler fällt von oben auf ein Teil: Füße knapp über der Oberkante, dann ein Schritt.
function stompOn(game, part) {
  const p = game.player;
  part.hopT = 1e9;
  p.x = part.x + part.w / 2 - p.w / 2;
  p.y = part.y - p.h - 1;
  p.vy = 300;
  p.onGround = false;
  game.update(DT, input());
}

// Kurz warten, bis die Unverwundbarkeit frischer Teile abgelaufen ist (Teile bleiben eingefroren).
function waitInvuln(game) {
  freeze(game);
  park(game);
  run(game, 40);
}

test('createBoss: Felder für den Renderer, Fehler bei unbekanntem Typ', () => {
  const b = createBoss('slimeking', 100, 200);
  assert.equal(b.kind, 'slimeking');
  assert.equal(b.state, 'idle');
  assert.equal(b.active, false);
  assert.equal(b.w, 48);
  assert.equal(b.h, 48);
  assert.equal(b.x, 100 - 24);
  assert.equal(b.y, 200 - 48);
  assert.equal(b.parts.length, 1);
  assert.equal(b.parts[0].size, 'l');
  assert.equal(b.parts[0].anim, 'boss_slime_l');
  assert.equal(typeof b.update, 'function');
  assert.equal(typeof b.damage, 'function');
  assert.throws(() => createBoss('gibtsnicht', 0, 0), /Unbekannter/);
});

test('Parser-Spawn @ erzeugt den Boss des Levels', () => {
  const { game } = makeGame();
  assert.ok(game.boss);
  assert.equal(game.boss.kind, 'slimeking');
  assert.equal(game.mobs.some((m) => m.type === 'boss'), false);
});

test('Boss wird erst aktiv, wenn der Spieler die Arena betritt', () => {
  const { game, count } = makeGame();
  const b = game.boss;
  run(game, 240);
  assert.equal(b.state, 'idle');
  assert.equal(b.active, false);
  assert.equal(count('bossStart'), 0);

  game.player.x = b.x - 20 * T - 2;
  game.update(DT, input());
  assert.equal(b.state, 'idle');

  game.player.x = b.x - 20 * T + 1;
  game.update(DT, input());
  assert.equal(b.state, 'fight');
  assert.equal(b.active, true);
  assert.equal(count('bossStart'), 1);
  assert.equal(game.locks, 1);
});

test('Teile hüpfen zum Spieler hin', () => {
  const { game } = makeGame();
  const b = activate(game);
  const part = b.parts[0];
  const x0 = part.x;
  let hops = 0;
  let wasGround = part.onGround;
  for (let i = 0; i < 180; i++) {   // 3 s
    game.update(DT, input());
    if (wasGround && !part.onGround) hops++;
    wasGround = part.onGround;
  }
  assert.ok(hops >= 1, 'mindestens ein Sprung in 3 s');
  assert.ok(part.x < x0 - 20, 'Teil ist nach links zum Spieler gewandert');
});

test('Stampfer auf großes Teil: 2 × mittel, Abprall, Punkte', () => {
  const { game, count } = makeGame();
  const b = activate(game);
  const big = b.parts[0];
  const score0 = game.score;
  stompOn(game, big);

  assert.equal(b.parts.length, 2);
  assert.ok(b.parts.every((p) => p.size === 'm' && p.w === 32 && p.h === 32));
  assert.ok(b.parts[0].vx < 0 && b.parts[1].vx > 0, 'mittlere Teile fliegen auseinander');
  assert.ok(b.parts.every((p) => p.vy === -250));
  assert.ok(b.parts.every((p) => p.invuln > 0), 'neue Teile sind kurz unverwundbar');
  assert.equal(game.player.vy, -PHYS.stompBounce);
  assert.equal(game.score - score0, 500);
  assert.ok(count('bossHit') >= 1);
  assert.equal(b.state, 'fight');
});

test('Stampfer auf mittleres Teil: 2 Schleim-Mobs (fromBoss)', () => {
  const { game } = makeGame();
  const b = activate(game);
  stompOn(game, b.parts[0]);
  waitInvuln(game);

  const part = b.parts[0];
  const before = game.mobs.length;
  stompOn(game, part);

  assert.equal(b.parts.length, 1, 'ein mittleres Teil bleibt');
  const boss = game.mobs.slice(before).filter((m) => m.fromBoss);
  assert.equal(boss.length, 2);
  assert.ok(boss.every((m) => m.type === 'slimeSmall' && m.active && !m.dead));
  assert.ok(boss[0].x < boss[1].x, 'Schleime liegen links und rechts der Mitte');
});

test('Seitlicher Kontakt verletzt den Spieler, Teil bleibt', () => {
  const { game } = makeGame();
  const b = activate(game);
  const part = b.parts[0];
  freeze(game);
  const hurts = [];
  game.hurtPlayer = (cause) => hurts.push(cause);
  const p = game.player;
  p.x = part.x - p.w + 2;            // 2 px Überlappung von links
  p.y = part.y + 10;                 // Füße tief im Teil: kein Stampfen
  p.vy = 0;
  game.update(DT, input());
  assert.deepEqual(hurts, ['boss']);
  assert.equal(b.parts.length, 1);
});

test('Pfeil teilt das größte Teil, unverwundbar bis der Schutz abläuft', () => {
  const { game, count } = makeGame();
  const b = activate(game);
  damageBoss(game, 'arrow');
  assert.equal(b.parts.length, 2);
  assert.ok(b.parts.every((p) => p.size === 'm'));
  assert.ok(count('bossHit') >= 1);

  game.damageBoss('arrow');          // Teile noch unverwundbar
  assert.equal(b.parts.length, 2);

  waitInvuln(game);
  game.damageBoss('arrow');
  assert.equal(b.parts.length, 1);
  assert.equal(game.mobs.filter((m) => m.fromBoss).length, 2);
});

test('Explosion im Körper des Bosses teilt ihn', () => {
  const { game } = makeGame();
  const b = activate(game);
  freeze(game);
  park(game);
  explode(game, b.x + b.w / 2, b.y + b.h / 2, 2.5);
  assert.equal(b.parts.length, 2);
  assert.ok(b.parts.every((p) => p.size === 'm'));
});

test('Besiegt, wenn keine Teile und keine Boss-Schleime mehr leben', () => {
  const { game, count } = makeGame();
  const b = activate(game);
  let defeats = 0;
  const orig = game.defeatBoss.bind(game);
  game.defeatBoss = () => { defeats++; orig(); };

  damageBoss(game, 'arrow');         // l → 2 m
  waitInvuln(game);
  game.damageBoss('arrow');          // m → 2 Schleime
  waitInvuln(game);
  game.damageBoss('arrow');          // m → 2 Schleime, keine Teile mehr
  assert.equal(b.parts.length, 0);
  assert.equal(b.state, 'fight', 'Schleime leben noch');
  assert.equal(defeats, 0);

  const boss = game.mobs.filter((m) => m.fromBoss);
  assert.equal(boss.length, 4);
  for (const m of boss) game.killMob(m, 'explosion');
  run(game, 1);

  assert.equal(b.state, 'defeated');
  assert.equal(b.active, false);
  assert.equal(game.bossDefeated, true);
  assert.equal(defeats, 1);
  assert.equal(count('bossHit') >= 4, true);
  assert.ok(game.score >= 1500 + 5000);

  // Nach dem Sieg macht der Boss nichts mehr.
  const score = game.score;
  run(game, 30);
  assert.equal(b.state, 'defeated');
  assert.equal(defeats, 1);
  assert.equal(game.score, score);
});

test('Bot besiegt die Arena in unter 60 s (Schritt 1/120, updatePlayer)', () => {
  const { game } = makeGame({ lives: 99, power: 'bow' });
  const JUMP_NEAR = 40;   // px Abstand, ab dem der Bot aus dem Stand springt (Sprung landet auf dem Teil)
  const JUMP_FAR = 60;

  // Ziel: größtes lebendes Teil, sonst der nächste Schleim aus dem Boss. Vor der Arena nach rechts laufen.
  function botInput() {
    const p = game.player;
    const b = game.boss;
    const inp = input();
    if (b.state === 'idle') {
      inp.right = true;
      return inp;
    }
    let target = null;
    for (const part of b.parts) {
      if (!part.gone && (target === null || part.w > target.w)) target = part;
    }
    if (!target) {
      let best = Infinity;
      for (const m of game.mobs) {
        if (!m.fromBoss || m.dead) continue;
        const d = Math.abs(m.x + m.w / 2 - (p.x + p.w / 2));
        if (d < best) { best = d; target = m; }
      }
    }
    if (!target) return inp;
    const dx = (target.x + target.w / 2) - (p.x + p.w / 2);
    const adx = Math.abs(dx);
    if (!p.onGround) {
      // In der Luft auf das Ziel zu und den Sprung bis zum Scheitel halten.
      inp.left = dx < 0;
      inp.right = dx > 0;
      inp.jump = p.vy < 0;
    } else if (adx > JUMP_FAR) {
      inp.left = dx < 0;
      inp.right = dx > 0;
    } else if (adx >= JUMP_NEAR) {
      inp.jump = true;
      inp.jumpPressed = true;
      inp.left = dx < 0;
      inp.right = dx > 0;
    }
    return inp;
  }

  const maxSteps = 60 / STEP;
  let steps = 0;
  while (game.boss.state !== 'defeated' && steps < maxSteps) {
    game.update(STEP, botInput());
    steps++;
  }
  assert.equal(game.boss.state, 'defeated', `nicht besiegt nach ${(steps * STEP).toFixed(1)} s (Leben ${game.lives}, Zustand ${game.state})`);
  assert.ok(steps * STEP < 60);
});
