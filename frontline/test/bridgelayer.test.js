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
