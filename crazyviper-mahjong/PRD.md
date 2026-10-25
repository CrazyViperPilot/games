# CrazyViperMahjong – PRD

Stand: v1 (2026-10-25). Dieses Dokument bei jeder Regel- oder Funktionsänderung aktuell halten.

## Idee
Mahjong Solitaire (Paare abräumen). Statt chinesischer Schriftzeichen zeigen die Kacheln Kampfjets
(Eurofighter Typhoon, F-16, F/A-18, F-22, F-35, Rafale, Gripen, MiG-29, Su-27 …).

## Plattform
- Offline-fähige PWA, komplett unabhängig von den anderen Spielen (Ordner `crazyviper-mahjong/`,
  Cache-Präfix `crazyvipermahjong-`, localStorage-Schlüssel `crazyvipermahjong-*`).
- Zielgeräte: Pixel 8a und Lenovo Tab M11, Querformat, Touch-Bedienung. Vanilla JS, Canvas 2D, kein Build.
- Service Worker: network-first, Cache nur als Offline-Fallback. Bei Dateiänderungen `CACHE_NAME` in `sw.js` erhöhen.

## Regeln
- Zwei **gleiche** freie Kacheln antippen → beide verschwinden. Ziel: alle Kacheln abräumen.
- Frei = nichts liegt darauf **und** links oder rechts ist keine Kachel auf gleicher Ebene direkt daneben.
- Gesperrte Kacheln sind leicht abgedunkelt. Kein Bonus für Blumen/Jahreszeiten (nur gleiche Typen).
- 36 Jet-Typen. Anzahl der Typen pro Spiel = min(36, Paare); bei 140 Kacheln kommt jeder Typ ca. 4× vor.

## Funktionen
- 4 Layouts: Landeanflug (40), Pyramide (132), Festung (108), Schildkröte (140). Layouts sind Textraster in `logic.js`.
- **Lösbare Verteilung**: Das Feld wird rückwärts aus freien Paaren aufgebaut. Schlechte Züge des Spielers
  können trotzdem in eine Sackgasse führen (selten, ~1 von 40 bei Zufallsspiel).
- Hinweis (Paar blinkt 3 s), Zug zurück (unbegrenzt), Mischen (verteilt Typen der Restkacheln neu, bleibt lösbar),
  Automatik-Meldung „Keine Züge mehr“ mit Mischen / Zurück / Neustart; „Sackgasse“ wenn auch Mischen nicht hilft.
- Zeit, Züge, Restkacheln in der Kopfzeile; Bestzeit je Layout; Ton an/aus.
- Spielstand wird automatisch gespeichert (Weiterspielen im Menü).

## Jets
Silhouetten werden zur Laufzeit aus Formparametern gezeichnet (`jets.js`, `JET_DEFS`), Farbe = Nation
(US blau, Russland rot, EU grün, Frankreich türkis, Schweden orange, China magenta, Asien violett, GB grau)
plus Beschriftung. Neue Jets: Eintrag in `JET_DEFS` ergänzen.

## Tests
`node crazyviper-mahjong/test/logic.test.js` (Layout-Konsistenz, Lösbarkeit, Mischen). CI: `.github/workflows/test-crazyviper-mahjong.yml`.

## Offen / Ideen
- Test auf echten Geräten (Pixel 8a, Tab M11) steht aus; Kachelgröße bei großen Layouts im Querformat prüfen.
- Polnisch (wie Mario Craft) bisher nicht gewünscht; nur Deutsch.
- Mögliche Erweiterungen: weitere Layouts, Tageslayout, Jet-Steckbriefe beim Abräumen.
