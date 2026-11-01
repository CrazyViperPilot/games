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
  yield: { bm: 0.1, mun: 0.06, fuel: 0.03 }, // Ertrag je Arbeiter und Sekunde in Werken für Baumaterial, Munition, Treibstoff
  taxPop: 0.03, // Geld/s je Einwohner
  taxCom: 0.15, // zusätzliches Geld/s je Arbeiter im Gewerbe

  // ---- Bau ----
  cost: { road: 5, res: 20, com: 30, bm: 40, mun: 40, fuel: 40 }, // Geld je Zelle (Abriss kostenlos, keine Erstattung)

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
    mix: { com: 2, bm: 3, mun: 2, fuel: 1 }, // Verhältnis der Arbeitsstätten
  },
};
