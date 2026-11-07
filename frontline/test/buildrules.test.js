// Baugebiet der Stadt (seit v5.78, Ausbau-Paket A7, PRD §15 „Baugebiet“, Schalter buildRules im Startmenü): Stadtgebäude nur im eigenen
// Gebiet, nur auf erkundetem Gelände, nicht nahe sichtbarer gegnerischer Bodeneinheiten oder gegnerischer Gebäude, nicht in der
// Konfliktzone. Straßen dürfen außerhalb des Gebiets liegen. Ohne Schalter bleibt alles wie bisher; die KI erzeugt mit Regel weiter
// Stahl und Munition.
import test from 'node:test';
import { KINDS } from '../js/data/citykinds.js';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { BALANCE } from '../js/data/balance.js';
import { CITY } from '../js/data/city.js';
import { KIND_ID } from '../js/data/citykinds.js';
import { canZone, buildAllowed, buildWhy, BUILD_BLOCK, fitBig, bigCells, cellAt, roadLinked, nbrsOf, roadLinkWhy } from '../js/game/city/cells.js';
import { updateClaim } from '../js/game/city/state.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { withValue } from './util.js';

const rules = (seed = 3) => new Game({ seed, city: true, buildRules: true });
const plain = (seed = 3) => new Game({ seed, city: true });
const cellXY = (c, i) => {
  const col = i % c.cols;
  return [c.x0 + (col + 0.5) * c.cell, c.y0 + ((i - col) / c.cols + 0.5) * c.cell];
};
const reveal = (g, team = 0) => g.fog[team].explored.fill(1);
const rich = (g, team = 0) => { g.teams[team].res.money = 100000; };
// Befehl „Zelle ausweisen“ (kind) auf eine Zelle i
function cmd(g, team, kind, i) {
  const c = g.city[team];
  const col = i % c.cols;
  const row = (i - col) / c.cols;
  return g.issue(team, { type: 'city', kind, c0: col, r0: row, c1: col, r1: row });
}
// erste Zelle, für die pred(i) gilt, sonst −1
function find(c, pred) {
  for (let i = 0; i < c.kind.length; i++) if (pred(i)) return i;
  return -1;
}

test('ohne Schalter: Baugebiet aus, buildWhy überall leer, buildAllowed gleich canZone', () => {
  const g = plain();
  assert.equal(g.buildRules, false);
  const c = g.city[0];
  let n = 0;
  for (let i = 0; i < c.kind.length; i += 7) {
    assert.equal(buildWhy(g, c, i, 'res'), null);
    assert.equal(buildAllowed(g, c, i, 'res'), canZone(g, c, i));
    n++;
  }
  assert.ok(n > 1000);
  // Zelle außerhalb des Gebiets: Gebäude geht wie vor v5.78
  rich(g);
  const i = find(c, (j) => !c.claim[j] && canZone(g, c, j) && !c.kind[j]);
  assert.ok(i >= 0);
  assert.equal(cmd(g, 0, 'res', i).ok, true);
});

test('mit Schalter: außerhalb des Gebiets kein Gebäude, aber eine Straße', () => {
  const g = rules();
  reveal(g);
  rich(g);
  const c = g.city[0];
  const i = find(c, (j) => !c.claim[j] && canZone(g, c, j) && !c.kind[j] && !buildWhy(g, c, j, 'road'));
  assert.ok(i >= 0, 'Zelle außerhalb des Gebiets, frei und erkundet');
  const r = cmd(g, 0, 'res', i);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'Nur im eigenen Gebiet bauen (Gebiet wächst mit FOBs und Gebäuden)');
  assert.equal(r.reason, BUILD_BLOCK.territory);
  assert.equal(cmd(g, 0, 'road', i).ok, true, 'Straße darf außerhalb liegen');
  assert.equal(c.kind[i], KIND_ID.road);
});

test('mit Schalter: unerkundetes Gelände sperrt Gebäude und Straße, nach dem Aufdecken geht es', () => {
  const g = rules();
  rich(g);
  const c = g.city[0];
  g.fog[0].explored.fill(0);
  const i = find(c, (j) => c.claim[j] && canZone(g, c, j) && !c.kind[j] && !c.deposit[j] && roadLinked(g, c)[j]); // an einer Straße zum Lager
  assert.ok(i >= 0);
  assert.equal(buildWhy(g, c, i, 'res'), 'unexplored');
  const r = cmd(g, 0, 'res', i);
  assert.equal(r.ok, false);
  assert.equal(r.reason, BUILD_BLOCK.unexplored);
  assert.equal(r.reason, 'Unerkundetes Gelände: erst aufklären');
  assert.equal(cmd(g, 0, 'road', i).ok, false, 'auch die Straße nicht');
  reveal(g);
  assert.equal(cmd(g, 0, 'res', i).ok, true);
});

test('mit Schalter: sichtbare Bodeneinheit des Feindes in der Nähe sperrt, weit weg nicht, unsichtbar nicht', () => {
  const near = rules();
  reveal(near);
  rich(near);
  near.fog[0].visible.fill(1);
  const c = near.city[0];
  const i = find(c, (j) => c.claim[j] && canZone(near, c, j) && !c.kind[j] && !c.deposit[j] && roadLinked(near, c)[j]);
  assert.ok(i >= 0);
  const [x, y] = cellXY(c, i);
  near.spawnUnit('tank', 1, x + 200, y);
  assert.equal(buildWhy(near, c, i, 'res'), 'enemy');
  const r = cmd(near, 0, 'res', i);
  assert.equal(r.reason, BUILD_BLOCK.enemy);
  assert.equal(r.reason, 'Zu nah am Feind');

  const far = rules();
  reveal(far);
  far.fog[0].visible.fill(1);
  far.spawnUnit('tank', 1, x + 2000, y);
  assert.equal(buildWhy(far, c, i, 'res'), null, 'weiter als enemyR entfernt');

  const hidden = rules();
  reveal(hidden);
  hidden.fog[0].visible.fill(0);
  hidden.spawnUnit('tank', 1, x + 200, y);
  assert.equal(buildWhy(hidden, c, i, 'res'), null, 'nicht sichtbar: kein Sperrgrund');
});

test('mit Schalter: auch ein gegnerisches Gebäude in der Nähe sperrt', () => {
  const g = rules();
  reveal(g);
  rich(g);
  const c = g.city[0];
  const i = find(c, (j) => c.claim[j] && canZone(g, c, j) && !c.kind[j] && !c.deposit[j]);
  const [x, y] = cellXY(c, i);
  g.spawnBuilding('fob', 1, g.grid.toCell(x + 150), g.grid.toCell(y), { built: true });
  assert.equal(buildWhy(g, c, i, 'res'), 'enemy');
});

test('mit Schalter: Konfliktzone sperrt, ohne CITY.build.noZone nicht', () => {
  const g = rules();
  reveal(g);
  const c = g.city[0];
  const i = find(c, (j) => c.claim[j] && canZone(g, c, j) && !c.kind[j] && roadLinked(g, c)[j]);
  const [x, y] = cellXY(c, i);
  g.zone.x = x;
  g.zone.y = y;
  g.zone.r = 100;
  assert.equal(buildWhy(g, c, i, 'res'), 'zone');
  withValue(CITY.build, 'noZone', false, () => assert.equal(buildWhy(g, c, i, 'res'), null));
  assert.equal(buildWhy(g, c, i, 'res'), 'zone', 'Schalter zurückgestellt');
});

test('mit Schalter: Großbau am Gebietsrand darf höchstens ⌊n/2⌋ Zellen über die Grenze ragen (seit v5.91)', () => withValue(CITY.build, 'needRoad', false, () => {
  const g = rules();
  reveal(g);
  rich(g);
  const c = g.city[0];
  const border = [];
  for (let i = 0; i < c.kind.length; i++) {
    if (!c.claim[i] || c.kind[i] || !canZone(g, c, i)) continue;
    if (!c.claim[i - 1] || !c.claim[i + 1] || !c.claim[i - c.cols] || !c.claim[i + c.cols]) border.push(i);
  }
  assert.ok(border.length > 10, 'Gebietsrand gefunden');
  let placed = 0;
  for (const i of border.slice(0, 60)) {
    if (!cmd(g, 0, 'bm', i).ok) continue;
    placed++;
    for (let j = 0; j < c.kind.length; j++) {
      if (c.kind[j] === KIND_ID.bm) assert.ok(near(c, j, 1), `Werkzelle ${j} liegt mehr als 1 Zelle außerhalb des Gebiets`);
    }
  }
  assert.ok(placed > 0, 'mindestens ein Werk am Rand gebaut');
  // Quadrat gerade passend: fitBig mit der Regel liefert nur Mitten, deren 2 × 2 ganz im Gebiet liegen
  for (const i of border.slice(0, 20)) {
    const a = fitBig(g, c, i % c.cols, Math.floor(i / c.cols), 'bm', undefined, (j) => buildAllowed(g, c, j, 'bm'));
    if (a < 0) continue;
    for (const j of bigCells(c, a, 2)) assert.ok(near(c, j, 1), 'Quadrat höchstens 1 Zelle über die Grenze');
    assert.ok(bigCells(c, a, 2).some((j) => c.claim[j]), 'mindestens eine Zelle im Gebiet');
  }
}));

/** Liegt höchstens d Zellen von Zelle j entfernt (Schachbrettabstand) Gebiet? */
function near(c, j, d) {
  const q = j % c.cols;
  const r = (j - q) / c.cols;
  for (let rr = r - d; rr <= r + d; rr++) for (let qq = q - d; qq <= q + d; qq++) if (c.claim[rr * c.cols + qq]) return true;
  return false;
}

test('mit Schalter (seit v5.91): Fabrikhalle 5 × 5 passt an den Gebietsrand, Bahn darf außerhalb liegen', () => withValue(CITY.build, 'needRoad', false, () => {
  const g = rules();
  reveal(g);
  rich(g);
  const c = g.city[0];
  // Randzellen des Gebiets: dort hätte eine 5 × 5-Halle früher fast nie Platz gehabt
  let fits = 0;
  for (let i = 0; i < c.kind.length && fits === 0; i++) {
    if (!c.claim[i] || c.claim[i + 1] || c.kind[i]) continue; // Zelle im Gebiet, rechts davon nicht mehr
    const a = fitBig(g, c, (i % c.cols) + 1, Math.floor(i / c.cols), 'factory', undefined, (j) => buildAllowed(g, c, j, 'factory'));
    if (a >= 0 && bigCells(c, a, 5).some((j) => !c.claim[j])) fits++;
  }
  assert.ok(fits > 0, 'eine Fabrikhalle ragt am Rand über die Grenze');
  const out = c.claim.findIndex((v, i) => !v && canZone(g, c, i) && !c.kind[i] && !c.deposit[i]);
  assert.equal(buildWhy(g, c, out, 'runway'), null, 'Bahn außerhalb des Gebiets erlaubt');
  assert.equal(buildWhy(g, c, out, 'res'), 'territory', 'Wohnen außerhalb nicht');
}));

// ---- Anschlusspflicht (Paket „Straßen“, Teil 1) ----------------------------------------------------------------------------

/** Spiel mit Baugebiet, alles erkundet, viel Geld und Baumaterial; Paar (i an einer Straße zum Lager, k daneben ohne Anschluss). */
function linkSetup(seed = 3) {
  const g = rules(seed);
  reveal(g);
  rich(g);
  g.mainFob(0).store.bm = 100000;
  const c = g.city[0];
  const mask = roadLinked(g, c);
  const ok = (j) => c.claim[j] && canZone(g, c, j) && !c.kind[j] && !c.deposit[j] && !buildWhy(g, c, j, 'road');
  for (let i = 0; i < c.kind.length; i++) {
    if (!mask[i] || !ok(i)) continue;
    const k = nbrsOf(c, i).find((j) => ok(j) && !mask[j] && !buildWhy(g, c, j, 'mine'));
    if (k !== undefined) return { g, c, i, k };
  }
  throw new Error('kein Zellenpaar gefunden');
}

test('Anschlusspflicht: Gebäude nur an einer Straße zum Lager; nach einer Straße daneben geht es', () => {
  const { g, c, i, k } = linkSetup();
  assert.equal(buildWhy(g, c, k, 'res'), 'road');
  const r = cmd(g, 0, 'com', k);
  assert.equal(r.ok, false);
  assert.equal(r.reason, BUILD_BLOCK.road);
  assert.equal(r.reason, 'Nur an einer Straße bauen, die mit dem Lager der Hauptstadt verbunden ist');
  assert.equal(buildWhy(g, c, i, 'com'), null, 'an der Straße zum Lager erlaubt');
  assert.equal(cmd(g, 0, 'road', i).ok, true, 'Straßen selbst brauchen keinen Anschluss');
  assert.equal(roadLinked(g, c)[k], 1, 'die neue Straße verlängert das Netz');
  assert.equal(cmd(g, 0, 'com', k).ok, true);
});

test('Anschlusspflicht: eine Straße ohne Verbindung zum Lager reicht nicht', () => {
  const { g, c, k } = linkSetup();
  // Nachbar von k, der selbst nicht ans Netz grenzt: eine Straße dort hängt nicht am Lager
  const far = nbrsOf(c, k).find((j) => !roadLinked(g, c)[j] && c.claim[j] && canZone(g, c, j) && !c.kind[j] && !c.deposit[j] && !buildWhy(g, c, j, 'road'));
  assert.ok(far !== undefined);
  assert.equal(cmd(g, 0, 'road', far).ok, true);
  assert.equal(roadLinked(g, c)[k], 0, 'k grenzt nur an die lose Straße');
  assert.equal(buildWhy(g, c, k, 'res'), 'road');
});

test('Anschlusspflicht: Wohnen darf über ein Wohnhaus an der Straße angeschlossen sein (wie hasRoad), Gewerbe nicht', () => {
  const { g, c, i, k } = linkSetup();
  assert.equal(cmd(g, 0, 'res', i).ok, true);
  assert.equal(buildWhy(g, c, k, 'com'), 'road', 'Gewerbe neben Wohnen: kein Anschluss');
  assert.equal(buildWhy(g, c, k, 'res'), null, 'Wohnen neben Wohnen an der Straße: angeschlossen');
  assert.equal(cmd(g, 0, 'res', k).ok, true);
});

test('Anschlusspflicht: Großbau braucht nur eine Randzelle an der Straße zum Lager; Förderanlagen sind frei', () => {
  const { g, c, i } = linkSetup();
  const a = fitBig(g, c, i % c.cols, Math.floor(i / c.cols), 'bm', undefined, (j) => buildAllowed(g, c, j, 'bm'));
  assert.ok(a >= 0, 'Werk am Netz passt');
  const cells = bigCells(c, a, 2);
  const mask = roadLinked(g, c);
  assert.ok(cells.some((j) => mask[j]), 'mindestens eine Zelle an der Straße');
  assert.equal(roadLinkWhy(g, c, cells, 'bm'), null);
  // weit weg vom Netz (im Gebiet, aber ohne Straße zum Lager): fitBig mit Regel findet nichts, der Befehl nennt den Grund
  const lone = find(c, (j) => c.claim[j] && !mask[j] && nbrsOf(c, j).every((q) => !mask[q]) && fitBig(g, c, j % c.cols, Math.floor(j / c.cols), 'bm') >= 0 && bigCells(c, fitBig(g, c, j % c.cols, Math.floor(j / c.cols), 'bm'), 2).every((q) => !mask[q] && !buildWhy(g, c, q, 'bm')) && roadLinkWhy(g, c, bigCells(c, fitBig(g, c, j % c.cols, Math.floor(j / c.cols), 'bm'), 2), 'bm'));
  if (lone >= 0) {
    const r = cmd(g, 0, 'bm', lone);
    assert.equal(r.ok, false);
    assert.equal(r.reason, BUILD_BLOCK.road);
  }
  // Förderanlage auf einem Vorkommen ohne Straße: erlaubt (CITY.build.roadFree)
  const dep = find(c, (j) => c.deposit[j] && !c.kind[j] && c.claim[j] && canZone(g, c, j) && !mask[j]);
  if (dep >= 0) {
    assert.equal(buildWhy(g, c, dep, 'mine'), null);
    assert.equal(buildWhy(g, c, dep, 'res'), 'road');
  }
  withValue(CITY.build, 'needRoad', false, () => assert.equal(buildWhy(g, c, linkSetup().k, 'res'), null, 'Schalter aus: keine Anschlusspflicht'));
});

test('mit Schalter: FOB-Gebiet reicht 6 Zellen, ohne Schalter 4 (Startviertel bleibt gleich)', () => {
  const setup = (buildRules) => {
    const g = new Game({ seed: 3, city: true, buildRules });
    const m = g.mainFob(0);
    const dir = m.x < BALANCE.map.width / 2 ? 1 : -1;
    const b = g.spawnBuilding('fob', 0, g.grid.toCell(m.x + dir * 15 * CITY.cell), g.grid.toCell(m.y), { built: true });
    const c = g.city[0];
    updateClaim(g, c);
    const at = (cells) => c.claim[cellAt(c, b.x + dir * cells * c.cell, b.y)[1] * c.cols + cellAt(c, b.x + dir * cells * c.cell, b.y)[0]];
    return { g, at };
  };
  const on = setup(true);
  assert.equal(on.at(5), 1, '5 Zellen von der FOB: im Gebiet');
  assert.equal(on.at(7), 0, '7 Zellen: draußen');
  const off = setup(false);
  assert.equal(off.at(5), 0, 'ohne Schalter: 5 Zellen draußen wie bisher');
  assert.equal(off.at(3), 1);

  const a = plain();
  const b = rules();
  assert.equal(a.city[0].list.length, b.city[0].list.length, 'Startviertel unverändert');
  // seit v5.90 reicht das Gebiet um Stadtgebäude mit Schalter weiter (CITY.build.buildingClaim): mindestens so groß wie ohne
  assert.ok(a.city[0].claim.every((v, i) => !v || b.city[0].claim[i]), 'Gebiet mit Schalter umfasst das Gebiet ohne Schalter');
});

test('Spielstand: Baugebiet bleibt erhalten', () => {
  const g = rules();
  const ai = new AI(g, 1, 'normal');
  const { game } = restoreGame(snapshotGame(g, ai));
  assert.equal(game.buildRules, true);
  assert.equal(plain().buildRules, false);
});

for (const seed of [3, 11]) {
  test(`KI mit Baugebiet produziert (Seed ${seed}, 12 min): Stahl und Munition in beiden Städten [langsam]`, () => {
    const g = rules(seed);
    const ais = [new AI(g, 0, 'normal'), new AI(g, 1, 'normal')];
    const steps = Math.round((12 * 60) / 0.1);
    for (let k = 0; k < steps; k++) {
      ais[0].update(0.1);
      ais[1].update(0.1);
      g.update(0.1);
    }
    // made zählt aufsummiert; ein Schwellwert statt > 0, weil Rundungsreste sonst jeden Wert > 0 machen
    for (let t = 0; t < 2; t++) {
      const made = g.city[t].made;
      assert.ok(made.mun > 50, `Team ${t}: Munition ${made.mun.toFixed(0)}`);
      assert.ok(made.metal > 50, `Team ${t}: Stahl ${made.metal.toFixed(0)}`);
    }
  });
}

test('mit Schalter (seit v5.90): Gebiet reicht buildingClaim Zellen um Stadtgebäude, auch schräg neben ein 1 × 1-Gebäude passt ein 2 × 2-Großbau', () => {
  const g = rules();
  const c = g.city[0];
  updateClaim(g, c);
  // ein fertiges 1 × 1-Gebäude der Stadt (nicht Straße) suchen
  const i = c.list.find((j) => c.level[j] && KINDS[c.kind[j] - 1] !== 'road' && (c.part?.[j] ?? 0) === 0 && CITY.size[KINDS[c.kind[j] - 1]] === undefined);
  assert.ok(i !== undefined, 'kein 1 × 1-Gebäude im Startviertel');
  const q = i % c.cols;
  const r = (i - q) / c.cols;
  const R = CITY.build.buildingClaim;
  // Zellen eines 2 × 2-Blocks schräg rechts unterhalb: (q+1..q+2, r+1..r+2) – alle im Gebiet
  for (const [dq, dr] of [[1, 1], [2, 1], [1, 2], [2, 2]]) assert.equal(c.claim[(r + dr) * c.cols + q + dq], 1, `Zelle +${dq}/+${dr}`);
  assert.equal(c.claim[r * c.cols + q + R], 1, `${R} Zellen daneben im Gebiet`);
});
