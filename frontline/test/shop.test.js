// Gewerbe und Markt brauchen Baumaterial (seit v5.20, AP3b): Versorgung über den Straßenweg zum Lager, Steuer und Zufriedenheit
// nach Versorgung gewichtet, eigene Nachfrage (Gewerbe wächst nur bis CITY.shop.per).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { canZone, cellsOf } from '../js/game/city.js';
import { transportOf } from '../js/game/transport.js';
import { resourceFlow } from '../js/game/flow.js';

const run = (g, s) => { for (let t = 0; t < s * 20; t++) g.update(0.05); };

// Ursprung eines w × h großen, freien Rechtecks im Gebiet des Teams, möglichst weit weg (mindestens 6 Zellen) von der Hauptstadt,
// damit kein Straßennetz von selbst das Lager erreicht.
const bases = new WeakMap();
function farSpot(g, w, h, team = 0) {
  const c = g.city[team];
  const m = g.mainFob(team);
  const fc = Math.floor(m.x / c.cell);
  const fr = Math.floor(m.y / c.cell);
  let best = null;
  for (let r = 0; r <= c.rows - h; r++) {
    for (let q = 0; q <= c.cols - w; q++) {
      // Abstand des Rechtecks zur Hauptstadt (Zellen, Nachbarzelle je Achse); die Hauptstadt reicht mehrere Zellen weit
      const dx = Math.max(0, q - fc, fc - (q + w - 1));
      const dy = Math.max(0, r - fr, fr - (r + h - 1));
      const d = dx + dy;
      if (Math.max(dx, dy) < 6 || (best && d >= best.d)) continue;
      let ok = true;
      for (let y = r; ok && y < r + h; y++) for (let x = q; ok && x < q + w; x++) ok = canZone(g, c, y * c.cols + x) && !c.kind[y * c.cols + x];
      if (ok) best = { c: q, r, d };
    }
  }
  assert.ok(best, 'kein Platz im Gebiet');
  return best;
}
// Stadtbefehl relativ zum Ursprung des Testgebiets
function put(g, kind, c0, r0, c1, r1) {
  if (!bases.has(g)) bases.set(g, farSpot(g, 4, 5));
  const b = bases.get(g);
  return g.issue(0, { type: 'city', kind, c0: b.c + c0, r0: b.r + r0, c1: b.c + c1, r1: b.r + r1 });
}
const at = (g, col, row) => { const b = bases.get(g); return (b.r + row) * g.city[0].cols + b.c + col; };
// Startviertel räumen (der Test braucht eine leere Stadt)
function clearStart(g, team = 0) {
  const c = g.city[team];
  for (const i of [...c.list]) {
    const q = i % c.cols;
    const r = (i - q) / c.cols;
    g.issue(team, { type: 'city', kind: 'erase', c0: q, r0: r, c1: q, r1: r });
  }
}
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
// Straßen von der Gebäudefläche aus bis in das Lagerrechteck (Breitensuche über freie Zellen, dann Straßen legen)
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
    const q = j % c.cols;
    const r = Math.floor(j / c.cols);
    const X0 = q * c.cell + c.x0;
    const Y0 = r * c.cell + c.y0;
    return X0 < x1 && X0 + c.cell > x0 && Y0 < y1 && Y0 + c.cell > y0;
  };
  const starts = [];
  for (const j of cellsOf(c, a)) starts.push(...nbOf(c, j));
  const n = c.cols * c.rows;
  const prev = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const q = [];
  const free = (k) => !seen[k] && !c.kind[k] && canZone(g, c, k);
  for (const k of starts) if (free(k)) { seen[k] = 1; q.push(k); }
  for (let h = 0; h < q.length; h++) {
    const j = q[h];
    if (reach(j)) {
      for (let x = j; x !== -1; x = prev[x]) g.issue(team, { type: 'city', kind: 'road', c0: x % c.cols, r0: Math.floor(x / c.cols), c1: x % c.cols, r1: Math.floor(x / c.cols) });
      return;
    }
    for (const k of nbOf(c, j)) if (free(k)) { seen[k] = 1; prev[k] = j; q.push(k); }
  }
  assert.fail('kein Straßenanschluss zum Lager möglich');
}
// Pool (arbeitsfähige Einwohner) und Gewerbe-Arbeiter aus den Zahlen des letzten Schritts
const comWorkers = (s) => s.jobsCom * s.fill;

test('Gewerbe ohne Straßenweg zum Lager: Versorgung 0, Steuer und Zufriedenheit nur mit dem Grundanteil', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  clearStart(g);
  put(g, 'road', 0, 2, 1, 2);
  put(g, 'res', 0, 1, 1, 1);
  put(g, 'com', 0, 3, 0, 3);
  const c = g.city[0];
  const com = at(g, 0, 3);
  run(g, 90);
  assert.ok(c.level[com] >= 1, 'Gewerbe steht');
  assert.equal(transportOf(g, c).shop.get(com) ?? null, null, 'kein Weg zum Lager');
  const s = c.stats;
  assert.ok(s.pop > 8, `Einwohner ${s.pop}`);
  assert.equal(s.shopSupply, 0, 'ohne Weg keine Versorgung');
  assert.equal(s.shopBm, 0, 'kein Baumaterial verbraucht');
  const B = CITY.shop.base;
  const pool = s.pop - s.drafted;
  const weighted = comWorkers(s) * B;
  assert.ok(Math.abs(s.shop - Math.min(1, weighted / (pool * CITY.happy.shopPer))) < 1e-9, `Läden-Anteil ${s.shop}`);
  assert.ok(Math.abs(s.money - (pool * CITY.taxPop + weighted * CITY.taxCom) * s.mood) < 1e-9, `Steuer ${s.money}`);
  const fl = resourceFlow(g, 0);
  assert.ok(fl.issues.some((x) => /Gewerbe ohne Waren/.test(x.text)), 'Hinweis „Gewerbe ohne Waren“');
});

test('Gewerbe mit Weg zum Lager und Baumaterial im Lager: voll versorgt, Baumaterial sinkt', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  clearStart(g);
  put(g, 'road', 0, 2, 1, 2);
  put(g, 'res', 0, 1, 1, 1);
  put(g, 'com', 0, 3, 0, 3);
  const c = g.city[0];
  const com = at(g, 0, 3);
  run(g, 60);
  assert.ok(c.level[com] >= 1, 'Gewerbe steht');
  linkMain(g, 0, com);
  assert.ok(transportOf(g, c).shop.get(com), 'Weg zum Lager');
  const m = g.mainFob(0);
  m.store.bm = 1000;
  const bm0 = m.store.bm;
  run(g, 20);
  const s = c.stats;
  assert.ok(s.shopSupply > 0.99, `Versorgung ${s.shopSupply}`);
  assert.ok(Math.abs(s.shopBm - CITY.shop.need * comWorkers(s)) < 1e-9, `Verbrauch ${s.shopBm}`);
  assert.ok(m.store.bm < bm0, 'Baumaterial im Lager sinkt');
  const pool = s.pop - s.drafted;
  assert.ok(Math.abs(s.money - (pool * CITY.taxPop + comWorkers(s) * CITY.taxCom) * s.mood) < 1e-9, 'volle Steuer');
  // Lager leer: keine Versorgung mehr
  m.store.bm = 0;
  run(g, 2);
  assert.equal(c.stats.shopSupply, 0, 'leeres Lager: keine Versorgung');
  assert.equal(m.store.bm, 0);
});

test('Gewerbe wächst nur, solange seine Arbeitsplätze höchstens Einwohner × per sind', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  clearStart(g);
  put(g, 'road', 0, 2, 1, 2);
  put(g, 'res', 0, 1, 1, 1);
  put(g, 'com', 0, 3, 0, 3);
  const c = g.city[0];
  const com = at(g, 0, 3);
  run(g, 150); // zwei Wohnzellen: 16 Einwohner, 0,25 × 16 = 4 < 6 Arbeitsplätze Stufe 1
  assert.ok(c.stats.pop > 12, `Einwohner ${c.stats.pop}`);
  assert.equal(c.level[com], 1, 'Gewerbe bleibt Stufe 1');
  // Gegenprobe: mit höherer Nachfrage-Grenze wächst es (die Regel wirkt also wirklich)
  const per = CITY.shop.per;
  CITY.shop.per = 1;
  try {
    run(g, 120);
    assert.ok(c.level[com] >= 2, `Stufe ${c.level[com]}`);
  } finally {
    CITY.shop.per = per;
  }
});
