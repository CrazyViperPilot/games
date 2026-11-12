// KI nutzt die Unterstützer (Paket K1, „KI nutzt die neuen Einheiten“): Sanitäter, MANPADS, Flammenwerfer,
// Aufklärungsfahrzeug, Bergepanzer, Störsender. Gezielte Lagen über counterMix und escort, kein KI-gegen-KI-Lauf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { UNITS } from '../js/data/units.js';
import {
  AIR_MEMORY, SHARE_CAP, MEDIC_MAX, MEDIC_EVERY, MANPADS_MAX, FLAMER_MAX, RECON_ARMY, RECOVERY_VEH,
} from '../js/data/ai.js';

/** Eigene Einheit (für Zählungen in supportShares) und gesehene gegnerische Einheit. */
const own = (type, extra = {}) => ({ type, def: UNITS[type], order: { type: 'idle' }, ...extra });
const foe = (type, extra = {}) => ({ type, def: UNITS[type], ...extra });

/** Lage für counterMix: gesehene Gegner, eigene Einheiten und `army` Kampfeinheiten (nur ihre Anzahl zählt). */
function situation({ enemies = [], units = [], army = 0 } = {}) {
  return {
    enemies,
    units,
    combat: Array.from({ length: army }, () => ({ x: 0, y: 0 })),
  };
}
const sumOf = (mix) => Object.values(mix).reduce((a, v) => a + v, 0);
const infantry = (n) => Array.from({ length: n }, () => own('rifleman'));
const vehicles = (n) => Array.from({ length: n }, () => own('ifv'));

test('Sanitäter: ab 8 eigener Infanterie einer, je 8 weitere (höchstens MEDIC_MAX)', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  assert.equal(ai.counterMix(situation({ units: infantry(MEDIC_EVERY - 1), army: 12 })).medic, undefined, 'unter 8 keiner');
  const one = ai.counterMix(situation({ units: infantry(MEDIC_EVERY), army: 12 }));
  assert.ok(Math.abs(one.medic - 1 / 12) < 1e-9, 'ein Sanitäter an 12 Kampfeinheiten');
  const cap = ai.counterMix(situation({ units: infantry(MEDIC_EVERY * 10), army: 12 }));
  assert.ok(Math.abs(cap.medic - MEDIC_MAX / 12) < 1e-9, 'höchstens MEDIC_MAX Sanitäter');
});

test('MANPADS: gesehene Luftfahrzeuge → MANPADS als Infanterie, Anteil wie Flak; höchstens MANPADS_MAX', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const mix = ai.counterMix(situation({ enemies: [foe('gunship'), foe('gunship')], army: 12 }));
  assert.ok(mix.manpads > 0, 'MANPADS gegen Hubschrauber');
  const fresh = new AI(new Game({ seed: 7 }), 1, 'normal');
  assert.equal(fresh.counterMix(situation({ army: 12 })).manpads, undefined, 'ohne Luftziele keine');
  const many = ai.counterMix(situation({ enemies: Array(60).fill(foe('f16')), army: 40 }));
  assert.ok(many.manpads <= MANPADS_MAX / 40 + 1e-9, 'höchstens MANPADS_MAX');
});

test('Flammenwerfer: gesehene Gegner in Häusern → höchstens FLAMER_MAX, danach vergessen', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  assert.equal(ai.counterMix(situation({ enemies: [foe('rifleman')], army: 12 })).flamer, undefined, 'ohne Häuserkampf keiner');
  const inHouse = ai.counterMix(situation({ enemies: [foe('rifleman', { house: 5 })], army: 12 }));
  assert.ok(Math.abs(inHouse.flamer - FLAMER_MAX / 12) < 1e-9, 'Flammenwerfer bei besetzten Häusern');
  g.time += AIR_MEMORY * 0.5;
  assert.ok(ai.counterMix(situation({ army: 12 })).flamer > 0, 'innerhalb des Gedächtnisses gemerkt');
  g.time += AIR_MEMORY;
  assert.equal(ai.counterMix(situation({ army: 12 })).flamer, undefined, 'danach vergessen');
});

test('Aufklärungsfahrzeug: ein Stück ab RECON_ARMY Kampfeinheiten', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  assert.equal(ai.counterMix(situation({ army: RECON_ARMY - 1 })).scout, undefined, 'zu kleine Armee');
  const mix = ai.counterMix(situation({ army: RECON_ARMY + 2 }));
  assert.ok(Math.abs(mix.scout - 1 / (RECON_ARMY + 2)) < 1e-9, 'ein Aufklärungsfahrzeug');
});

test('Bergepanzer: ein Stück ab RECOVERY_VEH eigenen Fahrzeugen', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  assert.equal(ai.counterMix(situation({ units: vehicles(RECOVERY_VEH - 1), army: 12 })).recovery, undefined, 'zu wenige Fahrzeuge');
  const mix = ai.counterMix(situation({ units: vehicles(RECOVERY_VEH), army: 12 }));
  assert.ok(Math.abs(mix.recovery - 1 / 12) < 1e-9, 'ein Bergepanzer');
});

test('Störsender: nur mit gesehener Flugabwehr des Gegners und eigenen Luftfahrzeugen', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const aa = [foe('sam')];
  assert.equal(ai.counterMix(situation({ enemies: aa, army: 12 })).jammer, undefined, 'ohne eigene Luftfahrzeuge keiner');
  const air = [own('littlebird')];
  const mix = ai.counterMix(situation({ enemies: aa, units: air, army: 12 }));
  assert.ok(Math.abs(mix.jammer - 1 / 12) < 1e-9, 'ein Störsender');
  const fresh = new AI(new Game({ seed: 7 }), 1, 'normal');
  assert.equal(fresh.counterMix(situation({ enemies: [foe('rifleman')], units: air, army: 12 })).jammer, undefined, 'ohne gegnerische Flugabwehr keiner');
});

test('Sonderziele zusammen höchstens SHARE_CAP, die Mischung ergibt weiter 1', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const enemies = [...Array(60).fill(foe('gunship')), foe('sam', { house: 3 }), ...Array(12).fill(foe('rifleman'))];
  const units = [...infantry(40), ...vehicles(8), own('littlebird')];
  const mix = ai.counterMix(situation({ enemies, units, army: 4 }));
  const special = Object.keys(mix).filter((u) => !['rifleman', 'at', 'ifv', 'tank'].includes(u));
  const sumSpecial = special.reduce((a, u) => a + mix[u], 0);
  assert.ok(sumSpecial <= SHARE_CAP + 1e-9, `Sonderziele ${sumSpecial} ≤ SHARE_CAP`);
  assert.ok(Math.abs(sumOf(mix) - 1) < 1e-9, 'Mischung ergibt 1');
});

test('Begleiter: untätiger Sanitäter oder Störsender weit weg rückt zur Armee nach, nahe und beschäftigte bleiben', () => {
  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const calls = [];
  g.issue = (team, cmd) => {
    calls.push(cmd);
    return { ok: true };
  };
  const far = own('medic', { id: 1, x: 900, y: 100 });
  const near = own('medic', { id: 2, x: 120, y: 100 });
  const busy = own('jammer', { id: 3, x: 900, y: 100, order: { type: 'move' } });
  const rifle = own('rifleman', { id: 4, x: 900, y: 100 });
  const s = { combat: [{ x: 100, y: 100 }, { x: 100, y: 100 }], units: [far, near, busy, rifle] };
  ai.escort(s);
  assert.equal(calls.length, 1, 'ein Befehl');
  assert.deepEqual(calls[0].ids, [1], 'nur der weit entfernte Sanitäter');
  assert.equal(calls[0].type, 'move');
  assert.ok(Math.abs(calls[0].x - 100) < 1e-9 && Math.abs(calls[0].y - 100) < 1e-9, 'Ziel ist der Schwerpunkt der Armee');
  ai.escort(s);
  assert.equal(calls.length, 1, 'innerhalb von ESCORT_EVERY keine neue Prüfung');
});
