// Spielstand eines laufenden Spiels (Game + KI) als JSON-Abbild und zurück. Kein DOM. Technik: core/snapshot.js.
import { QUICK, BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { MAPGEN } from '../data/mapgen.js';
import { CITY } from '../data/city.js';
import * as AI_CONST from '../data/ai.js';
import { encode, decode } from '../core/snapshot.js';
import { Game } from './game.js';
import { gridDelta, patchGrid } from './grid.js';
import { Fog } from './fog.js';
import { Relief, reliefOf, keepRelief } from './relief.js';
import { terrainGrid } from './mapdata.js';
import { AI } from '../ai/ai.js';

/** Feste Spielwerte: Verweise darauf werden nicht kopiert. */
const STATICS = { QUICK, BALANCE, UNITS, BUILDINGS, MAPGEN, CITY, AI_CONST };
// Grid und Relief fehlen mit Absicht: beide entstehen beim Laden neu; ein Verweis von anderswo bricht das Speichern ab, statt still
// eine Kopie zu speichern, die nach dem Laden nicht mehr dasselbe Objekt wäre.
const CLASSES = { Game, Fog, AI };

/** Version des Abbilds; bei inkompatibler Änderung der Spielzustände erhöhen (alte Stände werden dann nicht geladen). */
// 2 seit v5.14: größere Karte (11072 px). 3 seit v5.56: Migrationen alter Stände entfernt (Flughafen, Universität und Werke als
// Einzelzellen, alter Forschungsbaum, FOB-Baustellen, F-16 mit einer Waffe); Daniels Entscheidung: alte Stände müssen nicht laden.
// 4 seit v5.58: Buchhaltung der Stadt-KI in der KI-Instanz (AI.cityMem) statt im Stadtzustand.
// 5 seit v5.62: ohne Abgeleitetes (Review-Paket P9): Gelände (game.relief) nur als Grobraster oder gar nicht, Raster (game.grid) nur
// als Unterschied zum Raster der Karte; Sichtfelder der Entities nur als Ort der Berechnung (fog.js), Arbeitsspeicher des Nebels gar nicht.
export const SAVE_FORMAT = 5;

/**
 * Grundraster je Karte (terrainGrid), damit Autospeichern es nicht jedes Mal neu rastert (rund 10 ms); nur zum Vergleichen, nie
 * verändert. Es muss zur Karte von jetzt passen (das Laden rastert die gespeicherte Karte): Räumen streicht Stadthäuser aus
 * map.town.buildings, darum gilt es nur, solange Gelände und Listen der Karte dieselben Objekte mit derselben Länge sind.
 */
const bases = new WeakMap(); // Karte → { key, grid }

function baseGrid(map, relief) {
  const lists = [map.obstacles, map.town?.buildings, map.town?.trees, map.trees, map.fords];
  const key = [relief, ...lists, ...lists.map((l) => l?.length)];
  let b = bases.get(map);
  if (!b || b.key.some((v, i) => v !== key[i])) bases.set(map, (b = { key, grid: terrainGrid(map, relief) }));
  return b.grid;
}

/**
 * Gelände für den Spielstand: null, wenn es genau dem Text map.relief entspricht (Karten aus dem Editor), sonst nur das Grobraster
 * (Zufallskarten: der Generator rechnet mit ungerundeten Höhen, map.relief hält sie auf 2 px gerundet). Das Feinraster entsteht
 * beim Laden daraus neu (Relief-Konstruktor).
 */
const sameAsText = new WeakMap(); // Relief → entspricht es map.relief?

function reliefDesc(map, relief) {
  let same = sameAsText.get(relief);
  if (same === undefined) {
    const d = Relief.decode(map.relief);
    same = !!d && d.coarse.length === relief.coarse.length && d.coarse.every((v, i) => v === relief.coarse[i]);
    sameAsText.set(relief, same);
  }
  return same ? null : { coarse: relief.coarse };
}

/**
 * Spielstand als JSON-Abbild. Abgeleitetes fehlt: das Gelände entsteht beim Laden aus `map.relief` bzw. dem Grobraster, das Raster
 * aus der Karte (terrainGrid) plus dem gespeicherten Unterschied (Gebäude, Brücken, gerodete und gebaggerte Zellen …).
 */
export function snapshotGame(game, ai) {
  const replace = new Map([[game.grid, gridDelta(game.grid, baseGrid(game.map, game.relief))]]);
  if (game.relief) replace.set(game.relief, reliefDesc(game.map, game.relief));
  return encode({ game, ai }, STATICS, CLASSES, replace);
}

export function restoreGame(data) {
  const { game, ai } = decode(data, STATICS, CLASSES);
  game.sapperMines ??= []; // Stände vor Paket E8 haben keine Pionier-Minen
  const rd = game.relief;
  game.relief = rd ? new Relief(rd.coarse) : reliefOf(game.map);
  if (rd) keepRelief(game.map, game.relief); // Darstellung (reliefOf) zeigt dasselbe Gelände wie die Simulation
  game.grid = patchGrid(terrainGrid(game.map, game.relief), game.grid);
  game.restoreAccessors();
  return { game, ai };
}
