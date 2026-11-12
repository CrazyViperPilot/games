// Kamikazedrohne (Paket E11, `fpv`): fliegt im Angriffsbefehl auf ein gegnerisches Fahrzeug oder Gebäude. Ist sie dem Ziel nah genug
// (≤ 20 px vom Trefferkreis des Ziels), explodiert sie: Flächenschaden über die Einschlagfunktion der Granaten (combat.js impact),
// die Drohne ist danach tot (hp = 0). Werte stehen in js/data/units.js (UNITS.fpv, Feld blast). Kein DOM.
import { UNITS } from '../data/units.js';
import { impact } from './combat.js';
import { isFoe, radiusOf } from './entities.js';

const FPV = UNITS.fpv;
const BLAST_DIST = 20; // px vom Rand des Ziels, ab dem die Drohne explodiert

/** Ein Schritt: jede lebende Kamikazedrohne im Angriffsbefehl prüft ihr Ziel und explodiert bei Kontakt. */
export function updateFpv(game, dt) {
  for (const u of game.units) {
    if (!u.alive || u.type !== 'fpv' || u.house || u.order?.type !== 'attack' || !u.targetId) continue;
    const t = game.getEntity(u.targetId);
    if (!t || !t.alive || !isFoe(u.team, t) || t.def?.air) continue; // Luftziele und Abgeschossene nicht
    const d = Math.hypot(t.x - u.x, t.y - u.y) - radiusOf(t);
    if (d > BLAST_DIST) continue;
    impact(game, { team: u.team, tx: u.x, ty: u.y, damage: FPV.blast.damage, splash: FPV.blast.splash });
    u.hp = 0;
    u.alive = false;
  }
}
