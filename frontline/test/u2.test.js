// v5.83: U-2 (Höhenaufklärer, highAlt): belegt einen ganzen Stellplatz, in der Luft nur von F-22 (antiHighAlt) angreifbar,
// große Höhensicht, kreist am Ziel und fliegt erst bei Treibstoffmangel heim; die KI kauft F-22-Anteil und U-2 zur Aufklärung.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { UNITS } from '../js/data/units.js';
import { canZone, roadAt } from '../js/game/city/cells.js';
import { KINDS } from '../js/data/citykinds.js';
import { connectRoad } from '../js/game/city/roadnet.js';
import { standsOf, freeSpace, runwaysOf, isHighAlt, sightOf, jetGrounded } from '../js/game/aircraft.js';
import { withValue } from './util.js';
import { AI } from '../js/ai/ai.js';

const DT = 0.05;
const run = (g, s) => {
  for (let i = 0; i < s / DT; i++) g.update(DT);
};

/** Reiche Stadt für Team t (wie airbase.test.js). */
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

/** Freie Fläche W × H nahe der Hauptstadt. */
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

const kindAt = (c, i) => KINDS[c.kind[i] - 1];

/** Fliegerhorst mit Bahn, zwei Stellplätzen, Tower, Tank und Lager (wie airbase.test.js). */
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
  const stands = ents.filter(([i]) => kindAt(c, i) === 'stand').map(([, e]) => e);
  return { c, m, stands, rw: runwaysOf(g, t).find((x) => x.valid) };
}

/** Eine U-2 am Stellplatz s ausbilden und warten, bis sie dort steht. */
function buildU2(g, s) {
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'u2' }).ok, 'U-2 ausbildbar am Stellplatz');
  for (let k = 0; k < 600 && !g.units.some((x) => x.def === UNITS.u2); k++) run(g, 1);
  const [u] = g.units.filter((x) => x.def === UNITS.u2);
  assert.ok(u && u.parked && u.jet.home === s.id, 'U-2 steht auf dem Stellplatz');
  return u;
}

/** Fliegt u in die Luft über Punkt (x, y), ohne Startrollen; Gegner sieht das Team 0 vollständig. */
function airborne(g, u, x, y) {
  u.parked = false;
  u.jet = { ...u.jet, phase: 'air', alt: 1, ready: true, slot: undefined };
  u.x = x;
  u.y = y;
  u.prevX = x;
  u.prevY = y;
  g.fog[0].revealAll?.();
}

test('U-2: Werte, Höhenschutz und Stellplatz-Belegung in den Daten', () => {
  const u = UNITS.u2;
  assert.equal(u.jet, true);
  assert.equal(u.highAlt, true);
  assert.equal(u.standSlots, 2, 'belegt einen ganzen Stellplatz');
  assert.equal(u.weapons.length, 0, 'unbewaffnet');
  assert.equal(u.airSight, 1800);
  assert.equal(u.sight, 300);
  assert.equal(u.fuelMax, 180);
  assert.ok(UNITS.f22.weapons[0].antiHighAlt, 'F-22 greift hochfliegende Ziele an');
  assert.ok(!UNITS.f16.weapons.some((w) => w.antiHighAlt), 'F-16 nicht');
  assert.ok(!UNITS.flak.weapons.some((w) => w.antiHighAlt) && !UNITS.sam.weapons.some((w) => w.antiHighAlt), 'Flak und SAM nicht');
  assert.ok(CITY.produces.stand.includes('u2'), 'am Stellplatz ausbildbar');
});

test('U-2 belegt einen Stellplatz allein: kein anderer Jet darauf, sie selbst nur auf freiem Stellplatz', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g);
  const [s1, s2] = stands;
  assert.ok(g.issue(0, { type: 'train', buildingId: s1.id, unit: 'f16' }).ok, 'F-16 auf Stellplatz 1');
  const half = g.issue(0, { type: 'train', buildingId: s1.id, unit: 'u2' });
  assert.equal(half.ok, false, 'U-2 nicht auf halb belegtem Stellplatz');
  assert.match(half.reason, /Stellplatz belegt/);
  assert.equal(freeSpace(g, s1), 1);
  assert.ok(g.issue(0, { type: 'train', buildingId: s2.id, unit: 'u2' }).ok, 'U-2 auf freiem Stellplatz 2');
  assert.equal(freeSpace(g, s2), 0, 'ganzer Stellplatz belegt');
  const r = g.issue(0, { type: 'train', buildingId: s2.id, unit: 'f16' });
  assert.equal(r.ok, false, 'F-16 nicht auf den Platz der U-2');
  assert.match(r.reason, /Stellplatz belegt/);
});

test('U-2 in der Luft: F-16, Flak, SAM und Gebäude greifen sie nicht an; die F-22 schon', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g);
  const u = buildU2(g, stands[0]);
  const z = g.zone;
  const flak = g.spawnUnit('flak', 1, z.x + 100, z.y);
  const sam = g.spawnUnit('sam', 1, z.x, z.y + 120);
  const f16 = g.spawnUnit('f16', 1, z.x - 150, z.y);
  for (const e of [flak, sam, f16]) e.hp = 1e6;
  airborne(g, u, z.x + 20, z.y + 20);
  u.order = { type: 'move', x: z.x, y: z.y, targetId: null };
  for (let k = 0; k < 15; k++) {
    run(g, 1);
    g.fog[0].revealAll?.();
  }
  assert.equal(u.hp, u.maxHp, 'U-2 unverletzt');
  assert.ok(isHighAlt(u), 'in der Luft hochfliegend');
  // Nur die F-22 bleibt: die Feind-Jets würden sie sonst mit einem Treffer abschießen (sie gehören auch zu Team 1)
  for (const e of [flak, sam, f16]) e.alive = false;
  const f22 = g.spawnUnit('f22', 1, z.x + 300, z.y - 300); // Gegner (Team 1)
  f22.parked = false;
  f22.fuel = f22.def.fuelMax;
  f22.jet = { home: stands[1].id, ready: true, phase: 'air', alt: 1 };
  f22.order = { type: 'move', x: z.x, y: z.y, targetId: null };
  for (let k = 0; k < 40 && u.alive && u.hp > 0 && u.hp === u.maxHp; k++) {
    run(g, 1);
    g.fog[0].revealAll?.();
  }
  assert.ok(u.hp < u.maxHp || !u.alive, 'F-22 greift die U-2 an');
});

test('U-2 am Boden ist verwundbar wie ein Jet; in der Luft zählt die F-22 nicht als Bodenziel', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g);
  const u = buildU2(g, stands[0]);
  assert.equal(jetGrounded(u), true);
  assert.equal(isHighAlt(u), false, 'am Boden nicht hochfliegend');
  const tank = g.spawnUnit('tank', 1, u.x + 120, u.y);
  tank.hp = 1e6;
  g.fog[0].revealAll?.();
  run(g, 20);
  assert.ok(u.hp < u.maxHp, `Panzer trifft die U-2 am Stellplatz (HP ${u.hp.toFixed(0)})`);
});

test('U-2: Sicht in der Luft 1800, am Boden 300', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g);
  const u = buildU2(g, stands[0]);
  assert.equal(sightOf(u), 300, 'am Boden normale Sicht');
  const z = g.zone;
  airborne(g, u, z.x, z.y);
  assert.equal(sightOf(u), 1800, 'in der Luft große Sicht');
  g.fog[0].update(g, 0);
  assert.ok(g.fog[0].isVisible(z.x + 1000, z.y), 'Nebel lichtet sich bis 1000 px in der Luft');
});

test('U-2: kreist am Ziel und fliegt erst bei Treibstoffmangel heim, nicht sofort (keine Waffen = nicht leer)', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g);
  const u = buildU2(g, stands[0]);
  const z = g.zone;
  airborne(g, u, z.x, z.y);
  u.order = { type: 'move', x: z.x, y: z.y, targetId: null };
  run(g, 30);
  assert.ok(u.alive && !u.jet.rtb, 'kreist am Ziel, kein Heimflug bei vollem Tank');
  assert.ok(!u.parked);
  u.fuel = 12; // nur noch für den Heimweg
  run(g, 3);
  assert.ok(u.jet.rtb, 'bei Treibstoffmangel Heimflug');
});

test('KI kauft F-16 und F-22 nach CITY.ai.f22Share, die U-2 erst ab reconFrom', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g);
  const ai = new AI(g, 0, 'normal');
  const tick = () => {
    const s = ai.snapshot();
    ai.jets(s);
    ai.recon(s);
  };
  // Kampfflugzeuge: erst F-16, dann F-22 (Anteil CITY.ai.f22Share)
  for (let k = 0; k < 120; k++) {
    run(g, 1);
    tick();
  }
  const fighters = [...g.units.filter((u) => u.alive && u.team === 0 && u.def.jet && !u.def.highAlt).map((u) => u.type), ...stands.flatMap((s) => s.queue.map((e) => e.unit))];
  assert.ok(fighters.includes('f16'), 'F-16 gekauft');
  assert.ok(fighters.includes('f22'), `F-22 gekauft (Anteil ${CITY.ai.f22Share}): ${fighters.join(' ')}`);
  // U-2: erst ab reconFrom, mit einem ganz freien Stellplatz; die beiden Stellplätze sind nun mit Jets belegt
  assert.ok(!g.units.some((u) => u.alive && u.def.highAlt), 'noch keine U-2 vor dem Stellplatz-Zeitpunkt');
});

test('KI: U-2 zur Aufklärung ab reconFrom auf freiem Stellplatz, dann Flug (höchstens eine gleichzeitig)', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g);
  const ai = new AI(g, 0, 'normal');
  const tick = () => {
    const s = ai.snapshot();
    ai.recon(s);
  };
  const from = CITY.ai.reconFrom.normal;
  for (let k = 0; k < (from - 20) / 1; k++) {
    run(g, 1);
    tick();
  }
  assert.ok(!g.units.some((u) => u.alive && u.def.highAlt) && !stands.some((s) => s.queue.length), 'vor reconFrom keine U-2');
  let u = null;
  for (let k = 0; k < 200 && !u; k++) {
    run(g, 1);
    tick();
    u = g.units.find((x) => x.alive && x.def.highAlt && x.parked && x.jet?.ready) ?? null;
  }
  assert.ok(u, 'U-2 gebaut und startbereit');
  run(g, 1);
  tick();
  assert.equal(u.order.type, 'move', 'Aufklärungsflug befohlen');
  const count = g.units.filter((x) => x.alive && x.def.highAlt).length + stands.reduce((n, s) => n + s.queue.filter((e) => e.unit === 'u2').length, 0);
  assert.equal(count, 1, 'höchstens eine U-2');
  for (let k = 0; k < 60; k++) {
    run(g, 1);
    tick();
  }
  assert.ok(!u.parked && u.alive, 'U-2 ist unterwegs');
  assert.ok(g.units.filter((x) => x.alive && x.def.highAlt).length === 1, 'weiterhin höchstens eine');
});
