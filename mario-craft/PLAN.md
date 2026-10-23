# Mario Craft – Architektur & Umsetzungsplan

Anforderungen: `PRD.md`. Vanilla JS (ES-Module, `import … from './x.js'` immer mit Endung), Canvas 2D, kein Build,
keine externen Dateien/CDNs/Fonts. Chrome auf Android (Pixel 8a, Lenovo Tab M11), Querformat, Touch. Texte über `i18n` (DE/PL).

**Grundprinzip:** Die Simulation (`js/data`, `js/game`) kennt kein DOM/`window` und läuft in Node (`node --test`).
Eingaben kommen als einfacher Zustand `{ left, right, jump, fire }` herein; Renderer und HUD lesen den Spielzustand nur.

---

## 1. Dateistruktur

```
mario-craft/
  index.html  manifest.json  sw.js  README.md  PRD.md  PLAN.md  package.json
  css/style.css
  icons/icon.svg  icon-192.png  icon-512.png  maskable-512.png
  js/
    main.js               Bootstrap (DOM): Skalierung, Menüs, Loop, SW registrieren, ?debug=1
    core/loop.js          createLoop(update, render) – fester Zeitschritt
    core/input.js         class Input (Touch-Knöpfe + Tastatur → InputState)
    core/audio.js         audio (Web-Audio-Effekte)
    core/save.js          loadSave, writeSave, defaultSave
    core/i18n.js          t(key, vars), setLang, getLang, LANGS
    data/physics.js       PHYS (alle Bewegungswerte)
    data/tiles.js         TILES (Zeichen → Kacheltyp)
    data/enemies.js       ENEMIES, BOSSES
    data/strings.js       STRINGS = { de: {...}, pl: {...} }
    data/levels/index.js  LEVELS (Array, Reihenfolge = Freischaltung)
    data/levels/w1-1.js … w3-4.js
    game/level.js         parseLevel(def) → LevelMap
    game/collide.js       moveAndCollide(body, map, dt)
    game/player.js        updatePlayer(game, dt)
    game/enemies.js       updateEnemies(game, dt), Boss-Logik
    game/items.js         Gegenstände, Feuerbälle, Blockstöße, Partikel
    game/game.js          class Game
    render/sprites.js     SPRITES (Pixelraster) + buildSprites() → Bild-Atlas
    render/tilecache.js   buildChunks(map, theme) → vorgerenderte Level-Abschnitte
    render/renderer.js    class Renderer
    render/hud.js         drawHud(ctx, game, w, h), drawControls(ctx, input, w, h)
    ui/menu.js            Start, Levelauswahl, Pause, Levelende, Game Over (DOM-Overlays)
  test/*.test.js          node --test
```

## 2. Koordinaten & Darstellung

- Welt in px, Kachel `T = 16`. Zelle `(c, r)`, `r = 0` oben. Level sind **15 Zeilen** hoch, 100–400 Spalten breit.
- y wächst nach unten. Geschwindigkeiten px/s, Zeiten s.
- **Interne Auflösung** (in `main.js`, bei `resize` und Orientierungswechsel):
  ```
  physW = round(innerWidth * dpr), physH = round(innerHeight * dpr)
  scale = max(1, round(physH / 240))
  viewH = ceil(physH / scale), viewW = ceil(physW / scale)      // z. B. 384×240 (Tab M11), 480×216 (Pixel 8a)
  ```
  Spiel zeichnet in ein Canvas `viewW × viewH` (`imageSmoothingEnabled = false`), das per CSS
  (`image-rendering: pixelated`, Größe `viewW*scale/dpr` CSS-px) bildschirmfüllend skaliert wird. `viewH` mindestens 200.
- **Kamera:** folgt dem Spieler horizontal mit Totzone (Spieler bleibt zwischen 35 % und 50 % der Breite), läuft nie zurück
  nach links hinter den Start des aktuellen Abschnitts (wie Klassiker: keine Rückwärtsbewegung über die Kameragrenze). Vertikal
  fest, Level unten bündig. Kamera-x immer auf ganze Pixel runden.

## 3. Game-Loop (`core/loop.js`)

- Fester Simulationsschritt **1/120 s** mit Akkumulator (max. 8 Schritte pro Frame, Rest verwerfen). Rendern einmal pro
  `requestAnimationFrame`. Damit gleiches Verhalten bei 60/90/120 Hz (Tab M11 hat 90 Hz).
- Pausiert bei `visibilitychange` (hidden) automatisch → Pausemenü.

## 4. Daten (`js/data/`) – verbindliche Werte

### 4.1 `physics.js` → `export const PHYS`

```js
{
  tile: 16, rows: 15, step: 1 / 120,
  walkSpeed: 90, runSpeed: 150, runDelay: 0.6,     // Renntempo nach 0,6 s gehaltener Richtung
  accel: 600, decel: 700, turnDecel: 1100, airAccelMult: 0.8,
  gravity: 1300, gravityHold: 650,                 // geringere Schwerkraft solange Sprung gehalten und vy < 0
  jumpSpeed: 330, runJumpBonus: 30,                // vy beim Absprung (+ Bonus bei Renntempo)
  jumpCut: 0.45,                                   // vy *= jumpCut beim Loslassen während Aufstieg
  maxFall: 420, coyote: 0.08, jumpBuffer: 0.1,
  stompBounce: 220, stompBounceHold: 330,
  cornerNudge: 4,                                  // px seitliche Korrektur bei Kopfstoß an Blockkante
  hurtInvuln: 1.5, starTime: 8,
  fireballSpeed: 210, fireballBounce: 180, maxFireballs: 2,
  shellSpeed: 220,
  player: { small: { w: 12, h: 14 }, big: { w: 12, h: 28 } },
  lives: 3, coinsPerLife: 100,
}
```
Abgeleitete Grenzwerte (Test in `test/physics.test.js` per Simulation, nicht per Formel):
max. Sprunghöhe stehend ≥ 4 Kacheln, gerannt ≥ 5; max. Weite gerannt ≥ 6 Kacheln Lücke.

### 4.2 Level-Format (`data/levels/wX-Y.js`)

```js
export default {
  id: 'w1-1', world: 1, theme: 'meadow' | 'cave' | 'castle',
  rows: [ /* genau 15 Strings gleicher Länge, Zeichen siehe unten */ ],
  items: { 'c,r': 'mushroom' | 'flower' | 'star' | 'oneup' | 'coins10' },  // Inhalt von Bonusblöcken (Standard: Münze)
  platforms: [ { c, r, w, path: 'h'|'v'|'fall', range: Kacheln, speed } ],  // optional
  boss: 'rootking' | 'golem' | 'dragon' | undefined,
}
```
Zeichen (`data/tiles.js`):

| Zeichen | Bedeutung | | Zeichen | Bedeutung |
|---|---|---|---|---|
| `.` | leer | | `P` | Spielerstart |
| `#` | Boden (fest) | | `F` | Zielfahne (Fuß) |
| `B` | Ziegel | | `K` | Checkpoint |
| `?` | Bonusblock | | `o` | Münze |
| `!` | unsichtbarer Block | | `*` | Sternmünze |
| `H` | harter Block | | `g` | Läufer |
| `=` | Plattform (nur von oben) | | `k` | Panzerkäfer |
| `L` | Lava | | `h` | Hüpfer |
| `^` | Stacheln | | `s` | Stachling |
| `\|` `[` `]` | Röhre (Deko/Hindernis) | | `l` | Lavaball-Quelle |
| `b` | Boss-Startpunkt | | `D` | Dekoration (Busch/Kristall, nicht fest) |

### 4.3 `enemies.js`

```js
ENEMIES = {
  walker:  { w: 14, h: 14, speed: 30, stompable: true,  falls: true },
  beetle:  { w: 14, h: 16, speed: 30, stompable: true,  falls: true, shell: true },
  hopper:  { w: 14, h: 14, speed: 40, stompable: true,  hopEvery: 1.4, hopSpeed: 280 },
  spiky:   { w: 14, h: 14, speed: 20, stompable: false, turnAtEdge: true },
  lavaball:{ w: 10, h: 10, jumpSpeed: 420, every: 2.5, invulnerable: true },
}
BOSSES = {
  rootking: { w: 32, h: 32, hp: 3, speed: 50, jumpEvery: 2.5 },
  golem:    { w: 32, h: 40, hp: 3, speed: 35, rockEvery: 1.8, dizzy: 1.5 },
  dragon:   { w: 40, h: 32, hp: 3, fireHp: 8, speed: 40, fireEvery: 2.0 },
}
```
Gegner werden erst aktiv, wenn sie innerhalb `viewW + 32` px rechts der Kamera liegen; Gegner weiter als 2 Bildschirme links
der Kamera werden entfernt.

## 5. Modul-Schnittstellen (verbindlich)

```js
// core/loop.js
export function createLoop(update /* (dt) */, render /* () */) -> { start(), stop(), fps }
// core/input.js
export class Input {
  constructor(canvasEl, getLayout)   // getLayout() -> { viewW, viewH, scale, dpr }
  state: { left, right, jump, fire, jumpPressed, firePressed, pausePressed }  // *Pressed: nur einen Schritt true
  endStep()                           // setzt *Pressed zurück; nach jedem Simulationsschritt aufrufen
  setFireVisible(bool)
  buttons: [{ id, x, y, r, down }]    // in internen Pixeln, für drawControls
}
// core/audio.js
export const audio = { init(), setEnabled(b), jump(), coin(), stomp(), bump(), breakBlock(), powerup(), appear(),
                       hurt(), fireball(), kick(), oneup(), checkpoint(), goal(), die(), gameOver(), click() }
// core/save.js   Schlüssel 'mariocraft-save', Format v1
export function loadSave() -> Save; export function writeSave(save); export function defaultSave() -> Save
// Save = { v:1, lang, sound, unlocked: 'w1-1'…, lives, coins, power: 'small'|'big'|'fire',
//          levels: { [id]: { done, bestTime, coins, stars: [bool,bool,bool] } } }
// core/i18n.js
export const LANGS = ['de', 'pl']; export function setLang(l); export function getLang(); export function t(key, vars)
// game/level.js
export function parseLevel(def) -> LevelMap
// LevelMap = { id, theme, cols, rows: 15, tiles: Uint8Array(cols*rows), get(c,r), set(c,r,v), isSolid(c,r),
//              start:{x,y}, checkpoint:{x,y}|null, goal:{x,y}, spawns:[{type,x,y}], coins:[{x,y,star}], items, platforms, boss }
// game/collide.js
export function moveAndCollide(body, map, dt) -> { hitHead:{c,r}|null, onGround, hitWall:-1|0|1 }
//   body = { x, y, w, h, vx, vy }  (x,y = linke obere Ecke). Erst x, dann y, Kachel-AABB. Plattformen ('=') nur von oben,
//   wenn Unterkante im vorigen Schritt darüber lag. Bewegliche Plattformen über game.platforms (in player.js/enemies.js).
// game/player.js
export function createPlayer(x, y, power /* 'small'|'big'|'fire' */) -> Player
// Player = { x, y, w, h, vx, vy, face: 1|-1, power, onGround, runTimer, coyote, jumpBuffer, jumping, invuln, star,
//            anim: 'stand'|'walk'|'run'|'jump'|'fall'|'turn'|'crouch', animTime, dead }
export function updatePlayer(game, dt, input) -> { hitHead:{c,r}|null }   // nutzt nur game.map, game.player, game.platforms
export function setPower(player, power)   // passt h an (Füße bleiben am selben y)
// game/game.js
export class Game {
  constructor({ level /* def */, save, onEvent /* (name, data) */ })
  update(dt, input)        // ein fester Schritt
  state: 'play' | 'dying' | 'won' | 'over'
  // lesbar für Renderer/HUD:
  map, player, enemies[], items[], fireballs[], particles[], platforms[], boss, camX, time, coins, lives, starCoins:[3]
}
// onEvent-Namen = audio-Funktionsnamen (Spiel ruft keinen Ton direkt) + 'levelDone', 'lifeLost', 'gameOver', 'hudChange'
// render/sprites.js
export function buildSprites() -> { atlas: Canvas, get(name, frame, flip) -> {sx,sy,w,h} }
// render/tilecache.js
export function buildChunks(map, atlas) -> { chunks: Canvas[] (je 256 px breit), redrawCell(c, r) }
// render/renderer.js
export class Renderer { constructor(canvas, sprites); setView(viewW, viewH); setLevel(map, theme); render(game, input, fps) }
// ui/menu.js
export function showStart(cb), showLevelSelect(save, cb), showPause(cb), showLevelDone(result, cb), showGameOver(cb), hideAll()
```

## 6. Performance (Lenovo Tab M11 ist die Messlatte)

- Kleine interne Auflösung (≈ 100 000 Pixel) + ganzzahlige CSS-Skalierung: Füllrate ist kein Problem.
- **Level vorrendern:** Kacheln werden beim Laden in 256 px breite Abschnitts-Canvases gezeichnet; pro Frame nur 2–3
  `drawImage`. Zerstörte/geänderte Kacheln (`redrawCell`) zeichnen nur ihre Zelle neu.
- **Sprite-Atlas:** alle Sprites (auch gespiegelt) einmal beim Start in ein Atlas-Canvas; Zeichnen nur per `drawImage` aus dem Atlas.
- Hintergrund-Parallax: je Ebene ein vorgerendertes, kachelbares Canvas.
- Keine Allokationen im Schritt: feste Arrays mit `active`-Flag für Partikel (64), Feuerbälle (2), Gegenstände (16).
- Touch-Knöpfe auf dasselbe Canvas zeichnen (kein DOM über dem Spiel während des Spielens).
- Messung: `?debug=1` zeigt fps und längsten Frame. Review prüft in Chromium mit CPU-Drosselung ×4.

## 7. Eingabe (`core/input.js`)

- Pointer Events auf dem Canvas, `touch-action: none`, je `pointerId` eine Zuordnung. Zuordnung pro Bewegung neu:
  linke Bildhälfte → ◀ wenn x < Grenze zwischen den Knöpfen, sonst ▶ (Daumen kann rutschen); rechte Hälfte → Feuer, wenn
  Feuer sichtbar und Punkt im Feuer-Kreis (+8 px), sonst Springen. Pause-Knopf oben rechts (24×24 intern).
- Knöpfe (intern, an `viewW/viewH` ausgerichtet): ◀ Mitte (36, viewH−36), ▶ (92, viewH−36), Radius 24; Springen
  (viewW−44, viewH−40) Radius 30; Feuer (viewW−96, viewH−70) Radius 20.
- Tastatur wie PRD §8. `navigator.vibrate` für Treffer (40 ms) und Stampfen (15 ms), wenn Ton an.

## 8. Tests (`mario-craft/test/`, `npm test` = `node --test`)

- `physics.test.js`: simuliert Sprünge mit `moveAndCollide` + Spielerlogik: Höhe stehend/gerannt, Weite gerannt (§4.1),
  Coyote Time, Jump Buffer, Plattform nur von oben.
- `levels.test.js`: für jedes Level in `LEVELS`: 15 gleich lange Zeilen, nur bekannte Zeichen, genau ein `P` und ein `F`,
  höchstens ein `K`, genau 3 `*`, Boss-Level haben `b`; **Schaffbarkeit**: keine Bodenlücke breiter als die gemessene
  max. Sprungweite (minus 1 Kachel Reserve), keine Stufe höher als max. Sprunghöhe (minus 1), sofern nicht per Plattform überbrückt.
- `game.test.js`: Stampfen besiegt Läufer, Stachling verletzt, Panzer kicken, Bonusblock gibt Pilz/Blume je Zustand,
  Treffer stuft herunter, 100 Münzen = Leben, Zielfahne → `levelDone`, Checkpoint-Respawn.
- `i18n.test.js`: `de` und `pl` haben dieselben Schlüssel.
- Workflow `.github/workflows/test-mario-craft.yml` mit `paths: ["mario-craft/**"]`.

## 9. Arbeitspakete (Implementer = Haiku-Subagent, je Paket ein Auftrag)

| WP | Inhalt | Dateien | Abhängig |
|---|---|---|---|
| 1 | Daten, Level-Parser, Kollision, Spielerphysik + Tests | `js/data/{physics,tiles,enemies}.js`, `js/game/{level,collide,player}.js`, `test/physics.test.js`, `package.json` | – |
| 2 | Spiel: Gegner, Bosse, Gegenstände, Blöcke, Kamera, Game + Tests | `js/game/{enemies,items,game}.js`, `test/game.test.js` | 1 |
| 3 | Level w1-1 … w3-4 + Level-Test | `js/data/levels/*`, `test/levels.test.js` | 1 |
| 4 | Pixel-Art, Abschnitts-Cache, Renderer, HUD, Touch-Knöpfe zeichnen | `js/render/*` | 2 |
| 5 | Loop, Eingabe, Ton, Speichern, i18n (DE/PL), Menüs, Bootstrap, PWA, Einbindung | `js/core/*`, `js/data/strings.js`, `js/ui/menu.js`, `js/main.js`, `index.html`, `css/style.css`, `manifest.json`, `sw.js` (Präfix `mariocraft-`), `icons/icon.svg`, `README.md`, `test/i18n.test.js`, Karte in `/index.html`, Zeile in `/README.md`, `.github/workflows/test-mario-craft.yml` | 2, 4 |

WP 2 und 3 laufen parallel, danach 4, dann 5. Danach **Review durch Opus:** Spielgefühl (Sprungwerte), Level-Durchlauf
im Browser (Playwright, Querformat 1920×1200 und 2400×1080 mit passendem DPR, Touch-Emulation), Performance mit CPU-Drosselung ×4,
polnische Texte gegenlesen, PNG-Icons aus `icons/icon.svg` erzeugen. Ergebnisse als §10 in diesem Plan festhalten.

Der Implementer-Agent (`.claude/agents/implementer.md`) ist auf Gate Squad zugeschnitten; vor WP1 bekommt er einen
spielneutralen Auftrag: „Lies `<spiel>/PLAN.md`, setze nur das genannte Paket um“ (gleiche Regeln, Ordner als Parameter).

## 10. Notizen aus den Arbeitspaketen (verbindlich für spätere Pakete)

**WP1**
- `createPlayer(x, y, power)`: x, y = **Fußmitte** (wie `map.start`, Spawns, Checkpoint). `player.x/y` = linke obere Ecke.
- Spawns: `{ type: 'walker'|'beetle'|'hopper'|'spiky'|'lavaball'|'boss', x, y }` mit x = Zellmitte, y = Zellunterkante.
- `map.platforms`, `map.items` sind unverändert aus der Level-Definition (Kachel-Einheiten); Umrechnen in px macht `Game`.
- `game.platforms[i] = { x, y, w, h, dx, dy }` in px; `x/y` = Position **vor** dem Schritt, `dx/dy` = Bewegung im Schritt.
  `Game` bewegt Plattformen vor `updatePlayer`.
- `moveAndCollide`/`updatePlayer` liefern wiederverwendete Ergebnisobjekte; `hitHead` sofort auswerten.
- `player.invuln`/`player.star` sind Restzeiten (s), `updatePlayer` zählt sie herunter; setzen tut `Game`.
- Gemessen: gehaltener Sprung stehend ≈ 5,2 Kacheln, gerannt ≈ 6,2; Rennsprung landet ≈ 8,7 Kacheln weit; kurzer Tipp ≈ 2,1.

**WP3**
- 12 Level in `js/data/levels/`, Reihenfolge in `LEVELS`. Plattform `fall`: `range = 0`, `speed` = Fallgeschwindigkeit (px/s).
- `!` nur als versteckte begehbare Blöcke (ohne `items`); Gegenstände liegen nur auf `?`. Kein Stern-Block in v1-Leveln.
- Boss-Arena: 22 flache Spalten, `b` in Zeile 12, Zielfahne direkt nach der Arena. `l` in Zeile 12 über Lava (Zeilen 13–14).

**WP2**
- `js/data/combat.js` → `TUNE` (Feinwerte: Boss, Punkte, Zeiten). Neue Kacheln ohne Zeichen: id 13 `USED_TILE` (leerer Bonusblock,
  wird gezeichnet), id 14 `BARRIER_TILE` (unsichtbare Wand vor der Zielfahne im Boss-Level, **nicht** zeichnen).
- `new Game({ level, save, onEvent, viewW = 384 })`. Zusätzliche Felder: `shots[]` (Boss-Geschosse, type 'rock'|'flame'),
  `bumps[]` ({ c, r, timer } – Block wackelt), `dirty[]`/`dirtyCount` (Zellen `r*cols+c`, die der Tile-Cache neu zeichnen muss;
  danach `game.clearDirty()`), `map.coins[i].taken`.
- Entitäten: `hidden`/`done` überspringen. Gegner `state`: 'walk'|'shell'|'kicked'|'dead' (dead → `flip` = kopfüber fallen).
  Boss: `kind`, `state` 'walk'|'jump'|'dizzy'|'defeated', `hp`, `invuln` (blinken).
- Kamera scrollt nur nach rechts; Figur wird am linken Bildrand gestoppt.

**WP4**
- `buildSprites()` → `{ atlas, get(name, frame, flip), size }`; `buildChunks(map, sprites, theme)` → `{ chunks, redrawCell, redrawAll }`.
- `new Renderer(canvas, sprites, { debug })`; `hud.js` exportiert zusätzlich `drawText` und `bindHud(sprites)` (Renderer ruft es).
- Pause-Knopf zeichnet `drawHud` fest bei `(w-28, 4)`, 24×24 → Input-Trefferfläche dort. `drawControls` überspringt 'pause',
  zeichnet ◀ ▶ Sprung Feuer an den Positionen aus `input.buttons` (x, y, down, visible); Radien fest (24/24/30/20).
- Großer Held: Sprite 16×32 auf Hitbox 12×28.
