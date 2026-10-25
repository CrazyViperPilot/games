# Modelle → Iso-Sprites

Rendert 3D-Modelle (FBX/OBJ) mit three.js in Chromium (Playwright) in 8 Blickrichtungen und Teamfarben (Blau/Rot) nach `assets/iso/vehicles/`.

1. `npm install three@0.160.0` in einem Arbeitsordner; `view.html`, `prod.mjs` dorthin kopieren, Modelle unter `models/` ablegen, Pfade in `prod.mjs` (`MODELS`, `root`) anpassen.
2. `node prod.mjs` schreibt `raw/<modell>-<team>-<richtung>.png` (192 × 192, transparent).
3. Alle Bilder eines Modells auf dieselbe Box zuschneiden (Alpha-Bounding-Box über alle 16 Bilder), damit Bodenpunkt und Größe gleich bleiben; Maße in `MODEL_VIEW` (`js/render/isosprites.js`) eintragen.

Blickrichtung: Modell um die Y-Achse so drehen, dass die Front nach Bildschirm-rechts zeigt (`yaw = 90 − 45·k`, k = Richtung e, se, s, sw, w, nw, n, ne); Kamera 30° Höhe, orthografisch. Die Modelle selbst liegen nicht im Repo (Quellen und Lizenzen: `assets/LICENSES`).
