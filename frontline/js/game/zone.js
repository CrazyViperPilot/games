// Konfliktzone: Kontrolle, Geld, Punkte und Siegprüfung (PLAN.md §5, game/zone.js). Kein DOM.
import { BALANCE } from '../data/balance.js';

const Z = BALANCE.zone;

/** Ein Schritt: Zählung der Einheiten in der Zone, Kontrolle, Zonengeld und Punkte. */
export function updateZone(game, dt) {
  const z = game.zone;
  const counts = [0, 0];
  for (const u of game.units) {
    if (u.alive && Math.hypot(u.x - z.x, u.y - z.y) <= z.r) counts[u.team]++;
  }
  z.counts = counts;

  const contested = counts[0] > 0 && counts[1] > 0;
  let owner = -1;
  if (!contested) {
    if (counts[0] > 0) owner = 0;
    else if (counts[1] > 0) owner = 1;
  }
  if (contested && !z.contested) game.message(-1, 'Konfliktzone umkämpft');
  if (owner !== z.owner && owner >= 0) {
    game.message(-1, `${BALANCE.teamNames[owner]} kontrolliert die Konfliktzone`);
  }
  z.owner = owner;
  z.contested = contested;

  // Geld: Kontrolle (nur Besitzer) plus je Einheit in der Zone (alle Teams, max. unitIncomeCap gezählt)
  for (let t = 0; t < game.teams.length; t++) {
    const team = game.teams[t];
    let perSec = Math.min(counts[t], Z.unitIncomeCap) * Z.unitIncome * team.incomeMult;
    if (owner === t) perSec += Z.controlIncome * team.incomeMult;
    if (perSec > 0) {
      team.rate.money += perSec;
      team.res.money += perSec * dt;
    }
  }

  if (owner < 0) return;
  const team = game.teams[owner];
  team.pointProgress += dt;
  while (team.pointProgress >= BALANCE.pointInterval) {
    team.pointProgress -= BALANCE.pointInterval;
    team.points++;
    game.message(-1, `Punkt für ${BALANCE.teamNames[owner]}`);
  }
  if (team.points >= game.winPoints) game.endGame(owner, 'points');
}
