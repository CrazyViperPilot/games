# Frontline – Product Requirements

Echtzeit-Strategiespiel (RTS) im Browser, inspiriert vom Spielprinzip „FOB bauen, Ressourcen fördern, Nachschub fahren,
Konfliktzone halten“. Zwei Parteien: Spieler (Blau) gegen Computer (Rot).

## 1. Ziel & Rahmen

| | |
|---|---|
| Plattform | Google Chrome (Desktop), aktuelle Version. Kein Mobile/Touch. |
| Steuerung | Maus + Tastatur |
| Technik | Statische Web-App, Vanilla JS (ES-Module), Canvas 2D, kein Build-Schritt, keine externen Abhängigkeiten |
| Auslieferung | Ordner `frontline/` im Repo `games`, GitHub Pages, offline spielbar (PWA); immer neueste Version, wenn online |
| Sprache | Deutsch |
| Spieler | 1 Mensch gegen 1 KI. Kein Multiplayer. |

Nicht im Umfang: Netzwerk-Multiplayer, Kampagne, Speichern laufender Partien, Lufteinheiten, Sound (optional, „Could“).

## 2. Spielablauf

1. Startmenü: Schwierigkeit (Leicht/Normal/Schwer), Siegpunkte (100 Standard; 25/50 für Schnellpartie), Start.
2. Jede Partei startet in einer Ecke der großen Karte mit ihrem **HQ** (unbegrenzter Nachschub), 1 Baufahrzeug, 1 LKW (leer)
   und 4 Schützen.
3. Man baut vorgeschobene **FOBs** Richtung Front, bringt per LKW Nachschub vom HQ dorthin, baut Förderanlagen an der Front
   als Nahquellen, Fahrzeughalle, Verteidigung und eine Armee. **Zeit und Transport sind die eigentliche Ressource.**
4. In der Mitte liegt die sehr große **Konfliktzone**. Wer sie beherrscht, bekommt Geld und alle 30 s einen Punkt.
5. **Sieg:** zuerst die Siegpunktzahl (Standard 100) erreichen – oder das **HQ** des Gegners ist zerstört.

## 3. Ressourcen & Logistik

| Ressource | Quelle | Lagerort | Verwendung |
|---|---|---|---|
| **Geld** | Konfliktzone, Grundeinkommen HQ 6/s und 2/s je FOB | global | Einheiten |
| **Baumaterial** | HQ (unbegrenzt), Förderanlage | HQ, FOB-Lager, LKW | Gebäude, Mauern, Tore, Reparatur; 400 per LKW für eine neue FOB-Baustelle |
| **Munition** | HQ (unbegrenzt), Förderanlage | HQ, FOB-Lager, Einheiten, LKW | Einheiten-Kosten; **Verbrauch je Schuss** |
| **Treibstoff** | HQ (unbegrenzt), Förderanlage | HQ, FOB-Lager, Fahrzeuge, LKW | Fahrzeug-Kosten; **Verbrauch beim Fahren** |

- **Alles kommt aus der Runde:** Es gibt keine Vorab-Käufe. Das **HQ** ist eine unbegrenzte Quelle für Baumaterial, Munition
  und Treibstoff – aber es steht weit hinten, und es können nur **2 LKW gleichzeitig** dort laden (100/s). Was nicht
  an die Front gefahren wird, nützt nichts.
- **FOB-Lager:** Jede FOB hat ein eigenes Lager (max. 3000 je Sorte). Eine Förderanlage liefert (4 Baumaterial, 4 Munition bzw.
  3 Treibstoff pro s) in die FOB, in deren Bauradius sie steht – sie sind **Nahquellen an der Front**, die Transportwege sparen. Ressourcen sind
  **nicht** automatisch überall verfügbar.
- **Bezahlen:** Gebäude zahlen aus einer FOB, deren Bauradius den Bauort enthält; Ausbildung aus dem Lager der ausbildenden FOB
  (Fahrzeughalle: aus der FOB in Reichweite). Geld kommt immer aus dem globalen Vorrat. Abbruch erstattet voll an dieses Lager.
- **Vorrat der Einheiten:** Jede Einheit trägt Munition, Fahrzeuge zusätzlich Treibstoff. Ohne Munition wird nicht geschossen,
  ohne Treibstoff fahren Fahrzeuge mit 25 % Tempo. Mörser und Flugabwehr verbrauchen Munition aus dem Lager ihrer FOB;
  das MG der FOB schießt kostenlos.
- **Nachfüllen:** automatisch im Radius des HQ (unbegrenzt), einer eigenen FOB (aus deren Lager) oder in der Nähe (180 px) eines eigenen LKW mit Ladung.
- Vorkommen sind unerschöpflich. Pro Vorkommen genau eine Förderanlage. Vorkommen liegen zwischen den HQs und
  der Zone und in der Zone (keine beim HQ – dort ist Nachschub ohnehin unbegrenzt).

## 4. HQ, FOB & Bauradius

- Das **HQ** ist das Hauptquartier: unbegrenzter Nachschub, Bauradius 550 px, starkes MG, bildet Infanterie, LKW und
  Baufahrzeuge aus, Grundeinkommen. Es gibt genau eins; es kann nicht neu gebaut werden. **HQ zerstört = verloren.**
- Die **FOB** (Forward Operating Base) ist ein vorgeschobener Stützpunkt: begrenztes Lager, Bauradius 450 px, bildet
  Infanterie und LKW aus, leichtes MG, kleines Grundeinkommen.
- Gebäude dürfen nur im Bauradius des HQ oder einer eigenen **fertigen** FOB platziert werden. Ein Klick auf HQ/FOB zeigt
  den Radius (gestrichelter Kreis) und das Lager.
- **Weitere FOBs:** Ein **Baufahrzeug** setzt eine FOB-Baustelle (Mindestabstand 500 px zu eigenem HQ/FOBs, 700 px zu gegnerischen
  Gebäuden, max. 6 FOBs). Ein **LKW** liefert 400 Baumaterial dorthin, dann baut das Baufahrzeug die FOB (30 s).
- **Bauen braucht Bauer:** Gebäude werden als Baustelle platziert (bezahlt aus einem FOB-Lager in Reichweite) und wachsen nur,
  solange ein Bauer daneben steht – **Baufahrzeug** für alle Gebäude, **Fußsoldaten** (Schütze, Panzerabwehrsoldat) für Mauern
  und Tore. Mehrere Bauer bauen schneller (max. 3).
- **Reparatur:** Baufahrzeuge reparieren beschädigte eigene Gebäude (kostet etwas Baumaterial), im Leerlauf automatisch.
- Mauern/Tore dürfen auch außerhalb eines FOB-Radius gebaut werden, wenn ein eigener LKW mit Baumaterial daneben steht.

## 5. Gebäude

| Gebäude | Zweck |
|---|---|
| HQ | Hauptquartier (Start, einmalig): unbegrenzter Nachschub, 2 Ladeplätze, Bauradius, starkes MG, bildet Schützen / Panzerabwehrsoldaten / LKW / Baufahrzeuge aus |
| FOB | Vorgeschobener Stützpunkt: Lager, Bauradius, bildet Schützen / Panzerabwehrsoldaten / LKW / Baufahrzeuge aus, leichtes MG |
| Fahrzeughalle | Baut Schützenpanzer und Kampfpanzer |
| Förderanlage | Nur auf freiem Vorkommen; liefert in die FOB, in deren Radius sie steht (Nahquelle an der Front) |
| Mauer | Blockiert alle Einheiten. Wird per Ziehen als Linie gebaut. |
| Tor | Wie Mauer, aber eigene Einheiten fahren hindurch |
| Mörser | Indirektes Feuer, große Reichweite (Mindestreichweite), Flächenschaden; braucht Sicht auf das Ziel |
| Flugabwehr | Fängt gegnerische Mörsergranaten ab (es gibt keine Lufteinheiten) und beschießt Bodenziele schwach |

Gebäude können abgerissen werden (Erstattung 25 % Baumaterial). Max. 120 Einheiten je Partei.

## 6. Einheiten

| Einheit | Gebaut in | Rolle |
|---|---|---|
| Schütze | HQ, FOB | Billige Infanterie, stark gegen Infanterie; baut Mauern und Tore |
| Panzerabwehrsoldat | HQ, FOB | Langsam feuernd, stark gegen Fahrzeuge und Gebäude; baut Mauern und Tore |
| LKW | HQ, FOB | Unbewaffnet, schnell. **Logistik:** lädt Ressourcen am HQ oder an einer FOB (400), bringt sie zu einer anderen FOB oder FOB-Baustelle, pendelt auf Routen, versorgt Truppen im Feld |
| Baufahrzeug | HQ, FOB | Unbewaffnet. Setzt FOB-Baustellen, baut alle Gebäude, repariert |
| Schützenpanzer | Fahrzeughalle | Schnell, gut gegen Infanterie und leichte Fahrzeuge |
| Kampfpanzer | Fahrzeughalle | Teuer, schwer gepanzert, stark gegen alles |

Schadensmodell: Schaden je Schuss nach Panzerklasse des Ziels (Infanterie / leicht / schwer / Gebäude) – Werte in `PLAN.md`.

## 7. Konfliktzone & Punkte

- Kreis in der Kartenmitte, Radius 1100 px (Karte 4800 × 4800 px) – deutlich sichtbar.
- **Kontrolle:** eine Partei hat Einheiten in der Zone, die andere keine. Sind beide drin → umkämpft, niemand kontrolliert.
- Kontrollierende Partei: **+6 Geld/s** und Punktfortschritt; alle **30 s Kontrolle = 1 Punkt**. Der angefangene
  Fortschritt bleibt bei Kontrollverlust erhalten.
- Jede eigene Einheit in der Zone bringt zusätzlich **+0,25 Geld/s** (auch wenn umkämpft, max. 30 Einheiten gezählt).

## 8. Steuerung

| Eingabe | Aktion |
|---|---|
| Linksklick / Ziehen | Auswählen / Rahmenauswahl; Shift = hinzufügen; Doppelklick = alle dieses Typs im Bild |
| Rechtsklick | Bewegen; auf Gegner = Angreifen; Gebäude gewählt = Sammelpunkt; LKW auf eigene FOB = laden (leer) bzw. entladen, auf das HQ = laden (2 Ladeplätze); Baufahrzeug/Infanterie auf eigene Baustelle = dort bauen; Baufahrzeug auf beschädigtes eigenes Gebäude = reparieren |
| A + Linksklick | Angriffsbewegung |
| S | Stopp |
| B | Baumenü (Baufahrzeug: alles, Infanterie: nur Mauer/Tor); darin Q Halle, W Förderanlage, E Mauer, R Tor, T Mörser, Z/Y Flugabwehr, F FOB-Baustelle |
| Q / W / E / R | Ausbildung im gewählten Gebäude (FOB: Schütze/PAK/LKW/Baufahrzeug, Halle: SPz/KPz) |
| LKW gewählt | L Laden · U Entladen · T Pendeln (Start-FOB, dann Ziel-FOB) · Ladung Q Gemischt / W Baumaterial / E Munition / R Treibstoff |
| Entf | Gebäude abreißen |
| Esc | Abbrechen / Auswahl aufheben |
| Strg+0–9 / 0–9 | Gruppe speichern / wählen (2× = Kamera hin) |
| Pfeiltasten, Bildschirmrand, mittlere Maustaste ziehen | Kamera bewegen |
| Mausrad | Zoom |
| Leertaste / H | Kamera auf Auswahl / H = Kamera auf das HQ |
| P | Pause; `+` / `-` Spielgeschwindigkeit 1×–3× |
| F1 / ? | Hilfe |
| Minimap | Linksklick = Kamera, Rechtsklick = Bewegen |

## 9. Oberfläche

- Oben: Summe aller FOB-Lager und Geld mit Netto-Rate/s (rot bei Verlust), Punkte Blau/Rot mit Balken, Zonenstatus,
  Spielzeit, Geschwindigkeit.
- Unten links Minimap, Mitte Auswahlinfo (FOB: Lager; LKW: Ladung und Ladungsart; Einheiten: Munition/Treibstoff),
  rechts Befehlskarte mit Kosten und Tastenkürzeln (nicht bezahlbare Buttons ausgegraut mit Grund).
- Auf der Karte: Munitions-/Treibstoffbalken bei gewählten Einheiten, Warnzeichen bei Einheiten ohne Munition,
  Route gewählter LKW als gestrichelte Linie, Bauradius gewählter FOBs und des HQ als gestrichelter Kreis.
- Meldungen (z. B. „Einheit bereit“, „Basis wird angegriffen“, „Einheiten ohne Munition“, „Route unterbrochen“).
- Nebel des Krieges: Unerkundet schwarz, erkundet abgedunkelt, gegnerische Einheiten nur in Sicht.
- Platzierungsvorschau grün/rot mit Bauradien aller eigenen FOBs und des HQ.

## 10. KI-Gegner

Gleiche Regeln und Befehls-Schnittstelle wie der Spieler (Sonderrecht nur: Einkommensfaktor je Schwierigkeit; die KI
ignoriert den Nebel bei der Zielwahl, Mörser brauchen aber Sicht).
Verhalten: Pendler-LKW bringen Nachschub vom HQ an die Front (Hauptaufgabe); Baufahrzeug setzt Baustellen und baut, Schützen bauen Mauern; Wirtschaft zuerst (Förderanlagen) → früh expandieren, **zuerst eine FOB in der Konfliktzone** (wird neu gebaut,
wenn verloren), dann FOBs an freien Vorkommen → Fahrzeughalle und gemischte Armee mit Munitionsreserve → Zone halten →
Verteidigung (Mörser/Flugabwehr/Mauern) erst mit stehender Wirtschaft. **Logistik:** Lieferant bringt Baumaterial zu FOB-Baustellen, Pendler-LKW
zwischen Überschuss- und Bedarfs-FOBs (v. a. Zonen-FOB), Versorger-LKW folgt der Armee; Einheiten ohne Munition ziehen sich zurück.

## 11. Qualitätsanforderungen

- 60 FPS bei ~200 Einheiten auf einem normalen Laptop. Simulation mit fester Schrittweite (20 Hz), unabhängig vom Rendern.
- Simulation ohne DOM lauffähig (Node-Tests, KI-gegen-KI-Durchlauf).
- Deterministisch bei gleichem Seed (`?seed=123`). `?debug=1`: Karte aufgedeckt, Ressourcen-Cheat, Geschwindigkeit bis 10×.
- Eigenständig nach den Regeln des Repos (eigenes Manifest, Service Worker mit Präfix `frontline-`, eigene Tests/Workflow).
- Service Worker network-first: online immer die neueste Version, offline aus dem Cache.

## 12. Priorisierung

- **Must:** alles in 2–9, KI aus 10, Sieg/Niederlage, Pause.
- **Should:** Nebel des Krieges, Kontrollgruppen, Doppelklick-Auswahl, Hilfe-Overlay, PWA/offline.
- **Could:** Sound, Statistik am Spielende.

## Änderungsverlauf

- v1: Grundspiel (FOBs, Ressourcen, Gebäude, Einheiten, Zone, KI).
- v1.1: Bauradius bei Auswahl einer FOB; Balancing Zone/FOB-Einkommen; Einheitenlimit 120.
- v2: Munitions-/Treibstoffverbrauch; stärkere KI (Wirtschaft zuerst, Zonen-FOB).
- v3: Logistik – FOB-Lager, Vorrat je Einheit, LKW als Transporter/Versorger/Pendler; Baufahrzeug baut und repariert,
  Infanterie baut Mauern/Tore; Service Worker network-first.
- v4: HQ mit unbegrenztem Nachschub (2 Ladeplätze), FOBs als vorgeschobene Lager, Förderanlagen als Nahquellen an der Front,
  Niederlage bei HQ-Verlust.
