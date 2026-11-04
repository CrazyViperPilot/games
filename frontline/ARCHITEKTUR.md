# Frontline – Architektur

Wie der Code aufgebaut ist. Regeln für Änderungen, Wegweiser zu Werten und Rezepte: [CLAUDE.md](CLAUDE.md).
Spielregeln: [PRD.md](PRD.md). Zahlen stehen hier bewusst nicht, sie gehören in `js/data/`.

## 1. Schichten

```
  Spieler-Steuerung (js/ui/)    Computergegner (js/ai/)        Taktgeber (js/core/loop.js)
            │                            │                       │ update(dt)       │ render()
            └── game.issue(team, cmd) ───┘                       │                  │
                         │                                       │                  │
                         ▼                                       ▼                  ▼
  Simulation (js/game/, kein DOM)  ◄─────────────────────────────┘     Darstellung (js/render/), HUD
                         │                    ── Zustand ──────────────────►  (liest nur)
                         ▼ liest
  Werte (js/data/: QUICK und BALANCE, UNITS, BUILDINGS, KI-Werte), gelesen von allen Schichten
```

- **Simulation** (`js/data`, `js/core/rng.js`, `js/game`, `js/ai`): ohne DOM, deterministisch je Seed, läuft in Node (`npm test`).
- **Befehle:** Spieler (über `js/ui/controller.js`) und KI ändern das Spiel nur mit `game.issue(team, cmd)`. Beide haben dieselben Regeln.
- **Darstellung und HUD** lesen den Zustand (`game.units`, `game.buildings`, `game.effects` …) und ändern ihn nie.
- **Ereignisse:** Die Simulation legt Meldungen in `game.events` (`game.message(team, text, x, y)`), das HUD holt sie mit `game.drainEvents()`.

## 2. Ablauf einer Partie

1. `index.html` lädt `js/main.js`. Das Startmenü (`js/ui/menu.js` → `showStartMenu`) liefert Schwierigkeit, Siegpunkte, Karte und Schalter.
2. `main.js` → `startGame` erzeugt `new Game({ seed, winPoints, startMoney, map, radio, weather, research, river })`, dazu
   `AI` (Team 1), `Camera`, `Renderer`, `Controller`, `Hud`, `Input` und `Minimap`.
3. `createLoop` (`js/core/loop.js`) ruft mit fester Schrittweite (`BALANCE.tickRate`) `ai.update(dt)` und `game.update(dt)`,
   und je Bildschirm-Frame einmal das Zeichnen. Pause und Tempo wirken nur auf die Schritte.
4. Sieg: Punkte (`zone.js`), Sendemast (`radio.js`) oder Eliminierung (`game.js` → `checkElimination`). Dann zeigt `menu.js` den Endbildschirm.

## 3. Ein Simulationsschritt (`Game.update(dt)` in `js/game/game.js`)

Die Reihenfolge ist Absicht; ein neues System kommt an die Stelle, deren Ergebnisse es braucht.

| # | Aufruf | Modul | Was passiert |
|---|---|---|---|
| 1 | `updateWeather` | `weather.js` | Wetterwechsel, Sicht- und Tempofaktoren |
| 2 | `updateResearch` | `research.js` | Forschungsfortschritt |
| 2b | `updateAbilities` | `abilities.js` | Rauch, Minen, Feldwerkstatt |
| 3 | `updateEconomy` | `economy.js` | `team.rate` zurücksetzen, Ausbildung, Soldaten-Nachschub |
| 3a | `updateCity` | `city.js` | nur mit Stadt: Einwohner, Wachstum, Erträge ins Lager der Hauptstadt, Steuern |
| 4 | `updateGarrison`, `updateTowers` | `garrison.js`, `tower.js` | Ein- und Aussteigen in Stadthäuser und Gefechtstürme; Dachaufbauten werden fertig |
| 5 | `updateFormations` | `formation.js` | Tempo geschlossener Gruppen |
| 6 | `updateMovement` | `movement.js` | Wege planen und fahren, Verfolgen (ohne Jets) |
| 6a | `updateAircraft` | `aircraft.js` | Jets: fliegen, kreisen, Rückkehr, Landung, Tanken und Nachladen am Flughafen, Absturz ohne Treibstoff (seit v5.03) |
| 7 | `updateCrates` | `crates.js` | Kisten aufheben, tragen, einlagern, Kistengeld |
| 8 | `updateLogistics` | `logistics.js` | LKW laden, entladen, pendeln; Nachfüllen der Einheiten |
| 9 | `updateConstruction` | `construction.js` | Baufortschritt, Reparatur, automatische Bauzuweisung |
| 10 | `updateBridges` | `river.js` | Brücken-Wiederaufbau |
| 11 | `separate` | `movement.js` | Einheiten auseinanderschieben |
| 12 | `updateCommanders` | `commander.js` | Aura, Heilung |
| 13 | `updateCombat` | `combat.js` | Zielsuche, Schüsse, Granaten, Flugabwehr, Schaden |
| 14 | `updateZone` | `zone.js` | Kontrolle der Zone, Zonengeld, Punkte |
| 15 | `updateHot` | `hotzone.js` | Hot Zone wandern lassen, Bohrer |
| 16 | `updateRadio` | `radio.js` | Haltezeit des Sendemasts, Sieg |
| 17 | `smoothIncome` | `economy.js` | geglättete Einkommensanzeige |
| 18 | `updateFog` (alle `BALANCE.fogInterval` s) | `fog.js` | Sicht je Team |
| 19 | `updateAnimals`, `ageEffects`, `cleanup`, `updateScars` | `animals.js`, `game.js`, `scars.js` | Tiere, Effekte altern, Tote entfernen (Wracks, Ereignisse), Narben |
| 20 | `checkElimination` | `game.js` | Sieg durch Eliminierung |

Startzustand im Konstruktor von `Game`: Karte (`generateMap` oder gespeicherte Karte), Raster, Höhengelände, Brücken, Stadtstraßen der Karte (`createRoads`, `game.roads`), Teams,
Forschung, Zone, Hot Zone, Nebel, Hauptstädte und Startarmee, Häuser, Kisten, Tiere, Wetter. Jedes System hat dafür ein `create…(game)`.

## 4. Koordinaten

- Welt in Pixeln, Ursprung links oben; Karte und Rastergröße in `BALANCE.map`. Zelle `(c, r)` = `Math.floor(x / tile)`, Index `r * cols + c`.
- Winkel im Bogenmaß (0 = +x), Tempo in px/s, Zeiten in Sekunden.
- Gebäude belegen Zellen ab `cx, cy` (links oben) mit Größe `w × h`; `x, y` ist der Mittelpunkt in der Welt.
- Team 0 = Blau (Spieler), Team 1 = Rot (KI). Startpunkte sind punktsymmetrisch: zu jedem `(x, y)` gehört `(W − x, H − y)`.
- Die Iso-Ansicht ist nur Darstellung (`js/render/iso.js`, `camera.js`); die Spiellogik bleibt 2D von oben.

## 5. Datenmodelle

Alle Objekte sind einfache JS-Objekte. IDs: fortlaufende Ganzzahlen ab 1 (`game.newId()`); 0 oder `null` = keins.
Häuser und Kisten haben negative IDs. Vollständige Felder: `createUnit` und `createBuilding` in `js/game/entities.js`.

**Game** (`js/game/game.js`): `seed, rng, map, grid, relief, time, teams[2], entities (Map id → Einheit/Gebäude), units[], buildings[],
projectiles[], effects[], events[], zone, hot, fog[2], formations, winner (null | 0 | 1), winReason, winPoints, radioWin`,
dazu von den Systemen: `houses, crates, bridges, wrecks, animals, weather, research`.

**Team:** `id, name, color, res { money, bm, mun, fuel }` (bm/mun/fuel = Summe der FOB-Lager, als Getter), `income`, `rate`, `flow`,
`points, pointProgress, incomeMult, isAI, tech { tier, done, cur }`.

**Einheit** (`kind: 'unit'`): `id, type, team, def (= UNITS[type]), x, y, angle, hp, maxHp, alive, order { type, x, y, targetId }, path,
targetId, weapons [{ spec, rounds, cd }], ammo (Getter), fuel, cargo { bm, mun, fuel }, preset, passengers, house, crate, speedMul, anchorX/Y`.

**Gebäude** (`kind: 'building'`): `id, type, team, def (= BUILDINGS[type]), x, y, cx, cy, w, h, hp, maxHp, alive, built, progress,
queue [{ unit, payerId }], queueTimes, rallyX/Y, main (Hauptstadt), store { bm, mun, fuel }, drill, fireTarget`.

**Effekt** (nur Darstellung, `game.effects`): `{ type, x, y, x2, y2, team, t, life }`, angelegt mit `game.addEffect`.

**Ereignis** (`game.events`): `{ type: 'message', team (−1 = alle), text, x, y }`.

## 6. Befehle (`game.issue(team, cmd)`)

Antwort immer `{ ok: true, … }` oder `{ ok: false, reason: 'deutscher Text' }`. `ids` = Liste eigener Einheiten.
Neue Befehle: Rezept in [CLAUDE.md](CLAUDE.md).

| `cmd.type` | Felder | Handler (`js/game/`) | Wirkung |
|---|---|---|---|
| `city` | `kind` (Zellenart aus `KINDS` in `city.js`, z. B. `road`, `res`, `com`, `market`, `barracks`, `factory`, `heliport`, oder `erase`), `c0, r0, c1, r1` | `city.js` `cmdCity` | Stadtzellen im Rechteck ausweisen oder räumen (nur mit Stadt) |
| `move`, `attackMove` | `ids, x, y, formation?` | `game.js` `cmdMove` | Marsch bzw. Angriffsmarsch, optional in Formation |
| `attack` | `ids, targetId` | `game.js` `cmdAttack` | Ziel angreifen (auch Brücken) |
| `stop` | `ids` | `game.js` | Anhalten |
| `build` | `building, x, y, ids` oder `siteId, ids` | `game.js` `cmdBuild` | Baustelle setzen bzw. an Baustelle helfen |
| `buildWall` | `building, x1, y1, x2, y2, ids` | `game.js` `cmdBuildWall` | Mauer- oder Torlinie |
| `deploy` | `ids`, optional `x, y` (≤ `fob.deploySnap` vom Fahrzeug) | `game.js` `cmdDeploy` | FOB-Fahrzeug wird an seiner Stelle (oder der nächsten freien) zur fertigen FOB (seit v5.09; `buildFob` antwortet nur noch mit einem Fehler) |
| `repair` | `ids, targetId` | `construction.js` `cmdRepair` | Gebäude reparieren |
| `repairBridge` | `ids, bridgeId` | `river.js` `cmdRepairBridge` | Brücke wieder aufbauen |
| `load`, `unload` | `ids, fobId, preset?` | `logistics.js` | LKW an einer FOB laden / entladen |
| `route` | `ids, fromId, toId, preset?` | `logistics.js` `cmdRoute` | LKW pendeln lassen |
| `setPreset` | `ids, preset` | `logistics.js` | Ladungsart (`mix`, `bm`, `mun`, `fuel`) |
| `mortarTarget` | `ids, x, y` | `game.js` `cmdMortarTarget` | Mörser auf einen Punkt richten |
| `land` | `ids, airportId` | `aircraft.js` `cmdLand` | Flugzeuge landen auf dem eigenen Flughafen (Platzrunde, Landebahn, Ausrollen, Stellplatz; seit v5.15) |
| `board` | `ids, heliId` | `logistics.js` `cmdBoard` | in ein Fahrzeug oder einen Hubschrauber einsteigen |
| `dropoff` | `ids, x, y` | `logistics.js` `cmdDropoff` | Passagiere am Punkt absetzen |
| `garrison`, `ungarrison` | `ids, houseId` (Haus oder Gefechtsturm) / `ids` | `garrison.js` | Haus oder Turm besetzen / verlassen |
| `roof` | `buildingId, kind` (`mortar`, `flak`, `sam`) | `tower.js` `cmdRoof` | Dachaufbau auf einen Gefechtsturm |
| `fortify` | `buildingId, towers?, tx?, ty?, ids?` | `tower.js` `cmdFortify` | FOB zur Festung ausbauen (Mauerring, Tore, Türme) |
| `pickup`, `deliver`, `dropCrate` | `ids, crateId` / `ids, fobId` / `ids` | `crates.js` | Kiste aufheben / abliefern / fallen lassen |
| `drill` | `ids` | `hotzone.js` `cmdDrill` | Bohrer starten |
| `train`, `cancelTrain` | `buildingId, unit` / `buildingId` | `game.js` | Ausbildung in der Hauptstadt (mit Stadt: Kaserne, Fabrikhalle, Heliport = Stadt-Entities mit `produces`, `queue`) / letzten Eintrag abbrechen |
| `research`, `cancelResearch` | `buildingId, key` / `key?` | `research.js` | Forschung starten oder einreihen (bis 3 wartend, bezahlt beim Einreihen) / abbrechen (ohne `key` die laufende; Abhängige fallen mit heraus, alles erstattet) |
| `smoke`, `mine` | `ids` | `abilities.js` | Nebelwand (Fahrzeuge) / Mine (Baufahrzeug) |
| `rally` | `buildingId, x, y` | `game.js` `cmdRally` | Sammelpunkt |
| `demolish` | `buildingId` | `game.js` `cmdDemolish` | Gebäude abreißen |

## 7. Dateien

`js/core/` – `loop.js` feste Schrittweite und Frames, `rng.js` Zufall je Seed (mulberry32).

`js/data/` – `balance.js` alle globalen Spielzahlen (oben `QUICK` = Schnelleinstellungen, darunter `BALANCE` mit Inhaltsverzeichnis),
`units.js` Einheiten und Waffen (UNITS), `buildings.js` Gebäude (BUILDINGS), `ai.js` KI-Werte, `mapgen.js` Kartengenerator (MAPGEN).

`js/game/` (Simulation, kein DOM)

| Datei | Inhalt |
|---|---|
| `game.js` | Klasse `Game`: Zustand, `issue`, Platzierung (`canPlace`), Lager, Spawn, Aufräumen, Sieg |
| `entities.js` | `createUnit`, `createBuilding`, `createShell`, Hilfen wie `isFoe`, `inRange` |
| `economy.js` | Ausbildung, Nachschub, Einkommensanzeige |
| `zone.js`, `hotzone.js` | Konfliktzone und Punkte; Hot Zone und Bohrer |
| `movement.js`, `pathfinding.js`, `grid.js`, `formation.js` | Bewegung, A*-Wegsuche, Zellenraster, Formationen |
| `combat.js` | Zielsuche, Direktfeuer, Mörser, Flugabwehr, Schaden |
| `logistics.js`, `construction.js` | LKW, Nachfüllen, Transport; Bauen und Reparieren |
| `city.js` (Daten `js/data/city.js`, UI `js/ui/citypanel.js`, Karte `js/render/citylayer.js`) | Zonenstadt um die Hauptstadt (PRD §15), Befehl `city`; Stadtgebäude belegen `grid.struct` mit `city.gridId`; fertige Gebäude haben seit v4.83 eine Ziel-Entity (`kind: 'building'`, `type: 'city'`, nicht in `game.buildings`), die der Spieler seit v4.94 wählen kann |
| `garrison.js`, `tower.js`, `crates.js`, `commander.js`, `radio.js` | Häuserkampf, Festung (Gefechtsturm, Dachaufbau, Ausbau-Befehl), Versorgungskisten, Kommandeur, Sendemast |
| `flow.js` (UI `js/ui/flowpanel.js`) | Ressourcenanzeige: Graph der Kette aus `CITY.chain` und `c.stats`, Verbrauchsmessung, Engpässe (liest nur) |
| `weather.js`, `research.js`, `river.js` | Wetter und Jahreszeit, Forschungsbaum (seit v5.04: `team.tech = { tier, done, cur, queue }`, Wirkung je Gruppe über `modOf(game, e, stat)`, Daten `js/data/research.js`), Fluss mit Brücken und Furten |
| `roads.js` | Stadtstraßen der Karte (seit v5.03): Zonenstraßen und Brückenfahrbahnen als Zellen im Stadtraster (`game.roads.kind`: 1 Straße, 2 Brücke), für beide Teams Straßenanschluss (`city.roadAt`), nicht ausweisbar (`canZone`) |
| `aircraft.js` | Flughafen und Kampfflugzeuge (seit v5.03): Anlage `AIRPORT` (Bahnen, Stellplätze; auch fürs Bild), `u.jet = { home, slot, ready, rtb }`, `u.parked` (im Hangar: `isFoe` falsch, schießt nicht), Ausbildungsprüfung `trainCheck` |
| `fog.js` | Nebel des Krieges je Team, Sicht im Gelände |
| `map.js`, `landscape.js`, `relief.js`, `mapdata.js` | Zufallskarte (Stadt, Gehöfte, Kisten), Höhengelände, Höhenraster, Kartenformat für Editor und Speicher |
| `scars.js`, `animals.js` | Wracks und Krater, Tiere (nur Optik, aber Teil der Simulation) |

`js/ai/ai.js` – Klasse `AI`: `update(dt)` ruft im Takt `BALANCE.difficulty.<stufe>.think` die Methode `think()`; Werte aus `js/data/ai.js` und `BALANCE.difficulty`.

`js/render/` (Zeichnen, liest nur)

| Datei | Inhalt |
|---|---|
| `renderer.js` | Klasse `Renderer`: zeichnet alles in 2D oder isometrisch, Nebel, Overlays |
| `camera.js` | Ausschnitt, Zoom, Welt ↔ Bildschirm, Iso-Umrechnung |
| `sprites.js` | gemalte Einheiten, Gebäude, Effekte, Kisten, Wracks, Tiere (von oben) |
| `iso.js`, `isobuild.js`, `isosprites.js`, `isodata.js` | Iso-Grundkörper, Iso-Gebäude, Bild-Sprites (Kenney, `assets/iso/`), Modelldaten |
| `university.js`, `cityhall.js`, `works.js` | Gezeichnete Sonderbauten in 2D und Iso, vierfach symmetrisch (ein Bild für jede Drehung): Universität 3 × 3, Werke 2 × 2 (BM-Werk, Munitionswerk, Raffinerie, Stahlwerk) und Kraftwerk (seit v5.18 je Art und Stufe ein gemaltes Bild über `spritecache.js`, Schildhöhe `worksLift` aus gemessenen Höhen `TALL`), Hauptstadt als modernes Rathaus (`b.main`, eingehängt in `renderer.js` und `isobuild.drawTeamBuilding`) |
| `townhouses.js`, `spritecache.js` | Alle 1 × 1-Stadtgebäude (Wohnen, Gewerbe, Markt, Rechenzentrum, Krankenhaus, Heliport, Förderanlagen je Vorkommen) mit eigenem Bild je Stufe in 2D und Iso (ein Bild für jede Drehung, seit v5.17); `spritecache.js` malt jede Variante je Maßstab (Stufen 2^¼) einmal in ein eigenes Bild, danach nur `drawImage` (höchstens 6 ms Malen je Bild, Speicher begrenzt, `beginTownFrame` im Renderer) |
| `isokit.js` | Gemeinsame Bauteile für gemalte Gebäude (seit v5.18, genutzt von `townhouses.js` und `works.js`): Iso-Projektion `G`, Wände, Fenster, Dächer, Zylinder, Kegel, Bäume, Fahrzeuge, Halden, Schienen und dieselben Teile von oben für 2D (`…Top`) |
| `bigbuild.js` | Großbauten der Stadt (seit v5.03): Kaserne, Fabrikhalle, Flughafen (das Kraftwerk zeichnet seit v5.18 `works.js`) als Liste von Boden-Teilen und Körpern (Quader mit Schmuck wie Fenster, Tore, Sattel- und Sheddach seit v5.11, Zylinder, Fahne, Fahrzeuge, Bäume) in Weltkoordinaten; 2D von oben, isometrisch jeder Körper als eigenes Objekt in der Tiefenordnung (`cityBuildings` → `drawTownBuilding` mit `kind: 'bigpart'`), richtig für jede Drehung |
| `ground.js`, `reliefimg.js`, `terrain.js` | WebGL-Boden der Iso-Ansicht, Geländebild, Kartenbild |
| `bridge.js`, `season.js`, `weatherfx.js` | Brücken, Jahreszeitenfarben, Regen/Schnee/Nebel |
| `minimap.js` | Minimap |

`js/ui/` – `controller.js` Auswahl, Modi, Befehlskarte (kein DOM, ruft `game.issue`), `input.js` Maus/Tastatur/Touch,
`hud.js` DOM-Anzeige, `menu.js` Start-, Pause-, Hilfe- und Endbildschirm, `status.js` lesende Texthilfen.

`js/audio/sound.js` – Ton (PRD §14): synthetisiert per WebAudio, liest `game.effects` (Hinweis `snd`), Meldungen und Wetter; `main.js` hält ein `Sound` für alle Partien.

`js/editor/editor.js` + `editor.html` – Karteneditor; speichert Karten über `js/game/mapdata.js` im `localStorage`.

Sonstiges: `sw.js` Service Worker (network-first, Präfix `frontline-`), `manifest.json`, `css/`, `icons/`, `assets/` (Lizenzen in `assets/LICENSES/`),
`tools/render-models/` (Werkzeug zum Vorrendern der Iso-Modelle), `tools/doc-tables.mjs` (erzeugt die Wertetabellen in PRD §6, `npm run docs`),
`test/` (node --test; `config.test.js` prüft die Config, `doctables.test.js` die PRD-Tabellen).

## 8. Spielstand
`core/snapshot.js` wandelt einen Objektgraphen (Maps, Sets, Typed Arrays, Zyklen, Klasseninstanzen, `makeRng`-Zustand) in JSON und zurück; `game/savegame.js` meldet Klassen (`CLASSES`) und feste Spieldaten (`STATICS`: nur Verweise) an und bietet `snapshotGame` / `restoreGame`. `ui/saves.js` speichert in IndexedDB und auf dem Webspace (PHP `frontline/api.php` im Repo vipervocs), `main.js` ruft es auf (`captureSave`, `resumeGame`). Regeln und Pflege: PRD §16.
