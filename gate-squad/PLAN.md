# Gate Squad – Architektur & Umsetzungsplan

Offline-HTML5-Arcade-Shooter (PWA), Vanilla JS (ES-Module), Canvas 2D, kein Build-Schritt.
Ziel: Chrome auf Pixel 8a, hochkant (412×915 CSS-px), Touch.

---

## 1. Dateistruktur

```
gate-squad/
  index.html            Canvas + DOM-Overlays (Menüs), lädt js/main.js als Modul
  manifest.json         PWA-Manifest (standalone, portrait, Theme #1b1f1a)
  sw.js                 Service Worker, cache-first, Versionskonstante CACHE_VERSION
  css/style.css         Menü-/Overlay-Styles (Militär-Look, orange Akzent #ff7a1a)
  icons/icon.svg        Quell-Icon, icons/icon-192.png, icons/icon-512.png, icons/maskable-512.png
  README.md             Deploy + Installation
  PLAN.md               dieses Dokument
  js/
    main.js             Bootstrap: Save laden, Audio, UI, Game, SW registrieren, Debug-Flags
    config.js           Feste technische Konstanten (WORLD_W, Tick-Rate, Pool-Größen, Farben)
    core/
      loop.js           Fixed-Timestep-Loop (60 Hz Update, rAF-Render, dt-Clamp)
      input.js          Pointer-Events → Ziel-X des Squads (relativ ziehen)
      audio.js          WebAudio-Synth (Schüsse je Waffe, Explosion, Tor, Kiste, Sieg, Niederlage)
      haptics.js        navigator.vibrate-Wrapper (respektiert Einstellung, Throttle)
      pool.js           Generischer Objekt-Pool
      rng.js            Seeded RNG (mulberry32) + Helfer
      save.js           Versioniertes Save, localStorage → Fallback IndexedDB → Fallback Memory
    data/
      balance.js        Zentrale Balancing-Konstanten + Formeln (hpMult, coins, gateCost …)
      weapons.js        7 Waffen
      attachments.js    5 Attachments
      enemies.js        Gegnertypen + Boss-Typen
      upgrades.js       Permanente Shop-Upgrades
      levels.js         20 handgebaute Level
      procgen.js        Endlos-Level ab 21 (seeded)
    game/
      game.js           Game-Klasse: Zustand, update(dt), Kollisionen, Spielende
      levelRunner.js    Spawnt Events nach zurückgelegter Distanz
      bot.js            Autopilot für Tests (?autoplay=1)
    entities/
      squad.js          Truppe: Anzahl, Formation, Feuern, Waffe, Attachments
      projectiles.js    Spieler-Kugeln + Granaten + Gegner-Kugeln (gepoolt)
      enemies.js        Gegner-Update (gepoolt)
      gates.js          Zahlentore, Waffentore
      crates.js         Attachment-Kisten
      boss.js           Boss/Fahrzeug
      particles.js      Partikel (Mündungsfeuer, Rauch, Funken, Explosion, Schwebetexte), gepoolt
    render/
      renderer.js       Canvas-Setup (DPR ≤ 2), Weltskalierung, Screen-Shake, zeichnet alles
      sprites.js        Prozedurale Zeichenfunktionen (Soldat, Gegner, Fahrzeug, Tor, Kiste, Icons)
      background.js     Scrollender Boden (Asphalt/Erde, Markierungen, Sandsäcke)
      hud.js            HUD im Canvas (Truppe, Waffe, Attachment-Icons, Fortschritt, Münzen, FPS)
    ui/
      ui.js             DOM-Screens: Hauptmenü, Levelauswahl, Shop, Einstellungen, Pause, Ergebnis
```

Das Spiel liegt im Unterordner `gate-squad/` des Repos (Sudoku bleibt unberührt) und ist
unter `https://<user>.github.io/<repo>/gate-squad/` erreichbar. Alle Pfade **relativ**.

## 2. Koordinatensystem & Rendering

* Logische Weltbreite `WORLD_W = 360`. Welthöhe `WORLD_H = round(360 * innerHeight / innerWidth)`
  (Pixel 8a: ≈ 800). Renderer skaliert `scale = canvas.width / WORLD_W`.
* Canvas-Pixel = CSS-Größe × min(devicePixelRatio, 2).
* Squad steht fest bei `SQUAD_Y = WORLD_H - 150`. Alle Weltobjekte haben Bildschirm-Y und
  bewegen sich mit `scrollSpeed` (Einheiten/s) nach unten (+ Eigengeschwindigkeit).
* Oben 64 Einheiten HUD-Band (Objekte spawnen bei y = -40 darüber hinaus, sind also sofort sichtbar unter dem HUD nach kurzer Zeit).

## 3. Game-Loop

```
loop.js: start(update, render)
  acc += min(now - last, 250ms)
  while acc >= STEP (1/60 s): update(STEP); acc -= STEP   (max 5 Steps/Frame)
  render(alpha)
```
Pause: `loop.paused = true` → update wird nicht aufgerufen, render läuft weiter (zeigt eingefrorenes Bild).
Bei `visibilitychange` (hidden) → Spiel pausiert automatisch, Pausenmenü sichtbar.

## 4. Datenmodelle

### Waffe (`data/weapons.js`)
```js
{ id:'mp5', name:'MP5', tier:0, damage:10, fireRate:6, range:330, bulletSpeed:900,
  spread:4 /*Grad*/, pierce:0, bulletLen:8, bulletWidth:2, color:'#ffd27a',
  sound:{ type:'smg', freq:900, decay:0.05, noise:0.6 } }
```
| Tier | Waffe  | Schaden | Feuerrate/s | DPS/Soldat | Reichweite | Besonderheit |
|------|--------|---------|-------------|------------|------------|--------------|
| 0 | MP5    | 10  | 6.0  | 60  | 330 | – |
| 1 | UMP-45 | 15  | 5.5  | 83  | 350 | – |
| 2 | G36    | 18  | 6.5  | 117 | 420 | – |
| 3 | M4A1   | 20  | 8.0  | 160 | 440 | – |
| 4 | SCAR-H | 38  | 5.5  | 209 | 480 | pierce 1 |
| 5 | M249   | 21  | 13.0 | 273 | 460 | – |
| 6 | M82    | 150 | 2.4  | 360 | 650 | pierce 3, große Projektile |

### Attachment (`data/attachments.js`)
```js
{ id:'reddot', name:'Rotpunkt', icon:'reddot', mods:{ rangeMul:1.2 } }
```
| id | Name | Effekt |
|----|------|--------|
| reddot | Rotpunktvisier | range ×1.20 |
| comp | Kompensator | fireRate ×1.10, spread ×0.5 |
| extmag | Erw. Magazin | fireRate ×1.15 |
| hollow | Hohlspitz | damage ×1.25 |
| ugl | Unterlauf-GL | alle 2.5 s Granate: Flächenschaden 60 + 3×Waffenschaden, Radius 55 |

**Entscheidung Waffenwechsel:** Beim Waffen-Upgrade bleiben die **2 zuletzt erhaltenen**
Attachments erhalten, ältere gehen verloren. So ist ein Waffentor mit 4 Attachments eine echte
Abwägung (später Level), früh ist es fast immer ein Gewinn. Duplikate gibt es nicht: Kisten
geben ein zufälliges noch nicht ausgerüstetes Attachment; sind alle 5 ausgerüstet → +3 Soldaten.

### Gegner (`data/enemies.js`)
```js
{ id:'infantry', hp:30, speed:38, homing:18, radius:9, contact:1, coins:1, color:'#7d8a6a' }
```
| id | HP (L1) | Speed | Homing x | Kontakt-Verluste | Besonderheit |
|----|---------|-------|----------|------------------|--------------|
| infantry | 30 | 38 | 18 | 1 | – |
| runner   | 16 | 105 | 35 | 1 | ab Level 3 |
| shield   | 40 (+Schild 110) | 28 | 12 | 2 | Schild frontal, blockt Kugeln; Granaten ignorieren Schild; ab Level 5 |
| sniper   | 40 | 30 | 0 | 1 | stoppt bei y=150, Laser-Telegraph 1.2 s, dann Schuss (tötet 1), Intervall 3.5 s; ab Level 7 |
| apc (Mini-Fahrzeug) | 500 | 22 | 8 | 4 | ab Level 10 als Welle |

Bosse: `boss_apc` (L1–6), `boss_tank` (L7–13), `boss_fortress` (L14+). Boss stoppt bei y=150,
fährt seitlich hin und her, feuert Granaten auf markierte Bodenkreise (Telegraph 1.4 s,
tötet max. `min(4, 10 % der Truppe)` Soldaten im Radius), und rückt mit `advance` Einheiten/s
langsam vor. Erreicht er die Squad-Linie: Truppe verliert pro Sekunde 20 % (kein Instant-Tod).

### Tore (`entities/gates.js`)
Tore kommen paarweise (linke/rechte Bildhälfte) oder einzeln (eine Hälfte frei).
```js
{ kind:'num', op:'add'|'mul', value:5|-5|2|0.5, hitsTaken:0, pointCost:<Schaden pro +1> }
{ kind:'weapon', unlockHp:220, locked:true }   // muss erst freigeschossen werden
```
* `add`: Wert steigt um 1 pro `pointCost` Schaden, max `value + GATE_MAX_GAIN (15)`.
* `mul`: Stufen `[0.33, 0.5, 1, 2, 3]`; nächste Stufe kostet `pointCost × 12`. Max 3.
* Ergebnis Truppe: `add` → `n + v`, `mul` → `round(n × v)`, **immer min. 1** (kein Instant-Tod durch Tore).
* Tore blockieren Kugeln (Kugeln treffen das Tor) → Zielkonflikt Tor anschießen vs. Gegner dahinter.
* Waffentor: gesperrt (grau, HP-Balken). Freigeschossen → Durchlaufen = nächste Waffenstufe.
  Gesperrt durchlaufen = nichts.

### Attachment-Kiste (`entities/crates.js`)
`{ hp: 120 × hpMult }`, fällt mit Scroll-Speed. Zerschossen → Attachment sofort aktiv.
Läuft der Squad hinein (ungeöffnet), wird sie ebenfalls geöffnet (kleinere Belohnung: nur Attachment).

### Level (`data/levels.js`)
```js
{ id:1, name:'Grenzposten', length:2200, scroll:70, boss:'boss_apc', bossHp:3500,
  events:[
    { d:150, t:'wave', enemy:'infantry', count:5, pattern:'line' },   // line|v|column|random|wall
    { d:500, t:'gates', left:{op:'add',v:5}, right:{op:'add',v:-3} },
    { d:900, t:'weapon', side:'left', other:{op:'add',v:4} },        // Waffentor + Zahlentor
    { d:1200,t:'crate', x:0.5 },                                       // x in 0..1 der Breite
    { d:1400,t:'gate', side:'right', g:{op:'mul',v:2} },              // Einzeltor
  ]}
```
`hpMult(level)` aus balance.js wird auf alle Gegner/Kisten/Waffentor-HP angewandt.

### Save (`core/save.js`) – Format v1
```js
{ v:1, unlocked:1, coins:0,
  upgrades:{ squad:0, weapon:0, damage:0, fireRate:0 },
  best:{ "<level>": { survivors, coins } }, endlessBest:0,
  settings:{ sound:true, vibration:true } }
```
`load()` async: localStorage → IndexedDB → Default; migriert unbekannte Versionen per `migrate()`.
`save()` schreibt in localStorage, bei Fehler IndexedDB. Alles in try/catch.

## 5. Balancing-Formeln (`data/balance.js`)

```
hpMult(L)        = 1 + 0.20·(L−1)                           (L ≤ 20)
                 = hpMult(20) · 1.07^(L−20)                 (Endlos)
bossHp(L)        = level.bossHp · hpMult(L)   (Endlos: 3500·(1+0.35(L−1))·hpMult(L)/1.6)
gatePointCost(L) = 8 + 2.5·L      Schaden pro +1 am Tor
weaponGateHp(L)  = 180 · hpMult(L)
crateHp(L)       = 120 · hpMult(L)
Kugeldarstellung: shooters = min(n, 24); Schaden/Kugel = dmg · n / shooters
coinsForWin(L)   = 20 + 6·L + 2·survivors + kills/2 ;  Niederlage: 30 % davon (Fortschritt fühlt sich trotzdem lohnend an)
Startwerte: Truppe 3 + upgrade.squad, Waffe tier = upgrade.weapon (max 3)
Shop: damage +8 %/Stufe (max 10), fireRate +6 %/Stufe (max 10), squad +1 (max 15),
      Startwaffe +1 Tier (max 3)
Kosten: cost(base, growth, lvl) = round(base · growth^lvl)
   squad 40·1.35^l, damage 60·1.4^l, fireRate 60·1.4^l, weapon 400·2.5^l
```
Ziel-Gefühl: L1–4 Tutorial-leicht (nur positive/harmlose Tore, keine Konflikte), L5–7 erste
negative Tore + Schildträger, ab L8 brauchen Boss-Kämpfe ≈ 15+ Soldaten mit Tier ≥ 2 → bewusst Tore wählen
und negative Tore hochschießen. Gegnerkontakt kostet Soldaten statt sofortigem Tod.

## 6. Modul-Schnittstellen (verbindlich für alle Arbeitspakete)

```js
// core/pool.js
export class Pool { constructor(factory, size); get(); release(obj); forEach(fn); get activeCount(); clear() }
//   Objekte haben .active (bool). get() liefert inaktives Objekt (wächst bei Bedarf), setzt active=true.
// core/rng.js
export function mulberry32(seed) -> () => float[0,1)
export function randRange(rng,a,b); export function randInt(rng,a,b); export function pick(rng,arr)
// core/loop.js
export class Loop { constructor(update, render); start(); stop(); paused:boolean; fps:number }
// core/input.js
export class Input { constructor(canvas, getScale); attach(); detach(); reset(); dragging:boolean;
                     consumeDeltaX() -> Welt-Einheiten (CSS-px-Delta / scale) seit letztem Aufruf }
//   Relatives Ziehen (Finger muss nicht auf dem Squad liegen), Pointer Events, preventDefault,
//   touch-action:none. getScale() liefert CSS-px pro Welteinheit.
// core/audio.js
export const audio = { init(), setEnabled(b), shot(weaponId), explosion(size), hit(), gate(good:boolean),
                       upgrade(), crate(), coin(), win(), lose(), click() }
// core/haptics.js
export const haptics = { setEnabled(b), tap(), bump(), heavy() }  // 10/25/[40,30,60] ms, max 1x pro 60ms
// core/save.js
export async function loadSave() -> SaveData; export function writeSave(data); export function defaultSave();
export function resetSave() -> SaveData
// data/*.js  – reine Daten + Helfer
export const WEAPONS (Array nach tier), ATTACHMENTS (Objekt by id), ENEMIES (by id), BOSSES (by id),
            UPGRADES (Array), LEVELS (Array, index 0 = Level 1), BAL (Konstanten) + Funktionen aus §5
export function getLevel(n) -> Level   (data/levels.js; n>20 ruft procgen.generateLevel(n))
// game/game.js
export class Game {
  constructor({ save, onEnd, onHudChange })
  start(levelNumber)            // baut alles auf, state='play'
  update(dt)                    // nur wenn state==='play'
  state: 'idle'|'play'|'won'|'lost'
  // öffentliche Felder für Renderer/HUD:
  squad, enemies(Pool), bullets(Pool), grenades(Pool), enemyBullets(Pool), gates[], crates[],
  boss|null, particles(Pool), distance, level, shake, coinsEarned, kills, time, debug:{god,fps}
}
// onEnd({ won, level, survivors, coins, kills })
// render/renderer.js
export class Renderer { constructor(canvas); resize(); render(game, fps) }
```

## 7. Performance

* Pools: Kugeln 800, Gegner-Kugeln 64, Granaten 32, Gegner 160, Partikel 600.
* Keine Allokationen im Update-Hotpath (keine `filter/map` pro Frame auf Pools, keine Closures).
* Kollisionen: Gegneranzahl klein (< 80) → Kugel × Gegner mit Früh-Abbruch über y-Band.
  Kugel-Update prüft zuerst Tore/Kisten (wenige), dann Gegner.
* Max. 24 sichtbare schießende Soldaten, max. 40 gezeichnete Soldaten (Zahl im HUD).
* Hintergrund: vorgerenderte Kachel (OffscreenCanvas/Canvas) wird gescrollt.

## 8. Debug-Modus (`?debug=1`)
FPS-Anzeige, alle Level freigeschaltet + Eingabefeld „Level springen“ im Menü,
Unverwundbarkeit (Truppe sinkt nie unter Startwert-Verlust; Toggle-Button im HUD),
`window.__gs` = { game, save, ui } für Tests. `?autoplay=1` aktiviert Bot (steuert zum besseren Tor,
weicht Gegnern aus) – für automatisierte Durchläufe.

## 9. Arbeitspakete (Implementer = Haiku-Subagent, je Paket ein Auftrag)

| # | Paket | Dateien | Abhängig |
|---|-------|---------|----------|
| WP1 | Gerüst: index.html, css/style.css, config.js, core/pool.js, core/rng.js, core/loop.js, core/input.js, core/haptics.js | s. o. | – |
| WP2 | Daten: balance.js, weapons.js, attachments.js, enemies.js, upgrades.js | data/ | – |
| WP3 | Level: levels.js (20 Level), procgen.js | data/ | WP2 |
| WP4 | Audio-Synth | core/audio.js | – |
| WP5 | Save-System | core/save.js | – |
| WP6 | Entities + Game-Core | entities/*, game/game.js, game/levelRunner.js | WP1–3 |
| WP7 | Rendering + HUD | render/* | WP6 |
| WP8 | UI-Screens + main.js (Menü, Level, Shop, Settings, Pause, Ergebnis, visibilitychange) | ui/ui.js, main.js | WP4–7 |
| WP9 | Debug + Bot | game/bot.js, Ergänzungen main/hud | WP8 |
| WP10 | PWA: manifest, sw.js, Icons, README, Pages-Workflow | – | alle |

**Meilenstein-Reviews (Opus):** nach WP3 (Datenkonsistenz/Balancing), nach WP7 (spielbarer Kern,
Browser 412×915), nach WP9 (Bot-Durchlauf L1–10), nach WP10 (Offline-Test, Lighthouse-Basics).

## 10. Entity-Felder (Vertrag zwischen Game-Core WP6 und Renderer WP7)

Alle Koordinaten in Welteinheiten, Bildschirm-y (0 oben). `game.H` = Welthöhe, `game.W` = 360.

```js
game = {
  W, H, SQUAD_Y,                     // SQUAD_Y = H - CFG.SQUAD_OFFSET
  state: 'idle'|'play'|'won'|'lost', phase: 'run'|'boss',
  levelNum, level, distance, scroll, time, kills, coinsEarned,
  shake,                             // Amplitude in Einheiten, klingt ab (renderer liest nur)
  banner: { text, t, color } | null, // großer Einblendtext (t = Restzeit s), z. B. "BOSS!", "M4A1!"
  debug: { god:false },
  squad, bullets, grenades, enemyBullets, enemies, particles,  // Pools (forEach)
  gates: [], crates: [], boss: null
}
squad = { x, y, count, shownCount /*für animierte Anzeige*/, weaponTier, weapon /*WEAPONS-Eintrag*/,
          attachments: [ids], stats /*computeStats*/, radius, slots: [{ox, oy}] /*CFG.MAX_DRAWN_SOLDIERS*/,
          fireTimer, grenadeTimer, muzzle /*0..1*/, hurt /*0..1 roter Blitz*/, walk /*Animationsphase*/ }
  // Formation: Slot i: a = i·2.39996, r = BAL.FORMATION_SPACING·0.9·sqrt(i); gezeichnet min(count, MAX_DRAWN).
  // radius = BAL.FORMATION_SPACING·0.9·sqrt(min(count, MAX_DRAWN)) + 7
bullet       = { active, x, y, vx, vy, dmg, life, pierce, len, width, color, hitId }
grenade      = { active, x0, y0, x, y, tx, ty, t, dur, dmg, radius }   // Bogen: Höhe = sin(π·t/dur)·40
enemyBullet  = { active, x, y, vx, vy }
enemy        = { active, def /*ENEMIES-Eintrag*/, x, y, hp, maxHp, shield, maxShield, r,
                 state:'walk'|'stopped'|'aim', timer, aimX, aimY, flash /*0..1*/, walk, uid }
gate         = { kind:'num'|'weapon', x /*linke Kante*/, w, y /*Mitte*/, h:44, op, value,
                 progress /*0..1 bis nächster Punkt*/, pointCost, used, locked, unlockHp, unlockMax, flash, row }
crate        = { x, y, r:15, hp, maxHp, opened, flash }
boss         = { def /*BOSSES-Eintrag*/, x /*Mitte*/, y /*Mitte*/, w, h, hp, maxHp, dir, entering,
                 shellTimer, shells:[{active, x, y, t, dur}], flash, turret /*Winkel*/ }
particle     = { active, kind:'spark'|'smoke'|'flash'|'debris'|'text'|'ring'|'casing',
                 x, y, vx, vy, life, maxLife, size, color, text }
```
Tor-Anzeige-Text: op add → `+5` / `-5`; mul → `x2`, `x3`, `x1`, `÷2` (0.5), `÷3` (0.33).
Gute Tore (Ergebnis > aktuell) grün/blau getönt, schlechte rot getönt; Waffentor orange mit Waffenname
der nächsten Stufe, gesperrt mit HP-Balken.

## 11. Review-Ergebnisse & Balancing-Entscheidungen (Opus, nach Bot-Durchläufen)

Gemessen mit `?debug=1&autoplay=1&chain=1&shop=1&speed=8` (Profi-Bot) und zusätzlich `&bot=casual`
(Gelegenheitsspieler: bewertet Tore nur nach aktuellem Wert, wählt in 35 % der Reihen das
schlechtere Tor, weicht nie aus). Beide kaufen zwischen Leveln das günstigste Upgrade.

Gefundene Probleme und Korrekturen gegenüber §4/§5:

| Problem (gemessen) | Korrektur |
|---|---|
| Boss & Scharfschützen hielten bei y=150, Trupp bei ~650 → außerhalb MP5-Reichweite (Boss-Kampf 32 s, Sniper unbesiegbar) | Halte-Abstand relativ zur Truppe: `BOSS_STOP_DIST 300`, `SNIPER_STOP_DIST 290` |
| L2 mit 3 Startsoldaten unschaffbar: Kugeln nur senkrecht, breite Reihen laufen in den Kontakt | Auto-Zielkegel ±0,45 rad (`AIM_CONE`), Feuer zeitversetzt statt Salven |
| Gegner hinter Toren unverwundbar (Tore schluckten alle Kugeln, Gegner laufen schneller als das Scrollen) | Kugeln laden das Tor auf und fliegen mit 60 % Schaden weiter (`GATE_PASS_DMG`) |
| Erste Welle überholt das Start-Tor → Tod nach 10 s | Jedes Level beginnt mit einem Tor-Paar direkt auf dem Bildschirm (`yFrac 0.45`), erste Welle ab d=330 |
| Exponentielles Wachstum (213 Soldaten in L1) | x2-Tore erst ab L6; Beschuss: add max +6, mul max bis x2; Punktkosten × (1 + Truppe/12); Cap 300 |
| Linear skalierende Feuerkraft machte Bosse trivial | Ab 24 Schützen Schaden/Kugel ∝ (Truppe/24)^0.5 (`FIREPOWER_EXP`) |
| Boss starb in der Einfahrt, bevor er schoss | Einfahrt 140 E/s und unverwundbar, erste Salve 1 s nach Ankunft, Vorrücken 7–9 E/s (Zeitdruck ≈ 25–40 s) |
| Waffenkette endete bei UMP-45 (1 Waffentor/Level) | Waffentore: L1–3: 1, L4–6: 2, L7–10: 3, L11–15: 4, L16–20: 5 |
| Boss-HP-Sprung L20 → L21 (2,7 M → 0,9 M) | Einheitlich `4000·1.11^(L−1) · hpMult(L) · BOSS_HP_SCALE(7)` |

Finale Kurven: `hpMult(L) = 1 + 0.3·(L−1)` (ab 21: ×1.07/Level), Wellen ×1.4, Niederlage gibt 40 % Münzen.

**Attachments bei Waffenwechsel:** die 2 zuletzt erhaltenen bleiben (unverändert, siehe §4).

Ergebnis (Level 1–10): Profi-Bot gewinnt alle im ersten Versuch (Bosskampf 9–17 s);
Gelegenheits-Bot gewinnt L1–7 sicher, L8 knapp, L9/L10 erst nach Fehlversuchen + Shop-Upgrades –
d. h. ab Level 8 muss man Tore bewusst wählen/anschießen bzw. Upgrades kaufen.

### Nachtrag Level 11–20 und Endlos (Node-Simulation mit `game.js` + Bot, headless)

* Boss-Basis-HP: bis L10 ×1,11/Level, danach ×1,06 (`bossBase(L)`), gleiche Formel für Endlos.
* Waffentore: L11–15: 5, L16–20: 6; Endlos mindestens 5 (Procgen wandelt Tor-Paare um),
  Procgen-Gewichtung Wellen 50 % / Tore 32 % / Waffe 10 % / Kiste 8 %.
* Shop „Startwaffe“: 300·2,2^n (vorher 400·2,5^n).
* Ergebnis: Profi mit mittleren Upgrades gewinnt L12/15/18/20; Gelegenheitsspieler verliert diese,
  solange er Waffentore nicht gezielt freischießt – mit voll ausgebautem Shop gewinnt er sie aber
  (Grind-Pfad, erreicht M82 in L20). Endlos mit vollem Shop: bis ≈ L28 schaffbar, danach Rekordjagd.

Die Level-Daten in `levels.js` wurden aus den handgebauten Vorlagen mit diesen Regeln
(Start-Tor, Waffentor-Anzahl, x2 erst ab L6, x3 erst ab L8, Mindestabstand 150) überarbeitet.
