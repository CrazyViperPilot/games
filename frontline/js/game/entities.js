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
  const u = {
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
    // Waffen mit eigenem Schussvorrat (rounds) und Abklingzeit (cd); `ammo` ist der Munitionswert aller Schüsse zusammen
    weapons: (def.weapons ?? []).map((spec) => ({ spec, rounds: spec.rounds, cd: 0 })),
    fuel: def.fuelMax ?? 0,
    cargo: { bm: def.bmCap ?? 0, mun: 0, fuel: 0 }, // Soldaten starten mit vollem Baumaterial (bmCap)
    preset: 'mix', // LKW-Ladungsart: 'mix' | 'bm' | 'mun' | 'fuel'
    passengers: [], // Hubschrauber: eingestiegene Einheiten (alive = false, solange sie an Bord sind)
    house: 0, // ID des besetzten Stadthauses (garrison.js; Häuser haben negative IDs), 0 = draußen
    crate: 0, // ID der getragenen Versorgungskiste (crates.js; negativ), 0 = keine
  };
  // `ammo` = Munitionswert (Lagereinheiten) der vorhandenen Schüsse; Zuweisen füllt alle Waffen im gleichen Verhältnis
  Object.defineProperty(u, 'ammo', {
    enumerable: true,
    get() {
      let sum = 0;
      for (const w of this.weapons) sum += w.rounds * w.spec.munCost;
      return sum;
    },
    set(v) {
      const f = def.ammoMax > 0 ? Math.min(1, Math.max(0, v / def.ammoMax)) : 0;
      for (const w of this.weapons) w.rounds = w.spec.rounds * f;
    },
  });
  return u;
}

/** Füllt die Waffen der Reihe nach mit `amount` Munition (Lagereinheiten) auf; liefert, was verbraucht wurde. */
export function addAmmo(u, amount) {
  let left = amount;
  for (const w of u.weapons) {
    const room = (w.spec.rounds - w.rounds) * w.spec.munCost;
    if (room <= 1e-9) continue;
    const take = Math.min(room, left);
    w.rounds = take >= room - 1e-9 ? w.spec.rounds : w.rounds + take / w.spec.munCost;
    left -= take;
    if (left <= 1e-9) break;
  }
  return amount - left;
}

/** Bewaffnet, aber ohne einen einzigen vollen Schuss (nichts zu feuern). */
export function lacksAmmo(u) {
  return u.weapons.length > 0 && !u.weapons.some((w) => w.rounds >= 1);
}

/**
 * Gebäude als Baustelle (built = false, hp = 10 %) oder fertig – je nach Aufrufer.
 * x, y = Mittelpunkt des Fußabdrucks; Sammelpunkt 2 Zellen unterhalb.
 * Zusätzliche Felder: main (Haupt-FOB: bildet alle Einheiten aus, Verlust = Niederlage), infinite (unendliches Lager; bei der Haupt-FOB),
 * produces (ausbildbare Einheiten; nur die Haupt-FOB),
 * store (FOB-Lager, Baustellen nutzen es ebenfalls),
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
    queueTimes: [], // Fortschritt je Eintrag (s), parallel zu queue; nur die ersten trainSlots laufen
    rallyX: x,
    rallyY: y + (h / 2 + 2) * tile,
    targetId: null,
    cooldown: 0,
    aaCooldown: 0,
    scanTimer: (id % 5) * 0.05,
    main: false,
    infinite: false,
    produces: type === 'fob' ? [] : def.produces,
    lastHitTime: -1e9,
    demolished: false,
    store: { bm: 0, mun: 0, fuel: 0 },
    payerId: null,
    fireTarget: null, // Mörser: gewähltes Ziel {x, y}
    drill: def.drill ? { builtAt: null, state: 'warmup', endAt: 0, readyAt: 0, activatedAt: 0, frac: 0 } : null, // Bohrer
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

/** Gegner von `team`? Leere Stadthäuser (team −1) sind niemandes Gegner. */
export const isFoe = (team, e) => !!e && e.team >= 0 && e.team !== team;

/** Lebendes Ziel hinter einer ID: wer in einem Haus sitzt, wird über das Haus getroffen. */
export function resolveTarget(game, id) {
  const t = game.getEntity(id);
  return t && t.house ? game.getEntity(t.house) : t;
}

/** Radius einer Entity für Reichweiten- und Trennungsprüfungen. */
export function radiusOf(e) {
  return e.kind === 'unit' ? e.def.radius : (Math.max(e.w, e.h) * BALANCE.map.tile) / 2;
}

/** Mittelpunkte: b ist in Reichweite `range` von a (Zielradius wird addiert). */
export function inRange(a, b, range) {
  return Math.hypot(b.x - a.x, b.y - a.y) <= range + radiusOf(b);
}
