// Referenzwerte je Seed (seit v5.55, Review-Paket P2): Prüfsummen der Zufallskarte, des Startzustands und eines kurzen
// Laufs KI gegen KI. Sie belegen, dass ein reiner Umbau (ohne gewollte Regeländerung) jede Partie bitgleich lässt
// (CLAUDE.md Regel 4: gleicher Seed = gleiche Partie, Zufallskarten ohne Fluss je Seed unverändert).
//
// Was geprüft wird (je Seed in SEEDS):
//   map    Karte ohne Fluss (generateMap(seed)): alle Felder des Kartenobjekts. Regel 4, ändert sich praktisch nie.
//   river  Karte mit Fluss (generateMap(seed, { river: true })).
//   start  Startzustand einer Partie mit allen Menü-Schaltern an (Stadt, Fluss, Wetter, Forschung, Sendemast).
//   play   KI gegen KI (normal) mit allen Schaltern, Prüfsumme alle 30 s bis PLAY_S. Eine Abweichung zeigt den Zeitpunkt.
//   classic  KI gegen KI ohne Schalter (wie die meisten Tests), Prüfsumme alle 30 s bis CLASSIC_S.
// Die Zustandssumme (stateDigest) liest nur sichtbare Spielgrößen (Einheiten, Gebäude, Kassen, Lager, Punkte, Zone, Stadtzellen,
// Zufallszustände), nicht die Form der Objekte: Umbenennen innerer Felder oder ein anderes Speicherformat ändert sie nicht.
//
// Neu setzen (nur bei GEWOLLTER Regel- oder Kartenänderung, z. B. Balance-Wert, KI-Verhalten, P8 Wegsuche):
//   1. GOLDEN=print node --test test/golden.test.js
//      Die Tests laufen dann ohne Vergleich und drucken am Ende je Seed eine fertige Zeile `N: { … },` (der Testläufer
//      setzt `# ` davor; das gehört nicht dazu).
//   2. Die Zeilen in GOLDEN unten ersetzen, im Commit sagen, welche Änderung die Werte verschiebt (PRD-Änderungsverlauf).
//   3. Normal laufen lassen: node --test test/golden.test.js (grün).
// Bei einem Umbau, der bitgleich sein soll, NIE neu setzen: eine rote Prüfsumme heißt, der Umbau verändert Partien.
// Laufzeit: 1 bis 3 s je Test, zusammen etwa 17 s (die Datei läuft in `npm test` parallel zu den anderen).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game } from '../js/game/game.js';
import { AI } from '../js/ai/ai.js';
import { generateMap } from '../js/game/map.js';

const PRINT = process.env.GOLDEN === 'print';
const SEEDS = [2, 3, 7];
const DT = 0.05;
const EVERY_S = 30; // Abstand der Prüfsummen im Lauf
const PLAY_S = 120; // Länge des Laufs mit allen Schaltern (vorher sind beide Seiten noch symmetrisch)
const CLASSIC_S = 90; // Länge des Laufs ohne Schalter
const FULL = { radio: true, weather: 'random', research: true, river: true, city: true }; // wie BALANCE.menuDefaults

// prettier-ignore
// Läufe (play, classic) neu gesetzt mit v5.61 (Review-Paket P8: Wegsuche mit Budget je Schritt, unerreichbare Ziele, lange Suchen)
const GOLDEN = {
  2: { map: '894406ba81d0', river: '533ace5a08d3', start: 'fc78e7cb5f07', play: ['21dc17cae294', '277d27b6d612', 'f41f9554aa6a', '1e6b853c8359'], classic: ['2b0f48fe33fb', '8a0d3652576d', '465ae644cc14'] },
  3: { map: 'b8095c497a39', river: 'de3f5da9bcba', start: '90317789c157', play: ['bde6054c6a1e', 'ccc11a79796e', '48435843e2c6', 'a9b0534cd10f'], classic: ['91c9dd9be085', 'e8b23ba52bdb', '40177845e99c'] },
  7: { map: 'e6c2e69a3dc6', river: 'b5fa8dc32b8a', start: '286eed3aa049', play: ['9a7be73df429', '5987db98bb1d', 'b96be89c56e8', '515d53e91503'], classic: ['685abb899b04', '3789a63a5cee', 'e3a5523fb231'] },
};

/** Prüfsumme (12 Hex-Zeichen) über einen Wert: Zahlen exakt (String), Typed Arrays als Bytes, Objekte mit sortierten Schlüsseln. */
function digest(value) {
  const h = createHash('sha1');
  const seen = new WeakSet();
  const feed = (v) => {
    if (v === null || v === undefined) return h.update(`${v};`);
    const t = typeof v;
    if (t === 'number' || t === 'boolean' || t === 'bigint') return h.update(`${Object.is(v, -0) ? '-0' : String(v)};`);
    if (t === 'string') return h.update(`s${v.length}:${v};`);
    if (t === 'function' || t === 'symbol') return;
    if (seen.has(v)) return h.update('@;');
    seen.add(v);
    if (ArrayBuffer.isView(v)) {
      h.update(`${v.constructor.name}${v.length}:`);
      return h.update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    }
    if (Array.isArray(v)) {
      h.update(`[${v.length}`);
      v.forEach(feed);
      return h.update(']');
    }
    if (v instanceof Map) return feed([...v.entries()]);
    if (v instanceof Set) return feed([...v]);
    h.update('{');
    for (const k of Object.keys(v).sort()) {
      h.update(`${k}=`);
      feed(v[k]);
    }
    return h.update('}');
  };
  feed(value);
  return h.digest('hex').slice(0, 12);
}

const RES = ['money', 'bm', 'mun', 'fuel'];

/** Sichtbare Spielgrößen eines Zustands (siehe Kopf); `ais` optional (Zufallszustand der KI). */
function stateDigest(game, ais = []) {
  const units = game.units.map((u) => [u.id, u.type, u.team, u.x, u.y, u.hp, u.alive, u.fuel, u.ammo, u.order?.type, u.cargo, u.house, u.crate]);
  const blds = game.buildings.map((b) => [b.id, b.type, b.team, b.x, b.y, b.hp, b.alive, b.built, b.store ?? null]);
  const teams = game.teams.map((t) => [RES.map((r) => t.res[r]), t.points, t.pointProgress]);
  const city = (game.city ?? []).map((c) => [c.kind, c.level, c.part, c.timer, c.flee, c.claim, c.popF, c.drafted, c.metal, c.kero]);
  return digest({
    time: game.time,
    nextId: game.nextId,
    rng: game.rng.getState(),
    ai: ais.map((a) => a.rng.getState()),
    winner: game.winner,
    zone: [game.zone.owner, game.zone.contested, game.zone.counts],
    units,
    blds,
    teams,
    city,
  });
}

/** KI gegen KI über `seconds`; Prüfsumme alle EVERY_S Sekunden. */
function play(seed, opts, seconds) {
  const game = new Game({ seed, ...opts });
  const ais = [new AI(game, 0, 'normal'), new AI(game, 1, 'normal')];
  const out = [];
  const per = Math.round(EVERY_S / DT);
  for (let i = 1; i <= Math.round(seconds / DT); i++) {
    ais[0].update(DT);
    ais[1].update(DT);
    game.update(DT);
    if (i % per === 0) out.push(stateDigest(game, ais));
  }
  return out;
}

const found = {}; // nur für GOLDEN=print
function check(seed, key, actual) {
  if (PRINT) {
    (found[seed] ??= {})[key] = actual;
    return;
  }
  const want = GOLDEN[seed]?.[key];
  assert.ok(want !== undefined, `Seed ${seed}: kein Referenzwert für ${key} (GOLDEN=print, siehe Kopf)`);
  if (Array.isArray(want)) {
    const at = want.findIndex((w, k) => w !== actual[k]);
    assert.ok(at < 0, `Seed ${seed} ${key}: weicht ab ${at * EVERY_S}–${(at + 1) * EVERY_S} s Spielzeit (${actual[at]} statt ${want[at]})`);
  }
  assert.deepEqual(actual, want, `Seed ${seed} ${key}`);
}

for (const seed of SEEDS) {
  test(`Referenzwerte Seed ${seed}: Karte ohne und mit Fluss, Startzustand mit allen Schaltern`, () => {
    check(seed, 'map', digest(generateMap(seed)));
    check(seed, 'river', digest(generateMap(seed, { river: true })));
    check(seed, 'start', stateDigest(new Game({ seed, ...FULL })));
  });
  test(`Referenzwerte Seed ${seed}: KI gegen KI ${PLAY_S} s mit allen Schaltern`, () => {
    check(seed, 'play', play(seed, FULL, PLAY_S));
  });
  test(`Referenzwerte Seed ${seed}: KI gegen KI ${CLASSIC_S} s ohne Schalter`, () => {
    check(seed, 'classic', play(seed, {}, CLASSIC_S));
  });
}

if (PRINT) {
  after(() => {
    const q = (v) => (Array.isArray(v) ? `[${v.map((s) => `'${s}'`).join(', ')}]` : `'${v}'`);
    const lines = Object.entries(found).map(([s, o]) => `  ${s}: { ${Object.entries(o).map(([k, v]) => `${k}: ${q(v)}`).join(', ')} },`);
    console.log(`\n// --- neue Referenzwerte für GOLDEN in test/golden.test.js ---\n${lines.join('\n')}\n`);
  });
}
