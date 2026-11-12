// Pionier-Minen (Paket E8): der Pionier legt getarnte Panzerminen (Befehl layMine, Taste Q in der Befehlskarte). Kein DOM.
// Zustand: game.sapperMines [{x,y,team,owner,clear}] – eine eigene Liste, nicht game.mines (dort liegen die Minen der Forschung,
// abilities.js, die jede Bodeneinheit auslösen). Werte: BALANCE.sapper (js/data/balance.js).
// Eine Mine löst einmal aus, wenn ein gegnerisches Fahrzeug (kein Luftfahrzeug, keine Infanterie) in mineTrigger px kommt.
// Ein gegnerischer Pionier räumt sie in clearRange px nach clearTime Sekunden.
import { BALANCE } from '../data/balance.js';
import { hit } from './combat.js';

const S = BALANCE.sapper;
const fail = (reason) => ({ ok: false, reason });
const isVehicle = (u) => !u.def.air && u.def.armor !== 'inf';

/** Startzustand: keine Minen. */
export function createMines(game) {
  game.sapperMines = [];
}

/**
 * Sieht `team` die Mine m? Eigene immer. Gegnerische: innerhalb spotNear px eines eigenen Pioniers oder innerhalb spotAny px
 * irgendeiner eigenen Einheit (außer in Häusern).
 */
export function mineVisible(game, team, m) {
  if (m.team === team) return true;
  const near2 = S.spotNear * S.spotNear;
  const any2 = S.spotAny * S.spotAny;
  for (const u of game.units) {
    if (!u.alive || u.team !== team || u.house) continue;
    const dx = u.x - m.x;
    const dy = u.y - m.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= any2) return true;
    if (u.type === 'sapper' && d2 <= near2) return true;
  }
  return false;
}

/** { type: 'layMine', ids, x, y }: der nächste eigene Pionier mit Platz legt an der Stelle eine Mine (Munition aus dem Teamlager). */
export function cmdLayMine(game, team, cmd) {
  const sappers = game.ownUnits(team, cmd.ids).filter((u) => u.type === 'sapper' && u.alive && !u.house);
  if (!sappers.length) return fail('Kein Pionier gewählt');
  if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) return fail('Kein Punkt gewählt');
  let best = null;
  let bestD2 = Infinity;
  for (const u of sappers) {
    let n = 0;
    for (const m of game.sapperMines) if (m.owner === u.id) n++;
    if (n >= S.maxMines) continue;
    const dx = u.x - cmd.x;
    const dy = u.y - cmd.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = u;
    }
  }
  if (!best) return fail(`Jeder Pionier hat schon ${S.maxMines} Minen gelegt`);
  const payer = game.payerFor(team, cmd.x, cmd.y, S.mineCost);
  if (!payer) return fail(game.stockReason(team, cmd.x, cmd.y, S.mineCost));
  payer.store.mun -= S.mineCost.mun;
  game.sapperMines.push({ x: cmd.x, y: cmd.y, team, owner: best.id, clear: 0 });
  return { ok: true };
}

/** Ein Schritt: gegnerische Fahrzeuge lösen Minen aus (einmal, mit Schaden je Panzerung); gegnerische Pioniere räumen sie. */
export function updateMines(game, dt) {
  const list = game.sapperMines;
  if (!list || !list.length) return;
  const units = game.units;
  const trig2 = S.mineTrigger * S.mineTrigger;
  const clear2 = S.clearRange * S.clearRange;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    let tripped = null;
    let clearing = false;
    for (const u of units) {
      if (!u.alive || u.team === m.team || u.house) continue;
      const dx = u.x - m.x;
      const dy = u.y - m.y;
      const d2 = dx * dx + dy * dy;
      if (u.type === 'sapper' && d2 <= clear2) clearing = true;
      if (!tripped && isVehicle(u) && d2 <= trig2) tripped = u;
    }
    if (tripped) {
      list.splice(i, 1);
      game.addEffect('explosion', m.x, m.y, m.team, m.x, m.y, 'hit');
      hit(game, tripped, S.mineDamage[tripped.def.armor] ?? S.mineDamage.light);
      continue;
    }
    m.clear = clearing ? m.clear + dt : 0;
    if (m.clear >= S.clearTime) list.splice(i, 1);
  }
}
