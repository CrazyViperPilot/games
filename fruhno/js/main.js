// Fruhno UI: setup → lobby → table. State comes from the server (polling); the server is the authority.
const NAMES = ['Daniel', 'Lea', 'Kira'];
const $ = (sel) => document.querySelector(sel);
const POLL_MS = 1500;

let S = null;            // last server state
let online = true;
let busy = false;
let lastChatSeen = Number(store.get('chatSeen', '0'));
let lastLog = '';
let timer = null;

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else e[k] = v;
  }
  for (const kid of kids) e.append(kid);
  return e;
}
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 2500);
}
function showModal(content) { const m = $('#modal'); m.replaceChildren(el('div', { class: 'dialog' }, ...content)); m.hidden = false; }
function hideModal() { $('#modal').hidden = true; }
const setupNeeded = () => !NAMES.includes(store.get('name')) || !store.get('key');

async function act(body) {
  if (busy) return;
  busy = true;
  try {
    const data = await apiCall(body);
    if (data.error) {
      if (data.error.includes('Schlüssel')) { store.del('key'); }
      toast(data.error);
    }
    if (data.phase) { S = data; online = true; render(); }
    else if (data.error) render();
  } catch (e) {
    online = false;
    toast('Keine Verbindung');
    render();
  } finally {
    busy = false;
  }
}

async function poll() {
  clearTimeout(timer);
  if (!setupNeeded() && !document.hidden && !busy) {
    try {
      const data = await apiCall();
      if (data.phase) {
        const key = data.version + '|' + data.you + '|' + online + '|' + (data.players || []).map((p) => p.online).join();
        const same = S && key === poll.key;
        poll.key = key; S = data; online = true;
        if (same) { renderChat(); timer = setTimeout(poll, POLL_MS); return; }
      } else if (data.error) { toast(data.error); if (data.error.includes('Schlüssel')) store.del('key'); }
    } catch (e) { online = false; poll.key = ''; }
    render();
  }
  timer = setTimeout(poll, POLL_MS);
}

/* ---------- screens ---------- */
function renderSetup() {
  let chosen = store.get('name');
  const key = el('input', { type: 'password', value: store.get('key'), placeholder: 'Schlüssel', autocomplete: 'off' });
  const server = el('input', { type: 'url', value: store.get('server', DEFAULT_SERVER) });
  const btns = NAMES.map((n) => el('button', { class: 'namebtn' + (n === chosen ? ' sel' : ''), onclick: (ev) => {
    chosen = n; btns.forEach((b) => b.classList.toggle('sel', b === ev.currentTarget));
  } }, n));
  const go = el('button', { class: 'primary', onclick: () => {
    if (!NAMES.includes(chosen) || !key.value.trim()) { toast('Name und Schlüssel nötig'); return; }
    if (chosen !== store.get('name')) store.del('token');
    store.set('name', chosen); store.set('key', key.value.trim()); store.set('server', server.value.trim() || DEFAULT_SERVER);
    S = null; render(); poll();
  } }, 'Los geht’s');
  $('#screen').replaceChildren(el('div', { class: 'center' },
    el('h1', {}, 'Fruhno'),
    el('div', { class: 'hint' }, 'UNO zum Frühstück. Wer bist du?'),
    el('div', { class: 'row' }, ...btns),
    el('label', {}, 'Schlüssel', key),
    el('label', {}, 'Server', server),
    go));
}

function playersRow(withScores) {
  return el('div', { class: 'plist' }, ...S.players.map((p) => el('div', { class: 'pl' + (p.online ? '' : ' off') },
    el('b', {}, (p.bot ? '🤖 ' : '') + p.name + (p.name === S.host ? ' 👑' : '')),
    el('small', {}, withScores ? p.score + ' Punkte' : (p.online ? 'bereit' : 'offline')))));
}

function renderLobby() {
  const me = S.you, isHost = S.host === store.get('name'), joined = !!me;
  const kids = [el('h1', {}, S.phase === 'none' ? 'Kein Spiel' : S.host + ' hostet')];
  if (S.phase === 'none') {
    kids.push(el('div', { class: 'hint' }, 'Gerade läuft nichts. Hoste ein Spiel, die anderen können dann beitreten.'));
    kids.push(el('button', { class: 'primary', onclick: () => act({ action: 'host' }) }, 'Spiel hosten'));
  } else {
    kids.push(playersRow(false));
    if (!joined) {
      kids.push(el('button', { class: 'primary', disabled: S.players.length >= 3, onclick: () => act({ action: 'join' }) }, 'Beitreten'));
    } else {
      const row = [];
      if (isHost) {
        row.push(el('button', { class: 'primary', disabled: S.players.length < 2, onclick: () => act({ action: 'start' }) }, 'Runde starten'));
        if (S.players.some((p) => p.bot)) row.push(el('button', { onclick: () => act({ action: 'removebot' }) }, 'Bot entfernen'));
        else row.push(el('button', { disabled: S.players.length >= 3, onclick: () => act({ action: 'addbot' }) }, '🤖 Bot dazu'));
        row.push(el('button', { class: 'danger', onclick: () => act({ action: 'end' }) }, 'Beenden'));
      } else {
        row.push(el('button', { class: 'danger', onclick: () => act({ action: 'leave' }) }, 'Verlassen'));
        kids.push(el('div', { class: 'hint' }, 'Warte, bis ' + S.host + ' die Runde startet …'));
      }
      kids.push(el('div', { class: 'row' }, ...row));
      if (isHost && S.players.length < 2) kids.push(el('div', { class: 'hint' }, 'Ab 2 Spielern geht es los (oder mit Bot).'));
    }
  }
  $('#screen').replaceChildren(el('div', { class: 'center' }, ...kids));
}

function turnMessage(g) {
  const mine = g.turn === S.you;
  if (S.phase === 'finished') return '';
  if (mine && g.drawn !== null) return 'Gezogene Karte legen oder passen';
  if (mine) return g.playable.length ? 'Du bist dran' : 'Du bist dran – zieh eine Karte';
  return g.turn + ' ist dran';
}

function renderTable() {
  const g = S.game, me = S.you, isHost = S.host === me;
  const mine = g.turn === me && S.phase === 'playing';
  const opps = S.players.filter((p) => p.name !== me);
  const oppRow = el('div', { class: 'opps' }, ...opps.map((p) => el('div', { class: 'opp' + (g.turn === p.name && S.phase === 'playing' ? ' turn' : '') + (p.online ? '' : ' off') },
    el('b', {}, (p.bot ? '🤖 ' : '') + p.name), el('small', {}, p.cards + ' Karten · ' + p.score + ' P'),
    el('div', { class: 'mini' }, ...Array.from({ length: Math.min(p.cards, 14) }, () => el('i'))))));

  const canDraw = mine && g.drawn === null;
  const drawPile = el('div', { class: 'pile' + (canDraw ? ' can' : ''), onclick: () => canDraw && act({ action: 'draw' }) },
    el('div', { class: 'back' }, '🥞'), el('small', {}, g.drawCount + ' Karten'));
  const topPile = el('div', { class: 'pile top' }, renderCard(g.top));
  const colorBadge = el('div', { class: 'colorbadge', style: 'background:' + COLORS[g.color].css }, COLORS[g.color].name);
  const middle = el('div', { class: 'middle' }, drawPile, topPile, el('div', {}, colorBadge, el('div', { class: 'dir' }, g.dir === 1 ? '↻' : '↺')));

  const hand = el('div', { class: 'hand' });
  (g.hand || []).forEach((card, i) => {
    const ok = mine && g.playable.includes(i);
    const c = renderCard(card, { playable: mine ? ok : undefined });
    if (g.drawn === i) c.classList.add('drawn');
    if (ok) c.addEventListener('click', () => playCard(i, card));
    hand.append(c);
  });

  const actions = el('div', { class: 'actions' });
  if (S.phase === 'playing') {
    if (mine && g.drawn !== null) actions.append(el('button', { onclick: () => act({ action: 'pass' }) }, 'Passen'));
    if ((g.hand || []).length <= 2 && (g.hand || []).length > 0 && !(g.uno && g.uno.name === me && g.uno.called)) {
      actions.append(el('button', { class: 'fruhno', onclick: () => act({ action: 'fruhno' }) }, 'Fruhno!'));
    }
    if (g.uno && g.uno.name !== me && !g.uno.called) {
      actions.append(el('button', { class: 'danger', onclick: () => act({ action: 'catch' }) }, 'Erwischt! ' + g.uno.name));
    }
    if (isHost) {
      if (!mine) actions.append(el('button', { onclick: () => act({ action: 'skip' }) }, 'Überspringen'));
      actions.append(el('button', { class: 'danger', onclick: () => confirmEnd() }, 'Beenden'));
    } else {
      actions.append(el('button', { onclick: () => confirmLeave() }, 'Verlassen'));
    }
  }
  const msg = el('div', { class: 'msg' }, turnMessage(g) || (S.log[S.log.length - 1] || ''));
  const mePanel = el('div', { class: 'me' + (mine ? ' turn' : '') }, msg, hand, actions);
  $('#screen').replaceChildren(el('div', { class: 'table' }, oppRow, middle, mePanel));
  if (S.phase === 'finished') showResult();
  else if (!$('#modal').dataset.keep) hideModal();
}

function playCard(index, card) {
  if (card[0] === 4) {
    $('#modal').dataset.keep = '1';
    showModal([el('b', {}, 'Welche Farbe?'), el('div', { class: 'colors' }, ...COLORS.map((c, color) =>
      el('button', { style: 'background:' + c.css, onclick: () => { delete $('#modal').dataset.keep; hideModal(); act({ action: 'play', index, card, color }); } }, c.name))),
      el('button', { onclick: () => { delete $('#modal').dataset.keep; hideModal(); } }, 'Abbrechen')]);
  } else {
    act({ action: 'play', index, card });
  }
}
function confirmEnd() { $('#modal').dataset.keep = '1'; showModal([el('b', {}, 'Spiel für alle beenden?'), el('div', { class: 'row' },
  el('button', { class: 'danger', onclick: () => { delete $('#modal').dataset.keep; hideModal(); act({ action: 'end' }); } }, 'Beenden'),
  el('button', { onclick: () => { delete $('#modal').dataset.keep; hideModal(); } }, 'Weiterspielen'))]); }
function confirmLeave() { $('#modal').dataset.keep = '1'; showModal([el('b', {}, 'Spiel verlassen?'), el('div', { class: 'row' },
  el('button', { class: 'danger', onclick: () => { delete $('#modal').dataset.keep; hideModal(); act({ action: 'leave' }); } }, 'Verlassen'),
  el('button', { onclick: () => { delete $('#modal').dataset.keep; hideModal(); } }, 'Bleiben'))]); }

function showResult() {
  const isHost = S.host === S.you;
  const rows = S.players.map((p) => el('tr', {}, el('td', {}, (p.bot ? '🤖 ' : '') + p.name), el('td', {}, (S.game.hands[p.name] || []).length + ' Karten'), el('td', {}, p.score + ' Punkte')));
  const btns = isHost
    ? [el('button', { class: 'primary', disabled: S.players.length < 2, onclick: () => act({ action: 'start' }) }, 'Nächste Runde'), el('button', { class: 'danger', onclick: () => act({ action: 'end' }) }, 'Beenden')]
    : [el('div', { class: 'hint' }, 'Warte auf ' + S.host + ' …'), el('button', { onclick: () => act({ action: 'leave' }) }, 'Verlassen')];
  showModal([el('h1', {}, '🏆 ' + S.winner + ' gewinnt!'), el('div', {}, '+' + S.points + ' Punkte'), el('table', { class: 'score' }, ...rows), el('div', { class: 'row' }, ...btns)]);
}

/* ---------- chat ---------- */
let chatTimer = null;
let chatPrimed = false;   // the first state only marks existing messages, it doesn't pop the chat up
function startChatTimer() {
  clearTimeout(chatTimer);
  chatTimer = setTimeout(() => {
    if (document.activeElement === $('#chat-input')) return;   // typing: stay open until the field loses focus
    $('#chat').hidden = true; renderChat();
  }, 3000);
}
function showChat() { $('#chat').hidden = false; renderChat(); startChatTimer(); }

function renderChat() {
  if (!S) return;
  const log = $('#chat-log');
  const lastMsg = S.chat[S.chat.length - 1];
  if (chatPrimed && $('#chat').hidden && lastMsg && lastMsg.n > lastChatSeen && lastMsg.name !== store.get('name')) showChat();
  chatPrimed = true;
  const open = !$('#chat').hidden;
  log.replaceChildren(...S.chat.map((m) => el('p', {}, el('b', {}, m.name + ': '), document.createTextNode(m.text))));
  const newest = S.chat.length ? S.chat[S.chat.length - 1].n : 0;
  if (open) { lastChatSeen = newest; store.set('chatSeen', String(newest)); log.scrollTop = log.scrollHeight; }
  $('#chat-badge').hidden = open || newest <= lastChatSeen || (S.chat[S.chat.length - 1] || {}).name === store.get('name');
}

function render() {
  const st = $('#status');
  if (setupNeeded()) { st.textContent = ''; renderSetup(); return; }
  st.textContent = (online ? '' : '⚠ offline · ') + store.get('name');
  if (!S) { $('#screen').replaceChildren(el('div', { class: 'center' }, el('div', { class: 'hint' }, online ? 'Verbinde …' : 'Keine Verbindung zum Server. Fruhno braucht Internet zum Spielen.'),
    el('button', { onclick: () => { poll(); } }, 'Nochmal versuchen'))); return; }
  if (S.game && S.you && (S.phase === 'playing' || S.phase === 'finished')) renderTable();
  else { if (!$('#modal').dataset.keep) hideModal(); renderLobby(); }
  renderChat();
}

/* ---------- wiring ---------- */
$('#btn-chat').addEventListener('click', () => { if ($('#chat').hidden) showChat(); else { clearTimeout(chatTimer); $('#chat').hidden = true; renderChat(); } });
$('#chat-input').addEventListener('focus', () => clearTimeout(chatTimer));
$('#chat-input').addEventListener('blur', () => { if (!$('#chat').hidden) startChatTimer(); });
$('#chat-close').addEventListener('click', () => { $('#chat').hidden = true; renderChat(); });
// A tap anywhere outside the chat panel closes it.
document.addEventListener('pointerdown', (ev) => {
  const c = $('#chat');
  if (!c.hidden && !c.contains(ev.target) && !$('#btn-chat').contains(ev.target)) { c.hidden = true; renderChat(); }
});
$('#chat-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (text) { input.value = ''; act({ action: 'chat', text }); }
});
$('#btn-menu').addEventListener('click', () => {
  $('#modal').dataset.keep = '1';
  showModal([el('b', {}, 'Einstellungen'), el('div', { class: 'row' },
    el('button', { onclick: () => { delete $('#modal').dataset.keep; hideModal(); store.del('key'); store.del('token'); S = null; render(); } }, 'Name / Schlüssel ändern'),
    el('button', { onclick: () => { delete $('#modal').dataset.keep; hideModal(); } }, 'Schließen'))]);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
poll();
