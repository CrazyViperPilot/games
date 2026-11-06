# Frontline – Plan Weiterentwicklung (nach dem Review, ab v5.61)

Quelle: PRD §12 „Priorisierung“ (Could) und §13 „Geparkte Ideen“. Stand des Codes: v5.60, Cache `frontline-v173`.
Jedes Paket ist eine Version (Regel 7 in `CLAUDE.md`). Umgesetzt wird **ein Paket nach dem anderen**, nach Daniels Zeichen.
Für die Pakete ab P2 gilt PRD §13: erst ein Vorschlag zur Ausgestaltung (unten je Paket), Daniel bestätigt, dann bauen.

## Übersicht

| Paket | Inhalt | Quelle | Größe | Stand |
|---|---|---|---|---|
| **P1** | Statistik am Spielende + Doku-Abgleich §1/§13 | §12 Could, §13 | klein | **gebaut (v5.61)** |
| P2 | Häuserkampf I: Zonen-Nutzen besetzter Häuser (Punkte, Sicht), Ruinen als Deckung | §13 Häuserkampf | mittel | **gebaut (v5.62)** |
| P3 | Häuserkampf II: KI stürmt Häuser und baut sie zur Stellung aus; Feuerbereich je Haus | §13 Häuserkampf | mittel | **gebaut (v5.63)** |
| P4 | Musik (synthetisiert, je Lage ruhig/Gefecht) und Lautstärkeregler für Ton und Musik | §13 Musik | mittel | **gebaut (v5.64)** |
| P5 | Stadt: LKW holen Material direkt an Werken statt nur aus dem Lager der Hauptstadt | §13 SimCity-Stadt | groß | geparkt |
| P6 | KI-Lücken aus §10: KI baut Flak/SAM gegen Luft, Scharfschützen, Bagger | §10 „Nicht gebaut“ | mittel | geparkt |
| – | LLM für Gegner und Dialoge | §13 | – | nicht paketiert: Grundsatzfragen offen (Modell, Gerät/Server, Offline-PWA, Kosten) |

## P1 – Statistik am Spielende (v5.61)

Ziel: Der Endbildschirm zeigt für **beide Teams nebeneinander** eine kleine Bilanz der Partie.

### Simulation (`js/game/game.js`, kein DOM)
- Jedes Team bekommt im Konstruktor ein Feld `stats`:
  `{ trained: 0, lost: 0, kills: 0, buildingsLost: 0, buildingsKilled: 0, peakUnits: 0 }`.
  Das vorhandene `used: { mun, fuel }` und `earned` (in `reward()`) bleiben und werden mitgenutzt; `earned` im Konstruktor mit `0` anlegen.
- Zählen:
  - `trained`: jede Einheit, die eine **Ausbildung** fertigstellt (Warteschlange einer FOB/Hauptstadt in `js/game/economy.js` und die
    Ausbildung der Stadtgebäude, Fundstellen: `grep -rn "spawnUnit" js/game`). Nicht: Startarmee, kostenloser Nachschub.
  - `lost` / `kills`: in `cleanup()` für jede Einheit mit `hp <= 0` (nicht für Passagiere mit `hp > 0`): `lost` beim eigenen Team, `kills` beim Gegner.
  - `buildingsLost` / `buildingsKilled`: in `cleanup()` für Gebäude mit `hp <= 0`, die nicht `demolished` sind, ohne `wall` und `gate`.
  - `peakUnits`: höchste Zahl lebender Einheiten des Teams; einmal je Sekunde Spielzeit prüfen (nicht jeden Schritt über alle Einheiten zählen, wenn es eine vorhandene Zählung gibt, die nutzen).
- Spielstände: Ältere Stände haben kein `stats`. Beim Laden (`restoreAccessors` bzw. die Stelle in `js/game/savegame.js`, die nach dem Laden aufräumt)
  fehlende Felder mit 0 ergänzen. `SAVE_FORMAT` bleibt.
- Golden-Prüfsummen (`test/golden.test.js`) dürfen sich **nicht** ändern (keine Regeländerung, kein `game.rng`-Aufruf).

### Oberfläche
- `js/main.js`: an `showEnd` zusätzlich `teams: g.teams.map(t => ({ ...t.stats, earned: t.earned || 0, used: { ...t.used } }))` übergeben.
- `js/ui/menu.js` → `showEnd`: Tabelle mit Kopfzeile (leer | Blau | Rot, Namen aus `BALANCE.teamNames`), Zeilen:
  Spielzeit, Siegpunkte (wie bisher), Einheiten ausgebildet, Einheiten verloren, Abschüsse, Gebäude zerstört (= `buildingsKilled`),
  Gebäude verloren, Höchste Armeegröße, Geld aus Prämien (= `earned`), Munition verbraucht, Treibstoff verbraucht (gerundet, Tausender mit Punkt).
  Das eigene Team optisch hervorheben (vorhandene CSS-Klassen nutzen oder eine kleine Klasse in `css/` ergänzen).
  Fehlt `teams` (alter Aufruf), nur die bisherigen zwei Zeilen zeigen.

### Doku-Abgleich (beim Review aufgefallen)
- PRD §1 Zeile „Nicht im Umfang“: „Speichern laufender Partien“ streichen (gibt es seit v4.90, §16).
- PRD §13 „SimCity-Stadt“: „Verkehr“ ist seit v5.20 als Straßentransport gebaut (§15) – als gebaut vermerken, geparkt bleibt „LKW holen Material aus Werken“.
- PRD §12: „Statistik am Spielende“ als gebaut (v5.61) vermerken; PRD §9 bzw. §2 einen Satz zum Endbildschirm.
- PRD Änderungsverlauf: Eintrag v5.61 (Cache v174). `sw.js`: `CACHE_VERSION` auf `frontline-v174`.
- `CLAUDE.md` Feature-Landkarte: Zeile „Spielzustand, Befehle, Platzierung, Sieg“ um die Statistik ergänzen.

### Test
- Neue Datei `test/stats.test.js`: `new Game({ seed })`, Einheit ausbilden über `game.issue` → `trained` steigt; eine gegnerische Einheit
  mit `hp = 0` versehen, `game.update(dt)` → `lost`/`kills` stimmen; Gebäude ebenso; ein Spielstand ohne `stats` lädt ohne Fehler (Snapshot aus `test/save.test.js` als Vorbild).
- `npm run test:quick` und `npm test` grün, `test/golden.test.js` unverändert.

## P2 – Häuserkampf I (v5.62, von Daniel bestätigt am 2026-11-06, gebaut in v5.62)

Heute (v5.61) zählen Besatzer schon wie Einheiten für Zone, Hot Zone, Punkte und Limit und sehen mit Gebäude-Augenhöhe.
Neu kommt dazu (alle Werte in `BALANCE.garrison`, `js/data/balance.js`, mit deutschem Kommentar):

1. **Stellung in der Zone:** Jedes besetzte, nicht eingestürzte Haus, dessen Mitte in der Konfliktzone liegt, gibt seinem Team
   zusätzlich `zoneWeight: 2` Gewicht für die Zonenkontrolle (`weight` in `js/game/zone.js`, nicht `counts`, kein Geld).
   Ein gehaltenes Haus wiegt also so viel wie zwei Soldaten mehr. Liegt die Hausmitte auch in der Hot Zone: doppelt (wie Einheiten).
2. **Ausguck:** Besatzer sehen `sightMul: 1.25`-mal so weit (in `js/game/fog.js`, Stelle `u.house ? …`; die Wand-Zugabe `reach` bleibt).
   Gilt nur für das Aufdecken des Nebels, nicht für die Waffenreichweite.
3. **Ruinen als Deckung:** Infanterie (`def.armor === 'inf'`), die nicht in einem Haus sitzt und höchstens `ruinCover.r: 40` px vom Rand
   einer Ruine (eingestürztes Haus, `h.ruined`) entfernt steht, nimmt von Treffern nur `ruinCover.mul: 0.7` des Schadens
   (`ruinCover: { r: 40, mul: 0.7 }`). Gilt für direkte Treffer und Splash/Granaten, nicht für Splitter im Haus (`spill`) und nicht für Fahrzeuge.
   Stelle: wo Einheiten Schaden nehmen (`js/game/combat.js`, `target.hp -= amount` bzw. die gemeinsame Schadensfunktion suchen).
   Leistung: nur über die Liste der Ruinen laufen (z. B. `game.ruins` beim Einsturz in `js/game/garrison.js` füllen, mit Spielständen
   verträglich: fehlt die Liste nach dem Laden, aus `h.ruined` neu aufbauen), keine Allokationen je Treffer.
4. **Anzeige:** Hilfe (F1) in `js/ui/menu.js` ergänzen (Abschnitt Häuserkampf); Infozeile im HUD ist nicht nötig.

Doku: PRD §7 „Häuserkampf“ (drei Punkte ergänzen, Satz „Weiter geparkt“ in §13 kürzen), Änderungsverlauf v5.62, `CACHE_VERSION`
`frontline-v175`, `npm run docs`. Das ist eine gewollte Regeländerung: `test/golden.test.js` darf sich ändern, dann neu setzen mit
`GOLDEN=print node --test test/golden.test.js` (Anleitung im Testkopf) und die neuen Werte eintragen.

Test `test/garrison.test.js` (erweitern) oder neu `test/housefight.test.js`: Zonengewicht mit/ohne besetztes Haus; Sichtradius des
Besatzers größer; Infanterie an einer Ruine nimmt 70 % Schaden, weiter weg 100 %, Fahrzeug an der Ruine 100 %.

## P3 – Häuserkampf II (v5.63, von Daniel bestätigt am 2026-11-06)

### A. KI stürmt (Armee-KI `js/ai/ai.js`, Werte in `js/data/ai.js`, je Schwierigkeit in `BALANCE.difficulty`)
- Neue Methode `stormHouses(s)`, aufgerufen in `think()` direkt nach `garrisonZone(s)`, Takt `STORM_EVERY` (8 s, über `this.once`).
- Ziel: vom Gegner besetztes, lebendes Haus, das die KI sieht (`game.sees`) und dessen Mitte in der Konfliktzone liegt.
- Stürmer: eigene freie Infanterie (nicht im Haus, nicht schon `storm`/`garrison`-Befehl, nicht Kommandeur) im Umkreis `STORM_RANGE` (450 px).
- Nur wenn Zahl der Stürmer ≥ `STORM_RATIO` (2) × Besatzung des Hauses und ≥ `STORM_MIN` (3). Es gehen höchstens `STORM_MAX` (8), die nächsten zuerst.
  Hat das Haus Stacheldraht, gilt `STORM_RATIO` × 1,5. Je Takt höchstens ein Haus.
- Befehl nur über `game.issue(team, { type: 'storm', ids, houseId })`.
- Schwierigkeit: `BALANCE.difficulty.<stufe>.houseStorm` (easy `false`, normal und hard `true`).

### B. KI baut Häuser aus (Stadt-unabhängig, also Armee-KI)
- Neue Methode `fortifyHouses(s)`, Takt `HOUSE_WORK_EVERY` (10 s). Für jedes eigene besetzte Haus ohne laufende Arbeit: nächste fehlende Arbeit
  in der Reihenfolge `HOUSE_WORK_ORDER` (`['sandbags', 'wire', 'mgnest']`), nur wenn Geld ≥ Preis + `HOUSE_WORK_RESERVE` (400). Je Takt höchstens ein Auftrag.
- Befehl `{ type: 'fortifyHouse', houseId, work }`. Schwierigkeit: `BALANCE.difficulty.<stufe>.houseWorks` (easy `false`, normal und hard `true`).

### C. Feuerbereich (Fenster) für Besatzer in Stadthäusern (nicht Gefechtstürme)
- Beim Anlegen der Häuser (`createHouses` in `js/game/garrison.js`) bekommt jedes Haus `h.windows = { n, e, s, w }` (true = Fensterseite).
  Fensterseite ist eine Seite, deren Mittelpunkt höchstens `BALANCE.garrison.streetReach` (60 px) von einer Stadtstraße entfernt liegt
  (Strecke aus `game.map.town.roads` ohne Feldwege, Abstand über `segDist` aus `js/game/roads.js`). Liegt keine Seite an einer Straße, sind alle vier offen.
  (Revision nach Nachmessung: Häuser stehen auf Zufallskarten 60–120 px auseinander, die Nachbarregel mit 14 px griff nie.)
- Besatzer dürfen nur Ziele beschießen und als Ziel wählen, deren Richtung durch eine Fensterseite geht. Eine Hilfsfunktion
  `houseCanFire(game, u, target)` in garrison.js (true außerhalb von Stadthäusern), genutzt in der Zielsuche und vor dem Schuss in `js/game/combat.js`.
  Keine Allokationen je Aufruf.
- Spielstände: Häuser ohne `windows` (alte Stände) gelten als rundum offen.
- Anzeige: Beim eigenen besetzten Haus zeichnet der Renderer an jeder Fensterseite einen kurzen Strich in Teamfarbe (2D und Iso, an der
  Stelle, wo das Schild `drawGarrison` in `js/render/renderer.js` gezeichnet wird). Klein halten, nur Bild.

### Doku und Test
- PRD §7 „Häuserkampf“ (Sätze „Die KI stürmt nicht“ und „Die KI baut nichts aus“ ersetzen, Feuerbereich ergänzen), §10 KI (Häuserkampf-Zeile)
  und Tabelle „KI-Konstanten“ (neue Konstanten), §13 „Weiter geparkt“ kürzen (bleibt: Kampf von Raum zu Raum), Hilfe (F1) in `js/ui/menu.js`,
  Änderungsverlauf v5.63, `CACHE_VERSION` `frontline-v176`, `npm run docs`, Feature-Landkarte in `CLAUDE.md`.
- Test `test/housefight2.test.js`: KI (Normal) stürmt ein Haus mit 1 Besatzer, wenn 4 eigene Schützen daneben stehen, nicht bei 1;
  Leicht stürmt nicht; KI baut mit genug Geld Sandsäcke, ohne Geld nicht; blinde Seite zwischen zwei eng stehenden Häusern;
  Besatzer schießt nicht durch die blinde Seite, wohl durch eine Fensterseite.
- Gewollte Regeländerung: Golden-Werte dürfen sich ändern (dann neu setzen nach Anleitung im Testkopf, im Bericht nennen).

## P4 – Musik und Lautstärke (v5.64, von Daniel bestätigt am 2026-11-06)

Reines Browser-Modul wie `js/audio/sound.js` (kein Teil der Simulation, liest nur; `Math.random` ist hier erlaubt, nicht in `js/game`).

### Musik (`js/audio/music.js`, neu, in `sw.js` → `ASSETS`)
- `export class Music`, erzeugt von `Sound` bzw. in `main.js` und an denselben AudioContext gehängt (eigener Gain-Bus `music`, direkt in
  `ctx.destination`, nicht durch den Kompressor der Geräusche). Kein Audiodatei-Laden, alles mit Oszillatoren und dem Rausch-Puffer.
- Takt: ein Vorausplaner (Lookahead): `update(dt)` plant die Noten der nächsten ~0,25 s mit `ctx.currentTime`; 96 BPM, Viertel-Raster, 4/4.
- Stück: Akkordfolge in d-Moll (Dm – B♭ – F – C, je ein Takt, endlos). Zwei Schichten, beide laufen immer, nur die Pegel ändern sich:
  - **Ruhig:** weiche Flächen (zwei verstimmte Sägezahn- oder Dreieck-Oszillatoren durch Tiefpass, langsamer Anstieg) je Akkord und eine leise Glocke (Sinus) mit einer Note je Halbtakt aus dem Akkord.
  - **Gefecht:** Marschtrommel (Rauschen, Bandpass, Muster „x . x x | x . x .“ je Achtel), tiefe Pauke auf 1 und 3, Bass-Ostinato (Grundton in Achteln, Rechteck durch Tiefpass).
- Lage `intensity` 0…1: Ziel 1, wenn in den letzten 6 s mindestens `BATTLE_EFFECTS` (6) Kampfeffekte (`game.effects` der Arten Schuss, Einschlag,
  Explosion, Tod; Namen im Code nachsehen) im Bild der Kamera oder in der Nähe eigener Einheiten/Gebäude lagen oder die Basis angegriffen wird
  (vorhandene Meldung nutzen, falls einfach); sonst 0. Weich nachgeführt (hoch in 2 s, runter in 8 s). Ruhige Schicht = 1 − 0,6·intensity, Gefecht = intensity.
- Pause: Musik leiser (×0,3), nicht stumm. Spielende: Musik blendet in 3 s aus. Ton aus (F2, Schalter): alles stumm wie heute.
- Alle Musikwerte als Konstanten oben in `music.js` mit deutschem Kommentar.

### Lautstärke
- Zwei Regler 0–100 %: **Geräusche** (Standard 80 %) und **Musik** (Standard 50 %), gespeichert unter `frontline-ton-laut` und `frontline-musik-laut`
  (Lesen/Schreiben mit try/catch wie `loadSoundOn`). Geräusche: `master.gain = MASTER × Wert`. Musik: Gain des Musik-Busses. Musik bei 0 % plant keine Noten.
- Startmenü (`js/ui/menu.js`, beim Schalter „Ton“) und Pausenmenü (`showPause`): je ein `<input type="range">` mit Beschriftung und Prozentzahl, wirkt sofort
  (Pausenmenü live über eine Rückruf-Funktion aus `main.js`). Der An/Aus-Schalter (🔊/🔇, F2) bleibt.

### Doku und Test
- PRD §14 (Musik und Regler), §1 („Musik“ aus „Nicht im Umfang“ streichen), §13 Musik als gebaut, Hilfe (F1), Änderungsverlauf v5.64,
  `CACHE_VERSION` `frontline-v177`, Feature-Landkarte in `CLAUDE.md` (Zeile Ton).
- Test `test/music.test.js` mit dem Attrappen-AudioContext aus `test/sound.test.js` (dort ggf. in eine kleine Hilfsdatei auslagern):
  kein Absturz über 60 s Spiel, intensity steigt bei vielen Kampfeffekten und fällt danach, bei Musik 0 % werden keine Noten geplant,
  Lautstärke wird gespeichert und gelesen (localStorage-Attrappe). `test/assets.test.js` muss grün bleiben.

## P5 – Material aus Werken (Vorschlag)
- LKW einer FOB dürfen BM/MUN/TS direkt am nächstgelegenen Werk laden, wenn es näher ist als die Hauptstadt; Werk führt dafür ein kleines Ausgangslager.

## P6 – KI-Lücken (Vorschlag)
- KI baut Flak/SAM, sobald der Gegner Hubschrauber oder Jets hat; Scharfschützen in kleiner Zahl; Bagger nur für Straßen der Stadt.
