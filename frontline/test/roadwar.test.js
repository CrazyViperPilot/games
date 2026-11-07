// Straßen zerstören und räumen (Paket „Straßen“, Teil 3, PRD §15 „Straßentransport“, §6 „Bagger“): Beschuss nur auf Befehl, Schutt
// unterbricht Wege, Baufahrzeug und Bagger räumen ihn, der Bagger reißt gegnerische Straßen ab, die KI räumt eigenen Schutt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { CITY } from '../js/data/city.js';
import { KIND_ID } from '../js/data/citykinds.js';
import { roadTarget, isRubble, cellCenter, damageRoad, roadWeapon } from '../js/game/roadwar.js';
import { supplyOf, trainRate } from '../js/game/transport.js';
import { cityTrainers } from '../js/game/city/query.js';
import { canZone } from '../js/game/city/cells.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { MAP_ROAD } from '../js/game/roads.js';

const DT = 0.1;
const run = (g, s) => {
  for (let k = 0; k < Math.round(s / DT); k++) g.update(DT);
};
const kas = (g, t = 0) => cityTrainers(g, t).find((e) => e.produces.includes('rifleman'));

/** Spiel mit Stadt; eine eigene Straßenzelle auf dem Versorgungsweg der Kaserne von Team 0. */
function setup() {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const path = supplyOf(g, c, kas(g).cityCell).path;
  const i = [...path].find((j) => c.kind[j] === KIND_ID.road);
  assert.ok(i !== undefined, 'eigene Straße auf dem Weg der Kaserne');
  return { g, c, i, ...cellCenter(g, i) };
}

test('Waffen: Panzer, Schützenpanzer, Panzerabwehr und Kampfhubschrauber können Straßen beschießen, Schützen und Jets nicht', () => {
  const g = new Game({ seed: 3, city: true });
  const has = (type) => !!roadWeapon(g.spawnUnit(type, 0, 500, 500));
  for (const t of ['tank', 'ifv', 'at', 'gunship', 'pzh']) assert.ok(has(t), t);
  for (const t of ['rifleman', 'truck', 'f16']) assert.equal(has(t), false, t);
});

test('Beschuss nur auf Befehl: ein Panzer neben der Straße schießt nicht von selbst darauf', () => {
  const { g, i, x, y } = setup();
  g.spawnUnit('tank', 1, x + 150, y);
  run(g, 10);
  assert.ok(roadTarget(g, i), 'Straße steht');
  assert.equal(g.roadHp?.[i], undefined, 'kein Schaden');
});

test('Befehl shellRoad: Panzer zerstört die Straße, Schutt unterbricht die Versorgung der Kaserne; Baufahrzeug räumt, die Straße ist wieder da', () => {
  const { g, c, i, x, y } = setup();
  const k = kas(g);
  assert.ok(trainRate(g, k) > 0);
  // eigener Panzer sprengt die eigene Straße (erlaubt; ein gegnerischer würde von der Startarmee beschossen)
  const tank = g.spawnUnit('tank', 0, x + 200, y);
  const r = g.issue(0, { type: 'shellRoad', ids: [tank.id], c0: i % c.cols, r0: Math.floor(i / c.cols) });
  assert.ok(r.ok, r.reason);
  for (let s = 0; s < 60 && roadTarget(g, i); s++) run(g, 1);
  assert.equal(roadTarget(g, i), null, 'Straße zerstört');
  assert.ok(isRubble(g, i), 'Schutt');
  assert.equal(c.kind[i], 0);
  assert.equal(canZone(g, c, i), false, 'auf Schutt wird nicht gebaut');
  assert.equal(tank.order.type, 'idle', 'Auftrag erledigt');
  assert.equal(trainRate(g, k), 0, 'Weg unterbrochen: Ausbildung steht');
  // Baufahrzeug räumt
  const eng = g.spawnUnit('engineer', 0, x - 80, y);
  const q = g.issue(0, { type: 'clearRubble', ids: [eng.id], c0: i % c.cols, r0: Math.floor(i / c.cols) });
  assert.ok(q.ok, q.reason);
  run(g, CITY.roadWar.clearTime + 6);
  assert.equal(isRubble(g, i), false, 'geräumt');
  assert.equal(c.kind[i], KIND_ID.road, 'eigene Straße wieder da');
  assert.ok(trainRate(g, k) > 0, 'Versorgung wieder da');
});

test('Befehl shellRoad: keine Straße, Brücke oder ohne passende Waffe abgelehnt', () => {
  const { g, c, x, y } = setup();
  const rifle = g.spawnUnit('rifleman', 1, x, y);
  const tank = g.spawnUnit('tank', 1, x, y);
  assert.equal(g.issue(1, { type: 'shellRoad', ids: [rifle.id], c0: 1, r0: 1 }).ok, false, 'Schütze');
  const free = c.kind.findIndex((v, j) => !v && !g.roads?.kind[j] && canZone(g, c, j));
  const r = g.issue(1, { type: 'shellRoad', ids: [tank.id], c0: free % c.cols, r0: Math.floor(free / c.cols) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /keine Straße/);
});

test('Stadtstraße der Karte: Schutt für beide Teams, Bagger räumt ihn (Straße wieder da)', () => {
  const g = new Game({ seed: 3, city: true });
  const R = g.roads;
  const i = R.kind.findIndex((v) => v === MAP_ROAD);
  assert.ok(i >= 0);
  assert.equal(roadTarget(g, i).owner, -1);
  for (let k = 0; k < 10; k++) damageRoad(g, i, 100);
  assert.ok(isRubble(g, i));
  assert.equal(R.kind[i], 0);
  const { x, y } = cellCenter(g, i);
  const ex = g.spawnUnit('excavator', 0, x + 40, y);
  const r = g.issue(0, { type: 'dig', ids: [ex.id], c0: i % R.cols, r0: Math.floor(i / R.cols), c1: i % R.cols, r1: Math.floor(i / R.cols) });
  assert.ok(r.ok, r.reason);
  run(g, 12);
  assert.equal(isRubble(g, i), false);
  assert.equal(R.kind[i], MAP_ROAD, 'Stadtstraße wieder da');
});

test('Bagger reißt eine gegnerische Straße ab (ohne Schutt), gegnerische Gebäude nicht', () => {
  const g = new Game({ seed: 3, city: true });
  const o = g.city[1];
  const i = o.list.find((j) => o.kind[j] === KIND_ID.road);
  const { x, y } = cellCenter(g, i);
  const ex = g.spawnUnit('excavator', 0, x + 40, y);
  const r = g.issue(0, { type: 'dig', ids: [ex.id], c0: i % o.cols, r0: Math.floor(i / o.cols), c1: i % o.cols, r1: Math.floor(i / o.cols) });
  assert.ok(r.ok, r.reason);
  run(g, 10);
  assert.equal(o.kind[i], 0, 'abgerissen');
  assert.equal(isRubble(g, i), false, 'ohne Schutt');
  const b = o.list.find((j) => o.kind[j] && o.kind[j] !== KIND_ID.road);
  const r2 = g.issue(0, { type: 'dig', ids: [ex.id], c0: b % o.cols, r0: Math.floor(b / o.cols), c1: b % o.cols, r1: Math.floor(b / o.cols) });
  assert.equal(r2.ok, false, 'gegnerisches Gebäude: angreifen statt baggern');
});

test('KI räumt Schutt ihrer Straßen mit einem freien Baufahrzeug; Spielstand behält Schutt und Schaden', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[1];
  const i = c.list.find((j) => c.kind[j] === KIND_ID.road);
  for (let k = 0; k < 5; k++) damageRoad(g, i, 100);
  assert.ok(isRubble(g, i));
  const j = c.list.find((x) => c.kind[x] === KIND_ID.road);
  damageRoad(g, j, 50);
  const { game } = restoreGame(snapshotGame(g, null));
  assert.ok(isRubble(game, i), 'Schutt im Spielstand');
  assert.equal(game.roadHp[j], CITY.roadWar.hp - 50, 'Schaden im Spielstand');
  const ai = new AI(g, 1, 'normal');
  ai.repairRoads(ai.snapshot());
  const eng = g.units.find((u) => u.team === 1 && u.order.type === 'clearRubble');
  assert.ok(eng, 'Baufahrzeug räumt');
  for (let s = 0; s < 120 && isRubble(g, i); s++) run(g, 1);
  assert.equal(isRubble(g, i), false, 'geräumt');
  assert.equal(c.kind[i], KIND_ID.road);
});
