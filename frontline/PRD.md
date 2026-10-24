# Frontline – Product Requirements

Echtzeit-Strategiespiel (RTS) im Browser, inspiriert vom Spielprinzip „FOB bauen, Ressourcen fördern, Nachschub fahren,
Konfliktzone halten“. Zwei Parteien: Spieler (Blau) gegen Computer (Rot).

## 1. Ziel & Rahmen

| | |
|---|---|
| Plattform | Google Chrome (Desktop), Safari auf dem iPad (Air M1), Android-Tablets/-Telefone im Querformat; installierbare PWA. Eingabe über Pointer-Events (Maus, Touch, Stift). |
| Steuerung | Maus + Tastatur oder Touch (Tippen, Ziehen, Zwei-Finger-Zoom) |
| Technik | Statische Web-App, Vanilla JS (ES-Module), Canvas 2D, kein Build-Schritt, keine externen Abhängigkeiten |
| Auslieferung | Ordner `frontline/` im Repo `games`, GitHub Pages, offline spielbar (PWA); immer neueste Version, wenn online |
| Sprache | Deutsch |
| Spieler | 1 Mensch gegen 1 KI. Kein Multiplayer. |

Nicht im Umfang: Netzwerk-Multiplayer, Kampagne, Speichern laufender Partien, Sound (optional, „Could“).

## 2. Spielablauf

1. Startmenü: Schwierigkeit (Leicht/Normal/Schwer), Siegpunkte (100 Standard; 25/50 für Schnellpartie), Start.
2. Jede Partei startet in einer Ecke der großen Karte mit der **Haupt-FOB** (unendlich Baumaterial, Munition, Treibstoff), Geld (800 oder die Kasse der letzten Runde), 1 Baufahrzeug, 1 LKW (leer) und 4 Schützen.
3. Nur die Haupt-FOB bildet Einheiten aus (nur gegen Geld). Man bringt Einheiten und Nachschub per LKW an die Front, gründet vordere FOBs
   (Verschanzen mit Mauern und Tore, Mörser, Flak, Nachladen und Tanken) und hält die Zone.
4. In der Mitte liegt die sehr große **Konfliktzone** (eine Stadt). Wer dort mehr Spieler hat (Hot Zone doppelt), füllt den Punktebalken und bekommt Geld. In ihr wandert die **Hot Zone** (Abschnitt 7).
5. **Sieg:** zuerst die Siegpunktzahl (Standard 100) erreichen – oder der Gegner hat keine FOB und kein Baufahrzeug mehr.

## 3. Ressourcen & Logistik

| Ressource | Quelle | Lagerort | Verwendung |
|---|---|---|---|
| **Geld** | nur Konfliktzone und Hot Zone | global, **bleibt von Runde zu Runde** | Einheiten (Ausbildung) |
| **Baumaterial** | unendlich in der Haupt-FOB | FOB-Lager, LKW, Soldaten (wenig) | Gebäude, Mauern, Tore, Reparatur; 400 per LKW für eine neue FOB-Baustelle |
| **Munition** | unendlich in der Haupt-FOB | FOB-Lager, Einheiten, LKW | Mörser/Flak und **Nachladen der Einheiten** |
| **Treibstoff** | unendlich in der Haupt-FOB | FOB-Lager, Fahrzeuge, LKW | **Verbrauch beim Fahren/Fliegen** und Bohrer |

- **Keine Ressourcenvorkommen, keine Förderanlagen, kein Grundeinkommen je FOB.** Geld gibt es nur in der Konfliktzone und der Hot Zone (Abschnitt 7).
- **Haupt-FOB:** unendliches Lager. **Raten:** LKW laden/entladen 100/s (400 Ladung in 4 s), Einheiten nachfüllen (Munition 60/s, Treibstoff 4/s, Baumaterial 20/s), Ausbildung eine Einheit nach der anderen
  (Schütze 5 s, PAK 8 s, LKW 6 s, Baufahrzeug 9 s, SPz 12 s, KPz 20 s, Little Bird 15 s, Transporter 20 s, AH-64 28 s; Warteschlange 5).
- **Vordere FOBs:** eigenes endliches Lager (max. 3000 je Sorte), das nur **LKW oder Transporthubschrauber** füllen. Oben zeigt „Front BM/MUN/TS“ die Summe dieser Lager.
- **Bezahlen:** Gebäude zahlen aus einer FOB, deren Bauradius den Bauort enthält (Baufahrzeug). Einheiten kosten **nur Geld**. Abbruch erstattet an dieses Lager.
- **Soldaten tragen Baumaterial:** Schütze und PAK tragen **50 Baumaterial** (starten voll, laden im FOB-Bauradius oder nahe einem LKW nach) und bauen daraus **Mauern und Tore, nur im Bauradius einer FOB**.
- **LKW im Feld:** füllt Einheiten im 180-px-Umkreis aus seiner Ladung auf (Munition, Treibstoff, Baumaterial).
- **Kasse:** Das Geld am Rundenende wird gespeichert (höchstens 5000) und ist das Startgeld der nächsten Runde (mindestens 800); die KI startet mit demselben Betrag. Im Startmenü lässt sich die Kasse zurücksetzen.
- Einheiten starten **voll munitioniert, betankt und mit vollem Baumaterial**.
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

## 4. FOB & Bauradius

- Die **Haupt-FOB** ist das Hauptgebäude: unendliches Lager, Bauradius (450 px), bildet **alle** Einheiten aus, leichtes MG. Nicht abreißbar; ihr Verlust beendet die Runde.
- Gebäude nur im Bauradius einer eigenen **fertigen** FOB. Ein Klick auf eine FOB zeigt Radius und Lager.
- **Weitere FOBs:** Ein **Baufahrzeug** setzt eine Baustelle. **Höchstens 10 FOBs**, Bauradien dürfen sich **nicht überlappen** (Abstand ≥ 900 px), 700 px zu Gegnern. Ein **LKW** liefert 400 Baumaterial, dann baut das Baufahrzeug (30 s). Vordere FOBs bilden keine Einheiten aus.
- **Bauen braucht Bauer:** Gebäude werden als Baustelle platziert (bezahlt aus einem FOB-Lager in Reichweite) und wachsen nur,
  solange ein Bauer daneben steht – **Baufahrzeug** für alle Gebäude, **Fußsoldaten** (Schütze, Panzerabwehrsoldat) für Mauern
  und Tore. Mehrere Bauer bauen schneller (max. 3).
- **Reparatur:** Baufahrzeuge reparieren beschädigte eigene Gebäude (kostet etwas Baumaterial), im Leerlauf automatisch.
- Das Baufahrzeug darf Mauern/Tore auch außerhalb eines FOB-Radius bauen, wenn ein eigener LKW mit Baumaterial daneben steht; Soldaten nur im Bauradius.

## 5. Gebäude

| Gebäude | Zweck |
|---|---|
| Haupt-FOB (Zentrale) | Unendliches Lager, Bauradius, bildet alle Einheiten aus (nur Geld), leichtes MG, nicht abreißbar |
| Vordere FOB | Endliches Lager (LKW füllen es), Bauradius, Nachladen/Tanken, leichtes MG; bis zu 10 FOBs, Bauradien ohne Überlappung |
| Mauer | Blockiert alle Einheiten. Wird per Ziehen als Linie gebaut. |
| Tor | Wie Mauer, aber eigene Einheiten fahren hindurch |
| Mörser | Indirektes Feuer, Reichweite 800 px (Mindestreichweite 200), Flächenschaden. **Ziel wählen** (G oder Rechtsklick auf die Karte): ein Schuss alle **20 s**, solange die FOB Munition hat; ohne Ziel schießt er automatisch auf sichtbare Gegner. Reichweitenkreis und Ziel werden bei Auswahl gezeichnet. Trifft keine Hubschrauber |
| Flugabwehr | Schießt **Hubschrauber** ab (Reichweite 320, 35 Schaden je Schuss), fängt gegnerische Mörsergranaten ab und beschießt Bodenziele schwach. Munition aus der FOB |
| Bohrer | Zieht die Hot Zone an (Abschnitt 7); 2×2, 150 Baumaterial, braucht beim Betrieb Treibstoff aus der FOB |

Gebäude können abgerissen werden (Erstattung 25 % Baumaterial). Max. 120 Einheiten je Partei.

## 6. Einheiten

| Einheit | Gebaut in | Rolle |
|---|---|---|
| Schütze | Haupt-FOB | Billige Infanterie, stark gegen Infanterie; trägt 50 Baumaterial, baut daraus Mauern und Tore |
| Panzerabwehrsoldat | Haupt-FOB | Langsam feuernd, stark gegen Fahrzeuge und Gebäude; baut Mauern und Tore |
| LKW | Haupt-FOB | Unbewaffnet, schnell. **Logistik:** lädt Ressourcen an einer FOB (400), bringt sie zu einer anderen FOB oder FOB-Baustelle, pendelt auf Routen, versorgt Truppen im Feld |
| Baufahrzeug | Haupt-FOB | Unbewaffnet. Setzt FOB-Baustellen, baut alle Gebäude, repariert |
| Schützenpanzer | Haupt-FOB | Schnell, gut gegen Infanterie und leichte Fahrzeuge |
| Kampfpanzer | Haupt-FOB | Teuer, schwer gepanzert, stark gegen alles (Hauptkanone trifft keine Hubschrauber, das MG schwach) |
| Little Bird | Haupt-FOB | Unbewaffnet, schnell, **5 Passagiere** (Infanterie, Baufahrzeug) |
| Transporthubschrauber | Haupt-FOB | Unbewaffnet, **9 Passagiere** und **400 Ressourcen** (laden/entladen/pendeln wie ein LKW) |
| AH-64 (Kampfhubschrauber) | Haupt-FOB | Bordkanone und 10 Raketen (Tabelle oben), 650 HP, 70 Treibstoff; Nachtanken/-laden in einer FOB |

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
- Führende Partei: **+10 Geld/s**.
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
| Linksklick / Tippen | Einheit/Gebäude wählen; **mit gewählten Einheiten: Tippen auf Boden = Gehen, auf sichtbaren Gegner = Angriff** (Standardaktion, kein Angriff-Knopf nötig); LKW/Transporter/Baufahrzeug auf eigene Gebäude = Befehl wie Rechtsklick; Doppelklick = alle dieses Typs im Bild; Esc = abwählen |
| Linksklick halten und ziehen / Finger ziehen | **Karte verschieben**; **Shift + Ziehen** = Rahmenauswahl (nur PC), Shift = hinzufügen |
| Zwei Finger | Zoomen (Abstand) und Karte verschieben |
| Rechtsklick | Bewegen; auf Gegner = Angreifen; Gebäude gewählt = Sammelpunkt; LKW auf eigene FOB = laden (leer) bzw. entladen; Baufahrzeug/Infanterie auf eigene Baustelle = dort bauen; Baufahrzeug auf beschädigtes eigenes Gebäude = reparieren |
| A + Linksklick | Angriffsbewegung |
| S | Stopp |
| B | Baumenü (Baufahrzeug: alles, Soldaten: nur Mauer/Tor); darin E Mauer, R Tor, T Mörser, Z/Y Flugabwehr, X Bohrer, F FOB-Baustelle |
| Mörser gewählt | G Ziel wählen (oder Rechtsklick auf die Karte) · C Ziel löschen |
| Bohrer gewählt | G aktivieren |
| Hubschrauber | Infanterie wählen + Rechtsklick auf Hubschrauber = einsteigen · Transporthubschrauber: O absetzen, L/U/T wie LKW |
| Haupt-FOB gewählt | Ausbildung: Q Schütze · W PAK · E LKW · R Baufahrzeug · A SPz · S KPz · D Little Bird · F Transporter · G AH-64 |
| LKW gewählt | L Laden · U Entladen · T Pendeln (Start-FOB, dann Ziel-FOB) · Ladung Q Gemischt / W Baumaterial / E Munition / R Treibstoff |
| Entf | Gebäude abreißen |
| Esc | Abbrechen / Auswahl aufheben |
| Strg+0–9 / 0–9 | Gruppe speichern / wählen (2× = Kamera hin) |
| Linke Maustaste/Finger ziehen, Pfeiltasten, Bildschirmrand (10 px am Fensterrand, auch über Statusleiste und Bedienfeldern), mittlere Maustaste ziehen | Kamera bewegen |
| Mausrad | Zoom |
| V / Schaltfläche „Ansicht“ | Ansicht umschalten: 2D von oben oder isometrisch (wird gemerkt, `?iso=1` startet isometrisch) |
| `,` / `.` / Knöpfe ⟲ ⟳ | Isometrische Ansicht in 90°-Schritten nach links / rechts drehen (in 2D ohne Wirkung) |
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
- **Isometrische Ansicht** (Taste V, drehbar in 90°-Schritten mit `,` `.`): Boden schräg, Gebäude, Bäume und Fahrzeuge mit Höhe, Tiefensortierung, Hubschrauber schweben mit Schatten. Stadtgebäude (Häuser aus Kenney „City Kit Commercial“, Hallen und Fabriken aus „City Kit Industrial“; 3D-Modelle, vorgerendert isometrisch, Daten `js/render/isodata.js`), Bäume sowie LKW und Baufahrzeug (Team Blau/Rot, 8 Blickrichtungen) sind Bilder aus freien Kenney-Paketen (CC0, `assets/iso/`, Lizenztexte `assets/LICENSES/`, `js/render/isosprites.js`; `?sprites=0` schaltet auf die gezeichnete Variante). Spielgebäude und Panzer sind gezeichnet und mit Details versehen: Stadthäuser mit zwei Stockwerken, Fenstern, Tür, Balkon und Satteldach; Hallen mit Rolltoren und Fensterband; Fabriken mit großen Fenstern, Toren, Schornstein; FOB als **Zentrale** (Sockelbau mit Fensterband, Eingang mit Vordach, Leitstellenturm, Radar, Antennen, Flagge); Fahrzeughalle als **Panzerwerkstatt** (Tore mit Panzer, Teamband, Dachkran); Landeplatz mit H, Ring, Randfeuer, Windsack. Unter Zoom 0,5 entfallen Fenster und Türen (Leistung). Die Zeichnung ist pro Gebäudeart durch Sprites ersetzbar (`spriteOverrides` in `js/render/isobuild.js`).
- Hilfe (F1) listet alle Tasten, auch V und Drehen.

## 10. KI-Gegner

Gleiche Regeln und Befehls-Schnittstelle wie der Spieler (Sonderrecht nur: Einkommensfaktor je Schwierigkeit; die KI
ignoriert den Nebel bei der Zielwahl, Mörser brauchen aber Sicht).
Verhalten: Baufahrzeug setzt Baustellen, Schützen bauen Mauern aus getragenem Baumaterial; **zuerst eine FOB in der Konfliktzone**, dann Relais-FOBs auf dem Weg (1000 px Abstand) und Flanken-FOBs um die Zonen-FOB (Grenze je Schwierigkeit 3/5/7 FOBs); gemischte Armee aus der Haupt-FOB → Zone halten → Verteidigung (Mörser/Flak/Mauern) an vorderen FOBs. **Logistik:** Lieferant bringt Baumaterial zu Baustellen, Pendler-LKW bringen Baumaterial, Munition und Treibstoff aus der Haupt-FOB zu den vorderen FOBs, ein Versorger-LKW folgt der Armee; Einheiten ohne Munition ziehen sich zurück.

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

- v4.11: **Karte ohne Felsen, Gehöfte außerhalb der Zone.** Die grauen Felsen entfallen, Hindernisse sind nur noch Wald. Außerhalb der Konfliktzone (punktsymmetrisch) stehen vereinzelt Häuser (22 Paare), Hallen (6) und Fabrikgelände (7): Fabrik mit Mauer (80 px Abstand, 16 px stark) und zwei Lücken à 130 px an gegenüberliegenden Seiten, sodass Fahrzeuge hinein, um die Fabrik herum und auf der Gegenseite hinausfahren können (Test prüft die Wegfindung). Mauern blockieren wie Häuser; Bäume bleiben aus den Geländen heraus. Cache v22.
- v4.10: **Touch und Standardaktion.** Ziehen mit linker Maustaste oder einem Finger verschiebt die Karte (Rahmenauswahl jetzt Shift + Ziehen), zwei Finger zoomen und verschieben; Tippen auf Boden mit gewählten Einheiten = Gehen, auf Gegner = Angriff; Ansichtsknopf zeigt „2D“/„Iso“ und ist auch am PC sichtbar; Kopfleiste auf Tablets (≤ 1500 px) kompakter, damit alle Knöpfe passen. Hubschrauber ohne Baumenü; Transporthubschrauber pendeln wie LKW (T, auch gemischte Ladung, Test). Cache v21.
- v4.9: **Logistik statt Wirtschaft.** Haupt-FOB mit unendlichem Lager bildet als Einzige alle Einheiten aus (nur Geld, Raten = Bauzeiten, gekürzt); Ressourcenvorkommen, Förderanlagen, Fahrzeughalle und Landeplatz entfallen; Geld nur aus Zone und Hot Zone (10/s, kein FOB-Grundeinkommen), Kasse bleibt von Runde zu Runde (max. 5000); Soldaten tragen 50 Baumaterial für Mauern/Tore im FOB-Radius; LKW versorgen im Umkreis; höchstens 10 FOBs ohne überlappende Bauradien; Verlust der Haupt-FOB beendet die Runde; KI umgebaut. Cache v20.
- v4.8: Randscrollen auch oben und unten (Fensterrand statt Canvas-Rand, Statusleiste und Bedienfelder blockieren es nicht mehr); Cache v19.
- v4.7: Bahnlinie quer über die Karte durch die Zonenmitte (y = Zonenmitte, Schotterbett, Schwellen, Schienen, in 2D und Iso gezeichnet; Straßen kreuzen auf gleicher Höhe, Schienen sind begehbar). In der Kartenmitte steht ein Zug (Panzerwagen, Containerwagen, Lok; 3 Rechtecke, unpassierbar wie Häuser; Iso: Kenney Train Kit, CC0, vorgerendert für alle vier Drehungen). Häuser, Bäume, Felsen und Autos bleiben aus dem Bahnkorridor (±40) heraus. Die Erreichbarkeitsprüfung zielt neben den Zug (Zonenmitte liegt darunter). Cache v18.
- v4.6: Iso-Ansicht mit freien Kenney-Sprites (CC0): Häuser aus City Kit Commercial, Hallen/Fabriken aus City Kit Industrial, dazu Bäume, LKW und Baufahrzeug; `?sprites=0` zum Vergleich; Cache v17.
- v1: Grundspiel (FOBs, Ressourcen, Gebäude, Einheiten, Zone, KI).
- v1.1: Bauradius bei Auswahl einer FOB; Balancing Zone/FOB-Einkommen; Einheitenlimit 120.
- v2: Munitions-/Treibstoffverbrauch; stärkere KI (Wirtschaft zuerst, Zonen-FOB).
- v3: Logistik – FOB-Lager, Vorrat je Einheit, LKW als Transporter/Versorger/Pendler; Baufahrzeug baut und repariert,
  Infanterie baut Mauern/Tore; Service Worker network-first.
- v4.5: Isometrische Ansicht drehbar (90°-Schritte, `,` `.` und Knöpfe ⟲ ⟳); V in der F1-Hilfe; Gebäude mit Details (Fenster, Türen, Balkone, Tore, Satteldächer); FOB als Zentrale, Fahrzeughalle als Panzerwerkstatt (Name „Fahrzeughalle“ statt „Halle“ in der Oberfläche), Landeplatz mit H-Markierung; Plattformzeile präzisiert (Touch offen).
- v4.4: Einheiten kosten nur Geld und starten voll; Waffen mit eigenem Schussvorrat und Munitionswert je Schuss (Tabelle in Abschnitt 3); Kampfpanzer-Hauptkanone lädt 6 s nach.
- v4.3: Isometrische Ansicht (Prototyp, Schalter „Ansicht“ / Taste V; Standard bleibt 2D): schräger Boden, Gebäude, Bäume und Fahrzeuge mit Höhe, Hubschrauber schweben mit Schatten.
- v4.2: Bäume sind blockierende Hindernisse (Stadt und Karte).
- v4.1: Punktewertung nach Mehrheit mit Punktebalken, Hot-Zone-Einheiten doppelt (statt Alleinbesitz und eigener Hot-Zone-Punkt).
- v4 (Okt. 2026): Konfliktzone als Stadt, Radius 1100 → 2200 → 3300, Karte 4800 → 9024; Anzeige der Zonen-Einheiten überarbeitet;
  Mörser mit Zielwahl (20 s); Hubschrauber (Little Bird, Transporthubschrauber, AH-64) und Landeplatz; Flugabwehr schießt
  Hubschrauber ab; Hot Zone (frei 13,3 px/s, zum Bohrer 40 px/s) und Bohrer; Förderrate verdoppelt (8/8/6), Start-Vorrat 1000/400/400 und 800 Geld.
