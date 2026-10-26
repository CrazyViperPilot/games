// Wetter und Jahreszeiten: Jahreszeit je Partie, wechselndes Wetter mit eigenem Zufall, Regen/Nebel/Schnee verkürzen die Sicht,
// Schnee und Winterboden bremsen Bodenfahrzeuge, die KI nutzt schlechte Sicht. Aus (Standard) ändert nichts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { createEmptyMap } from '../js/game/mapdata.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { AI } from '../js/ai/ai.js';
import { createWeather, updateWeather, setWeather, weatherSpeed, weatherEffect, SEASONS } from '../js/game/weather.js';

const WX = BALANCE.weather;
const DT = 1 / BALANCE.tickRate;

/** Nur das Wetter: Zeit und Meldungen, ohne Spiel. */
function fake(seed, setting) {
  const g = { seed, time: 0, msgs: [], message(team, text) { this.msgs.push({ team, text, t: this.time }); } };
  createWeather(g, setting);
  return g;
}

/** Leere Karte ohne Starteinheiten. */
function empty(opts = {}) {
  const g = new Game({ map: createEmptyMap(), ...opts });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  return g;
}

test('Aus (Standard): Sommer, klar, alle Faktoren 1, kein Wechsel; der Spielzufall bleibt unberührt', () => {
  const off = new Game({ seed: 4 });
  assert.equal(off.weather.on, false);
  assert.deepEqual([off.weather.season, off.weather.kind, off.weather.sight, off.weather.vehicle], ['summer', 'clear', 1, 1]);
  const on = new Game({ seed: 4, weather: 'winter' });
  assert.equal(on.weather.on, true);
  assert.equal(on.rng.next(), off.rng.next(), 'eigener Zufall: die übrige Partie läuft gleich');
  const msgs = [];
  for (let i = 0; i < 30 / DT; i++) {
    off.update(DT);
    for (const e of off.drainEvents()) if (e.type === 'message' && /Regen|Nebel|Schnee|Sicht/.test(e.text)) msgs.push(e.text);
  }
  assert.deepEqual(msgs, []);
  assert.equal(off.weather.sight, 1);
});

test('Zufall: Jahreszeit aus dem Seed (gleich bei gleichem Seed, alle drei kommen vor), Startmeldung an beide', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const a = fake(seed, 'random');
    const b = fake(seed, 'random');
    assert.equal(a.weather.season, b.weather.season);
    assert.equal(a.weather.kind, b.weather.kind);
    seen.add(a.weather.season);
    assert.equal(a.msgs.length, 1);
    assert.equal(a.msgs[0].team, -1);
    assert.ok(a.msgs[0].text.startsWith({ summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' }[a.weather.season]));
  }
  assert.deepEqual([...seen].sort(), [...SEASONS].sort());
  assert.match(fake(3, 'winter').msgs[0].text, /^Winter \(Schnee am Boden: Fahrzeuge −10 %\)/);
});

test('Wechsel: nach der Phasendauer, nie dasselbe Wetter, nur Wetter der Jahreszeit (Schnee nur im Winter), mit Meldung', () => {
  for (const season of SEASONS) {
    const kinds = new Set();
    for (let seed = 1; seed <= 6; seed++) {
      const g = fake(seed, season);
      const w = g.weather;
      let last = w.kind;
      let since = 0;
      let changes = 0;
      kinds.add(w.kind);
      for (let i = 0; i < 7200 / 0.25; i++) {
        g.time += 0.25;
        updateWeather(g, 0.25);
        if (w.kind !== last) {
          const [lo, hi] = WX.phase[last];
          const len = g.time - since;
          if (since > 0) assert.ok(len >= lo - 0.3 && len <= hi + 0.3, `${season}: ${last} hielt ${len.toFixed(1)} s`);
          assert.notEqual(w.kind, last);
          assert.ok(w.kind in WX.odds[season], `${season}: ${w.kind}`);
          kinds.add(w.kind);
          last = w.kind;
          since = g.time;
          changes++;
        }
      }
      assert.ok(changes >= 15, `${season}: ${changes} Wechsel in 2 h`);
      assert.equal(g.msgs.length, changes + 1, 'je Wechsel eine Meldung');
    }
    assert.deepEqual([...kinds].sort(), Object.keys(WX.odds[season]).sort(), `${season}: alle Wetter kommen vor`);
  }
  assert.equal(weatherEffect('fog', 'winter'), 'Sicht −35 %, Fahrzeuge −10 %');
  assert.equal(weatherEffect('snow', 'winter'), 'Sicht −20 %, Fahrzeuge −20 %');
  assert.equal(weatherEffect('clear', 'summer'), '');
});

test('Übergang: Sicht blendet in 5-%-Stufen über fade s, danach der volle Wert; Winterboden bremst dauerhaft', () => {
  const g = fake(2, 'winter');
  const w = g.weather;
  setWeather(g, 'clear', 'winter');
  assert.deepEqual([w.sight, w.vehicle], [1, WX.winter]);
  w.next = g.time; // jetzt wechseln
  updateWeather(g, 0.05);
  const target = w.kind;
  const seen = [];
  while (w.mix < 1) {
    g.time += 0.05;
    updateWeather(g, 0.05);
    seen.push(w.sight);
    assert.ok(Math.abs(w.sight * 20 - Math.round(w.sight * 20)) < 1e-9, 'Stufen zu 5 %');
  }
  assert.ok(seen.length >= WX.fade / 0.05 - 2);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] <= seen[i - 1] + 1e-9, 'nimmt gleichmäßig ab');
  assert.equal(w.sight, WX.sight[target]);
  assert.equal(w.vehicle, target === 'snow' ? WX.vehicle : WX.winter);
});

test('Sicht: Nebel und Regen lassen einen Gegner in 256 px im Nebel des Krieges verschwinden, die Zielsuche greift nicht', () => {
  const g = empty();
  const me = g.spawnUnit('rifleman', 0, 32 + 64 * 30, 32 + 64 * 30);
  const foe = g.spawnUnit('rifleman', 1, 32 + 64 * 34, 32 + 64 * 30);
  me.weapons[0].range = 400; // Reichweite außen vor: es zählt nur die Sicht
  const look = (kind) => {
    setWeather(g, kind);
    g.weather.next = Infinity;
    g.updateFog();
    me.targetId = null;
    me.scanTimer = 0;
    g.update(DT);
    return [g.sees(0, foe), me.targetId === foe.id];
  };
  assert.deepEqual(look('clear'), [true, true]);
  assert.deepEqual(look('fog'), [false, false]);
  assert.deepEqual(look('rain'), [false, false]);
  assert.deepEqual(look('clear'), [true, true]);
});

test('Tempo: Schnee bremst Bodenfahrzeuge auf 80 %, Winterboden auf 90 %; Infanterie und Hubschrauber nicht', () => {
  const run = (kind, season) => {
    const g = empty();
    const us = ['tank', 'truck', 'rifleman', 'littlebird'].map((t, i) => g.spawnUnit(t, 0, 1000, 1000 + i * 300));
    setWeather(g, kind, season);
    g.weather.next = Infinity;
    g.issue(0, { type: 'move', ids: us.map((u) => u.id), x: 7000, y: 1600 });
    g.update(DT);
    const x0 = us.map((u) => u.x);
    for (let i = 0; i < 4 / DT; i++) g.update(DT);
    return us.map((u, i) => (u.x - x0[i]) / 4);
  };
  const summer = run('clear', 'summer');
  const winter = run('clear', 'winter');
  const snow = run('snow', 'winter');
  for (const k of [0, 1]) {
    assert.ok(Math.abs(winter[k] / summer[k] - WX.winter) < 0.03, `Winterboden: ${(winter[k] / summer[k]).toFixed(3)}`);
    assert.ok(Math.abs(snow[k] / summer[k] - WX.vehicle) < 0.03, `Schnee: ${(snow[k] / summer[k]).toFixed(3)}`);
  }
  for (const k of [2, 3]) assert.ok(Math.abs(snow[k] - summer[k]) < 0.5, 'Infanterie und Hubschrauber unverändert');
  const g = empty();
  setWeather(g, 'snow', 'winter');
  assert.equal(weatherSpeed(g, g.spawnUnit('ifv', 0, 500, 500)), WX.vehicle);
  assert.equal(weatherSpeed(g, g.spawnUnit('at', 0, 600, 500)), 1);
});

test('Formation im Schnee: das Tempo der gebremsten Fahrzeuge gilt, Panzer und Schützenpanzer bleiben zusammen', () => {
  const g = empty();
  setWeather(g, 'snow', 'winter');
  g.weather.next = Infinity;
  const us = ['tank', 'tank', 'ifv', 'ifv'].map((t, i) => g.spawnUnit(t, 0, 2000 + (i % 2) * 60, 3000 + Math.floor(i / 2) * 60));
  g.issue(0, { type: 'move', ids: us.map((u) => u.id), x: 5000, y: 3000, formation: 'line' });
  for (let i = 0; i < 6 / DT; i++) g.update(DT);
  const ifv = us[2];
  const eff = ifv.def.speed * weatherSpeed(g, ifv) * ifv.formMul;
  assert.ok(eff <= UNITS.tank.speed * WX.vehicle + 0.5, `SPz fährt höchstens Panzertempo im Schnee (${eff.toFixed(1)})`);
  const xs = us.map((u) => u.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 120, 'geschlossen');
});

test('KI: bei schlechter Sicht kommt der Späher früher, im Nebel geht die Welle mit 85 % los; Leicht nutzt das Wetter nicht', () => {
  const scoutAt = (kind, diff) => {
    const g = new Game({ seed: 7 });
    const ai = new AI(g, 1, diff);
    g.teams[1].res.money = 5000;
    // Plätze frei machen (die Startarmee füllt das Einheitenlimit); es bleiben mehr als genug Kampfeinheiten für einen Späher
    g.units.filter((u) => u.team === 1 && u.type === 'rifleman').slice(0, 10).forEach((u) => (u.alive = false));
    g.cleanup();
    g.time = 100; // nach WX_SCOUT_FROM, vor SCOUT_FROM
    setWeather(g, kind);
    g.weather.next = Infinity;
    ai.think();
    return g.buildings.some((b) => b.team === 1 && b.queue.some((q) => (q.unit ?? q.type ?? q) === 'littlebird'));
  };
  assert.equal(scoutAt('clear', 'normal'), false);
  assert.equal(scoutAt('fog', 'normal'), true);
  assert.equal(scoutAt('rain', 'hard'), true);
  assert.equal(scoutAt('fog', 'easy'), false);

  const g = new Game({ seed: 7 });
  const ai = new AI(g, 1, 'normal');
  const easy = new AI(g, 0, 'easy');
  const clear = ai.waveNeed([]);
  setWeather(g, 'fog');
  assert.ok(Math.abs(ai.waveNeed([]) - clear * 0.85) < 1e-6, 'Nebel: 85 % der Stärke');
  setWeather(g, 'rain');
  assert.equal(ai.waveNeed([]), clear, 'Regen: keine Deckung');
  setWeather(g, 'fog');
  assert.equal(easy.waveNeed([]), BALANCE.difficulty.easy.attackStrength);
  assert.deepEqual(['easy', 'normal', 'hard'].map((d) => BALANCE.difficulty[d].weather), [false, true, true]);
});
