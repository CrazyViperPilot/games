// Karteneditor (editor.html): alle Kartenelemente frei platzieren, ohne Spiegelung. Zeichnet mit denselben Funktionen wie das Spiel,
// 2D selbst, isometrisch über den Spiel-Renderer mit einem leeren Hilfsspiel (nur Karte).
// URL: ?new=1 (leere Karte) · ?map=ID (gespeicherte Karte) · ?seed=N (Zufallskarte als Ausgangspunkt)
import { BALANCE } from '../data/balance.js';
import { makeRng } from '../core/rng.js';
import { generateMap } from '../game/map.js';
import { drawMapObjects, invalidateTerrain, roadJunctions } from '../render/terrain.js';
import { Camera } from '../render/camera.js';
import { Renderer } from '../render/renderer.js';
import { setIsoGround, TOWN_H } from '../render/iso.js';
import { ISO_K } from '../render/camera.js';
import { Game } from '../game/game.js';
import { createEmptyMap, normalizeMap, checkMap, accessRoutes, describeMap, loadMap, saveMap, MAX_CRATES, MAX_FIELDS, FIELD_CROPS } from '../game/mapdata.js';
import { drawCrate } from '../render/sprites.js';
import { Relief, RELIEF, COARSE_N, reliefOf, setRelief } from '../game/relief.js';
import { reliefTiles, updateReliefTiles, drawReliefTiles } from '../render/reliefimg.js';

const W = BALANCE.map.width;
const H = BALANCE.map.height;
const ZOOM_MAX = 2;
const SNAP = 8;
const HISTORY_MAX = 60;
const SEL_KEY = 'frontline-kartenwahl';
const CAR_COLORS = ['#b8b8b0', '#8a2f2f', '#2f4f7a', '#d0c060', '#3b3b3b', '#d8d8d8', '#4f7a4f'];

// Werkzeuge: id, Name, Gruppe, Symbol, Hinweis. Platzieren erzeugt ein Objekt, 'line' zieht von A nach B.
const TOOLS = [
  ['hand', 'Hand', 'Ansicht', '✋', 'Ziehen verschiebt die Karte'],
  ['select', 'Wählen', 'Ansicht', '↖', 'Tippen wählt, Ziehen verschiebt das gewählte Objekt'],
  ['erase', 'Löschen', 'Ansicht', '✕', 'Objekt antippen, um es zu löschen'],
  ['house', 'Haus', 'Gebäude', '⌂', 'Tippen setzt ein Haus'],
  ['factory', 'Fabrik', 'Gebäude', '▣', 'Tippen setzt eine Fabrik mit Schornstein'],
  ['hall', 'Halle', 'Gebäude', '▭', 'Tippen setzt eine Halle'],
  ['tower', 'Wachturm', 'Gebäude', '⍋', 'Tippen setzt einen Wachturm auf Stahlgerüst (blockiert)'],
  ['loco', 'Lok', 'Zug', '◧', 'Tippen auf ein Gleis setzt eine Lok in Gleisrichtung (blockiert wie ein Gebäude)'],
  ['container', 'Waggon', 'Zug', '◨', 'Tippen auf ein Gleis setzt einen Waggon, neben einem Zugteil schließt er an'],
  ['tank', 'Kesselwagen', 'Zug', '◩', 'Tippen setzt einen Kesselwagen'],
  ['platform', 'Bahnsteig', 'Zug', '▱', 'Tippen neben ein Gleis setzt einen Bahnsteig parallel zum Gleis (begehbar, mit Dach)'],
  ['station', 'Bahnhof', 'Zug', '▦', 'Tippen neben ein gerades Gleis setzt das Bahnhofsgebäude passend zum Gleis'],
  ['rail', 'Gleis', 'Zug', '═', 'Von Start- zu Endpunkt ziehen; Gleise rasten aneinander ein, Kreuzungen und Weichen entstehen von selbst'],
  ['road', 'Straße', 'Wege', '▬', 'Von Start- zu Endpunkt ziehen'],
  ['dirt', 'Feldweg', 'Wege', '┅', 'Von Start- zu Endpunkt ziehen'],
  ['park', 'Park', 'Natur', '◌', 'Tippen setzt eine Grünfläche (nur Dekoration)'],
  ['field', 'Feld', 'Natur', '▤', 'Tippen setzt einen Acker; rechts Frucht oder Weide wählen, Größe und Drehung ändern (nur Boden, blockiert nichts)'],
  ['tree', 'Baum', 'Natur', '♣', 'Tippen setzt einen Baum, Ziehen malt eine Baumreihe (Bäume blockieren)'],
  ['forest', 'Wald', 'Natur', '♠', 'Tippen setzt einen Wald (blockiert)'],
  ['rock', 'Fels', 'Natur', '●', 'Tippen setzt einen Felsen (blockiert)'],
  ['car', 'Auto', 'Natur', '▰', 'Tippen setzt ein geparktes Auto (Dekoration)'],
  ['raise', 'Heben', 'Gelände', '▲', 'Gedrückt halten oder ziehen hebt das Gelände (Pinsel rechts einstellen)'],
  ['lower', 'Senken', 'Gelände', '▼', 'Gedrückt halten oder ziehen senkt das Gelände, unter dem Wasserspiegel entsteht ein See'],
  ['smooth', 'Glätten', 'Gelände', '∿', 'Ziehen glättet Kanten und steile Hänge'],
  ['flatten', 'Ebnen', 'Gelände', '—', 'Ziehen ebnet auf die Höhe am Startpunkt ein, etwa für einen Weg über einen Hügel'],
  ['spawn0', 'Start Blau', 'Spiel', '①', 'Tippen setzt den Startpunkt von Blau (Haupt-FOB)'],
  ['spawn1', 'Start Rot', 'Spiel', '②', 'Tippen setzt den Startpunkt von Rot (Haupt-FOB)'],
  ['zone', 'Zone', 'Spiel', '◎', 'Tippen setzt die Mitte der Konfliktzone'],
  ['crate', 'Kiste', 'Spiel', '⊠', `Tippen setzt eine Versorgungskiste (Soldaten bringen sie zur FOB, +1 Geld/s; höchstens ${MAX_CRATES}). Für eine faire Karte gleich weit von beiden Starts setzen`],
];
const BUILD_DEF = {
  house: { w: 90, h: 70, kind: 'house' },
  factory: { w: 260, h: 170, kind: 'factory' },
  hall: { w: 290, h: 100, kind: 'hall' },
  tower: { w: 80, h: 80, kind: 'tower' },
  loco: { w: 96, h: 46, kind: 'train', part: 'loco' },
  container: { w: 96, h: 46, kind: 'train', part: 'container' },
  tank: { w: 96, h: 46, kind: 'train', part: 'tank' },
  platform: { w: 300, h: 30, kind: 'platform' },
  station: { w: 280, h: 110, kind: 'station' },
};

// Geländepinsel: Radius (px) und Stärke; Heben/Senken in Höhe je Sekunde in der Pinselmitte
const TERRAIN_TOOLS = new Set(['raise', 'lower', 'smooth', 'flatten']);
const BRUSH_SIZES = [128, 192, 256, 384, 512, 768];
const BRUSH_POWER = [
  ['sanft', 0.45],
  ['mittel', 1],
  ['stark', 2],
];
const RAISE_RATE = 150;
const H_MAX = RELIEF.min + 255 * RELIEF.q;

const $ = (s) => document.querySelector(s);
const canvas = $('#edview');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);

const st = {
  map: null,
  id: null, // ID der gespeicherten Karte
  tool: 'select',
  sel: null, // {k: Art, o: Objekt}
  cam: new Camera(W, H),
  renderer: null,
  groundDirty: false, // Boden der isometrischen Ansicht neu backen (nach Änderungen an Straßen, Parks, Bahn)
  hist: [],
  redo: [],
  dirty: false,
  needDraw: true,
  pointer: null, // Weltposition des Zeigers
  gesture: null, // laufende Einzelgeste
  touches: new Map(),
  pinch: null,
  carVertical: false,
  fieldCrop: 'wheat', // Frucht für das nächste neue Feld (wheat, green, soil, rape oder pasture)
  brush: { size: 2, power: 1 }, // Indizes in BRUSH_SIZES und BRUSH_POWER
  reliefImg: null, // { relief, canvas }: Geländebild der 2D-Ansicht
};

// ---- Kleinkram -------------------------------------------------------------------

const snap = (v) => Math.round(v / SNAP) * SNAP;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dpr = () => window.devicePixelRatio || 1;

function resize() {
  const cam = st.cam;
  if (st.renderer) st.renderer.resize();
  else cam.resize(window.innerWidth, window.innerHeight);
  cam.zoomMin = minZoom();
  cam.zoomMax = ZOOM_MAX;
  cam.zoom = clamp(cam.zoom, cam.zoomMin, cam.zoomMax);
  cam.clamp();
  st.needDraw = true;
}

function minZoom() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (st.cam.iso) return Math.min(vw / (2 * W * ISO_K * 1.05), vh / (W * ISO_K * 1.05));
  return Math.min(vw / (W * 1.05), vh / (H * 1.05));
}

const toWorld = (sx, sy) => st.cam.screenToWorld(sx, sy);

function zoomAt(f, sx, sy) {
  st.cam.zoomAt(f, sx, sy);
  st.needDraw = true;
}

function panBy(dx, dy) {
  st.cam.pan(dx, dy);
  st.needDraw = true;
}

function fit() {
  const cam = st.cam;
  cam.zoomMin = minZoom();
  cam.zoom = cam.zoomMin;
  cam.centerOn(W / 2, H / 2);
  st.needDraw = true;
}

function toggleView() {
  const cam = st.cam;
  const c = toWorld(window.innerWidth / 2, window.innerHeight / 2);
  cam.iso = !cam.iso;
  cam.zoomMin = minZoom();
  cam.zoom = clamp(cam.zoom, cam.zoomMin, cam.zoomMax);
  cam.centerOn(c.x, c.y);
  st.groundDirty = true;
  syncButtons();
  st.needDraw = true;
}

function rotateView(dir) {
  if (!st.cam.iso) return;
  st.cam.rotate(dir);
  st.needDraw = true;
}

function say(text, bad = false) {
  const el = $('[data-msg]');
  el.textContent = text;
  el.classList.toggle('bad', bad);
}

// ---- Verlauf ---------------------------------------------------------------------

const snapshot = () => JSON.stringify(st.map);

function pushHistory() {
  st.hist.push(snapshot());
  if (st.hist.length > HISTORY_MAX) st.hist.shift();
  st.redo = [];
  st.dirty = true;
  st.groundDirty = true;
  syncButtons();
}

function restore(json) {
  st.map = normalizeMap(JSON.parse(json));
  st.sel = null;
  st.dirty = true;
  st.groundDirty = true;
  st.needDraw = true;
  showInspector();
  syncButtons();
}

function undo() {
  if (!st.hist.length) return;
  st.redo.push(snapshot());
  restore(st.hist.pop());
}

function redo() {
  if (!st.redo.length) return;
  st.hist.push(snapshot());
  restore(st.redo.pop());
}

function syncButtons() {
  $('[data-act=undo]').disabled = !st.hist.length;
  $('[data-act=redo]').disabled = !st.redo.length;
  $('[data-act=view]').textContent = st.cam.iso ? 'Iso' : '2D';
  document.querySelectorAll('[data-rot]').forEach((b) => (b.hidden = !st.cam.iso));
}

// ---- Objekte ---------------------------------------------------------------------

function listOf(k) {
  const m = st.map;
  switch (k) {
    case 'building': return m.town.buildings;
    case 'road': return m.town.roads;
    case 'rail': return m.town.rails;
    case 'park': return m.town.parks;
    case 'field': return m.town.fields;
    case 'car': return m.town.cars;
    case 'tree': return m.trees;
    case 'townTree': return m.town.trees;
    case 'obstacle': return m.obstacles;
    case 'crate': return m.crates;
    default: return null;
  }
}

function distToSeg(px, py, r) {
  const dx = r.x2 - r.x1;
  const dy = r.y2 - r.y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - r.x1) * dx + (py - r.y1) * dy) / l2, 0, 1);
  return Math.hypot(px - (r.x1 + t * dx), py - (r.y1 + t * dy));
}

/** Oberstes Objekt unter dem Weltpunkt oder null: Startpunkte und Zone zuerst, dann Gebäude, Bäume, Hindernisse, Parks, Straßen, Bahn. */
function pickAt(wx, wy, sx = null, sy = null) {
  const tol = 14 / st.cam.zoom;
  const m = st.map;
  for (let i = 0; i < 2; i++) {
    if (Math.hypot(m.spawns[i].x - wx, m.spawns[i].y - wy) < 70 + tol) return { k: 'spawn', i, o: m.spawns[i] };
  }
  for (let i = m.crates.length - 1; i >= 0; i--) {
    if (Math.hypot(m.crates[i].x - wx, m.crates[i].y - wy) < 18 + tol) return { k: 'crate', o: m.crates[i] };
  }
  const circ = (k, list, grow = 0) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (Math.hypot(o.x - wx, o.y - wy) <= o.r + tol + grow) return { k, o };
    }
    return null;
  };
  for (let i = m.town.cars.length - 1; i >= 0; i--) {
    const c = m.town.cars[i];
    const hw = (c.vertical ? 9 : 18) + tol;
    const hh = (c.vertical ? 18 : 9) + tol;
    if (Math.abs(c.x - wx) <= hw && Math.abs(c.y - wy) <= hh) return { k: 'car', o: c };
  }
  for (let i = m.town.buildings.length - 1; i >= 0; i--) {
    const b = m.town.buildings[i];
    const inside = (px, py, pad) => {
      const c = Math.cos(b.angle || 0);
      const sn = Math.sin(b.angle || 0);
      const lx = (px - b.x) * c + (py - b.y) * sn;
      const ly = -(px - b.x) * sn + (py - b.y) * c;
      return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad;
    };
    if (inside(wx, wy, tol * 0.4)) return { k: 'building', o: b };
    if (st.cam.iso && sx !== null) {
      // Isometrisch: ein Klick aufs Dach liegt auf dem Boden hinter dem Fußabdruck
      const roof = st.cam.screenToWorld(sx, sy + (b.kind === 'train' ? 30 : TOWN_H[b.kind] ?? 40) * st.cam.zoom);
      if (inside(roof.x, roof.y, 0)) return { k: 'building', o: b };
    }
  }
  const hit = circ('tree', m.trees) || circ('townTree', m.town.trees) || circ('obstacle', m.obstacles);
  if (hit) return hit;
  const pk = circ('park', m.town.parks);
  for (let i = m.town.rails.length - 1; i >= 0; i--) {
    if (distToSeg(wx, wy, m.town.rails[i]) <= 20 + tol) return { k: 'rail', o: m.town.rails[i] };
  }
  const road = (() => {
    for (let i = m.town.roads.length - 1; i >= 0; i--) {
      const r = m.town.roads[i];
      if (distToSeg(wx, wy, r) <= r.w / 2 + tol) return { k: 'road', o: r };
    }
    return null;
  })();
  if (road) return road;
  if (pk) return pk;
  for (let i = m.town.fields.length - 1; i >= 0; i--) {
    const f = m.town.fields[i];
    const c = Math.cos(f.angle || 0);
    const sn = Math.sin(f.angle || 0);
    const lx = (wx - f.x) * c + (wy - f.y) * sn;
    const ly = -(wx - f.x) * sn + (wy - f.y) * c;
    if (Math.abs(lx) <= f.w / 2 + tol * 0.4 && Math.abs(ly) <= f.h / 2 + tol * 0.4) return { k: 'field', o: f };
  }
  if (Math.hypot(m.zone.x - wx, m.zone.y - wy) <= 90 + tol) return { k: 'zone', o: m.zone };
  return null;
}

function removeSel(sel) {
  if (!sel) return false;
  if (sel.k === 'spawn' || sel.k === 'zone') return false;
  else {
    const list = listOf(sel.k);
    const i = list.indexOf(sel.o);
    if (i < 0) return false;
    list.splice(i, 1);
  }
  return true;
}

/** Neues Objekt je Werkzeug an Weltposition. Liefert die Auswahl-Beschreibung. */
function place(tool, x, y) {
  const m = st.map;
  const px = clamp(snap(x), 0, W);
  const py = clamp(snap(y), 0, H);
  if (BUILD_DEF[tool]) {
    const o = { x: px, y: py, ...BUILD_DEF[tool] };
    placeAlongRail(o, tool, x, y);
    m.town.buildings.push(o);
    return { k: 'building', o };
  }
  switch (tool) {
    case 'park': {
      const o = { x: px, y: py, r: 150 };
      m.town.parks.push(o);
      return { k: 'park', o };
    }
    case 'field': {
      if (m.town.fields.length >= MAX_FIELDS) {
        say(`Höchstens ${MAX_FIELDS} Felder je Karte`, true);
        return null;
      }
      const o = { x: px, y: py, w: 300, h: 220, kind: 'field', crop: st.fieldCrop };
      if (o.crop === 'pasture') {
        o.kind = 'pasture';
        delete o.crop;
      }
      m.town.fields.push(o);
      return { k: 'field', o };
    }
    case 'tree': {
      const o = { x: Math.round(x), y: Math.round(y), r: 12 + Math.floor(Math.random() * 9) };
      m.trees.push(o);
      return { k: 'tree', o };
    }
    case 'forest': {
      const o = { x: px, y: py, r: 120 };
      m.obstacles.push(o);
      return { k: 'obstacle', o };
    }
    case 'rock': {
      const o = { x: px, y: py, r: 91 };
      m.obstacles.push(o);
      return { k: 'obstacle', o };
    }
    case 'car': {
      const o = { x: px, y: py, vertical: st.carVertical, color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] };
      m.town.cars.push(o);
      return { k: 'car', o };
    }
    case 'spawn0':
    case 'spawn1': {
      const i = tool === 'spawn0' ? 0 : 1;
      m.spawns[i].x = px;
      m.spawns[i].y = py;
      return { k: 'spawn', i, o: m.spawns[i] };
    }
    case 'zone':
      m.zone.x = px;
      m.zone.y = py;
      return { k: 'zone', o: m.zone };
    case 'crate': {
      if (m.crates.length >= MAX_CRATES) {
        say(`Höchstens ${MAX_CRATES} Versorgungskisten je Karte`, true);
        return null;
      }
      const o = { x: px, y: py };
      m.crates.push(o);
      return { k: 'crate', o };
    }
    default:
      return null;
  }
}

/** Nächstes Gleis zum Weltpunkt: {q: Fußpunkt, a: Richtung (-π/2..π/2], side: +1/-1 Seite des Punktes, dist} oder null. */
function nearestRail(x, y, maxDist) {
  let best = null;
  for (const r of st.map.town.rails) {
    const dx = r.x2 - r.x1;
    const dy = r.y2 - r.y1;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1) continue;
    const t = clamp(((x - r.x1) * dx + (y - r.y1) * dy) / l2, 0, 1);
    const q = { x: r.x1 + t * dx, y: r.y1 + t * dy };
    const d = Math.hypot(q.x - x, q.y - y);
    if (d > maxDist || (best && d >= best.dist)) continue;
    let a = Math.atan2(dy, dx);
    if (a > Math.PI / 2) a -= Math.PI;
    else if (a <= -Math.PI / 2) a += Math.PI;
    const side = (x - q.x) * -Math.sin(a) + (y - q.y) * Math.cos(a) >= 0 ? 1 : -1;
    best = { q, a, side, dist: d };
  }
  return best;
}

/** Zugteile, Bahnsteige und Bahnhof richten sich nach dem nächsten Gleis aus. */
function placeAlongRail(o, tool, x, y) {
  const lim = o.kind === 'train' ? 70 : o.kind === 'platform' ? 150 : 280;
  const r = nearestRail(x, y, lim);
  if (!r) return;
  const nx = -Math.sin(r.a);
  const ny = Math.cos(r.a);
  if (o.kind === 'train') {
    o.x = r.q.x;
    o.y = r.q.y;
    if (Math.abs(r.a) > 1e-3) o.angle = r.a;
    // an ein nahes Zugteil anschließen
    const ux = Math.cos(r.a);
    const uy = Math.sin(r.a);
    for (const b of st.map.town.buildings) {
      if (b.kind !== 'train' || b === o) continue;
      const along = (x - b.x) * ux + (y - b.y) * uy;
      const across = (x - b.x) * nx + (y - b.y) * ny;
      if (Math.abs(across) < 60 && Math.abs(along) < 160) {
        const gap = (b.w + o.w) / 2 + 4;
        o.x = b.x + ux * gap * (along >= 0 ? 1 : -1);
        o.y = b.y + uy * gap * (along >= 0 ? 1 : -1);
        break;
      }
    }
  } else if (o.kind === 'platform') {
    const off = 20 + o.h / 2 + 4;
    o.x = r.q.x + nx * off * r.side;
    o.y = r.q.y + ny * off * r.side;
    if (Math.abs(r.a) > 1e-3) o.angle = r.a;
  } else if (o.kind === 'station') {
    const horizontal = Math.abs(r.a) < 0.25;
    const vertical = Math.abs(Math.abs(r.a) - Math.PI / 2) < 0.25;
    if (!horizontal && !vertical) return;
    const off = 20 + 30 + 4 + 8 + o.h / 2; // Gleisbett, Bahnsteig, Abstand, halbe Tiefe
    if (vertical) [o.w, o.h] = [o.h, o.w];
    o.x = r.q.x + nx * off * r.side;
    o.y = r.q.y + ny * off * r.side;
  }
}

function moveObj(sel, dx, dy) {
  const o = sel.o;
  if (sel.k === 'road' || sel.k === 'rail') {
    o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy;
  } else {
    o.x = clamp(o.x + dx, 0, W);
    o.y = clamp(o.y + dy, 0, H);
  }
}

// ---- Zeichnen --------------------------------------------------------------------

/** Hilfsspiel nur mit Karte: der Spiel-Renderer zeichnet damit die isometrische Ansicht (ohne Einheiten und Gebäude des Spiels). */
function makeRenderer() {
  const game = new Game({ seed: 1, map: st.map });
  game.units.length = 0;
  game.buildings.length = 0;
  game.crates = []; // Kisten zeichnet der Editor selbst (sie ändern sich beim Bearbeiten)
  game.entities.clear();
  const r = new Renderer(canvas, game, st.cam, 0);
  r.revealAll = true;
  return r;
}

function syncGhost() {
  const r = st.renderer;
  const g = r.game;
  const m = st.map;
  if (g.map !== m) {
    g.map = m;
    st.groundDirty = true;
  }
  g.zone.x = m.zone.x;
  g.zone.y = m.zone.y;
  g.zone.r = m.zone.r;
  g.hot.x = g.hot.y = -1e6; // Hot Zone gibt es erst im Spiel
  r.deco = null;
  // Boden (Straßen, Parks, Bahn, Hindernisse) neu backen, aber nicht während des Ziehens
  if (st.groundDirty && !st.gesture) {
    invalidateTerrain(m);
    r.terrainIso = null;
    r.terrainGL = null;
    r.terrain = null;
    st.groundDirty = false;
  }
}

function draw() {
  st.needDraw = false;
  const cam = st.cam;
  const m = st.map;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const z = cam.zoom;
  const iso = cam.iso;
  const d = st.renderer.dpr;
  if (iso) {
    syncGhost();
    st.renderer.render({});
  } else {
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#2a2f27';
    ctx.fillRect(0, 0, vw, vh);
    ctx.save();
    ctx.translate(vw / 2 - cam.x * z, vh / 2 - cam.y * z);
    ctx.fillStyle = '#56603f';
    ctx.fillRect(0, 0, W * z, H * z);
    // Gelände wie im Spiel: Fels, Ufer und Seen unter Straßen und Stadt, die Schummerung über alles
    const tiles = reliefImage();
    const relief2d = (layer) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      drawReliefTiles(ctx, tiles, layer, d * (vw / 2 - cam.x * z), d * (vh / 2 - cam.y * z), d * z, vw * d, vh * d);
      ctx.setTransform(d, 0, 0, d, d * (vw / 2 - cam.x * z), d * (vh / 2 - cam.y * z));
    };
    if (tiles) relief2d('mat');
    drawMapObjects(ctx, m, z, false, makeRng(77));
    if (tiles) {
      ctx.globalCompositeOperation = 'soft-light';
      relief2d('shade');
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
  // Überlagerungen in Weltkoordinaten (2D: Zoom, Iso: Bodenebene), Linienstärken in Bildschirm-Pixeln
  // ax, ay: Bodenpunkt, auf dessen Geländehöhe die Zeichnung liegt (isometrisch mit Gelände)
  const world = (ax = null, ay = null) => {
    if (iso) {
      if (ax !== null) cam.pinAt(ax, ay);
      setIsoGround(ctx, cam, d);
      cam.unpin();
    } else ctx.setTransform(d * z, 0, 0, d * z, d * (vw / 2 - cam.x * z), d * (vh / 2 - cam.y * z));
  };
  const px = 1 / z;
  world();
  // Raster alle 512 px und Kartenrand
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = px;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 512) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += 512) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 2 * px;
  ctx.strokeRect(0, 0, W, H);
  // Konfliktzone und Startpunkte mit Bauradius der Haupt-FOB (Kreise liegen auf dem Gelände)
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  groundCircle(m.zone.x, m.zone.y, m.zone.r);
  ctx.stroke();
  ctx.setLineDash([]);
  m.spawns.forEach((sp, i) => {
    ctx.strokeStyle = BALANCE.teamColors[i];
    groundCircle(sp.x, sp.y, BALANCE.fob.buildRadius);
    ctx.stroke();
  });
  world(m.zone.x, m.zone.y);
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.arc(m.zone.x, m.zone.y, 5 * px, 0, Math.PI * 2);
  ctx.fill();
  m.spawns.forEach((sp, i) => {
    world(sp.x, sp.y);
    ctx.fillStyle = BALANCE.teamColors[i];
    const r = Math.max(7 * px, 40);
    ctx.fillRect(sp.x - r, sp.y - r, r * 2, r * 2);
  });
  for (const c of m.crates) {
    world(c.x, c.y);
    drawCrate(ctx, c.x, c.y, Math.max(12 * px, 18), z, 1);
  }
  if (st.sel) {
    const o = st.sel.o;
    if (o.x1 !== undefined) world((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2);
    else world(o.x, o.y);
    drawSelection(st.sel, px);
  }
  // Vorschau eines Linien-Ziehens
  const g = st.gesture;
  if (g && g.type === 'line') {
    world((g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2);
    ctx.strokeStyle = g.kind === 'rail' ? '#6b665c' : g.dirt ? '#7b6a48' : '#4d504c';
    ctx.lineWidth = g.w;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y1);
    ctx.lineTo(g.x2, g.y2);
    ctx.stroke();
  }
  // Beschriftungen und Pinselkreis in Bildschirmkoordinaten
  ctx.setTransform(d, 0, 0, d, 0, 0);
  if (TERRAIN_TOOLS.has(st.tool) && st.pointer) {
    const bp = g && g.type === 'terrain' ? g : st.pointer;
    const r = BRUSH_SIZES[st.brush.size];
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    groundCircle(bp.x, bp.y, r);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = st.tool === 'lower' ? '#9fd0ff' : st.tool === 'raise' ? '#ffe9a8' : '#ffffff';
    ctx.setLineDash([6, 5]);
    groundCircle(bp.x, bp.y, r);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24a';
  const zp = cam.worldToScreen(m.zone.x, m.zone.y);
  ctx.fillText('Konfliktzone', zp.x, zp.y - 12);
  m.spawns.forEach((sp, i) => {
    const p = cam.worldToScreen(sp.x, sp.y);
    ctx.fillStyle = '#fff';
    ctx.fillText(`Start ${BALANCE.teamNames[i]}`, p.x, p.y - Math.max(14, 44 * z));
  });
}

/** Kreis auf dem Boden als Pfad in Bildschirmkoordinaten (folgt isometrisch dem Gelände). */
function groundCircle(x, y, r) {
  const cam = st.cam;
  ctx.beginPath();
  const n = Math.max(32, Math.min(160, Math.round(r / 24)));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = cam.worldToScreen(x + Math.cos(a) * r, y + Math.sin(a) * r);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.closePath();
}

// ---- Gelände ------------------------------------------------------------------------

/** Gelände der Karte; eine flache Karte bekommt beim ersten Pinselstrich ein (flaches) Höhenraster. */
function ensureRelief() {
  let relief = reliefOf(st.map);
  if (!relief) {
    relief = new Relief();
    setRelief(st.map, relief);
  }
  return relief;
}

/** Geländebild der 2D-Ansicht (Schummerung, Fels, Seen; Kacheln) oder null für eine flache Karte. */
function reliefImage() {
  const relief = reliefOf(st.map);
  if (!relief) return null;
  if (!st.reliefImg || st.reliefImg.relief !== relief) st.reliefImg = { relief, tiles: reliefTiles(relief, W, H) };
  return st.reliefImg.tiles;
}

/** Einen Pinselschritt (dt Sekunden) am Gestenpunkt anwenden: Grobraster ändern, Feinraster und 2D-Bild nachziehen. */
function applyBrush(g, dt) {
  const relief = reliefOf(st.map);
  if (!relief || dt <= 0) return;
  const R = BRUSH_SIZES[st.brush.size];
  const pw = BRUSH_POWER[st.brush.power][1];
  const res = RELIEF.res;
  const n = COARSE_N;
  const C = relief.coarse;
  const i0 = clamp(Math.floor((g.x - R) / res), 0, n - 1);
  const i1 = clamp(Math.ceil((g.x + R) / res), 0, n - 1);
  const j0 = clamp(Math.floor((g.y - R) / res), 0, n - 1);
  const j1 = clamp(Math.ceil((g.y + R) / res), 0, n - 1);
  const src = g.tool === 'smooth' ? C.slice() : C; // Glätten liest die alten Werte, damit die Richtung keine Rolle spielt
  const at = (i, j) => src[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)];
  const k = 1 - Math.exp(-dt * (g.tool === 'smooth' ? 7 : 5) * pw);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const t = Math.hypot(i * res - g.x, j * res - g.y) / R;
      if (t >= 1) continue;
      const wgt = (1 - t * t) ** 2;
      const idx = j * n + i;
      let v = C[idx];
      if (g.tool === 'raise') v += RAISE_RATE * pw * dt * wgt;
      else if (g.tool === 'lower') v -= RAISE_RATE * pw * dt * wgt;
      else if (g.tool === 'flatten') v += (g.target - v) * k * wgt;
      else {
        const avg = (at(i - 1, j) + at(i + 1, j) + at(i, j - 1) + at(i, j + 1) + at(i - 1, j - 1) + at(i + 1, j - 1) + at(i - 1, j + 1) + at(i + 1, j + 1) + at(i, j) * 2) / 10;
        v += (avg - v) * k * wgt;
      }
      C[idx] = clamp(v, RELIEF.min, H_MAX);
    }
  }
  relief.refine(i0, j0, i1, j1);
  if (st.reliefImg && st.reliefImg.relief === relief) {
    const m = 2 * res; // das Feinraster reicht zwei Grobpunkte weiter
    updateReliefTiles(st.reliefImg.tiles, relief, i0 * res - m, j0 * res - m, i1 * res + m, j1 * res + m);
  }
  st.dirty = true;
  st.needDraw = true;
}

/** Pinselstrich fertig: Gelände in die Karte schreiben (Verlauf, Speichern), Boden ohne WebGL neu backen. */
function finishTerrain() {
  const relief = reliefOf(st.map);
  if (relief) setRelief(st.map, relief);
  st.groundDirty = true;
  st.needDraw = true;
}

/** Höhe und Begehbarkeit am Weltpunkt für die Statuszeile. */
function heightInfo(x, y) {
  const relief = reliefOf(st.map);
  if (!relief) return '';
  const h = relief.heightAt(x, y);
  const g = relief.gradAt(x, y);
  const sl = Math.hypot(g.x, g.y);
  const what = h < RELIEF.water ? 'See' : h > RELIEF.peak || sl > RELIEF.steep ? 'unpassierbar' : sl > RELIEF.rock ? 'steil' : '';
  return ` · Höhe ${Math.round(h)}${what ? ` (${what})` : ''}`;
}

function drawSelection(sel, px) {
  const o = sel.o;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2 * px;
  ctx.setLineDash([6 * px, 4 * px]);
  const pad = 3 * px;
  if (sel.k === 'building' || sel.k === 'field') {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.angle || 0);
    ctx.strokeRect(-o.w / 2 - pad, -o.h / 2 - pad, o.w + pad * 2, o.h + pad * 2);
    ctx.restore();
  } else if (sel.k === 'road' || sel.k === 'rail') {
    ctx.setLineDash([]);
    for (const [x, y] of [[o.x1, o.y1], [o.x2, o.y2]]) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(8 * px, (o.w ?? 40) * 0.6), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([6 * px, 4 * px]);
    ctx.beginPath();
    ctx.moveTo(o.x1, o.y1);
    ctx.lineTo(o.x2, o.y2);
    ctx.stroke();
  } else if (sel.k === 'car') {
    const hw = o.vertical ? 9 : 18;
    const hh = o.vertical ? 18 : 9;
    ctx.strokeRect(o.x - hw - pad, o.y - hh - pad, hw * 2 + pad * 2, hh * 2 + pad * 2);
  } else if (sel.k === 'spawn' || sel.k === 'zone') {
    ctx.beginPath();
    ctx.arc(o.x, o.y, Math.max(14 * px, 60), 0, Math.PI * 2);
    ctx.stroke();
  } else if (sel.k === 'crate') {
    ctx.beginPath();
    ctx.arc(o.x, o.y, Math.max(12 * px, 20), 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r + pad, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function tick() {
  const g = st.gesture;
  if (g && g.type === 'terrain') {
    const now = performance.now();
    applyBrush(g, Math.min(0.1, (now - g.last) / 1000));
    g.last = now;
  }
  if (st.needDraw) draw();
  requestAnimationFrame(tick);
}

// ---- Eingabe ---------------------------------------------------------------------

function pos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/** Straßenpunkt: rastet an Enden und Mittellinien anderer Straßen ein, damit Kreuzungen und Einmündungen sauber schließen. */
function snapRoad(x, y, kind = 'road') {
  const z = st.cam.zoom;
  const tolEnd = 40 / z;
  let best = null;
  let bd = Infinity;
  const list = kind === 'rail' ? st.map.town.rails : st.map.town.roads;
  for (const r of list) {
    for (const [ex, ey] of [[r.x1, r.y1], [r.x2, r.y2]]) {
      const d = Math.hypot(ex - x, ey - y);
      if (d < tolEnd && d < bd) {
        bd = d;
        best = { x: ex, y: ey };
      }
    }
  }
  if (best) return best;
  for (const r of list) {
    const dx = r.x2 - r.x1;
    const dy = r.y2 - r.y1;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - r.x1) * dx + (y - r.y1) * dy) / l2, 0, 1);
    const qx = r.x1 + t * dx;
    const qy = r.y1 + t * dy;
    const d = Math.hypot(qx - x, qy - y);
    if (d < (r.w ?? 40) / 2 + 28 / z && d < bd) {
      bd = d;
      best = { x: Math.round(qx), y: Math.round(qy) };
    }
  }
  return best || { x: clamp(snap(x), 0, W), y: clamp(snap(y), 0, H) };
}

function endpointHit(sel, wx, wy) {
  if (!sel || (sel.k !== 'road' && sel.k !== 'rail')) return 0;
  const tol = 22 / st.cam.zoom + (sel.o.w ?? 40) / 2;
  if (Math.hypot(sel.o.x1 - wx, sel.o.y1 - wy) < tol) return 1;
  if (Math.hypot(sel.o.x2 - wx, sel.o.y2 - wy) < tol) return 2;
  return 0;
}

function pinchStep() {
  const [a, b] = [...st.touches.values()];
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const last = st.pinch;
  st.pinch = { dist, cx, cy };
  if (!last) return;
  panBy(cx - last.cx, cy - last.cy);
  zoomAt(dist / last.dist, cx, cy);
}

canvas.addEventListener('pointerdown', (e) => {
  const p = pos(e);
  if (e.pointerType === 'touch') {
    st.touches.set(e.pointerId, p);
    if (st.touches.size >= 2) {
      cancelGesture();
      st.pinch = null;
      pinchStep();
      return;
    }
  }
  if (e.button === 1 || e.button === 2) {
    st.gesture = { type: 'pan', x: p.x, y: p.y };
    return;
  }
  if (e.button !== 0) return;
  canvas.setPointerCapture?.(e.pointerId);
  const w = toWorld(p.x, p.y);
  st.pointer = w;
  const t = st.tool;
  if (t === 'hand') {
    st.gesture = { type: 'pan', x: p.x, y: p.y };
  } else if (t === 'select') {
    const ep = endpointHit(st.sel, w.x, w.y);
    if (ep) {
      pushHistory();
      st.gesture = { type: 'endpoint', ep, moved: true };
      return;
    }
    const hit = pickAt(w.x, w.y, p.x, p.y);
    st.sel = hit;
    showInspector();
    st.needDraw = true;
    if (hit) st.gesture = { type: 'move', x: w.x, y: w.y, started: false, sx: p.x, sy: p.y };
    else st.gesture = { type: 'pan', x: p.x, y: p.y };
  } else if (t === 'erase') {
    const hit = pickAt(w.x, w.y, p.x, p.y);
    if (hit) {
      pushHistory();
      if (!removeSel(hit)) {
        st.hist.pop();
        say('Startpunkte und Zone lassen sich nicht löschen, nur verschieben.', true);
      } else {
        st.sel = null;
        showInspector();
        st.needDraw = true;
        updateInfo();
      }
    }
  } else if (t === 'road' || t === 'dirt' || t === 'rail') {
    const a = snapRoad(w.x, w.y, t);
    st.gesture = { type: 'line', kind: t, dirt: t === 'dirt', w: t === 'dirt' ? 52 : t === 'rail' ? 40 : 64, x1: a.x, y1: a.y, x2: a.x, y2: a.y };
  } else if (TERRAIN_TOOLS.has(t)) {
    pushHistory();
    const relief = ensureRelief();
    st.gesture = { type: 'terrain', tool: t, x: w.x, y: w.y, target: relief.heightAt(w.x, w.y), last: performance.now() };
    applyBrush(st.gesture, 1 / 20);
  } else if (t === 'tree') {
    pushHistory();
    place(t, w.x, w.y);
    st.gesture = { type: 'brush', x: w.x, y: w.y };
    st.needDraw = true;
    updateInfo();
  } else {
    pushHistory();
    st.sel = place(t, w.x, w.y);
    st.gesture = { type: 'place', x: w.x, y: w.y, sel: st.sel };
    showInspector();
    st.needDraw = true;
    updateInfo();
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('pointermove', (e) => {
  const p = pos(e);
  if (e.pointerType === 'touch') {
    if (!st.touches.has(e.pointerId)) return;
    st.touches.set(e.pointerId, p);
    if (st.touches.size >= 2) {
      pinchStep();
      return;
    }
  }
  const w = toWorld(p.x, p.y);
  st.pointer = w;
  $('[data-info]').textContent = `x ${Math.round(w.x)} · y ${Math.round(w.y)}${heightInfo(w.x, w.y)} · Zoom ${Math.round(st.cam.zoom * 100)} %`;
  if (TERRAIN_TOOLS.has(st.tool)) st.needDraw = true; // Pinselkreis folgt dem Zeiger
  const g = st.gesture;
  if (!g) return;
  if (g.type === 'pan') {
    panBy(p.x - g.x, p.y - g.y);
    g.x = p.x;
    g.y = p.y;
  } else if (g.type === 'move') {
    if (!g.started) {
      if (Math.hypot(p.x - g.sx, p.y - g.sy) < 5) return;
      g.started = true;
      pushHistory();
    }
    if (st.sel.k === 'spawn' || st.sel.k === 'zone') {
      moveObj(st.sel, snap(w.x) - snap(g.x), snap(w.y) - snap(g.y));
    } else {
      moveObj(st.sel, w.x - g.x, w.y - g.y);
    }
    g.x = w.x;
    g.y = w.y;
    st.needDraw = true;
  } else if (g.type === 'endpoint') {
    const r = st.sel.o;
    const q = snapRoad(w.x, w.y, st.sel.k);
    if (g.ep === 1) { r.x1 = q.x; r.y1 = q.y; }
    else { r.x2 = q.x; r.y2 = q.y; }
    st.needDraw = true;
  } else if (g.type === 'line') {
    const b = snapRoad(w.x, w.y, g.kind);
    g.x2 = b.x;
    g.y2 = b.y;
    st.needDraw = true;
  } else if (g.type === 'terrain') {
    // Weltpunkt nur bei Bewegung neu: beim Heben wandert sonst der Punkt unter dem stehenden Finger mit
    g.x = w.x;
    g.y = w.y;
  } else if (g.type === 'brush') {
    if (Math.hypot(w.x - g.x, w.y - g.y) >= 34) {
      place('tree', w.x, w.y);
      g.x = w.x;
      g.y = w.y;
      st.needDraw = true;
      updateInfo();
    }
  } else if (g.type === 'place') {
    // Beim Setzen ziehen = Objekt feinjustieren
    if (st.sel && g.sel === st.sel) {
      moveObj(st.sel, snap(w.x) - snap(g.x), snap(w.y) - snap(g.y));
      g.x = w.x;
      g.y = w.y;
      st.needDraw = true;
    }
  }
});

function cancelGesture() {
  const g = st.gesture;
  st.gesture = null;
  if (g && g.type === 'terrain') finishTerrain();
  return g;
}

function endPointer(e) {
  if (e.pointerType === 'touch') {
    if (!st.touches.delete(e.pointerId)) return;
    if (st.pinch) {
      if (!st.touches.size) st.pinch = null;
      st.gesture = null;
      return;
    }
  }
  const g = cancelGesture();
  st.needDraw = true; // Boden der Iso-Ansicht wird erst ohne laufende Geste neu gebacken
  if (!g) return;
  if (g.type === 'line' && e.type !== 'pointercancel') {
    if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) >= 32) {
      pushHistory();
      const o = g.kind === 'rail' ? { x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 } : { x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, w: g.w, ...(g.dirt ? { dirt: true } : {}) };
      (g.kind === 'rail' ? st.map.town.rails : st.map.town.roads).push(o);
      st.sel = { k: g.kind === 'rail' ? 'rail' : 'road', o };
      showInspector();
      updateInfo();
    }
    st.needDraw = true;
  }
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const p = pos(e);
    zoomAt(clamp(Math.exp(-e.deltaY * 0.0015), 0.8, 1.25), p.x, p.y);
  },
  { passive: false },
);

window.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
  if (k === 'Delete' || k === 'Backspace') {
    e.preventDefault();
    deleteSelected();
  } else if (k === 'Escape') {
    st.sel = null;
    setTool('select');
    showInspector();
    st.needDraw = true;
  } else if (k.startsWith('Arrow')) {
    e.preventDefault();
    const s = 120 * st.cam.zoom;
    panBy(k === 'ArrowLeft' ? s : k === 'ArrowRight' ? -s : 0, k === 'ArrowUp' ? s : k === 'ArrowDown' ? -s : 0);
  } else if (k === 'v' || k === 'V') toggleView();
  else if (k === ',') rotateView(-1);
  else if (k === '.') rotateView(1);
  else if ((k === '[' || k === ']') && TERRAIN_TOOLS.has(st.tool)) brushAction(k === ']' ? 'size+' : 'size-');
  else if (k === '+' || k === '=') zoomAt(1.2, window.innerWidth / 2, window.innerHeight / 2);
  else if (k === '-') zoomAt(1 / 1.2, window.innerWidth / 2, window.innerHeight / 2);
});

// ---- Werkzeugleiste und Inspektor ---------------------------------------------------

function buildTools() {
  let group = '';
  let html = '';
  for (const [id, name, g, icon] of TOOLS) {
    if (g !== group) {
      html += `<h4>${g}</h4>`;
      group = g;
    }
    html += `<button type="button" data-tool="${id}" aria-pressed="false"><span class="ic">${icon}</span>${name}</button>`;
  }
  $('[data-tools]').innerHTML = html;
}

function setTool(t) {
  st.tool = t;
  if (TERRAIN_TOOLS.has(t)) st.sel = null;
  if (st.map) showInspector();
  st.needDraw = true;
  document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  const def = TOOLS.find((x) => x[0] === t);
  $('[data-hint]').textContent = def ? def[4] : '';
}

const SEL_NAMES = {
  building: 'Gebäude',
  road: 'Straße',
  park: 'Park',
  car: 'Auto',
  tree: 'Baum',
  townTree: 'Baum',
  obstacle: 'Hindernis',
  rail: 'Gleis',
  spawn: 'Startpunkt',
  zone: 'Konfliktzone',
  crate: 'Versorgungskiste',
  field: 'Feld',
};
const FIELD_NAMES = { wheat: 'Weizenfeld', green: 'Junge Saat', soil: 'Acker (gepflügt)', rape: 'Rapsfeld', pasture: 'Weide' };
const FIELD_ORDER = [...FIELD_CROPS, 'pasture']; // „Frucht“ schaltet der Reihe nach weiter
const KIND_NAMES = { house: 'Haus', factory: 'Fabrik', hall: 'Halle', tower: 'Wachturm', train: 'Zugteil', station: 'Bahnhof', platform: 'Bahnsteig' };

function showInspector() {
  const el = $('[data-insp]');
  const s = st.sel;
  if (!s && TERRAIN_TOOLS.has(st.tool)) {
    const [pname] = BRUSH_POWER[st.brush.power];
    el.innerHTML =
      '<h3>Geländepinsel</h3>' +
      '<div class="row"><button data-b="size-">Kleiner</button><button data-b="size+">Größer</button></div>' +
      `<div class="muted small">Größe ${BRUSH_SIZES[st.brush.size] * 2} px</div>` +
      `<div class="row"><button data-b="power">Stärke: ${pname}</button></div>` +
      '<div class="muted small">Steile Hänge werden zu Fels und sind unpassierbar, ebenso Gipfel und Seen. ' +
      'Wege in die Konfliktzone frei lassen, „Prüfen“ zählt die Zugänge.</div>' +
      (reliefOf(st.map) ? '<div class="row"><button data-b="flat" class="danger">Alles eben</button></div>' : '');
    el.hidden = false;
    return;
  }
  if (!s) {
    el.hidden = true;
    return;
  }
  let title = SEL_NAMES[s.k];
  if (s.k === 'building') title = KIND_NAMES[s.o.kind] || title;
  if (s.k === 'obstacle') title = Math.round(s.o.r) % 2 === 0 ? 'Wald' : 'Fels';
  if (s.k === 'spawn') title = `Start ${BALANCE.teamNames[s.i]}`;
  if (s.k === 'field') title = FIELD_NAMES[s.o.kind === 'pasture' ? 'pasture' : s.o.crop] || title;
  const rows = [];
  if (s.k === 'building') {
    rows.push('<div class="row"><button data-i="w-">Breite −</button><button data-i="w+">Breite +</button></div>');
    rows.push('<div class="row"><button data-i="h-">Höhe −</button><button data-i="h+">Höhe +</button></div>');
    const turnable = s.o.kind === 'train' || s.o.kind === 'platform';
    rows.push(
      turnable
        ? '<div class="row"><button data-i="rot-">↺ 15°</button><button data-i="rot+">↻ 15°</button></div>'
        : '<div class="row"><button data-i="turn">Drehen</button>' + (s.o.kind !== 'station' ? '<button data-i="kind">Art</button>' : '') + '</div>',
    );
  } else if (s.k === 'field') {
    rows.push('<div class="row"><button data-i="w-">Breite −</button><button data-i="w+">Breite +</button></div>');
    rows.push('<div class="row"><button data-i="h-">Höhe −</button><button data-i="h+">Höhe +</button></div>');
    rows.push('<div class="row"><button data-i="rot-">↺ 15°</button><button data-i="rot+">↻ 15°</button><button data-i="crop">Frucht</button></div>');
    rows.push('<div class="muted small">Nur Boden: Einheiten fahren darüber, Felder blockieren nichts.</div>');
  } else if (s.k === 'road') {
    rows.push('<div class="row"><button data-i="rw-">Schmaler</button><button data-i="rw+">Breiter</button></div>');
    rows.push('<div class="row"><button data-i="dirt">' + (s.o.dirt ? 'Zur Straße' : 'Zum Feldweg') + '</button></div>');
    rows.push('<div class="muted small">Enden ziehen, um die Straße zu ändern.</div>');
  } else if (s.k === 'car') {
    rows.push('<div class="row"><button data-i="turn">Drehen</button><button data-i="color">Farbe</button></div>');
  } else if (s.k === 'zone') {
    rows.push('<div class="row"><button data-i="r-">Kleiner</button><button data-i="r+">Größer</button></div>');
    rows.push(`<div class="muted small">Radius ${Math.round(s.o.r)} px</div>`);
  } else if (s.k === 'obstacle' || s.k === 'park' || s.k === 'tree' || s.k === 'townTree') {
    rows.push('<div class="row"><button data-i="r-">Kleiner</button><button data-i="r+">Größer</button></div>');
  } else if (s.k === 'rail') {
    rows.push('<div class="muted small">Enden ziehen, um das Gleis zu ändern. Neue Gleise rasten an Enden und Gleisen ein.</div>');
  } else if (s.k === 'spawn') {
    rows.push('<div class="muted small">Ziehen verschiebt den Startpunkt. Die Haupt-FOB entsteht hier, Bauradius als Kreis.</div>');
  } else if (s.k === 'crate') {
    const d = st.map.spawns.map((sp) => Math.round(Math.hypot(sp.x - s.o.x, sp.y - s.o.y)));
    rows.push(`<div class="muted small">Ziehen verschiebt die Kiste. Abstand zu den Starts: ${d[0]} / ${d[1]} px. Auf freien Boden setzen (sonst rückt sie im Spiel zur nächsten freien Stelle).</div>`);
  }
  if (s.k !== 'spawn' && s.k !== 'zone') {
    rows.push(`<div class="row"><button data-i="dup">Kopie</button><button data-i="del" class="danger">Löschen</button></div>`);
  }
  el.innerHTML = `<h3>${title}</h3>${rows.join('')}`;
  el.hidden = false;
}

function deleteSelected() {
  if (!st.sel || st.sel.k === 'spawn' || st.sel.k === 'zone') return;
  pushHistory();
  removeSel(st.sel);
  st.sel = null;
  showInspector();
  st.needDraw = true;
  updateInfo();
}

function inspectorAction(a) {
  const s = st.sel;
  if (!s) return;
  const o = s.o;
  if (a === 'del') return deleteSelected();
  pushHistory();
  if (a === 'w+') o.w = Math.min(600, o.w + 16);
  else if (a === 'w-') o.w = Math.max(24, o.w - 16);
  else if (a === 'h+') o.h = Math.min(600, o.h + 16);
  else if (a === 'h-') o.h = Math.max(24, o.h - 16);
  else if (a === 'turn') {
    if (s.k === 'car') o.vertical = !o.vertical;
    else [o.w, o.h] = [o.h, o.w];
  } else if (a === 'kind') {
    const order = ['house', 'factory', 'hall'];
    o.kind = order[(order.indexOf(o.kind) + 1) % order.length];
  } else if (a === 'color') o.color = CAR_COLORS[(CAR_COLORS.indexOf(o.color) + 1) % CAR_COLORS.length];
  else if (a === 'crop') {
    const next = FIELD_ORDER[(FIELD_ORDER.indexOf(o.kind === 'pasture' ? 'pasture' : o.crop) + 1) % FIELD_ORDER.length];
    if (next === 'pasture') {
      o.kind = 'pasture';
      delete o.crop;
    } else {
      o.kind = 'field';
      o.crop = next;
    }
    st.fieldCrop = next; // das nächste neue Feld bekommt dieselbe Frucht
  }
  else if (a === 'rot+' || a === 'rot-') {
    let ang = (o.angle || 0) + (a === 'rot+' ? 1 : -1) * (Math.PI / 12);
    if (ang > Math.PI) ang -= Math.PI * 2;
    if (ang <= -Math.PI) ang += Math.PI * 2;
    if (Math.abs(ang) < 1e-3) delete o.angle;
    else o.angle = ang;
  }
  else if (a === 'rw+') o.w = Math.min(200, o.w + 8);
  else if (a === 'rw-') o.w = Math.max(20, o.w - 8);
  else if (a === 'dirt') {
    if (o.dirt) delete o.dirt;
    else o.dirt = true;
  } else if (a === 'r+' || a === 'r-') {
    const step = s.k === 'zone' ? 100 : s.k === 'obstacle' ? 10 : s.k === 'park' ? 20 : 2; // Wald/Fels: gerade Schritte behalten die Art
    const lim = s.k === 'zone' ? [200, 4000] : s.k === 'obstacle' ? [21, 400] : s.k === 'park' ? [40, 400] : [6, 40];
    o.r = clamp(o.r + (a === 'r+' ? step : -step), lim[0], lim[1]);
  } else if (a === 'dup') {
    const copy = JSON.parse(JSON.stringify(o));
    if (s.k === 'road' || s.k === 'rail') { copy.x1 += 48; copy.y1 += 48; copy.x2 += 48; copy.y2 += 48; }
    else { copy.x += 48; copy.y += 48; }
    listOf(s.k).push(copy);
    st.sel = { k: s.k, o: copy };
    updateInfo();
  }
  showInspector();
  st.needDraw = true;
}

$('[data-insp]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (b) inspectorAction(b.dataset.i);
  const p = e.target.closest('[data-b]');
  if (p) brushAction(p.dataset.b);
});

function brushAction(a) {
  const br = st.brush;
  if (a === 'size+') br.size = Math.min(BRUSH_SIZES.length - 1, br.size + 1);
  else if (a === 'size-') br.size = Math.max(0, br.size - 1);
  else if (a === 'power') br.power = (br.power + 1) % BRUSH_POWER.length;
  else if (a === 'flat' && reliefOf(st.map)) {
    pushHistory();
    setRelief(st.map, null);
    say('Gelände eingeebnet (Rückgängig holt es zurück).');
  }
  showInspector();
  st.needDraw = true;
}
$('[data-tools]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (b) setTool(b.dataset.tool);
});

// ---- Karte laden, speichern, prüfen ------------------------------------------------------

function updateInfo() {
  const d = describeMap(st.map);
  $('[data-msg]').classList.remove('bad');
  $('[data-info]').textContent = `${d.buildings} Gebäude · ${d.roads} Straßen · ${d.trees} Bäume · ${d.obstacles} Hindernisse · ${st.map.town.fields.length} Felder · ${st.map.crates.length} Kisten`;
}

function setMap(map, { keepId = false } = {}) {
  st.map = map;
  if (!keepId) st.id = null;
  st.sel = null;
  st.hist = [];
  st.redo = [];
  st.dirty = false;
  $('[data-name]').value = map.name || 'Neue Karte';
  showInspector();
  syncButtons();
  updateInfo();
  st.needDraw = true;
}

function problems() {
  st.map.name = $('[data-name]').value.trim() || 'Karte';
  return checkMap(st.map);
}

function save() {
  st.map.name = $('[data-name]').value.trim() || 'Karte';
  const id = saveMap(JSON.parse(JSON.stringify(st.map)), st.id);
  if (!id) {
    say('Speichern fehlgeschlagen (Speicher voll oder gesperrt). Bitte als Datei exportieren.', true);
    return null;
  }
  st.id = id;
  st.dirty = false;
  history.replaceState(null, '', `editor.html?map=${encodeURIComponent(id)}`);
  say(`Gespeichert: ${st.map.name}`);
  return id;
}

function check(announce = true) {
  const p = problems();
  if (announce) {
    if (p.length) say(`Nicht spielbar: ${p.join(' · ')}`, true);
    else {
      const routes = accessRoutes(st.map, 4);
      const n = routes.map((v) => (v >= 4 ? '4+' : String(v)));
      const few = Math.min(...routes) < 2 ? ' Wenige Wege: die Zone ist leicht abzuriegeln.' : '';
      say(`Karte ist spielbar. Getrennte Zugänge zur Zone: ${BALANCE.teamNames[0]} ${n[0]}, ${BALANCE.teamNames[1]} ${n[1]}.${few}`);
    }
  }
  return p;
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = `${name.replace(/[^\w\-äöüÄÖÜß ]+/g, '_') || 'karte'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function confirmDiscard() {
  return !st.dirty || window.confirm('Ungespeicherte Änderungen gehen verloren. Fortfahren?');
}

document.querySelector('.edtop').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'back') {
    if (confirmDiscard()) location.href = 'index.html';
  } else if (a === 'undo') undo();
  else if (a === 'redo') redo();
  else if (a === 'fit') fit();
  else if (a === 'view') toggleView();
  else if (a === 'rotl') rotateView(-1);
  else if (a === 'rotr') rotateView(1);
  else if (a === 'empty') {
    if (confirmDiscard()) setMap(createEmptyMap(), {});
  } else if (a === 'random') {
    if (!confirmDiscard()) return;
    const seed = Math.floor(Math.random() * 1e9) + 1;
    const m = normalizeMap({ ...generateMap(seed), name: `Zufallskarte ${seed}` });
    setMap(m);
    say(`Zufallskarte ${seed} geladen, jetzt frei änderbar.`);
  } else if (a === 'export') {
    st.map.name = $('[data-name]').value.trim() || 'Karte';
    download(st.map.name, JSON.stringify({ format: 1, ...st.map }));
  } else if (a === 'check') check();
  else if (a === 'save') {
    const p = problems();
    save();
    if (p.length) say(`Gespeichert, aber noch nicht spielbar: ${p.join(' · ')}`, true);
  } else if (a === 'play') {
    const p = problems();
    if (p.length) {
      say(`Nicht spielbar: ${p.join(' · ')}`, true);
      return;
    }
    const id = save();
    if (!id) return;
    try {
      localStorage.setItem(SEL_KEY, id);
    } catch {
      /* ohne Speicher nicht möglich */
    }
    location.href = 'index.html';
  }
});

$('[data-import]').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f || !confirmDiscard()) return;
  f.text()
    .then((t) => {
      setMap(normalizeMap(JSON.parse(t)));
      say(`Importiert: ${st.map.name}`);
    })
    .catch((err) => say(`Import fehlgeschlagen: ${err.message}`, true));
});
$('[data-name]').addEventListener('input', () => {
  st.dirty = true;
});

window.addEventListener('resize', resize);
window.addEventListener('beforeunload', (e) => {
  if (st.dirty) e.preventDefault();
});

// ---- Start ------------------------------------------------------------------------

buildTools();
setTool('select');
(() => {
  let map = null;
  if (params.has('map')) {
    map = loadMap(params.get('map'));
    if (map) st.id = params.get('map');
  }
  if (!map && params.has('seed')) {
    const seed = Number.parseInt(params.get('seed'), 10) || 1;
    map = normalizeMap({ ...generateMap(seed), name: `Zufallskarte ${seed}` });
  }
  setMap(map || createEmptyMap(), { keepId: !!map && !!st.id });
  if (params.has('map') && !st.id) say('Karte nicht gefunden, neue Karte begonnen.', true);
})();
st.renderer = makeRenderer();
resize();
fit();
requestAnimationFrame(tick);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
