// Regierungsviertel der Hauptstadt (govquarter.js) und Regierungsgebäude (cityhall.js), nur Bild: Das Viertel deckt genau die um die
// Hauptstadt gesperrten Stadtzellen (nearMain), Teile mit Höhe stehen im inneren Quadrat außerhalb des Fußabdrucks, die Drehung der
// Teile passt zur Kamera, ein fremdes Gebäude blendet seine Gruppe aus, und alles zeichnet ohne Canvas (direkt auf die Zeichenfläche)
// in jeder Drehung, für beide Teams, Sommer und Winter, mit Schaden nur mit endlichen Zahlen und lesbaren Farben.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { nearMain } from '../js/game/city/cells.js';
import { Camera } from '../js/render/camera.js';
import { quarterRect, quarterItems, quarterMask, isCapital, drawQuarterGround, drawQuarterIso, drawQuarterTop, FOOT, INNER, _quarter } from '../js/render/govquarter.js';
import { drawCityHallIso, drawCityHallTop, DOME_TOP } from '../js/render/cityhall.js';
import { CAPITAL_H } from '../js/render/iso.js';

/** Zeichenfläche, die jeden Aufruf annimmt und prüft, dass alle Zahlen endlich und alle Farben lesbar sind. */
function fakeCtx() {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get(target, k) {
        if (k in target) return target[k];
        if (k === 'createRadialGradient' || k === 'createLinearGradient') {
          return (...args) => {
            for (const a of args) assert.ok(Number.isFinite(a), `${String(k)}(${args.join(', ')})`);
            return { addColorStop: (o, c) => assert.ok(Number.isFinite(o) && !/NaN|undefined|null/.test(c), `Farbstopp ${o} ${c}`) };
          };
        }
        return (...args) => {
          for (const a of args) if (typeof a === 'number') assert.ok(Number.isFinite(a), `${String(k)}(${args.join(', ')})`);
          calls.push(k);
        };
      },
      set(target, k, v) {
        if (typeof v === 'number') assert.ok(Number.isFinite(v), `${String(k)} = ${v}`);
        if (typeof v === 'string') assert.ok(!/NaN|undefined|null/.test(v), `${String(k)} = ${v}`);
        target[k] = v;
        return true;
      },
    },
  );
  return { ctx, calls };
}

const game = new Game({ seed: 3, city: true });
const capitals = game.buildings.filter((b) => b.main);

test('Viertel = genau die Stadtzellen, die um die Hauptstadt gesperrt sind (nearMain), und es umschließt den Rand ±112', () => {
  const S = CITY.cell;
  const T = game.grid.tile;
  assert.equal(capitals.length, 2);
  for (const b of capitals) {
    assert.ok(isCapital(b));
    const q = quarterRect(b);
    assert.ok(q.x0 <= -INNER && q.x1 >= INNER && q.y0 <= -INNER && q.y1 >= INNER, JSON.stringify(q));
    for (const v of [q.x0 + b.x, q.x1 + b.x, q.y0 + b.y, q.y1 + b.y]) assert.equal(v % S, 0, 'auf das Zellraster gerundet');
    for (let row = Math.floor((b.y - 400) / S); row < (b.y + 400) / S; row++) {
      for (let col = Math.floor((b.x - 400) / S); col < (b.x + 400) / S; col++) {
        const inside = col * S >= b.x + q.x0 && (col + 1) * S <= b.x + q.x1 && row * S >= b.y + q.y0 && (row + 1) * S <= b.y + q.y1;
        assert.equal(inside, nearMain([b], T, col * S, row * S), `Team ${b.team} Zelle ${col}/${row}`);
      }
    }
  }
  assert.equal(INNER, FOOT + CITY.fobMargin);
});

test('Plan: Teile mit Höhe im inneren Quadrat, nicht auf dem Fußabdruck; jede Gruppe bekommt ihre Teile, die Mitte keine', () => {
  const { PLAN, GROUPS, groupAt } = _quarter;
  assert.ok(PLAN.length > 30);
  for (const p of PLAN) {
    const [x0, x1, y0, y1] = p.x0 !== undefined ? [p.x0, p.x1, p.y0, p.y1] : [p.x - 2, p.x + 2, p.y - 2, p.y + 2];
    assert.ok(x0 >= -INNER && x1 <= INNER && y0 >= -INNER && y1 <= INNER, `${p.k} bei ${p.x}/${p.y} ragt aus dem inneren Quadrat`);
    assert.ok(Math.max(Math.abs(p.x), Math.abs(p.y)) > FOOT, `${p.k} bei ${p.x}/${p.y} auf dem Fußabdruck`);
    assert.notEqual(groupAt(p.x, p.y), 4);
  }
  for (let t = 0; t < 4; t++) {
    assert.equal(GROUPS[t][4].length, 0);
    assert.equal(GROUPS[t].reduce((n, g) => n + g.length, 0), PLAN.length);
    for (let gi = 0; gi < 9; gi++) if (gi !== 4) assert.ok(GROUPS[t][gi].length > 0, `Drehung ${t} Gruppe ${gi} leer`);
  }
});

test('Drehung der Teile passt zur Kamera (Bild = Drehung · Weltabstand) und vertauscht die Achsen bei 90°', () => {
  const { tv, tAxis } = _quarter;
  const cam = new Camera(4000, 4000);
  cam.iso = true;
  cam.zoom = 1;
  cam.centerOn(2000, 2000);
  const K = Math.SQRT1_2;
  for (let rot = 0; rot < 4; rot++) {
    cam.rot = rot;
    const o = cam.worldToScreen(2000, 2000);
    for (const [dx, dy] of [[37, -12], [-80, 55], [100, 100]]) {
      const p = cam.worldToScreen(2000 + dx, 2000 + dy);
      const [u, v] = tv(rot, dx, dy);
      assert.ok(Math.abs(p.x - o.x - (u - v) * K) < 1e-6 && Math.abs(p.y - o.y - (u + v) * K * 0.5) < 1e-6, `Drehung ${rot}`);
    }
    assert.equal(tAxis(rot, 'x'), rot % 2 ? 'v' : 'u');
    assert.equal(tAxis(rot, 'y'), rot % 2 ? 'u' : 'v');
  }
});

test('fremdes Gebäude im Viertel: nur seine Gruppe entfällt; ohne Raster zeichnet alles', () => {
  const g = new Game({ seed: 3, city: true });
  const b = g.buildings.find((x) => x.main && x.team === 0);
  const all = quarterItems(g.grid, b);
  assert.equal(all.length, 8);
  const full = quarterMask(g.grid, b);
  g.spawnBuilding('mortar', 0, b.cx + 3, b.cy + 3); // Ecke Südost
  const items = quarterItems(g.grid, b);
  assert.equal(items.length, 7);
  assert.ok(items.every((o) => !(o.x > b.x + FOOT && o.y > b.y + FOOT)), 'Gruppe Südost entfällt');
  assert.notEqual(quarterMask(g.grid, b), full);
  assert.equal(quarterItems(null, b).length, 8);
});

test('alles zeichnet ohne Canvas: Boden, Gruppen, 2D, Regierungsgebäude (beide Teams, jede Drehung, Sommer/Winter, Schaden)', () => {
  for (const b0 of capitals) {
    for (const season of ['summer', 'autumn', 'winter']) {
      for (const hp of [b0.maxHp, b0.maxHp * 0.4, 0]) {
        const b = { ...b0, hp };
        for (const zoom of [1.6, 0.35]) {
          for (const iso of [false, true]) {
            const { ctx, calls } = fakeCtx();
            const cam = { rot: 0, zoom, worldToScreen: (x, y) => ({ x: (x - y) * 0.7 * zoom, y: (x + y) * 0.35 * zoom }) };
            drawQuarterGround(ctx, cam, b, '#3d8bfd', season, 2, iso);
            assert.ok(calls.includes('fillRect') && calls.includes('fill'), 'Boden');
          }
          for (let rot = 0; rot < 4; rot++) {
            const cam = { rot, zoom, worldToScreen: (x, y) => ({ x: (x - y) * 0.7 * zoom, y: (x + y) * 0.35 * zoom }) };
            for (const o of quarterItems(game.grid, b)) {
              const { ctx, calls } = fakeCtx();
              drawQuarterIso(ctx, cam, o, '#e5484d', season);
              assert.ok(calls.length > 10, `Gruppe ${o.gi} Drehung ${rot}`);
            }
            const { ctx, calls } = fakeCtx();
            drawCityHallIso(ctx, cam, b, '#3d8bfd');
            assert.ok(calls.length > 50, 'Regierungsgebäude Iso');
          }
          const { ctx, calls } = fakeCtx();
          drawQuarterTop(ctx, game.grid, b, '#3d8bfd', zoom, season);
          drawCityHallTop(ctx, b, '#3d8bfd', zoom, season);
          assert.ok(calls.length > 50, '2D');
        }
      }
    }
  }
});

test('Höhe: Lebensbalken und Klick aufs Dach knapp über dem Kuppelscheitel', () => {
  assert.ok(DOME_TOP > 60 && DOME_TOP < CAPITAL_H, `Kuppel ${DOME_TOP}, Ebene ${CAPITAL_H}`);
});
