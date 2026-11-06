// KI-Gegner, Kampf: Armee, Angriffswellen, Rückzug, Artillerie, Späher, Flankenangriff, Häuserkampf, Kommandeur.
// Methoden der Klasse AI (js/ai/ai.js), eingehängt über Object.assign. Befehle nur über game.issue. Kein DOM.

import { CITY } from '../../data/city.js';
import { standsOf, freeSpace } from '../../game/aircraft.js';
import { BALANCE } from '../../data/balance.js';
import { UNITS } from '../../data/units.js';
import { canGarrison } from '../../game/garrison.js';
import { radioEta } from '../../game/radio.js';
import { weatherSight } from '../../game/weather.js';
import { RESERVE_FROM, WAVE_NEUTRAL, SCOUT_EVERY, SCOUT_MOVE, JET_GROUP, JET_EVERY, JET_QUEUE, THREAT_RANGE, THREAT_DANGER, GATHER_DIST, ZONE_GATHER_DIST, RALLY_MOVE, RESERVE, DRY, THREAT_PER_UNIT, WAVE_ODDS, WAVE_PATIENCE, WAVE_MIN, SCOUT_MIN_ARMY, SCOUT_FROM, SCOUT_FUEL, SCOUT_REFILL, WX_SCOUT_SIGHT, WX_SCOUT_ARMY, WX_SCOUT_FROM, WX_FOG_SIGHT, WX_FOG_WAVE, RAID_MIN, RAID_SHARE, FALLBACK_ODDS, FALLBACK_MIN_FOES, FALLBACK_DIST, FALLBACK_HOLD, ART_BEHIND, ART_EVERY, GARRISON_SHARE, GARRISON_RANGE, GARRISON_EVERY, STORM_EVERY, STORM_RANGE, STORM_RATIO, STORM_WIRE, STORM_MIN, STORM_MAX, HOUSE_WORK_EVERY, HOUSE_WORK_ORDER, HOUSE_WORK_RESERVE, CMD_BEHIND, CMD_DANGER, CMD_MOVE, RADIO_NEAR, RADIO_EVERY, RADIO_GATHER, RADIO_GATHER_R, RADIO_GATHER_SHARE } from '../../data/ai.js';
import { DEF_RANGE, ZONE_FOB_R, TWO_PI, dist, unitVec } from './util.js';

const SCOUT_MONEY = UNITS.littlebird.cost.money; // Geld, ab dem ein Späher ausgebildet wird

export const combatMethods = {
  /**
   * Kampfflugzeuge (seit v5.03): hält CITY.ai.jets[Schwierigkeit] F-16 an ihren Flughäfen (Geld über jetReserve) und schickt alle
   * startbereiten paarweise los: zuerst gegen gesehene Hubschrauber und Flugzeuge, sonst gegen gepanzerte Fahrzeuge in der
   * Konfliktzone oder nahe der eigenen Basis, sonst auf Patrouille über die Zone. Rückkehr, Tanken und Nachladen regelt aircraft.js.
   */
  jets(s) {
    const g = this.game;
    const t = this.team;
    const ports = standsOf(g, t);
    if (!ports.length) return;
    const jets = s.units.filter((u) => u.def.jet);
    const want = CITY.ai.jets[this.difficulty] ?? CITY.ai.jets.normal;
    const queued = ports.reduce((n, b) => n + b.queue.length, 0);
    if (jets.length + queued < want && g.teams[t].res.money >= UNITS.f16.cost.money + CITY.ai.jetReserve) {
      const b = ports.filter((p) => p.queue.length < JET_QUEUE && freeSpace(g, p) > 0).sort((p, q) => p.queue.length - q.queue.length || p.id - q.id)[0];
      if (b) g.issue(t, { type: 'train', buildingId: b.id, unit: 'f16' });
    }
    const ready = jets.filter((u) => u.parked && u.jet?.ready && u.order.type === 'idle').sort((a, b) => a.id - b.id);
    if (!ready.length || !this.once('jets', JET_EVERY)) return;
    const air = s.enemies.filter((e) => e.def.air && !e.parked);
    const armor = s.enemies.filter((e) => (e.def.armor === 'heavy' || e.def.armor === 'light') && (dist(e.x, e.y, s.zone.x, s.zone.y) <= s.zone.r || dist(e.x, e.y, s.ax, s.ay) <= DEF_RANGE * 2));
    const near = (list) => list.slice().sort((a, b) => dist(a.x, a.y, s.ax, s.ay) - dist(b.x, b.y, s.ax, s.ay) || a.id - b.id);
    const targets = [...near(air), ...near(armor)];
    for (let k = 0; k < ready.length; k += JET_GROUP) {
      const ids = ready.slice(k, k + JET_GROUP).map((u) => u.id);
      const tg = targets[(k / JET_GROUP) % Math.max(1, targets.length)];
      if (tg) g.issue(t, { type: 'attack', ids, targetId: tg.id });
      else g.issue(t, { type: 'attackMove', ids, x: s.zone.x, y: s.zone.y });
    }
  },

  /** Sammelpunkt: an der Zonen-FOB (Richtung Basis), sonst Richtung Zone vor der Hauptstadt. */
  gatherPoint(s) {
    if (s.zoneFob && s.zoneFob.built) {
      const v = unitVec(s.ax - s.zoneFob.x, s.ay - s.zoneFob.y);
      const p = this.highGround(s.zoneFob.x + v.x * ZONE_GATHER_DIST, s.zoneFob.y + v.y * ZONE_GATHER_DIST, 120);
      return this.freeNear(p.x, p.y);
    }
    return this.freeNear(s.ax + s.dir.x * GATHER_DIST, s.ay + s.dir.y * GATHER_DIST);
  },

  /** Gegner (sichtbar) in der Nähe eines Punktes: Malus für FOB-Ziele. */
  danger(s, x, y) {
    return s.enemies.some((e) => dist(e.x, e.y, x, y) <= THREAT_DANGER) ? 2 : 0;
  },

  // ---- Verteidigung und Rückzug ---------------------------------------------------

  /** Gegner im Bauradius einer eigenen FOB: Kampfeinheiten in der Nähe greifen dort an. */
  defend(s) {
    if (!s.enemies.length) return;
    for (const f of s.builtFobs) {
      const near = s.enemies.filter((e) => dist(e.x, e.y, f.x, f.y) <= DEF_RANGE);
      if (!near.length) continue;
      const cx = near.reduce((a, e) => a + e.x, 0) / near.length;
      const cy = near.reduce((a, e) => a + e.y, 0) / near.length;
      const ids = s.combat
        .filter((u) => !u.house && dist(u.x, u.y, cx, cy) <= THREAT_RANGE) // Besatzer halten ihr Haus
        .filter((u) => !(u.order.type === 'attackMove' && dist(u.order.x, u.order.y, cx, cy) < 120))
        .filter((u) => u.order.type !== 'attack')
        .map((u) => u.id);
      if (ids.length) this.game.issue(this.team, { type: 'attackMove', ids, x: cx, y: cy });
    }
  },

  /** Einheit mit fast leerem Munitions- oder Treibstoffvorrat (Anteil < DRY)? Liefert 'mun', 'fuel' oder null. */
  dryKind(u) {
    if (u.def.ammoMax > 0 && u.ammo < DRY * u.def.ammoMax) return 'mun';
    if (u.def.fuelMax > 0 && u.fuel < DRY * u.def.fuelMax) return 'fuel';
    return null;
  },

  /**
   * Einheiten mit fast leerem Vorrat ziehen sich zur nächsten FOB (mit Vorrat) oder zum Versorger zurück,
   * sofern sie nicht schon dort nachgefüllt werden. Nicht bei Angriff auf die Basis.
   */
  retreat(s) {
    if (s.alarm || !s.builtFobs.length) return;
    const groups = new Map(); // Zielschlüssel -> { x, y, ids }
    const supplyTrucks = s.trucks.filter((t) => this.roles.get(t.id) === 'vers');
    for (const u of s.combat) {
      const k = this.dryKind(u);
      if (!k || u.order.type === 'move' || u.order.type === 'attack') continue;
      // wird dort, wo die Einheit steht, bereits nachgefüllt?
      if (s.builtFobs.some((f) => f.store[k] > 2 && dist(f.x, f.y, u.x, u.y) <= DEF_RANGE)) continue;
      const lorry = s.trucks.find((t) => t.cargo[k] > 2 && dist(t.x, t.y, u.x, u.y) <= BALANCE.logistics.truckSupplyRange);
      if (lorry) continue;
      let best = null;
      let bd = Infinity;
      for (const f of s.builtFobs) {
        const d = dist(f.x, f.y, u.x, u.y) + (f.store[k] >= 20 ? 0 : 1500);
        if (d < bd) {
          bd = d;
          best = { key: `f${f.id}`, x: f.x, y: f.y, fob: f };
        }
      }
      for (const t of supplyTrucks) {
        if (t.cargo[k] < 20) continue;
        const d = dist(t.x, t.y, u.x, u.y);
        if (d < bd) {
          bd = d;
          best = { key: `t${t.id}`, x: t.x, y: t.y, fob: null };
        }
      }
      if (!best) continue;
      if (!groups.has(best.key)) groups.set(best.key, { ...best, ids: [] });
      groups.get(best.key).ids.push(u.id);
    }
    for (const gr of groups.values()) {
      const p = gr.fob ? this.freeNear(gr.x + (this.rng.next() - 0.5) * 200, gr.y + 120) : { x: gr.x, y: gr.y };
      this.game.issue(this.team, { type: 'move', ids: gr.ids, x: p.x, y: p.y });
    }
  },

  /**
   * Gruppen-Rückzug: Steht eine Gruppe im Feuer und ist die sichtbare Gegnerschaft dort mindestens FALLBACK_ODDS-mal so viel
   * wert, zieht die ganze Gruppe geschlossen Richtung Basis ab, statt einzeln zu fallen. Danach sperrt FALLBACK_HOLD die
   * Angriffsbefehle (army), damit sie sich sammelt und Nachschub dazustößt. Nicht bei Angriff auf die Basis.
   */
  fallBack(s) {
    const g = this.game;
    if (!this.cfg.fallback || s.alarm || !s.home || g.time < this.fallbackUntil || s.enemies.length < FALLBACK_MIN_FOES) return;
    const value = (u) => UNITS[u.type].cost.money || 0;
    const foes = s.enemies.filter((e) => e.def.range > 0);
    for (const u of s.combat) {
      if (u.order.type === 'move' || u.def.air) continue;
      const near = foes.filter((e) => dist(e.x, e.y, u.x, u.y) <= THREAT_RANGE);
      if (near.length < FALLBACK_MIN_FOES) continue;
      const cx = near.reduce((a, e) => a + e.x, 0) / near.length;
      const cy = near.reduce((a, e) => a + e.y, 0) / near.length;
      const mine = s.combat.filter((m) => !m.def.air && dist(m.x, m.y, cx, cy) <= THREAT_RANGE + 200);
      const foeValue = near.reduce((a, e) => a + value(e), 0);
      const myValue = mine.reduce((a, m) => a + value(m), 0);
      if (foeValue < FALLBACK_ODDS * myValue) continue;
      const v = unitVec(s.ax - cx, s.ay - cy);
      const p = this.freeNear(cx + v.x * FALLBACK_DIST, cy + v.y * FALLBACK_DIST);
      g.issue(this.team, { type: 'move', ids: mine.map((m) => m.id), x: p.x, y: p.y });
      this.fallbackUntil = g.time + FALLBACK_HOLD;
      if (this.raid) this.raid = null;
      return;
    }
  },

  /**
   * Panzerhaubitzen (seit v5.26): fahren nicht mit den Wellen, sondern stehen ART_BEHIND px hinter dem Schwerpunkt der Armee
   * (Richtung nächste eigene FOB) und schießen von dort auf alles, was das Team sieht; ohne Armee vor der Hauptstadt.
   */
  artillery(s) {
    if (!s.artillery.length) return;
    let p;
    const pts = s.combat.filter((u) => !u.house);
    if (pts.length) {
      const cx = pts.reduce((a, u) => a + u.x, 0) / pts.length;
      const cy = pts.reduce((a, u) => a + u.y, 0) / pts.length;
      const f = this.nearestBuilt(s, cx, cy);
      const v = f ? unitVec(f.x - cx, f.y - cy) : { x: -s.dir.x, y: -s.dir.y };
      p = { x: cx + v.x * ART_BEHIND, y: cy + v.y * ART_BEHIND };
    } else {
      p = { x: s.ax + s.dir.x * ART_BEHIND, y: s.ay + s.dir.y * ART_BEHIND };
    }
    s.artillery.forEach((u, k) => {
      if (u.order.type === 'attack' || u.fireTarget) return;
      const q = this.freeNear(p.x + (k % 3) * 40 - 40, p.y + Math.floor(k / 3) * 40);
      if (dist(u.x, u.y, q.x, q.y) <= 200 || !this.once(`art${u.id}`, ART_EVERY)) return;
      this.game.issue(this.team, { type: 'move', ids: [u.id], x: q.x, y: q.y });
    });
  },

  // ---- Armee -----------------------------------------------------------------------

  /** Sammelpunkte setzen (Produktionsgebäude), neu nur wenn sich der Sammelpunkt deutlich verschoben hat. */
  rally(s) {
    if (!s.home) return;
    const gp = this.gatherPoint(s);
    for (const b of s.producers) {
      if (!b.built || !b.produces.length) continue;
      const prev = this.rallyAt.get(b.id);
      if (prev && dist(prev.x, prev.y, gp.x, gp.y) < RALLY_MOVE) continue;
      this.rallyAt.set(b.id, gp);
      this.game.issue(this.team, { type: 'rally', buildingId: b.id, x: gp.x, y: gp.y });
    }
  },

  /**
   * Angriff, sobald die Summe der idle Kampfeinheiten (Geldwert) die Schwelle erreicht
   * (bei unbesetzter Zone schon ab 60 %). Nicht zu Hause stehende Einheiten folgen dem Befehl.
   * Einheiten mit fast leerem Vorrat bleiben zum Nachfüllen zurück.
   * In der Zone stehende Einheiten verteilen sich auf einem Kreis (r 400) statt im Zentrum zu klumpen.
   * Ein Fünftel der ausrückenden Gruppe (ab 5 Einheiten) bleibt als Reserve an der Hauptstadt.
   */
  /**
   * Späher (Little Bird, unbewaffnet): fliegt an den Zonenrand auf der Gegnerseite, damit die Besatzung der Zone sichtbar wird
   * (army schätzt die Gegnerstärke dann aus dem Wert der gesehenen Einheiten). Tank fast leer → heim, auftanken, wieder los.
   */
  scout(s) {
    const g = this.game;
    const t = this.team;
    const z = s.zone;
    if (!this.cfg.scout) return;
    const bird = s.units.find((u) => u.type === 'littlebird');
    if (!bird) {
      this.saveForScout = false;
      // schlechte Sicht (Regen, Nebel, Schnee): der Späher ist mehr wert und kommt früher
      const bad = this.cfg.weather && weatherSight(g) < WX_SCOUT_SIGHT;
      const minArmy = bad ? WX_SCOUT_ARMY : SCOUT_MIN_ARMY;
      if (!s.home || s.combat.length < minArmy || g.time < (bad ? WX_SCOUT_FROM : SCOUT_FROM) || this.queued(s, 'littlebird')) return;
      if (!s.producers.some((b) => b.produces.includes('littlebird'))) return; // Stadt ohne Heliport: kein Späher, nicht dafür sparen
      if (g.teams[t].res.money < SCOUT_MONEY) {
        this.saveForScout = true; // produce spart, bis der Späher bezahlbar ist
        return;
      }
      const b = this.pickProducer(s, 'littlebird', BALANCE.queueMax - 1, false);
      if (b) g.issue(t, { type: 'train', buildingId: b.id, unit: 'littlebird' });
      return;
    }
    const fuel = bird.fuel / bird.def.fuelMax;
    if (fuel < SCOUT_FUEL || (this.scoutHome && fuel < SCOUT_REFILL)) {
      this.scoutHome = true;
      if (this.once('scout-home', 10)) g.issue(t, { type: 'move', ids: [bird.id], x: s.ax, y: s.ay });
      return;
    }
    this.scoutHome = false;
    // Zielpunkt: Zonenrand zur Gegnerseite (vom eigenen Zonenrand aus gesehen auf der anderen Seite)
    const foe = g.map.spawns[1 - t];
    const v = unitVec(foe.x - z.x, foe.y - z.y);
    const x = z.x + v.x * z.r * 0.8;
    const y = z.y + v.y * z.r * 0.8;
    if (dist(bird.x, bird.y, x, y) > SCOUT_MOVE && this.once('scout-go', SCOUT_EVERY)) g.issue(t, { type: 'move', ids: [bird.id], x, y });
  },

  /** Merkt sich gesehene gegnerische FOBs (Standort bleibt bekannt, bis man ihn einsieht und dort nichts mehr steht). */
  rememberFobs() {
    const g = this.game;
    for (const [id, b] of this.seenFobs) if (!b.alive) this.seenFobs.delete(id); // zerstört (auch ungesehen)
    for (const b of g.buildings) {
      if (b.team === this.team || b.type !== 'fob') continue;
      const seen = g.isVisible(this.team, b.x, b.y);
      if (seen && b.alive) this.seenFobs.set(b.id, b);
    }
  },

  /** Laufender Überfall: gefallene Räuber austragen; ist das Ziel zerstört oder niemand mehr übrig, endet er (Überlebende rücken in die Armee ein). */
  updateRaid(s) {
    const r = this.raid;
    if (!r) return;
    const target = this.game.buildings.find((b) => b.id === r.targetId);
    for (const id of [...r.ids]) if (!s.combat.some((u) => u.id === id)) r.ids.delete(id);
    if (!r.ids.size || !target || !target.alive) this.raid = null;
  },

  /**
   * Flankenangriff: Steht die Zone gegnerfrei, zweigt von der Besatzung (ab RAID_MIN Einheiten) ein Teil ab und greift
   * die gemerkte gegnerische FOB abseits der Zone an, die der Zone am nächsten liegt. Liefert die Resteinheiten der Besatzung.
   */
  startRaid(s, go) {
    const g = this.game;
    const z = s.zone;
    if (!this.cfg.raid || this.raid || go.length < RAID_MIN) return go;
    const targets = [...this.seenFobs.values()]
      .filter((b) => dist(b.x, b.y, z.x, z.y) > ZONE_FOB_R + 300)
      .sort((a, b) => dist(a.x, a.y, z.x, z.y) - dist(b.x, b.y, z.x, z.y));
    if (!targets.length) return go;
    const raiders = go.slice(-Math.floor(go.length * RAID_SHARE));
    const target = targets[0];
    g.issue(this.team, { type: 'attackMove', ids: raiders.map((u) => u.id), x: target.x, y: target.y });
    this.raid = { ids: new Set(raiders.map((u) => u.id)), targetId: target.id };
    return go.slice(0, go.length - raiders.length);
  },

  /**
   * Häuserkampf: Ein Teil der freien Infanterie in der Zone (GARRISON_SHARE) besetzt Stadthäuser in der Nähe. Dort ist sie geschützt,
   * steht höher und schießt ab der Hauswand; nur schwere Waffen vertreiben sie. Je Haus höchstens so viele, wie Plätze frei sind.
   */
  garrisonZone(s) {
    const g = this.game;
    if (!g.houses || !g.houses.length || !this.once('garrison', GARRISON_EVERY)) return;
    const z = s.zone;
    const t = this.team;
    const inZone = (e) => dist(e.x, e.y, z.x, z.y) <= z.r;
    const inf = s.units.filter((u) => u.def.armor === 'inf' && u.def.range > 0 && !u.def.hero && inZone(u));
    const pending = new Map(); // Haus-ID → Soldaten auf dem Weg hinein
    let housed = 0;
    for (const u of inf) {
      if (u.house) housed++;
      else if (u.order.type === 'garrison') {
        housed++;
        pending.set(u.order.targetId, (pending.get(u.order.targetId) || 0) + 1);
      }
    }
    let want = Math.floor(inf.length * GARRISON_SHARE) - housed;
    if (want <= 0) return;
    const houses = g.houses.filter((h) => h.alive && (h.team < 0 || h.team === t) && inZone(h));
    const raiding = this.raid ? this.raid.ids : null;
    for (const u of inf) {
      if (want <= 0) break;
      if (u.house || u.order.type !== 'idle' || this.dryKind(u) || (raiding && raiding.has(u.id))) continue;
      let best = null;
      let bd = GARRISON_RANGE;
      for (const h of houses) {
        const d = dist(h.x, h.y, u.x, u.y);
        if (d >= bd || h.occupants.length + (pending.get(h.id) || 0) >= h.def.cap) continue;
        best = h;
        bd = d;
      }
      if (!best || !g.issue(t, { type: 'garrison', ids: [u.id], houseId: best.id }).ok) continue;
      pending.set(best.id, (pending.get(best.id) || 0) + 1);
      want--;
    }
  },

  /**
   * Häuser stürmen (Häuserkampf II, seit v5.67): ein vom Gegner besetztes, von der KI gesehenes Haus in der Konfliktzone bekommt einen
   * Sturm, wenn genug freie Infanterie in STORM_RANGE daneben steht: mindestens STORM_RATIO je Besatzer (× STORM_WIRE mit Stacheldraht)
   * und mindestens STORM_MIN. Es gehen höchstens STORM_MAX, die nächsten zuerst. Je Takt höchstens ein Haus. Nur Schwierigkeiten mit houseStorm.
   */
  stormHouses(s) {
    const g = this.game;
    const t = this.team;
    if (!this.cfg.houseStorm || !g.houses?.length || !this.once('storm', STORM_EVERY)) return;
    const z = s.zone;
    const foes = g.houses
      .filter((h) => h.alive && h.team >= 0 && h.team !== t && h.occupants.length > 0 && dist(h.x, h.y, z.x, z.y) <= z.r && g.sees(t, h))
      .sort((a, b) => dist(a.x, a.y, z.x, z.y) - dist(b.x, b.y, z.x, z.y) || a.id - b.id);
    if (!foes.length) return;
    const raiding = this.raid ? this.raid.ids : null;
    const free = s.units.filter((u) => canGarrison(u) && u.def.range > 0 && !u.def.hero && !u.house && u.order.type === 'idle' && !(raiding && raiding.has(u.id)));
    for (const h of foes) {
      const near = free.filter((u) => dist(u.x, u.y, h.x, h.y) <= STORM_RANGE).sort((a, b) => dist(a.x, a.y, h.x, h.y) - dist(b.x, b.y, h.x, h.y) || a.id - b.id);
      const need = STORM_RATIO * h.occupants.length * (h.works.wire ? STORM_WIRE : 1);
      if (near.length < STORM_MIN || near.length < need) continue;
      if (g.issue(t, { type: 'storm', ids: near.slice(0, STORM_MAX).map((u) => u.id), houseId: h.id }).ok) return;
    }
  },

  /**
   * Eigene Besatzungshäuser ausbauen (Häuserkampf II, seit v5.67): je besetztem eigenem Haus ohne laufende Arbeit die nächste fehlende
   * Arbeit aus HOUSE_WORK_ORDER, wenn das Geld nach dem Preis noch HOUSE_WORK_RESERVE lässt. Je Takt höchstens ein Auftrag.
   * Nur Schwierigkeiten mit houseWorks.
   */
  fortifyHouses() {
    const g = this.game;
    const t = this.team;
    if (!this.cfg.houseWorks || !g.houses?.length || !this.once('houseWork', HOUSE_WORK_EVERY)) return;
    const money = g.teams[t].res.money;
    for (const h of g.houses) {
      if (!h.alive || h.team !== t || !h.occupants.length || h.building) continue;
      const work = HOUSE_WORK_ORDER.find((w) => !h.works[w]);
      if (!work || money < BALANCE.garrison.works[work].cost.money + HOUSE_WORK_RESERVE) continue;
      if (g.issue(t, { type: 'fortifyHouse', houseId: h.id, work }).ok) return;
    }
  },

  /**
   * Gegnerischer Sendemast (schon die Baustelle; ihr Baubeginn wird gemeldet, den Ort kennt die KI wie bei jeder Zielwahl): alle
   * Kampfeinheiten greifen ihn an, nah direkt, sonst per Angriffsbewegung ohne Formation (jeder in seinem Tempo, die Zeit drängt).
   * Liefert true, solange er steht (dann entfällt die übliche Zonenwelle).
   */
  attackRadio(s) {
    const g = this.game;
    const mast = g.buildings.find((b) => b.alive && b.def.radio && b.team !== this.team);
    if (!mast) {
      this.strike = null;
      return false;
    }
    // Der eigene Mast siegt früher: verteidigen statt angreifen (die übliche Armeeführung und defend übernehmen)
    const own = s.own.find((b) => b.def.radio);
    if (own && radioEta(own) < radioEta(mast)) return false;
    if (!this.once('radio-attack', RADIO_EVERY)) return true;
    const army = s.combat.filter((u) => !u.house && !this.dryKind(u));
    // Erst sammeln (am Schwerpunkt der Armee draußen, höchstens RADIO_GATHER s), dann geschlossen zuschlagen
    if (!this.strike || this.strike.mast !== mast.id) {
      const field = army.filter((u) => !u.def.air && dist(u.x, u.y, s.ax, s.ay) > GATHER_DIST * 2);
      const pts = field.length ? field : army;
      const cx = pts.reduce((a, u) => a + u.x, 0) / Math.max(1, pts.length);
      const cy = pts.reduce((a, u) => a + u.y, 0) / Math.max(1, pts.length);
      this.strike = { mast: mast.id, since: g.time, go: false, at: this.freeNear(cx, cy) };
    }
    const st = this.strike;
    if (!st.go) {
      const near = army.filter((u) => dist(u.x, u.y, st.at.x, st.at.y) <= RADIO_GATHER_R).length;
      st.go = g.time - st.since >= RADIO_GATHER || near >= RADIO_GATHER_SHARE * army.length;
      if (!st.go) {
        const ids = army.filter((u) => dist(u.x, u.y, st.at.x, st.at.y) > RADIO_GATHER_R && !(u.order.type === 'attackMove' && dist(u.order.x, u.order.y, st.at.x, st.at.y) < 200)).map((u) => u.id);
        if (ids.length) g.issue(this.team, { type: 'attackMove', ids, x: st.at.x, y: st.at.y });
        return true;
      }
    }
    const near = [];
    const far = [];
    for (const u of army) {
      const d = dist(u.x, u.y, mast.x, mast.y);
      if (d <= RADIO_NEAR) {
        if (u.order.type !== 'attack' || u.order.targetId !== mast.id) near.push(u.id);
      } else if (u.order.type !== 'attackMove' || dist(u.order.x, u.order.y, mast.x, mast.y) > RADIO_NEAR) {
        far.push(u.id);
      }
    }
    if (near.length) g.issue(this.team, { type: 'attack', ids: near, targetId: mast.id });
    if (far.length) g.issue(this.team, { type: 'attackMove', ids: far, x: mast.x, y: mast.y });
    return true;
  },

  /**
   * Kommandeur hinter der Armee: CMD_BEHIND px hinter dem Schwerpunkt der Kampfeinheiten draußen (Richtung Hauptstadt), damit seine
   * Aura wirkt, er selbst aber nicht in der ersten Reihe steht. Sichtbare Gegner nahe: zurück zur Hauptstadt. Ohne Armee draußen
   * wartet er am Sammelpunkt.
   */
  guardCommander(s) {
    const c = s.commander;
    if (!c || c.house || !s.home) return;
    const g = this.game;
    let goal;
    if (s.enemies.some((e) => !e.def.air && e.def.range > 0 && dist(e.x, e.y, c.x, c.y) < CMD_DANGER)) {
      goal = this.freeNear(s.ax + s.dir.x * 120, s.ay + s.dir.y * 120);
    } else {
      const field = s.combat.filter((u) => !u.def.air && !u.house && dist(u.x, u.y, s.ax, s.ay) > GATHER_DIST * 2);
      if (field.length >= 3) {
        const cx = field.reduce((a, u) => a + u.x, 0) / field.length;
        const cy = field.reduce((a, u) => a + u.y, 0) / field.length;
        const v = unitVec(s.ax - cx, s.ay - cy);
        goal = this.freeNear(cx + v.x * CMD_BEHIND, cy + v.y * CMD_BEHIND);
      } else {
        goal = this.gatherPoint(s);
      }
    }
    if (dist(c.x, c.y, goal.x, goal.y) < CMD_MOVE / 2) return;
    if (c.order.type === 'move' && dist(c.order.x, c.order.y, goal.x, goal.y) < CMD_MOVE) return;
    g.issue(this.team, { type: 'move', ids: [c.id], x: goal.x, y: goal.y });
  },

  /** Geforderte Stärke (Geldwert) der nächsten Welle; inside = sichtbare Gegner in der Zone. */
  waveNeed(inside) {
    const g = this.game;
    const t = this.team;
    const z = g.zone;
    let need = this.cfg.attackStrength;
    if (z.owner >= 0 && z.owner !== t && z.counts[z.owner] > 0) {
      // Gegner hält die Zone: Gegenangriff schon ab 1,2× seiner Besatzung (Zonengeld ist sein Vorteil).
      // Besitz und Anzahl in der Zone sind öffentlich; die Stärke wird mit dem mittleren Einheitenwert geschätzt.
      // Welle bündeln: nie schwächer losziehen als 1,2× die Besatzung (kleine Gruppen würden nur verheizt).
      // Schätzung: sind fast alle Besatzer sichtbar (Späher), zählt ihr echter Wert, sonst Anzahl × Mittelwert.
      const seen = inside.filter((e) => e.team === z.owner);
      const seenValue = seen.reduce((sum, e) => sum + (UNITS[e.type].cost.money || 0), 0);
      const threat = seen.length >= 0.7 * z.counts[z.owner] ? seenValue : z.counts[z.owner] * THREAT_PER_UNIT;
      need = Math.max(need, WAVE_ODDS * threat);
    }
    // Geduld: je länger keine Welle losging, desto weniger Stärke braucht die nächste (nie unter 60 %).
    need *= Math.max(WAVE_MIN, 1 - (g.time - this.lastWave) / WAVE_PATIENCE);
    // Nebel als Deckung: der Gegner sieht die Welle erst spät, sie geht schon mit weniger Stärke los
    if (this.cfg.weather && weatherSight(g) <= WX_FOG_SIGHT) need *= WX_FOG_WAVE;
    return need;
  },

  army(s) {
    const g = this.game;
    const t = this.team;
    const z = s.zone;
    this.rememberFobs();
    this.updateRaid(s);
    if (g.time < this.fallbackUntil) return; // Rückzug läuft: erst sammeln
    const raiding = this.raid ? this.raid.ids : null;
    const idle = s.combat.filter((u) => u.order.type === 'idle' && !this.dryKind(u) && !(raiding && raiding.has(u.id)));
    if (!idle.length) return;
    const inZone = (u) => dist(u.x, u.y, z.x, z.y) <= z.r;
    const ammoOk = true; // die Hauptstadt hat unendlich Munition

    // Gegner in der Zone (sichtbar): deren Schwerpunkt ist das Ziel, sonst das Zonenzentrum
    const inside = s.enemies.filter((e) => dist(e.x, e.y, z.x, z.y) <= z.r);
    let tx = z.x;
    let ty = z.y;
    if (inside.length) {
      tx = inside.reduce((a, e) => a + e.x, 0) / inside.length;
      ty = inside.reduce((a, e) => a + e.y, 0) / inside.length;
    }

    if (ammoOk) {
      // Nur wer noch nicht in der Zone steht, zählt zur Welle (sonst gehen Nachrücker einzeln los, weil die Zonenbesatzung mitzählt).
      const strength = idle.filter((u) => !inZone(u)).reduce((sum, u) => sum + (UNITS[u.type].cost.money || 0), 0);
      const need = this.waveNeed(inside);
      const ready = strength >= need || (z.owner === -1 && strength >= WAVE_NEUTRAL * need);
      if (ready) {
        let go = idle.filter((u) => !inZone(u));
        // Reserve: die Einheiten nahe der Hauptstadt bleiben zur Verteidigung zurück (die große Startarmee rückt trotzdem aus)
        if (s.home && go.length >= RESERVE_FROM) {
          go.sort((a, b) => dist(a.x, a.y, s.ax, s.ay) - dist(b.x, b.y, s.ax, s.ay));
          go = go.slice(Math.ceil(go.length * RESERVE));
        }
        const ids = go.map((u) => u.id);
        if (ids.length) {
          g.issue(t, { type: 'attackMove', ids, x: tx, y: ty, formation: 'wedge' }); // im Keil: Panzer vorn, alle kommen zusammen an
          this.lastWave = g.time;
        }
      }
    }

    if (inside.length) {
      if (!ammoOk) return;
      // Gegner in der Zone, eigene Einheit ohne Feindkontakt: auf die Gegner zu, sonst stehen beide Seiten
      // außer Sichtweite und das Gefecht kommt nie zustande.
      const lone = idle
        .filter((u) => inZone(u) && !u.house && !inside.some((e) => dist(e.x, e.y, u.x, u.y) < 300))
        .map((u) => u.id);
      if (lone.length) g.issue(t, { type: 'attackMove', ids: lone, x: tx, y: ty });
      return;
    }

    // Zone ist gegnerfrei: ein Teil der Besatzung überfällt eine gemerkte gegnerische FOB abseits der Zone (wer in einem Haus sitzt, bleibt).
    const garrison = idle.filter((u) => inZone(u) && !u.house);
    const left = this.startRaid(s, garrison);
    if (left.length < garrison.length) return;

    const clumped = idle.filter((u) => !u.house && dist(u.x, u.y, z.x, z.y) < 200);
    if (clumped.length >= 2) {
      const groups = 4;
      const base = this.rng.next() * TWO_PI;
      for (let i = 0; i < groups; i++) {
        const ids = clumped.filter((_, k) => k % groups === i).map((u) => u.id);
        if (!ids.length) continue;
        const a = base + (i * TWO_PI) / groups;
        const p = this.highGround(z.x + Math.cos(a) * 400, z.y + Math.sin(a) * 400, 220); // Kuppen bevorzugt
        g.issue(t, { type: 'attackMove', ids, x: p.x, y: p.y });
      }
    }
  },
};
