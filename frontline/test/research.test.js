// Forschungsbaum (seit v5.04): 10 Stufen, 7 Äste, je Stufe 3 fertige Forschungen öffnen die nächste, Vorgänger im Ast nötig,
// Warteschlange bis 3, Geld beim Einreihen, Abbruch erstattet. Alle Einheiten sind frei; Forschungen verbessern Werte je Gruppe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { BALANCE } from '../js/data/balance.js';
import { RESEARCH } from '../js/data/research.js';
import { UNITS } from '../js/data/units.js';
import { AI } from '../js/ai/ai.js';
import { hit } from '../js/game/combat.js';
import { armorMul, rangeMul, sightMul, modOf, researchEffect, researchBlock, RESEARCH_KEYS } from '../js/game/research.js';
import { Controller } from '../js/ui/controller.js';

const R = RESEARCH;
const DT = 1 / BALANCE.tickRate;
const run = (g, s, ais = []) => {
  for (let i = 0; i < Math.round(s / DT); i++) {
    for (const a of ais) a.update(DT);
    g.update(DT);
  }
};
const mainOf = (g, t) => g.buildings.find((b) => b.main && b.team === t);

/** Leere Karte ohne Starteinheiten (Hauptstädte bleiben). */
function empty(opts = {}) {
  const g = new Game({ map: createEmptyMap(), ...opts });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  return g;
}
const research = (g, key, t = 0) => g.issue(t, { type: 'research', buildingId: mainOf(g, t).id, key });

test('Baum: 10 Stufen, 8 Äste (seit v5.19), 80 Forschungen; jede hat Vorgänger im Ast und eine Wirkung in Worten', () => {
  assert.equal(R.tiers, 10);
  assert.equal(Object.keys(R.lanes).length, 8);
  assert.equal(RESEARCH_KEYS.length, 80);
  for (const k of RESEARCH_KEYS) {
    const it = R.items[k];
    assert.equal(it.req, it.tier > 1 ? `${it.lane}${it.tier - 1}` : null);
    assert.equal(it.money, R.money[it.tier - 1]);
    assert.ok(researchEffect(k).length > 10, `${k}: ${researchEffect(k)}`);
  }
  assert.match(researchEffect('tank1'), /Kampfpanzer: Waffenreichweite \+6 %, Sicht \+5 %/);
  assert.match(researchEffect('tank2'), /Reichweite mit einer Tankfüllung \+18 %/);
});

test('Aus (Standard): keine Forschung, alle Faktoren 1; an: alle Einheiten von Anfang an frei', () => {
  const g = empty();
  const tank = g.spawnUnit('tank', 0, 500, 500);
  assert.equal(g.research, false);
  for (const s of ['range', 'sight', 'armor', 'dmg', 'speed', 'fuel']) assert.equal(modOf(g, tank, s), 1);
  assert.equal(research(g, 'tank1').ok, false);
  const on = empty({ research: true, startMoney: 1e6 });
  for (const u of ['sniper', 'ifv', 'tank', 'littlebird', 'transporter', 'gunship', 'flak', 'sam']) {
    const r = on.issue(0, { type: 'train', buildingId: mainOf(on, 0).id, unit: u });
    assert.ok(r.ok || r.reason === 'Warteschlange ist voll', `${u}: ${r.reason}`);
    if (!r.ok) mainOf(on, 0).queue.length = 0;
  }
});

test('Stufen: erst 3 Forschungen der Stufe davor; Vorgänger im Ast; Warteschlange bis 3, Geld beim Einreihen', () => {
  const g = empty({ research: true, startMoney: 1e6 });
  const tech = g.teams[0].tech;
  assert.match(researchBlock(g, 0, 'tank2'), /Benötigt Richtoptik/);
  assert.match(researchBlock(g, 0, 'tank2'), /Richtoptik/);
  const m0 = g.teams[0].res.money;
  assert.ok(research(g, 'tank1').ok);
  assert.equal(tech.cur.key, 'tank1');
  // Nachfolger darf schon warten (der Vorgänger läuft), Stufe 2 aber erst mit 3 geplanten Forschungen der Stufe 1
  assert.match(researchBlock(g, 0, 'tank2'), /Stufe 2: erst 3 Forschungen der Stufe 1/);
  assert.ok(research(g, 'inf1').ok);
  assert.ok(research(g, 'mech1').ok);
  assert.equal(researchBlock(g, 0, 'tank2'), '', 'mit drei geplanten Forschungen der Stufe 1');
  assert.ok(research(g, 'tank2').ok);
  assert.deepEqual(tech.queue, ['inf1', 'mech1', 'tank2']);
  assert.equal(g.teams[0].res.money, m0 - 3 * R.money[0] - R.money[1], 'bezahlt beim Einreihen');
  assert.match(researchBlock(g, 0, 'air1'), /Warteschlange voll/);
  // Abbruch einer Stufe-1-Forschung: tank2 verliert seine Stufe und fällt mit heraus, beides erstattet
  const m1 = g.teams[0].res.money;
  assert.ok(g.issue(0, { type: 'cancelResearch', key: 'mech1' }).ok);
  assert.deepEqual(tech.queue, ['inf1']);
  assert.equal(g.teams[0].res.money, m1 + R.money[0] + R.money[1]);
  // fertig: die nächste rückt nach, Meldungen
  run(g, R.items.tank1.time + 0.5);
  assert.deepEqual(tech.done, ['tank1']);
  assert.equal(tech.cur.key, 'inf1');
  assert.ok(research(g, 'mech1').ok);
  run(g, R.items.inf1.time + R.items.mech1.time + 1);
  assert.equal(tech.tier, 2, 'drei Forschungen der Stufe 1: Stufe 2 offen');
  const msgs = g.drainEvents().filter((e) => e.type === 'message').map((e) => e.text);
  assert.ok(msgs.some((t) => /Richtoptik erforscht/.test(t)));
  assert.ok(msgs.includes('Forschungsstufe 2 offen'));
  assert.ok(msgs.includes('Der Gegner forscht auf Stufe 2'));
  // nur die Hauptstadt; ohne Geld nicht
  const fob = g.spawnBuilding('fob', 0, 60, 60);
  assert.equal(g.issue(0, { type: 'research', buildingId: fob.id, key: 'air1' }).ok, false);
  g.teams[0].res.money = 0;
  assert.equal(research(g, 'air1').ok, false);
});

test('Wirkung: Kampfpanzer (Reichweite, Treibstoff, Panzerung), Infanterie (Westen, tödlicher Volltreffer bleibt), Gebäude, Sicht', () => {
  const g = empty({ research: true });
  const tech = g.teams[0].tech;
  const tank = g.spawnUnit('tank', 0, 1000, 1000);
  const rifle = g.spawnUnit('rifleman', 0, 1100, 1000);
  tech.done.push('tank1', 'tank2', 'tank4', 'tank7', 'inf2', 'def1', 'elec1');
  assert.ok(Math.abs(rangeMul(g, tank) - 1.06 * 1.1) < 1e-9, 'Richtoptik und Feuerleitrechner');
  assert.ok(Math.abs(sightMul(g, tank) - 1.05 * 1.05) < 1e-9, 'Optik und Gefechtsfunk (alle Einheiten)');
  assert.equal(modOf(g, tank, 'fuel'), 0.85);
  assert.equal(armorMul(g, tank, 100), 0.9);
  assert.equal(armorMul(g, rifle, 10), 0.9);
  assert.equal(armorMul(g, rifle, rifle.def.hp), 1, 'Volltreffer bleibt tödlich');
  assert.equal(modOf(g, rifle, 'range'), 1, 'Panzerforschung wirkt nicht auf Infanterie');
  const fob = mainOf(g, 0);
  assert.equal(armorMul(g, fob, 10), 0.9, 'Sandsäcke');
  // Treffer: Panzer nimmt 10 % weniger
  const hp = tank.hp;
  hit(g, tank, 100);
  assert.ok(Math.abs(hp - tank.hp - 90) < 1e-9);
  // der Gegner hat nichts erforscht
  const foe = g.spawnUnit('tank', 1, 3000, 3000);
  assert.equal(rangeMul(g, foe), 1);
  // Reichweite im Kampf: Ziel knapp außerhalb der Grundreichweite, aber innerhalb der erforschten
  const target = g.spawnUnit('ifv', 1, 1000 + UNITS.tank.weapons[0].range * 1.1, 1000);
  g.fog[0].revealAll?.();
  g.issue(0, { type: 'attack', ids: [tank.id], targetId: target.id });
  const x0 = tank.x;
  run(g, 3);
  assert.ok(target.hp < target.maxHp, 'schießt mit erforschter Reichweite');
  assert.ok(Math.abs(tank.x - x0) < 5, 'ohne heranzufahren');
});

test('Selbstheilung (Feldsanitäter), Nebel und Minen erst nach ihrer Forschung', () => {
  const g = empty({ research: true });
  const tech = g.teams[0].tech;
  const rifle = g.spawnUnit('rifleman', 0, 1000, 1000);
  const tank = g.spawnUnit('tank', 0, 1200, 1000);
  assert.match(g.issue(0, { type: 'smoke', ids: [tank.id] }).reason, /Nebelwerfer nicht erforscht/);
  rifle.hp = 50;
  rifle.lastHitTime = -100;
  run(g, 2);
  assert.equal(rifle.hp, 50, 'ohne Sanitäter keine Heilung');
  tech.done.push('inf5', 'log5');
  run(g, 2);
  assert.ok(rifle.hp > 50, 'Feldsanitäter heilen');
  assert.equal(g.issue(0, { type: 'smoke', ids: [tank.id] }).ok, true);
});

test('Befehlskarte: Forschung (U) öffnet das Menü, keine gesperrten Einheiten', () => {
  const g = empty({ research: true, startMoney: 5000 });
  const c = new Controller(g, 0, null);
  let opened = 0;
  c.onResearch = () => opened++;
  c.view.selection.add(mainOf(g, 0).id);
  const btn = (k) => c.commandCard().find((e) => e.hotkey === k);
  assert.equal(btn('S').reason, '', 'Kampfpanzer frei');
  assert.equal(btn('G').reason, '', 'AH-64 frei');
  c.handleHotkey('U');
  assert.equal(opened, 1);
  assert.equal(btn('U').active, false);
  assert.ok(research(g, 'inf1').ok);
  assert.equal(btn('U').active, true);
});

test('KI: forscht ab ihrer Zeit Stufe für Stufe, höchstens eine wartend, nach den Regeln des Baums', () => {
  const g = new Game({ seed: 3, research: true, startMoney: 4000 });
  const ai = new AI(g, 1, 'hard');
  const tech = g.teams[1].tech;
  run(g, BALANCE.difficulty.hard.research[0] - 5, [ai]);
  assert.equal(tech.cur, null, 'vor ihrer Zeit nichts');
  for (let k = 0; k < 40; k++) {
    g.teams[1].res.money = 5000;
    run(g, 15, [ai]);
    assert.ok(tech.queue.length <= 1);
  }
  assert.ok(tech.done.length >= 4, `${tech.done.length} erforscht`);
  assert.ok(tech.tier >= 2, `Stufe ${tech.tier}`);
  for (const k of tech.done) {
    const it = R.items[k];
    if (it.req) assert.ok(tech.done.includes(it.req), `${k} ohne Vorgänger`);
  }
});
