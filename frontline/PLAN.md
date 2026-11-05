# Frontline – Umsetzungsplan v5.20: Straßentransport und Warenketten

> **Umgesetzt in v5.20** (AP1 bis AP6). Dieser Plan bleibt als Nachweis; die Regeln stehen in [PRD.md](PRD.md) §15 „Straßentransport (seit v5.20)“, der Aufbau in [ARCHITEKTUR.md](ARCHITEKTUR.md). Wo Plan und Code abweichen, gilt der Code.

Daniels Wunsch: Die Straßen verbinden alles. Rohstoffe fahren über angeschlossene Straßen zum nächsten Werk und von dort weiter
bis ins Lager. Neue Kette Erz → Roheisen → Stahl → Munition, zwei Raffinerien (Treibstoff für Fahrzeuge, Kerosin für Luftfahrzeuge),
Straßen mit Kapazität, Pendler brauchen auch Kapazität.

Gilt nur **mit Stadt** (`game.city`). Ohne Stadt bleibt alles, wie es ist (Hauptstadt unendlich, keine Transportlogik).
Regeln aus `frontline/CLAUDE.md` gelten (Daten nach `js/data/`, deutsche Kommentare, `npm run docs`, PRD, `CACHE_VERSION`).
Version: **v5.20** (main hat v5.17, der Branch v5.19).

---

## 1. Modell in Worten

### 1.1 Waren und Ketten
| Schritt | Gebäude (Zellenart) | Von | Nach | Ziel der Lieferung |
|---|---|---|---|---|
| Förderung | Förderanlage `mine` (Holzfäller, Steinbruch, Erzmine, Ölquelle) | Vorkommen | Holz, Stein, Erz, Öl | nächstes passendes Werk über die Straße |
| BM | BM-Werk `bm` | Holz **oder** Stein | Baumaterial | Lager |
| Roheisen | **Hütte `smelter` (neu, 2 × 2)** | Erz | Roheisen (`iron`, Zwischenprodukt ohne Lager) | nächstes Stahlwerk |
| Stahl | Stahlwerk `steel` (bisher Erz → Metall) | **Roheisen** | **Stahl** (interner Schlüssel bleibt `metal`) | Lager (Stadtlager `c.metal`) |
| Munition | Munitionswerk `mun` | Stahl **aus dem Lager** (wird über die Straße hingefahren) | Munition | Lager |
| Treibstoff | Raffinerie `fuel` | Öl | Treibstoff (Diesel/Benzin, Fahrzeuge) | Lager |
| Kerosin | **Kerosin-Raffinerie `kero` (neu, 2 × 2)** | Öl | **Kerosin** (`kero`, Stadtlager `c.kero`) | Lager |

- **Lager** = die Hauptstadt (`game.mainFob(team)`, fertig und lebend). BM, MUN, TS landen wie bisher in `main.store`, Stahl in
  `c.metal`, Kerosin in `c.kero` (neu, Start `CITY.startKero`). Obergrenze: Stahl und Kerosin `BALANCE.logistics.storeCap`,
  BM/MUN/TS `BALANCE.logistics.capitalCap` (wie bisher).
- **Stahl** ist im Spiel die Ware, die bisher „Metall“ hieß: Fahrzeuge, Reparaturen, Markt und Munition verbrauchen sie. Der Schlüssel
  `metal` bleibt im Code (Speicherstände, viele Stellen), **alle sichtbaren Texte** heißen ab jetzt „Stahl“.
- **Kerosin** brauchen Luftfahrzeuge: Die F-16 tankt am Flughafen Kerosin aus `c.kero` (statt TS aus dem Lager), Hubschrauber im
  Umkreis eines Heliports tanken dort Kerosin aus `c.kero` (zusätzlich zum bisherigen Tanken an FOBs mit TS, das bleibt).
- Öl geht zur **nächsten** Raffinerie, egal welcher Art (`fuel` oder `kero`). Wer beides will, baut zwei Ölquellen oder stellt die
  Raffinerien passend.

### 1.2 Straßennetz, Anschluss, Wege
- Straßenzellen eines Teams: eigene Straßen (`c.kind[i] === KIND_ID.road`) und Stadtstraßen der Karte (`c.mapRoads[i]`), also genau
  `roadAt(c, i)`. Nachbarschaft: 4er.
- **Anschluss eines Gebäudes** (Ankerzelle `a`, alle Zellen `cellsOf(c, a)`): alle Straßenzellen, die an eine seiner Zellen grenzen.
  Für Wohnen, Gewerbe und BM-Werk ohne eigenen Anschluss gilt wie in `hasRoad` der Anschluss eines direkt benachbarten Gebäudes gleicher
  Art (die „Kette“, `CHAIN`).
- **Anschluss des Lagers** (Hauptstadt): alle Straßenzellen, deren Zellrechteck das Rechteck der Hauptstadt (Fußabdruck
  `b.w × b.h` Kacheln um `b.x, b.y`) erweitert um `CITY.fobMargin + CITY.cell` px schneidet.
- **Wege**: kürzester Weg über Straßenzellen (jede Zelle kostet 1). Ein Gebäude liefert an das **nächste** Ziel der passenden Art im
  selben Netz (Breitensuche von allen Zielen gleichzeitig). Weiter als `CITY.transport.maxDist` Zellen = kein Ziel.
- Kein Weg = **keine Lieferung**. Die Ware geht verloren (das Werk arbeitet ins Leere), das Gebäude meldet es im Info-Text.

### 1.3 Kapazität und Stau
- Jede Straßenzelle trägt `CITY.transport.cap` Einheiten je Sekunde (Stadtstraßen der Karte `CITY.transport.mapCap`).
- **Last** einer Zelle = Summe aller Lieferflüsse, deren Weg über sie führt (gewollte Menge, vor dem Stau) + Pendler.
- **Pendler**: Jede Arbeitsstätte (alles mit Arbeitsplätzen: Gewerbe, Markt, Werke, Förderung, Kraftwerk, Uni, Rechenzentrum)
  schickt `Arbeiter × CITY.transport.commute` Last über den Weg zur **nächsten bewohnten Wohnzelle** (Stufe ≥ 1, nicht geflohen).
  Ohne Weg zu Wohnen: keine Arbeiter dort (Wirkung 0).
- **Stau-Faktor** einer Zelle: `min(1, cap / Last)`, geglättet: `f += (ziel − f) × min(1, dt / CITY.transport.smooth)`.
  Er wird aus den Lasten des **vorigen** Schritts gerechnet (eine Runde Verzögerung, kein Iterieren).
- **Wirkung eines Weges** = kleinster Stau-Faktor auf dem Weg (leerer Weg, z. B. Gebäude direkt am Ziel: 1).
- Ein Lieferfluss kommt mit `Menge × Wirkung` an. Pendler: die Arbeit des Gebäudes wird mit der Wirkung seines Pendlerwegs
  multipliziert (Arbeiter kommen zu spät).

### 1.4 Rechnung je Schritt (ersetzt die Sammelrechnung in `updateCity`)
Wie bisher: `fill`, `powerRatio`, `mood`. Neu je Gebäude `b`:
`eff_b = fill × powerRatio × mood × pendler_b`.
1. Förderanlage: `roh = jobsMine[lv] × eff_b × CITY.extract[d]` → Fluss zum nächsten Werk (Holz/Stein → `bm`, Erz → `smelter`,
   Öl → `fuel` oder `kero`); `ankunft = roh × wirkung(weg)`, Eingang des Zielwerks += ankunft.
2. BM-Werk: `aus = min(jobs[lv] × eff × Y.bm, (holz + stein) / K.bm)` → Lager (× wirkung).
3. Hütte: `aus = min(jobs × eff × Y.iron, erz / K.iron)` → nächstes Stahlwerk (× wirkung).
4. Stahlwerk: `aus = min(jobs × eff × Y.metal, roheisen / K.metal)` → Lager (Stahl).
5. Raffinerie / Kerosin-Raffinerie: `aus = min(jobs × eff × Y.fuel bzw. Y.kero, öl / K.fuel bzw. K.kero)` → Lager.
6. Munitionswerk (Weg zum Lager nötig): `bedarf = jobs × eff × Y.mun × K.mun` (Stahl/s), höchstens was das Lager hergibt
   (`c.metal / dt` nach Schritt 4). Abgezogen wird `bedarf`; an kommt `bedarf × w`; Munition `= bedarf × w / K.mun`, die im Lager mit
   `× w` ankommt (w = Wirkung des Weges). Last auf dem Weg: Stahl hin + Munition zurück.
7. Reihenfolge: Förderung → Hütte → Stahlwerk/BM/Raffinerien → Lager gutschreiben → Munitionswerke.
8. Ohne Lager (Hauptstadt zerstört): Werke liefern nichts, Munitionswerke stehen.
9. Wachstum: **auch Förderanlagen brauchen jetzt eine Straße** (bisher nicht). In `updateCity` die Ausnahme `kind !== 'mine'` entfernen.

### 1.5 Zahlen (Startwerte, alles in `CITY`)
```
transport: { cap: 12, mapCap: 20, commute: 0.05, maxDist: 160, reroute: 3, smooth: 2 }
yield: + iron: 0.06, + kero: 0.04          (metal bleibt 0.05, jetzt Roheisen → Stahl)
convert: iron: 2 (Erz je Roheisen), metal: 1 (Roheisen je Stahl), kero: 1.2 (Öl je Kerosin); bm 1, fuel 1, mun 0.5 bleiben
cost: smelter 50, kero 50 · size: smelter 2, kero 2 · power.use: smelter 10, kero 8
startKero: 300 · market.sell.kero 35, market.buy.kero 140
ai.mix: { com: 2, bm: 3, mun: 2, fuel: 2, kero: 1, smelter: 2, steel: 2, market: 0.3 } · ai.lowKero: 200
chain: bm {wood, stone → bm}, smelter {ore → iron}, steel {iron → metal}, fuel {oil → fuel}, kero {oil → kero}, mun {metal → mun}
```
Beispiel: BM-Werk Stufe 3 (40 Arbeiter) macht bis 4 BM/s aus 4 Holz/s, seine Pendler wiegen 2/s; eine eigene Straße trägt 12/s,
also etwa zwei volle Ketten. Dichte Städte brauchen mehrere Straßen.

---

## 2. Verbindliche Schnittstellen

### 2.1 `js/game/city.js`
- `KINDS` **hinten** erweitern: `[..., 'airport', 'smelter', 'kero']`. Bestehende IDs dürfen sich nicht ändern (Speicherstände).
- `KIND_NAME.smelter = 'Hütte'`, `KIND_NAME.kero = 'Kerosin-Raffinerie'`; `WORKS = ['bm', 'mun', 'fuel', 'steel', 'smelter', 'kero']`.
- `GOODS = ['bm', 'mun', 'fuel', 'metal', 'kero']` (Markt).
- Neues Feld je Stadt `c.kero` (Start `CITY.startKero`), in `migrateCity`: `c.kero ??= 0`.
- `totals` und die Flussanzeige-Felder (`s.cap`, `s.inp`, `s.gross`, `s.n`) um `iron` und `kero` ergänzen; `zeroStats` um `kero`, `iron`.
- Exportiert (neu, für transport.js): `export function accessCells(c, a)` → Array der Straßenzellen-Indizes am Gebäude mit Anker `a`
  (Regeln aus 1.2, inkl. Kette) und `export const WORKS_KINDS = WORKS`.

### 2.2 `js/game/transport.js` (neu, kein DOM, in `sw.js` ASSETS eintragen)
```js
export function transportOf(game, c)            // Zustand (lazy, WeakMap je Stadt, NICHT im Spielstand); neu, wenn c.ver/Hauptstadt sich ändert oder alle reroute s
  // → { routes: Map<anker, { to: anker | 'main' | null, path: Int32Array, dist }>,   // Lieferweg je Gebäude
  //     commute: Map<anker, Int32Array | null>,                                     // Pendlerweg je Arbeitsstätte (null = kein Wohnen erreichbar)
  //     mun: Map<anker, Int32Array | null>,                                         // Weg Munitionswerk ↔ Lager
  //     load: Float32Array, factor: Float32Array, cap: Float32Array }               // je Stadtzelle
export function nearestField(c, sources, cap)   // Breitensuche von mehreren Startzellen: { dist: Int32Array, prev: Int32Array, owner: Int32Array }
export function pathFrom(field, starts)          // kürzester Weg von einer der Zellen `starts` zu ihrem Ziel: { path: Int32Array, owner } | null
export function pathEff(tr, path)                // kleinster tr.factor auf dem Weg (leer: 1)
export function addLoad(tr, path, amount)        // tr.load[i] += amount für jede Zelle des Weges
export function beginLoads(tr)                   // load auf 0 (zu Beginn jedes updateCity-Schritts)
export function settleLoads(tr, dt)              // factor aus load und cap glätten (Ende des Schritts)
export function mainAccess(game, c)              // Straßenzellen am Lager (Hauptstadt), [] ohne Hauptstadt
```
Ziele je Ware: `TARGET = { wood: ['bm'], stone: ['bm'], ore: ['smelter'], oil: ['fuel', 'kero'], iron: ['steel'] }`, Produkte von
`bm`, `steel`, `fuel`, `kero`, `mun` → `'main'`. Nur **fertige** Gebäude (Stufe ≥ 1) sind Ziele und Lieferanten.

### 2.3 Darstellung / UI (lesen nur)
- `c.tr`-Ersatz: `transportOf(game, c)` liefert `load`, `cap`, `factor` und je Gebäude `info` (`transportInfo(game, c, anker)` →
  `{ to: 'BM-Werk' | 'Lager' | null, dist, eff, commuteEff, noHome: bool }`), exportiert aus transport.js.

---

## 3. Arbeitspakete (nacheinander, jedes für sich lauffähig)

### AP1 – Daten, neue Gebäude, Stahl/Kerosin (Dateien: `js/data/city.js`, `js/game/city.js` (nur Daten-/Namensteile, `KINDS`, `GOODS`, `migrateCity`, `zeroStats`, Markt), `js/game/flow.js`, `js/ui/flowpanel.js`, `js/ui/citypanel.js`, `js/render/works.js`, `js/render/citylayer.js` (Farben/Icons), sichtbare Texte „Metall“ → „Stahl“ in `js/**`, `test/config.test.js`, `test/flow.test.js`)
- Werte aus 1.5 eintragen, `CITY.chain` neu (Reihenfolge wie in 1.5; `flow.js` muss `iron` als Zwischenprodukt ohne Bestand zeigen
  und `kero` als Ware mit Bestand `c.kero`). `GOOD_NAME.metal = 'Stahl'`, `GOOD_NAME.kero = 'Kerosin'`, `iron` = 'Roheisen'.
- Werkzeugleiste: zwei neue Werkzeuge (Hütte, Kerosin-Raffinerie) mit Farbe, Icon, Kurzname, Hinweis; Bauvorschau 2 × 2 wie die anderen Werke.
- `render/works.js`: Aussehen Hütte (Hochofen: hoher Turm mit Glut, Schornstein) und Kerosin-Raffinerie (Kugeltanks, blaue Tankringe)
  in 2D und Iso nach dem Muster von `fuelIso/fuelTop`, `steelIso/steelTop`; `worksLift` ergänzen.
- Markt: Kerosin handelbar (`CITY.market`), Marktmenü zeigt es.
- **Noch keine Transportlogik**: Die bisherige Sammelrechnung in `updateCity` bleibt in AP1 vorerst, wird aber auf die neue Kette
  umgestellt (Hütte macht Roheisen aus Erz, Stahlwerk Stahl aus Roheisen, Kerosin-Raffinerie Kerosin aus Öl, Öl wird anteilig nach
  Arbeitsplätzen auf beide Raffinerien verteilt). So bleibt das Spiel nach AP1 spielbar.
- Tests anpassen, bis `npm test` grün ist (z. B. Tests, die Erz → Metall erwarten, brauchen jetzt Hütte + Stahlwerk).

### AP2 – `js/game/transport.js` (neu) + `accessCells`/`mainAccess` + Tests `test/transport.test.js`
- Schnittstelle 2.2 genau so. Breitensuche mit vorab angelegten Typed Arrays (Größe `c.cols × c.rows`), Warteschlange als Int32Array.
- Zustand in einer `WeakMap` je Stadtobjekt (nicht in `c`, damit er nicht gespeichert wird); neu berechnen, wenn `c.ver`, die ID der
  Hauptstadt oder `c.mapRoads` sich ändern, sonst höchstens alle `CITY.transport.reroute` s.
- Tests: Weg über Straßen, kein Weg ohne Verbindung, nächstes Ziel gewinnt, Stau-Faktor < 1 bei Überlast, Lager-Anschluss.

### AP3 – Rechnung in `updateCity` (Datei: `js/game/city.js`; `js/game/aircraft.js` Kerosin am Flughafen; `updateCare` Kerosin am Heliport)
- Sammelrechnung durch 1.4 ersetzen. Je Schritt: `beginLoads`, Flüsse und Pendler eintragen, Lager gutschreiben, `settleLoads`.
- `c.stats` wie bisher füllen (für HUD und Flussanzeige: `raw`, `bm`, `mun`, `fuel`, `metal`, `kero`, `cap`, `inp`, `gross`, `n`,
  `money`), dazu `s.lost` (Waren/s ohne Weg) und `s.jam` (kleinster Stau-Faktor aller benutzten Wege).
- Förderanlagen brauchen zum Wachsen eine Straße.
- F-16 tankt am Flughafen aus `c.kero` (mit Stadt); Heliport tankt Hubschrauber in seinem Pflege-Umkreis aus `c.kero`
  (`CITY.care` um `refuel: <Anteil des Tanks je s>` ergänzen, z. B. 0.05).
- Ohne Stadt: nichts ändert sich (Tests prüfen das).

### AP3b – Gewerbe neu ausbalanciert (Datei: `js/data/city.js`, `js/game/city.js`, `js/game/flow.js`, Tests)
Aus der Analyse (Gewerbe war mit Abstand die stärkste Geldquelle, Zufriedenheit sättigte früh, Hinweis in der Flussanzeige griff kaum):
- **Steuer senken:** `CITY.taxCom` 0.15 → **0.07** (Geld/s je Gewerbe-Arbeiter).
- **Gewerbe braucht Waren:** Jedes Gewerbe (und der Markt) verbraucht `CITY.shop.need` Baumaterial je Arbeiter und Sekunde
  (Startwert 0.004) aus dem Lager, über die Straße angeliefert (Weg Gewerbe ↔ Lager wie beim Munitionswerk, Last = Bedarf).
  Versorgung `v = angekommen / Bedarf` (0 … 1; ohne Weg oder leeres Lager 0). Steuer des Gewerbes und sein Anteil an der Zufriedenheit
  (`shops`) wirken mit `CITY.shop.base + (1 − CITY.shop.base) × v` (Startwert base 0.3). So wird das Lager eine Senke für Überschüsse.
- **Eigene Nachfrage:** Gewerbe wächst (neue Stufe) nur, solange Gewerbe-Arbeitsplätze ≤ Einwohner × `CITY.shop.per` (0.25);
  Stufe 1 entsteht wie bisher immer.
- **Einheitlicher Nenner:** `shop` in der Zufriedenheit teilt durch `pool` (arbeitsfähige Einwohner) statt `pop`, wie die Steuer.
- **Flussanzeige:** Hinweis „Gewerbe bauen“ nur, wenn der Läden-Anteil der Zufriedenheit unter 50 % liegt (nicht bei jeder niedrigen
  Zufriedenheit); neuer Hinweis „Gewerbe ohne Waren“, wenn v < 0.5.
- `s.jobsCom` bleibt (wird jetzt für den Hinweis gelesen).
- PRD §15: Gewerbe-Absatz neu, KI-Mix-Text an den Code angleichen (inkl. Markt 0,3), „Uni ab 6 Arbeitsstätten (Zellen, auch Gewerbe)“.
- Test: Gewerbe ohne Straßenweg zum Lager zahlt nur base-Anteil Steuer; mit Weg und BM im Lager voll; BM im Lager sinkt.

### AP4 – Startviertel und KI (Dateien: `js/game/city.js` – `startQuarter`, `aiCity`, `aiNeed`, `depositCells`, neue Hilfsfunktion `connectRoad`)
- `connectRoad(game, c, a, pay)`: Breitensuche über ausweisbare, leere, freie Zellen (`canZone`, `!c.kind`, `cellFree`) von den
  Nachbarzellen des Gebäudes `a` zur nächsten Straßenzelle, die mit dem Lager verbunden ist; legt dort Straßen (pay: über `game.issue`
  mit Baumaterial, sonst direkt). Höchstens 30 Zellen, sonst nichts tun.
- Startviertel: Ölquelle per `connectRoad` (ohne Kosten) an die Startstraße anschließen; Startviertel um eine Kerosin-Raffinerie?
  Nein – nur bestehende Raffinerie, Kerosin erst, wenn der Spieler sie baut (Startlager Kerosin reicht für den Anfang).
- KI: `aiNeed` kennt `smelter` und `kero` (Mix aus 1.5; `low.kero`, wenn `c.kero < A.lowKero` und Öl gefördert wird; Hütte nur, wenn
  ein Stahlwerk da ist oder gleichzeitig gebaut wird, Stahlwerk braucht Hütte). Nach dem Bau einer Förderanlage und je Takt für ein
  nicht angeschlossenes Gebäude `connectRoad` (über Befehle, `perStep` beachten).
- `test/ai.test.js` und `test/city.test.js` grün; die KI-Stadt muss in KI-gegen-KI-Tests weiter Munition und Stahl erzeugen.

### AP5 – Anzeige (Dateien: `js/render/citylayer.js`, `js/ui/hud.js` (`cityInfo`), `js/ui/citypanel.js`, `js/ui/flowpanel.js`, `js/game/flow.js`, `js/ui/menu.js`)
- Baumodus: Straßen nach Auslastung färben (grün < 60 %, gelb < 100 %, rot ≥ 100 %, `load / cap`); Gebäude ohne Lieferweg oder
  ohne Pendlerweg bekommen ein rotes Warnzeichen „🚫“ am Schild.
- Info eines Stadtgebäudes: „Liefert an: Stahlwerk (14 Felder) · Weg 85 %“, „Kein Straßenweg zu einer Hütte“, „Pendler: Stau 70 %“,
  „Keine Wohnung über die Straße erreichbar“.
- Flussanzeige: neue Knoten Hütte, Roheisen, Kerosin-Raffinerie, Kerosin; Engpass-Texte „Stau auf den Straßen“, „Waren ohne Weg“.
- Leiste oben im Baumodus: „Stahl“ statt „Metall“, dazu Kerosin.
- Hilfe (F1, `menu.js`): Transport, Kapazität, Pendler, neue Gebäude.

### AP6 – Doku und Feinschliff (Dateien: `PRD.md`, `ARCHITEKTUR.md`, `CLAUDE.md`, `sw.js`)
- PRD §15 neuer Abschnitt „Straßentransport (seit v5.20)“ mit 1.1–1.5 in Worten, Ressourcenanzeige, Markt, Kerosin, Umbenennung
  Stahl; Änderungsverlauf v5.20; `npm run docs`; `CACHE_VERSION` +1; Feature-Landkarte und „Wo ändere ich was?“ (CITY.transport).
- PRD §15 „Räumen“: seit v5.20 lässt Räumen Rohstoffvorkommen und Förderanlagen stehen (Meldung), nur „Abreißen“ eines gewählten
  Gebäudes (`cmd.demolish`) entfernt eine Förderanlage; das Vorkommen bleibt immer (schon umgesetzt, nur dokumentieren).
- `npm test` vollständig grün, Laufzeit nicht mehr als 15 % länger als vorher.

---

## 4. Prüfung (Review)
Nach AP6 prüft ein Review: Rechnung gegen 1.4, keine Ware entsteht aus dem Nichts (Lager-Zuwachs ≤ Förderung über die Kette),
Speicherstände (alt laden, neu speichern/laden), ohne Stadt unverändert, Performance (Breitensuche nur bei Änderungen), KI baut
funktionierende Ketten, Texte „Stahl“ überall.
