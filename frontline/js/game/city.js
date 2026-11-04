// Stadt (SimCity-Teil, PRD §15): Zonenraster je Team über die ganze Karte, Gebiet, Einwohner (auch als Truppen), Flucht aus der
// Konfliktzone, Arbeit, Steuern und Werke, die das Lager der Hauptstadt füllen.
// Nur aktiv, wenn das Spiel mit `city: true` startet. Kein DOM, deterministisch.
import { CITY } from '../data/city.js';
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { nearestPassable } from './movement.js';
import { makeRng } from '../core/rng.js';

/** Zellenarten (Code im Raster): 0 leer. Neue Arten nur hinten anhängen (Code = Index + 1). */
export const KINDS = ['road', 'res', 'com', 'bm', 'mun', 'fuel', 'steel', 'mine', 'market', 'power', 'uni', 'dc', 'barracks', 'factory', 'heliport', 'hospital', 'airport'];
export const KIND_ID = Object.fromEntries(KINDS.map((k, i) => [k, i + 1]));
export const KIND_NAME = {
  road: 'Straße', res: 'Wohnen', com: 'Gewerbe', bm: 'Baumaterial-Werk', mun: 'Munitionswerk', fuel: 'Raffinerie',
  steel: 'Stahlwerk', mine: 'Förderanlage', market: 'Markt', power: 'Kraftwerk', uni: 'Universität', dc: 'Rechenzentrum',
  barracks: 'Kaserne', factory: 'Fabrikhalle', heliport: 'Heliport', hospital: 'Krankenhaus', airport: 'Flughafen',
};
/** Ausbildungsgebäude der Stadt (seit v4.96): Zellenart → Einheiten (CITY.produces). */
export const TRAINER_KINDS = Object.keys(CITY.produces);
/** Welches Stadtgebäude bildet `unit` aus? (Zellenart oder null) */
export function trainerKind(unit) {
  return TRAINER_KINDS.find((k) => CITY.produces[k].includes(unit)) ?? null;
}
/** Pflege (seit v5.01): Werte aus CITY.care.by für ein Stadtgebäude (Ziel-Entity) oder null, wenn es nicht heilt oder repariert. */
export function careOf(game, e) {
  if (e?.type !== 'city' || !game.city?.[e.team]) return null;
  return CITY.care.by[KINDS[game.city[e.team].kind[e.cityCell] - 1]] ?? null;
}
/** Welche Pflege braucht die Einheit? 'inf' Soldaten, 'air' Hubschrauber, 'ground' Bodenfahrzeuge. */
export const careClass = (u) => (u.def.air ? 'air' : u.def.armor === 'inf' ? 'inf' : 'ground');
const WORKS = ['bm', 'mun', 'fuel', 'steel'];
/** Rohstoffvorkommen (Code im Raster `deposit`): 0 keins. */
export const DEPOSITS = ['wood', 'stone', 'ore', 'oil'];
export const DEPOSIT_NAME = { wood: 'Wald', stone: 'Fels', ore: 'Erz', oil: 'Öl' };
export const MINE_NAME = { wood: 'Holzfäller', stone: 'Steinbruch', ore: 'Erzmine', oil: 'Ölquelle' };
/** Waren am Markt. */
export const GOODS = ['bm', 'mun', 'fuel', 'metal'];

const zeroStats = () => ({ powerSupply: 0, powerUse: 0, powerRatio: 1, happy: 1, pop: 0, housing: 0, jobs: 0, jobsCom: 0, workers: 0, drafted: 0, free: 0, fled: 0, bm: 0, mun: 0, fuel: 0, metal: 0, money: 0, raw: { wood: 0, stone: 0, ore: 0, oil: 0 } });

/**
 * Gesperrte Zellen (für beide Teams gleich): unter und um jede Hauptstadt oder auf Hindernissen (Bäume, Wasser, Häuser, Gebäude).
 * Seit v4.82 deckt das Stadtraster die ganze Karte (Zelle CITY.cell, Ursprung 0/0).
 */
function blockedCells(game, cols, rows) {
  const T = game.grid.tile;
  const S = CITY.cell;
  const k = S / T;
  const m = CITY.fobMargin;
  const g = game.grid;
  const blocked = new Uint8Array(cols * rows);
  const mains = game.buildings.filter((b) => b.main);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx0 = col * S;
      const cy0 = row * S;
      let bad = mains.some((b) => {
        const bx0 = b.cx * T - m;
        const by0 = b.cy * T - m;
        const bx1 = (b.cx + b.w) * T + m;
        const by1 = (b.cy + b.h) * T + m;
        return cx0 < bx1 && cx0 + S > bx0 && cy0 < by1 && cy0 + S > by0;
      });
      for (let r = row * k; !bad && r < (row + 1) * k; r++) {
        for (let c = col * k; c < (col + 1) * k; c++) if (!g.free(c, r)) bad = true;
      }
      blocked[row * cols + col] = bad ? 1 : 0;
    }
  }
  return blocked;
}

/** Zellen, deren Mitte in der Konfliktzone liegt (dort fliehen Bewohner bei Beschuss). */
function zoneCells(game, cols, rows) {
  const S = CITY.cell;
  const z = game.zone ?? game.map.zone;
  const out = new Uint8Array(cols * rows);
  if (!z) return out;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (Math.hypot((col + 0.5) * S - z.x, (row + 0.5) * S - z.y) <= z.r) out[row * cols + col] = 1;
    }
  }
  return out;
}

/**
 * Rohstoffvorkommen (seit v4.83): je Hauptstadt eine Gruppe jeder Sorte in ihrer Nähe, dazu umkämpfte Gruppen rund um die
 * Konfliktzone, punktgespiegelt um ihre Mitte (beide Seiten gleich weit). Eigener Zufall aus dem Seed: die Karte bleibt unverändert.
 */
function genDeposits(game, cols, rows, blocked) {
  const dep = new Uint8Array(cols * rows);
  const rng = makeRng(((game.seed | 0) * 2654435761 + 0x5eed) >>> 0);
  const D = CITY.deposits;
  const S = CITY.cell;
  const free = (q, r) => q >= 1 && r >= 1 && q < cols - 1 && r < rows - 1 && !blocked[r * cols + q] && !dep[r * cols + q];
  // Gruppe ab (q, r) zufällig wachsen lassen; gibt die Zahl der Zellen zurück
  const cluster = (q, r, type, size) => {
    if (!free(q, r)) return 0;
    const cells = [[q, r]];
    dep[r * cols + q] = type;
    for (let tries = 0; cells.length < size && tries < size * 8; tries++) {
      const [a, b] = cells[Math.floor(rng.next() * cells.length)];
      const [dq, dr] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng.next() * 4)];
      if (!free(a + dq, b + dr)) continue;
      dep[(b + dr) * cols + a + dq] = type;
      cells.push([a + dq, b + dr]);
    }
    return cells.length;
  };
  const z = game.zone ?? game.map.zone;
  for (const b of game.buildings) {
    if (!b.main) continue;
    const away = Math.atan2(b.y - z.y, b.x - z.x); // von der Zone weg zeigt die Stadt
    DEPOSITS.forEach((_, k) => {
      for (let tries = 0; tries < 40; tries++) {
        const a = away + Math.PI * (rng.next() * 1.6 - 0.8) + (k - 1.5) * 0.5;
        const d = rng.range(D.home.dist[0], D.home.dist[1] + tries / 8) * S;
        if (cluster(Math.floor((b.x + Math.cos(a) * d) / S), Math.floor((b.y + Math.sin(a) * d) / S), k + 1, D.home.size)) break;
      }
    });
  }
  const order = [3, 4, 2, 1]; // Erz, Öl, Stein, Holz
  for (let n = 0; n < D.neutral.count / 2; n++) {
    const type = order[n % order.length];
    for (let tries = 0; tries < 40; tries++) {
      const a = rng.next() * Math.PI * 2;
      const d = z.r + rng.range(D.neutral.ring[0], D.neutral.ring[1]) * S;
      const x = z.x + Math.cos(a) * d;
      const y = z.y + Math.sin(a) * d;
      const q1 = Math.floor(x / S);
      const r1 = Math.floor(y / S);
      const q2 = Math.floor((2 * z.x - x) / S);
      const r2 = Math.floor((2 * z.y - y) / S);
      if (!free(q1, r1) || !free(q2, r2)) continue;
      cluster(q1, r1, type, D.neutral.size);
      cluster(q2, r2, type, D.neutral.size);
      break;
    }
  }
  return dep;
}

/** Stadt eines Teams: eigenes Zonenraster über die ganze Karte (gemeinsame Sperren), Gebiet, Einwohner. */
function createTeamCity(game, team, shared) {
  const { cols, rows, blocked, inZone, deposit } = shared;
  const n = cols * rows;
  return {
    team,
    x0: 0, // linke obere Ecke des Rasters auf der Karte (px)
    y0: 0,
    cell: CITY.cell,
    gridId: game.newId(), // Kennung der Stadtgebäude im Belegungsraster (grid.struct)
    blocked, // 1 = hier kann nichts gebaut werden (beide Teams)
    inZone, // 1 = Zelle in der Konfliktzone
    deposit, // Rohstoffvorkommen je Zelle (Index in DEPOSITS + 1), für beide Teams gleich
    mapRoads: game.roads?.kind ?? null, // Stadtstraßen der Karte (roads.js, seit v5.03): zählen als Straße, für beide Teams gleich
    metal: CITY.startMetal, // Metall im Hauptlager (nur hier, LKW fahren es nicht)
    ents: new Map(), // Zelle → Ziel-Entity des Gebäudes (beschießbar, seit v4.83)
    cols,
    rows,
    kind: new Uint8Array(n), // Zellenart (KIND_ID), 0 leer
    level: new Uint8Array(n), // 0 = ausgewiesen, 1..maxLevel = Gebäude
    part: new Int32Array(n), // Großbau (seit v5.00): Mittelzelle + 1 für jede seiner Zellen, 0 = Einzelzelle
    timer: new Float32Array(n), // Wachstumszeit der Zelle
    flee: new Float32Array(n), // > 0: Bewohner geflohen, Ruhezeit bis zur Rückkehr (s)
    claim: new Uint8Array(n), // 1 = eigenes Gebiet
    claimVer: 0, // zählt hoch, wenn sich das Gebiet ändert (Darstellung)
    claimTimer: 0,
    list: [], // Indizes aller belegten Zellen (aufsteigend), damit nicht jeder Schritt die ganze Karte durchläuft
    ver: 0, // zählt hoch bei jeder Änderung an Zellen (Darstellung)
    popF: 0, // Einwohner (Bruchteile), Soldaten eingeschlossen
    drafted: 0, // Einwohner, die gerade als Truppen unterwegs sind
    stats: zeroStats(), // Rate je s und Summen des letzten Schritts (für die Anzeige)
  };
}

/** Stadt je Team anlegen; ohne `enabled` bleibt `game.city` null und alles andere wie gehabt. */
export function createCity(game, enabled) {
  game.city = null;
  if (!enabled) return;
  const cols = Math.floor((game.grid.cols * game.grid.tile) / CITY.cell);
  const rows = Math.floor((game.grid.rows * game.grid.tile) / CITY.cell);
  const blocked = blockedCells(game, cols, rows);
  const shared = { cols, rows, blocked, inZone: zoneCells(game, cols, rows), deposit: genDeposits(game, cols, rows, blocked) };
  game.city = game.teams.map((t) => createTeamCity(game, t.id, shared));
  for (const b of game.buildings) {
    if (!b.main) continue;
    b.infinite = false; // endliches Lager: die Werke füllen es
    b.store = { ...CITY.startStock };
    b.produces = []; // seit v4.96: Truppen bilden Kaserne, Fabrikhalle und Heliport der Stadt aus
  }
  for (const c of game.city) {
    updateClaim(game, c);
    startQuarter(game, c);
    updateClaim(game, c);
  }
}

/**
 * Fertige Zelle setzen (Stufe 1) ohne Kosten und ohne Wartezeit: Startviertel. Großbau (seit v5.08 die 2 × 2-Raffinerie): ein Quadrat,
 * das die Zelle enthält (am liebsten mit ihr als Anker, also nach rechts unten), nur auf leeren Zellen ohne Vorkommen.
 */
function placeBuilt(game, c, i, kind) {
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
function placeBuiltBig(game, c, a, kind) {
  for (const j of bigCells(c, a, sizeOf(kind))) {
    const q = j % c.cols;
    c.kind[j] = KIND_ID[kind];
    c.part[j] = a + 1;
    c.level[j] = 1;
    occupyCell(game, c, q, (j - q) / c.cols);
  }
  syncEntity(game, c, a);
}

/**
 * Startviertel (CITY.startQuarter): Straße nahe der Hauptstadt, darunter Wohnen und Raffinerie, darüber (seit v5.03) die Großbauten
 * Kaserne und Fabrikhalle nebeneinander mit der Unterkante an der Straße; Ölquelle auf dem nächsten Öl. Passt das ganze Viertel
 * nirgends, stehen die Großbauten so nah wie möglich an der Hauptstadt (ohne Straße; sie bilden trotzdem aus).
 */
function startQuarter(game, c) {
  const m = game.mainFob(c.team);
  if (!m) return;
  const Q = CITY.startQuarter;
  const n = Q.road;
  const [fc, fr] = cellAt(c, m.x, m.y);
  const ok = (i) => canZone(game, c, i) && !c.kind[i] && !c.deposit[i] && cellFree(game, c, i % c.cols, Math.floor(i / c.cols));
  const big = Q.big ?? [];
  const up = Math.max(0, ...big.map(([k]) => sizeOf(k))); // Zeilen über der Straße
  // Anker eines Großbaus, dessen linke obere Ecke bei (q, r) liegt
  const anchorAt = (kind, q, r) => {
    const [lo] = bigSpan(sizeOf(kind));
    return (r + lo) * c.cols + q + lo;
  };
  const fits = (q, r) => {
    for (let k = 0; k < n; k++) {
      if (!ok(r * c.cols + q + k)) return false;
      if (Q.row[k] && !ok((r + 1) * c.cols + q + k)) return false;
      const sz = Q.row[k] ? sizeOf(Q.row[k]) : 1; // Großbau unter der Straße: ganzes Quadrat frei
      if (sz > 1 && (q + k + sz > c.cols || r + 1 + sz > c.rows || !bigFits(game, c, anchorAt(Q.row[k], q + k, r + 1), sz, (j) => ok(j)))) return false;
    }
    for (const [kind, off] of big) {
      const sz = sizeOf(kind);
      if (q + off + sz > c.cols || r - sz < 0) return false;
      if (!bigFits(game, c, anchorAt(kind, q + off, r - sz), sz, (j) => ok(j))) return false;
    }
    return true;
  };
  let best = null;
  const R = 8 + up;
  for (let r = Math.max(up, fr - R); r <= Math.min(c.rows - 2, fr + R); r++) {
    for (let q = Math.max(0, fc - R); q <= Math.min(c.cols - n, fc + R); q++) {
      const d = Math.abs(q + n / 2 - fc) + Math.abs(r - up / 2 - fr);
      if (best && d >= best.d) continue;
      if (fits(q, r)) best = { q, r, d };
    }
  }
  if (best) {
    for (let k = 0; k < n; k++) {
      placeBuilt(game, c, best.r * c.cols + best.q + k, 'road');
      const kind = Q.row[k];
      if (kind) placeBuilt(game, c, (best.r + 1) * c.cols + best.q + k, kind);
    }
    for (const [kind, off] of big) placeBuiltBig(game, c, anchorAt(kind, best.q + off, best.r - sizeOf(kind)), kind);
  } else {
    // kein Platz für das ganze Viertel: die Großbauten einzeln so nah wie möglich an der Hauptstadt (größter zuerst; notfalls auch
    // auf Rohstoffvorkommen), dazu Straße an der Seite zur Hauptstadt und die Zellen darunter an der Straße der Kaserne
    const loose = (i) => canZone(game, c, i) && !c.kind[i] && cellFree(game, c, i % c.cols, Math.floor(i / c.cols));
    for (const [kind] of [...big].sort((p, o) => sizeOf(o[0]) - sizeOf(p[0]))) {
      const sz = sizeOf(kind);
      // Kandidaten nach Abstand ihrer Mitte zur Hauptstadt (beide Teams gleich behandelt: die Karte ist punktsymmetrisch)
      const cand = [];
      for (let r = Math.max(0, fr - 36); r <= Math.min(c.rows - 1, fr + 36); r++) {
        for (let q = Math.max(0, fc - 36); q <= Math.min(c.cols - 1, fc + 36); q++) {
          const p = bigCenter(c, r * c.cols + q, sz);
          cand.push({ a: r * c.cols + q, d: Math.hypot(p.x - m.x, p.y - m.y) });
        }
      }
      cand.sort((p, o) => p.d - o.d || p.a - o.a);
      // lieber ohne Rohstoffvorkommen, aber höchstens vier Zellen weiter weg als der nächste Platz überhaupt
      const near = cand.find((k) => bigFits(game, c, k.a, sz, loose));
      const clean = near && cand.find((k) => k.d <= near.d + 4 * c.cell && bigFits(game, c, k.a, sz, ok));
      const a = (clean ?? near)?.a ?? -1;
      if (a < 0) continue;
      placeBuiltBig(game, c, a, kind);
      // Straße entlang der Seite, die zur Hauptstadt zeigt
      const [lo, hi] = bigSpan(sz);
      const q0 = (a % c.cols) - lo;
      const r0 = Math.floor(a / c.cols) - lo;
      const dx = fc - (q0 + sz / 2);
      const dy = fr - (r0 + sz / 2);
      const line = [];
      for (let k = -1; k <= sz; k++) {
        if (Math.abs(dx) > Math.abs(dy)) line.push([dx > 0 ? q0 + sz : q0 - 1, r0 + k]);
        else line.push([q0 + k, dy > 0 ? r0 + sz : r0 - 1]);
      }
      for (const [q, r] of line) if (q >= 0 && r >= 0 && q < c.cols && r < c.rows && ok(r * c.cols + q)) placeBuilt(game, c, r * c.cols + q, 'road');
      if (kind !== 'barracks') continue;
      // Wohnen und Raffinerie auf der anderen Seite der Straße der Kaserne
      const sx = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0;
      const sy = sx ? 0 : Math.sign(dy) || 1;
      Q.row.forEach((k, j) => {
        const [q, r] = line[j + 1];
        const i = (r + sy) * c.cols + q + sx;
        if (k && c.kind[r * c.cols + q] === KIND_ID.road && q + sx >= 0 && r + sy >= 0 && q + sx < c.cols && r + sy < c.rows && ok(i)) placeBuilt(game, c, i, k);
      });
      void hi;
    }
  }
  let oil = -1;
  let od = Infinity;
  const D = DEPOSITS.indexOf('oil') + 1;
  for (let i = 0; i < c.deposit.length; i++) {
    if (c.deposit[i] !== D || !c.claim[i] || !canZone(game, c, i) || c.kind[i]) continue;
    const q = i % c.cols;
    const d = Math.hypot(q - fc, (i - q) / c.cols - fr);
    if (d < od) {
      od = d;
      oil = i;
    }
  }
  if (oil >= 0) placeBuilt(game, c, oil, 'mine');
  rebuildList(c);
}

/** Zelle (Spalte, Zeile) eines Weltpunkts. */
export function cellAt(c, x, y) {
  return [Math.floor((x - c.x0) / c.cell), Math.floor((y - c.y0) / c.cell)];
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
    if (!c.level[i] || c.kind[i] === KIND_ID.road || isPart(c, i)) continue;
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
function rebuildList(c) {
  const out = [];
  for (let i = 0; i < c.kind.length; i++) if (c.kind[i]) out.push(i);
  c.list = out;
  c.ver++;
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
        if (c.inZone[i] && c.kind[i] === KIND_ID.res && c.level[i]) c.flee[i] = CITY.flee.calm;
      }
    }
  }
}

const idx = (c, col, row) => row * c.cols + col;

// ---- Großbauten (seit v5.00, CITY.size): ein Gebäude über n × n Zellen, verwaltet über seine Mittelzelle (Anker) ----

/** Kantenlänge (Zellen) eines Gebäudes dieser Art: CITY.size oder 1. */
export function sizeOf(kind) {
  return CITY.size[kind] ?? 1;
}

/** Mittelzelle des Großbaus, zu dem Zelle i gehört; bei Einzelzellen i selbst. */
export function anchorOf(c, i) {
  const p = c.part?.[i];
  return p ? p - 1 : i;
}

/** Zelle i gehört zu einem Großbau, ist aber nicht seine Mitte (wächst, zählt und trifft nicht selbst). */
export function isPart(c, i) {
  const p = c.part?.[i];
  return !!p && p - 1 !== i;
}

/**
 * Ausdehnung eines n × n-Großbaus um seinen Anker in Zellen: [lo, hi] (Zellen links/oben bzw. rechts/unten des Ankers). Ungerade n:
 * der Anker ist die Mitte; gerade n (seit v5.03): der Anker ist die linke obere der vier Mittelzellen (eine Zelle mehr nach rechts unten).
 */
export function bigSpan(n) {
  const lo = Math.floor((n - 1) / 2);
  return [lo, n - 1 - lo];
}

/** Mitte (px) und halbe Kantenlänge eines n × n-Großbaus mit Anker a. */
export function bigCenter(c, a, n) {
  const [lo, hi] = bigSpan(n);
  const q = a % c.cols;
  const r = (a - q) / c.cols;
  const off = ((hi - lo) / 2 + 0.5) * c.cell;
  return { x: c.x0 + q * c.cell + off, y: c.y0 + r * c.cell + off, half: (n * c.cell) / 2 };
}

/**
 * Anker des n × n-Quadrats eines Großbaus der Art `kind`, dessen Mitte dem Weltpunkt (x, y) am nächsten liegt (seit v5.08, Bauvorschau:
 * das Quadrat folgt dem Finger; bei gerader Kantenlänge liegt der Finger nahe der Mitte statt in der linken oberen Mittelzelle).
 */
export function bigAnchorAt(c, kind, x, y) {
  const n = sizeOf(kind);
  const [lo] = bigSpan(n);
  const q = Math.round((x - c.x0) / c.cell - n / 2) + lo;
  const r = Math.round((y - c.y0) / c.cell - n / 2) + lo;
  return [Math.min(c.cols - 1, Math.max(0, q)), Math.min(c.rows - 1, Math.max(0, r))];
}

/** Zellen des n × n-Quadrats um den Anker a (ohne Prüfung der Kartengrenzen; bigFits prüft sie). */
export function bigCells(c, a, n) {
  const [lo, hi] = bigSpan(n);
  const q = a % c.cols;
  const r = (a - q) / c.cols;
  const out = [];
  for (let y = r - lo; y <= r + hi; y++) for (let x = q - lo; x <= q + hi; x++) out.push(y * c.cols + x);
  return out;
}

/** Alle Zellen des Gebäudes in Zelle i (Großbau: das ganze Quadrat, sonst nur i). */
export function cellsOf(c, i) {
  if (!c.part?.[i]) return [i];
  const a = c.part[i] - 1;
  return bigCells(c, a, sizeOf(KINDS[c.kind[a] - 1]));
}

/**
 * Passt ein n × n-Großbau mit Mitte a? Alle Zellen auf der Karte, ausweisbar, ohne Hindernis oder fremdes Gebäude und `free(j)`
 * (Standard: leer).
 */
export function bigFits(game, c, a, n, free = (j) => !c.kind[j]) {
  const [lo, hi] = bigSpan(n);
  const q = a % c.cols;
  const r = (a - q) / c.cols;
  if (q - lo < 0 || r - lo < 0 || q + hi >= c.cols || r + hi >= c.rows) return false;
  for (let y = r - lo; y <= r + hi; y++) {
    for (let x = q - lo; x <= q + hi; x++) {
      const j = y * c.cols + x;
      if (!canZone(game, c, j) || !free(j) || !cellFree(game, c, x, y)) return false;
    }
  }
  return true;
}

/**
 * Mitte für einen Großbau der Art `kind`, der die Zelle (col, row) enthält: zuerst genau dort, sonst so weit verschoben,
 * dass er passt (erst gerade, dann schräg). −1, wenn nichts passt.
 */
export function fitBig(game, c, col, row, kind, free) {
  const n = sizeOf(kind);
  const [lo, hi] = bigSpan(n);
  const offs = [];
  for (let dy = -hi; dy <= lo; dy++) for (let dx = -hi; dx <= lo; dx++) offs.push([dx, dy]); // Anker so, dass (col, row) im Quadrat liegt
  offs.sort((p, o) => Math.abs(p[0]) + Math.abs(p[1]) - Math.abs(o[0]) - Math.abs(o[1]) || Math.max(Math.abs(p[0]), Math.abs(p[1])) - Math.max(Math.abs(o[0]), Math.abs(o[1])));
  for (const [dx, dy] of offs) {
    const x = col + dx;
    const y = row + dy;
    if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) continue;
    if (bigFits(game, c, y * c.cols + x, n, free)) return y * c.cols + x;
  }
  return -1;
}

/** Großbau mit Mitte a abreißen oder überbauen: alle Zellen leer, begehbar, Ziel weg, eigene Ausbildung zurück. */
function clearBig(game, team, c, a) {
  refundQueue(game, team, c.ents.get(a));
  dropEntity(game, c, a);
  for (const j of cellsOf(c, a)) {
    if (c.part[j] !== a + 1) continue;
    const q = j % c.cols;
    if (c.level[j]) releaseCell(game, c, q, (j - q) / c.cols);
    c.kind[j] = 0;
    c.level[j] = 0;
    c.timer[j] = 0;
    c.part[j] = 0;
  }
}

/** Großbau der Art `kind` mit Mitte nahe (col, row) ausweisen (ein Gebäude, Preis CITY.cost je Gebäude). */
function placeBig(game, team, c, kind, col, row) {
  const n = sizeOf(kind);
  const a = fitBig(game, c, col, row, kind);
  if (a < 0) return { ok: false, reason: `${KIND_NAME[kind]} braucht ${n} × ${n} freie Zellen` };
  const t = game.teams[team];
  const price = CITY.cost[kind];
  const bm = CITY.costBm[kind] ?? 0;
  const main = game.mainFob(team);
  if (t.res.money < price) return { ok: false, reason: 'Zu wenig Geld' };
  if (bm && (!main || main.store.bm < bm)) return { ok: false, reason: 'Zu wenig Baumaterial im Lager der Hauptstadt' };
  t.res.money -= price;
  if (bm) main.store.bm -= bm;
  for (const j of bigCells(c, a, n)) {
    c.kind[j] = KIND_ID[kind];
    c.level[j] = 0;
    c.timer[j] = 0;
    c.flee[j] = 0;
    c.part[j] = a + 1;
  }
  rebuildList(c);
  const q = a % c.cols;
  return { ok: true, placed: 1, broke: false, noRoad: !hasRoad(c, q, (a - q) / c.cols), anchor: a };
}

/**
 * Alte Spielstände (vor v5.00): Universitäten waren einzelne Zellen. Jede zusammenhängende Gruppe alter Uni-Zellen wird ein
 * 3 × 3-Großbau an der Stelle, die die meisten ihrer Zellen deckt (übrige Zellen der Gruppe gehen darin auf), mit der höchsten
 * Stufe der Gruppe. Passt nirgends ein Quadrat hin, bleibt die alte kleine Uni, wie sie war (sie zählt weiter).
 */
export function migrateCity(game) {
  if (!game.city) return;
  for (const c of game.city) {
    c.part ??= new Int32Array(c.kind.length);
    if (c.mapRoads === undefined) c.mapRoads = game.roads?.kind ?? null; // vor v5.03: Stadtstraßen der Karte
    let changed = false;
    for (const kind of ['uni']) {
      // nur die Universität (v5.00); Kraftwerke, Kasernen, Fabrikhallen und Flughäfen (v5.03) alter Stände bleiben kleine Zellen,
      // Werke (v5.08) siehe unten
      const n = sizeOf(kind);
      const id = KIND_ID[kind];
      if (n <= 1 || !id) continue;
      const done = new Set();
      for (const i0 of [...c.list]) {
        if (c.kind[i0] !== id || c.part[i0] || done.has(i0)) continue;
        const group = [i0];
        done.add(i0);
        for (let k = 0; k < group.length; k++) {
          const q = group[k] % c.cols;
          const r = (group[k] - q) / c.cols;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = q + dx;
            const y = r + dy;
            const j = y * c.cols + x;
            if (x < 0 || y < 0 || x >= c.cols || y >= c.rows || c.kind[j] !== id || c.part[j] || done.has(j)) continue;
            done.add(j);
            group.push(j);
          }
        }
        const own = new Set(group);
        const lv = Math.max(...group.map((i) => c.level[i]));
        const mq = group.reduce((s, i) => s + (i % c.cols), 0) / group.length;
        const mr = group.reduce((s, i) => s + Math.floor(i / c.cols), 0) / group.length;
        let best = -1;
        let bestN = 0;
        let bestD = Infinity;
        const tried = new Set();
        const [lo, hi] = bigSpan(n);
        for (const i of group) {
          const q = i % c.cols;
          const r = (i - q) / c.cols;
          for (let dy = -hi; dy <= lo; dy++) {
            for (let dx = -hi; dx <= lo; dx++) {
              const a = (r + dy) * c.cols + q + dx;
              if (q + dx < 0 || r + dy < 0 || q + dx >= c.cols || r + dy >= c.rows || tried.has(a)) continue;
              tried.add(a);
              if (!bigFits(game, c, a, n, (j) => !c.kind[j] || own.has(j))) continue;
              const cover = bigCells(c, a, n).filter((j) => own.has(j)).length;
              const d = Math.hypot(q + dx - mq, r + dy - mr);
              if (cover > bestN || (cover === bestN && d < bestD)) {
                best = a;
                bestN = cover;
                bestD = d;
              }
            }
          }
        }
        if (best < 0) continue; // kein Platz: alte kleine Uni bleibt
        changed = true;
        for (const i of group) {
          const q = i % c.cols;
          if (c.level[i]) releaseCell(game, c, q, (i - q) / c.cols);
          dropEntity(game, c, i);
          c.kind[i] = 0;
          c.level[i] = 0;
          c.timer[i] = 0;
        }
        for (const j of bigCells(c, best, n)) {
          const q = j % c.cols;
          c.kind[j] = id;
          c.part[j] = best + 1;
          c.level[j] = lv;
          c.timer[j] = 0;
          c.flee[j] = 0;
          if (lv) occupyCell(game, c, q, (j - q) / c.cols);
        }
        if (lv) syncEntity(game, c, best);
      }
    }
    // Werke (seit v5.08): jede alte Werkzelle wird ein eigenes 2 × 2-Werk gleicher Stufe, wenn daneben Platz ist (das Quadrat enthält
    // die alte Zelle, die übrigen drei Zellen sind leer und ohne Vorkommen); sonst bleibt sie die alte kleine Zelle. Ein Werk bleibt
    // ein Werk: gleiche Arbeitsplätze, gleicher Strom, nichts geht verloren.
    for (const kind of WORKS) {
      const n = sizeOf(kind);
      const id = KIND_ID[kind];
      if (n <= 1 || !id) continue;
      for (const i of [...c.list]) {
        if (c.kind[i] !== id || c.part[i] || c.timer[i] < 0) continue; // Ruinen wachsen später als alte Zelle nach
        const q = i % c.cols;
        const r = (i - q) / c.cols;
        const a = fitBig(game, c, q, r, kind, (j) => j === i || (!c.kind[j] && !c.deposit[j]));
        if (a < 0) continue;
        changed = true;
        const lv = c.level[i];
        const t = c.timer[i];
        if (lv) releaseCell(game, c, q, r);
        dropEntity(game, c, i);
        c.kind[i] = 0;
        c.level[i] = 0;
        for (const j of bigCells(c, a, n)) {
          c.kind[j] = id;
          c.part[j] = a + 1;
          c.level[j] = lv;
          c.timer[j] = 0;
          c.flee[j] = 0;
          if (lv) occupyCell(game, c, j % c.cols, Math.floor(j / c.cols));
        }
        c.timer[a] = t; // Wachstumszeit der alten Zelle zählt weiter
        if (lv) syncEntity(game, c, a);
      }
    }
    if (changed) rebuildList(c); // sonst bleibt der Stand unverändert (Laden = durchgehend gespielt)
  }
}

/** Rechteck einer Stadtzelle auf der Karte (px). */
export function cellRect(c, col, row) {
  const x = c.x0 + col * c.cell;
  const y = c.y0 + row * c.cell;
  return { x0: x, y0: y, x1: x + c.cell, y1: y + c.cell, x: x + c.cell / 2, y: y + c.cell / 2 };
}

/** Kacheln einer Zelle (Spalte, Zeile im Spielraster) durchlaufen. */
function eachTile(game, c, col, row, fn) {
  const T = game.grid.tile;
  const r = cellRect(c, col, row);
  for (let y = r.y0 / T; y < r.y1 / T; y++) for (let x = r.x0 / T; x < r.x1 / T; x++) fn(x, y);
}

/** Gebäude entsteht: Fläche frei (kein anderes Gebäude, kein Hindernis)? */
function cellFree(game, c, col, row) {
  let ok = true;
  eachTile(game, c, col, row, (x, y) => {
    const i = game.grid.idx(x, y);
    if (game.grid.terrain[i] || (game.grid.struct[i] && game.grid.struct[i] !== c.gridId)) ok = false;
  });
  return ok;
}

/** Stadtgebäude sperrt seine Zelle für Einheiten; Bodeneinheiten darin rücken an den nächsten freien Platz. */
function occupyCell(game, c, col, row) {
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

/** Stadtgebäude abgerissen: Zelle wieder begehbar. */
function releaseCell(game, c, col, row) {
  eachTile(game, c, col, row, (x, y) => {
    const i = game.grid.idx(x, y);
    if (game.grid.struct[i] === c.gridId) game.grid.struct[i] = 0;
  });
}

/** Eigene Straße oder Stadtstraße der Karte (Zone, Brücke; seit v5.03) in Zelle i? */
export function roadAt(c, i) {
  return c.kind[i] === KIND_ID.road || !!c.mapRoads?.[i];
}

/** Hat die Zelle eine Straße als direkten Nachbarn (4er-Nachbarschaft)? Stadtstraßen der Karte zählen mit. */
function roadNext(c, col, row) {
  return (
    (col > 0 && roadAt(c, idx(c, col - 1, row))) ||
    (col < c.cols - 1 && roadAt(c, idx(c, col + 1, row))) ||
    (row > 0 && roadAt(c, idx(c, col, row - 1))) ||
    (row < c.rows - 1 && roadAt(c, idx(c, col, row + 1)))
  );
}

/** Arten, die ihren Straßenanschluss auch über genau eine Zelle gleicher Art bekommen (seit v5.05 auch das Baumaterial-Werk). */
const CHAIN = new Set(['res', 'com', 'bm'].map((k) => KIND_ID[k]));

/** Straßenanschluss: Nachbar ist Straße. Wohnen, Gewerbe und BM-Werk reichen auch über genau eine Zelle gleicher Art
 *  (Wohnen-Wohnen-Straße ok, BM-Werk-BM-Werk-Straße ok, Wohnen-Gewerbe-Straße für Wohnen nicht); die Zelle dazwischen muss selbst
 *  direkt an der Straße liegen. */
export function hasRoad(c, col, row) {
  const i0 = idx(c, col, row);
  if (c.part?.[i0]) {
    // Großbau: irgendeine seiner Zellen an der Straße; das 2 × 2-BM-Werk (seit v5.08) auch über ein benachbartes BM-Werk, das selbst
    // direkt an der Straße liegt (wie die Einzelzellen seit v5.05)
    const all = cellsOf(c, i0);
    const direct = (cs) => cs.some((j) => roadNext(c, j % c.cols, Math.floor(j / c.cols)));
    if (direct(all)) return true;
    const k = c.kind[i0];
    if (!CHAIN.has(k)) return false;
    const a = anchorOf(c, i0);
    for (const j of all) {
      const q = j % c.cols;
      const r = (j - q) / c.cols;
      for (const [x, y] of [[q - 1, r], [q + 1, r], [q, r - 1], [q, r + 1]]) {
        if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) continue;
        const n = idx(c, x, y);
        if (c.kind[n] === k && anchorOf(c, n) !== a && direct(cellsOf(c, n))) return true;
      }
    }
    return false;
  }
  if (roadNext(c, col, row)) return true;
  const k = c.kind[idx(c, col, row)];
  if (!CHAIN.has(k)) return false;
  return (
    (col > 0 && c.kind[idx(c, col - 1, row)] === k && roadNext(c, col - 1, row)) ||
    (col < c.cols - 1 && c.kind[idx(c, col + 1, row)] === k && roadNext(c, col + 1, row)) ||
    (row > 0 && c.kind[idx(c, col, row - 1)] === k && roadNext(c, col, row - 1)) ||
    (row < c.rows - 1 && c.kind[idx(c, col, row + 1)] === k && roadNext(c, col, row + 1))
  );
}

/** Summen (Wohnplätze, Arbeitsplätze je Art) aus den gebauten Zellen; geflohene Wohnzellen zählen nicht. */
function totals(c) {
  const t = { housing: 0, fled: 0, jobsCom: 0, bm: 0, mun: 0, fuel: 0, steel: 0, mine: { wood: 0, stone: 0, ore: 0, oil: 0 }, market: 0, power: 0, powerJobs: 0, uni: 0, dc: 0, jobsOther: 0, use: 0 };
  t.n = { bm: 0, mun: 0, fuel: 0, steel: 0, mine: { wood: 0, stone: 0, ore: 0, oil: 0 } }; // fertige Gebäude je Art (Flussanzeige)
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
function syncEntity(game, c, i) {
  const lv = c.level[i];
  const k = KINDS[c.kind[i] - 1];
  let e = c.ents.get(i);
  if (!lv || k === 'road') {
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

/** Lebende Ausbildungsgebäude einer Stadt (Set, wird in syncEntity/dropEntity gepflegt; ältere Spielstände legen es neu an). */
function trainersOf(c) {
  return (c.trainers ??= new Set());
}

/** Ausbildungsgebäude der Stadt (Kaserne, Fabrikhalle, Heliport) eines Teams oder beider Teams (team weggelassen). */
export function cityTrainers(game, team) {
  if (!game.city) return [];
  const out = [];
  for (const c of game.city) if (team === undefined || c.team === team) for (const e of trainersOf(c)) if (e.alive) out.push(e);
  return out;
}

/** Warteschlange eines Ausbildungsgebäudes erstatten (Geld und Metall), wenn der Besitzer es abreißt oder überbaut. */
function refundQueue(game, team, e) {
  for (const q of e?.queue ?? []) {
    game.refund(team, UNITS[q.unit].cost);
    payMetal(game, team, q.unit, -1);
  }
}

function dropEntity(game, c, i) {
  const e = c.ents.get(i);
  if (!e) return;
  e.alive = false;
  game.entities.delete(e.id);
  c.ents.delete(i);
  trainersOf(c).delete(e);
}

/** Ein Simulationsschritt der Stadt beider Teams. Nach updateEconomy aufrufen. */
export function updateCity(game, dt) {
  if (!game.city) return;
  game.teams.forEach((team, id) => {
    const c = game.city[id];
    // Gebiet regelmäßig neu (FOBs gebaut oder zerstört, neue Stadtgebäude)
    c.claimTimer += dt;
    if (c.claimTimer >= CITY.territory.interval) {
      c.claimTimer = 0;
      updateClaim(game, c);
    }
    for (const i of c.list) if (c.flee[i] > 0) c.flee[i] = Math.max(0, c.flee[i] - dt);

    // Zerstörte Gebäude werden Ruinen: Zelle frei, nach CITY.ruinTime wächst sie neu (Wiederaufbau)
    for (const [i, e] of c.ents) {
      if (e.alive && e.hp > 0) continue;
      dropEntity(game, c, i);
      for (const j of cellsOf(c, i)) {
        const col = j % c.cols;
        releaseCell(game, c, col, (j - col) / c.cols);
        c.level[j] = 0;
        c.timer[j] = 0;
      }
      c.timer[i] = -CITY.ruinTime; // Großbau: die Mitte zählt die Zeit für alle Zellen
      c.ver++;
      game.addEffect('explosion', e.x, e.y, 1 - id, e.x, e.y, 'building');
      game.message(id, `${e.def.name} in der Stadt zerstört`, e.x, e.y);
    }

    // Treffer merken (KI meidet die Gegend beim Bauen und schickt Verteidiger)
    for (const e of c.ents.values()) {
      if (e.lastHitTime > game.time - dt * 1.5) {
        c.hitLog = (c.hitLog ?? []).filter((h) => h.t > game.time - CITY.ai.dangerTime).slice(-19);
        c.hitLog.push({ x: e.x, y: e.y, t: game.time });
      }
    }

    // Truppen: gefallene Soldaten fehlen der Stadt (Einwohner weg, müssen neu zuziehen)
    const drafted = draftedCount(game, id);
    if (drafted < c.drafted) c.popF = Math.max(0, c.popF - (c.drafted - drafted));
    c.drafted = drafted;

    const t = totals(c);
    const jobs = t.jobsCom + t.bm + t.mun + t.fuel + t.steel + t.mineJobs + t.jobsOther;

    // Einwohner ziehen ein oder ab, bis die Wohnplätze gefüllt sind (ohne Arbeit nur ein kleiner Anfang)
    const target = jobs > 0 ? t.housing : Math.min(t.housing, CITY.startPop);
    if (c.popF < target) c.popF = Math.min(target, c.popF + CITY.immigration * (0.5 + (c.stats.happy ?? 1)) * dt); // zufriedene Städte ziehen schneller an
    else if (c.popF > target) c.popF = Math.max(target, c.popF - CITY.immigration * dt);
    const pop = c.popF;
    const pool = Math.max(0, pop - drafted); // Einwohner, die arbeiten können

    // Wachstum der Zellen: Gebäude entstehen nur mit Straßenanschluss (Förderanlagen ohne), Ausbau nur bei Bedarf
    let built = false;
    for (const i of c.list) {
      if (isPart(c, i)) continue; // Großbau wächst über seine Mitte
      const kind = KINDS[c.kind[i] - 1];
      const col = i % c.cols;
      const row = (i - col) / c.cols;
      if (kind === 'road' || (kind !== 'mine' && !hasRoad(c, col, row))) continue;
      const lv = c.level[i];
      if (lv >= CITY.maxLevel) continue;
      const need = lv === 0 ? CITY.growTime : CITY.upgradeTime;
      const wanted = lv === 0 || (kind === 'res' ? jobs >= pool * CITY.demand : pool >= jobs * CITY.demand);
      if (c.timer[i] < need) c.timer[i] += dt;
      if (c.timer[i] >= need && wanted) {
        const all = cellsOf(c, i);
        if (lv === 0) {
          if (!all.every((j) => cellFree(game, c, j % c.cols, Math.floor(j / c.cols)))) continue; // ein Gebäude oder Hindernis steht im Weg: warten
          for (const j of all) occupyCell(game, c, j % c.cols, Math.floor(j / c.cols));
          built = true;
        }
        for (const j of all) c.level[j] = lv + 1;
        c.timer[i] = 0;
        c.ver++;
        syncEntity(game, c, i);
      }
    }
    if (built) updateClaim(game, c);

    // Arbeit, Förderung, Verarbeitung, Steuern
    const fill = jobs > 0 ? Math.min(1, pool / jobs) : 0;
    const s = zeroStats();
    s.pop = pop;
    s.housing = t.housing;
    s.fled = t.fled;
    s.drafted = drafted;
    s.free = freePop(game, id);
    s.jobs = jobs;
    s.jobsCom = t.jobsCom;
    s.workers = jobs * fill;
    s.market = t.market;
    // Strom (Stufe 3): Angebot aus Notstrom und Kraftwerken; Mangel bremst Förderung und Werke
    s.powerSupply = CITY.power.base + t.power * fill;
    s.powerUse = t.use;
    s.powerRatio = t.use > 0 ? Math.min(1, s.powerSupply / t.use) : 1;
    // Zufriedenheit (Stufe 3): Läden, Sicherheit, Strom
    const H = CITY.happy;
    const shop = pop > 0 ? Math.min(1, (t.jobsCom * fill) / (pop * H.shopPer)) : 1;
    const hits = (c.hitLog ?? []).filter((h) => h.t > game.time - 60).length;
    const safe = 1 - Math.min(1, hits / H.hitsBad);
    s.happy = pop > 0 ? Math.min(1, H.base + H.shops * shop + H.safety * safe + H.power * s.powerRatio) : 1;
    const mood = H.lo + H.span * s.happy;
    const eff = fill * s.powerRatio * mood; // Besetzung × Strom × Zufriedenheit
    s.uni = t.uni;
    s.dc = t.dc;
    for (const d of DEPOSITS) s.raw[d] = t.mine[d] * eff * CITY.extract[d];
    const Y = CITY.yield;
    const K = CITY.convert;
    s.bm = Math.min(t.bm * eff * Y.bm, (s.raw.wood + s.raw.stone) / K.bm);
    s.fuel = Math.min(t.fuel * eff * Y.fuel, s.raw.oil / K.fuel);
    const metalIn = Math.min(t.steel * eff * Y.metal, s.raw.ore / K.metal);
    s.mun = Math.min(t.mun * eff * Y.mun, (c.metal / Math.max(dt, 1e-6) + metalIn) / K.mun); // Munition braucht Metall
    s.metal = metalIn - s.mun * K.mun;
    // Für die Flussanzeige (js/game/flow.js, CITY.chain): je Produkt Leistung der Werke (cap), was die Rohstoffe hergeben (inp), Erzeugung (gross)
    s.cap = { bm: t.bm * eff * Y.bm, fuel: t.fuel * eff * Y.fuel, metal: t.steel * eff * Y.metal, mun: t.mun * eff * Y.mun };
    s.inp = { bm: (s.raw.wood + s.raw.stone) / K.bm, fuel: s.raw.oil / K.fuel, metal: s.raw.ore / K.metal, mun: (c.metal / Math.max(dt, 1e-6) + metalIn) / K.mun };
    s.gross = { bm: s.bm, fuel: s.fuel, metal: metalIn, mun: s.mun };
    s.n = t.n;
    s.fill = fill;
    s.mood = mood;
    const made = (c.made ??= { bm: 0, mun: 0, fuel: 0, metal: 0 }); // Summe, die wirklich ins Lager kam (Flussanzeige misst damit den Verbrauch)
    const metal0 = c.metal;
    c.metal = Math.max(0, Math.min(BALANCE.logistics.storeCap, c.metal + s.metal * dt));
    made.metal += Math.max(0, c.metal - metal0 + s.mun * K.mun * dt); // was das Stahlwerk ins Stadtlager bringt (das Munitionswerk zählt als Verbrauch)
    s.money = (pool * CITY.taxPop + t.jobsCom * fill * CITY.taxCom) * mood;
    c.stats = s;

    const main = game.mainFob(id);
    if (main && main.built) {
      for (const k of ['bm', 'mun', 'fuel']) {
        const v0 = main.store[k];
        main.store[k] = Math.min(BALANCE.logistics.capitalCap, v0 + s[k] * dt);
        made[k] += Math.max(0, main.store[k] - v0);
      }
    }
    team.res.money += s.money * dt;
    team.rate.money += s.money;
    updateCare(game, c, dt);
  });
}

/**
 * Heilen und Reparieren (seit v5.01): Kaserne, Fabrikhalle, Heliport und Krankenhaus pflegen eigene Einheiten in ihrem Umkreis
 * (CITY.care). Tempo × Stufe × Strom; Fahrzeuge kosten Metall aus dem Stadtlager. Das schnellste Gebäude in Reichweite zählt.
 */
function updateCare(game, c, dt) {
  const C = CITY.care;
  const givers = [];
  for (const [i, e] of c.ents) {
    const spec = C.by[KINDS[c.kind[i] - 1]];
    if (spec && e.alive) givers.push({ e, spec, r2: ((spec.radius + (c.part?.[i] ? sizeOf(KINDS[c.kind[i] - 1]) : 1) / 2) * c.cell) ** 2, rate: spec.rate * (C.levelMul[c.level[i]] ?? 1) });
  }
  if (!givers.length) return;
  const power = c.stats.powerRatio ?? 1;
  for (const u of game.units) {
    if (!u.alive || u.team !== c.team || u.hp >= u.maxHp || game.time - u.lastHitTime < C.delay) continue;
    const cls = careClass(u);
    let rate = 0;
    for (const g of givers) {
      if (g.spec.units !== cls || g.rate <= rate) continue;
      const dx = u.x - g.e.x;
      const dy = u.y - g.e.y;
      if (dx * dx + dy * dy <= g.r2) rate = g.rate;
    }
    if (!rate) continue;
    let heal = Math.min(u.maxHp - u.hp, u.maxHp * rate * power * dt);
    const metal = (CITY.metalCost[u.type] ?? 0) * C.metalShare; // Metall für eine volle Reparatur
    if (metal > 0) {
      heal = Math.min(heal, (c.metal / metal) * u.maxHp);
      c.metal = Math.max(0, c.metal - (metal * heal) / u.maxHp);
    }
    if (heal <= 0) continue;
    u.hp += heal;
    u.caredAt = game.time; // für die Anzeige (grünes Kreuz)
  }
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

/**
 * Befehl `{ type: 'trade', good: 'bm'|'mun'|'fuel'|'metal', dir: 'sell'|'buy' }`: ein Los (CITY.market.lot) am Markt handeln.
 * Braucht einen fertigen eigenen Markt. BM, MUN, TS liegen im Lager der Hauptstadt, Metall im Stadtlager.
 */
export function cmdTrade(game, team, cmd) {
  const c = game.city?.[team];
  if (!c) return { ok: false, reason: 'Die Stadt ist in dieser Partie ausgeschaltet' };
  if (!GOODS.includes(cmd.good) || (cmd.dir !== 'sell' && cmd.dir !== 'buy')) return { ok: false, reason: 'Unbekannter Handel' };
  if (!hasMarket(game, team)) return { ok: false, reason: 'Erst einen Markt bauen' };
  const main = game.mainFob(team);
  if (!main && cmd.good !== 'metal') return { ok: false, reason: 'Hauptstadt zerstört' };
  const M = CITY.market;
  const cap = cmd.good === 'metal' ? BALANCE.logistics.storeCap : BALANCE.logistics.capitalCap; // Stadtlager bzw. Lager der Hauptstadt
  const t = game.teams[team];
  const have = cmd.good === 'metal' ? c.metal : main.store[cmd.good];
  const add = (v) => {
    if (cmd.good === 'metal') c.metal = Math.min(cap, c.metal + v);
    else main.store[cmd.good] = Math.min(cap, main.store[cmd.good] + v);
    c.traded ??= { bm: 0, mun: 0, fuel: 0, metal: 0 }; // Summe der Käufe minus Verkäufe (Flussanzeige: zählt nicht als Verbrauch)
    c.traded[cmd.good] += v;
  };
  if (cmd.dir === 'sell') {
    if (have < M.lot) return { ok: false, reason: 'Zu wenig zum Verkaufen' };
    add(-M.lot);
    t.res.money += M.sell[cmd.good];
    return { ok: true, money: M.sell[cmd.good] };
  }
  if (t.res.money < M.buy[cmd.good]) return { ok: false, reason: 'Zu wenig Geld' };
  if (have + M.lot > cap) return { ok: false, reason: 'Lager voll' };
  t.res.money -= M.buy[cmd.good];
  add(M.lot);
  return { ok: true, money: -M.buy[cmd.good] };
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

/** Darf `team` die Zelle i ausweisen? Nicht gesperrt, nicht vom Gegner belegt (überall auf der Karte). */
export function canZone(game, c, i) {
  if (c.blocked[i]) return false; // seit v4.87 überall, nicht nur im Gebiet (das Gebiet nutzt nur noch die KI)
  if (c.mapRoads?.[i]) return false; // Stadtstraße der Karte (Zone, Brücke): gehört niemandem, bleibt Straße
  for (const o of game.city) if (o !== c && o.kind[i]) return false;
  return true;
}

/**
 * Befehl `{ type: 'city', kind: 'road'|'res'|'com'|'bm'|'mun'|'fuel'|'erase', c0, r0, c1, r1 }`:
 * Rechteck (Spalten c0..c1, Zeilen r0..r1 im Kartenraster) ausweisen oder räumen. Überall, wo nichts gesperrt ist (seit v4.87).
 * Kostet Geld je Zelle, bis das Geld ausgeht. Seit v5.10 nur auf leeren Zellen: Belegte Zellen werden nicht überbaut (erst räumen).
 */
export function cmdCity(game, team, cmd) {
  const city = game.city?.[team];
  if (!city) return { ok: false, reason: 'Die Stadt ist in dieser Partie ausgeschaltet' };
  const erase = cmd.kind === 'erase';
  if (!erase && !KIND_ID[cmd.kind]) return { ok: false, reason: 'Unbekannte Zellenart' };
  const c0 = Math.max(0, Math.min(cmd.c0, cmd.c1) | 0);
  const c1 = Math.min(city.cols - 1, Math.max(cmd.c0, cmd.c1) | 0);
  const r0 = Math.max(0, Math.min(cmd.r0, cmd.r1) | 0);
  const r1 = Math.min(city.rows - 1, Math.max(cmd.r0, cmd.r1) | 0);
  if (!(c1 >= c0 && r1 >= r0)) return { ok: false, reason: 'Außerhalb der Karte' };
  if (!erase && sizeOf(cmd.kind) > 1) {
    // Großbau: ein Gebäude mitten im Rechteck; bei gerader Kantenlänge liegt der Anker links oben der Mitte (seit v5.08; ein Tipp: dort
    // der Anker, das Quadrat reicht nach rechts unten)
    const off = sizeOf(cmd.kind) % 2 ? 0 : 0.5;
    return placeBig(game, team, city, cmd.kind, Math.round((c0 + c1) / 2 - off), Math.round((r0 + r1) / 2 - off));
  }
  const t = game.teams[team];
  const id = erase ? 0 : KIND_ID[cmd.kind];
  let placed = 0;
  let broke = false;
  let outside = false;
  let noDeposit = false;
  let occupied = false;
  const main = game.mainFob(team);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const i = idx(city, col, row);
      if (city.kind[i] === id) continue;
      if (!erase && city.kind[i]) {
        occupied = true; // nichts überbauen (seit v5.10): erst räumen
        continue;
      }
      if (!erase && !canZone(game, city, i)) {
        if (!city.blocked[i] && !city.claim[i]) outside = true;
        continue;
      }
      if (cmd.kind === 'mine' && !city.deposit[i]) {
        noDeposit = true; // Förderanlagen nur auf Rohstoffvorkommen
        continue;
      }
      if (!erase) {
        const price = CITY.cost[cmd.kind];
        const bm = CITY.costBm[cmd.kind] ?? 0;
        if (t.res.money < price || (bm && (!main || main.store.bm < bm))) {
          broke = t.res.money < price ? 'money' : 'bm';
          continue;
        }
        t.res.money -= price;
        if (bm) main.store.bm -= bm;
      }
      if (city.part[i]) clearBig(game, team, city, anchorOf(city, i)); // Räumen: Großbau ganz weg (alle Zellen)
      if (city.level[i]) releaseCell(game, city, col, row);
      refundQueue(game, team, city.ents.get(i)); // eigene Ausbildung zurück
      dropEntity(game, city, i);
      city.kind[i] = id;
      city.level[i] = 0;
      city.timer[i] = 0;
      city.flee[i] = 0;
      placed++;
    }
  }
  const poor = broke === 'bm' ? 'Zu wenig Baumaterial im Lager der Hauptstadt' : 'Zu wenig Geld';
  if (!placed) {
    const reason = broke ? poor : occupied ? 'Dort steht schon etwas: erst räumen' : noDeposit ? 'Förderanlagen nur auf Rohstoffvorkommen' : outside ? 'Nur im eigenen Gebiet bauen' : 'Nichts zu ändern';
    return { ok: false, reason };
  }
  rebuildList(city);
  // Zonen ohne Straße daneben wachsen nicht (Förderanlagen schon): melden
  let noRoad = false;
  if (!erase && cmd.kind !== 'road' && cmd.kind !== 'mine') {
    for (let row = r0; row <= r1 && !noRoad; row++) for (let col = c0; col <= c1; col++) if (city.kind[idx(city, col, row)] === id && !hasRoad(city, col, row)) noRoad = true;
  }
  return { ok: true, placed, broke: !!broke, noRoad, occupied };
}

// ---- KI: baut in Ringen um die Hauptstadt nach außen, dazu kleine Viertel an vorderen FOBs (seit v4.82),
// Förderanlagen auf Vorkommen im Gebiet, Markt und Angriffe auf die gegnerische Stadt (seit v4.83) ----

/** Ist die Zelle im Muster um den Anker (ac, ar) eine Straße? Jede roadEvery-te Zeile und die Spalte durch den Anker. */
function aiRoad(col, row, ac, ar) {
  const n = CITY.ai.roadEvery;
  return (((row - ar) % n) + n) % n === 0 || col === ac;
}

/**
 * Welche Zone braucht die Stadt als Nächstes? (freie Planung seit v4.85) Wohnen, wenn Wohnraum oder freie Einwohner fehlen,
 * sonst die Arbeitsstätte mit dem größten Rückstand zum Mix; knappe Sorten (Lager, Metall, Geld) zählen CITY.ai.boost-fach.
 */
function aiNeed(game, c, add, skip = null) {
  const t = totals(c);
  const A = CITY.ai;
  const count = { res: 0, com: 0, bm: 0, mun: 0, fuel: 0, steel: 0, market: 0, power: 0, uni: 0, dc: 0, barracks: 0, factory: 0, heliport: 0, hospital: 0, airport: 0 };
  for (const k in add) count[k] += add[k];
  for (const i of c.list) {
    if (isPart(c, i)) continue; // Großbau zählt einmal
    const k = KINDS[c.kind[i] - 1];
    if (k in count) count[k]++;
  }
  const work = count.com + count.bm + count.mun + count.fuel + count.steel + count.market;
  const free = c.stats.free ?? 0;
  // Strom, Universität, Rechenzentrum (seit v4.88) nach Bedarf
  const st = c.stats;
  if (st.powerSupply + (add.power ?? 0) * CITY.power.supply[1] < st.powerUse * A.powerMargin + 10 && (add.power ?? 0) < 1 && !skip?.has('power')) return 'power';
  // Ausbildungsgebäude (seit v4.96): ohne sie keine Truppen; Heliport erst mit einer Arbeitsstätte
  const more = work >= A.moreFrom ? 1 : 0;
  for (const [k, n] of Object.entries(A.producers)) {
    if (k === 'heliport' && !work) continue;
    if (skip?.has(k)) continue; // Großbau ohne Platz in diesem Takt (seit v5.03 auch Kaserne und Fabrikhalle)
    if (count[k] < n + (k === 'heliport' ? 0 : more)) return k;
  }
  if (!count.hospital && work >= A.hospitalFrom && !skip?.has('hospital')) return 'hospital';
  if (!count.uni && work >= A.uniFrom && !skip?.has('uni')) return 'uni';
  if (!count.dc && count.uni && work >= A.dcFrom && !skip?.has('dc')) return 'dc';
  if (count.res < work * 1.2 || (t.housing + t.fled < c.drafted + 20 && count.res <= work * 2) || (free < A.lowFree && count.res <= work * 2)) return 'res';
  const main = game.mainFob(c.team);
  const s = c.stats;
  const low = {
    bm: main && main.store.bm < A.lowStock && s.raw.wood + s.raw.stone > s.bm, // Rohstoff da, Werk fehlt
    mun: main && main.store.mun < A.lowStock && c.metal > 50,
    fuel: main && main.store.fuel < A.lowStock && s.raw.oil > s.fuel,
    steel: c.metal < A.lowMetal && s.raw.ore > s.metal + s.mun * CITY.convert.mun,
    com: game.teams[c.team].res.money < A.lowMoney,
  };
  let best = null;
  let lo = Infinity;
  for (const [k, w] of Object.entries(A.mix)) {
    if (k === 'market' && count.market >= 1) continue; // ein Markt reicht
    if (skip?.has(k)) continue; // Großbau ohne Platz in diesem Takt (seit v5.08 auch die 2 × 2-Werke)
    const r = count[k] / (w * (low[k] ? A.boost : 1));
    if (r < lo) {
      lo = r;
      best = k;
    }
  }
  return best ?? 'res';
}

/** Liegt die Zelle nahe einem frischen Treffer auf die eigene Stadt? */
function inDanger(c, col, row, now) {
  const R = CITY.ai.dangerRadius;
  for (const h of c.hitLog ?? []) {
    if (h.t < now - CITY.ai.dangerTime) continue;
    if (Math.abs(Math.floor(h.x / c.cell) - col) <= R && Math.abs(Math.floor(h.y / c.cell) - row) <= R) return true;
  }
  return false;
}

/** Freie Zellen um den Anker (Weltpunkt), nach Abstand sortiert (Ringe), bis zum Radius in Zellen. */
function aiCandidates(game, c, x, y, rad) {
  const [ac, ar] = cellAt(c, x, y);
  const out = [];
  for (let row = Math.max(0, ar - rad); row <= Math.min(c.rows - 1, ar + rad); row++) {
    for (let col = Math.max(0, ac - rad); col <= Math.min(c.cols - 1, ac + rad); col++) {
      const i = idx(c, col, row);
      if (c.kind[i] || !canZone(game, c, i) || inDanger(c, col, row, game.time) || !cellFree(game, c, col, row)) continue; // Fels, Wasser oder Gebäude: dort wüchse nie etwas
      const d = Math.max(Math.abs(col - ac), Math.abs(row - ar)) * 100 + Math.abs(col - ac) + Math.abs(row - ar);
      out.push({ i, col, row, d, road: aiRoad(col, row, ac, ar), deposit: c.deposit[i] });
    }
  }
  out.sort((a, b) => a.d - b.d || a.i - b.i);
  return out;
}

/** KI-Schritt (alle ai.interval s von ai.js): weist die nächsten Zellen aus, solange Geld über der Reserve bleibt. */
export function aiCity(game, team, difficulty) {
  const city = game.city?.[team];
  if (!city) return;
  const reserve = CITY.ai.reserve[difficulty] ?? CITY.ai.reserve.normal;
  const money = () => game.teams[team].res.money;
  aiMarket(game, team, reserve);
  city.aiTurn = (city.aiTurn ?? 0) + 1;
  let n = 0;
  // Förderanlagen zuerst: jedes Vorkommen im Gebiet nutzen
  for (const i of city.list.length < 4 ? [] : depositCells(game, city)) {
    if (money() < CITY.cost.mine + reserve) return;
    const col = i % city.cols;
    const row = (i - col) / city.cols;
    if (game.issue(team, { type: 'city', kind: 'mine', c0: col, r0: row, c1: col, r1: row }).ok && ++n >= CITY.ai.perStep) return;
  }
  const main = game.mainFob(team);
  const fobs = game.buildings.filter((b) => b.alive && b.built && b.team === team && b.type === 'fob' && !b.main);
  let anchor = main;
  let rad = CITY.territory.main + CITY.territory.building * 4;
  if (fobs.length && (city.aiTurn % CITY.ai.quarterEvery === 0 || !main)) {
    anchor = fobs[Math.floor(city.aiTurn / CITY.ai.quarterEvery) % fobs.length];
    rad = CITY.ai.quarter;
  }
  if (!anchor) return;
  if (aiAirport(game, city, main, reserve)) n++;
  const add = {};
  const skip = new Set(); // Großbauten, für die in diesem Takt kein Platz war
  for (const cand of aiCandidates(game, city, anchor.x, anchor.y, rad)) {
    if (cand.deposit) continue; // Vorkommen bleiben für Förderanlagen frei
    let kind = 'road';
    let col = cand.col;
    let row = cand.row;
    if (!cand.road) {
      // nur neben einer (geplanten) Straße
      if (!hasRoad(city, cand.col, cand.row)) continue;
      kind = aiNeed(game, city, add, skip);
      // Großbau (Universität, Kraftwerk, Kaserne, Fabrikhalle, Flughafen): Quadrat mit dieser Zelle am Rand, ohne Vorkommen und
      // Gefahr; passt er hier nicht, gilt er für diesen Takt als ohne Platz und es kommt das Nächste (auch ein anderer Großbau)
      for (let tries = 0; sizeOf(kind) > 1 && tries < 8; tries++) {
        const a = fitBig(game, city, cand.col, cand.row, kind, (j) => !city.kind[j] && !city.deposit[j] && !inDanger(city, j % city.cols, Math.floor(j / city.cols), game.time));
        if (a >= 0) {
          col = a % city.cols;
          row = Math.floor(a / city.cols);
          break;
        }
        skip.add(kind);
        kind = aiNeed(game, city, add, skip);
      }
      if (sizeOf(kind) > 1 && col === cand.col && row === cand.row && fitBig(game, city, cand.col, cand.row, kind) < 0) continue;
    }
    if (money() < CITY.cost[kind] + reserve) return;
    const r = game.issue(team, { type: 'city', kind, c0: col, r0: row, c1: col, r1: row });
    if (!r.ok) {
      if (kind !== 'road') skip.add(kind); // z. B. zu wenig Baumaterial: in diesem Takt etwas anderes (seit v5.03)
      continue;
    }
    if (kind !== 'road') add[kind] = (add[kind] ?? 0) + 1;
    if (++n >= CITY.ai.perStep) return;
  }
}

/**
 * Flughafen der KI (seit v5.03): Der 10 × 10-Großbau passt selten zwischen ihre Straßenreihen; darum sucht sie eigens das nächste
 * freie Quadrat (ohne Vorkommen und Gefahr, mit einer Zelle Rand) um die Hauptstadt und legt eine Straße an der Seite zur
 * Hauptstadt an. true, wenn gebaut.
 */
function aiAirport(game, c, main, reserve) {
  const A = CITY.ai;
  if (!main) return false;
  if (game.teams[c.team].res.money < CITY.cost.airport + reserve || main.store.bm < (CITY.costBm.airport ?? 0) + 200) return false;
  let work = 0;
  for (const i of c.list) {
    if (isPart(c, i)) continue;
    const k = KINDS[c.kind[i] - 1];
    if (k === 'airport') return false; // einer reicht
    if (k === 'com' || k === 'market' || WORKS.includes(k)) work++;
  }
  if (work < A.airportFrom) return false;
  const n = sizeOf('airport');
  const [fc, fr] = cellAt(c, main.x, main.y);
  const R = A.airportReach; // Zellen um die Hauptstadt
  const free = (j) => !c.kind[j] && !c.deposit[j] && !c.mapRoads?.[j] && !inDanger(c, j % c.cols, Math.floor(j / c.cols), game.time);
  const cand = [];
  for (let r = Math.max(0, fr - R); r <= Math.min(c.rows - 1, fr + R); r++) {
    for (let q = Math.max(0, fc - R); q <= Math.min(c.cols - 1, fc + R); q++) cand.push({ a: r * c.cols + q, d: Math.hypot(q - fc, r - fr) });
  }
  cand.sort((p, o) => p.d - o.d || p.a - o.a);
  const hit = cand.find((k) => bigFits(game, c, k.a, n, free));
  if (!hit) return false;
  const res = game.issue(c.team, { type: 'city', kind: 'airport', c0: hit.a % c.cols, r0: Math.floor(hit.a / c.cols), c1: hit.a % c.cols, r1: Math.floor(hit.a / c.cols) });
  if (!res.ok) return false;
  const [lo, hi] = bigSpan(n);
  const q = hit.a % c.cols;
  const r = Math.floor(hit.a / c.cols);
  const dx = fc - q;
  const dy = fr - r;
  // Straße entlang der Seite zur Hauptstadt (eine Zelle außerhalb des Quadrats), nur auf leeren Zellen (nichts überbauen)
  if (hasRoad(c, q, r)) return true;
  for (let k = -lo - 1; k <= hi + 1; k++) {
    const [x, y] = Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? q + hi + 1 : q - lo - 1, r + k] : [q + k, dy > 0 ? r + hi + 1 : r - lo - 1];
    if (x < 0 || y < 0 || x >= c.cols || y >= c.rows || c.kind[y * c.cols + x] || !canZone(game, c, y * c.cols + x)) continue;
    game.issue(c.team, { type: 'city', kind: 'road', c0: x, r0: y, c1: x, r1: y });
  }
  return true;
}

/** Freie Vorkommen im eigenen Gebiet (Zellindizes). */
function depositCells(game, c) {
  const out = [];
  for (let i = 0; i < c.deposit.length; i++) {
    if (!c.deposit[i] || !c.claim[i] || c.kind[i] || !canZone(game, c, i)) continue;
    const q = i % c.cols;
    if (!inDanger(c, q, (i - q) / c.cols, game.time)) out.push(i);
  }
  // knappe Sorten zuerst (Öl bei wenig Treibstoff, Erz bei wenig Metall)
  const main = game.mainFob(c.team);
  const want = (i) => {
    const d = DEPOSITS[c.deposit[i] - 1];
    if (d === 'oil' && main && main.store.fuel < CITY.ai.lowStock) return 0;
    if (d === 'ore' && c.metal < CITY.ai.lowMetal) return 0;
    return 1;
  };
  out.sort((a, b) => want(a) - want(b) || a - b);
  return out;
}

/** Markt der KI: Überschuss verkaufen, Metall zukaufen, wenn es knapp ist. */
function aiMarket(game, team, reserve) {
  const c = game.city[team];
  const main = game.mainFob(team);
  if (!main) return;
  for (const g of ['bm', 'mun', 'fuel']) if (main.store[g] > CITY.ai.sellAbove) game.issue(team, { type: 'trade', good: g, dir: 'sell' });
  if (c.metal > CITY.ai.sellAbove) game.issue(team, { type: 'trade', good: 'metal', dir: 'sell' });
  if (c.metal < CITY.ai.buyMetalBelow && game.teams[team].res.money > reserve + CITY.market.buy.metal) {
    game.issue(team, { type: 'trade', good: 'metal', dir: 'buy' });
  }
}

/**
 * Angriff auf die gegnerische Stadt (von ai.js jede Sekunde): alle raidEvery s schicken bis zu raidSize untätige Fahrzeuge
 * mit Angriffsmarsch zum nächsten erkundeten gegnerischen Stadtgebäude.
 */
export function aiRaid(game, team, difficulty, dt) {
  const c = game.city?.[team];
  const every = CITY.ai.raidEvery[difficulty] ?? 0;
  if (!c || !every) return;
  c.raidTimer = (c.raidTimer ?? 0) + dt;
  if (c.raidTimer < every) return;
  c.raidTimer = 0;
  const foe = game.city[1 - team];
  const main = game.mainFob(team);
  if (!foe || !main) return;
  // Ziel nach Wert: Werke, Förderung und Markt zuerst, geteilt durch die Entfernung (freie Planung seit v4.85)
  let target = null;
  let best = -Infinity;
  for (const e of foe.ents.values()) {
    if (!e.alive || !game.isExplored(team, e.x, e.y)) continue;
    const k = KINDS[foe.kind[e.cityCell] - 1];
    const v = (CITY.ai.targetValue[k] ?? 1) / (1 + Math.hypot(e.x - main.x, e.y - main.y) / 1000);
    if (v > best) {
      best = v;
      target = e;
    }
  }
  if (!target) return;
  const ids = game.units
    .filter((u) => u.alive && u.team === team && !u.def.air && u.def.armor !== 'inf' && u.weapons.length && u.order.type === 'idle' && u.def.damage?.struct > 0)
    .slice(0, CITY.ai.raidSize)
    .map((u) => u.id);
  if (ids.length) game.issue(team, { type: 'attackMove', ids, x: target.x, y: target.y });
}

/**
 * Verteidigung (von ai.js jede Denkrunde): Wird ein eigenes Stadtgebäude beschossen, schickt die KI bis zu defendSize
 * bewaffnete Bodeneinheiten aus der Nähe mit Angriffsmarsch dorthin; Förderanlagen und Werke zuerst.
 */
export function aiDefend(game, team) {
  const c = game.city?.[team];
  if (!c) return;
  const A = CITY.ai;
  if (game.time - (c.defendAt ?? -1e9) < A.defendCooldown) return;
  let spot = null;
  let best = -1;
  for (const e of c.ents.values()) {
    if (!e.alive || e.lastHitTime < game.time - 4) continue;
    const v = A.targetValue[KINDS[c.kind[e.cityCell] - 1]] ?? 1;
    if (v > best) {
      best = v;
      spot = e;
    }
  }
  if (!spot) return;
  const near = game.units
    .filter((u) => u.alive && u.team === team && !u.def.air && u.weapons.length && !u.house && !u.crate && u.order.type !== 'attack' && Math.hypot(u.x - spot.x, u.y - spot.y) < A.defendRange)
    .sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y) || a.id - b.id)
    .slice(0, A.defendSize);
  if (!near.length) return;
  c.defendAt = game.time;
  game.issue(team, { type: 'attackMove', ids: near.map((u) => u.id), x: spot.x, y: spot.y });
}
