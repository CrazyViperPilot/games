// Einsatzfähigkeiten und Selbstreparatur aus der Forschung (§7): Nebelwand (V, Fahrzeuge), Minen (M, Baufahrzeuge),
// Feldwerkstatt (Bodenfahrzeuge heilen langsam). Zustand: game.smokes [{x,y,r,team,until}], game.mines [{x,y,team}],
// u.abilityCd (Sekunden bis zur nächsten Fähigkeit). Kein DOM. Die KI nutzt die Fähigkeiten nicht.
import { BALANCE } from '../data/balance.js';
import { hasTech, fxMul } from './research.js';
import { hit } from './combat.js';

const R = BALANCE.research;
const fail = (reason) => ({ ok: false, reason });
const isGroundVehicle = (u) => !u.def.air && u.def.armor !== 'inf';

/** { type: 'smoke'|'mine', ids }: jede bereite Einheit mit passender Fähigkeit legt an ihrer Stelle Rauch bzw. eine Mine. */
export function cmdAbility(game, team, cmd) {
  const smoke = cmd.type === 'smoke';
  const key = smoke ? 'smoke' : 'mines';
  if (!hasTech(game, team, key)) return fail(`${R.items[key].name} nicht erforscht`);
  const cfg = smoke ? R.smoke : R.mine;
  const units = game
    .ownUnits(team, cmd.ids)
    .filter((u) => (smoke ? isGroundVehicle(u) || u.def.air : u.type === 'engineer'));
  if (!units.length) return fail(smoke ? 'Kein Fahrzeug gewählt' : 'Kein Baufahrzeug gewählt');
  const ready = units.filter((u) => !(u.abilityCd > 0));
  if (!ready.length) return fail(`Noch nicht bereit (${Math.ceil(Math.max(...units.map((u) => u.abilityCd)))} s)`);
  const cd = cfg.cd * fxMul(game, team, 'abilityCd');
  for (const u of ready) {
    u.abilityCd = cd;
    if (smoke) game.smokes.push({ x: u.x, y: u.y, r: cfg.r, team, t0: game.time, until: game.time + cfg.life });
    else {
      const mine = game.mines.filter((m) => m.team === team);
      if (mine.length >= cfg.max) game.mines.splice(game.mines.indexOf(mine[0]), 1); // die älteste weicht
      game.mines.push({ x: u.x, y: u.y, team });
    }
  }
  return { ok: true };
}

/** Ein Schritt: Fähigkeits-Abklingzeiten, Rauch läuft ab, Minen lösen aus, Feldwerkstatt heilt. */
export function updateAbilities(game, dt) {
  if (!game.research) return;
  for (const u of game.units) if (u.alive && u.abilityCd > 0) u.abilityCd -= dt;
  game.smokes = game.smokes.filter((s) => s.until > game.time);
  const M = R.mine;
  for (let i = game.mines.length - 1; i >= 0; i--) {
    const m = game.mines[i];
    const tripped = game.units.some((u) => u.alive && u.team !== m.team && !u.def.air && !u.house && Math.hypot(u.x - m.x, u.y - m.y) <= M.trigger);
    if (!tripped) continue;
    game.mines.splice(i, 1);
    game.addEffect('explosion', m.x, m.y, m.team, m.x, m.y, 'hit');
    for (const u of game.units) {
      if (u.alive && u.team !== m.team && !u.def.air && !u.house && Math.hypot(u.x - m.x, u.y - m.y) <= M.blast) hit(game, u, M.damage);
    }
  }
  for (const team of game.teams) {
    const rate = R.items.workshop.regen;
    if (!hasTech(game, team.id, 'workshop')) continue;
    for (const u of game.units) {
      if (u.alive && u.team === team.id && isGroundVehicle(u) && u.hp < u.maxHp && game.time - u.lastHitTime > 6) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * rate * dt);
    }
  }
}
