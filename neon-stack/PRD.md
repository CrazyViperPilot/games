# Neon Stack – PRD

Stand: v2 (2026-10-29). Dieses Dokument bei jeder Regel- oder Funktionsänderung aktuell halten.

## Idee
Tetris im optischen Stil von Cyberpunk 2077 (Neongelb/Cyan/Magenta, abgeschnittene Ecken, Glitch-Schrift, Nachtstadt).
Name, Grafik, Töne und Code sind komplett eigen. Zwei Modi: **Klassik** (reines Tetris im Cyber-Look) und der optionale
**Neon-Modus** mit „fancy stuff“.

## Plattform
- Offline-fähige PWA, komplett unabhängig von den anderen Spielen (Ordner `neon-stack/`, Cache-Präfix `neonstack-`,
  localStorage-Schlüssel `neonstack-*`).
- Zielgerät: **Pixel 8a, Chrome, Hochformat** (Manifest `orientation: portrait`, `display: fullscreen`). Läuft auch im
  Querformat (Notlayout) und auf dem Lenovo Tab M11. Vanilla JS, Canvas 2D, kein Build.
- Service Worker: network-first, Cache nur Offline-Fallback. Bei Dateiänderungen `CACHE_NAME` in `sw.js` erhöhen.

## Steuerung (Touch)
- **Unten links drei Knöpfe:** ◀ links, ▼ runter (gedrückt halten = schnell fallen, 1 Punkt je Zeile), ▶ rechts (gedrückt halten = Auto-Repeat, DAS 150 ms / ARR 42 ms).
- **Unten rechts zwei Knöpfe:** ↺ links herum drehen, ↻ rechts herum drehen.
- Zusatz (nicht als Knopf): **Wischen nach unten** aufs Feld = Sofort-Drop (2 Punkte je Zeile), **Wischen nach oben** oder **Tippen aufs HOLD-Feld** = Hold. **Pause-Knopf** (gelb umrandet, zwei Balken) oben rechts neben der Punktzahl; das Pause-Menü hat WEITER, **NEUES SPIEL** (zurück ins Menü, dort wieder Klassik oder Neon-Modus wählen; der alte Spielstand bleibt als „Weiterspielen“, bis ein neues Spiel startet) sowie Ton/Musik.
- Tastatur (zum Testen am PC): Pfeile, Y/Z und X bzw. ↑ drehen, Leertaste Drop, C/Shift Hold, P/Esc Pause.
- Pause automatisch beim Verlassen der App/Tab. Nach Start und Fortsetzen kurzer Countdown.

## Regeln (Guideline-nah, `logic.js`)
- Feld 10×20 (+3 verdeckte Zeilen), 7er-Beutel, 3 Vorschauteile, Hold (einmal pro Teil), Ghost.
- SRS-Rotation mit Wall Kicks, Lock Delay 500 ms (max. 15 Resets durch Bewegen/Drehen).
- Level +1 alle 10 Zeilen, Schwerkraft nach Guideline-Kurve (Level 1 ≈ 1 s/Zeile, ab ~Level 20 praktisch sofort).
- Punkte × Level: Single 100, Double 300, Triple 500, Tetris 800; T-Spin 400/800/1200/1600, Mini-T-Spin 100/200/400;
  Combo +50 × Combo; Back-to-Back (Tetris/T-Spin-Zeilen hintereinander) ×1,5; Perfect Clear +800/1200/1800/2000.
- T-Spin-Erkennung per 3-Ecken-Regel (Mini, wenn nur eine vordere Ecke belegt, außer 5. Kick).
- Game Over: NOCH MAL (gleicher Modus) oder NEUES SPIEL (Modusauswahl). Das Spiel endet, wenn ein neues Teil nicht mehr erscheinen kann oder ein Teil komplett im verdeckten Bereich einrastet („FLATLINED“).

## Modi
- **Klassik:** flache Chip-Blöcke, ruhiger dunkler Hintergrund, Zeilenblitz, Banner für Tetris/T-Spin/Combo, nur Soundeffekte.
- **Neon-Modus:** zusätzlich animierte Nachtstadt (3 Parallax-Ebenen, flackernde Neonschilder, Flugautos, Regen, große Sonne),
  leuchtende Blöcke, hologrammartiger gestrichelter Ghost, sanftes Fallen, Funken beim Einrasten, Spuren beim Sofort-Drop,
  Explosion aus Partikeln bei Zeilen, Bildschirm-Wackeln, Glitch-/RGB-Versatz bei Tetris/T-Spin/Level-Up/Game Over,
  pulsierender Rahmen (im Takt der Musik, rot bei hohem Stapel), CRT-Scanlines und Vignette (CSS-Ebene),
  Punktezähler läuft hoch, Synthwave-Musik (A-Moll, Tempo steigt mit dem Level, per WebAudio erzeugt).
- Gleiche Regeln in beiden Modi; Bestwerte getrennt je Modus.

## Funktionen
- Menü mit Weiterspielen (Spielstand wird bei jedem Einrasten und beim Pausieren gespeichert), Bestwerten, Schaltern für Ton, Musik, Vibration (Pause-Menü: Ton, Musik).
- Vibration bei Drehen, Einrasten, Zeilen (nur Android/Chrome).
- Sicherheitsabstände (Notch/Gestenleiste) per `env(safe-area-inset-*)`.

## Dateien
`index.html`, `style.css` (Menüs, Knöpfe, CRT-Ebene), `logic.js` (Regeln, getestet), `game.js` (Layout, Zeichnen, Eingabe, Ablauf),
`fx.js` (Hintergrund, Partikel), `audio.js` (Effekte + Musik), `sw.js`, `manifest.json`, `icons/`, `test/logic.test.js` (`node neon-stack/test/logic.test.js`).

## Geparkte Ideen (nicht bauen, bevor Daniel es sagt)
- Weitere Modi (Marathon mit Ziel, 40-Zeilen-Sprint, Ultra), Startlevel wählbar, Highscore-Liste, Holo-Reklame/Wireframe in der Stadt, Hintergrundthemen.
