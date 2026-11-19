# Simfurt – Arbeitsplan (Fertigstellung)

Stand der Analyse (Nov 2026). Architektur/Kern: Opus. Pakete P2–P5: Implementer (Haiku).
Verbindlich: `PRD.md`. Tests: `node simfurt/test/sim.test.js` (muss grün bleiben). Nach Abschluss aller Pakete `CACHE_NAME` in `sw.js` hochzählen (macht Opus).

## Befund
| Bereich | Problem |
|---|---|
| Speichern | Webspace `phpexpert.de/vocs/simfurt/api.php` lieferte **404** (gesamtes `/vocs` nicht ausgeliefert; Nov 2026 behoben: Backend liegt jetzt in diesem Repo und läuft unter `phpexpert.de/games/simfurt/api.php`). Ein Push wartet bis 12 s; währenddessen blockiert die `saving`-Sperre **auch das lokale Speichern** (Verstecken/Schließen der Seite geht verloren). |
| Speichern | `pagehide` startet nur asynchron gzip + IndexedDB → beim Schließen oft nicht fertig. Autosave nur jährlich → Fortschritt weg. |
| Speichern | Fällt IndexedDB aus (privater Modus, gesperrter Speicher), gibt es keinen Ersatz und kein Datei-Export/Import. |
| Server | `api.php` überschreibt `meta.size` (Kartengröße) mit der Bytezahl; `mb_substr` ohne Fallback. |
| Karte | Fluss läuft immer West→Ost als Sinuskurve um die Kartenmitte, Seitenarm immer von Norden. |
| UI | `s.hist` wird aufgezeichnet, aber nirgends angezeigt. Kein Rückgängig. Keine Hochwasser-Abwehr. Kein Ton. |

## Status
Alle Pakete P1–P5 erledigt (Nov 2026). Abweichung P3: Rückgängig speichert pro Aktion nur die Änderungen (berührte Kacheln, Gebäude, Kosten) statt eines ganzen Kartenschnappschusses – Wachstum und Einnahmen seit der Aktion bleiben erhalten. `s.hist` ist jährlich (Diagramme ab dem 2. Jahreswechsel).

## Pakete

### P1 – Speichersystem (Opus) · `js/save.js`, Speicher-Teil von `js/main.js`, `simfurt/api.php`
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

---

# Runde 4: S-Bahn, Nachbarstädte & Handel, Zeitung – erledigt
Abweichungen: keine fahrenden Züge; Straßenanschluss zählt nur mit Bebauung im Netz; Strom/Wasser-Zukauf nur mit eigener Anlage; `trade.links` wird abgeleitet (mitgespeichert, harmlos).

Speicher (Opus erledigt): `save.js` serialisiert die Kachelebene `rail` (Uint8Array N², fehlt in alten Ständen → bleibt 0) sowie `trade` und `news` (Objekte aus newCity). Reihenfolge: S1 und Z1 parallel, danach H1.

## S1 – S-Bahn · `js/data.js`, `js/sim.js`, `js/render.js`, Werkzeug in `js/main.js`, Tests
- Kachelebene `s.rail` (0/1) in newCity. Werkzeug `rail` (Kategorie `transport`, „Gleis“, 40 €/Kachel, Brücke 150 €, unlock 2000) wird wie Straße gemalt (toolCost/applyTool). Gleis und Straße schließen sich aus, außer **Bahnübergang**: Gleis auf Straße erlaubt (beide = 1), kostet 60 €, Verkehr dort +20 %. Abriss entfernt zuerst Gleis. Gleisunterhalt 0,5 €/Kachel/Monat (Budget-Ressort `roads` gilt mit).
- Gebäude `sbahn` (S-Bahnhof 2×1, 3000 €, Unterhalt 90, r 10, unlock 2000, kind `rail`): muss an Gleis grenzen (4-Nachbar einer Kachel).
- Netz: Zusammenhangskomponenten über Gleise (BFS, beim refresh). Ein Bahnhof wirkt nur, wenn in seiner Komponente ≥ 2 Bahnhöfe stehen ODER (H1) die Komponente den Kartenrand erreicht. Wirkung im Radius: Verkehrsaufkommen −45 % (wie metro, multiplikativ mit metro, gemeinsam max −70 %), Grundwert +8, Gewerbe-Nachfrage leicht +. Kartenansicht `rail` (Bahnabdeckung). Verordnung Gratis-ÖPNV wirkt auch auf S-Bahn.
- render: Gleis-Sprites (Schotter, zwei Schienen, Schwellen; Verbindungsmaske wie Straße, Brücke über Wasser, Bahnübergang mit weiß-roten Markierungen), Bahnhof-Sprite (Bahnsteigdach), optional fahrende Züge (reine Optik, wie Autos; nachts Licht, nur falls einfach).
- Tests: Gleis bauen/abreißen/Kosten; Bahnhof nur an Gleis; einzelner Bahnhof ohne Partner wirkt nicht, zwei verbundene wirken (Verkehr sinkt); Speichern erhält rail.

## Z1 – Zeitung & Bürgerstimmen · neu `js/news.js` (reine Logik, ohne DOM), UI in `js/main.js`, `style.css`, Tests neu `test/news.test.js` (+ in package.json/Workflow eintragen)
- `export function makeIssue(s)` → `{ y, m, title (Zeitungsname, z. B. „Simfurter Rundschau“), headline, articles: [{head, text}], voices: [{who, text, mood: 'good'|'bad'|'info'}], demands: [{key, text}] }`. Deterministisch aus Zustand (stats, parts, demand, fin, hist, msgs der letzten Monate, budget, ords, Müll/Wasser/Strom) + `s.rng`-unabhängigem Hash (KEIN rand(s), damit die Simulation unverändert bleibt).
- Schlagzeile nach größtem Thema (Meilenstein, Brand/Hochwasser, Steuern, Stau, Kriminalität, Arbeitslosigkeit, Strom-/Wasser-/Müllmangel, Wahrzeichen eröffnet, Haushalt). 3–5 Bürgerstimmen aus Textbausteinen mit Personen (Name, Alter, Viertel/Beruf), passend zu den schlechtesten/besten Zufriedenheitsteilen; Frankfurter Lokalkolorit (Ebbelwei, Main, Banker, Pendler), keine realen Personen. „Forderungen“ = die 2 drängendsten Themen mit konkretem Tipp.
- Erscheint monatlich: `s.news = { last: {y,m}, unread: bool, issues: [max 12] }` wird in main.js nach jedem Monatstick gefüllt (nicht in sim.js). HUD/FAB: Knopf „📰 Zeitung“ mit Punkt bei ungelesen; Sheet mit Zeitungslayout (Serifenschrift aus System-Fonts, Spalten auf breiten Bildschirmen), Blättern durch die letzten 12 Ausgaben.
- Tests: deterministisch; Schlagzeile wechselt mit Lage (z. B. hohe Steuern → Steuerthema, Stromausfall → Strom); immer 3–5 Stimmen; keine Exceptions bei leerer Stadt.

## H1 – Nachbarstädte & Handel · `js/data.js`, `js/sim.js`, `js/render.js` (Kartenrand-Markierung), Rat in `js/main.js`, Tests
- Bei newCity 3–4 Nachbarstädte deterministisch aus dem Seed: Name aus Liste (Offenbach, Bad Homburg, Hanau, Darmstadt, Bad Vilbel, Eschborn, Oberursel, Rüsselsheim, Neu-Isenburg, Maintal), Kante (N/O/S/W, verschieden), Größe (Einwohner 20.000–150.000), Schwerpunkt (Industrie/Gewerbe/Wohnen). Gespeichert in `s.trade.neighbors`.
- Anschluss: Straßen- bzw. Gleiskachel am Kartenrand der Kante einer Nachbarstadt (vom Stadtnetz erreichbar: BFS über Straße/Gleis von Zonen aus) = Verbindung (`road`/`rail`). Rat zeigt Verbindungen; Kartenrand-Markierung mit Namen/Pfeil in render.
- Wirkung je verbundener Nachbarstadt: Pendler (zusätzliche Arbeitskräfte bzw. Arbeitsplätze je nach Schwerpunkt, gedeckelt nach Größe), Nachfrage C/I/R +, Verkehr an der Anschlussstraße + (Gleis halbiert).
- Handel (Rat, je Ressource Schalter + Preis aus data.js): Stromüberschuss verkaufen (€/Einheit, nur verbundene Städte, Straße reicht – Leitung symbolisch), Strom zukaufen bei Mangel (teuer, deckt Fehlbedarf bis X), Wasser analog, Müll exportieren (Gebühr/t, nur mit Straßen- oder Gleisanschluss, verringert unentsorgten Rest). Einnahmen/Ausgaben in `s.fin.parts` (tradeIn/tradeOut), Rat zeigt sie.
- `s.trade = { neighbors, sellPower, buyPower, sellWater, buyWater, exportGarbage }` in newCity; alte Stände ohne trade → newCity-Werte (Nachbarn aus Seed – dafür eigener Hash, nicht rand(s), damit alte Stände identisch weiterlaufen).
- Tests: ohne Anschluss keine Wirkung; mit Straße an der richtigen Kante verbunden; Pendler senken Arbeitslosigkeit bzw. füllen Jobs; Stromkauf behebt Mangel und kostet; Müllexport senkt Rest; Determinismus; alte Stände laden.

---

# Runde 5: Lebendigkeit & Optik – erledigt
Abweichungen: Tuning-Werte in `LIFE` (life.js); Schranken statisch; Flammen/Rauch nach Sichtprüfung verstärkt; Zebrastreifen nur an Vier-Arm-Kreuzungen.

Reine Optik – die Simulation (`sim.js`) bleibt unverändert, Tests müssen bitgenau grün bleiben. Kein `rand(s)` in Optik-Code (eigener Math.random / Hash).

## L1 – Leben auf der Karte · neu `js/life.js`, zwei Hooks in `Renderer.draw`, Hook in `main.js` (frame), Tests optional
- `export class Life { constructor(); reset(); step(s, dt); drawGround(g, lg, view); drawAir(g, lg, view, time) }`; `view = {x0,y0,x1,y1}` (sichtbare Kacheln). Renderer bekommt `this.life` (gesetzt in main.js) und ruft `drawGround` direkt nach den Autos, `drawAir` nach den Objekten und vor der Flut/Tönung auf. `lg` ist die Nacht-Lichtebene oder null.
- **S-Bahnen**: Züge (2–3 Wagen, weiß-rot) fahren auf Gleisen zwischen Bahnhöfen der aktiven Netze (sonst gar nicht); Anzahl ~ Bahnhöfe; halten kurz am Bahnhof (Kacheln neben `sbahn`); Wagen folgen dem Pfad (Ringpuffer der letzten Kacheln). Nachts: Fensterband leuchtet, Frontlicht. Am Bahnübergang optional Schranke unten (nur Optik).
- **Boote**: auf zusammenhängendem Wasser ≥ 30 Kacheln, wenige (max 6), Ausflugsschiff (weiß) und Lastkahn (dunkel, lang), fahren langsam entlang des Flusses (Zufallsweg über Wasserkacheln ohne Rückwärts, an Brücken vorbei), Kielwasser-Linien; nachts Positionslichter.
- **Fußgänger**: kleine Figuren (2–3 px Körper, Kopf) in Parks, Wahrzeichen-Umgebung und auf Straßen nahe Gewerbe/Banken; Anzahl ~ Einwohner, max 80 sichtbar; schlendern zufällig; nur ab Zoom ≥ 0,7 zeichnen.
- **Löschzüge**: brennt eine Kachel und gibt es eine Feuerwehr, fährt ein rotes Löschfahrzeug (Blaulicht blinkt, nachts Glow) über Straßen von der Wache zur nächstgelegenen Straßenkachel am Brand (BFS), bleibt dort, solange es brennt, fährt dann zurück.
- **Rauch & Flammen**: Partikel (Pool, keine Allokation pro Frame) über Industrie Stufe ≥ 2 (Schornstein-Position aus Sprite-Höhe grob), Kraftwerk Gas, Müllverbrennung, Deponie (Staub/Möwen optional); weiche graue Kreise, steigen, wehen leicht, verblassen. Brände: animierte Flammen-Partikel (orange/gelb, nachts als Licht in lg) + dunkler Rauch statt der bisherigen Emojis (Emoji-Zeichnung in render.js entfernen).
- Performance: alles nur im Sichtbereich zeichnen, Partikel max ~400, step mit dt; Pause (speed 0) → Fahrzeuge/Fußgänger dürfen weiterlaufen (Optik), Brände nicht neu.

## L2 – Optik aufhübschen · `js/render.js` (nur Sprite-Funktionen, Boden/Wasser/Bäume/Gebäude-Details, KEINE Änderung an Renderer.draw-Ablauf), `style.css`, `index.html` (nur Meta/Klassen)
- Boden: Gras mit feiner Textur/Farbvarianz und weichen Übergängen, Ufer mit Sandkante/Böschung, Wasser mit Tiefenverlauf (Ufer heller), Glanzlinien animiert über `frame`.
- Straßen: Bürgersteigkante, Mittelstreifen gestrichelt, Kreuzungen mit Zebrastreifen bei hoher Stufe optional; Brücken mit Geländerschatten.
- Bäume: mehrere Formen (Laub rund, Kegel/Tanne), Schatten am Boden, Farbvarianz.
- Gebäude: weiche Schlagschatten (halbtransparentes Parallelogramm nach rechts unten), Kanten-Highlights (Licht von links oben), Fassadenvarianz (Balkone, Dachgärten, Klimageräte auf Dächern), Bankentürme mit Glas-Spiegelung (Verlauf). Größen/Offsets der Sprites (hmax, ox/oy) und die Fensterraster-Geometrie NICHT ändern (Nachtlicht-Sprites hängen daran); nur zusätzliche Details/Schattierung.
- UI (style.css): einheitliche Glas-Panels (backdrop-filter, Fallback), sanfte Übergänge beim Öffnen von Sheets, bessere Knöpfe im Dock (Icons größer, aktive Kategorie hervorgehoben), lesbarere HUD-Chips, Nachfragebalken mit Verlauf. Touch-Ziele ≥ 44 px, Hochformat Pixel 8a.
- Prüfen per headless Chrome (Screenshots im Scratchpad, nicht im Projekt): Tag/Nacht, Zoom 0,6 und 1,4, 128er-Karte flüssig.
