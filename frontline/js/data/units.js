// Einheitenwerte (PLAN.md §3.2, §11.2, §11.8).
// weapons: Waffen mit rounds (Schuss im Vorrat), munCost (Munition aus dem FOB-Lager je Schuss beim Nachladen), cooldown, damage nach Panzerklasse,
// optional targets (Klassen, gegen die diese Waffe bevorzugt wird). Daraus entstehen range, damage (bester Wert je Klasse) und ammoMax.
// cost: fehlende Schlüssel = 0. Alle Einheiten entstehen in der Haupt-FOB; hotkey: Taste im Ausbildungsmenü.
// buildTime: Ausbildungsrate der Haupt-FOB in Sekunden (eine Ausbildung nach der anderen).
// fuelMax: Treibstoffvorrat. Alle Einheiten kosten nur Geld und starten voll munitioniert und betankt.
// builder: 'all' = darf alle Gebäude bauen und reparieren, 'fort' = nur Mauer und Tor, fehlt = kein Bauen.
// Treffer bis zum Abschuss je Ziel (Einheitentyp, sonst Panzerklasse): Zahl oder SIDES(vorn, seitlich, hinten).
const SIDES = (front, side, rear) => ({ front, side, rear });

export const UNITS = {
  rifleman: {
    name: 'Schütze',
    armor: 'inf',
    hp: 100,
    speed: 45,
    radius: 6,
    sight: 260,
    // Waffen: rounds = Schuss im Vorrat, munCost = Munition (FOB-Lager) je Schuss beim Nachladen.
    // Gewehr: 2 Magazine à 30 Schuss; 1 Magazin = 1 Munition.
    weapons: [
      { id: 'rifle', name: 'Gewehr', range: 200, cooldown: 1.0, rounds: 60, munCost: 1 / 30, hits: { inf: 4 }, damage: { inf: 12, light: 3, heavy: 1, struct: 4, air: 3 } },
    ],
    cost: { money: 60 },
    buildTime: 5,
    producedAt: 'fob',
    fuelPerSec: 0,
    builder: 'fort',
    bmCap: 50, // Soldaten tragen wenig Baumaterial und bauen daraus Mauern und Tore (im Bauradius einer FOB)
    canRide: true,
    hotkey: 'Q',
  },
  at: {
    name: 'Panzerabwehrsoldat',
    armor: 'inf',
    hp: 90,
    speed: 40,
    radius: 6,
    sight: 260,
    // Panzerfaust/RPG: 5 Schuss à 10 Munition, auch gegen Hubschrauber
    weapons: [
      { id: 'rpg', name: 'RPG', range: 240, cooldown: 3.0, rounds: 5, munCost: 10, hits: { inf: 1, tank: SIDES(6, 4, 3), ifv: SIDES(4, 3, 2), light: 2 }, damage: { inf: 10, light: 90, heavy: 120, struct: 60, air: 40 } },
    ],
    cost: { money: 120 },
    buildTime: 8,
    producedAt: 'fob',
    fuelPerSec: 0,
    builder: 'fort',
    bmCap: 50,
    canRide: true,
    hotkey: 'W',
  },
  truck: {
    name: 'LKW',
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
    producedAt: 'fob',
    ammoPerShot: 0,
    fuelPerSec: 0.2,
    fuelMax: 30,
    cargoCap: 400, // Ladung (Summe aller Sorten)
    seats: 2,
    hotkey: 'E',
  },
  engineer: {
    name: 'Baufahrzeug',
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
    producedAt: 'fob',
    ammoPerShot: 0,
    fuelPerSec: 0.3,
    fuelMax: 40,
    builder: 'all',
    canRide: true,
    seats: 1,
    hotkey: 'R',
  },
  ifv: {
    name: 'Schützenpanzer',
    armor: 'light',
    hp: 450,
    speed: 85,
    radius: 12,
    sight: 300,
    // Granatwerfer: 60 Granaten à 10 Munition; MG: 300 Schuss à 5
    weapons: [
      { id: 'grenade', name: 'Granatwerfer', range: 240, cooldown: 2.0, rounds: 60, munCost: 10, targets: ['light', 'heavy', 'struct'], hits: { inf: 1, tank: SIDES(10, 8, 7), ifv: SIDES(8, 6, 5), light: 3 }, damage: { inf: 30, light: 40, heavy: 10, struct: 25 } },
      { id: 'mg', name: 'MG', range: 220, cooldown: 0.25, rounds: 300, munCost: 5, hits: { inf: 2 }, damage: { inf: 9, light: 3, heavy: 1, struct: 3, air: 6 } },
    ],
    cost: { money: 250 },
    buildTime: 12,
    producedAt: 'fob',
    fuelPerSec: 0.4,
    fuelMax: 40,
    seats: 6,
    hotkey: 'A',
  },
  tank: {
    name: 'Kampfpanzer',
    armor: 'heavy',
    hp: 1100,
    speed: 60,
    radius: 15,
    sight: 320,
    // Hauptkanone: 30 Schuss à 20 Munition, 6 s Nachladezeit; MG: 300 Schuss à 5
    weapons: [
      { id: 'cannon', name: 'Hauptkanone', range: 300, cooldown: 6, rounds: 30, munCost: 20, targets: ['light', 'heavy', 'struct'], hits: { inf: 1, tank: SIDES(4, 3, 2), ifv: SIDES(3, 3, 2), light: 2 }, damage: { inf: 45, light: 120, heavy: 150, struct: 120 } },
      { id: 'mg', name: 'MG', range: 220, cooldown: 0.25, rounds: 300, munCost: 5, hits: { inf: 2 }, damage: { inf: 10, light: 3, heavy: 0, struct: 2, air: 3 } },
    ],
    cost: { money: 500 },
    buildTime: 20,
    producedAt: 'fob',
    fuelPerSec: 0.6,
    fuelMax: 60,
    hotkey: 'S',
  },
  // Hubschrauber (armor 'air'): fliegen geradeaus über alles, nur Flugabwehr und leichte Waffen schaden ihnen.
  // seats: Passagiere (Hubschrauber: Infanterie/Baufahrzeug mit canRide; LKW 2, Baufahrzeug 1, Schützenpanzer 6: nur Infanterie), cargoCap: Ressourcenladung wie ein LKW.
  littlebird: {
    name: 'Little Bird',
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
    producedAt: 'fob',
    ammoPerShot: 0,
    fuelPerSec: 0.5,
    fuelMax: 60,
    seats: 5,
    hotkey: 'D',
  },
  transporter: {
    name: 'Transporthubschrauber',
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
    producedAt: 'fob',
    ammoPerShot: 0,
    fuelPerSec: 0.7,
    fuelMax: 90,
    seats: 9,
    cargoCap: 400,
    hotkey: 'F',
  },
  gunship: {
    name: 'Kampfhubschrauber',
    armor: 'air',
    air: true,
    hp: 650,
    speed: 150,
    radius: 13,
    sight: 400,
    // Bordkanone: 300 Schuss à 10 Munition; 10 Raketen à 100 Munition (gegen Panzer, Gebäude, Hubschrauber)
    weapons: [
      { id: 'cannon', name: 'Bordkanone', range: 340, cooldown: 0.5, rounds: 300, munCost: 10, damage: { inf: 22, light: 26, heavy: 30, struct: 18, air: 10 } },
      { id: 'rocket', name: 'Raketen', range: 340, cooldown: 3, rounds: 10, munCost: 100, targets: ['heavy', 'struct', 'air'], damage: { inf: 40, light: 120, heavy: 220, struct: 120, air: 150 } },
    ],
    cost: { money: 900 },
    buildTime: 28,
    producedAt: 'fob',
    fuelPerSec: 0.8,
    fuelMax: 70,
    hotkey: 'G',
  },
};

// Abgeleitete Gesamtwerte aus den Waffen: größte Reichweite, bester Schaden je Klasse, Munitionswert des vollen Vorrats.
for (const def of Object.values(UNITS)) {
  if (!def.weapons) continue;
  def.range = Math.max(...def.weapons.map((w) => w.range));
  def.cooldown = def.weapons[0].cooldown;
  def.damage = {};
  for (const w of def.weapons) {
    for (const [k, v] of Object.entries(w.damage)) def.damage[k] = Math.max(def.damage[k] || 0, v);
  }
  def.ammoMax = def.weapons.reduce((sum, w) => sum + w.rounds * w.munCost, 0);
}
