// KI-Gegner, Logistik: LKW-Rollen, Lieferant, Pendler, Versorger, Kisten einsammeln.
// Methoden der Klasse AI (js/ai/ai.js), eingehängt über Object.assign. Befehle nur über game.issue. Kein DOM.

import { CITY } from '../../data/city.js';
import { KINDS } from '../../data/citykinds.js';
import { ownWork } from '../../game/logistics.js';
import { BALANCE } from '../../data/balance.js';
import { SUPPLY_FROM, PEND_PER, PEND_MAX, FOB_WANT, SUPPLY_BEHIND, SUPPLY_MIN, SURPLUS_MIN, ROUTE_HOLD, WORK_SOURCE_NEAR, WORK_SOURCE_TRUCKS, WORK_SOURCE_MIN_RATE, CRATE_EVERY, CRATE_RANGE, FORT_WANT } from '../../data/ai.js';
import { DEF_RANGE, dist, unitVec } from './util.js';

const KEYS = ['bm', 'mun', 'fuel'];
const CAP = BALANCE.logistics.truckCapacity;

/** Eigene LKW und Hubschrauber außer `except`, die ab dem Werk mit Anker `a` pendeln (Route mit fromWork, seit v5.70). */
function workTrucks(s, a, except) {
  let n = 0;
  for (const u of s.units) if (u !== except && u.order.type === 'route' && u.order.work === a) n++;
  return n;
}

/** Summe der Ladung eines LKW. */
const cargoTotal = (u) => u.cargo.bm + u.cargo.mun + u.cargo.fuel;

export const logisticsMethods = {
  /** Eigene fertige Werke mit Ausgangslager (CITY.pickup, seit v5.70), nach Id sortiert; ohne Stadt leer. */
  pickupWorks() {
    const g = this.game;
    const c = g.city?.[this.team];
    if (!c) return [];
    const out = [];
    for (const [i, e] of c.ents) if (e.alive && ownWork(g, this.team, i) === e) out.push(e);
    return out.sort((a, b) => a.id - b.id);
  },

  // ---- LKW ---------------------------------------------------------------------------

  /** Soll-Zahl der LKW je Rolle: Pendler je PEND_PER Außen-FOBs (höchstens PEND_MAX), Versorger (seit v5.03 kein Lieferant für FOB-Baustellen). */
  truckQuota(s) {
    const pend = Math.min(PEND_MAX, Math.ceil(Math.max(0, s.fobs.length - 1) / PEND_PER));
    const vers = s.combat.length >= SUPPLY_FROM ? 1 : 0;
    return { pend, vers, total: pend + vers };
  },

  /** Rollen zuordnen (bestehende bleiben, wenn die Quote reicht); überzählige LKW pendeln. */
  assignRoles(s) {
    const q = this.truckQuota(s);
    const have = { pend: 0, vers: 0 };
    const alive = new Set(s.trucks.map((x) => x.id));
    for (const id of [...this.roles.keys()]) if (!alive.has(id)) this.roles.delete(id);
    for (const id of [...this.routes.keys()]) if (!alive.has(id)) this.routes.delete(id);
    for (const tr of s.trucks) {
      const r = this.roles.get(tr.id);
      if (r && have[r] < q[r]) have[r]++;
      else this.roles.delete(tr.id);
    }
    for (const tr of s.trucks) {
      if (this.roles.has(tr.id)) continue;
      const r = ['pend', 'vers'].find((k) => have[k] < q[k]) ?? 'pend';
      this.roles.set(tr.id, r);
      have[r]++;
    }
  },

  /** Soll-Lagerstand einer FOB je Sorte: die Zonen-FOB braucht am meisten (Mörser, Flak, Nachladen); die Hauptstadt ist unendlich. */
  wantOf(s, f) {
    const w = { ...(f === s.zoneFob ? FOB_WANT.zone : f === s.home ? FOB_WANT.home : FOB_WANT.other) }; // Kopie: FORT_WANT kommt dazu
    if (s.own.some((b) => b.type === 'tower' && dist(b.x, b.y, f.x, f.y) <= DEF_RANGE)) {
      w.bm += FORT_WANT.bm; // Festung: Türme und Mauern brauchen Material und Munition
      w.mun += FORT_WANT.mun;
    }
    return w;
  },

  manageTrucks(s) {
    this.assignRoles(s);
    const fobsLoaded = s.builtFobs.length > 0;
    if (!fobsLoaded) return;
    const taken = new Set();
    for (const tr of s.trucks) {
      const role = this.roles.get(tr.id);
      if (role === 'vers') this.manageVersorger(s, tr);
    }
    for (const tr of s.trucks) {
      if (this.roles.get(tr.id) === 'pend') this.managePendler(s, tr, taken);
    }
    for (const h of s.helis) this.managePendler(s, h, taken); // Transporthubschrauber pendeln wie LKW (Luftweg)
  },

  /** Fertige FOB mit dem größten Vorrat einer Sorte. */
  richest(s, k) {
    let best = null;
    for (const f of s.builtFobs) if (!best || f.store[k] > best.store[k]) best = f;
    return best;
  },

  nearestBuilt(s, x, y) {
    let best = null;
    let bd = Infinity;
    for (const f of s.builtFobs) {
      const d = dist(f.x, f.y, x, y);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  },

  /**
   * Bester Transport: Ziel-FOB und Sorte mit dem größten Bedarf (Zonen-FOB bevorzugt), Quelle = FOB mit dem
   * größten Überschuss dieser Sorte (mindestens SURPLUS_MIN) oder seit v5.70 ein eigenes Werk mit Ausgangslager, dessen Ware die Sorte ist
   * (workSource). `tr` ist der LKW, der die Route plant (er zählt nicht als Pendler am Werk mit).
   */
  pendlerPlan(s, taken, tr = null) {
    let best = null;
    for (const to of s.builtFobs) {
      const wTo = this.wantOf(s, to);
      for (const k of KEYS) {
        if (taken.has(to.id + k)) continue;
        const need = (wTo[k] - to.store[k]) / wTo[k];
        if (need < 0.3) continue;
        const score = need * (to === s.zoneFob ? 1.5 : to === s.home ? 1.2 : 1);
        if (best && score <= best.score) continue;
        let src = null;
        let sv = SURPLUS_MIN - 1;
        for (const f of s.builtFobs) {
          if (f === to) continue;
          const sur = f.store[k] - 0.5 * this.wantOf(s, f)[k];
          if (sur > sv) {
            sv = sur;
            src = f;
          }
        }
        // Eigenes Werk (seit v5.70, nie für die Hauptstadt): wenn keine FOB Überschuss hat oder das Werk nah genug liegt
        const near = to === s.home ? null : this.workSource(s, to, k, tr);
        if (near && (!src || near.d <= WORK_SOURCE_NEAR * dist(src.x, src.y, to.x, to.y))) best = { from: null, work: near.work, to, k, score };
        else if (src) best = { from: src, work: null, to, k, score };
      }
    }
    return best;
  },

  /**
   * Nächstes eigenes Werk mit Ausgangslager (CITY.pickup), dessen Ware k ist, für die Bedarfs-FOB `to` (seit v5.70). Höchstens
   * WORK_SOURCE_TRUCKS LKW je Werk gleichzeitig (ohne `tr`). Liefert { work, d } oder null.
   */
  workSource(s, to, k, tr) {
    const c = this.game.city?.[this.team];
    let best = null;
    let bd = Infinity;
    for (const w of s.pickupWorks) {
      if (CITY.chain[KINDS[c.kind[w.cityCell] - 1]].to !== k) continue;
      if (workTrucks(s, w.cityCell, tr) >= WORK_SOURCE_TRUCKS) continue;
      if (!this.workRuns(w)) continue;
      const d = dist(w.x, w.y, to.x, to.y);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    return best ? { work: best, d: bd } : null;
  },

  /** Liefert das Werk gerade? Ausstoß je s ab WORK_SOURCE_MIN_RATE oder Ausgangslager ab SURPLUS_MIN (seit v5.70). */
  workRuns(w) {
    const c = this.game.city[this.team];
    return c.workOut[w.cityCell] >= WORK_SOURCE_MIN_RATE || c.out[w.cityCell] >= SURPLUS_MIN;
  },

  /**
   * Pendler: Route von der Überschuss-FOB oder vom eigenen Werk (seit v5.70) zur Bedarfs-FOB, Ladungsart nach Engpass.
   * Ab einem Werk gilt die Route, solange das Werk steht und die Bedarfs-FOB Bedarf hat; der LKW wartet dort auf Ware.
   */
  managePendler(s, tr, taken) {
    const g = this.game;
    const cur = this.routes.get(tr.id);
    const o = tr.order;
    if (cur) {
      const from = g.getEntity(cur.fromId);
      const to = g.getEntity(cur.toId);
      const active = o.type === 'route' && o.fromId === cur.fromId && o.toId === cur.toId;
      if (active && from && to && to.built) {
        const need = (this.wantOf(s, to)[cur.k] - to.store[cur.k]) / this.wantOf(s, to)[cur.k];
        // Quelle Werk (type 'city', kein Lager der FOB): gilt, solange es liefert oder der LKW schon über 50 geladen hat; Quelle FOB wie bisher
        const valid = from.type === 'city' ? (this.workRuns(from) || tr.cargo[cur.k] > 50) && need > 0.1 : (tr.cargo[cur.k] > 50 || from.store[cur.k] >= 60) && need > 0.1;
        if (valid || g.time - cur.t0 < ROUTE_HOLD) {
          taken.add(cur.toId + cur.k);
          return;
        }
      }
    }
    const plan = this.pendlerPlan(s, taken, tr);
    if (!plan) {
      if (o.type === 'route' && cur) {
        // nichts mehr zu tun: Ladung (falls vorhanden) abliefern, sonst anhalten
        if (cargoTotal(tr) > 50) g.issue(this.team, { type: 'unload', ids: [tr.id], fobId: cur.toId });
        else g.issue(this.team, { type: 'stop', ids: [tr.id] });
        this.routes.delete(tr.id);
      }
      return;
    }
    const r = plan.work
      ? g.issue(this.team, { type: 'route', ids: [tr.id], fromWork: plan.work.cityCell, toId: plan.to.id, preset: plan.k })
      : g.issue(this.team, { type: 'route', ids: [tr.id], fromId: plan.from.id, toId: plan.to.id, preset: plan.k });
    if (r.ok) {
      const src = plan.work ?? plan.from;
      this.routes.set(tr.id, { fromId: src.id, toId: plan.to.id, k: plan.k, t0: g.time });
      taken.add(plan.to.id + plan.k);
    }
  },

  /** Versorger: folgt dem Schwerpunkt der Armee ~150 px dahinter; lädt Munition/Treibstoff nach, wenn Ladung < 25 %. */
  manageVersorger(s, tr) {
    const g = this.game;
    const o = tr.order.type;
    if (o === 'load' || o === 'unload') return;
    const field = s.combat.filter((u) => u.order.type !== 'move');
    const pts = field.length ? field : s.combat;
    if (!pts.length) return;
    const cx = pts.reduce((a, u) => a + u.x, 0) / pts.length;
    const cy = pts.reduce((a, u) => a + u.y, 0) / pts.length;

    if (cargoTotal(tr) < CAP * SUPPLY_MIN) {
      let dMun = 0;
      let dFuel = 0;
      for (const u of s.combat) {
        dMun += (u.def.ammoMax || 0) - u.ammo;
        dFuel += (u.def.fuelMax || 0) - u.fuel;
      }
      const k = dMun >= dFuel ? 'mun' : 'fuel';
      const src = this.richest(s, k);
      if (src && src.store[k] >= 100) {
        if (this.once(`vld${tr.id}`, 6)) g.issue(this.team, { type: 'load', ids: [tr.id], fobId: src.id, preset: k });
        return;
      }
    }
    const f = this.nearestBuilt(s, cx, cy);
    const v = f ? unitVec(f.x - cx, f.y - cy) : { x: 0, y: 0 };
    const p = this.freeNear(cx + v.x * SUPPLY_BEHIND, cy + v.y * SUPPLY_BEHIND);
    const last = this.supplyAt.get(tr.id);
    const moved = !last || dist(last.x, last.y, p.x, p.y) > 120;
    if (!(moved || (o === 'idle' && dist(tr.x, tr.y, p.x, p.y) > 120))) return;
    if (!this.once(`vmv${tr.id}`, 4)) return;
    this.supplyAt.set(tr.id, p);
    g.issue(this.team, { type: 'move', ids: [tr.id], x: p.x, y: p.y });
  },

  /**
   * Versorgungskisten: freie Soldaten (lieber außerhalb der Zone, wo sie kein Zonengeld bringen) holen Kisten in der Nähe; sie
   * tragen sie von selbst zur nächsten FOB. Die KI weiß wie der Spieler nur, was im Lagebild steht (Fundorte, zuletzt gesehen).
   */
  collectCrates(s) {
    const g = this.game;
    if (!g.crates || !g.crates.length || !s.builtFobs.length || !this.once('crates', CRATE_EVERY)) return;
    const t = this.team;
    const busy = s.units.filter((u) => u.crate || u.order.type === 'pickup');
    let free = this.cfg.cratePickers - busy.length;
    if (free <= 0) return;
    const taken = new Set(busy.map((u) => u.order.targetId));
    const raiding = this.raid ? this.raid.ids : null;
    const z = s.zone;
    const known = g.crateSeen[t];
    const crates = g.crates.filter((c) => {
      const m = known.get(c.id);
      return c.state === 'ground' && m && !taken.has(c.id) && !this.danger(s, m.x, m.y);
    });
    // frei: untätig oder auf dem Weg zum Sammelpunkt (frisch ausgebildet); nicht in einem Haus, nicht beim Überfall
    const pool = s.units.filter(
      (u) =>
        u.def.armor === 'inf' &&
        !u.def.hero &&
        !u.crate &&
        !u.house &&
        (u.order.type === 'idle' || u.order.type === 'move') &&
        !this.dryKind(u) &&
        !(raiding && raiding.has(u.id)),
    );
    for (const c of crates) {
      if (free <= 0) break;
      let best = null;
      let bd = CRATE_RANGE;
      for (const u of pool) {
        // Soldaten in der Zone verdienen dort Geld: sie zählen, als stünden sie weiter weg
        const d = dist(u.x, u.y, c.x, c.y) + (dist(u.x, u.y, z.x, z.y) <= z.r ? 800 : 0);
        if (d < bd) {
          best = u;
          bd = d;
        }
      }
      if (!best || !g.issue(t, { type: 'pickup', ids: [best.id], crateId: c.id }).ok) continue;
      pool.splice(pool.indexOf(best), 1);
      free--;
    }
  },
};
