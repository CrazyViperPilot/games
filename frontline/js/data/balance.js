// Alle globalen Spielzahlen (PLAN.md §3.1, §11).
export const BALANCE = {
  map: { width: 9024, height: 9024, tile: 32 },
  tickRate: 20, // Simulationsschritte/s
  winPoints: 100,
  // Geld für Abschüsse und Bauten (Anteil am Geldpreis der Einheit bzw. am Baumaterialpreis des Gebäudes)
  bounty: { inf: 0.25, vehicle: 0.6, building: 0.2, built: 0.2, notify: 100 },
  walletMax: 5000, // Obergrenze der Kasse, die von Runde zu Runde bleibt
  pointInterval: 30,
  startRes: { money: 800 }, // Startgeld; die Haupt-FOB hat unendlich Baumaterial, Munition und Treibstoff
  // Einheitenlimit in Plätzen je Team: Soldat/LKW/Baufahrzeug/Hubschrauber 1, Schützenpanzer 3, Kampfpanzer 5 (`slots` in units.js)
  slotCap: 50,
  // Start: 2 Kampfpanzer (10 Plätze), 3 Schützenpanzer (9), LKW und Baufahrzeug (2), 29 Soldaten (22 Schützen, 7 Panzerabwehr) = 50 Plätze
  startUnits: ['truck', 'engineer', 'tank', 'tank', 'ifv', 'ifv', 'ifv', ...Array(22).fill('rifleman'), ...Array(7).fill('at')],
  // Geld je Sekunde und lebende eigene Einheit in der Konfliktzone (auch umkämpft, ohne Deckel)
  zone: { r: 3300, unitIncome: 0.4 },
  // Hot Zone: kleiner Kreis in der Konfliktzone, wandert zufällig oder zu aktiven Bohrern.
  // Einheiten darin bringen statt unitIncome das Doppelte (unitIncome = 2 × zone.unitIncome, nicht zusätzlich).
  hot: { r: 300, speed: 40, wanderSpeed: 40 / 3, unitIncome: 0.8, wanderMin: 25, wanderMax: 45 },
  // Bauradien eigener FOBs dürfen sich nicht überlappen (minDistOwn = 2 × buildRadius); höchstens 10 FOBs mit der Haupt-FOB
  fob: { buildRadius: 450, minDistOwn: 900, minDistEnemy: 700, max: 10 },
  queueMax: 5,
  trainSlots: 2, // Ausbildungsplätze der Haupt-FOB: so viele Einträge der Warteschlange werden gleichzeitig ausgebildet
  shortageWarn: 20, // s zwischen zwei Meldungen je Sorte und Team
  fuelSlowMul: 0.25, // Tempo von Fahrzeugen ohne Treibstoff
  // Soldaten-Nachschub (§12): kostenloser Schütze an der Haupt-FOB alle `interval` s, solange weniger als `soldierMin` Infanterie lebt
  reinforce: { interval: 6, soldierMin: 29, unit: 'rifleman' },
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
    // Schwierigkeit über Verhalten: ab normal Späher und Konter-Mix, ab schwer Überfälle und Gruppen-Rückzug; hart ohne Einkommensbonus.
    easy: { think: 3.0, incomeMult: 0.8, attackStrength: 2500, scout: false, counter: false, raid: false, fallback: false },
    normal: { think: 2.0, incomeMult: 1.0, attackStrength: 2000, scout: true, counter: true, raid: false, fallback: false },
    hard: { think: 1.0, incomeMult: 1.0, attackStrength: 1600, scout: true, counter: true, raid: true, fallback: true },
  },
  // Gelände (§7): wer höher steht, trifft härter (Direktfeuer, ab `dead` Höhenunterschied, voll ab `full`), tiefer stehend schwächer
  height: { bonus: 0.25, dead: 6, full: 36 },
  // Sicht im Gelände: Weitsicht von oben (+ (Höhe − base) / per, höchstens max), Kämme verdecken, was dahinter liegt.
  // eye = Augenhöhe über dem Boden (Infanterie, Fahrzeuge, Gebäude), target = Höhe, ab der ein Ziel hinter einer Kuppe auftaucht,
  // near = Gelände näher als das verdeckt nichts (man tritt an die Hangkante und schaut hinab)
  sightHeight: { base: 40, per: 350, max: 0.4, eye: { inf: 16, veh: 20, bld: 30 }, target: 12, near: 72 },
  // Tempo am Hang: Faktor = 1 − Steigung × up (bergab: 1 + Gefälle × down), begrenzt auf min … max; Fahrzeuge spüren es stärker
  slope: { upVeh: 1.5, upInf: 0.8, downVeh: 0.6, downInf: 0.3, min: 0.55, max: 1.2, pathCost: 1.2 },
  // Tarnung (Scharfschütze): Gegner sehen die Einheit nur nahe an eigenen Einheiten/Gebäuden oder kurz nach einem Schuss
  stealth: { detectRange: 160, revealTime: 4 },
  resNames: { money: 'Geld', bm: 'Baumaterial', mun: 'Munition', fuel: 'Treibstoff' },
  teamNames: ['Blau', 'Rot'],
  teamColors: ['#3d8bfd', '#e5484d'],
};
