// Äcker, Weiden und Feldwege: punktsymmetrisch um Gehöfte und in freien Fluren, außerhalb der Zone, nur Boden; Kartenformat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap } from '../js/game/map.js';
import { createEmptyMap, normalizeMap, FIELD_CROPS } from '../js/game/mapdata.js';
import { Game } from '../js/game/game.js';
import { BALANCE } from '../js/data/balance.js';

const W = BALANCE.map.width;
const H = BALANCE.map.height;

const inBox = (b, px, py, pad = 0) => {
  const c = Math.cos(b.angle || 0);
  const s = Math.sin(b.angle || 0);
  const lx = (px - b.x) * c + (py - b.y) * s;
  const ly = -(px - b.x) * s + (py - b.y) * c;
  return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad;
};
const corners = (f) => {
  const c = Math.cos(f.angle || 0);
  const s = Math.sin(f.angle || 0);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => [f.x + (a * f.w * c - b * f.h * s) / 2, f.y + (a * f.w * s + b * f.h * c) / 2]);
};

test('Karte: Felder und Weiden paarweise punktsymmetrisch, außerhalb der Zone, frei von Gebäuden, Wald und Bäumen', () => {
  for (const seed of [1, 3, 8]) {
    const m = generateMap(seed);
    const fs = m.town.fields;
    assert.ok(fs.length >= 16 && fs.length % 2 === 0, `Seed ${seed}: ${fs.length} Felder`);
    assert.ok(fs.some((f) => f.kind === 'pasture') && fs.some((f) => f.kind === 'field'), 'Äcker und Weiden');
    for (let i = 0; i < fs.length; i += 2) {
      const [a, b] = [fs[i], fs[i + 1]];
      assert.deepEqual([a.x + b.x, a.y + b.y, a.w, a.h, a.kind, a.crop, a.angle], [W, H, b.w, b.h, b.kind, b.crop, b.angle], 'Spiegelbild');
      if (a.kind === 'field') assert.ok(FIELD_CROPS.includes(a.crop));
    }
    for (const f of fs) {
      for (const [x, y] of corners(f)) {
        assert.ok(Math.hypot(x - m.zone.x, y - m.zone.y) > m.zone.r, 'außerhalb der Zone');
        assert.ok(!m.town.buildings.some((b) => inBox(b, x, y)), 'nicht unter einem Gebäude');
        assert.ok(!m.obstacles.some((o) => Math.hypot(x - o.x, y - o.y) < o.r), 'nicht im Wald');
      }
      assert.ok(!m.trees.some((t) => inBox(f, t.x, t.y)), 'Bäume auf dem Feld fallen weg');
      for (const g of fs) if (g !== f) assert.ok(!inBox(g, f.x, f.y), 'Felder überlappen sich nicht');
    }
  }
});

test('Karte: Feldwege sind schmale Wege (dirt), paarweise punktsymmetrisch, und binden die Gehöfte an', () => {
  const m = generateMap(3);
  const tracks = m.town.roads.filter((r) => r.dirt && r.w === 26);
  assert.ok(tracks.length >= 10 && tracks.length % 2 === 0, `${tracks.length} Feldwege`);
  for (let i = 0; i < tracks.length; i += 2) {
    const [a, b] = [tracks[i], tracks[i + 1]];
    assert.deepEqual([a.x1 + b.x1, a.y1 + b.y1, a.x2 + b.x2, a.y2 + b.y2], [W, H, W, H]);
  }
  // die meisten Wege sind mehr als nur die Spur an der Feldreihe: es gibt Wege, die an eine Straße oder einen anderen Weg stoßen
  const long = tracks.filter((r) => Math.hypot(r.x2 - r.x1, r.y2 - r.y1) > 400);
  assert.ok(long.length >= 4, `${long.length} lange Feldwege`);
});

test('Kartenformat: normalizeMap behält Felder, bereinigt Werte; ältere Karten und leere Karten haben keine', () => {
  const m = generateMap(8);
  assert.deepEqual(normalizeMap(JSON.parse(JSON.stringify(m))).town.fields, m.town.fields);
  assert.deepEqual(createEmptyMap().town.fields, []);
  const old = createEmptyMap();
  delete old.town.fields;
  assert.deepEqual(normalizeMap(old).town.fields, []);
  const n = normalizeMap({ ...createEmptyMap(), town: { ...createEmptyMap().town, fields: [{ x: 100, y: 200, w: 5000, h: 10, kind: 'x', crop: 'mais', angle: 0.3 }, { x: 1, y: 2, kind: 'pasture', crop: 'wheat' }] } });
  assert.deepEqual(n.town.fields[0], { x: 100, y: 200, w: 900, h: 60, angle: 0.3, kind: 'field', crop: 'wheat' });
  assert.deepEqual(n.town.fields[1], { x: 1, y: 2, w: 300, h: 220, kind: 'pasture' });
});

test('Felder blockieren nichts: unter jedem Feld ist der Boden frei befahrbar', () => {
  const g = new Game({ seed: 3 });
  for (const f of g.map.town.fields) {
    for (const [x, y] of corners(f)) {
      const c = g.grid.toCell(x);
      const r = g.grid.toCell(y);
      assert.ok(g.grid.free(c, r), `Feld bei ${Math.round(x)}, ${Math.round(y)}`);
    }
  }
});
