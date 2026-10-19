// bot.js – Autopilot für Tests (?autoplay=1, PLAN.md §8).
// delta(game, dt) liefert die seitliche Verschiebung (Welteinheiten) des Squads für diesen Tick.
// Stateless, keine Allokationen pro Tick außer Skalaren; nur Index-Schleifen über Arrays/Pools.

import { BAL, applyAddGate, applyMulGate } from '../data/balance.js';

const MAX_SPEED = 520;          // Welteinheiten pro Sekunde
const DEFAULT_W = 360;
const WEAPON_MAX_TIER = 6;
const GATE_FAR = 300;           // Abstand, ab dem Zahlentore als "verbesserbar" bewertet werden
const GATE_ROW_RANGE = 650;     // Tor-Reihen nur innerhalb dieser Entfernung vor dem Squad
const SHELL_DODGE_RANGE = 70;
const SHELL_DODGE_DIST = 90;
const APC_CONTACT_Y = 80;
const SNIPER_DODGE = 50;
const SNIPER_DANGER = 60;

// Erwartete Truppe nach einem Zahlentor. Weit entfernte negative add-Tore werden
// mit geschätztem Beschuss verbessert (gedeckelt durch BAL.GATE_MAX_GAIN).
function scoreNumGate(g, count, dps, squadY, scroll) {
  if (g.op === 'mul') return applyMulGate(count, g.value);
  let v = g.value;
  const dist = squadY - g.y;
  if (v < 0 && dist > GATE_FAR) {
    const t = dist / scroll;
    const pc = g.pointCost > 0 ? g.pointCost : 1;
    const gain = Math.min(BAL.GATE_MAX_GAIN, Math.floor((t * dps) / pc));
    v += gain;
  }
  return applyAddGate(count, v);
}

// Bewertung eines Waffentors: gesperrt wertlos, freigeschossen (oder bis Ankunft voraussichtlich
// freischießbar) ein Waffen-Upgrade, solange die Waffe nicht maximal ist.
function scoreWeaponGate(g, count, tier, dps, squadY, scroll) {
  let unlocked = !g.locked;
  if (!unlocked) {
    const dmgByArrival = dps * ((squadY - g.y) / scroll);
    if (g.unlockHp < dmgByArrival * 0.7) unlocked = true;
  }
  if (unlocked && tier < WEAPON_MAX_TIER) return count * 1.35 + 5;
  return count * 1.0 - 1;
}

// Wählt die nächstgelegene Tor-Reihe und darin das beste Tor (oder die freie Hälfte).
// Gibt die Ziel-X-Position (Mitte) zurück, NaN wenn keine Reihe in Sicht ist.
function pickGateTarget(game, squad, squadY, W, dps, scroll) {
  const gates = game.gates;
  if (!gates) return NaN;
  const count = squad.count;

  let rowY = -Infinity;
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    if (g.used) continue;
    if (g.y < squadY && g.y > squadY - GATE_ROW_RANGE && g.y > rowY) rowY = g.y;
  }
  if (rowY === -Infinity) return NaN;

  let bestScore = -Infinity;
  let bestX = NaN;
  let members = 0;
  let memberX = 0;
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    if (Math.abs(g.y - rowY) > 2) continue;
    members++;
    memberX = g.x;
    if (g.used) continue;
    const score = g.kind === 'weapon'
      ? scoreWeaponGate(g, count, squad.weaponTier || 0, dps, squadY, scroll)
      : scoreNumGate(g, count, dps, squadY, scroll);
    if (score > bestScore) {
      bestScore = score;
      bestX = g.x + g.w / 2;
    }
  }

  // Nur ein Tor in der Reihe: die freie Hälfte ist neutral (Wert = count).
  if (members === 1 && count > bestScore) {
    bestX = memberX < W / 2 ? W * 0.75 : W * 0.25;
  }
  return bestX;
}

// Nächste offene Kiste oberhalb des Squads (größtes y), NaN wenn keine.
function pickCrateTarget(game, squadY) {
  const crates = game.crates;
  if (!crates) return NaN;
  let bestY = -Infinity;
  let bestX = NaN;
  for (let i = 0; i < crates.length; i++) {
    const c = crates[i];
    if (!c || c.opened) continue;
    if (c.y < squadY && c.y > 0 && c.y > bestY) {
      bestY = c.y;
      bestX = c.x;
    }
  }
  return bestX;
}

// Gewichteter Schwerpunkt der Gegner oberhalb des Squads (nahe = schwerer), NaN wenn keine.
function enemyCentroid(game, squadY) {
  const pool = game.enemies;
  const items = pool && pool.items;
  if (!items) return NaN;
  let sw = 0;
  let sx = 0;
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    if (!e.active) continue;
    if (e.y >= squadY || e.y <= 0) continue;
    const w = 1 / (1 + (squadY - e.y) / 100);
    sx += e.x * w;
    sw += w;
  }
  return sw > 0 ? sx / sw : NaN;
}

export function delta(game, dt) {
  const squad = game && game.squad;
  if (!squad || !(dt > 0)) return 0;

  const W = game.W || DEFAULT_W;
  const squadY = game.SQUAD_Y;
  const scroll = Math.max(game.scroll || 0, 1);
  const squadX = squad.x;
  const squadR = squad.radius || 0;
  const st = squad.stats;
  const dps = st ? (st.damage || 0) * (st.fireRate || 0) * squad.count : 0;

  // 1a) Tor-Reihen
  let targetX = pickGateTarget(game, squad, squadY, W, dps, scroll);

  // 1b) Keine Tor-Reihe: Kiste, Boss, Gegner, Mitte
  if (Number.isNaN(targetX)) {
    targetX = pickCrateTarget(game, squadY);
    if (Number.isNaN(targetX)) {
      if (game.boss && game.boss.hp > 0) {
        targetX = game.boss.x;
      } else {
        const ex = enemyCentroid(game, squadY);
        targetX = Number.isNaN(ex) ? W / 2 : ex;
      }
    }
  }

  // 2) Ausweichen (überschreibt das Ziel)
  // 2a) Boss-Granaten: aktive Shells mit Ziel nahe am Squad
  const boss = game.boss;
  if (boss && boss.shells) {
    const shells = boss.shells;
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i];
      if (!s.active) continue;
      if (Math.abs(s.x - squadX) < SHELL_DODGE_RANGE) {
        targetX = squadX >= s.x ? s.x + SHELL_DODGE_DIST : s.x - SHELL_DODGE_DIST;
        break;
      }
    }
  }

  // 2b) Gegner-Fahrzeuge (hohe HP), die gleich Kontakt haben: seitlich ausweichen
  // 2c) Sniper im Zielen: Laserlinie meiden
  const pool = game.enemies;
  const items = pool && pool.items;
  if (items) {
    let apcDodged = false;
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) continue;
      if (!apcDodged && e.y > squadY - APC_CONTACT_Y) {
        const big = (e.def && e.def.id === 'apc') || e.hp >= 200;
        const reach = squadR + e.r;
        if (big && Math.abs(e.x - squadX) < reach) {
          targetX = squadX >= e.x ? e.x + reach + 20 : e.x - reach - 20;
          apcDodged = true;
        }
      }
      if (e.def && e.def.id === 'sniper' && e.state === 'aim' &&
          Math.abs(targetX - e.aimX) < SNIPER_DANGER) {
        targetX = squadX >= e.aimX ? targetX + SNIPER_DODGE : targetX - SNIPER_DODGE;
      }
    }
  }

  // Begrenzung auf das Spielfeld
  const lo = squadR;
  const hi = W - squadR;
  if (targetX < lo) targetX = lo;
  else if (targetX > hi) targetX = hi;

  // 3) Bewegung: maximal MAX_SPEED·dt pro Tick, kein Zittern
  let d = targetX - squadX;
  if (Math.abs(d) < 2) return 0;
  const maxStep = MAX_SPEED * dt;
  if (d > maxStep) d = maxStep;
  else if (d < -maxStep) d = -maxStep;
  return d;
}

export default { delta };
export const bot = { delta };
