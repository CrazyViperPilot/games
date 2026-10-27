// Kacheln (PLAN §3). Jeder Eintrag hat alle Felder; fehlende Booleans = false, light = 0.
// hard = Abbauzeit in s (null = nicht abbaubar), minPick = Mindest-Spitzhacke (PICKS-Index),
// drop = Ergebnis beim Abbau, art = Sprite-Name.
// Entitäts-Zeichen (P F K o * @ y c z s r m f g e) stehen hier nicht; sie erfasst game/level.js.

function tile(ch, id, kind, props = {}) {
  return {
    id, ch, kind,
    solid: false, oneWay: false, climb: false, water: false, hazard: false,
    bounce: false, soft: false, falls: false, light: 0,
    hard: null, minPick: 0, drop: null,
    art: 'blk_' + kind,
    ...props,
  };
}

// Zeichen → Eintrag (Level-Text).
export const TILES = {
  '.': tile('.', 0, 'air'),
  G: tile('G', 1, 'grass', { solid: true, soft: true, hard: 0.3 }),
  '#': tile('#', 2, 'dirt', { solid: true, soft: true, hard: 0.3 }),
  A: tile('A', 3, 'sand', { solid: true, soft: true, falls: true, hard: 0.3 }),
  S: tile('S', 4, 'stone', { solid: true, hard: 0.8 }),
  C: tile('C', 5, 'cobble', { solid: true, hard: 0.8 }),
  B: tile('B', 6, 'stonebrick', { solid: true, hard: 0.8 }),
  W: tile('W', 7, 'planks', { solid: true, soft: true, hard: 0.4 }),
  T: tile('T', 8, 'log', { solid: true, hard: 0.4 }),
  Y: tile('Y', 9, 'leaves', { solid: true, soft: true, hard: 0.3 }),
  1: tile('1', 10, 'coal', { solid: true, hard: 1.0, drop: { emeralds: 1 } }),
  2: tile('2', 11, 'iron', { solid: true, hard: 1.0, minPick: 1, drop: { emeralds: 3 } }),
  3: tile('3', 12, 'gold', { solid: true, hard: 1.0, minPick: 2, drop: { emeralds: 5 } }),
  4: tile('4', 13, 'diamondore', { solid: true, hard: 1.2, minPick: 2, drop: 'diamond' }),
  5: tile('5', 14, 'infested', { solid: true, hard: 0.8, drop: 'silverfish' }),
  '!': tile('!', 15, 'tnt', { solid: true, hard: 0.2, drop: 'tnt' }),
  M: tile('M', 16, 'spawner', { solid: true, light: 3, hard: 1.5, drop: { emeralds: 3 } }),
  X: tile('X', 17, 'obsidian', { solid: true, hard: 3.0, minPick: 3 }),
  Z: tile('Z', 18, 'bedrock', { solid: true }),
  N: tile('N', 19, 'netherrack', { solid: true, hard: 0.6 }),
  R: tile('R', 20, 'netherbrick', { solid: true, hard: 0.8 }),
  U: tile('U', 21, 'glowstone', { solid: true, light: 15, hard: 0.4 }),
  E: tile('E', 22, 'endstone', { solid: true, hard: 0.8 }),
  '?': tile('?', 23, 'chest', { solid: true, hard: 0.5, drop: 'chest' }),
  '=': tile('=', 24, 'slab', { oneWay: true, hard: 0.4 }),
  H: tile('H', 25, 'ladder', { climb: true, hard: 0.3 }),
  V: tile('V', 26, 'vine', { climb: true, hard: 0.2 }),
  L: tile('L', 27, 'lava', { hazard: true, light: 15 }),
  '~': tile('~', 28, 'water', { water: true }),
  J: tile('J', 29, 'slime', { solid: true, bounce: true, hard: 0.3 }),
  '|': tile('|', 30, 'torch', { light: 14, hard: 0.1 }),
  ',': tile(',', 31, 'plant', { hard: 0.1 }),
};

// Laufzeit-Kacheln ohne Zeichen (entstehen im Spiel, stehen nicht im Level-Text).
const BARRIER = tile(null, 40, 'barrier', { solid: true });   // Arena-Gitter, nicht abbaubar
const CHESTOPEN = tile(null, 41, 'chestopen', { solid: true, hard: 0.5 });

// Lookup id → Eintrag. Lücken sind mit dem air-Eintrag gefüllt, damit TILE_BY_ID[x] für x < 64 nie undefined ist.
const AIR = TILES['.'];
export const TILE_BY_ID = Array.from({ length: 64 }, () => AIR);
for (const ch of Object.keys(TILES)) TILE_BY_ID[TILES[ch].id] = TILES[ch];
TILE_BY_ID[BARRIER.id] = BARRIER;
TILE_BY_ID[CHESTOPEN.id] = CHESTOPEN;

// kind → id, z. B. TILE_IDS.bedrock === 18.
export const TILE_IDS = {};
for (const t of [...Object.values(TILES), BARRIER, CHESTOPEN]) TILE_IDS[t.kind] = t.id;

// Spitzhacken (Abbauzeit = hard × mult).
export const PICKS = [
  { name: 'wood', mult: 1.0 },
  { name: 'stone', mult: 0.7 },
  { name: 'iron', mult: 0.5 },
  { name: 'diamond', mult: 0.35 },
];
