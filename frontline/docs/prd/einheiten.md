# Frontline PRD – Einheiten, Waffen und Schaden

> Teil des PRD, Abschnitte §6 (Wertetabellen erzeugt `npm run docs`). Einstieg und Übersicht aller Teile: [PRD.md](../../PRD.md).
> Neue Regeln hier im passenden Abschnitt eintragen, die Version in [docs/changelog.md](../changelog.md).

## 6. Einheiten

| Einheit | Gebaut in | Rolle |
|---|---|---|
| Schütze | Hauptstadt | Billige Infanterie, stark gegen Infanterie; trägt 50 Baumaterial, baut daraus Mauern und Tore |
| Sanitäter | Hauptstadt, Kaserne | Unbewaffnete Infanterie (90 Geld, Taste K); heilt jede Sekunde 6 HP der am stärksten verletzten eigenen Infanterie im Umkreis von 90 px (nicht sich selbst, nicht in Häusern oder Fahrzeugen) |
| Panzerabwehrsoldat | Hauptstadt | Langsam feuernd, stark gegen Fahrzeuge und Gebäude; baut Mauern und Tore |
| Scharfschütze | Hauptstadt | Getarnt (Ghillie-Anzug), sehr große Reichweite, **ein Treffer tötet jeden Soldaten**, aber nur alle 8 s ein Schuss; gegen Fahrzeuge und Gebäude fast wirkungslos; baut nicht, kann als Passagier mitfahren |
| LKW | Hauptstadt | Unbewaffnet, schnell, **2 Soldaten** Platz. **Logistik:** lädt Ressourcen an einer FOB (400), bringt sie zu einer anderen FOB, pendelt auf Routen, versorgt Truppen im Feld |
| Baufahrzeug | Hauptstadt | Unbewaffnet, **1 Soldat** Platz. Baut alle Gebäude außer FOBs (seit v5.09), repariert |
| Bagger (seit v5.35, Daniels Wunsch) | Hauptstadt (mit Stadt: Fabrikhalle) | **2 Plätze**, 650 HP, langsam (48), leicht gepanzert. Befehl **Baggern (G)**: danach eine Zelle anklicken (Shift: weitere anhängen); der Bagger fährt hin (bis 54 px), arbeitet **6 s** (`BALANCE. Solange er arbeitet, quillt an der Zelle eine Staubwolke auf (seit v5.77, nur Bild).excavator`) und räumt sie: **Zonenstraßen der Karte** verschwinden für beide Seiten (Brückenfahrbahnen nicht; dort kein Straßentempo mehr, Wege und Stadtanschlüsse neu), Bäume und leere Häuser wie mit Räumen, **eigene Stadtgebäude** reißt er ab (Rohstoffvorkommen bleiben). Gegnerische Gebäude zerstört er langsam mit der **Schaufel** (nur Gebäude, 32 Schaden je 1,2 s, Reichweite 34). Seit dem Paket „Straßen“ räumt er auch **Schutt** zerstörter Straßen (die Straße ist wieder da) und **reißt gegnerische Straßen ab** (ohne Schutt, die Zelle ist frei). Befehl `dig` (`js/game/excavator.js`) |
| FOB-Fahrzeug (seit v5.09) | Hauptstadt (mit Stadt: Fabrikhalle) | Unbewaffnet, langsam, **2 Plätze**. **Aufbauen (D):** wird an seiner Stelle sofort zur fertigen FOB mit 20 % Lager je Sorte (§4) |
| Schützenpanzer | Hauptstadt | **6 Soldaten** Platz. Schnell, gut gegen Infanterie und leichte Fahrzeuge |
| Kampfpanzer | Hauptstadt | Teuer, schwer gepanzert, stark gegen alles (Hauptkanone trifft keine Hubschrauber, das MG schwach) |
| Little Bird | Hauptstadt | Unbewaffnet, schnell, **5 Passagiere** (Infanterie, Baufahrzeug) |
| Transporthubschrauber | Hauptstadt | Unbewaffnet, **9 Passagiere** und **400 Ressourcen** (laden/entladen/pendeln wie ein LKW) |
| AH-64 (Kampfhubschrauber) | Hauptstadt | Bordkanone und 10 Raketen (Tabelle oben), 650 HP, 70 Treibstoff; Nachtanken/-laden in einer FOB |
| Flakpanzer (seit v4.54) | Hauptstadt | **2 Plätze**, 300 HP, Schnellfeuer-Flak gegen Hubschrauber, schießt nur auf Luftziele. **20 Munition je Schuss**, Reichweite 330, 0,8 s Kadenz, 40 Schaden je Treffer. **Trefferchance** 85 % gegen ein stehendes Ziel, sinkt mit dessen Tempo (×120 / (120 + Tempo in px/s), also gegen Little Bird bei voller Fahrt rund 35 %), und mit der Entfernung (bis −30 % am Waffenrand). Verfehlte Schüsse kosten trotzdem Munition. |
| SAM-Startrampe (seit v4.54) | Hauptstadt | **2 Plätze**, 350 HP, vier **wärmesuchende Raketen** gegen Hubschrauber (nur Luftziele). **250 Munition je Rakete**, **10 s Nachladezeit** zwischen den Raketen, Reichweite 420, 350 Schaden (Little Bird 1 Treffer, Transporthubschrauber und AH-64 2). Trefferchance 90 %, kein Tempo-Abzug (die Rakete folgt der Wärme), nur Entfernung (bis −30 %). |
| Flakpanzer Gepard (seit v5.19) | Hauptstadt (mit Stadt: Fabrikhalle) | **3 Plätze**, 450 HP, Such- und Feuerleitradar (Sicht 480). **Zwillingskanone 35 mm**: Reichweite 420, 0,35 s Kadenz, 80 Schuss à 8 Munition, Trefferchance 80 % mit Tempo-Faktor speedRef 400 (die Flak hat 120): trifft auch die schnelle **F-16** gut. Bevorzugt Luftziele (32 Schaden gegen Hubschrauber und Flugzeuge), gegen leichte Bodenziele brauchbar (14), gegen Panzer kaum (2). 650 Geld, mit Stadt 100 Stahl und 3 Einwohner, 16 s, Taste **P** (`UNITS.gepard`). Zählt in der Forschung zur Gruppe Gepard und zur Flugabwehr |
| Panzerhaubitze (seit v5.19, nach der Panzerhaubitze 2000) | Hauptstadt (mit Stadt: Fabrikhalle) | **4 Plätze**, 500 HP, langsam. **Haubitze 155 mm**: Granaten bis **1400 px** weit, nicht näher als 260 px, 7 s Kadenz, 30 Schuss à 25 Munition, Splash 75 px (90 gegen Soldaten, 110 leicht, 80 schwer, 140 Gebäude, nichts gegen Luftziele), Streuung bis 70 px um den Zielpunkt, Fluggeschwindigkeit 480 px/s. Sucht Ziele über ihre ganze Reichweite, braucht aber die **Sicht des Teams** (Späher, andere Einheiten, Gebäude). **Feuer auf Punkt (G)** wie der Mörser (Befehl `mortarTarget` mit Einheiten), **Ziel löschen (C)**; Bewegen oder Stopp beendet es. 900 Geld, mit Stadt 140 Stahl und 4 Einwohner, 22 s, Taste **O** (`UNITS.pzh`) |
| F-16 (Kampfflugzeug, seit v5.03) | Stellplatz des Fliegerhorsts (nur mit Stadt, seit v5.35; vorher Flughafen; zwei je Stellplatz) | **Vier Raketen (seit v5.41):** zwei **Luft-Luft-Lenkraketen** nur gegen Hubschrauber und Flugzeuge (700 Schaden) und zwei **Luft-Boden-Raketen** gegen gepanzerte Fahrzeuge (1150 schwer, 650 leicht, bevorzugt), Gebäude (700) und Infanterie (160); beide feuern unabhängig auf eigene Ziele (`parallel`), also bis zu vier Ziele je Einsatz (Reichweite 640 bzw. 600, 2,5 s Kadenz, 150 Munition je Rakete, Trefferchance 92 %). Heim fliegt sie, wenn alle vier verschossen sind (oder der Treibstoff knapp wird). **Fliegerhorst (§15 „Fliegerhorst“, seit v5.35):** ein Flugzeug je Stellplatz, Start und Landung auf einer gebauten Start-/Landebahn, Rollen über Straßen und Bahn, Tanken und Nachladen aus Kerosintank und Munitionslager in der Nähe, abgestellt angreifbar (Schutz je Stufe des Stellplatzes); **3 Plätze**, 450 HP, sehr schnell (420 px/s), fliegt immer (kreist im Abstand 280 px um seinen Befehlspunkt, dreht höchstens 2,4 rad/s). **Treibstoff 55 s Flug** (seit v5.14; Verbrauch auch beim Kreisen, Reichweite ≈ 23 000 px). Fliegt selbst zu ihrem Stellplatz zurück, wenn keine Rakete mehr da ist oder der Treibstoff für den Heimweg × 1,3 + 8 s nicht mehr reicht; dort tankt und lädt sie nach den Raten des Fliegerhorsts (`CITY.air`: Kerosintank 3/s und Munitionslager 6/s in Stufe 1, also rund 18 s für den Treibstoff und 100 s für die 600 Munition; mit Stadt Kerosin aus dem Stadtlager, seit v5.20, sonst aus dem Lager der Hauptstadt) und wird repariert (4 % HP/s). Abgestellt steht sie auf ihrem Stellplatz und ist angreifbar (Schutz je Stufe des Stellplatzes, `CITY.air.shelter`); fällt der Stellplatz, ist sie verloren. Hat sie in der Luft keinen Treibstoff mehr, stürzt sie ab. Ein Befehl (Bewegen, Angriff, Angriffsmarsch) an eine startbereite F-16 lässt sie starten. **Start und Landung wie ein Flugzeug (seit v5.15):** sie rollt vom Stellplatz über den Rollweg zu Bahn 1 (wartet am Haltepunkt, bis die Bahn frei ist; Rolltempo 60 px/s), beschleunigt im Startlauf und hebt bei 62 % ihres Tempos ab, steigt in 3 s auf Reisehöhe (erst geradeaus). Zum Landen fliegt sie eine Platzrunde (Gegenanflug seitlich der Bahn, dann Endanflug mit 55 % Tempo), sinkt im Gleitpfad auf Bahn 2, setzt in der Aufsetzzone auf, rollt aus und rollt zu ihrem Stellplatz (Landerichtung von der Seite, auf der die Platzrunde in die Karte passt; verpasst sie die Zone, startet sie durch). Am Boden schießt sie nicht. Knopf **Landen (L)**, dann einen eigenen Stellplatz anklicken (oder Rechtsklick darauf): sie landet dort, auch auf einem anderen eigenen Fliegerhorst mit freiem Platz (Befehl `land`). 1400 Geld, 160 Stahl, 2 Einwohner, 40 s (`UNITS.f16`, `BALANCE.jets`, `js/game/aircraft.js`). Flak trifft sie wegen des Tempos selten, die SAM normal |
| F-22 (Luftüberlegenheitsjet, seit v5.82) | Stellplatz des Fliegerhorsts (nur mit Stadt; dieselben Stellplätze wie die F-16, F-16 und F-22 teilen sich die zwei Plätze je Stellplatz) | **Sechs Luft-Luft-Lenkraketen** (700 Schaden, Reichweite 700, 2,2 s Kadenz, 150 Munition je Rakete, Trefferchance 94 %), nur gegen Hubschrauber und Flugzeuge. **Keine Luft-Boden-Raketen**: sie greift keine Panzer, Fahrzeuge oder Gebäude an, auch nicht Infanterie. Ihre Rolle ist das Luftüberlegenheitsjet; sie fliegt wie die F-16 (`jet`, `parallel` nicht nötig, eine Waffe), **3 Plätze**, 500 HP, 460 px/s, **Treibstoff 55 s Flug**. Leer geschossen fliegt sie heim und lädt am Munitionslager nach wie die F-16. 1900 Geld, 220 Stahl, 2 Einwohner, 55 s Ausbildung (`UNITS.f22`, `CITY.produces.stand`, `js/game/aircraft.js`). Die KI baut keine F-22 (Abschnitt „Flugzeuge“ in PRD §10). |
| Su-27 (Kampfflugzeug, Paket „Su-27“) | Stellplatz des Fliegerhorsts (nur mit Stadt; die zwei Plätze je Stellplatz teilen sich F-16, F-22 und Su-27) | Wie die F-16: zwei Luft-Luft-Lenkraketen an den Flügelspitzen (700 Schaden, Reichweite 640, Trefferchance 92 %), nur gegen Hubschrauber und Flugzeuge, und zwei Luft-Boden-Raketen unter den Flügeln (Panzer, Fahrzeuge, Gebäude), parallel feuernd. **3 Plätze**, 480 HP, 450 px/s, **Treibstoff 75 s Flug** (Reichweite ≈ 33 750 gegen 23 100 der F-16). 1600 Geld, 160 Stahl, 2 Einwohner, 45 s Ausbildung (`UNITS.su27`, `CITY.produces.stand`, `js/game/aircraft.js`). Die KI baut keine Su-27 (Abschnitt „Flugzeuge“ in PRD §10). |
| U-2 (Höhenaufklärer, seit v5.83) | Stellplatz des Fliegerhorsts (nur mit Stadt); belegt den **ganzen Stellplatz allein** (`standSlots: 2`, kein anderes Flugzeug darauf) | **Unbewaffnet**, 400 HP, 300 px/s, 180 Treibstoff (rund 3 min Flug). Sicht **1800 px in der Luft** (am Boden 300). **In der Luft nur die F-22 kann sie treffen** (Waffe mit `antiHighAlt`); Flak, SAM, Gepard, F-16, Hubschrauber, Gebäude und Granaten treffen sie nicht. Am Boden verwundbar wie ein Jet. Rolle: Aufklärung der Konfliktzone und der gegnerischen Hauptstadt. Befehl Ziel auf der Karte: kreist dort, bis der Treibstoff knapp wird, dann Heimflug (ohne Waffen fliegt sie nicht sofort heim). |
| Kommandeur (Held, seit v4.49) | Hauptstadt | **Einmalig je Team**, belegt **keinen Platz**, jedes Team startet mit ihm (hinten an der Hauptstadt). Maschinenpistole (schwach). **Aura 300 px:** eigene Einheiten darin schießen **10 % schneller** (Abklingzeit ÷ 1,1), verletzte Infanterie darin heilt **1,5 HP/s**, sobald sie 6 s nicht getroffen wurde (Fahrzeuge nicht). **Fällt er, bekommt der Gegner 5 Punkte** (kann die Partie entscheiden; auch als Passagier eines zerstörten Fahrzeugs). Danach bildet die Hauptstadt (mit Stadt die Kaserne) einen neuen aus (C, 400 Geld, 20 s); ein zweiter, auch in der Warteschlange, wird abgelehnt. Goldener Stern über der Figur (für beide Seiten sichtbar, soweit in Sicht), gewählt zeigt er den Aura-Kreis. Zählt nicht als Soldat für den Nachschub. `BALANCE.commander`, `js/game/commander.js` |

**Forschung** (§7, wenn im Startmenü an): seit v5.04 sind alle Einheiten von Anfang an frei; der Forschungsbaum verbessert sie nur (Reichweite, Panzerung, Tempo, Treibstoff-Reichweite …).

**Aussehen:** Alle Einheiten sind kleine 3D-Modelle aus Grundkörpern (Kästen, Prismen, schräge Türme, Zylinder, Kugeln), die das Spiel selbst malt, mit dem Licht der Gebäude (links oben) und etwas dunkleren bodennahen Flächen. **Kampfpanzer** flache Wanne mit schrägem Bug, Kettenschürzen in Feldern, Keilturm mit Rundblickoptik, Zieloptik, Luken, MG, Nebelwurfbechern, Staukorb und langem Rohr mit Rauchabsauger; **Schützenpanzer** (Puma) breite Wanne mit Schürzen, flacher unbemannter Turm mit 30-mm-Kanone und Lenkflugkörper; **Gepard** Leopard-Wanne, Turm mit zwei 35-mm-Kanonen, Folgeradar vorn und Suchradar auf dem Mast; **Panzerhaubitze** großer Turm mit langem 155-mm-Rohr und Mündungsbremse; **Flak** und **SAM** leichte Kettenfahrzeuge (Zwillingsflak mit Radar, angestellte Startbehälter mit roten Deckeln); **LKW** Fahrerhaus mit Scheiben und Plane, **FOB-Fahrzeug** langer Aufbau mit gelben Rippen, Mast und Wimpel, **Baufahrzeug** Kettenfahrzeug mit gelbem Räumschild, Kabine und Baggerarm; **Little Bird** Kuppelrumpf mit Kufen, **Kampfhubschrauber** schmaler Rumpf mit Stummelflügeln, Raketenbehältern und Bordkanone, **Transporthubschrauber** mit zwei Rotoren; **F-16** mit Kanzel, Lufteinlauf, Luft-Luft-Lenkraketen an den Flügelspitzen und seit v5.41 Luft-Boden-Raketen unter den Flügeln (verschossene fehlen), Fahrwerk am Boden und Nachbrenner im Flug; **Soldaten** mit Helm, Weste, Rucksack und Waffe (Gewehr, Panzerfaust, langes Gewehr mit Zielfernrohr und Tarnbüscheln, Kommandeur mit Barett und Funkantenne), gehend mit Bein- und Armbewegung. Teams: Blau graublau, Rot rotbraun, Teamfarbe an Wimpel, Kennstreifen, Weste und Helmband. Iso: Wanne in 16 Richtungen, der Turm getrennt in 16 Richtungen (folgt dem Ziel), Soldaten in 8 Richtungen; Schatten als Umriss am Boden, auch unter Hubschraubern und Jets. 2D: dieselben Modelle von oben, Turm frei drehbar. Rotoren und Nachbrenner laufen live, Wracks sind dasselbe Modell verkohlt. Jede Ansicht wird je Maßstab einmal gemalt und danach nur kopiert (`spritecache.js`), darum flüssig auf Handy und Tablet. Nur Bild, Spielregeln unverändert. Code: `js/render/unitpaint.js`.

**Scharfschütze und Tarnung:** Der Scharfschütze ist getarnt: Gegner sehen ihn nur, wenn eine ihrer Einheiten oder ein fertiges Gebäude näher als **160 px** an ihm steht, oder **4 s lang nach jedem seiner Schüsse**. Unentdeckt wird er nicht angegriffen und ist weder auf der Karte noch auf der Minimap zu sehen (eigene Einheiten sehen ihn immer). Er sieht selbst 440 px weit, sein Gewehr reicht 480 px, und Einheiten ohne Befehl schießen bis zu dieser Reichweite (nicht nur bis zur Leine von 300 px). Ein Schuss verbraucht 4 Munition; mit seiner Reichweite und der Tarnung ist er gegen Infanterie stark, gegen Fahrzeuge, Gebäude und Hubschrauber nutzlos. Die KI baut ihn nicht, sieht ihn aber nach denselben Tarnregeln. Er zählt zu den Soldaten für den Nachschub (Abschnitt 3).

**Hubschrauber** fliegen geradeaus über Gelände und Gebäude, brauchen Treibstoff beim Fliegen (ohne: 25 % Tempo) und sind
Panzerklasse „Luft“: Flugabwehr (stark), Panzerabwehrsoldat (40), Raketen des AH-64 (150), SPz-MG (6), Schütze (3), Panzer-MG (3) und die FOB-MG (2) treffen sie; Hauptkanone,
Granatwerfer und Mörser nicht. **Flugzeuge** (F-16) haben seit v5.15 eine eigene Schadensklasse „Flugzeug“ (`jet`; fehlt sie bei einer Waffe, gilt „Luft“): **Soldaten treffen keine Flugzeuge** (Schütze, Panzerabwehr, Scharfschütze, Kommandeur: 0), die MGs von Schützen- und Kampfpanzer sehr wenig (2 bzw. 1), der Kampfhubschrauber mittel (Bordkanone 12, Raketen 110); Flak, SAM und Flugabwehrstellungen wie gegen Hubschrauber.
**Parallel feuern:** Kampf- und Schützenpanzer (`parallel` in `js/data/units.js`) benutzen MG und Hauptwaffe gleichzeitig, jede Waffe auf ihr eigenes Ziel: das MG auf Soldaten, die Hauptkanone bzw. der Granatwerfer auf Fahrzeuge und Gebäude; die Waffen blockieren sich nicht. Beim Angriffsbefehl schießt die passende Waffe auf das befohlene Ziel, die andere nebenbei auf ihr eigenes. Passagiere steigen per Rechtsklick auf den Hubschrauber ein und werden mit **O** am Zielpunkt abgesetzt;
stirbt der Hubschrauber, sind die Passagiere verloren.

Schadensmodell: Schaden je Schuss nach Panzerklasse des Ziels (Infanterie / leicht / schwer / Gebäude) – Werte in §6 „Waffen und Schaden“. Höhenvorteil siehe §7 „Gelände“.

### Werte (Quelle: `js/data/units.js`, `js/data/buildings.js`, `js/data/balance.js`)

Die Tabellen „Werte“ und „Waffen und Schaden“ erzeugt `npm run docs` aus `js/data/` (`tools/doc-tables.mjs`); zwischen den Markierungen nichts von Hand ändern. Ein Test meldet, wenn sie nicht mehr zur Config passen.

<!-- auto:units:start -->
| Einheit | Taste | Plätze | HP | Tempo | Sicht | Reichweite | Preis | Ausbildung | Treibstoff (max / je s) |
|---|---|---|---|---|---|---|---|---|---|
| Schütze | Q | 1 | 100 | 45 | 260 | 200 | 60 Geld | 5 s | – |
| Sanitäter | K | 1 | 100 | 45 | 260 | – | 90 Geld | 5 s | – |
| Panzerabwehrsoldat | W | 1 | 90 | 40 | 260 | 240 | 120 Geld | 8 s | – |
| Scharfschütze | T | 1 | 70 | 38 | 440 | 480 | 220 Geld | 10 s | – |
| Kommandeur | C | 0 | 300 | 42 | 340 | 180 | 400 Geld | 20 s | – |
| LKW | E | 1 | 250 | 110 | 220 | – | 80 Geld | 6 s | 30 / 0,2 |
| Baufahrzeug | R | 1 | 400 | 70 | 260 | – | 150 Geld | 9 s | 40 / 0,3 |
| Bagger | X | 2 | 650 | 48 | 240 | 34 | 320 Geld | 14 s | 45 / 0,35 |
| FOB-Fahrzeug | B | 2 | 600 | 60 | 260 | – | 500 Geld | 30 s | 50 / 0,4 |
| Schützenpanzer | A | 3 | 450 | 85 | 300 | 240 | 250 Geld | 12 s | 40 / 0,4 |
| Kampfpanzer | S | 5 | 1100 | 60 | 320 | 300 | 500 Geld | 20 s | 60 / 0,6 |
| Little Bird | D | 1 | 220 | 170 | 380 | – | 350 Geld | 15 s | 60 / 0,5 |
| Transporthubschrauber | F | 1 | 500 | 130 | 320 | – | 600 Geld | 20 s | 90 / 0,7 |
| Kampfhubschrauber | G | 1 | 650 | 150 | 400 | 340 | 900 Geld | 28 s | 70 / 0,8 |
| F-16 | K | 3 | 450 | 420 | 560 | 640 | 1400 Geld | 40 s | 55 / 1 |
| F-22 | I | 3 | 500 | 460 | 600 | 700 | 1900 Geld | 55 s | 55 / 1 |
| Su-27 | S | 3 | 480 | 450 | 560 | 640 | 1600 Geld | 45 s | 75 / 1 |
| U-2 | O | 3 | 400 | 300 | 300 | – | 1600 Geld | 50 s | 180 / 1 |
| Flakpanzer | Z | 2 | 300 | 70 | 380 | 330 | 220 Geld | 10 s | 40 / 0,4 |
| SAM-Startrampe | N | 2 | 350 | 65 | 440 | 420 | 300 Geld | 12 s | 40 / 0,4 |
| Flakpanzer Gepard | L | 3 | 450 | 62 | 480 | 420 | 650 Geld | 16 s | 45 / 0,35 |
| Panzerhaubitze | O | 4 | 500 | 50 | 280 | 1400 | 900 Geld | 22 s | 40 / 0,35 |
<!-- auto:units:end -->

<!-- auto:buildings:start -->
| Gebäude | Taste (Baumenü) | HP | Größe (Zellen) | Kosten | Bauzeit |
|---|---|---|---|---|---|
| FOB | – | 2500 | 3×3 | 400 Baumaterial | 30 s |
| Mauer | E | 600 | 1×1 | 8 Baumaterial | 2 s |
| Tor | R | 800 | 1×1 | 25 Baumaterial | 4 s |
| Mörser | T | 700 | 2×2 | 200 Baumaterial, 60 Munition | 20 s |
| Flugabwehr | Z | 700 | 2×2 | 180 Baumaterial, 40 Munition | 18 s |
| Phalanx | C | 900 | 2×2 | 800 Geld, 300 Baumaterial, 200 Munition | 120 s |
| Gefechtsturm | F | 1500 | 2×2 | 220 Baumaterial | 25 s |
| Sendemast | G | 3000 | 2×2 | 2000 Geld, 600 Baumaterial | 120 s |
| Bohrer | X | 600 | 2×2 | 150 Baumaterial | 20 s |
<!-- auto:buildings:end -->

Weitere globale Zahlen (Kartengröße, Zone, Prämien, Logistikraten, Schwierigkeit) stehen in `js/data/balance.js` und sind oben im Text genannt.

### Waffen und Schaden (Quelle: `weapons` in `js/data/units.js`, `weapon` in `js/data/buildings.js`)

Schaden je Schuss nach Panzerklasse des Ziels (Inf = Infanterie, Leicht, Schwer, Geb = Gebäude, Luft). Wo die Tabelle „Treffer bis zum Abschuss“ (unten) eine Paarung nennt, gilt sie statt dieser Werte. Reichweite in px, Kadenz = Sekunden zwischen Schüssen.

<!-- auto:weapons:start -->
| Waffe | Reichweite | Kadenz (s) | Schuss | Munition je Schuss | Inf | Leicht | Schwer | Geb | Luft | Flugzeug | Hinweis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Schütze: Gewehr | 200 | 1 | 60 | 0,033 | 12 | 3 | 1 | 4 | 3 | 0 | Soldat: 4 Treffer |
| Panzerabwehrsoldat: RPG | 240 | 3 | 5 | 10 | 10 | 90 | 120 | 60 | 40 | 0 | Soldat: 1 Treffer |
| Scharfschütze: Scharfschützengewehr | 480 | 8 | 10 | 4 | 200 | 6 | 1 | 2 | 2 | 0 | Soldat: 1 Treffer |
| Kommandeur: Maschinenpistole | 180 | 0,6 | 90 | 0,033 | 10 | 2 | 1 | 2 | 2 | 0 | Soldat: 6 Treffer |
| Bagger: Schaufel | 34 | 1,2 | 9999 | 0 | – | – | – | 32 | – | – | bevorzugt gegen Geb |
| Schützenpanzer: Granatwerfer | 240 | 2 | 60 | 10 | 30 | 40 | 10 | 25 | – | – | bevorzugt gegen Leicht, Schwer, Geb; Soldat: 1 Treffer |
| Schützenpanzer: MG | 220 | 0,25 | 300 | 5 | 9 | 3 | 1 | 3 | 6 | 2 | Soldat: 2 Treffer |
| Kampfpanzer: Hauptkanone | 300 | 6 | 30 | 20 | 45 | 120 | 150 | 120 | – | – | bevorzugt gegen Leicht, Schwer, Geb; Soldat: 1 Treffer |
| Kampfpanzer: MG | 220 | 0,25 | 300 | 5 | 10 | 3 | 0 | 2 | 3 | 1 | Soldat: 2 Treffer |
| Kampfhubschrauber: Bordkanone | 340 | 0,5 | 300 | 10 | 22 | 26 | 30 | 18 | 10 | 12 | – |
| Kampfhubschrauber: Raketen | 340 | 3 | 10 | 100 | 40 | 120 | 220 | 120 | 150 | 110 | bevorzugt gegen Schwer, Geb, Luft |
| F-16: Luft-Luft-Lenkrakete | 640 | 2,5 | 2 | 150 | – | – | – | – | 700 | 700 | bevorzugt gegen Luft; Trefferchance 92 % × Entfernungs-Faktor; nur Luftziele |
| F-16: Luft-Boden-Rakete | 600 | 2,5 | 2 | 150 | 160 | 650 | 1150 | 700 | – | – | bevorzugt gegen Schwer, Leicht; Trefferchance 92 % × Entfernungs-Faktor |
| F-22: Luft-Luft-Lenkrakete | 700 | 2,2 | 6 | 150 | – | – | – | – | 700 | 700 | bevorzugt gegen Luft; Trefferchance 94 % × Entfernungs-Faktor; nur Luftziele |
| Su-27: Luft-Luft-Lenkrakete | 640 | 2,5 | 2 | 150 | – | – | – | – | 700 | 700 | bevorzugt gegen Luft; Trefferchance 92 % × Entfernungs-Faktor; nur Luftziele |
| Su-27: Luft-Boden-Rakete | 600 | 2,5 | 2 | 150 | 160 | 650 | 1150 | 700 | – | – | bevorzugt gegen Schwer, Leicht; Trefferchance 92 % × Entfernungs-Faktor |
| Flakpanzer: Flak | 330 | 0,8 | 30 | 20 | – | – | – | – | 40 | 40 | Trefferchance 85 % × Tempo-Faktor × Entfernungs-Faktor; nur Luftziele |
| SAM-Startrampe: Wärmesuchrakete | 420 | 10 | 4 | 250 | – | – | – | – | 350 | 350 | Trefferchance 90 % × Entfernungs-Faktor; nur Luftziele |
| Flakpanzer Gepard: Zwillingskanone 35 mm | 420 | 0,35 | 80 | 8 | 8 | 14 | 2 | 6 | 32 | 32 | bevorzugt gegen Luft; Trefferchance 80 % × Tempo-Faktor × Entfernungs-Faktor |
| Panzerhaubitze: Haubitze 155 mm | 1400 | 7 | 30 | 25 | 90 | 110 | 80 | 140 | – | – | – |
| FOB (Gebäude) | 220 | 0,6 | – | – | 12 | 4 | 1 | 4 | 2 | 2 | kostenlos |
| Mörser (Gebäude) | 800 | 20 | – | 4 | 60 | 50 | 25 | 80 | – | – | min. 200 px; Fläche 60 px; Granate mit Flugzeit |
| Flugabwehr (Gebäude) | 320 | 0,4 | – | 0,25 | 10 | 12 | 2 | 4 | 35 | 35 | fängt Mörsergranaten ab (350 px, 70 %) |
| Phalanx (Gebäude) | 225 | 0,1 | – | 5 | – | – | – | – | 25 | 25 | dazu 1 Geld je Schuss; fängt Mörsergranaten ab (225 px, 95 %, alle 0,2 s, je Versuch 15 Munition und 5 Geld) |
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
