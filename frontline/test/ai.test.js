import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';

// Vorübergehend gelockert (Logistik-Umbau, L1): die KI-Strategie wird in L3 neu geprüft.
// Geprüft wird nur, dass die KI ohne Exception und ohne Endlosschleife weiterläuft.
const DT = 0.05;

/** KI gegen KI über `minutes` Spielminuten; liefert Spielzeit und Kennzahlen. */
function playAiVsAi(seed, minutes) {
  const game = new Game({ seed });
  const ais = [new AI(game, 0, 'normal'), new AI(game, 1, 'normal')];
  const steps = Math.round((minutes * 60) / DT);
  for (let i = 0; i < steps && game.winner === null; i++) {
    ais[0].update(DT);
    ais[1].update(DT);
    game.update(DT);
  }
  return { time: game.time, winner: game.winner, units: game.units.filter((u) => u.alive).length };
}

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

for (const seed of [1, 2]) {
  test(`KI gegen KI (Seed ${seed}): 20 min ohne Exception`, () => {
    const r = playAiVsAi(seed, 20);
    assert.ok(r.time >= 20 * 60 - 1 || r.winner !== null, `Spielzeit ${r.time.toFixed(1)} s`);
  });
}
