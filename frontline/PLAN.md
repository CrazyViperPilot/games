# Frontline – Plan Weiterentwicklung (nach dem Review, ab v5.61)

Quelle: PRD §12 „Priorisierung“ (Could) und §13 „Geparkte Ideen“. Stand des Codes: v5.60, Cache `frontline-v173`.
Jedes Paket ist eine Version (Regel 7 in `CLAUDE.md`). Umgesetzt wird **ein Paket nach dem anderen**, nach Daniels Zeichen.
Für die Pakete ab P2 gilt PRD §13: erst ein Vorschlag zur Ausgestaltung (unten je Paket), Daniel bestätigt, dann bauen.

## Übersicht

| Paket | Inhalt | Quelle | Größe | Stand |
|---|---|---|---|---|
| **P1** | Statistik am Spielende + Doku-Abgleich §1/§13 | §12 Could, §13 | klein | **in Arbeit (v5.61)** |
| P2 | Häuserkampf I: Zonen-Nutzen besetzter Häuser (Punkte, Sicht), Ruinen als Deckung | §13 Häuserkampf | mittel | geparkt |
| P3 | Häuserkampf II: KI stürmt Häuser und baut sie zur Stellung aus; Feuerbereich je Haus | §13 Häuserkampf | mittel | geparkt |
| P4 | Musik (synthetisiert, je Lage ruhig/Gefecht) und Lautstärkeregler für Ton und Musik | §13 Musik | mittel | geparkt |
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

## P2 – Häuserkampf I (Vorschlag)
- Besetztes Haus in der Konfliktzone zählt für die Zonenkontrolle wie seine Besatzung (heute schon?) plus Sichtbonus aus dem Haus (Weitsicht wie erhöht).
- Ruinen eingestürzter Häuser geben Infanterie darin Deckung (weniger Schaden, Wert in `BALANCE.garrison`).

## P3 – Häuserkampf II (Vorschlag)
- KI stürmt besetzte Häuser in der Zone, wenn sie überlegen ist, und baut eigene besetzte Häuser aus (Werte in `js/data/ai.js`, `GARRISON_*`).
- Feuerbereich: Besatzung schießt nur in die Richtungen mit Fenstern (Hausseiten zur Straße), sichtbar beim Wählen.

## P4 – Musik (Vorschlag)
- Synthetisierte Musik (WebAudio, wie `js/audio/sound.js`), zwei Stimmungen: ruhig (Aufbau) und Gefecht (Kampf in Sicht), weich überblendet.
- Startmenü und Pause: zwei Regler (Geräusche, Musik), gespeichert unter `frontline-…`.

## P5 – Material aus Werken (Vorschlag)
- LKW einer FOB dürfen BM/MUN/TS direkt am nächstgelegenen Werk laden, wenn es näher ist als die Hauptstadt; Werk führt dafür ein kleines Ausgangslager.

## P6 – KI-Lücken (Vorschlag)
- KI baut Flak/SAM, sobald der Gegner Hubschrauber oder Jets hat; Scharfschützen in kleiner Zahl; Bagger nur für Straßen der Stadt.
