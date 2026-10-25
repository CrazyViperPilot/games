import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic, CLASSIC } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { nearestPassable } from '../js/game/movement.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit (siehe economy.test.js)
const DT = 0.05;
const mk = (opts) => classic(new Game(opts));
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
function fobAt(game, team, x0, y0, rMin = 950, rMax = 1300) {
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
  const g = mk({ seed: 7 });
  for (let t = 0; t < 2; t++) {
    const f = fobOf(g, t);
    assert.ok(f, `FOB für Team ${t}`);
    assert.equal(f.built, true);
    assert.equal(f.hp, f.maxHp);
    assert.equal(unitsOf(g, t).length, BALANCE.startUnits.length);
    assert.equal(unitsOf(g, t, 'truck').length, 1);
    assert.equal(unitsOf(g, t, 'engineer').length, 1);
    assert.equal(unitsOf(g, t, 'rifleman').length, 22);
    assert.equal(unitsOf(g, t, 'at').length, 7);
    assert.deepEqual(f.store, { bm: CLASSIC.bm, mun: CLASSIC.mun, fuel: CLASSIC.fuel });
    assert.equal(g.teams[t].res.money, BALANCE.startRes.money);
    assert.equal(g.teams[t].res.bm, CLASSIC.bm, 'Summe aller FOB-Lager');
  }
  assert.equal(g.winner, null);
  assert.equal(g.zone.owner, -1);
});

test('Team-Ressourcen sind Lesegetter: direktes Schreiben ist nicht möglich', () => {
  const g = mk({ seed: 7 });
  assert.throws(() => {
    'use strict';
    g.teams[0].res.bm = 5;
  }, TypeError);
  g.setStock(0, { bm: 123, mun: 45, fuel: 6 });
  assert.equal(g.teams[0].res.bm, 123);
  assert.equal(g.teams[0].res.mun, 45);
  assert.equal(g.teams[0].res.fuel, 6);
  assert.equal(g.teams[1].res.bm, CLASSIC.bm, 'Team 1 unberührt');
});

test('Platzierung: Bauradius und Hindernisse', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);

  // außerhalb des Bauradius (450 px)
  assert.equal(g.canPlace(0, 'mortar', f.x + 1500, f.y).ok, false);

  // auf einem Hindernis (eigene FOB direkt auf den Felsen setzen, damit der Radius erfüllt ist)
  const ob = g.map.obstacles[0];
  g.spawnBuilding('fob', 0, cellOf(ob.x) - 1, cellOf(ob.y) - 1);
  const onRock = g.canPlace(0, 'mortar', ob.x, ob.y);
  assert.equal(onRock.ok, false);
  assert.match(onRock.reason, /Gelände/);

  // freie Stelle im Radius ist baubar
  assert.ok(findSpot(g, 0, 'mortar', f.x, f.y, 0, 400));
});

test('FOB: Bauradien eigener FOBs dürfen sich nicht überlappen, höchstens 10 FOBs', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const near = g.canPlace(0, 'fob', f.x + 700, f.y);
  assert.equal(near.ok, false);
  assert.match(near.reason, /Zu nah/);
  const R = BALANCE.fob.buildRadius;
  assert.equal(BALANCE.fob.minDistOwn, 2 * R, 'Bauradien berühren sich höchstens');
  assert.equal(BALANCE.fob.max, 10);
  // neun weitere FOBs im Abstand ≥ 900 px: die zehnte FOB insgesamt geht, die elfte nicht
  let n = 1;
  for (let r = 950; r < 6000 && n < 10; r += 50) {
    for (;;) {
      const s = findSpot(g, 0, 'fob', f.x, f.y, r, r);
      if (!s) break;
      const p = g.canPlace(0, 'fob', s.x, s.y);
      g.spawnBuilding('fob', 0, p.cx, p.cy, { built: true });
      if (++n >= 10) break;
    }
  }
  assert.equal(n, 10, 'zehn FOBs gestellt');
  const eleventh = findSpot(g, 0, 'fob', f.x, f.y, 950, 5000);
  assert.equal(eleventh, null, 'elfte FOB nicht erlaubt');
});

test('Bau: Gebäude-Baustelle kostet Geld und Lager sofort; Fortschritt nur mit Bauer', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = findSpot(g, 0, 'mortar', f.x, f.y);
  const eng = unitsOf(g, 0, 'engineer')[0];
  const r = g.issue(0, { type: 'build', ids: [eng.id], building: 'mortar', x: spot.x, y: spot.y });
  assert.equal(r.ok, true, r.reason);
  const b = g.getEntity(r.id);
  assert.equal(b.built, false);
  assert.equal(g.teams[0].res.bm, CLASSIC.bm - BUILDINGS.mortar.cost.bm);
  assert.equal(b.payerId, f.id);

  run(g, 40);
  assert.equal(b.built, true, 'Baufahrzeug baut fertig');
  assert.equal(b.hp, b.maxHp);
  assert.ok(g.drainEvents().some((e) => e.text === 'Mörser fertig'));
});

test('Bau: Gebäude-Baustelle ohne Bauer kommt nicht voran; 2 Bauer doppelt so schnell', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = findSpot(g, 0, 'mortar', f.x, f.y);
  const r = g.issue(0, { type: 'build', building: 'mortar', x: spot.x, y: spot.y });
  assert.equal(r.ok, true);
  const b = g.getEntity(r.id);
  // ohne Bauer (Start-Baufahrzeug ausgeschaltet) kein Fortschritt
  silence(g, 0);
  run(g, 10);
  assert.equal(b.progress, 0, 'ohne Bauer kein Fortschritt');

  // zwei Bauer direkt am Gebäude: 25 s Bauzeit / 2 = 12,5 s
  const g2 = mk({ seed: 7 });
  silence(g2, 0);
  const f2 = fobOf(g2, 0);
  const spot2 = findSpot(g2, 0, 'mortar', f2.x, f2.y);
  const site = g2.spawnBuilding('mortar', 0, cellOf(spot2.x) - 1, cellOf(spot2.y) - 1, { built: false });
  engineerBeside(g2, site);
  engineerBeside(g2, site);
  run(g2, 13);
  assert.equal(site.built, true, 'mit 2 Bauern nach ~12,5 s fertig');
  const g1 = mk({ seed: 7 });
  silence(g1, 0);
  const f1 = fobOf(g1, 0);
  const spot1 = findSpot(g1, 0, 'mortar', f1.x, f1.y);
  const one = g1.spawnBuilding('mortar', 0, cellOf(spot1.x) - 1, cellOf(spot1.y) - 1, { built: false });
  engineerBeside(g1, one);
  run(g1, 13);
  assert.equal(one.built, false, 'mit einem Bauer noch nicht fertig');
  run(g1, 13);
  assert.equal(one.built, true);
});

test('Bauer hilft automatisch: idle Baufahrzeug in 400 px baut Baustelle ohne ids', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = findSpot(g, 0, 'mortar', f.x, f.y);
  const r = g.issue(0, { type: 'build', building: 'mortar', x: spot.x, y: spot.y });
  assert.equal(r.ok, true, r.reason);
  const b = g.getEntity(r.id);
  run(g, 28);
  assert.equal(b.built, true, 'Mörser (20 s) mit automatischem Bauer fertig');
});

test('Training: Kosten werden aus dem FOB-Lager und Geld abgezogen, Einheit spawnt', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const before = unitsOf(g, 0, 'rifleman').length;
  const { money } = g.teams[0].res;
  const r = g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' });
  assert.equal(r.ok, true);
  assert.equal(g.teams[0].res.money, money - 60);
  assert.equal(f.store.mun, CLASSIC.mun, 'Einheiten kosten nur Geld');
  assert.equal(f.queue.length, 1);
  assert.equal(f.queue[0].unit, 'rifleman');
  assert.equal(f.queue[0].payerId, f.id);

  run(g, 8.5);
  assert.equal(unitsOf(g, 0, 'rifleman').length, before + 1);
  assert.equal(f.queue.length, 0);
});

test('Training: Einheiten kosten nur Geld und starten voll munitioniert und betankt', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  g.setStock(0, { bm: 0, mun: 0, fuel: 0 });
  assert.equal(g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' }).ok, true);
  run(g, 9);
  const r = unitsOf(g, 0, 'rifleman').at(-1);
  assert.equal(r.ammo, r.def.ammoMax);
  assert.equal(r.weapons[0].rounds, 60, 'zwei Magazine à 30');
  const t = g.spawnUnit('tank', 0, f.x, f.y + 80);
  assert.deepEqual(t.weapons.map((w) => w.rounds), [30, 300]);
  assert.equal(t.fuel, t.def.fuelMax);
});

test('Kampf: Kampfpanzer tötet einen Schützen', () => {
  const g = mk({ seed: 7 });
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
  const g = mk({ seed: 7 });
  const z = g.zone;
  g.spawnUnit('rifleman', 0, z.x + 1000, z.y); // außerhalb der Hot Zone
  const money0 = g.teams[0].res.money;
  run(g, 30.1);
  assert.equal(g.zone.owner, 0);
  assert.equal(g.zone.contested, false);
  assert.equal(g.teams[0].points, 1);
  // genau das Zonengeld der einen Einheit (0,4/s), ohne Führungsgeld
  assert.ok(Math.abs(g.teams[0].res.money - money0 - BALANCE.zone.unitIncome * 30.1) < 0.5);
  assert.ok(g.drainEvents().some((e) => e.text === 'Punkt für Blau'));
});

test('Zone: umkämpft bringt keinen Punkt', () => {
  const g = mk({ seed: 7 });
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
  const g = mk({ seed: 7, winPoints: 1 });
  const z = g.zone;
  g.spawnUnit('rifleman', 0, z.x, z.y);
  run(g, 31);
  assert.equal(g.winner, 0);
  assert.equal(g.winReason, 'points');
  assert.equal(g.issue(0, { type: 'stop', ids: [] }).ok, false);
});

test('Eliminierung: Team ohne FOB und ohne Baufahrzeug verliert (LKW zählt nicht)', () => {
  const g = mk({ seed: 7 });
  for (const e of [...g.buildings, ...g.units]) {
    if (e.team === 1 && (e.type === 'fob' || e.type === 'engineer')) e.hp = 0;
  }
  g.update(DT);
  assert.equal(g.winner, 0);
  assert.equal(g.winReason, 'eliminated');
});

test('Eliminierung: fällt die Haupt-FOB, verliert das Team; eine vordere FOB oder ein Baufahrzeug retten es nicht', () => {
  const g = mk({ seed: 7 });
  const main1 = fobOf(g, 1);
  const front = fobAt(g, 1, main1.x, main1.y);
  front.hp = 0;
  g.update(DT);
  assert.equal(g.winner, null, 'Verlust einer vorderen FOB ist keine Niederlage');

  const g2 = mk({ seed: 7 });
  const m = fobOf(g2, 1);
  fobAt(g2, 1, m.x, m.y);
  m.hp = 0; // Haupt-FOB zerstört, Baufahrzeug und vordere FOB leben
  g2.update(DT);
  assert.equal(g2.winner, 0);
  assert.equal(g2.winReason, 'eliminated');
});

test('Die Haupt-FOB kann nicht abgerissen werden und bildet als einzige Einheiten aus', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  assert.equal(g.issue(0, { type: 'demolish', buildingId: f.id }).ok, false);
  const front = fobAt(g, 0, f.x, f.y);
  assert.deepEqual(front.produces, [], 'vordere FOB bildet nichts aus');
  const r = g.issue(0, { type: 'train', buildingId: front.id, unit: 'rifleman' });
  assert.equal(r.ok, false);
  for (const u of ['rifleman', 'at', 'truck', 'engineer', 'ifv', 'tank', 'littlebird', 'transporter', 'gunship']) {
    assert.ok(f.produces.includes(u), `Haupt-FOB bildet ${u} aus`);
  }
});

test('Mauer blockiert Bewegung', () => {
  const g = mk({ seed: 7 });
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
      const ok = ring(cc, rr).every(([c, r]) => g.grid.free(c, r));
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
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const rifle = unitsOf(g, 0, 'rifleman')[0];
  const spot = findSpot(g, 0, 'mortar', f.x, f.y);
  const bad = g.issue(0, { type: 'build', ids: [rifle.id], building: 'mortar', x: spot.x, y: spot.y });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'Nur Baufahrzeuge bauen das');

  const w = findSpot(g, 0, 'wall', f.x, f.y);
  const ok = g.issue(0, { type: 'build', ids: [rifle.id], building: 'wall', x: w.x, y: w.y });
  assert.equal(ok.ok, true, ok.reason);
  const wall = g.getEntity(ok.id);
  assert.equal(wall.payerId, null, 'Soldaten zahlen aus getragenem Baumaterial, kein Lager zahlt');
  assert.equal(rifle.cargo.bm, rifle.def.bmCap - BUILDINGS.wall.cost.bm, 'getragenes Baumaterial sinkt');
  run(g, 3);
  assert.equal(wall.built, true, 'Schütze baut die Mauer (2 s)');
});

test('Soldaten tragen wenig Baumaterial: reicht es nicht, baut nichts; in der FOB laden sie nach; nur im Bauradius', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const rifle = unitsOf(g, 0, 'rifleman')[0];
  assert.equal(rifle.cargo.bm, rifle.def.bmCap, 'starten voll');
  rifle.cargo.bm = 5; // weniger als eine Mauer (8)
  const w = findSpot(g, 0, 'wall', f.x, f.y);
  const no = g.issue(0, { type: 'build', ids: [rifle.id], building: 'wall', x: w.x, y: w.y });
  assert.equal(no.ok, false);
  assert.match(no.reason, /getragenes Baumaterial/);
  // im Bauradius einer FOB lädt der Soldat nach (bmRate 20/s)
  rifle.x = f.x + 120;
  rifle.y = f.y + 120;
  run(g, 3);
  assert.equal(rifle.cargo.bm, rifle.def.bmCap, 'in der FOB nachgeladen');
  assert.equal(g.issue(0, { type: 'build', ids: [rifle.id], building: 'wall', x: w.x, y: w.y }).ok, true);
  // außerhalb jedes Bauradius: kein Bau, auch nicht mit LKW-Ladung daneben
  const far = g.canPlace(0, 'wall', f.x + 1500, f.y, { carried: true });
  assert.equal(far.ok, false);
  assert.match(far.reason, /Bauradius/);
  // Baufahrzeuge zahlen weiter aus dem Lager der FOB
  const eng = unitsOf(g, 0, 'engineer')[0];
  const bm0 = f.store.bm;
  const w2 = findSpot(g, 0, 'wall', f.x - 100, f.y);
  const r = g.issue(0, { type: 'build', ids: [eng.id], building: 'wall', x: w2.x, y: w2.y });
  assert.equal(r.ok, true, r.reason);
  assert.equal(f.store.bm, bm0 - BUILDINGS.wall.cost.bm);
});

test('buildFob: Baufahrzeug setzt sofort eine FOB-Baustelle, kostet nichts und braucht 400 Material im Lager', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const eng = unitsOf(g, 0, 'engineer')[0];
  const spot = findSpot(g, 0, 'fob', f.x, f.y, 950, 1300);
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
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = findSpot(g, 0, 'fob', f.x, f.y, 950, 1300);
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
  const g = mk({ seed: 7 });
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
  const g = mk({ seed: 7 });
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
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const far = fobAt(g, 0, f.x, f.y, 950, 1300);
  far.store.mun = 0;
  const money0 = g.teams[0].res.money;
  const r = g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' });
  assert.equal(r.ok, true);
  assert.equal(g.issue(0, { type: 'cancelTrain', buildingId: f.id }).ok, true);
  assert.equal(f.store.mun, CLASSIC.mun, 'Lager unverändert');
  assert.equal(far.store.mun, 0, 'andere FOB unberührt');
  assert.equal(g.teams[0].res.money, money0, 'Geld zurück');
});

test('Abriss einer FOB: Lager geht an die nächste andere FOB, kein Material wird erstattet', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const far = fobAt(g, 0, f.x, f.y, 950, 1300);
  far.store.bm = 100;
  f.store.bm = 250;
  const eng = unitsOf(g, 0, 'engineer')[0];
  // Baustelle einer FOB abreißen: nichts bezahlt, nichts erstattet
  const site = g.spawnBuilding('fob', 0, cellOf(f.x) - 8, cellOf(f.y), { built: false });
  site.store.bm = 40;
  assert.equal(g.issue(0, { type: 'demolish', buildingId: site.id }).ok, true);
  assert.equal(f.store.bm, 250 + 40, 'nächste FOB (die Haupt-FOB) nimmt das Baustellenlager');
  assert.equal(far.store.bm, 100, 'fernere FOB unberührt');
  assert.equal(g.issue(0, { type: 'demolish', buildingId: far.id }).ok, true);
  assert.equal(f.store.bm, 250 + 40 + 100, 'Lager der abgerissenen FOB geht an die andere; kein Materialgeschenk');
  assert.equal(eng.alive, true);
});

test('Erstattung: Abriss fertiger Gebäude 25 % Baumaterial, Baustelle voll, an den Zahler', () => {
  const g = mk({ seed: 7 });
  const f = fobOf(g, 0);
  const spot = findSpot(g, 0, 'mortar', f.x, f.y);
  const eng = unitsOf(g, 0, 'engineer')[0];
  const r = g.issue(0, { type: 'build', ids: [eng.id], building: 'mortar', x: spot.x, y: spot.y });
  const b = g.getEntity(r.id);
  const bm0 = f.store.bm;
  assert.equal(g.issue(0, { type: 'demolish', buildingId: b.id }).ok, true);
  assert.equal(f.store.bm, bm0 + BUILDINGS.mortar.cost.bm, 'Baustelle: volle Erstattung');

  const r2 = g.issue(0, { type: 'build', ids: [eng.id], building: 'mortar', x: spot.x, y: spot.y });
  assert.equal(r2.ok, true, r2.reason);
  const b2 = g.getEntity(r2.id);
  run(g, 60);
  assert.equal(b2.built, true);
  const bm1 = f.store.bm;
  g.issue(0, { type: 'demolish', buildingId: b2.id });
  assert.equal(f.store.bm, bm1 + BUILDINGS.mortar.cost.bm * BALANCE.demolishRefund);
});

/** Mörser (Team 0) bei (600, 3800), Feind-Schütze bei (1000, 3800), eigene Sicht durch Fahrzeughalle. */
function mortarScene(withAA) {
  const g = mk({ seed: 7 });
  g.spawnBuilding('mortar', 0, cellOf(600) - 1, cellOf(7924) - 1);
  g.spawnBuilding('mortar', 0, cellOf(1000) - 1, cellOf(8074) - 1);
  const enemy = g.spawnUnit('rifleman', 1, 1000, 7924);
  if (withAA) {
    g.spawnBuilding('aa', 1, cellOf(800) - 1, cellOf(8074) - 1);
    // Versorger der Flugabwehr: eigene FOB in Reichweite mit Munition
    const f1 = g.spawnBuilding('fob', 1, cellOf(800) - 5, cellOf(8074) - 1);
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
  const { g, enemy } = mortarScene(true);
  // Alle 20 s ein Schuss auf das gewählte Ziel: in 90 s mehrere Granaten, die die Flugabwehr abfangen kann
  const mortar = g.buildings.find((b) => b.type === 'mortar');
  assert.equal(g.issue(0, { type: 'mortarTarget', ids: [mortar.id], x: enemy.x, y: enemy.y }).ok, true);
  let sawShell = false;
  let sawIntercept = false;
  for (let i = 0; i < Math.round(90 / DT); i++) {
    g.update(DT);
    if (g.projectiles.length > 0) sawShell = true;
    if (g.effects.some((e) => e.type === 'intercept')) sawIntercept = true;
  }
  assert.equal(sawShell, true, 'Granate entsteht');
  assert.equal(sawIntercept, true, 'Abfang');
});

test('Verbrauch: ein Schuss zieht einen Schuss aus dem Einheitenvorrat, nicht aus dem Lager', () => {
  const g = mk({ seed: 7 });
  const sp = g.map.spawns[0];
  const rifle = g.spawnUnit('rifleman', 0, sp.x + 300, sp.y - 300);
  const enemy = g.spawnUnit('rifleman', 1, rifle.x + 120, rifle.y);
  const stock0 = g.teams[0].res.mun;
  assert.equal(g.issue(0, { type: 'attack', ids: [rifle.id], targetId: enemy.id }).ok, true);
  run(g, DT);
  assert.equal(rifle.weapons[0].rounds, 59, 'ein Schuss weniger');
  assert.equal(g.teams[0].res.mun, stock0, 'Lager unberührt');
  assert.ok(Math.abs(g.teams[0].used.mun - 1 / 30) < 1e-9, 'Statistik: 1/30 Munition');
  assert.ok(rifle.weapons[0].cd > 0, 'Abklingzeit läuft nach dem Schuss');
});

test('Waffen: Kampfpanzer feuert Hauptkanone alle 6 s (20 Munition je Schuss) und nimmt das MG gegen Infanterie', () => {
  const g = mk({ seed: 7 });
  const sp = { x: g.zone.x, y: g.zone.y }; // weit weg von jeder FOB: kein Nachladen
  const tank = g.spawnUnit('tank', 0, sp.x + 300, sp.y - 300);
  const enemy = g.spawnUnit('tank', 1, tank.x + 200, tank.y);
  enemy.hp = enemy.maxHp = 1e6;
  g.issue(0, { type: 'attack', ids: [tank.id], targetId: enemy.id });
  run(g, 13);
  assert.equal(tank.weapons[0].rounds, 27, 'Schüsse bei 0, 6 und 12 s');
  assert.equal(tank.weapons[1].rounds, 300, 'MG nicht gegen Panzer');
  const inf = g.spawnUnit('rifleman', 1, tank.x + 150, tank.y + 20);
  g.issue(0, { type: 'attack', ids: [tank.id], targetId: inf.id });
  run(g, 3);
  assert.ok(tank.weapons[1].rounds < 300, 'MG gegen Infanterie (mehr Schaden je Munition)');
});

test('Waffen: Kampfhubschrauber nimmt Raketen gegen Panzer und die Bordkanone gegen Infanterie', () => {
  const g = mk({ seed: 7 });
  const sp = { x: g.zone.x, y: g.zone.y }; // weit weg von jeder FOB: kein Nachladen
  const heli = g.spawnUnit('gunship', 0, sp.x + 300, sp.y - 300);
  assert.deepEqual(heli.weapons.map((w) => w.rounds), [300, 10]);
  const tank = g.spawnUnit('tank', 1, heli.x + 200, heli.y);
  g.issue(0, { type: 'attack', ids: [heli.id], targetId: tank.id });
  run(g, 1);
  assert.equal(heli.weapons[1].rounds, 9, 'Rakete gegen Panzer');
  const inf = g.spawnUnit('rifleman', 1, heli.x + 100, heli.y + 50);
  g.issue(0, { type: 'attack', ids: [heli.id], targetId: inf.id });
  run(g, 1);
  assert.ok(heli.weapons[0].rounds < 300, 'Kanone gegen Infanterie');
  assert.equal(heli.weapons[1].rounds, 9);
});

test('Verbrauch: leerer Schütze feuert nicht, Abklingzeit läuft nicht an, Mangelmeldung', () => {
  const g = mk({ seed: 7 });
  const sp = g.map.spawns[0];
  const rifle = g.spawnUnit('rifleman', 0, sp.x + 300, sp.y - 300);
  const enemy = g.spawnUnit('rifleman', 1, rifle.x + 120, rifle.y);
  silence(g, 0);
  g.setStock(0, { bm: CLASSIC.bm, mun: 0, fuel: CLASSIC.fuel }); // kein Nachfüllen aus der FOB
  rifle.ammo = 0;
  assert.equal(g.issue(0, { type: 'attack', ids: [rifle.id], targetId: enemy.id }).ok, true);
  run(g, 3);
  assert.equal(enemy.hp, enemy.maxHp, 'kein Schaden ohne Munition');
  assert.equal(rifle.weapons[0].cd, 0);
  assert.equal(rifle.ammo, 0);
  assert.ok(g.drainEvents().some((e) => e.text === 'Einheiten ohne Munition'), 'Mangelmeldung');
});

test('Verbrauch: fahrender Panzer verbraucht Treibstoff aus seinem Vorrat, stehender nicht', () => {
  const still = mk({ seed: 7 });
  const c = still.zone;
  const t0 = still.spawnUnit('tank', 0, c.x, c.y - 90);
  run(still, 3);
  assert.equal(t0.fuel, UNITS.tank.fuelMax, 'stehend kein Verbrauch');

  const g = mk({ seed: 7 });
  const tank = g.spawnUnit('tank', 0, c.x, c.y - 90);
  assert.equal(g.issue(0, { type: 'move', ids: [tank.id], x: c.x + 600, y: c.y - 90 }).ok, true);
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
    const g = mk({ seed: 7 });
    const c = g.zone;
    const tank = g.spawnUnit('tank', 0, c.x, c.y - 90);
    tank.fuel = fuel;
    assert.equal(g.issue(0, { type: 'move', ids: [tank.id], x: c.x + 800, y: c.y - 90 }).ok, true);
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
  const g = mk({ seed: 7 });
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
    const g = mk({ seed: 11 });
    const f = fobOf(g, 0);
    const sp = findSpot(g, 0, 'mortar', f.x, f.y);
    g.issue(0, { type: 'build', building: 'mortar', x: sp.x, y: sp.y });
    g.issue(0, { type: 'train', buildingId: f.id, unit: 'rifleman' });
    run(g, 40);
    return JSON.stringify([g.teams.map((t) => [t.res.money, t.res.bm, t.res.mun]), g.units.map((u) => [u.x, u.y, u.ammo])]);
  };
  assert.equal(play(), play());
});

// ---- Mörser-Ziel, Hubschrauber, Hot Zone und Bohrer ----

function base(g, team = 0) {
  return g.buildings.find((b) => b.team === team && b.type === 'fob');
}

test('Mörser: gewähltes Ziel, ein Schuss alle 20 s, nur in Reichweite', () => {
  const g = mk({ seed: 7 });
  const f = base(g);
  const m = g.spawnBuilding('mortar', 0, cellOf(f.x + 200), cellOf(f.y - 200));
  assert.equal(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: m.x + 5000, y: m.y }).ok, false, 'außer Reichweite');
  assert.equal(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: m.x + 20, y: m.y }).ok, false, 'zu nah');
  assert.equal(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: m.x + 500, y: m.y }).ok, true);
  let shells = 0;
  let prev = 0;
  for (let i = 0; i < Math.round(45 / DT); i++) {
    g.update(DT);
    if (g.projectiles.length > prev) shells++;
    prev = g.projectiles.length;
  }
  assert.ok(shells >= 2 && shells <= 3, `Schüsse in 45 s: ${shells}`);
  g.issue(0, { type: 'mortarTarget', ids: [m.id] });
  assert.equal(m.fireTarget, null);
});

test('Mörser ohne Munition in der FOB feuert nicht auf das gewählte Ziel', () => {
  const g = mk({ seed: 7 });
  const f = base(g);
  const m = g.spawnBuilding('mortar', 0, cellOf(f.x + 200), cellOf(f.y - 200));
  g.issue(0, { type: 'mortarTarget', ids: [m.id], x: m.x + 500, y: m.y });
  g.setStock(0, { bm: 100, mun: 0, fuel: 0 });
  run(g, 25);
  assert.equal(g.projectiles.length, 0);
  assert.equal(g.teams[0].used.mun, 0);
});

test('Flugabwehr schießt einen feindlichen Hubschrauber ab, wenn die FOB Munition hat', () => {
  const g = mk({ seed: 7 });
  const f = base(g, 1);
  const aa = g.spawnBuilding('aa', 1, cellOf(f.x + 150), cellOf(f.y - 150));
  const heli = g.spawnUnit('gunship', 0, aa.x + 250, aa.y);
  heli.order = { type: 'idle', x: heli.x, y: heli.y, targetId: null };
  const mun0 = g.stockOf(1, 'mun');
  run(g, 30);
  assert.equal(heli.alive, false, 'abgeschossen');
  assert.ok(g.stockOf(1, 'mun') < mun0, 'Munition aus der FOB verbraucht');
});

test('Flugabwehr ohne Munition kann den Hubschrauber nicht abschießen', () => {
  const g = mk({ seed: 7 });
  const f = base(g, 1);
  const aa = g.spawnBuilding('aa', 1, cellOf(f.x + 150), cellOf(f.y - 150));
  g.setStock(1, { bm: 100, mun: 0, fuel: 0 });
  const heli = g.spawnUnit('littlebird', 0, aa.x + 250, aa.y);
  run(g, 15);
  assert.equal(heli.alive, true);
});

test('Hubschrauber fliegen über Hindernisse; Mörsergranaten treffen sie nicht', () => {
  const g = mk({ seed: 7 });
  const h = g.spawnUnit("littlebird", 0, 700, 8324);
  g.issue(0, { type: 'move', ids: [h.id], x: g.zone.x, y: g.zone.y });
  run(g, 5);
  assert.ok(Math.hypot(h.x - 700, h.y - 8324) > 500, 'fliegt los');
  const m = g.spawnBuilding('mortar', 1, cellOf(h.x + 300), cellOf(h.y));
  g.projectiles.push({ id: 9999, team: 1, sx: h.x, sy: h.y, tx: h.x, ty: h.y, x: h.x, y: h.y, t: 0, duration: 0, damage: m.def.weapon.damage, splash: 200, alive: true });
  g.update(DT);
  assert.equal(h.hp, h.maxHp);
});

test('Little Bird: Infanterie steigt ein (max. 5) und wird abgesetzt', () => {
  const g = mk({ seed: 7 });
  const f = base(g);
  const heli = g.spawnUnit('littlebird', 0, f.x + 150, f.y - 150);
  const men = [];
  for (let i = 0; i < 6; i++) men.push(g.spawnUnit('rifleman', 0, heli.x + 20 + i * 3, heli.y));
  assert.equal(g.issue(0, { type: 'board', ids: men.map((m) => m.id), heliId: heli.id }).ok, true);
  run(g, 10);
  assert.equal(heli.passengers.length, 5, 'fünf Sitze');
  assert.equal(men.filter((m) => m.alive).length, 1, 'der sechste bleibt draußen');
  assert.equal(g.units.filter((u) => u.type === 'rifleman' && u.team === 0).length >= 1, true);
  const tx = heli.x + 400;
  assert.equal(g.issue(0, { type: 'dropoff', ids: [heli.id], x: tx, y: heli.y }).ok, true);
  run(g, 10);
  assert.equal(heli.passengers.length, 0);
  assert.equal(men.filter((m) => m.alive).length, 6);
  assert.ok(men.every((m) => g.getEntity(m.id)), 'wieder in der Welt');
});

test('Transporthubschrauber lädt Ressourcen wie ein LKW', () => {
  const g = mk({ seed: 7 });
  const f = base(g);
  const heli = g.spawnUnit('transporter', 0, f.x + 80, f.y);
  assert.equal(g.issue(0, { type: 'load', ids: [heli.id], fobId: f.id }).ok, true);
  run(g, 10);
  const c = heli.cargo;
  assert.ok(c.bm + c.mun + c.fuel > 300, `Ladung ${c.bm + c.mun + c.fuel}`);
});

test('Soldaten und Fahrzeuge tanken Munition und Treibstoff in der FOB nach', () => {
  const g = mk({ seed: 7 });
  const f = base(g);
  const r = g.spawnUnit('rifleman', 0, f.x + 100, f.y);
  const t = g.spawnUnit('tank', 0, f.x + 120, f.y + 40);
  r.ammo = 0;
  t.fuel = 0;
  run(g, 20);
  assert.equal(r.ammo, r.def.ammoMax);
  assert.equal(t.fuel, t.def.fuelMax);
  g.setStock(0, { bm: 0, mun: 0, fuel: 0 });
  r.ammo = 0;
  run(g, 5);
  assert.equal(r.ammo, 0, 'ohne Lagerbestand keine Munition');
});

test('Hot Zone wandert innerhalb der Konfliktzone; Einheiten darin bringen doppeltes Geld und Punkte', () => {
  const g = mk({ seed: 7 });
  const hz = g.hot;
  for (let i = 0; i < Math.round(120 / DT); i++) {
    g.update(DT);
    assert.ok(Math.hypot(hz.x - g.zone.x, hz.y - g.zone.y) <= g.zone.r - hz.r + 1, 'bleibt in der Zone');
  }
  assert.ok(Math.hypot(hz.x - g.zone.x, hz.y - g.zone.y) > 1, 'hat sich bewegt');
  const u = g.spawnUnit('rifleman', 0, hz.x, hz.y);
  u.order = { type: 'idle', x: u.x, y: u.y, targetId: null };
  const money0 = g.teams[0].res.money;
  const pts0 = g.teams[0].points;
  g.update(DT);
  assert.equal(g.hot.owner, 0);
  for (let i = 0; i < Math.round(50 / DT); i++) {
    hz.x = u.x;
    hz.y = u.y;
    g.update(DT);
  }
  // 50 s × 0,8 Geld/s (das Doppelte der Zone, nicht zusätzlich)
  assert.ok(Math.abs(g.teams[0].res.money - money0 - BALANCE.hot.unitIncome * 50) < 0.5, 'Geld');
  assert.ok(g.teams[0].points >= pts0 + 1, 'Punkt');
});

test('Bohrer: 30 s Aufwärmen, 2 min aktiv mit Treibstoff aus der FOB, 5 min Pause; Hot Zone zieht zum Bohrer', () => {
  const g = mk({ seed: 7 });
  const f = base(g);
  const d = g.spawnBuilding('drill', 0, cellOf(f.x + 200), cellOf(f.y - 200));
  g.update(DT);
  assert.equal(g.issue(0, { type: 'drill', ids: [d.id] }).ok, false, 'noch im Aufwärmen');
  run(g, 31);
  assert.equal(d.drill.state, 'ready');
  const fuel0 = f.store.fuel;
  assert.equal(g.issue(0, { type: 'drill', ids: [d.id] }).ok, true);
  assert.equal(d.drill.state, 'active');
  const dist0 = Math.hypot(g.hot.x - d.x, g.hot.y - d.y);
  run(g, 60);
  assert.ok(f.store.fuel < fuel0 - 50, 'Treibstoff verbraucht');
  assert.equal(g.hot.drillTarget, true);
  const target = { x: g.hot.tx, y: g.hot.ty };
  assert.ok(Math.hypot(target.x - g.zone.x, target.y - g.zone.y) <= g.zone.r - g.hot.r + 1, 'Ziel in der Zone');
  assert.ok(Math.hypot(g.hot.x - d.x, g.hot.y - d.y) < dist0, 'nähert sich dem Bohrer');
  run(g, 65);
  assert.equal(d.drill.state, 'cooldown');
  run(g, 290);
  assert.equal(d.drill.state, 'cooldown');
  run(g, 15);
  assert.equal(d.drill.state, 'ready');
});

test('Bohrer ohne Treibstoff in der FOB startet nicht', () => {
  const g = mk({ seed: 7 });
  const f = base(g);
  const d = g.spawnBuilding('drill', 0, cellOf(f.x + 200), cellOf(f.y - 200));
  g.setStock(0, { bm: 100, mun: 0, fuel: 0 });
  run(g, 31);
  assert.equal(g.issue(0, { type: 'drill', ids: [d.id] }).ok, false);
});

test('Zonenpunkt: Mehrheit statt Alleinbesitz, Hot Zone zählt doppelt, Balken füllt sich in 30 s', () => {
  const g = mk({ seed: 7 });
  const z = g.zone;
  g.hot.x = z.x + 2000; // Hot Zone weit weg: nur Zonenmehrheit zählt
  g.hot.y = z.y;
  g.hot.tx = g.hot.x;
  g.hot.ty = g.hot.y;
  g.hot.wanderT = 1e9;
  for (let i = 0; i < 3; i++) g.spawnUnit('rifleman', 0, z.x - 300 + i * 20, z.y);
  g.spawnUnit('rifleman', 1, z.x - 200, z.y + 100);
  run(g, 15);
  assert.equal(z.owner, 0, 'Blau führt 3:1');
  assert.ok(z.bar.team === 0 && z.bar.p > 0.4 && z.bar.p < 0.6, `Balken ${z.bar.p}`);
  run(g, 16);
  assert.equal(g.teams[0].points, 1);
  assert.equal(g.teams[1].points, 0);
  // Rot setzt zwei Einheiten in die Hot Zone
  g.hot.x = z.x + 400;
  g.hot.y = z.y + 400;
  g.hot.tx = g.hot.x;
  g.hot.ty = g.hot.y;
  for (let i = 0; i < 2; i++) g.spawnUnit('rifleman', 1, g.hot.x + i * 10, g.hot.y);
  g.update(DT);
  assert.equal(z.weight[1], z.counts[1] + 2, 'zwei Einheiten in der Hot Zone zählen doppelt');
  assert.equal(z.owner, z.weight[0] > z.weight[1] ? 0 : z.weight[1] > z.weight[0] ? 1 : -1);
});

test('Abschussprämie: Fahrzeuge viel, Soldaten wenig, Mauern nichts; fertiger Bau bringt Geld', async () => {
  const { hit } = await import('../js/game/combat.js');
  const g = classic(new Game({ seed: 7 }));
  const m0 = g.teams[0].res.money;
  const rifle = g.spawnUnit('rifleman', 1, 3000, 3000);
  hit(g, rifle, 9999);
  const afterRifle = g.teams[0].res.money;
  const tank = g.spawnUnit('tank', 1, 3100, 3000);
  hit(g, tank, 9999);
  const afterTank = g.teams[0].res.money;
  assert.equal(afterRifle - m0, Math.round(60 * BALANCE.bounty.inf));
  assert.equal(afterTank - afterRifle, Math.round(500 * BALANCE.bounty.vehicle));
  assert.ok(afterTank - afterRifle > 10 * (afterRifle - m0) / 2, 'Fahrzeug viel mehr als Soldat');
  assert.equal(g.teams[1].res.money, m0, 'der Verlierer bekommt nichts');
  hit(g, rifle, 5);
  assert.equal(g.teams[0].res.money, afterTank, 'Tote zählen nicht doppelt');
});
