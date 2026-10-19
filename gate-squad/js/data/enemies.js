// Gegner- und Boss-Typen (PLAN.md §4). Reine Daten.
// hp/shieldHp gelten auf Level 1; hpMult(L) wird zur Laufzeit angewandt.
// Hinweis: coins für runner/shield/sniper/apc sind Werte aus dem Balancing (nicht in §4 spezifiziert).

import { BAL } from './balance.js';

export const ENEMIES = {
  infantry: { id: 'infantry', name: 'Infanterie', hp: 30, shieldHp: 0, speed: 38, homing: 18,
    radius: 9, contact: 1, coins: 1, color: '#7d8a6a', stopY: 0 },
  runner: { id: 'runner', name: 'Läufer', hp: 16, shieldHp: 0, speed: 105, homing: 35,
    radius: 8, contact: 1, coins: 2, color: '#b5a642', stopY: 0 },
  shield: { id: 'shield', name: 'Schildträger', hp: 40, shieldHp: 110, speed: 28, homing: 12,
    radius: 11, contact: 2, coins: 2, color: '#5f6f8a', stopY: 0 },
  sniper: { id: 'sniper', name: 'Scharfschütze', hp: 40, shieldHp: 0, speed: 30, homing: 0,
    radius: 9, contact: 1, coins: 3, color: '#8a5a5a', stopY: BAL.SNIPER_STOP_DIST },
  apc: { id: 'apc', name: 'Mini-Fahrzeug', hp: 500, shieldHp: 0, speed: 22, homing: 8,
    radius: 20, contact: 4, coins: 10, color: '#6b6f3e', stopY: 0 },
};

export const BOSSES = {
  boss_apc: { id: 'boss_apc', name: 'Panzerwagen', w: 90, h: 70, speed: 40, advance: 7,
    shellInterval: 3.2, shellsPerVolley: 1, color: '#7a7f4a' },
  boss_tank: { id: 'boss_tank', name: 'Kampfpanzer', w: 110, h: 90, speed: 35, advance: 8,
    shellInterval: 2.8, shellsPerVolley: 2, color: '#5d6b4e' },
  boss_fortress: { id: 'boss_fortress', name: 'Bunkerfahrzeug', w: 150, h: 100, speed: 25, advance: 9,
    shellInterval: 2.4, shellsPerVolley: 3, color: '#4a4d44' },
};
