# Frontline – Product Requirements

Echtzeit-Strategiespiel (RTS) im Browser, inspiriert vom Spielprinzip „FOB bauen, Ressourcen fördern,
Konfliktzone halten“. Zwei Parteien: Spieler (Blau) gegen Computer (Rot).

## 1. Ziel & Rahmen

| | |
|---|---|
| Plattform | Google Chrome (Desktop), aktuelle Version. Kein Mobile/Touch. |
| Steuerung | Maus + Tastatur |
| Technik | Statische Web-App, Vanilla JS (ES-Module), Canvas 2D, kein Build-Schritt, keine externen Abhängigkeiten |
| Auslieferung | Ordner `frontline/` im Repo `games`, GitHub Pages, offline spielbar (PWA) |
| Sprache | Deutsch |
| Spieler | 1 Mensch gegen 1 KI. Kein Multiplayer. |

Nicht im Umfang: Netzwerk-Multiplayer, Kampagne, Speichern laufender Partien, Lufteinheiten, Sound (optional, „Could“).

## 2. Spielablauf

1. Startmenü: Schwierigkeit (Leicht/Normal/Schwer), Siegpunkte (100 Standard; 25/50 für Schnellpartie), Start.
2. Jede Partei startet in einer Ecke der großen Karte mit **1 FOB**, 1 LKW, 4 Schützen und Startressourcen.
3. Man baut Förderanlagen auf Ressourcenvorkommen, Fahrzeughalle, Verteidigung, weitere FOBs und eine Armee.
4. In der Mitte liegt die sehr große **Konfliktzone**. Wer sie beherrscht, bekommt Geld und alle 30 s einen Punkt.
5. **Sieg:** zuerst die Siegpunktzahl (Standard 100) erreichen – oder der Gegner hat keine FOB und keinen LKW mehr.

## 3. Ressourcen

| Ressource | Quelle | Verwendung |
|---|---|---|
| **Geld** | Konfliktzone (Kontrolle + je Einheit darin), kleines Grundeinkommen je FOB | Einheiten |
| **Baumaterial** | Förderanlage auf Baumaterial-Vorkommen | Gebäude, FOBs, Mauern, Tore |
| **Munition** | Förderanlage auf Munitions-Vorkommen | Infanterie, Fahrzeuge, Mörser, Flugabwehr |
| **Treibstoff** | Förderanlage auf Treibstoff-Vorkommen | LKW, Fahrzeuge |

- Vorkommen sind unerschöpflich. Pro Vorkommen genau eine Förderanlage.
- Jede Startposition hat je ein Vorkommen jeder Sorte im Bauradius ihrer Start-FOB; weitere liegen verteilt auf der Karte,
  einige in der Konfliktzone.
- Kosten werden beim Auftrag sofort abgezogen; Abbruch erstattet vollständig.

## 4. FOB & Bauradius

- Die FOB ist das Hauptgebäude. Sie bildet Infanterie und LKW aus, hat ein leichtes Maschinengewehr und liefert Grundeinkommen.
- Jede **fertige** eigene FOB hat einen **Bauradius** (450 px). Gebäude dürfen nur platziert werden, wenn ihr Mittelpunkt
  im Radius einer eigenen fertigen FOB liegt.
- **Weitere FOBs** baut ein **LKW**: LKW wählen → „FOB errichten“ → Zielpunkt klicken. Der LKW fährt hin und wird
  zur Baustelle (LKW verbraucht). Mindestabstand 500 px zu eigenen FOBs, 700 px zu gegnerischen Gebäuden. Max. 6 FOBs.
- Gebäude entstehen als Baustelle und werden über die Bauzeit automatisch fertig (kein Bauarbeiter nötig).

## 5. Gebäude

| Gebäude | Zweck |
|---|---|
| FOB | Hauptquartier, Bauradius, bildet Schützen / Panzerabwehrsoldaten / LKW aus, leichtes MG |
| Fahrzeughalle | Baut Schützenpanzer und Kampfpanzer |
| Förderanlage | Nur auf freiem Vorkommen; fördert dessen Ressource |
| Mauer | Blockiert alle Einheiten. Wird per Ziehen als Linie gebaut. |
| Tor | Wie Mauer, aber eigene Einheiten fahren hindurch |
| Mörser | Indirektes Feuer, große Reichweite (Mindestreichweite), Flächenschaden; braucht Sicht auf das Ziel |
| Flugabwehr | Fängt gegnerische Mörsergranaten ab (es gibt keine Lufteinheiten) und beschießt Bodenziele schwach |

Gebäude können abgerissen werden (Erstattung 25 % Baumaterial).

## 6. Einheiten

| Einheit | Gebaut in | Rolle |
|---|---|---|
| Schütze | FOB | Billige Infanterie, stark gegen Infanterie |
| Panzerabwehrsoldat | FOB | Langsam feuernd, stark gegen Fahrzeuge und Gebäude |
| LKW | FOB | Unbewaffnet, schnell, errichtet neue FOBs |
| Schützenpanzer | Fahrzeughalle | Schnell, gut gegen Infanterie und leichte Fahrzeuge |
| Kampfpanzer | Fahrzeughalle | Teuer, schwer gepanzert, stark gegen alles |

Schadensmodell: Schaden je Schuss nach Panzerklasse des Ziels (Infanterie / leicht / schwer / Gebäude) – Werte in `PLAN.md`.

## 7. Konfliktzone & Punkte

- Kreis in der Kartenmitte, Radius 1100 px (Karte 4800 × 4800 px) – deutlich sichtbar.
- **Kontrolle:** eine Partei hat Einheiten in der Zone, die andere keine. Sind beide drin → umkämpft, niemand kontrolliert.
- Kontrollierende Partei: **+12 Geld/s** und Punktfortschritt; alle **30 s Kontrolle = 1 Punkt**. Der angefangene
  Fortschritt bleibt bei Kontrollverlust erhalten.
- Jede eigene Einheit in der Zone bringt zusätzlich **+0,5 Geld/s** (auch wenn umkämpft, max. 30 Einheiten gezählt).

## 8. Steuerung

| Eingabe | Aktion |
|---|---|
| Linksklick / Ziehen | Auswählen / Rahmenauswahl; Shift = hinzufügen; Doppelklick = alle dieses Typs im Bild |
| Rechtsklick | Bewegen; auf Gegner = Angreifen; Gebäude gewählt = Sammelpunkt |
| A + Linksklick | Angriffsbewegung |
| S | Stopp |
| B | Baumenü; darin Q Halle, W Förderanlage, E Mauer, R Tor, T Mörser, Z/Y Flugabwehr |
| Q / W / E | Ausbildung im gewählten Gebäude (FOB: Schütze/PAK/LKW, Halle: SPz/KPz) |
| F | (LKW gewählt) FOB errichten |
| Entf | Gebäude abreißen |
| Esc | Abbrechen / Auswahl aufheben |
| Strg+0–9 / 0–9 | Gruppe speichern / wählen (2× = Kamera hin) |
| Pfeiltasten, Bildschirmrand, mittlere Maustaste ziehen | Kamera bewegen |
| Mausrad | Zoom |
| Leertaste / H | Kamera auf Auswahl / Haupt-FOB |
| P | Pause; `+` / `-` Spielgeschwindigkeit 1×–3× |
| F1 / ? | Hilfe |
| Minimap | Linksklick = Kamera, Rechtsklick = Bewegen |

## 9. Oberfläche

- Oben: Ressourcen mit Einkommen/s, Punkte Blau/Rot mit Balken, Zonenstatus, Spielzeit, Geschwindigkeit.
- Unten links Minimap (Zone, Gebäude, Einheiten, Kamerarahmen), Mitte Auswahlinfo, rechts Befehlskarte mit Kosten
  und Tastenkürzeln (nicht bezahlbare Buttons ausgegraut mit Grund im Tooltip).
- Meldungen (z. B. „Einheit bereit“, „Basis wird angegriffen“, „Punkt für Blau“).
- Nebel des Krieges: Unerkundet schwarz, erkundet abgedunkelt, gegnerische Einheiten nur in Sicht.
- Platzierungsvorschau grün/rot mit Bauradien der FOBs.

## 10. KI-Gegner

Gleiche Regeln und Befehls-Schnittstelle wie der Spieler (keine Sonderrechte außer Einkommensfaktor je Schwierigkeit;
die KI ignoriert den Nebel bei der Zielwahl, Mörser brauchen aber Sicht).
Verhalten: Förderanlagen bauen → Fahrzeughalle → gemischte Armee → Zone besetzen und halten → Basis verteidigen →
mit LKW Vorposten-FOB nahe der Zone und an weiteren Vorkommen → Mörser/Flugabwehr/einige Mauern.

## 11. Qualitätsanforderungen

- 60 FPS bei ~200 Einheiten auf einem normalen Laptop. Simulation mit fester Schrittweite (20 Hz), unabhängig vom Rendern.
- Simulation ohne DOM lauffähig (Node-Tests, KI-gegen-KI-Durchlauf).
- Deterministisch bei gleichem Seed (`?seed=123`). `?debug=1`: Karte aufgedeckt, Ressourcen-Cheat, Geschwindigkeit bis 10×.
- Eigenständig nach den Regeln des Repos (eigenes Manifest, Service Worker mit Präfix `frontline-`, eigene Tests/Workflow).

## 12. Priorisierung

- **Must:** alles in 2–9, KI aus 10, Sieg/Niederlage, Pause.
- **Should:** Nebel des Krieges, Kontrollgruppen, Doppelklick-Auswahl, Hilfe-Overlay, PWA/offline.
- **Could:** Sound, Statistik am Spielende.
