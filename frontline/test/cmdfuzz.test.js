// Zufallstest für Befehle (Paket „Robustheit“): jeder Befehl des Befehlsregisters bekommt zufällig zusammengesetzte, auch kaputte Werte
// (fehlende Felder, NaN, Unendlich, Text statt Zahl, IDs toter, fremder oder nicht vorhandener Objekte, Granaten, Brücken, Häuser), jeweils
// ausgehend von einer gültigen Vorlage (TEMPLATES, Felder laut ARCHITEKTUR §6). Erwartet: jedes Mal eine Antwort { ok, … } ohne Ausnahme,
// und das Spiel läuft danach ohne Ausnahme, ohne Hänger und ohne NaN-Positionen weiter. Der Zufall bringt rund die Hälfte der Befehle bis
// zur Annahme; die übrigen prüfen gezielte Lagen unten (SCENES: zerstörte Brücke, Schutt, besetzte Häuser, Forschung, zwei FOBs,
// FOB-Fahrzeug, Heliport, Stellplatz, getragene Kiste, Bohrer, Gefechtsturm …). Damit ist jeder Befehl außer dem veralteten buildFob
// (lehnt immer ab) mindestens einmal angenommen. Fester Seed (makeRng): ein Fund ist wiederholbar. FUZZ_STATS=1 zeigt die Zahlen je Befehl.
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
import { createEmptyMap } from '../js/game/mapdata.js';
import { breakBridge } from '../js/game/river.js';
import { destroyRoad, cellCenter } from '../js/game/roadwar.js';
import { cityTrainers } from '../js/game/city/query.js';
import { KIND_ID } from '../js/data/citykinds.js';
import { RESEARCH } from '../js/data/research.js';
import { CITY } from '../js/data/city.js';
import { canZone, roadAt } from '../js/game/city/cells.js';

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
  layMine: { ids: 'ids', x: 'x', y: 'y' },
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
  for (let round = 0; round < 60; round++) {
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

// ---- Gezielte Lagen: Befehle, die der Zufall oben kaum bis zur Annahme bringt -------------------------------------------------------
// Je Lage ein gültiger Befehl (muss angenommen werden), danach verdorbene Varianten auf derselben Lage (ein Feld Unsinn oder weg) und
// Weiterspielen: keine Ausnahme, keine NaN-Positionen.

const run = (g, s) => {
  for (let k = 0; k < Math.round(s / DT); k++) g.update(DT);
};

/** Leere Karte mit einem Haus (Häuserkampf), ohne Startarmee. */
function houseGame() {
  const map = createEmptyMap('Stadt');
  map.town.buildings.push({ x: 3000, y: 3000, w: 96, h: 76, kind: 'house' });
  const g = new Game({ map });
  for (const u of g.units) u.alive = false;
  g.cleanup();
  return g;
}

/** Spiel mit Stadt ohne Baugebiet, Blau reich. */
function cityGame(opts = {}) {
  const g = new Game({ seed: 3, city: true, river: true, research: true, ...opts });
  g.teams[0].res.money = 1e6;
  g.city[0].metal = 1e5;
  g.city[0].popF = 2000;
  return g;
}

/** Freie Fläche W × H (mit Rand) nächst der Hauptstadt im Stadtraster (wie in airbase/helipad.test.js). */
function freeArea(g, c, m, W, H) {
  let best = null;
  const mc = Math.floor(m.x / c.cell);
  const mr = Math.floor(m.y / c.cell);
  for (let r = 1; r < c.rows - H - 1; r++) {
    for (let q = 1; q < c.cols - W - 1; q++) {
      const d = Math.abs(q - mc) + Math.abs(r - mr);
      if (best && d >= best.d) continue;
      let ok = true;
      for (let y = r - 1; ok && y <= r + H; y++) {
        for (let x = q - 1; ok && x <= q + W; x++) {
          const j = y * c.cols + x;
          ok = canZone(g, c, j) && !c.kind[j] && !roadAt(c, j) && !c.deposit[j];
        }
      }
      if (ok) best = { q, r, d };
    }
  }
  assert.ok(best, 'freie Fläche');
  return best;
}

/** Schütze von Blau, der eine Versorgungskiste der Karte aufgehoben hat. */
function carrier() {
  const g = new Game({ seed: 3 });
  const crate = g.crates.find((c) => c.state !== 'stored' && c.state !== 'carried');
  const man = g.spawnUnit('rifleman', 0, crate.x + 20, crate.y);
  assert.ok(g.issue(0, { type: 'pickup', ids: [man.id], crateId: crate.id }).ok, 'aufheben');
  for (let k = 0; k < 400 && !man.crate; k++) g.update(DT);
  assert.ok(man.crate, 'trägt die Kiste');
  return { g, man };
}

const SCENES = {
  repairBridge: () => {
    const g = cityGame();
    const b = g.bridges.find((x) => !x.broken);
    breakBridge(g, b);
    const eng = g.spawnUnit('engineer', 0, b.x1 - 60, b.y1);
    return { g, cmd: { type: 'repairBridge', ids: [eng.id], bridgeId: b.id } };
  },
  clearRubble: () => {
    const g = cityGame();
    const c = g.city[0];
    const i = c.list.find((j) => c.kind[j] === KIND_ID.road);
    destroyRoad(g, i);
    const { x, y } = cellCenter(g, i);
    const eng = g.spawnUnit('engineer', 0, x + 40, y);
    return { g, cmd: { type: 'clearRubble', ids: [eng.id], c0: i % c.cols, r0: Math.floor(i / c.cols) } };
  },
  storm: () => {
    const g = houseGame();
    const h = g.houses[0];
    const foe = g.spawnUnit('rifleman', 1, 3000, 3100);
    g.issue(1, { type: 'garrison', ids: [foe.id], houseId: h.id });
    run(g, 4);
    const own = [0, 1, 2].map((k) => g.spawnUnit('rifleman', 0, 2880 + k * 60, 3200));
    run(g, 2);
    return { g, cmd: { type: 'storm', ids: own.map((u) => u.id), houseId: h.id } };
  },
  ungarrison: () => {
    const g = houseGame();
    const h = g.houses[0];
    const own = g.spawnUnit('rifleman', 0, 3000, 3100);
    g.issue(0, { type: 'garrison', ids: [own.id], houseId: h.id });
    run(g, 4);
    return { g, cmd: { type: 'ungarrison', ids: [own.id] } };
  },
  fortifyHouse: () => {
    const g = houseGame();
    const h = g.houses[0];
    g.teams[0].res.money = 5000;
    const own = g.spawnUnit('rifleman', 0, 3000, 3100);
    g.issue(0, { type: 'garrison', ids: [own.id], houseId: h.id });
    run(g, 4);
    return { g, cmd: { type: 'fortifyHouse', houseId: h.id, work: 'sandbags' } };
  },
  smoke: () => {
    const g = cityGame();
    g.teams[0].tech.done.push(RESEARCH_KEYS.find((k) => RESEARCH.items[k].unlock === 'smoke'));
    const tank = g.units.find((u) => u.team === 0 && u.type === 'tank');
    return { g, cmd: { type: 'smoke', ids: [tank.id] } };
  },
  mine: () => {
    const g = cityGame();
    g.teams[0].tech.done.push(RESEARCH_KEYS.find((k) => RESEARCH.items[k].unlock === 'mines'));
    const eng = g.units.find((u) => u.team === 0 && u.type === 'engineer');
    return { g, cmd: { type: 'mine', ids: [eng.id] } };
  },
  research: () => {
    const g = new Game({ seed: 3, research: true }); // ohne Stadt (mit Stadt braucht Forschung eine Universität)
    g.teams[0].res.money = 1e5;
    const key = RESEARCH_KEYS.find((k) => RESEARCH.items[k].tier === 1);
    return { g, cmd: { type: 'research', buildingId: g.mainFob(0).id, key } };
  },
  cancelResearch: () => {
    const g = new Game({ seed: 3, research: true });
    g.teams[0].res.money = 1e5;
    const key = RESEARCH_KEYS.find((k) => RESEARCH.items[k].tier === 1);
    g.issue(0, { type: 'research', buildingId: g.mainFob(0).id, key });
    return { g, cmd: { type: 'cancelResearch', key } };
  },
  train: () => {
    const g = cityGame();
    const k = cityTrainers(g, 0).find((e) => e.produces.includes('rifleman'));
    return { g, cmd: { type: 'train', buildingId: k.id, unit: 'rifleman' } };
  },
  cancelTrain: () => {
    const g = cityGame();
    const k = cityTrainers(g, 0).find((e) => e.produces.includes('rifleman'));
    g.issue(0, { type: 'train', buildingId: k.id, unit: 'rifleman' });
    return { g, cmd: { type: 'cancelTrain', buildingId: k.id } };
  },
  route: () => {
    const g = new Game({ seed: 3 });
    const m = g.mainFob(0);
    const fob = g.spawnBuilding('fob', 0, g.grid.toCell(m.x + 900), g.grid.toCell(m.y), { built: true });
    const truck = g.units.find((u) => u.team === 0 && u.type === 'truck');
    return { g, cmd: { type: 'route', ids: [truck.id], fromId: m.id, toId: fob.id, preset: 'mix' } };
  },
  deploy: () => {
    const g = new Game({ seed: 3 });
    const m = g.mainFob(0);
    const v = g.spawnUnit('fobTruck', 0, m.x + 1400, m.y + 300);
    return { g, cmd: { type: 'deploy', ids: [v.id] } };
  },
  land: () => {
    const g = cityGame();
    const { c } = { c: g.city[0] };
    const a = freeArea(g, c, g.mainFob(0), 6, 4);
    const put = (kind, dq, dr, w = 0) => assert.ok(g.issue(0, { type: 'city', kind, c0: a.q + dq, r0: a.r + dr, c1: a.q + dq + w, r1: a.r + dr }).ok, kind);
    put('road', 0, 2, 5);
    put('heliport', 0, 1);
    run(g, CITY.growTime + 1);
    const pad = [...c.ents.values()].find((e) => e.alive && c.kind[e.cityCell] === KIND_ID.heliport);
    const heli = g.spawnUnit('gunship', 0, pad.x + 600, pad.y);
    return { g, cmd: { type: 'land', ids: [heli.id], airportId: pad.id } };
  },
  cityUpgrade: () => {
    const g = cityGame();
    const c = g.city[0];
    Object.assign(g.mainFob(0).store, { bm: 1e5 });
    const a = freeArea(g, c, g.mainFob(0), 12, 6);
    assert.ok(g.issue(0, { type: 'city', kind: 'runway', c0: a.q, r0: a.r, c1: a.q + 9, r1: a.r + 1 }).ok, 'Bahn');
    assert.ok(g.issue(0, { type: 'city', kind: 'stand', c0: a.q, r0: a.r + 2, c1: a.q, r1: a.r + 2 }).ok, 'Stellplatz');
    run(g, CITY.growTime + 1);
    const stand = [...c.ents.values()].find((e) => e.alive && c.kind[e.cityCell] === KIND_ID.stand);
    return { g, cmd: { type: 'cityUpgrade', buildingId: stand.id } };
  },
  deliver: () => {
    const { g, man } = carrier();
    return { g, cmd: { type: 'deliver', ids: [man.id], fobId: g.mainFob(0).id } };
  },
  dropCrate: () => {
    const { g, man } = carrier();
    return { g, cmd: { type: 'dropCrate', ids: [man.id] } };
  },
  drill: () => {
    const g = new Game({ seed: 7 });
    const m = g.mainFob(0);
    const T = g.grid.tile;
    const d = g.spawnBuilding('drill', 0, Math.floor((m.x + 200) / T), Math.floor((m.y - 200) / T));
    run(g, 32); // Aufwärmen
    return { g, cmd: { type: 'drill', ids: [d.id] } };
  },
  roof: () => {
    const g = new Game({ map: createEmptyMap('Festung') });
    const m = g.mainFob(0);
    g.teams[0].res.money = 1e5;
    const t = g.spawnBuilding('tower', 0, m.cx + 6, m.cy, { built: true });
    return { g, cmd: { type: 'roof', buildingId: t.id, kind: 'mortar' } };
  },
  repair: () => {
    const g = new Game({ seed: 3 });
    const m = g.mainFob(0);
    m.hp = m.maxHp / 2;
    const eng = g.units.find((u) => u.team === 0 && u.type === 'engineer');
    return { g, cmd: { type: 'repair', ids: [eng.id], targetId: m.id } };
  },
};

for (const [type, make] of Object.entries(SCENES)) {
  test(`Gezielte Lage „${type}“: gültig angenommen, verdorbene Varianten ohne Ausnahme, Spiel läuft weiter`, () => {
    const { g, cmd } = make();
    const r = g.issue(0, cmd);
    assert.equal(r.ok, true, `gültiger Befehl abgelehnt: ${r.reason}`);
    run(g, 2);
    const rng = makeRng(type.length * 7919);
    const fields = Object.keys(cmd).filter((f) => f !== 'type');
    for (let k = 0; k < 30; k++) {
      const bad = { ...cmd };
      const f = fields[Math.floor(rng.next() * fields.length)];
      if (rng.next() < 0.5) bad[f] = JUNK[Math.floor(rng.next() * JUNK.length)];
      else delete bad[f];
      let res;
      assert.doesNotThrow(() => (res = g.issue(rng.next() < 0.8 ? 0 : 1, bad)), `${type} ${JSON.stringify(bad)}`);
      assert.equal(typeof res.ok, 'boolean', `${type} ${JSON.stringify(bad)}: Antwort ohne ok`);
      if (k % 5 === 0) assert.doesNotThrow(() => run(g, 0.5), `Spielschritt nach ${type} ${JSON.stringify(bad)}`);
    }
    run(g, 5);
    const nan = g.units.find((u) => u.alive && !(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp)));
    assert.equal(nan, undefined, nan ? `NaN an ${nan.type}: ${JSON.stringify(nan.order)}` : '');
  });
}
