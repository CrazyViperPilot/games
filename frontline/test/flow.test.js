// Flussanzeige (js/game/flow.js, PRD §15 „Ressourcenanzeige“): Kette aus CITY.chain passt zur Simulation (updateCity),
// Engpässe werden erkannt, der Verbrauch wird gemessen. Schlägt ein Test hier fehl, wurde an Rohstoffen, Werken oder Waren
// etwas geändert, ohne CITY.chain oder die Felder cap/inp/gross/n in updateCity mitzupflegen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { KINDS, DEPOSITS } from '../js/game/city.js';
import { resourceFlow, flowLayout, FlowMeter, teamStock, FLOW_GOODS, FLOW_MIDS } from '../js/game/flow.js';

const run = (g, s, fn) => { for (let t = 0; t < s * 20; t++) { g.update(0.05); fn?.(); } };

test('CITY.chain deckt alle Rohstoffe, Werke und Waren ab', () => {
  const tos = Object.values(CITY.chain).map((L) => L.to);
  const froms = Object.values(CITY.chain).flatMap((L) => L.from);
  for (const d of Object.keys(CITY.extract)) assert.ok(froms.includes(d), `Rohstoff ${d} fehlt in CITY.chain`);
  for (const d of DEPOSITS) assert.ok(froms.includes(d), `Vorkommen ${d} fehlt in CITY.chain`);
  for (const g of [...Object.keys(CITY.convert), ...Object.keys(CITY.yield)]) assert.ok(tos.includes(g), `Ware ${g} wird in CITY.chain nicht erzeugt`);
  for (const w of Object.keys(CITY.chain)) assert.ok(KINDS.includes(w), `CITY.chain.${w} ist keine Zellenart`);
  for (const g of tos) assert.ok(FLOW_GOODS.includes(g) || FLOW_MIDS.includes(g), `Ware ${g} fehlt in FLOW_GOODS und FLOW_MIDS`);
  // Zwischenprodukte (Roheisen) ohne Lager: ein Werk erzeugt sie, ein anderes verarbeitet sie
  for (const g of FLOW_MIDS) assert.ok(froms.includes(g), `Zwischenprodukt ${g} wird von keinem Werk verarbeitet`);
  const L = flowLayout();
  for (const l of L.links) assert.ok(L.nodes[l.from].col < L.nodes[l.to].col, `Kante ${l.from} → ${l.to} läuft nach links`);
});

test('Kette seit v5.20: Erz → Hütte → Roheisen → Stahlwerk → Stahl; Öl → Raffinerie und Kerosin-Raffinerie → Kerosin', () => {
  const { nodes } = flowLayout();
  assert.equal(nodes['mid:iron'].type, 'mid', 'Roheisen ist ein Zwischenprodukt');
  assert.equal(nodes['store:iron'], undefined, 'Roheisen hat kein Lager');
  assert.ok(nodes['mid:iron'].ins.includes('works:smelter') && nodes['mid:iron'].outs.includes('works:steel'));
  assert.ok(nodes['works:steel'].ins.includes('mid:iron') && nodes['works:steel'].outs.includes('store:metal'));
  assert.ok(nodes['raw:oil'].outs.includes('works:fuel') && nodes['raw:oil'].outs.includes('works:kero'));
  assert.ok(nodes['works:kero'].outs.includes('store:kero'));
  assert.ok(nodes['store:kero'].col > nodes['works:kero'].col);
});

test('Roheisen ohne Stahlwerk: die Hütte meldet es, kein Erz wird als Bestand gezählt', () => {
  const g = new Game({ seed: 7, city: true });
  run(g, 2);
  const c = g.city[0];
  c.stats = { ...c.stats, fill: 1, powerRatio: 1, happy: 1, mood: 1, jobs: 10, raw: { wood: 0, stone: 0, ore: 1, oil: 0 }, cap: { iron: 2, metal: 0 }, inp: { iron: 1, metal: 0 }, gross: { iron: 0, metal: 0 }, n: { smelter: 1, steel: 0, mine: { wood: 0, stone: 0, ore: 1, oil: 0 } } };
  const f = resourceFlow(g, 0);
  assert.equal(f.nodes['works:smelter'].status, 'bad');
  assert.match(f.nodes['works:smelter'].note, /ohne Stahlwerk/);
  assert.equal(f.nodes['mid:iron'].status, 'ok');
});

test('Graph passt zu den Zahlen der Simulation', () => {
  const g = new Game({ seed: 7, city: true });
  run(g, 90);
  const s = g.city[0].stats;
  for (const L of Object.values(CITY.chain)) {
    for (const f of ['cap', 'inp', 'gross']) assert.ok(Number.isFinite(s[f]?.[L.to]), `stats.${f}.${L.to} fehlt (updateCity)`);
  }
  assert.ok(Math.abs(s.gross.metal - s.mun * CITY.convert.mun - s.metal) < 1e-9);
  const f = resourceFlow(g, 0);
  for (const [w, L] of Object.entries(CITY.chain)) {
    const n = f.nodes[`works:${w}`];
    assert.equal(n.out, s.gross[L.to]);
    assert.ok(n.out <= n.cap + 1e-9 && n.out <= n.inp + 1e-9, `${w}: mehr erzeugt als Werk oder Rohstoff hergeben`);
  }
  for (const d of DEPOSITS) assert.equal(f.nodes[`raw:${d}`].rate, s.raw[d]);
  // Startviertel: eine Raffinerie und eine Ölquelle stehen
  assert.equal(f.nodes['works:fuel'].count, 1);
  assert.equal(f.nodes['raw:oil'].count, 1);
  assert.ok(f.nodes['store:fuel'].stock > 0);
});

test('Engpass: Werk zu klein oder Rohstoff fehlt', () => {
  const g = new Game({ seed: 7, city: true });
  run(g, 2);
  const c = g.city[0];
  const base = { ...c.stats, fill: 1, powerRatio: 1, happy: 1, mood: 1, jobs: 10 };
  const stats = (cap, inp) => ({ ...base, raw: { wood: 0, stone: 0, ore: 0, oil: inp }, cap: { bm: 0, metal: 0, mun: 0, fuel: cap }, inp: { bm: 0, metal: 0, mun: 0, fuel: inp }, gross: { bm: 0, metal: 0, mun: 0, fuel: Math.min(cap, inp) }, n: { bm: 0, mun: 0, fuel: 1, steel: 0, mine: { wood: 0, stone: 0, ore: 0, oil: 1 } } });
  c.stats = stats(0.5, 1);
  let f = resourceFlow(g, 0);
  assert.equal(f.nodes['works:fuel'].status, 'bad');
  assert.equal(f.nodes['raw:oil'].status, 'warn');
  assert.ok(Math.abs(f.nodes['raw:oil'].waste - 0.5) < 1e-9);
  assert.match(f.issues[0].text, /Raffinerie zu klein/);
  c.stats = stats(2, 1);
  f = resourceFlow(g, 0);
  assert.equal(f.nodes['works:fuel'].status, 'warn');
  assert.equal(f.nodes['raw:oil'].status, 'bad');
  assert.match(f.issues[0].text, /Raffinerie nur 50 % ausgelastet/);
  c.stats = { ...stats(1, 1), fill: 0.5 };
  f = resourceFlow(g, 0);
  assert.match(f.issues[0].text, /Nur 50 % der Arbeitsplätze/);
});

test('Verbrauch wird gemessen (Erzeugung + Handel − Zunahme)', () => {
  const g = new Game({ seed: 7, city: true });
  const m = new FlowMeter(60, 1);
  const main = g.mainFob(0);
  run(g, 3, () => m.sample(g, 0));
  assert.equal(m.rates(), null); // noch keine 5 s
  run(g, 30, () => {
    main.store.bm = Math.max(0, main.store.bm - 0.1); // 2 BM/s verbraucht
    m.sample(g, 0);
  });
  const r = m.rates();
  const want = 60 / r.bm.span; // 30 s × 2 BM/s über die ganze Messspanne
  assert.ok(Math.abs(r.bm.use - want) < 0.1, `BM-Verbrauch ${r.bm.use}, erwartet ${want}`);
  const st = teamStock(g, 0);
  assert.ok(st.fuel > 0 && st.metal >= 0);
  const f = resourceFlow(g, 0, r);
  assert.ok(f.nodes['store:bm'].use > 1.5);
});
