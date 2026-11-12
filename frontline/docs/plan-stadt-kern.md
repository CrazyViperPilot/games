# Frontline – Plan „Stadt ist Kern“ Stufe 2 (Pakete S2a–S2f)

Daniel, 2026-11-12: Es gibt nur noch die Variante mit Stadt. Stufe 1 (Startmenü, Doku) ist gebaut. Stufe 2 entfernt den Modus
ohne Stadt aus Simulation, KI, UI und Tests. Ein Paket je Sitzung, nach jedem Paket `npm test` grün.

## Regeln
1. Erst `CLAUDE.md`, dann nur gezielt (grep -n, Ausschnitte). Token-Budget je Paket unter 80 000.
2. Verhalten **mit** Stadt darf sich nicht ändern (Ausnahme S2a: Standardwert). Prüfsummen `test/golden.test.js` nur neu setzen, wenn
   das Paket den Ablauf einer Stadt-Partie ändert, und das melden.
3. Spielstände ohne Stadt (alt) dürfen beim Laden nicht abstürzen: dann mit Meldung ablehnen („Spielstand ohne Stadt wird nicht mehr unterstützt“).
4. Je Paket: Eintrag in `docs/changes/` (mit **Titel**), betroffene PRD-Stellen bereinigen, Commit, nicht pushen.

| Paket | Inhalt | Stand |
|---|---|---|
| S2a | `new Game()` startet standardmäßig mit Stadt; Tests, die heute ohne Stadt laufen, bekommen ausdrücklich `city: false` (rein mechanisch, damit alles grün bleibt) | offen |
| S2b | Tests umstellen: `city: false`-Tests auf Stadt umbauen oder löschen, wenn sie nur den alten Modus prüfen; `test/classic.js` auflösen | offen |
| S2c | Simulation: Zweige `if (!game.city…)` in `js/game` (Ausbildung in der Hauptstadt/`fob.produces`, Lager, Wirtschaft, Logistik, Luft) entfernen | offen |
| S2d | KI: Pfade ohne Stadt in `js/ai` entfernen | offen |
| S2e | UI und Darstellung: Zweige in `js/ui`, `js/render`, Editor auf Stadt | offen |
| S2f | Option `city` ganz entfernen (Konstruktor, Speichern/Laden mit Ablehnung alter Stände), CLAUDE.md Regel 9, ARCHITEKTUR, Restdoku | offen |
