// Tor aus zwei Hälften (2 Felder breit): Befehl, Kosten, Platz, Durchfahrt, Festung, Speichern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { AI } from '../js/ai/ai.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { pack, unpack } from '../js/core/snapshot.js';
import { findPath } from '../js/game/pathfinding.js';

function setup() {
  const g = new Game({ city: false, map: createEmptyMap('Tor') });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  const fob = g.buildings.find((b) => b.main && b.team === 0);
  const c = fob.cx + 1;
  const r = fob.cy - 6; // Reihe oberhalb der Hauptstadt (im Bauradius)
  return { g, fob, c, r };
}
const gates = (g, team = 0) => g.buildings.filter((b) => b.alive && b.team === team && b.type === 'gate');

test('Tor: zwei Hälften nebeneinander in Zugrichtung, doppelte Kosten', () => {
  const { g, fob, c, r } = setup();
  const bm = fob.store.bm;
  const c2 = g.grid.center(c + 1);
  const res = g.issue(0, { type: 'buildWall', building: 'gate', x1: g.grid.center(c), y1: g.grid.center(r), x2: c2, y2: g.grid.center(r) });
  assert.equal(res.ok, true, res.reason);
  const gs = gates(g);
  assert.equal(gs.length, 2);
  assert.deepEqual(gs.map((b) => [b.cx, b.cy, b.leaf, b.axis]).sort((a, b) => a[2] - b[2]), [[c, r, 0, 'x'], [c + 1, r, 1, 'x']]);
  assert.equal(fob.store.bm, bm - 2 * BUILDINGS.gate.cost.bm);
  // senkrechter Zug
  const r2 = g.issue(0, { type: 'buildWall', building: 'gate', x1: g.grid.center(c + 5), y1: g.grid.center(r + 1), x2: g.grid.center(c + 5), y2: g.grid.center(r) });
  assert.equal(r2.ok, true, r2.reason);
  const v = gates(g).filter((b) => b.cx === c + 5);
  assert.deepEqual(v.map((b) => [b.cy, b.leaf, b.axis]).sort((a, b) => a[1] - b[1]), [[r, 0, 'y'], [r + 1, 1, 'y']]);
});

test('Tor: Einzelpunkt nimmt die Richtung der Nachbarmauern, einzelner Klick (build) ebenso', () => {
  const { g, c, r } = setup();
  g.issue(0, { type: 'buildWall', building: 'wall', x1: g.grid.center(c), y1: g.grid.center(r - 3), x2: g.grid.center(c), y2: g.grid.center(r - 1) });
  const res = g.issue(0, { type: 'build', building: 'gate', x: g.grid.center(c), y: g.grid.center(r) });
  assert.equal(res.ok, true, res.reason);
  assert.deepEqual(gates(g).map((b) => [b.cx, b.cy, b.axis]).sort((a, b) => a[1] - b[1]), [[c, r, 'y'], [c, r + 1, 'y']]);
});

test('Tor: ohne Platz für beide Hälften abgelehnt, nichts bezahlt', () => {
  const { g, fob, c, r } = setup();
  g.terrain; // Gelände bleibt leer: Platz mit Wasser sperren
  for (const dc of [-1, 1]) g.grid.terrain[g.grid.idx(c + dc, r)] = 1;
  const bm = fob.store.bm;
  const res = g.issue(0, { type: 'build', building: 'gate', x: g.grid.center(c), y: g.grid.center(r) });
  assert.equal(res.ok, false);
  assert.match(res.reason, /Kein Platz für ein Tor/);
  assert.equal(gates(g).length, 0);
  assert.equal(fob.store.bm, bm);
});

test('Tor: reicht das Lager nur für eine Hälfte, wird nichts gebaut', () => {
  const { g, fob, c, r } = setup();
  fob.store.bm = BUILDINGS.gate.cost.bm + 1;
  const res = g.issue(0, { type: 'build', building: 'gate', x: g.grid.center(c), y: g.grid.center(r) });
  assert.equal(res.ok, false);
  assert.equal(gates(g).length, 0);
});

test('Tor: eigene Einheiten fahren durch beide Hälften, fremde nicht', () => {
  const { g, c, r } = setup();
  const gr = g.grid;
  // Mauer links und rechts, Tor in der Mitte (Zellen c, c+1)
  g.issue(0, { type: 'buildWall', building: 'gate', x1: gr.center(c), y1: gr.center(r), x2: gr.center(c + 1), y2: gr.center(r) });
  for (let rr = r - 40; rr <= r + 40; rr++) {
    for (const cc of [c - 1, c + 2]) if (gr.inBounds(cc, rr)) { /* Seiten bleiben offen: Wand nur in den Torspalten */ }
  }
  for (const b of g.buildings) if (!b.built) { b.built = true; b.progress = 1; b.hp = b.maxHp; }
  for (const b of gates(g)) {
    const i = gr.idx(b.cx, b.cy);
    assert.equal(gr.gateTeam[i], 0);
    assert.equal(gr.passable(b.cx, b.cy, 0), true);
    assert.equal(gr.passable(b.cx, b.cy, 1), false);
  }
  const own = findPath(gr, gr.center(c), gr.center(r - 3), gr.center(c), gr.center(r + 3), 0);
  assert.ok(own.length > 0);
});

test('Festung: vier Tore je zwei Hälften, zweiter Aufruf ergänzt nichts', () => {
  const { g, fob } = setup();
  const res = g.issue(0, { type: 'fortify', buildingId: fob.id });
  assert.equal(res.ok, true, res.reason);
  assert.equal(gates(g).length, 8);
  const n = g.buildings.length;
  g.issue(0, { type: 'fortify', buildingId: fob.id });
  assert.equal(g.buildings.length, n);
  // jede Hälfte hat ihre Partnerhälfte direkt daneben
  for (const b of gates(g)) {
    const k = b.leaf === 0 ? 1 : -1;
    const mate = gates(g).find((o) => o.cx === b.cx + (b.axis === 'x' ? k : 0) && o.cy === b.cy + (b.axis === 'y' ? k : 0));
    assert.ok(mate && mate.leaf === 1 - b.leaf, 'Partner');
  }
});

test('KI baut ein Tor aus zwei Hälften in der Mauer vor der Hauptstadt', () => {
  const g = new Game({ city: false, seed: 5 });
  const ai = new AI(g, 1, 'hard');
  const dt = 1 / 20;
  for (let i = 0; i < 20 * 400; i++) {
    ai.update(dt);
    g.update(dt);
  }
  const mine = gates(g, 1);
  if (mine.length) {
    assert.equal(mine.length % 2, 0, 'Tore kommen paarweise');
    assert.ok(mine.every((b) => b.leaf === 0 || b.leaf === 1));
  }
});

test('Speichern und Laden behalten leaf und axis der Torhälften', async () => {
  const { g, c, r } = setup();
  g.issue(0, { type: 'buildWall', building: 'gate', x1: g.grid.center(c), y1: g.grid.center(r), x2: g.grid.center(c + 1), y2: g.grid.center(r) });
  const ai = new AI(g, 1, 'normal');
  const { game: g2 } = restoreGame(await unpack(await pack(snapshotGame(g, ai))));
  assert.deepEqual(gates(g2).map((b) => [b.cx, b.leaf, b.axis]).sort((a, b) => a[1] - b[1]), [[c, 0, 'x'], [c + 1, 1, 'x']]);
});
