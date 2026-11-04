// Spielstand eines laufenden Spiels (Game + KI) als JSON-Abbild und zurück. Kein DOM. Technik: core/snapshot.js.
import { QUICK, BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { MAPGEN } from '../data/mapgen.js';
import { CITY } from '../data/city.js';
import * as AI_CONST from '../data/ai.js';
import { encode, decode } from '../core/snapshot.js';
import { Game } from './game.js';
import { Grid } from './grid.js';
import { Fog } from './fog.js';
import { Relief } from './relief.js';
import { AI } from '../ai/ai.js';

/** Feste Spielwerte: Verweise darauf werden nicht kopiert. */
const STATICS = { QUICK, BALANCE, UNITS, BUILDINGS, MAPGEN, CITY, AI_CONST };
const CLASSES = { Game, Grid, Fog, Relief, AI };

/** Version des Abbilds; bei inkompatibler Änderung der Spielzustände erhöhen (alte Stände werden dann nicht geladen). */
export const SAVE_FORMAT = 2; // 2 seit v5.14: größere Karte (11072 px), Stände der alten Größe passen nicht mehr

export function snapshotGame(game, ai) {
  return encode({ game, ai }, STATICS, CLASSES);
}

export function restoreGame(data) {
  const { game, ai } = decode(data, STATICS, CLASSES);
  game.restoreAccessors();
  return { game, ai };
}
