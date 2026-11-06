// Stadt (PRD §15), Abfragen: Stufen und Summen je Zellenart, Strom, Einwohner für die Ausbildung, Ausbildungsgebäude, Ziele in der
// gegnerischen Stadt. Liest nur (research.js, combat.js, economy.js, UI). Kein DOM, deterministisch.
import { CITY } from '../../data/city.js';
import { KIND_ID } from '../../data/citykinds.js';
import { cellAt, anchorOf, isPart } from './cells.js';

/** Ausbildungsgebäude der Stadt (seit v4.96): Zellenart → Einheiten (CITY.produces). */
export const TRAINER_KINDS = Object.keys(CITY.produces);

/** Welches Stadtgebäude bildet `unit` aus? (Zellenart oder null) */
export function trainerKind(unit) {
  return TRAINER_KINDS.find((k) => CITY.produces[k].includes(unit)) ?? null;
}

/** Einwohner, die eine Einheit dieser Sorte braucht. */
export function crewOf(type) {
  return CITY.crew[type] ?? CITY.crew.default;
}

/** Einwohner, die gerade als Truppen dienen: lebende ausgebildete Einheiten (auch als Passagiere) des Teams. */
export function draftedCount(game, team) {
  let n = 0;
  for (const u of game.units) {
    if (!u.alive || u.team !== team) continue;
    n += u.crew ?? 0;
    for (const p of u.passengers ?? []) n += p.crew ?? 0;
  }
  return n;
}

/** Freie Einwohner für die Ausbildung: Einwohner minus Truppen minus Warteschlangen. */
export function freePop(game, team) {
  const c = game.city?.[team];
  if (!c) return Infinity;
  let queued = 0;
  for (const b of game.buildings) {
    if (!b.alive || b.team !== team) continue;
    for (const e of b.queue ?? []) queued += crewOf(e.unit);
  }
  for (const b of trainersOf(c)) for (const e of b.queue) queued += crewOf(e.unit);
  return Math.floor(c.popF + 1e-6) - draftedCount(game, team) - queued;
}

/** Lebende Ausbildungsgebäude einer Stadt (Set, wird in syncEntity/dropEntity gepflegt; ältere Spielstände legen es neu an). */
export function trainersOf(c) {
  return (c.trainers ??= new Set());
}

/** Ausbildungsgebäude der Stadt (Kaserne, Fabrikhalle, Heliport) eines Teams oder beider Teams (team weggelassen). */
export function cityTrainers(game, team) {
  if (!game.city) return [];
  const out = [];
  for (const c of game.city) if (team === undefined || c.team === team) for (const e of trainersOf(c)) if (e.alive) out.push(e);
  return out;
}

/** Höchste fertige Stufe einer Zellenart in der Stadt des Teams (0 = keine; ohne Stadt 0). */
export function cityLevel(game, team, kind) {
  const c = game.city?.[team];
  if (!c) return 0;
  const id = KIND_ID[kind];
  let lv = 0;
  for (const i of c.list) if (c.kind[i] === id && c.level[i] > lv) lv = c.level[i];
  return lv;
}

/** Summe der Stufen aller fertigen Gebäude dieser Art (Großbau einmal); ohne Stadt 0. */
export function citySum(game, team, kind) {
  const c = game.city?.[team];
  if (!c) return 0;
  const id = KIND_ID[kind];
  let n = 0;
  for (const i of c.list) if (c.kind[i] === id && !isPart(c, i)) n += c.level[i];
  return n;
}

/** Stromverhältnis der Stadt (1 = genug Strom); ohne Stadt 1. */
export function powerRatio(game, team) {
  return game.city?.[team]?.stats.powerRatio ?? 1;
}

/** Stadtgebäude (Ziel-Entity) eines Teams in der Zelle unter (x, y), oder null. */
export function cityEntityAt(game, x, y) {
  for (const c of game.city ?? []) {
    const [q, r] = cellAt(c, x, y);
    if (q < 0 || r < 0 || q >= c.cols || r >= c.rows) continue;
    const e = c.ents.get(anchorOf(c, r * c.cols + q));
    if (e && e.alive) return e;
  }
  return null;
}

/** Fremde Stadtgebäude (aus Sicht von `team`) im Quadrat um (x, y) mit Radius `radius` an fn übergeben. */
export function forEnemyCity(game, team, x, y, radius, fn) {
  if (!game.city) return;
  for (const c of game.city) {
    if (c.team === team || !c.ents.size) continue;
    const S = c.cell;
    const q0 = Math.max(0, Math.floor((x - radius) / S));
    const q1 = Math.min(c.cols - 1, Math.floor((x + radius) / S));
    const r0 = Math.max(0, Math.floor((y - radius) / S));
    const r1 = Math.min(c.rows - 1, Math.floor((y + radius) / S));
    if ((q1 - q0 + 1) * (r1 - r0 + 1) > c.ents.size * 4) {
      for (const e of c.ents.values()) {
        const m = radius + S / 2 + (e.w * game.grid.tile) / 2; // halbe Gebäudebreite (Großbau größer)
        if (e.alive && Math.abs(e.x - x) <= m && Math.abs(e.y - y) <= m) fn(e);
      }
      continue;
    }
    let seen = null; // Großbau nur einmal melden, auch wenn mehrere seiner Zellen im Quadrat liegen
    for (let r = r0; r <= r1; r++) {
      for (let q = q0; q <= q1; q++) {
        const i = r * c.cols + q;
        const a = anchorOf(c, i);
        const e = c.ents.get(a);
        if (!e || !e.alive) continue;
        if (c.part?.[i]) {
          seen ??= new Set();
          if (seen.has(a)) continue;
          seen.add(a);
        }
        fn(e);
      }
    }
  }
}

/** Hat `team` mindestens einen fertigen Markt? (Handel, Marktmenü über die Geldanzeige) */
export function hasMarket(game, team) {
  const c = game.city?.[team];
  if (!c) return false;
  for (const i of c.list) if (c.kind[i] === KIND_ID.market && c.level[i]) return true;
  return false;
}
