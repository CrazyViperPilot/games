// Bergepanzer (Paket E7): unbewaffnetes Fahrzeug, das eigene Fahrzeuge im Umkreis repariert. Baumaterial kommt aus dem Teamlager
// (game.payerFor, wie bei der Reparatur des Baufahrzeugs). Untätig fährt er zum nächsten beschädigten eigenen Fahrzeug in pickupRange.
// Kein DOM. Werte stehen in js/data/units.js (UNITS.recovery).
import { UNITS } from '../data/units.js';
import { driveTo } from './movement.js';

const REC = UNITS.recovery;

/** Luftfahrzeuge und Infanterie werden nicht repariert. */
function isVehicle(u) {
  return !u.def.air && u.def.armor !== 'inf';
}

/** Ein Schritt: jeder lebende Bergepanzer am Boden repariert eigene Fahrzeuge im Umkreis; ohne Reparatur fährt er zum nächsten beschädigten. */
export function updateRecovery(game, dt) {
  const units = game.units;
  const rr2 = REC.repairRange * REC.repairRange;
  const pr2 = REC.pickupRange * REC.pickupRange;
  for (const r of units) {
    if (!r.alive || r.type !== 'recovery' || r.house) continue; // an Bord oder im Haus: repariert nicht
    let healed = false;
    for (const u of units) {
      if (u === r || !u.alive || u.team !== r.team || u.house || !isVehicle(u) || u.hp >= u.maxHp) continue;
      const dx = u.x - r.x;
      const dy = u.y - r.y;
      if (dx * dx + dy * dy > rr2) continue;
      const heal = Math.min(u.maxHp - u.hp, REC.repairRate * dt);
      const costBm = u.def.cost.money * (heal / u.maxHp) * REC.repairCostShare;
      const payer = game.payerFor(r.team, r.x, r.y, { bm: costBm });
      if (!payer) continue; // kein Baumaterial in Reichweite: keine Reparatur
      payer.store.bm -= costBm;
      u.hp += heal;
      healed = true;
    }
    if (healed || r.order?.type !== 'idle') continue;
    // untätig: zum nächsten beschädigten eigenen Fahrzeug im Umkreis fahren
    let best = null;
    let bestD2 = pr2;
    for (const u of units) {
      if (u === r || !u.alive || u.team !== r.team || u.house || !isVehicle(u) || u.hp >= u.maxHp) continue;
      const dx = u.x - r.x;
      const dy = u.y - r.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = u;
      }
    }
    if (best) driveTo(game, r, best.x, best.y, REC.repairRange * 0.7, dt);
  }
}
