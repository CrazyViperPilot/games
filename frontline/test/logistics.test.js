import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { BALANCE } from '../js/data/balance.js';
import { nearestPassable } from '../js/game/movement.js';

const DT = 0.05;
const TILE = BALANCE.map.tile;
const cellOf = (v) => Math.floor(v / TILE);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const L = BALANCE.logistics;

function run(game, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) game.update(DT);
}

function fobOf(game, t) {
  return game.buildings.find((b) => b.alive && b.team === t && b.type === 'fob' && b.built);
}

/** Start-LKW und Baufahrzeug entfernen, übrige Start-Einheiten voll versorgt (kein Nachschub nötig). */
function silence(game, team) {
  for (const u of game.units) {
    if (u.team !== team) continue;
    if (u.type === 'engineer' || u.type === 'truck') u.alive = false;
    else {
      u.ammo = u.def.ammoMax ?? 0;
      u.fuel = u.def.fuelMax ?? 0;
    }
  }
}

/** Freie Stelle für eine FOB im Ring um (x0, y0), die nicht im Bauradius anderer eigener FOBs liegt. */
function freeFobSpot(game, team, x0, y0, rMin, rMax) {
  for (let r = rMin; r <= rMax; r += 32) {
    for (let a = 0; a < 16; a++) {
      const x = x0 + Math.cos((a * Math.PI) / 8) * r;
      const y = y0 + Math.sin((a * Math.PI) / 8) * r;
      const p = game.canPlace(team, 'fob', x, y);
      if (p.ok) return p;
    }
  }
  return null;
}

/** Fertige FOB an freier Stelle im Ring (ohne Kosten). */
function fobRing(game, team, x0, y0, rMin = 600, rMax = 800) {
  const p = freeFobSpot(game, team, x0, y0, rMin, rMax);
  assert.ok(p, 'freie FOB-Stelle');
  return game.spawnBuilding('fob', team, p.cx, p.cy, { built: true });
}

/** Lager einer Förderanlage: Vorkommen mit Sorte `type` im Bauradius von `f`. */
function nodeNear(game, f, type) {
  return game.map.nodes.find((n) => n.type === type && dist(n.x, n.y, f.x, f.y) < 380);
}

function extractorAt(game, node, { built = true } = {}) {
  const p = game.canPlace(0, 'extractor', node.x, node.y);
  assert.equal(p.ok, true, p.reason);
  return game.spawnBuilding('extractor', 0, p.cx, p.cy, { built, nodeId: node.id });
}

test('Förderanlage füllt das Lager der FOB in deren Bauradius (nicht die einer anderen)', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  const node = nodeNear(g, f, 'bm');
  assert.ok(node, 'Vorkommen im Bauradius');
  const far = fobRing(g, 0, f.x, f.y, 600, 800);
  const bm0 = f.store.bm;
  const farBm0 = far.store.bm;
  extractorAt(g, node);
  run(g, 10);
  // 4 Baumaterial je s bei Förderanlage (Sorte bm), nach 10 s ≈ +40
  const gain = f.store.bm - bm0;
  assert.ok(Math.abs(gain - 40) < 1.5, `Lagerzuwachs ${gain}`);
  assert.equal(far.store.bm, farBm0, 'andere FOB unberührt');
  assert.ok(g.teams[0].rate.bm > 0, 'Förderung in der Rate');
});

test('Förderanlage ohne FOB ruht und meldet „Förderanlage ohne FOB“', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  const node = nodeNear(g, f, 'mun');
  extractorAt(g, node);
  // ein Baufahrzeug hält das Team am Leben (sonst endet die Partie bei fehlender FOB)
  g.spawnUnit('engineer', 0, f.x + 200, f.y + 200);
  f.hp = 0; // FOB zerstört (Lager verloren)
  run(g, 2);
  assert.equal(g.winner, null);
  assert.ok(g.drainEvents().some((e) => e.text === 'Förderanlage ohne FOB'));
  assert.equal(g.teams[0].res.mun, 0, 'Team hat kein Lager mehr');
});

test('Bau zahlt aus dem Lager in Reichweite, nicht aus einem fernen Lager', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  const far = fobRing(g, 0, f.x, f.y, 600, 800);
  g.setStock(0, { bm: 0, mun: 0, fuel: 0 }); // Haupt-FOB leer
  far.store.bm = 2000; // fern, aber nicht im Radius des Bauorts
  // Halle in der Nähe der leeren FOB (innerhalb ihres Radius)
  const p = g.canPlace(0, 'depot', f.x + 150, f.y + 150);
  assert.equal(p.ok, false, 'ohne Lager im Radius nicht baubar');
  assert.equal(p.reason, 'FOB-Lager: zu wenig Baumaterial');

  // Baumaterial in der nahen FOB: jetzt baubar, und nur sie zahlt
  f.store.bm = 300;
  const q = g.canPlace(0, 'depot', f.x + 150, f.y + 150);
  assert.equal(q.ok, true, q.reason);
  assert.equal(q.payer.id, f.id);
  const r = g.issue(0, { type: 'build', building: 'depot', x: f.x + 150, y: f.y + 150 });
  assert.equal(r.ok, true, r.reason);
  assert.equal(f.store.bm, 0, 'nahe FOB zahlt 300');
  assert.equal(far.store.bm, 2000, 'ferne FOB unberührt');
});

test('Nachfüllen im FOB-Radius: Schütze leer → füllt aus dem Lager nach; Verbrauch sinkt im Lager', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  const rifle = g.spawnUnit('rifleman', 0, f.x + 100, f.y);
  rifle.ammo = 0;
  const mun0 = f.store.mun;
  run(g, 1.2);
  assert.ok(rifle.ammo > 0, 'Schütze hat Munition');
  assert.ok(rifle.ammo <= 3 * L.resupplyRate * L.resupplyInterval + 1e-9, "höchstens Rate × Takt je Durchgang (3 Durchgänge in 1,2 s)");
  assert.ok(Math.abs(mun0 - f.store.mun - rifle.ammo) < 1e-6, 'Lager gibt genau die Munition ab');
  run(g, 30);
  assert.equal(rifle.ammo, rifle.def.ammoMax, 'voll nachgefüllt');
});

test('Nachfüllen am LKW: Einheit in 180 px eines LKW mit Ladung außerhalb des FOB-Radius', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  const p = freeFobSpot(g, 0, f.x, f.y, 700, 900); // irgendein Punkt weit weg
  const x = p ? p.x : f.x + 800;
  const y = p ? p.y : f.y;
  const truck = g.spawnUnit('truck', 0, x, y);
  truck.cargo.mun = 100;
  const rifle = g.spawnUnit('rifleman', 0, x + 120, y);
  rifle.ammo = 0;
  assert.ok(dist(f.x, f.y, rifle.x, rifle.y) > L.truckSupplyRange, 'außerhalb des FOB-Radius');
  run(g, 1.2);
  assert.ok(rifle.ammo > 0, 'Schütze am LKW versorgt');
  assert.ok(Math.abs(100 - truck.cargo.mun - rifle.ammo) < 1e-6, 'LKW gibt die Munition ab');
});

test('Nachfüllen: Fahrzeug tankt im FOB-Radius nach, Treibstoff aus dem Lager', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  const tank = g.spawnUnit('tank', 0, f.x + 100, f.y);
  tank.fuel = 0;
  const fuel0 = f.store.fuel;
  run(g, 1.2);
  assert.ok(tank.fuel > 0);
  assert.ok(Math.abs(fuel0 - f.store.fuel - tank.fuel) < 1e-6);
});

test('LKW lädt bis zur Kapazität (400) und Preset „Baumaterial“ lädt nur Baumaterial', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  g.setStock(0, { bm: 1000, mun: 1000, fuel: 1000 });
  const truck = g.spawnUnit('truck', 0, f.x + 60, f.y);
  const r = g.issue(0, { type: 'load', ids: [truck.id], fobId: f.id, preset: 'bm' });
  assert.equal(r.ok, true, r.reason);
  run(g, 10);
  assert.equal(truck.cargo.bm, L.truckCapacity, 'voll mit Baumaterial');
  assert.equal(truck.cargo.mun, 0);
  assert.equal(truck.cargo.fuel, 0);
  assert.equal(f.store.bm, 1000 - L.truckCapacity);
  assert.equal(truck.order.type, 'idle', 'nach dem Laden idle');
});

test('LKW Preset „Gemischt“ teilt die Kapazität je Sorte, Rest füllt die vorhandene Sorte', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  g.setStock(0, { bm: 1000, mun: 1000, fuel: 0 });
  const truck = g.spawnUnit('truck', 0, f.x + 60, f.y);
  assert.equal(g.issue(0, { type: 'load', ids: [truck.id], fobId: f.id }).ok, true);
  run(g, 10);
  assert.equal(truck.cargo.bm + truck.cargo.mun, L.truckCapacity);
  assert.ok(Math.abs(truck.cargo.bm - truck.cargo.mun) <= 2 * L.transferRate * DT, 'je ein Drittel, hier zwei Sorten je ~Hälfte');
  assert.equal(truck.cargo.fuel, 0, 'leere Sorte bleibt leer');
});

test('LKW entlädt in die FOB (bis storeCap) und in eine FOB-Baustelle', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  g.setStock(0, { bm: L.storeCap - 10, mun: 0, fuel: 0 });
  const truck = g.spawnUnit('truck', 0, f.x + 60, f.y);
  truck.cargo.bm = 400;
  assert.equal(g.issue(0, { type: 'unload', ids: [truck.id], fobId: f.id }).ok, true);
  run(g, 8);
  assert.equal(f.store.bm, L.storeCap, 'bis storeCap, Rest bleibt');
  assert.equal(truck.cargo.bm, 400 - 10);
  assert.equal(truck.order.type, 'idle');

  // Baustelle: Material per LKW, danach Baufahrzeug-Fortschritt
  const site = g.spawnBuilding('fob', 0, cellOf(f.x) + 6, cellOf(f.y), { built: false });
  const t2 = g.spawnUnit('truck', 0, site.x + 60, site.y);
  t2.cargo.bm = 400;
  assert.equal(g.issue(0, { type: 'unload', ids: [t2.id], fobId: site.id }).ok, true);
  run(g, 8);
  assert.equal(site.store.bm, 400, 'Baustelle hat ihr Material');
  assert.equal(t2.cargo.bm, 0);
});

test('Route pendelt mindestens zwei Runden zwischen zwei FOBs', () => {
  const g = new Game({ seed: 7 });
  const a = fobOf(g, 0);
  silence(g, 0);
  const b = fobRing(g, 0, a.x, a.y, 600, 800);
  g.setStock(0, { bm: 0, mun: 0, fuel: 0 });
  a.store.bm = 3000;
  const truck = g.spawnUnit('truck', 0, a.x + 60, a.y);
  const r = g.issue(0, { type: 'route', ids: [truck.id], fromId: a.id, toId: b.id, preset: 'bm' });
  assert.equal(r.ok, true, r.reason);
  run(g, 80);
  assert.ok(b.store.bm >= 2 * L.truckCapacity, `Ziel-FOB hat ${b.store.bm}`);
  assert.equal(truck.order.type, 'route', 'Route läuft weiter');
  assert.ok(a.store.bm < 3000, 'Start-FOB wurde geleert');
});

test('Route unterbrochen: Ziel-FOB zerstört → idle und Meldung', () => {
  const g = new Game({ seed: 7 });
  const a = fobOf(g, 0);
  silence(g, 0);
  const b = fobRing(g, 0, a.x, a.y, 600, 800);
  a.store.bm = 500;
  const truck = g.spawnUnit('truck', 0, a.x + 60, a.y);
  assert.equal(g.issue(0, { type: 'route', ids: [truck.id], fromId: a.id, toId: b.id }).ok, true);
  run(g, 1);
  b.hp = 0;
  run(g, 1);
  assert.equal(truck.order.type, 'idle');
  assert.ok(g.drainEvents().some((e) => e.text === 'Route unterbrochen'));
});

test('Befehle: Route braucht zwei eigene FOBs, Ladung nur für LKW; Preset wechseln ohne Auftrag', () => {
  const g = new Game({ seed: 7 });
  const a = fobOf(g, 0);
  silence(g, 0);
  const rifle = g.spawnUnit('rifleman', 0, a.x + 60, a.y);
  assert.equal(g.issue(0, { type: 'load', ids: [rifle.id], fobId: a.id }).ok, false, 'Schütze lädt nicht');
  const truck = g.spawnUnit('truck', 0, a.x + 60, a.y);
  assert.equal(g.issue(0, { type: 'route', ids: [truck.id], fromId: a.id, toId: a.id }).ok, false, 'Start = Ziel');
  assert.equal(g.issue(0, { type: 'setPreset', ids: [truck.id], preset: 'mun' }).ok, true);
  assert.equal(truck.preset, 'mun');
  assert.equal(g.issue(0, { type: 'setPreset', ids: [truck.id], preset: '1' }).ok, false);
});

test('LKW baut keine FOB mehr (buildFob nur mit Baufahrzeug)', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  const truck = g.spawnUnit('truck', 0, f.x + 60, f.y);
  const p = freeFobSpot(g, 0, f.x, f.y, 600, 800);
  const r = g.issue(0, { type: 'buildFob', ids: [truck.id], x: p.x, y: p.y });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'Nur Baufahrzeuge gründen FOB-Baustellen');
});

test('Mauer per LKW-Ladung außerhalb des FOB-Radius: Ladung zahlt, Lager der FOB unberührt', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  // Stelle außerhalb des Radius (450 px) und ohne Hindernis
  let spot = null;
  for (let rad = 520; rad < 900 && !spot; rad += 40) {
    for (let a = 0; a < 16 && !spot; a++) {
      const x = f.x + Math.cos((a * Math.PI) / 8) * rad;
      const y = f.y + Math.sin((a * Math.PI) / 8) * rad;
      if (g.grid.free(cellOf(x), cellOf(y)) && g.fobsInRadius(0, x, y).length === 0) spot = { x, y };
    }
  }
  assert.ok(spot, 'Stelle außerhalb des Radius');
  const truck = g.spawnUnit('truck', 0, spot.x, spot.y);
  truck.cargo.bm = 100;
  const bm0 = f.store.bm;
  const wx = spot.x + 40;
  const r = g.issue(0, { type: 'buildWall', building: 'wall', x1: wx, y1: spot.y, x2: wx, y2: spot.y });
  assert.equal(r.ok, true, r.reason);
  assert.equal(truck.cargo.bm, 100 - 8, 'Mauer kostet 8 aus der Ladung');
  assert.equal(f.store.bm, bm0, 'FOB-Lager unberührt');
  const wall = g.getEntity(g.buildings[g.buildings.length - 1].id);
  assert.equal(wall.payerId, truck.id);
});

test('Mauer außerhalb des Radius ohne LKW-Ladung wird abgelehnt', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  const p = nearestPassable(g.grid, f.x + 900, f.y, 0) || { x: f.x + 900, y: f.y };
  const r = g.issue(0, { type: 'buildWall', building: 'wall', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'Außerhalb des Bauradius einer eigenen FOB');
});

test('build mit siteId schickt Bauer an eine bestehende Baustelle; Schütze nicht an eine Halle', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = g.canPlace(0, 'depot', f.x + 160, f.y);
  assert.equal(spot.ok, true, spot.reason);
  const site = g.spawnBuilding('depot', 0, spot.cx, spot.cy, { built: false });
  const eng = g.units.find((u) => u.team === 0 && u.type === 'engineer');
  const rifle = g.units.find((u) => u.team === 0 && u.type === 'rifleman');
  assert.equal(g.issue(0, { type: 'build', ids: [rifle.id], siteId: site.id }).ok, false);
  assert.equal(g.issue(0, { type: 'build', ids: [eng.id], siteId: site.id }).ok, true);
  assert.equal(eng.order.type, 'build');
  run(g, 40);
  assert.equal(site.built, true);
});
