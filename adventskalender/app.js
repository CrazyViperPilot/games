// Adventskalender – Oberfläche. Die Seite (kira/ oder lea/) setzt <body data-kind="…">.
(function () {
  'use strict';
  const L = window.AdventLogik;
  const ART = window.AdventArt;
  const kindKey = document.body.dataset.kind;
  const kind = window.AdventKinder[kindKey];
  const jetzt = () => L.datumAusAdresse(location.search, new Date());

  const FARBEN = {
    zauber: ['#3b2f7a', '#5b3c9e', '#1f4f8f', '#7a2f5a', '#2e6b6b', '#8a5a1e', '#4a3a8f', '#25406e'],
    winter: ['#b8322c', '#2f7a4a', '#c96a2a', '#8f2d4a', '#2d6a8f', '#a8833a', '#9e2a36', '#3d7a5e'],
  };
  const DEKO = { zauber: ['✦', '★', '☾', '✧'], winter: ['❄', '✱', '❅', '★'] };
  const GROSS = 24, BREIT = 6;
  const ART_NAMEN = { spruch: 'Botschaft', witz: 'Witz', raetsel: 'Rätsel', quiz: 'Quiz', auftrag: 'Auftrag', finale: 'Heiligabend' };

  // --- Speicher ---
  const speicherKey = () => `adventskalender-${kindKey}-${L.saisonJahr(jetzt())}`;
  function laden() {
    try { return Object.assign({ offen: [], sterne: {}, ton: true }, JSON.parse(localStorage.getItem(speicherKey())) || {}); }
    catch (e) { return { offen: [], sterne: {}, ton: true }; }
  }
  let zustand = laden();
  function speichern() { try { localStorage.setItem(speicherKey(), JSON.stringify(zustand)); } catch (e) { /* privat */ } }
  const sternZahl = () => Object.keys(zustand.sterne).length;

  // --- Elemente ---
  const $ = (s) => document.querySelector(s);
  const kalender = $('#kalender');
  const dialog = $('#tuer-dialog');
  const toastEl = $('#toast');

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('zeigen');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove('zeigen'), 2600);
  }

  // --- Ton (kleines Glockenspiel per WebAudio) ---
  let audio;
  function klang(noten, laenge) {
    if (!zustand.ton) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime + 0.02;
      noten.forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        const t = t0 + i * (laenge || 0.09);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.85);
      });
    } catch (e) { /* kein Ton */ }
  }
  const KLANG = {
    auf: () => klang([784, 988, 1175, 1568]),
    stern: () => klang([1047, 1319, 1568, 2093], 0.07),
    falsch: () => klang([330, 262], 0.15),
    zu: () => klang([392, 370], 0.12),
    finale: () => klang([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.13),
  };

  // --- Effekte ---
  function funken(x, y, anzahl, zeichen) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) anzahl = Math.min(anzahl, 4);
    const z = zeichen || ['✨', '⭐', '❄️', '✦'];
    for (let i = 0; i < anzahl; i++) {
      const el = document.createElement('span');
      el.className = 'funke';
      el.textContent = z[i % z.length];
      const w = Math.random() * Math.PI * 2, r = 60 + Math.random() * 110;
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.setProperty('--dx', Math.cos(w) * r + 'px');
      el.style.setProperty('--dy', Math.sin(w) * r + 'px');
      el.style.setProperty('--rot', (Math.random() * 360 - 180) + 'deg');
      el.style.setProperty('--dauer', (0.7 + Math.random() * 0.6) + 's');
      el.style.fontSize = (14 + Math.random() * 16) + 'px';
      ebene().appendChild(el);
      setTimeout(() => el.remove(), 1500);
    }
  }
  function konfetti(anzahl) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const farben = ['#ffd34a', '#e8463c', '#2fae63', '#5aa0e8', '#b48cff', '#fff', '#f08fb0'];
    for (let i = 0; i < anzahl; i++) {
      const el = document.createElement('span');
      el.className = 'konfetti';
      el.style.left = Math.random() * 100 + 'vw';
      el.style.background = farben[i % farben.length];
      el.style.animationDelay = Math.random() * 1.2 + 's';
      el.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
      el.style.setProperty('--rot', (Math.random() * 1080 - 540) + 'deg');
      el.style.setProperty('--dauer', (2.4 + Math.random() * 2) + 's');
      ebene().appendChild(el);
      setTimeout(() => el.remove(), 6000);
    }
  }
  // Effekte in den offenen Dialog hängen, sonst liegen sie hinter ihm (Top-Layer).
  const ebene = () => (dialog.open ? dialog : document.body);
  const mitte = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  // --- Kalender zeichnen ---
  function zeichnen() {
    const d = jetzt();
    const bis = L.offenBis(d);
    const farben = FARBEN[kind.thema], deko = DEKO[kind.thema];
    kalender.innerHTML = '';
    L.reihenfolge(kindKey).forEach((tag, i) => {
      const b = document.createElement('button');
      b.className = 'tuer';
      if (tag === GROSS) b.classList.add('gross');
      if (tag === BREIT) b.classList.add('breit');
      b.dataset.tag = tag;
      const offen = zustand.offen.includes(tag);
      if (offen) b.classList.add('offen');
      if (tag > bis) b.classList.add('zu');
      if (tag === bis && L.offenBis(d) && d.getMonth() === 11) b.classList.add('heute');
      b.setAttribute('aria-label', `Türchen ${tag}` + (offen ? ', geöffnet' : tag > bis ? ', noch verschlossen' : ', kann geöffnet werden'));
      b.style.setProperty('--farbe', farben[(tag * 5 + i) % farben.length]);
      b.innerHTML =
        `<span class="innen">${ART.get(kind.tueren[tag - 1].bild)}<span class="mini-zahl">${tag}</span></span>` +
        `<span class="fluegel" data-deko="${deko[tag % deko.length]}"><span class="zahl">${tag}</span><span class="knauf"></span></span>`;
      b.addEventListener('click', () => tuerGeklickt(b, tag));
      kalender.appendChild(b);
    });
    hinweisSetzen();
    $('#sterne').textContent = sternZahl();
    $('#ton').textContent = zustand.ton ? '🔔' : '🔕';
  }

  function hinweisSetzen() {
    const d = jetzt();
    const bis = L.offenBis(d);
    const h = $('#hinweis');
    if (bis === 0) {
      const n = L.tageBis(1, d);
      h.innerHTML = n === 1
        ? `Nur noch <b>einmal schlafen</b> – morgen öffnest du das erste Türchen!`
        : `Noch <b>${n}× schlafen</b>, dann öffnest du am 1. Dezember das erste Türchen!`;
    } else if (d.getMonth() === 0) {
      h.innerHTML = 'Weihnachten ist vorbei – aber du kannst alle Türchen noch einmal anschauen. ⭐';
    } else if (bis >= 24) {
      h.innerHTML = zustand.offen.includes(24) ? '<b>Frohe Weihnachten!</b> 🎄' : 'Heiligabend! Das <b>große Türchen 24</b> wartet auf dich! 🎄';
    } else {
      const fehlend = [];
      for (let t = 1; t <= bis; t++) if (!zustand.offen.includes(t)) fehlend.push(t);
      if (fehlend.includes(bis)) h.innerHTML = `Heute ist der ${bis}. Dezember – <b>Türchen ${bis}</b> wartet auf dich!`;
      else if (fehlend.length) h.innerHTML = `Da ist noch ein Türchen zu von den letzten Tagen: <b>${fehlend.join(', ')}</b>`;
      else h.innerHTML = `Super! Morgen wartet <b>Türchen ${bis + 1}</b> auf dich.`;
    }
  }

  function tuerGeklickt(b, tag) {
    const d = jetzt();
    if (tag > L.offenBis(d)) {
      const n = L.tageBis(tag, d);
      b.classList.remove('wackeln'); void b.offsetWidth; b.classList.add('wackeln');
      KLANG.zu();
      toast(n === 1 ? `Türchen ${tag} ist morgen dran – nur noch einmal schlafen! 😴` : `Psst! Türchen ${tag} ist erst in ${n} Tagen dran. Noch ${n}× schlafen! 😴`);
      return;
    }
    if (!zustand.offen.includes(tag)) {
      zustand.offen.push(tag);
      speichern();
      b.classList.add('offen');
      b.classList.remove('heute');
      const [x, y] = mitte(b);
      funken(x, y, 18);
      KLANG.auf();
      hinweisSetzen();
      setTimeout(() => zeigeTuer(tag), 750);
    } else {
      zeigeTuer(tag);
    }
  }

  // --- Türchen-Inhalt ---
  function el(tag, attrs, kinder) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
    });
    (kinder || []).forEach((k) => k && e.appendChild(k));
    return e;
  }

  function sternGeben(tag, quelle) {
    if (zustand.sterne[tag]) return false;
    zustand.sterne[tag] = true;
    speichern();
    $('#sterne').textContent = sternZahl();
    KLANG.stern();
    const [x, y] = quelle ? mitte(quelle) : [innerWidth / 2, innerHeight / 2];
    funken(x, y, 14, ['⭐', '🌟', '✨']);
    return true;
  }

  function zeigeTuer(tag) {
    const t = kind.tueren[tag - 1];
    const karte = el('div', { class: 'karte' + (t.art === 'finale' ? ' finale' : '') });
    const bild = el('div', { class: 'bild', html: ART.get(t.bild), title: 'Tipp mich an!' });
    bild.addEventListener('click', () => { const [x, y] = mitte(bild); funken(x, y, 12); klang([1319, 1568, 2093], 0.06); });
    karte.append(
      el('button', { class: 'schliessen', 'aria-label': 'Schließen', text: '✕', onclick: () => dialog.close() }),
      el('p', { class: 'datum', text: `${tag}. Dezember` }),
      el('h2', { text: t.titel }),
      bild,
      el('span', { class: 'art-schild', text: ART_NAMEN[t.art] || '' }),
    );
    const bereich = el('div');
    karte.appendChild(bereich);

    if (t.art === 'spruch' || t.art === 'finale') {
      bereich.appendChild(el('p', { class: 'text', text: t.text }));
      if (t.art === 'finale') {
        const n = sternZahl();
        if (n) bereich.appendChild(el('p', { class: 'stern-info', text: n === 1 ? 'Du hast 1 Stern gesammelt! ⭐' : `Du hast ${n} Sterne gesammelt! ⭐` }));
        setTimeout(() => { konfetti(140); KLANG.finale(); }, 300);
      }
    } else if (t.art === 'witz') {
      bereich.appendChild(el('p', { class: 'text', text: t.frage }));
      const k = el('button', { class: 'knopf', text: 'Auflösung 🤭' });
      k.addEventListener('click', () => {
        k.replaceWith(el('p', { class: 'aufloesung', text: t.pointe }));
        klang([659, 784, 1047], 0.08);
      });
      bereich.appendChild(k);
    } else if (t.art === 'raetsel') {
      bereich.appendChild(el('p', { class: 'text', text: t.frage }));
      const k = el('button', { class: 'knopf', text: 'Lösung zeigen 🔍' });
      k.addEventListener('click', () => {
        const box = el('div');
        box.appendChild(el('p', { class: 'aufloesung', text: t.loesung }));
        if (zustand.sterne[tag]) box.appendChild(el('p', { class: 'stern-info', text: 'Stern schon gesammelt ⭐' }));
        else {
          const ja = el('button', { class: 'knopf', text: 'Hab ich gewusst! ⭐' });
          const nein = el('button', { class: 'knopf hell', text: 'Diesmal nicht' });
          ja.addEventListener('click', () => { sternGeben(tag, ja); ja.parentNode.replaceWith(el('p', { class: 'stern-info', text: 'Super! Ein Stern für dich ⭐' })); });
          nein.addEventListener('click', () => { nein.parentNode.replaceWith(el('p', { class: 'stern-info', text: 'Macht nichts – morgen gibt’s ein neues Rätsel!' })); });
          box.appendChild(el('div', {}, [ja, nein]));
        }
        k.replaceWith(box);
      });
      bereich.appendChild(k);
    } else if (t.art === 'quiz') {
      bereich.appendChild(el('p', { class: 'text', text: t.frage }));
      const opt = el('div', { class: 'optionen' });
      const info = el('div');
      t.optionen.forEach((o, i) => {
        const b = el('button', { text: o });
        b.addEventListener('click', () => {
          if (opt.dataset.fertig) return;
          if (i === t.richtig) {
            b.classList.add('richtig');
            opt.dataset.fertig = '1';
            const neu = sternGeben(tag, b);
            info.append(el('p', { class: 'aufloesung', text: '✅ Richtig! ' + (t.info || '') }));
            if (neu) info.append(el('p', { class: 'stern-info', text: 'Ein Stern für dich ⭐' }));
          } else {
            b.classList.add('falsch');
            KLANG.falsch();
          }
        });
        if (zustand.sterne[tag] && i === t.richtig) { b.classList.add('richtig'); opt.dataset.fertig = '1'; }
        opt.appendChild(b);
      });
      if (opt.dataset.fertig) info.append(el('p', { class: 'aufloesung', text: '✅ ' + (t.info || '') }));
      bereich.append(opt, info);
    } else if (t.art === 'auftrag') {
      bereich.appendChild(el('p', { class: 'text', text: t.text }));
      const k = el('button', { class: 'knopf' + (zustand.sterne[tag] ? ' fertig' : ''), text: zustand.sterne[tag] ? 'Erledigt ✔ ⭐' : 'Auftrag erledigt! ⭐' });
      k.addEventListener('click', () => {
        if (sternGeben(tag, k)) { k.classList.add('fertig'); k.textContent = 'Erledigt ✔ ⭐'; }
      });
      bereich.appendChild(k);
    }

    dialog.innerHTML = '';
    dialog.appendChild(karte);
    if (!dialog.open) dialog.showModal();
    karte.scrollTop = 0;
  }
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  // --- Schnee im Hintergrund ---
  function schnee() {
    const c = $('#schnee');
    if (!c || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const g = c.getContext('2d');
    let w, h, flocken;
    function groesse() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth; h = innerHeight; c.width = w * dpr; c.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      flocken = Array.from({ length: Math.round(w * h / 9000) }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: 0.8 + Math.random() * 2.4, v: 0.3 + Math.random() * 0.9, p: Math.random() * 6.28,
      }));
    }
    groesse(); addEventListener('resize', groesse);
    (function schritt() {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#ffffffcc';
      for (const f of flocken) {
        f.y += f.v; f.p += 0.01; f.x += Math.sin(f.p) * 0.4;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        g.beginPath(); g.arc(f.x, f.y, f.r, 0, 6.283); g.fill();
      }
      requestAnimationFrame(schritt);
    })();
  }

  $('#ton').addEventListener('click', () => { zustand.ton = !zustand.ton; speichern(); $('#ton').textContent = zustand.ton ? '🔔' : '🔕'; if (zustand.ton) KLANG.auf(); });

  // Um Mitternacht (oder wenn die App später wieder geöffnet wird) neu zeichnen.
  let zuletzt = jetzt().toDateString();
  setInterval(() => { const n = jetzt().toDateString(); if (n !== zuletzt) { zuletzt = n; zustand = laden(); zeichnen(); } }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && jetzt().toDateString() !== zuletzt) { zuletzt = jetzt().toDateString(); zustand = laden(); zeichnen(); } });

  zeichnen();
  schnee();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});
  }
})();
