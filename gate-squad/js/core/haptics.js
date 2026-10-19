// navigator.vibrate-Wrapper mit Throttle (max. 1 Vibration pro 60 ms).
const THROTTLE_MS = 60;

let enabled = true;
let lastTime = -Infinity;

function vibrate(pattern) {
  if (!enabled) return;
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    const now = performance.now();
    if (now - lastTime < THROTTLE_MS) return;
    lastTime = now;
    navigator.vibrate(pattern);
  } catch (_) {
    // ignorieren (z. B. Berechtigung/Browser ohne Unterstützung)
  }
}

export const haptics = {
  setEnabled(b) {
    enabled = !!b;
  },
  tap() {
    vibrate(10);
  },
  bump() {
    vibrate(25);
  },
  heavy() {
    vibrate([40, 30, 60]);
  },
};
