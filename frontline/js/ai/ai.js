// KI-Gegner (PLAN.md §5, §10.2). Steuert nur über game.issue und liest den Zustand. Kein DOM.
// Reihenfolge je Denkschritt: Verteidigung, Expansion (LKW), Förderanlagen, Halle, Produktion,
// Verteidigungsgebäude und Mauer (erst mit Wirtschaftsbasis), Sammelpunkte, Armee.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { makeRng } from '../core/rng.js';

const MAX_PLACE = 100; // canPlace-Aufrufe je Denkschritt (Budget für die Platzsuche)
const DEF_RANGE = BALANCE.fob.buildRadius; // Bauradius = Verteidigungsradius einer FOB
const FOB_MIN = BALANCE.fob.minDistOwn; // Mindestabstand eigener FOBs (auch zwischen Zielen)
const FOB_COST = BUILDINGS.fob.cost.bm;
const ZONE_FOB_R = BALANCE.zone.r * 0.6; // Zonen-FOB: Mittelpunkt höchstens so weit von der Zonenmitte
const THREAT_RANGE = 900; // Kampfeinheiten in dieser Nähe zur Bedrohung reagieren
const THREAT_DANGER = 600; // Gegner in dieser Nähe machen ein FOB-Ziel unattraktiver
const GATHER_DIST = 300; // Sammelpunkt Richtung Zone, vom Zentrum der Haupt-FOB
const ZONE_GATHER_DIST = 150; // Sammelpunkt an der Zonen-FOB, Richtung eigener Basis
const RALLY_MOVE = 150; // Sammelpunkt-Befehl nur neu setzen, wenn sich der Punkt so weit verschiebt
const MAX_FOB_NODE_DIST = 2600; // FOB-Ziele an Vorkommen höchstens so weit von der Haupt-FOB
const JOB_TIMEOUT = 240; // s, danach gilt ein FOB-Auftrag als gescheitert
const BAD_TIME = 240; // s, Sperre eines fehlgeschlagenen FOB-Ziels
const ALARM_TIME = 30; // s, Treffer an der Basis gelten als Angriff auf die Basis
const AMMO_ATTACK = 30; // keine Angriffe bei weniger Munition
const AMMO_PER_COMBAT = 3; // Munitionsreserve je Kampfeinheit (max. AMMO_RESERVE_MAX)
const AMMO_RESERVE_MAX = 150;
const RICH = 1500; // Geld, ab dem zusätzliche Hallen gebaut werden
const WALL_OFFSET = 4; // Mauer im Abstand (Zellen) vom Zentrum der Haupt-FOB
const WALL_HALF = 3; // Mauerlinie: 2 × WALL_HALF + 1 Zellen, Tor in der Mitte
const MIX = { rifleman: 0.5, at: 0.2, ifv: 0.2, tank: 0.1 }; // Zielanteile der Kampfeinheiten
const THREAT_PER_UNIT = 150; // mittlerer Geldwert einer Kampfeinheit (Mix) für die Schätzung einer Besatzung
const FOB_CAP = { easy: 3, normal: 6, hard: 6 }; // FOB-Grenze je Schwierigkeit (Spielmaximum 6)
const DEPOT_CAP = { easy: 1, normal: 2, hard: 3 }; // Fahrzeughallen je Schwierigkeit
const NODE_W = { bm: 1, mun: 1.5, fuel: 1.5 }; // Gewicht eines freien Vorkommens für den FOB-Wert
const NEED = { bm: 1000, mun: 300, fuel: 250 }; // Bedarf je Sorte: kleinster Vorrat/Bedarf zuerst
const DEG = Math.PI / 180;
const SITE_ANGLES = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180].map((d) => d * DEG);
const TWO_PI = Math.PI * 2;
const RES_KEYS = ['money', 'bm', 'mun', 'fuel'];

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const TILE = BALANCE.map.tile;

/** Mittelpunkt einer Förderanlage am Vorkommen (wie canPlace: 2×2 Zellen, Mitte auf Zellgrenze). */
const extractorCenter = (n) => ({ x: Math.floor(n.x / TILE) * TILE, y: Math.floor(n.y / TILE) * TILE });

function unitVec(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

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
    this.jobs = []; // { truckId, x, y, zone, t0 } laufende FOB-Aufträge (je LKW einer)
    this.badSites = []; // { x, y, until } fehlgeschlagene FOB-Ziele
    this.rallyAt = new Map(); // Gebäude-ID -> zuletzt gesetzter Sammelpunkt
    this.bmMines = 0; // Baumaterial-Förderanlagen (alive), aus snapshot

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
    this.updateJobs(s);
    this.defend(s);
    this.expand(s); // Start-LKW fährt sofort los; FOB-Geld wird vorgemerkt
    this.buildExtractors(s);
    this.buildDepot(s);
    this.produce(s);
    this.buildDefense(s);
    this.buildWall(s);
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
    const home = builtFobs[0] ?? null;
    const ax = home ? home.x : fobs[0] ? fobs[0].x : g.map.spawns[t].x;
    const ay = home ? home.y : fobs[0] ? fobs[0].y : g.map.spawns[t].y;
    const zone = g.zone;
    const dir = unitVec(zone.x - ax, zone.y - ay);
    // Gegner nur, soweit das eigene Team sie sieht (Nebel)
    const enemies = g.units.filter((u) => u.alive && u.team !== t && g.isVisible(t, u.x, u.y));
    this.corridor = home ? { x: home.x, y: home.y, dx: dir.x, dy: dir.y } : null;

    const combat = units.filter((u) => u.def.range > 0);
    const queuedCombat = own.reduce(
      (n, b) => n + b.queue.filter((e) => UNITS[e.unit ?? e].range > 0).length,
      0,
    );
    const extractors = own.filter((b) => b.type === 'extractor');
    this.bmMines = extractors.filter((b) => b.nodeId !== null && g.nodeById.get(b.nodeId)?.type === 'bm').length;
    const zoneFob = fobs.find((f) => dist(f.x, f.y, zone.x, zone.y) <= ZONE_FOB_R + 16) ?? null;
    const alarm =
      !!home &&
      (own.some((b) => dist(b.x, b.y, ax, ay) <= DEF_RANGE && b.lastHitTime > g.time - ALARM_TIME) ||
        enemies.some((e) => dist(e.x, e.y, ax, ay) <= DEF_RANGE));

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
      trucks: units.filter((u) => u.type === 'truck'),
      extractors,
      extBuilt: extractors.filter((b) => b.built).length,
      depotBuilt: own.some((b) => b.type === 'depot' && b.built),
      freeNodes: g.map.nodes.filter((n) => !g.extractorOn(n.id)),
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

  // ---- Geld und Platzsuche ----------------------------------------------------------

  /** Baumaterial, das laufende FOB-Aufträge beim Errichten noch brauchen (wird erst bei Ankunft abgebucht). */
  reserveBm() {
    return this.jobs.length * FOB_COST;
  }

  /** Kosten bezahlbar, ohne das Baumaterial für laufende FOB-Aufträge anzutasten. */
  affordable(cost, econFirst = false) {
    const res = this.game.teams[this.team].res;
    // Verteidigung und zweite Halle (econFirst = false) lassen die nächste FOB nicht verhungern
    const next = econFirst || this.fobCount() >= this.fobCap() ? 0 : FOB_COST;
    for (const k of RES_KEYS) {
      // Reserve nur, wenn der Auftrag selbst Baumaterial kostet (Einheiten nicht blockieren)
      const need = (cost[k] || 0) + (k === 'bm' && cost.bm ? this.reserveBm() + next : 0);
      if (res[k] < need) return false;
    }
    return true;
  }

  /** Eigene FOBs (auch Baustellen) plus laufende Aufträge. */
  fobCount() {
    return this.game.buildings.filter((b) => b.alive && b.team === this.team && b.type === 'fob').length + this.jobs.length;
  }

  /** Kampfeinheit ausbilden: bezahlbar und nach Abzug der Kosten noch Munitionsreserve übrig. */
  canTrain(type, combatN) {
    const cost = UNITS[type].cost;
    if (!this.affordable(cost)) return false;
    if (!cost.mun) return true;
    const reserve = Math.min(AMMO_RESERVE_MAX, AMMO_PER_COMBAT * combatN);
    return this.game.teams[this.team].res.mun - cost.mun >= reserve;
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

  /** Ziel liegt zu nah an einem laufenden FOB-Auftrag (eigene FOBs prüft canPlace selbst). */
  nearJob(x, y) {
    return this.jobs.some((j) => dist(j.x, j.y, x, y) < FOB_MIN);
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

  // ---- Verteidigung ----------------------------------------------------------------

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

  // ---- FOB-Aufträge ----------------------------------------------------------------

  /** Laufende Aufträge prüfen: gebaut, gescheitert (LKW weg oder idle) oder zu lange unterwegs. */
  updateJobs(s) {
    const g = this.game;
    const t = this.team;
    this.badSites = this.badSites.filter((b) => b.until > g.time);
    const bad = (j) => this.badSites.push({ x: j.x, y: j.y, until: g.time + BAD_TIME });
    this.jobs = this.jobs.filter((j) => {
      if (s.fobs.some((f) => dist(f.x, f.y, j.x, j.y) < 8)) return false; // Baustelle angelegt
      const truck = g.getEntity(j.truckId);
      if (!truck || truck.order.type !== 'build') {
        bad(j);
        return false;
      }
      if (g.time - j.t0 > JOB_TIMEOUT) {
        g.issue(t, { type: 'stop', ids: [truck.id] });
        bad(j);
        return false;
      }
      return true;
    });
  }

  /** LKW-Aufträge: Zonen-FOB zuerst (solange keine da ist oder unterwegs), dann Vorkommen-FOBs. */
  expand(s) {
    const g = this.game;
    const t = this.team;
    for (let k = 0; k < 2; k++) {
      // FOB-Baustellen setzt das Baufahrzeug (LKW bauen keine FOB mehr)
      const idle = g.units.filter((u) => u.alive && u.team === t && u.type === 'engineer' && u.order.type === 'idle');
      if (!idle.length) return;
      if (s.fobs.length + this.jobs.length >= this.fobCap()) return;
      if (!this.affordable(BUILDINGS.fob.cost, true)) return;

      const zoneWanted = !s.zoneFob && !this.jobs.some((j) => j.zone);
      let site = zoneWanted ? this.zoneSite(s) : null;
      if (!site) site = this.nodeSite(s);
      if (!site) return;

      let truck = idle[0];
      for (const u of idle) if (dist(u.x, u.y, site.x, site.y) < dist(truck.x, truck.y, site.x, site.y)) truck = u;
      const r = g.issue(t, { type: 'buildFob', ids: [truck.id], x: site.x, y: site.y });
      if (!r.ok) {
        this.badSites.push({ x: site.x, y: site.y, until: g.time + BAD_TIME });
        return;
      }
      this.jobs.push({ truckId: truck.id, x: site.x, y: site.y, zone: site.zone, t0: g.time });
    }
  }

  /**
   * Zonen-FOB: Mittelpunkt innerhalb 0,6 · r der Zonenmitte, möglichst viele freie Vorkommen im Bauradius,
   * bei Gleichstand näher an der eigenen Basis.
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
        cands.push({ x, y, v: this.nodeValue(x, y, s.freeNodes), d: dist(x, y, s.ax, s.ay) });
      }
    }
    cands.sort((a, b) => b.v - a.v || a.d - b.d);
    for (const c of cands) {
      if (this.budget <= 0) break;
      if (this.isBad(c.x, c.y) || this.nearJob(c.x, c.y)) continue;
      const p = this.place('fob', c.x, c.y);
      if (p && dist(p.x, p.y, z.x, z.y) <= ZONE_FOB_R) return { x: p.x, y: p.y, zone: true };
    }
    return null;
  }

  /**
   * Vorkommen-FOB: Vorkommen, die noch keine FOB im Bauradius haben, nah an der Basis und ohne Gegner.
   * Standort 150–220 px vom Vorkommen, Richtung eigener Basis zuerst.
   */
  nodeSite(s) {
    const covered = [...s.fobs, ...this.jobs].map((f) => ({ x: f.x, y: f.y }));
    const uncovered = s.freeNodes.filter((n) => !this.inBuildReach(covered, n));
    if (!uncovered.length) return null;
    const top = uncovered
      .filter((n) => dist(n.x, n.y, s.ax, s.ay) <= MAX_FOB_NODE_DIST)
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
          const v = this.nodeValue(x, y, uncovered) - dist(x, y, s.ax, s.ay) / 2000 - this.danger(s, x, y);
          cands.push({ x, y, v });
        }
      }
    }
    cands.sort((a, b) => b.v - a.v);
    for (const c of cands) {
      if (this.budget <= 0) break;
      if (this.isBad(c.x, c.y) || this.nearJob(c.x, c.y)) continue;
      const p = this.place('fob', c.x, c.y);
      if (p) return { x: p.x, y: p.y, zone: false };
    }
    return null;
  }

  // ---- Wirtschaft ------------------------------------------------------------------

  /**
   * Förderanlagen auf allen freien Vorkommen im Bauradius einer fertigen eigenen FOB.
   * Reihenfolge: Baumaterial, bis zwei Anlagen stehen; danach nach Knappheit (kleinster Vorrat/Bedarf zuerst).
   */
  buildExtractors(s) {
    const g = this.game;
    const t = this.team;
    if (!s.builtFobs.length) return;
    const res = g.teams[t].res;
    const cands = s.freeNodes.filter((n) => this.inBuildReach(s.builtFobs, n));
    const key = (n) => (n.type === 'bm' && this.bmMines < 2 ? -1 : res[n.type] / NEED[n.type]);
    cands.sort(
      (a, b) => key(a) - key(b) || dist(a.x, a.y, s.ax, s.ay) - dist(b.x, b.y, s.ax, s.ay),
    );
    for (const n of cands) {
      if (!this.affordable(BUILDINGS.extractor.cost, true)) break;
      g.issue(t, { type: 'build', building: 'extractor', x: n.x, y: n.y });
    }
  }

  /**
   * Fahrzeughalle: die erste ab 2 Förderanlagen. Weitere nur bei Geldüberschuss (> 1500) und genug
   * Munition/Treibstoff, bis zur Grenze je Schwierigkeit (normal 2, schwer 3).
   */
  buildDepot(s) {
    const g = this.game;
    const t = this.team;
    const res = g.teams[t].res;
    if (!s.home || s.extBuilt < 2) return;
    const have = s.own.filter((b) => b.type === 'depot').length;
    const rich = res.money > RICH && res.mun >= 200 && res.fuel >= 200 && s.extBuilt >= 4;
    const want = Math.min(DEPOT_CAP[this.difficulty], have < 1 ? 1 : rich ? have + 1 : have);
    if (have >= want || !this.affordable(BUILDINGS.depot.cost, have < 1)) return;
    const p = this.findSite('depot', s.home.x, s.home.y, 130, 330, {
      angle: Math.atan2(-s.dir.y, -s.dir.x), // hinter der Haupt-FOB
      corridor: true,
    });
    if (p) g.issue(t, { type: 'build', building: 'depot', x: p.x, y: p.y });
  }

  // ---- Produktion ------------------------------------------------------------------

  /** Lkw (2, solange die FOB-Grenze nicht erreicht ist, sonst 1) und Kampfeinheiten nach Zielmischung. */
  produce(s) {
    const g = this.game;
    const t = this.team;

    const producers = () =>
      s.own.filter((b) => b.built && b.def.produces.length && b.queue.length < 2).sort((a, b) => a.id - b.id);

    // Lkw
    const truckWant = s.fobs.length + this.jobs.length < this.fobCap() ? 2 : 1;
    const trucks = s.trucks.length + this.queued(s, 'truck');
    if (trucks < truckWant && this.affordable(UNITS.truck.cost, true)) {
      const fob = producers().find((b) => b.def.produces.includes('truck'));
      if (fob) g.issue(t, { type: 'train', buildingId: fob.id, unit: 'truck' });
    }

    // Kampfeinheiten: welche Typen sind gerade ausbildbar?
    const avail = new Set();
    for (const b of producers()) for (const u of b.def.produces) if (MIX[u]) avail.add(u);
    if (!avail.size) return;
    let sumW = 0;
    for (const u of avail) sumW += MIX[u];
    const counts = {};
    for (const u of avail) counts[u] = s.units.filter((x) => x.type === u).length + this.queued(s, u);
    let total = 0;
    for (const u of avail) total += counts[u];
    let combatN = s.combatN;

    // Global nach Defizit: der wichtigste Typ bekommt die knappe Munition. Fehlt er nur an Mitteln,
    // wird gespart (kein billigerer Typ davor), sonst läuft Schützen-Munition die Panzer leer.
    for (let k = 0; k < 4; k++) {
      const entries = [];
      for (const b of producers()) {
        for (const u of b.def.produces) {
          if (!avail.has(u)) continue;
          entries.push({ b, u, deficit: (MIX[u] / sumW) * (total + 1) - counts[u] });
        }
      }
      entries.sort((a, c) => c.deficit - a.deficit);
      let pick = null;
      for (const e of entries) {
        if (this.canTrain(e.u, combatN)) {
          pick = e;
          break;
        }
        if (e.deficit > 0.5) break; // sparen
      }
      if (!pick) break;
      g.issue(t, { type: 'train', buildingId: pick.b.id, unit: pick.u });
      counts[pick.u]++;
      total++;
      combatN++;
    }
  }

  // ---- Verteidigungsgebäude und Mauer ---------------------------------------------

  /**
   * Verteidigung erst mit Wirtschaftsbasis (≥ 4 fertige Förderanlagen und fertige Halle).
   * Ausnahme: Angriff auf die Basis – dann genau eine Flugabwehr oder ein Mörser.
   */
  defenseMode(s) {
    if (s.extBuilt >= 4 && s.depotBuilt) return 'full';
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
    const z = s.zone;
    const fobs = [...s.builtFobs].sort((a, b) => dist(a.x, a.y, z.x, z.y) - dist(b.x, b.y, z.x, z.y));
    const toZone = Math.atan2(s.dir.y, s.dir.x);

    for (const f of fobs) {
      for (const type of ['aa', 'mortar']) {
        const have = s.own.some((b) => b.type === type && dist(b.x, b.y, f.x, f.y) < DEF_RANGE);
        if (have || !this.affordable(BUILDINGS[type].cost)) continue;
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

  /** Mauerlinie quer zur Richtung Zone mit einem Tor in der Mitte (vor der Haupt-FOB, Achsen in Zellen). */
  buildWall(s) {
    const g = this.game;
    const t = this.team;
    const h = s.home;
    if (this.difficulty === 'easy' || !h || this.defenseMode(s) !== 'full') return;
    if (!this.affordable(BUILDINGS.wall.cost)) return; // Mauern nur mit Reserve

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
    // Tor zuerst; danach die Linie – das Torfeld ist dann belegt und wird übersprungen (idempotent)
    g.issue(t, { type: 'buildWall', building: 'gate', x1: grid.center(gc), y1: grid.center(gr), x2: grid.center(gc), y2: grid.center(gr) });
    g.issue(t, { type: 'buildWall', building: 'wall', x1, y1, x2, y2 });
  }

  // ---- Armee -----------------------------------------------------------------------

  /** Sammelpunkte setzen (Produktionsgebäude), neu nur wenn sich der Sammelpunkt deutlich verschoben hat. */
  rally(s) {
    if (!s.home) return;
    const gp = this.gatherPoint(s);
    for (const b of s.own) {
      if (!b.built || !b.def.produces.length) continue;
      const prev = this.rallyAt.get(b.id);
      if (prev && dist(prev.x, prev.y, gp.x, gp.y) < RALLY_MOVE) continue;
      this.rallyAt.set(b.id, gp);
      this.game.issue(this.team, { type: 'rally', buildingId: b.id, x: gp.x, y: gp.y });
    }
  }

  /**
   * Angriff, sobald die Summe der idle Kampfeinheiten (Geldwert) die Schwelle erreicht
   * (bei unbesetzter Zone schon ab 60 %). Nicht zu Hause stehende Einheiten folgen dem Befehl.
   * Keine Angriffe bei Munition unter AMMO_ATTACK. In der Zone stehende Einheiten verteilen sich auf
   * einem Kreis (r 400) statt im Zentrum zu klumpen.
   */
  army(s) {
    const g = this.game;
    const t = this.team;
    const z = s.zone;
    const idle = s.combat.filter((u) => u.order.type === 'idle');
    if (!idle.length) return;
    const inZone = (u) => dist(u.x, u.y, z.x, z.y) <= z.r;
    const ammoOk = g.teams[t].res.mun >= AMMO_ATTACK;

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
