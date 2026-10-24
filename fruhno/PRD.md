# Fruhno – PRD (v0.3)

UNO-artiges Kartenspiel mit Frühstücksthema für 2–3 Spieler (Daniel, Lea, Kira) über das Netz. Teil der Game Suite, komplett unabhängig von den anderen Spielen (eigener Ordner `fruhno/`, eigener Service-Worker-Cache mit Präfix `fruhno-`, eigener localStorage-Präfix `fruhno:`).

Status: **v0.3 (2026-10-24) – umgesetzt und live. Die Regeln in Abschnitt 5 sind mit `engine.php` abgeglichen. Alles, was vom offiziellen UNO abweicht, ist mit 🏠 als Hausregel markiert.**

## 1. Ziele
- Spielbar auf Pixel 8a und Lenovo Tab M11, Querformat, als PWA installierbar.
- Vanilla JS, kein Build-Schritt.
- Multiplayer mit drei festen Spielern; ein Spieler hostet, die anderen joinen.
- Spiel-Shell (UI, Karten, Assets) offline verfügbar; Spielen selbst braucht Netz.

## 2. Nicht-Ziele
- Keine Konten, keine Registrierung, kein Zugtimer, keine Öffentlichkeit.

## 3. Spieler und Lobby
- Feste Namen: **Daniel, Lea, Kira**. Beim ersten Start wählt man seinen Namen; er wird lokal gemerkt und ist änderbar.
- Zustände: *kein Spiel* → *Lobby* (gehostet, wartet) → *läuft* → *beendet* → *kein Spiel*.
- Läuft keine Lobby/kein Spiel, kann jeder **hosten**. Die anderen sehen „Daniel hostet“ und können **joinen**.
- Der Host kann die Runde **ab 2 Spielern starten** und jederzeit **beenden** (für alle, mit Bestätigung).
- Jeder Name kann nur einmal belegt sein (kein Doppel-Join). Wer das Spiel verlässt/Verbindung verliert, kann mit demselben Namen wieder einsteigen (Reconnect), solange die Runde läuft.
- Nach Rundenende: Ergebnisanzeige mit Punkten; der Host startet die nächste Runde oder beendet alles, danach ist wieder „kein Spiel“ (Details in Abschnitt 5.6).

## 3a. Chat und Bot (v0.2)
- **Chat**: 💬-Button oben rechts, Panel mit den Nachrichten der letzten 5 Minuten (höchstens 60, je max. 200 Zeichen), roter Punkt bei ungelesenen. Schließen per ✕, Tipp außerhalb oder nach 3 s Auto-Ausblenden. Der Chat überlebt das Spielende, bis der Host beendet.
- **Bot**: Der Host kann in der Lobby (oder zwischen Runden) einen Bot 🤖 hinzufügen/entfernen, damit auch allein oder zu zweit gespielt werden kann. Der Bot läuft auf dem Server, spielt nach ~1,2 s, bevorzugt Aktionskarten, wählt die häufigste Farbe seiner Hand und ruft immer „Fruhno!“. Maximal 3 Spieler inkl. Bot.

## 4. Kartensatz (108 Karten wie UNO)
Vier „Farben“ = Kategorien, je 25 Karten:

| Farbe | Kategorie | Zahlenkarten 0–9 (Motiv je Zahl, in dieser Reihenfolge) |
|---|---|---|
| Rosé | Süßes | Nutella, Erdbeermarmelade, Himbeermarmelade, Honig, Ahornsirup, Nuss-Nougat, Aprikosenmarmelade, Pflaumenmus, Zimt-Zucker, Pudding |
| Bernstein | Backwaren | Croissant, Vollkornbrötchen, Weizenbrötchen, Brezel, Toast, Mohnbrötchen, Baguette, Pfannkuchen, Waffel, Rosinenschnecke |
| Blau | Getränke | Kaffee, Milchkaffee, Tee, Orangensaft, Kakao, Apfelsaft, Milch, Wasser, Cappuccino, Smoothie |
| Grün | Belag | Käse, Salami, Tomatenscheiben, Gurkenscheiben, Schinken, Ei, Radieschen, Frischkäse, Lachs, Paprika |

- Je Farbe: 1× Motiv „0“, 2× Motive „1–9“ (jedes Motiv hat eine Nummer 0–9 plus Bild und Namen; Nummer steht groß auf der Karte, Motiv als Bild/Emoji-Grafik darunter).
- Je Farbe 2× je Sonderkarte (Standardnamen, änderbar):
  - **Aussetzen** → „Verschlafen“ (nächster Spieler setzt aus)
  - **Richtungswechsel** → „Rührei wenden“ (bei 2 Spielern wie Aussetzen)
  - **+2** → „Doppelte Portion“
- 4× **Farbwahl** → „Frühstücksbuffet“, 4× **+4 mit Farbwahl** → „Großes Buffet +4“.
- Karten werden per CSS gezeichnet, Motive als Emoji + Text (keine fremden Bildrechte); eigene Illustrationen wären später möglich.
- Gesamt: je Farbe 1 + 18 + 6 = 25 Karten, dazu 4 Farbwahl und 4 +4 = **108 Karten**.

## 5. Regeln
Legende: **🏠 = Hausregel** (weicht vom offiziellen UNO ab, von Daniel festgelegt oder als Standardannahme gewählt). Alles ohne 🏠 entspricht dem offiziellen UNO.

### 5.1 Ablauf
- Pro Runde werden die 108 Karten gemischt, jeder bekommt **7 Karten**, eine **Startkarte** wird aufgedeckt (Farbwahl-/+4-Karten als Startkarte werden unten in den Ziehstapel gesteckt und es wird neu aufgedeckt). Die Farbe der Startkarte ist die aktuelle Farbe.
- Wer beginnt, wechselt reihum mit jeder Runde (Runde 1 = erster Spieler der Reihenfolge).
- Ist die Startkarte eine Aktionskarte, wirkt sie wie von einem Spieler vor dem Beginner gelegt: Aussetzen überspringt den Beginner, Richtungswechsel dreht die Richtung (zu zweit beginnt der andere), +2 startet eine +2-Kette gegen den Beginner (siehe 5.4).
- Die Reihenfolge läuft im Uhrzeigersinn; der Pfeil in der Mitte zeigt die Richtung.

### 5.2 Karte legen
- Legbar ist eine Karte mit **gleicher Farbe** wie die aktuelle Farbe, **gleicher Zahl** oder **gleichem Symbol** (Aussetzen auf Aussetzen, Richtungswechsel auf Richtungswechsel, +2 auf +2) wie die oberste Karte.
- **Farbwahl** (Frühstücksbuffet) ist immer legbar; der Leger wünscht sich die neue Farbe.
- **+4** (Großes Buffet) ist nur legbar, wenn man **keine Karte der aktuellen Farbe** auf der Hand hat; Farbwahl-Karten zählen dabei nicht als Farbkarten. 🏠 Es gibt **kein Anzweifeln** (kein Challenge): Der Server erlaubt die +4 nur, wenn sie regelkonform ist.
- Nach einer Farbwahl/+4 gilt die gewünschte Farbe; die oberste Karte hat dann keine Zahl, es zählt nur die Farbe.
- Auf einer offenen +2-Kette (5.4) ist nur +2 legbar.
- Nicht legbare Karten sind gedimmt und nicht antippbar; der Server prüft jeden Zug erneut.

### 5.3 Ziehen
- Kann oder will man nicht legen, zieht man **eine Karte** (Tipp auf den Ziehstapel). Ist die gezogene Karte legbar, darf **nur sie** sofort gelegt oder mit „Passen“ behalten werden; ist sie nicht legbar, ist der Zug automatisch vorbei.
- Ziehen ist auch erlaubt, wenn man eine legbare Karte hätte (der Server erlaubt es immer).
- Ist der Ziehstapel leer, wird der Ablagestapel (ohne oberste Karte) neu gemischt.

### 5.4 Aktionskarten
| Karte | Frühstücksname | Wirkung |
|---|---|---|
| Aussetzen | Verschlafen | Der nächste Spieler setzt aus. Zu zweit ist der Leger gleich nochmal dran (offizielle 2-Spieler-Regel). |
| Richtungswechsel | Rührei wenden | Dreht die Richtung. Zu zweit wirkt sie wie Aussetzen: der Leger ist nochmal dran (offiziell). |
| +2 | Doppelte Portion | 🏠 **Stapelbar, kein Aussetzen** – siehe unten. |
| Farbwahl | Frühstücksbuffet | Wunschfarbe wählen, nächster Spieler ist normal dran. |
| +4 | Großes Buffet | Wunschfarbe wählen. 🏠 Der nächste Spieler **zieht 4 Karten, setzt nicht aus** und ist sofort dran: Er muss die gewünschte Farbe legen (oder eine Farbwahl/+4, falls erlaubt) oder ziehen. Offiziell würde er aussetzen. |

**🏠 +2 stapeln (Daniel, 2026-10-24):**
- Eine gelegte +2 zieht nicht sofort Karten, sondern eröffnet eine **Kette mit 2 offenen Karten** für den nächsten Spieler.
- Der Spieler darf eine **beliebige +2 (egal welche Farbe)** drauflegen; die Summe wächst (+4, +6, +8 …) und geht an den Nächsten weiter. Die Farbe wird die der zuletzt gelegten +2.
- Hat er keine +2 (oder will nicht), tippt er den Ziehstapel und **zieht die ganze Summe**. Er setzt **nicht** aus, bleibt dran und spielt danach normal weiter (legen oder eine weitere Karte ziehen).
- Auf einer offenen Kette sind nur +2 legbar (🏠 insbesondere **kein +4 auf +2**); alle anderen Karten sind gesperrt. Der Ziehstapel zeigt „+N“, die Meldung lautet „Zieh N Karten – oder lege eine +2 drauf“.
- Offiziell: +2 lässt den Nächsten 2 ziehen und aussetzen, ohne Stapeln.

### 5.5 „Fruhno!“ (UNO-Ruf)
- Hat man **höchstens 2 Karten**, erscheint der Button „Fruhno!“. Man drückt ihn **vor oder direkt nach dem Legen der vorletzten Karte**, sodass man bei einer Karte als „gerufen“ gilt.
- Beim Drücken erscheint für alle eine Chat-Systemmeldung („Daniel ruft Fruhno! 🥐 Nur noch eine Karte“). Der Bot ruft immer.
- Hat jemand nur noch **eine Karte** und nicht gerufen, erscheint bei den anderen „Erwischt! <Name>“. Wer zuerst drückt, lässt den Erwischten **2 Karten ziehen**. Der Moment endet, sobald der nächste Spieler eine Karte legt oder zieht.
- Ziehen setzt den Ruf zurück (man muss bei Bedarf neu rufen).
- 🏠 Der Ruf ist ein Button (kein Zuruf) und der Erwischt-Button ist für alle Mitspieler jederzeit während des Moments verfügbar.

### 5.6 Rundenende und Punkte
- Wer als Erster keine Karten mehr hat, gewinnt die Runde (auch mit einer +2/+4 als letzter Karte). Die Wirkung der letzten Karte spielt dann keine Rolle mehr.
- Der Gewinner bekommt die **Summe aller Restkarten der anderen**: Zahlenkarten = Zahl, Verschlafen/Rührei/+2 = 20, Farbwahl/+4 = 50 (wie offiziell).
- 🏠 Die Punkte laufen **über mehrere Runden** weiter, **ohne Zielpunktzahl**: Der Host startet die nächste Runde („Nächste Runde“) oder beendet alles („Beenden“, setzt die Punkte zurück).
- Die Ergebnisanzeige zeigt Gewinner, Punkte der Runde, Restkarten und Gesamtstände.

### 5.7 Weitere Regeln dieser App
- 🏠 **Kein Zugtimer.** Der Host kann einen hängenden Spieler mit „Überspringen“ weiterschicken (nur der Host, nur wenn nicht er selbst dran ist).
- 🏠 **Maximal 3 Spieler**, mindestens 2 (der Bot zählt mit).
- 🏠 **Bot** (Abschnitt 3a): legt, wenn möglich, eine Karte (Aktionskarten vor Zahlenkarten, Farbwahl danach, +4 zuletzt), wünscht sich die häufigste Farbe seiner Hand; sonst zieht er und legt die gezogene Karte, falls sie passt, oder passt.
- Verlässt ein Spieler eine laufende Runde, wandern seine Karten unter den Ziehstapel und die Runde läuft weiter, solange mindestens 2 Spieler übrig sind; sonst wird alles zurückgesetzt. Verlässt der Host, wird der nächste Mensch Host.
- Jede Spielaktion erzeugt im Chat eine kleine graue Zeile (z. B. „Kira legt Belag 🧀 7“, „Daniel legt Frühstücksbuffet und wünscht sich Getränke ☕“, „Lea zieht 4 Karten“, „Lea passt“, „Bot setzt aus“), dazu Beitritt/Start/Ende. Diese Zeilen blenden den Chat nicht ein; echte Nachrichten, Fruhno-Rufe, „Erwischt“ und der Rundensieg tun das und setzen den roten Punkt.
- Chat-Nachrichten und Aktionszeilen verschwinden nach 5 Minuten (serverseitig).

### 5.8 Übersicht der Hausregeln
| Thema | Offiziell | Fruhno 🏠 |
|---|---|---|
| +2 | Nächster zieht 2 und setzt aus | Stapelbar (+2 auf +2, Summe wächst); wer nicht stapelt, zieht die Summe und ist danach dran |
| +4 | Nächster zieht 4 und setzt aus; Anzweifeln möglich | Nächster zieht 4 und ist dran; kein Anzweifeln, +4 nur ohne Karte der aktuellen Farbe |
| +4 auf +2 | – | nicht erlaubt |
| UNO-Ruf | Zuruf | Button „Fruhno!“ + Chat-Meldung; „Erwischt!“-Button, +2 Strafe |
| Punkte | Ziel meist 500 | Keine Zielpunktzahl, Punkte laufen bis der Host beendet |
| Timer | – | keiner; Host kann überspringen |
| Spielerzahl | 2–10 | 2–3 (Daniel, Lea, Kira), Bot möglich |
| Farbwunsch | – | Chat-Systemmeldung für alle |

## 6. UI
- Querformat, ein Screen: Ablagestapel + Ziehstapel in der Mitte, eigene Hand unten (horizontal scrollbar/überlappend), Mitspieler oben/seitlich mit Kartenanzahl und Namen, Pfeil für Richtung, Anzeige „Du bist dran“.
- Große Touch-Ziele, Karte antippen = legen (nicht legbare Karten gedimmt), Farbwahl-Dialog bei Wild.
- Menü: Name, Host-Button / Join-Button, Lobby-Ansicht mit Spielerliste, Start (ab 2) / Beenden (Host), Sprache Deutsch.
- Wichtig auf beiden Geräten: skaliert per CSS-Variablen über `vmin`, getestet auf 20:9 (Pixel) und 16:10 (Tab).
- Karten- und Tap-Animationen kurz halten; Sounds optional (Standard: aus).

## 7. Technik
### Frontend
- `fruhno/index.html`, `css/`, `js/`, `manifest.json`, `sw.js`, `icons/` unter `crazyviperpilot.github.io/games/fruhno/`.
- Service Worker cached nur die Shell (Präfix `fruhno-`, bei Änderungen `CACHE_VERSION` erhöhen); API-Aufrufe werden **nie** gecached.
- Ohne Netz: Spiel startet, zeigt „Offline – Fruhno braucht Internet zum Spielen“; Regeln/Kartenübersicht bleiben lesbar.
- Eintrag in der Spieleliste (`index.html` im Root) wie bei den anderen Spielen.

### Backend (PHP, Daniels Webspace)
- Gleicher Webspace wie vipervocs (dogado, `phpexpert.de/vocs`), Unterordner **`fruhno/`** davon, d. h. `phpexpert.de/vocs/fruhno/api.php`. Dateibasierter Zustand (eine JSON-Datei mit `flock`), keine Datenbank – wie `stats.php`.
- Das Frontend läuft auf GitHub Pages (anderer Origin) → API sendet CORS-Header für `https://crazyviperpilot.github.io`.
- Der Server ist **maßgeblich** (Autorität): prüft Züge, mischt, teilt aus; Clients bekommen nur ihren eigenen Handblick (fremde Hände nie im Response).
- Zugriffsschutz: gemeinsamer Schlüssel im Header `X-Fruhno-Key` (Secret `FRUHNO_KEY`, ersatzweise `VOCS_KEY`) (wie `X-Vocs-Key`), den Daniel einmal in der App eingibt; der Hash liegt in einer vom Deploy geschriebenen `config.php`. Zusätzlich pro Spieler ein zufälliges Session-Token beim Join (verhindert, dass jemand einen anderen Namen übernimmt).
- Endpunkte (eine URL `api.php`): `GET` liefert den ganzen Tisch aus Sicht des Spielers (Polling alle ~1,5 s); `POST {action}` mit `host`, `join`, `leave`, `addbot`, `removebot`, `start`, `end`, `play`, `draw`, `pass`, `fruhno`, `catch`, `skip`, `chat`.
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

## 10. Umsetzung
- Frontend: `games/fruhno/` (Vanilla JS: `js/cards.js` Kartendaten/Rendering, `js/api.js` Client, `js/main.js` UI).
- Backend: Repo `vipervocs`, Ordner `fruhno/` (`engine.php` Regeln, `api.php` Endpunkt, `test.php` Regeltests: `php fruhno/test.php`). Deploy über die bestehende dogado-Action; Zielpfad `…/vocs/fruhno/api.php`.
- Beim ersten Start gibt jeder Name, Schlüssel und (vorbelegt) Server-URL ein; alles liegt im localStorage (`fruhno:`).
- Wer ein Spiel hostet, ist Host; verlässt der Host das Spiel, wird der nächste Mensch Host. Ein Name ist nur mit seinem Token (oder nach 25 s Inaktivität) neu belegbar.
- Aufräumen: nach 2 h ohne Aktivität wird alles zurückgesetzt.
- Gefundene Einschränkung: Ohne Schlüssel-Secret im Deploy-Environment gibt es kein `config.php` → Deploy bricht ab (Fehlermeldung).
