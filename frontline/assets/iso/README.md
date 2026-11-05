# Iso-Grafiken

Was hier noch als Bild liegt (alles andere malt das Spiel selbst, siehe unten):

- `buildings/tower-r0…r3.png` Wachturm: eigenes Modell (`buildTower` in `tools/render-models/view.html`, `prodtw.mjs`) nach einem Bild eines Radar-/Wachturms auf Stahlgerüst; 1 Modelleinheit = 1 Kachel, je Drehung der Ansicht ein Bild (Modell gedreht, Licht fest), Maße in `TOWER_VIEW` (js/render/isosprites.js). Keine fremden Modelldaten.
- `cars/cars.png`: Blatt aus Zellen 96×80 (Wagenmitte am Boden bei 48/56, 2 Bildpunkte je Bildschirm-Pixel), Spalte = Lackfarbe (Liste `CAR_COLORS` in isosprites.js), Zeile = Form × Richtung. Gemalt von `tools/gen-cars.mjs`.

Austausch: gleiche Dateinamen ersetzen oder die Listen in js/render/isosprites.js anpassen; `?sprites=0` zeigt einfache Formen.

## Gemalt statt Bild

- Gebäude der Spielerstädte (seit v5.17, `js/render/townhouses.js`), Werke und Kraftwerk (v5.18, `works.js`), Militärgebäude (v5.21, `milbuild.js`), Flughafen (v5.22, `airport.js`), Häuser, Hallen, Fabriken und Zug der Karte (v5.23, `maptown.js`). Die früheren Kenney-Bilder (City Kits, Train Kit, `team/`) entfallen.
- Einheiten (seit v5.27, `js/render/unitpaint.js`): Soldaten, Fahrzeuge, Hubschrauber und F-16 sind 3D-Modelle aus Grundkörpern, die das Spiel selbst malt (Iso in 16 Richtungen, Turm getrennt, 2D von oben). Die vorgerenderten Bilder in `vehicles/` und `units/` (zuletzt aus `tools/gen-troops.mjs`) entfallen.
- Natur (seit v5.28, `js/render/nature.js`): Bäume in vier Arten (Laubbaum, Birke, Fichte, Kiefer) mit Herbst- und Winterbild, Büsche (Strauch, Beerenstrauch, Farn, junge Fichte), Felsen und Tiere als 3D-Modelle, Rohstoffvorkommen der Stadt als Bodenbild. Die früheren Bilder in `trees/`, `rocks/` und `bushes/` (aus `tools/gen-trees.mjs` und `gen-rocks.mjs`) entfallen.
