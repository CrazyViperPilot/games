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

---

# Runde 2 (Nov 2026): Budget, Verordnungen, Wasser, Minikarte – erledigt
Abweichungen: Verordnungs-Wirkungen als `mul`/`add` in ORDINANCES; Minikarte 112×64 (Raute 2:1); Wassergebäude ohne Strom-/Kriminalitätslast; alte Stände bekommen einen Hinweis aufs Pumpwerk.

Gemeinsame Regeln: Neue Zustandsfelder legt `newCity` mit Standardwerten an; `js/save.js` serialisiert `budget` und `ords` bereits (KEYS). Fehlen sie in alten Ständen, bleiben die Standardwerte aus `newCity`. Werte/Balancing in `js/data.js`. Tests in `test/sim.test.js` anhängen; `npm test` (im Ordner simfurt) muss grün sein. `buildCity` in `test/bot.mjs` darf erweitert werden (z. B. Pumpwerke), Schwellen nicht absenken.

## Q1 – Budget je Ressort + Verordnungen · `js/data.js`, `js/sim.js`, Rat in `js/main.js`
- `s.budget = { police: 100, fire: 100, health: 100, edu: 100, roads: 100 }` (Prozent, Regler 0–120 in 10er-Schritten).
- Wirkung: Unterhalt der Gebäude dieses Ressorts × budget/100 (roads → Straßenunterhalt). Abdeckungsstärke beim Stempeln × f(b) mit f(b) = min(1.1, b/100) (0 % = keine Wirkung). Straßen < 60 %: Verkehrsbelastung steigt (× 1 + (60−b)/100), Zufriedenheit „Verkehr“ leidet.
- Mapping Gebäude → Ressort über `kind`: police→police, fire→fire, health→health, edu→edu. Parks/Wahrzeichen/Metro/Strom bleiben ohne Regler.
- Finanzaufschlüsselung `s.fin.parts` um Ressorts ergänzen (Unterhalt je Ressort), Rat zeigt sie.
- Verordnungen `ORDINANCES` in data.js, Zustand `s.ords = {}` (id → true). Je Eintrag: `{ id, name, desc, cost (€/Monat, kann von Einwohnern abhängen: costPerPop), unlock (Einwohner), effects }`. Mindestens 8: Tempo 30 (Verkehr −10 %, Zufriedenheit +1, Gewerbe-Nachfrage −0,03), Gratis-ÖPNV (Metro-Wirkung ×1,5, Kosten je Einw.), Rauchverbot (Gesundheit +, Gewerbe-Nachfrage −), Ebbelwei-Fest (Tourismus +, Kriminalität leicht +, Zufriedenheit +2), Nachbarschaftswache (Kriminalität −10 %), Recyclingpflicht (Verschmutzung −10 %, Kosten), Nachtflugverbot (nur mit Flughafen; Zufriedenheit +3, Tourismus Flughafen −20 %), Grüne Dächer (Verschmutzung −5 %, Grundwert +2, teuer), Gewerbesteuer-Rabatt für Banken (B-Nachfrage +, Bankensteuer −15 %). Wirkungen werden zentral in refresh/financeStep/demandStep angewendet (Hilfsfunktion `ordFx(s)` liefert aufsummierte Faktoren).
- Zufriedenheits-Teile (`stats.parts`) um `ords` ergänzen. Rat: Abschnitte „Budget“ (Regler) und „Verordnungen“ (Checkbox-Liste mit Kosten, gesperrte grau mit „ab X Einw.“).
- Exporte: `ORDINANCES` (data.js), `setBudget(s, key, v)`, `toggleOrd(s, id)` → bool (sim.js).

## Q2 – Wasserversorgung · `js/data.js`, `js/sim.js`, `js/render.js`, kleine Hooks in `js/main.js`
- Ohne Leitungen (touch-freundlich): Wasser wie Strom per Radius + Kapazität.
- Gebäude (cat `water`, neue Kategorie „Wasser“ 💧 in CATS): `pump` Pumpwerk 2×2, 2500 €, Unterhalt 80, cap 260, r 14, unlock 0, **muss an Wasser grenzen** (wie Deich: eine Kachel des Rechtecks hat Wasser als 4-Nachbar); `tower` Wasserturm 1×1, 1200 €, Unterhalt 30, cap 0, r 9, verteilt (erweitert die Versorgung: Kacheln im Radius gelten als versorgt, wenn mindestens ein Pumpwerk existiert); `treat` Kläranlage 2×2, 6000 €, Unterhalt 160, unlock 3000, senkt Verschmutzung im Radius 10 um 40 % und erhöht die Wasser-Kapazität aller Pumpwerke um 25 %. Deich zieht nach `water`.
- `m.water` (0/1), `s.waterCap`, `s.waterLoad`, `s.waterRatio`, `s.watered` (Uint8Array) analog zu Strom; Last je Zone/Stufe = ZONES.load.
- Wachstum: Stufe ≥ 2 nur mit Wasser. Ohne Wasser bleibt eine Parzelle auf max. Stufe 1; Stufen > 1 ohne Wasser sinken langsam (rand < 0,05).
- Zufriedenheit `parts.water` (−20 × Fehlanteil, wenn Parzellen ≥ Stufe 2 existieren), Berater-Meldung, Kartenansicht `water` (OVERLAYS + render), tileInfo-Hinweis „⚠ Kein Wasser“.
- Startgeld unverändert; Hilfe-Text im Menü (main.js) um Pumpwerk ergänzen.

## Q3 – Minikarte · neu `js/minimap.js`, `index.html`, `style.css`, Hooks in `js/main.js`
- Kleines Canvas (z. B. 112×112 CSS-px, oben links unter dem HUD, ein-/ausklappbar per Knopf, Zustand in localStorage `simfurt-mini`). Draufsicht (nicht isometrisch gedreht – oder als Raute, ist frei) mit Farben: Wasser, Wald, Gras, Straße, Zonenfarben je Stufe, Gebäude, Feuer rot.
- Zeichnet das aktuelle Sichtfeld als Rahmen. Antippen/Klicken/Ziehen springt dorthin (`R.centerOn(x, y)`).
- Neu zeichnen höchstens 2×/s bzw. bei Änderungen (ImageData, eine Pixelzeile je Kachel, dann skaliert).
- API: `export class MiniMap { constructor(canvas, renderer); draw(s); }`.

---

# Runde 3: Müll & Recycling, Tag & Nacht – erledigt
Abweichungen: Müllbelastung wird in refresh aus Aufkommen + Deponie-Füllständen berechnet (speicherfest); buildCity setzt Deponie + Verbrennung; Bank-Sprite hmax 240.

## M1 – Müll & Recycling · `js/data.js`, `js/sim.js`, Sprites in `js/render.js` (nur `buildingSprite`-Fälle + Overlay-Fall), Rat/Hilfe in `js/main.js`, Tests
- Müllaufkommen je Monat: Σ über aktive Parzellen `GARBAGE[z][l]` (Daten in data.js; R klein, C mittel, I groß, B mittel) + Dienstgebäude 1. Kennzahl `s.garbage` (t/Monat).
- Neue Kategorie `waste` („Müll“, 🗑) in CATS nach `water`. Gebäude:
  - `dump` Deponie 3×3, 1500 €, Unterhalt 40, cap 300 t/Monat Annahme, r 0, Volumen 12.000 t (`b.fill` im Gebäudeobjekt, wird mit gespeichert, da `bld` serialisiert wird); voll → nimmt nichts mehr an, Berater-Meldung; starke Verschmutzung Radius 7 (pol 30), Grundwert −; kann abgerissen werden.
  - `incin` Müllverbrennung 2×2, 7000 €, Unterhalt 220, unlock 2500, cap 500 t, erzeugt Strom (Kraftwerk-Kapazität +60, zählt als `power` mit r 8) und Verschmutzung pol 18.
  - `recyc` Recyclinghof 2×2, 4000 €, Unterhalt 120, unlock 1200, reduziert Müllaufkommen stadtweit um 12 % je Hof (max. 36 %), keine Verschmutzung, kleiner Tourismus 0.
  - Verordnung `recycling` (vorhanden): zusätzlich Müllaufkommen −15 %.
- Entsorgung: Müll wird erst an Recycling (Reduktion), dann an Verbrennungen (bis cap), dann an Deponien (bis cap & Restvolumen) verteilt. Nicht entsorgter Rest `s.garbageLeft`: Verschmutzung steigt stadtweit (alle Parzellen + Anteil), Zufriedenheit `parts.garbage` = −min(20, 25 × Anteil unentsorgt); Kartenansicht `garbage` (Müll-Belastung je Parzelle = unentsorgter Anteil × Aufkommen). Erst ab 400 Einwohnern wirksam (Schonfrist), damit der Start nicht leidet.
- Rat: Zeile „Müll: Aufkommen / entsorgt (Deponie-Restvolumen)“, Finanzen: Unterhalt wie andere Gebäude. tileInfo für Deponie: Füllstand.
- Bestehende Tests grün; buildCity bekommt eine Deponie, falls nötig. Neue Tests: Aufkommen wächst mit Stadt; Deponie füllt sich und ist irgendwann voll; Recyclinghof und Verordnung senken Aufkommen; ohne Entsorgung sinkt Zufriedenheit; Verbrennung liefert Strom; Speichern erhält `fill`.

## M2 – Tag & Nacht (Optik) · `js/render.js` (Renderer.draw + neue Licht-Sprites), Schalter in `js/main.js`, `style.css` falls nötig
- Tageszeit `ui.daytime` ∈ [0,1) (0 = Mitternacht, 0,5 = Mittag). Modus im Menü: „Auto“ (ein Tag = 6 Minuten Echtzeit, läuft auch in Pause weiter), „Tag“, „Nacht“; Einstellung in localStorage `simfurt-daynight`. Standard Auto.
- Dunkelheit d(t) weich (Dämmerung orange/rosa, Nacht dunkelblau, max. Abdunklung ~0,62). Umsetzung: Szene normal zeichnen → Vollbild-Tönung (`fillRect`, ggf. `multiply`) → Lichtebene mit `globalCompositeOperation = 'lighter'`:
  - Gebäude-Lichtsprites (gecacht wie andere Sprites, Schlüssel z. B. `light:z:lvl:vr` bzw. `light:key`): beleuchtete Fenster passend zu den Fensterrastern der Gebäudesprites (gleiche Geometrie wie `windows()`; pro Fenster per `rnd` an/aus, ~55 % an, warmgelb; Bankentürme kühlweiß, Antennen-/Dachspitzen rote Positionslichter blinkend).
  - Straßenlaternen: weicher Lichtkegel an jeder 2. Straßenkachel (deterministisch).
  - Autos: Scheinwerfer (kleiner heller Punkt) nachts.
  - Wahrzeichen angestrahlt (Glow am Sockel).
- Nur sichtbare Kacheln, Lichtebene nur bei d > 0,05. Performance: keine Allokationen pro Frame, gecachte Sprites; 128er-Karte flüssig.
- Overlays (Kartenansichten) werden über der Tönung ohne Abdunklung gezeichnet (Lesbarkeit). Minikarte bleibt unverändert.
