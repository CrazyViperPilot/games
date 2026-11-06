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
| 3a | `updateCity` | `city.js` | nur mit Stadt: Einwohner, Wachstum, Steuern und Gewerbe-Absatz; Ketten (Förderung → Hütte → Stahlwerk/BM/Raffinerien/Kerosin → Lager, Munitionswerk holt Stahl) und Pendler laufen über die Straßenwege aus `transport.js`: `beginLoads` (Last auf 0), Flüsse und Pendler eintragen (`addLoad`), Gutschrift mit der Wirkung des Weges (`pathEff`), `settleLoads` (Stau glätten, wirkt im nächsten Schritt). Wege werden nur neu gerechnet, wenn sich die Stadt ändert (`c.ver`, auch bei Flucht und Rückkehr der Bewohner), der geglättete Stau-Faktor je Zelle liegt in `c.congestion` (gespeichert) |
| 4 | `updateGarrison`, `updateTowers` | `garrison.js`, `tower.js` | Ein- und Aussteigen in Stadthäuser und Gefechtstürme; Dachaufbauten werden fertig |
| 5 | `updateFormations` | `formation.js` | Tempo geschlossener Gruppen |
| 6 | `updateMovement` | `movement.js` | Wege planen und fahren, Verfolgen (ohne Jets) |
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

**Stadt** (`game.city[team]`, nur mit Stadt, `js/game/city.js`): Raster `cols, rows, cell`, je Zelle `kind[]` (Index in `KINDS`), `level[]`, `deposit[]`, `flee[]`, `blocked[]`, `felled`, `list` (belegte Zellen), `ver` (Zähler: steigt bei jeder Änderung an Zellen, Wege werden dann neu gerechnet), `hitLog`, `mapRoads` (Stadtstraßen der Karte). Vorräte im Stadtlager: `metal` (Stahl, Schlüssel bleibt `metal`), `kero` (Kerosin, seit v5.20). `stats` ist nur Anzeige: je Schritt neu gesetzt (Ausbeute `raw`, `cap`, `inp`, `gross`, `n`, Gewerbe-Versorgung `shopSupply`, `lost` = Waren ohne Weg je s, `jam` = kleinster Stau-Faktor).
**Straßentransport** (`transportOf(game, c)` in `js/game/transport.js`, seit v5.20): Zustand je Stadtobjekt in einer `WeakMap` (`STATE`). Er enthält `routes` (Lieferweg je Förderung und Werk: Ziel, Weg, Länge), `depot` (Wege zu Kerosintank und Munitionslager, seit v5.35), `commute` (Pendlerweg je Arbeitsstätte, `null` = keine Wohnung), `mun` und `shop` (Wege Munitionswerk bzw. Gewerbe und Markt zum Lager), `load`, `factor`, `cap` je Stadtzelle und `list` (Straßenzellen). Der Zustand liegt nicht im Objektgraphen und damit nicht im Spielstand; nach dem Laden wird er beim ersten Zugriff neu berechnet.

**Effekt** (nur Darstellung, `game.effects`): `{ type, x, y, x2, y2, team, t, life }`, angelegt mit `game.addEffect`.

**Ereignis** (`game.events`): `{ type: 'message', team (−1 = alle), text, x, y }`.

## 6. Befehle (`game.issue(team, cmd)`)

Antwort immer `{ ok: true, … }` oder `{ ok: false, reason: 'deutscher Text' }`. `ids` = Liste eigener Einheiten.
Neue Befehle: Rezept in [CLAUDE.md](CLAUDE.md).

| `cmd.type` | Felder | Handler (`js/game/`) | Wirkung |
|---|---|---|---|
| `city` | `kind` (Zellenart aus `KINDS`, Register `js/data/citykinds.js`, z. B. `road`, `res`, `com`, `market`, `barracks`, `factory`, `heliport`, `smelter`, `kero`, oder `erase`), `c0, r0, c1, r1`, bei `erase` optional `demolish: true` | `city.js` `cmdCity` | Stadtzellen im Rechteck ausweisen oder räumen (nur mit Stadt). `erase` lässt Rohstoffvorkommen und Förderanlagen stehen (seit v5.20); nur mit `demolish: true` (Abreißen eines gewählten Gebäudes) entfernt es eine Förderanlage |
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
| `land` | `ids, airportId` | `aircraft.js` `cmdLand`, Heliport als Ziel `helipad.js` `cmdHeliLand` (seit v5.51) | Flugzeuge landen am Fliegerhorst des eigenen Stellplatzes `airportId` (seit v5.35; Anflug, Bahn, Ausrollen, Rollen zum Stellplatz; seit v5.15) |
| `cityUpgrade` | `buildingId` | `city.js` `cmdCityUpgrade` | Stellplatz eine Stufe ausbauen (Überdachung, Stahlbeton-Shelter) gegen Geld, BM und Stahl (seit v5.39) |
| `dig` | `ids, c0, r0, c1, r1, append?` | `excavator.js` `cmdDig` | Bagger räumen die Zellen des Rechtecks nacheinander (Zonenstraße, Bäume, Häuser, eigene Gebäude; seit v5.35) |
| `storm`, `fortifyHouse` | `ids, houseId` (Sturm) / `houseId, work` (ausbauen) | `garrison.js` `cmdStorm`, `cmdFortifyHouse` | Besetztes gegnerisches Haus stürmen / ein eigenes Haus zur Stellung ausbauen |
| `trade` | `good` (`bm`, `mun`, `fuel`, `metal`, `kero`), `dir` (`sell`, `buy`) | `city.js` `cmdTrade` | Ein Los am eigenen Markt handeln (nur mit fertigem Markt) |
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
| `game.js` | Klasse `Game`: Zustand, `issue`, Platzierung (`canPlace`), Lager, Spawn, Aufräumen, Sieg |
| `entities.js` | `createUnit`, `createBuilding`, `createShell`, Hilfen wie `isFoe`, `inRange` |
| `economy.js` | Ausbildung, Nachschub, Einkommensanzeige |
| `zone.js`, `hotzone.js` | Konfliktzone und Punkte; Hot Zone und Bohrer |
| `movement.js`, `pathfinding.js`, `grid.js`, `formation.js` | Bewegung, A*-Wegsuche, Zellenraster, Formationen |
| `combat.js` | Zielsuche, Direktfeuer, Mörser, Flugabwehr, Schaden |
| `logistics.js`, `construction.js` | LKW, Nachfüllen, Transport; Bauen und Reparieren |
| `city.js` (Daten `js/data/city.js`, UI `js/ui/citypanel.js`, Karte `js/render/citylayer.js`) | Zonenstadt um die Hauptstadt (PRD §15), Befehl `city`; Stadtgebäude belegen `grid.struct` mit `city.gridId`; fertige Gebäude haben seit v4.83 eine Ziel-Entity (`kind: 'building'`, `type: 'city'`, nicht in `game.buildings`), die der Spieler seit v4.94 wählen kann. Seit v5.20: `accessCells` (Straßenzellen am Gebäude, mit Kette), `connectRoad` (Anschluss an das Lagernetz oder ein Ziel, für Startviertel und KI), `updateCity` rechnet die Ketten über `transport.js` |
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

`js/ai/ai.js` – Klasse `AI`: `update(dt)` ruft im Takt `BALANCE.difficulty.<stufe>.think` die Methode `think()`; Werte aus `js/data/ai.js` und `BALANCE.difficulty`.

`js/render/` (Zeichnen, liest nur)

| Datei | Inhalt |
|---|---|
| `renderer.js` | Klasse `Renderer`: zeichnet alles in 2D oder isometrisch, Nebel, Overlays. Nebel seit v5.49: `fogData` liefert dem WebGL-Nebel je Zelle Sicht und Erkundet weichgezeichnet (`blur121`), Iso und 2D zeichnen ihn über `ground.renderFog`; ohne WebGL und für die Minimap `updateFogLayer` (weich, Wolkentöne `fogTone` über eine Farbtabelle, Minimap ohne Wolken) |
| `camera.js` | Ausschnitt, Zoom, Welt ↔ Bildschirm, Iso-Umrechnung |
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

`js/ui/` – `controller.js` Auswahl, Modi, Befehlskarte (kein DOM, ruft `game.issue`), `input.js` Maus/Tastatur/Touch,
`hud.js` DOM-Anzeige, `menu.js` Start-, Pause-, Hilfe- und Endbildschirm, `status.js` lesende Texthilfen.

`js/audio/sound.js` – Ton (PRD §14): synthetisiert per WebAudio, liest `game.effects` (Hinweis `snd`), Meldungen und Wetter; `main.js` hält ein `Sound` für alle Partien.

`js/editor/editor.js` + `editor.html` – Karteneditor; speichert Karten über `js/game/mapdata.js` im `localStorage`.

Sonstiges: `sw.js` Service Worker (network-first, Präfix `frontline-`), `manifest.json`, `css/`, `icons/` (seit v5.43 keine weiteren Bilddateien, alles gemalt),
`tools/doc-tables.mjs` (erzeugt die Wertetabellen in PRD §6, `npm run docs`),
`test/` (node --test; `config.test.js` prüft die Config, `doctables.test.js` die PRD-Tabellen).

## 8. Spielstand
`core/snapshot.js` wandelt einen Objektgraphen (Maps, Sets, Typed Arrays, Zyklen, Klasseninstanzen, `makeRng`-Zustand) in JSON und zurück; `game/savegame.js` meldet Klassen (`CLASSES`) und feste Spieldaten (`STATICS`: nur Verweise) an und bietet `snapshotGame` / `restoreGame`. `ui/saves.js` speichert in IndexedDB und auf dem Webspace (PHP `frontline/api.php` im Repo vipervocs), `main.js` ruft es auf (`captureSave`, `resumeGame`). Regeln und Pflege: PRD §16.
