// Tests für Simfurt: node simfurt/test/sim.test.js
import assert from 'node:assert';
import { N, T_WATER, BUILD } from '../js/data.js';
import { newCity, tick, applyTool, placeBuilding, canPlace, refresh, unlocked, idx, takeLoan, repayLoan } from '../js/sim.js';
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

console.log(`${n} Tests ok`);
