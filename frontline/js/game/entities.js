// Fabriken für Einheiten, Gebäude und Granaten (PLAN.md §4, §5, §11). Reine Funktionen, kein Zugriff auf Game.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';

/**
 * Einheit. Zusätzliche Felder: goalX/goalY (Ziel der letzten Planung), repathTimer, needPath.
 * Vorrat: ammo/fuel (voll beim Spawn), cargo/preset (LKW-Ladung und Ladungsart).
 */
export function createUnit(id, type, team, x, y) {
  const def = UNITS[type];
  return {
    id,
    kind: 'unit',
    type,
    team,
    def,
    x,
    y,
    angle: 0,
    hp: def.hp,
    maxHp: def.hp,
    alive: true,
    order: { type: 'idle', x, y, targetId: null },
    path: [],
    pathIndex: 0,
    targetId: null,
    cooldown: 0,
    scanTimer: (id % 5) * 0.05, // verteilt die Zielsuche über die Zeit
    anchorX: x,
    anchorY: y,
    lastHitTime: -1e9,
    goalX: x,
    goalY: y,
    repathTimer: 0,
    needPath: false,
    speedMul: 1, // 0.25 bei Fahrzeugen ohne Treibstoff (movement.js)
    ammo: def.ammoMax ?? 0,
    fuel: def.fuelMax ?? 0,
    cargo: { bm: 0, mun: 0, fuel: 0 },
    preset: 'mix', // LKW-Ladungsart: 'mix' | 'bm' | 'mun' | 'fuel'
  };
}

/**
 * Gebäude als Baustelle (built = false, hp = 10 %) oder fertig – je nach Aufrufer.
 * x, y = Mittelpunkt des Fußabdrucks; Sammelpunkt 2 Zellen unterhalb.
 * Zusätzliche Felder: nodeId (Förderanlage), store (FOB-Lager, Baustellen nutzen es ebenfalls),
 * payerId (Lager, aus dem bezahlt wurde – für Erstattung), supplied (FOB-Baustelle hat ihr Material),
 * warnTime (Meldungszeit „Baustelle wartet …“).
 */
export function createBuilding(id, type, team, cx, cy, tile) {
  const def = BUILDINGS[type];
  const { w, h } = def;
  const x = (cx + w / 2) * tile;
  const y = (cy + h / 2) * tile;
  return {
    id,
    kind: 'building',
    type,
    team,
    def,
    x,
    y,
    cx,
    cy,
    w,
    h,
    hp: def.hp * 0.1,
    maxHp: def.hp,
    alive: true,
    built: false,
    progress: 0,
    queue: [], // Einträge { unit, payerId }
    queueTime: 0,
    rallyX: x,
    rallyY: y + (h / 2 + 2) * tile,
    targetId: null,
    cooldown: 0,
    aaCooldown: 0,
    scanTimer: (id % 5) * 0.05,
    nodeId: null,
    lastHitTime: -1e9,
    demolished: false,
    store: { bm: 0, mun: 0, fuel: 0 },
    payerId: null,
    supplied: type !== 'fob', // FOB-Baustelle: erst nach 400 Baumaterial im eigenen Lager
    warnTime: -1e9,
  };
}

/**
 * Mörsergranate. `def` = Waffenwerte mit damage (je Panzerklasse) und splash.
 * Flugzeit = Distanz / 300.
 */
export function createShell(id, team, sx, sy, tx, ty, def) {
  const d = Math.hypot(tx - sx, ty - sy);
  return {
    id,
    team,
    sx,
    sy,
    tx,
    ty,
    x: sx,
    y: sy,
    t: 0,
    duration: d / 300,
    damage: def.damage,
    splash: def.splash,
    alive: true,
  };
}

/** Radius einer Entity für Reichweiten- und Trennungsprüfungen. */
export function radiusOf(e) {
  return e.kind === 'unit' ? e.def.radius : (Math.max(e.w, e.h) * BALANCE.map.tile) / 2;
}

/** Mittelpunkte: b ist in Reichweite `range` von a (Zielradius wird addiert). */
export function inRange(a, b, range) {
  return Math.hypot(b.x - a.x, b.y - a.y) <= range + radiusOf(b);
}
