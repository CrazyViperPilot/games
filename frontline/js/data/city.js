// Stadt (SimCity-Teil, seit v4.75): Werte der Zonenstadt hinter der Haupt-FOB. Regeln: PRD §15. Kein DOM.
// Alle Zahlen hier einstellbar; nach Änderungen PRD §15 und Hilfetexte prüfen.

export const CITY = {
  // ---- Schnelleinstellungen ----
  cols: 18, // Breite des Stadtrasters (Zellen)
  rows: 10, // Höhe des Stadtrasters (Zellen)
  cell: 64, // Kantenlänge einer Stadtzelle auf der Karte (px, Vielfaches der Kachel 32)
  fobRow: 1.5, // Lage der Haupt-FOB im Raster: so viele Zellen vom zonenseitigen Rand entfernt (die Stadt liegt dahinter)
  fobMargin: 64, // um die Haupt-FOB bleibt so viel Platz frei (px; dort erscheinen neue Einheiten)
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
  ai: { interval: { easy: 12, normal: 8, hard: 5 }, reserve: { easy: 500, normal: 300, hard: 200 } }, // Takt (s) und Geld, das sie für die Armee übrig lässt
};
