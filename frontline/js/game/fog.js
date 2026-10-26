// Nebel des Krieges pro Team: sichtbar (aktuell) und erkundet (je gesehen). Mit Gelände sehen Einheiten von oben weiter, und
// Kämme verdecken, was dahinter liegt (Sichtstrahlen über das Höhenraster). Kein DOM.
import { BALANCE } from '../data/balance.js';
import { RELIEF, FINE_N } from './relief.js';

const CONSTRUCTION_SIGHT = 150; // Baustellen sehen weniger
const RAY_GAP = 44; // Abstand benachbarter Sichtstrahlen am Rand (px), kleiner als eine Nebelzelle
const RAY_STEP = 24; // Schrittweite entlang eines Strahls (px)
const SH = BALANCE.sightHeight;

/** Sichtweite mit Weitsicht von oben: + (Höhe − base) / per, höchstens + max. */
export function sightAt(relief, x, y, sight) {
  if (!relief) return sight;
  const h = relief.displayAt(x, y);
  return sight * (1 + Math.min(SH.max, Math.max(0, (h - SH.base) / SH.per)));
}

/** Augenhöhe einer Entity über dem Boden. */
function eyeOf(e) {
  if (e.kind === 'building') return SH.eye.bld;
  return e.def.armor === 'inf' ? SH.eye.inf : SH.eye.veh;
}

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

  /**
   * Zellen, die ein Beobachter bei (x, y) mit Augenhöhe `eye` und Sichtweite r über das Gelände sieht: Strahlen nach außen; ein
   * Punkt ist sichtbar, wenn die Linie zu seiner Oberkante (Boden + target) über allem bisherigen Gelände des Strahls liegt.
   * Liefert die Nebelzellen-Indizes (ohne Doppelte).
   */
  losCells(relief, x, y, eye, r) {
    const { cell, cols, rows } = this;
    const F = relief.fine;
    const step = RELIEF.step;
    const water = RELIEF.water;
    const lim = FINE_N - 1.000001;
    const h = (px, py) => {
      // bilinear wie relief.heightAt (nächster Punkt erzeugt Stufen, die wie Kuppen verdecken)
      const u = Math.min(lim, Math.max(0, px / step));
      const v = Math.min(lim, Math.max(0, py / step));
      const i = u | 0;
      const j = v | 0;
      const fu = u - i;
      const fv = v - j;
      const k = j * FINE_N + i;
      const z = (F[k] * (1 - fu) + F[k + 1] * fu) * (1 - fv) + (F[k + FINE_N] * (1 - fu) + F[k + FINE_N + 1] * fu) * fv;
      return z < water ? water : z;
    };
    const h0 = relief.displayAt(x, y) + eye;
    const out = [];
    const seen = this.stamp ?? (this.stamp = new Uint32Array(cols * rows));
    this.tick = (this.tick ?? 0) + 1;
    const tick = this.tick;
    const add = (px, py) => {
      const c = Math.floor(px / cell);
      const rr = Math.floor(py / cell);
      if (c < 0 || rr < 0 || c >= cols || rr >= rows) return;
      const i = rr * cols + c;
      if (seen[i] === tick) return;
      seen[i] = tick;
      out.push(i);
    };
    add(x, y);
    const reach = r + cell / 2;
    const n = Math.max(16, Math.ceil((2 * Math.PI * reach) / RAY_GAP));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let maxSlope = -Infinity;
      for (let d = RAY_STEP; d <= reach; d += RAY_STEP) {
        const px = x + dx * d;
        const py = y + dy * d;
        const ht = h(px, py);
        if ((ht + SH.target - h0) / d >= maxSlope) add(px, py);
        const sg = (ht - h0) / d;
        if (d >= SH.near && sg > maxSlope) maxSlope = sg;
      }
    }
    return out;
  }

  /** Markiert die Zellen eines Beobachters; mit Gelände über Sichtstrahlen (zwischengespeichert, solange er am selben Ort steht). */
  markEntity(relief, e, sight) {
    if (!relief || (e.kind === 'unit' && e.def.air)) {
      this.mark(e.x, e.y, sight);
      return;
    }
    const r = sightAt(relief, e.x, e.y, sight);
    const key = `${Math.round(e.x / 8)},${Math.round(e.y / 8)},${Math.round(r)}`;
    let cells = e.fogKey === key && e.fogRelief === relief.version ? e.fogCells : null;
    if (!cells) {
      cells = this.losCells(relief, e.x, e.y, eyeOf(e), r);
      e.fogKey = key;
      e.fogCells = cells;
      e.fogRelief = relief.version;
    }
    for (const i of cells) {
      this.visible[i] = 1;
      this.explored[i] = 1;
    }
  }

  /** Sichtfeld für `team` neu berechnen (aus den lebenden eigenen Entities). */
  update(game, team) {
    this.visible.fill(0);
    const relief = game.relief ?? null;
    for (const u of game.units) {
      if (u.alive && u.team === team && u.def.sight > 0) this.markEntity(relief, u, u.def.sight);
    }
    for (const b of game.buildings) {
      if (!b.alive || b.team !== team) continue;
      const sight = b.built ? b.def.sight : CONSTRUCTION_SIGHT;
      if (sight > 0) this.markEntity(relief, b, sight);
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
