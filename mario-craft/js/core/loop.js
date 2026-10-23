// Fester Simulationsschritt mit Akkumulator, Rendern einmal pro requestAnimationFrame (PLAN §3).
import { PHYS } from '../data/physics.js';

const STEP = PHYS.step;
const MAX_STEPS = 8;

// update(dt) läuft mit dem festen Schritt, render() einmal pro Frame. fps wird etwa alle 0,5 s aktualisiert.
export function createLoop(update, render) {
  let running = false;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let frames = 0;
  let winStart = 0;

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!winStart) {
      winStart = now;
      last = now;
    }
    acc += (now - last) / 1000;
    last = now;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      update(STEP);
      acc -= STEP;
      steps++;
    }
    // Mehr als MAX_STEPS Schritte in einem Frame: Rest verwerfen, statt hinterherzurennen.
    if (steps === MAX_STEPS) acc = 0;
    render();
    frames++;
    if (now - winStart >= 500) {
      loop.fps = (frames * 1000) / (now - winStart);
      frames = 0;
      winStart = now;
    }
  }

  const loop = {
    fps: 0,
    start() {
      if (running) return;
      running = true;
      winStart = 0;
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
  return loop;
}
