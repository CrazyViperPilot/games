// KI nutzt die Artillerie (Paket K2, „KI nutzt die neuen Einheiten“): Mörsertrupp und Raketenwerfer werden ausgebildet
// (counterMix) und feuern auf gegnerische Gruppen oder Gebäude (artilleryFire). Gezielte Lagen, kein KI-gegen-KI-Lauf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { ARTY_MONEY, ARTY_ARMY, MORTAR_MAX, MLRS_MAX, ARTY_FIRE_EVERY, ARTY_GROUP } from '../js/data/ai.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit

/** Lage für counterMix: `army` Kampfeinheiten (nur ihre Anzahl zählt), sonst leer. */
function situation(army) {
  return { enemies: [], units: [], combat: Array.from({ length: army }, () => ({ x: 0, y: 0 })) };
}

/** Szene: Artillerie (Team 1, die KI) bei (x, y) in einer leeren Karte, Gegner (Team 0) werden von Hand in `s` gereicht. */
function scene(seed = 7) {
  const g = classic(new Game({ seed }));
  for (const u of g.units) u.alive = false; // Startarmeen weg
  const z = g.zone;
  return { g, x: z.x + 1500, y: z.y };
}

test('Mörsertrupp und Raketenwerfer: erst ab ARTY_ARMY Kampfeinheiten, höchstens MORTAR_MAX / MLRS_MAX', () => {
  const g = new Game({ seed: 7 });
  g.teams[1].res.money = g.teams[0].res.money = 1e6; // genug Geld: die Reserve ARTY_MONEY greift hier nicht
  const ai = new AI(g, 1, 'normal');
  const low = ai.counterMix(situation(ARTY_ARMY - 1));
  assert.equal(low.mortarteam, undefined, 'unter ARTY_ARMY kein Mörsertrupp');
  assert.equal(low.mlrs, undefined, 'unter ARTY_ARMY kein Raketenwerfer');
  const mix = ai.counterMix(situation(ARTY_ARMY));
  assert.ok(Math.abs(mix.mortarteam - MORTAR_MAX / ARTY_ARMY) < 1e-9, 'Mörsertrupps als Anteil an der Armee');
  assert.ok(Math.abs(mix.mlrs - MLRS_MAX / ARTY_ARMY) < 1e-9, 'Raketenwerfer als Anteil an der Armee');
  const big = ai.counterMix(situation(ARTY_ARMY * 4));
  assert.ok(Math.abs(big.mortarteam * ARTY_ARMY * 4 - MORTAR_MAX) < 1e-9, 'Zahl bleibt bei größerer Armee gleich');
  g.teams[0].res.money = g.teams[1].res.money = ARTY_MONEY; // zu wenig über der Reserve
  assert.equal(ai.counterMix(situation(ARTY_ARMY * 4)).mlrs, undefined, 'ohne Geldreserve keine Artillerie');
  const easy = new AI(g, 1, 'easy');
  assert.equal(easy.counterMix(situation(ARTY_ARMY * 4)).mortarteam, undefined, 'auf Leicht keine Artillerie');
});

test('Artillerie: feuert auf eine gegnerische Gruppe in Reichweite (mortarTarget auf deren Mitte)', () => {
  const { g, x, y } = scene();
  g.buildings = []; // nur die Gruppe zählt
  const m = g.spawnUnit('mortarteam', 1, x, y);
  const tx = x + 400;
  const foes = [0, 1, 2].map((k) => g.spawnUnit('rifleman', 0, tx + k * 20, y));
  assert.ok(foes.length >= ARTY_GROUP);
  const ai = new AI(g, 1, 'normal');
  ai.artilleryFire({ artillery: [m], enemies: foes });
  assert.ok(m.fireTarget, 'Ziel gesetzt');
  assert.equal(m.fireTarget.x, foes[0].x, 'auf die Gruppe');
  assert.equal(m.fireTarget.y, foes[0].y);
});

test('Artillerie: eine einzelne Einheit ist kein Ziel, Gebäude schon', () => {
  const { g, x, y } = scene();
  g.buildings = [];
  const m = g.spawnUnit('mlrs', 1, x, y);
  const lone = g.spawnUnit('rifleman', 0, x + 500, y);
  const ai = new AI(g, 1, 'normal');
  ai.artilleryFire({ artillery: [m], enemies: [lone] });
  assert.ok(!m.fireTarget, 'eine Einheit allein ist kein Ziel');
  // gegnerisches Gebäude in Reichweite (Sicht des Teams unterstellt)
  const bld = { alive: true, built: true, team: 0, x: x + 800, y, kind: 'building' };
  g.buildings = [bld];
  g.sees = () => true;
  g.time += ARTY_FIRE_EVERY + 1; // Denktakt abwarten
  ai.artilleryFire({ artillery: [m], enemies: [lone] });
  assert.ok(m.fireTarget, 'Gebäude ist Ziel');
  assert.equal(m.fireTarget.x, bld.x);
});

test('Artillerie: kein Ziel mehr in Reichweite → Feuer wird eingestellt', () => {
  const { g, x, y } = scene();
  g.buildings = [];
  const m = g.spawnUnit('mortarteam', 1, x, y);
  const foes = [0, 1, 2].map((k) => g.spawnUnit('rifleman', 0, x + 400 + k * 20, y));
  const ai = new AI(g, 1, 'normal');
  ai.artilleryFire({ artillery: [m], enemies: foes });
  assert.ok(m.fireTarget, 'erst Ziel');
  g.time += ARTY_FIRE_EVERY + 1;
  ai.artilleryFire({ artillery: [m], enemies: [] });
  assert.ok(!m.fireTarget, 'ohne Ziel aus');
});

test('Artillerie: nur Mörser und Raketenwerfer werden gelenkt, die Panzerhaubitze nicht', () => {
  const { g, x, y } = scene();
  g.buildings = [];
  const m = g.spawnUnit('mortarteam', 1, x, y);
  const p = g.spawnUnit('pzh', 1, x, y + 60);
  const foes = [0, 1, 2].map((k) => g.spawnUnit('rifleman', 0, x + 400 + k * 20, y));
  const ai = new AI(g, 1, 'normal');
  ai.artilleryFire({ artillery: [m, p], enemies: foes });
  assert.ok(m.fireTarget, 'Mörser feuert');
  assert.ok(!p.fireTarget, 'Panzerhaubitze nicht gelenkt (eigene Stellung, artillery())');
  assert.ok(UNITS.mortarteam.weapons[0].shell, 'Mörser schießt Granaten');
});
