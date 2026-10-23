import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { nearestPassable } from '../js/game/movement.js';

const DT = 0.05;
const TILE = BALANCE.map.tile;

function run(game, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) game.update(DT);
}

const cellOf = (v) => Math.floor(v / TILE);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function fobOf(game, t) {
  return game.buildings.find((b) => b.alive && b.team === t && b.type === 'fob' && b.built);
}

function unitsOf(game, t, type = null) {
  return game.units.filter((u) => u.alive && u.team === t && (!type || u.type === type));
}

/** Erste zulässige Mitte für `type` auf Ringen um (x0, y0) zwischen rMin und rMax. */
function findSpot(game, team, type, x0, y0, rMin = 0, rMax = 400) {
  for (let r = rMin; r <= rMax; r += 32) {
    for (let a = 0; a < 16; a++) {
      const x = x0 + Math.cos((a * Math.PI) / 8) * r;
      const y = y0 + Math.sin((a * Math.PI) / 8) * r;
      const p = game.canPlace(team, type, x, y);
      if (p.ok) return { x: p.x, y: p.y };
    }
  }
  return null;
}

/** Baut sofort (ohne Kosten) eine fertige FOB an eine zulässige Stelle im Ring um (x0, y0). */
function fobAt(game, team, x0, y0, rMin = 600, rMax = 800) {
  const s = findSpot(game, team, 'fob', x0, y0, rMin, rMax);
  assert.ok(s, 'freie FOB-Stelle');
  const p = game.canPlace(team, 'fob', s.x, s.y);
  return game.spawnBuilding('fob', team, p.cx, p.cy, { built: true });
}

/** Ein Baufahrzeug direkt am Gebäuderand, damit es ohne Anfahrt mitbaut. */
function engineerBeside(game, b, team = b.team) {
  const p = nearestPassable(game.grid, b.x, b.y + (b.h * TILE) / 2 + 20, team) || { x: b.x, y: b.y };
  return game.spawnUnit('engineer', team, p.x, p.y);
}

/** Start-Baufahrzeug und Start-Schützen einer Seite aus dem Spiel nehmen (Munition 0), damit nur der Test handelt. */
function silence(game, team) {
  for (const u of game.units) {
    if (u.team !== team) continue;
    u.ammo = 0;
    if (u.type === 'engineer') u.alive = false;
  }
}

test('Startzustand: fertige Haupt-FOB mit Lager, Startunits, Geld', () => {
  const g = new Game({ seed: 7 });
  for (let t = 0; t < 2; t++) {
    const f = fobOf(g, t);
    assert.ok(f, `FOB für Team ${t}`);
    assert.equal(f.built, true);
    assert.equal(f.hp, f.maxHp);
    assert.equal(unitsOf(g, t).length, BALANCE.startUnits.length);
    assert.equal(unitsOf(g, t, 'truck').length, 1);
    assert.equal(unitsOf(g, t, 'engineer').length, 1);
    assert.equal(unitsOf(g, t, 'rifleman').length, 4);
    assert.deepEqual(f.store, { bm: BALANCE.startRes.bm, mun: BALANCE.startRes.mun, fuel: BALANCE.startRes.fuel });
    assert.equal(g.teams[t].res.money, BALANCE.startRes.money);
    assert.equal(g.teams[t].res.bm, BALANCE.startRes.bm, 'Summe aller FOB-Lager');
  }
  assert.equal(g.winner, null);
  assert.equal(g.zone.owner, -1);
});

test('Team-Ressourcen sind Lesegetter: direktes Schreiben ist nicht möglich', () => {
  const g = new Game({ seed: 7 });
  assert.throws(() => {
    'use strict';
    g.teams[0].res.bm = 5;
  }, TypeError);
  g.setStock(0, { bm: 123, mun: 45, fuel: 6 });
  assert.equal(g.teams[0].res.bm, 123);
  assert.equal(g.teams[0].res.mun, 45);
  assert.equal(g.teams[0].res.fuel, 6);
  assert.equal(g.teams[1].res.bm, BALANCE.startRes.bm, 'Team 1 unberührt');
});

test('Platzierung: Bauradius, Hindernisse, Förderanlage nur auf Vorkommen', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);

  // außerhalb des Bauradius (450 px)
  assert.equal(g.canPlace(0, 'depot', f.x + 1500, f.y).ok, false);

  // auf einem Hindernis (eigene FOB direkt auf den Felsen setzen, damit der Radius erfüllt ist)
  const ob = g.map.obstacles[0];
  g.spawnBuilding('fob', 0, cellOf(ob.x) - 1, cellOf(ob.y) - 1);
  const onRock = g.canPlace(0, 'depot', ob.x, ob.y);
  assert.equal(onRock.ok, false);
  assert.match(onRock.reason, /Gelände/);

  // Förderanlage nur auf einem Vorkommen
  assert.equal(g.canPlace(0, 'extractor', f.x, f.y).ok, false);
  const node = g.map.nodes.find((n) => dist(n.x, n.y, f.x, f.y) < 380);
  assert.ok(node, 'Vorkommen im Bauradius');
  const ex = g.canPlace(0, 'extractor', node.x, node.y);
  assert.equal(ex.ok, true);
  assert.equal(ex.nodeId, node.id);
  assert.equal(ex.payer.kind, 'fob', 'Zahler ist die FOB im Radius');
  // auf dem Vorkommen keine andere Stelle als Förderanlage
  assert.equal(g.canPlace(0, 'depot', node.x, node.y).ok, false);

  // freie Stelle im Radius ist baubar
  assert.ok(findSpot(g, 0, 'depot', f.x, f.y, 0, 400));
});

test('Bau: Gebäude-Baustelle kostet Geld und Lager sofort; Fortschritt nur mit Bauer', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = findSpot(g, 0, 'depot', f.x, f.y);
  const eng = unitsOf(g, 0, 'engineer')[0];
  const r = g.issue(0, { type: 'build', ids: [eng.id], building: 'depot', x: spot.x, y: spot.y });
  assert.equal(r.ok, true, r.reason);
  const b = g.getEntity(r.id);
  assert.equal(b.built, false);
  assert.equal(g.teams[0].res.bm, BALANCE.startRes.bm - 300);
  assert.equal(b.payerId, f.id);

  run(g, 40);
  assert.equal(b.built, true, 'Baufahrzeug baut fertig');
  assert.equal(b.hp, b.maxHp);
  assert.ok(g.drainEvents().some((e) => e.text === 'Fahrzeughalle fertig'));
});

test('Bau: Gebäude-Baustelle ohne Bauer kommt nicht voran; 2 Bauer doppelt so schnell', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = findSpot(g, 0, 'depot', f.x, f.y);
  const r = g.issue(0, { type: 'build', building: 'depot', x: spot.x, y: spot.y });
  assert.equal(r.ok, true);
  const b = g.getEntity(r.id);
  // ohne Bauer (Start-Baufahrzeug ausgeschaltet) kein Fortschritt
  silence(g, 0);
  run(g, 10);
  assert.equal(b.progress, 0, 'ohne Bauer kein Fortschritt');

  // zwei Bauer direkt am Gebäude: 25 s Bauzeit / 2 = 12,5 s
  const g2 = new Game({ seed: 7 });
  silence(g2, 0);
  const f2 = fobOf(g2, 0);
  const spot2 = findSpot(g2, 0, 'depot', f2.x, f2.y);
  const site = g2.spawnBuilding('depot', 0, cellOf(spot2.x) - 1, cellOf(spot2.y) - 1, { built: false });
  engineerBeside(g2, site);
  engineerBeside(g2, site);
  run(g2, 13);
  assert.equal(site.built, true, 'mit 2 Bauern nach ~12,5 s fertig');
  const g1 = new Game({ seed: 7 });
  silence(g1, 0);
  const f1 = fobOf(g1, 0);
  const spot1 = findSpot(g1, 0, 'depot', f1.x, f1.y);
  const one = g1.spawnBuilding('depot', 0, cellOf(spot1.x) - 1, cellOf(spot1.y) - 1, { built: false });
  engineerBeside(g1, one);
  run(g1, 13);
  assert.equal(one.built, false, 'mit einem Bauer noch nicht fertig');
  run(g1, 13);
  assert.equal(one.built, true);
});

test('Bauer hilft automatisch: idle Baufahrzeug in 400 px baut Baustelle ohne ids', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const node = g.map.nodes.find((n) => dist(n.x, n.y, f.x, f.y) < 380);
  const r = g.issue(0, { type: 'build', building: 'extractor', x: node.x, y: node.y });
  assert.equal(r.ok, true, r.reason);
  const b = g.getEntity(r.id);
  run(g, 25);
  assert.equal(b.built, true, 'Förderanlage (15 s) mit automatischem Bauer fertig');
});

test('Training: Kosten werden aus dem FOB-Lager und Geld abgezogen, Einheit spawnt', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const before = unitsOf(g, 0, 'rifleman').length;
  const { money } = g.teams[0].res;
  const r = g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' });
  assert.equal(r.ok, true);
  assert.equal(g.teams[0].res.money, money - 60);
  assert.equal(f.store.mun, BALANCE.startRes.mun - 15);
  assert.equal(f.queue.length, 1);
  assert.equal(f.queue[0].unit, 'rifleman');
  assert.equal(f.queue[0].payerId, f.id);

  run(g, 8.5);
  assert.equal(unitsOf(g, 0, 'rifleman').length, before + 1);
  assert.equal(f.queue.length, 0);
});

test('Training: FOB ohne Munition im Lager bildet nicht aus; Fehlergrund nennt Munition', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  g.setStock(0, { bm: 600, mun: 10, fuel: 0 });
  const r = g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'FOB-Lager: zu wenig Munition');
  assert.equal(g.teams[0].res.money, BALANCE.startRes.money, 'nichts bezahlt');
});

test('Kampf: Kampfpanzer tötet einen Schützen', () => {
  const g = new Game({ seed: 7 });
  const sp = g.map.spawns[0];
  const tank = g.spawnUnit('tank', 0, sp.x + 300, sp.y - 300);
  const rifle = g.spawnUnit('rifleman', 1, sp.x + 500, sp.y - 300);
  const r = g.issue(0, { type: 'attack', ids: [tank.id], targetId: rifle.id });
  assert.equal(r.ok, true);
  run(g, 30);
  assert.equal(rifle.alive, false);
  assert.equal(g.entities.has(rifle.id), false);
});

test('Zone: nur Team 0 in der Zone bringt nach 30,1 s einen Punkt und Geld', () => {
  const g = new Game({ seed: 7 });
  const z = g.zone;
  g.spawnUnit('rifleman', 0, z.x, z.y);
  const money0 = g.teams[0].res.money;
  run(g, 30.1);
  assert.equal(g.zone.owner, 0);
  assert.equal(g.zone.contested, false);
  assert.equal(g.teams[0].points, 1);
  // mindestens das Kontrollgeld (6/s) muss gezahlt worden sein
  assert.ok(g.teams[0].res.money >= money0 + BALANCE.zone.controlIncome * 30);
  assert.ok(g.drainEvents().some((e) => e.text === 'Punkt für Blau'));
});

test('Zone: umkämpft bringt keinen Punkt', () => {
  const g = new Game({ seed: 7 });
  const z = g.zone;
  // beide Seiten in der Zone, aber außerhalb der gegenseitigen Sichtweite
  g.spawnUnit('rifleman', 0, z.x - 600, z.y);
  g.spawnUnit('rifleman', 1, z.x + 600, z.y);
  run(g, 65);
  assert.equal(g.zone.contested, true);
  assert.equal(g.zone.owner, -1);
  assert.equal(g.teams[0].points, 0);
  assert.equal(g.teams[1].points, 0);
});

test('Sieg: Partie endet, sobald winPoints erreicht sind', () => {
  const g = new Game({ seed: 7, winPoints: 1 });
  const z = g.zone;
  g.spawnUnit('rifleman', 0, z.x, z.y);
  run(g, 31);
  assert.equal(g.winner, 0);
  assert.equal(g.winReason, 'points');
  assert.equal(g.issue(0, { type: 'stop', ids: [] }).ok, false);
});

test('Eliminierung: Team ohne FOB und ohne Baufahrzeug verliert (LKW zählt nicht)', () => {
  const g = new Game({ seed: 7 });
  for (const e of [...g.buildings, ...g.units]) {
    if (e.team === 1 && (e.type === 'fob' || e.type === 'engineer')) e.hp = 0;
  }
  g.update(DT);
  assert.equal(g.winner, 0);
  assert.equal(g.winReason, 'eliminated');
});

test('Eliminierung: ohne FOB, aber mit Baufahrzeug bleibt man im Spiel; FOB-Baustelle zählt als FOB', () => {
  const g = new Game({ seed: 7 });
  for (const e of [...g.buildings]) if (e.team === 1 && e.type === 'fob') e.hp = 0;
  g.update(DT);
  assert.equal(g.winner, null, 'Baufahrzeug hält das Team am Leben');

  const g2 = new Game({ seed: 7 });
  for (const e of [...g2.units]) if (e.team === 1 && e.type === 'engineer') e.hp = 0;
  g2.update(DT);
  assert.equal(g2.winner, null, 'FOB hält das Team am Leben');
  const site = g2.buildings.find((b) => b.team === 1 && b.type === 'fob');
  site.hp = 0; // nur Baustelle, sonst keine FOB
  g2.update(DT);
  assert.equal(g2.winner, 0);
});

test('Mauer blockiert Bewegung', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  // Mauerring 5×5 (Rand) um (c0, r0): ohne Vorkommen im Umkreis, alle Zellen frei, im Bauradius
  const ring = (c0, r0) => {
    const out = [];
    for (let k = -2; k <= 2; k++) {
      out.push([c0 + k, r0 - 2], [c0 + k, r0 + 2], [c0 - 2, r0 + k], [c0 + 2, r0 + k]);
    }
    return out;
  };
  let c0 = null;
  let r0 = null;
  search: for (let dc = 4; dc <= 10; dc++) {
    for (let dr = -10; dr <= 10; dr++) {
      const cc = cellOf(f.x) + dc;
      const rr = cellOf(f.y) + dr;
      const ok = ring(cc, rr).every(([c, r]) => g.grid.free(c, r) && g.nodeAt(g.grid.center(c), g.grid.center(r), 48) === null);
      if (ok) {
        c0 = cc;
        r0 = rr;
        break search;
      }
    }
  }
  assert.notEqual(c0, null, 'freier Mauerplatz');
  const cx = g.grid.center(c0);
  const cy = g.grid.center(r0);
  const edges = [
    [c0 - 2, r0 - 2, c0 + 2, r0 - 2],
    [c0 + 2, r0 - 2, c0 + 2, r0 + 2],
    [c0 + 2, r0 + 2, c0 - 2, r0 + 2],
    [c0 - 2, r0 + 2, c0 - 2, r0 - 2],
  ];
  let placed = 0;
  for (const [a, b, c, d] of edges) {
    const r = g.issue(0, {
      type: 'buildWall',
      building: 'wall',
      x1: g.grid.center(a),
      y1: g.grid.center(b),
      x2: g.grid.center(c),
      y2: g.grid.center(d),
    });
    assert.equal(r.ok, true, r.reason);
    placed += r.count;
  }
  assert.equal(placed, 16);
  assert.equal(g.grid.passable(c0 + 2, r0, 0), false);

  const u = g.spawnUnit('rifleman', 0, cx, cy);
  const far = g.issue(0, { type: 'move', ids: [u.id], x: cx - 600, y: cy });
  assert.equal(far.ok, true);
  run(g, 10);
  assert.ok(u.alive);
  assert.ok(cellOf(u.x) >= c0 - 1 && cellOf(u.x) <= c0 + 1, `x-Zelle ${cellOf(u.x)}`);
  assert.ok(cellOf(u.y) >= r0 - 1 && cellOf(u.y) <= r0 + 1, `y-Zelle ${cellOf(u.y)}`);
});

test('Schütze baut Mauer, Schütze kann keine Halle bauen', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const rifle = unitsOf(g, 0, 'rifleman')[0];
  const spot = findSpot(g, 0, 'depot', f.x, f.y);
  const bad = g.issue(0, { type: 'build', ids: [rifle.id], building: 'depot', x: spot.x, y: spot.y });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'Nur Baufahrzeuge bauen das');

  const w = findSpot(g, 0, 'wall', f.x, f.y);
  const ok = g.issue(0, { type: 'build', ids: [rifle.id], building: 'wall', x: w.x, y: w.y });
  assert.equal(ok.ok, true, ok.reason);
  const wall = g.getEntity(ok.id);
  assert.equal(wall.payerId, f.id);
  run(g, 3);
  assert.equal(wall.built, true, 'Schütze baut die Mauer (2 s)');
});

test('buildFob: Baufahrzeug setzt sofort eine FOB-Baustelle, kostet nichts und braucht 400 Material im Lager', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const eng = unitsOf(g, 0, 'engineer')[0];
  const spot = findSpot(g, 0, 'fob', f.x, f.y, 600, 800);
  assert.ok(spot, 'freie FOB-Stelle');
  const bmBefore = g.teams[0].res.bm;

  const r = g.issue(0, { type: 'buildFob', ids: [eng.id], x: spot.x, y: spot.y });
  assert.equal(r.ok, true, r.reason);
  const site = g.getEntity(r.id);
  assert.equal(site.built, false);
  assert.equal(site.supplied, false);
  assert.equal(g.teams[0].res.bm, bmBefore, 'nichts bezahlt');

  // ohne Material: kein Fortschritt, auch mit Baufahrzeug vor Ort
  run(g, 60);
  assert.equal(site.built, false, 'wartet auf Material');
  assert.equal(site.progress, 0);
  assert.ok(g.drainEvents().some((e) => e.text === 'Baustelle wartet auf Material'));

  // 400 Baumaterial in das Lager der Baustelle (wie per LKW): Fortschritt mit Baufahrzeug, dann fertig
  site.store.bm = 400;
  run(g, 25);
  assert.equal(site.supplied, true);
  assert.equal(site.store.bm, 0, 'die 400 wurden verbraucht');
  run(g, 15);
  assert.equal(site.built, true, 'FOB (30 s) fertig');
  assert.equal(g.buildings.filter((b) => b.team === 0 && b.type === 'fob' && b.built).length, 2);
});

test('buildFob: ohne Baufahrzeug in Reichweite wartet die Baustelle, auch mit Material', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = findSpot(g, 0, 'fob', f.x, f.y, 600, 800);
  const site = g.spawnBuilding('fob', 0, g.canPlace(0, 'fob', spot.x, spot.y).cx, g.canPlace(0, 'fob', spot.x, spot.y).cy, { built: false });
  site.store.bm = 400;
  // das Start-Baufahrzeug ist weit weg und hat keinen Auftrag
  const eng = unitsOf(g, 0, 'engineer')[0];
  eng.x = f.x - 1200;
  eng.y = f.y + 1200;
  run(g, 40);
  assert.equal(site.built, false);
  assert.equal(site.progress, 0);
  assert.ok(g.drainEvents().some((e) => e.text === 'Baustelle wartet auf Bauer'));
});

test('Reparatur: Baufahrzeug heilt, kostet Baumaterial aus dem Lager des Zahlers', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  f.hp = f.maxHp - 500;
  const eng = unitsOf(g, 0, 'engineer')[0];
  const bm0 = f.store.bm;
  const r = g.issue(0, { type: 'repair', ids: [eng.id], targetId: f.id });
  assert.equal(r.ok, true, r.reason);
  run(g, 5);
  const healed = f.hp - (f.maxHp - 500);
  assert.ok(healed > 0, 'Schaden geheilt');
  const spent = bm0 - f.store.bm;
  const expected = (BUILDINGS.fob.cost.bm * healed) / f.maxHp * BALANCE.construction.repairCostShare;
  assert.ok(Math.abs(spent - expected) < 0.05, `Kosten ${spent} statt ${expected}`);
  run(g, 60);
  assert.equal(f.hp, f.maxHp, 'vollständig geheilt');
  assert.equal(eng.order.type, 'idle', 'Baufahrzeug wird danach idle');
});

test('Reparatur ohne FOB-Lager in Reichweite findet nicht statt', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const wall = g.spawnBuilding('wall', 0, cellOf(f.x) + 20, cellOf(f.y), { built: true });
  wall.hp = 100;
  const eng = unitsOf(g, 0, 'engineer')[0];
  assert.equal(g.issue(0, { type: 'repair', ids: [eng.id], targetId: wall.id }).ok, true);
  run(g, 10);
  assert.equal(wall.hp, 100);
  assert.equal(eng.order.type, 'idle');
});

test('Erstattung an den Zahler: Ausbildung abbrechen erstattet an die FOB, die bezahlt hat', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const far = fobAt(g, 0, f.x, f.y, 600, 800);
  far.store.mun = 0;
  const money0 = g.teams[0].res.money;
  const r = g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' });
  assert.equal(r.ok, true);
  assert.equal(f.store.mun, BALANCE.startRes.mun - 15);
  assert.equal(g.issue(0, { type: 'cancelTrain', buildingId: f.id }).ok, true);
  assert.equal(f.store.mun, BALANCE.startRes.mun, 'Munition an den Zahler zurück');
  assert.equal(far.store.mun, 0, 'andere FOB unberührt');
  assert.equal(g.teams[0].res.money, money0, 'Geld zurück');
});

test('Abriss einer FOB: Lager geht an die nächste andere FOB, kein Material wird erstattet', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const far = fobAt(g, 0, f.x, f.y, 600, 800);
  far.store.bm = 100;
  f.store.bm = 250;
  const eng = unitsOf(g, 0, 'engineer')[0];
  // Baustelle einer FOB abreißen: nichts bezahlt, nichts erstattet
  const site = g.spawnBuilding('fob', 0, cellOf(f.x) - 8, cellOf(f.y), { built: false });
  site.store.bm = 40;
  assert.equal(g.issue(0, { type: 'demolish', buildingId: site.id }).ok, true);
  assert.equal(f.store.bm, 250 + 40, 'nächste FOB (die Haupt-FOB) nimmt das Baustellenlager');
  assert.equal(far.store.bm, 100, 'fernere FOB unberührt');
  assert.equal(g.issue(0, { type: 'demolish', buildingId: f.id }).ok, true);
  assert.equal(far.store.bm, 100 + 290, 'Lager der abgerissenen FOB geht an die andere; kein Materialgeschenk');
  assert.equal(eng.alive, true);
});

test('Erstattung: Abriss fertiger Gebäude 25 % Baumaterial, Baustelle voll, an den Zahler', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = findSpot(g, 0, 'depot', f.x, f.y);
  const eng = unitsOf(g, 0, 'engineer')[0];
  const r = g.issue(0, { type: 'build', ids: [eng.id], building: 'depot', x: spot.x, y: spot.y });
  const b = g.getEntity(r.id);
  const bm0 = f.store.bm;
  assert.equal(g.issue(0, { type: 'demolish', buildingId: b.id }).ok, true);
  assert.equal(f.store.bm, bm0 + 300, 'Baustelle: volle Erstattung');

  const r2 = g.issue(0, { type: 'build', ids: [eng.id], building: 'depot', x: spot.x, y: spot.y });
  assert.equal(r2.ok, true, r2.reason);
  const b2 = g.getEntity(r2.id);
  run(g, 60);
  assert.equal(b2.built, true);
  const bm1 = f.store.bm;
  g.issue(0, { type: 'demolish', buildingId: b2.id });
  assert.equal(f.store.bm, bm1 + 300 * BALANCE.demolishRefund);
});

/** Mörser (Team 0) bei (600, 3800), Feind-Schütze bei (1000, 3800), eigene Sicht durch Fahrzeughalle. */
function mortarScene(withAA) {
  const g = new Game({ seed: 7 });
  g.spawnBuilding('mortar', 0, cellOf(600) - 1, cellOf(3800) - 1);
  g.spawnBuilding('depot', 0, cellOf(1000) - 1, cellOf(3950) - 1);
  const enemy = g.spawnUnit('rifleman', 1, 1000, 3800);
  if (withAA) {
    g.spawnBuilding('aa', 1, cellOf(800) - 1, cellOf(3950) - 1);
    // Versorger der Flugabwehr: eigene FOB in Reichweite mit Munition
    const f1 = g.spawnBuilding('fob', 1, cellOf(800) - 5, cellOf(3950) - 1);
    f1.store.mun = 200;
  }
  return { g, enemy };
}

test('Mörser: erzeugt eine Granate, die einschlägt', () => {
  const { g, enemy } = mortarScene(false);
  let sawShell = false;
  let sawExplosion = false;
  for (let i = 0; i < Math.round(15 / DT); i++) {
    g.update(DT);
    if (g.projectiles.length > 0) sawShell = true;
    if (g.effects.some((e) => e.type === 'explosion' && dist(e.x, e.y, enemy.x, enemy.y) < 80)) sawExplosion = true;
  }
  assert.equal(sawShell, true, 'Granate entsteht');
  assert.equal(sawExplosion, true, 'Einschlag');
  assert.ok(!enemy.alive || enemy.hp < 100, 'Schaden am Ziel');
});

test('Mörser zahlt Munition aus dem Lager seines Versorgers', () => {
  const { g } = mortarScene(false);
  const f = g.buildings.find((b) => b.team === 0 && b.type === 'fob' && b.built);
  const mun0 = f.store.mun;
  run(g, 15);
  assert.ok(f.store.mun < mun0, 'Lager der FOB leer geschossen');
  assert.ok(g.teams[0].used.mun > 0);
});

test('Flugabwehr fängt Mörsergranaten ab', () => {
  const { g } = mortarScene(true);
  let sawShell = false;
  let sawIntercept = false;
  for (let i = 0; i < Math.round(15 / DT); i++) {
    g.update(DT);
    if (g.projectiles.length > 0) sawShell = true;
    if (g.effects.some((e) => e.type === 'intercept')) sawIntercept = true;
  }
  assert.equal(sawShell, true, 'Granate entsteht');
  assert.equal(sawIntercept, true, 'Abfang');
});

test('Verbrauch: ein Schuss zieht Munition aus dem Einheitenvorrat, nicht aus dem Lager', () => {
  const g = new Game({ seed: 7 });
  const sp = g.map.spawns[0];
  const rifle = g.spawnUnit('rifleman', 0, sp.x + 300, sp.y - 300);
  const enemy = g.spawnUnit('rifleman', 1, rifle.x + 120, rifle.y);
  const stock0 = g.teams[0].res.mun;
  const ammo0 = rifle.ammo;
  assert.equal(g.issue(0, { type: 'attack', ids: [rifle.id], targetId: enemy.id }).ok, true);
  run(g, DT);
  assert.ok(Math.abs(rifle.ammo - (ammo0 - UNITS.rifleman.ammoPerShot)) < 1e-9, `Vorrat ${rifle.ammo}`);
  assert.equal(g.teams[0].res.mun, stock0, 'Lager unberührt');
  assert.ok(Math.abs(g.teams[0].used.mun - UNITS.rifleman.ammoPerShot) < 1e-9);
  assert.ok(rifle.cooldown > 0, 'Abklingzeit läuft nach dem Schuss');
});

test('Verbrauch: leerer Schütze feuert nicht, Abklingzeit läuft nicht an, Mangelmeldung', () => {
  const g = new Game({ seed: 7 });
  const sp = g.map.spawns[0];
  const rifle = g.spawnUnit('rifleman', 0, sp.x + 300, sp.y - 300);
  const enemy = g.spawnUnit('rifleman', 1, rifle.x + 120, rifle.y);
  silence(g, 0);
  g.setStock(0, { bm: BALANCE.startRes.bm, mun: 0, fuel: BALANCE.startRes.fuel }); // kein Nachfüllen aus der FOB
  rifle.ammo = 0;
  assert.equal(g.issue(0, { type: 'attack', ids: [rifle.id], targetId: enemy.id }).ok, true);
  run(g, 3);
  assert.equal(enemy.hp, enemy.maxHp, 'kein Schaden ohne Munition');
  assert.equal(rifle.cooldown, 0);
  assert.equal(rifle.ammo, 0);
  assert.ok(g.drainEvents().some((e) => e.text === 'Einheiten ohne Munition'), 'Mangelmeldung');
});

test('Verbrauch: fahrender Panzer verbraucht Treibstoff aus seinem Vorrat, stehender nicht', () => {
  const still = new Game({ seed: 7 });
  const c = still.zone;
  const t0 = still.spawnUnit('tank', 0, c.x, c.y);
  run(still, 3);
  assert.equal(t0.fuel, UNITS.tank.fuelMax, 'stehend kein Verbrauch');

  const g = new Game({ seed: 7 });
  const tank = g.spawnUnit('tank', 0, c.x, c.y);
  assert.equal(g.issue(0, { type: 'move', ids: [tank.id], x: c.x + 600, y: c.y }).ok, true);
  let moved = 0;
  for (let i = 0; i < 40; i++) {
    const x0 = tank.x;
    const y0 = tank.y;
    g.update(DT);
    if (tank.x !== x0 || tank.y !== y0) moved++;
  }
  assert.ok(moved > 0, 'Panzer ist gefahren');
  const used = UNITS.tank.fuelMax - tank.fuel;
  assert.ok(Math.abs(used - UNITS.tank.fuelPerSec * DT * moved) < 1e-6, `Verbrauch ${used}`);
  assert.ok(Math.abs(g.teams[0].used.fuel - used) < 1e-9);
});

test('Verbrauch: ohne Treibstoff fährt ein Panzer mit 25 % Tempo, Vorrat wird nie negativ', () => {
  const travel = (fuel) => {
    const g = new Game({ seed: 7 });
    const c = g.zone;
    const tank = g.spawnUnit('tank', 0, c.x, c.y);
    tank.fuel = fuel;
    assert.equal(g.issue(0, { type: 'move', ids: [tank.id], x: c.x + 800, y: c.y }).ok, true);
    let d = 0;
    for (let i = 0; i < 40; i++) {
      const x0 = tank.x;
      const y0 = tank.y;
      g.update(DT);
      d += dist(x0, y0, tank.x, tank.y);
    }
    return { d, fuel: tank.fuel };
  };
  const full = travel(UNITS.tank.fuelMax);
  const empty = travel(0);
  assert.ok(full.d > 60, 'Referenzstrecke');
  assert.ok(Math.abs(empty.d / full.d - BALANCE.fuelSlowMul) < 0.02, `Tempoverhältnis ${empty.d / full.d}`);
  assert.equal(empty.fuel, 0);
  const short = travel(0.01);
  assert.equal(short.fuel, 0);
});

test('Verbrauch: FOB-MG feuert ohne Munition im Lager', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  silence(g, 0);
  g.setStock(0, { bm: 0, mun: 0, fuel: 0 });
  const enemy = g.spawnUnit('rifleman', 1, f.x + 150, f.y);
  run(g, 3);
  assert.ok(enemy.hp < enemy.maxHp, 'FOB-MG trifft ohne Munition');
  assert.equal(g.teams[0].res.mun, 0);
  assert.equal(g.teams[0].used.mun, 0, 'FOB-MG verbraucht nichts');
});

test('Determinismus: gleicher Seed, gleiche Partie', () => {
  const play = () => {
    const g = new Game({ seed: 11 });
    const f = fobOf(g, 0);
    const sp = findSpot(g, 0, 'depot', f.x, f.y);
    g.issue(0, { type: 'build', building: 'depot', x: sp.x, y: sp.y });
    g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' });
    run(g, 40);
    return JSON.stringify([g.teams.map((t) => [t.res.money, t.res.bm, t.res.mun]), g.units.map((u) => [u.x, u.y, u.ammo])]);
  };
  assert.equal(play(), play());
});
