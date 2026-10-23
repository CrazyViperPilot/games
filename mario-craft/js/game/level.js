// Level-Parser (PLAN §4.2, §5): Level-Definition → LevelMap.
import { PHYS } from '../data/physics.js';
import { TILES, TILE_BY_ID } from '../data/tiles.js';

const T = PHYS.tile;
const GROUND_ID = TILES['#'].id;

// Entitäts-Zeichen, die keine Kachel sind.
const ENTITY_KINDS = {
  P: 'start', F: 'goal', K: 'checkpoint', o: 'coin', '*': 'starCoin',
  g: 'walker', k: 'beetle', h: 'hopper', s: 'spiky', l: 'lavaball', b: 'boss',
};
const SPAWN_TYPES = { g: 'walker', k: 'beetle', h: 'hopper', s: 'spiky', l: 'lavaball', b: 'boss' };

// Position in Weltpixeln: x = Mitte der Zelle, y = Unterkante der Zelle.
function cellPos(c, r) {
  return { x: (c + 0.5) * T, y: (r + 1) * T };
}

export function parseLevel(def) {
  const id = def && def.id;
  if (!def || !Array.isArray(def.rows)) throw new Error(`Level ${id}: rows fehlt`);
  const rowsDef = def.rows;
  const R = PHYS.rows;
  if (rowsDef.length !== R) throw new Error(`Level ${id}: ${rowsDef.length} Zeilen statt ${R}`);
  const cols = typeof rowsDef[0] === 'string' ? rowsDef[0].length : 0;
  if (cols === 0) throw new Error(`Level ${id}: leere Zeilen`);
  for (let r = 0; r < R; r++) {
    const row = rowsDef[r];
    if (typeof row !== 'string' || row.length !== cols) {
      throw new Error(`Level ${id}: Zeile ${r} hat nicht ${cols} Zeichen`);
    }
  }

  const tiles = new Uint8Array(cols * R);
  const coins = [];
  const spawns = [];
  let start = null;
  let goal = null;
  let checkpoint = null;

  for (let r = 0; r < R; r++) {
    const row = rowsDef[r];
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      if (Object.hasOwn(TILES, ch)) {
        tiles[r * cols + c] = TILES[ch].id;
        continue;
      }
      if (!Object.hasOwn(ENTITY_KINDS, ch)) {
        throw new Error(`Level ${id}: unbekanntes Zeichen "${ch}" bei Spalte ${c}, Zeile ${r}`);
      }
      const pos = cellPos(c, r);
      switch (ENTITY_KINDS[ch]) {
        case 'start':
          if (start) throw new Error(`Level ${id}: mehr als ein P`);
          start = pos; break;
        case 'goal':
          if (goal) throw new Error(`Level ${id}: mehr als ein F`);
          goal = pos; break;
        case 'checkpoint':
          if (checkpoint) throw new Error(`Level ${id}: mehr als ein K`);
          checkpoint = pos; break;
        case 'coin': coins.push({ x: pos.x, y: pos.y, star: false }); break;
        case 'starCoin': coins.push({ x: pos.x, y: pos.y, star: true }); break;
        default: spawns.push({ type: SPAWN_TYPES[ch], x: pos.x, y: pos.y }); break;
      }
    }
  }

  if (!start) throw new Error(`Level ${id}: kein P (Spielerstart)`);
  if (!goal) throw new Error(`Level ${id}: kein F (Zielfahne)`);

  const map = {
    id,
    theme: def.theme,
    cols,
    rows: R,
    tiles,
    // Außerhalb links/rechts: fest. Oben: leer. Unten: leer (Grube).
    get(c, r) {
      if (r < 0 || r >= R) return 0;
      if (c < 0 || c >= cols) return GROUND_ID;
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
    coins,
    items: def.items || {},
    platforms: def.platforms || [],
    boss: def.boss,
  };
  return map;
}
