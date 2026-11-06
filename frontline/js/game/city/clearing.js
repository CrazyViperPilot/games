// Stadt (PRD §15), Räumen (seit v5.13/v5.16): Bäume fällen und Gebäude der Karte abreißen, damit dort gebaut werden kann;
// treeGone für die Darstellung der Bäume. Kein DOM, deterministisch.
import { CITY } from '../../data/city.js';
import { blockers } from '../mapdata.js';
import { nearMain } from './cells.js';

/**
 * Bäume fällen (seit v5.13): Was sperrt die Kacheln im Rechteck x0..x1, y0..y1 (px)? Bäume (Einzelbäume, Stadtbäume, Wald) und harte
 * Hindernisse (Fels, Häuser der Karte), vorab auf das Rechteck beschränkt. Gleiche Regeln wie grid.js (Stamm-Kachel, Kachelmitte im Kreis).
 */
export function woodScan(game, x0, y0, x1, y1) {
  const map = game.map;
  const near = (x, y, r) => x + r >= x0 && x - r <= x1 && y + r >= y0 && y - r <= y1;
  const forest = (o) => Math.round(o.r) % 2 === 0; // wie terrain.js: gerader Radius = Wald, sonst Fels
  return {
    trees: [...(map.town?.trees ?? []), ...(map.trees ?? [])].filter((t) => near(t.x, t.y, 0)),
    forests: map.obstacles.filter((o) => forest(o) && near(o.x, o.y, o.r)),
    rocks: map.obstacles.filter((o) => !forest(o) && near(o.x, o.y, o.r)),
    rects: blockers(map.town?.buildings ?? []).filter((o) => near(o.x, o.y, Math.max(o.w, o.h) / 2)),
  };
}

/**
 * Kacheln der Stadtzelle (col, row), die nur Bäume sperren, oder null, wenn die Zelle auch ohne Bäume gesperrt bliebe
 * (Hauptstadt, Fels, Wasser, steiler Hang, Haus, Gebäude). Leere Liste: nichts zu fällen.
 */
export function fellTiles(game, c, col, row, scan) {
  const g = game.grid;
  const T = g.tile;
  const S = c.cell;
  const k = S / T;
  if (nearMain(game.buildings.filter((b) => b.main), T, col * S, row * S)) return null;
  const inCircle = (o, x, y) => (x - o.x) ** 2 + (y - o.y) ** 2 <= o.r * o.r;
  const tiles = [];
  for (let r = row * k; r < (row + 1) * k; r++) {
    for (let q = col * k; q < (col + 1) * k; q++) {
      if (g.free(q, r)) continue;
      const i = g.idx(q, r);
      const x = g.center(q);
      const y = g.center(r);
      if (g.struct[i] || (game.relief?.cellBlocked(q, r) && !g.isFord(q, r))) return null;
      if (scan.rocks.some((o) => inCircle(o, x, y)) || scan.rects.some((o) => Math.abs(x - o.x) <= o.w / 2 && Math.abs(y - o.y) <= o.h / 2)) return null;
      const wood = scan.forests.some((o) => inCircle(o, x, y)) || scan.trees.some((t) => g.toCell(t.x) === q && g.toCell(t.y) === r);
      if (!wood) return null; // etwas anderes sperrt (z. B. Brückenrand)
      tiles.push(i);
    }
  }
  return tiles;
}

/**
 * Gebäude der Karte, die Räumen abreißen kann (seit v5.16, CITY.clearable) und die die Stadtzelle (col, row) berühren.
 * Liefert null, wenn eines davon besetzt ist (dann bleibt alles stehen).
 */
export function clearableAt(game, c, col, row) {
  const S = c.cell;
  const x0 = col * S;
  const y0 = row * S;
  const out = [];
  for (const b of game.map.town?.buildings ?? []) {
    if (!CITY.clearable.includes(b.kind) || b.angle) continue;
    if (b.x + b.w / 2 <= x0 || b.x - b.w / 2 >= x0 + S || b.y + b.h / 2 <= y0 || b.y - b.h / 2 >= y0 + S) continue;
    const h = game.houseBySrc?.get(b);
    if (h && h.occupants.length) return null;
    out.push(b);
  }
  return out;
}

/**
 * Gebäude der Karte abreißen (Räumen, seit v5.16): aus map.town.buildings, Häuserliste und Entities streichen, die Kacheln im Raster
 * wieder freigeben (außer wo anderes sperrt: Gebäude, Fels, Wald, Bäume, Wasser) und die Sperre der Stadtzellen neu bestimmen.
 */
export function demolish(game, b, scan) {
  const town = game.map.town;
  town.buildings.splice(town.buildings.indexOf(b), 1);
  scan.rects = scan.rects.filter((o) => !(o.x === b.x && o.y === b.y && o.w === b.w && o.h === b.h));
  const h = game.houseBySrc?.get(b);
  if (h) {
    game.houses.splice(game.houses.indexOf(h), 1);
    game.houseBySrc.delete(b);
    game.entities.delete(h.id);
    game.garrisoned = game.garrisoned.filter((o) => o !== h);
    game.ruins = game.ruins.filter((o) => o !== h);
  }
  const g = game.grid;
  const T = g.tile;
  const inCircle = (o, x, y) => (x - o.x) ** 2 + (y - o.y) ** 2 <= o.r * o.r;
  const pad = Math.max(b.w, b.h);
  const near = blockers(town.buildings).filter((o) => Math.abs(o.x - b.x) < pad + o.w && Math.abs(o.y - b.y) < pad + o.h);
  const wood = woodScan(game, b.x - b.w / 2, b.y - b.h / 2, b.x + b.w / 2, b.y + b.h / 2); // Bäume, Fels, Wald unter dem Gebäude
  const q0 = Math.max(0, Math.floor((b.x - b.w / 2) / T));
  const q1 = Math.min(g.cols - 1, Math.floor((b.x + b.w / 2) / T));
  const r0 = Math.max(0, Math.floor((b.y - b.h / 2) / T));
  const r1 = Math.min(g.rows - 1, Math.floor((b.y + b.h / 2) / T));
  for (let r = r0; r <= r1; r++) {
    for (let q = q0; q <= q1; q++) {
      const x = g.center(q);
      const y = g.center(r);
      if (Math.abs(x - b.x) > b.w / 2 || Math.abs(y - b.y) > b.h / 2) continue;
      const i = g.idx(q, r);
      const still =
        near.some((o) => Math.abs(x - o.x) <= o.w / 2 && Math.abs(y - o.y) <= o.h / 2) ||
        wood.rocks.some((o) => inCircle(o, x, y)) ||
        wood.forests.some((o) => inCircle(o, x, y)) ||
        wood.trees.some((t) => g.toCell(t.x) === q && g.toCell(t.y) === r && !treeGone(game, t.x, t.y)) ||
        (game.relief?.cellBlocked(q, r) && !g.isFord(q, r));
      g.terrain[i] = still ? 1 : 0;
    }
  }
  // Sperre der berührten Stadtzellen neu (gilt für beide Teams: blocked ist geteilt)
  const c = game.city[0];
  const S = c.cell;
  const k = S / T;
  const mains = game.buildings.filter((m) => m.main);
  for (let row = Math.floor((b.y - b.h / 2) / S); row <= Math.floor((b.y + b.h / 2) / S); row++) {
    for (let col = Math.floor((b.x - b.w / 2) / S); col <= Math.floor((b.x + b.w / 2) / S); col++) {
      if (col < 0 || row < 0 || col >= c.cols || row >= c.rows) continue;
      let bad = nearMain(mains, T, col * S, row * S);
      for (let r = row * k; !bad && r < (row + 1) * k; r++) for (let q = col * k; q < (col + 1) * k; q++) if (!g.free(q, r)) bad = true;
      c.blocked[row * c.cols + col] = bad ? 1 : 0;
    }
  }
}

/** Gefällte Zellen (1 = Bäume gefällt, für beide Teams gleich); das Feld entsteht beim ersten Fällen. */
export function felledOf(game) {
  const c = game.city[0];
  if (!c.felled) {
    const f = new Uint8Array(c.cols * c.rows);
    for (const o of game.city) o.felled = f;
  }
  return c.felled;
}

/**
 * Steht an (x, y) kein Baum mehr? Gefällt (Räumen) oder Stadtzelle ausgewiesen (Bäume weichen dem Grundstück). Für die Darstellung
 * der Bäume und Büsche (renderer.js, seit v5.13).
 */
export function treeGone(game, x, y) {
  const c = game.city?.[0];
  if (!c) return false;
  const col = Math.floor(x / c.cell);
  const row = Math.floor(y / c.cell);
  if (col < 0 || row < 0 || col >= c.cols || row >= c.rows) return false;
  const i = row * c.cols + col;
  return !!c.felled?.[i] || game.city.some((o) => o.kind[i]);
}
