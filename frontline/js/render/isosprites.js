// Bild-Sprites für die isometrische Ansicht (freies Paket von Kenney, CC0, siehe assets/iso/README.md).
// Alles hier ist optional: fehlt ein Bild oder ist ?sprites=0 gesetzt, bleibt die gemalte Variante.
// Austausch: Dateien in assets/iso/ ersetzen oder die Listen unten anpassen.
import { ISO_K } from './camera.js';
import { spriteOverrides } from './isobuild.js';
import { seasonal } from './season.js';
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
// Wachturm (eigenes Modell, assets/iso/README.md): je Drehung der Ansicht ein Bild, 1 Modelleinheit = 1 Kachel
const TOWER = [0, 1, 2, 3].map((r) => load(`buildings/tower-r${r}.png`));
const TOWER_VIEW = { ax: 119, ay: 222, ppu: 64, footprint: 78.4 }; // Bodenmitte im Bild, Pixel je Modelleinheit, Kabinenbreite in Welt-Pixeln
const TEAM_IMG = {};
for (const [key, [file, ax, ay]] of Object.entries(TEAM_SPRITES)) TEAM_IMG[key] = { img: load(`team/${file}`), ax, ay };
const INF_IMG = {};
for (const [key, [file, ax, ay]] of Object.entries(INFANTRY_SPRITES)) INF_IMG[key] = { img: load(`units/${file}`), ax, ay };
const TEAM_NAME = ['blue', 'red'];
const TILE_W = 32; // Weltpixel je Kachel (1 Modelleinheit der Gebäudebilder)
const INFANTRY_UNIT = 9; // Weltpixel je Modelleinheit der Soldaten
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

// Fahrzeuge: je Modell und Team (0 = Blau, 1 = Rot) acht Bilder nach Bildschirmrichtung
const SECTORS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']; // 0° = rechts, im Uhrzeigersinn
const TEAM_COLOR = ['blue', 'red'];
const UNIT_MODEL = { truck: 'truck', engineer: 'pickup', tank: 'tank', gunship: 'apache', littlebird: 'littlebird', ifv: 'ifv' };
// 3D-Modelle (T-12-Panzer, Attack Chopper), siehe assets/iso/README.md: span = Bildbreite in Einheitenradien, ax/ay = Bodenpunkt im Bild
const MODEL_VIEW = { tank: { span: 6.5, ax: 72, ay: 82 }, apache: { span: 5, ax: 64, ay: 47 }, littlebird: { span: 5, ax: 64, ay: 55 }, ifv: { span: 5.6, ax: 72, ay: 82 } };
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

const INFANTRY_NAME = { rifleman: 'rifleman', at: 'at', sniper: 'sniper', commander: 'rifleman' }; // Kommandeur: Schützen-Bild, Stern vom Renderer
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
export function drawUnitSprite(ctx, cam, u, p, aim = null, lift = 0) {
  const inf = INFANTRY_NAME[u.type];
  if (inf && u.team < 2) return drawInfantry(ctx, cam, u, p, inf, aim);
  return drawModel(ctx, cam, u.type, u.team, u.angle, u.def.radius, p, lift);
}

/** Fahrzeugmodell in der Blickrichtung `angle`; look(img) kann das Bild ersetzen (Wrack). false = Modell fehlt oder lädt noch. */
function drawModel(ctx, cam, type, team, angle, radius, p, lift, look = null) {
  const model = UNIT_MODEL[type];
  const imgs = model && VEHICLES[model][team];
  if (!imgs) return false;
  const [a, b, c, d] = cam.isoMatrix(1);
  const cx = Math.cos(angle || 0);
  const cy = Math.sin(angle || 0);
  const sector = (Math.round(Math.atan2(b * cx + d * cy, a * cx + c * cy) / (Math.PI / 4)) + 8) % 8;
  const img = imgs[sector];
  if (!ready(img)) return false;
  const src = look ? look(img) : img;
  if (!src) return false;
  const z = cam.zoom;
  const view = MODEL_VIEW[model];
  if (view) {
    const k = (radius * view.span * z) / img.naturalWidth;
    ctx.drawImage(src, p.x - view.ax * k, p.y - lift * z - view.ay * k, img.naturalWidth * k, img.naturalHeight * k);
    return true;
  }
  const s = (radius * 3.6 * z) / 33;
  ctx.drawImage(src, p.x - (img.naturalWidth * s) / 2, p.y - img.naturalHeight * s + 4 * s, img.naturalWidth * s, img.naturalHeight * s);
  return true;
}

const CHARRED = new Map(); // Modellbild → verkohlte Kopie (Wracks), einmal je Bild erzeugt

function charred(img) {
  let c = CHARRED.get(img);
  if (c !== undefined) return c;
  c = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-atop'; // nur das Modell einfärben, nicht den Hintergrund
    x.fillStyle = 'rgba(30,26,22,0.8)';
    x.fillRect(0, 0, c.width, c.height);
  }
  CHARRED.set(img, c);
  return c;
}

/** Wrack als verkohltes Fahrzeugmodell am Boden (auch abgeschossene Hubschrauber). false = kein Modell, der Renderer zeichnet Kästen. */
export function drawWreckSprite(ctx, cam, w, p) {
  return drawModel(ctx, cam, w.type, 0, w.angle, w.r, p, 0, charred);
}
