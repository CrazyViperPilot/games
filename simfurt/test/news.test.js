// Tests für Zeitung & Bürgerstimmen: node simfurt/test/news.test.js
import assert from 'node:assert';
import { Z_R, BUILD } from '../js/data.js';
import { newCity, tick, applyTool, placeBuilding, removeBuilding, refresh, idx, canPlace } from '../js/sim.js';
import { makeIssue, publishNews, ensureNews, NEWS_MAX } from '../js/news.js';

let n = 0;
function test(name, fn) { try { fn(); n++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } }

/** Kleine Stadt mit Straße, Kraftwerk und bewohnten Wohnzonen (Einwohner > 0). */
function built(seed = 11) {
  const s = newCity({ seed }); s.disasters = false; s.money = 1e6; s.peakPop = 1e6;
  for (let x = 4; x < 40; x++) applyTool(s, 'road', x, 30);
  let spot = null;
  for (let y = 20; y <= 27 && !spot; y++) for (let x = 4; x < 30 && !spot; x++) if (!canPlace(s, 'gas', x, y)) spot = [x, y];
  if (spot) placeBuilding(s, 'gas', spot[0], spot[1]);
  for (let y = 31; y <= 32; y++) for (let x = 6; x < 30; x++) { const i = idx(x, y); s.zone[i] = Z_R; s.lvl[i] = 2; }
  refresh(s);
  return s;
}
const checkVoices = (is) => {
  assert.ok(is.voices.length >= 3 && is.voices.length <= 5, 'Stimmen: ' + is.voices.length);
  for (const v of is.voices) {
    assert.ok(['good', 'bad', 'info'].includes(v.mood));
    assert.ok(typeof v.who === 'string' && v.who.length > 0);
    assert.ok(typeof v.text === 'string' && v.text.length > 0);
  }
};

test('Determinismus: gleicher Stand ergibt dieselbe Ausgabe, Simulation bleibt unverändert', () => {
  const a = built(11), b = built(11);
  const ia = makeIssue(a), ib = makeIssue(b);
  assert.deepStrictEqual(ia, ib);
  assert.deepStrictEqual(makeIssue(a), ia); // wiederholt aufgerufen gleich
  assert.strictEqual(a.rng, b.rng);           // kein rand(s) in news.js
});

test('Ausgabe ist JSON-fähig (wird in s.news gespeichert)', () => {
  const s = built(12);
  const is = makeIssue(s);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(is)), is);
  assert.strictEqual(is.title, 'Simfurter Rundschau');
  assert.strictEqual(is.demands.length, 2);
});

test('Themenwechsel: Steuern 20 % → Steuer-Schlagzeile und Steuer-Forderung', () => {
  const s = built(11);
  assert.notStrictEqual(makeIssue(s).topic, 'tax');
  s.rates = { r: 20, c: 20, i: 20 };
  refresh(s);
  const t = makeIssue(s);
  assert.strictEqual(t.topic, 'tax', 'Thema: ' + t.topic);
  assert.match(t.headline, /Steuer/);
  assert.ok(t.demands.some((d) => d.key === 'tax'));
});

test('Themenwechsel: bebaute Zonen ohne Kraftwerk → Strom-Thema', () => {
  const s = built(11);
  removeBuilding(s, s.bld.find((b) => BUILD[b.type].kind === 'power'));
  refresh(s);
  assert.ok(s.stats.lots > 0 && s.powerCap === 0);
  const t = makeIssue(s);
  assert.strictEqual(t.topic, 'power', 'Thema: ' + t.topic);
  assert.match(t.headline, /Strom/);
  assert.ok(t.demands.some((d) => d.key === 'power'));
});

test('immer 3–5 Stimmen, auch in verschiedenen Lagen', () => {
  const states = [];
  for (let seed = 1; seed <= 6; seed++) states.push(newCity({ seed }), built(seed));
  const crisis = built(13); crisis.money = -5000; crisis.powerCap = 0; refresh(crisis); states.push(crisis);
  for (const s of states) checkVoices(makeIssue(s));
  // über einige Monate laufen lassen
  const s = built(14); s.disasters = true;
  for (let k = 0; k < 6; k++) { tick(s); checkVoices(makeIssue(s)); }
});

test('leere Stadt ohne Fehler, keine Ausgabe ohne Einwohner', () => {
  const s = newCity({ seed: 2 });
  const is = makeIssue(s);
  checkVoices(is);
  assert.strictEqual(is.demands.length, 2);
  assert.strictEqual(publishNews(s), null);
  assert.deepStrictEqual(ensureNews(s), { issues: [], unread: false, last: null });
  assert.doesNotThrow(() => makeIssue({ year: 1990, month: 0 })); // nacktes Minimal-Objekt
  assert.doesNotThrow(() => makeIssue({}));
});

test('alter Stand ohne budget/ords/trade und ohne einzelne Teile ohne Fehler', () => {
  const s = built(15);
  delete s.budget; delete s.ords; delete s.trade; delete s.news; delete s.powerCap; delete s.waterCap;
  delete s.stats.parts.water; delete s.stats.parts.garbage; delete s.stats.parts.ords; delete s.stats.parts.park;
  delete s.stats.avgTax; delete s.stats.dumps; delete s.stats.dumpLeft;
  let is;
  assert.doesNotThrow(() => { is = makeIssue(s); });
  checkVoices(is);
  assert.strictEqual(is.demands.length, 2);
  assert.doesNotThrow(() => publishNews(s));
  assert.ok(Array.isArray(s.news.issues) && s.news.issues.length === 1);
});

test('Ausgabe pro Monat, höchstens NEWS_MAX, ungelesen gesetzt', () => {
  const s = built(16);
  const first = publishNews(s);
  assert.ok(first && first.y === s.year && first.m === s.month);
  assert.strictEqual(s.news.unread, true);
  assert.strictEqual(publishNews(s), null, 'zweimal im selben Monat');
  for (let k = 0; k < NEWS_MAX + 3; k++) { tick(s); publishNews(s); }
  assert.strictEqual(s.news.issues.length, NEWS_MAX);
  const last = s.news.issues[s.news.issues.length - 1];
  assert.strictEqual(last.y * 12 + last.m, s.year * 12 + s.month);
  // Speicherform bleibt erhalten
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.news)), s.news);
});

console.log(`${n} Tests bestanden${process.exitCode ? ' (mit Fehlern)' : ''}`);
