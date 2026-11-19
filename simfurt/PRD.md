# Simfurt – Produktanforderungen

Eigenständiges Städtebauspiel im Frankfurter Gewand (Main, Skyline, Bankenviertel, Äppelwoi). Eigenes Design im Genre der klassischen isometrischen Städtebau-Simulationen – keine Übernahme von Namen, Oberfläche, Grafiken oder exakten Regeln eines bestehenden Spiels.

## Ziele
- Offline-fähige PWA (`simfurt/`), eigener Cache (`simfurt-`), eigener Spielstand, unabhängig von den anderen Spielen.
- Optimiert für Pixel 8a im **Hochformat** (Touch), dazu gut mit **Maus und Tastatur** am PC.
- Spielstand lokal (IndexedDB, Ersatz localStorage), als **Datei** (Export/Import) und optional auf Daniels Webspace (PHP, `simfurt/api.php` in diesem Repo, Deploy per `deploy-backend.yml`, analog Fruhno). Das Spiel funktioniert vollständig ohne Webspace.

## Spielprinzip
Karte wählbar 64×64, 96×96 oder 128×128 Kacheln (im Neue-Stadt-Dialog, im Spielstand gespeichert) mit Fluss (Main) und Wald, isometrisch (Canvas 2D, Sprite-Cache). Ein Tick = ein Monat (Start Januar 1990). Der Spieler legt Straßen, Zonen, Kraftwerke und Dienste an; die Stadt wächst automatisch nach Nachfrage.

### Kartengenerierung (`generateMap` in `js/sim.js`)
- Deterministisch pro Seed, jede neue Stadt bekommt einen anderen Seed → **der Fluss läuft jedes Mal anders**.
- Ein- und Austrittskante zufällig (N/O/S/W, auch über Eck); Lauf über 3–6 geglättete Kontrollpunkte mit Mäandern; Breite schwankt entlang des Laufs (≈ 1,6–3,6 Kacheln × √(N/64)).
- 0–2 schmale Seitenarme von anderen Kanten, gelegentlich eine Flussinsel und/oder ein kleiner See.
- Wasseranteil 4–22 %, Hauptfluss zusammenhängend von Kante zu Kante, größte Landfläche ≥ 40 %; Kartenmitte waldarm als Startfläche.

### Zonen (Rechteck ziehen, 10 €/Kachel, Bankenviertel 30 €)
Wohnen (R), Gewerbe (C), Industrie (I), **Bankenviertel (B, ab 3.000 Einw.)** mit bis zu 4 Stufen (Skyline: Pyramiden-, Antennen-, Zwillingsdächer). R/C/I haben 3 Stufen. Eine Parzelle entwickelt sich nur mit **Straße** (≤ 2 Kacheln) und **Strom**. Stufenaufstieg hängt am **Grundwert** (und bei Banken an Bildung, bei Wohnen an Luft).

### Simulation (`js/sim.js`, ohne DOM, getestet)
- **Nachfrage** W/G/I/B aus Arbeitsplätzen vs. Arbeitskräften, Einwohnern, Steuern, Zufriedenheit, Verschmutzung, Bildung (Balken oben).
- **Strom**: Kraftwerke versorgen einen Radius und haben Kapazität; Überlast → Teilausfall.
- **Wasser** (ohne Leitungen): Pumpwerk (am Ufer) versorgt Radius 14 mit Kapazität; Wassertürme erweitern die Versorgung (nur wenn ein Pumpwerk existiert); Kläranlage (ab 3.000) senkt Dreck im Umkreis und erhöht die Pumpkapazität (+25 % je Anlage, max. ×1,5). Stufe ≥ 2 braucht Wasser, ohne Wasser sinken höhere Stufen langsam. Kartenansicht „Wasser“.
- **Müll** (ab 400 Einw.): Aufkommen je Zone/Stufe (≈ 0,1 t/Einw.). Entsorgung in Reihenfolge Recyclinghof (−12 % je Hof, max. −36 %; Verordnung Recyclingpflicht ×0,85) → Müllverbrennung (500 t/Monat, +60 Strom, Dreck) → Deponie (300 t/Monat, 12.000 t Volumen, füllt sich, starker Dreck). Unentsorgter Rest → Dreck stadtweit und Zufriedenheit bis −20. Kartenansicht „Müll“.
- **Budget je Ressort** (Rat): Polizei, Feuerwehr, Gesundheit, Bildung, Straßen 0–120 %. Unterhalt skaliert, Wirkung ×min(1,1; b/100); Straßen < 60 % → mehr Stau.
- **Verordnungen** (Rat, 9 Stück, teils mit Freischaltung): z. B. Tempo 30, Gratis-ÖPNV, Rauchverbot, Ebbelwei-Fest, Nachbarschaftswache, Recyclingpflicht, Nachtflugverbot (nur mit Flughafen), Grüne Dächer, Banken-Steuerrabatt. Monatliche Kosten, Wirkung auf Verkehr, Kriminalität, Dreck, Nachfrage, Tourismus, Zufriedenheit.
- **Karten**: Polizei, Feuerwehr, Gesundheit, Bildung, Parks, U-Bahn (Abdeckung), Kriminalität, Verschmutzung, Verkehr (BFS über Straßen), Grundwert. Alle als Kartenansichten (Auge-Knopf).
- **Zufriedenheit** (0–100) aus Steuern, Kriminalität, Umwelt, Verkehr, Diensten, Parks, Wahrzeichen, Arbeitslosigkeit, Strom; steuert die Belegung (Einwohner = Kapazität × Belegung).
- **Finanzen**: Steuer je Zone (3 Regler), Tourismus der Wahrzeichen, Unterhalt (Gebäude, Straßen), Kredit in 10.000-€-Schritten (bis 50.000 €, 0,4 %/Monat).
- **Katastrophen** (abschaltbar): Brände (breiten sich aus, Feuerwehr löscht), Hochwasser des Mains im Februar. **Deiche** (am Ufer, Radius 4) schützen vor Hochwasser.
- **Rückgängig** (Werkzeug ↶, Strg+Z / U): bis zu 10 Bauaktionen (Malen, Abriss, Gebäude); nimmt nur die Änderungen der Aktion zurück und erstattet die Kosten, Wachstum seither bleibt.
- **Verlauf** im Rat: Diagramme für Einwohner, Kasse und Zufriedenheit (letzte 10 Jahre, ein Wert je Jahreswechsel).
- **Tag & Nacht** (Menü: Auto/Tag/Nacht, Auto = 6 Minuten je Tag, reine Optik): Dämmerung, Nachttönung, leuchtende Fenster (Banken kühlweiß), blinkende Positionslichter an Türmen, Straßenlaternen, Scheinwerfer, angestrahlte Wahrzeichen. Kartenansichten bleiben unverdunkelt.
- **Minikarte** (🗺, ein-/ausklappbar): Raute mit Sichtfeld, Antippen/Ziehen springt dorthin.
- **Ton** (abschaltbar im Menü): kleine WebAudio-Klänge ohne Audiodateien (`js/sound.js`).
- **Berater** (Ticker) und **Meilensteine** (500 Dorf … 100.000 Mainhattan).

### Gebäude
Strom: Gaskraftwerk, Windpark (ab 800), Solarpark (ab 4.000). Dienste: Polizei, Feuerwehr (400), Schule (600), Äppelwoi-Wirtschaft (500), Krankenhaus (1.500), Goethe-Uni (5.000), Park. Verkehr: U-Bahn-Station (1.500). Wasser: Pumpwerk (am Ufer), Wasserturm, Kläranlage (3.000), Deich (am Wasser). Müll: Deponie, Recyclinghof (1.200), Müllverbrennung (2.500). **Wahrzeichen** (je einmal): Römer 2.000, Kaiserdom 4.000, Zoo, Palmengarten 6.000, Alte Oper 8.000, Hauptbahnhof 10.000, Messe 15.000, Stadion 20.000, Messeturm 25.000, Main Tower 30.000, Commerzbank Tower 40.000, Flughafen Fraport 50.000 (Zahl = Einwohner; gesperrt bis dahin, bleibt nach Spitzenwert 90 % offen). Wahrzeichen geben Zufriedenheit und Tourismuseinnahmen.

## Bedienung
- **Touch (Hochformat)**: Werkzeug im Dock wählen (Kategorien unten). Ein Finger: Straße/Abriss malen, Zonen als Rechteck, Gebäude per Geisterbild setzen (loslassen = bauen). **Zwei Finger** verschieben/zoomen immer. Werkzeug „Hand“: ein Finger verschiebt, Tippen = Info.
- **Maus**: Linksklick/-ziehen = Werkzeug, rechte/mittlere Taste ziehen = verschieben, Rad = Zoom, Hover zeigt Kosten/Info.
- **Tastatur**: Leertaste/P Pause, 1–3 Tempo, WASD/Pfeile, +/−, H Hand, Q Info, B Abriss, R Straße, O Ansicht wechseln, Esc Abbrechen.
- Oben: Datum, Geld, Einwohner, Zufriedenheit, Nachfrage-Balken, Tempo. Rechts: Ansicht, Rat (Finanzen/Steuern/Kredit/Zufriedenheit/Nachrichten), Menü.

## Speichern
- 3 Plätze. Format 2: JSON (Karten als Base64) → gzip (Format 1 wird weiter gelesen).
- **Lokal zuerst**: IndexedDB `simfurt-save`; scheitert sie (privater Modus, gesperrt), automatisch `localStorage` (`simfurt-slot-N`). Speichern wartet nur auf lokal; Webspace läuft im Hintergrund und blockiert nie.
- **Notfall-Schnappschuss**: beim Verstecken/Schließen der Seite synchron in `localStorage` (`simfurt-snap`), weil asynchrones Speichern dort oft nicht fertig wird. Beim Laden gewinnt der neueste Stand aus lokal, Schnappschuss und Webspace; ein beschädigter Stand wird übersprungen.
- **Autospeichern** alle 3 Spielmonate, jede Minute Echtzeit (wenn sich etwas geändert hat), beim Verlassen und über „Jetzt speichern“. Beim Start wird der zuletzt gespielte Platz geladen. `navigator.storage.persist()` wird angefragt.
- **Datei**: Menü → „📤 Als Datei exportieren“ (`Name-JJJJ-MM.simfurt`, gzip-JSON; ohne CompressionStream reines JSON); „📂“ je Platz importiert eine Datei in diesen Platz.
- **Webspace (optional)**: `https://phpexpert.de/games/simfurt/api.php` (`?ping=1`, `?list=1`, `?slot=N`, POST save/delete, ohne Login). Nicht-JSON-Antwort, 404 oder Netzfehler → 5 Minuten „nicht erreichbar“, kein weiterer Versuch; nicht gesendete Stände werden gemerkt (`simfurt-pending-N`) und später nachgeschickt. Status steht im Menü.
- Server: `simfurt/api.php` + `simfurt/data/.htaccess` in diesem Repo; `deploy-backend.yml` lädt sie nach `/games/simfurt/`; vorheriger Stand bleibt als `prevN` erhalten. Meta: `savedAt, format, name, year, month, pop, money, mapSize, bytes`.
- Nov 2026: Backend von `/vocs/simfurt/` nach `/games/simfurt/` umgezogen (games ist eigenständig).

## Technik
Vanilla ES-Module, kein Build. `js/data.js` (Daten), `js/sim.js` (Logik), `js/render.js` (isometrische Sprites, Autos, Overlays), `js/save.js` (lokal/Datei/Webspace), `js/sound.js` (WebAudio), `js/minimap.js` (Minikarte), `js/main.js` (UI/Eingabe/Schleife). Tests: `node simfurt/test/sim.test.js` und `node simfurt/test/save.test.js` (bzw. `npm test` im Ordner; Workflow `test-simfurt.yml`). Arbeitsplan: `PLAN.md`. Service Worker network-first, Cache-Name in `sw.js` bei Änderungen hochzählen.

## Bewusst offen / Ideen
Musik, Tag/Nacht, Wasserversorgung, Schienen/S-Bahn, Szenarien (z. B. Hochwasser 1995), Bevölkerungsgruppen, höhere Karten (Hügel/Taunus), Cloud-Sync mit Login, Nachbarstädte/Handel, Altersgruppen, Szenarien mit Zielen, Erfolge, Wiederherstellen, Gelände mit Höhen.
