# Catsweeper – PRD

Stand: v2 (2026-10-25). Dieses Dokument bei jeder Regel- oder Funktionsänderung aktuell halten.

## Idee
Minesweeper (Minensucher) mit Katzen statt Minen. Name und Regeln orientieren sich am Katzen-Minesweeper „Catsweeper“
(Daniel kannte es aus Werbung); Grafik, Töne und Code sind komplett eigen (Canvas-gezeichnete Katzen, Fisch-Markierung).

## Plattform
- Offline-fähige PWA, komplett unabhängig von den anderen Spielen (Ordner `catsweeper/`,
  Cache-Präfix `catsweeper-`, localStorage-Schlüssel `catsweeper-*`).
- Zielgeräte: Pixel 8a und Lenovo Tab M11, Querformat, Touch. Vanilla JS, Canvas 2D, kein Build.
- Service Worker: network-first, Cache nur Offline-Fallback. Bei Dateiänderungen `CACHE_NAME` in `sw.js` erhöhen.

## Regeln
- Auf dem Feld sitzen versteckt Katzen. Feld antippen = aufdecken. Katze erwischt = verloren („Miau!“).
- Zahl auf einem offenen Feld = Anzahl Katzen auf den bis zu 8 Nachbarfeldern. Bei 0 werden Nachbarn automatisch aufgedeckt.
- Gewonnen, wenn alle Felder ohne Katze offen sind.
- Der erste Zug ist immer sicher (Feld + Nachbarn katzenfrei, Katzen werden erst dann verteilt).
- Fisch-Markierung (statt Flagge): **Maus: Rechtsklick** (Linksklick deckt auf). **Touch: lang drücken** oder Modus-Knopf „Aufdecken/Fisch“ (Tipp = aufdecken). Zähler oben = Katzen minus Fische.
- Tipp auf eine Zahl, deren Fisch-Anzahl stimmt (Chord): restliche Nachbarn werden aufgedeckt (falscher Fisch = verloren).

## Stufen
Leicht 12×7 / 10 Katzen, Mittel 18×9 / 28, Schwer 24×11 / 60 (Querformat-Raster, in `logic.js` `LEVELS`).

## Funktionen
- Zeit (startet beim ersten Aufdecken), Bestzeit je Stufe, Ton an/aus, Vibration bei Niederlage.
- Hinweis: markiert eine sichere Zelle (grün) bzw. sichere Katze (rot) per Schlussfolgerung, sonst Raten (`hint` in `logic.js`).
- Spielstand wird automatisch gespeichert (Weiterspielen im Menü).

## Tests
`node catsweeper/test/logic.test.js` (erster Zug sicher, Katzenzahl, Gewinn/Verlust, Chord, Hinweise korrekt). CI: `.github/workflows/test-catsweeper.yml`.

## Offen / Ideen
- Nur ungefähre Regelrecherche (Web-Version: Spielzeug-Flaggen; iOS-App: Katzen wandern, Köder). Falls Daniel die Variante mit
  wandernden Katzen/Köder aus der Werbung meint → als Zusatzmodus ergänzen.
- Test auf echten Geräten (Pixel 8a, Tab M11) steht aus. Mögliche Erweiterungen: Tagesrätsel, Katzenrassen freischalten, Polnisch.
