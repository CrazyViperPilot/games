// Zufallstest für Befehle (Paket „Robustheit“, Punkt 2): jeder Befehl des Befehlsregisters bekommt zufällig zusammengesetzte, auch
// kaputte Werte (fehlende Felder, NaN, Unendlich, Text statt Zahl, IDs toter, fremder oder nicht vorhandener Objekte, Granaten, Brücken,
// Häuser), jeweils ausgehend von einer gültigen Vorlage (TEMPLATES, Felder laut ARCHITEKTUR §6). Erwartet: jedes Mal eine Antwort { ok, … } ohne Ausnahme, und das Spiel läuft danach ohne Ausnahme und ohne Hänger weiter.
// Fester Seed (makeRng), damit ein Fund wiederholbar ist; die Meldung nennt Befehl und Werte. Angenommen wird rund die Hälfte der
// Befehle; nicht erreicht (brauchen eine eigene Lage): repairBridge (zerstörte Brücke), clearRubble (Schutt), storm (gegnerisch besetztes
// Haus), smoke/mine (Forschung), land/route/deliver (passende Ziele), cityUpgrade, research. Mit FUZZ_STATS=1 zeigt der Test die Zahlen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { COMMANDS } from '../js/game/commands.js';
import { makeRng } from '../js/core/rng.js';
import { createShell } from '../js/game/entities.js';
import { UNITS } from '../js/data/units.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { KINDS } from '../js/data/citykinds.js';
import { RESEARCH_KEYS } from '../js/game/research.js';
import { PRESETS } from '../js/game/logistics.js';

const DT = 0.05;
const ROAD_KINDS = ['mortar', 'flak', 'sam'];
const HOUSE_WORKS = ['sandbags', 'mgnest', 'wire'];

/**
 * Vorlagen aus der Befehlstabelle (ARCHITEKTUR §6): Feld → Art des gültigen Werts. Jeder Befehl startet gültig und wird dann verdorben
 * (ein Feld durch Unsinn ersetzt, eines weggelassen oder ein fremdes Feld dazu), sonst lehnen die Handler fast alles schon früh ab.
 */
const TEMPLATES = {
  city: { kind: 'cityKind', c0: 'col', r0: 'row', c1: 'col', r1: 'row', demolish: 'bool' },
  move: { ids: 'ids', x: 'x', y: 'y', formation: 'formation' },
  attackMove: { ids: 'ids', x: 'x', y: 'y' },
  attack: { ids: 'ids', targetId: 'target' },
  stop: { ids: 'ids' },
  build: { building: 'building', x: 'x', y: 'y', ids: 'ids' },
  buildWall: { building: 'building', x1: 'x', y1: 'y', x2: 'x', y2: 'y', ids: 'ids' },
  buildFob: { ids: 'ids', x: 'x', y: 'y' },
  deploy: { ids: 'ids', x: 'x', y: 'y' },
  repair: { ids: 'ids', targetId: 'ownThing' },
  repairBridge: { ids: 'ids', bridgeId: 'bridge' },
  load: { ids: 'ids', fobId: 'fob', preset: 'preset', work: 'cityEnt' },
  unload: { ids: 'ids', fobId: 'fob', preset: 'preset' },
  route: { ids: 'ids', fromId: 'fob', toId: 'fob', preset: 'preset', fromWork: 'cityEnt' },
  setPreset: { ids: 'ids', preset: 'preset' },
  mortarTarget: { ids: 'ids', x: 'x', y: 'y' },
  land: { ids: 'ids', airportId: 'cityEnt' },
  cityUpgrade: { buildingId: 'cityEnt' },
  dig: { ids: 'ids', c0: 'col', r0: 'row', c1: 'col', r1: 'row', append: 'bool' },
  shellRoad: { ids: 'ids', c0: 'col', r0: 'row', c1: 'col', r1: 'row' },
  clearRubble: { ids: 'ids', c0: 'col', r0: 'row' },
  storm: { ids: 'ids', houseId: 'house' },
  fortifyHouse: { houseId: 'house', work: 'houseWork' },
  trade: { good: 'good', dir: 'dir' },
  board: { ids: 'ids', heliId: 'unitId' },
  dropoff: { ids: 'ids', x: 'x', y: 'y' },
  garrison: { ids: 'ids', houseId: 'house' },
  ungarrison: { ids: 'ids' },
  roof: { buildingId: 'building_', kind: 'roofKind' },
  fortify: { buildingId: 'fob', towers: 'small', tx: 'x', ty: 'y', ids: 'ids' },
  pickup: { ids: 'ids', crateId: 'crate' },
  deliver: { ids: 'ids', fobId: 'fob' },
  dropCrate: { ids: 'ids' },
  drill: { ids: 'ids' },
  train: { buildingId: 'trainer', unit: 'unit' },
  cancelTrain: { buildingId: 'trainer' },
  research: { buildingId: 'fob', key: 'researchKey' },
  cancelResearch: { key: 'researchKey' },
  smoke: { ids: 'ids' },
  mine: { ids: 'ids' },
  rally: { buildingId: 'trainer', x: 'x', y: 'y' },
  demolish: { buildingId: 'building_' },
  setDifficulty: { difficulty: 'difficulty' },
};

/** Spiel mit allen Schaltern, je einer Einheit jeder Sorte für Blau, etwas Vorlauf und einer fliegenden Granate. */
function world() {
  const g = new Game({ seed: 5, radio: true, weather: 'random', research: true, river: true, city: true, buildRules: true });
  g.teams[0].res.money = 1e6;
  g.city[0].metal = 1e5;
  g.city[0].popF = 2000;
  Object.assign(g.mainFob(0).store, { bm: 1e5, mun: 1e5, fuel: 1e5 });
  const m = g.mainFob(0);
  let k = 0;
  for (const type of Object.keys(UNITS)) {
    for (let n = 0; n < 2; n++, k++) g.spawnUnit(type, 0, m.x + 200 + (k % 10) * 40, m.y + 200 + Math.floor(k / 10) * 40);
  }
  for (let s = 0; s < 200; s++) g.update(DT);
  const u = g.units.find((x) => x.alive && x.team === 1);
  g.projectiles.push(createShell(g.newId(), 1, u.x, u.y, u.x + 300, u.y, { shellSpeed: 300, damage: { inf: 10 }, splash: 30 }));
  const dead = g.units.find((x) => x.alive && x.team === 0 && x.type === 'rifleman');
  dead.alive = false; // tote Einheit, die noch in der Liste steht
  return { g, dead };
}

const JUNK = [undefined, null, NaN, Infinity, -Infinity, -5, 0, 1e9, 'x', '', true, {}, [], [NaN]];

/** Gültige Werte je Art, aus dem Spiel abgeleitet (bei jedem Aufruf neu, Einheiten sterben und entstehen). */
function makeGen(g, dead, rng) {
  const choose = (arr) => (arr.length ? arr[Math.floor(rng.next() * arr.length)] : undefined);
  const own = () => g.units.filter((u) => u.alive && u.team === 0);
  const ents = (t) => [...(g.city?.[t]?.ents.values() ?? [])].filter((e) => e.alive);
  const S = 64;
  const near = () => choose(own()) ?? g.mainFob(0);
  return {
    ids: () => {
      // 1 bis 3 Einheiten einer zufälligen Sorte (sonst sind passende Ausführende, z. B. nur LKW, selten zusammen gewählt)
      const list = own();
      const type = choose(list)?.type;
      const same = list.filter((u) => u.type === type);
      const n = 1 + Math.floor(rng.next() * 3);
      const out = [];
      for (let k = 0; k < n; k++) out.push(choose(same)?.id);
      if (rng.next() < 0.1) out.push(dead.id);
      return out;
    },
    x: () => near().x + (rng.next() - 0.5) * 1200,
    y: () => near().y + (rng.next() - 0.5) * 1200,
    col: () => Math.floor(near().x / S) + Math.floor((rng.next() - 0.5) * 8),
    row: () => Math.floor(near().y / S) + Math.floor((rng.next() - 0.5) * 8),
    target: () => choose([...g.units.filter((u) => u.alive && u.team === 1), ...g.buildings.filter((b) => b.alive && b.team === 1), ...(g.bridges ?? []), ...(g.houses ?? []), ...ents(1), g.projectiles[0]].filter(Boolean))?.id,
    ownThing: () => choose([...g.buildings.filter((b) => b.alive && b.team === 0), ...own(), ...ents(0)])?.id,
    bridge: () => choose(g.bridges ?? [])?.id,
    fob: () => choose(g.buildings.filter((b) => b.alive && b.team === 0 && b.type === 'fob'))?.id,
    building_: () => choose([...g.buildings.filter((b) => b.alive && b.team === 0), ...ents(0)])?.id,
    cityEnt: () => choose(ents(0))?.id,
    trainer: () => choose([...ents(0).filter((e) => e.produces), ...g.buildings.filter((b) => b.team === 0 && b.produces)])?.id,
    house: () => choose(g.houses ?? [])?.id,
    unitId: () => choose(g.units.filter((u) => u.alive))?.id,
    crate: () => choose(g.crates ?? [])?.id,
    building: () => choose(Object.keys(BUILDINGS)),
    unit: () => choose(Object.keys(UNITS)),
    cityKind: () => choose([...KINDS, 'erase']),
    roofKind: () => choose(ROAD_KINDS),
    houseWork: () => choose(HOUSE_WORKS),
    researchKey: () => choose(RESEARCH_KEYS),
    good: () => choose(['bm', 'mun', 'fuel', 'metal', 'kero']),
    dir: () => choose(['buy', 'sell']),
    preset: () => choose(PRESETS),
    formation: () => choose(['wedge', 'line', 'loose', undefined]),
    difficulty: () => choose(['easy', 'normal', 'hard']),
    small: () => choose([1, 2]),
    bool: () => rng.next() < 0.5,
    junk: () => choose(JUNK),
  };
}

test('Zufallstest: jeder Befehl mit gültigen und verdorbenen Werten antwortet ohne Ausnahme, das Spiel läuft weiter', { timeout: 300000 }, () => {
  const { g, dead } = world();
  const rng = makeRng(20261108);
  const gen = makeGen(g, dead, rng);
  const types = Object.keys(COMMANDS).filter((t) => t !== 'debug'); // debug ist nur mit ?debug=1 erreichbar
  for (const t of types) assert.ok(TEMPLATES[t], `Vorlage für ${t} fehlt (neuer Befehl? hier ergänzen)`);
  const failures = [];
  const oks = {};
  let issued = 0;
  for (let round = 0; round < 40; round++) {
    for (const type of types) {
      for (const mode of ['gültig', 'Unsinn', 'fehlt', 'fremd']) {
        const cmd = { type };
        for (const [f, kind] of Object.entries(TEMPLATES[type])) if (rng.next() < 0.9) cmd[f] = gen[kind]();
        const fields = Object.keys(TEMPLATES[type]);
        const f = fields[Math.floor(rng.next() * fields.length)];
        if (mode === 'Unsinn' && f) cmd[f] = gen.junk();
        if (mode === 'fehlt' && f) delete cmd[f];
        if (mode === 'fremd') cmd[['targetId', 'ids', 'x', 'buildingId', 'kind'][Math.floor(rng.next() * 5)]] = gen.junk();
        const team = mode === 'gültig' || rng.next() < 0.8 ? 0 : 1;
        let r;
        try {
          r = g.issue(team, cmd);
        } catch (e) {
          failures.push(`${type} (${mode}) ${JSON.stringify(cmd)}: ${e.message} @ ${e.stack.split('\n')[1]?.trim()}`);
          continue;
        }
        issued++;
        if (r?.ok) oks[type] = (oks[type] ?? 0) + 1;
        if (!r || typeof r.ok !== 'boolean') failures.push(`${type} (${mode}) ${JSON.stringify(cmd)}: Antwort ohne ok (${JSON.stringify(r)})`);
      }
    }
    // nach jeder Runde weiterspielen: angenommene Aufträge mit Unsinnswerten dürfen weder werfen noch hängen
    const t0 = Date.now();
    try {
      for (let k = 0; k < 20; k++) g.update(DT);
    } catch (e) {
      failures.push(`Spielschritt nach Runde ${round}: ${e.message} @ ${e.stack.split('\n')[1]?.trim()}`);
    }
    if (Date.now() - t0 > 5000) failures.push(`Spielschritt nach Runde ${round} dauerte ${Date.now() - t0} ms`);
    if (failures.length > 15) break;
  }
  const bad = g.units.filter((u) => u.alive && !(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp)));
  for (const u of bad.slice(0, 3)) failures.push(`kaputte Zahlen an ${u.type} ${u.id}: x=${u.x} y=${u.y} hp=${u.hp} Auftrag ${JSON.stringify(u.order)}`);
  for (const t of g.teams) for (const [k, v] of Object.entries(t.res)) if (!Number.isFinite(v)) failures.push(`Ressource ${k} von Team ${t.id} = ${v}`);
  if (process.env.FUZZ_STATS) console.log('angenommen je Befehl', JSON.stringify(oks));
  assert.deepEqual(failures.slice(0, 15), [], `${failures.length} Funde`);
  assert.ok(issued > 5000, `genug Befehle geprüft (${issued})`);
  // Abdeckung: die meisten Befehle werden auch angenommen (sonst prüft der Test nur Ablehnungen)
  const covered = types.filter((t) => oks[t] > 0);
  assert.ok(covered.length >= types.length * 0.45, `angenommen nur ${covered.length}/${types.length}: ${types.filter((t) => !oks[t]).join(', ')}`);
});
