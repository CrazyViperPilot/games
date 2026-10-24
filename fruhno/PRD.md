# Fruhno – PRD (Entwurf v0.1)

UNO-artiges Kartenspiel mit Frühstücksthema für 2–3 Spieler (Daniel, Lea, Kira) über das Netz. Teil der Game Suite, komplett unabhängig von den anderen Spielen (eigener Ordner `fruhno/`, eigener Service-Worker-Cache `fruhno-v1`, eigener localStorage-Präfix `fruhno:`).

Status: **Entwurf – wartet auf Daniels Antworten (siehe „Offene Fragen“). Mit den Standardannahmen gebaut, falls er nichts anderes sagt.**

## 1. Ziele
- Spielbar auf Pixel 8a und Lenovo Tab M11, Querformat, als PWA installierbar.
- Vanilla JS, kein Build-Schritt.
- Multiplayer mit drei festen Spielern; ein Spieler hostet, die anderen joinen.
- Spiel-Shell (UI, Karten, Assets) offline verfügbar; Spielen selbst braucht Netz.

## 2. Nicht-Ziele
- Keine Konten, keine Registrierung, kein Chat, keine Bots (siehe Offene Fragen), keine Öffentlichkeit.

## 3. Spieler und Lobby
- Feste Namen: **Daniel, Lea, Kira**. Beim ersten Start wählt man seinen Namen; er wird lokal gemerkt und ist änderbar.
- Zustände: *kein Spiel* → *Lobby* (gehostet, wartet) → *läuft* → *beendet* → *kein Spiel*.
- Läuft keine Lobby/kein Spiel, kann jeder **hosten**. Die anderen sehen „Daniel hostet“ und können **joinen**.
- Der Host kann die Runde **ab 2 Spielern starten** und jederzeit **beenden** (für alle, mit Bestätigung).
- Jeder Name kann nur einmal belegt sein (kein Doppel-Join). Wer das Spiel verlässt/Verbindung verliert, kann mit demselben Namen wieder einsteigen (Reconnect), solange die Runde läuft.
- Nach Rundenende: Ergebnisanzeige, danach zurück zu „kein Spiel“.

## 4. Kartensatz (108 Karten wie UNO)
Vier „Farben“ = Kategorien, je 25 Karten:

| Farbe | Kategorie | Zahlenkarten (Motive) |
|---|---|---|
| Orange/Rot | Süßes | Nutella, Erdbeermarmelade, Himbeermarmelade, Honig, Ahornsirup, Nuss-Nougat, Aprikosenmarmelade, Streusel-Zucker, Pflaumenmus, Zimt-Zucker |
| Gelb/Braun | Backwaren | Croissant, Vollkornbrötchen, Weizenbrötchen, Brezel, Toast, Mohnbrötchen, Laugenstange, Roggenbrot, Baguette, Rosinenschnecke |
| Blau | Getränke | Kaffee, Milchkaffee, Tee, Orangensaft, Kakao, Apfelsaft, Milch, Wasser, Cappuccino, Smoothie |
| Grün | Belag | Käse, Salami, Tomatenscheiben, Gurkenscheiben, Schinken, Ei, Radieschen, Frischkäse, Lachs, Paprika |

- Je Farbe: 1× Motiv „0“, 2× Motive „1–9“ (jedes Motiv hat eine Nummer 0–9 plus Bild und Namen; Nummer steht groß auf der Karte, Motiv als Bild/Emoji-Grafik darunter).
- Je Farbe 2× je Sonderkarte (Standardnamen, änderbar):
  - **Aussetzen** → „Verschlafen“ (nächster Spieler setzt aus)
  - **Richtungswechsel** → „Rührei wenden“ (bei 2 Spielern wie Aussetzen)
  - **+2** → „Doppelte Portion“
- 4× **Farbwahl** → „Frühstücksbuffet“, 4× **+4 mit Farbwahl** → „Großes Buffet +4“.
- Karten werden als SVG/CSS gezeichnet, keine fremden Bildrechte nötig. Motive als Emoji + Text (Standard), eigene Illustrationen später möglich.

## 5. Regeln (Standard-UNO)
- Start: 7 Karten je Spieler, eine Startkarte aufdecken (Sonderkarte als Startkarte wirkt auf den ersten Spieler; Farbwahl-Karten werden zurückgemischt).
- Legen: gleiche Farbe, gleiche Nummer oder gleiches Symbol; Farbwahl immer legbar; +4 nur, wenn keine Karte der aktuellen Farbe auf der Hand ist (Annahme: strikte Regel, keine Anzweiflung).
- Kann man nicht legen: eine Karte ziehen; ist sie legbar, darf sie sofort gelegt werden, sonst Zug vorbei.
- +2 / +4: Der nächste Spieler zieht und setzt aus (kein Stapeln, Standardannahme).
- **„UNO“ rufen (Fruhno!)**: Bei der vorletzten Karte muss man den Button „Fruhno!“ drücken. Vergisst man es, kann ein anderer Spieler „Erwischt!“ drücken, bevor der nächste Zug passiert: Strafe +2 Karten. (Standardannahme: aktiv, mit Button.)
- Rundenende: Wer zuerst keine Karten mehr hat, gewinnt. Punkte (Standardannahme): Gewinner bekommt die Summe der Restkarten der anderen (Zahl = Wert, Aktion = 20, Wild = 50); Punktestand wird über mehrere Runden bis zum Beenden durch den Host gezählt, danach zurückgesetzt.
- Zugzeit: kein Timer (Standardannahme), der Host kann einen hängenden Spieler per „Überspringen“ weiterschicken.

## 6. UI
- Querformat, ein Screen: Ablagestapel + Ziehstapel in der Mitte, eigene Hand unten (horizontal scrollbar/überlappend), Mitspieler oben/seitlich mit Kartenanzahl und Namen, Pfeil für Richtung, Anzeige „Du bist dran“.
- Große Touch-Ziele, Karte antippen = legen (nicht legbare Karten gedimmt), Farbwahl-Dialog bei Wild.
- Menü: Name, Host-Button / Join-Button, Lobby-Ansicht mit Spielerliste, Start (ab 2) / Beenden (Host), Sprache Deutsch.
- Wichtig auf beiden Geräten: skaliert per CSS-Variablen über `vmin`, getestet auf 20:9 (Pixel) und 16:10 (Tab).
- Karten- und Tap-Animationen kurz halten; Sounds optional (Standard: aus).

## 7. Technik
### Frontend
- `fruhno/index.html`, `css/`, `js/`, `manifest.json`, `sw.js`, `icons/` unter `crazyviperpilot.github.io/games/fruhno/`.
- Service Worker cached nur die Shell (`fruhno-v1`); API-Aufrufe werden **nie** gecached.
- Ohne Netz: Spiel startet, zeigt „Offline – Fruhno braucht Internet zum Spielen“; Regeln/Kartenübersicht bleiben lesbar.
- Eintrag in der Spieleliste (`index.html` im Root) wie bei den anderen Spielen.

### Backend (PHP, Daniels Webspace)
- Gleicher Webspace wie vipervocs (dogado, `phpexpert.de/vocs`), Unterordner **`fruhno/`** davon, d. h. `phpexpert.de/vocs/fruhno/api.php`. Dateibasierter Zustand (eine JSON-Datei mit `flock`), keine Datenbank – wie `stats.php`.
- Das Frontend läuft auf GitHub Pages (anderer Origin) → API sendet CORS-Header für `https://crazyviperpilot.github.io`.
- Der Server ist **maßgeblich** (Autorität): prüft Züge, mischt, teilt aus; Clients bekommen nur ihren eigenen Handblick (fremde Hände nie im Response).
- Zugriffsschutz: gemeinsamer Schlüssel im Header (wie `X-Vocs-Key`), den Daniel einmal in der App eingibt; der Hash liegt in einer vom Deploy geschriebenen `config.php`. Zusätzlich pro Spieler ein zufälliges Session-Token beim Join (verhindert, dass jemand einen anderen Namen übernimmt).
- Endpunkte (Entwurf): `GET state` (mit `?since=<version>`), `POST host`, `POST join`, `POST leave`, `POST start`, `POST end`, `POST play`, `POST draw`, `POST fruhno`, `POST catch`, `POST skip`.
- Aufräumen: Lobby/Spiel ohne Aktivität für 2 Stunden wird automatisch beendet.

### Synchronisation
- **Polling (Standard)**: Client fragt alle ~1,5 s `state?since=N`; Server antwortet mit `304`/leer, wenn sich nichts geändert hat. Für 3 Spieler auf Shared-Hosting robust und simpel. Long-Polling/SSE sind auf Shared-Hosting oft instabil (PHP-Prozess-Limits) → nur bei Bedarf später.

### Deploy
- Das vipervocs-Repo deployt bereits per `lftp` auf den Webspace und kopiert nur `index.html manifest.json sw.js css js assets api`. Es braucht eine kleine Erweiterung: `fruhno/` mit in die Kopierliste, plus Schreiben einer `fruhno/config.php` (Schlüssel-Hash) – **nicht ohne Daniels Freigabe**.
- Alternative ohne Eingriff in vipervocs: eigener Workflow im games-Repo (benötigt dieselben FTP-Secrets dort).
- `fruhno/data/` auf dem Server wird nie überschrieben (wie `api/data/`, mit `.htaccess` gesperrt).

## 8. Tests
- Regel-Engine (Spiellogik) als reine JS-/PHP-Funktionen mit Unit-Tests (Kartensatz = 108, Legbarkeit, Aussetzen/Richtung bei 2 Spielern, +2/+4, Nachziehstapel neu mischen, Punkte).
- Browser-Test mit Playwright gegen eine lokale PHP-Instanz (`php -S`), 3 simulierte Spieler, Screenshots in beiden Formaten.

## 9. Meilensteine
1. Regel-Engine + Tests (PHP, ggf. Spiegel in JS für Legbarkeits-Anzeige).
2. API + Lobby (Host/Join/Start/Ende) lokal lauffähig.
3. Frontend: Kartendarstellung, Spielscreen, Polling.
4. PWA/Offline-Shell, Spieleliste, Icons.
5. Deploy-Anbindung (nach Freigabe), Test auf echten Geräten.

## 10. Offene Fragen an Daniel
Siehe Chat. Standardannahmen oben gelten, bis er anders entscheidet.
