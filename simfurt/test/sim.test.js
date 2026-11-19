// Tests für Simfurt: node simfurt/test/sim.test.js
import assert from 'node:assert';
import { N, T_WATER, T_TREES, BUILD, ORDINANCES } from '../js/data.js';
import { newCity, tick, applyTool, placeBuilding, canPlace, refresh, unlocked, idx, takeLoan, repayLoan, pushUndo, endUndo, undo, canUndo, flood, tileInfo, UNDO_MAX, setBudget, budgetPct, toggleOrd, ordBlock } from '../js/sim.js';
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

console.log(`${n} Tests ok`);
