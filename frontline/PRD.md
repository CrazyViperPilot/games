# Frontline – Product Requirements

Echtzeit-Strategiespiel (RTS) im Browser, inspiriert vom Spielprinzip „FOB bauen, Ressourcen fördern, Nachschub fahren,
Konfliktzone halten“. Zwei Parteien: Spieler (Blau) gegen Computer (Rot).

## 1. Ziel & Rahmen

| | |
|---|---|
| Plattform | Google Chrome (Desktop), Safari auf dem iPad (Air M1), Android-Tablets/-Telefone im Querformat; installierbare PWA. Eingabe über Pointer-Events (Maus, Touch, Stift). |
| Steuerung | Maus + Tastatur oder Touch (Tippen, Ziehen, Zwei-Finger-Zoom) |
| Technik | Statische Web-App, Vanilla JS (ES-Module), Canvas 2D; Gelände der Iso-Ansicht mit WebGL (Rückfall ohne WebGL: flach, nur aufgemalt; `?gl=0` erzwingt das), kein Build-Schritt, keine externen Abhängigkeiten |
| Auslieferung | Ordner `frontline/` im Repo `games`, GitHub Pages, offline spielbar (PWA); immer neueste Version, wenn online |
| Sprache | Deutsch |
| Spieler | 1 Mensch gegen 1 KI. Kein Multiplayer. |

Nicht im Umfang: Netzwerk-Multiplayer, Kampagne, Speichern laufender Partien, Musik (als Idee geparkt, §13). Ton (Geräusche) gibt es seit v4.59, §14.

## 2. Spielablauf

1. Startmenü: Schwierigkeit (Leicht/Normal/Schwer), Siegpunkte (100 Standard; 25/50 für Schnellpartie), **Sendemast-Sieg** (An/Aus, gemerkt; Standard An, §7), **Wetter** (Aus · Zufall · Sommer · Herbst · Winter, gemerkt; Standard Zufall, §7), **Forschung** (An/Aus, gemerkt; Standard An, §7), **Fluss** (An/Aus, gemerkt; Standard An, nur Zufallskarten, §7), **Ton** (An/Aus, gemerkt; Standard An, §14), **Karte** (Zufall · Gespeichert · Neue Karte, siehe Abschnitt 9a), Start.
2. Jede Partei startet in einer Ecke der großen Karte mit der **Haupt-FOB** (unendlich Baumaterial, Munition, Treibstoff), Geld (800 oder die Kasse der letzten Runde), 1 Baufahrzeug, **3 LKW** (leer), **2 Kampfpanzern, 3 Schützenpanzern, 22 Schützen und 7 Panzerabwehrsoldaten** (29 Soldaten, Startaufstellung nach Truppengattung getrennt um die FOB: Panzer vorn, Schützen links, Panzerabwehr rechts, LKW und Baufahrzeug hinten, Kommandeur dicht hinter der FOB; `BALANCE.startLayout`). Zusammen belegen sie 52 der 300 Plätze des Einheitenlimits (siehe §6).
3. Nur die Haupt-FOB bildet Einheiten aus (nur gegen Geld; mit Forschung Schützenpanzer, Scharfschützen und Hubschrauber erst ab Stufe 2, Kampfpanzer und AH-64 ab Stufe 3, §7). Man bringt Einheiten und Nachschub per LKW an die Front, gründet vordere FOBs
   (Verschanzen mit Mauern und Tore, Mörser, Flak, Nachladen und Tanken) und hält die Zone.
4. In der Mitte liegt die sehr große **Konfliktzone** (eine Stadt). Wer dort mehr Spieler hat (Hot Zone doppelt), füllt den Punktebalken und bekommt Geld. In ihr wandert die **Hot Zone** (Abschnitt 7).
5. **Sieg:** zuerst die Siegpunktzahl (Standard 100) erreichen – oder der Gegner hat keine FOB und kein Baufahrzeug mehr – oder (wenn eingeschaltet) einen **Sendemast** 30 Minuten halten (§7).

## 3. Ressourcen & Logistik

| Ressource | Quelle | Lagerort | Verwendung |
|---|---|---|---|
| **Geld** | Einheiten in der Konfliktzone (je Einheit, Hot Zone doppelt), **eingelagerte Versorgungskisten** (§7), **Abschüsse und fertige Bauten** | global, **bleibt von Runde zu Runde** | Einheiten (Ausbildung) |
| **Baumaterial** | unendlich in der Haupt-FOB | FOB-Lager, LKW, Soldaten (wenig) | Gebäude, Mauern, Tore, Reparatur; 400 per LKW für eine neue FOB-Baustelle |
| **Munition** | unendlich in der Haupt-FOB | FOB-Lager, Einheiten, LKW | Mörser/Flak und **Nachladen der Einheiten** |
| **Treibstoff** | unendlich in der Haupt-FOB | FOB-Lager, Fahrzeuge, LKW | **Verbrauch beim Fahren/Fliegen** und Bohrer |

- **Keine Ressourcenvorkommen, keine Förderanlagen, kein Grundeinkommen je FOB.** Geld gibt es in der Konfliktzone und der Hot Zone (Abschnitt 7), aus **Versorgungskisten** (je eingelagerte Kiste 1 Geld/s, §7) sowie als **Prämie**: Für jede zerstörte gegnerische Einheit zahlt der Gegner (also du) 25 % des Einheitenpreises bei Soldaten, **60 % bei Fahrzeugen und Hubschraubern** (z. B. Schütze 15, Kampfpanzer 300); für zerstörte Gebäude 20 % ihres Baumaterialpreises (Mauern und Tore nichts); für jedes **fertig gebaute** Gebäude 20 % seines Baumaterialpreises (FOB 80, Mörser 40, Flak 36, Bohrer 30; Mauern und Tore nichts, sonst wäre Mauerbau eine Geldquelle). Ab 100 Geld erscheint eine Meldung. Die Prämie gilt für beide Seiten, auch für die KI.
- **Haupt-FOB:** unendliches Lager. **Raten:** LKW laden/entladen 100/s (400 Ladung in 4 s), Einheiten nachfüllen (Munition 60/s, Treibstoff 4/s, Baumaterial 20/s), Ausbildung **zwei Einheiten gleichzeitig** (2 Ausbildungsplätze, je eigener Fortschritt)
  (Schütze 5 s, PAK 8 s, Scharfschütze 10 s, LKW 6 s, Baufahrzeug 9 s, SPz 12 s, KPz 20 s, Little Bird 15 s, Transporter 20 s, AH-64 28 s; Warteschlange 5).
- **Vordere FOBs:** eigenes endliches Lager (max. 3000 je Sorte), das nur **LKW oder Transporthubschrauber** füllen. Oben zeigt „Front BM/MUN/TS“ die Summe dieser Lager.
- **Bezahlen:** Gebäude zahlen aus einer FOB, deren Bauradius den Bauort enthält (Baufahrzeug). Einheiten kosten **nur Geld**. Abbruch erstattet an dieses Lager.
- **Soldaten tragen Baumaterial:** Schütze und PAK tragen **50 Baumaterial** (starten voll, laden im FOB-Bauradius oder nahe einem LKW nach) und bauen daraus **Mauern und Tore, nur im Bauradius einer FOB**.
- **LKW im Feld:** füllt Einheiten im 180-px-Umkreis aus seiner Ladung auf (Munition, Treibstoff, Baumaterial).
- **Soldaten-Nachschub (wie im Original: Gefallene steigen wieder ein):** Hat ein Team weniger als **29 Soldaten** (Schützen und PAK, auch in Fahrzeugen und in Ausbildung), stellt die Haupt-FOB **alle 6 s kostenlos einen Schützen** bereit, der zum Sammelpunkt läuft. Die Auswahl der Haupt-FOB zeigt „Nachschub: Schütze in N s (Soldaten x/29, Plätze y/300)“ bzw. „Nachschub ruht“. Geld bleibt nötig für PAK, Fahrzeuge und Hubschrauber.
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
| Sendemast (seit v4.50) | Zweite Siegbedingung (§7), nur wenn im Startmenü eingeschaltet; nur Baufahrzeug, einer je Team, 2×2 |

Gebäude können abgerissen werden (Erstattung 25 % Baumaterial). **Einheitenlimit (seit v4.39, v4.54 auf 300 Plätze erhöht):** Jedes Team hat **300 Plätze** (`BALANCE.slotCap`). Soldat, LKW, Baufahrzeug und Hubschrauber belegen je 1 Platz, Schützenpanzer 3, Kampfpanzer 5, Flakpanzer und SAM-Startrampe 2 (`slots` in `units.js`). Gezählt werden lebende Einheiten, Passagiere und Einträge der Ausbildungs-Warteschlange; ist kein Platz frei, wird die Ausbildung abgelehnt („Einheitenlimit erreicht“) und der Soldaten-Nachschub pausiert. Gefallene geben ihre Plätze wieder frei.

## 6. Einheiten

| Einheit | Gebaut in | Rolle |
|---|---|---|
| Schütze | Haupt-FOB | Billige Infanterie, stark gegen Infanterie; trägt 50 Baumaterial, baut daraus Mauern und Tore |
| Panzerabwehrsoldat | Haupt-FOB | Langsam feuernd, stark gegen Fahrzeuge und Gebäude; baut Mauern und Tore |
| Scharfschütze | Haupt-FOB | Getarnt (Ghillie-Anzug), sehr große Reichweite, **ein Treffer tötet jeden Soldaten**, aber nur alle 8 s ein Schuss; gegen Fahrzeuge und Gebäude fast wirkungslos; baut nicht, kann als Passagier mitfahren |
| LKW | Haupt-FOB | Unbewaffnet, schnell, **2 Soldaten** Platz. **Logistik:** lädt Ressourcen an einer FOB (400), bringt sie zu einer anderen FOB oder FOB-Baustelle, pendelt auf Routen, versorgt Truppen im Feld |
| Baufahrzeug | Haupt-FOB | Unbewaffnet, **1 Soldat** Platz. Setzt FOB-Baustellen, baut alle Gebäude, repariert |
| Schützenpanzer | Haupt-FOB | **6 Soldaten** Platz. Schnell, gut gegen Infanterie und leichte Fahrzeuge |
| Kampfpanzer | Haupt-FOB | Teuer, schwer gepanzert, stark gegen alles (Hauptkanone trifft keine Hubschrauber, das MG schwach) |
| Little Bird | Haupt-FOB | Unbewaffnet, schnell, **5 Passagiere** (Infanterie, Baufahrzeug) |
| Transporthubschrauber | Haupt-FOB | Unbewaffnet, **9 Passagiere** und **400 Ressourcen** (laden/entladen/pendeln wie ein LKW) |
| AH-64 (Kampfhubschrauber) | Haupt-FOB | Bordkanone und 10 Raketen (Tabelle oben), 650 HP, 70 Treibstoff; Nachtanken/-laden in einer FOB |
| Flakpanzer (seit v4.54) | Haupt-FOB | **2 Plätze**, 300 HP, Schnellfeuer-Flak gegen Hubschrauber, schießt nur auf Luftziele. **20 Munition je Schuss**, Reichweite 330, 0,8 s Kadenz, 40 Schaden je Treffer. **Trefferchance** 85 % gegen ein stehendes Ziel, sinkt mit dessen Tempo (×120 / (120 + Tempo in px/s), also gegen Little Bird bei voller Fahrt rund 35 %), und mit der Entfernung (bis −30 % am Waffenrand). Verfehlte Schüsse kosten trotzdem Munition. Stufe 2 |
| SAM-Startrampe (seit v4.54) | Haupt-FOB | **2 Plätze**, 350 HP, vier **wärmesuchende Raketen** gegen Hubschrauber (nur Luftziele). **250 Munition je Rakete**, **10 s Nachladezeit** zwischen den Raketen, Reichweite 420, 350 Schaden (Little Bird 1 Treffer, Transporthubschrauber und AH-64 2). Trefferchance 90 %, kein Tempo-Abzug (die Rakete folgt der Wärme), nur Entfernung (bis −30 %). Stufe 3 |
| Kommandeur (Held, seit v4.49) | Haupt-FOB | **Einmalig je Team**, belegt **keinen Platz**, jedes Team startet mit ihm (hinten an der Haupt-FOB). Maschinenpistole (schwach). **Aura 300 px:** eigene Einheiten darin schießen **10 % schneller** (Abklingzeit ÷ 1,1), verletzte Infanterie darin heilt **1,5 HP/s**, sobald sie 6 s nicht getroffen wurde (Fahrzeuge nicht). **Fällt er, bekommt der Gegner 5 Punkte** (kann die Partie entscheiden; auch als Passagier eines zerstörten Fahrzeugs). Danach bildet die Haupt-FOB einen neuen aus (C, 400 Geld, 20 s); ein zweiter, auch in der Warteschlange, wird abgelehnt. Goldener Stern über der Figur (für beide Seiten sichtbar, soweit in Sicht), gewählt zeigt er den Aura-Kreis. Zählt nicht als Soldat für den Nachschub. `BALANCE.commander`, `js/game/commander.js` |

**Forschungsstufen** (§7, wenn im Startmenü an): ab Stufe 1 Schütze, PAK, LKW, Baufahrzeug und Kommandeur; **Stufe 2** schaltet Scharfschütze, Schützenpanzer, Little Bird, Transporthubschrauber und Flakpanzer frei, **Stufe 3** Kampfpanzer, AH-64 und SAM-Startrampe. Gesperrte Einheiten stehen ausgegraut in der Befehlskarte („Benötigt Stufe 2“). Die Startarmee bleibt unverändert (auch ihre Kampf- und Schützenpanzer).

**Scharfschütze und Tarnung:** Der Scharfschütze ist getarnt: Gegner sehen ihn nur, wenn eine ihrer Einheiten oder ein fertiges Gebäude näher als **160 px** an ihm steht, oder **4 s lang nach jedem seiner Schüsse**. Unentdeckt wird er nicht angegriffen und ist weder auf der Karte noch auf der Minimap zu sehen (eigene Einheiten sehen ihn immer). Er sieht selbst 440 px weit, sein Gewehr reicht 480 px, und Einheiten ohne Befehl schießen bis zu dieser Reichweite (nicht nur bis zur Leine von 300 px). Ein Schuss verbraucht 4 Munition; mit seiner Reichweite und der Tarnung ist er gegen Infanterie stark, gegen Fahrzeuge, Gebäude und Hubschrauber nutzlos. Die KI baut ihn nicht, sieht ihn aber nach denselben Tarnregeln. Er zählt zu den Soldaten für den Nachschub (Abschnitt 3).

**Hubschrauber** fliegen geradeaus über Gelände und Gebäude, brauchen Treibstoff beim Fliegen (ohne: 25 % Tempo) und sind
Panzerklasse „Luft“: Flugabwehr (stark), Panzerabwehrsoldat (40), Raketen des AH-64 (150), SPz-MG (6), Schütze (3), Panzer-MG (3) und die FOB-MG (2) treffen sie; Hauptkanone,
Granatwerfer und Mörser nicht. Passagiere steigen per Rechtsklick auf den Hubschrauber ein und werden mit **O** am Zielpunkt abgesetzt;
stirbt der Hubschrauber, sind die Passagiere verloren.

Schadensmodell: Schaden je Schuss nach Panzerklasse des Ziels (Infanterie / leicht / schwer / Gebäude) – Werte in §6 „Waffen und Schaden“. Höhenvorteil siehe §7 „Gelände“.

### Werte (Quelle: `js/data/units.js`, `js/data/buildings.js`, `js/data/balance.js`)

Die Tabellen „Werte“ und „Waffen und Schaden“ erzeugt `npm run docs` aus `js/data/` (`tools/doc-tables.mjs`); zwischen den Markierungen nichts von Hand ändern. Ein Test meldet, wenn sie nicht mehr zur Config passen.

<!-- auto:units:start -->
| Einheit | Taste | Stufe | Plätze | HP | Tempo | Sicht | Reichweite | Preis | Ausbildung | Treibstoff (max / je s) |
|---|---|---|---|---|---|---|---|---|---|---|
| Schütze | Q | 1 | 1 | 100 | 45 | 260 | 200 | 60 Geld | 5 s | – |
| Panzerabwehrsoldat | W | 1 | 1 | 90 | 40 | 260 | 240 | 120 Geld | 8 s | – |
| Scharfschütze | T | 2 | 1 | 70 | 38 | 440 | 480 | 220 Geld | 10 s | – |
| Kommandeur | C | 1 | 0 | 300 | 42 | 340 | 180 | 400 Geld | 20 s | – |
| LKW | E | 1 | 1 | 250 | 110 | 220 | – | 80 Geld | 6 s | 30 / 0,2 |
| Baufahrzeug | R | 1 | 1 | 400 | 70 | 260 | – | 150 Geld | 9 s | 40 / 0,3 |
| Schützenpanzer | A | 2 | 3 | 450 | 85 | 300 | 240 | 250 Geld | 12 s | 40 / 0,4 |
| Kampfpanzer | S | 3 | 5 | 1100 | 60 | 320 | 300 | 500 Geld | 20 s | 60 / 0,6 |
| Little Bird | D | 2 | 1 | 220 | 170 | 380 | – | 350 Geld | 15 s | 60 / 0,5 |
| Transporthubschrauber | F | 2 | 1 | 500 | 130 | 320 | – | 600 Geld | 20 s | 90 / 0,7 |
| Kampfhubschrauber | G | 3 | 1 | 650 | 150 | 400 | 340 | 900 Geld | 28 s | 70 / 0,8 |
| Flakpanzer | J | 2 | 2 | 300 | 70 | 380 | 330 | 220 Geld | 10 s | 40 / 0,4 |
| SAM-Startrampe | N | 3 | 2 | 350 | 65 | 440 | 420 | 300 Geld | 12 s | 40 / 0,4 |
<!-- auto:units:end -->

<!-- auto:buildings:start -->
| Gebäude | Taste (Baumenü) | HP | Größe (Zellen) | Kosten | Bauzeit |
|---|---|---|---|---|---|
| FOB | – | 2500 | 3×3 | 400 Baumaterial | 30 s |
| Mauer | E | 600 | 1×1 | 8 Baumaterial | 2 s |
| Tor | R | 800 | 1×1 | 25 Baumaterial | 4 s |
| Mörser | T | 700 | 2×2 | 200 Baumaterial, 60 Munition | 20 s |
| Flugabwehr | Z | 700 | 2×2 | 180 Baumaterial, 40 Munition | 18 s |
| Sendemast | G | 3000 | 2×2 | 2000 Geld, 600 Baumaterial | 120 s |
| Bohrer | X | 600 | 2×2 | 150 Baumaterial | 20 s |
<!-- auto:buildings:end -->

Weitere globale Zahlen (Kartengröße, Zone, Prämien, Logistikraten, Schwierigkeit) stehen in `js/data/balance.js` und sind oben im Text genannt.

### Waffen und Schaden (Quelle: `weapons` in `js/data/units.js`, `weapon` in `js/data/buildings.js`)

Schaden je Schuss nach Panzerklasse des Ziels (Inf = Infanterie, Leicht, Schwer, Geb = Gebäude, Luft). Wo die Tabelle „Treffer bis zum Abschuss“ (unten) eine Paarung nennt, gilt sie statt dieser Werte. Reichweite in px, Kadenz = Sekunden zwischen Schüssen.

<!-- auto:weapons:start -->
| Waffe | Reichweite | Kadenz (s) | Schuss | Munition je Schuss | Inf | Leicht | Schwer | Geb | Luft | Hinweis |
|---|---|---|---|---|---|---|---|---|---|---|
| Schütze: Gewehr | 200 | 1 | 60 | 0,033 | 12 | 3 | 1 | 4 | 3 | Soldat: 4 Treffer |
| Panzerabwehrsoldat: RPG | 240 | 3 | 5 | 10 | 10 | 90 | 120 | 60 | 40 | Soldat: 1 Treffer |
| Scharfschütze: Scharfschützengewehr | 480 | 8 | 10 | 4 | 200 | 6 | 1 | 2 | 2 | Soldat: 1 Treffer |
| Kommandeur: Maschinenpistole | 180 | 0,6 | 90 | 0,033 | 10 | 2 | 1 | 2 | 2 | Soldat: 6 Treffer |
| Schützenpanzer: Granatwerfer | 240 | 2 | 60 | 10 | 30 | 40 | 10 | 25 | – | bevorzugt gegen Leicht, Schwer, Geb; Soldat: 1 Treffer |
| Schützenpanzer: MG | 220 | 0,25 | 300 | 5 | 9 | 3 | 1 | 3 | 6 | Soldat: 2 Treffer |
| Kampfpanzer: Hauptkanone | 300 | 6 | 30 | 20 | 45 | 120 | 150 | 120 | – | bevorzugt gegen Leicht, Schwer, Geb; Soldat: 1 Treffer |
| Kampfpanzer: MG | 220 | 0,25 | 300 | 5 | 10 | 3 | 0 | 2 | 3 | Soldat: 2 Treffer |
| Kampfhubschrauber: Bordkanone | 340 | 0,5 | 300 | 10 | 22 | 26 | 30 | 18 | 10 | – |
| Kampfhubschrauber: Raketen | 340 | 3 | 10 | 100 | 40 | 120 | 220 | 120 | 150 | bevorzugt gegen Schwer, Geb, Luft |
| Flakpanzer: Flak | 330 | 0,8 | 30 | 20 | – | – | – | – | 40 | Trefferchance 85 % × Tempo-Faktor × Entfernungs-Faktor; nur Luftziele |
| SAM-Startrampe: Wärmesuchrakete | 420 | 10 | 4 | 250 | – | – | – | – | 350 | Trefferchance 90 % × Entfernungs-Faktor; nur Luftziele |
| FOB (Gebäude) | 220 | 0,6 | – | – | 12 | 4 | 1 | 4 | 2 | kostenlos |
| Mörser (Gebäude) | 800 | 20 | – | 4 | 60 | 50 | 25 | 80 | – | min. 200 px; Fläche 60 px; Granate mit Flugzeit |
| Flugabwehr (Gebäude) | 320 | 0,4 | – | 0,25 | 10 | 12 | 2 | 4 | 35 | fängt Mörsergranaten ab (350 px, 70 %) |
<!-- auto:weapons:end -->

Das Spiel wählt je Ziel automatisch die Waffe mit dem besten Schaden bzw. die „bevorzugte“ Waffe für die Panzerklasse des Ziels; Waffen ohne Munition schweigen.

Gegen besetzte **Stadthäuser** (Häuserkampf, §7) gilt die Spalte Geb, mit Faktor: Waffen mit mindestens 25 Gebäudeschaden (Hauptkanone, RPG, Granatwerfer, Raketen, Mörser) × 1,5, alle anderen (Gewehre, MGs, Bordkanone) × 0,5.

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

### Gelände: Hügel, Berge, Seen

- **Höhenmodell** (`js/game/relief.js`): Höhenraster alle 64 px (142 × 142 Punkte), glatt (Catmull-Rom) auf das Feinraster von 32 px (= Zellengröße) hochgerechnet. Höhen in Bildschirm-Pixeln bei Zoom 1, wie die Gebäudehöhen der Iso-Ansicht. Wasserspiegel −20, darunter liegt ein See.
- **Begehbarkeit:** Eine Zelle ist unpassierbar, wenn sie unter dem Wasserspiegel liegt, höher als **300** ist (Gipfel, Fels) oder steiler als **0,42** (Höhe je px). Ab Neigung 0,3 zeigt das Bild Fels (Warnung: hier wird es bald steil). Hubschrauber fliegen über alles.
- **Höhenvorteil (seit v4.41, nach Age of Empires II):** Im Direktfeuer macht der höher stehende Schütze mehr Schaden, der tiefer stehende weniger: ab 6 Höhenunterschied wächst der Faktor linear bis **±25 %** bei 36 (`BALANCE.height`). Bei Paarungen mit Trefferzahl (Tabelle in §6) gilt gerundet Treffer ÷ Faktor, mindestens 1 (Gewehr gegen Soldat: 4 Treffer, von oben 3, von unten 5). Gilt für Einheiten und Gebäude-MG, nicht für Mörser und nicht mit Hubschraubern (Schütze oder Ziel). Die Auswahl einer Einheit zeigt ihre Standhöhe und, wenn der Zeiger auf einem sichtbaren Gegner liegt, den Vorteil gegen ihn.
- **Tempo am Hang (seit v4.41, nach Empire Earth):** Faktor = 1 − Steigung × 1,5 (Fahrzeuge) bzw. × 0,8 (Infanterie) bergauf, bergab 1 + Gefälle × 0,6 bzw. × 0,3; begrenzt auf 0,55 … 1,2 (`BALANCE.slope`), gemessen in Fahrtrichtung. Die Wegsuche rechnet je Zelle 1 + 1,2 × Neigung als Kosten (Talwege und flache Umwege werden bevorzugt, wenn sie kürzer dauern); die Begradigung des Weges kürzt nur ab, wenn die gerade Strecke nicht teurer ist.
- **Sicht im Gelände (seit v4.42, nach Empire Earth):** Wer höher steht, sieht weiter: Sichtweite × (1 + (Höhe − 40) / 350), höchstens +40 % (`BALANCE.sightHeight`). Kämme und Kuppen verdecken, was dahinter liegt: Von jedem Beobachter laufen Sichtstrahlen (Abstand am Rand ≤ 44 px, Schritt 24 px) über das Höhenraster; ein Punkt ist sichtbar, wenn die Linie vom Auge (Infanterie 16, Fahrzeuge 20, Gebäude 30 über dem Boden) zu seiner Oberkante (Boden + 12) über allem Gelände davor liegt. Gelände näher als 72 px verdeckt nichts (man tritt an die Hangkante). Hubschrauber sehen ungehindert. Der Nebel gilt wie bisher je Team; was eine eigene Einheit nicht sieht, kann nicht automatisch beschossen werden (Hinterhalte hinter Hügeln). Ergebnisse werden je Beobachter zwischengespeichert, solange er am selben Ort steht.
- **KI:** Sammelpunkt an der Zonen-FOB und die Verteilpunkte der Zonenbesatzung liegen auf der höchsten begehbaren Stelle in der Nähe.
- **Zufallskarte** (`js/game/landscape.js`, punktsymmetrisch wie die übrige Karte): 4 Bergrücken (Grate bis ~250 hoch, felsige Flanken), 7 Hügel, 2 Seen mit unregelmäßigem Ufer und sanftem Becken, in der Zone 2 flache Kuppen. Freigehalten werden Startgelände (650 px eben, dann sanfter Übergang), die Konfliktzone (kein Hang steiler als 0,25, kein Wasser, keine Felszelle), die Zufahrtsstraßen, die Bahnlinie und der Kartenrand. **Mindestens 3 getrennte Zugänge** führen von jedem Start in die Zone (Pfadsuche mit Sperrung des gefundenen Weges, 340 px breit, außerhalb von Start und Zone); sonst verwirft der Generator den Versuch. Wald, Bäume und Fabrikgelände stehen nur auf ebenem Grund.
- **Darstellung:** Iso mit WebGL: echtes Höhennetz (Feinraster), Licht von rechts oben wie die Gebäudeschatten, Felsblöcke an steilen Hängen und auf Gipfeln, Geröll am Fuß, Sandufer, Wasser mit Tiefe, Wellen und hellem Saum, Erdschnitt am Kartenrand; Einheiten, Gebäude (auf ihrer tiefsten Ecke), Kreise und Linien stehen auf dem Gelände. 2D und Minimap: Schummerung (Licht aus Nordwest), Fels, Ufer und Seen aufgemalt. Ohne WebGL bleibt Iso flach mit aufgemaltem Gelände.
- **Felder, Weiden, Feldwege (seit v4.46, nach den Farmen aus Age of Empires II):** Um die Einzelhäuser außerhalb der Zone liegen Gehöfte: je Haus (zu 75 %) eine Reihe von 1–3 Feldern (170–320 × 170–300 px, gerade oder bis ±20° gedreht) auf einer Seite des Hauses, dazwischen ein Feldweg. Dazu 8 freie Flure (Paare) mit zwei Feldreihen beiderseits eines Feldwegs. Feldwege (26 px, `dirt`) binden Gehöfte und Flure an die nächste Straße, einen anderen Feldweg oder das Nachbargehöft an. Äcker tragen **Weizen** (gold), **junge Saat** (grün), **gepflügten Boden** (braun mit Furchen und Kämmen) oder **Raps** (gelb), alle mit Furchen in Längsrichtung und dunklerem Feldrand; **Weiden** (30 %) sind grün mit helleren Flecken, Zaun mit Pfosten und Heuballen. Alles ist nur Boden: Felder und Feldwege blockieren nichts, Bäume darauf fallen weg. Punktsymmetrisch, mit eigenem Zufall (die übrige Karte bleibt je Seed gleich), außerhalb der Zone, frei von Gebäuden, Wald, Straßen und Wasser. Gezeichnet ins Bodenbild (2D, Iso, WebGL-Gelände und Minimap).
- **Kartenformat:** `relief` = Höhenraster als Base64-Text (1 Byte je Punkt, Höhe = Wert × 2 − 128, also −128 … 382). Fehlt es oder ist es kaputt, ist die Karte flach.

### Häuserkampf (seit v4.43, nach Company of Heroes / Age of Empires II)

- **Häuser:** Jedes nicht gedrehte Stadtgebäude der Arten Wohnhaus, Halle, Fabrik und Bahnhof (ab 40 × 40 px, also keine Mauern) kann von Infanterie besetzt werden: Wohnhaus **4** Plätze / 700 HP, Halle **8** / 1200, Fabrik **10** / 1800, Bahnhof **8** / 1200 (`BALANCE.garrison`). Türme, Züge, Bahnsteige und Fabrikmauern nicht. Ein Haus gehört dem Team seiner Besatzer; leer gehört es niemandem und kann nicht angegriffen werden. Ein vom Gegner besetztes Haus kann man nicht betreten.
- **Besetzen:** Soldaten (Schütze, PAK, Scharfschütze) gehen bis an die Wand (56 px) und verschwinden im Haus; die nächsten so viele, wie Plätze frei sind, die übrigen stellen sich daneben. Fahrzeuge können nicht hinein.
- **Drinnen:** Die Besatzer bewegen sich nicht, schießen aber weiter: Reichweite und Sicht zählen ab der Hauswand (halbe mittlere Seitenlänge mehr), sie stehen **24 höher** (Höhenvorteil, §7) und schauen mit Gebäude-Augenhöhe. Treffer, Granaten und Mörser treffen **das Haus** statt der Besatzer (nur gegnerisch besetzte Häuser nehmen Schaden). Sie zählen für Zone, Hot Zone, Punkte und Einheitenlimit und werden in Reichweite einer FOB oder eines LKW nachmunitioniert. Ein getarnter Scharfschütze verrät sein Haus erst, wenn er selbst erkannt wird.
- **Vertreiben:** Handwaffen machen gegen Häuser nur halben Schaden, schwere Waffen das 1,5-Fache (§6). Fällt das Haus auf 0, **stürzt es ein**: Die Besatzer fallen mit 35 % ihrer vollen HP Schaden heraus (wer weniger hat, stirbt), es bleibt eine Ruine, die den Weg weiter versperrt und nicht mehr besetzt werden kann. Meldung an beide Seiten.
- **Verlassen:** Taste **O** („Raus“) oder jeder Marsch-, Bau- oder Einsteigebefehl; die Soldaten treten auf der Seite zum Ziel aus dem Haus. Ein Angriffsbefehl auf ein Ziel in Reichweite der Fenster lässt sie drin, sonst gehen sie hinaus und verfolgen es.
- **KI:** Alle 8 s schickt sie bis zu 40 % ihrer Infanterie in der Zone in freie Häuser im Umkreis von 500 px; Besatzer halten ihr Haus (keine Verteilbefehle, keine Überfälle, keine Verteidigungszüge), nur Rückzug bei Mangel und Gruppen-Rückzug holen sie heraus.

### Versorgungskisten (seit v4.44, nach den Reliquien aus Age of Empires II)

- **Fundorte:** Die Zufallskarte legt **3 Kistenpaare** (`BALANCE.crates.pairs`, punktsymmetrisch, also gleich weit von beiden Starts) abseits von allem: mehr als 350 px außerhalb der Zone, mehr als 1300 px von den Startpunkten, mindestens 900 px voneinander, nicht an der Bahnlinie, auf freiem Boden, den beide Starts zu Fuß erreichen. Sie werden nach allem anderen gelegt, die übrige Karte eines Seeds bleibt dieselbe. Findet sich für ein Paar kein Platz, gibt es weniger Kisten. Eigene Karten: Werkzeug „Kiste“ im Editor (höchstens 24, `crates` im Kartenformat); eine Kiste auf verbautem Boden rückt im Spiel zur nächsten freien Stelle.
- **Holen:** Infanterie gewählt, Rechtsklick oder Tippen auf eine Kiste: der nächste Soldat ohne Kiste holt sie (bis 40 px heran), die übrigen gehen als Begleitschutz mit. Fahrzeuge tragen keine Kisten, jeder Soldat höchstens eine.
- **Tragen:** Der Träger geht mit **75 %** Tempo, **schießt nicht** (auch kein Angriffsbefehl), steigt nicht in Fahrzeuge und besetzt keine Häuser. Er bringt die Kiste von selbst zur **nächsten eigenen fertigen FOB** (auch die Haupt-FOB); Rechtsklick auf eine eigene FOB wählt das Ziel, **K** legt die Kiste ab. Ein Träger, der untätig steht, macht sich wieder auf den Weg. Steckt er im Gedränge an der FOB fest (3 s kein Fortkommen, höchstens 320 px vor der Wand), gilt die Kiste als abgeliefert.
- **Einlagern:** An der FOB (100 px vor der Wand) wird die Kiste eingelagert und bringt dem Team **1 Geld/s** (`BALANCE.crates.income`, mit dem Einkommensfaktor der Schwierigkeit). Eingelagerte Kisten stehen im Hof der FOB und lassen sich nicht stehlen.
- **Verlieren:** Fällt der Träger, liegt die Kiste, wo er fiel; wird die FOB zerstört oder abgerissen, liegen ihre Kisten wieder am Boden. Jeder kann sie dann aufheben, auch der Gegner. Meldungen: eigene Kiste eingelagert (+1 Geld/s), Träger gefallen, FOB mit Kisten verloren, der Gegner hat eine Kiste aufgenommen bzw. eingelagert.
- **Lagebild:** Jedes Team kennt die Fundorte von der Karte (gelbe Quadrate auf der Minimap, auch im Nebel). Danach zählt, was es gesehen hat: Sieht es eine Stelle ohne Kiste, verschwindet das Quadrat; eine Kiste am Boden in Sicht wird vermerkt. Auf der Karte erscheinen Kisten am Boden nur in erkundeten Zellen (schimmernd), getragene auf dem Rücken des Trägers.

### Hot Zone
- Kleiner Kreis (Radius 300 px) **innerhalb** der Konfliktzone, orange; auch auf der Minimap. Er wandert langsam (13,3 px/s) zu einem
  Zufallspunkt (neues Ziel alle 25–45 s); nur auf dem Weg zu einem aktiven Bohrer ist er mit 40 px/s schneller.
- **Geld:** Einheiten in der Hot Zone bringen **0,8 Geld/s** statt 0,4 (das Doppelte, nicht zusätzlich). **Besitz** nur, wenn eine Partei allein darin ist (Anzeige „HOT“); er bringt kein eigenes Geld. Punkte gibt es nicht separat; die Einheiten darin zählen doppelt für den Punktebalken.
- Oben zeigt „HOT“ den Besitzer und die Einheitenzahl je Team, daneben der Punktebalken.

### Sendemast (seit v4.50, nach dem Wunder aus Age of Empires II)
- **Zweite Siegbedingung**, im Startmenü ein- und ausschaltbar („Sendemast-Sieg“, gemerkt, Standard An; `Game({ radio })`, ohne Angabe aus).
- Bau wie jedes Gebäude im Bauradius einer eigenen FOB (nur Baufahrzeug, Taste **G** im Baumenü): **2000 Geld + 600 Baumaterial**, 120 s, 3000 HP. **Einer je Team** (auch als Baustelle).
- Der Gegner erfährt den **Baubeginn** („Der Gegner baut einen Sendemast“, ohne Ort). **Fertig** ist der Mast für den Gegner **überall sichtbar** (Karte, Minimap, auch im Nebel), beide bekommen eine Meldung mit Ort.
- Hält der fertige Mast **30 Minuten** (`BALANCE.radio.hold`), gewinnt sein Team (`winReason 'radio'`). Eine Minute vorher warnt eine Meldung beide. Wird er zerstört, verfällt die Zeit; ein neuer Mast beginnt von vorn.
- Oben zeigt ein roter Kasten die Restzeit je fertigem Mast (beide Seiten). Iso: rot-weißer Gittermast (170 px) mit Abspannseilen, Antennen in Teamfarbe und blinkendem Licht; 2D: Sockel mit Gitter von oben.
- `js/game/radio.js`, `BUILDINGS.radio`.

### Wetter und Jahreszeiten (seit v4.51, nach Empire Earth II)
- **Lichtstimmung (seit v4.70, nur Optik):** Menü „Licht“ (Aus · Zufall · Morgen · Tag · Abend · Nacht, Standard Zufall) färbt die Karte mit Morgenrot, Mittagslicht, Abendglut oder Mondschein; gilt in 2D und Iso, ändert weder Sicht noch Wetter noch KI. Regen, Nebel und Schnee liegen darunter und mischen sich mit der Stimmung.
- Im Startmenü wählbar („Wetter“: Aus · Zufall · Sommer · Herbst · Winter, gemerkt, Standard Zufall; `Game({ weather })`, ohne Angabe aus). Zufall wählt die Jahreszeit aus dem Seed.
- Die **Jahreszeit** gilt die ganze Partie, das **Wetter** wechselt: klar hält 180–360 s, Regen 100–200 s, Nebel 90–180 s, Schnee 100–200 s; nie zweimal dasselbe hintereinander. Häufigkeit des nächsten Wetters (Gewichte): Sommer klar 6 · Regen 3 · Nebel 1; Herbst klar 3 · Regen 4 · Nebel 3; Winter klar 4 · Schnee 4 · Nebel 2. Schon das erste Wetter einer Partie kann schlecht sein.
- **Wirkung:** Regen und Schnee senken die Sichtweite um **20 %**, Nebel um **35 %** (alle Einheiten und Gebäude, auch Hubschrauber; gilt für den Nebel des Krieges und die automatische Zielsuche, Waffenreichweiten bleiben). Schneefall bremst Bodenfahrzeuge (LKW, Baufahrzeug, Schützenpanzer, Kampfpanzer) auf **80 %**, Winterboden ohne Schneefall auf **90 %**; Infanterie und Hubschrauber nicht. Formationen (§8) fahren dann im Tempo der gebremsten Fahrzeuge, wenn das langsamer ist als das der langsamsten Einheit.
- Übergänge blenden über 20 s (die Sicht in 5-%-Stufen). Jeder Wechsel kommt als Meldung an beide („Nebel zieht auf: Sicht −35 %“, „Der Nebel lichtet sich: klare Sicht“), zum Start eine mit Jahreszeit und Wetter.
- Eigener Zufall je Seed: die übrige Partie läuft bei gleichem Seed gleich. `BALANCE.weather`, `js/game/weather.js`.
- **Darstellung:** Herbst färbt Wiesen gelblich-oliv und das Laub gelb, orange und rotbraun; Winter legt Schnee über Wiesen und Bäume (Straßen, Dächer und Fels im Bodenbild eine dünne Schicht; Iso-Bäume mit dunkler Krone und Schnee obenauf, ohne Bilder (`?sprites=0`) auch Schnee auf den gezeichneten Dächern der Stadt), im WebGL-Gelände sind flacher Fels und Ufer verschneit, Seen haben einen Eisrand. Regen: schräge Schnüre und dunkleres Licht; Schnee: treibende Flocken; Nebel: heller Dunst mit ziehenden Schwaden und dichterem Bildrand (`js/render/season.js`, `js/render/weatherfx.js`).

### Forschungsstufen (seit v4.52, nach Age of Empires II und Empire Earth)
- Im Startmenü schaltbar („Forschung“: An/Aus, gemerkt, Standard An; `Game({ research })`, ohne Angabe aus: alle Einheiten frei, keine Verbesserungen).
- Die **Haupt-FOB forscht neben der Ausbildung**, immer nur eins zugleich. Das Geld wird beim Start bezahlt, ein Abbruch erstattet es ganz. Taste **U** öffnet das Forschungsmenü (Haupt-FOB gewählt).
- Ziele (`BALANCE.research.items`):

| Taste | Ziel | Kosten | Dauer | Voraussetzung | Wirkung |
|---|---|---|---|---|---|
| Q | Stufe 2 | 600 Geld | 60 s | – | Scharfschütze, Schützenpanzer, Little Bird, Transporthubschrauber |
| Q | Stufe 3 | 1200 Geld | 90 s | Stufe 2 | Kampfpanzer, AH-64 |
| W | Schutzwesten | 400 Geld | 45 s | Stufe 2 | Infanterie nimmt **15 % weniger Schaden** |
| E | Wärmebildoptik | 600 Geld | 60 s | Stufe 2 | **Waffenreichweite und Sicht** aller Einheiten **+10 %** (auch Nebel des Krieges und Zielsuche) |
| R | Verbundpanzerung | 800 Geld | 60 s | Stufe 3 | Fahrzeuge und Hubschrauber nehmen **15 % weniger Schaden** |

- Ein Schuss, der das unverletzte Ziel sofort tötet (Scharfschütze, Panzerfaust oder Granate gegen Soldaten), bleibt trotz Schutzwesten tödlich. Gebäude und Häuser bekommen keine Panzerung.
- Meldungen: „Stufe 2 erreicht: Scharfschütze, Schützenpanzer, Little Bird und Transporthubschrauber freigeschaltet“; der Gegner erfährt jede Stufe („Der Gegner hat Stufe 2 erreicht“), Verbesserungen nicht.
- Bogen der Partie: Erst leicht bewaffnet, schwere Verluste lassen sich erst mit Stufe 3 ersetzen; jede Stufe kostet Geld, das in der Armee fehlt („Armee jetzt oder Technik später“). `js/game/research.js`.

### Fluss mit Brücken und Furten (seit v4.53, nach den Flusskarten aus Age of Empires II und den Brücken aus Company of Heroes)
- Im Startmenü schaltbar („Fluss“: An/Aus, gemerkt, Standard An; `Game({ river })`, ohne Angabe aus). Gilt für Zufallskarten; eigene Karten bringen ihre Flüsse, Brücken und Furten selbst mit (§9a). Ohne Fluss bleibt die Zufallskarte je Seed genau wie bisher.
- **Lage:** Vor jeder Startecke windet sich ein Fluss (punktsymmetrisch) im Bogen um die Ecke, 2280–2520 px von ihr entfernt, außerhalb der Konfliktzone und des Startgeländes. Flussbett 184 px breit (bis 43 unter dem Wasserspiegel), dann 330 px sanftes Ufer. Seen in den Brückenzufahrten werden aufgefüllt. Der Fluss ist Wasser im Gelände (§7): unpassierbar, nur Hubschrauber fliegen darüber.
- **Übergänge je Fluss:** **3 Brücken** (bei 16°, 45° und 74° des Bogens, dort wo das Ufer am flachsten ist, Straßen über Wasser fallen weg) und **2 Furten** (dazwischen, Radius 150 px). Der Generator prüft, dass jedes Ufer jedes Übergangs an ein großes Gebiet anschließt und dass ohne Brücken und Furten kein Weg hinüber führt; sonst verwirft er den Versuch.
- **Furt:** seichtes Wasser (bis 12 unter dem Spiegel) im Furtkreis ist passierbar. Bodeneinheiten fahren dort mit **halbem Tempo**, die Wegsuche zahlt 3 je Zelle dazu und nimmt lieber eine Brücke. Rot-weiße Pfosten markieren die Furt.
- **Brücke:** neutrales Objekt (gehört niemandem) mit **2400 Leben**, Fahrbahn 80 px breit, öffnet die Wasserzellen darunter. Einheiten darauf stehen auf der Fahrbahnhöhe (Höhenvorteil, Iso). **Nur auf Befehl beschossen** (A + Klick auf die Brücke, §8): weder Zielsuche noch Angriffsbewegung greifen sie an. Schaden wie bei Häusern (schwere Waffen × 1,5, Handwaffen × 0,5); Mörsergranaten treffen sie mit ihrem Splash. Bei 0 Leben stürzt sie ein (Meldung „Brücke zerstört“ an beide): die Fahrbahn sperrt, wer darauf stand, landet am nächsten Ufer.
- **Wiederaufbau:** Baufahrzeug wählen und auf die Trümmer tippen bzw. rechtsklicken. Der erste Auftrag kostet **200 Geld**, danach helfen weitere Baufahrzeuge (auch des Gegners) ohne Kosten. Ein Baufahrzeug arbeitet bis 90 px vom Brückenkopf (es fährt zum erreichbaren Ufer) und braucht **30 s**, mehrere entsprechend schneller (höchstens 3 zählen). Fertig: volle Leben, Fahrbahn offen, Meldung „Brücke wieder aufgebaut“.
- Auf Brücken (auch an den Brückenköpfen) und in Furten wird nicht gebaut („Nicht auf Brücken und in Furten“).
- Werte: `BALANCE.river`; Logik `js/game/river.js`, Flussbett `js/game/landscape.js`, Grafik `js/render/bridge.js`.

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
| Rechtsklick | Bewegen; auf Gegner = Angreifen; Gebäude gewählt = Sammelpunkt; LKW auf eigene FOB = laden (leer) bzw. entladen; Baufahrzeug/Infanterie auf eigene Baustelle = dort bauen; Baufahrzeug auf beschädigtes eigenes Gebäude = reparieren; Baufahrzeug auf eingestürzte Brücke = wieder aufbauen (200 Geld) |
| A + Linksklick | Angriffsbewegung; auf eine intakte Brücke = sie beschießen, bis sie einstürzt (§7, nur so greift jemand eine Brücke an) |
| S | Stopp |
| F (Einheiten gewählt) | **Formation** wechseln (seit v4.48, nach Age of Empires II): Locker → Linie → Keil → Kolonne; gilt für alle folgenden Marsch- und Angriffsbefehle (Rechtsklick/Tippen und A), ab zwei Bodeneinheiten. Reihenfolge: Kampfpanzer vorn, dann Schützenpanzer, Infanterie (Schütze, PAK), Scharfschützen, unbewaffnete Fahrzeuge (LKW, Baufahrzeug) hinten; Linie: Panzer in der Mitte, Infanterie an den Flügeln (bis 10 je Reihe); Keil: gefüllter Keil mit der Spitze am Ziel; Kolonne: einzeln, ab 9 Einheiten zu zweit. Abstand 26–44 px (nach der größten Einheit). Die Gruppe marschiert **geschlossen**: Grundtempo ist das der langsamsten Bodeneinheit, wer mehr als 16 px vor dem Nachzügler liegt, bremst (bis 10 %), wer mehr als 80 px hinter dem Mittel liegt, holt mit eigenem Tempo auf; ein festgefahrenes Mitglied (3 s ohne Fortschritt) hält niemanden auf. Am Ziel rückt jeder genau auf seinen Platz. Hubschrauber fliegen locker hinter der Formation und bremsen sie nicht. Die Zielmarke zeigt kurz die Plätze. `BALANCE.formation`, `js/game/formation.js` |
| B | Baumenü (Baufahrzeug: alles, Soldaten: nur Mauer/Tor); darin E Mauer, R Tor, T Mörser, Z/Y Flugabwehr, X Bohrer, G Sendemast (wenn eingeschaltet), F FOB-Baustelle |
| Mörser gewählt | G Ziel wählen (oder Rechtsklick auf die Karte) · C Ziel löschen |
| Bohrer gewählt | G aktivieren |
| Transportfahrzeuge | Infanterie wählen + **I** (Einsteigen, dann Fahrzeug antippen) oder Rechtsklick auf LKW / Baufahrzeug / Schützenpanzer / Hubschrauber = einsteigen · Fahrzeug wählen + **O** und Zielpunkt = absetzen · Transporthubschrauber: L/U/T wie LKW |
| Versorgungskisten | Infanterie wählen + Rechtsklick/Tippen auf eine Kiste = holen (der nächste trägt, die übrigen begleiten) · Träger + Rechtsklick auf eigene FOB = dorthin bringen · **K** = Kiste ablegen |
| Häuserkampf | Infanterie wählen + Rechtsklick/Tippen auf ein Haus der Stadt (oder **I**, dann Haus antippen) = besetzen · Klick auf eigenes besetztes Haus = Besatzung wählen · **O** = Raus · Rechtsklick auf gegnerisch besetztes Haus = angreifen |
| Haupt-FOB gewählt | Ausbildung: Q Schütze · W PAK · T Scharfschütze · E LKW · R Baufahrzeug · A SPz · S KPz · D Little Bird · F Transporter · G AH-64 · C Kommandeur (einmalig) · **U Forschung** (wenn eingeschaltet): Q nächste Stufe · W Schutzwesten · E Wärmebildoptik · R Verbundpanzerung · C laufende Forschung abbrechen · Esc zurück; nach dem Start einer Forschung zeigt die Karte wieder die Ausbildung |
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
| F2 / Lautsprecher-Knopf oben | Ton an/aus (wird gemerkt, §14) |
| F1 / ? | Hilfe |
| Minimap | Linksklick = Kamera, Rechtsklick = Bewegen |

## 9. Oberfläche

- Oben: Summe aller FOB-Lager und Geld mit Netto-Rate/s (rot bei Verlust), Punkte Blau/Rot mit Balken, Zonenstatus mit Geld/s und Einheitenzahl (Zone, Hot Zone), Hot-Zone-Anzeige,
  Spielzeit, Geschwindigkeit.
- Unten links Minimap, Mitte Auswahlinfo (FOB: Lager; LKW: Ladung und Ladungsart; Einheiten: Munition/Treibstoff),
  rechts Befehlskarte mit Kosten und Tastenkürzeln (nicht bezahlbare Buttons ausgegraut mit Grund).
- **Telefon quer** (Bildschirmhöhe ≤ 520 px, z. B. Pixel 8a mit 915 × 412 CSS-px; seit v4.60): kompakte Oberfläche, damit das Spielfeld sichtbar bleibt.
  Kopfleiste 36 px (statt 44–68 px, Wertungszeile der Zone entfällt), unten nur ≈ 110 px statt 190 px: Minimap 100 px, Auswahl (scrollbar, 108 px hoch),
  Befehlskarte mit 6 Spalten à 50 × 48 px (Touch-Ziele; Tastenkürzel ausgeblendet). Der Knopf „▾“ neben der Minimap klappt Auswahl und Befehle ein (nur die Minimap
  bleibt, Zustand wird gemerkt, `localStorage` `frontline-hud-fold`). Die Kamera zentriert Ziele (Spielstart, Minimap-Klick, Meldung antippen, Taste für Basis) in der
  vom HUD nicht verdeckten Mitte (`camera.insetTop/insetBottom`). Tooltips der Befehlstasten gibt es nur mit Maus (Hover), nicht auf Touch.
  Tablet (Lenovo Tab M11) und Desktop behalten das bisherige Layout.
- Auf der Karte: Munitions-/Treibstoffbalken bei gewählten Einheiten, Warnzeichen bei Einheiten ohne Munition,
  Route gewählter LKW als gestrichelte Linie, Bauradius gewählter FOBs als gestrichelter Kreis.
- Meldungen (z. B. „Einheit bereit“, „Basis wird angegriffen“, „Einheiten ohne Munition“, „Route unterbrochen“).
- Nebel des Krieges: Unerkundet schwarz, erkundet abgedunkelt, gegnerische Einheiten nur in Sicht. Mit Gelände verdecken Kämme die Sicht (§7).
- Häuserkampf (§7): besetzte Häuser tragen ein Schild in Teamfarbe mit Besatzung/Plätzen und darunter den Zustand (eigene immer, gegnerische in Sicht); gewählte Besatzer zeigen einen Rahmen ums Haus; eingestürzte Häuser sind Schutthaufen (Iso mit Mauerrest und Brocken). Die Auswahl zeigt Haus, Plätze und Zustand.
- Versorgungskisten (§7): olivgrüne Kisten mit Gurt und gelbem Schloss; am Boden mit gelbem Schimmer, auf dem Rücken des Trägers kleiner, eingelagert in Reihen im FOB-Hof; Minimap: gelbe Quadrate (Lagebild). Die Auswahl eines Trägers zeigt „Trägt eine Versorgungskiste“, die FOB-Auswahl ihre Kisten und das Geld daraus, die Zonenanzeige oben die Zahl eigener Kisten.
- **Sichtbarer Schaden** (seit v4.45, nach Age of Empires II / Empire Earth; rein optisch, blockiert weder Wege noch Sicht): Teamgebäude und Häuser unter 60 % Leben rauchen, unter 30 % brennen sie; Fahrzeuge und Hubschrauber rauchen unter 50 % und brennen unter 15 %. Zerstörte Fahrzeuge und Hubschrauber hinterlassen ein ausgebranntes **Wrack** (Iso: das verkohlte 3D-Modell, sonst eine dunkle Wanne mit verdrehtem Turm) mit Brandfleck, zerstörte Gebäude **verkohlte Trümmer** mit großem Brandfleck (Mauern und Tore nur einen Schutthaufen; abgerissene Gebäude nichts; ein Neubau räumt die Trümmer weg); Wracks rauchen 60 s, die ersten 20 s brennen sie. Mörsereinschläge hinterlassen **Krater**. Wracks bleiben 240 s (höchstens 80), Krater 180 s (höchstens 150), beide blassen die letzten 30 s aus (`BALANCE.scars`, `js/game/scars.js`). Ein Team sieht eine Narbe erst, wenn ihre Stelle einmal in seiner Sicht lag; Rauch und Feuer nur in Sicht (eigene immer). Rauch und Feuer sind gezeichnet (keine Bilder) und laufen in Echtzeit.
- **Tiere** (seit v4.47, nach den Jagdtieren aus Age of Empires II; rein optisch, keine Ziele, blockieren nichts): 4 Rudelpaare (punktsymmetrisch, außerhalb der Zone, fern der Starts), Rehe (3–5 je Rudel; braun mit hellem Spiegel, Hals und Ohren, beim Grasen mit gesenktem Kopf) und Wildschweine (2–4; dunkel, gedrungen, mit Borstenkamm, Rüssel und Hauern). Sie grasen, gehen ein paar Schritte (26 px/s) und ziehen alle 16–34 s 220–480 px weiter (nur über offenen Boden, nie in die Zone); Zurückgebliebene traben hinterher. Kommt eine Einheit näher als 180 px (Infanterie), 320 px (Fahrzeug) oder 280 px (Hubschrauber) oder knallt es in 380 px, flieht das **ganze Rudel** im Galopp (Reh 170, Wildschwein 130 px/s) 350–520 px weit und grast danach wieder. Sichtbar nur in Sicht (nicht im erkundeten Nebel): wer Tiere aus dem Nebel fliehen sieht, ahnt, wo der Gegner fährt. 2D von oben, Iso in der Seitenansicht mit Beinbewegung. `BALANCE.animals`, `js/game/animals.js`, eigener Zufall je Seed.
- Platzierungsvorschau grün/rot mit Bauradien aller eigenen FOBs.
- **Isometrische Ansicht** (Taste V, drehbar in 90°-Schritten mit `,` `.`): Boden schräg, Gebäude, Bäume und Fahrzeuge mit Höhe, Tiefensortierung, Hubschrauber schweben mit Schatten. Stadtgebäude (Häuser aus Kenney „City Kit Commercial“, Hallen und Fabriken aus „City Kit Industrial“; 3D-Modelle, vorgerendert isometrisch, Daten `js/render/isodata.js`), Bäume sowie LKW und Baufahrzeug (Team Blau/Rot, 8 Blickrichtungen) sind Bilder aus freien Kenney-Paketen (CC0, `assets/iso/`, Lizenztexte `assets/LICENSES/`, `js/render/isosprites.js`; `?sprites=0` schaltet auf die gezeichnete Variante). Spielgebäude und Panzer sind gezeichnet und mit Details versehen: Stadthäuser mit zwei Stockwerken, Fenstern, Tür, Balkon und Satteldach; Hallen mit Rolltoren und Fensterband; Fabriken mit großen Fenstern, Toren, Schornstein; FOB als **Zentrale** (Sockelbau mit Fensterband, Eingang mit Vordach, Leitstellenturm, Radar, Antennen, Flagge); Fahrzeughalle als **Panzerwerkstatt** (Tore mit Panzer, Teamband, Dachkran); Landeplatz mit H, Ring, Randfeuer, Windsack. Unter Zoom 0,5 entfallen Fenster und Türen (Leistung). Die Zeichnung ist pro Gebäudeart durch Sprites ersetzbar (`spriteOverrides` in `js/render/isobuild.js`).
- **Grafik (Iso):** Kampfpanzer (Leopard-2-Anmutung), Schützenpanzer (Puma-Anmutung), Little Bird und AH-64 erscheinen in der isometrischen Ansicht als gerenderte 3D-Modelle in 8 Richtungen und Teamfarbe. Panzer, Schützenpanzer und Little Bird sind eigene Entwürfe nach Fotos (Quelle und Ablauf: `tools/render-models`); der AH-64 ist „Attack Chopper“ von Geibu3D (CC BY 4.0, Namensnennung in `assets/LICENSES`). Der **Wachturm** (`buildings/tower-r0…r3.png`, je Drehung der Ansicht ein Bild) ist ein eigener Entwurf nach einem Bild. Der Transporthubschrauber bleibt gemalt.
- **Wetter** (§7): oben neben der Uhr ein Symbol (Sonne, Regenwolke, Nebel, Schneeflocke) mit Jahreszeit und Wetter (Tablet und PC; Telefon nur das Symbol); Antippen meldet die Wirkung („Winter, Nebel: Sicht −35 %, Fahrzeuge −10 %“). Regen, Schnee und Nebel liegen über der Karte (unter Lebensbalken und Hinweisen), Herbst- und Winterfarben gelten in 2D, Iso und auf der Minimap.
- **Fluss** (§7): Brücken aus Beton mit Fahrbahn, Bordsteinen, Geländer und Pfeilern (Iso als 3D-Körper auf Fahrbahnhöhe); beschädigt mit Brandflecken und Lebensbalken, eingestürzt nur noch Stümpfe mit gezackten Kanten und Trümmern im Wasser, im Wiederaufbau ein Holzgerüst mit Fortschritt. Furten zeigen helleres, seichtes Wasser und rot-weiße Pfosten. Minimap: Brücken als helle Striche, eingestürzte rot gestrichelt.
- **Forschung** (§7): Die Auswahl der Haupt-FOB zeigt „Stufe n von 3“ mit den erforschten Verbesserungen und die laufende Forschung mit Fortschrittsbalken; der Knopf „Forschung“ leuchtet, solange sie läuft. Gesperrte Einheiten sind ausgegraut mit Grund.
- Hilfe (F1) listet alle Tasten, auch V und Drehen.

## 9a. Karten und Karteneditor

- **Karte pro Spiel:** *Zufall* erzeugt bei jedem Start eine Karte aus einem Seed (`?seed=N` = feste Karte). *Gespeichert* nimmt eine eigene Karte aus dem Browser-Speicher (localStorage `frontline-karten`), die Auswahl merkt sich das Menü. *Neue Karte* öffnet den Editor mit leerer Karte. Gespeicherte Karten lassen sich im Menü bearbeiten, löschen und aus einer JSON-Datei importieren.
- **Kartenformat (JSON):** `name`, `obstacles` (Kreise: Wald = gerader Radius, Fels = ungerader), `town` (`roads`, `buildings` mit `kind` house/factory/hall/tower/train, `parks`, `cars`, `trees`, `rail`, `fields`: Rechtecke `{x, y, w, h, angle?, kind: field|pasture, crop: wheat|green|soil|rape}`, höchstens 300; fehlt bei älteren Karten = keine), `trees`, `spawns` (genau 2), `zone` (Mitte und Radius), `crates` (Versorgungskisten, Punkte, höchstens 24; fehlt bei älteren Karten = keine), optional `relief` (Gelände, siehe §7), optional `fords` (Furten, Kreise `{x, y, r}`, r 60–400, höchstens 24) und `bridges` (Brücken, Linien `{x1, y1, x2, y2}`, 96–900 px lang, höchstens 24). Karten sind **nicht** gespiegelt; `Game({ map })` nimmt jede gültige Karte (`js/game/mapdata.js`: Normalisieren, Prüfen, Speicher).
- **Editor** (`editor.html`, 2D, Maus und Touch): Werkzeuge Hand, Wählen, Löschen; Haus, Fabrik, Halle, Wachturm; Lok, Waggon, Kesselwagen, Bahnsteig, Bahnhof, Gleis (ziehen wie eine Straße); Straße und Feldweg (ziehen), Park, **Feld** (Acker oder Weide; Inspektor: Breite, Höhe, Drehen in 15°-Schritten, „Frucht“ schaltet Weizen → junge Saat → gepflügt → Raps → Weide weiter, neue Felder übernehmen die zuletzt gewählte), Baum (ziehen malt eine Reihe), Wald, Fels, Auto; **Gelände: Heben, Senken, Glätten, Ebnen** (Pinsel); **Fluss: Fluss** (ziehen gräbt ein Flussbett mit Ufern wie der Generator), **Furt** (auf den Fluss tippen, hebt das Bett auf seichtes Wasser), **Brücke** (von Ufer zu Ufer ziehen, Enden rasten an Straßen ein; Inspektor zeigt Länge); Startpunkt Blau/Rot und Konfliktzone verschieben; **Kiste** (Versorgungskiste setzen, der Inspektor zeigt den Abstand zu beiden Starts). Gewähltes Objekt: verschieben, Größe/Breite/Höhe, drehen, Art/Farbe, Kopie, Löschen; Straßenenden ziehbar. Rückgängig/Wiederholen (60 Schritte, Strg+Z/Y), Zoom (Rad, Zwei-Finger), Verschieben (Hand, rechte Maustaste, ein Finger auf leerem Grund), Zufallskarte als Ausgangspunkt, Leer, Import/Export als Datei, Speichern, **Spielen**.
- **Geländepinsel:** Gedrückt halten oder ziehen; Heben/Senken mit 150 Höhe/s in der Pinselmitte (Stärke sanft ×0,45, mittel ×1, stark ×2), Glätten gleicht an die Nachbarn an, Ebnen zieht auf die Höhe am Startpunkt des Strichs (z. B. ein Weg über einen Hügel). Pinselgröße 256 … 1536 px (Knöpfe oder `[` `]`), Kreis zeigt den Pinsel auf dem Gelände. Unter dem Wasserspiegel entsteht ein See, steile Hänge werden Fels. Eine flache Karte bekommt beim ersten Strich ein Höhenraster; „Alles eben“ entfernt es. Jeder Strich ist ein Rückgängig-Schritt. Die Statuszeile zeigt Höhe und „steil“/„unpassierbar“/„See“ unter dem Zeiger. 2D zeigt das Gelände wie im Spiel (Kacheln, nur geänderte werden neu gezeichnet), Iso mit WebGL in 3D.
- **Ansicht:** 2D oder isometrisch (Knopf bzw. V, Drehen mit , und .). Iso nutzt den Spiel-Renderer mit einem leeren Hilfsspiel; Straßen, Parks und Bahn werden nach dem Loslassen neu gezeichnet.
- **Straßen:** Beim Ziehen rasten Start und Ende an Enden und Mittellinien anderer Straßen ein; wo Straßen sich kreuzen oder aufeinandertreffen, wird eine Kreuzungsfläche gezeichnet (ohne Mittellinie).
- **Gleise:** freie Strecken (`town.rails`, Liste von Linien), wie Straßen gezogen; Enden rasten an Enden und Gleisen ein. Wo Gleise sich treffen oder kreuzen (Abzweig, Weiche, Kreuzung), entsteht ein durchgehendes Schotterbett, damit sich Bahnhöfe bauen lassen. Gleise sind begehbar und nur Dekoration; Zugteile (Lok, Waggon, Kesselwagen) werden einzeln gesetzt und blockieren. Ältere Karten mit einer Bahnlinie (`rail`) werden beim Laden zu einer Strecke. Die Zufallskarte hat weiter eine Strecke quer durch die Zonenmitte.
- **Bahnhof:** Lok, Waggon und Kesselwagen setzen sich beim Tippen auf ein Gleis in Gleisrichtung (auch schräg), Waggons schließen an ein Zugteil an. Der **Bahnsteig** (begehbar, mit Dach auf Stützen) legt sich parallel neben das nächste Gleis. Das **Bahnhofsgebäude** (Satteldach, Uhrenturm, Tore; blockiert) setzt sich neben gerade, waagerechte oder senkrechte Gleise; Bahnhof lässt sich um 90° drehen. Gedrehte Zugteile und Bahnsteige (`angle`) lassen sich im Inspektor in 15°-Schritten drehen; gedrehte Zugteile sperren ihr umschließendes Rechteck.
- **Prüfung:** Startpunkte brauchen 180 px freien Platz (auch kein Steilhang oder Wasser) und Abstand zum Rand, die Startpunkte mindestens 2500 px Abstand, von Start 1 müssen Zonenmitte und Start 2 erreichbar sein (Pfadsuche, Gelände eingeschlossen, Furten passierbar, Brücken offen). Brücken dürfen höchstens 900 px lang sein und beide Enden müssen auf festem Grund liegen. Ist die Karte spielbar, nennt „Prüfen“ die Zahl getrennter Zugänge zur Zone je Seite (bis „4+“) und warnt unter 2. Speichern geht immer, **Spielen** nur bei bestandener Prüfung.

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
- **Formation:** Angriffswellen marschieren im **Keil** (§8): Panzer vorn, alle kommen zusammen an statt nacheinander.
- **Sendemast:** Ab 12 min (Schwer 9 min, Leicht nie) spart die KI auf einen Sendemast (keine Kampfeinheiten, außer bei Alarm an der Haupt-FOB) und setzt ihn 220–460 px hinter die Haupt-FOB (weg von der Zone). Steht ein gegnerischer Mast (schon die Baustelle), greift sie ihn an: erst sammelt sich die Armee (höchstens 40 s oder bis 70 % im Umkreis von 600 px), dann gehen alle ohne Formation auf den Mast los, nahe Einheiten greifen ihn direkt an; die Zonenwelle entfällt so lange. Siegt ihr eigener Mast voraussichtlich früher, verteidigt sie stattdessen.
- **Kommandeur:** zieht nie mit der Welle, sondern steht 220 px hinter dem Schwerpunkt der Armee draußen (Richtung Haupt-FOB), damit seine Aura wirkt; ohne Armee draußen wartet er am Sammelpunkt. Sind sichtbare bewaffnete Gegner näher als 450 px, weicht er zur Haupt-FOB aus. Fällt er, bildet die KI ab 90 s Spielzeit einen neuen aus, sobald danach noch 300 Geld übrig bleiben. Er holt keine Kisten und besetzt keine Häuser.
- **Wetter** (Normal und Schwer): Bei schlechter Sicht (unter 90 %, also Regen, Nebel, Schnee) bildet die KI den Späher schon ab 90 s Spielzeit und 5 Kampfeinheiten aus. Im Nebel (Sicht höchstens 70 %) nutzt sie die Deckung: die Welle geht schon mit 85 % der geforderten Stärke los.
- **Forschung** (wenn eingeschaltet): Ab 150 s (Leicht 240 s, Schwer 90 s) spart die KI auf Stufe 2, ab 540 s (Leicht 720 s, Schwer 420 s) auf Stufe 3 (keine Kampfeinheiten bis dahin, außer bei Alarm an der Haupt-FOB). Verbesserungen (Normal und Schwer, der Reihe nach Schutzwesten, Wärmebildoptik, Verbundpanzerung) forscht sie nur, wenn danach noch 400 Geld übrig bleiben. Gesperrte Einheiten bildet sie nicht aus (auch keinen Späher vor Stufe 2).
- **Brücken** (Fluss an): Alle 10 s prüft die KI eingestürzte Brücken, die näher an ihrer Haupt-FOB als am gegnerischen Start liegen, und schickt das nächste freie Baufahrzeug zum Wiederaufbau, wenn danach noch 150 Geld übrig bleiben. Sie sprengt selbst keine Brücken; Wege über Furten nimmt ihre Wegsuche von selbst, wenn die Brücken fehlen.
- **Häuserkampf:** Bis zu 40 % der Infanterie in der Zone besetzen Häuser in der Nähe und halten sie (§7).
- **Versorgungskisten:** Alle 6 s (nach den Angriffsbefehlen) schickt die KI freie Soldaten (untätig oder auf dem Weg zum Sammelpunkt, nicht in Häusern oder beim Überfall) zu Kisten aus ihrem Lagebild (§7) im Umkreis von 4500 px; Soldaten in der Zone gelten als 800 px weiter weg (sie verdienen dort Geld). Kisten mit sichtbaren Gegnern in der Nähe lässt sie liegen. Gleichzeitig holen oder tragen Leicht 1, Normal 2, Schwer 3 Soldaten. Kistenträger zählen nicht zur Armee.
- **Schwierigkeit über Verhalten:** *Leicht*: langsame Denkschritte (3 s), hohe Angriffsschwelle, kein Späher, kein Konter-Mix, keine Überfälle, kein Rückzug, kein Wetter, Einkommen ×0,8. *Normal*: 2 s, Späher, Konter-Mix und Wetter. *Schwer*: 1 s, niedrigere Angriffsschwelle, dazu Überfälle und Gruppen-Rückzug; **kein Einkommensbonus mehr** (vorher ×1,25).

### KI-Konstanten (Quelle: `js/data/ai.js`, `BALANCE.difficulty` in `js/data/balance.js`; hier zum Nachschlagen für Erweiterungen)

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
| Wetter | schlechte Sicht unter (`WX_SCOUT_SIGHT`): Späher ab / Mindestarmee · Nebel bis (`WX_FOG_SIGHT`): Wellenstärke | 90 % : 90 s / 5 Einheiten · 70 % : 85 % |
| Forschung | Stufe 2 / Stufe 3 ab (`research`) · Verbesserungen (`upgrades`) · Reserve danach (`UPGRADE_RESERVE`) | Leicht 240 / 720 s · Normal 150 / 540 s · Schwer 90 / 420 s · ab Normal · 400 Geld |
| Brücken | Takt (`BRIDGE_EVERY`) / Geld danach (`BRIDGE_RESERVE`) | 10 s / 150 Geld |
| Flankenangriff | Mindestbesatzung / Anteil | 12 / 30 % |
| Gruppen-Rückzug | Wertverhältnis / Mindestgegner / Strecke / Angriffssperre | 1,8 / 4 / 1400 px / 30 s |
| Expansion | FOB-Grenze Leicht/Normal/Schwer · Relais-Abstand · Flanken-FOB-Abstand | 3/5/7 · 1000 px · 1000 px |
| Bedrohung | Reaktionsreichweite / FOB-Gefahrenradius | 900 px / 600 px |
| Baustellen | Abriss ohne Material / Sperre fehlgeschlagener Orte | 200 s / 240 s |
| Mauer | Abstand von der Haupt-FOB / halbe Länge | 4 / 3 Zellen (Tor in der Mitte) |
| Rückzug (Vorrat) | Einheiten unter diesem Vorratsanteil ziehen sich zurück | 20 % |
| Häuserkampf | Anteil der Infanterie in der Zone / Umkreis / Takt (`GARRISON_SHARE`, `GARRISON_RANGE`, `GARRISON_EVERY`) | 40 % / 500 px / 8 s |
| Versorgungskisten | Takt / Umkreis / Holer gleichzeitig Leicht–Normal–Schwer (`CRATE_EVERY`, `CRATE_RANGE`, `difficulty.cratePickers`) | 6 s / 4500 px / 1–2–3 |

## 11. Qualitätsanforderungen

- 60 FPS bei ~200 Einheiten auf einem normalen Laptop. Simulation mit fester Schrittweite (20 Hz), unabhängig vom Rendern.
- Simulation ohne DOM lauffähig (Node-Tests, KI-gegen-KI-Durchlauf).
- Deterministisch bei gleichem Seed (`?seed=123`). `?debug=1`: Karte aufgedeckt, Ressourcen-Cheat, Geschwindigkeit bis 10×.
- Eigenständig nach den Regeln des Repos (eigenes Manifest, Service Worker mit Präfix `frontline-`, eigene Tests/Workflow).
- Service Worker network-first: online immer die neueste Version, offline aus dem Cache.

## 12. Priorisierung

- **Must:** alles in 2–9, KI aus 10, Sieg/Niederlage, Pause.
- **Should:** Nebel des Krieges, Kontrollgruppen, Doppelklick-Auswahl, Hilfe-Overlay, PWA/offline.
- **Could:** Statistik am Spielende. (Sound ist seit v4.59 gebaut, §14.)

## 13. Geparkte Ideen (nicht bauen)

Ideen von Daniel, die festgehalten, aber **noch nicht umgesetzt** werden. Gebaut wird erst auf sein Zeichen, dann zuerst mit einem Vorschlag zur Ausgestaltung.

- **SimCity-Bevölkerung** (2026-10-26): Frontline um SimCity-Fähigkeiten erweitern. Wer mehr Bevölkerung hat, lässt sie in Fabriken und Förderanlagen arbeiten und bekommt dadurch mehr Ressourcen. Offen: woher die Bevölkerung kommt, Arbeitsplätze je Gebäude, Wirkung auf die Ressourcen, Verhalten der KI.
- **Häuserkampf ausbauen** (2026-10-27): Die Grundform gibt es seit v4.43 (§7 „Häuserkampf“: Infanterie besetzt Stadthäuser, schießt aus den Fenstern, Häuser stürzen unter Beschuss ein, die KI besetzt Häuser in der Zone). Offen: was darüber hinaus kommen soll, z. B. Kampf von Raum zu Raum, Sprengen oder Stürmen besetzter Häuser, Ausbau von Häusern zu Stellungen.
- **LLM für dynamische Gegner und Dialoge** (2026-10-27): Ein Sprachmodell soll im Spiel aktiv mitwirken, z. B. KI-Gegner, die auf die Lage reagieren, und Dialoge von Kommandeur und Meldungen. Offen: welches Modell und wo es läuft (Gerät oder Server, Offline-Tauglichkeit der PWA), Kosten und Datenschutz, wie die Antworten die Regeln nicht brechen, und ob die heutige KI als Rückfall bleibt.
- **Musik** (2026-10-29): Hintergrundmusik zum Ton aus §14 (bisher nur Geräusche). Offen: Stil (Marsch, Ambient, dynamisch je Lage), Lautstärkeregler statt nur An/Aus.

## 14. Ton (seit v4.59)

Alle Geräusche werden im Browser mit WebAudio **selbst erzeugt** (Rauschen und Schwingungen, `js/audio/sound.js`): keine Audiodateien, keine fremden Lizenzen, sofort offline da. Der Ton liest nur (`game.effects`, Meldungen, Wetter) und ändert nichts am Spiel; die Simulation hängt Effekten nur einen Hinweis `snd` an (Waffen-ID, Rüstungsklasse eines Gefallenen oder `building`).

- **Schalter:** Lautsprecher-Knopf oben (🔊/🔇), Taste **F2** und im Startmenü „Ton“ An/Aus; gemerkt unter `frontline-ton`, Standard An. Aus = der AudioContext schläft, kein Rechenaufwand. Der Browser erlaubt Ton erst nach der ersten Berührung oder Taste, das ist das Startmenü.
- **Waffen:** eigener Klang je Waffe (Gewehr, MP, MG, Scharfschützengewehr, Kanone, Granatwerfer, RPG, Raketen, Flak, SAM, Basis-MG, Mörser), Tonhöhe leicht zufällig, damit Salven nicht nach Maschine klingen.
- **Einschläge und Gefallene:** kleine, mittlere und große Explosion (Treffer einer Panzerabwehrwaffe, Fahrzeug, Einschlag/Gebäude), Soldaten leise, abgeschossene Hubschrauber mit Absturzpfeifen, abgefangene Granate als Zing.
- **Dauergeräusche:** Regen, Wind (Schnee, Nebel, Winter), Hubschrauber-Rotor und Dieselbrummen fahrender Fahrzeuge im Bild; dazu im Regen gelegentlich Donner. Pegel blenden weich über.
- **Meldungen:** Ausbildung fertig (zwei Töne), Bau fertig, Alarm bei „Basis wird angegriffen“, Münze bei Prämien, leiser Hinweiston für übrige Meldungen; Klick auf HUD-Knöpfe, Bestätigung von Marsch-, Angriffs- und Baubefehlen; Fanfare bei Sieg, Trauermarsch bei Niederlage.
- **Raumklang:** Stereo-Position und Lautstärke nach der Lage auf dem Bildschirm; außerhalb des Bilds leiser, weit weg stumm; Gegner im Nebel bleiben stumm (wie in der Grafik). Gleiche Geräusche werden gedrosselt und die Zahl gleichzeitiger Geräusche begrenzt (große Schlachten bleiben schlank, Explosionen haben Vorrang); ein Kompressor verhindert Übersteuern. Pause, Tabwechsel und Spielende halten die Dauergeräusche an.

## Änderungsverlauf
- v4.72: **Fehlende Dachhälften in Iso behoben** (reine Optik): Satteldächer von Häusern, Fabriken und der Fahrzeughalle zeichneten nur die dem Betrachter zugewandte Dachhälfte; die abgewandte Schräge wurde fälschlich als Rückseite verworfen, obwohl sie von oben sichtbar ist (der flache Quaderdeckel schien durch). Jetzt werden beide Hälften gezeichnet (abgewandte zuerst), nur der abgewandte Giebel entfällt. Gilt für alle vier Drehungen. Außerdem entfallen die drei Hallen-Bilder mit offener Dachrückseite (Sägezahn- und Bogendach: `ind_building-g/-j/-k`, in `js/render/isodata.js` und `sw.js` entfernt); die übrigen sieben Hallenmodelle bleiben. Cache v85.
- v4.70: **Lichtstimmung** (§7, rein grafisch, Idee: Licht als Stimmung): im Startmenü „Licht“ (Aus · Zufall · Morgen · Tag · Abend · Nacht, gemerkt, Standard Zufall). Eine Tönung über der Welt (Multiplikation, Lichtschein von einer Seite, dunkle Ränder; `js/render/mood.js`, drei Füllungen je Frame, Verläufe zwischengespeichert), in 2D und Iso, nicht auf der Minimap. Zufall wählt aus dem Seed nach Jahreszeit gewichtet (Sommer meist Tag, Herbst viel Abend, Winter Morgen und Nacht). Keine Wirkung auf Sicht, Wetter, KI oder Simulation. Debug: `?debug=1&mood=night`. Cache v83.
- v4.69: **Alle übrigen Fahrzeuge neu gemalt** (rein grafisch): LKW (Fahrerhaus, Plane, sechs Räder), Baufahrzeug (Pickup mit Kran und Rundumleuchte), Kampfhubschrauber (Rotor, Stummelflügel, Raketenbehälter) und Little Bird (Kuppelrumpf, Kufen) bekommen wie Panzer und Schützenpanzer gemalte Bilder in 8 Richtungen und zwei Teamfarben. Die fremden Modelle (Attack Chopper, Kenney-Fahrzeuge) entfallen samt Lizenzdatei. Erzeugt `tools/gen-troops.mjs`. Keine Regeländerung. Cache v82.
- v4.68: **Flakpanzer, Flugabwehrrakete und Transporthubschrauber als Bilder** (rein grafisch): Die drei Einheiten hatten in der Iso-Ansicht nur gezeichnete Formen und bekommen wie Panzer und Schützenpanzer gemalte Bilder in 8 Richtungen und zwei Teamfarben (Flak mit Doppelrohr und Radar, SAM mit vier Raketen, Transporter als Tandemrotor-Hubschrauber); ihre Wracks nutzen dieselben Bilder. Keine Regeländerung. Cache v81.
- v4.67: **Neue Bilder für Kampfpanzer, Schützenpanzer und Infanterie** (rein grafisch): Panzer, Schützenpanzer, Schütze, Panzerabwehr und Scharfschütze (und damit der Kommandeur) sind neu gemalt (Modelle aus einfachen Körpern, Licht von links oben, glattere Formen, Ketten mit Schürzen, Antennenwimpel und Weste in Teamfarbe, Scharfschütze im Tarnanzug aus Büscheln). Weiterhin 8 Richtungen und zwei Teamfarben, gleiche Dateinamen. Keine Regeländerung. Cache v80.
- v4.66: **Gemalte zivile Autos** (rein grafisch): Die geparkten Autos der Stadt werden in der Iso-Ansicht als gemalte Bilder gezeichnet (drei Formen: Limousine, Kombi, Transporter, in den sieben Lackfarben, Ausrichtung folgt der Ansichtsdrehung, Scheinwerfer, Räder, Fenster, Schatten). Bilderblatt `assets/iso/cars/cars.png` erzeugt `tools/gen-cars.mjs`. Keine Regeländerung. Cache v79.
- v4.65: **Geröll auf Zufallskarten** (rein grafisch): An steilen Hängen und auf Gipfeln liegen kleine gemalte Felsbrocken (fest nach Lage, nicht im Wasser; Zufallskarten bleiben je Seed unverändert, Wege und Sicht unberührt). Cache v78.
- v4.64: **Gemalte Felsen und Büsche** (rein grafisch): Felsen (Hindernisse mit ungeradem Radius, nur in Editor-Karten) werden in der Iso-Ansicht als gemalte Bilder gezeichnet (vier Varianten, große Felsen mit kleineren Begleitern, im Winter mit Schneeschicht). Neu: Büsche (drei Varianten) am Rand der Wälder und neben einem Teil der verstreuten Bäume, nur Optik, sie blockieren nichts; Herbst/Winter-Färbung wie bei Bäumen. Bilder erzeugt `tools/gen-rocks.mjs`. Keine Regeländerung. Cache v77.
- v4.61: **Startaufstellung nach Truppengattung** (§2): die Starteinheiten stehen nicht mehr als Klumpen vor der FOB, sondern in Gruppen um sie verteilt (Kampfpanzer und Schützenpanzer vorn zur Kartenmitte, Schützen links, Panzerabwehr rechts, LKW und Baufahrzeug hinten, Kommandeur dicht hinter der FOB; Flak/SAM und Hubschrauber hätten eigene Plätze hinten). Beide Teams gleich gespiegelt, Anzahl, Kosten und 3-LKW-Start unverändert. Einstellbar in `BALANCE.startLayout`. Cache v74.
- v4.62: **Schönere Bäume in der Standardansicht** (rein grafisch): In der unrotierten Iso-Ansicht werden Bäume als eigene gemalte Bilder gezeichnet (drei Laubbaum-Varianten und eine Fichte, je Baum fest nach Position, Herbst/Winter-Färbung wie bisher). In den gedrehten Ansichten bleibt der bisherige Block-Baum. Bilder erzeugt `tools/gen-trees.mjs`. Keine Regeländerung. Cache v75.
- v4.63: **Gemalte Bäume in allen Drehungen** (rein grafisch): Die Bäume aus v4.62 werden auch in den gedrehten Ansichten gezeichnet (aufrechte Kronen, Licht fest von links oben); der Block-Baum dient nur noch als Ladeersatz. Kein Mehraufwand beim Zeichnen, keine neuen Dateien. Cache v76.
- v4.60: **Telefon-Layout quer** (§9): bei Bildschirmhöhe ≤ 520 px kompakte Kopfleiste und Bodenleiste (≈ 110 statt 190 px), Auswahl/Befehle einklappbar (Knopf „▾“), Kamera zentriert Ziele im unverdeckten Bereich, keine hängenden Tooltips auf Touch; Spielregeln unverändert. Cache v73.
- v4.59: **Ton** (§14): selbst erzeugte Geräusche für Waffen, Einschläge, Fahrzeuge, Hubschrauber, Wetter und Meldungen, Schalter im HUD (Taste F2) und im Startmenü; Spielregeln unverändert. Cache v72.
- v4.58: **Config vollständig gebündelt** (Spielverhalten und Zufallskarten je Seed unverändert): Kurznamen der Befehlskarte als `short` in `units.js` und `buildings.js`; verstreute Spielwerte (Bauplatz-Sicht, Baustellen-HP, Bohrer-Mindesttreibstoff, Einsteigen und Absetzen, Kistenträger, Meldetakt „Basis wird angegriffen“, Tiere) in `BALANCE`; die Werte des Kartengenerators (Hügel, Seen, Fluss, Stadt, Gehöfte, Kisten-Abstände) in `js/data/mapgen.js`. Cache v71.
- v4.57: **Absicherung der Config** (Spielverhalten unverändert): `test/config.test.js` prüft `js/data/` auf Tippfehler und Widersprüche (`npm run test:quick`, Sekunden). Die Tabellen in §6 („Werte“, „Waffen und Schaden“) erzeugt jetzt `npm run docs` aus der Config; ein Test meldet, wenn sie veralten. Dabei kamen Flakpanzer und SAM-Startrampe in die Wertetabelle, die dort fehlten.
- v4.56: **Doku und Config für Erweiterungen** (Spielverhalten unverändert). Neu: `CLAUDE.md` (Regeln, Wegweiser „Wo ändere ich was?“, Feature-Landkarte, Rezepte) und `ARCHITEKTUR.md`; der alte Plan liegt als `docs/verlauf.md`. In `js/data/balance.js` stehen oben die **Schnelleinstellungen** (`QUICK`: Einheitenlimit, Geld pro Sekunde, Startgeld, Siegpunkte, Sendemast-Zeit …) und ein Inhaltsverzeichnis; die KI-Werte liegen in `js/data/ai.js`, die Werte je Schwierigkeit (FOB-Grenze, Sendemast ab, Kistenholer) und die Startmenü-Standards in `BALANCE`. Cache v70.
- v4.54: **Flak, SAM und 300er Einheitenlimit.** Das Einheitenlimit steigt von 50 auf **300 Plätze** (`BALANCE.slotCap`). Neu: **Flakpanzer** (Taste J, Stufe 2, 2 Plätze, Schnellfeuer-Flak mit 20 Munition je Schuss; Trefferchance sinkt mit dem Tempo des Ziels, `BALANCE.airFire`) und **SAM-Startrampe** (Taste N, Stufe 3, 2 Plätze, wärmesuchende Raketen mit 250 Munition je Rakete und 10 s Nachladezeit). Beide schießen nur auf Hubschrauber; die KI baut sie noch nicht. Die Kopfleiste ist auf Tablets (≤ 1500 px) 68 px hoch, damit die Geld-pro-Sekunde-Zeile im schwarzen Balken bleibt. Cache v67.
- v4.53: **Fluss mit Brücken und Furten** (§2, §7, §8, §9, §9a, §10, Vorschlag nach den Flusskarten aus Age of Empires II und den Brücken aus Company of Heroes): auf Zufallskarten liegt vor jeder Startecke ein Fluss mit 3 Brücken und 2 Furten (halbes Tempo). Brücken werden nur auf Befehl beschossen (A + Klick), stürzen ein und sperren den Übergang, bis ein Baufahrzeug sie für 200 Geld in 30 s wieder aufbaut. Die KI baut Brücken auf ihrer Seite wieder auf. Editor: Werkzeuge Fluss, Furt und Brücke. Im Startmenü schaltbar (Standard An). Cache v65.
- v4.52: **Forschungsstufen** (§2, §6, §7, §8, §9, §10, Vorschlag nach Age of Empires II und Empire Earth): die Haupt-FOB forscht neben der Ausbildung (Taste U). Stufe 2 schaltet Scharfschütze, Schützenpanzer und Hubschrauber frei, Stufe 3 Kampfpanzer und AH-64; dazu Schutzwesten (Infanterie −15 % Schaden), Wärmebildoptik (Reichweite und Sicht +10 %) und Verbundpanzerung (Fahrzeuge und Hubschrauber −15 % Schaden). Im Startmenü schaltbar (Standard An), die Startarmee bleibt. Die KI forscht nach Zeitplan je Schwierigkeit. Cache v64.
- v4.51: **Wetter und Jahreszeiten** (§2, §7, §9, §10, Vorschlag nach Empire Earth II): Sommer, Herbst oder Winter je Partie, wechselndes Wetter (Regen, Nebel, Schnee) senkt die Sicht um 20–35 %, Schneefall und Winterboden bremsen Bodenfahrzeuge; im Startmenü wählbar (Standard Zufall, eigener Zufall je Seed). Herbst- und Winterfarben in 2D, Iso und Minimap (Schnee auf Bäumen, Fels und Ufer, Eisrand an Seen), Regen, Schnee und Nebel im Bild, Wetteranzeige oben. Die KI (Normal, Schwer) schickt bei schlechter Sicht früher einen Späher und greift im Nebel mit weniger Stärke an. Cache v63.
- v4.50: **Sendemast** (§2, §5, §7, §10, Vorschlag nach dem Wunder aus Age of Empires II): zweite Siegbedingung, im Startmenü schaltbar. Einer je Team, fertig für den Gegner überall sichtbar, 5 min halten = Sieg; Restzeit oben in der Kopfleiste. Die KI baut ihn und greift gegnerische Masten gesammelt an. Kopfleiste auf Tablet (bis 1500 px) und Telefon (bis 1000 px) gestrafft, damit Uhr und Knöpfe nicht mehr abgeschnitten werden. Cache v62.
- v4.49: **Kommandeur** (§6, §10, Vorschlag nach dem Strategen-Helden aus Empire Earth und dem Königsmord-Modus aus Age of Empires II): einmalige Heldeneinheit je Team ohne Platzbedarf; Aura 300 px (10 % schneller schießen, Infanterie heilt), sein Tod bringt dem Gegner 5 Punkte, Haupt-FOB bildet ihn neu aus (C). Die KI hält ihn hinter der Armee. Nebenbei: Scharfschützen (und der Kommandeur) steigen jetzt auch in LKW, Baufahrzeug und Schützenpanzer, wie es §6 für Infanterie vorsieht (vorher nur in Hubschrauber). Cache v61.
- v4.48: **Formationen** (§8, §10, Vorschlag nach Age of Empires II): Linie, Keil und Kolonne für Marsch- und Angriffsbefehle (Taste F), Panzer vorn, Infanterie dahinter; die Gruppe marschiert geschlossen im Tempo der langsamsten Einheit und rückt am Ziel genau auf ihre Plätze. Die KI greift im Keil an. Locker bleibt der Standard. Cache v60.
- v4.47: **Tiere** (§9, Vorschlag nach den Jagdtieren aus Age of Empires II): Rehe und Wildschweine in Rudeln auf den Wiesen außerhalb der Zone; sie grasen, ziehen weiter und fliehen vor Einheiten und Explosionen (das ganze Rudel). Rein optisch, nur in Sicht. Cache v59.
- v4.46: **Felder, Weiden, Feldwege** (§7, Vorschlag nach den Farmen aus Age of Empires II): Gehöfte mit Äckern (Weizen, junge Saat, gepflügt, Raps) und Weiden um die Einzelhäuser, freie Flure, Feldwege zur nächsten Straße; nur Boden. Kartenformat `town.fields`, Editor-Werkzeug „Feld“. Cache v58.
- v4.45: **Sichtbarer Schaden** (§9, Vorschlag nach Age of Empires II / Empire Earth): Rauch und Feuer an beschädigten Gebäuden, Häusern und Fahrzeugen; ausgebrannte Wracks zerstörter Fahrzeuge und Hubschrauber, verkohlte Trümmer zerstörter Gebäude, Brandflecken und Mörserkrater, in 2D und Iso. Rein optisch, mit Sichtstand je Team, Obergrenzen und Ablaufzeit. Cache v57.
- v4.44: **Versorgungskisten** (§7, Vorschlag nach den Reliquien aus Age of Empires II): 3 Kistenpaare abseits der Zone; Soldaten tragen sie langsam und ohne zu schießen zur eigenen FOB, jede eingelagerte Kiste bringt 1 Geld/s; fällt der Träger oder die FOB, liegt die Kiste wieder am Boden. Lagebild je Team (Minimap), Editor-Werkzeug „Kiste“, K = ablegen, KI holt Kisten. Cache v56.

- v4.43: **Häuserkampf** (§7, Vorschlag nach Company of Heroes / Age of Empires II): Infanterie besetzt Wohnhäuser, Hallen, Fabriken und Bahnhöfe, ist dort geschützt, steht höher und schießt ab der Hauswand; schwere Waffen bringen das Haus zum Einsturz (Besatzung verletzt, Ruine bleibt). Rechtsklick/Tippen oder I zum Besetzen, O zum Verlassen, Schild mit Besatzung über dem Haus, KI besetzt Häuser in der Zone. Gespeicherte Karten behalten die Fabrikmauern (vorher wurden sie beim Laden zu Häusern). Cache v55.
- v4.42: **Weitsicht von oben, Kämme verdecken die Sicht** (§7): Sichtweite wächst mit der Höhe (bis +40 %), Sichtstrahlen über das Höhenraster lassen Täler hinter Kämmen im Nebel. `?debug=1&fog=1` behält den Nebel im Debug. Cache v54.
- v4.41: **Höhenvorteil und Tempo am Hang** (Vorschläge aus Age of Empires II und Empire Earth, §7): bis ±25 % Schaden im Direktfeuer je nach Höhenunterschied, Fahrzeuge bergauf langsamer und bergab schneller (Infanterie schwächer), Wegsuche mit Hangkosten (Talwege), KI bevorzugt Kuppen. Cache v53.
- v4.40: **Hügel, Berge und Seen.** Höhengelände (§7): Zufallskarte mit Bergrücken, Hügeln und Seen, mindestens 3 getrennte Zugänge zur Zone, Zone sanft und frei; Steilhänge, Gipfel und Seen sind unpassierbar. Iso-Ansicht mit WebGL-Gelände (Felsblöcke, Wasser, Licht, Erdschnitt am Rand), 2D/Minimap mit Schummerung. Karteneditor: Heben, Senken, Glätten, Ebnen, „Alles eben“, Zugänge in „Prüfen“. Kartenformat `relief`. Wegfolgen: nahe einer Wegecke bei freier Sicht gleich zum nächsten Wegpunkt (vorher stauten sich Gruppen an derselben Ecke). Cache v52.
- v4.39: **Neue Startarmee und Einheitenlimit in Plätzen.** Start mit 2 Kampfpanzern, 3 Schützenpanzern, 22 Schützen, 7 PAK (+ LKW, Baufahrzeug) statt 40/10 Soldaten; 50 Plätze je Team, MBT = 5, SPz = 3, sonst 1. Soldaten-Nachschub-Schwelle 29. Anzeige in der Haupt-FOB (Plätze x/50) und im Tooltip. Cache v51.
- v4.38: **Scharfschütze** (neue baubare Einheit, Taste T): 1-Schuss-Kill gegen Soldaten, 8 s Nachladen, Reichweite 480, Tarnung (Gegner sehen ihn nur nahe oder 4 s nach einem Schuss); eigenes 3D-Modell nach Ghillie-Foto in 8 Richtungen. Idle-Einheiten schießen bis zur Waffenreichweite statt nur bis zur Leine. Cache v50.
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
