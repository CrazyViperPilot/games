import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { TILE_IDS } from '../js/data/tiles.js';
import { parseLevel } from '../js/game/level.js';
import {
  spawnPickup, updatePickups, openChest, startFalling, updateFalling,
  spawnDebris, spawnSmoke, updateParticles,
} from '../js/game/items.js';

const T = PHYS.tile;
const DT = 1 / 60;
const AIR = TILE_IDS.air;

// Karte 16×12: Zeile 11 Grundgestein, P und F in Zeile 0. cells: { 'c,r': Zeichen }.
function makeGame(cells = {}, chests) {
  const cols = 16, R = 12;
  const grid = [];
  for (let r = 0; r < R; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      let ch = '.';
      if (r === R - 1) ch = 'Z';
      else if (r === 0 && c === 1) ch = 'P';
      else if (r === 0 && c === 14) ch = 'F';
      row.push(ch);
    }
    grid.push(row);
  }
  for (const [key, ch] of Object.entries(cells)) {
    const [c, r] = key.split(',').map(Number);
    grid[r][c] = ch;
  }
  const map = parseLevel({ id: 'items-test', theme: 'overworld', rows: grid.map((a) => a.join('')), chests });
  return {
    map,
    time: 0,
    player: { x: T, y: T, w: PHYS.player.w, h: PHYS.player.h, star: 0, dead: false },
    emeralds: 0,
    diamonds: [],
    powers: [],
    picks: [],
    lives: 0,
    hurt: [],
    events: [],
    dirty: 0,
    lightDirty: false,
    addEmeralds(n) { this.emeralds += n; },
    collectDiamondAt(x, y) { this.diamonds.push([x, y]); },
    givePower(p) { this.powers.push(p); },
    givePick(n) { this.picks.push(n); },
    gainLife() { this.lives++; },
    hurtPlayer(cause) { this.hurt.push(cause); },
    markDirty() { this.dirty++; },
    emit(name) { this.events.push(name); },
  };
}

// Ein Zeitschritt aller Item-Module.
function step(g) {
  updatePickups(g, DT);
  updateFalling(g, DT);
  updateParticles(g, DT);
}

function run(g, sec) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) step(g);
}

// Spieler so stellen, dass er den Gegenstand berührt.
function touch(g, it) {
  g.player.x = it.x - g.player.w / 2;
  g.player.y = it.y - g.player.h;
}

test('Pickup fällt und bleibt auf festem Boden liegen', () => {
  const g = makeGame();
  const it = spawnPickup(g, 'emerald', 5.5 * T, 6 * T);
  run(g, 3);
  assert.equal(it.onGround, true);
  assert.equal(it.y, 11 * T, 'Unterkante liegt auf der Bedrock-Oberkante');
  const y = it.y;
  run(g, 1);
  assert.equal(it.y, y);
  assert.equal(it.active, true);
});

test('Smaragd einsammeln ruft addEmeralds und meldet emerald', () => {
  const g = makeGame();
  const it = spawnPickup(g, 'emerald', 88, 96);
  touch(g, it);
  updatePickups(g, DT);
  assert.equal(g.emeralds, 1);
  assert.ok(g.events.includes('emerald'));
  assert.equal(it.active, false);
});

test('Rüstung ruft givePower(armor) und meldet powerup', () => {
  const g = makeGame();
  const it = spawnPickup(g, 'armor', 88, 96);
  touch(g, it);
  updatePickups(g, DT);
  assert.deepEqual(g.powers, ['armor']);
  assert.ok(g.events.includes('powerup'));
});

test('Eisenhacke ruft givePick(2)', () => {
  const g = makeGame();
  const it = spawnPickup(g, 'pick_iron', 88, 96);
  touch(g, it);
  updatePickups(g, DT);
  assert.deepEqual(g.picks, [2]);
});

test('Goldener Apfel setzt star', () => {
  const g = makeGame();
  const it = spawnPickup(g, 'apple', 88, 96);
  touch(g, it);
  updatePickups(g, DT);
  assert.equal(g.player.star, PHYS.starTime);
  assert.ok(g.events.includes('powerup'));
});

test('Kuchen ruft gainLife', () => {
  const g = makeGame();
  const it = spawnPickup(g, 'cake', 88, 96);
  touch(g, it);
  updatePickups(g, DT);
  assert.equal(g.lives, 1);
});

test('Truhe öffnen: chestopen, Inhalt erscheint, ohne Eintrag 3 Smaragde', () => {
  const g = makeGame({ '5,9': '?', '7,9': '?' }, { '5,9': 'armor' });
  assert.equal(openChest(g, 5, 9), true);
  assert.equal(g.map.get(5, 9), TILE_IDS.chestopen);
  assert.ok(g.dirty >= 1);
  const armor = g.pickups.filter((p) => p.active && p.kind === 'armor');
  assert.equal(armor.length, 1);
  assert.equal(armor[0].x, 5.5 * T);
  assert.equal(armor[0].y, 9 * T);
  assert.ok(g.events.includes('chest'));

  assert.equal(openChest(g, 7, 9), true);
  const emeralds = g.pickups.filter((p) => p.active && p.kind === 'emerald' && p.x === 7.5 * T);
  assert.equal(emeralds.length, 3);

  assert.equal(openChest(g, 5, 9), false, 'bereits offen');
  assert.equal(openChest(g, 3, 5), false, 'keine Truhe');
});

test('Sand fällt nach Abbau darunter und landet', () => {
  const g = makeGame({ '5,7': 'A', '5,8': 'A' });
  // (5,9) und (5,10) sind Luft, Bedrock in Zeile 11.
  startFalling(g, 5, 8);
  assert.equal(g.map.get(5, 8), AIR);
  assert.equal(g.map.get(5, 7), AIR, 'Sand darüber wird nachgezogen');
  run(g, 1);
  assert.equal(g.map.get(5, 10), TILE_IDS.sand);
  assert.equal(g.map.get(5, 9), TILE_IDS.sand);
  assert.equal(g.falling.some((f) => f.active), false);
  assert.deepEqual(g.hurt, []);
});

test('Sand fällt auf den Spieler: Schaden, Block verschwindet', () => {
  const g = makeGame({ '5,2': 'A' });
  // Spieler steht auf der Bedrock-Oberkante (Zeile 11) in Spalte 5.
  g.player.x = 5 * T + 2;
  g.player.y = 11 * T - g.player.h;
  startFalling(g, 5, 2);
  run(g, 1);
  assert.deepEqual(g.hurt, ['sand']);
  assert.equal(g.falling.some((f) => f.active), false);
  assert.equal(g.map.get(5, 10), AIR, 'kein Sand bleibt liegen');
});

test('Debris-Partikel verschwinden nach 0,6 s', () => {
  const g = makeGame();
  spawnDebris(g, 5, 5, TILE_IDS.dirt);
  const debris = () => g.particles.filter((p) => p.active && p.kind === 'debris');
  assert.equal(debris().length, 6);
  assert.equal(debris()[0].tile, TILE_IDS.dirt);
  run(g, 0.5);
  assert.equal(debris().length, 6, 'noch am Leben');
  run(g, 0.2);
  assert.equal(debris().length, 0);
});

test('Rauch: 3 Partikel, nach 0,5 s weg', () => {
  const g = makeGame();
  spawnSmoke(g, 50, 50);
  const smoke = () => g.particles.filter((p) => p.active && p.kind === 'smoke');
  assert.equal(smoke().length, 3);
  run(g, 0.2);
  assert.ok(smoke().some((p) => p.frame > 0), 'Animation läuft');
  run(g, 0.4);
  assert.equal(smoke().length, 0);
});

test('Pickups verschwinden nach 30 s, Diamanten nicht', () => {
  const g = makeGame();
  const e = spawnPickup(g, 'emerald', 88, 176);
  const d = spawnPickup(g, 'diamond', 104, 176);
  run(g, 29);
  assert.equal(e.active, true);
  assert.equal(d.active, true);
  run(g, 1.5);
  assert.equal(e.active, false);
  assert.equal(d.active, true);
});

test('Pool hat 16 Plätze, danach null', () => {
  const g = makeGame();
  for (let i = 0; i < 16; i++) assert.ok(spawnPickup(g, 'emerald', 88, 96));
  assert.equal(spawnPickup(g, 'emerald', 88, 96), null);
  assert.equal(g.pickups.length, 16);
  assert.equal(g.particles.length, 96);
  assert.equal(g.falling.length, 8);
});
