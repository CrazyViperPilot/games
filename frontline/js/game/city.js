// Stadt (SimCity-Teil, PRD §15): Zonenraster je Team, Einwohner, Arbeit, Steuern und Werke, die das Lager der Haupt-FOB füllen.
// Nur aktiv, wenn das Spiel mit `city: true` startet. Kein DOM, deterministisch.
import { CITY } from '../data/city.js';
import { BALANCE } from '../data/balance.js';
import { nearestPassable } from './movement.js';

/** Zellenarten (Code im Raster): 0 leer. */
export const KINDS = ['road', 'res', 'com', 'bm', 'mun', 'fuel'];
export const KIND_ID = Object.fromEntries(KINDS.map((k, i) => [k, i + 1]));
export const KIND_NAME = { road: 'Straße', res: 'Wohnen', com: 'Gewerbe', bm: 'Baumaterial-Werk', mun: 'Munitionswerk', fuel: 'Raffinerie' };
const WORKS = ['bm', 'mun', 'fuel'];

const zeroStats = () => ({ pop: 0, housing: 0, jobs: 0, jobsCom: 0, workers: 0, bm: 0, mun: 0, fuel: 0, money: 0 });

/**
 * Stadt eines Teams um seine Haupt-FOB: das Raster liegt auf der Karte, die FOB nahe am Rand zur Kartenmitte (Konfliktzone),
 * die Stadt dahinter. Zellen unter und um die FOB oder auf Hindernissen (Bäume, Wasser, Häuser) sind gesperrt.
 */
function createTeamCity(game, team) {
  const n = CITY.cols * CITY.rows;
  const T = game.grid.tile;
  const S = CITY.cell;
  const W = game.grid.cols * T;
  const H = game.grid.rows * T;
  const fob = game.mainFob(team);
  const fx = fob ? fob.x : W / 2;
  const fy = fob ? fob.y : H / 2;
  const snap = (v, max) => Math.max(T, Math.min(max - T, Math.round(v / T) * T));
  const x0 = snap(fx - (CITY.cols * S) / 2, W - CITY.cols * S);
  // Stadt auf der der Kartenmitte abgewandten Seite der FOB
  const below = fy > H / 2;
  const y0 = snap(below ? fy - CITY.fobRow * S : fy + CITY.fobRow * S - CITY.rows * S, H - CITY.rows * S);
  const blocked = new Uint8Array(n);
  const m = CITY.fobMargin;
  const g = game.grid;
  for (let row = 0; row < CITY.rows; row++) {
    for (let col = 0; col < CITY.cols; col++) {
      const cx0 = x0 + col * S;
      const cy0 = y0 + row * S;
      let bad = false;
      if (fob) {
        const bx0 = fob.cx * T - m;
        const by0 = fob.cy * T - m;
        const bx1 = (fob.cx + fob.w) * T + m;
        const by1 = (fob.cy + fob.h) * T + m;
        bad = cx0 < bx1 && cx0 + S > bx0 && cy0 < by1 && cy0 + S > by0;
      }
      for (let r = cy0 / T; !bad && r < (cy0 + S) / T; r++) {
        for (let c = cx0 / T; c < (cx0 + S) / T; c++) if (!g.free(c, r)) bad = true;
      }
      blocked[row * CITY.cols + col] = bad ? 1 : 0;
    }
  }
  return {
    team,
    x0, // linke obere Ecke des Rasters auf der Karte (px)
    y0,
    cell: S,
    gridId: game.newId(), // Kennung der Stadtgebäude im Belegungsraster (grid.struct)
    blocked, // 1 = hier kann nichts gebaut werden
    cols: CITY.cols,
    rows: CITY.rows,
    kind: new Uint8Array(n), // Zellenart (KIND_ID), 0 leer
    level: new Uint8Array(n), // 0 = ausgewiesen, 1..maxLevel = Gebäude
    timer: new Float32Array(n), // Wachstumszeit der Zelle
    popF: 0, // Einwohner (Bruchteile)
    stats: zeroStats(), // Rate je s und Summen des letzten Schritts (für die Anzeige)
  };
}

/** Stadt je Team anlegen; ohne `enabled` bleibt `game.city` null und alles andere wie gehabt. */
export function createCity(game, enabled) {
  game.city = null;
  if (!enabled) return;
  game.city = game.teams.map((t) => createTeamCity(game, t.id));
  for (const b of game.buildings) {
    if (!b.main) continue;
    b.infinite = false; // endliches Lager: die Werke füllen es
    b.store = { ...CITY.startStock };
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

/** Summen (Wohnplätze, Arbeitsplätze je Art) aus den gebauten Zellen. */
function totals(c) {
  const t = { housing: 0, jobsCom: 0, bm: 0, mun: 0, fuel: 0 };
  for (let i = 0; i < c.kind.length; i++) {
    const lv = c.level[i];
    if (!lv) continue;
    const k = KINDS[c.kind[i] - 1];
    if (k === 'res') t.housing += CITY.housing[lv];
    else if (k === 'com') t.jobsCom += CITY.jobsCom[lv];
    else if (WORKS.includes(k)) t[k] += CITY.jobs[lv];
  }
  return t;
}

/** Ein Simulationsschritt der Stadt beider Teams. Nach updateEconomy aufrufen. */
export function updateCity(game, dt) {
  if (!game.city) return;
  game.teams.forEach((team, id) => {
    const c = game.city[id];
    const t = totals(c);
    const jobs = t.jobsCom + t.bm + t.mun + t.fuel;

    // Einwohner ziehen ein oder ab, bis die Wohnplätze gefüllt sind (ohne Arbeit nur ein kleiner Anfang)
    const target = jobs > 0 ? t.housing : Math.min(t.housing, CITY.startPop);
    if (c.popF < target) c.popF = Math.min(target, c.popF + CITY.immigration * dt);
    else if (c.popF > target) c.popF = Math.max(target, c.popF - CITY.immigration * dt);
    const pop = c.popF;

    // Wachstum der Zellen: Gebäude entstehen nur mit Straßenanschluss, Ausbau nur bei Bedarf
    for (let row = 0; row < c.rows; row++) {
      for (let col = 0; col < c.cols; col++) {
        const i = idx(c, col, row);
        const kind = KINDS[c.kind[i] - 1];
        if (!kind || kind === 'road' || !hasRoad(c, col, row)) continue;
        const lv = c.level[i];
        if (lv >= CITY.maxLevel) continue;
        const need = lv === 0 ? CITY.growTime : CITY.upgradeTime;
        const wanted = lv === 0 || (kind === 'res' ? jobs >= pop * CITY.demand : pop >= jobs * CITY.demand);
        if (c.timer[i] < need) c.timer[i] += dt;
        if (c.timer[i] >= need && wanted) {
          if (lv === 0) {
            if (!cellFree(game, c, col, row)) continue; // ein Gebäude oder Hindernis steht im Weg: warten
            occupyCell(game, c, col, row);
          }
          c.level[i] = lv + 1;
          c.timer[i] = 0;
        }
      }
    }

    // Arbeit, Erträge, Steuern
    const fill = jobs > 0 ? Math.min(1, pop / jobs) : 0;
    const s = zeroStats();
    s.pop = pop;
    s.housing = t.housing;
    s.jobs = jobs;
    s.jobsCom = t.jobsCom;
    s.workers = jobs * fill;
    for (const k of WORKS) s[k] = t[k] * fill * CITY.yield[k];
    s.money = pop * CITY.taxPop + t.jobsCom * fill * CITY.taxCom;
    c.stats = s;

    const main = game.mainFob(id);
    if (main && main.built) {
      for (const k of WORKS) main.store[k] = Math.min(BALANCE.logistics.storeCap, main.store[k] + s[k] * dt);
    }
    team.res.money += s.money * dt;
    team.rate.money += s.money;
  });
}

/**
 * Befehl `{ type: 'city', kind: 'road'|'res'|'com'|'bm'|'mun'|'fuel'|'erase', c0, r0, c1, r1 }`:
 * Rechteck (Spalten c0..c1, Zeilen r0..r1) ausweisen oder räumen. Kostet Geld je Zelle, bis das Geld ausgeht.
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
  if (!(c1 >= c0 && r1 >= r0)) return { ok: false, reason: 'Außerhalb der Stadt' };
  const t = game.teams[team];
  const id = erase ? 0 : KIND_ID[cmd.kind];
  let placed = 0;
  let broke = false;
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const i = idx(city, col, row);
      if (city.kind[i] === id || city.blocked[i]) continue;
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
      placed++;
    }
  }
  if (!placed) return { ok: false, reason: broke ? 'Zu wenig Geld' : 'Nichts zu ändern' };
  return { ok: true, placed, broke };
}

// ---- KI: fester Bauplan (zwei Straßenzeilen, Wohnen/Gewerbe oben, Werke unten), Spalte für Spalte ----

const WORK_CYCLE = ['bm', 'bm', 'mun', 'bm', 'fuel', 'mun'];

/** Liste (Reihenfolge = Priorität) von { kind, col, row } für das Raster. */
export function aiBlueprint(cols = CITY.cols, rows = CITY.rows) {
  const roadA = 2;
  const roadB = rows - 3;
  const out = [];
  for (let col = 0; col < cols; col++) {
    out.push({ kind: 'road', col, row: roadA });
    out.push({ kind: 'res', col, row: roadA - 1 });
    out.push({ kind: 'road', col, row: roadB });
    out.push({ kind: WORK_CYCLE[col % WORK_CYCLE.length], col, row: roadB - 1 });
    out.push({ kind: col % 2 === 0 ? 'com' : 'res', col, row: roadA + 1 });
    out.push({ kind: WORK_CYCLE[(col + 3) % WORK_CYCLE.length], col, row: roadB + 1 });
  }
  return out;
}

/** KI-Schritt (alle ai.interval s von ai.js): setzt die nächsten Zellen des Bauplans, solange Geld über der Reserve bleibt. */
export function aiCity(game, team, difficulty) {
  const city = game.city?.[team];
  if (!city) return;
  const reserve = CITY.ai.reserve[difficulty] ?? CITY.ai.reserve.normal;
  const plan = aiBlueprint(city.cols, city.rows);
  let n = 0;
  for (const step of plan) {
    const i = idx(city, step.col, step.row);
    if (city.kind[i] === KIND_ID[step.kind] || city.blocked[i]) continue;
    // Bedarf: nur Werke und Wohnen im Gleichgewicht ausweisen (Straßen sind billig und immer erlaubt)
    if (game.teams[team].res.money < CITY.cost[step.kind] + reserve) return;
    game.issue(team, { type: 'city', kind: step.kind, c0: step.col, r0: step.row, c1: step.col, r1: step.row });
    if (++n >= 4) return;
  }
}
