import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { TILE_IDS } from '../js/data/tiles.js';
import { parseLevel } from '../js/game/level.js';
import { updateDig, breakTile, headBreak } from '../js/game/dig.js';

const T = PHYS.tile;
const DT = 1 / 120;
const AIR = TILE_IDS.air;
const DIG = { left: false, right: false, jump: false, dig: true };
const DIG_RIGHT = { left: false, right: true, jump: false, dig: true };
const DIG_LEFT = { left: true, right: false, jump: false, dig: true };
const IDLE = { left: false, right: false, jump: false, dig: false };

// Mock-Spiel mit echter Karte (parseLevel). 16×10, Zeile 9 Grundgestein, Zeile 0 P/F.
function makeGame(pick = 0) {
  const cols = 16, R = 10;
  const rows = [];
  for (let r = 0; r < R; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) {
      if (r === R - 1) s += 'Z';
      else if (r === 0 && c === 1) s += 'P';
      else if (r === 0 && c === 14) s += 'F';
      else s += '.';
    }
    rows.push(s);
  }
  const map = parseLevel({ id: 'dig-test', theme: 'overworld', rows });
  return {
    map,
    pick,
    time: 0,
    player: { x: 0, y: 0, w: PHYS.player.w, h: PHYS.player.h, face: 1, onGround: true, climbing: false, digging: false },
    dirty: 0,
    lightDirty: false,
    emeralds: 0,
    diamonds: [],
    mobs: [],
    tnt: [],
    chests: [],
    falling: [],
    debris: 0,
    events: [],
    emit(name) { this.events.push({ name, t: this.time }); },
    markDirty() { this.dirty++; },
    addEmeralds(n) { this.emeralds += n; },
    collectDiamondAt(c, r) { this.diamonds.push([c, r]); },
    spawnMob(type, x, y) { this.mobs.push({ type, x, y }); },
    igniteTnt(c, r, fuse) { this.tnt.push({ c, r, fuse }); map.set(c, r, AIR); },
    openChest(c, r) { this.chests.push([c, r]); map.set(c, r, TILE_IDS.chestopen); },
    startFalling(c, r) { this.falling.push([c, r]); },
    spawnDebris() { this.debris++; },
  };
}

// Spieler steht auf Zeile 7 in Spalte c: Füße auf Zeile 6, Kopf auf Zeile 5 (Ziel unter den Füßen: (c, 7)).
function standAt(game, c) {
  const p = game.player;
  p.x = c * T + 2;     // Körper 12 breit, mittig in Spalte c
  p.y = 7 * T - p.h;   // Füße an der Oberkante von Zeile 7
  p.vx = 0;
  p.vy = 0;
}

function set(game, c, r, kind) {
  game.map.set(c, r, TILE_IDS[kind]);
}

// Simuliert bis pred() true wird (höchstens maxSec). Gibt die Anzahl Schritte zurück oder -1.
function until(game, input, maxSec, pred) {
  const n = Math.round(maxSec / DT);
  for (let i = 1; i <= n; i++) {
    game.time += DT;
    updateDig(game, DT, input);
    if (pred()) return i;
  }
  return -1;
}

function run(game, input, sec) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) {
    game.time += DT;
    updateDig(game, DT, input);
  }
}

test('nach unten: Erde mit Holzhacke bricht nach 0,3 s', () => {
  const g = makeGame(0);
  standAt(g, 5);
  set(g, 5, 7, 'dirt');
  const steps = until(g, DIG, 1, () => g.map.get(5, 7) === AIR);
  assert.ok(steps >= 36 && steps <= 37, `Schritte: ${steps}`);
  assert.ok(g.dirty >= 1);
  assert.equal(g.lightDirty, true);
  assert.ok(g.events.some((e) => e.name === 'dig'));
  assert.ok(g.events.some((e) => e.name === 'break'));
});

test('seitlich: erst Füße, dann Kopf', () => {
  const g = makeGame(0);
  standAt(g, 5);
  set(g, 6, 6, 'dirt');   // Fußzeile
  set(g, 6, 5, 'dirt');   // Kopfzeile
  const first = until(g, DIG_RIGHT, 1, () => g.map.get(6, 6) === AIR);
  assert.ok(first > 0);
  assert.equal(g.map.get(6, 5), TILE_IDS.dirt, 'Kopfzeile darf nicht zuerst fallen');
  const second = until(g, DIG_RIGHT, 1, () => g.map.get(6, 5) === AIR);
  assert.ok(second > 0, 'Kopf wird danach gegraben');
});

test('seitlich: Kopf, wenn die Fußzeile leer ist', () => {
  const g = makeGame(0);
  standAt(g, 5);
  set(g, 6, 5, 'dirt');   // rechts, nicht relevant
  run(g, DIG_LEFT, 0.5);  // links: Füße (4,6) und Kopf (4,5) leer → kein Ziel
  assert.equal(g.dig.active, false);
  assert.equal(g.dig.progress, 0);
  set(g, 4, 5, 'dirt');
  const s2 = until(g, DIG_LEFT, 1, () => g.map.get(4, 5) === AIR);
  assert.ok(s2 >= 36 && s2 <= 37, `Schritte: ${s2}`);
});

test('Stein: Diamanthacke (0,8 × 0,35) schneller als Holzhacke', () => {
  const fast = makeGame(3);
  standAt(fast, 5);
  set(fast, 5, 7, 'stone');
  const sFast = until(fast, DIG, 2, () => fast.map.get(5, 7) === AIR);
  assert.equal(sFast, 34, `Diamant: ${sFast} Schritte`);

  const slow = makeGame(0);
  standAt(slow, 5);
  set(slow, 5, 7, 'stone');
  const sSlow = until(slow, DIG, 2, () => slow.map.get(5, 7) === AIR);
  assert.ok(sSlow >= 96 && sSlow <= 97, `Holz: ${sSlow} Schritte`);
});

test('Obsidian mit Eisenhacke: kein Fortschritt, digFail höchstens alle 0,5 s', () => {
  const g = makeGame(2);
  standAt(g, 5);
  set(g, 5, 7, 'obsidian');
  run(g, DIG, 2);
  assert.equal(g.map.get(5, 7), TILE_IDS.obsidian);
  assert.equal(g.dig.progress, 0);
  assert.equal(g.dirty, 0);
  const fails = g.events.filter((e) => e.name === 'digFail').map((e) => e.t);
  assert.ok(fails.length >= 3, `digFail: ${fails.length}`);
  for (let i = 1; i < fails.length; i++) {
    assert.ok(fails[i] - fails[i - 1] >= 0.5 - 0.01, `Abstand ${fails[i] - fails[i - 1]}`);
  }
});

test('Obsidian mit Diamanthacke bricht nach 1,05 s', () => {
  const g = makeGame(3);
  standAt(g, 5);
  set(g, 5, 7, 'obsidian');
  const steps = until(g, DIG, 2, () => g.map.get(5, 7) === AIR);
  assert.ok(steps >= 125 && steps <= 127, `Schritte: ${steps}`);
});

test('Grundgestein wird nie abgebaut', () => {
  const g = makeGame(3);
  standAt(g, 5);
  set(g, 5, 7, 'bedrock');
  run(g, DIG, 5);
  assert.equal(g.map.get(5, 7), TILE_IDS.bedrock);
  assert.equal(g.dirty, 0);
  assert.equal(g.events.filter((e) => e.name === 'break').length, 0);
});

test('Kohle gibt 1 Smaragd, Gold 5 (mit passender Hacke)', () => {
  const coal = makeGame(0);
  standAt(coal, 5);
  set(coal, 5, 7, 'coal');
  until(coal, DIG, 2, () => coal.map.get(5, 7) === AIR);
  assert.equal(coal.emeralds, 1);

  const gold = makeGame(2);
  standAt(gold, 5);
  set(gold, 5, 7, 'gold');
  until(gold, DIG, 2, () => gold.map.get(5, 7) === AIR);
  assert.equal(gold.emeralds, 5);
});

test('Eisenerz braucht Eisenhacke (minPick 1) und gibt 3 Smaragde', () => {
  const low = makeGame(0);
  standAt(low, 5);
  set(low, 5, 7, 'iron');
  run(low, DIG, 2);
  assert.equal(low.map.get(5, 7), TILE_IDS.iron);
  assert.equal(low.emeralds, 0);

  const ok = makeGame(1);
  standAt(ok, 5);
  set(ok, 5, 7, 'iron');
  until(ok, DIG, 3, () => ok.map.get(5, 7) === AIR);
  assert.equal(ok.emeralds, 3);
});

test('Diamanterz ruft collectDiamondAt, braucht Diamanthacke-Stufe Gold (minPick 2)', () => {
  const low = makeGame(1);
  standAt(low, 5);
  set(low, 5, 7, 'diamondore');
  run(low, DIG, 2);
  assert.equal(low.map.get(5, 7), TILE_IDS.diamondore);
  assert.deepEqual(low.diamonds, []);

  const g = makeGame(2);
  standAt(g, 5);
  set(g, 5, 7, 'diamondore');
  until(g, DIG, 2, () => g.map.get(5, 7) === AIR);
  assert.deepEqual(g.diamonds, [[5, 7]]);
});

test('getarnter Stein spawnt ein Silberfischchen', () => {
  const g = makeGame(0);
  standAt(g, 5);
  set(g, 5, 7, 'infested');
  until(g, DIG, 2, () => g.map.get(5, 7) === AIR);
  assert.equal(g.mobs.length, 1);
  assert.equal(g.mobs[0].type, 'silverfish');
  assert.equal(g.mobs[0].x, 5.5 * T);
  assert.equal(g.mobs[0].y, 8 * T);
});

test('TNT ruft igniteTnt mit 2 s Zündzeit', () => {
  const g = makeGame(0);
  standAt(g, 5);
  set(g, 5, 7, 'tnt');
  until(g, DIG, 2, () => g.map.get(5, 7) === AIR);
  assert.deepEqual(g.tnt, [{ c: 5, r: 7, fuse: 2 }]);
});

test('Zielwechsel setzt den Fortschritt zurück', () => {
  const g = makeGame(0);
  standAt(g, 5);
  set(g, 5, 7, 'dirt');
  set(g, 6, 7, 'dirt');
  run(g, DIG, 0.2);
  assert.ok(g.dig.progress > 0.5);
  standAt(g, 6);
  updateDig(g, DT, DIG);
  assert.equal(g.dig.c, 6);
  assert.ok(Math.abs(g.dig.progress - DT / 0.3) < 1e-9, `progress ${g.dig.progress}`);
});

test('Loslassen setzt active, progress und stage zurück', () => {
  const g = makeGame(0);
  standAt(g, 5);
  set(g, 5, 7, 'stone');
  run(g, DIG, 0.2);
  assert.equal(g.dig.active, true);
  assert.equal(g.player.digging, true);
  updateDig(g, DT, IDLE);
  assert.equal(g.dig.active, false);
  assert.equal(g.dig.progress, 0);
  assert.equal(g.dig.stage, 0);
  assert.equal(g.player.digging, false);
});

test('stage zählt 0..3 mit dem Fortschritt', () => {
  const g = makeGame(0);
  standAt(g, 5);
  set(g, 5, 7, 'dirt');
  run(g, DIG, 0.1);
  assert.equal(g.dig.stage, 1);
  run(g, DIG, 0.1);
  assert.equal(g.dig.stage, 2);
});

test('game.dig wird beim ersten Aufruf angelegt und wiederverwendet', () => {
  const g = makeGame(0);
  standAt(g, 5);
  assert.equal(g.dig, undefined);
  updateDig(g, DT, IDLE);
  const d = g.dig;
  assert.ok(d);
  updateDig(g, DT, DIG);
  assert.equal(g.dig, d);
});

test('Sand über der gebrochenen Kachel fällt nach', () => {
  const g = makeGame(0);
  standAt(g, 5);
  set(g, 6, 6, 'dirt');
  set(g, 6, 5, 'sand');
  until(g, DIG_RIGHT, 1, () => g.map.get(6, 6) === AIR);
  assert.deepEqual(g.falling, [[6, 5]]);
});

test('kein startFalling, wenn darüber kein Sand liegt', () => {
  const g = makeGame(0);
  standAt(g, 5);
  set(g, 6, 6, 'dirt');
  set(g, 6, 5, 'stone');
  until(g, DIG_RIGHT, 1, () => g.map.get(6, 6) === AIR);
  assert.deepEqual(g.falling, []);
});

test('headBreak bricht Erde, nicht Stein', () => {
  const g = makeGame(0);
  set(g, 5, 7, 'dirt');
  assert.equal(headBreak(g, 5, 7), true);
  assert.equal(g.map.get(5, 7), AIR);

  set(g, 5, 7, 'stone');
  assert.equal(headBreak(g, 5, 7), false);
  assert.equal(g.map.get(5, 7), TILE_IDS.stone);
});

test('headBreak öffnet Truhen', () => {
  const g = makeGame(0);
  set(g, 5, 7, 'chest');
  assert.equal(headBreak(g, 5, 7), true);
  assert.deepEqual(g.chests, [[5, 7]]);
});

test('breakTile bei Explosion: Obsidian und Grundgestein bleiben, Erde fällt', () => {
  const g = makeGame(0);
  set(g, 5, 7, 'obsidian');
  assert.equal(breakTile(g, 5, 7, 'explosion'), false);
  set(g, 5, 7, 'bedrock');
  assert.equal(breakTile(g, 5, 7, 'explosion'), false);
  set(g, 5, 7, 'dirt');
  assert.equal(breakTile(g, 5, 7, 'explosion'), true);
  assert.equal(g.map.get(5, 7), AIR);
  assert.equal(breakTile(g, 5, 7, 'explosion'), false, 'Luft bricht nicht');
});
