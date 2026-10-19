# Games

Kleine Spielesammlung als statische Web-Apps (GitHub Pages). Die Startseite (`index.html`) führt zu den Spielen:

| Spiel | Ordner | Beschreibung |
|---|---|---|
| **Gate Squad** | [`gate-squad/`](gate-squad/) | Offline-Arcade-Shooter (PWA): Truppe durch Tore führen, Horden besiegen, Panzer-Boss. Details: [gate-squad/README.md](gate-squad/README.md) |
| **Sudoku** | [`sudoku/`](sudoku/) | Sudoku-Spiel, ursprünglich gebaut, um Google Antigravity kennenzulernen |

Live: https://crazyviperpilot.github.io/games/

## Deploy

Der Workflow `.github/workflows/pages.yml` veröffentlicht bei jedem Push auf `main` das ganze Repo nach GitHub Pages
(Settings → Pages → Source: „GitHub Actions“). Jedes Spiel hat einen eigenen Service Worker in seinem Ordner und ist
einzeln als App installierbar.
