# Frontline

Echtzeit-Strategie im Browser: Eine FOB bauen, Ressourcen fördern, die Konfliktzone in der Mitte halten.
Spieler (Blau) gegen Computer (Rot). Vanilla JS, Canvas 2D, kein Build-Schritt, offline spielbar (PWA).

Spezifikation: [PRD.md](PRD.md) · Architektur: [PLAN.md](PLAN.md)

## Spielprinzip

- Jede Partei startet mit einem **HQ**, einem LKW, einem Baufahrzeug und vier Schützen.
- **HQ:** unbegrenzter Nachschub an Baumaterial, Munition und Treibstoff, Bauradius 550 px, bildet Schützen,
  Panzerabwehr, LKW und Baufahrzeuge aus. Es steht weit hinten und hat **2 Ladeplätze**: weitere LKW warten.
  Das HQ kann nicht gebaut oder abgerissen werden. **Zerstört = Niederlage.**
- **Ressourcen:** Geld (Konfliktzone, Grundeinkommen) sowie Baumaterial, Munition und Treibstoff. Die Sorten liegen
  im HQ (unbegrenzt) und in den **Lagern der FOBs** (je Sorte max. 3000). Gebäude und Ausbildung zahlt das HQ oder
  eine FOB in Reichweite.
- **Förderanlagen** stehen an der Front auf Vorkommen und sind Nahquellen: Sie liefern in die FOB, in deren
  Bauradius sie stehen. Wo das HQ der nächste Lieferant wäre, sind sie nicht erlaubt (dort ist Nachschub ohnehin unbegrenzt).
- **FOBs** sind vorgeschobene Lager (Bauradius 450 px, max. 6). Eine neue FOB setzt das Baufahrzeug als Baustelle;
  sie braucht 400 Baumaterial im eigenen Lager (per LKW) und wird dann vom Baufahrzeug gebaut.
- **LKW** laden am HQ oder an einer FOB, bringen es zu einer anderen FOB oder Baustelle, pendeln auf Routen und
  versorgen Truppen im Feld. Munition und Treibstoff werden verbraucht: je Schuss bzw. beim Fahren.
- **Bauen:** Gebäude entstehen als Baustelle und wachsen nur, solange ein Bauer daneben steht. Das **Baufahrzeug**
  baut alles und repariert beschädigte Gebäude; Schützen und PAK bauen Mauern und Tore.
- **Konfliktzone:** Wer dort Einheiten hat (und der Gegner keine), kontrolliert sie: Geld und alle 30 s ein Punkt.
  Sind beide drin, ist sie umkämpft.
- **Sieg:** Siegpunkte erreichen (25, 50 oder 100) oder das gegnerische HQ zerstören.

## Steuerung

| Eingabe | Aktion |
|---|---|
| Linksklick / Ziehen | Auswählen / Rahmenauswahl (Shift = hinzufügen, Doppelklick = alle dieses Typs im Bild) |
| Rechtsklick | Bewegen, auf Gegner angreifen, Gebäude gewählt = Sammelpunkt |
| Rechtsklick auf eigene FOB oder HQ | LKW: leer laden, beladen entladen (am HQ nur laden) · Baufahrzeug: an Baustelle helfen, beschädigtes Gebäude reparieren |
| A, dann Klick | Angriffsbewegung |
| S | Stopp |
| B | Baumenü: Baufahrzeug alles (Q Fahrzeughalle, W Förderanlage, E Mauer, R Tor, T Mörser, Z Flugabwehr, F FOB-Baustelle); Infanterie nur E Mauer, R Tor |
| Q / W / E / R | Ausbildung im gewählten Gebäude (FOB: Schütze, PAK, LKW, Baufahrzeug) |
| L / U / T | LKW gewählt: Laden (dann FOB oder HQ anklicken) · Entladen (FOB oder FOB-Baustelle) · Pendeln (Start-FOB oder HQ, dann Ziel-FOB) |
| Q / W / E / R | LKW gewählt: Ladungsart Gemischt · Baumaterial · Munition · Treibstoff |
| Entf | Gebäude abreißen |
| Esc | Abbrechen / Auswahl aufheben |
| Strg + 0–9, dann 0–9 | Gruppe speichern / wählen (zweimal = Kamera hin) |
| Pfeile, Bildschirmrand, mittlere Maustaste, Mausrad | Kamera bewegen / zoomen |
| Leertaste / H | Kamera auf Auswahl oder letzte Meldung / H = Kamera auf das HQ |
| P, + / − | Pause, Geschwindigkeit |
| F1 oder ? | Hilfe mit allen Tasten |

## Debug-Parameter

Über die URL:

- `?debug=1`: Karte ist aufgedeckt (kein Nebel), Taste **M** gibt Team Blau +1000 Geld und +1000 in jedes FOB-Lager (das HQ ist unbegrenzt),
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
