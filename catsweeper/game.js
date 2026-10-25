// Catsweeper – Darstellung und Eingabe (Canvas 2D). Logik: logic.js
(function () {
  const L = CatLogic;
  const K = { save: 'catsweeper-save', best: 'catsweeper-best', sound: 'catsweeper-sound' };
  const $ = (id) => document.getElementById(id);
  const cv = $('board'), ctx = cv.getContext('2d');
  const NUM = ['', '#4aa3ff', '#4cc46a', '#ff5d5d', '#a47cff', '#ff9a3c', '#2ec4c4', '#e8e8e8', '#9aa0a6'];
  const FUR = ['#f29b3d', '#8d8d99', '#3b3b46', '#f2e6d0', '#c7803a', '#b9a6d6'];

  let g = null, mode = 'reveal', soundOn = true, geo = null, hintCell = null, hintUntil = 0, timer = null;
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignorieren */ } };

  // ---- Ton ----
  let ac = null;
  function beep(f, d, type, slideTo) {
    if (!soundOn) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), v = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = f;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + d);
      v.gain.setValueAtTime(0.12, ac.currentTime); v.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d);
      o.connect(v); v.connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
    } catch (e) { /* ignorieren */ }
  }
  const meow = () => { beep(600, 0.12, 'triangle', 900); setTimeout(() => beep(900, 0.3, 'triangle', 420), 110); };
  const purr = () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle'), i * 110));

  // ---- Zeichnen ----
  function fmt(s) { return ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0'); }

  function resize() {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (g) {
      const pad = 6, cs = Math.floor(Math.min((r.width - pad * 2) / g.cols, (r.height - pad * 2) / g.rows));
      geo = { cs, ox: Math.round((r.width - cs * g.cols) / 2), oy: Math.round((r.height - cs * g.rows) / 2), w: r.width, h: r.height };
    }
    draw();
  }

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

  function drawCat(cx, cy, r, fur, mood) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.strokeStyle = '#2a1a10';
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.moveTo(cx - r * .9, cy - r * .1); ctx.lineTo(cx - r * .8, cy - r * 1.0); ctx.lineTo(cx - r * .2, cy - r * .6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + r * .9, cy - r * .1); ctx.lineTo(cx + r * .8, cy - r * 1.0); ctx.lineTo(cx + r * .2, cy - r * .6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy + r * .1, r * .95, r * .8, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f7b3b8';
    ctx.beginPath(); ctx.moveTo(cx - r * .72, cy - r * .5); ctx.lineTo(cx - r * .66, cy - r * .85); ctx.lineTo(cx - r * .4, cy - r * .6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + r * .72, cy - r * .5); ctx.lineTo(cx + r * .66, cy - r * .85); ctx.lineTo(cx + r * .4, cy - r * .6); ctx.fill();
    // Augen
    ctx.fillStyle = '#2a1a10';
    if (mood === 'shock') {
      for (const s of [-1, 1]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + s * r * .38, cy, r * .24, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(cx + s * r * .38, cy, r * .09, 0, 7); ctx.fill(); }
    } else if (mood === 'happy') {
      ctx.lineWidth = Math.max(1.5, r * .1); ctx.lineCap = 'round';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * r * .38, cy + r * .04, r * .2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    } else {
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * r * .38, cy, r * .13, r * .21, 0, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = '#e0707a'; ctx.beginPath(); ctx.moveTo(cx - r * .1, cy + r * .22); ctx.lineTo(cx + r * .1, cy + r * .22); ctx.lineTo(cx, cy + r * .34); ctx.fill();
    ctx.lineWidth = Math.max(1, r * .06); ctx.beginPath(); ctx.moveTo(cx, cy + r * .34);
    if (mood === 'shock') { ctx.ellipse(cx, cy + r * .5, r * .1, r * .14, 0, 0, 7); } else { ctx.quadraticCurveTo(cx, cy + r * .5, cx - r * .2, cy + r * .46); ctx.moveTo(cx, cy + r * .34); ctx.quadraticCurveTo(cx, cy + r * .5, cx + r * .2, cy + r * .46); }
    ctx.stroke();
    ctx.lineWidth = Math.max(1, r * .04);
    for (const s of [-1, 1]) for (const d of [-.08, .1]) { ctx.beginPath(); ctx.moveTo(cx + s * r * .42, cy + r * (.3 + d)); ctx.lineTo(cx + s * r * 1.05, cy + r * (.22 + d * 3)); ctx.stroke(); }
    ctx.restore();
  }

  function drawFish(cx, cy, r) {
    ctx.save(); ctx.lineWidth = Math.max(1, r * .08); ctx.strokeStyle = '#0d3b5c'; ctx.lineJoin = 'round';
    ctx.fillStyle = '#4aa3ff';
    ctx.beginPath(); ctx.moveTo(cx + r * .45, cy); ctx.lineTo(cx + r * .95, cy - r * .42); ctx.lineTo(cx + r * .95, cy + r * .42); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx - r * .1, cy, r * .65, r * .4, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - r * .4, cy - r * .08, r * .1, 0, 7); ctx.fill();
    ctx.fillStyle = '#0d3b5c'; ctx.beginPath(); ctx.arc(cx - r * .42, cy - r * .08, r * .05, 0, 7); ctx.fill();
    ctx.restore();
  }

  function draw() {
    if (!geo) return;
    const { cs, ox, oy, w, h } = geo;
    ctx.clearRect(0, 0, w, h);
    if (!g) return;
    const now = performance.now(), over = g.state !== 'play';
    for (let i = 0; i < g.cat.length; i++) {
      const x = ox + (i % g.cols) * cs, y = oy + ((i / g.cols) | 0) * cs, m = Math.max(1, cs * .04);
      const open = g.open[i], cx = x + cs / 2, cy = y + cs / 2;
      const showCat = over && g.cat[i];
      if (open) {
        ctx.fillStyle = (((i % g.cols) + ((i / g.cols) | 0)) & 1) ? '#efe0c8' : '#e6d4b8';
        rr(x + m / 2, y + m / 2, cs - m, cs - m, cs * .12); ctx.fill();
        if (g.count[i]) {
          ctx.fillStyle = '#2a1a10'; ctx.font = `800 ${cs * .62}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = cs * .12; ctx.strokeStyle = '#2a1a10'; ctx.strokeText(g.count[i], cx, cy + cs * .04);
          ctx.fillStyle = NUM[g.count[i]]; ctx.fillText(g.count[i], cx, cy + cs * .04);
        }
      } else {
        const hit = g.hit === i;
        ctx.fillStyle = hit ? '#e0525a' : (((i % g.cols) + ((i / g.cols) | 0)) & 1) ? '#7f5aa6' : '#8a64b3';
        rr(x + m / 2, y + m / 2, cs - m, cs - m, cs * .16); ctx.fill();
        if (!hit) { ctx.fillStyle = '#ffffff22'; rr(x + m / 2, y + m / 2, cs - m, (cs - m) * .45, cs * .16); ctx.fill(); }
        if (!over || !g.cat[i]) {
          // Kissen-Pfötchen als Deko
          ctx.fillStyle = '#ffffff1c'; ctx.beginPath(); ctx.ellipse(cx, cy + cs * .08, cs * .17, cs * .13, 0, 0, 7); ctx.fill();
          for (const dx of [-.2, -.07, .07, .2]) { ctx.beginPath(); ctx.arc(cx + dx * cs, cy - cs * .12 - (Math.abs(dx) < .1 ? .06 : 0) * cs, cs * .05, 0, 7); ctx.fill(); }
        }
        if (g.flag[i] && !(over && g.cat[i])) drawFish(cx, cy, cs * .36);
        if (over && g.state === 'lost' && g.flag[i] && !g.cat[i]) { ctx.fillStyle = '#ff5d5dcc'; ctx.font = `800 ${cs * .6}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✕', cx, cy); }
        if (showCat) drawCat(cx, cy, cs * .38, FUR[(i * 7 + (i >> 3)) % FUR.length], g.state === 'won' ? 'happy' : 'shock');
      }
      if (hintCell === i && now < hintUntil) {
        ctx.lineWidth = Math.max(2, cs * .08); ctx.strokeStyle = hintKind === 'cat' ? '#ff5d5d' : '#4cff8a';
        ctx.globalAlpha = .5 + .5 * Math.sin(now / 90); rr(x + m, y + m, cs - m * 2, cs - m * 2, cs * .14); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    if (now < hintUntil) requestAnimationFrame(draw);
  }
  let hintKind = 'safe';

  // ---- Spielablauf ----
  function updateBar() {
    $('left').textContent = g ? L.flagsLeft(g) : 0;
    $('time').textContent = fmt(g ? g.time : 0);
    $('btn-mode').textContent = mode === 'reveal' ? '👆 Aufdecken' : '🐟 Fisch';
    $('btn-mode').classList.toggle('on', mode === 'flag');
    $('btn-sound').textContent = soundOn ? '🔊' : '🔇';
  }
  function persist() { if (g && g.state === 'play') set(K.save, g); else try { localStorage.removeItem(K.save); } catch (e) { /* ignorieren */ } }
  function startTimer() {
    clearInterval(timer);
    timer = setInterval(() => { if (g && g.state === 'play' && g.placed) { g.time++; updateBar(); if (g.time % 5 === 0) persist(); } }, 1000);
  }
  function start(level) {
    g = L.newGame(level); hintCell = null; show('menu', false); show('msg', false);
    resize(); updateBar(); startTimer(); persist();
  }
  function show(id, on) { $(id).hidden = !on; }

  function after(prev) {
    if (g.state === 'lost') { meow(); if (navigator.vibrate) navigator.vibrate(200); end('Miau! 🙀', 'Du hast eine Katze erschreckt. Zeit: ' + fmt(g.time) + '.'); }
    else if (g.state === 'won') {
      purr();
      const best = get(K.best, {}), b = best[g.level];
      let txt = 'Alle Katzen sind gefunden. Zeit: ' + fmt(g.time) + '.';
      if (!b || g.time < b) { best[g.level] = g.time; set(K.best, best); txt += ' Neue Bestzeit!'; }
      end('Geschafft! 😻', txt);
    } else if (prev !== undefined) beep(prev ? 520 : 760, 0.05, 'triangle');
    persist(); updateBar(); draw();
  }
  function end(title, text) {
    setTimeout(() => {
      $('msg-title').textContent = title; $('msg-text').textContent = text;
      const a = $('msg-actions'); a.innerHTML = '';
      const mk = (t, f, cls) => { const b = document.createElement('button'); b.textContent = t; if (cls) b.className = cls; b.onclick = f; a.appendChild(b); };
      mk('Nochmal', () => start(g.level), 'primary'); mk('Menü', () => { show('msg', false); openMenu(); });
      show('msg', true);
    }, 900);
  }

  function act(i, alt) {
    if (!g || g.state !== 'play') return;
    const flagging = (mode === 'flag') !== !!alt;
    if (g.open[i]) { L.chord(g, i); }
    else if (flagging) { L.toggleFlag(g, i); }
    else { L.reveal(g, i); }
    after(flagging && !g.open[i] ? g.flag[i] : undefined);
  }

  function cellAt(e) {
    if (!g || !geo) return -1;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left - geo.ox, y = e.clientY - r.top - geo.oy;
    const cx = Math.floor(x / geo.cs), cy = Math.floor(y / geo.cs);
    return cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows ? -1 : cy * g.cols + cx;
  }

  let press = null;
  cv.addEventListener('pointerdown', (e) => {
    const i = cellAt(e); if (i < 0) return;
    press = { i, x: e.clientX, y: e.clientY, long: false };
    press.t = setTimeout(() => { if (press) { press.long = true; if (navigator.vibrate) navigator.vibrate(25); act(i, true); } }, 380);
  });
  cv.addEventListener('pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) { clearTimeout(press.t); press = null; } });
  cv.addEventListener('pointerup', (e) => {
    if (!press) return; clearTimeout(press.t);
    const p = press; press = null;
    if (!p.long && cellAt(e) === p.i) act(p.i, false);
  });
  cv.addEventListener('pointercancel', () => { if (press) clearTimeout(press.t); press = null; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- Menü ----
  function openMenu() {
    const best = get(K.best, {}), box = $('levels'); box.innerHTML = '';
    for (const [k, v] of Object.entries(L.LEVELS)) {
      const b = document.createElement('button');
      b.innerHTML = `<b>${v.name}</b>${v.cols}×${v.rows} · ${v.cats} Katzen<small>${best[k] ? 'Bestzeit ' + fmt(best[k]) : 'noch keine Bestzeit'}</small>`;
      b.onclick = () => start(k); box.appendChild(b);
    }
    $('btn-resume').hidden = !(g && g.state === 'play');
    show('menu', true);
  }

  $('btn-menu').onclick = openMenu;
  $('btn-resume').onclick = () => show('menu', false);
  $('btn-new').onclick = () => g && start(g.level);
  $('btn-mode').onclick = () => { mode = mode === 'reveal' ? 'flag' : 'reveal'; updateBar(); };
  $('btn-sound').onclick = () => { soundOn = !soundOn; set(K.sound, soundOn); updateBar(); };
  $('btn-hint').onclick = () => {
    if (!g || g.state !== 'play') return;
    const h = L.hint(g); if (!h) return;
    hintCell = h.cell; hintKind = h.type; hintUntil = performance.now() + 3000; draw();
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));
  document.addEventListener('visibilitychange', persist);

  // ---- Start ----
  soundOn = get(K.sound, true);
  const saved = get(K.save, null);
  if (saved && saved.state === 'play' && saved.cat && L.LEVELS[saved.level]) g = saved;
  resize(); updateBar(); startTimer(); openMenu();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
