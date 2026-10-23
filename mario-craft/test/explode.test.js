import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { TILE_IDS } from '../js/data/tiles.js';
import { parseLevel } from '../js/game/level.js';
import { explode, igniteTnt, updateTnt } from '../js/game/explode.js';
import { spawnProjectile, updateProjectiles, spawnPlayerArrow } from '../js/game/projectiles.js';

const T = PHYS.tile;
const DT = 1 / 120;
const AIR = TILE_IDS.air;
const DIRT = TILE_IDS.dirt;
const STONE = TILE_IDS.stone;
const OBS = TILE_IDS.obsidian;
const BEDROCK = TILE_IDS.bedrock;
const TNT = TILE_IDS.tnt;

// Karte mit Zeichen-Funktion fn(c, r) → Zeichen oder falsy. Unten Grundgestein, oben P und F.
function makeMap(cols, R, fn = () => null) {
  const rows = [];
  for (let r = 0; r < R; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) {
      let ch = r === R - 1 ? 'Z' : '.';
      if (r === 0 && c === 1) ch = 'P';
      else if (r === 0 && c === cols - 2) ch = 'F';
      s += fn(c, r) || ch;
    }
    rows.push(s);
  }
  return parseLevel({ id: 'explode-test', theme: 'overworld', rows });
}

// Erde (Zeilen 3–10) als Standardfüllung: Explosionen auf Zeile 6 treffen nur Erde und Luft.
function dirtFill(c, r) {
  return r >= 3 && r <= 10 ? '#' : null;
}

// Mock-Spiel mit echter Karte; Methoden zählen Aufrufe, Mobs und Boss sind einfache Objekte.
function makeGame(map, extra = {}) {
  const game = {
    map,
    time: 0,
    shake: 0,
    lightDirty: false,
    player: { x: 0, y: 0, w: PHYS.player.w, h: PHYS.player.h, face: 1, invuln: 0, star: 0, dead: false },
    mobs: [],
    boss: null,
    crystals: [],
    events: [],
    dirty: [],
    emeralds: 0,
    diamonds: [],
    hurts: [],
    killed: [],
    hits: [],
    bossHits: [],
    crystalHits: [],
    emit(name) { this.events.push(name); },
    markDirty(c, r) { this.dirty.push([c, r]); },
    addEmeralds(n) { this.emeralds += n; },
    collectDiamondAt(c, r) { this.diamonds.push([c, r]); },
    spawnMob(type, x, y) { this.mobs.push({ type, x, y, w: 12, h: 24, active: true, state: 'walk' }); },
    killMob(m, how) { m.state = 'dead'; this.killed.push({ m, how }); },
    hitMob(m, how) { this.hits.push({ m, how }); },
    hurtPlayer(cause) { this.hurts.push(cause); },
    damageBoss(how) { this.bossHits.push(how); },
    hitCrystal(cr) { this.crystalHits.push(cr); cr.alive = false; },
    openChest() {},
    startFalling() {},
    spawnDebris() {},
    igniteTnt(c, r, fuse) { return igniteTnt(this, c, r, fuse); },
    ...extra,
  };
  return game;
}

// Explosionsmittelpunkt: Mitte von Zelle (10, 6).
const EX = 10.5 * T;   // 168
const EY = 6.5 * T;    // 104

test('Radius 2,5 bricht Erde und Stein im Kreis, nicht außerhalb', () => {
  const map = makeMap(24, 12, (c, r) => (c === 11 && r === 6 ? 'S' : dirtFill(c, r)));
  const game = makeGame(map);
  explode(game, EX, EY, 2.5);
  assert.equal(map.get(10, 6), AIR, 'Zentrum');
  assert.equal(map.get(11, 6), AIR, 'Stein im Kreis');
  assert.equal(map.get(12, 6), AIR, 'Abstand 2 Kacheln');
  assert.equal(map.get(10, 8), AIR, 'Abstand 2 Kacheln nach unten');
  assert.equal(map.get(13, 6), DIRT, 'Abstand 3 Kacheln bleibt');
  assert.equal(map.get(12, 8), DIRT, 'Diagonale außerhalb bleibt');
  assert.ok(game.dirty.length > 0);
  assert.ok(game.events.includes('explode'));
  assert.equal(game.shake, 0.3);
});

test('Grundgestein und Obsidian bleiben stehen', () => {
  const map = makeMap(24, 12, (c, r) => {
    if (c === 9 && r === 6) return 'X';
    if (c === 10 && r === 7) return 'Z';
    return dirtFill(c, r);
  });
  const game = makeGame(map);
  explode(game, EX, EY, 2.5);
  assert.equal(map.get(9, 6), OBS);
  assert.equal(map.get(10, 7), BEDROCK);
  assert.equal(map.get(10, 6), AIR);
});

test('TNT-Kette: Explosion zündet das zweite TNT mit 0,5 s, dann explodiert es', () => {
  const map = makeMap(24, 12, (c, r) => {
    if (c === 10 && r === 6) return '!';
    if (c === 11 && r === 6) return '!';
    if (c === 13 && r === 7) return '#';
    return dirtFill(c, r);
  });
  const game = makeGame(map);
  igniteTnt(game, 10, 6, 0.1);
  assert.equal(map.get(10, 6), AIR, 'gezündetes TNT ist Luft');
  assert.equal(game.tnt.filter((t) => t.active).length, 1);

  updateTnt(game, 0.1);      // erstes TNT explodiert
  assert.equal(map.get(11, 6), AIR, 'zweites TNT entfernt');
  const active = game.tnt.filter((t) => t.active);
  assert.equal(active.length, 1, 'zweites TNT ist gezündet');
  assert.equal(active[0].timer, 0.5);
  assert.equal(active[0].fuse, 0.5);
  assert.equal(map.get(13, 7), DIRT, 'noch nicht explodiert');

  updateTnt(game, 0.49);
  assert.equal(game.tnt.filter((t) => t.active).length, 1, 'nach 0,49 s noch aktiv');
  assert.equal(map.get(13, 7), DIRT);

  updateTnt(game, 0.02);
  assert.equal(game.tnt.filter((t) => t.active).length, 0, 'nach 0,5 s explodiert');
  assert.equal(map.get(13, 7), AIR, 'zweite Explosion wirkt');
  assert.equal(game.events.filter((e) => e === 'explode').length, 2);
});

test('Explosion lässt TNT nur zünden, nicht als normale Kachel brechen', () => {
  const map = makeMap(24, 12, (c, r) => (c === 10 && r === 6 ? '!' : dirtFill(c, r)));
  const game = makeGame(map);
  explode(game, EX, EY, 2.5);
  assert.equal(map.get(10, 6), AIR);
  assert.equal(game.tnt.filter((t) => t.active)[0].timer, 0.5);
});

test('igniteTnt ignoriert Kacheln, die kein TNT sind', () => {
  const map = makeMap(24, 12, dirtFill);
  const game = makeGame(map);
  igniteTnt(game, 10, 6, 2.0);
  assert.equal(map.get(10, 6), DIRT);
  assert.equal(game.tnt, undefined);
});

test('Volle TNT-Pool (8) explodiert sofort', () => {
  const map = makeMap(24, 12, (c, r) => (c === 10 && r === 6 ? '!' : dirtFill(c, r)));
  const game = makeGame(map);
  game.tnt = Array.from({ length: 8 }, () => ({ active: true, x: 0, y: 0, timer: 9, fuse: 9 }));
  igniteTnt(game, 10, 6, 2.0);
  assert.equal(map.get(10, 6), AIR);
  assert.ok(game.events.includes('explode'), 'sofortige Explosion');
  assert.equal(game.tnt.filter((t) => t.active).length, 8, 'Pool unverändert');
});

test('Mob im Radius stirbt, Mob außerhalb und inaktive Mobs nicht', () => {
  const map = makeMap(24, 12, dirtFill);
  const inside = { type: 'zombie', x: EX - 6, y: EY - 13, w: 12, h: 26, active: true, state: 'walk' };
  const outside = { type: 'zombie', x: 300, y: EY - 13, w: 12, h: 26, active: true, state: 'walk' };
  const inactive = { type: 'zombie', x: EX - 6, y: EY - 13, w: 12, h: 26, active: false, state: 'walk' };
  const game = makeGame(map, { mobs: [inside, outside, inactive] });
  explode(game, EX, EY, 2.5);
  assert.equal(game.killed.length, 1);
  assert.equal(game.killed[0].m, inside);
  assert.equal(game.killed[0].how, 'explosion');
  assert.equal(outside.state, 'walk');
});

test('Spieler im Radius wird verletzt, invuln und Stern schützen', () => {
  const map = makeMap(24, 12, dirtFill);
  const near = () => ({ x: EX - 6, y: EY - 13, w: 12, h: 26, face: 1, invuln: 0, star: 0, dead: false });

  let game = makeGame(map);
  game.player = near();
  explode(game, EX, EY, 2.5);
  assert.deepEqual(game.hurts, ['explosion']);

  game = makeGame(map);
  game.player = { ...near(), invuln: 1 };
  explode(game, EX, EY, 2.5);
  assert.deepEqual(game.hurts, [], 'invuln');

  game = makeGame(map);
  game.player = { ...near(), star: 3 };
  explode(game, EX, EY, 2.5);
  assert.deepEqual(game.hurts, [], 'Stern');

  game = makeGame(map);
  game.player = { ...near(), x: 300 };
  explode(game, EX, EY, 2.5);
  assert.deepEqual(game.hurts, [], 'außerhalb');
});

test('Boss im Radius bekommt Explosionsschaden', () => {
  const map = makeMap(24, 12, dirtFill);
  const game = makeGame(map, { boss: { x: EX - 24, y: EY - 24, w: 48, h: 48, active: true, state: 'fly' } });
  explode(game, EX, EY, 2.5);
  assert.deepEqual(game.bossHits, ['explosion']);
});

test('Pfeil fliegt, fällt, bleibt in der Wand stecken und verschwindet danach', () => {
  // Wand in Spalte 12 (Zeilen 0–10), Boden ab Zeile 7.
  const map = makeMap(24, 12, (c, r) => (c === 12 && r <= 10 ? '#' : dirtFill(c, r)));
  const game = makeGame(map);
  const a = spawnProjectile(game, 'arrow', 88, 40, 200, 0);
  assert.ok(a);
  for (let i = 0; i < 12; i++) updateProjectiles(game, DT);
  assert.ok(a.x > 100, 'fliegt nach rechts');
  assert.ok(a.vy > 0, 'Schwerkraft wirkt');
  assert.ok(a.y > 40, 'fällt');
  assert.equal(a.stuck, false);

  for (let i = 0; i < 200 && !a.stuck; i++) updateProjectiles(game, DT);
  assert.equal(a.stuck, true, 'steckt fest');
  assert.equal(a.vx, 0);
  assert.ok(a.x >= 192 && a.x < 200, 'Stelle an der Wand');

  for (let i = 0; i < 132; i++) updateProjectiles(game, DT);   // > 1 s
  assert.equal(a.active, false, 'nach 1 s inaktiv');
});

test('Pfeil trifft Mob → hitMob, Pfeil verbraucht', () => {
  const map = makeMap(24, 12, dirtFill);
  const m = { type: 'zombie', x: 120, y: 30, w: 12, h: 26, active: true, state: 'walk' };
  const game = makeGame(map, { mobs: [m] });
  const a = spawnProjectile(game, 'arrow', 100, 40, 200, 0);
  for (let i = 0; i < 60 && a.active; i++) updateProjectiles(game, DT);
  assert.equal(game.hits.length, 1);
  assert.equal(game.hits[0].m, m);
  assert.equal(game.hits[0].how, 'arrow');
  assert.equal(a.active, false);
});

test('Schädel explodiert an der Wand mit Radius 1,5', () => {
  // Wand in Spalte 14; Zelle (16, 2) liegt außerhalb des Radius.
  const map = makeMap(24, 12, (c, r) => {
    if (c === 14 && r <= 10) return '#';
    if (c === 16 && r === 2) return '#';
    return dirtFill(c, r);
  });
  const game = makeGame(map);
  const s = spawnProjectile(game, 'skull', 100, 40, 100, 0);
  for (let i = 0; i < 300 && s.active; i++) updateProjectiles(game, DT);
  assert.equal(s.active, false);
  assert.ok(game.events.includes('explode'));
  assert.equal(map.get(14, 2), AIR, 'Wand im Radius gebrochen');
  assert.equal(map.get(16, 2), DIRT, 'außerhalb Radius');
});

test('maxArrows = 2: nur zwei aktive Spieler-Pfeile', () => {
  const map = makeMap(24, 12, dirtFill);
  const game = makeGame(map, { player: { x: 50, y: 100, w: 12, h: 26, face: 1, invuln: 0, star: 0, dead: false } });
  assert.equal(PHYS.maxArrows, 2);
  const first = spawnPlayerArrow(game);
  assert.ok(first);
  assert.equal(first.vx, PHYS.arrowSpeed);
  assert.equal(first.vy, -30);
  assert.equal(first.x, 50 + 6 + 8);
  assert.equal(first.y, 110);
  assert.ok(spawnPlayerArrow(game));
  assert.equal(spawnPlayerArrow(game), null, 'dritter Pfeil abgelehnt');
  assert.ok(game.events.includes('arrow'));
  first.active = false;
  assert.ok(spawnPlayerArrow(game), 'nach Ablauf wieder möglich');
});

test('Pfeil nach links: Blickrichtung spiegelt Start und Geschwindigkeit', () => {
  const map = makeMap(24, 12, dirtFill);
  const game = makeGame(map, { player: { x: 50, y: 100, w: 12, h: 26, face: -1, invuln: 0, star: 0, dead: false } });
  const a = spawnPlayerArrow(game);
  assert.equal(a.vx, -PHYS.arrowSpeed);
  assert.equal(a.x, 56 - 8);
});

test('Feuer trifft Spieler → hurtPlayer(fire), Feuer verschwindet', () => {
  const map = makeMap(24, 12, dirtFill);
  const game = makeGame(map, { player: { x: 100, y: 100, w: 12, h: 26, face: 1, invuln: 0, star: 0, dead: false } });
  const f = spawnProjectile(game, 'fire', 106, 110, 0, 0);
  updateProjectiles(game, DT);
  assert.deepEqual(game.hurts, ['fire']);
  assert.equal(f.active, false);
});
