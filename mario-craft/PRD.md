# Mario Craft – Product Requirements (v2: Blockwelt)

Jump'n Run mit dem Spielgefühl klassischer 2D-Plattformer (laufen, springen, stampfen) in einer Blockwelt im
Minecraft-Stil. Neu gegenüber v1: **Graben**, hohe Level (runter in Höhlen und Dungeons, wieder hoch ans Licht),
Monster im Blockstil, explodierende Zischer. Designvorschlag mit Daniel abgestimmt am 2026-10-23.

**Namen:** eigene Namen bei Blockwelt-Aussehen (Seite ist öffentlich; Namen/Figuren von Mojang/Microsoft werden nicht
übernommen, kein Nachbau von Steve, Creeper-Gesicht etc. 1:1). Allgemeine Wörter (Zombie, Skelett, Spinne, Schleim) bleiben.

## 1. Ziel & Rahmen (unverändert zu v1)

| | |
|---|---|
| Geräte | Google Pixel 8a (2400×1080) und Lenovo Tab M11 (1920×1200, schwach), Chrome, **Querformat** |
| Leistung | 60 fps auf beiden, scharfe Pixel (interne Auflösung ~15 Kacheln hoch, ganzzahlig skaliert) |
| Technik | Vanilla JS (ES-Module), Canvas 2D, kein Build, keine externen Dateien |
| Auslieferung | `mario-craft/` im Repo `games`, GitHub Pages, offline (PWA), Cache-Präfix `mariocraft-` |
| Sprache | Deutsch und Polnisch, umschaltbar |

Nicht in v2: Blöcke setzen (Bauen), Inventar, Loren, Musik, Mehrspieler.

## 2. Spielablauf

Startbildschirm → Levelauswahl (3 Welten × 4 Level) → Level → Levelende. Wie v1 (Pause, Speichern, Game Over setzt die
Welt auf Level 1 zurück, Leben wieder 3).

Jedes Level folgt grob dem Weg **Oberfläche → Abstieg (graben, Schluchten) → Höhle/Dungeon → (Boss) → Aufstieg →
Portal**. Level sind 100–250 Blöcke breit und 30–70 Blöcke hoch; die Kamera folgt in beide Richtungen.

| Welt | Oben | Unten | Boss (Level 4) |
|---|---|---|---|
| 1 Oberwelt | Wiese, Wald | Höhlen, erster Dungeon | **Riesenschleim** – teilt sich bei Stampfern (groß → 2 mittel → je 2 klein) |
| 2 Tiefen | Berge, Schlucht | großer Dungeon, Lavaseen | **Dreikopf** – schwebt, schießt explodierende Schädel |
| 3 Nether & Leere | Glutwelt (Nether-artig) | Leere mit schwebenden Inseln | **Leerendrache** – erst 4 Kristalle zerstören, dann stampfen, wenn er landet |

## 3. Spielfigur

- Bewegung und Sprungwerte wie v1 (variable Sprunghöhe, Renntempo, Coyote Time, Jump Buffer).
- **Feste Größe** 12×26 px (passt durch 2 Blöcke hohe Gänge). Zustände: **ohne Rüstung → Rüstung → Rüstung + Bogen**.
  Treffer: Bogen → Rüstung → ohne → Leben verloren. Rüstung ist an der Figur sichtbar.
- **Leitern/Ranken:** Sprung halten = hochklettern, Graben halten = runterklettern, sonst festhalten.
- **Wasser:** langsam sinken, Sprung = Schwimmzug nach oben.
- **Schleimblock:** Landen schleudert hoch (ca. 8 Blöcke).

## 4. Graben

- Knopf **Graben** (Spitzhacke) rechts. Allein = Block unter den Füßen; mit ◀/▶ = Block daneben (bei 2 hohen
  Blöcken erst unten, dann oben). Halten: Risse (4 Stufen), dann bricht der Block.
- **Spitzhacke trifft Mobs:** Graben (allein = nach unten, mit ◀/▶ = zur Seite) besiegt Gegner in 1 Block Reichweite
  (Abklingzeit 0,35 s, 1 Schaden; Bosse nicht). Ein Zischer wird so ohne Explosion erledigt.
- **Kopfstoß** bricht weiche Blöcke (Erde, Gras, Sand, Blätter, Bretter) sofort.
- Abbauzeit = Härte × Faktor der Spitzhacke. Spitzhacken: Holz (Start) 1,0 → Stein 0,7 → Eisen 0,5 → Diamant 0,35.
  Manche Blöcke brauchen eine Mindest-Spitzhacke (Obsidian: Diamant). Grundgestein nie.

| Block | Härte (s) | Mindest-Hacke | Ergebnis |
|---|---|---|---|
| Erde, Gras, Sand, Blätter | 0,3 | – | – (Sand fällt, wenn darunter frei) |
| Holz, Bretter | 0,4 | – | – |
| Stein, Bruchstein, Steinziegel, Glutstein | 0,8 | Holz | – |
| Kohle-/Eisen-/Golderz | 1,0 | Holz/Stein/Eisen | 1/3/5 Smaragde |
| Diamanterz | 1,2 | Eisen | Diamant (einer der 3 im Level) |
| Getarnter Stein | 0,8 | Holz | Silberfischchen springt heraus |
| TNT | 0,2 | – | zündet (2 s) |
| Monster-Spawner | 1,5 | Holz | Spawner weg, 3 Smaragde |
| Obsidian | 3,0 | Diamant | – |
| Grundgestein | – | – | unzerstörbar |

## 5. Gegner

| Gegner | Verhalten | Besiegen |
|---|---|---|
| **Zischer** (explodierender Blockgeist, grün) | läuft ab 8 Blöcken Abstand auf dich zu; ab 1,5 Blöcken: steht, blinkt, zischt 1,5 s → Explosion | Stampfen **zündet** ihn (1 s Flucht), Pfeil oder Spitzhacke besiegen ihn ohne Explosion |
| **Zombie** | langsam auf dich zu, fällt von Kanten | stampfen, Pfeil, Spitzhacke |
| **Skelett** | hält 4–6 Blöcke Abstand, spannt 0,8 s sichtbar den Bogen, schießt dann alle 2 s einen (langsamen, 105 px/s) Pfeil. Der Pfeil **lähmt** nur 0,9 s (Sterne über dem Kopf, danach 1,6 s Schonzeit), kostet weder Rüstung noch Leben | stampfen, Pfeil, Spitzhacke |
| **Spinne** | schnell, klettert Wände hoch, springt dich ab 3 Blöcken an | stampfen, Pfeil, Spitzhacke |
| **Schleim** | hüpft auf dich zu; groß → 2 klein | stampfen, Pfeil |
| **Silberfischchen** | klein, flink, aus getarntem Stein | stampfen, Pfeil |
| **Glutgeist** (Welt 3) | schwebt, schießt alle 3 s drei Feuerkugeln | nur Pfeil (Stampfen verbrennt) |
| **Leerenläufer** (Welt 3) | harmlos; berührt man ihn, teleportiert er neben dich und greift an | 2 Stampfer, Pfeil |

**Herzen:** Jedes Leben hat **10 Herzen** (zweite HUD-Zeile unter Smaragden/Leben, rot = voll). Schaden: Zombie/Mob-Berührung
und Sand 1 Herz, Feuer 2, Explosion und Boss 3. Rüstung/Bogen senken jeden Schaden um 1 (mindestens 1) und bleiben
beim Treffer erhalten. Nach einem Treffer 1,5 s unverwundbar. Bei 0 Herzen geht ein Leben verloren (Neustart am
Checkpoint mit vollen Herzen). **Essen** liegt in jedem Level verteilt (3–7 Stück, Generator-Schritt `gen/food.mjs`,
Level-Zeichen `a`/`q`): **Brot** +2 Herzen, **Steak** +4 Herzen; bei vollen Herzen bleibt es liegen. Kuchen: +1 Leben und volle Herzen. Lava und Abgrund töten weiterhin sofort.

**Explosion** (Zischer, TNT, Schädel): Radius 2,5 Blöcke (Schädel 1,5), zerstört alle Blöcke außer Obsidian und
Grundgestein, besiegt Gegner, verletzt die Figur, zündet TNT in Reichweite (0,5 s). Bildschirmwackeln, Vibration.
**Skelett-Dungeons:** Im Schussfeld jedes Skeletts (10 Blöcke, ebenerdig) sind die Decken mindestens 4 Zeilen
hoch (Generator-Schritt `gen/headroom.mjs`), damit man über Pfeile springen kann.
**Monster-Spawner** erzeugen alle 4 s einen Zombie oder ein Skelett, solange die Figur ≤ 10 Blöcke entfernt ist
(max. 3 lebende je Spawner). **Lava** tötet sofort.

## 6. Gegenstände

| Gegenstand | Herkunft | Wirkung |
|---|---|---|
| **Truhe** | Block, von unten anstoßen oder abbauen | gibt ihren Inhalt (Level-Datei), sonst 3 Smaragde |
| **Smaragd** | frei, aus Erzen, Truhen | 100 = 1 Leben |
| **Diamant** | frei oder Diamanterz, genau 3 je Level | Levelauswahl zeigt sie |
| **Rüstung** | Truhe | ein Treffer mehr |
| **Bogen** | Truhe | Pfeile (Feuerknopf, max. 2 gleichzeitig) |
| **Goldener Apfel** | Truhe | 8 s unverwundbar, Gegner fliegen bei Berührung |
| **Kuchen** | Truhe, versteckt | 1 Leben |
| **Spitzhacke** (Stein/Eisen/Diamant) | Truhe | bessere Hacke, **bleibt gespeichert** |
| **Bett** | im Level | Checkpoint |
| **Portal** | Levelende | Level geschafft (Boss-Level: erscheint nach dem Sieg) |
| **Fackel** | im Level | Licht |

## 7. Grafik

- 16×16-Blocktexturen mit Pixelrauschen im Blockstil (Gras mit Seitengras, Erz-Sprenkel, Bruchstein, Holzmaserung).
- Unter der Oberfläche liegt hinter Luft eine dunkle **Rückwand**; Höhlen werden mit der Tiefe dunkler, Licht um
  Fackeln, Lava, Glutstein, Portal und die Figur (Radius 4 Blöcke).
- Risse beim Abbauen, Block-Bröckchen, Explosionswolke, Bildschirmwackeln.
- Eigene eckige Heldenfigur (Hemd, Hose, eckiger Kopf), Rüstung sichtbar. Monster und Bosse eckig im Blockstil.

## 8. Bedienung

| Seite | Knopf | |
|---|---|---|
| links | ◀ ▶ | laufen |
| rechts | Springen (groß) | auch Klettern hoch / Schwimmen |
| rechts | **Graben** (Spitzhacke) links neben Springen | auch Klettern runter |
| rechts | Bogen (klein, über Springen) | nur mit Bogen sichtbar |
| Tastatur | ←→/AD, Leertaste/W/↑, **↓/S = Graben**, X = Bogen, Esc | |

## 9. Speicherstand

Wie v1 plus `pick` (beste Spitzhacke) und `power` mit Werten `plain|armor|bow`. Alte Spielstände (v1) werden
zurückgesetzt, außer Sprache und Ton.

## 10. Akzeptanzkriterien

1. 60 fps auf beiden Geräten (Prüfung: Chromium, CPU ×4, Ø ≤ 16,7 ms, auch beim Graben und bei Explosionen).
2. Graben, Klettern, Schwimmen, Schleimblock, Zischer-Explosion mit Blockzerstörung funktionieren per Touch.
3. Alle 12 Level schaffbar (Prüf-Suche durch die Level inkl. Graben; Test-Bot schafft Welt 1 komplett).
4. DE/PL vollständig, Offline-Modus, Fortschritt bleibt erhalten.
