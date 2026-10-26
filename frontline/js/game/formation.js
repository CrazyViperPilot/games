// Formationen (nach Age of Empires II): Linie, Keil und Kolonne für Marsch- und Angriffsbefehle. Schwere Fahrzeuge vorn, dann
// Schützenpanzer, Infanterie, Scharfschützen, unbewaffnete Fahrzeuge hinten. Die Gruppe fährt geschlossen: Grundtempo ist das der
// langsamsten Bodeneinheit, wer vorausläuft, bremst, wer zurückliegt, holt mit eigenem Tempo auf. Hubschrauber fliegen locker mit.
import { BALANCE } from '../data/balance.js';
import { nearestPassable } from './movement.js';

export const FORMATIONS = ['loose', 'line', 'wedge', 'column'];
export const FORMATION_NAMES = { loose: 'Locker', line: 'Linie', wedge: 'Keil', column: 'Kolonne' };
const F = BALANCE.formation;

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Rang in der Formation: 0 Kampfpanzer, 1 bewaffnete leichte Fahrzeuge, 2 Infanterie, 3 Scharfschützen, 4 unbewaffnete Fahrzeuge. */
export function formationRank(u) {
  const d = u.def;
  if (d.armor === 'heavy') return 0;
  if (d.armor === 'light') return d.range > 0 ? 1 : 4;
  return d.stealth ? 3 : 2;
}

/** Plätze (seitlich, nach hinten) in Abständen s für n Einheiten; Reihe 0 liegt am Ziel. */
function layout(kind, n, s) {
  const out = [];
  if (kind === 'line') {
    // je Reihe von der Mitte nach außen belegt: die schweren Fahrzeuge stehen in der Mitte, die Infanterie an den Flügeln
    const rows = Math.ceil(n / F.lineMax);
    const per = Math.ceil(n / rows);
    for (let row = 0; row * per < n; row++) {
      const inRow = Math.min(per, n - row * per);
      const lats = Array.from({ length: inRow }, (_, j) => (j - (inRow - 1) / 2) * s).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
      for (const lat of lats) out.push({ lat, back: row * s });
    }
  } else if (kind === 'wedge') {
    // gefüllter Keil: Reihe r hat r + 1 Plätze, die Spitze vorn
    for (let r = 0, i = 0; i < n; r++) {
      const inRow = Math.min(r + 1, n - i);
      for (let j = 0; j < inRow; j++, i++) out.push({ lat: (j - (inRow - 1) / 2) * s, back: r * s * 0.85 });
    }
  } else {
    const width = n > F.columnSingle ? 2 : 1;
    for (let i = 0; i < n; i++) out.push({ lat: ((i % width) - (width - 1) / 2) * s, back: Math.floor(i / width) * s });
  }
  return out;
}

/**
 * Zielpunkte einer Formation um (tx, ty) in Marschrichtung (vom Schwerpunkt der Gruppe zum Ziel). Belegt nur passierbare Punkte
 * mit Mindestabstand; Hubschrauber bekommen Plätze dahinter. → [{ u, x, y }] (alle Einheiten), speed = Tempo der langsamsten Bodeneinheit
 */
export function formationSlots(game, team, units, tx, ty, kind) {
  const ground = units.filter((u) => !u.def.air);
  const air = units.filter((u) => u.def.air);
  const cx = ground.reduce((a, u) => a + u.x, 0) / ground.length;
  const cy = ground.reduce((a, u) => a + u.y, 0) / ground.length;
  let fx = tx - cx;
  let fy = ty - cy;
  const fl = Math.hypot(fx, fy);
  if (fl < 1) {
    fx = Math.cos(ground[0].angle || 0);
    fy = Math.sin(ground[0].angle || 0);
  } else {
    fx /= fl;
    fy /= fl;
  }
  const rx = -fy; // rechts der Marschrichtung
  const ry = fx;
  const s = Math.min(F.spacingMax, Math.max(F.spacingMin, 2 * Math.max(...ground.map((u) => u.def.radius)) + F.gap));
  const grid = game.grid;
  const taken = [];
  const free = (x, y) => grid.passable(grid.toCell(x), grid.toCell(y), team) && taken.every((p) => dist(p.x, p.y, x, y) >= s * 0.6);
  const place = (x, y) => {
    let best = free(x, y) ? { x, y } : null;
    for (let r = s * 0.5; !best && r <= s * 4; r += s * 0.5) {
      for (let k = 0; k < 12 && !best; k++) {
        const a = (k / 12) * Math.PI * 2;
        if (free(x + Math.cos(a) * r, y + Math.sin(a) * r)) best = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
      }
    }
    best ||= nearestPassable(grid, x, y, team) || { x: tx, y: ty };
    taken.push(best);
    return best;
  };
  // nach Rang sortiert; innerhalb eines Rangs kommen die Zielnächsten nach vorn, in jeder Reihe von links nach rechts (keine Kreuzungen)
  const lat = (u) => (u.x - cx) * rx + (u.y - cy) * ry;
  const sorted = ground.slice().sort((a, b) => formationRank(a) - formationRank(b) || a.id - b.id);
  const spots = layout(kind, sorted.length, s);
  const out = [];
  for (let i = 0; i < sorted.length; ) {
    const r0 = formationRank(sorted[i]);
    let j = i;
    while (j < sorted.length && formationRank(sorted[j]) === r0) j++;
    const us = sorted.slice(i, j).sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty) || a.id - b.id);
    const rows = new Map();
    for (const p of spots.slice(i, j)) rows.set(p.back, [...(rows.get(p.back) ?? []), p]);
    let k = 0;
    for (const back of [...rows.keys()].sort((a, b) => a - b)) {
      const row = rows.get(back).sort((a, b) => a.lat - b.lat);
      const who = us.slice(k, k + row.length).sort((a, b) => lat(a) - lat(b) || a.id - b.id);
      k += row.length;
      who.forEach((u, m) => {
        const p = row[m];
        const spot = place(tx - fx * p.back + rx * p.lat, ty - fy * p.back + ry * p.lat);
        out.push({ u, x: spot.x, y: spot.y });
      });
    }
    i = j;
  }
  // Hubschrauber locker hinter der Formation (sie überfliegen alles)
  air.forEach((u, k) => {
    const a = (k / Math.max(1, air.length)) * Math.PI * 2;
    out.push({ u, x: tx - fx * s * 2 + Math.cos(a) * s, y: ty - fy * s * 2 + Math.sin(a) * s });
  });
  const speed = Math.min(...ground.map((u) => u.def.speed));
  return { slots: out, speed };
}

/** Restweg auf dem geplanten Pfad. */
function pathLeft(u) {
  let d = 0;
  let x = u.x;
  let y = u.y;
  for (let i = u.pathIndex; i < u.path.length; i++) {
    d += dist(x, y, u.path[i].x, u.path[i].y);
    x = u.path[i].x;
    y = u.path[i].y;
  }
  return d;
}

/**
 * Tempo der Formationen je Schritt (vor der Bewegung): Grundtempo der langsamsten Einheit. Maßstab ist der Nachzügler (größter
 * Restweg): wer mehr als `lead` px vor ihm liegt, bremst bis auf `slowest`, damit die Formation geschlossen bleibt; wer mehr als `lag` px
 * hinter dem Mittel (Median) liegt, fährt sein eigenes Tempo und holt auf. Wer seit `stuck` s nicht vorankommt (festgefahren), zählt
 * nicht als Nachzügler. Setzt u.formMul. Aufgelöste Gruppen (kein Mitglied mehr im Formationsbefehl) werden entfernt.
 */
export function updateFormations(game) {
  for (const [id, f] of game.formations) {
    const members = [];
    for (const uid of f.ids) {
      const u = game.getEntity(uid);
      if (!u || u.order.form !== id) continue;
      if (u.order.type !== 'move' && u.order.type !== 'attackMove') continue;
      u.formMul = 1;
      if (u.targetId !== null || u.pathIndex >= u.path.length) continue; // im Gefecht oder angekommen
      const left = pathLeft(u);
      const p = (f.progress ??= new Map()).get(uid);
      if (!p || left < p.left - F.stuckDist) f.progress.set(uid, { left, t: game.time });
      members.push({ u, left, stuck: !!p && game.time - p.t > F.stuck });
    }
    if (members.length < 2) {
      if (!f.ids.some((uid) => game.getEntity(uid)?.order.form === id)) game.formations.delete(id);
      continue;
    }
    const sorted = members.map((m) => m.left).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const moving = members.filter((m) => !m.stuck);
    const rear = moving.length ? Math.max(...moving.map((m) => m.left)) : median;
    for (const m of members) {
      let k = f.speed / m.u.def.speed;
      const lead = rear - m.left; // > 0: vor dem Nachzügler
      if (m.left - median > F.lag) k = 1;
      else if (lead > F.lead) k *= Math.max(F.slowest, 1 - (lead - F.lead) / F.brake);
      m.u.formMul = Math.min(1, k);
    }
  }
}
