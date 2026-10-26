// Zellenraster für Terrain, Gebäude und Tore. Kein DOM.

export class Grid {
  constructor(cols, rows, tile) {
    this.cols = cols;
    this.rows = rows;
    this.tile = tile;
    const n = cols * rows;
    this.terrain = new Uint8Array(n); // 1 = Hindernis
    this.struct = new Int32Array(n); // Gebäude-ID oder 0
    this.gateTeam = new Int8Array(n).fill(-1); // Team des Tors oder -1
  }

  idx(c, r) {
    return r * this.cols + c;
  }

  inBounds(c, r) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  /** Weltkoordinate -> Zellenindex (Spalte oder Zeile). */
  toCell(v) {
    return Math.floor(v / this.tile);
  }

  /** Weltmitte einer Zellenkoordinate. */
  center(c) {
    return c * this.tile + this.tile / 2;
  }

  /** Begehbar für `team`: im Feld, kein Terrain, und kein Gebäude oder eigenes Tor. */
  passable(c, r, team) {
    if (!this.inBounds(c, r)) return false;
    const i = this.idx(c, r);
    if (this.terrain[i]) return false;
    if (this.struct[i] === 0) return true;
    return this.gateTeam[i] === team;
  }

  /** Frei für Bau: im Feld, kein Terrain, kein Gebäude. */
  free(c, r) {
    if (!this.inBounds(c, r)) return false;
    const i = this.idx(c, r);
    return this.terrain[i] === 0 && this.struct[i] === 0;
  }

  /** Markiert Zellen als Hindernis, deren Mittelpunkt im Kreis liegt. */
  rasterizeObstacles(obstacles) {
    const t = this.tile;
    for (const o of obstacles) {
      const c0 = Math.max(0, Math.floor((o.x - o.r) / t));
      const c1 = Math.min(this.cols - 1, Math.floor((o.x + o.r) / t));
      const r0 = Math.max(0, Math.floor((o.y - o.r) / t));
      const r1 = Math.min(this.rows - 1, Math.floor((o.y + o.r) / t));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const dx = this.center(c) - o.x;
          const dy = this.center(r) - o.y;
          if (dx * dx + dy * dy <= o.r * o.r) this.terrain[this.idx(c, r)] = 1;
        }
      }
    }
  }

  /** Markiert Zellen als Hindernis, deren Mittelpunkt im Rechteck {x,y,w,h} (Mitte, Größe) liegt. */
  rasterizeRects(rects) {
    const t = this.tile;
    for (const o of rects) {
      const c0 = Math.max(0, Math.floor((o.x - o.w / 2) / t));
      const c1 = Math.min(this.cols - 1, Math.floor((o.x + o.w / 2) / t));
      const r0 = Math.max(0, Math.floor((o.y - o.h / 2) / t));
      const r1 = Math.min(this.rows - 1, Math.floor((o.y + o.h / 2) / t));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const dx = Math.abs(this.center(c) - o.x);
          const dy = Math.abs(this.center(r) - o.y);
          if (dx <= o.w / 2 && dy <= o.h / 2) this.terrain[this.idx(c, r)] = 1;
        }
      }
    }
  }

  /** Gelände (relief.js): zu steile Hänge und Seen sind Hindernisse. relief = null (flache Karte) ändert nichts. */
  rasterizeRelief(relief) {
    if (!relief) return;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) if (relief.cellBlocked(c, r)) this.terrain[this.idx(c, r)] = 1;
    }
  }

  /** Bäume blockieren die Zelle, in der ihr Stamm steht. */
  rasterizeTrees(trees) {
    for (const t of trees) {
      const c = this.toCell(t.x);
      const r = this.toCell(t.y);
      if (this.inBounds(c, r)) this.terrain[this.idx(c, r)] = 1;
    }
  }

  /** Setzt den Fußabdruck eines Gebäudes (Tore zusätzlich mit Teamkennung). */
  occupy(b) {
    const isGate = !!(b.def && b.def.gate);
    for (let r = b.cy; r < b.cy + b.h; r++) {
      for (let c = b.cx; c < b.cx + b.w; c++) {
        if (!this.inBounds(c, r)) continue;
        const i = this.idx(c, r);
        this.struct[i] = b.id;
        if (isGate) this.gateTeam[i] = b.team;
      }
    }
  }

  /** Löscht den Fußabdruck eines Gebäudes (nur Zellen, die ihm gehören). */
  release(b) {
    for (let r = b.cy; r < b.cy + b.h; r++) {
      for (let c = b.cx; c < b.cx + b.w; c++) {
        if (!this.inBounds(c, r)) continue;
        const i = this.idx(c, r);
        if (this.struct[i] === b.id) {
          this.struct[i] = 0;
          this.gateTeam[i] = -1;
        }
      }
    }
  }
}
