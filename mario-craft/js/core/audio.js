// Kurze, synthetische Effekte mit Web Audio (PRD §9). Der AudioContext entsteht erst nach der ersten Geste (init()).
// Ohne Kontext (z. B. Tests in Node) oder bei ausgeschaltetem Ton passiert nichts.
// Ereignisnamen = Methoden von `audio` (PLAN §6); playEvent(name) ruft sie für main.js auf.
let ctx = null;
let master = null;
let noise = null;
let enabled = true;

const VOL = 0.35;
const CONTROL = new Set(['init', 'setEnabled', 'enabled']);

function osc(type, f0, f1, t0, dur, vol) {
  const now = ctx.currentTime + t0;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, now);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, now + dur);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g);
  g.connect(master);
  o.start(now);
  o.stop(now + dur + 0.02);
}

// Rauschen mit kurzer Hüllkurve; optional durch einen Filter (ftype: 'lowpass' | 'highpass' | 'bandpass').
// Der Puffer ist 1 s lang, der Startversatz höchstens 0,2 s, also reicht er für Dauern bis 0,8 s.
function burst(t0, dur, vol, ftype = null, freq = 1000) {
  const now = ctx.currentTime + t0;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.buffer = noise;
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  if (ftype) {
    const f = ctx.createBiquadFilter();
    f.type = ftype;
    f.frequency.value = freq;
    src.connect(f);
    f.connect(g);
  } else {
    src.connect(g);
  }
  g.connect(master);
  src.start(now, Math.random() * 0.2, dur + 0.02);
}

// Tonfolge: nacheinander, je `step` Sekunden.
function notes(list, step, type = 'square', vol = 0.15) {
  list.forEach((f, i) => osc(type, f, f, i * step, step * 1.1, vol));
}

function play(fn) {
  if (!ctx || !enabled || ctx.state !== 'running') return;
  try { fn(); } catch (_) { /* Ton ist optional */ }
}

export const audio = {
  get enabled() {
    return enabled;
  },

  init() {
    try {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? VOL : 0;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (_) {
      ctx = null;
    }
  },

  setEnabled(b) {
    enabled = !!b;
    if (master) master.gain.value = enabled ? VOL : 0;
  },

  // --- Ereignisse (PLAN §6) ---
  jump() { play(() => osc('square', 260, 640, 0, 0.14, 0.18)); },
  emerald() {
    play(() => {
      osc('square', 988, 988, 0, 0.07, 0.15);
      osc('square', 1319, 1319, 0.07, 0.18, 0.15);
    });
  },
  diamond() { play(() => notes([1319, 1568, 1976, 2637], 0.05, 'triangle', 0.14)); },
  stomp() { play(() => osc('triangle', 220, 90, 0, 0.09, 0.4)); },
  dig() {
    play(() => {
      burst(0, 0.05, 0.25, 'highpass', 1500);
      osc('square', 300, 200, 0, 0.04, 0.12);
    });
  },
  digFail() { play(() => osc('triangle', 140, 70, 0, 0.12, 0.35)); },
  break() { play(() => burst(0, 0.18, 0.3, 'bandpass', 900)); },
  chest() { play(() => notes([523, 659, 784, 1047], 0.06, 'triangle', 0.18)); },
  powerup() { play(() => notes([392, 523, 659, 784], 0.07)); },
  hurt() { play(() => osc('sawtooth', 420, 110, 0, 0.3, 0.25)); },
  arrow() { play(() => burst(0, 0.1, 0.12, 'highpass', 2000)); },
  explode() {
    play(() => {
      burst(0, 0.5, 0.5, 'lowpass', 1200);
      osc('sine', 120, 35, 0, 0.5, 0.45);
    });
  },
  fuse() { play(() => burst(0, 0.3, 0.2, 'bandpass', 4000)); },
  splash() { play(() => burst(0, 0.25, 0.25, 'bandpass', 700)); },
  oneup() { play(() => notes([660, 880, 1320, 1760], 0.08)); },
  checkpoint() { play(() => notes([523, 784], 0.1)); },
  portal() { play(() => osc('sine', 300, 1200, 0, 0.35, 0.2)); },
  die() { play(() => osc('square', 600, 80, 0, 0.7, 0.25)); },
  gameOver() { play(() => notes([392, 330, 262, 196], 0.3, 'triangle', 0.2)); },
  bossHit() {
    play(() => {
      osc('square', 180, 60, 0, 0.2, 0.3);
      burst(0, 0.1, 0.2, 'lowpass', 600);
    });
  },
  spawn() { play(() => osc('sine', 400, 800, 0, 0.12, 0.15)); },
  click() { play(() => osc('square', 1000, 1000, 0, 0.03, 0.1)); },
  bossStart() { play(() => notes([196, 233, 196, 165], 0.2, 'sawtooth', 0.14)); },
  levelDone() { play(() => notes([523, 659, 784, 1047, 1047], 0.14)); },

  // --- ältere Namen (weiterhin verwendet, z. B. von Spiel-Code aus v1) ---
  coin() { audio.emerald(); },
  bump() { play(() => osc('square', 160, 90, 0, 0.06, 0.2)); },
  breakBlock() { audio.break(); },
  appear() { audio.spawn(); },
  fireball() { play(() => osc('square', 900, 300, 0, 0.12, 0.12)); },
  kick() {
    play(() => {
      burst(0, 0.08, 0.25);
      osc('square', 200, 120, 0, 0.08, 0.2);
    });
  },
  goal() { audio.levelDone(); },
};

// Ruft die gleichnamige Funktion aus `audio` auf, falls vorhanden; unbekannte Namen tun nichts.
export function playEvent(name) {
  if (CONTROL.has(name)) return;
  const f = audio[name];
  if (typeof f === 'function') f.call(audio);
}
