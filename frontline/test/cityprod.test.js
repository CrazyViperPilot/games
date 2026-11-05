// KI-Stadt produziert (seit v5.19, AP4; eigene Datei seit dem Review, damit die langen Partien neben city.test.js laufen):
// KI gegen KI mit Stadt, 12 Spielminuten, zwei Seeds. Beide Städte fördern, haben Baumaterial und erzeugen Stahl und Munition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';

for (const seed of [3, 11]) {
  test(`KI-Stadt produziert (AP4): KI gegen KI, Seed ${seed}, 12 min: Förderung, Baumaterial nicht dauerhaft 0, Munition und Stahl in beiden Städten`, () => {
    const g = new Game({ seed, city: true });
    const ais = [new AI(g, 0, 'normal'), new AI(g, 1, 'normal')];
    const raw = [0, 0];
    const bmZero = [0, 0];
    let samples = 0;
    const steps = Math.round((12 * 60) / 0.1);
    for (let k = 0; k < steps; k++) {
      ais[0].update(0.1);
      ais[1].update(0.1);
      g.update(0.1);
      if (k % 10 !== 0) continue;
      samples++;
      for (let t = 0; t < 2; t++) {
        const s = g.city[t].stats;
        raw[t] += s.raw.wood + s.raw.stone + s.raw.ore + s.raw.oil;
        if (g.mainFob(t).store.bm <= 0) bmZero[t]++;
      }
    }
    for (let t = 0; t < 2; t++) {
      const made = g.city[t].made;
      assert.ok(raw[t] > 0, `Team ${t}: Förderung ${raw[t].toFixed(0)}`);
      assert.ok(bmZero[t] / samples < 0.5, `Team ${t}: Baumaterial im Lager 0 in ${(100 * bmZero[t] / samples).toFixed(0)} % der Zeit`);
      assert.ok(made.mun > 0, `Team ${t}: Munition ${made.mun.toFixed(0)}`);
      // Stahl (seit dem Review von v5.19 in beiden Städten): Hütte und Stahlwerk mit Weg, Förderung nur so viel, wie die Werke verarbeiten
      assert.ok(made.metal > 0, `Team ${t}: Stahl ${made.metal.toFixed(0)}`);
    }
  });
}
