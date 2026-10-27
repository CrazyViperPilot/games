// Hot Zone und Bohrer (Konzept: kleiner Kreis, der in der Konfliktzone umherwandert; aktive Bohrer ziehen ihn an).
// Einheiten darin zählen bei der Punktewertung (zone.js) doppelt und bringen das doppelte Zonengeld. Kein DOM.
import { BALANCE } from '../data/balance.js';
import { makeRng } from '../core/rng.js';

const H = BALANCE.hot;
const MIN_FUEL = BALANCE.hot.drillMinFuel; // Mindestvorrat der FOB, um einen Bohrer zu starten

const fail = (reason) => ({ ok: false, reason });
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Startzustand der Hot Zone: in der Zonenmitte, eigener Zufallsstrom (verändert den Spielzufall nicht). */
export function createHot(game) {
  const z = game.zone;
  return {
    x: z.x,
    y: z.y,
    r: H.r,
    tx: z.x,
    ty: z.y,
    wanderT: 0,
    owner: -1,
    contested: false,
    counts: [0, 0],
    drillTarget: false, // wandert gerade zu einem aktiven Bohrer
    rng: makeRng((game.seed ^ 0x5bd1e995) >>> 0),
  };
}

/** Punkt in die Konfliktzone zurückziehen, so dass die Hot Zone ganz darin liegt. */
function clampToZone(zone, hot, x, y) {
  const maxR = Math.max(0, zone.r - hot.r);
  const d = dist(x, y, zone.x, zone.y);
  if (d <= maxR) return { x, y };
  return { x: zone.x + ((x - zone.x) / d) * maxR, y: zone.y + ((y - zone.y) / d) * maxR };
}

/** Aktive Bohrer, gruppiert nach versorgender FOB. Liefert das Ziel (erster Bohrer bzw. FOB mit den meisten) oder null. */
function drillTarget(game) {
  const groups = new Map();
  for (const b of game.buildings) {
    if (!b.alive || !b.built || !b.drill || b.drill.state !== 'active') continue;
    const sup = game.supplierOf(b);
    const key = sup ? sup.id : -b.id;
    let g = groups.get(key);
    if (!g) {
      g = { sup, count: 0, first: b };
      groups.set(key, g);
    }
    g.count++;
    if (b.drill.activatedAt < g.first.drill.activatedAt) g.first = b;
  }
  let best = null;
  for (const g of groups.values()) {
    if (!best || g.count > best.count || (g.count === best.count && g.first.drill.activatedAt < best.first.drill.activatedAt)) best = g;
  }
  if (!best) return null;
  if (best.count === 1 || !best.sup) return { x: best.first.x, y: best.first.y };
  return { x: best.sup.x, y: best.sup.y };
}

/** { type: 'drill', ids }: bereite Bohrer starten (Treibstoff kommt aus dem Lager der versorgenden FOB). */
export function cmdDrill(game, team, cmd) {
  let started = 0;
  let reason = 'Kein Bohrer gewählt';
  for (const id of new Set(cmd.ids || [])) {
    const b = game.getEntity(id);
    if (!b || b.kind !== 'building' || b.team !== team || !b.drill) continue;
    if (!b.built) {
      reason = 'Bohrer ist noch im Bau';
      continue;
    }
    const d = b.drill;
    if (d.state === 'warmup') {
      reason = `Bohrer wärmt auf (noch ${Math.ceil(d.readyAt - game.time)} s)`;
      continue;
    }
    if (d.state === 'active') {
      reason = 'Bohrer läuft bereits';
      continue;
    }
    if (d.state === 'cooldown') {
      reason = `Bohrer kühlt ab (noch ${Math.ceil(d.readyAt - game.time)} s)`;
      continue;
    }
    const sup = game.supplierOf(b);
    if (!sup || sup.store.fuel < MIN_FUEL) {
      reason = 'Keine FOB mit Treibstoff in Reichweite';
      continue;
    }
    d.state = 'active';
    d.activatedAt = game.time;
    d.endAt = game.time + b.def.drill.active;
    started++;
  }
  if (!started) return fail(reason);
  game.message(team, started > 1 ? `${started} Bohrer aktiviert` : 'Bohrer aktiviert', null, null);
  return { ok: true, count: started };
}

function updateDrills(game, dt) {
  for (const b of game.buildings) {
    if (!b.alive || !b.built || !b.drill) continue;
    const d = b.drill;
    const cfg = b.def.drill;
    if (d.builtAt === null) {
      d.builtAt = game.time;
      d.readyAt = game.time + cfg.warmup;
    }
    if (d.state === 'warmup' || d.state === 'cooldown') {
      const total = d.state === 'warmup' ? cfg.warmup : cfg.cooldown;
      d.frac = Math.min(1, Math.max(0, 1 - (d.readyAt - game.time) / total));
      if (game.time >= d.readyAt) d.state = 'ready';
      continue;
    }
    if (d.state === 'ready') d.frac = 1;
    if (d.state !== 'active') continue;
    d.frac = Math.min(1, Math.max(0, (d.endAt - game.time) / cfg.active));
    const need = cfg.fuelPerSec * dt;
    const sup = game.supplierOf(b);
    if (!sup || sup.store.fuel < need) {
      d.state = 'cooldown';
      d.readyAt = game.time + cfg.cooldown;
      game.message(b.team, 'Bohrer ohne Treibstoff abgeschaltet', b.x, b.y);
      continue;
    }
    sup.store.fuel -= need;
    game.teams[b.team].used.fuel += need;
    game.teams[b.team].rate.fuel -= cfg.fuelPerSec;
    if (game.time >= d.endAt) {
      d.state = 'cooldown';
      d.readyAt = game.time + cfg.cooldown;
      game.message(b.team, 'Bohrer abgekühlt: Pause', b.x, b.y);
    }
  }
}

/** Ein Schritt: Bohrer, Wanderung der Hot Zone und Besitz (Geld kommt je Einheit in zone.js). */
export function updateHot(game, dt) {
  updateDrills(game, dt);
  const hot = game.hot;
  const zone = game.zone;

  // Ziel: aktiver Bohrer (bzw. FOB mit den meisten), sonst zufälliger Punkt, alle 25–45 s oder bei Ankunft neu
  const dt0 = drillTarget(game);
  if (dt0) {
    const p = clampToZone(zone, hot, dt0.x, dt0.y);
    hot.tx = p.x;
    hot.ty = p.y;
    hot.drillTarget = true;
    hot.wanderT = 0;
  } else {
    if (hot.drillTarget) hot.wanderT = 0;
    hot.drillTarget = false;
    hot.wanderT -= dt;
    if (hot.wanderT <= 0 || dist(hot.x, hot.y, hot.tx, hot.ty) < 8) {
      const a = hot.rng.range(0, Math.PI * 2);
      const rad = Math.sqrt(hot.rng.next()) * Math.max(0, zone.r - hot.r);
      hot.tx = zone.x + Math.cos(a) * rad;
      hot.ty = zone.y + Math.sin(a) * rad;
      hot.wanderT = hot.rng.range(H.wanderMin, H.wanderMax);
    }
  }
  const d = dist(hot.x, hot.y, hot.tx, hot.ty);
  if (d > 1e-6) {
    const step = Math.min(d, (hot.drillTarget ? H.speed : H.wanderSpeed) * dt); // frei wandern: 1/3 Tempo
    hot.x += ((hot.tx - hot.x) / d) * step;
    hot.y += ((hot.ty - hot.y) / d) * step;
  }

  // Besitz: nur ein Team darin = Besitzer (Geld)
  const counts = [0, 0];
  for (const u of game.units) {
    if (u.alive && dist(u.x, u.y, hot.x, hot.y) <= hot.r) counts[u.team]++;
  }
  hot.counts = counts;
  hot.contested = counts[0] > 0 && counts[1] > 0;
  let owner = -1;
  if (!hot.contested) owner = counts[0] > 0 ? 0 : counts[1] > 0 ? 1 : -1;
  if (owner !== hot.owner && owner >= 0) game.message(-1, `${BALANCE.teamNames[owner]} hält die Hot Zone`);
  hot.owner = owner;
}
