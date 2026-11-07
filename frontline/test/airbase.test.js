// v5.35: Fliegerhorst aus Bausteinen (Start-/Landebahn, Stellplätze, Tower, Kerosintank, Munitionslager) und der Bagger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { canZone, roadAt } from '../js/game/city/cells.js';
import { KINDS, KIND_ID } from '../js/data/citykinds.js';
import { connectRoad } from '../js/game/city/roadnet.js';
import { isFoe } from '../js/game/entities.js';
import { standsOf, freeSpace, runwaysOf, standRoute, jetGrounded, parkedArmor, runwayBusy } from '../js/game/aircraft.js';
import { MAP_ROAD, BRIDGE_ROAD } from '../js/game/roads.js';
import { withValue } from './util.js';
import { supplyOf } from '../js/game/transport.js';
import { AI } from '../js/ai/ai.js';
import { snapshotGame, restoreGame } from '../js/game/savegame.js';
import { pack, unpack } from '../js/core/snapshot.js';

const DT = 0.05;
const run = (g, s) => {
  for (let i = 0; i < s / DT; i++) g.update(DT);
};

/** Reiche Stadt für Team t. */
function rich(g, t = 0) {
  const c = g.city[t];
  const m = g.mainFob(t);
  g.teams[t].res.money = 1e6;
  Object.assign(m.store, { bm: 30000, mun: 30000, fuel: 30000 });
  c.metal = 3000;
  c.popF = 400;
  c.kero = 3000;
  return { c, m };
}

/** Freie Fläche W × H (mit Rand) nächst der Hauptstadt: linke obere Zelle { q, r }. */
function freeArea(g, c, m, W, H) {
  let best = null;
  const mc = Math.floor(m.x / c.cell);
  const mr = Math.floor(m.y / c.cell);
  for (let r = 1; r < c.rows - H - 1; r++) {
    for (let q = 1; q < c.cols - W - 1; q++) {
      const d = Math.abs(q - mc) + Math.abs(r - mr);
      if (best && d >= best.d) continue;
      let ok = true;
      for (let y = r - 1; ok && y <= r + H; y++) {
        for (let x = q - 1; ok && x <= q + W; x++) {
          const j = y * c.cols + x;
          ok = canZone(g, c, j) && !c.kind[j] && !roadAt(c, j) && !c.deposit[j];
        }
      }
      if (ok) best = { q, r, d };
    }
  }
  return best;
}

const kindAt = (c, i) => KINDS[c.kind[i] - 1];

/**
 * Fliegerhorst für Team t: Bahn 10 × 2, darunter Stellplatz, Stellplatz, Tower, Kerosintank, Munitionslager (je 2 × 2).
 * opts.atc / opts.ktank / opts.mdepot = false lassen den Baustein weg. Liefert Bahn, Stellplätze und Lager.
 */
function airbase(g, t = 0, opts = {}) {
  const { c, m } = rich(g, t);
  const a = freeArea(g, c, m, 12, 6);
  assert.ok(a, 'Platz für den Fliegerhorst');
  const { q, r } = a;
  const put = (kind, dq, dr, w = 0, h = 0) => assert.ok(g.issue(t, { type: 'city', kind, c0: q + dq, r0: r + dr, c1: q + dq + w, r1: r + dr + h }).ok, kind);
  put('runway', 0, 0, 9, 1);
  put('stand', 0, 2);
  put('stand', 2, 2);
  if (opts.atc !== false) put('atc', 4, 2);
  if (opts.ktank !== false) put('ktank', 6, 2);
  if (opts.mdepot !== false) put('mdepot', 8, 2);
  // Straßenweg zum Lager ab dem Ende der Bahn (Paket „Straßen“: Stellplätze bilden nur mit Weg aus), kostenlos wie beim Startviertel
  if (opts.link !== false) withValue(CITY.transport, 'connectMax', 400, () => assert.ok(connectRoad(g, c, r * c.cols + q + 9, false) >= 0, 'Weg zum Lager'));
  run(g, CITY.growTime + 1);
  const ents = [...c.ents.entries()].filter(([, e]) => e.alive);
  const of = (k) => ents.filter(([i]) => kindAt(c, i) === k).map(([, e]) => e);
  return { c, m, q, r, stands: of('stand'), atc: of('atc')[0], ktank: of('ktank')[0], mdepot: of('mdepot')[0], rw: runwaysOf(g, t).find((x) => x.valid) };
}

test('Bahn: gültig nur als volles Rechteck 2 Zellen breit und mindestens CITY.air.runwayMin lang; alter Flughafen nicht mehr baubar', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, m } = rich(g);
  const a = freeArea(g, c, m, 12, 6);
  const { q, r } = a;
  assert.ok(g.issue(0, { type: 'city', kind: 'runway', c0: q, r0: r, c1: q + CITY.air.runwayMin - 2, r1: r + 1 }).ok);
  let [rw] = runwaysOf(g, 0);
  assert.equal(rw.valid, false, 'zu kurz');
  assert.match(rw.reason, /zu kurz/);
  assert.ok(g.issue(0, { type: 'city', kind: 'runway', c0: q + CITY.air.runwayMin - 1, r0: r, c1: q + CITY.air.runwayMin - 1, r1: r + 1 }).ok);
  [rw] = runwaysOf(g, 0);
  assert.ok(rw.valid, 'jetzt lang genug');
  assert.equal(rw.axis, 'x');
  assert.equal(rw.len, CITY.air.runwayMin);
  assert.ok(roadAt(c, rw.cells[0]), 'Bahn zählt als Fahrweg');
  const r2 = g.issue(0, { type: 'city', kind: 'airport', c0: q, r0: r + 4, c1: q, r1: r + 4 });
  assert.equal(r2.ok, false, 'Flughafen 10 × 10 gibt es nicht mehr');
});

test('Stellplatz bildet zwei F-16 aus (zwei je Stellplatz), Schutz je Stufe, Kerosintank und Munitionslager füllen sich über die Straße', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, stands, ktank, mdepot, rw } = airbase(g);
  assert.ok(rw, 'gültige Bahn');
  assert.equal(stands.length, 2);
  assert.deepEqual(standsOf(g, 0).map((e) => e.id).sort(), stands.map((e) => e.id).sort());
  const [s] = stands;
  assert.ok(standRoute(g, s), 'Weg vom Stellplatz zur Bahn');
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' }).ok, 'erste F-16');
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' }).ok, 'zweite F-16');
  const r = g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' });
  assert.equal(r.ok, false, 'dritte F-16 abgelehnt');
  assert.match(r.reason, /Stellplatz belegt/);
  const sup = supplyOf(g, c, s.cityCell); // Paket „Straßen“: Tempo nach dem Weg zum Lager (über die Bahn)
  assert.ok(sup.rate > 0, 'Stellplatz über Bahn und Straße versorgt');
  // Tempo = Versorgung × Stau des Wegs; Tank und Lager füllen sich über dieselbe Straße, daher bis höchstens 600 s warten
  for (let k = 0; k < 600 && g.units.filter((x) => x.def.jet).length < 2; k++) run(g, 1);
  const jets = g.units.filter((x) => x.def.jet);
  assert.equal(jets.length, 2, 'zwei F-16 gebaut');
  const [u] = jets.sort((a, b) => a.jet.slot - b.jet.slot);
  assert.ok(jets.every((x) => x.parked && x.jet.home === s.id), 'beide stehen auf ihrem Stellplatz');
  assert.deepEqual([u.x, u.y], [s.x - CITY.air.standSlot * c.cell, s.y], 'linker Platz');
  assert.equal(freeSpace(g, s), 0);
  assert.equal(isFoe(1, u), true, 'abgestellte Jets sind angreifbar');
  for (const lv of [1, 2, 3]) {
    c.level[s.cityCell] = lv;
    assert.equal(parkedArmor(g, u), CITY.air.shelter[lv], `Stufe ${lv}`);
  }
  // Tank und Lager an die Hauptstadt anschließen und füllen lassen
  for (const e of [ktank, mdepot]) connectRoad(g, c, e.cityCell, false);
  const kero0 = c.kero;
  run(g, 20);
  assert.ok(ktank.stock > 0, `Kerosintank gefüllt (${ktank.stock})`);
  assert.ok(mdepot.stock > 0, `Munitionslager gefüllt (${mdepot.stock})`);
  assert.ok(c.kero < kero0, 'Kerosin aus dem Stadtlager');
  assert.ok(ktank.stock <= CITY.air.tank.cap[c.level[ktank.cityCell]]);
  // Tanken auf dem Stellplatz aus dem Kerosintank
  u.fuel = 5;
  const st = ktank.stock;
  run(g, 2);
  assert.ok(u.fuel > 5, 'getankt');
  assert.ok(ktank.stock < st + CITY.air.tank.fill[c.level[ktank.cityCell]] * 2, 'aus dem Tank');
});

test('Ohne Kerosintank: kein Tanken, Mangelmeldung; Stellplatz zerstört → Jet verloren', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g, 0, { ktank: false });
  const [s] = stands;
  const u = g.spawnUnit('f16', 0, s.x, s.y);
  u.parked = true;
  u.jet = { home: s.id, ready: false, phase: 'park', alt: 0 };
  u.fuel = 5;
  g.drainEvents();
  g.teams[0].warnAt = {};
  run(g, 3);
  assert.equal(u.fuel, 5, 'ohne Tank kein Tanken');
  assert.ok(g.drainEvents().some((e) => e.type === 'message' && e.team === 0 && /Kerosin/.test(e.text)), 'Mangelmeldung Kerosin');
  s.hp = 0;
  s.alive = false;
  run(g, 1);
  assert.equal(u.alive, false, 'mit dem Stellplatz verloren');
});

test('Einsatz: rollt zur Bahn, Startlauf auf der Bahn, Raketen, Rückkehr, Landung, Rollen zum Stellplatz, nachtanken', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, stands, ktank, mdepot, rw } = airbase(g);
  ktank.stock = CITY.air.tank.cap[c.level[ktank.cityCell]];
  mdepot.stock = CITY.air.depot.cap[c.level[mdepot.cityCell]];
  const [s] = stands;
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' }).ok);
  run(g, UNITS.f16.buildTime + 1);
  const [u] = g.units.filter((x) => x.def.jet);
  const z = g.zone;
  const heli = g.spawnUnit('gunship', 1, z.x, z.y);
  g.fog[0].revealAll?.();
  assert.ok(g.issue(0, { type: 'attackMove', ids: [u.id], x: z.x, y: z.y }).ok);
  const seen = new Set();
  let rollOn = true;
  for (let t = 0; t < 40 && u.jet.phase !== 'air'; t += DT) {
    g.update(DT);
    seen.add(u.jet.phase);
    if (u.jet.phase !== 'air') assert.ok(jetGrounded(u), 'bis zum Abheben am Boden');
    if (u.jet.phase === 'roll') rollOn &&= Math.abs(u.y - rw.cy) < 2;
  }
  assert.ok(seen.has('taxiOut') && seen.has('roll'), `rollt und startet (${[...seen]})`);
  assert.ok(rollOn, 'Startlauf auf der Mittellinie der Bahn');
  assert.equal(u.jet.phase, 'air');
  for (let t = 0; t < 120 && heli.alive; t++) {
    run(g, 1);
    g.fog[0].revealAll?.();
  }
  assert.equal(heli.alive, false, 'Hubschrauber abgeschossen');
  // zurück: Landebefehl auf den Stellplatz
  assert.ok(g.issue(0, { type: 'land', ids: [u.id], airportId: s.id }).ok);
  const phases = [];
  let touch = null;
  for (let t = 0; t < 180 && !u.parked; t += DT) {
    g.update(DT);
    if (phases.at(-1) !== u.jet.phase) phases.push(u.jet.phase);
    if (u.jet.phase === 'rollout' && !touch) touch = { x: u.x, y: u.y };
  }
  assert.ok(u.parked, `gelandet (${phases})`);
  assert.deepEqual(phases.slice(-3), ['rollout', 'taxiIn', 'park'], 'ausrollen, zum Stellplatz rollen');
  assert.ok(Math.abs(touch.y - rw.cy) < 30, 'setzt auf der Bahn auf');
  assert.deepEqual([u.x, u.y], [s.x - CITY.air.standSlot * c.cell, s.y], 'wieder auf seinem Platz');
  for (let t = 0; t < 120 && !u.jet.ready; t++) run(g, 1);
  assert.ok(u.jet.ready && u.weapons[0].rounds === 2, 'wieder startbereit');
});

test('Zwei F-16 nie zugleich im Startlauf; der Tower verkürzt die Sperrzeit der Bahn', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands, rw } = airbase(g);
  assert.ok(rw.atc, 'Tower in Reichweite');
  const jets = stands.map((s) => {
    const u = g.spawnUnit('f16', 0, s.x, s.y);
    u.parked = true;
    u.jet = { home: s.id, ready: true, phase: 'park', alt: 0 };
    return u;
  });
  assert.ok(g.issue(0, { type: 'move', ids: jets.map((u) => u.id), x: g.zone.x, y: g.zone.y }).ok);
  let both = false;
  let maxBusy = 0;
  for (let t = 0; t < 60 && !jets.every((u) => u.jet.phase === 'air'); t += DT) {
    g.update(DT);
    if (jets.every((u) => u.jet.phase === 'roll')) both = true;
    maxBusy = Math.max(maxBusy, runwayBusy(g, 0, rw));
  }
  assert.equal(both, false, 'nie zwei zugleich im Startlauf');
  assert.ok(jets.every((u) => u.jet.phase === 'air'), 'beide gestartet');
  assert.ok(maxBusy <= CITY.air.sepAtc + 1e-6, `Sperrzeit mit Tower (${maxBusy})`);
});

test('Bagger: räumt eine Zonenstraße (nicht die Brücke), reißt ein eigenes Gebäude ab; Gegner langsam per Schaufel', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, m } = rich(g);
  const R = g.roads;
  // Zonenstraße nächst der Hauptstadt
  let i = -1;
  let bd = Infinity;
  for (let k = 0; k < R.kind.length; k++) {
    if (R.kind[k] !== MAP_ROAD) continue;
    const d = Math.hypot(((k % R.cols) + 0.5) * R.cell - m.x, (Math.floor(k / R.cols) + 0.5) * R.cell - m.y);
    if (d < bd) {
      bd = d;
      i = k;
    }
  }
  assert.ok(i >= 0, 'Zonenstraße da');
  const x = ((i % R.cols) + 0.5) * R.cell;
  const y = (Math.floor(i / R.cols) + 0.5) * R.cell;
  const u = g.spawnUnit('excavator', 0, x + 40, y);
  assert.ok(u.def.digger);
  const q = i % R.cols;
  const r = Math.floor(i / R.cols);
  const ver = c.ver;
  assert.ok(g.issue(0, { type: 'dig', ids: [u.id], c0: q, r0: r, c1: q, r1: r }).ok);
  run(g, BALANCE.excavator.digTime - 1);
  assert.equal(R.kind[i], MAP_ROAD, 'arbeitet noch');
  run(g, 4);
  assert.equal(R.kind[i], 0, 'Zonenstraße weg');
  assert.equal(roadAt(c, i), false);
  assert.ok(c.ver > ver, 'Wege neu');
  assert.equal(u.order.type, 'idle', 'fertig');
  // Brücke: nichts zu baggern
  const b = R.kind.indexOf(BRIDGE_ROAD);
  if (b >= 0) assert.equal(g.issue(0, { type: 'dig', ids: [u.id], c0: b % R.cols, r0: Math.floor(b / R.cols), c1: b % R.cols, r1: Math.floor(b / R.cols) }).ok, false);
  // eigenes Gebäude: abreißen
  const a = freeArea(g, c, m, 3, 3);
  assert.ok(g.issue(0, { type: 'city', kind: 'res', c0: a.q + 1, r0: a.r + 1, c1: a.q + 1, r1: a.r + 1 }).ok);
  const j = (a.r + 1) * c.cols + a.q + 1;
  u.x = (a.q + 1.5) * c.cell + 30;
  u.y = (a.r + 1.5) * c.cell;
  assert.ok(g.issue(0, { type: 'dig', ids: [u.id], c0: a.q + 1, r0: a.r + 1, c1: a.q + 1, r1: a.r + 1 }).ok);
  run(g, BALANCE.excavator.digTime + 2);
  assert.equal(c.kind[j], 0, 'abgerissen');
  // Schaufel: nur Gebäude, wenig Schaden je Schlag
  assert.deepEqual(UNITS.excavator.weapons[0].targets, ['struct']);
  assert.ok(UNITS.excavator.weapons[0].damage.struct < 60);
});

test('KI baut einen Fliegerhorst mit gültiger Bahn, Stellplätzen, Tower, Kerosintank und Munitionslager', async () => {
  const { aiAirport } = await import('../js/ai/cityai.js');
  const g = new Game({ seed: 3, city: true });
  const { c, m } = rich(g, 1);
  const from = CITY.ai.airportFrom;
  CITY.ai.airportFrom = 0; // sonst erst ab genug Arbeitsstätten
  try {
    for (let k = 0; k < 4; k++) {
      aiAirport(g, c, m, 0, 3);
      run(g, CITY.growTime + 1);
    }
  } finally {
    CITY.ai.airportFrom = from;
  }
  const rws = runwaysOf(g, 1).filter((x) => x.valid);
  assert.ok(rws.length >= 1, 'gültige Bahn');
  const kinds = new Set(c.list.map((i) => kindAt(c, i)));
  for (const k of ['stand', 'atc', 'ktank', 'mdepot']) assert.ok(kinds.has(k), `KI baut ${k}`);
  assert.ok(standsOf(g, 1).some((s) => standRoute(g, s)), 'Stellplatz mit Weg zur Bahn');
});

test('Breite Bahnfläche: längster Streifen 2 breit ist die Bahn, der Rest Rollfeld; Stellplatz über Rollfeld-Kette angebunden', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, m } = rich(g);
  const a = freeArea(g, c, m, 12, 10);
  const { q, r } = a;
  // Bahnfläche 10 × 4 (wie von Hand gemalt): eine gültige Bahn, 20 Zellen Rollfeld
  assert.ok(g.issue(0, { type: 'city', kind: 'runway', c0: q, r0: r, c1: q + 9, r1: r + 3 }).ok);
  const [rw] = runwaysOf(g, 0);
  assert.ok(rw.valid, rw.reason);
  assert.equal(rw.cells.length, 2 * 10);
  assert.equal(rw.apron.length, 20);
  // Stellplatz zwei Felder unter der Fläche, dazwischen eine Reihe Rollfeld
  assert.ok(g.issue(0, { type: 'city', kind: 'taxi', c0: q, r0: r + 4, c1: q + 3, r1: r + 4 }).ok);
  assert.ok(g.issue(0, { type: 'city', kind: 'stand', c0: q, r0: r + 5, c1: q, r1: r + 5 }).ok);
  run(g, CITY.growTime + 1);
  const s = standsOf(g, 0)[0];
  assert.ok(s, 'Stellplatz wächst am Rollfeld');
  const route = standRoute(g, s);
  assert.ok(route && route.rw.key === rw.key, 'Weg über Rollfeld zur Bahn');
  assert.ok(route.cells.some((i) => c.kind[i] === KIND_ID.taxi), 'über das Rollfeld');
});

test('Stellplatz: Ausbau nur per Befehl, Stufe 2 Geld + BM, Stufe 3 auch Stahl; wächst nicht von selbst', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, m, stands } = airbase(g);
  const [s] = stands;
  const i = s.cityCell;
  run(g, CITY.upgradeTime * 2 + 5);
  assert.equal(c.level[i], 1, 'bleibt offen ohne Ausbau');
  const U = CITY.air.upgrade;
  g.teams[0].res.money = U[2].money - 1;
  assert.equal(g.issue(0, { type: 'cityUpgrade', buildingId: s.id }).ok, false, 'zu wenig Geld');
  g.teams[0].res.money = 1e5;
  const bm = m.store.bm;
  assert.ok(g.issue(0, { type: 'cityUpgrade', buildingId: s.id }).ok);
  assert.equal(c.level[i], 2);
  assert.equal(g.teams[0].res.money, 1e5 - U[2].money);
  assert.ok(m.store.bm <= bm - U[2].bm + 1e-6, 'Baumaterial aus dem Lager');
  c.metal = U[3].steel - 1;
  const r = g.issue(0, { type: 'cityUpgrade', buildingId: s.id });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Stahl/);
  c.metal = 1000;
  assert.ok(g.issue(0, { type: 'cityUpgrade', buildingId: s.id }).ok);
  assert.equal(c.level[i], 3);
  assert.equal(c.metal, 1000 - U[3].steel);
  assert.equal(g.issue(0, { type: 'cityUpgrade', buildingId: s.id }).ok, false, 'höchste Stufe');
  // andere Stadtgebäude lassen sich so nicht ausbauen
  const other = [...c.ents.values()].find((e) => e.alive && KINDS[c.kind[e.cityCell] - 1] === 'atc');
  assert.equal(g.issue(0, { type: 'cityUpgrade', buildingId: other.id }).ok, false);
});

test('F-16: zwei Luft-Luft-Raketen nur gegen Luftziele, zwei Luft-Boden-Raketen gegen Panzer, beide zugleich', () => {
  const g = new Game({ seed: 3, city: true });
  const [aim, agm] = UNITS.f16.weapons;
  assert.deepEqual([aim.id, aim.rounds, agm.id, agm.rounds], ['aim', 2, 'agm', 2]);
  assert.ok(!aim.damage.heavy && !aim.damage.light && aim.damage.air > 0, 'Luft-Luft nur gegen Luftziele');
  assert.ok(agm.damage.heavy > 0 && !agm.damage.air, 'Luft-Boden nur gegen Bodenziele');
  const z = g.zone;
  const u = g.spawnUnit('f16', 0, z.x - 300, z.y);
  u.jet = { home: 0, ready: true, phase: 'air', alt: 1 };
  const heli = g.spawnUnit('gunship', 1, z.x, z.y);
  const tank = g.spawnUnit('tank', 1, z.x + 120, z.y);
  heli.hp = tank.hp = 1e6;
  g.fog[0].revealAll?.();
  assert.ok(g.issue(0, { type: 'attackMove', ids: [u.id], x: z.x, y: z.y }).ok);
  for (let t = 0; t < 30 && (u.weapons[0].rounds > 0 || u.weapons[1].rounds > 0); t++) {
    run(g, 1);
    g.fog[0].revealAll?.();
  }
  assert.equal(u.weapons[0].rounds, 0, 'Luft-Luft verschossen');
  assert.equal(u.weapons[1].rounds, 0, 'Luft-Boden verschossen');
  assert.ok(heli.hp < 1e6 && tank.hp < 1e6, 'Hubschrauber und Panzer getroffen');
});

// Review-Paket P4 (Daniels Entscheidung 2, D-03): der Tower sieht als Radar CITY.air.atcSight weit statt CITY.sight.
test('Tower: weite Sicht (CITY.air.atcSight) statt der Sicht der übrigen Stadtgebäude', () => {
  const g = new Game({ seed: 3, city: true });
  const { atc } = airbase(g);
  assert.ok(atc, 'Tower steht');
  assert.ok(CITY.air.atcSight > CITY.sight);
  const seen = () => {
    g.fog[0].update(g, 0);
    return g.fog[0].visible.reduce((s, v) => s + v, 0);
  };
  const wide = seen();
  const old = CITY.air.atcSight;
  CITY.air.atcSight = CITY.sight;
  let narrow;
  try {
    narrow = seen();
  } finally {
    CITY.air.atcSight = old;
  }
  assert.ok(wide > narrow, `Tower lichtet mehr Nebel (${wide} > ${narrow} Felder)`);
});

/** Zwei F-16 an Stellplatz s ausbilden und warten, bis beide stehen (Tank und Lager voll). */
function twoParked(g, s, c, ktank, mdepot) {
  ktank.stock = CITY.air.tank.cap[c.level[ktank.cityCell]];
  mdepot.stock = CITY.air.depot.cap[c.level[mdepot.cityCell]];
  g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' });
  g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' });
  for (let k = 0; k < 600 && !(g.units.filter((x) => x.def.jet && x.parked).length === 2 && g.units.filter((x) => x.def.jet).every((x) => x.jet.ready)); k++) run(g, 1);
  return g.units.filter((x) => x.def.jet && x.alive);
}

test('Zwei F-16 je Stellplatz: beide stehen auf verschiedenen Plätzen (nebeneinander, Nase nach Norden)', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, stands, ktank, mdepot } = airbase(g);
  const [s] = stands;
  assert.equal(freeSpace(g, s), CITY.air.standJets);
  const jets = twoParked(g, s, c, ktank, mdepot);
  assert.equal(jets.length, 2);
  assert.deepEqual(jets.map((u) => u.jet.slot).sort(), [0, 1], 'Plätze 0 und 1');
  const xs = jets.map((u) => u.x).sort((a, b) => a - b);
  assert.deepEqual(xs, [s.x - CITY.air.standSlot * c.cell, s.x + CITY.air.standSlot * c.cell]);
  assert.ok(jets.every((u) => u.y === s.y && u.angle === -Math.PI / 2), 'Nase nach Norden');
  assert.equal(freeSpace(g, s), 0);
});

test('Zwei F-16 je Stellplatz: Start und Landung beider, Platz wird beim Einrollen neu vergeben', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, stands, ktank, mdepot, rw } = airbase(g);
  const [s] = stands;
  const jets = twoParked(g, s, c, ktank, mdepot);
  assert.ok(jets.every((u) => u.jet.ready), 'beide startbereit');
  const z = g.zone;
  g.fog[0].revealAll?.();
  assert.ok(g.issue(0, { type: 'attackMove', ids: jets.map((u) => u.id), x: z.x, y: z.y }).ok);
  for (let t = 0; t < 60 && !jets.every((u) => u.jet.phase === 'air'); t += DT) g.update(DT);
  assert.ok(jets.every((u) => u.jet.phase === 'air'), 'beide in der Luft');
  assert.ok(jets.every((u) => u.jet.slot === undefined), 'Plätze frei, solange sie fliegen');
  run(g, 3);
  assert.ok(g.issue(0, { type: 'land', ids: jets.map((u) => u.id), airportId: s.id }).ok, 'Landebefehl für beide');
  for (let t = 0; t < 300 && !jets.every((u) => u.parked); t += DT) g.update(DT);
  assert.ok(jets.every((u) => u.parked), 'beide gelandet');
  assert.deepEqual(jets.map((u) => u.jet.slot).sort(), [0, 1], 'wieder auf verschiedenen Plätzen');
  assert.ok(jets.every((u) => u.jet.home === s.id && Math.abs(Math.abs(u.x - s.x) - CITY.air.standSlot * c.cell) < 1e-6), 'am Stellplatz');
  assert.equal(rw.valid, true);
});

test('Zwei F-16 je Stellplatz überstehen Speichern und Laden (Plätze und Standort bleiben)', async () => {
  const g = new Game({ seed: 3, city: true });
  const { c, stands, ktank, mdepot } = airbase(g);
  const [s] = stands;
  const jets = twoParked(g, s, c, ktank, mdepot);
  const before = jets.map((u) => [u.jet.slot, u.x, u.y]);
  const snap = snapshotGame(g, new AI(g, 1, 'normal'));
  const { game: g2 } = restoreGame(await unpack(await pack(snap)));
  const s2 = standsOf(g2, 0)[0];
  const jets2 = g2.units.filter((u) => u.def.jet && u.alive);
  assert.deepEqual(jets2.map((u) => [u.jet.slot, u.x, u.y]).sort(), before.sort());
  assert.equal(freeSpace(g2, s2), 0);
});

test('Stand ohne Platznummer (alter Spielstand): der Jet bekommt beim Abstellen einen Platz', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, stands } = airbase(g);
  const [s] = stands;
  const u = g.spawnUnit('f16', 0, s.x, s.y);
  u.parked = true;
  u.jet = { home: s.id, ready: false, phase: 'park', alt: 0 };
  run(g, DT);
  assert.equal(u.jet.slot, 0, 'erster freier Platz');
  assert.equal(u.x, s.x - CITY.air.standSlot * c.cell);
  assert.equal(u.y, s.y);
});

test('Rechtsverkehr am Boden: nach der Landung rollt der Jet um keepRight rechts neben der Mitte, Stellplatz genau', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, stands, ktank, mdepot } = airbase(g);
  ktank.stock = CITY.air.tank.cap[c.level[ktank.cityCell]];
  mdepot.stock = CITY.air.depot.cap[c.level[mdepot.cityCell]];
  const [s] = stands;
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' }).ok);
  run(g, UNITS.f16.buildTime + 1);
  const [u] = g.units.filter((x) => x.def.jet);
  assert.ok(u, 'F-16 ausgebildet');
  const z = g.zone;
  assert.ok(g.issue(0, { type: 'attackMove', ids: [u.id], x: z.x, y: z.y }).ok);
  for (let t = 0; t < 40 && u.jet.phase !== 'air'; t += DT) g.update(DT);
  assert.equal(u.jet.phase, 'air');
  run(g, 3);
  assert.ok(g.issue(0, { type: 'land', ids: [u.id], airportId: s.id }).ok);
  const offs = [];
  for (let t = 0; t < 180 && !u.parked; t += DT) {
    const r = u.jet.route;
    const k = u.jet.idx;
    const ph = u.jet.phase;
    g.update(DT);
    if (ph !== 'taxiIn' || u.jet.phase !== 'taxiIn' || !r || u.jet.idx === k || !r[k].side) continue;
    offs.push(Math.hypot(u.x - r[k].x, u.y - r[k].y));
    // rechts der Fahrtrichtung (Bildschirm, y nach unten): Kreuzprodukt Richtung × Versatz > 0
    const q = r[k - 1];
    assert.ok((r[k].x - q.x) * (u.y - r[k].y) - (r[k].y - q.y) * (u.x - r[k].x) > 0, 'Versatz liegt rechts');
  }
  assert.ok(offs.length > 0, 'Rollweg hat Zellen mit Rechtsverkehr');
  for (const d of offs) assert.ok(Math.abs(d - BALANCE.jets.keepRight) < 1e-6, `Versatz ${d}`);
  assert.ok(u.parked, 'steht wieder auf dem Stellplatz');
});

test('F-22: Stellplatz bildet sie aus; eine Waffe mit sechs Luft-Luft-Raketen, sonst keine; greift nur Luftziele an', () => {
  // Waffenprofil (seit v5.82): genau eine Luft-Luft-Lenkrakete, keine Luft-Boden-Raketen
  assert.equal(UNITS.f22.weapons.length, 1);
  const [aim] = UNITS.f22.weapons;
  assert.deepEqual([aim.id, aim.rounds], ['aim', 6]);
  assert.deepEqual(aim.targets, ['air'], 'nur Luftziele');
  assert.ok(!aim.damage.heavy && !aim.damage.light && !aim.damage.struct && !aim.damage.inf, 'kein Schaden an Boden und Gebäuden');
  assert.equal(UNITS.f22.jet, true);
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g);
  const [s] = stands;
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'f22' }).ok, 'F-22 ausbildbar am Stellplatz');
  for (let k = 0; k < 600 && !g.units.some((x) => x.def === UNITS.f22); k++) run(g, 1); // Stahl und Weg zum Lager wie bei der F-16
  const [u] = g.units.filter((x) => x.def === UNITS.f22);
  assert.ok(u, 'F-22 gebaut');
  assert.ok(u.parked && u.jet.home === s.id, 'steht auf dem Stellplatz');
  assert.equal(u.weapons.length, 1);
  // Gegen einen Panzer feuert sie nicht, gegen einen Hubschrauber schon
  const z = g.zone;
  const tank = g.spawnUnit('tank', 1, z.x + 120, z.y);
  const heli = g.spawnUnit('gunship', 1, z.x + 200, z.y);
  tank.hp = heli.hp = 1e6;
  u.jet = { ...u.jet, ready: true, phase: 'air', alt: 1 };
  u.parked = false;
  u.x = z.x - 300;
  u.y = z.y;
  g.fog[0].revealAll?.();
  assert.ok(g.issue(0, { type: 'attackMove', ids: [u.id], x: z.x, y: z.y }).ok);
  for (let t = 0; t < 30 && u.weapons[0].rounds > 0; t++) {
    run(g, 1);
    g.fog[0].revealAll?.();
  }
  assert.ok(u.weapons[0].rounds < 6, 'Lenkraketen gegen den Hubschrauber verschossen');
  assert.equal(tank.hp, 1e6, 'Panzer am Boden nicht angegriffen');
});

test('F-16 und F-22 teilen sich die Plätze eines Stellplatzes: zusammen höchstens CITY.air.standJets', () => {
  const g = new Game({ seed: 3, city: true });
  const { stands } = airbase(g);
  const [s] = stands;
  assert.equal(CITY.air.standJets, 2, 'Annahme dieses Tests: zwei Plätze je Stellplatz');
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' }).ok, 'erste F-16');
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'f22' }).ok, 'F-22 teilt sich den Stellplatz');
  const r = g.issue(0, { type: 'train', buildingId: s.id, unit: 'f22' });
  assert.equal(r.ok, false, 'dritter Jet auf dem Stellplatz abgelehnt');
  assert.match(r.reason, /Stellplatz belegt/);
  const r2 = g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' });
  assert.equal(r2.ok, false, 'auch eine F-16 passt nicht mehr dazu');
  assert.equal(freeSpace(g, s), 0);
});
