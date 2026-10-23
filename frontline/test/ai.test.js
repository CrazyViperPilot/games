import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { BALANCE } from '../js/data/balance.js';

const DT = 0.05;
const START_UNITS = BALANCE.startUnits.length;
const mine = (game, team, type, built = true) =>
  game.buildings.filter((b) => b.alive && b.team === team && b.type === type && (!built || b.built));

/** KI gegen KI über `minutes` Spielminuten; liefert Kennzahlen je Team (Ausbildung, Zonenbesitz, Gebäude). */
function playAiVsAi(seed, minutes) {
  const game = new Game({ seed });
  const ais = [new AI(game, 0, 'normal'), new AI(game, 1, 'normal')];
  const seen = [new Set(), new Set()]; // alle je gesehenen Einheiten-IDs je Team
  let zoneHeld = false;
  let maxExt = [0, 0];
  const steps = Math.round((minutes * 60) / DT);
  for (let i = 0; i < steps && game.winner === null; i++) {
    ais[0].update(DT);
    ais[1].update(DT);
    game.update(DT);
    if (i % 20 === 0) {
      for (const u of game.units) seen[u.team].add(u.id);
      if (game.zone.owner >= 0) zoneHeld = true;
      for (let t = 0; t < 2; t++) maxExt[t] = Math.max(maxExt[t], mine(game, t, 'extractor').length);
    }
  }
  return {
    game,
    time: game.time,
    winner: game.winner,
    produced: seen.map((s) => s.size - START_UNITS),
    zoneHeld,
    maxExt,
  };
}

/** Summe des Lagers einer FOB (Baumaterial + Munition + Treibstoff). */
const stockSum = (f) => f.store.bm + f.store.mun + f.store.fuel;

// §12.5: KI allein (ohne Angriff aufs gegnerische HQ, sonst endet die Partie gegen den passiven Gegner früh)
test('KI allein (Seed 7): nach 10 min Zonen-FOB, Pendler, Förderanlagen, Lager gefüllt', () => {
  const game = new Game({ seed: 7 });
  const ai = new AI(game, 1, 'normal', { assault: false });
  const hq = game.buildings.find((b) => b.team === 1 && b.type === 'hq');
  const z = game.zone;
  const commuters = new Set(); // LKW, die je eine Route ab HQ oder FOB gefahren sind
  const samples = []; // Lager der Zonen-FOB (Summe) alle 10 s
  let zoneFobAt = null;
  const steps = Math.round((10 * 60) / DT);
  for (let i = 0; i < steps; i++) {
    ai.update(DT);
    game.update(DT);
    if (i % 20 !== 0) continue;
    for (const u of game.units) if (u.alive && u.team === 1 && u.type === 'truck' && u.order.type === 'route') commuters.add(u.id);
    const zf = mine(game, 1, 'fob').find((f) => Math.hypot(f.x - z.x, f.y - z.y) <= z.r);
    if (zf && zoneFobAt === null) zoneFobAt = game.time;
    if (zf && i % 200 === 0) samples.push(stockSum(zf));
  }
  const zf = mine(game, 1, 'fob').find((f) => Math.hypot(f.x - z.x, f.y - z.y) <= z.r);
  assert.ok(zf, 'keine fertige FOB in der Konfliktzone');
  assert.ok(zoneFobAt < 5 * 60, `Zonen-FOB erst nach ${zoneFobAt?.toFixed(0)} s fertig`);
  assert.ok(commuters.size >= 2, `nur ${commuters.size} Pendler (LKW mit Route)`);
  assert.ok(commuters.size <= 6, `zu viele Pendler: ${commuters.size}`);
  const ext = mine(game, 1, 'extractor');
  assert.ok(ext.length >= 3, `nur ${ext.length} fertige Förderanlagen`);
  assert.ok(ext.every((e) => game.supplierOf(e).type !== 'hq'), 'Förderanlage am HQ gebaut');
  assert.ok(mine(game, 1, 'fob').length >= 3, 'weniger als 3 fertige FOBs');
  assert.ok(samples.length >= 3 && samples.some((v) => v >= 400) && samples[samples.length - 1] > 0, `Lager der Zonen-FOB leer: ${samples.join(',')}`);
  const live = game.units.filter((u) => u.alive && u.team === 1).length;
  assert.ok(live >= 30, `nur ${live} Einheiten nach 10 min`);
  assert.ok(game.buildings.some((b) => b.alive && b.id === hq.id), 'HQ verloren');
});

for (const seed of [1, 2]) {
  test(`KI gegen KI (Seed ${seed}): 20 min ohne Exception, beide produzieren, Zone wird gehalten`, () => {
    const r = playAiVsAi(seed, 20);
    assert.ok(r.time >= 20 * 60 - 1 || r.winner !== null, `Spielzeit ${r.time.toFixed(1)} s`);
    assert.ok(r.produced[0] >= 15 && r.produced[1] >= 15, `produziert: ${r.produced}`);
    assert.ok(r.zoneHeld, 'niemand hat die Zone gehalten');
    assert.ok(r.maxExt[0] >= 3 && r.maxExt[1] >= 3, `Förderanlagen: ${r.maxExt}`);
  });
}

test('KI verteidigt das HQ: Kampfeinheiten kehren zurück, Angreifer fallen', () => {
  const game = new Game({ seed: 7 });
  const ai = new AI(game, 1, 'normal', { assault: false });
  const run = (sec) => {
    for (let i = 0; i < Math.round(sec / DT); i++) {
      ai.update(DT);
      game.update(DT);
    }
  };
  run(240);
  const hq = game.buildings.find((b) => b.team === 1 && b.type === 'hq');
  const combat = () => game.units.filter((u) => u.alive && u.team === 1 && u.def.range > 0);
  assert.ok(combat().length >= 10, 'zu wenige Kampfeinheiten für den Test');
  const invaders = [];
  for (let i = 0; i < 4; i++) invaders.push(game.spawnUnit('tank', 0, hq.x - 700 + i * 20, hq.y + 400));
  game.issue(0, { type: 'attackMove', ids: invaders.map((u) => u.id), x: hq.x, y: hq.y });
  run(12);
  const home = combat().filter((u) => u.order.type !== 'idle' && Math.hypot(u.order.x - hq.x, u.order.y - hq.y) <= 1500);
  assert.ok(home.length >= 8, `nur ${home.length} Kampfeinheiten verteidigen das HQ`);
  run(60);
  assert.ok(invaders.every((u) => !u.alive), 'Angreifer leben noch');
  assert.ok(hq.alive && hq.hp > hq.maxHp * 0.8, `HQ beschädigt: ${hq.hp}`);
});

test('KI greift das gegnerische HQ nur bei klarer Überlegenheit an', () => {
  const game = new Game({ seed: 7 });
  const ai = new AI(game, 1, 'normal');
  const run = (sec) => {
    for (let i = 0; i < Math.round(sec / DT); i++) {
      ai.update(DT);
      game.update(DT);
    }
  };
  run(30);
  assert.equal(ai.assault, false, 'Angriff ohne Überlegenheit');
  const z = game.zone;
  for (let i = 0; i < 24; i++) game.spawnUnit('tank', 1, z.x + (i % 6) * 40 - 100, z.y + Math.floor(i / 6) * 40 - 60);
  run(10);
  assert.equal(game.zone.owner, 1, 'Zone nicht gehalten');
  assert.equal(ai.assault, true, 'kein Angriff trotz 24 Panzern gegen 4 Schützen');
  const enemyHq = game.buildings.find((b) => b.team === 0 && b.type === 'hq');
  const heading = game.units.filter((u) => u.alive && u.team === 1 && u.type === 'tank' && Math.hypot(u.order.x - enemyHq.x, u.order.y - enemyHq.y) < 400);
  assert.ok(heading.length >= 15, `nur ${heading.length} Panzer marschieren zum gegnerischen HQ`);
});

test('KI: leicht und schwer laufen ohne Exception (gegeneinander)', () => {
  const game = new Game({ seed: 3 });
  const ais = [new AI(game, 0, 'easy'), new AI(game, 1, 'hard')];
  for (let i = 0; i < Math.round((6 * 60) / DT); i++) {
    for (const ai of ais) ai.update(DT);
    game.update(DT);
  }
  assert.ok(game.time >= 6 * 60 - 1 || game.winner !== null);
});

test('KI ersetzt ein verlorenes Baufahrzeug', () => {
  const game = new Game({ seed: 7 });
  const ai = new AI(game, 1, 'normal');
  const run = (sec) => {
    for (let i = 0; i < Math.round(sec / DT); i++) {
      ai.update(DT);
      game.update(DT);
    }
  };
  run(120);
  const eng = () => game.units.filter((u) => u.alive && u.team === 1 && u.type === 'engineer');
  for (const u of eng()) u.hp = 0; // alle Baufahrzeuge fallen
  run(90);
  assert.ok(eng().length >= 1, 'kein Ersatz-Baufahrzeug ausgebildet');
});
