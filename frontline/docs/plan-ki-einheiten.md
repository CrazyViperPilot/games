# Frontline – Plan „KI nutzt die neuen Einheiten“ (Pakete K1–K4)

Auftrag Daniel, 2026-11-12. Die neuen Einheiten aus [plan-einheiten.md](plan-einheiten.md) baut die KI bisher nicht.
Ein Paket nach dem anderen, je Paket ein Commit.

## Gemeinsame Regeln

1. Erst `CLAUDE.md` (Rezept „KI-Verhalten anpassen“) lesen, dann nur die genannten Dateien gezielt (grep -n, Ausschnitte).
2. Werte (Schwellen, Anteile, Höchstzahlen) nur in `js/data/ai.js` (Armee-KI) bzw. `CITY.ai` (`js/data/city.js`, Fliegerhorst),
   je Zeile ein deutscher Kommentar. Schwierigkeitsabhängiges in `BALANCE.difficulty`.
3. Die KI ändert das Spiel nur über `game.issue`. Neue Einheiten gibt es nur mit Stadt (Kaserne, Fabrikhalle, Heliport, Stellplatz):
   prüfen, wie die KI heute dort ausbildet (`pickProducer`, `canTrain` in `js/ai/army/produce.js`).
4. Vorsichtig dosieren: kleine Anteile/Höchstzahlen, damit sich das bisherige KI-Verhalten nur wenig ändert.
5. PRD §10 (`docs/prd/ki.md`) und die Tabelle „KI-Konstanten“ ergänzen, Eintrag in `docs/changes/` (mit **Titel**).
6. Tests: neue Testdatei `test/ai-<thema>.test.js` mit einer gezielten Lage (nicht KI gegen KI über Minuten). Dann `npm run test:fast`,
   `npm run metrics` (bei gewollter Änderung `npm run metrics -- --update`), Prüfsummen `test/golden.test.js` nur neu setzen
   (`GOLDEN=print …`), wenn sie sich durch das Paket ändern, und das im Bericht nennen.
7. Commit `Frontline: <Paket> …`, nicht pushen.

## Pakete

| Paket | Inhalt | Stand |
|---|---|---|
| K1 | Unterstützer: Sanitäter, MANPADS, Flammenwerfer, Aufklärungsfahrzeug, Bergepanzer, Störsender | gebaut |
| K2 | Artillerie: Mörsertrupp und Raketenwerfer ausbilden und auf Ziele feuern lassen | gebaut |
| K3 | Luft: Aufklärungsdrohne, Kamikazedrohne, A-10 | offen |
| K4 | Pionier legt Minen | offen |

Bewusst **nicht**: Brückenleger, C-130/Fallschirmjäger (in PRD §10 als „baut die KI nicht“ vermerken, in K4).

### K1 – Unterstützer
In `counterMix` (`js/ai/army/produce.js`) nach dem Muster des Scharfschützen (`SNIPER_FROM`, `SNIPER_SHARE`):
- **Sanitäter:** ab 8 eigener Infanterie 1 Sanitäter je 8 (höchstens 3).
- **MANPADS:** wenn der Gegner Luftfahrzeuge hat (`rememberAir`), Anteil wie Flak, aber als Infanterie (höchstens 4).
- **Flammenwerfer:** wenn der Gegner Häuser besetzt hält (Häuserkampf), höchstens 3.
- **Aufklärungsfahrzeug:** 1 (ab mittlerer Armeegröße), fährt mit den Spähern/zur Zone.
- **Bergepanzer:** 1 ab 5 eigenen Fahrzeugen (repariert selbst, kein eigenes Verhalten nötig).
- **Störsender:** 1, wenn der Gegner SAM/Gepard/MANPADS hat und die KI Luftfahrzeuge besitzt; begleitet die Armee.

### K2 – Artillerie
- Ausbildung: Mörsertrupp (höchstens 2) und Raketenwerfer (höchstens 1) ab mittlerer Armeegröße.
- Feuer: nachsehen, ob die KI die Panzerhaubitze schon per `mortarTarget` lenkt (grep -n "pzh\|mortarTarget" js/ai). Wenn ja, beide
  Einheiten dort aufnehmen; wenn nein, kleine Methode: alle paar Sekunden sichtbares gegnerisches Ziel (Gebäude oder Gruppe ≥ 3) in
  Reichweite → `mortarTarget`.

### K3 – Luft
- Heliport: 1 Aufklärungsdrohne (über die Konfliktzone schicken, wie Späher), Kamikazedrohnen (höchstens 2) gegen gegnerische Panzer
  in der Nähe der Zone per `attack`.
- Fliegerhorst: A-10 statt eines Teils der F-16, wenn der Gegner viele schwere Fahrzeuge hat (in `CITY.ai`, Muster F-22/Su-27 in
  `js/ai/cityai.js` bzw. dort, wo die KI Jets ausbildet).

### K4 – Pionier
- Höchstens 2 Pioniere; legen Minen (`layMine`) auf Straßen/Zufahrten zwischen eigener Basis bzw. FOB und Konfliktzone,
  höchstens `maxMines` je Pionier, danach normal mitlaufen.
- PRD §10: Brückenleger und C-130 baut die KI nicht.
