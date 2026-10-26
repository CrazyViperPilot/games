// Sendemast: zweite Siegbedingung (nach dem Wunder aus Age of Empires II). Nur wenn eingeschaltet; einer je Team; fertig für den
// Gegner überall sichtbar; nach `hold` s Sieg; zerstört beginnt die Zeit von vorn. Die KI baut einen und greift fremde an.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { BALANCE } from '../js/data/balance.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { hit } from '../js/game/combat.js';
import { radioLeft, radioEta } from '../js/game/radio.js';
import { Controller } from '../js/ui/controller.js';

const R = BALANCE.radio;
const DT = 1 / BALANCE.tickRate;
const run = (g, s, ais = []) => {
  for (let i = 0; i < Math.round(s / DT); i++) {
    for (const a of ais) a.update(DT);
    g.update(DT);
  }
};
const mainOf = (g, t) => g.buildings.find((b) => b.main && b.team === t);
const spot = (g, t) => {
  const f = mainOf(g, t);
  return { x: f.x + (t ? -200 : 200), y: f.y + (t ? -150 : 150) };
};
/** Fertiger Mast für Team t neben seiner Haupt-FOB. */
function builtMast(g, t) {
  const p = g.canPlace(t, 'radio', spot(g, t).x, spot(g, t).y);
  assert.ok(p.ok, p.reason);
  return g.spawnBuilding('radio', t, p.cx, p.cy, { built: true });
}

test('Ausgeschaltet (Standard): kein Sendemast im Baumenü, Platzieren abgelehnt', () => {
  const g = new Game({ seed: 3 });
  assert.equal(g.radioWin, false);
  const p = g.canPlace(0, 'radio', spot(g, 0).x, spot(g, 0).y);
  assert.ok(!p.ok && /ausgeschaltet/.test(p.reason));
  const c = new Controller(g, 0, null);
  c.view.selection.add(g.units.find((u) => u.team === 0 && u.type === 'engineer').id);
  c.startBuildMenu();
  assert.ok(!c.commandCard().some((e) => e.hotkey === 'G'));
});

test('Eingeschaltet: Baufahrzeug baut ihn (Geld + Baumaterial), einer je Team, der Gegner erfährt den Baubeginn', () => {
  const g = new Game({ seed: 3, radio: true });
  const msgs = [];
  const orig = g.message.bind(g);
  g.message = (team, text, x, y) => (msgs.push([team, text]), orig(team, text, x, y));
  g.teams[0].res.money = 5000;
  const eng = g.units.find((u) => u.team === 0 && u.type === 'engineer');
  const c = new Controller(g, 0, null);
  c.view.selection.add(eng.id);
  c.startBuildMenu();
  const e = c.commandCard().find((x) => x.hotkey === 'G');
  assert.ok(e && e.enabled, 'Taste G im Baumenü');
  const r = g.issue(0, { type: 'build', ids: [eng.id], building: 'radio', ...spot(g, 0) });
  assert.ok(r.ok, r.reason);
  assert.equal(g.teams[0].res.money, 5000 - BUILDINGS.radio.cost.money);
  assert.ok(msgs.some(([t, s]) => t === 1 && /baut einen Sendemast/.test(s)));
  const again = g.canPlace(0, 'radio', spot(g, 0).x - 400, spot(g, 0).y);
  assert.ok(!again.ok && /Nur ein Sendemast/.test(again.reason));
  assert.ok(!c.commandCard().find((x) => x.hotkey === 'G').enabled);
  run(g, BUILDINGS.radio.buildTime + 15);
  const b = g.getEntity(r.id);
  assert.ok(b.built, 'fertig gebaut');
});

test('Fertig: der Gegner sieht ihn überall (auch im Nebel); nach hold s gewinnt sein Team', () => {
  const g = new Game({ seed: 3, radio: true });
  const b = builtMast(g, 0);
  g.updateFog();
  assert.ok(!g.isVisible(1, b.x, b.y), 'liegt im Nebel des Gegners');
  assert.ok(g.sees(1, b), 'trotzdem sichtbar');
  run(g, R.hold - 5);
  assert.equal(g.winner, null);
  assert.ok(radioLeft(b) <= 5.1 && radioLeft(b) > 4.9);
  run(g, 6);
  assert.equal(g.winner, 0);
  assert.equal(g.winReason, 'radio');
});

test('Zerstört: Zeit verfällt, ein neuer Mast beginnt von vorn; Baustelle zählt in der Schätzung mit der Bauzeit', () => {
  const g = new Game({ seed: 3, radio: true });
  const b = builtMast(g, 1);
  run(g, 100);
  assert.ok(Math.abs(radioLeft(b) - (R.hold - 100)) < 0.2);
  hit(g, b, 1e9);
  g.update(DT);
  assert.ok(!g.buildings.includes(b));
  const b2 = builtMast(g, 1);
  g.update(DT);
  assert.ok(radioLeft(b2) > R.hold - 1, 'neuer Mast: volle Zeit');
  const p = g.canPlace(0, 'radio', spot(g, 0).x, spot(g, 0).y);
  const site = g.spawnBuilding('radio', 0, p.cx, p.cy, { built: false });
  assert.ok(Math.abs(radioEta(site) - (BUILDINGS.radio.buildTime + R.hold)) < 1);
  run(g, 200);
  assert.equal(g.winner, null, 'Baustelle zählt nicht');
});

test('KI: baut ab ihrer Zeit einen Sendemast hinter der Haupt-FOB (spart vorher darauf)', () => {
  const g = new Game({ seed: 3, radio: true });
  const ai = new AI(g, 1, 'hard');
  g.time = 600;
  g.teams[1].res.money = 500;
  run(g, 3, [ai]);
  assert.ok(ai.saveForRadio, 'spart');
  g.teams[1].res.money = 6000;
  run(g, 6, [ai]);
  const site = g.buildings.find((b) => b.team === 1 && b.def.radio);
  assert.ok(site, 'Baustelle gesetzt');
  const f = mainOf(g, 1);
  const dz = (p) => Math.hypot(p.x - g.zone.x, p.y - g.zone.y);
  assert.ok(dz(site) > dz(f) - 100, 'nicht vor der Haupt-FOB Richtung Zone');
});

test('KI: gegen einen fremden Mast sammelt sie die Armee und greift ihn an', () => {
  const g = new Game({ seed: 3, radio: true });
  const ai = new AI(g, 1, 'normal');
  const b = builtMast(g, 0);
  run(g, 90, [ai]);
  const army = g.units.filter((u) => u.alive && u.team === 1 && u.def.range > 0 && !u.def.hero);
  const onIt = army.filter(
    (u) => (u.order.type === 'attack' && u.order.targetId === b.id) || (u.order.type === 'attackMove' && Math.hypot(u.order.x - b.x, u.order.y - b.y) < 400),
  );
  assert.ok(ai.strike && ai.strike.go, 'Schlag läuft');
  assert.ok(onIt.length >= 0.6 * army.length, `${onIt.length} von ${army.length} gegen den Mast`);
});
