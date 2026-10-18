# Go

Go gegen den Computer als Web-App. Läuft komplett im Browser, ohne Server und ohne Build-Schritt. Einmal geladen, funktioniert sie offline und lässt sich auf dem Startbildschirm installieren.

## Funktionen

- Brett 9×9 oder 13×13
- Gegner **Leicht** (Heuristik mit Zufall) oder **Mittel** (Monte-Carlo-Suche, ca. 1,2 s pro Zug)
- Regeln: einfaches Ko, Selbstmord verboten, Flächenwertung mit 6,5 Komi
- Zwei Pässe in Folge starten die Wertung: tote Steine antippen, dann „Fertig“
- Zug zurücknehmen, aufgeben, neues Spiel; der Spielstand bleibt im Browser gespeichert

## Lokal ausprobieren

```sh
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Auf dem Handy installieren

Die Seite über HTTPS öffnen (z. B. GitHub Pages) und im Chrome-Menü „Zum Startbildschirm hinzufügen“ bzw. „App installieren“ wählen. Danach läuft sie ohne Netz.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `go.js` | Spielregeln, Ko, Gefangennahme, Wertung |
| `ai.js` | Computergegner (Leicht und Mittel) |
| `app.js` | Oberfläche, Canvas-Zeichnung, Speicherung |
| `sw.js` | Service Worker für den Offline-Betrieb |
| `fonts/` | Schriften lokal eingebunden (Playfair Display, Outfit) |

Wenn sich eine der Dateien aus `sw.js` ändert, `CACHE_NAME` erhöhen, sonst bekommen installierte Kopien die neue Version nicht.

## Tests

```sh
npm test
```
