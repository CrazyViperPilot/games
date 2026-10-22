// Alle globalen Spielzahlen (PLAN.md §3.1).
export const BALANCE = {
  map: { width: 4800, height: 4800, tile: 32 },
  tickRate: 20, // Simulationsschritte/s
  winPoints: 100,
  pointInterval: 30,
  startRes: { money: 400, bm: 600, mun: 150, fuel: 150 },
  startUnits: ['truck', 'rifleman', 'rifleman', 'rifleman', 'rifleman'],
  zone: { r: 1100, controlIncome: 6, unitIncome: 0.25, unitIncomeCap: 30 },
  fob: { buildRadius: 450, minDistOwn: 500, minDistEnemy: 700, max: 6, income: 5 },
  queueMax: 5,
  shortageWarn: 20,                   // s zwischen zwei Meldungen je Sorte bei Munitions-/Treibstoffmangel
  fuelSlowMul: 0.25,                  // Tempo von Fahrzeugen ohne Treibstoff
  unitCap: 120,                       // lebende + in Ausbildung befindliche Einheiten je Team
  demolishRefund: 0.25,
  scanInterval: 0.25, // Zielsuche
  fogInterval: 0.25,
  leash: 300, // Idle-Einheiten verfolgen max. so weit vom Ankerpunkt
  difficulty: {
    easy: { think: 3.0, incomeMult: 0.8, attackStrength: 2500 },
    normal: { think: 2.0, incomeMult: 1.0, attackStrength: 2000 },
    hard: { think: 1.0, incomeMult: 1.25, attackStrength: 1600 },
  },
  resNames: { money: 'Geld', bm: 'Baumaterial', mun: 'Munition', fuel: 'Treibstoff' },
  teamNames: ['Blau', 'Rot'],
  teamColors: ['#3d8bfd', '#e5484d'],
};
