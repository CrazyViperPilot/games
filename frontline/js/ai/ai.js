// KI-Gegner (docs/verlauf.md §5, §10.2, §11.5). Steuert nur über game.issue und liest den Zustand. Kein DOM.
// Reihenfolge je Denkschritt: Baustellen pflegen, Verteidigung, Rückzug, Expansion (FOB-Baustellen: Zone, Relais, Flanken),
// Forschung, Produktion (nur Hauptstadt), Verteidigungsgebäude und Mauer, Brücken, Baufahrzeuge, LKW (Lieferant/Pendler/Versorger), Sammelpunkte, Armee.

import { CITY } from '../data/city.js';
import { cityAiMemory, aiCity, aiRaid, aiDefend } from './cityai.js';
import { cityTrainers } from '../game/city/query.js';
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { makeRng } from '../core/rng.js';
import { ZONE_BAN, MAX_PLACE, ALARM_TIME } from '../data/ai.js';
import { DEF_RANGE, ZONE_FOB_R, dist, unitVec } from './army/util.js';
import { buildMethods } from './army/build.js';
import { produceMethods } from './army/produce.js';
import { logisticsMethods } from './army/logistics.js';
import { combatMethods } from './army/combat.js';

export class AI {
  constructor(game, team, difficulty = 'normal') {
    this.game = game;
    this.team = team;
    this.difficulty = BALANCE.difficulty[difficulty] ? difficulty : 'normal';
    this.cfg = BALANCE.difficulty[this.difficulty];
    this.rng = makeRng(game.seed + team);
    this.timer = this.cfg.think; // erster Denkschritt sofort
    this.budget = 0;
    this.corridor = null; // Gasse vor der Hauptstadt, in der nichts gebaut wird (Ausgang bleibt frei)
    this.badSites = []; // { x, y, until } fehlgeschlagene FOB-Ziele
    this.fobGoal = new Map(); // FOB-Fahrzeug-ID -> { x, y, tries } Ziel, an dem es aufbaut
    this.rallyAt = new Map(); // Gebäude-ID -> zuletzt gesetzter Sammelpunkt
    this.roles = new Map(); // LKW-ID -> 'pend' | 'vers'
    this.routes = new Map(); // LKW-ID -> { fromId, toId, k, t0 } (Pendler; fromId = Quelle, eine FOB oder ein eigenes Werk, seit v5.70)
    this.engTarget = new Map(); // Baufahrzeug-ID -> Baustelle, zu der es geschickt wurde
    this.supplyAt = new Map(); // Versorger-ID -> letzter Zielpunkt
    this.memo = new Map(); // Befehlsschlüssel -> Zeitpunkt (gegen Befehls-Spam)
    this.hadZoneFob = false; // eine Zonen-FOB (auch Baustelle) existierte im letzten Denkschritt
    this.saveForScout = false; // produce bildet keine Kampfeinheiten aus, bis der Späher bezahlt ist
    this.saveForFob = false; // ebenso, bis das nächste FOB-Fahrzeug bezahlt ist
    this.saveForRadio = false; // ebenso, bis der Sendemast bezahlt ist
    this.saveForResearch = false; // ebenso, bis die nächste Stufe bezahlt ist
    this.scoutHome = false; // Späher fliegt zum Auftanken heim
    this.seenFobs = new Map(); // Gebäude-ID -> gesehene gegnerische FOB
    this.fallbackUntil = 0; // bis dahin greift army nicht an (Gruppen-Rückzug läuft)
    this.raid = null; // laufender Flankenangriff { ids, targetId }
    this.lastWave = 0; // Zeitpunkt der letzten Angriffswelle
    this.zoneBan = 0; // bis dahin keine neue Zonen-FOB (nach Verlust, gegen Nachschub in den Tod)
    // Buchhaltung der Stadt-KI (seit v5.58 hier statt im Stadtzustand): Ausbautakte, Zeit seit dem letzten Überfall, letzter Verteidigungsbefehl
    this.cityMem = cityAiMemory();

    game.issue(team, { type: 'setDifficulty', difficulty: this.difficulty }); // Team als KI markieren, Einkommensfaktor (Regel 2)
  }

  update(dt) {
    if (this.game.winner !== null) return;
    this.timer += dt;
    if (this.timer < this.cfg.think) return;
    this.timer -= this.cfg.think;
    this.think();
  }

  think() {
    this.cityTimer = (this.cityTimer ?? 0) + this.cfg.think;
    if (this.game.city) {
      aiRaid(this.game, this.team, this.difficulty, this.cfg.think, this.cityMem); // Angriffe auf die gegnerische Stadt (Werke zuerst)
      aiDefend(this.game, this.team, this.cityMem); // eigene Stadt verteidigen
    }
    if (this.game.city && this.cityTimer >= CITY.ai.interval[this.difficulty]) {
      this.cityTimer = 0;
      aiCity(this.game, this.team, this.difficulty, this.cityMem); // Stadt ausbauen: Ringe, Viertel, Förderung, Markt (cityai.js)
    }
    const s = this.snapshot();
    this.budget = MAX_PLACE;
    if (this.hadZoneFob && !s.zoneFob) this.zoneBan = this.game.time + ZONE_BAN;
    this.hadZoneFob = !!s.zoneFob;
    this.defend(s);
    this.retreat(s);
    this.fallBack(s);
    this.expand(s); // FOB-Fahrzeuge ausbilden, hinschicken und aufbauen
    this.scout(s); // vor produce: der Späher bekommt das Geld zuerst
    this.buildRadio(s);
    this.replaceCommander(s);
    this.research(s); // vor produce: die nächste Stufe bekommt das Geld zuerst
    this.produce(s);
    this.jets(s); // Fliegerhorst: F-16 kaufen und losschicken (seit v5.03)
    this.artillery(s); // Panzerhaubitzen hinter der Armee in Stellung (seit v5.26)
    this.buildDefense(s);
    this.buildWall(s);
    this.fortify(s);
    this.rebuildBridges(s);
    this.manageEngineers(s);
    this.manageTrucks(s);
    this.rally(s);
    this.garrisonZone(s);
    this.stormHouses(s); // Häuser stürmen (seit v5.67)
    this.fortifyHouses(); // eigene Besatzungshäuser ausbauen (seit v5.67)
    if (!this.attackRadio(s)) this.army(s); // steht ein gegnerischer Sendemast, gilt ihm der ganze Angriff
    this.guardCommander(s);
    this.collectCrates(s); // nach der Welle: Kisten holen nur, die zurückbleiben (Reserve, Nachschub)
  }

  // ---- Lesen des Zustands ---------------------------------------------------------

  snapshot() {
    const g = this.game;
    const t = this.team;
    const own = g.buildings.filter((b) => b.alive && b.team === t);
    const fobs = own.filter((b) => b.type === 'fob');
    const builtFobs = fobs.filter((b) => b.built).sort((a, b) => a.id - b.id);
    const units = g.units.filter((u) => u.alive && u.team === t);
    const home = builtFobs.find((b) => b.main) ?? null; // Hauptstadt
    const ax = home ? home.x : fobs[0] ? fobs[0].x : g.map.spawns[t].x;
    const ay = home ? home.y : fobs[0] ? fobs[0].y : g.map.spawns[t].y;
    const zone = g.zone;
    const dir = unitVec(zone.x - ax, zone.y - ay);
    // Gegner nur, soweit das eigene Team sie sieht (Nebel)
    const enemies = g.units.filter((u) => u.alive && u.team !== t && g.sees(t, u));
    this.corridor = home ? { x: home.x, y: home.y, dx: dir.x, dy: dir.y } : null;

    const combat = units.filter((u) => u.def.range > 0 && !u.crate && !u.def.hero && !u.def.jet && !u.def.indirect); // Kistenträger kämpfen nicht, der Kommandeur bleibt hinten, Jets führt jets(), Artillerie artillery()
    // Ausbildende Gebäude: Hauptstadt, mit Stadt (seit v4.96) Kaserne, Fabrikhalle und Heliport
    const producers = own.filter((b) => b.produces.length).concat(cityTrainers(g, t));
    const queuedCombat = producers.reduce((n, b) => n + b.queue.filter((e) => UNITS[e.unit ?? e].range > 0).length, 0);
    const zoneFob = fobs.find((f) => dist(f.x, f.y, zone.x, zone.y) <= ZONE_FOB_R + 16) ?? null;
    const alarm =
      !!home &&
      (own.some((b) => dist(b.x, b.y, ax, ay) <= DEF_RANGE && b.lastHitTime > g.time - ALARM_TIME) ||
        enemies.some((e) => dist(e.x, e.y, ax, ay) <= DEF_RANGE));

    return {
      own,
      producers,
      fobs,
      builtFobs,
      home,
      ax,
      ay,
      dir,
      zone,
      zoneFob,
      enemies,
      units,
      combat,
      artillery: units.filter((u) => u.def.indirect).sort((a, b) => a.id - b.id),
      combatN: combat.length + queuedCombat,
      commander: units.find((u) => u.def.hero) ?? null,
      pickupWorks: this.pickupWorks(), // eigene fertige Werke mit Ausgangslager (seit v5.70)
      trucks: units.filter((u) => u.type === 'truck').sort((a, b) => a.id - b.id),
      helis: units.filter((u) => u.type === 'transporter').sort((a, b) => a.id - b.id),
      engineers: units.filter((u) => u.type === 'engineer').sort((a, b) => a.id - b.id),
      fobTrucks: units.filter((u) => u.def.deploys).sort((a, b) => a.id - b.id),
      alarm,
    };
  }

  /** Befehls-Drosselung: true, wenn der Schlüssel seit `secs` s nicht benutzt wurde (und merkt ihn sich). */
  once(key, secs) {
    const now = this.game.time;
    if (now - (this.memo.get(key) ?? -1e9) < secs) return false;
    this.memo.set(key, now);
    return true;
  }
}

Object.assign(AI.prototype, buildMethods, produceMethods, logisticsMethods, combatMethods);
