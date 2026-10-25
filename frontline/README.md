# Frontline

Echtzeit-Strategie im Browser: Eine FOB bauen, Ressourcen fördern, die Konfliktzone in der Mitte halten.
Spieler (Blau) gegen Computer (Rot). Vanilla JS, Canvas 2D, kein Build-Schritt, offline spielbar (PWA).

Spezifikation: [PRD.md](PRD.md) · Architektur: [PLAN.md](PLAN.md)

## Spielprinzip

- Jede Partei startet mit einer FOB (gefülltes Lager), einem LKW, einem Baufahrzeug, 40 Schützen und 10 Panzerabwehrsoldaten.
- **Ressourcen:** Geld (jede Einheit in der Konfliktzone bringt 0,4 Geld/s, in der Hot Zone 0,8 Geld/s) sowie Baumaterial, Munition und Treibstoff.
  Die drei Sorten kommen von Förderanlagen auf den Vorkommen und liegen in den **Lagern der FOBs** (je Sorte max. 3000).
  Eine Förderanlage liefert in die FOB, in deren Bauradius sie steht. Gebäude und Ausbildung zahlt die FOB in Reichweite.
- **LKW** laden Material an einer FOB, bringen es zu einer anderen FOB oder Baustelle, pendeln auf Routen und
  versorgen Truppen im Feld. Munition und Treibstoff werden verbraucht: je Schuss bzw. beim Fahren.
- **Bauen:** Gebäude entstehen als Baustelle und wachsen nur, solange ein Bauer daneben steht. Das **Baufahrzeug**
  baut alles und repariert beschädigte Gebäude; Schützen und PAK bauen Mauern und Tore.
- Gebäude nur im Bauradius (450 px) einer fertigen eigenen FOB. Eine neue FOB setzt das Baufahrzeug als Baustelle;
  sie braucht 400 Baumaterial im eigenen Lager (per LKW) und wird dann vom Baufahrzeug gebaut (max. 6 FOBs).
- **Konfliktzone:** Wer dort mehr Einheiten hat, kontrolliert sie und bekommt alle 30 s einen Punkt. Das Geld je Einheit
  fließt für beide Seiten, auch wenn sie umkämpft ist.
- **Sieg:** Siegpunkte erreichen (25, 50 oder 100) oder den Gegner ohne FOB und Baufahrzeug ausschalten.

## Steuerung

| Eingabe | Aktion |
|---|---|
| Linksklick / Ziehen | Auswählen / Rahmenauswahl (Shift = hinzufügen, Doppelklick = alle dieses Typs im Bild) |
| Rechtsklick | Bewegen, auf Gegner angreifen, Gebäude gewählt = Sammelpunkt |
| Rechtsklick auf eigene FOB | LKW: leer laden, beladen entladen · Baufahrzeug: an Baustelle helfen, beschädigtes Gebäude reparieren |
| A, dann Klick | Angriffsbewegung |
| S | Stopp |
| B | Baumenü: Baufahrzeug alles (Q Fahrzeughalle, W Förderanlage, E Mauer, R Tor, T Mörser, Z Flugabwehr, F FOB-Baustelle); Infanterie nur E Mauer, R Tor |
| Q / W / E / R | Ausbildung im gewählten Gebäude (FOB: Schütze, PAK, LKW, Baufahrzeug) |
| L / U / T | LKW gewählt: Laden (dann FOB anklicken) · Entladen (FOB oder FOB-Baustelle) · Pendeln (Start-FOB, dann Ziel) |
| Q / W / E / R | LKW gewählt: Ladungsart Gemischt · Baumaterial · Munition · Treibstoff |
| Entf | Gebäude abreißen |
| Esc | Abbrechen / Auswahl aufheben |
| Strg + 0–9, dann 0–9 | Gruppe speichern / wählen (zweimal = Kamera hin) |
| Pfeile, Bildschirmrand, mittlere Maustaste, Mausrad | Kamera bewegen / zoomen |
| Leertaste / H | Kamera auf Auswahl oder letzte Meldung / auf die Haupt-FOB |
| P, + / − | Pause, Geschwindigkeit |
| F1 oder ? | Hilfe mit allen Tasten |

## Debug-Parameter

Über die URL:

- `?debug=1`: Karte ist aufgedeckt (kein Nebel), Taste **M** gibt Team Blau +1000 aller Ressourcen,
  Geschwindigkeit bis 10×.
- `?seed=N`: feste Karte (gleicher Seed = gleiche Partie).
- `?speed=N`: Startgeschwindigkeit.

Beispiel: `http://localhost:8765/frontline/?debug=1&seed=123&speed=3`

## Tests

```sh
cd frontline
npm test        # node --test, Simulation und KI ohne Browser
```

Die Tests liegen in `test/` und laufen per `.github/workflows/test-frontline.yml`, sobald sich `frontline/` ändert.

## Dateien

- `js/data/` Spielwerte, `js/core/` RNG und Schleife, `js/game/` Simulation (ohne DOM), `js/ai/` Computergegner
- `js/render/` Canvas-Zeichnung, Kamera, Minimap · `js/ui/` Steuerung, Eingabe, HUD, Menüs
- `sw.js` Service Worker (Cache-Präfix `frontline-`, Version `CACHE_VERSION`)
