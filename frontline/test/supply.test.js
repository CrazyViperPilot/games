// Versorgung der Ausbildungsgebäude über das Straßennetz (Paket „Straßen“, Teil 2, PRD §15 „Straßentransport“): Kaserne, Fabrikhalle,
// Heliport und Stellplatz bilden nur so schnell aus, wie ihr Straßenweg zum Lager der Hauptstadt es erlaubt (Versorgungsgrad nach der
// Weglänge × Stau); ohne Weg steht die Ausbildung. Jeder laufende Platz legt Stahl je s als Last auf den Weg.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { UNITS } from '../js/data/units.js';
import { KIND_ID } from '../js/data/citykinds.js';
import { supplyOf, trainRate, transportOf } from '../js/game/transport.js';
import { cityTrainers, trainersOf } from '../js/game/city/query.js';
import { rebuildList } from '../js/game/city/state.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { pack, unpack } from '../js/core/snapshot.js';

const DT = 0.1;
const run = (g, s) => {
  for (let k = 0; k < Math.round(s / DT); k++) g.update(DT);
};
const rich = (g, t = 0) => {
  g.teams[t].res.money = 1e6;
  g.city[t].metal = 5000;
  g.city[t].popF = 500;
};
const trainerFor = (g, unit, t = 0) => cityTrainers(g, t).find((e) => e.produces.includes(unit));

/** Erwarteter Versorgungsgrad nach der Formel aus CITY.supply. */
const grade = (d) => Math.max(CITY.supply.min, 1 - CITY.supply.perCell * Math.max(0, d - CITY.supply.free));

test('Formel: bis 15 Zellen 100 %, bei 40 85 %, bei 80 61 %, ab 132 die Untergrenze 30 %', () => {
  assert.equal(grade(1), 1);
  assert.equal(grade(15), 1);
  assert.ok(Math.abs(grade(40) - 0.85) < 1e-9);
  assert.ok(Math.abs(grade(80) - 0.61) < 1e-9);
  assert.equal(grade(132), CITY.supply.min);
  assert.equal(grade(200), CITY.supply.min);
});

test('Startviertel: Kaserne und Fabrikhalle haben auf allen Seeds 1 bis 12 einen Straßenweg zum Lager', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const g = new Game({ seed, city: true, river: true });
    for (const c of g.city) {
      const list = [...trainersOf(c)];
      assert.ok(list.length >= 2, `Seed ${seed}: Startviertel mit Ausbildung`);
      for (const e of list) {
        const s = supplyOf(g, c, e.cityCell);
        assert.ok(s.path, `Seed ${seed} Team ${c.team}: Weg zum Lager`);
        assert.ok(Math.abs(s.v - grade(s.dist)) < 1e-9, 'Versorgungsgrad nach der Formel');
      }
    }
  }
});

test('mit Weg: Ausbildung im Tempo Versorgung × Stau; die Kaserne legt keine Last (Soldaten kosten keinen Stahl), die Fabrikhalle schon', () => {
  const g = new Game({ seed: 3, city: true });
  rich(g);
  const c = g.city[0];
  const kas = trainerFor(g, 'rifleman');
  const fab = trainerFor(g, 'tank');
  const s = supplyOf(g, c, kas.cityCell);
  assert.ok(s.path && s.rate > 0);
  assert.equal(trainRate(g, kas), s.rate);
  assert.ok(g.issue(0, { type: 'train', buildingId: kas.id, unit: 'rifleman' }).ok);
  run(g, 2);
  const want = 2 * supplyOf(g, c, kas.cityCell).rate;
  assert.ok(Math.abs(kas.queueTimes[0] - want) < 0.25, `Fortschritt ${kas.queueTimes[0].toFixed(2)} ≈ ${want.toFixed(2)}`);
  // Panzer: Stahl je s auf dem Weg der Fabrikhalle
  assert.ok(g.issue(0, { type: 'train', buildingId: fab.id, unit: 'tank' }).ok);
  run(g, 1);
  const tr = transportOf(g, c);
  const fp = supplyOf(g, c, fab.cityCell);
  const expect = (CITY.metalCost.tank / UNITS.tank.buildTime) * fp.rate;
  assert.ok(tr.load[fp.path[0]] >= expect * 0.9, `Last ${tr.load[fp.path[0]].toFixed(3)} ≥ ${expect.toFixed(3)}`);
});

test('ohne Weg: Ausbildung steht (Tempo 0), nach dem Anschluss geht sie weiter', () => {
  const g = new Game({ seed: 3, city: true });
  rich(g);
  const c = g.city[0];
  const kas = trainerFor(g, 'rifleman');
  const path = supplyOf(g, c, kas.cityCell).path;
  assert.ok(path);
  // Weg kappen: alle eigenen Straßen auf dem Weg entfernen (Zelle frei), dann neu rechnen lassen
  const cut = [...path].filter((i) => c.kind[i] === KIND_ID.road);
  assert.ok(cut.length > 0, 'eigene Straße auf dem Weg');
  for (const i of cut) c.kind[i] = 0;
  rebuildList(c);
  c.ver++;
  const s = supplyOf(g, c, kas.cityCell);
  assert.equal(s.path, null, 'kein Weg mehr');
  assert.equal(trainRate(g, kas), 0);
  assert.ok(g.issue(0, { type: 'train', buildingId: kas.id, unit: 'rifleman' }).ok, 'Auftrag geht (bezahlt wie bisher)');
  run(g, 5);
  assert.equal(kas.queueTimes[0], 0, 'kein Fortschritt ohne Weg');
  for (const i of cut) c.kind[i] = KIND_ID.road;
  rebuildList(c);
  c.ver++;
  run(g, 2);
  assert.ok(kas.queueTimes[0] > 0, 'mit Weg wieder Fortschritt');
});

test('Weglänge: längerer Weg, langsamere Ausbildung (über die Untergrenze nie unter 30 %)', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const kas = trainerFor(g, 'rifleman');
  const s = supplyOf(g, c, kas.cityCell);
  // Mit kleinem „free“ wirkt schon der kurze Weg des Startviertels
  const keep = { ...CITY.supply };
  try {
    CITY.supply.free = 0;
    CITY.supply.perCell = 0.2;
    const t = supplyOf(g, c, kas.cityCell);
    assert.ok(t.v < s.v || s.dist === 0);
    assert.ok(t.v >= CITY.supply.min);
    CITY.supply.perCell = 10;
    assert.equal(supplyOf(g, c, kas.cityCell).v, CITY.supply.min, 'Untergrenze');
  } finally {
    Object.assign(CITY.supply, keep);
  }
});

test('nah: Kaserne des Startviertels (Weg bis 15 Zellen, ohne Stau) bildet mit 100 % aus', () => {
  const g = new Game({ seed: 3, city: true });
  const kas = trainerFor(g, 'rifleman');
  const s = supplyOf(g, g.city[0], kas.cityCell);
  assert.ok(s.path && s.dist <= CITY.supply.free, `Weg ${s.dist} Zellen`);
  assert.equal(s.v, 1);
  assert.equal(s.eff, 1);
  assert.equal(trainRate(g, kas), 1);
});

test('ohne Stadt: Hauptstadt und FOBs bilden unverändert mit vollem Tempo aus', () => {
  const g = new Game({ seed: 3 });
  for (const b of g.buildings.filter((e) => e.produces?.length)) assert.equal(trainRate(g, b), 1);
});

test('Stau verlangsamt: Stau-Faktor auf dem Weg senkt das Tempo (Versorgung × Stau) und den Fortschritt', () => {
  const make = () => {
    const g = new Game({ seed: 3, city: true });
    rich(g);
    return g;
  };
  const free = make();
  const jam = make();
  const kasF = trainerFor(free, 'rifleman');
  const kasJ = trainerFor(jam, 'rifleman');
  const c = jam.city[0];
  const s0 = supplyOf(jam, c, kasJ.cityCell);
  const tr = transportOf(jam, c);
  for (const i of s0.path) tr.factor[i] = 0.4; // Stau auf dem ganzen Weg
  const s1 = supplyOf(jam, c, kasJ.cityCell);
  assert.ok(Math.abs(s1.eff - 0.4) < 1e-6);
  assert.ok(Math.abs(s1.rate - s0.v * 0.4) < 1e-6, 'Tempo = Versorgungsgrad × Stau');
  assert.ok(free.issue(0, { type: 'train', buildingId: kasF.id, unit: 'rifleman' }).ok);
  assert.ok(jam.issue(0, { type: 'train', buildingId: kasJ.id, unit: 'rifleman' }).ok);
  free.update(DT);
  jam.update(DT);
  assert.ok(kasF.queueTimes[0] > 0);
  assert.ok(kasJ.queueTimes[0] < kasF.queueTimes[0] * 0.5, `mit Stau ${kasJ.queueTimes[0].toFixed(3)} < ohne ${kasF.queueTimes[0].toFixed(3)}`);
});

test('Spielstand: Ausbildung mit Versorgung (Weg, Last, Stau) speichern, laden und weiterspielen bleibt bitgleich', async () => {
  const g1 = new Game({ seed: 3, city: true });
  rich(g1);
  const c = g1.city[0];
  const fab = trainerFor(g1, 'tank');
  const kas = trainerFor(g1, 'rifleman');
  for (let k = 0; k < 3; k++) assert.ok(g1.issue(0, { type: 'train', buildingId: fab.id, unit: 'tank' }).ok);
  assert.ok(g1.issue(0, { type: 'train', buildingId: kas.id, unit: 'rifleman' }).ok);
  run(g1, 3);
  for (const i of supplyOf(g1, c, fab.cityCell).path) transportOf(g1, c).factor[i] = 0.7; // mitten im Stau speichern
  assert.ok(fab.queueTimes[0] > 0, 'Fortschritt vor dem Speichern');
  const g2 = restoreGame(await unpack(await pack(snapshotGame(g1)))).game;
  run(g1, 6);
  run(g2, 6);
  assert.deepEqual(snapshotGame(g2), snapshotGame(g1));
});
