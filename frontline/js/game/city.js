// Stadt (SimCity-Teil, PRD §15): Zonenraster je Team über die ganze Karte, Gebiet, Einwohner (auch als Truppen), Flucht aus der
// Konfliktzone, Arbeit, Steuern und Werke, die das Lager der Haupt-FOB füllen.
// Nur aktiv, wenn das Spiel mit `city: true` startet. Kein DOM, deterministisch.
import { CITY } from '../data/city.js';
import { BALANCE } from '../data/balance.js';
import { nearestPassable } from './movement.js';

/** Zellenarten (Code im Raster): 0 leer. */
export const KINDS = ['road', 'res', 'com', 'bm', 'mun', 'fuel'];
export const KIND_ID = Object.fromEntries(KINDS.map((k, i) => [k, i + 1]));
export const KIND_NAME = { road: 'Straße', res: 'Wohnen', com: 'Gewerbe', bm: 'Baumaterial-Werk', mun: 'Munitionswerk', fuel: 'Raffinerie' };
const WORKS = ['bm', 'mun', 'fuel'];

const zeroStats = () => ({ pop: 0, housing: 0, jobs: 0, jobsCom: 0, workers: 0, drafted: 0, free: 0, fled: 0, bm: 0, mun: 0, fuel: 0, money: 0 });

/**
 * Gesperrte Zellen (für beide Teams gleich): unter und um jede Haupt-FOB oder auf Hindernissen (Bäume, Wasser, Häuser, Gebäude).
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

/** Stadt eines Teams: eigenes Zonenraster über die ganze Karte (gemeinsame Sperren), Gebiet, Einwohner. */
function createTeamCity(game, team, shared) {
  const { cols, rows, blocked, inZone } = shared;
  const n = cols * rows;
  return {
    team,
    x0: 0, // linke obere Ecke des Rasters auf der Karte (px)
    y0: 0,
    cell: CITY.cell,
    gridId: game.newId(), // Kennung der Stadtgebäude im Belegungsraster (grid.struct)
    blocked, // 1 = hier kann nichts gebaut werden (beide Teams)
    inZone, // 1 = Zelle in der Konfliktzone
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
  const shared = { cols, rows, blocked: blockedCells(game, cols, rows), inZone: zoneCells(game, cols, rows) };
  game.city = game.teams.map((t) => createTeamCity(game, t.id, shared));
  for (const b of game.buildings) {
    if (!b.main) continue;
    b.infinite = false; // endliches Lager: die Werke füllen es
    b.store = { ...CITY.startStock };
  }
  for (const c of game.city) updateClaim(game, c);
}

/** Zelle (Spalte, Zeile) eines Weltpunkts. */
export function cellAt(c, x, y) {
  return [Math.floor((x - c.x0) / c.cell), Math.floor((y - c.y0) / c.cell)];
}

/** Gebiet neu berechnen: Kreise um die eigenen fertigen FOBs (Haupt-FOB größer) und um fertige Stadtgebäude. */
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
  const t = { housing: 0, fled: 0, jobsCom: 0, bm: 0, mun: 0, fuel: 0 };
  for (const i of c.list) {
    const lv = c.level[i];
    if (!lv) continue;
    const k = KINDS[c.kind[i] - 1];
    if (k === 'res') {
      if (c.flee[i] > 0) t.fled += CITY.housing[lv];
      else t.housing += CITY.housing[lv];
    } else if (k === 'com') t.jobsCom += CITY.jobsCom[lv];
    else if (WORKS.includes(k)) t[k] += CITY.jobs[lv];
  }
  return t;
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

    // Truppen: gefallene Soldaten fehlen der Stadt (Einwohner weg, müssen neu zuziehen)
    const drafted = draftedCount(game, id);
    if (drafted < c.drafted) c.popF = Math.max(0, c.popF - (c.drafted - drafted));
    c.drafted = drafted;

    const t = totals(c);
    const jobs = t.jobsCom + t.bm + t.mun + t.fuel;

    // Einwohner ziehen ein oder ab, bis die Wohnplätze gefüllt sind (ohne Arbeit nur ein kleiner Anfang)
    const target = jobs > 0 ? t.housing : Math.min(t.housing, CITY.startPop);
    if (c.popF < target) c.popF = Math.min(target, c.popF + CITY.immigration * dt);
    else if (c.popF > target) c.popF = Math.max(target, c.popF - CITY.immigration * dt);
    const pop = c.popF;
    const pool = Math.max(0, pop - drafted); // Einwohner, die arbeiten können

    // Wachstum der Zellen: Gebäude entstehen nur mit Straßenanschluss, Ausbau nur bei Bedarf
    let built = false;
    for (const i of c.list) {
      const kind = KINDS[c.kind[i] - 1];
      const col = i % c.cols;
      const row = (i - col) / c.cols;
      if (kind === 'road' || !hasRoad(c, col, row)) continue;
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
      }
    }
    if (built) updateClaim(game, c);

    // Arbeit, Erträge, Steuern
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
    for (const k of WORKS) s[k] = t[k] * fill * CITY.yield[k];
    s.money = pool * CITY.taxPop + t.jobsCom * fill * CITY.taxCom;
    c.stats = s;

    const main = game.mainFob(id);
    if (main && main.built) {
      for (const k of WORKS) main.store[k] = Math.min(BALANCE.logistics.storeCap, main.store[k] + s[k] * dt);
    }
    team.res.money += s.money * dt;
    team.rate.money += s.money;
  });
}

/** Darf `team` die Zelle i ausweisen? Eigenes Gebiet, nicht gesperrt, nicht vom Gegner belegt. */
export function canZone(game, c, i) {
  if (c.blocked[i] || !c.claim[i]) return false;
  for (const o of game.city) if (o !== c && o.kind[i]) return false;
  return true;
}

/**
 * Befehl `{ type: 'city', kind: 'road'|'res'|'com'|'bm'|'mun'|'fuel'|'erase', c0, r0, c1, r1 }`:
 * Rechteck (Spalten c0..c1, Zeilen r0..r1 im Kartenraster) ausweisen oder räumen. Nur im eigenen Gebiet.
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
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const i = idx(city, col, row);
      if (city.kind[i] === id) continue;
      if (!erase && !canZone(game, city, i)) {
        if (!city.blocked[i] && !city.claim[i]) outside = true;
        continue;
      }
      if (!erase) {
        const price = CITY.cost[cmd.kind];
        if (t.res.money < price) {
          broke = true;
          continue;
        }
        t.res.money -= price;
      }
      if (city.level[i]) releaseCell(game, city, col, row);
      city.kind[i] = id;
      city.level[i] = 0;
      city.timer[i] = 0;
      city.flee[i] = 0;
      placed++;
    }
  }
  if (!placed) return { ok: false, reason: broke ? 'Zu wenig Geld' : outside ? 'Nur im eigenen Gebiet bauen' : 'Nichts zu ändern' };
  rebuildList(city);
  return { ok: true, placed, broke };
}

// ---- KI: baut in Ringen um die Haupt-FOB nach außen, dazu kleine Viertel an vorderen FOBs (seit v4.82) ----

/** Ist die Zelle im Muster um den Anker (ac, ar) eine Straße? Jede roadEvery-te Zeile und die Spalte durch den Anker. */
function aiRoad(col, row, ac, ar) {
  const n = CITY.ai.roadEvery;
  return (((row - ar) % n) + n) % n === 0 || col === ac;
}

/** Welche Zone braucht die Stadt als Nächstes? Wohnen, wenn Arbeit fehlt, sonst die Arbeitsstätte mit dem größten Rückstand. */
function aiNeed(c, add) {
  const t = totals(c);
  const count = { res: add.res, com: add.com, bm: add.bm, mun: add.mun, fuel: add.fuel };
  for (const i of c.list) {
    const k = KINDS[c.kind[i] - 1];
    if (k in count) count[k]++;
  }
  const work = count.com + count.bm + count.mun + count.fuel;
  if (count.res < work * 1.2 || (t.housing + t.fled < c.drafted + 20 && count.res <= work * 2)) return 'res';
  let best = 'bm';
  let lo = Infinity;
  for (const [k, w] of Object.entries(CITY.ai.mix)) {
    const r = count[k] / w;
    if (r < lo) {
      lo = r;
      best = k;
    }
  }
  return best;
}

/** Freie Zellen um den Anker (Weltpunkt), nach Abstand sortiert (Ringe), bis zum Radius in Zellen. */
function aiCandidates(game, c, x, y, rad) {
  const [ac, ar] = cellAt(c, x, y);
  const out = [];
  for (let row = Math.max(0, ar - rad); row <= Math.min(c.rows - 1, ar + rad); row++) {
    for (let col = Math.max(0, ac - rad); col <= Math.min(c.cols - 1, ac + rad); col++) {
      const i = idx(c, col, row);
      if (c.kind[i] || !canZone(game, c, i)) continue;
      const d = Math.max(Math.abs(col - ac), Math.abs(row - ar)) * 100 + Math.abs(col - ac) + Math.abs(row - ar);
      out.push({ i, col, row, d, road: aiRoad(col, row, ac, ar) });
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
  city.aiTurn = (city.aiTurn ?? 0) + 1;
  const main = game.mainFob(team);
  const fobs = game.buildings.filter((b) => b.alive && b.built && b.team === team && b.type === 'fob' && !b.main);
  let anchor = main;
  let rad = CITY.territory.main + CITY.territory.building * 4;
  if (fobs.length && (city.aiTurn % CITY.ai.quarterEvery === 0 || !main)) {
    anchor = fobs[Math.floor(city.aiTurn / CITY.ai.quarterEvery) % fobs.length];
    rad = CITY.ai.quarter;
  }
  if (!anchor) return;
  const add = { res: 0, com: 0, bm: 0, mun: 0, fuel: 0 };
  let n = 0;
  for (const cand of aiCandidates(game, city, anchor.x, anchor.y, rad)) {
    let kind = 'road';
    if (!cand.road) {
      // nur neben einer (geplanten) Straße
      if (!hasRoad(city, cand.col, cand.row)) continue;
      kind = aiNeed(city, add);
    }
    if (game.teams[team].res.money < CITY.cost[kind] + reserve) return;
    const r = game.issue(team, { type: 'city', kind, c0: cand.col, r0: cand.row, c1: cand.col, r1: cand.row });
    if (!r.ok) continue;
    if (kind !== 'road') add[kind]++;
    if (++n >= CITY.ai.perStep) return;
  }
}
