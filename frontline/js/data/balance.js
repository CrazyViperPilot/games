// Alle globalen Spielzahlen (PLAN.md §3.1, §11).
export const BALANCE = {
  map: { width: 9024, height: 9024, tile: 32 },
  tickRate: 20, // Simulationsschritte/s
  winPoints: 100,
  walletMax: 5000, // Obergrenze der Kasse, die von Runde zu Runde bleibt
  pointInterval: 30,
  startRes: { money: 800 }, // Startgeld; die Haupt-FOB hat unendlich Baumaterial, Munition und Treibstoff
  startUnits: ['truck', 'engineer', 'rifleman', 'rifleman', 'rifleman', 'rifleman'],
  zone: { r: 3300, controlIncome: 10, unitIncome: 0.25, unitIncomeCap: 30 },
  // Hot Zone: kleiner Kreis in der Konfliktzone, wandert zufällig oder zu aktiven Bohrern
  hot: { r: 300, speed: 40, wanderSpeed: 40 / 3, income: 8, wanderMin: 25, wanderMax: 45 },
  // Bauradien eigener FOBs dürfen sich nicht überlappen (minDistOwn = 2 × buildRadius); höchstens 10 FOBs mit der Haupt-FOB
  fob: { buildRadius: 450, minDistOwn: 900, minDistEnemy: 700, max: 10 },
  queueMax: 5,
  shortageWarn: 20, // s zwischen zwei Meldungen je Sorte und Team
  fuelSlowMul: 0.25, // Tempo von Fahrzeugen ohne Treibstoff
  unitCap: 120, // lebende + in Ausbildung befindliche Einheiten je Team
  demolishRefund: 0.25, // Abriss fertiger Gebäude (Baustellen: voll)
  scanInterval: 0.25, // Zielsuche
  fogInterval: 0.25,
  leash: 300, // Idle-Einheiten verfolgen max. so weit vom Ankerpunkt
  // Logistik (§11.1–11.3)
  logistics: {
    storeCap: 3000, // Obergrenze je Sorte und FOB-Lager (die Haupt-FOB wird darauf immer wieder aufgefüllt)
    truckCapacity: 400, // Ladung eines LKW (Summe)
    transferRate: 100, // Laden/Entladen je s
    transferReach: 140, // LKW muss so nah an der FOB-Mitte stehen
    resupplyRate: 4, // Nachfüllen Treibstoff je s und Einheit
    bmRate: 20, // Nachfüllen Baumaterial der Soldaten je s (bmCap)
    ammoRate: 60, // Nachfüllen Munition je s und Einheit (Lagereinheiten; Waffen füllen der Reihe nach)
    resupplyInterval: 0.5, // Takt des Nachfüllens (s)
    truckSupplyRange: 180, // Nachfüllen/Mauerbau aus LKW-Ladung
    noFobWarn: 30, // s zwischen zwei Meldungen „Förderanlage ohne FOB“
  },
  // Bau und Reparatur (§11.8)
  construction: {
    helperRange: 90, // Bauer zählt, wenn ≤ 90 px vom Gebäuderand
    standRange: 60, // Bauer fährt bis hierher heran
    maxBuilders: 3,
    autoHelpRange: 400, // idle Bauer hilft automatisch
    autoRepairRange: 300, // idle Baufahrzeug repariert automatisch
    assignInterval: 1, // s, Takt der automatischen Zuweisung
    fobMaterial: 400, // Baumaterial im Lager einer FOB-Baustelle, bevor gebaut wird
    repairRate: 0.02, // Anteil maxHp je s und Baufahrzeug
    repairCostShare: 0.5, // Baumaterial-Kosten = cost.bm × geheilt/maxHp × 0.5
  },
  difficulty: {
    easy: { think: 3.0, incomeMult: 0.8, attackStrength: 2500 },
    normal: { think: 2.0, incomeMult: 1.0, attackStrength: 2000 },
    hard: { think: 1.0, incomeMult: 1.25, attackStrength: 1600 },
  },
  resNames: { money: 'Geld', bm: 'Baumaterial', mun: 'Munition', fuel: 'Treibstoff' },
  teamNames: ['Blau', 'Rot'],
  teamColors: ['#3d8bfd', '#e5484d'],
};
