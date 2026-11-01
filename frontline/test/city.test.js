// Stadt (city.js, PRD §15): Zonen, Wachstum, Einwohner, Erträge ins Lager der Haupt-FOB, Befehl und KI-Bauplan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { AI } from '../js/ai/ai.js';
import { canZone, cityNoise, freePop } from '../js/game/city.js';

const run = (g, s) => { for (let t = 0; t < s * 20; t++) g.update(0.05); };
// Ursprung (c, r) eines w × h großen, ganz bebaubaren Rechtecks im Gebiet des Teams, nahe der Haupt-FOB
function spot(g, w, h, team = 0) {
  const c = g.city[team];
  const m = g.mainFob(team);
  const fc = Math.floor(m.x / c.cell);
  const fr = Math.floor(m.y / c.cell);
  let best = null;
  for (let r = 0; r <= c.rows - h; r++) {
    for (let q = 0; q <= c.cols - w; q++) {
      let ok = true;
      for (let y = r; ok && y < r + h; y++) for (let x = q; ok && x < q + w; x++) ok = canZone(g, c, y * c.cols + x);
      if (!ok) continue;
      const d = Math.abs(q - fc) + Math.abs(r - fr);
      if (!best || d < best.d) best = { c: q, r, d };
    }
  }
  assert.ok(best, 'kein Platz im Gebiet');
  return best;
}
const base = new WeakMap();
const paint = (g, kind, c0, r0, c1, r1, team = 0) => {
  if (!g.city) return raw(g, kind, c0, r0, c1, r1, team);
  if (!base.has(g)) base.set(g, spot(g, 10, 6, team));
  const b = base.get(g);
  return raw(g, kind, b.c + c0, b.r + r0, b.c + c1, b.r + r1, team);
};
const at = (g, col, row) => { const b = base.get(g); return (b.r + row) * g.city[0].cols + b.c + col; };
const raw = (g, kind, c0, r0, c1, r1, team = 0) => g.issue(team, { type: 'city', kind, c0, r0, c1, r1 });

test('ohne Stadt: unendliches Lager, Stadtbefehl abgelehnt', () => {
  const g = new Game({ seed: 3 });
  assert.equal(g.city, null);
  assert.equal(g.mainFob(0).infinite, true);
  assert.equal(paint(g, 'road', 0, 0, 1, 0).ok, false);
});

test('mit Stadt: endliches Startlager, Front-Summe ohne Haupt-FOB', () => {
  const g = new Game({ seed: 3, city: true });
  const m = g.mainFob(0);
  assert.equal(m.infinite, false);
  assert.deepEqual({ ...m.store }, CITY.startStock);
  assert.equal(g.teams[0].res.bm, 0);
});

test('Bauen kostet Geld, zu wenig Geld stoppt, Abriss ist kostenlos', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 100 });
  const r = paint(g, 'road', 0, 0, 9, 0); // 10 x 5 = 50
  assert.ok(r.ok);
  assert.equal(g.teams[0].res.money, 50);
  const r2 = paint(g, 'bm', 0, 1, 4, 1); // 5 x 40 > 50 Geld: nur 1 Zelle
  assert.equal(r2.placed, 1);
  assert.equal(r2.broke, true);
  assert.equal(paint(g, 'erase', 0, 1, 4, 1).ok, true);
  assert.equal(g.teams[0].res.money, 10);
  assert.equal(paint(g, 'res', 0, 1, 0, 1).ok, false); // zu wenig Geld (20 > 10)
});

test('Zone ohne Straße wächst nicht, mit Straße wird sie Gebäude', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 2000 });
  paint(g, 'res', 5, 2, 5, 2);
  run(g, CITY.growTime + 2);
  assert.equal(g.city[0].level[at(g, 5, 2)], 0);
  paint(g, 'road', 5, 1, 5, 1);
  run(g, CITY.growTime + 2);
  assert.equal(g.city[0].level[at(g, 5, 2)], 1);
});

test('Wohnen + Werk + Straße: Einwohner arbeiten, Lager und Geld wachsen', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  paint(g, 'road', 0, 2, 5, 2);
  paint(g, 'res', 0, 1, 5, 1);
  paint(g, 'bm', 0, 3, 5, 3);
  const m = g.mainFob(0);
  m.store.bm = 0;
  const money0 = g.teams[0].res.money;
  run(g, 120);
  const s = g.city[0].stats;
  assert.ok(s.pop > 8, `Einwohner ${s.pop}`);
  assert.ok(s.workers > 0 && s.bm > 0);
  assert.ok(m.store.bm > 50, `BM ${m.store.bm}`);
  assert.ok(g.teams[0].res.money > money0);
  assert.ok(m.store.bm <= 3000);
  assert.equal(g.city[1].stats.pop, 0, 'andere Stadt unberührt');
});

test('Ausbau nur bei Bedarf: Wohnen ohne Arbeit bleibt Stufe 1', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  paint(g, 'road', 0, 2, 3, 2);
  paint(g, 'res', 0, 1, 3, 1);
  run(g, CITY.growTime + CITY.upgradeTime * 3);
  for (let col = 0; col < 4; col++) assert.equal(g.city[0].level[at(g, col, 1)], 1);
});

test('KI baut nach Bauplan und liefert Material', () => {
  const g = new Game({ seed: 5, city: true, startMoney: 2000 });
  const ai = new AI(g, 1, 'normal');
  const n0 = g.city[1].kind.filter(Boolean).length;
  for (let t = 0; t < 20 * 240; t++) { ai.update(0.05); g.update(0.05); }
  assert.ok(g.city[1].kind.filter(Boolean).length > n0 + 10);
  assert.ok(g.city[1].stats.pop > 0);
});

test('Stadtraster deckt die Karte: unter der FOB gesperrt, Gebäude sperren den Weg, Abriss gibt ihn frei', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  const c = g.city[0];
  const m = g.mainFob(0);
  assert.equal(c.cols * c.cell, g.grid.cols * g.grid.tile, 'ganze Kartenbreite');
  const fc = Math.floor(m.x / c.cell);
  const fr = Math.floor(m.y / c.cell);
  assert.equal(c.blocked[fr * c.cols + fc], 1);
  assert.equal(raw(g, 'res', fc, fr, fc, fr).ok, false, 'unter der FOB nichts bauen');
  paint(g, 'road', 0, 0, 3, 0);
  paint(g, 'bm', 0, 1, 0, 1);
  const b = base.get(g);
  const x0 = b.c * c.cell;
  const y0 = (b.r + 1) * c.cell;
  const T = g.grid.tile;
  const u = g.units.find((x) => x.team === 0 && !x.def.air);
  u.x = x0 + 30; u.y = y0 + 30; u.path = [];
  run(g, CITY.growTime + 1);
  assert.equal(c.level[at(g, 0, 1)], 1);
  assert.equal(g.grid.passable(Math.floor((x0 + 32) / T), Math.floor((y0 + 32) / T), 0), false, 'Gebäude blockiert');
  assert.ok(g.grid.passable(g.grid.toCell(u.x), g.grid.toCell(u.y), 0), 'Einheit steht frei');
  assert.ok(g.grid.passable(Math.floor((x0 + 32) / T), Math.floor((y0 - 32) / T), 0), 'Straße begehbar');
  paint(g, 'erase', 0, 1, 0, 1);
  assert.equal(g.grid.passable(Math.floor((x0 + 32) / T), Math.floor((y0 + 32) / T), 0), true, 'Abriss gibt frei');
});

test('Gebiet: nur im eigenen Gebiet bauen, Gebäude erweitern es, nicht in die gegnerische Stadt', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = g.city[0];
  const e = g.mainFob(1);
  const [ec, er] = [Math.floor(e.x / c.cell), Math.floor(e.y / c.cell)];
  const r = raw(g, 'road', ec + 3, er, ec + 3, er);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Gebiet/);
  const n0 = c.claim.reduce((a, v) => a + v, 0);
  assert.ok(n0 > 100, `Gebiet um die Haupt-FOB: ${n0}`);
  paint(g, 'road', 0, 0, 9, 0);
  paint(g, 'res', 0, 1, 9, 1);
  run(g, CITY.growTime + CITY.territory.interval + 1);
  assert.ok(c.claim.reduce((a, v) => a + v, 0) >= n0, 'Gebiet wächst oder bleibt');
  // Gegner darf eigene Zellen nicht überbauen
  const i = at(g, 0, 0);
  g.city[1].claim[i] = 1;
  const col = i % c.cols;
  const row = (i - col) / c.cols;
  assert.equal(raw(g, 'res', col, row, col, row, 1).ok, false);
});

test('Soldaten kosten Einwohner: ohne freie Einwohner keine Ausbildung, Gefallene fehlen der Stadt', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const m = g.mainFob(0);
  assert.equal(freePop(g, 0), 0, 'Startarmee kostet nichts, Stadt leer');
  const r = g.issue(0, { type: 'train', buildingId: m.id, unit: 'rifleman' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Einwohner/);
  paint(g, 'road', 0, 0, 9, 0);
  paint(g, 'res', 0, 1, 9, 1);
  paint(g, 'bm', 0, 2, 4, 2);
  paint(g, 'road', 0, 3, 4, 3);
  run(g, 90);
  const pop = g.city[0].popF;
  assert.ok(freePop(g, 0) >= 1, `freie Einwohner ${freePop(g, 0)}`);
  assert.ok(g.issue(0, { type: 'train', buildingId: m.id, unit: 'rifleman' }).ok);
  run(g, 10);
  const u = g.units.find((x) => x.team === 0 && x.crew === 1);
  assert.ok(u, 'ausgebildeter Schütze belegt einen Einwohner');
  assert.equal(g.city[0].drafted, 1);
  u.hp = -1e6;
  run(g, 0.2);
  assert.equal(g.city[0].drafted, 0);
  assert.ok(g.city[0].popF < Math.max(pop, g.city[0].stats.housing), 'Einwohner weg');
});

test('Flucht: Schüsse in der Konfliktzone leeren Wohnzellen, nach Ruhe kehren sie zurück', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = g.city[0];
  const z = g.zone;
  const zc = Math.floor(z.x / c.cell);
  const zr = Math.floor(z.y / c.cell);
  // freie Zellen in der Zone suchen und als Gebiet freigeben (vordere FOB simuliert)
  let s = null;
  for (let r = zr - 10; !s && r < zr + 10; r++) for (let q = zc - 10; !s && q < zc + 10; q++) {
    const ok = [0, 1, 2].every((k) => !c.blocked[(r + k) * c.cols + q] && c.inZone[(r + k) * c.cols + q]);
    if (ok) s = { q, r };
  }
  assert.ok(s, 'freie Zellen in der Zone');
  for (let k = 0; k < 3; k++) c.claim[(s.r + k) * c.cols + s.q] = 1;
  c.claimTimer = -1e9; // Gebiet nicht neu berechnen
  raw(g, 'road', s.q, s.r, s.q, s.r);
  raw(g, 'res', s.q, s.r + 1, s.q, s.r + 1);
  raw(g, 'bm', s.q, s.r + 2, s.q, s.r + 2);
  run(g, CITY.growTime + 5);
  const i = (s.r + 1) * c.cols + s.q;
  assert.equal(c.level[i], 1);
  assert.ok(c.stats.housing > 0);
  cityNoise(g, (s.q + 0.5) * c.cell, (s.r + 2.5) * c.cell); // Schuss in der Nachbarzelle
  run(g, 1);
  assert.ok(c.flee[i] > 0, 'Bewohner fliehen');
  assert.equal(c.stats.housing, 0);
  run(g, CITY.flee.calm + 1);
  assert.equal(c.flee[i], 0);
  assert.ok(c.stats.housing > 0, 'zurück nach der Ruhezeit');
});
