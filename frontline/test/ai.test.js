import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';

const DT = 0.05;
const MINUTES = 20;

/** KI gegen KI, 20 Minuten Spielzeit. Liefert Kennzahlen je Team. */
function playAiVsAi(seed) {
  const game = new Game({ seed });
  const ais = [new AI(game, 0, 'normal'), new AI(game, 1, 'normal')];
  const startIds = new Set(game.units.map((u) => u.id));
  const seen = new Set();
  const produced = [0, 0];
  const maxExtractors = [0, 0];
  let zoneHeld = false;

  const steps = Math.round((MINUTES * 60) / DT);
  for (let i = 0; i < steps; i++) {
    ais[0].update(DT);
    ais[1].update(DT);
    game.update(DT);

    for (const u of game.units) {
      if (startIds.has(u.id) || seen.has(u.id)) continue;
      seen.add(u.id);
      produced[u.team]++;
    }
    for (let t = 0; t < 2; t++) {
      const n = game.buildings.filter((b) => b.alive && b.built && b.team === t && b.type === 'extractor').length;
      if (n > maxExtractors[t]) maxExtractors[t] = n;
    }
    if (game.zone.owner !== -1) zoneHeld = true;
  }

  return {
    time: game.time,
    produced,
    maxExtractors,
    zoneHeld,
    points: game.teams.map((t) => t.points),
  };
}

for (const seed of [1, 2]) {
  test(`KI gegen KI (Seed ${seed}): 20 min ohne Fehler, beide Teams bauen und kämpfen`, () => {
    const r = playAiVsAi(seed);

    assert.ok(r.time >= MINUTES * 60 - 1, `Spielzeit ${r.time.toFixed(1)} s`);
    for (let t = 0; t < 2; t++) {
      assert.ok(r.maxExtractors[t] >= 2, `Team ${t}: nur ${r.maxExtractors[t]} Förderanlagen gleichzeitig`);
      assert.ok(r.produced[t] >= 10, `Team ${t}: nur ${r.produced[t]} produzierte Einheiten`);
    }
    assert.ok(r.zoneHeld, 'niemand hat die Zone zeitweise gehalten');
    assert.ok(Math.max(...r.points) > 0, `keiner hat Punkte: ${r.points}`);
  });
}
