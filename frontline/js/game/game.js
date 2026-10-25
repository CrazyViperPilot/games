// Spielzustand, Befehle (issue), Platzierung, Lager, Spawn, Aufräumen und Sieg (PLAN.md §4, §5, §11). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { makeRng } from '../core/rng.js';
import { generateMap } from './map.js';
import { blockers } from './mapdata.js';
import { Grid } from './grid.js';
import { createUnit, createBuilding } from './entities.js';
import { Fog } from './fog.js';
import { updateEconomy, smoothIncome } from './economy.js';
import { updateMovement, nearestPassable, planPath, setIdle, separate } from './movement.js';
import { updateCombat } from './combat.js';
import { updateZone } from './zone.js';
import { createHot, updateHot, cmdDrill } from './hotzone.js';
import { updateLogistics, cmdLoad, cmdUnload, cmdRoute, cmdSetPreset, cmdBoard, cmdDropoff, cargoSum } from './logistics.js';
import { updateConstruction, canBuild, cmdRepair, orderBuild, orderBuildSeq } from './construction.js';

const TILE = BALANCE.map.tile;
const W = BALANCE.map.width;
const H = BALANCE.map.height;
const STOCK_KEYS = ['bm', 'mun', 'fuel']; // Lagersorten (team.res.* sind Summen über FOB-Lager)
const EFFECT_LIFE = { tracer: 0.12, shell: 0.3, explosion: 0.5, intercept: 0.4, muzzle: 0.1 };
const SHORTAGE_TEXT = {
  mun: 'Einheiten ohne Munition',
  fuel: 'Fahrzeuge ohne Treibstoff',
};
const WALL_TYPES = new Set(['wall', 'gate']);

const zeroRes = () => ({ money: 0, bm: 0, mun: 0, fuel: 0 });

const START_GAP = 4; // Abstand zwischen Einheiten beim Start (px, über die Radien hinaus)
const START_STEP = 12; // Rastergröße der Startplätze (px)

/**
 * Startaufstellung um die Haupt-FOB: je Einheit der erste freie passierbare Platz im Raster, vorn (zur Kartenmitte)
 * zuerst, nie überlappend. Liefert die Mittelpunkte in der Reihenfolge von `types`.
 */
function startFormation(grid, team, cx, cy, types) {
  let fx = W / 2 - cx;
  let fy = H / 2 - cy;
  const fl = Math.hypot(fx, fy) || 1;
  fx /= fl;
  fy /= fl;
  // Kandidaten in Ringen 60–600 px um die FOB (FOB-Mitte liegt im Gebäude und ist nicht passierbar)
  const cands = [];
  for (let dy = -600; dy <= 600; dy += START_STEP) {
    for (let dx = -600; dx <= 600; dx += START_STEP) {
      const r = Math.hypot(dx, dy);
      if (r < 60 || r > 600) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (!grid.passable(grid.toCell(x), grid.toCell(y), team)) continue;
      // vorn näher, seitlich und hinten weiter weg
      cands.push({ x, y, score: r + 150 * (1 - (dx * fx + dy * fy) / r) });
    }
  }
  cands.sort((a, b) => a.score - b.score || a.x - b.x || a.y - b.y);
  const placed = [];
  for (const type of types) {
    const rad = UNITS[type].radius;
    const spot = cands.find((c) =>
      placed.every((p) => Math.hypot(c.x - p.x, c.y - p.y) >= rad + p.rad + START_GAP),
    );
    if (spot) placed.push({ x: spot.x, y: spot.y, rad });
    else placed.push(null);
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
const NO_CARRIED = 'Zu wenig getragenes Baumaterial (Soldaten laden es in einer FOB)';

/** Zellen einer Geraden zwischen zwei Zellen (Bresenham, inklusive Endpunkte). */
function lineCells(c0, r0, c1, r1) {
  const out = [];
  const dc = Math.abs(c1 - c0);
  const sc = c0 < c1 ? 1 : -1;
  const dr = -Math.abs(r1 - r0);
  const sr = r0 < r1 ? 1 : -1;
  let err = dc + dr;
  let c = c0;
  let r = r0;
  for (;;) {
    out.push([c, r]);
    if (c === c1 && r === r1) break;
    const e2 = 2 * err;
    if (e2 >= dr) {
      err += dr;
      c += sc;
    }
    if (e2 <= dc) {
      err += dc;
      r += sr;
    }
  }
  return out;
}

export class Game {
  /** `map`: fertige Karte (Editor/gespeichert, siehe mapdata.js); ohne sie wird sie aus dem Seed erzeugt. */
  constructor({ seed = 1, winPoints = BALANCE.winPoints, startMoney = BALANCE.startRes.money, map = null } = {}) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.map = map ?? generateMap(seed);
    this.grid = new Grid(W / TILE, H / TILE, TILE);
    this.grid.rasterizeObstacles(this.map.obstacles);
    this.grid.rasterizeRects(blockers(this.map.town?.buildings ?? []));
    this.grid.rasterizeTrees([...(this.map.town?.trees ?? []), ...(this.map.trees ?? [])]);

    this.time = 0;
    this.nextId = 1;
    this.entities = new Map();
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.effects = [];
    this.events = [];
    this.winner = null;
    this.winReason = null;
    this.winPoints = winPoints;
    this.fogTimer = 0;
    this.logiTimer = 0; // Takt des Nachfüllens (logistics.js)
    this.consTimer = 0; // Takt der automatischen Bauzuweisung (construction.js)
    this.teams = [0, 1].map((id) => {
      const team = {
        id,
        name: BALANCE.teamNames[id],
        color: BALANCE.teamColors[id],
        res: { money: startMoney }, // bm/mun/fuel: unten als Getter (Summe der Front-Lager ohne Haupt-FOB)
        income: zeroRes(),
        rate: zeroRes(),
        flow: { bm: 0, mun: 0, fuel: 0 }, // Verbrauch aus Lagern je s (Nachfüllen)
        points: 0,
        pointProgress: 0,
        used: { mun: 0, fuel: 0 }, // Summe des Verbrauchs (Statistik)
        warnAt: {}, // Zeitpunkt der letzten Meldung je Schlüssel (notify)
        incomeMult: 1,
        isAI: false,
        lastWarn: -1e9,
        reinforceTimer: 0, // Zeit seit dem letzten Soldaten-Nachschub (economy.js)
      };
      // Lesbare Summe über alle fertigen eigenen FOB-Lager; nie direkt schreiben
      for (const k of STOCK_KEYS) {
        Object.defineProperty(team.res, k, { enumerable: true, get: () => this.stockOf(id, k) });
      }
      return team;
    });
    this.zone = { ...this.map.zone, owner: -1, contested: false, counts: [0, 0], weight: [0, 0], bar: { team: -1, p: 0 } };
    this.hot = createHot(this);
    this.fog = [new Fog(W, H), new Fog(W, H)];

    // Startzustand: je Team die Haupt-FOB auf dem Spawn (unendlicher Vorrat), Startunits als Formation davor
    for (let t = 0; t < 2; t++) {
      const sp = this.map.spawns[t];
      this.spawnBuilding('fob', t, this.grid.toCell(sp.x) - 1, this.grid.toCell(sp.y) - 1, { built: true, main: true });
      const spots = startFormation(this.grid, t, sp.x, sp.y, BALANCE.startUnits);
      BALANCE.startUnits.forEach((type, i) => {
        const p = spots[i] || nearestPassable(this.grid, sp.x, sp.y, t) || sp;
        this.spawnUnit(type, t, p.x, p.y);
      });
    }
    this.updateFog();
  }

  // ---- Zustand und Hilfen -------------------------------------------------------

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

  addEffect(type, x, y, team = -1, x2 = x, y2 = y) {
    this.effects.push({ type, x, y, x2, y2, team, t: 0, life: EFFECT_LIFE[type] ?? 0.3 });
  }

  isVisible(team, x, y) {
    return this.fog[team].isVisible(x, y);
  }

  /**
   * Sieht `team` die Entity e? Eigene immer; fremde, wenn die Zelle im Sichtfeld liegt. Getarnte Einheiten (def.stealth) zusätzlich nur,
   * wenn eine eigene Einheit oder ein fertiges Gebäude des Teams näher als stealth.detectRange steht oder sie gerade geschossen haben.
   */
  sees(team, e) {
    if (e.team === team) return true;
    if (!this.fog[team].isVisible(e.x, e.y)) return false;
    if (!e.def.stealth || e.kind !== 'unit') return true;
    if (this.time < (e.revealedUntil || 0)) return true;
    const r2 = BALANCE.stealth.detectRange ** 2;
    for (const u of this.units) if (u.alive && u.team === team && (u.x - e.x) ** 2 + (u.y - e.y) ** 2 <= r2) return true;
    for (const b of this.buildings) if (b.alive && b.built && b.team === team && (b.x - e.x) ** 2 + (b.y - e.y) ** 2 <= r2) return true;
    return false;
  }

  isExplored(team, x, y) {
    return this.fog[team].isExplored(x, y);
  }

  updateFog() {
    for (let t = 0; t < this.teams.length; t++) this.fog[t].update(this, t);
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

  /** Summe einer Sorte über die Lager aller fertigen eigenen FOBs außer der Haupt-FOB (Getter von team.res: das Front-Lager). */
  stockOf(team, k) {
    let sum = 0;
    for (const b of this.buildings) {
      if (b.alive && b.built && b.team === team && b.type === 'fob' && !b.infinite) sum += b.store[k];
    }
    return sum;
  }

  /** Haupt-FOB des Teams (lebend) oder null. */
  mainFob(team) {
    return this.buildings.find((b) => b.alive && b.team === team && b.main) ?? null;
  }

  /**
   * Testhilfe: setzt das Lager der ersten fertigen FOB ohne Haupt-FOB auf {bm, mun, fuel} (fehlende Sorten = 0)
   * und leert die übrigen Front-Lager. Die Haupt-FOB bleibt unverändert (unendlich).
   */
  setStock(team, vals) {
    const fobs = this.buildings.filter((b) => b.alive && b.built && b.team === team && b.type === 'fob' && !b.infinite);
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
      const room = target.kind === 'building' ? BALANCE.logistics.storeCap - stock[k] : BALANCE.logistics.truckCapacity - cargoSum(stock);
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
      for (const k of STOCK_KEYS) b.store[k] = BALANCE.logistics.storeCap;
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
    return b;
  }

  // ---- Platzierung --------------------------------------------------------------

  /**
   * Prüft, ob Gebäude `type` mit Mitte (x, y) gebaut werden darf.
   * Liefert { ok, reason, cx, cy, x, y, payer } (x, y = Mitte des Fußabdrucks).
   * payer = { kind: 'fob'|'truck', id } – wer die Sorten zahlt (null bei FOB-Baustellen).
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

    for (let r = cy; r < cy + def.h; r++) {
      for (let c = cx; c < cx + def.w; c++) {
        if (!g.inBounds(c, r)) return bad('Außerhalb der Karte');
        const i = g.idx(c, r);
        if (g.terrain[i]) return bad('Gelände blockiert');
        if (g.struct[i]) return bad('Fläche bereits belegt');
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

    let payer = null;
    if (type === 'fob') {
      let count = 0;
      for (const b of this.buildings) {
        if (!b.alive || b.team !== team || b.type !== 'fob') continue;
        count++;
        if (dist(b.x, b.y, mx, my) < BALANCE.fob.minDistOwn) return bad('Zu nah an einer eigenen FOB');
      }
      if (count >= BALANCE.fob.max) return bad(`Höchstens ${BALANCE.fob.max} FOBs möglich`);
      for (const b of this.buildings) {
        if (b.alive && b.team !== team && dist(b.x, b.y, mx, my) < BALANCE.fob.minDistEnemy) {
          return bad('Zu nah an einem gegnerischen Gebäude');
        }
      }
    } else if (this.fobsInRadius(team, mx, my).length) {
      if (carried) return { ok: true, reason: null, cx, cy, x: mx, y: my, payer: null };
      const f = this.payerFor(team, mx, my, def.cost);
      if (!f) return bad(this.stockReason(team, mx, my, def.cost));
      payer = { kind: 'fob', id: f.id };
    } else if (WALL_TYPES.has(type) && !carried) {
      const tr = this.truckPayer(team, mx, my, def.cost);
      if (!tr) return bad('Außerhalb des Bauradius einer eigenen FOB');
      payer = { kind: 'truck', id: tr.id };
    } else {
      return bad('Außerhalb des Bauradius einer eigenen FOB');
    }

    return { ok: true, reason: null, cx, cy, x: mx, y: my, payer };
  }

  // ---- Befehle ------------------------------------------------------------------

  /** Befehl ausführen. Liefert { ok: true, … } oder { ok: false, reason }. */
  issue(team, cmd) {
    if (!cmd || !this.teams[team]) return fail('Unbekannter Befehl');
    if (this.winner !== null) return fail('Partie ist beendet');
    switch (cmd.type) {
      case 'move':
      case 'attackMove':
        return this.cmdMove(team, cmd);
      case 'attack':
        return this.cmdAttack(team, cmd);
      case 'stop':
        for (const u of this.ownUnits(team, cmd.ids)) setIdle(u);
        return { ok: true };
      case 'build':
        return this.cmdBuild(team, cmd);
      case 'buildWall':
        return this.cmdBuildWall(team, cmd);
      case 'buildFob':
        return this.cmdBuildFob(team, cmd);
      case 'repair':
        return cmdRepair(this, team, cmd);
      case 'load':
        return cmdLoad(this, team, cmd);
      case 'unload':
        return cmdUnload(this, team, cmd);
      case 'route':
        return cmdRoute(this, team, cmd);
      case 'setPreset':
        return cmdSetPreset(this, team, cmd);
      case 'mortarTarget':
        return this.cmdMortarTarget(team, cmd);
      case 'board':
        return cmdBoard(this, team, cmd);
      case 'dropoff':
        return cmdDropoff(this, team, cmd);
      case 'drill':
        return cmdDrill(this, team, cmd);
      case 'train':
        return this.cmdTrain(team, cmd);
      case 'cancelTrain':
        return this.cmdCancelTrain(team, cmd);
      case 'rally':
        return this.cmdRally(team, cmd);
      case 'demolish':
        return this.cmdDemolish(team, cmd);
      default:
        return fail('Unbekannter Befehl');
    }
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

  cmdMove(team, cmd) {
    const units = this.ownUnits(team, cmd.ids);
    if (!units.length) return fail('Keine eigenen Einheiten gewählt');
    const tx = Math.min(Math.max(cmd.x, 0), W);
    const ty = Math.min(Math.max(cmd.y, 0), H);
    units.sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty) || a.id - b.id);
    const spots = this.formationSpots(team, tx, ty, units.length);
    units.forEach((u, i) => {
      const s = spots[i];
      u.targetId = null;
      u.order = { type: cmd.type, x: s.x, y: s.y, targetId: null };
      planPath(this, u, s.x, s.y);
      if (u.path.length === 0) setIdle(u);
    });
    return { ok: true, count: units.length };
  }

  cmdAttack(team, cmd) {
    const t = this.getEntity(cmd.targetId);
    if (!t || t.team === team) return fail('Ziel ungültig');
    const units = this.ownUnits(team, cmd.ids).filter((u) => u.def.range > 0);
    if (!units.length) return fail('Keine bewaffnete Einheit gewählt');
    for (const u of units) {
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
   * { type: 'buildFob', ids? (Baufahrzeuge), x, y }: legt sofort eine FOB-Baustelle an (nichts wird bezahlt).
   * Sie braucht 400 Baumaterial im eigenen Lager (per LKW) und ein Baufahrzeug in der Nähe.
   */
  cmdBuildFob(team, cmd) {
    let list = [];
    if (cmd.ids && cmd.ids.length) {
      list = this.ownUnits(team, cmd.ids).filter((u) => u.def.builder === 'all');
      if (!list.length) return fail('Nur Baufahrzeuge gründen FOB-Baustellen');
    }
    const p = this.canPlace(team, 'fob', cmd.x, cmd.y);
    if (!p.ok) return fail(p.reason);
    const site = this.spawnBuilding('fob', team, p.cx, p.cy, { built: false });
    this.message(team, 'FOB-Baustelle errichtet', p.x, p.y);
    for (const u of list) orderBuild(u, site);
    return { ok: true, id: site.id };
  }

  /**
   * { type: 'mortarTarget', ids, x, y }: gewählte eigene Mörser feuern auf den Punkt (ohne x/y: Ziel löschen).
   * Nur Mörser in Reichweite (zwischen minRange und range) nehmen das Ziel an.
   */
  cmdMortarTarget(team, cmd) {
    const mortars = [];
    for (const id of new Set(cmd.ids || [])) {
      const b = this.getEntity(id);
      if (b && b.kind === 'building' && b.team === team && b.def.weapon && b.def.weapon.shell) mortars.push(b);
    }
    if (!mortars.length) return fail('Kein Mörser gewählt');
    if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) {
      for (const b of mortars) b.fireTarget = null;
      return { ok: true, count: mortars.length };
    }
    let n = 0;
    let reason = 'Ziel außer Reichweite';
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

  /** { type: 'train', buildingId, unit }: nur die Haupt-FOB; Einheiten kosten nur Geld. */
  cmdTrain(team, cmd) {
    const b = this.getEntity(cmd.buildingId);
    if (!b || b.kind !== 'building' || b.team !== team) return fail('Kein eigenes Gebäude gewählt');
    if (!b.built) return fail('Gebäude ist noch im Bau');
    if (!UNITS[cmd.unit] || !b.produces.includes(cmd.unit)) return fail('Nur die Haupt-FOB bildet Einheiten aus');
    if (b.queue.length >= BALANCE.queueMax) return fail('Warteschlange ist voll');
    if (this.slotsUsed(team) + (UNITS[cmd.unit].slots || 1) > BALANCE.slotCap) return fail('Einheitenlimit erreicht');
    const cost = UNITS[cmd.unit].cost;
    if (!this.canAfford(team, cost)) return fail(this.missingMoney());
    this.pay(team, cost);
    b.queue.push({ unit: cmd.unit, payerId: b.id });
    b.queueTimes.push(0);
    return { ok: true };
  }

  /** Belegte Plätze eines Teams: lebende Einheiten, Passagiere und Warteschlangen, je nach `slots` der Sorte. */
  slotsUsed(team) {
    const s = (def) => def.slots || 1;
    let n = 0;
    for (const u of this.units) {
      if (!u.alive || u.team !== team) continue;
      n += s(u.def);
      for (const p of u.passengers) n += s(p.def);
    }
    for (const b of this.buildings) {
      if (!b.alive || b.team !== team) continue;
      for (const e of b.queue) n += s(UNITS[e.unit]);
    }
    return n;
  }

  /** Lebende plus in Ausbildung befindliche Einheiten eines Teams. */
  unitCount(team) {
    let n = 0;
    for (const u of this.units) {
      if (u.alive && u.team === team) n += 1 + u.passengers.length;
    }
    for (const b of this.buildings) if (b.alive && b.team === team) n += b.queue.length;
    return n;
  }

  /** Lebende Infanterie eines Teams (inkl. Passagiere in Fahrzeugen) plus Infanterie in Ausbildungs-Warteschlangen. */
  soldierCount(team) {
    let n = 0;
    for (const u of this.units) {
      if (!u.alive || u.team !== team) continue;
      if (u.def.armor === 'inf') n += 1;
      for (const p of u.passengers) if (p.def.armor === 'inf') n += 1;
    }
    for (const b of this.buildings) {
      if (!b.alive || b.team !== team) continue;
      for (const e of b.queue) if (UNITS[e.unit].armor === 'inf') n += 1;
    }
    return n;
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
    if (b.main) return fail('Die Haupt-FOB kann nicht abgerissen werden');
    const factor = b.built ? BALANCE.demolishRefund : 1;
    const stock = { bm: b.store.bm, mun: b.store.mun, fuel: b.store.fuel };
    b.demolished = true;
    b.alive = false; // vor den Erstattungen, damit die FOB selbst nicht als Ziel gilt
    b.hp = 0;
    this.grid.release(b); // Fläche sofort frei (cleanup gibt sie nur idempotent erneut frei)
    if (b.type === 'fob') {
      // FOB-Baustellen werden nicht von einem Lager bezahlt: nur das eigene Lager geht an die nächste FOB
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
    const how = reason === 'points' ? 'nach Punkten' : 'durch Eliminierung';
    this.message(-1, `${BALANCE.teamNames[winner]} gewinnt ${how}`);
  }

  /** Fällt die Haupt-FOB eines Teams, ist es verloren (nur sie bildet Einheiten aus). */
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

  /** Tote entfernen; Gebäude geben ihren Fußabdruck frei. */
  cleanup() {
    const units = this.units;
    let k = 0;
    for (const u of units) {
      if (u.hp <= 0) u.alive = false;
      if (u.alive) units[k++] = u;
      else this.entities.delete(u.id);
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
      this.entities.delete(b.id);
      if (!b.demolished) {
        this.addEffect('explosion', b.x, b.y, b.team);
        this.message(b.team, `${b.def.name} zerstört`, b.x, b.y);
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
    // Reihenfolge: Wirtschaft setzt team.rate zurück; Bewegung, Logistik und Bau fahren; Kampf, Zone, Einkommen zuletzt
    updateEconomy(this, dt);
    updateMovement(this, dt);
    updateLogistics(this, dt);
    updateConstruction(this, dt);
    separate(this);
    updateCombat(this, dt);
    updateZone(this, dt);
    updateHot(this, dt);
    smoothIncome(this, dt);

    this.fogTimer += dt;
    if (this.fogTimer >= BALANCE.fogInterval) {
      this.fogTimer = 0;
      this.updateFog();
    }

    this.ageEffects(dt);
    this.cleanup();
    if (this.winner === null) this.checkElimination();
  }
}
