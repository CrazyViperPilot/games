// Kurze, synthetische Effekte mit Web Audio (PRD §9). Der AudioContext entsteht erst nach der ersten Geste (init()).
// Ohne Kontext oder bei ausgeschaltetem Ton passiert nichts.
let ctx = null;
let master = null;
let noise = null;
let enabled = true;

const VOL = 0.35;

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

function burst(t0, dur, vol) {
  const now = ctx.currentTime + t0;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.buffer = noise;
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(g);
  g.connect(master);
  src.start(now, Math.random() * 0.5, dur + 0.02);
}

// Tonfolge: [frequenz, dauer, typ?] nacheinander.
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
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
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

  jump() { play(() => osc('square', 260, 640, 0, 0.14, 0.18)); },
  coin() {
    play(() => {
      osc('square', 988, 988, 0, 0.07, 0.15);
      osc('square', 1319, 1319, 0.07, 0.18, 0.15);
    });
  },
  stomp() { play(() => osc('triangle', 220, 90, 0, 0.09, 0.4)); },
  bump() { play(() => osc('square', 160, 90, 0, 0.06, 0.2)); },
  breakBlock() { play(() => burst(0, 0.18, 0.3)); },
  powerup() { play(() => notes([392, 523, 659, 784], 0.07)); },
  appear() { play(() => osc('sine', 330, 660, 0, 0.2, 0.2)); },
  hurt() { play(() => osc('sawtooth', 420, 110, 0, 0.3, 0.25)); },
  fireball() { play(() => osc('square', 900, 300, 0, 0.12, 0.12)); },
  kick() {
    play(() => {
      burst(0, 0.08, 0.25);
      osc('square', 200, 120, 0, 0.08, 0.2);
    });
  },
  oneup() { play(() => notes([660, 880, 1320, 1760], 0.08)); },
  checkpoint() { play(() => notes([523, 784], 0.1)); },
  goal() { play(() => notes([523, 659, 784, 1047, 1047], 0.14)); },
  die() { play(() => osc('square', 600, 80, 0, 0.7, 0.25)); },
  gameOver() { play(() => notes([392, 330, 262, 196], 0.3, 'triangle', 0.2)); },
  click() { play(() => osc('square', 1000, 1000, 0, 0.03, 0.1)); },
};
