import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../js/data/levels/index.js';
import { parseLevel } from '../js/game/level.js';
import { TILE_BY_ID } from '../js/data/tiles.js';

// Format der Level (PLAN §4). Erreichbarkeit steht in test/reach.test.js.
const CHEST_KINDS = ['armor', 'bow', 'apple', 'cake', 'pick_stone', 'pick_iron', 'pick_diamond', 'emeralds'];
const BOSSES = ['slimeking', 'dreikopf', 'drache'];
const THEMES = ['overworld', 'depths', 'nether', 'end'];
const ID_RE = /^w([1-9])-([1-9])$/;

const countChar = (rows, ch) => rows.reduce((n, row) => n + row.split(ch).length - 1, 0);
// Grundgestein oder Barriere: fest und nicht abbaubar.
const unbreakable = (t) => t.solid && t.hard === null;

if (LEVELS.length === 0) {
  test('LEVELS ist leer: kein Level zu prüfen (Format-Prüfung greift ab D2)', () => {});
}

test('Level-IDs w<Welt>-<Nr>: 4 Level je Welt, Reihenfolge wie in LEVELS', () => {
  LEVELS.forEach((def, i) => {
    const world = Math.floor(i / 4) + 1, nr = (i % 4) + 1;
    assert.equal(def.id, `w${world}-${nr}`);
    assert.equal(def.world, world);
  });
});

for (const def of LEVELS) {
  const id = def.id;

  test(`${id}: parseLevel, Maße, Start/Portal/Bett, Rand`, () => {
    assert.match(id, ID_RE);
    const map = parseLevel(def);
    assert.ok(map.cols >= 100 && map.cols <= 250, `Spalten ${map.cols} außerhalb 100–250`);
    assert.ok(map.rows >= 30 && map.rows <= 70, `Zeilen ${map.rows} außerhalb 30–70`);
    assert.ok(THEMES.includes(def.theme), `Theme "${def.theme}" unbekannt`);
    assert.equal(countChar(def.rows, 'P'), 1, 'genau ein Start P');
    assert.equal(countChar(def.rows, 'F'), 1, 'genau ein Portal F');
    assert.ok(map.checkpoint, 'mindestens ein Bett K');

    const { cols, rows } = map;
    for (let r = 0; r < rows; r++) {
      for (const c of [0, cols - 1]) {
        assert.ok(unbreakable(TILE_BY_ID[map.tiles[r * cols + c]]), `Rand links/rechts bei ${c},${r} ist nicht Grundgestein`);
      }
    }
    // Unten: Grundgestein, Lava oder Grube (Luft) sind erlaubt.
    for (let c = 0; c < cols; c++) {
      const t = TILE_BY_ID[map.tiles[(rows - 1) * cols + c]];
      assert.ok(unbreakable(t) || t.hazard || t.id === 0, `Bodenrand bei ${c} ist weder Grundgestein, Lava noch Grube`);
    }
  });

  test(`${id}: 3 Diamanten, Truhen, Boss`, () => {
    const map = parseLevel(def);
    // Diamanten = Smaragd-Gems mit diamond plus Diamanterz (4), PLAN §4.
    const diamonds = map.gems.filter((g) => g.diamond).length + countChar(def.rows, '4');
    assert.equal(diamonds, 3, `Diamanten: ${diamonds}`);

    for (const [key, kind] of Object.entries(map.chests)) {
      const [c, r] = key.split(',').map(Number);
      assert.equal(TILE_BY_ID[map.tiles[r * map.cols + c]].kind, 'chest', `Truhe ${key} steht nicht auf einer Truhenkachel`);
      assert.ok(CHEST_KINDS.includes(kind), `Truhe ${key}: ungültiger Inhalt "${kind}"`);
    }
    assert.equal(countChar(def.rows, '?'), Object.keys(map.chests).length, 'Truhenkachel ohne Inhalt oder umgekehrt');

    if (def.boss !== undefined) {
      assert.ok(BOSSES.includes(def.boss), `Boss "${def.boss}" unbekannt`);
      assert.match(id, /-4$/, 'Boss nur in w*-4');
    }
    assert.equal(countChar(def.rows, '@'), def.boss ? 1 : 0, 'Boss-Start @ passt nicht zu boss');
  });
}
