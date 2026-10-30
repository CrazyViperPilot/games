# Iso-Grafiken (Kenney, CC0)

Quelle: Kenney (kenney.nl), Pakete „City Kit (Commercial)“ und „City Kit (Industrial)“ (3D-Modelle, vorgerendert isometrisch 2:1 mit three.js, Licht von links oben; Daten in js/render/isodata.js), „Train Kit“ (stehender Zug, vorgerendert in train/), „Isometric City“ (Baum) und „Isometric Vehicles“, Lizenz CC0 (Lizenztexte in assets/LICENSES).
Vorgerenderte Gebäude liegen in buildings/, Baum und Fahrzeuge sind unveränderte Einzelbilder; Dateinamen der Fahrzeuge nach Bildschirmrichtung (e, se, s, sw, w, nw, n, ne).
Eigene Entwürfe lassen sich austauschen: gleiche Dateinamen ersetzen oder die Listen in js/render/isosprites.js anpassen.

Soldaten (units/): Kenney „Blocky Characters“ (Figur) mit Helm, Weste in Teamfarbe und Waffe (Gewehr aus dem „Blaster Kit“, RPG aus einfachen Formen) zusammengesetzt und in 8 Richtungen vorgerendert. Eigene Gebäude (team/): Zentrale aus „City Kit (Industrial)“ mit Teamflagge, Mörser und Flak aus dem „Tower Defense Kit“, Mauer und Tor aus dem „Castle Kit“, je Teamfarbe und Drehung der Ansicht vorgerendert (1 Modelleinheit = 1 Kachel). Drehen: js/render/isodata.js.

Kampfhubschrauber (vehicles/apache-*): 3D-Modell „Attack Chopper“ von Cheese Animal Productions / Geibu3D (**CC BY 4.0**, OpenGameArt; Namensnennung siehe assets/LICENSES/Attack-Chopper-CC-BY-4.0.txt), mit three.js isometrisch (30° Höhe) in 8 Richtungen und Teamfarben gerendert. Je Modell sind alle 16 Bilder gleich zugeschnitten; Größe und Bodenpunkt stehen in `MODEL_VIEW` (js/render/isosprites.js). Neue Modelle: dieselben Dateinamen `<modell>-<blue|red>-<e|se|s|sw|w|nw|n|ne>.png` liefern und in `UNIT_MODEL`/`MODEL_VIEW` eintragen.

Little Bird (vehicles/littlebird-*): eigenes, aus Grundformen nachgebautes 3D-Modell nach einem Foto des MH-6/AH-6 (`buildLB` in `tools/render-models/view.html`, `prodlb.mjs`), Teamfarben und 8 Richtungen wie oben; keine fremden Modelldaten, keine Lizenzauflagen.

Schützenpanzer (vehicles/ifv-*, nach einem Foto des Puma) und Kampfpanzer (vehicles/tank-*, nach einem Bild eines Leopard 2 A7): eigene, aus Grundformen nachgebaute Modelle (`buildPuma`, `buildLeo` in `tools/render-models/view.html`; `prodpu.mjs`, `prodle.mjs`), 8 Richtungen und Teamfarben, keine fremden Modelldaten, keine Lizenzauflagen. Das frühere T-12-Modell (CC0) ist ersetzt.

Wachturm (buildings/tower-r0…r3.png): eigenes Modell (`buildTower` in `tools/render-models/view.html`, `prodtw.mjs`) nach einem Bild eines Radar-/Wachturms auf Stahlgerüst; 1 Modelleinheit = 1 Kachel, je Drehung der Ansicht ein Bild (Modell gedreht, Licht fest), Maße in `TOWER_VIEW` (js/render/isosprites.js). Keine fremden Modelldaten, keine Lizenzauflagen.

Scharfschütze (units/sniper-*): eigenes blockiges Modell im Stil der Kenney-Soldaten, Ghillie-Anzug aus Büscheln nach einem Foto (`buildSniper`, `shotUnit` in `tools/render-models/view.html`, `prodsn.mjs`), 8 Richtungen, Teamfarbe an Brust und Kapuze. Keine fremden Modelldaten, keine Lizenzauflagen.

## Bäume (eigene Grafik)
`trees/tree-a..d.png` (128×160, drei Laubbäume und eine Fichte) für die Standardansicht (Drehung 0), gemalt von `tools/gen-trees.mjs` (kein Fremdmaterial).
`trees/tree.png` ist der Block-Baum für die gedrehten Ansichten.

## Felsen und Büsche (eigene Grafik)
`rocks/rock-a..d.png` (128×104, Bodenpunkt 64/92) und `bushes/bush-a..c.png` (72×56, Bodenpunkt 36/50), gemalt von `tools/gen-rocks.mjs` (kein Fremdmaterial). Büsche sind reine Optik (js/render/renderer.js `buildDeco`).

## Zivile Autos (eigene Grafik)
`cars/cars.png`: Blatt aus Zellen 96×80 (Wagenmitte am Boden bei 48/56, 2 Bildpunkte je Bildschirm-Pixel), Spalte = Lackfarbe (Liste `CAR_COLORS` in isosprites.js), Zeile = Form × Richtung. Gemalt von `tools/gen-cars.mjs`, kein Fremdmaterial.

## Panzer, Schützenpanzer und Infanterie (neu, eigene Grafik)
Seit v4.67 (Flak, SAM, Transporter seit v4.68, LKW, Baufahrzeug, Kampfhubschrauber und Little Bird seit v4.69) sind alle Fahrzeuge in `vehicles/` (außer dem Zug in `train/`) und `units/rifleman|at|sniper-*` von `tools/gen-troops.mjs` gemalt (kleiner Software-Renderer, 8 Richtungen, Teamfarben blau/rot, Bodenpunkt: Fahrzeuge 72/82 in 144×120, Soldaten 40/100 in 80×112; Werte in `MODEL_VIEW` und `isodata.js`). Die älteren Beschreibungen oben (Puma-/Leopard-Modell, Kenney-Soldaten) gelten für diese Bilder nicht mehr.
Der Hubschrauber „Attack Chopper“ (CC BY 4.0) ist seit v4.69 durch ein eigenes Modell ersetzt, seine Lizenzdatei entfällt. Die Kenney-Fahrzeuge (LKW, Pickup) sind ebenfalls ersetzt.
