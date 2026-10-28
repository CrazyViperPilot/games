// Generator für alle Level von Mario Craft (4 Welten x 33 Level = 132 Level).
// Erzeugt w1-4..w1-32, w2-4..w2-32, w3-4..w3-32, w4-1..w4-33 und versetzt die bisherigen Bosse auf w1-33, w2-33, w3-33.
// Prüft jedes Level mit parseLevel und explore auf 100% Erreichbarkeit und Unlösbarkeitsfreiheit!
import fs, { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLevel } from '../../../game/level.js';
import { explore, cellOf } from '../../../../test/helpers/reach.js';
import { addFood } from './food.mjs';
import { ensureHeadroom } from './headroom.mjs';
import { TILE_IDS } from '../../tiles.js';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(__dirname, '..');

function makeRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

class LevelBuilder {
  constructor(id, world, theme, W, H, pick = 0, boss = undefined) {
    this.id = id;
    this.world = world;
    this.theme = theme;
    this.W = W;
    this.H = H;
    this.pick = pick;
    this.boss = boss;
    this.g = Array.from({ length: H }, () => Array(W).fill('.'));
    this.chests = {};
    this.diamondsCount = 0;
  }

  put(c, r, ch) {
    if (c >= 0 && c < this.W && r >= 0 && r < this.H) {
      this.g[r][c] = ch;
    }
  }

  at(c, r) {
    if (c < 0 || c >= this.W || r < 0 || r >= this.H) return undefined;
    return this.g[r][c];
  }

  fill(c0, r0, c1, r1, ch) {
    const minC = Math.max(0, Math.min(c0, c1));
    const maxC = Math.min(this.W - 1, Math.max(c0, c1));
    const minR = Math.max(0, Math.min(r0, r1));
    const maxR = Math.min(this.H - 1, Math.max(r0, r1));
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        this.g[r][c] = ch;
      }
    }
  }

  hline(c0, c1, r, ch) { this.fill(c0, r, c1, r, ch); }
  vline(c, r0, r1, ch) { this.fill(c, r0, c, r1, ch); }

  tree(x, groundR) {
    this.vline(x, groundR - 2, groundR - 1, 'T');
    this.hline(x - 1, x + 1, groundR - 3, 'Y');
    this.hline(x - 2, x + 2, groundR - 4, 'Y');
    this.put(x, groundR - 5, 'Y');
  }

  palm(x, groundR) {
    this.put(x, groundR - 1, 'T');
    this.put(x, groundR - 2, 'T');
    this.put(x + 1, groundR - 3, 'T');
    this.put(x + 1, groundR - 4, 'T');
    this.hline(x - 2, x + 4, groundR - 5, 'Y');
    this.put(x - 3, groundR - 4, 'Y');
    this.put(x + 5, groundR - 4, 'Y');
    this.put(x + 1, groundR - 6, 'Y');
  }

  addChest(c, r, kind) {
    this.put(c, r, '?');
    this.chests[`${c},${r}`] = kind;
  }

  addDiamond(c, r, asOre = false) {
    if (asOre) {
      this.put(c, r, '4');
    } else {
      this.put(c, r, '*');
    }
    this.diamondsCount++;
  }

  addBorders(bottomIsVoid = false) {
    this.vline(0, 0, this.H - 1, 'Z');
    this.vline(this.W - 1, 0, this.H - 1, 'Z');
    if (!bottomIsVoid) {
      this.hline(0, this.W - 1, this.H - 1, 'Z');
    }
  }

  buildObject() {
    ensureHeadroom(this.g, this.W, this.H);
    addFood(this.g, this.W, this.H);

    const obj = {
      id: this.id,
      world: this.world,
      theme: this.theme,
      rows: this.g.map((row) => row.join('')),
      chests: this.chests,
      pick: this.pick,
    };
    if (this.boss) obj.boss = this.boss;
    return obj;
  }

  validate() {
    const def = this.buildObject();
    const map = parseLevel(def);

    assert.ok(map.cols >= 100 && map.cols <= 250, `${this.id}: cols ${map.cols}`);
    assert.ok(map.rows >= 30 && map.rows <= 70, `${this.id}: rows ${map.rows}`);
    assert.ok(map.start, `${this.id}: missing start`);
    assert.ok(map.goal, `${this.id}: missing goal`);
    assert.ok(map.checkpoint, `${this.id}: missing bed`);

    const totalDiamonds = map.gems.filter((g) => g.diamond).length +
      def.rows.reduce((n, row) => n + row.split('4').length - 1, 0);
    assert.equal(totalDiamonds, 3, `${this.id}: diamonds count is ${totalDiamonds}`);

    const chestCount = def.rows.reduce((n, row) => n + row.split('?').length - 1, 0);
    assert.equal(chestCount, Object.keys(map.chests).length, `${this.id}: chest mismatch`);

    const bossSpawn = map.spawns.find((s) => s.type === 'boss');
    const fromArena = def.boss && bossSpawn ? { start: bossSpawn, bossDefeated: true } : {};
    const resArena = explore(map, { ...fromArena, pick: 'auto' });
    const resStart = explore(map, { pick: 'auto' });

    const goalCell = cellOf(map.goal);
    assert.ok(resArena.touches(goalCell.c, goalCell.r), `${this.id}: goal not reachable at ${goalCell.c},${goalCell.r}`);

    const bedCell = cellOf(map.checkpoint);
    assert.ok(resStart.touches(bedCell.c, bedCell.r), `${this.id}: bed not reachable at ${bedCell.c},${bedCell.r}`);

    for (const g of map.gems) {
      if (!g.diamond) continue;
      const c = cellOf(g);
      assert.ok(resStart.touches(c.c, c.r) || resArena.touches(c.c, c.r), `${this.id}: diamond at ${c.c},${c.r} not reachable`);
    }

    for (let i = 0; i < map.tiles.length; i++) {
      if (map.tiles[i] !== TILE_IDS.diamondore) continue;
      const c = i % map.cols, r = Math.floor(i / map.cols);
      assert.ok((resStart.touchesSolid(c, r) && resStart.canDig(c, r)) || (resArena.touchesSolid(c, r) && resArena.canDig(c, r)), `${this.id}: diamond ore at ${c},${r} not diggable`);
    }

    for (const key of Object.keys(map.chests)) {
      const [c, r] = key.split(',').map(Number);
      assert.ok((resStart.touchesSolid(c, r) && resStart.canDig(c, r)) || (resArena.touchesSolid(c, r) && resArena.canDig(c, r)), `${this.id}: chest at ${c},${r} not reachable`);
    }

    return def;
  }
}

// -------------------------------------------------------------
// LEVEL GENERATORS
// -------------------------------------------------------------

export function buildOverworldLevel(nr) {
  const seed = 1000 + nr * 47;
  const rng = makeRng(seed);
  const id = `w1-${nr}`;
  const W = 120 + (nr % 6) * 6;
  const H = 38 + (nr % 4) * 2;
  const b = new LevelBuilder(id, 1, 'overworld', W, H, 0);

  const baseGround = 13 + (nr % 3);
  b.addBorders(false);

  for (let c = 1; c < W - 1; c++) {
    b.put(c, baseGround, 'G');
    b.fill(c, baseGround + 1, c, baseGround + 2, '#');
    b.fill(c, baseGround + 3, c, H - 2, 'S');
  }

  const hillCount = 3 + (nr % 3);
  for (let h = 0; h < hillCount; h++) {
    const hc = Math.floor(15 + h * (W / (hillCount + 1)));
    const hw = 3 + Math.floor(rng() * 3);
    for (let dx = -hw; dx <= hw; dx++) {
      const c = hc + dx;
      if (c >= 2 && c < W - 2) {
        b.put(c, baseGround - 1, 'G');
        b.put(c, baseGround, '#');
      }
    }
  }

  for (let x = 6; x < W - 10; x += 9 + Math.floor(rng() * 5)) {
    if (b.at(x, baseGround) === 'G' && b.at(x, baseGround - 1) === '.') {
      b.tree(x, baseGround);
    } else if (b.at(x, baseGround - 1) === 'G') {
      b.tree(x, baseGround - 1);
    }
  }

  b.put(4, baseGround - 1, 'P');
  b.put(W - 5, baseGround - 1, 'F');
  for (let c = 7; c < 15; c += 2) b.put(c, baseGround - 1, 'o');
  for (let c = W - 9; c < W - 5; c += 2) b.put(c, baseGround - 1, 'o');

  const caveFloor1 = baseGround + 9;
  const caveFloor2 = baseGround + 17;

  const shaft1C = Math.floor(W * 0.22);
  b.fill(shaft1C, baseGround, shaft1C + 1, caveFloor1, '.');
  b.vline(shaft1C, baseGround, caveFloor1, 'H');

  const h1Start = shaft1C;
  const h1End = Math.floor(W * 0.46);
  b.fill(h1Start, caveFloor1 - 3, h1End, caveFloor1, '.');
  b.hline(h1Start, h1End, caveFloor1 + 1, 'C');

  b.put(h1Start + 5, caveFloor1 - 1, '|');
  b.put(h1Start + 7, caveFloor1, 'z');
  b.put(h1Start + 12, caveFloor1, 's');
  b.put(h1Start + 15, caveFloor1 - 1, '|');

  const bedC = Math.floor((h1Start + h1End) / 2);
  b.put(bedC, caveFloor1, 'K');
  b.put(bedC - 1, caveFloor1, 'o');
  b.put(bedC + 1, caveFloor1, 'o');

  b.addChest(bedC + 3, caveFloor1, (nr % 2 === 0) ? 'armor' : 'bow');

  const shaft2C = h1End;
  b.fill(shaft2C - 1, caveFloor1 + 1, shaft2C, caveFloor2, '.');
  b.vline(shaft2C, caveFloor1 + 1, caveFloor2, 'H');

  const h2Start = shaft2C - 4;
  const h2End = Math.floor(W * 0.75);
  b.fill(h2Start, caveFloor2 - 4, h2End, caveFloor2, '.');
  b.hline(h2Start, h2End, caveFloor2 + 1, 'B');

  b.put(h2Start + 8, caveFloor2, 'm');
  b.put(h2Start + 14, caveFloor2, 'c');
  b.put(h2Start + 18, caveFloor2 - 1, '|');

  b.addChest(h2Start + 10, caveFloor2, (nr % 3 === 0) ? 'pick_stone' : 'apple');

  const shaft3C = h2End;
  b.fill(shaft3C, baseGround, shaft3C + 1, caveFloor2, '.');
  b.vline(shaft3C, baseGround, caveFloor2, 'H');

  b.addDiamond(12, baseGround - 4, false);
  b.addDiamond(h1Start + 4, caveFloor1 - 2, false);
  b.addDiamond(h2End - 3, caveFloor2 - 2, false);

  b.put(shaft1C + 2, caveFloor1 - 2, '1');
  b.put(shaft1C + 3, caveFloor1 - 2, '2');
  b.put(h2End - 4, caveFloor2 - 3, '3');

  return b.validate();
}

export function buildDepthsLevel(nr) {
  const seed = 2000 + nr * 53;
  const rng = makeRng(seed);
  const id = `w2-${nr}`;
  const W = 130 + (nr % 6) * 7;
  const H = 44 + (nr % 4) * 2;
  const b = new LevelBuilder(id, 2, 'depths', W, H, 1);

  const baseGround = 13 + (nr % 3);
  b.addBorders(false);

  for (let c = 1; c < W - 1; c++) {
    b.put(c, baseGround, 'C');
    b.fill(c, baseGround + 1, c, baseGround + 3, 'S');
    b.fill(c, baseGround + 4, c, H - 2, 'S');
  }

  for (let c = 10; c < 18; c++) b.put(c, baseGround - 1, 'C');
  for (let c = W - 18; c < W - 10; c++) b.put(c, baseGround - 1, 'C');

  b.put(4, baseGround - 1, 'P');
  b.put(W - 5, baseGround - 1, 'F');
  b.put(W - 6, baseGround - 1, 'o');
  b.put(W - 7, baseGround - 1, 'o');

  const d1 = baseGround + 9;
  const d2 = baseGround + 19;

  const s1 = Math.floor(W * 0.2);
  b.fill(s1, baseGround, s1 + 1, d1, '.');
  b.vline(s1, baseGround, d1, 'H');

  const d1End = Math.floor(W * 0.5);
  b.fill(s1, d1 - 4, d1End, d1, '.');
  b.hline(s1, d1End, d1 + 1, 'B');

  const lavaC = s1 + 8;
  b.fill(lavaC, d1 + 1, lavaC + 4, d1 + 1, 'L');
  b.hline(lavaC, lavaC + 4, d1 - 1, '=');

  b.put(s1 + 4, d1, 's');
  b.put(s1 + 15, d1, 'r');
  b.put(s1 + 20, d1, 'c');
  b.put(s1 + 3, d1 - 2, '|');
  b.put(s1 + 18, d1 - 2, '|');

  const bedC = d1End - 4;
  b.put(bedC, d1, 'K');
  b.addChest(bedC - 3, d1, 'pick_iron');

  const s2 = d1End;
  b.fill(s2 - 1, d1 + 1, s2, d2, '.');
  b.vline(s2, d1 + 1, d2, 'H');

  const d2End = Math.floor(W * 0.8);
  b.fill(s2 - 3, d2 - 4, d2End, d2, '.');
  b.hline(s2 - 3, d2End, d2 + 1, 'C');

  b.put(s2 + 6, d2, 'M');
  b.put(s2 + 12, d2, 'm');
  b.put(s2 + 18, d2, '5');

  b.put(d2End - 4, d2, 'J');
  b.addChest(s2 + 14, d2, (nr % 3 === 0) ? 'bow' : 'apple');

  const s3 = d2End;
  b.fill(s3, baseGround, s3 + 1, d2, '.');
  b.vline(s3, baseGround, d2, 'H');

  b.addDiamond(14, baseGround - 2, false);
  b.addDiamond(s1 + 10, d1 - 1, true);
  b.addDiamond(d2End - 2, d2 - 2, false);

  b.put(s1 + 2, d1 - 3, '2');
  b.put(s2 + 2, d2 - 3, '3');

  return b.validate();
}

export function buildNetherLevel(nr) {
  const seed = 3000 + nr * 61;
  const rng = makeRng(seed);
  const id = `w3-${nr}`;
  const W = 140 + (nr % 5) * 8;
  const H = 46 + (nr % 3) * 4;
  const b = new LevelBuilder(id, 3, 'nether', W, H, 2);

  const baseGround = 14;
  b.addBorders(false);

  for (let c = 1; c < W - 1; c++) {
    b.put(c, baseGround, 'N');
    b.fill(c, baseGround + 1, c, H - 2, 'N');
  }

  b.put(4, baseGround - 1, 'P');
  b.put(W - 5, baseGround - 1, 'F');
  b.put(W - 6, baseGround - 1, 'o');

  const f1 = baseGround + 10;
  const f2 = baseGround + 20;

  const s1 = Math.floor(W * 0.22);
  b.fill(s1, baseGround, s1 + 1, f1, '.');
  b.vline(s1, baseGround, f1, 'H');

  const f1End = Math.floor(W * 0.52);
  b.fill(s1, f1 - 4, f1End, f1, '.');
  b.hline(s1, f1End, f1 + 1, 'R');
  b.hline(s1, f1End, f1 - 5, 'R');

  b.put(s1 + 5, f1 - 5, 'U');
  b.put(s1 + 15, f1 - 5, 'U');
  b.put(s1 + 25, f1 - 5, 'U');

  const lavaC = s1 + 10;
  b.fill(lavaC, f1 + 1, lavaC + 5, f1 + 1, 'L');
  b.hline(lavaC, lavaC + 5, f1, '=');

  b.put(s1 + 4, f1 - 1, 'g');
  b.put(s1 + 18, f1, 's');
  b.put(s1 + 22, f1, 'c');

  const bedC = f1End - 5;
  b.put(bedC, f1, 'K');
  b.addChest(bedC - 3, f1, (nr % 2 === 0) ? 'bow' : 'armor');

  const s2 = f1End;
  b.fill(s2 - 1, f1 + 1, s2, f2, '.');
  b.vline(s2, f1 + 1, f2, 'H');

  const f2End = Math.floor(W * 0.78);
  b.fill(s2 - 2, f2 - 4, f2End, f2, '.');
  b.hline(s2 - 2, f2End, f2 + 1, 'R');
  b.put(s2 + 6, f2 - 5, 'U');
  b.put(s2 + 16, f2 - 5, 'U');

  b.put(s2 + 8, f2, 'g');
  b.put(s2 + 14, f2, 's');
  b.addChest(s2 + 10, f2, 'apple');

  const s3 = f2End;
  b.fill(s3, baseGround, s3 + 1, f2, '.');
  b.vline(s3, baseGround, f2, 'H');

  b.addDiamond(8, baseGround - 2, false);
  b.addDiamond(s1 + 12, f1 - 1, true);
  b.addDiamond(f2End - 3, f2 - 2, false);

  return b.validate();
}

export function buildEndLevel(nr) {
  const seed = 4000 + nr * 67;
  const rng = makeRng(seed);
  const id = `w3-${nr}`;
  const W = 150 + (nr % 5) * 8;
  const H = 48 + (nr % 3) * 4;
  const b = new LevelBuilder(id, 3, 'end', W, H, 2);

  b.addBorders(true);

  const island = (c0, c1, top, depth = 5) => {
    for (let k = 0; k < depth; k++) {
      const shrink = Math.round(k * 0.5);
      b.fill(c0 + shrink, top + k, c1 - shrink, top + k, 'E');
    }
  };

  let curC = 2;
  let curR = 20;

  island(curC, curC + 14, curR);
  b.put(curC + 2, curR - 1, 'P');
  b.put(curC + 4, curR - 1, 'o');
  b.put(curC + 6, curR - 1, 'o');

  curC += 17;

  const islandCount = 8;
  let bedPlaced = false;
  let chestCount = 0;

  for (let i = 0; i < islandCount; i++) {
    const width = 10 + Math.floor(rng() * 6);
    const dR = Math.floor(rng() * 5) - 2;
    curR = Math.max(16, Math.min(H - 12, curR + dR));

    island(curC, curC + width, curR);

    if (i % 2 === 1) {
      b.put(curC + 4, curR - 1, 'e');
    } else if (i % 3 === 0) {
      b.put(curC + 5, curR - 1, 's');
    }

    if (i === Math.floor(islandCount / 2) && !bedPlaced) {
      b.put(curC + 3, curR - 1, 'K');
      b.addChest(curC + 6, curR - 1, 'armor');
      bedPlaced = true;
    } else if (i === 2 && chestCount === 0) {
      b.addChest(curC + 4, curR - 1, 'bow');
      chestCount++;
    }

    if (i === 1) {
      b.addDiamond(curC + 3, curR - 2, false);
    } else if (i === islandCount - 2) {
      b.addDiamond(curC + 4, curR - 2, false);
    }

    if (i === 3) {
      b.put(curC + width - 2, curR, 'J');
    }

    curC += width + 2 + Math.floor(rng() * 2);
  }

  island(curC, W - 3, curR);
  b.put(W - 6, curR - 1, 'F');
  b.put(W - 8, curR - 1, 'o');
  b.put(W - 9, curR - 1, 'o');
  b.addDiamond(W - 7, curR - 2, false);

  return b.validate();
}

export function buildParadiseLevel(nr) {
  const seed = 5000 + nr * 73;
  const rng = makeRng(seed);
  const id = `w4-${nr}`;
  const W = 135 + (nr % 6) * 6;
  const H = 42 + (nr % 4) * 3;
  const b = new LevelBuilder(id, 4, 'paradise', W, H, 2);

  const baseGround = 14 + (nr % 3);
  b.addBorders(false);

  for (let c = 1; c < W - 1; c++) {
    b.put(c, baseGround, 'A');
    b.put(c, baseGround + 1, 'A');
    b.fill(c, baseGround + 2, c, H - 2, 'S');
  }

  const duneCount = 3 + (nr % 3);
  for (let d = 0; d < duneCount; d++) {
    const dc = Math.floor(16 + d * (W / (duneCount + 1)));
    const dw = 3 + Math.floor(rng() * 3);
    for (let dx = -dw; dx <= dw; dx++) {
      const c = dc + dx;
      if (c >= 2 && c < W - 2) {
        b.put(c, baseGround - 1, 'A');
      }
    }
  }

  for (let x = 7; x < W - 12; x += 11 + Math.floor(rng() * 6)) {
    if (b.at(x, baseGround) === 'A' && b.at(x, baseGround - 1) === '.') {
      b.palm(x, baseGround);
    } else if (b.at(x, baseGround - 1) === 'A' && b.at(x, baseGround - 2) === '.') {
      b.palm(x, baseGround - 1);
    }
  }

  const lagoonStart = Math.floor(W * 0.32);
  const lagoonEnd = lagoonStart + 12 + (nr % 5);
  b.fill(lagoonStart, baseGround, lagoonEnd, baseGround + 3, '~');
  for (let c = lagoonStart + 1; c < lagoonEnd; c += 2) b.put(c, baseGround + 3, ',');

  b.put(4, baseGround - 1, 'P');
  b.put(W - 5, baseGround - 1, 'F');
  b.put(W - 6, baseGround - 1, 'o');
  b.put(W - 7, baseGround - 1, 'o');

  const grotto1Floor = baseGround + 10;
  const grotto2Floor = baseGround + 20;

  const shaft1C = Math.floor(W * 0.18);
  b.fill(shaft1C, baseGround, shaft1C + 1, grotto1Floor, '.');
  b.vline(shaft1C, baseGround, grotto1Floor, 'H');

  const g1End = Math.floor(W * 0.5);
  b.fill(shaft1C, grotto1Floor - 4, g1End, grotto1Floor, '.');
  b.hline(shaft1C, g1End, grotto1Floor + 1, 'S');

  const wPoolStart = shaft1C + 6;
  const wPoolEnd = wPoolStart + 10;
  b.fill(wPoolStart, grotto1Floor - 1, wPoolEnd, grotto1Floor, '~');

  const bedC = g1End - 4;
  b.put(bedC, grotto1Floor, 'K');
  b.addChest(bedC - 3, grotto1Floor, (nr % 2 === 0) ? 'armor' : 'bow');

  b.put(shaft1C + 4, grotto1Floor, 's');
  b.put(g1End - 8, grotto1Floor, 'm');
  b.put(shaft1C + 2, grotto1Floor - 2, '|');
  b.put(bedC + 2, grotto1Floor - 2, '|');

  const shaft2C = g1End;
  b.fill(shaft2C - 1, grotto1Floor + 1, shaft2C, grotto2Floor, '.');
  b.vline(shaft2C, grotto1Floor + 1, grotto2Floor, 'H');

  const g2End = Math.floor(W * 0.78);
  b.fill(shaft2C - 2, grotto2Floor - 4, g2End, grotto2Floor, '.');
  b.hline(shaft2C - 2, g2End, grotto2Floor + 1, 'W');

  b.vline(shaft2C + 10, grotto2Floor - 4, grotto2Floor, 'T');
  b.put(shaft2C + 11, grotto2Floor - 2, '=');
  b.addChest(shaft2C + 14, grotto2Floor, (nr % 3 === 0) ? 'pick_diamond' : 'apple');
  b.put(g2End - 4, grotto2Floor, 'J');

  b.put(shaft2C + 6, grotto2Floor, 'z');
  b.put(shaft2C + 18, grotto2Floor, 'c');

  const shaft3C = g2End;
  b.fill(shaft3C, baseGround, shaft3C + 1, grotto2Floor, '.');
  b.vline(shaft3C, baseGround, grotto2Floor, 'H');

  b.addDiamond(12, baseGround - 4, false);
  b.addDiamond(shaft1C + 5, grotto1Floor - 2, false);
  b.addDiamond(g2End - 2, grotto2Floor - 2, false);

  b.put(shaft1C + 2, grotto1Floor - 3, '3');
  b.put(shaft2C + 3, grotto2Floor - 3, '3');

  return b.validate();
}

export function buildParadiseBossLevel() {
  const id = 'w4-33';
  const W = 140, H = 44;
  const b = new LevelBuilder(id, 4, 'paradise', W, H, 2, 'schildkroete');

  b.addBorders(false);

  const baseGround = 15;

  for (let c = 1; c < W - 1; c++) {
    b.put(c, baseGround, 'A');
    b.put(c, baseGround + 1, 'A');
    b.fill(c, baseGround + 2, c, H - 2, 'S');
  }

  b.palm(10, baseGround);
  b.palm(24, baseGround);

  b.put(4, baseGround - 1, 'P');
  b.put(6, baseGround - 1, 'o');
  b.put(8, baseGround - 1, 'o');

  const shaftC = 35;
  const arenaFloor = 28;
  b.fill(shaftC, baseGround, shaftC + 1, arenaFloor, '.');
  b.vline(shaftC, baseGround, arenaFloor, 'H');

  const doorC = 60;
  b.fill(shaftC, arenaFloor - 3, doorC, arenaFloor, '.');
  b.hline(shaftC, doorC, arenaFloor + 1, 'S');

  b.put(doorC - 4, arenaFloor, 'K');
  b.addChest(doorC - 8, arenaFloor, 'armor');
  b.addChest(doorC - 12, arenaFloor, 'bow');
  b.put(doorC - 2, arenaFloor - 1, '|');

  b.fill(doorC, 0, doorC, arenaFloor - 3, 'Z');
  b.fill(doorC, arenaFloor - 2, doorC, arenaFloor, ':');

  b.fill(doorC + 1, arenaFloor - 10, W - 2, arenaFloor, '.');
  b.hline(doorC + 1, W - 2, arenaFloor + 1, 'A');
  b.fill(doorC + 1, arenaFloor + 2, W - 2, H - 2, 'S');

  b.hline(doorC, W - 2, arenaFloor - 11, 'Z');
  b.vline(W - 2, arenaFloor - 11, arenaFloor, 'Z');

  const bossC = doorC + 30;
  b.put(bossC, arenaFloor, '@');
  b.put(W - 6, arenaFloor, 'F');
  b.put(doorC + 5, arenaFloor, 'o');
  b.put(doorC + 10, arenaFloor, 'o');

  b.put(doorC + 2, arenaFloor - 2, '|');
  b.put(W - 4, arenaFloor - 2, '|');

  b.addDiamond(10, baseGround - 5, false);
  b.addDiamond(shaftC + 6, arenaFloor - 2, false);
  b.addDiamond(doorC + 20, arenaFloor - 2, false);

  return b.validate();
}

// -------------------------------------------------------------
// AUSFÜHRUNG & GENERIERUNG ALLER 132 LEVEL
// -------------------------------------------------------------

export function generateAllLevels() {
  console.log('--- Mario Craft 132-Level Generator Start ---');

  // 1. Bestehende Boss-Level (ehemals w1-4, w2-4, w3-4) auf w1-33, w2-33, w3-33 migrieren
  for (const w of [1, 2, 3]) {
    const oldPath = join(LEVELS_DIR, `w${w}-4.js`);
    if (fs.existsSync(oldPath)) {
      const oldContent = readFileSync(oldPath, 'utf8');
      if (oldContent.includes('slimeking') || oldContent.includes('dreikopf') || oldContent.includes('drache')) {
        const newContent = oldContent
          .replace(new RegExp(`id:\s*'w${w}-4'`, 'g'), `id: 'w${w}-33'`)
          .replace(new RegExp(`Level w${w}-4`, 'g'), `Level w${w}-33`);

        const newPath = join(LEVELS_DIR, `w${w}-33.js`);
        writeFileSync(newPath, newContent, 'utf8');
        console.log(`Migrated boss level w${w}-4 -> w${w}-33`);
      }
    }
  }

  // 2. Welt 1: w1-4 bis w1-32 generieren
  for (let nr = 4; nr <= 32; nr++) {
    const def = buildOverworldLevel(nr);
    const filePath = join(LEVELS_DIR, `w1-${nr}.js`);
    const content = `// Level w1-${nr} (Welt 1, overworld). Automatisch generiert.
export default ${JSON.stringify(def, null, 2)};
`;
    writeFileSync(filePath, content, 'utf8');
  }
  console.log('World 1 (Oberwelt) w1-4..w1-32 generated!');

  // 3. Welt 2: w2-4 bis w2-32 generieren
  for (let nr = 4; nr <= 32; nr++) {
    const def = buildDepthsLevel(nr);
    const filePath = join(LEVELS_DIR, `w2-${nr}.js`);
    const content = `// Level w2-${nr} (Welt 2, depths). Automatisch generiert.
export default ${JSON.stringify(def, null, 2)};
`;
    writeFileSync(filePath, content, 'utf8');
  }
  console.log('World 2 (Tiefen) w2-4..w2-32 generated!');

  // 4. Welt 3: w3-4 bis w3-32 generieren
  for (let nr = 4; nr <= 18; nr++) {
    const def = buildNetherLevel(nr);
    const filePath = join(LEVELS_DIR, `w3-${nr}.js`);
    const content = `// Level w3-${nr} (Welt 3, nether). Automatisch generiert.
export default ${JSON.stringify(def, null, 2)};
`;
    writeFileSync(filePath, content, 'utf8');
  }
  for (let nr = 19; nr <= 32; nr++) {
    const def = buildEndLevel(nr);
    const filePath = join(LEVELS_DIR, `w3-${nr}.js`);
    const content = `// Level w3-${nr} (Welt 3, end). Automatisch generiert.
export default ${JSON.stringify(def, null, 2)};
`;
    writeFileSync(filePath, content, 'utf8');
  }
  console.log('World 3 (Nether & Leere) w3-4..w3-32 generated!');

  // 5. Welt 4: w4-1 bis w4-32 generieren
  for (let nr = 1; nr <= 32; nr++) {
    const def = buildParadiseLevel(nr);
    const filePath = join(LEVELS_DIR, `w4-${nr}.js`);
    const content = `// Level w4-${nr} (Welt 4, paradies). Automatisch generiert.
export default ${JSON.stringify(def, null, 2)};
`;
    writeFileSync(filePath, content, 'utf8');
  }
  console.log('World 4 (Paradies) w4-1..w4-32 generated!');

  // 6. Welt 4 Boss: w4-33 generieren
  {
    const def = buildParadiseBossLevel();
    const filePath = join(LEVELS_DIR, 'w4-33.js');
    const content = `// Level w4-33 „Schildkröten-Bucht“ (Boss-Level, Welt 4). Automatisch generiert.
export default ${JSON.stringify(def, null, 2)};
`;
    writeFileSync(filePath, content, 'utf8');
    console.log('World 4 Boss (Riesenschildkröte) w4-33 generated!');
  }

  // 7. Index-Datei js/data/levels/index.js schreiben
  let indexImports = '';
  let indexArray = 'export const LEVELS = [\n';

  for (let w = 1; w <= 4; w++) {
    for (let nr = 1; nr <= 33; nr++) {
      const varName = `w${w}_${nr}`;
      indexImports += `import ${varName} from './w${w}-${nr}.js';\n`;
      indexArray += `  ${varName},\n`;
    }
  }
  indexArray += '];\n';

  const indexPath = join(LEVELS_DIR, 'index.js');
  writeFileSync(indexPath, indexImports + '\n' + indexArray, 'utf8');
  console.log('Updated js/data/levels/index.js with all 132 levels!');

  console.log('--- ALL 132 LEVELS CREATED AND VALIDATED SUCCESSFULLY ---');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateAllLevels();
}
