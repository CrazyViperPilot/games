// Großbauten der Stadt ohne eigenes Bild (seit v5.03, PRD §15; das Kraftwerk zeichnet seit v5.18 works.js): Kaserne (4 × 4,
// Unterkünfte mit Ziegeldach um einen Exerzierplatz, Wache, Fahrzeuge; seit v5.11 mit Fenstern, Toren und Bäumen), Fabrikhalle
// (5 × 5 seit v5.33, vorher 8 × 8; Montagehalle mit Sheddach, Verwaltung, Lackiererei, Schornsteine, Fahrzeughof mit fertigen Fahrzeugen, Portalkran) und
// Flughafen (10 × 10; Boden und gemalte Bauten seit v5.22 aus airport.js). Jede Anlage ist eine Liste von Teilen in Weltkoordinaten:
// Boden (Flächen, Linien, Vielecke) und Körper (Quader, Zylinder, Fahnen, gemalte Teile des Flughafens). Die 2D-Ansicht zeichnet sie
// von oben, die Iso-Ansicht jeden Körper einzeln in der Tiefenordnung (so stehen Einheiten richtig davor oder dahinter) und für jede
// Drehung der Karte richtig. Nur Zeichnen, keine Spielregeln.
import { airportGround, airportBodies, drawAirportIso, drawAirportTop } from './airport.js';
import { drawBox } from './iso.js';
import { shade, tint } from './sprites.js';
import { drawUnitTop, drawUnitIso, SHOWROOM } from './unitpaint.js';
import { UNITS } from '../data/units.js';
import { CITY } from '../data/city.js';

/** Ausstellungsstück (seit v5.40): echtes Einheitenmodell in Ausstellungslackierung, als Scheineinheit für unitpaint.js. */
const showUnit = (p) => ({ id: 0, type: p.unit, team: SHOWROOM, x: p.x, y: p.y, angle: p.angle, def: UNITS[p.unit], weapons: [], parked: true });

/** Ausstellungsstück von oben (2D). */
export function drawShowTop(ctx, p, zoom) {
  drawUnitTop(ctx, showUnit(p), zoom);
}

/** Ausstellungsstück isometrisch (Bildschirmpunkt aus der Kamera). */
export function drawShowIso(ctx, cam, p) {
  drawUnitIso(ctx, cam, showUnit(p), cam.worldToScreen(p.x, p.y));
}

/** Großbauten, die hier gezeichnet werden (die Universität hat ihr eigenes Bild, university.js). */
export const BIG_KINDS = new Set(['barracks', 'factory', 'airport', 'stand', 'atc', 'ktank', 'mdepot']); // seit v5.35 auch der Fliegerhorst (2 × 2)

const CONCRETE = '#b3afa4';
/** Fahrzeuge auf Höfen (seit v5.11): Länge, Breite, Höhe der Wanne (Weltpixel). */
export const VEH = { tank: { l: 32, w: 17, h: 7 }, apc: { l: 28, w: 15, h: 10 }, truck: { l: 30, w: 13, h: 15 }, jeep: { l: 19, w: 11, h: 9 } };
export const VEH_COLOR = '#5f6b3e';
const GLASS = '#6f93ad';

// ---- Anlagen: Boden und Körper je Art und Stufe (lokal, Mitte 0/0) ----

/** Boden einer Anlage: [{ t: 'rect', x0, y0, x1, y1, c } | { t: 'line', x0, y0, x1, y1, c, w } | { t: 'disc', x, y, r, c }]. */
function groundOf(k, lv, half) {
  const g = [];
  const rect = (x0, y0, x1, y1, c) => g.push({ t: 'rect', x0, y0, x1, y1, c });
  const line = (x0, y0, x1, y1, c, w) => g.push({ t: 'line', x0, y0, x1, y1, c, w });
  if (k === 'barracks') {
    // Kaserne (seit v5.11): Rasen, Exerzierplatz mit Fahne, Wege, Fahrzeugplatz vor dem Schuppen, Zufahrt mit Wache von Süden
    rect(-half + 3, -half + 3, half - 3, half - 3, '#8ea364');
    rect(-84, -84, 64, -62, '#b9b49a'); // Gehweg vor der Unterkunft Nord
    rect(-84, -84, -62, 44, '#b9b49a'); // Gehweg vor der Unterkunft West
    rect(-60, -62, 62, 42, '#66685f'); // Exerzierplatz
    line(-54, -56, 56, -56, '#e2dfd2', 1.6);
    line(56, -56, 56, 36, '#e2dfd2', 1.6);
    line(56, 36, -54, 36, '#e2dfd2', 1.6);
    line(-54, 36, -54, -56, '#e2dfd2', 1.6);
    for (let x = -40; x <= 40; x += 16) line(x, 22, x + 8, 22, '#e2dfd2', 1.6); // Antrittslinie
    rect(-8, -18, 8, -2, '#b9b49a'); // Sockel des Fahnenmasts
    rect(36, 42, 62, half - 3, '#5d5f5a'); // Zufahrt
    for (let y = 52; y < half - 8; y += 18) line(49, y, 49, y + 8, '#e2dfd2', 1.4);
    rect(-42, 56, 36, 124, '#7b7c76'); // Fahrzeugplatz
    for (let x = -36; x <= 30; x += 22) line(x, 62, x, 82, '#e3d46a', 1.4);
    if (lv >= 2) {
      rect(68, 46, 122, 86, '#c9b27a'); // Hindernisbahn (Sand)
      for (let x = 76; x <= 114; x += 9.5) line(x, 50, x, 82, '#6b4f33', 2.2); // Hürden und Balken
      line(70, 66, 120, 66, '#8a6a45', 1.2);
    }
    const f = half - 6;
    for (const [x0, y0, x1, y1] of [[-f, -f, f, -f], [f, -f, f, f], [f, f, 66, f], [32, f, -f, f], [-f, f, -f, -f]]) line(x0, y0, x1, y1, '#4a4a42', 2.5); // Zaun (Lücke an der Zufahrt)
  } else if (k === 'factory') {
    // Fabrikhalle (seit v5.11, seit v5.33 als 5 × 5-Großbau, ±160): Betonhof, Fahrzeughof mit Stellplätzen zur Straße, Rasen vor der Verwaltung
    rect(-half + 3, -half + 3, half - 3, half - 3, '#a9a69c');
    rect(-150, 96, 150, 152, '#8c8a82'); // Fahrzeughof
    const bays = CITY.produces.factory.length;
    for (let n = 0; n <= bays; n++) line(-148 + (296 / bays) * n, 104, -148 + (296 / bays) * n, 146, '#e3d46a', 1.6); // Stellplätze je Ausstellungsstück
    line(-half + 8, 90, half - 8, 90, '#e3d46a', 2.4);
    rect(66, -30, 152, -8, '#86a05e'); // Rasen vor der Verwaltung
    rect(102, -34, 114, -8, '#c9c4b4'); // Weg zum Eingang
    rect(-148, -26, 52, -8, '#9b988f'); // Vorplatz der Montagehalle
    for (let x = -126; x <= 30; x += 52) line(x, -24, x, -10, '#e3d46a', 1.4);
    if (lv >= 2) rect(96, 26, 152, 84, '#96938a'); // Containerlager
  } else if (k === 'stand') {
    // Stellplatz (seit v5.35): Betonfläche mit gelber Führungslinie und Haltekreuz
    rect(-half + 3, -half + 3, half - 3, half - 3, '#a8a69e');
    line(0, half - 6, 0, -18, '#e3c43a', 2);
    line(-10, -18, 10, -18, '#e3c43a', 2);
    for (const [x0, y0, x1, y1] of [[-half + 8, -half + 8, half - 8, -half + 8], [half - 8, -half + 8, half - 8, half - 8], [-half + 8, half - 8, -half + 8, -half + 8]]) line(x0, y0, x1, y1, '#f2f0e6', 1.4);
  } else if (k === 'atc') {
    rect(-half + 3, -half + 3, half - 3, half - 3, '#9a988f');
    rect(-46, 20, 46, 54, '#86a05e'); // Rasen
  } else if (k === 'ktank') {
    rect(-half + 3, -half + 3, half - 3, half - 3, '#8f9398');
    rect(-54, -54, 54, 54, '#7d8186'); // Auffangwanne
  } else if (k === 'mdepot') {
    rect(-half + 3, -half + 3, half - 3, half - 3, '#8b9273');
    const f = half - 6;
    for (const [x0, y0, x1, y1] of [[-f, -f, f, -f], [f, -f, f, f], [f, f, -f, f], [-f, f, -f, -f]]) line(x0, y0, x1, y1, '#4a4a42', 2); // Zaun
  } else if (k === 'airport') return airportGround(lv); // seit v5.22: Markierungen, Befeuerung, Rollgassen (airport.js)
  return g;
}

/**
 * Körper einer Anlage: [{ t: 'box', x0, y0, x1, y1, h, base, c, roof, …Schmuck } | { t: 'cyl', x, y, r, r1, h, base, c, band }
 * | { t: 'flag', x, y, h } | { t: 'veh', v, x, y, ax, h } | { t: 'tree', x, y, r }]. Schmuck eines Quaders (seit v5.11, gezeichnet in
 * isobuild.js): gable = Firsthöhe des Satteldachs, saw = { n, rh } Sheddach, win = Fensterreihen [[h0, h1]] mit Abstand wg und Breite ww,
 * gates = { e: Wände, n, w, h } Rolltore, door = Wände mit Tür, stripe = Band in Teamfarbe, ribs = Wellblech-Rippen.
 * Wände: 0 Norden (y0), 1 Osten (x1), 2 Süden (y1), 3 Westen (x0).
 */
function bodiesOf(k, lv, half) {
  const b = [];
  const box = (x0, y0, x1, y1, h, c, roof, base = 0, deco = null) => b.push({ t: 'box', x0, y0, x1, y1, h, base, c, roof, ...deco });
  const veh = (v, x, y, ax) => b.push({ t: 'veh', v, x, y, ax, h: VEH[v].h }); // Fahrzeug, Front nach +ax
  const cyl = (x, y, r, h, c, o = {}) => b.push({ t: 'cyl', x, y, r, r1: o.r1 ?? r, h, base: o.base ?? 0, c, band: o.band ?? null });
  const show = (unit, x, y, angle) => UNITS[unit] && b.push({ t: 'unit', unit, x, y, angle, h: 10 }); // Ausstellungsstück (seit v5.40)
  if (k === 'barracks') {
    // Kaserne (seit v5.11): zwei Unterkünfte mit Ziegeldach, Fahrzeugschuppen mit Toren, Wache mit Schranke, Fahrzeuge, Bäume;
    // Stufe 2: Stabsgebäude und Schützenpanzer; Stufe 3: Wachtürme in den Ecken und ein Panzer auf dem Exerzierplatz.
    const W = '#ddd2b0';
    const TILE = '#a65040';
    const rows2 = [[5, 10], [15, 20]];
    box(-118, -96, -82, 44, 24, W, TILE, 0, { gable: 11, win: rows2, wg: 13, ww: 5, door: [1] }); // Unterkunft West
    box(-62, -118, 76, -86, 24, W, TILE, 0, { gable: 11, win: rows2, wg: 13, ww: 5, door: [2] }); // Unterkunft Nord
    box(-104, 60, -44, 110, 18, '#7b8058', '#5d6450', 0, { gates: { e: [1], n: 2, w: 17, h: 13 }, ribs: true }); // Fahrzeugschuppen
    box(70, 92, 96, 114, 13, W, '#56603a', 0, { win: [[5, 10]], wg: 10, ww: 6, door: [3] }); // Wache
    box(64, 89, 68, 117, 2, '#55585b', '#55585b', 13); // Vordach der Wache
    box(34, 103.5, 66, 106.5, 2.5, '#e8e4d4', '#d23a3a', 7); // Schranke
    box(63, 102, 67, 108, 9, '#d23a3a', '#e8e4d4'); // Pfosten der Schranke
    b.push({ t: 'flag', x: 0, y: -10, h: 64 });
    show('truck', -20, 92, Math.PI / 2); // Ausstellungsstücke statt der Kastenfahrzeuge (seit v5.40)
    // Soldaten der Kaserne angetreten an der Antrittslinie, je Art einer
    CITY.produces.barracks.forEach((u, n, all) => show(u, (n - (all.length - 1) / 2) * 18, 30, -Math.PI / 2));
    for (const [x, y] of [[96, -100], [114, -74], [-62, 52], [-28, 46]]) b.push({ t: 'tree', x, y, r: 9 });
    if (lv >= 2) {
      box(82, -56, 120, 32, 30, '#e4dcc4', '#8a4434', 0, { gable: 10, win: [[5, 11], [15, 21], [23, 28]], wg: 12, ww: 5, door: [3] }); // Stabsgebäude
      show('ifv', 14, 94, Math.PI / 2);
    }
    if (lv >= 3) {
      for (const [x, y] of [[-116, -116], [116, -116], [116, 116], [-116, 116]]) {
        box(x - 5, y - 5, x + 5, y + 5, 34, '#6b5a44', '#6b5a44'); // Wachturm: Gerüst
        box(x - 9, y - 9, x + 9, y + 9, 9, '#7b8058', '#56603a', 34, { win: [[3, 7]], wg: 8, ww: 6 }); // Kanzel
      }
      show('tank', -32, -30, 0);
    }
  } else if (k === 'factory') {
    // Fabrikhalle (seit v5.11; seit v5.33 kompakt für 5 × 5 Zellen, ±160): Montagehalle mit Sheddach und Toren, Verwaltung mit
    // Fensterbändern und Streifen in Teamfarbe, Schornstein, Tanklager, fertige Fahrzeuge auf dem Hof; Stufe 2: Lackiererei, zweite
    // Halle, Containerlager; Stufe 3: dritte Halle, zweiter Schornstein, Portalkran über den Containern, mehr Fahrzeuge.
    const HALL = '#bcc1bd';
    box(-148, -148, 52, -30, 38, HALL, '#8e959a', 0, { saw: { n: 6, rh: 12 }, gates: { e: [2], n: 3, w: 34, h: 26 }, win: [[29, 34]], wg: 18, ww: 12, ribs: true }); // Montagehalle
    box(66, -78, 150, -34, 30, '#e4e0d4', '#7b7f82', 0, { win: [[5, 10], [14, 19], [22, 27]], wg: 9, ww: 6, stripe: true, door: [2] }); // Verwaltung
    box(98, -34, 118, -24, 1.5, '#55585b', '#6d7174', 11); // Vordach am Eingang
    for (const [x, y] of [[84, -62], [134, -50]]) box(x - 5, y - 4, x + 5, y + 4, 4, '#9a9fa3', '#b9bec1', 30); // Klimageräte
    cyl(34, -14, 8, 86, '#9a948a', { r1: 6, band: '#c0392b' }); // Schornstein
    cyl(78, 10, 11, 22, '#dfe3e6'); // Tanklager
    cyl(106, 10, 11, 22, '#dfe3e6');
    b.push({ t: 'tree', x: 140, y: -14, r: 8 });
    // Fahrzeughof (seit v5.40): von jeder Einheit der Fabrikhalle ein Ausstellungsstück, Front zur Straße
    const yard = CITY.produces.factory;
    const gap = 296 / yard.length;
    yard.forEach((u, n) => show(u, -148 + gap * (n + 0.5), 124, Math.PI / 2));
    if (lv >= 2) {
      box(66, -150, 150, -92, 28, '#c9c6bc', '#8a8f92', 0, { gates: { e: [2], n: 1, w: 30, h: 20 }, win: [[21, 25]], wg: 14, ww: 9 }); // Lackiererei
      for (const x of [86, 108, 130]) box(x - 6, -130, x + 6, -118, 6, '#8d9296', '#6d7276', 28); // Abluft
      box(-148, -6, -56, 70, 28, HALL, '#7d858b', 0, { gable: 12, gates: { e: [2], n: 2, w: 26, h: 20 }, win: [[22, 26]], wg: 16, ww: 10, ribs: true }); // zweite Halle
      const CT = ['#b5523b', '#3c6e9e', '#c9a13a', '#5f7f4f'];
      [[104, 32, 0], [104, 48, 0], [104, 64, 0], [104, 32, 12], [104, 48, 12]].forEach(([x, y, z], n) => box(x, y, x + 40, y + 13, 12, CT[n % 4], shade(CT[n % 4], 0.1), z)); // Container
    }
    if (lv >= 3) {
      box(-44, -6, 52, 70, 26, HALL, '#7d858b', 0, { gable: 11, gates: { e: [2], n: 2, w: 24, h: 18 }, ribs: true }); // dritte Halle
      cyl(58, -14, 7, 76, '#9a948a', { r1: 5, band: '#c0392b' });
      for (const [x, y] of [[98, 28], [98, 82], [150, 28], [150, 82]]) box(x - 3, y - 3, x + 3, y + 3, 40, '#d9a21b', '#d9a21b'); // Portalkran: Stützen
      for (const x of [98, 150]) box(x - 3, 25, x + 3, 85, 4, '#d9a21b', '#e8b52c', 40); // Kranbahn
      box(95, 52, 153, 59, 5, '#d9a21b', '#e8b52c', 44); // Brücke
      box(118, 50, 130, 61, 4, '#55585b', '#6d7174', 49); // Laufkatze
    }
  } else if (k === 'stand') {
    // Stellplatz (seit v5.35; Stufen seit v5.39 nur per „Ausbauen“): Stufe 1 offen (Bremsklötze, Leitkegel), Stufe 2 Überdachung
    // (Stahldach auf Stützen, halb durchsichtig gezeichnet), Stufe 3 Stahlbeton-Shelter nach dem Vorbild der Hardened Aircraft
    // Shelter (gewölbte Betonröhre, Front nach Norden wie die Nase des Jets, seitlich aufgeschobene Tore, Abgasöffnung hinten, Erdanschüttung an den
    // Seiten). Teile mit over liegen über dem abgestellten Flugzeug: 2D nach den Einheiten, Iso hinter ihm in der Tiefe, je mit alpha.
    box(-40, 44, -32, 50, 2, '#d8d4c8', '#e8e4d8'); // Bremsklötze
    box(32, 44, 40, 50, 2, '#d8d4c8', '#e8e4d8');
    if (lv === 2) {
      const STEEL = '#8d969c';
      for (const [x, y] of [[-54, -54], [54, -54], [-54, 0], [54, 0], [-54, 46], [54, 46]]) box(x - 2.5, y - 2.5, x + 2.5, y + 2.5, 26, '#6d7479', '#7d858a'); // Stützen
      box(-58, -50, -54, 44, 12, '#7d858a', '#8d969c'); // Windschutz seitlich (halbhoch)
      box(54, -50, 58, 44, 12, '#7d858a', '#8d969c');
      b.push({ t: 'box', x0: -60, y0: -60, x1: 60, y1: 52, h: 4, base: 26, c: '#7b8388', roof: STEEL, ribs: true, fine: true, over: true, alpha: 0.5 }); // Stahldach
    } else if (lv >= 3) {
      const CON = '#a9a69c';
      box(-62, -54, -50, 44, 10, '#7f7a58', '#8f8a5a', 0, { gable: 4 }); // Erdanschüttung links
      box(50, -54, 62, 44, 10, '#7f7a58', '#8f8a5a', 0, { gable: 4 });
      box(-48, 46, 48, 54, 22, '#9d9a90', '#8e8b82'); // Rückwand (Süden; die Nase des Jets zeigt nach Norden zum Tor)
      box(-10, 54, 10, 58, 12, '#55585b', '#6d7174', 6); // Abgasöffnung
      box(-62, -60, -48, -54, 30, '#8e8b82', '#a29f95'); // Tor links (aufgeschoben)
      box(48, -60, 62, -54, 30, '#8e8b82', '#a29f95'); // Tor rechts
      b.push({ t: 'box', x0: -50, y0: -54, x1: 50, y1: 48, h: 14, base: 0, c: CON, roof: shade(CON, 0.08), gable: 20, ribs: true, fine: true, over: true, alpha: 0.6 }); // Betonröhre
    } else {
      for (const [x, y] of [[-48, 54], [48, 54], [-48, -50], [48, -50]]) cyl(x, y, 3, 7, '#e8742c', { r1: 0.5 }); // Leitkegel
    }
  } else if (k === 'atc') {
    // Tower (seit v5.35): Betriebsgebäude, Schaft, verglaste Kanzel, Radar
    box(-50, -10, 20, 26, 18, '#e4e0d4', '#8a8f92', 0, { win: [[7, 13]], wg: 9, ww: 6, stripe: true, door: [2] });
    cyl(34, -24, 11, 58, '#dcd8cc');
    box(20, -38, 48, -10, 14, '#6f93ad', '#55585b', 58, { win: [[2, 12]], wg: 6, ww: 5 }); // Kanzel
    box(30, -28, 38, -20, 6, '#55585b', '#6d7174', 72); // Antenne
    cyl(-30, -36, 9, 4, '#9a9fa3', { base: 18 }); // Radar
    b.push({ t: 'flag', x: -44, y: 30, h: 34 });
    if (lv >= 2) cyl(-30, -36, 3, 10, '#dfe3e6', { base: 22 });
  } else if (k === 'ktank') {
    // Kerosintank (seit v5.35): Rundtanks mit blauen Ringen, Pumpenhaus; mehr Tanks je Stufe
    const BLUE = '#2f7fd1';
    const tanks = lv >= 3 ? [[-26, -26], [26, -26], [-26, 26], [26, 26]] : lv >= 2 ? [[-26, -20], [26, -20], [0, 30]] : [[-22, 0], [24, 0]];
    for (const [x, y] of tanks) cyl(x, y, 18, 22, '#e9ecef', { band: BLUE });
    box(-8, 40, 18, 54, 9, '#c9c6bc', '#8a8f92');
  } else if (k === 'mdepot') {
    // Munitionslager (seit v5.35): erdbedeckte Bunker mit Betonstirn, Kisten; mehr Bunker je Stufe
    const n = lv >= 3 ? 3 : lv >= 2 ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const x = -40 + j * 40;
      box(x - 15, -44, x + 15, 20, 14, '#6f7a4a', '#7f8a55', 0, { gable: 10 }); // Bunker
      box(x - 15, 20, x + 15, 26, 16, '#b9b6ad', '#a8a59c', 0, { gates: { e: [2], n: 1, w: 16, h: 11 } }); // Stirnwand mit Tor
    }
    for (const [x, y] of [[-36, 42], [-14, 42], [8, 42]]) box(x, y, x + 16, y + 10, 8, '#7b6a44', '#8a7a52'); // Kisten
  } else if (k === 'airport') return airportBodies(lv); // seit v5.22: gemalte Hangars, Tower, Tanklager … (airport.js)
  return b;
}

const plans = new Map(); // Anlagen je Art, Stufe und Lage (seit v5.22; der Flughafen hat viele Teile, nicht jedes Bild neu bauen)

/** Größe, Stufe und Mitte → Anlage { ground, bodies } in Weltkoordinaten (Mitte cx, cy). Nicht verändern (Zwischenspeicher). */
export function bigPlan(k, lv, cx, cy, size) {
  const key = `${k}|${lv}|${cx}|${cy}|${size}`;
  const hit = plans.get(key);
  if (hit) return hit;
  const half = size / 2;
  const mv = (o) => {
    const p = { ...o };
    for (const key of ['x', 'x0', 'x1']) if (key in p) p[key] += cx;
    for (const key of ['y', 'y0', 'y1']) if (key in p) p[key] += cy;
    if (p.pts) p.pts = p.pts.map(([x, y]) => [x + cx, y + cy]);
    return p;
  };
  const bodies = bodiesOf(k, Math.max(1, lv), half).map(mv);
  if (k === 'barracks' || k === 'factory') for (const p of bodies) p.fine = true; // seit v5.11: weichere Wände und Schmuck (isobuild.js)
  const plan = { ground: groundOf(k, Math.max(1, lv), half).map(mv), bodies };
  if (plans.size > 48) plans.clear();
  plans.set(key, plan);
  return plan;
}

/** Höchster Punkt einer Anlage (Weltpixel): Schild darüber. */
export function bigTop(k, lv) {
  return Math.max(30, ...bodiesOf(k, Math.max(1, lv), 0).map((p) => (p.base ?? 0) + (p.h ?? 0) + (p.gable ?? p.saw?.rh ?? 0)));
}

// ---- Boden (citylayer.js stellt die Zeichenhilfen: Fläche, Linie, Kreis auf dem Gelände) ----

/**
 * Boden einer gebauten Anlage über die Hilfen `g` = { begin(), rect(x0, y0, x1, y1), line(x0, y0, x1, y1), poly(pts), fill(color),
 * stroke(color, width) }: aufeinanderfolgende Teile gleicher Art, Farbe und Breite in einem Pfad (seit v5.22). detail = false lässt
 * feine Teile (fine) weg, winter = Schneefarbe für Rasen (grass).
 */
export function drawBigGround(g, plan, detail = true, winter = false) {
  const L = plan.ground;
  const kind = (p) => (p.t === 'line' ? 'l' : 'f');
  const col = (p) => (winter && p.grass ? p.grass : p.c);
  for (let i = 0; i < L.length; ) {
    const p = L[i];
    let j = i;
    g.begin();
    let any = false;
    while (j < L.length && kind(L[j]) === kind(p) && col(L[j]) === col(p) && (L[j].w ?? 0) === (p.w ?? 0)) {
      const q = L[j++];
      if (q.fine && !detail) continue;
      any = true;
      if (q.t === 'rect') g.rect(q.x0, q.y0, q.x1, q.y1);
      else if (q.t === 'line') g.line(q.x0, q.y0, q.x1, q.y1);
      else if (q.t === 'poly') g.poly(q.pts);
    }
    if (any) {
      if (kind(p) === 'l') g.stroke(col(p), p.w);
      else g.fill(col(p));
    }
    i = j;
  }
}

// ---- 2D von oben ----

/**
 * Körper von oben: Schatten nach rechts unten (länger, je höher), Dach, Lichtseite; Zylinder als Kreis. Team = Fahne und Streifen.
 * Gemalte Teile des Flughafens (t 'ap') bringen ihren Schatten mit (airport.js, zoom für die Bildgröße).
 */
export function drawBigTop(ctx, plan, color, damage = 0, zoom = 1, over = false) {
  const bodies = plan.bodies.filter((p) => !!p.over === over); // over: Dächer über abgestellten Flugzeugen (eigener Durchgang)
  if (!bodies.length) return;
  for (const p of bodies) {
    if (p.t === 'ap') continue;
    const s = Math.min(40, ((p.base ?? 0) + (p.h ?? 0) + (p.gable ?? 0)) * 0.22);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    if (p.t === 'box') ctx.fillRect(p.x0 + s, p.y0 + s, p.x1 - p.x0, p.y1 - p.y0);
    else if (p.t === 'cyl' || p.t === 'tree') {
      ctx.beginPath();
      ctx.arc(p.x + s, p.y + s, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.t === 'veh') {
      const [hx, hy] = vehHalf(p);
      ctx.fillRect(p.x - hx + 3, p.y - hy + 3, hx * 2, hy * 2);
    }
  }
  for (const p of bodies) {
    if (p.alpha) ctx.globalAlpha = p.alpha;
    if (p.t === 'ap') drawAirportTop(ctx, p, color, zoom);
    else if (p.t === 'box') boxTop(ctx, p, color);
    else if (p.t === 'cyl') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c;
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,30,30,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r1 * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = p.band ?? shade(p.c, 0.35);
      ctx.fill();
    } else if (p.t === 'flag') {
      ctx.fillStyle = '#d8d8d0';
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      ctx.fillStyle = color;
      ctx.fillRect(p.x + 1.5, p.y - 1.5, 14, 9);
    } else if (p.t === 'veh') vehTop(ctx, p);
    else if (p.t === 'unit') drawShowTop(ctx, p, zoom);
    else if (p.t === 'tree') {
      ctx.fillStyle = '#2f5a2a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4f8a3c';
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (damage > 0.05) {
    ctx.fillStyle = `rgba(20,10,5,${(0.5 * damage).toFixed(2)})`;
    for (const p of bodies) {
      if (p.t === 'box') ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
      else if (p.t === 'ap' && p.fw > 20) ctx.fillRect(p.x - p.fw / 2, p.y - p.fh / 2, p.fw, p.fh);
    }
  }
}

/** Dach eines Quaders von oben: flach, Satteldach (zwei Hälften mit First) oder Sheddach (Streifen mit Glas). */
function boxTop(ctx, p, color) {
  const w = p.x1 - p.x0;
  const h = p.y1 - p.y0;
  const roof = p.roof;
  ctx.lineWidth = 1;
  if (p.gable) {
    const alongX = w >= h;
    ctx.fillStyle = tint(roof, 0.12);
    if (alongX) ctx.fillRect(p.x0, p.y0, w, h / 2);
    else ctx.fillRect(p.x0, p.y0, w / 2, h);
    ctx.fillStyle = shade(roof, 0.18);
    if (alongX) ctx.fillRect(p.x0, p.y0 + h / 2, w, h / 2);
    else ctx.fillRect(p.x0 + w / 2, p.y0, w / 2, h);
    ctx.strokeStyle = shade(roof, 0.45);
    ctx.beginPath();
    if (alongX) {
      ctx.moveTo(p.x0, p.y0 + h / 2);
      ctx.lineTo(p.x1, p.y0 + h / 2);
    } else {
      ctx.moveTo(p.x0 + w / 2, p.y0);
      ctx.lineTo(p.x0 + w / 2, p.y1);
    }
    ctx.stroke();
  } else if (p.saw) {
    const step = w / p.saw.n;
    for (let i = 0; i < p.saw.n; i++) {
      const a = p.x0 + i * step;
      const gr = ctx.createLinearGradient(a, 0, a + step, 0);
      gr.addColorStop(0, shade(roof, 0.2));
      gr.addColorStop(1, tint(roof, 0.15));
      ctx.fillStyle = gr;
      ctx.fillRect(a, p.y0, step, h);
      ctx.fillStyle = '#6f93ad';
      ctx.fillRect(a + step - 4, p.y0, 4, h);
    }
  } else {
    ctx.fillStyle = roof;
    ctx.fillRect(p.x0, p.y0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(p.x0, p.y0, w, h / 2);
  }
  if (p.stripe) {
    ctx.fillStyle = color;
    ctx.fillRect(p.x0, p.y1 - 3, w, 3);
  }
  ctx.strokeStyle = 'rgba(30,30,30,0.35)';
  ctx.strokeRect(p.x0, p.y0, w, h);
}

/** Halbe Ausdehnung eines Fahrzeugs in x und y. */
export function vehHalf(p) {
  const d = VEH[p.v];
  return p.ax === 'x' ? [d.l / 2, d.w / 2] : [d.w / 2, d.l / 2];
}

/** Fahrzeug von oben: Wanne, Ketten oder Kabine, Turm mit Rohr. */
function vehTop(ctx, p) {
  const [hx, hy] = vehHalf(p);
  const ax = p.ax === 'x';
  const d = VEH[p.v];
  ctx.fillStyle = shade(VEH_COLOR, 0.3);
  ctx.fillRect(p.x - hx, p.y - hy, hx * 2, hy * 2);
  ctx.fillStyle = VEH_COLOR;
  ctx.fillRect(p.x - hx + (ax ? 1 : 2.5), p.y - hy + (ax ? 2.5 : 1), hx * 2 - (ax ? 2 : 5), hy * 2 - (ax ? 5 : 2));
  const f = d.l / 2; // Front nach +x bzw. +y
  const at = (u, v) => (ax ? [p.x + u, p.y + v] : [p.x + v, p.y + u]);
  if (p.v === 'truck') {
    const [cx, cy] = at(f - 5, 0);
    ctx.fillStyle = '#4f5a33';
    ctx.fillRect(cx - (ax ? 5 : hx), cy - (ax ? hy : 5), ax ? 10 : hx * 2, ax ? hy * 2 : 10);
    const [tx, ty] = at(-4, 0);
    ctx.fillStyle = '#7a8150'; // Plane
    ctx.fillRect(tx - (ax ? 11 : hx - 1), ty - (ax ? hy - 1 : 11), ax ? 22 : hx * 2 - 2, ax ? hy * 2 - 2 : 22);
  } else if (p.v !== 'jeep') {
    const [tx, ty] = at(-2, 0);
    ctx.fillStyle = tint(VEH_COLOR, 0.12);
    ctx.beginPath();
    ctx.arc(tx, ty, p.v === 'tank' ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    const [bx, by] = at(f + (p.v === 'tank' ? 10 : 2), 0);
    ctx.strokeStyle = '#3d4528';
    ctx.lineWidth = p.v === 'tank' ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(bx, by);
    ctx.stroke();
  } else {
    const [wx, wy] = at(2, 0);
    ctx.fillStyle = '#34495e'; // Frontscheibe
    ctx.fillRect(wx - (ax ? 1.5 : hx - 1), wy - (ax ? hy - 1 : 1.5), ax ? 3 : hx * 2 - 2, ax ? hy * 2 - 2 : 3);
  }
}

// ---- Isometrisch ----

/** Ein Körper einer Anlage isometrisch (Transformation: Bildschirm, dpr gesetzt; Höhe: cam.pin vom Renderer). */
export function drawBigPart(ctx, cam, p, color) {
  if (p.t === 'ap') {
    drawAirportIso(ctx, cam, p, color); // gemalter Teil des Flughafens (seit v5.22)
    return;
  }
  if (p.t === 'box') {
    drawBox(ctx, cam, p.x0, p.y0, p.x1, p.y1, p.h, p.c, { base: p.base, roof: p.roof, noShadow: p.base > 0 });
    return;
  }
  const z = cam.zoom;
  const q = cam.worldToScreen(p.x, p.y);
  if (p.t === 'flag') {
    ctx.strokeStyle = '#e4e4dc';
    ctx.lineWidth = Math.max(1, 1.6 * z);
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(q.x, q.y - p.h * z);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(q.x, q.y - p.h * z, 16 * z, 10 * z);
    return;
  }
  // Zylinder (Schornstein, Kühlturm, Tower): unten Radius r, oben r1; Kreis in der Iso-Ansicht = Ellipse r × r/2
  const y0 = q.y - p.base * z;
  const y1 = y0 - p.h * z;
  const R0 = p.r * z;
  const R1 = p.r1 * z;
  ctx.save();
  const grad = ctx.createLinearGradient(q.x - R0, 0, q.x + R0, 0);
  grad.addColorStop(0, tint(p.c, 0.12));
  grad.addColorStop(0.45, shade(p.c, 0.1));
  grad.addColorStop(1, shade(p.c, 0.45));
  if (!p.base) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; // Schatten nach links unten
    ctx.beginPath();
    ctx.ellipse(q.x - p.h * z * 0.3, q.y + p.h * z * 0.15, R0 * 1.1, R0 * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(q.x - R1, y1);
  ctx.lineTo(q.x - R0, y0);
  ctx.ellipse(q.x, y0, R0, R0 / 2, 0, Math.PI, 0, true);
  ctx.lineTo(q.x + R1, y1);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,30,20,0.45)';
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.stroke();
  if (p.band) {
    // rot-weiße Ringe unter der Mündung (Schornstein)
    for (const f of [0.86, 0.94]) {
      const yy = y0 + (y1 - y0) * f;
      const rr = R0 + (R1 - R0) * f;
      ctx.beginPath();
      ctx.ellipse(q.x, yy, rr, rr / 2, 0, 0, Math.PI);
      ctx.lineWidth = Math.max(1.5, p.h * z * 0.04);
      ctx.strokeStyle = p.band;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.ellipse(q.x, y1, R1, R1 / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = p.r1 < p.r * 0.8 ? '#3a3734' : tint(p.c, 0.18); // Kühlturm und Schornstein: offene Mündung
  ctx.fill();
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.strokeStyle = 'rgba(40,30,20,0.45)';
  ctx.stroke();
  ctx.restore();
}

/** Mittelpunkt und Fußabdruck eines Körpers (für Tiefenordnung und Geländehöhe im Renderer). */
export function partFoot(p) {
  if (p.t === 'ap') return { x: p.x, y: p.y, w: p.fw, h: p.fh };
  if (p.t === 'veh') {
    const [hx, hy] = vehHalf(p);
    return { x: p.x, y: p.y, w: hx * 2, h: hy * 2 };
  }
  if (p.t === 'box') return { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2, w: p.x1 - p.x0, h: p.y1 - p.y0 };
  if (p.t === 'unit') return { x: p.x, y: p.y, w: 24, h: 24 };
  const r = p.r ?? 4;
  return { x: p.x, y: p.y, w: r * 2, h: r * 2 };
}
