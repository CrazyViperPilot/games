// Fluss mit Brücken und Furten (v4.53, nach den Flusskarten aus Age of Empires II und den Brücken aus Company of Heroes). Der Fluss
// selbst ist Gelände (relief.js: Wasser ist unpassierbar), Furten macht das Raster passierbar (grid.rasterizeRelief). Brücken sind
// neutrale Entities (team −1, negative IDs ab −10000) mit Lebenspunkten: Ihre Fahrbahn öffnet die Wasserzellen darunter. Nur auf
// Befehl beschossen (Häuser-Faktoren), zerstört sperren sie wieder; ein Baufahrzeug baut sie für Geld wieder auf. Kein DOM.
import { BALANCE } from '../data/balance.js';
import { RELIEF } from './relief.js';
import { driveTo, setIdle } from './movement.js';

const RV = BALANCE.river;
const TILE = BALANCE.map.tile;
const fail = (reason) => ({ ok: false, reason });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Abstand Punkt → Brückenachse und Lage t (0–1) entlang der Achse (außerhalb < 0 bzw. > 1). */
function axis(br, x, y) {
  const dx = br.x2 - br.x1;
  const dy = br.y2 - br.y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = ((x - br.x1) * dx + (y - br.y1) * dy) / l2;
  const tc = Math.min(1, Math.max(0, t));
  return { d: Math.hypot(x - (br.x1 + tc * dx), y - (br.y1 + tc * dy)), t };
}

/** Zellen unter der Fahrbahn einer Brücke {x1, y1, x2, y2} (Zellmitte höchstens deck/2 + 8 px neben der Achse, zwischen den Enden). */
export function deckCells(grid, br) {
  const half = RV.deck / 2 + 8;
  const out = [];
  const c0 = Math.max(0, grid.toCell(Math.min(br.x1, br.x2) - half));
  const c1 = Math.min(grid.cols - 1, grid.toCell(Math.max(br.x1, br.x2) + half));
  const r0 = Math.max(0, grid.toCell(Math.min(br.y1, br.y2) - half));
  const r1 = Math.min(grid.rows - 1, grid.toCell(Math.max(br.y1, br.y2) + half));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const a = axis(br, grid.center(c), grid.center(r));
      if (a.d <= half && a.t >= 0 && a.t <= 1) out.push(grid.idx(c, r));
    }
  }
  return out;
}

/** Öffnet die vom Gelände gesperrten Zellen unter den Brücken (intakt); liefert je Brücke die geöffneten Zellen. */
export function openBridges(grid, bridges, relief) {
  return bridges.map((br) => {
    const opened = [];
    for (const i of deckCells(grid, br)) {
      const c = i % grid.cols;
      if (grid.terrain[i] && relief && relief.cellBlocked(c, (i - c) / grid.cols)) {
        grid.terrain[i] = 0;
        opened.push(i);
      }
    }
    return opened;
  });
}

/** Wasserstrecke unter einer Brücke: [von, bis] in px entlang der Achse (ohne Gelände oder ohne Wasser das mittlere Drittel). */
function wetSpan(relief, br, len) {
  const n = Math.max(2, Math.ceil(len / 8));
  let a = -1;
  let b = -1;
  for (let i = 0; i <= n && relief; i++) {
    const f = i / n;
    if (relief.heightAt(br.x1 + (br.x2 - br.x1) * f, br.y1 + (br.y2 - br.y1) * f) >= RELIEF.water) continue;
    if (a < 0) a = f * len;
    b = f * len;
  }
  return a < 0 ? [len / 3, (2 * len) / 3] : [a, b];
}

/**
 * Brücke als Entity (ohne Raster): Lage, Achse, Wasserstrecke, Fahrbahnhöhe und Zustand. Der Karteneditor zeichnet damit auch
 * Brücken, die noch kein Spiel kennt.
 */
export function bridgeShape(src, rel, id) {
  const len = Math.hypot(src.x2 - src.x1, src.y2 - src.y1);
  const ends = rel ? Math.max(rel.displayAt(src.x1, src.y1), rel.displayAt(src.x2, src.y2)) : 0;
  return {
    id,
    kind: 'bridge',
    type: 'bridge',
    team: -1,
    def: { name: 'Brücke', armor: 'struct', hp: RV.bridgeHp },
    x: (src.x1 + src.x2) / 2,
    y: (src.y1 + src.y2) / 2,
    x1: src.x1,
    y1: src.y1,
    x2: src.x2,
    y2: src.y2,
    len,
    angle: Math.atan2(src.y2 - src.y1, src.x2 - src.x1),
    w: len / TILE, // Reichweiten (radiusOf): halbe Länge
    h: len / TILE,
    deckH: rel ? Math.max(ends, RELIEF.water + 8) + 2 : 0, // Höhe der Fahrbahn (Iso, Höhenvorteil)
    hp: RV.bridgeHp,
    maxHp: RV.bridgeHp,
    alive: true, // bleibt als Entity, auch zerstört (broken), damit sie wieder aufgebaut werden kann
    broken: false,
    rebuild: null, // { team, progress } während des Wiederaufbaus (bezahlt)
    cells: [],
    span: wetSpan(rel, src, len), // Wasserstrecke entlang der Achse (Grafik: Pfeiler, Trümmer)
    lastHitTime: -1e9,
    src,
  };
}

/** Brücken der Karte als Entities (game.bridges, IDs ab −10000 abwärts), Fahrbahnen geöffnet. */
export function createBridges(game) {
  game.bridges = [];
  const list = game.map.bridges ?? [];
  const opened = openBridges(game.grid, list, game.relief);
  const grid = game.grid;
  grid.deck = list.length ? new Uint8Array(grid.cols * grid.rows) : null; // Zellen unter den Fahrbahnen (dort wird nicht gebaut)
  list.forEach((src, k) => {
    const b = bridgeShape(src, game.relief, -10000 - k);
    b.cells = opened[k];
    for (const i of deckCells(grid, src)) grid.deck[i] = 1;
    game.bridges.push(b);
    game.entities.set(b.id, b);
  });
}

/** Intakte Brücke, die man angreifen kann. */
export const isBridgeTarget = (t) => !!t && t.kind === 'bridge' && !t.broken;

/** Intakte Brücke, auf deren Fahrbahn (x, y) liegt, oder null (der ganze geöffnete Streifen zählt: deckCells bis zum Zellrand). */
export function bridgeUnder(game, x, y) {
  const half = RV.deck / 2 + 8 + TILE / 2;
  for (const b of game.bridges ?? []) {
    if (b.broken) continue;
    const a = axis(b, x, y);
    if (a.d <= half && a.t >= -0.02 && a.t <= 1.02) return b;
  }
  return null;
}

/** Abstand eines Punktes zur Fahrbahn (0 darauf). */
export function deckDist(b, x, y) {
  return Math.max(0, axis(b, x, y).d - RV.deck / 2);
}

/** Schaden an einer Brücke (zerstörte nehmen keinen). */
export function damageBridge(game, b, amount) {
  if (b.broken || !(amount > 0)) return;
  b.hp -= amount;
  b.lastHitTime = game.time;
  if (b.hp <= 0) breakBridge(game, b);
}

/** Brücke stürzt ein: Fahrbahn gesperrt (wer darauf stand, landet am nächsten Ufer: separate), Meldung an beide. */
export function breakBridge(game, b) {
  b.broken = true;
  b.hp = 0;
  b.rebuild = null;
  for (const i of b.cells) game.grid.terrain[i] = 1;
  for (const f of [0.25, 0.5, 0.75]) game.addEffect('explosion', b.x1 + (b.x2 - b.x1) * f, b.y1 + (b.y2 - b.y1) * f);
  game.message(-1, 'Brücke zerstört', b.x, b.y);
}

/** Brücke steht wieder: Fahrbahn offen, volle Lebenspunkte. */
function finishBridge(game, b) {
  b.broken = false;
  b.hp = b.maxHp;
  b.rebuild = null;
  for (const i of b.cells) game.grid.terrain[i] = 0;
  game.message(-1, 'Brücke wieder aufgebaut', b.x, b.y);
}

/**
 * { type: 'repairBridge', ids, bridgeId }: Baufahrzeuge bauen eine zerstörte Brücke wieder auf. Der erste Auftrag bezahlt
 * river.rebuildCost Geld (danach helfen weitere Baufahrzeuge ohne Kosten, auch die des Gegners).
 */
export function cmdRepairBridge(game, team, cmd) {
  const b = game.getEntity(cmd.bridgeId);
  if (!b || b.kind !== 'bridge') return fail('Keine Brücke');
  if (!b.broken) return fail('Die Brücke ist nicht zerstört');
  const list = game.ownUnits(team, cmd.ids).filter((u) => u.def.builder === 'all');
  if (!list.length) return fail('Nur Baufahrzeuge bauen Brücken wieder auf');
  if (!b.rebuild) {
    const cost = { money: RV.rebuildCost };
    if (!game.canAfford(team, cost)) return fail(game.missingMoney());
    game.pay(team, cost);
    b.rebuild = { team, progress: 0 };
  }
  for (const u of list) {
    u.order = { type: 'repairBridge', x: b.x, y: b.y, targetId: b.id, end: null };
    u.targetId = null;
    u.path = [];
    u.pathIndex = 0;
  }
  return { ok: true, count: list.length };
}

/** Brückenkopf (Ende der Fahrbahn), an dem das Baufahrzeug arbeitet: das nähere, nach einem Fehlversuch das andere. */
const endOf = (b, k) => (k === 0 ? { x: b.x1, y: b.y1 } : { x: b.x2, y: b.y2 });
const atBridge = (b, u) => Math.min(dist(u.x, u.y, b.x1, b.y1), dist(u.x, u.y, b.x2, b.y2)) <= RV.reach;

function stepBridgeBuilder(game, u, dt) {
  const o = u.order;
  const b = game.getEntity(o.targetId);
  if (!b || b.kind !== 'bridge' || !b.broken || !b.rebuild) {
    setIdle(u);
    return;
  }
  if (o.end === null) o.end = dist(u.x, u.y, b.x1, b.y1) <= dist(u.x, u.y, b.x2, b.y2) ? 0 : 1;
  if (atBridge(b, u)) {
    u.path = [];
    u.pathIndex = 0;
    return;
  }
  const e = endOf(b, o.end);
  if (driveTo(game, u, e.x, e.y, RV.reach - 20, dt) === 'stuck') {
    o.end = 1 - o.end; // dieses Ufer ist nicht erreichbar: das andere versuchen
    u.repathTimer = 1;
  }
}

/** Ein Schritt: Baufahrzeuge fahren zu den Brückenköpfen, der Wiederaufbau schreitet mit ihnen voran (höchstens maxBuilders). */
export function updateBridges(game, dt) {
  if (!game.bridges?.length) return;
  for (const u of game.units) if (u.alive && u.order.type === 'repairBridge') stepBridgeBuilder(game, u, dt);
  for (const b of game.bridges) {
    if (!b.broken || !b.rebuild) continue;
    let n = 0;
    for (const u of game.units) {
      if (u.alive && u.order.type === 'repairBridge' && u.order.targetId === b.id && atBridge(b, u)) n++;
    }
    n = Math.min(n, BALANCE.construction.maxBuilders);
    if (!n) continue;
    b.rebuild.progress += (n * dt) / RV.rebuild;
    if (b.rebuild.progress >= 1) {
      finishBridge(game, b);
      for (const u of game.units) if (u.alive && u.order.type === 'repairBridge' && u.order.targetId === b.id) setIdle(u);
    }
  }
}
