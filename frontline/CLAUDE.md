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
3. Spielwerte gehören nach `js/data/` (`balance.js` mit den Schnelleinstellungen `QUICK` ganz oben, `units.js`, `buildings.js`, `ai.js`),
   mit deutschem Kommentar, was sie bewirken. Keine neuen Balance-Zahlen als Konstanten in `js/game` oder `js/ai`.
4. Zufall in der Simulation nur über `game.rng` bzw. `makeRng(seed)` (`js/core/rng.js`), nie `Math.random()`. Gleicher Seed = gleiche Partie.
   Zufallskarten ohne Fluss müssen je Seed unverändert bleiben (gespeicherte Seeds, Tests).
5. Imports immer mit Endung (`'./zone.js'`), nie über den Ordner `frontline/` hinaus, keine CDNs oder externen Dateien.
6. Neue Datei, die der Browser lädt: in `sw.js` unter `ASSETS` eintragen. Jede Änderung an ausgelieferten Dateien: `CACHE_VERSION` in `sw.js` um 1 erhöhen.
7. Regel- oder Feature-Änderung: [PRD.md](PRD.md) im passenden Abschnitt anpassen und oben im **Änderungsverlauf** eintragen
   (neue Version `v4.xx`, Cache-Version). Die Hilfe (F1) und die Spielanleitung in `js/ui/menu.js` nennen Zahlen und Tasten
   von Hand: mitpflegen (Suche z. B. `grep -rn "300 Plätze" js PRD.md`).
8. Neue Ideen, die Daniel nur festhalten will: PRD §13 „Geparkte Ideen“, nicht bauen.
9. Startmenü-Schalter (Sendemast, Wetter, Forschung, Fluss) sind im Menü standardmäßig an, in `new Game()` ohne Angabe aus. Tests verlassen sich darauf.
10. Texte im Spiel, Kommentare und Doku auf Deutsch, Bezeichner im Code englisch. Vor dem Push `npm test` (alle grün).

## Starten und testen

```sh
# im Repo-Wurzelordner (games/)
python3 -m http.server 8765
# Spiel:  http://localhost:8765/frontline/          Editor: http://localhost:8765/frontline/editor.html

cd frontline
npm test                          # alle Tests (node --test, Node 22), dauert einige Minuten
node --test test/radio.test.js    # nur eine Datei
```

- URL-Parameter: `?debug=1` (kein Nebel, Taste M = +1000 Ressourcen, bis 10× Tempo), `?seed=N`, `?speed=N`, `?river=0|1`,
  `?gl=0` (ohne WebGL-Boden), `?sprites=0` (gemalte statt Bild-Sprites), `?debug=1&fog=1`, `?debug=1&weather=winter&wx=snow`.
- Tests erzeugen ein `new Game({ seed, … })`, geben Befehle über `game.issue` und rufen `game.update(dt)` in einer Schleife.
  Sie ändern Werte direkt (z. B. `BALANCE.slotCap = 1000`) und setzen sie danach zurück. `test/classic.js` gibt der Haupt-FOB ein endliches Lager.
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
| Baumaterial für eine FOB-Baustelle / Bau- und Reparaturtempo | balance.js | `QUICK.fobMaterial` / `BALANCE.construction` |
| Lagergröße, LKW-Ladung / Lade- und Nachfüllraten | balance.js | `QUICK.storeCap`, `QUICK.truckLoad` / `BALANCE.logistics` |
| Gleichzeitige Ausbildungen / Länge der Warteschlange | balance.js | `QUICK.trainSlots` / `QUICK.queueMax` |
| Preis, Ausbildungszeit, HP, Tempo, Sicht einer Einheit | units.js | `cost`, `buildTime`, `hp`, `speed`, `sight` |
| Waffen einer Einheit (Reichweite, Kadenz, Schuss, Schaden) | units.js | `weapons[]`: `range`, `cooldown`, `rounds`, `munCost`, `damage`, `hits` |
| Kosten, Bauzeit, HP, Waffe eines Gebäudes | buildings.js | `cost`, `buildTime`, `hp`, `weapon`, `aa`, `hotkey` |
| Welche Forschungsstufe eine Einheit freischaltet / Forschungskosten | balance.js | `BALANCE.research.unitTier` / `BALANCE.research.items` |
| Schwierigkeit der KI (Denktakt, Angriffsschwelle, Einkommen, Verhalten, FOB-Grenze, Sendemast ab, Kistenholer) | balance.js | `BALANCE.difficulty.<easy\|normal\|hard>` |
| Weitere KI-Werte (Wellen, Späher, Expansion, Kisten …) | js/data/ai.js | eine Konstante je Zeile mit Kommentar; Bedeutung: PRD §10 „KI-Konstanten“ |
| Höhenvorteil, Tempo am Hang, Weitsicht von oben | balance.js | `BALANCE.height`, `BALANCE.slope`, `BALANCE.sightHeight` |
| Wetter, Häuserkampf, Kisten, Kommandeur, Formationen, Fluss, Tiere, Wracks, Tarnung, Flugabwehr | balance.js | `weather`, `garrison`, `crates`, `commander`, `formation`, `river`, `animals`, `scars`, `stealth`, `airFire` |
| Kartengröße | balance.js | `BALANCE.map` (Vorsicht: ändert alle Karten und Tests) |
| Aufbau der Zufallskarte (Hügel, Seen, Häuser, Felder, Kisten-Abstände) | js/game/map.js, js/game/landscape.js | Konstanten am Dateianfang (ändert alle Zufallskarten) |
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
| Bauen, Reparieren, FOB-Baustellen | §4, §5 | `construction`, `fob` | `construction.js`, `game.js` (`canPlace`, `cmdBuild`) | `difficulty.fobCap`, `RELAY_STEP`, `FLANK_R`, `WALL_*` | `controller.js` (Baumenü), `sprites.js`, `isobuild.js` | `game.test.js` |
| Bewegung, Wegsuche, Raster | – | `slope.pathCost`, `leash` | `movement.js`, `pathfinding.js`, `grid.js` | – | – | `path.test.js` |
| Formationen | §8 | `formation` | `formation.js` | Keil bei Angriffswellen | `controller.js` (Taste F) | `formation.test.js` |
| Kampf, Waffen, Schaden, Treffer | §6 „Waffen“, „Treffer“ | `UNITS.*.weapons`, `BUILDINGS.*.weapon`, `height` | `combat.js`, `entities.js` | `FALLBACK_*`, `RAID_*` | `sprites.js` (Effekte) | `hits.test.js`, `game.test.js` |
| Flugabwehr (Flak, SAM, Flugabwehrstellung) | §6 | `airFire`, `UNITS.flak`, `UNITS.sam`, `BUILDINGS.aa` | `combat.js` | baut Flak/SAM noch nicht | `sprites.js`, `isosprites.js` | `airdefense.test.js` |
| Scharfschütze, Tarnung | §6 | `stealth`, `UNITS.sniper` | `game.js` (`sees`), `combat.js` | baut ihn nicht | – | `sniper.test.js` |
| Nebel und Sicht | §7, §9 | `fogInterval`, `sightHeight` | `fog.js` | – | `renderer.js`, `minimap.js` | `terrain.test.js` |
| Gelände: Höhe, Hänge, Seen | §7 „Gelände“ | `height`, `slope`, `sightHeight` | `relief.js`, `landscape.js` | – | `ground.js` (WebGL), `reliefimg.js` | `relief.test.js`, `terrain.test.js` |
| Fluss, Brücken, Furten | §7 „Fluss“ | `river` | `river.js`, `landscape.js` | `BRIDGE_*` | `bridge.js` | `river.test.js` |
| Häuserkampf | §7 „Häuserkampf“ | `garrison` | `garrison.js` | `GARRISON_*` | `renderer.js`, `status.js` | `garrison.test.js` |
| Versorgungskisten | §7 „Versorgungskisten“ | `crates` | `crates.js` | `CRATE_*`, `difficulty.cratePickers` | `sprites.js` (`drawCrate`), `minimap.js` | `crates.test.js` |
| Kommandeur | §6 | `commander`, `UNITS.commander` | `commander.js` | `CMD_*` | `sprites.js` (`drawStar`), `renderer.js` | `commander.test.js` |
| Sendemast | §7 „Sendemast“ | `radio`, `BUILDINGS.radio` | `radio.js` | `RADIO_*`, `difficulty.radioFrom` | `sprites.js`, `isobuild.js`, `hud.js` | `radio.test.js` |
| Wetter und Jahreszeiten | §7 „Wetter“ | `weather` | `weather.js` | `WX_*` | `weatherfx.js`, `season.js` | `weather.test.js` |
| Forschungsstufen | §7 „Forschungsstufen“ | `research` | `research.js` | `UPGRADES`, `UPGRADE_RESERVE` | `controller.js`, `hud.js` | `research.test.js` |
| Zufallskarte, Stadt, Gehöfte, Felder | §7, §9a | `map`, `zone.r` | `map.js`, `landscape.js` | – | `terrain.js`, `iso.js`, `isobuild.js`, `isosprites.js` | `map.test.js`, `fields.test.js` |
| Wracks und Krater (nur Optik) | §9 | `scars` | `scars.js` | – | `sprites.js` (`drawWreck`, `drawCrater`) | `scars.test.js` |
| Tiere (nur Optik) | §9 | `animals` | `animals.js` | – | `sprites.js` (`drawAnimal*`) | `animals.test.js` |
| KI allgemein | §10 | `difficulty` | – | `js/ai/ai.js` | – | `ai.test.js` |
| Karteneditor, gespeicherte Karten | §9a | – | `mapdata.js` | – | `js/editor/editor.js`, `editor.html`, `css/editor.css` | `mapdata.test.js` |
| Steuerung, Befehlskarte, HUD, Menüs, Hilfe | §8, §9 | – | – | – | `controller.js`, `input.js`, `hud.js`, `menu.js`, `status.js` | – |
| Kamera, Iso-Ansicht, Minimap | §9 | – | – | – | `camera.js`, `iso.js`, `renderer.js`, `minimap.js` | – |
| Offline, Installation | §11 | – | – | – | `sw.js`, `manifest.json`, `icons/` | – |

## Rezepte

### Einen Wert ändern
1. Schlüssel in „Wo ändere ich was?“ suchen, Wert in `js/data/` ändern.
2. PRD und Hilfetexte (`js/ui/menu.js`) auf die alte Zahl durchsuchen und anpassen; Eintrag im PRD-Änderungsverlauf.
3. `CACHE_VERSION` in `sw.js` erhöhen, `npm test`. Schlägt ein Test fehl, der genau diesen Wert prüft: Test an die neue Regel anpassen, nicht umgekehrt.

### Neue Einheit
1. `js/data/units.js`: ähnliche Einheit kopieren, neuen Schlüssel vergeben; `name`, Werte, `weapons`, `cost`, `buildTime`, `slots`, `hotkey` anpassen (Taste darf in der Haupt-FOB noch nicht belegt sein).
2. `js/data/buildings.js`: Schlüssel in `fob.produces` eintragen.
3. `js/data/balance.js`: Stufe in `research.unitTier` (fehlt = sofort verfügbar).
4. `js/ui/controller.js`: Kurzname in `SHORT_UNIT`.
5. Aussehen: 2D in `js/render/sprites.js` (`drawUnit`); Iso optional in `js/render/isosprites.js` (`UNIT_MODEL` / `INFANTRY_NAME`, sonst gemalt).
6. KI: Soll sie die Einheit bauen? Dann `MIX` in `js/data/ai.js` und die Ausbildung in `js/ai/ai.js` ergänzen, sonst im PRD §10 vermerken, dass sie es nicht tut.
7. Test in `test/` (Ausbildung über `game.issue(team, { type: 'train', … })`), Hilfe in `js/ui/menu.js`, PRD §6 (Tabelle und Rolle) und Änderungsverlauf, `CACHE_VERSION`.

### Neues Gebäude
1. `js/data/buildings.js`: Eintrag mit `name`, `w`, `h` (Zellen), `hp`, `sight`, `cost`, `buildTime`, `hotkey`; optional `weapon`, `aa`.
   Mit `hotkey` erscheint es automatisch im Baumenü des Baufahrzeugs.
2. Sonderregeln beim Setzen in `game.js` (`canPlace`), Wirkung im passenden Modul oder in einem neuen Modul (Rezept „Neues Spielsystem“).
3. `js/ui/controller.js`: Kurzname in `SHORT_BLD`. Aussehen: `js/render/sprites.js` (`drawBuilding`) und `js/render/isobuild.js`.
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
