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
  // Start: 2 Kampfpanzer (10 Plätze), 3 Schützenpanzer (9), LKW und Baufahrzeug (2), 29 Soldaten (22 Schützen, 7 Panzerabwehr) = 50 Plätze;
  // dazu der Kommandeur (0 Plätze, hinten an der Haupt-FOB)
  startUnits: ['truck', 'engineer', 'tank', 'tank', 'ifv', 'ifv', 'ifv', ...Array(22).fill('rifleman'), ...Array(7).fill('at'), 'commander'],
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
    // weather: nutzt das Wetter (bei schlechter Sicht früher ein Späher, im Nebel greift die Welle schon mit weniger Stärke an)
    easy: { think: 3.0, incomeMult: 0.8, attackStrength: 2500, scout: false, counter: false, raid: false, fallback: false, weather: false },
    normal: { think: 2.0, incomeMult: 1.0, attackStrength: 2000, scout: true, counter: true, raid: false, fallback: false, weather: true },
    hard: { think: 1.0, incomeMult: 1.0, attackStrength: 1600, scout: true, counter: true, raid: true, fallback: true, weather: true },
  },
  // Gelände (§7): wer höher steht, trifft härter (Direktfeuer, ab `dead` Höhenunterschied, voll ab `full`), tiefer stehend schwächer
  height: { bonus: 0.25, dead: 6, full: 36 },
  // Sicht im Gelände: Weitsicht von oben (+ (Höhe − base) / per, höchstens max), Kämme verdecken, was dahinter liegt.
  // eye = Augenhöhe über dem Boden (Infanterie, Fahrzeuge, Gebäude), target = Höhe, ab der ein Ziel hinter einer Kuppe auftaucht,
  // near = Gelände näher als das verdeckt nichts (man tritt an die Hangkante und schaut hinab)
  sightHeight: { base: 40, per: 350, max: 0.4, eye: { inf: 16, veh: 20, bld: 30 }, target: 12, near: 72 },
  // Tempo am Hang: Faktor = 1 − Steigung × up (bergab: 1 + Gefälle × down), begrenzt auf min … max; Fahrzeuge spüren es stärker
  slope: { upVeh: 1.5, upInf: 0.8, downVeh: 0.6, downInf: 0.3, min: 0.55, max: 1.2, pathCost: 1.2 },
  // Häuserkampf (§7): Infanterie besetzt Stadthäuser (cap Plätze, hp hält das Haus aus), schießt von dort mit Reichweite ab Hauswand
  // und steht `floor` px höher (Höhenvorteil). Schwere Waffen (Schaden gegen Gebäude ab `heavy`: Kanone, RPG, Granaten, Mörser)
  // treffen Häuser × heavyMult, Handwaffen nur × lightMult. Stürzt ein Haus ein, fallen die Besatzer mit ejectDamage (Anteil der
  // vollen HP) Schaden heraus. minSize: kleinere Gebäude (Mauern) sind keine Häuser; enterReach: Abstand zur Wand beim Betreten.
  garrison: {
    kinds: {
      house: { cap: 4, hp: 700, name: 'Wohnhaus' },
      hall: { cap: 8, hp: 1200, name: 'Halle' },
      factory: { cap: 10, hp: 1800, name: 'Fabrik' },
      station: { cap: 8, hp: 1200, name: 'Bahnhof' },
    },
    minSize: 40,
    floor: 24,
    ejectDamage: 0.35,
    enterReach: 56,
    heavy: 25,
    heavyMult: 1.5,
    lightMult: 0.5,
  },
  // Tarnung (Scharfschütze): Gegner sehen die Einheit nur nahe an eigenen Einheiten/Gebäuden oder kurz nach einem Schuss
  stealth: { detectRange: 160, revealTime: 4 },
  // Versorgungskisten (§3, nach den Reliquien aus Age of Empires II): liegen abseits der Zone (pairs Paare, punktsymmetrisch).
  // Ein Soldat hebt eine auf (pickReach), trägt sie mit carrySpeed-Tempo und ohne zu schießen zur nächsten eigenen fertigen FOB
  // (deliverReach zur Wand); jede eingelagerte Kiste bringt dem Team `income` Geld/s. Fällt der Träger oder die FOB, liegt sie wieder am Boden.
  crates: { pairs: 3, income: 1, carrySpeed: 0.75, pickReach: 40, deliverReach: 100 },
  // Sichtbarer Schaden (rein optisch): Wracks zerstörter Fahrzeuge und Gebäude (wreckLife s, die letzten wreckFade s blassen sie aus,
  // höchstens wreckMax), Krater von Mörsereinschlägen (Radius craterR) und Brandflecken unter Wracks (craterLife s, höchstens craterMax).
  scars: { wreckLife: 240, wreckFade: 30, wreckMax: 80, craterLife: 180, craterFade: 30, craterMax: 150, craterR: 22 },
  // Tiere (rein optisch, nach den Jagdtieren aus Age of Empires II): `pairs` Rudelpaare (punktsymmetrisch) außerhalb der Zone, Rehe
  // (deer Tiere je Rudel) und Wildschweine (boar). Sie grasen und ziehen langsam (walk px/s) weiter; kommt eine Einheit näher als
  // scare (je Art: Infanterie, Fahrzeug, Hubschrauber) oder knallt es in boom px, flieht das ganze Rudel (run px/s) flee px weit.
  // Formationen (§8, nach Age of Empires II): Abstand = größter Durchmesser + gap (spacingMin … spacingMax px); Linie höchstens
  // lineMax breit, Kolonne ab columnSingle Einheiten zweireihig. Geschlossen fahren: wer mehr als lead px (Restweg) vor dem Median
  // liegt, bremst (je brake px weiter voraus stärker, bis slowest × Grundtempo); wer mehr als lag px zurückliegt, fährt eigenes Tempo.
  formation: { gap: 12, spacingMin: 26, spacingMax: 44, lineMax: 10, columnSingle: 8, lead: 16, brake: 80, slowest: 0.1, lag: 80, stuck: 3, stuckDist: 8 },
  // Kommandeur (Held, einer je Team): Aura-Radius, Feuerrate darin (×), Heilung der Infanterie darin (HP/s, erst healDelay s nach dem
  // letzten Treffer); fällt er, bekommt der Gegner deathPoints Punkte
  commander: { aura: 300, fireRate: 1.1, heal: 1.5, healDelay: 6, deathPoints: 5 },
  // Sendemast (zweite Siegbedingung): so lange halten (s) = Sieg; Warnung an beide, wenn noch warn s fehlen
  radio: { hold: 300, warn: 60 },
  // Wetter und Jahreszeiten (nach Empire Earth II, im Startmenü; ohne Angabe aus): Sichtweite × sight je Wetter; Bodenfahrzeuge
  // × vehicle bei Schneefall, × winter auf Winterboden. Ein Wetter hält phase s (Zufall je Art), Übergänge blenden über fade s.
  // Häufigkeit (Gewichte) des nächsten Wetters je Jahreszeit: odds (nie dasselbe Wetter zweimal hintereinander).
  weather: {
    sight: { clear: 1, rain: 0.8, fog: 0.65, snow: 0.8 },
    vehicle: 0.8,
    winter: 0.9,
    phase: { clear: [180, 360], rain: [100, 200], fog: [90, 180], snow: [100, 200] },
    fade: 20,
    odds: {
      summer: { clear: 6, rain: 3, fog: 1 },
      autumn: { clear: 3, rain: 4, fog: 3 },
      winter: { clear: 4, snow: 4, fog: 2 },
    },
  },
  animals: {
    pairs: 4,
    deer: [3, 5],
    boar: [2, 4],
    walk: 26,
    run: { deer: 170, boar: 130 },
    scare: { inf: 180, vehicle: 320, air: 280, boom: 380 },
    flee: [350, 520],
    think: 0.25,
  },
  resNames: { money: 'Geld', bm: 'Baumaterial', mun: 'Munition', fuel: 'Treibstoff' },
  teamNames: ['Blau', 'Rot'],
  teamColors: ['#3d8bfd', '#e5484d'],
};
