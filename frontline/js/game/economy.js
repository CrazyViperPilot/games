// Wirtschaft: Produktion in der Haupt-FOB und Geldrate (PLAN.md §5, §11.1). Geld kommt nur aus Zone und Hot Zone. Kein DOM.
// Baufortschritt: construction.js. Nachfüllen und LKW: logistics.js.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';
import { planPath, setIdle } from './movement.js';

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
 * `team.rate` = momentane Rate je Sekunde: Nachfüllen aus Lagern (`team.flow`, von logistics.js) als Abfluss;
 * zone.js ergänzt das Zonengeld in `team.res.money`.
 */
export function updateEconomy(game, dt) {
  for (const team of game.teams) {
    team.rate = zeroRes();
    for (const k of STOCK_KEYS) team.rate[k] = -team.flow[k];
  }

  // Produktion (nur fertige Gebäude): die ersten trainSlots Einträge der Warteschlange bilden gleichzeitig aus,
  // jeder mit eigenem Fortschritt (b.queueTimes[i], parallel zu b.queue)
  for (const b of game.buildings) {
    if (!b.alive || !b.built || b.queue.length === 0) continue;
    const slots = Math.min(BALANCE.trainSlots, b.queue.length);
    for (let i = 0; i < slots; i++) b.queueTimes[i] += dt;
    for (let i = 0; i < slots && i < b.queue.length; ) {
      const type = b.queue[i].unit;
      const ut = UNITS[type];
      if (b.queueTimes[i] < ut.buildTime) {
        i++;
        continue;
      }
      const spot = spawnSpot(game, b);
      if (!spot) {
        i++; // alle Felder blockiert, warten
        continue;
      }
      b.queue.splice(i, 1);
      b.queueTimes.splice(i, 1);
      const u = game.spawnUnit(type, b.team, spot.x, spot.y);
      u.order = { type: 'move', x: b.rallyX, y: b.rallyY, targetId: null };
      planPath(game, u, b.rallyX, b.rallyY);
      if (u.path.length === 0) setIdle(u);
      game.message(b.team, `${ut.name} bereit`, spot.x, spot.y);
    }
  }

  // Soldaten-Nachschub (§12): kostenlos, unabhängig von Warteschlange und Ausbildungsplätzen
  for (const team of game.teams) updateReinforce(game, team, dt);

  // Haupt-FOB: unendlicher Vorrat (das Lager wird immer wieder aufgefüllt; Laden und Nachfüllen haben ihre Raten)
  for (const b of game.buildings) {
    if (!b.alive || !b.infinite) continue;
    for (const k of STOCK_KEYS) b.store[k] = BALANCE.logistics.storeCap;
  }
  for (const team of game.teams) team.res.money += team.rate.money * dt;
}

/**
 * Nachschub eines Teams: zählt nur, solange eine lebende fertige Haupt-FOB steht, zu wenig Soldaten
 * (< soldierMin) und das Einheitenlimit nicht erreicht ist. Bei `interval` s erscheint ein Schütze an der
 * Haupt-FOB. Ist kein Feld frei, bleibt der Timer stehen (nächster Schritt). Sonst Timer = 0.
 */
function updateReinforce(game, team, dt) {
  const R = BALANCE.reinforce;
  const b = game.mainFob(team.id);
  if (!b || !b.built || game.soldierCount(team.id) >= R.soldierMin || game.unitCount(team.id) >= BALANCE.unitCap) {
    team.reinforceTimer = 0;
    return;
  }
  team.reinforceTimer += dt;
  if (team.reinforceTimer < R.interval) return;
  const spot = spawnSpot(game, b);
  if (!spot) return; // alle Felder blockiert: Timer bleibt stehen
  team.reinforceTimer = 0;
  const u = game.spawnUnit(R.unit, b.team, spot.x, spot.y);
  u.order = { type: 'move', x: b.rallyX, y: b.rallyY, targetId: null };
  planPath(game, u, b.rallyX, b.rallyY);
  if (u.path.length === 0) setIdle(u);
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
