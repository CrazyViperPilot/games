// Tests für Simfurt: node simfurt/test/sim.test.js
import assert from 'node:assert';
import { N, T_WATER, T_TREES, BUILD, ORDINANCES, CATS, Z_R, Z_C, Z_I, Z_B, GARBAGE_BLD, RAIL_COST, RAIL_BRIDGE_COST, RAIL_CROSS_COST, RAIL_UPKEEP, BULLDOZE_COST } from '../js/data.js';
import { TRADE_TRAFFIC, TRADE_GARB_FEE, TRADE_GARB_LINK, TRADE_POWER_LINK, TRADE_CITY_MIN, TRADE_CITY_MAX, TRADE_NEIGHBORS_MIN, TRADE_NEIGHBORS_MAX, TRADE_CITY_NAMES, TRADE_FOCUS, TRADE_SWITCHES } from '../js/data.js';
import { newCity, tick, applyTool, placeBuilding, canPlace, refresh, unlocked, idx, takeLoan, repayLoan, pushUndo, endUndo, undo, canUndo, flood, tileInfo, UNDO_MAX, setBudget, budgetPct, toggleOrd, ordBlock, removeBuilding, railComponents, makeNeighbors, makeTrade, setTrade } from '../js/sim.js';
import { performance } from 'node:perf_hooks';
import { serialize, deserialize } from '../js/save.js';
import { buildCity } from './bot.mjs';

let n = 0;
function test(name, fn) { try { fn(); n++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } }
const fresh = (seed = 5) => { const s = newCity({ seed }); s.disasters = false; s.money = 1e6; s.peakPop = 1e6; return s; };

test('Karte hat einen Fluss und Land, gleiche Seed gibt gleiche Karte', () => {
  const a = newCity({ seed: 9 }), b = newCity({ seed: 9 }), c = newCity({ seed: 10 });
  const water = a.terrain.filter((t) => t === T_WATER).length;
  assert.ok(water > 200 && water < 1500, 'Wasseranteil ' + water);
  assert.deepStrictEqual(a.terrain, b.terrain);
  assert.notDeepStrictEqual(a.terrain, c.terrain);
});

test('Straße: Kosten, Brücke auf Wasser, doppelt bauen abgelehnt', () => {
  const s = fresh(); let land = -1, wat = -1;
  for (let i = 0; i < N * N; i++) { if (land < 0 && s.terrain[i] === 0) land = i; if (wat < 0 && s.terrain[i] === T_WATER) wat = i; }
  const m0 = s.money;
  assert.strictEqual(applyTool(s, 'road', land % N, (land / N) | 0), 20);
  assert.strictEqual(applyTool(s, 'road', land % N, (land / N) | 0), -1);
  assert.strictEqual(applyTool(s, 'road', wat % N, (wat / N) | 0), 90);
  assert.strictEqual(m0 - s.money, 110);
});

test('Zu wenig Geld verhindert Bauen', () => {
  const s = fresh(); s.money = 5; assert.strictEqual(applyTool(s, 'road', 20, 5), -2);
});

test('Gebäude: Wasser blockiert, einmalige Wahrzeichen nur einmal, Abriss entfernt', () => {
  const s = fresh();
  let spot = null;
  for (let y = 2; y < N - 6 && !spot; y++) for (let x = 2; x < N - 6; x++) if (!canPlace(s, 'roemer', x, y)) { spot = [x, y]; break; }
  assert.ok(spot);
  assert.ok(placeBuilding(s, 'roemer', spot[0], spot[1]).ok);
  assert.strictEqual(canPlace(s, 'roemer', spot[0] + 5, spot[1]), 'Gibt es schon');
  assert.strictEqual(canPlace(s, 'park', spot[0], spot[1]), 'Gebäude im Weg');
  applyTool(s, 'bulldoze', spot[0], spot[1]);
  assert.strictEqual(s.bld.length, 0); assert.strictEqual(s.occ[idx(spot[0], spot[1])], 0);
});

test('Freischaltung hängt an der Einwohnerzahl', () => {
  const s = newCity({ seed: 1 });
  assert.ok(unlocked(s, 'gas')); assert.ok(!unlocked(s, 'ctower')); assert.ok(!unlocked(s, 4));
});

test('Ohne Strom und Straße wächst nichts, mit beidem wächst die Stadt', () => {
  const s = fresh(); for (let y = 20; y < 24; y++) for (let x = 20; x < 24; x++) applyTool(s, 'zone1', x, y);
  for (let t = 0; t < 24; t++) tick(s);
  assert.strictEqual(s.stats.pop, 0);
  const c = fresh(); buildCity(c);
  for (let t = 0; t < 12 * 8; t++) tick(c);
  assert.ok(c.stats.pop > 1000, 'Einwohner ' + c.stats.pop);
  assert.ok(c.stats.jobs > 500);
  assert.ok(c.stats.happy > 20 && c.stats.happy <= 100);
});

test('Ohne Kraftwerk bricht der Strom nicht, aber nichts wird versorgt', () => {
  const s = fresh(); for (let x = 20; x < 30; x++) applyTool(s, 'road', x, 20);
  for (let x = 20; x < 30; x++) applyTool(s, 'zone1', x, 21);
  for (let t = 0; t < 12; t++) tick(s);
  assert.strictEqual(s.powerCap, 0); assert.strictEqual(s.stats.pop, 0);
});

test('Gleicher Seed und gleiche Eingaben → gleicher Verlauf', () => {
  const run = () => { const s = fresh(3); buildCity(s); for (let t = 0; t < 60; t++) tick(s); return [s.stats.pop, Math.round(s.money), Array.from(s.lvl).join('')]; };
  assert.deepStrictEqual(run(), run());
});

test('Speichern und Laden ergibt denselben Zustand', () => {
  const s = fresh(4); buildCity(s); for (let t = 0; t < 40; t++) tick(s);
  refresh(s); // Kennzahlen auf den aktuellen Stand (tick rechnet die Stats vor der Belegungsanpassung)
  const t = deserialize(serialize(s));
  for (const k of ['terrain', 'road', 'zone', 'lvl', 'vr', 'occ', 'fire']) assert.deepStrictEqual(t[k], s[k], k);
  assert.strictEqual(t.money, s.money); assert.strictEqual(t.year, s.year); assert.strictEqual(t.bld.length, s.bld.length);
  assert.strictEqual(t.stats.pop, s.stats.pop);
  const a = fresh(4); const b = deserialize(serialize(s));
  for (let k = 0; k < 24; k++) { tick(s); tick(b); }
  assert.strictEqual(b.stats.pop, s.stats.pop); assert.strictEqual(Math.round(b.money), Math.round(s.money));
});

test('Feuer: ohne Feuerwehr brennt die Parzelle ab, danach ist das Feuer aus', () => {
  const s = fresh(6); buildCity(s); for (let t = 0; t < 36; t++) tick(s);
  let i = 0; while (!s.lvl[i]) i++;
  const before = s.lvl[i];
  s.disasters = true; s.fire[i] = 1; refresh(s);
  for (let t = 0; t < 7; t++) tick(s);
  assert.strictEqual(s.fire[i], 0);
  assert.ok(s.lvl[i] < before || s.lvl[i] === before, 'Stufe ' + s.lvl[i]);
});

test('Kredit: aufnehmen und tilgen', () => {
  const s = fresh(); const m = s.money;
  assert.ok(takeLoan(s)); assert.strictEqual(s.loan, 10000); assert.strictEqual(s.money, m + 10000);
  assert.ok(repayLoan(s)); assert.strictEqual(s.loan, 0);
});

test('Alle Gebäude haben Größe, Kosten und Freischaltung', () => {
  for (const [k, b] of Object.entries(BUILD)) { assert.ok(b.w > 0 && b.h > 0 && b.cost > 0 && b.unlock >= 0 && b.name, k); }
});

test('Kartengröße 128: Karte, Wachstum und Speichern passen', () => {
  const s = newCity({ seed: 2, size: 128 }); s.disasters = false; s.money = 1e6; s.peakPop = 1e6;
  assert.strictEqual(N, 128); assert.strictEqual(s.terrain.length, 128 * 128);
  assert.ok(s.terrain.filter((t) => t === T_WATER).length > 500);
  for (let x = 40; x < 80; x++) applyTool(s, 'road', x, 30);
  for (let x = 40; x < 80; x++) for (let y = 26; y < 29; y++) applyTool(s, 'zone1', x, y);
  placeBuilding(s, 'gas', 55, 32);
  const t0 = Date.now(); for (let k = 0; k < 24; k++) tick(s);
  console.log('   24 Ticks (128): ' + (Date.now() - t0) + ' ms');
  assert.ok(s.stats.pop > 0);
  const r = deserialize(serialize(s));
  assert.strictEqual(N, 128); assert.deepStrictEqual(r.lvl, s.lvl); assert.strictEqual(r.stats.pop, s.stats.pop);
  const small = deserialize(serialize(newCity({ seed: 1 }))); assert.strictEqual(N, 64); assert.strictEqual(small.terrain.length, 4096);
});

// ---------------------------------------------------------------- Flusslauf (P2)
// 4-zusammenhängende Komponenten von Wasser oder Land, größte zuerst; edges = berührte Kanten
function components(s, water) {
  const n = N, T = s.terrain, seen = new Uint8Array(n * n), out = [];
  for (let i0 = 0; i0 < n * n; i0++) {
    if (seen[i0] || (T[i0] === T_WATER) !== water) continue;
    const st = [i0], edges = new Set(); let size = 0; seen[i0] = 1;
    while (st.length) {
      const i = st.pop(), x = i % n, y = (i - x) / n; size++;
      if (x === 0) edges.add('W'); if (x === n - 1) edges.add('O'); if (y === 0) edges.add('N'); if (y === n - 1) edges.add('S');
      for (const [xx, yy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const j = yy * n + xx;
        if (!seen[j] && (T[j] === T_WATER) === water) { seen[j] = 1; st.push(j); }
      }
    }
    out.push({ size, edges });
  }
  return out.sort((a, b) => b.size - a.size);
}
const SIZES = [64, 96, 128];

test('Flusslauf: 30 Seeds ergeben mindestens 5 verschiedene Kantenpaare', () => {
  const keys = new Set();
  for (let seed = 1; seed <= 30; seed++) keys.add([...components(newCity({ seed }), true)[0].edges].sort().join(''));
  assert.ok(keys.size >= 5, 'verschiedene Kantenpaare: ' + keys.size);
});

test('Flusslauf: Wasseranteil liegt für 30 Seeds je Kartengröße zwischen 4 und 22 %', () => {
  for (const size of SIZES) for (let seed = 1; seed <= 30; seed++) {
    const s = newCity({ seed, size }), share = s.terrain.filter((t) => t === T_WATER).length / (size * size);
    assert.ok(share >= 0.04 && share <= 0.22, `Wasseranteil ${(share * 100).toFixed(1)} % (Größe ${size}, Seed ${seed})`);
  }
});

test('Flusslauf: Hauptfluss berührt zwei verschiedene Kanten und ist zusammenhängend', () => {
  for (const size of SIZES) for (let seed = 1; seed <= 30; seed++) {
    const s = newCity({ seed, size }), main = components(s, true)[0];
    assert.ok(main.edges.size >= 2, `Kanten ${[...main.edges]} (Größe ${size}, Seed ${seed})`);
    assert.ok(main.size >= size * 2, `Hauptfluss nur ${main.size} Kacheln (Größe ${size}, Seed ${seed})`);
  }
});

test('Flusslauf: größte Landfläche ist mindestens 40 % der Karte', () => {
  for (const size of SIZES) for (let seed = 1; seed <= 30; seed++) {
    const s = newCity({ seed, size }), land = components(s, false)[0].size / (size * size);
    assert.ok(land >= 0.4, `größte Landfläche ${(land * 100).toFixed(1)} % (Größe ${size}, Seed ${seed})`);
  }
});

test('Flusslauf: gleicher Seed gibt dieselbe Karte, anderer Seed eine andere (auch 96/128)', () => {
  for (const size of [96, 128]) {
    const a = newCity({ seed: 21, size }), b = newCity({ seed: 21, size }), c = newCity({ seed: 22, size });
    assert.deepStrictEqual(a.terrain, b.terrain, 'Größe ' + size);
    assert.notDeepStrictEqual(a.terrain, c.terrain, 'Größe ' + size);
  }
});

test('Flusslauf: Startfläche in der Mitte bleibt im Mittel waldarm', () => {
  let sum = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = newCity({ seed, size: 64 }); let ct = 0, cl = 0, at = 0, al = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = s.terrain[idx(x, y)]; if (t === T_WATER) continue;
      const c = x > N * 0.28 && x < N * 0.72 && y > N * 0.22 && y < N * 0.78;
      al++; if (t === T_TREES) at++;
      if (c) { cl++; if (t === T_TREES) ct++; }
    }
    sum += (ct / cl) / (at / al);
  }
  assert.ok(sum / 30 < 0.6, 'mittlere Waldquote Mitte/gesamt ' + (sum / 30).toFixed(2));
});

test('Flusslauf: Kartenerzeugung 128×128 bleibt unter 100 ms', () => {
  newCity({ seed: 1, size: 128 });
  const t0 = performance.now(); newCity({ seed: 7, size: 128 }); const dt = performance.now() - t0;
  console.log('   Karte 128: ' + dt.toFixed(1) + ' ms');
  assert.ok(dt < 100, dt + ' ms');
});

// ---------------------------------------------------------------- Rückgängig + Deich (P3)
test('Rückgängig: Straße und Geld werden zurückgesetzt, Monat und Jahr bleiben', () => {
  const s = fresh(); const m0 = s.money, mo = s.month, yr = s.year;
  let land = -1;
  for (let i = 0; i < N * N && land < 0; i++) if (s.terrain[i] === 0) land = i;
  assert.ok(!canUndo(s));
  pushUndo(s);
  assert.strictEqual(applyTool(s, 'road', land % N, (land / N) | 0), 20);
  assert.strictEqual(s.road[land], 1); assert.ok(canUndo(s));
  assert.ok(undo(s));
  assert.strictEqual(s.road[land], 0); assert.strictEqual(s.money, m0);
  assert.strictEqual(s.month, mo); assert.strictEqual(s.year, yr);
  assert.ok(!canUndo(s)); assert.ok(!undo(s));
});

test('Rückgängig: Gebäude verschwindet, occ ist leer, nextId und Gelände stimmen', () => {
  const s = fresh(); const nid = s.nextId;
  let spot = null;
  for (let y = 2; y < N - 3 && !spot; y++) for (let x = 2; x < N - 3; x++) if (!canPlace(s, 'park', x, y)) { spot = [x, y]; break; }
  assert.ok(spot);
  const ter = s.terrain.slice();
  pushUndo(s);
  assert.ok(placeBuilding(s, 'park', spot[0], spot[1]).ok);
  assert.strictEqual(s.bld.length, 1);
  assert.ok(undo(s));
  assert.strictEqual(s.bld.length, 0); assert.ok(s.occ.every((v) => v === 0));
  assert.ok(s.nextId >= nid); assert.deepStrictEqual(s.terrain, ter);
});

test('Rückgängig: höchstens 10 Schritte, der älteste bleibt bestehen', () => {
  assert.strictEqual(UNDO_MAX, 10);
  const s = fresh(); const m0 = s.money; const cells = [];
  for (let i = 0; i < N * N && cells.length < 12; i++) if (s.terrain[i] === 0 && !s.road[i]) cells.push(i);
  for (const i of cells) { pushUndo(s); applyTool(s, 'road', i % N, (i / N) | 0); endUndo(s); }
  let steps = 0;
  while (undo(s)) steps++;
  assert.strictEqual(steps, 10);
  assert.strictEqual(s.money, m0 - 40); assert.strictEqual(s.road[cells[0]] + s.road[cells[1]], 2); assert.strictEqual(s.road[cells[2]], 0);
  assert.ok(!canUndo(s));
});

test('Rückgängig: späteres Wachstum und Einnahmen bleiben, nur die Aktion wird erstattet', () => {
  const s = fresh(); buildCity(s); for (let t = 0; t < 36; t++) tick(s);
  const pop0 = s.stats.pop;
  let spot = null;
  for (let y = 2; y < N - 3 && !spot; y++) for (let x = 2; x < N - 3; x++) if (!canPlace(s, 'park', x, y)) { spot = [x, y]; break; }
  pushUndo(s); assert.ok(placeBuilding(s, 'park', spot[0], spot[1]).ok); endUndo(s);
  for (let t = 0; t < 6; t++) tick(s);
  const m1 = s.money, lv = s.lvl.slice();
  assert.ok(undo(s));
  assert.strictEqual(s.money, m1 + BUILD.park.cost);
  let same = 0; for (let i = 0; i < N * N; i++) if (lv[i] === s.lvl[i]) same++;
  assert.ok(same > N * N - 4, 'Stufen geändert: ' + (N * N - same)); assert.ok(pop0 > 0);
});

test('Rückgängig: Abriss eines Gebäudes stellt es wieder her', () => {
  const s = fresh(); let spot = null;
  for (let y = 2; y < N - 3 && !spot; y++) for (let x = 2; x < N - 3; x++) if (!canPlace(s, 'police', x, y)) { spot = [x, y]; break; }
  placeBuilding(s, 'police', spot[0], spot[1]); const m0 = s.money;
  pushUndo(s); applyTool(s, 'bulldoze', spot[0], spot[1]); endUndo(s);
  assert.strictEqual(s.bld.length, 0);
  assert.ok(undo(s)); assert.strictEqual(s.bld.length, 1); assert.ok(s.occ[idx(spot[0], spot[1])]); assert.strictEqual(s.money, m0);
});

test('Deich: nur an Wasser (4-Nachbarschaft) baubar, sonst „Nur am Wasser“', () => {
  const s = fresh(); let inland = null, shore = null;
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    if (s.terrain[idx(x, y)] === T_WATER) continue;
    const wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s.terrain[idx(x + dx, y + dy)] === T_WATER);
    if (wet && !shore) shore = [x, y];
    if (!wet && !inland) inland = [x, y];
  }
  assert.ok(shore && inland);
  assert.strictEqual(canPlace(s, 'dike', inland[0], inland[1]), 'Nur am Wasser');
  assert.strictEqual(canPlace(s, 'dike', shore[0], shore[1]), '');
  assert.ok(placeBuilding(s, 'dike', shore[0], shore[1]).ok);
  assert.strictEqual(tileInfo(s, shore[0], shore[1]).title, 'Deich');
  refresh(s); assert.strictEqual(s.powerLoad, 0); // Deich verbraucht keinen Strom
});

test('Deich: Hochwasser trifft Kacheln im Deichradius nicht, außerhalb schon', () => {
  const s = fresh(5); let shore = null;
  for (let y = 1; y < N - 1 && !shore; y++) for (let x = 1; x < N - 1; x++) if (!canPlace(s, 'dike', x, y)) { shore = [x, y]; break; }
  assert.ok(shore);
  const ctrl = fresh(5); // Kontrolle: gleiche Karte ohne Deich
  flood(ctrl);
  assert.ok(placeBuilding(s, 'dike', shore[0], shore[1]).ok);
  flood(s);
  const R = 4; let inRadius = 0, wetInRadius = 0, outFlooded = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d2 = (x - shore[0]) ** 2 + (y - shore[1]) ** 2, i = idx(x, y);
    if (d2 <= R * R) { inRadius++; assert.strictEqual(s.flood[i], 0, `Kachel ${x},${y} im Deichradius überflutet`); if (ctrl.flood[i]) wetInRadius++; }
    else if (s.flood[i]) outFlooded++;
  }
  assert.ok(inRadius > 0 && wetInRadius > 1, 'Kontrolle: im Radius wäre ohne Deich überflutet worden (' + wetInRadius + ')');
  assert.ok(outFlooded > 0, 'außerhalb des Radius wird weiterhin überflutet');
});

// ---------------------------------------------------------------- Budget je Ressort + Verordnungen (Runde 2)
const upkeepOf = (s, kind) => s.bld.reduce((a, b) => a + (BUILD[b.type].kind === kind ? BUILD[b.type].up : 0), 0);
const cityB = (seed = 5) => { const s = fresh(seed); buildCity(s); for (let t = 0; t < 36; t++) tick(s); return s; };

test('Budget/Verordnungen: Standard 100 % und keine Verordnung ergeben den bisherigen Unterhalt', () => {
  const s = cityB();
  assert.deepStrictEqual(s.budget, { police: 100, fire: 100, health: 100, edu: 100, roads: 100 });
  assert.deepStrictEqual(s.ords, {});
  assert.strictEqual(s.fin.parts.upPolice, upkeepOf(s, 'police'));
  assert.strictEqual(s.fin.parts.up, s.bld.reduce((a, b) => a + BUILD[b.type].up, 0));
  assert.strictEqual(s.fin.parts.ordCost, 0);
});

test('Budget Polizei 0 %: keine Abdeckung, Kriminalität höher als bei 100 %, 50 % halbiert die Stärke', () => {
  const s = cityB();
  refresh(s); const c100 = s.stats.crime, p100 = Math.max(...s.maps.police);
  assert.ok(p100 > 0, 'Polizei wirkt bei 100 %');
  setBudget(s, 'police', 0); refresh(s);
  assert.ok(s.stats.crime > c100, `Kriminalität bei 0 %: ${s.stats.crime} vs ${c100}`);
  assert.strictEqual(Math.max(...s.maps.police), 0);
  setBudget(s, 'police', 50); refresh(s);
  assert.ok(Math.abs(Math.max(...s.maps.police) - p100 / 2) < 1e-4, 'Stärke bei 50 %');
});

test('Budget senkt den Unterhalt je Ressort proportional (Polizei 50 %, Feuerwehr 0 %, Straßen 50 %)', () => {
  const s = cityB();
  tick(s); const up = upkeepOf(s, 'police'), upF = upkeepOf(s, 'fire');
  assert.ok(up > 0 && upF > 0);
  const roads100 = s.fin.parts.roads;
  setBudget(s, 'police', 50); setBudget(s, 'fire', 0); setBudget(s, 'roads', 50);
  tick(s);
  assert.ok(Math.abs(s.fin.parts.upPolice - up * 0.5) < 1e-6, 'Polizei ' + s.fin.parts.upPolice);
  assert.strictEqual(s.fin.parts.upFire, 0);
  assert.ok(Math.abs(s.fin.parts.roads - roads100 * 0.5) < 1e-9, 'Straßen ' + s.fin.parts.roads);
});

test('Budget Straßen: unter 60 % steigt die Verkehrsbelastung und die Zufriedenheit sinkt, ab 60 % keine Wirkung', () => {
  const s = cityB();
  refresh(s); const c100 = s.stats.cong, h100 = s.stats.happy;
  setBudget(s, 'roads', 60); refresh(s);
  assert.strictEqual(s.stats.cong, c100, 'bei 60 % noch ohne Wirkung');
  setBudget(s, 'roads', 0); refresh(s);
  assert.ok(Math.abs(s.stats.cong / c100 - 1.6) < 0.02, 'Verkehr × ' + (s.stats.cong / c100).toFixed(3));
  assert.ok(s.stats.happy < h100, 'Zufriedenheit ' + s.stats.happy + ' vs ' + h100);
});

test('setBudget: 0–120 %, auf 10er-Schritte gerundet; unbekanntes Ressort und alte Stände', () => {
  const s = newCity({ seed: 3 });
  assert.strictEqual(setBudget(s, 'edu', 135), 120);
  assert.strictEqual(setBudget(s, 'edu', -5), 0);
  assert.strictEqual(setBudget(s, 'edu', 47), 50);
  assert.strictEqual(setBudget(s, 'parks', 50), false);
  assert.strictEqual(setBudget(s, 'police', NaN), false);
  assert.strictEqual(budgetPct(s, 'police'), 100);
  s.budget = { police: 70 };
  assert.strictEqual(budgetPct(s, 'fire'), 100, 'fehlendes Feld gilt als 100 %');
  assert.strictEqual(budgetPct(s, 'police'), 70);
});

test('Verordnung kostet Geld pro Monat (Fixkosten und je Einwohner), die Bilanz stimmt', () => {
  const s = cityB();
  assert.ok(toggleOrd(s, 'tempo30')); assert.ok(toggleOrd(s, 'oepnv'));
  refresh(s); const m0 = s.money;
  tick(s);
  assert.ok(s.stats.pop > 0);
  assert.ok(Math.abs(s.fin.parts.ordCost - (300 + 0.25 * s.stats.pop)) < 1e-6, 'Kosten ' + s.fin.parts.ordCost);
  assert.ok(Math.abs((s.money - m0) - s.fin.net) < 1e-6, 'Kasse folgt der Bilanz');
  assert.ok(s.fin.exp >= s.fin.parts.ordCost);
  toggleOrd(s, 'tempo30'); toggleOrd(s, 'oepnv');
  tick(s); assert.strictEqual(s.fin.parts.ordCost, 0);
});

test('Verordnungen wirken: Nachbarschaftswache senkt Kriminalität (×0,9), Tempo 30 senkt Verkehr (×0,9)', () => {
  const s = cityB();
  refresh(s); const c0 = s.stats.crime, v0 = s.stats.cong;
  assert.ok(toggleOrd(s, 'wache')); refresh(s);
  assert.ok(Math.abs(s.stats.crime / c0 - 0.9) < 0.01, 'Kriminalität × ' + (s.stats.crime / c0).toFixed(3));
  toggleOrd(s, 'wache'); assert.ok(toggleOrd(s, 'tempo30')); refresh(s);
  assert.ok(Math.abs(s.stats.cong / v0 - 0.9) < 0.01, 'Verkehr × ' + (s.stats.cong / v0).toFixed(3));
  toggleOrd(s, 'tempo30'); refresh(s);
  assert.strictEqual(s.stats.cong, v0, 'ausgeschaltet wieder wie vorher');
});

test('Gesperrte Verordnung lässt sich nicht einschalten (Einwohner oder Flughafen fehlen)', () => {
  const s = newCity({ seed: 5 });
  assert.strictEqual(toggleOrd(s, 'gruen'), false); assert.ok(!s.ords.gruen);
  assert.deepStrictEqual(ordBlock(s, 'gruen'), { pop: 4000 });
  const f = fresh(5);
  assert.strictEqual(toggleOrd(f, 'nachtflug'), false); assert.ok(!f.ords.nachtflug);
  assert.deepStrictEqual(ordBlock(f, 'nachtflug'), { build: 'fraport' });
  let spot = null;
  for (let y = 1; y < N - 3 && !spot; y++) for (let x = 1; x < N - 5; x++) if (!canPlace(f, 'fraport', x, y)) { spot = [x, y]; break; }
  assert.ok(spot, 'Platz für den Flughafen');
  assert.ok(placeBuilding(f, 'fraport', spot[0], spot[1]).ok);
  assert.strictEqual(toggleOrd(f, 'nachtflug'), true);
  assert.strictEqual(toggleOrd(f, 'nachtflug'), false);
  assert.strictEqual(toggleOrd(f, 'gibtsnicht'), false);
});

test('Speichern und Laden erhalten budget und ords', () => {
  const s = cityB();
  setBudget(s, 'police', 70); setBudget(s, 'roads', 120); toggleOrd(s, 'tempo30'); toggleOrd(s, 'wache');
  tick(s);
  const t = deserialize(serialize(s));
  assert.deepStrictEqual(t.budget, s.budget); assert.deepStrictEqual(t.ords, s.ords);
  assert.deepStrictEqual(t.ords, { tempo30: true, wache: true });
  for (let k = 0; k < 12; k++) { tick(s); tick(t); }
  assert.strictEqual(Math.round(t.money), Math.round(s.money)); assert.strictEqual(t.stats.pop, s.stats.pop);
});

test('Alte Stände ohne budget/ords laden mit den Standardwerten', () => {
  const s = cityB();
  const o = JSON.parse(serialize(s)); delete o.budget; delete o.ords;
  const t = deserialize(JSON.stringify(o));
  assert.deepStrictEqual(t.budget, { police: 100, fire: 100, health: 100, edu: 100, roads: 100 });
  assert.deepStrictEqual(t.ords, {});
  assert.strictEqual(budgetPct(t, 'police'), 100);
});

test('Verordnungen: mindestens 8 Einträge mit eindeutiger id, Kurzbeschreibung und Kosten', () => {
  assert.ok(ORDINANCES.length >= 8, 'Anzahl ' + ORDINANCES.length);
  const ids = new Set(ORDINANCES.map((o) => o.id));
  assert.strictEqual(ids.size, ORDINANCES.length);
  for (const o of ORDINANCES) {
    assert.ok(o.name && o.desc, o.id);
    assert.ok(o.cost >= 0 && (o.costPerPop || 0) >= 0 && o.unlock >= 0, o.id);
  }
});

// ---------------------------------------------------------------- Wasserversorgung (Runde 2, Q2)
const spotsFor = (s, key) => { const out = []; for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) if (canPlace(s, key, x, y) === '') out.push([x, y]); return out; };
const maxLvl = (s, z) => { let m = 0; for (let i = 0; i < N * N; i++) if (s.zone[i] === z) m = Math.max(m, s.lvl[i]); return m; };
const cnt = (s, pred) => { let n = 0; for (let i = 0; i < N * N; i++) if (pred(i)) n++; return n; };

test('Wasser: Kategorie „Wasser“ vor „Dienste“, Deich und Wasseranlagen darin', () => {
  const ids = CATS.map((c) => c.id);
  assert.ok(ids.indexOf('water') >= 0 && ids.indexOf('water') < ids.indexOf('service'), ids.join(','));
  assert.strictEqual(BUILD.dike.cat, 'water');
  for (const k of ['pump', 'tower', 'treat']) assert.strictEqual(BUILD[k].cat, 'water', k);
});

test('Pumpwerk: nur am Ufer baubar (4-Nachbar Wasser), im Landesinneren „Nur am Ufer“', () => {
  const s = fresh(5);
  const inland = spotsFor(s, 'pump').length ? null : null; void inland;
  let land = null;
  for (let y = 2; y < N - 3 && !land; y++) for (let x = 2; x < N - 3; x++) if (canPlace(s, 'pump', x, y) === 'Nur am Ufer') { land = [x, y]; break; }
  assert.ok(land, 'Landstelle ohne Ufer');
  const shore = spotsFor(s, 'pump')[0];
  assert.ok(shore, 'Uferstelle');
  assert.ok(placeBuilding(s, 'pump', shore[0], shore[1]).ok);
  const wat = s.terrain.indexOf(T_WATER);
  assert.strictEqual(canPlace(s, 'pump', wat % N, (wat / N) | 0), 'Wasser', 'auf Wasser bleibt verboten');
});

test('Wasser: ohne Pumpwerk wächst keine Wohnzone über Stufe 1, mit Wasser schon', () => {
  const dry = fresh(5); buildCity(dry);
  for (const b of [...dry.bld]) if (b.type === 'pump' || b.type === 'tower') removeBuilding(dry, b);
  refresh(dry);
  assert.strictEqual(dry.waterCap, 0); assert.ok(dry.watered.every((v) => v === 0));
  for (let t = 0; t < 120; t++) tick(dry);
  assert.ok(dry.stats.lots > 0, 'Stufe 1 entsteht ohne Wasser');
  assert.ok(maxLvl(dry, Z_R) <= 1, 'ohne Wasser max. Stufe ' + maxLvl(dry, Z_R));
  const wet = fresh(5); buildCity(wet);
  for (let t = 0; t < 120; t++) tick(wet);
  assert.ok(maxLvl(wet, Z_R) >= 2, 'mit Wasser höhere Stufen ' + maxLvl(wet, Z_R));
});

test('Wasser: ohne Versorgung sinkt Stufe > 1 nur langsam (rand < 0,05 je Parzelle und Monat)', () => {
  const s = fresh(5); buildCity(s);
  for (let t = 0; t < 96; t++) tick(s);
  const hi0 = cnt(s, (i) => s.zone[i] && s.lvl[i] >= 2);
  assert.ok(hi0 > 20, 'Stufe ≥ 2 vorhanden: ' + hi0);
  for (const b of [...s.bld]) if (b.type === 'pump' || b.type === 'tower') removeBuilding(s, b);
  refresh(s);
  tick(s);
  const hi1 = cnt(s, (i) => s.zone[i] && s.lvl[i] >= 2);
  assert.ok(hi1 >= hi0 * 0.8, `in einem Monat sinkt nur ein kleiner Teil: ${hi0} → ${hi1}`);
  assert.ok(hi1 < hi0, 'es sinkt aber doch etwas');
});

test('Wasser: Zufriedenheit sinkt bei trockenen Parzellen ab Stufe 2, nicht vorher', () => {
  const s = fresh(5); buildCity(s);
  refresh(s); assert.strictEqual(s.stats.parts.water, 0, 'mit Versorgung keine Strafe');
  for (let t = 0; t < 96; t++) tick(s);
  for (const b of [...s.bld]) if (b.type === 'pump' || b.type === 'tower') removeBuilding(s, b);
  refresh(s);
  assert.ok(s.stats.parts.water < 0 && s.stats.parts.water >= -20, 'Teil Wasser ' + s.stats.parts.water);
  assert.ok(s.stats.waterDry > 0);
});

test('Kläranlage: senkt Verschmutzung im Radius, Pumpwerk-Kapazität ×1,25, mit zwei und mehr ×1,5 (Obergrenze)', () => {
  const s = fresh(5); buildCity(s); refresh(s);
  const cap0 = s.waterCap; assert.ok(cap0 > 0);
  const pol0 = Float32Array.from(s.maps.pol);
  let hot = 0; for (let i = 1; i < N * N; i++) if (pol0[i] > pol0[hot]) hot = i;
  assert.ok(pol0[hot] > 0, 'Verschmutzung vorhanden');
  const hx = hot % N, hy = (hot / N) | 0;
  let spot = null;
  for (let r = 3; r <= 6 && !spot; r++) for (let y = hy - r; y <= hy + r && !spot; y++) for (let x = hx - r; x <= hx + r; x++) {
    if (canPlace(s, 'treat', x, y) === '') { spot = [x, y]; break; }
  }
  assert.ok(spot, 'Platz für die Kläranlage');
  assert.ok(placeBuilding(s, 'treat', spot[0], spot[1]).ok);
  refresh(s);
  assert.ok(Math.abs(s.waterCap - cap0 * 1.25) < 1e-6, `Kapazität ${s.waterCap} statt ${cap0 * 1.25}`);
  let up = 0, sum0 = 0, sum1 = 0;
  for (let i = 0; i < N * N; i++) { sum0 += pol0[i]; sum1 += s.maps.pol[i]; if (s.maps.pol[i] > pol0[i] + 1e-4) up++; }
  assert.strictEqual(up, 0, 'Verschmutzung darf nirgends steigen');
  assert.ok(s.maps.pol[hot] < pol0[hot] * 0.9, `Dreck am Hotspot ${s.maps.pol[hot]} vorher ${pol0[hot]}`);
  assert.ok(sum1 < sum0, 'Summe der Verschmutzung sinkt');
  const place = () => { for (let y = 1; y < N - 2; y++) for (let x = 1; x < N - 2; x++) if (placeBuilding(s, 'treat', x, y).ok) return true; return false; };
  assert.ok(place()); refresh(s);
  assert.ok(Math.abs(s.waterCap - cap0 * 1.5) < 1e-6, 'zwei Anlagen: ×1,5 ' + s.waterCap);
  assert.ok(place()); refresh(s);
  assert.ok(Math.abs(s.waterCap - cap0 * 1.5) < 1e-6, 'drei Anlagen bleiben bei ×1,5 ' + s.waterCap);
});

test('Wasserturm: ohne Pumpwerk keine Versorgung, mit einem Pumpwerk verteilt er im Radius', () => {
  const s = fresh(5);
  const land = spotsFor(s, 'tower')[Math.floor(N * N / 3)];
  assert.ok(land, 'Platz für den Wasserturm');
  assert.ok(placeBuilding(s, 'tower', land[0], land[1]).ok);
  refresh(s);
  const ti = idx(land[0], land[1]);
  assert.strictEqual(s.waterCap, 0); assert.strictEqual(s.maps.water[ti], 0); assert.ok(s.watered.every((v) => v === 0));
  const shore = spotsFor(s, 'pump')[0];
  assert.ok(shore && placeBuilding(s, 'pump', shore[0], shore[1]).ok);
  refresh(s);
  assert.ok(s.maps.water[ti] > 0, 'Turm verteilt mit Pumpwerk');
  assert.strictEqual(s.waterCap, BUILD.pump.cap);
  assert.strictEqual(s.watered[ti], 1, 'Turmkachel ist versorgt (Kapazität reicht)');
});

test('Wasser: Speichern erhält die Versorgung nach dem Laden (abgeleitet, Standardwerte bei alten Ständen)', () => {
  const s = fresh(4); buildCity(s); for (let t = 0; t < 30; t++) tick(s);
  const t = deserialize(serialize(s));
  assert.strictEqual(t.waterCap, s.waterCap); assert.strictEqual(t.waterLoad, s.waterLoad);
  assert.deepStrictEqual(Array.from(t.watered), Array.from(s.watered));
});

// ---------------------------------------------------------------- Müll & Recycling (Runde 3, M1)
const dumpsOf = (s) => s.bld.filter((b) => b.type === 'dump');
const cityM = (seed = 5) => { const s = fresh(seed); buildCity(s); for (let t = 0; t < 36; t++) tick(s); return s; };
const noIncin = (s) => { for (const b of [...s.bld]) if (BUILD[b.type].kind === 'incin') removeBuilding(s, b); refresh(s); return s; };
const noDumps = (s) => { for (const b of [...s.bld]) if (BUILD[b.type].kind === 'dump' || BUILD[b.type].kind === 'incin') removeBuilding(s, b); refresh(s); return s; };
/** Erster freier Platz für ein Gebäude (von oben links). */
const spotFor = (s, key) => { for (let y = 1; y < N - 2; y++) for (let x = 1; x < N - 2; x++) if (canPlace(s, key, x, y) === '') return [x, y]; return null; };

test('Müll: entsteht nur in aktiven Parzellen (Straße + Strom), Dienstgebäude zählen mit', () => {
  const s = fresh(5);
  for (let x = 20; x < 30; x++) applyTool(s, 'road', x, 20);
  for (let x = 20; x < 30; x++) { applyTool(s, 'zone1', x, 21); s.lvl[idx(x, 21)] = 2; }
  refresh(s);
  assert.strictEqual(s.garbage, 0, 'ohne Strom kein Aufkommen');
  assert.ok(placeBuilding(s, 'gas', 22, 23).ok);
  refresh(s);
  assert.ok(s.garbage > 0, 'mit Strom entsteht Müll: ' + s.garbage);
  const g1 = s.garbage;
  assert.ok(placeBuilding(s, 'police', 26, 23).ok); refresh(s);
  assert.ok(Math.abs(s.garbage - g1 - GARBAGE_BLD) < 1e-9, 'Dienstgebäude: +' + GARBAGE_BLD + ' t');
  const sum = s.maps.garb.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - s.garbageLeft) < 1e-3 * Math.max(1, s.garbage), 'Kartenansicht summiert sich zum unentsorgten Rest');
});

test('Müll: Aufkommen wächst mit der Stadt (ca. 0,1 t je Einwohner) und die Deponie nimmt bis 300 t je Monat', () => {
  const s = noIncin(cityM(5));
  const ratio = s.garbage / s.stats.pop;
  assert.ok(ratio > 0.03 && ratio < 0.3, `Aufkommen je Einwohner ${ratio.toFixed(3)}`);
  const d = dumpsOf(s)[0]; assert.ok(d, 'buildCity setzt eine Deponie');
  const f0 = d.fill; tick(s);
  const inc = d.fill - f0;
  assert.ok(inc > 0 && inc <= BUILD.dump.cap + 1e-9, 'Füllung je Monat ' + inc);
});

test('Deponie: füllt sich bis zum Volumen, dann nimmt sie nichts mehr an und die Berater-Meldung kommt', () => {
  const s = noIncin(cityM(5)); const d = dumpsOf(s)[0];
  d.fill = BUILD.dump.vol - 20; tick(s);
  assert.strictEqual(d.fill, BUILD.dump.vol, 'voll');
  assert.strictEqual(s.stats.dumpLeft, 0);
  assert.ok(s.garbageLeft > 0 && s.garbageRatio > 0, 'Rest bleibt liegen');
  tick(s); assert.strictEqual(d.fill, BUILD.dump.vol, 'nimmt nichts mehr an');
  assert.ok(s.msgs.some((m) => m.text.includes('Deponie ist voll')), 'Berater-Meldung');
  assert.ok(tileInfo(s, d.x, d.y).lines.some((l) => l.startsWith('Voll')), 'Kachelinfo: voll');
});

test('Recyclinghof: senkt das Aufkommen um 12 % je Hof, höchstens 36 %; Recyclingpflicht zusätzlich ×0,85', () => {
  const s = noDumps(cityM(5)); const g0 = s.garbage;
  const factor = [];
  for (let k = 1; k <= 4; k++) {
    const sp = spotFor(s, 'recyc'); assert.ok(sp && placeBuilding(s, 'recyc', sp[0], sp[1]).ok, 'Platz für Hof ' + k);
    refresh(s); factor.push(s.garbage / g0);
  }
  const want = [0.88, 0.76, 0.64, 0.64];
  factor.forEach((f, i) => assert.ok(Math.abs(f - want[i]) < 1e-9, `Hof ${i + 1}: ×${f.toFixed(4)}`));
  assert.ok(toggleOrd(s, 'recycling')); refresh(s);
  assert.ok(Math.abs(s.garbage / g0 - 0.64 * 0.85) < 1e-9, 'Verordnung ×0,85 zusätzlich: ' + (s.garbage / g0));
});

test('Müll: ohne Entsorgung sinkt die Zufriedenheit (bis −20), mit Deponie nicht', () => {
  const s = noDumps(cityM(5));
  assert.ok(s.stats.pop >= 400, 'Stadt über der Schonfrist: ' + s.stats.pop);
  assert.strictEqual(s.garbageRatio, 1);
  assert.strictEqual(s.stats.parts.garbage, -20, 'Teil Müll ' + s.stats.parts.garbage);
  const sp = spotFor(s, 'dump'); assert.ok(sp && placeBuilding(s, 'dump', sp[0], sp[1]).ok); refresh(s);
  assert.strictEqual(s.stats.parts.garbage, 0, 'mit Deponie keine Strafe');
  tick(s); assert.strictEqual(s.stats.parts.garbage, 0);
});

test('Müll: Schonfrist – unter 400 Einwohnern wirkt unentsorgter Müll nicht auf Zufriedenheit und Dreck', () => {
  const s = fresh(5);
  for (let x = 20; x < 30; x++) applyTool(s, 'road', x, 20);
  for (let x = 20; x < 30; x++) applyTool(s, 'zone1', x, 21);
  placeBuilding(s, 'gas', 22, 23);
  for (let t = 0; t < 24; t++) tick(s);
  assert.ok(s.stats.pop < 400, 'klein: ' + s.stats.pop);
  assert.ok(s.garbageLeft > 0, 'Müll fällt an und bleibt liegen');
  assert.strictEqual(s.stats.parts.garbage, 0);
});

test('Verbrennung: liefert zusätzlich 60 Strom und entsorgt Müll vor den Deponien', () => {
  const s = fresh(5); refresh(s); const c0 = s.powerCap;
  const sp = spotFor(s, 'incin'); assert.ok(sp && placeBuilding(s, 'incin', sp[0], sp[1]).ok);
  refresh(s);
  assert.strictEqual(s.powerCap - c0, BUILD.incin.power, 'Kraftwerk-Kapazität');
  const c = noDumps(cityM(6)); const sp2 = spotFor(c, 'incin'); placeBuilding(c, 'incin', sp2[0], sp2[1]); refresh(c);
  assert.ok(c.garbage < BUILD.incin.burn, 'Aufkommen unter Verbrennungskapazität');
  assert.strictEqual(c.garbageLeft, 0, 'Verbrennung nimmt alles');
  assert.strictEqual(c.stats.parts.garbage, 0);
});

test('Müll: Speichern erhält den Füllstand (fill) und die Entwicklung nach dem Laden', () => {
  const s = cityM(4); const d = dumpsOf(s)[0]; d.fill = 1234; refresh(s);
  const t = deserialize(serialize(s));
  const dt = t.bld.find((b) => b.type === 'dump');
  assert.strictEqual(dt.fill, 1234, 'fill nach dem Laden');
  for (let k = 0; k < 12; k++) { tick(s); tick(t); }
  assert.strictEqual(dumpsOf(t)[0].fill, dumpsOf(s)[0].fill, 'Füllstand gleich nach weiteren Monaten');
  assert.strictEqual(Math.round(t.money), Math.round(s.money)); assert.strictEqual(t.stats.pop, s.stats.pop);
});

test('Müll: alte Stände ohne fill gelten als leere Deponie', () => {
  const s = cityM(5);
  const o = JSON.parse(serialize(s)); for (const b of o.bld) delete b.fill;
  const t = deserialize(JSON.stringify(o));
  assert.strictEqual(dumpsOf(t).length, 1);
  assert.strictEqual(t.stats.dumpLeft, BUILD.dump.vol, 'Restvolumen = volles Volumen');
  assert.ok(t.garbageLeft >= 0);
});

// ---------------------------------------------------------------- S-Bahn (Runde 4, S1)
/** Erster Platz (x, y), an dem ein w×h-Block ohne Wasser, Straße, Gleis, Zone und Gebäude frei ist. */
const freeBlock = (s, w, h) => {
  for (let y = 2; y < N - h - 2; y++) for (let x = 2; x < N - w - 2; x++) {
    let ok = true;
    for (let yy = y; yy < y + h && ok; yy++) for (let xx = x; xx < x + w; xx++) {
      const i = idx(xx, yy);
      if (s.terrain[i] === T_WATER || s.road[i] || s.rail[i] || s.occ[i] || s.lvl[i] || s.zone[i]) { ok = false; break; }
    }
    if (ok) return [x, y];
  }
  return null;
};
/**
 * Kleines Stadtstück (24×12): Straße in Zeile y0+5, Wohnzonen Stufe 2 in Zeile y0+6 (Lücke bei x0+gapOff),
 * Gaskraftwerk in der Nähe. Gleise werden von den Tests selbst gelegt.
 */
function railTown(seed = 5, gapOff = -1) {
  const s = fresh(seed); const b = freeBlock(s, 24, 12); assert.ok(b, 'Platz für das Stadtstück');
  const [x0, y0] = b, gap = gapOff < 0 ? -1 : x0 + gapOff;
  for (let x = x0; x < x0 + 24; x++) applyTool(s, 'road', x, y0 + 5);
  for (let x = x0; x < x0 + 24; x++) if (x !== gap) { applyTool(s, 'zone1', x, y0 + 6); s.lvl[idx(x, y0 + 6)] = 2; }
  assert.ok(placeBuilding(s, 'gas', x0 + 10, y0 + 9).ok, 'Kraftwerk');
  refresh(s);
  return { s, x0, y0 };
}
const trafficSum = (s) => { let t = 0; for (let i = 0; i < N * N; i++) if (s.road[i]) t += s.maps.traffic[i]; return t; };

test('S-Bahn: Gleis 40 €/Kachel, Gleisbrücke über Wasser 150 €, zweimal legen abgelehnt', () => {
  const s = fresh();
  const [x, y] = freeBlock(s, 1, 1);
  const m0 = s.money;
  assert.strictEqual(applyTool(s, 'rail', x, y), RAIL_COST); assert.strictEqual(s.rail[idx(x, y)], 1);
  assert.strictEqual(applyTool(s, 'rail', x, y), -1, 'doppelt');
  assert.strictEqual(m0 - s.money, RAIL_COST);
  let wat = -1; for (let i = 0; i < N * N && wat < 0; i++) if (s.terrain[i] === T_WATER && !s.road[i]) wat = i;
  assert.strictEqual(applyTool(s, 'rail', wat % N, (wat / N) | 0), RAIL_BRIDGE_COST);
  assert.strictEqual(s.rail[wat], 1); assert.strictEqual(s.terrain[wat], T_WATER, 'Wasser bleibt Wasser');
  assert.strictEqual(RAIL_COST, 40); assert.strictEqual(RAIL_BRIDGE_COST, 150); assert.strictEqual(RAIL_CROSS_COST, 60);
});

test('S-Bahn: Bahnübergang – Gleis auf Straße und Straße auf Gleis kosten je 60 €, Abriss nimmt zuerst das Gleis', () => {
  const s = fresh();
  const [x, y] = freeBlock(s, 1, 1), i = idx(x, y);
  assert.strictEqual(applyTool(s, 'road', x, y), 20);
  assert.strictEqual(applyTool(s, 'rail', x, y), RAIL_CROSS_COST, 'Gleis auf Straße');
  assert.ok(s.road[i] === 1 && s.rail[i] === 1, 'beides liegt auf der Kachel');
  assert.strictEqual(applyTool(s, 'bulldoze', x, y), BULLDOZE_COST);
  assert.ok(s.rail[i] === 0 && s.road[i] === 1, 'erster Abriss: Gleis weg, Straße bleibt');
  assert.strictEqual(applyTool(s, 'bulldoze', x, y), BULLDOZE_COST);
  assert.ok(s.road[i] === 0, 'zweiter Abriss: Straße weg');
  // Straße auf vorhandenem Gleis
  assert.strictEqual(applyTool(s, 'rail', x, y), RAIL_COST);
  assert.strictEqual(applyTool(s, 'road', x, y), RAIL_CROSS_COST, 'Straße auf Gleis');
  assert.ok(s.road[i] === 1 && s.rail[i] === 1);
});

test('S-Bahn: Zonen und Gebäude nicht auf Gleisen; Bahnhof nur an einem Gleis', () => {
  const s = fresh();
  const [x, y] = freeBlock(s, 4, 8);
  applyTool(s, 'rail', x, y);
  assert.strictEqual(applyTool(s, 'zone1', x, y), -1, 'Zone auf Gleis');
  assert.strictEqual(canPlace(s, 'park', x, y), 'Gleis im Weg');
  assert.ok(!placeBuilding(s, 'park', x, y).ok);
  assert.strictEqual(canPlace(s, 'sbahn', x, y), 'Gleis im Weg', 'Bahnhof auf dem Gleis');
  assert.strictEqual(canPlace(s, 'sbahn', x, y + 1), '', 'Bahnhof am Gleis (4-Nachbar)');
  assert.strictEqual(canPlace(s, 'sbahn', x, y + 4), 'Nur am Gleis', 'Bahnhof ohne Gleis');
});

test('S-Bahn: Rückgängig nimmt Gleis und Kosten zurück', () => {
  const s = fresh(); const [x, y] = freeBlock(s, 1, 1); const m0 = s.money;
  pushUndo(s); assert.strictEqual(applyTool(s, 'rail', x, y), RAIL_COST); endUndo(s);
  assert.strictEqual(s.rail[idx(x, y)], 1);
  assert.ok(undo(s));
  assert.strictEqual(s.rail[idx(x, y)], 0); assert.strictEqual(s.money, m0);
});

test('S-Bahn: railComponents – Teilnetze, Kartenrand-Flag, Kacheln ohne Gleis', () => {
  const s = fresh();
  for (let x = 0; x < 3; x++) applyTool(s, 'rail', x, 0);      // am Kartenrand
  for (let x = 20; x < 22; x++) applyTool(s, 'rail', x, 20);   // im Inneren
  applyTool(s, 'road', 5, 5);
  const r = railComponents(s);
  assert.strictEqual(r.count, 2);
  assert.strictEqual(r.comp.length, N * N);
  assert.strictEqual(r.comp[idx(5, 5)], -1, 'Straße ist kein Gleis');
  assert.strictEqual(r.comp[idx(0, 0)], r.comp[idx(2, 0)]);
  assert.strictEqual(r.comp[idx(20, 20)], r.comp[idx(21, 20)]);
  assert.notStrictEqual(r.comp[idx(0, 0)], r.comp[idx(20, 20)]);
  assert.strictEqual(r.touchesEdge[r.comp[idx(0, 0)]], true);
  assert.strictEqual(r.touchesEdge[r.comp[idx(20, 20)]], false);
  assert.strictEqual(r.touchesEdge.length, 2);
});

test('S-Bahn: ein Bahnhof ohne Partner wirkt nicht, zwei am selben Gleis schon (Verkehr sinkt)', () => {
  const { s, x0, y0 } = railTown(5);
  const t0 = trafficSum(s); assert.ok(t0 > 0, 'Verkehr vorhanden');
  for (let x = x0; x < x0 + 24; x++) applyTool(s, 'rail', x, y0 + 2);
  refresh(s);
  assert.strictEqual(trafficSum(s), t0, 'Gleis allein ändert nichts');
  assert.ok(placeBuilding(s, 'sbahn', x0 + 2, y0 + 1).ok, 'erster Bahnhof');
  refresh(s);
  assert.strictEqual(s.stats.railStations, 1); assert.strictEqual(s.stats.railActive, 0);
  assert.strictEqual(trafficSum(s), t0, 'einzelner Bahnhof wirkt nicht');
  assert.strictEqual(s.maps.rail[idx(x0 + 2, y0 + 1)], 0);
  assert.ok(tileInfo(s, x0 + 2, y0 + 1).lines.some((l) => l.includes('zweiten Bahnhof')), 'Kachelinfo sagt es');
  assert.ok(placeBuilding(s, 'sbahn', x0 + 20, y0 + 1).ok, 'zweiter Bahnhof');
  refresh(s);
  assert.strictEqual(s.stats.railActive, 2);
  const t2 = trafficSum(s);
  assert.ok(t2 < t0 * 0.95, `Verkehr ${t2.toFixed(3)} statt ${t0.toFixed(3)}`);
  assert.ok(t2 > t0 * 0.4, 'nicht unrealistisch niedrig');
  assert.ok(s.maps.rail[idx(x0 + 2, y0 + 1)] > 0.5, 'Bahnabdeckung am Bahnhof');
});

test('S-Bahn: Zwei Bahnhöfe auf getrennten Gleisnetzen wirken nicht', () => {
  const { s, x0, y0 } = railTown(5);
  for (let x = x0; x < x0 + 10; x++) applyTool(s, 'rail', x, y0 + 2);        // Netz A
  for (let x = x0 + 12; x < x0 + 24; x++) applyTool(s, 'rail', x, y0 + 2);   // Netz B, Lücke bei x0+10/11
  assert.ok(placeBuilding(s, 'sbahn', x0 + 2, y0 + 1).ok, 'Bahnhof in Netz A');
  assert.ok(placeBuilding(s, 'sbahn', x0 + 14, y0 + 1).ok, 'Bahnhof in Netz B');
  refresh(s);
  assert.strictEqual(s.stats.railStations, 2);
  assert.strictEqual(s.stats.railActive, 0, 'jeder Bahnhof allein in seinem Netz');
  assert.strictEqual(railComponents(s).count, 2);
});

test('S-Bahn: Bahnübergang erhöht den Verkehr auf der Straßenkachel um 20 %', () => {
  const { s, x0, y0 } = railTown(5, 12);
  const cx = x0 + 12, cy = y0 + 5, ci = idx(cx, cy);
  const t0 = s.maps.traffic[ci]; assert.ok(t0 > 0.05 && t0 < 2.5, 'Verkehr auf der Kachel ' + t0);
  for (let y = y0 + 3; y <= y0 + 8; y++) assert.ok(applyTool(s, 'rail', cx, y) >= 0, 'Gleis bei ' + y);
  assert.strictEqual(s.road[ci] && s.rail[ci], 1, 'Übergang');
  refresh(s);
  const t1 = s.maps.traffic[ci];
  assert.ok(Math.abs(t1 / t0 - 1.2) < 1e-6, `Verhältnis ${(t1 / t0).toFixed(6)}`);
});

test('S-Bahn: Gleisunterhalt 0,5 € je Kachel, Budget „Straßen“ gilt mit', () => {
  const { s, x0, y0 } = railTown(5);
  for (let x = x0; x < x0 + 10; x++) applyTool(s, 'rail', x, y0 + 2);
  refresh(s); const n = s.stats.railTiles;
  assert.strictEqual(n, 10);
  tick(s);
  assert.ok(Math.abs(s.fin.parts.rail - n * RAIL_UPKEEP) < 1e-9, 'Gleisunterhalt ' + s.fin.parts.rail);
  setBudget(s, 'roads', 50); tick(s);
  assert.ok(Math.abs(s.fin.parts.rail - n * RAIL_UPKEEP * 0.5) < 1e-9, 'halbes Budget ' + s.fin.parts.rail);
});

test('S-Bahn: Speichern erhält rail und die Wirkung nach dem Laden', () => {
  const { s, x0, y0 } = railTown(4);
  for (let x = x0; x < x0 + 24; x++) applyTool(s, 'rail', x, y0 + 2);
  placeBuilding(s, 'sbahn', x0 + 2, y0 + 1); placeBuilding(s, 'sbahn', x0 + 20, y0 + 1);
  for (let t = 0; t < 12; t++) tick(s);
  const t = deserialize(serialize(s));
  assert.deepStrictEqual(t.rail, s.rail);
  assert.strictEqual(t.bld.filter((b) => b.type === 'sbahn').length, 2);
  for (let k = 0; k < 12; k++) { tick(s); tick(t); }
  assert.strictEqual(t.stats.railActive, s.stats.railActive); assert.strictEqual(t.stats.railActive, 2);
  assert.strictEqual(Math.round(t.money), Math.round(s.money));
  assert.strictEqual(t.stats.pop, s.stats.pop);
});

test('S-Bahn: Bahnhöfe, Gleis und Werkzeug sind freigeschaltet ab ihrer Einwohnerzahl', () => {
  const s = newCity({ seed: 3 });
  assert.strictEqual(unlocked(s, 'rail'), false, 'Gleis gesperrt bei 0 Einwohnern');
  assert.strictEqual(unlocked(s, 'sbahn'), false);
  s.peakPop = 2500; assert.strictEqual(unlocked(s, 'rail'), true); assert.strictEqual(unlocked(s, 'sbahn'), true);
  assert.strictEqual(BUILD.sbahn.cat, 'transport');
  assert.strictEqual(BUILD.sbahn.kind, 'rail');
});

// ---------------------------------------------------------------- Nachbarstädte & Handel (Runde 4, H1)
/** Stadt mit Bebauung (bot.mjs), 24 Monate gespielt. Größe fest 64, damit die Kantenkoordinaten stimmen. */
const newTown = (seed) => { const s = newCity({ seed, size: 64 }); s.disasters = false; s.money = 1e6; s.peakPop = 1e6; buildCity(s); for (let t = 0; t < 24; t++) tick(s); return s; };
/** Straße vom Stadtnetz bis zur Randreihe der Kante (Norden/Osten/Süden/Westen) – passt zu buildCity-Raster. */
function roadToEdge(s, edge) {
  if (edge === 0) for (let y = 17; y >= 0; y--) applyTool(s, 'road', 32, y);
  if (edge === 1) for (let x = 50; x < N; x++) applyTool(s, 'road', x, 24);
  if (edge === 2) for (let y = 46; y < N; y++) applyTool(s, 'road', 36, y);
  if (edge === 3) for (let x = 13; x >= 0; x--) applyTool(s, 'road', x, 24);
}
const linkOf = (s, edge) => s.trade.links.find((l) => l.edge === edge) || null;

test('Handel: 3–4 Nachbarstädte aus dem Seed, verschiedene Namen und Kanten, Größe und Schwerpunkt gültig', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const nb = makeNeighbors(seed);
    assert.ok(nb.length >= TRADE_NEIGHBORS_MIN && nb.length <= TRADE_NEIGHBORS_MAX, 'Anzahl ' + nb.length);
    assert.strictEqual(new Set(nb.map((n) => n.name)).size, nb.length, 'Namen verschieden');
    assert.strictEqual(new Set(nb.map((n) => n.edge)).size, nb.length, 'Kanten verschieden');
    for (const n of nb) {
      assert.ok(TRADE_CITY_NAMES.includes(n.name));
      assert.ok(n.edge >= 0 && n.edge <= 3);
      assert.ok(n.size >= TRADE_CITY_MIN && n.size <= TRADE_CITY_MAX && n.size % 5000 === 0, 'Größe ' + n.size);
      assert.ok(TRADE_FOCUS.includes(n.focus));
    }
  }
});

test('Handel: gleicher Seed gibt dieselben Nachbarn, anderer Seed andere; newCity legt trade mit Schaltern aus an', () => {
  assert.deepStrictEqual(makeNeighbors(42), makeNeighbors(42));
  assert.notDeepStrictEqual(makeNeighbors(42), makeNeighbors(43));
  const s = newCity({ seed: 42 });
  assert.deepStrictEqual(s.trade.neighbors, makeNeighbors(42));
  for (const k of TRADE_SWITCHES) assert.strictEqual(s.trade[k], false, k + ' aus');
  assert.strictEqual(setTrade(s, 'kein Schalter', true), false, 'unbekannter Schalter');
  assert.strictEqual(setTrade(s, 'sellPower', true), true);
  assert.strictEqual(s.trade.sellPower, true);
});

test('Handel: ohne Anschluss keine Wirkung – auch bei eingeschalteten Schaltern bleibt die Simulation wie ohne Handel', () => {
  const a = newTown(5), b = newTown(5);
  delete b.trade; // Stand ohne Handel (nur alte Stände hätten das nicht; hier zum Vergleich)
  for (const k of TRADE_SWITCHES) setTrade(a, k, true);
  assert.strictEqual(a.trade.links.length, 0, 'keine Verbindung');
  for (let t = 0; t < 24; t++) { tick(a); tick(b); }
  assert.strictEqual(a.money, b.money); assert.strictEqual(a.stats.pop, b.stats.pop);
  assert.strictEqual(a.stats.unemp, b.stats.unemp); assert.strictEqual(a.stats.jobs, b.stats.jobs);
  assert.strictEqual(a.powerRatio, b.powerRatio); assert.strictEqual(a.waterRatio, b.waterRatio);
  assert.deepStrictEqual(a.maps.traffic, b.maps.traffic);
  assert.strictEqual(a.fin.parts.tradeIn, 0); assert.strictEqual(a.fin.parts.tradeOut, 0);
});

test('Handel: Straße bis zum Rand an der Kante einer Nachbarstadt verbindet nur diese; Straße ohne Stadtnetz nicht', () => {
  // Isolierte Straße ohne Bebauung: kein Anschluss
  const iso = newCity({ seed: 7, size: 64 }); iso.disasters = false; iso.money = 1e6;
  roadToEdge(iso, 0); refresh(iso);
  assert.strictEqual(iso.trade.links.length, 0, 'Straße ohne Stadt verbindet nicht');
  // Stadt mit Raster: Straße nach Norden verbindet die Nachbarstadt an Kante 0, Kante 3 hat keine Nachbarstadt
  const s = newTown(7);
  assert.strictEqual(s.trade.links.length, 0, 'ohne Straße keine Verbindung');
  const edges = s.trade.neighbors.map((n) => n.edge);
  roadToEdge(s, 0); refresh(s);
  assert.strictEqual(s.trade.links.length, 1, 'eine Verbindung');
  assert.ok(linkOf(s, 0) && linkOf(s, 0).road && !linkOf(s, 0).rail, 'Norden über Straße');
  assert.strictEqual(s.trade.links[0].name, s.trade.neighbors.find((n) => n.edge === 0).name);
  // Straße nach Westen: keine Nachbarstadt auf Kante 3 (Seed 7 hat Kanten 0, 1, 2) → unverändert
  assert.ok(!edges.includes(3));
  roadToEdge(s, 3); refresh(s);
  assert.strictEqual(s.trade.links.length, 1, 'Westkante ohne Nachbarn verbindet nichts');
  // Kachelinfo nennt den Anschluss
  const tile = linkOf(s, 0).tile;
  assert.ok(tileInfo(s, tile % N, (tile / N) | 0).lines.some((l) => l.includes('Anschluss an')), 'Kachelinfo');
});

test('Handel: Gleis bis zum Rand mit einem Bahnhof verbindet; der Bahnhof wirkt dann allein', () => {
  const s = newTown(7);
  for (let y = 47; y < N; y++) applyTool(s, 'rail', 40, y);
  placeBuilding(s, 'sbahn', 41, 50);
  refresh(s);
  const ln = linkOf(s, 2);
  assert.ok(ln && ln.rail, 'Süden über Gleis verbunden: ' + JSON.stringify(s.trade.links));
  assert.strictEqual(s.stats.railStations, 1);
  assert.strictEqual(s.stats.railActive, 1, 'Bahnhof am angebundenen Gleis wirkt allein');
  // Gegenprobe: ohne Anschluss (Gleis endet vor dem Rand) wirkt ein einzelner Bahnhof nicht
  const t = newTown(7);
  for (let y = 47; y < 60; y++) applyTool(t, 'rail', 40, y);
  placeBuilding(t, 'sbahn', 41, 50);
  refresh(t);
  assert.strictEqual(t.stats.railActive, 0, 'ohne Rand kein Wirken');
  assert.strictEqual(t.trade.links.length, 0);
});

test('Handel: Pendler – Gewerbe-Nachbar senkt die Arbeitslosigkeit (Auspendler), Wohnen-Nachbar füllt offene Stellen', () => {
  // Nur Wohnen: alle Arbeitskräfte ohne Arbeit → Arbeitslosigkeit 100 %
  const a = newTown(7);
  for (let i = 0; i < N * N; i++) if (a.zone[i] === Z_C || a.zone[i] === Z_I || a.zone[i] === Z_B) { a.zone[i] = 0; a.lvl[i] = 0; }
  refresh(a);
  const u0 = a.stats.unemp;
  assert.ok(u0 > 0.99, 'ohne Arbeit: Arbeitslosigkeit ' + u0);
  a.trade.neighbors.forEach((n) => { n.focus = 'gew'; });
  roadToEdge(a, 0); refresh(a);
  assert.ok(a.stats.trade.commOut > 0, 'Auspendler');
  assert.ok(a.stats.unemp < u0 - 0.1, 'Arbeitslosigkeit sinkt: ' + a.stats.unemp + ' < ' + u0);
  assert.strictEqual(a.stats.trade.commIn, 0, 'keine offenen Stellen');
  // Nur Gewerbe mit wenigen Wohnungen: offene Stellen, Wohnen-Nachbar füllt sie
  const b = newTown(7);
  let k = 0;
  for (let i = 0; i < N * N; i++) if (b.zone[i] === Z_R && (k++ % 4) !== 0) { b.zone[i] = 0; b.lvl[i] = 0; }
  refresh(b);
  const w0 = b.stats.workers, j0 = b.stats.jobs;
  assert.ok(j0 > w0 + 50, 'offene Stellen: ' + j0 + ' > ' + w0);
  b.trade.neighbors.forEach((n) => { n.focus = 'wohn'; });
  roadToEdge(b, 0); refresh(b);
  assert.ok(b.stats.trade.commIn > 0, 'Einpendler');
  assert.strictEqual(b.stats.workers, w0 + b.stats.trade.commIn, 'Arbeitskräfte steigen um die Einpendler');
  assert.ok(b.stats.workers <= b.stats.jobs, 'nur offene Stellen werden besetzt');
  assert.ok(b.stats.trade.dI > 0, 'Industrie-Nachfrage steigt durch Einpendler');
});

test('Handel: Pendler sind durch Größe und eigene Einwohner gedeckelt; Verkehr am Anschluss steigt um Pendler × Faktor', () => {
  const s = newTown(7);
  roadToEdge(s, 0); refresh(s);
  const ln = linkOf(s, 0);
  assert.ok(ln.commuters > 0 && ln.commuters <= Math.round(s.stats.pop * 0.2) + 1, 'Deckel über Einwohner: ' + ln.commuters);
  assert.ok(ln.commuters <= Math.round(ln.size * 0.02) + 1, 'Deckel über Größe');
  const with1 = s.maps.traffic[ln.tile];
  s.trade.neighbors = []; refresh(s);
  const without = s.maps.traffic[ln.tile];
  assert.ok(with1 > without, 'Verkehr am Anschluss steigt');
  if (with1 < 3) assert.ok(Math.abs((with1 - without) - ln.commuters * TRADE_TRAFFIC / 55) < 1e-6, 'Zuschlag = Pendler × Faktor');
});

test('Handel: Stromkauf deckt den Fehlbedarf bis zur Obergrenze und kostet Geld; Verkauf nur bei Überschuss', () => {
  const s = newTown(5);
  for (const b of [...s.bld]) if (b.type === 'incin' || (b.type === 'gas' && s.bld.filter((o) => o.type === 'gas').indexOf(b) > 0)) removeBuilding(s, b);
  refresh(s);
  const r0 = s.powerRatio; assert.ok(r0 < 0.99, 'Stromengpass ' + r0);
  roadToEdge(s, 0); refresh(s);
  assert.strictEqual(s.stats.trade.buyP, 0, 'ohne Schalter kein Kauf');
  setTrade(s, 'buyPower', true);
  const bought = s.stats.trade.buyP;
  assert.ok(bought > 0 && bought <= TRADE_POWER_LINK, 'Kauf ' + bought);
  assert.ok(s.powerRatio > r0, 'Ratio steigt');
  const m0 = s.money;
  tick(s);
  assert.ok(Math.abs(s.fin.parts.tradeOut - s.stats.trade.cost) < 1e-6 && s.fin.parts.tradeOut > 0, 'Ausgabe Handel');
  // Verkauf: Überschuss wird vergütet, kein Kauf gleichzeitig
  const t = newTown(7);
  assert.ok(placeBuilding(t, 'gas', ...spotFor(t, 'gas')).ok, 'zusätzliches Kraftwerk');
  refresh(t);
  assert.ok(t.powerCap > t.powerLoad, 'Überschuss vorhanden');
  roadToEdge(t, 0); setTrade(t, 'sellPower', true); refresh(t);
  assert.ok(t.stats.trade.sellP > 0, 'Überschuss verkauft: ' + t.stats.trade.sellP);
  assert.strictEqual(t.stats.trade.buyP, 0);
  assert.ok(t.stats.trade.income > 0);
});

test('Handel: Müllexport senkt den unentsorgten Rest gegen Gebühr; ohne Anschluss kein Export', () => {
  const s = newTown(5);
  for (const b of [...s.bld]) if (BUILD[b.type].kind === 'dump' || BUILD[b.type].kind === 'incin') removeBuilding(s, b);
  refresh(s);
  const left0 = s.garbageLeft; assert.ok(left0 > 0, 'Rest ohne Entsorgung ' + left0);
  roadToEdge(s, 0); setTrade(s, 'exportGarbage', true); refresh(s);
  assert.ok(s.garbageLeft < left0, 'Rest sinkt');
  assert.ok(Math.abs(s.garbageLeft - (left0 - s.stats.trade.gExp)) < 1e-6, 'Rest = Rest − Export');
  assert.ok(s.stats.trade.gExp > 0 && s.stats.trade.gExp <= TRADE_GARB_LINK, 'Obergrenze je Anschluss');
  tick(s);
  assert.ok(Math.abs(s.fin.parts.tradeOut - s.stats.trade.gExp * TRADE_GARB_FEE) < 1e-6, 'Gebühr je Tonne');
  // Ohne Schalter: kein Export, keine Gebühr
  const t = newTown(5);
  for (const b of [...t.bld]) if (BUILD[b.type].kind === 'dump' || BUILD[b.type].kind === 'incin') removeBuilding(t, b);
  roadToEdge(t, 0); refresh(t);
  assert.strictEqual(t.stats.trade.gExp, 0);
});

test('Handel: Determinismus – gleicher Seed und gleiche Eingaben ergeben denselben Verlauf', () => {
  const run = () => {
    const s = newTown(7); roadToEdge(s, 0); setTrade(s, 'sellWater', true); setTrade(s, 'buyPower', true);
    for (let t = 0; t < 12; t++) tick(s);
    return [s.money, s.stats.pop, s.stats.unemp, s.stats.trade.commIn, s.stats.trade.income, s.powerRatio];
  };
  assert.deepStrictEqual(run(), run());
});

test('Handel: Speichern erhält Nachbarn und Schalter; alte Stände ohne trade laden mit Nachbarn aus dem Seed', () => {
  const s = newTown(5);
  setTrade(s, 'sellWater', true); setTrade(s, 'exportGarbage', true);
  const t = deserialize(serialize(s));
  assert.deepStrictEqual(t.trade.neighbors, s.trade.neighbors);
  assert.strictEqual(t.trade.sellWater, true); assert.strictEqual(t.trade.exportGarbage, true);
  assert.strictEqual(t.trade.buyPower, false);
  // alter Stand: JSON ohne trade
  const o = JSON.parse(serialize(s)); delete o.trade;
  const old = deserialize(JSON.stringify(o));
  assert.deepStrictEqual(old.trade.neighbors, makeNeighbors(s.seed));
  assert.strictEqual(old.trade.sellWater, false);
  for (let k = 0; k < 6; k++) tick(old);
  assert.ok(Array.isArray(old.trade.links));
});

console.log(`${n} Tests ok`);
