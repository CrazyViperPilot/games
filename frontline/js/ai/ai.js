// KI-Gegner (PLAN.md §5, §10.2, §11.5, §12.4). Steuert nur über game.issue und liest den Zustand. Kein DOM.
// Das HQ ist Ausgangspunkt (unbegrenzter Nachschub, 2 Ladeplätze); FOBs sind vorgeschobene Lager an der Front.
// Reihenfolge je Denkschritt: Baustellen pflegen, Verteidigung (HQ zuerst), Rückzug, Förderanlagen, Expansion (FOB-Baustellen),
// Halle, Produktion, Verteidigungsgebäude und Mauer, Baufahrzeuge, LKW (Lieferant/Pendler/Versorger), Sammelpunkte, Armee.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { makeRng } from '../core/rng.js';

const MAX_PLACE = 100; // canPlace-Aufrufe je Denkschritt (Budget für die Platzsuche)
const DEF_RANGE = BALANCE.fob.buildRadius; // Bauradius = Verteidigungsradius einer FOB
const FOB_COST = BALANCE.construction.fobMaterial; // Baumaterial, das eine FOB-Baustelle braucht
const ZONE_FOB_MIN_R = 360; // Zonen-FOB mindestens so weit von der Zonenmitte (eigene Hälfte)
const ZONE_FOB_R = BALANCE.zone.r * 0.6; // Zonen-FOB: Mittelpunkt höchstens so weit von der Zonenmitte
const HQ_R = BALANCE.hq.buildRadius; // Bauradius des HQ
const HQ_THREAT = 800; // Gegner so nah am HQ lösen die HQ-Verteidigung aus
const HQ_DEFEND = 1500; // alle Kampfeinheiten bis hierher zum HQ rufen
const THREAT_RANGE = 900; // Kampfeinheiten in dieser Nähe zur Bedrohung reagieren
const THREAT_DANGER = 600; // Gegner in dieser Nähe machen ein FOB-Ziel unattraktiver
const GATHER_DIST = 300; // Sammelpunkt Richtung Zone, vom Zentrum der Haupt-FOB
const ZONE_GATHER_DIST = 150; // Sammelpunkt an der Zonen-FOB, Richtung eigener Basis
const RALLY_MOVE = 150; // Sammelpunkt-Befehl nur neu setzen, wenn sich der Punkt so weit verschiebt
const MAX_FOB_NODE_DIST = 2600; // FOB-Ziele an Vorkommen höchstens so weit von der Haupt-FOB
const SITE_TIMEOUT = 200; // s, eine FOB-Baustelle ohne Material wird danach abgerissen
const BAD_TIME = 240; // s, Sperre eines fehlgeschlagenen FOB-Ziels
const ALARM_TIME = 30; // s, Treffer an der Basis gelten als Angriff auf die Basis
const AMMO_ATTACK = 30; // kein Vorstoß, wenn die Zonen-FOB weniger Munition hat
const PUSH_NEAR = 450; // Einheiten näher am Zonenziel gelten als angekommen
const WAVE = 600; // Geldwert einer Welle, die vom HQ zur Zonen-FOB marschiert
const ASSAULT_RATIO = 2; // Angriff aufs gegnerische HQ ab dieser Überlegenheit (Geldwert der Kampfeinheiten)
const ASSAULT_MIN = 20; // und mindestens so vielen eigenen Kampfeinheiten
const DRY = 0.2; // Einheiten mit weniger Munition/Treibstoff (Anteil) ziehen sich zurück
const RICH = 1500; // Geld, ab dem zusätzliche Hallen gebaut werden
const WALL_OFFSET = 4; // Mauer im Abstand (Zellen) vom Zentrum der Haupt-FOB
const WALL_HALF = 3; // Mauerlinie: 2 × WALL_HALF + 1 Zellen, Tor in der Mitte
const MIX = { rifleman: 0.5, at: 0.2, ifv: 0.2, tank: 0.1 }; // Zielanteile der Kampfeinheiten
const FOB_CAP = { easy: 3, normal: 6, hard: 6 }; // FOB-Grenze je Schwierigkeit (Spielmaximum 6)
const DEPOT_CAP = { easy: 1, normal: 2, hard: 3 }; // Fahrzeughallen je Schwierigkeit
const NODE_W = { bm: 1, mun: 1.5, fuel: 1.5 }; // Gewicht eines freien Vorkommens für den FOB-Wert
const NEED = { bm: 1000, mun: 300, fuel: 250 }; // Bedarf je Sorte: kleinster Vorrat/Bedarf zuerst
const KEYS = ['bm', 'mun', 'fuel'];
const FOB_MUN_RESERVE = 40; // Munition, die ein FOB-Lager bei der Ausbildung für das Nachfüllen behält
const CAP = BALANCE.logistics.truckCapacity;
const ENG_NEAR = 250; // Baufahrzeug näher an einer Baustelle: die automatische Zuweisung übernimmt
const SUPPLY_BEHIND = 150; // Versorger steht so weit hinter dem Schwerpunkt der Armee
const SUPPLY_MIN = 0.25; // Versorger lädt nach, wenn die Ladung unter diesem Anteil liegt
const MAX_PEND = 5; // Pendler insgesamt
const PEND_STEP = 1500; // 1 Pendler je so viele px Strecke HQ → Zonen-FOB
const SURPLUS_MIN = 120; // Pendler fährt nur, wenn die Quelle so viel Überschuss hat
const ROUTE_HOLD = 20; // s, früheste Neuplanung einer Pendler-Route
const DEFAULT_OPTS = { hall: 'hq', train: 'hq', assault: true };
const DEG = Math.PI / 180;
const SITE_ANGLES = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180].map((d) => d * DEG);
const TWO_PI = Math.PI * 2;
const RES_KEYS = ['money', 'bm', 'mun', 'fuel'];

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
/** Bauradius eines Lager-Gebäudes (HQ oder FOB). */
const depotR = (b) => (b.type === 'hq' ? HQ_R : DEF_RANGE);
const TILE = BALANCE.map.tile;

/** Mittelpunkt einer Förderanlage am Vorkommen (wie canPlace: 2×2 Zellen, Mitte auf Zellgrenze). */
const extractorCenter = (n) => ({ x: Math.floor(n.x / TILE) * TILE, y: Math.floor(n.y / TILE) * TILE });

function unitVec(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}


/** Summe der Ladung eines LKW. */
const cargoTotal = (u) => u.cargo.bm + u.cargo.mun + u.cargo.fuel;

export class AI {
  /**
   * opts (nur für Messungen): hall 'hq' | 'front' (Fahrzeughalle nahe HQ oder an der Front-FOB),
   * train 'hq' | 'front' (Infanterie am HQ oder an der vordersten FOB mit Vorrat), assault false = nie das gegnerische HQ angreifen.
   */
  constructor(game, team, difficulty = 'normal', opts = {}) {
    this.game = game;
    this.opts = { ...DEFAULT_OPTS, ...opts };
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
    this.bmMines = 0; // Baumaterial-Förderanlagen (alive), aus snapshot
    this.hadZoneFob = false; // eine Zonen-FOB (auch Baustelle) existierte im letzten Denkschritt
    this.avoidZone = false; // Vorkommen-FOBs außerhalb der (feindlich gehaltenen) Zone suchen
    this.zoneBan = 0; // bis dahin keine neue Zonen-FOB (nach Verlust, gegen Nachschub in den Tod)
    this.assault = false; // Angriff auf das gegnerische HQ läuft
    this.defMemo = null; // letztes Ziel der HQ-Verteidigung { x, y, t }

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
    this.buildExtractors(s);
    this.expand(s); // FOB-Baustellen setzen (Material liefert der Lieferant)
    this.buildDepot(s);
    this.produce(s);
    this.buildDefense(s);
    this.buildWall(s);
    this.manageEngineers(s);
    this.manageTrucks(s);
    this.park(s);
    this.rally(s);
    this.army(s);
  }

  // ---- Lesen des Zustands ---------------------------------------------------------

  snapshot() {
    const g = this.game;
    const t = this.team;
    const own = g.buildings.filter((b) => b.alive && b.team === t);
    const fobs = own.filter((b) => b.type === 'fob');
    const builtFobs = fobs.filter((b) => b.built).sort((a, b) => a.id - b.id);
    const hq = own.find((b) => b.type === 'hq' && b.built) ?? null;
    const units = g.units.filter((u) => u.alive && u.team === t);
    const home = hq; // Ausgangspunkt der KI ist das HQ (§12.4)
    const ax = home ? home.x : fobs[0] ? fobs[0].x : g.map.spawns[t].x;
    const ay = home ? home.y : fobs[0] ? fobs[0].y : g.map.spawns[t].y;
    const zone = g.zone;
    const dir = unitVec(zone.x - ax, zone.y - ay);
    // Gegner nur, soweit das eigene Team sie sieht (Nebel)
    const enemies = g.units.filter((u) => u.alive && u.team !== t && g.isVisible(t, u.x, u.y));
    this.corridor = home ? { x: home.x, y: home.y, dx: dir.x, dy: dir.y } : null;

    const combat = units.filter((u) => u.def.range > 0);
    const extractors = own.filter((b) => b.type === 'extractor');
    this.bmMines = extractors.filter((b) => b.nodeId !== null && g.nodeById.get(b.nodeId)?.type === 'bm').length;
    const zoneFob = fobs.find((f) => dist(f.x, f.y, zone.x, zone.y) <= ZONE_FOB_R + 16) ?? null;
    // Bedrohung des HQ: sichtbare Gegner in der Nähe oder Treffer am HQ bzw. an Gebäuden in seinem Umkreis
    const hqEnemies = home ? enemies.filter((e) => dist(e.x, e.y, ax, ay) <= HQ_THREAT) : [];
    const alarm =
      !!home &&
      (hqEnemies.length > 0 ||
        own.some((b) => dist(b.x, b.y, ax, ay) <= DEF_RANGE + 100 && b.lastHitTime > g.time - ALARM_TIME));
    const enemyHq = g.buildings.find((b) => b.alive && b.team !== t && b.type === 'hq') ?? null;
    // FOB-Baustellen, die noch auf ihr Baumaterial warten (Zonen-FOB zuerst)
    const needMat = fobs
      .filter((f) => !f.built && !f.supplied && f.store.bm < FOB_COST)
      .sort((a, b) => (b === zoneFob) - (a === zoneFob) || a.id - b.id);

    return {
      own,
      fobs,
      builtFobs,
      depots: home ? [home, ...builtFobs] : builtFobs, // Lager-Gebäude: HQ (unbegrenzt) und fertige FOBs
      hq,
      hqEnemies,
      enemyHq,
      home,
      ax,
      ay,
      dir,
      zone,
      zoneFob,
      enemies,
      // Gegner in der Zone: Zielwahl ohne Nebel (PRD §10), sonst blockiert ein einzelner versprengter Gegner die Zone ewig
      zoneEnemies: g.units.filter((u) => u.alive && u.team !== t && dist(u.x, u.y, zone.x, zone.y) <= zone.r),
      units,
      combat,
      trucks: units.filter((u) => u.type === 'truck').sort((a, b) => a.id - b.id),
      engineers: units.filter((u) => u.type === 'engineer').sort((a, b) => a.id - b.id),
      extractors,
      extBuilt: extractors.filter((b) => b.built).length,
      depotBuilt: own.some((b) => b.type === 'depot' && b.built),
      freeNodes: g.map.nodes.filter((n) => !g.extractorOn(n.id)),
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

  /** Summenprüfung (Geld und Summe der FOB-Lager); der genaue Zahler wird erst von canPlace/train geprüft. */
  canPay(cost, reserveBm = 0) {
    const res = this.game.teams[this.team].res;
    for (const k of RES_KEYS) {
      if (res[k] < (cost[k] || 0) + (k === 'bm' && cost.bm ? reserveBm : 0)) return false;
    }
    return true;
  }

  /** Baumaterial, das für die nächste FOB zurückgehalten wird (Verteidigung und zweite Halle). */
  fobReserve(s) {
    return s.fobs.length < this.fobCap() ? FOB_COST : 0;
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
        // die abgefragte Position zurückgeben (nicht die Fußabdruck-Mitte): der Bau-Befehl prüft dieselbe Stelle noch einmal
        if (this.place(type, x, y)) return { x, y };
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

  /** Sammelpunkt: an der Zonen-FOB (Richtung Basis), sonst Richtung Zone vor dem HQ; bei Angriff aufs HQ am HQ. */
  gatherPoint(s) {
    if (s.alarm && s.hq) return this.guardPoint(s);
    if (s.zoneFob && s.zoneFob.built) {
      const v = unitVec(s.ax - s.zoneFob.x, s.ay - s.zoneFob.y);
      return this.freeNear(s.zoneFob.x + v.x * ZONE_GATHER_DIST, s.zoneFob.y + v.y * ZONE_GATHER_DIST);
    }
    return this.guardPoint(s);
  }

  /** Wachposten am HQ: Richtung Zone vor dem HQ. */
  guardPoint(s) {
    return this.freeNear(s.ax + s.dir.x * GATHER_DIST, s.ay + s.dir.y * GATHER_DIST);
  }

  /** Sollstärke der Heimwache (Kampfeinheiten nahe dem HQ): ab 8 Kampfeinheiten ein Viertel, höchstens 10. */
  guardWanted(s) {
    return s.combat.length < 8 ? 0 : Math.min(10, Math.floor(s.combat.length / 4));
  }

  /** Untätige Kampfeinheiten der Heimwache (die HQ-nächsten bis zur Sollstärke). */
  guardUnits(s) {
    if (!s.hq) return [];
    const want = this.guardWanted(s);
    return s.combat
      .filter((u) => dist(u.x, u.y, s.ax, s.ay) <= 700 && !(u.order.type === 'move' && dist(u.order.x, u.order.y, s.ax, s.ay) > 700))
      .sort((a, b) => dist(a.x, a.y, s.ax, s.ay) - dist(b.x, b.y, s.ax, s.ay) || a.id - b.id)
      .slice(0, want);
  }

  /** Förderanlage an Vorkommen n wäre im Bauradius einer dieser FOBs (gleiche Geometrie wie canPlace). */
  inBuildReach(fobs, n) {
    const c = extractorCenter(n);
    return fobs.some((f) => dist(f.x, f.y, c.x, c.y) <= DEF_RANGE);
  }

  /** Summe der Gewichte freier Vorkommen im Bauradius des Punktes (Liste `nodes`). */
  nodeValue(x, y, nodes) {
    let v = 0;
    for (const n of nodes) if (dist(n.x, n.y, x, y) <= DEF_RANGE) v += this.nodeWeight(n.type);
    return v;
  }

  /** Gewicht eines Vorkommens: Baumaterial ist Engpass (FOBs, Förderanlagen), solange weniger als 3 stehen. */
  nodeWeight(type) {
    if (type === 'bm' && this.bmMines < 3) return 2.5;
    return NODE_W[type];
  }

  /** Gegner (sichtbar) in der Nähe eines Punktes: Malus für FOB-Ziele. */
  danger(s, x, y) {
    return s.enemies.some((e) => dist(e.x, e.y, x, y) <= THREAT_DANGER) ? 2 : 0;
  }

  // ---- Verteidigung und Rückzug ---------------------------------------------------

  /**
   * HQ-Verteidigung (höchste Priorität, das HQ-Verlust ist die Niederlage): sichtbare Gegner am HQ oder Treffer →
   * alle Kampfeinheiten bis HQ_DEFEND px greifen an; ist die Bedrohung stark, kommt die ganze Armee.
   * Danach Verteidigung der FOBs: Gegner im Bauradius → Kampfeinheiten in der Nähe greifen dort an.
   */
  defend(s) {
    const g = this.game;
    if (s.hq && s.alarm) {
      const near = s.hqEnemies.length ? s.hqEnemies : s.enemies.filter((e) => dist(e.x, e.y, s.ax, s.ay) <= HQ_DEFEND);
      let cx = s.ax + s.dir.x * 120;
      let cy = s.ay + s.dir.y * 120;
      if (near.length) {
        cx = near.reduce((a, e) => a + e.x, 0) / near.length;
        cy = near.reduce((a, e) => a + e.y, 0) / near.length;
      }
      const value = (list) => list.reduce((a, u) => a + (UNITS[u.type].cost.money || 0), 0);
      const close = s.combat.filter((u) => dist(u.x, u.y, s.ax, s.ay) <= HQ_DEFEND);
      // starke Bedrohung: die ganze Armee kommt (Niederlage bei HQ-Verlust)
      const all = near.length && value(near) > 0.7 * value(close) ? s.combat : close;
      const ids = all
        .filter((u) => !(u.order.type === 'attackMove' && dist(u.order.x, u.order.y, cx, cy) < 250))
        .filter((u) => u.order.type !== 'attack')
        .map((u) => u.id);
      if (ids.length) g.issue(this.team, { type: 'attackMove', ids, x: cx, y: cy });
      this.assault = false;
    }
    if (!s.enemies.length) return;
    for (const f of s.builtFobs) {
      const near = s.enemies.filter((e) => dist(e.x, e.y, f.x, f.y) <= DEF_RANGE);
      if (!near.length) continue;
      const cx = near.reduce((a, e) => a + e.x, 0) / near.length;
      const cy = near.reduce((a, e) => a + e.y, 0) / near.length;
      const ids = s.combat
        .filter((u) => dist(u.x, u.y, cx, cy) <= THREAT_RANGE)
        .filter((u) => !(u.order.type === 'attackMove' && dist(u.order.x, u.order.y, cx, cy) < 120))
        .filter((u) => u.order.type !== 'attack')
        .map((u) => u.id);
      if (ids.length) g.issue(this.team, { type: 'attackMove', ids, x: cx, y: cy });
    }
  }

  /** Einheit mit fast leerem Munitions- oder Treibstoffvorrat (Anteil < DRY)? Liefert 'mun', 'fuel' oder null. */
  dryKind(u) {
    if (u.def.ammoMax > 0 && u.ammo < DRY * u.def.ammoMax) return 'mun';
    if (u.def.fuelMax > 0 && u.fuel < DRY * u.def.fuelMax) return 'fuel';
    return null;
  }

  /**
   * Einheiten mit fast leerem Vorrat ziehen sich zum nächsten Lager (FOB mit Vorrat, sonst HQ) oder zum Versorger
   * zurück, sofern sie nicht schon dort nachgefüllt werden. Nicht bei Angriff auf die Basis.
   */
  retreat(s) {
    if (s.alarm || !s.depots.length) return;
    const groups = new Map(); // Zielschlüssel -> { x, y, ids }
    const supplyTrucks = s.trucks.filter((t) => this.roles.get(t.id) === 'vers');
    for (const u of s.combat) {
      const k = this.dryKind(u);
      if (!k || u.order.type === 'move' || u.order.type === 'attack') continue;
      // wird dort, wo die Einheit steht, bereits nachgefüllt?
      if (s.depots.some((f) => f.store[k] > 2 && dist(f.x, f.y, u.x, u.y) <= depotR(f))) continue;
      const lorry = s.trucks.find((t) => t.cargo[k] > 2 && dist(t.x, t.y, u.x, u.y) <= BALANCE.logistics.truckSupplyRange);
      if (lorry) continue;
      let best = null;
      let bd = Infinity;
      for (const f of s.depots) {
        const d = dist(f.x, f.y, u.x, u.y) + (f.store[k] >= 20 ? 0 : 3000);
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
      const p = gr.fob ? this.freeNear(gr.x + (this.rng.next() - 0.5) * 200, gr.y + (gr.fob.type === 'hq' ? 170 : 120)) : { x: gr.x, y: gr.y };
      this.game.issue(this.team, { type: 'move', ids: gr.ids, x: p.x, y: p.y });
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

  /**
   * FOB-Baustellen setzen: Zonen-FOB zuerst, dann Vorkommen-FOBs. Das Baufahrzeug fährt sofort los; das Material
   * (400 Baumaterial) lädt der Lieferant am HQ (unbegrenzt) und bringt es zur Baustelle.
   */
  expand(s) {
    const g = this.game;
    if (!s.engineers.length || !s.hq) return;
    if (s.fobs.length >= this.fobCap()) return;
    if (s.needMat.length >= 1 || s.fobs.filter((f) => !f.built).length >= 2) return;

    // Zonen-FOB zuerst – nicht kurz nach einem Verlust und nicht mitten in einer gegnerischen Übermacht
    const zoneHeld = s.zone.counts[1 - this.team] >= 4; // Besatzung der Zone ist öffentlich (wie bei der Zonenwertung)
    const zoneWanted = !s.zoneFob && g.time >= this.zoneBan && !zoneHeld;
    this.avoidZone = zoneHeld || g.time < this.zoneBan; // Vorkommen-FOBs dann nicht in der Zone bauen
    let site = zoneWanted ? this.zoneSite(s) : null;
    if (!site) site = this.nodeSite(s);
    if (!site) return;
    // nächstes untätiges Baufahrzeug fährt sofort hin
    const idle = s.engineers.filter((u) => u.order.type === 'idle').sort((a, b) => dist(a.x, a.y, site.x, site.y) - dist(b.x, b.y, site.x, site.y));
    const cmd = { type: 'buildFob', x: site.x, y: site.y };
    if (idle.length) cmd.ids = [idle[0].id];
    const r = g.issue(this.team, cmd);
    if (!r.ok) this.badSites.push({ x: site.x, y: site.y, until: g.time + BAD_TIME });
  }

  /**
   * Zonen-FOB: Mittelpunkt innerhalb 0,6 · r der Zonenmitte, möglichst viele freie Vorkommen im Bauradius,
   * bei Gleichstand näher an der eigenen Basis.
   */
  zoneSite(s) {
    const z = s.zone;
    const cands = [];
    // Nur auf der eigenen Hälfte der Zone und mindestens 350 px von der Mitte: das Spiegelbild beim Gegner liegt dann
    // ≥ 700 px entfernt (Mindestabstand zu gegnerischen Gebäuden), keiner blockiert dem anderen den besten Platz.
    for (let r = ZONE_FOB_MIN_R; r <= ZONE_FOB_R - 20; r += 110) {
      const n = 16;
      const a0 = Math.atan2(s.ay - z.y, s.ax - z.x);
      for (let k = 0; k < n; k++) {
        const a = a0 + (k * TWO_PI) / n;
        if (Math.cos(k * TWO_PI / n) < -1e-6) continue;
        const x = z.x + Math.cos(a) * r;
        const y = z.y + Math.sin(a) * r;
        const d = dist(x, y, s.ax, s.ay);
        cands.push({ x, y, v: this.nodeValue(x, y, s.freeNodes) - d / 1500, d }); // Vorkommen zählen, die eigene Seite ist sicherer
      }
    }
    cands.sort((a, b) => b.v - a.v || a.d - b.d);
    for (const c of cands) {
      if (this.budget <= 0) break;
      if (this.isBad(c.x, c.y) || this.danger(s, c.x, c.y)) continue;
      const p = this.place('fob', c.x, c.y);
      if (p && dist(p.x, p.y, z.x, z.y) <= ZONE_FOB_R) return { x: c.x, y: c.y, zone: true };
    }
    return null;
  }

  /**
   * Vorkommen-FOB: Vorkommen, die noch keine FOB im Bauradius haben, nah an der Basis und ohne Gegner.
   * Standort 150–220 px vom Vorkommen, Richtung eigener Basis zuerst.
   */
  nodeSite(s) {
    const covered = s.fobs.map((f) => ({ x: f.x, y: f.y }));
    const uncovered = s.freeNodes.filter((n) => !this.inBuildReach(covered, n));
    if (!uncovered.length) return null;
    const top = uncovered
      .filter((n) => dist(n.x, n.y, s.ax, s.ay) <= MAX_FOB_NODE_DIST)
      .filter((n) => !this.avoidZone || dist(n.x, n.y, s.zone.x, s.zone.y) > s.zone.r + 150)
      .map((n) => ({ n, v: this.nodeValue(n.x, n.y, uncovered) - dist(n.x, n.y, s.ax, s.ay) / 2000 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3);

    const cands = [];
    for (const { n } of top) {
      const a0 = Math.atan2(s.ay - n.y, s.ax - n.x);
      for (const r of [150, 220]) {
        for (const o of [0, 45, -45, 90, -90, 135, -135, 180]) {
          const a = a0 + o * DEG;
          const x = n.x + Math.cos(a) * r;
          const y = n.y + Math.sin(a) * r;
          if (this.avoidZone && dist(x, y, s.zone.x, s.zone.y) < s.zone.r + 150) continue;
          const v = this.nodeValue(x, y, uncovered) - dist(x, y, s.ax, s.ay) / 2000 - this.danger(s, x, y);
          cands.push({ x, y, v });
        }
      }
    }
    cands.sort((a, b) => b.v - a.v);
    for (const c of cands) {
      if (this.budget <= 0) break;
      if (this.isBad(c.x, c.y)) continue;
      if (this.place('fob', c.x, c.y)) return { x: c.x, y: c.y, zone: false };
    }
    return null;
  }

  // ---- Wirtschaft ------------------------------------------------------------------

  /**
   * Förderanlagen (Nahquellen) auf freien Vorkommen im Bauradius einer fertigen Front-FOB, deren Lager das Baumaterial hat
   * (am HQ unnötig). Munition und Treibstoff an der Zonen-FOB zuerst; sonst nach Knappheit (kleinster Vorrat/Bedarf).
   * Höchstens 3 (mit 2 Baufahrzeugen 4) unfertige Förderanlagen gleichzeitig; keine Vorkommen mit Gegnern in der Nähe.
   */
  buildExtractors(s) {
    const g = this.game;
    const t = this.team;
    if (!s.builtFobs.length) return;
    let room = (s.engineers.length >= 2 ? 4 : 3) - s.extractors.filter((b) => !b.built).length;
    if (room <= 0) return;
    const res = g.teams[t].res;
    const zf = s.zoneFob && s.zoneFob.built ? s.zoneFob : null;
    const cands = s.freeNodes.filter((n) => this.inBuildReach(s.builtFobs, n) && !this.danger(s, n.x, n.y) && !this.isBad(n.x, n.y));
    const key = (n) => {
      let k = res[n.type] / NEED[n.type];
      if (n.type === 'bm' && this.bmMines < 1) k -= 1;
      if (zf && n.type !== 'bm' && dist(n.x, n.y, zf.x, zf.y) <= DEF_RANGE) k -= 0.8; // Munition/Treibstoff an der Zonen-FOB
      return k;
    };
    cands.sort((a, b) => key(a) - key(b) || dist(a.x, a.y, s.ax, s.ay) - dist(b.x, b.y, s.ax, s.ay));
    for (const n of cands) {
      if (room <= 0) break;
      const c = extractorCenter(n);
      if (!g.payerFor(t, c.x, c.y, BUILDINGS.extractor.cost)) continue; // kein Lager mit Baumaterial in Reichweite
      const r = g.issue(t, { type: 'build', building: 'extractor', x: n.x, y: n.y });
      if (r.ok) room--;
      else this.badSites.push({ x: n.x, y: n.y, until: g.time + BAD_TIME }); // z. B. am Kartenrand: nicht jeden Schritt neu versuchen
    }
  }

  /**
   * Fahrzeughalle: die erste früh (nach der ersten FOB-Baustelle), nur Baumaterial. Weitere nur bei Geldüberschuss
   * (> 1500) und genug Munition/Treibstoff, bis zur Grenze je Schwierigkeit (normal 2, schwer 3).
   * opts.hall 'hq': hinter dem HQ (bezahlt aus dem unbegrenzten HQ-Lager); 'front': an der Zonen-FOB (Lager nötig).
   */
  buildDepot(s) {
    const g = this.game;
    const t = this.team;
    const res = g.teams[t].res;
    if (!s.hq) return;
    const have = s.own.filter((b) => b.type === 'depot').length;
    if (have < 1 && (g.time < 45 || !s.fobs.length)) return;
    const rich = res.money > RICH && s.extBuilt >= 4;
    const want = Math.min(DEPOT_CAP[this.difficulty], have < 1 ? 1 : rich ? have + 1 : have);
    if (have >= want) return;
    if (s.own.some((b) => b.type === 'depot' && !b.built)) return;
    let p = null;
    if (this.opts.hall === 'front') {
      const anchors = [...s.builtFobs].sort((a, b) => dist(a.x, a.y, s.zone.x, s.zone.y) - dist(b.x, b.y, s.zone.x, s.zone.y));
      const f = anchors[0];
      if (!f || f.store.bm < BUILDINGS.depot.cost.bm) return;
      p = this.findSite('depot', f.x, f.y, 130, 330, { angle: Math.atan2(s.ay - f.y, s.ax - f.x) });
    } else {
      p = this.findSite('depot', s.hq.x, s.hq.y, 130, 330, {
        angle: Math.atan2(-s.dir.y, -s.dir.x), // hinter dem HQ
        corridor: true,
      });
    }
    if (p && !g.issue(t, { type: 'build', building: 'depot', x: p.x, y: p.y }).ok) this.badSites.push({ x: p.x, y: p.y, until: g.time + BAD_TIME });
  }

  // ---- Produktion ------------------------------------------------------------------

  /**
   * Beste ausbildende Einrichtung für `type`: Lager deckt die Kosten (HQ immer), kürzeste Warteschlange, dann nach
   * `pref`: 'hq' = HQ zuerst, 'front' = nächste zur Zone. FOB-Lager behalten eine Munitionsreserve für das Nachfüllen.
   */
  pickProducer(s, type, qmax, pref) {
    const g = this.game;
    const cost = UNITS[type].cost;
    let best = null;
    let bestKey = Infinity;
    for (const b of s.own) {
      if (!b.built || !b.def.produces.includes(type) || b.queue.length >= qmax) continue;
      let payer = b;
      if (b.type !== 'hq' && b.type !== 'fob') payer = g.payerFor(this.team, b.x, b.y, cost); // Halle: Zahler in Reichweite
      if (!payer || !KEYS.every((k) => payer.store[k] >= (cost[k] || 0))) continue;
      if (payer.type === 'fob' && cost.mun && payer.store.mun - cost.mun < FOB_MUN_RESERVE) continue;
      const order = pref === 'front' ? dist(b.x, b.y, s.zone.x, s.zone.y) : b.type === 'hq' ? 0 : b.id + 1;
      const key = b.queue.length * 100000 + order;
      if (key < bestKey) {
        bestKey = key;
        best = b;
      }
    }
    return best;
  }

  /**
   * Baufahrzeuge (Ersatz zuerst – ohne Baufahrzeug droht die Eliminierung), LKW, dann Kampfeinheiten nach Zielmischung.
   * Eine Ausbildung zahlt aus dem Lager der ausbildenden FOB: Pendler bringen ihr Munition/Treibstoff.
   */
  produce(s) {
    const g = this.game;
    const t = this.team;
    const res = g.teams[t].res;
    const qmax = res.money > 900 ? 4 : 2;

    // Baufahrzeuge: 2 (3 ab 3 FOBs); Ausbildung nur am HQ (unbegrenzt)
    const engWant = s.fobs.length >= 3 ? 3 : 2;
    const engHave = s.engineers.length + this.queued(s, 'engineer');
    if (engHave < engWant) {
      if (res.money >= UNITS.engineer.cost.money) {
        const b = this.pickProducer(s, 'engineer', BALANCE.queueMax - 1, 'hq');
        if (b) g.issue(t, { type: 'train', buildingId: b.id, unit: 'engineer' });
      } else if (!s.engineers.length) {
        return; // ohne Baufahrzeug droht die Eliminierung: Geld dafür sparen
      }
    }

    // LKW nach Rollen
    const quota = this.truckQuota(s);
    const truckHave = s.trucks.length + this.queued(s, 'truck');
    if (truckHave < quota.total && res.money >= UNITS.truck.cost.money) {
      const b = this.pickProducer(s, 'truck', 2, 'hq');
      if (b) g.issue(t, { type: 'train', buildingId: b.id, unit: 'truck' });
    }

    if (g.unitCount(t) >= BALANCE.unitCap) return;

    // Kampfeinheiten: welche Typen sind gerade ausbildbar?
    const avail = new Set();
    for (const b of s.own) {
      if (!b.built || b.queue.length >= qmax) continue;
      for (const u of b.def.produces) if (MIX[u]) avail.add(u);
    }
    if (!avail.size) return;
    let sumW = 0;
    for (const u of avail) sumW += MIX[u];
    const counts = {};
    for (const u of avail) counts[u] = s.units.filter((x) => x.type === u).length + this.queued(s, u);
    let total = 0;
    for (const u of avail) total += counts[u];

    // Global nach Defizit: der wichtigste Typ bekommt die knappen Mittel. Fehlt er nur an Geld, wird gespart;
    // fehlt es nur im Lager der Produktionsstätten, kommt der nächste Typ dran (Pendler füllen auf).
    for (let k = 0; k < 4; k++) {
      const entries = [];
      for (const u of avail) entries.push({ u, deficit: (MIX[u] / sumW) * (total + 1) - counts[u] });
      entries.sort((a, c) => c.deficit - a.deficit);
      let pick = null;
      for (const e of entries) {
        const b = this.pickProducer(s, e.u, qmax, UNITS[e.u].producedAt === 'depot' || this.opts.train === 'front' ? 'front' : 'hq');
        if (b && res.money >= (UNITS[e.u].cost.money || 0)) {
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

  // ---- Verteidigungsgebäude und Mauer ---------------------------------------------

  /**
   * Verteidigung erst mit Wirtschaftsbasis (≥ 6 fertige Förderanlagen und fertige Halle).
   * Ausnahme: Angriff auf die Basis – dann genau eine Flugabwehr oder ein Mörser.
   */
  defenseMode(s) {
    if (s.extBuilt >= 6 && s.depotBuilt) return 'full';
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
    if (s.own.filter((b) => !b.built && b.type !== 'extractor' && b.type !== 'fob').length >= 2) return; // Baufahrzeug ausgelastet
    const z = s.zone;
    const fobs = [...s.builtFobs].sort((a, b) => dist(a.x, a.y, z.x, z.y) - dist(b.x, b.y, z.x, z.y));
    const toZone = Math.atan2(s.dir.y, s.dir.x);

    for (const f of fobs) {
      for (const type of ['aa', 'mortar']) {
        const have = s.own.some((b) => b.type === type && dist(b.x, b.y, f.x, f.y) < DEF_RANGE);
        if (have || !this.canPay(BUILDINGS[type].cost, this.fobReserve(s) + 300)) continue;
        if (g.depotsInRadius(t, f.x, f.y).every((o) => o.store.bm < BUILDINGS[type].cost.bm || o.store.mun < BUILDINGS[type].cost.mun)) continue;
        const p = this.findSite(type, f.x, f.y, 130, 330, {
          angle: toZone,
          corridor: f === s.home,
        });
        if (p) {
          if (!g.issue(t, { type: 'build', building: type, x: p.x, y: p.y }).ok) this.badSites.push({ x: p.x, y: p.y, until: g.time + BAD_TIME });
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
    if (!this.canPay(BUILDINGS.wall.cost, this.fobReserve(s) + 100)) return; // Mauern nur mit Reserve
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
      .filter((u) => u.type === 'rifleman' && u.order.type === 'idle' && !this.dryKind(u) && dist(u.x, u.y, mx, my) <= 700)
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
    const prio = (b) => (b.type === 'fob' ? 0 : b.type === 'extractor' ? 1 : b.type === 'depot' ? 2 : 3);
    for (const u of s.engineers) {
      if (u.order.type !== 'idle') continue;
      let best = null;
      let bestKey = Infinity;
      for (const b of sites) {
        const taken = s.engineers.some(
          (e) => e !== u && ((e.order.type === 'build' && e.order.targetId === b.id) || (e.order.type === 'move' && this.engTarget.get(e.id) === b.id)),
        );
        const key = prio(b) * 1500 + dist(u.x, u.y, b.x, b.y) + (taken ? 6000 : 0); // unbesetzte Baustellen zuerst
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

  // ---- LKW ---------------------------------------------------------------------------

  /**
   * Soll-Zahl der LKW je Rolle: 1 Lieferant (solange FOB-Baustellen möglich; ohne Auftrag pendelt er), Pendler nach
   * Strecke HQ → Zonen-FOB (1 je 1500 px) plus 1 je 2 weitere Front-FOBs (max. 5; vor der ersten fertigen FOB nur 1),
   * Versorger ab 15 Kampfeinheiten. Das HQ lädt höchstens 2 LKW zugleich – mehr als 5 Pendler wären nur Warteschlange.
   */
  truckQuota(s) {
    const lief = s.fobs.length < this.fobCap() || s.needMat.length > 0 ? 1 : 0;
    let pend = 0;
    if (s.hq && s.fobs.length) {
      const zf = s.zoneFob;
      const d = zf ? dist(s.ax, s.ay, zf.x, zf.y) : Math.max(0, dist(s.ax, s.ay, s.zone.x, s.zone.y) - 500);
      const others = s.builtFobs.filter((f) => f !== zf).length;
      pend = Math.min(MAX_PEND, Math.ceil(d / PEND_STEP) + Math.ceil(others / 2));
      if (!s.builtFobs.length) pend = Math.min(pend, 1);
    }
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

  /** Soll-Lagerstand einer FOB je Sorte: die Zonen-FOB (Ausbildung, Nachfüllen der Armee) braucht am meisten. */
  wantOf(s, f) {
    const nodesFree = s.freeNodes.some((n) => dist(n.x, n.y, f.x, f.y) <= DEF_RANGE);
    if (f === s.zoneFob) return { bm: nodesFree ? 400 : 200, mun: 500, fuel: 300 };
    return { bm: nodesFree ? 200 : 80, mun: 100, fuel: 80 };
  }

  manageTrucks(s) {
    this.assignRoles(s);
    if (!s.hq) return;
    const taken = new Set();
    for (const tr of s.trucks) {
      const role = this.roles.get(tr.id);
      if (role === 'lief') {
        if (!this.manageLieferant(s, tr)) this.managePendler(s, tr, taken); // ohne Baustelle pendelt der Lieferant
      } else if (role === 'vers') this.manageVersorger(s, tr);
    }
    for (const tr of s.trucks) {
      if (this.roles.get(tr.id) === 'pend') this.managePendler(s, tr, taken);
    }
  }

  /** Lager (HQ oder fertige FOB) mit dem größten Vorrat einer Sorte (das HQ ist unbegrenzt, also immer vorn). */
  richest(s, k) {
    let best = null;
    for (const f of s.depots) if (!best || f.store[k] > best.store[k]) best = f;
    return best;
  }

  /**
   * Lieferant: lädt 400 Baumaterial am HQ (oder an einer näheren FOB mit reichlich Vorrat) und entlädt es an der eigenen
   * FOB-Baustelle. Liefert false, wenn keine Baustelle auf Material wartet (dann pendelt er).
   */
  manageLieferant(s, tr) {
    const g = this.game;
    const site = s.needMat[0];
    if (!site) return false;
    const o = tr.order.type;
    if (o === 'load' || o === 'unload') return true; // arbeitet noch
    // Pendler mit voller Fracht fährt erst zu Ende
    if (o === 'route' && tr.order.phase === 'unload' && cargoTotal(tr) > 100) return false;
    const sum = cargoTotal(tr);
    if (tr.cargo.bm >= CAP - 20) {
      if (this.once(`unl${tr.id}:${site.id}`, 6)) g.issue(this.team, { type: 'unload', ids: [tr.id], fobId: site.id });
      return true;
    }
    if (sum - tr.cargo.bm > 40) {
      // fremde Ladung zuerst an der nächsten FOB abladen
      const f = this.nearestBuilt(s, tr.x, tr.y);
      if (f && this.once(`dmp${tr.id}`, 6)) g.issue(this.team, { type: 'unload', ids: [tr.id], fobId: f.id });
      return true;
    }
    // Quelle: näheste Lager mit genug Baumaterial (FOBs behalten 100 zurück), sonst das HQ
    let src = s.hq;
    let sd = dist(s.hq.x, s.hq.y, site.x, site.y);
    for (const f of s.builtFobs) {
      const d = dist(f.x, f.y, site.x, site.y);
      if (d < sd && f.store.bm >= CAP - tr.cargo.bm + 100) {
        src = f;
        sd = d;
      }
    }
    if (this.once(`lod${tr.id}`, 4)) {
      g.issue(this.team, { type: 'load', ids: [tr.id], fobId: src.id, preset: 'bm' });
      this.routes.delete(tr.id);
    }
    return true;
  }

  nearestDepot(s, x, y) {
    let best = null;
    let bd = Infinity;
    for (const f of s.depots) {
      const d = dist(f.x, f.y, x, y);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
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
   * Bester Transport: Ziel-FOB und Sorte mit dem größten Bedarf (Zonen-FOB bevorzugt). Quelle ist das HQ (unbegrenzt),
   * außer eine deutlich nähere FOB hat Überschuss dieser Sorte (mindestens SURPLUS_MIN).
   */
  pendlerPlan(s, taken) {
    let best = null;
    for (const to of s.builtFobs) {
      const wTo = this.wantOf(s, to);
      for (const k of KEYS) {
        if (taken.has(to.id + k)) continue;
        const need = (wTo[k] - to.store[k]) / wTo[k];
        if (need < 0.3) continue;
        const score = need * (to === s.zoneFob ? 1.5 : 1);
        if (best && score <= best.score) continue;
        let src = s.hq;
        let sv = 400 - dist(s.hq.x, s.hq.y, to.x, to.y) / 10;
        for (const f of s.builtFobs) {
          if (f === to) continue;
          const sur = f.store[k] - 0.5 * this.wantOf(s, f)[k];
          if (sur < SURPLUS_MIN) continue;
          const sc = Math.min(sur, 400) - dist(f.x, f.y, to.x, to.y) / 10;
          if (sc > sv) {
            sv = sc;
            src = f;
          }
        }
        best = { from: src, to, k, score };
      }
    }
    return best;
  }

  /** Pendler: Route vom HQ (oder einer Überschuss-FOB) zur Front-FOB mit Bedarf, Ladungsart nach Engpass. */
  managePendler(s, tr, taken) {
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
    const plan = this.pendlerPlan(s, taken);
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
      // Quelle: das Lager (HQ oder FOB) mit Vorrat, das dem Heer am nächsten liegt
      const src = s.depots.filter((f) => f.store[k] >= 150).sort((a, b) => dist(a.x, a.y, cx, cy) - dist(b.x, b.y, cx, cy))[0];
      if (src) {
        if (this.once(`vld${tr.id}`, 6)) g.issue(this.team, { type: 'load', ids: [tr.id], fobId: src.id, preset: k });
        return;
      }
    }
    const f = this.nearestDepot(s, cx, cy);
    const v = f ? unitVec(f.x - cx, f.y - cy) : { x: 0, y: 0 };
    const p = this.freeNear(cx + v.x * SUPPLY_BEHIND, cy + v.y * SUPPLY_BEHIND);
    const last = this.supplyAt.get(tr.id);
    const moved = !last || dist(last.x, last.y, p.x, p.y) > 120;
    if (!(moved || (o === 'idle' && dist(tr.x, tr.y, p.x, p.y) > 120))) return;
    if (!this.once(`vmv${tr.id}`, 4)) return;
    this.supplyAt.set(tr.id, p);
    g.issue(this.team, { type: 'move', ids: [tr.id], x: p.x, y: p.y });
  }

  /**
   * Untätige LKW und Baufahrzeuge verlassen die Konfliktzone und warten außerhalb (am nächsten Lager): Sonst halten sie die
   * Zone dauernd „umkämpft“ (Einheiten zählen für die Kontrolle) und sterben dort ohne Nutzen.
   */
  park(s) {
    const z = s.zone;
    const idleWorkers = [...s.trucks.filter((u) => this.roles.get(u.id) !== 'vers'), ...s.engineers].filter(
      (u) => u.order.type === 'idle' && dist(u.x, u.y, z.x, z.y) <= z.r,
    );
    if (!idleWorkers.length) return;
    const sites = s.own.some((b) => !b.built);
    const outside = s.depots.filter((f) => dist(f.x, f.y, z.x, z.y) > z.r + 100);
    for (const u of idleWorkers) {
      if (u.type === 'engineer' && (sites || s.own.some((b) => b.built && b.hp < b.maxHp && dist(b.x, b.y, u.x, u.y) < 400))) continue;
      if (!this.once(`park${u.id}`, 20)) continue;
      let f = null;
      let bd = Infinity;
      for (const d of outside) {
        const dd = dist(d.x, d.y, u.x, u.y);
        if (dd < bd) {
          bd = dd;
          f = d;
        }
      }
      f = f ?? s.hq;
      if (!f) continue;
      const p = this.freeNear(f.x + (this.rng.next() - 0.5) * 200, f.y + (f.type === 'hq' ? 170 : 120));
      this.game.issue(this.team, { type: 'move', ids: [u.id], x: p.x, y: p.y });
    }
  }

  // ---- Armee -----------------------------------------------------------------------

  /**
   * Sammelpunkte setzen (Produktionsgebäude), neu nur wenn sich der Sammelpunkt deutlich verschoben hat.
   * Am HQ ausgebildete Einheiten sammeln sich vor dem HQ (Heimwache, dann Wellen an die Front – kein Tröpfeln einzelner
   * Einheiten über 2500 px); FOB-Produktion sammelt direkt am Frontpunkt.
   */
  rally(s) {
    if (!s.hq) return;
    const front = this.gatherPoint(s);
    const home = this.guardPoint(s);
    for (const b of s.own) {
      if (!b.built || !b.def.produces.length) continue;
      const nearHq = b.type === 'hq' || dist(b.x, b.y, s.ax, s.ay) <= HQ_R;
      const gp = nearHq ? home : front;
      const prev = this.rallyAt.get(b.id);
      if (prev && dist(prev.x, prev.y, gp.x, gp.y) < RALLY_MOVE) continue;
      this.rallyAt.set(b.id, gp);
      this.game.issue(this.team, { type: 'rally', buildingId: b.id, x: gp.x, y: gp.y });
    }
  }

  /** Geldwert einer Einheitenliste. */
  value(list) {
    return list.reduce((a, u) => a + (UNITS[u.type].cost.money || 0), 0);
  }

  /**
   * Angriff auf das gegnerische HQ (Niederlage des Gegners): nur bei klarer Überlegenheit – die eigene Kampfstärke
   * (Geldwert) mindestens doppelt so hoch wie die des Gegners (Zielwahl ohne Nebel), Zone gehalten, genug Einheiten.
   * Fällt das Verhältnis unter 1,3 oder wird das eigene HQ bedroht, endet der Angriff.
   */
  updateAssault(s) {
    if (!this.opts.assault || !s.enemyHq || !s.hq) {
      this.assault = false;
      return;
    }
    const g = this.game;
    const mine = this.value(s.combat);
    const foe = this.value(g.units.filter((u) => u.alive && u.team !== this.team && u.def.range > 0));
    if (this.assault) {
      if (s.alarm || mine < 1.3 * foe || s.combat.length < 10) this.assault = false;
    } else if (!s.alarm && s.zone.owner === this.team && s.combat.length >= ASSAULT_MIN && mine >= ASSAULT_RATIO * foe) {
      this.assault = true;
    }
  }

  /**
   * Zone: Sammeln und Angriff. Untätige Einheiten (ohne Heimwache) gehen zur Zonen-FOB, sobald diese steht; in die Zonenmitte
   * bzw. zu den Gegnern in der Zone geht es, sobald die Summe der idle Kampfeinheiten (Geldwert) die Schwelle erreicht
   * (bei unbesetzter Zone schon ab 60 %). Einheiten mit fast leerem Vorrat bleiben zum Nachfüllen zurück.
   * In der Zone stehende Einheiten verteilen sich auf einem Kreis (r 400) statt im Zentrum zu klumpen.
   */
  army(s) {
    const g = this.game;
    const t = this.team;
    const z = s.zone;
    this.updateAssault(s);
    if (s.alarm) return; // defend() führt die Verteidigung
    const guard = new Set(this.guardUnits(s).map((u) => u.id));
    const idle = s.combat.filter((u) => u.order.type === 'idle' && !this.dryKind(u) && !guard.has(u.id));
    if (!idle.length) return;

    if (this.assault && s.enemyHq) {
      const go = idle.filter((u) => dist(u.x, u.y, s.enemyHq.x, s.enemyHq.y) > 350).map((u) => u.id);
      if (go.length) g.issue(t, { type: 'attackMove', ids: go, x: s.enemyHq.x, y: s.enemyHq.y });
      return;
    }

    const inZone = (u) => dist(u.x, u.y, z.x, z.y) <= z.r;
    const zf = s.zoneFob && s.zoneFob.built ? s.zoneFob : null;
    // Ohne Vorrat an der Front lohnt kein Vorstoß (die Einheiten würden trocken laufen)
    const ammoOk = !zf || zf.store.mun >= AMMO_ATTACK || s.trucks.some((tr) => tr.cargo.mun >= 100 && dist(tr.x, tr.y, zf.x, zf.y) < 600);

    // Gegner in der Zone: deren Schwerpunkt ist das Ziel, sonst das Zonenzentrum
    const inside = s.zoneEnemies;
    let tx = z.x;
    let ty = z.y;
    if (inside.length) {
      tx = inside.reduce((a, e) => a + e.x, 0) / inside.length;
      ty = inside.reduce((a, e) => a + e.y, 0) / inside.length;
    }

    const enemyZone = z.owner >= 0 && z.owner !== t && z.counts[z.owner] > 0;
    // Kampfwert der Gegner in der Zone (Zielwahl ohne Nebel)
    const threat = this.value(inside.filter((e) => e.def.range > 0));
    if (zf && !enemyZone && threat < WAVE) {
      // Zonen-FOB steht und die Zone gehört dem Gegner nicht: eine Welle (am HQ gesammelt) marschiert zur FOB
      const gp = this.gatherPoint(s);
      const far = idle.filter((u) => !inZone(u) && dist(u.x, u.y, gp.x, gp.y) > 400);
      if (this.value(far) >= WAVE) g.issue(t, { type: 'attackMove', ids: far.map((u) => u.id), x: gp.x, y: gp.y });
    }

    if (ammoOk) {
      const strength = this.value(idle);
      let need = this.cfg.attackStrength;
      if (inside.length) {
        // Gegner in der Zone: Vorstoß ab 1,3× ihrer Kampfstärke, aber nie über 1,5× der Grundschwelle
        need = Math.min(need * 1.5, Math.max(300, 1.3 * threat));
      }
      const ready = strength >= need || (z.owner === -1 && !inside.length && strength >= 0.6 * need);
      if (ready) {
        // alle untätigen Einheiten, die nicht schon im Zielgebiet stehen (auch die an der Zonen-FOB am Rand der Zone)
        const go = idle.filter((u) => dist(u.x, u.y, tx, ty) > PUSH_NEAR).map((u) => u.id);
        if (go.length) g.issue(t, { type: 'attackMove', ids: go, x: tx, y: ty });
      }
    }

    if (inside.length) {
      if (!ammoOk) return;
      // Gegner in der Zone, eigene Einheit ohne Feindkontakt: auf die Gegner zu, sonst stehen beide Seiten
      // außer Sichtweite und das Gefecht kommt nie zustande.
      const lone = idle
        .filter((u) => inZone(u) && !inside.some((e) => dist(e.x, e.y, u.x, u.y) < 300))
        .map((u) => u.id);
      if (lone.length) g.issue(t, { type: 'attackMove', ids: lone, x: tx, y: ty });
      return;
    }

    const clumped = idle.filter((u) => dist(u.x, u.y, z.x, z.y) < 200);
    if (clumped.length >= 2) {
      const groups = 4;
      const base = this.rng.next() * TWO_PI;
      for (let i = 0; i < groups; i++) {
        const ids = clumped.filter((_, k) => k % groups === i).map((u) => u.id);
        if (!ids.length) continue;
        const a = base + (i * TWO_PI) / groups;
        g.issue(t, { type: 'attackMove', ids, x: z.x + Math.cos(a) * 400, y: z.y + Math.sin(a) * 400 });
      }
    }
  }
}
