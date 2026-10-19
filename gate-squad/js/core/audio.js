// WebAudio-Synth für Gate Squad. Keine Audiodateien: alle Sounds werden zur Laufzeit erzeugt.
// Graph: Sounds → master (GainNode 0.5) → DynamicsCompressor → destination.

const SHOT_VOL = 0.18;
const EXPLOSION_VOL = 0.6;

// Schuss-Charakter je Waffe. type: Filter für den Rausch-Burst (bandpass|lowpass),
// f/q: Filterfrequenz/Güte, env: Abklingzeit des Rauschens (s), dur: Gesamtdauer (s),
// ng: Rausch-Pegel, tf/tt: Thump-Startfrequenz/Pitch-Drop-Dauer, tg: Thump-Pegel,
// gap: Mindestabstand zwischen zwei Schuss-Sounds (ms), echo: optionaler verzögerter Nachhall.
const SHOT_PROFILES = {
  mp5:   { type: 'bandpass', f: 3200, q: 0.9, env: 0.035, dur: 0.05,  ng: 1.0, tf: 260, tt: 0.03,  tg: 0.35, gap: 45 },
  ump45: { type: 'bandpass', f: 2200, q: 0.9, env: 0.05,  dur: 0.07,  ng: 1.0, tf: 180, tt: 0.04,  tg: 0.45, gap: 45 },
  g36:   { type: 'bandpass', f: 2700, q: 1.3, env: 0.045, dur: 0.06,  ng: 1.0, tf: 200, tt: 0.035, tg: 0.40, gap: 45 },
  m4a1:  { type: 'bandpass', f: 3400, q: 1.6, env: 0.04,  dur: 0.055, ng: 1.0, tf: 230, tt: 0.03,  tg: 0.35, gap: 45 },
  scarh: { type: 'lowpass',  f: 1800, q: 0.8, env: 0.08,  dur: 0.11,  ng: 1.0, tf: 150, tt: 0.06,  tg: 0.60, gap: 45 },
  m249:  { type: 'lowpass',  f: 1200, q: 0.7, env: 0.045, dur: 0.07,  ng: 1.0, tf: 110, tt: 0.045, tg: 0.60, gap: 45 },
  m82:   { type: 'lowpass',  f: 750,  q: 0.7, env: 0.16,  dur: 0.36,  ng: 1.0, tf: 90,  tt: 0.20,  tg: 0.70, gap: 120,
           echo: { d: 0.16, g: 0.4, f: 500 } },
};

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;
const lastAt = {}; // Rate-Limit: Schlüssel → Zeitpunkt (performance.now) der letzten erlaubten Ausgabe

function allow(key, gapMs) {
  const now = performance.now();
  const last = lastAt[key];
  if (last !== undefined && now - last < gapMs) return false;
  lastAt[key] = now;
  return true;
}

// Hüllkurve: sofort peak, exponentiell auf ~0 in len Sekunden.
function envelope(gain, t, peak, len) {
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
}

// Oszillator-Ton mit optionalem Pitch-Sweep f0 → f1 (exponentiell, f > 0 nötig).
function tone(type, f0, f1, t, dur, peak) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  envelope(g, t, peak, dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
  o.onended = () => {
    try { o.disconnect(); g.disconnect(); } catch (_) { /* bereits getrennt */ }
  };
}

// Rausch-Burst aus dem gemeinsamen Buffer, zufälliger Startoffset, Filter mit optionalem Sweep.
function noise(t, dur, filterType, freq, q, peak, env, freqEnd) {
  const src = ctx.createBufferSource();
  const flt = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = noiseBuf;
  flt.type = filterType;
  flt.frequency.setValueAtTime(freq, t);
  if (freqEnd) flt.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  flt.Q.value = q;
  envelope(g, t, peak, env || dur);
  src.connect(flt);
  flt.connect(g);
  g.connect(master);
  const maxOffset = Math.max(0, noiseBuf.duration - dur - 0.01);
  src.start(t, Math.random() * maxOffset, dur);
  src.stop(t + dur + 0.01);
  src.onended = () => {
    try { src.disconnect(); flt.disconnect(); g.disconnect(); } catch (_) { /* ok */ }
  };
}

// Folge von Tönen mit festem Abstand.
function sequence(notes, step, type, peak, len) {
  const t0 = ctx.currentTime + 0.005;
  for (let i = 0; i < notes.length; i++) {
    tone(type, notes[i], 0, t0 + i * step, len, peak);
  }
}

const play = (fn) => (...args) => {
  if (!enabled || !ctx) return;
  try { fn(...args); } catch (_) { /* Audio darf das Spiel nie stören */ }
};

export const audio = {
  init() {
    try {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = 0.5;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);

      // Ein einziger Weiß-Rausch-Buffer (1 s) für alle Rausch-Sounds.
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      if (ctx.state === 'suspended') ctx.resume();
    } catch (_) {
      ctx = null;
      master = null;
      noiseBuf = null;
    }
  },

  setEnabled(b) {
    enabled = !!b;
  },

  shot: play((weaponId) => {
    const p = Object.prototype.hasOwnProperty.call(SHOT_PROFILES, weaponId)
      ? SHOT_PROFILES[weaponId]
      : SHOT_PROFILES.mp5;
    if (!allow('shot', p.gap)) return;

    const t = ctx.currentTime + 0.005;
    const k = 1 + (Math.random() * 0.1 - 0.05); // ±5 % Pitch-Variation

    noise(t, p.dur, p.type, p.f * k, p.q, p.ng * SHOT_VOL, p.env);
    tone('sine', p.tf * k, p.tf * k * 0.5, t, p.tt, p.tg * SHOT_VOL);

    if (p.echo) {
      const te = t + p.echo.d;
      noise(te, 0.2, 'lowpass', p.echo.f * k, 0.7, p.ng * SHOT_VOL * p.echo.g, 0.12);
    }
  }),

  explosion: play((size = 1) => {
    if (!allow('expl', 80)) return;
    const s = Math.min(2, Math.max(0.5, size));
    const dur = 0.4 + (s - 0.5) / 1.5 * 0.5; // 0.4 s … 0.9 s
    const t = ctx.currentTime + 0.005;
    noise(t, dur, 'lowpass', 1500, 0.8, EXPLOSION_VOL, dur, 150);
    tone('sine', 60, 30, t, dur, EXPLOSION_VOL);
  }),

  hit: play(() => {
    if (!allow('hit', 40)) return;
    tone('square', 1800, 900, ctx.currentTime + 0.005, 0.03, 0.12);
  }),

  gate: play((good) => {
    if (good) {
      // aufsteigendes Arpeggio C-E-G
      sequence([523.25, 659.25, 783.99], 0.07, 'square', 0.14, 0.12);
    } else {
      // absteigender Sägezahn
      tone('sawtooth', 400, 150, ctx.currentTime + 0.005, 0.35, 0.16);
    }
  }),

  upgrade: play(() => {
    // Fanfare 4 Töne
    sequence([523.25, 659.25, 783.99, 1046.5], 0.1, 'square', 0.12, 0.18);
  }),

  crate: play(() => {
    const t = ctx.currentTime + 0.005;
    // Klick
    noise(t, 0.01, 'highpass', 3000, 0.7, 0.3 * 0.5);
    // Glocke: Grundton + Oberton
    tone('sine', 1320, 0, t + 0.01, 0.6, 0.16);
    tone('sine', 2640, 0, t + 0.01, 0.3, 0.05);
  }),

  coin: play(() => {
    if (!allow('coin', 50)) return;
    tone('sine', 1400, 2000, ctx.currentTime + 0.005, 0.12, 0.15);
  }),

  win: play(() => {
    // kurze Siegesfanfare, letzter Ton gehalten
    const t0 = ctx.currentTime + 0.005;
    const notes = [523.25, 659.25, 783.99];
    for (let i = 0; i < notes.length; i++) tone('triangle', notes[i], 0, t0 + i * 0.1, 0.14, 0.18);
    tone('triangle', 1046.5, 0, t0 + 0.3, 0.5, 0.2);
  }),

  lose: play(() => {
    tone('triangle', 330, 110, ctx.currentTime + 0.005, 0.6, 0.15);
  }),

  click: play(() => {
    tone('square', 1000, 0, ctx.currentTime + 0.005, 0.02, 0.08);
  }),

  resume() {
    try {
      if (ctx) ctx.resume();
    } catch (_) { /* ok */ }
  },

  suspend() {
    try {
      if (ctx) ctx.suspend();
    } catch (_) { /* ok */ }
  },
};
