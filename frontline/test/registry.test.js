// Register der Stadtzellenarten (seit v5.55, Review-Paket P2, Befunde T-09, Q-10): jede Art ist vollständig eingetragen.
// Fehlt ein Eintrag, rechnet das Spiel heute still mit einem Ersatzwert weiter (`?? 0`, `?? 1`) oder die Kasse wird NaN.
// Neue Zellenart: KINDS hinten anhängen (IDs stehen in Spielständen) und alle hier geprüften Tabellen füllen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, KIND_ID, KIND_NAME, isFlat } from '../js/game/city.js';
import { CITY } from '../js/data/city.js';
import { CITY_COLORS, CITY_ICON, TOOL_GROUPS } from '../js/ui/citypanel.js';

const LIVE = KINDS.filter((k) => !CITY.retired?.includes(k)); // baubare Arten
const flat = (k) => isFlat(KIND_ID[k]); // Straße, Bahn, Rollfeld: kein Gebäude, kein Ziel, kein Strom
const num = (v) => typeof v === 'number' && Number.isFinite(v);

test('KINDS: Reihenfolge festgeschrieben (Zell-IDs im Spielstand), neue Arten nur hinten', () => {
  assert.deepEqual(KINDS, [
    'road', 'res', 'com', 'bm', 'mun', 'fuel', 'steel', 'mine', 'market', 'power', 'uni', 'dc', 'barracks', 'factory', 'heliport',
    'hospital', 'airport', 'smelter', 'kero', 'runway', 'stand', 'atc', 'ktank', 'mdepot', 'taxi',
  ]);
  for (const k of CITY.retired ?? []) assert.ok(KINDS.includes(k), `CITY.retired: unbekannte Art ${k}`);
});

test('Jede Zellenart: Name; jede baubare: Preis, Baumaterial, Größe, Strom', () => {
  for (const k of KINDS) assert.ok(typeof KIND_NAME[k] === 'string' && KIND_NAME[k], `KIND_NAME.${k} fehlt`);
  for (const k of LIVE) {
    assert.ok(num(CITY.cost[k]) && CITY.cost[k] >= 0, `CITY.cost.${k} = ${CITY.cost[k]} (fehlt: Kasse wird NaN, Q-10)`);
    const bm = CITY.costBm[k];
    assert.ok(bm === undefined || (num(bm) && bm >= 0), `CITY.costBm.${k} = ${bm}`);
    const sz = CITY.size[k];
    assert.ok(sz === undefined || (Number.isInteger(sz) && sz >= 1), `CITY.size.${k} = ${sz}`);
    if (flat(k)) continue;
    assert.ok(num(CITY.power.use[k]) && CITY.power.use[k] >= 0, `CITY.power.use.${k} = ${CITY.power.use[k]} (fehlt: still 0)`);
  }
  for (const tab of ['cost', 'costBm', 'size']) {
    for (const k of Object.keys(CITY[tab])) assert.ok(KINDS.includes(k), `CITY.${tab}.${k}: unbekannte Zellenart`);
  }
  for (const k of Object.keys(CITY.power.use)) assert.ok(KINDS.includes(k), `CITY.power.use.${k}: unbekannte Zellenart`);
  for (const k of Object.keys(CITY.ai.targetValue)) assert.ok(KINDS.includes(k), `CITY.ai.targetValue.${k}: unbekannte Zellenart`);
});

test('Nicht mehr baubare Arten (CITY.retired) sind nur Platzhalter: keine Daten, kein Werkzeug, Bauen wird abgelehnt (seit v5.56)', () => {
  const tabs = { cost: CITY.cost, costBm: CITY.costBm, size: CITY.size, 'power.use': CITY.power.use, 'ai.targetValue': CITY.ai.targetValue, CITY_COLORS, CITY_ICON };
  for (const k of CITY.retired ?? []) {
    for (const [name, tab] of Object.entries(tabs)) assert.ok(!(k in tab), `${name}.${k}: Altlast der nicht mehr baubaren Art`);
    assert.ok(!TOOL_GROUPS.some(([, ks]) => ks.includes(k)), `${k} im Baumenü`);
  }
});

test('Jede baubare Zellenart: Farbe, Symbol und Werkzeug in einer benannten Gruppe des Baumenüs', () => {
  const grouped = new Map();
  for (const [name, ks] of TOOL_GROUPS) for (const k of ks) grouped.set(k, name);
  for (const k of LIVE) {
    assert.match(CITY_COLORS[k] ?? '', /^#[0-9a-f]{6}$/i, `CITY_COLORS.${k} fehlt`);
    assert.ok(CITY_ICON[k], `CITY_ICON.${k} fehlt`);
    assert.ok(grouped.has(k), `${k}: kein Werkzeug im Baumenü`);
    assert.notEqual(grouped.get(k), 'Weitere', `${k}: nur unter „Weitere“ (Gruppe in citypanel.js GROUPS eintragen)`);
  }
});

// Bekannte Lücke (P2): Hütte und Kerosin-Raffinerie haben keinen Zielwert, die KI rechnet mit 1. Nachtragen ändert das KI-Verhalten
// (Referenzwerte in test/golden.test.js neu setzen); dann `todo` entfernen.
test('Jede Zellenart mit Gebäude: Zielwert der KI (CITY.ai.targetValue)', { todo: 'smelter und kero fehlen (Befund Q-10)' }, () => {
  const miss = LIVE.filter((k) => !flat(k) && !num(CITY.ai.targetValue[k]));
  assert.deepEqual(miss, [], `ohne Zielwert (KI rechnet still mit 1): ${miss.join(', ')}`);
});
