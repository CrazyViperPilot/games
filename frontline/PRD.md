# Frontline – Product Requirements

Echtzeit-Strategiespiel (RTS) im Browser, inspiriert vom Spielprinzip „FOB bauen, Ressourcen fördern, Nachschub fahren,
Konfliktzone halten“. Zwei Parteien: Spieler (Blau) gegen Computer (Rot).

**Aufbau des PRD (seit v5.79):** Diese Datei ist der Einstieg: Ziel, Spielablauf, Qualität, Priorisierung und die Übersicht unten.
Die Regeln je Thema stehen in eigenen Dateien unter [docs/prd/](docs/prd/), die Abschnittsnummern (§3 … §16) sind geblieben, damit
Verweise wie „PRD §15“ in Code und Doku weiter stimmen. **Für eine Änderung reicht: diese Datei plus die Themen-Datei(en) des Pakets.**
Der Änderungsverlauf steht in [docs/changelog.md](docs/changelog.md) (nur bei Bedarf lesen).

| § | Thema | Datei | Kurz |
|---|---|---|---|
| 3, 4, 5, 5a | Ressourcen, Logistik, FOB, Gebäude, Festung | [ressourcen-bau.md](docs/prd/ressourcen-bau.md) | Geld, Baumaterial, Munition, Treibstoff (auch Stahl, Kerosin); Hauptstadt und vordere FOB-Lager, LKW, Nachfüllen, Soldaten-Nachschub; FOB-Fahrzeug und Bauradius; Militärgebäude; Festung mit Gefechtstürmen |
| 6 | Einheiten, Waffen, Schaden | [einheiten.md](docs/prd/einheiten.md) | Rollen aller Einheiten, Wertetabellen (erzeugt mit `npm run docs`), Waffen je Panzerklasse, Treffer bis zum Abschuss |
| 7 | Konfliktzone, Gelände, Kisten, Hot Zone, Sendemast, Fluss, Bohrer | [zone-gelaende.md](docs/prd/zone-gelaende.md) | Zonenkontrolle, Punkte und Zonengeld; Hügel, Seen, Natur und Kleinkram der Karte; Versorgungskisten; wandernde Hot Zone; Sendemast-Sieg; Fluss mit Brücken und Furten; Bohrer |
| 7 | Häuserkampf | [haeuserkampf.md](docs/prd/haeuserkampf.md) | Häuser besetzen, Stürmen, Ausbau zur Stellung, Zonengewicht, Ruinen als Deckung, Feuerbereich zur Straße, KI im Häuserkampf |
| 7 | Wetter, Jahreszeiten, Forschung | [wetter-forschung.md](docs/prd/wetter-forschung.md) | Wetterlagen und ihre Wirkung, Jahreszeiten; Forschungsbaum mit 10 Stufen und 8 Ästen |
| 8, 9, 9a | Steuerung, Oberfläche, Karten, Editor | [steuerung-oberflaeche.md](docs/prd/steuerung-oberflaeche.md) | Tasten und Befehle, HUD, Befehlskarte, Anzeigen, Iso-Ansicht, Endbildschirm; Zufallskarten und Karteneditor |
| 10 | KI-Gegner | [ki.md](docs/prd/ki.md) | Verhalten der Armee-KI (Wellen, Späher, Expansion, Konter-Mix, Luftabwehr), was sie nicht baut, Tabelle „KI-Konstanten“ |
| 13 | Geparkte Ideen | [ideen.md](docs/prd/ideen.md) | Ideen, die nur festgehalten werden (nicht bauen, Regel 8 in CLAUDE.md) |
| 14, 16 | Ton, Musik, Spielstand | [ton-speichern.md](docs/prd/ton-speichern.md) | Synthetisierte Geräusche und Musik, Lautstärke; Speichern und Laden |
| 15 | Stadt (Kern) | [stadt.md](docs/prd/stadt.md) | Zonenstadt: Startviertel, Ausbildung in Kaserne/Fabrikhalle/Heliport, Großbauten, Heilen und Krankenhaus, Universität und Rechenzentrum, Strom, Zufriedenheit, Baugebiet, Bedienung, Wachstum, Einwohner (auch als Truppen), Flucht, Arbeit, Stadtgebäude wählen, Angriff auf die Stadt, Stadt-KI |
| 15 | Stadt: Wirtschaft | [stadt-wirtschaft.md](docs/prd/stadt-wirtschaft.md) | Rohstoffe und Vorkommen, Werke als 2 × 2-Großbauten, Ertrag, Stahl, Markt, Straßenkosten, Steuern, Ressourcenanzeige |
| 15 | Stadt: Aussehen | [stadt-aussehen.md](docs/prd/stadt-aussehen.md) | Schilder und Farben, gemalte 1 × 1-Gebäude, Baustellen und Ruinen, Universität als Bild, Darstellung auf der Karte |
| 15 | Stadt: Fliegerhorst, Heliport | [stadt-luft.md](docs/prd/stadt-luft.md) | Bahn, Rollfeld, Stellplätze, Tower, Kerosintank, Munitionslager, F-16; Heliport als Landeplatz |
| 15 | Stadt: Straßentransport | [stadt-transport.md](docs/prd/stadt-transport.md) | Wege über Straßen, Kapazität und Stau, Pendler, Gewerbe-Absatz, Kerosin, Werkslager und LKW am Werk |


## 1. Ziel & Rahmen

| | |
|---|---|
| Plattform | Google Chrome (Desktop), Safari auf dem iPad (Air M1), Android-Tablets/-Telefone im Querformat; installierbare PWA. Eingabe über Pointer-Events (Maus, Touch, Stift). |
| Steuerung | Maus + Tastatur oder Touch (Tippen, Ziehen, Zwei-Finger-Zoom) |
| Technik | Statische Web-App, Vanilla JS (ES-Module), Canvas 2D; Gelände der Iso-Ansicht mit WebGL (Rückfall ohne WebGL: flach, nur aufgemalt; `?gl=0` erzwingt das), kein Build-Schritt, keine externen Abhängigkeiten |
| Auslieferung | Ordner `frontline/` im Repo `games`, GitHub Pages, offline spielbar (PWA); immer neueste Version, wenn online |
| Sprache | Deutsch |
| Spieler | 1 Mensch gegen 1 KI. Kein Multiplayer. |

Nicht im Umfang: Netzwerk-Multiplayer, Kampagne. Speichern laufender Partien gibt es seit v4.90 (§16). Ton (Geräusche) gibt es seit v4.59, Musik und Lautstärkeregler seit v5.68, §14.

## 2. Spielablauf

1. Startmenü: Schwierigkeit (Leicht/Normal/Schwer), Siegpunkte (100 Standard; 25/50 für Schnellpartie), **Sendemast-Sieg** (An/Aus, gemerkt; Standard An, §7), **Wetter** (Aus · Zufall · Sommer · Herbst · Winter, gemerkt; Standard Zufall, §7), **Forschung** (An/Aus, gemerkt; Standard An, §7), **Fluss** (An/Aus, gemerkt; Standard An, nur Zufallskarten, §7), **Baugebiet** der Stadt (An/Aus, gemerkt; Standard An, §15), **Ton** (An/Aus, gemerkt; Standard An, §14), **Karte** (Zufall · Gespeichert · Neue Karte, siehe Abschnitt 9a), Start.
2. Jede Partei startet in einer Ecke der großen Karte mit der **Hauptstadt** (Lager: Baumaterial, Munition, Treibstoff; gefüllt von den Werken der Stadt, §15), Geld (800 oder die Kasse der letzten Runde), 1 Baufahrzeug, **3 LKW** (leer), **2 Kampfpanzern, 3 Schützenpanzern, 22 Schützen und 7 Panzerabwehrsoldaten** (29 Soldaten, Startaufstellung nach Truppengattung getrennt um die FOB: Panzer vorn, Schützen links, Panzerabwehr rechts, LKW und Baufahrzeug hinten, Kommandeur dicht hinter der FOB; `BALANCE.startLayout`). Zusammen belegen sie 52 der 300 Plätze des Einheitenlimits (siehe §6).
3. Kaserne, Fabrikhalle und Heliport der Stadt bilden Einheiten aus (§15; nur gegen Geld; mit Forschung Schützenpanzer, Scharfschützen und Hubschrauber erst ab Stufe 2, Kampfpanzer und AH-64 ab Stufe 3, §7). Man bringt Einheiten und Nachschub per LKW an die Front, gründet vordere FOBs (seit v5.09 mit dem FOB-Fahrzeug)
   (Verschanzen mit Mauern und Tore, Mörser, Flak, Nachladen und Tanken) und hält die Zone.
4. In der Mitte liegt die sehr große **Konfliktzone** (eine Stadt). Wer dort mehr Spieler hat (Hot Zone doppelt), füllt den Punktebalken und bekommt Geld. In ihr wandert die **Hot Zone** (Abschnitt 7).
5. **Sieg:** zuerst die Siegpunktzahl (Standard 100) erreichen – oder der Gegner hat keine FOB und kein Baufahrzeug mehr – oder (wenn eingeschaltet) einen **Sendemast** 30 Minuten halten (§7). Der Endbildschirm zeigt danach die Statistik beider Teams (§9).

## 11. Qualitätsanforderungen

- 60 FPS bei ~200 Einheiten auf einem normalen Laptop. Simulation mit fester Schrittweite (20 Hz), unabhängig vom Rendern.
- Simulation ohne DOM lauffähig (Node-Tests, KI-gegen-KI-Durchlauf).
- Deterministisch bei gleichem Seed (`?seed=123`). `?debug=1`: Karte aufgedeckt, Ressourcen-Cheat, Geschwindigkeit bis 10×.
- Eigenständig nach den Regeln des Repos (eigenes Manifest, Service Worker mit Präfix `frontline-`, eigene Tests/Workflow).
- Service Worker network-first: online immer die neueste Version, offline aus dem Cache.

## 12. Priorisierung

- **Must:** alles in 2–9, KI aus 10, Sieg/Niederlage, Pause.
- **Should:** Nebel des Krieges, Kontrollgruppen, Doppelklick-Auswahl, Hilfe-Overlay, PWA/offline.
- **Could:** Statistik am Spielende (gebaut in v5.65, §9 „Endbildschirm“). (Sound ist seit v4.59 gebaut, §14.)


## Änderungsverlauf

Siehe [docs/changelog.md](docs/changelog.md) (neueste Version oben).
