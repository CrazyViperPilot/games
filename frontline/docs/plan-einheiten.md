# Frontline – Plan „Neue Einheiten“ (Pakete E1–E14)

Quelle: Vorschlag vom 2026-11-12 (Daniels Wunsch: alles umsetzen). Umgesetzt wird **ein Paket nach dem anderen**,
jedes Paket ist für sich lauffähig, getestet und committet.

## Gemeinsame Regeln für jedes Paket (bitte genau so)

1. Erst lesen: `CLAUDE.md`, dann nur die genannten Dateien. Nicht das ganze Repo durchsuchen (Token sparen: gezielt `grep -n`, Dateien
   mit `offset/limit` lesen).
2. **Vorbild** ist immer eine vorhandene Einheit (genannt im Paket). Mit `grep -rn "<vorbild>" js test` alle Stellen finden, an denen
   das Vorbild vorkommt, und die neue Einheit dort ebenso eintragen (Ausbildung, Hilfe, Forschungsgruppen, Modell, Symbol, KI-Listen).
3. Werte nur in `js/data/` (meist `units.js`, ggf. `balance.js`), mit deutschem Kommentar. Kosten mit Stadt wie beim Vorbild (Stahl, Einwohner).
4. **Taste:** eine im jeweiligen Ausbildungsmenü freie Taste wählen; `test/config.test.js` prüft Kollisionen (feste Tasten J, H, V, Y, P, M tabu).
5. **Modell:** nach `docs/rezept-einheiten.md`, klein halten (Silhouette aus 5–15 Körpern), höchstens 2 Vorschaurunden mit
   `node tools/unitpreview.mjs <typ>`.
6. Doku: Zeile in der Einheitentabelle `docs/prd/einheiten.md` §6, eine Datei `docs/changes/<paket>-<typ>.md` (eine Zeile, ohne
   Versionsnummer), Hilfe `js/ui/helptext.js` prüfen.
7. Ein neuer Test `test/<typ>.test.js` (Vorbild `test/sniper.test.js`): ausbilden + Kernfähigkeit prüfen.
8. `npm run docs`, `npm run test:quick`, dann `npm run test:fast`. Ändern sich Prüfsummen in `test/golden.test.js`, nur dann neu setzen,
   wenn die KI die Einheit baut (sonst ist es ein Fehler). KI baut neue Einheiten **nicht**, außer das Paket sagt es.
9. Commit auf dem aktuellen Branch: `Frontline: <Paket> <Einheit>`. Nicht pushen (macht der Koordinator).
10. Am Ende kurz melden: geänderte Dateien, Testergebnis, offene Punkte.

## Übersicht

| Paket | Einheit (Typ-ID) | Vorbild | Kern | Stand |
|---|---|---|---|---|
| E1 | Sanitäter (`medic`) | `rifleman` | heilt Soldaten im Umkreis | gebaut |
| E2 | MANPADS-Soldat (`manpads`) | `at` + Waffe der `sam` | Flugabwehrrakete zu Fuß | gebaut |
| E3 | Flammenwerfer (`flamer`) | `rifleman` | kurze Reichweite, stark gegen besetzte Häuser und Infanterie | gebaut |
| E4 | Mörsertrupp (`mortarteam`) | `pzh` (Feuer auf Punkt) | leichter Mörser zu Fuß | offen |
| E5 | Aufklärungsfahrzeug (`scout`) | `truck` | große Sicht, getarnt im Stand | offen |
| E6 | Raketenwerfer (`mlrs`) | `pzh` | Salve aus 12 Raketen, lange Nachladezeit | offen |
| E7 | Bergepanzer (`recovery`) | `engineer` (Reparatur) | repariert Fahrzeuge im Feld | offen |
| E8 | Pionier (`sapper`) | `rifleman` | legt getarnte Panzerminen, räumt Minen | offen |
| E9 | Störsender (`jammer`) | `flak` | senkt gegnerische Trefferchance von Lenkwaffen im Umkreis | offen |
| E10 | Aufklärungsdrohne (`drone`) | `littlebird` | billig, Sicht, begrenzte Flugzeit | offen |
| E11 | Kamikazedrohne (`fpv`) | `drone` aus E10 | Einweg, stürzt sich auf ein Fahrzeug | offen |
| E12 | Erdkampfflugzeug (`a10`) | `f16` | Bordkanone gegen Bodenziele, lange Einsatzzeit | offen |
| E13 | Transportflugzeug + Fallschirmjäger (`c130`) | `f16`, `transporter` | setzt Infanterie über Punkt ab | offen |
| E14 | Brückenleger (`bridgelayer`) | `excavator` | legt Behelfsbrücke über eine Flusszelle | offen |

## Pakete

### E1 – Sanitäter (`medic`)
- Infanterie, Hauptstadt / Kaserne, Kosten wie Schütze +50 %, HP wie Schütze, **unbewaffnet**.
- Heilt jede Sekunde die am stärksten verletzte eigene Infanterie (auch Kommandeur) im Umkreis 90 px um 6 HP (`UNITS.medic.heal`).
  Nicht sich selbst, nicht in Häusern/Fahrzeugen. Logik als eigene kleine Datei `js/game/medic.js`, aufgerufen im Simulationsschritt
  dort, wo andere Fähigkeiten laufen (`grep -n "updateExcavators\|abilities" js/game/game.js`).
- Bild: dezentes weißes Kreuz / Armbinde. Test: verletzter Schütze neben Sanitäter hat nach 5 s mehr HP.

### E2 – MANPADS-Soldat (`manpads`)
- Infanterie, wie Panzerabwehrsoldat. Waffe: wärmesuchende Rakete **nur gegen Luftziele** (Werte wie SAM, aber Reichweite 300,
  Schaden 250, 12 s Nachladen). Darf Häuser besetzen wie andere Infanterie.
- Zählt in der Forschungsgruppe „Flugabwehr“, falls die Gruppen über Listen gebildet werden. Test: trifft einen Hubschrauber, schießt nicht auf Panzer.

### E3 – Flammenwerfer (`flamer`)
- Infanterie, Reichweite 70, schneller Schaden mit kleiner Fläche (Splash 25). Schaden: Soldat hoch, Gebäude mittel, Fahrzeuge gering.
- Gegen besetzte Stadthäuser Faktor ×2 auf den Schaden an der Besatzung (Stelle: Häuserkampf, `js/game/garrison.js`, Wert in data).
- Effekt im Renderer: kurzer orangefarbener Strahl (vorhandene Effekte in `js/render/fx.js` nutzen). Test: tötet Schützen schneller als ein Schütze.

### E4 – Mörsertrupp (`mortarteam`)
- Infanterie (langsam, 1 Platz). Mörserwaffe wie das Mörser-Gebäude, aber Reichweite 700, min. 150, 5 s Kadenz.
- Befehle **Feuer auf Punkt (G)** und **Ziel löschen (C)** wie Panzerhaubitze (`mortarTarget`). Test: Feuer auf Punkt schadet Ziel in Reichweite.

### E5 – Aufklärungsfahrzeug (`scout`)
- Leichtes Fahrzeug, schnell, 2 Plätze, leichtes MG, Sicht 520 (Vorbild für Sicht: `gepard`).
- **Getarnt**, wenn es 3 s steht (gleiche Tarnregel wie Scharfschütze: `grep -n "camo\|stealth" js/game`). Test: stehend unsichtbar für Gegner außerhalb der Aufdeckdistanz.

### E6 – Raketenwerfer (`mlrs`)
- Fahrzeug wie Panzerhaubitze. Waffe: Salve aus 12 Raketen (0,25 s Abstand), danach 30 s Nachladen; Reichweite 1600, min. 400,
  Streuung 120 px, Splash 60. Braucht Teamsicht, Feuer auf Punkt wie `pzh`. Test: Salve feuert 12 Geschosse, dann Pause.

### E7 – Bergepanzer (`recovery`)
- Leicht gepanzertes Fahrzeug, unbewaffnet. Repariert **eigene Fahrzeuge** (keine Luftfahrzeuge) im Umkreis 60 px mit 15 HP/s,
  kostet Baumaterial aus dem Teamlager wie die Reparatur des Baufahrzeugs (Vorbild `engineer`, Befehl `repair`).
  Automatisch beim nächsten beschädigten Fahrzeug in 200 px, wenn untätig. Test: beschädigter Panzer wird repariert.

### E8 – Pionier (`sapper`)
- Infanterie. Befehl **Mine legen** (freie Taste): legt an der Klickstelle eine Panzermine (Kosten 40 Munition, max. 6 je Pionier aktiv).
- Mine: getarnt für den Gegner (nur sichtbar ≤ 60 px durch Pionier oder ≤ 25 px sonst), löst bei gegnerischem **Fahrzeug** in 18 px aus
  (Schaden 600 schwer / 400 leicht), Infanterie löst nicht aus. Pionier räumt gegnerische Minen in 40 px automatisch (3 s).
- Minen als eigene Liste `game.mines` (mit Speichern in `savegame.js`). Test: Panzer fährt drüber und nimmt Schaden; Schütze nicht.

### E9 – Störsender (`jammer`)
- Fahrzeug, unbewaffnet, 2 Plätze. Gegnerische **Lenkwaffen** (SAM, MANPADS, Gepard, F-16/F-22/Su-27-Raketen, AH-64-Raketen)
  haben gegen Ziele im Umkreis 300 px um den Störsender −35 % Trefferchance (Wert in data). Mehrere Störsender stapeln nicht.
- Stelle: Trefferchance-Berechnung in `js/game/combat.js`. Bild: Fahrzeug mit Antennen, Umkreis bei Auswahl. Test: Trefferchance sinkt.

### E10 – Aufklärungsdrohne (`drone`)
- Luftfahrzeug (Heliport / Hauptstadt), sehr billig, 120 HP, langsam (Vorbild Little Bird, aber 0 Passagiere), Sicht 450,
  Treibstoff 40 (kehrt zum Tanken heim wie Hubschrauber). Unbewaffnet. Nur mit Forschung im Rechenzentrum, falls dort einfach eine
  Freischaltung möglich ist; sonst ohne. Test: ausbilden, fliegt, deckt Nebel auf.

### E11 – Kamikazedrohne (`fpv`)
- Wie E10, aber 60 HP, schnell, Sicht 250. Angriffsbefehl auf Fahrzeug/Gebäude: fliegt hin, explodiert bei Kontakt
  (Schaden 700 schwer, 500 leicht, 300 Gebäude, Splash 30) und verschwindet. Test: Drohne trifft Panzer, ist danach weg.

### E12 – Erdkampfflugzeug (`a10`)
- Fliegerhorst wie F-16 (Start/Landung, Tanken). Bordkanone gegen Bodenziele (schnelle Kadenz, gut gegen Fahrzeuge),
  keine Luftziele. Langsam für einen Jet (Tempo ~60 % der F-16), viel HP, kreist über dem Angriffsziel bis Munition/Treibstoff leer.
- Test nach Vorbild `test/airbase.test.js` (F-22-Teil): am Stellplatz ausbildbar, greift Bodenziel an.

### E13 – Transportflugzeug (`c130`) mit Fallschirmjägern
- Fliegerhorst, unbewaffnet, 10 Passagiere (nur Infanterie, Einsteigen am Stellplatz). Befehl **Absetzen** (freie Taste) auf einen Punkt:
  fliegt hin, Passagiere landen im Umkreis 80 px nach 3 s „Fallschirm“ (verwundbar, nicht schießend), Flugzeug fliegt heim.
- Test: Soldaten stehen nach dem Absetzen am Zielpunkt.

### E14 – Brückenleger (`bridgelayer`)
- Fahrzeug, unbewaffnet. Befehl **Brücke legen** (freie Taste) auf eine Flusszelle direkt neben Land: nach 8 s wird die Zelle befahrbar
  (wie eine Brückenfahrbahn, `js/game/river.js` / `bridge`), max. 1 Brücke je Fahrzeug (neue Brücke = alte weg). Brücke hat HP und
  kann zerstört werden. Wegsuche neu berechnen wie beim Bagger. Test: Fahrzeug kommt danach über den Fluss.
