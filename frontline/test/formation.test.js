// Formationen: Linie, Keil, Kolonne; Panzer vorn, die Gruppe marschiert geschlossen im Tempo der langsamsten Einheit und kommt
// zusammen an. Locker (Standard) bleibt wie bisher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { formationSlots, formationRank, FORMATIONS } from '../js/game/formation.js';
import { Controller } from '../js/ui/controller.js';

const DT = 1 / BALANCE.tickRate;
const TYPES = ['tank', 'tank', 'ifv', 'rifleman', 'rifleman', 'rifleman', 'at', 'sniper', 'truck'];
const TX = 4000;
const TY = 3000;

/** Leere Karte, nur die Testgruppe (3×3-Block bei x 2000, Marsch nach rechts). */
function setup(types = TYPES) {
  const g = new Game({ map: createEmptyMap() });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  const us = types.map((t, i) => g.spawnUnit(t, 0, 2000 + (i % 3) * 60, 3000 + Math.floor(i / 3) * 60));
  return { g, us };
}

test('Plätze: je Formation einer pro Einheit, passierbar, mit Abstand; Panzer vorn, Infanterie dahinter', () => {
  const { g, us } = setup();
  for (const kind of ['line', 'wedge', 'column']) {
    const { slots, speed } = formationSlots(g, 0, us, TX, TY, kind);
    assert.equal(slots.length, us.length, kind);
    assert.equal(speed, UNITS.sniper.speed, 'Tempo der langsamsten Bodeneinheit');
    for (const p of slots) assert.ok(g.grid.passable(g.grid.toCell(p.x), g.grid.toCell(p.y), 0), `${kind}: passierbar`);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) assert.ok(Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y) >= 20, `${kind}: Abstand`);
    }
    // Marschrichtung +x: kein Platz eines höheren Rangs liegt vor dem eines Panzers (Linie: Panzer in der Mitte)
    const tanks = slots.filter((p) => p.u.type === 'tank');
    const rest = slots.filter((p) => p.u.type !== 'tank');
    if (kind === 'line') {
      for (const t of tanks) for (const p of rest) assert.ok(Math.abs(t.y - TY) <= Math.abs(p.y - TY) + 1, 'Linie: Panzer mittig');
    } else {
      for (const t of tanks) for (const p of rest) assert.ok(t.x >= p.x - 3, `${kind}: Panzer vorn`);
    }
    // Infanterie vor Scharfschütze und LKW
    const x = (type) => slots.find((p) => p.u.type === type).x;
    if (kind !== 'line') assert.ok(x('rifleman') >= x('sniper') - 3 && x('sniper') >= x('truck') - 3, `${kind}: Reihenfolge`);
  }
  assert.deepEqual(
    ['tank', 'ifv', 'rifleman', 'sniper', 'truck'].map((t) => formationRank(us.find((u) => u.type === t))),
    [0, 1, 2, 3, 4],
  );
});

test('Marsch: geschlossen und in Ordnung (Panzer vorn), alle kommen zusammen auf ihren Plätzen an', () => {
  for (const formation of ['line', 'wedge', 'column']) {
    const { g, us } = setup();
    const r = g.issue(0, { type: 'move', ids: us.map((u) => u.id), x: TX, y: TY, formation });
    assert.ok(r.ok && r.formation === formation && r.slots.length === us.length);
    const slot = new Map(us.map((u) => [u.id, { x: u.order.x, y: u.order.y }]));
    const arrive = new Map();
    let spread = 0;
    for (let i = 0; i < 120 / DT && arrive.size < us.length; i++) {
      g.update(DT);
      if (g.time > 15 && us.every((u) => u.order.type === 'move')) {
        const xs = us.map((u) => u.x);
        spread = Math.max(spread, Math.max(...xs) - Math.min(...xs));
        if (formation === 'column') {
          const front = Math.min(...us.filter((u) => u.type === 'tank').map((u) => u.x));
          assert.ok(us.every((u) => u.type === 'tank' || u.x <= front + 8), `Kolonne: Panzer vorn (t=${g.time.toFixed(1)})`);
        }
      }
      for (const u of us) if (u.order.type === 'idle' && !arrive.has(u.id)) arrive.set(u.id, g.time);
    }
    assert.equal(arrive.size, us.length, `${formation}: alle angekommen`);
    const times = [...arrive.values()];
    assert.ok(Math.max(...times) - Math.min(...times) < 5, `${formation}: zusammen angekommen`);
    assert.ok(spread < 260, `${formation}: geschlossen (${Math.round(spread)} px)`);
    for (const u of us) {
      const p = slot.get(u.id);
      assert.ok(Math.hypot(u.x - p.x, u.y - p.y) < 12, `${formation}: ${u.type} auf seinem Platz`);
    }
    g.update(DT);
    assert.equal(g.formations.size, 0, 'Gruppe nach der Ankunft aufgelöst');
  }
});

test('Locker (Standard) bleibt unverändert: jeder fährt sein Tempo, keine Formationsgruppe', () => {
  const { g, us } = setup();
  const r = g.issue(0, { type: 'move', ids: us.map((u) => u.id), x: TX, y: TY });
  assert.equal(r.formation, 'loose');
  assert.equal(g.formations.size, 0);
  assert.ok(us.every((u) => !u.order.form));
  g.update(DT);
  g.update(DT);
  const truck = us.find((u) => u.type === 'truck');
  const sniper = us.find((u) => u.type === 'sniper');
  for (let i = 0; i < 5 / DT; i++) g.update(DT);
  assert.ok(truck.x - 2120 > 2 * (sniper.x - 2060), 'LKW fährt davon');
});

test('Hubschrauber fliegen locker mit, bremsen die Formation nicht; ein neuer Befehl löst die Formation', () => {
  const { g, us } = setup(['tank', 'rifleman', 'littlebird']);
  const r = g.issue(0, { type: 'attackMove', ids: us.map((u) => u.id), x: TX, y: TY, formation: 'wedge' });
  assert.ok(r.ok);
  const [f] = [...g.formations.values()];
  assert.equal(f.speed, UNITS.rifleman.speed);
  assert.deepEqual(f.ids.sort(), [us[0].id, us[1].id].sort());
  const heli = us[2];
  assert.ok(!heli.order.form, 'Hubschrauber ohne Formation');
  assert.ok(heli.order.x < us[0].order.x, 'Hubschrauber hinter der Formation');
  for (let i = 0; i < 3 / DT; i++) g.update(DT);
  assert.ok(us[0].formMul < 1, 'Panzer fährt im Tempo der Infanterie');
  g.issue(0, { type: 'move', ids: [us[0].id], x: 2000, y: 2000 });
  assert.ok(!us[0].order.form);
  g.update(DT);
  assert.equal(us[1].formMul, 1, 'allein übrig: eigenes Tempo');
  for (let i = 0; i < 90 / DT && g.formations.size; i++) g.update(DT);
  assert.equal(g.formations.size, 0, 'nach der Ankunft aufgelöst');
  assert.ok(!(FORMATIONS.indexOf('loose')), 'Locker ist die erste Formation');
});

test('Ein festgefahrenes Mitglied hält die übrigen nicht auf', () => {
  const { g, us } = setup(['tank', 'rifleman', 'rifleman']);
  g.issue(0, { type: 'move', ids: us.map((u) => u.id), x: TX, y: TY, formation: 'line' });
  const stuck = us[1];
  const [sx, sy] = [stuck.x, stuck.y];
  for (let i = 0; i < 30 / DT; i++) {
    g.update(DT);
    stuck.x = sx; // festgehalten
    stuck.y = sy;
  }
  assert.ok(us[2].x > 2000 + 30 * UNITS.rifleman.speed * 0.6, `die anderen marschieren weiter (${Math.round(us[2].x)})`);
});

test('Steuerung: F schaltet die Formation weiter, Marschbefehle nehmen sie mit', () => {
  const { g, us } = setup(['tank', 'rifleman']);
  const c = new Controller(g, 0, null);
  for (const u of us) c.view.selection.add(u.id);
  assert.equal(c.formation, 'loose');
  const seen = [];
  c.onMessage = (t) => seen.push(t);
  assert.ok(c.handleHotkey('F'));
  assert.equal(c.formation, 'line');
  c.handleHotkey('F');
  assert.equal(c.formation, 'wedge');
  assert.deepEqual(seen, ['Formation: Linie', 'Formation: Keil']);
  c.confirmAttackMove(TX, TY, false);
  assert.equal(g.formations.size, 1);
  assert.equal(c.view.moveMarker.slots.length, 2, 'Marker zeigt die Zielplätze');
  c.handleHotkey('F');
  c.handleHotkey('F');
  assert.equal(c.formation, 'loose');
});
