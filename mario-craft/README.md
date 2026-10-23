# Mario Craft

Jump'n Run im Stil klassischer 2D-Plattformer: laufen, springen, Gegner stampfen, Münzen sammeln, Power-ups einsammeln
und die Zielfahne erreichen. Eigene Pixel-Art, keine Figuren oder Grafiken aus anderen Spielen.
Vanilla JS, Canvas 2D, kein Build-Schritt, offline spielbar (PWA), Deutsch und Polnisch.

Spezifikation: [PRD.md](PRD.md) · Architektur: [PLAN.md](PLAN.md)

## Spielprinzip

- **3 Welten zu je 4 Leveln:** Wiese, Höhle, Burg. Das 4. Level jeder Welt ist eine Burg mit Boss
  (Wurzelkönig, Felsgolem, Glutdrache).
- **Gegner:** Läufer und Panzerkäfer (stampfen, Panzer kicken), Hüpfer, Stachlinge (nicht stampfbar), Lavabälle.
- **Gegenstände:** Pilz (groß), Feuerblume (Feuerbälle), Stern (unverwundbar), 1-Up. Ein Treffer stuft die Figur zurück.
- **Sternmünzen:** 3 pro Level, versteckt oder schwer zu erreichen. 100 Münzen geben ein Leben.
- **Fortschritt:** Level werden nacheinander freigeschaltet. Bei 0 Leben geht es zurück zu Level 1 der Welt.

## Steuerung

| Gerät | Aktion |
|---|---|
| Touch, links ◀ ▶ | laufen (der Daumen darf zwischen ◀ und ▶ rutschen) |
| Touch, rechts | springen, Feuerknopf darüber (nur mit Feuerblume) |
| Pause-Knopf oben rechts | Pause-Menü |
| Tastatur | ←/→ oder A/D laufen, Leertaste, ↑ oder W springen, X oder J Feuer, Esc Pause |

Gehaltener Sprung ist höher, kurzes Antippen ist ein kleiner Sprung. Wer länger in eine Richtung läuft, beschleunigt.

## Lokal starten

Die Seite braucht einen Webserver (ES-Module), zum Beispiel aus dem Repo-Root:

```sh
python3 -m http.server 8123
```

Dann `http://localhost:8123/mario-craft/` öffnen. Mit `?debug=1` sind alle Level frei, fps und längster Frame stehen
oben links, und `window.__mc` gibt Zugriff auf Spielzustand und Speicher.

## Tests

```sh
cd mario-craft
npm test        # node --test: Physik, Level, Spielregeln, Texte
```

## Ordner

- `js/data/`: Werte (Physik, Gegner, Level, Texte) ohne Logik
- `js/game/`: Simulation ohne DOM, läuft in Node
- `js/render/`: Pixel-Art, Abschnitts-Cache, Renderer, HUD
- `js/core/`: Loop, Eingabe, Ton, Speichern, Sprache
- `js/ui/menu.js`: Menüs als DOM-Overlays über dem Canvas
- `js/main.js`: Skalierung (384×240 bzw. 480×216 mal 5), Menüfluss, Speichern

Der Speicherstand liegt im `localStorage` unter `mariocraft-save`. Ein Release = Änderung + `CACHE_VERSION` in `sw.js` erhöhen.
