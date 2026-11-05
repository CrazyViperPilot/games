// Stadt (SimCity-Teil, seit v4.75): Werte der Zonenstadt (seit v4.82 auf der ganzen Karte, im eigenen Gebiet). Regeln: PRD §15. Kein DOM.
// Alle Zahlen hier einstellbar; nach Änderungen PRD §15 und Hilfetexte prüfen.

export const CITY = {
  // ---- Schnelleinstellungen ----
  cell: 64, // Kantenlänge einer Stadtzelle auf der Karte (px, Vielfaches der Kachel 32); das Stadtraster deckt seit v4.82 die ganze Karte
  fobMargin: 64, // um jede Hauptstadt bleibt so viel Platz frei (px; dort erscheinen neue Einheiten)
  // Gebiet (seit v4.82): gebaut werden darf nur in Zellen im eigenen Gebiet. Radien in Zellen.
  territory: { main: 10, fob: 4, building: 2, interval: 1 }, // um die Hauptstadt, um jede andere fertige FOB, um jedes fertige Stadtgebäude; Neuberechnung alle interval s
  // Einwohner als Truppen (seit v4.82): ausgebildete Einheiten brauchen so viele freie Einwohner (Startarmee und Nachschub nicht)
  crew: { default: 1, fobTruck: 2, ifv: 3, tank: 3, flak: 2, sam: 2, gepard: 3, pzh: 4, littlebird: 2, transporter: 2, gunship: 2, f16: 2 },
  // Flucht (seit v4.82): Wohnzellen in der Konfliktzone leeren sich, wenn in ihnen oder den Nachbarzellen geschossen wird
  flee: { reach: 1, calm: 60 }, // Nachbarschaft (Zellen) und Ruhezeit (s), bis die Bewohner zurückziehen dürfen
  startStock: { bm: 1500, mun: 600, fuel: 1000 }, // Startlager der Hauptstadt bei eingeschalteter Stadt (sonst unendlich)
  yield: { bm: 0.1, mun: 0.06, fuel: 0.05, metal: 0.05, iron: 0.06, kero: 0.04 }, // höchster Ertrag je Arbeiter und Sekunde in Werken (BM-Werk, Munitionswerk, Raffinerie, Kerosin-Raffinerie, Hütte, Stahlwerk), begrenzt durch Rohstoffe
  sight: 160, // Sichtradius (px) jedes fertigen Stadtgebäudes ab seinem Rand (seit v5.25; Großbauten + halbe Diagonale): hebt den Kriegsnebel um die eigene Stadt auf
  taxPop: 0.03, // Geld/s je Einwohner
  taxCom: 0.07, // Geld/s je Arbeiter im Gewerbe (seit v5.20 0,07, vorher 0,15); wirkt nur mit Versorgung, siehe CITY.shop
  // Gewerbe und Markt (seit v5.20, AP3b): Sie brauchen Baumaterial aus dem Lager der Hauptstadt, über die Straße angeliefert.
  // need: Baumaterial je Arbeiter und Sekunde; base: Anteil von Steuer und Zufriedenheit ohne Versorgung (mit voller Versorgung zählt alles);
  // per: Gewerbe wächst (neue Stufe) nur, solange seine Arbeitsplätze höchstens so viele sind wie arbeitsfähige Einwohner × per.
  shop: { need: 0.004, base: 0.3, per: 0.25 },

  // ---- Bau ----
  cost: { road: 0, res: 20, com: 30, bm: 40, mun: 40, fuel: 40, steel: 50, smelter: 50, kero: 50, mine: 30, market: 60, power: 80, uni: 400, dc: 250, barracks: 80, factory: 150, heliport: 200, hospital: 120, airport: 800 }, // Geld je Zelle, bei Großbauten (size) je Gebäude (Abriss kostenlos, keine Erstattung)
  // Großbauten (seit v5.00): Kantenlänge in Zellen (fehlt = 1; seit v5.03 auch gerade). Ein Großbau ist ein Gebäude: eine Stufe, ein
  // Ziel mit Trefferpunkten hp × Kantenlänge, Arbeitsplätze und Strom wie eine Zelle; Straße an irgendeiner Außenzelle reicht.
  // Seit v5.08 sind auch die Werke (BM-Werk, Munitionswerk, Raffinerie, Stahlwerk) 2 × 2 groß, mit eigenem Aussehen (render/works.js).
  size: { uni: 3, power: 2, barracks: 4, factory: 8, airport: 10, bm: 2, mun: 2, fuel: 2, steel: 2, smelter: 2, kero: 2 },
  // Räumen reißt seit v5.16 auch diese Gebäude der Karte ab (Häuser, Hallen, Fabriken der Zonenstadt und außerhalb), kostenlos wie das
  // übrige Räumen; besetzte Häuser nicht. Wachtürme, Zug, Mauern, Fels und Wasser bleiben.
  clearable: ['house', 'hall', 'factory'],
  costBm: { road: 10, barracks: 100, factory: 200, heliport: 150, hospital: 80, airport: 400 }, // Baumaterial je Zelle aus dem Lager der Hauptstadt (seit v4.83: Straßen kosten Baumaterial statt Geld)

  // ---- Ausbildung (seit v4.96, PRD §15) ----
  // Mit Stadt bilden nur diese Stadtgebäude Truppen aus (die Hauptstadt nicht mehr). Sie bezahlen direkt aus der Stadt:
  // Geld aus der Kasse, Metall aus dem Stadtlager, Einwohner als Truppen; kein LKW nötig, egal wo sie stehen.
  produces: {
    barracks: ['rifleman', 'at', 'sniper', 'commander'], // Kaserne: Soldaten
    factory: ['truck', 'engineer', 'fobTruck', 'ifv', 'tank', 'flak', 'sam', 'gepard', 'pzh'], // Fabrikhalle: alle Fahrzeuge (auch das FOB-Fahrzeug)
    heliport: ['littlebird', 'transporter', 'gunship'], // Heliport: Hubschrauber
    airport: ['f16'], // Flughafen (seit v5.03): Kampfflugzeuge, die dort auch landen, tanken und nachladen (BALANCE.jets)
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
    refuel: 0.05, // seit v5.20: Anteil des Treibstofftanks je s, den ein Heliport seinen Hubschraubern im Umkreis gibt; Kerosin kommt aus dem Stadtlager (c.kero), 1 Einheit je Treibstoffeinheit
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
  convert: { bm: 1, iron: 2, metal: 1, fuel: 1, kero: 1.2, mun: 0.5 },
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
  // Seit v5.03: über der Straße die Großbauten Kaserne (4 × 4) und Fabrikhalle (8 × 8) nebeneinander, big = [Art, Spalte ab Straßenanfang]
  // Ein Großbau in row (seit v5.08 die 2 × 2-Raffinerie) beginnt an seiner Spalte und reicht nach rechts und unten (dort null).
  startQuarter: { road: 12, row: ['res', 'fuel', null, 'res'], big: [['barracks', 0], ['factory', 4]] }, // Straßenlänge, die Zellen darunter, die Großbauten darüber
  startMetal: 400, // Stahl im Hauptlager zu Beginn (Stahl bleibt dort, LKW fahren es nicht; Schlüssel metal)
  startKero: 300, // Kerosin im Stadtlager zu Beginn (seit v5.20; F-16 und Hubschrauber tanken es)
  // Metall je ausgebildeter Einheit (zusätzlich zum Geld); fehlt die Sorte, kostet sie kein Metall
  metalCost: { truck: 20, engineer: 20, fobTruck: 80, ifv: 60, tank: 120, flak: 60, sam: 80, gepard: 100, pzh: 140, littlebird: 60, transporter: 80, gunship: 120, f16: 160 },
  // Markt: handelt in Losen; verkaufen bringt wenig, kaufen kostet viel (Geld je Los)
  market: { lot: 100, sell: { bm: 20, mun: 30, fuel: 30, metal: 40, kero: 35 }, buy: { bm: 80, mun: 120, fuel: 120, metal: 160, kero: 140 } },

  // ---- Straßentransport (seit v5.20, Werte für AP2/AP3; PRD §15 „Straßentransport“) ----
  // cap: Einheiten je s, die eine eigene Straßenzelle trägt; mapCap: Stadtstraßen der Karte. commute: Last je Arbeiter zum Wohnen (je s).
  // maxDist: längster Weg in Zellen (weiter = kein Ziel); smooth: s, bis der Stau-Faktor folgt. Die Wege werden neu gerechnet, sobald sich
  // die Stadt ändert (Bau, Abriss, Wachstum, Ruinen, Flucht der Bewohner), nicht nach Zeit (seit dem Review von v5.20, vorher reroute 3 s).
  // connectMax (seit v5.20, AP4): längster neuer Anschluss an die Straße zum Lager in Zellen (Startviertel und KI, connectRoad in city.js).
  transport: { cap: 12, mapCap: 20, commute: 0.05, maxDist: 160, smooth: 2, connectMax: 30 },

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
    use: { res: 1, com: 3, market: 3, bm: 8, mun: 8, fuel: 8, kero: 8, smelter: 10, steel: 10, mine: 4, uni: 12, dc: 30, power: 0, barracks: 2, factory: 8, heliport: 6, hospital: 6, airport: 12 },
  },
  // Zufriedenheit 0 … 1 = base + shops × Versorgung (Gewerbe-Arbeiter je Einwohner, voll ab shopPer) + safety × Sicherheit
  // (weniger Treffer auf die Stadt in den letzten 60 s, null ab hitsBad) + power × Strom. Wirkung: Erträge und Steuern × (lo + span × Zufriedenheit),
  // Zuzug × (0,5 + Zufriedenheit).
  happy: { base: 0.2, shops: 0.35, shopPer: 0.1, safety: 0.25, hitsBad: 10, power: 0.2, lo: 0.7, span: 0.4 },

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
    roadEvery: 3, // jede so vielte Zeile (vom Anker aus) wird Straße, dazu eine Straßenspalte durch den Anker
    quarter: 3, // Radius (Zellen) der kleinen Viertel an vorderen FOBs
    quarterEvery: 3, // jeder so vielte Takt baut an einer vorderen FOB statt an der Hauptstadt
    mix: { com: 2, bm: 3, mun: 2, fuel: 2, kero: 1, smelter: 2, steel: 2, market: 0.3 }, // Verhältnis der Arbeitsstätten (Kraftwerk, Uni, Rechenzentrum nach Bedarf)
    powerMargin: 1.15, // baut ein Kraftwerk, wenn das Stromangebot unter Bedarf × powerMargin fällt
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
    defendSize: 6, // so viele Einheiten schickt sie zu einem angegriffenen Stadtgebäude
    defendRange: 2500, // px, nur Einheiten in diesem Abstand
    defendCooldown: 12, // s zwischen zwei Verteidigungsbefehlen
    // Angriffsziele: Wert je Zellenart (geteilt durch Entfernung); Werke und Förderung zuerst
    targetValue: { steel: 3, fuel: 3, mun: 3, power: 3, dc: 2.5, uni: 2, mine: 2.5, market: 2, bm: 2, com: 1, res: 0.5, barracks: 2.5, factory: 3, heliport: 3, hospital: 2, airport: 3.5 },
    // Ausbildungsgebäude (seit v4.96): so viele will sie haben; ab moreFrom Arbeitsstätten je eins mehr (Heliport erst, wenn Hubschrauber freigeschaltet sind)
    producers: { barracks: 1, factory: 1, heliport: 1 },
    moreFrom: 14,
    hospitalFrom: 10, // Arbeitsstätten, ab denen sie ein Krankenhaus baut (seit v5.01, eins reicht)
    airportFrom: 14, // Arbeitsstätten, ab denen sie einen Flughafen baut (seit v5.03, einer reicht; erst wenn die F-16 freigeschaltet ist)
    airportReach: 60, // so viele Zellen um die Hauptstadt sucht sie einen freien Platz für ihn
    jets: { easy: 2, normal: 4, hard: 6 }, // so viele F-16 hält sie (seit v5.03)
    jetReserve: 400, // Geld, das nach dem Kauf einer F-16 übrig bleiben muss
    // seit v5.20 (Review): höchstens so viele Förderanlagen je Werk, das ihren Rohstoff nimmt (Holz und Stein zusammen je BM-Werk, Erz je
    // Hütte, Öl je Raffinerie oder Kerosin-Raffinerie; aufgerundet). Mehr Förderung, als die Werke verarbeiten, verstopft nur die Straßen.
    minesPer: { bm: 1, smelter: 1, oil: 0.5 },
    roadTries: 4, // seit v5.20 (AP4): so viele Gebäude ohne Lieferweg oder Pendlerweg prüft die KI je Takt auf einen Straßenanschluss
    connectNear: 5, // seit v5.20 (AP4): Werke ohne Straße zum Lager nur an Straßen höchstens so viele Zellen vom Lagernetz entfernt (sonst wird der Anschluss zu weit)
    connectRing: 1, // seit v5.20 (AP4): Zellen neben einer Straße zum Lager zählen so viele Ringe näher (Großbauten und Werke bevorzugt dort)
  },
};
