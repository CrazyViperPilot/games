# Katzen-Queens

Logikrätsel (Queens / Star Battle) mit Katzen als installierbare Offline-Web-App. Regeln und Aufbau: [PRD.md](PRD.md).

## Starten

```bash
cd cat-queens
npm install
npm run dev        # Entwicklungsserver (Vite)
npm test           # Unit-Tests (Vitest)
npm run report     # Generator-Bericht: Laufzeit, Größen, Techniken je Stufe
npm run build      # Typprüfung + Produktions-Build nach dist/
```

## Aufbau

- `src/core/rng.ts` – Zufall mit Seed (gleicher Seed = gleiches Rätsel auf jedem Gerät)
- `src/core/board.ts` – Gitter, Zeilen/Spalten/Regionen, Regelverstöße, Zusammenhang
- `src/core/solver.ts` – Backtracking-Solver, zählt Lösungen (Eindeutigkeit)
- `src/core/logic.ts` – Logik-Löser in menschlichen Schritten (Hinweise, Schwierigkeit)
- `src/core/generator.ts` – Rätselgenerator, Schwierigkeitsstufen, Tagesrätsel
- `src/core/hints.ts` – Hinweis-Knopf mit deutscher Erklärung
- `src/game/` – Spielzustand (Tippen, Wischen, Rückgängig, Sieg), Statistik, Speicher, Worker-Anbindung
- `src/ui/` – Spielfeld (DOM), Katzen-SVG, Regionsnamen; `src/main.ts` – Menü und Spielbildschirm
- `src/worker.ts` – Web Worker für den Generator
- `vite.config.ts` – erzeugt beim Build `dist/sw.js` (Offline-Cache)
- `scripts/icons.mjs` – PNG-Icons aus `public/icons/icon.svg` (braucht Playwright)

## Deploy auf GitHub Pages

Die Spielesammlung wird bei jedem Push auf `main` von `.github/workflows/pages.yml` veröffentlicht.
Katzen-Queens braucht als einziges Spiel einen Build: Der Workflow führt in `cat-queens/` `npm ci && npm run build` aus
und kopiert `dist/` nach `/cat-queens/`. Live: https://crazyviperpilot.github.io/games/cat-queens/
Tests laufen separat in `.github/workflows/test-cat-queens.yml`.
