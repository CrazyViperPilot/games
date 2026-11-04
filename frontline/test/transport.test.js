// Straßentransport (js/game/transport.js, seit v5.19, AP2): Wege über Straßen, nächstes Ziel, Stau, Lager-Anschluss, Cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { cellsOf, anchorOf, canZone, roadAt } from '../js/game/city.js';
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
  assert.deepEqual(mainAccess(g, c), [], 'ohne Straße am Lager leer');
  // Straße an der Hauptstadt vorbei (Zelle Spalte 8, Zeile 161 liegt im Anschlussbereich), dann ein BM-Werk daran
  g.issue(0, { type: 'city', kind: 'road', c0: 7, r0: 158, c1: 8, r1: 158 });
  g.issue(0, { type: 'city', kind: 'road', c0: 8, r0: 159, c1: 8, r1: 161 });
  g.issue(0, { type: 'city', kind: 'bm', c0: 5, r0: 158, c1: 6, r1: 159 });
  const access = mainAccess(g, c);
  assert.ok(access.length > 0, 'Straße reicht an die Hauptstadt');
  assert.ok(access.includes(161 * c.cols + 8));
  const bmAnchor = anchorOf(c, 158 * c.cols + 5);
  for (const j of cellsOf(c, bmAnchor)) c.level[j] = 1;
  const tr = transportOf(g, c);
  const r = tr.routes.get(bmAnchor);
  assert.equal(r.to, 'main', 'BM-Werk liefert ins Lager');
  assert.equal(transportInfo(g, c, bmAnchor).to, 'Lager');
});

test('Cache: nach Bau wird neu berechnet, sonst bleibt der Stand bis reroute s', () => {
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
  // nach mindestens reroute s: neu berechnet
  run(g, CITY.transport.reroute + 0.5);
  assert.notEqual(transportOf(g, c).routes, routes2, 'nach reroute s neu berechnet');
});
