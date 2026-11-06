// Häuserkampf II (seit v5.63): die KI stürmt besetzte Häuser und baut ihre Besatzungshäuser aus; Besatzer schießen nur durch
// Fensterseiten (blinde Seiten zwischen eng stehenden Stadtgebäuden).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { AI } from '../js/ai/ai.js';
import { houseCanFire } from '../js/game/garrison.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { pack, unpack } from '../js/core/snapshot.js';
import { BALANCE } from '../js/data/balance.js';

const G = BALANCE.garrison;
const DT = 1 / BALANCE.tickRate;
const Z = { x: BALANCE.map.width / 2, y: BALANCE.map.height / 2 }; // Zonenmitte

/** Leere Karte mit den gegebenen Stadtgebäuden; ohne Startunits (nur die Hauptstädte bleiben). */
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

/** Wohnhaus (96 × 76 px, wie in den anderen Häuserkampf-Tests) mit Mitte x, y. */
const house = (x, y, w = 96, h = 76, kind = 'house') => ({ x, y, w, h, kind });

const houseAt = (g, x, y) => g.houses.find((h) => h.x === x && h.y === y);

// ---- Feuerbereich: Fensterseiten zur Straße ------------------------------------------------------

/** Karte mit Häusern und Straßen (Strecken x1,y1–x2,y2; dirt = Feldweg, zählt nicht). */
function streetGame(buildings, roads = []) {
  const map = createEmptyMap('Stadt');
  map.town.buildings.push(...buildings);
  map.town.roads.push(...roads);
  const g = new Game({ map });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  return g;
}

// A = Haus bei (3000, 3000), 96 × 76 px: Seitenmitten n (3000, 2962), s (3000, 3038), e (3048, 3000), w (2952, 3000).
const SOUTH = { x1: 2700, y1: 3085, x2: 3300, y2: 3085, w: 40 }; // 47 px an der Südseite, 85 px an allen anderen
const EAST = { x1: 3090, y1: 2700, x2: 3090, y2: 3300, w: 40 }; // 42 px an der Ostseite, 90 px an allen anderen

test('Feuerbereich: eine Straße vor der Südseite macht nur die Südseite zur Fensterseite', () => {
  const g = streetGame([house(3000, 3000)], [SOUTH]);
  assert.deepEqual(houseAt(g, 3000, 3000).windows, { n: false, e: false, s: true, w: false });
});

test('Feuerbereich: Straßen an Süd- und Ostseite öffnen genau diese beiden Seiten', () => {
  const g = streetGame([house(3000, 3000)], [SOUTH, EAST]);
  assert.deepEqual(houseAt(g, 3000, 3000).windows, { n: false, e: true, s: true, w: false });
});

test('Feuerbereich: ohne Straße in der Nähe ist das Haus rundum offen', () => {
  const none = streetGame([house(3000, 3000)]);
  assert.deepEqual(houseAt(none, 3000, 3000).windows, { n: true, e: true, s: true, w: true });
  const far = streetGame([house(3000, 3000)], [{ x1: 2000, y1: 3500, x2: 4000, y2: 3500, w: 40 }]); // 462 px weg
  assert.deepEqual(houseAt(far, 3000, 3000).windows, { n: true, e: true, s: true, w: true });
});

test('Feuerbereich: ein Feldweg (dirt) zählt nicht als Stadtstraße', () => {
  const g = streetGame([house(3000, 3000)], [{ ...SOUTH, dirt: true }]);
  assert.deepEqual(houseAt(g, 3000, 3000).windows, { n: true, e: true, s: true, w: true });
});

test('Feuerbereich: streetReach ist die Grenze, bis zu der eine Seite zur Straße zählt', () => {
  const near = streetGame([house(3000, 3000)], [{ x1: 2700, y1: 3000 + 38 + G.streetReach, x2: 3300, y2: 3000 + 38 + G.streetReach, w: 40 }]);
  assert.equal(houseAt(near, 3000, 3000).windows.s, true, 'genau streetReach: Fenster');
  // Ostseite offen (EAST), die Südstraße liegt 4 px jenseits der Grenze: die Südseite bleibt blind
  const out = streetGame([house(3000, 3000)], [EAST, { x1: 2700, y1: 3000 + 38 + G.streetReach + 4, x2: 3300, y2: 3000 + 38 + G.streetReach + 4, w: 40 }]);
  assert.deepEqual(houseAt(out, 3000, 3000).windows, { n: false, e: true, s: false, w: false }, 'darüber hinaus: blind');
});

test('Feuerbereich: houseCanFire folgt der Richtung zum Ziel; nur die Straßenseite schießt nach draußen', () => {
  const g = streetGame([house(3000, 3000)], [SOUTH]);
  const A = houseAt(g, 3000, 3000);
  const u = g.spawnUnit('rifleman', 0, 3000, 3100);
  g.issue(0, { type: 'garrison', ids: [u.id], houseId: A.id });
  run(g, 4);
  assert.equal(u.house, A.id);
  assert.equal(houseCanFire(g, u, { x: 3300, y: 3000 }), false, 'Ost: blind');
  assert.equal(houseCanFire(g, u, { x: 2700, y: 3000 }), false, 'West: blind');
  assert.equal(houseCanFire(g, u, { x: 3000, y: 2700 }), false, 'Nord: blind');
  assert.equal(houseCanFire(g, u, { x: 3000, y: 3300 }), true, 'Süd: Straßenseite');
  const outside = g.spawnUnit('rifleman', 0, 2000, 2000);
  assert.equal(houseCanFire(g, outside, { x: 3300, y: 3000 }), true, 'draußen: immer wahr');
});

test('Feuerbereich: Besatzer schießen nicht durch eine blinde Seite, wohl durch die Straßenseite', () => {
  const g = streetGame([house(3000, 3000)], [SOUTH]);
  const A = houseAt(g, 3000, 3000);
  const def = g.spawnUnit('rifleman', 0, 3000, 3100);
  g.issue(0, { type: 'garrison', ids: [def.id], houseId: A.id });
  run(g, 4);
  assert.equal(def.house, A.id);
  const east = g.spawnUnit('rifleman', 1, 3200, 3000); // 200 px östlich: blinde Seite
  const south = g.spawnUnit('rifleman', 1, 3000, 3200); // 200 px südlich: Straßenseite
  run(g, 4);
  assert.equal(east.hp, east.maxHp, 'durch die blinde Seite nicht beschossen');
  assert.ok(south.hp < south.maxHp, 'durch die Straßenseite beschossen');
  assert.notEqual(def.targetId, east.id, 'nicht als Ziel gewählt');
});

test('Feuerbereich: Angriffsbefehl auf ein Ziel hinter einer blinden Seite: der Besatzer geht hinaus und verfolgt es', () => {
  const g = streetGame([house(3000, 3000)], [SOUTH]);
  const A = houseAt(g, 3000, 3000);
  const def = g.spawnUnit('rifleman', 0, 3000, 3100);
  g.issue(0, { type: 'garrison', ids: [def.id], houseId: A.id });
  run(g, 4);
  const east = g.spawnUnit('rifleman', 1, 3200, 3000);
  const south = g.spawnUnit('rifleman', 1, 3000, 3200);
  run(g, 2); // Nebel: die Besatzung muss die Ziele sehen
  assert.equal(g.issue(0, { type: 'attack', ids: [def.id], targetId: east.id }).ok, true);
  assert.equal(def.house, 0, 'hinter blinder Seite: hinaus');
  g.issue(0, { type: 'garrison', ids: [def.id], houseId: A.id });
  run(g, 4);
  assert.equal(def.house, A.id);
  g.issue(0, { type: 'attack', ids: [def.id], targetId: south.id });
  assert.equal(def.house, A.id, 'durch die Straßenseite: bleibt drin');
});

test('Feuerbereich: auf Zufallskarten (Seeds 1 bis 6) hat ein nennenswerter Teil der Häuser blinde Seiten (40 bis 60 %)', () => {
  let houses = 0;
  let blind = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const g = new Game({ seed });
    for (const h of g.houses) {
      houses++;
      if (!h.windows.n || !h.windows.e || !h.windows.s || !h.windows.w) blind++;
    }
  }
  const share = blind / houses;
  assert.ok(share >= 0.4 && share <= 0.6, `${blind} von ${houses} Häusern (${(share * 100).toFixed(1)} %)`);
});

test('Feuerbereich: Häuser ohne windows (alte Stände) gelten nach dem Laden als rundum offen', async () => {
  const g = streetGame([house(3000, 3000)], [SOUTH]);
  const { game: g2 } = restoreGame(await unpack(await pack(snapshotGame(g, null))));
  const A = houseAt(g2, 3000, 3000);
  delete A.windows; // so sieht ein Stand aus, der die Fenster nicht kennt
  const def = g2.spawnUnit('rifleman', 0, 3000, 3100);
  g2.issue(0, { type: 'garrison', ids: [def.id], houseId: A.id });
  run(g2, 4);
  assert.equal(def.house, A.id);
  const east = g2.spawnUnit('rifleman', 1, 3200, 3000);
  run(g2, 4);
  assert.ok(east.hp < east.maxHp, 'ohne windows: offen, also beschossen');
});

// ---- KI stürmt -------------------------------------------------------------------------------------

/** Spiel: Team 1 besetzt das Haus in der Zone; Team 0 stellt `n` freie Schützen daneben. */
function stormSetup(n, difficulty = 'normal') {
  const g = townGame([house(Z.x, Z.y)]);
  const h = g.houses[0];
  const foe = g.spawnUnit('rifleman', 1, Z.x, Z.y + 100);
  g.issue(1, { type: 'garrison', ids: [foe.id], houseId: h.id });
  run(g, 4);
  assert.equal(h.occupants.length, 1);
  const own = [];
  for (let i = 0; i < n; i++) own.push(g.spawnUnit('rifleman', 0, Z.x - 120 + i * 60, Z.y + 200));
  run(g, 2); // der Nebel braucht einen Takt, bis die Stürmer das Haus sehen
  assert.ok(g.sees(0, h), 'das Haus ist in Sicht');
  const ai = new AI(g, 0, difficulty);
  return { g, h, own, ai };
}

test('KI stürmt: Normal stürmt ein Haus mit einem Besatzer, wenn 4 freie Schützen daneben stehen', () => {
  const { g, h, own, ai } = stormSetup(4);
  ai.stormHouses(ai.snapshot());
  const storming = own.filter((u) => u.order.type === 'storm');
  assert.equal(storming.length, 4, 'alle vier gehen los');
  assert.ok(storming.every((u) => u.order.targetId === h.id));
});

test('KI stürmt nicht: mit nur einem freien Schützen, und Leicht stürmt nie', () => {
  const one = stormSetup(1);
  one.ai.stormHouses(one.ai.snapshot());
  assert.ok(one.own.every((u) => u.order.type === 'idle'), 'ein Schütze reicht nicht (mindestens 3 und 2 je Besatzer)');
  const easy = stormSetup(4, 'easy');
  assert.equal(easy.ai.cfg.houseStorm, false);
  easy.ai.stormHouses(easy.ai.snapshot());
  assert.ok(easy.own.every((u) => u.order.type === 'idle'), 'Leicht stürmt nicht');
});

test('KI stürmt: höchstens 8 Stürmer, das Haus bleibt bis zum Angriff beim Gegner', () => {
  const { h, own, ai } = stormSetup(10);
  ai.stormHouses(ai.snapshot());
  const storming = own.filter((u) => u.order.type === 'storm');
  assert.equal(storming.length, 8, 'die nächsten 8 von 10');
  assert.equal(h.team, 1, 'das Haus gehört noch dem Gegner');
});

// ---- KI baut Besatzungshäuser aus -------------------------------------------------------------------

/** Eigenes besetztes Haus (Team 0) in einem Spiel ohne Gegner. */
function ownHouse() {
  const g = townGame([house(3000, 3000)]);
  const h = g.houses[0];
  const m = g.spawnUnit('rifleman', 0, 3000, 3100);
  g.issue(0, { type: 'garrison', ids: [m.id], houseId: h.id });
  run(g, 4);
  assert.equal(h.occupants.length, 1);
  return { g, h };
}

test('KI baut aus: Sandsäcke nur mit Geld für Preis und Reserve, Stacheldraht danach', () => {
  const { g, h } = ownHouse();
  const sand = G.works.sandbags.cost.money;
  // Die KI denkt je Takt einmal (memo): für jeden Schritt eine frische KI
  g.teams[0].res.money = sand + 400 - 1; // eine Münze zu wenig
  let ai = new AI(g, 0, 'normal');
  ai.fortifyHouses(ai.snapshot());
  assert.equal(h.building, null, 'ohne Reserve kein Ausbau');
  g.teams[0].res.money = sand + 400;
  ai = new AI(g, 0, 'normal');
  ai.fortifyHouses(ai.snapshot());
  assert.equal(h.building?.work, 'sandbags', 'mit Reserve: Sandsäcke');
  assert.equal(g.teams[0].res.money, 400, 'bezahlt');
  run(g, G.works.sandbags.time + 1);
  assert.equal(h.works.sandbags, true);
  g.teams[0].res.money = G.works.wire.cost.money + 400;
  ai = new AI(g, 0, 'normal');
  ai.fortifyHouses(ai.snapshot());
  assert.equal(h.building?.work, 'wire', 'nächste fehlende Arbeit: Stacheldraht');
});

test('KI baut aus: Leicht baut nie aus, auch mit Geld', () => {
  const { g, h } = ownHouse();
  g.teams[0].res.money = 5000;
  const ai = new AI(g, 0, 'easy');
  assert.equal(ai.cfg.houseWorks, false);
  ai.fortifyHouses(ai.snapshot());
  assert.equal(h.building, null);
});

test('Schwierigkeiten: Normal und Schwer stürmen und bauen aus, Leicht nicht', () => {
  for (const d of ['normal', 'hard']) {
    assert.equal(BALANCE.difficulty[d].houseStorm, true, `${d} stürmt`);
    assert.equal(BALANCE.difficulty[d].houseWorks, true, `${d} baut aus`);
  }
  assert.equal(BALANCE.difficulty.easy.houseStorm, false);
  assert.equal(BALANCE.difficulty.easy.houseWorks, false);
});
