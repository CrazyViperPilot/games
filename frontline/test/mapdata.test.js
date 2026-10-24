import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { generateMap } from '../js/game/map.js';
import { createEmptyMap, normalizeMap, cloneMap, checkMap, listMaps, loadMap, saveMap, deleteMap } from '../js/game/mapdata.js';

const DT = 0.05;

test('Generierte Karte übersteht JSON-Rundlauf und ist spielbar', () => {
  const m = generateMap(5);
  const copy = normalizeMap(JSON.parse(JSON.stringify(m)));
  assert.equal(copy.obstacles.length, m.obstacles.length);
  assert.equal(copy.town.buildings.length, m.town.buildings.length);
  assert.deepEqual(checkMap(copy), []);
  const g = new Game({ seed: 1, map: copy });
  for (let i = 0; i < 100; i++) g.update(DT);
  assert.equal(g.map, copy);
});

test('Leere Karte: spielbar, KI gegen KI läuft ohne Fehler', () => {
  const m = createEmptyMap('Test');
  assert.deepEqual(checkMap(m), []);
  const g = new Game({ seed: 3, map: m });
  const ai = [new AI(g, 0, 'normal'), new AI(g, 1, 'normal')];
  for (let i = 0; i < 20 * 60 * 3; i++) {
    for (const a of ai) a.update(DT);
    g.update(DT);
  }
  assert.ok(g.units.length > 8, 'es wurden Einheiten gebaut');
});

test('checkMap findet verbaute Startpunkte und unerreichbare Zonen', () => {
  const m = createEmptyMap();
  m.town.buildings.push({ x: m.spawns[0].x, y: m.spawns[0].y, w: 90, h: 70, kind: 'house' });
  assert.ok(checkMap(normalizeMap(m)).some((p) => p.includes('Startpunkt 1')));
  const w = createEmptyMap();
  for (let y = 0; y <= 9024; y += 90) w.town.buildings.push({ x: 4500, y, w: 90, h: 90, kind: 'factory' });
  assert.ok(checkMap(normalizeMap(w)).length > 0, 'durchgehende Mauer aus Gebäuden sperrt den Weg');
});

test('normalizeMap bereinigt Werte und verlangt zwei Startpunkte', () => {
  assert.throws(() => normalizeMap({ spawns: [] }));
  const m = normalizeMap({ spawns: [{ x: 1, y: 1 }, { x: 9, y: 9 }], obstacles: [{ x: -50, y: 99999, r: 1 }], town: { buildings: [{ x: 5, y: 5, kind: 'xyz' }] } });
  assert.equal(m.obstacles[0].x, 0);
  assert.equal(m.obstacles[0].r, 20);
  assert.equal(m.town.buildings[0].kind, 'house');
  assert.equal(cloneMap(m).town.buildings.length, 1);
});

test('Kartenspeicher: speichern, laden, löschen', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  try {
    const id = saveMap(createEmptyMap('Wüste'));
    assert.ok(id);
    assert.equal(listMaps().length, 1);
    assert.equal(loadMap(id).name, 'Wüste');
    assert.equal(saveMap({ ...createEmptyMap('Wüste 2') }, id), id, 'gleiche ID überschreibt');
    assert.equal(listMaps().length, 1);
    deleteMap(id);
    assert.equal(listMaps().length, 0);
    assert.equal(loadMap('gibtsnicht'), null);
  } finally {
    delete globalThis.localStorage;
  }
});
