// Haupt-Schleife (docs/verlauf.md §5 core/loop.js): feste Schrittweite für update(), render() pro Frame. DOM: requestAnimationFrame.

const MAX_STEPS = 10; // max. Simulationsschritte pro Frame

/**
 * @param {{ update(dt: number): void, render(): void, tickRate?: number }} opts
 * @returns {{ start(): void, stop(): void, speed: number, paused: boolean, running: boolean }}
 */
export function createLoop({ update, render, tickRate = 20 } = {}) {
  const step = 1 / tickRate;
  let acc = 0;
  let last = null;
  let raf = 0;

  const loop = {
    speed: 1,
    paused: false,
    running: false,

    start() {
      if (loop.running) return;
      loop.running = true;
      last = null;
      raf = requestAnimationFrame(frame);
    },

    stop() {
      loop.running = false;
      cancelAnimationFrame(raf);
    },
  };

  // Fehler in update/render: einmal je Meldung in die Konsole, das Spiel läuft weiter (vorher hielt eine Ausnahme die Schleife für
  // immer an, weil der nächste Frame erst nach render() angefordert wurde)
  const reported = new Set();
  const guard = (fn, arg) => {
    try {
      fn(arg);
    } catch (err) {
      const key = String(err?.stack ?? err);
      if (!reported.has(key)) {
        reported.add(key);
        console.error(err);
      }
    }
  };

  function frame(now) {
    if (!loop.running) return;
    raf = requestAnimationFrame(frame); // vor update/render: ein Fehler darin hält die Schleife nicht an
    // Nach Tab-Wechsel nicht den ganzen Abstand nachholen
    const elapsed = last === null ? 0 : Math.min((now - last) / 1000, 0.25);
    last = now;

    if (!loop.paused) {
      acc += elapsed * loop.speed;
      let n = 0;
      while (acc >= step && n < MAX_STEPS) {
        guard(update, step);
        acc -= step;
        n++;
      }
      // Überschuss verwerfen, damit die Schleife nicht hinterherläuft
      if (acc > step) acc = step;
    }

    guard(render);
  }

  return loop;
}
