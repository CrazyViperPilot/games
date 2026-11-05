// Straßentransport (js/game/transport.js, seit v5.20, AP2): Wege über Straßen, nächstes Ziel, Stau, Lager-Anschluss, Cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { cellsOf, anchorOf, canZone, roadAt, accessCells, cellRect, isPart, KIND_ID, bigFits, bigCenter } from '../js/game/city.js';
import { UNITS } from '../js/data/units.js';
import { transportOf, transportInfo, mainAccess, pathEff, addLoad, beginLoads, settleLoads } from '../js/game/transport.js';

const run = (g, s) => { for (let t = 0; t < s * 20; t++) g.update(0.05); };

// Freie 10 × 6-Fläche nahe der Hauptstadt (Team 0), Ursprung (c, r)
function spot(g, w, h) {
  const c = g.city[0];
  const m = g.mainFob(0);
  const fc = Math.floor(m.x / c.cell);
  const fr = Math.floor(m.y / c.cell);
  let best = null;
  for (let r = 0; r <= c.rows - h; r++) {
    for (let q = 0; q <= c.cols - w; q++) {
      let ok = true;
      for (let y = r; ok && y < r + h; y++) for (let x = q; ok && x < q + w; x++) ok = canZone(g, c, y * c.cols + x) && !c.kind[y * c.cols + x];
      // Rand von einer Zelle ohne Straße und ohne Gebäude: die Fläche hängt nicht am Startviertel (seit v5.32, kleinere Fabrikhalle)
      for (let y = r - 1; ok && y <= r + h; y++) {
        for (let x = q - 1; ok && x <= q + w; x++) {
          if (y < 0 || x < 0 || y >= c.rows || x >= c.cols) continue;
          const j = y * c.cols + x;
          ok = !c.kind[j] && !roadAt(c, j);
        }
      }
      if (!ok) continue;
      const d = Math.abs(q - fc) + Math.abs(r - fr);
      if (!best || d < best.d) best = { c: q, r, d };
    }
  }
  assert.ok(best, 'kein Platz im Gebiet');
  return best;
}
const base = new WeakMap();
const baseOf = (g) => {
  if (!base.has(g)) base.set(g, spot(g, 10, 6));
  return base.get(g);
};
// Zelle (col, row) relativ zur Basisfläche
const at = (g, col, row) => { const b = baseOf(g); return (b.r + row) * g.city[0].cols + b.c + col; };
// Baubefehl im Rechteck (relativ zur Basisfläche); Gebäude und Straßen
function put(g, kind, c0, r0, c1, r1) {
  const b = baseOf(g);
  const res = g.issue(0, { type: 'city', kind, c0: b.c + c0, r0: b.r + r0, c1: b.c + c1, r1: b.r + r1 });
  assert.ok(res.ok, res.reason);
  return res;
}
// Gebäude an (col, row) sofort fertig (Stufe 1) setzen, wie in city.test.js
function finish(g, col, row) {
  const c = g.city[0];
  const i = at(g, col, row);
  for (const j of cellsOf(c, i)) c.level[j] = 1;
  return anchorOf(c, i);
}

// Hütte (Erz → Roheisen) bei (0,1) und Stahlwerk bei (8,1), Straße durch die Zeile 0 von Spalte 0 bis 9
function hutte() {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  put(g, 'road', 0, 0, 9, 0);
  put(g, 'smelter', 0, 1, 1, 2);
  put(g, 'steel', 8, 1, 9, 2);
  const c = g.city[0];
  const hut = finish(g, 0, 1);
  const stahl = finish(g, 8, 1);
  return { g, c, hut, stahl };
}

test('Weg über Straßen: Hütte liefert zum Stahlwerk, der Weg besteht aus Straßenzellen', () => {
  const { g, c, hut, stahl } = hutte();
  const tr = transportOf(g, c);
  const r = tr.routes.get(hut);
  assert.equal(r.to, stahl);
  assert.equal(r.dist, 8); // Straßenzellen (1 … 8) von der Hütte zum Anschluss des Stahlwerks
  assert.ok(r.path.every((i) => roadAt(c, i)), 'alle Zellen des Weges sind Straßen');
  const info = transportInfo(g, c, hut);
  assert.equal(info.to, 'Stahlwerk');
  assert.equal(info.dist, 8);
  assert.equal(info.eff, 1);
  // Pendler: ohne Wohnen kein Weg, also keine Arbeit
  assert.equal(tr.commute.get(hut), null);
  assert.equal(info.noHome, true);
  assert.equal(info.commuteEff, 0);
});

test('ohne Verbindung kein Weg: keine Lieferung, Info ohne Ziel', () => {
  const { g, c, hut } = hutte();
  // Straße zum Stahlwerk abreißen: das Werk bei (8,1) liegt danach an keiner Straße mehr
  const row0 = baseOf(g).r;
  const col0 = baseOf(g).c;
  g.issue(0, { type: 'city', kind: 'erase', c0: col0 + 8, r0: row0, c1: col0 + 9, r1: row0 });
  const tr = transportOf(g, c);
  const r = tr.routes.get(hut);
  assert.equal(r.to, null);
  assert.equal(r.path, null);
  const info = transportInfo(g, c, hut);
  assert.equal(info.to, null);
  assert.equal(info.eff, 0);
});

test('nächstes von zwei Zielen gewinnt', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  put(g, 'road', 0, 0, 9, 0);
  put(g, 'smelter', 0, 1, 1, 2);
  put(g, 'steel', 3, 1, 4, 2); // nah: Anschluss bei (3,0)
  put(g, 'steel', 8, 1, 9, 2); // fern: Anschluss bei (8,0)
  const c = g.city[0];
  const hut = finish(g, 0, 1);
  const near = finish(g, 3, 1);
  finish(g, 8, 1);
  const tr = transportOf(g, c);
  const r = tr.routes.get(hut);
  assert.equal(r.to, near, 'das nahe Stahlwerk gewinnt');
  assert.equal(r.dist, 3); // (1,0), (2,0), (3,0)
});

test('Überlast → Stau-Faktor < 1 nach settleLoads, nach Entlastung wieder 1', () => {
  const { g, c, hut } = hutte();
  const tr = transportOf(g, c);
  const r = tr.routes.get(hut);
  beginLoads(tr);
  addLoad(tr, r.path, CITY.transport.cap * 3); // dreifache Kapazität auf dem Weg
  settleLoads(tr, CITY.transport.smooth); // dt = smooth: Glättung ist in einem Schritt vollständig
  const eff = pathEff(tr, r.path);
  assert.ok(eff < 1, `Wirkung ${eff} unter 1`);
  assert.ok(Math.abs(eff - 1 / 3) < 1e-4, `Wirkung ${eff} ≈ 1/3`);
  // ohne Last erholt sich der Stau wieder
  beginLoads(tr);
  settleLoads(tr, CITY.transport.smooth);
  assert.equal(pathEff(tr, r.path), 1);
});

test('Lager-Anschluss: Straße bis an die Hauptstadt macht mainAccess nicht leer, Werk liefert ins Lager', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = g.city[0];
  // Seit v5.20 (AP4) hat das Startviertel schon einen Anschluss ans Lager; die Straße hier ergänzt ihn. Seit v5.32 sucht der Test
  // die Zellen selbst: eine freie Zelle p im Anschlussbereich der Hauptstadt (eine Straße dort zählt zu mainAccess) und daneben ein
  // freies 2 × 2-Quadrat für das BM-Werk
  const m = g.mainFob(0);
  const mc = Math.floor(m.x / c.cell);
  const mr = Math.floor(m.y / c.cell);
  const free = (q, r) => q >= 0 && r >= 0 && q < c.cols && r < c.rows && !c.kind[r * c.cols + q] && canZone(g, c, r * c.cols + q);
  let found = null;
  for (let rad = 1; rad <= 6 && !found; rad++) {
    for (let r = mr - rad; r <= mr + rad && !found; r++) {
      for (let q = mc - rad; q <= mc + rad && !found; q++) {
        if (Math.max(Math.abs(q - mc), Math.abs(r - mr)) !== rad || !free(q, r)) continue;
        const before = mainAccess(g, c).length;
        // Werk 2 × 2 links oben daneben (die Zelle p bleibt Straße)
        for (const [dq, dr] of [[-2, 0], [1, 0], [0, -2], [0, 1], [-2, -1], [1, -1]]) {
          const ok = [[0, 0], [1, 0], [0, 1], [1, 1]].every(([x, y]) => free(q + dq + x, r + dr + y));
          if (!ok) continue;
          const res = g.issue(0, { type: 'city', kind: 'road', c0: q, r0: r, c1: q, r1: r });
          if (!res.ok) break;
          if (!mainAccess(g, c).includes(r * c.cols + q)) {
            g.issue(0, { type: 'city', kind: 'erase', c0: q, r0: r, c1: q, r1: r });
            break;
          }
          assert.ok(mainAccess(g, c).length > before);
          found = { q, r, bq: q + dq, br: r + dr };
          break;
        }
      }
    }
  }
  assert.ok(found, 'Straße reicht an die Hauptstadt');
  g.issue(0, { type: 'city', kind: 'bm', c0: found.bq, r0: found.br, c1: found.bq + 1, r1: found.br + 1 });
  const bmAnchor = anchorOf(c, found.br * c.cols + found.bq);
  for (const j of cellsOf(c, bmAnchor)) c.level[j] = 1;
  const tr = transportOf(g, c);
  const r = tr.routes.get(bmAnchor);
  assert.equal(r.to, 'main', 'BM-Werk liefert ins Lager');
  assert.equal(transportInfo(g, c, bmAnchor).to, 'Lager');
});

test('Cache: nach Bau wird neu berechnet, ohne Änderung bleibt der Stand (auch nach Zeit), Rückkehr Geflohener rechnet neu', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  put(g, 'road', 0, 0, 1, 0); // Straße nur bis Spalte 1
  put(g, 'smelter', 0, 1, 1, 2);
  put(g, 'steel', 8, 1, 9, 2); // ohne Anschluss
  const c = g.city[0];
  const hut = finish(g, 0, 1);
  const stahl = finish(g, 8, 1);
  const tr1 = transportOf(g, c);
  const routes1 = tr1.routes;
  assert.equal(routes1.get(hut).to, null, 'noch keine Verbindung');
  // Straße bis zum Stahlwerk bauen: Stadt ändert sich (c.ver), also neue Berechnung ohne Zeitablauf
  put(g, 'road', 2, 0, 8, 0);
  const tr2 = transportOf(g, c);
  assert.equal(tr2.routes.get(hut).to, stahl, 'nach dem Bau gefunden');
  // ohne Änderung und ohne Zeitablauf: derselbe Stand
  const routes2 = tr2.routes;
  assert.equal(transportOf(g, c).routes, routes2);
  // Zeit allein rechnet nicht neu (seit dem Review von v5.20): die Wege hängen nur vom Stand der Stadt ab
  g.time += 100;
  assert.equal(transportOf(g, c).routes, routes2, 'ohne Änderung derselbe Stand');
  // Wohnung an der Straße, deren Bewohner geflohen sind: kein Pendlerziel; kehren sie zurück (c.ver), ist sie wieder eins
  put(g, 'res', 4, 1, 4, 1);
  const home = finish(g, 4, 1);
  c.flee[home] = 0.01;
  c.ver++; // wie cityNoise beim Beginn der Flucht
  assert.equal(transportInfo(g, c, hut).noHome, true, 'geflohen: keine Wohnung erreichbar');
  const routes3 = transportOf(g, c).routes;
  g.update(0.05); // Ruhezeit läuft ab: Bewohner zurück
  assert.equal(c.flee[home], 0);
  assert.notEqual(transportOf(g, c).routes, routes3, 'nach der Rückkehr neu berechnet');
  assert.equal(transportInfo(g, c, hut).noHome, false, 'Wohnung wieder Pendlerziel');
});

// ---- Rechnung je Gebäude (seit v5.20, AP3, PLAN 1.4): Straßen zum Lager, Pendler, Stau, Kerosin ----
// Die Tests bauen ihre Straßen selbst: Breitensuche über freie Zellen, dann je Zelle ein Straßenbefehl (wie in city.test.js).


const nbOf = (c, j) => {
  const q = j % c.cols;
  const r = (j - q) / c.cols;
  const out = [];
  if (q > 0) out.push(j - 1);
  if (q < c.cols - 1) out.push(j + 1);
  if (r > 0) out.push(j - c.cols);
  if (r < c.rows - 1) out.push(j + c.cols);
  return out;
};
// Breitensuche über freie Zellen ab `starts` bis goal(j) gilt; baut dann die Straße dorthin.
function connect(g, starts, goal) {
  const c = g.city[0];
  const n = c.cols * c.rows;
  const prev = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const q = [];
  const free = (k) => !seen[k] && !c.kind[k] && canZone(g, c, k);
  for (const k of starts) if (free(k)) { seen[k] = 1; q.push(k); }
  for (let h = 0; h < q.length; h++) {
    const j = q[h];
    if (goal(j)) {
      for (let x = j; x !== -1; x = prev[x]) {
        const col = x % c.cols;
        const row = Math.floor(x / c.cols);
        const res = g.issue(0, { type: 'city', kind: 'road', c0: col, r0: row, c1: col, r1: row });
        assert.ok(res.ok, res.reason);
      }
      return true;
    }
    for (const k of nbOf(c, j)) if (free(k)) { seen[k] = 1; prev[k] = j; q.push(k); }
  }
  return false;
}
// Gebäude mit Anker a an das Straßennetz anschließen (hat es schon einen Anschluss: nichts).
function linkRoad(g, a) {
  const c = g.city[0];
  if (accessCells(c, a).length) return;
  const starts = [];
  for (const j of cellsOf(c, a)) starts.push(...nbOf(c, j));
  // nur eigene Straßen: eine Straße der Karte ist nicht zwingend am eigenen Netz
  assert.ok(connect(g, starts, (j) => nbOf(c, j).some((k) => c.kind[k] === KIND_ID.road)), `keine Straße zu ${a}`);
}
// Das Straßennetz an das Lager der Hauptstadt anschließen (Zellen im Anschlussbereich des Lagers, wie mainAccess).
function connectMain(g) {
  const c = g.city[0];
  const m = g.mainFob(0);
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
  const starts = [];
  for (const i of c.list) if (c.kind[i] === KIND_ID.road) starts.push(...nbOf(c, i));
  assert.ok(connect(g, starts, reach), 'kein Anschluss ans Lager');
}
// Startviertel räumen: sein Straßenstück läge sonst als zweites Netz neben der Basisfläche.
function clearStart(g) {
  const c = g.city[0];
  for (const i of [...c.list]) {
    const q = i % c.cols;
    const r = (i - q) / c.cols;
    g.issue(0, { type: 'city', kind: 'erase', c0: q, r0: r, c1: q, r1: r });
  }
}
// Grundnetz: Straße durch Zeile 0 der Basisfläche, Wohnen in Zeile 1 (Spalten 0 … 2), Anschluss ans Lager.
function netBase(g) {
  clearStart(g);
  put(g, 'road', 0, 0, 9, 0);
  put(g, 'res', 0, 1, 2, 1);
  connectMain(g);
  return g.city[0];
}
// Fertiges Gebäude der Art kind (erstes passendes Anker-Gebäude), ohne auf den Bau zu warten.
function finishKind(g, kind) {
  const c = g.city[0];
  const a = c.list.find((i) => c.kind[i] === KIND_ID[kind] && !isPart(c, i));
  for (const j of cellsOf(c, a)) c.level[j] = 1;
  return a;
}
const stepN = (g, n) => { for (let t = 0; t < n; t++) g.update(0.05); };

test('Mine ohne Straße liefert nichts, mit Straße kommt Holz im BM-Werk und BM im Lager an', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = netBase(g);
  const m = g.mainFob(0);
  put(g, 'bm', 5, 1, 6, 2); // 2 × 2 an der Straße
  c.deposit[at(g, 8, 2)] = 1; // Wald (Test)
  put(g, 'mine', 8, 2, 8, 2); // ohne Straße: wächst nicht
  run(g, CITY.growTime + 2);
  assert.equal(c.stats.raw.wood, 0, 'ohne Straße keine Förderung');
  assert.equal(c.stats.bm, 0);
  linkRoad(g, at(g, 8, 2));
  const bm0 = m.store.bm; // nach dem Straßenbau (Straßen kosten Baumaterial)
  run(g, CITY.growTime + 4);
  assert.ok(c.stats.raw.wood > 0, `Holz ${c.stats.raw.wood}`);
  assert.ok(c.stats.inp.bm > 0, 'Holz kommt im BM-Werk an');
  assert.ok(c.stats.gross.bm > 0, 'BM entsteht');
  assert.ok(m.store.bm > bm0, `BM im Lager ${bm0} → ${m.store.bm}`);
  assert.ok(c.stats.bm > 0, 'BM kommt im Lager an');
});

test('Kette Erz → Hütte → Stahlwerk: c.metal (Stahl) steigt, Roheisen fährt zum Stahlwerk', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = netBase(g);
  put(g, 'smelter', 5, 1, 6, 2); // Hütte
  put(g, 'steel', 7, 1, 8, 2); // Stahlwerk
  c.deposit[at(g, 5, 4)] = 3; // Erz (Test)
  put(g, 'mine', 5, 4, 5, 4);
  linkRoad(g, at(g, 5, 4)); // die Erzmine (nicht die Ölquelle, die Räumen stehen lässt)
  const metal0 = c.metal;
  run(g, CITY.growTime + 30);
  assert.ok(c.stats.raw.ore > 0, 'Erz gefördert');
  assert.ok(c.stats.inp.iron > 0 && c.stats.gross.iron > 0, 'Hütte bekommt Erz und macht Roheisen');
  assert.ok(c.stats.gross.metal > 0, 'Stahlwerk macht Stahl');
  assert.ok(c.metal > metal0, `Stahl im Stadtlager ${metal0} → ${c.metal}`);
});

test('Munitionswerk: zieht Stahl aus dem Lager über seinen Weg und liefert Munition nur mit Weg', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = netBase(g);
  const m = g.mainFob(0);
  put(g, 'mun', 5, 1, 6, 2);
  linkRoad(g, c.list.find((i) => c.kind[i] === KIND_ID.mun));
  const metal0 = c.metal;
  const mun0 = m.store.mun;
  run(g, CITY.growTime + 20);
  assert.ok(c.stats.gross.mun > 0, 'Munition wird hergestellt');
  assert.ok(m.store.mun > mun0, `Munition im Lager ${mun0} → ${m.store.mun}`);
  assert.ok(c.metal < metal0, `Stahl sinkt ${metal0} → ${c.metal}`);
  assert.ok(c.stats.metal < 0, 'Stahl-Bilanz negativ (Munitionswerk zieht)');
});

test('Munitionswerk ohne Straße zum Lager: kein Stahl, keine Munition', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = netBase(g);
  const m = g.mainFob(0);
  put(g, 'mun', 5, 3, 6, 4); // nicht an der Straße
  finishKind(g, 'mun'); // fertig, aber ohne Weg
  const metal0 = c.metal;
  const mun0 = m.store.mun;
  run(g, 10);
  assert.equal(c.stats.gross.mun, 0);
  assert.equal(m.store.mun, mun0);
  assert.equal(c.metal, metal0, 'kein Stahl abgezogen');
});

test('Arbeitsstätte ohne Weg zu Wohnen produziert nichts; mit Anschluss der Wohnungen läuft sie', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  clearStart(g);
  put(g, 'road', 0, 0, 9, 0);
  connectMain(g);
  const c = g.city[0];
  const m = g.mainFob(0);
  // Wohnen auf einer Straßen-Insel in Zeile 4/5: Einwohner gibt es, aber kein Weg vom Werk dorthin
  put(g, 'road', 0, 5, 3, 5);
  put(g, 'res', 0, 4, 3, 4);
  put(g, 'bm', 5, 1, 6, 2);
  c.deposit[at(g, 8, 2)] = 1;
  put(g, 'mine', 8, 2, 8, 2);
  linkRoad(g, at(g, 8, 2));
  const bm = c.list.find((i) => c.kind[i] === KIND_ID.bm);
  run(g, CITY.growTime + 10);
  assert.equal(transportInfo(g, c, bm).noHome, true, 'kein Wohnen erreichbar');
  assert.equal(c.stats.bm, 0, 'BM ohne Wohnung');
  assert.equal(c.stats.raw.wood, 0, 'Holz ohne Wohnung');
  // Anschluss der Insel ans Netz: jetzt pendeln die Arbeiter, das BM-Werk arbeitet
  const isl = [];
  for (let x = 0; x <= 3; x++) isl.push(at(g, x, 5));
  const islSet = new Set(isl);
  const starts = [];
  for (const j of isl) starts.push(...nbOf(c, j));
  assert.ok(connect(g, starts, (j) => nbOf(c, j).some((k) => c.kind[k] === KIND_ID.road && !islSet.has(k))), 'Insel anschließbar');
  const bm0 = m.store.bm;
  run(g, 20);
  assert.equal(transportInfo(g, c, bm).noHome, false, 'Wohnen erreichbar');
  assert.ok(c.stats.gross.bm > 0 && m.store.bm > bm0, 'BM läuft mit Wohnen am Netz');
});

test('Überlast auf dem Lieferweg senkt die Lieferung (Stau-Faktor wirkt im Schritt)', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = netBase(g);
  put(g, 'bm', 5, 1, 6, 2);
  c.deposit[at(g, 8, 2)] = 1;
  put(g, 'mine', 8, 2, 8, 2);
  linkRoad(g, at(g, 8, 2));
  run(g, CITY.growTime + 10);
  const tr = transportOf(g, c);
  const bm = c.list.find((i) => c.kind[i] === KIND_ID.bm);
  const path = tr.routes.get(bm).path;
  assert.ok(c.stats.gross.bm > 0 && path, 'BM läuft');
  for (const j of path) tr.factor[j] = 0.5; // Stau auf dem Weg zum Lager
  stepN(g, 1);
  assert.ok(Math.abs(c.stats.bm - 0.5 * c.stats.gross.bm) < 1e-6, `Lieferung ${c.stats.bm} ≈ halb von ${c.stats.gross.bm}`);
  assert.ok(Math.abs(c.stats.jam - 0.5) < 1e-6, `kleinster Stau ${c.stats.jam}`);
});

test('Keine Ware aus dem Nichts: Lager-Zuwachs je Schritt ≤ Förderung über die Kette (auch Munition, Stahl-Netto, Gewerbe-BM)', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = netBase(g);
  const m = g.mainFob(0);
  const K = CITY.convert;
  put(g, 'bm', 3, 1, 4, 2);
  put(g, 'smelter', 5, 1, 6, 2);
  put(g, 'steel', 7, 1, 8, 2);
  put(g, 'com', 9, 1, 9, 1); // Gewerbe holt Baumaterial aus dem Lager (seit dem Review geprüft)
  put(g, 'mun', 0, 3, 1, 4); // Munitionswerk zieht Stahl aus dem Stadtlager
  linkRoad(g, c.list.find((i) => c.kind[i] === KIND_ID.mun));
  c.deposit[at(g, 3, 4)] = 1; // Holz
  c.deposit[at(g, 5, 4)] = 3; // Erz
  put(g, 'mine', 3, 4, 3, 4);
  put(g, 'mine', 5, 4, 5, 4);
  linkRoad(g, at(g, 3, 4));
  linkRoad(g, at(g, 5, 4));
  let bad = 0;
  let mun = 0;
  let take = 0;
  const dt = 0.05;
  for (let t = 0; t < 1200; t++) {
    const metal0 = c.metal;
    const bm0 = m.store.bm;
    const mun0 = m.store.mun;
    g.update(dt);
    const s = c.stats;
    const dMetal = c.metal - metal0;
    const dMun = m.store.mun - mun0;
    // Stahl im Lager plus Stahl in der Munition ≤ Erz / (Erz je Roheisen × Roheisen je Stahl): Munition entsteht nur aus Stahl
    if (dMetal + dMun * K.mun > (s.raw.ore * dt) / (K.iron * K.metal) + 1e-9) bad++;
    // Baumaterial im Lager plus, was das Gewerbe nahm ≤ Holz und Stein / BM-Verbrauch
    if (m.store.bm - bm0 + s.shopBm * dt > ((s.raw.wood + s.raw.stone) * dt) / K.bm + 1e-9) bad++;
    if (c.metal < 0 || m.store.bm < 0 || !Number.isFinite(c.metal) || !Number.isFinite(m.store.mun)) bad++;
    mun += Math.max(0, dMun);
    take += s.shopBm * dt;
  }
  assert.equal(bad, 0, 'nie mehr im Lager als gefördert');
  assert.ok(mun > 0, 'Munition entsteht (die Prüfung greift)');
  assert.ok(take > 0, 'Gewerbe nimmt Baumaterial (die Prüfung greift)');
});

test('F-16 tankt Kerosin aus dem Stadtlager (c.kero), den Treibstoff im Lager lässt es unberührt', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 20000 });
  const c = g.city[0];
  const m = g.mainFob(0);
  // Flughafen (10 × 10) mit Straße darunter, wie in aircraft.test.js
  const n = 10;
  let a = -1;
  let bd = Infinity;
  for (let r = 1; r < c.rows - 1; r++) for (let q = 1; q < c.cols - 1; q++) {
    const k = r * c.cols + q;
    const p = bigCenter(c, k, n);
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d >= bd || d < 500) continue;
    if (!bigFits(g, c, k, n + 2, (j) => !c.kind[j] && !c.mapRoads?.[j] && !c.deposit[j])) continue;
    a = k;
    bd = d;
  }
  assert.ok(a >= 0, 'Platz für den Flughafen');
  const q = a % c.cols;
  const r = Math.floor(a / c.cols);
  assert.ok(g.issue(0, { type: 'city', kind: 'airport', c0: q, r0: r, c1: q, r1: r }).ok);
  assert.ok(g.issue(0, { type: 'city', kind: 'road', c0: q - 4, r0: r + 6, c1: q + 5, r1: r + 6 }).ok);
  run(g, CITY.growTime + 1);
  const ap = c.ents.get(a);
  assert.ok(ap && ap.alive, 'Flughafen steht');
  const u = g.spawnUnit('f16', 0, ap.x, ap.y);
  u.parked = true;
  u.jet = { home: ap.id, slot: 0, ready: false, phase: 'park', alt: 0 };
  u.fuel = 5;
  c.kero = 300;
  const fuel0 = m.store.fuel;
  run(g, 3);
  assert.ok(u.fuel > 5, `F-16 getankt: ${u.fuel}`);
  assert.ok(c.kero < 300, `Kerosin im Stadtlager ${c.kero}`);
  // Seit v5.20 (AP4) liefert die Raffinerie des Startviertels Treibstoff ans Lager: der Flug zieht keinen davon ab
  assert.ok(m.store.fuel >= fuel0, `Treibstoff im Lager ${fuel0} → ${m.store.fuel}`);
  assert.ok(UNITS.f16.fuelMax > 0);
  // leeres Stadtlager: kein Tanken, Meldung „ohne Kerosin“, Treibstoff im Lager bleibt unberührt (seit dem Review)
  c.kero = 0;
  u.fuel = 5;
  g.drainEvents();
  g.teams[0].warnAt = {};
  const fuel1 = m.store.fuel;
  stepN(g, 5);
  assert.equal(u.fuel, 5, 'ohne Kerosin kein Tanken');
  assert.ok(m.store.fuel >= fuel1, 'kein Treibstoff aus dem Lager als Ersatz');
  assert.ok(g.drainEvents().some((e) => e.type === 'message' && e.team === 0 && /Kerosin/.test(e.text)), 'Mangelmeldung Kerosin');
});

test('Heliport tankt Hubschrauber im Umkreis aus c.kero (CITY.care.refuel je s)', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = netBase(g);
  put(g, 'heliport', 5, 1, 5, 1);
  run(g, CITY.growTime + 2);
  const h = c.ents.get(c.list.find((i) => c.kind[i] === KIND_ID.heliport));
  assert.ok(h && h.alive, 'Heliport steht');
  const u = g.spawnUnit('littlebird', 0, h.x, h.y);
  u.fuel = 1;
  c.kero = 300;
  const kero0 = c.kero;
  stepN(g, 1);
  const want = Math.min(UNITS.littlebird.fuelMax - 1, UNITS.littlebird.fuelMax * CITY.care.refuel * 0.05);
  assert.ok(Math.abs((kero0 - c.kero) - want) < 1e-6, `Kerosin verbraucht ${kero0 - c.kero} ≈ ${want}`);
  assert.ok(u.fuel > 1, 'Hubschrauber getankt');
  // leeres Stadtlager: kein Kerosin, aber eine Mangelmeldung (seit dem Review von v5.20)
  c.kero = 0;
  u.fuel = 1;
  g.drainEvents();
  g.teams[0].warnAt = {};
  stepN(g, 1);
  assert.equal(c.kero, 0, 'Stadtlager bleibt leer (Tanken an FOBs mit Treibstoff bleibt davon unberührt)');
  assert.ok(g.drainEvents().some((e) => e.type === 'message' && e.team === 0 && /Kerosin/.test(e.text)), 'Mangelmeldung (Kerosin) bei leerem Stadtlager');
});

test('Ohne Hauptstadt (zerstört): Werke liefern nichts ins Lager, Munitionswerk steht, Gewerbe unversorgt, keine ungültigen Zahlen', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = netBase(g);
  put(g, 'smelter', 5, 1, 6, 2);
  put(g, 'steel', 7, 1, 8, 2);
  put(g, 'com', 9, 1, 9, 1);
  put(g, 'mun', 0, 3, 1, 4);
  linkRoad(g, c.list.find((i) => c.kind[i] === KIND_ID.mun));
  c.deposit[at(g, 5, 4)] = 3; // Erz
  put(g, 'mine', 5, 4, 5, 4);
  linkRoad(g, at(g, 5, 4));
  run(g, CITY.growTime + 20);
  assert.ok(c.stats.gross.metal > 0 && c.stats.gross.mun > 0, 'vorher: Stahl und Munition');
  const m = g.mainFob(0);
  m.alive = false; // Hauptstadt zerstört
  m.hp = 0;
  const metal0 = c.metal;
  stepN(g, 40);
  const s = c.stats;
  assert.equal(g.mainFob(0), null);
  assert.ok(s.raw.ore > 0 && s.gross.iron > 0, 'Förderung und Hütte arbeiten weiter (Ziel ist ein Werk)');
  assert.equal(s.metal, 0, 'kein Stahl ins Stadtlager');
  assert.equal(s.mun, 0, 'keine Munition');
  assert.equal(s.gross.mun, 0, 'Munitionswerk steht');
  assert.equal(c.metal, metal0, 'Stadtlager unverändert');
  assert.equal(s.shopSupply, 0, 'Gewerbe ohne Waren');
  for (const v of [s.money, s.jam, s.lost, s.shop, s.happy]) assert.ok(Number.isFinite(v), `Zahl ${v}`);
});
