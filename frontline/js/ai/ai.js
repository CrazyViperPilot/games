// KI-Gegner (PLAN.md §5, §10.2, §11.5). Steuert nur über game.issue und liest den Zustand. Kein DOM.
// Reihenfolge je Denkschritt: Baustellen pflegen, Verteidigung, Rückzug, Expansion (FOB-Baustellen: Zone, Relais, Flanken),
// Produktion (nur Haupt-FOB), Verteidigungsgebäude und Mauer, Baufahrzeuge, LKW (Lieferant/Pendler/Versorger), Sammelpunkte, Armee.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { makeRng } from '../core/rng.js';

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
const SITE_TIMEOUT = 200; // s, eine FOB-Baustelle ohne Material wird danach abgerissen
const BAD_TIME = 240; // s, Sperre eines fehlgeschlagenen FOB-Ziels
const ALARM_TIME = 30; // s, Treffer an der Basis gelten als Angriff auf die Basis
const DRY = 0.2; // Einheiten mit weniger Munition/Treibstoff (Anteil) ziehen sich zurück
const WALL_OFFSET = 4; // Mauer im Abstand (Zellen) vom Zentrum der Haupt-FOB
const WALL_HALF = 3; // Mauerlinie: 2 × WALL_HALF + 1 Zellen, Tor in der Mitte
const MIX = { rifleman: 0.5, at: 0.2, ifv: 0.2, tank: 0.1 }; // Zielanteile der Kampfeinheiten
const THREAT_PER_UNIT = 150; // mittlerer Geldwert einer Kampfeinheit (Mix) für die Schätzung einer Besatzung
const FOB_CAP = { easy: 3, normal: 5, hard: 7 }; // FOB-Grenze je Schwierigkeit mit Haupt-FOB (Spielmaximum 10)
const KEYS = ['bm', 'mun', 'fuel'];
const CAP = BALANCE.logistics.truckCapacity;
const ENG_NEAR = 250; // Baufahrzeug näher an einer Baustelle: die automatische Zuweisung übernimmt
const SUPPLY_BEHIND = 150; // Versorger steht so weit hinter dem Schwerpunkt der Armee
const SUPPLY_MIN = 0.25; // Versorger lädt nach, wenn die Ladung unter diesem Anteil liegt
const SURPLUS_MIN = 120; // Pendler fährt nur, wenn die Quelle so viel Überschuss hat
const ROUTE_HOLD = 20; // s, früheste Neuplanung einer Pendler-Route
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
    this.expand(s); // FOB-Baustellen setzen (Material liefert der Lieferant)
    this.produce(s);
    this.buildDefense(s);
    this.buildWall(s);
    this.manageEngineers(s);
    this.manageTrucks(s);
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
    const units = g.units.filter((u) => u.alive && u.team === t);
    const home = builtFobs.find((b) => b.main) ?? null; // Haupt-FOB
    const ax = home ? home.x : fobs[0] ? fobs[0].x : g.map.spawns[t].x;
    const ay = home ? home.y : fobs[0] ? fobs[0].y : g.map.spawns[t].y;
    const zone = g.zone;
    const dir = unitVec(zone.x - ax, zone.y - ay);
    // Gegner nur, soweit das eigene Team sie sieht (Nebel)
    const enemies = g.units.filter((u) => u.alive && u.team !== t && g.isVisible(t, u.x, u.y));
    this.corridor = home ? { x: home.x, y: home.y, dx: dir.x, dy: dir.y } : null;

    const combat = units.filter((u) => u.def.range > 0);
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

  /** Sammelpunkt: an der Zonen-FOB (Richtung Basis), sonst Richtung Zone vor der Haupt-FOB. */
  gatherPoint(s) {
    if (s.zoneFob && s.zoneFob.built) {
      const v = unitVec(s.ax - s.zoneFob.x, s.ay - s.zoneFob.y);
      return this.freeNear(s.zoneFob.x + v.x * ZONE_GATHER_DIST, s.zoneFob.y + v.y * ZONE_GATHER_DIST);
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
        .filter((u) => dist(u.x, u.y, cx, cy) <= THREAT_RANGE)
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
      if (!b.built || !b.produces.includes(type) || b.queue.length >= qmax) continue;
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

    if (g.unitCount(t) >= BALANCE.unitCap) return;

    // Kampfeinheiten: welche Typen sind gerade ausbildbar?
    const avail = new Set();
    for (const b of s.own) {
      if (!b.built || b.queue.length >= qmax) continue;
      for (const u of b.produces) if (MIX[u]) avail.add(u);
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

    for (const f of fobs) {
      for (const type of ['aa', 'mortar']) {
        const have = s.own.some((b) => b.type === type && dist(b.x, b.y, f.x, f.y) < DEF_RANGE);
        if (have) continue;
        if (g.fobsInRadius(t, f.x, f.y).every((o) => o.store.bm < BUILDINGS[type].cost.bm || o.store.mun < BUILDINGS[type].cost.mun)) continue;
        const p = this.findSite(type, f.x, f.y, 130, 330, {
          angle: toZone,
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
   */
  army(s) {
    const g = this.game;
    const t = this.team;
    const z = s.zone;
    const idle = s.combat.filter((u) => u.order.type === 'idle' && !this.dryKind(u));
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
      const strength = idle.reduce((sum, u) => sum + (UNITS[u.type].cost.money || 0), 0);
      let need = this.cfg.attackStrength;
      if (z.owner >= 0 && z.owner !== t && z.counts[z.owner] > 0) {
        // Gegner hält die Zone: Gegenangriff schon ab 1,2× seiner Besatzung (Zonengeld ist sein Vorteil).
        // Besitz und Anzahl in der Zone sind öffentlich; die Stärke wird mit dem mittleren Einheitenwert geschätzt.
        const threat = z.counts[z.owner] * THREAT_PER_UNIT;
        need = Math.min(need, Math.max(300, 1.2 * threat));
      }
      const ready = strength >= need || (z.owner === -1 && strength >= 0.6 * need);
      if (ready) {
        const go = idle.filter((u) => !inZone(u)).map((u) => u.id);
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
