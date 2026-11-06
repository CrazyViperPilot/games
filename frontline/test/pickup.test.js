// Werkslager und LKW am Werk (seit v5.65, P5a): ein Werk der Arten CITY.pickup.kinds legt einen Anteil seines Ausstoßes in sein
// Ausgangslager (c.out am Anker), aber nur, solange ihm ein eigener LKW zugeteilt ist (c.pickClaim, Merker aus updateLogistics).
// LKW holen dort die Ware, eine Route kann am Werk starten, Abriss und Spielstände ohne die neuen Felder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { CITY } from '../js/data/city.js';
import { KINDS } from '../js/data/citykinds.js';
import { anchorOf } from '../js/game/city/cells.js';
import { cargoSum } from '../js/game/logistics.js';
import { teamStock } from '../js/game/flow.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { pack, unpack } from '../js/core/snapshot.js';
import { withValue } from './util.js';

const DT = 0.05;
const run = (g, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) g.update(DT);
};

// Anker des ersten fertigen Werks der Art k (das Startviertel hat eine Raffinerie, verbunden mit der Hauptstadt)
function workOf(g, k = 'fuel', team = 0) {
  const c = g.city[team];
  const a = c.list.find((i) => anchorOf(c, i) === i && c.level[i] && KINDS[c.kind[i] - 1] === k);
  assert.ok(a !== undefined, `kein fertiges Werk ${k}`);
  return a;
}

// Eigener LKW ohne Ladung; `at` = 'work' stellt ihn auf die Werksmitte, 'far' 3000 px daneben (er erreicht das Werk in der Testzeit nicht)
function truck(g, a, at, team = 0) {
  const e = g.city[team].ents.get(a);
  const u = g.units.find((x) => x.alive && x.team === team && x.type === 'truck');
  assert.ok(u, 'kein LKW');
  u.x = e.x + (at === 'far' ? 3000 : 0);
  u.y = e.y;
  u.cargo = { bm: 0, mun: 0, fuel: 0 };
  return u;
}

test('ohne zugeteilten LKW füllt sich das Ausgangslager nicht; der ganze Ausstoß geht zur Hauptstadt', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const a = workOf(g, 'fuel');
  const main0 = g.mainFob(0).store.fuel;
  let gross = 0;
  for (let k = 0; k < 600; k++) {
    g.update(DT);
    gross += c.stats.gross.fuel * DT;
    assert.equal(c.pickClaim[a], 0, 'kein Merker ohne LKW');
  }
  assert.ok(gross > 1, `Ausstoß ${gross}`);
  assert.equal(c.out[a], 0, 'Ausgangslager bleibt leer');
  assert.ok(g.mainFob(0).store.fuel - main0 > 0.9 * gross, 'Hauptstadt bekommt den Ausstoß');
});

test('mit zugeteiltem LKW zweigt das Werk share des Ausstoßes ab, bis cap', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const a = workOf(g, 'fuel');
  const u = truck(g, a, 'far');
  assert.ok(g.issue(0, { type: 'load', ids: [u.id], work: a }).ok);
  let gross = 0;
  for (let k = 0; k < 20 / DT; k++) {
    g.update(DT);
    gross += c.stats.gross.fuel * DT;
  }
  assert.equal(c.pickClaim[a], 1, 'Werk ist zugeteilt');
  assert.equal(u.order.type, 'load', 'LKW ist noch unterwegs');
  assert.ok(Math.abs(c.out[a] - CITY.pickup.share * gross) < 0.01 * gross, `Ausgangslager ${c.out[a]} bei Ausstoß ${gross}`);
  assert.ok(c.made.fuel >= c.out[a], 'die Einlagerung zählt als Erzeugung der Ware');
});

test('Ausgangslager bleibt bei cap stehen; der Rest geht weiter zur Hauptstadt', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const a = workOf(g, 'fuel');
  const u = truck(g, a, 'far');
  g.issue(0, { type: 'load', ids: [u.id], work: a });
  withValue(CITY.pickup, 'cap', 2, () => {
    run(g, 20);
    assert.equal(u.order.type, 'load', 'LKW noch unterwegs');
    assert.ok(c.out[a] <= 2 + 1e-4, `über cap: ${c.out[a]}`);
    assert.ok(c.out[a] > 2 - 1e-3, `nicht gefüllt: ${c.out[a]}`);
    const main0 = g.mainFob(0).store.fuel;
    run(g, 10);
    assert.ok(g.mainFob(0).store.fuel > main0, 'Hauptstadt bekommt den Rest');
    assert.ok(c.out[a] <= 2 + 1e-4);
  });
});

test('LKW am Werk lädt nur die Ware dieses Werks, auch mit anderer Ladungsart', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const a = workOf(g, 'fuel');
  const u = truck(g, a, 'work');
  c.out[a] = 40; // Vorrat im Werk
  assert.ok(g.issue(0, { type: 'load', ids: [u.id], work: a, preset: 'bm' }).ok);
  run(g, 1);
  assert.ok(u.cargo.fuel > 0, 'LKW hat Treibstoff geladen');
  assert.equal(u.cargo.bm, 0, 'keine Fremdware (Ladungsart bm wird am Werk ignoriert)');
});

test('Einzelauftrag am Werk: lädt bis voll, dann Ende', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const a = workOf(g, 'fuel');
  const u = truck(g, a, 'work');
  c.out[a] = 150; // mehr als der LKW Platz hat
  u.cargo.bm = u.def.cargoCap - 100;
  assert.ok(g.issue(0, { type: 'load', ids: [u.id], work: a }).ok);
  run(g, 5);
  assert.ok(Math.abs(cargoSum(u.cargo) - u.def.cargoCap) < 1e-6, `Ladung ${cargoSum(u.cargo)}`);
  assert.equal(u.order.type, 'idle', 'Auftrag beendet, wenn voll');
});

test('Einzelauftrag am leeren Werk endet sofort, ohne zu warten', () => {
  const g = new Game({ seed: 3, city: true });
  const a = workOf(g, 'fuel');
  const u = truck(g, a, 'work');
  assert.ok(g.issue(0, { type: 'load', ids: [u.id], work: a }).ok);
  run(g, 1);
  assert.equal(u.cargo.fuel, 0);
  assert.equal(u.order.type, 'idle', 'Werk leer: Auftrag beendet');
});

test('Einzelauftrag leert das Werk und endet dann mit Ladung', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const a = workOf(g, 'fuel');
  const u = truck(g, a, 'work');
  c.out[a] = 12; // weniger als der LKW Platz hat
  assert.ok(g.issue(0, { type: 'load', ids: [u.id], work: a }).ok);
  run(g, 2);
  assert.ok(c.out[a] < 0.01, `Werk leer (Rest ${c.out[a]})`);
  assert.ok(Math.abs(u.cargo.fuel - 12) < 0.01, `Ladung ${u.cargo.fuel}`);
  assert.equal(u.order.type, 'idle', 'Auftrag endet mit der Ladung');
});

test('Route Werk → FOB: LKW lädt am Werk, fährt zur Hauptstadt und entlädt dort', () => {
  const g = new Game({ seed: 3, city: true });
  const a = workOf(g, 'fuel');
  const main = g.mainFob(0);
  const u = truck(g, a, 'work');
  u.cargo.fuel = u.def.cargoCap - 2; // fast voll: nach zwei Einheiten fährt er zur Hauptstadt
  g.city[0].out[a] = 10;
  const r = g.issue(0, { type: 'route', ids: [u.id], fromWork: a, toId: main.id });
  assert.ok(r.ok, r.reason);
  const seen = new Set();
  let back = false;
  for (let k = 0; k < 120 / DT; k++) {
    g.update(DT);
    const o = u.order;
    if (o.type !== 'route') continue;
    seen.add(o.phase);
    if (o.phase === 'load' && seen.has('unload')) back = true;
  }
  assert.ok(seen.has('unload'), 'LKW hat Ware geladen und fährt los');
  assert.ok(back, 'LKW ist zurück zum Werk gefahren, nachdem er abgeladen hat');
});

test('Abriss des Werks beendet den LKW-Auftrag mit Meldung und leert das Ausgangslager', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const a = workOf(g, 'fuel');
  const u = truck(g, a, 'work');
  c.out[a] = 30;
  assert.ok(g.issue(0, { type: 'load', ids: [u.id], work: a }).ok);
  g.drainEvents();
  const q = a % c.cols;
  const r = (a - q) / c.cols;
  assert.ok(g.issue(0, { type: 'city', kind: 'erase', c0: q, r0: r, c1: q, r1: r }).ok, 'Werk räumen');
  run(g, 0.2);
  assert.equal(c.out[a], 0, 'Ausgangslager weg');
  assert.equal(u.order.type, 'idle', 'Auftrag beendet');
  assert.ok(g.drainEvents().some((e) => e.text === 'Werk nicht mehr da'), 'Meldung');
});

test('Befehl load/route mit work nur an eigenen fertigen Werken, nicht an leeren Zellen', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const u = truck(g, workOf(g, 'fuel'), 'work');
  const empty = c.kind.findIndex((k) => k === 0);
  assert.ok(empty >= 0);
  assert.equal(g.issue(0, { type: 'load', ids: [u.id], work: empty }).ok, false);
  assert.equal(g.issue(0, { type: 'route', ids: [u.id], fromWork: empty, toId: g.mainFob(0).id }).ok, false);
});

test('Ressourcenanzeige zählt das Ausgangslager zum Bestand der Ware', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const a = workOf(g, 'fuel');
  c.out[a] = 20;
  const st = teamStock(g, 0);
  assert.ok(st.fuel >= g.mainFob(0).store.fuel + 20 - 1e-6, `Bestand ${st.fuel} ohne Ausgangslager`);
});

test('Spielstand ohne c.out und c.pickClaim (älter als v5.65) lädt und spielt weiter', async () => {
  const g = new Game({ seed: 3, city: true });
  const ai = new AI(g, 1, 'normal');
  run(g, 5);
  for (const c of g.city) {
    delete c.out;
    delete c.pickClaim;
  }
  const { game: g2, ai: a2 } = restoreGame(await unpack(await pack(snapshotGame(g, ai))));
  for (const c of g2.city) {
    assert.ok(c.out instanceof Float32Array, 'Ausgangslager ergänzt');
    assert.equal(c.out.length, c.kind.length);
    assert.ok(c.pickClaim instanceof Uint8Array, 'Merker ergänzt');
  }
  for (let k = 0; k < 40; k++) {
    a2.update(DT);
    g2.update(DT);
  }
  assert.ok(g2.time > 5);
});

test('Route Werk → FOB: mit Teilladung wartet der LKW am leeren Werk CITY.pickup.wait s, dann fährt er ab', () => {
  const g = new Game({ seed: 3, city: true });
  const a = workOf(g, 'fuel');
  const u = truck(g, a, 'work');
  u.cargo.fuel = 20; // Teilladung, Werkslager leer
  g.city[0].out[a] = 0;
  assert.ok(g.issue(0, { type: 'route', ids: [u.id], fromWork: a, toId: g.mainFob(0).id }).ok);
  run(g, CITY.pickup.wait - 10);
  assert.equal(u.order.phase, 'load', 'wartet noch am Werk (keine Kleinstfuhre)');
  let left = false;
  for (let k = 0; k < 15 / DT && !left; k++) {
    g.update(DT);
    left = u.order.phase === 'unload';
  }
  assert.ok(left, 'nach der Wartezeit fährt er mit der Teilladung ab');
});
