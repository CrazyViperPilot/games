import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS } from '../js/data/physics.js';
import { TILE_BY_ID } from '../js/data/tiles.js';
import { LEVELS } from '../js/data/levels/index.js';
import { parseLevel } from '../js/game/level.js';

// Schaffbarkeit (PLAN §10, gemessene Physik): Rennsprung landet ≈ 8,7 Kacheln weit, gehaltener Sprung
// stehend ≈ 5,2 Kacheln hoch. Die Grenzen unten liegen darunter, damit Anlauf, Landung und Gegner Reserve bleibt.
const MAX_GAP = 5;   // breiteste Bodenlücke ohne Plattform (Kacheln); Rennsprung ≈ 8,7, Reserve ≈ 3
const MAX_STEP = 4;  // höchster Höhenunterschied benachbarter Bodenoberkanten (Kacheln); Stehsprung ≈ 5,2, Reserve ≈ 1

const R = PHYS.rows;
const FLOOR = R - 1;       // unterste Zeile
const VALID_THEMES = ['meadow', 'cave', 'castle'];
const VALID_PATHS = ['h', 'v', 'fall'];

// Boden in Zeile 13 oder 14 (fest).
function hasFloor(map, c) {
  return map.isSolid(c, FLOOR) || map.isSolid(c, FLOOR - 1);
}

// Zu einer Lücke gehört: keine feste Kachel unten, aber eine Plattform (= oder bewegliche) darüber.
function bridged(map, def, c) {
  for (let r = 0; r < FLOOR - 1; r++) if (TILE_BY_ID[map.get(c, r)].oneWay) return true;
  return (def.platforms ?? []).some((p) => {
    const reach = p.path === 'h' ? p.range : 0;
    return c >= p.c && c <= p.c + p.w - 1 + reach;
  });
}

// Breiteste Lücke (Spalten ohne Boden und ohne Plattform darüber).
function widestGap(map, def) {
  let best = { len: 0, at: -1 };
  let run = 0;
  for (let c = 0; c < map.cols; c++) {
    const gap = !hasFloor(map, c) && !bridged(map, def, c);
    run = gap ? run + 1 : 0;
    if (run > best.len) best = { len: run, at: c - run + 1 };
  }
  return best;
}

// Oberkante des begehbaren Bodens in Spalte c (oberste feste oder einweg-begehbare Kachel mit freiem Feld darüber).
function surface(map, c) {
  for (let r = 1; r < R; r++) {
    const t = TILE_BY_ID[map.get(c, r)];
    if ((t.solid || t.oneWay) && !map.isSolid(c, r - 1)) return r;
  }
  return null;
}

// Größter Höhenunterschied zwischen benachbarten begehbaren Spalten.
function biggestStep(map) {
  let best = { h: 0, at: -1 };
  for (let c = 0; c + 1 < map.cols; c++) {
    const a = surface(map, c);
    const b = surface(map, c + 1);
    if (a === null || b === null) continue;
    const h = Math.abs(a - b);
    if (h > best.h) best = { h, at: c };
  }
  return best;
}

const ALL_IDS = ['w1-1', 'w1-2', 'w1-3', 'w1-4', 'w2-1', 'w2-2', 'w2-3', 'w2-4', 'w3-1', 'w3-2', 'w3-3', 'w3-4'];

test('LEVELS enthält alle 12 Level in Spielreihenfolge', () => {
  assert.deepEqual(LEVELS.map((d) => d.id), ALL_IDS);
});

test('ids sind eindeutig und world passt zur id', () => {
  const ids = LEVELS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const def of LEVELS) {
    assert.match(def.id, /^w[1-3]-[1-4]$/, `${def.id}: id-Format`);
    assert.equal(def.world, Number(def.id[1]), `${def.id}: world passt nicht zur id`);
  }
});

for (const def of LEVELS) {
  test(`${def.id}`, () => {
    // Format und Parser
    assert.ok(VALID_THEMES.includes(def.theme), `${def.id}: theme "${def.theme}" ungültig`);
    assert.equal(def.rows.length, R, `${def.id}: ${R} Zeilen erwartet`);
    const cols = def.rows[0].length;
    for (const row of def.rows) assert.equal(row.length, cols, `${def.id}: Zeilen ungleich lang`);
    const map = parseLevel(def);
    assert.equal(map.cols, cols);

    // Länge: Burg- und Boss-Level 100–160, sonst 150–300
    const shortLevel = def.boss !== undefined || def.theme === 'castle';
    const [minCols, maxCols] = shortLevel ? [100, 160] : [150, 300];
    assert.ok(cols >= minCols && cols <= maxCols, `${def.id}: Länge ${cols} außerhalb ${minCols}–${maxCols}`);

    // Entitäten und Zählwerte
    const count = (ch) => def.rows.reduce((n, row) => n + [...row].filter((x) => x === ch).length, 0);
    assert.equal(count('P'), 1, `${def.id}: genau ein P`);
    assert.equal(count('F'), 1, `${def.id}: genau ein F`);
    assert.ok(count('K') <= 1, `${def.id}: höchstens ein K`);
    assert.equal(count('*'), 3, `${def.id}: genau 3 Sternmünzen`);
    assert.equal(count('b'), def.boss ? 1 : 0, `${def.id}: b nur in Boss-Leveln, dort genau eins`);
    const coins = count('o');
    assert.ok(coins >= 30 && coins <= 80, `${def.id}: ${coins} Münzen, erwartet 30–80`);

    // Start links auf dem Boden, Ziel rechts auf dem Boden mit 4 freien Bodenspalten danach
    const startCol = Math.floor(map.start.x / PHYS.tile);
    assert.ok(startCol >= 2 && startCol <= 4, `${def.id}: P nicht in Spalte 2–4`);
    assert.ok(hasFloor(map, startCol), `${def.id}: P steht nicht auf dem Boden`);
    const goalCol = Math.floor(map.goal.x / PHYS.tile);
    assert.ok(hasFloor(map, goalCol), `${def.id}: F steht nicht auf dem Boden`);
    for (let c = goalCol + 1; c <= goalCol + 4; c++) {
      assert.ok(hasFloor(map, c), `${def.id}: nach F fehlen 4 Spalten Boden`);
    }

    // Die obersten Zeilen bleiben frei (HUD); Höhle darf Decke in Zeile 0–1 haben.
    const topRows = def.theme === 'cave' ? 2 : 3;
    for (let r = 0; r < topRows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = TILE_BY_ID[map.get(c, r)];
        if (def.theme === 'cave' && r < 2 && t.solid) continue;
        assert.ok(!t.solid && !t.oneWay && !t.hazard, `${def.id}: Kachel in oberster Zeile ${r}, Spalte ${c}`);
      }
    }

    // Bonusblöcke: Pilz früh, Items nur auf ? oder !
    const itemEntries = Object.entries(def.items ?? {});
    for (const [key, value] of itemEntries) {
      const [c, r] = key.split(',').map(Number);
      assert.ok(c >= 0 && c < cols && r >= 0 && r < R, `${def.id}: Item ${key} außerhalb`);
      const kind = TILE_BY_ID[map.get(c, r)].kind;
      assert.ok(kind === 'bonus' || kind === 'invisible', `${def.id}: Item ${key} liegt nicht auf ? oder !`);
      assert.ok(['mushroom', 'flower', 'star', 'oneup', 'coins10'].includes(value), `${def.id}: Item "${value}" unbekannt`);
    }
    const mushroomCols = itemEntries.filter(([, v]) => v === 'mushroom').map(([k]) => Number(k.split(',')[0]));
    assert.ok(mushroomCols.some((c) => c < cols * 0.4), `${def.id}: kein früher Pilz-Bonusblock`);
    if (ALL_IDS.indexOf(def.id) >= 1) {
      assert.ok(itemEntries.some(([, v]) => v === 'flower'), `${def.id}: keine Feuerblume`);
    }

    // Bewegliche Plattformen
    for (const p of def.platforms ?? []) {
      assert.ok(VALID_PATHS.includes(p.path), `${def.id}: Plattform-Pfad "${p.path}" ungültig`);
      assert.ok(p.w >= 1 && p.c >= 0 && p.c + p.w <= cols && p.r >= 0 && p.r < R, `${def.id}: Plattform außerhalb`);
    }

    // Schaffbarkeit
    const gap = widestGap(map, def);
    assert.ok(gap.len <= MAX_GAP, `${def.id}: Bodenlücke ${gap.len} Kacheln ab Spalte ${gap.at} > ${MAX_GAP}`);
    const step = biggestStep(map);
    assert.ok(step.h <= MAX_STEP, `${def.id}: Stufe ${step.h} Kacheln bei Spalte ${step.at} > ${MAX_STEP}`);
  });
}
