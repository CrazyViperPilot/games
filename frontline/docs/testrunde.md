# Frontline – Testrunde (Stand v5.83)

Neu seit v5.65 und noch nie von einem Menschen gespielt. Je Abschnitt: **Weg dorthin**, **worauf achten**, **Fragen**. Zu jedem Punkt
reicht eine kurze Notiz (passt / stört / Zahl zu hoch oder zu niedrig) oder ein Screenshot; die Werte lassen sich schnell ändern.

**Spiel:** <https://crazyviperpilot.github.io/games/frontline/> (nach dem Laden einmal neu laden, falls noch eine alte Version im Cache hängt;
oben in der Hilfe F1 bzw. im Änderungsverlauf steht die Version).

**Abkürzung zum Testen:** an die Adresse `?debug=1` anhängen → Karte aufgedeckt, Taste **M** = +1000 Geld, Tempo bis 10× (Tasten + / −).
Mit `&seed=11` gibt es immer dieselbe Karte. Ohne `debug` spielt es sich wie echt (Nebel, kein Geld-Cheat) – für Gefühlsfragen besser.

---

## 1. Baugebiet (Stadt nur im eigenen, sicheren Gebiet)
- **Weg:** Startmenü: Stadt an, „Baugebiet“ an (Standard). Im Spiel **Y** (Baumodus).
- **Achten:** Gesperrte Zellen sind dunkel, die Gebietsgrenze ist eine dünne Linie in Teamfarbe. Bau außerhalb meldet den Grund
  („Nur im eigenen Gebiet“, „Unerkundetes Gelände“, „Zu nah am Feind“, „Nicht in der Konfliktzone“). Straßen gehen auch außerhalb.
  Eine neue FOB (FOB-Fahrzeug, Taste D) vergrößert das Gebiet um 6 Zellen.
- **Fragen:** Fühlt es sich zu eng oder zu frei an? Ist die Grenze gut zu sehen? Stört „Zu nah am Feind“ (500 px)?
  Vergleich: einmal mit „Baugebiet“ aus spielen.

## 2. Werkslager und LKW am Werk
- **Weg:** Mit Stadt ein BM-Werk, Munitionswerk oder eine Raffinerie haben. LKW wählen, **Rechtsklick auf das Werk** (laden) oder
  **T**, dann das Werk, dann eine vordere FOB (pendeln). Werk anklicken: Zeile „Abholbereit: x / 400“.
- **Achten:** Ein LKW auf der Route wartet mit Teilladung höchstens 60 s am Werk. Ressourcen-Fenster (Knopf „Ressourcen“): Zeile
  „davon an Werken“ bei Baumaterial, Munition, Treibstoff.
- **Fragen:** Lohnt sich das gegenüber der Hauptstadt? Ist die Hälfte des Ausstoßes (bei zugeteiltem LKW) zu viel oder zu wenig?

## 3. Häuserkampf
- **Weg:** Soldaten wählen, Rechtsklick auf ein Haus in der Konfliktzone (besetzen). Zum Ansehen ruhig `?debug=1`.
- **Achten:**
  - **Fensterseiten:** Am eigenen besetzten Haus zeigen kurze Striche in Teamfarbe, wo die Fenster sind (Seiten zur Straße).
    Durch blinde Seiten schießen die Besatzer nicht. Ein Angriffsbefehl auf ein Ziel hinter einer blinden Seite holt sie aus dem Haus.
  - **Zone:** Ein besetztes Haus in der Zone zählt wie 2 Soldaten mehr (Hot Zone 4). Besatzer sehen 25 % weiter.
  - **Ruinen:** Infanterie an einer Hausruine nimmt nur 70 % Schaden.
  - **KI:** baut ihre Häuser aus (Sandsäcke, Stacheldraht, MG-Nest sind am Haus zu sehen). Stürmen tut sie bekanntlich so gut wie nie.
- **Fragen:** Sind die Fensterstriche zu erkennen (2D und Iso, Taste V)? Sind Häuser jetzt zu stark oder zu schwach?

## 4. Musik und Lautstärke
- **Weg:** Startmenü und Pausenmenü (**P**): Regler „Geräusche“ und „Musik“.
- **Achten:** Ruhige Musik beim Aufbau, bei Kampf im Bild setzen Trommel, Pauke und Bass ein (in etwa 2 s), danach klingt es in
  etwa 8 s ab. In der Pause leiser, am Spielende ausgeblendet. F2 schaltet alles stumm.
- **Fragen:** Klingt es gut oder nervt es nach 10 Minuten? Lautstärke im Verhältnis zu den Geräuschen? Wechselt es zu oft?
  Auch auf iPad und Android prüfen (Ton startet dort erst nach der ersten Berührung).

## 5. KI-Luftabwehr und Scharfschützen
- **Weg:** Selbst Hubschrauber bauen (Heliport bzw. Hauptstadt) und angreifen; später Jets (Fliegerhorst).
- **Achten:** Die KI baut gegen Hubschrauber Gepard und Flak, gegen Jets SAM und Gepard (nicht auf Leicht). Bei vielen eigenen
  Soldaten baut sie ein paar Scharfschützen.
- **Fragen:** Reagiert sie zu schnell oder zu stark (bis 25 % ihrer Armee)?

## 6. Kleinigkeiten
- **Statistik am Spielende:** Partie mit 25 Siegpunkten zu Ende spielen. Stimmen die Zahlen ungefähr (ausgebildet, verloren, Abschüsse …)?
- **Fabrikhalle:** gewählt, mit der Maus über die Einheiten fahren – flackert nichts mehr, Klicks kommen an?
- **Bagger (Taste X in der Hauptstadt, dann G):** Staubwolke beim Baggern sichtbar?
- **Kerosin:** Mit Öl, Raffinerie und Kerosin-Raffinerie: bekommen beide Öl (Ressourcen-Fenster)?

## 7. Allgemein
- Läuft es flüssig, auch spät in der Partie mit großer Stadt? Wo ruckelt es (2D, Iso, Baumodus)?
- Ist irgendetwas unverständlich, ohne in die Hilfe (F1) zu schauen?
- Was macht keinen Spaß oder ist mühsam (z. B. am Handy)?

**Rückmeldung:** einfach Nummer und Stichwort, z. B. „1: zu eng, 500 px eher 300“ oder „4: Musik nach 5 min nervig“.
