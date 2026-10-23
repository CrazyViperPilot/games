import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { TILES, TILE_BY_ID, TILE_IDS, PICKS } from '../js/data/tiles.js';
import { parseLevel } from '../js/game/level.js';
import { moveAndCollide } from '../js/game/collide.js';
import { createPlayer, setPower, updatePlayer } from '../js/game/player.js';

const T = PHYS.tile;

// Baut ein Level aus `rows` Zeilen à `cols` Zeichen. Standard '.', Ausnahmen über `cells` ("c,r" → Zeichen).
// Unterste Zeile ist Stein (Z), damit Level gültig und der Boden fest ist.
function level(cells = {}, { cols = 12, rows = 8 } = {}) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      if (key in cells) s += cells[key];
      else s += r === rows - 1 ? 'Z' : '.';
    }
    out.push(s);
  }
  return out;
}

const BASE = { P: [1, 6], F: [10, 6], K: [3, 6] };
function baseCells(extra = {}) {
  const cells = {};
  for (const [ch, [c, r]] of Object.entries(BASE)) cells[`${c},${r}`] = ch;
  return { ...cells, ...extra };
}

test('Kachel-IDs und Lookup', () => {
  assert.equal(TILE_IDS.bedrock, 18);
  assert.equal(TILE_IDS.air, 0);
  assert.equal(TILE_IDS.spawner, 16);
  assert.equal(TILES.M.id, 16);
  assert.equal(TILES.S.art, 'blk_stone');
  assert.equal(TILE_BY_ID[40].kind, 'barrier');
  assert.equal(TILE_BY_ID[40].art, null);
  assert.equal(TILE_BY_ID[40].ch, null);
  assert.equal(TILE_BY_ID[41].kind, 'chestopen');
  assert.equal(TILE_BY_ID[41].ch, null);
  for (let x = 0; x < 64; x++) assert.ok(TILE_BY_ID[x], `TILE_BY_ID[${x}] fehlt`);
  assert.equal(TILE_BY_ID[63].kind, 'air');
});

test('Kachel-Eigenschaften nach PLAN §3', () => {
  assert.equal(TILES['='].oneWay, true);
  assert.equal(TILES['='].solid, false);
  assert.equal(TILES.H.climb, true);
  assert.equal(TILES.L.hazard, true);
  assert.equal(TILES.L.light, 15);
  assert.equal(TILES['~'].water, true);
  assert.equal(TILES.J.bounce, true);
  assert.equal(TILES.A.falls, true);
  assert.equal(TILES['4'].minPick, 2);
  assert.equal(TILES.X.minPick, 3);
  assert.equal(TILES.Z.hard, null);
  assert.equal(TILES['|'].light, 14);
  assert.equal(TILES.M.light, 3);
  assert.equal(TILES.G.climb, false);
  assert.deepEqual(TILES['1'].drop, { emeralds: 1 });
  assert.equal(TILES['4'].drop, 'diamond');
  assert.equal(TILES['5'].drop, 'silverfish');
  assert.equal(PICKS.length, 4);
  assert.equal(PICKS[3].name, 'diamond');
});

test('Parser: Kacheln, surface und Startpunkte', () => {
  const map = parseLevel({ id: 't', theme: 'overworld', rows: level(baseCells({ '4,3': '#', '5,4': 'S' })) });
  assert.equal(map.cols, 12);
  assert.equal(map.rows, 8);
  assert.ok(map.tiles instanceof Uint8Array);
  assert.equal(map.get(4, 3), TILES['#'].id);
  assert.equal(map.get(5, 4), TILES.S.id);
  assert.equal(map.get(1, 6), TILES['.'].id); // P ist keine Kachel
  assert.ok(map.surface instanceof Int16Array);
  assert.equal(map.surface[0], 7);
  assert.equal(map.surface[4], 3);
  assert.equal(map.surface[5], 4);
  assert.deepEqual(map.start, { x: 1.5 * T, y: 7 * T });
  assert.deepEqual(map.goal, { x: 10.5 * T, y: 7 * T });
  assert.deepEqual(map.checkpoint, { x: 3.5 * T, y: 7 * T });
  assert.equal(map.id, 't');
  assert.equal(map.theme, 'overworld');
  assert.deepEqual(map.chests, {});
  assert.equal(map.pick, 0);
  assert.equal(map.boss, undefined);
});

test('Parser: gems, diamonds, crystals, spawns', () => {
  const cells = baseCells({
    '2,1': 'o', '8,1': '*', '6,2': 'y',
    '2,5': 'c', '3,5': 'z', '4,5': 's', '5,5': 'r', '6,5': 'm', '7,5': 'f', '8,5': 'g', '9,5': 'e',
    '9,3': '@',
  });
  const map = parseLevel({ id: 'g', rows: level(cells) });

  assert.equal(map.gems.length, 2);
  assert.deepEqual(map.gems[0], { x: 2.5 * T, y: 2 * T, diamond: false, taken: false });
  assert.equal(map.gems[1].diamond, true);
  assert.equal(map.gems.filter((g) => g.diamond).length, 1);

  assert.deepEqual(map.crystals, [{ x: 6.5 * T, y: 3 * T }]);

  const types = map.spawns.map((s) => s.type);
  // Reihenfolge zeilenweise von oben: @ steht in Zeile 3, die Gegner in Zeile 5.
  assert.deepEqual(types, ['boss', 'zischer', 'zombie', 'skeleton', 'spider', 'slime', 'silverfish', 'glutgeist', 'leerenlaeufer']);
  assert.ok(map.spawns.every((s) => s.type !== 'crystal'), 'y darf kein Spawn sein');
  assert.deepEqual(map.spawns[0], { type: 'boss', x: 9.5 * T, y: 4 * T });
});

test('Parser: chests, pick und boss aus der Definition', () => {
  const map = parseLevel({
    id: 'c', theme: 'nether', boss: 'dreikopf', pick: 2,
    chests: { '4,6': 'bow', '5,6': 'emeralds' },
    rows: level(baseCells({ '7,3': '?' })),
  });
  assert.deepEqual(map.chests, { '4,6': 'bow', '5,6': 'emeralds' });
  assert.equal(map.pick, 2);
  assert.equal(map.boss, 'dreikopf');
  assert.equal(map.theme, 'nether');
});

test('get außerhalb der Ränder', () => {
  const map = parseLevel({ id: 'o', rows: level(baseCells(), { cols: 12, rows: 8 }) });
  assert.equal(map.get(-1, 3), TILE_IDS.bedrock);
  assert.equal(map.get(12, 3), TILE_IDS.bedrock);
  assert.equal(map.get(3, -1), TILE_IDS.bedrock);
  assert.equal(map.get(3, 8), TILE_IDS.air);
  assert.equal(map.get(3, 50), TILE_IDS.air);
  assert.equal(map.isSolid(-1, 0), true);
  assert.equal(map.isSolid(3, 8), false);
});

test('set und isSolid', () => {
  const map = parseLevel({ id: 's', rows: level(baseCells()) });
  map.set(0, 0, TILE_IDS.stone);
  assert.equal(map.get(0, 0), TILE_IDS.stone);
  assert.equal(map.isSolid(0, 0), true);
  assert.doesNotThrow(() => map.set(-1, 0, 1));
  assert.doesNotThrow(() => map.set(0, 99, 1));
});

test('Fehlerfälle werfen', () => {
  const ok = level(baseCells());
  const withCell = (key, ch) => level(baseCells({ [key]: ch }));
  assert.throws(() => parseLevel({ id: 'e', rows: level({ '10,6': 'F', '3,6': 'K' }) }), /kein P/);
  assert.throws(() => parseLevel({ id: 'e', rows: level({ '1,6': 'P', '3,6': 'K' }) }), /kein F/);
  assert.throws(() => parseLevel({ id: 'e', rows: withCell('5,6', 'P') }), /mehr als ein P/);
  assert.throws(() => parseLevel({ id: 'e', rows: withCell('5,6', 'F') }), /mehr als ein F/);
  assert.throws(() => parseLevel({ id: 'e', rows: withCell('5,6', 'K') }), /mehr als ein K/);
  assert.throws(() => parseLevel({ id: 'e', rows: withCell('5,6', 'q') }), /unbekanntes Zeichen/);
  assert.throws(() => parseLevel({ id: 'e', rows: level(baseCells({ '5,6': '@', '6,6': '@' })) }), /mehr als ein @/);
  assert.throws(() => parseLevel({ id: 'e', rows: ok.slice(0, 7) }), /Zeilen/);
  assert.throws(() => parseLevel({ id: 'e', rows: [...ok.slice(0, 7), ok[7] + '.'] }), /Zeile 7/);
  assert.throws(() => parseLevel({ id: 'e' }), /rows fehlt/);
});

// ---------- Bewegung (A2) ----------

const NONE = { left: false, right: false, jump: false, dig: false, fire: false, jumpPressed: false, digPressed: false, firePressed: false };
const inp = (o = {}) => ({ ...NONE, ...o });

// Spielwelt: P und F gesetzt, Boden = unterste Zeile (Z) bei Zeile rows-1 → Fußlinie floor = (rows-1)*T.
function world(cells = {}, { cols = 40, rows = 12, px = 2, py = 10 } = {}) {
  const all = { [`${px},${py}`]: 'P', [`${cols - 2},${py}`]: 'F', ...cells };
  const map = parseLevel({ id: 'm', theme: 'overworld', rows: level(all, { cols, rows }) });
  const events = [];
  const game = { map, events, emit: (name) => events.push(name) };
  game.player = createPlayer(map.start.x, map.start.y, 'plain');
  return game;
}
const FLOOR = (12 - 1) * T;                       // Oberkante Boden in world()
function fill(g, c0, c1, r0, r1, id) {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g.map.set(c, r, id);
}
function step(g, input = inp()) {
  return updatePlayer(g, PHYS.step, input);
}
function runFor(g, seconds, input = inp()) {
  const n = Math.round(seconds / PHYS.step);
  for (let i = 0; i < n; i++) step(g, typeof input === 'function' ? input(i) : input);
}
const feet = (p) => p.y + p.h;

test('Kollision: Körper fällt auf festen Boden, groundId = Bedrock', () => {
  const g = world({}, {});
  const body = { x: 20 * T, y: 0, w: 12, h: 26, vx: 0, vy: 0 };
  let res = null;
  for (let i = 0; i < 600 && !(res && res.onGround); i++) {
    body.vy = Math.min(body.vy + PHYS.gravity * (1 / 60), PHYS.maxFall);
    res = moveAndCollide(body, g.map, 1 / 60);
  }
  assert.equal(res.onGround, true);
  assert.equal(res.groundId, TILE_IDS.bedrock);
  assert.equal(body.y + body.h, FLOOR);
});

test('groundId: Kachel unter den Füßen, sonst 0', () => {
  const g = world({ '5,8': 'J' });
  // Körper steht auf Bedrock-Boden.
  const b1 = { x: 20 * T, y: FLOOR - 26, w: 12, h: 26, vx: 0, vy: 0 };
  assert.equal(moveAndCollide(b1, g.map, PHYS.step).groundId, TILE_IDS.bedrock);
  // Körper in der Luft.
  const b2 = { x: 20 * T, y: 2 * T, w: 12, h: 26, vx: 0, vy: 0 };
  assert.equal(moveAndCollide(b2, g.map, PHYS.step).groundId, 0);
  // Auf Schleimblock.
  const b3 = { x: 5 * T, y: 8 * T - 26, w: 12, h: 26, vx: 0, vy: 0 };
  assert.equal(moveAndCollide(b3, g.map, PHYS.step).groundId, TILE_IDS.slime);
});

test('Sprunghöhe stehend ≥ 4 Kacheln, gerannt ≥ 5', () => {
  const g = world();
  runFor(g, 0.3);
  assert.equal(g.player.onGround, true);
  let top = Infinity;
  step(g, inp({ jump: true, jumpPressed: true }));
  for (let i = 0; i < 120; i++) { step(g, inp({ jump: true })); top = Math.min(top, feet(g.player)); }
  const stand = (FLOOR - top) / T;
  assert.ok(stand >= 4, `Sprunghöhe stehend ${stand.toFixed(2)} Kacheln`);

  const g2 = world();
  runFor(g2, 0.3);
  runFor(g2, 1.0, inp({ right: true }));
  assert.ok(g2.player.runTimer >= PHYS.runDelay, 'Renntempo erreicht');
  let top2 = Infinity;
  step(g2, inp({ right: true, jump: true, jumpPressed: true }));
  for (let i = 0; i < 120; i++) { step(g2, inp({ right: true, jump: true })); top2 = Math.min(top2, feet(g2.player)); }
  const run = (FLOOR - top2) / T;
  assert.ok(run >= 5, `Sprunghöhe gerannt ${run.toFixed(2)} Kacheln`);
});

test('Rennsprung über 5er-Lücke landet auf der anderen Seite', () => {
  const cells = {};
  for (let c = 12; c <= 16; c++) cells[`${c},11`] = '.';    // Grube 5 Kacheln breit
  const g = world(cells);
  runFor(g, 0.3);
  // Anlauf nach rechts bis Kachel 10, dann springen.
  let guard = 0;
  while (g.player.x + g.player.w / 2 < 10 * T && guard++ < 600) step(g, inp({ right: true }));
  step(g, inp({ right: true, jump: true, jumpPressed: true }));
  let landedCenter = null;
  for (let i = 0; i < 400 && landedCenter === null; i++) {
    step(g, inp({ right: true, jump: true }));
    if (g.player.onGround && i > 5) landedCenter = g.player.x + g.player.w / 2;
  }
  assert.notEqual(landedCenter, null, 'Landung');
  assert.ok(landedCenter >= 17 * T, `Landung bei ${(landedCenter / T).toFixed(2)} Kacheln`);
  assert.equal(feet(g.player), FLOOR);
});

test('Coyote Time: Sprung kurz nach Kantenverlassen', () => {
  const cells = {};
  for (let c = 10; c < 40; c++) cells[`${c},11`] = '.';     // Boden endet bei Kachel 9
  const g = world(cells, { px: 8, py: 10 });
  runFor(g, 0.3);
  let guard = 0;
  while (g.player.onGround && guard++ < 300) step(g, inp({ right: true }));
  assert.equal(g.player.onGround, false);
  step(g, inp({ jump: true, jumpPressed: true }));
  assert.ok(g.player.vy < -200, `Coyote-Sprung vy=${g.player.vy}`);
});

test('Coyote Time: nach 0,15 s in der Luft kein Sprung', () => {
  const cells = {};
  for (let c = 10; c < 40; c++) cells[`${c},11`] = '.';
  const g = world(cells, { px: 8, py: 10 });
  runFor(g, 0.3);
  let guard = 0;
  while (g.player.onGround && guard++ < 300) step(g, inp({ right: true }));
  runFor(g, 0.15);
  step(g, inp({ jump: true, jumpPressed: true }));
  assert.ok(g.player.vy > 0, `kein Sprung erwartet, vy=${g.player.vy}`);
});

test('Jump Buffer: Druck kurz vor Landung springt nach der Landung', () => {
  const g = world({}, { px: 2, py: 6 });
  let guard = 0;
  while (feet(g.player) < FLOOR - 6 && guard++ < 300) step(g);
  step(g, inp({ jumpPressed: true, jump: true }));
  let minFeet = feet(g.player);
  for (let i = 0; i < 120; i++) { step(g, inp({ jump: true })); minFeet = Math.min(minFeet, feet(g.player)); }
  assert.ok((FLOOR - minFeet) / T >= 3, 'Sprung nach Landung ausgelöst');
});

test('Jump Buffer: Druck 0,3 s vor Landung springt nicht', () => {
  const g = world({}, { px: 2, py: 2 });
  let guard = 0;
  while (feet(g.player) < 4 * T && guard++ < 300) step(g);       // Höhe ~ 2 Kacheln über dem Ziel
  const f0 = feet(g.player);
  step(g, inp({ jumpPressed: true }));
  let minFeet = feet(g.player);
  for (let i = 0; i < 120; i++) { step(g); minFeet = Math.min(minFeet, feet(g.player)); }
  assert.equal(feet(g.player), FLOOR);
  assert.ok(minFeet >= f0 - 1e-6, `kein Sprung erwartet, minFeet=${minFeet}, Start=${f0}`);
});

test('Plattform "=" nur von oben: durchspringbar, von oben begehbar', () => {
  const g = world({ '5,8': '=' }, { px: 5, py: 10 });
  runFor(g, 0.3);
  let top = Infinity;
  step(g, inp({ jump: true, jumpPressed: true }));
  for (let i = 0; i < 120; i++) { step(g, inp({ jump: true })); top = Math.min(top, feet(g.player)); }
  assert.ok(top <= 8 * T - 4, `Sprung durch Plattform, Fuß bei ${top}`);

  const g2 = world({ '5,8': '=' }, { px: 5, py: 6 });
  runFor(g2, 0.5);
  assert.equal(g2.player.onGround, true);
  assert.equal(feet(g2.player), 8 * T, 'Landung auf Plattform');
});

test('Leiter: hoch mit Sprung, runter mit Graben, Klettern ohne Schwerkraft', () => {
  const g = world({}, { px: 6, py: 10 });
  fill(g, 6, 6, 2, 10, TILE_IDS.ladder);
  runFor(g, 0.3);
  const y0 = g.player.y;
  runFor(g, 0.8, inp({ jump: true }));
  assert.equal(g.player.climbing, true);
  assert.equal(g.player.anim, 'climb');
  assert.ok(y0 - g.player.y >= 40, `hoch geklettert ${y0 - g.player.y}px`);

  // Runter: oben in der Leiter starten, Graben halten.
  const g2 = world({}, { px: 6, py: 10 });
  fill(g2, 6, 6, 2, 10, TILE_IDS.ladder);
  g2.player.y = 2 * T;
  runFor(g2, 2.0, inp({ dig: true }));
  assert.equal(g2.player.onGround, true, 'unten angekommen');
  assert.equal(feet(g2.player), FLOOR);
});

test('Leiter: Festhalten beim Fallen (vy > 0 in der Leiter stoppt den Fall)', () => {
  const g = world({}, { px: 6, py: 10 });
  fill(g, 6, 6, 2, 10, TILE_IDS.ladder);
  g.player.y = 3 * T;
  runFor(g, 0.5);
  assert.equal(g.player.climbing, true);
  assert.equal(g.player.vy, 0);
  assert.ok(Math.abs(g.player.y - 3 * T) < 0.5, `Festhalten, y=${g.player.y}`);
});

test('Wasser: sinkt langsamer als maxFall, Schwimmzug hebt an, Splash', () => {
  const g = world({}, { px: 2, py: 4 });
  fill(g, 1, 38, 2, 10, TILE_IDS.water);
  step(g);
  assert.equal(g.player.inWater, true);
  assert.ok(g.events.includes('splash'), 'splash-Ereignis');
  const y0 = g.player.y;
  runFor(g, 1.0);
  assert.ok(g.player.vy <= PHYS.water.maxFall + 1e-6, `vy=${g.player.vy} über maxFall`);
  assert.ok(g.player.vy > 0);
  assert.ok(g.player.y - y0 < 120, `Fall im Wasser ${g.player.y - y0}px`);
  step(g, inp({ jumpPressed: true }));
  assert.ok(g.player.vy < 0, 'Schwimmzug');
  const y1 = g.player.y;
  runFor(g, 0.3);
  assert.ok(g.player.y < y1 - 10, 'steigt nach Schwimmzug');
  assert.equal(g.events.filter((e) => e === 'splash').length, 1, 'splash nur beim Eintauchen');
});

test('Schleimblock: Fall aus 4 Kacheln schleudert ≥ 7 Kacheln hoch', () => {
  const g = world({}, { px: 6, py: 6 });
  g.map.set(6, 11, TILE_IDS.slime);
  let guard = 0;
  while (g.player.vy < 200 || guard === 0) { step(g); if (++guard > 300) break; }
  let prev = 0;
  for (let i = 0; i < 400 && g.player.vy >= -200; i++) { step(g); prev++; }
  // Nach der Landung: Aufstieg messen.
  step(g);
  assert.ok(g.player.vy < -200, `Schleim-Sprung vy=${g.player.vy}`);
  let minFeet = feet(g.player);
  for (let i = 0; i < 200; i++) { step(g); minFeet = Math.min(minFeet, feet(g.player)); }
  const h = (FLOOR - minFeet) / T;
  assert.ok(h >= 7, `Schleim-Höhe ${h.toFixed(2)} Kacheln`);
});

test('Animation: dig am Boden, Klettern, Wasser; Power ändert nur power', () => {
  const g = world();
  runFor(g, 0.3);
  g.player.digging = true;
  step(g);
  assert.equal(g.player.anim, 'dig');
  g.player.digging = false;
  step(g);
  assert.equal(g.player.anim, 'stand');

  const p = createPlayer(10, 50, 'plain');
  const w0 = p.w, h0 = p.h, x0 = p.x, y0 = p.y;
  setPower(p, 'bow');
  assert.equal(p.power, 'bow');
  assert.deepEqual([p.w, p.h, p.x, p.y], [w0, h0, x0, y0]);
  assert.deepEqual([w0, h0], [PHYS.player.w, PHYS.player.h]);
});
