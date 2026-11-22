// Schiffe versenken – Oberfläche: Hafen (hosten/beitreten) → Aufstellen → Gefecht. Der Server ist die Autorität.
const $ = (sel) => document.querySelector(sel);
const POLL_ROOM = 1000, POLL_LIST = 2500;

let S = null;           // letzter Raumzustand
let rooms = null;       // offene Räume {rooms, running}
let online = true;
let busy = false;
let timer = null;
let renderKey = '';
let lastSeq = -1;
let lastTurnMine = false;

const enemyView = new BoardView(document.createElement('canvas'), 'enemy');
const ownView = new BoardView(document.createElement('canvas'), 'own');
const placeView = new BoardView(document.createElement('canvas'), 'own');
const heroCanvas = document.createElement('canvas');
for (const v of [enemyView, ownView, placeView]) v.onImpact = (e) => Sound.play(e.res);

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else e[k] = v;
  }
  for (const kid of kids) if (kid != null && kid !== false) e.append(kid);
  return e;
}
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}
function showModal(content, cls = '') { const m = $('#modal'); m.replaceChildren(el('div', { class: 'dialog ' + cls }, ...content)); m.hidden = false; }
function hideModal() { $('#modal').hidden = true; delete $('#modal').dataset.keep; }
const inRoom = () => !!store.get('room');
const myName = () => store.get('name');

function leaveLocal() {
  store.del('room'); store.del('token');
  S = null; lastSeq = -1; renderKey = ''; place.round = -1;
  hideModal();
}

async function act(body) {
  if (busy) return null;
  busy = true;
  try {
    const data = await apiCall(body);
    online = true;
    if (data.error) toast(data.error);
    if (body.action === 'leave' || data.status === 404 || data.phase === 'gone') leaveLocal();
    else if (data.room && data.you >= 0) { store.set('room', data.room); S = data; }
    renderKey = '';
    render();
    return data;
  } catch (e) {
    online = false;
    toast('Keine Verbindung zum Server');
    render();
    return null;
  } finally {
    busy = false;
  }
}

async function poll() {
  clearTimeout(timer);
  if (!document.hidden && !busy) {
    try {
      if (inRoom()) {
        const data = await apiCall(null, '?room=' + encodeURIComponent(store.get('room')));
        online = true;
        if (data.status === 404 || data.phase === 'gone' || (data.room && data.you < 0)) {
          if (S) toast(data.error || 'Das Spiel ist vorbei');
          leaveLocal();
        } else if (data.room) S = data;
      } else {
        rooms = await apiCall(null, '?list=1');
        online = true;
      }
    } catch (e) { online = false; }
    render();
  }
  timer = setTimeout(poll, inRoom() ? POLL_ROOM : POLL_LIST);
}

/* ---------- Hafen: hosten / beitreten ---------- */
function renderHome() {
  const name = el('input', { id: 'name', value: myName(), maxLength: 16, placeholder: 'Dein Name', autocomplete: 'off', enterKeyHint: 'done' });
  name.addEventListener('input', () => store.set('name', name.value.trim()));
  const needName = () => {
    const n = name.value.trim();
    if (!n) { toast('Bitte erst einen Namen eingeben'); name.focus(); return null; }
    store.set('name', n);
    return n;
  };
  const list = el('div', { class: 'rooms' });
  if (!rooms) list.append(el('div', { class: 'hint' }, online ? 'Suche offene Spiele …' : 'Keine Verbindung zum Server.'));
  else if (!rooms.rooms || !rooms.rooms.length) list.append(el('div', { class: 'empty' }, '🌊 Gerade wartet niemand. Hoste ein Spiel – wer die Seite öffnet, sieht es hier.'));
  else for (const r of rooms.rooms) {
    list.append(el('button', { class: 'room', onclick: () => { const n = needName(); if (n) act({ action: 'join', room: r.room, name: n }); } },
      el('span', { class: 'flag' }, '⚓'),
      el('span', { class: 'rname' }, el('b', {}, r.host), el('small', {}, 'wartet seit ' + ago(r.since))),
      el('span', { class: 'go' }, 'Beitreten ›')));
  }
  const running = rooms && rooms.running ? el('div', { class: 'hint' }, `⚔️ ${rooms.running} Gefecht${rooms.running > 1 ? 'e' : ''} läuft gerade`) : null;
  $('#screen').replaceChildren(el('div', { class: 'home' },
    el('div', { class: 'hero' }, heroCanvas, el('h1', {}, el('span', {}, 'Schiffe'), el('span', {}, 'versenken'))),
    el('label', { class: 'field' }, 'Dein Name', name),
    el('button', { class: 'primary big', onclick: () => { const n = needName(); if (n) act({ action: 'host', name: n }); } }, '⚓ Spiel hosten'),
    el('h3', {}, 'Offene Spiele'),
    list, running));
  sizeHero();
}
function ago(s) { return s < 60 ? 'gerade eben' : s < 3600 ? Math.floor(s / 60) + ' min' : Math.floor(s / 3600) + ' h'; }
function sizeHero() {
  const w = Math.min($('#screen').clientWidth - 32, 480);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  heroCanvas.style.width = w + 'px'; heroCanvas.style.height = w * 0.5 + 'px';
  heroCanvas.width = w * dpr; heroCanvas.height = w * 0.5 * dpr;
}
function drawHero(t) {
  const ctx = heroCanvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = heroCanvas.width / dpr, h = heroCanvas.height / dpr;
  if (!w) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save(); roundRect(ctx, 0, 0, w, h, 18); ctx.clip();
  drawSea(ctx, 0, 0, w, h, t, 'own');
  const c = h / 4.6;
  const x1 = ((t * 14) % (w + 6 * c)) - 5 * c;
  drawShip(ctx, 1, 4, 'h', x1, h * 0.5, c, t, { wake: true });
  const x2 = w - (((t * 22) + w * 0.5) % (w + 5 * c));
  ctx.save(); ctx.translate(x2, h * 0.84); ctx.scale(-1, 1); drawShip(ctx, 4, 2, 'h', 0, -c * 0.45, c * 0.9, t, { wake: true }); ctx.restore();
  const x3 = ((t * 9 + w * 0.6) % (w + 4 * c)) - 3 * c;
  drawShip(ctx, 3, 3, 'h', x3, h * 0.72, c * 0.8, t, { wake: true });
  ctx.restore();
}

/* ---------- Warten auf Gegner ---------- */
function renderWaiting() {
  const p = S.players[0];
  $('#screen').replaceChildren(el('div', { class: 'center' },
    el('div', { class: 'radar' }, el('i'), el('b', {}, '⚓')),
    el('h2', {}, 'Warte auf einen Gegner …'),
    el('div', { class: 'hint' }, 'Dein Spiel steht jetzt in der Liste „Offene Spiele“. Wer Schiffe versenken öffnet, kann beitreten.'),
    el('div', { class: 'code' }, 'Kapitän ', el('b', {}, p ? p.name : myName()), p && p.score ? ' · ' + p.score + ' Siege' : ''),
    el('button', { class: 'danger', onclick: () => act({ action: 'leave', room: S.room }) }, 'Abbrechen')));
}

/* ---------- Aufstellen ---------- */
const place = { round: -1, ships: [], sel: -1, drag: null };

function validate(ships) {
  const bad = new Set();
  const occ = new Array(SIZE * SIZE).fill(-1);
  ships.forEach((s, i) => {
    for (const [x, y] of cellsOf(s)) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) { bad.add(i); continue; }
      occ[y * SIZE + x] = occ[y * SIZE + x] === -1 ? i : -2;
    }
  });
  ships.forEach((s, i) => {
    for (const [x, y] of cellsOf(s)) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const o = occ[ny * SIZE + nx];
      if (o !== -1 && o !== i) { bad.add(i); if (o >= 0) bad.add(o); }
    }
  });
  return bad;
}
function randomFleet() {
  for (let tries = 0; tries < 2000; tries++) {
    const ships = [];
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let k = 0; k < 80 && !placed; k++) {
        const dir = Math.random() < 0.5 ? 'h' : 'v';
        const s = { x: Math.floor(Math.random() * (SIZE - (dir === 'h' ? len - 1 : 0))), y: Math.floor(Math.random() * (SIZE - (dir === 'v' ? len - 1 : 0))), len, dir };
        if (!validate([...ships, s]).size) { ships.push(s); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  return null;
}
function clampShip(s) {
  s.x = Math.max(0, Math.min(SIZE - (s.dir === 'h' ? s.len : 1), s.x));
  s.y = Math.max(0, Math.min(SIZE - (s.dir === 'v' ? s.len : 1), s.y));
  return s;
}
function shipIndexAt(ships, x, y) { return ships.findIndex((s) => cellsOf(s).some(([cx, cy]) => cx === x && cy === y)); }
function rotateSel() {
  const i = place.sel;
  if (i < 0) { toast('Erst ein Schiff antippen'); return; }
  const s = place.ships[i];
  const n = clampShip({ ...s, dir: s.dir === 'h' ? 'v' : 'h' });
  const test = place.ships.map((o, k) => (k === i ? n : o));
  if (validate(test).has(i)) {
    // anderen Drehpunkt probieren: entlang der neuen Achse verschieben
    for (let d = 1; d < s.len; d++) for (const sign of [-1, 1]) {
      const m = clampShip({ ...n, x: n.x + (n.dir === 'h' ? sign * d : 0), y: n.y + (n.dir === 'v' ? sign * d : 0) });
      const t2 = place.ships.map((o, k) => (k === i ? m : o));
      if (!validate(t2).has(i)) { place.ships[i] = m; syncPlace(); return; }
    }
    toast('Kein Platz zum Drehen'); return;
  }
  place.ships[i] = n;
  syncPlace();
}
function syncPlace() {
  const bad = validate(place.ships);
  placeView.ships = place.ships.map((s, i) => ({ ...s, type: i, sel: i === place.sel, bad: bad.has(i), alpha: place.drag && place.drag.i === i ? 0.85 : 1 }));
  placeView.grid = new Array(SIZE * SIZE).fill(0);
  document.querySelectorAll('.shipbar .sb').forEach((b, i) => b.classList.toggle('sel', i === place.sel));
}
function cellFromEvent(view, ev, clamp) {
  const r = view.canvas.getBoundingClientRect();
  let x = Math.floor((ev.clientX - r.left - view.o) / view.c), y = Math.floor((ev.clientY - r.top - view.o) / view.c);
  if (clamp) { x = Math.max(0, Math.min(SIZE - 1, x)); y = Math.max(0, Math.min(SIZE - 1, y)); }
  else if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  return { x, y };
}
placeView.canvas.addEventListener('pointerdown', (ev) => {
  if (!S || S.phase !== 'placing' || isReady()) return;
  Sound.unlock();
  const cell = cellFromEvent(placeView, ev);
  if (!cell) return;
  const i = shipIndexAt(place.ships, cell.x, cell.y);
  if (i < 0) {
    if (place.sel >= 0) { // ausgewähltes Schiff hierher setzen
      const s = clampShip({ ...place.ships[place.sel], x: cell.x, y: cell.y });
      const test = place.ships.map((o, k) => (k === place.sel ? s : o));
      if (validate(test).has(place.sel)) toast('Dort ist kein Platz'); else { place.ships[place.sel] = s; syncPlace(); }
    }
    return;
  }
  const s = place.ships[i];
  place.drag = { i, grab: s.dir === 'h' ? cell.x - s.x : cell.y - s.y, orig: { ...s }, moved: false, wasSel: place.sel === i };
  place.sel = i;
  placeView.canvas.setPointerCapture(ev.pointerId);
  syncPlace();
});
placeView.canvas.addEventListener('pointermove', (ev) => {
  const d = place.drag;
  if (!d) return;
  const cell = cellFromEvent(placeView, ev, true);
  const s = place.ships[d.i];
  const n = clampShip({ ...s, x: s.dir === 'h' ? cell.x - d.grab : cell.x, y: s.dir === 'v' ? cell.y - d.grab : cell.y });
  if (n.x !== s.x || n.y !== s.y) { place.ships[d.i] = n; d.moved = true; syncPlace(); }
});
function endDrag() {
  const d = place.drag;
  if (!d) return;
  place.drag = null;
  if (!d.moved) { if (d.wasSel) rotateSel(); else syncPlace(); return; }
  if (validate(place.ships).has(d.i)) { place.ships[d.i] = d.orig; toast('Schiffe dürfen sich nicht berühren'); }
  syncPlace();
}
placeView.canvas.addEventListener('pointerup', endDrag);
placeView.canvas.addEventListener('pointercancel', endDrag);

function isReady() { return S && S.you >= 0 && S.players[S.you] && S.players[S.you].ready; }

function renderPlacing() {
  if (place.round !== S.round) {
    place.round = S.round;
    place.sel = -1;
    // Nach einem Neuladen die schon gemeldete Flotte übernehmen
    place.ships = S.me && S.me.ships ? S.me.ships.map((s) => ({ x: s.x, y: s.y, len: s.len, dir: s.dir })) : randomFleet();
  }
  const opp = S.players[1 - S.you];
  const ready = isReady();
  const W = boardSize().place;
  placeView.resize(W);
  syncPlace();
  const bar = el('div', { class: 'shipbar' }, ...FLEET.map((len, i) => el('button', { class: 'sb' + (i === place.sel ? ' sel' : ''), disabled: ready, onclick: () => { place.sel = i; syncPlace(); } },
    shipIcon(i, 13), el('small', {}, SHIP_NAMES[i]))));
  const oppLine = opp ? el('div', { class: 'opp-state' + (opp.ready ? ' ok' : '') }, (opp.online ? '' : '⚠ ') + opp.name + (opp.ready ? ' ist bereit ✔' : ' stellt noch auf …')) : null;
  const actions = ready
    ? el('div', { class: 'row' }, el('div', { class: 'waiting' }, '⏳ Warte auf ' + (opp ? opp.name : 'Gegner') + ' …'), el('button', { onclick: () => act({ action: 'unready', room: S.room }) }, 'Ändern'))
    : el('div', { class: 'row' },
      el('button', { onclick: () => { place.ships = randomFleet(); place.sel = -1; syncPlace(); } }, '🎲 Zufall'),
      el('button', { onclick: rotateSel }, '⟳ Drehen'),
      el('button', { class: 'primary', onclick: () => {
        if (validate(place.ships).size) { toast('Schiffe dürfen sich nicht berühren'); return; }
        place.sel = -1; syncPlace();
        act({ action: 'place', room: S.room, ships: place.ships.map((s) => ({ x: s.x, y: s.y, dir: s.dir })) });
      } }, 'Bereit ⚓'));
  $('#screen').replaceChildren(el('div', { class: 'placing' + (ready ? ' is-ready' : '') },
    el('div', { class: 'title' }, el('h2', {}, 'Flotte aufstellen'), oppLine),
    el('div', { class: 'hint small' }, ready ? 'Deine Flotte ist gemeldet.' : 'Schiff ziehen zum Verschieben · nochmal antippen zum Drehen'),
    el('div', { class: 'boardwrap' }, placeView.canvas),
    bar, actions));
}

/* ---------- Gefecht ---------- */
function boardSize() {
  const sc = $('#screen');
  const W = sc.clientWidth, H = sc.clientHeight;
  const wide = W > H * 1.15;
  if (wide) {
    const e = Math.min(H - 110, (W - 48) * 0.6, 620);
    return { wide, enemy: e, own: Math.min(e * 0.62, W - e - 48), place: Math.min(H - 190, W - 24, 560) };
  }
  const R = H - 172;                     // Platz für Punkte, Banner, Beschriftungen, Abstände
  const e = Math.max(200, Math.min(W - 20, 560, (R - 10) / 1.45));
  const own = Math.max(130, Math.min(W * 0.5, R - e - 10, 300));
  return { wide, enemy: e, own, place: Math.max(220, Math.min(W - 20, H - 220, 560)) };
}

function knownWater() { return enemyView.knownWater(); }

enemyView.canvas.addEventListener('pointerup', (ev) => {
  Sound.unlock();
  if (!S || S.phase !== 'playing' || S.turn !== S.you) return;
  const cell = cellFromEvent(enemyView, ev);
  if (!cell) return;
  const k = cell.y * SIZE + cell.x;
  if (S.enemy.grid[k] !== 0) { toast('Da hast du schon hingeschossen'); return; }
  if (knownWater().has(k)) { toast('Dort kann kein Schiff liegen'); return; }
  const t = enemyView.target;
  if (t && t.x === cell.x && t.y === cell.y) { fire(); return; }
  enemyView.target = cell;
  updateFireBtn();
});
function updateFireBtn() {
  const b = $('#fire');
  if (!b) return;
  const t = enemyView.target;
  b.disabled = !(t && S && S.turn === S.you && S.phase === 'playing');
  b.textContent = t ? '🔥 Feuer auf ' + LETTERS[t.x] + (t.y + 1) : '🔥 Ziel wählen';
}
async function fire() {
  const t = enemyView.target;
  if (!t || busy) return;
  Sound.play('fire');
  enemyView.target = null;
  updateFireBtn();
  await act({ action: 'shoot', room: S.room, x: t.x, y: t.y });
}

function syncBattleViews() {
  const meShips = (S.me && S.me.ships) || [];
  ownView.ships = meShips.map((s, i) => ({ ...s, type: i }));
  ownView.grid = (S.me && S.me.grid) || new Array(SIZE * SIZE).fill(0);
  enemyView.ships = ((S.enemy && S.enemy.ships) || []).map((s) => ({ ...s, type: s.i, sunk: s.sunk, alpha: s.sunk ? 1 : 0.8 }));
  enemyView.grid = (S.enemy && S.enemy.grid) || new Array(SIZE * SIZE).fill(0);
  enemyView.active = S.phase === 'playing' && S.turn === S.you;
  enemyView.dim = S.phase === 'playing';
  if (enemyView.target && enemyView.grid[enemyView.target.y * SIZE + enemyView.target.x] !== 0) enemyView.target = null;
  // neue Schüsse animieren
  const L = S.last;
  if (L && L.seq !== lastSeq) {
    if (lastSeq !== -1 && L.seq > lastSeq) {
      if (L.by === S.you) enemyView.addShot(L.x, L.y, L.res);
      else {
        ownView.addShot(L.x, L.y, L.res);
        if (L.res !== 'miss') { setTimeout(() => { ownView.shake = 1; if (navigator.vibrate) navigator.vibrate(L.res === 'sunk' ? [80, 60, 160] : 70); }, 550); }
      }
    }
    lastSeq = L.seq;
  } else if (!L) lastSeq = 0;
  const mine = S.phase === 'playing' && S.turn === S.you;
  if (mine && !lastTurnMine) Sound.play('turn');
  lastTurnMine = mine;
}

function bannerText(opp) {
  if (S.phase === 'finished') return S.winner === S.you ? ['win', '🏆 Sieg! Die feindliche Flotte ist versenkt'] : ['lose', '💥 Deine Flotte wurde versenkt'];
  if (!opp) return ['wait', 'Gegner fehlt'];
  if (S.turn === S.you) {
    const L = S.last;
    if (L && L.by === S.you && L.res === 'sunk') return ['mine', '💥 Versenkt! Feuer frei'];
    if (L && L.by === S.you && L.res === 'hit') return ['mine', '🔥 Treffer! Nochmal feuern'];
    return ['mine', '🎯 Dein Zug – wähle ein Ziel'];
  }
  return ['theirs', `⏳ ${opp.name} zielt auf deine Flotte${opp.online ? ' …' : ' (offline)'}`];
}

/** Gegnerflotte: versenkte Schiffe sind markiert. */
function fleetStatus(ships) {
  const sunk = new Set((ships || []).filter((s) => s.sunk).map((s) => s.i));
  return el('div', { class: 'fleet' }, ...FLEET.map((len, i) => el('div', { class: 'fl' + (sunk.has(i) ? ' sunk' : ''), title: SHIP_NAMES[i] }, shipIcon(i, 12, sunk.has(i)))));
}

function renderBattle() {
  const me = S.players[S.you], opp = S.players[1 - S.you];
  const size = boardSize();
  enemyView.resize(size.enemy);
  ownView.resize(size.own);
  syncBattleViews();
  const [cls, text] = bannerText(opp);
  const score = el('div', { class: 'scorebar' },
    el('div', { class: 'cap me' + (S.turn === S.you && S.phase === 'playing' ? ' turn' : '') }, el('b', {}, me.name), el('small', {}, `${me.hits}/${me.shots} Treffer`)),
    el('div', { class: 'vs' }, el('b', {}, `${me.score} : ${opp ? opp.score : 0}`), el('small', {}, 'Runde ' + S.round)),
    el('div', { class: 'cap them' + (opp && S.turn !== S.you && S.phase === 'playing' ? ' turn' : '') + (opp && !opp.online ? ' off' : '') }, el('b', {}, opp ? opp.name : '–'), el('small', {}, opp ? `${opp.hits}/${opp.shots} Treffer` : '')));
  const fireBtn = el('button', { id: 'fire', class: 'fire', onclick: fire });
  const side = el('div', { class: 'side' },
    el('div', { class: 'label' }, 'Feindflotte'),
    fleetStatus(S.enemy && S.enemy.ships),
    S.phase === 'playing' ? fireBtn : el('div', { class: 'row col' },
      el('button', { class: 'primary', onclick: () => act({ action: 'rematch', room: S.room }) }, '⟳ Revanche'),
      el('button', { onclick: confirmLeave }, 'Verlassen')));
  $('#screen').replaceChildren(el('div', { class: 'battle' + (size.wide ? ' wide' : '') },
    score,
    el('div', { class: 'banner ' + cls }, text),
    el('div', { class: 'enemy-board' }, el('div', { class: 'label' }, 'Feindgewässer'), enemyView.canvas),
    el('div', { class: 'bottom' },
      el('div', { class: 'own-board' }, el('div', { class: 'label' }, 'Deine Flotte'), ownView.canvas),
      side)));
  updateFireBtn();
  if (S.phase === 'finished' && showResult.round !== S.round) { showResult.round = S.round; setTimeout(showResult, 1400); }
  if (S.phase !== 'finished' && !$('#modal').dataset.keep) hideModal();
}

function showResult() {
  if (!S || S.phase !== 'finished') return;
  const me = S.players[S.you], opp = S.players[1 - S.you];
  const won = S.winner === S.you;
  const rate = (p) => (p.shots ? Math.round(p.hits / p.shots * 100) : 0) + ' %';
  $('#modal').dataset.keep = '1';
  showModal([
    el('div', { class: 'big-emoji' }, won ? '🏆' : '⚓'),
    el('h2', {}, won ? 'Sieg auf hoher See!' : 'Versenkt …'),
    el('div', { class: 'hint' }, won ? `Du hast die Flotte von ${opp.name} versenkt.` : `${opp.name} hat deine Flotte versenkt.`),
    el('table', { class: 'stats' },
      el('tr', {}, el('th', {}), el('th', {}, me.name), el('th', {}, opp.name)),
      el('tr', {}, el('td', {}, 'Siege'), el('td', {}, me.score), el('td', {}, opp.score)),
      el('tr', {}, el('td', {}, 'Schüsse'), el('td', {}, me.shots), el('td', {}, opp.shots)),
      el('tr', {}, el('td', {}, 'Trefferquote'), el('td', {}, rate(me)), el('td', {}, rate(opp)))),
    el('div', { class: 'row' },
      el('button', { class: 'primary', onclick: () => { hideModal(); act({ action: 'rematch', room: S.room }); } }, '⟳ Revanche'),
      el('button', { onclick: () => hideModal() }, 'Bretter ansehen')),
  ], won ? 'win' : 'lose');
}
function confirmLeave() {
  $('#modal').dataset.keep = '1';
  showModal([el('b', {}, 'Spiel verlassen?'), el('div', { class: 'hint' }, 'Dein Gegner kann dann auf einen neuen Mitspieler warten.'), el('div', { class: 'row' },
    el('button', { class: 'danger', onclick: () => { hideModal(); const r = S && S.room; act({ action: 'leave', room: r }); } }, 'Verlassen'),
    el('button', { onclick: hideModal }, 'Bleiben'))]);
}

/* ---------- Chat (auf- und zuklappbar wie bei Fruhno) ---------- */
let chatTimer = null;
let chatPrimed = false;
let lastChatSeen = 0;
function startChatTimer() {
  clearTimeout(chatTimer);
  chatTimer = setTimeout(() => {
    if (document.activeElement === $('#chat-input')) return;
    closeChat();
  }, 4000);
}
function openChat(auto) { $('#chat').classList.add('open'); renderChat(); if (auto) startChatTimer(); else clearTimeout(chatTimer); }
function closeChat() { clearTimeout(chatTimer); $('#chat').classList.remove('open'); renderChat(); }
const chatOpen = () => $('#chat').classList.contains('open');
function renderChat() {
  const btn = $('#btn-chat');
  btn.hidden = !S;
  if (!S) { $('#chat').classList.remove('open'); chatPrimed = false; return; }
  const key = 'chatSeen:' + S.room;
  if (!chatPrimed) lastChatSeen = Number(store.get(key, '0'));
  const me = S.players[S.you] ? S.players[S.you].name : '';
  const fresh = S.chat.filter((m) => m.n > lastChatSeen && m.kind === 'msg' && m.name !== me);
  if (chatPrimed && !chatOpen() && fresh.length) { Sound.play('chat'); openChat(true); return; }
  chatPrimed = true;
  const log = $('#chat-log');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
  log.replaceChildren(...S.chat.map((m) => m.kind === 'act' ? el('p', { class: 'act' }, m.text)
    : m.kind === 'sys' ? el('p', { class: 'sys' }, m.text)
      : el('p', { class: m.name === me ? 'mine' : '' }, el('b', {}, m.name), el('span', {}, m.text))));
  const newest = S.chat.length ? S.chat[S.chat.length - 1].n : 0;
  if (chatOpen()) { lastChatSeen = newest; store.set(key, String(newest)); if (atBottom || renderChat.n !== newest) log.scrollTop = log.scrollHeight; }
  renderChat.n = newest;
  $('#chat-badge').hidden = chatOpen() || !fresh.length;
}

/* ---------- Hauptrender ---------- */
function render() {
  $('#status').textContent = online ? '' : '⚠ offline';
  let key;
  if (!inRoom() || !S) key = 'home|' + JSON.stringify(rooms) + online + (inRoom() ? 'connecting' : '');
  else key = [S.version, S.phase, S.you, S.players.map((p) => p.online + ':' + p.ready).join(), online, window.innerWidth, window.innerHeight].join('|');
  if (key !== renderKey) {
    renderKey = key;
    // Beim Tippen im Namensfeld nicht neu aufbauen
    if (!(document.activeElement && document.activeElement.id === 'name' && (!inRoom() || !S))) {
      if (inRoom() && !S) $('#screen').replaceChildren(el('div', { class: 'center' }, el('div', { class: 'hint' }, online ? 'Verbinde …' : 'Keine Verbindung zum Server.'),
        el('button', { onclick: () => { leaveLocal(); render(); poll(); } }, 'Zurück zum Hafen')));
      else if (!S) renderHome();
      else if (S.phase === 'lobby') renderWaiting();
      else if (S.phase === 'placing') renderPlacing();
      else renderBattle();
    }
  }
  renderChat();
}

function frame(ms) {
  const t = ms / 1000;
  for (const v of [enemyView, ownView, placeView]) if (v.canvas.isConnected) v.draw(t);
  if (heroCanvas.isConnected) drawHero(t);
  requestAnimationFrame(frame);
}

/* ---------- Verdrahtung ---------- */
$('#btn-chat').addEventListener('click', () => { if (chatOpen()) closeChat(); else { openChat(false); setTimeout(() => $('#chat-input').focus(), 50); } });
$('#chat-input').addEventListener('focus', () => clearTimeout(chatTimer));
$('#chat-close').addEventListener('click', closeChat);
document.addEventListener('pointerdown', (ev) => {
  Sound.unlock();
  const c = $('#chat');
  if (chatOpen() && !c.contains(ev.target) && !$('#btn-chat').contains(ev.target)) closeChat();
});
$('#chat-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (text && S) { input.value = ''; act({ action: 'chat', room: S.room, text }); }
});
$('#btn-menu').addEventListener('click', () => {
  $('#modal').dataset.keep = '1';
  const items = [el('h2', {}, 'Menü'),
    el('button', { onclick: () => { Sound.on = !Sound.on; store.set('sound', Sound.on ? '1' : '0'); Sound.unlock(); hideModal(); toast(Sound.on ? '🔊 Ton an' : '🔇 Ton aus'); } }, Sound.on ? '🔇 Ton aus' : '🔊 Ton an')];
  if (S) items.push(el('button', { class: 'danger', onclick: () => { hideModal(); confirmLeave(); } }, 'Spiel verlassen'));
  if (S && S.phase === 'finished') items.push(el('button', { onclick: () => { hideModal(); showResult(); } }, 'Ergebnis zeigen'));
  items.push(el('a', { class: 'btn', href: '../' }, '← Zur Spieleübersicht'));
  items.push(el('button', { onclick: hideModal }, 'Schließen'));
  showModal(items, 'menu');
});
$('#modal').addEventListener('click', (ev) => { if (ev.target === $('#modal') && $('#modal').querySelector('.menu')) hideModal(); });
window.addEventListener('resize', () => { renderKey = ''; render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
poll();
requestAnimationFrame(frame);
