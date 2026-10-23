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

// Vorläufig (HQ-Umbau, H1): nur Lauf ohne Exception. Die KI-Ziele mit HQ folgen in H3 (PLAN §12.4, §12.5).
test('KI allein (Seed 7): 10 min ohne Exception', () => {
  const game = new Game({ seed: 7 });
  const ai = new AI(game, 1, 'normal');
  const steps = Math.round((10 * 60) / DT);
  for (let i = 0; i < steps; i++) {
    ai.update(DT);
    game.update(DT);
  }
  assert.ok(game.time >= 10 * 60 - 1, `Spielzeit ${game.time.toFixed(1)} s`);
});

// Vorläufig (HQ-Umbau, H1): nur Lauf ohne Exception; Ausbau- und Zonenziele folgen mit der KI in H3.
for (const seed of [1, 2]) {
  test(`KI gegen KI (Seed ${seed}): 20 min ohne Exception`, () => {
    const r = playAiVsAi(seed, 20);
    assert.ok(r.time >= 20 * 60 - 1 || r.winner !== null, `Spielzeit ${r.time.toFixed(1)} s`);
  });
}

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
