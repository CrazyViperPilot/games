// Gebäudewerte (docs/verlauf.md §3.3). w, h in Zellen. Alle Gebäude haben Rüstung 'struct'.
// Optional: weapon {range, minRange, cooldown, damage, splash, shell, ammoPerShot}, aa {range, cooldown, chance, ammoPerShot},
// buildable (false = nur per LKW), blocksAll (Mauer), gate (Tor), cap/reach/roofs (Gefechtsturm).
// hotkey: Taste im Baumenü, null = keine.
export const BUILDINGS = {
  fob: {
    name: 'FOB',
    armor: 'struct',
    w: 3,
    h: 3,
    hp: 2500,
    sight: 450,
    cost: { bm: 400 },
    buildTime: 30,
    hotkey: null,
    // bildet nur die Haupt-FOB aus (entities.js: b.produces); alle anderen FOBs bilden nichts aus
    produces: ['rifleman', 'at', 'sniper', 'truck', 'engineer', 'ifv', 'tank', 'flak', 'sam', 'littlebird', 'transporter', 'gunship', 'commander'],
    weapon: {
      range: 220,
      minRange: 0,
      cooldown: 0.6,
      damage: { inf: 12, light: 4, heavy: 1, struct: 4, air: 2 },
      splash: 0,
      shell: false,
      ammoPerShot: 0, // Basis wehrt sich immer
    },
    buildable: false,
  },
  wall: {
    name: 'Mauer',
    short: 'Mauer', // Kurzname in der Befehlskarte
    armor: 'struct',
    w: 1,
    h: 1,
    hp: 600,
    sight: 0,
    cost: { bm: 8 },
    buildTime: 2,
    hotkey: 'E',
    produces: [],
    blocksAll: true,
  },
  gate: {
    name: 'Tor',
    short: 'Tor', // Kurzname in der Befehlskarte
    armor: 'struct',
    w: 1,
    h: 1,
    hp: 800,
    sight: 0,
    cost: { bm: 25 },
    buildTime: 4,
    hotkey: 'R',
    produces: [],
    gate: true, // eigene Einheiten passieren
  },
  mortar: {
    name: 'Mörser',
    short: 'Mörser', // Kurzname in der Befehlskarte
    armor: 'struct',
    w: 2,
    h: 2,
    hp: 700,
    sight: 300,
    cost: { bm: 200, mun: 60 },
    buildTime: 20,
    hotkey: 'T',
    produces: [],
    weapon: {
      range: 800,
      minRange: 200,
      cooldown: 20, // seltene, gezielte Schüsse (Ziel wählen)
      damage: { inf: 60, light: 50, heavy: 25, struct: 80 },
      splash: 60,
      shell: true, // indirektes Feuer: Flugzeit = Distanz / 300
      ammoPerShot: 4, // je Granate
    },
  },
  aa: {
    name: 'Flugabwehr',
    short: 'Flak', // Kurzname in der Befehlskarte
    armor: 'struct',
    w: 2,
    h: 2,
    hp: 700,
    sight: 300,
    cost: { bm: 180, mun: 40 },
    buildTime: 18,
    hotkey: 'Z',
    produces: [],
    aa: { range: 350, cooldown: 0.6, chance: 0.7, ammoPerShot: 0.25 }, // je Abfangversuch
    weapon: {
      range: 320,
      minRange: 0,
      cooldown: 0.4,
      damage: { inf: 10, light: 12, heavy: 2, struct: 4, air: 35 }, // schießt Hubschrauber ab (Munition aus der FOB)
      splash: 0,
      shell: false,
      ammoPerShot: 0.25,
    },
  },
  // Gefechtsturm (Festung, PRD §5a): bis zu `cap` Soldaten besetzen ihn, sind dort geschützt und schießen mit `reach` px mehr Reichweite
  // (js/game/tower.js, Besatzung wie im Häuserkampf). Fällt der Turm, fallen sie verletzt heraus (BALANCE.fortress.ejectDamage).
  // Aufs Dach kommt ein Aufbau (Befehl 'roof', ein Aufbau je Turm, Kosten aus dem Lager einer FOB im Bauradius, `time` Sekunden):
  // Mörser, Flak oder SAM. Der Aufbau feuert nur, solange mindestens ein Soldat im Turm sitzt; Munition kommt aus dem FOB-Lager.
  tower: {
    name: 'Gefechtsturm',
    short: 'Turm', // Kurzname in der Befehlskarte
    armor: 'struct',
    w: 2,
    h: 2,
    hp: 1500,
    sight: 380,
    cost: { bm: 220 },
    buildTime: 25,
    hotkey: 'V',
    produces: [],
    cap: 3,
    reach: 60,
    roofs: {
      mortar: { name: 'Mörser', short: 'Mörser', hotkey: 'T', cost: { bm: 120, mun: 60 }, time: 12 },
      flak: { name: 'Flak', short: 'Flak', hotkey: 'Z', cost: { bm: 100, mun: 40 }, time: 10 },
      sam: {
        name: 'SAM',
        short: 'SAM',
        hotkey: 'N',
        cost: { bm: 150, mun: 80 },
        time: 14,
        // Boden-Luft-Rakete: nur gegen Luftziele, weite Reichweite, seltene Schüsse
        weapon: { range: 560, minRange: 60, cooldown: 2.5, damage: { air: 160 }, splash: 0, shell: false, ammoPerShot: 1 },
      },
    },
  },
  // Sendemast (nach dem Wunder aus Age of Empires II): zweite Siegbedingung, nur wenn in der Partie eingeschaltet (Game radio).
  // Einer je Team (unique). Fertig ist er für den Gegner immer sichtbar; hält er BALANCE.radio.hold Sekunden, gewinnt sein Team.
  radio: {
    name: 'Sendemast',
    short: 'Sendemast', // Kurzname in der Befehlskarte
    armor: 'struct',
    w: 2,
    h: 2,
    hp: 3000,
    sight: 350,
    cost: { money: 2000, bm: 600 },
    buildTime: 120,
    hotkey: 'G',
    produces: [],
    radio: true,
    unique: true,
  },
  drill: {
    name: 'Bohrer',
    short: 'Bohrer', // Kurzname in der Befehlskarte
    armor: 'struct',
    w: 2,
    h: 2,
    hp: 600,
    sight: 200,
    cost: { bm: 150 },
    buildTime: 20,
    hotkey: 'X',
    produces: [],
    // Aufwärmen nach dem Bau, aktiv (zieht die Hot Zone an, braucht Treibstoff aus der FOB), dann Abkühlen (Sekunden)
    drill: { warmup: 30, active: 120, cooldown: 300, fuelPerSec: 1 },
  },
};

// Dachaufbauten teilen sich die Waffenwerte mit dem freistehenden Mörser und der Flugabwehr (eine Quelle für die Zahlen)
BUILDINGS.tower.roofs.mortar.weapon = BUILDINGS.mortar.weapon;
BUILDINGS.tower.roofs.flak.weapon = BUILDINGS.aa.weapon;
BUILDINGS.tower.roofs.flak.aa = BUILDINGS.aa.aa;
