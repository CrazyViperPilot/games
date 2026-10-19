# Gate Squad

Offline-Arcade-Shooter für den Browser (PWA), gebaut mit Vanilla JavaScript und Canvas 2D – ohne Build-Schritt,
ohne Frameworks. Ziel ist Chrome auf dem Pixel 8a im Hochformat, bedienbar per Touch.

Du führst eine Truppe Soldaten durch Tore, weichst Gegnern aus, sammelst Waffen-Upgrades und Attachments
und besiegst am Ende jedes Levels einen Boss.

## Steuerung

Finger auf den Bildschirm legen und seitlich ziehen – die Truppe folgt der Bewegung relativ zum Finger.
Die Soldaten schießen automatisch.

## Features

- 20 handgebaute Level (je ~1,5–2,5 Minuten), danach endlos generierte Level (seeded)
- Horden: 700–4000 Gegner pro Runde
- Zwei unabhängige Lanes: linke und rechte Tore kommen zeitversetzt – mit gutem Timing nimmt man beide
- Spezialisten per Kiste: Sturmgewehr, MP, MG, Scharfschütze (zielt auf die zähesten Gegner),
  Sprengmeister (wirft C4 auf nahe Gegnergruppen)
- RPG-Kisten (immer +1): ein Soldat wird zum reinen RPG-Schützen und feuert im Bosskampf Raketen
- Boss: Kampfpanzer (T-90-Stil) mit schwenkendem Turm, Ziel-Laser und sichtbaren Granaten
- 7 Waffen mit Tier-Aufstieg über Waffentore, 5 Attachments
- Zahlentore (addieren, subtrahieren, multiplizieren, dividieren) mit Abwägung
- Attachment-Kisten, Gegnertypen (Infanterie, Läufer, Schildträger, Scharfschütze, Mini-Fahrzeug) und Bosse
- Permanente Upgrades im Shop, Münzen, Bestwerte pro Level
- Offline spielbar (Service Worker), installierbar als App

## Lokal starten

Die Seite nutzt ES-Module und braucht daher einen HTTP-Server. Direktes Öffnen per `file://` funktioniert nicht.

```bash
# Variante 1 (Node)
npx http-server gate-squad

# Variante 2 (Python), im Ordner gate-squad ausführen
cd gate-squad && python3 -m http.server
```

Danach im Browser `http://localhost:8080` (http-server) bzw. `http://localhost:8000` (Python) öffnen.

## Deploy auf GitHub Pages

Der Workflow `.github/workflows/pages.yml` deployt bei jedem Push auf `main` das Repo nach GitHub Pages:
Startseite unter `/`, Sudoku unter `/sudoku/`, Gate Squad unter `/gate-squad/`.

1. Im Repo unter **Settings → Pages** als **Source** „GitHub Actions“ wählen.
2. Nach dem ersten erfolgreichen Workflow-Lauf ist das Spiel erreichbar unter:
   `https://<user>.github.io/<repo>/gate-squad/` – für dieses Repo: `https://crazyviperpilot.github.io/games/gate-squad/`

## Installation auf dem Pixel

1. Die Spiel-URL in Chrome öffnen.
2. Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.
3. Danach startet Gate Squad als eigenständige App und ist auch offline spielbar.

## Debug-Modus

- `?debug=1` – FPS-Anzeige, alle Level freigeschaltet, Unverwundbarkeit im HUD umschaltbar
- `?debug=1&autoplay=1&level=1&chain=1` – Bot spielt automatisch und hängt Level aneinander (für Tests)
  - `&speed=8` – Zeitraffer (1–16 Spielschritte pro Tick)
  - `&bot=casual` – Bot simuliert einen Gelegenheitsspieler (Standard: Profi)
  - `&shop=1` – Bot kauft zwischen Leveln Upgrades
  - Ergebnisse stehen in `window.__results` (Konsole)
- Taste `g` oder Button „GOD“ – Unverwundbarkeit an/aus

## Projektstruktur

```
index.html        Canvas + DOM-Overlays, lädt js/main.js
manifest.json     PWA-Manifest
sw.js             Service Worker (cache-first, CACHE_VERSION)
css/style.css     Menü- und Overlay-Styles
icons/            App-Icons (SVG-Quelle + PNGs)
js/
  main.js         Bootstrap
  config.js       Technische Konstanten
  core/           Loop, Input, Audio, Haptik, Pool, RNG, Save
  data/           Balancing, Waffen, Attachments, Gegner, Upgrades, Level, Procgen
  game/           Game-Zustand, Level-Runner, Bot
  entities/       Truppe, Geschosse, Gegner, Tore, Kisten, Boss, Partikel
  render/         Renderer, Sprites, Hintergrund, HUD
  ui/             Menüs, Shop, Einstellungen, Pause, Ergebnis
PLAN.md           Architektur und Umsetzungsplan
```

## Cache-Updates

Der Service Worker speichert alle Dateien offline. Nach Änderungen an Dateien die Konstante
`CACHE_VERSION` in `sw.js` erhöhen (z. B. `gatesquad-v2`), sonst sehen Spieler die alte Version.
