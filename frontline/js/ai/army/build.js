// KI-Gegner, Bauen: Stellungen, Befehle für Gebäude, Verteidigung, Brücken, Baufahrzeuge, Hubschrauber, Funkmast.
// Methoden der Klasse AI (js/ai/ai.js), eingehängt über Object.assign. Befehle nur über game.issue. Kein DOM.

import { BALANCE } from '../../data/balance.js';
import { UNITS } from '../../data/units.js';
import { BUILDINGS } from '../../data/buildings.js';
import { CITY } from '../../data/city.js';
import { ZONE_REACH, WALL_RETRY, RELAY_STEP, FLANK_R, FOBV_MAX, DEPLOY_REACH, FOBV_RETRY, BAD_TIME, WALL_OFFSET, WALL_HALF, ENG_NEAR, RADIO_SITE, BRIDGE_EVERY, ROAD_REPAIR_EVERY, ROAD_REPAIR_SAFE, BRIDGE_RESERVE, FORT_EVERY, FORT_BM_MIN, FORT_CREW_RANGE, FORT_ROOFS } from '../../data/ai.js';
import { DEF_RANGE, ZONE_FOB_R, TWO_PI, dist, unitVec } from './util.js';

const DEG = Math.PI / 180;
const SITE_ANGLES = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180].map((d) => d * DEG);

const TILE = BALANCE.map.tile;

export const buildMethods = {
  /** canPlace mit Budget; liefert das Ergebnis, wenn zulässig, sonst null. */
  place(type, x, y) {
    if (this.budget <= 0) return null;
    this.budget--;
    const p = this.game.canPlace(this.team, type, x, y);
    return p.ok ? p : null;
  },

  inCorridor(x, y) {
    const c = this.corridor;
    if (!c) return false;
    const rx = x - c.x;
    const ry = y - c.y;
    const along = rx * c.dx + ry * c.dy;
    const lat = Math.abs(-rx * c.dy + ry * c.dx);
    return along > 60 && along < 300 && lat < 130;
  },

  isBad(x, y) {
    const now = this.game.time;
    return this.badSites.some((b) => b.until > now && dist(b.x, b.y, x, y) < 120);
  },

  /**
   * Freie Stelle für `type` in Ringen um (cx, cy), Winkel bevorzugt um `angle` (Standard 0).
   * corridor: Gasse vor der Hauptstadt meiden. Liefert {x, y} (Mitte des Fußabdrucks) oder null.
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
  },

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
  },

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
  },

  // ---- Neue FOBs (FOB-Fahrzeuge, seit v5.09) ------------------------------------------

  /**
   * Ist Platz für eine weitere FOB, bildet die KI ein FOB-Fahrzeug aus (höchstens FOBV_MAX gleichzeitig) und spart darauf
   * (außer bei Alarm an der Hauptstadt). Danach fährt es zum Ziel und baut dort auf.
   */
  expand(s) {
    const g = this.game;
    this.saveForFob = false;
    if (!s.builtFobs.length) return;
    const queued = this.queued(s, 'fobTruck');
    const open = s.fobTrucks.length + queued;
    if (s.fobs.length + open < this.fobCap() && open < FOBV_MAX) {
      if (g.teams[this.team].res.money >= UNITS.fobTruck.cost.money) {
        const b = this.pickProducer(s, 'fobTruck', BALANCE.queueMax - 1, false);
        if (b) g.issue(this.team, { type: 'train', buildingId: b.id, unit: 'fobTruck' });
      } else if (!s.alarm) this.saveForFob = true;
    }
    for (const id of [...this.fobGoal.keys()]) if (!s.fobTrucks.some((u) => u.id === id)) this.fobGoal.delete(id);
    for (const u of s.fobTrucks) this.driveFobTruck(s, u);
  },

  /** Ein FOB-Fahrzeug: Ziel wählen (Zonen-FOB zuerst, dann Relais und Flanken), hinfahren, dort aufbauen. */
  driveFobTruck(s, u) {
    const g = this.game;
    let goal = this.fobGoal.get(u.id);
    const block = () => {
      this.badSites.push({ x: goal.x, y: goal.y, until: g.time + BAD_TIME });
      this.fobGoal.delete(u.id);
      goal = null;
    };
    if (goal && dist(u.x, u.y, goal.x, goal.y) <= DEPLOY_REACH) {
      if (g.issue(this.team, { type: 'deploy', ids: [u.id], x: goal.x, y: goal.y }).ok) {
        this.fobGoal.delete(u.id);
        return;
      }
      block();
    } else if (goal && u.order.type === 'idle') {
      // angehalten (kein Weg, abgedrängt): neu losschicken, nach FOBV_RETRY Versuchen ist das Ziel gesperrt
      if (++goal.tries > FOBV_RETRY) block();
      else g.issue(this.team, { type: 'move', ids: [u.id], x: goal.x, y: goal.y });
    }
    if (goal) return;
    // Zonen-FOB zuerst – nicht kurz nach einem Verlust und nicht mitten in einer gegnerischen Übermacht
    const zoneHeld = s.zone.counts[1 - this.team] >= 4; // Besatzung der Zone ist öffentlich (wie bei der Zonenwertung)
    const zoneWanted = !s.zoneFob && g.time >= this.zoneBan && !zoneHeld;
    let site = zoneWanted ? this.zoneSite(s) : null;
    if (!site && s.zoneFob) site = this.frontSite(s);
    if (!site) return; // wartet, bis ein Ziel frei wird
    this.fobGoal.set(u.id, { x: site.x, y: site.y, tries: 0 });
    g.issue(this.team, { type: 'move', ids: [u.id], x: site.x, y: site.y });
  },

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
  },

  /**
   * Weitere FOBs: Relais auf dem Weg von der Hauptstadt zur Zonen-FOB (Abstand RELAY_STEP), danach Flanken-FOBs im Kreis um
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
      if (dist(an.x, an.y, s.zone.x, s.zone.y) > s.zone.r + ZONE_REACH) continue;
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
  },

  // ---- Verteidigungsgebäude und Mauer ---------------------------------------------

  /**
   * Verteidigung, sobald eine vordere FOB steht (dort sind Mauern, Mörser und Flak sinnvoll).
   * Ausnahme: Angriff auf die Basis – dann genau eine Flugabwehr oder ein Mörser.
   */
  defenseMode(s) {
    if (s.builtFobs.length >= 2) return 'full';
    if (s.alarm) return 'alarm';
    return null;
  },

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
  },

  /**
   * Mauerlinie quer zur Richtung Zone mit einem Tor in der Mitte (vor der Hauptstadt, Achsen in Zellen).
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
    // Tor = 2 Felder entlang der Mauer (senkrechte Mauer: untereinander, sonst nebeneinander)
    g.issue(t, { type: 'buildWall', building: 'gate', ids, x1: grid.center(gc), y1: grid.center(gr), x2: grid.center(gc + (vertical ? 0 : 1)), y2: grid.center(gr + (vertical ? 1 : 0)) });
    const r = g.issue(t, { type: 'buildWall', building: 'wall', ids, x1, y1, x2, y2 });
    if (!r.ok) this.memo.set('wall', g.time + WALL_RETRY); // Linie steht bereits (oder nichts baubar): lange nicht erneut versuchen
  },

  // ---- Festung ---------------------------------------------------------------------

  /**
   * Festung (BALANCE.difficulty.<stufe>.fort): ab `from` baut die KI die Hauptstadt, danach die vorderste FOB zur Festung aus
   * (Befehl `fortify`: Mauerring, Tore, Türme), besetzt die Türme mit freien Schützen, setzt Dachaufbauten (Mörser, SAM, Flak)
   * und kauft einen Transporthubschrauber, der die ausgebauten FOBs mit versorgt (manageTrucks).
   */
  fortify(s) {
    const g = this.game;
    const t = this.team;
    const cfg = this.cfg.fort;
    if (!cfg.fobs || g.time < cfg.from || !s.home || !this.once('fort', FORT_EVERY)) return;
    const front = s.builtFobs.filter((f) => f !== s.home).sort((a, b) => dist(a.x, a.y, s.zone.x, s.zone.y) - dist(b.x, b.y, s.zone.x, s.zone.y))[0];
    const targets = [s.home, s.zoneFob?.built ? s.zoneFob : front].filter(Boolean).slice(0, cfg.fobs);
    const foe = g.map.spawns[1 - t];
    const airSeen = s.enemies.some((e) => e.def.air);
    for (const f of targets) {
      const towers = s.own.filter((b) => b.type === 'tower' && dist(b.x, b.y, f.x, f.y) <= DEF_RANGE);
      if (!s.alarm && f.store.bm >= FORT_BM_MIN) {
        g.issue(t, { type: 'fortify', buildingId: f.id, towers: cfg.towers, tx: foe.x, ty: foe.y });
      }
      for (const tw of towers) {
        if (!tw.built) continue;
        if (tw.occupants.length < tw.def.cap) this.crewTower(s, tw);
        if (!tw.roof && !tw.roofJob && tw.occupants.length) {
          const have = towers.map((o) => o.roof ?? o.roofJob?.kind);
          const order = airSeen ? ['sam', ...FORT_ROOFS] : FORT_ROOFS;
          const kind = order.find((k) => !have.includes(k)) ?? FORT_ROOFS[0];
          g.issue(t, { type: 'roof', buildingId: tw.id, kind });
        }
      }
    }
    this.buyHeli(s);
  },

  /** Freie Schützen aus der Nähe gehen in den Turm (höchstens bis alle Plätze belegt sind). */
  crewTower(s, tw) {
    const free = tw.def.cap - tw.occupants.length - s.units.filter((u) => u.order.type === 'garrison' && u.order.targetId === tw.id).length;
    if (free <= 0) return;
    const ids = s.units
      .filter((u) => u.type === 'rifleman' && !u.house && !u.crate && u.order.type === 'idle' && !this.dryKind(u) && dist(u.x, u.y, tw.x, tw.y) <= FORT_CREW_RANGE)
      .sort((a, b) => dist(a.x, a.y, tw.x, tw.y) - dist(b.x, b.y, tw.x, tw.y) || a.id - b.id)
      .slice(0, free)
      .map((u) => u.id);
    if (ids.length) this.game.issue(this.team, { type: 'garrison', ids, houseId: tw.id });
  },

  /** Ein Transporthubschrauber, sobald ein Turm steht: er fliegt Vorräte zwischen den FOBs, wenn der Landweg weit oder gesperrt ist. */
  buyHeli(s) {
    const g = this.game;
    if (s.helis.length || this.queued(s, 'transporter') || !s.own.some((b) => b.type === 'tower' && b.built)) return;
    const cost = UNITS.transporter.cost.money;
    if (g.teams[this.team].res.money < cost) return; // gespart wird in produce (bis Preis + HELI_MIN_MONEY), seit v5.26
    const b = this.pickProducer(s, 'transporter', BALANCE.queueMax, false);
    if (b) g.issue(this.team, { type: 'train', buildingId: b.id, unit: 'transporter' });
  },

  // ---- Baufahrzeuge ----------------------------------------------------------------

  /**
   * Untätige Baufahrzeuge fahren zu Baustellen, die sie bauen können und die weiter als ENG_NEAR entfernt sind
   * (näher übernimmt die automatische Zuweisung der Engine).
   */
  manageEngineers(s) {
    const g = this.game;
    if (!s.engineers.length) return;
    const sites = s.own.filter((b) => !b.built);
    if (!sites.length) return;
    for (const u of s.engineers) {
      if (u.order.type !== 'idle') continue;
      let best = null;
      let bestKey = Infinity;
      for (const b of sites) {
        const taken = s.engineers.some(
          (e) => e !== u && ((e.order.type === 'build' && e.order.targetId === b.id) || (e.order.type === 'move' && this.engTarget.get(e.id) === b.id)),
        );
        const key = dist(u.x, u.y, b.x, b.y) + (taken ? 1000 : 0);
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
  },

  /**
   * Zerstörte Brücken auf der eigenen Seite (näher an der eigenen Hauptstadt als am gegnerischen Start): ein untätiges
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
  },

  /**
   * Schutt eigener Straßen räumen (Paket „Straßen“, Teil 3): alle ROAD_REPAIR_EVERY s schickt die KI das nächste freie Baufahrzeug zum
   * Schutt einer eigenen Straße, der am nächsten an der Hauptstadt liegt (kostenlos), wenn dort keine sichtbaren gegnerischen
   * Kampfeinheiten näher als ROAD_REPAIR_SAFE stehen. Gegnerische Straßen greift sie nicht an.
   */
  repairRoads(s) {
    const g = this.game;
    if (!g.rubble || !s.engineers.length || !this.once('roads', ROAD_REPAIR_EVERY)) return;
    if (s.engineers.some((u) => u.order.type === 'clearRubble')) return; // einer räumt schon
    const cols = g.city?.[0]?.cols ?? g.roads?.cols ?? 0;
    const S = CITY.cell;
    let best = null;
    for (const k in g.rubble) {
      if (g.rubble[k].owner !== this.team) continue;
      const i = +k;
      const x = ((i % cols) + 0.5) * S;
      const y = (Math.floor(i / cols) + 0.5) * S;
      if (s.enemies.some((e) => e.def.range > 0 && dist(e.x, e.y, x, y) < ROAD_REPAIR_SAFE)) continue;
      const d = dist(x, y, s.ax, s.ay);
      if (!best || d < best.d || (d === best.d && i < best.i)) best = { i, x, y, d };
    }
    if (!best) return;
    let eng = null;
    for (const u of s.engineers) {
      if (u.order.type !== 'idle') continue;
      if (!eng || dist(u.x, u.y, best.x, best.y) < dist(eng.x, eng.y, best.x, best.y)) eng = u;
    }
    if (!eng) return;
    const q = best.i % cols;
    const r = Math.floor(best.i / cols);
    g.issue(this.team, { type: 'clearRubble', ids: [eng.id], c0: q, r0: r, c1: q, r1: r });
  },

  /**
   * Sendemast (zweite Siegbedingung): ab difficulty.radioFrom spart die KI darauf (nicht bei Alarm an der Hauptstadt) und setzt ihn hinter die
   * Hauptstadt, weg von der Zone. Das Baufahrzeug baut ihn wie jede Baustelle.
   */
  buildRadio(s) {
    const g = this.game;
    const t = this.team;
    this.saveForRadio = false;
    if (!g.radioWin || !s.home || g.time < this.cfg.radioFrom || s.alarm || !s.engineers.length) return;
    if (s.own.some((b) => b.def.radio)) return;
    const cost = BUILDINGS.radio.cost;
    if (g.teams[t].res.money < cost.money) {
      this.saveForRadio = true;
      return;
    }
    const away = Math.atan2(-s.dir.y, -s.dir.x);
    const p = this.findSite('radio', s.ax, s.ay, RADIO_SITE[0], RADIO_SITE[1], { angle: away, corridor: true });
    if (p) g.issue(t, { type: 'build', building: 'radio', x: p.x, y: p.y });
  },
};
