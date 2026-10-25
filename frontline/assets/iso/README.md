# Iso-Grafiken (Kenney, CC0)

Quelle: Kenney (kenney.nl), Pakete „City Kit (Commercial)“ und „City Kit (Industrial)“ (3D-Modelle, vorgerendert isometrisch 2:1 mit three.js, Licht von links oben; Daten in js/render/isodata.js), „Train Kit“ (stehender Zug, vorgerendert in train/), „Isometric City“ (Baum) und „Isometric Vehicles“, Lizenz CC0 (Lizenztexte in assets/LICENSES).
Vorgerenderte Gebäude liegen in buildings/, Baum und Fahrzeuge sind unveränderte Einzelbilder; Dateinamen der Fahrzeuge nach Bildschirmrichtung (e, se, s, sw, w, nw, n, ne).
Eigene Entwürfe lassen sich austauschen: gleiche Dateinamen ersetzen oder die Listen in js/render/isosprites.js anpassen.

Soldaten (units/): Kenney „Blocky Characters“ (Figur) mit Helm, Weste in Teamfarbe und Waffe (Gewehr aus dem „Blaster Kit“, RPG aus einfachen Formen) zusammengesetzt und in 8 Richtungen vorgerendert. Eigene Gebäude (team/): Zentrale aus „City Kit (Industrial)“ mit Teamflagge, Mörser und Flak aus dem „Tower Defense Kit“, Mauer und Tor aus dem „Castle Kit“, je Teamfarbe und Drehung der Ansicht vorgerendert (1 Modelleinheit = 1 Kachel). Drehen: js/render/isodata.js.

Kampfhubschrauber (vehicles/apache-*): 3D-Modell „Attack Chopper“ von Cheese Animal Productions / Geibu3D (**CC BY 4.0**, OpenGameArt; Namensnennung siehe assets/LICENSES/Attack-Chopper-CC-BY-4.0.txt), mit three.js isometrisch (30° Höhe) in 8 Richtungen und Teamfarben gerendert. Je Modell sind alle 16 Bilder gleich zugeschnitten; Größe und Bodenpunkt stehen in `MODEL_VIEW` (js/render/isosprites.js). Neue Modelle: dieselben Dateinamen `<modell>-<blue|red>-<e|se|s|sw|w|nw|n|ne>.png` liefern und in `UNIT_MODEL`/`MODEL_VIEW` eintragen.

Little Bird (vehicles/littlebird-*): eigenes, aus Grundformen nachgebautes 3D-Modell nach einem Foto des MH-6/AH-6 (`buildLB` in `tools/render-models/view.html`, `prodlb.mjs`), Teamfarben und 8 Richtungen wie oben; keine fremden Modelldaten, keine Lizenzauflagen.

Schützenpanzer (vehicles/ifv-*, nach einem Foto des Puma) und Kampfpanzer (vehicles/tank-*, nach einem Bild eines Leopard 2 A7): eigene, aus Grundformen nachgebaute Modelle (`buildPuma`, `buildLeo` in `tools/render-models/view.html`; `prodpu.mjs`, `prodle.mjs`), 8 Richtungen und Teamfarben, keine fremden Modelldaten, keine Lizenzauflagen. Das frühere T-12-Modell (CC0) ist ersetzt.

Wachturm (buildings/tower-r0…r3.png): eigenes Modell (`buildTower` in `tools/render-models/view.html`, `prodtw.mjs`) nach einem Bild eines Radar-/Wachturms auf Stahlgerüst; 1 Modelleinheit = 1 Kachel, je Drehung der Ansicht ein Bild (Modell gedreht, Licht fest), Maße in `TOWER_VIEW` (js/render/isosprites.js). Keine fremden Modelldaten, keine Lizenzauflagen.
