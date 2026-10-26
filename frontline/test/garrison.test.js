// Häuserkampf: Stadthäuser besetzen, Schutz, Schießen aus dem Fenster, Einsturz, Verlassen, Zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { hit, shotDamage } from '../js/game/combat.js';
import { UNITS } from '../js/data/units.js';
import { BALANCE } from '../js/data/balance.js';

const G = BALANCE.garrison;
const DT = 1 / BALANCE.tickRate;

/** Leere Karte mit Häusern; ohne Startunits (nur die Haupt-FOBs bleiben). */
function townGame(buildings) {
  const map = createEmptyMap('Stadt');
  map.town.buildings.push(...buildings);
  const g = new Game({ map });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  return g;
}

const run = (g, s) => {
  for (let i = 0; i < Math.round(s / DT); i++) g.update(DT);
};
const passable = (g, u) => g.grid.passable(g.grid.toCell(u.x), g.grid.toCell(u.y), u.team);

test('Häuser: aus Wohnhäusern, Hallen, Fabriken und Bahnhöfen, mit negativen IDs; Mauern, Türme und Züge nicht', () => {
  const g = new Game({ seed: 3 });
  assert.ok(g.houses.length > 50, `${g.houses.length} Häuser`);
  for (const h of g.houses) {
    assert.ok(h.id < 0 && g.getEntity(h.id) === h);
    assert.ok(G.kinds[h.type], h.type);
    assert.equal(h.team, -1);
    assert.equal(g.houseBySrc.get(h.src), h);
  }
  const kinds = new Set(g.houses.map((h) => h.type));
  for (const k of ['wall', 'tower', 'train', 'platform']) assert.ok(!kinds.has(k), k);
  // Einheiten- und Gebäude-IDs beginnen weiter bei 1
  assert.equal(Math.min(...g.buildings.map((b) => b.id)), 1);
});

test('Besetzen: Infanterie geht hinein, steht in der Mitte, Fahrzeuge nicht; volles Haus nimmt nur so viele, wie Plätze frei sind', () => {
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  const men = [0, 1, 2, 3, 4, 5].map((i) => g.spawnUnit('rifleman', 0, 2900 + i * 30, 3200));
  const tank = g.spawnUnit('tank', 0, 3100, 3250);
  assert.equal(g.issue(0, { type: 'garrison', ids: [tank.id], houseId: h.id }).ok, false);
  const r = g.issue(0, { type: 'garrison', ids: men.map((u) => u.id), houseId: h.id });
  assert.equal(r.ok, true);
  assert.equal(r.count, G.kinds.house.cap);
  run(g, 8);
  const inside = men.filter((u) => u.house === h.id);
  assert.equal(inside.length, G.kinds.house.cap);
  assert.equal(h.occupants.length, G.kinds.house.cap);
  assert.equal(h.team, 0);
  for (const u of inside) assert.deepEqual([u.x, u.y], [h.x, h.y]);
  for (const u of men.filter((m) => !m.house)) assert.ok(passable(g, u), 'die übrigen warten draußen');
  assert.equal(g.issue(0, { type: 'garrison', ids: men.filter((m) => !m.house).map((u) => u.id), houseId: h.id }).reason, 'Gebäude ist voll');
  // Gegner kommt nicht hinein
  const foe = g.spawnUnit('rifleman', 1, 3000, 2800);
  assert.equal(g.issue(1, { type: 'garrison', ids: [foe.id], houseId: h.id }).ok, false);
});

test('Schutz: Gegner treffen das Haus statt der Besatzer; Handwaffen schwach, schwere Waffen stark', () => {
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  const def = g.spawnUnit('rifleman', 0, 3000, 3100);
  g.issue(0, { type: 'garrison', ids: [def.id], houseId: h.id });
  run(g, 4);
  assert.equal(def.house, h.id);
  def.weapons[0].rounds = 0; // schießt nicht zurück
  const foe = g.spawnUnit('rifleman', 1, 3000, 2830);
  run(g, 5);
  assert.equal(def.hp, def.maxHp, 'Besatzer unverletzt');
  assert.ok(h.hp < h.maxHp, 'Haus beschädigt');
  assert.equal(foe.targetId, h.id, 'Ziel ist das Haus');
  const rifle = UNITS.rifleman.weapons[0];
  const cannon = UNITS.tank.weapons[0];
  assert.equal(shotDamage(rifle, foe, h), rifle.damage.struct * G.lightMult);
  assert.equal(shotDamage(cannon, foe, h), cannon.damage.struct * G.heavyMult);
});

test('Aus dem Fenster: Besatzer schießen ab der Hauswand und stehen höher', () => {
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  const def = g.spawnUnit('rifleman', 0, 3000, 3100);
  g.issue(0, { type: 'garrison', ids: [def.id], houseId: h.id });
  run(g, 4);
  const range = UNITS.rifleman.weapons[0].range;
  const foe = g.spawnUnit('rifleman', 1, 3000, 3000 + range + h.reach - 10); // außerhalb der Reichweite von der Hausmitte
  foe.weapons[0].rounds = 0;
  run(g, 3);
  assert.ok(foe.hp < foe.maxHp, 'Treffer aus dem Fenster');
});

test('Einsturz: Besatzer fallen verletzt heraus, die Ruine kann niemand mehr besetzen', () => {
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  const men = [0, 1].map((i) => g.spawnUnit('rifleman', 0, 2980 + i * 40, 3100));
  g.issue(0, { type: 'garrison', ids: men.map((u) => u.id), houseId: h.id });
  run(g, 5);
  assert.equal(h.occupants.length, 2);
  hit(g, h, h.maxHp + 1);
  assert.equal(h.alive, false);
  assert.equal(h.ruined, true);
  assert.equal(h.team, -1);
  for (const u of men) {
    assert.equal(u.house, 0);
    assert.ok(passable(g, u), 'draußen');
    assert.ok(Math.abs(u.hp - u.maxHp * (1 - G.ejectDamage)) < 1e-9);
  }
  assert.equal(g.issue(0, { type: 'garrison', ids: [men[0].id], houseId: h.id }).ok, false);
  assert.equal(g.grid.passable(g.grid.toCell(h.x), g.grid.toCell(h.y), 0), false, 'Ruine versperrt weiter');
});

test('Verlassen: Aussteigen-Befehl und jeder Marschbefehl führen hinaus; leeres Haus gehört niemandem', () => {
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  const men = [0, 1, 2].map((i) => g.spawnUnit('rifleman', 0, 2960 + i * 40, 3100));
  g.issue(0, { type: 'garrison', ids: men.map((u) => u.id), houseId: h.id });
  run(g, 5);
  assert.equal(h.occupants.length, 3);
  assert.equal(g.issue(0, { type: 'ungarrison', ids: [men[0].id] }).ok, true);
  assert.equal(men[0].house, 0);
  assert.ok(passable(g, men[0]));
  assert.equal(g.issue(0, { type: 'move', ids: [men[1].id, men[2].id], x: 3600, y: 3000 }).ok, true);
  assert.equal(h.occupants.length, 0);
  assert.equal(h.team, -1);
  run(g, 15);
  assert.ok(men[1].x > 3400 && men[2].x > 3400, 'marschiert los');
});

test('Zone: Besatzer eines Hauses in der Konfliktzone zählen mit', () => {
  const Z = { x: BALANCE.map.width / 2, y: BALANCE.map.height / 2 };
  const g = townGame([{ x: Z.x + 200, y: Z.y, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  const men = [0, 1].map((i) => g.spawnUnit('rifleman', 0, Z.x + 180 + i * 40, Z.y + 100));
  g.issue(0, { type: 'garrison', ids: men.map((u) => u.id), houseId: h.id });
  run(g, 5);
  assert.equal(h.occupants.length, 2);
  assert.equal(g.zone.counts[0], 2);
  assert.equal(g.zone.owner, 0);
});

test('Tod im Haus: wer im Haus stirbt, verschwindet aus der Besatzung', () => {
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  const u = g.spawnUnit('rifleman', 0, 3000, 3100);
  g.issue(0, { type: 'garrison', ids: [u.id], houseId: h.id });
  run(g, 4);
  assert.equal(h.team, 0);
  u.hp = 0;
  g.update(DT);
  assert.equal(h.occupants.length, 0);
  assert.equal(h.team, -1);
});

test('KI besetzt Häuser in der Zone; Besatzung und Häuser bleiben stimmig (Seed 3, 8 min)', async () => {
  const { AI } = await import('../js/ai/ai.js');
  const g = new Game({ seed: 3 });
  const ais = [new AI(g, 0, 'normal'), new AI(g, 1, 'normal')];
  const housed = [0, 0];
  for (let i = 0; i < Math.round((8 * 60) / DT) && g.winner === null; i++) {
    ais[0].update(DT);
    ais[1].update(DT);
    g.update(DT);
    if (i % 40) continue;
    for (const u of g.units) {
      if (!u.house) continue;
      housed[u.team]++;
      const h = g.entities.get(u.house);
      assert.ok(h && h.alive && h.occupants.includes(u) && h.team === u.team, 'Besatzer gehört zu seinem Haus');
      assert.deepEqual([u.x, u.y], [h.x, h.y]);
    }
    for (const h of g.houses) {
      assert.ok(h.occupants.length <= h.def.cap);
      assert.equal(h.team, h.occupants.length ? h.occupants[0].team : -1);
      for (const u of h.occupants) assert.ok(u.alive && u.house === h.id && u.team === h.team);
    }
  }
  assert.ok(housed[0] + housed[1] > 0, `besetzt: ${housed}`);
});
