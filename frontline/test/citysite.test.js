// Baustellen und Ruinen der Stadt gemalt (citysite.js, citylayer.js, seit v5.45): wachsende Zellen sind Baustellen in fünf
// Bauabschnitten, zerstörte Zellen Schutt; beides zeichnet in jeder Größe, Stufe, Variante und Jahreszeit nur mit endlichen Zahlen und
// lesbaren Farben (Iso und 2D, ohne Canvas direkt auf die Zeichenfläche). Der Fortschrittsbalken steht über eigenen Baustellen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawSiteIso, drawSiteTop, siteStep, siteTall, siteWall } from '../js/render/citysite.js';
import { cityBuildings, drawCityBadges } from '../js/render/citylayer.js';
import { drawTownBuilding } from '../js/render/isobuild.js';
import { drawWreckRubble } from '../js/render/fx.js';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { canZone, sizeOf } from '../js/game/city/cells.js';
import { KIND_COLOR as CITY_COLORS } from '../js/data/citykinds.js';

/** Zeichenfläche, die jeden Aufruf annimmt und prüft, dass alle Zahlen endlich und alle Farben lesbar sind. */
function fakeCtx() {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get(target, k) {
        if (k in target) return target[k];
        if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
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

const cam = (zoom = 1.4) => ({ rot: 0, zoom, depth: (x, y) => x + y, worldToScreen: (x, y) => ({ x: (x - y) * 0.7, y: (x + y) * 0.35 }) });

test('Bauabschnitt aus dem Fortschritt: fünf Stufen, Ränder und kaputte Werte', () => {
  assert.equal(siteStep(0), 0);
  assert.equal(siteStep(0.19), 0);
  assert.equal(siteStep(0.2), 1);
  assert.equal(siteStep(0.59), 2);
  assert.equal(siteStep(0.79), 3);
  assert.equal(siteStep(0.8), 4);
  assert.equal(siteStep(1), 4);
  assert.equal(siteStep(7), 4);
  assert.equal(siteStep(-1), 0);
  assert.equal(siteStep(NaN), 0);
  for (const n of [1, 2, 3, 4, 5]) for (let s = 0; s < 5; s++) assert.ok(siteTall(n, s) > 0 && siteTall(n, s) < 90, `${n} ${s}`);
});

test('Baustellen zeichnen in jeder Größe, jedem Abschnitt, jeder Variante und Jahreszeit (Iso und 2D)', () => {
  for (const [ck, n] of [['res', 1], ['com', 1], ['mine', 1], ['power', 2], ['uni', 3], ['barracks', 4], ['factory', 5]]) {
    for (let step = 0; step < 5; step++) {
      for (let variant = 0; variant < 3; variant++) {
        const b = { x: 900, y: 1400, n, step, variant, ck, zone: CITY_COLORS[ck], wall: siteWall(ck, variant) };
        for (const season of ['summer', 'winter']) {
          const { ctx, calls } = fakeCtx();
          assert.equal(drawSiteIso(ctx, cam(), b, season), true);
          assert.ok(calls.length > 40, `${ck} Abschnitt ${step}: ${calls.length} Aufrufe`);
        }
        const { ctx, calls } = fakeCtx();
        assert.equal(drawSiteTop(ctx, b, 1.2), true);
        assert.ok(calls.length > 20, `${ck} Abschnitt ${step} 2D`);
      }
    }
  }
});

test('Stadt: wachsende Zellen sind Baustellen, zerstörte Schutt, Straßen nie; Großbau nur einmal über die Mitte', () => {
  const g = new Game({ seed: 3, city: true });
  g.teams[0].money = 1e7;
  const c = g.city[0];
  const m = g.mainFob(0);
  const fc = Math.floor(m.x / c.cell);
  const fr = Math.floor(m.y / c.cell);
  // freie Zellen in der Nähe der Hauptstadt ausweisen
  const free = [];
  for (let d = 3; d < 20 && free.length < 6; d++) {
    for (const [dc, dr] of [[d, 0], [0, d], [-d, 0], [0, -d], [d, d], [-d, -d]]) {
      const col = fc + dc;
      const row = fr + dr;
      const i = row * c.cols + col;
      if (free.length >= 6 || c.kind[i] || !canZone(g, c, i)) continue;
      if (g.issue(0, { type: 'city', kind: free.length % 2 ? 'com' : 'res', c0: col, r0: row, c1: col, r1: row }).ok) free.push(i);
    }
  }
  assert.ok(free.length >= 4, `${free.length} Zellen`);
  free.forEach((i, n) => (c.timer[i] = n === 0 ? -5 : (n - 1) * 4)); // eine Ruine, sonst 0, 4, 8, … s gewachsen
  const all = () => cityBuildings(g, 0, () => true, () => true);
  const objs = all().filter((o) => o.kind === 'site' || o.kind === 'cityruin');
  for (const [n, i] of free.entries()) {
    const col = i % c.cols;
    const row = (i - col) / c.cols;
    const o = objs.find((q) => Math.floor(q.x / c.cell) === col && Math.floor(q.y / c.cell) === row);
    assert.ok(o, `Zelle ${n} fehlt`);
    if (n === 0) {
      assert.equal(o.kind, 'cityruin');
      assert.equal(o.as, 'house');
    } else {
      assert.equal(o.kind, 'site');
      assert.equal(o.step, siteStep(((n - 1) * 4) / CITY.growTime));
      assert.equal(o.n, 1);
      assert.ok(/^#[0-9a-f]{6}$/.test(o.zone) && /^#[0-9a-f]{6}$/.test(o.wall));
    }
  }
  assert.ok(!all().some((o) => (o.kind === 'site' || o.kind === 'cityruin') && o.ck === 'road'), 'Straßen sind nie Baustellen');
  // Ruine und Baustellen zeichnen (Iso über drawTownBuilding, 2D Schutt)
  for (const o of objs) {
    const { ctx, calls } = fakeCtx();
    drawTownBuilding(ctx, cam(), o, 'summer');
    assert.ok(calls.length > 20, `${o.kind}: ${calls.length} Aufrufe`);
    if (o.kind === 'cityruin') {
      const top = fakeCtx();
      drawWreckRubble(top.ctx, o);
      assert.ok(top.calls.length > 20);
    }
  }
  // Fortschrittsbalken über den eigenen Baustellen (nur dort: andere Zellen liegen außerhalb des Ausschnitts)
  const sites = new Set(objs.filter((o) => o.kind === 'site').map((o) => `${o.x},${o.y}`));
  const inRect = (x, y) => sites.has(`${x},${y}`);
  for (const iso of [true, false]) {
    const { ctx, calls } = fakeCtx();
    drawCityBadges({ game: g, camera: cam(1.1), cityUi: null }, ctx, 0, () => true, inRect, iso);
    assert.equal(calls.filter((k) => k === 'fillRect').length, 2 * sites.size, `${iso ? 'Iso' : '2D'}: Spur und Füllung je Baustelle`);
  }
  // Großbau: ein Objekt für alle Zellen, n = Kantenlänge
  const before = all().filter((o) => o.kind === 'site').length;
  let ok = false;
  for (let d = 4; d < 24 && !ok; d++) ok = g.issue(0, { type: 'city', kind: 'power', c0: fc + d, r0: fr - d, c1: fc + d, r1: fr - d }).ok;
  assert.ok(ok, 'Kraftwerk gesetzt');
  const big = all().filter((o) => o.kind === 'site' && o.ck === 'power');
  assert.equal(big.length, 1);
  assert.equal(big[0].n, sizeOf('power'));
  assert.equal(all().filter((o) => o.kind === 'site').length, before + 1);
});
