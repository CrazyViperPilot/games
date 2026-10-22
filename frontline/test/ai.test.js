import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { BALANCE } from '../js/data/balance.js';

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

/** KI allein (Team 1, normal), andere Seite passiv. Liefert Anzahl Förderanlagen, FOB-Abstände zur Zonenmitte. */
function playAiAlone(seed, minutes) {
  const game = new Game({ seed });
  const ai = new AI(game, 1, 'normal');
  const steps = Math.round((minutes * 60) / DT);
  for (let i = 0; i < steps; i++) {
    ai.update(DT);
    game.update(DT);
  }
  const own = game.buildings.filter((b) => b.alive && b.team === 1);
  const z = game.zone;
  return {
    extractors: own.filter((b) => b.type === 'extractor' && b.built).length,
    fobDistances: own
      .filter((b) => b.type === 'fob')
      .map((b) => Math.hypot(b.x - z.x, b.y - z.y)),
  };
}

test('KI allein (Seed 7): nach 10 min ≥ 5 Förderanlagen, ≥ 3 FOBs, eine FOB in der Zone', () => {
  const r = playAiAlone(7, 10);
  assert.ok(r.extractors >= 5, `nur ${r.extractors} Förderanlagen`);
  assert.ok(r.fobDistances.length >= 3, `nur ${r.fobDistances.length} FOBs`);
  const inZone = r.fobDistances.some((d) => d <= BALANCE.zone.r);
  assert.ok(inZone, `keine FOB in der Zone (Abstände ${r.fobDistances.map(Math.round)})`);
});

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
