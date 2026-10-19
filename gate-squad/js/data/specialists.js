// Spezialisten im Trupp (Kisten-Belohnungen). Reine Daten.
// Schaden skaliert zur Laufzeit mit specMult(L) (balance.js) und dem Schaden-Upgrade.
// aim: 'near' = nächster Gegner, 'tough' = Gegner mit den meisten HP (bzw. Boss), 'boss' = nur Boss.

export const SPECIALISTS = {
  rifle: { id: 'rifle', name: 'Sturmgewehr-Spezialist', short: 'AR', color: '#5aa0ff',
    damage: 24, fireRate: 7, burst: 3, range: 430, spread: 2, bulletSpeed: 1000, pierce: 0, aim: 'near',
    bulletColor: '#9cc8ff', bulletLen: 10, bulletWidth: 2.5 },
  smg: { id: 'smg', name: 'MP-Spezialist', short: 'MP', color: '#56d6c8',
    damage: 9, fireRate: 18, burst: 0, range: 250, spread: 7, bulletSpeed: 900, pierce: 0, aim: 'near',
    bulletColor: '#a8fff4', bulletLen: 7, bulletWidth: 2 },
  mg: { id: 'mg', name: 'MG-Schütze', short: 'MG', color: '#ffb347',
    damage: 15, fireRate: 13, burst: 0, range: 400, spread: 6, bulletSpeed: 1000, pierce: 1, aim: 'near',
    bulletColor: '#ffcf7a', bulletLen: 11, bulletWidth: 2.5 },
  sniper: { id: 'sniper', name: 'Scharfschütze', short: 'SNP', color: '#b6e36a',
    damage: 260, fireRate: 0.9, burst: 0, range: 720, spread: 0.3, bulletSpeed: 1600, pierce: 5, aim: 'tough',
    bulletColor: '#f4ffe0', bulletLen: 22, bulletWidth: 3 },
  demo: { id: 'demo', name: 'Sprengmeister', short: 'C4', color: '#ff6a3d',
    // wirft C4 auf nahe Gegner (Gruppe ≥ triggerCount in triggerRange oder einer < closeRange)
    damage: 170, cooldown: 2.6, triggerRange: 120, closeRange: 70, triggerCount: 3,
    radius: 72, flight: 0.45, fuse: 0.5, aim: 'near' },
  rpg: { id: 'rpg', name: 'RPG-Schütze', short: 'RPG', color: '#e04a3a',
    // nur im Bosskampf: Rakete, Schaden = Anteil der Boss-Max-HP (siehe BAL.RPG_*)
    cooldown: 2.4, rocketSpeed: 520, aim: 'boss' },
};

export const SPECIALIST_IDS = ['rifle', 'smg', 'mg', 'sniper', 'demo'];
