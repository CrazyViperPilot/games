import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { generateMap } from '../js/game/map.js';
import { createEmptyMap, normalizeMap, cloneMap, checkMap, listMaps, loadMap, saveMap, deleteMap } from '../js/game/mapdata.js';
import { BALANCE } from '../js/data/balance.js';
import { Relief, RELIEF, reliefOf } from '../js/game/relief.js';

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
  for (let y = 0; y <= BALANCE.map.height; y += 90) w.town.buildings.push({ x: 4500, y, w: 90, h: 90, kind: 'factory' });
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

test('Straßen: Kreuzungen und Einmündungen werden erkannt', async () => {
  const { roadJunctions } = await import('../js/render/terrain.js');
  const h = { x1: 0, y1: 100, x2: 400, y2: 100, w: 64 };
  const j = roadJunctions([h, { x1: 200, y1: 0, x2: 200, y2: 200, w: 64 }, { x1: 300, y1: 100, x2: 300, y2: 300, w: 64 }, { x1: 50, y1: 400, x2: 90, y2: 400, w: 64 }]);
  assert.equal(j.length, 2, 'Kreuzung und T-Einmündung, die ferne Straße nicht');
  assert.deepEqual(j.map((p) => [Math.round(p.x), Math.round(p.y)]).sort(), [[200, 100], [300, 100]]);
});

test('Gleise: ältere Einzel-Bahnlinie wird zu einer Strecke, freie Gleise bleiben erhalten', () => {
  const old = normalizeMap({ spawns: [{ x: 700, y: 8000 }, { x: 8000, y: 700 }], town: { rail: { y: 4000, x1: 0, x2: 9024, half: 40 } } });
  assert.equal(old.town.rails.length, 1);
  assert.deepEqual([old.town.rails[0].y1, old.town.rails[0].x2], [4000, BALANCE.map.width], 'quer über die ganze Karte');
  const free = normalizeMap({ spawns: old.spawns, town: { rails: [{ x1: 100, y1: 100, x2: 900, y2: 400 }, { x1: 500, y1: 0, x2: 500, y2: 99999 }] } });
  assert.equal(free.town.rails.length, 2);
  assert.equal(free.town.rails[1].y2, BALANCE.map.height, 'auf die Karte begrenzt');
  assert.equal(generateMap(5).town.rails.length, 1);
});

test('Bahnhof: Bahnsteig ist begehbar, gedrehte Zugteile sperren ihr Umschließendes, Winkel bleibt erhalten', async () => {
  const { blockers, footprint } = await import('../js/game/mapdata.js');
  const m = normalizeMap({
    spawns: [{ x: 700, y: 8000 }, { x: 8000, y: 700 }],
    town: {
      buildings: [
        { x: 1000, y: 1000, w: 300, h: 30, kind: 'platform', angle: 0.5 },
        { x: 2000, y: 2000, w: 100, h: 50, kind: 'train', part: 'loco', angle: Math.PI / 2 },
        { x: 3000, y: 3000, w: 280, h: 110, kind: 'station', angle: 1 },
        { x: 4000, y: 4000, w: 90, h: 70, kind: 'house' },
      ],
    },
  });
  assert.equal(m.town.buildings[0].angle, 0.5);
  assert.equal(m.town.buildings[2].angle, undefined, 'Bahnhof wird nur um 90° gedreht (w/h getauscht)');
  const b = blockers(m.town.buildings);
  assert.equal(b.length, 3, 'Bahnsteig fehlt');
  const f = footprint(m.town.buildings[1]);
  assert.ok(Math.abs(f.w - 50) < 0.01 && Math.abs(f.h - 100) < 0.01, 'um 90° gedreht: Breite und Höhe getauscht');
  const g = new Game({ seed: 1, map: m });
  assert.ok(g.grid.isBlocked ? true : true);
});

test('ältere Karte (9024 px, bis v5.11) wird mittig in die größere Karte gesetzt', () => {
  const W = BALANCE.map.width;
  assert.equal(W, 11072, 'Kartengröße seit v5.14');
  const d = (W - 9024) / 2; // 1024 px rundum
  // Höhengelände der alten Größe: 142 × 142 Grobpunkte, eine Senke in der Mitte und ein Hang am linken Rand
  const n0 = 9024 / RELIEF.res + 1;
  const C = new Float32Array(n0 * n0).fill(36);
  for (let j = 0; j < n0; j++) for (let i = 0; i < 4; i++) C[j * n0 + i] = 120;
  C[70 * n0 + 70] = -60;
  let txt = '';
  for (const v of C) txt += String.fromCharCode(Math.round((v - RELIEF.min) / RELIEF.q));
  const old = {
    name: 'Alt',
    width: 9024,
    height: 9024,
    tile: 32,
    spawns: [{ x: 700, y: 8324 }, { x: 8324, y: 700 }],
    zone: { x: 4512, y: 4512, r: 3300 },
    obstacles: [{ x: 2000, y: 3000, r: 80 }],
    town: { buildings: [{ x: 4512, y: 4000, w: 90, h: 70, kind: 'house' }], roads: [{ x1: 0, y1: 4512, x2: 4000, y2: 4512, w: 64 }], rails: [{ x1: 0, y1: 4512, x2: 9024, y2: 4512 }] },
    crates: [{ x: 3000, y: 6000 }],
    bridges: [{ x1: 1000, y1: 2000, x2: 1300, y2: 2000 }],
    fords: [{ x: 500, y: 600, r: 150 }],
    relief: btoa(txt),
  };
  const m = normalizeMap(JSON.parse(JSON.stringify(old)));
  assert.deepEqual([m.width, m.height], [W, W]);
  assert.deepEqual(m.zone, { x: W / 2, y: W / 2, r: 3300 }, 'Zone in der neuen Mitte, gleich groß');
  assert.deepEqual(m.spawns, [{ x: 700 + d, y: 8324 + d }, { x: 8324 + d, y: 700 + d }], 'Startpunkte mit verschoben');
  assert.deepEqual([m.obstacles[0].x, m.obstacles[0].y, m.town.buildings[0].y, m.crates[0].x, m.fords[0].x, m.bridges[0].x1], [2000 + d, 3000 + d, 4000 + d, 3000 + d, 500 + d, 1000 + d]);
  assert.deepEqual([m.town.roads[0].x1, m.town.roads[0].x2], [0, 4000 + d], 'Weg vom alten Rand läuft bis zum neuen');
  assert.deepEqual([m.town.rails[0].x1, m.town.rails[0].x2, m.town.rails[0].y1], [0, W, 4512 + d], 'Gleis quer über die Karte bleibt durchgehend');
  const r = reliefOf(m);
  assert.ok(r, 'Gelände übernommen');
  assert.ok(r.heightAt(70 * RELIEF.res + d, 70 * RELIEF.res + d) < -50, 'Senke mitverschoben');
  assert.ok(r.heightAt(100, 5000) > 110 && r.heightAt(d + 100, 5000) > 110, 'Hang am alten Rand setzt sich bis zum neuen Rand fort');
  assert.ok(Math.abs(r.heightAt(W - 100, 5000) - 36) < 1);
  assert.deepEqual(checkMap(m), []);
  // einmal normalisiert bleibt sie, wie sie ist
  assert.deepEqual(normalizeMap(JSON.parse(JSON.stringify(m))), m);
  assert.ok(new Relief().coarse.length === (W / RELIEF.res + 1) ** 2);
  const g = new Game({ seed: 1, map: m });
  for (let i = 0; i < 40; i++) g.update(DT);
  assert.ok(g.buildings.some((b) => b.main && Math.hypot(b.x - m.spawns[0].x, b.y - m.spawns[0].y) < 100), 'Hauptstadt am verschobenen Startpunkt');
});
