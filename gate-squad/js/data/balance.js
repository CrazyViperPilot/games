// Zentrale Balancing-Konstanten und Formeln (PLAN.md §5).
// Reine Daten/Helfer, keine Seiteneffekte.

export const BAL = {
  START_SQUAD: 3,
  GATE_MAX_GAIN: 6,
  MUL_STEPS: [0.33, 0.5, 1, 2, 3],
  MUL_STEP_COST_FACTOR: 20,
  MIN_SQUAD_AFTER_GATE: 1,
  LOSS_ON_DEFEAT_COINS: 0.4,
  KEEP_ATTACHMENTS_ON_UPGRADE: 2,
  FULL_ATTACH_BONUS_SOLDIERS: 3,
  BOSS_STOP_DIST: 300, // Boss-Mitte hält so weit über der Truppenlinie (in Reichweite der MP5)
  BOSS_SHELL_TELEGRAPH: 1.4,
  BOSS_SHELL_RADIUS: 42,
  BOSS_SHELL_MAX_KILLS: 4,
  BOSS_SHELL_KILL_FRAC: 0.10,
  BOSS_CONTACT_LOSS_PER_SEC: 0.20,
  SNIPER_STOP_DIST: 290, // Scharfschützen halten in MP5-Reichweite (330) – nie unerreichbar
  MUL_MAX_SHOT_STEPS: 2,
  MUL_SHOT_MAX: 2, // durch Beschuss höchstens bis x2 (x3 gibt es nur als Level-Tor)
  GATE_PASS_DMG: 0.6, // Kugeln fliegen nach einem Tor-Treffer mit 60 % Schaden weiter
  GATE_COST_SQUAD_DIV: 12, // Tor-Punktkosten ×(1 + Truppe/12) // Multiplikator-Tore lassen sich höchstens 2 Stufen hochschießen
  MAX_SOLDIERS: 300,
  MAX_SPECS: 30, // Spezialisten inkl. RPG-Schützen
  RPG_DMG_FRAC: 0.012, // Schaden je Rakete = Anteil der Boss-Max-HP
  RPG_SPEED: 520,
  HORDE_HP: 0.6, // HP-Faktor für Horden-Gegner
  LOOT_PER_COIN: 0.12, // Münzen je Gegner-Münzwert (Horden: tausende Kills)
  BOSS_HP_SCALE: 16,
  BOSS_FIRST_SHOT: 1.0,
  BOSS_AIM_TIME: 1.1, // s Ziel-Laser vor dem Schuss
  BOSS_AIM_LOCK: 0.45, // s vor dem Schuss wird das Ziel eingefroren
  BOSS_SHELL_SPEED: 650, // Granaten-Fluggeschwindigkeit (E/s)
  BOSS_TURRET_SPEED: 1.6, // rad/s
  BOSS_BARREL: 0.75, // Rohrlänge relativ zur Boss-Höhe (ab Turm-Mitte)
  BOSS_TURRET_DY: -0.06, // Turm-Mitte relativ zur Boss-Mitte (× h)
  BOSS_VOLLEY_GAP: 0.3, // s zwischen Schüssen einer Salve
  BOSS_VOLLEY_SPREAD: 45, // seitlicher Versatz weiterer Schüsse // s nach Ankunft bis zur ersten Salve
  WAVE_COUNT_MULT: 1.4, // Wellengröße × (nicht für Scharfschützen/Fahrzeuge)
  FIREPOWER_EXP: 0.5, // Feuerkraft über MAX_SHOOTERS hinaus: Schaden/Kugel ∝ (Truppe/Schützen)^0.5 // globaler Boss-HP-Faktor (kalibriert per Bot-Durchlauf)
  AIM_CONE: 0.45, // rad: Soldaten zielen automatisch auf Gegner in diesem Kegel
  SNIPER_TELEGRAPH: 1.2,
  SNIPER_INTERVAL: 3.5,
  ENEMY_BULLET_SPEED: 420,
  FORMATION_SPACING: 11,
  GRENADE_INTERVAL: 2.5,
  GRENADE_RADIUS: 55,
  GRENADE_BASE: 60,
  GRENADE_DMG_FACTOR: 3,
  ENDLESS_START: 21,
};

// Gegner-/Kisten-HP-Multiplikator. Linear bis Level 20, danach exponentiell (Endlos).
export function hpMult(L) {
  if (L < BAL.ENDLESS_START) return 1 + 0.30 * (L - 1);
  return hpMult(BAL.ENDLESS_START - 1) * Math.pow(1.07, L - (BAL.ENDLESS_START - 1));
}

// Boss-HP. Für Endlos-Level ist baseHp = endlessBossBase(L).
export function bossHp(baseHp, L) {
  return baseHp * hpMult(L) * BAL.BOSS_HP_SCALE;
}

// Schaden pro +1 am Zahlentor.
export function gatePointCost(L) {
  return 20 + 4 * L;
}

export function weaponGateHp(L) {
  return 180 * hpMult(L);
}

export function crateHp(L) {
  return 120 * hpMult(L);
}

// Münzen für Sieg bzw. Niederlage (Niederlage = LOSS_ON_DEFEAT_COINS davon).
// loot = während des Laufs gesammelte Münzen (ENEMIES[*].coins); ohne loot zählt kills/2.
export function coinsForResult({ won, level, survivors, kills, loot }) {
  const drops = loot !== undefined ? Math.floor(loot) : kills / 2;
  let coins = 20 + 6 * level + 2 * Math.min(survivors, 60) + drops;
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
// Boss-Basis-HP für alle Level (levels.js ist mit derselben Formel erzeugt):
// bis L10 ×1.11 pro Level, danach ×1.06 (Feuerkraft der Spieler wächst später langsamer).
export function bossBase(L) {
  return 4000 * Math.pow(1.11, Math.min(L, 10) - 1) * Math.pow(1.06, Math.max(0, L - 10));
}
export function endlessBossBase(L) {
  return bossBase(L);
}

// Spezialisten-Schaden wächst mit dem Level (sie haben keine Waffenstufen).
export function specMult(L) {
  return 1 + 0.25 * (L - 1);
}
