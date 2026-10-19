// Waffen nach Tier (PLAN.md §4). Reine Daten + Helfer.

export const MAX_TIER = 6;

export const WEAPONS = [
  { id: 'mp5', name: 'MP5', tier: 0, damage: 10, fireRate: 6.0, range: 330, bulletSpeed: 850,
    spread: 5, pierce: 0, bulletLen: 8, bulletWidth: 2, color: '#fff1a8',
    sound: { type: 'smg', freq: 900, decay: 0.05, noise: 0.6 } },
  { id: 'ump45', name: 'UMP-45', tier: 1, damage: 15, fireRate: 5.5, range: 350, bulletSpeed: 880,
    spread: 4.5, pierce: 0, bulletLen: 9, bulletWidth: 2, color: '#ffd23f',
    sound: { type: 'smg', freq: 820, decay: 0.05, noise: 0.6 } },
  { id: 'g36', name: 'G36', tier: 2, damage: 18, fireRate: 6.5, range: 420, bulletSpeed: 910,
    spread: 4, pierce: 0, bulletLen: 10, bulletWidth: 2, color: '#ffb000',
    sound: { type: 'rifle', freq: 700, decay: 0.07, noise: 0.5 } },
  { id: 'm4a1', name: 'M4A1', tier: 3, damage: 20, fireRate: 8.0, range: 440, bulletSpeed: 950,
    spread: 3, pierce: 0, bulletLen: 11, bulletWidth: 2.5, color: '#ff9020',
    sound: { type: 'rifle', freq: 760, decay: 0.06, noise: 0.5 } },
  { id: 'scarh', name: 'SCAR-H', tier: 4, damage: 38, fireRate: 5.5, range: 480, bulletSpeed: 1000,
    spread: 2.5, pierce: 1, bulletLen: 12, bulletWidth: 2.5, color: '#ff6a1a',
    sound: { type: 'rifle', freq: 640, decay: 0.08, noise: 0.45 } },
  { id: 'm249', name: 'M249', tier: 5, damage: 21, fireRate: 13.0, range: 460, bulletSpeed: 1040,
    spread: 2, pierce: 0, bulletLen: 13, bulletWidth: 3, color: '#ff4a2a',
    sound: { type: 'lmg', freq: 520, decay: 0.1, noise: 0.55 } },
  { id: 'm82', name: 'M82', tier: 6, damage: 150, fireRate: 2.4, range: 650, bulletSpeed: 1100,
    spread: 1, pierce: 3, bulletLen: 18, bulletWidth: 4, color: '#e8f4ff',
    sound: { type: 'sniper', freq: 260, decay: 0.3, noise: 0.3 } },
];

// Waffe zu einem Tier (0..MAX_TIER); Werte außerhalb werden geklemmt, Nachkommastellen gerundet.
export function getWeapon(tier) {
  const t = Math.max(0, Math.min(MAX_TIER, Math.round(tier)));
  return WEAPONS[t];
}
