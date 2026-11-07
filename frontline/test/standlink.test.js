// Stellplatz braucht eine Verbindung zur Startbahn (seit v5.xx, Wunsch Daniel): eine Zelle des Stellplatzes grenzt an eine Bahnzelle
// (gültige Bahn) oder an eine Rollfeldzelle, von der eine Kette aus Rollfeld-/Bahnzellen zur Bahn führt. Gilt mit und ohne Baugebiet;
// mit Baugebiet ersetzt sie die Straßen-Anschlusspflicht des Stellplatzes. Meldung BUILD_BLOCK.air.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { KINDS } from '../js/data/citykinds.js';
import { canZone, roadAt, buildWhy, BUILD_BLOCK, airLinked } from '../js/game/city/cells.js';
import { standsOf, runwaysOf } from '../js/game/aircraft.js';

const AIR_MSG = 'Stellplatz braucht eine Verbindung zur Startbahn (direkt oder über das Rollfeld)';

/** Spiel mit Stadt; mit Baugebiet (buildRules) und erkundetem Gelände, wenn rules. Reiche Kasse und Baumaterial. */
function game(rules) {
  const g = new Game({ seed: 3, city: true, buildRules: rules });
  if (rules) {
    g.fog[0].explored.fill(1);
    g.update(0.05); // Gebiet (c.claim) rechnet die Simulation im ersten Schritt aus
  }
  g.teams[0].res.money = 1e6;
  g.mainFob(0).store.bm = 30000;
  return g;
}

/**
 * Linke obere Ecke (q, r) eines freien W × H-Rechtecks nahe der Hauptstadt: ohne Gebäude, Straßen, Vorkommen, sperrt nichts; mit
 * Baugebiet zusätzlich im eigenen Gebiet.
 */
function rect(g, W, H) {
  const c = g.city[0];
  const m = g.mainFob(0);
  const mc = Math.floor(m.x / c.cell);
  const mr = Math.floor(m.y / c.cell);
  let best = null;
  for (let r = 1; r < c.rows - H - 1; r++) {
    for (let q = 1; q < c.cols - W - 1; q++) {
      const d = Math.abs(q - mc) + Math.abs(r - mr);
      if (best && d >= best.d) continue;
      let ok = true;
      for (let y = r; ok && y < r + H; y++) {
        for (let x = q; ok && x < q + W; x++) {
          const j = y * c.cols + x;
          ok = canZone(g, c, j) && !c.kind[j] && !roadAt(c, j) && !c.deposit[j];
        }
      }
      if (ok) best = { q, r, d };
    }
  }
  assert.ok(best, 'freies Rechteck für den Test');
  // Mit Baugebiet: das Gebiet des Teams (c.claim) ist hier von Hand gesetzt, weil das Gebiet um die Hauptstadt am Kartenrand und
  // zwischen Bäumen zu zerstückelt für ein freies Rechteck ist; die Regel selbst (Gebiet, Stellplatz-Bahn) bleibt unverändert
  if (g.buildRules) {
    for (let y = best.r; y < best.r + H; y++) for (let x = best.q; x < best.q + W; x++) c.claim[y * c.cols + x] = 1;
  }
  return best;
}

/** Befehl: Rechteck (c0, r0)…(c1, r1) mit Zellenart kind. */
const put = (g, kind, c0, r0, c1 = c0, r1 = r0) => g.issue(0, { type: 'city', kind, c0, r0, c1, r1 });

/** Bahn 10 × 2 an (q, r), Stellplatz-Anker oben links (q + dq, r + dr) als 2 × 2. */
function runway(g, q, r) {
  const res = put(g, 'runway', q, r, q + 9, r + 1);
  assert.ok(res.ok, 'Bahn');
  return runwaysOf(g, 0).find((x) => x.valid);
}

for (const rules of [false, true]) {
  const tag = rules ? ' (Baugebiet)' : '';

  test(`Stellplatz direkt an der Bahn: ok${tag}`, () => {
    const g = game(rules);
    const { q, r } = rect(g, 12, 6);
    runway(g, q, r);
    const res = put(g, 'stand', q, r + 2, q + 1, r + 3);
    assert.ok(res.ok, res.reason);
    assert.equal(KINDS[g.city[0].kind[(r + 2) * g.city[0].cols + q] - 1], 'stand');
  });

  test(`Stellplatz über eine Rollfeld-Kette zur Bahn: ok${tag}`, () => {
    const g = game(rules);
    const { q, r } = rect(g, 12, 8);
    runway(g, q, r);
    // Rollfeld: (q+9, r+2) grenzt an die Bahn, (q+9, r+3) und (q+9, r+4) reihen sich an; der Stellplatz hängt daran, nicht an der Bahn
    assert.ok(put(g, 'taxi', q + 9, r + 2, q + 9, r + 4).ok, 'Rollfeld');
    const res = put(g, 'stand', q + 7, r + 3, q + 8, r + 4);
    assert.ok(res.ok, res.reason);
  });

  test(`Rollfeld ohne Verbindung zur Bahn: abgelehnt mit Meldung${tag}`, () => {
    const g = game(rules);
    const { q, r } = rect(g, 12, 8);
    runway(g, q, r);
    // Rollfeld zwei Reihen unter der Bahn (dazwischen frei): keine Verbindung
    assert.ok(put(g, 'taxi', q, r + 3, q + 3, r + 3).ok, 'Rollfeld');
    const res = put(g, 'stand', q, r + 4, q + 1, r + 5);
    assert.equal(res.ok, false);
    assert.equal(res.reason, AIR_MSG);
    assert.equal(BUILD_BLOCK.air, AIR_MSG);
    assert.equal(standsOf(g, 0).length, 0);
  });

  test(`Stellplatz frei stehend (keine Bahn, kein Rollfeld): abgelehnt${tag}`, () => {
    const g = game(rules);
    const { q, r } = rect(g, 4, 4);
    const res = put(g, 'stand', q, r, q + 1, r + 1);
    assert.equal(res.ok, false);
    assert.equal(res.reason, AIR_MSG);
  });

  test(`Stellplatz an einer zu kurzen Bahn: abgelehnt${tag}`, () => {
    const g = game(rules);
    const { q, r } = rect(g, 12, 6);
    // Bahn nur 3 Zellen lang (< runwayMin): keine gültige Bahn für die Jets
    assert.ok(put(g, 'runway', q, r, q + 2, r + 1).ok);
    assert.ok(CITY.air.runwayMin > 3);
    const res = put(g, 'stand', q, r + 2, q + 1, r + 3);
    assert.equal(res.ok, false);
    assert.equal(res.reason, AIR_MSG);
  });
}

test('Verbindung über airLinked: Bahn und Rollfeld-Kette markiert, Rollfeld ohne Bahn nicht', () => {
  const g = game(false);
  const { q, r } = rect(g, 12, 8);
  runway(g, q, r);
  assert.ok(put(g, 'taxi', q + 9, r + 2, q + 9, r + 3).ok);
  assert.ok(put(g, 'taxi', q, r + 5, q + 2, r + 5).ok);
  const c = g.city[0];
  const mask = airLinked(c);
  assert.equal(mask[(r + 1) * c.cols + q], 1, 'Bahnzelle');
  assert.equal(mask[(r + 3) * c.cols + q + 9], 1, 'Rollfeld über die Kette');
  assert.equal(mask[(r + 5) * c.cols + q], 0, 'Rollfeld ohne Bahn');
  assert.equal(buildWhy(g, c, (r + 5) * c.cols + q, 'taxi'), null, 'Rollfeld selbst bleibt baubar');
});
