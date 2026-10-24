// Bild-Sprites für die isometrische Ansicht (freies Paket von Kenney, CC0, siehe assets/iso/README.md).
// Alles hier ist optional: fehlt ein Bild oder ist ?sprites=0 gesetzt, bleibt die gemalte Variante.
// Austausch: Dateien in assets/iso/ ersetzen oder die Listen unten anpassen.
import { ISO_K } from './camera.js';
import { spriteOverrides } from './isobuild.js';

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

// Stadtgebäude: Kenney „Isometric Buildings“ (je ein Quadrat von 132 px Breite mit Sockel)
const BUILDING_IDS = {
  house: ['002', '003', '009', '010', '014', '018', '021', '029', '033', '034', '040', '041'],
  hall: ['004', '012', '017', '020', '026', '093', '101', '108', '109', '116', '117', '123', '124', '125'],
  factory: ['011', '019', '027', '035', '046', '025', '028'],
};
const BUILDINGS = {};
for (const [kind, ids] of Object.entries(BUILDING_IDS)) BUILDINGS[kind] = ids.map((n) => load(`buildings/b${n}.png`));
const TREE = load('trees/tree.png');

// Fahrzeuge: je Modell und Team (0 = Blau, 1 = Rot) acht Bilder nach Bildschirmrichtung
const SECTORS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']; // 0° = rechts, im Uhrzeigersinn
const TEAM_COLOR = ['blue', 'red'];
const UNIT_MODEL = { truck: 'truck', engineer: 'pickup' };
const VEHICLES = {};
for (const model of new Set(Object.values(UNIT_MODEL))) {
  VEHICLES[model] = TEAM_COLOR.map((c) => SECTORS.map((s) => load(`vehicles/${model}-${c}-${s}.png`)));
}

const TILE_W = 132; // Breite der Gebäudebilder
const SLAB_BELOW = 68; // Abstand Bildunterkante → Mitte der Sockeloberfläche

/** Gebäude als Reihe von Kenney-Quadraten entlang der langen Seite (Halle 290×100 → drei Stück). */
function drawBuildingSprite(kind) {
  return (ctx, cam, b) => {
    const list = BUILDINGS[kind];
    if (!list.every(ready)) return false;
    const wide = b.w >= b.h;
    const long = wide ? b.w : b.h;
    const short = wide ? b.h : b.w;
    const n = Math.max(1, Math.round(long / short));
    const step = long / n;
    const side = (step + short) / 2;
    const sc = (2 * ISO_K * side * cam.zoom) / TILE_W;
    const seed = hash(b.x, b.y);
    const cells = [];
    for (let i = 0; i < n; i++) {
      const off = -long / 2 + step * (i + 0.5);
      const x = wide ? b.x + off : b.x;
      const y = wide ? b.y : b.y + off;
      cells.push({ x, y, k: cam.depth(x, y), img: list[(seed + i * 7) % list.length] });
    }
    cells.sort((p, q) => p.k - q.k);
    for (const c of cells) {
      const p = cam.worldToScreen(c.x, c.y);
      ctx.drawImage(c.img, p.x - (c.img.naturalWidth * sc) / 2, p.y - (c.img.naturalHeight - SLAB_BELOW) * sc, c.img.naturalWidth * sc, c.img.naturalHeight * sc);
    }
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
