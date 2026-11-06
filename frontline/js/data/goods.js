// Register der Waren der Stadt (seit v5.59, Review-Paket P6, Befunde E-01, Q-04): eine Quelle je Ware für Namen, Kürzel, Farbe,
// Lager, Marktpreise, Ertrag und Umwandlung. Regeln: PRD §15. Kein DOM, kein Import (js/data/city.js liest von hier).
// Daraus abgeleitet: CITY.yield/convert/market.sell/buy (js/data/city.js), die Warenlisten in js/game/city.js (Markt, Stadtlager)
// und js/game/flow.js (Lager, Zwischenprodukte), Namen und Farben in Marktmenü, Infofeld und Ressourcenanzeige.
// Die Reihenfolge hier ist die Reihenfolge im Marktmenü und in der Ressourcenanzeige.
//
// Felder je Ware:
//   name   voller Name (Ressourcenanzeige, Marktmenü)      short  Kürzel (Mengen, Infofeld, Marktmenü)
//   color  Farbe der Linien und Knoten in der Ressourcenanzeige (#rrggbb)
//   store  wo sie liegt: 'main' Lager der Hauptstadt (BALANCE.logistics.capitalCap), 'city' Stadtlager (Feld c.<Ware>,
//          BALANCE.logistics.storeCap), null Zwischenprodukt ohne Lager (fährt direkt vom Werk zum nächsten)
//   sell, buy  Geld je Los (CITY.market.lot) am Markt; fehlt = nicht handelbar
//   yield  höchster Ertrag je Arbeiter und Sekunde im Werk, das sie macht (CITY.chain), begrenzt durch den Eingang
//   convert so viel Eingang (Rohstoff oder Ware) braucht eine Einheit
//   full   Hinweis der Ressourcenanzeige, wenn das Stadtlager voll ist (nur store 'city')
// Baumaterial, Munition und Treibstoff sind zugleich die Sorten der FOB-Lager und LKW (js/game/logistics.js); eine neue Ware dieser
// Art braucht deutlich mehr (Lager, LKW, HUD) und ist nicht Teil des Rezepts „Neue Ware“ in CLAUDE.md.
export const GOODS = {
  bm: { name: 'Baumaterial', short: 'BM', color: '#b58248', store: 'main', sell: 20, buy: 80, yield: 0.1, convert: 1 },
  mun: { name: 'Munition', short: 'MUN', color: '#d9b600', store: 'main', sell: 30, buy: 120, yield: 0.06, convert: 0.5 },
  fuel: { name: 'Treibstoff', short: 'TS', color: '#9b7bc4', store: 'main', sell: 30, buy: 120, yield: 0.05, convert: 1 },
  metal: { name: 'Stahl', short: 'Stahl', color: '#8fb3c9', store: 'city', sell: 40, buy: 160, yield: 0.05, convert: 1, full: 'Mehr Fahrzeuge ausbilden oder am Markt verkaufen.' },
  kero: { name: 'Kerosin', short: 'Kerosin', color: '#56b3e6', store: 'city', sell: 35, buy: 140, yield: 0.04, convert: 1.2, full: 'Kerosin am Fliegerhorst (Kerosintank) oder bei Hubschraubern verbrauchen oder am Markt verkaufen.' },
  iron: { name: 'Roheisen', short: 'Roheisen', color: '#b9a48a', store: null, yield: 0.06, convert: 2 }, // Zwischenprodukt (seit v5.20): Hütte → Stahlwerk
};

/** Waren, deren Eintrag `test` erfüllt (Reihenfolge des Registers). */
export const goodsWhere = (test) => Object.keys(GOODS).filter((g) => test(GOODS[g]));
/** Waren mit Lager (Hauptstadt oder Stadtlager). */
export const STORED_GOODS = goodsWhere((d) => d.store);
/** Zwischenprodukte ohne Lager. */
export const MID_GOODS = goodsWhere((d) => !d.store);
/** Waren im Stadtlager (Stahl heißt intern metal). */
export const CITY_STORE_GOODS = goodsWhere((d) => d.store === 'city');
/** Waren am Markt. */
export const MARKET_GOODS = goodsWhere((d) => d.sell !== undefined);
/** Name, Kürzel und Farbe je Ware. */
export const GOOD_NAME = Object.fromEntries(Object.entries(GOODS).map(([g, d]) => [g, d.name]));
export const GOOD_SHORT = Object.fromEntries(Object.entries(GOODS).map(([g, d]) => [g, d.short]));
export const GOOD_COLOR = Object.fromEntries(Object.entries(GOODS).map(([g, d]) => [g, d.color]));
