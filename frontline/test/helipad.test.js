// v5.51: Heliport als Landeplatz wie der Fliegerhorst: ein Hubschrauber je Heliport, Start und Landung senkrecht, Tanken und
// Nachladen aus Kerosintank und Munitionslager in der Nähe, Luftraumsperre (mit Tower kürzer), Heimflug bei knappem Treibstoff.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { UNITS } from '../js/data/units.js';
import { canZone, roadAt } from '../js/game/city/cells.js';
import { KINDS } from '../js/data/citykinds.js';
import { heliGrounded, padBusy } from '../js/game/helipad.js';

const DT = 0.05;
const run = (g, s) => {
  for (let i = 0; i < s / DT; i++) g.update(DT);
};
const H = CITY.air.heli;

function rich(g, t = 0) {
  const c = g.city[t];
  const m = g.mainFob(t);
  g.teams[t].res.money = 1e6;
  Object.assign(m.store, { bm: 30000, mun: 30000, fuel: 30000 });
  c.metal = 3000;
  c.popF = 400;
  c.kero = 3000;
  return { c, m };
}

/** Freie Fläche W × H (mit Rand) nächst der Hauptstadt. */
function freeArea(g, c, m, W, Hh) {
  let best = null;
  const mc = Math.floor(m.x / c.cell);
  const mr = Math.floor(m.y / c.cell);
  for (let r = 1; r < c.rows - Hh - 1; r++) {
    for (let q = 1; q < c.cols - W - 1; q++) {
      const d = Math.abs(q - mc) + Math.abs(r - mr);
      if (best && d >= best.d) continue;
      let ok = true;
      for (let y = r - 1; ok && y <= r + Hh; y++) {
        for (let x = q - 1; ok && x <= q + W; x++) {
          const j = y * c.cols + x;
          ok = canZone(g, c, j) && !c.kind[j] && !roadAt(c, j) && !c.deposit[j];
        }
      }
      if (ok) best = { q, r, d };
    }
  }
  return best;
}

/**
 * Hubschrauberbasis: Straße in Reihe r+2, darüber Heliports bei q, q+1 (Reihe r+1), Tower (2 × 2) bei q+3, darunter Kerosintank
 * und Munitionslager (2 × 2). opts.tower/ktank/mdepot = false lassen sie weg.
 */
function heliBase(g, opts = {}) {
  const { c, m } = rich(g);
  const a = freeArea(g, c, m, 12, 6);
  assert.ok(a, 'Platz');
  const { q, r } = a;
  const put = (kind, dq, dr, w = 0) => assert.ok(g.issue(0, { type: 'city', kind, c0: q + dq, r0: r + dr, c1: q + dq + w, r1: r + dr }).ok, kind);
  put('road', 0, 2, 11);
  put('heliport', 0, 1);
  put('heliport', 1, 1);
  if (opts.tower !== false) put('atc', 4, 0);
  if (opts.ktank !== false) put('ktank', 0, 3);
  if (opts.mdepot !== false) put('mdepot', 2, 3);
  run(g, CITY.growTime + 1);
  const of = (k) => [...c.ents.entries()].filter(([i, e]) => e.alive && KINDS[c.kind[i] - 1] === k).map(([, e]) => e);
  const pads = of('heliport');
  assert.equal(pads.length, 2, 'zwei Heliports');
  const [ktank] = of('ktank');
  const [mdepot] = of('mdepot');
  if (ktank) ktank.stock = CITY.air.tank.cap[c.level[ktank.cityCell]];
  if (mdepot) mdepot.stock = CITY.air.depot.cap[c.level[mdepot.cityCell]];
  return { c, m, pads, ktank, mdepot };
}

test('Heliport bildet einen Hubschrauber aus, der gelandet auf ihm steht; ein zweiter wird abgelehnt', () => {
  const g = new Game({ seed: 3, city: true });
  const { pads } = heliBase(g);
  const [p] = pads;
  assert.ok(g.issue(0, { type: 'train', buildingId: p.id, unit: 'gunship' }).ok);
  const r = g.issue(0, { type: 'train', buildingId: p.id, unit: 'littlebird' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /ein Hubschrauber je Heliport/);
  run(g, UNITS.gunship.buildTime + 1);
  const u = g.units.find((x) => x.type === 'gunship' && x.team === 0);
  assert.ok(u, 'gebaut');
  assert.equal(u.heli.home, p.id);
  assert.equal(u.heli.phase, 'landed');
  assert.ok(heliGrounded(u));
  assert.deepEqual([u.x, u.y], [p.x, p.y]);
});

test('Start senkrecht auf Befehl, Landung auf dem Heliport, dort tanken und nachladen aus Tank und Lager', () => {
  const g = new Game({ seed: 3, city: true });
  const { pads, ktank, mdepot } = heliBase(g);
  const [p] = pads;
  assert.ok(g.issue(0, { type: 'train', buildingId: p.id, unit: 'gunship' }).ok);
  run(g, UNITS.gunship.buildTime + 1);
  const u = g.units.find((x) => x.type === 'gunship' && x.team === 0);
  const tx = p.x + 900;
  assert.ok(g.issue(0, { type: 'move', ids: [u.id], x: tx, y: p.y }).ok);
  run(g, 0.5);
  assert.equal(u.heli.phase, 'takeoff');
  assert.deepEqual([u.x, u.y], [p.x, p.y], 'steigt senkrecht');
  assert.ok(u.heli.alt > 0 && u.heli.alt < 1);
  run(g, H.liftTime);
  assert.equal(u.heli.phase, 'air');
  run(g, 4);
  assert.ok(u.x > p.x + 100, 'fliegt los');
  // leer und durstig zurück
  u.fuel = u.def.fuelMax * 0.5;
  for (const w of u.weapons) w.rounds = 0;
  assert.ok(g.issue(0, { type: 'land', ids: [u.id], airportId: p.id }).ok);
  let landing = false;
  for (let t = 0; t < 60 && u.heli.phase !== 'landed'; t += DT) {
    g.update(DT);
    if (u.heli.phase === 'landing') landing = true;
  }
  assert.ok(landing, 'landet senkrecht');
  assert.equal(u.heli.phase, 'landed');
  assert.deepEqual([u.x, u.y], [p.x, p.y]);
  const fuel0 = u.fuel;
  const k0 = ktank.stock;
  const m0 = mdepot.stock;
  run(g, 3);
  assert.ok(u.fuel > fuel0, 'getankt');
  assert.ok(ktank.stock < k0, 'aus dem Kerosintank');
  assert.ok(mdepot.stock < m0 && u.weapons.some((w) => w.rounds > 0), 'aus dem Munitionslager nachgeladen');
});

test('Ohne Kerosintank: kein Tanken, Mangelmeldung; Heliport zerstört → gelandeter Hubschrauber verloren', () => {
  const g = new Game({ seed: 3, city: true });
  const { pads } = heliBase(g, { ktank: false });
  const [p] = pads;
  assert.ok(g.issue(0, { type: 'train', buildingId: p.id, unit: 'littlebird' }).ok);
  run(g, UNITS.littlebird.buildTime + 1);
  const u = g.units.find((x) => x.type === 'littlebird' && x.team === 0);
  u.fuel = 5;
  g.drainEvents();
  g.teams[0].warnAt = {};
  run(g, 3);
  assert.equal(u.fuel, 5, 'kein Tanken');
  assert.ok(g.drainEvents().some((e) => e.type === 'message' && /Kerosin/.test(e.text)), 'Mangelmeldung');
  p.hp = 0;
  p.alive = false;
  run(g, 0.2);
  assert.equal(u.alive, false);
});

test('Luftraum: Start und Landung sperren Heliports im Umkreis, mit Tower kürzer', () => {
  for (const tower of [false, true]) {
    const g = new Game({ seed: 3, city: true });
    const { pads } = heliBase(g, { tower });
    for (const p of pads) assert.ok(g.issue(0, { type: 'train', buildingId: p.id, unit: 'littlebird' }).ok);
    run(g, UNITS.littlebird.buildTime + 1);
    const helis = g.units.filter((x) => x.type === 'littlebird' && x.team === 0);
    assert.equal(helis.length, 2);
    assert.ok(g.issue(0, { type: 'move', ids: helis.map((u) => u.id), x: pads[0].x + 1500, y: pads[0].y }).ok);
    const sep = tower ? H.sepAtc : H.sep;
    assert.ok(Math.abs(padBusy(g, pads[0]) - sep) < 0.2 || padBusy(g, pads[0]) === 0);
    run(g, 0.2);
    const started = helis.filter((u) => u.heli.phase !== 'landed').length;
    assert.equal(started, 1, `${tower ? 'mit' : 'ohne'} Tower: einer startet, der andere wartet`);
    run(g, sep + 0.3);
    assert.ok(helis.every((u) => u.heli.phase !== 'landed'), 'nach der Sperre startet der zweite');
  }
});

test('Heimflug bei knappem Treibstoff', () => {
  const g = new Game({ seed: 3, city: true });
  const { pads } = heliBase(g);
  const [p] = pads;
  assert.ok(g.issue(0, { type: 'train', buildingId: p.id, unit: 'littlebird' }).ok);
  run(g, UNITS.littlebird.buildTime + 1);
  const u = g.units.find((x) => x.type === 'littlebird' && x.team === 0);
  assert.ok(g.issue(0, { type: 'move', ids: [u.id], x: p.x + 2000, y: p.y }).ok);
  run(g, H.liftTime + 6);
  assert.equal(u.heli.phase, 'air');
  u.fuel = (u.def.fuelPerSec || 1) * (H.reserve + 1);
  run(g, 0.2);
  assert.equal(u.order.type, 'land', 'kehrt heim');
  assert.equal(u.order.targetId, p.id);
});
