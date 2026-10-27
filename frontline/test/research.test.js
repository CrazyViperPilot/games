// Forschungsstufen: Stufe 2 und 3 schalten Einheiten frei, Verbesserungen stärken Panzerung, Reichweite und Sicht. Nur die Haupt-FOB
// forscht, eins zugleich, Geld beim Start, Abbruch erstattet. Die KI forscht nach Zeitplan. Aus (Standard): alles frei.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { BALANCE } from '../js/data/balance.js';
import { AI } from '../js/ai/ai.js';
import { hit } from '../js/game/combat.js';
import { unitLocked, armorMul, opticsMul, researchEffect } from '../js/game/research.js';
import { Controller } from '../js/ui/controller.js';
import { setWeather } from '../js/game/weather.js';

const R = BALANCE.research;
const DT = 1 / BALANCE.tickRate;
const run = (g, s, ais = []) => {
  for (let i = 0; i < Math.round(s / DT); i++) {
    for (const a of ais) a.update(DT);
    g.update(DT);
  }
};
const mainOf = (g, t) => g.buildings.find((b) => b.main && b.team === t);

/** Leere Karte ohne Starteinheiten (Haupt-FOBs bleiben). */
function empty(opts = {}) {
  const g = new Game({ map: createEmptyMap(), ...opts });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  return g;
}
const train = (g, unit, t = 0) => g.issue(t, { type: 'train', buildingId: mainOf(g, t).id, unit });
const research = (g, key, t = 0) => g.issue(t, { type: 'research', buildingId: mainOf(g, t).id, key });

test('Aus (Standard): alle Einheiten frei, keine Forschung, alle Faktoren 1', () => {
  const g = empty({ seed: 4 });
  assert.equal(g.research, false);
  g.teams[0].res.money = 5000;
  assert.ok(train(g, 'tank').ok);
  assert.ok(train(g, 'gunship').ok);
  assert.deepEqual(research(g, 'tier2'), { ok: false, reason: 'Forschung ist in dieser Partie ausgeschaltet' });
  const u = g.spawnUnit('rifleman', 0, 500, 500);
  assert.equal(armorMul(g, u, 30), 1);
  assert.equal(opticsMul(g, 0), 1);
  assert.equal(unitLocked(g, 0, 'tank'), false);
});

test('Gesperrt: Stufe 2 für Scharfschütze, SPz und Hubschrauber, Stufe 3 für Kampfpanzer und AH-64; der Rest von Anfang an', () => {
  const g = empty({ research: true });
  g.teams[0].res.money = 9000;
  for (const u of ['sniper', 'ifv', 'littlebird', 'transporter']) assert.deepEqual(train(g, u), { ok: false, reason: 'Benötigt Stufe 2' }, u);
  for (const u of ['tank', 'gunship']) assert.deepEqual(train(g, u), { ok: false, reason: 'Benötigt Stufe 3' }, u);
  for (const u of ['rifleman', 'at', 'truck', 'engineer', 'commander']) assert.ok(train(g, u).ok, u);
  assert.equal(g.teams[0].res.money, 9000 - 60 - 120 - 80 - 150 - 400, 'gesperrte Ausbildung kostet nichts');
  // die Startarmee bleibt (Kampfpanzer und Schützenpanzer schon auf Stufe 1)
  const full = new Game({ seed: 2, research: true });
  assert.equal(full.units.filter((u) => u.team === 0 && u.type === 'tank').length, 2);
});

test('Forschung: Geld beim Start, eine zugleich, Stufe 2 nach 60 s mit Meldung an beide; dann Stufe 3 und Verbesserungen', () => {
  const g = empty({ research: true });
  const t0 = g.teams[0];
  t0.res.money = 5000;
  assert.deepEqual(research(g, 'tier3'), { ok: false, reason: 'Benötigt Stufe 2' });
  assert.deepEqual(research(g, 'vests'), { ok: false, reason: 'Benötigt Stufe 2' });
  assert.ok(research(g, 'tier2').ok);
  assert.equal(t0.res.money, 5000 - R.items.tier2.money);
  assert.deepEqual(research(g, 'tier2'), { ok: false, reason: 'Wird gerade erforscht' });
  g.drainEvents();
  run(g, R.items.tier2.time - 1);
  assert.equal(t0.tech.tier, 1);
  assert.equal(train(g, 'ifv').reason, 'Benötigt Stufe 2');
  run(g, 1.5);
  assert.equal(t0.tech.tier, 2);
  assert.equal(t0.tech.cur, null);
  const msgs = g.drainEvents().filter((e) => e.type === 'message');
  assert.ok(msgs.some((m) => m.team === 0 && m.text === 'Stufe 2 erreicht: Scharfschütze, Schützenpanzer, Little Bird, Transporthubschrauber und Flakpanzer freigeschaltet'));
  assert.ok(msgs.some((m) => m.team === 1 && m.text === 'Der Gegner hat Stufe 2 erreicht'));
  assert.ok(train(g, 'ifv').ok);
  assert.equal(train(g, 'tank').reason, 'Benötigt Stufe 3');
  assert.deepEqual(research(g, 'tier2'), { ok: false, reason: 'Bereits erforscht' });
  assert.deepEqual(research(g, 'composite'), { ok: false, reason: 'Benötigt Stufe 3' });
  assert.ok(research(g, 'vests').ok);
  assert.deepEqual(research(g, 'tier3'), { ok: false, reason: 'Es läuft schon eine Forschung' });
  run(g, R.items.vests.time + 0.5);
  assert.deepEqual(t0.tech.done, ['tier2', 'vests']);
  assert.ok(g.drainEvents().some((e) => e.type === 'message' && e.team === 0 && e.text === `Schutzwesten erforscht: ${researchEffect('vests')}`));
  assert.ok(research(g, 'tier3').ok);
  run(g, R.items.tier3.time + 0.5);
  assert.equal(t0.tech.tier, 3);
  assert.ok(train(g, 'tank').ok);
  assert.equal(g.teams[1].tech.tier, 1, 'der Gegner forscht für sich');
});

test('Abbruch erstattet das Geld; nur die Haupt-FOB forscht; ohne Geld keine Forschung', () => {
  const g = empty({ research: true });
  const t0 = g.teams[0];
  t0.res.money = 700;
  assert.deepEqual(g.issue(0, { type: 'cancelResearch' }), { ok: false, reason: 'Keine Forschung läuft' });
  assert.ok(research(g, 'tier2').ok);
  run(g, 20);
  assert.ok(g.issue(0, { type: 'cancelResearch' }).ok);
  assert.equal(t0.res.money, 700);
  assert.equal(t0.tech.cur, null);
  run(g, 60);
  assert.equal(t0.tech.tier, 1, 'abgebrochen: keine Stufe');
  const fob = g.spawnBuilding('fob', 0, 100, 100, { built: true });
  assert.deepEqual(g.issue(0, { type: 'research', buildingId: fob.id, key: 'tier2' }), { ok: false, reason: 'Nur die Haupt-FOB forscht' });
  assert.deepEqual(g.issue(0, { type: 'research', buildingId: mainOf(g, 1).id, key: 'tier2' }), { ok: false, reason: 'Nur die Haupt-FOB forscht' });
  t0.res.money = 100;
  assert.deepEqual(research(g, 'tier2'), { ok: false, reason: 'Zu wenig Geld' });
});

test('Panzerung: Schutzwesten (Infanterie) und Verbundpanzerung (Fahrzeuge, Hubschrauber) −15 %; ein tödlicher Volltreffer bleibt tödlich', () => {
  const g = empty({ research: true });
  const tech = g.teams[0].tech;
  const inf = g.spawnUnit('rifleman', 0, 500, 500);
  const tank = g.spawnUnit('tank', 0, 600, 500);
  const heli = g.spawnUnit('littlebird', 0, 700, 500);
  const take = (u, amount) => {
    const hp = u.hp;
    hit(g, u, amount);
    return Math.round((hp - u.hp) * 1000) / 1000;
  };
  assert.deepEqual([take(inf, 20), take(tank, 100), take(heli, 20)], [20, 100, 20]);
  tech.done.push('vests');
  assert.deepEqual([take(inf, 20), take(tank, 100), take(heli, 20)], [17, 100, 20]);
  tech.done.push('composite');
  assert.deepEqual([take(inf, 20), take(tank, 100), take(heli, 20)], [17, 85, 17]);
  assert.equal(take(g.spawnUnit('rifleman', 1, 800, 500), 20), 20, 'der Gegner hat nichts erforscht');
  const fresh = g.spawnUnit('rifleman', 0, 900, 500);
  hit(g, fresh, fresh.def.hp * 1.001); // Scharfschütze, Panzerfaust: ein Treffer tötet
  assert.equal(fresh.alive, false, 'Volltreffer bleibt tödlich');
});

test('Wärmebildoptik: Waffenreichweite +10 % (schießt ohne heranzufahren) und Sicht +10 % (Nebel des Krieges)', () => {
  const shoot = (optics) => {
    const g = empty({ research: true });
    if (optics) g.teams[0].tech.done.push('optics');
    const me = g.spawnUnit('rifleman', 0, 2000, 2000);
    const truck = g.spawnUnit('truck', 1, 2000 + 215, 2000); // Gewehr 200 + LKW-Radius 10 = 210 < 215 < 230
    g.updateFog();
    g.issue(0, { type: 'attack', ids: [me.id], targetId: truck.id });
    run(g, 1.5);
    return [Math.round(me.x - 2000), truck.hp < truck.maxHp];
  };
  const [movedOff] = shoot(false);
  assert.ok(movedOff > 3, `ohne Optik fährt der Schütze heran (${movedOff} px)`);
  assert.deepEqual(shoot(true), [0, true]);

  const sees = (optics) => {
    const g = empty({ research: true });
    if (optics) g.teams[0].tech.done.push('optics');
    g.spawnUnit('sniper', 0, 32 + 64 * 30, 32 + 64 * 30); // Sicht 440, mit Optik 484
    const foe = g.spawnUnit('rifleman', 1, 32 + 64 * 38, 32 + 64 * 30); // 512 px: Zelle sichtbar bis Sicht + halbe Zelle
    g.updateFog();
    return g.sees(0, foe);
  };
  assert.equal(sees(false), false);
  assert.equal(sees(true), true);
  const g = empty({ research: true });
  g.teams[1].tech.done.push('optics');
  assert.deepEqual([opticsMul(g, 0), opticsMul(g, 1)], [1, R.optics]);
});

test('Befehlskarte: Haupt-FOB zeigt Forschung (U), gesperrte Einheiten mit Grund; Forschungsmenü startet und bricht ab', () => {
  const g = empty({ research: true });
  g.teams[0].res.money = 3000;
  const c = new Controller(g, 0, null);
  c.view.selection.add(mainOf(g, 0).id);
  const card = () => c.commandCard();
  const btn = (k) => card().find((e) => e.hotkey === k);
  assert.equal(btn('S').reason, 'Benötigt Stufe 3', 'Kampfpanzer gesperrt');
  assert.equal(btn('A').reason, 'Benötigt Stufe 2', 'Schützenpanzer gesperrt');
  assert.equal(btn('U').label, 'Forschung');
  c.handleHotkey('U');
  assert.equal(c.view.mode, 'research');
  assert.deepEqual(card().map((e) => e.hotkey), ['Q', 'W', 'E', 'R', 'C', 'Esc']);
  assert.equal(btn('Q').label, 'Stufe 2');
  assert.equal(btn('W').reason, 'Benötigt Stufe 2');
  assert.equal(btn('C').enabled, false);
  c.handleHotkey('Q');
  assert.equal(g.teams[0].tech.cur.key, 'tier2');
  assert.equal(c.view.mode, 'normal', 'zurück zur Ausbildung');
  assert.equal(btn('U').active, true, 'Forschung läuft');
  c.handleHotkey('U');
  assert.equal(btn('Q').reason, 'Wird gerade erforscht');
  c.handleHotkey('C');
  assert.equal(g.teams[0].tech.cur, null);
  assert.equal(g.teams[0].res.money, 3000);
  c.cancel();
  assert.equal(c.view.mode, 'normal');
  g.teams[0].tech.tier = 2;
  g.teams[0].tech.done.push('tier2');
  c.handleHotkey('U');
  assert.equal(btn('Q').label, 'Stufe 3');
  // ohne Forschung: kein Eintrag
  const off = empty();
  const c2 = new Controller(off, 0, null);
  c2.view.selection.add(mainOf(off, 0).id);
  assert.equal(c2.commandCard().find((e) => e.label === 'Forschung'), undefined);
  assert.equal(c2.commandCard().find((e) => e.hotkey === 'S').reason, '');
});

test('KI: spart nach Zeitplan auf Stufe 2 (Leicht später), forscht Verbesserungen aus Überschuss (nicht Leicht), bildet nichts Gesperrtes aus', () => {
  const setup = (diff, time, money) => {
    const g = new Game({ seed: 5, research: true });
    const ai = new AI(g, 1, diff);
    g.units.filter((u) => u.team === 1 && u.type === 'rifleman').slice(0, 20).forEach((u) => (u.alive = false));
    g.cleanup();
    g.time = time;
    g.teams[1].res.money = money;
    return { g, ai, tech: g.teams[1].tech };
  };
  let { g, ai, tech } = setup('normal', 140, 5000);
  ai.think();
  assert.equal(tech.cur, null, 'vor dem Zeitplan keine Stufe');
  ({ g, ai, tech } = setup('normal', 150, 5000));
  ai.think();
  assert.equal(tech.cur?.key, 'tier2');
  const queued = mainOf(g, 1).queue.map((e) => e.unit);
  assert.ok(queued.length > 0, 'bildet weiter aus');
  assert.ok(queued.every((u) => !unitLocked(g, 1, u)), `nichts Gesperrtes: ${queued.join(', ')}`);

  ({ g, ai, tech } = setup('normal', 150, 400));
  ai.think();
  assert.equal(tech.cur, null);
  assert.equal(ai.saveForResearch, true);
  assert.ok(mainOf(g, 1).queue.every((e) => ['engineer', 'truck'].includes(e.unit)), 'spart: keine Kampfeinheiten');

  ({ g, ai, tech } = setup('easy', 200, 5000));
  ai.think();
  assert.equal(tech.cur, null, 'Leicht erst ab 240 s');
  g.time = 240;
  ai.think();
  assert.equal(tech.cur?.key, 'tier2');

  // nach Stufe 2: Verbesserung aus Überschuss (Normal), Leicht nicht
  for (const diff of ['normal', 'easy']) {
    ({ g, ai, tech } = setup(diff, 200, 3000));
    tech.tier = 2;
    tech.done.push('tier2');
    ai.think();
    assert.equal(tech.cur?.key ?? null, diff === 'easy' ? null : 'vests', diff);
  }
  // Schwer: Stufe 3 ab 420 s
  ({ g, ai, tech } = setup('hard', 420, 5000));
  tech.tier = 2;
  tech.done.push('tier2');
  ai.think();
  assert.equal(tech.cur?.key, 'tier3');
});

test('KI: kein Späher vor Stufe 2 (Little Bird gesperrt), auch nicht bei Nebel', () => {
  const g = new Game({ seed: 7, research: true });
  const ai = new AI(g, 1, 'normal');
  g.teams[1].res.money = 5000;
  g.units.filter((u) => u.team === 1 && u.type === 'rifleman').slice(0, 10).forEach((u) => (u.alive = false));
  g.cleanup();
  g.time = 100;
  setWeather(g, 'fog');
  g.weather.next = Infinity;
  ai.think();
  assert.equal(ai.saveForScout, false);
  assert.ok(!mainOf(g, 1).queue.some((e) => e.unit === 'littlebird'));
});
