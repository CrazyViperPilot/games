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
  },
  // Gelände der Zufallskarte (landscape.js)
  terrain: {
    hills: 7, // Hügelpaare außerhalb der Stadt (passierbar)
    zoneHills: 2, // sanfte Hügelpaare in der Stadt
    ridges: 4, // Bergrücken-Paare (steile Flanken = Fels, unpassierbar)
    lakes: 2, // Seepaare
    spawnFlat: 650, // ebene Fläche um die Startpunkte, danach weicher Übergang bis SPAWN_BLEND
    spawnBlend: 1050, // Ende des weichen Übergangs um die Startpunkte
    baseLevel: 36, // mittlere Höhe des Grundes über dem Wasserspiegel-Bezug 0
  },
  // Fluss mit Brücken und Furten (landscape.js, river.js; nur wenn „Fluss“ an ist)
  river: {
    halfW: 92, // halbe Breite des Flusses
    bank: 330,
    depth: 40,
    r: [2280, 2520], // Abstand der Flussmitte von der Kartenecke
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
    obstaclePairs: 32, // Felsen- und Waldpaare
    scatterPairs: 350, // verstreute Bäume und Büsche (Paare)
  },
  // Stadt in der Konfliktzone (Straßenraster, Bahn, Wachtürme)
  town: {
    railHalf: 40, // halbe Breite des Bahnkorridors, Gebäude, Bäume und Felsen bleiben davon frei
    block: 400, // Häuserblock (Straßenraster)
    roadW: 64, // Straßenbreite
    avenueW: 92, // die zwei Straßen am Zentrumsplatz
    towerSize: 80, // Grundfläche eines Wachturms
  },
  // Gebäude außerhalb der Zone
  outposts: {
    houses: 22, // Einzelhäuser außerhalb der Zone (Paare)
    halls: 6, // freistehende Hallen (Paare)
    factories: 7, // Fabrikgelände mit Mauer (Paare)
    wallT: 16, // Mauerstärke
    wallMargin: 80, // Abstand der Mauer zur Fabrik (Platz zum Umfahren)
    wallGap: 130, // Lücke in der Mauer (zwei gegenüberliegende Seiten)
  },
  // Versorgungskisten (Platzierung)
  crates: {
    clear: 40, // so weit ringsum ist der Boden um eine Kiste frei und erreichbar
    zoneGap: 350, // Abstand zur Zonenkante
    spawnGap: 1300, // Abstand zu den Startpunkten
    gap: 900, // Abstand der Kisten untereinander
  },
  // Gehöfte und Felder
  farms: {
    chance: 0.75, // so viele Einzelhäuser außerhalb der Zone werden Gehöfte mit Feldern
    tries: 8, // Anordnungen je Gehöft (die mit der meisten Feldfläche gewinnt)
    fieldBlocks: 8, // freie Flure (Paare): zwei Feldreihen beiderseits eines Feldwegs, ohne Haus
    fieldGap: 24, // Feldrain zwischen zwei Feldern
    fieldYard: 54, // Abstand Haus–Feldreihe (darin läuft der Feldweg entlang)
    trackW: 26, // Feldweg
    trackReach: 1800, // so weit führt ein Feldweg höchstens zur nächsten Straße oder zum Nachbargehöft
    cropRoll: [['wheat', 0.35], ['green', 0.6], ['soil', 0.8], ['rape', 1]], // Weizen, junge Saat, gepflügt, Raps
  },
};
