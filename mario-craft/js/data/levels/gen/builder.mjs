// Gemeinsame Bausteine der Level-Generatoren: Zufallszahlen (deterministisch) und LevelBuilder mit Validierung.
import { parseLevel } from '../../../game/level.js';
import { explore, cellOf } from '../../../../test/helpers/reach.js';
import { addFood } from './food.mjs';
import { ensureHeadroom } from './headroom.mjs';
import { TILE_IDS } from '../../tiles.js';
import { playLevel } from '../../../../test/helpers/bot.js';
import assert from 'node:assert/strict';

export function makeRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class LevelBuilder {
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

    assert.ok(map.cols >= 100 && map.cols <= 320, `${this.id}: cols ${map.cols}`);
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

    // Spieltest mit der echten Physik: Nicht-Boss-Level muss der Bot bis zum Portal schaffen.
    if (!def.boss) {
      const r = playLevel(def, { maxTime: 400, lives: 99, power: 'bow' });
      assert.ok(r.won, `${this.id}: Bot scheitert (${String(r.summary).replace(/^[^|]*\|/, '').slice(0, 60)})`);
    }

    return def;
  }
}

