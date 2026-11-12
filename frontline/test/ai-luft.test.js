// KI nutzt die neuen Lufteinheiten (Paket K3, „KI nutzt die neuen Einheiten“): Aufklärungsdrohne am Heliport, Kamikazedrohnen
// gegen Panzer nahe der Konfliktzone und die A-10 statt eines Teils der F-16. Gezielte Lagen mit festen Stubs, kein KI-gegen-KI-Lauf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { needA10 } from '../js/ai/army/combat.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { CITY } from '../js/data/city.js';
import { DRONE_ARMY, DRONE_FROM, DRONE_MONEY, FPV_ARMY, FPV_MONEY, FPV_NEAR } from '../js/data/ai.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit

/** Szene: leere Karte, die KI (Team 1) mit einem Heliport als einzigem Ausbildungsgebäude; Befehle werden nur gesammelt. */
function scene(army) {
  const g = classic(new Game({ seed: 7 }));
  for (const u of g.units) u.alive = false; // Startarmeen weg
  g.teams[1].res.money = 1e6;
  const ai = new AI(g, 1, 'normal'); // legt selbst einen Befehl an (Schwierigkeit), daher erst danach die Sammlung
  const issued = [];
  g.issue = (team, cmd) => {
    issued.push(cmd);
    return { ok: true };
  };
  ai.pickProducer = () => ({ id: 9, queue: [] }); // der Heliport ist frei
  const z = g.zone;
  const s = {
    home: true,
    ax: z.x - 800,
    ay: z.y,
    zone: z,
    combat: Array.from({ length: army }, () => ({ x: 0, y: 0 })),
    units: [],
    producers: [],
    enemies: [],
  };
  return { g, ai, s, z, issued };
}

test('Aufklärungsdrohne: erst ab DRONE_ARMY Kampfeinheiten, DRONE_FROM s und Geld mit DRONE_MONEY Reserve', () => {
  const { g, ai, s, issued } = scene(DRONE_ARMY - 1);
  g.time = DRONE_FROM + 1;
  ai.drone(s);
  assert.equal(issued.length, 0, 'unter DRONE_ARMY keine Drohne');
  s.combat.push({ x: 0, y: 0 });
  g.time = DRONE_FROM - 1;
  ai.drone(s);
  assert.equal(issued.length, 0, 'vor DRONE_FROM keine Drohne');
  g.time = DRONE_FROM + 1;
  ai.drone(s);
  assert.deepEqual(issued, [{ type: 'train', buildingId: 9, unit: 'drone' }], 'dann eine Drohne am Heliport');
  issued.length = 0;
  g.teams[1].res.money = UNITS.drone.cost.money + DRONE_MONEY - 1;
  ai.drone(s);
  assert.equal(issued.length, 0, 'ohne Geldreserve keine Drohne');
});

test('Aufklärungsdrohne: fliegt an den Zonenrand zur Gegnerseite und kehrt bei wenig Treibstoff heim', () => {
  const { g, ai, s, z, issued } = scene(DRONE_ARMY);
  g.time = DRONE_FROM + 1;
  const dr = { id: 4, type: 'drone', x: z.x - 3000, y: z.y, fuel: 40, def: UNITS.drone, order: { type: 'idle' }, alive: true };
  s.units.push(dr);
  ai.drone(s);
  assert.equal(issued.length, 1, 'Flugbefehl');
  assert.equal(issued[0].type, 'move');
  assert.deepEqual(issued[0].ids, [4]);
  const foe = g.map.spawns[0];
  const towardFoe = (issued[0].x - z.x) * (foe.x - z.x) + (issued[0].y - z.y) * (foe.y - z.y);
  assert.ok(towardFoe > 0, 'Ziel liegt auf der Seite des Gegners');
  dr.fuel = 0.2 * UNITS.drone.fuelMax; // unter SCOUT_FUEL: zurück zur Hauptstadt
  g.time += 60;
  ai.drone(s);
  assert.equal(issued.at(-1).x, s.ax, 'kehrt zur Hauptstadt zurück');
});

test('Kamikazedrohnen: nur mit gesehenem Panzer nahe der Zone kaufen, Angriff auf den nächsten, nicht auf ferne', () => {
  const { g, ai, s, z, issued } = scene(FPV_ARMY);
  g.teams[1].res.money = UNITS.fpv.cost.money + FPV_MONEY;
  ai.kamikaze(s);
  assert.equal(issued.length, 0, 'ohne Panzer kein Kauf');
  const near = { id: 21, type: 'tank', x: z.x + 100, y: z.y, def: { armor: 'heavy', air: false } };
  const far = { id: 22, type: 'tank', x: z.x + z.r + FPV_NEAR + 600, y: z.y, def: { armor: 'heavy', air: false } };
  s.enemies.push(far, near);
  ai.kamikaze(s);
  assert.deepEqual(issued, [{ type: 'train', buildingId: 9, unit: 'fpv' }], 'mit Panzer nahe der Zone: eine Kamikazedrohne');
  issued.length = 0;
  g.time = 100;
  s.units.push({ id: 1, type: 'fpv', order: { type: 'idle' } }, { id: 2, type: 'fpv', order: { type: 'attack' } });
  g.teams[1].res.money = 0;
  ai.kamikaze(s);
  assert.deepEqual(issued, [{ type: 'attack', ids: [1], targetId: 21 }], 'nur die bereite Drohne greift den nahen Panzer an');
  issued.length = 0;
  s.units.push({ id: 3, type: 'fpv', order: { type: 'idle' } });
  ai.kamikaze(s);
  assert.equal(issued.length, 0, 'innerhalb FPV_EVERY s kein neuer Befehl');
});

test('A-10: nur bei vielen gesehenen schweren Fahrzeugen und bis CITY.ai.a10Share der Kampfflugzeuge', () => {
  assert.equal(needA10(CITY.ai.a10Heavy - 1, 0, 4), false, 'zu wenige schwere Fahrzeuge: keine A-10');
  assert.equal(needA10(CITY.ai.a10Heavy, 0, 4), true, 'ab a10Heavy: eine A-10 bei vier Kampfflugzeugen');
  assert.equal(needA10(CITY.ai.a10Heavy, 1, 4), false, 'Anteil erreicht: F-16 wie bisher');
  assert.equal(needA10(CITY.ai.a10Heavy, 0, 0), false, 'ohne Kampfflugzeuge keine A-10');
});
