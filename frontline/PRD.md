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

1. Startmenü: Schwierigkeit (Leicht/Normal/Schwer), Siegpunkte (100 Standard; 25/50 für Schnellpartie), **Karte** (Zufall · Gespeichert · Neue Karte, siehe Abschnitt 9a), Start.
2. Jede Partei startet in einer Ecke der großen Karte mit der **Haupt-FOB** (unendlich Baumaterial, Munition, Treibstoff), Geld (800 oder die Kasse der letzten Runde), 1 Baufahrzeug, 1 LKW (leer), **40 Schützen und 10 Panzerabwehrsoldaten** (50 Soldaten, Startaufstellung vor der FOB).
3. Nur die Haupt-FOB bildet Einheiten aus (nur gegen Geld). Man bringt Einheiten und Nachschub per LKW an die Front, gründet vordere FOBs
   (Verschanzen mit Mauern und Tore, Mörser, Flak, Nachladen und Tanken) und hält die Zone.
4. In der Mitte liegt die sehr große **Konfliktzone** (eine Stadt). Wer dort mehr Spieler hat (Hot Zone doppelt), füllt den Punktebalken und bekommt Geld. In ihr wandert die **Hot Zone** (Abschnitt 7).
5. **Sieg:** zuerst die Siegpunktzahl (Standard 100) erreichen – oder der Gegner hat keine FOB und kein Baufahrzeug mehr.

## 3. Ressourcen & Logistik

| Ressource | Quelle | Lagerort | Verwendung |
|---|---|---|---|
| **Geld** | Einheiten in der Konfliktzone (je Einheit, Hot Zone doppelt), **Abschüsse und fertige Bauten** | global, **bleibt von Runde zu Runde** | Einheiten (Ausbildung) |
| **Baumaterial** | unendlich in der Haupt-FOB | FOB-Lager, LKW, Soldaten (wenig) | Gebäude, Mauern, Tore, Reparatur; 400 per LKW für eine neue FOB-Baustelle |
| **Munition** | unendlich in der Haupt-FOB | FOB-Lager, Einheiten, LKW | Mörser/Flak und **Nachladen der Einheiten** |
| **Treibstoff** | unendlich in der Haupt-FOB | FOB-Lager, Fahrzeuge, LKW | **Verbrauch beim Fahren/Fliegen** und Bohrer |

- **Keine Ressourcenvorkommen, keine Förderanlagen, kein Grundeinkommen je FOB.** Geld gibt es in der Konfliktzone und der Hot Zone (Abschnitt 7) sowie als **Prämie**: Für jede zerstörte gegnerische Einheit zahlt der Gegner (also du) 25 % des Einheitenpreises bei Soldaten, **60 % bei Fahrzeugen und Hubschraubern** (z. B. Schütze 15, Kampfpanzer 300); für zerstörte Gebäude 20 % ihres Baumaterialpreises (Mauern und Tore nichts); für jedes **fertig gebaute** Gebäude 20 % seines Baumaterialpreises (FOB 80, Mörser 40, Flak 36, Bohrer 30; Mauern und Tore nichts, sonst wäre Mauerbau eine Geldquelle). Ab 100 Geld erscheint eine Meldung. Die Prämie gilt für beide Seiten, auch für die KI.
- **Haupt-FOB:** unendliches Lager. **Raten:** LKW laden/entladen 100/s (400 Ladung in 4 s), Einheiten nachfüllen (Munition 60/s, Treibstoff 4/s, Baumaterial 20/s), Ausbildung **zwei Einheiten gleichzeitig** (2 Ausbildungsplätze, je eigener Fortschritt)
  (Schütze 5 s, PAK 8 s, LKW 6 s, Baufahrzeug 9 s, SPz 12 s, KPz 20 s, Little Bird 15 s, Transporter 20 s, AH-64 28 s; Warteschlange 5).
- **Vordere FOBs:** eigenes endliches Lager (max. 3000 je Sorte), das nur **LKW oder Transporthubschrauber** füllen. Oben zeigt „Front BM/MUN/TS“ die Summe dieser Lager.
- **Bezahlen:** Gebäude zahlen aus einer FOB, deren Bauradius den Bauort enthält (Baufahrzeug). Einheiten kosten **nur Geld**. Abbruch erstattet an dieses Lager.
- **Soldaten tragen Baumaterial:** Schütze und PAK tragen **50 Baumaterial** (starten voll, laden im FOB-Bauradius oder nahe einem LKW nach) und bauen daraus **Mauern und Tore, nur im Bauradius einer FOB**.
- **LKW im Feld:** füllt Einheiten im 180-px-Umkreis aus seiner Ladung auf (Munition, Treibstoff, Baumaterial).
- **Soldaten-Nachschub (wie im Original: Gefallene steigen wieder ein):** Hat ein Team weniger als **50 Soldaten** (Schützen und PAK, auch in Fahrzeugen und in Ausbildung), stellt die Haupt-FOB **alle 6 s kostenlos einen Schützen** bereit, der zum Sammelpunkt läuft. Die Auswahl der Haupt-FOB zeigt „Nachschub: Schütze in N s (Soldaten x/50)“ bzw. „Nachschub ruht“. Geld bleibt nötig für PAK, Fahrzeuge und Hubschrauber.
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

Gebäude können abgerissen werden (Erstattung 25 % Baumaterial). Es gibt kein Einheitenlimit (seit v4.24).

## 6. Einheiten

| Einheit | Gebaut in | Rolle |
|---|---|---|
| Schütze | Haupt-FOB | Billige Infanterie, stark gegen Infanterie; trägt 50 Baumaterial, baut daraus Mauern und Tore |
| Panzerabwehrsoldat | Haupt-FOB | Langsam feuernd, stark gegen Fahrzeuge und Gebäude; baut Mauern und Tore |
| LKW | Haupt-FOB | Unbewaffnet, schnell, **2 Soldaten** Platz. **Logistik:** lädt Ressourcen an einer FOB (400), bringt sie zu einer anderen FOB oder FOB-Baustelle, pendelt auf Routen, versorgt Truppen im Feld |
| Baufahrzeug | Haupt-FOB | Unbewaffnet, **1 Soldat** Platz. Setzt FOB-Baustellen, baut alle Gebäude, repariert |
| Schützenpanzer | Haupt-FOB | **6 Soldaten** Platz. Schnell, gut gegen Infanterie und leichte Fahrzeuge |
| Kampfpanzer | Haupt-FOB | Teuer, schwer gepanzert, stark gegen alles (Hauptkanone trifft keine Hubschrauber, das MG schwach) |
| Little Bird | Haupt-FOB | Unbewaffnet, schnell, **5 Passagiere** (Infanterie, Baufahrzeug) |
| Transporthubschrauber | Haupt-FOB | Unbewaffnet, **9 Passagiere** und **400 Ressourcen** (laden/entladen/pendeln wie ein LKW) |
| AH-64 (Kampfhubschrauber) | Haupt-FOB | Bordkanone und 10 Raketen (Tabelle oben), 650 HP, 70 Treibstoff; Nachtanken/-laden in einer FOB |

**Hubschrauber** fliegen geradeaus über Gelände und Gebäude, brauchen Treibstoff beim Fliegen (ohne: 25 % Tempo) und sind
Panzerklasse „Luft“: Flugabwehr (stark), Panzerabwehrsoldat (40), Raketen des AH-64 (150), SPz-MG (6), Schütze (3), Panzer-MG (3) und die FOB-MG (2) treffen sie; Hauptkanone,
Granatwerfer und Mörser nicht. Passagiere steigen per Rechtsklick auf den Hubschrauber ein und werden mit **O** am Zielpunkt abgesetzt;
stirbt der Hubschrauber, sind die Passagiere verloren.

Schadensmodell: Schaden je Schuss nach Panzerklasse des Ziels (Infanterie / leicht / schwer / Gebäude) – Werte in `PLAN.md`.

### Werte (Quelle: `js/data/units.js`, `js/data/buildings.js`, `js/data/balance.js`)

| Einheit | HP | Tempo | Sicht | Reichweite | Preis (Geld) | Bauzeit | Treibstoff (max / je s) |
|---|---|---|---|---|---|---|---|
| Schütze | 100 | 45 | 260 | 200 | 60 | 5 s | – |
| Panzerabwehrsoldat | 90 | 40 | 260 | 240 | 120 | 8 s | – |
| LKW | 250 | 110 | 220 | – | 80 | 6 s | 30 / 0,2 |
| Baufahrzeug | 400 | 70 | 260 | – | 150 | 9 s | 40 / 0,3 |
| Schützenpanzer | 450 | 85 | 300 | 240 | 250 | 12 s | 40 / 0,4 |
| Kampfpanzer | 1100 | 60 | 320 | 300 | 500 | 20 s | 60 / 0,6 |
| Little Bird | 220 | 170 | 380 | – | 350 | 15 s | 60 / 0,5 |
| Transporthubschrauber | 500 | 130 | 320 | – | 600 | 20 s | 90 / 0,7 |
| AH-64 | 650 | 150 | 400 | 340 | 900 | 28 s | 70 / 0,8 |

| Gebäude | HP | Größe (Zellen) | Kosten | Bauzeit |
|---|---|---|---|---|
| FOB | 2500 | 3×3 | 400 Baumaterial (per LKW geliefert) | 30 s |
| Mauer | 600 | 1×1 | 8 Baumaterial | 2 s |
| Tor | 800 | 1×1 | 25 Baumaterial | 4 s |
| Mörser | 700 | 2×2 | 200 Baumaterial, 60 Munition | 20 s |
| Flugabwehr | 700 | 2×2 | 180 Baumaterial, 40 Munition | 18 s |
| Bohrer | 600 | 2×2 | 150 Baumaterial | 20 s |

Weitere globale Zahlen (Kartengröße, Zone, Prämien, Logistikraten, Schwierigkeit) stehen in `js/data/balance.js` und sind oben im Text genannt.

### Waffen und Schaden (Quelle: `weapons` in `js/data/units.js`, `weapon` in `js/data/buildings.js`)

Schaden je Schuss nach Panzerklasse des Ziels (Inf = Infanterie, Leicht, Schwer, Geb = Gebäude, Luft). Wo die Tabelle „Treffer bis zum Abschuss“ (unten) eine Paarung nennt, gilt sie statt dieser Werte. Reichweite in px, Kadenz = Sekunden zwischen Schüssen.

| Waffe | Reichweite | Kadenz | Inf | Leicht | Schwer | Geb | Luft | Bevorzugt gegen |
|---|---|---|---|---|---|---|---|---|
| Schütze: Gewehr | 200 | 1,0 | 12 | 3 | 1 | 4 | 3 | – |
| PAK: RPG | 240 | 3,0 | 10 | 90 | 120 | 60 | 40 | – |
| SPz: Granatwerfer | 240 | 2,0 | 30 | 40 | 10 | 25 | – | Leicht, Schwer, Geb |
| SPz: MG | 220 | 0,25 | 9 | 3 | 1 | 3 | 6 | – |
| KPz: Hauptkanone | 300 | 6,0 | 45 | 120 | 150 | 120 | – | Leicht, Schwer, Geb |
| KPz: MG | 220 | 0,25 | 10 | 3 | 0 | 2 | 3 | – |
| AH-64: Bordkanone | 340 | 0,5 | 22 | 26 | 30 | 18 | 10 | – |
| AH-64: Raketen | 340 | 3,0 | 40 | 120 | 220 | 120 | 150 | Schwer, Geb, Luft |
| FOB-MG | 220 | 0,6 | 12 | 4 | 1 | 4 | 2 | – (schießt immer, kostenlos) |
| Mörser | 800 (min. 200) | 20 | 60 | 50 | 25 | 80 | – | Flächenschaden 60 px, Granate fliegt Distanz / 300 s |
| Flugabwehr | 320 | 0,4 | 10 | 12 | 2 | 4 | 35 | fängt zudem Mörsergranaten ab (Reichweite 350, 70 % Chance) |

Das Spiel wählt je Ziel automatisch die Waffe mit dem besten Schaden bzw. die „bevorzugte“ Waffe für die Panzerklasse des Ziels; Waffen ohne Munition schweigen.

### Schaden: Treffer bis zum Abschuss
Direktfeuer richtet sich nach Trefferzahlen (volles Ziel); Seite = Winkel zur Fahrtrichtung des Ziels (vorn ±45°, hinten ±45°, sonst seitlich). Nicht genannte Paarungen nutzen die Schadenstabelle der Panzerklasse (u. a. Hubschrauber, Gebäude, MG gegen Fahrzeuge, Gewehr gegen Fahrzeuge).

| Waffe | Ziel | vorn | seitlich | hinten |
|---|---|---|---|---|
| Gewehr | Soldat | 4 | 4 | 4 |
| Kampfpanzer-Kanone | Soldat | 1 | 1 | 1 |
| Kampfpanzer-MG | Soldat | 2 | 2 | 2 |
| Schützenpanzer-Granate | Soldat | 1 | 1 | 1 |
| Schützenpanzer-MG | Soldat | 2 | 2 | 2 |
| Kampfpanzer-Kanone | Kampfpanzer | 4 | 3 | 2 |
| Kampfpanzer-Kanone | Schützenpanzer | 3 | 3 | 2 |
| Schützenpanzer-Granate | Kampfpanzer | 10 | 8 | 7 |
| Schützenpanzer-Granate | Schützenpanzer (Annahme) | 8 | 6 | 5 |
| Schützenpanzer-Granate | LKW/Baufahrzeug (Annahme) | 3 | 3 | 3 |
| Kampfpanzer-Kanone | LKW/Baufahrzeug (Annahme) | 2 | 2 | 2 |
| RPG (Annahme) | Soldat | 1 | 1 | 1 |
| RPG (Annahme) | Kampfpanzer | 6 | 4 | 3 |
| RPG (Annahme) | Schützenpanzer | 4 | 3 | 2 |
| RPG (Annahme) | LKW/Baufahrzeug | 2 | 2 | 2 |

## 7. Konfliktzone & Punkte

- Kreis in der Kartenmitte, Radius **3300 px** (Karte 9024 × 9024 px), gestaltet als osteuropäische Stadt (Straßenraster, Häuser, Hallen, Fabriken, Parks, Autos, Bäume). Gebäude und **Bäume** sind echte Hindernisse (wie Häuser: Einheiten gehen drumherum, Bauen ist dort nicht möglich), Straßen und Parks sind frei. Auch die Bäume außerhalb der Stadt blockieren; Hubschrauber fliegen darüber. Der Abstand vom Start zum Zonenrand beträgt gut 2000 px.
- **Wachtürme:** Vier Wachtürme (Stahlgerüst mit Kabine, 80 × 80 px, blockieren wie Gebäude, können nicht zerstört werden) stehen am Rand der Zone: oben, unten, links und rechts (bei 0,86 × Zonenradius; links/rechts knapp neben der Bahnlinie), punktsymmetrisch. Was dort im Weg stand, entfällt. Sie haben keine Spielwirkung (Sicht- und Deckungsmarke); gespeicherte Karten ohne Türme bleiben unverändert, im Editor lassen sich Türme setzen.
- **Gewicht** je Partei = Einheiten in der Zone; Einheiten in der **Hot Zone zählen doppelt** (einmal als Zone, einmal als Hot Zone).
  Die Partei mit dem größeren Gewicht **führt** (Mehrheit, kein Alleinbesitz nötig); bei Gleichstand führt niemand. „Umkämpft“
  heißt nur, dass beide Parteien Einheiten in der Zone haben.
- **Punktebalken** (oben, in der Farbe des Führenden): füllt sich in **30 s**; voll = **1 Punkt** für das Team des Balkens, dann
  beginnt er von vorn. Wechselt die Führung, leert er sich doppelt so schnell und färbt sich dann um. Bei Gleichstand steht er still.
- **Geld je Einheit:** Jede lebende eigene Einheit in der Zone bringt **0,4 Geld/s** (auch wenn umkämpft; kein Deckel; Hubschrauber zählen mit). Beide Teams verdienen gleichzeitig. Kein Führungsgeld.

### Hot Zone
- Kleiner Kreis (Radius 300 px) **innerhalb** der Konfliktzone, orange; auch auf der Minimap. Er wandert langsam (13,3 px/s) zu einem
  Zufallspunkt (neues Ziel alle 25–45 s); nur auf dem Weg zu einem aktiven Bohrer ist er mit 40 px/s schneller.
- **Geld:** Einheiten in der Hot Zone bringen **0,8 Geld/s** statt 0,4 (das Doppelte, nicht zusätzlich). **Besitz** nur, wenn eine Partei allein darin ist (Anzeige „HOT“); er bringt kein eigenes Geld. Punkte gibt es nicht separat; die Einheiten darin zählen doppelt für den Punktebalken.
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
| Linksklick / Tippen | Einheit/Gebäude wählen; **mit gewählten Einheiten: Tippen auf Boden = Gehen, auf sichtbaren Gegner = Angriff** (Standardaktion, kein Angriff-Knopf nötig); LKW/Transporter/Baufahrzeug auf eigene Gebäude: **Maus = Gebäude wählen** (Befehl per Rechtsklick), **Touch = Befehl** (es gibt keinen Rechtsklick); Doppelklick = alle dieses Typs im Bild; Esc = abwählen |
| Linksklick halten und ziehen (Maus) | Rahmenauswahl; Shift = hinzufügen |
| Rechtsklick halten und ziehen (Maus) / Finger ziehen | **Karte verschieben** (ein kurzer Rechtsklick bleibt der Befehl Bewegen/Angreifen) |
| Zwei Finger | Zoomen (Abstand) und Karte verschieben |
| Rechtsklick | Bewegen; auf Gegner = Angreifen; Gebäude gewählt = Sammelpunkt; LKW auf eigene FOB = laden (leer) bzw. entladen; Baufahrzeug/Infanterie auf eigene Baustelle = dort bauen; Baufahrzeug auf beschädigtes eigenes Gebäude = reparieren |
| A + Linksklick | Angriffsbewegung |
| S | Stopp |
| B | Baumenü (Baufahrzeug: alles, Soldaten: nur Mauer/Tor); darin E Mauer, R Tor, T Mörser, Z/Y Flugabwehr, X Bohrer, F FOB-Baustelle |
| Mörser gewählt | G Ziel wählen (oder Rechtsklick auf die Karte) · C Ziel löschen |
| Bohrer gewählt | G aktivieren |
| Transportfahrzeuge | Infanterie wählen + **I** (Einsteigen, dann Fahrzeug antippen) oder Rechtsklick auf LKW / Baufahrzeug / Schützenpanzer / Hubschrauber = einsteigen · Fahrzeug wählen + **O** und Zielpunkt = absetzen · Transporthubschrauber: L/U/T wie LKW |
| Haupt-FOB gewählt | Ausbildung: Q Schütze · W PAK · E LKW · R Baufahrzeug · A SPz · S KPz · D Little Bird · F Transporter · G AH-64 |
| LKW gewählt | L Laden · U Entladen · T Pendeln (Start-FOB, dann Ziel-FOB) · Ladung Q Gemischt / W Baumaterial / E Munition / R Treibstoff |
| Entf | Gebäude abreißen |
| Esc | Abbrechen / Auswahl aufheben |
| Strg+0–9 / 0–9 | Gruppe speichern / wählen (2× = Kamera hin) |
| Rechte Maustaste/Finger ziehen, Pfeiltasten, Bildschirmrand (10 px am Fensterrand, auch über Statusleiste und Bedienfeldern), mittlere Maustaste ziehen | Kamera bewegen |
| Mausrad | Zoom |
| V / Schaltfläche „Ansicht“ | Ansicht umschalten: 2D von oben oder isometrisch (wird gemerkt, `?iso=1` startet isometrisch) |
| `,` / `.` / Knöpfe ⟲ ⟳ | Isometrische Ansicht in 90°-Schritten nach links / rechts drehen (in 2D ohne Wirkung) |
| Leertaste / H | Kamera auf Auswahl / Haupt-FOB |
| P | Pause; `+` / `-` Spielgeschwindigkeit 1×–3× |
| F1 / ? | Hilfe |
| Minimap | Linksklick = Kamera, Rechtsklick = Bewegen |

## 9. Oberfläche

- Oben: Summe aller FOB-Lager und Geld mit Netto-Rate/s (rot bei Verlust), Punkte Blau/Rot mit Balken, Zonenstatus mit Geld/s und Einheitenzahl (Zone, Hot Zone), Hot-Zone-Anzeige,
  Spielzeit, Geschwindigkeit.
- Unten links Minimap, Mitte Auswahlinfo (FOB: Lager; LKW: Ladung und Ladungsart; Einheiten: Munition/Treibstoff),
  rechts Befehlskarte mit Kosten und Tastenkürzeln (nicht bezahlbare Buttons ausgegraut mit Grund).
- Auf der Karte: Munitions-/Treibstoffbalken bei gewählten Einheiten, Warnzeichen bei Einheiten ohne Munition,
  Route gewählter LKW als gestrichelte Linie, Bauradius gewählter FOBs als gestrichelter Kreis.
- Meldungen (z. B. „Einheit bereit“, „Basis wird angegriffen“, „Einheiten ohne Munition“, „Route unterbrochen“).
- Nebel des Krieges: Unerkundet schwarz, erkundet abgedunkelt, gegnerische Einheiten nur in Sicht.
- Platzierungsvorschau grün/rot mit Bauradien aller eigenen FOBs.
- **Isometrische Ansicht** (Taste V, drehbar in 90°-Schritten mit `,` `.`): Boden schräg, Gebäude, Bäume und Fahrzeuge mit Höhe, Tiefensortierung, Hubschrauber schweben mit Schatten. Stadtgebäude (Häuser aus Kenney „City Kit Commercial“, Hallen und Fabriken aus „City Kit Industrial“; 3D-Modelle, vorgerendert isometrisch, Daten `js/render/isodata.js`), Bäume sowie LKW und Baufahrzeug (Team Blau/Rot, 8 Blickrichtungen) sind Bilder aus freien Kenney-Paketen (CC0, `assets/iso/`, Lizenztexte `assets/LICENSES/`, `js/render/isosprites.js`; `?sprites=0` schaltet auf die gezeichnete Variante). Spielgebäude und Panzer sind gezeichnet und mit Details versehen: Stadthäuser mit zwei Stockwerken, Fenstern, Tür, Balkon und Satteldach; Hallen mit Rolltoren und Fensterband; Fabriken mit großen Fenstern, Toren, Schornstein; FOB als **Zentrale** (Sockelbau mit Fensterband, Eingang mit Vordach, Leitstellenturm, Radar, Antennen, Flagge); Fahrzeughalle als **Panzerwerkstatt** (Tore mit Panzer, Teamband, Dachkran); Landeplatz mit H, Ring, Randfeuer, Windsack. Unter Zoom 0,5 entfallen Fenster und Türen (Leistung). Die Zeichnung ist pro Gebäudeart durch Sprites ersetzbar (`spriteOverrides` in `js/render/isobuild.js`).
- **Grafik (Iso):** Kampfpanzer (Leopard-2-Anmutung), Schützenpanzer (Puma-Anmutung), Little Bird und AH-64 erscheinen in der isometrischen Ansicht als gerenderte 3D-Modelle in 8 Richtungen und Teamfarbe. Panzer, Schützenpanzer und Little Bird sind eigene Entwürfe nach Fotos (Quelle und Ablauf: `tools/render-models`); der AH-64 ist „Attack Chopper“ von Geibu3D (CC BY 4.0, Namensnennung in `assets/LICENSES`). Der **Wachturm** (`buildings/tower-r0…r3.png`, je Drehung der Ansicht ein Bild) ist ein eigener Entwurf nach einem Bild. Der Transporthubschrauber bleibt gemalt.
- Hilfe (F1) listet alle Tasten, auch V und Drehen.

## 9a. Karten und Karteneditor

- **Karte pro Spiel:** *Zufall* erzeugt bei jedem Start eine Karte aus einem Seed (`?seed=N` = feste Karte). *Gespeichert* nimmt eine eigene Karte aus dem Browser-Speicher (localStorage `frontline-karten`), die Auswahl merkt sich das Menü. *Neue Karte* öffnet den Editor mit leerer Karte. Gespeicherte Karten lassen sich im Menü bearbeiten, löschen und aus einer JSON-Datei importieren.
- **Kartenformat (JSON):** `name`, `obstacles` (Kreise: Wald = gerader Radius, Fels = ungerader), `town` (`roads`, `buildings` mit `kind` house/factory/hall/tower/train, `parks`, `cars`, `trees`, `rail`), `trees`, `spawns` (genau 2), `zone` (Mitte und Radius). Karten sind **nicht** gespiegelt; `Game({ map })` nimmt jede gültige Karte (`js/game/mapdata.js`: Normalisieren, Prüfen, Speicher).
- **Editor** (`editor.html`, 2D, Maus und Touch): Werkzeuge Hand, Wählen, Löschen; Haus, Fabrik, Halle, Wachturm; Lok, Waggon, Kesselwagen, Bahnsteig, Bahnhof, Gleis (ziehen wie eine Straße); Straße und Feldweg (ziehen), Park, Baum (ziehen malt eine Reihe), Wald, Fels, Auto; Startpunkt Blau/Rot und Konfliktzone verschieben. Gewähltes Objekt: verschieben, Größe/Breite/Höhe, drehen, Art/Farbe, Kopie, Löschen; Straßenenden ziehbar. Rückgängig/Wiederholen (60 Schritte, Strg+Z/Y), Zoom (Rad, Zwei-Finger), Verschieben (Hand, rechte Maustaste, ein Finger auf leerem Grund), Zufallskarte als Ausgangspunkt, Leer, Import/Export als Datei, Speichern, **Spielen**.
- **Ansicht:** 2D oder isometrisch (Knopf bzw. V, Drehen mit , und .). Iso nutzt den Spiel-Renderer mit einem leeren Hilfsspiel; Straßen, Parks und Bahn werden nach dem Loslassen neu gezeichnet.
- **Straßen:** Beim Ziehen rasten Start und Ende an Enden und Mittellinien anderer Straßen ein; wo Straßen sich kreuzen oder aufeinandertreffen, wird eine Kreuzungsfläche gezeichnet (ohne Mittellinie).
- **Gleise:** freie Strecken (`town.rails`, Liste von Linien), wie Straßen gezogen; Enden rasten an Enden und Gleisen ein. Wo Gleise sich treffen oder kreuzen (Abzweig, Weiche, Kreuzung), entsteht ein durchgehendes Schotterbett, damit sich Bahnhöfe bauen lassen. Gleise sind begehbar und nur Dekoration; Zugteile (Lok, Waggon, Kesselwagen) werden einzeln gesetzt und blockieren. Ältere Karten mit einer Bahnlinie (`rail`) werden beim Laden zu einer Strecke. Die Zufallskarte hat weiter eine Strecke quer durch die Zonenmitte.
- **Bahnhof:** Lok, Waggon und Kesselwagen setzen sich beim Tippen auf ein Gleis in Gleisrichtung (auch schräg), Waggons schließen an ein Zugteil an. Der **Bahnsteig** (begehbar, mit Dach auf Stützen) legt sich parallel neben das nächste Gleis. Das **Bahnhofsgebäude** (Satteldach, Uhrenturm, Tore; blockiert) setzt sich neben gerade, waagerechte oder senkrechte Gleise; Bahnhof lässt sich um 90° drehen. Gedrehte Zugteile und Bahnsteige (`angle`) lassen sich im Inspektor in 15°-Schritten drehen; gedrehte Zugteile sperren ihr umschließendes Rechteck.
- **Prüfung:** Startpunkte brauchen 180 px freien Platz und Abstand zum Rand, die Startpunkte mindestens 2500 px Abstand, von Start 1 müssen Zonenmitte und Start 2 erreichbar sein (Pfadsuche). Speichern geht immer, **Spielen** nur bei bestandener Prüfung.

## 10. KI-Gegner

Gleiche Regeln und Befehls-Schnittstelle wie der Spieler (Sonderrecht nur: Einkommensfaktor bei Leicht 0,8, sonst 1; die KI
ignoriert den Nebel bei der Zielwahl, Mörser brauchen aber Sicht).
Verhalten: Baufahrzeug setzt Baustellen, Schützen bauen Mauern aus getragenem Baumaterial; **zuerst eine FOB in der Konfliktzone**, dann Relais-FOBs auf dem Weg (1000 px Abstand) und Flanken-FOBs um die Zonen-FOB (Grenze je Schwierigkeit 3/5/7 FOBs); gemischte Armee aus der Haupt-FOB → Zone halten → Verteidigung (Mörser/Flak/Mauern) an vorderen FOBs. Die Startarmee rückt sofort aus; ein Fünftel bleibt als Reserve an der Haupt-FOB. **Logistik:** Lieferant bringt Baumaterial zu Baustellen, Pendler-LKW bringen Baumaterial, Munition und Treibstoff aus der Haupt-FOB zu den vorderen FOBs, ein Versorger-LKW folgt der Armee; Einheiten ohne Munition ziehen sich zurück.
- **Angriffswellen:** Die KI bündelt ihre Angriffe. Hält der Gegner die Zone, greift sie erst an, wenn ihr Wert mindestens das 1,2-Fache der geschätzten Besatzung (Anzahl × 150) beträgt, nie darunter. Ging lange keine Welle los, sinkt die geforderte Stärke bis auf 60 % (nach 10 min). Für die Stärke einer Welle zählt nur, wer noch nicht in der Zone steht.
- **Späher:** Ab 3 min Spielzeit und mit mindestens 10 Kampfeinheiten spart die KI auf einen Little Bird (unbewaffnet). Er hält am Zonenrand auf der Gegnerseite, damit die Besatzung der Zone sichtbar wird; ist ein Großteil der Besatzer (70 %) zu sehen, schätzt die KI die Stärke aus deren echtem Geldwert statt aus Anzahl × 150. Unter 35 % Treibstoff fliegt er heim und tankt auf 90 %.
- **Konter-Mix:** Sieht die KI mindestens 8 gegnerische Kampfeinheiten am Boden, verschiebt sie die Grundmischung (50 % Schützen, 20 % PAK, 20 % Schützenpanzer, 10 % Panzer): viele Gepanzerte → mehr PAK und Panzer, viel Infanterie → mehr Schützen und Schützenpanzer (jede Sorte mindestens 5 %).
- **Flankenangriff:** Die KI merkt sich gesehene gegnerische FOBs (Standort bleibt bekannt, bis er eingesehen und leer ist oder die FOB zerstört wird). Ist die Zone gegnerfrei und stehen dort mindestens 12 freie Einheiten, zweigen 30 % davon ab und greifen die gemerkte FOB abseits der Zone an, die der Zone am nächsten liegt. Ist das Ziel zerstört, rücken die Überlebenden wieder in die Armee ein.
- **Gruppen-Rückzug:** Steht eine Gruppe im Feuer (mindestens 4 Gegner sichtbar) und ist der Wert der Gegner mindestens 1,8-mal so hoch wie der der eigenen Einheiten dort, zieht die ganze Gruppe 1400 px Richtung Basis ab (nicht bei Angriff auf die Basis). 30 s lang gibt die KI danach keine Angriffsbefehle, damit sich die Gruppe sammelt; ein laufender Überfall wird abgebrochen. Einheiten werden im Spiel nicht geheilt, der Rückzug rettet sie also nur vor dem Tod.
- **Zonen-FOB-Verteidigung:** Mörser und Flugabwehr der Zonen-FOB setzt die KI zur Gegnerseite hin (andere FOBs wie bisher zur Zone hin); die Zonen-FOB bekommt zwei Mörser statt einem.
- **Schwierigkeit über Verhalten:** *Leicht*: langsame Denkschritte (3 s), hohe Angriffsschwelle, kein Späher, kein Konter-Mix, keine Überfälle, kein Rückzug, Einkommen ×0,8. *Normal*: 2 s, Späher und Konter-Mix. *Schwer*: 1 s, niedrigere Angriffsschwelle, dazu Überfälle und Gruppen-Rückzug; **kein Einkommensbonus mehr** (vorher ×1,25).

### KI-Konstanten (Quelle: `js/ai/ai.js`, `js/data/balance.js`; hier zum Nachschlagen für Erweiterungen)

| Bereich | Konstante | Wert |
|---|---|---|
| Takt | Denkschritt `think` | Leicht 3 s · Normal 2 s · Schwer 1 s |
| Angriff | `attackStrength` (Wert der angreifenden Einheiten in Geld) | Leicht 2500 · Normal 2000 · Schwer 1600 |
| Angriff | Verhältnis zur Zonenbesatzung (`WAVE_ODDS`) | 1,2 |
| Angriff | Geduld bis zur Untergrenze (`WAVE_PATIENCE` / `WAVE_MIN`) | 600 s / 60 % |
| Angriff | Reserve an der Haupt-FOB (`RESERVE`, ab 5 Einheiten) | 20 % |
| Besatzungsschätzung | mittlerer Einheitenwert (`THREAT_PER_UNIT`) | 150 Geld |
| Sammelpunkt | Abstand von der Haupt-FOB zur Zone / von der Zonen-FOB zur Basis | 300 px / 150 px |
| Armeemischung | Schützen / PAK / SPz / KPz (`MIX`) | 50 / 20 / 20 / 10 % |
| Konter-Mix | Mindestzahl gesehener Gegner / Gewicht / Mindestanteil | 8 / 0,8 / 5 % |
| Späher | Start ab / Mindestarmee / Heimflug unter / Tankziel | 180 s / 10 Einheiten / 35 % / 90 % |
| Flankenangriff | Mindestbesatzung / Anteil | 12 / 30 % |
| Gruppen-Rückzug | Wertverhältnis / Mindestgegner / Strecke / Angriffssperre | 1,8 / 4 / 1400 px / 30 s |
| Expansion | FOB-Grenze Leicht/Normal/Schwer · Relais-Abstand · Flanken-FOB-Abstand | 3/5/7 · 1000 px · 1000 px |
| Bedrohung | Reaktionsreichweite / FOB-Gefahrenradius | 900 px / 600 px |
| Baustellen | Abriss ohne Material / Sperre fehlgeschlagener Orte | 200 s / 240 s |
| Mauer | Abstand von der Haupt-FOB / halbe Länge | 4 / 3 Zellen (Tor in der Mitte) |
| Rückzug (Vorrat) | Einheiten unter diesem Vorratsanteil ziehen sich zurück | 20 % |

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

- v4.37: **Wachturm** als Gebäude (eigenes 3D-Modell, 4 Drehungen), vier Türme am Zonenrand der Zufallskarte, im Karteneditor setzbar, Kartenformat `kind: tower`. Cache v49.
- v4.36: **Kampfpanzer** als eigenes 3D-Modell (Leopard-2-Anmutung, ersetzt T-12). Cache v48.
- v4.35: **Schützenpanzer** als eigenes 3D-Modell (Puma-Anmutung). Cache v47.
- v4.34: **Little Bird** als gerendertes 3D-Modell (Eigenbau nach Foto). Cache v46.
- v4.33: **Iso-Grafik:** 3D-Modelle für Kampfpanzer und AH-64 (T-12, Attack Chopper). Cache v45.
- v4.32: **PRD:** Tabelle aller Waffen mit Schaden je Panzerklasse und Tabelle der KI-Konstanten. Cache v44.
- v4.31: **Schwierigkeit über Verhalten** statt Einkommensbonus (Schwer: ×1,0). Cache v44.
- v4.30: **KI verteidigt die Zonen-FOB** zur Gegnerseite, zwei Mörser. Cache v43.
- v4.29: **KI-Gruppen-Rückzug** bei klarer Unterlegenheit. Cache v42.
- v4.28: **KI-Flankenangriff** auf gemerkte gegnerische FOBs. Cache v41.
- v4.27: **KI-Konter-Mix** gegen die gesehene Gegnerarmee. Cache v40.
- v4.26: **KI-Späher** (Little Bird) und Stärkeschätzung der Zonenbesatzung aus gesehenen Einheiten. Cache v39.
- v4.25: **KI-Angriffswellen bündeln.** Cache v38.
- v4.24: **Kein Einheitenlimit mehr** (RTS, kein Shooter; vorher 120 je Team). Cache v37.
- v4.23: **Soldaten-Nachschub.** Unter 50 Soldaten stellt die Haupt-FOB alle 6 s kostenlos einen Schützen bereit (Anzeige in der Haupt-FOB). Kasse bleibt bei höchstens 5000, weil beide Seiten mit demselben Betrag starten. Cache v36.
- v4.22: **Geld je Einheit, Start mit 50 Soldaten, zwei Ausbildungsplätze.** Wie im Original: Geld pro Tick je Einheit in der Zone, Hot Zone doppelt (0,4 bzw. 0,8 Geld/s; Führungsgeld, Hot-Zone-Besitzgeld und Deckel entfallen). Statt Grundeinkommen Start mit 50 Soldaten (40 Schützen, 10 PAK, LKW, Baufahrzeug) in einer Formation vor der FOB. Haupt-FOB bildet zwei Einheiten gleichzeitig aus. KI rückt mit der Startarmee aus (Reserve 20 %). Punkte unverändert. Cache v35.
- v4.21: **Treffer bis zum Abschuss** je Waffe, Ziel und Trefferseite (Tabelle in Abschnitt 6). Zonenanzeige zeigt zusätzlich die Wertung (Hot Zone doppelt). Cache v34.
- v4.20: **Prämien wie in Wardogs.** Geld für Abschüsse (Soldaten 25 %, Fahrzeuge 60 % des Preises, Gebäude 20 % des Baumaterialpreises) und für fertig gebaute Gebäude (20 %); Mauern und Tore ausgenommen. Cache v33.
- v4.19: Maus: Linksklick auf ein eigenes Gebäude wählt es immer, auch wenn LKW oder Baufahrzeug gewählt sind (Befehle per Rechtsklick); Touch behält den Befehl per Antippen. Cache v32.
- v4.18: **3D-Autos und Park-Ausstattung.** Autos sind in Iso kleine Körper mit Kabine (in 2D mit Scheiben); Parks haben Rundweg, Bäume am Rand und vier Bänke (aus Lage und Größe erzeugt, nur Dekoration, begehbar), in 2D und Iso, im Spiel und im Editor. Cache v31.
- v4.17: **Bahnhof.** Neue Kartenteile Bahnhofsgebäude und Bahnsteig (2D und Iso), Zugteile richten sich am Gleis aus (beliebiger Winkel, Anschluss aneinander), `drawRotBox` für gedrehte Körper in Iso. Cache v30.
- v4.16: **Freie Gleise.** Bahnlinien sind jetzt freie Strecken statt einer festen Linie; im Editor wie Straßen zeichenbar, mit Abzweigen und Kreuzungen, in 2D, Iso und im Spiel. Cache v29.
- v4.15: Editor: Autos und Parks erscheinen in der Iso-Ansicht sofort nach dem Setzen (Neuzeichnen nach der Geste). **Editor isometrisch, Kreuzungen.** Der Karteneditor hat den Ansichtsknopf 2D/Iso (V) mit Drehen (, .), Auswahl auch aufs Dach; Straßen rasten an Enden und Mittellinien anderer Straßen ein, an Kreuzungen und Einmündungen entsteht eine durchgehende Asphaltfläche (auch im Spiel). Cache v28.
- v4.14: **Karteneditor.** Neue Seite `editor.html` mit allen Kartenelementen (ohne Spiegelung), Speichern im Browser, Export/Import; Startmenü mit Kartenwahl Zufall/Gespeichert/Neue Karte; `Game({ map })`; `drawMapObjects` aus `terrain.js` gemeinsam für Spiel und Editor. Cache v25.
- v4.13: Iso-Ansicht mit fertigen Grafiken auch für Eigenes: Schützen und RPG-Soldaten als Soldaten (Helm, Weste in Teamfarbe; Schütze mit Gewehr, RPG-Soldat mit Rohr auf der Schulter, 8 Blickrichtungen, drehen sich zum Ziel), Zentrale (FOB, mit Teamflagge), Mörser, Flak, Mauer und Tor (nach Nachbarn ausgerichtet) aus Kenney-Kits (CC0, vorgerendert, `assets/iso/units`, `assets/iso/team`). Panzer, Schützenpanzer, Bohrer und Baustellen bleiben gemalt; `?sprites=0` zeigt alles gemalt.
- v4.12: **Soldaten mitnehmen.** LKW 2, Baufahrzeug 1, Schützenpanzer 6 Plätze (nur Infanterie; Baufahrzeuge steigen weiter nur in Hubschrauber). Einsteigen per Knopf „Einsteigen“ (I) mit Antippen des Fahrzeugs oder per Rechtsklick, Absetzen mit O; Passagiere sind verloren, wenn das Fahrzeug stirbt. Cache v24.
- v4.11: **Karte ohne Felsen, Gehöfte außerhalb der Zone.** Die grauen Felsen entfallen, Hindernisse sind nur noch Wald. Außerhalb der Konfliktzone (punktsymmetrisch) stehen vereinzelt Häuser (22 Paare), Hallen (6) und Fabrikgelände (7): Fabrik mit Mauer (80 px Abstand, 16 px stark) und zwei Lücken à 130 px an gegenüberliegenden Seiten, sodass Fahrzeuge hinein, um die Fabrik herum und auf der Gegenseite hinausfahren können (Test prüft die Wegfindung). Mauern blockieren wie Häuser; Bäume bleiben aus den Geländen heraus. Cache v22.
- v4.10: **Touch und Standardaktion.** Rechte Maustaste halten und ziehen oder ein Finger ziehen verschiebt die Karte (Maus: Linksziehen = Rahmenauswahl, Rechts halten und ziehen = Karte schieben), zwei Finger zoomen und verschieben; Tippen auf Boden mit gewählten Einheiten = Gehen, auf Gegner = Angriff; Ansichtsknopf zeigt „2D“/„Iso“ und ist auch am PC sichtbar; Kopfleiste auf Tablets (≤ 1500 px) kompakter, damit alle Knöpfe passen. Hubschrauber ohne Baumenü; Transporthubschrauber pendeln wie LKW (T, auch gemischte Ladung, Test). Cache v22.
- v4.9: **Logistik statt Wirtschaft.** Haupt-FOB mit unendlichem Lager bildet als Einzige alle Einheiten aus (nur Geld, Raten = Bauzeiten, gekürzt); Ressourcenvorkommen, Förderanlagen, Fahrzeughalle und Landeplatz entfallen; Geld nur aus Zone und Hot Zone (10/s, kein FOB-Grundeinkommen), Kasse bleibt von Runde zu Runde (max. 5000); Soldaten tragen 50 Baumaterial für Mauern/Tore im FOB-Radius; LKW versorgen im Umkreis; höchstens 10 FOBs ohne überlappende Bauradien; Verlust der Haupt-FOB beendet die Runde; KI umgebaut. Cache v20.
- v4.8: Randscrollen auch oben und unten (Fensterrand statt Canvas-Rand, Statusleiste und Bedienfelder blockieren es nicht mehr); Cache v19.
- v4.7: Bahnlinie quer über die Karte durch die Zonenmitte (y = Zonenmitte, Schotterbett, Schwellen, Schienen, in 2D und Iso gezeichnet; Straßen kreuzen auf gleicher Höhe, Schienen sind begehbar). In der Kartenmitte steht ein Zug (Panzerwagen, Containerwagen, Lok; 3 Rechtecke, unpassierbar wie Häuser; Iso: Kenney Train Kit, CC0, vorgerendert für alle vier Drehungen). Häuser, Bäume, Felsen und Autos bleiben aus dem Bahnkorridor (±40) heraus. Die Erreichbarkeitsprüfung zielt neben den Zug (Zonenmitte liegt darunter). Cache v18.
- v4.6: Iso-Ansicht mit freien Kenney-Sprites (CC0): Häuser aus City Kit Commercial, Hallen/Fabriken aus City Kit Industrial, dazu Bäume, LKW und Baufahrzeug; `?sprites=0` zum Vergleich; Cache v17.
- v1: Grundspiel (FOBs, Ressourcen, Gebäude, Einheiten, Zone, KI).
- v1.1: Bauradius bei Auswahl einer FOB; Balancing Zone/FOB-Einkommen; Einheitenlimit 120 (in v4.24 entfernt).
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
