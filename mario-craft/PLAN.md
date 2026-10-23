# Mario Craft v2 – Architektur & Umsetzungsplan

Anforderungen: `PRD.md` (v2, Blockwelt). Der v1-Plan (Mario-Stil) steht in der Git-Historie (Commit `f6b7976`).
Vanilla JS (ES-Module, Importe immer mit `.js`), Canvas 2D, kein Build, keine externen Dateien. Texte über `i18n`.

**Grundprinzip (unverändert):** `js/data`, `js/game` kennen kein DOM und laufen in Node (`node --test`).
Eingabe = `{ left, right, jump, dig, fire, jumpPressed, digPressed, firePressed }`. Renderer und HUD lesen nur.

**Arbeitsweise:** Implementer = Haiku-Subagent mit je **einer kleinen Aufgabe** aus §12 (Regeln aus
`.claude/agents/implementer.md`). Opus reviewt jede Aufgabe; genügt sie nicht, macht Sonnet sie neu.

---

## 1. Dateistruktur (v2)

```
js/
  main.js                 Bootstrap (bleibt, angepasst)
  core/ loop.js input.js audio.js save.js i18n.js         (bleiben, angepasst)
  data/
    physics.js            PHYS
    tiles.js              TILES, TILE_BY_ID, TILE_IDS, PICKS
    mobs.js               MOBS, BOSSES          (ersetzt enemies.js)
    combat.js             TUNE                  (angepasst)
    strings.js            STRINGS de/pl
    levels/index.js, levels/w1-1.js …
  game/
    level.js              parseLevel(def)
    collide.js            moveAndCollide(body, map, dt)
    player.js             createPlayer, updatePlayer, setPower
    dig.js                updateDig(game, dt, input), breakTile(game, c, r, cause)
    light.js              computeLight(map) -> Uint8Array
    explode.js            explode(game, x, y, radiusTiles), igniteTnt(game, c, r, fuse), updateTnt(game, dt)
    projectiles.js        spawnProjectile(game, type, x, y, vx, vy), updateProjectiles(game, dt)
    mobs.js               createMob, updateMobs, hitMob, killMob, updateSpawners
    bosses.js             createBoss, updateBoss, damageBoss
    items.js              spawnPickup, updatePickups, openChest, updateFalling, updateParticles
    game.js               class Game
  render/
    art/blocks.js         BLOCK_ART  (16×16-Texturen, Rückwände, Risse)
    art/hero.js           HERO_ART
    art/mobs.js           MOB_ART
    art/bosses.js         BOSS_ART
    art/items.js          ITEM_ART  (Gegenstände, Portal, Bett, Geschosse, Effekte, HUD-Symbole)
    sprites.js            Atlas-Bau + UI-Art (Schrift, Knöpfe, Pause) + SPRITES = Vereinigung aller *_ART
    tilecache.js          buildChunks(map, sprites) – 256×256-Quadrate mit Rückwand
    renderer.js           class Renderer
    hud.js                drawHud, drawControls, drawText, bindHud
  ui/menu.js
test/ physics.test.js dig.test.js explode.test.js mobs.test.js bosses.test.js game.test.js levels.test.js
      reach.test.js i18n.test.js
```

Entfallen: `data/enemies.js`, `game/enemies.js`, Mario-Kacheln, Plattform-Objekte (`platforms`), Bumps.

## 2. Koordinaten & Kamera

- Kachel `T = 16`. Level `cols × rows`, **rows variabel (30–70)**, cols 100–250. Zelle `(c, r)`, `r = 0` oben, y nach unten.
- Interne Auflösung wie v1 (`viewW × viewH`, z. B. 384×240 / 480×216); `Game` bekommt `viewW, viewH` (Konstruktor +
  `setView(w, h)`).
- **Kamera** (`game.camX`, `game.camY`, ganzzahlig): horizontal Totzone 40–55 % der Breite, vertikal Spieler-Mitte
  zwischen 40 % und 60 % der Höhe; beide Richtungen erlaubt; begrenzt auf `[0, cols*T - viewW]`, `[0, rows*T - viewH]`
  (ist das Level kleiner als die Sicht, unten bündig). `game.shake` (s) → Renderer verschiebt ±2 px.
- Außerhalb links/rechts/oben = Grundgestein (fest), unten = leer → Sturz unter `rows*T` kostet ein Leben.

## 3. Kacheln (`data/tiles.js`) – verbindlich

Jeder Eintrag: `{ id, ch, kind, solid, oneWay, climb, water, hazard, bounce, soft, falls, light, hard, minPick, drop, art }`
(`hard` = Abbauzeit s mit Holzhacke, `null` = nicht abbaubar; `soft` = Kopfstoß bricht; `light` 0–15 Eigenlicht;
`drop` siehe Tabelle; `art` = Sprite-Name).

| id | ch | kind | Eigenschaften | hard | minPick | drop |
|---|---|---|---|---|---|---|
| 0 | `.` | air | – | null | | |
| 1 | `G` | grass | solid soft | 0.3 | 0 | |
| 2 | `#` | dirt | solid soft | 0.3 | 0 | |
| 3 | `A` | sand | solid soft falls | 0.3 | 0 | |
| 4 | `S` | stone | solid | 0.8 | 0 | |
| 5 | `C` | cobble | solid | 0.8 | 0 | |
| 6 | `B` | stonebrick | solid | 0.8 | 0 | |
| 7 | `W` | planks | solid soft | 0.4 | 0 | |
| 8 | `T` | log | solid | 0.4 | 0 | |
| 9 | `Y` | leaves | solid soft | 0.3 | 0 | |
| 10 | `1` | coal | solid | 1.0 | 0 | `{ emeralds: 1 }` |
| 11 | `2` | iron | solid | 1.0 | 1 | `{ emeralds: 3 }` |
| 12 | `3` | gold | solid | 1.0 | 2 | `{ emeralds: 5 }` |
| 13 | `4` | diamondore | solid | 1.2 | 2 | `'diamond'` |
| 14 | `5` | infested | solid (sieht aus wie Stein) | 0.8 | 0 | `'silverfish'` |
| 15 | `!` | tnt | solid | 0.2 | 0 | `'tnt'` |
| 16 | `M` | spawner | solid light 3 | 1.5 | 0 | `{ emeralds: 3 }` |
| 17 | `X` | obsidian | solid | 3.0 | 3 | |
| 18 | `Z` | bedrock | solid | null | | |
| 19 | `N` | netherrack | solid | 0.6 | 0 | |
| 20 | `R` | netherbrick | solid | 0.8 | 0 | |
| 21 | `U` | glowstone | solid light 15 | 0.4 | 0 | |
| 22 | `E` | endstone | solid | 0.8 | 0 | |
| 23 | `?` | chest | solid | 0.5 | 0 | `'chest'` |
| 24 | `=` | slab | oneWay | 0.4 | 0 | |
| 25 | `H` | ladder | climb | 0.3 | 0 | |
| 26 | `V` | vine | climb | 0.2 | 0 | |
| 27 | `L` | lava | hazard light 15 | null | | |
| 28 | `~` | water | water | null | | |
| 29 | `J` | slime | solid bounce | 0.3 | 0 | |
| 30 | `\|` | torch | light 14 | 0.1 | 0 | |
| 31 | `,` | plant | (Deko) | 0.1 | 0 | |
| 40 | – | barrier | solid, unsichtbar (Boss-Arena) | null | | |
| 41 | – | chestopen | solid | 0.5 | 0 | |

`PICKS = [{ name: 'wood', mult: 1.0 }, { name: 'stone', mult: 0.7 }, { name: 'iron', mult: 0.5 }, { name: 'diamond', mult: 0.35 }]`.
Abbauzeit = `hard × PICKS[pick].mult`; `pick < minPick` → nicht abbaubar (kurzes „klonk“-Ereignis `digFail`).

**Entitäts-Zeichen** (nicht in tiles, in `parseLevel` erfasst; Position x = Zellmitte, y = Zellunterkante):
`P` Start, `F` Portal (Ziel), `K` Bett (Checkpoint), `o` Smaragd, `*` Diamant, `@` Boss-Start, `y` Endkristall,
Gegner: `c` zischer, `z` zombie, `s` skeleton, `r` spider, `m` slime (groß), `f` silverfish, `g` glutgeist, `e` leerenlaeufer.

## 4. Level-Format (`data/levels/wX-Y.js`)

```js
export default {
  id: 'w1-1', world: 1, theme: 'overworld' | 'depths' | 'nether' | 'end',
  rows: [ /* 30–70 Strings gleicher Länge (100–250) */ ],
  chests: { 'c,r': 'armor' | 'bow' | 'apple' | 'cake' | 'pick_stone' | 'pick_iron' | 'pick_diamond' | 'emeralds' },
  boss: 'slimeking' | 'dreikopf' | 'drache' | undefined,
  pick: 0,   // Mindest-Hacke, die der Spieler beim Levelstart sicher hat (für reach.test); Hacken-Truhen im Level zählen dazu
}
```
Regeln: genau 1 `P`, 1 `F`, ≤ 1 `K`, Diamanten (`*` + Diamanterz `4`) zusammen genau 3, Rand links/rechts/unten aus `Z`
(unten optional Lava/Grube), Boss-Level: genau ein `@`, Arena mit `Z`/`X` umschlossen.

## 5. Physik (`data/physics.js`)

Wie v1 plus: `player: { w: 12, h: 26 }` (feste Größe, `rows` entfällt), `climbSpeed: 70`, `water: { gravity: 350,
maxFall: 70, swim: 150, speedMult: 0.6 }`, `slimeBounce: 560`, `digReach: 1` (Kacheln), `arrowSpeed: 260`,
`arrowGravity: 120`, `maxArrows: 2`.

## 6. Modul-Schnittstellen (verbindlich)

```js
// game/level.js
parseLevel(def) -> LevelMap
// LevelMap = { id, theme, cols, rows, tiles: Uint8Array, get(c,r), set(c,r,v), isSolid(c,r), surface: Int16Array(cols)
//   (erste feste Zeile von oben je Spalte beim Laden; Rückwand gilt für Luft unterhalb), start, checkpoint, goal,
//   spawns:[{type,x,y}], gems:[{x,y,diamond:boolean,taken:false}], chests:{'c,r':kind}, boss, crystals:[{x,y}], pick }
// game/collide.js  (wie v1, ohne feste Zeilenzahl)
moveAndCollide(body, map, dt) -> { hitHead:{c,r}|null, onGround, hitWall, groundId }   // groundId = Kachel unter den Füßen
// game/player.js
createPlayer(x, y, power /* 'plain'|'armor'|'bow' */) -> Player
// Player = { x,y,w,h,vx,vy,face,power,onGround,inWater,climbing,runTimer,coyote,jumpBuffer,jumping,invuln,star,
//            anim:'stand'|'walk'|'run'|'jump'|'fall'|'climb'|'swim'|'dig'|'dead', animTime, dead, digging:boolean }
updatePlayer(game, dt, input) -> { hitHead:{c,r}|null }
setPower(player, power)
// game/dig.js
updateDig(game, dt, input)   // game.dig = { active, c, r, progress 0..1, stage 0..3 } für den Renderer
breakTile(game, c, r, cause /* 'dig'|'head'|'explosion' */) -> boolean   // setzt Luft, markDirty, drop, Sand fallen lassen, Licht neu
// game/light.js
computeLight(map) -> Uint8Array(cols*rows)   // Himmelslicht 15 von oben bis zum ersten festen Block, dann BFS −1 je Schritt
                                             // durch nicht-feste Zellen; feste Zellen bekommen Licht, geben es nicht weiter;
                                             // Eigenlicht (tiles.light) als zusätzliche Quellen
// game/explode.js
explode(game, x, y, radiusTiles)   // Kacheln im Kreis (außer hard===null und obsidian) → breakTile(...,'explosion');
                                   // Mobs im Radius killMob; Spieler im Radius hurtPlayer; TNT im Radius igniteTnt(0.5);
                                   // game.shake = 0.3; emit('explode')
igniteTnt(game, c, r, fuse = 2.0); updateTnt(game, dt)   // gezündetes TNT = Kachel wird Luft + Eintrag in game.tnt (blinkt)
// game/projectiles.js
spawnProjectile(game, type /* 'arrow'|'enemyArrow'|'skull'|'fire' */, x, y, vx, vy) -> obj|null
updateProjectiles(game, dt)   // Pool game.projectiles (16); arrow/enemyArrow: Schwerkraft arrowGravity, stecken in Wänden 1 s fest;
                              // skull: explode(1.5) bei Treffer; fire: gerade, verschwindet an Wänden
// game/mobs.js
createMob(type, x, y) -> Mob    // Mob = { type, x,y,w,h,vx,vy,face,anim,animTime,active,state,timer,hp,onGround,... }
updateMobs(game, dt, prevFeet)  // Bewegung, Kontakt/Stampfen, Aktivierung erst in Sichtweite (viewW + 64)
hitMob(game, m, how /* 'stomp'|'arrow'|'explosion'|'star'|'lava' */); killMob(game, m, how)
updateSpawners(game, dt)        // Spawner-Kacheln aus map (beim Laden gesammelt)
// game/bosses.js
createBoss(kind, x, y) -> Boss; updateBoss(game, dt, prevFeet); damageBoss(game, how)
// Boss = { kind, x,y,w,h,vx,vy,face,anim,animTime,active,state,hp,invuln,parts?:[] }
// game/items.js
spawnPickup(game, kind, x, y)   // kind: 'emerald'|'diamond'|'armor'|'bow'|'apple'|'cake'|'pick_stone'|'pick_iron'|'pick_diamond'
updatePickups(game, dt); openChest(game, c, r); updateFalling(game, dt); updateParticles(game, dt)
spawnDebris(game, c, r, tileId)
// game/game.js
new Game({ level, save, onEvent, viewW = 384, viewH = 240 })
update(dt, input); setView(w, h)
// lesbar: map, light, player, mobs[], boss, projectiles[], pickups[], falling[], particles[], tnt[], dig,
//   camX, camY, shake, time, emeralds, lives, diamonds:[3], pick, score, state: 'play'|'dying'|'won'|'over',
//   dirty/dirtyCount/clearDirty(), lightDirty (Renderer liest game.light neu)
// Methoden für Module: emit, markDirty(c,r), hurtPlayer(cause), loseLife(cause), addEmeralds(n), gainLife(),
//   addScore(n), collectDiamond(i), defeatBoss()
// render/renderer.js
new Renderer(canvas, sprites, { debug }); setView(w, h); setLevel(map, theme); render(game, input, fps)
// render/tilecache.js
buildChunks(map, sprites) -> { chunks: Canvas[][] (256×256), redrawCell(c, r), redrawAll() }
```

**Ereignisse** (`onEvent(name, data)`; Namen = Audio-Funktionen): `jump, emerald, diamond, stomp, dig, digFail, break,
chest, powerup, hurt, arrow, explode, fuse, splash, oneup, checkpoint, portal, die, gameOver, bossHit` + `levelDone`
(`{ time, emeralds, diamonds, score }`), `lifeLost`, `hudChange`.

## 7. Sprites (Vertrag zwischen game/* und render/art/*)

Jedes `*_ART` ist `{ name: { pal: {char:'#rrggbb[aa]'}, frames: [grid,...], flip?: false } }` wie bisher in `sprites.js`
(Zeichenraster, `.` transparent; Raster dürfen per Code erzeugt werden). Pflicht-Namen:

- **Blöcke** (16×16): `blk_<kind>` für jedes `kind` aus §3 außer air/barrier; `blk_lava`, `blk_water`, `blk_torch` je 4 Frames
  (Animation), `blk_portal` gibt es nicht (Portal ist ein Gegenstand). Rückwände `wall_dirt`, `wall_stone`, `wall_nether`,
  `wall_end` (dunkel, 16×16). Risse `crack` 4 Frames (transparent bis auf dunkle Risslinien).
- **Held** (16×28, Hitbox 12×26 mittig unten): `hero_<p>_<anim>` mit p ∈ `plain|armor|bow`, anim ∈ `stand`(1) `walk`(4)
  `jump`(1) `fall`(1) `climb`(2) `swim`(2) `dig`(2) `dead`(1). Blickrichtung rechts; Spiegelung macht der Atlas.
- **Mobs:** `mob_zischer`(2) + `mob_zischer_fuse`(2, hell aufblinkend) 12×24; `mob_zombie`(2) 14×28; `mob_skeleton`(2)
  14×28 + `mob_skeleton_shoot`(1); `mob_spider`(2) 24×12; `mob_slime_big`(2) 16×16; `mob_slime_small`(2) 8×8;
  `mob_silverfish`(2) 12×6; `mob_glutgeist`(2) 16×22; `mob_leerenlaeufer`(2) 10×32. Tot = Renderer zeichnet kopfüber (`flip` vertikal via Canvas).
- **Bosse:** `boss_slime_l`(2) 48×48, `boss_slime_m`(2) 32×32; `boss_dreikopf`(2) 48×40; `boss_drache`(2) 64×32 +
  `boss_drache_perch`(1) 48×40; `crystal`(2) 12×18.
- **Gegenstände/Effekte:** `it_emerald`(2) 10×12, `it_diamond`(2) 12×12, `it_armor` 12×12, `it_bow` 12×12, `it_apple` 10×12,
  `it_cake` 14×10, `it_pick`(3 Frames: stone, iron, diamond) 12×12, `portal`(4) 32×48, `bed` 32×12, `pr_arrow` 10×3,
  `pr_skull` 8×8, `pr_fire` 8×8, `fx_smoke`(4) 16×16, `fx_spark`(2) 4×4.
- **HUD:** `hud_emerald` 8×9, `hud_diamond` 9×9, `hud_slot` 9×9, `hud_head` 9×9, `btn_dig`(2: normal, gedrückt) Kreis Ø 48
  mit Spitzhacke (wie `btn_jump`).

## 8. Licht & Darstellung

- `game.light` (computeLight) beim Laden und nach jeder Kachel-Änderung neu (höchstens 1× pro Schritt, `lightDirty`).
- Renderer: Reihenfolge Himmel/Parallax (theme) → Chunks (Rückwand + Kacheln) → animierte Kacheln (Lava/Wasser/Fackel) →
  Risse (`game.dig`) → Gegenstände, Mobs, Boss, Spieler, Geschosse, Partikel, TNT → **Dunkelheit** → HUD → Knöpfe.
- Dunkelheit: je sichtbarer Zelle `l = max(light, Spielerlicht)`; Spielerlicht = `15 − 2 × Abstand in Kacheln` (Radius ~7);
  Stufen `l ≥ 13: nichts`, `≥ 9: α 0.3`, `≥ 5: α 0.55`, `≥ 2: α 0.75`, sonst `α 0.9`; je Stufe ein `fillStyle`, Zellen dieser
  Stufe gesammelt zeichnen (5 Durchläufe, keine Allokation).
- Chunks 256×256 (16×16 Zellen), 2D-Gitter `chunks[cy][cx]`; nur sichtbare zeichnen. Rückwand: Luft mit `r > surface[c]`
  bekommt `wall_*` je Theme (overworld/depths → stone unterhalb surface+4, sonst dirt; nether; end).

## 9. Bosse (Kurzspezifikation)

- **slimeking** (`@`, Arena 24×10): Riesenschleim 48×48 hüpft alle 1,6 s Richtung Spieler (vy −380). Stampfer → teilt sich in
  2 × mittel (32×32, je 1 Stampfer) → jeder mittlere in 2 × kleine Mobs `slime` (normale Mobs). Besiegt, wenn alle
  Teile weg. `boss.parts` = Liste der Teil-Körper; HP-Anzeige = Anzahl Teile.
- **dreikopf** (Arena 30×14): schwebt auf Höhe 4–6 Kacheln über Boden hin und her (60 px/s), schießt alle 2 s `skull` auf den
  Spieler (explodiert, Radius 1,5, sprengt Blöcke → Arena aus Bruchstein, Rand Grundgestein). 3 Stampfer (Schleimblöcke/Leitern
  in der Arena) oder 10 Pfeile. Ab halber Energie schneller, alle 1,4 s.
- **drache** (Arena 40×18, Leere): 4 Kristalle `y` auf Obsidiansäulen; solange einer steht, ist der Drache unverwundbar und
  fliegt Kreise; Kristall zerstören = Stampfen oder Pfeil (kleine Explosion 1,0). Danach landet er alle 6 s für 2,5 s auf dem
  Portal-Sockel in der Mitte (`perch`) → 4 Stampfer oder 12 Pfeile. Berührung im Flug verletzt.
- Nach dem Sieg: `barrier`-Kacheln verschwinden, Portal `F` wird aktiv (vorher unsichtbar/inaktiv).

## 10. Leistung

Wie v1 (kleine interne Auflösung, Atlas, vorgerenderte Chunks, keine Allokation pro Schritt). Zusätzlich: `computeLight`
≤ 2 ms bei 250×70 (Test), nur bei Änderungen; Pools: projectiles 16, pickups 16, particles 96, falling 8, tnt 8, mobs ≤ 48.

## 11. Tests

- `physics.test.js`: Sprunghöhe/-weite wie v1 (feste Größe), Leiter hoch/runter, Wasser sinkt langsam + Schwimmzug, Schleimblock
  schleudert ≥ 7 Kacheln hoch, Plattform `=` nur von oben.
- `dig.test.js`: Graben unten/seitlich, Abbauzeit × Hacke, minPick, Grundgestein, Erz-Drops, Sand fällt, Kopfstoß bricht soft.
- `explode.test.js`: Radius, Grundgestein/Obsidian bleiben, TNT-Kette, Spieler verletzt, Zischer-Stampfen → Explosion nach 1 s.
- `mobs.test.js`, `bosses.test.js`, `game.test.js` (Kamera vertikal, Portal → levelDone, Bett-Respawn, Smaragde 100 → Leben).
- `levels.test.js` (Format §4) und `reach.test.js`: Breitensuche über Steh-Positionen (laufen, fallen, springen ≤ 4 hoch/≤ 5 weit,
  klettern, schwimmen, Schleim, **Graben** aller abbaubaren Blöcke mit der verfügbaren Hacke): `F` und alle 3 Diamanten von `P`
  erreichbar; bei Boss-Leveln `@`-Arena erreichbar.

## 12. Aufgaben (klein, je ein Haiku-Auftrag; Reihenfolge = Abhängigkeit)

| # | Aufgabe | Dateien |
|---|---|---|
| A1 | Kacheln, Physikwerte, Mob-/Boss-Daten, Level-Parser v2 + Parser-Tests | `data/{tiles,physics,mobs}.js`, `game/level.js`, `test/physics.test.js` (Parser-Teil) |
| A2 | Kollision ohne feste Zeilen + Spieler v2 (feste Größe, Klettern, Wasser, Schleim, Powers) + Tests | `game/{collide,player}.js`, `test/physics.test.js` |
| A3 | Licht | `game/light.js`, Test in `test/dig.test.js` |
| A4 | Graben + Sand + Drops-Hooks | `game/dig.js`, `test/dig.test.js` |
| A5 | Explosionen, TNT, Geschosse | `game/{explode,projectiles}.js`, `test/explode.test.js` |
| A6 | Items v2 (Pickups, Truhen, Fallendes, Partikel) | `game/items.js` |
| A7 | Game v2 (Kamera, Ablauf, Leben, Bett, Portal) mit Mobs-Grundgerüst (nur Zombie) | `game/{game,mobs}.js`, `test/game.test.js`, alte `game/enemies.js`, `data/enemies.js` löschen |
| A8 | Mobs: Zischer, Silberfischchen, Spawner | `game/mobs.js`, `test/mobs.test.js` |
| A9 | Mobs: Skelett, Spinne, Schleim | `game/mobs.js`, `test/mobs.test.js` |
| A10 | Mobs: Glutgeist, Leerenläufer | `game/mobs.js`, `test/mobs.test.js` |
| A11 | Boss Riesenschleim | `game/bosses.js`, `test/bosses.test.js` |
| A12 | Boss Dreikopf | dto. |
| A13 | Boss Leerendrache + Kristalle | dto. |
| B1 | Block-Texturen, Rückwände, Risse | `render/art/blocks.js` |
| B2 | Held | `render/art/hero.js` |
| B3 | Mobs | `render/art/mobs.js` |
| B4 | Bosse, Gegenstände, Effekte, HUD-Symbole | `render/art/{bosses,items}.js` |
| B5 | sprites.js umbauen (Mario-Art raus, *_ART einbinden, btn_dig) | `render/sprites.js` |
| B6 | Tile-Cache 2D + Rückwand | `render/tilecache.js` |
| B7 | Renderer v2 + HUD v2 | `render/{renderer,hud}.js` |
| C1 | Eingabe (Graben-Knopf, ↓/S), Speicherstand v2, Audio-Effekte | `core/{input,save,audio}.js` |
| C2 | Texte DE/PL, Menüs, main.js-Anbindung | `data/strings.js`, `ui/menu.js`, `main.js`, `test/i18n.test.js` |
| D1 | Reach-Suche + Level-Formattest | `test/{levels,reach}.test.js` |
| D2 | Welt 1 (4 Level) | `data/levels/w1-*.js`, `levels/index.js` |
| D3 | Welt 2 (4 Level) | `data/levels/w2-*.js` |
| D4 | Welt 3 (4 Level) | `data/levels/w3-*.js` |

Meilenstein 1 = A1–A11, B1–B7, C1–C2, D1–D2 → Welt 1 spielbar (Welten 2/3 in der Levelauswahl „bald“), Push nach main.
Meilenstein 2 = A12–A13, D3–D4 → alle 12 Level, Review, Push nach main.

## 13. Notizen aus den Aufgaben

(Opus ergänzt hier nach jedem Review, was spätere Aufgaben wissen müssen.)
