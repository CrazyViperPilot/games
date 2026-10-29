// Neon Stack – Ton: alles per WebAudio erzeugt (keine Audiodateien), Effekte + optionale Synthwave-Musik.
(function () {
  'use strict';
  let ac = null;
  let master = null;
  let musicBus = null;
  let noiseBuf = null;
  const state = { sound: true, music: true, playing: false, tempo: 100, step: 0, nextTime: 0, timer: 0, level: 1 };

  function init() {
    if (ac) return ac;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ac = new Ctor({ latencyHint: 'interactive' });
    } catch (e) {
      ac = null;
      return null;
    }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master = ac.createGain();
    master.gain.value = 0.55;
    master.connect(comp);
    comp.connect(ac.destination);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.5;
    musicBus.connect(master);
    const len = ac.sampleRate;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }

  function resume() {
    init();
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, opts) {
    if (!ac || !state.sound) return;
    opts = opts || {};
    const t0 = opts.at || ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.006, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (opts.lp) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lp;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(opts.bus || master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterType, freq, opts) {
    if (!ac || !state.sound) return;
    opts = opts || {};
    const t0 = opts.at || ac.currentTime;
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(freq || 2000, t0);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.to), t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(opts.bus || master);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.02);
  }

  const SFX = {
    click() { tone(880, 0.04, 'square', 0.12); },
    move() { tone(300, 0.025, 'square', 0.06); },
    rotate() { tone(520, 0.05, 'square', 0.09, { to: 780 }); },
    hold() { tone(330, 0.09, 'triangle', 0.16, { to: 660 }); },
    lock() { tone(140, 0.09, 'sine', 0.22, { to: 60 }); noise(0.05, 0.08, 'lowpass', 900); },
    hard() { tone(260, 0.13, 'sawtooth', 0.16, { to: 50, lp: 1200 }); noise(0.1, 0.16, 'lowpass', 1800, { to: 200 }); },
    clear(n) {
      const base = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < Math.min(n + 1, 4); i++) tone(base[i], 0.12, 'square', 0.12, { at: ac.currentTime + i * 0.055 });
      noise(0.12, 0.08, 'highpass', 3000);
    },
    tetris() {
      const t = ac.currentTime;
      [261.6, 329.6, 392, 523.25, 659.25, 784, 1046.5].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.1, { at: t + i * 0.05, lp: 3500 }));
      tone(90, 0.5, 'sawtooth', 0.25, { to: 30, lp: 600 });
      noise(0.4, 0.14, 'bandpass', 4000, { to: 300 });
    },
    tspin() { tone(180, 0.28, 'square', 0.12, { to: 1800 }); tone(90, 0.3, 'sawtooth', 0.14, { to: 45, lp: 700 }); noise(0.2, 0.08, 'highpass', 5000); },
    combo(n) { tone(440 * Math.pow(1.0595, Math.min(n, 12) * 2), 0.1, 'triangle', 0.15); },
    level() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.12, 'square', 0.1, { at: ac.currentTime + i * 0.07 })); },
    perfect() { [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.3, 'sine', 0.14, { at: ac.currentTime + i * 0.06 })); },
    over() {
      tone(440, 0.9, 'sawtooth', 0.2, { to: 40, lp: 900 });
      tone(330, 0.9, 'square', 0.1, { to: 30, lp: 700 });
      noise(0.7, 0.16, 'lowpass', 2500, { to: 100 });
    },
    count() { tone(660, 0.08, 'square', 0.12); },
    go() { tone(990, 0.2, 'square', 0.12, { to: 1480 }); },
  };

  function sfx(name, arg) {
    if (!ac || !state.sound) return;
    const f = SFX[name];
    if (f) f(arg);
  }

  // ---- Musik: A-Moll-Synthwave, 16tel-Schritte, Akkordfolge Am – F – C – G ----
  const ROOTS = [57, 53, 48, 55]; // MIDI: A3 F3 C3 G3 (Bass eine Oktave tiefer)
  const CHORDS = [[0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12]]; // Am, F, C, G
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];
  const BASS = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0];

  function scheduleStep(step, t) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const root = ROOTS[bar];
    const sixteenth = 60 / state.tempo / 4;
    if (BASS[s]) tone(mtof(root - 12), sixteenth * 1.7, 'sawtooth', 0.2, { at: t, lp: 520, bus: musicBus });
    const ch = CHORDS[bar];
    const note = root + 12 + ch[ARP[s]];
    tone(mtof(note), sixteenth * 0.9, 'square', 0.055, { at: t, lp: 2600, bus: musicBus });
    if (s % 4 === 0) {
      tone(150, 0.14, 'sine', 0.5, { at: t, to: 42, bus: musicBus });
    }
    if (s === 4 || s === 12) noise(0.13, 0.22, 'bandpass', 1800, { at: t, bus: musicBus });
    if (s % 2 === 0) noise(0.035, s % 4 === 2 ? 0.1 : 0.05, 'highpass', 7000, { at: t, bus: musicBus });
    if (s === 0 && bar % 2 === 0) tone(mtof(root + 24), sixteenth * 14, 'triangle', 0.045, { at: t, bus: musicBus });
  }

  function pump() {
    if (!ac || !state.playing) return;
    const sixteenth = 60 / state.tempo / 4;
    while (state.nextTime < ac.currentTime + 0.14) {
      if (state.music) scheduleStep(state.step, state.nextTime);
      state.step++;
      state.nextTime += sixteenth;
    }
  }

  function startMusic(level) {
    init();
    if (!ac || state.playing) return;
    state.playing = true;
    state.step = 0;
    setLevel(level || 1);
    state.nextTime = ac.currentTime + 0.1;
    state.timer = setInterval(pump, 30);
  }
  function stopMusic() {
    state.playing = false;
    clearInterval(state.timer);
  }
  function setLevel(level) {
    state.level = level;
    state.tempo = Math.min(150, 98 + (level - 1) * 4);
  }
  // 0..1 innerhalb des aktuellen Viertels (für pulsierende Effekte)
  function beat() {
    if (!ac || !state.playing) return 0;
    const q = (60 / state.tempo);
    const ph = ((ac.currentTime - (state.nextTime - 0)) % q + q) % q;
    return 1 - ph / q;
  }

  window.NeonAudio = {
    init, resume, sfx, startMusic, stopMusic, setLevel, beat,
    set sound(v) { state.sound = !!v; },
    set music(v) { state.music = !!v; },
    get running() { return state.playing; },
  };
})();
