// Stadt (SimCity-Teil, seit v4.75): Werte der Zonenstadt (seit v4.82 auf der ganzen Karte, im eigenen Gebiet). Regeln: PRD §15. Kein DOM.
// Alle Zahlen hier einstellbar; nach Änderungen PRD §15 und Hilfetexte prüfen.
// Werte je Zellenart (Preis, Baumaterial, Größe, Strom, KI-Zielwert) stehen seit v5.59 im Register js/data/citykinds.js, Werte je Ware
// (Ertrag, Umwandlung, Marktpreise) in js/data/goods.js; die Tabellen hier werden daraus abgeleitet (gleiche Schlüssel wie bisher).
import { CITY_KINDS } from './citykinds.js';
import { GOODS } from './goods.js';

/** Tabelle Zellenart → Wert des Feldes `field` im Register (nur Arten mit Wert; Räumen ist keine Zellenart). */
const byKind = (field) => Object.fromEntries(CITY_KINDS.filter((e) => e.id && e[field] !== undefined).map((e) => [e.key, e[field]]));
/** Tabelle Ware → Wert des Feldes `field` im Warenregister. */
const byGood = (field) => Object.fromEntries(Object.entries(GOODS).filter(([, d]) => d[field] !== undefined).map(([g, d]) => [g, d[field]]));

export const CITY = {
  // ---- Schnelleinstellungen ----
  cell: 64, // Kantenlänge einer Stadtzelle auf der Karte (px, Vielfaches der Kachel 32); das Stadtraster deckt seit v4.82 die ganze Karte
  fobMargin: 64, // um jede Hauptstadt bleibt so viel Platz frei (px; dort erscheinen neue Einheiten)
  // Gebiet (seit v4.82): gebaut werden darf nur in Zellen im eigenen Gebiet. Radien in Zellen.
  territory: { main: 10, fob: 4, building: 2, interval: 1 }, // um die Hauptstadt, um jede andere fertige FOB, um jedes fertige Stadtgebäude; Neuberechnung alle interval s
  // Baugebiet (seit v5.78, Schalter „Baugebiet“ im Startmenü; nur mit `buildRules` im Spiel, Regel in js/game/city/cells.js `buildWhy`):
  // Stadtgebäude nur im eigenen Gebiet, nur auf erkundetem Gelände, nicht nahe sichtbarem Feind, nicht in der Konfliktzone.
  build: {
    fobClaim: 6, // Gebietsradius (Zellen) einer FOB mit dieser Regel; ohne sie gilt territory.fob (4), damit die KI ohne Regel gleich bleibt
    enemyR: 500, // Abstand (px), in dem keine Stadtzelle an sichtbare gegnerische Bodeneinheiten oder gegnerische Gebäude grenzt
    noZone: true, // Schalter: Stadtzellen nicht in der Konfliktzone (Kreis game.zone)
    // Anschlusspflicht (Paket „Straßen“, Teil 1): Stadtgebäude nur auf Zellen, die an eine Straße mit Verbindung zum Lager der
    // Hauptstadt grenzen (Großbau: eine Randzelle genügt). Straße, Bahn und Rollfeld sind frei, ebenso die Arten in roadFree.
    needRoad: true,
    roadFree: ['mine'], // Förderanlagen auf Vorkommen: ohne Anschlusspflicht (sie liefern an Werke; ohne Straße fördern sie wie bisher nicht)
  },
  // Einwohner als Truppen (seit v4.82): ausgebildete Einheiten brauchen so viele freie Einwohner (Startarmee und Nachschub nicht)
  crew: { default: 1, fobTruck: 2, ifv: 3, tank: 3, flak: 2, sam: 2, gepard: 3, pzh: 4, excavator: 2, littlebird: 2, transporter: 2, gunship: 2, f16: 2 },
  // Flucht (seit v4.82): Wohnzellen in der Konfliktzone leeren sich, wenn in ihnen oder den Nachbarzellen geschossen wird
  flee: { reach: 1, calm: 60 }, // Nachbarschaft (Zellen) und Ruhezeit (s), bis die Bewohner zurückziehen dürfen
  startStock: { bm: 1500, mun: 600, fuel: 1000 }, // Startlager der Hauptstadt bei eingeschalteter Stadt (sonst unendlich)
  yield: byGood('yield'), // Register js/data/goods.js: höchster Ertrag je Arbeiter und Sekunde in Werken (BM-Werk, Munitionswerk, Raffinerie, Kerosin-Raffinerie, Hütte, Stahlwerk), begrenzt durch Rohstoffe
  sight: 160, // Sichtradius (px) jedes fertigen Stadtgebäudes ab seinem Rand (seit v5.25; Großbauten + halbe Diagonale): hebt den Kriegsnebel um die eigene Stadt auf
  taxPop: 0.03, // Geld/s je Einwohner
  taxCom: 0.07, // Geld/s je Arbeiter im Gewerbe (seit v5.20 0,07, vorher 0,15); wirkt nur mit Versorgung, siehe CITY.shop
  // Gewerbe und Markt (seit v5.20, AP3b): Sie brauchen Baumaterial aus dem Lager der Hauptstadt, über die Straße angeliefert.
  // need: Baumaterial je Arbeiter und Sekunde; base: Anteil von Steuer und Zufriedenheit ohne Versorgung (mit voller Versorgung zählt alles);
  // per: Gewerbe wächst (neue Stufe) nur, solange seine Arbeitsplätze höchstens so viele sind wie arbeitsfähige Einwohner × per.
  shop: { need: 0.004, base: 0.3, per: 0.25 },

  // ---- Bau ----
  cost: byKind('cost'), // Register js/data/citykinds.js (Feld cost): Geld je Zelle, bei Großbauten (size) je Gebäude (Abriss kostenlos, keine Erstattung)
  // Großbauten (seit v5.00): Kantenlänge in Zellen (fehlt = 1; seit v5.03 auch gerade). Ein Großbau ist ein Gebäude: eine Stufe, ein
  // Ziel mit Trefferpunkten hp × Kantenlänge, Arbeitsplätze und Strom wie eine Zelle; Straße an irgendeiner Außenzelle reicht.
  // Seit v5.08 sind auch die Werke (BM-Werk, Munitionswerk, Raffinerie, Stahlwerk) 2 × 2 groß, mit eigenem Aussehen (render/works.js).
  size: byKind('size'), // Register js/data/citykinds.js (Feld size)
  // Nicht mehr baubar: der Flughafen 10 × 10 (bis v5.34), ersetzt durch den Fliegerhorst aus Bausteinen (seit v5.35: Bahn, Stellplatz,
  // Tower, Kerosintank, Munitionslager; CITY.air). Die Zellenart bleibt nur als Platzhalter in KINDS (Nummer 17), damit die Nummern
  // der späteren Arten gleich bleiben; Werkzeug, Bild und Daten gibt es seit v5.56 nicht mehr (alte Stände laden nicht, SAVE_FORMAT 3).
  retired: CITY_KINDS.filter((e) => e.retired).map((e) => e.key), // Register js/data/citykinds.js (Feld retired): ['airport']
  // Räumen reißt seit v5.16 auch diese Gebäude der Karte ab (Häuser, Hallen, Fabriken der Zonenstadt und außerhalb), kostenlos wie das
  // übrige Räumen; besetzte Häuser nicht. Wachtürme, Zug, Mauern, Fels und Wasser bleiben.
  clearable: ['house', 'hall', 'factory'],
  costBm: byKind('bm'), // Register js/data/citykinds.js (Feld bm): Baumaterial je Zelle aus dem Lager der Hauptstadt (seit v4.83: Straßen kosten Baumaterial statt Geld)

  // ---- Ausbildung (seit v4.96, PRD §15) ----
  // Mit Stadt bilden nur diese Stadtgebäude Truppen aus (die Hauptstadt nicht mehr). Sie bezahlen direkt aus der Stadt:
  // Geld aus der Kasse, Metall aus dem Stadtlager, Einwohner als Truppen; kein LKW nötig, egal wo sie stehen.
  produces: {
    barracks: ['rifleman', 'at', 'sniper', 'commander'], // Kaserne: Soldaten
    factory: ['truck', 'engineer', 'fobTruck', 'ifv', 'tank', 'flak', 'sam', 'gepard', 'pzh', 'excavator'], // Fabrikhalle: alle Fahrzeuge (auch das FOB-Fahrzeug)
    heliport: ['littlebird', 'transporter', 'gunship'], // Heliport: Hubschrauber
    stand: ['f16'], // Stellplatz/Hangar (seit v5.35): je Stellplatz ein Kampfflugzeug, das dort auch steht, tankt und nachlädt (CITY.air)
  },
  trainSlots: [0, 2, 3, 4], // gleichzeitige Ausbildungen je Stufe (Stufe 1 wie früher die Hauptstadt)

  // ---- Heilen und Reparieren (seit v5.01, PRD §15) ----
  // Ausbildungsgebäude pflegen ihre Einheiten: Kaserne heilt Soldaten, Fabrikhalle repariert Bodenfahrzeuge, Heliport Hubschrauber.
  // Das Krankenhaus heilt nur Soldaten, schneller und weiter. Wirkt auf eigene Einheiten, deren Mitte im Umkreis liegt
  // (radius Felder um das Gebäude, ein Feld = CITY.cell), erst delay s nach dem letzten Treffer; mehrere Gebäude zählen nicht doppelt.
  care: {
    delay: 6, // s ohne Treffer, bevor geheilt oder repariert wird
    levelMul: [0, 1, 1.5, 2], // Tempo × je Stufe des Gebäudes
    metalShare: 0.5, // Reparatur kostet Metall aus dem Stadtlager: metalCost der Einheit × repariert/maxHp × metalShare (Soldaten gratis)
    by: {
      barracks: { units: 'inf', radius: 2, rate: 0.02 }, // Soldaten, Anteil maxHp je s (Stufe 1: 50 s von 0 auf voll)
      factory: { units: 'ground', radius: 2, rate: 0.02 }, // Bodenfahrzeuge
      heliport: { units: 'air', radius: 2, rate: 0.03 }, // Hubschrauber
      hospital: { units: 'inf', radius: 3, rate: 0.05 }, // Krankenhaus: Soldaten (Stufe 1: 20 s von 0 auf voll)
    },
  },

  // ---- Rohstoffe (seit v4.83, PRD §15) ----
  // Vorkommen auf der Karte: je Team eine Gruppe jeder Sorte nahe der Hauptstadt, dazu umkämpfte Gruppen zwischen Basis und Zone.
  deposits: { home: { dist: [5, 9], size: 4 }, neutral: { count: 8, size: 5, ring: [6, 22] }, shore: 16 }, // Abstand in Zellen, Zellen je Gruppe; ring = Zellen außerhalb der Konfliktzone; shore = px Abstand zu Wasser und Furten (nie auf Wasser, Brücken, Straßen, seit v5.15)
  // Förderanlage (Holzfäller, Steinbruch, Erzmine, Ölquelle je nach Vorkommen): Rohstoff je Arbeiter und Sekunde; braucht seit v5.20 eine Straße (Lieferweg zum Werk, Pendler)
  extract: { wood: 0.3, stone: 0.3, ore: 0.25, oil: 0.3 },
  jobsMine: [0, 6, 12, 20], // Arbeitsplätze je Stufe einer Förderanlage
  // Verarbeitung: so viel Rohstoff braucht eine Einheit Produkt (BM aus Holz oder Stein, Roheisen aus Erz, Stahl aus Roheisen, Treibstoff
  // und Kerosin aus Öl, Munition aus Stahl). Seit v5.20: Erz → Roheisen (Hütte), Roheisen → Stahl (Stahlwerk, bisher Erz → Metall)
  convert: byGood('convert'), // Register js/data/goods.js
  // Ressourcenkette (seit v5.08) für die Flussanzeige (Knopf „Ressourcen“, js/game/flow.js, PRD §15 „Ressourcenanzeige“):
  // Werk → aus welchen Rohstoffen (Vorkommen) oder Waren es was macht. Reihenfolge = Reihenfolge der Verarbeitung.
  // Bei jeder Änderung an Rohstoffen, Werken oder Waren hier und in updateCity (js/game/city.js) mitpflegen; test/flow.test.js prüft beides.
  chain: {
    bm: { from: ['wood', 'stone'], to: 'bm' }, // Baumaterial-Werk: Holz oder Stein → Baumaterial
    smelter: { from: ['ore'], to: 'iron' }, // Hütte (seit v5.20): Erz → Roheisen (Zwischenprodukt, ohne Lager)
    steel: { from: ['iron'], to: 'metal' }, // Stahlwerk: Roheisen → Stahl (Schlüssel metal, bleibt im Stadtlager)
    fuel: { from: ['oil'], to: 'fuel' }, // Raffinerie: Öl → Treibstoff
    kero: { from: ['oil'], to: 'kero' }, // Kerosin-Raffinerie (seit v5.20): Öl → Kerosin (Stadtlager)
    mun: { from: ['metal'], to: 'mun' }, // Munitionswerk: Stahl → Munition
  },
  // Startviertel (seit v4.84): steht zu Beginn fertig (Stufe 1) neben der Hauptstadt, dazu eine Ölquelle auf dem nächsten Ölvorkommen
  // Seit v5.03: über der Straße die Großbauten Kaserne (4 × 4) und Fabrikhalle (seit v5.33 5 × 5, vorher 8 × 8) nebeneinander, big = [Art, Spalte ab Straßenanfang]
  // Ein Großbau in row (seit v5.08 die 2 × 2-Raffinerie) beginnt an seiner Spalte und reicht nach rechts und unten (dort null).
  startQuarter: { road: 12, row: ['res', 'fuel', null, 'res'], big: [['barracks', 0], ['factory', 4]] }, // Straßenlänge, die Zellen darunter, die Großbauten darüber
  startMetal: 400, // Stahl im Hauptlager zu Beginn (Stahl bleibt dort, LKW fahren es nicht; Schlüssel metal)
  startKero: 300, // Kerosin im Stadtlager zu Beginn (seit v5.20; F-16 und Hubschrauber tanken es)
  // Metall je ausgebildeter Einheit (zusätzlich zum Geld); fehlt die Sorte, kostet sie kein Metall
  metalCost: { truck: 20, engineer: 20, fobTruck: 80, ifv: 60, tank: 120, flak: 60, sam: 80, gepard: 100, pzh: 140, excavator: 80, littlebird: 60, transporter: 80, gunship: 120, f16: 160 },
  // Markt: handelt in Losen; verkaufen bringt wenig, kaufen kostet viel (Geld je Los)
  market: { lot: 100, sell: byGood('sell'), buy: byGood('buy') }, // Preise je Ware im Register js/data/goods.js

  // ---- Straßentransport (seit v5.20, Werte für AP2/AP3; PRD §15 „Straßentransport“) ----
  // cap: Einheiten je s, die eine eigene Straßenzelle trägt; mapCap: Stadtstraßen der Karte. commute: Last je Arbeiter zum Wohnen (je s).
  // maxDist: längster Weg in Zellen (weiter = kein Ziel); smooth: s, bis der Stau-Faktor folgt. Die Wege werden neu gerechnet, sobald sich
  // die Stadt ändert (Bau, Abriss, Wachstum, Ruinen, Flucht der Bewohner), nicht nach Zeit (seit dem Review von v5.20, vorher reroute 3 s).
  // connectMax (seit v5.20, AP4): längster neuer Anschluss an die Straße zum Lager in Zellen (Startviertel und KI, connectRoad in city.js).
  // maxLanes (seit v5.38): Straßen nebeneinander bilden ein mehrspuriges Band; Kapazität je Zelle × Spuren je Richtung, höchstens so viele
  transport: { cap: 12, mapCap: 20, maxLanes: 4, commute: 0.05, maxDist: 160, smooth: 2, connectMax: 30 },

  // ---- Werkslager (seit v5.69, PRD §15 „Werke und LKW am Werk“) ----
  // Jedes Werk der Arten in `kinds` (Zellenart-Schlüssel; Ware aus CITY.chain[Art].to) hat ein kleines Ausgangslager für seine Ware.
  // share: Anteil des Ausstoßes, der dorthin geht, solange es nicht voll ist (ohne Straßenweg, ohne Verlust) und dem Werk gerade ein
  // eigener LKW zugeteilt ist (Ladeauftrag oder Route ab dem Werk). Ohne LKW läuft der ganze Ausstoß wie bisher zur Hauptstadt; was im
  // Ausgangslager liegt, bleibt bis zur nächsten Abholung. cap: Obergrenze je Werk. LKW holen die Ware dort ab (Rechtsklick auf das Werk,
  // Befehl load mit work). wait: s, die ein LKW auf einer Route ab dem Werk mit Teilladung am leeren Werk wartet, bevor er abfährt
  // (voll fährt er sofort).
  pickup: { cap: 400, share: 0.5, kinds: ['bm', 'mun', 'fuel'], wait: 60 },

  // ---- Wissen (seit v4.88, Stufe 5) ----
  // Seit v5.04: ohne fertige Universität ruht jede Forschung (eine reicht, ihre Stufe zählt nicht). Rechenzentren beschleunigen sie:
  // Tempo × (1 + dcSpeed × Summe der Stufen aller Rechenzentren), höchstens maxSpeed; Strommangel bremst (js/data/research.js).
  jobsUni: [0, 8, 16, 28], // Studenten und Lehrer je Stufe (zählen als Arbeitsplätze)
  jobsDc: [0, 6, 12, 20], // Arbeitsplätze je Stufe im Rechenzentrum
  research: { dcSpeed: 0.2, maxSpeed: 3 },

  // ---- Strom und Zufriedenheit (seit v4.88, Stufe 3) ----
  // Strom wirkt stadtweit (keine Leitungen). Angebot: base (Notstrom der Hauptstadt) + Kraftwerke (supply je Stufe × Besetzung).
  // Bedarf je Stufe und Zellenart; reicht der Strom nicht, arbeiten Förderung, Werke und Forschung nur im Verhältnis Angebot/Bedarf.
  power: {
    base: 40,
    supply: [0, 60, 120, 200],
    use: byKind('power'), // je Zellenart im Register js/data/citykinds.js (Feld power)
  },
  // Zufriedenheit 0 … 1 = base + shops × Versorgung (Gewerbe-Arbeiter je Einwohner, voll ab shopPer) + safety × Sicherheit
  // (weniger Treffer auf die Stadt in den letzten hitWindow s, null ab hitsBad; gezählt werden höchstens CITY.ai.hitLog Treffer) + power × Strom.
  // Wirkung: Erträge und Steuern × (lo + span × Zufriedenheit), Zuzug × (0,5 + Zufriedenheit).
  happy: { base: 0.2, shops: 0.35, shopPer: 0.1, safety: 0.25, hitsBad: 10, hitWindow: 60, power: 0.2, lo: 0.7, span: 0.4 },

  // ---- Fliegerhorst (seit v5.35, PRD §15 „Fliegerhorst“; Logik js/game/aircraft.js) ----
  // Start-/Landebahn: Zellen wie Straßen (sofort fertig); in jeder Gruppe Bahnzellen ist der längste gerade Streifen runwayWidth breit die
  // Bahn, wenn er mindestens runwayMin lang ist (waagrecht oder senkrecht), der Rest Rollfeld (seit v5.37; dazu Werkzeug „Rollfeld“ taxi). Jeder Start und jede Landung sperrt die Bahn sep s, mit Tower im Umkreis atcRadius Zellen sepAtc s.
  // Stellplatz (2 × 2): je ein Flugzeug, bildet es aus; Schaden an einem abgestellten Flugzeug × shelter[Stufe] (1 offen, 2 Überdachung,
  // 3 Stahlbeton). Kerosintank und Munitionslager (2 × 2) werden über die Straße aus dem Stadtlager bzw. dem Lager der Hauptstadt
  // befüllt (fill je s, Stufe × Rate), Flugzeuge auf Stellplätzen im Umkreis supplyRadius Zellen tanken und laden daraus (rate je s).
  air: {
    runwayMin: 8,
    runwayWidth: 2,
    sep: 14,
    sepAtc: 7,
    atcRadius: 14,
    atcSight: 360, // Sicht (px) des Towers ab seinem Rand statt CITY.sight (Radar, seit v5.57): überblickt Bahn und Anflug, nicht die Front
    supplyRadius: 12,
    shelter: [1, 1, 0.5, 0.15],
    // Ausbau der Stellplätze (seit v5.39, Daniels Wunsch): nicht mehr von selbst, nur über „Ausbauen“ am gewählten Stellplatz.
    // Stufe 2 Überdachung (Stahldach auf Stützen), Stufe 3 Stahlbeton-Shelter (Hardened Aircraft Shelter); Kosten je Stufe
    // (Geld, Baumaterial aus dem Lager der Hauptstadt, Stahl aus dem Stadtlager). Die KI baut aus, wenn danach upgradeAiReserve Geld
    // und CITY.ai.upgradeBuffer Baumaterial und Stahl bleiben.
    upgrade: { 2: { money: 300, bm: 150, steel: 0 }, 3: { money: 700, bm: 300, steel: 150 } },
    upgradeAiReserve: 1200,
    standName: ['', 'Offener Stellplatz', 'Überdachter Stellplatz', 'Stahlbeton-Shelter'],
    // Heliport als Landeplatz (seit v5.51, Daniels Wunsch, Logik js/game/helipad.js): ein Hubschrauber je Heliport, dort ausgebildet,
    // startet und landet senkrecht (liftTime s), tankt und lädt gelandet aus Kerosintank und Munitionslager im Umkreis supplyRadius
    // (Raten wie bei den Jets, tank.rate/depot.rate je Stufe des Lagers). Start und Landung sperren alle Heliports im Umkreis sepRadius
    // Zellen sep s, mit Tower (atcRadius) sepAtc s. Heimflug, wenn der Treibstoff nur noch für den Heimweg × home + reserve s reicht
    // oder die Bordwaffen leer sind.
    heli: { liftTime: 2.5, sep: 6, sepAtc: 2, sepRadius: 6, home: 1.3, reserve: 6 },
    tank: { cap: [0, 300, 600, 1000], rate: [0, 3, 6, 10], fill: [0, 6, 12, 20] }, // Kerosin: Lager, Tanken je s, Befüllen je s
    depot: { cap: [0, 400, 800, 1400], rate: [0, 6, 12, 20], fill: [0, 10, 20, 32] }, // Munition: Lager, Nachladen je s, Befüllen je s
  },

  // ---- Angriff (seit v4.83) ----
  hp: [0, 300, 500, 800], // Trefferpunkte eines Stadtgebäudes je Stufe
  ruinTime: 30, // s, so lange liegt eine Ruine, bevor die Zelle neu wächst
  bountyBm: 100, // Wert je Stufe für die Abschussprämie (davon BALANCE.bounty.building)

  // ---- Wachstum ----
  maxLevel: 3, // Ausbaustufen eines Gebäudes
  growTime: 15, // s von der Ausweisung bis zum Gebäude Stufe 1 (nur mit Straßenanschluss)
  upgradeTime: 45, // s je weitere Stufe (nur bei Bedarf, siehe demand)
  demand: 0.8, // Wohnen wächst, wenn Arbeitsplätze >= Einwohner x demand; Arbeitsstätten, wenn Einwohner >= Arbeitsplätze x demand
  housing: [0, 8, 20, 40], // Wohnplätze je Stufe (Index = Stufe)
  jobs: [0, 8, 20, 40], // Arbeitsplätze je Stufe in Werken
  jobsCom: [0, 6, 14, 28], // Arbeitsplätze je Stufe im Gewerbe
  immigration: 2, // Einwohner/s, die einziehen (oder abwandern), bis die Wohnplätze gefüllt sind
  startPop: 4, // Einwohner ohne jeden Arbeitsplatz (nur ein Anfang)

  // ---- KI ----
  ai: {
    interval: { easy: 12, normal: 8, hard: 5 }, // Takt (s)
    reserve: { easy: 500, normal: 300, hard: 200 }, // Geld, das sie für die Armee übrig lässt
    perStep: 4, // so viele Zellen je Takt
    mineFrom: 4, // Förderanlagen setzt sie erst, wenn die Stadt mindestens so viele Zellen hat
    roadEvery: 3, // jede so vielte Zeile (vom Anker aus) wird Straße, dazu eine Straßenspalte durch den Anker
    quarter: 3, // Radius (Zellen) der kleinen Viertel an vorderen FOBs
    quarterEvery: 3, // jeder so vielte Takt baut an einer vorderen FOB statt an der Hauptstadt
    mix: { com: 2, bm: 3, mun: 2, fuel: 2, kero: 1, smelter: 2, steel: 2, market: 0.3 }, // Verhältnis der Arbeitsstätten (Kraftwerk, Uni, Rechenzentrum nach Bedarf)
    powerMargin: 1.15, // baut ein Kraftwerk, wenn das Stromangebot unter Bedarf × powerMargin + powerSpare fällt
    powerSpare: 10, // fester Strompuffer dazu
    // Wohnen: weist Wohnzellen aus, solange es weniger als resPerWork je Arbeitsstätte gibt, oder (bis höchstens resMax je Arbeitsstätte),
    // wenn Wohnplätze für die eingezogenen Soldaten + draftSpare fehlen oder freie Einwohner knapp sind (lowFree, lowFill)
    resPerWork: 1.2,
    resMax: 2,
    draftSpare: 20,
    munMetal: 50, // Munitionswerk gilt nur als knapp, wenn mehr Stahl als das im Stadtlager liegt
    uniFrom: 6, // Arbeitsstätten, ab denen sie eine Universität baut
    dcFrom: 16, // … ein Rechenzentrum (nach der Uni)
    sellAbove: 2700, // verkauft am Markt, wenn eine Sorte im Hauptlager darüber liegt
    buyMetalBelow: 150, // kauft Metall am Markt, wenn weniger da ist und genug Geld (reserve + Preis) bleibt
    buyBmBelow: 120, // kauft Baumaterial am Markt, wenn das Lager der Hauptstadt darunter liegt und genug Geld (reserve + Preis) bleibt (seit v5.20, AP4)
    raidEvery: { easy: 0, normal: 240, hard: 150 }, // s zwischen Angriffen auf die gegnerische Stadt (0 = nie)
    raidSize: 4, // so viele Fahrzeuge greifen an
    // Freie Planung (seit v4.85): Engpässe heben das Gewicht einer Zone im Mix
    lowStock: 800, // BM, MUN, TS im Hauptlager darunter = knapp
    lowMetal: 300, // Stahl darunter = knapp
    lowKero: 200, // Kerosin im Stadtlager darunter = knapp (seit v5.20)
    lowFree: 8, // freie Einwohner darunter = Wohnen knapp
    lowFill: 0.8, // seit v5.20: Anteil besetzter Arbeitsplätze darunter = Wohnen zuerst (auch, wenn eine Arbeitsstätte keine Wohnung über die Straße erreicht)
    lowMoney: 400, // Geld darunter = Gewerbe knapp
    boost: 4, // so viel stärker zählt eine knappe Zone
    dangerTime: 90, // s, so lange meidet sie Zellen nahe einem Treffer auf ihre Stadt
    dangerRadius: 3, // Zellen um den Treffer
    hitLog: 20, // so viele Treffer auf die eigene Stadt merkt sie sich (auch für die Zufriedenheit, CITY.happy.hitWindow)
    hitRecent: 4, // s: ein Stadtgebäude, das so kurz vorher getroffen wurde, gilt als angegriffen (Verteidigung)
    defendSize: 6, // so viele Einheiten schickt sie zu einem angegriffenen Stadtgebäude
    defendRange: 2500, // px, nur Einheiten in diesem Abstand
    defendCooldown: 12, // s zwischen zwei Verteidigungsbefehlen
    // Angriffsziele: Wert je Zellenart geteilt durch (1 + Entfernung / raidDist); Werke und Förderung zuerst
    raidDist: 1000,
    targetValue: byKind('target'), // je Zellenart im Register js/data/citykinds.js (Feld target, fehlt = 1)
    // Ausbildungsgebäude (seit v4.96): so viele will sie haben; ab moreFrom Arbeitsstätten je eins mehr (Heliport erst, wenn Hubschrauber freigeschaltet sind)
    producers: { barracks: 1, factory: 1, heliport: 2 }, // seit v5.51 zwei Heliports: einer je Hubschrauber (Späher und Transporter)
    moreFrom: 14,
    hospitalFrom: 10, // Arbeitsstätten, ab denen sie ein Krankenhaus baut (seit v5.01, eins reicht)
    airportFrom: 14, // Arbeitsstätten, ab denen sie einen Fliegerhorst baut (seit v5.35 aus Bahn, Stellplätzen, Tower, Kerosintank, Munitionslager; einer reicht)
    airportReach: 60, // so viele Zellen um die Hauptstadt sucht sie Platz für die Bahn mit ihren Bauten (runwayLen × 4 Zellen plus Rand)
    airportMoney: 900, // Geld über der Reserve, ab dem sie den Fliegerhorst anlegt
    airportBm: 800, // … und Baumaterial im Lager der Hauptstadt
    runwayLen: 10, // Länge (Zellen) der Bahn, die sie anlegt
    standBuffer: 100, // Baumaterial, das nach einem weiteren Stellplatz im Lager der Hauptstadt bleiben muss
    upgradeBuffer: { bm: 200, steel: 200 }, // Baumaterial und Stahl, die nach dem Ausbau eines Stellplatzes bleiben müssen (Geld: CITY.air.upgradeAiReserve)
    jets: { easy: 2, normal: 4, hard: 6 }, // so viele F-16 hält sie (seit v5.03; seit v5.35 je ein Stellplatz, die KI baut so viele)
    jetReserve: 400, // Geld, das nach dem Kauf einer F-16 übrig bleiben muss
    // seit v5.20 (Review): höchstens so viele Förderanlagen je Werk, das ihren Rohstoff nimmt (Holz und Stein zusammen je BM-Werk, Erz je
    // Hütte, Öl je Raffinerie oder Kerosin-Raffinerie; aufgerundet). Mehr Förderung, als die Werke verarbeiten, verstopft nur die Straßen.
    minesPer: { bm: 1, smelter: 1, oil: 0.5 },
    roadTries: 4, // seit v5.20 (AP4): so viele Gebäude ohne Lieferweg oder Pendlerweg prüft die KI je Takt auf einen Straßenanschluss
    connectNear: 5, // seit v5.20 (AP4): Werke ohne Straße zum Lager nur an Straßen höchstens so viele Zellen vom Lagernetz entfernt (sonst wird der Anschluss zu weit)
    connectRing: 1, // seit v5.20 (AP4): Zellen neben einer Straße zum Lager zählen so viele Ringe näher (Großbauten und Werke bevorzugt dort)
    // Anschlusspflicht (Paket „Straßen“, nur mit Baugebiet): hat die KI im Ausbau-Umkreis weniger freie Zellen an einer Straße zum Lager
    // als linkSpare, zieht sie je Takt eine Straße zur nächsten freien Zelle ohne Anschluss (höchstens linkTries Versuche, je bis
    // transport.connectMax Zellen); so wächst ihr Netz auch dort, wo ihr Straßenraster nicht ans Lager grenzt.
    linkSpare: 6,
    linkTries: 4,
    linkRetry: 120, // s: eine Startzelle, von der aus kein Weg ging (eingeschlossene Lücke), so lange nicht erneut versuchen
    linkBm: 200, // Baumaterial, das im Lager der Hauptstadt bleiben muss, bevor die KI ihr Netz verlängert (Anschlüsse der Werke gehen vor)
    chainNear: 6, // Zellen: mit Anschlusspflicht baut die KI Hütte und Stahlwerk zuerst so nah am Partnerwerk (Roheisen fährt nicht durchs Lager)
    linkOutlets: 2, // so viele Ausgänge (freie Zelle am Netz mit freiem Nachbarn außerhalb) lässt die KI beim Bauen offen, damit ihr Netz nicht eingeschlossen wird
  },
};
