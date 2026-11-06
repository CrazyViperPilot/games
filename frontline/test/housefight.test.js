// Häuserkampf I (seit v5.66): besetzte Häuser zählen in der Zone, Besatzer sehen weiter, Infanterie an Ruinen hat Deckung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { hit } from '../js/game/combat.js';
import { updateZone } from '../js/game/zone.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { pack, unpack } from '../js/core/snapshot.js';
import { UNITS } from '../js/data/units.js';
import { BALANCE } from '../js/data/balance.js';

const G = BALANCE.garrison;
const DT = 1 / BALANCE.tickRate;

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
const inCircle = (c, x, y, r) => Math.hypot(x - c.x, y - c.y) <= r;

/** Zählt die Nebelzellen, die Team 0 sieht. */
function visibleCells(g) {
  g.updateFog();
  let n = 0;
  for (const v of g.fog[0].visible) n += v;
  return n;
}

test('Zone: ein besetztes Haus in der Zone zählt zoneWeight zusätzlich zu den Besatzern (in der Hot Zone doppelt)', () => {
  const Z = { x: BALANCE.map.width / 2, y: BALANCE.map.height / 2 };
  const g = townGame([{ x: Z.x + 200, y: Z.y, w: 96, h: 76, kind: 'house' }]); // 200 px vom Zentrum: in der Hot Zone (300 px)
  const h = g.houses[0];
  const men = [0, 1].map((i) => g.spawnUnit('rifleman', 0, Z.x + 180 + i * 40, Z.y + 100));
  g.issue(0, { type: 'garrison', ids: men.map((u) => u.id), houseId: h.id });
  run(g, 5);
  assert.equal(h.occupants.length, 2);
  const hotH = inCircle(g.hot, h.x, h.y, g.hot.r);
  const inZoneH = inCircle(g.zone, h.x, h.y, g.zone.r);
  assert.ok(inZoneH && hotH, 'Haus liegt in der Hot Zone');
  // Erwartung: je Besatzer 1 (Zone) + 1 (Hot Zone), das Haus zoneWeight je Stufe
  const men2 = men.reduce((s, u) => s + (inCircle(g.zone, u.x, u.y, g.zone.r) ? 1 : 0) + (inCircle(g.hot, u.x, u.y, g.hot.r) ? 1 : 0), 0);
  assert.equal(g.zone.weight[0], men2 + G.zoneWeight * 2);
  assert.equal(g.zone.counts[0], 2, 'Besatzer zählen wie bisher, das Haus nicht');
});

test('Zone: ein leeres oder außerhalb der Zone stehendes Haus gibt kein Gewicht; ohne Besatzung kein Gewicht', () => {
  const Z = { x: BALANCE.map.width / 2, y: BALANCE.map.height / 2 };
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]); // weit außerhalb der Zone
  const h = g.houses[0];
  assert.ok(!inCircle(g.zone, h.x, h.y, g.zone.r));
  const m = g.spawnUnit('rifleman', 0, 3000, 3100);
  g.issue(0, { type: 'garrison', ids: [m.id], houseId: h.id });
  run(g, 5);
  assert.equal(h.occupants.length, 1);
  assert.equal(g.zone.weight[0], 0, 'außerhalb der Zone: kein Gewicht');
  assert.equal(g.zone.weight[1], 0);
  // Ein leeres Haus in der Zone bleibt ohne Gewicht
  const g2 = townGame([{ x: Z.x, y: Z.y, w: 96, h: 76, kind: 'house' }]);
  updateZone(g2, DT);
  assert.equal(g2.zone.weight[0] + g2.zone.weight[1], 0);
});

test('Zone: das Gewicht eines besetzten Hauses gehört dem Team seiner Besatzer', () => {
  const Z = { x: BALANCE.map.width / 2, y: BALANCE.map.height / 2 };
  const g = townGame([{ x: Z.x + 2000, y: Z.y, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  const foe = g.spawnUnit('rifleman', 1, Z.x + 1980, Z.y + 100);
  g.issue(1, { type: 'garrison', ids: [foe.id], houseId: h.id });
  run(g, 5);
  assert.equal(h.team, 1);
  assert.ok(g.zone.weight[1] >= G.zoneWeight, `Team 1 hat ${g.zone.weight[1]}`);
  assert.equal(g.zone.weight[0], 0);
});

test('Ausguck: Besatzer sehen im Haus weiter als dieselbe Einheit draußen', () => {
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  const u = g.spawnUnit('rifleman', 0, 3000, 3100);
  g.units.forEach((o) => { if (o !== u && o.team === 0) o.alive = false; });
  g.cleanup();
  const outside = visibleCells(g);
  g.issue(0, { type: 'garrison', ids: [u.id], houseId: h.id });
  run(g, 5);
  assert.equal(u.house, h.id);
  const inside = visibleCells(g);
  assert.ok(inside > outside, `drinnen ${inside} Zellen, draußen ${outside}`);
  assert.equal(G.sightMul, 1.25);
});

test('Ruinen-Deckung: Infanterie bis 40 px vom Rand einer Ruine nimmt 70 % des Schadens, weiter weg 100 %', () => {
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  hit(g, h, h.maxHp + 1);
  assert.equal(h.ruined, true);
  const near = g.spawnUnit('rifleman', 1, h.x + h.pw / 2 + 30, h.y); // 30 px neben der Ruine
  const far = g.spawnUnit('rifleman', 1, h.x + h.pw / 2 + 60, h.y); // 60 px: außerhalb der Deckung
  const before = [near.hp, far.hp];
  hit(g, near, 20);
  hit(g, far, 20);
  assert.ok(Math.abs(before[0] - near.hp - 20 * G.ruinCover.mul) < 1e-9, `nah: ${before[0] - near.hp}`);
  assert.ok(Math.abs(before[1] - far.hp - 20) < 1e-9, `fern: ${before[1] - far.hp}`);
});

test('Ruinen-Deckung: gilt nur für Infanterie außerhalb von Häusern, nicht für Fahrzeuge', () => {
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  hit(g, h, h.maxHp + 1);
  const tankNear = g.spawnUnit('tank', 1, h.x + h.pw / 2 + 30, h.y);
  const tankFar = g.spawnUnit('tank', 1, h.x + h.pw / 2 + 300, h.y);
  const hpNear = tankNear.hp;
  const hpFar = tankFar.hp;
  hit(g, tankNear, 20);
  hit(g, tankFar, 20);
  // Gleicher Typ, gleicher Treffer: der Schaden ist an der Ruine genauso groß wie weit weg
  assert.ok(Math.abs((hpNear - tankNear.hp) - (hpFar - tankFar.hp)) < 1e-9, 'Fahrzeug an der Ruine: keine Deckung');
  assert.ok(Math.abs((hpFar - tankFar.hp) - 20) < 1e-9);
});

test('Ruinen-Deckung: Besatzer fallen beim Einsturz heraus; die Deckung hält nach Speichern und Laden (ohne eigene Liste)', async () => {
  const g = townGame([{ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' }]);
  const h = g.houses[0];
  const inside = g.spawnUnit('rifleman', 0, 3000, 3100);
  g.issue(0, { type: 'garrison', ids: [inside.id], houseId: h.id });
  run(g, 4);
  assert.equal(inside.house, h.id);
  hit(g, h, h.maxHp + 1); // Einsturz: die Besatzung fliegt heraus
  assert.equal(inside.house, 0);
  assert.ok(inside.hp < inside.maxHp, 'Einsturz verletzt die Besatzung');
  // Stand ohne eigene Ruinenliste: nach dem Laden stimmt die Deckung trotzdem (sie liest die Häuser)
  const { game: g2 } = restoreGame(await unpack(await pack(snapshotGame(g, null))));
  const h2 = g2.houses.find((o) => o.src && o.ruined);
  assert.ok(h2 && h2.ruined);
  const u = g2.spawnUnit('rifleman', 1, h2.x + h2.pw / 2 + 20, h2.y);
  const far = g2.spawnUnit('rifleman', 1, h2.x + h2.pw / 2 + 200, h2.y);
  const a = u.hp;
  const b = far.hp;
  hit(g2, u, 20);
  hit(g2, far, 20);
  assert.ok(Math.abs(a - u.hp - 20 * G.ruinCover.mul) < 1e-9);
  assert.ok(Math.abs(b - far.hp - 20) < 1e-9);
});
