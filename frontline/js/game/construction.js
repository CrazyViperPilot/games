// Bau und Reparatur: Bauer fahren, Baufortschritt, automatische Zuweisung (PLAN.md §11.8). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { BUILDINGS } from '../data/buildings.js';
import { driveTo, footDist, setIdle } from './movement.js';

const C = BALANCE.construction;
const BUILD_HP_SHARE = 0.9; // Baustellen-HP wächst um 90 % über die Bauzeit (Start 10 %)
const WARN = BALANCE.shortageWarn;

const fail = (reason) => ({ ok: false, reason });

/** Darf eine Einheit (Definition `def`) das Gebäude `type` bauen? 'all' = Baufahrzeug, 'fort' = Mauer/Tor. */
export function canBuild(def, type) {
  if (def.builder === 'all') return true;
  if (def.builder === 'fort') {
    const bd = BUILDINGS[type];
    return !!bd && !!(bd.blocksAll || bd.gate);
  }
  return false;
}

/** Bauauftrag: Einheit fährt zur Baustelle `site`; `more` = weitere Baustellen der Reihe nach. */
export function orderBuild(u, site, more = []) {
  u.order = { type: 'build', x: site.x, y: site.y, targetId: site.id, more };
  u.targetId = null;
  u.path = [];
  u.pathIndex = 0;
}

/** Mauerlinie: Bauer i bekommt Baustelle i, danach jede n-te weitere der Reihe nach. */
export function orderBuildSeq(builders, sites) {
  const n = builders.length;
  builders.forEach((u, i) => {
    const first = sites[i];
    if (!first) return;
    const more = [];
    for (let j = n + i; j < sites.length; j += n) more.push(sites[j].id);
    orderBuild(u, first, more);
  });
}

function orderRepair(u, b) {
  u.order = { type: 'repair', x: b.x, y: b.y, targetId: b.id };
  u.targetId = null;
  u.path = [];
  u.pathIndex = 0;
}

/** Befehl `repair`: Baufahrzeuge reparieren ein fertiges eigenes Gebäude. */
export function cmdRepair(game, team, cmd) {
  const b = game.getEntity(cmd.targetId);
  if (!b || b.kind !== 'building' || b.team !== team || !b.built) return fail('Ziel ungültig');
  if (b.hp >= b.maxHp) return fail('Nichts zu reparieren');
  const units = game.ownUnits(team, cmd.ids).filter((u) => u.def.builder === 'all');
  if (!units.length) return fail('Nur Baufahrzeuge reparieren');
  for (const u of units) orderRepair(u, b);
  return { ok: true, count: units.length };
}

/** Meldung je Baustelle höchstens alle `shortageWarn` s. */
function warnSite(game, b, text) {
  if (game.time - b.warnTime < WARN) return;
  b.warnTime = game.time;
  game.message(b.team, text, b.x, b.y);
}

/** Nächste noch nicht fertige Baustelle aus der Liste eines Bauauftrags (entfernt sie aus der Liste). */
function nextSite(game, o) {
  while (o.more && o.more.length) {
    const s = game.getEntity(o.more.shift());
    if (s && !s.built) return s;
  }
  return null;
}

/** Bauer fährt zur Baustelle und steht dort; fertige/tote Baustelle → nächste aus der Liste oder idle. */
function stepBuilder(game, u, dt) {
  const o = u.order;
  const b = game.getEntity(o.targetId);
  if (!b || b.built || !canBuild(u.def, b.type)) {
    const next = nextSite(game, o);
    if (next) {
      o.targetId = next.id;
      u.path = [];
      u.pathIndex = 0;
    } else {
      setIdle(u);
    }
    return;
  }
  if (driveTo(game, u, b.x, b.y, C.standRange, dt, b) === 'stuck') setIdle(u);
}

/** Baufahrzeug fährt zum beschädigten Gebäude und repariert (2 % maxHp/s, Kosten aus dem Lager in Reichweite). */
function stepRepairer(game, u, dt) {
  const b = game.getEntity(u.order.targetId);
  if (!b || !b.built || b.hp >= b.maxHp) {
    setIdle(u);
    return;
  }
  const st = driveTo(game, u, b.x, b.y, C.standRange, dt, b);
  if (st === 'stuck') {
    setIdle(u);
    return;
  }
  if (st !== 'arrived') return;
  const heal = Math.min(b.maxHp - b.hp, b.maxHp * C.repairRate * dt);
  const costBm = b.def.cost.bm * (heal / b.maxHp) * C.repairCostShare;
  const payer = game.payerFor(u.team, b.x, b.y, { bm: costBm });
  if (!payer) {
    game.notify(u.team, 'rep', 'Reparatur: kein FOB-Lager in Reichweite', WARN, b.x, b.y);
    setIdle(u);
    return;
  }
  payer.store.bm -= costBm;
  b.hp += heal;
}

/**
 * Automatische Zuweisung (alle assignInterval s): idle Bauer → nächste Baustelle im Umkreis
 * (höchstens maxBuilders je Baustelle); idle Baufahrzeug ohne Baustelle → nächstes beschädigtes Gebäude.
 * Einheiten mit Ziel (Gefecht) bleiben unberührt.
 */
function autoAssign(game) {
  // FOB-Baustellen ohne Material ziehen keine Bauer an (sie würden dort ewig warten)
  const sites = game.buildings.filter((b) => b.alive && !b.built && (b.type !== 'fob' || b.supplied || b.store.bm >= C.fobMaterial));
  const damaged = game.buildings.filter((b) => b.alive && b.built && b.hp < b.maxHp);
  const assigned = new Map();
  for (const u of game.units) {
    if (u.alive && u.order.type === 'build') assigned.set(u.order.targetId, (assigned.get(u.order.targetId) || 0) + 1);
  }
  for (const u of game.units) {
    if (!u.alive || u.order.type !== 'idle' || u.targetId !== null || !u.def.builder || u.house) continue;
    let best = null;
    let bestD = C.autoHelpRange;
    for (const s of sites) {
      if (!canBuild(u.def, s.type) || (assigned.get(s.id) || 0) >= C.maxBuilders) continue;
      const d = footDist(u.x, u.y, s);
      if (d <= bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) {
      orderBuild(u, best);
      assigned.set(best.id, (assigned.get(best.id) || 0) + 1);
      continue;
    }
    if (u.def.builder !== 'all') continue;
    let rep = null;
    let repD = C.autoRepairRange;
    for (const b of damaged) {
      const d = footDist(u.x, u.y, b);
      if (d <= repD) {
        rep = b;
        repD = d;
      }
    }
    if (rep) orderRepair(u, rep);
  }
}

/** Bauer, die jetzt an der Baustelle arbeiten (Auftrag build oder idle in der Nähe), höchstens maxBuilders. */
function countBuilders(game, b) {
  let n = 0;
  for (const u of game.units) {
    if (!u.alive || u.house || !canBuild(u.def, b.type)) continue;
    const o = u.order.type;
    if (o === 'build' ? u.order.targetId !== b.id : o !== 'idle') continue;
    if (footDist(u.x, u.y, b) > C.helperRange) continue;
    if (++n >= C.maxBuilders) break;
  }
  return n;
}

/**
 * Baufortschritt einer Baustelle: nur mit Bauer in Reichweite (≤ helperRange vom Gebäuderand, Auftrag
 * oder idle), höchstens maxBuilders. Die FOB-Baustelle verbraucht ihre 400 Baumaterial erst, wenn gebaut wird.
 */
function progressSite(game, b, dt) {
  const n = countBuilders(game, b);
  if (b.type === 'fob' && !b.supplied && b.store.bm < C.fobMaterial) {
    warnSite(game, b, 'Baustelle wartet auf Material');
    return;
  }
  if (n === 0) {
    warnSite(game, b, 'Baustelle wartet auf Bauer');
    return;
  }
  if (b.type === 'fob' && !b.supplied) {
    b.store.bm -= C.fobMaterial;
    b.supplied = true;
  }
  const f = (n * dt) / b.def.buildTime;
  b.progress += f;
  b.hp = Math.min(b.maxHp, b.hp + b.maxHp * BUILD_HP_SHARE * f);
  if (b.progress >= 1) {
    b.progress = 1;
    b.built = true;
    b.hp = b.maxHp;
    game.message(b.team, `${b.def.name} fertig`, b.x, b.y);
    // Mauern und Tore bringen kein Geld (sonst Geld aus Mauerbau)
    if (b.type !== 'wall' && b.type !== 'gate') game.reward(b.team, Math.round((b.def.cost.bm || 0) * BALANCE.bounty.built), `${b.def.name} gebaut`);
  }
}

/** Ein Bau-Schritt: Bauer und Reparateure fahren und arbeiten, Zuweisung, Baufortschritt. Nach Bewegung aufrufen. */
export function updateConstruction(game, dt) {
  for (const u of game.units) {
    if (!u.alive) continue;
    if (u.order.type === 'build') stepBuilder(game, u, dt);
    else if (u.order.type === 'repair') stepRepairer(game, u, dt);
  }
  game.consTimer -= dt;
  if (game.consTimer <= 0) {
    game.consTimer = C.assignInterval;
    autoAssign(game);
  }
  for (const b of game.buildings) {
    if (b.alive && !b.built) progressSite(game, b, dt);
  }
}
