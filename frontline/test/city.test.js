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
      for (let y = r; ok && y < r + h; y++) for (let x = q; ok && x < q + w; x++) ok = canZone(g, c, y * c.cols + x) && !c.kind[y * c.cols + x];
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
// Startviertel räumen (Tests, die eine leere Stadt brauchen)
function clearStart(g, team = 0) {
  const c = g.city[team];
  for (const i of [...c.list]) {
    const q = i % c.cols;
    const r = (i - q) / c.cols;
    g.issue(team, { type: 'city', kind: 'erase', c0: q, r0: r, c1: q, r1: r });
  }
}
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

test('Bauen kostet Geld (Straßen Baumaterial), zu wenig stoppt, Abriss ist kostenlos', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 100 });
  const m = g.mainFob(0);
  const bm0 = m.store.bm;
  const r = paint(g, 'road', 0, 0, 9, 0); // 10 x 10 BM
  assert.ok(r.ok);
  assert.equal(g.teams[0].res.money, 100);
  assert.equal(m.store.bm, bm0 - 100);
  const r2 = paint(g, 'bm', 0, 1, 4, 1); // 5 x 40 > 100 Geld: nur 2 Zellen
  assert.equal(r2.placed, 2);
  assert.equal(r2.broke, true);
  assert.equal(paint(g, 'erase', 0, 1, 4, 1).ok, true);
  assert.equal(g.teams[0].res.money, 20);
  assert.equal(paint(g, 'com', 0, 1, 0, 1).ok, false); // zu wenig Geld (30 > 20)
  m.store.bm = 5;
  assert.match(paint(g, 'road', 0, 2, 0, 2).reason, /Baumaterial/);
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
  clearStart(g);
  paint(g, 'road', 0, 2, 5, 2);
  paint(g, 'res', 0, 1, 5, 1);
  paint(g, 'bm', 0, 3, 5, 3);
  const c = g.city[0];
  c.deposit[at(g, 0, 4)] = 1; // Wald direkt an der Stadt (Test)
  c.deposit[at(g, 1, 4)] = 2; // Fels
  assert.match(paint(g, 'mine', 2, 4, 2, 4).reason, /vorkommen/);
  assert.ok(paint(g, 'mine', 0, 4, 1, 4).ok);
  const m = g.mainFob(0);
  m.store.bm = 0;
  const money0 = g.teams[0].res.money;
  run(g, 120);
  const s = g.city[0].stats;
  assert.ok(s.pop > 8, `Einwohner ${s.pop}`);
  assert.ok(s.workers > 0 && s.bm > 0);
  assert.ok(s.raw.wood > 0 && s.raw.stone > 0, 'Holzfäller und Steinbruch fördern');
  assert.ok(s.bm <= s.raw.wood + s.raw.stone + 1e-9, 'BM nur aus Rohstoffen');
  assert.ok(m.store.bm > 50, `BM ${m.store.bm}`);
  assert.ok(g.teams[0].res.money > money0);
  assert.ok(m.store.bm <= 3000);
  assert.ok(g.city[1].stats.pop <= g.city[1].stats.housing, 'andere Stadt eigenständig');
});

test('Ausbau nur bei Bedarf: Wohnen ohne Arbeit bleibt Stufe 1', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 3000 });
  clearStart(g);
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
  clearStart(g);
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

test('Rohstoffvorkommen: jede Sorte nahe jeder Haupt-FOB, Karte unverändert', () => {
  const a = new Game({ seed: 4, city: true });
  const b = new Game({ seed: 4 });
  assert.deepEqual([...a.grid.terrain], [...b.grid.terrain], 'Karte gleich mit und ohne Stadt');
  for (const team of [0, 1]) {
    const c = a.city[team];
    const m = a.mainFob(team);
    for (let d = 1; d <= 4; d++) {
      let near = false;
      for (let i = 0; i < c.deposit.length; i++) {
        if (c.deposit[i] !== d) continue;
        const q = i % c.cols;
        const r = (i - q) / c.cols;
        if (Math.hypot((q + 0.5) * c.cell - m.x, (r + 0.5) * c.cell - m.y) < (CITY.territory.main + 1) * c.cell) near = true;
      }
      assert.ok(near, `Team ${team} Sorte ${d} im Gebiet`);
    }
  }
});

test('Metall: Erzmine + Stahlwerk liefern, Fahrzeuge kosten Metall, Abbruch erstattet', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 9000 });
  const c = g.city[0];
  paint(g, 'road', 0, 0, 9, 0);
  paint(g, 'res', 0, 1, 9, 1);
  paint(g, 'steel', 0, 2, 3, 2);
  paint(g, 'road', 0, 3, 3, 3);
  c.deposit[at(g, 5, 3)] = 3; // Erz
  c.deposit[at(g, 6, 3)] = 3;
  paint(g, 'mine', 5, 3, 6, 3);
  run(g, 90);
  assert.ok(c.stats.raw.ore > 0 && c.stats.metal > 0, `Metall/s ${c.stats.metal}`);
  const m = g.mainFob(0);
  c.metal = 50;
  const r = g.issue(0, { type: 'train', buildingId: m.id, unit: 'tank' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Metall/);
  c.metal = 500;
  assert.ok(g.issue(0, { type: 'train', buildingId: m.id, unit: 'tank' }).ok);
  assert.equal(c.metal, 500 - CITY.metalCost.tank);
  assert.ok(g.issue(0, { type: 'cancelTrain', buildingId: m.id }).ok);
  assert.equal(c.metal, 500);
});

test('Markt: ohne Markt kein Handel, verkaufen und kaufen in Losen', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const m = g.mainFob(0);
  assert.match(g.issue(0, { type: 'trade', good: 'bm', dir: 'sell' }).reason, /Markt/);
  paint(g, 'road', 0, 0, 3, 0);
  paint(g, 'market', 0, 1, 0, 1);
  run(g, CITY.growTime + 1);
  const bm = m.store.bm;
  const money = g.teams[0].res.money;
  assert.ok(g.issue(0, { type: 'trade', good: 'bm', dir: 'sell' }).ok);
  assert.ok(m.store.bm < bm - CITY.market.lot + 50);
  assert.ok(g.teams[0].res.money >= money + CITY.market.sell.bm - 1);
  const metal = g.city[0].metal;
  assert.ok(g.issue(0, { type: 'trade', good: 'metal', dir: 'buy' }).ok);
  assert.ok(g.city[0].metal >= metal + CITY.market.lot - 1);
});

test('Angriff: Stadtgebäude nehmen Schaden, werden Ruine (Prämie), wachsen danach neu', () => {
  const g = new Game({ seed: 3, city: true, startMoney: 5000 });
  const c = g.city[0];
  paint(g, 'road', 0, 0, 3, 0);
  paint(g, 'res', 0, 1, 0, 1);
  run(g, CITY.growTime + 1);
  const i = at(g, 0, 1);
  const e = c.ents.get(i);
  assert.ok(e && e.hp === CITY.hp[1], 'Gebäude ist ein Ziel');
  assert.equal(g.getEntity(e.id), e);
  // gegnerischer Panzer daneben: schießt von selbst auf das Gebäude
  for (const u of g.units) if (u.team === 0) { u.alive = false; u.hp = 0; } // keine Verteidiger
  const tank = g.spawnUnit('tank', 1, e.x + 150, e.y);
  g.fog[1].revealAll?.();
  const money1 = g.teams[1].res.money;
  g.fog[1].revealAll?.();
  assert.ok(g.issue(1, { type: 'attack', ids: [tank.id], targetId: e.id }).ok, 'Angriffsbefehl auf ein Stadtgebäude');
  for (let t = 0; t < 20 * 60 && c.level[i]; t++) {
    g.fog[1].revealAll?.();
    g.update(0.05);
  }
  assert.ok(tank.alive);
  assert.equal(c.level[i], 0, 'zerstört');
  assert.ok(c.timer[i] < 0, 'Ruine');
  assert.ok(g.teams[1].res.money > money1, 'Prämie');
  assert.equal(c.ents.has(i), false);
  tank.alive = false; tank.hp = 0;
  run(g, CITY.ruinTime + CITY.growTime + 2);
  assert.equal(c.level[i], 1, 'wiederaufgebaut');
});

test('Startviertel: Raffinerie, Wohnen und Ölquelle stehen fertig, Treibstoff fließt', () => {
  const g = new Game({ seed: 3, city: true });
  for (const team of [0, 1]) {
    const c = g.city[team];
    const kinds = c.list.filter((i) => c.level[i]).map((i) => c.kind[i]);
    assert.ok(kinds.includes(6) && kinds.includes(2) && kinds.includes(8), `Team ${team}: ${kinds}`);
  }
  const m = g.mainFob(0);
  m.store.fuel = 0;
  run(g, 30);
  assert.ok(g.city[0].stats.fuel > 0 && m.store.fuel > 0, `TS ${m.store.fuel}`);
});
