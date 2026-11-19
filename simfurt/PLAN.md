# Simfurt – Arbeitsplan (Fertigstellung)

Stand der Analyse (Nov 2026). Architektur/Kern: Opus. Pakete P2–P5: Implementer (Haiku).
Verbindlich: `PRD.md`. Tests: `node simfurt/test/sim.test.js` (muss grün bleiben). Nach Abschluss aller Pakete `CACHE_NAME` in `sw.js` hochzählen (macht Opus).

## Befund
| Bereich | Problem |
|---|---|
| Speichern | Webspace `phpexpert.de/vocs/simfurt/api.php` liefert **404** (gesamtes `/vocs` nicht ausgeliefert). Ein Push wartet bis 12 s; währenddessen blockiert die `saving`-Sperre **auch das lokale Speichern** (Verstecken/Schließen der Seite geht verloren). |
| Speichern | `pagehide` startet nur asynchron gzip + IndexedDB → beim Schließen oft nicht fertig. Autosave nur jährlich → Fortschritt weg. |
| Speichern | Fällt IndexedDB aus (privater Modus, gesperrter Speicher), gibt es keinen Ersatz und kein Datei-Export/Import. |
| Server | `api.php` überschreibt `meta.size` (Kartengröße) mit der Bytezahl; `mb_substr` ohne Fallback. |
| Karte | Fluss läuft immer West→Ost als Sinuskurve um die Kartenmitte, Seitenarm immer von Norden. |
| UI | `s.hist` wird aufgezeichnet, aber nirgends angezeigt. Kein Rückgängig. Keine Hochwasser-Abwehr. Kein Ton. |

## Status
Alle Pakete P1–P5 erledigt (Nov 2026). Abweichung P3: Rückgängig speichert pro Aktion nur die Änderungen (berührte Kacheln, Gebäude, Kosten) statt eines ganzen Kartenschnappschusses – Wachstum und Einnahmen seit der Aktion bleiben erhalten. `s.hist` ist jährlich (Diagramme ab dem 2. Jahreswechsel).

## Pakete

### P1 – Speichersystem (Opus) · `js/save.js`, Speicher-Teil von `js/main.js`, vipervocs `simfurt/api.php`
- Lokale Speicherung entkoppelt vom Webspace: lokal sofort, Webspace im Hintergrund (eigene Sperre, nie blockierend).
- Backend-Kette lokal: IndexedDB → Fallback `localStorage` (gzip+Base64 bzw. JSON).
- Notfall-Schnappschuss synchron in `localStorage` (`simfurt-snap`) bei `visibilitychange`/`pagehide`; beim Laden gewinnt der neuere Stand.
- Autosave alle 3 Spielmonate + alle 60 s Echtzeit + bei Jahreswechsel.
- **Datei-Export/Import** (`.simfurt`, gzip-JSON; ohne CompressionStream reines JSON). Import in beliebigen Platz.
- Webspace: nicht erreichbar (404/HTML/Netz) → für die Sitzung als „offline“ markiert; Menü zeigt den Status.
- Format 2 (abwärtskompatibel zu 1). Exporte: `serialize`, `deserialize`, `saveSlot`, `loadSlot`, `listSlots`, `deleteSlot`, `exportFile(s)`, `importFile(file)`, `snapshot(s, slot)`, `storageInfo()`.

### P2 – Zufälliger Flusslauf (Haiku) · nur `generateMap` in `js/sim.js`, Tests in `test/sim.test.js`, ggf. `test/bot.mjs`
Siehe Auftrag im Abschnitt „P2 Details“.

### P3 – Rückgängig + Deich (Haiku) · `js/sim.js`, `js/data.js`, `js/render.js`, kleine Hooks in `js/main.js`
- `pushUndo(s)` / `endUndo(s)` / `popUndo(s)` / `undo(s)` / `canUndo(s)` in sim.js: bis zu 10 Aktionen, je Aktion nur die Änderungen + Kosten (Erstattung).
- Werkzeug „↶ Rückgängig“ in Kategorie Werkzeug + Taste Strg+Z / U.
- Gebäude `dike` (Deich, 1×1, 150 €, Unterhalt 2, unlock 0, cat `transport`, kind `dike`, r 4): nur an Wasser angrenzend baubar; Kacheln im Radius werden von Hochwasser nicht getroffen. Sprite: niedriger grüner Wall.

### P4 – Statistik + Ton (Haiku) · `js/main.js`, neu `js/sound.js`, `style.css`
- Rat → Abschnitt „Verlauf“: Canvas-Diagramme aus `s.hist` (Einwohner, Kasse, Zufriedenheit; ein Eintrag pro Jahr), letzte 10 Jahre.
- `js/sound.js`: WebAudio-Synth ohne Dateien (`click`, `build`, `bulldoze`, `money`, `alarm`, `milestone`), Schalter im Menü, Einstellung in `localStorage` `simfurt-sound`.

### P5 – Abschluss (Opus) · PRD, `sw.js`, README, Review.

## P2 Details – Flusslauf
- Deterministisch pro Seed (nur `rand(s)`), immer anders zwischen Seeds.
- Eintritts- und Austrittskante zufällig (N/O/S/W), verschieden; auch „über Eck“ (benachbarte Kanten) erlaubt.
- Pfad: 3–6 Kontrollpunkte zwischen Ein- und Austritt mit zufälliger seitlicher Auslenkung, geglättet (Catmull-Rom o. Ä.), plus Mäander-Rauschen.
- Breite variiert entlang des Laufs (≈ 1,6–3,6 Kacheln × √(N/64)).
- Zufällig 0–2 Seitenarme von einer anderen Kante, die in den Hauptfluss münden (schmal, 1 Kachel).
- Zufällig (≈ 35 %) eine Flussinsel (Land in einer breiten Stelle) und/oder (≈ 25 %) ein kleiner See abseits.
- Wasseranteil 4–22 % der Karte. Hauptfluss zusammenhängend von Kante zu Kante.
- Mittlere Startfläche weiterhin waldarm; mindestens 40 % der Karte Land in der größten Landfläche.
- Tests: 30 Seeds → mindestens 5 verschiedene Kantenpaare; Wasseranteil im Rahmen; Fluss berührt zwei Kanten und ist zusammenhängend; gleiche Seed = gleiche Karte. Bestehende Tests müssen grün bleiben (bot.mjs ggf. robuster machen, z. B. Raster auf Land verschieben).
