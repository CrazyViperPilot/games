# Frontline – Einstieg für Erweiterungen

Echtzeit-Strategie im Browser (Blau = Spieler gegen Rot = KI). Vanilla JS mit ES-Modulen, Canvas 2D und WebGL-Boden,
kein Build-Schritt, offline als PWA. Diese Datei ist der Einstieg für Menschen und Modelle: erst sie lesen, dann gezielt
die genannten Dateien.

- **Regeln des Spiels:** [PRD.md](PRD.md) (was gilt, in Worten, mit Änderungsverlauf)
- **Aufbau des Codes:** [ARCHITEKTUR.md](ARCHITEKTUR.md) (Schichten, Simulationsschritt, Datenmodelle, Befehle)
- **Entstehung:** [docs/verlauf.md](docs/verlauf.md) (alter Umsetzungsplan v1 bis v4.23, nur zum Nachlesen; Code-Kommentare verweisen auf seine Abschnitte)

## Regeln

1. Die Simulation (`js/data`, `js/core/rng.js`, `js/game`, `js/ai`) kennt kein DOM und kein `window`. Sie läuft in Node-Tests.
2. Spieler und KI ändern das Spiel **nur** über `game.issue(team, cmd)`. Renderer, HUD und Minimap lesen nur.
3. Spielwerte gehören nach `js/data/` (`balance.js` mit den Schnelleinstellungen `QUICK` ganz oben, `units.js`, `buildings.js`, `ai.js`, `mapgen.js`),
   mit deutschem Kommentar, was sie bewirken. Keine neuen Balance-Zahlen als Konstanten in `js/game` oder `js/ai`.
4. Zufall in der Simulation nur über `game.rng` bzw. `makeRng(seed)` (`js/core/rng.js`), nie `Math.random()`. Gleicher Seed = gleiche Partie.
   Zufallskarten ohne Fluss müssen je Seed unverändert bleiben (gespeicherte Seeds, Tests).
5. Imports immer mit Endung (`'./zone.js'`), nie über den Ordner `frontline/` hinaus, keine CDNs oder externen Dateien.
6. Neue Datei, die der Browser lädt: in `sw.js` unter `ASSETS` eintragen. Jede Änderung an ausgelieferten Dateien: `CACHE_VERSION` in `sw.js` um 1 erhöhen.
7. Regel- oder Feature-Änderung: [PRD.md](PRD.md) im passenden Abschnitt anpassen und oben im **Änderungsverlauf** eintragen
   (neue Version `v4.xx`, Cache-Version). Die Hilfe (F1) und die Spielanleitung in `js/ui/menu.js` nennen Zahlen und Tasten
   von Hand: mitpflegen (Suche z. B. `grep -rn "300 Plätze" js PRD.md`).
8. Neue Ideen, die Daniel nur festhalten will: PRD §13 „Geparkte Ideen“, nicht bauen.
9. Startmenü-Schalter (Sendemast, Wetter, Forschung, Fluss, Stadt) sind im Menü standardmäßig an, in `new Game()` ohne Angabe aus. Tests verlassen sich darauf.
10. Texte im Spiel, Kommentare und Doku auf Deutsch, Bezeichner im Code englisch. Nach jeder Änderung in `js/data/`: `npm run docs`
    (erzeugt die Wertetabellen in PRD §6) und `npm run test:quick`. Vor dem Push `npm test` (alle grün).
11. Ressourcen der Stadt (Rohstoffe, Werke, Waren, Förder- und Verarbeitungsformeln) ändern: die **Ressourcenanzeige** mitpflegen
    (PRD §15 „Ressourcenanzeige“): Kette `CITY.chain` in `js/data/city.js`, Felder `cap`/`inp`/`gross`/`n` in `updateCity`
    (`js/game/city.js`), neue Sorten mit Namen und Farbe in `js/game/flow.js` und `js/ui/flowpanel.js`. `test/flow.test.js` prüft das. Seit v5.20 fahren die Waren über Straßen: neue Werke oder Waren auch in `js/game/transport.js` eintragen (`MINE_GROUP`, `GROUP_OF_KIND`, `PRODUCT_KINDS`, `WORKPLACE_KINDS`) und die Anzeige (`citylayer.js`, `hud.js`, `citypanel.js`) mitpflegen; `test/transport.test.js` prüft die Wege.

## Starten und testen

```sh
# im Repo-Wurzelordner (games/)
python3 -m http.server 8765
# Spiel:  http://localhost:8765/frontline/          Editor: http://localhost:8765/frontline/editor.html

cd frontline
npm run test:quick                # Config-Prüfung und PRD-Tabellen, wenige Sekunden
npm run docs                      # Wertetabellen in PRD.md §6 aus js/data/ neu erzeugen
npm test                          # alle Tests (node --test, Node 22), dauert einige Minuten
node --test test/radio.test.js    # nur eine Datei
```

- URL-Parameter: `?debug=1` (kein Nebel, Taste M = +1000 Ressourcen, bis 10× Tempo), `?seed=N`, `?speed=N`, `?river=0|1`,
  `?gl=0` (ohne WebGL-Boden), `?debug=1&fog=1`, `?debug=1&weather=winter&wx=snow`.
- Tests erzeugen ein `new Game({ seed, … })`, geben Befehle über `game.issue` und rufen `game.update(dt)` in einer Schleife.
  Sie ändern Werte direkt (z. B. `BALANCE.slotCap = 1000`) und setzen sie danach zurück. `test/classic.js` gibt der Hauptstadt ein endliches Lager.
- `test/config.test.js` findet Tippfehler in der Config (unbekannte Einheit, doppelte Taste, Startarmee über dem Limit, NaN …),
  `test/doctables.test.js` meldet veraltete PRD-Tabellen. Beide laufen auch in `npm test`.
- CI: `.github/workflows/test-frontline.yml` läuft bei jeder Änderung unter `frontline/`.

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
| Gewerbe-Absatz: Steuer je Arbeiter, Baumaterial-Bedarf, Anteil ohne Versorgung, eigene Nachfrage | js/data/city.js | `CITY.taxCom`, `CITY.shop` (`need`, `base`, `per`) |
| Kerosin: Startvorrat im Stadtlager, Markt | js/data/city.js | `CITY.startKero`, `CITY.market` |
| Heliport als Landeplatz: Start- und Landezeit, Luftraumsperre mit/ohne Tower, Heimflug-Reserve (Tanken aus Kerosintank/Munitionslager wie die Jets) | js/data/city.js | `CITY.air.heli` (Lager-Raten `CITY.air.tank`, `CITY.air.depot`) |
| Hütte und Kerosin-Raffinerie: Größe, Preis, Strom, Ausbeute, Umwandlung | js/data/city.js | `CITY.size`, `CITY.cost`, `CITY.power.use`, `CITY.yield`, `CITY.convert` |
| Wetter, Häuserkampf, Kisten, Kommandeur, Formationen, Fluss, Tiere, Wracks, Tarnung, Flugabwehr | balance.js | `weather`, `garrison`, `crates`, `commander`, `formation`, `river`, `animals`, `scars`, `stealth`, `airFire` |
| Kartengröße | balance.js | `BALANCE.map` (Vorsicht: ändert alle Karten und Tests) |
| Aufbau der Zufallskarte (Hügel, Seen, Fluss, Stadt, Häuser, Felder, Kisten-Abstände) | js/data/mapgen.js | `MAPGEN.<abschnitt>` (ändert alle Zufallskarten) |
| Fliegerhorst: Bahnlänge/-breite, Sperrzeit mit/ohne Tower, Umkreise, Schutz der Stellplätze, Ausbaukosten der Stellplätze (`upgrade`, seit v5.39), Kerosintank/Munitionslager | js/data/city.js | `CITY.air` |
| Bagger: Arbeitszeit je Zelle, Reichweite | balance.js | `BALANCE.excavator` (Einheit `UNITS.excavator`) |
| Kampfflugzeuge: Wendigkeit, Kreisen, Heimweg-Reserve, Tanken/Nachladen, Flughöhe | balance.js | `BALANCE.jets` (Werte der F-16: `UNITS.f16`) |
| Größe der Großbauten (Kraftwerk, Kaserne, Fabrikhalle, Universität, Fliegerhorst-Bausteine) | js/data/city.js | `CITY.size` |
| Bauland um die Startpunkte (keine Bäume, Felsen, Gehöfte) | js/data/mapgen.js | `MAPGEN.general.buildLand`, `MAPGEN.terrain.spawnFlat` |
| Kurznamen in der Befehlskarte | units.js, buildings.js | `short` |
| Standards im Startmenü (Schwierigkeit, Schalter) | balance.js | `BALANCE.menuDefaults` |
| Teamnamen und -farben | balance.js | `BALANCE.teamNames`, `BALANCE.teamColors` |

Danach: PRD-Text und Hilfetexte in `js/ui/menu.js` auf die alte Zahl durchsuchen und anpassen (Regel 7).

## Feature-Landkarte

Wo jedes Feature liegt. „KI“ = Konstanten-Präfix in `js/data/ai.js`, Logik in `js/ai/ai.js`, Darstellung unter `js/render/`, UI unter `js/ui/`, Tests unter `test/`.

| Feature | PRD | Werte | Logik (`js/game/`) | KI | Darstellung / UI | Test |
|---|---|---|---|---|---|---|
| Spielzustand, Befehle, Platzierung, Sieg | §2, §4 | `fob`, `winPoints` | `game.js` | – | – | `game.test.js` |
| Ausbildung, Einheitenlimit, Nachschub, Einkommen | §2, §3, §5 | `slotCap`, `trainSlots`, `reinforce`, `startRes` | `economy.js`, `game.js` (`cmdTrain`) | `MIX`, `COUNTER_*` | `controller.js`, `hud.js` | `economy.test.js` |
| Konfliktzone, Punkte, Zonengeld | §7 | `zone`, `pointInterval` | `zone.js` | `WAVE_*`, `THREAT_*` | `renderer.js`, `hud.js` | `economy.test.js`, `game.test.js` |
| Hot Zone und Bohrer | §7 „Hot Zone“, „Bohrer“ | `hot`, `BUILDINGS.drill` | `hotzone.js` | – | `renderer.js`, `hud.js` | `game.test.js` |
| Lager, LKW, Nachfüllen, Transport, Einsteigen | §3 | `logistics` | `logistics.js` | `SUPPLY_*`, `SURPLUS_MIN`, `ROUTE_HOLD` | `renderer.js`, `controller.js` | `logistics.test.js` |
| Bauen, Reparieren, neue FOBs (FOB-Fahrzeug, Aufbauen) | §4, §5 | `construction`, `fob`, `UNITS.fobTruck` | `construction.js`, `game.js` (`canPlace`, `cmdBuild`, `cmdDeploy`) | `difficulty.fobCap`, `FOBV_*`, `DEPLOY_REACH`, `RELAY_STEP`, `FLANK_R`, `WALL_*` (`expand`, `driveFobTruck`) | `controller.js` (Baumenü), `sprites.js`, `isobuild.js`, Hauptstadt als Rathaus `cityhall.js` | `game.test.js` |
| Bewegung, Wegsuche, Raster | – | `slope.pathCost`, `leash` | `movement.js`, `pathfinding.js`, `grid.js` | – | – | `path.test.js` |
| Formationen | §8 | `formation` | `formation.js` | Keil bei Angriffswellen | `controller.js` (Taste F) | `formation.test.js` |
| Kampf, Waffen, Schaden, Treffer | §6 „Waffen“, „Treffer“ | `UNITS.*.weapons`, `BUILDINGS.*.weapon`, `height` | `combat.js`, `entities.js` | `FALLBACK_*`, `RAID_*` | `fx.js` (Effekte, seit v5.34) | `hits.test.js`, `game.test.js`, `fx.test.js` |
| Flugabwehr (Flak, SAM, Flugabwehrstellung, Phalanx) | §5, §6 | `airFire`, `UNITS.flak`, `UNITS.sam`, `BUILDINGS.aa`, `BUILDINGS.phalanx` (`moneyPerShot`) | `combat.js` | baut Flak/SAM noch nicht | `unitpaint.js` (Flak, SAM), `milbuild.js` (Flugabwehr, Phalanx) | `airdefense.test.js` |
| Flakpanzer Gepard, Panzerhaubitze (Artillerie: Granaten mit Streuung, Mindestreichweite, Feuer auf Punkt) | §6 | `UNITS.gepard`, `UNITS.pzh` (`indirect`, `shell`, `spread`, `shellSpeed`), Forschungsast `art` | `combat.js` (`fireUnitShell`, `unitFireAtGround`), `game.js` (`cmdMortarTarget`) | `GEPARD_*`, `AIR_MEMORY`, `ART_*` (`counterMix`, `artillery`) | `unitpaint.js`, `renderer.js` (`drawMortarRange`), `controller.js` | `artillery.test.js`, `aiart.test.js` |
| Scharfschütze, Tarnung | §6 | `stealth`, `UNITS.sniper` | `game.js` (`sees`), `combat.js` | baut ihn nicht | – | `sniper.test.js` |
| Nebel und Sicht | §7, §9 | `fogInterval`, `sightHeight` | `fog.js` | – | `renderer.js` (`fogData`, `updateFogLayer`), `ground.js` (`FS_FOG`, Wolken und Ränder seit v5.49), `minimap.js` | `terrain.test.js`, `fogpaint.test.js` |
| Gelände: Höhe, Hänge, Seen | §7 „Gelände“ | `height`, `slope`, `sightHeight` | `relief.js`, `landscape.js` | – | `ground.js` (WebGL), `reliefimg.js` | `relief.test.js`, `terrain.test.js` |
| Fluss, Brücken, Furten | §7 „Fluss“ | `river` | `river.js`, `landscape.js` | `BRIDGE_*` | `bridge.js` | `river.test.js` |
| Häuserkampf | §7 „Häuserkampf“ | `garrison` | `garrison.js` | `GARRISON_*` | `renderer.js` (Schild `drawGarrison`, Sichtregel `fortShown`), `stronghold.js` (Fahne und Ausbauten am Haus, seit v5.48), `status.js` | `garrison.test.js`, `stronghold.test.js` |
| Festung: Gefechtsturm, Dachaufbau, Ausbau-Befehl | §5a | `fortress`, `BUILDINGS.tower` (`cap`, `reach`, `roofs`) | `tower.js` (Besatzung über `garrison.js`) | `FORT_*`, `difficulty.<stufe>.fort` | `controller.js` (Karte von FOB und Turm), `hud.js`, `sprites.js` (Besatzung), `milbuild.js` (Bild mit Dachaufbau, seit v5.21) | `tower.test.js`, `fortress-ai.test.js` |
| Versorgungskisten | §7 „Versorgungskisten“ | `crates` | `crates.js` | `CRATE_*`, `difficulty.cratePickers` | `props.js` (gemalt seit v5.43: `drawCrateIso`, `drawCrateTop`), Ersatz und Editor `sprites.js` (`drawCrate`), `minimap.js` | `crates.test.js`, `props.test.js` |
| Kommandeur | §6 | `commander`, `UNITS.commander` | `commander.js` | `CMD_*` | `sprites.js` (`drawStar`), `renderer.js` | `commander.test.js` |
| Sendemast | §7 „Sendemast“ | `radio`, `BUILDINGS.radio` | `radio.js` | `RADIO_*`, `difficulty.radioFrom` | `milbuild.js` (Bild, seit v5.21), `hud.js` | `radio.test.js` |
| Wetter und Jahreszeiten | §7 „Wetter“ | `weather` | `weather.js` | `WX_*` | `weatherfx.js`, `season.js` | `weather.test.js`, `weatherfx.test.js` |
| Forschungsbaum (10 Stufen, 8 Äste, Warteschlange; Wirkung über `modOf`/`teamMod`, Fähigkeiten über `hasUnlock`) | §7 „Forschung“ | `RESEARCH` (js/data/research.js), `CITY.research` | `research.js`, `abilities.js` (Nebel, Minen, Selbstheilung) | `UPGRADES`, `UPGRADE_RESERVE` | `researchpanel.js` (Baum wie Civilization, Knopf „Forschung“ in `hud.js`), `controller.js` | `research.test.js` |
| Zufallskarte, Stadt, Gehöfte, Felder | §7, §9a | `map`, `zone.r`, `MAPGEN` | `map.js`, `landscape.js` | – | `terrain.js`, `ways.js` (Feldwege, Gleise, seit v5.31), `maptown.js` (Gebäude, Parks, Wachturm), `props.js` (Autos, Parkbänke, seit v5.43; Ballen seit v5.44), `fields.js` (Äcker und Weiden scharf, seit v5.44), `iso.js`, `isobuild.js` | `map.test.js`, `fields.test.js`, `props.test.js`, `fieldpaint.test.js` |
| Stadt (Gebiet, Zonen, Einwohner auch als Truppen, Flucht, Werke füllen Lager der Hauptstadt, Ausbildung in Kaserne/Fabrikhalle/Heliport, Heilen/Reparieren und Krankenhaus) | §15 | `CITY` (`care`) | `city.js` (`cityTrainers`, `trainerKind`, `updateCare`/`careOf`, Ausbildung selbst in `economy.js`, `updateCity` (Strom, Zufriedenheit, Ketten und Pendler über Straßenwege, Gewerbe-Absatz; Wege und Stau in `transport.js`), `cityLevel`, `powerRatio`, `updateClaim`, `freePop`, `cityNoise`, `genDeposits`, `payMetal`, Befehle `city` und `trade`, Ziel-Entities `syncEntity`/`forEnemyCity`, Großbauten `CITY.size` mit `part`/`anchorOf`/`fitBig`, alte Stände `migrateCity`); Ausbildung prüft in `game.js` (`cmdTrain`), Zielsuche und Splash in `combat.js` | `aiCity`, `aiRaid` in `city.js`, aufgerufen von `ai.js` | `js/ui/citypanel.js` (Baumodus, Taste Y; Rechteck über `input.js`; Marktmenü `MarketPanel`), `hud.js` (Knopf, Geldanzeige öffnet den Markt, Info `cityInfo`), `controller.js` (Stadtgebäude wählen `pickCity`, Aktionen `cityCard`), `js/render/citylayer.js` (Karte, Gebiet, Schilder `drawCityBadges`), `isobuild.js` (`drawMilitaryTown`), `university.js` (Universität 3 × 3, ein Bild für alle Drehungen), `works.js` (Werke 2 × 2 seit v5.08 und Kraftwerk, je Art und Stufe ein gemaltes Bild seit v5.18; Hütte und Kerosin-Raffinerie seit v5.20), `townhouses.js` (alle 1 × 1-Gebäude je Art und Stufe, 2D und Iso, seit v5.17), `citysite.js` (Baustellen in fünf Bauabschnitten und Ruinen als Schutt, seit v5.45) mit `spritecache.js` (gemalte Bilder je Maßstab zwischengespeichert) und `isokit.js` (gemeinsame Bauteile für gemalte Gebäude, seit v5.18), `minimap.js` | `city.test.js`, `citysite.test.js` |
| Stadtstraßen der Karte (Zonenstraßen, Brückenfahrbahnen; für beide Teams) | §7, §15 | `MAPGEN.town.block` | `roads.js` (`game.roads`, in der Stadt `c.mapRoads`, `roadAt`) | – | `citylayer.js` (`roadView`; Asphalt- und Plattenmuster aus `ways.js`), `bridge.js` (Fahrbahn) | `city.test.js` |
| Großbauten mit gerader Kante (Kraftwerk 2 × 2, Kaserne 4 × 4, Fabrikhalle 5 × 5, Flughafen 10 × 10) | §15 | `CITY.size` | `city.js` (`bigSpan`, `bigCenter`, `bigCells`, `fitBig`, Startviertel `startQuarter`) | `aiNeed` in `city.js` | `bigbuild.js` (Kaserne, Fabrikhalle, Flughafen: Boden, 2D, Iso je Körper; Ausstellungsstücke `show` mit `SHOWROOM`-Lackierung aus `unitpaint.js`, seit v5.40), Flughafen seit v5.22 gemalt in `airport.js`, Kraftwerk seit v5.18 in `works.js`, `citylayer.js` | `city.test.js` |
| Fliegerhorst und F-16 (seit v5.35: Bahn, Rollfeld (v5.37), Stellplatz, Tower, Kerosintank, Munitionslager; Rollen, Startlauf, Landung, Tanken, Befehl `land`) | §6, §15 | `CITY.air`, `BALANCE.jets`, `UNITS.f16` | `aircraft.js` (`runwaysOf`, `bestStrip`, `standRoute`, `updateAircraft`, `cmdLand`, `parkNew`, `trainCheck`, `parkedArmor`), Füllen der Lager `updateCity`/`transport.js` (`tr.depot`), Ausbau der Stellplätze `cmdCityUpgrade` in `city.js` (seit v5.39), Ausbildung `economy.js` | `aiAirport` in `city.js`, `jets()` in `ai.js`, `CITY.ai.airportFrom`/`jets` | `sprites.js` (`drawJet`), `airbase.js` (seit v5.42 gemalt: Stellplatz mit Überdachung und Shelter, Tower, Kerosintank, Munitionslager; Teile über `bigbuild.js`), `citylayer.js` (`drawAirfield`, Dächer über den Jets `drawCityRoofs`), `controller.js` (Staffel), `hud.js` | `airbase.test.js`, `airbasepaint.test.js` |
| Heliport als Landeplatz (seit v5.51: ein Hubschrauber je Heliport, Start und Landung senkrecht, Tanken aus Kerosintank/Munitionslager, Luftraumsperre mit Tower, Heimflug) | §15 | `CITY.air.heli` | `helipad.js` (`updateHelis`, `cmdHeliLand`, `landHeliNew`, `heliTrainCheck`, `padBusy`), Ausbildung `economy.js`, `land` in `game.js` | `pickProducer` in `ai.js`, `CITY.ai.producers.heliport` | `iso.js` (`flying`, `unitLift`), `controller.js` (Landen L, Hubschrauber W), `hud.js` | `helipad.test.js` |
| Bagger (Befehl `dig`: Zonenstraßen, Bäume, Häuser, eigene Gebäude räumen) | §6 | `UNITS.excavator`, `BALANCE.excavator` | `excavator.js` (`cmdDig`, `updateDig`), `movement.js` (`onRoad`, `roads.dug`) | – | `unitpaint.js` (`excavator`), `controller.js` (Baggern G) | `airbase.test.js` |
| Ressourcenanzeige (Fluss Förderung → Werke → Lager, Verbrauch, Engpässe) | §15 „Ressourcenanzeige“ | `CITY.chain` | `flow.js` (`resourceFlow`, `flowLayout`, `FlowMeter`, `teamStock`), Zahlen aus `updateCity` in `city.js` (`c.stats.cap/inp/gross/n`, `c.made`, `c.traded`) | – | `js/ui/flowpanel.js` (Fenster, Knopf „Ressourcen“ in `hud.js`, `main.js` `toggleFlow`) | `flow.test.js` |
| Straßentransport (Wege über Straßen zum nächsten Werk bzw. Lager, Kapazität und Stau, Pendler, Gewerbe-Absatz, Kerosin für F-16 und Hubschrauber) | §15 „Straßentransport“ | `CITY.transport`, `CITY.shop`, `CITY.care.refuel` | `transport.js` (`transportOf`, `nearestField`, `pathFrom`, `pathEff`, `addLoad`, `mainAccess`, `transportInfo`), Spuren `laneGrid` in `roads.js` (seit v5.38), Last und Stau in `updateCity` (`city.js`), `connectRoad` und `accessCells` in `city.js` | `connectRoad` in `city.js` (`aiCity`, `aiNeed`) | `js/render/citylayer.js` (`drawLoads`, mehrspurige Straßen `laneMarks`, rotes Warnzeichen am Schild), `hud.js` (Info `cityInfo`: „Liefert an“, Pendler), `citypanel.js` (Leiste: Stau, ohne Weg), `flow.js` (Hinweise) | `transport.test.js`, `lanes.test.js`, `shop.test.js`, `cityprod.test.js` (KI-Städte erzeugen Stahl und Munition) |
| Wracks und Krater (nur Optik) | §9 | `scars` | `scars.js` | – | `fx.js` (`drawCrater`, `drawWreckRubble`, Ersatz `drawWreck`; Rauch, Feuer, Nebelwand, Minen), `unitpaint.js` (`drawWreckTop`, `drawWreckIso`), `isobuild.js` (`drawRubble`) | `scars.test.js`, `fx.test.js` |
| Tiere (nur Optik) | §9 | `animals` | `animals.js` | – | `nature.js` (gemalte 3D-Modelle seit v5.28), Ersatz `sprites.js` (`drawAnimal*`) | `animals.test.js`, `nature.test.js` |
| Natur: Bäume, Büsche, Felsen, Waldboden, Bodenbild der Vorkommen (nur Optik) | §7 „Natur“ | – | `map.js` (Lage), `renderer.js` (`buildDeco`: Waldbäume, Unterholz, Büsche, Geröll) | – | `nature.js`, `terrain.js` (`forestFloor`), `citylayer.js` (`drawDeposits`) | `nature.test.js` |
| KI allgemein | §10 | `difficulty` | – | `js/ai/ai.js` | – | `ai.test.js` |
| Karteneditor, gespeicherte Karten | §9a | – | `mapdata.js` | – | `js/editor/editor.js`, `editor.html`, `css/editor.css` | `mapdata.test.js` |
| Steuerung, Befehlskarte, HUD, Menüs, Hilfe | §8, §9 | – | – | – | `controller.js`, `input.js`, `hud.js`, `menu.js`, `status.js` | – |
| Anzeigen auf der Karte (Auswahlring, Hover, Auswahlrahmen; nur Bild) | §9 „Aussehen der Anzeigen auf der Karte“ | – | – | – | `marks.js` (gemalt seit v5.50, Bilder über `spritecache.js`), aufgerufen aus `renderer.js` (`drawSelectRing`, `drawDragBox`) | `marks.test.js` |
| Kamera, Iso-Ansicht, Minimap | §9 | – | – | – | `camera.js`, `iso.js`, `renderer.js`, `minimap.js` | – |
| Ton (Waffen, Einschläge, Wetter, Meldungen; synthetisiert, Schalter) | §14 | – | – (liest `game.effects`, Hinweis `snd` aus `addEffect`) | – | `js/audio/sound.js`, `main.js`, `hud.js` (Knopf), `menu.js` | `sound.test.js` |
| Offline, Installation | §11 | – | – | – | `sw.js`, `manifest.json`, `icons/` | – |

## Rezepte

### Einen Wert ändern
1. Schlüssel in „Wo ändere ich was?“ suchen, Wert in `js/data/` ändern.
2. `npm run docs` (Tabellen in PRD §6), dann PRD-Text und Hilfetexte (`js/ui/menu.js`) auf die alte Zahl durchsuchen und anpassen; Eintrag im PRD-Änderungsverlauf.
3. `CACHE_VERSION` in `sw.js` erhöhen, `npm run test:quick`, dann `npm test`. Schlägt ein Test fehl, der genau diesen Wert prüft: Test an die neue Regel anpassen, nicht umgekehrt.

### Neue Einheit
1. `js/data/units.js`: ähnliche Einheit kopieren, neuen Schlüssel vergeben; `name`, `short`, Werte, `weapons`, `cost`, `buildTime`, `slots`, `hotkey` anpassen (Taste darf in der Hauptstadt noch nicht belegt sein).
2. `js/data/buildings.js`: Schlüssel in `fob.produces` eintragen, für Partien mit Stadt auch in `CITY.produces` (`js/data/city.js`: Kaserne, Fabrikhalle oder Heliport).
3. `js/data/balance.js`: Stufe in `research.unitTier` (fehlt = sofort verfügbar).
4. (entfällt: der Kurzname steht als `short` in units.js)
5. Aussehen: Modell in `js/render/unitpaint.js` (Funktion in `MODELS` bzw. `INFANTRY`, gilt für 2D und Iso; `test/unitpaint.test.js` prüft, dass jede Einheit eines hat). Ohne Modell zeichnen `js/render/sprites.js` (`drawUnit`) und der Renderer eine einfache Form.
6. KI: Soll sie die Einheit bauen? Dann `MIX` in `js/data/ai.js` und die Ausbildung in `js/ai/ai.js` ergänzen, sonst im PRD §10 vermerken, dass sie es nicht tut.
7. Test in `test/` (Ausbildung über `game.issue(team, { type: 'train', … })`), Hilfe in `js/ui/menu.js`, `npm run docs` (Tabellen), PRD §6 (Rolle) und Änderungsverlauf, `CACHE_VERSION`.

### Neues Gebäude
1. `js/data/buildings.js`: Eintrag mit `name`, `w`, `h` (Zellen), `hp`, `sight`, `cost`, `buildTime`, `hotkey`; optional `weapon`, `aa`.
   Mit `hotkey` erscheint es automatisch im Baumenü des Baufahrzeugs.
2. Sonderregeln beim Setzen in `game.js` (`canPlace`), Wirkung im passenden Modul oder in einem neuen Modul (Rezept „Neues Spielsystem“).
3. Kurzname als `short` im Eintrag. Aussehen: `js/render/sprites.js` (`drawBuilding`) und `js/render/isobuild.js`.
4. KI optional in `js/ai/ai.js`; Test, Hilfe, PRD §5 und Änderungsverlauf, `CACHE_VERSION`.

### Neuer Befehl
1. Handler im zuständigen Modul: `export function cmdX(game, team, cmd)` → `{ ok: true }` oder `{ ok: false, reason: 'deutscher Text' }`. Nur eigene, lebende Einheiten akzeptieren.
2. In `js/game/game.js` → `issue()` einen `case 'x':` ergänzen und den Befehl in [ARCHITEKTUR.md](ARCHITEKTUR.md) („Befehle“) eintragen.
3. UI: Eintrag in der Befehlskarte (`js/ui/controller.js`, `entry(label, hotkey, { action })`) und/oder Rechtsklick; Taste in der Hilfe (`js/ui/menu.js`).
4. Test über `game.issue`, PRD §8 (Steuerung) und Änderungsverlauf.

### Neue Option im Startmenü
1. Standard in `BALANCE.menuDefaults`; `js/ui/menu.js` → `showStartMenu`: Zustand, Schalter im HTML, Speicherung (`readFlag`/`writeFlag` mit eigenem Schlüssel `frontline-…`), Wert in `onStart({ … })`.
2. `js/main.js` → `startGame`: Wert an `new Game({ … })` weitergeben.
3. `js/game/game.js` → Konstruktor-Option mit Standard **aus**, an das Feature-Modul weitergeben (Regel 9).

### Neues Spielsystem (eigenes Modul)
1. `js/game/<name>.js` mit Kopfkommentar (Zweck, „Kein DOM“), `create<Name>(game)` für den Startzustand und `update<Name>(game, dt)` für einen Schritt.
2. In `js/game/game.js` importieren, `create…` im Konstruktor aufrufen und `update…` in `update()` an der passenden Stelle der Reihenfolge einfügen (siehe ARCHITEKTUR.md).
3. Werte als eigener Abschnitt in `js/data/balance.js`, Datei in `sw.js` → `ASSETS`, Test `test/<name>.test.js`, Zeile in der Feature-Landkarte oben.

### KI-Verhalten anpassen
1. Schwellen und Takte zuerst über `BALANCE.difficulty` oder `js/data/ai.js` ändern.
2. Neues Verhalten als eigene Methode der Klasse `AI`, aufgerufen aus `think()` (Denkschritt); die KI ändert das Spiel nur über `game.issue`.
3. `test/ai.test.js` (KI gegen KI über feste Seeds) laufen lassen; PRD §10 und die Tabelle „KI-Konstanten“ aktualisieren.
