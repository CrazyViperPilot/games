// v5.35: Fliegerhorst aus Bausteinen (Start-/Landebahn, Stellplätze, Tower, Kerosintank, Munitionslager) und der Bagger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/game.js';
import { CITY } from '../js/data/city.js';
import { BALANCE } from '../js/data/balance.js';
import { UNITS } from '../js/data/units.js';
import { canZone, roadAt, KINDS, KIND_ID, migrateCity, connectRoad } from '../js/game/city.js';
import { isFoe } from '../js/game/entities.js';
import { standsOf, freeSpace, runwaysOf, standRoute, jetGrounded, parkedArmor, runwayBusy } from '../js/game/aircraft.js';
import { MAP_ROAD, BRIDGE_ROAD } from '../js/game/roads.js';

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

test('Stellplatz bildet eine F-16 aus (einer je Stellplatz), Schutz je Stufe, Kerosintank und Munitionslager füllen sich über die Straße', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, stands, ktank, mdepot, rw } = airbase(g);
  assert.ok(rw, 'gültige Bahn');
  assert.equal(stands.length, 2);
  assert.deepEqual(standsOf(g, 0).map((e) => e.id).sort(), stands.map((e) => e.id).sort());
  const [s] = stands;
  assert.ok(standRoute(g, s), 'Weg vom Stellplatz zur Bahn');
  assert.ok(g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' }).ok);
  const r = g.issue(0, { type: 'train', buildingId: s.id, unit: 'f16' });
  assert.equal(r.ok, false, 'nur ein Flugzeug je Stellplatz');
  assert.match(r.reason, /Stellplatz/);
  run(g, UNITS.f16.buildTime + 1);
  const [u] = g.units.filter((x) => x.def.jet);
  assert.ok(u && u.parked && u.jet.home === s.id, 'steht auf seinem Stellplatz');
  assert.deepEqual([u.x, u.y], [s.x, s.y]);
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
  assert.deepEqual([u.x, u.y], [s.x, s.y]);
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

test('Alte Stände: der Flughafen 10 × 10 wird beim Laden geräumt, Jets darauf gehen verloren', () => {
  const g = new Game({ seed: 3, city: true });
  const { c, m } = rich(g);
  const a = freeArea(g, c, m, 12, 12);
  const i = (a.r + 5) * c.cols + a.q + 5;
  // alten Flughafen von Hand eintragen (Bauen geht nicht mehr)
  const AP = KIND_ID.airport;
  for (let dr = -4; dr <= 5; dr++) for (let dq = -4; dq <= 5; dq++) c.kind[i + dr * c.cols + dq] = AP;
  c.list.push(i);
  c.level[i] = 1;
  migrateCity(g);
  for (let dr = -4; dr <= 5; dr++) for (let dq = -4; dq <= 5; dq++) assert.equal(c.kind[i + dr * c.cols + dq], 0);
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
  const { aiAirport } = await import('../js/game/city.js');
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
