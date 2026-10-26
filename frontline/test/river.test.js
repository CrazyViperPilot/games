// Fluss mit Brücken und Furten: Der Fluss trennt die Karte, Brücken und Furten verbinden sie. Brücken nur auf Befehl beschossen,
// zerstört sperren sie, Baufahrzeuge bauen sie für Geld wieder auf. Furten bremsen Bodeneinheiten. Aus (Standard): kein Fluss.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap, normalizeMap, checkMap } from '../js/game/mapdata.js';
import { generateMap } from '../js/game/map.js';
import { BALANCE } from '../js/data/balance.js';
import { AI } from '../js/ai/ai.js';
import { Relief, COARSE_N, RELIEF, setRelief } from '../js/game/relief.js';
import { riverHeight, RIVER_SIZE } from '../js/game/landscape.js';
import { createShell } from '../js/game/entities.js';
import { Controller } from '../js/ui/controller.js';

const RV = BALANCE.river;
const DT = 1 / BALANCE.tickRate;
const run = (g, s, ais = []) => {
  for (let i = 0; i < Math.round(s / DT); i++) {
    for (const a of ais) a.update(DT);
    g.update(DT);
  }
};
const msgs = (g) => g.drainEvents().filter((e) => e.type === 'message');

const RY = 4000; // Fluss quer über die Karte (Startpunkt 1 südlich, Startpunkt 2 nördlich)
const BX = 2000; // Brücke (Nord–Süd)
const FX = 6000; // Furt

/** Flache Karte mit einem geraden Fluss bei y = RY, optional Brücke bei x = BX und Furt bei x = FX. */
function riverMap({ bridge = true, ford = false } = {}) {
  const map = createEmptyMap();
  const rel = new Relief();
  const n = COARSE_N;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * RELIEF.res;
      const y = j * RELIEF.res;
      let h = riverHeight(0, Math.abs(y - RY));
      if (ford && Math.hypot(x - FX, y - RY) < RIVER_SIZE.fordR + 40) h = Math.max(h, RIVER_SIZE.fordBed);
      rel.coarse[j * n + i] = h;
    }
  }
  rel.refine();
  setRelief(map, rel);
  if (bridge) map.bridges = [{ x1: BX, y1: RY - 320, x2: BX, y2: RY + 320 }];
  if (ford) map.fords = [{ x: FX, y: RY, r: RIVER_SIZE.fordR }];
  return map;
}

/** Spiel auf der Flusskarte ohne Starteinheiten (Haupt-FOBs bleiben). */
function riverGame(opts) {
  const g = new Game({ map: riverMap(opts) });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  g.drainEvents();
  return g;
}

/** Zellen, die von (x, y) über freie Zellen erreichbar sind. */
function reach(grid, x, y) {
  const seen = new Uint8Array(grid.cols * grid.rows);
  const start = grid.idx(grid.toCell(x), grid.toCell(y));
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop();
    const c = i % grid.cols;
    const r = (i - c) / grid.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (!grid.inBounds(nc, nr)) continue;
      const k = grid.idx(nc, nr);
      if (seen[k] || grid.terrain[k]) continue;
      seen[k] = 1;
      q.push(k);
    }
  }
  return seen;
}
const connected = (grid, a, b) => reach(grid, a.x, a.y)[grid.idx(grid.toCell(b.x), grid.toCell(b.y))] === 1;
const blocked = (g, x, y) => g.grid.terrain[g.grid.idx(g.grid.toCell(x), g.grid.toCell(y))] === 1;

test('Aus (Standard): keine Brücken, keine Furten, dieselbe Karte wie bisher', () => {
  const g = new Game({ seed: 3 });
  assert.deepEqual(g.bridges, []);
  assert.equal(g.map.fords, undefined);
  assert.equal(g.map.bridges, undefined);
  assert.equal(g.grid.ford, null);
  assert.equal(g.grid.deck, null);
  assert.deepEqual(generateMap(3), generateMap(3, { river: false }));
});

test('Flusskarte: 6 Brücken und 4 Furten punktsymmetrisch; ohne sie trennt der Fluss die Startpunkte', () => {
  const g = new Game({ seed: 3, river: true });
  const { bridges, fords, spawns } = g.map;
  assert.equal(bridges.length, 6);
  assert.equal(fords.length, 4);
  assert.equal(g.bridges.length, 6);
  const W = BALANCE.map.width;
  const H = BALANCE.map.height;
  for (const b of bridges) {
    const twin = bridges.find((o) => Math.hypot(o.x1 - (W - b.x1), o.y1 - (H - b.y1)) < 2 || Math.hypot(o.x2 - (W - b.x1), o.y2 - (H - b.y1)) < 2);
    assert.ok(twin, 'Gegenstück der Brücke');
  }
  for (const f of fords) assert.ok(fords.some((o) => Math.hypot(o.x - (W - f.x), o.y - (H - f.y)) < 2), 'Gegenstück der Furt');
  for (const b of g.bridges) {
    assert.ok(b.cells.length > 0, 'Brücke öffnet Wasserzellen');
    assert.ok(b.id <= -10000);
    assert.equal(g.getEntity(b.id), b);
    assert.ok(b.deckH > RELIEF.water);
  }
  assert.ok(g.grid.ford.some((v) => v === 1), 'Furtzellen');
  assert.ok(connected(g.grid, spawns[0], spawns[1]));
  // alle Brücken und Furten zu: der Fluss trennt
  const grid = g.grid;
  const saved = grid.terrain.slice();
  for (const b of g.bridges) for (const i of b.cells) grid.terrain[i] = 1;
  for (let i = 0; i < grid.ford.length; i++) if (grid.ford[i]) grid.terrain[i] = 1;
  assert.equal(connected(grid, spawns[0], spawns[1]), false);
  // nur die Furten offen, nur die Brücken offen: jeweils verbunden
  for (let i = 0; i < grid.ford.length; i++) if (grid.ford[i]) grid.terrain[i] = 0;
  assert.ok(connected(grid, spawns[0], spawns[1]), 'Furten allein verbinden');
  for (let i = 0; i < grid.ford.length; i++) if (grid.ford[i]) grid.terrain[i] = 1;
  for (const b of g.bridges) for (const i of b.cells) grid.terrain[i] = 0;
  assert.ok(connected(grid, spawns[0], spawns[1]), 'Brücken allein verbinden');
  grid.terrain.set(saved);
});

test('Brücke trägt Einheiten über den Fluss (Fahrbahnhöhe); zerstört ist der Weg zu', () => {
  const g = riverGame();
  const b = g.bridges[0];
  assert.ok(blocked(g, BX + 300, RY), 'Fluss neben der Brücke gesperrt');
  assert.equal(blocked(g, BX, RY), false, 'Fahrbahn offen');
  const u = g.spawnUnit('rifleman', 0, BX + 60, RY + 600);
  assert.ok(g.issue(0, { type: 'move', ids: [u.id], x: BX + 40, y: RY - 600 }).ok);
  let onDeck = false;
  for (let i = 0; i < Math.round(80 / DT) && u.y > RY - 500; i++) {
    g.update(DT);
    if (Math.abs(u.y - RY) < 40) {
      onDeck = true;
      assert.equal(g.groundHeight(u), b.deckH, 'auf der Fahrbahn');
    }
  }
  assert.ok(onDeck);
  assert.ok(u.y < RY - 500, 'über die Brücke ans Nordufer');
  b.hp = 1;
  g.drainEvents();
  assert.ok(g.issue(0, { type: 'attack', ids: [u.id], targetId: b.id }).ok);
  run(g, 10);
  assert.equal(b.broken, true);
  assert.equal(b.alive, true, 'bleibt als Entity');
  assert.ok(blocked(g, BX, RY), 'Fahrbahn gesperrt');
  assert.ok(msgs(g).some((m) => m.team === -1 && m.text === 'Brücke zerstört'));
  assert.equal(g.groundHeight({ kind: 'unit', def: {}, x: BX, y: RY }), RELIEF.water, 'keine Fahrbahn mehr: Wasserspiegel');
  assert.equal(u.alive, true);
  g.issue(0, { type: 'move', ids: [u.id], x: BX + 40, y: RY + 600 });
  run(g, 40);
  assert.equal(u.alive, true);
  assert.ok(u.y < RY - 100, 'kein Weg zurück');
});

test('Wer auf der Fahrbahn steht, wenn die Brücke einstürzt, landet am nächsten Ufer', () => {
  const g = riverGame();
  const b = g.bridges[0];
  const near = g.spawnUnit('rifleman', 0, BX, RY + 60);
  const far = g.spawnUnit('rifleman', 0, BX, RY - 70);
  b.hp = 1;
  g.projectiles.push(createShell(g.newId(), 1, BX + 600, RY + 200, BX + 20, RY + 200, { damage: { struct: 80 }, splash: 60 }));
  run(g, 6);
  assert.equal(b.broken, true);
  for (const u of [near, far]) assert.equal(blocked(g, u.x, u.y), false, 'auf festem Grund');
  assert.ok(near.y > RY && far.y < RY, 'jeweils das nähere Ufer');
});

test('Brücken greift niemand von selbst an, auch nicht in der Angriffsbewegung; zerstörte sind kein Ziel', () => {
  const g = riverGame();
  const b = g.bridges[0];
  const tank = g.spawnUnit('tank', 0, BX + 200, RY + 420);
  const rifle = g.spawnUnit('rifleman', 1, BX - 150, RY - 420);
  rifle.alive = false;
  g.cleanup();
  run(g, 8);
  assert.equal(b.hp, b.maxHp, 'im Leerlauf');
  assert.ok(g.issue(0, { type: 'attackMove', ids: [tank.id], x: BX + 200, y: RY + 380 }).ok);
  run(g, 8);
  assert.equal(b.hp, b.maxHp, 'in der Angriffsbewegung');
  assert.ok(g.issue(0, { type: 'attack', ids: [tank.id], targetId: b.id }).ok);
  run(g, 10);
  assert.ok(b.hp < b.maxHp, 'auf Befehl');
  b.hp = 1;
  run(g, 10);
  assert.equal(b.broken, true);
  assert.deepEqual(g.issue(0, { type: 'attack', ids: [tank.id], targetId: b.id }), { ok: false, reason: 'Ziel ungültig' });
  assert.equal(tank.order.type, 'idle', 'Ziel weg: Leerlauf');
});

test('Mörsergranaten beschädigen Brücken (Häuser-Faktor, Abfall über den Splash)', () => {
  const g = riverGame();
  const b = g.bridges[0];
  const w = { damage: { inf: 60, light: 50, heavy: 25, struct: 80 }, splash: 60 };
  g.projectiles.push(createShell(g.newId(), 0, BX + 600, RY, BX, RY, w));
  g.projectiles.push(createShell(g.newId(), 0, BX + 600, RY, BX + 500, RY, w)); // weit daneben
  run(g, 3);
  const full = b.maxHp - b.hp;
  assert.ok(full > 0, 'Volltreffer auf die Fahrbahn');
  g.projectiles.push(createShell(g.newId(), 1, BX + 600, RY, BX + RV.deck / 2 + 30, RY, w)); // 30 px neben der Fahrbahn
  run(g, 3);
  const half = b.maxHp - b.hp - full;
  assert.ok(half > 0 && half < full, 'Rand des Splash');
});

test('Wiederaufbau: nur Baufahrzeuge, 200 Geld beim Start, 30 s mit einem, halb so lang mit zweien; danach offen', () => {
  const g = riverGame();
  const b = g.bridges[0];
  const t = g.teams[0];
  const eng = g.spawnUnit('engineer', 0, BX + 40, RY + 380);
  const rifle = g.spawnUnit('rifleman', 0, BX - 40, RY + 380);
  assert.deepEqual(g.issue(0, { type: 'repairBridge', ids: [eng.id], bridgeId: b.id }), { ok: false, reason: 'Die Brücke ist nicht zerstört' });
  assert.deepEqual(g.issue(0, { type: 'repairBridge', ids: [eng.id], bridgeId: 12345 }), { ok: false, reason: 'Keine Brücke' });
  b.hp = 1;
  g.update(DT); // noch heil
  assert.equal(b.broken, false);
  // zerstören (Splash)
  g.projectiles.push(createShell(g.newId(), 1, BX + 600, RY, BX, RY, { damage: { struct: 80 }, splash: 60 }));
  run(g, 3);
  assert.equal(b.broken, true);
  assert.deepEqual(g.issue(0, { type: 'repairBridge', ids: [rifle.id], bridgeId: b.id }), { ok: false, reason: 'Nur Baufahrzeuge bauen Brücken wieder auf' });
  t.res.money = 100;
  assert.equal(g.issue(0, { type: 'repairBridge', ids: [eng.id], bridgeId: b.id }).ok, false, 'zu wenig Geld');
  t.res.money = 1000;
  assert.ok(g.issue(0, { type: 'repairBridge', ids: [eng.id, rifle.id], bridgeId: b.id }).ok);
  assert.equal(t.res.money, 1000 - RV.rebuildCost);
  assert.equal(rifle.order.type, 'idle', 'nur das Baufahrzeug');
  assert.deepEqual(b.rebuild, { team: 0, progress: 0 });
  run(g, RV.rebuild / 2);
  assert.ok(Math.abs(b.rebuild.progress - 0.5) < 0.02, `halb fertig nach ${RV.rebuild / 2} s`);
  // zweites Baufahrzeug hilft ohne Kosten
  const eng2 = g.spawnUnit('engineer', 0, BX - 40, RY + 380);
  const money = t.res.money;
  assert.ok(g.issue(0, { type: 'repairBridge', ids: [eng2.id], bridgeId: b.id }).ok);
  assert.equal(t.res.money, money);
  g.drainEvents();
  run(g, RV.rebuild / 4 + 0.5);
  assert.equal(b.broken, false, 'mit zweien in einem Viertel der Zeit fertig');
  assert.equal(b.hp, b.maxHp);
  assert.equal(b.rebuild, null);
  assert.equal(blocked(g, BX, RY), false, 'Fahrbahn wieder offen');
  assert.equal(eng.order.type, 'idle');
  assert.equal(eng2.order.type, 'idle');
  assert.ok(msgs(g).some((m) => m.team === -1 && m.text === 'Brücke wieder aufgebaut'));
});

test('Baufahrzeug fährt von weit her zum Brückenkopf auf seiner Flussseite', () => {
  const g = riverGame({ ford: true });
  const b = g.bridges[0];
  b.hp = 1;
  g.projectiles.push(createShell(g.newId(), 1, BX + 600, RY, BX, RY, { damage: { struct: 80 }, splash: 60 }));
  run(g, 3);
  assert.equal(b.broken, true);
  g.teams[0].res.money = 1000;
  const eng = g.spawnUnit('engineer', 0, BX + 300, RY + 900);
  assert.ok(g.issue(0, { type: 'repairBridge', ids: [eng.id], bridgeId: b.id }).ok);
  run(g, 30);
  assert.ok(Math.hypot(eng.x - BX, eng.y - (RY + 320)) <= RV.reach, 'am Südkopf');
  assert.ok(b.rebuild.progress > 0);
});

test('Furt: passierbar, Bodeneinheiten halb so schnell, Hubschrauber nicht; dort wird nicht gebaut, auf Brücken auch nicht', () => {
  const g = riverGame({ ford: true, bridge: true });
  const grid = g.grid;
  assert.equal(grid.isFord(grid.toCell(FX), grid.toCell(RY)), true);
  assert.equal(blocked(g, FX, RY), false);
  assert.equal(grid.isFord(grid.toCell(FX + 600), grid.toCell(RY)), false);
  assert.ok(blocked(g, FX + 600, RY), 'neben der Furt tief');
  assert.ok(connected(grid, { x: FX, y: RY + 600 }, { x: FX, y: RY - 600 }));
  const inf = g.spawnUnit('rifleman', 0, FX, RY);
  const dry = g.spawnUnit('rifleman', 0, FX - 1500, RY + 800);
  const heli = g.spawnUnit('littlebird', 0, FX + 40, RY);
  g.update(DT);
  assert.equal(inf.speedMul, RV.ford);
  assert.equal(dry.speedMul, 1);
  assert.equal(heli.speedMul, 1);
  // Durchquerung dauert länger als dieselbe Strecke an Land
  const wet = g.spawnUnit('rifleman', 0, FX + 20, RY + 260);
  const land = g.spawnUnit('rifleman', 0, FX - 2000, RY + 1260);
  g.issue(0, { type: 'move', ids: [wet.id], x: FX + 20, y: RY - 260 });
  g.issue(0, { type: 'move', ids: [land.id], x: FX - 2000, y: RY + 740 });
  run(g, 8);
  assert.ok(RY + 1260 - land.y > RY + 260 - wet.y + 40, 'Furt bremst');
  assert.equal(g.canPlace(0, 'wall', FX, RY).reason, 'Nicht auf Brücken und in Furten');
  assert.equal(g.canPlace(0, 'wall', BX, RY).reason, 'Nicht auf Brücken und in Furten');
  assert.equal(g.canPlace(0, 'wall', BX, RY + 300).reason, 'Nicht auf Brücken und in Furten', 'Brückenkopf an Land');
  g.spawnBuilding('fob', 0, grid.toCell(BX + 700), grid.toCell(RY + 700), { built: true }).store.bm = 1000;
  assert.equal(g.canPlace(0, 'wall', BX + 400, RY + 500).ok, true, 'daneben an Land');
});

test('Karteneditor: normalizeMap behält Brücken und Furten, checkMap prüft Länge, Ufer und Verbindung', () => {
  const m = normalizeMap({
    ...createEmptyMap(),
    bridges: [
      { x1: 100.4, y1: 200, x2: 100, y2: 500 },
      { x1: 10, y1: 10, x2: 50, y2: 10 }, // zu kurz
    ],
    fords: [{ x: 300, y: 300, r: 9999 }],
  });
  assert.deepEqual(m.bridges, [{ x1: 100, y1: 200, x2: 100, y2: 500 }]);
  assert.deepEqual(m.fords, [{ x: 300, y: 300, r: 400 }]);
  const plain = normalizeMap({ ...createEmptyMap(), bridges: [], fords: [] });
  assert.equal('bridges' in plain, false);
  assert.equal('fords' in plain, false);

  assert.deepEqual(checkMap(riverMap()), [], 'Brücke verbindet');
  assert.deepEqual(checkMap(riverMap({ bridge: false, ford: true })), [], 'Furt verbindet');
  assert.ok(checkMap(riverMap({ bridge: false })).includes('Startpunkt 2 ist von Startpunkt 1 nicht erreichbar'));
  const long = riverMap();
  long.bridges = [{ x1: BX, y1: RY - 600, x2: BX, y2: RY + 600 }];
  assert.ok(checkMap(long).includes('Brücke 1 ist zu lang (höchstens 900 px)'));
  const wet = riverMap();
  wet.bridges = [{ x1: BX, y1: RY, x2: BX, y2: RY + 400 }];
  assert.ok(checkMap(wet).includes('Brücke 1: beide Enden müssen auf festem Grund liegen'));
});

test('KI baut eine zerstörte Brücke auf ihrer Seite mit einem freien Baufahrzeug wieder auf, die des Gegners nicht', () => {
  const g = riverGame();
  const b = g.bridges[0];
  b.hp = 1;
  g.projectiles.push(createShell(g.newId(), 1, BX + 600, RY, BX, RY, { damage: { struct: 80 }, splash: 60 }));
  run(g, 3);
  assert.equal(b.broken, true);
  const sp = g.map.spawns;
  const e0 = g.spawnUnit('engineer', 0, sp[0].x + 200, sp[0].y - 200);
  const e1 = g.spawnUnit('engineer', 1, sp[1].x - 200, sp[1].y + 200);
  g.teams[0].res.money = 2000;
  g.teams[1].res.money = 2000;
  const ais = [new AI(g, 0, 'normal'), new AI(g, 1, 'normal')];
  run(g, 2, ais);
  assert.equal(b.rebuild?.team, 0, 'Brücke liegt näher an Startpunkt 1');
  assert.equal(e0.order.type, 'repairBridge');
  assert.notEqual(e1.order.type, 'repairBridge');
  run(g, 240, ais);
  assert.equal(b.broken, false, 'wieder aufgebaut');
});

test('Steuerung: A + Klick auf eine Brücke beschießt sie, Rechtsklick mit Baufahrzeug auf eine zerstörte baut sie auf', () => {
  const g = riverGame();
  const b = g.bridges[0];
  const tank = g.spawnUnit('tank', 0, BX + 200, RY + 420);
  const eng = g.spawnUnit('engineer', 0, BX + 60, RY + 420);
  g.teams[0].res.money = 1000;
  const c = new Controller(g, 0, { zoom: 1, iso: false, worldToScreen: (x, y) => ({ x, y }) });
  c.view.selection.add(tank.id);
  c.handleHotkey('A');
  assert.equal(c.view.mode, 'attackMove');
  c.leftClickWorld(BX + 10, RY + 100, false);
  assert.equal(tank.order.type, 'attack');
  assert.equal(tank.order.targetId, b.id);
  assert.equal(c.view.mode, 'normal');
  // Rechtsklick auf eine intakte Brücke: nur hinfahren
  c.view.selection.clear();
  c.view.selection.add(eng.id);
  c.rightClick(BX, RY);
  assert.equal(eng.order.type, 'move');
  b.hp = 1;
  run(g, 5);
  assert.equal(b.broken, true);
  c.rightClick(BX, RY);
  assert.equal(eng.order.type, 'repairBridge');
  assert.equal(b.rebuild.team, 0);
});
