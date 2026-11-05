// Bild-Sprites für die isometrische Ansicht (freies Paket von Kenney, CC0, siehe assets/iso/README.md).
// Alles hier ist optional: fehlt ein Bild oder ist ?sprites=0 gesetzt, bleibt die gemalte Variante.
// Austausch: Dateien in assets/iso/ ersetzen oder die Listen unten anpassen.
import { spriteOverrides } from './isobuild.js';
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
// Bäume, Büsche und Felsen sind seit v5.28 gemalt (nature.js); die Bilder aus tools/gen-trees.mjs und gen-rocks.mjs sind entfernt.
// Zivile Autos (tools/gen-cars.mjs): ein Blatt, Spalte = Lackfarbe, Zeile = Form (Limousine, Kombi, Transporter) × Richtung
const CARS = load('cars/cars.png');
const CAR_COLORS = ['#b8b8b0', '#8a2f2f', '#2f4f7a', '#d0c060', '#3b3b3b', '#d8d8d8', '#4f7a4f']; // wie CAR_COLORS in js/game/map.js
const CAR_CELL = { w: 96, h: 80, ax: 48, ay: 56, ppu: 2 }; // Zellgröße, Wagenmitte am Boden, Bildpunkte je Bildschirm-Pixel

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

/** Einheit in Iso (gemalt, unitpaint.js): Soldaten blicken zum Ziel, Türme folgen dem Ziel. false = noch kein Bild (Ersatz im Renderer). */
export function drawUnitSprite(ctx, cam, u, p, aim = null, lift = 0, now = 0) {
  return drawUnitIso(ctx, cam, u, p, aim, lift, now);
}

/** Wrack als verkohltes Fahrzeugmodell am Boden (auch abgeschossene Hubschrauber). false = kein Modell, der Renderer zeichnet Kästen. */
export function drawWreckSprite(ctx, cam, w, p) {
  return drawWreckIso(ctx, cam, w, p);
}
