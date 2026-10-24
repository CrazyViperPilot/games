// Karteneditor (editor.html): alle Kartenelemente frei platzieren, ohne Spiegelung. Zeichnet mit denselben Funktionen wie das Spiel.
// URL: ?new=1 (leere Karte) · ?map=ID (gespeicherte Karte) · ?seed=N (Zufallskarte als Ausgangspunkt)
import { BALANCE } from '../data/balance.js';
import { makeRng } from '../core/rng.js';
import { generateMap } from '../game/map.js';
import { drawMapObjects } from '../render/terrain.js';
import { createEmptyMap, normalizeMap, checkMap, describeMap, loadMap, saveMap } from '../game/mapdata.js';

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
  ['loco', 'Lok', 'Zug', '◧', 'Tippen setzt eine Lok (blockiert wie ein Gebäude)'],
  ['container', 'Waggon', 'Zug', '◨', 'Tippen setzt einen Container-Waggon'],
  ['tank', 'Kesselwagen', 'Zug', '◩', 'Tippen setzt einen Kesselwagen'],
  ['rail', 'Bahnlinie', 'Zug', '═', 'Tippen legt die Bahnlinie quer über die Karte (nur eine)'],
  ['road', 'Straße', 'Wege', '▬', 'Von Start- zu Endpunkt ziehen'],
  ['dirt', 'Feldweg', 'Wege', '┅', 'Von Start- zu Endpunkt ziehen'],
  ['park', 'Park', 'Natur', '◌', 'Tippen setzt eine Grünfläche (nur Dekoration)'],
  ['tree', 'Baum', 'Natur', '♣', 'Tippen setzt einen Baum, Ziehen malt eine Baumreihe (Bäume blockieren)'],
  ['forest', 'Wald', 'Natur', '♠', 'Tippen setzt einen Wald (blockiert)'],
  ['rock', 'Fels', 'Natur', '●', 'Tippen setzt einen Felsen (blockiert)'],
  ['car', 'Auto', 'Natur', '▰', 'Tippen setzt ein geparktes Auto (Dekoration)'],
  ['spawn0', 'Start Blau', 'Spiel', '①', 'Tippen setzt den Startpunkt von Blau (Haupt-FOB)'],
  ['spawn1', 'Start Rot', 'Spiel', '②', 'Tippen setzt den Startpunkt von Rot (Haupt-FOB)'],
  ['zone', 'Zone', 'Spiel', '◎', 'Tippen setzt die Mitte der Konfliktzone'],
];
const BUILD_DEF = {
  house: { w: 90, h: 70, kind: 'house' },
  factory: { w: 260, h: 170, kind: 'factory' },
  hall: { w: 290, h: 100, kind: 'hall' },
  loco: { w: 96, h: 46, kind: 'train', part: 'loco' },
  container: { w: 96, h: 46, kind: 'train', part: 'container' },
  tank: { w: 96, h: 46, kind: 'train', part: 'tank' },
};

const $ = (s) => document.querySelector(s);
const canvas = $('#edview');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);

const st = {
  map: null,
  id: null, // ID der gespeicherten Karte
  tool: 'select',
  sel: null, // {k: Art, o: Objekt}
  view: { x: W / 2, y: H / 2, zoom: 0.1 },
  hist: [],
  redo: [],
  dirty: false,
  needDraw: true,
  pointer: null, // Weltposition des Zeigers
  gesture: null, // laufende Einzelgeste
  touches: new Map(),
  pinch: null,
  carVertical: false,
};

// ---- Kleinkram -------------------------------------------------------------------

const snap = (v) => Math.round(v / SNAP) * SNAP;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dpr = () => window.devicePixelRatio || 1;

function resize() {
  const d = dpr();
  canvas.width = Math.round(window.innerWidth * d);
  canvas.height = Math.round(window.innerHeight * d);
  fitMinZoom();
  st.needDraw = true;
}

function minZoom() {
  return Math.min(window.innerWidth / (W * 1.05), window.innerHeight / (H * 1.05));
}

function fitMinZoom() {
  st.view.zoom = clamp(st.view.zoom, minZoom(), ZOOM_MAX);
}

const toWorld = (sx, sy) => ({
  x: (sx - window.innerWidth / 2) / st.view.zoom + st.view.x,
  y: (sy - window.innerHeight / 2) / st.view.zoom + st.view.y,
});

function clampView() {
  st.view.x = clamp(st.view.x, 0, W);
  st.view.y = clamp(st.view.y, 0, H);
}

function zoomAt(f, sx, sy) {
  const before = toWorld(sx, sy);
  st.view.zoom = clamp(st.view.zoom * f, minZoom(), ZOOM_MAX);
  const after = toWorld(sx, sy);
  st.view.x += before.x - after.x;
  st.view.y += before.y - after.y;
  clampView();
  st.needDraw = true;
}

function panBy(dx, dy) {
  st.view.x -= dx / st.view.zoom;
  st.view.y -= dy / st.view.zoom;
  clampView();
  st.needDraw = true;
}

function fit() {
  st.view = { x: W / 2, y: H / 2, zoom: minZoom() };
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
  syncButtons();
}

function restore(json) {
  st.map = normalizeMap(JSON.parse(json));
  st.sel = null;
  st.dirty = true;
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
}

// ---- Objekte ---------------------------------------------------------------------

function listOf(k) {
  const m = st.map;
  switch (k) {
    case 'building': return m.town.buildings;
    case 'road': return m.town.roads;
    case 'park': return m.town.parks;
    case 'car': return m.town.cars;
    case 'tree': return m.trees;
    case 'townTree': return m.town.trees;
    case 'obstacle': return m.obstacles;
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
function pickAt(wx, wy) {
  const tol = 14 / st.view.zoom;
  const m = st.map;
  for (let i = 0; i < 2; i++) {
    if (Math.hypot(m.spawns[i].x - wx, m.spawns[i].y - wy) < 70 + tol) return { k: 'spawn', i, o: m.spawns[i] };
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
    if (Math.abs(b.x - wx) <= b.w / 2 + tol * 0.4 && Math.abs(b.y - wy) <= b.h / 2 + tol * 0.4) return { k: 'building', o: b };
  }
  const hit = circ('tree', m.trees) || circ('townTree', m.town.trees) || circ('obstacle', m.obstacles);
  if (hit) return hit;
  const pk = circ('park', m.town.parks);
  const road = (() => {
    for (let i = m.town.roads.length - 1; i >= 0; i--) {
      const r = m.town.roads[i];
      if (distToSeg(wx, wy, r) <= r.w / 2 + tol) return { k: 'road', o: r };
    }
    return null;
  })();
  if (road) return road;
  if (m.town.rail && Math.abs(wy - m.town.rail.y) <= m.town.rail.half + tol) return { k: 'rail', o: m.town.rail };
  if (pk) return pk;
  if (Math.hypot(m.zone.x - wx, m.zone.y - wy) <= 90 + tol) return { k: 'zone', o: m.zone };
  return null;
}

function removeSel(sel) {
  if (!sel) return false;
  if (sel.k === 'rail') st.map.town.rail = null;
  else if (sel.k === 'spawn' || sel.k === 'zone') return false;
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
    m.town.buildings.push(o);
    return { k: 'building', o };
  }
  switch (tool) {
    case 'park': {
      const o = { x: px, y: py, r: 150 };
      m.town.parks.push(o);
      return { k: 'park', o };
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
    case 'rail':
      m.town.rail = { y: py, x1: 0, x2: W, half: 40 };
      return { k: 'rail', o: m.town.rail };
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
    default:
      return null;
  }
}

function moveObj(sel, dx, dy) {
  const o = sel.o;
  if (sel.k === 'rail') {
    o.y = clamp(o.y + dy, 0, H);
  } else if (sel.k === 'road') {
    o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy;
  } else {
    o.x = clamp(o.x + dx, 0, W);
    o.y = clamp(o.y + dy, 0, H);
  }
}

// ---- Zeichnen --------------------------------------------------------------------

function draw() {
  st.needDraw = false;
  const d = dpr();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const z = st.view.zoom;
  const m = st.map;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.fillStyle = '#2a2f27';
  ctx.fillRect(0, 0, vw, vh);
  ctx.save();
  ctx.translate(vw / 2 - st.view.x * z, vh / 2 - st.view.y * z);
  // Boden
  ctx.fillStyle = '#56603f';
  ctx.fillRect(0, 0, W * z, H * z);
  drawMapObjects(ctx, m, z, false, makeRng(77));
  // Raster alle 512 px
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 512) { ctx.moveTo(x * z, 0); ctx.lineTo(x * z, H * z); }
  for (let y = 0; y <= H; y += 512) { ctx.moveTo(0, y * z); ctx.lineTo(W * z, y * z); }
  ctx.stroke();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, W * z, H * z);
  // Konfliktzone
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(m.zone.x * z, m.zone.y * z, m.zone.r * z, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffd24a';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Konfliktzone', m.zone.x * z, m.zone.y * z - 10);
  ctx.beginPath();
  ctx.arc(m.zone.x * z, m.zone.y * z, 5, 0, Math.PI * 2);
  ctx.fill();
  // Startpunkte mit Bauradius der Haupt-FOB
  m.spawns.forEach((s, i) => {
    const col = BALANCE.teamColors[i];
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x * z, s.y * z, BALANCE.fob.buildRadius * z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = col;
    const r = Math.max(7, 40 * z);
    ctx.fillRect(s.x * z - r, s.y * z - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(`Start ${BALANCE.teamNames[i]}`, s.x * z, s.y * z - r - 6);
  });
  // Auswahl
  if (st.sel) drawSelection(st.sel, z);
  // Vorschau eines Linien-Ziehens
  const g = st.gesture;
  if (g && g.type === 'line') {
    ctx.strokeStyle = g.dirt ? '#7b6a48' : '#4d504c';
    ctx.lineWidth = g.w * z;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(g.x1 * z, g.y1 * z);
    ctx.lineTo(g.x2 * z, g.y2 * z);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSelection(sel, z) {
  const o = sel.o;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  if (sel.k === 'building') {
    ctx.strokeRect((o.x - o.w / 2) * z - 3, (o.y - o.h / 2) * z - 3, o.w * z + 6, o.h * z + 6);
  } else if (sel.k === 'road') {
    ctx.setLineDash([]);
    for (const [x, y] of [[o.x1, o.y1], [o.x2, o.y2]]) {
      ctx.beginPath();
      ctx.arc(x * z, y * z, Math.max(8, o.w * z * 0.6), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(o.x1 * z, o.y1 * z);
    ctx.lineTo(o.x2 * z, o.y2 * z);
    ctx.stroke();
  } else if (sel.k === 'rail') {
    ctx.strokeRect(0, (o.y - o.half) * z, W * z, o.half * 2 * z);
  } else if (sel.k === 'car') {
    const hw = o.vertical ? 9 : 18;
    const hh = o.vertical ? 18 : 9;
    ctx.strokeRect((o.x - hw) * z - 3, (o.y - hh) * z - 3, hw * 2 * z + 6, hh * 2 * z + 6);
  } else if (sel.k === 'spawn' || sel.k === 'zone') {
    ctx.beginPath();
    ctx.arc(o.x * z, o.y * z, Math.max(14, 60 * z), 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(o.x * z, o.y * z, o.r * z + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function tick() {
  if (st.needDraw) draw();
  requestAnimationFrame(tick);
}

// ---- Eingabe ---------------------------------------------------------------------

function pos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function endpointHit(sel, wx, wy) {
  if (!sel || sel.k !== 'road') return 0;
  const tol = 22 / st.view.zoom + sel.o.w / 2;
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
    const hit = pickAt(w.x, w.y);
    st.sel = hit;
    showInspector();
    st.needDraw = true;
    if (hit) st.gesture = { type: 'move', x: w.x, y: w.y, started: false, sx: p.x, sy: p.y };
    else st.gesture = { type: 'pan', x: p.x, y: p.y };
  } else if (t === 'erase') {
    const hit = pickAt(w.x, w.y);
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
  } else if (t === 'road' || t === 'dirt') {
    st.gesture = { type: 'line', dirt: t === 'dirt', w: t === 'dirt' ? 52 : 64, x1: snap(w.x), y1: snap(w.y), x2: snap(w.x), y2: snap(w.y) };
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
  $('[data-info]').textContent = `x ${Math.round(w.x)} · y ${Math.round(w.y)} · Zoom ${Math.round(st.view.zoom * 100)} %`;
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
    if (st.sel.k === 'spawn' || st.sel.k === 'zone' || st.sel.k === 'rail') {
      moveObj(st.sel, snap(w.x) - snap(g.x), snap(w.y) - snap(g.y));
    } else {
      moveObj(st.sel, w.x - g.x, w.y - g.y);
    }
    g.x = w.x;
    g.y = w.y;
    st.needDraw = true;
  } else if (g.type === 'endpoint') {
    const r = st.sel.o;
    if (g.ep === 1) { r.x1 = clamp(snap(w.x), 0, W); r.y1 = clamp(snap(w.y), 0, H); }
    else { r.x2 = clamp(snap(w.x), 0, W); r.y2 = clamp(snap(w.y), 0, H); }
    st.needDraw = true;
  } else if (g.type === 'line') {
    g.x2 = snap(w.x);
    g.y2 = snap(w.y);
    st.needDraw = true;
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
  if (!g) return;
  if (g.type === 'line' && e.type !== 'pointercancel') {
    if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) >= 32) {
      pushHistory();
      const o = { x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, w: g.w, ...(g.dirt ? { dirt: true } : {}) };
      st.map.town.roads.push(o);
      st.sel = { k: 'road', o };
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
    const s = 120 * st.view.zoom;
    panBy(k === 'ArrowLeft' ? s : k === 'ArrowRight' ? -s : 0, k === 'ArrowUp' ? s : k === 'ArrowDown' ? -s : 0);
  } else if (k === '+' || k === '=') zoomAt(1.2, window.innerWidth / 2, window.innerHeight / 2);
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
  rail: 'Bahnlinie',
  spawn: 'Startpunkt',
  zone: 'Konfliktzone',
};
const KIND_NAMES = { house: 'Haus', factory: 'Fabrik', hall: 'Halle', train: 'Zugteil' };

function showInspector() {
  const el = $('[data-insp]');
  const s = st.sel;
  if (!s) {
    el.hidden = true;
    return;
  }
  let title = SEL_NAMES[s.k];
  if (s.k === 'building') title = KIND_NAMES[s.o.kind] || title;
  if (s.k === 'obstacle') title = Math.round(s.o.r) % 2 === 0 ? 'Wald' : 'Fels';
  if (s.k === 'spawn') title = `Start ${BALANCE.teamNames[s.i]}`;
  const rows = [];
  if (s.k === 'building') {
    rows.push('<div class="row"><button data-i="w-">Breite −</button><button data-i="w+">Breite +</button></div>');
    rows.push('<div class="row"><button data-i="h-">Höhe −</button><button data-i="h+">Höhe +</button></div>');
    rows.push('<div class="row"><button data-i="turn">Drehen</button>' + (s.o.kind !== 'train' ? '<button data-i="kind">Art</button>' : '') + '</div>');
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
    rows.push('<div class="muted small">Ziehen verschiebt die Bahnlinie nach oben/unten.</div>');
  } else if (s.k === 'spawn') {
    rows.push('<div class="muted small">Ziehen verschiebt den Startpunkt. Die Haupt-FOB entsteht hier, Bauradius als Kreis.</div>');
  }
  if (s.k !== 'spawn' && s.k !== 'zone') {
    rows.push('<div class="row"><button data-i="dup">Kopie</button><button data-i="del" class="danger">Löschen</button></div>');
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
    if (s.k === 'road') { copy.x1 += 48; copy.y1 += 48; copy.x2 += 48; copy.y2 += 48; }
    else if (s.k !== 'rail') { copy.x += 48; copy.y += 48; }
    if (s.k === 'rail') { st.hist.pop(); return; }
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
});
$('[data-tools]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (b) setTool(b.dataset.tool);
});

// ---- Karte laden, speichern, prüfen ------------------------------------------------------

function updateInfo() {
  const d = describeMap(st.map);
  $('[data-msg]').classList.remove('bad');
  $('[data-info]').textContent = `${d.buildings} Gebäude · ${d.roads} Straßen · ${d.trees} Bäume · ${d.obstacles} Hindernisse`;
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
    else say('Karte ist spielbar: Startpunkte frei, Zone und Gegner erreichbar.');
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
resize();
fit();
requestAnimationFrame(tick);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
