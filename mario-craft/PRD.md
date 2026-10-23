# Mario Craft – Product Requirements

Jump'n Run im Stil klassischer 2D-Plattformer: laufen, springen, Gegner stampfen, Münzen sammeln, Power-ups, Ziel erreichen.
Eigene Pixel-Art, keine Figuren, Namen oder Grafiken aus Nintendo-Spielen.

## 1. Ziel & Rahmen

| | |
|---|---|
| Geräte | **Google Pixel 8a** (2400×1080, 20:9) und **Lenovo Tab M11** (1920×1200, 16:10, schwacher Prozessor), jeweils Chrome |
| Ausrichtung | Querformat. Im Hochformat erscheint „Bitte Gerät drehen“. |
| Steuerung | Touch: linker Daumen ◀ ▶, rechter Daumen Springen (+ Feuer, sobald verfügbar). Tastatur zum Testen am PC. |
| Leistung | flüssige 60 fps auf beiden Geräten, scharfe Pixel ohne Unschärfe, gleiches Bild auf beiden Geräten |
| Technik | Statische Web-App, Vanilla JS (ES-Module), Canvas 2D, kein Build-Schritt, keine externen Dateien/CDNs/Fonts |
| Auslieferung | Ordner `mario-craft/` im Repo `games`, GitHub Pages, offline spielbar und installierbar (PWA) |
| Sprache | Deutsch und Polnisch, im Menü umschaltbar, Auswahl wird gespeichert (Standard: Gerätesprache, sonst Deutsch) |

Nicht im Umfang (v1): Level-Editor, Musik, Mehrspieler, Online-Bestenliste, Unterwasser-Level, Röhren-Warps.

## 2. Spielablauf

1. **Startbildschirm:** Titel, „Spielen“, Sprache (DE/PL), Ton an/aus.
2. **Levelauswahl:** 3 Welten × 4 Level als Kacheln. Gesperrte Level ausgegraut. Je Level: Bestzeit, gesammelte Münzen, ob alle
   3 Sternmünzen gefunden wurden.
3. **Level:** von links nach rechts zur **Zielfahne**. In der Mitte ein **Checkpoint**. Level 4 jeder Welt ist eine Burg mit **Boss**.
4. **Levelende:** Zusammenfassung (Zeit, Münzen, Sternmünzen), „Weiter“ / „Nochmal“ / „Levelauswahl“. Nächstes Level wird freigeschaltet.
5. **Pause:** Knopf oben rechts → Fortsetzen, Neustart, Levelauswahl, Sprache, Ton.

## 3. Welten

| Welt | Thema | Neue Elemente | Boss (Level 4) |
|---|---|---|---|
| 1 Wiese | Himmel, Hügel, Bäume | Grundlagen, Bonusblöcke, Lücken, Läufer, Panzerkäfer | **Wurzelkönig**: läuft hin und her, springt, 3× stampfen |
| 2 Höhle | dunkel, Kristalle | bewegliche Plattformen, Stachlinge, Hüpfer, enge Gänge | **Felsgolem**: lässt Steine fallen, 3× stampfen, wenn er nach einem Sprung kurz benommen ist |
| 3 Burg | Stein, Lava | Lava, Feuerbälle aus der Lava, fallende Plattformen | **Glutdrache**: spuckt Feuer, 3× stampfen oder 8 Feuerbälle |

Jedes Level dauert 1–3 Minuten, enthält 3 versteckte oder schwer erreichbare **Sternmünzen** und wird mit jeder Welt schwerer.
Mehr Level kommen später; das Level-Format muss das ohne Code-Änderung erlauben.

## 4. Spielfigur

- **Laufen** mit ◀ ▶. Wer eine Richtung länger als ~0,6 s hält, beschleunigt automatisch auf **Renntempo** (kein eigener Knopf).
- **Springen:** variable Höhe – kurz tippen = kleiner Sprung (~2 Kacheln), halten = hoher Sprung (~4 Kacheln, im Rennen ~5).
  Rennsprung überwindet Lücken von bis zu 6 Kacheln.
- **Spielgefühl-Hilfen:** Springen ist noch kurz nach dem Verlassen einer Kante möglich (Coyote Time), ein Sprungdruck kurz vor
  der Landung wird gemerkt (Jump Buffer), Kopfstöße an Blockkanten schieben die Figur leicht zur Seite.
- **Zustände:** klein → groß (Pilz) → Feuer (Feuerblume). Ein Treffer stuft eine Stufe zurück (Feuer → groß → klein → Leben verloren),
  danach 1,5 s unverwundbar (Blinken).
- Leben verloren auch durch Fallen in eine Grube und durch Lava.

## 5. Gegner

| Gegner | Verhalten | Besiegen |
|---|---|---|
| **Läufer** | läuft geradeaus, dreht an Wänden, fällt von Kanten | stampfen, Feuerball, Panzer, Stern |
| **Panzerkäfer** | wie Läufer; gestampft wird er zum Panzer | Panzer antippen = kicken, gekickter Panzer räumt Gegner ab und prallt an Wänden zurück (trifft auch den Spieler) |
| **Hüpfer** | springt in Bögen auf den Spieler zu | stampfen, Feuerball |
| **Stachling** | langsam, dreht an Kanten | **nicht** stampfbar; nur Feuerball, Panzer, Stern |
| **Lavaball** (Welt 3) | springt senkrecht aus der Lava | nicht besiegbar, ausweichen |

Stampfen lässt die Figur abprallen; hält man Springen, prallt sie höher ab. Mehrere Gegner hintereinander ohne Landung ergeben steigende Punkte.

## 6. Blöcke & Gegenstände

- **Boden/Stein** (fest), **Ziegel** (klein: wackelt beim Kopfstoß, groß: zerbricht), **Bonusblock** (Münze, Pilz bzw. Feuerblume
  je nach Zustand, Stern, oder 5–10 Münzen nacheinander), **unsichtbarer Block**, **harter Block**, **Plattformen** (nur von oben begehbar).
- **Münze:** 100 Münzen = 1 Extraleben. **Sternmünze:** 3 pro Level, für die Levelauswahl.
- **Pilz:** macht groß. **Feuerblume:** Feuerbälle (max. 2 gleichzeitig), hüpfen über den Boden. **Stern:** 8 s unverwundbar, Gegner
  werden bei Berührung besiegt. **1-Up-Pilz** (selten, versteckt).
- **Checkpoint-Fahne:** nach Leben-Verlust startet man dort (klein). **Zielfahne:** je höher berührt, desto mehr Punkte.

## 7. Leben & Fortschritt

- Start mit 3 Leben. Bei 0 Leben: **Game Over** → zurück zu Level 1 der aktuellen Welt, Leben wieder 3. Freigeschaltete Level bleiben frei.
- Gespeichert (`localStorage`, eigener Schlüssel `mariocraft-save`): freigeschaltete Level, je Level Bestzeit, Münzen, Sternmünzen;
  Leben, Münzen und Zustand der Figur beim Verlassen; Sprache; Ton an/aus.

## 8. Bedienung (Touch)

- **Links:** zwei große Knöpfe ◀ ▶ nebeneinander. Die Trefferflächen sind größer als die gezeichneten Knöpfe und reichen bis zur
  Bildschirmmitte, ein Daumen kann zwischen ◀ und ▶ rutschen, ohne loszulassen.
- **Rechts:** großer Sprungknopf; darüber ein kleinerer **Feuerknopf**, nur sichtbar mit Feuerblume.
- Echtes Multitouch: Laufen und Springen gleichzeitig. Kein Zoom, kein Scrollen, kein Kontextmenü, keine Textauswahl.
- Knöpfe halbtransparent, liegen über dem Spielbild; die Kamera lässt unten genug Platz, dass die Figur nicht unter den Daumen verschwindet.
- Kurze Vibration bei Treffer und Stampfen (abschaltbar mit dem Ton).
- Tastatur (PC): ←/→ bzw. A/D laufen, Leertaste/↑/W springen, X/J Feuer, Esc Pause.
- Vollbild beim ersten Antippen; als installierte App im Querformat gesperrt.

## 9. Grafik & Ton

- **Pixel-Art im Code:** Sprites als Zeichenraster mit Farbpalette, beim Start einmal in Bilder umgewandelt. Kachelgröße 16 px.
- **Auflösung:** Das Spiel rendert in eine kleine interne Auflösung von etwa 15 Kacheln Höhe und skaliert sie **ganzzahlig**
  (Nearest Neighbor) auf den Bildschirm: Tab M11 384×240 ×5, Pixel 8a 480×216 ×5 (breiterer Ausschnitt). Dadurch scharf,
  gleich aussehend und sehr günstig zu zeichnen.
- Hintergrund mit 2 Parallax-Ebenen pro Welt.
- **Ton:** kurze, synthetisch erzeugte Effekte (Web Audio): Sprung, Münze, Stampfen, Block, Power-up, Treffer, Feuerball, Ziel,
  Game Over. Keine Musik in v1. Ton an/aus im Menü.

## 10. Akzeptanzkriterien

1. Läuft offline nach dem ersten Besuch und ist als App installierbar; eigener Service Worker mit Präfix `mariocraft-`, der nur eigene Caches löscht.
2. Stabile 60 fps auf Pixel 8a und Lenovo Tab M11 (Prüfung in Chromium mit 4-facher CPU-Drosselung: kein Frame über 16,7 ms im Schnitt,
   ruckelfreies Scrollen).
3. Laufen + Springen gleichzeitig per Multitouch; kein versehentliches Zoomen/Scrollen.
4. Alle 12 Level sind durchspielbar (Level-Prüfung: jede Lücke und jede Stufe ist mit den Physikwerten schaffbar).
5. Umschalten DE/PL wirkt sofort auf alle Texte und bleibt nach Neustart erhalten.
6. Fortschritt bleibt nach Schließen der App erhalten.
7. Karte auf der Startseite der Spielesammlung, Eintrag in der README-Tabelle, eigener Test-Workflow.
