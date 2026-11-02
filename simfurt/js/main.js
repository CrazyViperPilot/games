// Simfurt – Oberfläche, Eingabe (Touch + Maus), Spielschleife.
import { N, BUILD, CATS, ZONES, OVERLAYS, MONTHS, Z_R, Z_C, Z_I, Z_B, ZONE_UNLOCK, CITY_NAMES, START_MONEY } from './data.js';
import {
  newCity, tick, refresh, applyTool, toolCost, placeBuilding, canPlace, unlocked, unlockNeed, tileInfo, takeLoan, repayLoan, inb, idx, roadAt, dateStr, say,
} from './sim.js';
import { Renderer } from './render.js';
import { saveSlot, loadSlot, listSlots, deleteSlot, SLOTS } from './save.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('de-DE');
const eur = (n) => fmt(n) + ' €';
const cv = $('cv');
const R = new Renderer(cv);

let S = null;                 // aktueller Spielstand
let slot = 0;                 // aktiver Speicherplatz (0 = keiner)
let speed = 1;                // 0 Pause, 1..3
let tool = { id: 'hand' };    // aktives Werkzeug
let cat = null;               // geöffnete Dock-Kategorie
let overlay = 'none';
let acc = 0, lastT = performance.now();
let ui = { overlay: 'none', time: 0 };
let needDraw = true;
let saving = false, lastSaveMsg = '';
const SPEEDMS = [0, 3200, 1400, 500];

// ---------------------------------------------------------------- Werkzeuge im Dock
const TOOLS = {
  road: { name: 'Straße', icon: '🛣', cat: 'road', cost: 20, desc: 'Ziehen. Auf Wasser entsteht eine Brücke (90 €).' },
  [`zone${Z_R}`]: { name: 'Wohnen', icon: '🏠', cat: 'zone', cost: 10, desc: 'Rechteck aufziehen. Braucht Straße + Strom.' },
  [`zone${Z_C}`]: { name: 'Gewerbe', icon: '🏪', cat: 'zone', cost: 10, desc: 'Läden und Büros.' },
  [`zone${Z_I}`]: { name: 'Industrie', icon: '🏭', cat: 'zone', cost: 10, desc: 'Arbeit, aber Dreck.' },
  [`zone${Z_B}`]: { name: 'Bankenviertel', icon: '🏦', cat: 'zone', cost: 30, desc: 'Wolkenkratzer! Braucht Bildung und hohen Grundwert.' },
  hand: { name: 'Hand', icon: '✋', cat: 'tool', cost: 0, desc: 'Karte verschieben, Tippen = Info.' },
  query: { name: 'Info', icon: '🔍', cat: 'tool', cost: 0, desc: 'Kachel antippen.' },
  bulldoze: { name: 'Abriss', icon: '🚜', cat: 'tool', cost: 4, desc: 'Reißt ab, was du überstreichst.' },
};
for (const [k, b] of Object.entries(BUILD)) TOOLS[k] = { name: b.name, icon: b.icon, cat: b.cat, cost: b.cost, desc: b.desc, build: true };
const zoneOf = (id) => (id.startsWith('zone') ? Number(id.slice(4)) : 0);

function renderCats() {
  $('cats').innerHTML = CATS.map((c) => `<button data-c="${c.id}" class="${cat === c.id ? 'on' : ''}"><span class="e">${c.icon}</span>${c.name}</button>`).join('');
}
function renderItems() {
  const box = $('items');
  if (!cat) { box.hidden = true; return; }
  box.hidden = false;
  const ids = Object.keys(TOOLS).filter((k) => TOOLS[k].cat === cat);
  box.innerHTML = ids.map((k) => {
    const t = TOOLS[k]; const need = TOOLS[k].build ? unlockNeed(k) : ZONE_UNLOCK[zoneOf(k)] ?? 0;
    const locked = !unlocked(S, TOOLS[k].build ? k : zoneOf(k));
    return `<button class="it ${tool.id === k ? 'sel' : ''} ${locked ? 'lock' : ''}" data-t="${k}"><span class="ic">${t.icon}</span><b>${t.name}</b><span>${locked ? '🔒 ab ' + fmt(need) + ' Einw.' : t.cost ? eur(t.cost) + (t.build ? '' : ' / Kachel') : 'gratis'}</span></button>`;
  }).join('');
}
$('cats').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  cat = cat === b.dataset.c ? null : b.dataset.c;
  renderCats(); renderItems(); layoutFab();
});
$('items').addEventListener('click', (e) => {
  const b = e.target.closest('.it'); if (!b) return;
  const id = b.dataset.t;
  const key = TOOLS[id].build ? id : zoneOf(id) ? zoneOf(id) : null;
  if (key !== null && !unlocked(S, key)) { toast(`Gesperrt bis ${fmt(unlockNeed(TOOLS[id].build ? id : 0) || ZONE_UNLOCK[zoneOf(id)])} Einwohner`); return; }
  setTool(id);
});
function setTool(id) {
  tool = { id }; ghost = null; paint = null; sel = null;
  renderItems(); hideTip();
  if (TOOLS[id]) toast(`${TOOLS[id].icon} ${TOOLS[id].name} – ${TOOLS[id].desc}`);
  needDraw = true;
}
function layoutFab() { $('fab').style.bottom = `calc(env(safe-area-inset-bottom,0px) + ${$('dock').offsetHeight + 10}px)`; }

// ---------------------------------------------------------------- Hinweise
let toastT = 0;
function toast(text, ms = 2600) {
  const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}
let tickerT = 0;
function ticker(m) {
  const t = $('ticker'); t.textContent = m.text; t.className = m.kind; t.hidden = false; clearTimeout(tickerT); tickerT = setTimeout(() => (t.hidden = true), 7000);
}
function showTip(sx, sy, text, bad) { const t = $('tip'); t.textContent = text; t.className = bad ? 'bad' : ''; t.hidden = false; t.style.left = sx + 'px'; t.style.top = sy + 'px'; }
function hideTip() { $('tip').hidden = true; }

// ---------------------------------------------------------------- Sheet (Fenster)
function sheet(title, html) {
  $('sTitle').textContent = title; $('sBody').innerHTML = html; $('sheet').hidden = false;
}
const closeSheet = () => { $('sheet').hidden = true; };
$('sClose').onclick = closeSheet;
$('sheet').addEventListener('pointerdown', (e) => { if (e.target === $('sheet')) closeSheet(); });

// ---------------------------------------------------------------- HUD
let lastHud = '';
function hud() {
  if (!S) return;
  const st = S.stats; const mood = st.happy > 75 ? '😄' : st.happy > 55 ? '🙂' : st.happy > 38 ? '😐' : '😠';
  const key = [S.year, S.month, Math.round(S.money), st.pop, Math.round(st.happy), S.demand.r.toFixed(2), S.demand.c.toFixed(2), S.demand.i.toFixed(2), S.demand.b.toFixed(2), speed].join('|');
  if (key === lastHud) return; lastHud = key;
  $('hDate').textContent = dateStr(S);
  const m = $('hMoney'); m.textContent = eur(S.money); m.classList.toggle('neg', S.money < 0);
  $('hPop').textContent = '👥 ' + fmt(st.pop);
  $('hHappy').textContent = `${mood} ${Math.round(st.happy)}`;
  const bars = [['r', S.demand.r], ['c', S.demand.c], ['i', S.demand.i], ['b', S.demand.b]];
  for (const [k, v] of bars) {
    const i = document.querySelector(`.bar.${k} i`); const h = Math.abs(v) * 50;
    i.style.height = h + '%'; i.style.bottom = v >= 0 ? '50%' : `${50 - h}%`; i.style.opacity = v >= 0 ? 1 : 0.45;
  }
  document.querySelectorAll('#speed button').forEach((b) => b.classList.toggle('on', Number(b.dataset.sp) === speed));
}
$('speed').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { speed = Number(b.dataset.sp); hud(); } });

// ---------------------------------------------------------------- Karte: Eingabe
let ghost = null, sel = null, paint = null, hover = null, pick = null;
const ptrs = new Map();
let pinch = null, panning = null;

const eventTile = (e) => { const r = cv.getBoundingClientRect(); const [fx, fy] = R.toTile(e.clientX - r.left, e.clientY - r.top); return [Math.floor(fx), Math.floor(fy)]; };
const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

function panBy(dx, dy) { R.cam.x -= dx / R.cam.z; R.cam.y -= dy / R.cam.z; R.clampCam(); needDraw = true; }
function zoomAt(sx, sy, f) {
  const c = R.cam; const wx = (sx - R.w / 2) / c.z + c.x, wy = (sy - R.h / 2) / c.z + c.y;
  c.z = Math.max(0.3, Math.min(2.4, c.z * f));
  c.x = wx - (sx - R.w / 2) / c.z; c.y = wy - (sy - R.h / 2) / c.z; R.clampCam(); needDraw = true;
}

function isPaintTool() { return tool.id === 'road' || tool.id === 'bulldoze' || tool.id.startsWith('zone'); }
const isRectTool = () => tool.id.startsWith('zone');

function line(a, b) { // Kacheln zwischen a und b (Bresenham)
  const out = []; let [x, y] = a; const [x1, y1] = b; const dx = Math.abs(x1 - x), dy = -Math.abs(y1 - y), sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1; let err = dx + dy;
  for (let k = 0; k < 300; k++) { out.push([x, y]); if (x === x1 && y === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; } }
  return out;
}
function rectCells(a, b) {
  const out = []; for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) if (inb(x, y)) out.push([x, y]); return out;
}

function updatePaint(t, e) {
  if (!paint) return;
  if (isRectTool()) paint.cells = rectCells(paint.start, t);
  else { for (const c of line(paint.last, t)) if (inb(c[0], c[1]) && !paint.set.has(c[1] * N + c[0])) { paint.set.add(c[1] * N + c[0]); paint.cells.push(c); } paint.last = t; }
  let total = 0, valid = 0;
  sel = paint.cells.map(([x, y]) => { const c = toolCost(S, tool.id, x, y); if (c >= 0) { total += c; valid++; } return [x, y, c >= 0]; });
  const [sx, sy] = local(e);
  showTip(e.clientX, e.clientY - 24, valid ? `${valid} Kacheln · ${eur(total)}` : 'Hier nicht möglich', !valid);
  needDraw = true;
}

function updateGhost(t, e) {
  const d = BUILD[tool.id];
  const gx = t[0] - Math.floor((d.w - 1) / 2), gy = t[1] - Math.floor((d.h - 1) / 2);
  const why = canPlace(S, tool.id, gx, gy) || (S.money < d.cost ? 'Zu wenig Geld' : '');
  ghost = { key: tool.id, x: gx, y: gy, w: d.w, h: d.h, ok: !why };
  const [, sy] = local(e);
  showTip(e.clientX, Math.max(70, e.clientY - 56), why ? why : `${d.name} · ${eur(d.cost)}`, !!why);
  needDraw = true;
}

cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size >= 2) { // Pinch: Werkzeug abbrechen
    paint = null; sel = null; ghost = null; hideTip(); panning = null;
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    return;
  }
  const mousePan = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2);
  const t = eventTile(e);
  if (mousePan || tool.id === 'hand' || tool.id === 'query') {
    panning = { x: e.clientX, y: e.clientY, moved: 0, mouse: mousePan, t };
    return;
  }
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (isPaintTool()) { paint = { start: t, last: t, cells: [], set: new Set() }; if (!isRectTool()) { paint.set.add(t[1] * N + t[0]); paint.cells.push(t); } updatePaint(t, e); }
  else if (BUILD[tool.id]) updateGhost(t, e);
});
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) { // Maus-Hover
    if (e.pointerType === 'mouse') {
      const t = eventTile(e); hover = inb(t[0], t[1]) ? t : null;
      if (BUILD[tool.id]) updateGhost(t, e);
      else if (isPaintTool() && !paint && hover) { const c = toolCost(S, tool.id, t[0], t[1]); showTip(e.clientX, e.clientY - 24, c >= 0 ? (c ? eur(c) : 'frei') : 'nicht möglich', c < 0); sel = [[t[0], t[1], c >= 0]]; }
      else if (hover) { const info = tileInfo(S, hover[0], hover[1]); if (info) showTip(e.clientX, e.clientY - 24, info.title); }
      needDraw = true;
    }
    return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const r = cv.getBoundingClientRect();
    panBy(mx - pinch.mx, my - pinch.my); zoomAt(mx - r.left, my - r.top, d / pinch.d);
    pinch.d = d; pinch.mx = mx; pinch.my = my; return;
  }
  if (panning) { panning.moved += Math.abs(dx) + Math.abs(dy); panBy(dx, dy); return; }
  const t = eventTile(e);
  if (paint) updatePaint(t, e);
  else if (BUILD[tool.id]) updateGhost(t, e);
});
function endPointer(e, cancel) {
  const had = ptrs.delete(e.pointerId);
  if (!had) return;
  if (pinch) { if (ptrs.size < 2) pinch = null; return; }
  if (panning) {
    const pn = panning; panning = null;
    if (!cancel && pn.moved < 8 && !pn.mouse) { const t = eventTile(e); if (inb(t[0], t[1])) queryTile(t[0], t[1]); }
    return;
  }
  if (paint && !cancel) commitPaint();
  else if (ghost && !cancel && BUILD[tool.id]) commitGhost(e);
  paint = null; sel = null; if (e.pointerType !== 'mouse') { ghost = null; hideTip(); } needDraw = true;
}
cv.addEventListener('pointerup', (e) => endPointer(e, false));
cv.addEventListener('pointercancel', (e) => endPointer(e, true));
cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !ptrs.size) { hover = null; hideTip(); if (!paint) { sel = null; ghost = null; } needDraw = true; } });
cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

function commitPaint() {
  let total = 0, n = 0, stopped = false;
  for (const [x, y] of paint.cells) {
    const r = applyTool(S, tool.id, x, y);
    if (r === -2) { stopped = true; break; }
    if (r >= 0) { total += r; n++; }
  }
  hideTip();
  if (stopped) toast('Das Geld reicht nicht weiter.');
  else if (n) toast(`${n} Kacheln · ${eur(total)}`, 1400);
  if (S.dirty) { refresh(S); hud(); }
}
function commitGhost(e) {
  const g = ghost; if (!g.ok) { if (S.money < BUILD[g.key].cost) toast('Zu wenig Geld'); return; }
  const r = placeBuilding(S, g.key, g.x, g.y);
  if (!r.ok) { toast(r.why); return; }
  refresh(S); hud();
  if (BUILD[g.key].unique) { setTool('hand'); toast(`${BUILD[g.key].name} eröffnet!`); }
}
function queryTile(x, y) {
  pick = [x, y]; needDraw = true;
  const info = tileInfo(S, x, y); if (!info) return;
  sheet(info.title, info.lines.map((l) => `<div class="msg">${l}</div>`).join('') + `<button class="btn" id="qClose">OK</button>`);
  $('qClose').onclick = () => { closeSheet(); pick = null; needDraw = true; };
}

// ---------------------------------------------------------------- Tastatur (PC)
window.addEventListener('keydown', (e) => {
  if (!S || !$('sheet').hidden || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  const step = 60;
  if (k === ' ' || k === 'p') { speed = speed ? 0 : 1; e.preventDefault(); }
  else if (k === '1') speed = 1; else if (k === '2') speed = 2; else if (k === '3') speed = 3;
  else if (k === 'escape') { setTool('hand'); cat = null; renderCats(); renderItems(); }
  else if (k === 'h') setTool('hand'); else if (k === 'q') setTool('query'); else if (k === 'b') setTool('bulldoze'); else if (k === 'r') setTool('road');
  else if (k === 'w' || k === 'arrowup') panBy(0, step); else if (k === 's' || k === 'arrowdown') panBy(0, -step);
  else if (k === 'a' || k === 'arrowleft') panBy(step, 0); else if (k === 'd' || k === 'arrowright') panBy(-step, 0);
  else if (k === '+' || k === '=') zoomAt(R.w / 2, R.h / 2, 1.2); else if (k === '-') zoomAt(R.w / 2, R.h / 2, 1 / 1.2);
  else if (k === 'o') cycleOverlay();
  else return;
  hud(); needDraw = true;
});
$('bZin').onclick = () => zoomAt(R.w / 2, R.h / 2, 1.25);
$('bZout').onclick = () => zoomAt(R.w / 2, R.h / 2, 0.8);

// ---------------------------------------------------------------- Ansichten / Rat / Menü
function cycleOverlay() {
  const i = OVERLAYS.findIndex((o) => o.id === overlay);
  overlay = OVERLAYS[(i + 1) % OVERLAYS.length].id; ui.overlay = overlay;
  toast('Ansicht: ' + OVERLAYS.find((o) => o.id === overlay).name); needDraw = true;
}
$('bOverlay').onclick = () => {
  sheet('Kartenansicht', OVERLAYS.map((o) => `<button class="btn ${o.id === overlay ? 'pri' : ''}" data-o="${o.id}">${o.name}</button>`).join(''));
  $('sBody').onclick = (e) => { const b = e.target.closest('[data-o]'); if (!b) return; overlay = b.dataset.o; ui.overlay = overlay; closeSheet(); needDraw = true; };
};

function councilHtml() {
  const st = S.stats, f = S.fin, p = f.parts;
  const cl = (v) => (v >= 0 ? 'pos' : 'neg');
  const rate = (k, label) => `<div class="sl"><span>${label}</span><input type="range" min="0" max="20" value="${S.rates[k]}" data-r="${k}"><b id="rv${k}">${S.rates[k]} %</b></div>`;
  const names = { tax: 'Steuern', crime: 'Kriminalität', pol: 'Umwelt', traffic: 'Verkehr', health: 'Gesundheit', edu: 'Bildung', police: 'Polizei', fire: 'Feuerwehr', park: 'Grünflächen', landmark: 'Wahrzeichen', jobs: 'Arbeitslosigkeit', power: 'Strom' };
  return `
    <h3 class="sec">Haushalt (pro Monat)</h3>
    <div class="kv">
      <span>Einnahmen Wohnen</span><span>${eur(p.tR || 0)}</span><span>Einnahmen Gewerbe</span><span>${eur(p.tC || 0)}</span>
      <span>Einnahmen Industrie</span><span>${eur(p.tI || 0)}</span><span>Einnahmen Banken</span><span>${eur(p.tB || 0)}</span><span>Tourismus</span><span>${eur(p.tour || 0)}</span>
      <span>Unterhalt Gebäude</span><span>−${eur(p.up || 0)}</span><span>Unterhalt Straßen</span><span>−${eur(p.roads || 0)}</span><span>Kreditzinsen</span><span>−${eur(p.interest || 0)}</span>
      <span><b>Bilanz</b></span><span class="${cl(f.net)}"><b>${f.net >= 0 ? '+' : ''}${eur(f.net)}</b></span>
    </div>
    <h3 class="sec">Steuersätze</h3>${rate('r', 'Wohnen')}${rate('c', 'Gewerbe/Banken')}${rate('i', 'Industrie')}
    <h3 class="sec">Kredit</h3>
    <div class="kv"><span>Schulden</span><span>${eur(S.loan)}</span></div>
    <button class="btn small" id="bLoan">+10.000 € leihen</button><button class="btn small" id="bRepay">10.000 € tilgen</button>
    <h3 class="sec">Zufriedenheit: ${Math.round(st.happy)} / 100</h3>
    <div class="kv">${Object.entries(st.parts).filter(([, v]) => Math.abs(v) >= 0.5).map(([k, v]) => `<span>${names[k]}</span><span class="${cl(v)}">${v >= 0 ? '+' : ''}${v.toFixed(1)}</span>`).join('') || '<span>Alles neutral</span><span></span>'}</div>
    <h3 class="sec">Stadt</h3>
    <div class="kv"><span>Einwohner</span><span>${fmt(st.pop)}</span><span>Arbeitsplätze</span><span>${fmt(st.jobs)} (davon Banken ${fmt(st.jobsB)})</span><span>Arbeitslosigkeit</span><span>${Math.round(st.unemp * 100)} %</span>
    <span>Strom</span><span>${fmt(S.powerCap)} / ${fmt(S.powerLoad)}</span><span>Grundwert Ø</span><span>${Math.round(st.value)}</span><span>Stau</span><span>${Math.round(st.cong * 100)} %</span></div>
    <h3 class="sec">Nachrichten</h3>${S.msgs.slice(-14).reverse().map((m) => `<div class="msg ${m.kind}"><small>${MONTHS[m.m]} ${m.y}</small>${m.text}</div>`).join('')}`;
}
$('bCouncil').onclick = () => {
  sheet('Stadtrat', councilHtml());
  const body = $('sBody');
  body.oninput = (e) => { const r = e.target.dataset.r; if (r) { S.rates[r] = Number(e.target.value); $('rv' + r).textContent = S.rates[r] + ' %'; } };
  body.onclick = (e) => {
    if (e.target.id === 'bLoan') { if (!takeLoan(S)) toast('Mehr Kredit gibt es nicht.'); body.innerHTML = councilHtml(); hud(); }
    if (e.target.id === 'bRepay') { if (!repayLoan(S)) toast('Nicht möglich (Geld oder Schulden).'); body.innerHTML = councilHtml(); hud(); }
  };
};

// ---------------------------------------------------------------- Speichern / Laden / Menü
async function saveNow(manual) {
  if (!S || !slot || saving) return;
  saving = true;
  try { const r = await saveSlot(slot, S); lastSaveMsg = r === 'beide' ? 'Gespeichert (Gerät + Webspace)' : 'Gespeichert (nur Gerät – Webspace nicht erreichbar)'; if (manual) toast(lastSaveMsg, 3200); }
  catch (err) { toast('Speichern fehlgeschlagen: ' + err.message); }
  saving = false;
}

function slotRow(info) {
  const m = info.local, r = info.remote;
  const best = m && r ? (r.savedAt > m.savedAt ? r : m) : m || r;
  const when = (x) => new Date(x.savedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  const state = r === undefined ? '' : r ? (m && m.savedAt >= r.savedAt ? ' ☁ gesichert' : ' ☁ neuer online') : ' (nicht online)';
  return `<div class="slot"><h3>Platz ${info.slot}${best ? ' – ' + best.name : ''}</h3>
    <p>${best ? `${MONTHS[best.month]} ${best.year} · 👥 ${fmt(best.pop)} · ${eur(best.money)}<br>${when(best)}${state}` : 'Leer'}</p>
    <div class="acts">${best ? `<button class="btn" data-load="${info.slot}">Laden</button>` : ''}<button class="btn pri" data-new="${info.slot}">Neue Stadt</button>${best ? `<button class="btn dng" data-del="${info.slot}">✕</button>` : ''}</div></div>`;
}

async function openMenu(first) {
  const base = (rows) => `<div class="title"><h1>SIMFURT</h1><p>Die Städtebau-Simulation am Main</p></div>
    ${S && !first ? `<button class="btn pri" id="mResume">Weiterspielen</button><button class="btn" id="mSave">💾 Jetzt speichern${slot ? ' (Platz ' + slot + ')' : ''}</button>` : ''}
    <h3 class="sec">Spielstände</h3>${rows}
    <div class="chk"><input type="checkbox" id="mDis" ${S ? (S.disasters ? 'checked' : '') : 'checked'}><label for="mDis">Katastrophen (Feuer, Hochwasser)</label></div>
    <details class="slot"><summary><b>So geht's</b></summary><p style="margin-top:8px">1. <b>Straße</b> ziehen · 2. <b>Zonen</b> (Wohnen, Gewerbe, Industrie) als Rechteck neben die Straße · 3. <b>Gaskraftwerk</b> bauen · 4. Zeit läuft: die Stadt wächst nach Nachfrage (Balken oben). Später Polizei, Feuerwehr, Schulen, Parks, U-Bahn und Wahrzeichen. Banken und Skyline gibt es ab 3.000 Einwohnern. Steuern und Kredit im <b>Rat</b>.</p></details>
    <p style="color:var(--muted);font-size:12px">Gespeichert wird auf dem Gerät und – wenn online – auf Daniels Webspace. Tipp: Zwei Finger = Karte verschieben/zoomen, Maus: rechte Taste ziehen, Rad = Zoom.</p>`;
  sheet(first ? 'Willkommen' : 'Menü', base('<p style="color:var(--muted)">Lade …</p>'));
  bindMenu();
  const show = (infos) => { if ($('sheet').hidden || $('sTitle').textContent === 'Neue Stadt') return; $('sBody').innerHTML = base(infos.map(slotRow).join('')); bindMenu(); };
  const loc = await listSlots(false); show(loc.map((i) => ({ ...i, remote: undefined })));
  show(await listSlots(true));
}
function bindMenu() {
  const b = $('sBody');
  b.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'mResume') closeSheet();
    else if (t.id === 'mSave') { await saveNow(true); openMenu(); }
    else if (t.dataset.load) { t.textContent = 'Lade …'; await startLoad(Number(t.dataset.load)); }
    else if (t.dataset.new) newGameDialog(Number(t.dataset.new));
    else if (t.dataset.del) { if (confirm('Diesen Spielstand wirklich löschen (auch online)?')) { await deleteSlot(Number(t.dataset.del)); if (slot === Number(t.dataset.del)) slot = 0; openMenu(); } }
  };
  b.onchange = (e) => { if (e.target.id === 'mDis' && S) S.disasters = e.target.checked; };
}
async function startLoad(n) {
  try {
    const r = await loadSlot(n);
    if (!r) { toast('Kein Spielstand'); return; }
    startGame(r.state, n); toast(`Geladen (${r.source})`);
  } catch (err) { toast('Laden fehlgeschlagen: ' + err.message, 4000); }
}
function newGameDialog(n) {
  const name = CITY_NAMES[Math.floor(Math.random() * CITY_NAMES.length)];
  sheet('Neue Stadt', `<p>Dein Main fließt irgendwo durch die Karte. Platz ${n} wird überschrieben.</p>
    <input type="text" id="nName" value="${name}" maxlength="24"><div class="chk" style="margin-top:10px"><input type="checkbox" id="nDis" checked><label for="nDis">Katastrophen</label></div>
    <button class="btn pri" id="nGo">Los geht's – ${eur(START_MONEY)} Startkapital</button><button class="btn" id="nBack">Zurück</button>`);
  $('nBack').onclick = () => openMenu(!S);
  $('nGo').onclick = () => {
    const s = newCity({ name: $('nName').value.trim() || 'Simfurt', seed: (Math.random() * 1e9) | 0 });
    s.disasters = $('nDis').checked;
    startGame(s, n); saveNow(false);
  };
}
function startGame(s, n) {
  S = s; slot = n; S.onMsg = ticker; S.onMilestone = () => { renderItems(); };
  closeSheet(); renderCats(); renderItems(); speed = 1; lastHud = ''; hud();
  // Kamera: Mitte der Karte
  R.centerOn(N / 2, N / 2); R.cam.z = Math.min(1, Math.max(0.55, R.w / 560)); R.clampCam();
  R.cars = []; needDraw = true;
  try { localStorage.setItem('simfurt-last', String(n)); } catch { /* egal */ }
  layoutFab();
}
$('bMenu').onclick = () => openMenu();

// ---------------------------------------------------------------- Autos (reine Optik)
const CAR_COLORS = ['#e63946', '#f1faee', '#ffb703', '#4a8df0', '#2a9d8f', '#cfd3d8', '#222'];
function stepCars(dt) {
  if (!S) return;
  const want = Math.min(70, Math.round(S.stats.roads * 0.22 + S.stats.pop / 180));
  while (R.cars.length < want) {
    const i = Math.floor(Math.random() * N * N); if (!S.road[i] || S.terrain[i] === 1) continue;
    const x = i % N, y = (i / N) | 0; R.cars.push({ x, y, nx: x, ny: y, pos: 1, color: CAR_COLORS[R.cars.length % CAR_COLORS.length], sp: 1.4 + Math.random() * 1.2, px: x, py: y });
  }
  if (R.cars.length > want) R.cars.length = want;
  for (const c of R.cars) {
    c.pos += dt * c.sp;
    while (c.pos >= 1) {
      c.pos -= 1; const ox = c.x, oy = c.y; c.x = c.nx; c.y = c.ny;
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => roadAt(S, c.x + dx, c.y + dy) && !(c.x + dx === ox && c.y + dy === oy));
      if (!roadAt(S, c.x, c.y)) { // Straße abgerissen: Auto neu setzen
        c.x = c.nx = c.ny = c.y = 0; R.cars.splice(R.cars.indexOf(c), 1); break;
      }
      if (!opts.length) { c.nx = ox; c.ny = oy; } else { const [dx, dy] = opts[Math.floor(Math.random() * opts.length)]; c.nx = c.x + dx; c.ny = c.y + dy; }
    }
  }
}

// ---------------------------------------------------------------- Hauptschleife
function frame(now) {
  const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  if (S) {
    if (speed && $('sheet').hidden) {
      acc += dt * 1000;
      const step = SPEEDMS[speed];
      let n = 0;
      while (acc >= step && n < 4) { acc -= step; tick(S); n++; if (S.month === 0) saveNow(false); }
      if (n) { hud(); if (cat) renderItems(); needDraw = true; }
    }
    stepCars(dt);
    ui.time = now; ui.overlay = overlay; ui.ghost = ghost; ui.sel = sel; ui.pick = pick; ui.hover = hover;
    R.draw(S, ui);
  }
  requestAnimationFrame(frame);
}

function fit() { R.resize(); layoutFab(); needDraw = true; }
window.addEventListener('resize', fit);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(false); });
window.addEventListener('pagehide', () => saveNow(false));

// ---------------------------------------------------------------- Start
fit();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
(async function boot() {
  S = newCity({ name: 'Simfurt', seed: 7 }); // Hintergrund fürs Menü
  R.centerOn(N / 2, N / 2); R.cam.z = 0.6; renderCats(); hud();
  requestAnimationFrame(frame);
  const last = Number((() => { try { return localStorage.getItem('simfurt-last'); } catch { return 0; } })());
  if (last && SLOTS.includes(last)) { toast('Lade letzten Stand …'); await startLoad(last); if (slot === last) return; }
  S.stats.pop = 0; openMenu(true);
  document.title = 'Simfurt';
})();
window.__simfurt = { get S() { return S; }, R, setTool, startGame, newCity };
