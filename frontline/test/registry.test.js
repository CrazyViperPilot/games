// Register der Stadtzellenarten und Waren (seit v5.55 als Vollständigkeitstest, Review-Paket P2, Befunde T-09, Q-10; seit v5.59
// auf die Register js/data/citykinds.js und js/data/goods.js umgestellt, Review-Paket P6, Befunde E-01, Q-03, Q-04, A-02).
// Jede Art und jede Ware ist vollständig eingetragen; fehlt etwas, rechnete das Spiel früher still mit einem Ersatzwert weiter
// (`?? 0`, `?? 1`) oder die Kasse wurde NaN. Neue Zellenart: Eintrag im Register mit der nächsten freien id und hier in der
// festen Liste hinten anhängen (IDs stehen in Spielständen). Neue Ware: Eintrag in GOODS (Rezepte in CLAUDE.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CITY_KINDS, KIND, KINDS, KIND_ID, KIND_NAME, WORKS, SUPPLIER_KINDS, WORKPLACE_KINDS, FLAT_KINDS, BUILD_MENU } from '../js/data/citykinds.js';
import { GOODS, STORED_GOODS, MID_GOODS, CITY_STORE_GOODS, MARKET_GOODS } from '../js/data/goods.js';
import * as cityGame from '../js/game/city.js';
import { CITY } from '../js/data/city.js';
import { CITY_COLORS, CITY_ICON, CITY_TIP, TOOL_GROUPS } from '../js/ui/citypanel.js';
import { FLOW_GOODS, FLOW_MIDS } from '../js/game/flow.js';
import { Game } from '../js/game/game.js';

const LIVE = KINDS.filter((k) => !CITY.retired?.includes(k)); // baubare Arten
const flat = (k) => cityGame.isFlat(KIND_ID[k]); // Straße, Bahn, Rollfeld: kein Gebäude, kein Ziel, kein Strom
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const FIELDS = new Set(['key', 'id', 'name', 'short', 'icon', 'color', 'group', 'tip', 'cost', 'bm', 'size', 'power', 'target', 'jobs', 'works', 'supply', 'flat', 'retired']);

test('KINDS: Reihenfolge festgeschrieben (Zell-IDs im Spielstand), neue Arten nur hinten', () => {
  assert.deepEqual(KINDS, [
    'road', 'res', 'com', 'bm', 'mun', 'fuel', 'steel', 'mine', 'market', 'power', 'uni', 'dc', 'barracks', 'factory', 'heliport',
    'hospital', 'airport', 'smelter', 'kero', 'runway', 'stand', 'atc', 'ktank', 'mdepot', 'taxi',
  ]);
  assert.equal(KIND_ID.airport, 17, 'Platzhalter Flughafen bleibt Nummer 17');
  assert.ok(KIND.airport.retired, 'Flughafen ist nicht mehr baubar');
  for (const k of CITY.retired ?? []) assert.ok(KINDS.includes(k), `CITY.retired: unbekannte Art ${k}`);
});

test('Register: Schlüssel eindeutig, IDs lückenlos 1 … n und gleich Index + 1, nur bekannte Felder; city.js reicht dieselben Listen weiter', () => {
  const keys = CITY_KINDS.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, 'Schlüssel doppelt');
  const ids = CITY_KINDS.filter((e) => e.id !== undefined).map((e) => e.id);
  assert.deepEqual([...ids].sort((a, b) => a - b), ids.map((_, i) => i + 1), 'IDs lückenlos ab 1, keine doppelt');
  KINDS.forEach((k, i) => assert.equal(KIND_ID[k], i + 1, `${k}: Code = Index + 1`));
  for (const e of CITY_KINDS) for (const f of Object.keys(e)) assert.ok(FIELDS.has(f), `${e.key}.${f}: unbekanntes Feld (Tippfehler?)`);
  assert.equal(cityGame.KINDS, KINDS);
  assert.equal(cityGame.KIND_ID, KIND_ID);
  assert.equal(cityGame.KIND_NAME, KIND_NAME);
  assert.equal(cityGame.WORKS, WORKS);
});

test('Jede Zellenart: Name; jede baubare: Preis, Baumaterial, Größe, Strom', () => {
  for (const k of KINDS) assert.ok(typeof KIND_NAME[k] === 'string' && KIND_NAME[k], `KIND_NAME.${k} fehlt`);
  for (const k of LIVE) {
    assert.ok(num(CITY.cost[k]) && CITY.cost[k] >= 0, `CITY.cost.${k} = ${CITY.cost[k]} (fehlt: Kasse wird NaN, Q-10)`);
    const bm = CITY.costBm[k];
    assert.ok(bm === undefined || (num(bm) && bm >= 0), `CITY.costBm.${k} = ${bm}`);
    const sz = CITY.size[k];
    assert.ok(sz === undefined || (Number.isInteger(sz) && sz >= 1), `CITY.size.${k} = ${sz}`);
    if (flat(k)) {
      assert.equal(CITY.power.use[k], undefined, `${k}: flache Zelle ohne Strom`);
      assert.equal(sz, undefined, `${k}: flache Zelle ohne Großbau`);
      continue;
    }
    assert.ok(num(CITY.power.use[k]) && CITY.power.use[k] >= 0, `CITY.power.use.${k} = ${CITY.power.use[k]} (fehlt: still 0)`);
  }
  for (const tab of ['cost', 'costBm', 'size']) {
    for (const k of Object.keys(CITY[tab])) assert.ok(KINDS.includes(k), `CITY.${tab}.${k}: unbekannte Zellenart`);
  }
  for (const k of Object.keys(CITY.power.use)) assert.ok(KINDS.includes(k), `CITY.power.use.${k}: unbekannte Zellenart`);
  for (const k of Object.keys(CITY.ai.targetValue)) assert.ok(KINDS.includes(k), `CITY.ai.targetValue.${k}: unbekannte Zellenart`);
});

test('CITY-Tabellen je Zellenart kommen aus dem Register (eine Quelle)', () => {
  const pairs = { cost: CITY.cost, bm: CITY.costBm, size: CITY.size, power: CITY.power.use, target: CITY.ai.targetValue };
  for (const [f, tab] of Object.entries(pairs)) {
    for (const k of KINDS) assert.equal(tab[k], KIND[k][f], `${k}.${f}`);
  }
  assert.deepEqual(CITY.retired, KINDS.filter((k) => KIND[k].retired));
});

test('Nicht mehr baubare Arten (CITY.retired) sind nur Platzhalter: keine Daten, kein Werkzeug, Bauen wird abgelehnt (seit v5.56)', () => {
  const tabs = { cost: CITY.cost, costBm: CITY.costBm, size: CITY.size, 'power.use': CITY.power.use, 'ai.targetValue': CITY.ai.targetValue, CITY_COLORS, CITY_ICON };
  for (const k of CITY.retired ?? []) {
    for (const [name, tab] of Object.entries(tabs)) assert.ok(!(k in tab), `${name}.${k}: Altlast der nicht mehr baubaren Art`);
    assert.deepEqual(Object.keys(KIND[k]).sort(), ['id', 'key', 'name', 'retired'], `${k}: Platzhalter nur mit Nummer und Name`);
    assert.ok(!TOOL_GROUPS.some(([, ks]) => ks.includes(k)), `${k} im Baumenü`);
  }
  const g = new Game({ seed: 3, city: true });
  const r = g.issue(0, { type: 'city', kind: 'airport', c0: 0, r0: 0, c1: 0, r1: 0 });
  assert.equal(r.ok, false, 'Flughafen lässt sich nicht bauen');
  assert.match(r.reason, /nicht mehr baubar/);
});

test('Jede baubare Zellenart: Farbe, Symbol, Kurzname und Werkzeug in einer benannten Gruppe des Baumenüs', () => {
  assert.equal(TOOL_GROUPS, BUILD_MENU, 'Baumenü aus dem Register');
  const grouped = new Map();
  for (const [name, ks] of TOOL_GROUPS) for (const k of ks) grouped.set(k, name);
  for (const k of LIVE) {
    assert.match(CITY_COLORS[k] ?? '', /^#[0-9a-f]{6}$/i, `color fehlt: ${k}`);
    assert.ok(CITY_ICON[k], `icon fehlt: ${k}`);
    assert.ok(KIND[k].short, `short fehlt: ${k}`);
    assert.ok(grouped.has(k), `${k}: kein Werkzeug im Baumenü`);
    assert.notEqual(grouped.get(k), 'Weitere', `${k}: nur unter „Weitere“ (Feld group im Register eintragen)`);
  }
  for (const [k, t] of Object.entries(CITY_TIP)) assert.ok(typeof t === 'string' && t && !t.includes('undefined') && !t.includes('NaN'), `Tipp ${k}: ${t}`);
});

test('Rollen: Werke, Lieferanten, Arbeitsstätten, flache Zellen passen zu Kette und Arbeitsplatz-Tabellen', () => {
  assert.deepEqual(WORKS, ['bm', 'mun', 'fuel', 'steel', 'smelter', 'kero']);
  assert.deepEqual(FLAT_KINDS, ['road', 'runway', 'taxi']);
  for (const w of WORKS) {
    assert.ok(CITY.chain[w], `Werk ${w}: Eintrag in CITY.chain fehlt`);
    assert.equal(KIND[w].jobs, 'jobs', `Werk ${w}: Arbeitsplätze aus CITY.jobs`);
  }
  for (const w of Object.keys(CITY.chain)) assert.ok(WORKS.includes(w), `CITY.chain.${w}: Art ist kein Werk (works: true)`);
  for (const k of WORKPLACE_KINDS) {
    const t = CITY[KIND[k].jobs];
    assert.ok(Array.isArray(t) && t.length === CITY.maxLevel + 1 && t.every(Number.isInteger), `${k}: CITY.${KIND[k].jobs} je Stufe`);
  }
  for (const k of SUPPLIER_KINDS) assert.ok(WORKPLACE_KINDS.includes(k), `Lieferant ${k} braucht Arbeitsplätze`);
  for (const k of FLAT_KINDS) assert.ok(!WORKPLACE_KINDS.includes(k) && !KIND[k].target, `${k}: flache Zelle ohne Arbeit und Ziel`);
  for (const k of KINDS) assert.equal(cityGame.isFlat(KIND_ID[k]), FLAT_KINDS.includes(k), `isFlat(${k})`);
});

// Bekannte Lücke (P2): Hütte und Kerosin-Raffinerie haben keinen Zielwert, die KI rechnet mit 1. Nachtragen ändert das KI-Verhalten
// (Referenzwerte in test/golden.test.js neu setzen); dann `todo` entfernen.
test('Jede Zellenart mit Gebäude: Zielwert der KI (CITY.ai.targetValue)', { todo: 'smelter und kero fehlen (Befund Q-10)' }, () => {
  const miss = LIVE.filter((k) => !flat(k) && !num(CITY.ai.targetValue[k]));
  assert.deepEqual(miss, [], `ohne Zielwert (KI rechnet still mit 1): ${miss.join(', ')}`);
});

test('Warenregister: jede Ware vollständig; Listen, Markt, Ertrag und Kette aus einer Quelle', () => {
  for (const [g, d] of Object.entries(GOODS)) {
    assert.ok(d.name && d.short, `${g}: name/short`);
    assert.match(d.color ?? '', /^#[0-9a-f]{6}$/i, `${g}: color`);
    assert.ok(['main', 'city', null].includes(d.store), `${g}: store ${d.store}`);
    assert.ok(num(d.yield) && d.yield > 0 && num(d.convert) && d.convert > 0, `${g}: yield/convert`);
    assert.equal(CITY.yield[g], d.yield);
    assert.equal(CITY.convert[g], d.convert);
    assert.ok(Object.values(CITY.chain).some((L) => L.to === g), `${g}: kein Werk in CITY.chain macht sie`);
    if (d.sell !== undefined) assert.ok(d.buy > d.sell && d.sell > 0, `${g}: Markt kauft teurer, als er zahlt`);
    if (d.store === 'city') assert.ok(d.full, `${g}: Hinweis bei vollem Stadtlager`);
  }
  assert.deepEqual(STORED_GOODS, ['bm', 'mun', 'fuel', 'metal', 'kero']);
  assert.deepEqual(MID_GOODS, ['iron']);
  assert.deepEqual(CITY_STORE_GOODS, ['metal', 'kero']);
  assert.equal(FLOW_GOODS, STORED_GOODS);
  assert.equal(FLOW_MIDS, MID_GOODS);
  assert.deepEqual(cityGame.GOODS, MARKET_GOODS);
  assert.deepEqual(cityGame.CITY_STORE_GOODS, CITY_STORE_GOODS);
  assert.deepEqual(CITY.market.sell, Object.fromEntries(MARKET_GOODS.map((g) => [g, GOODS[g].sell])));
  assert.deepEqual(CITY.market.buy, Object.fromEntries(MARKET_GOODS.map((g) => [g, GOODS[g].buy])));
});

test('Warenregister: die Stadt hat für jede Ware Lager und Zahlen (Stadtlager-Feld, cap/inp/gross)', () => {
  const g = new Game({ seed: 3, city: true });
  for (let t = 0; t < 40; t++) g.update(0.05);
  const c = g.city[0];
  for (const w of CITY_STORE_GOODS) assert.ok(num(c[w]), `Stadtlager c.${w} fehlt (createCity)`);
  for (const w of Object.keys(GOODS)) {
    for (const f of ['cap', 'inp', 'gross']) assert.ok(num(c.stats[f][w]), `c.stats.${f}.${w}`);
    assert.ok(num(c.stats[w]), `c.stats.${w}`);
  }
});

test('Schichten (A-02): Register ohne Imports, Stadtkarte der Darstellung liest nicht aus der UI', () => {
  for (const f of ['citykinds.js', 'goods.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../js/data/${f}`, import.meta.url), 'utf8'), /^import /m, `js/data/${f} importiert nichts`);
  }
  assert.doesNotMatch(readFileSync(new URL('../js/render/citylayer.js', import.meta.url), 'utf8'), /from '\.\.\/ui\//, 'citylayer.js importiert aus js/ui');
});
