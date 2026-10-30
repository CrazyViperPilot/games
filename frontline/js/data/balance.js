// Alle globalen Spielzahlen. Einheiten: units.js, Gebäude: buildings.js, KI: ai.js, Kartengenerator: mapgen.js (alle in js/data/). Wegweiser: CLAUDE.md.
//
// Inhalt (Suche nach dem Schlüssel):
//   QUICK            Schnelleinstellungen: die Werte, die man am häufigsten ändert (gleich hier oben)
//   Partie und Sieg  map, tickRate, winPoints, pointInterval, radio
//   Geld             startRes, walletMax, bounty, zone, hot, crates
//   Einheiten        slotCap, startUnits, reinforce, queueMax, trainSlots, fuelSlowMul, leash, scanInterval
//   FOB und Bauen    fob, construction, demolishRefund
//   Logistik         logistics, shortageWarn, baseAttackWarn
//   KI-Schwierigkeit difficulty (weitere KI-Werte: ai.js)
//   Kampf, Gelände   height, slope, airFire, sightHeight, fogInterval, stealth, garrison, fortress, commander, formation
//   Wetter, Technik  weather, research, river
//   Nur Optik        scars, animals
//   Startmenü        menuDefaults
//   Texte, Farben    resNames, teamNames, teamColors

// == SCHNELLEINSTELLUNGEN ==
// Hier ändern; BALANCE unten liest diese Werte. Danach PRD und Hilfetexte (js/ui/menu.js) anpassen (CLAUDE.md, Regel 7).
export const QUICK = {
  unitLimit: 300, // Einheitenlimit in Plätzen je Team (Soldat, LKW, Hubschrauber 1, SPz 3, KPz 5, Flak/SAM 2: `slots` in units.js)
  startMoney: 800, // Startgeld (die Kasse bleibt von Runde zu Runde, höchstens walletMax)
  walletMax: 5000, // Obergrenze der Kasse, die von Runde zu Runde bleibt
  moneyPerUnitZone: 0.4, // Geld je Sekunde und eigene Einheit in der Konfliktzone
  moneyPerUnitHot: 0.8, // Geld je Sekunde und Einheit in der Hot Zone (statt moneyPerUnitZone, nicht zusätzlich)
  moneyPerCrate: 1, // Geld je Sekunde und eingelagerte Versorgungskiste
  winPoints: 100, // Siegpunkte (Standard; im Startmenü 25, 50 oder 100)
  pointEvery: 30, // Sekunden Zonenkontrolle je Siegpunkt
  radioHold: 1800, // Sekunden, die ein fertiger Sendemast stehen muss, bis sein Team gewinnt (30 min)
  maxFobs: 10, // FOBs je Team, mit Haupt-FOB
  fobMaterial: 400, // Baumaterial, das eine FOB-Baustelle im Lager braucht, bevor gebaut wird
  storeCap: 3000, // Lager je Sorte (Baumaterial, Munition, Treibstoff) und FOB
  truckLoad: 400, // Ladung eines LKW (Summe aller Sorten)
  trainSlots: 2, // so viele Einheiten bildet die Haupt-FOB gleichzeitig aus
  queueMax: 5, // Länge der Ausbildungs-Warteschlange
  reinforceEvery: 6, // Sekunden je kostenloser Schütze, solange weniger als reinforce.soldierMin Soldaten leben
  // Startarmee: 2 Kampfpanzer (10 Plätze), 3 Schützenpanzer (9), 3 LKW und 1 Baufahrzeug (4), 29 Soldaten (22 Schützen, 7 Panzerabwehr) = 52 Plätze;
  // dazu der Kommandeur (0 Plätze, hinten an der Haupt-FOB)
  startUnits: ['truck', 'truck', 'truck', 'engineer', 'tank', 'tank', 'ifv', 'ifv', 'ifv', ...Array(22).fill('rifleman'), ...Array(7).fill('at'), 'commander'],
};

export const BALANCE = {
  map: { width: 9024, height: 9024, tile: 32 },
  tickRate: 20, // Simulationsschritte/s
  winPoints: QUICK.winPoints,
  // Geld für Abschüsse und Bauten (Anteil am Geldpreis der Einheit bzw. am Baumaterialpreis des Gebäudes)
  bounty: { inf: 0.25, vehicle: 0.6, building: 0.2, built: 0.2, notify: 100 },
  walletMax: QUICK.walletMax, // Obergrenze der Kasse, die von Runde zu Runde bleibt
  pointInterval: QUICK.pointEvery,
  startRes: { money: QUICK.startMoney }, // Startgeld; die Haupt-FOB hat unendlich Baumaterial, Munition und Treibstoff
  // Einheitenlimit in Plätzen je Team: Soldat/LKW/Baufahrzeug/Hubschrauber 1, Schützenpanzer 3, Kampfpanzer 5, Flak und SAM 2 (`slots` in units.js)
  slotCap: QUICK.unitLimit,
  startUnits: QUICK.startUnits,
  // Startaufstellung nach Truppengattung getrennt um die Haupt-FOB. angle = Grad von der Richtung zur Kartenmitte (0 = vorn,
  // 90 = links, 180 = hinten), dist = Abstand des Ankerpunkts zur FOB-Mitte (px), gap = Lücke zwischen den Einheiten (px).
  // Eine Gattung füllt von ihrem Ankerpunkt aus die nächsten freien Plätze; Typen ohne Gruppe nehmen `fallback`.
  startLayout: {
    maxDist: 700, // weiter als so viele px von der FOB-Mitte wird nichts aufgestellt
    groups: [
      { types: ['tank', 'ifv'], angle: 0, dist: 330, gap: 26 }, // Panzer vorn
      { types: ['rifleman', 'sniper'], angle: 60, dist: 300, gap: 14 }, // Schützen links
      { types: ['at'], angle: -60, dist: 300, gap: 14 }, // Panzerabwehr rechts
      { types: ['truck', 'engineer'], angle: 180, dist: 330, gap: 24 }, // Versorgung hinten
      { types: ['flak', 'sam'], angle: -130, dist: 330, gap: 26 }, // Luftabwehr hinten rechts
      { types: ['littlebird', 'transporter', 'gunship'], angle: 130, dist: 380, gap: 40 }, // Hubschrauber hinten links
      { types: ['commander'], angle: 180, dist: 130, gap: 10 }, // Kommandeur dicht hinter der FOB
    ],
    fallback: { angle: 0, dist: 200, gap: 14 },
  },
  // Geld je Sekunde und lebende eigene Einheit in der Konfliktzone (auch umkämpft, ohne Deckel)
  zone: { r: 3300, unitIncome: QUICK.moneyPerUnitZone },
  // Hot Zone: kleiner Kreis in der Konfliktzone, wandert zufällig oder zu aktiven Bohrern.
  // Einheiten darin bringen statt unitIncome das Doppelte (unitIncome = 2 × zone.unitIncome, nicht zusätzlich).
  // drillMinFuel = Mindestvorrat der FOB, um einen Bohrer zu starten
  hot: { r: 300, speed: 40, wanderSpeed: 40 / 3, unitIncome: QUICK.moneyPerUnitHot, wanderMin: 25, wanderMax: 45, drillMinFuel: 10 },
  // Bauradien eigener FOBs dürfen sich nicht überlappen (minDistOwn = 2 × buildRadius); höchstens 10 FOBs mit der Haupt-FOB
  fob: { buildRadius: 450, minDistOwn: 900, minDistEnemy: 700, max: QUICK.maxFobs },
  queueMax: QUICK.queueMax,
  trainSlots: QUICK.trainSlots, // Ausbildungsplätze der Haupt-FOB: so viele Einträge der Warteschlange werden gleichzeitig ausgebildet
  baseAttackWarn: 20, // s zwischen zwei Meldungen „Basis wird angegriffen“
  shortageWarn: 20, // s zwischen zwei Meldungen je Sorte und Team
  fuelSlowMul: 0.25, // Tempo von Fahrzeugen ohne Treibstoff
  // Soldaten-Nachschub (§12): kostenloser Schütze an der Haupt-FOB alle `interval` s, solange weniger als `soldierMin` Infanterie lebt
  reinforce: { interval: QUICK.reinforceEvery, soldierMin: 29, unit: 'rifleman' },
  demolishRefund: 0.25, // Abriss fertiger Gebäude (Baustellen: voll)
  scanInterval: 0.25, // Zielsuche
  fogInterval: 0.25,
  leash: 300, // Idle-Einheiten verfolgen max. so weit vom Ankerpunkt
  // Logistik (§11.1–11.3)
  logistics: {
    storeCap: QUICK.storeCap, // Obergrenze je Sorte und FOB-Lager (die Haupt-FOB wird darauf immer wieder aufgefüllt)
    truckCapacity: QUICK.truckLoad, // Ladung eines LKW (Summe)
    transferRate: 100, // Laden/Entladen je s
    transferReach: 140, // LKW muss so nah an der FOB-Mitte stehen
    resupplyRate: 4, // Nachfüllen Treibstoff je s und Einheit
    bmRate: 20, // Nachfüllen Baumaterial der Soldaten je s (bmCap)
    ammoRate: 60, // Nachfüllen Munition je s und Einheit (Lagereinheiten; Waffen füllen der Reihe nach)
    resupplyInterval: 0.5, // Takt des Nachfüllens (s)
    truckSupplyRange: 180, // Nachfüllen/Mauerbau aus LKW-Ladung
    noFobWarn: 30, // s zwischen zwei Meldungen „Förderanlage ohne FOB“
    boardReach: 45, // Infanterie steigt ein, wenn sie so nah am Hubschrauber ist
    dropRing: 26, // Absetzen: Abstand der Passagiere um den Hubschrauber
  },
  // Bau und Reparatur (§11.8)
  construction: {
    helperRange: 90, // Bauer zählt, wenn ≤ 90 px vom Gebäuderand
    standRange: 60, // Bauer fährt bis hierher heran
    maxBuilders: 3,
    autoHelpRange: 400, // idle Bauer hilft automatisch
    autoRepairRange: 300, // idle Baufahrzeug repariert automatisch
    assignInterval: 1, // s, Takt der automatischen Zuweisung
    fobMaterial: QUICK.fobMaterial, // Baumaterial im Lager einer FOB-Baustelle, bevor gebaut wird
    repairRate: 0.02, // Anteil maxHp je s und Baufahrzeug
    repairCostShare: 0.5, // Baumaterial-Kosten = cost.bm × geheilt/maxHp × 0.5
    siteHpGrow: 0.9, // Baustellen-HP wächst um 90 % über die Bauzeit (Start 10 %)
    siteSight: 150, // Baustellen sehen weniger
  },
  difficulty: {
    // Schwierigkeit über Verhalten: ab normal Späher und Konter-Mix, ab schwer Überfälle und Gruppen-Rückzug; hart ohne Einkommensbonus.
    // weather: nutzt das Wetter (bei schlechter Sicht früher ein Späher, im Nebel greift die Welle schon mit weniger Stärke an)
    // research: Spielzeit (s), ab der die KI auf Stufe 2 bzw. 3 spart; upgrades: forscht auch Verbesserungen (aus Überschuss)
    // fobCap: FOBs mit Haupt-FOB (höchstens fob.max); radioFrom: Spielzeit (s), ab der sie einen Sendemast baut (Infinity = nie);
    // cratePickers: so viele Soldaten holen oder tragen gleichzeitig Versorgungskisten;
    // fort: baut ab Spielzeit `from` (s) bis zu `fobs` FOBs zur Festung aus (Mauerring, Tore, `towers` Türme mit Besatzung und Dachaufbau). Weitere KI-Werte: js/data/ai.js
    easy: { think: 3.0, incomeMult: 0.8, attackStrength: 2500, scout: false, counter: false, raid: false, fallback: false, weather: false, research: [240, 720], upgrades: false, fobCap: 3, radioFrom: Infinity, cratePickers: 1, fort: { from: Infinity, fobs: 0, towers: 0 } },
    normal: { think: 2.0, incomeMult: 1.0, attackStrength: 2000, scout: true, counter: true, raid: false, fallback: false, weather: true, research: [150, 540], upgrades: true, fobCap: 5, radioFrom: 720, cratePickers: 2, fort: { from: 600, fobs: 1, towers: 1 } },
    hard: { think: 1.0, incomeMult: 1.0, attackStrength: 1600, scout: true, counter: true, raid: true, fallback: true, weather: true, research: [90, 420], upgrades: true, fobCap: 7, radioFrom: 540, cratePickers: 3, fort: { from: 420, fobs: 2, towers: 2 } },
  },
  // Gelände (§7): wer höher steht, trifft härter (Direktfeuer, ab `dead` Höhenunterschied, voll ab `full`), tiefer stehend schwächer
  height: { bonus: 0.25, dead: 6, full: 36 },
  // Flugabwehr gegen Luftziele (Flak, SAM in units.js): Trefferchance je Schuss = hitChance der Waffe × Tempo-Faktor × Entfernungs-Faktor.
  // Tempo-Faktor (nur Waffen mit speedRef): speedRef / (speedRef + Zielgeschwindigkeit in px/s), so treffen schnelle Ziele selten.
  // Entfernungs-Faktor: 1 am Waffenrand verliert `falloff` (Anteil), direkt davor 1.
  airFire: { falloff: 0.3 },
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
  // Festung (§5a): Befehl 'fortify' an einer FOB baut einen Mauerring mit je einem Tor in der Mitte jeder Seite und `towers` Gefechtstürme
  // an den Ecken, die zum Gegner zeigen. ring = Abstand der Mauer von der FOB-Mitte (Zellen); floor = Höhenvorteil der Turmbesatzung (px);
  // ejectDamage = Schaden (Anteil der vollen HP) an der Besatzung, wenn der Turm fällt
  fortress: { ring: 4, towers: 2, floor: 40, ejectDamage: 0.35 },
  // Tarnung (Scharfschütze): Gegner sehen die Einheit nur nahe an eigenen Einheiten/Gebäuden oder kurz nach einem Schuss
  stealth: { detectRange: 160, revealTime: 4 },
  // Versorgungskisten (§3, nach den Reliquien aus Age of Empires II): liegen abseits der Zone (pairs Paare, punktsymmetrisch).
  // Ein Soldat hebt eine auf (pickReach), trägt sie mit carrySpeed-Tempo und ohne zu schießen zur nächsten eigenen fertigen FOB
  // (deliverReach zur Wand); jede eingelagerte Kiste bringt dem Team `income` Geld/s. Fällt der Träger oder die FOB, liegt sie wieder am Boden.
  // stuckHold = s, die ein Träger ohne Weg zur FOB wartet, bis er es neu versucht; stallTime = s ohne Fortkommen (Gedränge an der FOB): dann gilt die Kiste als abgeliefert, …; stallReach = … wenn der Träger so nah an der FOB-Wand steht
  crates: { pairs: 3, income: QUICK.moneyPerCrate, carrySpeed: 0.75, pickReach: 40, deliverReach: 100, stuckHold: 5, stallTime: 3, stallReach: 320 },
  // Sichtbarer Schaden (rein optisch): Wracks zerstörter Fahrzeuge und Gebäude (wreckLife s, die letzten wreckFade s blassen sie aus,
  // höchstens wreckMax), Krater von Mörsereinschlägen (Radius craterR) und Brandflecken unter Wracks (craterLife s, höchstens craterMax).
  scars: { wreckLife: 240, wreckFade: 30, wreckMax: 80, craterLife: 180, craterFade: 30, craterMax: 150, craterR: 22 },
  // Formationen (§8, nach Age of Empires II): Abstand = größter Durchmesser + gap (spacingMin … spacingMax px); Linie höchstens
  // lineMax breit, Kolonne ab columnSingle Einheiten zweireihig. Geschlossen fahren: wer mehr als lead px (Restweg) vor dem Median
  // liegt, bremst (je brake px weiter voraus stärker, bis slowest × Grundtempo); wer mehr als lag px zurückliegt, fährt eigenes Tempo.
  formation: { gap: 12, spacingMin: 26, spacingMax: 44, lineMax: 10, columnSingle: 8, lead: 16, brake: 80, slowest: 0.1, lag: 80, stuck: 3, stuckDist: 8 },
  // Kommandeur (Held, einer je Team): Aura-Radius, Feuerrate darin (×), Heilung der Infanterie darin (HP/s, erst healDelay s nach dem
  // letzten Treffer); fällt er, bekommt der Gegner deathPoints Punkte
  commander: { aura: 300, fireRate: 1.1, heal: 1.5, healDelay: 6, deathPoints: 5 },
  // Sendemast (zweite Siegbedingung): so lange halten (s) = Sieg; Warnung an beide, wenn noch warn s fehlen
  radio: { hold: QUICK.radioHold, warn: 60 },
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
  // Forschungsstufen (nach Age of Empires II und Empire Earth, im Startmenü; ohne Angabe aus): die Haupt-FOB forscht neben der
  // Ausbildung, eins nach dem anderen (money beim Start, time s, needs = nötige Stufe, tier = erreichte Stufe). unitTier: Stufe, ab
  // der eine Einheit ausgebildet werden kann (fehlt = von Anfang an; die Startarmee bleibt). Schutzwesten: Infanterie nimmt × vests
  // Schaden, Verbundpanzerung: Fahrzeuge und Hubschrauber × composite (ein Schuss, der das unverletzte Ziel sofort tötet, bleibt
  // tödlich); Wärmebildoptik: Waffenreichweite und Sicht der Einheiten × optics.
  research: {
    items: {
      tier2: { name: 'Stufe 2', money: 600, time: 60, needs: 1, tier: 2 },
      tier3: { name: 'Stufe 3', money: 1200, time: 90, needs: 2, tier: 3 },
      vests: { name: 'Schutzwesten', money: 400, time: 45, needs: 2 },
      optics: { name: 'Wärmebildoptik', money: 600, time: 60, needs: 2 },
      composite: { name: 'Verbundpanzerung', money: 800, time: 60, needs: 3 },
    },
    unitTier: { sniper: 2, ifv: 2, littlebird: 2, transporter: 2, flak: 2, tank: 3, gunship: 3, sam: 3 },
    vests: 0.85,
    composite: 0.85,
    optics: 1.1,
  },
  // Fluss mit Brücken und Furten (Zufallskarte, im Startmenü; ohne Angabe aus): Furten sind passierbar, Bodeneinheiten dort × ford
  // so schnell, die Wegsuche zahlt fordCost (Zehntel je Zelle) dazu und nimmt lieber eine Brücke. Wasser bis fordDepth unter dem
  // Spiegel zählt in einer Furt als seicht. Brücken (deck px breit) haben bridgeHp und nehmen nur auf Befehl Schaden (Häuser-Faktoren:
  // schwere Waffen mehr, Handwaffen weniger). Zerstört sperren sie; ein Baufahrzeug baut sie für rebuildCost Geld in rebuild s wieder
  // auf (mehrere schneller, höchstens construction.maxBuilders), es arbeitet bis reach px vom Brückenkopf.
  river: { ford: 0.5, fordCost: 30, fordDepth: 12, deck: 80, bridgeHp: 2400, rebuildCost: 200, rebuild: 30, reach: 90 },
  // Tiere (rein optisch, nach den Jagdtieren aus Age of Empires II): `pairs` Rudelpaare (punktsymmetrisch) außerhalb der Zone, Rehe
  // (deer Tiere je Rudel) und Wildschweine (boar). Sie grasen und ziehen langsam (walk px/s) weiter; kommt eine Einheit näher als
  // scare (je Art: Infanterie, Fahrzeug, Hubschrauber) oder knallt es in boom px, flieht das ganze Rudel (run px/s) flee px weit.
  animals: {
    pairs: 4,
    deer: [3, 5],
    boar: [2, 4],
    walk: 26,
    run: { deer: 170, boar: 130 },
    scare: { inf: 180, vehicle: 320, air: 280, boom: 380 },
    flee: [350, 520],
    think: 0.25,
    wander: 110, // so weit grast ein Tier um die Rudelmitte
    migrate: [16, 34], // s, nach so langer Zeit zieht das Rudel weiter
    migrateDist: [220, 480], // px, so weit zieht das Rudel dann
    zoneGap: 250, // Abstand der Weiden zur Zonenkante
    spawnGap: 1400, // Abstand der Rudel zu den Startpunkten
    groupGap: 1100, // Abstand der Rudel untereinander
  },
  // Standards im Startmenü (das Menü merkt sich die letzte Wahl je Gerät). new Game() ohne Angabe schaltet alles aus (Tests).
  menuDefaults: { difficulty: 'normal', radio: true, weather: 'random', research: true, river: true },
  resNames: { money: 'Geld', bm: 'Baumaterial', mun: 'Munition', fuel: 'Treibstoff' },
  teamNames: ['Blau', 'Rot'],
  teamColors: ['#3d8bfd', '#e5484d'],
};
