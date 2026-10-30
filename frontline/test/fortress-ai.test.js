// KI baut FOBs zur Festung aus: Mauerring, Tore, Türme mit Besatzung und Dachaufbau, Transporthubschrauber.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { BALANCE } from '../js/data/balance.js';

BALANCE.slotCap = 1000;
const DT = 0.05;

/** Team 0 (KI) spielt gegen ein passives Team 1, damit der Ausbau ungestört läuft. */
function play(seed, level, minutes) {
  const game = new Game({ seed });
  const ai = new AI(game, 0, level);
  let heli = false;
  for (let i = 0; i < (minutes * 60) / DT && game.winner === null; i++) {
    ai.update(DT);
    game.update(DT);
    if (i % 40 === 0 && game.units.some((u) => u.alive && u.type === 'transporter')) heli = true;
  }
  return { game, heli };
}

const of = (g, team, type) => g.buildings.filter((b) => b.alive && b.team === team && b.type === type);

test('KI (schwer) baut die Haupt-FOB zur Festung aus: Tore, Mauern, Türme mit Besatzung und Aufbau, Hubschrauber', () => {
  const { game: g, heli } = play(5, 'hard', 14);
  const towers = of(g, 0, 'tower').filter((b) => b.built);
  assert.ok(of(g, 0, 'gate').length >= 3, `Tore ${of(g, 0, 'gate').length}`);
  assert.ok(of(g, 0, 'wall').length >= 20, `Mauern ${of(g, 0, 'wall').length}`);
  assert.ok(towers.length >= 1, 'Türme');
  assert.ok(towers.some((b) => b.occupants.length > 0), 'Besatzung');
  assert.ok(towers.some((b) => b.roof), 'Dachaufbau');
  assert.ok(heli, 'Transporthubschrauber');
});

test('KI (leicht) baut keine Festung', () => {
  const { game: g } = play(5, 'easy', 14);
  assert.equal(of(g, 0, 'tower').length, 0);
});
