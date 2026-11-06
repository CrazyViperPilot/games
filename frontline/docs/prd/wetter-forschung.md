# Frontline PRD – Wetter, Jahreszeiten und Forschung

> Teil des PRD, Abschnitte §7 „Wetter und Jahreszeiten“, §7 „Forschung“. Einstieg und Übersicht aller Teile: [PRD.md](../../PRD.md).
> Neue Regeln hier im passenden Abschnitt eintragen, die Version in [docs/changelog.md](../changelog.md).

## 7. Konfliktzone & Punkte (Teil)

### Wetter und Jahreszeiten
- **Lichtstimmung (nur Optik):** Menü „Licht“ (Aus · Zufall · Morgen · Tag · Abend · Nacht, Standard Zufall) färbt die Karte mit Morgenrot, Mittagslicht, Abendglut oder Mondschein; gilt in 2D und Iso, ändert weder Sicht noch Wetter noch KI. Regen, Nebel und Schnee liegen darunter und mischen sich mit der Stimmung.
- Im Startmenü wählbar („Wetter“: Aus · Zufall · Sommer · Herbst · Winter, gemerkt, Standard Zufall; `Game({ weather })`, ohne Angabe aus). Zufall wählt die Jahreszeit aus dem Seed.
- Die **Jahreszeit** gilt die ganze Partie, das **Wetter** wechselt: klar hält 180–360 s, Regen 100–200 s, Nebel 90–180 s, Schnee 100–200 s; nie zweimal dasselbe hintereinander. Häufigkeit des nächsten Wetters (Gewichte): Sommer klar 6 · Regen 3 · Nebel 1; Herbst klar 3 · Regen 4 · Nebel 3; Winter klar 4 · Schnee 4 · Nebel 2. Schon das erste Wetter einer Partie kann schlecht sein.
- **Wirkung:** Regen und Schnee senken die Sichtweite um **20 %**, Nebel um **35 %** (alle Einheiten und Gebäude, auch Hubschrauber; gilt für den Nebel des Krieges und die automatische Zielsuche, Waffenreichweiten bleiben). Schneefall bremst Bodenfahrzeuge (LKW, Baufahrzeug, Schützenpanzer, Kampfpanzer) auf **80 %**, Winterboden ohne Schneefall auf **90 %**; Infanterie und Hubschrauber nicht. Formationen (§8) fahren dann im Tempo der gebremsten Fahrzeuge, wenn das langsamer ist als das der langsamsten Einheit.
- Übergänge blenden über 20 s (die Sicht in 5-%-Stufen). Jeder Wechsel kommt als Meldung an beide („Nebel zieht auf: Sicht −35 %“, „Der Nebel lichtet sich: klare Sicht“), zum Start eine mit Jahreszeit und Wetter.
- Eigener Zufall je Seed: die übrige Partie läuft bei gleichem Seed gleich. `BALANCE.weather`, `js/game/weather.js`.
- **Darstellung:** Herbst färbt Wiesen gelblich-oliv und das Laub gelb, orange und rotbraun; Winter legt Schnee über Wiesen und Bäume (Straßen, Dächer und Fels im Bodenbild eine dünne Schicht; sind Laubbäume kahl mit Schnee auf den Ästen, Nadelbäume, Büsche und Felsen verschneit, siehe §7 „Natur“; Schnee liegt auch auf den gemalten Dächern, Autos, Parkbänken, dem Wachturm, den Äckern, Weiden und Ballen), im WebGL-Gelände sind flacher Fels und Ufer verschneit, Seen haben einen Eisrand. Regen: schräge Schnüre und dunkleres Licht; Schnee: treibende Flocken; Nebel: heller Dunst mit ziehenden Schwaden und dichterem Bildrand (`js/render/season.js`, `js/render/weatherfx.js`). **Aussehen seit v5.47**: Regen in drei Tiefen (ferne Schnüre dünn und blass, nahe lang und hell), die Schräge folgt wechselnden Böen, am Boden Spritzer (Ring, der aufgeht und verblasst, dazu zwei hochspringende Tröpfchen); Schnee als runde, weiche Flocken in drei Tiefen (nahe groß und schneller) mit zartem Schatten, damit sie auch über Schnee sichtbar sind, sie treiben stetig im Wind und taumeln; Nebel in flachen, ziehenden Bänken, nahe größer und schneller. Nur Bild, die Wirkung des Wetters bleibt.

### Forschung (ein Baum mit 10 Stufen)
- Im Startmenü schaltbar („Forschung“: An/Aus, gemerkt, Standard An; `Game({ research })`, ohne Angabe aus: keine Verbesserungen).
- **Alle Einheiten sind von Anfang an frei** (auch ohne Forschung). Die Forschung schaltet keine Einheiten mehr frei, sie **verbessert** sie: Werte je Einheitengruppe und drei Fähigkeiten (Nebel, Minen, autonome Türme). Daniels Wunsch: Panzer bekommen von Stufe zu Stufe mehr Kanonenreichweite, mehr Fahr-Reichweite usw.; das System lehnt sich an die Freischaltungen der Fahrzeuge in Battlefield 4 / Battlefield 6 (Optik, Munition, Panzerung, Gegenmaßnahmen, Wartung) und an Wardogs an.
- **Aufbau:** 10 Stufen (Spalten) und 8 Äste (Zeilen): 🪖 Infanterie, 🛡 Kampfpanzer, ⚙ Schützenpanzer und Flugabwehr, 🎯 Artillerie und Gepard (Panzerhaubitze und Flakpanzer Gepard: Reichweite, Tank, Genauigkeit bzw. Streuung der Granaten, Kadenz, Radar, Panzerung; der Gepard zählt auch zur Flugabwehr des Asts ⚙), ✈ Luftwaffe (Hubschrauber, F-16), 🔧 Logistik und Pioniere, 🏰 Stellungen (Militärgebäude), 🖥 Elektronik und KI. Je Ast und Stufe genau eine Forschung, 80 insgesamt (Schlüssel `<Ast><Stufe>`, z. B. `tank5`). Daten: `js/data/research.js` (`RESEARCH`), Logik `js/game/research.js`.
- **Regeln:** Jede Forschung braucht ihren **Vorgänger im selben Ast** (Stufe davor). Eine Stufe ist **offen**, wenn auf der Stufe davor **3 Forschungen** fertig sind (`perTier`; welche, ist egal; weitere der alten Stufe darf man jederzeit nachholen). Preis je Stufe 250 / 350 / 450 / 550 / 700 / 850 / 1000 / 1200 / 1400 / 1600 Geld, Zeit 30 bis 102 s (+8 s je Stufe).
- **Warteschlange:** Die Hauptstadt forscht eins zugleich, **bis zu 3 weitere warten** (`queueMax`). Bezahlt wird beim Einreihen; ✕ nimmt eine Forschung heraus und erstattet ganz, was davon abhängt (Nachfolger, Stufe), fällt mit heraus und wird auch erstattet. Beim Einreihen zählt, was läuft und wartet, schon als erforscht: man kann also z. B. Richtoptik, Gefechtsausbildung, Maschinenkanone und danach schon Zusatztanks (Stufe 2) einreihen. Ist eine fertig, rückt die nächste nach.
- **Stadt:** Ohne **fertige Universität** ruht jede Forschung (eine reicht, ihre Stufe zählt nicht; Meldung „Forschung ruht: keine Universität in der Stadt“). **Rechenzentren beschleunigen:** Tempo × (1 + 20 % × Summe der Stufen aller Rechenzentren), höchstens dreifach (`CITY.research`); Strommangel bremst im Verhältnis. Ohne Stadt forscht die Hauptstadt mit Tempo 1.
- **Wirkung:** je Gruppe (Infanterie, Kampfpanzer, Schützenpanzer, Flak und SAM, LKW und Baufahrzeug, Hubschrauber, Kampfflugzeuge, dazu „alle Bodenfahrzeuge“, „Hubschrauber und Kampfflugzeuge“, „alle Einheiten“ und Militärgebäude) auf Waffenreichweite, Sicht (auch Nebel des Krieges und Zielsuche), Schaden (allgemein oder gegen Infanterie, Fahrzeuge und Gebäude, Luftziele), Nachladezeit, erlittenen Schaden, Tempo, Treibstoffverbrauch (= Fahr- bzw. Flugreichweite), Trefferchance gelenkter Waffen (Flak, SAM, Raketen, Abfangen), Ausweichen gegen sie, Selbstheilung (nach 6 s ohne Treffer), Bodenzeit der Jets, Bau- und Reparaturtempo und die Ladezeit von Nebel und Minen. Mehrere Forschungen multiplizieren sich (Selbstheilung addiert sich). Ein Schuss, der das unverletzte Ziel sofort tötet, bleibt trotz Panzerung tödlich. Stadtgebäude bekommen nichts.
- **Meldungen:** „<Name> erforscht: <Wirkung>“; öffnet sich eine Stufe „Forschungsstufe N offen“, der Gegner erfährt „Der Gegner forscht auf Stufe N“.
- **Forschungsmenü** (`js/ui/researchpanel.js`): großer Knopf **🔬 Forschung** rechts oben oder U an der Hauptstadt. Links der **Baum**: oben die Stufenköpfe („fertig / 3“, 🔒 gesperrt, grün unterstrichen, wenn die Stufe voll ist), links die Äste (bleiben beim waagrechten Scrollen stehen), dazwischen die Knoten mit Linie zum Vorgänger (grün erforscht, blau geplant). Knoten zeigen ✓, Fortschritt in %, „Platz N“ in der Warteschlange, 🔒 oder den Preis. Rechts die **Warteschlange** (laufende mit Balken und Restzeit, wartende, freie Plätze, je ✕) und die **Einzelheiten** der gewählten Forschung (Wirkung, Preis, Zeit, Voraussetzungen, Sperrgrund) mit „Erforschen“ bzw. „Einreihen“. Beim Öffnen rückt die aktuelle Stufe ins Bild. Das Spiel läuft weiter. Knöpfe im Fenster bleiben beim Auffrischen stehen, damit jeder Tipp beim ersten Mal wirkt.
- **KI:** forscht ab `difficulty.research[0]` s (Leicht 240, Normal 150, Schwer 90) Stufe für Stufe, in jeder Stufe die Äste in der Reihenfolge `UPGRADES` (Kampfpanzer, Infanterie, Schützenpanzer und Flugabwehr, Elektronik, Stellungen, Luftwaffe, Logistik), nur aus Überschuss (400 Geld Reserve, Leicht 800) und mit höchstens einer wartenden Forschung. Nebel und Minen nutzt sie nicht.

Alle 70 Forschungen (aus `js/data/research.js` erzeugt, `npm run docs`):

<!-- auto:research:start -->
| Stufe | Ast | Forschung | Schlüssel | Preis, Zeit | Wirkung |
|---|---|---|---|---|---|
| 1 | 🪖 Infanterie | Gefechtsausbildung | `inf1` | 250 Geld, 30 s | Infanterie: Schaden +8 % |
| 1 | 🛡 Kampfpanzer | Richtoptik | `tank1` | 250 Geld, 30 s | Kampfpanzer: Waffenreichweite +6 %, Sicht +5 % |
| 1 | ⚙ Schützenpanzer und Flugabwehr | Maschinenkanone | `mech1` | 250 Geld, 30 s | Schützenpanzer: Schaden +10 % |
| 1 | 🎯 Artillerie und Gepard | Ballistikrechner | `art1` | 250 Geld, 30 s | Panzerhaubitze: Waffenreichweite +8 % |
| 1 | ✈ Luftwaffe | Rotorwartung | `air1` | 250 Geld, 30 s | Hubschrauber: Reichweite mit einer Tankfüllung +18 % |
| 1 | 🔧 Logistik und Pioniere | Geländereifen | `log1` | 250 Geld, 30 s | LKW und Baufahrzeuge: Tempo +10 % |
| 1 | 🏰 Stellungen | Sandsäcke | `def1` | 250 Geld, 30 s | Militärgebäude: nehmen 10 % weniger Schaden |
| 1 | 🖥 Elektronik und KI | Gefechtsfunk | `elec1` | 250 Geld, 30 s | alle Einheiten: Sicht +5 % |
| 2 | 🪖 Infanterie | Schutzwesten | `inf2` | 350 Geld, 38 s | Infanterie: nehmen 10 % weniger Schaden |
| 2 | 🛡 Kampfpanzer | Zusatztanks | `tank2` | 350 Geld, 38 s | Kampfpanzer: Reichweite mit einer Tankfüllung +18 % |
| 2 | ⚙ Schützenpanzer und Flugabwehr | Suchradar | `mech2` | 350 Geld, 38 s | Flak und SAM: Waffenreichweite +8 %, Sicht +10 % |
| 2 | 🎯 Artillerie und Gepard | Zusatztanks | `art2` | 350 Geld, 38 s | Panzerhaubitze: Reichweite mit einer Tankfüllung +18 % · Flakpanzer Gepard: Reichweite mit einer Tankfüllung +18 % |
| 2 | ✈ Luftwaffe | Stabilisierte Bordkanone | `air2` | 350 Geld, 38 s | Hubschrauber: Schaden +8 % |
| 2 | 🔧 Logistik und Pioniere | Schnellbau | `log2` | 350 Geld, 38 s | alle Einheiten: Bautempo +20 % |
| 2 | 🏰 Stellungen | Schwere MG | `def2` | 350 Geld, 38 s | Militärgebäude: Schaden +10 % |
| 2 | 🖥 Elektronik und KI | Aufklärungsdrohnen | `elec2` | 350 Geld, 38 s | alle Einheiten: Sicht +10 % |
| 3 | 🪖 Infanterie | Zielfernrohre | `inf3` | 450 Geld, 46 s | Infanterie: Waffenreichweite +8 %, Sicht +5 % |
| 3 | 🛡 Kampfpanzer | Wuchtgeschosse (APFSDS) | `tank3` | 450 Geld, 46 s | Kampfpanzer: Schaden +10 % |
| 3 | ⚙ Schützenpanzer und Flugabwehr | Leichtbaupanzerung | `mech3` | 450 Geld, 46 s | Schützenpanzer: nehmen 10 % weniger Schaden · Flak und SAM: nehmen 10 % weniger Schaden |
| 3 | 🎯 Artillerie und Gepard | Zielfolgeradar | `art3` | 450 Geld, 46 s | Flakpanzer Gepard: Waffenreichweite +8 %, Sicht +10 % |
| 3 | ✈ Luftwaffe | Nachbrenner | `air3` | 450 Geld, 46 s | Kampfflugzeuge: Tempo +8 % |
| 3 | 🔧 Logistik und Pioniere | Zusatzkanister | `log3` | 450 Geld, 46 s | LKW und Baufahrzeuge: Reichweite mit einer Tankfüllung +25 % |
| 3 | 🏰 Stellungen | Mörser-Feuerleitung | `def3` | 450 Geld, 46 s | Militärgebäude: Waffenreichweite +8 % |
| 3 | 🖥 Elektronik und KI | Störsender | `elec3` | 450 Geld, 46 s | Hubschrauber und Kampfflugzeuge: gegnerische Flak, SAM und Lenkraketen treffen 20 % seltener |
| 4 | 🪖 Infanterie | Erweiterte Magazine | `inf4` | 550 Geld, 54 s | Infanterie: feuern 9 % schneller |
| 4 | 🛡 Kampfpanzer | Verbundpanzerung | `tank4` | 550 Geld, 54 s | Kampfpanzer: nehmen 10 % weniger Schaden |
| 4 | ⚙ Schützenpanzer und Flugabwehr | Zusatztanks | `mech4` | 550 Geld, 54 s | Schützenpanzer: Reichweite mit einer Tankfüllung +18 % · Flak und SAM: Reichweite mit einer Tankfüllung +18 % |
| 4 | 🎯 Artillerie und Gepard | Wetter- und Vermessungsdaten | `art4` | 550 Geld, 54 s | Panzerhaubitze: Streuung der Granaten −20 % |
| 4 | ✈ Luftwaffe | Panzerglaskanzel | `air4` | 550 Geld, 54 s | Hubschrauber: nehmen 10 % weniger Schaden · Kampfflugzeuge: nehmen 10 % weniger Schaden |
| 4 | 🔧 Logistik und Pioniere | Reparaturset | `log4` | 550 Geld, 54 s | alle Einheiten: Reparatur 1,5× so schnell |
| 4 | 🏰 Stellungen | Stahlbeton | `def4` | 550 Geld, 54 s | Militärgebäude: nehmen 12 % weniger Schaden |
| 4 | 🖥 Elektronik und KI | Datenlink | `elec4` | 550 Geld, 54 s | alle Einheiten: feuern 5 % schneller |
| 5 | 🪖 Infanterie | Feldsanitäter | `inf5` | 700 Geld, 62 s | Infanterie: heilen sich selbst um 1,2 % HP/s (nach 6 s ohne Treffer) |
| 5 | 🛡 Kampfpanzer | Ladeautomat | `tank5` | 700 Geld, 62 s | Kampfpanzer: feuern 14 % schneller |
| 5 | ⚙ Schützenpanzer und Flugabwehr | Annäherungszünder | `mech5` | 700 Geld, 62 s | Flak und SAM: Trefferchance gelenkter Waffen +10 % |
| 5 | 🎯 Artillerie und Gepard | Automatischer Lader | `art5` | 700 Geld, 62 s | Panzerhaubitze: feuern 18 % schneller · Flakpanzer Gepard: feuern 9 % schneller |
| 5 | ✈ Luftwaffe | Täuschkörper (Flares) | `air5` | 700 Geld, 62 s | Hubschrauber und Kampfflugzeuge: gegnerische Flak, SAM und Lenkraketen treffen 15 % seltener |
| 5 | 🔧 Logistik und Pioniere | Nebelwerfer | `log5` | 700 Geld, 62 s | Fahrzeuge und Hubschrauber legen mit V eine Nebelwand: eigene Einheiten darin nehmen halb so viel Schaden |
| 5 | 🏰 Stellungen | Autonome Türme | `def5` | 700 Geld, 62 s | Dachaufbauten von Gefechtstürmen und Häusern feuern auch ohne Besatzung |
| 5 | 🖥 Elektronik und KI | KI-Zielerfassung | `elec5` | 700 Geld, 62 s | alle Einheiten: Schaden +8 % |
| 6 | 🪖 Infanterie | Keramikplatten | `inf6` | 850 Geld, 70 s | Infanterie: nehmen 12 % weniger Schaden |
| 6 | 🛡 Kampfpanzer | Gasturbine | `tank6` | 850 Geld, 70 s | Kampfpanzer: Tempo +12 % |
| 6 | ⚙ Schützenpanzer und Flugabwehr | Programmierbare Munition | `mech6` | 850 Geld, 70 s | Schützenpanzer: feuern 14 % schneller, Schaden gegen Infanterie +10 % |
| 6 | 🎯 Artillerie und Gepard | Programmierbare Zerlegemunition | `art6` | 850 Geld, 70 s | Flakpanzer Gepard: Trefferchance gelenkter Waffen +12 %, Schaden +10 % |
| 6 | ✈ Luftwaffe | Konforme Tanks | `air6` | 850 Geld, 70 s | Kampfflugzeuge: Reichweite mit einer Tankfüllung +25 % · Hubschrauber: Reichweite mit einer Tankfüllung +11 % |
| 6 | 🔧 Logistik und Pioniere | Fertigteilbau | `log6` | 850 Geld, 70 s | alle Einheiten: Bautempo +20 % |
| 6 | 🏰 Stellungen | Schnellladung | `def6` | 850 Geld, 70 s | Militärgebäude: feuern 14 % schneller |
| 6 | 🖥 Elektronik und KI | GPS-Navigation | `elec6` | 850 Geld, 70 s | Bodenfahrzeuge: Tempo +5 %, Reichweite mit einer Tankfüllung +5 % |
| 7 | 🪖 Infanterie | Tandem-Gefechtskopf | `inf7` | 1000 Geld, 78 s | Infanterie: Schaden gegen Fahrzeuge und Gebäude +18 % |
| 7 | 🛡 Kampfpanzer | Feuerleitrechner | `tank7` | 1000 Geld, 78 s | Kampfpanzer: Waffenreichweite +10 % |
| 7 | ⚙ Schützenpanzer und Flugabwehr | Feuerleitradar | `mech7` | 1000 Geld, 78 s | Flak und SAM: Waffenreichweite +10 % |
| 7 | 🎯 Artillerie und Gepard | Minenschutz und Zusatzpanzerung | `art7` | 1000 Geld, 78 s | Panzerhaubitze: nehmen 10 % weniger Schaden · Flakpanzer Gepard: nehmen 10 % weniger Schaden |
| 7 | ✈ Luftwaffe | Panzerabwehrraketen (Hellfire) | `air7` | 1000 Geld, 78 s | Hubschrauber: Schaden gegen Fahrzeuge und Gebäude +15 %, Waffenreichweite +8 % |
| 7 | 🔧 Logistik und Pioniere | Minenleger | `log7` | 1000 Geld, 78 s | Baufahrzeuge legen mit M Minen, die Bodeneinheiten des Gegners treffen |
| 7 | 🏰 Stellungen | Radarstellung | `def7` | 1000 Geld, 78 s | Militärgebäude: Sicht +15 % |
| 7 | 🖥 Elektronik und KI | Elektronische Gegenmaßnahmen | `elec7` | 1000 Geld, 78 s | alle Einheiten: nehmen 5 % weniger Schaden |
| 8 | 🪖 Infanterie | Leichtes Sturmgepäck | `inf8` | 1200 Geld, 86 s | Infanterie: Tempo +10 % |
| 8 | 🛡 Kampfpanzer | Reaktivpanzerung | `tank8` | 1200 Geld, 86 s | Kampfpanzer: nehmen 12 % weniger Schaden |
| 8 | ⚙ Schützenpanzer und Flugabwehr | Panzerabwehrlenkwaffe | `mech8` | 1200 Geld, 86 s | Schützenpanzer: Schaden gegen Fahrzeuge und Gebäude +20 %, Waffenreichweite +6 % |
| 8 | 🎯 Artillerie und Gepard | Reichweitengesteigerte Granaten | `art8` | 1200 Geld, 86 s | Panzerhaubitze: Waffenreichweite +12 % |
| 8 | ✈ Luftwaffe | Mittelstrecken-Lenkwaffen | `air8` | 1200 Geld, 86 s | Kampfflugzeuge: Waffenreichweite +12 %, Trefferchance gelenkter Waffen +6 % |
| 8 | 🔧 Logistik und Pioniere | Gepanzerte LKW | `log8` | 1200 Geld, 86 s | LKW und Baufahrzeuge: nehmen 15 % weniger Schaden |
| 8 | 🏰 Stellungen | Abfangsystem (C-RAM) | `def8` | 1200 Geld, 86 s | Militärgebäude: Trefferchance gelenkter Waffen +12 % |
| 8 | 🖥 Elektronik und KI | Satellitenaufklärung | `elec8` | 1200 Geld, 86 s | alle Einheiten: Sicht +10 %, Waffenreichweite +4 % |
| 9 | 🪖 Infanterie | Wärmebildvisier | `inf9` | 1400 Geld, 94 s | Infanterie: Sicht +12 %, Waffenreichweite +6 % |
| 9 | 🛡 Kampfpanzer | Bordwerkstatt | `tank9` | 1400 Geld, 94 s | Kampfpanzer: heilen sich selbst um 0,8 % HP/s (nach 6 s ohne Treffer), Reichweite mit einer Tankfüllung +11 % |
| 9 | ⚙ Schützenpanzer und Flugabwehr | Allradantrieb | `mech9` | 1400 Geld, 94 s | Schützenpanzer: Tempo +10 % · Flak und SAM: Tempo +10 % |
| 9 | 🎯 Artillerie und Gepard | Feuerleitrechner mit Laser | `art9` | 1400 Geld, 94 s | Flakpanzer Gepard: feuern 14 % schneller, Waffenreichweite +6 % |
| 9 | ✈ Luftwaffe | Schnellwartung | `air9` | 1400 Geld, 94 s | Kampfflugzeuge: auf dem Stellplatz 30 % schneller bereit · Hubschrauber: heilen sich selbst um 0,8 % HP/s (nach 6 s ohne Treffer) |
| 9 | 🔧 Logistik und Pioniere | Feldwerkstatt | `log9` | 1400 Geld, 94 s | Bodenfahrzeuge: heilen sich selbst um 0,5 % HP/s (nach 6 s ohne Treffer) · alle Einheiten: Reparatur 1,3× so schnell |
| 9 | 🏰 Stellungen | Bunkerbau | `def9` | 1400 Geld, 94 s | Militärgebäude: nehmen 10 % weniger Schaden, Waffenreichweite +5 % |
| 9 | 🖥 Elektronik und KI | Gefechtsfeld-KI | `elec9` | 1400 Geld, 94 s | alle Einheiten: Trefferchance gelenkter Waffen +8 % · Militärgebäude: Trefferchance gelenkter Waffen +5 % |
| 10 | 🪖 Infanterie | Spezialkräfte | `inf10` | 1600 Geld, 102 s | Infanterie: Schaden +10 %, feuern 11 % schneller, nehmen 10 % weniger Schaden |
| 10 | 🛡 Kampfpanzer | Kampfwertsteigerung | `tank10` | 1600 Geld, 102 s | Kampfpanzer: Schaden +10 %, Waffenreichweite +6 %, nehmen 8 % weniger Schaden |
| 10 | ⚙ Schützenpanzer und Flugabwehr | Vernetzte Flugabwehr | `mech10` | 1600 Geld, 102 s | Flak und SAM: Schaden +15 %, Trefferchance gelenkter Waffen +10 % · Schützenpanzer: nehmen 8 % weniger Schaden |
| 10 | 🎯 Artillerie und Gepard | GPS-gelenkte Granaten | `art10` | 1600 Geld, 102 s | Panzerhaubitze: Streuung der Granaten −29 %, Schaden +10 % |
| 10 | ✈ Luftwaffe | Luftüberlegenheit | `air10` | 1600 Geld, 102 s | Hubschrauber und Kampfflugzeuge: Schaden +10 %, nehmen 8 % weniger Schaden |
| 10 | 🔧 Logistik und Pioniere | Pionierbataillon | `log10` | 1600 Geld, 102 s | alle Einheiten: Bautempo +25 %, Nebel und Minen laden 40 % schneller |
| 10 | 🏰 Stellungen | Festungsartillerie | `def10` | 1600 Geld, 102 s | Militärgebäude: Schaden +12 %, feuern 11 % schneller |
| 10 | 🖥 Elektronik und KI | Vernetzte Operationsführung | `elec10` | 1600 Geld, 102 s | alle Einheiten: Schaden +8 %, feuern 5 % schneller |
<!-- auto:research:end -->
