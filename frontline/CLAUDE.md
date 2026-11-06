# Frontline – Einstieg für Erweiterungen

Echtzeit-Strategie im Browser (Blau = Spieler gegen Rot = KI). Vanilla JS mit ES-Modulen, Canvas 2D und WebGL-Boden,
kein Build-Schritt, offline als PWA. Diese Datei ist der Einstieg für Menschen und Modelle: erst sie lesen, dann gezielt
die genannten Dateien.

- **Regeln des Spiels:** [PRD.md](PRD.md) ist der Einstieg (Ziel, Ablauf, Übersicht); die Regeln je Thema stehen seit v5.79 in
  [docs/prd/](docs/prd/) (Abschnittsnummern §3 … §16 wie früher, Zuordnung in der Übersicht von PRD.md). **Für ein Paket nur PRD.md
  und die Themen-Datei(en) lesen, nicht alle.** Änderungsverlauf: [docs/changelog.md](docs/changelog.md) (nur bei Bedarf).
- **Aufbau des Codes:** [ARCHITEKTUR.md](ARCHITEKTUR.md) (Schichten, Simulationsschritt, Datenmodelle, Befehle)
- **Entstehung:** [docs/verlauf.md](docs/verlauf.md) (alter Umsetzungsplan v1 bis v4.23, nur zum Nachlesen; Code-Kommentare verweisen auf seine Abschnitte)

## Regeln

1. Die Simulation (`js/data`, `js/core/rng.js`, `js/game`, `js/ai`) kennt kein DOM und kein `window`. Sie läuft in Node-Tests.
2. Spieler und KI ändern das Spiel **nur** über `game.issue(team, cmd)`. Renderer, HUD und Minimap lesen nur.
3. Spielwerte gehören nach `js/data/` (`balance.js` mit den Schnelleinstellungen `QUICK` ganz oben, `units.js`, `buildings.js`, `ai.js`, `mapgen.js`),
   mit deutschem Kommentar, was sie bewirken. Keine neuen Balance-Zahlen als Konstanten in `js/game` oder `js/ai`.
   KI-Werte liegen an drei festen Orten: Armee-KI in `js/data/ai.js`, Stadt-KI (Ausbau, Markt, Überfälle, Verteidigung, Fliegerhorst) in
   `CITY.ai` (`js/data/city.js`), alles, was je Schwierigkeit verschieden ist, in `BALANCE.difficulty`.
4. Zufall in der Simulation nur über `game.rng` bzw. `makeRng(seed)` (`js/core/rng.js`), nie `Math.random()`. Gleicher Seed = gleiche Partie.
   Zufallskarten ohne Fluss müssen je Seed unverändert bleiben (gespeicherte Seeds, Tests).
5. Imports immer mit Endung (`'./zone.js'`), nie über den Ordner `frontline/` hinaus, keine CDNs oder externen Dateien.
6. Neue Datei, die der Browser lädt: in `sw.js` unter `ASSETS` eintragen. `CACHE_VERSION` in `sw.js` **nicht** von Hand erhöhen: das macht
   `npm run release` beim Zusammenführen auf `main` (Abschnitt „Zusammenarbeit“).
7. Regel- oder Feature-Änderung: die passende Themen-Datei unter `docs/prd/` anpassen (Abschnitt laut Übersicht in PRD.md) und den
   Eintrag für den Änderungsverlauf als eigene Datei nach [docs/changes/](docs/changes/README.md) legen (eine Zeile, ohne Versionsnummer);
   `docs/changelog.md` nicht direkt bearbeiten. Die Hilfe (F1) in `js/ui/helptext.js` liest die meisten Zahlen und Tasten aus den Daten
   (seit v5.63); der Rest steht von Hand dort und in `js/ui/menu.js`: mitpflegen (Suche z. B. `grep -rn "300 Plätze" js docs/prd`).
8. Neue Ideen, die Daniel nur festhalten will: PRD §13 „Geparkte Ideen“ (`docs/prd/ideen.md`), nicht bauen.
9. Startmenü-Schalter (Sendemast, Wetter, Forschung, Fluss, Stadt) sind im Menü standardmäßig an, in `new Game()` ohne Angabe aus. Tests verlassen sich darauf.
10. Texte im Spiel, Kommentare und Doku auf Deutsch, Bezeichner im Code englisch. Nach jeder Änderung in `js/data/`: `npm run docs`
    (erzeugt die Wertetabellen in `docs/prd/`) und `npm run test:quick`. Vor dem Push `npm test` (alle grün).
11. Ressourcen der Stadt (Rohstoffe, Werke, Waren, Förder- und Verarbeitungsformeln) ändern: Zellenarten stehen im Register
    `js/data/citykinds.js`, Waren im Register `js/data/goods.js` (Namen, Farben, Lager, Markt, Rollen; alle Listen in Simulation, UI und
    Darstellung leiten sich daraus ab, seit v5.59). Dazu die Kette `CITY.chain` in `js/data/city.js` (**Ressourcenanzeige**, PRD §15)
    und die Logik in `updateCity` (`js/game/city/economy.js`); bei neuen Rohstoffen bzw. Zielwerken die Wege in `js/game/transport.js`
    (`MINE_GROUP`, `GROUP_OF_KIND`). `test/flow.test.js`, `test/transport.test.js` und `test/registry.test.js` prüfen das
    (Rezepte „Neue Stadtzellenart“ und „Neue Ware“ unten).

## Starten und testen

```sh
# im Repo-Wurzelordner (games/)
python3 -m http.server 8765
# Spiel:  http://localhost:8765/frontline/          Editor: http://localhost:8765/frontline/editor.html

cd frontline
npm run test:quick                # Config-Prüfung und PRD-Tabellen, wenige Sekunden
npm run docs                      # Wertetabellen in docs/prd/ (§6, Forschung) aus js/data/ neu erzeugen
npm run test:fast                 # alle Tests ohne die langsamen „[langsam]“ (KI-gegen-KI-Läufe): zum Iterieren
npm test                          # alle Tests (node --test, Node 22), einige Minuten: vor dem Push und in der CI
node --test test/radio.test.js    # nur eine Datei
npm run smoke                     # Browser-Rundgang (Playwright): Start, 2D, Iso, Hilfe, Pause, Baumodus, Ressourcen, Ausbildung; Fotos in .smoke/
npm run release                   # Versionen vergeben (nur beim Zusammenführen auf main, siehe „Zusammenarbeit“)
```

- Tests, die länger als etwa 5 s laufen, tragen „[langsam]“ im Namen (`test:fast` lässt sie aus). Neue lange Tests ebenso markieren.
- Fehler im Browser nachstellen: `tools/smoke.mjs` exportiert `openGame({ seed, query })` → `run(fn)` wertet im Browser aus (mit `?debug=1`
  ist die Partie unter `window.__frontline.session()` erreichbar), `shot(name)` macht ein Foto. Vorlage für eigene Prüfskripte.

- URL-Parameter: `?debug=1` (kein Nebel, Taste M = +1000 Geld, bis 10× Tempo), `?seed=N`, `?speed=N`, `?river=0|1`,
  `?gl=0` (ohne WebGL-Boden), `?debug=1&fog=1`, `?debug=1&weather=winter&wx=snow`.
- Tests erzeugen ein `new Game({ seed, … })`, geben Befehle über `game.issue` und rufen `game.update(dt)` in einer Schleife.
  Sie ändern Werte direkt (z. B. `BALANCE.slotCap = 1000`) und setzen sie danach zurück, am besten mit `withValue(obj, key, wert, fn)`
  aus `test/util.js` (stellt auch bei einem Fehlschlag zurück). `test/classic.js` gibt der Hauptstadt ein endliches Lager.
- `test/golden.test.js` hält Prüfsummen je Seed (Karte, Startzustand, kurzer Lauf KI gegen KI). Reine Umbauten müssen sie
  unverändert lassen; nur bei gewollter Regeländerung neu setzen (`GOLDEN=print node --test test/golden.test.js`, Anleitung im Testkopf).
  `test/registry.test.js` prüft jede Stadtzellenart auf vollständige Einträge, `test/assets.test.js` die Liste in `sw.js`,
  `test/imports.test.js`, dass `js/` keinen Importzyklus hat (Stadt: Blattmodul `js/game/city/cells.js`, Stadt-KI in `js/ai/cityai.js`).
- `test/config.test.js` findet Tippfehler in der Config (unbekannte Einheit, doppelte Taste, Taste auf einer festen Taste, Startarmee über dem Limit, NaN,
  tote Datenschlüssel …),
  `test/doctables.test.js` meldet veraltete PRD-Tabellen, `test/docs.test.js` u. a. eine Themen-Datei ohne Eintrag in der Übersicht von
  PRD.md und einen zu großen Einstieg (über 20 000 Zeichen). Alle laufen auch in `npm test`.
- CI: `.github/workflows/test-frontline.yml` läuft bei jeder Änderung unter `frontline/`.

## Zusammenarbeit (mehrere Agenten, seit v5.81)

- **Vor jedem Paket** `git pull origin main` (bzw. auf `main` neu aufsetzen). Pakete nach **Thema** benennen (z. B. „Baugebiet“), nicht
  durchnummerieren (P1, A1 …): zwei Agenten vergeben sonst dieselben Namen.
- **Versionen und Cache** vergibt nur `npm run release` (Regel 6, 7): Jedes Paket legt seinen Eintrag als Datei nach `docs/changes/`.
  Beim Zusammenführen: `git pull origin main`, `npm run release` (trägt die Einträge mit fortlaufenden Versionen oben in
  `docs/changelog.md` ein, erhöht `CACHE_VERSION` einmal, löscht die Dateien), `npm test`, committen, nach `main` pushen.
- **Vor dem Plan messen:** Beruht ein Paket auf einer Annahme über das Spiel (wie oft etwas vorkommt, wie weit Dinge auseinander liegen,
  ob die KI etwas tut), die Annahme vorher mit einem kurzen Skript an echten Seeds prüfen (`new Game({ seed, … })`, KI gegen KI).

## Wo ändere ich was?

Alle Pfade relativ zu `frontline/`. `QUICK` und `BALANCE` = `js/data/balance.js`, `UNITS` = `js/data/units.js`, `BUILDINGS` = `js/data/buildings.js`.
**Die häufigsten Werte stehen ganz oben in `js/data/balance.js` im Block `QUICK` (Schnelleinstellungen)**; `BALANCE` liest sie von dort.
Darunter listet ein Inhaltsverzeichnis alle weiteren Abschnitte.

| Ich will … | Datei | Schlüssel |
|---|---|---|
| Einheitenlimit (Plätze je Team) | balance.js | `QUICK.unitLimit` (im Code `BALANCE.slotCap`) |
| Plätze, die eine Einheit belegt | units.js | `UNITS.<typ>.slots` (fehlt = 1) |
| Geld pro Sekunde je Einheit in der Konfliktzone | balance.js | `QUICK.moneyPerUnitZone` (im Code `BALANCE.zone.unitIncome`) |
| Geld pro Sekunde in der Hot Zone (statt, nicht zusätzlich) | balance.js | `QUICK.moneyPerUnitHot` |
| Geld pro Sekunde je eingelagerter Versorgungskiste | balance.js | `QUICK.moneyPerCrate` |
| Prämien für Abschüsse und Bauten | balance.js | `BALANCE.bounty` |
| Startgeld / Obergrenze der Kasse, die von Runde zu Runde bleibt | balance.js | `QUICK.startMoney` / `QUICK.walletMax` |
| Siegpunkte (Standard) / Takt der Punkte | balance.js | `QUICK.winPoints` / `QUICK.pointEvery` (Auswahl 25/50/100 in `js/ui/menu.js`) |
| Haltezeit des Sendemasts bis zum Sieg | balance.js | `QUICK.radioHold` |
| Startarmee | balance.js | `QUICK.startUnits` |
| Kostenloser Soldaten-Nachschub | balance.js | `QUICK.reinforceEvery`, weitere in `BALANCE.reinforce` |
| Zahl der FOBs / Bauradius, Mindestabstände | balance.js | `QUICK.maxFobs` / `BALANCE.fob` |
| Startvorrat einer neuen FOB (Anteil des Lagers) / FOB-Fahrzeug (Preis, Tempo) / Bau- und Reparaturtempo | balance.js / units.js / balance.js | `QUICK.fobStartStock` / `UNITS.fobTruck` / `BALANCE.construction` |
| Lagergröße vordere FOB / Hauptstadt, LKW-Ladung / Lade- und Nachfüllraten | balance.js | `QUICK.storeCap` / `QUICK.capitalCap`, `QUICK.truckLoad` / `BALANCE.logistics` |
| Gleichzeitige Ausbildungen / Länge der Warteschlange | balance.js | `QUICK.trainSlots` / `QUICK.queueMax` |
| Preis, Ausbildungszeit, HP, Tempo, Sicht einer Einheit | units.js | `cost`, `buildTime`, `hp`, `speed`, `sight` |
| Waffen einer Einheit (Reichweite, Kadenz, Schuss, Schaden) | units.js | `weapons[]`: `range`, `cooldown`, `rounds`, `munCost`, `damage`, `hits` |
| Kosten, Bauzeit, HP, Waffe eines Gebäudes | buildings.js | `cost`, `buildTime`, `hp`, `weapon`, `aa`, `hotkey` |
| Forschungsbaum: Stufen, Regel „3 je Stufe“, Warteschlange, Preise und Zeiten je Stufe, Forschungen je Ast und ihre Wirkung (fx je Gruppe), Gruppen der Einheiten | js/data/research.js | `RESEARCH` (`tiers`, `perTier`, `queueMax`, `money`, `time`, `lanes.<ast>.items`, `groups`) |
| Forschungstempo durch Rechenzentren | js/data/city.js | `CITY.research` |
| Schwierigkeit der KI (Denktakt, Angriffsschwelle, Einkommen, Verhalten, FOB-Grenze, Sendemast ab, Kistenholer) | balance.js | `BALANCE.difficulty.<easy\|normal\|hard>` |
| Weitere KI-Werte (Wellen, Späher, Expansion, Kisten …) | js/data/ai.js | eine Konstante je Zeile mit Kommentar; Bedeutung: PRD §10 „KI-Konstanten“ |
| Höhenvorteil, Tempo am Hang, Weitsicht von oben | balance.js | `BALANCE.height`, `BALANCE.slope`, `BALANCE.sightHeight` |
| Festung (Mauerring, Zahl der Türme, Höhenvorteil, Fallschaden) / Turm (Plätze, Dachaufbauten, Preise) | balance.js / buildings.js | `BALANCE.fortress` / `BUILDINGS.tower` |
| Stadt: Ausbildungsgebäude (`produces`, `trainSlots`), Heilen/Reparieren und Krankenhaus (`care`), Zellgröße, Gebiet, Einwohner je Einheit (`crew`), Flucht, Vorkommen, Förderung, Verarbeitung (Hütte, Stahlwerk, Kerosin-Raffinerie), Stahl je Einheit, Markt, Straßentransport (`transport`, `shop`), Trefferpunkte, Ruinen, Startlager, Erträge, Steuern, Kosten, Wachstum, KI | js/data/city.js | `CITY` |
| Ressourcenkette der Flussanzeige (welches Werk macht aus was was) | js/data/city.js | `CITY.chain` (Regel 11) |
| Straßentransport: Kapazität je Straßenzelle, Pendler, Stau-Glättung, längster Lieferweg, Anschlusslänge der KI | js/data/city.js | `CITY.transport` (`cap`, `mapCap`, `maxLanes` (Spuren mehrspuriger Straßen, seit v5.38), `commute`, `maxDist`, `smooth`, `connectMax`) |
| Werkslager: Ausgangslager je Werk, Anteil des Ausstoßes, Art der Werke, die LKW abholen (seit v5.69); KI-Pendler am Werk (seit v5.70: `WORK_SOURCE_NEAR`, `WORK_SOURCE_TRUCKS`, `WORK_SOURCE_MIN_RATE`) | js/data/city.js, js/data/ai.js | `CITY.pickup` (`cap`, `share`, `kinds`) / `WORK_SOURCE_*` |
| Gewerbe-Absatz: Steuer je Arbeiter, Baumaterial-Bedarf, Anteil ohne Versorgung, eigene Nachfrage | js/data/city.js | `CITY.taxCom`, `CITY.shop` (`need`, `base`, `per`) |
| Kerosin: Startvorrat im Stadtlager, Markt | js/data/city.js | `CITY.startKero`, `CITY.market` |
| Heliport als Landeplatz: Start- und Landezeit, Luftraumsperre mit/ohne Tower, Heimflug-Reserve (Tanken aus Kerosintank/Munitionslager wie die Jets) | js/data/city.js | `CITY.air.heli` (Lager-Raten `CITY.air.tank`, `CITY.air.depot`) |
| Preis, Baumaterial, Größe, Strom, KI-Zielwert, Name, Farbe, Symbol, Tipp, Baumenü-Gruppe einer Stadtzellenart (z. B. Hütte, Kerosin-Raffinerie) | js/data/citykinds.js | Eintrag in `CITY_KINDS` (`cost`, `bm`, `size`, `power`, `target`, …); `CITY.cost`, `CITY.costBm`, `CITY.size`, `CITY.power.use`, `CITY.ai.targetValue` werden daraus abgeleitet |
| Ertrag, Umwandlung, Marktpreise, Name, Kürzel, Farbe einer Ware (Stahl, Kerosin, Roheisen …) | js/data/goods.js | Eintrag in `GOODS` (`yield`, `convert`, `sell`, `buy`, …); `CITY.yield`, `CITY.convert`, `CITY.market.sell/buy` werden daraus abgeleitet |
| Wetter, Häuserkampf, Kisten, Kommandeur, Formationen, Fluss, Tiere, Wracks, Tarnung, Flugabwehr | balance.js | `weather`, `garrison`, `crates`, `commander`, `formation`, `river`, `animals`, `scars`, `stealth`, `airFire` |
| Kartengröße | balance.js | `BALANCE.map` (Vorsicht: ändert alle Karten und Tests) |
| Aufbau der Zufallskarte (Hügel, Seen, Fluss, Stadt, Häuser, Felder, Kisten-Abstände) | js/data/mapgen.js | `MAPGEN.<abschnitt>` (ändert alle Zufallskarten) |
| Fliegerhorst: Bahnlänge/-breite, Sperrzeit mit/ohne Tower, Umkreise, Schutz der Stellplätze, Ausbaukosten der Stellplätze (`upgrade`, seit v5.39), Kerosintank/Munitionslager | js/data/city.js | `CITY.air` |
| Bagger: Arbeitszeit je Zelle, Reichweite | balance.js | `BALANCE.excavator` (Einheit `UNITS.excavator`) |
| Kampfflugzeuge: Wendigkeit, Kreisen, Heimweg-Reserve, Tanken/Nachladen, Flughöhe | balance.js | `BALANCE.jets` (Werte der F-16: `UNITS.f16`) |
| Größe der Großbauten (Kraftwerk, Kaserne, Fabrikhalle, Universität, Fliegerhorst-Bausteine) | js/data/citykinds.js | Feld `size` (im Code `CITY.size`) |
| Bauland um die Startpunkte (keine Bäume, Felsen, Gehöfte) | js/data/mapgen.js | `MAPGEN.general.buildLand`, `MAPGEN.terrain.spawnFlat` |
| Kurznamen in der Befehlskarte | units.js, buildings.js | `short` |
| Standards im Startmenü (Schwierigkeit, Schalter) | balance.js | `BALANCE.menuDefaults` |
| Takt, Startaufstellung, Warnabstände (Basis, Engpass), Tempo leerer Fahrzeuge, Abrisserstattung, Zielsuche, Ressourcennamen | balance.js | `BALANCE.tickRate`, `startLayout`, `baseAttackWarn`, `shortageWarn`, `fuelSlowMul`, `demolishRefund`, `scanInterval`, `resNames` |
| Baugebiet der Stadt (Schalter im Startmenü, seit v5.78): Radius der FOB-Gebiete, Abstand zum Feind, Konfliktzone | js/data/city.js | `CITY.build` (`fobClaim`, `enemyR`, `noZone`); Regel in `buildWhy` (`js/game/city/cells.js`) |
| Weitere Stadt-Abschnitte (Gebiet, Einwohner, Wachstum, Vorkommen, Kosten, Nachfrage, Ruinen, Abriss, Startwerte) | js/data/city.js | `CITY.cell`, `territory`, `flee`, `happy`, `housing`, `jobs*`, `immigration`, `startPop`, `taxPop`, `growTime`, `upgradeTime`, `ruinTime`, `maxLevel`, `demand`, `deposits`, `extract`, `metalCost`, `bountyBm`, `startMetal`, `startStock`, `fobMargin`, `clearable`, `retired` |
| Teamnamen und -farben | balance.js | `BALANCE.teamNames`, `BALANCE.teamColors` |

Danach: PRD-Text und Hilfetexte in `js/ui/menu.js` auf die alte Zahl durchsuchen und anpassen (Regel 7).

## Feature-Landkarte

Wo jedes Feature liegt (PRD-Abschnitt, Werte, Logik, KI, Darstellung, Test): Tabelle in [ARCHITEKTUR.md §9](ARCHITEKTUR.md).
Bei einem neuen Feature dort eine Zeile ergänzen.

## Rezepte

### Einen Wert ändern
1. Schlüssel in „Wo ändere ich was?“ suchen, Wert in `js/data/` ändern.
2. `npm run docs` (Tabellen in PRD §6), dann PRD-Text und Hilfetexte (`js/ui/menu.js`) auf die alte Zahl durchsuchen und anpassen; Eintrag in docs/changelog.md.
3. `CACHE_VERSION` in `sw.js` erhöhen, `npm run test:quick`, dann `npm test`. Schlägt ein Test fehl, der genau diesen Wert prüft: Test an die neue Regel anpassen, nicht umgekehrt.

### Neue Einheit
1. `js/data/units.js`: ähnliche Einheit kopieren, neuen Schlüssel vergeben; `name`, `short`, Werte, `weapons`, `cost`, `buildTime`, `slots`, `hotkey` anpassen (Taste darf in der Hauptstadt noch nicht belegt sein).
2. `js/data/buildings.js`: Schlüssel in `fob.produces` eintragen, für Partien mit Stadt auch in `CITY.produces` (`js/data/city.js`: Kaserne, Fabrikhalle oder Heliport).
3. `js/data/research.js`: Gruppe in `RESEARCH.groups` eintragen (fehlt sie, wirken nur `all`, `veh` und `air`; Einheiten sind ohne Forschung frei). Mit Stadt: `CITY.crew` (Einwohner) und `CITY.metalCost` (Metall aus dem Stadtlager, fehlt = 0) in `js/data/city.js`.
4. Aussehen: Modell in `js/render/unitpaint.js` (Funktion in `MODELS` bzw. `INFANTRY`, gilt für 2D und Iso; `test/unitpaint.test.js` prüft, dass jede Einheit eines hat). Ohne Modell zeichnen `js/render/sprites.js` (`drawUnit`) und der Renderer eine einfache Form.
5. KI: Soll sie die Einheit bauen? Dann `MIX` in `js/data/ai.js` und die Ausbildung in `js/ai/army/produce.js` (`produce`, `counterMix`) ergänzen, sonst im PRD §10 vermerken, dass sie es nicht tut.
6. Test in `test/` (Ausbildung über `game.issue(team, { type: 'train', … })`), Hilfe in `js/ui/menu.js`, `npm run docs` (Tabellen), PRD §6 (Rolle) und docs/changelog.md, `CACHE_VERSION`.

### Neues Gebäude
1. `js/data/buildings.js`: Eintrag mit `name`, `short` (Kurzname in der Befehlskarte), `w`, `h` (Zellen), `hp`, `sight`, `cost`, `buildTime`,
   `hotkey`; optional `weapon`, `aa`, `produces` (ausbildbare Einheiten, fehlt = keine). Mit `hotkey` erscheint es automatisch im Baumenü
   des Baufahrzeugs; die Taste darf keine feste Taste sein (J, H, V, Y, P, M; `test/config.test.js` prüft das).
2. Sonderregeln beim Setzen in `game.js` (`canPlace`), Wirkung im passenden Modul oder in einem neuen Modul (Rezept „Neues Spielsystem“).
3. Aussehen: Maler in `js/render/milbuild.js` (Typ in `MIL_TYPES` eintragen), Höhe in `js/render/iso.js` (`BUILD_H`), Kürzel in
   `js/render/sprites.js` (`BUILD_ABBR`, 2D-Ansicht).
4. KI optional in `js/ai/army/build.js` (`buildDefense`, `findSite`); Test, Baumenü-Zeile der Hilfe (`js/ui/menu.js`, Taste B), PRD §5 und docs/changelog.md, `CACHE_VERSION`.

### Neue Stadtzellenart
1. `js/data/citykinds.js`: Eintrag in `CITY_KINDS` an der Stelle seiner Baumenü-Gruppe (`group`), mit der **nächsten freien `id`**
   (höchste + 1; IDs stehen in Spielständen, nie umnummerieren) und `name`, `short`, `icon`, `color`, `tip`, `cost`, `power`, `target`,
   optional `bm`, `size` (Großbau), `jobs` (Arbeitsplätze, Pendler), `works` (Werk), `supply` (liefert über die Straße), `flat`.
   Damit stehen Werkzeug, Preis, Größe, Strom, Name, Schild, Tipp, KI-Zielwert und alle Rollenlisten (Straßentransport, Infofeld,
   Warnschilder) fest. In `test/registry.test.js` die Art hinten an die feste `KINDS`-Liste hängen.
2. Bild: Maler in `js/render/townhouses.js` (1 × 1, `TALL` und Maler), `js/render/works.js` (Werk 2 × 2, `WORKS_KINDS`) oder
   `js/render/bigbuild.js` (Großbau, `BIG_KINDS` und Teile).
3. Logik in `js/game/city/`, wenn die Art mehr tut als Arbeitsplätze und Strom: z. B. `totals` in `state.js` (Wohnen, Strom, Forschung), Werk:
   Kette `CITY.chain` (`js/data/city.js`) und `WORK_ORDER` in `economy.js`, bei neuem Zielwerk `GROUP_OF_KIND` in `js/game/transport.js`;
   Ausbildung `CITY.produces`, Pflege `CITY.care.by`; Infozeilen in `js/ui/hud.js` (`cityInfo`); KI optional (`CITY.ai.mix`, `aiNeed` in `js/ai/cityai.js`).
4. Test, PRD §15 und docs/changelog.md, `CACHE_VERSION`.

### Neue Ware
Für Waren, die ein Werk der Stadt erzeugt und die im Lager der Hauptstadt, im Stadtlager oder als Zwischenprodukt (ohne Lager) laufen.
Neue Sorten der FOB-Lager und LKW (wie Baumaterial, Munition, Treibstoff) brauchen mehr (Lager, LKW, HUD) und sind nicht Teil dieses Rezepts.
1. `js/data/goods.js`: Eintrag in `GOODS` mit `name`, `short`, `color`, `store` (`'main'`, `'city'` oder `null`), `yield`, `convert`,
   für den Markt `sell` und `buy`, bei `store: 'city'` den Hinweis `full`. Markt, Marktmenü, Ressourcenanzeige (Knoten, Farbe,
   Lager), Infofeld des Werks, Stadtzahlen (`cap`/`inp`/`gross`) und Straßentransport ins Lager folgen daraus.
2. Werk: Zeile in `CITY.chain` (`js/data/city.js`), meist mit neuer Zellenart (Rezept oben).
3. Logik in `updateCity` (`js/game/city/economy.js`): Gutschrift ins Lager (`main.store` bzw. Feld `c.<Ware>` mit Startwert in `createCity`)
   und Verbrauch; KI-Regeln (`aiNeed`, Markt) optional.
4. `test/registry.test.js` und `test/flow.test.js` laufen lassen (sie prüfen Register, Kette und Stadtzahlen), PRD §15 und docs/changelog.md, `CACHE_VERSION`.

### Neuer Befehl
1. Handler im zuständigen Modul: `export function cmdX(game, team, cmd)` → `{ ok: true }` oder `{ ok: false, reason: 'deutscher Text' }`. Nur eigene, lebende Einheiten akzeptieren.
2. Eintrag im Befehlsregister `js/game/commands.js`: `x: { run: cmdX, drives: true, sound: true }` (`drives`: setzt einen Auftrag `x`, den das
   Modul selbst fährt, z. B. in seinem `update…`; `sound`: Befehlston). `game.issue` braucht nichts weiter. Den Befehl in
   [ARCHITEKTUR.md](ARCHITEKTUR.md) §6 beschreiben (`test/docs.test.js` prüft das).
3. UI: Eintrag in der Befehlskarte (`js/ui/controller/cards.js`, `entry(label, hotkey, { action })`) und/oder Rechtsklick. Braucht er ein Ziel auf
   der Karte: Zeile in der Modustabelle `MODES` (`js/ui/controller/modes.js`: `hint`, `click`) plus `confirmX`-Methode (`js/ui/controller/targets.js`). Taste in der Hilfe (`js/ui/helptext.js`).
4. Test über `game.issue` (`test/commands.test.js` prüft Register und Modi allgemein), PRD §8 (Steuerung) und docs/changelog.md.

### Neue Option im Startmenü
1. Standard in `BALANCE.menuDefaults`; `js/ui/menu.js` → `showStartMenu`: Zustand, Schalter im HTML, Speicherung (`readFlag`/`writeFlag` mit eigenem Schlüssel `frontline-…`), Wert in `onStart({ … })`.
2. `js/main.js` → `startGame`: Wert an `new Game({ … })` weitergeben.
3. `js/game/game.js` → Konstruktor-Option mit Standard **aus**, an das Feature-Modul weitergeben (Regel 9).

### Neues Spielsystem (eigenes Modul)
1. `js/game/<name>.js` mit Kopfkommentar (Zweck, „Kein DOM“), `create<Name>(game)` für den Startzustand und `update<Name>(game, dt)` für einen Schritt.
2. In `js/game/game.js` importieren, `create…` im Konstruktor aufrufen und `update…` in `update()` an der passenden Stelle der Reihenfolge einfügen (siehe ARCHITEKTUR.md).
3. Werte als eigener Abschnitt in `js/data/balance.js`, Datei in `sw.js` → `ASSETS`, Test `test/<name>.test.js`, Zeile in der Feature-Landkarte (ARCHITEKTUR.md §9).

### KI-Verhalten anpassen
1. Schwellen und Takte zuerst über `BALANCE.difficulty` oder `js/data/ai.js` ändern.
2. Neues Verhalten als Methode in einem der Module unter `js/ai/army/` (Bau, Ausbildung, Logistik, Kampf; seit v5.81 per Mixin an die
   Klasse `AI` in `js/ai/ai.js` gehängt), aufgerufen aus `think()` (Denkschritt); die KI ändert das Spiel nur über `game.issue`.
3. `test/ai.test.js` (KI gegen KI über feste Seeds) laufen lassen; PRD §10 und die Tabelle „KI-Konstanten“ aktualisieren.
