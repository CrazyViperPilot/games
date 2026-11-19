// Simfurt – Töne per WebAudio-Synth (keine Audiodateien).
// AudioContext wird erst nach der ersten Nutzer-Geste erzeugt bzw. fortgesetzt.

const KEY = 'simfurt-sound';

// Klang-Daten: pro Ton eine Liste von Noten [Wellenform, f_start Hz, f_ende Hz, Dauer s, Lautstärke, Verzögerung s].
// Lautstärke bewusst leise (≤ 0.15).
const RECIPES = {
  click: [['triangle', 880, 660, 0.05, 0.06, 0]],
  build: [['triangle', 330, 440, 0.12, 0.1, 0], ['sine', 660, 660, 0.08, 0.05, 0.08]],
  bulldoze: [['sawtooth', 120, 60, 0.18, 0.05, 0]],
  money: [['sine', 988, 988, 0.08, 0.07, 0], ['sine', 1319, 1319, 0.1, 0.07, 0.07]],
  alarm: [['square', 440, 400, 0.12, 0.035, 0], ['square', 330, 300, 0.14, 0.035, 0.16]],
  milestone: [
    ['triangle', 523, 523, 0.1, 0.1, 0], ['triangle', 659, 659, 0.1, 0.1, 0.1],
    ['triangle', 784, 784, 0.1, 0.1, 0.2], ['triangle', 1047, 1047, 0.22, 0.1, 0.3],
  ],
};

let on = true;
let ctx = null;
let gestured = false;

try { on = localStorage.getItem(KEY) !== '0'; } catch { on = true; }

/** Erzeugt bzw. setzt den AudioContext fort. Nur nach einer Nutzer-Geste sinnvoll. */
function ensure() {
  if (!ctx) {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { ctx = new AC(); } catch { ctx = null; return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function note(c, [wave, f0, f1, dur, gain, delay]) {
  const t0 = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

if (typeof window !== 'undefined') {
  // Erste Geste: Kontext anlegen bzw. fortsetzen (Browser-Autoplay-Regeln).
  const unlock = () => { gestured = true; if (on) ensure(); };
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

export const sound = {
  /** Spielt einen benannten Ton ab. Ohne Geste, ausgeschaltet oder ohne WebAudio: still. */
  play(name) {
    if (!on) return;
    const recipe = RECIPES[name];
    if (!recipe) return;
    if (!ctx && !gestured) return;
    const c = ensure();
    if (!c || c.state !== 'running') return;
    for (const n of recipe) note(c, n);
  },
  get on() { return on; },
  set on(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* egal */ }
    if (on) { if (gestured) ensure(); } else if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  },
};
