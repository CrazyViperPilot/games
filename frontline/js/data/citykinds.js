// Register der Stadtzellenarten (seit v5.59, Review-Paket P6, Befunde E-01, Q-03, A-02): eine Quelle je Art für Nummer, Namen,
// Werkzeug, Preise, Größe, Strom, KI-Zielwert und Rolle. Regeln: PRD §15. Kein DOM, kein Import (js/data/city.js liest von hier).
// Daraus abgeleitet: KINDS/KIND_ID/KIND_NAME (Raster und Spielstand), CITY.cost/costBm/size/power.use/ai.targetValue/retired
// (js/data/city.js), Rollenlisten (Werke, Lieferanten, Arbeitsstätten, flache Zellen), Baumenü, Farben, Symbole und Tipps.
//
// Felder je Eintrag (fehlt = nein/keins):
//   key    Schlüssel der Art (im Code, in Befehlen `{ type: 'city', kind }`)
//   id     Code im Stadtraster und im Spielstand: fest, nie ändern; neue Arten bekommen die nächste freie Nummer (höchste + 1).
//          Ohne id: nur ein Werkzeug, keine Zellenart (Räumen).
//   name   voller Name (Ziel, Meldungen, Infofeld)       short  Kurzname unter dem Werkzeug
//   icon   Symbol (Werkzeug und Schild über dem Gebäude)  color  Farbe (Werkzeug, Grundstück, Schild), #rrggbb
//   group  Gruppe im Baumenü; Reihenfolge der Gruppen und der Werkzeuge darin = Reihenfolge hier
//   tip    Tipp (Werkzeug, Infofeld): Text oder (CITY) => Text, wenn er Werte aus js/data/city.js nennt
//   cost   Geld je Zelle, bei Großbauten je Gebäude (Pflicht für baubare Arten, sonst wird die Kasse NaN)
//   bm     Baumaterial aus dem Lager der Hauptstadt (CITY.costBm)
//   size   Kantenlänge in Zellen (Großbau, CITY.size; fehlt = 1)
//   power  Strombedarf je Stufe (CITY.power.use; Pflicht außer bei flachen Zellen)
//   target Zielwert für Angriffe der KI (CITY.ai.targetValue; fehlt = 1)
//   jobs   Tabelle der Arbeitsplätze je Stufe in CITY ('jobs', 'jobsCom', 'jobsMine', 'jobsUni', 'jobsDc'): Arbeitsstätte mit
//          Pendlerweg zur nächsten Wohnung (Straßentransport)
//   works  Werk: verarbeitet nach CITY.chain (Eintrag dort Pflicht) mit CITY.jobs Arbeitsplätzen; liefert über die Straße
//   supply liefert über die Straße an ein Werk oder das Lager (Förderanlage; Werke liefern immer)
//   flat   flache Zelle wie Straße: sofort fertig, kein Gebäude, kein Ziel, kein Strom, zählt als Straßenanschluss
//   retired nicht mehr baubar, nur Platzhalter für die Nummer (keine weiteren Felder)
export const CITY_KINDS = [
  // ---- Grundlagen ----
  { key: 'road', id: 1, name: 'Straße', short: 'Straße', icon: '▬', color: '#8a8f86', group: 'Grundlagen', flat: true, cost: 0, bm: 10, tip: 'Kostet Baumaterial aus dem Lager der Hauptstadt' },
  { key: 'erase', name: 'Räumen', short: 'Räumen', icon: '✕', color: '#d05050', group: 'Grundlagen', tip: 'Entfernt eigene Stadtzellen (ohne Erstattung), fällt Bäume und Wald und reißt leere Häuser, Hallen und Fabriken der Karte ab, damit dort gebaut werden kann (Fels, Wasser, Türme, besetzte Häuser bleiben)' },
  // ---- Wohnen & Gewerbe (Wohnen grün = privat, Gewerbe blau = kommerziell, Markt gold) ----
  { key: 'res', id: 2, name: 'Wohnen', short: 'Wohnen', icon: '⌂', color: '#4f9a5a', group: 'Wohnen & Gewerbe', cost: 20, power: 1, target: 0.5 },
  { key: 'com', id: 3, name: 'Gewerbe', short: 'Gewerbe', icon: '▣', color: '#3f7fd0', group: 'Wohnen & Gewerbe', cost: 30, power: 3, target: 1, jobs: 'jobsCom' },
  { key: 'market', id: 9, name: 'Markt', short: 'Markt', icon: '⚖', color: '#e6b422', group: 'Wohnen & Gewerbe', cost: 60, power: 3, target: 2, jobs: 'jobsCom', tip: 'Handel: Überschuss verkaufen, Knappes teuer kaufen (Knopf Handel, Markt antippen oder Geldanzeige oben)' },
  // ---- Förderung ----
  { key: 'mine', id: 8, name: 'Förderanlage', short: 'Förderung', icon: '⛏', color: '#c9a14a', group: 'Förderung', cost: 30, power: 4, target: 2.5, jobs: 'jobsMine', supply: true, tip: 'Nur auf Rohstoffvorkommen: Holzfäller, Steinbruch, Erzmine oder Ölquelle; braucht eine Straße zum passenden Werk (Holz, Stein → BM-Werk, Erz → Hütte, Öl → Raffinerie)' },
  // ---- Ressourcen: Werke (erdig) und Kraftwerk ----
  { key: 'bm', id: 4, name: 'Baumaterial-Werk', short: 'BM-Werk', icon: '⚒', color: '#b0743c', group: 'Ressourcen', cost: 40, size: 2, power: 8, target: 2, jobs: 'jobs', works: true, tip: 'Großbau 2 × 2 (Ziegelei mit Holzlager): Baumaterial aus Holz und Stein (Holzfäller, Steinbruch)' },
  { key: 'smelter', id: 18, name: 'Hütte', short: 'Hütte', icon: '🔥', color: '#a0522d', group: 'Ressourcen', cost: 50, size: 2, power: 10, jobs: 'jobs', works: true, tip: (C) => `Großbau ${C.size.smelter} × ${C.size.smelter} Zellen (Hochofen mit Glut und Schornstein): Roheisen aus Erz (Erzmine); das Roheisen fährt zum Stahlwerk` },
  { key: 'steel', id: 7, name: 'Stahlwerk', short: 'Stahlwerk', icon: '⛓', color: '#7f8c99', group: 'Ressourcen', cost: 50, size: 2, power: 10, target: 3, jobs: 'jobs', works: true, tip: 'Großbau 2 × 2 (Stahlwerk mit Walzstraße): Stahl aus Roheisen (Hütte)' },
  { key: 'mun', id: 5, name: 'Munitionswerk', short: 'Mun.-Werk', icon: '✸', color: '#8b96a8', group: 'Ressourcen', cost: 40, size: 2, power: 8, target: 3, jobs: 'jobs', works: true, tip: 'Großbau 2 × 2 (Bunker mit Riesenpatrone): Munition aus Stahl' },
  { key: 'fuel', id: 6, name: 'Raffinerie', short: 'Raffinerie', icon: '⛽', color: '#9b7bc4', group: 'Ressourcen', cost: 40, size: 2, power: 8, target: 3, jobs: 'jobs', works: true, tip: 'Großbau 2 × 2 (großer Öltank, Destillationstürme): Treibstoff aus Öl (Ölquelle)' },
  { key: 'kero', id: 19, name: 'Kerosin-Raffinerie', short: 'Kerosin-Raf.', icon: '🛢', color: '#56b3e6', group: 'Ressourcen', cost: 50, size: 2, power: 8, jobs: 'jobs', works: true, tip: (C) => `Großbau ${C.size.kero} × ${C.size.kero} Zellen (Kugeltanks mit blauen Tankringen): Kerosin aus Öl (Ölquelle), Vorrat im Stadtlager; für den Kerosintank des Fliegerhorsts (F-16 und Hubschrauber)` },
  { key: 'power', id: 10, name: 'Kraftwerk', short: 'Kraftwerk', icon: '⚡', color: '#e0c040', group: 'Ressourcen', cost: 80, size: 2, power: 0, target: 3, jobs: 'jobs', tip: (C) => `Großbau ${C.size.power} × ${C.size.power} Zellen: Strom für Werke, Förderung, Uni und Rechenzentrum (stadtweit); ohne genug Strom arbeiten sie langsamer` },
  // ---- Einheiten (Militär oliv; Ausbildung CITY.produces, Pflege CITY.care.by) ----
  { key: 'barracks', id: 13, name: 'Kaserne', short: 'Kaserne', icon: '⚔', color: '#7d8f45', group: 'Einheiten', cost: 80, bm: 100, size: 4, power: 2, target: 2.5, tip: (C) => `Großbau ${C.size.barracks} × ${C.size.barracks} Zellen: bildet Soldaten aus (Schützen, Panzerabwehr, Scharfschützen, Kommandeur); bezahlt direkt aus der Stadt. Heilt Soldaten im Umkreis von ${C.care.by.barracks.radius} Feldern` },
  { key: 'factory', id: 14, name: 'Fabrikhalle', short: 'Fabrikhalle', icon: '🔧', color: '#7d8f45', group: 'Einheiten', cost: 150, bm: 200, size: 5, power: 8, target: 3, tip: (C) => `Großbau ${C.size.factory} × ${C.size.factory} Zellen: baut alle Fahrzeuge (LKW, Baufahrzeug, Schützen- und Kampfpanzer, Flak, SAM); bezahlt direkt aus der Stadt. Repariert Bodenfahrzeuge im Umkreis von ${C.care.by.factory.radius} Feldern (kostet Stahl)` },
  { key: 'heliport', id: 15, name: 'Heliport', short: 'Heliport', icon: '🚁', color: '#7d8f45', group: 'Einheiten', cost: 200, bm: 150, power: 6, target: 3, tip: (C) => `Landeplatz für einen Hubschrauber (seit v5.51): baut ihn (Little Bird, Transporter, AH-64, bezahlt aus der Stadt), er startet und landet hier senkrecht. Gelandet tankt und lädt er aus Kerosintank und Munitionslager im Umkreis von ${C.air.supplyRadius} Feldern; Tower in der Nähe: Luftraum nach Start/Landung ${C.air.heli.sepAtc} statt ${C.air.heli.sep} s gesperrt. Repariert Hubschrauber im Umkreis von ${C.care.by.heliport.radius} Feldern (kostet Stahl)` },
  // ---- Stadt (Wissen und Pflege) ----
  { key: 'uni', id: 11, name: 'Universität', short: 'Universität', icon: '🎓', color: '#6fa8dc', group: 'Stadt', cost: 400, size: 3, power: 12, target: 2, jobs: 'jobsUni', tip: 'Großbau 3 × 3 Zellen (antippen, das Quadrat folgt dem Finger; Straße an einer Seite); ohne fertige Universität ruht jede Forschung (eine reicht)' },
  { key: 'dc', id: 12, name: 'Rechenzentrum', short: 'Rechenz.', icon: '🖥', color: '#4fc3c7', group: 'Stadt', cost: 250, power: 30, target: 2.5, jobs: 'jobsDc', tip: (C) => `Beschleunigt die Forschung: jede Stufe jedes Rechenzentrums +${Math.round(C.research.dcSpeed * 100)} % (höchstens ${C.research.maxSpeed}-fach)` },
  { key: 'hospital', id: 16, name: 'Krankenhaus', short: 'Krankenhaus', icon: '✚', color: '#e8707e', group: 'Stadt', cost: 120, bm: 80, power: 6, target: 2, tip: (C) => `Heilt eigene Soldaten im Umkreis von ${C.care.by.hospital.radius} Feldern, schneller als die Kaserne (${Math.round(C.care.by.hospital.rate * 100)} % HP/s auf Stufe 1)` },
  // ---- Fliegerhorst (seit v5.35, CITY.air) ----
  { key: 'runway', id: 20, name: 'Start-/Landebahn', short: 'Bahn', icon: '🛫', color: '#5b5f63', group: 'Fliegerhorst', flat: true, cost: 10, bm: 15, tip: (C) => `Start-/Landebahn (seit v5.35): Zellen wie eine Straße ziehen; ein gerader Streifen ${C.air.runwayWidth} breit und mindestens ${C.air.runwayMin} lang (waagrecht oder senkrecht) ist die Bahn, weitere Bahnzellen daneben zählen als Rollfeld. Flugzeuge rollen über Bahn, Rollfeld und Straßen zu den Stellplätzen. Jeder Start und jede Landung sperrt die Bahn ${C.air.sep} s (mit Tower ${C.air.sepAtc} s); mehr Bahnen = mehr Flugbetrieb` },
  { key: 'taxi', id: 25, name: 'Rollfeld', short: 'Rollfeld', icon: '▦', color: '#a9a89f', group: 'Fliegerhorst', flat: true, cost: 5, bm: 8, tip: 'Rollfeld (seit v5.37): Beton wie eine Straße ziehen, sofort fertig. Flugzeuge rollen darüber zwischen Stellplätzen und Bahn; ein Stellplatz braucht Rollfeld, Bahn oder Straße direkt daneben und darüber einen Weg zur Bahn' },
  { key: 'stand', id: 21, name: 'Stellplatz', short: 'Stellplatz', icon: '✈', color: '#6f7d4a', group: 'Fliegerhorst', cost: 120, bm: 80, size: 2, power: 2, target: 3, tip: (C) => `Großbau 2 × 2 (seit v5.35): Stellplatz für ein Kampfflugzeug, baut es auch (F-16). Gebaut als offener Stellplatz; ausbauen nur am gewählten Stellplatz mit „Ausbauen“ (U): Stufe 2 Überdachung (${C.air.upgrade[2].money} G + ${C.air.upgrade[2].bm} BM, halber Schaden), Stufe 3 Stahlbeton-Shelter (${C.air.upgrade[3].money} G + ${C.air.upgrade[3].bm} BM + ${C.air.upgrade[3].steel} Stahl, ${Math.round(C.air.shelter[3] * 100)} % Schaden). Braucht eine Straße oder Bahn daneben, über die das Flugzeug zur Bahn rollt` },
  { key: 'atc', id: 22, name: 'Tower', short: 'Tower', icon: '📡', color: '#4f7fa8', group: 'Fliegerhorst', cost: 150, bm: 60, size: 2, power: 6, target: 3, tip: (C) => `Großbau 2 × 2 (seit v5.35): Tower mit Radar. Bahnen im Umkreis von ${C.air.atcRadius} Feldern sind nach jedem Start oder jeder Landung schon nach ${C.air.sepAtc} statt ${C.air.sep} s wieder frei; weite Sicht` },
  { key: 'ktank', id: 23, name: 'Kerosintank', short: 'Kero-Tank', icon: '⛽', color: '#56b3e6', group: 'Fliegerhorst', cost: 60, bm: 40, size: 2, power: 2, target: 2.5, tip: (C) => `Großbau 2 × 2 (seit v5.35): Kerosintank. Wird über die Straße aus dem Kerosin des Stadtlagers befüllt; Flugzeuge auf Stellplätzen im Umkreis von ${C.air.supplyRadius} Feldern tanken daraus` },
  { key: 'mdepot', id: 24, name: 'Munitionslager', short: 'Mun.-Lager', icon: '🚀', color: '#b88a3a', group: 'Fliegerhorst', cost: 60, bm: 60, size: 2, power: 2, target: 2.5, tip: (C) => `Großbau 2 × 2 (seit v5.35): Munitionslager. Wird über die Straße aus dem Lager der Hauptstadt befüllt; Flugzeuge auf Stellplätzen im Umkreis von ${C.air.supplyRadius} Feldern laden daraus nach` },
  // ---- Nicht mehr baubar ----
  // Flughafen 10 × 10 (bis v5.34), ersetzt durch den Fliegerhorst aus Bausteinen; bleibt nur, damit die Nummern der späteren Arten
  // gleich bleiben (Werkzeug, Bild und Daten seit v5.56 weg, alte Stände laden nicht).
  { key: 'airport', id: 17, name: 'Flughafen', retired: true },
];

/** Eintrag je Schlüssel (auch das Werkzeug Räumen). */
export const KIND = Object.fromEntries(CITY_KINDS.map((e) => [e.key, e]));
/** Zellenarten nach Code (Code = Index + 1; 0 = leer). */
export const KINDS = CITY_KINDS.filter((e) => e.id).sort((a, b) => a.id - b.id).map((e) => e.key);
export const KIND_ID = Object.fromEntries(KINDS.map((k) => [k, KIND[k].id]));
export const KIND_NAME = Object.fromEntries(KINDS.map((k) => [k, KIND[k].name]));
/** Zellenarten (in Code-Reihenfolge), deren Eintrag `test` erfüllt. */
export const kindsWhere = (test) => KINDS.filter((k) => test(KIND[k]));
/** Nicht mehr baubare Arten (CITY.retired). */
export const RETIRED_KINDS = kindsWhere((e) => e.retired);
/** Werke (Verarbeitung nach CITY.chain). */
export const WORKS = kindsWhere((e) => e.works);
/** Lieferanten (Förderung und Werke): ihr Ausstoß fährt über die Straße zu einem Werk oder ins Lager. */
export const SUPPLIER_KINDS = kindsWhere((e) => e.supply || e.works);
/** Arbeitsstätten mit Pendlerweg (alle Arten mit Arbeitsplätzen). */
export const WORKPLACE_KINDS = kindsWhere((e) => e.jobs);
/** Flache Zellen (Straße, Bahn, Rollfeld): sofort fertig, kein Gebäude. */
export const FLAT_KINDS = kindsWhere((e) => e.flat);
/** Farbe und Symbol je Werkzeug (Zellenarten und Räumen) für Baumenü, Grundstücke und Schilder. */
export const KIND_COLOR = Object.fromEntries(CITY_KINDS.filter((e) => e.color).map((e) => [e.key, e.color]));
export const KIND_ICON = Object.fromEntries(CITY_KINDS.filter((e) => e.icon).map((e) => [e.key, e.icon]));
/** Baumenü: [[Gruppe, [Werkzeug …]] …] in der Reihenfolge des Registers, ohne nicht mehr baubare Arten. */
export const BUILD_MENU = [];
for (const e of CITY_KINDS) {
  if (e.retired) continue;
  let g = BUILD_MENU.find(([name]) => name === e.group);
  if (!g) BUILD_MENU.push((g = [e.group ?? 'Weitere', []]));
  g[1].push(e.key);
}
