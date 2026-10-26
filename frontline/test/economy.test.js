import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';

const DT = 0.05;
const TILE = BALANCE.map.tile;
const mk = (opts) => classic(new Game(opts));

/** Test ohne Einheitenlimit (Startarmee füllt die 50 Plätze schon). */
const roomy = (fn) => () => {
  const cap = BALANCE.slotCap;
  BALANCE.slotCap = 1000;
  try {
    fn();
  } finally {
    BALANCE.slotCap = cap;
  }
};

function run(game, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) game.update(DT);
}

function fobOf(game, t) {
  return game.buildings.find((b) => b.alive && b.team === t && b.type === 'fob' && b.built);
}

function unitsOf(game, t, type = null) {
  return game.units.filter((u) => u.alive && u.team === t && (!type || u.type === type));
}

test('Zonengeld: jede Einheit in der Zone bringt 0,4 Geld/s, ohne Führungsgeld', () => {
  const g = mk({ seed: 7 });
  const z = g.zone;
  g.spawnUnit('rifleman', 0, z.x + 2000, z.y); // weit weg von der Hot Zone (Mitte)
  const m0 = g.teams[0].res.money;
  run(g, 10);
  assert.equal(g.zone.owner, 0);
  assert.ok(Math.abs(g.teams[0].res.money - m0 - 4) < 1e-6, `Geld ${g.teams[0].res.money - m0} statt 4`);
  assert.ok(Math.abs(g.teams[0].rate.money - 0.4) < 1e-9, 'Rate 0,4/s');
});

test('Hot Zone: Einheit darin bringt 0,8 Geld/s (das Doppelte, nicht 1,2)', () => {
  const g = mk({ seed: 7 });
  const z = g.zone;
  const hz = g.hot;
  const u = g.spawnUnit('rifleman', 0, z.x, z.y);
  u.order = { type: 'idle', x: u.x, y: u.y, targetId: null };
  const m0 = g.teams[0].res.money;
  for (let i = 0; i < Math.round(10 / DT); i++) {
    hz.x = u.x; // Hot Zone bleibt über der Einheit
    hz.y = u.y;
    g.update(DT);
  }
  assert.equal(g.hot.owner, 0);
  assert.ok(Math.abs(g.teams[0].res.money - m0 - 8) < 1e-6, `Geld ${g.teams[0].res.money - m0} statt 8`);
  assert.ok(Math.abs(g.teams[0].rate.money - 0.8) < 1e-9, 'Rate 0,8/s');
});

test('Zonengeld: beide Teams verdienen gleichzeitig, auch umkämpft; kein Punkt', () => {
  const g = mk({ seed: 7 });
  const z = g.zone;
  g.spawnUnit('rifleman', 0, z.x - 1000, z.y);
  g.spawnUnit('rifleman', 1, z.x + 1000, z.y);
  const m0 = [g.teams[0].res.money, g.teams[1].res.money];
  run(g, 10);
  assert.equal(g.zone.contested, true);
  assert.equal(g.zone.owner, -1);
  assert.ok(Math.abs(g.teams[0].res.money - m0[0] - 4) < 1e-6, 'Team 0 verdient');
  assert.ok(Math.abs(g.teams[1].res.money - m0[1] - 4) < 1e-6, 'Team 1 verdient');
  assert.equal(g.teams[0].points + g.teams[1].points, 0);
});

test('Zonengeld: kein Deckel – 40 Einheiten in der Zone bringen 16 Geld/s', () => {
  const g = mk({ seed: 7 });
  const z = g.zone;
  for (let i = 0; i < 40; i++) {
    g.spawnUnit('rifleman', 0, z.x + 2000 + (i % 8) * 20, z.y + Math.floor(i / 8) * 20);
  }
  g.update(DT);
  assert.ok(Math.abs(g.teams[0].rate.money - 16) < 1e-9, `Rate ${g.teams[0].rate.money}`);
  assert.equal(g.zone.counts[0], 40);
});

test('Start: 37 Einheiten je Team (LKW, Baufahrzeug, 2 MBT, 3 SPz, 22 Schützen, 7 Panzerabwehrsoldaten, Kommandeur) = 50 Plätze', () => {
  assert.equal(BALANCE.startUnits.length, 37);
  const g = mk({ seed: 7 });
  for (let t = 0; t < 2; t++) {
    assert.equal(unitsOf(g, t).length, 37);
    assert.equal(unitsOf(g, t, 'commander').length, 1, 'Kommandeur belegt keinen Platz');
    assert.equal(unitsOf(g, t, 'truck').length, 1);
    assert.equal(unitsOf(g, t, 'engineer').length, 1);
    assert.equal(unitsOf(g, t, 'tank').length, 2);
    assert.equal(unitsOf(g, t, 'ifv').length, 3);
    assert.equal(unitsOf(g, t, 'rifleman').length, 22);
    assert.equal(unitsOf(g, t, 'at').length, 7);
    assert.equal(g.slotsUsed(t), BALANCE.slotCap);
    assert.equal(g.teams[t].res.money, BALANCE.startRes.money, 'Startgeld unverändert');
  }
});

test('Startaufstellung: keine Einheit auf unpassierbarer Zelle, keine Überlappung, vorn zur Zone', () => {
  for (const seed of [1, 7, 42]) {
    const g = mk({ seed });
    for (let t = 0; t < 2; t++) {
      const us = unitsOf(g, t);
      for (const u of us) {
        assert.ok(g.grid.passable(Math.floor(u.x / TILE), Math.floor(u.y / TILE), t), `seed ${seed}: Einheit ${u.type} unpassierbar`);
      }
      for (let i = 0; i < us.length; i++) {
        for (let j = i + 1; j < us.length; j++) {
          const a = us[i];
          const b = us[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          assert.ok(d >= 0.5 * (a.def.radius + b.def.radius), `seed ${seed}: Überlappung ${d.toFixed(1)} px`);
          assert.ok(d >= a.def.radius + b.def.radius, `seed ${seed}: Einheiten berühren sich (${d.toFixed(1)} px)`);
        }
      }
      const f = fobOf(g, t);
      const dz = (x, y) => Math.hypot(x - g.zone.x, y - g.zone.y);
      const mean = us.reduce((n, u) => n + dz(u.x, u.y), 0) / us.length;
      assert.ok(mean < dz(f.x, f.y), `seed ${seed}: Formation liegt vor der FOB`);
    }
  }
});

test('Ausbildung: zwei Einträge werden gleichzeitig ausgebildet, je mit eigenem Fortschritt', roomy(() => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const bt = UNITS.rifleman.buildTime;
  const before = unitsOf(g, 0, 'rifleman').length;
  const m0 = g.teams[0].res.money;
  for (let i = 0; i < 3; i++) assert.equal(g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' }).ok, true);
  assert.equal(g.teams[0].res.money, m0 - 3 * UNITS.rifleman.cost.money);

  run(g, bt / 2);
  assert.ok(Math.abs(f.queueTimes[0] - bt / 2) < 0.1, 'Platz 1 läuft');
  assert.ok(Math.abs(f.queueTimes[1] - bt / 2) < 0.1, 'Platz 2 läuft gleichzeitig');
  assert.equal(f.queueTimes[2], 0, 'dritter Eintrag wartet');

  run(g, bt / 2 + 0.2);
  assert.equal(unitsOf(g, 0, 'rifleman').length, before + 2, 'zwei fertig nach einer Bauzeit');
  assert.equal(f.queue.length, 1);
  assert.equal(f.queueTimes.length, 1);

  run(g, bt + 0.2);
  assert.equal(unitsOf(g, 0, 'rifleman').length, before + 3);
  assert.equal(f.queue.length, 0);
  assert.equal(f.queueTimes.length, 0);
}));

test('Ausbildung: Abbrechen erstattet den letzten Auftrag, der laufende behält seinen Fortschritt', roomy(() => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' });
  g.issue(0, { type: 'train', buildingId: f.id, unit: 'at' });
  run(g, 2);
  const m0 = g.teams[0].res.money;
  assert.equal(g.issue(0, { type: 'cancelTrain', buildingId: f.id }).ok, true);
  assert.equal(g.teams[0].res.money - m0, UNITS.at.cost.money, 'Panzerabwehrsoldat erstattet');
  assert.equal(f.queue.length, 1);
  assert.equal(f.queue[0].unit, 'rifleman');
  assert.equal(f.queueTimes.length, 1);
  assert.ok(Math.abs(f.queueTimes[0] - 2) < 0.1, `Fortschritt ${f.queueTimes[0]}`);
}));

test('KI: setzt die Startarmee sofort ein, die Reserve bleibt an der Haupt-FOB', () => {
  const g = mk({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  ai.update(DT); // erster Denkschritt sofort
  const combat = unitsOf(g, 1).filter((u) => u.def.range > 0 && !u.def.hero); // der Kommandeur bleibt hinter der Armee
  const moving = combat.filter((u) => u.order.type === 'attackMove');
  assert.equal(combat.length, 34);
  assert.ok(moving.length >= 0.75 * combat.length, `${moving.length} von ${combat.length} rücken aus`);
  assert.ok(moving.length < combat.length, 'Reserve bleibt zurück');
  const home = fobOf(g, 1);
  const reserve = combat.filter((u) => u.order.type !== 'attackMove');
  for (const u of reserve) {
    const dh = Math.hypot(u.x - home.x, u.y - home.y);
    assert.ok(dh < 400, `Reserve ${dh.toFixed(0)} px von der Haupt-FOB`);
  }
});

test('Nachschub: nach 6 s bei unter 29 Soldaten, ein Schütze kostenlos an der Haupt-FOB', () => {
  const g = mk({ seed: 7 });
  for (const u of unitsOf(g, 0, 'rifleman').slice(0, 5)) u.alive = false;
  assert.equal(g.soldierCount(0), 24);
  const before = unitsOf(g, 0, 'rifleman').length;
  const m0 = g.teams[0].res.money;
  run(g, 5.9);
  assert.equal(unitsOf(g, 0, 'rifleman').length, before, 'vor 6 s noch keiner');
  run(g, 0.5);
  assert.equal(unitsOf(g, 0, 'rifleman').length, before + 1, 'ein Schütze nach 6 s');
  assert.equal(g.teams[0].res.money, m0, 'kostenlos');
  assert.equal(g.soldierCount(0), 25);
});

test('Nachschub: keiner bei 29 Soldaten', () => {
  const g = mk({ seed: 7 });
  assert.equal(g.soldierCount(0), BALANCE.reinforce.soldierMin);
  const before = unitsOf(g, 0).length;
  run(g, 20);
  assert.equal(g.soldierCount(0), 29);
  assert.equal(unitsOf(g, 0).length, before);
});

test('Nachschub: keiner ohne lebende Haupt-FOB', () => {
  const g = mk({ seed: 7 });
  g.mainFob(0).alive = false;
  for (const u of unitsOf(g, 0, 'rifleman').slice(0, 5)) u.alive = false;
  const before = g.soldierCount(0);
  run(g, 12);
  assert.equal(g.soldierCount(0), before, 'kein Nachschub');
  assert.equal(g.teams[0].reinforceTimer, 0);
});

test('soldierCount: zählt Passagiere in Fahrzeugen und Infanterie in der Warteschlange', roomy(() => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  assert.equal(g.soldierCount(0), 29);
  const heli = g.spawnUnit('littlebird', 0, f.x + 150, f.y - 150);
  const man = unitsOf(g, 0, 'rifleman')[0];
  man.alive = false;
  heli.passengers.push(man);
  assert.equal(g.soldierCount(0), 29, 'Passagier zählt');
  assert.equal(g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' }).ok, true);
  assert.equal(g.issue(0, { type: 'train', buildingId: f.id, unit: 'at' }).ok, true);
  assert.equal(g.soldierCount(0), 31, 'Warteschlange zählt (Schütze und Panzerabwehrsoldat)');
}));

test('Einheitenlimit: 50 Plätze, MBT belegt 5, SPz 3; Ausbildung wird abgelehnt, Tod gibt Plätze frei', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  assert.equal(UNITS.tank.slots, 5);
  assert.equal(UNITS.ifv.slots, 3);
  g.teams[0].res.money = 5000;
  let r = g.issue(0, { type: 'train', buildingId: f.id, unit: 'tank' });
  assert.equal(r.ok, false);
  assert.match(r.reason || r.error || JSON.stringify(r), /limit/i);
  unitsOf(g, 0, 'tank')[0].alive = false; // 5 Plätze frei
  assert.equal(g.issue(0, { type: 'train', buildingId: f.id, unit: 'tank' }).ok, true);
  assert.equal(g.slotsUsed(0), 50);
  assert.equal(g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' }).ok, false);
});
