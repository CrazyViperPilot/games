// Wirtschaft: Bau, Produktion und Einkommen (PLAN.md §5). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { planPath, setIdle } from './movement.js';

const RES_KEYS = ['money', 'bm', 'mun', 'fuel'];
const BUILD_HP_SHARE = 0.9; // Baustellen-HP wächst um 90 % über die Bauzeit (Start 10 %)
const INCOME_TAU = 2; // Glättungszeitkonstante des angezeigten Einkommens (s)

const zeroRes = () => ({ money: 0, bm: 0, mun: 0, fuel: 0 });

/** Freie Stelle unterhalb des Gebäudes (1–2 Zellen Abstand, zuerst die Zeile direkt darunter). */
function spawnSpot(game, b) {
  const g = game.grid;
  for (let r = b.cy + b.h; r <= b.cy + b.h + 2; r++) {
    for (let c = b.cx - 1; c <= b.cx + b.w; c++) {
      if (g.passable(c, r, b.team)) return { x: g.center(c), y: g.center(r) };
    }
  }
  return null;
}

/**
 * Bau, Produktion und Einkommen eines Schritts.
 * `team.rate` = momentane Rate je Sekunde (zone.js ergänzt Zonengeld), `team.income` wird in smoothIncome geglättet.
 */
export function updateEconomy(game, dt) {
  for (const team of game.teams) team.rate = zeroRes();

  // Baustellen
  for (const b of game.buildings) {
    if (!b.alive || b.built) continue;
    b.progress += dt / b.def.buildTime;
    b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * BUILD_HP_SHARE * dt) / b.def.buildTime);
    if (b.progress >= 1) {
      b.progress = 1;
      b.built = true;
      b.hp = b.maxHp;
      game.message(b.team, `${b.def.name} fertig`, b.x, b.y);
    }
  }

  // Produktion (nur fertige Gebäude): erster Eintrag der Warteschlange
  for (const b of game.buildings) {
    if (!b.alive || !b.built || b.queue.length === 0) continue;
    b.queueTime += dt;
    const type = b.queue[0];
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

  // Einkommen aus fertigen FOBs und Förderanlagen
  for (const b of game.buildings) {
    if (!b.alive || !b.built) continue;
    const team = game.teams[b.team];
    const mult = team.incomeMult;
    if (b.type === 'fob') {
      team.rate.money += BALANCE.fob.income * mult;
    } else if (b.nodeId !== null) {
      const node = game.nodeById.get(b.nodeId);
      if (node) team.rate[node.type] += (b.def.yields[node.type] || 0) * mult;
    }
  }
  for (const team of game.teams) {
    for (const k of RES_KEYS) team.res[k] += team.rate[k] * dt;
  }
}

/** Glättet das angezeigte Einkommen (team.income) gegen die momentane Rate. Nach Zone aufrufen. */
export function smoothIncome(game, dt) {
  const a = 1 - Math.exp(-dt / INCOME_TAU);
  for (const team of game.teams) {
    for (const k of RES_KEYS) team.income[k] += (team.rate[k] - team.income[k]) * a;
  }
}
