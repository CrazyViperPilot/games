// Kommandeur: einmalig je Team, Aura (schneller schießen, Infanterie heilt), sein Tod bringt dem Gegner Punkte, die Haupt-FOB bildet
// einen neuen aus; die KI hält ihn hinter der Armee und ersetzt ihn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { hasCommander } from '../js/game/commander.js';
import { hit } from '../js/game/combat.js';
import { Controller } from '../js/ui/controller.js';

const C = BALANCE.commander;
const DT = 1 / BALANCE.tickRate;
const run = (g, s, ais = []) => {
  for (let i = 0; i < Math.round(s / DT); i++) {
    for (const a of ais) a.update(DT);
    g.update(DT);
  }
};
const commanderOf = (g, t) => g.units.find((u) => u.alive && u.team === t && u.def.hero);
const mainOf = (g, t) => g.buildings.find((b) => b.main && b.team === t);

/** Leere Karte ohne Startarmee. */
function empty() {
  const g = new Game({ map: createEmptyMap() });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  return g;
}

test('Start: je Team genau ein Kommandeur nahe der Haupt-FOB; er belegt keinen Platz und zählt nicht als Soldat', () => {
  const g = new Game({ seed: 7 });
  for (const t of [0, 1]) {
    const cs = g.units.filter((u) => u.team === t && u.def.hero);
    assert.equal(cs.length, 1);
    assert.equal(cs[0].type, 'commander');
    const f = mainOf(g, t);
    assert.ok(Math.hypot(cs[0].x - f.x, cs[0].y - f.y) < 600);
    assert.equal(g.slotsUsed(t), 52, 'Startarmee belegt 52 Plätze');
    assert.equal(g.soldierCount(t), 29);
    assert.ok(hasCommander(g, t));
  }
});

test('Einmalig: ein zweiter wird abgelehnt (auch in der Warteschlange); nach seinem Tod bildet die Haupt-FOB einen neuen aus (C)', () => {
  const g = new Game({ seed: 7 });
  const f = mainOf(g, 0);
  g.teams[0].res.money = 5000;
  const r = g.issue(0, { type: 'train', buildingId: f.id, unit: 'commander' });
  assert.ok(!r.ok && /Kommandeur/.test(r.reason));
  const c = commanderOf(g, 0);
  hit(g, c, 1e6);
  g.update(DT);
  assert.ok(!hasCommander(g, 0));
  const ctl = new Controller(g, 0, null);
  ctl.view.selection.add(f.id);
  const entry = ctl.commandCard().find((e) => e.hotkey === 'C');
  assert.ok(entry && entry.enabled, 'Taste C bildet aus');
  entry.action();
  assert.ok(hasCommander(g, 0), 'in der Warteschlange zählt er schon');
  assert.ok(!g.issue(0, { type: 'train', buildingId: f.id, unit: 'commander' }).ok, 'kein zweiter in der Warteschlange');
  assert.ok(!ctl.commandCard().find((e) => e.hotkey === 'C').enabled);
  run(g, UNITS.commander.buildTime + 2);
  assert.ok(commanderOf(g, 0), 'neuer Kommandeur');
});

test('Aura: eigene Einheiten im Umkreis schießen um fireRate schneller, außerhalb nicht', () => {
  const g = empty();
  const cmd = g.spawnUnit('commander', 0, 1000, 1000);
  const near = g.spawnUnit('rifleman', 0, 1000 + C.aura - 40, 1000);
  const far = g.spawnUnit('rifleman', 0, 1000 + C.aura + 400, 1000);
  g.spawnUnit('rifleman', 1, near.x + 150, near.y + 60);
  g.spawnUnit('rifleman', 1, far.x + 150, far.y + 60);
  assert.ok(cmd.alive);
  let cdNear = null;
  let cdFar = null;
  for (let i = 0; i < 40 && (cdNear === null || cdFar === null); i++) {
    g.update(DT);
    if (cdNear === null && near.weapons[0].cd > 0) cdNear = near.weapons[0].cd;
    if (cdFar === null && far.weapons[0].cd > 0) cdFar = far.weapons[0].cd;
  }
  const base = UNITS.rifleman.weapons[0].cooldown;
  assert.ok(near.aura && !far.aura);
  assert.ok(Math.abs(cdNear - base / C.fireRate) < 1e-6, `in der Aura ${cdNear}`);
  assert.ok(Math.abs(cdFar - base) < 1e-6, `außerhalb ${cdFar}`);
});

test('Heilung: verletzte Infanterie im Umkreis heilt, aber erst healDelay s nach dem letzten Treffer; Fahrzeuge nicht', () => {
  const g = empty();
  g.spawnUnit('commander', 0, 1000, 1000);
  const a = g.spawnUnit('rifleman', 0, 1100, 1000);
  const b = g.spawnUnit('rifleman', 0, 1000 + C.aura + 300, 1000);
  const tank = g.spawnUnit('tank', 0, 1000, 1150);
  for (const u of [a, b]) u.hp = 40;
  tank.hp = 500;
  a.lastHitTime = g.time; // gerade getroffen
  run(g, C.healDelay - 1);
  assert.equal(a.hp, 40, 'noch keine Heilung');
  run(g, 1 + 10);
  assert.ok(Math.abs(a.hp - (40 + C.heal * 10)) < 0.5, `geheilt auf ${a.hp}`);
  assert.equal(b.hp, 40, 'außerhalb keine Heilung');
  assert.equal(tank.hp, 500, 'Fahrzeuge heilen nicht');
  run(g, 60);
  assert.equal(a.hp, a.maxHp, 'höchstens volle Lebenspunkte');
});

test('Tod: der Gegner bekommt deathPoints Punkte (kann die Partie entscheiden), beide erfahren es', () => {
  const g = new Game({ seed: 7, winPoints: 100 });
  const msgs = [];
  const orig = g.message.bind(g);
  g.message = (team, text, x, y) => {
    msgs.push([team, text]);
    return orig(team, text, x, y);
  };
  hit(g, commanderOf(g, 1), 1e6);
  g.update(DT);
  assert.equal(g.teams[0].points, C.deathPoints);
  assert.ok(msgs.some(([t, s]) => t === 1 && /Kommandeur/.test(s)) && msgs.some(([t, s]) => t === 0 && /Kommandeur/.test(s)));
  g.teams[1].points = 100 - C.deathPoints;
  hit(g, commanderOf(g, 0), 1e6);
  g.update(DT);
  assert.equal(g.winner, 1);
  assert.equal(g.winReason, 'points');
});

test('Als Passagier: fällt das Fahrzeug, fällt der Kommandeur mit (Punkte für den Gegner)', () => {
  const g = empty();
  const ifv = g.spawnUnit('ifv', 0, 1000, 1000);
  const c = g.spawnUnit('commander', 0, 1010, 1000);
  assert.ok(g.issue(0, { type: 'board', ids: [c.id], heliId: ifv.id }).ok);
  run(g, 3);
  assert.ok(ifv.passengers.includes(c), 'eingestiegen');
  assert.ok(hasCommander(g, 0), 'an Bord zählt er');
  hit(g, ifv, 1e6);
  g.update(DT);
  assert.equal(g.teams[1].points, C.deathPoints);
  assert.ok(!hasCommander(g, 0));
});

test('KI: Kommandeur nie in der Angriffswelle, folgt der Armee; ein gefallener wird ersetzt', () => {
  const g = new Game({ seed: 3 });
  const ais = [new AI(g, 0, 'normal'), new AI(g, 1, 'normal')];
  let attack = 0;
  let moved = 0;
  const start = { x: commanderOf(g, 0).x, y: commanderOf(g, 0).y };
  for (let s = 0; s < 240; s++) {
    run(g, 1, ais);
    for (const t of [0, 1]) if (commanderOf(g, t)?.order.type === 'attackMove') attack++;
  }
  const c = commanderOf(g, 0);
  if (c) moved = Math.hypot(c.x - start.x, c.y - start.y);
  assert.equal(attack, 0, 'nie im Angriffsbefehl');
  assert.ok(moved > 500, `rückt mit der Armee vor (${Math.round(moved)} px)`);
  hit(g, commanderOf(g, 1), 1e6);
  g.teams[1].res.money = 3000;
  run(g, 10, ais);
  assert.ok(hasCommander(g, 1), 'KI bildet einen neuen aus');
});
