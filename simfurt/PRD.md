# Simfurt – Produktanforderungen

Eigenständiges Städtebauspiel im Frankfurter Gewand (Main, Skyline, Bankenviertel, Äppelwoi). Eigenes Design im Genre der klassischen isometrischen Städtebau-Simulationen – keine Übernahme von Namen, Oberfläche, Grafiken oder exakten Regeln eines bestehenden Spiels.

## Ziele
- Offline-fähige PWA (`simfurt/`), eigener Cache (`simfurt-`), eigener Spielstand, unabhängig von den anderen Spielen.
- Optimiert für Pixel 8a im **Hochformat** (Touch), dazu gut mit **Maus und Tastatur** am PC.
- Spielstand lokal (IndexedDB) **und** auf Daniels Webspace (PHP, `simfurt/api.php` im Repo `CrazyViperPilot/vipervocs`, Deploy per dortiger Action, analog Fruhno).

## Spielprinzip
Karte wählbar 64×64, 96×96 oder 128×128 Kacheln (Größe wie im Original: 128; im Neue-Stadt-Dialog, im Spielstand gespeichert) mit Fluss (Main) und Wald, isometrisch (Canvas 2D, Sprite-Cache). Ein Tick = ein Monat (Start Januar 1990). Der Spieler legt Straßen, Zonen, Kraftwerke und Dienste an; die Stadt wächst automatisch nach Nachfrage.

### Zonen (Rechteck ziehen, 10 €/Kachel, Bankenviertel 30 €)
Wohnen (R), Gewerbe (C), Industrie (I), **Bankenviertel (B, ab 3.000 Einw.)** mit bis zu 4 Stufen (Skyline: Pyramiden-, Antennen-, Zwillingsdächer). R/C/I haben 3 Stufen. Eine Parzelle entwickelt sich nur mit **Straße** (≤ 2 Kacheln) und **Strom**. Stufenaufstieg hängt am **Grundwert** (und bei Banken an Bildung, bei Wohnen an Luft).

### Simulation (`js/sim.js`, ohne DOM, getestet)
- **Nachfrage** W/G/I/B aus Arbeitsplätzen vs. Arbeitskräften, Einwohnern, Steuern, Zufriedenheit, Verschmutzung, Bildung (Balken oben).
- **Strom**: Kraftwerke versorgen einen Radius und haben Kapazität; Überlast → Teilausfall.
- **Karten**: Polizei, Feuerwehr, Gesundheit, Bildung, Parks, U-Bahn (Abdeckung), Kriminalität, Verschmutzung, Verkehr (BFS über Straßen), Grundwert. Alle als Kartenansichten (Auge-Knopf).
- **Zufriedenheit** (0–100) aus Steuern, Kriminalität, Umwelt, Verkehr, Diensten, Parks, Wahrzeichen, Arbeitslosigkeit, Strom; steuert die Belegung (Einwohner = Kapazität × Belegung).
- **Finanzen**: Steuer je Zone (3 Regler), Tourismus der Wahrzeichen, Unterhalt (Gebäude, Straßen), Kredit in 10.000-€-Schritten (bis 50.000 €, 0,4 %/Monat).
- **Katastrophen** (abschaltbar): Brände (breiten sich aus, Feuerwehr löscht), Hochwasser des Mains im Februar.
- **Berater** (Ticker) und **Meilensteine** (500 Dorf … 100.000 Mainhattan).

### Gebäude
Strom: Gaskraftwerk, Windpark (ab 800), Solarpark (ab 4.000). Dienste: Polizei, Feuerwehr (400), Schule (600), Äppelwoi-Wirtschaft (500), Krankenhaus (1.500), Goethe-Uni (5.000), Park. Verkehr: U-Bahn-Station (1.500). **Wahrzeichen** (je einmal): Römer 2.000, Kaiserdom 4.000, Zoo, Palmengarten 6.000, Alte Oper 8.000, Hauptbahnhof 10.000, Messe 15.000, Stadion 20.000, Messeturm 25.000, Main Tower 30.000, Commerzbank Tower 40.000, Flughafen Fraport 50.000 (Zahl = Einwohner; gesperrt bis dahin, bleibt nach Spitzenwert 90 % offen). Wahrzeichen geben Zufriedenheit und Tourismuseinnahmen.

## Bedienung
- **Touch (Hochformat)**: Werkzeug im Dock wählen (Kategorien unten). Ein Finger: Straße/Abriss malen, Zonen als Rechteck, Gebäude per Geisterbild setzen (loslassen = bauen). **Zwei Finger** verschieben/zoomen immer. Werkzeug „Hand“: ein Finger verschiebt, Tippen = Info.
- **Maus**: Linksklick/-ziehen = Werkzeug, rechte/mittlere Taste ziehen = verschieben, Rad = Zoom, Hover zeigt Kosten/Info.
- **Tastatur**: Leertaste/P Pause, 1–3 Tempo, WASD/Pfeile, +/−, H Hand, Q Info, B Abriss, R Straße, O Ansicht wechseln, Esc Abbrechen.
- Oben: Datum, Geld, Einwohner, Zufriedenheit, Nachfrage-Balken, Tempo. Rechts: Ansicht, Rat (Finanzen/Steuern/Kredit/Zufriedenheit/Nachrichten), Menü.

## Speichern
- 3 Plätze. Format: JSON (Karten als Base64) → gzip. Lokal IndexedDB `simfurt-save`; Webspace `https://phpexpert.de/vocs/simfurt/api.php` (`?list=1`, `?slot=N`, POST save/delete, ohne Login). Neuerer `savedAt` gewinnt; ohne Netz später Nachschicken (Merker in localStorage).
- Autospeichern bei jedem Jahreswechsel, beim Verstecken/Schließen der Seite und über „Jetzt speichern“. Beim Start wird der zuletzt gespielte Platz geladen.
- Server: `simfurt/api.php` + `simfurt/data/.htaccess` im Repo vipervocs; Workflow kopiert `simfurt/` mit; Daten werden nie überschrieben.

## Technik
Vanilla ES-Module, kein Build. `js/data.js` (Daten), `js/sim.js` (Logik), `js/render.js` (isometrische Sprites, Autos, Overlays), `js/save.js`, `js/main.js` (UI/Eingabe/Schleife). Tests: `node simfurt/test/sim.test.js` (Workflow `test-simfurt.yml`). Service Worker network-first, Cache-Name in `sw.js` bei Änderungen hochzählen.

## Bewusst offen / Ideen
Sound und Musik, Tag/Nacht, Wasserversorgung, Schienen/S-Bahn, Szenarien (z. B. Hochwasser 1995), Hochwasserschutz-Deiche, Bevölkerungsgruppen, höhere Karten (Hügel/Taunus), Rückgängig-Knopf.
