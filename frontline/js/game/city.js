// Stadt (SimCity-Teil, PRD §15): Zonenraster je Team über die ganze Karte, Gebiet, Einwohner (auch als Truppen), Flucht aus der
// Konfliktzone, Arbeit, Steuern und Werke, die das Lager der Hauptstadt füllen.
// Nur aktiv, wenn das Spiel mit `city: true` startet. Kein DOM, deterministisch.
import { CITY } from '../data/city.js';
import { BALANCE } from '../data/balance.js';
import { nearestPassable } from './movement.js';
import { makeRng } from '../core/rng.js';

/** Zellenarten (Code im Raster): 0 leer. Neue Arten nur hinten anhängen (Code = Index + 1). */
export const KINDS = ['road', 'res', 'com', 'bm', 'mun', 'fuel', 'steel', 'mine', 'market', 'power', 'uni', 'dc'];
export const KIND_ID = Object.fromEntries(KINDS.map((k, i) => [k, i + 1]));
export const KIND_NAME = {
  road: 'Straße', res: 'Wohnen', com: 'Gewerbe', bm: 'Baumaterial-Werk', mun: 'Munitionswerk', fuel: 'Raffinerie',
  steel: 'Stahlwerk', mine: 'Förderanlage', market: 'Markt', power: 'Kraftwerk', uni: 'Universität', dc: 'Rechenzentrum',
};
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
    metal: CITY.startMetal, // Metall im Hauptlager (nur hier, LKW fahren es nicht)
    ents: new Map(), // Zelle → Ziel-Entity des Gebäudes (beschießbar, seit v4.83)
    cols,
    rows,
    kind: new Uint8Array(n), // Zellenart (KIND_ID), 0 leer
    level: new Uint8Array(n), // 0 = ausgewiesen, 1..maxLevel = Gebäude
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
  }
  for (const c of game.city) {
    updateClaim(game, c);
    startQuarter(game, c);
    updateClaim(game, c);
  }
}

/** Fertige Zelle setzen (Stufe 1) ohne Kosten und ohne Wartezeit: Startviertel. */
function placeBuilt(game, c, i, kind) {
  const col = i % c.cols;
  const row = (i - col) / c.cols;
  c.kind[i] = KIND_ID[kind];
  if (kind !== 'road') {
    if (!cellFree(game, c, col, row)) return;
    occupyCell(game, c, col, row);
    c.level[i] = 1;
    syncEntity(game, c, i);
  }
}

/** Startviertel (CITY.startQuarter): Straße und darunter Wohnen und Raffinerie nahe der Hauptstadt, Ölquelle auf dem nächsten Öl. */
function startQuarter(game, c) {
  const m = game.mainFob(c.team);
  if (!m) return;
  const Q = CITY.startQuarter;
  const n = Q.road;
  const [fc, fr] = cellAt(c, m.x, m.y);
  const ok = (i) => canZone(game, c, i) && !c.kind[i] && !c.deposit[i];
  let best = null;
  for (let r = Math.max(0, fr - 8); r <= Math.min(c.rows - 2, fr + 8); r++) {
    for (let q = Math.max(0, fc - 8); q <= Math.min(c.cols - n, fc + 8); q++) {
      let good = true;
      for (let k = 0; good && k < n; k++) good = ok(r * c.cols + q + k) && ok((r + 1) * c.cols + q + k);
      if (!good) continue;
      const d = Math.abs(q + n / 2 - fc) + Math.abs(r - fr);
      if (!best || d < best.d) best = { q, r, d };
    }
  }
  if (best) {
    for (let k = 0; k < n; k++) {
      placeBuilt(game, c, best.r * c.cols + best.q + k, 'road');
      const kind = Q.row[k];
      if (kind) placeBuilt(game, c, (best.r + 1) * c.cols + best.q + k, kind);
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
    if (!c.level[i] || c.kind[i] === KIND_ID.road) continue;
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

/** Hat die Zelle eine Straße als Nachbarn (4er-Nachbarschaft)? */
export function hasRoad(c, col, row) {
  const r = KIND_ID.road;
  return (
    (col > 0 && c.kind[idx(c, col - 1, row)] === r) ||
    (col < c.cols - 1 && c.kind[idx(c, col + 1, row)] === r) ||
    (row > 0 && c.kind[idx(c, col, row - 1)] === r) ||
    (row < c.rows - 1 && c.kind[idx(c, col, row + 1)] === r)
  );
}

/** Summen (Wohnplätze, Arbeitsplätze je Art) aus den gebauten Zellen; geflohene Wohnzellen zählen nicht. */
function totals(c) {
  const t = { housing: 0, fled: 0, jobsCom: 0, bm: 0, mun: 0, fuel: 0, steel: 0, mine: { wood: 0, stone: 0, ore: 0, oil: 0 }, market: 0, power: 0, powerJobs: 0, uni: 0, dc: 0, jobsOther: 0, use: 0 };
  for (const i of c.list) {
    const lv = c.level[i];
    if (!lv) continue;
    const k = KINDS[c.kind[i] - 1];
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
  const hp = CITY.hp[lv];
  const name = k === 'mine' ? MINE_NAME[DEPOSITS[c.deposit[i] - 1]] ?? KIND_NAME.mine : KIND_NAME[k];
  if (!e) {
    const col = i % c.cols;
    const r = cellRect(c, col, (i - col) / c.cols);
    const w = c.cell / game.grid.tile;
    e = { id: game.newId(), kind: 'building', type: 'city', cityCell: i, team: c.team, x: r.x, y: r.y, cx: r.x0 / game.grid.tile, cy: r.y0 / game.grid.tile, w, h: w, hp, alive: true, built: true, lastHitTime: -1e9, def: { name, hp, armor: 'struct', cost: { bm: CITY.bountyBm * lv } } };
    c.ents.set(i, e);
    game.entities.set(e.id, e);
    return;
  }
  e.hp += hp - e.def.hp;
  e.def = { ...e.def, name, hp, cost: { bm: CITY.bountyBm * lv } };
}

function dropEntity(game, c, i) {
  const e = c.ents.get(i);
  if (!e) return;
  e.alive = false;
  game.entities.delete(e.id);
  c.ents.delete(i);
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
      const col = i % c.cols;
      const row = (i - col) / c.cols;
      dropEntity(game, c, i);
      releaseCell(game, c, col, row);
      c.level[i] = 0;
      c.timer[i] = -CITY.ruinTime;
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
        if (lv === 0) {
          if (!cellFree(game, c, col, row)) continue; // ein Gebäude oder Hindernis steht im Weg: warten
          occupyCell(game, c, col, row);
          built = true;
        }
        c.level[i] = lv + 1;
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
    c.metal = Math.max(0, Math.min(BALANCE.logistics.storeCap, c.metal + s.metal * dt));
    s.money = (pool * CITY.taxPop + t.jobsCom * fill * CITY.taxCom) * mood;
    c.stats = s;

    const main = game.mainFob(id);
    if (main && main.built) {
      for (const k of ['bm', 'mun', 'fuel']) main.store[k] = Math.min(BALANCE.logistics.storeCap, main.store[k] + s[k] * dt);
    }
    team.res.money += s.money * dt;
    team.rate.money += s.money;
  });
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

/** Stromverhältnis der Stadt (1 = genug Strom); ohne Stadt 1. */
export function powerRatio(game, team) {
  return game.city?.[team]?.stats.powerRatio ?? 1;
}

/** Stadtgebäude (Ziel-Entity) eines Teams in der Zelle unter (x, y), oder null. */
export function cityEntityAt(game, x, y) {
  for (const c of game.city ?? []) {
    const [q, r] = cellAt(c, x, y);
    if (q < 0 || r < 0 || q >= c.cols || r >= c.rows) continue;
    const e = c.ents.get(r * c.cols + q);
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
      for (const e of c.ents.values()) if (e.alive && Math.abs(e.x - x) <= radius + S && Math.abs(e.y - y) <= radius + S) fn(e);
      continue;
    }
    for (let r = r0; r <= r1; r++) {
      for (let q = q0; q <= q1; q++) {
        const e = c.ents.get(r * c.cols + q);
        if (e && e.alive) fn(e);
      }
    }
  }
}

/**
 * Befehl `{ type: 'trade', good: 'bm'|'mun'|'fuel'|'metal', dir: 'sell'|'buy' }`: ein Los (CITY.market.lot) am Markt handeln.
 * Braucht einen fertigen eigenen Markt. BM, MUN, TS liegen im Lager der Hauptstadt, Metall im Stadtlager.
 */
export function cmdTrade(game, team, cmd) {
  const c = game.city?.[team];
  if (!c) return { ok: false, reason: 'Die Stadt ist in dieser Partie ausgeschaltet' };
  if (!GOODS.includes(cmd.good) || (cmd.dir !== 'sell' && cmd.dir !== 'buy')) return { ok: false, reason: 'Unbekannter Handel' };
  let market = false;
  for (const i of c.list) if (c.kind[i] === KIND_ID.market && c.level[i]) market = true;
  if (!market) return { ok: false, reason: 'Erst einen Markt bauen' };
  const main = game.mainFob(team);
  if (!main && cmd.good !== 'metal') return { ok: false, reason: 'Hauptstadt zerstört' };
  const M = CITY.market;
  const cap = BALANCE.logistics.storeCap;
  const t = game.teams[team];
  const have = cmd.good === 'metal' ? c.metal : main.store[cmd.good];
  const add = (v) => {
    if (cmd.good === 'metal') c.metal = Math.min(cap, c.metal + v);
    else main.store[cmd.good] = Math.min(cap, main.store[cmd.good] + v);
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
  for (const o of game.city) if (o !== c && o.kind[i]) return false;
  return true;
}

/**
 * Befehl `{ type: 'city', kind: 'road'|'res'|'com'|'bm'|'mun'|'fuel'|'erase', c0, r0, c1, r1 }`:
 * Rechteck (Spalten c0..c1, Zeilen r0..r1 im Kartenraster) ausweisen oder räumen. Überall, wo nichts gesperrt ist (seit v4.87).
 * Kostet Geld je Zelle, bis das Geld ausgeht.
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
  const t = game.teams[team];
  const id = erase ? 0 : KIND_ID[cmd.kind];
  let placed = 0;
  let broke = false;
  let outside = false;
  let noDeposit = false;
  const main = game.mainFob(team);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const i = idx(city, col, row);
      if (city.kind[i] === id) continue;
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
          broke = true;
          continue;
        }
        t.res.money -= price;
        if (bm) main.store.bm -= bm;
      }
      if (city.level[i]) releaseCell(game, city, col, row);
      dropEntity(game, city, i);
      city.kind[i] = id;
      city.level[i] = 0;
      city.timer[i] = 0;
      city.flee[i] = 0;
      placed++;
    }
  }
  const poor = (CITY.costBm[cmd.kind] ?? 0) > 0 ? 'Zu wenig Baumaterial im Lager der Hauptstadt' : 'Zu wenig Geld';
  if (!placed) return { ok: false, reason: broke ? poor : noDeposit ? 'Förderanlagen nur auf Rohstoffvorkommen' : outside ? 'Nur im eigenen Gebiet bauen' : 'Nichts zu ändern' };
  rebuildList(city);
  // Zonen ohne Straße daneben wachsen nicht (Förderanlagen schon): melden
  let noRoad = false;
  if (!erase && cmd.kind !== 'road' && cmd.kind !== 'mine') {
    for (let row = r0; row <= r1 && !noRoad; row++) for (let col = c0; col <= c1; col++) if (city.kind[idx(city, col, row)] === id && !hasRoad(city, col, row)) noRoad = true;
  }
  return { ok: true, placed, broke, noRoad };
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
function aiNeed(game, c, add) {
  const t = totals(c);
  const A = CITY.ai;
  const count = { res: 0, com: 0, bm: 0, mun: 0, fuel: 0, steel: 0, market: 0, power: 0, uni: 0, dc: 0 };
  for (const k in add) count[k] += add[k];
  for (const i of c.list) {
    const k = KINDS[c.kind[i] - 1];
    if (k in count) count[k]++;
  }
  const work = count.com + count.bm + count.mun + count.fuel + count.steel + count.market;
  const free = c.stats.free ?? 0;
  // Strom, Universität, Rechenzentrum (seit v4.88) nach Bedarf
  const st = c.stats;
  if (st.powerSupply + (add.power ?? 0) * CITY.power.supply[1] < st.powerUse * A.powerMargin + 10 && (add.power ?? 0) < 1) return 'power';
  if (!count.uni && work >= A.uniFrom) return 'uni';
  if (!count.dc && count.uni && work >= A.dcFrom) return 'dc';
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
  let best = 'bm';
  let lo = Infinity;
  for (const [k, w] of Object.entries(A.mix)) {
    if (k === 'market' && count.market >= 1) continue; // ein Markt reicht
    const r = count[k] / (w * (low[k] ? A.boost : 1));
    if (r < lo) {
      lo = r;
      best = k;
    }
  }
  return best;
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
  const add = {};
  for (const cand of aiCandidates(game, city, anchor.x, anchor.y, rad)) {
    if (cand.deposit) continue; // Vorkommen bleiben für Förderanlagen frei
    let kind = 'road';
    if (!cand.road) {
      // nur neben einer (geplanten) Straße
      if (!hasRoad(city, cand.col, cand.row)) continue;
      kind = aiNeed(game, city, add);
    }
    if (money() < CITY.cost[kind] + reserve) return;
    const r = game.issue(team, { type: 'city', kind, c0: cand.col, r0: cand.row, c1: cand.col, r1: cand.row });
    if (!r.ok) continue;
    if (kind !== 'road') add[kind] = (add[kind] ?? 0) + 1;
    if (++n >= CITY.ai.perStep) return;
  }
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
