// Stadt (PRD §15), Erzeugung: Raster je Team über die ganze Karte, gesperrte Zellen, Konfliktzone, Rohstoffvorkommen, Startviertel.
// Nur aktiv, wenn das Spiel mit `city: true` startet. Kein DOM, deterministisch.
import { CITY } from '../../data/city.js';
import { KINDS, KIND_ID } from '../../data/citykinds.js';
import { makeRng } from '../../core/rng.js';
import { RELIEF } from '../relief.js';
import { bridgeUnder } from '../river.js';
import { DEPOSITS, nearMain, cellAt, sizeOf, isPart, bigSpan, bigCenter, bigFits, cellFree, canZone } from './cells.js';
import { connectRoad, goalOf } from './roadnet.js';
import { zeroStats, updateClaim, rebuildList, placeBuilt, placeBuiltBig } from './state.js';

/**
 * Gesperrte Zellen (für beide Teams gleich): unter und um jede Hauptstadt oder auf Hindernissen (Bäume, Wasser, Häuser, Gebäude).
 * Seit v4.82 deckt das Stadtraster die ganze Karte (Zelle CITY.cell, Ursprung 0/0).
 */
function blockedCells(game, cols, rows) {
  const T = game.grid.tile;
  const S = CITY.cell;
  const k = S / T;
  const g = game.grid;
  const blocked = new Uint8Array(cols * rows);
  const mains = game.buildings.filter((b) => b.main);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx0 = col * S;
      const cy0 = row * S;
      let bad = nearMain(mains, T, cx0, cy0);
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
 * Liegt Stadtzelle (q, r) ganz oder teilweise auf Wasser, einer Furt, einer Brücke oder einer Stadtstraße der Karte?
 * Dort entstehen keine Vorkommen (seit v5.15): Brücken und Furten sind begehbar und darum nicht gesperrt (blockedCells),
 * seichtes Wasser am Zellrand kann durchrutschen.
 */
function wetCell(game, q, r) {
  const S = CITY.cell;
  const g = game.grid;
  const T = g.tile;
  if (game.roads?.kind[r * game.roads.cols + q]) return true; // Zonenstraße oder Brückenfahrbahn
  const rel = game.relief;
  const m = CITY.deposits.shore; // Abstand zum Ufer (px), auch über den Zellrand hinaus
  for (let y = r * S - m; y <= (r + 1) * S + m; y += T / 4) {
    for (let x = q * S - m; x <= (q + 1) * S + m; x += T / 4) {
      if (g.isFord(Math.floor(x / T), Math.floor(y / T))) return true;
      if (rel && rel.heightAt(x, y) < RELIEF.water) return true;
    }
  }
  for (const [dx, dy] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) if (bridgeUnder(game, (q + dx) * S, (r + dy) * S)) return true;
  return false;
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
  const free = (q, r) => q >= 1 && r >= 1 && q < cols - 1 && r < rows - 1 && !blocked[r * cols + q] && !dep[r * cols + q] && !wetCell(game, q, r);
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
  const { cols, rows, blocked, inZone, deposit, felled } = shared;
  const n = cols * rows;
  return {
    team,
    x0: 0, // linke obere Ecke des Rasters auf der Karte (px)
    y0: 0,
    cell: CITY.cell,
    gridId: game.newId(), // Kennung der Stadtgebäude im Belegungsraster (grid.struct)
    blocked, // 1 = hier kann nichts gebaut werden (beide Teams)
    felled, // 1 = Bäume gefällt (Räumen, seit v5.13; beide Teams)
    inZone, // 1 = Zelle in der Konfliktzone
    deposit, // Rohstoffvorkommen je Zelle (Index in DEPOSITS + 1), für beide Teams gleich
    mapRoads: game.roads?.kind ?? null, // Stadtstraßen der Karte (roads.js, seit v5.03): zählen als Straße, für beide Teams gleich
    metal: CITY.startMetal, // Stahl im Stadtlager (nur hier, LKW fahren es nicht)
    kero: CITY.startKero, // Kerosin im Stadtlager (seit v5.20)
    ents: new Map(), // Zelle → Ziel-Entity des Gebäudes (beschießbar, seit v4.83)
    cols,
    rows,
    kind: new Uint8Array(n), // Zellenart (KIND_ID), 0 leer
    level: new Uint8Array(n), // 0 = ausgewiesen, 1..maxLevel = Gebäude
    part: new Int32Array(n), // Großbau (seit v5.00): Mittelzelle + 1 für jede seiner Zellen, 0 = Einzelzelle
    timer: new Float32Array(n), // Wachstumszeit der Zelle
    out: new Float32Array(n), // Ausgangslager eines Werks (CITY.pickup), nur am Anker belegt; LKW holen es dort ab (seit v5.69)
    workOut: new Float32Array(n), // Ausstoß je s des Werks am Anker im letzten Schritt (Ware je s, seit v5.70; die KI nimmt nur laufende Werke als Pendlerquelle)
    pickClaim: new Uint8Array(n), // 1 am Anker: dem Werk ist gerade ein eigener LKW zugeteilt (updateLogistics setzt den Merker je Schritt, seit v5.69)
    flee: new Float32Array(n), // > 0: Bewohner geflohen, Ruhezeit bis zur Rückkehr (s)
    congestion: new Float32Array(n).fill(1), // Stau-Faktor je Straßenzelle (seit v5.20, transport.js): 1 frei, geglättet, wird gespeichert
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
  const shared = { cols, rows, blocked, inZone: zoneCells(game, cols, rows), deposit: genDeposits(game, cols, rows, blocked), felled: new Uint8Array(cols * rows) };
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
 * Startviertel (CITY.startQuarter): Straße nahe der Hauptstadt, darunter Wohnen und Raffinerie, darüber (seit v5.03) die Großbauten
 * Kaserne und Fabrikhalle nebeneinander mit der Unterkante an der Straße; Ölquelle auf dem nächsten Öl. Passt das ganze Viertel
 * nirgends, stehen die Großbauten so nah wie möglich an der Hauptstadt; seit dem Paket „Straßen“ bekommen sie danach eine Straße zum Lager.
 */
function startQuarter(game, c) {
  const m = game.mainFob(c.team);
  if (!m) return;
  const Q = CITY.startQuarter;
  const [fc, fr] = cellAt(c, m.x, m.y);
  const ok = (i) => canZone(game, c, i) && !c.kind[i] && !c.deposit[i] && cellFree(game, c, i % c.cols, Math.floor(i / c.cols));
  const big = Q.big ?? [];
  const best = quarterSpot(game, c, fc, fr, ok);
  if (best) {
    for (let k = 0; k < Q.road; k++) {
      placeBuilt(game, c, best.r * c.cols + best.q + k, 'road');
      const kind = Q.row[k];
      if (kind) placeBuilt(game, c, (best.r + 1) * c.cols + best.q + k, kind);
    }
    for (const [kind, off] of big) placeBuiltBig(game, c, cornerAnchor(c, kind, best.q + off, best.r - sizeOf(kind)), kind);
  } else looseQuarter(game, c, m, fc, fr, ok);
  const oil = nearestOil(game, c, fc, fr);
  if (oil >= 0) placeBuilt(game, c, oil, 'mine');
  rebuildList(c);
  // Anschluss ans Lager (seit v5.20, AP4): erst die Raffinerie, dann die Ölquelle an deren Netz (ein Weg zur Raffinerie); ohne Kosten
  for (const i of [...c.list]) if (!isPart(c, i) && c.level[i] && KINDS[c.kind[i] - 1] === 'fuel') connectRoad(game, c, i, false);
  if (oil >= 0 && c.kind[oil]) connectRoad(game, c, oil, false, goalOf(c, oil, 'mine'));
  // Kaserne und Fabrikhalle ebenso (Paket „Straßen“, Teil 2: Ausbildung nur mit Straßenweg zum Lager); besteht der Anschluss schon, bleibt alles gleich
  for (const i of [...c.list]) if (!isPart(c, i) && c.level[i] && CITY.produces[KINDS[c.kind[i] - 1]]) connectRoad(game, c, i, false);
  rebuildList(c);
}

/** Anker eines Großbaus, dessen linke obere Ecke bei (q, r) liegt. */
function cornerAnchor(c, kind, q, r) {
  const [lo] = bigSpan(sizeOf(kind));
  return (r + lo) * c.cols + q + lo;
}

/**
 * Platz für das ganze Startviertel nahe der Hauptstadt (Zelle fc, fr): Straße der Länge Q.road in Zeile r ab Spalte q, darunter
 * Q.row, darüber die Großbauten Q.big. Ergebnis { q, r, d } (kleinster Abstand) oder null.
 */
function quarterSpot(game, c, fc, fr, ok) {
  const Q = CITY.startQuarter;
  const n = Q.road;
  const big = Q.big ?? [];
  const up = Math.max(0, ...big.map(([k]) => sizeOf(k))); // Zeilen über der Straße
  const fits = (q, r) => {
    for (let k = 0; k < n; k++) {
      if (!ok(r * c.cols + q + k)) return false;
      if (Q.row[k] && !ok((r + 1) * c.cols + q + k)) return false;
      const sz = Q.row[k] ? sizeOf(Q.row[k]) : 1; // Großbau unter der Straße: ganzes Quadrat frei
      if (sz > 1 && (q + k + sz > c.cols || r + 1 + sz > c.rows || !bigFits(game, c, cornerAnchor(c, Q.row[k], q + k, r + 1), sz, (j) => ok(j)))) return false;
    }
    for (const [kind, off] of big) {
      const sz = sizeOf(kind);
      if (q + off + sz > c.cols || r - sz < 0) return false;
      if (!bigFits(game, c, cornerAnchor(c, kind, q + off, r - sz), sz, (j) => ok(j))) return false;
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
  return best;
}

/**
 * Kein Platz für das ganze Viertel: die Großbauten einzeln so nah wie möglich an der Hauptstadt m (größter zuerst; notfalls auch
 * auf Rohstoffvorkommen), dazu Straße an der Seite zur Hauptstadt und die Zellen darunter an der Straße der Kaserne.
 */
function looseQuarter(game, c, m, fc, fr, ok) {
  const Q = CITY.startQuarter;
  const big = Q.big ?? [];
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

/** Nächstes freies Ölvorkommen im eigenen Gebiet (Zellindex oder -1) für die Ölquelle des Startviertels. */
function nearestOil(game, c, fc, fr) {
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
  return oil;
}
