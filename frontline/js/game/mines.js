// Pionier-Minen (Paket E8): der Pionier legt getarnte Panzerminen (Befehl layMine, Taste Q in der Befehlskarte). Kein DOM.
// Seit E15 läuft er zuerst zur Stelle (bis BALANCE.sapper.layReach px) und legt die Mine dann (Auftrag wie `dig` des Baggers).
// Zustand: game.sapperMines [{x,y,team,owner,clear}] – eine eigene Liste, nicht game.mines (dort liegen die Minen der Forschung,
// abilities.js, die jede Bodeneinheit auslösen). Werte: BALANCE.sapper (js/data/balance.js).
// Eine Mine löst einmal aus, wenn ein gegnerisches Fahrzeug (kein Luftfahrzeug, keine Infanterie) in mineTrigger px kommt.
// Ein gegnerischer Pionier räumt sie in clearRange px nach clearTime Sekunden.
import { BALANCE } from '../data/balance.js';
import { hit } from './combat.js';
import { driveTo, setIdle } from './movement.js';

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

/**
 * { type: 'layMine', ids, x, y }: der nächste eigene Pionier mit Platz läuft zur Stelle und legt dort eine Mine (Munition aus dem
 * Teamlager, abgebucht beim Legen). Ein neuer Befehl ersetzt den laufenden Auftrag des Pioniers.
 */
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
  if (!game.payerFor(team, cmd.x, cmd.y, S.mineCost)) return fail(game.stockReason(team, cmd.x, cmd.y, S.mineCost));
  best.order = { type: 'layMine', x: cmd.x, y: cmd.y, targetId: null };
  best.targetId = null;
  best.path = [];
  best.pathIndex = 0;
  return { ok: true };
}

/** Pionier mit Befehl layMine: hinlaufen bis layReach px, dann die Mine legen (in updateMines aufgerufen). */
export function updateLayMines(game, dt) {
  for (const u of game.units) {
    if (!u.alive || u.house || u.type !== 'sapper' || u.order.type !== 'layMine') continue;
    const o = u.order;
    const r = driveTo(game, u, o.x, o.y, S.layReach, dt);
    if (r !== 'arrived') {
      const end = u.path.length > 0 && u.pathIndex >= u.path.length; // Weg des Planers zu Ende
      if (r === 'stuck' || (end && Math.hypot(u.x - o.x, u.y - o.y) > S.layNear)) {
        setIdle(u); // kein Weg, oder der Weg endet weit weg (Punkt im Gebäude): aufgeben, nicht ewig schieben
        game.message(u.team, `${u.def.name} kommt an die Stelle nicht heran`, u.x, u.y);
        continue;
      }
      if (!end) continue;
    }
    setIdle(u);
    const payer = game.payerFor(u.team, o.x, o.y, S.mineCost);
    if (!payer) {
      game.message(u.team, game.stockReason(u.team, o.x, o.y, S.mineCost), u.x, u.y);
      continue;
    }
    let n = 0;
    for (const m of game.sapperMines) if (m.owner === u.id) n++;
    if (n >= S.maxMines) {
      game.message(u.team, `${u.def.name} hat schon ${S.maxMines} Minen gelegt`, u.x, u.y);
      continue;
    }
    payer.store.mun -= S.mineCost.mun;
    game.sapperMines.push({ x: o.x, y: o.y, team: u.team, owner: u.id, clear: 0 });
  }
}

/** Ein Schritt: Pioniere legen ihre Minen; gegnerische Fahrzeuge lösen Minen aus (einmal, mit Schaden je Panzerung); gegnerische Pioniere räumen sie. */
export function updateMines(game, dt) {
  updateLayMines(game, dt);
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
