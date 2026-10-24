// Bild-Sprites für die isometrische Ansicht (freies Paket von Kenney, CC0, siehe assets/iso/README.md).
// Alles hier ist optional: fehlt ein Bild oder ist ?sprites=0 gesetzt, bleibt die gemalte Variante.
// Austausch: Dateien in assets/iso/ ersetzen oder die Listen unten anpassen.
import { ISO_K } from './camera.js';
import { spriteOverrides } from './isobuild.js';
import { BUILDING_SPRITES, MODEL_PPU } from './isodata.js';

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

// Stadtgebäude: vorgerenderte Modelle aus Kenney City Kit (Commercial = Häuser, Industrial = Hallen und Fabriken), siehe isodata.js
const MAX_H = { house: 100, hall: 100, factory: 130 }; // größte Höhe (Welt-Pixel), damit hohe Modelle nicht alles verdecken
const BUILDINGS = {};
for (const [kind, list] of Object.entries(BUILDING_SPRITES)) {
  BUILDINGS[kind] = list.map(([file, ax, ay, w, d, h]) => ({ img: load(`buildings/${file}`), ax, ay, w, d, h }));
}
const TREE = load('trees/tree.png');

// Fahrzeuge: je Modell und Team (0 = Blau, 1 = Rot) acht Bilder nach Bildschirmrichtung
const SECTORS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']; // 0° = rechts, im Uhrzeigersinn
const TEAM_COLOR = ['blue', 'red'];
const UNIT_MODEL = { truck: 'truck', engineer: 'pickup' };
const VEHICLES = {};
for (const model of new Set(Object.values(UNIT_MODEL))) {
  VEHICLES[model] = TEAM_COLOR.map((c) => SECTORS.map((s) => load(`vehicles/${model}-${c}-${s}.png`)));
}

/** Gebäude: Modell mit dem passendsten Seitenverhältnis, so skaliert, dass es das Rechteck ausfüllt. */
function drawBuildingSprite(kind) {
  return (ctx, cam, b) => {
    const list = BUILDINGS[kind];
    if (!list.every((m) => ready(m.img))) return false;
    const odd = cam.rot % 2 === 1; // das Bild ist fest für Drehung 0 gerendert: bei 90° Breite und Tiefe tauschen
    const bw = odd ? b.h : b.w;
    const bh = odd ? b.w : b.h;
    const seed = hash(b.x, b.y);
    const want = Math.log(bw / bh);
    const ranked = list.map((m, i) => ({ m, i, e: Math.abs(Math.log(m.w / m.d) - want) })).sort((p, q) => p.e - q.e || p.i - q.i);
    const m = ranked[seed % Math.min(3, ranked.length)].m;
    const f = Math.min(bw / m.w, bh / m.d, MAX_H[kind] / m.h);
    const sc = (f * cam.zoom) / MODEL_PPU;
    const p = cam.worldToScreen(b.x, b.y);
    ctx.drawImage(m.img, p.x - m.ax * sc, p.y - m.ay * sc, m.img.naturalWidth * sc, m.img.naturalHeight * sc);
    return true;
  };
}
for (const kind of Object.keys(BUILDINGS)) if (ENABLED) spriteOverrides[kind] = drawBuildingSprite(kind);

/** Baum (aufrecht, Fuß am Weltpunkt). Liefert false, wenn das Bild fehlt. */
export function drawTreeSprite(ctx, cam, t) {
  if (!ready(TREE)) return false;
  const z = cam.zoom;
  const p = cam.worldToScreen(t.x, t.y);
  const r = t.r * z;
  const s = (0.9 + (hash(t.x, t.y) % 30) / 100) * ((t.r * 2.3 * z) / TREE.naturalWidth);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + r * 0.1, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(TREE, p.x - (TREE.naturalWidth * s) / 2, p.y - TREE.naturalHeight * s + 3 * s, TREE.naturalWidth * s, TREE.naturalHeight * s);
  return true;
}

/** Fahrzeug-Sprite je Einheit (aufrecht, Blickrichtung nach Bewegungsrichtung). Liefert false, wenn es keins gibt. */
export function drawUnitSprite(ctx, cam, u, p) {
  const model = UNIT_MODEL[u.type];
  const imgs = model && VEHICLES[model][u.team];
  if (!imgs) return false;
  const [a, b, c, d] = cam.isoMatrix(1);
  const cx = Math.cos(u.angle || 0);
  const cy = Math.sin(u.angle || 0);
  const sector = (Math.round(Math.atan2(b * cx + d * cy, a * cx + c * cy) / (Math.PI / 4)) + 8) % 8;
  const img = imgs[sector];
  if (!ready(img)) return false;
  const z = cam.zoom;
  const s = (u.def.radius * 3.6 * z) / 33;
  ctx.drawImage(img, p.x - (img.naturalWidth * s) / 2, p.y - img.naturalHeight * s + 4 * s, img.naturalWidth * s, img.naturalHeight * s);
  return true;
}
