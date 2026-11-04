// Werte des Kartengenerators (js/game/map.js, js/game/landscape.js). Wegweiser: CLAUDE.md.
// Vorsicht: Jede Änderung hier verändert ALLE Zufallskarten (gleicher Seed = andere Karte als vorher) und kann Tests brechen,
// die feste Seeds nutzen. Gespeicherte Karten aus dem Editor bleiben unverändert. Abstände in px, Paare = punktsymmetrisch gespiegelt.
export const MAPGEN = {
  // Allgemein: Versuche, Zugänge zur Zone, Hänge
  general: {
    attempts: 20, // Versuche mit seed + 1, bis eine spielbare Karte entsteht
    minRoutes: 3, // so viele getrennte Wege führen mindestens von jedem Start in die Konfliktzone
    zoneSlope: 0.25, // in der Stadt ist kein Hang steiler (alle Wege gut befahrbar)
    crossRegion: 1500, // so viele Zellen erreicht man von jedem Ufer einer Querung mindestens (sonst liegt sie in einer Tasche)
    spawnEdge: 700, // Startpunkte (Hauptstadt) so weit vom linken und unteren bzw. rechten und oberen Kartenrand (auch leere Editor-Karte)
    buildLand: 2000, // Bauland (seit v5.03, seit v5.14 2000 statt 1300 bis nahe an den Fluss): so weit um jeden Startpunkt keine Felsen, Wälder, Bäume, Gehöfte oder Einzelhäuser (Platz für die Stadt und ihre Großbauten)
  },
  // Gelände der Zufallskarte (landscape.js)
  terrain: {
    hills: 10, // Hügelpaare außerhalb der Stadt (passierbar; seit v5.14 mit der größeren Karte 10 statt 7)
    zoneHills: 2, // sanfte Hügelpaare in der Stadt
    ridges: 6, // Bergrücken-Paare (steile Flanken = Fels, unpassierbar; seit v5.14 6 statt 4)
    lakes: 3, // Seepaare (seit v5.14 3 statt 2)
    spawnFlat: 1400, // ebene Fläche um die Startpunkte, danach weicher Übergang bis SPAWN_BLEND (seit v5.03 größer: Bauland; seit v5.14 1400 statt 950)
    spawnBlend: 1800, // Ende des weichen Übergangs um die Startpunkte (seit v5.14 1800 statt 1250)
    baseLevel: 36, // mittlere Höhe des Grundes über dem Wasserspiegel-Bezug 0
  },
  // Fluss mit Brücken und Furten (landscape.js, river.js; nur wenn „Fluss“ an ist)
  river: {
    halfW: 92, // halbe Breite des Flusses
    bank: 330,
    depth: 40,
    r: [3728, 3968], // Abstand der Flussmitte von der Kartenecke (seit v5.14 mit der größeren Karte 1448 px weiter: gleich weit von der Zone, doppelt so weit von der Hauptstadt)
    bridges: [16, 45, 74],
    fords: [30.5, 59.5],
    shift: 4,
    ramp: 0.16, // Steigung der Zufahrten an Brücken und Furten (befahrbar)
    fordR: 150, // Radius der Furt (Kartenformat `fords`)
    deckOver: 62, // Brücke reicht so weit über die Wasserkante hinaus auf festen Grund
    maxH: 165, // höchstes Gelände unter dem Flusslauf (sonst neuer Versuch: kein Fluss durch einen Bergrücken)
  },
  // Hindernisse und Bewuchs
  scatter: {
    obstaclePairs: 48, // Felsen- und Waldpaare (seit v5.14 mit der größeren Karte 48 statt 32)
    scatterPairs: 520, // verstreute Bäume und Büsche (Paare; seit v5.14 520 statt 350)
  },
  // Stadt in der Konfliktzone (Straßenraster, Bahn, Wachtürme)
  town: {
    railHalf: 40, // halbe Breite des Bahnkorridors, Gebäude, Bäume und Felsen bleiben davon frei
    block: 384, // Häuserblock (Straßenraster); seit v5.03 ein Vielfaches von 2 Stadtzellen (128 px), damit jede Straße genau auf einer Zellreihe liegt
    roadW: 64, // Straßenbreite (= eine Stadtzelle; die Straßen der Zone sind Stadtstraßen, js/game/roads.js)
    avenueW: 64, // die zwei Straßen am Zentrumsplatz (seit v5.03 so breit wie alle anderen)
    towerSize: 80, // Grundfläche eines Wachturms
  },
  // Gebäude außerhalb der Zone
  outposts: {
    houses: 32, // Einzelhäuser außerhalb der Zone (Paare; seit v5.14 32 statt 22)
    halls: 9, // freistehende Hallen (Paare; seit v5.14 9 statt 6)
    factories: 10, // Fabrikgelände mit Mauer (Paare; seit v5.14 10 statt 7)
    wallT: 16, // Mauerstärke
    wallMargin: 80, // Abstand der Mauer zur Fabrik (Platz zum Umfahren)
    wallGap: 130, // Lücke in der Mauer (zwei gegenüberliegende Seiten)
  },
  // Versorgungskisten (Platzierung)
  crates: {
    clear: 40, // so weit ringsum ist der Boden um eine Kiste frei und erreichbar
    zoneGap: 350, // Abstand zur Zonenkante
    spawnGap: 2000, // Abstand zu den Startpunkten (seit v5.14 2000 statt 1300: außerhalb des Baulands)
    gap: 900, // Abstand der Kisten untereinander
  },
  // Gehöfte und Felder
  farms: {
    chance: 0.75, // so viele Einzelhäuser außerhalb der Zone werden Gehöfte mit Feldern
    tries: 8, // Anordnungen je Gehöft (die mit der meisten Feldfläche gewinnt)
    fieldBlocks: 12, // freie Flure (Paare): zwei Feldreihen beiderseits eines Feldwegs, ohne Haus (seit v5.14 12 statt 8)
    fieldGap: 24, // Feldrain zwischen zwei Feldern
    fieldYard: 54, // Abstand Haus–Feldreihe (darin läuft der Feldweg entlang)
    trackW: 26, // Feldweg
    trackReach: 1800, // so weit führt ein Feldweg höchstens zur nächsten Straße oder zum Nachbargehöft
    cropRoll: [['wheat', 0.35], ['green', 0.6], ['soil', 0.8], ['rape', 1]], // Weizen, junge Saat, gepflügt, Raps
  },
};
