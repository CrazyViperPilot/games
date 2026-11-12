// Einheitenwerte (docs/verlauf.md §3.2, §11.2, §11.8).
// weapons: Waffen mit rounds (Schuss im Vorrat), munCost (Munition aus dem FOB-Lager je Schuss beim Nachladen), cooldown, damage nach Panzerklasse,
// optional targets (Klassen, gegen die diese Waffe bevorzugt wird). Daraus entstehen range, damage (bester Wert je Klasse) und ammoMax.
// Schadensklasse jet (seit v5.15) = Flugzeuge (F-16); fehlt sie, gilt air (Hubschrauber). Soldaten treffen keine Flugzeuge (jet: 0),
// Panzer-MGs sehr wenig, Kampfhubschrauber mittel. parallel: true = alle Waffen feuern unabhängig, jede auf ihr eigenes Ziel (combat.js).
// cost: fehlende Schlüssel = 0. Ausbildung in der Hauptstadt (ohne Stadt) oder in Kaserne, Fabrikhalle, Heliport (mit Stadt); hotkey: Taste im Ausbildungsmenü.
// buildTime: Ausbildungszeit in Sekunden je Ausbildungsplatz (QUICK.trainSlots).
// fuelMax: Treibstoffvorrat. Die Kosten sind Geld, mit Stadt zusätzlich Metall (CITY.metalCost); alle Einheiten starten voll munitioniert und betankt.
// builder: 'all' = darf alle Gebäude bauen und reparieren, 'fort' = nur Mauer und Tor, fehlt = kein Bauen.
// Treffer bis zum Abschuss je Ziel (Einheitentyp, sonst Panzerklasse): Zahl oder SIDES(vorn, seitlich, hinten).
const SIDES = (front, side, rear) => ({ front, side, rear });

export const UNITS = {
  rifleman: {
    name: 'Schütze',
    short: 'Schütze', // Kurzname in der Befehlskarte
    armor: 'inf',
    hp: 100,
    speed: 45,
    radius: 6,
    sight: 260,
    // Waffen: rounds = Schuss im Vorrat, munCost = Munition (FOB-Lager) je Schuss beim Nachladen.
    // Gewehr: 2 Magazine à 30 Schuss; 1 Magazin = 1 Munition.
    weapons: [
      { id: 'rifle', name: 'Gewehr', range: 200, cooldown: 1.0, rounds: 60, munCost: 1 / 30, hits: { inf: 4 }, damage: { inf: 12, light: 3, heavy: 1, struct: 4, air: 3, jet: 0 } },
    ],
    cost: { money: 60 },
    buildTime: 5,
    fuelPerSec: 0,
    builder: 'fort',
    bmCap: 50, // Soldaten tragen wenig Baumaterial und bauen daraus Mauern und Tore (im Bauradius einer FOB)
    canRide: true,
    hotkey: 'Q',
  },
  // Pionier (Paket E8): Infanterie mit Gewehr; legt getarnte Panzerminen (Befehl Mine legen, js/game/mines.js) und räumt gegnerische Minen.
  // Modell: Platzhalter Schütze (unitpaint INFANTRY). Taste F im Kasernenmenü (dort frei).
  sapper: {
    name: 'Pionier',
    short: 'Pionier', // Kurzname in der Befehlskarte
    armor: 'inf',
    hp: 100,
    speed: 45,
    radius: 6,
    sight: 260,
    weapons: [
      { id: 'rifle', name: 'Gewehr', range: 200, cooldown: 1.0, rounds: 60, munCost: 1 / 30, hits: { inf: 4 }, damage: { inf: 12, light: 3, heavy: 1, struct: 4, air: 3, jet: 0 } },
    ],
    cost: { money: 70 },
    buildTime: 6,
    fuelPerSec: 0,
    builder: 'fort',
    bmCap: 50,
    canRide: true,
    hotkey: 'F',
  },
  // Sanitäter (Paket E1): unbewaffnet, heilt verletzte eigene Infanterie in seinem Umkreis (js/game/medic.js), keine Mauern bauen.
  medic: {
    name: 'Sanitäter',
    short: 'Sanitäter', // Kurzname in der Befehlskarte
    armor: 'inf',
    hp: 100,
    speed: 45,
    radius: 6,
    sight: 260,
    weapons: [],
    heal: 6, // HP je Sekunde für die am stärksten verletzte eigene Infanterie im Umkreis (nicht sich selbst)
    healRange: 90, // Umkreis in px (Mitte zu Mitte)
    cost: { money: 90 }, // Schütze (60) + 50 %
    buildTime: 5,
    fuelPerSec: 0,
    canRide: true,
    hotkey: 'K', // im Kasernen- und Hauptstadt-Menü frei (K Ablegen nur am Transporter)
  },
  // MANPADS-Soldat (Paket E2): Infanterie mit Flugabwehrrakete zu Fuß. Die Rakete ist wie die SAM-Startrampe, aber nur gegen Luftziele
  // (targets), Reichweite 300, Schaden 250, 12 s Nachladen. Schießt nicht auf Panzer oder Gebäude.
  manpads: {
    name: 'MANPADS-Soldat',
    short: 'MANPADS', // Kurzname in der Befehlskarte
    armor: 'inf',
    hp: 90,
    speed: 40,
    radius: 6,
    sight: 260,
    weapons: [
      { id: 'sam', name: 'Wärmesuchrakete', range: 300, cooldown: 12, rounds: 4, munCost: 250, hitChance: 0.9, guided: true, targets: ['air'], damage: { air: 250 } },
    ],
    cost: { money: 120 }, // wie Panzerabwehrsoldat
    buildTime: 8,
    fuelPerSec: 0,
    builder: 'fort',
    bmCap: 50,
    canRide: true,
    hotkey: 'I', // im Kasernen- und Hauptstadt-Menü frei (I Einsteigen nur am Transporter, U ist Forschung)
  },
  // Flammenwerfer (Paket E3): Infanterie mit kurzer Reichweite (70) und schnellem Feuer. Der Strahl trifft auch Gegner im Umkreis
  // splash (linear abfallend, halber Schaden). Gegen Besatzer eines Stadthauses wirkt occupantMul (×2) auf den Spill-Schaden (balance.garrison.spill).
  // Schaden: Soldat hoch, Gebäude mittel (unter garrison.heavy, also Handwaffen-Faktor), Fahrzeuge gering.
  flamer: {
    name: 'Flammenwerfer',
    short: 'Flamm', // Kurzname in der Befehlskarte
    armor: 'inf',
    hp: 100,
    speed: 40,
    radius: 6,
    sight: 260,
    weapons: [
      { id: 'flame', name: 'Flammenstrahl', range: 70, cooldown: 0.5, rounds: 40, munCost: 1 / 20, splash: 25, occupantMul: 2, damage: { inf: 40, light: 6, heavy: 2, struct: 20, air: 0, jet: 0 } },
    ],
    cost: { money: 60 }, // wie Schütze
    buildTime: 5,
    fuelPerSec: 0,
    builder: 'fort',
    bmCap: 50,
    canRide: true,
    hotkey: 'D', // nur Kaserne: im Hauptstadt-Menü sind alle Buchstaben belegt (test/config.test.js); offen, siehe Bericht
  },
  // Mörsertrupp (Paket E4): Infanterie mit leichtem Mörser zu Fuß. Feuer auf Punkt (Befehl mortarTarget, wie die Panzerhaubitze),
  // indirekt: Zielsuche über die Reichweite. Werte wie das Mörser-Gebäude, aber Reichweite 700, min. 150, Kadenz 5 s.
  // Langsam, 1 Platz. Nur Kaserne (nicht Hauptstadt, Regel 4 im Plan).
  mortarteam: {
    name: 'Mörsertrupp',
    short: 'Mörser', // Kurzname in der Befehlskarte
    armor: 'inf',
    hp: 100,
    speed: 25,
    radius: 6,
    sight: 260,
    indirect: true,
    weapons: [
      { id: 'mortar', name: 'Leichter Mörser', range: 700, minRange: 150, cooldown: 5, rounds: 20, munCost: 2, shell: true, splash: 60, damage: { inf: 60, light: 50, heavy: 25, struct: 80 } },
    ],
    cost: { money: 90 }, // Infanterie-Preis zwischen Schütze und Flammenwerfer
    buildTime: 8,
    fuelPerSec: 0,
    builder: 'fort',
    bmCap: 50,
    canRide: false, // Mörser wird zu Fuß getragen und aufgestellt
    hotkey: 'E', // nur Kaserne: Taste im Kasernenmenü frei (Q K W T D C I belegt); im Hauptstadt-Menü nicht ausgebildet
  },
  at: {
    name: 'Panzerabwehrsoldat',
    short: 'PAK', // Kurzname in der Befehlskarte
    armor: 'inf',
    hp: 90,
    speed: 40,
    radius: 6,
    sight: 260,
    // Panzerfaust/RPG: 5 Schuss à 10 Munition, auch gegen Hubschrauber
    weapons: [
      { id: 'rpg', name: 'RPG', range: 240, cooldown: 3.0, rounds: 5, munCost: 10, hits: { inf: 1, tank: SIDES(6, 4, 3), ifv: SIDES(4, 3, 2), light: 2 }, damage: { inf: 10, light: 90, heavy: 120, struct: 60, air: 40, jet: 0 } },
    ],
    cost: { money: 120 },
    buildTime: 8,
    fuelPerSec: 0,
    builder: 'fort',
    bmCap: 50,
    canRide: true,
    hotkey: 'W',
  },
  sniper: {
    name: 'Scharfschütze',
    short: 'Scharfschütze', // Kurzname in der Befehlskarte
    armor: 'inf',
    hp: 70,
    speed: 38,
    radius: 5,
    sight: 440,
    stealth: true, // getarnt: Gegner sehen ihn nur nahe (BALANCE.stealth) oder kurz nach einem Schuss
    // Scharfschützengewehr: ein Treffer tötet Infanterie, lange Nachladezeit, hohe Reichweite; gegen Fahrzeuge und Gebäude nahezu wirkungslos
    weapons: [
      { id: 'sniper', name: 'Scharfschützengewehr', range: 480, cooldown: 8.0, rounds: 10, munCost: 4, hits: { inf: 1 }, damage: { inf: 200, light: 6, heavy: 1, struct: 2, air: 2, jet: 0 } },
    ],
    cost: { money: 220 },
    buildTime: 10,
    fuelPerSec: 0,
    canRide: true,
    hotkey: 'T',
  },
  // Kommandeur (Held, nach Empire Earth): einer je Team, belegt keinen Platz. Aura (BALANCE.commander): eigene Einheiten in der Nähe
  // schießen schneller, verletzte Infanterie heilt. Fällt er, bekommt der Gegner Punkte; die Hauptstadt bildet einen neuen aus.
  commander: {
    name: 'Kommandeur',
    short: 'Kommandeur', // Kurzname in der Befehlskarte
    armor: 'inf',
    hero: true,
    slots: 0,
    hp: 300,
    speed: 42,
    radius: 7,
    sight: 340,
    // Maschinenpistole: 3 Magazine à 30 Schuss
    weapons: [
      { id: 'smg', name: 'Maschinenpistole', range: 180, cooldown: 0.6, rounds: 90, munCost: 1 / 30, hits: { inf: 6 }, damage: { inf: 10, light: 2, heavy: 1, struct: 2, air: 2, jet: 0 } },
    ],
    cost: { money: 400 },
    buildTime: 20,
    fuelPerSec: 0,
    canRide: true,
    hotkey: 'C',
  },
  truck: {
    name: 'LKW',
    short: 'LKW', // Kurzname in der Befehlskarte
    armor: 'light',
    hp: 250,
    speed: 110,
    radius: 10,
    sight: 220,
    range: 0,
    cooldown: 0,
    damage: null,
    cost: { money: 80 },
    buildTime: 6,
    ammoPerShot: 0,
    fuelPerSec: 0.2,
    fuelMax: 30,
    cargoCap: 400, // Ladung (Summe aller Sorten)
    seats: 2,
    hotkey: 'E',
  },
  // Aufklärungsfahrzeug (Paket E5): leichtes, schnelles Fahrzeug mit großer Sicht und MG. Getarnt, sobald es `stillCamo` s steht
  // (Regel wie beim Scharfschützen: Gegner sehen es nur nahe an eigenen Einheiten/Gebäuden oder kurz nach einem Schuss).
  // Nur Fabrikhalle (nicht in fob.produces, Plan Regel 4).
  scout: {
    name: 'Aufklärungsfahrzeug',
    short: 'Aufkl.', // Kurzname in der Befehlskarte
    armor: 'light',
    hp: 200,
    speed: 160,
    radius: 10,
    sight: 520,
    stillCamo: 3, // Sekunden Stillstand, bis das Fahrzeug getarnt ist (BALANCE.stealth für Reichweite und Aufdeckzeit)
    weapons: [
      { id: 'mg', name: 'MG', range: 220, cooldown: 0.25, rounds: 300, munCost: 5, hits: { inf: 2 }, damage: { inf: 9, light: 3, heavy: 1, struct: 3, air: 6, jet: 2 } },
    ],
    cost: { money: 100 },
    buildTime: 7,
    fuelPerSec: 0.2,
    fuelMax: 30,
    seats: 2,
    hotkey: 'K', // Fabrikhalle: Taste im Fabrikmenü frei (E R X B A S Z N L O belegt)
  },
  engineer: {
    name: 'Baufahrzeug',
    short: 'Baufz.', // Kurzname in der Befehlskarte
    armor: 'light',
    hp: 400,
    speed: 70,
    radius: 12,
    sight: 260,
    range: 0,
    cooldown: 0,
    damage: null,
    cost: { money: 150 },
    buildTime: 9,
    ammoPerShot: 0,
    fuelPerSec: 0.3,
    fuelMax: 40,
    builder: 'all',
    canRide: true,
    seats: 1,
    hotkey: 'R',
  },
  // Bergepanzer (Paket E7): unbewaffnetes Fahrzeug, repariert eigene Fahrzeuge im Umkreis (js/game/recovery.js). Keine Luftfahrzeuge.
  recovery: {
    name: 'Bergepanzer',
    short: 'Berge', // Kurzname in der Befehlskarte
    armor: 'light',
    hp: 350,
    speed: 60,
    radius: 12,
    sight: 260,
    range: 0,
    cooldown: 0,
    damage: null,
    weapons: [],
    cost: { money: 130 },
    buildTime: 8,
    ammoPerShot: 0,
    fuelPerSec: 0.3,
    fuelMax: 40,
    canRide: false,
    repairRate: 15, // HP je Sekunde für jedes eigene Fahrzeug im Umkreis
    repairRange: 60, // Umkreis in px (Mitte zu Mitte)
    pickupRange: 200, // untätig: fährt zum nächsten beschädigten eigenen Fahrzeug in diesem Umkreis
    repairCostShare: 0.5, // Baumaterial = cost.money × geheilt/maxHp × 0.5 (wie die Reparatur des Baufahrzeugs, BALANCE.construction)
    hotkey: 'W', // Fabrikhalle: Taste im Fabrikmenü frei (E K R X B A S Z N L O T belegt)
  },
  // Störsender (Paket E9): unbewaffnetes Fahrzeug, 2 Plätze. Senkt die Trefferchance gegnerischer Lenkwaffen (guided) auf Ziele im Umkreis
  // jamRange um sich selbst um den Faktor (1 − jam); mehrere Störsender stapeln nicht (js/game/combat.js, jamFactor).
  jammer: {
    name: 'Störsender',
    short: 'Störs', // Kurzname in der Befehlskarte
    armor: 'light',
    hp: 300,
    speed: 60,
    radius: 12,
    sight: 260,
    range: 0,
    cooldown: 0,
    damage: null,
    weapons: [],
    cost: { money: 150 },
    buildTime: 8,
    ammoPerShot: 0,
    fuelPerSec: 0.3,
    fuelMax: 40,
    canRide: false,
    jam: 0.35, // Abzug der Trefferchance gegnerischer Lenkwaffen (×(1 − jam))
    jamRange: 300, // Umkreis in px (Mitte zu Mitte) um den Störsender
    hotkey: 'U', // Fabrikhalle: Taste im Fabrikmenü frei (E K R X B A S Z N L O T W belegt)
  },
  // Bagger (seit v5.35): räumt mit dem Befehl „Baggern“ (G) Zellen, auch Stadtstraßen der Karte in der Konfliktzone (nicht Brücken),
  // Bäume und Häuser, und reißt eigene Stadtgebäude ab (BALANCE.excavator). Seine Schaufel trifft nur Gebäude, langsam: so zerstört er
  // auch gegnerische Gebäude und Stadtgebäude, wenn er sie angreift.
  excavator: {
    name: 'Bagger',
    short: 'Bagger', // Kurzname in der Befehlskarte
    armor: 'light',
    slots: 2,
    hp: 650,
    speed: 48,
    radius: 13,
    sight: 240,
    digger: true,
    weapons: [
      { id: 'shovel', name: 'Schaufel', range: 34, cooldown: 1.2, rounds: 9999, munCost: 0, targets: ['struct'], damage: { struct: 32 } },
    ],
    cost: { money: 320 },
    buildTime: 14,
    fuelPerSec: 0.35,
    fuelMax: 45,
    canRide: false,
    hotkey: 'X',
  },
  fobTruck: {
    name: 'FOB-Fahrzeug',
    short: 'FOB-Fz.', // Kurzname in der Befehlskarte
    slots: 2,
    armor: 'light',
    hp: 600,
    speed: 60,
    radius: 14,
    sight: 260,
    range: 0,
    cooldown: 0,
    damage: null,
    cost: { money: 500 },
    buildTime: 30,
    ammoPerShot: 0,
    fuelPerSec: 0.4,
    fuelMax: 50,
    // Knopf „Aufbauen“ (Befehl deploy): wird an seiner Stelle sofort zur fertigen FOB (ohne Bauzeit);
    // sie startet mit BALANCE.fob.startStock (QUICK.fobStartStock) ihres Lagers je Sorte. Seit v5.09 das einzige Mittel für neue FOBs.
    deploys: 'fob',
    hotkey: 'B',
  },
  ifv: {
    name: 'Schützenpanzer',
    short: 'SPz', // Kurzname in der Befehlskarte
    slots: 3,
    armor: 'light',
    parallel: true, // MG und Granatwerfer feuern gleichzeitig auf eigene Ziele (seit v5.15)
    hp: 450,
    speed: 85,
    radius: 12,
    sight: 300,
    // Granatwerfer: 60 Granaten à 10 Munition; MG: 300 Schuss à 5
    weapons: [
      { id: 'grenade', name: 'Granatwerfer', range: 240, cooldown: 2.0, rounds: 60, munCost: 10, targets: ['light', 'heavy', 'struct'], hits: { inf: 1, tank: SIDES(10, 8, 7), ifv: SIDES(8, 6, 5), light: 3 }, damage: { inf: 30, light: 40, heavy: 10, struct: 25 } },
      { id: 'mg', name: 'MG', range: 220, cooldown: 0.25, rounds: 300, munCost: 5, hits: { inf: 2 }, damage: { inf: 9, light: 3, heavy: 1, struct: 3, air: 6, jet: 2 } },
    ],
    cost: { money: 250 },
    buildTime: 12,
    fuelPerSec: 0.4,
    fuelMax: 40,
    seats: 6,
    hotkey: 'A',
  },
  tank: {
    name: 'Kampfpanzer',
    short: 'KPz', // Kurzname in der Befehlskarte
    slots: 5,
    armor: 'heavy',
    parallel: true, // MG und Hauptkanone feuern gleichzeitig auf eigene Ziele (seit v5.15)
    hp: 1100,
    speed: 60,
    radius: 15,
    sight: 320,
    // Hauptkanone: 30 Schuss à 20 Munition, 6 s Nachladezeit; MG: 300 Schuss à 5
    weapons: [
      { id: 'cannon', name: 'Hauptkanone', range: 300, cooldown: 6, rounds: 30, munCost: 20, targets: ['light', 'heavy', 'struct'], hits: { inf: 1, tank: SIDES(4, 3, 2), ifv: SIDES(3, 3, 2), light: 2 }, damage: { inf: 45, light: 120, heavy: 150, struct: 120 } },
      { id: 'mg', name: 'MG', range: 220, cooldown: 0.25, rounds: 300, munCost: 5, hits: { inf: 2 }, damage: { inf: 10, light: 3, heavy: 0, struct: 2, air: 3, jet: 1 } },
    ],
    cost: { money: 500 },
    buildTime: 20,
    fuelPerSec: 0.6,
    fuelMax: 60,
    hotkey: 'S',
  },
  // Hubschrauber (armor 'air'): fliegen geradeaus über alles, nur Flugabwehr und leichte Waffen schaden ihnen.
  // seats: Passagiere (Hubschrauber: Infanterie/Baufahrzeug mit canRide; LKW 2, Baufahrzeug 1, Schützenpanzer 6: nur Infanterie), cargoCap: Ressourcenladung wie ein LKW.
  littlebird: {
    name: 'Little Bird',
    short: 'Little Bird', // Kurzname in der Befehlskarte
    armor: 'air',
    air: true,
    hp: 220,
    speed: 170,
    radius: 10,
    sight: 380,
    range: 0,
    cooldown: 0,
    damage: null,
    cost: { money: 350 },
    buildTime: 15,
    ammoPerShot: 0,
    fuelPerSec: 0.5,
    fuelMax: 60,
    seats: 5,
    hotkey: 'D',
  },
  // Aufklärungsdrohne (Paket E10): Hubschrauber wie der Little Bird, aber sehr billig, zäh genug für Aufklärung, langsam, ohne Passagiere
  // und unbewaffnet. Sicht 450 deckt Nebel auf; Treibstoff 40 (kehrt zum Tanken auf den Heliport zurück wie ein Hubschrauber).
  drone: {
    name: 'Aufklärungsdrohne',
    short: 'Drohne', // Kurzname in der Befehlskarte
    armor: 'air',
    air: true,
    hp: 120,
    speed: 130,
    radius: 8,
    sight: 450,
    range: 0,
    cooldown: 0,
    damage: null,
    cost: { money: 200 },
    buildTime: 12,
    ammoPerShot: 0,
    fuelPerSec: 0.5,
    fuelMax: 40,
    seats: 0, // keine Passagiere
    hotkey: 'R', // Heliport-Menü: D Little Bird, F Transporter, G Kampfheli (R frei)
  },
  // Kamikazedrohne (Paket E11): wie die Aufklärungsdrohne, aber 60 HP, schnell und mit Sicht 250. Angriffsbefehl auf Fahrzeug oder Gebäude:
  // sie fliegt hin und explodiert bei Kontakt (updateFpv in js/game/fpv.js), dann ist sie weg. Die Reichweite 15 ist nur für den Angriffsbefehl
  // (cmdAttack verlangt range > 0); unbewaffnet, keine Waffen-Liste.
  fpv: {
    name: 'Kamikazedrohne',
    short: 'FPV', // Kurzname in der Befehlskarte
    armor: 'air',
    air: true,
    hp: 60,
    speed: 190,
    radius: 8,
    sight: 250,
    range: 15,
    cooldown: 0,
    damage: null,
    // Einschlag beim Kontakt (≤ 20 px vom Ziel): Flächenschaden mit Abfall über splash, wie eine Granate (combat.js impact)
    blast: { damage: { light: 500, heavy: 700, struct: 300 }, splash: 30 },
    cost: { money: 200 },
    buildTime: 12,
    ammoPerShot: 0,
    fuelPerSec: 0.5,
    fuelMax: 40,
    seats: 0, // keine Passagiere
    hotkey: 'X', // Heliport-Menü: D Little Bird, F Transporter, G Kampfheli, R Aufklärungsdrohne (X frei)
  },
  transporter: {
    name: 'Transporthubschrauber',
    short: 'Transp.-Heli', // Kurzname in der Befehlskarte
    armor: 'air',
    air: true,
    hp: 500,
    speed: 130,
    radius: 14,
    sight: 320,
    range: 0,
    cooldown: 0,
    damage: null,
    cost: { money: 600 },
    buildTime: 20,
    ammoPerShot: 0,
    fuelPerSec: 0.7,
    fuelMax: 90,
    seats: 9,
    cargoCap: 400,
    hotkey: 'F',
  },
  gunship: {
    name: 'Kampfhubschrauber',
    short: 'AH-64', // Kurzname in der Befehlskarte
    armor: 'air',
    air: true,
    hp: 650,
    speed: 150,
    radius: 13,
    sight: 400,
    // Bordkanone: 300 Schuss à 10 Munition; 10 Raketen à 100 Munition (gegen Panzer, Gebäude, Hubschrauber)
    weapons: [
      { id: 'cannon', name: 'Bordkanone', range: 340, cooldown: 0.5, rounds: 300, munCost: 10, damage: { inf: 22, light: 26, heavy: 30, struct: 18, air: 10, jet: 12 } },
      { id: 'rocket', name: 'Raketen', range: 340, cooldown: 3, rounds: 10, munCost: 100, targets: ['heavy', 'struct', 'air'], damage: { inf: 40, light: 120, heavy: 220, struct: 120, air: 150, jet: 110 } },
    ],
    cost: { money: 900 },
    buildTime: 28,
    fuelPerSec: 0.8,
    fuelMax: 70,
    hotkey: 'G',
  },
  // Kampfflugzeug (seit v5.03, PRD §6 „F-16“): nur mit Stadt, im Flughafen ausgebildet und dort stationiert (jet). Fliegt immer (kann
  // nicht schweben), kreist um seinen Befehlspunkt und greift mit zwei Lenkraketen zwei Ziele an, auch Hubschrauber und Flugzeuge.
  // fuelMax = Sekunden Flug (fuelPerSec 1, auch beim Kreisen): Reichweite ≈ speed × fuelMax. Leer an Raketen oder knapp an Treibstoff
  // fliegt es allein zum Flughafen zurück, landet, tankt, lädt nach und wird repariert (BALANCE.jets); ohne Flughafen stürzt es leer ab.
  f16: {
    name: 'F-16',
    short: 'F-16', // Kurzname in der Befehlskarte
    slots: 3,
    armor: 'air',
    air: true,
    jet: true,
    hp: 450,
    speed: 420,
    radius: 14,
    sight: 560,
    // Seit v5.41 zwei Waffen, die unabhängig feuern (parallel): Luft-Luft-Lenkraketen nur gegen Hubschrauber und Flugzeuge,
    // Luft-Boden-Raketen gegen gepanzerte Fahrzeuge (bevorzugt) und Gebäude. Leer geschossen (alle vier) fliegt sie heim.
    parallel: true,
    weapons: [
      { id: 'aim', name: 'Luft-Luft-Lenkrakete', range: 640, cooldown: 2.5, rounds: 2, munCost: 150, hitChance: 0.92, guided: true, targets: ['air'], damage: { air: 700 } },
      { id: 'agm', name: 'Luft-Boden-Rakete', range: 600, cooldown: 2.5, rounds: 2, munCost: 150, hitChance: 0.92, guided: true, targets: ['heavy', 'light'], damage: { inf: 160, light: 650, heavy: 1150, struct: 700 } },
    ],
    cost: { money: 1400 },
    buildTime: 40,
    fuelPerSec: 1,
    fuelMax: 55, // seit v5.14 55 statt 45: die Zone liegt auf der größeren Karte weiter vom Flughafen, die Zeit über ihr bleibt gleich
    hotkey: 'K', // feste Tasten (J, H, V, Y, P, M; js/ui/input.js) sind tabu, test/config.test.js prüft das
  },
  // Kampfflugzeug F-22 (seit v5.82, PRD §6 „F-22“): reines Luftüberlegenheitsjet, nur mit Stadt, am selben Stellplatz wie die F-16
  // (CITY.produces.stand, Plätze CITY.air.standJets teilen sich beide). Sechs Luft-Luft-Lenkraketen, keine Luft-Boden-Raketen:
  // greift keine Boden- und Gebäudeziele an. Leer geschossen fliegt sie heim und lädt am Munitionslager nach wie die F-16.
  f22: {
    name: 'F-22',
    short: 'F-22', // Kurzname in der Befehlskarte
    slots: 3,
    armor: 'air',
    air: true,
    jet: true,
    hp: 500,
    speed: 460,
    radius: 15,
    sight: 600,
    // Eine Waffe (kein parallel nötig): sechs Luft-Luft-Lenkraketen, nur gegen Hubschrauber und Flugzeuge
    weapons: [
      // antiHighAlt: greift auch die U-2 in großer Höhe an (highAlt); die übrigen Flugabwehr-Waffen können das nicht (combat.js)
      { id: 'aim', name: 'Luft-Luft-Lenkrakete', range: 700, cooldown: 2.2, rounds: 6, munCost: 150, hitChance: 0.94, guided: true, targets: ['air'], antiHighAlt: true, damage: { air: 700 } },
    ],
    cost: { money: 1900 },
    buildTime: 55,
    fuelPerSec: 1,
    fuelMax: 55, // Sekunden Flug wie die F-16 (Reichweite ≈ speed × fuelMax)
    hotkey: 'I', // im Stellplatz-Menü frei (I = Einsteigen nur bei gewählten Soldaten, U Ausbauen, K F-16)
  },
  // Erdkampfflugzeug A-10 (Paket E12, PRD §6 „A-10“): langsam, viel HP, lange Einsatzzeit; eine Bordkanone mit schneller Kadenz und
  // vielen Schuss, nur gegen Bodenziele (keine Luftziele, keine Raketen). Nur mit Stadt, am Stellplatz des Fliegerhorsts (CITY.produces.stand).
  // Die KI baut sie nicht. Kreisen und Heimflug laufen über die vorhandene Jet-Logik (BALANCE.jets).
  a10: {
    name: 'A-10',
    short: 'A-10', // Kurzname in der Befehlskarte
    slots: 3,
    armor: 'air',
    air: true,
    jet: true,
    hp: 700,
    speed: 252, // rund 60 % der F-16 (420)
    radius: 16,
    sight: 560,
    // Eine Waffe: Bordkanone gegen Bodenziele (Infanterie, Fahrzeuge, Gebäude); kein targets mit 'air' oder 'jet'
    weapons: [
      { id: 'gun', name: 'Bordkanone', range: 340, cooldown: 0.12, rounds: 400, munCost: 2, hitChance: 0.7, targets: ['inf', 'light', 'heavy', 'struct'], damage: { inf: 25, light: 60, heavy: 35, struct: 40 } },
    ],
    cost: { money: 1500 },
    buildTime: 45,
    fuelPerSec: 1,
    fuelMax: 90, // lange Einsatzzeit: mehr Sekunden Flug als die F-16 (55), dafür langsamer
    hotkey: 'D', // im Stellplatz-Menü frei (K F-16, I F-22, S Su-27, O U-2, W Staffel, U Ausbauen)
  },
  // Kampfflugzeug Su-27 (Paket „Su-27“, PRD §6 „Su-27“): wie die F-16 (gleiche zwei Waffen, parallel, gleiche Schäden und Munition),
  // aber etwas schneller und mit größerer Reichweite (Reichweite ≈ speed × fuelMax: 450 × 75 gegen 420 × 55). Nur mit Stadt, am Stellplatz
  // des Fliegerhorsts (CITY.produces.stand, Plätze CITY.air.standJets teilen sich F-16, F-22 und Su-27). Die KI baut sie nicht.
  su27: {
    name: 'Su-27',
    short: 'Su-27', // Kurzname in der Befehlskarte
    slots: 3,
    armor: 'air',
    air: true,
    jet: true,
    hp: 480,
    speed: 450,
    radius: 15,
    sight: 560,
    // Zwei Waffen, die unabhängig feuern (wie die F-16): Luft-Luft-Lenkraketen nur gegen Hubschrauber und Flugzeuge,
    // Luft-Boden-Raketen gegen gepanzerte Fahrzeuge (bevorzugt) und Gebäude. Leer geschossen (alle vier) fliegt sie heim.
    parallel: true,
    weapons: [
      { id: 'aim', name: 'Luft-Luft-Lenkrakete', range: 640, cooldown: 2.5, rounds: 2, munCost: 150, hitChance: 0.92, guided: true, targets: ['air'], damage: { air: 700 } },
      { id: 'agm', name: 'Luft-Boden-Rakete', range: 600, cooldown: 2.5, rounds: 2, munCost: 150, hitChance: 0.92, guided: true, targets: ['heavy', 'light'], damage: { inf: 160, light: 650, heavy: 1150, struct: 700 } },
    ],
    cost: { money: 1600 },
    buildTime: 45,
    fuelPerSec: 1,
    fuelMax: 75, // Sekunden Flug (fuelPerSec 1, auch beim Kreisen): 75 statt 55 der F-16 (Reichweite ≈ speed × fuelMax)
    hotkey: 'S', // im Stellplatz-Menü frei (K F-16, I F-22, O U-2, W Staffel, U Ausbauen)
  },
  // U-2 (Höhenaufklärer, seit v5.83): unbewaffnet, fliegt sehr hoch. In der Luft sieht sie weit (airSight), und nur Waffen mit
  // antiHighAlt (die F-22) können sie treffen (highAlt, combat.js); am Boden ist sie wie ein Jet verwundbar. Sie belegt einen
  // ganzen Stellplatz allein (standSlots, aircraft.js), Kreisen und Heimflug wie die Jets; ohne Waffen fliegt sie nicht „leer“ heim.
  u2: {
    name: 'U-2',
    short: 'U-2', // Kurzname in der Befehlskarte
    slots: 3,
    armor: 'air',
    air: true,
    jet: true,
    hp: 400,
    speed: 300,
    radius: 22,
    sight: 300, // am Boden wie ein Fahrzeug
    airSight: 1800, // Sichtweite in der Luft (fog.js, sightOf)
    highAlt: true, // in der Luft nur von Waffen mit antiHighAlt angreifbar (combat.js)
    standSlots: 2, // belegt beide Plätze eines Stellplatzes (CITY.air.standJets): kein anderes Flugzeug darauf
    weapons: [],
    cost: { money: 1600 },
    buildTime: 50,
    fuelPerSec: 1,
    fuelMax: 180, // rund 3 min Flug: Karte Ecke zu Ecke (ca. 15 700 px) hin und zurück mit gut einer Minute Kreisen
    hotkey: 'O', // im Stellplatz-Menü frei (K F-16, I F-22, W Staffel, U Ausbauen)
  },
  // Flugabwehrpanzer (Flak): Schnellfeuer-Flak gegen Hubschrauber, Munition je Schuss 20. hitChance × speedRef: schnelle Ziele trifft sie selten
  // (Tempo-Faktor speedRef/(speedRef + Zielgeschwindigkeit), siehe BALANCE.airFire). Schießt nur auf Luftziele.
  flak: {
    name: 'Flakpanzer',
    short: 'Flak', // Kurzname in der Befehlskarte
    slots: 2,
    armor: 'light',
    hp: 300,
    speed: 70,
    radius: 11,
    sight: 380,
    weapons: [
      { id: 'flak', name: 'Flak', range: 330, cooldown: 0.8, rounds: 30, munCost: 20, hitChance: 0.85, speedRef: 120, damage: { air: 40 } },
    ],
    cost: { money: 220 },
    buildTime: 10,
    fuelPerSec: 0.4,
    fuelMax: 40,
    hotkey: 'Z', // Z wie Flugabwehr im Baumenü (seit v5.57; J ist die feste Taste „Bauer“)
  },
  // Flugabwehrrakete (SAM): Wärmesuchende Raketen, 250 Munition je Rakete, 10 s Nachladezeit. Die Rakete folgt der Wärme des Ziels,
  // darum kein Tempo-Abzug (nur die Entfernung). Schießt nur auf Luftziele.
  sam: {
    name: 'SAM-Startrampe',
    short: 'SAM', // Kurzname in der Befehlskarte
    slots: 2,
    armor: 'light',
    hp: 350,
    speed: 65,
    radius: 11,
    sight: 440,
    weapons: [
      { id: 'sam', name: 'Wärmesuchrakete', range: 420, cooldown: 10, rounds: 4, munCost: 250, hitChance: 0.9, guided: true, damage: { air: 350 } },
    ],
    cost: { money: 300 },
    buildTime: 12,
    fuelPerSec: 0.4,
    fuelMax: 40,
    hotkey: 'N',
  },
  // Flakpanzer Gepard (seit v5.19): Zwillings-Maschinenkanone mit Such- und Feuerleitradar. Trifft auch schnelle Flugzeuge (speedRef
  // hoch, siehe BALANCE.airFire), weite Sicht (Radar); gegen leichte Bodenziele brauchbar, gegen Panzer kaum. Bevorzugt Luftziele.
  gepard: {
    name: 'Flakpanzer Gepard',
    short: 'Gepard', // Kurzname in der Befehlskarte
    slots: 3,
    armor: 'light',
    hp: 450,
    speed: 62,
    radius: 13,
    sight: 480,
    weapons: [
      { id: 'twin35', name: 'Zwillingskanone 35 mm', range: 420, cooldown: 0.35, rounds: 80, munCost: 8, hitChance: 0.8, guided: true, speedRef: 400, targets: ['air'], damage: { inf: 8, light: 14, heavy: 2, struct: 6, air: 32, jet: 32 } },
    ],
    cost: { money: 650 },
    buildTime: 16,
    fuelPerSec: 0.35,
    fuelMax: 45,
    hotkey: 'L', // seit v5.57 (P ist Pause)
  },
  // Panzerhaubitze (seit v5.19, nach der Panzerhaubitze 2000): Artillerie. Schießt Granaten (shell) weit über das Gefecht, nicht näher als
  // minRange; Ziele muss das Team sehen (eigene Einheiten oder Gebäude). Splash-Schaden um den Einschlag, Streuung spread px
  // (Forschung „acc“ verkleinert sie), Fluggeschwindigkeit shellSpeed px/s. Auch Feuer auf einen Punkt (G, wie der Mörser).
  pzh: {
    name: 'Panzerhaubitze',
    short: 'PzH', // Kurzname in der Befehlskarte
    slots: 4,
    armor: 'light',
    hp: 500,
    speed: 50,
    radius: 14,
    sight: 280,
    indirect: true, // Zielsuche über die Reichweite (Sicht des Teams), nicht über die eigene Sicht
    weapons: [
      { id: 'howitzer', name: 'Haubitze 155 mm', range: 1400, minRange: 260, cooldown: 7, rounds: 30, munCost: 25, shell: true, splash: 75, spread: 70, shellSpeed: 480, damage: { inf: 90, light: 110, heavy: 80, struct: 140 } },
    ],
    cost: { money: 900 },
    buildTime: 22,
    fuelPerSec: 0.35,
    fuelMax: 40,
    hotkey: 'O',
  },
  // Raketenwerfer (Paket E6): Fahrzeug wie die Panzerhaubitze, Feuer auf Punkt (mortarTarget). Eine Salve aus 12 Raketen
  // (salvo: 0,25 s Abstand), danach 30 s Nachladen (salvo.reload). Reichweite 1600, min. 400, Streuung 120, Splash 60.
  // Nur Fabrikhalle (Regel 4 im Plan: nicht fob.produces). Werte vorläufig, Modell: Platzhalter Panzerhaubitze.
  mlrs: {
    name: 'Raketenwerfer',
    short: 'MLRS', // Kurzname in der Befehlskarte
    slots: 4,
    armor: 'light',
    hp: 500,
    speed: 50,
    radius: 14,
    sight: 280,
    indirect: true, // Zielsuche über die Reichweite (Sicht des Teams), wie die Panzerhaubitze
    weapons: [
      { id: 'rockets', name: 'Raketenwerfer 227 mm', range: 1600, minRange: 400, cooldown: 30, rounds: 36, munCost: 15, shell: true, splash: 60, spread: 120, shellSpeed: 480, salvo: { count: 12, gap: 0.25, reload: 30 }, damage: { inf: 70, light: 90, heavy: 60, struct: 110 } },
    ],
    cost: { money: 1000 },
    buildTime: 26,
    fuelPerSec: 0.35,
    fuelMax: 40,
    hotkey: 'T', // nur Fabrikhalle: im Fabrikmenü frei (E R B A S Z N L O X K belegt)
  },
};

// Abgeleitete Gesamtwerte aus den Waffen: größte Reichweite, bester Schaden je Klasse, Munitionswert des vollen Vorrats.
for (const def of Object.values(UNITS)) {
  if (!def.weapons) continue;
  def.range = Math.max(0, ...def.weapons.map((w) => w.range)); // ohne Waffen (U-2) 0
  def.minRange = Math.max(0, ...def.weapons.map((w) => w.minRange ?? 0)); // Artillerie: nicht näher
  def.cooldown = def.weapons[0]?.cooldown ?? 0;
  def.damage = {};
  for (const w of def.weapons) {
    for (const [k, v] of Object.entries(w.damage)) def.damage[k] = Math.max(def.damage[k] || 0, v);
  }
  def.ammoMax = def.weapons.reduce((sum, w) => sum + w.rounds * w.munCost, 0);
}
