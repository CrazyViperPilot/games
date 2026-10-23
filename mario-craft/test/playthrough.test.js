// Spieltest: der Bot (test/helpers/bot.js) spielt Welt-1-Level mit der echten Physik (Schritt 1/120) bis zum Portal.
// Start: 99 Leben, Bogen, Hacke wie im Level (pick 0); Gegnertreffer werden ignoriert (Fokus: Level-Geometrie).
// Scheitert ein Level, nennt die Meldung die Stelle (Spalte/Zeile) und den Grund aus dem Bot-Protokoll.
// Level-Fehler, die der Bot findet, werden hier als { todo: '...' } markiert (Suite bleibt grün), Beispiel:
//   const TODO = { 'w1-3': 'Sprung bei Spalte 57, Zeile 27 zu knapp (7,4 statt 8 Kacheln)' };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../js/data/levels/index.js';
import { playLevel } from './helpers/bot.js';

const TIME_LIMIT = 300;   // s Simulationszeit je Level
const TODO = {};

for (const id of ['w1-1', 'w1-2', 'w1-3', 'w2-1', 'w2-2', 'w3-1', 'w3-2', 'w3-3']) {
  const opts = TODO[id] ? { todo: TODO[id] } : {};
  test(`Bot spielt ${id} bis zum Portal`, opts, () => {
    const def = LEVELS.find((l) => l.id === id);
    assert.ok(def, `Level ${id} fehlt`);
    const r = playLevel(def, { maxTime: TIME_LIMIT, lives: 99, power: 'bow' });
    assert.equal(r.won, true, r.summary);
    assert.ok(r.simTime < TIME_LIMIT, `${id}: ${r.simTime} s`);
  });
}
