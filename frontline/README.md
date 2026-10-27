# Frontline

Echtzeit-Strategie im Browser: FOBs bauen, Nachschub organisieren, die Konfliktzone in der Mitte halten.
Spieler (Blau) gegen Computer (Rot). Vanilla JS, Canvas 2D und WebGL, kein Build-Schritt, offline spielbar (PWA).

| Datei | Inhalt |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Einstieg für Erweiterungen: Regeln, „Wo ändere ich was?“, Feature-Landkarte, Rezepte |
| [ARCHITEKTUR.md](ARCHITEKTUR.md) | Aufbau des Codes: Schichten, Simulationsschritt, Datenmodelle, Befehle, Dateien |
| [PRD.md](PRD.md) | Spielregeln, Steuerung (§8), KI (§10), Änderungsverlauf |
| [docs/verlauf.md](docs/verlauf.md) | Ursprünglicher Umsetzungsplan (v1 bis v4.23), nur zum Nachlesen |

Alle Spielwerte (Einheitenlimit, Geld pro Sekunde, Preise, Schaden …) stehen in `js/data/`; wo genau, sagt [CLAUDE.md](CLAUDE.md).
Im Spiel zeigt **F1** oder **?** alle Tasten.

## Starten

```sh
# im Repo-Wurzelordner (games/)
python3 -m http.server 8765
```

Spiel: `http://localhost:8765/frontline/` · Karteneditor: `http://localhost:8765/frontline/editor.html`

## Debug-Parameter

Über die URL:

- `?debug=1`: Karte ist aufgedeckt (kein Nebel), Taste **M** gibt Team Blau +1000 aller Ressourcen,
  Geschwindigkeit bis 10×.
- `?seed=N`: feste Karte (gleicher Seed = gleiche Partie).
- `?speed=N`: Startgeschwindigkeit.
- `?river=0|1`: Fluss auf der Zufallskarte aus oder an (übersteuert das Startmenü).
- `?gl=0`: Gelände der Iso-Ansicht ohne WebGL (flach, nur aufgemalt). `?sprites=0`: gemalte statt Bild-Sprites.
- `?debug=1&fog=1`: Debug, aber mit Nebel (Sicht im Gelände prüfen).
- `?debug=1&weather=summer|autumn|winter&wx=clear|rain|fog|snow`: Jahreszeit und festes Wetter.

Beispiel: `http://localhost:8765/frontline/?debug=1&seed=123&speed=3`

## Tests

```sh
cd frontline
npm run test:quick   # Config und PRD-Tabellen prüfen (Sekunden)
npm run docs         # Wertetabellen in PRD.md aus js/data/ erzeugen
npm test             # alle Tests: Simulation und KI ohne Browser (dauert einige Minuten)
```

Die Tests liegen in `test/` und laufen per `.github/workflows/test-frontline.yml`, sobald sich `frontline/` ändert.

Service Worker: `sw.js` (Cache-Präfix `frontline-`, Version `CACHE_VERSION`).
