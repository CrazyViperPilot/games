// Level-Parser v2 (PLAN §3, §4, §6): Level-Definition → LevelMap.
import { PHYS } from '../data/physics.js';
import { TILES, TILE_BY_ID, TILE_IDS } from '../data/tiles.js';

const T = PHYS.tile;
const BEDROCK_ID = TILES.Z.id;
const AIR_ID = TILES['.'].id;
const MIN_ROWS = 8;

// Entitäts-Zeichen (keine Kacheln).
const SINGLE = { P: 'start', F: 'goal', K: 'checkpoint' };
const FOODS = { a: 'bread', q: 'steak' };
const GEMS = { o: false, '*': true };
const SPAWN_TYPES = {
  '@': 'boss', c: 'zischer', z: 'zombie', s: 'skeleton', r: 'spider',
  m: 'slime', f: 'silverfish', g: 'glutgeist', e: 'leerenlaeufer',
};

// Position in Weltpixeln: x = Mitte der Zelle, y = Unterkante der Zelle.
function cellPos(c, r) {
  return { x: (c + 0.5) * T, y: (r + 1) * T };
}

export function parseLevel(def) {
  const id = def && def.id;
  if (!def || !Array.isArray(def.rows)) throw new Error(`Level ${id}: rows fehlt`);
  const rowsDef = def.rows;
  const R = rowsDef.length;
  if (R < MIN_ROWS) throw new Error(`Level ${id}: ${R} Zeilen, mindestens ${MIN_ROWS} nötig`);
  const cols = typeof rowsDef[0] === 'string' ? rowsDef[0].length : 0;
  if (cols === 0) throw new Error(`Level ${id}: leere Zeilen`);
  for (let r = 0; r < R; r++) {
    const row = rowsDef[r];
    if (typeof row !== 'string' || row.length !== cols) {
      throw new Error(`Level ${id}: Zeile ${r} hat nicht ${cols} Zeichen`);
    }
  }

  const tiles = new Uint8Array(cols * R);
  const gems = [];
  const crystals = [];
  const doors = [];
  const spawns = [];
  const foods = [];
  let start = null;
  let goal = null;
  let checkpoint = null;
  let bossSeen = false;

  for (let r = 0; r < R; r++) {
    const row = rowsDef[r];
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      if (Object.hasOwn(TILES, ch)) {
        tiles[r * cols + c] = TILES[ch].id;
        continue;
      }
      const pos = cellPos(c, r);
      if (Object.hasOwn(SINGLE, ch)) {
        const kind = SINGLE[ch];
        if (kind === 'start') {
          if (start) throw new Error(`Level ${id}: mehr als ein P`);
          start = pos;
        } else if (kind === 'goal') {
          if (goal) throw new Error(`Level ${id}: mehr als ein F`);
          goal = pos;
        } else {
          if (checkpoint) throw new Error(`Level ${id}: mehr als ein K`);
          checkpoint = pos;
        }
      } else if (Object.hasOwn(GEMS, ch)) {
        gems.push({ x: pos.x, y: pos.y, diamond: GEMS[ch], taken: false });
      } else if (Object.hasOwn(FOODS, ch)) {
        foods.push({ kind: FOODS[ch], x: pos.x, y: pos.y });
      } else if (ch === ':') {
        doors.push({ c, r });
      } else if (ch === 'y') {
        crystals.push({ x: pos.x, y: pos.y });
      } else if (Object.hasOwn(SPAWN_TYPES, ch)) {
        if (ch === '@') {
          if (bossSeen) throw new Error(`Level ${id}: mehr als ein @`);
          bossSeen = true;
        }
        spawns.push({ type: SPAWN_TYPES[ch], x: pos.x, y: pos.y });
      } else {
        throw new Error(`Level ${id}: unbekanntes Zeichen "${ch}" bei Spalte ${c}, Zeile ${r}`);
      }
    }
  }

  if (!start) throw new Error(`Level ${id}: kein P (Spielerstart)`);
  if (!goal) throw new Error(`Level ${id}: kein F (Zielfahne)`);

  // Erste feste Zeile von oben je Spalte (sonst R).
  const surface = new Int16Array(cols);
  for (let c = 0; c < cols; c++) {
    let s = R;
    for (let r = 0; r < R; r++) {
      const t = tiles[r * cols + c];
      if (t !== TILE_IDS.leaves && TILE_BY_ID[t].solid) { s = r; break; }
    }
    surface[c] = s;
  }

  const map = {
    id,
    theme: def.theme,
    cols,
    rows: R,
    tiles,
    surface,
    // Außerhalb links/rechts/oben: Grundgestein. Unten: leer (Grube).
    get(c, r) {
      if (r >= R) return AIR_ID;
      if (r < 0 || c < 0 || c >= cols) return BEDROCK_ID;
      return tiles[r * cols + c];
    },
    set(c, r, v) {
      if (c < 0 || c >= cols || r < 0 || r >= R) return;
      tiles[r * cols + c] = v;
    },
    isSolid(c, r) {
      return TILE_BY_ID[map.get(c, r)].solid;
    },
    start,
    checkpoint,
    goal,
    spawns,
    gems,
    foods,
    chests: def.chests || {},
    boss: def.boss,
    crystals,
    doors,
    pick: def.pick || 0,
  };
  return map;
}
