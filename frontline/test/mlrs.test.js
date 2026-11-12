import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { CITY } from '../js/data/city.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { UNITS } from '../js/data/units.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit
const DT = 0.05;
const mk = (opts) => classic(new Game(opts));
function run(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}
/** Szene weit weg von der Basis: Raketenwerfer (Team 0) bei (x, y). */
function scene(seed = 7) {
  const g = mk({ seed });
  for (const u of g.units) u.alive = false; // Startarmeen weg
  const z = g.zone;
  return { g, x: z.x + 1500, y: z.y };
}

test('Raketenwerfer: nur in der Fabrikhalle (Taste T), nicht in der Hauptstadt, indirekt', () => {
  const u = UNITS.mlrs;
  assert.ok(u);
  assert.equal(u.hotkey, 'T');
  assert.equal(u.cost.money, 1000);
  assert.equal(u.indirect, true, 'Zielsuche über die Reichweite wie die Panzerhaubitze');
  assert.ok(CITY.produces.factory.includes('mlrs'));
  assert.ok(!BUILDINGS.fob.produces.includes('mlrs'), 'nicht in der Hauptstadt');
});

test('Raketenwerfer: Reichweite 1600, Mindestreichweite 400, Salve 12 Schuss, 30 s Nachladen', () => {
  const w = UNITS.mlrs.weapons[0];
  assert.equal(w.range, 1600);
  assert.equal(w.minRange, 400);
  assert.equal(w.shell, true);
  assert.equal(w.splash, 60);
  assert.equal(w.spread, 120);
  assert.deepEqual(w.salvo, { count: 12, gap: 0.25, reload: 30 });
});

test('Raketenwerfer: Salve feuert 12 Geschosse, danach Pause von 30 s', () => {
  const { g, x, y } = scene();
  const m = g.spawnUnit('mlrs', 0, x, y);
  assert.match(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: x + 5000, y }).reason, /Reichweite/);
  assert.match(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: x + 200, y }).reason, /zu nah/);
  const tx = x + 800;
  const foe = g.spawnUnit('rifleman', 1, tx, y);
  foe.hp = 1e9;
  assert.ok(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: tx, y }).ok);
  const w = m.weapons[0];
  const r0 = w.rounds;
  run(g, 3.5); // 12 Schuss im Abstand 0,25 s: der letzte fällt bei etwa 2,75 s
  assert.equal(r0 - w.rounds, 12, 'eine Salve aus 12 Raketen');
  run(g, 25); // Nachladen 30 s: in dieser Zeit keine weitere Rakete
  assert.equal(r0 - w.rounds, 12, 'Pause nach der Salve');
  run(g, 6);
  assert.ok(r0 - w.rounds > 12, 'nach dem Nachladen beginnt die nächste Salve (ca. 33 s nach Salvenbeginn)');
  assert.ok(foe.hp < 1e9, 'Einschläge treffen den Gegner am Zielpunkt');
});

// Nachbesserung E15 (Punkt 5): Der Salvenzähler w.salvoLeft steht im Spielstand; Laden mitten in der Salve bleibt identisch.
test('Raketenwerfer: Laden mitten in der Salve, salvoLeft bleibt erhalten [langsam]', async () => {
  const { snapshotGame, restoreGame } = await import('../js/game/savegame.js');
  const { AI } = await import('../js/ai/ai.js');
  const { pack, unpack } = await import('../js/core/snapshot.js');
  const { g, x, y } = scene();
  const m = g.spawnUnit('mlrs', 0, x, y);
  const tx = x + 800;
  const foe = g.spawnUnit('rifleman', 1, tx, y);
  foe.hp = 1e9;
  assert.ok(g.issue(0, { type: 'mortarTarget', ids: [m.id], x: tx, y }).ok);
  run(g, 1); // etwa 4 Schuss der Salve sind gefallen
  const w = m.weapons[0];
  assert.ok(w.salvoLeft > 0 && w.salvoLeft < 12, 'Salve läuft noch');
  const { game: g2 } = restoreGame(await unpack(await pack(snapshotGame(g, new AI(g, 1, 'normal')))));
  const w2 = g2.getEntity(m.id).weapons[0];
  assert.equal(w2.salvoLeft, w.salvoLeft, 'Salvenzähler im Stand');
  assert.equal(w2.rounds, w.rounds);
  run(g, 3);
  run(g2, 3);
  assert.equal(w2.rounds, w.rounds, 'Weiterspielen nach dem Laden ist identisch');
  assert.equal(w2.salvoLeft, w.salvoLeft);
});
