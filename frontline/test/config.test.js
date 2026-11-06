// Prüft die Config in js/data/ auf Tippfehler und Widersprüche (läuft in Sekunden: `npm run test:quick`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BALANCE, QUICK } from '../js/data/balance.js';
import { RESEARCH } from '../js/data/research.js';
import { UNITS } from '../js/data/units.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { MIX } from '../js/data/ai.js';
import * as AI_DATA from '../js/data/ai.js';
import { MAPGEN } from '../js/data/mapgen.js';
import { WEATHER_SETTINGS } from '../js/game/weather.js';
import { CITY } from '../js/data/city.js';
import { KIND_ID, KIND_NAME, WORKS, GOODS } from '../js/game/city.js';

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
    fobStartStock: BALANCE.fob.startStock, storeCap: BALANCE.logistics.storeCap, capitalCap: BALANCE.logistics.capitalCap, truckLoad: BALANCE.logistics.truckCapacity,
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
      for (const [c, v] of Object.entries(w.damage)) assert.ok(['inf', 'light', 'heavy', 'struct', 'air', 'jet'].includes(c) && v >= 0, `UNITS.${k} Waffe ${w.id}.damage.${c}`);
    }
  }
});

test('Gebäude: Werte und Kosten', () => {
  for (const [k, b] of Object.entries(BUILDINGS)) {
    for (const f of ['hp', 'w', 'h', 'buildTime']) assert.ok(positive(b[f]), `BUILDINGS.${k}.${f} = ${b[f]}`);
    for (const [r, v] of Object.entries(b.cost)) assert.ok(RES.includes(r) && v >= 0, `BUILDINGS.${k}.cost.${r}`);
    assert.ok(Array.isArray(b.produces), `BUILDINGS.${k}.produces fehlt (die Simulation liest es ohne Ersatzwert)`);
    for (const t of b.produces) assert.ok(UNITS[t], `BUILDINGS.${k}.produces: unbekannte Einheit '${t}'`);
  }
});

test('Tasten doppeln sich nicht', () => {
  const unitKeys = BUILDINGS.fob.produces.map((t) => UNITS[t].hotkey);
  assert.equal(new Set(unitKeys).size, unitKeys.length, `Ausbildungstasten der Hauptstadt doppelt: ${unitKeys.join(' ')}`);
  const bldKeys = Object.values(BUILDINGS).map((b) => b.hotkey).filter(Boolean);
  assert.equal(new Set(bldKeys).size, bldKeys.length, `Baumenü-Tasten doppelt: ${bldKeys.join(' ')}`);
  // Stadt-Ausbilder (Kaserne, Fabrikhalle, Heliport, Stellplatz): je Befehlskarte jede Taste einmal
  for (const [k, list] of Object.entries(CITY.produces)) {
    const keys = list.map((t) => UNITS[t]?.hotkey);
    assert.ok(keys.every(Boolean), `CITY.produces.${k}: Einheit ohne Taste`);
    assert.equal(new Set(keys).size, keys.length, `Ausbildungstasten ${k} doppelt: ${keys.join(' ')}`);
  }
  for (const r of Object.values(BUILDINGS.tower.roofs ?? {})) assert.ok(r.hotkey, `Dachaufbau ${r.name}: Taste fehlt`);
  const roofKeys = Object.values(BUILDINGS.tower.roofs ?? {}).map((r) => r.hotkey);
  assert.equal(new Set(roofKeys).size, roofKeys.length, `Dachaufbau-Tasten doppelt: ${roofKeys.join(' ')}`);
});

// Feste Tasten (js/ui/input.js, vor der Befehlskarte abgefangen): J Bauer, H Hauptstadt, V Ansicht, Y Stadt-Baumodus,
// P Pause, M Geld (Debug). Eine Befehlskarten-Taste mit einem dieser Buchstaben ist nie erreichbar.
const FIXED_KEYS = ['J', 'H', 'V', 'Y', 'P', 'M'];
test('Befehlskarten-Tasten liegen nicht auf festen Tasten', { todo: 'Turm V, Flak J, Gepard P sind heute unerreichbar (Befund T-09)' }, () => {
  const used = [
    ...Object.entries(UNITS).map(([k, u]) => [`UNITS.${k}`, u.hotkey]),
    ...Object.entries(BUILDINGS).map(([k, b]) => [`BUILDINGS.${k}`, b.hotkey]),
    ...Object.entries(BUILDINGS.tower.roofs ?? {}).map(([k, r]) => [`BUILDINGS.tower.roofs.${k}`, r.hotkey]),
  ];
  const clash = used.filter(([, key]) => FIXED_KEYS.includes(key)).map(([w, key]) => `${w} (${key})`);
  assert.deepEqual(clash, [], `auf festen Tasten: ${clash.join(', ')}`);
});

test('Startarmee, Nachschub und Einheitenlimit passen zusammen', () => {
  for (const t of BALANCE.startUnits) assert.ok(UNITS[t], `startUnits: unbekannte Einheit '${t}'`);
  assert.ok(UNITS[BALANCE.reinforce.unit], 'reinforce.unit');
  const slots = BALANCE.startUnits.reduce((s, t) => s + (UNITS[t].slots ?? 1), 0);
  assert.ok(slots <= BALANCE.slotCap, `Startarmee braucht ${slots} Plätze, Limit ${BALANCE.slotCap}`);
});

test('Forschung, Schwierigkeit, KI-Mischung und Startmenü', () => {
  // Forschungsbaum (js/data/research.js): je Ast eine Forschung je Stufe, nur bekannte Gruppen, Werte und Fähigkeiten
  const GROUPS = new Set([...Object.values(RESEARCH.groups).flat(), 'veh', 'air', 'all', 'bld']); // eine Einheit kann mehreren Gruppen angehören (Gepard)
  const STATS = new Set(['range', 'sight', 'dmg', 'dmgInf', 'dmgVeh', 'dmgAir', 'rof', 'armor', 'speed', 'fuel', 'acc', 'evade', 'regen', 'rearm', 'build', 'repair', 'abilityCd']);
  for (const t of Object.keys(RESEARCH.groups)) assert.ok(UNITS[t], `research.groups: unbekannte Einheit '${t}'`);
  assert.equal(RESEARCH.money.length, RESEARCH.tiers);
  assert.equal(RESEARCH.time.length, RESEARCH.tiers);
  assert.ok(Object.keys(RESEARCH.lanes).length >= RESEARCH.perTier, 'genug Äste, um jede Stufe zu öffnen');
  for (const [lane, L] of Object.entries(RESEARCH.lanes)) {
    assert.equal(L.items.length, RESEARCH.tiers, `Ast ${lane}: ${L.items.length} statt ${RESEARCH.tiers} Forschungen`);
    for (const it of L.items) {
      assert.ok(it.name && it.short, `${lane}: Name und Kurzname`);
      assert.ok(Object.keys(it.fx).length || it.unlock, `${it.name}: ohne Wirkung`);
      if (it.unlock) assert.ok(['smoke', 'mines', 'autoturret'].includes(it.unlock), `${it.name}: unlock ${it.unlock}`);
      for (const [g, st] of Object.entries(it.fx)) {
        assert.ok(GROUPS.has(g), `${it.name}: Gruppe ${g}`);
        for (const [k, v] of Object.entries(st)) assert.ok(STATS.has(k) && Number.isFinite(v) && v > 0, `${it.name}: ${g}.${k} = ${v}`);
      }
    }
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

test('Stadt (v5.20): Zellenarten stabil, Hütte und Kerosin-Raffinerie vollständig, Ketten und Märkte passen', () => {
  // IDs bestehender Zellenarten bleiben (Speicherstände); neue Arten stehen hinten
  assert.equal(KIND_ID.road, 1);
  assert.equal(KIND_ID.airport, 17, 'Flughafen bleibt Nummer 17');
  assert.equal(KIND_ID.smelter, 18, 'Hütte hinten angehängt');
  assert.equal(KIND_ID.kero, 19, 'Kerosin-Raffinerie hinten angehängt');
  for (const k of ['smelter', 'kero']) {
    assert.ok(KIND_NAME[k], `KIND_NAME.${k} fehlt`);
    assert.ok(CITY.size[k] >= 2, `CITY.size.${k} (Werke sind 2 × 2)`);
    assert.ok(CITY.cost[k] > 0, `CITY.cost.${k}`);
    assert.ok(CITY.power.use[k] > 0, `CITY.power.use.${k}`);
    assert.ok(WORKS.includes(k), `${k} gehört zu WORKS`);
  }
  for (const w of WORKS) assert.ok(CITY.yield[CITY.chain[w].to] > 0, `Werk ${w}: keine Ausbeute für ${CITY.chain[w].to}`);
  for (const g of ['iron', 'kero']) assert.ok(CITY.yield[g] > 0 && CITY.convert[g] > 0, `yield/convert ${g}`);
  assert.ok(CITY.startKero >= 0 && Number.isFinite(CITY.startKero), 'startKero');
  for (const g of GOODS) assert.ok(CITY.market.sell[g] > 0 && CITY.market.buy[g] > 0, `Markt: Preis für ${g} fehlt`);
  assert.ok(CITY.ai.lowKero > 0, 'ai.lowKero');
  const t = CITY.transport;
  for (const f of ['cap', 'mapCap', 'commute', 'maxDist', 'smooth']) assert.ok(positive(t[f]), `CITY.transport.${f}`);
});

// Tote Datenschlüssel (seit v5.55, Befunde K-04, U-03): jeder Schlüssel in js/data/ muss als Name irgendwo im Code außerhalb von
// js/data/ vorkommen. Grob (ein gleichnamiges Wort anderswo genügt; `BALANCE.jets.rearm` rutscht so durch), findet aber Schlüssel,
// die niemand mehr liest. Verzeichnisse mit erzeugten Schlüsseln (Forschungen je Ast) sind ausgenommen. UNUSED listet die heute
// bekannten toten Schlüssel; wer einen löscht oder wieder liest, streicht ihn hier (der Test meldet das).
const UNUSED = ['BALANCE.logistics.noFobWarn', 'CITY.care.refuel', 'CITY.air.atcSight', 'UNITS.rifleman.producedAt'];
const SKIP = new Set(['RESEARCH.items', 'RESEARCH.lanes']);
test('Datenschlüssel: jeder wird im Code gelesen (außer der Liste bekannter toter Schlüssel)', () => {
  const root = fileURLToPath(new URL('../js/', import.meta.url));
  const files = readdirSync(root, { recursive: true }).filter((f) => f.endsWith('.js') && !f.startsWith('data'));
  const src = files.map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
  const dead = [];
  const seen = new Set();
  const walk = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      const p = `${path}.${k}`;
      if (SKIP.has(p)) continue;
      if (/^[A-Za-z_$][\w$]*$/.test(k) && !seen.has(k)) {
        seen.add(k);
        if (!new RegExp(`\\b${k.replace(/\$/g, '\\$')}\\b`).test(src)) dead.push(p);
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p);
    }
  };
  for (const [name, obj] of Object.entries({ BALANCE, CITY, MAPGEN, RESEARCH, UNITS, BUILDINGS })) walk(obj, name);
  for (const k of Object.keys(AI_DATA)) if (!new RegExp(`\\b${k}\\b`).test(src)) dead.push(`ai.${k}`);
  assert.deepEqual(dead.filter((p) => !UNUSED.includes(p)), [], 'Schlüssel, die kein Code liest: löschen oder lesen');
  assert.deepEqual(UNUSED.filter((p) => !dead.includes(p)), [], 'wird jetzt gelesen oder ist gelöscht: aus UNUSED streichen');
});
