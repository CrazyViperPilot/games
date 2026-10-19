import { CFG } from '../config.js';

// Fixed-Timestep-Loop: update(dt) mit CFG.STEP (max CFG.MAX_STEPS pro Frame),
// render(alpha) pro requestAnimationFrame.
export class Loop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.paused = false;
    this.fps = 0;
    this._running = false;
    this._raf = 0;
    this._last = 0;
    this._acc = 0;
    this._frames = 0;
    this._fpsTime = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this._running) return;
    this._running = true;
    const now = performance.now();
    this._last = now;
    this._acc = 0;
    this._frames = 0;
    this._fpsTime = now;
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  _tick(now) {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._tick);

    let frame = now - this._last;
    if (frame < 0) frame = 0;
    if (frame > 250) frame = 250;
    this._last = now;

    if (this.paused) {
      this._acc = 0;
    } else {
      this._acc += frame / 1000;
      let steps = 0;
      while (this._acc >= CFG.STEP && steps < CFG.MAX_STEPS) {
        this.update(CFG.STEP);
        this._acc -= CFG.STEP;
        steps++;
      }
      if (steps >= CFG.MAX_STEPS && this._acc > CFG.STEP) {
        this._acc = 0; // Spirale verhindern
      }
    }

    this.render(this.paused ? 0 : this._acc / CFG.STEP);

    // FPS: alle 0.5 s aktualisieren
    this._frames++;
    const elapsed = now - this._fpsTime;
    if (elapsed >= 500) {
      this.fps = (this._frames * 1000) / elapsed;
      this._frames = 0;
      this._fpsTime = now;
    }
  }
}
