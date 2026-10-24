// Bild-Sprites für die isometrische Ansicht (freies Paket von Kenney, CC0, siehe assets/iso/README.md).
// Alles hier ist optional: fehlt ein Bild oder ist ?sprites=0 gesetzt, bleibt die gemalte Variante.
// Austausch: Dateien in assets/iso/ ersetzen oder die Listen unten anpassen.
import { ISO_K } from './camera.js';
import { spriteOverrides } from './isobuild.js';
import { BUILDING_SPRITES, TRAIN_SPRITES, TEAM_SPRITES, INFANTRY_SPRITES, TEAM_PPU, UNIT_PPU, MODEL_PPU } from './isodata.js';

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
const TRAIN = {};
for (const [part, list] of Object.entries(TRAIN_SPRITES)) {
  TRAIN[part] = list.map(([file, ax, ay, w, d]) => ({ img: load(`train/${file}`), ax, ay, w, d }));
}
const TEAM_IMG = {};
for (const [key, [file, ax, ay]] of Object.entries(TEAM_SPRITES)) TEAM_IMG[key] = { img: load(`team/${file}`), ax, ay };
const INF_IMG = {};
for (const [key, [file, ax, ay]] of Object.entries(INFANTRY_SPRITES)) INF_IMG[key] = { img: load(`units/${file}`), ax, ay };
const TEAM_NAME = ['blue', 'red'];
const TILE_W = 32; // Weltpixel je Kachel (1 Modelleinheit der Gebäudebilder)
const INFANTRY_UNIT = 9; // Weltpixel je Modelleinheit der Soldaten
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

/** Zugteil (Lok, Wagen): je Drehung der Ansicht ein eigenes Bild, auf die Länge des Rechtecks skaliert. */
if (ENABLED) {
  spriteOverrides.train = (ctx, cam, b) => {
    const m = TRAIN[b.part]?.[cam.rot];
    if (!ready(m?.img)) return false;
    const sc = ((b.w / Math.max(m.w, m.d)) * cam.zoom) / MODEL_PPU;
    const p = cam.worldToScreen(b.x, b.y);
    ctx.drawImage(m.img, p.x - m.ax * sc, p.y - m.ay * sc, m.img.naturalWidth * sc, m.img.naturalHeight * sc);
    return true;
  };
}

/** Eigene Gebäude: Zentrale, Mörser, Flak als Bild je Team und Drehung; Mauer und Tor nach Nachbarn ausgerichtet. */
let teamBuildings = new Map(); // "cx,cy" → Gebäude (Mauer/Tor), vom Renderer je Bild gesetzt
export function setTeamBuildings(list) {
  teamBuildings = new Map();
  for (const b of list) if (b.alive && (b.type === 'wall' || b.type === 'gate')) teamBuildings.set(`${b.cx},${b.cy}`, b);
}
function drawTeamImage(ctx, cam, key, x, y) {
  const m = TEAM_IMG[key];
  if (!ready(m?.img)) return false;
  const sc = (TILE_W * cam.zoom) / TEAM_PPU;
  const p = cam.worldToScreen(x, y);
  ctx.drawImage(m.img, p.x - m.ax * sc, p.y - m.ay * sc, m.img.naturalWidth * sc, m.img.naturalHeight * sc);
  return true;
}
if (ENABLED) {
  for (const type of ['fob', 'mortar', 'aa']) {
    spriteOverrides[type] = (ctx, cam, b) => b.team < 2 && drawTeamImage(ctx, cam, `${type}-${TEAM_NAME[b.team]}-r${cam.rot}`, b.x, b.y);
  }
  const wallPiece = (kind) => (ctx, cam, b) => {
    const has = (dx, dy) => teamBuildings.has(`${b.cx + dx},${b.cy + dy}`);
    const alongX = has(-1, 0) || has(1, 0);
    const alongY = has(0, -1) || has(0, 1);
    const main = kind === 'gate' ? (alongY && !alongX ? 'y' : 'x') : alongX || !alongY ? 'x' : 'y';
    const ok = drawTeamImage(ctx, cam, `${kind}-${main}-r${cam.rot}`, b.x, b.y);
    if (ok && kind === 'wall' && alongX && alongY) drawTeamImage(ctx, cam, `wall-y-r${cam.rot}`, b.x, b.y);
    return ok;
  };
  spriteOverrides.wall = wallPiece('wall');
  spriteOverrides.gate = wallPiece('gate');
}

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

const INFANTRY_NAME = { rifleman: 'rifleman', at: 'at' };
/** Bildschirmrichtung einer Weltrichtung als Sektor 0–7 (0 = rechts, im Uhrzeigersinn). */
function headingSector(cam, angle) {
  const [a, b, c, d] = cam.isoMatrix(1);
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  return (Math.round(Math.atan2(b * cx + d * cy, a * cx + c * cy) / (Math.PI / 4)) + 8) % 8;
}
function drawInfantry(ctx, cam, u, p, type, aim) {
  const m = INF_IMG[`${type}-${TEAM_NAME[u.team]}-${SECTORS[headingSector(cam, aim ?? u.angle ?? 0)]}`];
  if (!ready(m?.img)) return false;
  const sc = (INFANTRY_UNIT * cam.zoom) / UNIT_PPU;
  ctx.drawImage(m.img, p.x - m.ax * sc, p.y - m.ay * sc, m.img.naturalWidth * sc, m.img.naturalHeight * sc);
  return true;
}

/** Fahrzeug-Sprite je Einheit (aufrecht, Blickrichtung nach Bewegungsrichtung). Liefert false, wenn es keins gibt. */
export function drawUnitSprite(ctx, cam, u, p, aim = null) {
  const inf = INFANTRY_NAME[u.type];
  if (inf && u.team < 2) return drawInfantry(ctx, cam, u, p, inf, aim);
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
