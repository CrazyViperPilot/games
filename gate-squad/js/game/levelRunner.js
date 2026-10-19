// Spawnt Level-Events, sobald die zurückgelegte Distanz ihren Wert `d` erreicht.
import { spawnWave } from '../entities/enemies.js';
import { spawnGateRow } from '../entities/gates.js';
import { spawnCrate } from '../entities/crates.js';

export class LevelRunner {
  constructor() {
    this.events = [];
    this.index = 0;
  }

  reset(level) {
    const src = level && level.events ? level.events : [];
    this.events = src.slice().sort((a, b) => a.d - b.d);
    this.index = 0;
  }

  get done() {
    return this.index >= this.events.length;
  }

  update(game) {
    const evs = this.events;
    while (this.index < evs.length && evs[this.index].d <= game.distance) {
      const ev = evs[this.index];
      this.index++;
      if (ev.t === 'wave') spawnWave(game, ev);
      else if (ev.t === 'gates' || ev.t === 'gate' || ev.t === 'weapon') spawnGateRow(game, ev);
      else if (ev.t === 'crate') spawnCrate(game, ev);
    }
  }
}
