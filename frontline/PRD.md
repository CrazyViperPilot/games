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

Nicht im Umfang: Netzwerk-Multiplayer, Kampagne, Speichern laufender Partien, Sound (optional, „Could“).

## 2. Spielablauf

1. Startmenü: Schwierigkeit (Leicht/Normal/Schwer), Siegpunkte (100 Standard; 25/50 für Schnellpartie), Start.
2. Jede Partei startet in einer Ecke der großen Karte mit **1 FOB** (Lager: 1000 Baumaterial, 400 Munition, 400 Treibstoff), 800 Geld, 1 Baufahrzeug, 1 LKW (leer) und 4 Schützen.
3. Man baut Förderanlagen auf Ressourcenvorkommen, Fahrzeughalle, Verteidigung, weitere FOBs und eine Armee und hält
   sie mit LKW-Nachschub am Laufen.
4. In der Mitte liegt die sehr große **Konfliktzone** (eine Stadt). Wer dort mehr Spieler hat (Hot Zone doppelt), füllt den Punktebalken und bekommt Geld. In ihr wandert die **Hot Zone** (Abschnitt 7).
5. **Sieg:** zuerst die Siegpunktzahl (Standard 100) erreichen – oder der Gegner hat keine FOB und kein Baufahrzeug mehr.

## 3. Ressourcen & Logistik

| Ressource | Quelle | Lagerort | Verwendung |
|---|---|---|---|
| **Geld** | Konfliktzone, Hot Zone, Grundeinkommen 5/s je FOB | global | Einheiten |
| **Baumaterial** | Förderanlage auf Baumaterial-Vorkommen | FOB-Lager, LKW | Gebäude, Mauern, Tore, Reparatur; 400 per LKW für eine neue FOB-Baustelle |
| **Munition** | Förderanlage auf Munitions-Vorkommen | FOB-Lager, Einheiten, LKW | Mörser/Flak und **Nachladen der Einheiten** (nicht beim Bau) |
| **Treibstoff** | Förderanlage auf Treibstoff-Vorkommen | FOB-Lager, Fahrzeuge, LKW | **Verbrauch beim Fahren/Fliegen** und Bohrer (nicht beim Bau) |

- **FOB-Lager:** Jede FOB hat ein eigenes Lager (max. 3000 je Sorte). Eine Förderanlage liefert (8 Baumaterial, 8 Munition bzw.
  6 Treibstoff pro s) in die FOB, in deren Bauradius sie steht. Ressourcen sind **nicht** automatisch überall verfügbar.
- **Bezahlen:** Gebäude zahlen aus einer FOB, deren Bauradius den Bauort enthält; Ausbildung aus dem Lager der ausbildenden FOB
  (Fahrzeughalle: aus der FOB in Reichweite). Geld kommt immer aus dem globalen Vorrat. Abbruch erstattet voll an dieses Lager.
- **Einheiten kosten nur Geld** (keine Munition/Treibstoff beim Bau) und starten **voll munitioniert und betankt**. Erst was
  verbraucht wurde, muss aus dem FOB-Lager nachgeladen werden.
- **Waffen und Munition je Einheit:** Jede Waffe hat einen eigenen Schussvorrat; beim Nachladen kostet jeder Schuss Munition aus dem Lager.

  | Einheit | Waffe | Vorrat | Munition je Schuss | Nachladezeit |
  |---|---|---|---|---|
  | Schütze | Gewehr | 2 Magazine à 30 = 60 Schuss (1 Magazin = 1 Munition) | 1/30 | 1 s |
  | Panzerabwehrsoldat | RPG | 5 Schuss | 10 | 3 s |
  | Kampfpanzer | Hauptkanone | 30 Schuss | 20 | **6 s** |
  | Kampfpanzer | MG | 300 Schuss | 5 | 0,25 s |
  | Schützenpanzer | Granatwerfer | 60 Granaten | 10 | 2 s |
  | Schützenpanzer | MG | 300 Schuss | 5 | 0,25 s |
  | Kampfhubschrauber | Bordkanone | 300 Schuss | 10 | 0,5 s |
  | Kampfhubschrauber | Raketen | 10 | 100 | 3 s |

  Waffenwahl automatisch: die für die Panzerklasse des Ziels vorgesehene Waffe (Kanone/Granaten/Raketen gegen Fahrzeuge und
  Gebäude, Raketen auch gegen Hubschrauber), sonst die mit dem besten Schaden je Munition (MG, Gewehr, Bordkanone).
- **Vorrat der Einheiten:** Jede Einheit trägt Munition, Fahrzeuge zusätzlich Treibstoff. Ohne Munition wird nicht geschossen,
  ohne Treibstoff fahren Fahrzeuge mit 25 % Tempo. Mörser und Flugabwehr verbrauchen Munition aus dem Lager ihrer FOB (fehlt sie, schießen sie nicht);
  das MG der FOB schießt kostenlos.
- **Nachfüllen:** automatisch im Bauradius einer eigenen FOB (aus deren Lager) oder in der Nähe (180 px) eines eigenen LKW mit Ladung. Das gilt für Soldaten (Munition), Fahrzeuge und Hubschrauber (Treibstoff, Munition). Munition fließt mit bis zu 60/s je Einheit (Waffe für Waffe), Treibstoff mit 4/s. Ist das Lager leer, wird nicht nachgefüllt.
- Vorkommen sind unerschöpflich. Pro Vorkommen genau eine Förderanlage. Jede Startposition hat je ein Vorkommen jeder Sorte
  im Bauradius ihrer Start-FOB; weitere liegen verteilt, einige in der Konfliktzone (dort mehr als früher, die Zone ist groß).

## 4. FOB & Bauradius

- Die FOB ist das Hauptgebäude: Lager, Bauradius (450 px), bildet Infanterie und LKW aus, leichtes MG, Grundeinkommen.
- Gebäude dürfen nur im Bauradius einer eigenen **fertigen** FOB platziert werden. Ein Klick auf eine FOB zeigt ihren Radius
  (gestrichelter Kreis) und ihr Lager.
- **Weitere FOBs:** Ein **Baufahrzeug** setzt eine FOB-Baustelle (Mindestabstand 500 px zu eigenen FOBs, 700 px zu gegnerischen
  Gebäuden, max. 6 FOBs). Ein **LKW** liefert 400 Baumaterial dorthin, dann baut das Baufahrzeug die FOB (30 s).
- **Bauen braucht Bauer:** Gebäude werden als Baustelle platziert (bezahlt aus einem FOB-Lager in Reichweite) und wachsen nur,
  solange ein Bauer daneben steht – **Baufahrzeug** für alle Gebäude, **Fußsoldaten** (Schütze, Panzerabwehrsoldat) für Mauern
  und Tore. Mehrere Bauer bauen schneller (max. 3).
- **Reparatur:** Baufahrzeuge reparieren beschädigte eigene Gebäude (kostet etwas Baumaterial), im Leerlauf automatisch.
- Mauern/Tore dürfen auch außerhalb eines FOB-Radius gebaut werden, wenn ein eigener LKW mit Baumaterial daneben steht.

## 5. Gebäude

| Gebäude | Zweck |
|---|---|
| FOB | Hauptquartier, Lager, Bauradius, bildet Schützen / Panzerabwehrsoldaten / LKW aus, leichtes MG |
| Fahrzeughalle | Baut Schützenpanzer und Kampfpanzer |
| Förderanlage | Nur auf freiem Vorkommen; liefert in die FOB, in deren Radius sie steht |
| Mauer | Blockiert alle Einheiten. Wird per Ziehen als Linie gebaut. |
| Tor | Wie Mauer, aber eigene Einheiten fahren hindurch |
| Mörser | Indirektes Feuer, Reichweite 800 px (Mindestreichweite 200), Flächenschaden. **Ziel wählen** (G oder Rechtsklick auf die Karte): ein Schuss alle **20 s**, solange die FOB Munition hat; ohne Ziel schießt er automatisch auf sichtbare Gegner. Reichweitenkreis und Ziel werden bei Auswahl gezeichnet. Trifft keine Hubschrauber |
| Flugabwehr | Schießt **Hubschrauber** ab (Reichweite 320, 35 Schaden je Schuss), fängt gegnerische Mörsergranaten ab und beschießt Bodenziele schwach. Munition aus der FOB |
| Hubschrauberlandeplatz | Baut Little Bird, Transporthubschrauber und AH-64 (3×3, 350 Baumaterial) |
| Bohrer | Zieht die Hot Zone an (Abschnitt 7); 2×2, 150 Baumaterial, braucht beim Betrieb Treibstoff aus der FOB |

Gebäude können abgerissen werden (Erstattung 25 % Baumaterial). Max. 120 Einheiten je Partei.

## 6. Einheiten

| Einheit | Gebaut in | Rolle |
|---|---|---|
| Schütze | FOB | Billige Infanterie, stark gegen Infanterie; baut Mauern und Tore |
| Panzerabwehrsoldat | FOB | Langsam feuernd, stark gegen Fahrzeuge und Gebäude; baut Mauern und Tore |
| LKW | FOB | Unbewaffnet, schnell. **Logistik:** lädt Ressourcen an einer FOB (400), bringt sie zu einer anderen FOB oder FOB-Baustelle, pendelt auf Routen, versorgt Truppen im Feld |
| Baufahrzeug | FOB | Unbewaffnet. Setzt FOB-Baustellen, baut alle Gebäude, repariert |
| Schützenpanzer | Fahrzeughalle | Schnell, gut gegen Infanterie und leichte Fahrzeuge |
| Kampfpanzer | Fahrzeughalle | Teuer, schwer gepanzert, stark gegen alles (Hauptkanone trifft keine Hubschrauber, das MG schwach) |
| Little Bird | Hubschrauberlandeplatz | Unbewaffnet, schnell, **5 Passagiere** (Infanterie, Baufahrzeug) |
| Transporthubschrauber | Hubschrauberlandeplatz | Unbewaffnet, **9 Passagiere** und **400 Ressourcen** (laden/entladen/pendeln wie ein LKW) |
| AH-64 (Kampfhubschrauber) | Hubschrauberlandeplatz | Bordkanone und 10 Raketen (Tabelle oben), 650 HP, 70 Treibstoff; Nachtanken/-laden in einer FOB |

**Hubschrauber** fliegen geradeaus über Gelände und Gebäude, brauchen Treibstoff beim Fliegen (ohne: 25 % Tempo) und sind
Panzerklasse „Luft“: Flugabwehr (stark), Panzerabwehrsoldat (40), Raketen des AH-64 (150), SPz-MG (6), Schütze (3), Panzer-MG (3) und die FOB-MG (2) treffen sie; Hauptkanone,
Granatwerfer und Mörser nicht. Passagiere steigen per Rechtsklick auf den Hubschrauber ein und werden mit **O** am Zielpunkt abgesetzt;
stirbt der Hubschrauber, sind die Passagiere verloren.

Schadensmodell: Schaden je Schuss nach Panzerklasse des Ziels (Infanterie / leicht / schwer / Gebäude) – Werte in `PLAN.md`.

## 7. Konfliktzone & Punkte

- Kreis in der Kartenmitte, Radius **3300 px** (Karte 9024 × 9024 px), gestaltet als osteuropäische Stadt (Straßenraster, Häuser, Hallen, Fabriken, Parks, Autos, Bäume). Gebäude und **Bäume** sind echte Hindernisse (wie Häuser: Einheiten gehen drumherum, Bauen ist dort nicht möglich), Straßen und Parks sind frei. Auch die Bäume außerhalb der Stadt blockieren; Hubschrauber fliegen darüber. Der Abstand vom Start zum Zonenrand beträgt gut 2000 px.
- **Gewicht** je Partei = Einheiten in der Zone; Einheiten in der **Hot Zone zählen doppelt** (einmal als Zone, einmal als Hot Zone).
  Die Partei mit dem größeren Gewicht **führt** (Mehrheit, kein Alleinbesitz nötig); bei Gleichstand führt niemand. „Umkämpft“
  heißt nur, dass beide Parteien Einheiten in der Zone haben.
- **Punktebalken** (oben, in der Farbe des Führenden): füllt sich in **30 s**; voll = **1 Punkt** für das Team des Balkens, dann
  beginnt er von vorn. Wechselt die Führung, leert er sich doppelt so schnell und färbt sich dann um. Bei Gleichstand steht er still.
- Führende Partei: **+6 Geld/s**.
- Jede eigene Einheit in der Zone bringt zusätzlich **+0,25 Geld/s** (auch wenn umkämpft, max. 30 Einheiten gezählt).

### Hot Zone
- Kleiner Kreis (Radius 300 px) **innerhalb** der Konfliktzone, orange; auch auf der Minimap. Er wandert langsam (13,3 px/s) zu einem
  Zufallspunkt (neues Ziel alle 25–45 s); nur auf dem Weg zu einem aktiven Bohrer ist er mit 40 px/s schneller.
- **Besitz** nur, wenn eine Partei allein darin ist: **+8 Geld/s**. Punkte gibt es nicht separat; die Einheiten darin zählen doppelt für den Punktebalken.
- Oben zeigt „HOT“ den Besitzer und die Einheitenzahl je Team, daneben der Punktebalken.

### Bohrer
- Nach dem Bau **30 s Aufwärmen**, dann per **G** aktivierbar: **2 min aktiv**, danach **5 min Abkühlen**.
- Aktiv verbraucht er **1 Treibstoff/s** aus der versorgenden FOB; ohne Treibstoff schaltet er ab (dann ebenfalls 5 min Pause).
  Start nur, wenn die FOB mindestens 10 Treibstoff hat.
- Aktive Bohrer ziehen die Hot Zone an (Ziel wird in die Konfliktzone gezogen). Bei mehreren: die FOB mit den meisten aktiven
  Bohrern, bei Gleichstand die mit dem zuerst aktivierten. Hat sie nur einen aktiven Bohrer, ist das Ziel der Bohrer, sonst die FOB.
  Ohne aktiven Bohrer wandert die Hot Zone wieder zufällig.

## 8. Steuerung

| Eingabe | Aktion |
|---|---|
| Linksklick / Ziehen | Auswählen / Rahmenauswahl; Shift = hinzufügen; Doppelklick = alle dieses Typs im Bild |
| Rechtsklick | Bewegen; auf Gegner = Angreifen; Gebäude gewählt = Sammelpunkt; LKW auf eigene FOB = laden (leer) bzw. entladen; Baufahrzeug/Infanterie auf eigene Baustelle = dort bauen; Baufahrzeug auf beschädigtes eigenes Gebäude = reparieren |
| A + Linksklick | Angriffsbewegung |
| S | Stopp |
| B | Baumenü (Baufahrzeug: alles, Infanterie: nur Mauer/Tor); darin Q Halle, W Förderanlage, E Mauer, R Tor, T Mörser, Z/Y Flugabwehr, G Hubschrauberlandeplatz, X Bohrer, F FOB-Baustelle |
| Mörser gewählt | G Ziel wählen (oder Rechtsklick auf die Karte) · C Ziel löschen |
| Bohrer gewählt | G aktivieren |
| Hubschrauber | Infanterie wählen + Rechtsklick auf Hubschrauber = einsteigen · Transporthubschrauber: O absetzen, L/U/T wie LKW |
| Q / W / E / R | Ausbildung im gewählten Gebäude (FOB: Schütze/PAK/LKW/Baufahrzeug, Halle: SPz/KPz, Landeplatz: Little Bird/Transporter/AH-64) |
| LKW gewählt | L Laden · U Entladen · T Pendeln (Start-FOB, dann Ziel-FOB) · Ladung Q Gemischt / W Baumaterial / E Munition / R Treibstoff |
| Entf | Gebäude abreißen |
| Esc | Abbrechen / Auswahl aufheben |
| Strg+0–9 / 0–9 | Gruppe speichern / wählen (2× = Kamera hin) |
| Pfeiltasten, Bildschirmrand, mittlere Maustaste ziehen | Kamera bewegen |
| Mausrad | Zoom |
| V / Schaltfläche „Ansicht“ | Ansicht umschalten: 2D von oben oder isometrisch (wird gemerkt, `?iso=1` startet isometrisch) |
| Leertaste / H | Kamera auf Auswahl / Haupt-FOB |
| P | Pause; `+` / `-` Spielgeschwindigkeit 1×–3× |
| F1 / ? | Hilfe |
| Minimap | Linksklick = Kamera, Rechtsklick = Bewegen |

## 9. Oberfläche

- Oben: Summe aller FOB-Lager und Geld mit Netto-Rate/s (rot bei Verlust), Punkte Blau/Rot mit Balken, Zonenstatus, Hot-Zone-Anzeige,
  Spielzeit, Geschwindigkeit.
- Unten links Minimap, Mitte Auswahlinfo (FOB: Lager; LKW: Ladung und Ladungsart; Einheiten: Munition/Treibstoff),
  rechts Befehlskarte mit Kosten und Tastenkürzeln (nicht bezahlbare Buttons ausgegraut mit Grund).
- Auf der Karte: Munitions-/Treibstoffbalken bei gewählten Einheiten, Warnzeichen bei Einheiten ohne Munition,
  Route gewählter LKW als gestrichelte Linie, Bauradius gewählter FOBs als gestrichelter Kreis.
- Meldungen (z. B. „Einheit bereit“, „Basis wird angegriffen“, „Einheiten ohne Munition“, „Route unterbrochen“).
- Nebel des Krieges: Unerkundet schwarz, erkundet abgedunkelt, gegnerische Einheiten nur in Sicht.
- Platzierungsvorschau grün/rot mit Bauradien aller eigenen FOBs.

## 10. KI-Gegner

Gleiche Regeln und Befehls-Schnittstelle wie der Spieler (Sonderrecht nur: Einkommensfaktor je Schwierigkeit; die KI
ignoriert den Nebel bei der Zielwahl, Mörser brauchen aber Sicht).
Verhalten: Baufahrzeug setzt Baustellen und baut, Schützen bauen Mauern; Wirtschaft zuerst (Förderanlagen) → früh expandieren, **zuerst eine FOB in der Konfliktzone** (wird neu gebaut,
wenn verloren), dann FOBs an freien Vorkommen → Fahrzeughalle und gemischte Armee mit Munitionsreserve → Zone halten →
Verteidigung (Mörser/Flugabwehr/Mauern) erst mit stehender Wirtschaft. Die KI baut keine Hubschrauber und keine Bohrer, bekämpft aber deine Hubschrauber mit allem, was ihnen schaden kann. **Logistik:** Lieferant bringt Baumaterial zu FOB-Baustellen, Pendler-LKW
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
- v4.4: Einheiten kosten nur Geld und starten voll; Waffen mit eigenem Schussvorrat und Munitionswert je Schuss (Tabelle in Abschnitt 3); Kampfpanzer-Hauptkanone lädt 6 s nach.
- v4.3: Isometrische Ansicht (Prototyp, Schalter „Ansicht“ / Taste V; Standard bleibt 2D): schräger Boden, Gebäude, Bäume und Fahrzeuge mit Höhe, Hubschrauber schweben mit Schatten.
- v4.2: Bäume sind blockierende Hindernisse (Stadt und Karte).
- v4.1: Punktewertung nach Mehrheit mit Punktebalken, Hot-Zone-Einheiten doppelt (statt Alleinbesitz und eigener Hot-Zone-Punkt).
- v4 (Okt. 2026): Konfliktzone als Stadt, Radius 1100 → 2200 → 3300, Karte 4800 → 9024; Anzeige der Zonen-Einheiten überarbeitet;
  Mörser mit Zielwahl (20 s); Hubschrauber (Little Bird, Transporthubschrauber, AH-64) und Landeplatz; Flugabwehr schießt
  Hubschrauber ab; Hot Zone (frei 13,3 px/s, zum Bohrer 40 px/s) und Bohrer; Förderrate verdoppelt (8/8/6), Start-Vorrat 1000/400/400 und 800 Geld.
