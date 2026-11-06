// Spielzustand, Befehle (issue), Platzierung, Lager, Spawn, Aufräumen und Sieg (docs/verlauf.md §4, §5, §11). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { makeRng } from '../core/rng.js';
import { generateMap } from './map.js';
import { terrainGrid } from './mapdata.js';
import { lineCells } from './grid.js';
import { reliefOf } from './relief.js';
import { createUnit, createBuilding, defineAmmo, canAttack, inRange } from './entities.js';
import { Fog } from './fog.js';
import { updateEconomy, smoothIncome } from './economy.js';
import { createCity } from './city/create.js';
import { updateCity } from './city/economy.js';
import { cityNoise, payMetal } from './city/state.js';
import { freePop, crewOf, cityTrainers, trainerKind } from './city/query.js';
import { KIND_NAME } from '../data/citykinds.js';
import { updateMovement, nearestPassable, planPath, setIdle, separate, exitHouse } from './movement.js';
import { updateCombat } from './combat.js';
import { updateZone } from './zone.js';
import { createHot, updateHot } from './hotzone.js';
import { updateLogistics, cargoSum, storeCapOf } from './logistics.js';
import { updateConstruction, canBuild, orderBuild, orderBuildSeq } from './construction.js';
import { updateTowers, ejectCrew } from './tower.js';
import { createHouses, updateGarrison, dropOccupant, houseCanFire } from './garrison.js';
import { createCrates, updateCrates, updateCrateIntel } from './crates.js';
import { createScars, updateScars, updateScarIntel, addUnitWreck, addBuildingWreck, clearWrecksUnder } from './scars.js';
import { createAnimals, updateAnimals } from './animals.js';
import { FORMATIONS, formationSlots, updateFormations } from './formation.js';
import { hasCommander, updateCommanders, commanderFallen } from './commander.js';
import { updateRadio, radioStarted, radioLost } from './radio.js';
import { createWeather, updateWeather, setWeather, WEATHER_NAMES } from './weather.js';
import { updateAbilities } from './abilities.js';
import { createResearch, updateResearch, rangeMul } from './research.js';
import { createBridges, updateBridges, bridgeUnder } from './river.js';
import { createRoads } from './roads.js';
import { updateAircraft, trainCheck } from './aircraft.js';
import { updateHelis, heliTrainCheck } from './helipad.js';
import { updateDig } from './excavator.js';
import { commandOf, OWN_DRIVERS } from './commands.js';

const TILE = BALANCE.map.tile;
const W = BALANCE.map.width;
const H = BALANCE.map.height;
const STOCK_KEYS = ['bm', 'mun', 'fuel']; // Lagersorten (team.res.* sind Summen über FOB-Lager)
const NOISY = new Set(['tracer', 'shell', 'explosion', 'muzzle']); // Effekte, die Stadtbewohner in der Konfliktzone vertreiben (cityNoise in js/game/city/state.js)
const EFFECT_LIFE = { tracer: 0.12, shell: 0.3, explosion: 0.5, intercept: 0.4, muzzle: 0.1, death: 0.1 };
const SHORTAGE_TEXT = {
  mun: 'Einheiten ohne Munition',
  fuel: 'Fahrzeuge ohne Treibstoff',
  kero: 'Luftfahrzeuge ohne Kerosin (Stadtlager leer: Kerosin-Raffinerie bauen oder am Markt kaufen)', // seit v5.20, nur mit Stadt
};
const WALL_TYPES = new Set(['wall', 'gate']);

const zeroRes = () => ({ money: 0, bm: 0, mun: 0, fuel: 0 });

const START_STEP = 12; // Rastergröße der Startplätze (px)

/**
 * Startaufstellung um die Hauptstadt nach Truppengattung getrennt (BALANCE.startLayout): jede Gattung hat einen Ankerpunkt
 * (Winkel zur Kartenmitte, Abstand zur FOB) und füllt von dort aus die nächsten freien passierbaren Plätze im Raster,
 * nie überlappend. Beide Teams nutzen dieselbe Anordnung relativ zur Kartenmitte. Liefert die Mittelpunkte in der Reihenfolge von `types`.
 */
function startFormation(grid, team, cx, cy, types) {
  let fx = W / 2 - cx;
  let fy = H / 2 - cy;
  const fl = Math.hypot(fx, fy) || 1;
  fx /= fl;
  fy /= fl;
  const layout = BALANCE.startLayout;
  const R = layout.maxDist;
  // Kandidaten in Ringen 60–R px um die FOB (FOB-Mitte liegt im Gebäude und ist nicht passierbar)
  const cands = [];
  for (let dy = -R; dy <= R; dy += START_STEP) {
    for (let dx = -R; dx <= R; dx += START_STEP) {
      const r = Math.hypot(dx, dy);
      if (r < 60 || r > R) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (!grid.passable(grid.toCell(x), grid.toCell(y), team)) continue;
      cands.push({ x, y });
    }
  }
  const placed = [];
  for (const type of types) {
    const g = layout.groups.find((o) => o.types.includes(type)) || layout.fallback;
    const rad = UNITS[type].radius;
    const a = (g.angle * Math.PI) / 180;
    const ax = cx + g.dist * (fx * Math.cos(a) - fy * Math.sin(a));
    const ay = cy + g.dist * (fx * Math.sin(a) + fy * Math.cos(a));
    let best = null;
    let bestD = Infinity;
    for (const c of cands) {
      const d = Math.hypot(c.x - ax, c.y - ay);
      if (d >= bestD) continue;
      if (placed.some((p) => Math.hypot(c.x - p.x, c.y - p.y) < rad + p.rad + Math.max(g.gap, p.gap))) continue;
      best = c;
      bestD = d;
    }
    placed.push(best ? { x: best.x, y: best.y, rad, gap: g.gap } : null);
  }
  return placed.map((p) => (p ? { x: p.x, y: p.y } : null));
}
const fail = (reason) => ({ ok: false, reason });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
/** Hat das Lager (Gebäude-store oder LKW-cargo) die Kosten (Sorten bm/mun/fuel) ganz? */
const covers = (stock, cost) => STOCK_KEYS.every((k) => stock[k] >= (cost[k] || 0));

/** Bezahlt die Sorten aus dem Lager (Gebäude → store, LKW → cargo). Geld zahlt das Team separat. */
function takeStock(e, cost) {
  const stock = e.kind === 'building' ? e.store : e.cargo;
  for (const k of STOCK_KEYS) stock[k] -= cost[k] || 0;
}

/** Tragen alle diese Bauer nur Baumaterial (Soldaten)? Dann zahlen sie Mauern und Tore aus ihrer Ladung. */
const paysCarried = (list) => list.length > 0 && list.every((u) => u.def.builder === 'fort');
const carriedBm = (list) => list.reduce((n, u) => n + u.cargo.bm, 0);
function takeCarried(list, bm) {
  let left = bm;
  for (const u of list) {
    const t = Math.min(u.cargo.bm, left);
    u.cargo.bm -= t;
    left -= t;
    if (left <= 1e-9) break;
  }
}
/** Zähler je Team für den Endbildschirm (seit v5.65). Reine Anzeige: die Simulation liest sie nicht. */
export function newStats() {
  return { trained: 0, lost: 0, kills: 0, buildingsLost: 0, buildingsKilled: 0, peakUnits: 0 };
}

const NO_CARRIED = 'Zu wenig getragenes Baumaterial (Soldaten laden es in einer FOB)';
const ONE_COMMANDER = 'Nur ein Kommandeur je Team';

export class Game {
  /** `map`: fertige Karte (Editor/gespeichert, siehe mapdata.js); ohne sie wird sie aus dem Seed erzeugt. */
  /** radio: Sendemast als zweite Siegbedingung (Startmenü; ohne Angabe aus). */
  /** weather: 'off' | 'random' | 'summer' | 'autumn' | 'winter' (Wetter und Jahreszeit, weather.js; ohne Angabe aus). */
  /** research: Forschungsstufen (research.js; ohne Angabe aus: alle Einheiten frei, keine Verbesserungen). */
  /** city: Zonenstadt hinter der Hauptstadt (js/game/city/; ohne Angabe aus: Hauptstadt hat unendlich Material). */
  /** river: Zufallskarte mit Flüssen, Brücken und Furten (river.js; ohne Angabe aus). Fertige Karten bringen ihre eigenen mit. */
  constructor({ seed = 1, winPoints = BALANCE.winPoints, startMoney = BALANCE.startRes.money, map = null, radio = false, weather = 'off', research = false, river = false, city = false, debug = false } = {}) {
    this.seed = seed;
    this.debug = !!debug; // ?debug=1: erlaubt den Befehl `debug` (Geld, festes Wetter), seit v5.58
    this.rng = makeRng(seed);
    this.map = map ?? generateMap(seed, { river });
    this.relief = reliefOf(this.map); // Höhengelände oder null (flache Karte); im Spielstand nur das Grobraster (savegame.js)
    // Raster: Hindernisse, Häuser, Bäume, steile Hänge, Seen und Flüsse (Furten passierbar), Hangkosten; im Spielstand nur der Unterschied dazu
    this.grid = terrainGrid(this.map, this.relief);

    this.time = 0;
    this.nextId = 1;
    this.entities = new Map();
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.effects = [];
    createBridges(this); // Brücken über die Flüsse (Fahrbahn offen, zerstörbar)
    createRoads(this); // Stadtstraßen der Karte: Zonenstraßen und Brückenfahrbahnen im Stadtraster (seit v5.03)
    createScars(this); // Wracks und Krater (sichtbarer Schaden)
    this.formations = new Map(); // Formation → { id, speed, ids } (formation.js)
    this.formationSeq = 0;
    this.events = [];
    this.winner = null;
    this.winReason = null;
    this.winPoints = winPoints;
    this.radioWin = !!radio;
    this.fogTimer = 0;
    this.statTimer = 0; // Takt der Heeresgröße für die Statistik (sampleArmy, einmal je s)
    this.pathWork = 0; // untersuchte Zellen der Wegsuche seit dem letzten Schritt (Wegbudget, pathplan.js)
    this.pathBacklog = false; // warten Einheiten auf ihren Weg (neue Anfragen stellen sich dann an)? (pathplan.js)
    this.pathSeq = 0; // Reihenfolge der wartenden Wege
    this.pathLong = null; // laufende lange Wegsuche einer Einheit { id, sx, sy, x, y, done, hash } (pathplan.js)
    this.pathShare = []; // in diesem Schritt gefundene Wege zum Teilen (pathplan.js)
    this.logiTimer = 0; // Takt des Nachfüllens (logistics.js)
    this.consTimer = 0; // Takt der automatischen Bauzuweisung (construction.js)
    this.teams = [0, 1].map((id) => {
      const team = {
        id,
        name: BALANCE.teamNames[id],
        color: BALANCE.teamColors[id],
        res: { money: startMoney }, // bm/mun/fuel: unten als Getter (Summe der Front-Lager ohne Hauptstadt)
        income: zeroRes(),
        rate: zeroRes(),
        flow: { bm: 0, mun: 0, fuel: 0 }, // Verbrauch aus Lagern je s (Nachfüllen)
        points: 0,
        pointProgress: 0,
        used: { mun: 0, fuel: 0 }, // Summe des Verbrauchs (Statistik)
        earned: 0, // Geld aus Prämien und Bau (reward)
        stats: newStats(), // Zähler für den Endbildschirm (Statistik, seit v5.65)
        warnAt: {}, // Zeitpunkt der letzten Meldung je Schlüssel (notify)
        incomeMult: 1,
        isAI: false,
        lastWarn: -1e9,
        reinforceTimer: 0, // Zeit seit dem letzten Soldaten-Nachschub (economy.js)
      };
      this.bindStocks(team);
      return team;
    });
    createResearch(this, research); // Stufen und Verbesserungen je Team (team.tech)
    this.zone = { ...this.map.zone, owner: -1, contested: false, counts: [0, 0], weight: [0, 0], bar: { team: -1, p: 0 } };
    this.hot = createHot(this);
    this.fog = [new Fog(W, H), new Fog(W, H)];

    // Startzustand: je Team die Hauptstadt auf dem Spawn (unendlicher Vorrat), Startunits als Formation davor
    for (let t = 0; t < 2; t++) {
      const sp = this.map.spawns[t];
      this.spawnBuilding('fob', t, this.grid.toCell(sp.x) - 1, this.grid.toCell(sp.y) - 1, { built: true, main: true });
      const spots = startFormation(this.grid, t, sp.x, sp.y, BALANCE.startUnits);
      BALANCE.startUnits.forEach((type, i) => {
        const p = spots[i] || nearestPassable(this.grid, sp.x, sp.y, t) || sp;
        this.spawnUnit(type, t, p.x, p.y);
      });
    }
    createHouses(this); // Stadthäuser zum Besetzen (Häuserkampf)
    createCity(this, city); // Zonenstadt je Team, Hauptstadt mit endlichem Lager (nur wenn eingeschaltet)
    createCrates(this); // Versorgungskisten der Karte
    createAnimals(this); // Rehe und Wildschweine (nur Optik)
    createWeather(this, weather); // Jahreszeit und Wetter (eigener Zufall)
    this.updateFog();
  }

  // ---- Zustand und Hilfen -------------------------------------------------------

  /** Lesbare Summe über alle fertigen eigenen FOB-Lager (team.res.bm/mun/fuel); nie direkt schreiben. */
  bindStocks(team) {
    for (const k of STOCK_KEYS) {
      Object.defineProperty(team.res, k, { enumerable: true, configurable: true, get: () => this.stockOf(team.id, k) });
    }
  }

  /** Nach dem Laden eines Spielstands (core/snapshot.js übergeht Getter): Lagersummen und `ammo` der Einheiten wieder anlegen. */
  restoreAccessors() {
    for (const team of this.teams) this.bindStocks(team);
    for (const u of this.units) defineAmmo(u, u.def);
    // Statistik fehlt in Ständen vor v5.65: Felder mit 0 ergänzen (SAVE_FORMAT unverändert)
    for (const team of this.teams) {
      team.stats = { ...newStats(), ...team.stats };
      team.earned = team.earned || 0;
    }
    this.statTimer = this.statTimer || 0;
    // Ruinenliste fehlt in Ständen vor v5.66: aus den eingestürzten Häusern neu aufbauen
    if (!this.ruins) this.ruins = (this.houses || []).filter((h) => h.ruined);
    // Nachrüstungen für ältere Stände (Straßen, Forschungsbaum, Stadt, FOB-Baustellen) gibt es seit v5.56 nicht mehr: Stände eines
    // anderen SAVE_FORMAT laden nicht (savegame.js). Ausnahme: das Ausgangslager der Werke (seit v5.69) fehlt in Ständen davor, leer ergänzen.
    for (const c of this.city ?? []) {
      c.out ??= new Float32Array(c.kind.length);
      c.workOut ??= new Float32Array(c.kind.length); // seit v5.70: Ausstoß je s am Anker (leer in älteren Ständen)
      c.pickClaim ??= new Uint8Array(c.kind.length);
    }
  }

  newId() {
    return this.nextId++;
  }

  /** Lebende Entity mit dieser ID oder null. */
  getEntity(id) {
    if (id === null || id === undefined) return null;
    const e = this.entities.get(id);
    return e && e.alive ? e : null;
  }

  /** Ereignis: team = Empfänger (-1 = alle). */
  message(team, text, x = null, y = null) {
    this.events.push({ type: 'message', team, text, x, y });
  }

  /**
   * Meldung mit Drosselung: je Schlüssel und Team höchstens alle `interval` s (Standard shortageWarn).
   */
  notify(team, key, text, interval = BALANCE.shortageWarn, x = null, y = null) {
    const t = this.teams[team];
    const last = t.warnAt[key] ?? -1e9;
    if (this.time - last < interval) return;
    t.warnAt[key] = this.time;
    this.message(team, text, x, y);
  }

  /** Mangelmeldung für Munition oder Treibstoff (gedrosselt). */
  shortage(team, key) {
    this.notify(team, key, SHORTAGE_TEXT[key]);
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  /** `snd`: Hinweis für den Ton (ui/Sound): Waffen-ID, Rüstungsklasse eines Gefallenen oder 'building'; die Simulation wertet ihn nicht aus. */
  addEffect(type, x, y, team = -1, x2 = x, y2 = y, snd = null) {
    this.effects.push({ type, x, y, x2, y2, team, snd, t: 0, life: EFFECT_LIFE[type] ?? 0.3 });
    if (this.city && NOISY.has(type)) {
      cityNoise(this, x, y); // Stadt: Bewohner der Konfliktzone fliehen vor Schüssen und Einschlägen
      if (x2 !== x || y2 !== y) cityNoise(this, x2, y2);
    }
  }

  /** Eigene Entity oder fertiger Sendemast (den sieht der Gegner überall, auch im Nebel). */
  alwaysVisible(team, e) {
    return e.team === team || (e.kind === 'building' && e.built && !!e.def.radio);
  }

  isVisible(team, x, y) {
    return this.fog[team].isVisible(x, y);
  }

  /**
   * Sieht `team` die Entity e? Eigene immer; fremde, wenn die Zelle im Sichtfeld liegt. Getarnte Einheiten (def.stealth) zusätzlich nur,
   * wenn eine eigene Einheit oder ein fertiges Gebäude des Teams näher als stealth.detectRange steht oder sie gerade geschossen haben.
   */
  sees(team, e) {
    if (this.alwaysVisible(team, e)) return true;
    if (e.kind === 'house') return e.occupants.some((o) => this.sees(team, o)); // besetztes Haus: wenn ein Besatzer erkannt ist
    if (!this.fog[team].isVisible(e.x, e.y)) return false;
    if (!e.def.stealth || e.kind !== 'unit') return true;
    if (this.time < (e.revealedUntil || 0)) return true;
    const r2 = BALANCE.stealth.detectRange ** 2;
    for (const u of this.units) if (u.alive && u.team === team && (u.x - e.x) ** 2 + (u.y - e.y) ** 2 <= r2) return true;
    for (const b of this.buildings) if (b.alive && b.built && b.team === team && (b.x - e.x) ** 2 + (b.y - e.y) ** 2 <= r2) return true;
    return false;
  }

  /** Geländehöhe unter einer Entity (Wasseroberfläche bei Seen, Fahrbahn auf Brücken); 0 auf flachen Karten. */
  groundHeight(e) {
    if (!this.relief) return 0;
    const b = this.bridges.length && !(e.kind === 'unit' && e.def.air) ? bridgeUnder(this, e.x, e.y) : null;
    return b ? b.deckH : this.relief.displayAt(e.x, e.y);
  }

  isExplored(team, x, y) {
    return this.fog[team].isExplored(x, y);
  }

  updateFog() {
    for (let t = 0; t < this.teams.length; t++) this.fog[t].update(this, t);
    updateCrateIntel(this);
    updateScarIntel(this);
  }

  /** Lebende Entities, deren Mittelpunkt im Kreis liegt (Gebäude: plus halbe Größe). */
  query(x, y, r, filter = null) {
    const out = [];
    for (const list of [this.units, this.buildings]) {
      for (const e of list) {
        if (!e.alive) continue;
        const rr = e.kind === 'building' ? r + (Math.max(e.w, e.h) * TILE) / 2 : r;
        if (dist(e.x, e.y, x, y) > rr) continue;
        if (filter && !filter(e)) continue;
        out.push(e);
      }
    }
    return out;
  }

  // ---- Lager, Zahlung, Versorgung ----------------------------------------------------

  /** Summe einer Sorte über die Lager aller fertigen eigenen FOBs außer der Hauptstadt (Getter von team.res: das Front-Lager). */
  stockOf(team, k) {
    let sum = 0;
    for (const b of this.buildings) {
      if (b.alive && b.built && b.team === team && b.type === 'fob' && !b.infinite && !(b.main && this.city)) sum += b.store[k];
    }
    return sum;
  }

  /** Hauptstadt des Teams (lebend) oder null. */
  mainFob(team) {
    return this.buildings.find((b) => b.alive && b.team === team && b.main) ?? null;
  }

  /**
   * Testhilfe: setzt das Lager der ersten fertigen FOB ohne Hauptstadt auf {bm, mun, fuel} (fehlende Sorten = 0)
   * und leert die übrigen Front-Lager. Die Hauptstadt bleibt unverändert (unendlich).
   */
  setStock(team, vals) {
    const fobs = this.buildings.filter((b) => b.alive && b.built && b.team === team && b.type === 'fob' && !b.infinite && !(b.main && this.city));
    fobs.forEach((f, i) => {
      for (const k of STOCK_KEYS) f.store[k] = i === 0 ? vals[k] || 0 : 0;
    });
  }

  /** Eigene fertige FOBs, deren Bauradius (x, y) enthält. */
  fobsInRadius(team, x, y) {
    const R = BALANCE.fob.buildRadius;
    return this.buildings.filter(
      (b) => b.alive && b.built && b.team === team && b.type === 'fob' && dist(b.x, b.y, x, y) <= R,
    );
  }

  /**
   * Zahler für Kosten an (x, y): nächste fertige eigene FOB, deren Bauradius (x, y) enthält und deren Lager
   * die Kosten (bm/mun/fuel) deckt. null, wenn keine.
   */
  payerFor(team, x, y, cost) {
    const R = BALANCE.fob.buildRadius;
    let best = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (!(b.alive && b.built && b.team === team && b.type === 'fob')) continue;
      const d = dist(b.x, b.y, x, y);
      if (d > R || d >= bestD || !covers(b.store, cost)) continue;
      best = b;
      bestD = d;
    }
    return best;
  }

  /** Eigener LKW mit Ladung für Kosten, höchstens truckSupplyRange von (x, y) entfernt (Mauer außerhalb der FOB). */
  truckPayer(team, x, y, cost) {
    const R = BALANCE.logistics.truckSupplyRange;
    let best = null;
    let bestD = Infinity;
    for (const u of this.units) {
      if (!(u.alive && u.team === team && u.type === 'truck')) continue;
      const d = dist(u.x, u.y, x, y);
      if (d > R || d >= bestD || !covers(u.cargo, cost)) continue;
      best = u;
      bestD = d;
    }
    return best;
  }

  /** Erste fertige eigene FOB nahe (x, y) (Erstattung, falls der Zahler tot ist). */
  nearestFob(team, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (!(b.alive && b.built && b.team === team && b.type === 'fob')) continue;
      const d = dist(b.x, b.y, x, y);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /** Versorger eines Gebäudes (Förderanlage, Mörser, Flugabwehr): nächste fertige eigene FOB, wenn ihr Bauradius es enthält. */
  supplierOf(b) {
    const f = this.nearestFob(b.team, b.x, b.y);
    return f && dist(f.x, f.y, b.x, b.y) <= BALANCE.fob.buildRadius ? f : null;
  }

  /** Begründung, warum die Sorten für (x, y) nicht bezahlt werden können. */
  stockReason(team, x, y, cost) {
    const fobs = this.fobsInRadius(team, x, y);
    if (!fobs.length) return 'Kein FOB-Lager in Reichweite';
    const miss = STOCK_KEYS.filter((k) => (cost[k] || 0) > 0 && !fobs.some((f) => f.store[k] >= cost[k])).map(
      (k) => BALANCE.resNames[k],
    );
    if (miss.length) return `FOB-Lager: zu wenig ${miss.join(', ')}`;
    return 'FOB-Lager: keine einzelne FOB deckt alle Kosten';
  }

  missingMoney() {
    return `Zu wenig ${BALANCE.resNames.money}`;
  }

  /** Geld (globaler Vorrat). Sorten werden über payerFor/Lager bezahlt. */
  canAfford(team, cost) {
    return this.teams[team].res.money >= (cost.money || 0);
  }

  pay(team, cost) {
    this.teams[team].res.money -= cost.money || 0;
  }

  /** Geld-Erstattung (nur money; Sorten gehen über refundStock). */
  refund(team, cost, factor = 1) {
    this.teams[team].res.money += (cost.money || 0) * factor;
  }

  /**
   * Erstattet Sorten an den Zahler `payerId` (eigene Entity mit Lager). Ist er tot oder fremd,
   * geht es an die nächste eigene FOB bei (x, y); ohne FOB verfällt es. Lager-Obergrenze wird beachtet.
   */
  refundStock(team, payerId, cost, factor, x, y) {
    let target = payerId !== null && payerId !== undefined ? this.getEntity(payerId) : null;
    if (target && target.team !== team) target = null;
    if (!target) target = this.nearestFob(team, x, y);
    if (!target) return;
    const stock = target.kind === 'building' ? target.store : target.cargo;
    for (const k of STOCK_KEYS) {
      const amt = (cost[k] || 0) * factor;
      if (!(amt > 0)) continue;
      const room = target.kind === 'building' ? storeCapOf(target) - stock[k] : BALANCE.logistics.truckCapacity - cargoSum(stock);
      stock[k] += Math.max(0, Math.min(amt, room));
    }
  }

  // ---- Entities -----------------------------------------------------------------

  spawnUnit(type, team, x, y) {
    const id = this.newId();
    const u = createUnit(id, type, team, x, y);
    this.entities.set(id, u);
    this.units.push(u);
    return u;
  }

  /** Gebäude an Zelle (cx, cy) anlegen und Fußabdruck belegen. Ohne Kostenprüfung (für Befehle und Tests). */
  spawnBuilding(type, team, cx, cy, { built = true, main = false, payerId = null } = {}) {
    const id = this.newId();
    const b = createBuilding(id, type, team, cx, cy, TILE);
    if (main) {
      b.main = true;
      b.infinite = true;
      b.produces = b.def.produces;
      for (const k of STOCK_KEYS) b.store[k] = BALANCE.logistics.capitalCap;
    }
    b.payerId = payerId;
    if (built) {
      b.built = true;
      b.progress = 1;
      b.hp = b.maxHp;
    }
    this.grid.occupy(b);
    this.entities.set(id, b);
    this.buildings.push(b);
    clearWrecksUnder(this, b);
    return b;
  }

  // ---- Platzierung --------------------------------------------------------------

  /**
   * Prüft, ob Gebäude `type` mit Mitte (x, y) gebaut werden darf.
   * Liefert { ok, reason, cx, cy, x, y, payer } (x, y = Mitte des Fußabdrucks).
   * payer = { kind: 'fob'|'truck', id } – wer die Sorten zahlt (null bei FOBs).
   * Mauer/Tor außerhalb eines FOB-Radius: eigener LKW mit Ladung ≤ truckSupplyRange.
   * carried: Soldaten zahlen aus ihrem getragenen Baumaterial (nur Mauer/Tor, nur im Bauradius einer FOB; kein Lager zahlt).
   */
  canPlace(team, type, x, y, { carried = false } = {}) {
    const def = BUILDINGS[type];
    const g = this.grid;
    if (!def) return { ok: false, reason: 'Unbekanntes Gebäude' };

    const px = x;
    const py = y;
    const cx = g.toCell(px) - Math.floor(def.w / 2);
    const cy = g.toCell(py) - Math.floor(def.h / 2);
    const mx = (cx + def.w / 2) * TILE;
    const my = (cy + def.h / 2) * TILE;
    const bad = (reason) => ({ ok: false, reason, cx, cy, x: mx, y: my, payer: null });
    if (def.radio && !this.radioWin) return bad('Sendemast ist in dieser Partie ausgeschaltet');
    if (def.unique && this.buildings.some((b) => b.alive && b.team === team && b.type === type)) return bad(`Nur ein ${def.name} je Team`);

    for (let r = cy; r < cy + def.h; r++) {
      for (let c = cx; c < cx + def.w; c++) {
        if (!g.inBounds(c, r)) return bad('Außerhalb der Karte');
        const i = g.idx(c, r);
        if (g.terrain[i]) return bad('Gelände blockiert');
        if (g.struct[i]) return bad('Fläche bereits belegt');
        if (g.ford?.[i] || g.deck?.[i]) return bad('Nicht auf Brücken und in Furten');
      }
    }

    const x0 = cx * TILE;
    const y0 = cy * TILE;
    const x1 = x0 + def.w * TILE;
    const y1 = y0 + def.h * TILE;
    for (const u of this.units) {
      if (u.alive && u.team !== team && u.x >= x0 && u.x < x1 && u.y >= y0 && u.y < y1) {
        return bad('Gegnerische Einheit im Weg');
      }
    }

    const p = this.placePayer(team, type, mx, my, carried);
    if (p.reason) return bad(p.reason);
    return { ok: true, reason: null, cx, cy, x: mx, y: my, payer: p.payer };
  }

  /**
   * Wer zahlt einen Bau mit Mitte (mx, my) (Teil von canPlace): { payer } oder { reason }. FOB: Abstände und Höchstzahl, kein Zahler;
   * im Bauradius einer FOB zahlt deren Lager (getragenes Baumaterial: niemand); Mauer/Tor außerhalb: ein eigener LKW in Reichweite.
   */
  placePayer(team, type, mx, my, carried) {
    const def = BUILDINGS[type];
    if (type === 'fob') {
      let count = 0;
      for (const b of this.buildings) {
        if (!b.alive || b.team !== team || b.type !== 'fob') continue;
        count++;
        if (dist(b.x, b.y, mx, my) < BALANCE.fob.minDistOwn) return { reason: 'Zu nah an einer eigenen FOB' };
      }
      if (count >= BALANCE.fob.max) return { reason: `Höchstens ${BALANCE.fob.max} FOBs möglich` };
      for (const b of this.buildings) {
        if (b.alive && b.team !== team && dist(b.x, b.y, mx, my) < BALANCE.fob.minDistEnemy) return { reason: 'Zu nah an einem gegnerischen Gebäude' };
      }
      return { payer: null };
    }
    if (this.fobsInRadius(team, mx, my).length) {
      if (carried) return { payer: null };
      const f = this.payerFor(team, mx, my, def.cost);
      return f ? { payer: { kind: 'fob', id: f.id } } : { reason: this.stockReason(team, mx, my, def.cost) };
    }
    if (WALL_TYPES.has(type) && !carried) {
      const tr = this.truckPayer(team, mx, my, def.cost);
      if (tr) return { payer: { kind: 'truck', id: tr.id } };
    }
    return { reason: 'Außerhalb des Bauradius einer eigenen FOB' };
  }

  // ---- Befehle ------------------------------------------------------------------

  /** Befehl ausführen. Liefert { ok: true, … } oder { ok: false, reason }. */
  issue(team, cmd) {
    if (!cmd || !this.teams[team]) return fail('Unbekannter Befehl');
    if (this.winner !== null) return fail('Partie ist beendet');
    const c = commandOf(cmd.type); // Befehlsregister js/game/commands.js
    return c ? c.run(this, team, cmd) : fail('Unbekannter Befehl');
  }

  /** Debug-Befehl (nur mit `debug` im Spiel, ?debug=1): money = Geld dazu; weather (+ season) = Wetter setzen, hold = es bleibt so. */
  cmdDebug(team, cmd) {
    if (!this.debug) return fail('Nur im Debug-Modus');
    if (cmd.weather && !WEATHER_NAMES[cmd.weather]) return fail('Unbekanntes Wetter');
    if (cmd.money) this.teams[team].res.money += cmd.money;
    if (cmd.weather) {
      setWeather(this, cmd.weather, cmd.season);
      if (cmd.hold) this.weather.next = Infinity;
    }
    return { ok: true };
  }

  ownUnits(team, ids = []) {
    const out = [];
    for (const id of new Set(ids)) {
      const e = this.entities.get(id);
      if (e && e.alive && e.kind === 'unit' && e.team === team) out.push(e);
    }
    return out;
  }

  /**
   * Bauer aus `ids` für Gebäude `type`. Ohne ids: leer (idle Bauer helfen automatisch).
   * Mit ids, aber ohne passendes Baurecht: Fehlergrund.
   */
  pickBuilders(team, ids, type) {
    if (!ids || !ids.length) return { list: [], reason: null };
    const list = this.ownUnits(team, ids).filter((u) => canBuild(u.def, type));
    if (list.length) return { list, reason: null };
    return {
      list,
      reason: WALL_TYPES.has(type) ? 'Nur Infanterie und Baufahrzeuge bauen Mauern und Tore' : 'Nur Baufahrzeuge bauen das',
    };
  }

  /** `{ type: 'build', ids, siteId }`: Bauer an eine bestehende eigene Baustelle schicken. */
  cmdJoinSite(team, cmd) {
    const site = this.getEntity(cmd.siteId);
    if (!site || site.kind !== 'building' || site.team !== team || site.built) return fail('Keine eigene Baustelle');
    const pick = this.pickBuilders(team, cmd.ids, site.type);
    if (pick.reason) return fail(pick.reason);
    if (!pick.list.length) return fail('Keine Bauer gewählt');
    for (const u of pick.list) orderBuild(u, site);
    return { ok: true, count: pick.list.length };
  }

  /** Freie Formationspunkte im 24-px-Raster um (x, y), nach Entfernung sortiert. */
  formationSpots(team, x, y, n) {
    const step = 24;
    const R = Math.ceil(Math.sqrt(n)) + 4;
    const cand = [];
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const dx = i * step;
        const dy = j * step;
        cand.push({ dx, dy, d: Math.hypot(dx, dy) });
      }
    }
    cand.sort((a, b) => a.d - b.d || a.dy - b.dy || a.dx - b.dx);
    const out = [];
    for (const c of cand) {
      if (out.length >= n) break;
      const px = x + c.dx;
      const py = y + c.dy;
      if (this.grid.passable(this.grid.toCell(px), this.grid.toCell(py), team)) out.push({ x: px, y: py });
    }
    while (out.length < n) {
      const p = nearestPassable(this.grid, x, y, team) || { x, y };
      out.push(p);
    }
    return out;
  }

  /**
   * { type: 'move'|'attackMove', ids, x, y, formation? }: ohne Formation (oder 'loose') je Einheit der nächste freie Rasterpunkt um das
   * Ziel; mit 'line', 'wedge' oder 'column' (ab zwei Bodeneinheiten) Plätze der Formation, die Gruppe fährt geschlossen (formation.js).
   * Liefert die Zielpunkte (slots) für die Wegmarke.
   */
  cmdMove(team, cmd) {
    const units = this.ownUnits(team, cmd.ids);
    if (!units.length) return fail('Keine eigenen Einheiten gewählt');
    const tx = Math.min(Math.max(cmd.x, 0), W);
    const ty = Math.min(Math.max(cmd.y, 0), H);
    const go = (u, x, y, form) => {
      u.targetId = null;
      u.fireTarget = null; // Artillerie: neuer Marsch beendet das Feuer auf den Punkt
      u.order = { type: cmd.type, x, y, targetId: null, ...(form ? { form } : {}) };
      planPath(this, u, x, y);
      if (u.path.length === 0) setIdle(u);
    };
    const kind = FORMATIONS.includes(cmd.formation) ? cmd.formation : 'loose';
    if (kind !== 'loose' && units.filter((u) => !u.def.air).length >= 2) {
      const { slots, speed } = formationSlots(this, team, units, tx, ty, kind);
      const id = ++this.formationSeq;
      this.formations.set(id, { id, speed, ids: slots.filter((p) => !p.u.def.air).map((p) => p.u.id) });
      for (const p of slots) go(p.u, p.x, p.y, p.u.def.air ? 0 : id);
      return { ok: true, count: units.length, formation: kind, slots: slots.map((p) => ({ x: p.x, y: p.y })) };
    }
    units.sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty) || a.id - b.id);
    const spots = this.formationSpots(team, tx, ty, units.length);
    units.forEach((u, i) => go(u, spots[i].x, spots[i].y, 0));
    return { ok: true, count: units.length, formation: 'loose', slots: spots };
  }

  /** { type: 'attack', ids, targetId }: gegnerische Einheit, Gebäude, besetztes Haus oder eine intakte Brücke (nur auf Befehl). */
  cmdAttack(team, cmd) {
    const t = this.getEntity(cmd.targetId);
    if (!canAttack(team, t)) return fail('Ziel ungültig');
    const armed = this.ownUnits(team, cmd.ids).filter((u) => u.def.range > 0);
    const units = armed.filter((u) => !u.crate); // Kistenträger schießen nicht
    if (!units.length) return fail(armed.length ? 'Kistenträger schießen nicht' : 'Keine bewaffnete Einheit gewählt');
    const aim = t.house ? this.getEntity(t.house) : t;
    for (const u of units) {
      // Besatzer bleiben im Haus, solange das Ziel aus den Fenstern erreichbar ist und durch eine Fensterseite liegt (houseCanFire, seit v5.67);
      // sonst gehen sie hinaus und verfolgen es
      const h = u.house ? this.getEntity(u.house) : null;
      if (u.house && !(h && aim && inRange(u, aim, u.def.range * rangeMul(this, u) + h.reach) && houseCanFire(this, u, aim))) exitHouse(this, u, t.x, t.y);
      u.order = { type: 'attack', x: t.x, y: t.y, targetId: t.id };
      u.targetId = t.id;
      u.path = [];
      u.pathIndex = 0;
      u.repathTimer = 0;
    }
    return { ok: true, count: units.length };
  }

  /**
   * { type: 'build', ids?, building, x, y }: Gebäude als Baustelle (bezahlt aus dem Lager am Bauort).
   * ids = Bauer, die sofort hinfahren; ohne ids helfen idle Bauer automatisch.
   */
  cmdBuild(team, cmd) {
    if (cmd.siteId) return this.cmdJoinSite(team, cmd);
    const def = BUILDINGS[cmd.building];
    if (!def || def.buildable === false) return fail('Dieses Gebäude kann nicht gebaut werden');
    const pick = this.pickBuilders(team, cmd.ids, cmd.building);
    if (pick.reason) return fail(pick.reason);
    const carried = paysCarried(pick.list);
    const p = this.canPlace(team, cmd.building, cmd.x, cmd.y, { carried });
    if (!p.ok) return fail(p.reason);
    if (!this.canAfford(team, def.cost)) return fail(this.missingMoney());
    if (carried && carriedBm(pick.list) < (def.cost.bm || 0)) return fail(NO_CARRIED);
    this.pay(team, def.cost);
    const payer = p.payer ? this.getEntity(p.payer.id) : null;
    if (payer) takeStock(payer, def.cost);
    else if (carried) takeCarried(pick.list, def.cost.bm || 0);
    const b = this.spawnBuilding(cmd.building, team, p.cx, p.cy, { built: false, payerId: payer ? payer.id : null });
    if (def.radio) radioStarted(this, b);
    for (const u of pick.list) orderBuild(u, b);
    return { ok: true, id: b.id };
  }

  /** { type: 'buildWall', building: 'wall'|'gate', ids?, x1, y1, x2, y2 }: Linie, Zelle für Zelle bezahlt. */
  cmdBuildWall(team, cmd) {
    if (cmd.building !== 'wall' && cmd.building !== 'gate') return fail('Nur Mauer oder Tor als Linie');
    const def = BUILDINGS[cmd.building];
    const pick = this.pickBuilders(team, cmd.ids, cmd.building);
    if (pick.reason) return fail(pick.reason);
    const g = this.grid;
    const cells = lineCells(g.toCell(cmd.x1), g.toCell(cmd.y1), g.toCell(cmd.x2), g.toCell(cmd.y2));
    if (cells.length > BALANCE.construction.wallMax) return fail(`Mauerzug zu lang (höchstens ${BALANCE.construction.wallMax} Zellen)`);
    const sites = [];
    const carried = paysCarried(pick.list);
    let lastReason = 'Keine Zelle baubar';
    for (const [c, r] of cells) {
      const p = this.canPlace(team, cmd.building, g.center(c), g.center(r), { carried });
      if (!p.ok) {
        lastReason = p.reason;
        continue;
      }
      if (!this.canAfford(team, def.cost)) {
        lastReason = this.missingMoney();
        break;
      }
      if (carried && carriedBm(pick.list) < (def.cost.bm || 0)) {
        lastReason = NO_CARRIED;
        break;
      }
      this.pay(team, def.cost);
      const payer = p.payer ? this.getEntity(p.payer.id) : null;
      if (payer) takeStock(payer, def.cost);
      else if (carried) takeCarried(pick.list, def.cost.bm || 0);
      sites.push(this.spawnBuilding(cmd.building, team, p.cx, p.cy, { built: false, payerId: payer ? payer.id : null }));
    }
    if (sites.length === 0) return fail(lastReason);
    if (pick.list.length) orderBuildSeq(pick.list, sites);
    return { ok: true, count: sites.length };
  }

  /**
   * { type: 'deploy', ids, x?, y? }: gewählte FOB-Fahrzeuge (UNITS.*.deploys) werden an ihrer Stelle sofort zur fertigen FOB
   * (ohne Bauzeit, Regeln von canPlace: Abstände, Höchstzahl). Blockiert dort etwas (Baum, Haus), nimmt sie die nächste
   * freie Stelle bis BALANCE.fob.deploySnap px entfernt. Mit x, y (KI: geplanter Standort) zählt dieser Punkt statt der
   * Stelle des Fahrzeugs; er darf höchstens deploySnap px vom Fahrzeug entfernt sein. Die FOB startet mit BALANCE.fob.startStock ihres Lagers je Sorte;
   * das Fahrzeug verschwindet (kein Wrack). Liefert { ok, ids } (neue FOBs) oder den Grund des ersten Fehlschlags.
   */
  cmdDeploy(team, cmd) {
    const list = this.ownUnits(team, cmd.ids).filter((u) => u.def.deploys && !u.house);
    if (!list.length) return fail('Kein FOB-Fahrzeug gewählt');
    const ids = [];
    let reason = '';
    for (const u of list) {
      const at = Number.isFinite(cmd.x) && Number.isFinite(cmd.y) ? { x: cmd.x, y: cmd.y } : u;
      const p = dist(at.x, at.y, u.x, u.y) <= BALANCE.fob.deploySnap ? this.deploySpot(team, u.def.deploys, at.x, at.y) : { ok: false, reason: 'Zu weit vom FOB-Fahrzeug' };
      if (!p.ok) {
        reason ||= p.reason;
        continue;
      }
      const f = this.spawnBuilding(u.def.deploys, team, p.cx, p.cy, { built: true });
      for (const k of STOCK_KEYS) f.store[k] = Math.round(BALANCE.logistics.storeCap * BALANCE.fob.startStock);
      setIdle(u);
      u.alive = false; // hp bleibt: cleanup entfernt es ohne Wrack und ohne Abschussprämie
      ids.push(f.id);
      this.message(team, `${f.def.name} aufgebaut`, f.x, f.y);
    }
    if (!ids.length) return fail(reason);
    return { ok: true, ids };
  }

  /** Platz für ein aufgebautes Gebäude: (x, y) selbst, sonst die nächste zulässige Stelle in Ringen bis fob.deploySnap px. */
  deploySpot(team, type, x, y) {
    const first = this.canPlace(team, type, x, y);
    if (first.ok) return first;
    for (let r = TILE; r <= BALANCE.fob.deploySnap; r += TILE) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const p = this.canPlace(team, type, x + Math.cos(a) * r, y + Math.sin(a) * r);
        if (p.ok) return p;
      }
    }
    return first;
  }

  /**
   * { type: 'mortarTarget', ids, x, y }: gewählte eigene Mörser feuern auf den Punkt (ohne x/y: Ziel löschen).
   * Nur Mörser in Reichweite (zwischen minRange und range) nehmen das Ziel an.
   */
  cmdMortarTarget(team, cmd) {
    const mortars = [];
    const guns = []; // Artillerie-Einheiten (Panzerhaubitze, seit v5.19)
    for (const id of new Set(cmd.ids || [])) {
      const b = this.getEntity(id);
      if (b && b.kind === 'building' && b.team === team && b.def.weapon && b.def.weapon.shell) mortars.push(b);
      else if (b && b.kind === 'unit' && b.alive && b.team === team && b.def.indirect) guns.push(b);
    }
    if (!mortars.length && !guns.length) return fail('Kein Mörser und keine Artillerie gewählt');
    if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) {
      for (const b of [...mortars, ...guns]) b.fireTarget = null;
      return { ok: true, count: mortars.length + guns.length };
    }
    let n = 0;
    let reason = 'Ziel außer Reichweite';
    for (const u of guns) {
      const w = u.weapons.find((x) => x.spec.shell)?.spec;
      const d = dist(u.x, u.y, cmd.x, cmd.y);
      const max = w.range * rangeMul(this, u);
      if (d > max) reason = `Ziel außer Reichweite (max. ${Math.round(max)} px)`;
      else if (d < w.minRange) reason = `Ziel zu nah (min. ${w.minRange} px)`;
      else {
        setIdle(u);
        u.fireTarget = { x: cmd.x, y: cmd.y };
        n++;
      }
    }
    for (const b of mortars) {
      if (!b.built) {
        reason = 'Mörser ist noch im Bau';
        continue;
      }
      const d = dist(b.x, b.y, cmd.x, cmd.y);
      const w = b.def.weapon;
      if (d > w.range) reason = `Ziel außer Reichweite (max. ${w.range} px)`;
      else if (d < w.minRange) reason = `Ziel zu nah (min. ${w.minRange} px)`;
      else {
        b.fireTarget = { x: cmd.x, y: cmd.y };
        n++;
      }
    }
    if (!n) return fail(reason);
    return { ok: true, count: n };
  }

  /** { type: 'train', buildingId, unit }: Hauptstadt, mit Stadt Kaserne/Fabrikhalle/Heliport; Einheiten kosten Geld (mit Forschung erst ab ihrer Stufe). */
  cmdTrain(team, cmd) {
    const b = this.getEntity(cmd.buildingId);
    if (!b || b.kind !== 'building' || b.team !== team) return fail('Kein eigenes Gebäude gewählt');
    if (!b.built) return fail('Gebäude ist noch im Bau');
    if (!UNITS[cmd.unit] || !b.produces?.includes(cmd.unit)) { // Stadtgebäude ohne Ausbildung haben kein produces
      const k = this.city && trainerKind(cmd.unit);
      return fail(k ? `${UNITS[cmd.unit]?.name ?? 'Einheit'}: nur in der ${KIND_NAME[k]} der Stadt` : 'Nur die Hauptstadt bildet Einheiten aus');
    }
    const jetNo = trainCheck(this, b, cmd.unit) ?? (UNITS[cmd.unit].air && !UNITS[cmd.unit].jet ? heliTrainCheck(this, b, cmd.unit) : null); // Stellplatz bzw. Heliport: ein Luftfahrzeug je Platz
    if (jetNo) return fail(jetNo);
    if (b.queue.length >= BALANCE.queueMax) return fail('Warteschlange ist voll');
    if (this.slotsUsed(team) + (UNITS[cmd.unit].slots ?? 1) > BALANCE.slotCap) return fail('Einheitenlimit erreicht');
    if (UNITS[cmd.unit].hero && hasCommander(this, team)) return fail(ONE_COMMANDER);
    if (this.city && freePop(this, team) < crewOf(cmd.unit)) return fail('Zu wenig freie Einwohner (Stadt: Wohnen ausbauen)');
    const cost = UNITS[cmd.unit].cost;
    if (!this.canAfford(team, cost)) return fail(this.missingMoney());
    if (!payMetal(this, team, cmd.unit)) return fail('Zu wenig Stahl (Stadt: Erzmine, Hütte und Stahlwerk oder Markt)');
    this.pay(team, cost);
    b.queue.push({ unit: cmd.unit, payerId: b.id });
    b.queueTimes.push(0);
    return { ok: true };
  }

  /** Belegte Plätze eines Teams: lebende Einheiten, Passagiere und Warteschlangen, je nach `slots` der Sorte. */
  slotsUsed(team) {
    const s = (def) => def.slots ?? 1;
    let n = 0;
    for (const u of this.units) {
      if (!u.alive || u.team !== team) continue;
      n += s(u.def);
      for (const p of u.passengers) n += s(p.def);
    }
    for (const b of this.trainers(team)) for (const e of b.queue) n += s(UNITS[e.unit]);
    return n;
  }

  /** Lebende plus in Ausbildung befindliche Einheiten eines Teams. */
  unitCount(team) {
    let n = 0;
    for (const u of this.units) {
      if (u.alive && u.team === team) n += 1 + u.passengers.length;
    }
    for (const b of this.trainers(team)) n += b.queue.length;
    return n;
  }

  /** Lebende Infanterie eines Teams (inkl. Passagiere in Fahrzeugen) plus Infanterie in Ausbildungs-Warteschlangen; ohne Kommandeur. */
  soldierCount(team) {
    const soldier = (def) => def.armor === 'inf' && !def.hero;
    let n = 0;
    for (const u of this.units) {
      if (!u.alive || u.team !== team) continue;
      if (soldier(u.def)) n += 1;
      for (const p of u.passengers) if (soldier(p.def)) n += 1;
    }
    for (const b of this.trainers(team)) for (const e of b.queue) if (soldier(UNITS[e.unit])) n += 1;
    return n;
  }

  /** Lebende Gebäude eines Teams mit Warteschlange: eigene Gebäude und (mit Stadt, seit v4.96) Kaserne, Fabrikhalle, Heliport. */
  trainers(team) {
    const out = this.buildings.filter((b) => b.alive && b.team === team);
    return this.city ? out.concat(cityTrainers(this, team)) : out;
  }

  cmdCancelTrain(team, cmd) {
    const b = this.getEntity(cmd.buildingId);
    if (!b || b.kind !== 'building' || b.team !== team) return fail('Kein eigenes Gebäude gewählt');
    if (b.queue.length === 0) return fail('Nichts in der Warteschlange');
    const entry = b.queue.pop();
    b.queueTimes.pop();
    const cost = UNITS[entry.unit].cost;
    this.refund(team, cost);
    this.refundStock(team, entry.payerId, cost, 1, b.x, b.y);
    payMetal(this, team, entry.unit, -1); // Stahl zurück ins Stadtlager
    return { ok: true };
  }

  cmdRally(team, cmd) {
    const b = this.getEntity(cmd.buildingId);
    if (!b || b.kind !== 'building' || b.team !== team) return fail('Kein eigenes Gebäude gewählt');
    b.rallyX = cmd.x;
    b.rallyY = cmd.y;
    return { ok: true };
  }

  /**
   * Abriss: Gebäude erstatten 25 % Baumaterial an den Zahler (fertige), Baustellen 100 %.
   * Ein abgerissenes FOB-Lager geht an die nächste andere eigene FOB (FOBs erstatten kein Material).
   */
  cmdDemolish(team, cmd) {
    const b = this.getEntity(cmd.buildingId);
    if (!b || b.kind !== 'building' || b.team !== team) return fail('Kein eigenes Gebäude gewählt');
    if (b.main) return fail('Die Hauptstadt kann nicht abgerissen werden');
    const factor = b.built ? BALANCE.demolishRefund : 1;
    const stock = { bm: b.store.bm, mun: b.store.mun, fuel: b.store.fuel };
    b.demolished = true;
    b.alive = false; // vor den Erstattungen, damit die FOB selbst nicht als Ziel gilt
    b.hp = 0;
    this.grid.release(b); // Fläche sofort frei (cleanup gibt sie nur idempotent erneut frei)
    if (b.type === 'fob') {
      // FOBs werden nicht von einem Lager bezahlt: nur das eigene Lager geht an die nächste FOB
      this.refundStock(team, null, stock, 1, b.x, b.y);
    } else {
      this.refund(team, b.def.cost, factor);
      this.refundStock(team, b.payerId, b.def.cost, factor, b.x, b.y);
    }
    return { ok: true };
  }

  // ---- Simulation ---------------------------------------------------------------

  endGame(winner, reason) {
    this.winner = winner;
    this.winReason = reason;
    const how = reason === 'points' ? 'nach Punkten' : reason === 'radio' ? 'durch den Sendemast' : 'durch Eliminierung';
    this.message(-1, `${BALANCE.teamNames[winner]} gewinnt ${how}`);
  }

  /** Fällt die Hauptstadt eines Teams, ist es verloren (nur sie bildet Einheiten aus). */
  checkElimination() {
    const lost = [];
    for (let t = 0; t < 2; t++) if (!this.mainFob(t)) lost.push(t);
    if (lost.length === 0) return;
    const winner = lost.length === 1 ? 1 - lost[0] : this.teams[0].points >= this.teams[1].points ? 0 : 1;
    this.endGame(winner, 'eliminated');
  }

  ageEffects(dt) {
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.life);
  }

  /** Geld für ein Team (Abschuss, Bau); ab `bounty.notify` mit Meldung. */
  reward(team, amount, why = '') {
    if (!(amount > 0)) return;
    this.teams[team].res.money += amount;
    this.teams[team].earned = (this.teams[team].earned || 0) + amount;
    if (why && amount >= BALANCE.bounty.notify) this.message(team, `+${amount} Geld: ${why}`);
  }

  /** Abschussprämie für den Gegner: Soldaten wenig, Fahrzeuge und Hubschrauber viel (Anteil am Preis), Gebäude außer Mauern und Toren. */
  bounty(dead) {
    const B = BALANCE.bounty;
    const foe = 1 - dead.team;
    if (foe < 0 || foe > 1 || !this.teams[foe]) return;
    if (dead.kind === 'unit') {
      const frac = dead.def.armor === 'inf' ? B.inf : B.vehicle;
      this.reward(foe, Math.round((dead.def.cost.money || 0) * frac), `${dead.def.name} zerstört`);
    } else if (dead.type !== 'wall' && dead.type !== 'gate') {
      this.reward(foe, Math.round((dead.def.cost.bm || 0) * B.building), `${dead.def.name} zerstört`);
    }
  }

  /** Höchste Zahl lebender Einheiten je Team (Statistik „Höchste Armeegröße“); von update() einmal je s Spielzeit aufgerufen. */
  sampleArmy() {
    const n = [0, 0];
    for (const u of this.units) if (u.alive) n[u.team] += 1 + (u.passengers?.length || 0); // wie slotsUsed: Passagiere zählen mit
    for (const t of this.teams) if (n[t.id] > t.stats.peakUnits) t.stats.peakUnits = n[t.id];
  }

  /** Tote entfernen; Gebäude geben ihren Fußabdruck frei. */
  cleanup() {
    const units = this.units;
    let k = 0;
    for (const u of units) {
      if (u.hp <= 0) u.alive = false;
      if (u.alive) units[k++] = u;
      else {
        this.entities.delete(u.id);
        if (u.house) dropOccupant(this, u);
        if (u.hp <= 0) {
          const fallen = 1 + (u.passengers?.length || 0); // Passagiere sterben mit dem Fahrzeug
          this.teams[u.team].stats.lost += fallen;
          this.teams[1 - u.team].stats.kills += fallen;
          this.addEffect('death', u.x, u.y, u.team, u.x, u.y, u.def.armor);
          addUnitWreck(this, u); // eingestiegene Passagiere (alive = false, hp > 0) hinterlassen nichts
          // gefallener Kommandeur, auch als Passagier eines zerstörten Fahrzeugs
          for (const h of [u, ...u.passengers]) if (h.def.hero) commanderFallen(this, h);
        }
      }
    }
    units.length = k;

    const bs = this.buildings;
    k = 0;
    for (const b of bs) {
      if (b.hp <= 0) b.alive = false;
      if (b.alive) {
        bs[k++] = b;
        continue;
      }
      this.grid.release(b);
      if (b.occupants?.length) ejectCrew(this, b);
      this.entities.delete(b.id);
      if (!b.demolished) {
        if (b.type !== 'wall' && b.type !== 'gate') {
          this.teams[b.team].stats.buildingsLost++;
          this.teams[1 - b.team].stats.buildingsKilled++;
        }
        this.addEffect('explosion', b.x, b.y, b.team, b.x, b.y, 'building');
        addBuildingWreck(this, b);
        this.message(b.team, `${b.def.name} zerstört`, b.x, b.y);
        if (b.def.radio) radioLost(this, b);
      }
    }
    bs.length = k;
  }

  /** Ein Simulationsschritt (dt in Sekunden). */
  update(dt) {
    if (this.winner !== null) {
      this.ageEffects(dt);
      return;
    }
    this.time += dt;
    // Reihenfolge: Wetter zuerst (Sicht und Tempo), dann Forschung; Wirtschaft setzt team.rate zurück; Bewegung, Logistik, Bau und Brückenbau fahren; Kampf, Zone,
    // Einkommen zuletzt
    updateWeather(this, dt);
    updateResearch(this, dt);
    updateAbilities(this, dt);
    updateEconomy(this, dt);
    updateCity(this, dt);
    updateGarrison(this, dt);
    updateTowers(this, dt);
    updateFormations(this);
    updateMovement(this, dt, OWN_DRIVERS);
    updateAircraft(this, dt); // Jets: Flug, Rückkehr, Landung, Rollen, Tanken am Stellplatz (seit v5.03, Fliegerhorst seit v5.35)
    updateHelis(this, dt); // Hubschrauber: Start, Landung, Tanken am Heliport (seit v5.51)
    updateCrates(this, dt);
    updateLogistics(this, dt);
    updateConstruction(this, dt);
    updateDig(this, dt); // Bagger räumen Stadtzellen (seit v5.35)
    updateBridges(this, dt);
    separate(this);
    updateCommanders(this, dt);
    updateCombat(this, dt);
    updateZone(this, dt);
    updateHot(this, dt);
    updateRadio(this, dt);
    smoothIncome(this, dt);

    this.statTimer += dt;
    if (this.statTimer >= 1) {
      this.statTimer -= 1;
      this.sampleArmy();
    }

    this.fogTimer += dt;
    if (this.fogTimer >= BALANCE.fogInterval) {
      this.fogTimer = 0;
      this.updateFog();
    }

    updateAnimals(this, dt);
    this.ageEffects(dt);
    this.cleanup();
    updateScars(this);
    if (this.winner === null) this.checkElimination();
    this.pathWork = 0; // Wegbudget (pathplan.js): gilt für KI-Befehle und Simulation bis zum Ende des nächsten Schritts
    this.pathShare = [];
  }
}
