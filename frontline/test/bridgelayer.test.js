import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { RELIEF } from '../js/game/relief.js';
import { UNITS } from '../js/data/units.js';

// Brückenleger (Paket E14): legt auf einer Flusszelle am Ufer eine Behelfsbrücke, danach ist die Zelle befahrbar.
const DT = 0.05;

test('Brückenleger: Befehl layBridge, nach layTime ist die Flusszelle befahrbar', () => {
  assert.equal(UNITS.bridgelayer.hotkey, 'C');
  const g = new Game({ seed: 7, river: true });
  const G = g.grid;
  const water = (c, r) => g.relief.heightAt(G.center(c), G.center(r)) < RELIEF.water;
  let cell = null;
  let bank = null;
  for (let r = 1; r < G.rows - 1 && !cell; r++) {
    for (let c = 1; c < G.cols - 1 && !cell; c++) {
      if (!G.terrain[G.idx(c, r)] || !water(c, r)) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dc, dr]) => !G.terrain[G.idx(c + dc, r + dr)] && !water(c + dc, r + dr));
      if (n) {
        cell = [c, r];
        bank = [c + n[0], r + n[1]];
      }
    }
  }
  assert.ok(cell, 'Testkarte hat eine Flusszelle am Ufer');
  const u = g.spawnUnit('bridgelayer', 0, G.center(bank[0]), G.center(bank[1]));
  // Befehl auf eine Landzelle wird abgelehnt
  assert.equal(g.issue(0, { type: 'layBridge', ids: [u.id], c: bank[0], r: bank[1] }).ok, false);
  assert.equal(g.issue(0, { type: 'layBridge', ids: [u.id], c: cell[0], r: cell[1] }).ok, true);
  const i = G.idx(cell[0], cell[1]);
  assert.ok(G.terrain[i], 'vor dem Legen bleibt die Zelle gesperrt');
  for (let t = 0; t < 2000 && G.terrain[i]; t += DT) g.update(DT);
  assert.equal(G.terrain[i], 0, 'danach ist die Zelle befahrbar');
  assert.equal(u.order.type, 'idle');
});

// Nachbesserung E15 (Punkt 4): Wird eine alte Brücke wieder Wasser, steht dort niemand mehr; u.laid bleibt im Stand erhalten.
const cellsOf = (g) => {
  const G = g.grid;
  const water = (c, r) => g.relief.heightAt(G.center(c), G.center(r)) < RELIEF.water;
  const out = [];
  for (let r = 1; r < G.rows - 1; r++) {
    for (let c = 1; c < G.cols - 1; c++) {
      if (!G.terrain[G.idx(c, r)] || !water(c, r)) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dc, dr]) => !G.terrain[G.idx(c + dc, r + dr)] && !water(c + dc, r + dr));
      if (n) out.push({ c, r, bank: [c + n[0], r + n[1]] });
    }
  }
  return out;
};

test('Brückenleger: alte Brücke wird Wasser, darauf stehende Einheit wird ans Ufer geschoben, u.laid im Stand [langsam]', async () => {
  const { snapshotGame, restoreGame } = await import('../js/game/savegame.js');
  const { AI } = await import('../js/ai/ai.js');
  const { pack, unpack } = await import('../js/core/snapshot.js');
  const g = new Game({ seed: 7, river: true });
  const G = g.grid;
  const cands = cellsOf(g);
  const first = cands[0];
  const second = cands.find((p) => Math.abs(p.c - first.c) + Math.abs(p.r - first.r) > 4);
  assert.ok(second, 'Testkarte hat zwei Flussstellen am Ufer');
  const u = g.spawnUnit('bridgelayer', 0, G.center(first.bank[0]), G.center(first.bank[1]));
  assert.ok(g.issue(0, { type: 'layBridge', ids: [u.id], c: first.c, r: first.r }).ok);
  const i1 = G.idx(first.c, first.r);
  for (let t = 0; t < 2000 && G.terrain[i1]; t += DT) g.update(DT);
  assert.equal(u.laid, i1, 'Brücke 1 gemerkt');
  // Gegner-Fußtruppe steht auf der Brücke (eigene Einheit darf nicht stören, Team 0 ist neutral genug für den Test)
  const inf = g.spawnUnit('rifleman', 0, G.center(first.c), G.center(first.r));
  // Stand speichern und laden: u.laid bleibt erhalten
  const ai = new AI(g, 1, 'normal');
  const { game: g2 } = restoreGame(await unpack(await pack(snapshotGame(g, ai))));
  const u2 = g2.getEntity(u.id);
  assert.equal(u2.laid, i1, 'u.laid im Spielstand');
  // Zweite Brücke an anderer Stelle (Fahrzeug direkt an dessen Ufer gesetzt, damit kein Umweg über den Fluss nötig ist):
  // die alte wird wieder Wasser
  u.x = G.center(second.bank[0]);
  u.y = G.center(second.bank[1]);
  assert.ok(g.issue(0, { type: 'layBridge', ids: [u.id], c: second.c, r: second.r }).ok);
  const i2 = G.idx(second.c, second.r);
  for (let t = 0; t < 4000 && G.terrain[i2]; t += DT) g.update(DT);
  assert.equal(G.terrain[i1], 1, 'alte Brücke ist wieder Wasser');
  assert.equal(u.laid, i2);
  const cell = G.idx(G.toCell(inf.x), G.toCell(inf.y));
  assert.notEqual(cell, i1, 'Einheit steht nicht mehr auf dem Wasser');
  assert.ok(G.passable(G.toCell(inf.x), G.toCell(inf.y), 0), 'Einheit steht auf befahrbarem Grund');
});
