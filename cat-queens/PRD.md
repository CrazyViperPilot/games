# Katzen-Queens – PRD

Stand: v1.0 (2026-10-26): Generator, Solver, Logik, Hinweise und Oberfläche fertig, live unter /games/cat-queens/.
Dieses Dokument bei jeder Regel- oder Funktionsänderung aktuell halten.

## Idee
Logikrätsel nach den Regeln von „Queens“ / „Star Battle“ (1 Stern), mit Katzen statt Damen.
Kein Backend, keine Werbung, kein Tracking.

## Plattform
- Offline-fähige, installierbare PWA, komplett unabhängig von den anderen Spielen (Ordner `cat-queens/`,
  Cache-Präfix `catqueens-`, localStorage-Schlüssel `catqueens-*`).
- Zielgeräte: Pixel 8a und Lenovo Tab M11, Querformat, Touch.
- TypeScript + Vite (ohne Framework), Tests mit Vitest. Als einziges Spiel der Sammlung mit Build-Schritt:
  `.github/workflows/pages.yml` baut `cat-queens/` mit `npm ci && npm run build` und veröffentlicht nur `dist/`.
- Service Worker wird beim Build erzeugt (`vite.config.ts`): lädt beim Installieren alle Dateien in den Cache,
  Cache-Name = `catqueens-` + Hash aller Dateien, löscht nur eigene alte Caches. Seite: Netz zuerst, Dateien: Cache zuerst.
  Eine Version muss also nicht von Hand erhöht werden.

## Regeln
- N×N-Gitter (N = 5 bis 10), aufgeteilt in N zusammenhängende Farbregionen.
- N Katzen setzen: genau eine pro Zeile, pro Spalte und pro Region.
- Zwei Katzen dürfen sich nicht berühren, auch nicht diagonal.
- Jedes Rätsel hat genau eine Lösung und ist ohne Raten lösbar.

## Rätselgenerator (`src/core/generator.ts`)
1. Zufällige gültige Lösung: je Zeile/Spalte eine Katze, keine zwei berühren sich (`randomSolution`).
2. Von jeder Katze aus wächst eine Region per zufälligem Flood-Fill (4er-Nachbarschaft), bis das Gitter voll ist.
   Jede Region bekommt ein zufälliges Wachstumsgewicht, so entstehen große und kleine Regionen (`growRegions`).
3. Eindeutigkeit (`makeUnique`): Der Backtracking-Solver sucht weitere Lösungen. Ein Feld einer fremden Lösung wechselt
   in eine Nachbarregion, das macht diese Lösung ungültig. Von mehreren möglichen Wechseln gewinnt der, nach dem am
   wenigsten Lösungen übrig bleiben. Katzenfelder bleiben, Regionen bleiben zusammenhängend (bei „Schwer“ mindestens
   2 Felder groß). Klappt es nach 80 Runden nicht, wird neu gewürfelt.
4. Schwierigkeit: Der Logik-Löser (`src/core/logic.ts`) löst das Rätsel wie ein Mensch und misst die schwerste
   nötige Technik und den Denkaufwand (Score = Summe der Technik-Stufen aller Schritte außer Einzelfeld).
   Passt das nicht zur gewünschten Stufe, wird neu gewürfelt. Alles hängt nur am Seed: gleicher Seed = gleiches Rätsel.

| Stufe | Größe | Schwerste Technik | Mindest-Score | Regionen aus 1 Feld |
|---|---|---|---|---|
| Leicht | 5×5 bis 7×7 | Einschluss (2) | 0 | höchstens 1 |
| Mittel | 7×7, 8×8 | Bedrohung (3) oder Zweiergruppe (4) | 8 | höchstens 1 |
| Schwer | 9×9, 10×10 | Gruppe (4/5) oder Probieren (6) | 20 | keine |

### Logik-Techniken (auch für den Hinweis-Knopf)
1. **Einzelfeld:** Zeile, Spalte oder Region hat nur noch ein freies Feld → Katze.
   Jede Katze streicht automatisch ihre Zeile, Spalte, Region und die 8 Nachbarfelder.
2. **Einschluss:** Alle freien Felder einer Region liegen in einer Zeile (Spalte) → Rest dieser Zeile (Spalte) fällt weg.
   Ebenso: freie Felder einer Zeile/Spalte liegen alle in einer Region → Rest der Region fällt weg.
3. **Bedrohung:** Eine Katze auf Feld X würde einer anderen Zeile/Spalte/Region jedes freie Feld nehmen → X.
4. **Gruppe:** k Regionen liegen zusammen ganz in k Zeilen (oder Spalten, oder umgekehrt) → alle anderen Felder
   dieser Zeilen fallen weg. Stufe 4 bei k = 2, Stufe 5 bei k = 3 oder 4.
5. **Probieren (Stufe 6):** Eine Katze auf X führt mit den Techniken 1 bis 3 zu einem Widerspruch → X.

### Tagesrätsel
Seed = `daily-JJJJ-MM-TT` (Ortszeit). Schwierigkeit nach Wochentag: Mo/Di leicht, Mi/Do mittel, Fr bis So schwer.

### Hinweis (`src/core/hints.ts`)
1. Falsch gesetzte Katze oder X auf einem Katzenfeld → dieses Feld zeigen.
2. Sonst den nächsten Logikschritt mit der leichtesten Technik zeigen (mit deutscher Erklärung), nicht einfach die Lösung.

## Bedienung
- Tippen: leer → X → Katze → leer. Wischen über mehrere Felder: alle leeren Felder werden X
  (beginnt das Wischen auf einem X, werden X entfernt). Eine Geste = ein Rückgängig-Schritt.
- Sofort rot: Katzen, die sich eine Zeile/Spalte/Region teilen oder berühren, und Zeilen/Spalten/Regionen voller X.
- Rückgängig, Neustart (lässt sich rückgängig machen), Hinweis, Timer, Zähler „Katzen x/N“.
- Hinweis zeigt das Feld mit pulsierendem Rahmen, hebt die begründenden Zeilen/Spalten/Regionen hervor (Rest wird
  abgedunkelt) und erklärt den Schritt. Regionen heißen dabei nach ihrer Farbe (Orange, Blau, Grün, Gelb, Lila,
  Rosa, Türkis, Sand, Grau, Rot).
- Sieg: Katzen hüpfen, Fenster mit Zeit, Bestzeit-Meldung, Tages-Serie; „Nächstes Rätsel“ im freien Spiel.

## Menü, Spielstände, Statistik
- Menü: Tagesrätsel (mit Datum, Stufe, Zeit wenn gelöst), freies Spiel Leicht/Mittel/Schwer (mit Bestzeit,
  „▶ weiter“ wenn ein Spiel offen ist), Regeln, Statistik, Theme (Auto/Hell/Dunkel), Muster an/aus, Link zur Spielesammlung.
- Je Modus ein eigener Spielstand (`catqueens-game-daily-JJJJ-MM-TT`, `catqueens-game-free-<stufe>`) mit Markierungen,
  Rückgängig-Liste, Zeit und Hinweisen. Alte Tagesrätsel-Stände werden beim Start gelöscht.
- Zeit läuft nur, solange das Spielfeld sichtbar ist (pausiert im Menü, in Fenstern und im Hintergrund).
- Statistik (`catqueens-stats`): gelöste Rätsel je Stufe, Bestzeit je Stufe (nur ohne Hinweis), gelöste Tagesrätsel,
  aktuelle und beste Tages-Serie, benutzte Hinweise.
- Farbenblind-freundlich: dicke Grenzen zwischen Regionen, je Region ein eigenes Muster (abschaltbar), eigene Palette für Dunkel.
- Rätsel entstehen in einem Web Worker. Je Stufe liegt ein fertiges nächstes Rätsel bereit (`catqueens-next-<stufe>`),
  dadurch startet auch „Schwer“ sofort.

## Tests
`npm test` (Vitest): Solver gegen rohe Aufzählung, Eindeutigkeit, Gültigkeit, Zusammenhang der Regionen,
Determinismus, Korrektheit jedes Logikschritts, Hinweise bis zur Lösung, Spielzustand (Tippen, Wischen,
Rückgängig, Fehler, Sieg, Speichern) und Statistik (Bestzeiten, Serie). `npm run report` misst den Generator.
