import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';

const DT = 0.05;
const TILE = BALANCE.map.tile;

function run(game, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) game.update(DT);
}

const cellOf = (v) => Math.floor(v / TILE);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function fobOf(game, t) {
  return game.buildings.find((b) => b.alive && b.team === t && b.type === 'fob');
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

test('Startzustand: je Team eine fertige FOB, Startunits und Startressourcen', () => {
  const g = new Game({ seed: 7 });
  for (let t = 0; t < 2; t++) {
    const f = fobOf(g, t);
    assert.ok(f, `FOB für Team ${t}`);
    assert.equal(f.built, true);
    assert.equal(f.hp, f.maxHp);
    assert.equal(unitsOf(g, t).length, BALANCE.startUnits.length);
    assert.equal(unitsOf(g, t, 'truck').length, 1);
    assert.equal(unitsOf(g, t, 'rifleman').length, 4);
    assert.deepEqual(g.teams[t].res, BALANCE.startRes);
  }
  assert.equal(g.winner, null);
  assert.equal(g.zone.owner, -1);
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
  // auf dem Vorkommen keine andere Stelle als Förderanlage
  assert.equal(g.canPlace(0, 'depot', node.x, node.y).ok, false);

  // freie Stelle im Radius ist baubar
  assert.ok(findSpot(g, 0, 'depot', f.x, f.y, 0, 400));
});

test('Bau: Gebäude ist erst nach der Bauzeit fertig und kostet sofort', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = findSpot(g, 0, 'depot', f.x, f.y);
  const r = g.issue(0, { type: 'build', building: 'depot', x: spot.x, y: spot.y });
  assert.equal(r.ok, true);
  const b = g.getEntity(r.id);
  assert.equal(b.built, false);
  assert.equal(g.teams[0].res.bm, BALANCE.startRes.bm - 300);

  run(g, 24);
  assert.equal(b.built, false);
  run(g, 2);
  assert.equal(b.built, true);
  assert.equal(b.hp, b.maxHp);
  assert.ok(g.drainEvents().some((e) => e.text === 'Fahrzeughalle fertig'));
});

test('Training: Kosten werden abgezogen und nach der Ausbildungszeit spawnt die Einheit', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const before = unitsOf(g, 0, 'rifleman').length;
  const { money, mun } = g.teams[0].res;
  const r = g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' });
  assert.equal(r.ok, true);
  assert.equal(g.teams[0].res.money, money - 60);
  assert.equal(g.teams[0].res.mun, mun - 15);
  assert.equal(f.queue.length, 1);

  run(g, 8.5);
  assert.equal(unitsOf(g, 0, 'rifleman').length, before + 1);
  assert.equal(f.queue.length, 0);
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
  // mindestens das Kontrollgeld (12/s) muss gezahlt worden sein
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

test('Eliminierung: Team ohne FOB und ohne LKW verliert', () => {
  const g = new Game({ seed: 7 });
  for (const e of [...g.buildings, ...g.units]) {
    if (e.team === 1 && (e.type === 'fob' || e.type === 'truck')) e.hp = 0;
  }
  g.update(DT);
  assert.equal(g.winner, 0);
  assert.equal(g.winReason, 'eliminated');
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
  // die vier Kanten, Ecken zählen je nur einmal
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
  // die Einheit bleibt im Ring (innerhalb der Mauern)
  assert.ok(cellOf(u.x) >= c0 - 1 && cellOf(u.x) <= c0 + 1, `x-Zelle ${cellOf(u.x)}`);
  assert.ok(cellOf(u.y) >= r0 - 1 && cellOf(u.y) <= r0 + 1, `y-Zelle ${cellOf(u.y)}`);
});

test('buildFob: LKW fährt zum Ziel, zahlt beim Errichten und wird zur FOB-Baustelle', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  const truck = unitsOf(g, 0, 'truck')[0];
  const spot = findSpot(g, 0, 'fob', f.x, f.y, 600, 800);
  assert.ok(spot, 'freie FOB-Stelle');
  const bmBefore = g.teams[0].res.bm;

  const r = g.issue(0, { type: 'buildFob', truckId: truck.id, x: spot.x, y: spot.y });
  assert.equal(r.ok, true, r.reason);
  assert.equal(g.teams[0].res.bm, bmBefore, 'Kosten erst beim Errichten');

  run(g, 20);
  assert.equal(truck.alive, false);
  const fobs = g.buildings.filter((b) => b.alive && b.team === 0 && b.type === 'fob');
  assert.equal(fobs.length, 2);
  const site = fobs.find((b) => dist(b.x, b.y, spot.x, spot.y) < 1);
  assert.ok(site, 'FOB-Baustelle am Zielpunkt');
  assert.equal(site.built, false, 'Baustelle (30 s Bauzeit) noch nicht fertig');
  assert.equal(g.teams[0].res.bm, bmBefore - 400);
});

/** Mörser (Team 0) bei (600, 3800), Feind-Schütze bei (1000, 3800), eigene Sicht durch Fahrzeughalle. */
function mortarScene(withAA) {
  const g = new Game({ seed: 7 });
  g.spawnBuilding('mortar', 0, cellOf(600) - 1, cellOf(3800) - 1);
  g.spawnBuilding('depot', 0, cellOf(1000) - 1, cellOf(3950) - 1);
  const enemy = g.spawnUnit('rifleman', 1, 1000, 3800);
  if (withAA) g.spawnBuilding('aa', 1, cellOf(800) - 1, cellOf(3950) - 1);
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

test('Verbrauch: ein Schuss zieht Munition ab', () => {
  const g = new Game({ seed: 7 });
  const sp = g.map.spawns[0];
  const rifle = g.spawnUnit('rifleman', 0, sp.x + 300, sp.y - 300);
  const enemy = g.spawnUnit('rifleman', 1, rifle.x + 120, rifle.y);
  const mun0 = g.teams[0].res.mun;
  assert.equal(g.issue(0, { type: 'attack', ids: [rifle.id], targetId: enemy.id }).ok, true);
  run(g, DT);
  assert.equal(g.teams[0].res.mun, mun0 - UNITS.rifleman.ammoPerShot);
  assert.equal(g.teams[0].used.mun, UNITS.rifleman.ammoPerShot);
  assert.ok(rifle.cooldown > 0, 'Abklingzeit läuft nach dem Schuss');
  assert.ok(g.teams[0].rate.mun < 0, 'Verbrauch fließt negativ in die Rate');
});

test('Verbrauch: ohne Munition wird nicht geschossen und die Abklingzeit läuft nicht an', () => {
  const g = new Game({ seed: 7 });
  const sp = g.map.spawns[0];
  const rifle = g.spawnUnit('rifleman', 0, sp.x + 300, sp.y - 300);
  const enemy = g.spawnUnit('rifleman', 1, rifle.x + 120, rifle.y);
  g.teams[0].res.mun = 0;
  assert.equal(g.issue(0, { type: 'attack', ids: [rifle.id], targetId: enemy.id }).ok, true);
  run(g, 3);
  assert.equal(enemy.hp, enemy.maxHp, 'kein Schaden ohne Munition');
  assert.equal(rifle.cooldown, 0);
  assert.equal(g.teams[0].res.mun, 0);
  assert.equal(g.teams[0].used.mun, 0);
  assert.ok(g.drainEvents().some((e) => e.text.startsWith('Keine Munition')), 'Mangelmeldung');
});

test('Verbrauch: fahrender Panzer verbraucht Treibstoff, stehender nicht', () => {
  const still = new Game({ seed: 7 });
  const c = still.zone;
  still.spawnUnit('tank', 0, c.x, c.y);
  const f0 = still.teams[0].res.fuel;
  run(still, 3);
  assert.equal(still.teams[0].res.fuel, f0, 'stehend kein Verbrauch');

  const g = new Game({ seed: 7 });
  const tank = g.spawnUnit('tank', 0, c.x, c.y);
  const fuel0 = g.teams[0].res.fuel;
  assert.equal(g.issue(0, { type: 'move', ids: [tank.id], x: c.x + 600, y: c.y }).ok, true);
  let moved = 0;
  for (let i = 0; i < 40; i++) {
    const x0 = tank.x;
    const y0 = tank.y;
    g.update(DT);
    const mv = tank.x !== x0 || tank.y !== y0;
    if (mv) moved++;
    // Rate je Tick: -fuelPerSec, wenn gefahren wurde, sonst 0
    assert.ok(Math.abs(g.teams[0].rate.fuel + (mv ? UNITS.tank.fuelPerSec : 0)) < 1e-9, `Rate im Tick ${i}`);
  }
  assert.ok(moved > 0, 'Panzer ist gefahren');
  const used = fuel0 - g.teams[0].res.fuel;
  assert.ok(Math.abs(used - UNITS.tank.fuelPerSec * DT * moved) < 1e-9, `Verbrauch ${used}`);
  assert.ok(Math.abs(g.teams[0].used.fuel - used) < 1e-9);
});

test('Verbrauch: ohne Treibstoff fährt ein Panzer mit 25 % Tempo, Vorrat wird nie negativ', () => {
  const travel = (fuel) => {
    const g = new Game({ seed: 7 });
    const c = g.zone;
    const tank = g.spawnUnit('tank', 0, c.x, c.y);
    g.teams[0].res.fuel = fuel;
    assert.equal(g.issue(0, { type: 'move', ids: [tank.id], x: c.x + 800, y: c.y }).ok, true);
    let d = 0;
    for (let i = 0; i < 40; i++) {
      const x0 = tank.x;
      const y0 = tank.y;
      g.update(DT);
      d += dist(x0, y0, tank.x, tank.y);
    }
    return { d, fuel: g.teams[0].res.fuel };
  };
  const full = travel(150);
  const empty = travel(0);
  assert.ok(full.d > 60, 'Referenzstrecke');
  assert.ok(Math.abs(empty.d / full.d - BALANCE.fuelSlowMul) < 0.02, `Tempoverhältnis ${empty.d / full.d}`);
  assert.equal(empty.fuel, 0);
  // Vorrat reicht nur für einen Teil: der Rest wird nicht negativ
  const short = travel(0.01);
  assert.equal(short.fuel, 0);
});

test('Verbrauch: FOB-MG feuert ohne Munition', () => {
  const g = new Game({ seed: 7 });
  const f = fobOf(g, 0);
  g.teams[0].res.mun = 0;
  const enemy = g.spawnUnit('rifleman', 1, f.x + 150, f.y);
  run(g, 3);
  assert.ok(enemy.hp < enemy.maxHp, 'FOB-MG trifft ohne Munition');
  assert.equal(g.teams[0].res.mun, 0);
  assert.equal(g.teams[0].used.mun, 0);
});
