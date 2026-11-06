// Wegsuche ohne Ausreißer (seit v5.61, Review-Paket P8): unerreichbare Ziele billig, Wegbudget je Schritt mit Warteschlange,
// lange Suchen über mehrere Schritte (gleiches Ergebnis wie am Stück, Laden mittendrin bleibt bitgleich), geteilte Wege und ein
// Benchmark für den längsten Simulationsschritt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../js/game/grid.js';
import { findPath, findUnitPath, adoptLong, stepLong, longPath, lineOfSight, pathStats } from '../js/game/pathfinding.js';
import { pathPending } from '../js/game/pathplan.js';
import { BALANCE } from '../js/data/balance.js';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';

const TILE = 32;
const cen = (c) => c * TILE + TILE / 2;
const P = BALANCE.path;

/** Führt fn mit vorübergehend geänderten BALANCE.path-Werten aus. */
function withPath(over, fn) {
  const old = { ...P };
  Object.assign(P, over);
  try {
    return fn();
  } finally {
    Object.assign(P, old);
  }
}

/** Großes leeres Raster mit einer geschlossenen Kiste (Mauerring) um (bc, br), Innenmaß 2·rad − 1. */
function boxGrid(bc, br, rad) {
  const g = new Grid(200, 200, TILE);
  for (let r = br - rad; r <= br + rad; r++) {
    for (let c = bc - rad; c <= bc + rad; c++) if (Math.max(Math.abs(c - bc), Math.abs(r - br)) === rad) g.terrain[g.idx(c, r)] = 1;
  }
  return g;
}

function nodes(fn) {
  const n0 = pathStats.nodes;
  const out = fn();
  return { out, n: pathStats.nodes - n0 };
}

test('Ziel in geschlossener Tasche: Weg endet außen an der Mauer, ohne das ganze Raster zu durchsuchen', () => {
  const g = boxGrid(150, 100, 4);
  const old = nodes(() => findPath(g, cen(10), cen(100), cen(150), cen(100), 0));
  const neu = nodes(() => findUnitPath(g, cen(10), cen(100), cen(150), cen(100), 0, P));
  const last = neu.out[neu.out.length - 1];
  assert.equal(Math.floor(last.x / TILE), 145, 'Ende direkt vor der Mauer (Spalte 145)');
  assert.equal(Math.floor(last.y / TILE), 100);
  assert.ok(neu.n < old.n / 3, `untersuchte Zellen ${neu.n} statt ${old.n}`);
  let prev = { x: cen(10), y: cen(100) };
  for (const p of neu.out) {
    assert.ok(lineOfSight(g, prev.x, prev.y, p.x, p.y, 0), 'Segment kreuzt Hindernis');
    prev = p;
  }
});

test('Versperrtes Ziel (Gebäude): Weg endet an der nächsten freien Zelle', () => {
  const g = new Grid(200, 200, TILE);
  for (let r = 98; r <= 102; r++) for (let c = 148; c <= 152; c++) g.struct[g.idx(c, r)] = 7; // Gebäude 5 × 5
  const old = nodes(() => findPath(g, cen(10), cen(100), cen(150), cen(100), 0));
  const neu = nodes(() => findUnitPath(g, cen(10), cen(100), cen(150), cen(100), 0, P));
  const last = neu.out[neu.out.length - 1];
  assert.deepEqual([Math.floor(last.x / TILE), Math.floor(last.y / TILE)], [147, 100]);
  assert.ok(neu.n < old.n / 3, `untersuchte Zellen ${neu.n} statt ${old.n}`);
});

test('Erreichbares Ziel: findUnitPath liefert denselben Weg wie findPath', () => {
  const g = boxGrid(150, 100, 4);
  g.terrain[g.idx(146, 100)] = 0; // Lücke in der Kiste: Ziel erreichbar
  const a = findPath(g, cen(10), cen(90), cen(150), cen(100), 0);
  const b = findUnitPath(g, cen(10), cen(90), cen(150), cen(100), 0, P);
  assert.deepEqual(b, a);
  assert.deepEqual(a[a.length - 1], { x: cen(150), y: cen(100) });
});

test('Lange Suche in Stücken ergibt denselben Weg wie am Stück', () => {
  const g = new Grid(120, 120, TILE);
  // Schlangenweg: Mauern abwechselnd oben und unten offen
  for (let c = 10; c < 110; c += 10) for (let r = 0; r < 120; r++) if ((c / 10) % 2 ? r < 115 : r > 4) g.terrain[g.idx(c, r)] = 1;
  const whole = findUnitPath(g, cen(2), cen(2), cen(117), cen(60), 0, { ...P, slice: Infinity });
  assert.equal(findUnitPath(g, cen(2), cen(2), cen(117), cen(60), 0, { ...P, slice: 500 }), null, 'zu lang für ein Stück');
  const st = adoptLong();
  assert.ok(st, 'abgebrochene Suche wird übernommen');
  let steps = 1;
  while (!stepLong(st, 500)) steps++;
  assert.ok(steps > 5, `in ${steps} Stücken`);
  assert.deepEqual(longPath(st), whole);
  assert.deepEqual(whole[whole.length - 1], { x: cen(117), y: cen(60) });
});

test('Wegbudget: viele Einheiten auf einmal warten kurz, bekommen der Reihe nach ihren Weg und kommen an', () => {
  const g = new Game({ seed: 7 });
  const m = g.mainFob(0);
  const ids = [];
  for (let k = 0; k < 30; k++) ids.push(g.spawnUnit(k % 3 ? 'rifleman' : 'tank', 0, m.x + 300 + (k % 6) * 30, m.y + 300 + Math.floor(k / 6) * 30).id);
  const units = ids.map((id) => g.getEntity(id));
  const tx = g.zone.x;
  const ty = g.zone.y;
  withPath({ budget: 1500 }, () => {
    g.pathWork = 0;
    assert.ok(g.issue(0, { type: 'move', ids, x: tx, y: ty }).ok);
    const waiting = units.filter((u) => pathPending(u)).length;
    assert.ok(waiting > 10, `${waiting} Einheiten warten auf ihren Weg`);
    assert.ok(units.every((u) => u.order.type === 'move'), 'wartende Einheiten behalten ihren Befehl');
    let k = 0;
    while (units.some((u) => pathPending(u)) && k < 200) {
      g.update(0.05);
      k++;
    }
    assert.ok(k < 200, 'alle Wege geplant');
  });
  for (let k = 0; k < 20 * 240 && units.some((u) => u.alive && u.order.type === 'move'); k++) g.update(0.05); // ≈ 4300 px Weg
  const near = units.filter((u) => u.alive && Math.hypot(u.x - tx, u.y - ty) < 300);
  assert.ok(near.length >= units.length - 2, `${near.length} von ${units.length} angekommen`);
});

test('Laden mitten in einer langen Suche: Weiterspielen bleibt bitgleich', () => {
  withPath({ slice: 300, budget: 600 }, () => {
    const g1 = new Game({ seed: 11, river: true, city: true });
    const a1 = new AI(g1, 1, 'normal');
    let k = 0;
    while (!(g1.pathLong && g1.pathLong.done > 0) && k < 4000) {
      a1.update(0.05);
      g1.update(0.05);
      k++;
    }
    assert.ok(g1.pathLong?.done > 0, 'eine lange Suche läuft');
    const { game: g2, ai: a2 } = restoreGame(JSON.parse(JSON.stringify(snapshotGame(g1, a1))));
    for (const [g, a] of [
      [g1, a1],
      [g2, a2],
    ]) {
      for (let i = 0; i < 300; i++) {
        a.update(0.05);
        g.update(0.05);
      }
    }
    assert.deepEqual(snapshotGame(g2, a2), snapshotGame(g1, a1));
  });
});

// Benchmark: KI gegen KI mit allen Schaltern. Vor v5.61 kostete hier ein Schritt bei 182 s 260 ms (Wegsuchen zu versperrten Zielen).
// Geprüft wird (1) die Arbeit der Wegsuche je Schritt (untersuchte Zellen, fest je Seed, flackert nie) und (2) großzügig die Uhr:
// kein Schritt nach dem Aufwärmen über 100 ms (gemessen ≈ 13 ms).
test('Benchmark: kein Simulationsschritt sprengt das Wegbudget (Seed 3, 200 s KI gegen KI) [langsam]', () => {
  const g = new Game({ seed: 3, radio: true, weather: 'random', research: true, river: true, city: true });
  const ais = [new AI(g, 0, 'normal'), new AI(g, 1, 'normal')];
  const bound = P.budget + 2 * P.slice + 6 * P.pocket;
  let maxNodes = 0;
  let worst = 0;
  for (let i = 0; i < 200 * 20; i++) {
    const n0 = pathStats.nodes;
    const t0 = performance.now();
    ais[0].update(0.05);
    ais[1].update(0.05);
    g.update(0.05);
    const ms = performance.now() - t0;
    maxNodes = Math.max(maxNodes, pathStats.nodes - n0);
    if (g.time > 5) worst = Math.max(worst, ms);
  }
  console.log(`längster Schritt ${worst.toFixed(1)} ms, Wegsuche höchstens ${maxNodes} Zellen je Schritt`);
  assert.ok(maxNodes <= bound, `Wegsuche ${maxNodes} Zellen in einem Schritt (Grenze ${bound})`);
  assert.ok(worst < 100, `längster Schritt ${worst.toFixed(1)} ms`);
});
