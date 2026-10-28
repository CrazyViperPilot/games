# Games

Spielesammlung als statische Web-Apps (PWA) auf GitHub Pages. Die Startseite (`index.html`) führt zu den Spielen.

Live: https://crazyviperpilot.github.io/games/

| Spiel | Ordner | Beschreibung | Version / Cache |
|---|---|---|---|
| **Gate Squad** | [`gate-squad/`](gate-squad/) | Arcade-Shooter: Truppe durch Tore führen, Horden besiegen, Panzer-Boss. [README](gate-squad/README.md) | `CACHE_VERSION` in `gate-squad/sw.js` |
| **Vibe Squadron** | [`scroll-shooter/`](scroll-shooter/) | Scroll-Shooter: Mutterschiff verteidigen, Flotte bauen, Türme und Waffen aufrüsten. [README](scroll-shooter/README.md) | `CACHE_VERSION` in `scroll-shooter/sw.js` |
| **Go** | [`go/`](go/) | Go gegen den Computer (9×9, 13×13). [README](go/README.md) | `CACHE_NAME` in `go/sw.js`, `go/package.json` |
| **Sudoku** | [`sudoku/`](sudoku/) | Sudoku, ursprünglich gebaut, um Google Antigravity kennenzulernen | `CACHE_NAME` in `sudoku/sw.js` |
| **Frontline** | [`frontline/`](frontline/) | Echtzeit-Strategie: FOB bauen, Ressourcen fördern, Konfliktzone halten, gegen den Computer. [README](frontline/README.md) | `CACHE_VERSION` in `frontline/sw.js` |
| **Fruhno** | [`fruhno/`](fruhno/) | UNO mit Frühstücksthema für Daniel, Lea und Kira (online, Chat, Bot). Backend: PHP im Repo vipervocs unter `fruhno/`. [PRD](fruhno/PRD.md) | `CACHE_VERSION` in `fruhno/sw.js` |
| **Frankfurtopoly** | extern: [phpexpert.de/games/frankfurtopoly](https://phpexpert.de/games/frankfurtopoly/) | Monopoly mit Frankfurter Straßen für Daniel, Lea und Kira (online, Chat, Computergegner). Code, PHP-Backend und Deploy im Repo [frankfurtopoly](https://github.com/CrazyViperPilot/frankfurtopoly) | `CACHE_VERSION` in `frankfurtopoly/sw.js` dort |
| **CrazyViperMahjong** | [`crazyviper-mahjong/`](crazyviper-mahjong/) | Mahjong Solitaire mit 36 Kampfjet-Typen statt Schriftzeichen, 4 Layouts. [PRD](crazyviper-mahjong/PRD.md) | `CACHE_NAME` in `crazyviper-mahjong/sw.js` |
| **Catsweeper** | [`catsweeper/`](catsweeper/) | Minesweeper mit Katzen und Fisch-Markierung, 3 Stufen. [PRD](catsweeper/PRD.md) | `CACHE_NAME` in `catsweeper/sw.js` |
| **Katzen-Queens** | [`cat-queens/`](cat-queens/) | Logikrätsel (Queens / Star Battle) mit Katzen: Tagesrätsel, 3 Stufen, Hinweise. TypeScript + Vite, wird in `pages.yml` gebaut. [PRD](cat-queens/PRD.md) | Hash aller Dateien, automatisch in `cat-queens/dist/sw.js` |
| **Mario Craft** | [`mario-craft/`](mario-craft/) | Jump'n Run im Pixel-Stil: 5 Welten mit Bossen, Deutsch und Polnisch. [README](mario-craft/README.md) | `CACHE_VERSION` in `mario-craft/sw.js` |

## Aufbau: jedes Spiel ist eigenständig

Die Spiele teilen sich nur das Repo und die Domain – sonst nichts.

- **Code:** Jedes Spiel liegt vollständig in seinem Ordner. Keine gemeinsamen Dateien, keine Imports über Ordnergrenzen
  (auch nicht aus der Startseite). Ein Spiel lässt sich jederzeit herauslösen, indem man seinen Ordner kopiert.
- **Offline / Installation:** Jedes Spiel hat ein eigenes `manifest.json` (Scope = sein Ordner) und einen eigenen
  Service Worker mit eigenem Cache-Präfix (`gatesquad-`, `vibesquadron-`, `go-game-`, `sudoku-`, `frontline-`, `fruhno-`, `crazyvipermahjong-`, `catsweeper-`, `catqueens-`). Ein Service Worker löscht beim
  Aktualisieren **nur Caches mit seinem eigenen Präfix** – sonst würde er die Offline-Daten der anderen Spiele zerstören.
- **Speicherstände:** Jedes Spiel nutzt eigene `localStorage`-Schlüssel.
- **Lebenszyklus:** Änderungen an einem Spiel betreffen nur seinen Ordner. Ein Release = Änderung + Cache-Version
  **dieses** Spiels erhöhen. Tests laufen pro Spiel (z. B. `.github/workflows/test-go.yml` nur bei Änderungen in `go/`).
- **Startseite:** `index.html` verlinkt nur auf die Ordner. Das Wurzel-`sw.js` existiert nur noch, um eine alte
  Sudoku-Installation von früher abzumelden.

### Neues Spiel hinzufügen

1. Ordner `<spiel>/` mit `index.html`, `manifest.json` (`start_url`/`scope` relativ, `"./"`), `sw.js` mit eigenem
   Cache-Präfix, der nur eigene Caches löscht, und Icons.
2. Karte in `index.html` ergänzen und die Tabelle oben erweitern.
3. Falls das Spiel Tests hat: eigenen Workflow mit `paths: ["<spiel>/**"]` anlegen.

Go wurde mit seiner Git-Historie aus dem Repo `CrazyViperPilot/go` per `git subtree` übernommen,
Vibe Squadron ebenso aus `CrazyViperPilot/CrazyScrollShooter`.

## Deploy

`.github/workflows/pages.yml` veröffentlicht bei jedem Push auf `main` die Startseite und alle Spiele
(Settings → Pages → Source: „GitHub Actions“). Tests, `package.json` und `node_modules` werden nicht veröffentlicht.
Katzen-Queens ist das einzige Spiel mit Build-Schritt: Der Workflow baut `cat-queens/` (`npm ci && npm run build`)
und veröffentlicht nur `cat-queens/dist/`.
