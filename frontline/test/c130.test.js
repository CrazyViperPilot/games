// Paket E13 (Teil a): Transportflugzeug C-130 am Stellplatz ausbilden, Soldaten steigen ein. Hilfsfunktionen wie in test/a10.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { UNITS } from '../js/data/units.js';
import { canZone, roadAt } from '../js/game/city/cells.js';
import { KINDS } from '../js/data/citykinds.js';
import { connectRoad } from '../js/game/city/roadnet.js';
import { withValue } from './util.js';
import { BALANCE } from '../js/data/balance.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit

const DT = 0.05;
const run = (g, s) => {
  for (let i = 0; i < s / DT; i++) g.update(DT);
};

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

function freeArea(g, c, m, W, H) {
  let best = null;
  const mc = Math.floor(m.x / c.cell);
  const mr = Math.floor(m.y / c.cell);
  for (let r = 1; r < c.rows - H - 1; r++) {
    for (let q = 1; q < c.cols - W - 1; q++) {
      const d = Math.abs(q - mc) + Math.abs(r - mr);
      if (best && d >= best.d) continue;
      let ok = true;
      for (let y = r - 1; ok && y <= r + H; y++) {
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

/** Fliegerhorst: Bahn, zwei Stellplätze, Lager, Straßenweg zum Lager der Hauptstadt. Liefert die Stellplätze. */
function airbase(g, t = 0) {
  const { c, m } = rich(g, t);
  const a = freeArea(g, c, m, 12, 6);
  assert.ok(a, 'Platz für den Fliegerhorst');
  const { q, r } = a;
  const put = (kind, dq, dr, w = 0, h = 0) => assert.ok(g.issue(t, { type: 'city', kind, c0: q + dq, r0: r + dr, c1: q + dq + w, r1: r + dr + h }).ok, kind);
  put('runway', 0, 0, 9, 1);
  put('stand', 0, 2);
  put('stand', 2, 2);
  put('atc', 4, 2);
  put('ktank', 6, 2);
  put('mdepot', 8, 2);
  withValue(CITY.transport, 'connectMax', 400, () => assert.ok(connectRoad(g, c, r * c.cols + q + 9, false) >= 0, 'Weg zum Lager'));
  run(g, CITY.growTime + 1);
  const ents = [...c.ents.entries()].filter(([, e]) => e.alive);
  const stands = ents.filter(([i]) => KINDS[c.kind[i] - 1] === 'stand').map(([, e]) => e);
  return { stands };
}

test('C-130: Daten – unbewaffnet, zehn Passagiere, Stellplatz, Modell-Platzhalter', () => {
  const d = UNITS.c130;
  assert.equal(d.jet, true);
  assert.equal(d.weapons.length, 0, 'unbewaffnet');
  assert.equal(d.seats, 10, 'zehn Plätze');
  assert.ok(d.hotkey, 'Taste');
  assert.ok(CITY.produces.stand.includes('c130'), 'am Stellplatz ausbildbar');
  assert.ok(!CITY.produces.barracks.includes('c130') && !CITY.produces.factory.includes('c130'), 'nur am Stellplatz');
});

test('C-130: Stellplatz bildet sie aus, sie steht geparkt', () => {
  const g = new Game({ seed: 5, city: true });
  const [s] = airbase(g).stands;
  assert.ok(s, 'Stellplatz gebaut');
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'c130' }).ok, 'C-130 ausbildbar am Stellplatz');
  for (let k = 0; k < 900 && !g.units.some((x) => x.def === UNITS.c130); k++) run(g, 1);
  const [u] = g.units.filter((x) => x.def === UNITS.c130);
  assert.ok(u, 'C-130 gebaut');
  assert.ok(u.parked && u.jet.home === s.id, 'steht auf dem Stellplatz');
  assert.equal(u.passengers.length, 0, 'leer am Anfang');
});

test('C-130: Soldat steigt am Stellplatz ein (Infanterie, kein Panzer)', () => {
  const g = new Game({ seed: 5, city: true });
  const [s] = airbase(g).stands;
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'c130' }).ok);
  for (let k = 0; k < 900 && !g.units.some((x) => x.def === UNITS.c130); k++) run(g, 1);
  const plane = g.units.find((x) => x.def === UNITS.c130);
  assert.ok(plane, 'C-130 gebaut');
  const inf = g.units.find((x) => x.team === 0 && x.alive && x.def.canRide && x.def.armor === 'inf');
  const tank = g.units.find((x) => x.team === 0 && x.alive && x.def.armor !== 'inf' && x.def.armor !== 'air');
  assert.ok(inf && tank, 'Soldat und Fahrzeug vorhanden');
  assert.equal(g.issue(0, { type: 'board', ids: [tank.id], heliId: plane.id }).ok, false, 'Panzer steigt nicht ein');
  assert.ok(g.issue(0, { type: 'board', ids: [inf.id], heliId: plane.id }).ok, 'Einsteigen-Befehl angenommen');
  for (let k = 0; k < 600 && plane.passengers.length === 0; k++) run(g, 1);
  assert.equal(plane.passengers.length, 1, 'Soldat an Bord');
  assert.equal(plane.passengers[0], inf, 'der Soldat ist es');
  assert.equal(inf.alive, false, 'Soldat ist aus der Welt genommen');
});
