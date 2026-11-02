// Stadt (SimCity-Teil, seit v4.75): Werte der Zonenstadt (seit v4.82 auf der ganzen Karte, im eigenen Gebiet). Regeln: PRD §15. Kein DOM.
// Alle Zahlen hier einstellbar; nach Änderungen PRD §15 und Hilfetexte prüfen.

export const CITY = {
  // ---- Schnelleinstellungen ----
  cell: 64, // Kantenlänge einer Stadtzelle auf der Karte (px, Vielfaches der Kachel 32); das Stadtraster deckt seit v4.82 die ganze Karte
  fobMargin: 64, // um jede Haupt-FOB bleibt so viel Platz frei (px; dort erscheinen neue Einheiten)
  // Gebiet (seit v4.82): gebaut werden darf nur in Zellen im eigenen Gebiet. Radien in Zellen.
  territory: { main: 10, fob: 4, building: 2, interval: 1 }, // um die Haupt-FOB, um jede andere fertige FOB, um jedes fertige Stadtgebäude; Neuberechnung alle interval s
  // Einwohner als Truppen (seit v4.82): ausgebildete Einheiten brauchen so viele freie Einwohner (Startarmee und Nachschub nicht)
  crew: { default: 1, ifv: 3, tank: 3, flak: 2, sam: 2, littlebird: 2, transporter: 2, gunship: 2 },
  // Flucht (seit v4.82): Wohnzellen in der Konfliktzone leeren sich, wenn in ihnen oder den Nachbarzellen geschossen wird
  flee: { reach: 1, calm: 60 }, // Nachbarschaft (Zellen) und Ruhezeit (s), bis die Bewohner zurückziehen dürfen
  startStock: { bm: 1500, mun: 600, fuel: 600 }, // Startlager der Haupt-FOB bei eingeschalteter Stadt (sonst unendlich)
  yield: { bm: 0.1, mun: 0.06, fuel: 0.03, metal: 0.05 }, // höchster Ertrag je Arbeiter und Sekunde in Werken (BM-Werk, Munitionswerk, Raffinerie, Stahlwerk), begrenzt durch Rohstoffe
  taxPop: 0.03, // Geld/s je Einwohner
  taxCom: 0.15, // zusätzliches Geld/s je Arbeiter im Gewerbe

  // ---- Bau ----
  cost: { road: 0, res: 20, com: 30, bm: 40, mun: 40, fuel: 40, steel: 50, mine: 30, market: 60 }, // Geld je Zelle (Abriss kostenlos, keine Erstattung)
  costBm: { road: 10 }, // Baumaterial je Zelle aus dem Lager der Haupt-FOB (seit v4.83: Straßen kosten Baumaterial statt Geld)

  // ---- Rohstoffe (seit v4.83, PRD §15) ----
  // Vorkommen auf der Karte: je Team eine Gruppe jeder Sorte nahe der Haupt-FOB, dazu umkämpfte Gruppen zwischen Basis und Zone.
  deposits: { home: { dist: [5, 9], size: 4 }, neutral: { count: 8, size: 5, ring: [6, 22] } }, // Abstand in Zellen, Zellen je Gruppe; ring = Zellen außerhalb der Konfliktzone
  // Förderanlage (Holzfäller, Steinbruch, Erzmine, Ölquelle je nach Vorkommen): Rohstoff je Arbeiter und Sekunde; braucht keine Straße
  extract: { wood: 0.3, stone: 0.3, ore: 0.25, oil: 0.2 },
  jobsMine: [0, 6, 12, 20], // Arbeitsplätze je Stufe einer Förderanlage
  // Verarbeitung: so viel Rohstoff braucht eine Einheit Produkt (BM aus Holz oder Stein, Metall aus Erz, Treibstoff aus Öl, Munition aus Metall)
  convert: { bm: 1, metal: 2, fuel: 1, mun: 0.5 },
  startMetal: 400, // Metall im Hauptlager zu Beginn (Metall bleibt dort, LKW fahren es nicht)
  // Metall je ausgebildeter Einheit (zusätzlich zum Geld); fehlt die Sorte, kostet sie kein Metall
  metalCost: { truck: 20, engineer: 20, ifv: 60, tank: 120, flak: 60, sam: 80, littlebird: 60, transporter: 80, gunship: 120 },
  // Markt: handelt in Losen; verkaufen bringt wenig, kaufen kostet viel (Geld je Los)
  market: { lot: 100, sell: { bm: 20, mun: 30, fuel: 30, metal: 40 }, buy: { bm: 80, mun: 120, fuel: 120, metal: 160 } },

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
    quarterEvery: 3, // jeder so vielte Takt baut an einer vorderen FOB statt an der Haupt-FOB
    mix: { com: 2, bm: 3, mun: 2, fuel: 2, steel: 2, market: 0.3 }, // Verhältnis der Arbeitsstätten
    sellAbove: 2700, // verkauft am Markt, wenn eine Sorte im Hauptlager darüber liegt
    buyMetalBelow: 150, // kauft Metall am Markt, wenn weniger da ist und genug Geld (reserve + Preis) bleibt
    raidEvery: { easy: 0, normal: 240, hard: 150 }, // s zwischen Angriffen auf die gegnerische Stadt (0 = nie)
    raidSize: 4, // so viele Fahrzeuge greifen an
  },
};
