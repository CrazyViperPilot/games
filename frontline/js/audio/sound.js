// Ton (PRD §14): alle Geräusche werden mit WebAudio selbst erzeugt (Rauschen und Schwingungen), es gibt keine Audiodateien
// und damit keine Lizenzfragen; offline sofort da. Reines Browser-Modul, nicht Teil der Simulation: liest game.effects,
// Meldungen und das Wetter und ändert nichts am Spiel. Ein Schalter (HUD, Taste F2, Startmenü) schaltet alles ein oder aus.

export const SOUND_KEY = 'frontline-ton';

/** Ton an/aus aus dem Speicher (Standard an). */
export function loadSoundOn() {
  try {
    const v = localStorage.getItem(SOUND_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}
export function saveSoundOn(on) {
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    /* ohne Speicher: gilt nur für diese Sitzung */
  }
}

const MASTER = 2; // Gesamtlautstärke
const MAX_VOICES = 26; // gleichzeitige Einzelgeräusche (danach werden leise Schüsse verworfen)
const AMBIENCE_EVERY = 0.25; // s zwischen zwei Ambiente-Berechnungen
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * Geräusche: Name → { vol, gap (kleinster Abstand gleicher Geräusche in s), play(sound, t, dest) }.
 * dest ist der Ausgang mit Lautstärke und Stereo-Position; t die Startzeit im AudioContext.
 */
const SFX = {
  rifle: {
    vol: 0.8, gap: 0.04,
    play(a, t, d) {
      const r = a.rv();
      a.noise(t, 0.09, { type: 'bandpass', f0: 2600 * r, f1: 1100, q: 0.7, gain: 0.7, dest: d });
      a.tone(t, 0.07, { f0: 190 * r, f1: 70, gain: 0.6, dest: d });
    },
  },
  smg: {
    vol: 0.7, gap: 0.04,
    play(a, t, d) {
      const r = a.rv();
      a.noise(t, 0.06, { type: 'bandpass', f0: 3200 * r, f1: 1600, q: 0.8, gain: 0.6, dest: d });
      a.tone(t, 0.05, { f0: 230 * r, f1: 90, gain: 0.4, dest: d });
    },
  },
  mg: {
    vol: 0.8, gap: 0.05,
    play(a, t, d) {
      const r = a.rv();
      a.noise(t, 0.08, { type: 'bandpass', f0: 1900 * r, f1: 700, q: 0.6, gain: 0.8, dest: d });
      a.tone(t, 0.09, { f0: 140 * r, f1: 55, gain: 0.7, dest: d });
    },
  },
  sniper: {
    vol: 0.85, gap: 0.2,
    play(a, t, d) {
      a.noise(t, 0.22, { type: 'highpass', f0: 900, f1: 400, q: 0.5, gain: 0.8, dest: d });
      a.tone(t, 0.35, { f0: 100, f1: 38, gain: 0.9, dest: d });
      a.noise(t + 0.22, 0.4, { type: 'lowpass', f0: 1400, f1: 300, q: 0.5, gain: 0.25, dest: d }); // Echo
    },
  },
  cannon: {
    vol: 0.9, gap: 0.08,
    play(a, t, d) {
      a.noise(t, 0.4, { type: 'lowpass', f0: 2200, f1: 160, q: 0.6, gain: 1, dest: d });
      a.tone(t, 0.45, { f0: 105, f1: 32, gain: 1, dest: d });
      a.noise(t, 0.05, { type: 'highpass', f0: 2000, q: 0.5, gain: 0.5, dest: d });
    },
  },
  grenade: {
    vol: 0.6, gap: 0.1,
    play(a, t, d) {
      a.tone(t, 0.2, { f0: 140, f1: 48, gain: 0.9, dest: d });
      a.noise(t, 0.16, { type: 'lowpass', f0: 900, f1: 200, q: 0.7, gain: 0.7, dest: d });
    },
  },
  rpg: {
    vol: 0.7, gap: 0.12,
    play(a, t, d) {
      a.noise(t, 0.5, { type: 'bandpass', f0: 500, f1: 2600, q: 0.9, gain: 0.7, atk: 0.12, dest: d });
      a.tone(t, 0.14, { f0: 120, f1: 50, gain: 0.7, dest: d });
    },
  },
  rocket: {
    vol: 0.8, gap: 0.12,
    play(a, t, d) {
      a.noise(t, 0.7, { type: 'bandpass', f0: 400, f1: 3200, q: 0.8, gain: 0.8, atk: 0.15, dest: d });
      a.tone(t, 0.2, { f0: 110, f1: 45, gain: 0.7, dest: d });
    },
  },
  flak: {
    vol: 0.8, gap: 0.08,
    play(a, t, d) {
      a.noise(t, 0.12, { type: 'bandpass', f0: 1500, f1: 600, q: 1.2, gain: 0.8, dest: d });
      a.tone(t, 0.1, { type: 'square', f0: 260, f1: 90, gain: 0.25, dest: d });
    },
  },
  sam: {
    vol: 0.8, gap: 0.3,
    play(a, t, d) {
      a.noise(t, 1.1, { type: 'bandpass', f0: 300, f1: 2800, q: 0.7, gain: 0.8, atk: 0.3, dest: d });
      a.tone(t, 0.3, { f0: 90, f1: 40, gain: 0.7, dest: d });
    },
  },
  base: {
    vol: 0.7, gap: 0.05,
    play(a, t, d) {
      a.noise(t, 0.08, { type: 'bandpass', f0: 2200, f1: 1000, q: 0.7, gain: 0.7, dest: d });
      a.tone(t, 0.06, { f0: 170, f1: 70, gain: 0.5, dest: d });
    },
  },
  mortar: {
    vol: 0.85, gap: 0.15,
    play(a, t, d) {
      a.tone(t, 0.3, { f0: 85, f1: 30, gain: 1, dest: d });
      a.noise(t, 0.3, { type: 'lowpass', f0: 700, f1: 120, q: 0.7, gain: 0.8, dest: d });
      a.tone(t + 0.08, 0.25, { f0: 700, f1: 260, gain: 0.18, dest: d }); // Heulen der Granate
    },
  },
  // Explosionen: klein (Treffer einer Panzerabwehrwaffe), mittel (Fahrzeug), groß (Einschlag, Gebäude)
  boomS: {
    vol: 0.6, gap: 0.06,
    play(a, t, d) {
      a.noise(t, 0.3, { type: 'lowpass', f0: 2500, f1: 200, q: 0.6, gain: 0.9, dest: d });
      a.tone(t, 0.3, { f0: 95, f1: 35, gain: 0.8, dest: d });
    },
  },
  boomM: {
    vol: 0.8, gap: 0.08,
    play(a, t, d) {
      a.noise(t, 0.6, { type: 'lowpass', f0: 2200, f1: 150, q: 0.6, gain: 1, dest: d });
      a.tone(t, 0.6, { f0: 80, f1: 26, gain: 1, dest: d });
      a.noise(t, 0.08, { type: 'highpass', f0: 2500, q: 0.5, gain: 0.5, dest: d });
    },
  },
  boomL: {
    vol: 1, gap: 0.1,
    play(a, t, d) {
      a.noise(t, 1.0, { type: 'lowpass', f0: 1800, f1: 100, q: 0.6, gain: 1, dest: d });
      a.tone(t, 1.0, { f0: 65, f1: 22, gain: 1, dest: d });
      a.noise(t + 0.15, 0.7, { type: 'lowpass', f0: 600, f1: 90, q: 0.5, gain: 0.5, dest: d }); // Nachrollen
      a.noise(t, 0.1, { type: 'highpass', f0: 2500, q: 0.5, gain: 0.6, dest: d });
    },
  },
  // Gefallene: Soldat, Fahrzeug (mit Explosion), Hubschrauber (mit Absturzpfeifen)
  dieInf: {
    vol: 0.6, gap: 0.07,
    play(a, t, d) {
      a.noise(t, 0.14, { type: 'lowpass', f0: 500, f1: 150, q: 0.6, gain: 0.6, dest: d });
      a.tone(t, 0.14, { f0: 150, f1: 60, gain: 0.5, dest: d });
    },
  },
  dieAir: {
    vol: 0.45, gap: 0.2,
    play(a, t, d) {
      a.tone(t, 0.9, { type: 'sawtooth', f0: 900, f1: 120, gain: 0.12, dest: d });
      SFX.boomM.play(a, t + 0.7, d);
    },
  },
  intercept: {
    vol: 0.6, gap: 0.1,
    play(a, t, d) {
      a.tone(t, 0.18, { f0: 2400, f1: 1300, gain: 0.5, dest: d });
      a.noise(t, 0.1, { type: 'highpass', f0: 4000, q: 0.5, gain: 0.3, dest: d });
    },
  },
  // Meldungen und Oberfläche (ohne Ort)
  click: {
    vol: 0.6, gap: 0.05,
    play(a, t, d) {
      a.tone(t, 0.04, { type: 'square', f0: 900, f1: 600, gain: 0.3, dest: d });
    },
  },
  order: {
    vol: 0.5, gap: 0.12,
    play(a, t, d) {
      a.tone(t, 0.07, { type: 'triangle', f0: 520, f1: 780, gain: 0.5, dest: d });
    },
  },
  ready: {
    vol: 0.4, gap: 0.3,
    play(a, t, d) {
      a.tone(t, 0.14, { type: 'triangle', f0: 660, gain: 0.6, dest: d });
      a.tone(t + 0.12, 0.22, { type: 'triangle', f0: 880, gain: 0.6, dest: d });
    },
  },
  built: {
    vol: 0.45, gap: 0.3,
    play(a, t, d) {
      a.tone(t, 0.1, { f0: 120, f1: 70, gain: 0.8, dest: d });
      a.noise(t, 0.08, { type: 'bandpass', f0: 1800, q: 1.5, gain: 0.4, dest: d });
      a.tone(t + 0.12, 0.3, { type: 'triangle', f0: 523, gain: 0.5, dest: d });
      a.tone(t + 0.2, 0.3, { type: 'triangle', f0: 784, gain: 0.5, dest: d });
    },
  },
  alarm: {
    vol: 0.45, gap: 3,
    play(a, t, d) {
      for (let i = 0; i < 3; i++) {
        a.tone(t + i * 0.28, 0.14, { type: 'triangle', f0: 620, gain: 0.5, dest: d });
        a.tone(t + i * 0.28 + 0.14, 0.14, { type: 'triangle', f0: 830, gain: 0.5, dest: d });
      }
    },
  },
  coin: {
    vol: 0.3, gap: 0.4,
    play(a, t, d) {
      a.tone(t, 0.07, { f0: 1320, gain: 0.5, dest: d });
      a.tone(t + 0.06, 0.2, { f0: 1760, gain: 0.5, dest: d });
    },
  },
  note: {
    vol: 0.4, gap: 0.5,
    play(a, t, d) {
      a.tone(t, 0.1, { f0: 740, gain: 0.5, dest: d });
    },
  },
  win: {
    vol: 0.6, gap: 0,
    play(a, t, d) {
      [523, 659, 784, 1047].forEach((f, i) => a.tone(t + i * 0.16, 0.5, { type: 'triangle', f0: f, gain: 0.6, atk: 0.02, dest: d }));
    },
  },
  lose: {
    vol: 0.6, gap: 0,
    play(a, t, d) {
      [392, 349, 311, 233].forEach((f, i) => a.tone(t + i * 0.28, 0.6, { type: 'sawtooth', f0: f, gain: 0.18, atk: 0.03, dest: d }));
    },
  },
  thunder: {
    vol: 0.7, gap: 5,
    play(a, t, d) {
      a.noise(t, 2.2, { type: 'lowpass', f0: 500, f1: 70, q: 0.5, gain: 1, atk: 0.25, dest: d });
      a.noise(t + 0.9, 1.6, { type: 'lowpass', f0: 300, f1: 60, q: 0.5, gain: 0.7, atk: 0.2, dest: d });
    },
  },
};

/** Explosion je Hinweis des Effekts (game.effects[].snd): Treffer einer Panzerabwehrwaffe klein, alles andere (Einschlag, Gebäude) groß. */
const EXPLOSION = { hit: 'boomS' };
/** Todesgeräusch je Rüstungsklasse; Soldaten leise, Fahrzeuge mit Explosion, Hubschrauber mit Absturz. */
const DEATH = { inf: 'dieInf', light: 'boomM', heavy: 'boomL', air: 'dieAir' };

export class Sound {
  /** `ctx`: nur für Tests (fertiger AudioContext, z. B. OfflineAudioContext). */
  constructor({ ctx = null } = {}) {
    this.on = loadSoundOn();
    this.ctx = ctx;
    this.master = null;
    this.noiseBuf = null;
    this.amb = null;
    this.game = null;
    this.camera = null;
    this.team = 0;
    this.seen = new WeakSet();
    this.lastAt = {};
    this.voices = 0;
    this.held = false;
    this.ambIn = 0;
    this.thunderIn = 30;
    this.supported = !!ctx || typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
    if (ctx) this.build();
  }

  // ---- Lebenslauf --------------------------------------------------------------------

  /** Muss aus einer Nutzergeste kommen (Tippen, Taste): erzeugt den AudioContext und weckt ihn auf. */
  unlock() {
    if (!this.supported) return;
    if (!this.ctx && this.on) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.build();
      } catch {
        this.supported = false;
        this.ctx = null;
        return;
      }
    }
    if (this.ctx && this.on && this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {});
  }

  /** Spiel anbinden (Kamera für Stereo-Position und Entfernung). */
  attach(game, camera, team) {
    this.game = game;
    this.camera = camera;
    this.team = team;
    this.seen = new WeakSet();
    this.thunderIn = rnd(15, 45);
    this.setOn(loadSoundOn());
  }

  detach() {
    this.game = null;
    this.camera = null;
    this.setLevels(0, 0, 0, 0);
  }

  setOn(on, save = false) {
    this.on = !!on;
    if (save) saveSoundOn(this.on);
    if (this.on) this.unlock();
    else {
      this.setLevels(0, 0, 0, 0);
      this.ctx?.suspend?.().catch?.(() => {});
    }
  }

  toggle() {
    this.setOn(!this.on, true);
    return this.on;
  }

  // ---- Bausteine ---------------------------------------------------------------------

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = MASTER;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.buildAmbience();
  }

  /** Dauergeräusche (Regen, Wind, Hubschrauber, Fahrzeuge): laufen immer, nur die Pegel ändern sich. */
  buildAmbience() {
    const ctx = this.ctx;
    const loop = (type, freq, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      src.connect(f);
      src.start(0, rnd(0, 2));
      return f;
    };
    const lfo = (freq, depth, target) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g);
      g.connect(target);
      o.start();
    };
    const level = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      return g;
    };
    // Regen: Rauschen ohne Tiefen und ohne feinstes Zischen
    const rain = level();
    const rainLow = ctx.createBiquadFilter();
    rainLow.type = 'lowpass';
    rainLow.frequency.value = 7000;
    loop('highpass', 700).connect(rainLow);
    rainLow.connect(rain);
    // Wind: tiefes Rauschen, dessen Filter langsam wandert
    const wind = level();
    const wf = loop('lowpass', 420);
    wf.connect(wind);
    lfo(0.13, 160, wf.frequency);
    // Hubschrauber: dumpfes Rauschen im Rotortakt plus tiefer Ton
    const heli = level();
    const hAm = ctx.createGain();
    hAm.gain.value = 0.55;
    loop('lowpass', 360).connect(hAm);
    hAm.connect(heli);
    lfo(11, 0.45, hAm.gain);
    const hOsc = ctx.createOscillator();
    hOsc.frequency.value = 58;
    const hg = ctx.createGain();
    hg.gain.value = 0.2;
    hOsc.connect(hg);
    hg.connect(heli);
    hOsc.start();
    // Fahrzeuge: Dieselbrummen
    const veh = level();
    loop('lowpass', 160).connect(veh);
    const vOsc = ctx.createOscillator();
    vOsc.type = 'sawtooth';
    vOsc.frequency.value = 46;
    const vf = ctx.createBiquadFilter();
    vf.type = 'lowpass';
    vf.frequency.value = 120;
    const vAm = ctx.createGain();
    vAm.gain.value = 0.6;
    vOsc.connect(vf);
    vf.connect(vAm);
    vAm.connect(veh);
    lfo(8, 0.35, vAm.gain);
    vOsc.start();
    this.amb = { rain, wind, heli, veh };
  }

  /** Pegel der Dauergeräusche (0–1 je Art), weich überblendet. */
  setLevels(rain, wind, heli, veh) {
    if (!this.amb) return;
    const t = this.ctx.currentTime;
    const set = (g, v) => g.gain.setTargetAtTime(v, t, 0.4);
    set(this.amb.rain, rain);
    set(this.amb.wind, wind);
    set(this.amb.heli, heli);
    set(this.amb.veh, veh);
  }

  rv() {
    return rnd(0.92, 1.08); // kleine Tonhöhenschwankung, damit Salven nicht nach Maschine klingen
  }

  /** Ausgang mit Lautstärke und Stereo-Position. */
  bus(vol, pan) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  noise(t, dur, { type = 'lowpass', f0 = 1000, f1 = 0, q = 0.7, gain = 1, atk = 0.004, dest }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, rnd(0, Math.max(0, 3 - dur - 0.1)));
    src.stop(t + dur + 0.05);
  }

  tone(t, dur, { type = 'sine', f0 = 440, f1 = 0, gain = 1, atk = 0.004, dest }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /**
   * Spielt ein Geräusch. `vol` = Entfernungsfaktor 0–1, `pan` −1…1, `delay` s. Gleiche Geräusche dichter als `gap` und mehr als
   * MAX_VOICES gleichzeitige Geräusche werden verworfen (Gefechtslärm bleibt schlank, Explosionen haben Vorrang).
   */
  play(name, vol = 1, pan = 0, delay = 0) {
    const def = SFX[name];
    if (!def || !this.on || !this.ctx || vol < 0.02) return;
    const now = this.ctx.currentTime;
    const t0 = now + delay;
    if (t0 - (this.lastAt[name] ?? -1e9) < def.gap) return;
    const loud = def.vol >= 0.8;
    if (this.voices >= (loud ? MAX_VOICES + 10 : MAX_VOICES)) return;
    this.lastAt[name] = t0;
    this.voices++;
    setTimeout(() => this.voices--, (delay + 1.6) * 1000);
    def.play(this, t0, this.bus(vol * def.vol, pan));
  }

  // ---- Spiel ---------------------------------------------------------------------------

  /** Entfernung und Stereo-Position eines Weltpunkts: { vol, pan } oder null, wenn zu weit weg oder im Nebel eines Gegners. */
  where(x, y, team) {
    const cam = this.camera;
    if (!cam) return { vol: 1, pan: 0 };
    if (team !== this.team && team !== -1 && !this.game.isVisible(this.team, x, y)) return null;
    const p = cam.worldToScreen(x, y);
    const hw = (cam.viewW || 800) / 2;
    const hh = (cam.viewH || 600) / 2;
    const dx = (p.x - hw) / hw;
    const dy = (p.y - hh) / hh;
    const off = Math.max(Math.abs(dx) - 1, Math.abs(dy) - 1, 0); // Abstand vom Bildrand in halben Bildbreiten
    if (off > 1.2) return null;
    const near = clamp(0.55 + 0.45 * (cam.zoom || 1), 0.55, 1.1);
    return { vol: (1 - off / 1.2) * near, pan: clamp(dx, -1, 1) * 0.8 };
  }

  /** Ort-Geräusch am Weltpunkt (x, y). */
  at(name, x, y, team = -1, delay = 0, boost = 1) {
    if (!this.on || !this.ctx) return;
    const w = this.where(x, y, team);
    if (w) this.play(name, w.vol * boost, w.pan, delay);
  }

  /** Neue Effekte des Spiels (Schüsse, Einschläge, Gefallene) in Geräusche übersetzen. */
  effect(e) {
    switch (e.type) {
      case 'tracer':
      case 'shell':
        this.at(SFX[e.snd] ? e.snd : 'rifle', e.x, e.y, e.team);
        break;
      case 'muzzle':
        this.at('mortar', e.x, e.y, e.team);
        break;
      case 'explosion':
        this.at(EXPLOSION[e.snd] ?? 'boomL', e.x, e.y, e.team, e.snd === 'hit' ? 0.1 : 0); // Treffer nach kurzer Flugzeit
        break;
      case 'intercept':
        this.at('intercept', e.x, e.y, e.team);
        break;
      case 'death':
        this.at(DEATH[e.snd] ?? 'dieInf', e.x, e.y, e.team);
        break;
      default:
        break;
    }
  }

  /** Meldung für den Spieler (Text aus game.message). */
  message(ev) {
    if (!this.on || !this.ctx) return;
    const text = ev.text ?? '';
    if (/ bereit$/.test(text)) this.play('ready');
    else if (/ fertig$/.test(text)) this.play('built');
    else if (text === 'Basis wird angegriffen') this.play('alarm');
    else if (text.startsWith('+')) this.play('coin');
    else if (!/zerstört|abgefangen|gefallen/.test(text)) this.play('note');
  }

  /** Bestätigung eines gegebenen Befehls (Marsch, Angriff …). */
  order() {
    this.play('order');
  }

  click() {
    this.play('click');
  }

  /** Spielende: Fanfare oder Trauermarsch. */
  end(won) {
    this.play(won ? 'win' : 'lose');
  }

  /** Einmal je Bild: neue Effekte abholen, alle 0,25 s Dauergeräusche (Wetter, Hubschrauber, Fahrzeuge) und Donner nachführen. */
  update(dt, paused = false) {
    const game = this.game;
    if (!game || !this.on || !this.ctx) return;
    if (paused !== this.held) {
      this.held = paused;
      if (paused) this.setLevels(0, 0, 0, 0);
    }
    if (paused) return;
    for (const e of game.effects) {
      if (this.seen.has(e)) continue;
      this.seen.add(e);
      this.effect(e);
    }
    this.ambIn -= dt;
    if (this.ambIn > 0) return;
    this.ambIn = AMBIENCE_EVERY;
    this.ambience();
  }

  ambience() {
    const game = this.game;
    const w = game.weather;
    let rain = 0;
    let wind = 0;
    if (w?.on) {
      const m = w.mix ?? 1;
      const lv = (k) => (w.kind === k ? m : 0) + (w.prev === k ? 1 - m : 0);
      rain = lv('rain');
      wind = lv('snow') * 0.7 + lv('fog') * 0.35 + (w.season === 'winter' ? 0.15 : 0);
      if (rain > 0.8) {
        this.thunderIn -= AMBIENCE_EVERY;
        if (this.thunderIn <= 0) {
          this.thunderIn = rnd(25, 75);
          this.play('thunder', rnd(0.5, 1), rnd(-0.6, 0.6));
        }
      }
    }
    // Hubschrauber und Fahrzeuge in Bildnähe, die sich bewegen
    let heli = 0;
    let veh = 0;
    for (const u of game.units) {
      if (!u.alive || u.def.armor === 'inf' || !(u.speedNow > 4)) continue;
      const loc = this.where(u.x, u.y, u.team);
      if (!loc) continue;
      if (u.def.air) heli += loc.vol;
      else veh += loc.vol;
    }
    this.setLevels(rain * 0.2, wind * 0.16, Math.min(1, heli * 0.6) * 0.3, Math.min(1, veh * 0.25) * 0.28);
  }
}
