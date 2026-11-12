// KI nutzt den Pionier (Paket K4, „KI nutzt die neuen Einheiten“): Pioniere in der Kaserne ausbilden und Minen auf Zufahrten
// zwischen vorderster FOB und Konfliktzone legen (Befehl layMine). Gezielte Lagen mit festen Stubs, kein KI-gegen-KI-Lauf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { classic } from './classic.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { SAPPER_ARMY, SAPPER_MAX, SAPPER_MONEY, MINE_BLDG } from '../js/data/ai.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit

/** Szene: leere Karte, die KI (Team 1) mit einer Kaserne als Ausbildungsgebäude und einer vorderen FOB 800 px vor der Zone. */
function scene(army, difficulty = 'normal') {
  const g = classic(new Game({ seed: 7 }));
  for (const u of g.units) u.alive = false; // Startarmeen weg
  g.teams[1].res.money = 1e6;
  const ai = new AI(g, 1, difficulty); // legt selbst einen Befehl an (Schwierigkeit), daher erst danach die Sammlung
  const issued = [];
  g.issue = (team, cmd) => {
    issued.push(cmd);
    return { ok: true };
  };
  ai.pickProducer = () => ({ id: 9, queue: [] }); // die Kaserne ist frei
  const z = g.zone;
  const fob = { id: 8, type: 'fob', x: z.x - 800, y: z.y, built: true, alive: true, team: 1 };
  const s = {
    home: fob,
    ax: fob.x,
    ay: fob.y,
    zone: z,
    combat: Array.from({ length: army }, () => ({ x: 0, y: 0 })),
    units: [],
    own: [],
    builtFobs: [fob],
    producers: [],
    enemies: [],
  };
  return { g, ai, s, z, fob, issued };
}

/** Pionier (Befehl idle) an einer Stelle. */
const sapper = (id, x = 0, y = 0, order = { type: 'idle' }) => ({ id, type: 'sapper', x, y, order, alive: true, def: UNITS.sapper });

test('Pionier: erst ab SAPPER_ARMY Kampfeinheiten, höchstens SAPPER_MAX und mit SAPPER_MONEY Reserve', () => {
  const { g, ai, s, issued } = scene(SAPPER_ARMY - 1);
  ai.sappers(s);
  assert.equal(issued.length, 0, 'unter SAPPER_ARMY kein Pionier');
  s.combat.push({ x: 0, y: 0 });
  g.teams[1].res.money = UNITS.sapper.cost.money + SAPPER_MONEY - 1;
  ai.sappers(s);
  assert.equal(issued.length, 0, 'ohne Geldreserve kein Pionier');
  g.teams[1].res.money = UNITS.sapper.cost.money + SAPPER_MONEY;
  ai.sappers(s);
  assert.deepEqual(issued, [{ type: 'train', buildingId: 9, unit: 'sapper' }], 'dann ein Pionier in der Kaserne');
  issued.length = 0;
  for (let k = 0; k < SAPPER_MAX; k++) s.units.push(sapper(100 + k));
  ai.sappers(s);
  assert.equal(issued.length, 0, 'höchstens SAPPER_MAX Pioniere');
});

test('Pionier: auf Leicht keine Ausbildung', () => {
  const { ai, s, issued } = scene(SAPPER_ARMY, 'easy');
  ai.sappers(s);
  assert.equal(issued.length, 0);
});

test('Minen: der bereite Pionier bekommt einen Befehl layMine auf eine Stelle zwischen vorderer FOB und Zone', () => {
  const { g, ai, s, z, fob, issued } = scene(SAPPER_ARMY);
  g.time = 50;
  s.units.push(sapper(5, fob.x, fob.y));
  ai.minelay(s);
  assert.equal(issued.length, 1, 'ein Minenbefehl');
  const cmd = issued[0];
  assert.equal(cmd.type, 'layMine');
  assert.deepEqual(cmd.ids, [5]);
  // Stelle liegt auf der Strecke FOB → Zonenmitte (mit Streuung und Wegsuche Toleranz)
  const len = Math.hypot(z.x - fob.x, z.y - fob.y);
  const f = ((cmd.x - fob.x) * (z.x - fob.x) + (cmd.y - fob.y) * (z.y - fob.y)) / (len * len);
  assert.ok(f > 0.05 && f < 1.05, `Anteil ${f.toFixed(2)} zwischen FOB und Zone`);
  issued.length = 0;
  ai.minelay(s);
  assert.equal(issued.length, 0, 'innerhalb MINE_EVERY s kein neuer Befehl');
});

test('Minen: nur Pioniere ohne Auftrag, und nur solange sie weniger als maxMines Minen haben', () => {
  const { g, ai, s, issued } = scene(SAPPER_ARMY);
  g.time = 50;
  s.units.push(sapper(6, 0, 0, { type: 'attack' }));
  ai.minelay(s);
  assert.equal(issued.length, 0, 'Pionier im Gefecht legt keine Mine');
  s.units[0] = sapper(6);
  for (let k = 0; k < BALANCE.sapper.maxMines; k++) g.sapperMines.push({ x: 0, y: 0, team: 1, owner: 6, clear: 0 });
  ai.minelay(s);
  assert.equal(issued.length, 0, 'voll belegt: keine Mine mehr');
});

test('Minen: nicht auf eigene Gebäude', () => {
  const { g, ai, s, z, fob } = scene(SAPPER_ARMY);
  g.time = 50;
  // eigenes Gebäude genau auf der Mitte der Strecke
  const mx = (fob.x + z.x) / 2;
  const my = (fob.y + z.y) / 2;
  s.own.push({ id: 30, type: 'house', x: mx, y: my, alive: true, team: 1 });
  for (let k = 0; k < 20; k++) {
    const p = ai.minePoint(s, fob);
    if (p) assert.ok(Math.hypot(p.x - mx, p.y - my) > MINE_BLDG, 'Abstand zum eigenen Gebäude');
  }
});

test('Minen: ohne FOB und Hauptstadt keine Befehle', () => {
  const { g, ai, s, issued } = scene(SAPPER_ARMY);
  g.time = 50;
  s.units.push(sapper(7, 0, 0));
  s.builtFobs = [];
  s.home = null;
  ai.minelay(s);
  assert.equal(issued.length, 0, 'keine FOB und keine Hauptstadt: nichts');
});
