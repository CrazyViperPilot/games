// Bild-Sprites für die isometrische Ansicht (freies Paket von Kenney, CC0, siehe assets/iso/README.md).
// Alles hier ist optional: fehlt ein Bild oder ist ?sprites=0 gesetzt, bleibt die gemalte Variante.
// Austausch: Dateien in assets/iso/ ersetzen oder die Listen unten anpassen.
import { spriteOverrides } from './isobuild.js';
import { seasonal } from './season.js';
import { drawUnitIso, drawWreckIso } from './unitpaint.js';

const ENABLED = typeof Image !== 'undefined' && typeof location !== 'undefined' && new URLSearchParams(location.search).get('sprites') !== '0';
const url = (p) => new URL(`../../assets/iso/${p}`, import.meta.url).href;
const load = (p) => {
  if (!ENABLED) return null;
  const img = new Image();
  img.src = url(p);
  return img;
};
const ready = (img) => !!img && img.complete && img.naturalWidth > 0;
const hash = (x, y = 0) => (Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(y) | 0, 19349663)) >>> 0;

// Häuser, Hallen, Fabriken und der Zug der Karte sind seit v5.23 gemalt (maptown.js); die Kenney-Bilder dafür sind entfernt.
// Wachturm der Karte (eigenes Modell, assets/iso/README.md): je Drehung der Ansicht ein Bild, 1 Modelleinheit = 1 Kachel.
// Die eigenen Militärgebäude (Zentrale, Mörser, Flak, Mauer, Tor, Gefechtsturm …) sind seit v5.21 gemalt (milbuild.js).
const TOWER = [0, 1, 2, 3].map((r) => load(`buildings/tower-r${r}.png`));
const TOWER_VIEW = { ax: 119, ay: 222, ppu: 64, footprint: 78.4 }; // Bodenmitte im Bild, Pixel je Modelleinheit, Kabinenbreite in Welt-Pixeln
const TILE_W = 32; // Weltpixel je Kachel (1 Modelleinheit des Turmbilds)
const TREE = load('trees/tree.png'); // Ersatz, solange die gemalten Bäume laden: blockiger Baum
// Gemalte Bäume (tools/gen-trees.mjs), drei Laubbäume und eine Fichte, je Baum fest nach Position
const TREES_NATURAL = ['a', 'b', 'c', 'd'].map((n) => load(`trees/tree-${n}.png`));
const TREE_FOOT = 6; // Bildzeilen unter dem Stammfuß im Natur-Bild
// Gemalte Felsen und Büsche (tools/gen-rocks.mjs): Bodenpunkt im Bild und Bildbreite
const ROCKS = ['a', 'b', 'c', 'd'].map((n) => load(`rocks/rock-${n}.png`));
const BUSHES = ['a', 'b', 'c'].map((n) => load(`bushes/bush-${n}.png`));
// Zivile Autos (tools/gen-cars.mjs): ein Blatt, Spalte = Lackfarbe, Zeile = Form (Limousine, Kombi, Transporter) × Richtung
const CARS = load('cars/cars.png');
const CAR_COLORS = ['#b8b8b0', '#8a2f2f', '#2f4f7a', '#d0c060', '#3b3b3b', '#d8d8d8', '#4f7a4f']; // wie CAR_COLORS in js/game/map.js
const CAR_CELL = { w: 96, h: 80, ax: 48, ay: 56, ppu: 2 }; // Zellgröße, Wagenmitte am Boden, Bildpunkte je Bildschirm-Pixel
const ROCK_VIEW = { ax: 64, ay: 92, w: 128, h: 104 };
const BUSH_VIEW = { ax: 36, ay: 50, w: 72 };

// Soldaten, Fahrzeuge, Hubschrauber und F-16 sind seit v5.27 gemalt (unitpaint.js); die Bilder aus tools/gen-troops.mjs sind entfernt.

if (ENABLED) {
  spriteOverrides.tower = (ctx, cam, b) => {
    const img = TOWER[cam.rot];
    if (!ready(img)) return false;
    const sc = ((b.w / TOWER_VIEW.footprint) * (TILE_W * cam.zoom)) / TOWER_VIEW.ppu;
    const p = cam.worldToScreen(b.x, b.y);
    ctx.drawImage(img, p.x - TOWER_VIEW.ax * sc, p.y - TOWER_VIEW.ay * sc, img.naturalWidth * sc, img.naturalHeight * sc);
    return true;
  };
}

/** Baum (aufrecht, Fuß am Weltpunkt). Liefert false, wenn das Bild fehlt. */
export function drawTreeSprite(ctx, cam, t, season = 'summer') {
  const natural = TREES_NATURAL[hash(t.x, t.y * 3 + 1) % 4]; // aufrechte Kronen: in allen Drehungen gleich
  if (natural && ready(natural)) return drawNaturalTree(ctx, cam, t, season, natural);
  if (!ready(TREE)) return false;
  // Jahreszeit: Herbstlaub in drei Färbungen (je Baum fest), Winter mit Schnee auf der Krone (season.js)
  const img = seasonal(TREE, season, 'tree', 2, season === 'autumn' ? hash(t.x, t.y) % 3 : 0);
  const z = cam.zoom;
  const p = cam.worldToScreen(t.x, t.y);
  const r = t.r * z;
  const s = (0.9 + (hash(t.x, t.y) % 30) / 100) * ((t.r * 2.3 * z) / TREE.naturalWidth);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + r * 0.1, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, p.x - (TREE.naturalWidth * s) / 2, p.y - TREE.naturalHeight * s + 3 * s, TREE.naturalWidth * s, TREE.naturalHeight * s);
  return true;
}

/** Natürlicher Baum (alle Ansichten): Stammfuß am Weltpunkt, Größe nach Radius, Laubfarbe je Jahreszeit wie beim Block-Baum. */
function drawNaturalTree(ctx, cam, t, season, img) {
  const spruce = img === TREES_NATURAL[2];
  const sea = seasonal(img, season, 'tree', 2, season === 'autumn' ? hash(t.x, t.y) % 3 : 0);
  const z = cam.zoom;
  const p = cam.worldToScreen(t.x, t.y);
  const r = t.r * z;
  const s = (0.9 + (hash(t.x, t.y) % 30) / 100) * ((t.r * 2.9 * z) / img.naturalWidth) * (spruce ? 1.15 : 1);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(p.x + r * 0.15, p.y + r * 0.1, r * 1.0, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(sea, p.x - (img.naturalWidth * s) / 2, p.y - (img.naturalHeight - TREE_FOOT) * s, img.naturalWidth * s, img.naturalHeight * s);
  return true;
}

/** Geparktes Auto: Form nach Lage, Richtung nach der Längsachse im Bild (rechts unten = A, links unten = B). false = Bild oder Farbe fehlt. */
export function drawCarSprite(ctx, cam, c) {
  const col = CAR_COLORS.indexOf(c.color);
  if (col < 0 || !ready(CARS)) return false;
  const [a, b, cc, d] = cam.isoMatrix(1);
  const sx = c.vertical ? cc : a;
  const sy = c.vertical ? d : b;
  const dir = sx * sy > 0 ? 0 : 1;
  const row = (hash(c.x, c.y) % 3) * 2 + dir;
  const p = cam.worldToScreen(c.x, c.y);
  const s = cam.zoom / CAR_CELL.ppu;
  ctx.drawImage(CARS, col * CAR_CELL.w, row * CAR_CELL.h, CAR_CELL.w, CAR_CELL.h, p.x - CAR_CELL.ax * s, p.y - CAR_CELL.ay * s, CAR_CELL.w * s, CAR_CELL.h * s);
  return true;
}

/** Fels (Hindernis mit ungeradem Radius): ein gemaltes Bild nach Radius skaliert, große Felsen mit zwei kleineren Begleitern. false = Bild fehlt. */
export function drawRockSprite(ctx, cam, o, season = 'summer') {
  const h = hash(o.x, o.y);
  const img = ROCKS[h % ROCKS.length];
  if (!ready(img)) return false;
  const z = cam.zoom;
  const draw = (x, y, r, k) => {
    const src = ROCKS[k % ROCKS.length];
    if (!ready(src)) return;
    const im = seasonal(src, season, 'ground', 2, 0);
    const p = cam.worldToScreen(x, y);
    const s = (r * 2.6 * z) / ROCK_VIEW.w;
    ctx.drawImage(im, p.x - ROCK_VIEW.ax * s, p.y - ROCK_VIEW.ay * s, ROCK_VIEW.w * s, ROCK_VIEW.h * s);
  };
  if (o.r >= 50) {
    const a = ((h >>> 3) % 628) / 100;
    draw(o.x + Math.cos(a) * o.r * 0.55, o.y + Math.sin(a) * o.r * 0.55 + o.r * 0.1, o.r * 0.5, h + 1);
    draw(o.x + Math.cos(a + 2.4) * o.r * 0.5, o.y + Math.sin(a + 2.4) * o.r * 0.5 + o.r * 0.1, o.r * 0.42, h + 2);
  }
  draw(o.x, o.y, o.r, h);
  return true;
}

/** Busch (reine Optik, blockiert nicht): Fuß am Weltpunkt, Größe nach Radius, Laubfarbe je Jahreszeit wie beim Baum. false = Bild fehlt. */
export function drawBushSprite(ctx, cam, b, season = 'summer') {
  const h = hash(b.x, b.y * 3 + 2);
  const img = BUSHES[h % BUSHES.length];
  if (!ready(img)) return false;
  const sea = seasonal(img, season, 'tree', 2, season === 'autumn' ? h % 3 : 0);
  const p = cam.worldToScreen(b.x, b.y);
  const s = (b.r * 3.4 * cam.zoom) / BUSH_VIEW.w;
  ctx.drawImage(sea, p.x - BUSH_VIEW.ax * s, p.y - BUSH_VIEW.ay * s, img.naturalWidth * s, img.naturalHeight * s);
  return true;
}

/** Einheit in Iso (gemalt, unitpaint.js): Soldaten blicken zum Ziel, Türme folgen dem Ziel. false = noch kein Bild (Ersatz im Renderer). */
export function drawUnitSprite(ctx, cam, u, p, aim = null, lift = 0, now = 0) {
  return drawUnitIso(ctx, cam, u, p, aim, lift, now);
}

/** Wrack als verkohltes Fahrzeugmodell am Boden (auch abgeschossene Hubschrauber). false = kein Modell, der Renderer zeichnet Kästen. */
export function drawWreckSprite(ctx, cam, w, p) {
  return drawWreckIso(ctx, cam, w, p);
}
