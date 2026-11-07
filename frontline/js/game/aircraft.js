// Kampfflugzeuge und Fliegerhorst (seit v5.03 F-16, seit v5.35 Fliegerhorst aus Bausteinen; PRD §6 „F-16“, §15 „Fliegerhorst“).
// Jets (def.jet) fliegen immer, drehen nur mit begrenzter Rate (BALANCE.jets.turn) und kreisen um ihren Befehlspunkt. Jeder Jet gehört
// zu einem Stellplatz der Stadt (Zellenart `stand`, 2 × 2): dort wird er gebaut, steht er, tankt Kerosin aus einem Kerosintank und lädt
// Raketen aus einem Munitionslager in der Nähe (CITY.air.supplyRadius). Zum Start rollt er über Straßen und Bahnzellen zur nächsten
// Start-/Landebahn (Zellenart `runway`: volles Rechteck CITY.air.runwayWidth breit, mindestens runwayMin lang, waagrecht oder
// senkrecht), wartet am Rand der Bahn, bis sie frei ist (jeder Start und jede Landung sperrt sie sep s, mit Tower sepAtc s), startet und
// steigt. Zur Landung fliegt er eine Platzrunde, sinkt im Endanflug auf die Bahn, die mit seinem Stellplatz verbunden ist, rollt aus
// und rollt zum Stellplatz (u.jet.phase: park, taxiOut, roll, air, rollout, taxiIn; u.jet.alt 0…1). Abgestellte Jets sind angreifbar,
// der Stellplatz schützt nach Stufe (CITY.air.shelter, siehe parkedArmor); fällt der Stellplatz, geht der Jet mit ihm verloren. Ohne
// erreichbare Bahn stürzt ein Jet ab, wenn der Treibstoff leer ist. Geschossen wird in combat.js. Kein DOM, deterministisch.
import { BALANCE } from '../data/balance.js';
import { CITY } from '../data/city.js';
import { UNITS } from '../data/units.js';
import { KIND_ID } from '../data/citykinds.js';
import { roadAt, accessCells, runwayGroups } from './city/cells.js';
import { resolveTarget, canAttack, isFoe } from './entities.js';
import { setIdle } from './movement.js';
import { modOf } from './research.js';

const J = BALANCE.jets;
const AIR = CITY.air;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// ---- Fliegerhorst: Stellplätze, Bahnen, Wege ----

/** Ist e ein fertiger Stellplatz (Ziel-Entity der Stadt)? */
export function isStand(game, e) {
  if (!e || e.type !== 'city' || !e.alive) return false;
  const c = game.city?.[e.team];
  return !!c && c.kind[e.cityCell] === KIND_ID.stand && c.level[e.cityCell] > 0;
}

/** Lebende fertige Stellplätze eines Teams. */
export function standsOf(game, team) {
  const c = game.city?.[team];
  if (!c) return [];
  const out = [];
  for (const [i, e] of c.ents) if (e.alive && c.kind[i] === KIND_ID.stand && c.level[i] > 0) out.push(e);
  return out;
}

/** Plätze, die eine Einheit auf einem Stellplatz belegt (units.js standSlots; fehlt = 1; die U-2 belegt beide). */
export const needOf = (u) => u.def.standSlots ?? 1;

/**
 * Belegte Plätze von Stellplatz e: Jets, die zu ihm gehören (dort, in der Luft), und seine Warteschlange, je nach standSlots.
 */
export function jetsAt(game, e) {
  let n = 0;
  for (const u of game.units) if (u.alive && u.jet?.home === e.id) n += needOf(u);
  for (const q of e.queue ?? []) n += UNITS[q.unit ?? q]?.standSlots ?? 1;
  return n;
}

/** Freie Plätze eines Stellplatzes (CITY.air.standJets je Stellplatz, Warteschlange eingerechnet). */
export const freeSpace = (game, e) => AIR.standJets - jetsAt(game, e);

/**
 * Hochfliegend (units.js highAlt, z. B. U-2): nur in der Luft, am Boden und auf dem Stellplatz nicht. Dann nur Waffen mit
 * antiHighAlt treffen sie (combat.js).
 */
export const isHighAlt = (e) => !!e.def?.highAlt && !jetGrounded(e);

/** Kann Einheit u das Ziel t in seiner Höhe treffen? Hochfliegende Ziele (isHighAlt) nur mit einer Waffe mit antiHighAlt (seit v5.83). */
export const canHitAltitude = (u, t) => !isHighAlt(t) || !!u.def.weapons?.some((w) => w.antiHighAlt);

/** Sichtweite einer Einheit: in der Luft mit highAlt die große Höhensicht (airSight), sonst def.sight (fog.js). */
export const sightOf = (u) => (isHighAlt(u) && u.def.airSight) || u.def.sight;

/** Stufe einer Stadt-Entity (0, wenn weg). */
const levelOf = (game, e) => (e && game.city?.[e.team] ? game.city[e.team].level[e.cityCell] : 0);

/** Schadensfaktor für einen abgestellten Jet auf seinem Stellplatz (1 offen, Überdachung, Stahlbeton-Shelter; CITY.air.shelter). */
export function parkedArmor(game, u) {
  if (!u.parked || !u.def?.jet) return 1;
  return AIR.shelter[levelOf(game, game.getEntity(u.jet?.home))] ?? 1;
}

const cellCenter = (c, i) => {
  const q = i % c.cols;
  return { x: c.x0 + (q + 0.5) * c.cell, y: c.y0 + ((i - q) / c.cols + 0.5) * c.cell };
};

/** Bahnen und Wege einer Stadt, neu bei jeder Änderung der Stadt (c.ver); Sperrzeiten in c.runwayBusy (gehören zum Spielstand). */
const CACHE = new WeakMap();
export function airOf(c) {
  let st = CACHE.get(c);
  if (st && st.ver === c.ver) return st;
  st = buildAir(c);
  CACHE.set(c, st);
  return st;
}

/**
 * Bahnen aus den Bahnzellen (Gruppen und Bahnstreifen in cells.js: runwayGroups): je Gruppe Weltkoordinaten, Mittellinie und Tower.
 */
function buildAir(c) {
  const n = c.cols * c.rows;
  const byCell = new Int32Array(n); // Index + 1 der Bahn je Zelle (nur der Streifen gültiger Bahnen)
  const runways = [];
  const S = c.cell;
  for (const rw of runwayGroups(c)) {
    const { valid, cells, axis } = rw;
    // Mittellinie und Enden in Weltkoordinaten
    if (axis === 'x') {
      const y = c.y0 + ((rw.r0 + rw.r1 + 1) / 2) * S;
      rw.ends = [{ x: c.x0 + rw.q0 * S, y }, { x: c.x0 + (rw.q1 + 1) * S, y }];
    } else {
      const x = c.x0 + ((rw.q0 + rw.q1 + 1) / 2) * S;
      rw.ends = [{ x, y: c.y0 + rw.r0 * S }, { x, y: c.y0 + (rw.r1 + 1) * S }];
    }
    rw.cx = (rw.ends[0].x + rw.ends[1].x) / 2;
    rw.cy = (rw.ends[0].y + rw.ends[1].y) / 2;
    rw.atc = false;
    if (valid) {
      for (const [ia, e] of c.ents) {
        if (!e.alive || c.kind[ia] !== KIND_ID.atc || !c.level[ia]) continue;
        if (dist(e.x, e.y, rw.cx, rw.cy) <= AIR.atcRadius * S + (rw.len * S) / 2) rw.atc = true;
      }
      for (const i of cells) byCell[i] = runways.length + 1;
    }
    runways.push(rw);
  }
  return { ver: c.ver, runways, byCell, paths: new Map() };
}

/** Bahnen eines Teams (gültige und ungültige, für Anzeige und KI). */
export function runwaysOf(game, team) {
  const c = game.city?.[team];
  return c ? airOf(c).runways : [];
}

/** Breitensuche über Straßen- und Bahnzellen von `starts` bis zur ersten Zelle mit goal(i); Weg als Zellenliste oder null. */
function cellPath(c, starts, goal) {
  const n = c.cols * c.rows;
  const prev = new Int32Array(n).fill(-2);
  const queue = [];
  for (const s of starts) {
    if (prev[s] !== -2 || !roadAt(c, s)) continue;
    prev[s] = -1;
    queue.push(s);
  }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    if (goal(i)) {
      const path = [];
      for (let k = i; k >= 0; k = prev[k]) path.push(k);
      return path.reverse();
    }
    const q = i % c.cols;
    const r = (i - q) / c.cols;
    for (const [x, y] of [[q - 1, r], [q + 1, r], [q, r - 1], [q, r + 1]]) {
      if (x < 0 || y < 0 || x >= c.cols || y >= c.rows) continue;
      const j = y * c.cols + x;
      if (prev[j] !== -2 || !roadAt(c, j)) continue;
      prev[j] = i;
      queue.push(j);
    }
  }
  return null;
}

/** Weg vom Stellplatz e zur nächsten gültigen Bahn: { cells (Stellplatz → erste Bahnzelle), rw } oder null; zwischengespeichert. */
export function standRoute(game, e) {
  const c = game.city?.[e.team];
  if (!c) return null;
  const st = airOf(c);
  if (st.paths.has(e.id)) return st.paths.get(e.id);
  const cells = cellPath(c, accessCells(c, e.cityCell), (i) => st.byCell[i] > 0);
  const res = cells ? { cells, rw: st.runways[st.byCell[cells[cells.length - 1]] - 1] } : null;
  st.paths.set(e.id, res);
  return res;
}

/** Sperrzeit einer Bahn je Bewegung (s): mit Tower kürzer. */
const sepOf = (rw) => (rw.atc ? AIR.sepAtc : AIR.sep);

/** Bahn für u belegen (Start oder Landung): frei oder schon von u belegt → sperren und true. */
function lockRunway(game, c, rw, u) {
  c.runwayBusy ??= {};
  const b = c.runwayBusy[rw.key];
  if (b && b.until > game.time && b.by !== u.id) return false;
  c.runwayBusy[rw.key] = { until: game.time + sepOf(rw), by: u.id };
  return true;
}

/** Ist die Bahn gerade gesperrt (für die Anzeige)? Restzeit in s, 0 frei. */
export function runwayBusy(game, team, rw) {
  const b = game.city?.[team]?.runwayBusy?.[rw.key];
  return b && b.until > game.time ? b.until - game.time : 0;
}

/** Rollen am Boden (Stellplatz → Bahn, Bahn → Stellplatz), Startlauf und Ausrollen; dort schießt ein Jet nicht. */
const GROUND = new Set(['taxiOut', 'roll', 'rollout', 'taxiIn']);

/** Steht der Jet am Boden (abgestellt, rollt, startet oder rollt aus)? */
export const jetGrounded = (u) => !!u.def?.jet && (!!u.parked || GROUND.has(u.jet?.phase));

/** Flughöhe 0 (Boden) … 1 (Reiseflughöhe) für die Darstellung. */
export const jetAlt = (u) => (u.parked ? 0 : (u.jet?.alt ?? 1));

/** Nächster eigener Stellplatz: der eigene, sonst der nächste freie mit Weg zu einer Bahn; null ohne. */
function homeFor(game, u) {
  const own = game.getEntity(u.jet.home);
  if (own && isStand(game, own) && standRoute(game, own)) return own;
  let best = null;
  let bestD = Infinity;
  for (const e of standsOf(game, u.team)) {
    if (freeSpace(game, e) < needOf(u) || !standRoute(game, e)) continue;
    const d = dist(e.x, e.y, u.x, u.y);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Mitte der belegten Plätze eines Jets (Nummer des ersten plus halbe Breite − 1 Platz): eine U-2 steht mittig über beiden Plätzen. */
const slotCenter = (u) => (u.jet.slot ?? 0) + (needOf(u) - 1) / 2;

/** Ort des Platzes s auf Stellplatz e: die Plätze liegen nebeneinander (Nase nach Norden), gleichmäßig um die Mitte verteilt. */
function slotPos(c, e, s) {
  const d = (s - (AIR.standJets - 1) / 2) * 2 * AIR.standSlot * c.cell;
  return { x: e.x + d, y: e.y };
}

/**
 * Punkt am Rand des Stellplatzes vor Platz s, auf der Seite (Nord oder Süd) des Zugangs `ref` (Rollfeld-, Bahn- oder Straßenzelle):
 * Jets rollen dort ein und aus, gerade vom Platz weg, nicht über den anderen Platz. Ohne Zugang oder auf gleicher Höhe der Südrand.
 */
function laneOf(c, e, s, ref) {
  const p = slotPos(c, e, s);
  const side = ref && ref.y < e.y - 1e-6 ? -1 : 1;
  return { x: p.x, y: e.y + side * c.cell };
}

/**
 * Freier Platz für u auf Stellplatz e: der kleinste, den kein anderer Jet dort hält (ein Jet hält seinen Platz, solange er abgestellt ist
 * oder am Boden rollt). Sind alle belegt (sollte nicht vorkommen), der erste.
 */
function takeSlot(game, u, e) {
  const n = needOf(u);
  for (let s = 0; s + n <= AIR.standJets; s++) {
    // belegt, wenn ein anderer Jet am Boden oder abgestellt einen Platz hat, der sich mit s … s+n−1 überschneidet
    const held = game.units.some((o) => o !== u && o.alive && o.def?.jet && o.jet?.home === e.id && o.jet.slot != null && (o.parked || GROUND.has(o.jet.phase)) && o.jet.slot < s + n && s < o.jet.slot + needOf(o));
    if (!held) return s;
  }
  return 0;
}

/** Jet u steht auf seinem Platz von e (zugewiesen, wenn noch keiner da ist, z. B. nach dem Laden eines alten Standes). */
function seat(game, u, e) {
  const c = game.city[u.team];
  u.jet.slot ??= takeSlot(game, u, e);
  const p = slotPos(c, e, slotCenter(u));
  u.x = p.x;
  u.y = p.y;
  u.prevX = p.x;
  u.prevY = p.y;
}

/** Abgestellt: auf seinem Platz an Stellplatz e, Nase nach Norden. */
function park(game, u, e) {
  seat(game, u, e);
  u.angle = -Math.PI / 2;
  u.parked = true;
  u.jet.home = e.id;
  u.jet.ready = false;
  u.jet.phase = 'park';
  u.jet.alt = 0;
  u.jet.v = 0;
  u.jet.route = null;
  u.jet.rtb = false;
  u.jet.dir = u.jet.side = undefined;
  u.jet.rtbHome = null;
  u.jet.land = null;
  setIdle(u);
}

/** Neue F-16 aus der Ausbildung (economy.js): steht gleich auf ihrem Platz am Stellplatz. */
export function parkNew(game, u, e) {
  u.jet = { home: e.id, ready: false, warned: false };
  park(game, u, e);
  u.jet.ready = isFull(u);
}

/** Voll betankt, voll munitioniert und unversehrt? */
const isFull = (u) => u.fuel >= u.def.fuelMax - 1e-6 && u.ammo >= u.def.ammoMax - 1e-6 && u.hp >= u.maxHp - 1e-6;

/** Keine einzige volle Rakete mehr. */
const dry = (u) => u.weapons.length > 0 && !u.weapons.some((w) => w.rounds >= 1); // ohne Waffen (U-2) nie leer geschossen

/** Eigener Stellplatz, auf dem der Befehl `land` den Jet landen lässt, sonst null. */
function landTarget(game, u) {
  const o = u.order;
  if (o.type !== 'land') return null;
  const e = game.getEntity(o.targetId);
  return e && e.team === u.team && isStand(game, e) ? e : null;
}

/** Wie weit ein Befehl den Jet in die Luft schickt: Bewegung, Angriff, Angriffsmarsch, Landen auf einem anderen Stellplatz. */
const wantsOut = (u) => u.order.type === 'move' || u.order.type === 'attack' || u.order.type === 'attackMove' || (u.order.type === 'land' && u.order.targetId !== u.jet.home);

/** Nase höchstens rate × dt in Richtung want drehen. */
function turnTo(u, want, m) {
  let d = want - u.angle;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  u.angle += Math.max(-m, Math.min(m, d));
}

/** Rollt vor u ein anderer eigener Jet in dieselbe Richtung (Abstand halten)? */
function blockedAhead(game, u) {
  const cx = Math.cos(u.angle);
  const cy = Math.sin(u.angle);
  for (const o of game.units) {
    if (o === u || !o.alive || !o.def.jet || o.parked || o.team !== u.team || !GROUND.has(o.jet?.phase)) continue;
    const dx = o.x - u.x;
    const dy = o.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d > J.gap || d < 1e-6) continue;
    if (dx * cx + dy * cy > 0.6 * d && Math.cos(o.angle - u.angle) > 0.3) return true;
  }
  return false;
}

/** Ein Rollschritt entlang u.jet.route. Punkte mit `enter` (Bahn) erst, wenn die Bahn frei ist. true am Ende des Weges. */
function taxi(game, u, dt) {
  const r = u.jet.route;
  const p = r[u.jet.idx];
  if (!p) return true;
  if (p.enter && !u.jet.locked) {
    // Rand der Bahn: warten, bis sie frei ist, dann für den Start sperren
    const c = game.city[u.team];
    const rw = airOf(c).runways.find((x) => x.key === p.enter);
    if (!rw || !lockRunway(game, c, rw, u)) return false;
    u.jet.locked = true;
  }
  const t = keepRight(r, u.jet.idx, u);
  const want = Math.atan2(t.y - u.y, t.x - u.x);
  turnTo(u, want, J.taxiTurn * dt);
  if (blockedAhead(game, u) && (u.jet.wait = (u.jet.wait ?? 0) + dt) < J.taxiWait) return false; // Abstand zum Vordermann
  u.jet.wait = 0;
  const d = Math.hypot(t.x - u.x, t.y - u.y);
  const step = J.taxi * dt;
  if (d <= step) {
    u.x = t.x;
    u.y = t.y;
    u.jet.idx++;
    return u.jet.idx >= r.length;
  }
  u.x += ((t.x - u.x) / d) * step;
  u.y += ((t.y - u.y) / d) * step;
  return false;
}

/**
 * Zielpunkt des Rollschritts zu Routenpunkt idx: Zellmitten des Rollwegs (side) um J.keepRight rechts neben der Mitte, quer zur
 * Richtung vom vorigen Punkt (Rechtsverkehr, Gegenverkehr rollt aneinander vorbei); Stellplatz, Rand und Bahn genau.
 */
function keepRight(r, idx, u) {
  const p = r[idx];
  if (!p.side) return p;
  const q = r[idx - 1] ?? u;
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return p;
  return { x: p.x - (dy / L) * J.keepRight, y: p.y + (dx / L) * J.keepRight };
}

/** Stellplatz zerstört oder weg: der Jet am Boden geht mit ihm verloren. true, wenn das passiert ist. */
function lostWithStand(game, u) {
  const e = game.getEntity(u.jet.home);
  if (e && isStand(game, e)) return false;
  u.hp = 0;
  u.alive = false;
  return true;
}

/** Nächster eigener Lager-Bau (Kerosintank oder Munitionslager) mit Bestand im Umkreis des Stellplatzes oder Heliports e (auch helipad.js). */
export function supplier(game, e, kind) {
  const c = game.city[e.team];
  const R = AIR.supplyRadius * c.cell;
  let best = null;
  let bestD = Infinity;
  for (const [i, s] of c.ents) {
    if (!s.alive || c.kind[i] !== kind || !c.level[i] || !(s.stock > 1e-6)) continue;
    const d = dist(s.x, s.y, e.x, e.y);
    if (d <= R && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Am Boden: tanken (Kerosintank), nachladen (Munitionslager) und reparieren; auf Befehl zur Bahn rollen, wenn bereit. */
function stepParked(game, u, dt) {
  if (lostWithStand(game, u)) return;
  const e = game.getEntity(u.jet.home);
  const c = game.city[u.team];
  if (u.jet.slot == null) seat(game, u, e); // alter Stand ohne Platz (Spielstand vor den zwei Plätzen)
  const mod = modOf(game, u, 'rearm'); // Schnellwartung (Forschung): kleiner = schneller
  if (u.fuel < u.def.fuelMax) {
    const t = supplier(game, e, KIND_ID.ktank);
    const want = u.def.fuelMax - u.fuel;
    const got = t ? Math.min(want, t.stock, (AIR.tank.rate[levelOf(game, t)] * dt) / mod) : 0;
    if (t) t.stock -= got;
    u.fuel += got;
    if (got < want - 1e-9 && !t) game.shortage(u.team, 'kero');
  }
  if (u.ammo < u.def.ammoMax) {
    const d = supplier(game, e, KIND_ID.mdepot);
    const want = u.def.ammoMax - u.ammo;
    const got = d ? Math.min(want, d.stock, (AIR.depot.rate[levelOf(game, d)] * dt) / mod) : 0;
    if (d) d.stock -= got;
    u.ammo += got;
    game.teams[u.team].used.mun += got;
    if (got < want - 1e-9 && !d) game.shortage(u.team, 'mun');
  }
  if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * J.repair * dt);
  const was = u.jet.ready;
  u.jet.ready = isFull(u);
  if (u.order.type === 'land') setIdle(u); // steht schon auf diesem Stellplatz
  if (u.jet.ready && !was && !wantsOut(u)) game.message(u.team, `${u.def.name} startbereit`, u.x, u.y);
  if (!wantsOut(u)) return;
  if (!u.jet.ready) {
    if (!u.jet.warned) game.message(u.team, `${u.def.name} wird noch betankt und munitioniert (Kerosintank und Munitionslager in der Nähe nötig)`, u.x, u.y);
    u.jet.warned = true;
    return;
  }
  const route = standRoute(game, e);
  if (!route) {
    if (!u.jet.noRunway) game.message(u.team, `${u.def.name}: kein Weg über Straße oder Rollfeld zu einer Start-/Landebahn`, u.x, u.y);
    u.jet.noRunway = true;
    return;
  }
  u.jet.noRunway = false;
  // Start: über den Weg zur Bahn, am Rand warten, dann auf die Mittellinie am näheren Ende; Startlauf zum anderen Ende
  const rw = route.rw;
  const entry = cellCenter(c, route.cells[route.cells.length - 1]);
  const [a, b] = rw.ends;
  const near = dist(entry.x, entry.y, a.x, a.y) <= dist(entry.x, entry.y, b.x, b.y) ? 0 : 1;
  const from = rw.ends[near];
  const to = rw.ends[1 - near];
  const L = Math.hypot(to.x - from.x, to.y - from.y);
  const dx = (to.x - from.x) / L;
  const dy = (to.y - from.y) / L;
  const start = { x: from.x + dx * (c.cell / 2), y: from.y + dy * (c.cell / 2) };
  const pts = route.cells.map((i, k) => ({ ...cellCenter(c, i), enter: k === route.cells.length - 1 ? rw.key : 0, side: k < route.cells.length - 1 }));
  pts.push({ ...start, enter: 0 });
  pts.unshift({ ...laneOf(c, e, slotCenter(u), pts[0]), enter: 0 }); // erst vom Platz zum Rand des Stellplatzes auf der Seite des Rollwegs
  u.parked = false;
  u.jet.warned = false;
  u.jet.phase = 'taxiOut';
  u.jet.route = pts;
  u.jet.idx = 0;
  u.jet.locked = false;
  u.jet.alt = 0;
  u.jet.v = 0;
  u.jet.roll = { dx, dy, ex: to.x, ey: to.y, key: rw.key };
  u.anchorX = u.order.x ?? u.x;
  u.anchorY = u.order.y ?? u.y;
}

/** Rollen zur Bahn; am Ende Startlauf. Ohne Stellplatz ist der Jet verloren. */
function stepTaxiOut(game, u, dt) {
  if (lostWithStand(game, u)) return;
  if (!taxi(game, u, dt)) return;
  u.jet.phase = 'roll';
  u.jet.route = null;
  u.jet.v = J.taxi;
}

/** Startlauf entlang der Bahn: Nase ausrichten, beschleunigen, bei rotate × Reisetempo (spätestens am Bahnende) abheben. */
function stepRoll(game, u, dt) {
  const full = u.def.speed * modOf(game, u, 'speed');
  const R = u.jet.roll;
  const head = Math.atan2(R.dy, R.dx);
  turnTo(u, head, J.taxiTurn * dt);
  let d = head - u.angle;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) > 0.05) return; // erst ausrichten
  u.jet.v = Math.min(full, u.jet.v + J.accel * dt);
  u.x += R.dx * u.jet.v * dt;
  u.y += R.dy * u.jet.v * dt;
  const left = (R.ex - u.x) * R.dx + (R.ey - u.y) * R.dy;
  if (u.jet.v >= J.rotate * full || left <= 0) {
    u.jet.phase = 'air';
    u.jet.slot = undefined; // Platz frei
    u.jet.alt = 0;
    u.jet.lift = true; // Steigflug: erst geradeaus, dann frei
    u.jet.locked = false;
  }
}

/** Ausrollen auf der Bahn: bremsen bis zum Rolltempo, dann über Rollfeld und Straßen zum Stellplatz. */
function stepRollout(game, u, dt) {
  if (lostWithStand(game, u)) return;
  const L = u.jet.land;
  const c = game.city[u.team];
  turnTo(u, Math.atan2(L.dy, L.dx), J.taxiTurn * dt);
  u.jet.v = Math.max(J.taxi, u.jet.v - J.decel * dt);
  u.x += L.dx * u.jet.v * dt;
  u.y += L.dy * u.jet.v * dt;
  // auf die Mittellinie
  const cross = (u.x - L.tx) * -L.dy + (u.y - L.ty) * L.dx;
  u.x -= -L.dy * cross * Math.min(1, 4 * dt);
  u.y -= L.dx * cross * Math.min(1, 4 * dt);
  const left = (L.ex - u.x) * L.dx + (L.ey - u.y) * L.dy;
  if (u.jet.v > J.taxi && left > c.cell / 2) return;
  // Weg von der Zelle unter dem Jet zum Stellplatz
  const e = game.getEntity(u.jet.home);
  const q = Math.floor((u.x - c.x0) / c.cell);
  const r = Math.floor((u.y - c.y0) / c.cell);
  const here = r * c.cols + q;
  const goal = new Set(accessCells(c, e.cityCell));
  const cells = cellPath(c, [here], (i) => goal.has(i));
  const pts = (cells ?? []).map((i, k) => ({ ...cellCenter(c, i), enter: 0, side: k > 0 }));
  u.jet.slot = takeSlot(game, u, e); // Platz für die Einfahrt reservieren
  pts.push({ ...laneOf(c, e, slotCenter(u), pts[pts.length - 1]), enter: 0 }, { ...slotPos(c, e, slotCenter(u)), enter: 0 });
  u.jet.phase = 'taxiIn';
  u.jet.route = pts;
  u.jet.idx = 0;
}

/** Rollen zum Stellplatz; dort abstellen (tanken, nachladen). */
function stepTaxiIn(game, u, dt) {
  if (lostWithStand(game, u)) return;
  if (taxi(game, u, dt)) park(game, u, game.getEntity(u.jet.home));
}

/** Ein Flugschritt Richtung (tx, ty): Nase höchstens turn × dt × tf drehen, dann mit dem Tempo des Jets geradeaus. */
function fly(u, tx, ty, dt, tf = 1) {
  turnTo(u, Math.atan2(ty - u.y, tx - u.x), J.turn * dt * tf);
  const v = u.jet.v * dt;
  u.x = Math.min(BALANCE.map.width, Math.max(0, u.x + Math.cos(u.angle) * v));
  u.y = Math.min(BALANCE.map.height, Math.max(0, u.y + Math.sin(u.angle) * v));
}

/** Kreisen um (ox, oy) im Abstand orbit: Ziel ein Stück voraus auf dem Kreis. */
function circle(u, ox, oy, dt, tf) {
  const a = Math.atan2(u.y - oy, u.x - ox) + 0.7;
  fly(u, ox + Math.cos(a) * J.orbit, oy + Math.sin(a) * J.orbit, dt, tf);
}

/**
 * Landerichtung auf der Bahn rw: von dem Ende aus, vor dem die Platzrunde in die Karte passt (sonst das mit mehr Platz).
 * Liefert { tx, ty (Schwelle), dx, dy (Landerichtung), ex, ey (Bahnende) }.
 */
function landPlan(rw) {
  const need = J.final + J.base + J.planRoom;
  const room = (p, q) => {
    // Platz vor der Schwelle p, entgegen der Landerichtung p → q
    const dx = Math.sign(q.x - p.x);
    const dy = Math.sign(q.y - p.y);
    const toEdge = dx > 0 ? p.x : dx < 0 ? BALANCE.map.width - p.x : dy > 0 ? p.y : BALANCE.map.height - p.y;
    return toEdge - need;
  };
  const [a, b] = rw.ends;
  const ra = room(a, b);
  const rb = room(b, a);
  const [p, q] = ra >= 0 || ra >= rb ? [a, b] : [b, a];
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  return { tx: p.x, ty: p.y, dx: (q.x - p.x) / L, dy: (q.y - p.y) / L, ex: q.x, ey: q.y, key: rw.key };
}

/**
 * Landeanflug auf die Bahn des Stellplatzes e (Platzrunde in Bahnrichtung, waagrecht oder senkrecht): Liegt der Jet noch nicht vor dem
 * Eindrehpunkt (Schwelle − base) oder fehlt ihm zum Ausrichten der Platz, fliegt er im Gegenanflug seitlich versetzt hinaus; dann dreht
 * er in den Endanflug, wird langsamer, sinkt im Gleitpfad, setzt an der Aufsetzmarke auf und rollt aus. Ist die Bahn belegt, fliegt er
 * die Runde weiter; verpasst er die Marke, startet er durch.
 */
function approach(game, u, e, dt) {
  const c = game.city[u.team];
  const route = standRoute(game, e);
  if (!route) return false;
  const P = (u.jet.land && u.jet.land.key === route.rw.key ? u.jet.land : (u.jet.land = landPlan(route.rw)));
  const ex = P.dx;
  const ey = P.dy;
  const px = -ey; // quer zur Bahn
  const py = ex;
  const W = (a, b) => ({ x: P.tx + ex * a + px * b, y: P.ty + ey * a + py * b });
  const along = (u.x - P.tx) * ex + (u.y - P.ty) * ey; // Strecke hinter der Schwelle in Landerichtung (davor negativ)
  const cross = (u.x - P.tx) * px + (u.y - P.ty) * py;
  let hd = u.angle - Math.atan2(ey, ex);
  hd = Math.atan2(Math.sin(hd), Math.cos(hd));
  const head = Math.cos(hd); // 1 = Nase in Landerichtung
  const full = u.jet.speed;
  const near = dist(u.x, u.y, P.tx, P.ty) < J.final * 2.5;
  const aligned = head > J.alignHead && Math.abs(cross) < J.alignCross;
  let onFinal = head > J.finalHead && Math.abs(cross) < J.finalCross && along < J.touch + J.zone && along > -J.final * 2;
  // Bahn für die Landung belegen, sobald der Gleitpfad beginnt; belegt: weiter Platzrunde
  if (onFinal && along > -J.glide - 60 && !lockRunway(game, c, route.rw, u)) onFinal = false;
  const room = J.touch - along >= Math.abs(cross) * J.turnIn + J.glide * J.turnGlide; // genug Strecke, um auf die Mittellinie einzudrehen
  const clamp = (p) => ({ x: Math.min(BALANCE.map.width - 100, Math.max(100, p.x)), y: Math.min(BALANCE.map.height - 100, Math.max(100, p.y)) });
  let want = full;
  if (onFinal || (along < -J.base && room && !u.jet.goAround)) {
    const t = W(Math.min(along + J.lead, J.touch + J.lead), 0);
    fly(u, t.x, t.y, dt);
    const glide = onFinal && aligned ? Math.max(0, (J.touch - along) / J.glide) : 1;
    u.jet.alt = glide < u.jet.alt ? Math.max(glide, u.jet.alt - (2 * dt) / J.climb) : Math.min(1, u.jet.alt + dt / J.climb);
    if (onFinal && along >= J.touch - 2 && u.jet.alt <= 0.02) {
      u.jet.phase = 'rollout'; // aufgesetzt
      u.jet.slot = undefined; // den Platz am Stellplatz gibt er erst beim Einrollen frei (stepRollout)
      u.jet.alt = 0;
      u.jet.home = e.id;
      u.jet.rtb = false;
      return true;
    }
    want = J.approach * full;
  } else {
    // Gegenanflug: seitlich der Bahn (Seite, auf der er ankommt) hinaus, bis Platz zum Eindrehen ist
    u.jet.side ??= cross >= 0 ? 1 : -1;
    const off = along < -J.base ? Math.max(J.pattern, Math.min(Math.abs(cross), J.pattern * 2)) : J.pattern;
    let t = W(-(J.final + J.base + J.outbound), u.jet.side * off);
    const tc = clamp(t);
    if (tc.x !== t.x || tc.y !== t.y) {
      const t2 = W(-(J.final + J.base + J.outbound), -u.jet.side * off); // Kartenrand: andere Seite
      if (clamp(t2).x === t2.x && clamp(t2).y === t2.y) u.jet.side = -u.jet.side;
      t = clamp(W(-(J.final + J.base + J.outbound), u.jet.side * off));
    }
    fly(u, t.x, t.y, dt);
    u.jet.alt = Math.min(1, u.jet.alt + dt / J.climb);
    if (along < -J.base * 1.5) u.jet.goAround = false;
    if (near) want = J.downwind * full;
  }
  if (along > J.touch + J.zone) u.jet.goAround = true; // verpasst: neue Runde
  u.jet.v = u.jet.v > want ? Math.max(want, u.jet.v - J.slow * dt) : Math.min(want, u.jet.v + J.accel * dt);
  return true;
}

/** In der Luft: Treibstoff, Heimweg, Befehl (Ziel verfolgen, Punkt anfliegen, kreisen), Landung. */
function stepAirborne(game, u, dt) {
  const burn = u.def.fuelPerSec * modOf(game, u, 'fuel') * dt; // konforme Tanks (Forschung)
  u.fuel = Math.max(0, u.fuel - burn);
  game.teams[u.team].used.fuel += burn;
  u.jet.speed = u.def.speed * modOf(game, u, 'speed'); // Nachbrenner (Forschung)
  u.jet.v ??= u.jet.speed;
  u.jet.alt ??= 1;
  if (u.fuel <= 0) {
    u.hp = 0; // leer: Absturz
    u.alive = false;
    game.message(u.team, `${u.def.name} abgestürzt: kein Treibstoff`, u.x, u.y);
    return;
  }
  // Steigflug nach dem Start: zuerst geradeaus, mit der Höhe frei wendig
  const tf = u.jet.lift ? Math.min(1, u.jet.alt / 0.5) : 1;
  if (u.jet.lift && u.jet.alt >= 1) u.jet.lift = false;
  const o = u.order;
  let home = homeFor(game, u);
  // freiwillig landen: Befehl „Landen“ auf einen eigenen Stellplatz
  let asked = landTarget(game, u);
  if (asked && freeSpace(game, asked) + (u.jet.home === asked.id ? needOf(u) : 0) < needOf(u)) {
    game.message(u.team, `${u.def.name}: Stellplatz belegt`, u.x, u.y);
    setIdle(u);
    asked = null;
  } else if (asked && !standRoute(game, asked)) {
    game.message(u.team, `${u.def.name}: dieser Stellplatz hat keinen Weg zu einer Start-/Landebahn`, u.x, u.y);
    setIdle(u);
    asked = null;
  } else if (!asked && o.type === 'land') setIdle(u); // Stellplatz weg
  if (asked) home = asked;
  const rw = home ? standRoute(game, home)?.rw : null;
  const toHome = rw ? dist(u.x, u.y, rw.cx, rw.cy) + J.final : 0;
  const bingo = rw && u.fuel <= (toHome / u.jet.speed) * u.def.fuelPerSec * modOf(game, u, 'fuel') * J.reserve + J.margin;
  // Rückkehr wegen Treibstoff oder Raketen bleibt bis zur Landung (u.jet.rtb), auf Befehl nur, solange der Befehl gilt
  if (u.jet.rtb === 'asked' && !asked) u.jet.rtb = false;
  if (rw && (u.jet.rtb || bingo || dry(u) || asked)) {
    const why = u.jet.rtb || (bingo ? 'fuel' : dry(u) ? 'ammo' : 'asked');
    if (!u.jet.rtb && why !== 'asked') game.message(u.team, `${u.def.name} kehrt zum Fliegerhorst zurück (${why === 'fuel' ? 'Treibstoff' : 'keine Raketen'})`, u.x, u.y);
    if (u.jet.rtbHome !== home.id) u.jet.side = u.jet.land = undefined; // neue Platzrunde
    u.jet.rtbHome = home.id;
    u.jet.home = home.id; // der Stellplatz ist für ihn reserviert
    u.jet.rtb = why;
    if (u.jet.lift) {
      fly(u, u.x + Math.cos(u.angle) * J.lead, u.y + Math.sin(u.angle) * J.lead, dt, tf); // erst steigen
      u.jet.alt = Math.min(1, u.jet.alt + dt / J.climb);
      return;
    }
    approach(game, u, home, dt);
    return;
  }
  u.jet.rtbHome = null;
  u.jet.side = u.jet.land = undefined;
  // Höhe und Tempo zurück auf Reiseflug
  u.jet.alt = Math.min(1, u.jet.alt + dt / J.climb);
  u.jet.v = Math.min(u.jet.speed, u.jet.v + J.accel * dt);
  if (!rw && !u.jet.lost) {
    u.jet.lost = true;
    game.message(u.team, `${u.def.name}: kein freier Stellplatz mit Weg zu einer Start-/Landebahn`, u.x, u.y);
  } else if (rw) u.jet.lost = false;
  u.jet.rtb = false;
  if (o.type === 'attack') {
    const t = resolveTarget(game, o.targetId);
    if (!canAttack(u.team, t)) {
      setIdle(u);
      return;
    }
    fly(u, t.x, t.y, dt, tf);
    return;
  }
  if (o.type === 'move' || o.type === 'attackMove') {
    if (o.type === 'attackMove' && u.targetId !== null) {
      const t = resolveTarget(game, u.targetId);
      if (isFoe(u.team, t)) {
        fly(u, t.x, t.y, dt, tf);
        return;
      }
    }
    if (dist(u.x, u.y, o.x, o.y) > J.orbit) {
      fly(u, o.x, o.y, dt, tf);
      return;
    }
    const x = o.x;
    const y = o.y;
    setIdle(u);
    u.anchorX = x; // um den Befehlspunkt kreisen, nicht um die Stelle, an der der Kreis begann
    u.anchorY = y;
    u.order.x = x;
    u.order.y = y;
  }
  // untätig: Ziel aus der Zielsuche (combat.js) verfolgen, solange es nahe am Ankerpunkt ist; sonst kreisen
  if (u.targetId !== null) {
    const t = resolveTarget(game, u.targetId);
    if (isFoe(u.team, t) && dist(t.x, t.y, u.anchorX, u.anchorY) <= u.def.sight + J.orbit) {
      fly(u, t.x, t.y, dt, tf);
      return;
    }
    u.targetId = null;
  }
  circle(u, u.anchorX, u.anchorY, dt, tf);
}

/** Alle Jets einen Schritt (nach updateMovement; Bewegung der Jets nur hier). */
export function updateAircraft(game, dt) {
  for (const u of game.units) {
    if (!u.alive || !u.def.jet) continue;
    u.jet ??= { home: 0, ready: true, warned: false };
    u.jet.phase ??= u.parked ? 'park' : 'air';
    if (!game.city) {
      // ohne Stadt gibt es keinen Fliegerhorst: fliegen, bis der Treibstoff leer ist
      if (u.parked || GROUND.has(u.jet.phase)) {
        u.parked = false;
        u.jet.phase = 'air';
      }
    }
    if (u.parked) stepParked(game, u, dt);
    else if (u.jet.phase === 'taxiOut') stepTaxiOut(game, u, dt);
    else if (u.jet.phase === 'roll') stepRoll(game, u, dt);
    else if (u.jet.phase === 'rollout') stepRollout(game, u, dt);
    else if (u.jet.phase === 'taxiIn') stepTaxiIn(game, u, dt);
    else stepAirborne(game, u, dt);
    u.path = [];
    u.pathIndex = 0;
  }
}

/**
 * Befehl `{ type: 'land', ids, airportId }` (seit v5.15; seit v5.35 ist airportId ein Stellplatz): die gewählten Flugzeuge landen am
 * Fliegerhorst dieses Stellplatzes, jedes auf seinem eigenen Stellplatz, sonst einem freien Stellplatz mit Weg zur selben Bahn.
 */
export function cmdLand(game, team, cmd) {
  const e = game.getEntity(cmd.airportId);
  if (!e || e.team !== team || !isStand(game, e)) return { ok: false, reason: 'Eigenen fertigen Stellplatz wählen' };
  const route = standRoute(game, e);
  if (!route) return { ok: false, reason: 'Dieser Stellplatz hat keinen Weg zu einer Start-/Landebahn' };
  const jets = game.ownUnits(team, cmd.ids).filter((u) => u.def.jet);
  if (!jets.length) return { ok: false, reason: 'Kein Flugzeug gewählt' };
  // freie Stellplätze an derselben Bahn (der angeklickte zuerst)
  const base = standsOf(game, team).filter((s) => standRoute(game, s)?.rw.key === route.rw.key).sort((a, b) => (a === e ? -1 : b === e ? 1 : dist(a.x, a.y, e.x, e.y) - dist(b.x, b.y, e.x, e.y)));
  const taken = new Map(); // Stellplatz-ID → Zahl der Jets, die dort hinlanden sollen
  let n = 0;
  for (const u of jets) {
    const own = base.find((s) => s.id === u.jet?.home);
    const s = own ?? base.find((x) => freeSpace(game, x) - (taken.get(x.id) ?? 0) >= needOf(u));
    if (!s) continue;
    if (!own) taken.set(s.id, (taken.get(s.id) ?? 0) + needOf(u));
    u.order = { type: 'land', x: s.x, y: s.y, targetId: s.id };
    u.targetId = null;
    n++;
  }
  if (!n) return { ok: false, reason: 'Kein freier Stellplatz an diesem Fliegerhorst' };
  return { ok: true, count: n };
}

/** Zusatzprüfung der Ausbildung (game.cmdTrain): CITY.air.standJets Flugzeuge je Stellplatz. Fehlertext oder null. */
export function trainCheck(game, b, unit) {
  const def = UNITS[unit];
  if (!def?.jet) return null;
  if (!isStand(game, b)) return 'Nur ein fertiger Stellplatz baut Flugzeuge';
  const need = def.standSlots ?? 1;
  if (freeSpace(game, b) < need) return need > 1 ? `Stellplatz belegt (${def.name} braucht einen ganzen Stellplatz)` : `Stellplatz belegt (${AIR.standJets} Flugzeuge je Stellplatz)`;
  return null;
}
