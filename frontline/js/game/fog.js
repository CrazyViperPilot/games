// Nebel des Krieges pro Team: sichtbar (aktuell) und erkundet (je gesehen). Kein DOM.

const CONSTRUCTION_SIGHT = 150; // Baustellen sehen weniger

export class Fog {
  constructor(width, height, cell = 64) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.visible = new Uint8Array(this.cols * this.rows);
    this.explored = new Uint8Array(this.cols * this.rows);
  }

  /** Markiert alle Zellen, deren Mittelpunkt (plus halbe Zelle Toleranz) im Kreis liegt. */
  mark(x, y, r) {
    const { cell, cols, rows } = this;
    const c0 = Math.max(0, Math.floor((x - r) / cell));
    const c1 = Math.min(cols - 1, Math.floor((x + r) / cell));
    const r0 = Math.max(0, Math.floor((y - r) / cell));
    const r1 = Math.min(rows - 1, Math.floor((y + r) / cell));
    const lim = r + cell / 2;
    const lim2 = lim * lim;
    for (let row = r0; row <= r1; row++) {
      for (let c = c0; c <= c1; c++) {
        const dx = (c + 0.5) * cell - x;
        const dy = (row + 0.5) * cell - y;
        if (dx * dx + dy * dy <= lim2) {
          const i = row * cols + c;
          this.visible[i] = 1;
          this.explored[i] = 1;
        }
      }
    }
  }

  /** Sichtfeld für `team` neu berechnen (aus den lebenden eigenen Entities). */
  update(game, team) {
    this.visible.fill(0);
    for (const u of game.units) {
      if (u.alive && u.team === team && u.def.sight > 0) this.mark(u.x, u.y, u.def.sight);
    }
    for (const b of game.buildings) {
      if (!b.alive || b.team !== team) continue;
      const sight = b.built ? b.def.sight : CONSTRUCTION_SIGHT;
      if (sight > 0) this.mark(b.x, b.y, sight);
    }
  }

  cellIndex(x, y) {
    const c = Math.floor(x / this.cell);
    const r = Math.floor(y / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  isVisible(x, y) {
    const i = this.cellIndex(x, y);
    return i >= 0 && this.visible[i] === 1;
  }

  isExplored(x, y) {
    const i = this.cellIndex(x, y);
    return i >= 0 && this.explored[i] === 1;
  }

  revealAll() {
    this.visible.fill(1);
    this.explored.fill(1);
  }
}
