// Prüft die Config in js/data/ auf Tippfehler und Widersprüche (läuft in Sekunden: `npm run test:quick`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE, QUICK } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { MIX } from '../js/data/ai.js';
import { MAPGEN } from '../js/data/mapgen.js';
import { WEATHER_SETTINGS } from '../js/game/weather.js';

const RES = Object.keys(BALANCE.resNames);
const positive = (v) => typeof v === 'number' && v > 0;

test('keine NaN- oder undefined-Werte in BALANCE und QUICK', () => {
  const walk = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      const p = `${path}.${k}`;
      assert.ok(v !== undefined && !Number.isNaN(v), `${p} ist ${v}`);
      if (v && typeof v === 'object') walk(v, p);
    }
  };
  walk(BALANCE, 'BALANCE');
  walk(QUICK, 'QUICK');
  walk(MAPGEN, 'MAPGEN');
});

test('BALANCE liest die Schnelleinstellungen', () => {
  const links = {
    unitLimit: BALANCE.slotCap, startMoney: BALANCE.startRes.money, walletMax: BALANCE.walletMax,
    moneyPerUnitZone: BALANCE.zone.unitIncome, moneyPerUnitHot: BALANCE.hot.unitIncome, moneyPerCrate: BALANCE.crates.income,
    winPoints: BALANCE.winPoints, pointEvery: BALANCE.pointInterval, radioHold: BALANCE.radio.hold, maxFobs: BALANCE.fob.max,
    fobMaterial: BALANCE.construction.fobMaterial, storeCap: BALANCE.logistics.storeCap, truckLoad: BALANCE.logistics.truckCapacity,
    trainSlots: BALANCE.trainSlots, queueMax: BALANCE.queueMax, reinforceEvery: BALANCE.reinforce.interval, startUnits: BALANCE.startUnits,
  };
  assert.deepEqual(Object.keys(links).sort(), Object.keys(QUICK).sort(), 'jeder QUICK-Wert braucht hier eine Zeile');
  for (const [k, v] of Object.entries(links)) assert.equal(v, QUICK[k], `QUICK.${k}`);
});

test('Einheiten: Werte, Kosten, Waffen', () => {
  for (const [k, u] of Object.entries(UNITS)) {
    for (const f of ['hp', 'speed', 'sight', 'buildTime', 'radius']) assert.ok(positive(u[f]), `UNITS.${k}.${f} = ${u[f]}`);
    for (const [r, v] of Object.entries(u.cost)) assert.ok(RES.includes(r) && v >= 0, `UNITS.${k}.cost.${r}`);
    assert.ok(u.slots === undefined || u.slots >= 0, `UNITS.${k}.slots`);
    assert.ok(typeof u.short === 'string' && u.short, `UNITS.${k}.short fehlt (Kurzname)`);
    for (const w of u.weapons ?? []) {
      for (const f of ['range', 'cooldown', 'rounds']) assert.ok(positive(w[f]), `UNITS.${k} Waffe ${w.id}.${f} = ${w[f]}`);
      for (const [c, v] of Object.entries(w.damage)) assert.ok(['inf', 'light', 'heavy', 'struct', 'air'].includes(c) && v >= 0, `UNITS.${k} Waffe ${w.id}.damage.${c}`);
    }
  }
});

test('Gebäude: Werte und Kosten', () => {
  for (const [k, b] of Object.entries(BUILDINGS)) {
    for (const f of ['hp', 'w', 'h', 'buildTime']) assert.ok(positive(b[f]), `BUILDINGS.${k}.${f} = ${b[f]}`);
    for (const [r, v] of Object.entries(b.cost)) assert.ok(RES.includes(r) && v >= 0, `BUILDINGS.${k}.cost.${r}`);
    for (const t of b.produces ?? []) assert.ok(UNITS[t], `BUILDINGS.${k}.produces: unbekannte Einheit '${t}'`);
  }
});

test('Tasten doppeln sich nicht', () => {
  const unitKeys = BUILDINGS.fob.produces.map((t) => UNITS[t].hotkey);
  assert.equal(new Set(unitKeys).size, unitKeys.length, `Ausbildungstasten der Haupt-FOB doppelt: ${unitKeys.join(' ')}`);
  const bldKeys = Object.values(BUILDINGS).map((b) => b.hotkey).filter(Boolean);
  assert.equal(new Set(bldKeys).size, bldKeys.length, `Baumenü-Tasten doppelt: ${bldKeys.join(' ')}`);
});

test('Startarmee, Nachschub und Einheitenlimit passen zusammen', () => {
  for (const t of BALANCE.startUnits) assert.ok(UNITS[t], `startUnits: unbekannte Einheit '${t}'`);
  assert.ok(UNITS[BALANCE.reinforce.unit], 'reinforce.unit');
  const slots = BALANCE.startUnits.reduce((s, t) => s + (UNITS[t].slots ?? 1), 0);
  assert.ok(slots <= BALANCE.slotCap, `Startarmee braucht ${slots} Plätze, Limit ${BALANCE.slotCap}`);
});

test('Forschung, Schwierigkeit, KI-Mischung und Startmenü', () => {
  const tiers = Math.max(...Object.values(BALANCE.research.items).map((i) => i.tier ?? 1));
  for (const [t, tier] of Object.entries(BALANCE.research.unitTier)) {
    assert.ok(UNITS[t], `research.unitTier: unbekannte Einheit '${t}'`);
    assert.ok(tier >= 1 && tier <= tiers, `research.unitTier.${t} = ${tier}`);
  }
  const keys = Object.keys(BALANCE.difficulty.normal).sort();
  for (const [d, cfg] of Object.entries(BALANCE.difficulty)) {
    assert.deepEqual(Object.keys(cfg).sort(), keys, `difficulty.${d} hat andere Felder als normal`);
    assert.ok(cfg.fobCap <= BALANCE.fob.max, `difficulty.${d}.fobCap > fob.max`);
  }
  for (const t of Object.keys(MIX)) assert.ok(UNITS[t], `MIX (js/data/ai.js): unbekannte Einheit '${t}'`);
  assert.ok(Math.abs(Object.values(MIX).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'MIX muss zusammen 1 ergeben');
  const m = BALANCE.menuDefaults;
  assert.ok(BALANCE.difficulty[m.difficulty], `menuDefaults.difficulty = ${m.difficulty}`);
  assert.ok(WEATHER_SETTINGS.includes(m.weather), `menuDefaults.weather = ${m.weather}`);
});
