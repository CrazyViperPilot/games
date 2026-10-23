# Vibe Squadron

A vibe-coded scroll shooter: Verteidige das Mutterschiff gegen Wellen von Gegnern, kaufe in der Bauphase
Waffen, Fähigkeiten, Abwehrtürme und Schiffsmodule, baue in der Werft eine eigene Flotte.

Ursprünglich im Repo `CrazyViperPilot/CrazyScrollShooter`, mit Historie per `git subtree` übernommen.

- **Spiel:** alles in `index.html` (eine Datei, kein Build).
- **Offline / App:** `manifest.json` + `sw.js` (network-first, Cache-Präfix `vibesquadron-`, löscht nur eigene Caches).
  Release: Änderung + `CACHE_VERSION` in `sw.js` erhöhen.
- **Spielstand:** `localStorage`-Schlüssel `vibesquadron-save` (Checkpoint zu Beginn jeder Bauphase zwischen den Wellen)
  und `vibesquadron-best` (Bestwert). Im Startmenü „Weiter – Welle N“ oder „Neues Spiel“; bei Game Over wird der
  Spielstand gelöscht. Wer mitten in einer Welle aufhört, macht in der Bauphase vor dieser Welle weiter.
  Bei inkompatiblen Änderungen am Spielstand `SAVE_VERSION` in `index.html` erhöhen (alte Stände werden dann ignoriert).
