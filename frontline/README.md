# Frontline

Echtzeit-Strategie im Browser: Eine FOB bauen, Ressourcen fördern, die Konfliktzone in der Mitte halten.
Spieler (Blau) gegen Computer (Rot). Vanilla JS, Canvas 2D, kein Build-Schritt, offline spielbar (PWA).

Spezifikation: [PRD.md](PRD.md) · Architektur: [PLAN.md](PLAN.md)

## Spielprinzip

- Jede Partei startet mit einer FOB, einem LKW, vier Schützen und Startressourcen.
- **Ressourcen:** Geld (Konfliktzone, Grundeinkommen der FOB), Baumaterial, Munition und Treibstoff
  (Förderanlagen auf den Vorkommen). Munition und Treibstoff werden verbraucht: je Schuss bzw. beim Fahren.
- Gebäude nur im Bauradius (450 px) einer fertigen eigenen FOB. Weitere FOBs baut ein LKW (max. 6).
- **Konfliktzone:** Wer dort Einheiten hat (und der Gegner keine), kontrolliert sie: Geld und alle 30 s ein Punkt.
  Sind beide drin, ist sie umkämpft.
- **Sieg:** Siegpunkte erreichen (25, 50 oder 100) oder den Gegner ohne FOB und LKW ausschalten.

## Steuerung

| Eingabe | Aktion |
|---|---|
| Linksklick / Ziehen | Auswählen / Rahmenauswahl (Shift = hinzufügen, Doppelklick = alle dieses Typs im Bild) |
| Rechtsklick | Bewegen, auf Gegner angreifen, Gebäude gewählt = Sammelpunkt |
| A, dann Klick | Angriffsbewegung |
| S | Stopp |
| B | Baumenü (Q Fahrzeughalle, W Förderanlage, E Mauer, R Tor, T Mörser, Z Flugabwehr) |
| Q / W / E | Ausbildung im gewählten Gebäude |
| F | LKW gewählt: FOB errichten |
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
