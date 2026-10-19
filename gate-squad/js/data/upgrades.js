// Permanente Shop-Upgrades (PLAN.md §5). Kosten: upgradeCost() in balance.js.

export const UPGRADES = [
  { id: 'squad', name: 'Truppenstärke', desc: '+1 Startsoldat', base: 40, growth: 1.35, max: 15 },
  { id: 'damage', name: 'Schaden', desc: '+8 % Schaden', base: 60, growth: 1.4, max: 10 },
  { id: 'fireRate', name: 'Feuerrate', desc: '+6 % Feuerrate', base: 60, growth: 1.4, max: 10 },
  { id: 'weapon', name: 'Startwaffe', desc: 'Startet mit besserer Waffe', base: 400, growth: 2.5, max: 3 },
];
