// Generator für alle neuen Level von Mario Craft (3 Welten x 33 Level = 99 Level).
// Erzeugt w1-4..w1-32, w2-4..w2-32, w3-4..w3-32 und versetzt die bisherigen Bosse auf w1-33, w2-33, w3-33.
// Prüft jedes Level mit parseLevel und explore auf 100% Erreichbarkeit und Unlösbarkeitsfreiheit!
import { writeFileSync, readFileSync } from 'node:fs';
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
  constructor(id, world, theme, W, H, pick = 0) {
    this.id = id;
    this.world = world;
    this.theme = theme;
    this.W = W;
    this.H = H;
    this.pick = pick;
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

    return {
      id: this.id,
      world: this.world,
      theme: this.theme,
      rows: this.g.map((row) => row.join('')),
      chests: this.chests,
      pick: this.pick,
    };
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

    const res = explore(map, { pick: 'auto' });
    const goalCell = cellOf(map.goal);
    assert.ok(res.touches(goalCell.c, goalCell.r), `${this.id}: goal not reachable at ${goalCell.c},${goalCell.r}`);

    const bedCell = cellOf(map.checkpoint);
    assert.ok(res.touches(bedCell.c, bedCell.r), `${this.id}: bed not reachable at ${bedCell.c},${bedCell.r}`);

    for (const g of map.gems) {
      if (!g.diamond) continue;
      const c = cellOf(g);
      assert.ok(res.touches(c.c, c.r), `${this.id}: diamond at ${c.c},${c.r} not reachable`);
    }

    for (let i = 0; i < map.tiles.length; i++) {
      if (map.tiles[i] !== TILE_IDS.diamondore) continue;
      const c = i % map.cols, r = Math.floor(i / map.cols);
      assert.ok(res.touchesSolid(c, r) && res.canDig(c, r), `${this.id}: diamond ore at ${c},${r} not diggable`);
    }

    for (const key of Object.keys(map.chests)) {
      const [c, r] = key.split(',').map(Number);
      assert.ok(res.touchesSolid(c, r) && res.canDig(c, r), `${this.id}: chest at ${c},${r} not reachable`);
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
  const W = 120 + (nr % 6) * 6;  // 120..150
  const H = 38 + (nr % 4) * 2;   // 38..44
  const b = new LevelBuilder(id, 1, 'overworld', W, H, 0);

  const baseGround = 13 + (nr % 3);
  b.addBorders(false);

  // 1. Grundgelände aufbauen
  for (let c = 1; c < W - 1; c++) {
    b.put(c, baseGround, 'G');
    b.fill(c, baseGround + 1, c, baseGround + 2, '#');
    b.fill(c, baseGround + 3, c, H - 2, 'S');
  }

  // Hügel auf der Oberfläche
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

  // Bäume & Blumen auf der Oberfläche
  for (let x = 6; x < W - 10; x += 9 + Math.floor(rng() * 5)) {
    if (b.at(x, baseGround) === 'G' && b.at(x, baseGround - 1) === '.') {
      b.tree(x, baseGround);
    } else if (b.at(x, baseGround - 1) === 'G') {
      b.tree(x, baseGround - 1);
    }
  }

  // Start & Portal
  b.put(4, baseGround - 1, 'P');
  b.put(W - 5, baseGround - 1, 'F');
  // Smaragde auf der Oberfläche
  for (let c = 7; c < 15; c += 2) b.put(c, baseGround - 1, 'o');
  for (let c = W - 9; c < W - 5; c += 2) b.put(c, baseGround - 1, 'o');

  // 2. Unterirdische Höhlen & Gänge
  const caveFloor1 = baseGround + 9;
  const caveFloor2 = baseGround + 17;

  // Schacht 1 (Abstieg)
  const shaft1C = Math.floor(W * 0.22);
  b.fill(shaft1C, baseGround, shaft1C + 1, caveFloor1, '.');
  b.vline(shaft1C, baseGround, caveFloor1, 'H'); // Leiter

  // Höhle 1 (Horizontale Halle)
  const h1Start = shaft1C;
  const h1End = Math.floor(W * 0.46);
  b.fill(h1Start, caveFloor1 - 3, h1End, caveFloor1, '.');
  b.hline(h1Start, h1End, caveFloor1 + 1, 'C'); // Bruchsteinboden

  // Mobs & Fackeln in Höhle 1
  b.put(h1Start + 5, caveFloor1 - 1, '|');
  b.put(h1Start + 7, caveFloor1, 'z');
  b.put(h1Start + 12, caveFloor1, 's');
  b.put(h1Start + 15, caveFloor1 - 1, '|');

  // Bett (Checkpoint) in Höhle 1
  const bedC = Math.floor((h1Start + h1End) / 2);
  b.put(bedC, caveFloor1, 'K');
  b.put(bedC - 1, caveFloor1, 'o');
  b.put(bedC + 1, caveFloor1, 'o');

  // Truhe 1 in Höhle 1
  b.addChest(bedC + 3, caveFloor1, (nr % 2 === 0) ? 'armor' : 'bow');

  // Schacht 2 (Tieferer Abstieg zu Höhle 2)
  const shaft2C = h1End;
  b.fill(shaft2C - 1, caveFloor1 + 1, shaft2C, caveFloor2, '.');
  b.vline(shaft2C, caveFloor1 + 1, caveFloor2, 'H');

  // Höhle 2 (Tiefere Schatzkammer)
  const h2Start = shaft2C - 4;
  const h2End = Math.floor(W * 0.75);
  b.fill(h2Start, caveFloor2 - 4, h2End, caveFloor2, '.');
  b.hline(h2Start, h2End, caveFloor2 + 1, 'B'); // Steinziegel

  // Schleimblock und Mobs in Höhle 2
  b.put(h2Start + 8, caveFloor2, 'm');
  b.put(h2Start + 14, caveFloor2, 'c'); // Zischer
  b.put(h2Start + 18, caveFloor2 - 1, '|');

  // Truhe 2 in Höhle 2
  b.addChest(h2Start + 10, caveFloor2, (nr % 3 === 0) ? 'pick_stone' : 'apple');

  // Schacht 3 (Aufstieg zurück zur Oberfläche)
  const shaft3C = h2End;
  b.fill(shaft3C, baseGround, shaft3C + 1, caveFloor2, '.');
  b.vline(shaft3C, baseGround, caveFloor2, 'H'); // Durchgehende Leiter hoch

  // Diamanten (genau 3)
  // Diamant 1: In Baumkrone oder Felsnische an der Oberfläche
  b.addDiamond(12, baseGround - 4, false);
  // Diamant 2: In Höhle 1
  b.addDiamond(h1Start + 4, caveFloor1 - 2, false);
  // Diamant 3: In Höhle 2
  b.addDiamond(h2End - 3, caveFloor2 - 2, false);

  // Erze einsprenkeln
  b.put(shaft1C + 2, caveFloor1 - 2, '1'); // Kohle
  b.put(shaft1C + 3, caveFloor1 - 2, '2'); // Eisen
  b.put(h2End - 4, caveFloor2 - 3, '3');   // Gold

  return b.validate();
}

export function buildDepthsLevel(nr) {
  const seed = 2000 + nr * 53;
  const rng = makeRng(seed);
  const id = `w2-${nr}`;
  const W = 130 + (nr % 6) * 7;  // 130..165
  const H = 44 + (nr % 4) * 2;   // 44..50
  const b = new LevelBuilder(id, 2, 'depths', W, H, 1);

  const baseGround = 13 + (nr % 3);
  b.addBorders(false);

  // 1. Gebirgsgrat & Schlucht
  for (let c = 1; c < W - 1; c++) {
    b.put(c, baseGround, 'C');
    b.fill(c, baseGround + 1, c, baseGround + 3, 'S');
    b.fill(c, baseGround + 4, c, H - 2, 'S');
  }

  // Felsformationen
  for (let c = 10; c < 18; c++) b.put(c, baseGround - 1, 'C');
  for (let c = W - 18; c < W - 10; c++) b.put(c, baseGround - 1, 'C');

  // Start & Portal
  b.put(4, baseGround - 1, 'P');
  b.put(W - 5, baseGround - 1, 'F');
  b.put(W - 6, baseGround - 1, 'o');
  b.put(W - 7, baseGround - 1, 'o');

  // Tiefe Ebenen
  const d1 = baseGround + 9;
  const d2 = baseGround + 19;

  // Schacht 1
  const s1 = Math.floor(W * 0.2);
  b.fill(s1, baseGround, s1 + 1, d1, '.');
  b.vline(s1, baseGround, d1, 'H');

  // Dungeon 1 (Große Steinhalle mit Lavasee)
  const d1End = Math.floor(W * 0.5);
  b.fill(s1, d1 - 4, d1End, d1, '.');
  b.hline(s1, d1End, d1 + 1, 'B');

  // Kleiner Lavasee mit Brücke
  const lavaC = s1 + 8;
  b.fill(lavaC, d1 + 1, lavaC + 4, d1 + 1, 'L');
  b.hline(lavaC, lavaC + 4, d1 - 1, '='); // Slab-Brücke darüber

  // Mobs
  b.put(s1 + 4, d1, 's');
  b.put(s1 + 15, d1, 'r');
  b.put(s1 + 20, d1, 'c');
  b.put(s1 + 3, d1 - 2, '|');
  b.put(s1 + 18, d1 - 2, '|');

  // Bett (Checkpoint)
  const bedC = d1End - 4;
  b.put(bedC, d1, 'K');

  // Truhe 1 (Gibt stets Eisenhacke, damit Diamanterz abgebaut werden kann)
  b.addChest(bedC - 3, d1, 'pick_iron');

  // Schacht 2 tiefer
  const s2 = d1End;
  b.fill(s2 - 1, d1 + 1, s2, d2, '.');
  b.vline(s2, d1 + 1, d2, 'H');

  // Dungeon 2 (Tiefste Halle mit Diamanterz & Spawner)
  const d2End = Math.floor(W * 0.8);
  b.fill(s2 - 3, d2 - 4, d2End, d2, '.');
  b.hline(s2 - 3, d2End, d2 + 1, 'C');

  // Spawner & Schleim
  b.put(s2 + 6, d2, 'M');
  b.put(s2 + 12, d2, 'm');
  b.put(s2 + 18, d2, '5'); // Infested stone

  // Schleimblock zum Hochschleudern am Ende von Dungeon 2
  b.put(d2End - 4, d2, 'J');

  // Truhe 2
  b.addChest(s2 + 14, d2, (nr % 3 === 0) ? 'bow' : 'apple');

  // Schacht 3 (Aufstieg zurück zur Oberfläche)
  const s3 = d2End;
  b.fill(s3, baseGround, s3 + 1, d2, '.');
  b.vline(s3, baseGround, d2, 'H');

  // 3 Diamanten
  // Diamant 1: In Felsspalte oben
  b.addDiamond(14, baseGround - 2, false);
  // Diamant 2: Als Diamanterz in der Wand von Dungeon 1 (seitlich begehbar)
  b.addDiamond(s1 + 10, d1 - 1, true);
  // Diamant 3: In Dungeon 2
  b.addDiamond(d2End - 2, d2 - 2, false);

  // Erze
  b.put(s1 + 2, d1 - 3, '2'); // Eisen
  b.put(s2 + 2, d2 - 3, '3'); // Gold

  return b.validate();
}

export function buildNetherLevel(nr) {
  const seed = 3000 + nr * 61;
  const rng = makeRng(seed);
  const id = `w3-${nr}`;
  const W = 140 + (nr % 5) * 8;  // 140..172
  const H = 46 + (nr % 3) * 4;   // 46..54
  const b = new LevelBuilder(id, 3, 'nether', W, H, 2);

  const baseGround = 14;
  b.addBorders(false);

  // Netherrack-Landschaft
  for (let c = 1; c < W - 1; c++) {
    b.put(c, baseGround, 'N');
    b.fill(c, baseGround + 1, c, H - 2, 'N');
  }

  // Start & Portal
  b.put(4, baseGround - 1, 'P');
  b.put(W - 5, baseGround - 1, 'F');
  b.put(W - 6, baseGround - 1, 'o');

  // Nether-Festung (Netherbrick R, Glowstone U)
  const f1 = baseGround + 10;
  const f2 = baseGround + 20;

  // Schacht 1
  const s1 = Math.floor(W * 0.22);
  b.fill(s1, baseGround, s1 + 1, f1, '.');
  b.vline(s1, baseGround, f1, 'H');

  // Festungshalle 1
  const f1End = Math.floor(W * 0.52);
  b.fill(s1, f1 - 4, f1End, f1, '.');
  b.hline(s1, f1End, f1 + 1, 'R');
  b.hline(s1, f1End, f1 - 5, 'R'); // Festungsdecke

  // Glowstone an der Decke
  b.put(s1 + 5, f1 - 5, 'U');
  b.put(s1 + 15, f1 - 5, 'U');
  b.put(s1 + 25, f1 - 5, 'U');

  // Lavapool mit Steg
  const lavaC = s1 + 10;
  b.fill(lavaC, f1 + 1, lavaC + 5, f1 + 1, 'L');
  b.hline(lavaC, lavaC + 5, f1, '='); // Slab über Lava

  // Mobs
  b.put(s1 + 4, f1 - 1, 'g'); // Glutgeist
  b.put(s1 + 18, f1, 's');
  b.put(s1 + 22, f1, 'c');

  // Bett (Checkpoint)
  const bedC = f1End - 5;
  b.put(bedC, f1, 'K');

  // Truhe 1
  b.addChest(bedC - 3, f1, (nr % 2 === 0) ? 'bow' : 'armor');

  // Schacht 2
  const s2 = f1End;
  b.fill(s2 - 1, f1 + 1, s2, f2, '.');
  b.vline(s2, f1 + 1, f2, 'H');

  // Festungshalle 2 (Lavakatarakt)
  const f2End = Math.floor(W * 0.78);
  b.fill(s2 - 2, f2 - 4, f2End, f2, '.');
  b.hline(s2 - 2, f2End, f2 + 1, 'R');
  b.put(s2 + 6, f2 - 5, 'U');
  b.put(s2 + 16, f2 - 5, 'U');

  // Mobs in Halle 2
  b.put(s2 + 8, f2, 'g');
  b.put(s2 + 14, f2, 's');

  // Truhe 2
  b.addChest(s2 + 10, f2, 'apple');

  // Schacht 3 (Aufstieg zurück zur Oberfläche)
  const s3 = f2End;
  b.fill(s3, baseGround, s3 + 1, f2, '.');
  b.vline(s3, baseGround, f2, 'H');

  // 3 Diamanten
  b.addDiamond(8, baseGround - 2, false);
  b.addDiamond(s1 + 12, f1 - 1, true); // Diamanterz in Festungswand
  b.addDiamond(f2End - 3, f2 - 2, false);

  return b.validate();
}

export function buildEndLevel(nr) {
  const seed = 4000 + nr * 67;
  const rng = makeRng(seed);
  const id = `w3-${nr}`;
  const W = 150 + (nr % 5) * 8;  // 150..182
  const H = 48 + (nr % 3) * 4;   // 48..56
  const b = new LevelBuilder(id, 3, 'end', W, H, 2);

  // End: Unten offene Leere (Zeile H-1 ist Luft)
  b.addBorders(true);

  // Inseln aus Endstein E
  const island = (c0, c1, top, depth = 5) => {
    for (let k = 0; k < depth; k++) {
      const shrink = Math.round(k * 0.5);
      b.fill(c0 + shrink, top + k, c1 - shrink, top + k, 'E');
    }
  };

  // Kette schwebender Inseln von links nach rechts
  let curC = 2;
  let curR = 20;

  // 1. Startinsel
  island(curC, curC + 14, curR);
  b.put(curC + 2, curR - 1, 'P');
  b.put(curC + 4, curR - 1, 'o');
  b.put(curC + 6, curR - 1, 'o');

  curC += 17; // 2-3 Kacheln Sprunglücke

  // 2. Kette von 8-10 Zwischeninseln
  const islandCount = 8;
  let bedPlaced = false;
  let chestCount = 0;

  for (let i = 0; i < islandCount; i++) {
    const width = 10 + Math.floor(rng() * 6);
    // Leichte Höhenänderung (-2 bis +2 Kacheln)
    const dR = Math.floor(rng() * 5) - 2;
    curR = Math.max(16, Math.min(H - 12, curR + dR));

    island(curC, curC + width, curR);

    // Mobs auf Inseln
    if (i % 2 === 1) {
      b.put(curC + 4, curR - 1, 'e'); // Leerenläufer
    } else if (i % 3 === 0) {
      b.put(curC + 5, curR - 1, 's'); // Skelett
    }

    // Bett in der Mitte
    if (i === Math.floor(islandCount / 2) && !bedPlaced) {
      b.put(curC + 3, curR - 1, 'K');
      b.addChest(curC + 6, curR - 1, 'armor');
      bedPlaced = true;
    } else if (i === 2 && chestCount === 0) {
      b.addChest(curC + 4, curR - 1, 'bow');
      chestCount++;
    }

    // Diamanten platzieren
    if (i === 1) {
      b.addDiamond(curC + 3, curR - 2, false);
    } else if (i === islandCount - 2) {
      b.addDiamond(curC + 4, curR - 2, false);
    }

    // Schleimkatapult auf Insel 3
    if (i === 3) {
      b.put(curC + width - 2, curR, 'J');
    }

    curC += width + 2 + Math.floor(rng() * 2); // 2-3 Lücke
  }

  // Letzte Insel mit Portal
  island(curC, W - 3, curR);
  b.put(W - 6, curR - 1, 'F');
  b.put(W - 8, curR - 1, 'o');
  b.put(W - 9, curR - 1, 'o');
  b.addDiamond(W - 7, curR - 2, false);

  return b.validate();
}

// -------------------------------------------------------------
// AUSFÜHRUNG & GENERIERUNG ALLER 99 LEVEL
// -------------------------------------------------------------

export function generateAllLevels() {
  console.log('--- Mario Craft 99-Level Generator Start ---');

  // 1. Bestehende Boss-Level (ehemals w1-4, w2-4, w3-4) auf w1-33, w2-33, w3-33 migrieren
  for (const w of [1, 2, 3]) {
    const oldPath = join(LEVELS_DIR, `w${w}-4.js`);
    const oldContent = readFileSync(oldPath, 'utf8');
    const newContent = oldContent
      .replace(new RegExp(`id:\\s*'w${w}-4'`, 'g'), `id: 'w${w}-33'`)
      .replace(new RegExp(`Level w${w}-4`, 'g'), `Level w${w}-33`);

    const newPath = join(LEVELS_DIR, `w${w}-33.js`);
    writeFileSync(newPath, newContent, 'utf8');
    console.log(`Migrated boss level w${w}-4 -> w${w}-33`);
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
  console.log('World 1 (Oberwelt) w1-4..w1-32 successfully generated and validated!');

  // 3. Welt 2: w2-4 bis w2-32 generieren
  for (let nr = 4; nr <= 32; nr++) {
    const def = buildDepthsLevel(nr);
    const filePath = join(LEVELS_DIR, `w2-${nr}.js`);
    const content = `// Level w2-${nr} (Welt 2, depths). Automatisch generiert.
export default ${JSON.stringify(def, null, 2)};
`;
    writeFileSync(filePath, content, 'utf8');
  }
  console.log('World 2 (Tiefen) w2-4..w2-32 successfully generated and validated!');

  // 4. Welt 3: w3-4 bis w3-32 generieren (w3-4..w3-18 nether, w3-19..w3-32 end)
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
  console.log('World 3 (Nether & Leere) w3-4..w3-32 successfully generated and validated!');

  // 5. Index-Datei js/data/levels/index.js schreiben
  let indexImports = '';
  let indexArray = 'export const LEVELS = [\n';

  for (let w = 1; w <= 3; w++) {
    for (let nr = 1; nr <= 33; nr++) {
      const varName = `w${w}_${nr}`;
      indexImports += `import ${varName} from './w${w}-${nr}.js';\n`;
      indexArray += `  ${varName},\n`;
    }
  }
  indexArray += '];\n';

  const indexPath = join(LEVELS_DIR, 'index.js');
  writeFileSync(indexPath, indexImports + '\n' + indexArray, 'utf8');
  console.log('Updated js/data/levels/index.js with all 99 levels!');

  console.log('--- ALL 99 LEVELS CREATED AND VALIDATED SUCCESSFULLY ---');
}

// Direkte Ausführung wenn via node aufgerufen
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateAllLevels();
}
