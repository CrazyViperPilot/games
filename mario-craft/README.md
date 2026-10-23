# Mario Craft

Jump'n Run in einer Blockwelt: laufen, springen, **graben**, explodierende Zischer überlisten, Dungeons erkunden und Bosse
besiegen. Eigene Pixel-Art und eigene Figuren (kein Material aus anderen Spielen). Vanilla JS, Canvas 2D, kein
Build-Schritt, offline spielbar (PWA), Deutsch und Polnisch.

Spezifikation: [PRD.md](PRD.md) · Architektur: [PLAN.md](PLAN.md)

## Spielprinzip

- **3 Welten zu je 4 Leveln:** Oberwelt, Tiefen, Nether & Leere. Jedes Level führt von der Oberfläche in die Tiefe
  (Höhlen, Dungeons) und wieder hinauf zum Portal. Level 4 jeder Welt hat einen Boss
  (Riesenschleim, Dreikopf, Leerendrache).
- **Graben:** Knopf neben Springen. Bessere Spitzhacken (Stein, Eisen, Diamant) liegen in Truhen und bleiben gespeichert.
- **Gegner:** Zischer (explodiert, zerstört Blöcke), Zombie, Skelett, Spinne, Schleim, Silberfischchen, Glutgeist,
  Leerenläufer; Monster-Spawner, TNT, Lava.
- **Gegenstände:** Rüstung, Bogen, goldener Apfel (unverwundbar), Kuchen (1-Up), Smaragde (100 = 1 Leben), 3 Diamanten pro Level.
- **Fortschritt:** Level werden nacheinander freigeschaltet. Bei 0 Leben geht es zurück zu Level 1 der Welt.

## Steuerung

| Gerät | Aktion |
|---|---|
| Touch, links ◀ ▶ | laufen (der Daumen darf zwischen ◀ und ▶ rutschen) |
| Touch, rechts | springen (groß), Graben links daneben, Bogen darüber (nur mit Bogen) |
| Pause-Knopf oben rechts | Pause-Menü |
| Tastatur | ←/→ oder A/D laufen, Leertaste/↑/W springen, ↓/S graben, X oder J Bogen, Esc Pause |

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
