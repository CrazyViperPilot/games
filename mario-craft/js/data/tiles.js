// Kachel-Zeichen (PLAN §4.2). id 0 = leer, andere ids als kleine Ganzzahlen für Uint8Array.
// Entitäts-Zeichen (P F K o * g k h s l b) stehen hier nicht; sie werden in game/level.js erfasst.
export const TILES = {
  '.': { id: 0,  solid: false, oneWay: false, hazard: false, kind: 'empty' },
  '#': { id: 1,  solid: true,  oneWay: false, hazard: false, kind: 'ground' },
  'B': { id: 2,  solid: true,  oneWay: false, hazard: false, kind: 'brick' },
  '?': { id: 3,  solid: true,  oneWay: false, hazard: false, kind: 'bonus' },
  '!': { id: 4,  solid: true,  oneWay: false, hazard: false, kind: 'invisible' },
  'H': { id: 5,  solid: true,  oneWay: false, hazard: false, kind: 'hard' },
  '=': { id: 6,  solid: false, oneWay: true,  hazard: false, kind: 'platform' },
  'L': { id: 7,  solid: false, oneWay: false, hazard: true,  kind: 'lava' },
  '^': { id: 8,  solid: false, oneWay: false, hazard: true,  kind: 'spikes' },
  '|': { id: 9,  solid: true,  oneWay: false, hazard: false, kind: 'pipe' },
  '[': { id: 10, solid: true,  oneWay: false, hazard: false, kind: 'pipe' },
  ']': { id: 11, solid: true,  oneWay: false, hazard: false, kind: 'pipe' },
  'D': { id: 12, solid: false, oneWay: false, hazard: false, kind: 'deco' },
};

// Lookup id → Eintrag (Index = id).
export const TILE_BY_ID = [];
for (const ch of Object.keys(TILES)) TILE_BY_ID[TILES[ch].id] = TILES[ch];

// Zustände ohne Zeichen: entstehen nur zur Laufzeit (game/items.js, game/game.js), nicht im Level-Text.
// USED: leerer Bonusblock nach dem Treffer. BARRIER: unsichtbare Wand vor der Zielfahne bei Boss-Levels.
export const USED_TILE = { id: 13, solid: true, oneWay: false, hazard: false, kind: 'used' };
export const BARRIER_TILE = { id: 14, solid: true, oneWay: false, hazard: false, kind: 'barrier' };
TILE_BY_ID[USED_TILE.id] = USED_TILE;
TILE_BY_ID[BARRIER_TILE.id] = BARRIER_TILE;
