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

export const CATS = [
  { id: 'road', name: 'Straße', icon: '🛣' },
  { id: 'zone', name: 'Zonen', icon: '🏘' },
  { id: 'energy', name: 'Strom', icon: '⚡' },
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
  { id: 'traffic', name: 'Verkehr' },
  { id: 'crime', name: 'Kriminalität' },
  { id: 'pollution', name: 'Verschmutzung' },
  { id: 'value', name: 'Grundwert' },
  { id: 'fire', name: 'Feuerwehr' },
  { id: 'health', name: 'Gesundheit' },
  { id: 'edu', name: 'Bildung' },
];
