// CrazyViperMahjong: Zeichnen, Eingabe, Spielstand.
(function () {
  const SAVE_KEY = 'crazyvipermahjong-save';
  const BEST_KEY = 'crazyvipermahjong-best';
  const SOUND_KEY = 'crazyvipermahjong-sound';
  const $ = (id) => document.getElementById(id);
  const canvas = $('board'), ctx = canvas.getContext('2d');
  const L = MahjongLogic;

  let game = null;       // { layoutId, tiles, history, elapsed, moves, over }
  let sel = null;        // gewählte Kachel
  let hint = null;       // [a, b] oder null
  let hintUntil = 0;
  let fx = [];           // Abgang-Animationen
  let metrics = null;
  let lastTick = 0;
  let soundOn = load(SOUND_KEY, true);

  function load(key, def) { try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* Speicher gesperrt: egal */ } }

  // ---------- Ton ----------
  let ac = null;
  function beep(freq, dur, type, vol, delay) {
    if (!soundOn) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.08, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + dur);
    } catch (e) { /* kein Audio */ }
  }
  const sfx = {
    pick: () => beep(520, 0.06, 'triangle'),
    match: () => { beep(660, 0.1, 'triangle'); beep(990, 0.14, 'triangle', 0.08, 0.08); },
    wrong: () => beep(150, 0.16, 'sawtooth', 0.05),
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.25, 'triangle', 0.09, i * 0.14)),
  };

  // ---------- Spielstand ----------
  function layoutOf(id) { return L.LAYOUTS.find((l) => l.id === id) || L.LAYOUTS[0]; }
  function saveGame() {
    if (!game) return;
    store(SAVE_KEY, { layoutId: game.layoutId, elapsed: game.elapsed, moves: game.moves, over: game.over,
      tiles: game.tiles.map((t) => [t.x, t.y, t.z, t.type, t.removed ? 1 : 0]), history: game.history });
  }
  function restoreGame() {
    const s = load(SAVE_KEY, null);
    if (!s || !Array.isArray(s.tiles) || s.over) return null;
    return { layoutId: s.layoutId, elapsed: s.elapsed || 0, moves: s.moves || 0, over: false, history: s.history || [],
      tiles: s.tiles.map((a, id) => ({ id, x: a[0], y: a[1], z: a[2], type: a[3], removed: !!a[4] })) };
  }
  function bestTimes() { return load(BEST_KEY, {}); }

  function newGame(layoutId) {
    const layout = layoutOf(layoutId);
    game = { layoutId: layout.id, tiles: L.deal(layout, JET_DEFS.length, Math.random), history: [], elapsed: 0, moves: 0, over: false };
    sel = hint = null; fx = [];
    saveGame(); layoutBoard(); updateHud(); showMenu(false); draw();
  }

  // ---------- Layout / Zeichnen ----------
  const RATIO = 0.8; // Kachelbreite : -höhe
  function layoutBoard() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    if (!game) return;
    let maxX = 0, maxY = 0, maxZ = 0;
    game.tiles.forEach((t) => { maxX = Math.max(maxX, t.x); maxY = Math.max(maxY, t.y); maxZ = Math.max(maxZ, t.z); });
    const cols = (maxX + 2) / 2, rows = (maxY + 2) / 2;
    const pad = 8;
    // Breite: cols*tw + Tiefe/Ebenen-Versatz (~0.2*tw je Ebene gesamt)
    const extra = 0.12 + maxZ * 0.07;
    const tw = Math.min((r.width - pad * 2) / (cols + extra), (r.height - pad * 2) * RATIO / (rows + extra * RATIO));
    const th = tw / RATIO, lift = tw * 0.07;
    const w = cols * tw + maxZ * lift + tw * 0.12, h = rows * th + maxZ * lift + tw * 0.12;
    metrics = { dpr, tw, th, lift, ox: (r.width - w) / 2 + maxZ * lift, oy: (r.height - h) / 2 + maxZ * lift, cssW: r.width, cssH: r.height };
    spriteCache.clear();
  }

  const spriteCache = new Map();
  function sprite(type, state) {
    const key = type + ':' + state + ':' + Math.round(metrics.tw);
    let c = spriteCache.get(key);
    if (c) return c;
    const d = metrics.dpr, tw = metrics.tw, th = metrics.th, depth = Math.max(2, tw * 0.1);
    c = document.createElement('canvas');
    c.width = Math.ceil((tw + depth + 2) * d); c.height = Math.ceil((th + depth + 2) * d);
    const g = c.getContext('2d'); g.scale(d, d);
    const rad = tw * 0.12;
    rr(g, depth, depth, tw, th, rad); g.fillStyle = '#8f8670'; g.fill();          // Seite
    rr(g, 0, 0, tw, th, rad);
    g.fillStyle = state === 'blocked' ? '#d3cfbe' : '#f6f3e8'; g.fill();
    g.lineWidth = 1; g.strokeStyle = '#7d745e'; g.stroke();
    if (state === 'sel' || state === 'hint') {
      g.fillStyle = state === 'sel' ? 'rgba(255,207,74,.55)' : 'rgba(80,220,140,.5)';
      rr(g, 0, 0, tw, th, rad); g.fill();
      g.lineWidth = 2.5; g.strokeStyle = state === 'sel' ? '#e6a500' : '#1fb36a'; g.stroke();
    }
    const jet = JET_DEFS[type];
    const js = Math.min(tw * 0.8, th * 0.66);
    drawJet(g, jet, tw / 2, th * 0.1 + js / 2 + th * 0.02, js);
    g.fillStyle = '#2a2417'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.max(7, Math.min(tw * 0.2, th * 0.14));
    g.font = '700 ' + fs + 'px system-ui, sans-serif';
    g.fillText(jet.label, tw / 2, th - fs * 0.95, tw - 4);
    spriteCache.set(key, c);
    return c;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  const tilePos = (t) => ({ x: metrics.ox + t.x * metrics.tw / 2 - t.z * metrics.lift, y: metrics.oy + t.y * metrics.th / 2 - t.z * metrics.lift });

  function draw() {
    if (!metrics) return;
    const d = metrics.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, metrics.cssW, metrics.cssH);
    if (!game) return;
    const now = performance.now();
    const hintOn = hint && now < hintUntil;
    const order = game.tiles.filter((t) => !t.removed).sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
    const depth = Math.max(2, metrics.tw * 0.1);
    order.forEach((t) => {
      const p = tilePos(t);
      let state = L.isFree(t, game.tiles) ? 'free' : 'blocked';
      if (t === sel) state = 'sel';
      else if (hintOn && (t === hint[0] || t === hint[1])) state = (Math.floor(now / 300) % 2) ? 'hint' : state;
      ctx.drawImage(sprite(t.type, state), p.x, p.y, metrics.tw + depth + 2, metrics.th + depth + 2);
    });
    fx = fx.filter((f) => now - f.t0 < 320);
    fx.forEach((f) => {
      const k = (now - f.t0) / 320, depth2 = depth + 2;
      ctx.save(); ctx.globalAlpha = 1 - k;
      const cx = f.x + metrics.tw / 2, cy = f.y + metrics.th / 2, s = 1 + k * 0.35;
      ctx.translate(cx, cy - k * 14); ctx.scale(s, s);
      ctx.drawImage(sprite(f.type, 'sel'), -metrics.tw / 2, -metrics.th / 2, metrics.tw + depth2, metrics.th + depth2);
      ctx.restore();
    });
  }

  function frame(ts) {
    if (game && !game.over && $('menu').hidden && $('msg').hidden) {
      game.elapsed += Math.min(ts - lastTick, 250) / 1000;
      updateTime();
    }
    lastTick = ts;
    if (fx.length || (hint && performance.now() < hintUntil)) draw();
    requestAnimationFrame(frame);
  }

  // ---------- Eingabe ----------
  function tileAt(px, py) {
    const depth = Math.max(2, metrics.tw * 0.1);
    let best = null;
    game.tiles.forEach((t) => {
      if (t.removed) return;
      const p = tilePos(t);
      if (px >= p.x && px <= p.x + metrics.tw + depth && py >= p.y && py <= p.y + metrics.th + depth) {
        if (!best || t.z > best.z || (t.z === best.z && (t.x > best.x || t.y > best.y))) best = t;
      }
    });
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!game || game.over || !metrics) return;
    const r = canvas.getBoundingClientRect();
    const t = tileAt(e.clientX - r.left, e.clientY - r.top);
    if (!t) { sel = null; draw(); return; }
    if (!L.isFree(t, game.tiles)) { sfx.wrong(); return; }
    hint = null;
    if (!sel) { sel = t; sfx.pick(); }
    else if (sel === t) { sel = null; }
    else if (sel.type === t.type) { removePair(sel, t); sel = null; }
    else { sel = t; sfx.pick(); }
    draw();
  });

  function removePair(a, b) {
    [a, b].forEach((t) => { const p = tilePos(t); fx.push({ x: p.x, y: p.y, type: t.type, t0: performance.now() }); t.removed = true; });
    game.history.push([a.id, b.id]);
    game.moves++;
    sfx.match();
    updateHud(); saveGame();
    afterMove();
  }

  function undo() {
    if (!game || game.over || !game.history.length) return;
    const [a, b] = game.history.pop();
    game.tiles[a].removed = game.tiles[b].removed = false;
    game.moves = Math.max(0, game.moves - 1);
    sel = hint = null;
    updateHud(); saveGame(); draw();
  }

  function doHint() {
    if (!game || game.over) return;
    const moves = L.findMoves(game.tiles);
    if (!moves.length) { stuck(); return; }
    hint = moves[Math.floor(Math.random() * moves.length)];
    hintUntil = performance.now() + 3000; sel = null; draw();
  }

  function shuffleTiles(silent) {
    if (!game || game.over) return;
    if (!L.reshuffle(game.tiles, Math.random)) { deadEnd(); return; }
    sel = hint = null; saveGame(); draw();
    if (!silent) sfx.pick();
  }

  function afterMove() {
    if (game.tiles.every((t) => t.removed)) return win();
    if (!L.findMoves(game.tiles).length) setTimeout(stuck, 350);
  }

  // ---------- Meldungen ----------
  function message(title, text, actions) {
    $('msg-title').textContent = title; $('msg-text').textContent = text;
    const box = $('msg-actions'); box.textContent = '';
    actions.forEach(([label, fn, primary]) => {
      const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary';
      b.onclick = () => { $('msg').hidden = true; fn(); }; box.appendChild(b);
    });
    $('msg').hidden = false;
  }
  function stuck() {
    if (!game || game.over || !$('msg').hidden) return;
    message('Keine Züge mehr', 'Kein gleiches Paar ist frei. Mischen oder einen Zug zurück?', [
      ['Mischen', () => { shuffleTiles(true); if (!L.findMoves(game.tiles).length && game) deadEnd(); }, true],
      ['Zug zurück', undo],
      ['Neues Spiel', () => newGame(game.layoutId)],
    ]);
  }
  function deadEnd() {
    message('Sackgasse', 'Mit den übrigen Kacheln geht es nicht weiter. Mach Züge rückgängig oder starte neu.', [
      ['Zug zurück', undo, true], ['Neues Spiel', () => newGame(game.layoutId)],
    ]);
  }
  function win() {
    game.over = true; saveGame();
    const best = bestTimes(), secs = Math.round(game.elapsed);
    const isBest = !best[game.layoutId] || secs < best[game.layoutId];
    if (isBest) { best[game.layoutId] = secs; store(BEST_KEY, best); }
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* egal */ }
    sfx.win();
    setTimeout(() => message('Mission erfüllt! ✈️', 'Alle Jets abgeräumt in ' + fmt(secs) + ' mit ' + game.moves + ' Zügen.' + (isBest ? ' Neue Bestzeit!' : ''), [
      ['Nochmal', () => newGame(game.layoutId), true], ['Menü', () => showMenu(true)],
    ]), 450);
  }

  // ---------- HUD / Menü ----------
  const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function updateTime() { $('time').textContent = fmt(game ? game.elapsed : 0); }
  function updateHud() {
    updateTime();
    $('left').textContent = game ? game.tiles.filter((t) => !t.removed).length : 0;
    $('moves').textContent = game ? game.moves : 0;
    $('btn-undo').disabled = !game || !game.history.length;
    $('btn-sound').textContent = soundOn ? '🔊' : '🔇';
  }
  function showMenu(on) {
    $('menu').hidden = !on;
    if (!on) return;
    const best = bestTimes(), box = $('layouts'); box.textContent = '';
    L.LAYOUTS.forEach((l) => {
      const b = document.createElement('button');
      const n = L.positions(l).length;
      b.innerHTML = '<b></b><small></small><small></small>';
      b.children[0].textContent = l.name;
      b.children[1].textContent = n + ' Kacheln · ' + l.info;
      b.children[2].textContent = best[l.id] ? 'Bestzeit ' + fmt(best[l.id]) : 'Noch keine Bestzeit';
      b.onclick = () => newGame(l.id);
      box.appendChild(b);
    });
    $('btn-resume').hidden = !(game && !game.over);
  }

  $('btn-menu').onclick = () => { saveGame(); showMenu(true); };
  $('btn-resume').onclick = () => showMenu(false);
  $('btn-undo').onclick = undo;
  $('btn-hint').onclick = doHint;
  $('btn-shuffle').onclick = () => shuffleTiles(false);
  $('btn-sound').onclick = () => { soundOn = !soundOn; store(SOUND_KEY, soundOn); updateHud(); };
  window.addEventListener('resize', () => { layoutBoard(); draw(); });
  window.addEventListener('orientationchange', () => setTimeout(() => { layoutBoard(); draw(); }, 200));
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
  window.addEventListener('pagehide', saveGame);
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- Start ----------
  game = restoreGame();
  layoutBoard(); updateHud(); showMenu(true); draw();
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.__mahjong = { newGame, tilePos, get game() { return game; }, get tw() { return metrics.tw; }, get th() { return metrics.th; } }; // für Tests
})();
