// Festung (PRD §5a): Gefechtsturm mit Besatzung und Dachaufbau, Befehl „Festung ausbauen“ (Mauerring, Tore, Türme). Kein DOM.
// Die Besatzung nutzt die Häuserkampf-Mechanik (garrison.js): Soldaten sitzen im Turm, sind dort geschützt und schießen mit Reichweitenbonus.
import { BALANCE } from '../data/balance.js';
import { BUILDINGS } from '../data/buildings.js';
import { exitHouse, setIdle } from './movement.js';

const F = BALANCE.fortress;
const KEYS = ['bm', 'mun', 'fuel'];

const fail = (reason) => ({ ok: false, reason });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export const isTower = (b) => !!b && b.kind === 'building' && b.type === 'tower';

const variants = {};

/** Gebäudewerte eines Turms mit Aufbau: Turm plus Waffe (und Abfangwerte) des Aufbaus. So greifen Mörser-Zielwahl, Flak und Renderer ohne Sonderfälle. */
export function roofDef(kind) {
  if (!variants[kind]) {
    const r = BUILDINGS.tower.roofs[kind];
    variants[kind] = { ...BUILDINGS.tower, weapon: r.weapon, aa: r.aa, roofKind: kind };
  }
  return variants[kind];
}

/** { type: 'roof', buildingId, kind }: Aufbau (mortar, flak, sam) auf das Dach eines fertigen eigenen Turms, bezahlt aus dem Lager einer FOB in Reichweite. */
export function cmdRoof(game, team, cmd) {
  const b = game.getEntity(cmd.buildingId);
  if (!isTower(b) || b.team !== team || !b.alive) return fail('Nur auf einen eigenen Gefechtsturm');
  if (!b.built) return fail('Turm ist noch im Bau');
  if (b.roof || b.roofJob) return fail('Das Dach trägt schon einen Aufbau');
  const r = b.def.roofs[cmd.kind];
  if (!r) return fail('Unbekannter Aufbau');
  const payer = game.payerFor(team, b.x, b.y, r.cost);
  if (!payer) return fail(game.stockReason(team, b.x, b.y, r.cost));
  for (const k of KEYS) payer.store[k] -= r.cost[k] || 0;
  b.roofJob = { kind: cmd.kind, t: 0, time: r.time };
  return { ok: true };
}

/**
 * Plan für den Ausbau einer FOB: Mauerring im Abstand `ring` Zellen von der FOB-Mitte, ein Tor (2 Felder) in der Mitte jeder Seite,
 * `n` Türme an den Ecken, die am nächsten zu (tx, ty) liegen. Alle Angaben in Weltkoordinaten (Zellmitten).
 */
export function planFortress(game, fob, tx, ty, n) {
  const g = game.grid;
  const R = F.ring;
  const mc = fob.cx + Math.floor(fob.w / 2);
  const mr = fob.cy + Math.floor(fob.h / 2);
  const c = (i) => g.center(i);
  const tc = (m, s) => (s > 0 ? m + R : m - R + 1); // Zelle, deren Mitte den 2×2-Turm auf die Ecke legt
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: c(tc(mc, sx)), y: c(tc(mr, sy)) })));
  corners.sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty));
  return {
    towers: corners.slice(0, n),
    // Tor = 2 Felder: Linie über die zwei Zellen entlang der Mauer (Seiten oben/unten waagrecht, links/rechts senkrecht)
    gates: [[mc, mr - R, 1, 0], [mc, mr + R, 1, 0], [mc - R, mr, 0, 1], [mc + R, mr, 0, 1]].map(([i, j, di, dj]) => ({ x1: c(i), y1: c(j), x2: c(i + di), y2: c(j + dj) })),
    walls: [
      { x1: c(mc - R), y1: c(mr - R), x2: c(mc + R), y2: c(mr - R) },
      { x1: c(mc - R), y1: c(mr + R), x2: c(mc + R), y2: c(mr + R) },
      { x1: c(mc - R), y1: c(mr - R + 1), x2: c(mc - R), y2: c(mr + R - 1) },
      { x1: c(mc + R), y1: c(mr - R + 1), x2: c(mc + R), y2: c(mr + R - 1) },
    ],
  };
}

/**
 * { type: 'fortify', buildingId, towers?, tx?, ty?, ids? }: setzt die Baustellen für Türme, Tore und den Mauerring um eine fertige eigene FOB.
 * Was schon steht oder nicht bezahlbar ist, wird übersprungen; der Befehl lässt sich später wiederholen (er ergänzt nur).
 * Ohne `ids` bauen freie Baufahrzeuge und Soldaten automatisch; Türme bauen nur Baufahrzeuge.
 */
export function cmdFortify(game, team, cmd) {
  const f = game.getEntity(cmd.buildingId);
  if (!f || f.kind !== 'building' || f.type !== 'fob' || f.team !== team || !f.alive) return fail('Nur eine eigene FOB wird zur Festung');
  if (!f.built) return fail('FOB ist noch im Bau');
  const foe = game.map.spawns[1 - team];
  const plan = planFortress(game, f, cmd.tx ?? foe.x, cmd.ty ?? foe.y, cmd.towers ?? F.towers);
  const list = game.ownUnits(team, cmd.ids ?? []);
  const eng = list.filter((u) => u.def.builder === 'all').map((u) => u.id);
  const fort = list.filter((u) => u.def.builder).map((u) => u.id);
  let count = 0;
  let reason = 'Nichts zu bauen';
  const run = (c) => {
    const r = game.issue(team, c);
    if (r.ok) count += r.count ?? 1;
    else reason = r.reason;
  };
  // Turm: an der Ecke; steht dort schon etwas (Mauer, Mörser …), bis zu F.towerShift Zellen nach innen zur FOB hin (seit v5.03)
  const T = game.grid.tile;
  const towerAt = (t) => {
    const sx = Math.sign(f.x - t.x) || 1;
    const sy = Math.sign(f.y - t.y) || 1;
    for (let k = 0; k <= F.towerShift; k++) {
      for (const [dx, dy] of k ? [[k, k], [k, 0], [0, k]] : [[0, 0]]) {
        const p = { x: t.x + sx * dx * T, y: t.y + sy * dy * T };
        if (game.canPlace(team, 'tower', p.x, p.y).ok) return p;
      }
    }
    return t;
  };
  for (const t0 of plan.towers) {
    // steht an dieser Ecke schon ein eigener Turm (auch verschoben oder im Bau), bleibt es dabei
    if (game.buildings.some((b) => b.alive && b.team === team && b.type === 'tower' && Math.hypot(b.x - t0.x, b.y - t0.y) <= (F.towerShift + 2) * T)) continue;
    const t = towerAt(t0);
    run({ type: 'build', building: 'tower', x: t.x, y: t.y, ids: eng });
  }
  for (const q of plan.gates) run({ type: 'buildWall', building: 'gate', ids: fort, ...q });
  for (const w of plan.walls) run({ type: 'buildWall', building: 'wall', ids: fort, ...w });
  return count ? { ok: true, count } : fail(reason);
}

/** Besatzer fallen verletzt heraus, wenn der Turm zerstört wird (beim Abriss unverletzt). Vor dem Löschen der Entity aufrufen. */
export function ejectCrew(game, b) {
  for (const u of b.occupants.slice()) {
    exitHouse(game, u);
    setIdle(u);
    if (!b.demolished) {
      u.hp -= u.maxHp * F.ejectDamage;
      if (u.hp <= 0) {
        u.alive = false;
        game.bounty(u);
      }
    }
  }
  b.occupants = [];
}

/** Ein Schritt: Aufbauten werden fertig (Bauzeit läuft nur, solange der Turm steht). */
export function updateTowers(game, dt) {
  for (const b of game.buildings) {
    if (!b.roofJob || !b.alive) continue;
    b.roofJob.t += dt;
    if (b.roofJob.t < b.roofJob.time) continue;
    b.roof = b.roofJob.kind;
    b.def = roofDef(b.roof);
    b.roofJob = null;
    b.cooldown = 0;
    game.message(b.team, `${BUILDINGS.tower.roofs[b.roof].name} auf dem Gefechtsturm einsatzbereit`, b.x, b.y);
  }
}
