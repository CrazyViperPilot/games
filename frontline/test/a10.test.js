// Paket E12: Erdkampfflugzeug A-10 (Fliegerhorst, eine Bordkanone, nur Bodenziele). Hilfsfunktionen wie in test/airbase.test.js.
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

test('A-10: Daten – eine Bordkanone, nur Bodenziele, langsamer als die F-16, mehr HP, mehr Treibstoff', () => {
  const a = UNITS.a10;
  assert.equal(a.jet, true);
  assert.equal(a.weapons.length, 1, 'eine Waffe');
  const [gun] = a.weapons;
  assert.equal(gun.id, 'gun');
  assert.ok(gun.rounds >= 200, 'viele Schuss');
  assert.ok(gun.cooldown < UNITS.f16.weapons[0].cooldown, 'schnelle Kadenz');
  for (const k of gun.targets) assert.ok(k !== 'air' && k !== 'jet', `Ziel ${k} ist kein Bodenziel`);
  assert.ok(a.speed > UNITS.f16.speed * 0.5 && a.speed < UNITS.f16.speed * 0.7, `Tempo um 60 %: ${a.speed}`);
  assert.ok(a.hp > UNITS.f16.hp, 'mehr HP als die F-16');
  assert.ok(a.fuelMax > UNITS.f16.fuelMax, 'lange Einsatzzeit');
  assert.ok(a.hotkey, 'Taste');
  assert.ok(CITY.produces.stand.includes('a10'), 'am Stellplatz ausbildbar');
});

test('A-10: Stellplatz bildet sie aus; greift Bodenziele an, keine Luftziele', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g);
  const [s] = stands;
  assert.ok(s, 'Stellplatz gebaut');
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'a10' }).ok, 'A-10 ausbildbar am Stellplatz');
  for (let k = 0; k < 600 && !g.units.some((x) => x.def === UNITS.a10); k++) run(g, 1);
  const [u] = g.units.filter((x) => x.def === UNITS.a10);
  assert.ok(u, 'A-10 gebaut');
  assert.ok(u.parked && u.jet.home === s.id, 'steht auf dem Stellplatz');
  assert.equal(u.weapons.length, 1);

  // Bodenziel: Panzer. Luftziel: Hubschrauber – nur der Panzer darf beschossen werden
  const z = g.zone;
  const tank = g.spawnUnit('tank', 1, z.x + 120, z.y);
  const heli = g.spawnUnit('gunship', 1, z.x + 200, z.y);
  tank.hp = heli.hp = 1e6;
  u.jet = { ...u.jet, ready: true, phase: 'air', alt: 1 };
  u.parked = false;
  u.x = z.x - 300;
  u.y = z.y;
  g.fog[0].revealAll?.();
  assert.ok(g.issue(0, { type: 'attackMove', ids: [u.id], x: z.x, y: z.y }).ok);
  for (let t = 0; t < 40 && u.weapons[0].rounds > 380; t++) {
    run(g, 0.5);
    g.fog[0].revealAll?.();
  }
  assert.ok(u.weapons[0].rounds < 400, 'Bordkanone hat geschossen');
  assert.ok(tank.hp < 1e6, 'Panzer getroffen');
  assert.equal(heli.hp, 1e6, 'Hubschrauber nicht beschossen');
});
