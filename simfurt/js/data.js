// Simfurt – Spieldaten: Karte, Zonen, Gebäude, Freischaltungen. Keine Abhängigkeit von DOM (läuft auch in Node-Tests).
export let N = 64;                   // Kartenkante in Kacheln (wählbar: 64, 96, 128)
export const MAP_SIZES = [64, 96, 128];
export function setMapSize(n) { N = n; }
export const START_MONEY = 40000;
export const START_YEAR = 1990;
export const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export const T_GRASS = 0, T_WATER = 1, T_TREES = 2;
export const Z_NONE = 0, Z_R = 1, Z_C = 2, Z_I = 3, Z_B = 4;

/** Zonen: Namen, Kosten pro Kachel, Einwohner bzw. Arbeitsplätze und Strombedarf je Stufe. */
export const ZONES = {
  [Z_R]: { id: 'R', name: 'Wohnen', cost: 10, max: 3, pop: [0, 6, 22, 64], jobs: [0, 0, 0, 0], load: [0, 1, 3, 6], color: '#4cc46a' },
  [Z_C]: { id: 'C', name: 'Gewerbe', cost: 10, max: 3, pop: [0, 0, 0, 0], jobs: [0, 5, 16, 42], load: [0, 1, 3, 6], color: '#4a8df0' },
  [Z_I]: { id: 'I', name: 'Industrie', cost: 10, max: 3, pop: [0, 0, 0, 0], jobs: [0, 7, 20, 40], load: [0, 2, 5, 9], color: '#e0b030' },
  [Z_B]: { id: 'B', name: 'Bankenviertel', cost: 30, max: 4, pop: [0, 0, 0, 0, 0], jobs: [0, 28, 80, 190, 420], load: [0, 4, 8, 14, 22], color: '#9aa8c8' },
};

export const ROAD_COST = 20, BRIDGE_COST = 90, BULLDOZE_COST = 4, ROAD_UPKEEP = 0.25, LOT_UPKEEP = 0;

/** Gebäude. w×h Kacheln. kind steuert die Wirkung: power, police, fire, health, edu, park, happy (Wahrzeichen), metro. */
export const BUILD = {
  gas:    { name: 'Gaskraftwerk', cat: 'energy', w: 2, h: 2, cost: 4000, up: 140, kind: 'power', cap: 220, r: 15, pol: 28, icon: '⚡', color: '#7a8088', unlock: 0, desc: 'Versorgt Kacheln im Umkreis. Macht Dreck.' },
  wind:   { name: 'Windpark', cat: 'energy', w: 2, h: 2, cost: 3500, up: 60, kind: 'power', cap: 70, r: 11, pol: 0, icon: '🌬', color: '#cfd8e0', unlock: 800, desc: 'Sauberer Strom, aber schwach.' },
  solar:  { name: 'Solarpark', cat: 'energy', w: 3, h: 3, cost: 9000, up: 90, kind: 'power', cap: 150, r: 12, pol: 0, icon: '☀', color: '#27406e', unlock: 4000, desc: 'Sauber und stark, aber teuer.' },
  police: { name: 'Polizeirevier', cat: 'service', w: 1, h: 1, cost: 900, up: 70, kind: 'police', r: 10, icon: '🚓', color: '#3b64c4', unlock: 400, desc: 'Weniger Kriminalität im Umkreis.' },
  fire:   { name: 'Feuerwehr', cat: 'service', w: 1, h: 1, cost: 900, up: 70, kind: 'fire', r: 10, icon: '🚒', color: '#d03a2e', unlock: 400, desc: 'Löscht Brände im Umkreis.' },
  clinic: { name: 'Krankenhaus', cat: 'service', w: 2, h: 2, cost: 2800, up: 160, kind: 'health', r: 14, icon: '🏥', color: '#f1f4f4', unlock: 1500, desc: 'Gesundheit und Zufriedenheit.' },
  school: { name: 'Schule', cat: 'service', w: 2, h: 1, cost: 1400, up: 90, kind: 'edu', r: 11, lvl: 1, icon: '🏫', color: '#d6a24a', unlock: 600, desc: 'Bildung – wichtig für Mieten und Banken.' },
  uni:    { name: 'Goethe-Uni', cat: 'service', w: 3, h: 3, cost: 7500, up: 330, kind: 'edu', r: 18, lvl: 2, icon: '🎓', color: '#b9573f', unlock: 5000, desc: 'Hohe Bildung. Lockt Banken an.' },
  park:   { name: 'Park', cat: 'service', w: 1, h: 1, cost: 70, up: 2, kind: 'park', r: 5, icon: '🌳', color: '#3fa04a', unlock: 0, desc: 'Grün macht glücklich und wertet auf.' },
  apple:  { name: 'Äppelwoi-Wirtschaft', cat: 'service', w: 1, h: 1, cost: 450, up: 25, kind: 'park', r: 7, tour: 40, icon: '🍺', color: '#a8452e', unlock: 500, desc: 'Gemütlich in Sachsenhausen. Ebbelwei hebt die Stimmung.' },
  metro:  { name: 'U-Bahn-Station', cat: 'transport', w: 1, h: 1, cost: 700, up: 45, kind: 'metro', r: 8, icon: 'U', color: '#1f6a43', unlock: 1500, desc: 'Entlastet Straßen im Umkreis.' },
  dike:   { name: 'Deich', cat: 'water', w: 1, h: 1, cost: 150, up: 2, kind: 'dike', r: 4, icon: '🧱', color: '#6f8f4e', unlock: 0, shore: 'Nur am Wasser', desc: 'Am Ufer bauen: schützt den Umkreis vor Hochwasser.' },
  // Wasser (ohne Leitungen, wie Strom per Radius + Kapazität)
  pump:   { name: 'Pumpwerk', cat: 'water', w: 2, h: 2, cost: 2500, up: 80, kind: 'pump', cap: 260, r: 14, icon: '💧', color: '#2f6fa8', unlock: 0, shore: 'Nur am Ufer', desc: 'Am Ufer bauen: pumpt Wasser in den Umkreis. Braucht Kapazität für alle Zonen.' },
  tower:  { name: 'Wasserturm', cat: 'water', w: 1, h: 1, cost: 1200, up: 30, kind: 'tower', cap: 0, r: 9, icon: '🚰', color: '#c5ccd2', unlock: 0, desc: 'Verteilt Wasser im Umkreis. Wirkt nur mit mindestens einem Pumpwerk.' },
  treat:  { name: 'Kläranlage', cat: 'water', w: 2, h: 2, cost: 6000, up: 160, kind: 'treat', r: 10, polCut: 0.4, icon: '♻', color: '#3a9a8a', unlock: 3000, desc: 'Senkt Verschmutzung im Umkreis und erhöht die Wasser-Kapazität aller Pumpwerke.' },
  // Müll (Runde 3): Deponie speichert im Gebäude (fill), Verbrennung liefert zusätzlich Strom
  dump:   { name: 'Deponie', cat: 'waste', w: 3, h: 3, cost: 1500, up: 40, kind: 'dump', r: 0, cap: 300, vol: 12000, pol: 30, polR: 7, icon: '🗑', color: '#6b5b3e', unlock: 0, desc: 'Nimmt Müll an, bis das Volumen voll ist. Starker Dreck im Umkreis.' },
  incin:  { name: 'Müllverbrennung', cat: 'waste', w: 2, h: 2, cost: 7000, up: 220, kind: 'incin', r: 8, power: 60, pol: 18, burn: 500, icon: '🔥', color: '#5b5552', unlock: 2500, desc: 'Verbrennt Müll und liefert Strom. Macht etwas Dreck.' },
  recyc:  { name: 'Recyclinghof', cat: 'waste', w: 2, h: 2, cost: 4000, up: 120, kind: 'recyc', r: 0, icon: '♻', color: '#3d8f5a', unlock: 1200, desc: 'Trennt Wertstoffe: senkt das Müllaufkommen stadtweit um 12 % je Hof (höchstens 36 %).' },
  // S-Bahn (Runde 4): wirkt nur im Gleisnetz mit mindestens RAIL_MIN_STATIONS Bahnhöfen (siehe unten)
  sbahn:  { name: 'S-Bahnhof', cat: 'transport', w: 2, h: 1, cost: 3000, up: 90, kind: 'rail', r: 10, icon: 'S', color: '#7a4fb0', unlock: 2000, track: 'Nur am Gleis', desc: 'Wirkt nur im Gleisnetz mit mindestens zwei Bahnhöfen: weniger Verkehr, mehr Grundwert.' },

  // Wahrzeichen: je einmal baubar
  roemer: { name: 'Römer', cat: 'land', w: 2, h: 2, cost: 5000, up: 80, kind: 'happy', r: 9, happy: 3, tour: 120, unique: 1, icon: '🏛', color: '#d9c7a0', unlock: 2000, desc: 'Rathaus am Römerberg. Staatstragend schön.' },
  dom:    { name: 'Kaiserdom St. Bartholomäus', cat: 'land', w: 2, h: 2, cost: 9000, up: 100, kind: 'happy', r: 10, happy: 4, tour: 200, unique: 1, icon: '⛪', color: '#a4543a', unlock: 4000, desc: 'Roter Sandstein, hoher Turm.' },
  oper:   { name: 'Alte Oper', cat: 'land', w: 2, h: 2, cost: 12000, up: 150, kind: 'happy', r: 10, happy: 3, tour: 260, unique: 1, icon: '🎭', color: '#e3d8c0', unlock: 8000, desc: 'Kultur und Prestige im Westend.' },
  zoo:    { name: 'Zoo', cat: 'land', w: 3, h: 3, cost: 14000, up: 260, kind: 'happy', r: 11, happy: 4, tour: 320, unique: 1, icon: '🦒', color: '#6cb050', unlock: 6000, desc: 'Familienausflug mit Giraffe.' },
  palm:   { name: 'Palmengarten', cat: 'land', w: 3, h: 2, cost: 11000, up: 140, kind: 'happy', r: 10, happy: 4, tour: 220, unique: 1, icon: '🌴', color: '#58c08a', unlock: 6000, desc: 'Gewächshäuser und Grün im Westend.' },
  hbf:    { name: 'Hauptbahnhof', cat: 'land', w: 3, h: 2, cost: 22000, up: 300, kind: 'happy', r: 12, happy: 2, tour: 600, unique: 1, icon: '🚆', color: '#b7b2a6', unlock: 10000, desc: 'Tor zur Stadt. Viele Pendler, viel Geld.' },
  arena:  { name: 'Stadion', cat: 'land', w: 3, h: 3, cost: 26000, up: 380, kind: 'happy', r: 12, happy: 5, tour: 520, unique: 1, icon: '⚽', color: '#c8ccd0', unlock: 20000, desc: 'Adler auf der Brust – Heimspiel!' },
  messe:  { name: 'Messe Frankfurt', cat: 'land', w: 3, h: 3, cost: 38000, up: 520, kind: 'happy', r: 12, happy: 1, tour: 1100, unique: 1, icon: '🏢', color: '#9cb6c8', unlock: 15000, desc: 'Messehallen – bringt viel Geschäftsreisende.' },
  mtower: { name: 'Messeturm', cat: 'land', w: 1, h: 1, cost: 30000, up: 200, kind: 'happy', r: 8, happy: 1, tour: 500, unique: 1, icon: '▲', color: '#c6a285', unlock: 25000, desc: 'Pyramidendach, ein Skyline-Klassiker.' },
  maintower: { name: 'Main Tower', cat: 'land', w: 1, h: 1, cost: 34000, up: 220, kind: 'happy', r: 8, happy: 1, tour: 600, unique: 1, icon: '▮', color: '#4c88b0', unlock: 30000, desc: 'Gläserner Turm mit Aussichtsplattform.' },
  ctower: { name: 'Commerzbank Tower', cat: 'land', w: 1, h: 1, cost: 46000, up: 260, kind: 'happy', r: 9, happy: 2, tour: 800, unique: 1, icon: '△', color: '#e5ecee', unlock: 40000, desc: 'Der höchste Turm mit Antenne.' },
  fraport:{ name: 'Flughafen Fraport', cat: 'land', w: 5, h: 3, cost: 90000, up: 1400, kind: 'happy', r: 14, happy: -2, tour: 3000, unique: 1, icon: '✈', color: '#c3c9cf', unlock: 50000, desc: 'Drehkreuz Europas. Lärm, aber Milliarden.' },
};

// ---------------------------------------------------------------- Wasser (Runde 2)
/** Kläranlagen erhöhen die Kapazität aller Pumpwerke um 25 % je Anlage, höchstens ×1,5. */
export const WATER_TREAT_CAP = 0.25, WATER_TREAT_CAP_MAX = 1.5;
/** Zufriedenheit: −WATER_HAPPY × Anteil besiedelter Parzellen ohne Wasser (nur wenn Stufe ≥ 2 existiert). */
export const WATER_HAPPY = 20;

// ---------------------------------------------------------------- Müll & Recycling (Runde 3)
/** Müllaufkommen je Parzelle und Stufe in t/Monat (R klein, C mittel, I groß, B mittel). Index = Stufe. */
export const GARBAGE = {
  [Z_R]: [0, 0.1, 0.3, 0.8], [Z_C]: [0, 0.3, 0.8, 1.8], [Z_I]: [0, 0.5, 1.3, 2.6], [Z_B]: [0, 0.5, 1.3, 3.0, 5.0],
};
/** Jedes Dienst- und Wahrzeichen-Gebäude (ohne Strom-, Wasser- und Müllanlagen) erzeugt so viel t/Monat. */
export const GARBAGE_BLD = 1;
/** Recyclinghof: senkt das Aufkommen je Hof um GARBAGE_REC, höchstens um GARBAGE_REC_MAX. */
export const GARBAGE_REC = 0.12, GARBAGE_REC_MAX = 0.36;
/** Schonfrist: Verschmutzung und Zufriedenheit wirken erst ab dieser Einwohnerzahl. */
export const GARBAGE_MIN_POP = 400;
/** Verschmutzung stadtweit (+ × unentsorgter Anteil) und Zufriedenheit (−min(MAX, HAPPY × Anteil)). */
export const GARBAGE_POL = 20, GARBAGE_HAPPY = 25, GARBAGE_HAPPY_MAX = 20;

// ---------------------------------------------------------------- S-Bahn (Runde 4, S1)
/** Gleis 40 €/Kachel, Gleisbrücke über Wasser 150 €, Bahnübergang (Gleis auf Straße oder umgekehrt) 60 €. */
export const RAIL_COST = 40, RAIL_BRIDGE_COST = 150, RAIL_CROSS_COST = 60;
/** Gleisunterhalt €/Kachel/Monat (Budget-Ressort „Straßen“ gilt mit). */
export const RAIL_UPKEEP = 0.5;
/** Einwohner, ab denen das Werkzeug „Gleis“ freigeschaltet ist. */
export const RAIL_UNLOCK = 2000;
/** Ein Bahnhof wirkt nur, wenn in seinem Gleisnetz mindestens so viele Bahnhöfe stehen. */
export const RAIL_MIN_STATIONS = 2;
/** Verkehrsaufkommen im Radius eines wirksamen Bahnhofs: −RAIL_TRAFFIC (× Gratis-ÖPNV), zusammen mit der U-Bahn höchstens −RAIL_TRAFFIC_MAX. */
export const RAIL_TRAFFIC = 0.45, RAIL_TRAFFIC_MAX = 0.7;
/** Bahnübergang: Verkehr auf der Straßenkachel ×(1 + RAIL_CROSS_TRAFFIC). */
export const RAIL_CROSS_TRAFFIC = 0.2;
/** Grundwert-Zuschlag im Radius eines wirksamen Bahnhofs, Gewerbe-Nachfrage bei mindestens einem wirksamen Bahnhof. */
export const RAIL_VALUE = 8, RAIL_DEMAND_C = 0.05;

// ---------------------------------------------------------------- Budget je Ressort (Prozent, Regler 0–120 in 10er-Schritten)
/** Ressorts mit Regler. police/fire/health/edu wirken über die Gebäude-kind gleichen Namens, roads auf Straßen. */
export const BUDGET_RES = ['police', 'fire', 'health', 'edu', 'roads'];
export const BUDGET_NAMES = { police: 'Polizei', fire: 'Feuerwehr', health: 'Gesundheit', edu: 'Bildung', roads: 'Straßen' };
export const BUDGET_DEFAULT = { police: 100, fire: 100, health: 100, edu: 100, roads: 100 };
export const BUDGET_MIN = 0, BUDGET_MAX = 120, BUDGET_STEP = 10;
/** Abdeckungsstärke beim Stempeln: min(COVER_MAX, b/100). */
export const BUDGET_COVER_MAX = 1.1;
/** Straßen unter diesem Budget (%): Verkehrsbelastung × (1 + (ROAD_MIN − b)/100). */
export const BUDGET_ROAD_MIN = 60;

// ---------------------------------------------------------------- Verordnungen (Ratsbeschlüsse, ein/aus, kosten monatlich)
/**
 * id, name, desc; cost (€/Monat), costPerPop (€/Monat je Einwohner), unlock (Einwohner), needs (Gebäudetyp, optional).
 * mul: Faktoren (multiplikativ, Standard 1), add: Summanden (Standard 0). Schlüssel: traffic, crime, pollution, metro,
 * tourism, fraportTour, healthPart, bankTax, garbage (mul); happy, value, demandR, demandC, demandI, demandB (add).
 */
export const ORDINANCES = [
  { id: 'tempo30', name: 'Tempo 30', desc: 'Innenstadt langsamer, leiser und sicherer. Weniger Stau.', cost: 300, costPerPop: 0, unlock: 0, mul: { traffic: 0.9 }, add: { happy: 1, demandC: -0.03 } },
  { id: 'oepnv', name: 'Gratis-ÖPNV', desc: 'Bus und Bahn kostenlos: die U-Bahn wirkt stärker. Kostet je Einwohner.', cost: 0, costPerPop: 0.25, unlock: 1500, mul: { metro: 1.5 } },
  { id: 'rauch', name: 'Rauchverbot', desc: 'Gesündere Luft in Lokalen und Büros. Gesundheit steigt, Gewerbe zieht etwas weniger an.', cost: 200, costPerPop: 0, unlock: 800, mul: { healthPart: 1.2 }, add: { demandC: -0.03 } },
  { id: 'ebbelwei', name: 'Ebbelwei-Fest', desc: 'Großes Fest am Main: mehr Tourismus und gute Laune, dafür etwas mehr Trubel.', cost: 500, costPerPop: 0, unlock: 1000, mul: { tourism: 1.15, crime: 1.05 }, add: { happy: 2 } },
  { id: 'wache', name: 'Nachbarschaftswache', desc: 'Freiwillige patrouillieren in den Vierteln. Weniger Kriminalität.', cost: 350, costPerPop: 0, unlock: 1000, mul: { crime: 0.9 } },
  { id: 'recycling', name: 'Recyclingpflicht', desc: 'Müll wird getrennt gesammelt: 15 % weniger Müll, weniger Dreck. Kostet je Einwohner.', cost: 150, costPerPop: 0.1, unlock: 1200, mul: { pollution: 0.9, garbage: 0.85 } },
  { id: 'nachtflug', name: 'Nachtflugverbot', desc: 'Keine Starts und Landungen nachts: ruhiger, dafür weniger Flug-Tourismus. Braucht den Flughafen.', cost: 0, costPerPop: 0, unlock: 50000, needs: 'fraport', mul: { fraportTour: 0.8 }, add: { happy: 3 } },
  { id: 'gruen', name: 'Grüne Dächer', desc: 'Begrünte Dächer filtern die Luft und werten die Viertel auf. Teuer.', cost: 1200, costPerPop: 0, unlock: 4000, mul: { pollution: 0.95 }, add: { value: 2 } },
  { id: 'bankrabatt', name: 'Gewerbesteuer-Rabatt für Banken', desc: 'Banken zahlen 15 % weniger Steuern und kommen eher nach Frankfurt.', cost: 0, costPerPop: 0, unlock: 3000, mul: { bankTax: 0.85 }, add: { demandB: 0.08 } },
];

export const CATS = [
  { id: 'road', name: 'Straße', icon: '🛣' },
  { id: 'zone', name: 'Zonen', icon: '🏘' },
  { id: 'energy', name: 'Strom', icon: '⚡' },
  { id: 'water', name: 'Wasser', icon: '💧' },
  { id: 'waste', name: 'Müll', icon: '🗑' },
  { id: 'service', name: 'Dienste', icon: '🚒' },
  { id: 'transport', name: 'Verkehr', icon: '🚇' },
  { id: 'land', name: 'Wahrzeichen', icon: '🏛' },
  { id: 'tool', name: 'Werkzeug', icon: '🔧' },
];

/** Freischaltungen: Zone → Mindest-Einwohnerzahl. */
export const ZONE_UNLOCK = { [Z_R]: 0, [Z_C]: 0, [Z_I]: 0, [Z_B]: 3000 };

/** Meilensteine. */
export const MILESTONES = [
  { pop: 500, title: 'Dorf', msg: 'Polizei, Feuerwehr, Schule und die erste Äppelwoi-Wirtschaft sind freigeschaltet.' },
  { pop: 2000, title: 'Kleinstadt', msg: 'Der Römer wartet auf seinen Bau. Bald gibt es Banken!' },
  { pop: 3000, title: 'Stadt', msg: 'Das Bankenviertel ist freigeschaltet. Die Skyline kann wachsen.' },
  { pop: 10000, title: 'Großstadt', msg: 'Hauptbahnhof und Messe rücken näher. Frankfurt wird Metropole.' },
  { pop: 30000, title: 'Metropole', msg: 'Hochhäuser prägen den Main. Die Wahrzeichen-Türme sind bereit.' },
  { pop: 50000, title: 'Weltstadt', msg: 'Der Flughafen Fraport ist freigeschaltet. Mainhattan!' },
  { pop: 100000, title: 'Mainhattan', msg: 'Du hast eine echte Weltstadt gebaut. Glückwunsch!' },
];

export const CITY_NAMES = ['Simfurt', 'Neu-Frankfurt', 'Mainhattan', 'Bornheim', 'Sachsenhausen', 'Höchst'];

export const OVERLAYS = [
  { id: 'none', name: 'Normal' },
  { id: 'power', name: 'Strom' },
  { id: 'water', name: 'Wasser' },
  { id: 'rail', name: 'Bahn' },
  { id: 'traffic', name: 'Verkehr' },
  { id: 'crime', name: 'Kriminalität' },
  { id: 'pollution', name: 'Verschmutzung' },
  { id: 'garbage', name: 'Müll' },
  { id: 'value', name: 'Grundwert' },
  { id: 'fire', name: 'Feuerwehr' },
  { id: 'health', name: 'Gesundheit' },
  { id: 'edu', name: 'Bildung' },
];
