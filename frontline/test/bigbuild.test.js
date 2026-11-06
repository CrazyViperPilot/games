// v5.03: Stadtstraßen der Karte (Zone, Brücken), Großbauten mit gerader Kante. Fliegerhorst und F-16: test/airbase.test.js.
// Hieß bis v5.54 aircraft.test.js (enthielt nie Flugzeugtests).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { BALANCE } from '../js/data/balance.js';
import { canZone, hasRoad, bigFits, bigCells, bigCenter, sizeOf } from '../js/game/city/cells.js';
import { KIND_ID } from '../js/data/citykinds.js';

const DT = 0.05;
const run = (g, s) => {
  for (let i = 0; i < s / DT; i++) g.update(DT);
};

/** Reiche Stadt für Team 0: Geld, Lager, Metall, Einwohner. */
function rich(g, t = 0) {
  const c = g.city[t];
  const m = g.mainFob(t);
  g.teams[t].res.money = 1e6;
  Object.assign(m.store, { bm: 3000, mun: 3000, fuel: 3000 });
  c.metal = 3000;
  c.popF = 400;
  return { c, m };
}

/** Anker für einen n × n-Großbau mit freiem Rand (für eine Straße), nächst der Hauptstadt. */
function spotFor(g, c, m, n) {
  let best = -1;
  let bd = Infinity;
  for (let r = 1; r < c.rows - 1; r++) {
    for (let q = 1; q < c.cols - 1; q++) {
      const a = r * c.cols + q;
      const p = bigCenter(c, a, n);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d >= bd || d < 500) continue;
      if (!bigFits(g, c, a, n + 2, (j) => !c.kind[j] && !c.mapRoads[j] && !c.deposit[j])) continue; // Quadrat plus Rand frei
      best = a;
      bd = d;
    }
  }
  return best;
}

/** Großbau der Art kind mit Straße an der Unterkante bauen und wachsen lassen; liefert seine Ziel-Entity. */
function buildBig(g, kind, t = 0) {
  const { c, m } = rich(g, t);
  const n = sizeOf(kind);
  const a = spotFor(g, c, m, n);
  assert.ok(a >= 0, `Platz für ${kind}`);
  const q = a % c.cols;
  const r = Math.floor(a / c.cols);
  const lo = Math.floor((n - 1) / 2);
  assert.ok(g.issue(t, { type: 'city', kind, c0: q, r0: r, c1: q, r1: r }).ok);
  assert.ok(g.issue(t, { type: 'city', kind: 'road', c0: q - lo, r0: r - lo + n, c1: q - lo + n - 1, r1: r - lo + n }).ok);
  run(g, CITY.growTime + 1);
  const e = c.ents.get(a);
  assert.ok(e && e.alive, `${kind} gebaut`);
  return { c, e, a };
}

test('Zonenstraßen und Brücken sind Stadtstraßen für beide Teams', () => {
  const g = new Game({ seed: 3, city: true, river: true });
  const c = g.city[0];
  const R = g.roads;
  let town = 0;
  let deck = 0;
  for (const k of R.kind) {
    if (k === 1) town++;
    if (k === 2) deck++;
  }
  assert.ok(town > 1000, `${town} Straßenzellen in der Zone`);
  // Brücken: waagrecht oder senkrecht, Enden auf Zellkanten, jede Zelle darunter eine Brückenzelle
  for (const b of g.bridges) {
    assert.ok(b.x1 === b.x2 || b.y1 === b.y2, 'achsparallel');
    const S = CITY.cell;
    assert.ok((b.x1 === b.x2 ? b.y1 % S : b.x1 % S) === 0 && (b.x1 === b.x2 ? (b.x1 - S / 2) % S : (b.y1 - S / 2) % S) === 0, 'auf dem Stadtraster');
  }
  assert.equal(deck, g.bridges.reduce((n, b) => n + Math.round(b.len / CITY.cell), 0));
  // eine Zonenstraße: nicht ausweisbar, eine Zelle daneben hat Straßenanschluss (für beide Teams)
  let i = -1;
  for (let k = 0; k < R.kind.length && i < 0; k++) {
    if (R.kind[k] !== 1) continue;
    const nb = k + 1;
    if (!R.kind[nb] && canZone(g, c, nb) && canZone(g, g.city[1], nb)) i = k;
  }
  assert.ok(i >= 0, 'freie Zelle an einer Zonenstraße');
  assert.equal(canZone(g, c, i), false, 'Straße der Zone lässt sich nicht überbauen');
  const q = (i + 1) % c.cols;
  const r = Math.floor((i + 1) / c.cols);
  rich(g, 0);
  assert.ok(g.issue(0, { type: 'city', kind: 'com', c0: q, r0: r, c1: q, r1: r }).ok);
  assert.ok(hasRoad(c, q, r), 'Gewerbe an der Zonenstraße hat Anschluss');
  assert.ok(hasRoad(g.city[1], q, r) || !g.city[1].kind[i + 1], 'auch für Rot (die Straße gehört niemandem)');
  run(g, CITY.growTime + 1);
  assert.ok(c.level[i + 1] >= 1, 'wächst ohne eigene Straße');
  // Räumen lässt die Zonenstraße stehen
  const ri = i % c.cols;
  const rr = Math.floor(i / c.cols);
  g.issue(0, { type: 'city', kind: 'erase', c0: ri, r0: rr, c1: ri, r1: rr });
  assert.equal(R.kind[i], 1);
});

test('Großbauten mit gerader Kante: Kraftwerk 2 × 2, Kaserne 4 × 4, Fabrikhalle 5 × 5 (seit v5.33); Startviertel', () => {
  assert.deepEqual([sizeOf('power'), sizeOf('barracks'), sizeOf('factory')], [2, 4, 5]);
  const g = new Game({ seed: 3, city: true });
  for (const c of g.city) {
    const big = [...c.ents.values()].filter((e) => ['barracks', 'factory'].includes(Object.keys(KIND_ID).find((k) => KIND_ID[k] === c.kind[e.cityCell])));
    assert.equal(big.length, 2, 'Kaserne und Fabrikhalle im Startviertel');
    for (const e of big) {
      const n = (e.w * BALANCE.map.tile) / CITY.cell;
      assert.ok(n === 4 || n === 5);
      assert.equal(bigCells(c, e.cityCell, n).filter((j) => c.part[j] === e.cityCell + 1).length, n * n, 'alle Zellen gehören dazu');
      const p = bigCenter(c, e.cityCell, n);
      assert.deepEqual([e.x, e.y], [p.x, p.y], 'Mitte zwischen den Zellen');
    }
  }
  const { e } = buildBig(g, 'power');
  assert.equal(e.w * BALANCE.map.tile, 2 * CITY.cell);
  assert.equal(e.def.hp, CITY.hp[1] * 2);
});
