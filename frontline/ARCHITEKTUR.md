# Frontline – Architektur

Wie der Code aufgebaut ist. Regeln für Änderungen, Wegweiser zu Werten und Rezepte: [CLAUDE.md](CLAUDE.md).
Spielregeln: [PRD.md](PRD.md) (Einstieg) und die Themen-Dateien in [docs/prd/](docs/prd/). Zahlen stehen hier bewusst nicht, sie gehören in `js/data/`.

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
2. `main.js` → `startGame` erzeugt `new Game({ seed, winPoints, startMoney, map, radio, weather, research, river, city })`, dazu
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
| 3a | `updateCity` | `city/economy.js` | nur mit Stadt (Phasen in fester Reihenfolge: Gebiet, Ruinen, Treffer, Einwohner, Wachstum, Wirtschaft, Pflege): Einwohner, Wachstum, Steuern und Gewerbe-Absatz; Ketten (Förderung → Hütte → Stahlwerk/BM/Raffinerien/Kerosin → Lager, Munitionswerk holt Stahl) und Pendler laufen über die Straßenwege aus `transport.js`: `beginLoads` (Last auf 0), Flüsse und Pendler eintragen (`addLoad`), Gutschrift mit der Wirkung des Weges (`pathEff`), `settleLoads` (Stau glätten, wirkt im nächsten Schritt). Wege werden nur neu gerechnet, wenn sich die Stadt ändert (`c.ver`, auch bei Flucht und Rückkehr der Bewohner), der geglättete Stau-Faktor je Zelle liegt in `c.congestion` (gespeichert) |
| 4 | `updateGarrison`, `updateTowers` | `garrison.js`, `tower.js` | Ein- und Aussteigen in Stadthäuser und Gefechtstürme; Dachaufbauten werden fertig |
| 5 | `updateFormations` | `formation.js` | Tempo geschlossener Gruppen |
| 6 | `updateMovement` | `movement.js` | zuerst zurückgestellte Wege planen (`planPending`, `pathplan.js`), dann Wege fahren, Verfolgen (ohne Jets); am Ende von `update` setzt `game.js` das Wegbudget `pathWork` und die geteilten Wege `pathShare` zurück |
| 6a | `updateAircraft` | `aircraft.js` | Jets: fliegen, kreisen, Rückkehr, Landung, Rollen über Straßen und Bahn, Tanken und Nachladen am Stellplatz aus Kerosintank und Munitionslager (seit v5.35 Fliegerhorst), Absturz ohne Treibstoff (seit v5.03) |
| 6b | `updateHelis` | `helipad.js` | Hubschrauber mit Heliport: senkrecht starten und landen, Luftraumsperre, gelandet tanken und nachladen aus Kerosintank und Munitionslager, Heimflug (seit v5.51) |
| 7 | `updateCrates` | `crates.js` | Kisten aufheben, tragen, einlagern, Kistengeld |
| 8 | `updateLogistics` | `logistics.js` | LKW laden, entladen, pendeln; Nachfüllen der Einheiten |
| 9 | `updateConstruction` | `construction.js` | Baufortschritt, Reparatur, automatische Bauzuweisung |
| 9a | `updateDig` | `excavator.js` | Bagger fahren zu ihrer Zelle und räumen sie (seit v5.35) |
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

**Stadt** (`game.city[team]`, nur mit Stadt, angelegt in `js/game/city/create.js`): Raster `cols, rows, cell`, je Zelle `kind[]` (Index in `KINDS`), `level[]`, `deposit[]`, `flee[]`, `blocked[]`, `felled`, `list` (belegte Zellen), `ver` (Zähler: steigt bei jeder Änderung an Zellen, Wege werden dann neu gerechnet), `hitLog`, `mapRoads` (Stadtstraßen der Karte). Vorräte im Stadtlager: `metal` (Stahl, Schlüssel bleibt `metal`), `kero` (Kerosin, seit v5.20). `stats` ist nur Anzeige: je Schritt neu gesetzt (Ausbeute `raw`, `cap`, `inp`, `gross`, `n`, Gewerbe-Versorgung `shopSupply`, `lost` = Waren ohne Weg je s, `jam` = kleinster Stau-Faktor).
**Straßentransport** (`transportOf(game, c)` in `js/game/transport.js`, seit v5.20): Zustand je Stadtobjekt in einer `WeakMap` (`STATE`). Er enthält `routes` (Lieferweg je Förderung und Werk: Ziel, Weg, Länge), `depot` (Wege zu Kerosintank und Munitionslager, seit v5.35), `commute` (Pendlerweg je Arbeitsstätte, `null` = keine Wohnung), `mun` und `shop` (Wege Munitionswerk bzw. Gewerbe und Markt zum Lager), `load`, `factor`, `cap` je Stadtzelle und `list` (Straßenzellen). Der Zustand liegt nicht im Objektgraphen und damit nicht im Spielstand; nach dem Laden wird er beim ersten Zugriff neu berechnet.

**Effekt** (nur Darstellung, `game.effects`): `{ type, x, y, x2, y2, team, t, life }`, angelegt mit `game.addEffect`.

**Ereignis** (`game.events`): `{ type: 'message', team (−1 = alle), text, x, y }`.

## 6. Befehle (`game.issue(team, cmd)`)

Antwort immer `{ ok: true, … }` oder `{ ok: false, reason: 'deutscher Text' }`. `ids` = Liste eigener Einheiten.
Alle Befehle stehen im **Befehlsregister** `COMMANDS` (`js/game/commands.js`, seit v5.63): je Typ der Handler `run`, `drives`
(der gleichnamige Auftrag wird von seinem Modul gefahren, `updateMovement` lässt ihn aus: `OWN_DRIVERS`) und `sound` (die Steuerung
quittiert ihn mit dem Befehlston). `game.issue` schlägt nur dort nach; `test/docs.test.js` prüft, dass jeder Registereintrag hier steht.
Neue Befehle: Rezept in [CLAUDE.md](CLAUDE.md).

| `cmd.type` | Felder | Handler (`js/game/`) | Wirkung |
|---|---|---|---|
| `city` | `kind` (Zellenart aus `KINDS`, Register `js/data/citykinds.js`, z. B. `road`, `res`, `com`, `market`, `barracks`, `factory`, `heliport`, `smelter`, `kero`, oder `erase`), `c0, r0, c1, r1`, bei `erase` optional `demolish: true` | `city/commands.js` `cmdCity` | Stadtzellen im Rechteck ausweisen oder räumen (nur mit Stadt). `erase` lässt Rohstoffvorkommen und Förderanlagen stehen (seit v5.20); nur mit `demolish: true` (Abreißen eines gewählten Gebäudes) entfernt es eine Förderanlage |
| `move`, `attackMove` | `ids, x, y, formation?` | `game.js` `cmdMove` | Marsch bzw. Angriffsmarsch, optional in Formation |
| `attack` | `ids, targetId` | `game.js` `cmdAttack` | Ziel angreifen (auch Brücken) |
| `stop` | `ids` | `game.js` | Anhalten |
| `build` | `building, x, y, ids` oder `siteId, ids` | `game.js` `cmdBuild` | Baustelle setzen bzw. an Baustelle helfen |
| `buildWall` | `building, x1, y1, x2, y2, ids` | `game.js` `cmdBuildWall` | Mauer- oder Torlinie |
| `deploy` | `ids`, optional `x, y` (≤ `fob.deploySnap` vom Fahrzeug) | `game.js` `cmdDeploy` | FOB-Fahrzeug wird an seiner Stelle (oder der nächsten freien) zur fertigen FOB (seit v5.09; `buildFob` antwortet nur noch mit einem Fehler) |
| `repair` | `ids, targetId` | `construction.js` `cmdRepair` | Gebäude reparieren |
| `repairBridge` | `ids, bridgeId` | `river.js` `cmdRepairBridge` | Brücke wieder aufbauen |
| `load`, `unload` | `ids, fobId, preset?`; `load` auch `work` statt `fobId` (seit v5.69) | `logistics.js` | LKW an einer FOB laden / entladen; `work` (Zellindex eines eigenen Werks mit Ausgangslager, `CITY.pickup.kinds`) lädt dort nur die Ware des Werks |
| `route` | `ids, fromId, toId, preset?`; `fromWork` statt `fromId` (seit v5.69) | `logistics.js` `cmdRoute` | LKW pendeln lassen, Start an einer FOB oder einem Werk |
| `setPreset` | `ids, preset` | `logistics.js` | Ladungsart (`mix`, `bm`, `mun`, `fuel`) |
| `mortarTarget` | `ids, x, y` | `game.js` `cmdMortarTarget` | Mörser auf einen Punkt richten |
| `land` | `ids, airportId` | `aircraft.js` `cmdLand`, Heliport als Ziel `helipad.js` `cmdHeliLand` (seit v5.51) | Flugzeuge landen am Fliegerhorst des eigenen Stellplatzes `airportId` (seit v5.35; Anflug, Bahn, Ausrollen, Rollen zum Stellplatz; seit v5.15) |
| `cityUpgrade` | `buildingId` | `city/commands.js` `cmdCityUpgrade` | Stellplatz eine Stufe ausbauen (Überdachung, Stahlbeton-Shelter) gegen Geld, BM und Stahl (seit v5.39) |
| `dig` | `ids, c0, r0, c1, r1, append?` | `excavator.js` `cmdDig` | Bagger räumen die Zellen des Rechtecks nacheinander (Zonenstraße, Bäume, Häuser, eigene Gebäude; seit v5.35) |
| `storm`, `fortifyHouse` | `ids, houseId` (Sturm) / `houseId, work` (ausbauen) | `garrison.js` `cmdStorm`, `cmdFortifyHouse` | Besetztes gegnerisches Haus stürmen / ein eigenes Haus zur Stellung ausbauen |
| `trade` | `good` (`bm`, `mun`, `fuel`, `metal`, `kero`), `dir` (`sell`, `buy`) | `city/commands.js` `cmdTrade` | Ein Los am eigenen Markt handeln (nur mit fertigem Markt) |
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
| `setDifficulty` | `difficulty` (`easy`, `normal`, `hard`) | `game.js` | KI meldet ihr Team an (seit v5.58, aus dem Konstruktor von `AI`): `isAI`, `incomeMult` aus `BALANCE.difficulty` |
| `debug` | `money?`, `weather?`, `season?`, `hold?` | `game.js` `cmdDebug` | Nur mit `new Game({ debug: true })` (`?debug=1`, seit v5.58): Geld dazu (Taste M) / Wetter setzen, mit `hold` bleibt es |

## 7. Dateien

`js/core/` – `loop.js` feste Schrittweite und Frames, `rng.js` Zufall je Seed (mulberry32).

`js/data/` – `balance.js` alle globalen Spielzahlen (oben `QUICK` = Schnelleinstellungen, darunter `BALANCE` mit Inhaltsverzeichnis),
`units.js` Einheiten und Waffen (UNITS), `buildings.js` Gebäude (BUILDINGS), `ai.js` KI-Werte, `mapgen.js` Kartengenerator (MAPGEN),
`city.js` Stadt (CITY), `citykinds.js` Register der Stadtzellenarten (`CITY_KINDS`: feste ID, Name, Werkzeug, Farbe, Symbol, Preis, Größe,
Strom, Rolle; daraus `KINDS`, `CITY.cost` u. a.), `goods.js` Register der Waren (`GOODS`: Name, Kürzel, Farbe, Lager, Markt, Ertrag;
seit v5.59). Die beiden Register importieren nichts; Simulation, UI und Darstellung lesen sie direkt (die Darstellung nicht über die UI).

`js/game/` (Simulation, kein DOM)

| Datei | Inhalt |
|---|---|
| `game.js` | Klasse `Game`: Zustand, `issue` (schlägt im Befehlsregister nach), Platzierung (`canPlace`, Zahler `placePayer`), Lager, Spawn, Aufräumen, Sieg |
| `commands.js` | Befehlsregister `COMMANDS` (Handler, `drives`, `sound`), daraus `OWN_DRIVERS` (seit v5.63) |
| `entities.js` | `createUnit`, `createBuilding`, `createShell`, Hilfen wie `isFoe`, `inRange` |
| `economy.js` | Ausbildung, Nachschub, Einkommensanzeige |
| `zone.js`, `hotzone.js` | Konfliktzone und Punkte; Hot Zone und Bohrer |
| `movement.js`, `pathfinding.js`, `pathplan.js`, `grid.js`, `formation.js` | Bewegung, A*-Wegsuche (`findPath` für Kartenbau, `findUnitPath` für Einheiten), Wegplanung der Einheiten (Wegbudget je Schritt, Warteschlange, lange Suche über mehrere Schritte, geteilte Wege; Zustand `game.pathWork`, `pathBacklog`, `pathSeq`, `pathLong`, `pathShare`), Zellenraster, Formationen |
| `combat.js` | Zielsuche (eine Suche `searchTarget` für Schützen und Einzelwaffen), Direktfeuer, Mörser, Flugabwehr, Schaden |
| `logistics.js`, `construction.js` | LKW, Nachfüllen, Transport; Bauen und Reparieren |
| `city/` (Daten `js/data/city.js`, UI `js/ui/citypanel.js`, Karte `js/render/citylayer.js`, KI `js/ai/cityai.js`) | Zonenstadt um die Hauptstadt (PRD §15), seit v5.60 in Modulen (Review A-01/A-04): `cells.js` Zellgeometrie, Straßenzugang und seit v5.78 das Baugebiet (`buildWhy`, `buildAllowed`: die Regel über `canZone`; seit dem Paket „Straßen“ die Anschlusspflicht: `mainAccess`, Maske `roadLinked`, `roadLinkWhy` für ganze Gebäude in `fitBig`), Straßenzugang (`isFlat`, `sizeOf`, `bigSpan`/`bigCells`/`fitBig`, `cellRect`, `roadAt`, `hasRoad`, `accessCells` mit Kette, `canZone`, `DEPOSITS`; Blattmodul nur mit Daten-Importen), `query.js` Abfragen (`cityLevel`, `citySum`, `powerRatio`, `freePop`, `crewOf`, `cityTrainers`, `trainerKind`, `forEnemyCity`, `hasMarket`), `state.js` Zellzustand (`totals`, `zeroStats`, `updateClaim`, Belegung von `grid.struct` mit `city.gridId`, `syncEntity`/`dropEntity`, `payMetal`, `placeBuilt`, `cityNoise`), `roadnet.js` Straßennetz (`roadReach`, `mainRoadReach`, `connectRoad`: Anschluss an das Lagernetz oder ein Ziel, für Startviertel und KI), `create.js` Erzeugung und Startviertel (`createCity`), `clearing.js` Bäume fällen und Abriss (`treeGone`), `commands.js` Befehle `city`, `cityUpgrade`, `trade`, `economy.js` Wirtschaftsschritt `updateCity` (rechnet die Ketten über `transport.js`), `care.js` Heilen und Reparieren. Fertige Gebäude haben seit v4.83 eine Ziel-Entity (`kind: 'building'`, `type: 'city'`, nicht in `game.buildings`), die der Spieler seit v4.94 wählen kann. Importe ohne Zyklus: `transport.js` und `research.js` lesen nur `cells.js`/`query.js` |
| `transport.js` | Straßentransport (seit v5.20, kein DOM): Breitensuche über Straßenzellen (`nearestField`, mehrere Ziele gleichzeitig), Wege je Gebäude (`pathFrom`, `pathEff`), Last und Stau (`addLoad`, `beginLoads`, `settleLoads`), Lager am Straßennetz (`mainAccess`), Anzeige der Lieferung und des Pendlers (`transportInfo`, liest nur). Zustand: `transportOf` in einer WeakMap je Stadt |
| `garrison.js`, `tower.js`, `crates.js`, `commander.js`, `radio.js` | Häuserkampf, Festung (Gefechtsturm, Dachaufbau, Ausbau-Befehl), Versorgungskisten, Kommandeur, Sendemast |
| `researchpanel.js` (UI) | Forschungsfenster: Äste, Stufen, Warteschlange |
| `flow.js` (UI `js/ui/flowpanel.js`) | Ressourcenanzeige: Graph der Kette aus `CITY.chain` und `c.stats`, Verbrauchsmessung, Engpässe (liest nur) |
| `weather.js`, `research.js`, `river.js` | Wetter und Jahreszeit, Forschungsbaum (seit v5.04: `team.tech = { tier, done, cur, queue }`, Wirkung je Gruppe über `modOf(game, e, stat)`, Daten `js/data/research.js`), Fluss mit Brücken und Furten |
| `roads.js` | Stadtstraßen der Karte (seit v5.03): Zonenstraßen und Brückenfahrbahnen als Zellen im Stadtraster (`game.roads.kind`: 1 Straße, 2 Brücke), für beide Teams Straßenanschluss (`city.roadAt`), nicht ausweisbar (`canZone`) |
| `aircraft.js` | Fliegerhorst und Kampfflugzeuge (seit v5.35; vorher Flughafen): Bahnen aus Bahnzellen (`runwaysOf`, Cache je `c.ver`), Weg Stellplatz → Bahn über Straßen und Bahn (`standRoute`), Bahnsperre `c.runwayBusy`, `u.jet = { home, ready, phase, route, rtb }`, `u.parked` (auf dem Stellplatz, angreifbar, Schutz `parkedArmor`, schießt nicht), Ausbildungsprüfung `trainCheck` (ein Jet je Stellplatz) |
| `helipad.js` | Heliport als Landeplatz (seit v5.51): `u.heli = { home, phase: landed/takeoff/air/landing, t, alt }`, Luftraumsperre `c.padBusy`, Ausbildungsprüfung `heliTrainCheck` (ein Hubschrauber je Heliport) |
| `excavator.js` | Bagger (seit v5.35): Befehl `dig` (`cmdDig`), Fahren und Räumen (`updateDig`, nach `updateConstruction`); entfernte Zonenstraßen in `game.roads.dug` |
| `fog.js` | Nebel des Krieges je Team, Sicht im Gelände; `version` zählt jede Neuberechnung (die Darstellung malt nur dann neu) |
| `map.js`, `landscape.js`, `relief.js`, `mapdata.js` | Zufallskarte (Stadt, Gehöfte, Kisten), Höhengelände, Höhenraster, Kartenformat für Editor und Speicher |
| `scars.js`, `animals.js` | Wracks und Krater, Tiere (nur Optik, aber Teil der Simulation) |

`js/ai/ai.js` – Klasse `AI`: `update(dt)` ruft im Takt `BALANCE.difficulty.<stufe>.think` die Methode `think()`; Werte aus `js/data/ai.js` und `BALANCE.difficulty`. Kern: Konstruktor, `update`, `think`, `snapshot`, `once`. Die übrigen Methoden stehen als Mixins in `js/ai/army/` (Objekte mit Methoden, über `Object.assign(AI.prototype, …)` eingehängt; Spielstände bleiben gleich, weil nur Methoden wandern): `build.js` (Stellungen, FOB-Fahrzeuge, Verteidigung, Mauer, Festung, Heliport, Brücken, Baufahrzeuge, Funkmast), `produce.js` (Ausbildung, Gegenmischung, Forschung, Kommandeur), `logistics.js` (LKW-Rollen, Pendler, Versorger, Kisten), `combat.js` (Armee, Angriffswellen, Rückzug, Artillerie, Späher, Flankenangriff, Häuserkampf, Jets); gemeinsame Konstanten und Hilfen in `army/util.js`. Die Module importieren `ai.js` nicht.
`js/ai/cityai.js` – Stadt-KI (seit v5.60 aus der Simulation hierher): `aiCity` (Ausbau), `aiRaid`, `aiDefend`; Werte aus `CITY.ai`, Buchhaltung `cityAiMemory()` in `AI.cityMem`, Befehle nur über `game.issue`.

`js/render/` (Zeichnen, liest nur)

| Datei | Inhalt |
|---|---|
| `renderer.js` | Klasse `Renderer`: zeichnet alles in 2D oder isometrisch, Nebel, Overlays. Seit v5.64 in Durchläufen: `render` baut mit `frameOf` die Werte eines Bildes (Kamera, Ausschnitt `inRect`, Sichtregeln `seen`/`known`/`shown`, Auswahl), 2D `renderTop` → `topGround`, `topObjects`, `topEffects`, `topFog`, `drawSky`, `topBars`, `topScreen`; Iso `renderIso` → `isoGround`, `isoMarks`, `isoItems` (Objekte nach Tiefe), `isoShadows`, `isoObjects`, Flieger, `isoEffects`, `isoFog`, `drawSky`, `isoBars`, `isoScreen`. Nebel seit v5.49: `fogData` liefert dem WebGL-Nebel je Zelle Sicht und Erkundet weichgezeichnet (`blur121`), Iso und 2D zeichnen ihn über `ground.renderFog`; ohne WebGL und für die Minimap `updateFogLayer` (weich, Wolkentöne `fogTone` über eine Farbtabelle, Minimap ohne Wolken) |
| `camera.js` | Ausschnitt, Zoom, Welt ↔ Bildschirm, Iso-Umrechnung |
| `color.js` | Farb- und Rechenhilfen aller Malmodule (seit v5.59/v5.64): `rgbOf`, `hexOf`, `mix`, `clamp`, `hashXY` (fester Streuwert je Lage) |
| `sprites.js` | einfache Formen von oben: Einheiten, Gebäude, Kisten, Tiere (Ersatz, wenn ein gemaltes Modell fehlt); Farbhilfen `shade`, `tint`, `hexA` |
| `fx.js` | Effekte (seit v5.34): Explosion (Blitz, Feuerball aus Flammenwolken, Rauch, Funken, Brocken; Iso Bodenteil in `drawEffect(…, true)`, aufrecht in `drawEffectUp`), Leuchtspur, Geschoss mit Rauchspur, Mündungsfeuer, Abfangen, Mörsergranate (`drawShell` 2D, `drawShellIso`, Zielring `drawShellTarget`), Rauch, Feuer, Nebelwand, Mine, Krater, Trümmer von oben (`drawWreckRubble`, auch eingestürzte Häuser mit `ruin`), Ersatz-Wrack; weiche Flecken als einmal gemalte 64-px-Bilder (`dot`: weich, Schwade, Wolke) |
| `iso.js`, `isobuild.js`, `isosprites.js` | Iso-Grundkörper, Iso-Gebäude (einfache Ersatzformen, solange ein gemaltes Bild fehlt), `isosprites.js` nur noch Hülle um Einheiten und Wracks aus `unitpaint.js` (Bilddateien gibt es seit v5.43 keine mehr); Trümmer `drawRubble` seit v5.34 mit Schutthügeln, abgebrochener Mauerecke, Platten und Balken |
| `milbuild.js` | Alle Militärgebäude (FOB, Mauer, Tor, Mörser, Flugabwehr, Phalanx, Gefechtsturm mit Dachaufbau, Sendemast, Bohrer) und ihre Baustellen als gemalte Bilder in 2D und Iso (seit v5.21, über `spritecache.js`, Bauteile aus `isokit.js`); Mauern und Tore richten sich nach den Nachbarn (`setMilWalls` je Bild aus `renderer.js`, Maske nach Drehung der Ansicht), Varianten für Schaden (< 50 %) und Winter. Eingehängt in `isobuild.drawTeamBuilding` (`drawMilIso`) und im 2D-Durchlauf des Renderers (`drawMilTop`, danach `sprites.drawBuilding` nur für die Anzeigen) |
| `university.js`, `cityhall.js`, `works.js` | Gezeichnete Sonderbauten in 2D und Iso, vierfach symmetrisch (ein Bild für jede Drehung): Universität 3 × 3, Werke 2 × 2 (BM-Werk, Munitionswerk, Raffinerie, Stahlwerk) und Kraftwerk (seit v5.18 je Art und Stufe ein gemaltes Bild über `spritecache.js`, Schildhöhe `worksLift` aus gemessenen Höhen `TALL`), Hauptstadt als modernes Rathaus (`b.main`, eingehängt in `renderer.js` und `isobuild.drawTeamBuilding`) |
| `townhouses.js`, `spritecache.js` | Alle 1 × 1-Stadtgebäude (Wohnen, Gewerbe, Markt, Rechenzentrum, Krankenhaus, Heliport, Förderanlagen je Vorkommen) mit eigenem Bild je Stufe in 2D und Iso (ein Bild für jede Drehung, seit v5.17); `spritecache.js` malt jede Variante je Maßstab (Stufen 2^¼) einmal in ein eigenes Bild, danach nur `drawImage` (höchstens 6 ms Malen je Bild, Speicher weich begrenzt: beim Aufräumen bleibt, was im laufenden oder vorigen Bild gebraucht wurde, seit v5.29; `beginTownFrame` im Renderer) |
| `citysite.js` | Baustellen der Stadt gemalt (seit v5.45): jede wachsende Zelle (Stufe 0, Zeitgeber ≥ 0) zeigt nach dem Fortschritt einen von fünf Bauabschnitten (`siteStep`: Baugrube, Bodenplatte, Rohbau, zweites Geschoss, Dachstuhl), Großbauten über alle Zellen mit Kran und Baucontainer, Stützen und Treppenkern (`insideLayout`), Kaserne und Fabrikhalle mit Lagerplatz (`dims(n).yard`, seit v5.46); Iso `drawSiteIso` (ein Bild für jede Drehung) und 2D `drawSiteTop`, beide über `spritecache.js` und `isokit.js`; `siteTall` ist die Höhe für den Fortschrittsbalken. Die Objekte (`kind: 'site'` bzw. Ruine `kind: 'cityruin'`, Schutt über `drawRubble` in `isobuild.js` und `drawWreckRubble` in `fx.js`) baut `cityBuildings` in `citylayer.js`, den Balken `siteBar` in `drawCityBadges` |
| `isokit.js` | Gemeinsame Bauteile für gemalte Gebäude (seit v5.18, genutzt von `townhouses.js`, `works.js` und `milbuild.js`): Iso-Projektion `G`, Wände, Fenster, Dächer, Zylinder, Kegel, Bäume, Fahrzeuge, Halden, Schienen und dieselben Teile von oben für 2D (`…Top`) |
| `bigbuild.js` | Großbauten der Stadt (seit v5.03): Kaserne, Fabrikhalle (das Kraftwerk zeichnet seit v5.18 `works.js`, den Fliegerhorst seit v5.42 `airbase.js`; den Flughafen 10 × 10 gibt es seit v5.56 auch im Bild nicht mehr) als Liste von Boden-Teilen (Flächen, Linien, Vielecke; gleiche Farbe in einem Pfad, `fine` erst ab Zoom 0,55, Anlage je Lage zwischengespeichert) und Körpern (Quader mit Schmuck wie Fenster, Tore, Sattel- und Sheddach seit v5.11, Zylinder, Fahne, Fahrzeuge, Bäume) in Weltkoordinaten; 2D von oben, isometrisch jeder Körper als eigenes Objekt in der Tiefenordnung (`cityBuildings` → `drawTownBuilding` mit `kind: 'bigpart'`), richtig für jede Drehung |
| `airbase.js` | Fliegerhorst gemalt (seit v5.42): Boden je Baustein (`airbaseGround`: Beton mit Fugen, Führungslinie, Torschienen, Parkplatz, Schotter) und Teile (`airbaseBodies`, `t: 'ab'`): Stellplatz Stufe 1 offen, Stufe 2 Überdachung (`canopy`), Stufe 3 Shelter (`has`) als je ein Teil mit `over` und Grundriss `x0 … y1` (Iso nach der vordersten Ecke, 2D in `drawCityRoofs`), Dach und Röhre über eine Zwischenfläche halb durchsichtig (`seeThrough`), fest in der Welt je Drehung gemalt (`worldG`); Tower, Kerosintank, Munitionslager; 2D `drawAirbaseTop`, Iso `drawAirbaseIso` (Bilder über `spritecache.js`, Bauteile aus `isokit.js` und `works.js`; Tower, Radar, Flutlicht und Windsack des alten Flughafens stehen seit v5.56 hier) |
| `maptown.js` | Kartenstadt (seit v5.23): Wohnhäuser in fünf Stilen (Altbau, Klinker, Fachwerk, Neubau, Gehöft; Stil und Farben je Gebäude fest aus der Lage, `infoOf`), Hallen, Fabriken, Fabrikmauern, Zugteile, Bahnhof, Bahnsteig, Parks und seit v5.43 der Wachturm (`wachturm`, `towerTop`; Treppe auf der Seite weg von der Kartenmitte, `towerSide`) als gemalte Bilder in 2D und Iso (`drawMapIso`, `drawMapTop`, `drawMapTown2D`, `drawPark`, `drawMapCars2D`, Minimap `drawMapTownMini`; über `spritecache.js`, Bauteile aus `isokit.js`). Iso: schräge Zugteile/Bahnsteige zeichnet weiter `isobuild.js` |
| `props.js` | Kleinkram der Karte (seit v5.43): geparkte Autos (Limousine, Kombi, Kleinwagen, Transporter als Modelle mit dem Maler aus `unitpaint.js`, Iso 4 Richtungen mit Gruppen je Ansicht `paintGroups`, damit Räder und Radkästen richtig liegen; `drawMapCarIso`, `drawMapCarShadowIso`, 2D `drawMapCarTop`), Parkbänke (16 Richtungen, `drawBenchIso`, `drawBenchShadowIso`, `drawBenchTop`) Versorgungskisten (mit `isokit.js`, `drawCrateIso` mit Höhe und Schimmer, 2D `drawCrateTop`) und seit v5.44 Heu- und Strohballen der Felder (liegende Rundballen, Iso 8 Richtungen, `drawBaleIso`, `drawBaleShadowIso`, 2D `drawBaleTop`; Lage aus `fields.js` `fieldBales`); alles über `spritecache.js`, Winter mit Schnee. Ersatz ohne Bild: `isobuild.js` (`drawCar`, `drawBench`, `drawCrate`), `sprites.js` (Kiste, auch im Editor) |
| `marks.js` | Anzeigen auf der Karte gemalt (seit v5.50): Auswahlring und Hover (`drawSelectMark`: Ring für Einheiten und Kisten, Rahmen mit Eckwinkeln für Gebäude und Häuser; je Größe, Hover und Ansicht ein Bild über `spritecache.js`, gezeichnet in Weltkoordinaten auf der Bodenebene, die der Renderer setzt) und Auswahlrahmen (`drawDragFrame`, Bildschirmkoordinaten); seit v5.52 Balken (`drawGauge`, auch für `sprites.drawBar`; Ladung `drawCargoGauge`), Kommandeursstern (`drawStarMark`, auch für `sprites.drawStar`), Heilkreuz (`drawCareMark`) und Warnzeichen „ohne Munition“ (`drawNoAmmoMark`; diese drei als Bilder in Bildschirmpixeln); seit v5.54 Befehle: Wegziel (`drawMoveRing`), Formationsplätze (`drawSlotMark`), Linien mit Saum (`strokeTrail`, Pfad baut der Renderer, im Relief über `groundLine`), Pfeilspitze (`drawArrowHead`), Bodenring (`drawFootRing`) und Sammelpunkt-Fahne (`drawRallyFlag`, Iso aufrecht in Bildschirmkoordinaten). Dunkler Saum unter jeder hellen Linie, keine Verläufe |
| `stronghold.js` | Besetzte Häuser gemalt (seit v5.48): Fahne in Teamfarbe am besetzten Haus (`drawHouseFlagIso`, `drawHouseFlagTop`, jedes Bild, flattert) und die Ausbauten des Häuserkampfs am Haus (`worksMask`: Sandsäcke, MG-Nest, Stacheldraht); Iso je Drehung zwei Bilder, `'back'` vor dem Haus (Draht hinten) und `'front'` danach (`drawHouseWorksIso`), 2D ein Bild (`drawHouseWorksTop`). Der Renderer ruft beides bei den Häusern der Karte auf (`houseBySrc`), sichtbar nach `fortShown` |
| `unitpaint.js` | Einheiten (seit v5.27): Soldaten, Fahrzeuge, Hubschrauber und F-16 als 3D-Modelle aus Grundkörpern (`box`, `prX`/`prY`/`prZ`, `loft`, `cyl`, `ball`; Modelle `tank` … `f16`, `soldier`), eigener kleiner Maler `paintSolids` (Licht wie die Gebäude, Rückseiten weg, Tiefe je Körper, aufgesetzte Teile `on`, Ketten `under`). Iso `drawUnitIso` (Wanne 16 Richtungen, Turm getrennt, Soldaten 8 mit Gehbildern), `drawUnitShadowIso` (Umriss am Boden), 2D `drawUnitTop`, Wracks `drawWreckIso`; Rotoren und Nachbrenner live, Bilder über `spritecache.js` (enge Grenzen je Richtung, Nachbarrichtung als Ersatz) |
| `nature.js` | Natur (seit v5.28): Bäume in vier Arten (`broad`, `birch`, `spruce`, `pine`; Waldart `forestKind`/`forestSpecies` für `buildDeco` im Renderer), Büsche (Strauch, Beeren, Farn, junge Fichte), Felsen und Tiere als 3D-Modelle mit dem Maler aus `unitpaint.js` (`PAINT`: Oberseiten `top` für Moos/Schnee, `vary` für Felsflächen), Bodenbild der Rohstoffvorkommen (`depositSprite`, gelegt in `citylayer.js`). Iso `drawTreeIso`/`drawBushIso`/`drawRockIso`/`drawAnimalIso`, Schatten `natureShadowIso` (ein Pfad je Bild), 2D `drawTreeTop`/`drawBushTop`/`drawRockTop`/`drawAnimalTopP`; je Jahreszeit eigene Bilder (Herbstlaub, kahle Winterbäume), alles über `spritecache.js` |
| `ground.js`, `reliefimg.js`, `terrain.js` | WebGL-Boden der Iso-Ansicht, Geländebild, Kartenbild (die Stadt der Karte malt seit v5.23 `maptown.js`, nur der Editor zeichnet sie noch ins Kartenbild). `ground.js` zeichnet auch den Kriegsnebel (`FS_FOG`, seit v5.49 ziehende Wolken aus der Rauschtextur, glatte Ränder, heller Saum; `renderFog(…, top)` mit `top = true` flach von oben für die 2D-Ansicht) |
| `ways.js` | Feldwege und Gleise (seit v5.31) scharf je Bild über dem Boden: Pfade je Kachel (1024 px) nach Ebenen (`ORDER`: Gleisrand, Schotter, Krone, Schwellen, Wegsaum, Erde/Schotter, Fahrstreifen, Spuren, Grasnarbe, Schienen), neu gebaut bei anderer Drehung oder anderem Gelände (`buildWays`), je Bild nur die sichtbaren Kacheln gefüllt (`drawWays`), feine Ebenen erst ab Zoom 0,45. Bodenmuster je Jahreszeit (`groundPattern`: Erde, Spuren, Schotter, Gleisschotter, Asphalt, Gehwegplatten; `patternMatrix` legt sie auf die Bodenebene), auch für die Stadtstraßen (`citylayer.js`) und die Brückenfahrbahn. Das Kartenbild (`terrain.js`) enthält Wege und Gleise weiter für Minimap und Editor. Seit v5.44 zeichnet `drawWays` davor die Äcker und Weiden aus `fields.js` (gleiche Kacheln und Transformation) |
| `fields.js` | Äcker und Weiden (seit v5.44) scharf über dem Boden wie die Feldwege: `buildFields` baut Pfade je Kachel (1024 px) und Ebene (Rain, Grundfläche je Frucht, Grasflecken, Trampelpfad, Reihen, Kämme, Schwaden, Fahrgassen, Feldrand, Zaun mit Latten, Gatter, Pfosten, Schneekappen) im Rahmen des Felds (lange Seite = Reihenrichtung), im Iso mit Höhe aus dem Gelände; `drawFieldLayers` füllt die sichtbaren Kacheln in fester Reihenfolge (`ORDER`, alle Pfade einer Ebene im selben Umlaufsinn, damit Überlappungen nicht doppelt decken), Muster je Frucht und Jahreszeit (eigene Maler, 64 Weltpixel je Kachel), feine Ebenen ab Zoom 0,4, Muster ab 0,3. `fieldBales` legt Heu- und Strohballen je Feld fest (gezeichnet von `props.js`, einsortiert im Renderer als Typ 14) |
| `mood.js` | Lichtstimmung (seit v4.70, nur Optik): Tageszeitfarben über der Karte, Menü „Licht“ |
| `bridge.js`, `season.js`, `weatherfx.js` | Brücken (seit v5.31 mit runden Stützen, Querträgern, Gesims, Widerlagern, Geländer mit Holmen, Laternen, Fahrbahn mit den Mustern aus `ways.js`; zerstört mit Bewehrungseisen) und Furtstangen, Jahreszeitenfarben, Regen/Schnee/Nebel (seit v5.47 gemalt: Regen in drei Tiefen mit Spritzern, Schnee als weiche Flocken aus einem einmal gemalten Bild, Wind stetig über `windDrift`, Nebelbänke in einem Bild mit 1/4 Auflösung; Schleier einfarbig, weil Verläufe über das ganze Bild ohne Grafikchip teuer sind) |
| `minimap.js` | Minimap |

`js/ui/` – `controller.js` Klasse `Controller`: Auswahl, Klicks, Tasten; die Methoden der Befehlskarte und der Zielmodi stehen als Mixins in `js/ui/controller/` (`cards.js` Befehlskarte und Gründe für gesperrte Schaltflächen, `targets.js` Bestätigung der Ziele und Platzierung, `util.js` gemeinsame Hilfen), die Modustabelle `MODES` in `controller/modes.js` (Hinweis, Klick, Vorschau je Modus; eigene Datei, damit `cards.js` sie ohne Zyklus lesen kann). Befehlskarte kein DOM, ruft `game.issue`. `input.js` Maus/Tastatur/Touch,
`hud.js` DOM-Anzeige, `menu.js` Start-, Pause-, Hilfe- und Endbildschirm, `helptext.js` Tastenliste der Hilfe mit Zahlen aus den Daten (kein DOM), `status.js` lesende Texthilfen (Auftragstext, FOB-Namen; den Bauzustand `builderState` liest die UI wie der Renderer aus `js/game/construction.js`).

`js/audio/sound.js` – Ton (PRD §14): synthetisiert per WebAudio, liest `game.effects` (Hinweis `snd`), Meldungen und Wetter; `main.js` hält ein `Sound` für alle Partien. `js/audio/music.js` (seit v5.68): Hintergrundmusik, von `Sound` erzeugt und mit ihr gesteuert; liest Lage und Spielzeit, ändert nichts an der Partie.

`js/editor/editor.js` + `editor.html` – Karteneditor; speichert Karten über `js/game/mapdata.js` im `localStorage`.

Sonstiges: `sw.js` Service Worker (network-first, Präfix `frontline-`), `manifest.json`, `css/`, `icons/` (seit v5.43 keine weiteren Bilddateien, alles gemalt),
`tools/doc-tables.mjs` (erzeugt die Wertetabellen in PRD §6, `npm run docs`),
`test/` (node --test; `config.test.js` prüft die Config, `doctables.test.js` die PRD-Tabellen).

## 8. Spielstand
`core/snapshot.js` wandelt einen Objektgraphen (Maps, Sets, Typed Arrays, Zyklen, Klasseninstanzen, `makeRng`-Zustand) in JSON und zurück; `game/savegame.js` meldet Klassen (`CLASSES`) und feste Spieldaten (`STATICS`: nur Verweise) an und bietet `snapshotGame` / `restoreGame`. Abgeleitetes steht nicht im Stand (seit v5.62): `snapshotGame` ersetzt beim Kodieren das Gelände durch sein Grobraster (oder nichts) und das Raster durch den Unterschied zum Raster der Karte (`terrainGrid`), `restoreGame` baut beide neu auf; Zwischenspeicher (Sichtfelder in `fog.js`, beste Zielklasse in `combat.js`, Straßentransport) liegen in `WeakMap`s. Ein Verweis auf `Grid` oder `Relief` von anderswo im Zustand bricht das Speichern ab (beide fehlen in `CLASSES`). `ui/saves.js` speichert in IndexedDB und auf dem Webspace (PHP `frontline/api.php` im Repo vipervocs), `main.js` ruft es auf (`captureSave`, `resumeGame`). Regeln und Pflege: PRD §16.

## 9. Feature-Landkarte (bis v5.79 in CLAUDE.md)

Wo jedes Feature liegt. „KI“ = Konstanten-Präfix in `js/data/ai.js`, Logik in `js/ai/ai.js`, Darstellung unter `js/render/`, UI unter `js/ui/`, Tests unter `test/`.

| Feature | PRD | Werte | Logik (`js/game/`) | KI | Darstellung / UI | Test |
|---|---|---|---|---|---|---|
| Spielzustand, Befehle, Platzierung, Sieg, Statistik am Spielende | §2, §4, §9 „Endbildschirm“ | `fob`, `winPoints` | `game.js` (`newStats`, `sampleArmy`, Zählung in `cleanup`), `economy.js` (Ausbildung) | – | `menu.js` (`showEnd`) | `game.test.js`, `stats.test.js` |
| Ausbildung, Einheitenlimit, Nachschub, Einkommen | §2, §3, §5 | `slotCap`, `trainSlots`, `reinforce`, `startRes` | `economy.js`, `game.js` (`cmdTrain`) | `MIX`, `COUNTER_*` | `controller.js`, `hud.js` | `economy.test.js` |
| Konfliktzone, Punkte, Zonengeld | §7 | `zone`, `pointInterval` | `zone.js` | `WAVE_*`, `THREAT_*` | `renderer.js`, `hud.js` | `economy.test.js`, `game.test.js` |
| Hot Zone und Bohrer | §7 „Hot Zone“, „Bohrer“ | `hot`, `BUILDINGS.drill` | `hotzone.js` | – | `renderer.js`, `hud.js` | `game.test.js` |
| Lager, LKW, Nachfüllen, Transport, Einsteigen; Werkslager und LKW am Werk (seit v5.69), Pendeln ab Werk (seit v5.70) | §3, §10, §15 „Werkslager“ | `logistics`, `CITY.pickup` | `logistics.js` (`ownWork`, `loadWork`), Ausgangslager `stockAtWork` in `city/economy.js` | `SUPPLY_*`, `SURPLUS_MIN`, `ROUTE_HOLD`, `WORK_SOURCE_NEAR`, `WORK_SOURCE_TRUCKS` (`pendlerPlan`, `workSource`, `pickupWorks` in `ai/army/logistics.js`, seit v5.70) | `renderer.js` (`drawRoutes`), `controller.js` (Rechtsklick auf Werk `pickWork`, Pendeln T ab Werk `confirmRouteFrom`), `hud.js` (`cityInfo`: Abholbereit) | `logistics.test.js`, `pickup.test.js`, `pickupai.test.js` |
| Bauen, Reparieren, neue FOBs (FOB-Fahrzeug, Aufbauen) | §4, §5 | `construction`, `fob`, `UNITS.fobTruck` | `construction.js`, `game.js` (`canPlace`, `cmdBuild`, `cmdDeploy`) | `difficulty.fobCap`, `FOBV_*`, `DEPLOY_REACH`, `RELAY_STEP`, `FLANK_R`, `WALL_*` (`expand`, `driveFobTruck` in `ai/army/build.js`), `MAX_PLACE` (Platzsuche) | `controller.js` (Baumenü), `sprites.js`, `isobuild.js`, Hauptstadt als Rathaus `cityhall.js` | `game.test.js` |
| Bewegung, Wegsuche, Raster (Wegbudget je Schritt, lange Suchen über mehrere Schritte, seit v5.61) | – | `slope.pathCost`, `leash`, `path` | `movement.js`, `pathfinding.js`, `pathplan.js`, `grid.js` | – | – | `path.test.js`, `pathplan.test.js` (mit Benchmark) |
| Formationen | §8 | `formation` | `formation.js` | Keil bei Angriffswellen | `controller.js` (Taste F) | `formation.test.js` |
| Kampf, Waffen, Schaden, Treffer | §6 „Waffen“, „Treffer“ | `UNITS.*.weapons`, `BUILDINGS.*.weapon`, `height` | `combat.js`, `entities.js` | `FALLBACK_*`, `RAID_*` | `fx.js` (Effekte, seit v5.34) | `hits.test.js`, `game.test.js`, `fx.test.js` |
| Flugabwehr (Flak, SAM, Flugabwehrstellung, Phalanx) | §5, §6 | `airFire`, `UNITS.flak`, `UNITS.sam`, `BUILDINGS.aa`, `BUILDINGS.phalanx` (`moneyPerShot`) | `combat.js` | `AIR_*` (Luftabwehr nach Art der Luftgegner, `counterMix`, seit v5.71) | `unitpaint.js` (Flak, SAM), `milbuild.js` (Flugabwehr, Phalanx) | `airdefense.test.js`, `aiair.test.js` |
| Flakpanzer Gepard, Panzerhaubitze (Artillerie: Granaten mit Streuung, Mindestreichweite, Feuer auf Punkt) | §6 | `UNITS.gepard`, `UNITS.pzh` (`indirect`, `shell`, `spread`, `shellSpeed`), Forschungsast `art` | `combat.js` (`fireUnitShell`, `unitFireAtGround`), `game.js` (`cmdMortarTarget`) | `AIR_*` (`counterMix`, `rememberAir`), `ART_*` (`counterMix`, `artillery`) | `unitpaint.js`, `renderer.js` (`drawMortarRange`), `controller.js` | `artillery.test.js`, `aiart.test.js` |
| Scharfschütze, Tarnung | §6 | `stealth`, `UNITS.sniper` | `game.js` (`sees`), `combat.js` | `SNIPER_*` (`counterMix`, seit v5.71) | – | `sniper.test.js`, `aiair.test.js` |
| Nebel und Sicht | §7, §9 | `fogInterval`, `sightHeight` | `fog.js` | `SCOUT_*`, `WX_SCOUT_*` (Späher) | `renderer.js` (`fogData`, `updateFogLayer`), `ground.js` (`FS_FOG`, Wolken und Ränder seit v5.49), `minimap.js` | `terrain.test.js`, `fogpaint.test.js` |
| Gelände: Höhe, Hänge, Seen | §7 „Gelände“ | `height`, `slope`, `sightHeight` | `relief.js`, `landscape.js` | – | `ground.js` (WebGL), `reliefimg.js` | `relief.test.js`, `terrain.test.js` |
| Fluss, Brücken, Furten | §7 „Fluss“ | `river` | `river.js`, `landscape.js` | `BRIDGE_*` | `bridge.js` | `river.test.js` |
| Häuserkampf (seit v5.66 mit Zonengewicht besetzter Häuser, Ausguck, Deckung an Ruinen; seit v5.67 KI stürmt und baut aus, Feuerbereich durch Fensterseiten) | §7 „Häuserkampf“ | `garrison` (`zoneWeight`, `sightMul`, `ruinCover`, `streetReach`), `difficulty.<stufe>.houseStorm/houseWorks` | `garrison.js` (`ruinCoverMul`, `game.ruins`, `houseCanFire`, Fensterseiten `windows` zur Straße beim Anlegen), `zone.js`, `fog.js`, `combat.js` (`hit`, Zielsuche und `weaponReaches` mit `houseCanFire`) | `GARRISON_*`, `STORM_*`, `HOUSE_WORK_*` (Methoden `stormHouses`, `fortifyHouses` in `ai/army/combat.js`) | `renderer.js` (Schild `drawGarrison`, Fensterstriche `drawWindows`, Sichtregel `fortShown`), `stronghold.js` (Fahne und Ausbauten am Haus, seit v5.48), `status.js` | `garrison.test.js`, `stronghold.test.js`, `housefight.test.js`, `housefight2.test.js` |
| Festung: Gefechtsturm, Dachaufbau, Ausbau-Befehl | §5a | `fortress`, `BUILDINGS.tower` (`cap`, `reach`, `roofs`) | `tower.js` (Besatzung über `garrison.js`) | `FORT_*`, `difficulty.<stufe>.fort` | `controller.js` (Karte von FOB und Turm), `hud.js`, `sprites.js` (Besatzung), `milbuild.js` (Bild mit Dachaufbau, seit v5.21) | `tower.test.js`, `fortress-ai.test.js` |
| Versorgungskisten | §7 „Versorgungskisten“ | `crates` | `crates.js` | `CRATE_*`, `difficulty.cratePickers` | `props.js` (gemalt seit v5.43: `drawCrateIso`, `drawCrateTop`), Ersatz und Editor `sprites.js` (`drawCrate`), `minimap.js` | `crates.test.js`, `props.test.js` |
| Kommandeur | §6 | `commander`, `UNITS.commander` | `commander.js` | `CMD_*` | `sprites.js` (`drawStar`), `renderer.js` | `commander.test.js` |
| Sendemast | §7 „Sendemast“ | `radio`, `BUILDINGS.radio` | `radio.js` | `RADIO_*`, `difficulty.radioFrom` | `milbuild.js` (Bild, seit v5.21), `hud.js` | `radio.test.js` |
| Wetter und Jahreszeiten | §7 „Wetter“ | `weather` | `weather.js` | `WX_*` | `weatherfx.js`, `season.js` | `weather.test.js`, `weatherfx.test.js` |
| Forschungsbaum (10 Stufen, 8 Äste, Warteschlange; Wirkung über `modOf`/`teamMod`, Fähigkeiten über `hasUnlock`) | §7 „Forschung“ | `RESEARCH` (js/data/research.js), `CITY.research` | `research.js`, `abilities.js` (Nebel, Minen, Selbstheilung) | `UPGRADES`, `UPGRADE_RESERVE` | `researchpanel.js` (Baum wie Civilization, Knopf „Forschung“ in `hud.js`), `controller.js` | `research.test.js` |
| Zufallskarte, Stadt, Gehöfte, Felder | §7, §9a | `map`, `zone.r`, `MAPGEN` | `map.js`, `landscape.js` | – | `terrain.js`, `ways.js` (Feldwege, Gleise, seit v5.31), `maptown.js` (Gebäude, Parks, Wachturm), `props.js` (Autos, Parkbänke, seit v5.43; Ballen seit v5.44), `fields.js` (Äcker und Weiden scharf, seit v5.44), `iso.js`, `isobuild.js` | `map.test.js`, `fields.test.js`, `props.test.js`, `fieldpaint.test.js`, `golden.test.js` (Referenzwerte je Seed) |
| Stadt (Gebiet, Zonen, Einwohner auch als Truppen, Flucht, Werke füllen Lager der Hauptstadt, Ausbildung in Kaserne/Fabrikhalle/Heliport, Heilen/Reparieren und Krankenhaus) | §15 | `CITY` (`care`) | `js/game/city/` (Module in ARCHITEKTUR §7: `query.js` `cityTrainers`, `trainerKind`, `care.js` `updateCare`/`careOf`, Ausbildung selbst in `economy.js`, `updateCity` (Strom, Zufriedenheit, Ketten und Pendler über Straßenwege, Gewerbe-Absatz; Wege und Stau in `transport.js`), `cityLevel`, `powerRatio`, `updateClaim`, `freePop`, `cityNoise`, `genDeposits`, `payMetal`, Befehle `city` und `trade`, Ziel-Entities `syncEntity`/`forEnemyCity`, Großbauten `CITY.size` mit `part`/`anchorOf`/`fitBig`); Ausbildung prüft in `game.js` (`cmdTrain`), Zielsuche und Splash in `combat.js` | `aiCity`, `aiRaid`, `aiDefend` in `js/ai/cityai.js`, aufgerufen von `ai.js` | `js/ui/citypanel.js` (Baumodus, Taste Y; Rechteck über `input.js`; Marktmenü `MarketPanel`), `hud.js` (Knopf, Geldanzeige öffnet den Markt, Info `cityInfo`), `controller.js` (Stadtgebäude wählen `pickCity`, Aktionen `cityCard`), `js/render/citylayer.js` (Karte, Gebiet, Schilder `drawCityBadges`), `isobuild.js` (`drawMilitaryTown`), `university.js` (Universität 3 × 3, ein Bild für alle Drehungen), `works.js` (Werke 2 × 2 seit v5.08 und Kraftwerk, je Art und Stufe ein gemaltes Bild seit v5.18; Hütte und Kerosin-Raffinerie seit v5.20), `townhouses.js` (alle 1 × 1-Gebäude je Art und Stufe, 2D und Iso, seit v5.17), `citysite.js` (Baustellen in fünf Bauabschnitten und Ruinen als Schutt, seit v5.45) mit `spritecache.js` (gemalte Bilder je Maßstab zwischengespeichert) und `isokit.js` (gemeinsame Bauteile für gemalte Gebäude, seit v5.18), `minimap.js` | `city.test.js`, `citysite.test.js`, `buildrules.test.js` (Baugebiet, seit v5.78) |
| Anschlusspflicht ans Straßennetz (Paket „Straßen“, Teil 1; mit Baugebiet) | §15 „Baugebiet“ | `CITY.build.needRoad`, `roadFree`; KI `CITY.ai.linkSpare`, `linkBm`, `linkTries`, `linkRetry`, `linkOutlets`, `chainNear` | `js/game/city/cells.js` (`roadLinked`, `roadLinkWhy`, Grund `road` in `buildWhy`/`BUILD_BLOCK`, Großbauten in `fitBig`) | `js/ai/cityai.js` (`extendNet`, `connectNear`, `keepsOutlets`, `CHAIN_PARTNER`) | Baumodus dunkle Zellen über `buildAllowed` (`js/render/citylayer.js`), Hilfe `js/ui/helptext.js` | `buildrules.test.js` |
| Stadtstraßen der Karte (Zonenstraßen, Brückenfahrbahnen; für beide Teams) | §7, §15 | `MAPGEN.town.block` | `roads.js` (`game.roads`, in der Stadt `c.mapRoads`, `roadAt`) | – | `citylayer.js` (`roadView`; Asphalt- und Plattenmuster aus `ways.js`), `bridge.js` (Fahrbahn) | `city.test.js` |
| Großbauten mit gerader Kante (Kraftwerk 2 × 2, Kaserne 4 × 4, Fabrikhalle 5 × 5) | §15 | `CITY.size` | `city/cells.js` (`bigSpan`, `bigCenter`, `bigCells`, `fitBig`), `city/create.js` (Startviertel `startQuarter`) | `aiNeed` in `ai/cityai.js` | `bigbuild.js` (Kaserne, Fabrikhalle: Boden, 2D, Iso je Körper; Ausstellungsstücke `show` mit `SHOWROOM`-Lackierung aus `unitpaint.js`, seit v5.40), Kraftwerk seit v5.18 in `works.js`, `citylayer.js` | `city.test.js`, `bigbuild.test.js` |
| Fliegerhorst und F-16 (seit v5.35: Bahn, Rollfeld (v5.37), Stellplatz, Tower, Kerosintank, Munitionslager; Rollen, Startlauf, Landung, Tanken, Befehl `land`) | §6, §15 | `CITY.air`, `BALANCE.jets`, `UNITS.f16` | `aircraft.js` (`runwaysOf`, `bestStrip`, `standRoute`, `updateAircraft`, `cmdLand`, `parkNew`, `trainCheck`, `parkedArmor`), Füllen der Lager `updateCity`/`transport.js` (`tr.depot`), Ausbau der Stellplätze `cmdCityUpgrade` in `city/commands.js` (seit v5.39), Ausbildung `economy.js` | `aiAirport` in `ai/cityai.js`, `jets()` in `ai/army/combat.js`, `CITY.ai.airportFrom`/`jets`, `JET_GROUP`, `JET_EVERY`, `JET_QUEUE` | `sprites.js` (`drawJet`), `airbase.js` (seit v5.42 gemalt: Stellplatz mit Überdachung und Shelter, Tower, Kerosintank, Munitionslager; Teile über `bigbuild.js`), `citylayer.js` (`drawAirfield`, Dächer über den Jets `drawCityRoofs`), `controller.js` (Staffel), `hud.js` | `airbase.test.js`, `airbasepaint.test.js` |
| Heliport als Landeplatz (seit v5.51: ein Hubschrauber je Heliport, Start und Landung senkrecht, Tanken aus Kerosintank/Munitionslager, Luftraumsperre mit Tower, Heimflug) | §15 | `CITY.air.heli` | `helipad.js` (`updateHelis`, `cmdHeliLand`, `landHeliNew`, `heliTrainCheck`, `padBusy`), Ausbildung `economy.js`, `land` in `game.js` | `pickProducer` in `ai/army/produce.js`, `CITY.ai.producers.heliport` | `iso.js` (`flying`, `unitLift`), `controller.js` (Landen L, Hubschrauber W), `hud.js` | `helipad.test.js` |
| Bagger (Befehl `dig`: Zonenstraßen, Bäume, Häuser, eigene Gebäude räumen) | §6 | `UNITS.excavator`, `BALANCE.excavator` | `excavator.js` (`cmdDig`, `updateDig`), `movement.js` (`onRoad`, `roads.dug`) | – | `unitpaint.js` (`excavator`), Staubwolke beim Arbeiten `drawDust` in `fx.js` (Quelle `smokeSources` in `renderer.js`, seit v5.77), `controller.js` (Baggern G) | `airbase.test.js`, `fx.test.js` |
| Ressourcenanzeige (Fluss Förderung → Werke → Lager, Verbrauch, Engpässe; „davon an Werken“ seit v5.70) | §15 „Ressourcenanzeige“ | `CITY.chain` | `flow.js` (`resourceFlow`, `flowLayout`, `FlowMeter`, `teamStock`, `atWorks` am Lagerknoten), Zahlen aus `updateCity` in `city/economy.js` (`c.stats.cap/inp/gross/n`, `c.made`, `c.traded`, `c.out`) | – | `js/ui/flowpanel.js` (Fenster, Knopf „Ressourcen“ in `hud.js`, `main.js` `toggleFlow`) | `flow.test.js`, `pickupai.test.js` |
| Straßentransport (Wege über Straßen zum nächsten Werk bzw. Lager, Kapazität und Stau, Pendler, Gewerbe-Absatz, Kerosin für F-16 und Hubschrauber) | §15 „Straßentransport“ | `CITY.transport`, `CITY.shop`, `CITY.care.refuel` | `transport.js` (`transportOf`, `nearestField`, `pathFrom`, `pathEff`, `addLoad`, `mainAccess`, `transportInfo`), Spuren `laneGrid` in `roads.js` (seit v5.38), Last und Stau in `updateCity` (`city/economy.js`), `connectRoad` in `city/roadnet.js`, `accessCells` in `city/cells.js` | `connectRoad` in `city/roadnet.js` (`aiCity`, `aiNeed` in `ai/cityai.js`) | `js/render/citylayer.js` (`drawLoads`, mehrspurige Straßen `laneMarks`, rotes Warnzeichen am Schild), `hud.js` (Info `cityInfo`: „Liefert an“, Pendler), `citypanel.js` (Leiste: Stau, ohne Weg), `flow.js` (Hinweise) | `transport.test.js`, `lanes.test.js`, `shop.test.js`, `cityprod.test.js` (KI-Städte erzeugen Stahl und Munition) |
| Wracks und Krater (nur Optik) | §9 | `scars` | `scars.js` | – | `fx.js` (`drawCrater`, `drawWreckRubble`, Ersatz `drawWreck`; Rauch, Feuer, Nebelwand, Minen), `unitpaint.js` (`drawWreckTop`, `drawWreckIso`), `isobuild.js` (`drawRubble`) | `scars.test.js`, `fx.test.js` |
| Tiere (nur Optik) | §9 | `animals` | `animals.js` | – | `nature.js` (gemalte 3D-Modelle seit v5.28), Ersatz `sprites.js` (`drawAnimal*`) | `animals.test.js`, `nature.test.js` |
| Natur: Bäume, Büsche, Felsen, Waldboden, Bodenbild der Vorkommen (nur Optik) | §7 „Natur“ | – | `map.js` (Lage), `renderer.js` (`buildDeco`: Waldbäume, Unterholz, Büsche, Geröll) | – | `nature.js`, `terrain.js` (`forestFloor`), `citylayer.js` (`drawDeposits`) | `nature.test.js` |
| KI allgemein | §10 | `difficulty` | – | `js/ai/ai.js` | – | `ai.test.js` |
| Karteneditor, gespeicherte Karten | §9a | – | `mapdata.js` | – | `js/editor/editor.js`, `editor.html`, `css/editor.css` | `mapdata.test.js` |
| Steuerung, Befehlskarte, HUD, Menüs, Hilfe (Befehlsregister `js/game/commands.js`, Modustabelle `MODES`, Hilfe aus Daten `helptext.js`, seit v5.63) | §8, §9 | – | `commands.js` | – | `controller.js`, `input.js`, `hud.js`, `menu.js`, `helptext.js`, `status.js` | `commands.test.js` |
| Anzeigen auf der Karte (Auswahlring, Hover, Auswahlrahmen, Balken über den Einheiten, Heilkreuz, Kommandeursstern, Warnzeichen, Wegziel, Sammelpunkt, LKW-Routen; nur Bild) | §9 „Aussehen der Anzeigen auf der Karte“ | – | – | – | `marks.js` (gemalt seit v5.50, Bilder über `spritecache.js`), aufgerufen aus `renderer.js` (`drawSelectRing`, `drawDragBox`, `drawHp`, `drawSupply`, `drawCare`, `drawMoveMarker`, `drawRally`, `drawRoutes`) und `sprites.js` (`drawBar`, `drawStar`) | `marks.test.js` |
| Kamera, Iso-Ansicht, Minimap | §9 | – | – | – | `camera.js`, `iso.js`, `renderer.js`, `minimap.js` | – |
| Ton (Waffen, Einschläge, Wetter, Meldungen; synthetisiert, Schalter), Musik (ruhig/Gefecht) und Lautstärkeregler | §14 | – | – (liest `game.effects`, Hinweis `snd` aus `addEffect`) | – | `js/audio/sound.js`, `js/audio/music.js`, `main.js`, `hud.js` (Knopf), `menu.js` (Regler Startmenü und Pausenmenü) | `sound.test.js`, `music.test.js` |
| Spielstand speichern und laden (IndexedDB und Webspace, Format `SAVE_FORMAT`) | §16 | `SAVE_FORMAT` (`savegame.js`) | `savegame.js`, `snapshot.js` | – | `js/ui/saves.js` | `save.test.js` |
| Lichtstimmung (nur Optik, Menü „Licht“) | §7 „Wetter und Jahreszeiten“ | `MOOD_SETTINGS`, `MOODS` (`js/render/mood.js`) | – | – | `js/render/mood.js` | `mood.test.js` |
| Offline, Installation | §11 | – | – | – | `sw.js`, `manifest.json`, `icons/` | `assets.test.js` |
