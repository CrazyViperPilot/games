# Frontline – Architektur & Umsetzungsplan

Anforderungen: `PRD.md`. Vanilla JS (ES-Module, `import … from './x.js'` immer mit Endung), Canvas 2D, kein Build,
keine externen Dateien/CDNs/Fonts. Desktop-Chrome, Maus + Tastatur. Alle Texte deutsch.

**Grundprinzip:** Die Simulation (`js/data`, `js/core/rng.js`, `js/game`, `js/ai`) kennt kein DOM/`window` und läuft in
Node (`node --test`). Spieler-UI und KI steuern das Spiel ausschließlich über `game.issue(team, cmd)`.

---

## 1. Dateistruktur

```
frontline/
  index.html  manifest.json  sw.js  README.md  PRD.md  PLAN.md  package.json
  css/style.css
  icons/icon.svg  (PNG-Icons erzeugt Opus im Review)
  js/
    main.js               Bootstrap (DOM): Menü, Spiel erzeugen, Loop, URL-Parameter, SW registrieren
    core/rng.js           makeRng(seed)
    core/loop.js          createLoop (DOM: requestAnimationFrame)
    data/balance.js       BALANCE (alle globalen Zahlen)
    data/units.js         UNITS
    data/buildings.js     BUILDINGS
    game/map.js           generateMap(seed)
    game/grid.js          class Grid
    game/pathfinding.js   findPath, lineOfSight
    game/entities.js      createUnit, createBuilding, createShell
    game/game.js          class Game (Zustand, issue, Platzierung, Spawn, Aufräumen, Sieg)
    game/economy.js       updateEconomy (Bau, Produktion, Einkommen)
    game/movement.js      updateMovement
    game/combat.js        updateCombat
    game/zone.js          updateZone
    game/fog.js           class Fog
    ai/ai.js              class AI
    render/camera.js      class Camera
    render/terrain.js     buildTerrain(map)
    render/sprites.js     Zeichenfunktionen
    render/renderer.js    class Renderer
    render/minimap.js     class Minimap
    ui/controller.js      class Controller (Auswahl, Modi, Befehlskarte)
    ui/input.js           class Input (DOM-Events → Controller/Camera)
    ui/hud.js             class Hud (DOM-HUD)
    ui/menu.js            Menüs (Start, Pause, Hilfe, Ende)
  test/*.test.js          node --test
```

## 2. Koordinaten

- Welt in px: Karte `4800 × 4800`, Raster `TILE = 32` → `150 × 150` Zellen. Zelle `(c, r)`, Index `r * cols + c`.
- Winkel in Radiant, 0 = +x. Geschwindigkeiten px/s, Zeiten in Sekunden.
- Gebäude belegen ein Rechteck aus Zellen `cx, cy` (links oben), Größe `w × h`; `x, y` = Weltmittelpunkt.
- Team 0 = Blau (Spieler), Team 1 = Rot (KI). Farben: Blau `#3d8bfd`, Rot `#e5484d`.

## 3. Daten (`js/data/`) – verbindliche Werte

### 3.1 `balance.js` → `export const BALANCE`

```js
{
  map: { width: 4800, height: 4800, tile: 32 },
  tickRate: 20,                       // Simulationsschritte/s
  winPoints: 100, pointInterval: 30,
  startRes: { money: 400, bm: 500, mun: 150, fuel: 150 },
  startUnits: ['truck', 'rifleman', 'rifleman', 'rifleman', 'rifleman'],
  zone: { r: 1100, controlIncome: 12, unitIncome: 0.5, unitIncomeCap: 30 },
  fob: { buildRadius: 450, minDistOwn: 500, minDistEnemy: 700, max: 6, income: 2 },
  queueMax: 5,
  demolishRefund: 0.25,
  scanInterval: 0.25,                 // Zielsuche
  fogInterval: 0.25,
  leash: 300,                         // Idle-Einheiten verfolgen max. so weit vom Ankerpunkt
  difficulty: {
    easy:   { think: 3.0, incomeMult: 0.8,  attackStrength: 2500 },
    normal: { think: 2.0, incomeMult: 1.0,  attackStrength: 2000 },
    hard:   { think: 1.0, incomeMult: 1.25, attackStrength: 1600 },
  },
  resNames: { money: 'Geld', bm: 'Baumaterial', mun: 'Munition', fuel: 'Treibstoff' },
  teamNames: ['Blau', 'Rot'], teamColors: ['#3d8bfd', '#e5484d'],
}
```

### 3.2 `units.js` → `export const UNITS`

Felder je Typ: `name, armor ('inf'|'light'|'heavy'), hp, speed, radius, sight, range, cooldown, damage {inf, light, heavy, struct}`
(bei unbewaffnet `range: 0, damage: null`), `cost {money, bm, mun, fuel}` (fehlende Schlüssel = 0), `buildTime, producedAt, hotkey`.

| key | name | armor | hp | speed | radius | sight | range | cd | dmg inf/light/heavy/struct | cost | time | at | key |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rifleman | Schütze | inf | 100 | 45 | 6 | 260 | 200 | 1.0 | 12/3/1/4 | money 60, mun 15 | 8 | fob | Q |
| at | Panzerabwehrsoldat | inf | 90 | 40 | 6 | 260 | 240 | 3.0 | 10/90/120/60 | money 120, mun 40 | 12 | fob | W |
| truck | LKW | light | 250 | 110 | 10 | 220 | 0 | – | – | money 80, fuel 40 | 10 | fob | E |
| ifv | Schützenpanzer | light | 450 | 85 | 12 | 300 | 240 | 0.5 | 14/18/4/10 | money 250, mun 50, fuel 80 | 20 | depot | Q |
| tank | Kampfpanzer | heavy | 1100 | 60 | 15 | 320 | 300 | 2.5 | 45/120/150/120 | money 500, mun 100, fuel 150 | 35 | depot | W |

### 3.3 `buildings.js` → `export const BUILDINGS`

Felder: `name, w, h (Zellen), hp, sight, cost, buildTime, hotkey (im Baumenü), produces: [unitKeys]`, optional
`weapon {range, minRange, cooldown, damage {inf,light,heavy,struct}, splash, shell}`, `aa {range, cooldown, chance}`,
`yields` (nur extractor), `buildable` (false für fob → nur per LKW), `blocksAll`, `gate`.

| key | name | w×h | hp | sight | cost | time | hotkey | Besonderes |
|---|---|---|---|---|---|---|---|---|
| fob | FOB | 3×3 | 2500 | 450 | bm 400 | 30 | – | produces rifleman, at, truck; weapon range 220, cd 0.6, dmg 12/4/1/4; buildable false |
| depot | Fahrzeughalle | 3×3 | 1500 | 250 | bm 300 | 25 | Q | produces ifv, tank |
| extractor | Förderanlage | 2×2 | 600 | 200 | bm 100 | 15 | W | `yields: { bm: 3, mun: 2, fuel: 2 }` (Rate der Sorte des Vorkommens /s) |
| wall | Mauer | 1×1 | 600 | 0 | bm 8 | 2 | E | blockiert alle |
| gate | Tor | 1×1 | 800 | 0 | bm 25 | 4 | R | `gate: true`, eigene Einheiten passieren |
| mortar | Mörser | 2×2 | 700 | 300 | bm 200, mun 60 | 20 | T | weapon range 800, minRange 200, cd 4, dmg 60/50/25/80, splash 60, shell: true (Flugzeit = Distanz/300) |
| aa | Flugabwehr | 2×2 | 700 | 300 | bm 180, mun 40 | 18 | Z | aa {range 350, cooldown 0.6, chance 0.7}; weapon range 260, cd 0.4, dmg 10/12/2/4 |

Rüstung aller Gebäude = `'struct'`.

## 4. Datenmodelle (Vertrag zwischen allen Paketen)

```js
// Team
{ id, name, color, res: {money, bm, mun, fuel}, income: {money, bm, mun, fuel} /* geglättete Rate/s für HUD */,
  points, pointProgress /* 0..30 */, incomeMult: 1, isAI: false }

// Unit
{ id, kind: 'unit', type, team, def /* UNITS[type] */, x, y, angle, hp, maxHp, alive: true,
  order: { type: 'idle'|'move'|'attackMove'|'attack'|'buildFob', x, y, targetId },
  path: [{x, y}], pathIndex: 0, targetId: null, cooldown: 0, scanTimer: 0, anchorX, anchorY,
  lastHitTime: -1e9 }

// Building
{ id, kind: 'building', type, team, def /* BUILDINGS[type] */, x, y, cx, cy, w, h, hp, maxHp, alive: true,
  built: false, progress: 0 /* 0..1 */, queue: [unitType], queueTime: 0, rallyX, rallyY,
  targetId: null, cooldown: 0, aaCooldown: 0, scanTimer: 0, nodeId: null, lastHitTime: -1e9 }

// Mörsergranate (game.projectiles)
{ id, team, sx, sy, tx, ty, x, y, t: 0, duration, damage /* {inf,…} */, splash, alive: true }

// Effekt (nur Darstellung, game.effects; Game altert und entfernt sie)
{ type: 'tracer'|'shell'|'explosion'|'intercept'|'muzzle', x, y, x2, y2, t: 0, life, team }

// Ereignis (game.events, UI holt mit drainEvents())
{ type: 'message', team /* Empfänger, -1 = alle */, text, x, y }
```

IDs: fortlaufende Ganzzahlen ab 1 (`game.nextId++`), 0 bedeutet „keins“.

## 5. Modul-Schnittstellen (verbindlich)

### core
- `rng.js`: `export function makeRng(seed)` → `{ next() /*[0,1)*/, range(a, b), int(a, b) /*inkl.*/, pick(arr) }` (mulberry32).
- `loop.js`: `export function createLoop({ update(dt), render(), tickRate = 20 })` → `{ start(), stop(), speed, paused }`.
  Feste Schrittweite `1/tickRate`; pro Frame `elapsed * speed` akkumulieren, max. 10 Schritte/Frame; bei `paused` keine Updates, aber rendern.

### game
- `map.js`: `export function generateMap(seed)` → `{ width, height, tile, obstacles: [{x, y, r}], nodes: [{id, type: 'bm'|'mun'|'fuel', x, y}], spawns: [{x, y}, {x, y}], zone: {x, y, r} }`.
  Spawns `(600, 4200)` und `(4200, 600)`, Zone in der Mitte. Punktsymmetrisch: jedes Feature `(x, y)` bekommt Partner `(W−x, H−y)`.
  Je Spawn je ein Vorkommen jeder Sorte in 220–380 px Abstand, Winkel ≥ 60° auseinander, Richtung Kartenmitte gestreut.
  Zusätzlich 6 Paare verteilt (Sorten reihum), davon 2 Paare innerhalb der Zone. Vorkommen ≥ 250 px voneinander.
  ~14 Hindernispaare (Felsen/Wald), r 60–180, Abstand ≥ 600 zu Spawns, ≥ r + 90 zu Vorkommen, ≥ 300 zur Zonenmitte.
  Danach Zusammenhang prüfen (`findPath` Spawn0→Zonenmitte und Spawn0→Spawn1 nicht leer), sonst mit `seed + 1` neu (max. 20×).
  Vorkommen-IDs 1..n.
- `grid.js`: `export class Grid { constructor(cols, rows, tile) }` mit
  `terrain: Uint8Array` (1 = Hindernis), `struct: Int32Array` (Gebäude-ID oder 0), `gateTeam: Int8Array` (−1 oder Team);
  `idx(c, r)`, `inBounds(c, r)`, `toCell(v)` (= `Math.floor(v / tile)`), `center(c)` (= `c * tile + tile / 2`),
  `passable(c, r, team)` (im Feld, kein Terrain, und `struct == 0` oder `gateTeam == team`),
  `free(c, r)` (im Feld, kein Terrain, kein Gebäude), `rasterizeObstacles(obstacles)` (Zelle blockiert, wenn Zellmitte im Kreis),
  `occupy(b)` / `release(b)` (setzt/löscht `struct` und bei Toren `gateTeam` für den Fußabdruck).
- `pathfinding.js`:
  `export function findPath(grid, sx, sy, tx, ty, team, maxNodes = 20000)` → Array von Wegpunkten `{x, y}` in Weltkoordinaten
  ohne Start; letzter Punkt = exaktes Ziel, falls dessen Zelle passierbar, sonst Mitte der erreichbaren Zelle, die dem Ziel am nächsten ist.
  `[]` wenn Start- = Zielzelle oder nichts erreichbar. A*, 8 Nachbarn, diagonal nur wenn beide Orthogonalen passierbar, Oktil-Heuristik,
  Binärheap. Startzelle gilt immer als passierbar. Ergebnis per `lineOfSight` geglättet (String-Pulling).
  `export function lineOfSight(grid, x0, y0, x1, y1, team)` → bool (Zellen-Raycast, auch Ecken prüfen).
- `entities.js`: `createUnit(id, type, team, x, y)`, `createBuilding(id, type, team, cx, cy, tile)` (setzt `x, y` aus Zellen,
  `hp = maxHp * 0.1`, `built = false`, `rallyX/Y` = 2 Zellen unter dem Gebäude), `createShell(id, team, sx, sy, tx, ty, def)`.
  Reine Fabriken, kein Zugriff auf Game.
- `game.js`: `export class Game`
  - `constructor({ seed = 1, winPoints = BALANCE.winPoints } = {})`: Karte, Grid (Hindernisse rasterisiert), 2 Teams,
    je Team fertige FOB (`built = true`, volle HP) zentriert auf Spawn und Startunits um die FOB. Felder:
    `seed, rng, map, grid, time, teams, entities (Map id→Entity), units [], buildings [], projectiles [], effects [], events [],
    winner (null|0|1), winReason, winPoints, zone {x, y, r, owner: -1, contested: false, counts: [0, 0]}, fog [Fog, Fog], nextId`.
  - `update(dt)`: wenn `winner !== null` nur Effekte altern. Sonst `time += dt` → `updateEconomy` → `updateMovement` →
    `updateCombat` → `updateZone` → Fog alle `fogInterval` → Effekte altern → Tote entfernen (Gebäude: `grid.release`,
    Explosion-Effekt, Ereignis) → Siegprüfung (Eliminierung: Team ohne FOB (auch unfertige zählen) und ohne LKW verliert).
  - `issue(team, cmd)` → `{ ok: true }` oder `{ ok: false, reason: '…' }` (deutscher Text). Befehle:
    - `{ type: 'move', ids, x, y }`, `{ type: 'attackMove', ids, x, y }` – nur eigene lebende Einheiten; Formationsziel:
      Einheiten auf ein Raster um `(x, y)` verteilen (Abstand 24 px, sortiert nach Entfernung), je Einheit `findPath`.
    - `{ type: 'attack', ids, targetId }` – Ziel muss gegnerisch und lebendig sein.
    - `{ type: 'stop', ids }` → idle, Anker = aktuelle Position.
    - `{ type: 'build', building, x, y }` – `canPlace` muss ok sein; Kosten abziehen; Baustelle anlegen, `grid.occupy`.
    - `{ type: 'buildWall', building: 'wall'|'gate', x1, y1, x2, y2 }` – Zellen per Bresenham zwischen den Punkten,
      ungültige Zellen überspringen, nur so viele wie bezahlbar; `ok` wenn ≥ 1 gebaut, `count` im Ergebnis.
    - `{ type: 'buildFob', truckId, x, y }` – `canPlace(team, 'fob', x, y)` muss ok und Kosten bezahlbar sein (Abzug erst beim Errichten);
      LKW bekommt `order.type = 'buildFob'` und fährt hin. Am Ziel (≤ 48 px): erneut prüfen, Kosten abziehen, LKW entfernen, Baustelle.
      Scheitert die Prüfung, Ereignis mit Grund und LKW wird idle.
    - `{ type: 'train', buildingId, unit }` – eigenes fertiges Gebäude, `unit` in `def.produces`, Queue < `queueMax`, bezahlbar.
    - `{ type: 'cancelTrain', buildingId }` – letzten Queue-Eintrag entfernen, voll erstatten.
    - `{ type: 'rally', buildingId, x, y }`, `{ type: 'demolish', buildingId }` (Erstattung `demolishRefund * cost.bm`, Gebäude stirbt).
  - `canPlace(team, type, x, y)` → `{ ok, reason, cx, cy, x, y }`: Fußabdruck so, dass `(x, y)` die Mitte ist
    (`cx = toCell(x) - floor(w/2)`), alle Zellen `free`, nicht auf Einheiten anderer Teams.
    Nicht-FOB: Mittelpunkt in `buildRadius` einer eigenen **fertigen** FOB. Extractor: ein Vorkommen liegt im Fußabdruck
    (Abstand Vorkommen–Mitte ≤ 32) und dort steht noch keine Förderanlage → Mitte auf das Vorkommen schnappen. Andere Gebäude:
    nicht auf ein Vorkommen (Abstand > 48). FOB: Abstände `minDistOwn` zu eigenen FOBs, `minDistEnemy` zu gegnerischen Gebäuden,
    `max` FOBs (inkl. Baustellen), kein Bauradius nötig.
  - `canAfford(team, cost)`, `pay(team, cost)`, `refund(team, cost, factor = 1)`.
  - `spawnUnit(type, team, x, y)` → Unit (in `entities` + `units`), `getEntity(id)`, `nodeAt(x, y)` → Vorkommen oder null.
  - `query(x, y, r, filter?)` → lebende Entities, deren Mittelpunkt im Kreis liegt (Gebäude: plus halbe Größe).
  - `isVisible(team, x, y)`, `isExplored(team, x, y)` (über `fog[team]`).
  - `drainEvents()` → Array und leeren. `message(team, text, x, y)` legt Ereignis an.
- `economy.js`: `export function updateEconomy(game, dt)`:
  Baustellen: `progress += dt / buildTime`, `hp += maxHp * 0.9 * dt / buildTime`; bei 1 → `built = true`, Ereignis „X fertig“.
  Produktion (nur fertige Gebäude): erster Queue-Eintrag, `queueTime += dt`; bei `buildTime` → Einheit an freier Stelle am
  unteren Rand spawnen, Bewegung zum Sammelpunkt, Ereignis „X bereit“. Einkommen pro Team (× `incomeMult`): fertige FOBs
  `fob.income` Geld/s, fertige Förderanlagen `yields[node.type]` von ihrer Sorte. `team.income` = Rate (exponentiell geglättet),
  Zonen-Geld kommt aus `zone.js` und wird ebenfalls in `income.money` eingerechnet.
- `movement.js`: `export function updateMovement(game, dt)`: Wegpunkte abfahren (`speed * dt`), `angle` zur Bewegungsrichtung.
  Ist die nächste Wegpunktzelle nicht mehr passierbar → neu planen. Pfad zu Ende → `move` wird `idle` (Anker = Position),
  `attackMove` wird `idle`. Trennung: überlappende Einheiten (Abstand < r1 + r2) auseinanderschieben (räumliches Hash-Gitter
  128 px), nie in unpassierbare Zellen schieben; steckt eine Einheit in einer unpassierbaren Zelle, zur nächsten freien Zelle schieben.
  `attack`: liegt Ziel außerhalb der Reichweite, Pfad zum Ziel (neu planen höchstens alle 1 s).
- `combat.js`: `export function updateCombat(game, dt)`:
  Zielsuche alle `scanInterval` für Einheiten mit Order `idle`/`attackMove` und bewaffnete fertige Gebäude: nächster sichtbarer Gegner
  in `sight` (Einheiten); Gebäude nur wenn keine Einheit, Mauern/Tore nie automatisch. `move` greift nie automatisch an.
  `attack`: Ziel aus Order. Idle-Einheiten verfolgen bis `leash` vom Anker, dann zurück. In Reichweite: stehen bleiben, feuern
  wenn `cooldown <= 0`. Direktfeuer = sofortiger Schaden `damage[ziel.armor]` (Gebäude → `struct`), Effekt `tracer`
  (Panzer/PAK: `shell` + kleine `explosion`). Mörser: `minRange ≤ d ≤ range`, Ziel muss für das Team sichtbar sein, erzeugt Granate.
  Granaten fliegen linear; Flugabwehr (fertig, Team ≠ Granate, Granate in `aa.range`, `aaCooldown <= 0`) fängt mit `chance` ab
  (`rng`, Effekt `intercept`). Einschlag: Flächenschaden mit linearem Abfall über `splash` an alle **gegnerischen** Entities,
  Effekt `explosion`. Getroffene setzen `lastHitTime`; trifft es ein Gebäude oder eine Einheit innerhalb `buildRadius` einer
  eigenen FOB und liegt die letzte Warnung > 20 s zurück → Ereignis „Basis wird angegriffen“. HP ≤ 0 → `alive = false`.
- `zone.js`: `export function updateZone(game, dt)`: `counts[t]` = lebende Einheiten von t in der Zone. `owner` = Team mit
  Einheiten, wenn das andere 0 hat; sonst −1, `contested = beide > 0`. Owner: `money += controlIncome * dt * incomeMult`,
  `pointProgress += dt`; je volle `pointInterval` → `points++` + Ereignis „Punkt für Blau/Rot“.
  Alle Teams: `money += min(count, cap) * unitIncome * dt * incomeMult`. `points >= winPoints` → `winner`, `winReason = 'points'`.
- `fog.js`: `export class Fog { constructor(width, height, cell = 64) }` mit `visible: Uint8Array`, `explored: Uint8Array`,
  `update(game, team)` (alle eigenen lebenden Entities mit `sight` – Baustellen sight 150 – markieren), `isVisible(x, y)`, `isExplored(x, y)`, `revealAll()`.

### ai
- `ai.js`: `export class AI { constructor(game, team, difficulty = 'normal') }` setzt `game.teams[team].isAI = true` und
  `incomeMult`. `update(dt)` denkt alle `think` Sekunden, nutzt **nur** `game.issue` und Lesezugriffe. Verhalten (Prioritätsliste):
  1. Verteidigung: gegnerische Einheiten im Bauradius einer eigenen FOB → alle Kampfeinheiten in der Nähe (≤ 900) `attackMove` dorthin.
  2. Förderanlagen auf allen freien Vorkommen im eigenen Bauradius (Baumaterial zuerst).
  3. Fahrzeughalle, sobald 2 Förderanlagen stehen; zweite Halle ab 3 FOBs (schwer).
  4. Produktion: FOB-Queue ≤ 2, Halle-Queue ≤ 2; Mischung ~ 50 % Schützen, 20 % PAK, 20 % SPz, 10 % KPz (wenn Halle).
     Ziel: immer 1 LKW (max. 2).
  5. Expansion: LKW → FOB an der Position, die Zone-nah ist (Zonenrand Richtung eigene Basis) bzw. an freien Vorkommen
     (Positionen per `canPlace` prüfen, Kandidaten auf Kreisen um Ziel testen). Max. 4 FOBs (leicht 2).
  6. Verteidigung bauen: je FOB nahe der Zone 1 Mörser + 1 Flugabwehr (nicht auf leicht), ein paar Mauerstücke vor der Haupt-FOB
     Richtung Zone (normal/schwer).
  7. Armee: Kampfeinheiten sammeln am Sammelpunkt Richtung Zone; Summe `cost.money` der idle Armee ≥ `attackStrength` (oder Zone
     unbesetzt und ≥ 60 %) → `attackMove` in die Zone (Ziel: Zonenmitte bzw. Schwerpunkt gegnerischer Einheiten in der Zone).
     Einheiten, die in der Zone idle sind, bleiben dort verteilt (Positionen auf Kreis r 400).
  Fehlgeschlagene `issue`-Aufrufe sind normal (kein Absturz, keine Endlosschleife).

### render (DOM)
- `camera.js`: `export class Camera { constructor(mapW, mapH) }` mit `x, y` (Weltmitte im Bild), `zoom` (0.35–1.6), `viewW, viewH`;
  `resize(w, h)`, `worldToScreen(x, y)`, `screenToWorld(sx, sy)` (→ `{x, y}`), `pan(dxScreen, dyScreen)`,
  `zoomAt(factor, sx, sy)` (Punkt unter Maus bleibt fest), `centerOn(x, y)`, `clamp()`, `visibleRect()` → `{x0, y0, x1, y1}`.
- `terrain.js`: `export function buildTerrain(map)` → OffscreenCanvas/`canvas` in Maßstab 1/4 mit Bodenrauschen
  (deterministisch aus Seed), Hindernissen (Felsen grau, Wald dunkelgrün), dezentem Raster.
- `sprites.js`: `drawUnit(ctx, u, color, zoom)`, `drawBuilding(ctx, b, color, zoom)`, `drawNode(ctx, node)`, `drawShell(ctx, s)`,
  `drawEffect(ctx, e)` – prozedural von oben: Infanterie = Punkt mit Waffe, PAK mit Rohr, LKW = Rechteck mit Kabine,
  SPz/KPz = Wanne + drehbarer Turm (zeigt zum Ziel, sonst Fahrtrichtung). Gebäude: Grundplatte, Symbol/Kürzel, Baufortschritt
  als Gerüst/Balken. Vorkommen farbig: Baumaterial braun, Munition gelb, Treibstoff schwarz-violett.
- `renderer.js`: `export class Renderer { constructor(canvas, game, camera, team) }`, `resize()` (DPR ≤ 2), `render(view)`.
  Reihenfolge: Terrain (skaliert), Zone (Kreis, Füllung in Owner-Farbe 12 %, gestrichelt wenn umkämpft), Vorkommen, Bauradien
  (wenn `view.placement`), Gebäude, Einheiten (gegnerische nur wenn `isVisible`; gegnerische Gebäude wenn `isExplored`),
  Granaten, Effekte, HP-Balken (bei Auswahl, Hover oder beschädigt), Auswahlkreise, Sammelpunkt-Linie gewählter Gebäude,
  Wegziel-Markierung, Platzierungsgeist (grün/rot, bei Mauerzug alle Zellen), Auswahlrahmen, Nebel (unerkundet schwarz,
  erkundet 50 % dunkel; bei `?debug=1` aus). Nur sichtbaren Ausschnitt zeichnen.
- `minimap.js`: `export class Minimap { constructor(canvas, game, camera, team) }`, `render()`, `toWorld(mx, my)`.

### ui (DOM)
- `controller.js`: `export class Controller { constructor(game, team, camera) }` – hält den Ansichtszustand `view`:
  `{ selection: Set<id>, mode: 'normal'|'build'|'place'|'wall'|'attackMove'|'fobTarget', placement: {type, x, y, ok, reason, cells?}|null,
  dragBox: {x1, y1, x2, y2}|null (Bildschirm), hoverId, moveMarker: {x, y, t}|null, groups: {} }`.
  Methoden: `selected()` (lebende eigene, Einheiten vor Gebäuden), `selectAt(wx, wy, add)`, `selectBox(rect, add)` (nur Einheiten,
  falls vorhanden), `selectSameType(id)`, `clear()`, `rightClick(wx, wy)` (Gegner → attack, sonst move; nur Gebäude gewählt → rally),
  `leftClickWorld(wx, wy, shift)` (je nach Modus: Platzierung bestätigen, Angriffsbewegung, FOB-Ziel, sonst Auswahl),
  `startBuildMenu()`, `beginPlacement(type)`, `updatePointer(wx, wy)`, `beginWall(wx, wy)`, `endWall(wx, wy)`, `startAttackMove()`,
  `startFobTarget()`, `stop()`, `train(unit)`, `cancelTrain()`, `demolish()`, `cancel()` (Esc), `assignGroup(n)`, `selectGroup(n)` → bool doppelt,
  `commandCard()` → Array `{ label, hotkey, cost, enabled, reason, action }` passend zur Auswahl/zum Modus,
  `handleHotkey(key)` → bool, `message(text)`. Ergebnisse von `game.issue` mit `ok: false` → `message(reason)`.
- `input.js`: `export class Input { constructor({ canvas, minimap, camera, controller, hud }) }`, `update(dt)` (Kamera per Pfeiltasten
  und Bildschirmrand 900 px/s / zoom). Maus: links Auswahl/Rahmen (≥ 6 px), Doppelklick, rechts Befehl, mitte ziehen = pan, Rad = Zoom,
  Minimap links/rechts. Tastatur siehe PRD §8 (Ereignisse im Eingabefeld ignorieren, `preventDefault` für F1/Leertaste/Pfeile).
  Kontextmenü auf Canvas unterdrücken.
- `hud.js`: `export class Hud { constructor(root, game, team, controller) }`, `update()` (DOM max. 5×/s neu schreiben),
  `pushMessage(text)` (max. 5 sichtbar, je 6 s), Befehlskarte aus `controller.commandCard()` (Buttons klickbar, Tooltip mit Kosten/Grund),
  Auswahlpanel (Einzel: Name, HP, Queue mit Fortschritt; Mehrfach: Anzahl je Typ).
- `menu.js`: `export function showStartMenu(root, onStart)` (`onStart({difficulty, winPoints})`), `showPause(root, onResume, onQuit)`,
  `showHelp(root)`, `showEnd(root, {winner, team, reason, stats}, onRestart)`, `hideOverlay(root)`.
- `main.js`: URL-Parameter `seed`, `debug`, `speed`. Startmenü → `new Game`, `new AI(game, 1, difficulty)`, Camera auf Spieler-FOB,
  Renderer, Minimap, Controller, Input, Hud, `createLoop({ update(dt) { ai.update(dt); game.update(dt); hud-Ereignisse }, render() })`.
  Ende → Endbildschirm. Debug: Nebel aus (`revealAll` je Tick), Taste `M` = +1000 aller Ressourcen, Geschwindigkeit bis 10×.
  Service Worker registrieren (nicht bei `localhost`-Fehlern abbrechen).

## 6. Layout & Stil

Vollbild-Canvas, darüber HUD (Höhe oben 44 px, unten 190 px), dunkles Militär-Theme (Hintergrund `#141814`, Panels `#1d231d`
mit 1 px `#ffffff1a`, Akzent `#c9a227`), `system-ui`. Minimap 180 × 180. Buttons 56 × 56 mit Kürzel unten rechts.

## 7. Tests (`frontline/test/`, `npm test` = `node --test`)

- `map.test.js`: deterministisch je Seed; Symmetrie; je Spawn 3 Sorten im FOB-Radius; Wege Spawn→Zone vorhanden.
- `path.test.js`: Weg um Hindernis; Mauer blockiert; Tor nur für eigenes Team passierbar.
- `game.test.js`: Startzustand; Platzierungsregeln (außerhalb Radius, auf Hindernis, Förderanlage nur auf Vorkommen); Bau fertig nach Bauzeit;
  Training zieht Kosten ab und spawnt; Kampf (Kampfpanzer tötet Schützen); Zone: nur Team 0 in Zone → nach 30,1 s 1 Punkt und Geld;
  umkämpft → kein Punkt; Sieg bei `winPoints`; Eliminierung.
- `ai.test.js`: KI gegen KI (beide Teams `AI`), 20 min Spielzeit mit `dt = 0.05` ohne Exception; beide bauen ≥ 2 Förderanlagen und
  ≥ 10 Einheiten; jemand hält zeitweise die Zone.

## 8. Arbeitspakete (Implementer = Haiku-Subagent, je Paket ein Auftrag)

| WP | Inhalt | Dateien | Abhängig |
|---|---|---|---|
| 1 | Daten, RNG, Karte, Grid, Pfadsuche + Tests | `js/data/*`, `js/core/rng.js`, `js/game/{map,grid,pathfinding}.js`, `test/{map,path}.test.js`, `package.json` | – |
| 2 | Simulation + Tests | `js/game/{entities,game,economy,movement,combat,zone,fog}.js`, `test/game.test.js` | 1 |
| 3 | KI + KI-gegen-KI-Test | `js/ai/ai.js`, `test/ai.test.js` | 2 |
| 4 | Rendering | `js/render/*`, `js/core/loop.js` | 2 |
| 5 | UI, Bootstrap, PWA, Einbindung | `js/ui/*`, `js/main.js`, `index.html`, `css/style.css`, `manifest.json`, `sw.js` (Präfix `frontline-`), `icons/icon.svg`, `README.md`, Karte in `/index.html` + Tabelle in `/README.md`, `.github/workflows/test-frontline.yml` | 3, 4 |

WP 3 und 4 laufen parallel. Danach Review durch Opus (Browser-Test mit Playwright, Balancing, Code-Review).

## 9. Review (Opus) – Ergebnisse & Entscheidungen

- **Balancing:** KI-gegen-KI zeigte starken Schneeball – der Zonenhalter hortete ~50 000 Geld, der Gegner verdiente nur 2 Geld/s je FOB.
  Geändert: `fob.income` 2 → 5, `zone.controlIncome` 12 → 6, `zone.unitIncome` 0,5 → 0,25. Danach Partien mit Hin und Her
  (z. B. 100:22, 100:42), Dauer 57–79 min bei 100 Punkten.
- **Einheitenlimit:** seit v4.24 entfernt (RTS; Daniel-Entscheidung 2026-10-25).
- KI-Paket fixte zwei Engine-Fehler: Ankunft am Ziel (Einheiten blieben ewig im `move`) und Spawn-Seite (Blau spawnte zum Kartenrand).
- `?debug=1` legt den Spielzustand als `window.frontline` ab (für Konsole/Browser-Tests).
- PNG-Icons aus `icons/icon.svg` erzeugt.
- Browser-Prüfung (Chromium, 1440×900): keine Konsolenfehler; 60 FPS bei 164 Einheiten im Gefecht (schlechtester Frame 23 ms);
  Siegbildschirm, Debug-Tempo 10×, Steuerung und Bau laut WP5-Durchlauf.

## 10. Erweiterung v2: Versorgung & stärkere KI

### 10.1 Verbrauch (Team-Vorrat, kein Einzel-Vorrat je Einheit)
- **Munition pro Schuss** aus `team.res.mun`. Neues Feld `ammoPerShot` in `UNITS` und in `BUILDINGS.*.weapon` / `.aa`:
  Schütze 0.25, PAK 2, SPz 0.4, KPz 4, Mörser 4 (je Granate), Flugabwehr 0.25 (je Schuss/Abfangversuch), FOB-MG 0 (Basis nie wehrlos).
  Reicht der Vorrat nicht (`res.mun < ammoPerShot`), wird **nicht** gefeuert (Abklingzeit läuft nicht an).
- **Treibstoff** für Fahrzeuge: neues Feld `fuelPerSec` in `UNITS` (LKW 0.2, SPz 0.4, KPz 0.6), nur solange sich die Einheit
  tatsächlich bewegt. Ist `res.fuel <= 0`, fahren Fahrzeuge mit 25 % Geschwindigkeit (nie ganz stehen bleiben).
- Verbrauch fließt negativ in `team.rate` (→ HUD zeigt Netto-Rate, rot wenn negativ).
- Meldungen (je Sorte höchstens alle 20 s): „Keine Munition – Einheiten feuern nicht“, „Kein Treibstoff – Fahrzeuge langsam“.
- Statistik `team.used = { mun, fuel }` (Summe des Verbrauchs).
- Ertrag angepasst: Förderanlage `yields: { bm: 4, mun: 4, fuel: 3 }`, Start `bm: 600`.

### 10.2 KI
- **Wirtschaft zuerst:** Förderanlagen vor allem anderen; Mörser/Flugabwehr/Mauern erst ab ≥ 4 fertigen Förderanlagen
  **und** fertiger Halle (oder wenn die Basis angegriffen wird: dann 1 Flugabwehr/Mörser erlaubt).
  Förderanlagen-Reihenfolge nach Knappheit: Sorte mit dem kleinsten Vorrat relativ zum Bedarf zuerst.
- **Expansion früh und oft:** Start-LKW fährt sofort los. Ziel: 2 LKW, solange FOB-Grenze nicht erreicht. FOB-Grenze
  leicht 3, normal 6, schwer 6 (= Spielmaximum). Mehrere FOB-Aufträge gleichzeitig erlaubt (je LKW einer).
- **FOB-Ziele (bewertet, bestes zuerst):**
  1. **Zonen-FOB innerhalb der Konfliktzone** (Abstand zur Mitte ≤ 0,6 · r), bevorzugt so, dass Vorkommen in der Zone im
     Bauradius liegen; sonst auf der Linie Zonenmitte → eigene Basis bei ~0,45 · r. Hat sie eine, und geht sie verloren: neu bauen.
  2. **Vorkommen-FOBs:** Kandidat = Position nahe freier Vorkommen; Wert = Σ Gewicht der freien Vorkommen im Bauradius
     (Munition/Treibstoff 1,5, Baumaterial 1) − Entfernung zur Haupt-FOB / 2000 − 2 bei sichtbaren Gegnern in 600 px.
- **Armee:** Sammelpunkt bei der Zonen-FOB (falls vorhanden), sonst wie bisher. Bei Munition < 30 keine Angriffe starten.
- **Produktion:** Munitionsreserve halten: Kampfeinheiten nur ausbilden, wenn nach Abzug der Kosten noch
  `min(150, 3 × Anzahl Kampfeinheiten)` Munition übrig bleibt (Schüsse brauchen Vorrat).
- Ziel (KI gegen KI, normal, Seed 7, ohne Gegnerdruck): nach 10 min ≥ 6 Förderanlagen, ≥ 3 FOBs, davon eine in der Zone.

### 10.3 Review v2 (Opus)
- KI-Fehler behoben: die Baumaterial-Reserve für FOBs blockierte auch die Ausbildung von Einheiten (kosten kein Baumaterial)
  → KI hatte nach 5 min nur 6 Einheiten; jetzt ~50, Expansion unverändert schnell (5 FOBs, 8 Förderanlagen nach 6 min, Zonen-FOB nach ~1 min).
- KI gegen KI (normal): Partien 55–58 min, eine 90-min-Dauerschlacht um die Zone (Stand 45:0, > 1600 gefallene Einheiten).

## 11. Erweiterung v3: Logistik (FOB-Lager, Einheiten-Vorrat, LKW als Transporter)

Ersetzt den Team-Vorrat aus §10.1 für Baumaterial, Munition und Treibstoff. **Geld bleibt global** (`team.res.money`).

### 11.1 Lager
- Jede FOB hat `store: { bm, mun, fuel }`, Obergrenze `BALANCE.logistics.storeCap = 3000` je Sorte. Start-FOB startet mit
  `startRes.bm/mun/fuel`. Baustellen haben ein Lager, nutzen es aber erst, wenn fertig. Zerstörte FOB → Lager verloren.
- `team.res.bm/mun/fuel` sind **nur noch lesbare Summen** über alle fertigen eigenen FOB-Lager (Getter via `Object.defineProperty`
  im Konstruktor; nie direkt schreiben). Testhilfe: `game.setStock(team, { bm, mun, fuel })` setzt das Lager der Haupt-FOB
  (älteste fertige) und leert die übrigen.
- **Förderanlage** liefert in die **nächste fertige eigene FOB, in deren Bauradius sie steht** (`game.supplierOf(b)`).
  Gibt es keine (FOB zerstört), ruht die Förderung; Ereignis „Förderanlage ohne FOB“ (gedrosselt 30 s je Team).
  Volles Lager → Überschuss verfällt.
- **Bezahlen:** `game.payerFor(team, x, y, cost)` = nächste fertige eigene FOB, deren Bauradius `(x, y)` enthält und deren Lager
  die Kosten (bm/mun/fuel) deckt; sonst `null`. Geld immer aus `team.res.money`.
  - `build`/`buildWall`: Zahler am Bauort (Mauer: je Zelle). Gebäude merkt `payerId` (für Abbruch/Abriss-Erstattung).
  - `train`: FOB zahlt aus eigenem Lager; Halle aus `payerFor(team, halle.x, halle.y, cost)`. Queue-Eintrag merkt Zahler:
    `queue: [{ unit, payerId }]` (Renderer/HUD lesen `entry.unit`).
  - Erstattung an `payerId`, falls tot an die nächste eigene FOB, sonst verfällt sie.
  - `missingRes` nennt den Engpass: „FOB-Lager: zu wenig Munition“ bzw. „Kein FOB-Lager in Reichweite“.
- `canAfford(team, cost)` bleibt für Geld-only-Prüfungen; alle bm/mun/fuel-Prüfungen laufen über `payerFor`.

### 11.2 Vorrat der Einheiten
- Neue Felder in `UNITS`: `ammoMax` (Munitionseinheiten), `fuelMax` (nur Fahrzeuge):
  Schütze ammoMax 10 · PAK 12 · SPz 16, fuelMax 40 · KPz 40, fuelMax 60 · LKW fuelMax 30.
- Einheiten spawnen voll (`u.ammo`, `u.fuel`). Schuss kostet `ammoPerShot` aus `u.ammo`; reicht es nicht → kein Schuss.
  Fahren kostet `fuelPerSec · dt` aus `u.fuel`; bei 0 → `fuelSlowMul` (25 %).
- **Gebäude-Waffen** (Mörser, Flugabwehr) zahlen aus dem Lager ihres Versorgers (`supplierOf`); FOB-MG kostenlos.
- **Nachfüllen** (`logistics.js`, alle 0,5 s): Einheit im Bauradius einer eigenen fertigen FOB → aus deren Lager,
  sonst im Umkreis `truckSupplyRange = 180` eines eigenen LKW mit Ladung → aus der Ladung. Rate `resupplyRate = 4`/s
  je Sorte und Einheit, begrenzt durch Vorrat und Bedarf.
- Meldungen (gedrosselt 20 s je Sorte und Team): „Einheiten ohne Munition“, „Fahrzeuge ohne Treibstoff“, wenn eine
  eigene Einheit beim Schießen/Fahren leer ist.
- Rate/HUD: Verbrauch der Einheiten zählt **nicht** gegen die Lagerrate; Nachfüllen aus Lagern zählt negativ in `team.rate`.

### 11.3 LKW
- Feld `cargo: { bm, mun, fuel }`, Kapazität `truckCapacity = 400` (Summe), `preset: 'mix'|'bm'|'mun'|'fuel'` (Standard `'mix'`).
  Laden/Entladen mit `transferRate = 100`/s, wenn der LKW ≤ 140 px von der FOB-Mitte steht. LKW zerstört → Ladung weg.
- Befehle (`game.issue`):
  - `{ type: 'load', ids, fobId, preset? }` – hinfahren, laden bis voll oder Lager leer. `mix` = je ein Drittel, Rest auffüllen.
  - `{ type: 'unload', ids, fobId }` – hinfahren, alles abladen (bis `storeCap`).
  - `{ type: 'route', ids, fromId, toId, preset? }` – Pendeln: laden an `from`, abladen an `to`, wiederholen, bis neuer Befehl.
    Ist eine FOB tot → idle + Meldung „Route unterbrochen“.
  - `{ type: 'setPreset', ids, preset }`.
  - Der LKW baut **keine** FOBs mehr (siehe §11.8). `unload` geht auch an eine eigene **FOB-Baustelle** (liefert deren Material).
- Rechtsklick mit gewählten LKW auf eigene FOB: fertige FOB leer → `load`, mit Ladung → `unload`; Baustelle → `unload`.
- Order-Typen in `u.order.type`: zusätzlich `'load'|'unload'|'route'` (marschieren wie `move`, feuern nie).
- Start: Haupt-FOB-Lager = `startRes` (bm 600, mun 150, fuel 150), LKW leer, dazu 1 Baufahrzeug (`startUnits`).

### 11.4 UI & Darstellung
- HUD oben: Summen aller Lager + Netto-Rate wie bisher; Tooltip: „Summe aller FOB-Lager“.
- Auswahl FOB: Lagerbestand (3 Balken mit Zahlen / Obergrenze). Auswahl LKW: Ladung + Preset. Einheiten: Munitions-/Treibstoffbalken.
- Befehlskarte LKW: `L` Laden (dann FOB anklicken), `U` Entladen (dann FOB anklicken), `T` Pendeln (Start-FOB,
  dann Ziel-FOB anklicken), Preset-Buttons `1`–`4` sind **nicht** erlaubt (Kontrollgruppen) → `Q` Gemischt, `W` Baumaterial,
  `E` Munition, `R` Treibstoff (aktives Preset hervorgehoben).
- Renderer: kleiner Munitionsbalken (blau-grau) unter dem HP-Balken bei gewählten/gehoverten Einheiten, Treibstoff (violett)
  für Fahrzeuge; LKW mit Ladung zeigt Ladungsbalken; gewählter LKW mit Route zeigt gestrichelte Linie von→nach;
  Einheiten mit leerer Munition bekommen ein kleines rotes „!“.
- Hilfe/README/PRD aktualisieren.

### 11.5 KI
- LKW-Rollen: **Lieferant** (bringt 400 bm von der FOB mit dem meisten Baumaterial zu einer eigenen FOB-Baustelle), **Pendler** (Route von der FOB
  mit dem größten Überschuss zur FOB mit dem größten Bedarf, v. a. Zonen-FOB; Preset nach Engpass), **Versorger**
  (folgt dem Schwerpunkt der Armee in ~150 px Abstand dahinter, lädt Munition/Treibstoff nach, wenn Ladung < 25 %).
- Baufahrzeuge: 1 (normal), 2 ab 3 FOBs; setzen FOB-Baustellen und bauen alle Gebäude; idle → reparieren.
  Schützen bauen die KI-Mauern.
- Ziel-LKW-Zahl: 1 Lieferant (solange FOB-Grenze nicht erreicht) + 1 Pendler je 2 Außen-FOBs (max. 3) + 1 Versorger ab 15 Kampfeinheiten.
- Bezahlen läuft über die Engine (`payerFor`); die KI wählt Bauorte, die ein Lager in Reichweite haben.
- Einheiten mit `ammo` < 20 % ziehen sich zur nächsten FOB oder zum Versorger zurück (nur außerhalb von Abwehrlagen).

### 11.6 Tests (Pflicht)
Förderanlage füllt Lager ihrer FOB; Bau zahlt aus Lager in Reichweite, nicht aus fernem Lager; Ausbildung zahlt aus FOB-Lager;
Erstattung an Zahler; Schuss leert `u.ammo`, nicht das Lager; Nachfüllen im FOB-Radius und am LKW; leerer Schütze feuert nicht;
LKW lädt/entlädt (Mengen, Kapazität, Preset), Route pendelt mindestens 2 Runden; FOB-Baustelle wartet ohne Material und ohne
Baufahrzeug, wird mit beidem fertig; Gebäude-Baustelle ohne Bauer kommt nicht voran, 2 Bauer doppelt so schnell; Reparatur
kostet Baumaterial und heilt; Schütze baut Mauer, Schütze kann keine Halle bauen; Mauer per LKW-Ladung außerhalb des FOB-Radius;
Eliminierung ohne FOB und ohne Baufahrzeug; KI-gegen-KI läuft weiter fehlerfrei (bestehende Tests anpassen).

### 11.7 Arbeitspakete
| Paket | Modell | Inhalt |
|---|---|---|
| L1 | Haiku 5.5 | Engine §11.1–11.3 + §11.8 (+ `js/game/logistics.js`, `js/game/construction.js`), Tests §11.6 (ohne KI) |
| L2 | Haiku 5.5 | UI/Render §11.4 |
| L3 | Sonnet 5.5 | KI §11.5 (strategisch anspruchsvoll, Haikus KI-Fehler aus v2 zeigt den Bedarf) |
| Review | Opus 5.5 | Code-Review, KI-gegen-KI-Messungen, Browser-Test, PRD-Abgleich |

### 11.8 Bauen mit Baufahrzeug und Infanterie
- Neue Einheit `engineer` „Baufahrzeug“: FOB, Hotkey R, armor light, hp 400, speed 70, radius 12, sight 260, unbewaffnet,
  cost money 150 + fuel 60, buildTime 15, fuelPerSec 0.3, fuelMax 40. `builder: 'all'`.
  Infanterie (`rifleman`, `at`): `builder: 'fort'` (nur Mauer und Tor). `startUnits` = truck, engineer, 4× rifleman.
- **Keine automatische Bauzeit mehr.** Eine Baustelle macht nur Fortschritt, solange ein passender eigener Bauer ≤ 90 px vom
  Gebäuderand steht (`order.type === 'build'` oder idle in der Nähe): `progress += dt / buildTime` je Bauer, max. 3 Bauer.
  Infanterie hilft nur bei Mauer/Tor, Baufahrzeug bei allem.
- **Befehle:** `{ type: 'build', ids?, building, x, y }` und `buildWall` nehmen optional `ids` der Bauer; diese bekommen
  `order = { type: 'build', targetId }` (Baustellen einer Mauerlinie der Reihe nach). Ohne `ids` (KI/Tests) arbeiten idle Bauer
  im Umkreis 400 px automatisch (alle 1 s prüfen). `{ type: 'repair', ids, targetId }` (nur Baufahrzeug).
  Ein Bauer ohne Baustelle wird idle; idle Baufahrzeuge reparieren automatisch beschädigte eigene Gebäude ≤ 300 px.
  Prüfung `build`: Gebäude ohne Bauer-Typ-Recht (z. B. Halle mit Schützen gewählt) → `fail('Nur Baufahrzeuge bauen das')`.
- **FOB:** `{ type: 'buildFob', ids /*Baufahrzeuge*/, x, y }` (bisheriges `truckId` entfällt) legt sofort eine **FOB-Baustelle**
  an (Regeln aus `canPlace`, kein Bauradius nötig, nichts wird bezahlt). Die Baustelle hat `store` und braucht
  **400 Baumaterial im eigenen Lager** (per LKW `unload`), bevor Fortschritt möglich ist (dann werden die 400 verbraucht);
  Bauzeit 30 s mit einem Baufahrzeug. HUD zeigt „Wartet auf Material (x/400)“ bzw. „Wartet auf Baufahrzeug“.
- **Reparatur:** 2 % maxHp/s je Baufahrzeug, Kosten `cost.bm × geheilt/maxHp × 0.5` aus dem Lager des Versorgers (`payerFor` am
  Gebäude); ohne Lager in Reichweite keine Reparatur. Baustellen werden nicht „repariert“, sondern gebaut.
- **Mauer/Tor außerhalb des FOB-Radius:** zulässig, wenn ein eigener LKW mit genug Baumaterial-Ladung ≤ 180 px vom Bauort steht;
  dann zahlt die Ladung. `canPlace` liefert dafür `payer: { kind: 'fob'|'truck', id }`.
- Eliminierung: Team ohne FOB (auch Baustellen) **und** ohne Baufahrzeug verliert.
- UI: Baumenü (B) zeigt bei Baufahrzeug alles inkl. „FOB-Baustelle (F)“; bei Infanterie nur Mauer/Tor; ohne passende Auswahl
  ist B deaktiviert mit Tooltip „Baufahrzeug oder Infanterie wählen“. Rechtsklick Baufahrzeug auf eigene beschädigte Baustelle/
  Gebäude → bauen/reparieren. Baustellen zeigen Fortschrittsbalken und ein Symbol, wenn kein Bauer da ist.

### 11.9 Review v3 (Opus)
- L1 (Haiku), L2 (Haiku), L3 (Sonnet) umgesetzt; 66 Tests grün, Browser ohne Fehler, Rot steht nach 5 min mit Zonen-FOB und 42 Einheiten.
- Engine ergänzt: `{ type: 'build', ids, siteId }` schickt Bauer an eine bestehende Baustelle (Rechtsklick Bauer → Baustelle).
- KI gegen KI (normal): 58–61 min, viel Kampf (je 470–600 gefallene Einheiten), aber Zonenhalter gewinnt 100:0 –
  Balancing bewusst zurückgestellt, weil das HQ-Konzept (unendlicher Nachschub, begrenzte Ladeleistung) die Wirtschaft ändert.

## 12. v4.23: Soldaten-Nachschub (wie im Original: Gefallene steigen wieder ein)

Problem (Messung v4.22, KI gegen KI): Die erste große Schlacht entscheidet; der Verlierer hat kaum Einheiten in der Zone,
verdient deshalb kaum Geld und kommt nicht zurück (Schneeball). Lösung: kostenloser Grundstock an Soldaten.

- `BALANCE.reinforce = { interval: 6, soldierMin: 50, unit: 'rifleman' }`.
- `game.soldierCount(team)`: lebende eigene Infanterie (`UNITS[type].armor === 'inf'`, auch Passagiere in Fahrzeugen)
  plus Infanterie in Ausbildungs-Warteschlangen.
- In `updateEconomy` (economy.js), je Team mit lebender, fertiger Haupt-FOB: Ist `soldierCount < soldierMin` und
  zählt `team.reinforceTimer` hoch; bei `>= interval` erscheint ein Schütze kostenlos an der
  Haupt-FOB (`spawnSpot`, Befehl zum Sammelpunkt wie bei der Ausbildung, keine Meldung) und der Timer startet von vorn.
  Ist kein Feld frei, bleibt der Timer stehen (Versuch im nächsten Schritt). Sonst (genug Soldaten oder Limit) Timer = 0.
  Unabhängig von Warteschlange und Ausbildungsplätzen; kostet nichts, zählt nicht als „verdient“.
- HUD (Haupt-FOB gewählt): Zeile „Nachschub: Schütze in N s (Soldaten x/50)“ bzw. „Nachschub ruht (Soldaten x/50)“.
- KI: keine Pflichtänderung; neue Schützen sammeln sich am Sammelpunkt und werden wie ausgebildete Einheiten eingesetzt.
- Kasse (`walletMax` 5000): nach Messung prüfen (beide Seiten starten mit demselben Betrag).
- Tests (economy.test.js): Nachschub nach 6 s bei < 50 Soldaten, kostenlos; keiner bei ≥ 50; keiner ohne Haupt-FOB;
  keiner am Einheitenlimit; `soldierCount` zählt Passagiere und Warteschlange.

### 12.1 Review v4.23 (Opus)
- Umgesetzt von Haiku; 115 Tests grün; Browser: Schütze erscheint nach 6 s, HUD-Zeile korrekt, keine Fehler.
- KI gegen KI (normal, 20 min): Der Verlierer behält jetzt 25–50 Einheiten (vorher 5–10) und verdient 7.800–9.200 (vorher
  5.400–6.300). Die Zone gewinnt er aber nicht zurück: Er schickt kleine Gruppen gegen 115 Einheiten in der Zone (0–1 Einheiten
  in der Zone ab Minute 9–11). Der Sieger hortet weiter (26.000–30.600). Gegenprobe mit `unitCap` 80: kein Unterschied (nicht übernommen).
- `walletMax` 5000 bleibt: Beide Seiten starten mit demselben Betrag, das Horten verschafft keinen Vorteil gegenüber dem Gegner.
- Offen: Der Schneeball ist nicht gelöst; nächster Hebel steht zur Entscheidung (KI des Unterlegenen und/oder Spielmechanik).
