// Stadt (SimCity-Teil, seit v4.75): Werte der Zonenstadt (seit v4.82 auf der ganzen Karte, im eigenen Gebiet). Regeln: PRD §15. Kein DOM.
// Alle Zahlen hier einstellbar; nach Änderungen PRD §15 und Hilfetexte prüfen.

export const CITY = {
  // ---- Schnelleinstellungen ----
  cell: 64, // Kantenlänge einer Stadtzelle auf der Karte (px, Vielfaches der Kachel 32); das Stadtraster deckt seit v4.82 die ganze Karte
  fobMargin: 64, // um jede Hauptstadt bleibt so viel Platz frei (px; dort erscheinen neue Einheiten)
  // Gebiet (seit v4.82): gebaut werden darf nur in Zellen im eigenen Gebiet. Radien in Zellen.
  territory: { main: 10, fob: 4, building: 2, interval: 1 }, // um die Hauptstadt, um jede andere fertige FOB, um jedes fertige Stadtgebäude; Neuberechnung alle interval s
  // Einwohner als Truppen (seit v4.82): ausgebildete Einheiten brauchen so viele freie Einwohner (Startarmee und Nachschub nicht)
  crew: { default: 1, ifv: 3, tank: 3, flak: 2, sam: 2, littlebird: 2, transporter: 2, gunship: 2 },
  // Flucht (seit v4.82): Wohnzellen in der Konfliktzone leeren sich, wenn in ihnen oder den Nachbarzellen geschossen wird
  flee: { reach: 1, calm: 60 }, // Nachbarschaft (Zellen) und Ruhezeit (s), bis die Bewohner zurückziehen dürfen
  startStock: { bm: 1500, mun: 600, fuel: 1000 }, // Startlager der Hauptstadt bei eingeschalteter Stadt (sonst unendlich)
  yield: { bm: 0.1, mun: 0.06, fuel: 0.05, metal: 0.05 }, // höchster Ertrag je Arbeiter und Sekunde in Werken (BM-Werk, Munitionswerk, Raffinerie, Stahlwerk), begrenzt durch Rohstoffe
  sight: 160, // Sichtradius (px) jedes fertigen Stadtgebäudes: hebt den Kriegsnebel um die eigene Stadt auf
  taxPop: 0.03, // Geld/s je Einwohner
  taxCom: 0.15, // zusätzliches Geld/s je Arbeiter im Gewerbe

  // ---- Bau ----
  cost: { road: 0, res: 20, com: 30, bm: 40, mun: 40, fuel: 40, steel: 50, mine: 30, market: 60, power: 80, uni: 150, dc: 250, barracks: 80, factory: 150, heliport: 200 }, // Geld je Zelle (Abriss kostenlos, keine Erstattung)
  costBm: { road: 10, barracks: 100, factory: 200, heliport: 150 }, // Baumaterial je Zelle aus dem Lager der Hauptstadt (seit v4.83: Straßen kosten Baumaterial statt Geld)

  // ---- Ausbildung (seit v4.96, PRD §15) ----
  // Mit Stadt bilden nur diese Stadtgebäude Truppen aus (die Hauptstadt nicht mehr). Sie bezahlen direkt aus der Stadt:
  // Geld aus der Kasse, Metall aus dem Stadtlager, Einwohner als Truppen; kein LKW nötig, egal wo sie stehen.
  produces: {
    barracks: ['rifleman', 'at', 'sniper', 'commander'], // Kaserne: Soldaten
    factory: ['truck', 'engineer', 'ifv', 'tank', 'flak', 'sam'], // Fabrikhalle: alle Fahrzeuge
    heliport: ['littlebird', 'transporter', 'gunship'], // Heliport: Hubschrauber
  },
  trainSlots: [0, 2, 3, 4], // gleichzeitige Ausbildungen je Stufe (Stufe 1 wie früher die Hauptstadt)

  // ---- Rohstoffe (seit v4.83, PRD §15) ----
  // Vorkommen auf der Karte: je Team eine Gruppe jeder Sorte nahe der Hauptstadt, dazu umkämpfte Gruppen zwischen Basis und Zone.
  deposits: { home: { dist: [5, 9], size: 4 }, neutral: { count: 8, size: 5, ring: [6, 22] } }, // Abstand in Zellen, Zellen je Gruppe; ring = Zellen außerhalb der Konfliktzone
  // Förderanlage (Holzfäller, Steinbruch, Erzmine, Ölquelle je nach Vorkommen): Rohstoff je Arbeiter und Sekunde; braucht keine Straße
  extract: { wood: 0.3, stone: 0.3, ore: 0.25, oil: 0.3 },
  jobsMine: [0, 6, 12, 20], // Arbeitsplätze je Stufe einer Förderanlage
  // Verarbeitung: so viel Rohstoff braucht eine Einheit Produkt (BM aus Holz oder Stein, Metall aus Erz, Treibstoff aus Öl, Munition aus Metall)
  convert: { bm: 1, metal: 2, fuel: 1, mun: 0.5 },
  // Startviertel (seit v4.84): steht zu Beginn fertig (Stufe 1) neben der Hauptstadt, dazu eine Ölquelle auf dem nächsten Ölvorkommen
  startQuarter: { road: 3, row: ['res', 'fuel', 'res'], top: ['barracks', null, 'factory'] }, // Straßenlänge, die Zellen darunter und darüber (seit v4.96 Kaserne und Fabrikhalle)
  startMetal: 400, // Metall im Hauptlager zu Beginn (Metall bleibt dort, LKW fahren es nicht)
  // Metall je ausgebildeter Einheit (zusätzlich zum Geld); fehlt die Sorte, kostet sie kein Metall
  metalCost: { truck: 20, engineer: 20, ifv: 60, tank: 120, flak: 60, sam: 80, littlebird: 60, transporter: 80, gunship: 120 },
  // Markt: handelt in Losen; verkaufen bringt wenig, kaufen kostet viel (Geld je Los)
  market: { lot: 100, sell: { bm: 20, mun: 30, fuel: 30, metal: 40 }, buy: { bm: 80, mun: 120, fuel: 120, metal: 160 } },

  // ---- Wissen (seit v4.88, Stufe 5) ----
  // Universität: ohne sie nur Forschungsstufe 1; Uni-Stufe 1 schaltet Stufe 2 frei, uniForTier3 die Stufe 3. Jede Uni-Stufe über 1
  // beschleunigt die Forschung um uniSpeed. Rechenzentrum: schaltet den Forschungsast „KI“ frei (BALANCE.research, branch 'ai').
  jobsUni: [0, 8, 16, 28], // Studenten und Lehrer je Stufe (zählen als Arbeitsplätze)
  jobsDc: [0, 6, 12, 20], // Arbeitsplätze je Stufe im Rechenzentrum
  uniForTier3: 3,
  uniSpeed: 0.25,

  // ---- Strom und Zufriedenheit (seit v4.88, Stufe 3) ----
  // Strom wirkt stadtweit (keine Leitungen). Angebot: base (Notstrom der Hauptstadt) + Kraftwerke (supply je Stufe × Besetzung).
  // Bedarf je Stufe und Zellenart; reicht der Strom nicht, arbeiten Förderung, Werke und Forschung nur im Verhältnis Angebot/Bedarf.
  power: {
    base: 40,
    supply: [0, 60, 120, 200],
    use: { res: 1, com: 3, market: 3, bm: 8, mun: 8, fuel: 8, steel: 10, mine: 4, uni: 12, dc: 30, power: 0, barracks: 2, factory: 8, heliport: 6 },
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
    mix: { com: 2, bm: 3, mun: 2, fuel: 2, steel: 2, market: 0.3 }, // Verhältnis der Arbeitsstätten (Kraftwerk, Uni, Rechenzentrum nach Bedarf)
    powerMargin: 1.15, // baut ein Kraftwerk, wenn das Stromangebot unter Bedarf × powerMargin fällt
    uniFrom: 6, // Arbeitsstätten, ab denen sie eine Universität baut
    dcFrom: 16, // … ein Rechenzentrum (nach der Uni)
    sellAbove: 2700, // verkauft am Markt, wenn eine Sorte im Hauptlager darüber liegt
    buyMetalBelow: 150, // kauft Metall am Markt, wenn weniger da ist und genug Geld (reserve + Preis) bleibt
    raidEvery: { easy: 0, normal: 240, hard: 150 }, // s zwischen Angriffen auf die gegnerische Stadt (0 = nie)
    raidSize: 4, // so viele Fahrzeuge greifen an
    // Freie Planung (seit v4.85): Engpässe heben das Gewicht einer Zone im Mix
    lowStock: 800, // BM, MUN, TS im Hauptlager darunter = knapp
    lowMetal: 300, // Metall darunter = knapp
    lowFree: 8, // freie Einwohner darunter = Wohnen knapp
    lowMoney: 400, // Geld darunter = Gewerbe knapp
    boost: 4, // so viel stärker zählt eine knappe Zone
    dangerTime: 90, // s, so lange meidet sie Zellen nahe einem Treffer auf ihre Stadt
    dangerRadius: 3, // Zellen um den Treffer
    defendSize: 6, // so viele Einheiten schickt sie zu einem angegriffenen Stadtgebäude
    defendRange: 2500, // px, nur Einheiten in diesem Abstand
    defendCooldown: 12, // s zwischen zwei Verteidigungsbefehlen
    // Angriffsziele: Wert je Zellenart (geteilt durch Entfernung); Werke und Förderung zuerst
    targetValue: { steel: 3, fuel: 3, mun: 3, power: 3, dc: 2.5, uni: 2, mine: 2.5, market: 2, bm: 2, com: 1, res: 0.5, barracks: 2.5, factory: 3, heliport: 3 },
    // Ausbildungsgebäude (seit v4.96): so viele will sie haben; ab moreFrom Arbeitsstätten je eins mehr (Heliport erst, wenn Hubschrauber freigeschaltet sind)
    producers: { barracks: 1, factory: 1, heliport: 1 },
    moreFrom: 14,
  },
};
