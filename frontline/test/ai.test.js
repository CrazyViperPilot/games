import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';

BALANCE.slotCap = 1000; // diese Tests prüfen nicht das Einheitenlimit (siehe economy.test.js)
const DT = 0.05;
const START_UNITS = BALANCE.startUnits.length;
const mine = (game, team, type, built = true) =>
  game.buildings.filter((b) => b.alive && b.team === team && b.type === type && (!built || b.built));

/** KI gegen KI über `minutes` Spielminuten; liefert Kennzahlen je Team (Ausbildung, Zonenbesitz, Gebäude). */
function playAiVsAi(seed, minutes) {
  const game = new Game({ seed });
  const ais = [new AI(game, 0, 'normal'), new AI(game, 1, 'normal')];
  const seen = [new Set(), new Set()]; // alle je gesehenen Einheiten-IDs je Team
  const types = [new Set(), new Set()]; // alle je gesehenen Einheitentypen je Team
  let zoneHeld = false;
  let maxFobs = [0, 0];
  const steps = Math.round((minutes * 60) / DT);
  for (let i = 0; i < steps && game.winner === null; i++) {
    ais[0].update(DT);
    ais[1].update(DT);
    game.update(DT);
    if (i % 20 === 0) {
      for (const u of game.units) {
        seen[u.team].add(u.id);
        types[u.team].add(u.type);
      }
      if (game.zone.owner >= 0) zoneHeld = true;
      for (let t = 0; t < 2; t++) maxFobs[t] = Math.max(maxFobs[t], mine(game, t, 'fob').length);
    }
  }
  return {
    game,
    time: game.time,
    winner: game.winner,
    produced: seen.map((s) => s.size - START_UNITS),
    types,
    zoneHeld,
    maxFobs,
  };
}

test('KI allein (Seed 7): nach 10 min ≥ 3 FOBs, eine FOB in der Zone, Front-Lager gefüllt, Haupt-FOB bildet aus', () => {
  const game = new Game({ seed: 7 });
  const ai = new AI(game, 1, 'normal');
  const steps = Math.round((10 * 60) / DT);
  for (let i = 0; i < steps; i++) {
    ai.update(DT);
    game.update(DT);
  }
  assert.ok(game.time >= 10 * 60 - 1, `Spielzeit ${game.time.toFixed(1)} s`);
  const fobs = mine(game, 1, 'fob');
  const z = game.zone;
  const nearest = Math.min(...fobs.map((f) => Math.hypot(f.x - z.x, f.y - z.y)));
  assert.ok(fobs.length >= 3, `fertige FOBs: ${fobs.length}`);
  assert.ok(nearest <= z.r, `nächste FOB ${nearest.toFixed(0)} px von der Zonenmitte`);
  assert.ok(game.units.some((u) => u.alive && u.team === 1 && u.type === 'engineer'), 'Baufahrzeug lebt');
  assert.ok(game.mainFob(1), 'Haupt-FOB lebt');
  const front = fobs.filter((f) => !f.main);
  assert.ok(front.some((f) => f.store.bm > 100), 'LKW haben Baumaterial an die Front gebracht');
  assert.ok(game.units.filter((u) => u.alive && u.team === 1).length > START_UNITS, 'Einheiten ausgebildet');
  // kein Förderanlagen-Gebäude und nur die Haupt-FOB bildet aus
  assert.ok(game.buildings.every((b) => b.main || b.produces.length === 0));
});

for (const seed of [2, 3]) {
  test(`KI gegen KI (Seed ${seed}): 20 min ohne Exception, beide gründen FOBs und bilden aus, Zone wird gehalten`, () => {
    const r = playAiVsAi(seed, 20);
    assert.ok(r.time >= 20 * 60 - 1 || r.winner !== null, `Spielzeit ${r.time.toFixed(1)} s`);
    for (let t = 0; t < 2; t++) {
      assert.ok(r.maxFobs[t] >= 3, `Team ${t}: höchstens ${r.maxFobs[t]} FOBs`);
      assert.ok(r.produced[t] >= 8, `Team ${t}: ${r.produced[t]} Einheiten ausgebildet`);
    }
    assert.ok(r.zoneHeld, 'niemand hat die Zone gehalten');
  });
}

test('KI: leicht und schwer laufen ohne Exception (gegeneinander)', () => {
  const game = new Game({ seed: 3 });
  const ais = [new AI(game, 0, 'easy'), new AI(game, 1, 'hard')];
  for (let i = 0; i < Math.round((6 * 60) / DT); i++) {
    for (const ai of ais) ai.update(DT);
    game.update(DT);
  }
  assert.ok(game.time >= 6 * 60 - 1 || game.winner !== null);
});

test('KI ersetzt ein verlorenes Baufahrzeug', () => {
  const game = new Game({ seed: 7 });
  const ai = new AI(game, 1, 'normal');
  const run = (sec) => {
    for (let i = 0; i < Math.round(sec / DT); i++) {
      ai.update(DT);
      game.update(DT);
    }
  };
  run(120);
  const eng = () => game.units.filter((u) => u.alive && u.team === 1 && u.type === 'engineer');
  for (const u of eng()) u.hp = 0; // alle Baufahrzeuge fallen
  run(90);
  assert.ok(eng().length >= 1, 'kein Ersatz-Baufahrzeug ausgebildet');
});

test('KI: bildet ab 3 min mit Armee einen Späher (Little Bird) aus', () => {
  // Späher fliegen an den gegnerischen Zonenrand und fallen dort oft; gezählt wird, ob einer ausgebildet wurde
  const r = playAiVsAi(2, 8);
  const scouts = [0, 1].map((t) => r.types[t].has('littlebird'));
  assert.ok(scouts[0] || scouts[1], `Späher: ${scouts}`);
});

test('KI-Mischung: gegen Gepanzerte mehr PAK/Panzer, gegen Infanterie mehr Schützen; ohne Sicht Grundmischung', () => {
  const game = new Game({ seed: 3 });
  const ai = new AI(game, 1, 'normal');
  const foes = (types) => ({ enemies: types.map((type) => ({ def: UNITS[type] })) });
  const inf = ai.counterMix(foes(Array(10).fill('rifleman')));
  const arm = ai.counterMix(foes(Array(10).fill('tank')));
  assert.ok(arm.at > inf.at && arm.tank > inf.tank, 'gepanzert → mehr PAK und Panzer');
  assert.ok(inf.rifleman > arm.rifleman, 'Infanterie → mehr Schützen');
  const few = ai.counterMix(foes(['tank', 'tank']));
  assert.equal(few.at, 0.2, 'zu wenig gesehen → Grundmischung');
});

test('KI: Besatzung schickt einen Überfall auf eine gemerkte gegnerische FOB (schwer, Seed 1)', () => {
  // Die KI hält die Zone allein; danach steht eine gegnerische FOB abseits der Zone, die sie schon gesehen hat.
  const game = new Game({ seed: 1 });
  const ai = new AI(game, 1, 'hard');
  const run = (sec, stop = () => false) => {
    for (let i = 0; i < sec / DT && !stop(); i++) {
      ai.update(DT);
      game.update(DT);
    }
  };
  run(5 * 60);
  const z = game.zone;
  let fob = null;
  for (let k = 0; k < 16 && !fob; k++) {
    const a = (k * Math.PI) / 8;
    const p = game.canPlace(0, 'fob', z.x + Math.cos(a) * (z.r + 600), z.y + Math.sin(a) * (z.r + 600));
    if (p.ok) fob = game.spawnBuilding('fob', 0, p.cx, p.cy, { built: true });
  }
  assert.ok(fob, 'Platz für die gegnerische FOB');
  ai.seenFobs.set(fob.id, fob);
  run(5 * 60, () => ai.raid && ai.raid.ids.size > 0);
  assert.ok(ai.raid && ai.raid.ids.size > 0, 'kein Überfall gestartet');
  assert.equal(ai.raid.targetId, fob.id);
});

test('KI: Gruppen-Rückzug bei klarer Unterlegenheit (schwer, Seed 1, 20 min) und Sperre der Angriffsbefehle', () => {
  const game = new Game({ seed: 1 });
  const ais = [new AI(game, 0, 'hard'), new AI(game, 1, 'hard')];
  let fell = false;
  for (let i = 0; i < (20 * 60) / DT && game.winner === null && !fell; i++) {
    for (const ai of ais) ai.update(DT);
    game.update(DT);
    fell = ais.some((ai) => ai.fallbackUntil > game.time);
  }
  assert.ok(fell, 'kein Rückzug ausgelöst');
});

test('KI: Zonen-FOB bekommt zwei Mörser (Seed 7, 12 min)', () => {
  const game = new Game({ seed: 7 });
  const ai = new AI(game, 1, 'normal');
  for (let i = 0; i < (12 * 60) / DT; i++) {
    ai.update(DT);
    game.update(DT);
  }
  const zf = ai.snapshot().zoneFob;
  assert.ok(zf, 'keine Zonen-FOB');
  const near = game.buildings.filter((b) => b.alive && b.team === 1 && b.type === 'mortar' && Math.hypot(b.x - zf.x, b.y - zf.y) < BALANCE.fob.buildRadius);
  assert.ok(near.length >= 2, `Mörser an der Zonen-FOB: ${near.length}`);
});

test('KI-Schwierigkeit über Verhalten: leicht ohne Späher/Konter/Überfall/Rückzug, schwer ohne Einkommensbonus', () => {
  const d = BALANCE.difficulty;
  assert.deepEqual([d.easy.scout, d.easy.counter, d.easy.raid, d.easy.fallback], [false, false, false, false]);
  assert.deepEqual([d.normal.scout, d.normal.counter, d.normal.raid, d.normal.fallback], [true, true, false, false]);
  assert.deepEqual([d.hard.scout, d.hard.counter, d.hard.raid, d.hard.fallback], [true, true, true, true]);
  assert.equal(d.hard.incomeMult, 1);
});
