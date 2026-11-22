# Schiffe versenken

Seeschlacht online für 2 Spieler, gebaut fürs Smartphone im Hochformat.

- **Hosten / Beitreten:** Name frei wählbar, kein Passwort. Wer hostet, erscheint auf der Startseite unter „Offene Spiele“; wer dort tippt, tritt bei.
- **Aufstellen:** Flotte aus Flugzeugträger (5), Schlachtschiff (4), Kreuzer (3), U-Boot (3) und Zerstörer (2). Schiffe ziehen zum Verschieben, nochmal antippen zum Drehen, 🎲 für Zufall. Schiffe dürfen sich nicht berühren (auch nicht über Eck).
- **Gefecht:** Feld antippen = zielen, nochmal antippen oder „Feuer“ = schießen. Treffer → nochmal schießen. Felder rund um versenkte Schiffe werden als Wasser markiert. Revanche: Der Verlierer beginnt.
- **Chat:** 💬 oben rechts, klappt bei neuen Nachrichten kurz auf und wieder zu.
- **Grafik:** Meer, Schiffe, Feuer und Einschläge werden auf Canvas aus einfachen Formen gezeichnet (`js/draw.js`), Töne werden synthetisch erzeugt.

## Technik

| Datei | Inhalt |
|---|---|
| `api.php` | Multiplayer-API, ein JSON-File pro Raum in `data/` (Token pro Spieler, Räume räumen sich selbst auf) |
| `engine.php` | Regeln: Flotte prüfen, Schuss auswerten |
| `test.php` | `php schiffe-versenken/test.php` |
| `js/draw.js` | Meer, Schiffe, Effekte, `BoardView` |
| `js/api.js` | API-Client, Sound |
| `js/main.js` | Bildschirme, Polling, Chat |

Die Oberfläche läuft auf GitHub Pages und spricht mit `https://phpexpert.de/games/schiffe-versenken/api.php`
(Deploy per `.github/workflows/deploy-backend.yml`). Lokal: `php -S 127.0.0.1:8765` im Ordner starten und
`http://127.0.0.1:8765/` öffnen – dann wird das lokale `api.php` benutzt.

Release: `CACHE_VERSION` in `sw.js` erhöhen.
