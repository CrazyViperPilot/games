// v5.16: große Blöcke in der Zonenstadt (2 × 2 Blöcke ohne Straßen dazwischen), Räumen reißt Häuser der Karte ab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { townBigBlocks } from '../js/game/map.js';
import { canZone } from '../js/game/city.js';

/** Stadtzellen-Rechteck (Spalten, Zeilen) innerhalb eines großen Blocks, ohne die Straßen am Rand. */
function cellsOf(c, b) {
  const S = c.cell;
  return { c0: Math.ceil((b.x0 + S / 2) / S), c1: Math.floor((b.x1 - S / 2) / S) - 1, r0: Math.ceil((b.y0 + S / 2) / S), r1: Math.floor((b.y1 - S / 2) / S) - 1 };
}

function rich(g, t = 0) {
  g.teams[t].res.money = 1e6;
  Object.assign(g.mainFob(t).store, { bm: 3000 });
}

test('Zonenstadt hat mehrere große Blöcke, punktsymmetrisch, ohne Stadtstraßen innen (mind. 11 × 11 Zellen)', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const big = townBigBlocks();
  assert.ok(big.length >= 6, 'mehrere große Blöcke');
  const W = g.map.width ?? g.grid.cols * g.grid.tile;
  for (const b of big) {
    const k = cellsOf(c, b);
    assert.ok(k.c1 - k.c0 + 1 >= 11 && k.r1 - k.r0 + 1 >= 11, 'Innenfläche 11 × 11');
    for (let r = k.r0; r <= k.r1; r++) for (let q = k.c0; q <= k.c1; q++) assert.equal(c.mapRoads[r * c.cols + q], 0, 'keine Stadtstraße im Block');
    assert.ok(big.some((o) => Math.abs(o.x0 - (W - b.x1)) < 1 && Math.abs(o.y0 - (W - b.y1)) < 1), 'Spiegelbild vorhanden');
  }
  // leere Blöcke sind sofort Bauland
  const empty = big.find((b) => b.empty);
  const k = cellsOf(c, empty);
  let free = 0;
  for (let r = k.r0; r <= k.r1; r++) for (let q = k.c0; q <= k.c1; q++) if (canZone(g, c, r * c.cols + q)) free++;
  assert.ok(free >= 100, `leerer Block fast ganz frei (${free})`);
});

test('Räumen reißt Häuser eines großen Blocks ab, danach passt ein Flughafen', () => {
  for (const seed of [3, 7]) {
    const g = new Game({ seed, city: true });
    const c = g.city[0];
    rich(g);
    const b = townBigBlocks().find((o) => !o.empty);
    const k = cellsOf(c, b);
    const inside = (o) => o.x > b.x0 && o.x < b.x1 && o.y > b.y0 && o.y < b.y1;
    const before = g.map.town.buildings.filter(inside).filter((o) => ['house', 'hall', 'factory'].includes(o.kind));
    assert.ok(before.length > 0, `seed ${seed}: Block bebaut`);
    const houses = g.houses.length;
    const air = { type: 'city', kind: 'airport', c0: k.c0, r0: k.r0, c1: k.c0 + 9, r1: k.r0 + 9 };
    assert.equal(g.issue(0, air).ok, false, 'vor dem Räumen kein Platz');
    const res = g.issue(0, { type: 'city', kind: 'erase', ...k });
    assert.ok(res.ok && res.razed >= before.length, `seed ${seed}: abgerissen (${res.razed})`);
    assert.equal(g.map.town.buildings.filter(inside).filter((o) => ['house', 'hall', 'factory'].includes(o.kind)).length, 0);
    assert.ok(g.houses.length < houses, 'Häuser aus der Liste');
    for (const h of g.houses) assert.ok(g.map.town.buildings.includes(h.src));
    // Raster frei: Zellmitte eines abgerissenen Hauses begehbar (sofern nicht anderes sperrt)
    const o = before[0];
    assert.ok(g.grid.free(g.grid.toCell(o.x), g.grid.toCell(o.y)), 'Raster freigegeben');
    let ok = false;
    for (let dr = 0; dr <= k.r1 - k.r0 - 9 && !ok; dr++) for (let dc = 0; dc <= k.c1 - k.c0 - 9 && !ok; dc++) ok = g.issue(0, { ...air, c0: k.c0 + dc, r0: k.r0 + dr, c1: k.c0 + dc + 9, r1: k.r0 + dr + 9 }).ok;
    assert.ok(ok, `seed ${seed}: Flughafen passt`);
  }
});

test('Räumen lässt besetzte Häuser stehen', () => {
  const g = new Game({ seed: 3, city: true });
  const c = g.city[0];
  const h = g.houses.find((o) => o.type === 'house' && Math.hypot(o.x - g.map.zone.x, o.y - g.map.zone.y) < 2500);
  h.occupants.push({ id: 999, alive: true, team: 1 });
  h.team = 1;
  const S = c.cell;
  const q = Math.floor(h.x / S);
  const r = Math.floor(h.y / S);
  const res = g.issue(0, { type: 'city', kind: 'erase', c0: q, r0: r, c1: q, r1: r });
  assert.equal(res.ok, false);
  assert.match(res.reason, /Besetzte/);
  assert.ok(g.houses.includes(h));
});
