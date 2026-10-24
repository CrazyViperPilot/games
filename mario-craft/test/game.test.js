import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { TILE_IDS } from '../js/data/tiles.js';
import { Game } from '../js/game/game.js';

const T = PHYS.tile;
const DT = 1 / 60;
const GROUND_FEET = 176;   // Fußlinie, wenn der Spieler auf Zeile 11 steht (Zelle 10 ist die Standzeile)

// Mini-Level: Luft, unterste Zeile Grundgestein (Z). `ground` ersetzt die Zeile darüber (Standfläche),
// `cells` überschreibt Zellen ("c,r" → Zeichen). P und F stehen auf `start` und `goal` (Zelle c,r).
function makeLevel({ cols = 40, rows = 12, ground = null, cells = {}, start = [2, 10], goal = [38, 10], ...rest } = {}) {
  const g = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      let ch = r === rows - 1 ? 'Z' : '.';
      if (ground && r === rows - 2) ch = ground;
      row.push(ch);
    }
    g.push(row);
  }
  for (const [key, ch] of Object.entries(cells)) {
    const [c, r] = key.split(',').map(Number);
    g[r][c] = ch;
  }
  g[start[1]][start[0]] = 'P';
  g[goal[1]][goal[0]] = 'F';
  return { id: 'test', theme: 'overworld', rows: g.map((row) => row.join('')), ...rest };
}

function makeGame(opts = {}, save = undefined) {
  const events = [];
  const game = new Game({
    level: makeLevel(opts),
    save,
    onEvent: (name, data) => events.push({ name, data }),
  });
  return {
    game,
    events,
    has: (name) => events.some((e) => e.name === name),
    find: (name) => events.find((e) => e.name === name),
  };
}

function input(over = {}) {
  return {
    left: false, right: false, jump: false, dig: false, fire: false,
    jumpPressed: false, digPressed: false, firePressed: false, ...over,
  };
}

function run(game, inp, n) {
  for (let i = 0; i < n; i++) game.update(DT, inp);
}

// Schritte, bis pred() wahr ist (max. `max`). Gibt die Anzahl der Schritte zurück.
function runUntil(game, inp, pred, max = 1200) {
  for (let i = 0; i < max; i++) {
    game.update(DT, inp);
    if (pred()) return i + 1;
  }
  assert.fail(`Bedingung nach ${max} Schritten nicht erreicht (state=${game.state})`);
}

test('Pools werden im Konstruktor mit PLAN-Größen angelegt', () => {
  const { game } = makeGame();
  assert.equal(game.projectiles.length, 16);
  assert.equal(game.pickups.length, 16);
  assert.equal(game.particles.length, 96);
  assert.equal(game.falling.length, 8);
  assert.equal(game.tnt.length, 8);
  assert.equal(game.dirty.length, 256);
  assert.ok(game.light instanceof Uint8Array);
});

test('Spieler steht auf dem Boden', () => {
  const { game } = makeGame({ ground: 'S' });
  run(game, input(), 30);
  const p = game.player;
  assert.equal(game.state, 'play');
  assert.equal(p.onGround, true);
  assert.ok(Math.abs(p.y + p.h - GROUND_FEET) < 0.5);
});

test('Spieler fällt auf den Boden', () => {
  const { game } = makeGame({ start: [2, 5] });
  run(game, input(), 120);
  const p = game.player;
  assert.equal(p.onGround, true);
  assert.ok(Math.abs(p.y + p.h - GROUND_FEET) < 0.5);
});

test('Kamera folgt vertikal im hohen Level (40 Zeilen)', () => {
  const { game } = makeGame({ rows: 40, cols: 40, start: [2, 38], goal: [38, 38] });
  run(game, input(), 10);
  const p = game.player;
  const vh = game.viewH;

  // Nach oben: Spieler wird auf 40 % der Höhe gehalten.
  p.y = 100;
  game.update(DT, input());
  let cy = p.y + p.h / 2;
  assert.ok(Math.abs((cy - game.camY) - 0.4 * vh) <= 2, `oben: sy=${cy - game.camY}`);

  // Nach unten: 60 % der Höhe.
  p.y = 500;
  game.update(DT, input());
  cy = p.y + p.h / 2;
  assert.ok(Math.abs((cy - game.camY) - 0.6 * vh) <= 2, `unten: sy=${cy - game.camY}`);

  // Begrenzung unten: camY darf nicht über rows*T - viewH hinaus.
  assert.ok(game.camY <= 40 * T - vh);
});

test('Kamera folgt horizontal und hält den Spieler in der Totzone', () => {
  const { game } = makeGame({ cols: 120, goal: [118, 10] });
  run(game, input(), 10);
  const inp = input({ right: true });
  run(game, inp, 240);
  const p = game.player;
  const sx = p.x + p.w / 2 - game.camX;
  assert.ok(game.camX > 0, 'Kamera hat sich bewegt');
  assert.ok(Math.abs(sx - 0.55 * game.viewW) <= 3, `sx=${sx}`);
});

test('Smaragd wird eingesammelt', () => {
  const { game, has } = makeGame({ cells: { '2,9': 'o' } });
  game.update(DT, input());
  assert.equal(game.emeralds, 1);
  assert.ok(has('emerald'));
  assert.equal(game.map.gems[0].taken, true);
});

test('100 Smaragde ergeben ein Leben', () => {
  const { game, has } = makeGame({ cells: { '2,9': 'o' } }, { emeralds: 99, lives: 3 });
  game.update(DT, input());
  assert.equal(game.lives, 4);
  assert.equal(game.emeralds, 0);
  assert.ok(has('oneup'));
});

test('Diamant über collectDiamondAt: Gem zuerst, dann freier Platz', () => {
  const { game, has } = makeGame({ cells: { '2,9': '*' } });
  assert.equal(game.collectDiamondAt(40, 152), true);
  assert.deepEqual(game.diamonds, [true, false, false]);
  assert.equal(game.map.gems[0].taken, true);
  assert.ok(has('diamond'));

  // Kein Gem mehr in Reichweite: nächster freier Platz.
  assert.equal(game.collectDiamondAt(500, 500), true);
  assert.deepEqual(game.diamonds, [true, true, false]);

  // Bereits gesammelt: nichts passiert.
  assert.equal(game.collectDiamond(0), false);
});

test('Grube kostet ein Leben, ohne Bett Neustart am Start', () => {
  const { game, has, find } = makeGame({ cells: { '25,11': '.', '26,11': '.' } });
  const inp = input({ right: true });
  runUntil(game, inp, () => game.state !== 'play', 900);
  inp.right = false;
  assert.equal(game.state, 'dying');
  assert.equal(find('die').data.cause, 'fall');
  runUntil(game, inp, () => game.state === 'play', 300);
  assert.equal(game.lives, PHYS.lives - 1);
  const p = game.player;
  assert.ok(Math.abs(p.x + p.w / 2 - 40) < 0.5, `Start: ${p.x + p.w / 2}`);
  assert.ok(has('lifeLost'));
});

test('Bett ist Checkpoint: Neustart am Bett, Event nur einmal', () => {
  const { game, events } = makeGame({ cells: { '10,10': 'K', '25,11': '.', '26,11': '.' } });
  const inp = input({ right: true });
  runUntil(game, inp, () => events.some((e) => e.name === 'checkpoint'), 600);
  runUntil(game, inp, () => game.state !== 'play', 900);
  inp.right = false;
  runUntil(game, inp, () => game.state === 'play', 300);
  const p = game.player;
  assert.ok(Math.abs(p.x + p.w / 2 - 10.5 * T) < 0.5, `Bett: ${p.x + p.w / 2}`);
  assert.equal(events.filter((e) => e.name === 'checkpoint').length, 1);
});

test('Lava tötet sofort', () => {
  const { game, find } = makeGame({ cells: { '5,10': 'L' } }, { lives: 3 });
  const inp = input({ right: true });
  runUntil(game, inp, () => game.state !== 'play', 900);
  assert.equal(game.state, 'dying');
  assert.equal(find('die').data.cause, 'lava');
});

test('0 Leben: Game Over nach dem Sterben', () => {
  const { game, has } = makeGame({ cells: { '5,10': 'L' } }, { lives: 1 });
  const inp = input({ right: true });
  runUntil(game, inp, () => game.state === 'over', 900);
  assert.equal(game.lives, 0);
  assert.ok(has('gameOver'));
});

test('hurtPlayer: Zombie-Berührung kostet 1 Herz, bei 0 Herzen geht ein Leben verloren', () => {
  const { game, has } = makeGame({}, { power: 'plain' });
  assert.equal(game.hearts, PHYS.maxHearts);
  game.hurtPlayer('mob');
  assert.equal(game.hearts, PHYS.maxHearts - 1);
  assert.ok(game.player.invuln > 0);

  // Unverwundbar: kein weiterer Treffer.
  game.hurtPlayer('mob');
  assert.equal(game.hearts, PHYS.maxHearts - 1);

  // Explosion kostet 3 Herzen, Rüstung senkt auf 2.
  game.player.invuln = 0;
  game.hurtPlayer('explosion');
  assert.equal(game.hearts, PHYS.maxHearts - 4);
  game.player.invuln = 0;
  game.player.power = 'armor';
  game.hurtPlayer('explosion');
  assert.equal(game.hearts, PHYS.maxHearts - 6);
  assert.equal(game.player.power, 'armor', 'Rüstung bleibt erhalten');

  game.hearts = 1;
  game.player.invuln = 0;
  game.hurtPlayer('mob');
  assert.equal(game.state, 'dying');
  assert.equal(game.lives, PHYS.lives, 'Leben wird erst nach dem Timer abgezogen');
  assert.ok(has('die'));
  runUntil(game, input(), () => game.state === 'play', 2000);
  assert.equal(game.hearts, PHYS.maxHearts, 'nach dem Neustart wieder volle Herzen');
});

test('Portal-Berührung: state won und levelDone', () => {
  const { game, has, find } = makeGame({ goal: [4, 10] });
  const inp = input({ right: true });
  runUntil(game, inp, () => game.state === 'won', 300);
  const d = find('levelDone').data;
  assert.equal(game.state, 'won');
  assert.ok(d.time > 0);
  assert.equal(d.emeralds, 0);
  assert.equal(d.diamonds, 0);
  assert.equal(d.pick, 0);
  assert.equal(d.score, 0);
  assert.ok(has('portal'));
});

test('Graben unter dem Spieler bricht Erde, Spieler fällt nach', () => {
  const { game, find } = makeGame({ ground: '#', rows: 13 });
  run(game, input(), 5);
  const inp = input({ dig: true });
  runUntil(game, inp, () => game.map.get(2, 11) === TILE_IDS.air, 600);
  assert.equal(find('break').data.cause, 'dig');
  assert.equal(find('break').data.r, 11);
  assert.ok(game.dirtyCount > 0, 'Kachel als geändert markiert');
  inp.dig = false;
  run(game, inp, 60);
  const p = game.player;
  assert.equal(p.onGround, true);
  assert.ok(Math.abs(p.y + p.h - 12 * T) < 0.5, `Fall auf Zeile 12: ${p.y + p.h}`);
});

test('Bogen schießt einen Pfeil', () => {
  const { game, has } = makeGame({}, { power: 'bow' });
  game.update(DT, input({ firePressed: true }));
  assert.ok(game.projectiles.some((o) => o.active && o.type === 'arrow'));
  assert.ok(has('arrow'));
});

test('Zombie aus Spawn z wird aktiv und verletzt den Spieler', () => {
  const { game, has } = makeGame({ cells: { '20,10': 'z' } });
  game.update(DT, input());
  assert.equal(game.mobs.length, 1);
  assert.equal(game.mobs[0].type, 'zombie');
  assert.equal(game.mobs[0].active, true);
  runUntil(game, input({ right: true }), () => game.hearts < PHYS.maxHearts, 900);
  assert.equal(game.hearts, PHYS.maxHearts - 1, 'Zombie nimmt genau 1 Herz');
  assert.equal(game.state, 'play');
  assert.ok(!has('die'));
});

test('jump-Event beim Absprung', () => {
  const { game, has } = makeGame({ ground: 'S' });
  run(game, input(), 10);
  game.update(DT, input({ jump: true, jumpPressed: true }));
  assert.ok(has('jump'));
});

test('stunPlayer: Skelett-Pfeil lähmt kurz, kostet weder Leben noch Rüstung', () => {
  const { game } = makeGame({}, { power: 'armor' });
  game.stunPlayer();
  const p = game.player;
  assert.equal(p.power, 'armor');
  assert.equal(game.state, 'play');
  assert.equal(p.stun, PHYS.stunTime);
  assert.ok(p.invuln >= PHYS.stunTime, 'Schonzeit deckt die Lähmung ab');

  const inp = input({ right: true });
  const x0 = p.x;
  run(game, inp, 30);
  assert.equal(p.x, x0, 'gelähmt: läuft nicht');
  runUntil(game, inp, () => p.stun === 0, 600);
  runUntil(game, inp, () => p.x > x0 + 10, 600);
  assert.ok(p.x > x0 + 10, 'danach wieder beweglich');
});
