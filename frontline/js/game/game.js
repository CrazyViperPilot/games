// Spielzustand, Befehle (issue), Platzierung, Lager, Spawn, Aufräumen und Sieg (PLAN.md §4, §5, §11). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { makeRng } from '../core/rng.js';
import { generateMap } from './map.js';
import { Grid } from './grid.js';
import { createUnit, createBuilding, isDepot, depotRadius, isInfinite } from './entities.js';
import { Fog } from './fog.js';
import { updateEconomy, smoothIncome } from './economy.js';
import { updateMovement, nearestPassable, planPath, setIdle, separate } from './movement.js';
import { updateCombat } from './combat.js';
import { updateZone } from './zone.js';
import { updateLogistics, cmdLoad, cmdUnload, cmdRoute, cmdSetPreset, cargoSum } from './logistics.js';
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
const fail = (reason) => ({ ok: false, reason });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
/** Hat das Lager (Gebäude-store oder LKW-cargo) die Kosten (Sorten bm/mun/fuel) ganz? */
const covers = (stock, cost) => STOCK_KEYS.every((k) => stock[k] >= (cost[k] || 0));

/** Deckt Gebäude- oder LKW-Lager die Kosten? Unbegrenzte Lager (HQ) decken alles. */
const payCovers = (e, cost) => isInfinite(e) || covers(e.kind === 'building' ? e.store : e.cargo, cost);

/** Bezahlt die Sorten aus dem Lager (Gebäude → store, LKW → cargo). Geld zahlt das Team separat. Unbegrenzt: ohne Wirkung. */
function takeStock(e, cost) {
  if (isInfinite(e)) return;
  const stock = e.kind === 'building' ? e.store : e.cargo;
  for (const k of STOCK_KEYS) stock[k] -= cost[k] || 0;
}

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
  constructor({ seed = 1, winPoints = BALANCE.winPoints } = {}) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.map = generateMap(seed);
    this.grid = new Grid(W / TILE, H / TILE, TILE);
    this.grid.rasterizeObstacles(this.map.obstacles);
    this.nodeById = new Map(this.map.nodes.map((n) => [n.id, n]));

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
        res: { money: BALANCE.startRes.money }, // bm/mun/fuel: unten als Getter
        income: zeroRes(),
        rate: zeroRes(),
        flow: { bm: 0, mun: 0, fuel: 0 }, // Verbrauch aus Lagern je s (Nachfüllen)
        points: 0,
        pointProgress: 0,
        used: { mun: 0, fuel: 0 }, // Summe des Verbrauchs (Statistik)
        dockQueue: [], // LKW-IDs, die am HQ auf einen Ladeplatz warten (FIFO, logistics.js)
        warnAt: {}, // Zeitpunkt der letzten Meldung je Schlüssel (notify)
        incomeMult: 1,
        isAI: false,
        lastWarn: -1e9,
      };
      // Lesbare Summe über alle fertigen eigenen FOB-Lager; nie direkt schreiben
      for (const k of STOCK_KEYS) {
        Object.defineProperty(team.res, k, { enumerable: true, get: () => this.stockOf(id, k) });
      }
      return team;
    });
    this.zone = { ...this.map.zone, owner: -1, contested: false, counts: [0, 0] };
    this.fog = [new Fog(W, H), new Fog(W, H)];

    // Startzustand: je Team ein fertiges HQ (unbegrenzter Nachschub) zentriert auf dem Spawn, Startunits im Halbkreis davor
    for (let t = 0; t < 2; t++) {
      const sp = this.map.spawns[t];
      this.spawnBuilding('hq', t, this.grid.toCell(sp.x) - 2, this.grid.toCell(sp.y) - 2, { built: true });
      const ang0 = Math.atan2(H / 2 - sp.y, W / 2 - sp.x);
      const n = BALANCE.startUnits.length;
      BALANCE.startUnits.forEach((type, i) => {
        const a = ang0 + (i - (n - 1) / 2) * 0.9;
        const p = nearestPassable(this.grid, sp.x + Math.cos(a) * 100, sp.y + Math.sin(a) * 100, t) || sp;
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

  isExplored(team, x, y) {
    return this.fog[team].isExplored(x, y);
  }

  updateFog() {
    for (let t = 0; t < this.teams.length; t++) this.fog[t].update(this, t);
  }

  /** Vorkommen im Umkreis r (Standard 32) des Punktes: das nächste oder null. */
  nodeAt(x, y, r = 32) {
    let best = null;
    let bestD = r;
    for (const n of this.map.nodes) {
      const d = dist(n.x, n.y, x, y);
      if (d <= bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  extractorOn(nodeId) {
    return this.buildings.some((b) => b.alive && b.nodeId === nodeId);
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

  /** Summe einer Sorte über alle fertigen eigenen FOB-Lager (Getter von team.res). HQ zählt nicht (unbegrenzt). */
  stockOf(team, k) {
    let sum = 0;
    for (const b of this.buildings) {
      if (b.alive && b.built && b.team === team && b.type === 'fob') sum += b.store[k];
    }
    return sum;
  }

  /**
   * Testhilfe: setzt das Lager der ältesten fertigen eigenen FOB auf {bm, mun, fuel} (fehlende Sorten = 0)
   * und leert die übrigen fertigen FOB-Lager. Ohne FOB keine Wirkung (das HQ ist unbegrenzt).
   */
  setStock(team, vals) {
    const fobs = this.buildings.filter((b) => b.alive && b.built && b.team === team && b.type === 'fob');
    fobs.forEach((f, i) => {
      for (const k of STOCK_KEYS) f.store[k] = i === 0 ? vals[k] || 0 : 0;
    });
  }

  /** Eigene fertige Lager-Gebäude (FOB oder HQ), deren Bauradius (x, y) enthält. */
  depotsInRadius(team, x, y) {
    return this.buildings.filter((b) => isDepot(b) && b.team === team && dist(b.x, b.y, x, y) <= depotRadius(b));
  }

  /**
   * Zahler für Kosten an (x, y): nächstes fertiges eigenes Lager-Gebäude, dessen Bauradius (x, y) enthält und das
   * die Kosten (bm/mun/fuel) deckt. Das HQ deckt immer. null, wenn keines.
   */
  payerFor(team, x, y, cost) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (!isDepot(b) || b.team !== team) continue;
      const d = dist(b.x, b.y, x, y);
      if (d > depotRadius(b) || d >= bestD || !payCovers(b, cost)) continue;
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

  /** Erste fertige eigene FOB nahe (x, y) mit endlichem Lager (Erstattung, falls der Zahler tot ist). */
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

  /**
   * Versorger an (x, y): nächstes fertiges eigenes Lager-Gebäude (FOB oder HQ), dessen Bauradius den Punkt enthält.
   * null, wenn keines.
   */
  supplierAt(team, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (!isDepot(b) || b.team !== team) continue;
      const d = dist(b.x, b.y, x, y);
      if (d > depotRadius(b) || d >= bestD) continue;
      best = b;
      bestD = d;
    }
    return best;
  }

  /** Versorger eines Gebäudes (Förderanlage, Mörser, Flugabwehr); siehe supplierAt. */
  supplierOf(b) {
    return this.supplierAt(b.team, b.x, b.y);
  }

  /** Begründung, warum die Sorten für (x, y) nicht bezahlt werden können. */
  stockReason(team, x, y, cost) {
    const ds = this.depotsInRadius(team, x, y);
    if (!ds.length) return 'Kein FOB-Lager in Reichweite';
    const miss = STOCK_KEYS.filter((k) => (cost[k] || 0) > 0 && !ds.some((f) => isInfinite(f) || f.store[k] >= cost[k])).map(
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
   * Unbegrenzte Lager (HQ) nehmen nichts an: die Gutschrift wirkt dort nicht.
   */
  refundStock(team, payerId, cost, factor, x, y) {
    let target = payerId !== null && payerId !== undefined ? this.getEntity(payerId) : null;
    if (target && target.team !== team) target = null;
    if (!target) target = this.nearestFob(team, x, y);
    if (!target || isInfinite(target)) return;
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
  spawnBuilding(type, team, cx, cy, { built = true, nodeId = null, payerId = null } = {}) {
    const id = this.newId();
    const b = createBuilding(id, type, team, cx, cy, TILE);
    b.nodeId = nodeId;
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
   * Liefert { ok, reason, cx, cy, x, y, nodeId, payer } (x, y = Mitte des Fußabdrucks).
   * payer = { kind: 'fob'|'hq'|'truck', id } – wer die Sorten zahlt (null bei FOB-Baustellen).
   * Mauer/Tor außerhalb eines Lager-Radius: eigener LKW mit Ladung ≤ truckSupplyRange.
   * Förderanlage, deren Versorger das HQ wäre: verboten (Nachschub ist dort unbegrenzt).
   */
  canPlace(team, type, x, y) {
    const def = BUILDINGS[type];
    const g = this.grid;
    if (!def) return { ok: false, reason: 'Unbekanntes Gebäude' };

    let px = x;
    let py = y;
    let nodeId = null;
    if (def.yields) {
      const node = this.nodeAt(x, y, 32);
      if (!node) return { ok: false, reason: 'Förderanlage nur auf einem Ressourcenvorkommen' };
      if (this.extractorOn(node.id)) return { ok: false, reason: 'Dieses Vorkommen ist bereits gefördert' };
      px = node.x;
      py = node.y;
      nodeId = node.id;
      const sup = this.supplierAt(team, px, py);
      if (sup && isInfinite(sup)) return { ok: false, reason: 'Am HQ unnötig – Nachschub ist unbegrenzt' };
    } else if (this.nodeAt(x, y, 48)) {
      return { ok: false, reason: 'Auf einem Ressourcenvorkommen nur eine Förderanlage' };
    }

    const cx = g.toCell(px) - Math.floor(def.w / 2);
    const cy = g.toCell(py) - Math.floor(def.h / 2);
    const mx = (cx + def.w / 2) * TILE;
    const my = (cy + def.h / 2) * TILE;
    const bad = (reason) => ({ ok: false, reason, cx, cy, x: mx, y: my, nodeId, payer: null });

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
        if (!b.alive || b.team !== team) continue;
        if (b.type === 'fob') count++;
        if (b.type !== 'fob' && b.type !== 'hq') continue;
        if (dist(b.x, b.y, mx, my) < BALANCE.fob.minDistOwn) {
          return bad(b.type === 'hq' ? 'Zu nah am eigenen HQ' : 'Zu nah an einer eigenen FOB');
        }
      }
      if (count >= BALANCE.fob.max) return bad(`Höchstens ${BALANCE.fob.max} FOBs möglich`);
      for (const b of this.buildings) {
        if (b.alive && b.team !== team && dist(b.x, b.y, mx, my) < BALANCE.fob.minDistEnemy) {
          return bad('Zu nah an einem gegnerischen Gebäude');
        }
      }
    } else if (this.depotsInRadius(team, mx, my).length) {
      const f = this.payerFor(team, mx, my, def.cost);
      if (!f) return bad(this.stockReason(team, mx, my, def.cost));
      payer = { kind: f.type === 'hq' ? 'hq' : 'fob', id: f.id };
    } else if (WALL_TYPES.has(type)) {
      const tr = this.truckPayer(team, mx, my, def.cost);
      if (!tr) return bad('Außerhalb des Bauradius einer eigenen FOB oder des HQ');
      payer = { kind: 'truck', id: tr.id };
    } else {
      return bad('Außerhalb des Bauradius einer eigenen FOB oder des HQ');
    }

    return { ok: true, reason: null, cx, cy, x: mx, y: my, nodeId, payer };
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
    const p = this.canPlace(team, cmd.building, cmd.x, cmd.y);
    if (!p.ok) return fail(p.reason);
    if (!this.canAfford(team, def.cost)) return fail(this.missingMoney());
    this.pay(team, def.cost);
    const payer = p.payer ? this.getEntity(p.payer.id) : null;
    if (payer) takeStock(payer, def.cost);
    const b = this.spawnBuilding(cmd.building, team, p.cx, p.cy, { built: false, nodeId: p.nodeId, payerId: payer ? payer.id : null });
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
    let lastReason = 'Keine Zelle baubar';
    for (const [c, r] of cells) {
      const p = this.canPlace(team, cmd.building, g.center(c), g.center(r));
      if (!p.ok) {
        lastReason = p.reason;
        continue;
      }
      if (!this.canAfford(team, def.cost)) {
        lastReason = this.missingMoney();
        break;
      }
      this.pay(team, def.cost);
      const payer = this.getEntity(p.payer.id);
      takeStock(payer, def.cost);
      sites.push(this.spawnBuilding(cmd.building, team, p.cx, p.cy, { built: false, payerId: payer.id }));
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

  /** { type: 'train', buildingId, unit }: FOB zahlt aus eigenem Lager, Halle aus der FOB in Reichweite. */
  cmdTrain(team, cmd) {
    const b = this.getEntity(cmd.buildingId);
    if (!b || b.kind !== 'building' || b.team !== team) return fail('Kein eigenes Gebäude gewählt');
    if (!b.built) return fail('Gebäude ist noch im Bau');
    if (!UNITS[cmd.unit] || !b.def.produces.includes(cmd.unit)) return fail('Dieses Gebäude bildet diese Einheit nicht aus');
    if (b.queue.length >= BALANCE.queueMax) return fail('Warteschlange ist voll');
    if (this.unitCount(team) >= BALANCE.unitCap) return fail(`Einheitenlimit erreicht (${BALANCE.unitCap})`);
    const cost = UNITS[cmd.unit].cost;
    if (!this.canAfford(team, cost)) return fail(this.missingMoney());
    const payer = isDepot(b) ? (payCovers(b, cost) ? b : null) : this.payerFor(team, b.x, b.y, cost);
    if (!payer) return fail(this.stockReason(team, b.x, b.y, cost));
    this.pay(team, cost);
    takeStock(payer, cost);
    if (b.queue.length === 0) b.queueTime = 0;
    b.queue.push({ unit: cmd.unit, payerId: payer.id });
    return { ok: true };
  }

  /** Lebende plus in Ausbildung befindliche Einheiten eines Teams. */
  unitCount(team) {
    let n = 0;
    for (const u of this.units) if (u.alive && u.team === team) n++;
    for (const b of this.buildings) if (b.alive && b.team === team) n += b.queue.length;
    return n;
  }

  cmdCancelTrain(team, cmd) {
    const b = this.getEntity(cmd.buildingId);
    if (!b || b.kind !== 'building' || b.team !== team) return fail('Kein eigenes Gebäude gewählt');
    if (b.queue.length === 0) return fail('Nichts in der Warteschlange');
    const entry = b.queue.pop();
    if (b.queue.length === 0) b.queueTime = 0;
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
    if (b.type === 'hq') return fail('Das HQ kann nicht abgerissen werden');
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
    const how = reason === 'points' ? 'nach Punkten' : 'durch Zerstörung des HQ';
    this.message(-1, `${BALANCE.teamNames[winner]} gewinnt ${how}`);
  }

  /** Team verliert, sobald sein HQ zerstört ist. Beide zugleich: mehr Punkte gewinnt. */
  checkHq() {
    const lost = [];
    for (let t = 0; t < 2; t++) {
      const hasHq = this.buildings.some((b) => b.alive && b.team === t && b.type === 'hq');
      if (!hasHq) lost.push(t);
    }
    if (lost.length === 0) return;
    const winner = lost.length === 1 ? 1 - lost[0] : this.teams[0].points >= this.teams[1].points ? 0 : 1;
    this.endGame(winner, 'hq');
  }

  ageEffects(dt) {
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.life);
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
    smoothIncome(this, dt);

    this.fogTimer += dt;
    if (this.fogTimer >= BALANCE.fogInterval) {
      this.fogTimer = 0;
      this.updateFog();
    }

    this.ageEffects(dt);
    this.cleanup();
    if (this.winner === null) this.checkHq();
  }
}
