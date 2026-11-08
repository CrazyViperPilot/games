// Stadt (js/game/city/ und js/ai/cityai.js, PRD §15): Zonen, Wachstum, Einwohner, Erträge ins Lager der Hauptstadt, Befehl und KI-Bauplan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { BALANCE } from '../js/data/balance.js';
import { AI } from '../js/ai/ai.js';
import { treeGone } from '../js/game/city/clearing.js';
import { KINDS, KIND_ID } from '../js/data/citykinds.js';
import { canZone, hasRoad, sizeOf, cellsOf, isPart, accessCells, roadAt, cellRect, DEPOSITS, cellAt } from '../js/game/city/cells.js';
import { cityNoise } from '../js/game/city/state.js';
import { freePop, hasMarket, cityEntityAt, cityTrainers, forEnemyCity, cityLevel } from '../js/game/city/query.js';
import { cityAiMemory, aiCity, aiDefend, aiRaid } from '../js/ai/cityai.js';
import { connectRoad } from '../js/game/city/roadnet.js';
import { transportOf, transportInfo } from '../js/game/transport.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { RELIEF } from '../js/game/relief.js';
import { bridgeUnder } from '../js/game/river.js';
import { withValue } from './util.js';

const run = (g, s) => { for (let t = 0; t < s * 20; t++) g.update(0.05); };
// Ursprung (c, r) eines w × h großen, ganz bebaubaren Rechtecks im Gebiet des Teams, nahe der Hauptstadt
function spot(g, w, h, team = 0) {
  const c = g.city[team];
  const m = g.mainFob(team);
  const fc = Math.floor(m.x / c.cell);
  const fr = Math.floor(m.y / c.cell);
  let best = null;
  for (let r = 0; r <= c.rows - h; r++) {
    for (let q = 0; q <= c.cols - w; q++) {
      let ok = true;
      for (let y = r; ok && y < r + h; y++) for (let x = q; ok && x < q + w; x++) ok = canZone(g, c, y * c.cols + x) && !c.kind[y * c.cols + x];
      if (!ok) continue;
      const d = Math.abs(q - fc) + Math.abs(r - fr);
      if (!best || d < best.d) best = { c: q, r, d };
    }
  }
  assert.ok(best, 'kein Platz im Gebiet');
  return best;
}
const base = new WeakMap();
const paint = (g, kind, c0, r0, c1, r1, team = 0) => {
  if (!g.city) return raw(g, kind, c0, r0, c1, r1, team);
  if (!base.has(g)) base.set(g, spot(g, 10, 6, team));
  const b = base.get(g);
  return raw(g, kind, b.c + c0, b.r + r0, b.c + c1, b.r + r1, team);
};
const at = (g, col, row) => { const b = base.get(g); return (b.r + row) * g.city[0].cols + b.c + col; };
// Startviertel räumen (Tests, die eine leere Stadt brauchen)
function clearStart(g, team = 0) {
  const c = g.city[team];
  for (const i of [...c.list]) {
    const q = i % c.cols;
    const r = (i - q) / c.cols;
    g.issue(team, { type: 'city', kind: 'erase', c0: q, r0: r, c1: q, r1: r });
  }
}
const raw = (g, kind, c0, r0, c1, r1, team = 0) => g.issue(team, { type: 'city', kind, c0, r0, c1, r1 });
// Nachbarzellen (4er) einer Zelle, nur innerhalb des Rasters.
function nbOf(c, j) {
  const q = j % c.cols;
  const r = (j - q) / c.cols;
  const out = [];
  if (q > 0) out.push(j - 1);
  if (q < c.cols - 1) out.push(j + 1);
  if (r > 0) out.push(j - c.cols);
  if (r < c.rows - 1) out.push(j + c.cols);
  return out;
}
// Breitensuche über freie, bebaubare Zellen ab `starts` bis goal(j) gilt; baut dann je Zelle des Weges eine Straße (Befehl).
function connect(g, team, starts, goal) {
  const c = g.city[team];
  const n = c.cols * c.rows;
  const prev = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const q = [];
  const free = (k) => !seen[k] && !c.kind[k] && canZone(g, c, k);
  for (const k of starts) if (free(k)) { seen[k] = 1; q.push(k); }
  for (let h = 0; h < q.length; h++) {
    const j = q[h];
    if (goal(j)) {
      for (let x = j; x !== -1; x = prev[x]) raw(g, 'road', x % c.cols, Math.floor(x / c.cols), x % c.cols, Math.floor(x / c.cols), team);
      return true;
    }
    for (const k of nbOf(c, j)) if (free(k)) { seen[k] = 1; prev[k] = j; q.push(k); }
  }
  return false;
}
// Straße vom Gebäude mit Anker a zum nächsten Straßennetz (seit v5.20 braucht Produktion einen Weg). Hat es schon einen Anschluss: nichts.
function linkRoad(g, team, a) {
  const c = g.city[team];
  if (accessCells(c, a).length) return;
  const starts = [];
  for (const j of cellsOf(c, a)) starts.push(...nbOf(c, j));
  assert.ok(connect(g, team, starts, (j) => nbOf(c, j).some((k) => roadAt(c, k))), `keine Straße zu Gebäude ${a} möglich`);
}
// Das Straßennetz, an dem Gebäude a hängt, an das Lager der Hauptstadt anschließen (seit v5.20 braucht ein Werk einen Weg dorthin).
// Hat a schon einen Weg zum Lager, passiert nichts.
function linkMain(g, team, a) {
  const c = g.city[team];
  if (transportOf(g, c).routes.get(a)?.to === 'main') return;
  const m = g.mainFob(team);
  const T = g.grid.tile;
  const e = CITY.fobMargin + c.cell;
  const x0 = m.cx * T - e;
  const x1 = (m.cx + m.w) * T + e;
  const y0 = m.cy * T - e;
  const y1 = (m.cy + m.h) * T + e;
  const reach = (j) => {
    const r = cellRect(c, j % c.cols, Math.floor(j / c.cols));
    return r.x0 < x1 && r.x1 > x0 && r.y0 < y1 && r.y1 > y0;
  };
  // Straßen des Netzes um a (Breitensuche über Straßenzellen)
  const net = accessCells(c, a).slice();
  const seen = new Uint8Array(c.cols * c.rows);
  for (const j of net) seen[j] = 1;
  for (let h = 0; h < net.length; h++) {
    for (const k of nbOf(c, net[h])) {
      if (seen[k] || !roadAt(c, k)) continue;
      seen[k] = 1;
      net.push(k);
    }
  }
  const starts = [];
  for (const j of net) starts.push(...nbOf(c, j));
  assert.ok(connect(g, team, starts, reach), 'kein Straßenanschluss zum Lager möglich');
}
// Ausbildungsgebäude der Stadt (seit v4.96), das `unit` ausbildet (Startviertel: Kaserne und Fabrikhalle)
const trainerFor = (g, unit, team = 0) => cityTrainers(g, team).find((e) => e.produces.includes(unit));

test('ohne Stadt: unendliches Lager, Stadtbefehl abgelehnt', () => {
  const g = new Game({ seed: 3 });
  assert.equal(g.city, null);
  assert.equal(g.mainFob(0).infinite, true);
  assert.equal(paint(g, 'road', 0, 0, 1, 0).ok, false);
});

test('mit Stadt: endliches Startlager, Front-Summe ohne Hauptstadt', () => {
  const g = new Game({ seed: 3, city: true });
  const m = g.mainFob(0);
  assert.equal(m.infinite, false);
  assert.deepEqual({ ...m.store }, CITY.startStock);
  assert.equal(g.teams[0].res.bm, 0);
});

test('Bauen kostet Geld (Straßen Baumaterial), zu wenig stoppt, Abriss ist kostenlos', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 100 });
  const m = g.mainFob(0);
  const bm0 = m.store.bm;
  const r = paint(g, 'road', 0, 0, 9, 0); // 10 x 10 BM
  assert.ok(r.ok);
  assert.equal(g.teams[0].res.money, 100);
  assert.equal(m.store.bm, bm0 - 100);
  const r2 = paint(g, 'com', 0, 1, 4, 1); // 5 x 30 > 100 Geld: nur 3 Zellen
  assert.equal(r2.placed, 3);
  assert.equal(r2.broke, true);
  assert.equal(paint(g, 'erase', 0, 1, 4, 1).ok, true);
  assert.equal(g.teams[0].res.money, 10);
  assert.equal(paint(g, 'res', 0, 1, 0, 1).ok, false); // zu wenig Geld (20 > 10)
  m.store.bm = 5;
  assert.match(paint(g, 'road', 0, 2, 0, 2).reason, /Baumaterial/);
});

test('Zone ohne Straße wächst nicht, mit Straße wird sie Gebäude', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 2000 });
  paint(g, 'res', 5, 2, 5, 2);
  run(g, CITY.growTime + 2);
  assert.equal(g.city[0].level[at(g, 5, 2)], 0);
  paint(g, 'road', 5, 1, 5, 1);
  run(g, CITY.growTime + 2);
  assert.equal(g.city[0].level[at(g, 5, 2)], 1);
});

test('Wohnen + Werk + Straße: Einwohner arbeiten, Lager und Geld wachsen', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  clearStart(g);
  paint(g, 'road', 0, 2, 5, 2);
  paint(g, 'res', 0, 1, 5, 1);
  paint(g, 'bm', 0, 3, 5, 3);
  const c = g.city[0];
  c.deposit[at(g, 0, 4)] = 1; // Wald direkt an der Stadt (Test)
  c.deposit[at(g, 1, 4)] = 2; // Fels
  assert.match(paint(g, 'mine', 5, 4, 5, 4).reason, /vorkommen/);
  assert.match(paint(g, 'mine', 2, 4, 2, 4).reason, /räumen/, 'BM-Werk steht dort: nicht überbauen');
  assert.ok(paint(g, 'mine', 0, 4, 1, 4).ok);
  linkRoad(g, 0, at(g, 0, 4)); // Förderanlagen brauchen eine Straße (seit v5.20)
  linkRoad(g, 0, at(g, 1, 4));
  linkMain(g, 0, c.list.find((i) => c.kind[i] === KIND_ID.bm)); // das Netz erreicht das Lager (seit v5.20 braucht BM einen Weg dorthin)
  const m = g.mainFob(0);
  m.store.bm = 0;
  const money0 = g.teams[0].res.money;
  run(g, 120);
  const s = g.city[0].stats;
  assert.ok(s.pop > 8, `Einwohner ${s.pop}`);
  assert.ok(s.workers > 0 && s.bm > 0);
  assert.ok(s.raw.wood > 0 && s.raw.stone > 0, 'Holzfäller und Steinbruch fördern');
  assert.ok(s.bm <= s.raw.wood + s.raw.stone + 1e-9, 'BM nur aus Rohstoffen');
  assert.ok(m.store.bm > 50, `BM ${m.store.bm}`);
  assert.ok(g.teams[0].res.money > money0);
  assert.ok(m.store.bm <= 3000);
  assert.ok(g.city[1].stats.pop <= g.city[1].stats.housing, 'andere Stadt eigenständig');
});

test('Großbauten der Stadt (Fabrikhalle, Kaserne) lichten den Nebel über ihrer ganzen Fläche (seit v5.25)', () => {
  const g = new Game({ seed: 3, city: true });
  for (const u of g.units) u.alive = false; // nur die Stadtgebäude sehen
  for (const b of g.buildings) b.def = { ...b.def, sight: 0 };
  for (let i = 0; i < 10; i++) g.update(0.05);
  const c = g.city[0];
  let n = 0;
  for (const [i] of c.ents) {
    const k = KINDS[c.kind[i] - 1];
    if (k !== 'factory' && k !== 'barracks') continue;
    for (const j of cellsOf(c, i)) {
      const q = j % c.cols;
      const r = (j - q) / c.cols;
      for (const [dx, dy] of [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]]) {
        n++;
        assert.ok(g.fog[0].isVisible((q + dx) * c.cell, (r + dy) * c.cell), `${k}: Zelle (${q}, ${r}) im Nebel`);
      }
    }
  }
  assert.ok(n >= 4 * (25 + 16), 'Fabrikhalle (5 × 5) und Kaserne (4 × 4) im Startviertel geprüft');
});

test('Räumen lässt Rohstoffvorkommen und Förderanlagen stehen; nur Abreißen (demolish) entfernt eine Förderanlage', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  clearStart(g);
  const c = g.city[0];
  assert.ok(paint(g, 'res', 1, 4, 1, 4).ok); // legt auch den Bauplatz der Testzellen fest
  c.deposit[at(g, 0, 4)] = 1; // Wald (Test)
  const dep = c.deposit.slice();
  assert.ok(paint(g, 'mine', 0, 4, 0, 4).ok);
  const mine = c.kind[at(g, 0, 4)];
  const r = paint(g, 'erase', 0, 4, 1, 4);
  assert.equal(r.ok, true, 'Wohnen daneben wird geräumt');
  assert.equal(r.kept, true);
  assert.equal(c.kind[at(g, 0, 4)], mine, 'Förderanlage bleibt');
  assert.equal(c.deposit[at(g, 0, 4)], 1, 'Vorkommen bleibt');
  assert.equal(c.kind[at(g, 1, 4)], 0, 'Wohnen geräumt');
  const only = paint(g, 'erase', 0, 4, 0, 4);
  assert.equal(only.ok, false);
  assert.match(only.reason, /Rohstoffvorkommen/);
  const b = base.get(g);
  assert.ok(g.issue(0, { type: 'city', kind: 'erase', c0: b.c, r0: b.r + 4, c1: b.c, r1: b.r + 4, demolish: true }).ok, 'Abreißen');
  assert.equal(c.kind[at(g, 0, 4)], 0, 'Förderanlage abgerissen');
  assert.equal(c.deposit[at(g, 0, 4)], 1, 'Vorkommen bleibt auch dann');
  for (let i = 0; i < dep.length; i++) if (i !== at(g, 0, 4)) assert.equal(c.deposit[i], dep[i]);
});

test('Nichts überbauen: belegte Zellen bleiben, erst räumen, dann neu ausweisen', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  clearStart(g);
  const c = g.city[0];
  assert.ok(paint(g, 'road', 0, 2, 3, 2).ok);
  assert.ok(paint(g, 'res', 0, 1, 1, 1).ok);
  const road = c.kind[at(g, 0, 2)];
  const res = c.kind[at(g, 0, 1)];
  const money0 = g.teams[0].res.money;
  const r = paint(g, 'com', 0, 1, 1, 1);
  assert.equal(r.ok, false, 'nur Belegtes im Rechteck');
  assert.match(r.reason, /räumen/);
  assert.equal(g.teams[0].res.money, money0, 'nichts bezahlt');
  assert.equal(c.kind[at(g, 0, 1)], res, 'Wohnen bleibt');
  // gemischtes Rechteck: nur die leeren Zellen werden Gewerbe, Straße und Wohnen bleiben
  const r2 = paint(g, 'com', 0, 0, 1, 2);
  assert.equal(r2.ok, true);
  assert.equal(r2.placed, 2);
  assert.equal(r2.occupied, true);
  assert.equal(c.kind[at(g, 0, 2)], road, 'Straße bleibt');
  assert.equal(c.kind[at(g, 1, 1)], res, 'Wohnen bleibt');
  // Großbau auf belegten Zellen: abgelehnt
  assert.equal(paint(g, 'uni', 0, 1, 0, 1).ok, false);
  // erst räumen, dann geht es
  assert.ok(paint(g, 'erase', 0, 1, 0, 1).ok);
  assert.ok(paint(g, 'com', 0, 1, 0, 1).ok);
  assert.notEqual(c.kind[at(g, 0, 1)], res, 'nach dem Räumen neu ausgewiesen');
});

test('Ausbau nur bei Bedarf: Wohnen ohne Arbeit bleibt Stufe 1', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  clearStart(g);
  paint(g, 'road', 0, 2, 3, 2);
  paint(g, 'res', 0, 1, 3, 1);
  run(g, CITY.growTime + CITY.upgradeTime * 3);
  for (let col = 0; col < 4; col++) assert.equal(g.city[0].level[at(g, col, 1)], 1);
});

test('KI baut nach Bauplan und liefert Material [langsam]', () => {
  const g = new Game({ seed: 5, city: true, startMoney: 2000 });
  const ai = new AI(g, 1, 'normal');
  const n0 = g.city[1].kind.filter(Boolean).length;
  for (let t = 0; t < 20 * 240; t++) { ai.update(0.05); g.update(0.05); }
  assert.ok(g.city[1].kind.filter(Boolean).length > n0 + 10);
  assert.ok(g.city[1].stats.pop > 0);
});

test('Stadtraster deckt die Karte: unter der FOB gesperrt, Gebäude sperren den Weg, Abriss gibt ihn frei', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  const c = g.city[0];
  const m = g.mainFob(0);
  assert.equal(c.cols * c.cell, g.grid.cols * g.grid.tile, 'ganze Kartenbreite');
  const fc = Math.floor(m.x / c.cell);
  const fr = Math.floor(m.y / c.cell);
  assert.equal(c.blocked[fr * c.cols + fc], 1);
  assert.equal(raw(g, 'res', fc, fr, fc, fr).ok, false, 'unter der FOB nichts bauen');
  paint(g, 'road', 0, 0, 3, 0);
  paint(g, 'bm', 0, 1, 0, 1);
  const b = base.get(g);
  const x0 = b.c * c.cell;
  const y0 = (b.r + 1) * c.cell;
  const T = g.grid.tile;
  const u = g.units.find((x) => x.team === 0 && !x.def.air);
  u.x = x0 + 30; u.y = y0 + 30; u.path = [];
  run(g, CITY.growTime + 1);
  assert.equal(c.level[at(g, 0, 1)], 1);
  assert.equal(g.grid.passable(Math.floor((x0 + 32) / T), Math.floor((y0 + 32) / T), 0), false, 'Gebäude blockiert');
  assert.ok(g.grid.passable(g.grid.toCell(u.x), g.grid.toCell(u.y), 0), 'Einheit steht frei');
  assert.ok(g.grid.passable(Math.floor((x0 + 32) / T), Math.floor((y0 - 32) / T), 0), 'Straße begehbar');
  paint(g, 'erase', 0, 1, 0, 1);
  assert.equal(g.grid.passable(Math.floor((x0 + 32) / T), Math.floor((y0 + 32) / T), 0), true, 'Abriss gibt frei');
});

test('Überall bauen (seit v4.87): auch fern der Hauptstadt, aber nicht auf gegnerischen Zellen', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = g.city[0];
  const z = g.zone;
  // eine freie Zelle nahe der Kartenmitte (weit weg von der eigenen Hauptstadt)
  let far = -1;
  for (let i = 0; i < c.blocked.length && far < 0; i++) {
    const q = i % c.cols;
    const r = (i - q) / c.cols;
    if (!c.blocked[i] && !c.claim[i] && Math.hypot((q + 0.5) * c.cell - z.x, (r + 0.5) * c.cell - z.y) < z.r + 600) far = i;
  }
  assert.ok(far >= 0);
  const q = far % c.cols;
  const r = (far - q) / c.cols;
  assert.ok(raw(g, 'res', q, r, q, r).ok, 'weit draußen bauen geht');
  // Gegner darf eigene Zellen nicht überbauen
  assert.equal(raw(g, 'com', q, r, q, r, 1).ok, false);
});

test('Soldaten kosten Einwohner: ohne freie Einwohner keine Ausbildung, Gefallene fehlen der Stadt', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const m = g.mainFob(0);
  assert.equal(freePop(g, 0), 0, 'Startarmee kostet nichts, Stadt leer');
  const r = g.issue(0, { type: 'train', buildingId: trainerFor(g, 'rifleman').id, unit: 'rifleman' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Einwohner/);
  paint(g, 'road', 0, 0, 9, 0);
  paint(g, 'res', 0, 1, 9, 1);
  paint(g, 'bm', 0, 2, 4, 2);
  paint(g, 'road', 0, 3, 4, 3);
  run(g, 90);
  const pop = g.city[0].popF;
  assert.ok(freePop(g, 0) >= 1, `freie Einwohner ${freePop(g, 0)}`);
  assert.ok(g.issue(0, { type: 'train', buildingId: trainerFor(g, 'rifleman').id, unit: 'rifleman' }).ok);
  run(g, 10);
  const u = g.units.find((x) => x.team === 0 && x.crew === 1);
  assert.ok(u, 'ausgebildeter Schütze belegt einen Einwohner');
  assert.equal(g.city[0].drafted, 1);
  u.hp = -1e6;
  run(g, 0.2);
  assert.equal(g.city[0].drafted, 0);
  assert.ok(g.city[0].popF < Math.max(pop, g.city[0].stats.housing), 'Einwohner weg');
});

test('Flucht: Schüsse in der Konfliktzone leeren Wohnzellen, nach Ruhe kehren sie zurück', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  clearStart(g);
  const c = g.city[0];
  const z = g.zone;
  const zc = Math.floor(z.x / c.cell);
  const zr = Math.floor(z.y / c.cell);
  // freie Zellen in der Zone suchen und als Gebiet freigeben (vordere FOB simuliert)
  let s = null;
  for (let r = zr - 10; !s && r < zr + 10; r++) for (let q = zc - 10; !s && q < zc + 10; q++) {
    const ok = [0, 1, 2].every((k) => !c.blocked[(r + k) * c.cols + q] && !c.mapRoads?.[(r + k) * c.cols + q] && c.inZone[(r + k) * c.cols + q]); // nicht auf einer Stadtstraße der Karte
    if (ok) s = { q, r };
  }
  assert.ok(s, 'freie Zellen in der Zone');
  for (let k = 0; k < 3; k++) c.claim[(s.r + k) * c.cols + s.q] = 1;
  c.claimTimer = -1e9; // Gebiet nicht neu berechnen
  raw(g, 'road', s.q, s.r, s.q, s.r);
  raw(g, 'res', s.q, s.r + 1, s.q, s.r + 1);
  raw(g, 'bm', s.q, s.r + 2, s.q, s.r + 2);
  run(g, CITY.growTime + 5);
  const i = (s.r + 1) * c.cols + s.q;
  assert.equal(c.level[i], 1);
  assert.ok(c.stats.housing > 0);
  cityNoise(g, (s.q + 0.5) * c.cell, (s.r + 2.5) * c.cell); // Schuss in der Nachbarzelle
  run(g, 1);
  assert.ok(c.flee[i] > 0, 'Bewohner fliehen');
  assert.equal(c.stats.housing, 0);
  run(g, CITY.flee.calm + 1);
  assert.equal(c.flee[i], 0);
  assert.ok(c.stats.housing > 0, 'zurück nach der Ruhezeit');
});

test('Rohstoffvorkommen: jede Sorte nahe jeder Hauptstadt, Karte unverändert', () => {
  const a = new Game({ seed: 4, city: true });
  const b = new Game({ seed: 4 });
  assert.deepEqual([...a.grid.terrain], [...b.grid.terrain], 'Karte gleich mit und ohne Stadt');
  for (const team of [0, 1]) {
    const c = a.city[team];
    const m = a.mainFob(team);
    for (let d = 1; d <= 4; d++) {
      let near = false;
      for (let i = 0; i < c.deposit.length; i++) {
        if (c.deposit[i] !== d) continue;
        const q = i % c.cols;
        const r = (i - q) / c.cols;
        if (Math.hypot((q + 0.5) * c.cell - m.x, (r + 0.5) * c.cell - m.y) < (CITY.territory.main + 1) * c.cell) near = true;
      }
      assert.ok(near, `Team ${team} Sorte ${d} im Gebiet`);
    }
  }
});

test('Rohstoffvorkommen nie auf Wasser, Furten, Brücken oder Stadtstraßen (auch nicht am Ufer)', () => {
  for (const seed of [1, 3, 42, 1234]) {
    const g = new Game({ seed, city: true, river: true });
    const c = g.city[0];
    const S = c.cell;
    const T = g.grid.tile;
    const m = CITY.deposits.shore;
    let n = 0;
    for (let i = 0; i < c.deposit.length; i++) {
      if (!c.deposit[i]) continue;
      n++;
      const q = i % c.cols;
      const r = (i - q) / c.cols;
      assert.ok(!g.roads.kind[i], `Seed ${seed}: Vorkommen auf Stadtstraße/Brücke (${q}, ${r})`);
      assert.ok(!bridgeUnder(g, (q + 0.5) * S, (r + 0.5) * S), `Seed ${seed}: Vorkommen auf Brücke (${q}, ${r})`);
      for (let y = r * S - m; y <= (r + 1) * S + m; y += 8) {
        for (let x = q * S - m; x <= (q + 1) * S + m; x += 8) {
          assert.ok(!g.grid.isFord(Math.floor(x / T), Math.floor(y / T)), `Seed ${seed}: Vorkommen an einer Furt (${q}, ${r})`);
          if (g.relief) assert.ok(g.relief.heightAt(x, y) >= RELIEF.water, `Seed ${seed}: Vorkommen am/auf Wasser (${q}, ${r})`);
        }
      }
    }
    assert.ok(n > 40, `Seed ${seed}: genug Vorkommen (${n})`);
  }
});

test('Stahl: Erzmine, Hütte und Stahlwerk liefern, Fahrzeuge kosten Stahl, Abbruch erstattet', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 9000 });
  const c = g.city[0];
  paint(g, 'road', 0, 0, 9, 0);
  paint(g, 'res', 0, 1, 9, 1);
  assert.ok(paint(g, 'steel', 0, 2, 1, 3).ok); // 2 × 2 (seit v5.08), Straße darunter
  assert.ok(paint(g, 'smelter', 3, 2, 4, 3).ok); // Hütte (seit v5.20): Erz → Roheisen, Roheisen → Stahlwerk
  paint(g, 'road', 0, 4, 4, 4);
  c.deposit[at(g, 5, 3)] = 3; // Erz
  c.deposit[at(g, 6, 3)] = 3;
  paint(g, 'mine', 5, 3, 6, 3);
  linkRoad(g, 0, at(g, 5, 3)); // Erzmine braucht eine Straße zur Hütte (seit v5.20)
  linkRoad(g, 0, at(g, 6, 3));
  paint(g, 'res', 7, 4, 7, 4); // Wohnen an der Erzstraße: Förderung, Hütte und Stahlwerk pendeln dorthin (seit v5.20 nötig)
  linkMain(g, 0, c.list.find((i) => c.kind[i] === KIND_ID.steel));
  run(g, 90);
  assert.ok(c.stats.raw.ore > 0 && c.stats.iron > 0 && c.stats.metal > 0, `Stahl/s ${c.stats.metal}, Roheisen/s ${c.stats.iron}`);
  c.metal = 50;
  const r = g.issue(0, { type: 'train', buildingId: trainerFor(g, 'tank').id, unit: 'tank' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Stahl/);
  c.metal = 500;
  assert.ok(g.issue(0, { type: 'train', buildingId: trainerFor(g, 'tank').id, unit: 'tank' }).ok);
  assert.equal(c.metal, 500 - CITY.metalCost.tank);
  assert.ok(g.issue(0, { type: 'cancelTrain', buildingId: trainerFor(g, 'tank').id }).ok);
  assert.equal(c.metal, 500);
});

test('Markt: ohne Markt kein Handel, verkaufen und kaufen in Losen', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const m = g.mainFob(0);
  assert.match(g.issue(0, { type: 'trade', good: 'bm', dir: 'sell' }).reason, /Markt/);
  paint(g, 'road', 0, 0, 3, 0);
  paint(g, 'market', 0, 1, 0, 1);
  assert.equal(hasMarket(g, 0), false); // ausgewiesen, noch nicht gewachsen
  run(g, CITY.growTime + 1);
  assert.equal(hasMarket(g, 0), true); // Geldanzeige öffnet jetzt das Marktmenü (v4.94)
  assert.equal(hasMarket(g, 1), false);
  // das fertige Gebäude ist eine wählbare Entity des Teams (Auswahl zeigt Infos und Aktionen)
  const mk = [...g.city[0].ents.values()].find((e) => g.city[0].kind[e.cityCell] === KIND_ID.market);
  assert.ok(mk && mk.type === 'city' && mk.team === 0);
  assert.equal(cityEntityAt(g, mk.x, mk.y), mk);
  const bm = m.store.bm;
  const money = g.teams[0].res.money;
  assert.ok(g.issue(0, { type: 'trade', good: 'bm', dir: 'sell' }).ok);
  assert.ok(m.store.bm < bm - CITY.market.lot + 50);
  assert.ok(g.teams[0].res.money >= money + CITY.market.sell.bm - 1);
  const metal = g.city[0].metal;
  assert.ok(g.issue(0, { type: 'trade', good: 'metal', dir: 'buy' }).ok);
  assert.ok(g.city[0].metal >= metal + CITY.market.lot - 1);

  // ×10: zehn Lose auf einmal, Geld genau zehnmal der Preis (Lager leer genug, Geld reicht)
  g.city[0].metal = 0;
  g.teams[0].res.money = 100000;
  const r10 = g.issue(0, { type: 'trade', good: 'metal', dir: 'buy', count: 10 });
  assert.equal(r10.ok, true);
  assert.equal(r10.done, 10);
  assert.equal(g.city[0].metal, 10 * CITY.market.lot);
  assert.equal(g.teams[0].res.money, 100000 - 10 * CITY.market.buy.metal);
  // ×100 mit Geld für nur 3 Lose: kauft 3, meldet den Grund
  g.teams[0].res.money = 3 * CITY.market.buy.metal + 1;
  const r100 = g.issue(0, { type: 'trade', good: 'metal', dir: 'buy', count: 100 });
  assert.equal(r100.ok, true);
  assert.equal(r100.done, 3);
  assert.match(r100.reason, /Geld/);
  // ×10 verkaufen mit Bestand für 13 Lose: verkauft 10
  const sold = g.issue(0, { type: 'trade', good: 'metal', dir: 'sell', count: 10 });
  assert.equal(sold.done, 10);
  assert.equal(g.city[0].metal, 3 * CITY.market.lot);
  // Unsinnige Zahl: höchstens maxCount, mindestens 1
  assert.equal(g.issue(0, { type: 'trade', good: 'metal', dir: 'sell', count: -5 }).done, 1);
  // kein Geld: das erste Los scheitert, Grund wie bisher
  g.teams[0].res.money = 0;
  const none = g.issue(0, { type: 'trade', good: 'metal', dir: 'buy', count: 100 });
  assert.equal(none.ok, false);
  assert.match(none.reason, /Geld/);
});

test('Angriff: Stadtgebäude nehmen Schaden, werden Ruine (Prämie), wachsen danach neu', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = g.city[0];
  paint(g, 'road', 0, 0, 3, 0);
  paint(g, 'res', 0, 1, 0, 1);
  run(g, CITY.growTime + 1);
  const i = at(g, 0, 1);
  const e = c.ents.get(i);
  assert.ok(e && e.hp === CITY.hp[1], 'Gebäude ist ein Ziel');
  assert.equal(g.getEntity(e.id), e);
  // gegnerischer Panzer daneben: schießt von selbst auf das Gebäude
  for (const u of g.units) if (u.team === 0) { u.alive = false; u.hp = 0; } // keine Verteidiger
  const tank = g.spawnUnit('tank', 1, e.x + 150, e.y);
  g.fog[1].revealAll?.();
  const money1 = g.teams[1].res.money;
  g.fog[1].revealAll?.();
  assert.ok(g.issue(1, { type: 'attack', ids: [tank.id], targetId: e.id }).ok, 'Angriffsbefehl auf ein Stadtgebäude');
  for (let t = 0; t < 20 * 60 && c.level[i]; t++) {
    g.fog[1].revealAll?.();
    g.update(0.05);
  }
  assert.ok(tank.alive);
  assert.equal(c.level[i], 0, 'zerstört');
  assert.ok(c.timer[i] < 0, 'Ruine');
  assert.ok(g.teams[1].res.money > money1, 'Prämie');
  assert.equal(c.ents.has(i), false);
  tank.alive = false; tank.hp = 0;
  run(g, CITY.ruinTime + CITY.growTime + 2);
  assert.equal(c.level[i], 1, 'wiederaufgebaut');
});

test('Startviertel: Raffinerie, Wohnen und Ölquelle stehen fertig, Treibstoff fließt', () => {
  const g = new Game({ seed: 3, city: true });
  for (const team of [0, 1]) {
    const c = g.city[team];
    const kinds = c.list.filter((i) => c.level[i]).map((i) => c.kind[i]);
    assert.ok(kinds.includes(6) && kinds.includes(2) && kinds.includes(8), `Team ${team}: ${kinds}`);
  }
  const c0 = g.city[0];
  linkRoad(g, 0, c0.list.find((i) => c0.kind[i] === KIND_ID.mine && c0.level[i])); // Ölquelle an die Straße (seit v5.20 Pflicht)
  const m = g.mainFob(0);
  m.store.fuel = 0;
  run(g, 30);
  assert.ok(g.city[0].stats.fuel > 0 && m.store.fuel > 0, `TS ${m.store.fuel}`);
});

test('Freie Planung: knapper Treibstoff mit Öl im Überfluss → KI weist Raffinerien aus', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 20000 });
  const c = g.city[1];
  run(g, 20);
  const fuel0 = c.list.filter((i) => c.kind[i] === KIND_ID.fuel).length;
  const mem = cityAiMemory();
  for (let n = 0; n < 30; n++) {
    g.mainFob(1).store.fuel = 100;
    c.stats.raw.oil = 50; // reichlich Öl, zu wenig Raffinerie
    c.stats.free = 50; // genug freie Einwohner
    aiCity(g, 1, 'normal', mem);
  }
  const fuel1 = c.list.filter((i) => c.kind[i] === KIND_ID.fuel).length;
  const steel = c.list.filter((i) => c.kind[i] === KIND_ID.steel).length;
  assert.ok(fuel1 >= fuel0 + 3 && fuel1 > steel, `Raffinerien ${fuel0} → ${fuel1}, Stahlwerke ${steel}`);
});

test('Freie Planung: KI baut nicht neben frisch beschossenen Zellen', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 20000 });
  const c = g.city[1];
  const m = g.mainFob(1);
  c.hitLog = [{ x: m.x, y: m.y, t: g.time }]; // Treffer an der Hauptstadt: die ganze Umgebung meiden
  const before = new Set(c.list);
  aiCity(g, 1, 'normal');
  const R = CITY.ai.dangerRadius;
  const added = c.list.filter((i) => !before.has(i));
  assert.ok(added.length > 0, 'baut woanders');
  for (const i of added) {
    const q = i % c.cols;
    const r = (i - q) / c.cols;
    assert.ok(Math.abs(q - Math.floor(m.x / c.cell)) > R || Math.abs(r - Math.floor(m.y / c.cell)) > R, 'nicht in der Gefahrenzone');
  }
});

test('KI verteidigt beschossene Stadtgebäude und greift gegnerische Werke zuerst an', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  run(g, 20);
  const c = g.city[1];
  const e = [...c.ents.values()].find((x) => c.kind[x.cityCell] === KIND_ID.fuel);
  assert.ok(e, 'Raffinerie im Startviertel');
  e.lastHitTime = g.time;
  aiDefend(g, 1);
  const sent = g.units.filter((u) => u.team === 1 && u.order.type === 'attackMove' && Math.hypot(u.order.x - e.x, u.order.y - e.y) < 300);
  assert.ok(sent.length > 0 && sent.length <= CITY.ai.defendSize, `Verteidiger ${sent.length}`);
  // Angriff: das Ziel ist die Raffinerie (Werk) des Spielers, nicht ein Wohnhaus
  const own = g.city[0];
  g.fog[1].revealAll?.();
  for (const u of g.units) if (u.team === 1) u.order = { type: 'idle' };
  aiRaid(g, 1, 'normal', 1, { ...cityAiMemory(), raidTimer: 1e9 }); // Überfall fällig
  const raiders = g.units.filter((u) => u.team === 1 && u.order.type === 'attackMove');
  assert.ok(raiders.length > 0, 'Angreifer unterwegs');
  // Ziel ist ein wertvolles Gebäude (Werk, Kraftwerk, Fabrikhalle; seit v5.03 Großbauten mit eigener Mitte), kein Wohnhaus
  // (die Plätze der Angreifer liegen um das Ziel herum, bei Großbauten außerhalb des Quadrats)
  const mx = raiders.reduce((a, u) => a + u.order.x, 0) / raiders.length;
  const my = raiders.reduce((a, u) => a + u.order.y, 0) / raiders.length;
  const hit = [...own.ents.values()].sort((a, b) => Math.hypot(mx - a.x, my - a.y) - Math.hypot(mx - b.x, my - b.y))[0];
  assert.ok(Math.hypot(mx - hit.x, my - hit.y) < (hit.w * BALANCE.map.tile) / 2 + 200, 'Angreifer am Ziel');
  assert.ok((CITY.ai.targetValue[KINDS[own.kind[hit.cityCell] - 1]] ?? 1) >= 3, `Ziel ist ein Werk (${KINDS[own.kind[hit.cityCell] - 1]})`);
});

// v4.88: Universität, Rechenzentrum, Strom, Zufriedenheit
import { researchBlock, researchSpeed } from '../js/game/research.js';
const setLevel = (g, kind, lv, team = 0) => {
  const n = sizeOf(kind); // Großbau (Universität 3 × 3, Werke 2 × 2 …): das ganze freie Quadrat als Rechteck
  const b = spot(g, n, n, team);
  const res = raw(g, kind, b.c, b.r, b.c + n - 1, b.r + n - 1, team);
  const c = g.city[team];
  const i = res.anchor ?? b.r * c.cols + b.c;
  for (const j of cellsOf(c, i)) c.level[j] = lv;
  return i;
};

test('Universität: ohne sie ruht die Forschung; Rechenzentren beschleunigen sie (seit v5.04)', () => {
  const g = new Game({ seed: 3, city: true, research: true, startMoney: 5000 });
  assert.equal(researchBlock(g, 0, 'tank1'), 'Benötigt eine Universität in der Stadt');
  assert.equal(researchSpeed(g, 0), 0);
  setLevel(g, 'uni', 1);
  assert.equal(researchBlock(g, 0, 'tank1'), '');
  assert.equal(researchSpeed(g, 0), 1 * (g.city[0].stats.powerRatio ?? 1));
  setLevel(g, 'dc', 2);
  setLevel(g, 'dc', 1);
  assert.ok(Math.abs(researchSpeed(g, 0) - (1 + 3 * CITY.research.dcSpeed) * (g.city[0].stats.powerRatio ?? 1)) < 1e-9, 'alle Rechenzentren zählen');
  // ohne Stadt: keine Universität nötig
  const n = new Game({ seed: 3, research: true });
  assert.equal(researchBlock(n, 0, 'tank1'), '');
  assert.equal(researchSpeed(n, 0), 1);
});

test('Strom: zu wenig Kraftwerke bremsen die Werke, ein Kraftwerk hilft', () => {
  const g = new Game({ seed: 3, city: true });
  for (let k = 0; k < 6; k++) setLevel(g, 'steel', 3);
  run(g, 2);
  const s = g.city[0].stats;
  assert.ok(s.powerUse > s.powerSupply, `Verbrauch ${s.powerUse} > Angebot ${s.powerSupply}`);
  assert.ok(s.powerRatio < 1);
  const before = s.powerRatio;
  for (let k = 0; k < 2; k++) setLevel(g, 'power', 3);
  run(g, 2);
  assert.ok(g.city[0].stats.powerRatio > before);
});

test('Zufriedenheit sinkt bei Beschuss der Stadt', () => {
  const g = new Game({ seed: 3, city: true });
  run(g, 2);
  const calm = g.city[0].stats.happy;
  const m = g.mainFob(0);
  g.city[0].hitLog = Array.from({ length: CITY.happy.hitsBad }, () => ({ x: m.x, y: m.y, t: g.time }));
  run(g, 1);
  assert.ok(g.city[0].stats.happy < calm - 0.1, `${g.city[0].stats.happy} < ${calm}`);
});

test('Straßenanschluss: Wohnen/Gewerbe/BM-Werk über genau eine Zelle gleicher Art', () => {
  const cols = 6, rows = 1;
  const mk = (...k) => ({ cols, rows, kind: Uint8Array.from(k) });
  const R = KIND_ID.road, W = KIND_ID.res, G = KIND_ID.com, B = KIND_ID.bm;
  const c = mk(R, W, W, G, W, 0);
  assert.ok(hasRoad(c, 1, 0)); // direkt
  assert.ok(hasRoad(c, 2, 0)); // Wohnen-Wohnen-Straße
  assert.ok(!hasRoad(c, 3, 0) || false); // Gewerbe hinter Wohnen: nein
  const d = mk(R, G, W, 0, 0, 0);
  assert.ok(!hasRoad(d, 2, 0)); // Wohnen-Gewerbe-Straße: nicht für Wohnen
  const e = mk(R, W, W, W, 0, 0);
  assert.ok(!hasRoad(e, 3, 0)); // keine längeren Ketten
  const f = mk(R, B, B, B, 0, 0);
  assert.ok(hasRoad(f, 2, 0)); // BM-Werk-BM-Werk-Straße (seit v5.05)
  assert.ok(!hasRoad(f, 3, 0)); // auch hier keine längeren Ketten
  const M = KIND_ID.mun;
  assert.ok(!hasRoad(mk(R, B, W, 0, 0, 0), 2, 0)); // Wohnen hinter BM-Werk: nein
  assert.ok(!hasRoad(mk(R, M, M, 0, 0, 0), 2, 0)); // andere Werke weiter nur direkt
});

test('Ausbildung mit Stadt (v4.96): Hauptstadt nicht, Kaserne Soldaten, Fabrikhalle Fahrzeuge, Heliport Hubschrauber', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 20000 });
  const m = g.mainFob(0);
  assert.deepEqual(m.produces, [], 'Hauptstadt bildet mit Stadt nichts aus');
  assert.match(g.issue(0, { type: 'train', buildingId: m.id, unit: 'rifleman' }).reason, /Kaserne/);
  const kas = trainerFor(g, 'rifleman');
  const fab = trainerFor(g, 'tank');
  assert.ok(kas && fab, 'Startviertel hat Kaserne und Fabrikhalle');
  assert.equal(trainerFor(g, 'littlebird'), undefined, 'Heliport muss man bauen');
  assert.match(g.issue(0, { type: 'train', buildingId: kas.id, unit: 'tank' }).reason, /Fabrikhalle/);
  // Wohnraum für Truppen, Heliport an der Straße
  paint(g, 'road', 0, 0, 9, 0);
  paint(g, 'res', 0, 1, 7, 1);
  paint(g, 'heliport', 8, 1, 8, 1);
  paint(g, 'com', 0, 2, 3, 2);
  paint(g, 'road', 0, 3, 3, 3);
  run(g, 120);
  const heli = trainerFor(g, 'littlebird');
  assert.ok(heli, 'Heliport steht');
  assert.ok(freePop(g, 0) >= 4, `freie Einwohner ${freePop(g, 0)}`);
  const n0 = g.units.filter((u) => u.team === 0).length;
  const metal0 = g.city[0].metal;
  assert.ok(g.issue(0, { type: 'train', buildingId: kas.id, unit: 'rifleman' }).ok);
  assert.ok(g.issue(0, { type: 'train', buildingId: fab.id, unit: 'truck' }).ok);
  assert.ok(g.issue(0, { type: 'train', buildingId: heli.id, unit: 'littlebird' }).ok);
  assert.equal(g.city[0].metal, metal0 - CITY.metalCost.truck - CITY.metalCost.littlebird, 'Metall direkt aus dem Stadtlager');
  assert.equal(g.slotsUsed(0) > 0 && g.unitCount(0), n0 + 3, 'Warteschlangen der Stadt zählen');
  run(g, 20);
  const fresh = g.units.filter((u) => u.team === 0 && u.crew);
  assert.deepEqual(fresh.map((u) => u.type).sort(), ['littlebird', 'rifleman', 'truck']);
  const near = (u, b) => Math.hypot(u.x - b.x, u.y - b.y) < 400;
  assert.ok(near(fresh.find((u) => u.type === 'rifleman'), kas), 'Schütze erscheint an der Kaserne');
});

test('Ausbildung an einem Stadtgebäude ohne Ausbildung (z. B. Wohnen): sauber abgelehnt statt TypeError', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 20000 });
  const e = [...g.entities.values()].find((x) => x.type === 'city' && x.team === 0 && !x.produces);
  assert.ok(e, 'Startviertel hat ein Stadtgebäude ohne Ausbildung');
  const r = g.issue(0, { type: 'train', buildingId: e.id, unit: 'rifleman' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Kaserne/);
  assert.equal(g.issue(0, { type: 'train', buildingId: e.id, unit: 'gibtsnicht' }).ok, false);
});

test('Ausbildungsgebäude abreißen erstattet die Warteschlange, zerstört verfällt sie', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = g.city[0];
  c.popF = 40; // Einwohner für die Ausbildung
  const fab = trainerFor(g, 'tank');
  const money0 = g.teams[0].res.money;
  const metal0 = c.metal;
  assert.ok(g.issue(0, { type: 'train', buildingId: fab.id, unit: 'tank' }).ok);
  assert.ok(g.teams[0].res.money < money0 && c.metal < metal0);
  const col = fab.cityCell % c.cols;
  const row = (fab.cityCell - col) / c.cols;
  assert.ok(g.issue(0, { type: 'city', kind: 'erase', c0: col, r0: row, c1: col, r1: row }).ok);
  assert.equal(g.teams[0].res.money, money0);
  assert.equal(c.metal, metal0);
  assert.equal(trainerFor(g, 'tank'), undefined);
  assert.equal(g.unitCount(0), g.units.filter((u) => u.team === 0).length, 'nichts mehr in Ausbildung');
});

test('KI mit Stadt bildet in Kaserne und Fabrikhalle aus und baut einen Heliport [langsam]', () => {
  const g = new Game({ seed: 5, city: true, startMoney: 4000 });
  const ai = new AI(g, 1, 'normal');
  const own = () => g.units.filter((u) => u.alive && u.team === 1 && u.crew).length;
  for (let t = 0; t < 20 * 420; t++) { ai.update(0.05); g.update(0.05); }
  assert.ok(own() >= 3, `KI hat Truppen ausgebildet: ${own()}`);
  const kinds = new Set(cityTrainers(g, 1).map((e) => e.def.name));
  assert.ok(kinds.has('Kaserne') && kinds.has('Fabrikhalle'), [...kinds].join(','));
  assert.ok(kinds.has('Heliport') || g.city[1].list.some((i) => g.city[1].kind[i] === KIND_ID.heliport), 'Heliport ausgewiesen');
});

// v5.00: Universität als 3 × 3-Großbau (ein Gebäude, ein Ziel, alte Spielstände werden umgebaut)
test('Universität: 3 × 3 Zellen, ein Gebäude, wächst mit Straße, Räumen entfernt alles', () => {
  const g = new Game({ seed: 3, city: true });
  g.teams[0].res.money = 5000;
  const c = g.city[0];
  const b0 = spot(g, 5, 6); // Quadrat plus eine Zeile darunter für die Straße, ringsum eine freie Zelle (keine Straße daneben)
  const b = { c: b0.c + 1, r: b0.r + 1 };
  const money = g.teams[0].res.money;
  const r = raw(g, 'uni', b.c + 1, b.r + 1, b.c + 1, b.r + 1);
  assert.ok(r.ok, r.reason);
  assert.equal(g.teams[0].res.money, money - CITY.cost.uni, 'ein Preis je Gebäude');
  const a = r.anchor;
  const cells = cellsOf(c, a);
  assert.equal(cells.length, 9);
  assert.ok(cells.every((j) => c.kind[j] === KIND_ID.uni && c.part[j] === a + 1));
  assert.equal(cells.filter((j) => isPart(c, j)).length, 8, 'Mitte ist der Anker');
  assert.ok(r.noRoad, 'ohne Straße meldet der Befehl das');
  assert.ok(raw(g, 'road', b.c, b.r + 3, b.c + 2, b.r + 3).ok);
  run(g, CITY.growTime + 1);
  assert.ok(cells.every((j) => c.level[j] === 1), 'alle Zellen Stufe 1');
  assert.equal(cityLevel(g, 0, 'uni'), 1);
  const e = c.ents.get(a);
  assert.ok(e && e.alive);
  assert.equal(e.w * g.grid.tile, 3 * c.cell, 'Ziel deckt das ganze Quadrat');
  assert.equal(e.def.hp, CITY.hp[1] * 3);
  assert.equal([...c.ents.values()].filter((x) => x.def.name === 'Universität').length, 1, 'ein Ziel');
  assert.equal(cityEntityAt(g, e.x - c.cell, e.y - c.cell), e, 'Eckzelle trifft dasselbe Gebäude');
  let seen = 0;
  forEnemyCity(g, 1, e.x, e.y, 200, (x) => { if (x === e) seen++; });
  assert.equal(seen, 1, 'Splash trifft den Großbau nur einmal');
  // Uni-Plätze zählen einmal
  run(g, 1);
  const jobs0 = g.city[0].stats.jobs;
  assert.ok(raw(g, 'erase', b.c + 2, b.r + 2, b.c + 2, b.r + 2).ok, 'Räumen einer Eckzelle');
  assert.ok(cells.every((j) => !c.kind[j] && !c.part[j]), 'ganzes Quadrat leer');
  assert.ok(!e.alive);
  run(g, 1);
  assert.equal(jobs0 - g.city[0].stats.jobs, CITY.jobsUni[1], 'Uni zählte einmal');
  // kein Platz: abgelehnt, nichts bezahlt
  const m = g.mainFob(0);
  const [fc, fr] = [Math.floor(m.x / c.cell), Math.floor(m.y / c.cell)];
  const before = g.teams[0].res.money;
  assert.match(raw(g, 'uni', fc, fr, fc, fr).reason, /3 × 3/);
  assert.equal(g.teams[0].res.money, before);
});

test('Universität: zerstört wird das ganze Quadrat Ruine und wächst neu', () => {
  const g = new Game({ seed: 3, city: true });
  g.teams[0].res.money = 5000;
  const c = g.city[0];
  const b = spot(g, 3, 4);
  const a = raw(g, 'uni', b.c + 1, b.r + 1, b.c + 1, b.r + 1).anchor;
  raw(g, 'road', b.c, b.r + 3, b.c + 2, b.r + 3);
  run(g, CITY.growTime + 1);
  const e = c.ents.get(a);
  assert.ok(e && e.def.hp === CITY.hp[1] * 3);
  e.hp = 0;
  run(g, 0.1);
  assert.ok(cellsOf(c, a).every((j) => c.level[j] === 0 && c.kind[j] === KIND_ID.uni));
  assert.ok(c.timer[a] < 0, 'Ruine');
  assert.equal(cityLevel(g, 0, 'uni'), 0);
  run(g, CITY.ruinTime + CITY.growTime + 1);
  assert.ok(cellsOf(c, a).every((j) => c.level[j] === 1), 'neu gewachsen');
  assert.ok(c.ents.get(a)?.alive);
});

test('KI baut die Universität als 3 × 3-Großbau', () => {
  const g = new Game({ seed: 5, city: true });
  const ai = new AI(g, 1, 'normal');
  g.teams[1].res.money = 50000;
  let a = -1;
  for (let k = 0; k < 120 && a < 0; k++) {
    aiCity(g, 1, 'normal', ai.cityMem);
    run(g, 1);
    const c = g.city[1];
    a = c.list.find((j) => c.kind[j] === KIND_ID.uni && c.part[j] - 1 === j) ?? -1;
  }
  assert.ok(a >= 0, 'KI hat eine Uni ausgewiesen');
  const c = g.city[1];
  assert.equal(cellsOf(c, a).length, 9);
  assert.ok(cellsOf(c, a).every((j) => !c.deposit[j]), 'nicht auf Vorkommen');
  assert.ok(hasRoad(c, a % c.cols, Math.floor(a / c.cols)), 'mit Straße');
  void ai;
});

test('Heilen und Reparieren (v5.01): Kaserne heilt Soldaten, Fabrikhalle repariert gegen Metall, erst nach dem Treffer-Abstand', () => {
  const heal0 = BALANCE.commander.heal;
  BALANCE.commander.heal = 0; // Kommandeur-Aura heilt sonst mit
  try {
    const g = new Game({ seed: 3, city: true });
    const bar = trainerFor(g, 'rifleman');
    const fac = trainerFor(g, 'tank');
    const inf = g.units.filter((u) => u.alive && u.team === 0 && u.type === 'rifleman');
    const [a, far, hit] = inf;
    const tank = g.units.find((u) => u.alive && u.team === 0 && u.type === 'tank');
    const put = (u, x, y, hp) => Object.assign(u, { x, y, hp, lastHitTime: -1e9 });
    put(a, bar.x + 10, bar.y + 10, 30);
    put(far, bar.x + CITY.cell * 6, bar.y, 30);
    put(hit, bar.x - 10, bar.y + 10, 30);
    put(tank, fac.x + 10, fac.y + 10, tank.maxHp / 2);
    g.city[0].metal = 400;
    hit.lastHitTime = g.time; // gerade getroffen: in den nächsten 6 s keine Pflege
    const t0 = tank.hp;
    run(g, 2);
    const p = g.city[0].stats.powerRatio;
    assert.ok(Math.abs(a.hp - (30 + 100 * CITY.care.by.barracks.rate * p * 2)) < 0.6, `Kaserne heilt (${a.hp})`);
    assert.equal(far.hp, 30, 'außer Reichweite keine Heilung');
    assert.equal(hit.hp, 30, 'kurz nach einem Treffer keine Heilung');
    assert.ok(tank.hp > t0 + 1, 'Fabrikhalle repariert');
    const used = ((tank.hp - t0) / tank.maxHp) * CITY.metalCost.tank * CITY.care.metalShare;
    assert.ok(g.city[0].metal < 400 && g.city[0].metal > 400 - used - 1, 'Reparatur kostet Metall');
    g.city[0].metal = 0;
    const t1 = tank.hp;
    run(g, 1);
    assert.ok(tank.hp - t1 < 0.5, 'ohne Metall keine Reparatur');
  } finally {
    BALANCE.commander.heal = heal0;
  }
});

test('Krankenhaus (v5.01): heilt Soldaten im Umkreis von 3 Feldern schneller', () => {
  const heal0 = BALANCE.commander.heal;
  BALANCE.commander.heal = 0;
  try {
    const g = new Game({ seed: 3, city: true, startMoney: 5000 });
    clearStart(g); // ohne Kaserne in der Nähe
    assert.equal(paint(g, 'road', 0, 1, 2, 1).ok, true);
    assert.equal(paint(g, 'hospital', 1, 0, 1, 0).ok, true);
    run(g, CITY.growTime + 1);
    const c = g.city[0];
    const i = at(g, 1, 0);
    assert.equal(c.level[i], 1, 'Krankenhaus gebaut');
    const e = c.ents.get(i);
    assert.equal(e.def.name, 'Krankenhaus');
    const [inR, outR] = g.units.filter((u) => u.alive && u.team === 0 && u.type === 'rifleman');
    Object.assign(inR, { x: e.x + CITY.cell * 3, y: e.y, hp: 20, lastHitTime: -1e9 });
    Object.assign(outR, { x: e.x + CITY.cell * 4.6, y: e.y, hp: 20, lastHitTime: -1e9 });
    run(g, 1);
    assert.ok(inR.hp > 20 + 100 * CITY.care.by.barracks.rate, `Krankenhaus heilt schneller als die Kaserne (${inR.hp})`);
    assert.equal(outR.hp, 20, 'außerhalb von 3 Feldern keine Heilung');
  } finally {
    BALANCE.commander.heal = heal0;
  }
});

// v5.08: Werke (BM-Werk, Munitionswerk, Raffinerie, Stahlwerk) als 2 × 2-Großbauten
test('Werke 2 × 2 (v5.08): ein Gebäude wie bisher eine Werkzelle, Mitte zwischen den Zellen, Räumen entfernt alles', () => {
  const g = new Game({ seed: 3, city: true });
  g.teams[0].res.money = 5000;
  const c = g.city[0];
  const b0 = spot(g, 4, 5);
  const b = { c: b0.c + 1, r: b0.r + 1 }; // 2 × 2 plus Straßenzeile, ringsum frei
  const money = g.teams[0].res.money;
  const r = raw(g, 'fuel', b.c + 1, b.r + 1, b.c + 1, b.r + 1); // ein Tipp: dort der Anker, das Quadrat reicht nach rechts unten …
  assert.ok(r.ok, r.reason);
  assert.equal(r.anchor, (b.r + 1) * c.cols + b.c + 1);
  assert.ok(raw(g, 'erase', b.c + 1, b.r + 1, b.c + 1, b.r + 1).ok);
  const r2 = raw(g, 'fuel', b.c, b.r, b.c + 1, b.r + 1); // … ein 2 × 2-Rechteck: genau dort
  assert.equal(r2.anchor, b.r * c.cols + b.c);
  assert.equal(g.teams[0].res.money, money - 2 * CITY.cost.fuel, 'ein Preis je Gebäude');
  const a = r2.anchor;
  const cells = cellsOf(c, a);
  assert.equal(cells.length, 4);
  assert.ok(cells.every((j) => c.kind[j] === KIND_ID.fuel && c.part[j] === a + 1));
  assert.ok(r2.noRoad);
  run(g, 1);
  const jobs0 = c.stats.jobs;
  assert.ok(raw(g, 'road', b.c, b.r + 2, b.c + 1, b.r + 2).ok);
  run(g, CITY.growTime + 1);
  assert.ok(cells.every((j) => c.level[j] === 1), 'alle Zellen Stufe 1');
  const e = c.ents.get(a);
  assert.ok(e && e.alive);
  assert.equal(e.w * g.grid.tile, 2 * c.cell);
  assert.equal(e.def.hp, CITY.hp[1] * 2);
  const corner = { x: c.x0 + (b.c + 1) * c.cell, y: c.y0 + (b.r + 1) * c.cell };
  assert.ok(Math.abs(e.x - corner.x) < 1e-6 && Math.abs(e.y - corner.y) < 1e-6, 'Mitte = Ecke zwischen den vier Zellen');
  assert.equal(cityEntityAt(g, e.x + c.cell / 2, e.y + c.cell / 2), e, 'Zelle rechts unten trifft dasselbe Gebäude');
  run(g, 1);
  assert.equal(c.stats.jobs - jobs0, CITY.jobs[1], 'Arbeitsplätze wie bisher eine Werkzelle');
  assert.ok(raw(g, 'erase', b.c + 1, b.r + 1, b.c + 1, b.r + 1).ok, 'Räumen einer Zelle');
  assert.ok(cells.every((j) => !c.kind[j] && !c.part[j]), 'ganzes Quadrat leer');
  assert.ok(!e.alive);
  // Startviertel: die Raffinerie ist ein fertiges 2 × 2-Werk
  const f = c.list.find((j) => c.kind[j] === KIND_ID.fuel && c.part[j] - 1 === j);
  assert.ok(f >= 0 && c.level[f] === 1 && cellsOf(c, f).length === 4, 'Startviertel mit 2 × 2-Raffinerie');
});

test('2 × 2-BM-Werk: Straßenanschluss auch über ein benachbartes BM-Werk an der Straße (v5.05 für Großbauten)', () => {
  const g = new Game({ seed: 3, city: true });
  g.teams[0].res.money = 5000;
  const c = g.city[0];
  const b0 = spot(g, 6, 5);
  const b = { c: b0.c + 1, r: b0.r + 1 };
  assert.ok(raw(g, 'road', b.c, b.r, b.c + 3, b.r).ok);
  const near = raw(g, 'bm', b.c, b.r + 1, b.c + 1, b.r + 2).anchor;
  const far = raw(g, 'bm', b.c, b.r + 3, b.c + 1, b.r + 4).anchor;
  const mun = raw(g, 'mun', b.c + 2, b.r + 1, b.c + 3, b.r + 2).anchor;
  const mun2 = raw(g, 'mun', b.c + 2, b.r + 3, b.c + 3, b.r + 4).anchor;
  const at2 = (a) => [a % c.cols, Math.floor(a / c.cols)];
  assert.ok(hasRoad(c, ...at2(near)), 'direkt an der Straße');
  assert.ok(hasRoad(c, ...at2(far)), 'über das BM-Werk davor');
  assert.ok(hasRoad(c, ...at2(mun)));
  assert.ok(!hasRoad(c, ...at2(mun2)), 'andere Werke nur direkt');
});

test('KI baut Werke als 2 × 2-Großbauten', () => {
  const g = new Game({ seed: 5, city: true });
  g.teams[1].res.money = 50000;
  const c = g.city[1];
  const isWork = (j) => ['bm', 'mun', 'steel'].includes(KINDS[c.kind[j] - 1]);
  let works = [];
  const mem = cityAiMemory();
  for (let k = 0; k < 90 && works.length < 8; k++) {
    aiCity(g, 1, 'normal', mem);
    run(g, 1);
    works = c.list.filter(isWork);
  }
  assert.ok(works.length >= 8, `KI hat Werke ausgewiesen (${works.length} Zellen)`);
  assert.ok(works.every((j) => c.part[j] > 0), 'alle als Großbau');
  assert.ok(works.every((j) => !c.deposit[j]), 'nicht auf Vorkommen');
});

test('Räumen fällt Bäume: Zelle wird bebaubar, Fels und Hauptstadt bleiben gesperrt (seit v5.13)', () => {
  const g = new Game({ seed: 7, city: true });
  const c = g.city[0];
  const gr = g.grid;
  const k = c.cell / gr.tile;
  // Zelle, die genau ein Einzelbaum sperrt (Stamm-Kachel), und eine mit Wald
  const cellOf = (x, y) => Math.floor(y / c.cell) * c.cols + Math.floor(x / c.cell);
  const tree = g.map.trees.find((t) => c.blocked[cellOf(t.x, t.y)] && !g.city.some((o) => o.kind[cellOf(t.x, t.y)]));
  assert.ok(tree, 'kein Baum auf der Karte');
  const i = cellOf(tree.x, tree.y);
  const col = i % c.cols;
  const row = (i - col) / c.cols;
  const res = g.issue(0, { type: 'city', kind: 'erase', c0: col, r0: row, c1: col, r1: row });
  if (res.ok) {
    assert.equal(res.felled, 1);
    assert.equal(c.blocked[i], 0);
    assert.equal(g.city[1].blocked[i], 0, 'Sperren gelten für beide Teams');
    assert.equal(c.felled[i], 1);
    assert.ok(treeGone(g, tree.x, tree.y));
    for (let r = row * k; r < (row + 1) * k; r++) for (let q = col * k; q < (col + 1) * k; q++) assert.ok(gr.free(q, r));
    assert.ok(canZone(g, c, i), 'nach dem Fällen darf man bauen');
  } else assert.match(res.reason, /Nur Bäume/); // derselbe Baum steht neben Fels oder Wasser
  // Ein ganzer Wald im Rechteck: mindestens eine Zelle wird frei
  const forest = g.map.obstacles.find((o) => Math.round(o.r) % 2 === 0 && o.r >= 64);
  assert.ok(forest, 'kein Wald auf der Karte');
  const fc = Math.floor(forest.x / c.cell);
  const fr = Math.floor(forest.y / c.cell);
  const before = c.blocked.reduce((a, b) => a + b, 0);
  const res2 = g.issue(0, { type: 'city', kind: 'erase', c0: fc - 1, r0: fr - 1, c1: fc + 1, r1: fr + 1 });
  assert.ok(res2.ok && res2.felled > 0, 'Wald lässt sich fällen');
  assert.equal(c.blocked.reduce((a, b) => a + b, 0), before - res2.felled);
  // Fels bleibt gesperrt
  const rock = g.map.obstacles.find((o) => Math.round(o.r) % 2 === 1 && o.r >= 40);
  if (rock) {
    const rc = Math.floor(rock.x / c.cell);
    const rr = Math.floor(rock.y / c.cell);
    const res3 = g.issue(0, { type: 'city', kind: 'erase', c0: rc, r0: rr, c1: rc, r1: rr });
    assert.equal(res3.ok, false);
    assert.equal(c.blocked[rr * c.cols + rc], 1);
  }
  // Hauptstadt: der Platz darum bleibt frei
  const m = g.mainFob(0);
  const mc = Math.floor(m.x / c.cell);
  const mr = Math.floor(m.y / c.cell);
  g.issue(0, { type: 'city', kind: 'erase', c0: mc, r0: mr, c1: mc, r1: mr });
  assert.equal(c.blocked[mr * c.cols + mc], 1);
  // Spielstand: gefällte Zellen bleiben gefällt, beide Teams teilen weiter dasselbe Feld
  const { game: h } = restoreGame(JSON.parse(JSON.stringify(snapshotGame(g, null))));
  assert.equal(h.city[0].felled, h.city[1].felled);
  assert.deepEqual([...h.city[0].felled], [...c.felled]);
});

test('connectRoad (AP4): Förderanlage an das Lager anschließen, Baumaterial je Zelle, 0 wenn verbunden, −1 ohne Weg', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const m = g.mainFob(0);
  const wood = DEPOSITS.indexOf('wood') + 1;
  // Holzvorkommen im Gebiet ohne Straße daneben, möglichst weit von der Hauptstadt
  const [fc, fr] = cellAt(c, m.x, m.y);
  const far = [];
  for (let i = 0; i < c.deposit.length; i++) {
    if (c.deposit[i] !== wood || !c.claim[i] || c.kind[i] || !canZone(g, c, i) || accessCells(c, i).length) continue;
    far.push({ i, d: Math.abs((i % c.cols) - fc) + Math.abs(Math.floor(i / c.cols) - fr) });
  }
  far.sort((p, o) => p.d - o.d);
  const i = far.find((f) => f.d >= 3).i; // nicht direkt an der Hauptstadt
  const col = i % c.cols;
  const row = (i - col) / c.cols;
  assert.ok(g.issue(0, { type: 'city', kind: 'mine', c0: col, r0: row, c1: col, r1: row }).ok);
  const bm0 = m.store.bm;
  withValue(CITY.transport, 'connectMax', 0, () => assert.equal(connectRoad(g, c, i, true), -1, 'ohne erlaubte Länge kein Weg'));
  const n = connectRoad(g, c, i, true);
  assert.ok(n > 0 && n <= CITY.transport.connectMax, `gelegte Zellen ${n}`);
  assert.equal(m.store.bm, bm0 - n * CITY.costBm.road, 'jede Straßenzelle kostet Baumaterial');
  assert.ok(accessCells(c, i).some((j) => roadAt(c, j)), 'Förderanlage hat jetzt eine Straße');
  assert.equal(connectRoad(g, c, i, true), 0, 'schon verbunden: nichts mehr');
  // neue Straßen nie auf Vorkommen
  for (let j = 0; j < c.kind.length; j++) if (c.kind[j] === KIND_ID.road && c.deposit[j]) assert.fail(`Straße auf Vorkommen ${j}`);
});

test('Startviertel (AP4): Raffinerie hat einen Weg ins Lager, Ölquelle einen Weg zur Raffinerie', () => {
  for (const team of [0, 1]) {
    const g = new Game({ seed: 3, city: true });
    const c = g.city[team];
    const fuel = c.list.find((i) => !isPart(c, i) && c.level[i] && c.kind[i] === KIND_ID.fuel);
    const oil = c.list.find((i) => c.kind[i] === KIND_ID.mine && c.level[i] && DEPOSITS[c.deposit[i] - 1] === 'oil');
    assert.ok(fuel !== undefined && oil !== undefined, `Team ${team}: Raffinerie und Ölquelle fertig`);
    assert.equal(transportInfo(g, c, fuel).to, 'Lager', `Team ${team}: Raffinerie → Lager`);
    assert.equal(transportInfo(g, c, oil).to, 'Raffinerie', `Team ${team}: Ölquelle → Raffinerie`);
  }
});
