# Rezept: Aussehen einer neuen Einheit (3D-Modell in `js/render/unitpaint.js`)

Für Menschen und Modelle (auch Sonnet oder Haiku). Ziel: Einheiten im Stil der vorhandenen (F-16, F-22, U-2, Kampfpanzer,
Panzerhaubitze) mit wenig Aufwand bauen. Der wichtigste Teil ist die **Vorschau-Schleife** (Schritt 4): Modell bauen, Bild ansehen,
verbessern. Wie das Malen technisch funktioniert, steht in den Kommentaren am Kopf von `unitpaint.js` (Körper, Mini-Renderer, Bild-Cache).

## Kurzauftrag (zum Kopieren)

> Baue das Modell für die Einheit `<typ>` nach `frontline/docs/rezept-einheiten.md`. Vorbild: `<f16 | f22 | u2 | tank | pzh | truck | …>`.
> Maße: Länge `<m>`, Breite/Spannweite `<m>`, Höhe `<m>`. Besonderheiten: `<…>`. [Bild/Dreiseitenansicht angehängt]
> Prüfe das Ergebnis mit `node tools/unitpreview.mjs <typ>` und verbessere, bis es neben dem Vorbild stimmig aussieht (höchstens 4 Runden).

Ein Bild hilft sehr: am besten eine **Dreiseitenansicht** (Seite, oben, vorn, z. B. Strichzeichnung), sonst ein Foto. Dazu die echte Länge.

## 1. Koordinaten und Größe

- Einheit: Welt-Pixel. **x nach vorn** (Nase, Rohr), **y nach rechts**, **z nach oben**; Ursprung = Mitte der Einheit auf dem Boden.
  Links/rechts spiegeln mit `for (const side of [-1, 1])` und `side * y`.
- Es gibt **keinen einheitlichen Maßstab**: Bodentruppen sind zur Lesbarkeit größer gezeichnet als Flugzeuge. Größe am ähnlichen
  vorhandenen Modell ausrichten (Grundfläche `foot: [x0, x1, y0, y1]` am Ende jedes Modells):

| Art | Vorbild | Länge im Modell | ≈ Pixel je Meter |
|---|---|---|---|
| Soldat | `soldier` | 14 hoch | 7–8 |
| Leichtes Fahrzeug, LKW | `truck`, `ifv`, `flak` | 25–32 | 4–5 |
| Kampfpanzer, Haubitze | `tank`, `pzh` (×1,12 / ×1,08 über `SIZE`) | 36–40 mit Rohr | 4–5 |
| Hubschrauber | `littlebird`, `gunship`, `transporter` | 26–39 | 2,5–3 |
| Kampfflugzeug, Aufklärer | `f16`, `f22`, `u2` | 35–42 | 2,1–2,4 |

- Kleinste sinnvolle Teile: etwa 0,3 px dick (dünner verschwindet). Details unter ~1 px mit `fine(…)` markieren (fallen beim
  Herauszoomen weg).

## 2. Bausteine (in `unitpaint.js`; die meisten auch als `PAINT` exportiert)

| Baustein | Form | Typisch für |
|---|---|---|
| `cyl(p0, p1, r0, r1, n, col)` | Zylinder/Kegel von p0 nach p1 (n Kanten; 4 = Vierkant) | Rumpf, Rohr, Rakete, Rad, Antenne |
| `ball(c, rx, ry, rz, col, { half })` | Ellipsoid, `half` = obere Hälfte | Kanzel, Kuppel, Helm, Kopf |
| `box(x0, x1, y0, y1, z0, z1, col)` | Quader | Wanne, Kasten, Luke, Markierung |
| `prZ(grundriss, z0, z1, col)` | Grundriss hochgezogen (dünne Platte) | Flügel, Leitwerk, Kettenschürze |
| `prX(seitenprofil, y0, y1, col)` | Seitenprofil quer gezogen | Wanne mit Schrägen, Seitenleitwerk, Kabine |
| `prY(querschnitt, x0, x1, col)` | Querschnitt längs gezogen | Plane, Dach |
| `loft(unten, oben, z0, z1, col)` | Körper mit schrägen Seiten | Turm, Aufbau |
| `hull(ringe, col)` + `ring(…)` | Rumpf aus Querschnitt-Ringen | facettierter Jet-Rumpf (F-22, U-2) |
| `on(träger, teil)` | Teil wird direkt nach dem Träger gemalt | Luke, Teamstreifen, Tarnfleck auf einer Fläche |
| `fine(teil)` | Detail, beim Herauszoomen weg | Lampen, kleine Kanten, Raketenflossen |

Option `{ noLine: true }` malt ohne Kantenlinie (für Streifen und Flecken), `{ only: 'iso' | 'top' }` nur in einer Ansicht.

## 3. Stil-Regeln (damit es zu den anderen passt)

- **Farben:** Funktion `(P, o)`; `P` ist die Teampalette (`P.body`, `P.dark`, `P.light`, `P.camo`, `P.mark` = Teamfarbe, `P.air` für
  Luftfahrzeuge). Grundfarbe aus der Palette gemischt (`mix(P.air, '#9aa3a8', 0.5)`), dunkle Töne mit `mix(farbe, '#000000', 0.25)`.
  **Teamfarbe nur auf kleinen Markierungen** (Flügelspitze, Streifen, Wimpel), nie großflächig. Feste Farben: `METAL`, `GUN`,
  `GLASS`, `WHEEL`, `TRACK`, `WHITE` (oben in der Datei).
- **Form vor Detail:** zuerst die Silhouette aus 3–6 großen Körpern (bei 30 px im Spiel zählt nur sie), dann wenige Details.
  Zum Vergleich: LKW rund 20 Körper, F-16 30, F-22 40, Panzerhaubitze 60, Kampfpanzer 75.
- **Licht** kommt von links oben (fest im Renderer); nichts selbst schattieren.
- **Zustände** über `o` (Schlüssel in `modelOf`): `o.missiles` (Bewaffnung sichtbar), `o.gear` (am Boden, Fahrwerk), `o.frame`
  (Gehbewegung). Neue Zustände: in `lookOf` berechnen und in den Schlüssel von `modelOf` aufnehmen; wenige Varianten halten (jede wird
  in 16 Richtungen gemalt).
- **Rückgabe:** `{ S, foot }`; dazu je nach Art `turret: { x, S }` (Turm dreht zum Ziel, Drehpunkt x), `rotors: [{ x, z, r, n }]`,
  `tail` (Heckrotor), `nozzle: { x, z }` (Nachbrenner), `inf: true` (Soldat, 8 Richtungen).
- **Kein Spielzustand im Modell** (keine Zeit, kein Zufall): Bewegtes (Rotoren, Flamme) malt der Renderer live.

## 4. Vorschau-Schleife (das Wichtigste)

```sh
cd frontline
node tools/unitpreview.mjs <typ>                  # → .preview/units.png: <typ> neben f16 und tank
node tools/unitpreview.mjs <typ> --ref f22,u2     # andere Vorbilder (--ref none: keine)
node tools/unitpreview.mjs <typ> --scale 6        # größer (Standard 4 Bildpunkte je Welt-Pixel)
node tools/unitpreview.mjs --list                 # alle Modelle
```

Je Einheit eine Zeile: 8 Iso-Richtungen, 2D von oben, Rot, „am Boden“ (Luftfahrzeuge) und **Spielgröße** (so klein wie im Spiel).
Das Bild ansehen (ein Modell öffnet es mit seinem Lese-Werkzeug) und prüfen:

1. **Silhouette:** In „Spielgröße“ als diese Einheit erkennbar? Unterscheidet sie sich vom Vorbild?
2. **Proportionen** gegen das Bild/die Maße: Länge zu Breite, Lage von Flügel/Turm/Kabine, Höhe.
3. **Größe** gegen die Vorbilder in derselben Vorschau (Tabelle in Abschnitt 1).
4. **Löcher oder Flackern:** fehlende Flächen oder Teile, die in einer Richtung durch andere scheinen (Abhilfe: großen Körper in
   kleinere teilen, aufgesetzte Teile mit `on`).
5. **Farben:** Blau und Rot gut zu unterscheiden, Teamfarbe nur klein.

Dann verbessern und erneut ansehen; meist reichen 2–3 Runden.

## 5. Einbauen und prüfen

1. Funktion in `unitpaint.js` bei ähnlichen Modellen einfügen, mit deutschem Kommentar darüber (was es darstellt, welche Zustände).
2. In `MODELS` eintragen (Infanterie: `INFANTRY` und `soldier`); ggf. Größe in `SIZE`.
3. `node --test test/unitpaint.test.js` (jede Einheit hat ein Modell, Bilder entstehen), dann im Spiel ansehen:
   `npm run smoke` oder `?debug=1` und die Einheit ausbilden (2D und Iso, Taste V).
4. Die übrigen Schritte einer neuen Einheit (Werte, Ausbildung, KI, Doku) stehen in `CLAUDE.md`, Rezept „Neue Einheit“.

## Welches Modell (KI) für welche Aufgabe

| Aufgabe | Empfehlung |
|---|---|
| Neue Silhouette (neue Art Fahrzeug oder Flugzeug) | Sonnet, mittlere bis hohe Denkstufe, mit Bild und Vorschau-Schleife |
| Abwandlung eines vorhandenen Modells (anderer Jet, anderer Panzer, Bewaffnung, Anbauteil) | Haiku, niedrige Denkstufe, „kopiere `<vorbild>` und ändere …“ |
| Aushängeschild, bei dem jedes Detail zählen soll | Opus, hohe Denkstufe |

Die Vorschau-Schleife bringt mehr als eine höhere Denkstufe: ein Modell, das sein Ergebnis sieht, korrigiert Proportionen selbst.
