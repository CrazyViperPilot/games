// Befehlsregister und UI-Modi (Review E-04, E-05, seit v5.63): game.issue liest js/game/commands.js, die Steuerung ihre Modi aus
// einer Tabelle, die Hilfe (F1) ihre Zahlen aus den Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { COMMANDS, OWN_DRIVERS, commandOf } from '../js/game/commands.js';
import { Controller, UI_MODES } from '../js/ui/controller.js';
import { KEYS } from '../js/ui/helptext.js';
import { Camera } from '../js/render/camera.js';
import { BALANCE } from '../js/data/balance.js';
import { CITY } from '../js/data/city.js';
import { BUILDINGS } from '../js/data/buildings.js';

test('Befehlsregister: jeder Eintrag hat einen Handler, unbekannte und geerbte Typen werden abgewiesen', () => {
  for (const [k, c] of Object.entries(COMMANDS)) assert.equal(typeof c.run, 'function', k);
  const g = new Game({ map: createEmptyMap() });
  for (const type of ['nope', 'toString', 'constructor', undefined]) assert.deepEqual(g.issue(0, { type }), { ok: false, reason: 'Unbekannter Befehl' });
  assert.equal(commandOf('__proto__'), null);
  // Jeder Befehl läuft ohne Absturz durch game.issue (leere Felder: Fehler mit Grund oder ok)
  for (const type of Object.keys(COMMANDS)) {
    const r = g.issue(0, { type, ids: [] });
    assert.equal(typeof r.ok, 'boolean', type);
    if (!r.ok) assert.ok(r.reason && r.reason !== 'Unbekannter Befehl', `${type}: ${r.reason}`);
  }
});

test('Befehlsregister: selbst gefahrene Aufträge (früher OWN_DRIVERS in movement.js) unverändert', () => {
  const old = ['load', 'unload', 'route', 'build', 'repair', 'board', 'dropoff', 'paradrop', 'garrison', 'storm', 'pickup', 'deliver', 'repairBridge', 'dig', 'land', 'shellRoad', 'clearRubble', 'layBridge']; // shellRoad, clearRubble seit dem Paket „Straßen“; layBridge seit E14
  assert.deepEqual([...OWN_DRIVERS].sort(), old.sort());
});

test('UI-Modi: jeder Modus hat einen Hinweis, Zielmodi zeigen nur Abbruch, Klick auf die Karte stürzt nicht ab', () => {
  const g = new Game({ map: createEmptyMap() });
  const c = new Controller(g, 0, new Camera(BALANCE.map.width * BALANCE.map.tile, BALANCE.map.height * BALANCE.map.tile));
  const msgs = [];
  c.onMessage = (t) => msgs.push(t);
  const main = g.buildings.find((b) => b.team === 0);
  const units = ['truck', 'engineer', 'rifleman', 'transporter', 'excavator', 'f16', 'pzh'].map((t, i) => g.spawnUnit(t, 0, main.x + 120 + i * 20, main.y + 120));
  assert.ok(UI_MODES.length >= 14);
  for (const m of UI_MODES) {
    c.view.selection.clear();
    for (const u of units) c.view.selection.add(u.id);
    if (m === 'place') c.beginPlacement('mortar');
    else if (m === 'wall') c.beginPlacement('wall');
    else c.setMode(m);
    assert.equal(c.view.mode, m);
    assert.ok(c.hint().length > 5, `Hinweis fehlt: ${m}`);
    assert.ok(!/undefined|NaN/.test(c.hint()), m);
    const card = c.commandCard();
    if (m !== 'build') assert.deepEqual(card.map((e) => e.label), ['Abbruch'], m);
    c.updatePointer(main.x + 300, main.y + 300);
    c.leftClickWorld(main.x + 300, main.y + 300, false);
    c.cancel();
    assert.equal(c.view.mode, 'normal');
  }
  assert.equal(c.hint(), '');
});

test('Hilfe (F1): Zahlen und Tasten aus den Daten, nichts undefiniert', () => {
  const text = KEYS.map(([k, v]) => `${k} ${v}`).join('\n');
  assert.ok(!/undefined|NaN|\[object/.test(text), 'Platzhalter in der Hilfe');
  assert.match(text, new RegExp(`höchstens ${BALANCE.fob.max} FOBs`));
  assert.match(text, new RegExp(`Wohnhaus ${BALANCE.garrison.kinds.house.cap},`));
  assert.match(text, new RegExp(`Straßen tragen ${CITY.transport.cap} Waren je s`));
  assert.match(text, new RegExp(`sieht als Radar ${CITY.air.atcSight} px`));
  assert.match(text, new RegExp(`${BUILDINGS.mortar.hotkey} ${BUILDINGS.mortar.name}`));
});
