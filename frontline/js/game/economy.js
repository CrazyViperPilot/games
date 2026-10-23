// Wirtschaft: Produktion, Einkommen und Förderung in FOB-Lager (PLAN.md §5, §11.1). Kein DOM.
// Baufortschritt: construction.js. Nachfüllen und LKW: logistics.js.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { planPath, setIdle } from './movement.js';
import { isInfinite } from './entities.js';

const STOCK_KEYS = ['bm', 'mun', 'fuel'];
const INCOME_TAU = 2; // Glättungszeitkonstante des angezeigten Einkommens (s)

const zeroRes = () => ({ money: 0, bm: 0, mun: 0, fuel: 0 });

/**
 * Freie Stelle am Rand des Gebäudes (1–3 Zellen Abstand), die dem Sammelpunkt am nächsten liegt.
 * (Früher fest „unterhalb“: Das ist bei punktsymmetrischen Startlagen unfair – Team 0 spawnte zum Kartenrand hin.)
 */
function spawnSpot(game, b) {
  const g = game.grid;
  let best = null;
  let bestD = Infinity;
  for (let ring = 1; ring <= 3 && !best; ring++) {
    for (let r = b.cy - ring; r < b.cy + b.h + ring; r++) {
      for (let c = b.cx - ring; c < b.cx + b.w + ring; c++) {
        const inside = c >= b.cx && c < b.cx + b.w && r >= b.cy && r < b.cy + b.h;
        if (inside || !g.passable(c, r, b.team)) continue;
        const x = g.center(c);
        const y = g.center(r);
        const d = Math.hypot(x - b.rallyX, y - b.rallyY);
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
  }
  return best;
}

/**
 * Produktion und Einkommen eines Schritts.
 * `team.rate` = momentane Rate je Sekunde: Förderung (+) minus Nachfüllen aus Lagern (`team.flow`, von logistics.js);
 * zone.js ergänzt Zonengeld. Geld fließt in `team.res.money`, Förderung direkt in das Lager des Versorgers.
 */
export function updateEconomy(game, dt) {
  for (const team of game.teams) {
    team.rate = zeroRes();
    for (const k of STOCK_KEYS) team.rate[k] = -team.flow[k];
  }

  // Produktion (nur fertige Gebäude): erster Eintrag der Warteschlange
  for (const b of game.buildings) {
    if (!b.alive || !b.built || b.queue.length === 0) continue;
    b.queueTime += dt;
    const entry = b.queue[0];
    const type = entry.unit;
    const ut = UNITS[type];
    if (b.queueTime < ut.buildTime) continue;
    const spot = spawnSpot(game, b);
    if (!spot) continue; // alle Felder blockiert, warten
    b.queue.shift();
    b.queueTime = 0;
    const u = game.spawnUnit(type, b.team, spot.x, spot.y);
    u.order = { type: 'move', x: b.rallyX, y: b.rallyY, targetId: null };
    planPath(game, u, b.rallyX, b.rallyY);
    if (u.path.length === 0) setIdle(u);
    game.message(b.team, `${ut.name} bereit`, spot.x, spot.y);
  }

  // Einkommen: FOBs und HQ (Geld) und Förderanlagen (Sorte des Vorkommens, in das Lager ihres Versorgers)
  for (const b of game.buildings) {
    if (!b.alive || !b.built) continue;
    const team = game.teams[b.team];
    const mult = team.incomeMult;
    if (b.type === 'fob') {
      team.rate.money += BALANCE.fob.income * mult;
      continue;
    }
    if (b.type === 'hq') {
      team.rate.money += BALANCE.hq.income * mult;
      continue;
    }
    if (b.nodeId === null) continue;
    const node = game.nodeById.get(b.nodeId);
    if (!node) continue;
    const sup = game.supplierOf(b);
    if (!sup) {
      game.notify(b.team, 'noFob', 'Förderanlage ohne FOB', BALANCE.logistics.noFobWarn);
      continue;
    }
    if (isInfinite(sup)) continue; // Versorger ist das HQ: die Förderung wäre wirkungslos
    const amount = (b.def.yields[node.type] || 0) * mult;
    team.rate[node.type] += amount;
    const cap = BALANCE.logistics.storeCap;
    sup.store[node.type] = Math.min(cap, sup.store[node.type] + amount * dt);
  }
  for (const team of game.teams) team.res.money += team.rate.money * dt;
}

/** Glättet das angezeigte Einkommen (team.income) gegen die momentane Rate. Nach Zone aufrufen. */
export function smoothIncome(game, dt) {
  const a = 1 - Math.exp(-dt / INCOME_TAU);
  for (const team of game.teams) {
    for (const k of ['money', ...STOCK_KEYS]) {
      team.income[k] += (team.rate[k] - team.income[k]) * a;
    }
  }
}
