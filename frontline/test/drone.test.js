// Paket E10: Aufklärungsdrohne (`drone`). Hubschrauber-Vorbild Little Bird, aber billig, ohne Passagiere, unbewaffnet,
// nur am Heliport ausgebildet (mit Stadt), tankt wie ein Hubschrauber, deckt mit Sicht 450 den Nebel auf.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { UNITS } from '../js/data/units.js';
import { canZone, roadAt } from '../js/game/city/cells.js';
import { KINDS } from '../js/data/citykinds.js';
import { connectRoad } from '../js/game/city/roadnet.js';
import { withValue } from './util.js';

const DT = 0.05;
const run = (g, s) => {
  for (let i = 0; i < s / DT; i++) g.update(DT);
};

test('Werte: billig, 0 Passagiere, unbewaffnet, Luftklasse, Treibstoff 40, Sicht 450', () => {
  const d = UNITS.drone;
  assert.ok(d, 'Einheit drone');
  assert.equal(d.air, true);
  assert.equal(d.armor, 'air');
  assert.equal(d.hp, 120);
  assert.equal(d.sight, 450);
  assert.equal(d.fuelMax, 40);
  assert.equal(d.seats, 0);
  assert.equal(d.damage, null);
  assert.ok(!d.weapons || d.weapons.length === 0, 'unbewaffnet');
  assert.ok(d.cost.money < UNITS.littlebird.cost.money, 'billiger als der Little Bird');
  assert.ok(d.speed < UNITS.littlebird.speed, 'langsamer als der Little Bird');
  assert.ok(d.hotkey, 'Taste');
});

test('Ausbildung nur am Heliport (mit Stadt), Stadt-Kosten, nicht in der Hauptstadt', () => {
  assert.ok(CITY.produces.heliport.includes('drone'));
  for (const [k, list] of Object.entries(CITY.produces)) if (k !== 'heliport') assert.ok(!list.includes('drone'), k);
  assert.ok(!BUILDINGS.fob.produces.includes('drone'), 'Hauptstadt-Menü unverändert');
  assert.equal(CITY.metalCost.drone, 30);
  assert.ok(CITY.metalCost.drone < CITY.metalCost.littlebird);
});

// Hilfsfunktionen wie in test/helipad.test.js: Platz für einen Heliport suchen, Fabrikmenü hier nicht nötig
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

test('Heliport mit Stadt bildet die Drohne aus, Metall aus dem Lager, sie fliegt und deckt Nebel auf', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const m = g.mainFob(0);
  g.teams[0].res.money = 1e6;
  Object.assign(m.store, { bm: 30000, mun: 30000, fuel: 30000 });
  c.metal = 3000;
  c.popF = 400;
  const a = freeArea(g, c, m, 12, 6);
  assert.ok(a, 'Platz');
  const { q, r } = a;
  const put = (kind, dq, dr, w = 0) => assert.ok(g.issue(0, { type: 'city', kind, c0: q + dq, r0: r + dr, c1: q + dq + w, r1: r + dr }).ok, kind);
  put('road', 0, 2, 11);
  put('heliport', 0, 1);
  withValue(CITY.transport, 'connectMax', 400, () => assert.ok(connectRoad(g, c, (r + 2) * c.cols + q + 11, false) >= 0, 'Weg'));
  run(g, CITY.growTime + 1);
  const pad = [...c.ents.entries()].filter(([i, e]) => e.alive && KINDS[c.kind[i] - 1] === 'heliport').map(([, e]) => e)[0];
  assert.ok(pad, 'Heliport steht');

  const metal0 = c.metal;
  assert.ok(g.issue(0, { type: 'train', buildingId: pad.id, unit: 'drone' }).ok, 'ausbilden');
  assert.equal(c.metal, metal0 - CITY.metalCost.drone, 'Metall aus dem Stadtlager');
  run(g, UNITS.drone.buildTime + 1);
  const u = g.units.find((x) => x.type === 'drone' && x.team === 0);
  assert.ok(u, 'Drohne fertig');
  assert.equal(u.passengers?.length ?? 0, 0, 'keine Passagiere');

  // Nebel: 400 px von der Drohne entfernt ist die Zelle nach dem Start aufgedeckt (Sicht 450)
  const fog = g.fog[0];
  const cellAt = (x, y) => Math.floor(y / fog.cell) * fog.cols + Math.floor(x / fog.cell);
  const target = { x: u.x + 400, y: u.y };
  const tx = Math.min(fog.cols * fog.cell - 1, Math.max(0, target.x));
  fog.update(g, 0);
  assert.equal(fog.visible[cellAt(tx, target.y)], 1, 'deckt Zelle 400 px entfernt auf');

  // fliegt: Bewegungsbefehl wird ausgeführt
  const x0 = u.x;
  const y0 = u.y;
  assert.ok(g.issue(0, { type: 'move', ids: [u.id], x: u.x + 300, y: u.y }).ok, 'Befehl');
  run(g, 4);
  assert.ok(Math.hypot(u.x - x0, u.y - y0) > 50, 'fliegt');
});
