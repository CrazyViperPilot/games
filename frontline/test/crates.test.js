// Versorgungskisten: Aufheben, Tragen, Einlagern, Einkommen, Ablegen, Verlust bei Tod des Trägers und Fall der FOB, Karte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap, normalizeMap } from '../js/game/mapdata.js';
import { generateMap } from '../js/game/map.js';
import { storedCrates } from '../js/game/crates.js';
import { BALANCE } from '../js/data/balance.js';

const C = BALANCE.crates;
const DT = 1 / BALANCE.tickRate;
const W = BALANCE.map.width;
const H = BALANCE.map.height;

/** Leere Karte mit Kisten; ohne Startunits (nur die Haupt-FOBs bleiben). */
function crateGame(crates) {
  const map = createEmptyMap('Kisten');
  map.crates = crates;
  const g = new Game({ map });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  return g;
}

const run = (g, s, until = () => false) => {
  for (let i = 0; i < Math.round(s / DT) && !until(); i++) g.update(DT);
};

test('Karte: Kistenpaare punktsymmetrisch, abseits von Zone und Startpunkten; normalizeMap behält sie, ältere Karten haben keine', () => {
  for (const seed of [1, 3, 8]) {
    const m = generateMap(seed);
    assert.equal(m.crates.length, 2 * C.pairs, `Seed ${seed}`);
    for (let i = 0; i < m.crates.length; i += 2) {
      const [a, b] = [m.crates[i], m.crates[i + 1]];
      assert.deepEqual([a.x + b.x, a.y + b.y], [W, H], 'Spiegelbild');
      assert.ok(Math.hypot(a.x - m.zone.x, a.y - m.zone.y) > m.zone.r, 'außerhalb der Zone');
      for (const s of m.spawns) assert.ok(Math.hypot(a.x - s.x, a.y - s.y) > 1000, 'weit weg vom Start');
    }
    assert.deepEqual(normalizeMap(m).crates, m.crates);
  }
  assert.deepEqual(normalizeMap({ ...createEmptyMap(), crates: undefined }).crates, []);
});

test('Spiel: Kisten sind neutrale Entities (team −1) mit negativen IDs, getrennt von den Häusern', () => {
  const g = new Game({ seed: 3 });
  assert.equal(g.crates.length, 2 * C.pairs);
  for (const c of g.crates) {
    assert.ok(c.id < -1000 && g.getEntity(c.id) === c);
    assert.equal(c.team, -1);
    assert.equal(c.state, 'ground');
    assert.ok(g.grid.free(g.grid.toCell(c.x), g.grid.toCell(c.y)), 'auf freiem Boden');
  }
  assert.ok(!g.houses.some((h) => g.crates.some((c) => c.id === h.id)));
});

test('Aufheben und Einlagern: der nächste Soldat holt die Kiste, geht langsamer, schießt nicht und bringt sie zur FOB; sie zahlt Geld', () => {
  const home = { x: 700, y: H - 700 };
  const g = crateGame([{ x: home.x + 900, y: home.y - 200 }]);
  const c = g.crates[0];
  const near = g.spawnUnit('rifleman', 0, c.x - 150, c.y);
  const far = g.spawnUnit('rifleman', 0, c.x - 400, c.y);
  const tank = g.spawnUnit('tank', 0, c.x - 200, c.y + 80);
  assert.equal(g.issue(0, { type: 'pickup', ids: [tank.id], crateId: c.id }).reason, 'Nur Infanterie trägt Kisten');
  const r = g.issue(0, { type: 'pickup', ids: [far.id, near.id], crateId: c.id });
  assert.equal(r.ok, true);
  assert.equal(r.id, near.id);
  assert.equal(far.order.type, 'move', 'Begleitschutz');
  run(g, 10, () => near.crate);
  assert.equal(near.crate, c.id);
  assert.equal(c.state, 'carried');
  assert.equal(c.holder, 0);
  assert.equal(near.order.type, 'deliver');
  // langsamer und ohne Feuer (Begleitschutz und Panzer aus dem Spiel, die würden schießen)
  far.alive = false;
  tank.alive = false;
  g.update(DT);
  assert.ok(Math.abs(near.speedMul - C.carrySpeed) < 1e-9);
  const foe = g.spawnUnit('rifleman', 1, near.x + 60, near.y);
  foe.weapons[0].rounds = 0;
  const hp = foe.hp;
  run(g, 2);
  assert.equal(foe.hp, hp, 'Träger schießt nicht');
  assert.equal(g.issue(0, { type: 'attack', ids: [near.id], targetId: foe.id }).reason, 'Kistenträger schießen nicht');
  foe.alive = false;
  // Einlagern in der Haupt-FOB
  run(g, 60, () => c.state === 'stored');
  const fob = g.mainFob(0);
  assert.equal(c.state, 'stored');
  assert.equal(c.fobId, fob.id);
  assert.equal(near.crate, 0);
  assert.equal(storedCrates(g, 0), 1);
  // Einkommen: +income je s (KI-Faktor 1)
  const t = g.teams[0];
  const m0 = t.res.money;
  run(g, 10);
  assert.ok(Math.abs(t.res.money - m0 - 10 * C.income) < 0.5, `${t.res.money - m0}`);
  assert.ok(t.rate.money >= C.income - 1e-9);
});

test('Träger fällt: die Kiste liegt am Boden und der Gegner kann sie aufheben', () => {
  const g = crateGame([{ x: 3000, y: 3000 }]);
  const c = g.crates[0];
  const u = g.spawnUnit('rifleman', 0, 3000, 3000);
  g.issue(0, { type: 'pickup', ids: [u.id], crateId: c.id });
  run(g, 2, () => u.crate);
  assert.equal(c.state, 'carried');
  run(g, 3);
  const at = { x: u.x, y: u.y };
  u.hp = 0;
  g.update(DT);
  g.update(DT);
  assert.equal(c.state, 'ground');
  assert.equal(c.holder, -1);
  assert.ok(Math.hypot(c.x - at.x, c.y - at.y) < 40, 'wo der Träger fiel');
  const foe = g.spawnUnit('rifleman', 1, c.x + 100, c.y);
  assert.equal(g.issue(1, { type: 'pickup', ids: [foe.id], crateId: c.id }).ok, true);
  run(g, 5, () => foe.crate);
  assert.equal(foe.crate, c.id);
  assert.equal(c.holder, 1);
});

test('FOB fällt: ihre Kisten liegen wieder am Boden und zahlen nichts mehr', () => {
  const g = crateGame([{ x: 3000, y: 3000 }, { x: 3200, y: 3000 }]);
  const fob = g.spawnBuilding('fob', 0, g.grid.toCell(3100) - 1, g.grid.toCell(3300) - 1, { built: true });
  const men = [0, 1].map((i) => g.spawnUnit('rifleman', 0, 3000 + i * 200, 3060));
  men.forEach((u, i) => g.issue(0, { type: 'pickup', ids: [u.id], crateId: g.crates[i].id }));
  run(g, 30, () => g.crates.every((c) => c.state === 'stored'));
  assert.ok(g.crates.every((c) => c.state === 'stored' && c.fobId === fob.id), 'zur nächsten FOB, nicht zur Haupt-FOB');
  assert.equal(storedCrates(g, 0, fob.id), 2);
  fob.hp = 0;
  g.update(DT);
  g.update(DT);
  for (const c of g.crates) {
    assert.equal(c.state, 'ground');
    assert.ok(g.grid.free(g.grid.toCell(c.x), g.grid.toCell(c.y)));
  }
  assert.equal(storedCrates(g, 0), 0);
});

test('Ablegen, keine Häuser und keine Fahrzeuge mit Kiste; untätige Träger bringen sie von selbst zur FOB', () => {
  const map = createEmptyMap('Kisten');
  map.crates = [{ x: 3000, y: 3000 }];
  map.town.buildings.push({ x: 3000, y: 3200, w: 96, h: 76, kind: 'house' });
  const g = new Game({ map });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  const c = g.crates[0];
  const u = g.spawnUnit('rifleman', 0, 2950, 3000);
  const heli = g.spawnUnit('transporter', 0, 2900, 2900);
  g.issue(0, { type: 'pickup', ids: [u.id], crateId: c.id });
  run(g, 3, () => u.crate);
  assert.equal(u.crate, c.id);
  assert.equal(g.issue(0, { type: 'garrison', ids: [u.id], houseId: g.houses[0].id }).ok, false);
  assert.equal(g.issue(0, { type: 'board', ids: [u.id], heliId: heli.id }).ok, false);
  assert.equal(g.issue(0, { type: 'dropCrate', ids: [u.id] }).ok, true);
  assert.equal(u.crate, 0);
  assert.equal(c.state, 'ground');
  run(g, 2);
  assert.equal(c.state, 'ground', 'bleibt liegen');
  // wieder aufheben, dann anhalten: untätig bringt er sie trotzdem zur FOB
  g.issue(0, { type: 'pickup', ids: [u.id], crateId: c.id });
  run(g, 3, () => u.crate);
  g.issue(0, { type: 'stop', ids: [u.id] });
  g.update(DT);
  assert.equal(u.order.type, 'deliver');
});

test('KI holt Kisten und lagert sie ein (Seed 3, 10 min); Kisten bleiben stimmig', async () => {
  const { AI } = await import('../js/ai/ai.js');
  const g = new Game({ seed: 3 });
  const ais = [new AI(g, 0, 'normal'), new AI(g, 1, 'normal')];
  let picked = 0;
  for (let i = 0; i < Math.round((10 * 60) / DT) && g.winner === null; i++) {
    ais[0].update(DT);
    ais[1].update(DT);
    g.update(DT);
    if (i % 40) continue;
    for (const c of g.crates) {
      if (c.state === 'carried') {
        const u = g.entities.get(c.carrier);
        assert.ok(u && u.crate === c.id && u.team === c.holder, 'Träger trägt seine Kiste');
        picked++;
      }
      if (c.state === 'stored') assert.ok(g.entities.get(c.fobId)?.team === c.holder);
      if (c.state === 'ground') assert.equal(c.holder, -1);
    }
    for (const u of g.units) if (u.crate) assert.equal(g.entities.get(u.crate).carrier, u.id);
  }
  assert.ok(picked > 0, 'KI trägt Kisten');
  assert.ok(storedCrates(g, 0) + storedCrates(g, 1) > 0, 'KI lagert Kisten ein');
});
