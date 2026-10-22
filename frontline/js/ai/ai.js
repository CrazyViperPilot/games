// KI-Gegner (PLAN.md §5, ai/ai.js). Steuert nur über game.issue und liest den Zustand. Kein DOM.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { makeRng } from '../core/rng.js';

const MAX_PLACE = 60; // canPlace-Aufrufe je Denkschritt (Budget für die Platzsuche)
const DEF_RANGE = BALANCE.fob.buildRadius; // Verteidigungsradius und Bauradius einer FOB
const THREAT_RANGE = 900; // Kampfeinheiten in dieser Nähe zur Bedrohung reagieren
const GATHER_DIST = 300; // Sammelpunkt Richtung Zone, vom Zentrum der Haupt-FOB
const FRONT_DIST = BALANCE.zone.r + 150; // FOB-Ziel knapp außerhalb des Zonenrandes (Richtung eigener Basis)
const MAX_FOB_NODE_DIST = 2600; // FOB-Ziele an Vorkommen höchstens so weit von der Haupt-FOB
const WALL_OFFSET = 4; // Mauer im Abstand (Zellen) vom Zentrum der Haupt-FOB
const WALL_HALF = 3; // Mauerlinie: 2 × WALL_HALF + 1 Zellen, Tor in der Mitte
const MIX = { rifleman: 0.5, at: 0.2, ifv: 0.2, tank: 0.1 }; // Zielanteile der Kampfeinheiten
const THREAT_PER_UNIT = 150; // mittlerer Geldwert einer Kampfeinheit (Mix) für die Schätzung einer Besatzung
const FOB_CAP = { easy: 2, normal: 4, hard: 4 };
const NODE_ORDER = { bm: 0, mun: 1, fuel: 2 };
const DEG = Math.PI / 180;
const SITE_ANGLES = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180].map((d) => d * DEG);
const TWO_PI = Math.PI * 2;

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

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
    this.rallied = new Set(); // Gebäude-IDs, deren Sammelpunkt bereits gesetzt ist
    this.fobJob = null; // { x, y } laufender FOB-Auftrag
    this.badSites = []; // { x, y, until } fehlgeschlagene FOB-Ziele

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
    this.defend(s);
    this.buildExtractors(s);
    this.buildDepot(s);
    this.produce(s);
    this.expand(s);
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
    return {
      own,
      fobs,
      builtFobs,
      home,
      ax,
      ay,
      dir,
      zone,
      enemies,
      units,
      combat: units.filter((u) => u.def.range > 0),
      trucks: units.filter((u) => u.type === 'truck'),
    };
  }

  /** Eingereihte Einheiten bzw. Gebäude eines Typs in den Warteschlangen. */
  queued(s, unitType) {
    let n = 0;
    for (const b of s.own) for (const u of b.queue) if (u === unitType) n++;
    return n;
  }

  fobCap() {
    return FOB_CAP[this.difficulty];
  }

  // ---- Platzsuche (begrenzt durch das Budget) ------------------------------------

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

  gatherPoint(s) {
    return this.freeNear(s.ax + s.dir.x * GATHER_DIST, s.ay + s.dir.y * GATHER_DIST);
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

  // ---- Wirtschaft ------------------------------------------------------------------

  /** Förderanlagen auf allen freien Vorkommen im Bauradius; Baumaterial zuerst. */
  buildExtractors(s) {
    const g = this.game;
    const t = this.team;
    if (!s.home) return;
    const cost = BUILDINGS.extractor.cost;
    const nodes = [...g.map.nodes].sort(
      (a, b) =>
        NODE_ORDER[a.type] - NODE_ORDER[b.type] ||
        dist(a.x, a.y, s.ax, s.ay) - dist(b.x, b.y, s.ax, s.ay),
    );
    for (const n of nodes) {
      if (!g.canAfford(t, cost)) break;
      if (g.extractorOn(n.id)) continue;
      if (this.budget <= 0) break;
      this.budget--;
      g.issue(t, { type: 'build', building: 'extractor', x: n.x, y: n.y });
    }
  }

  /** Fahrzeughalle, sobald 2 Förderanlagen stehen; zweite ab 3 FOBs (schwer). */
  buildDepot(s) {
    const g = this.game;
    const t = this.team;
    if (!s.home) return;
    const built = s.own.filter((b) => b.type === 'extractor' && b.built).length;
    if (built < 2) return;
    const want = 1 + (this.difficulty === 'hard' && s.fobs.length >= 3 ? 1 : 0);
    const have = s.own.filter((b) => b.type === 'depot').length;
    if (have >= want || !g.canAfford(t, BUILDINGS.depot.cost)) return;
    const p = this.findSite('depot', s.home.x, s.home.y, 130, 330, {
      angle: Math.atan2(-s.dir.y, -s.dir.x), // hinter der Haupt-FOB
      corridor: true,
    });
    if (p) g.issue(t, { type: 'build', building: 'depot', x: p.x, y: p.y });
  }

  // ---- Produktion ------------------------------------------------------------------

  /** Lkw (1, bei freien FOB-Plätzen 2) und Kampfeinheiten nach Zielmischung (Defizit-Auswahl). */
  produce(s) {
    const g = this.game;
    const t = this.team;

    const producers = () =>
      s.own.filter((b) => b.built && b.def.produces.length && b.queue.length < 2).sort((a, b) => a.id - b.id);

    // Lkw
    const truckWant = s.fobs.length < this.fobCap() ? 2 : 1;
    const trucks = s.trucks.length + this.queued(s, 'truck');
    if (trucks < truckWant && g.canAfford(t, UNITS.truck.cost)) {
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
    for (const u of avail) {
      counts[u] = s.units.filter((x) => x.type === u).length + this.queued(s, u);
    }
    let total = 0;
    for (const u of avail) total += counts[u];

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
        if (g.canAfford(t, UNITS[e.u].cost)) {
          pick = e;
          break;
        }
        if (e.deficit > 0.5) break; // sparen
      }
      if (!pick) break;
      g.issue(t, { type: 'train', buildingId: pick.b.id, unit: pick.u });
      counts[pick.u]++;
      total++;
    }
  }

  // ---- Expansion -------------------------------------------------------------------

  /** Ein FOB-Auftrag gleichzeitig: Lkw fährt los, sobald FOB-Ziel und Geld passen. */
  expand(s) {
    const g = this.game;
    const t = this.team;

    if (s.trucks.some((u) => u.order.type === 'buildFob')) return;
    if (this.fobJob) {
      const job = this.fobJob;
      this.fobJob = null;
      if (!s.fobs.some((f) => dist(f.x, f.y, job.x, job.y) < 60)) {
        this.badSites.push({ x: job.x, y: job.y, until: g.time + 240 });
      }
    }
    this.badSites = this.badSites.filter((b) => b.until > g.time);

    if (s.fobs.length >= this.fobCap()) return;
    if (s.fobs.some((f) => !f.built)) return;
    if (!g.canAfford(t, BUILDINGS.fob.cost)) return;
    const idle = s.trucks.filter((u) => u.order.type === 'idle');
    if (!idle.length) return;

    const site = this.pickFobSite(s);
    if (!site) return;
    let truck = idle[0];
    for (const u of idle) if (dist(u.x, u.y, site.x, site.y) < dist(truck.x, truck.y, site.x, site.y)) truck = u;
    const r = g.issue(t, { type: 'buildFob', truckId: truck.id, x: site.x, y: site.y });
    if (r.ok) this.fobJob = { x: site.x, y: site.y };
  }

  /** FOB-Ziel: zuerst am Zonenrand Richtung eigener Basis, dann an freien Vorkommen. */
  pickFobSite(s) {
    const g = this.game;
    const z = s.zone;
    const toHome = unitVec(s.ax - z.x, s.ay - z.y);
    const fx = z.x + toHome.x * FRONT_DIST;
    const fy = z.y + toHome.y * FRONT_DIST;
    if (!s.fobs.some((f) => dist(f.x, f.y, fx, fy) < 600)) {
      const p = this.findSite('fob', fx, fy, 0, 128, { angle: Math.atan2(toHome.y, toHome.x) });
      if (p) return p;
    }

    // Knappe Sorten zuerst (Munition, Treibstoff); Baumaterial gibt es im Überfluss
    const nodes = [...g.map.nodes].sort(
      (a, b) =>
        NODE_ORDER[b.type] - NODE_ORDER[a.type] ||
        dist(a.x, a.y, s.ax, s.ay) - dist(b.x, b.y, s.ax, s.ay),
    );
    for (const n of nodes) {
      if (dist(n.x, n.y, s.ax, s.ay) > MAX_FOB_NODE_DIST) continue;
      if (s.fobs.some((f) => dist(f.x, f.y, n.x, n.y) < DEF_RANGE)) continue;
      const p = this.findSite('fob', n.x, n.y, 150, 250);
      if (p) return p;
    }
    return null;
  }

  // ---- Verteidigungsgebäude und Mauer ---------------------------------------------

  /** Je FOB (nahe der Zone zuerst) ein Mörser und eine Flugabwehr, normal und schwer. */
  buildDefense(s) {
    const g = this.game;
    const t = this.team;
    if (this.difficulty === 'easy' || !s.builtFobs.length) return;
    const z = s.zone;
    const fobs = [...s.builtFobs].sort((a, b) => dist(a.x, a.y, z.x, z.y) - dist(b.x, b.y, z.x, z.y));
    const toZone = Math.atan2(s.dir.y, s.dir.x);

    for (const f of fobs) {
      for (const type of ['mortar', 'aa']) {
        const have = s.own.some((b) => b.type === type && dist(b.x, b.y, f.x, f.y) < DEF_RANGE);
        if (have || !g.canAfford(t, BUILDINGS[type].cost)) continue;
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
    if (this.difficulty === 'easy' || !h) return;
    if (g.teams[t].res.bm < 150) return; // Mauern nur mit Reserve

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

  /** Sammelpunkte setzen: alle Produktionsgebäude sammeln Richtung Zone (je Gebäude einmal). */
  rally(s) {
    if (!s.home) return;
    const gp = this.gatherPoint(s);
    for (const b of s.own) {
      if (!b.built || !b.def.produces.length || this.rallied.has(b.id)) continue;
      this.rallied.add(b.id);
      this.game.issue(this.team, { type: 'rally', buildingId: b.id, x: gp.x, y: gp.y });
    }
  }

  /**
   * Angriff, sobald die Summe der idle Kampfeinheiten (Geldwert) die Schwelle erreicht
   * (bei unbesetzter Zone schon ab 60 %). Nicht zu Hause stehende Einheiten folgen dem Befehl.
   * In der Zone stehende Einheiten verteilen sich auf einem Kreis (r 400) statt im Zentrum zu klumpen.
   */
  army(s) {
    const g = this.game;
    const t = this.team;
    const z = s.zone;
    const idle = s.combat.filter((u) => u.order.type === 'idle');
    if (!idle.length) return;
    const inZone = (u) => dist(u.x, u.y, z.x, z.y) <= z.r;

    // Gegner in der Zone (sichtbar): deren Schwerpunkt ist das Ziel, sonst das Zonenzentrum
    const inside = s.enemies.filter((e) => dist(e.x, e.y, z.x, z.y) <= z.r);
    let tx = z.x;
    let ty = z.y;
    if (inside.length) {
      tx = inside.reduce((a, e) => a + e.x, 0) / inside.length;
      ty = inside.reduce((a, e) => a + e.y, 0) / inside.length;
    }

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

    if (inside.length) {
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
