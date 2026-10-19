// Zentrale Balancing-Konstanten und Formeln (PLAN.md §5).
// Reine Daten/Helfer, keine Seiteneffekte.

export const BAL = {
  START_SQUAD: 3,
  GATE_MAX_GAIN: 15,
  MUL_STEPS: [0.33, 0.5, 1, 2, 3],
  MUL_STEP_COST_FACTOR: 12,
  MIN_SQUAD_AFTER_GATE: 1,
  LOSS_ON_DEFEAT_COINS: 0.3,
  KEEP_ATTACHMENTS_ON_UPGRADE: 2,
  FULL_ATTACH_BONUS_SOLDIERS: 3,
  BOSS_STOP_Y: 150,
  BOSS_SHELL_TELEGRAPH: 1.4,
  BOSS_SHELL_RADIUS: 42,
  BOSS_SHELL_MAX_KILLS: 4,
  BOSS_SHELL_KILL_FRAC: 0.10,
  BOSS_CONTACT_LOSS_PER_SEC: 0.20,
  SNIPER_STOP_Y: 150,
  SNIPER_TELEGRAPH: 1.2,
  SNIPER_INTERVAL: 3.5,
  ENEMY_BULLET_SPEED: 420,
  SQUAD_MOVE_MAX: 900,
  FORMATION_SPACING: 11,
  GRENADE_INTERVAL: 2.5,
  GRENADE_RADIUS: 55,
  GRENADE_BASE: 60,
  GRENADE_DMG_FACTOR: 3,
  ENDLESS_START: 21,
};

// Gegner-/Kisten-HP-Multiplikator. Linear bis Level 20, danach exponentiell (Endlos).
export function hpMult(L) {
  if (L < BAL.ENDLESS_START) return 1 + 0.20 * (L - 1);
  return hpMult(BAL.ENDLESS_START - 1) * Math.pow(1.07, L - (BAL.ENDLESS_START - 1));
}

// Boss-HP. Für Endlos-Level ist baseHp = endlessBossBase(L).
export function bossHp(baseHp, L) {
  return baseHp * hpMult(L);
}

// Schaden pro +1 am Zahlentor.
export function gatePointCost(L) {
  return 8 + 2.5 * L;
}

export function weaponGateHp(L) {
  return 180 * hpMult(L);
}

export function crateHp(L) {
  return 120 * hpMult(L);
}

// Münzen für Sieg bzw. Niederlage (Niederlage = LOSS_ON_DEFEAT_COINS davon).
export function coinsForResult({ won, level, survivors, kills }) {
  let coins = 20 + 6 * level + 2 * survivors + kills / 2;
  if (!won) coins *= BAL.LOSS_ON_DEFEAT_COINS;
  return Math.round(coins);
}

// Shop-Kosten: round(base * growth^currentLevel).
export function upgradeCost(upgrade, currentLevel) {
  return Math.round(upgrade.base * Math.pow(upgrade.growth, currentLevel));
}

// Truppenstärke nach Multiplikator-Tor, immer mindestens 1.
export function applyMulGate(n, v) {
  return Math.max(1, Math.round(n * v));
}

// Truppenstärke nach Additions-Tor, immer mindestens 1.
export function applyAddGate(n, v) {
  return Math.max(1, n + v);
}

// Basis-HP des Endlos-Bosses vor hpMult (PLAN.md §5: 3500·(1+0.35(L−1))/1.6).
export function endlessBossBase(L) {
  return 3500 * (1 + 0.35 * (L - 1)) / 1.6;
}
