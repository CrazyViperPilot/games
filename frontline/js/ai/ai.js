// KI-Gegner (docs/verlauf.md §5, §10.2, §11.5). Steuert nur über game.issue und liest den Zustand. Kein DOM.
// Reihenfolge je Denkschritt: Baustellen pflegen, Verteidigung, Rückzug, Expansion (FOB-Baustellen: Zone, Relais, Flanken),
// Forschung, Produktion (nur Haupt-FOB), Verteidigungsgebäude und Mauer, Brücken, Baufahrzeuge, LKW (Lieferant/Pendler/Versorger), Sammelpunkte, Armee.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { makeRng } from '../core/rng.js';
import { hasCommander } from '../game/commander.js';
import { radioEta } from '../game/radio.js';
import { weatherSight } from '../game/weather.js';
import { unitLocked, researchBlock } from '../game/research.js';

const MAX_PLACE = 100; // canPlace-Aufrufe je Denkschritt (Budget für die Platzsuche)
const DEF_RANGE = BALANCE.fob.buildRadius; // Bauradius = Verteidigungsradius einer FOB
const FOB_COST = BALANCE.construction.fobMaterial; // Baumaterial, das eine FOB-Baustelle braucht
const ZONE_FOB_R = BALANCE.zone.r * 0.6; // Zonen-FOB: Mittelpunkt höchstens so weit von der Zonenmitte
const THREAT_RANGE = 900; // Kampfeinheiten in dieser Nähe zur Bedrohung reagieren
const THREAT_DANGER = 600; // Gegner in dieser Nähe machen ein FOB-Ziel unattraktiver
const GATHER_DIST = 300; // Sammelpunkt Richtung Zone, vom Zentrum der Haupt-FOB
const ZONE_GATHER_DIST = 150; // Sammelpunkt an der Zonen-FOB, Richtung eigener Basis
const RALLY_MOVE = 150; // Sammelpunkt-Befehl nur neu setzen, wenn sich der Punkt so weit verschiebt
const RELAY_STEP = 1000; // Abstand der Relais-FOBs auf dem Weg zur Zone (Bauradien dürfen sich nicht überlappen)
const FLANK_R = 1000; // Flanken-FOBs: Abstand zur Zonen-FOB
const RESERVE = 0.2; // Anteil der Angriffsgruppe, der als Reserve an der Haupt-FOB bleibt (ab 5 Einheiten)
const SITE_TIMEOUT = 200; // s, eine FOB-Baustelle ohne Material wird danach abgerissen
const BAD_TIME = 240; // s, Sperre eines fehlgeschlagenen FOB-Ziels
const ALARM_TIME = 30; // s, Treffer an der Basis gelten als Angriff auf die Basis
const DRY = 0.2; // Einheiten mit weniger Munition/Treibstoff (Anteil) ziehen sich zurück
const WALL_OFFSET = 4; // Mauer im Abstand (Zellen) vom Zentrum der Haupt-FOB
const WALL_HALF = 3; // Mauerlinie: 2 × WALL_HALF + 1 Zellen, Tor in der Mitte
const MIX = { rifleman: 0.5, at: 0.2, ifv: 0.2, tank: 0.1 }; // Zielanteile der Kampfeinheiten
const THREAT_PER_UNIT = 150; // mittlerer Geldwert einer Kampfeinheit (Mix) für die Schätzung einer Besatzung
const FOB_CAP = { easy: 3, normal: 5, hard: 7 }; // FOB-Grenze je Schwierigkeit mit Haupt-FOB (Spielmaximum 10)
const WAVE_ODDS = 1.2; // Welle greift nur an, wenn ihr Wert mindestens so viel Mal die geschätzte Zonenbesatzung beträgt
const WAVE_PATIENCE = 600; // s ohne Welle, bis die geforderte Stärke auf WAVE_MIN fällt
const WAVE_MIN = 0.6; // Untergrenze des Geduld-Faktors
const SCOUT_MIN_ARMY = 10; // Kampfeinheiten, ab denen sich die KI einen Späher leistet
const SCOUT_MONEY = UNITS.littlebird.cost.money; // Geld, ab dem ein Späher ausgebildet wird
const SCOUT_FROM = 180; // s Spielzeit, ab der ein Späher gebaut wird
const SCOUT_FUEL = 0.35; // Späher kehrt unter diesem Treibstoffanteil zur Haupt-FOB zurück
const SCOUT_REFILL = 0.9; // und fliegt erst wieder aus, wenn der Tank so voll ist
const WX_SCOUT_SIGHT = 0.9; // Sichtfaktor (Wetter), unter dem der Späher früher kommt:
const WX_SCOUT_ARMY = 5; // schon ab so vielen Kampfeinheiten
const WX_SCOUT_FROM = 90; // und ab dieser Spielzeit (s)
const WX_FOG_SIGHT = 0.7; // Sichtfaktor (Nebel), bis zu dem die Welle die Deckung nutzt:
const WX_FOG_WAVE = 0.85; // sie geht schon mit diesem Anteil der geforderten Stärke los
const COUNTER_MIN = 8; // sichtbare gegnerische Kampfeinheiten, ab denen die Mischung angepasst wird
const COUNTER_WEIGHT = 0.8; // Stärke der Anpassung (0 = Grundmischung)
const RAID_MIN = 12; // Besatzung ab so vielen freien Einheiten schickt einen Überfall auf eine gegnerische FOB
const RAID_SHARE = 0.3; // Anteil der Besatzung für den Überfall
const FALLBACK_ODDS = 1.8; // Gruppe zieht ab, wenn die Gegner im Feuer so viel Mal ihren Wert übertreffen
const FALLBACK_MIN_FOES = 4; // und mindestens so viele Gegner sichtbar sind
const FALLBACK_DIST = 1400; // Rückzugsstrecke Richtung Basis
const FALLBACK_HOLD = 30; // s, in denen nach einem Rückzug keine Angriffsbefehle kommen
const KEYS = ['bm', 'mun', 'fuel'];
const CAP = BALANCE.logistics.truckCapacity;
const ENG_NEAR = 250; // Baufahrzeug näher an einer Baustelle: die automatische Zuweisung übernimmt
const SUPPLY_BEHIND = 150; // Versorger steht so weit hinter dem Schwerpunkt der Armee
const SUPPLY_MIN = 0.25; // Versorger lädt nach, wenn die Ladung unter diesem Anteil liegt
const SURPLUS_MIN = 120; // Pendler fährt nur, wenn die Quelle so viel Überschuss hat
const ROUTE_HOLD = 20; // s, früheste Neuplanung einer Pendler-Route
const GARRISON_SHARE = 0.4; // Anteil der Infanterie in der Zone, der Stadthäuser besetzt (Häuserkampf)
const GARRISON_RANGE = 500; // ein Soldat geht nur in ein Haus in diesem Umkreis
const GARRISON_EVERY = 8; // s zwischen zwei Besetzungsrunden
const CRATE_EVERY = 6; // s zwischen zwei Runden der Kistensuche
const CRATE_RANGE = 4500; // ein Soldat holt nur Kisten in diesem Umkreis
const CRATE_PICKERS = { easy: 1, normal: 2, hard: 3 }; // so viele Soldaten holen oder tragen gleichzeitig Kisten
const CMD_BEHIND = 220; // Kommandeur steht so weit hinter dem Schwerpunkt der Armee (seine Aura reicht 300 px)
const CMD_DANGER = 450; // sichtbare Gegner so nah: der Kommandeur weicht zur Haupt-FOB aus
const CMD_MOVE = 200; // neuer Marschbefehl erst, wenn der Wunschplatz so weit vom alten Ziel liegt
const CMD_RESERVE = 300; // Geld, das nach der Ausbildung eines neuen Kommandeurs übrig bleiben soll
const CMD_FROM = 90; // s Spielzeit, ab der ein gefallener Kommandeur ersetzt wird
const RADIO_FROM = { easy: Infinity, normal: 720, hard: 540 }; // s Spielzeit, ab der die KI einen Sendemast baut (Leicht nie)
const RADIO_SITE = [220, 460]; // Abstand des Masts von der Haupt-FOB, zur Rückseite (weg von der Zone)
const RADIO_NEAR = 500; // so nah am gegnerischen Mast greifen Einheiten ihn direkt an
const RADIO_EVERY = 5; // s zwischen zwei Angriffsrunden auf den gegnerischen Mast
const RADIO_GATHER = 40; // s höchstens sammelt sich die Armee vor dem Schlag gegen den Mast
const RADIO_GATHER_R = 600; // Sammelradius; ab RADIO_GATHER_SHARE der Armee darin geht es los
const RADIO_GATHER_SHARE = 0.7;
const UPGRADES = ['vests', 'optics', 'composite']; // Reihenfolge der Verbesserungen (Forschung)
const UPGRADE_RESERVE = 400; // Geld, das nach einer Verbesserung übrig bleiben soll (sie kommt nur aus Überschuss)
const BRIDGE_EVERY = 10; // s zwischen zwei Prüfungen der eigenen Brücken
const BRIDGE_RESERVE = 150; // Geld, das nach dem Wiederaufbau einer Brücke übrig bleiben soll
const DEG = Math.PI / 180;
const SITE_ANGLES = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180].map((d) => d * DEG);
const TWO_PI = Math.PI * 2;

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const TILE = BALANCE.map.tile;

function unitVec(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}


/** Summe der Ladung eines LKW. */
const cargoTotal = (u) => u.cargo.bm + u.cargo.mun + u.cargo.fuel;

export class AI {
  constructor(game, team, difficulty = 'normal') {
    this.game = game;
    this.team = team;
    this.difficulty = BALANCE.difficulty[difficulty] ? difficulty : 'normal';
    this.cfg = BALANCE.difficulty[this.difficulty];
    this.rng = makeRng(game.seed + team);
    this.timer = this.cfg.think; // erster Denkschritt sofort
    this.budget = 0;
    this.corridor = null; // Gasse vor der Haupt-FOB, in der nichts gebaut wird (Ausgang bleibt frei)
    this.badSites = []; // { x, y, until } fehlgeschlagene FOB-Ziele
    this.siteSeen = new Map(); // FOB-Baustelle -> Zeitpunkt, seit dem sie auf Material wartet
    this.rallyAt = new Map(); // Gebäude-ID -> zuletzt gesetzter Sammelpunkt
    this.roles = new Map(); // LKW-ID -> 'lief' | 'pend' | 'vers'
    this.routes = new Map(); // LKW-ID -> { fromId, toId, k, t0 } (Pendler)
    this.engTarget = new Map(); // Baufahrzeug-ID -> Baustelle, zu der es geschickt wurde
    this.supplyAt = new Map(); // Versorger-ID -> letzter Zielpunkt
    this.memo = new Map(); // Befehlsschlüssel -> Zeitpunkt (gegen Befehls-Spam)
    this.hadZoneFob = false; // eine Zonen-FOB (auch Baustelle) existierte im letzten Denkschritt
    this.saveForScout = false; // produce bildet keine Kampfeinheiten aus, bis der Späher bezahlt ist
    this.saveForRadio = false; // ebenso, bis der Sendemast bezahlt ist
    this.saveForResearch = false; // ebenso, bis die nächste Stufe bezahlt ist
    this.scoutHome = false; // Späher fliegt zum Auftanken heim
    this.seenFobs = new Map(); // Gebäude-ID -> gesehene gegnerische FOB
    this.fallbackUntil = 0; // bis dahin greift army nicht an (Gruppen-Rückzug läuft)
    this.raid = null; // laufender Flankenangriff { ids, targetId }
    this.lastWave = 0; // Zeitpunkt der letzten Angriffswelle
    this.zoneBan = 0; // bis dahin keine neue Zonen-FOB (nach Verlust, gegen Nachschub in den Tod)

    const t = game.teams[team];
    t.isAI = true;
    t.incomeMult = this.cfg.incomeMult;
  }

  update(dt) {
    if (this.game.winner !== null) return;
    this.timer += dt;
    if (this.timer < this.cfg.think) return;
    this.timer -= this.cfg.think;
    this.think();
  }

  think() {
    const s = this.snapshot();
    this.budget = MAX_PLACE;
    this.maintainSites(s);
    if (this.hadZoneFob && !s.zoneFob) this.zoneBan = this.game.time + 150;
    this.hadZoneFob = !!s.zoneFob;
    this.defend(s);
    this.retreat(s);
    this.fallBack(s);
    this.expand(s); // FOB-Baustellen setzen (Material liefert der Lieferant)
    this.scout(s); // vor produce: der Späher bekommt das Geld zuerst
    this.buildRadio(s);
    this.replaceCommander(s);
    this.research(s); // vor produce: die nächste Stufe bekommt das Geld zuerst
    this.produce(s);
    this.buildDefense(s);
    this.buildWall(s);
    this.rebuildBridges(s);
    this.manageEngineers(s);
    this.manageTrucks(s);
    this.rally(s);
    this.garrisonZone(s);
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
    const home = builtFobs.find((b) => b.main) ?? null; // Haupt-FOB
    const ax = home ? home.x : fobs[0] ? fobs[0].x : g.map.spawns[t].x;
    const ay = home ? home.y : fobs[0] ? fobs[0].y : g.map.spawns[t].y;
    const zone = g.zone;
    const dir = unitVec(zone.x - ax, zone.y - ay);
    // Gegner nur, soweit das eigene Team sie sieht (Nebel)
    const enemies = g.units.filter((u) => u.alive && u.team !== t && g.sees(t, u));
    this.corridor = home ? { x: home.x, y: home.y, dx: dir.x, dy: dir.y } : null;

    const combat = units.filter((u) => u.def.range > 0 && !u.crate && !u.def.hero); // Kistenträger kämpfen nicht, der Kommandeur bleibt hinten
    const queuedCombat = own.reduce((n, b) => n + b.queue.filter((e) => UNITS[e.unit ?? e].range > 0).length, 0);
    const zoneFob = fobs.find((f) => dist(f.x, f.y, zone.x, zone.y) <= ZONE_FOB_R + 16) ?? null;
    const alarm =
      !!home &&
      (own.some((b) => dist(b.x, b.y, ax, ay) <= DEF_RANGE && b.lastHitTime > g.time - ALARM_TIME) ||
        enemies.some((e) => dist(e.x, e.y, ax, ay) <= DEF_RANGE));
    // FOB-Baustellen, die noch auf ihr Baumaterial warten (Zonen-FOB zuerst)
    const needMat = fobs
      .filter((f) => !f.built && !f.supplied && f.store.bm < FOB_COST)
      .sort((a, b) => (b === zoneFob) - (a === zoneFob) || a.id - b.id);

    return {
      own,
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
      combatN: combat.length + queuedCombat,
      commander: units.find((u) => u.def.hero) ?? null,
      trucks: units.filter((u) => u.type === 'truck').sort((a, b) => a.id - b.id),
      engineers: units.filter((u) => u.type === 'engineer').sort((a, b) => a.id - b.id),
      needMat,
      alarm,
    };
  }

  /** Eingereihte Einheiten eines Typs in den Warteschlangen. */
  queued(s, unitType) {
    let n = 0;
    for (const b of s.own) for (const e of b.queue) if ((e.unit ?? e) === unitType) n++;
    return n;
  }

  fobCap() {
    return FOB_CAP[this.difficulty];
  }

  /** Befehls-Drosselung: true, wenn der Schlüssel seit `secs` s nicht benutzt wurde (und merkt ihn sich). */
  once(key, secs) {
    const now = this.game.time;
    if (now - (this.memo.get(key) ?? -1e9) < secs) return false;
    this.memo.set(key, now);
    return true;
  }

  // ---- Geld und Platzsuche ----------------------------------------------------------

  /** Kampfeinheit ausbilden: Geld da (Einheiten kosten nur Geld). */
  canTrain(type) {
    return this.game.teams[this.team].res.money >= (UNITS[type].cost.money || 0);
  }

  /** canPlace mit Budget; liefert das Ergebnis, wenn zulässig, sonst null. */
  place(type, x, y) {
    if (this.budget <= 0) return null;
    this.budget--;
    const p = this.game.canPlace(this.team, type, x, y);
    return p.ok ? p : null;
  }

  inCorridor(x, y) {
    const c = this.corridor;
    if (!c) return false;
    const rx = x - c.x;
    const ry = y - c.y;
    const along = rx * c.dx + ry * c.dy;
    const lat = Math.abs(-rx * c.dy + ry * c.dx);
    return along > 60 && along < 300 && lat < 130;
  }

  isBad(x, y) {
    const now = this.game.time;
    return this.badSites.some((b) => b.until > now && dist(b.x, b.y, x, y) < 120);
  }

  /**
   * Freie Stelle für `type` in Ringen um (cx, cy), Winkel bevorzugt um `angle` (Standard 0).
   * corridor: Gasse vor der Haupt-FOB meiden. Liefert {x, y} (Mitte des Fußabdrucks) oder null.
   */
  findSite(type, cx, cy, rMin, rMax, { angle = 0, corridor = false } = {}) {
    for (let r = rMin; r <= rMax; r += 32) {
      for (const o of SITE_ANGLES) {
        if (this.budget <= 0) return null;
        const a = angle + o;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (corridor && this.inCorridor(x, y)) continue;
        if (this.isBad(x, y)) continue;
        const p = this.place(type, x, y);
        if (p) return { x: p.x, y: p.y };
      }
    }
    return null;
  }

  /** Nächste begehbare Stelle für das Team (Ringsuche, max. 8 Zellen). */
  freeNear(x, y) {
    const g = this.game.grid;
    const c0 = g.toCell(x);
    const r0 = g.toCell(y);
    for (let rad = 0; rad <= 8; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
          if (g.passable(c0 + dc, r0 + dr, this.team)) return { x: g.center(c0 + dc), y: g.center(r0 + dr) };
        }
      }
    }
    return { x, y };
  }

  /** Höchster begehbarer Punkt auf einem Kreis (Radius r) um (x, y) oder die Mitte selbst: Höhenvorteil im Gefecht. */
  highGround(x, y, r) {
    const g = this.game;
    if (!g.relief) return { x, y };
    let best = { x, y };
    let bestH = -Infinity;
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * TWO_PI;
      const d = k === 8 ? 0 : r;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      if (!g.grid.passable(g.grid.toCell(px), g.grid.toCell(py), this.team)) continue;
      const h = g.relief.heightAt(px, py) + (k === 8 ? 4 : 0); // bei Gleichstand die Mitte
      if (h > bestH) {
        bestH = h;
        best = { x: px, y: py };
      }
    }
    return best;
  }

  /** Sammelpunkt: an der Zonen-FOB (Richtung Basis), sonst Richtung Zone vor der Haupt-FOB. */
  gatherPoint(s) {
    if (s.zoneFob && s.zoneFob.built) {
      const v = unitVec(s.ax - s.zoneFob.x, s.ay - s.zoneFob.y);
      const p = this.highGround(s.zoneFob.x + v.x * ZONE_GATHER_DIST, s.zoneFob.y + v.y * ZONE_GATHER_DIST, 120);
      return this.freeNear(p.x, p.y);
    }
    return this.freeNear(s.ax + s.dir.x * GATHER_DIST, s.ay + s.dir.y * GATHER_DIST);
  }

  /** Gegner (sichtbar) in der Nähe eines Punktes: Malus für FOB-Ziele. */
  danger(s, x, y) {
    return s.enemies.some((e) => dist(e.x, e.y, x, y) <= THREAT_DANGER) ? 2 : 0;
  }

  // ---- Verteidigung und Rückzug ---------------------------------------------------

  /** Gegner im Bauradius einer eigenen FOB: Kampfeinheiten in der Nähe greifen dort an. */
  defend(s) {
    if (!s.enemies.length) return;
    for (const f of s.builtFobs) {
      const near = s.enemies.filter((e) => dist(e.x, e.y, f.x, f.y) <= DEF_RANGE);
      if (!near.length) continue;
      const cx = near.reduce((a, e) => a + e.x, 0) / near.length;
      const cy = near.reduce((a, e) => a + e.y, 0) / near.length;
      const ids = s.combat
        .filter((u) => !u.house && dist(u.x, u.y, cx, cy) <= THREAT_RANGE) // Besatzer halten ihr Haus
        .filter((u) => !(u.order.type === 'attackMove' && dist(u.order.x, u.order.y, cx, cy) < 120))
        .filter((u) => u.order.type !== 'attack')
        .map((u) => u.id);
      if (ids.length) this.game.issue(this.team, { type: 'attackMove', ids, x: cx, y: cy });
    }
  }

  /** Einheit mit fast leerem Munitions- oder Treibstoffvorrat (Anteil < DRY)? Liefert 'mun', 'fuel' oder null. */
  dryKind(u) {
    if (u.def.ammoMax > 0 && u.ammo < DRY * u.def.ammoMax) return 'mun';
    if (u.def.fuelMax > 0 && u.fuel < DRY * u.def.fuelMax) return 'fuel';
    return null;
  }

  /**
   * Einheiten mit fast leerem Vorrat ziehen sich zur nächsten FOB (mit Vorrat) oder zum Versorger zurück,
   * sofern sie nicht schon dort nachgefüllt werden. Nicht bei Angriff auf die Basis.
   */
  retreat(s) {
    if (s.alarm || !s.builtFobs.length) return;
    const groups = new Map(); // Zielschlüssel -> { x, y, ids }
    const supplyTrucks = s.trucks.filter((t) => this.roles.get(t.id) === 'vers');
    for (const u of s.combat) {
      const k = this.dryKind(u);
      if (!k || u.order.type === 'move' || u.order.type === 'attack') continue;
      // wird dort, wo die Einheit steht, bereits nachgefüllt?
      if (s.builtFobs.some((f) => f.store[k] > 2 && dist(f.x, f.y, u.x, u.y) <= DEF_RANGE)) continue;
      const lorry = s.trucks.find((t) => t.cargo[k] > 2 && dist(t.x, t.y, u.x, u.y) <= BALANCE.logistics.truckSupplyRange);
      if (lorry) continue;
      let best = null;
      let bd = Infinity;
      for (const f of s.builtFobs) {
        const d = dist(f.x, f.y, u.x, u.y) + (f.store[k] >= 20 ? 0 : 1500);
        if (d < bd) {
          bd = d;
          best = { key: `f${f.id}`, x: f.x, y: f.y, fob: f };
        }
      }
      for (const t of supplyTrucks) {
        if (t.cargo[k] < 20) continue;
        const d = dist(t.x, t.y, u.x, u.y);
        if (d < bd) {
          bd = d;
          best = { key: `t${t.id}`, x: t.x, y: t.y, fob: null };
        }
      }
      if (!best) continue;
      if (!groups.has(best.key)) groups.set(best.key, { ...best, ids: [] });
      groups.get(best.key).ids.push(u.id);
    }
    for (const gr of groups.values()) {
      const p = gr.fob ? this.freeNear(gr.x + (this.rng.next() - 0.5) * 200, gr.y + 120) : { x: gr.x, y: gr.y };
      this.game.issue(this.team, { type: 'move', ids: gr.ids, x: p.x, y: p.y });
    }
  }

  /**
   * Gruppen-Rückzug: Steht eine Gruppe im Feuer und ist die sichtbare Gegnerschaft dort mindestens FALLBACK_ODDS-mal so viel
   * wert, zieht die ganze Gruppe geschlossen Richtung Basis ab, statt einzeln zu fallen. Danach sperrt FALLBACK_HOLD die
   * Angriffsbefehle (army), damit sie sich sammelt und Nachschub dazustößt. Nicht bei Angriff auf die Basis.
   */
  fallBack(s) {
    const g = this.game;
    if (!this.cfg.fallback || s.alarm || !s.home || g.time < this.fallbackUntil || s.enemies.length < FALLBACK_MIN_FOES) return;
    const value = (u) => UNITS[u.type].cost.money || 0;
    const foes = s.enemies.filter((e) => e.def.range > 0);
    for (const u of s.combat) {
      if (u.order.type === 'move' || u.def.air) continue;
      const near = foes.filter((e) => dist(e.x, e.y, u.x, u.y) <= THREAT_RANGE);
      if (near.length < FALLBACK_MIN_FOES) continue;
      const cx = near.reduce((a, e) => a + e.x, 0) / near.length;
      const cy = near.reduce((a, e) => a + e.y, 0) / near.length;
      const mine = s.combat.filter((m) => !m.def.air && dist(m.x, m.y, cx, cy) <= THREAT_RANGE + 200);
      const foeValue = near.reduce((a, e) => a + value(e), 0);
      const myValue = mine.reduce((a, m) => a + value(m), 0);
      if (foeValue < FALLBACK_ODDS * myValue) continue;
      const v = unitVec(s.ax - cx, s.ay - cy);
      const p = this.freeNear(cx + v.x * FALLBACK_DIST, cy + v.y * FALLBACK_DIST);
      g.issue(this.team, { type: 'move', ids: mine.map((m) => m.id), x: p.x, y: p.y });
      this.fallbackUntil = g.time + FALLBACK_HOLD;
      if (this.raid) this.raid = null;
      return;
    }
  }

  // ---- FOB-Baustellen --------------------------------------------------------------

  /** FOB-Baustellen, die zu lange auf Material warten, werden abgerissen (Stelle gesperrt). */
  maintainSites(s) {
    const g = this.game;
    this.badSites = this.badSites.filter((b) => b.until > g.time);
    for (const f of s.fobs) {
      if (f.built || f.supplied || f.store.bm >= FOB_COST) {
        this.siteSeen.delete(f.id);
        continue;
      }
      if (!this.siteSeen.has(f.id)) this.siteSeen.set(f.id, g.time);
      if (g.time - this.siteSeen.get(f.id) > SITE_TIMEOUT) {
        this.siteSeen.delete(f.id);
        this.badSites.push({ x: f.x, y: f.y, until: g.time + BAD_TIME });
        g.issue(this.team, { type: 'demolish', buildingId: f.id });
      }
    }
  }

  /** FOB-Baustellen setzen: Zonen-FOB zuerst, dann Relais und Flanken; nur wenn Material bereitsteht. */
  expand(s) {
    const g = this.game;
    if (!s.engineers.length || !s.builtFobs.length) return;
    if (s.fobs.length >= this.fobCap()) return;
    if (s.needMat.length >= 1 || s.fobs.filter((f) => !f.built).length >= 2) return;
    // 400 Baumaterial müssen in einer FOB bereitliegen (der Lieferant lädt sie dort)
    if (!s.builtFobs.some((f) => f.store.bm >= FOB_COST)) return;

    // Zonen-FOB zuerst – nicht kurz nach einem Verlust und nicht mitten in einer gegnerischen Übermacht
    const zoneHeld = s.zone.counts[1 - this.team] >= 4; // Besatzung der Zone ist öffentlich (wie bei der Zonenwertung)
    const zoneWanted = !s.zoneFob && g.time >= this.zoneBan && !zoneHeld;
    let site = zoneWanted ? this.zoneSite(s) : null;
    if (!site && s.zoneFob) site = this.frontSite(s);
    if (!site) return;
    const r = g.issue(this.team, { type: 'buildFob', x: site.x, y: site.y });
    if (!r.ok) this.badSites.push({ x: site.x, y: site.y, until: g.time + BAD_TIME });
  }

  /**
   * Zonen-FOB: Mittelpunkt innerhalb 0,6 · r der Zonenmitte, möglichst nah an der eigenen Basis (kurzer Nachschubweg),
   * ohne Gegner in der Nähe.
   */
  zoneSite(s) {
    const z = s.zone;
    const cands = [];
    for (let r = 0; r <= ZONE_FOB_R - 20; r += 110) {
      const n = r === 0 ? 1 : 12;
      const a0 = Math.atan2(s.ay - z.y, s.ax - z.x);
      for (let k = 0; k < n; k++) {
        const a = a0 + (k * TWO_PI) / n;
        const x = z.x + Math.cos(a) * r;
        const y = z.y + Math.sin(a) * r;
        cands.push({ x, y, d: dist(x, y, s.ax, s.ay) });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands) {
      if (this.budget <= 0) break;
      if (this.isBad(c.x, c.y) || this.danger(s, c.x, c.y)) continue;
      const p = this.place('fob', c.x, c.y);
      if (p && dist(p.x, p.y, z.x, z.y) <= ZONE_FOB_R) return { x: p.x, y: p.y, zone: true };
    }
    return null;
  }

  /**
   * Weitere FOBs: Relais auf dem Weg von der Haupt-FOB zur Zonen-FOB (Abstand RELAY_STEP), danach Flanken-FOBs im Kreis um
   * die Zonen-FOB. Die Bauradien dürfen sich nicht überlappen (canPlace prüft das).
   */
  frontSite(s) {
    const from = s.home;
    const to = s.zoneFob ?? { x: s.zone.x, y: s.zone.y };
    const total = dist(from.x, from.y, to.x, to.y);
    const v = unitVec(to.x - from.x, to.y - from.y);
    const anchors = [];
    for (let d = RELAY_STEP; d < total - 700; d += RELAY_STEP) anchors.push({ x: from.x + v.x * d, y: from.y + v.y * d });
    if (s.zoneFob) {
      const a0 = Math.atan2(s.ay - to.y, s.ax - to.x);
      for (const o of [90, -90, 135, -135, 180]) {
        const a = a0 + o * DEG;
        anchors.push({ x: to.x + Math.cos(a) * FLANK_R, y: to.y + Math.sin(a) * FLANK_R });
      }
    }
    for (const an of anchors) {
      if (dist(an.x, an.y, s.zone.x, s.zone.y) > s.zone.r + 900) continue;
      for (const r of [0, 120, 240]) {
        for (const o of [0, 60, -60, 120, -120, 180]) {
          if (this.budget <= 0) return null;
          const x = an.x + Math.cos(o * DEG) * r;
          const y = an.y + Math.sin(o * DEG) * r;
          if (this.isBad(x, y) || this.danger(s, x, y)) continue;
          const p = this.place('fob', x, y);
          if (p) return { x: p.x, y: p.y, zone: false };
        }
      }
    }
    return null;
  }

  // ---- Produktion ------------------------------------------------------------------

  /** Ausbildende Einrichtung für `type` (nur die Haupt-FOB): kürzeste Warteschlange. */
  pickProducer(s, type, qmax, towardZone) {
    let best = null;
    let bestKey = Infinity;
    for (const b of s.own) {
      if (!b.built || !b.produces.includes(type) || b.queue.length >= qmax || unitLocked(this.game, this.team, type)) continue;
      const key = b.queue.length * 100000 + (towardZone ? dist(b.x, b.y, s.zone.x, s.zone.y) : b.id);
      if (key < bestKey) {
        bestKey = key;
        best = b;
      }
    }
    return best;
  }

  /**
   * Baufahrzeuge (Ersatz zuerst – sie gründen FOBs und bauen Verteidigung), LKW, dann Kampfeinheiten nach Zielmischung.
   * Einheiten kosten nur Geld; ausgebildet wird nur in der Haupt-FOB.
   */
  produce(s) {
    const g = this.game;
    const t = this.team;
    const res = g.teams[t].res;
    const qmax = res.money > 900 ? 4 : 2;

    // Baufahrzeuge: 1 (2 ab 3 FOBs)
    const engWant = s.fobs.length >= 3 ? 2 : 1;
    const engHave = s.engineers.length + this.queued(s, 'engineer');
    if (engHave < engWant) {
      if (res.money >= UNITS.engineer.cost.money) {
        const b = this.pickProducer(s, 'engineer', BALANCE.queueMax - 1, false);
        if (b) g.issue(t, { type: 'train', buildingId: b.id, unit: 'engineer' });
      } else if (!s.engineers.length) {
        return; // ohne Baufahrzeug droht die Eliminierung: Geld dafür sparen
      }
    }

    // LKW nach Rollen
    const quota = this.truckQuota(s);
    const truckHave = s.trucks.length + this.queued(s, 'truck');
    if (truckHave < quota.total && res.money >= UNITS.truck.cost.money) {
      const b = this.pickProducer(s, 'truck', 2, false);
      if (b) g.issue(t, { type: 'train', buildingId: b.id, unit: 'truck' });
    }


    if (this.saveForScout || this.saveForRadio || this.saveForResearch) return; // Geld für Späher, Sendemast bzw. Stufe sparen

    const mix = this.counterMix(s);

    // Kampfeinheiten: welche Typen sind gerade ausbildbar?
    const avail = new Set();
    for (const b of s.own) {
      if (!b.built || b.queue.length >= qmax) continue;
      for (const u of b.produces) if (mix[u] && !unitLocked(g, t, u)) avail.add(u); // gesperrte Stufe: noch nicht
    }
    if (!avail.size) return;
    let sumW = 0;
    for (const u of avail) sumW += mix[u];
    const counts = {};
    for (const u of avail) counts[u] = s.units.filter((x) => x.type === u).length + this.queued(s, u);
    let total = 0;
    for (const u of avail) total += counts[u];

    // Global nach Defizit: der wichtigste Typ bekommt die knappen Mittel. Fehlt er nur an Geld, wird gespart;
    // fehlt es nur im Lager der Produktionsstätten, kommt der nächste Typ dran (Pendler füllen auf).
    for (let k = 0; k < 4; k++) {
      const entries = [];
      for (const u of avail) entries.push({ u, deficit: (mix[u] / sumW) * (total + 1) - counts[u] });
      entries.sort((a, c) => c.deficit - a.deficit);
      let pick = null;
      for (const e of entries) {
        const b = this.pickProducer(s, e.u, qmax, true);
        if (b && this.canTrain(e.u)) {
          pick = { b, u: e.u };
          break;
        }
        if (b && e.deficit > 0.5) break; // sparen
      }
      if (!pick) break;
      const r = g.issue(t, { type: 'train', buildingId: pick.b.id, unit: pick.u });
      if (!r.ok) break;
      counts[pick.u]++;
      total++;
    }
  }

  /**
   * Zielmischung der Kampfeinheiten, gegen die gesehene Gegnerarmee angepasst (ab COUNTER_MIN sichtbaren Kampfeinheiten):
   * viel Gepanzertes → mehr PAK und Panzer, viel Infanterie → mehr Schützen und Schützenpanzer. Sonst die Grundmischung MIX.
   */
  counterMix(s) {
    const foes = s.enemies.filter((e) => e.def.range > 0 && !e.def.air);
    if (!this.cfg.counter || foes.length < COUNTER_MIN) return MIX;
    const armored = foes.filter((e) => e.def.armor !== 'inf').length / foes.length;
    // Gepanzerte Gegner: PAK und Panzer rauf (doppelt gewichtet), Schützen und Schützenpanzer runter; bei Infanterie umgekehrt.
    const shift = COUNTER_WEIGHT * (2 * armored - 1);
    const f = (u, k) => Math.max(0.05, MIX[u] * (1 + k * shift));
    return { rifleman: f('rifleman', -1), at: f('at', 2), ifv: f('ifv', -1), tank: f('tank', 2) };
  }

  // ---- Verteidigungsgebäude und Mauer ---------------------------------------------

  /**
   * Verteidigung, sobald eine vordere FOB steht (dort sind Mauern, Mörser und Flak sinnvoll).
   * Ausnahme: Angriff auf die Basis – dann genau eine Flugabwehr oder ein Mörser.
   */
  defenseMode(s) {
    if (s.builtFobs.length >= 2) return 'full';
    if (s.alarm) return 'alarm';
    return null;
  }

  /** Je FOB (nahe der Zone zuerst) ein Mörser und eine Flugabwehr, normal und schwer. */
  buildDefense(s) {
    const g = this.game;
    const t = this.team;
    if (this.difficulty === 'easy' || !s.builtFobs.length) return;
    const mode = this.defenseMode(s);
    if (!mode) return;
    if (mode === 'alarm' && s.own.some((b) => b.type === 'mortar' || b.type === 'aa')) return;
    if (s.own.filter((b) => !b.built && b.type !== 'fob').length >= 2) return; // Baufahrzeug ausgelastet
    const z = s.zone;
    const fobs = [...s.builtFobs].sort((a, b) => dist(a.x, a.y, z.x, z.y) - dist(b.x, b.y, z.x, z.y));
    const toZone = Math.atan2(s.dir.y, s.dir.x);
    const foe = g.map.spawns[1 - t];
    // Zonen-FOB: Verteidigung zur Gegnerseite hin; sie ist der Brennpunkt und bekommt einen zweiten Mörser.
    const towardFoe = (f) => (f === s.zoneFob ? Math.atan2(foe.y - f.y, foe.x - f.x) : toZone);

    for (const f of fobs) {
      for (const type of ['aa', 'mortar']) {
        const want = type === 'mortar' && f === s.zoneFob ? 2 : 1;
        const have = s.own.filter((b) => b.type === type && dist(b.x, b.y, f.x, f.y) < DEF_RANGE).length >= want;
        if (have) continue;
        if (g.fobsInRadius(t, f.x, f.y).every((o) => o.store.bm < BUILDINGS[type].cost.bm || o.store.mun < BUILDINGS[type].cost.mun)) continue;
        const p = this.findSite(type, f.x, f.y, 130, 330, {
          angle: towardFoe(f),
          corridor: f === s.home,
        });
        if (p) {
          g.issue(t, { type: 'build', building: type, x: p.x, y: p.y });
          return; // höchstens ein Verteidigungsgebäude je Denkschritt
        }
      }
    }
  }

  /**
   * Mauerlinie quer zur Richtung Zone mit einem Tor in der Mitte (vor der Haupt-FOB, Achsen in Zellen).
   * Gebaut von bis zu 3 nahen untätigen Schützen (Infanterie baut Mauern und Tore).
   */
  buildWall(s) {
    const g = this.game;
    const t = this.team;
    const h = s.home;
    if (this.difficulty === 'easy' || !h || this.defenseMode(s) !== 'full') return;
    if (!this.once('wall', 10)) return;

    const grid = g.grid;
    const mc = h.cx + Math.floor(h.w / 2);
    const mr = h.cy + Math.floor(h.h / 2);
    const vertical = Math.abs(s.dir.x) >= Math.abs(s.dir.y);
    let gc;
    let gr;
    let x1;
    let y1;
    let x2;
    let y2;
    if (vertical) {
      gc = mc + (s.dir.x >= 0 ? WALL_OFFSET : -WALL_OFFSET);
      gr = mr;
      x1 = grid.center(gc);
      x2 = x1;
      y1 = grid.center(mr - WALL_HALF);
      y2 = grid.center(mr + WALL_HALF);
    } else {
      gr = mr + (s.dir.y >= 0 ? WALL_OFFSET : -WALL_OFFSET);
      gc = mc;
      y1 = grid.center(gr);
      y2 = y1;
      x1 = grid.center(mc - WALL_HALF);
      x2 = grid.center(mc + WALL_HALF);
    }
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const ids = s.units
      .filter((u) => u.type === 'rifleman' && u.order.type === 'idle' && !this.dryKind(u) && u.cargo.bm >= BUILDINGS.wall.cost.bm && dist(u.x, u.y, mx, my) <= 700)
      .sort((a, b) => dist(a.x, a.y, mx, my) - dist(b.x, b.y, mx, my) || a.id - b.id)
      .slice(0, 3)
      .map((u) => u.id);
    // Tor zuerst; danach die Linie – das Torfeld ist dann belegt und wird übersprungen (idempotent)
    g.issue(t, { type: 'buildWall', building: 'gate', ids, x1: grid.center(gc), y1: grid.center(gr), x2: grid.center(gc), y2: grid.center(gr) });
    const r = g.issue(t, { type: 'buildWall', building: 'wall', ids, x1, y1, x2, y2 });
    if (!r.ok) this.memo.set('wall', g.time + 110); // Linie steht bereits (oder nichts baubar): lange nicht erneut versuchen
  }

  // ---- Baufahrzeuge ----------------------------------------------------------------

  /** Läuft ein LKW-Auftrag, der Material zu dieser FOB-Baustelle bringt? */
  hasDelivery(s, site) {
    return s.trucks.some(
      (t) => (t.order.type === 'unload' && t.order.targetId === site.id) || (t.order.type === 'route' && t.order.toId === site.id),
    );
  }

  /**
   * Untätige Baufahrzeuge fahren zu Baustellen, die sie bauen können und die weiter als ENG_NEAR entfernt sind
   * (näher übernimmt die automatische Zuweisung der Engine). FOB-Baustellen erst, wenn ihr Material da ist
   * oder gerade geliefert wird – so hängt kein Baufahrzeug an einer Baustelle ohne Material.
   */
  manageEngineers(s) {
    const g = this.game;
    if (!s.engineers.length) return;
    const ready = (b) => b.type !== 'fob' || b.supplied || b.store.bm >= FOB_COST || this.hasDelivery(s, b);
    const sites = s.own.filter((b) => !b.built && ready(b));
    if (!sites.length) return;
    const prio = (b) => (b.type === 'fob' ? 0 : 1);
    for (const u of s.engineers) {
      if (u.order.type !== 'idle') continue;
      let best = null;
      let bestKey = Infinity;
      for (const b of sites) {
        const taken = s.engineers.some(
          (e) => e !== u && ((e.order.type === 'build' && e.order.targetId === b.id) || (e.order.type === 'move' && this.engTarget.get(e.id) === b.id)),
        );
        const key = prio(b) * 1500 + dist(u.x, u.y, b.x, b.y) + (taken ? 1000 : 0);
        if (key < bestKey) {
          bestKey = key;
          best = b;
        }
      }
      if (!best) continue;
      const half = (Math.max(best.w, best.h) * TILE) / 2;
      if (dist(u.x, u.y, best.x, best.y) - half <= ENG_NEAR) continue;
      if (!this.once(`eng${u.id}:${best.id}`, 8)) continue;
      const near = this.freeNear(best.x, best.y + half + 40);
      g.issue(this.team, { type: 'move', ids: [u.id], x: near.x, y: near.y });
      this.engTarget.set(u.id, best.id);
    }
  }

  /**
   * Zerstörte Brücken auf der eigenen Seite (näher an der eigenen Haupt-FOB als am gegnerischen Start): ein untätiges
   * Baufahrzeug baut sie wieder auf, wenn das Geld reicht. Brücken auf der Seite des Gegners bleiben, wie sie sind.
   */
  rebuildBridges(s) {
    const g = this.game;
    if (!g.bridges?.length || !s.engineers.length || !this.once('bridges', BRIDGE_EVERY)) return;
    const foe = g.map.spawns[1 - this.team];
    const cost = BALANCE.river.rebuildCost;
    for (const b of g.bridges) {
      if (!b.broken || dist(b.x, b.y, s.ax, s.ay) >= dist(b.x, b.y, foe.x, foe.y)) continue;
      if (s.engineers.some((u) => u.order.type === 'repairBridge' && u.order.targetId === b.id)) continue;
      if (!b.rebuild && g.teams[this.team].res.money < cost + BRIDGE_RESERVE) return;
      let best = null;
      for (const u of s.engineers) {
        if (u.order.type !== 'idle') continue;
        if (!best || dist(u.x, u.y, b.x, b.y) < dist(best.x, best.y, b.x, b.y)) best = u;
      }
      if (!best) return;
      g.issue(this.team, { type: 'repairBridge', ids: [best.id], bridgeId: b.id });
    }
  }

  // ---- LKW ---------------------------------------------------------------------------

  /** Soll-Zahl der LKW je Rolle: 1 Lieferant (solange FOB-Baustellen möglich), Pendler je 2 Außen-FOBs (max. 3), Versorger. */
  truckQuota(s) {
    const lief = s.fobs.length < this.fobCap() || s.needMat.length > 0 ? 1 : 0;
    const pend = Math.min(3, Math.ceil(Math.max(0, s.fobs.length - 1) / 2));
    const vers = s.combat.length >= 15 ? 1 : 0;
    return { lief, pend, vers, total: lief + pend + vers };
  }

  /** Rollen zuordnen (bestehende bleiben, wenn die Quote reicht); überzählige LKW pendeln. */
  assignRoles(s) {
    const q = this.truckQuota(s);
    const have = { lief: 0, pend: 0, vers: 0 };
    const alive = new Set(s.trucks.map((x) => x.id));
    for (const id of [...this.roles.keys()]) if (!alive.has(id)) this.roles.delete(id);
    for (const id of [...this.routes.keys()]) if (!alive.has(id)) this.routes.delete(id);
    for (const tr of s.trucks) {
      const r = this.roles.get(tr.id);
      if (r && have[r] < q[r]) have[r]++;
      else this.roles.delete(tr.id);
    }
    for (const tr of s.trucks) {
      if (this.roles.has(tr.id)) continue;
      const r = ['lief', 'pend', 'vers'].find((k) => have[k] < q[k]) ?? 'pend';
      this.roles.set(tr.id, r);
      have[r]++;
    }
  }

  /** Soll-Lagerstand einer FOB je Sorte: die Zonen-FOB braucht am meisten (Mörser, Flak, Nachladen); die Haupt-FOB ist unendlich. */
  wantOf(s, f) {
    if (f === s.zoneFob) return { bm: 400, mun: 300, fuel: 150 };
    if (f === s.home) return { bm: 300, mun: 200, fuel: 200 };
    return { bm: 300, mun: 150, fuel: 80 };
  }

  manageTrucks(s) {
    this.assignRoles(s);
    const fobsLoaded = s.builtFobs.length > 0;
    if (!fobsLoaded) return;
    // FOB, aus der der Lieferant sein Baumaterial lädt (die mit dem meisten): hier exportieren Pendler kein Baumaterial
    const reserveFob = s.needMat.length ? this.richest(s, 'bm') : null;
    const taken = new Set();
    for (const tr of s.trucks) {
      const role = this.roles.get(tr.id);
      if (role === 'lief') this.manageLieferant(s, tr);
      else if (role === 'vers') this.manageVersorger(s, tr);
    }
    for (const tr of s.trucks) {
      if (this.roles.get(tr.id) === 'pend') this.managePendler(s, tr, taken, reserveFob);
    }
  }

  /** Fertige FOB mit dem größten Vorrat einer Sorte. */
  richest(s, k) {
    let best = null;
    for (const f of s.builtFobs) if (!best || f.store[k] > best.store[k]) best = f;
    return best;
  }

  /** Lieferant: lädt 400 Baumaterial an der reichsten FOB und entlädt es an der eigenen FOB-Baustelle. */
  manageLieferant(s, tr) {
    const g = this.game;
    const site = s.needMat[0];
    if (!site) return;
    const o = tr.order.type;
    if (o === 'load' || o === 'unload') return; // arbeitet noch
    const sum = cargoTotal(tr);
    if (tr.cargo.bm >= CAP - 20) {
      if (this.once(`unl${tr.id}:${site.id}`, 6)) g.issue(this.team, { type: 'unload', ids: [tr.id], fobId: site.id });
      return;
    }
    if (sum - tr.cargo.bm > 40) {
      // fremde Ladung zuerst an der nächsten FOB abladen
      const f = this.nearestBuilt(s, tr.x, tr.y);
      if (f && this.once(`dmp${tr.id}`, 6)) g.issue(this.team, { type: 'unload', ids: [tr.id], fobId: f.id });
      return;
    }
    const src = this.richest(s, 'bm');
    if (!src || src.store.bm < CAP - tr.cargo.bm - 5) return; // erst laden, wenn eine volle Ladung da ist
    if (this.once(`lod${tr.id}`, 4)) g.issue(this.team, { type: 'load', ids: [tr.id], fobId: src.id, preset: 'bm' });
  }

  nearestBuilt(s, x, y) {
    let best = null;
    let bd = Infinity;
    for (const f of s.builtFobs) {
      const d = dist(f.x, f.y, x, y);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  /**
   * Bester Transport: Ziel-FOB und Sorte mit dem größten Bedarf (Zonen-FOB bevorzugt), Quelle = FOB mit dem
   * größten Überschuss dieser Sorte (mindestens SURPLUS_MIN).
   */
  pendlerPlan(s, taken, reserveFob) {
    let best = null;
    for (const to of s.builtFobs) {
      const wTo = this.wantOf(s, to);
      for (const k of KEYS) {
        if (taken.has(to.id + k)) continue;
        const need = (wTo[k] - to.store[k]) / wTo[k];
        if (need < 0.3) continue;
        const score = need * (to === s.zoneFob ? 1.5 : to === s.home ? 1.2 : 1);
        if (best && score <= best.score) continue;
        let src = null;
        let sv = SURPLUS_MIN - 1;
        for (const f of s.builtFobs) {
          if (f === to) continue;
          const sur = f.store[k] - 0.5 * this.wantOf(s, f)[k] - (k === 'bm' && f === reserveFob ? FOB_COST : 0);
          if (sur > sv) {
            sv = sur;
            src = f;
          }
        }
        if (src) best = { from: src, to, k, score };
      }
    }
    return best;
  }

  /** Pendler: Route von der Überschuss-FOB zur Bedarfs-FOB, Ladungsart nach Engpass. */
  managePendler(s, tr, taken, reserveFob) {
    const g = this.game;
    const cur = this.routes.get(tr.id);
    const o = tr.order;
    if (cur) {
      const from = g.getEntity(cur.fromId);
      const to = g.getEntity(cur.toId);
      const active = o.type === 'route' && o.fromId === cur.fromId && o.toId === cur.toId;
      if (active && from && to && to.built) {
        const need = (this.wantOf(s, to)[cur.k] - to.store[cur.k]) / this.wantOf(s, to)[cur.k];
        const valid = (tr.cargo[cur.k] > 50 || from.store[cur.k] >= 60) && need > 0.1;
        if (valid || g.time - cur.t0 < ROUTE_HOLD) {
          taken.add(cur.toId + cur.k);
          return;
        }
      }
    }
    const plan = this.pendlerPlan(s, taken, reserveFob);
    if (!plan) {
      if (o.type === 'route' && cur) {
        // nichts mehr zu tun: Ladung (falls vorhanden) abliefern, sonst anhalten
        if (cargoTotal(tr) > 50) g.issue(this.team, { type: 'unload', ids: [tr.id], fobId: cur.toId });
        else g.issue(this.team, { type: 'stop', ids: [tr.id] });
        this.routes.delete(tr.id);
      }
      return;
    }
    const r = g.issue(this.team, { type: 'route', ids: [tr.id], fromId: plan.from.id, toId: plan.to.id, preset: plan.k });
    if (r.ok) {
      this.routes.set(tr.id, { fromId: plan.from.id, toId: plan.to.id, k: plan.k, t0: g.time });
      taken.add(plan.to.id + plan.k);
    }
  }

  /** Versorger: folgt dem Schwerpunkt der Armee ~150 px dahinter; lädt Munition/Treibstoff nach, wenn Ladung < 25 %. */
  manageVersorger(s, tr) {
    const g = this.game;
    const o = tr.order.type;
    if (o === 'load' || o === 'unload') return;
    const field = s.combat.filter((u) => u.order.type !== 'move');
    const pts = field.length ? field : s.combat;
    if (!pts.length) return;
    const cx = pts.reduce((a, u) => a + u.x, 0) / pts.length;
    const cy = pts.reduce((a, u) => a + u.y, 0) / pts.length;

    if (cargoTotal(tr) < CAP * SUPPLY_MIN) {
      let dMun = 0;
      let dFuel = 0;
      for (const u of s.combat) {
        dMun += (u.def.ammoMax || 0) - u.ammo;
        dFuel += (u.def.fuelMax || 0) - u.fuel;
      }
      const k = dMun >= dFuel ? 'mun' : 'fuel';
      const src = this.richest(s, k);
      if (src && src.store[k] >= 100) {
        if (this.once(`vld${tr.id}`, 6)) g.issue(this.team, { type: 'load', ids: [tr.id], fobId: src.id, preset: k });
        return;
      }
    }
    const f = this.nearestBuilt(s, cx, cy);
    const v = f ? unitVec(f.x - cx, f.y - cy) : { x: 0, y: 0 };
    const p = this.freeNear(cx + v.x * SUPPLY_BEHIND, cy + v.y * SUPPLY_BEHIND);
    const last = this.supplyAt.get(tr.id);
    const moved = !last || dist(last.x, last.y, p.x, p.y) > 120;
    if (!(moved || (o === 'idle' && dist(tr.x, tr.y, p.x, p.y) > 120))) return;
    if (!this.once(`vmv${tr.id}`, 4)) return;
    this.supplyAt.set(tr.id, p);
    g.issue(this.team, { type: 'move', ids: [tr.id], x: p.x, y: p.y });
  }

  // ---- Armee -----------------------------------------------------------------------

  /** Sammelpunkte setzen (Produktionsgebäude), neu nur wenn sich der Sammelpunkt deutlich verschoben hat. */
  rally(s) {
    if (!s.home) return;
    const gp = this.gatherPoint(s);
    for (const b of s.own) {
      if (!b.built || !b.produces.length) continue;
      const prev = this.rallyAt.get(b.id);
      if (prev && dist(prev.x, prev.y, gp.x, gp.y) < RALLY_MOVE) continue;
      this.rallyAt.set(b.id, gp);
      this.game.issue(this.team, { type: 'rally', buildingId: b.id, x: gp.x, y: gp.y });
    }
  }

  /**
   * Angriff, sobald die Summe der idle Kampfeinheiten (Geldwert) die Schwelle erreicht
   * (bei unbesetzter Zone schon ab 60 %). Nicht zu Hause stehende Einheiten folgen dem Befehl.
   * Einheiten mit fast leerem Vorrat bleiben zum Nachfüllen zurück.
   * In der Zone stehende Einheiten verteilen sich auf einem Kreis (r 400) statt im Zentrum zu klumpen.
   * Ein Fünftel der ausrückenden Gruppe (ab 5 Einheiten) bleibt als Reserve an der Haupt-FOB.
   */
  /**
   * Späher (Little Bird, unbewaffnet): fliegt an den Zonenrand auf der Gegnerseite, damit die Besatzung der Zone sichtbar wird
   * (army schätzt die Gegnerstärke dann aus dem Wert der gesehenen Einheiten). Tank fast leer → heim, auftanken, wieder los.
   */
  scout(s) {
    const g = this.game;
    const t = this.team;
    const z = s.zone;
    if (!this.cfg.scout) return;
    const bird = s.units.find((u) => u.type === 'littlebird');
    if (!bird) {
      this.saveForScout = false;
      if (unitLocked(g, t, 'littlebird')) return; // erst ab seiner Forschungsstufe
      // schlechte Sicht (Regen, Nebel, Schnee): der Späher ist mehr wert und kommt früher
      const bad = this.cfg.weather && weatherSight(g) < WX_SCOUT_SIGHT;
      const minArmy = bad ? WX_SCOUT_ARMY : SCOUT_MIN_ARMY;
      if (!s.home || s.combat.length < minArmy || g.time < (bad ? WX_SCOUT_FROM : SCOUT_FROM) || this.queued(s, 'littlebird')) return;
      if (g.teams[t].res.money < SCOUT_MONEY) {
        this.saveForScout = true; // produce spart, bis der Späher bezahlbar ist
        return;
      }
      const b = this.pickProducer(s, 'littlebird', BALANCE.queueMax - 1, false);
      if (b) g.issue(t, { type: 'train', buildingId: b.id, unit: 'littlebird' });
      return;
    }
    const fuel = bird.fuel / bird.def.fuelMax;
    if (fuel < SCOUT_FUEL || (this.scoutHome && fuel < SCOUT_REFILL)) {
      this.scoutHome = true;
      if (this.once('scout-home', 10)) g.issue(t, { type: 'move', ids: [bird.id], x: s.ax, y: s.ay });
      return;
    }
    this.scoutHome = false;
    // Zielpunkt: Zonenrand zur Gegnerseite (vom eigenen Zonenrand aus gesehen auf der anderen Seite)
    const foe = g.map.spawns[1 - t];
    const v = unitVec(foe.x - z.x, foe.y - z.y);
    const x = z.x + v.x * z.r * 0.8;
    const y = z.y + v.y * z.r * 0.8;
    if (dist(bird.x, bird.y, x, y) > 120 && this.once('scout-go', 8)) g.issue(t, { type: 'move', ids: [bird.id], x, y });
  }

  /** Merkt sich gesehene gegnerische FOBs (Standort bleibt bekannt, bis man ihn einsieht und dort nichts mehr steht). */
  rememberFobs() {
    const g = this.game;
    for (const [id, b] of this.seenFobs) if (!b.alive) this.seenFobs.delete(id); // zerstört (auch ungesehen)
    for (const b of g.buildings) {
      if (b.team === this.team || b.type !== 'fob') continue;
      const seen = g.isVisible(this.team, b.x, b.y);
      if (seen && b.alive) this.seenFobs.set(b.id, b);
    }
  }

  /** Laufender Überfall: gefallene Räuber austragen; ist das Ziel zerstört oder niemand mehr übrig, endet er (Überlebende rücken in die Armee ein). */
  updateRaid(s) {
    const r = this.raid;
    if (!r) return;
    const target = this.game.buildings.find((b) => b.id === r.targetId);
    for (const id of [...r.ids]) if (!s.combat.some((u) => u.id === id)) r.ids.delete(id);
    if (!r.ids.size || !target || !target.alive) this.raid = null;
  }

  /**
   * Flankenangriff: Steht die Zone gegnerfrei, zweigt von der Besatzung (ab RAID_MIN Einheiten) ein Teil ab und greift
   * die gemerkte gegnerische FOB abseits der Zone an, die der Zone am nächsten liegt. Liefert die Resteinheiten der Besatzung.
   */
  startRaid(s, go) {
    const g = this.game;
    const z = s.zone;
    if (!this.cfg.raid || this.raid || go.length < RAID_MIN) return go;
    const targets = [...this.seenFobs.values()]
      .filter((b) => dist(b.x, b.y, z.x, z.y) > ZONE_FOB_R + 300)
      .sort((a, b) => dist(a.x, a.y, z.x, z.y) - dist(b.x, b.y, z.x, z.y));
    if (!targets.length) return go;
    const raiders = go.slice(-Math.floor(go.length * RAID_SHARE));
    const target = targets[0];
    g.issue(this.team, { type: 'attackMove', ids: raiders.map((u) => u.id), x: target.x, y: target.y });
    this.raid = { ids: new Set(raiders.map((u) => u.id)), targetId: target.id };
    return go.slice(0, go.length - raiders.length);
  }

  /**
   * Häuserkampf: Ein Teil der freien Infanterie in der Zone (GARRISON_SHARE) besetzt Stadthäuser in der Nähe. Dort ist sie geschützt,
   * steht höher und schießt ab der Hauswand; nur schwere Waffen vertreiben sie. Je Haus höchstens so viele, wie Plätze frei sind.
   */
  garrisonZone(s) {
    const g = this.game;
    if (!g.houses || !g.houses.length || !this.once('garrison', GARRISON_EVERY)) return;
    const z = s.zone;
    const t = this.team;
    const inZone = (e) => dist(e.x, e.y, z.x, z.y) <= z.r;
    const inf = s.units.filter((u) => u.def.armor === 'inf' && u.def.range > 0 && !u.def.hero && inZone(u));
    const pending = new Map(); // Haus-ID → Soldaten auf dem Weg hinein
    let housed = 0;
    for (const u of inf) {
      if (u.house) housed++;
      else if (u.order.type === 'garrison') {
        housed++;
        pending.set(u.order.targetId, (pending.get(u.order.targetId) || 0) + 1);
      }
    }
    let want = Math.floor(inf.length * GARRISON_SHARE) - housed;
    if (want <= 0) return;
    const houses = g.houses.filter((h) => h.alive && (h.team < 0 || h.team === t) && inZone(h));
    const raiding = this.raid ? this.raid.ids : null;
    for (const u of inf) {
      if (want <= 0) break;
      if (u.house || u.order.type !== 'idle' || this.dryKind(u) || (raiding && raiding.has(u.id))) continue;
      let best = null;
      let bd = GARRISON_RANGE;
      for (const h of houses) {
        const d = dist(h.x, h.y, u.x, u.y);
        if (d >= bd || h.occupants.length + (pending.get(h.id) || 0) >= h.def.cap) continue;
        best = h;
        bd = d;
      }
      if (!best || !g.issue(t, { type: 'garrison', ids: [u.id], houseId: best.id }).ok) continue;
      pending.set(best.id, (pending.get(best.id) || 0) + 1);
      want--;
    }
  }

  /**
   * Versorgungskisten: freie Soldaten (lieber außerhalb der Zone, wo sie kein Zonengeld bringen) holen Kisten in der Nähe; sie
   * tragen sie von selbst zur nächsten FOB. Die KI weiß wie der Spieler nur, was im Lagebild steht (Fundorte, zuletzt gesehen).
   */
  collectCrates(s) {
    const g = this.game;
    if (!g.crates || !g.crates.length || !s.builtFobs.length || !this.once('crates', CRATE_EVERY)) return;
    const t = this.team;
    const busy = s.units.filter((u) => u.crate || u.order.type === 'pickup');
    let free = CRATE_PICKERS[this.difficulty] - busy.length;
    if (free <= 0) return;
    const taken = new Set(busy.map((u) => u.order.targetId));
    const raiding = this.raid ? this.raid.ids : null;
    const z = s.zone;
    const known = g.crateSeen[t];
    const crates = g.crates.filter((c) => {
      const m = known.get(c.id);
      return c.state === 'ground' && m && !taken.has(c.id) && !this.danger(s, m.x, m.y);
    });
    // frei: untätig oder auf dem Weg zum Sammelpunkt (frisch ausgebildet); nicht in einem Haus, nicht beim Überfall
    const pool = s.units.filter(
      (u) =>
        u.def.armor === 'inf' &&
        !u.def.hero &&
        !u.crate &&
        !u.house &&
        (u.order.type === 'idle' || u.order.type === 'move') &&
        !this.dryKind(u) &&
        !(raiding && raiding.has(u.id)),
    );
    for (const c of crates) {
      if (free <= 0) break;
      let best = null;
      let bd = CRATE_RANGE;
      for (const u of pool) {
        // Soldaten in der Zone verdienen dort Geld: sie zählen, als stünden sie weiter weg
        const d = dist(u.x, u.y, c.x, c.y) + (dist(u.x, u.y, z.x, z.y) <= z.r ? 800 : 0);
        if (d < bd) {
          best = u;
          bd = d;
        }
      }
      if (!best || !g.issue(t, { type: 'pickup', ids: [best.id], crateId: c.id }).ok) continue;
      pool.splice(pool.indexOf(best), 1);
      free--;
    }
  }

  /**
   * Sendemast (zweite Siegbedingung): ab RADIO_FROM spart die KI darauf (nicht bei Alarm an der Haupt-FOB) und setzt ihn hinter die
   * Haupt-FOB, weg von der Zone. Das Baufahrzeug baut ihn wie jede Baustelle.
   */
  buildRadio(s) {
    const g = this.game;
    const t = this.team;
    this.saveForRadio = false;
    if (!g.radioWin || !s.home || g.time < RADIO_FROM[this.difficulty] || s.alarm || !s.engineers.length) return;
    if (s.own.some((b) => b.def.radio)) return;
    const cost = BUILDINGS.radio.cost;
    if (g.teams[t].res.money < cost.money) {
      this.saveForRadio = true;
      return;
    }
    const away = Math.atan2(-s.dir.y, -s.dir.x);
    const p = this.findSite('radio', s.ax, s.ay, RADIO_SITE[0], RADIO_SITE[1], { angle: away, corridor: true });
    if (p) g.issue(t, { type: 'build', building: 'radio', x: p.x, y: p.y });
  }

  /**
   * Gegnerischer Sendemast (schon die Baustelle; ihr Baubeginn wird gemeldet, den Ort kennt die KI wie bei jeder Zielwahl): alle
   * Kampfeinheiten greifen ihn an, nah direkt, sonst per Angriffsbewegung ohne Formation (jeder in seinem Tempo, die Zeit drängt).
   * Liefert true, solange er steht (dann entfällt die übliche Zonenwelle).
   */
  attackRadio(s) {
    const g = this.game;
    const mast = g.buildings.find((b) => b.alive && b.def.radio && b.team !== this.team);
    if (!mast) {
      this.strike = null;
      return false;
    }
    // Der eigene Mast siegt früher: verteidigen statt angreifen (die übliche Armeeführung und defend übernehmen)
    const own = s.own.find((b) => b.def.radio);
    if (own && radioEta(own) < radioEta(mast)) return false;
    if (!this.once('radio-attack', RADIO_EVERY)) return true;
    const army = s.combat.filter((u) => !u.house && !this.dryKind(u));
    // Erst sammeln (am Schwerpunkt der Armee draußen, höchstens RADIO_GATHER s), dann geschlossen zuschlagen
    if (!this.strike || this.strike.mast !== mast.id) {
      const field = army.filter((u) => !u.def.air && dist(u.x, u.y, s.ax, s.ay) > GATHER_DIST * 2);
      const pts = field.length ? field : army;
      const cx = pts.reduce((a, u) => a + u.x, 0) / Math.max(1, pts.length);
      const cy = pts.reduce((a, u) => a + u.y, 0) / Math.max(1, pts.length);
      this.strike = { mast: mast.id, since: g.time, go: false, at: this.freeNear(cx, cy) };
    }
    const st = this.strike;
    if (!st.go) {
      const near = army.filter((u) => dist(u.x, u.y, st.at.x, st.at.y) <= RADIO_GATHER_R).length;
      st.go = g.time - st.since >= RADIO_GATHER || near >= RADIO_GATHER_SHARE * army.length;
      if (!st.go) {
        const ids = army.filter((u) => dist(u.x, u.y, st.at.x, st.at.y) > RADIO_GATHER_R && !(u.order.type === 'attackMove' && dist(u.order.x, u.order.y, st.at.x, st.at.y) < 200)).map((u) => u.id);
        if (ids.length) g.issue(this.team, { type: 'attackMove', ids, x: st.at.x, y: st.at.y });
        return true;
      }
    }
    const near = [];
    const far = [];
    for (const u of army) {
      const d = dist(u.x, u.y, mast.x, mast.y);
      if (d <= RADIO_NEAR) {
        if (u.order.type !== 'attack' || u.order.targetId !== mast.id) near.push(u.id);
      } else if (u.order.type !== 'attackMove' || dist(u.order.x, u.order.y, mast.x, mast.y) > RADIO_NEAR) {
        far.push(u.id);
      }
    }
    if (near.length) g.issue(this.team, { type: 'attack', ids: near, targetId: mast.id });
    if (far.length) g.issue(this.team, { type: 'attackMove', ids: far, x: mast.x, y: mast.y });
    return true;
  }

  /**
   * Forschung in der Haupt-FOB: ab cfg.research[0] s spart die KI auf Stufe 2, ab cfg.research[1] s auf Stufe 3 (nicht bei Alarm an
   * der Haupt-FOB). Verbesserungen (ab Normal, cfg.upgrades) nur aus Überschuss, der Reihe nach (UPGRADES).
   */
  research(s) {
    const g = this.game;
    const t = this.team;
    this.saveForResearch = false;
    if (!g.research || !s.home || !s.home.built) return;
    const tech = g.teams[t].tech;
    if (tech.cur) return;
    const money = g.teams[t].res.money;
    const items = BALANCE.research.items;
    const [t2, t3] = this.cfg.research;
    const tier = tech.tier === 1 && g.time >= t2 ? 'tier2' : tech.tier === 2 && g.time >= t3 ? 'tier3' : null;
    if (tier && !s.alarm) {
      if (money < items[tier].money) this.saveForResearch = true; // produce spart, bis die Stufe bezahlbar ist
      else g.issue(t, { type: 'research', buildingId: s.home.id, key: tier });
      return;
    }
    if (!this.cfg.upgrades) return;
    const key = UPGRADES.find((k) => !researchBlock(g, t, k));
    if (key && money >= items[key].money + UPGRADE_RESERVE) g.issue(t, { type: 'research', buildingId: s.home.id, key });
  }

  /** Gefallenen Kommandeur ersetzen (Haupt-FOB), sobald genug Geld für ihn und eine Reserve da ist. */
  replaceCommander(s) {
    const g = this.game;
    if (!s.home || !s.home.built || g.time < CMD_FROM || hasCommander(g, this.team)) return;
    if (g.teams[this.team].res.money < UNITS.commander.cost.money + CMD_RESERVE) return;
    if (s.home.queue.length >= BALANCE.queueMax) return;
    g.issue(this.team, { type: 'train', buildingId: s.home.id, unit: 'commander' });
  }

  /**
   * Kommandeur hinter der Armee: CMD_BEHIND px hinter dem Schwerpunkt der Kampfeinheiten draußen (Richtung Haupt-FOB), damit seine
   * Aura wirkt, er selbst aber nicht in der ersten Reihe steht. Sichtbare Gegner nahe: zurück zur Haupt-FOB. Ohne Armee draußen
   * wartet er am Sammelpunkt.
   */
  guardCommander(s) {
    const c = s.commander;
    if (!c || c.house || !s.home) return;
    const g = this.game;
    let goal;
    if (s.enemies.some((e) => !e.def.air && e.def.range > 0 && dist(e.x, e.y, c.x, c.y) < CMD_DANGER)) {
      goal = this.freeNear(s.ax + s.dir.x * 120, s.ay + s.dir.y * 120);
    } else {
      const field = s.combat.filter((u) => !u.def.air && !u.house && dist(u.x, u.y, s.ax, s.ay) > GATHER_DIST * 2);
      if (field.length >= 3) {
        const cx = field.reduce((a, u) => a + u.x, 0) / field.length;
        const cy = field.reduce((a, u) => a + u.y, 0) / field.length;
        const v = unitVec(s.ax - cx, s.ay - cy);
        goal = this.freeNear(cx + v.x * CMD_BEHIND, cy + v.y * CMD_BEHIND);
      } else {
        goal = this.gatherPoint(s);
      }
    }
    if (dist(c.x, c.y, goal.x, goal.y) < CMD_MOVE / 2) return;
    if (c.order.type === 'move' && dist(c.order.x, c.order.y, goal.x, goal.y) < CMD_MOVE) return;
    g.issue(this.team, { type: 'move', ids: [c.id], x: goal.x, y: goal.y });
  }

  /** Geforderte Stärke (Geldwert) der nächsten Welle; inside = sichtbare Gegner in der Zone. */
  waveNeed(inside) {
    const g = this.game;
    const t = this.team;
    const z = g.zone;
    let need = this.cfg.attackStrength;
    if (z.owner >= 0 && z.owner !== t && z.counts[z.owner] > 0) {
      // Gegner hält die Zone: Gegenangriff schon ab 1,2× seiner Besatzung (Zonengeld ist sein Vorteil).
      // Besitz und Anzahl in der Zone sind öffentlich; die Stärke wird mit dem mittleren Einheitenwert geschätzt.
      // Welle bündeln: nie schwächer losziehen als 1,2× die Besatzung (kleine Gruppen würden nur verheizt).
      // Schätzung: sind fast alle Besatzer sichtbar (Späher), zählt ihr echter Wert, sonst Anzahl × Mittelwert.
      const seen = inside.filter((e) => e.team === z.owner);
      const seenValue = seen.reduce((sum, e) => sum + (UNITS[e.type].cost.money || 0), 0);
      const threat = seen.length >= 0.7 * z.counts[z.owner] ? seenValue : z.counts[z.owner] * THREAT_PER_UNIT;
      need = Math.max(need, WAVE_ODDS * threat);
    }
    // Geduld: je länger keine Welle losging, desto weniger Stärke braucht die nächste (nie unter 60 %).
    need *= Math.max(WAVE_MIN, 1 - (g.time - this.lastWave) / WAVE_PATIENCE);
    // Nebel als Deckung: der Gegner sieht die Welle erst spät, sie geht schon mit weniger Stärke los
    if (this.cfg.weather && weatherSight(g) <= WX_FOG_SIGHT) need *= WX_FOG_WAVE;
    return need;
  }

  army(s) {
    const g = this.game;
    const t = this.team;
    const z = s.zone;
    this.rememberFobs();
    this.updateRaid(s);
    if (g.time < this.fallbackUntil) return; // Rückzug läuft: erst sammeln
    const raiding = this.raid ? this.raid.ids : null;
    const idle = s.combat.filter((u) => u.order.type === 'idle' && !this.dryKind(u) && !(raiding && raiding.has(u.id)));
    if (!idle.length) return;
    const inZone = (u) => dist(u.x, u.y, z.x, z.y) <= z.r;
    const ammoOk = true; // die Haupt-FOB hat unendlich Munition

    // Gegner in der Zone (sichtbar): deren Schwerpunkt ist das Ziel, sonst das Zonenzentrum
    const inside = s.enemies.filter((e) => dist(e.x, e.y, z.x, z.y) <= z.r);
    let tx = z.x;
    let ty = z.y;
    if (inside.length) {
      tx = inside.reduce((a, e) => a + e.x, 0) / inside.length;
      ty = inside.reduce((a, e) => a + e.y, 0) / inside.length;
    }

    if (ammoOk) {
      // Nur wer noch nicht in der Zone steht, zählt zur Welle (sonst gehen Nachrücker einzeln los, weil die Zonenbesatzung mitzählt).
      const strength = idle.filter((u) => !inZone(u)).reduce((sum, u) => sum + (UNITS[u.type].cost.money || 0), 0);
      const need = this.waveNeed(inside);
      const ready = strength >= need || (z.owner === -1 && strength >= 0.6 * need);
      if (ready) {
        let go = idle.filter((u) => !inZone(u));
        // Reserve: die Einheiten nahe der Haupt-FOB bleiben zur Verteidigung zurück (die große Startarmee rückt trotzdem aus)
        if (s.home && go.length >= 5) {
          go.sort((a, b) => dist(a.x, a.y, s.ax, s.ay) - dist(b.x, b.y, s.ax, s.ay));
          go = go.slice(Math.ceil(go.length * RESERVE));
        }
        const ids = go.map((u) => u.id);
        if (ids.length) {
          g.issue(t, { type: 'attackMove', ids, x: tx, y: ty, formation: 'wedge' }); // im Keil: Panzer vorn, alle kommen zusammen an
          this.lastWave = g.time;
        }
      }
    }

    if (inside.length) {
      if (!ammoOk) return;
      // Gegner in der Zone, eigene Einheit ohne Feindkontakt: auf die Gegner zu, sonst stehen beide Seiten
      // außer Sichtweite und das Gefecht kommt nie zustande.
      const lone = idle
        .filter((u) => inZone(u) && !u.house && !inside.some((e) => dist(e.x, e.y, u.x, u.y) < 300))
        .map((u) => u.id);
      if (lone.length) g.issue(t, { type: 'attackMove', ids: lone, x: tx, y: ty });
      return;
    }

    // Zone ist gegnerfrei: ein Teil der Besatzung überfällt eine gemerkte gegnerische FOB abseits der Zone (wer in einem Haus sitzt, bleibt).
    const garrison = idle.filter((u) => inZone(u) && !u.house);
    const left = this.startRaid(s, garrison);
    if (left.length < garrison.length) return;

    const clumped = idle.filter((u) => !u.house && dist(u.x, u.y, z.x, z.y) < 200);
    if (clumped.length >= 2) {
      const groups = 4;
      const base = this.rng.next() * TWO_PI;
      for (let i = 0; i < groups; i++) {
        const ids = clumped.filter((_, k) => k % groups === i).map((u) => u.id);
        if (!ids.length) continue;
        const a = base + (i * TWO_PI) / groups;
        const p = this.highGround(z.x + Math.cos(a) * 400, z.y + Math.sin(a) * 400, 220); // Kuppen bevorzugt
        g.issue(t, { type: 'attackMove', ids, x: p.x, y: p.y });
      }
    }
  }
}
