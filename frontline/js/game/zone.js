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

  // Gewichtung: Einheiten in der Hot Zone zählen doppelt (sie liegt innerhalb der Konfliktzone)
  const hot = game.hot;
  const weight = [counts[0], counts[1]];
  if (hot) {
    for (const u of game.units) {
      if (u.alive && Math.hypot(u.x - hot.x, u.y - hot.y) <= hot.r) weight[u.team]++;
    }
  }
  z.weight = weight;

  // Mehrheit statt Alleinbesitz: das Team mit dem größeren Gewicht führt (Gleichstand: niemand)
  const contested = counts[0] > 0 && counts[1] > 0;
  const owner = weight[0] > weight[1] ? 0 : weight[1] > weight[0] ? 1 : -1;
  if (contested && !z.contested) game.message(-1, 'Konfliktzone umkämpft');
  if (owner !== z.owner && owner >= 0) {
    game.message(-1, `${BALANCE.teamNames[owner]} führt in der Konfliktzone`);
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

  // Punktebalken: füllt sich für das führende Team; wechselt die Führung, leert er sich (doppelt so schnell) und
  // färbt sich dann um. Voll = 1 Punkt für das Team des Balkens.
  const bar = z.bar;
  if (owner >= 0) {
    if (bar.team === owner || bar.team < 0) {
      bar.team = owner;
      bar.p += dt / BALANCE.pointInterval;
    } else {
      bar.p -= (2 * dt) / BALANCE.pointInterval;
      if (bar.p <= 0) {
        bar.p = 0;
        bar.team = owner;
      }
    }
  }
  if (bar.p >= 1 && bar.team >= 0) {
    bar.p -= 1;
    const team = game.teams[bar.team];
    team.points++;
    game.message(-1, `Punkt für ${BALANCE.teamNames[bar.team]}`);
    if (team.points >= game.winPoints) game.endGame(bar.team, 'points');
  }
}
