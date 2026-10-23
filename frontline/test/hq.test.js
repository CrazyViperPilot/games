import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { BALANCE } from '../js/data/balance.js';
import { nearestPassable } from '../js/game/movement.js';
import { hit } from '../js/game/combat.js';

const DT = 0.05;
const TILE = BALANCE.map.tile;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const cargoSum = (c) => c.bm + c.mun + c.fuel;

function run(game, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) game.update(DT);
}

function hqOf(game, t) {
  return game.buildings.find((b) => b.alive && b.team === t && b.type === 'hq');
}

/** Start-LKW und Baufahrzeug entfernen, Start-Schützen voll versorgt. */
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

/** Erste zulässige FOB-Stelle (canPlace ok) auf Ringen um (x0, y0), optional mit Prädikat. */
function placeRing(game, team, type, x0, y0, rMin, rMax, pred = () => true) {
  for (let r = rMin; r <= rMax; r += 32) {
    for (let a = 0; a < 16; a++) {
      const x = x0 + Math.cos((a * Math.PI) / 8) * r;
      const y = y0 + Math.sin((a * Math.PI) / 8) * r;
      const p = game.canPlace(team, type, x, y);
      if (p.ok && pred(p)) return p;
    }
  }
  return null;
}

/** Fertige FOB 700–900 px vom HQ (außerhalb des HQ-Radius). */
function fobAwayFromHq(game, team) {
  const hq = hqOf(game, team);
  const p = placeRing(game, team, 'fob', hq.x, hq.y, 700, 900);
  assert.ok(p, 'freie FOB-Stelle');
  return game.spawnBuilding('fob', team, p.cx, p.cy, { built: true });
}

/** Lkw nahe dem HQ (100 px, passierbar). */
function truckAtHq(game, team, angle) {
  const hq = hqOf(game, team);
  const p = nearestPassable(game.grid, hq.x + 100 * Math.cos(angle), hq.y + 100 * Math.sin(angle), team) || hq;
  return game.spawnUnit('truck', team, p.x, p.y);
}

test('HQ unbegrenzt: Bau und Ausbildung im HQ-Radius ohne FOB-Lager, Zahler ist das HQ', () => {
  const g = new Game({ seed: 7 });
  const hq = hqOf(g, 0);
  const p = placeRing(g, 0, 'depot', hq.x, hq.y, 250, 400);
  assert.ok(p, 'Platz für Halle im HQ-Radius');
  const eng = g.units.find((u) => u.team === 0 && u.type === 'engineer');
  const r = g.issue(0, { type: 'build', ids: [eng.id], building: 'depot', x: p.x, y: p.y });
  assert.equal(r.ok, true, r.reason);
  const b = g.getEntity(r.id);
  assert.equal(b.payerId, hq.id, 'HQ zahlt');
  assert.equal(g.teams[0].res.bm, 0, 'Lagersumme unberührt');

  const money = g.teams[0].res.money;
  const t = g.issue(0, { type: 'train', buildingId: hq.id, unit: 'rifleman' });
  assert.equal(t.ok, true, t.reason);
  assert.equal(g.teams[0].res.money, money - 60, 'nur Geld');
  assert.equal(hq.queue[0].payerId, hq.id);
  const before = g.units.filter((u) => u.alive && u.team === 0 && u.type === 'rifleman').length;
  run(g, 8.5);
  assert.equal(g.units.filter((u) => u.alive && u.team === 0 && u.type === 'rifleman').length, before + 1);
});

test('HQ: Ausbildung von LKW und Baufahrzeug, Einkommen 6 Geld/s', () => {
  const g = new Game({ seed: 7 });
  const hq = hqOf(g, 0);
  assert.equal(g.issue(0, { type: 'train', buildingId: hq.id, unit: 'truck' }).ok, true);
  assert.equal(g.issue(0, { type: 'train', buildingId: hq.id, unit: 'engineer' }).ok, true);
  assert.equal(g.issue(0, { type: 'train', buildingId: hq.id, unit: 'tank' }).ok, false, 'HQ bildet keine Panzer aus');
  g.update(DT);
  assert.ok(Math.abs(g.teams[0].rate.money - BALANCE.hq.income) < 1e-9, `Rate ${g.teams[0].rate.money}`);
});

test('HQ: Nachschub im HQ-Radius ist unbegrenzt und zählt nicht als Lagerverbrauch', () => {
  const g = new Game({ seed: 7 });
  const hq = hqOf(g, 0);
  silence(g, 0);
  const p = nearestPassable(g.grid, hq.x + 200, hq.y, 0) || hq;
  const rifle = g.spawnUnit('rifleman', 0, p.x, p.y);
  rifle.ammo = 0;
  run(g, 3);
  assert.equal(rifle.ammo, rifle.def.ammoMax, 'voll aus dem HQ');
  assert.equal(g.teams[0].flow.mun, 0, 'kein Lagerverbrauch in der Rate');
  assert.equal(hq.store.mun, Infinity, 'HQ-Lager bleibt unbegrenzt');
});

test('HQ: Abbuchungen und Gutschriften wirken nicht (Abbruch einer Ausbildung)', () => {
  const g = new Game({ seed: 7 });
  const hq = hqOf(g, 0);
  const money0 = g.teams[0].res.money;
  assert.equal(g.issue(0, { type: 'train', buildingId: hq.id, unit: 'rifleman' }).ok, true);
  assert.equal(hq.store.bm, Infinity);
  assert.equal(g.issue(0, { type: 'cancelTrain', buildingId: hq.id }).ok, true);
  assert.equal(g.teams[0].res.money, money0, 'Geld zurück');
  assert.equal(hq.store.mun, Infinity, 'Gutschrift wirkungslos');
  assert.equal(g.teams[0].res.mun, 0, 'Lagersumme ohne HQ');
});

test('Ladeplätze am HQ: 2 LKW laden gleichzeitig, der dritte wartet und lädt danach', () => {
  const g = new Game({ seed: 7 });
  silence(g, 0);
  const hq = hqOf(g, 0);
  const trucks = [0, 1, 2].map((i) => truckAtHq(g, 0, i * 2.1));
  for (const t of trucks) {
    assert.equal(g.issue(0, { type: 'load', ids: [t.id], fobId: hq.id, preset: 'bm' }).ok, true);
  }
  let prev = trucks.map((t) => cargoSum(t.cargo));
  let maxLoading = 0;
  let checked = false;
  for (let i = 0; i < Math.round(12 / DT); i++) {
    g.update(DT);
    let loading = 0;
    trucks.forEach((t, k) => {
      const s = cargoSum(t.cargo);
      if (s > prev[k] + 1e-9) loading++;
      prev[k] = s;
    });
    maxLoading = Math.max(maxLoading, loading);
    if (!checked && i === Math.round(0.5 / DT)) {
      checked = true;
      assert.equal(trucks.filter((t) => t.dockHeld).length, 2, 'zwei Ladeplätze belegt');
      const waiting = trucks.filter((t) => t.waitingDock);
      assert.equal(waiting.length, 1, 'ein LKW wartet');
      assert.equal(cargoSum(waiting[0].cargo), 0, 'wartender LKW ist leer');
    }
  }
  assert.equal(maxLoading, 2, 'nie mehr als zwei LKW gleichzeitig');
  for (const t of trucks) {
    assert.ok(Math.abs(t.cargo.bm - BALANCE.logistics.truckCapacity) < 1e-6, `Ladung ${t.cargo.bm}`);
    assert.equal(t.order.type, 'idle', 'nach dem Laden idle');
    assert.equal(t.dockHeld, false, 'Ladeplatz wieder frei');
  }
  assert.ok(g.drainEvents().some((e) => e.text === 'LKW wartet auf Ladeplatz am HQ'));
});

test('HQ: Entladen und Route mit HQ als Ziel scheitern; Route ab HQ pendelt', () => {
  const g = new Game({ seed: 7 });
  silence(g, 0);
  const hq = hqOf(g, 0);
  const f = fobAwayFromHq(g, 0);
  const truck = truckAtHq(g, 0, 1.0);
  assert.equal(g.issue(0, { type: 'unload', ids: [truck.id], fobId: hq.id }).ok, false);
  const bad = g.issue(0, { type: 'unload', ids: [truck.id], fobId: hq.id });
  assert.equal(bad.reason, 'HQ braucht keinen Nachschub');
  const toHq = g.issue(0, { type: 'route', ids: [truck.id], fromId: f.id, toId: hq.id });
  assert.equal(toHq.ok, false);
  assert.equal(toHq.reason, 'HQ braucht keinen Nachschub');

  const r = g.issue(0, { type: 'route', ids: [truck.id], fromId: hq.id, toId: f.id, preset: 'bm' });
  assert.equal(r.ok, true, r.reason);
  run(g, 45);
  assert.ok(f.store.bm >= BALANCE.logistics.truckCapacity, `FOB hat ${f.store.bm}`);
  assert.equal(truck.order.type, 'route', 'Route läuft weiter');
});

test('Förderanlage am HQ ist verboten; mit einer näheren FOB im Radius erlaubt', () => {
  const g = new Game({ seed: 7 });
  const hq = hqOf(g, 0);
  // Vorkommen 500 px vom HQ (im HQ-Radius, außerhalb der FOB-Grenze)
  const q = nearestPassable(g.grid, hq.x + 500, hq.y, 0) || { x: hq.x + 500, y: hq.y };
  const node = { id: 999, type: 'bm', x: q.x, y: q.y };
  g.map.nodes.push(node);
  const p = g.canPlace(0, 'extractor', node.x, node.y);
  assert.equal(p.ok, false);
  assert.equal(p.reason, 'Am HQ unnötig – Nachschub ist unbegrenzt');

  // FOB nahe dem Vorkommen (näher als das HQ): sie versorgt die Förderanlage
  const fp = placeRing(g, 0, 'fob', node.x, node.y, 150, 300, (c) => dist(c.x, c.y, hq.x, hq.y) >= 500);
  assert.ok(fp, 'FOB-Stelle nahe Vorkommen');
  const f = g.spawnBuilding('fob', 0, fp.cx, fp.cy, { built: true });
  f.store.bm = 100;
  const ok = g.canPlace(0, 'extractor', node.x, node.y);
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(ok.payer.id, f.id, 'die FOB zahlt und versorgt');
});

test('Niederlage nur bei zerstörtem HQ; ohne FOB, aber mit HQ kein Ende', () => {
  const g = new Game({ seed: 7 });
  for (const e of [...g.buildings, ...g.units]) {
    if (e.team === 1 && (e.type === 'fob' || e.type === 'engineer')) e.hp = 0;
  }
  g.update(DT);
  assert.equal(g.winner, null, 'HQ hält das Team am Leben');

  hqOf(g, 1).hp = 0;
  g.update(DT);
  assert.equal(g.winner, 0);
  assert.equal(g.winReason, 'hq');
  assert.ok(g.drainEvents().some((e) => e.text === 'Blau gewinnt durch Zerstörung des HQ'));
});

test('HQ nicht abreißbar und nicht baubar', () => {
  const g = new Game({ seed: 7 });
  const hq = hqOf(g, 0);
  const d = g.issue(0, { type: 'demolish', buildingId: hq.id });
  assert.equal(d.ok, false);
  assert.equal(d.reason, 'Das HQ kann nicht abgerissen werden');
  assert.equal(hq.alive, true);
  const b = g.issue(0, { type: 'build', building: 'hq', x: hq.x + 800, y: hq.y });
  assert.equal(b.ok, false);
});

test('Warnungen: „HQ wird angegriffen“ bei Treffern am HQ, „Basis wird angegriffen“ im Radius', () => {
  const g = new Game({ seed: 7 });
  const hq = hqOf(g, 0);
  hit(g, hq, 1);
  assert.ok(g.drainEvents().some((e) => e.text === 'HQ wird angegriffen'));
  g.time = 100; // Drosselung (20 s) abwarten
  const p = nearestPassable(g.grid, hq.x + 200, hq.y, 0) || hq;
  const u = g.spawnUnit('rifleman', 0, p.x, p.y);
  hit(g, u, 1);
  assert.ok(g.drainEvents().some((e) => e.text === 'Basis wird angegriffen'));
});

test('Karte und Start: HQ steht auf dem Spawn, Vorkommen im Startbereich fehlen', () => {
  const g = new Game({ seed: 7 });
  for (let t = 0; t < 2; t++) {
    const hq = hqOf(g, t);
    const sp = g.map.spawns[t];
    assert.ok(dist(hq.x, hq.y, sp.x, sp.y) < 3 * TILE, 'HQ zentriert auf dem Spawn');
  }
});
