// Sanitäter (Paket E1): ein unbewaffneter Soldat, der die am stärksten verletzte eigene Infanterie in seinem Umkreis heilt.
// Kein DOM. Werte stehen in js/data/units.js (UNITS.medic: heal, healRange).
import { UNITS } from '../data/units.js';

const MED = UNITS.medic;

/** Ein Schritt: jeder lebende Sanitäter am Boden heilt das verletzteste eigene Infanteriemitglied im Umkreis. */
export function updateMedics(game, dt) {
  const units = game.units;
  const r2 = MED.healRange * MED.healRange;
  for (const m of units) {
    if (!m.alive || m.type !== 'medic' || m.house) continue; // an Bord oder im Haus: heilt nicht
    let best = null;
    let bestRatio = 2;
    for (const u of units) {
      if (u === m || !u.alive || u.team !== m.team || u.house || u.def.armor !== 'inf') continue;
      if (u.hp >= u.maxHp) continue;
      const dx = u.x - m.x;
      const dy = u.y - m.y;
      if (dx * dx + dy * dy > r2) continue;
      const ratio = u.hp / u.maxHp;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = u;
      }
    }
    if (best) best.hp = Math.min(best.maxHp, best.hp + MED.heal * dt);
  }
}
