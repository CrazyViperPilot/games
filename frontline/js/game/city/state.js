// Stadt (PRD §15), Zustand der Zellen: Kennzahlen (totals, zeroStats), Gebiet (updateClaim), Belegung im Spielraster, Ziel-Entities
// der Gebäude, Erstattung, Stahlpreis der Einheiten, fertige Zellen ohne Kosten (Startviertel) und Flucht bei Lärm. Kein DOM, deterministisch.
import { BALANCE } from '../../data/balance.js';
import { CITY } from '../../data/city.js';
import { KINDS, KIND_ID, KIND_NAME, WORKS } from '../../data/citykinds.js';
import { UNITS } from '../../data/units.js';
import { nearestPassable } from '../movement.js';
import { isFlat, DEPOSITS, MINE_NAME, cellAt, sizeOf, isPart, bigCenter, bigCells, fitBig, cellRect, eachTile, cellFree } from './cells.js';
import { trainersOf } from './query.js';

/** Waren, die Werke erzeugen (Ertrag CITY.yield): je eine Rate in den Stadtzahlen und in cap/inp/gross. */
const MADE_GOODS = Object.keys(CITY.yield);

export const zeroGoods = (list) => Object.fromEntries(list.map((g) => [g, 0]));

export const zeroStats = () => ({ powerSupply: 0, powerUse: 0, powerRatio: 1, happy: 1, shop: 0, shopSupply: 1, shopBm: 0, pop: 0, housing: 0, jobs: 0, jobsCom: 0, workers: 0, drafted: 0, free: 0, fled: 0, ...zeroGoods(MADE_GOODS), money: 0, lost: 0, jam: 1, raw: { wood: 0, stone: 0, ore: 0, oil: 0 }, cap: zeroGoods(MADE_GOODS), inp: zeroGoods(MADE_GOODS), gross: zeroGoods(MADE_GOODS) });

/**
 * Fertige Zelle setzen (Stufe 1) ohne Kosten und ohne Wartezeit: Startviertel. Großbau (seit v5.08 die 2 × 2-Raffinerie): ein Quadrat,
 * das die Zelle enthält (am liebsten mit ihr als Anker, also nach rechts unten), nur auf leeren Zellen ohne Vorkommen.
 */
export function placeBuilt(game, c, i, kind) {
  const col = i % c.cols;
  const row = (i - col) / c.cols;
  if (sizeOf(kind) > 1) {
    const a = fitBig(game, c, col, row, kind, (j) => !c.kind[j] && !c.deposit[j]);
    if (a >= 0) placeBuiltBig(game, c, a, kind);
    return;
  }
  c.kind[i] = KIND_ID[kind];
  if (kind !== 'road') {
    if (!cellFree(game, c, col, row)) return;
    occupyCell(game, c, col, row);
    c.level[i] = 1;
    syncEntity(game, c, i);
  }
}

/** Fertigen Großbau (Stufe 1) mit Anker a setzen, ohne Kosten: Startviertel. */
export function placeBuiltBig(game, c, a, kind) {
  for (const j of bigCells(c, a, sizeOf(kind))) {
    const q = j % c.cols;
    c.kind[j] = KIND_ID[kind];
    c.part[j] = a + 1;
    c.level[j] = 1;
    occupyCell(game, c, q, (j - q) / c.cols);
  }
  syncEntity(game, c, a);
}

/** Gebiet neu berechnen: Kreise um die eigenen fertigen FOBs (Hauptstadt größer) und um fertige Stadtgebäude. */
export function updateClaim(game, c) {
  const next = new Uint8Array(c.claim.length);
  const stamp = (x, y, rad) => {
    const [cc, cr] = cellAt(c, x, y);
    for (let r = Math.max(0, cr - rad); r <= Math.min(c.rows - 1, cr + rad); r++) {
      for (let q = Math.max(0, cc - rad); q <= Math.min(c.cols - 1, cc + rad); q++) {
        if ((q - cc) ** 2 + (r - cr) ** 2 <= rad * rad + rad) next[r * c.cols + q] = 1;
      }
    }
  };
  const TR = CITY.territory;
  for (const b of game.buildings) {
    if (!b.alive || !b.built || b.team !== c.team || b.type !== 'fob') continue;
    stamp(b.x, b.y, b.main ? TR.main : TR.fob);
  }
  for (const i of c.list) {
    if (!c.level[i] || isFlat(c.kind[i]) || isPart(c, i)) continue;
    stamp((i % c.cols + 0.5) * c.cell + c.x0, (Math.floor(i / c.cols) + 0.5) * c.cell + c.y0, TR.building);
  }
  let changed = false;
  for (let i = 0; i < next.length; i++) if (next[i] !== c.claim[i]) { changed = true; break; }
  if (changed) {
    c.claim = next;
    c.claimVer++;
  }
}

/** Liste der belegten Zellen neu aufbauen (nach einem Befehl). */
export function rebuildList(c) {
  const out = [];
  for (let i = 0; i < c.kind.length; i++) if (c.kind[i]) out.push(i);
  c.list = out;
  c.ver++;
}

/** Schuss oder Einschlag bei (x, y): Bewohner der Wohnzellen in der Konfliktzone ringsum fliehen (CITY.flee). */
export function cityNoise(game, x, y) {
  if (!game.city) return;
  const R = CITY.flee.reach;
  for (const c of game.city) {
    const [cc, cr] = cellAt(c, x, y);
    for (let r = cr - R; r <= cr + R; r++) {
      if (r < 0 || r >= c.rows) continue;
      for (let q = cc - R; q <= cc + R; q++) {
        if (q < 0 || q >= c.cols) continue;
        const i = r * c.cols + q;
        if (!c.inZone[i] || c.kind[i] !== KIND_ID.res || !c.level[i]) continue;
        if (c.flee[i] === 0) c.ver++; // Bewohner fliehen: Pendlerziele ändern sich (transport.js rechnet die Wege neu, seit v5.20)
        c.flee[i] = CITY.flee.calm;
      }
    }
  }
}

/** Stadtgebäude sperrt seine Zelle für Einheiten; Bodeneinheiten darin rücken an den nächsten freien Platz. */
export function occupyCell(game, c, col, row) {
  eachTile(game, c, col, row, (x, y) => {
    const i = game.grid.idx(x, y);
    if (!game.grid.struct[i]) game.grid.struct[i] = c.gridId;
  });
  const r = cellRect(c, col, row);
  for (const u of game.units) {
    if (!u.alive || u.house || u.def.air || u.x < r.x0 || u.x >= r.x1 || u.y < r.y0 || u.y >= r.y1) continue;
    const p = nearestPassable(game.grid, u.x, u.y, u.team);
    if (p) {
      u.x = p.x;
      u.y = p.y;
    }
  }
}

/** Summen (Wohnplätze, Arbeitsplätze je Art) aus den gebauten Zellen; geflohene Wohnzellen zählen nicht. */
export function totals(c) {
  const t = { housing: 0, fled: 0, jobsCom: 0, ...zeroGoods(WORKS), mine: { wood: 0, stone: 0, ore: 0, oil: 0 }, market: 0, power: 0, powerJobs: 0, uni: 0, dc: 0, jobsOther: 0, use: 0 }; // je Werk seine Arbeitsplätze
  t.n = { ...zeroGoods(WORKS), mine: { wood: 0, stone: 0, ore: 0, oil: 0 } }; // fertige Gebäude je Art (Flussanzeige)
  for (const i of c.list) {
    const lv = c.level[i];
    if (!lv || isPart(c, i)) continue; // ein Großbau zählt einmal (über seine Mitte)
    const k = KINDS[c.kind[i] - 1];
    if (k === 'mine') {
      const d = DEPOSITS[c.deposit[i] - 1];
      if (d) t.n.mine[d]++;
    } else if (k in t.n) t.n[k]++;
    t.use += (CITY.power.use[k] ?? 0) * lv; // Strombedarf
    if (k === 'power') {
      t.power += CITY.power.supply[lv];
      t.powerJobs += CITY.jobs[lv];
      t.jobsOther += CITY.jobs[lv];
    } else if (k === 'uni') {
      t.uni = Math.max(t.uni, lv);
      t.jobsOther += CITY.jobsUni[lv];
    } else if (k === 'dc') {
      t.dc = Math.max(t.dc, lv);
      t.jobsOther += CITY.jobsDc[lv];
    } else if (k === 'res') {
      if (c.flee[i] > 0) t.fled += CITY.housing[lv];
      else t.housing += CITY.housing[lv];
    } else if (k === 'com') t.jobsCom += CITY.jobsCom[lv];
    else if (k === 'market') {
      t.jobsCom += CITY.jobsCom[lv]; // der Markt arbeitet und zahlt Steuern wie Gewerbe
      t.market = Math.max(t.market, lv);
    } else if (k === 'mine') {
      const d = DEPOSITS[c.deposit[i] - 1];
      if (d) t.mine[d] += CITY.jobsMine[lv];
    } else if (WORKS.includes(k)) t[k] += CITY.jobs[lv];
  }
  t.mineJobs = t.mine.wood + t.mine.stone + t.mine.ore + t.mine.oil;
  return t;
}

/** Ziel-Entity eines fertigen Stadtgebäudes anlegen oder auf die neue Stufe heben (Trefferpunkte, Prämie). */
export function syncEntity(game, c, i) {
  const lv = c.level[i];
  const k = KINDS[c.kind[i] - 1];
  let e = c.ents.get(i);
  if (!lv || isFlat(c.kind[i])) {
    if (e) dropEntity(game, c, i);
    return;
  }
  const n = c.part?.[i] ? sizeOf(k) : 1; // Großbau: ein Ziel über das ganze Quadrat
  const hp = CITY.hp[lv] * n;
  const name = k === 'mine' ? MINE_NAME[DEPOSITS[c.deposit[i] - 1]] ?? KIND_NAME.mine : KIND_NAME[k];
  if (!e) {
    const col = i % c.cols;
    const r = n > 1 ? bigCenter(c, i, n) : cellRect(c, col, (i - col) / c.cols); // Großbau: Mitte des Quadrats (gerade n: zwischen Zellen)
    const w = (c.cell * n) / game.grid.tile;
    const x0 = r.x - (c.cell * n) / 2;
    const y0 = r.y - (c.cell * n) / 2;
    e = { id: game.newId(), kind: 'building', type: 'city', cityCell: i, team: c.team, x: r.x, y: r.y, cx: x0 / game.grid.tile, cy: y0 / game.grid.tile, w, h: w, hp, alive: true, built: true, lastHitTime: -1e9, def: { name, hp, armor: 'struct', cost: { bm: CITY.bountyBm * lv } } };
    if (CITY.produces[k]) {
      // Ausbildungsgebäude (seit v4.96): Warteschlange wie die Hauptstadt früher, Sammelpunkt eine Zelle Richtung Konfliktzone
      const z = game.zone ?? { x: r.x, y: r.y };
      const d = Math.hypot(z.x - r.x, z.y - r.y) || 1;
      Object.assign(e, { produces: CITY.produces[k], queue: [], queueTimes: [], trainSlots: CITY.trainSlots[lv], rallyX: r.x + ((z.x - r.x) / d) * ((c.cell * n) / 2 + c.cell), rallyY: r.y + ((z.y - r.y) / d) * ((c.cell * n) / 2 + c.cell) });
      trainersOf(c).add(e);
    }
    c.ents.set(i, e);
    game.entities.set(e.id, e);
    return;
  }
  e.hp += hp - e.def.hp;
  e.def = { ...e.def, name, hp, cost: { bm: CITY.bountyBm * lv } };
  if (e.produces) e.trainSlots = CITY.trainSlots[lv];
}

/** Warteschlange eines Ausbildungsgebäudes erstatten (Geld und Metall), wenn der Besitzer es abreißt oder überbaut. */
export function refundQueue(game, team, e) {
  for (const q of e?.queue ?? []) {
    game.refund(team, UNITS[q.unit].cost);
    payMetal(game, team, q.unit, -1);
  }
}

export function dropEntity(game, c, i) {
  if (c.out) c.out[i] = 0; // Werk weg (abgerissen, zerstört, überbaut): sein Ausgangslager ist verloren (seit v5.65)
  if (c.workOut) c.workOut[i] = 0; // und sein Ausstoß (seit v5.66)
  const e = c.ents.get(i);
  if (!e) return;
  e.alive = false;
  game.entities.delete(e.id);
  c.ents.delete(i);
  trainersOf(c).delete(e);
}

/** Metall einer Einheit (CITY.metalCost) aus dem Stadtlager bezahlen; false, wenn es fehlt. Ohne Stadt immer true. */
export function payMetal(game, team, unit, factor = 1) {
  const c = game.city?.[team];
  const need = (CITY.metalCost[unit] ?? 0) * factor;
  if (!c || !need) return true;
  if (factor > 0 && c.metal < need) return false;
  c.metal = Math.min(BALANCE.logistics.storeCap, c.metal - need);
  return true;
}
