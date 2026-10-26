// Kommandeur (nach dem Strategen-Helden aus Empire Earth und dem Königsmord-Modus aus Age of Empires II): eine einmalige Einheit je
// Team mit Aura. Eigene Einheiten in ihrem Umkreis schießen schneller (u.aura), verletzte Infanterie heilt dort, sobald sie eine Weile
// nicht getroffen wurde. Fällt der Kommandeur, bekommt der Gegner Punkte; die Haupt-FOB kann einen neuen ausbilden.
import { BALANCE } from '../data/balance.js';
import { UNITS } from '../data/units.js';

const C = BALANCE.commander;

/** Hat das Team einen Kommandeur (lebend, als Passagier an Bord oder in Ausbildung)? */
export function hasCommander(game, team) {
  for (const u of game.units) {
    if (!u.alive || u.team !== team) continue;
    if (u.def.hero || u.passengers.some((p) => p.def.hero)) return true;
  }
  return game.buildings.some((b) => b.alive && b.team === team && b.queue.some((e) => UNITS[e.unit].hero));
}

/** Aura je Schritt (vor dem Kampf): setzt u.aura für alle Einheiten und heilt die Infanterie im Umkreis eines Kommandeurs. */
export function updateCommanders(game, dt) {
  const heroes = [];
  for (const u of game.units) {
    u.aura = false;
    if (u.alive && u.def.hero) heroes.push(u);
  }
  const r2 = C.aura * C.aura;
  for (const h of heroes) {
    for (const u of game.units) {
      if (!u.alive || u.team !== h.team) continue;
      const dx = u.x - h.x;
      const dy = u.y - h.y;
      if (dx * dx + dy * dy > r2) continue;
      u.aura = true;
      if (u.def.armor === 'inf' && u.hp < u.maxHp && game.time - u.lastHitTime >= C.healDelay) u.hp = Math.min(u.maxHp, u.hp + C.heal * dt);
    }
  }
}

/** Abklingzeit einer Waffe: in der Aura um fireRate kürzer. */
export const auraCooldown = (u, cooldown) => (u.aura ? cooldown / C.fireRate : cooldown);

/** Ein Kommandeur ist gefallen: Punkte für den Gegner (kann die Partie entscheiden), Meldung an beide. */
export function commanderFallen(game, u) {
  const foe = 1 - u.team;
  const team = game.teams[foe];
  if (!team) return;
  team.points += C.deathPoints;
  game.message(u.team, 'Unser Kommandeur ist gefallen', u.x, u.y);
  game.message(foe, `Gegnerischer Kommandeur gefallen: +${C.deathPoints} Punkte`, u.x, u.y);
  if (game.winner === null && team.points >= game.winPoints) game.endGame(foe, 'points');
}
