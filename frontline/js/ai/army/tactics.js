// KI-Gegner, Taktik: Kampfgruppen, Bereitstellungsräume, Mehrfrontenangriff, Halten, gebündelter Nachschub, Gruppenrückzug (PRD §10
// „Kampfgruppen und Mehrfrontenangriff“). Methoden der Klasse AI (js/ai/ai.js), eingehängt über Object.assign; army() in combat.js
// ruft sie auf. Befehle nur über game.issue, Zufall nur über this.rng. Kein DOM.

import { UNITS } from '../../data/units.js';
import { GROUP_MIN, MAIN_SHARE, MAIN_ARMOR_SHARE, FLANK_ANGLE, FLANK_JITTER, REANGLE, STAGE_DIST, STAGE_NEAR, STAGE_BACKOFF, STAGE_RADIUS, STAGE_READY, STAGE_MARCH_MAX, STAGE_CONTACT, STAGE_EVERY, ASSAULT_MAX, GROUP_BREAK, REGROUP_MAX, HOLD_SPREAD, HOLD_DIST, HOLD_SEARCH, THREAT_RANGE, GATHER_DIST } from '../../data/ai.js';
import { ZONE_FOB_R, TWO_PI, dist } from './util.js';

const DEG = Math.PI / 180;
const value = (u) => UNITS[u.type].cost.money || 0;
const sumValue = (list) => list.reduce((a, u) => a + value(u), 0);
const centroid = (list) => ({ x: list.reduce((a, u) => a + u.x, 0) / list.length, y: list.reduce((a, u) => a + u.y, 0) / list.length });

export const tacticsMethods = {
  /** Taktik an (Normal, Schwer)? Auf Leicht (flanks 0) bleibt es bei einer Gruppe ohne Bereitstellung, wie vor dem Paket. */
  tacticsOn() {
    return this.cfg.tactics.flanks > 0;
  },

  /** Sammelpunkt der Ausbildung: mit Taktik immer vor der Hauptstadt (Nachschub zieht gebündelt los), sonst wie bisher (gatherPoint). */
  rallyPoint(s) {
    if (!this.tacticsOn()) return this.gatherPoint(s);
    return this.freeNear(s.ax + s.dir.x * GATHER_DIST, s.ay + s.dir.y * GATHER_DIST);
  },

  /** Einheit verlässt ihre Gruppe (eine Einheit gehört höchstens einer Gruppe). */
  leaveGroups(ids) {
    for (const gr of this.groups.values()) for (const id of ids) gr.ids.delete(id);
  },

  /** Einheiten in Bereitstellung oder im Sammeln nach einem Rückzug: für Welle, Häuserkampf, Überfall und Kistenholen gesperrt. */
  refreshStaging() {
    this.staging = new Set();
    for (const gr of this.groups.values()) if (gr.phase === 'stage' || gr.phase === 'gather') for (const id of gr.ids) this.staging.add(id);
  },

  /** Richtung (Winkel von der Zonenmitte aus), aus der der Gegner kommt: seine Hauptstadt und gemerkte FOBs abseits der Zone. */
  enemyAngle(s) {
    const z = s.zone;
    const foe = this.game.map.spawns[1 - this.team];
    const pts = [foe, ...[...this.seenFobs.values()].filter((b) => dist(b.x, b.y, z.x, z.y) > ZONE_FOB_R + STAGE_RADIUS)];
    let vx = 0;
    let vy = 0;
    for (const p of pts) {
      const d = dist(p.x, p.y, z.x, z.y) || 1;
      vx += (p.x - z.x) / d;
      vy += (p.y - z.y) / d;
    }
    return Math.atan2(vy, vx);
  },

  /**
   * Winkel der vier Haltepunkte um die Zonenmitte. Mit Taktik zur Gegnerseite gewichtet: drei Punkte dorthin (Mitte und ± HOLD_SPREAD),
   * einer als Rückhalt gegenüber. Ohne Taktik (Leicht) wie bisher gleichmäßig mit zufälligem Startwinkel.
   */
  holdAngles(s) {
    if (!this.tacticsOn()) {
      const base = this.rng.next() * TWO_PI;
      return [0, 1, 2, 3].map((i) => base + (i * TWO_PI) / 4);
    }
    const e = this.enemyAngle(s);
    return [e, e + HOLD_SPREAD * DEG, e - HOLD_SPREAD * DEG, e + Math.PI];
  },

  /** Verteilt Einheiten auf die Haltepunkte (Kuppen bevorzugt) um die Zonenmitte. */
  holdSpread(s, units) {
    if (!units.length) return;
    const z = s.zone;
    const angles = this.holdAngles(s);
    angles.forEach((a, i) => {
      const ids = units.filter((_, k) => k % angles.length === i).map((u) => u.id);
      if (!ids.length) return;
      const p = this.highGround(z.x + Math.cos(a) * HOLD_DIST, z.y + Math.sin(a) * HOLD_DIST, HOLD_SEARCH);
      this.game.issue(this.team, { type: 'attackMove', ids, x: p.x, y: p.y });
    });
  },

  /**
   * Bereitstellungsraum: STAGE_DIST vom Ziel (cx, cy) in Richtung `angle`, auf einer Kuppe, begehbar und innerhalb der Karte.
   * Stehen dort sichtbare Gegner (danger), rückt der Punkt bis zu zweimal um STAGE_BACKOFF weiter vom Ziel ab.
   */
  stagePoint(s, cx, cy, angle) {
    const m = this.game.map;
    const clamp = (v, max) => Math.min(Math.max(v, STAGE_RADIUS), max - STAGE_RADIUS);
    let p = { x: cx, y: cy };
    for (let k = 0; k < 3; k++) {
      const d = STAGE_DIST * (1 + k * STAGE_BACKOFF);
      p = this.highGround(clamp(cx + Math.cos(angle) * d, m.width), clamp(cy + Math.sin(angle) * d, m.height), STAGE_RADIUS / 2);
      if (!this.danger(s, p.x, p.y)) break;
    }
    return this.freeNear(p.x, p.y);
  },

  /** Ziel einer Flanke: Schwerpunkt des Drittels der Gegner in der Zone, das ihrem Bereitstellungsraum am nächsten steht; sonst (tx, ty). */
  flankTarget(inside, stage, tx, ty) {
    if (!inside.length) return { x: tx, y: ty };
    const near = inside.slice().sort((a, b) => dist(a.x, a.y, stage.x, stage.y) - dist(b.x, b.y, stage.x, stage.y) || a.id - b.id);
    return centroid(near.slice(0, Math.ceil(near.length / 3)));
  },

  addGroup(units, props) {
    const id = ++this.groupSeq;
    const gr = { id, ids: new Set(units.map((u) => u.id)), t0: this.game.time, value0: sumValue(units), ...props };
    this.groups.set(id, gr);
    return gr;
  },

  /**
   * Eine Welle losschicken. Ohne Taktik (Leicht) oder mit zu wenigen Einheiten: eine Gruppe direkt im Keil auf das Ziel (wie bisher).
   * Sonst Hauptstoß (MAIN_SHARE der Einheiten, MAIN_ARMOR_SHARE der Fahrzeuge) und bis zu cfg.tactics.flanks Flanken; jede Gruppe
   * marschiert in Kolonne in ihren Bereitstellungsraum (Hauptstoß aus der Anmarschrichtung, Flanken um ± FLANK_ANGLE versetzt).
   * Anmarschrichtung ist die vom Ziel zum Schwerpunkt der Welle. Steht sie näher als STAGE_NEAR × STAGE_DIST am Ziel, greift sie direkt an.
   * kind 'reinforce': Nachschub, eine Gruppe (Rolle reserve) geschlossen in Kolonne zur Zonen-FOB bzw. vor die Zonenmitte.
   * kind 'forward': Angriff der Besatzung in der Zone. Ohne sichtbare Gegner in einer Zone, die nicht dem Gegner gehört, direkt (Partiebeginn).
   */
  launchWave(s, go, tx, ty, inside, kind) {
    const g = this.game;
    const t = this.team;
    const T = this.cfg.tactics;
    const ids = go.map((u) => u.id);
    this.leaveGroups(ids);
    const wave = ++this.waveSeq;
    this.lastWave = g.time;
    if (kind === 'reinforce') {
      const z = s.zone;
      const stage = s.zoneFob && s.zoneFob.built ? this.gatherPoint(s) : this.freeNear(z.x - s.dir.x * HOLD_DIST, z.y - s.dir.y * HOLD_DIST);
      g.issue(t, { type: 'attackMove', ids, x: stage.x, y: stage.y, formation: 'column' });
      if (go.length >= GROUP_MIN) this.addGroup(go, { wave, role: 'reserve', phase: 'stage', stage, target: stage, reinforce: true });
      this.refreshStaging();
      return;
    }
    // Steht die Welle schon dicht am Ziel (Besatzung in der Zone), lohnt der Umweg über Bereitstellungsräume nicht: direkt
    const from = centroid(go);
    const close = dist(from.x, from.y, tx, ty) < STAGE_DIST * STAGE_NEAR;
    // Leere, herrenlose Zone (Partiebeginn): nichts zu umfassen, die Welle besetzt sie auf dem kürzesten Weg
    const empty = !inside.length && s.zone.owner !== 1 - t;
    const flanks = this.tacticsOn() && !close && !empty ? Math.min(T.flanks, Math.floor(go.length / GROUP_MIN) - 1) : 0;
    if (flanks <= 0) {
      g.issue(t, { type: 'attackMove', ids, x: tx, y: ty, formation: 'wedge' }); // im Keil: Panzer vorn, alle kommen zusammen an
      if (go.length >= GROUP_MIN) this.addGroup(go, { wave, role: 'main', phase: 'assault', stage: { x: tx, y: ty }, target: { x: tx, y: ty }, tAssault: g.time, form: 'wedge', side: 0 });
      return;
    }
    // Aufteilen: Fahrzeuge bevorzugt in den Hauptstoß, Infanterie füllt alle Gruppen bis zu ihrer Sollgröße auf (gemischte Gruppen)
    const lists = Array.from({ length: flanks + 1 }, () => []);
    const veh = go.filter((u) => u.def.armor !== 'inf').sort((a, b) => value(b) - value(a) || a.id - b.id);
    const inf = go.filter((u) => u.def.armor === 'inf').sort((a, b) => a.id - b.id);
    const vMain = Math.ceil(veh.length * MAIN_ARMOR_SHARE);
    veh.forEach((u, i) => lists[i < vMain ? 0 : 1 + ((i - vMain) % flanks)].push(u));
    const mainSize = Math.min(Math.round(go.length * MAIN_SHARE), go.length - flanks * GROUP_MIN);
    const want = lists.map((_, i) => (i === 0 ? mainSize : (go.length - mainSize) / flanks));
    for (const u of inf) {
      let best = 0;
      for (let i = 1; i < lists.length; i++) if (want[i] - lists[i].length > want[best] - lists[best].length) best = i;
      lists[best].push(u);
    }
    for (let i = lists.length - 1; i > 0; i--) if (lists[i].length < GROUP_MIN) lists[0].push(...lists.splice(i, 1)[0]); // zu kleine Flanke: zum Hauptstoß
    // Winkel: Hauptstoß aus der Anmarschrichtung; nach einem gescheiterten Angriff andere Flankenwinkel, die erste Flanke auf der anderen
    // Seite und (reangle, Schwer) der ganze Ansatz um REANGLE gedreht
    let base = Math.atan2(from.y - ty, from.x - tx);
    let off = FLANK_ANGLE * DEG;
    let side = this.rng.next() < 0.5 ? 1 : -1;
    if (this.failed) {
      off += (this.rng.next() * 2 - 1) * FLANK_JITTER * DEG;
      side = -this.failed.side || side;
      if (T.reangle) base += side * REANGLE * DEG;
      this.failed = null;
    }
    lists.forEach((list, i) => {
      const dirSide = i === 0 ? 0 : i === 1 ? side : -side;
      const angle = base + dirSide * off;
      const stage = this.stagePoint(s, tx, ty, angle);
      const target = i === 0 ? { x: tx, y: ty } : this.flankTarget(inside, stage, tx, ty);
      g.issue(t, { type: 'attackMove', ids: list.map((u) => u.id), x: stage.x, y: stage.y, formation: 'column' });
      this.addGroup(list, { wave, role: i === 0 ? 'main' : 'flank', phase: 'stage', stage, target, angle, side: dirSide || side, form: i === 0 ? 'wedge' : 'line' });
    });
    this.refreshStaging();
  },

  /** Gruppe auflösen; wer außerhalb der Zone steht (Bereitstellung, Sammeln), geht zurück in den Pool am Sammelpunkt, der Rest bleibt Besatzung. */
  dissolve(s, gr, units) {
    this.groups.delete(gr.id);
    if ((gr.phase !== 'stage' && gr.phase !== 'gather') || gr.reinforce || !s.home) return;
    const z = s.zone;
    const ids = units.filter((u) => dist(u.x, u.y, z.x, z.y) > z.r).map((u) => u.id);
    if (!ids.length) return;
    const p = this.rallyPoint(s);
    this.game.issue(this.team, { type: 'move', ids, x: p.x, y: p.y });
  },

  /**
   * Gruppen pflegen (je Denkschritt): Gefallene austragen, zu kleine Gruppen auflösen, Phasen weiterschalten.
   * stage → assault: alle Gruppen der Welle stehen bereit (STAGE_READY der Einheiten im Umkreis STAGE_RADIUS), oder eine wird dort
   *   angegriffen (Gegner näher als STAGE_CONTACT), oder cfg.tactics.stageTimeout s nach der ersten bereiten Gruppe, oder STAGE_MARCH_MAX
   *   s nach dem Abmarsch. Dann greifen alle Gruppen der Welle im selben Denkschritt an (Hauptstoß im Keil, Flanken in Linie).
   * assault → gather: Gruppe hat mehr als GROUP_BREAK ihres Startwerts verloren und Gegner vor sich: zurück in den Bereitstellungsraum.
   * assault → hold: Ziel gegnerfrei und die Gruppe steht, oder ASSAULT_MAX s vorbei; ist die Zone gegnerfrei, auf die Haltepunkte.
   * gather: wartet auf die nächste Welle (army nimmt sie mit); nach REGROUP_MAX s löst sie sich auf (dissolve).
   */
  updateGroups(s) {
    const g = this.game;
    const t = this.team;
    const now = g.time;
    const z = s.zone;
    const T = this.cfg.tactics;
    const byId = new Map(s.combat.map((u) => [u.id, u]));
    const raiding = this.raid ? this.raid.ids : null;
    const frozen = now < this.fallbackUntil; // Gruppen-Rückzug läuft: keine neuen Befehle
    const foes = s.enemies.filter((e) => e.def.range > 0 && !e.def.air);
    const inside = s.enemies.filter((e) => dist(e.x, e.y, z.x, z.y) <= z.r);
    const waves = new Map(); // Welle → Gruppen in Bereitstellung mit ihren Einheiten
    for (const gr of [...this.groups.values()]) {
      for (const id of [...gr.ids]) if (!byId.has(id) || (raiding && raiding.has(id))) gr.ids.delete(id);
      const units = [...gr.ids].map((id) => byId.get(id));
      if (units.length < GROUP_MIN) {
        this.dissolve(s, gr, units);
        continue;
      }
      if (frozen) continue;
      if (gr.phase === 'stage') {
        const near = units.filter((u) => dist(u.x, u.y, gr.stage.x, gr.stage.y) <= STAGE_RADIUS);
        const ready = near.length >= STAGE_READY * units.length;
        if (ready && gr.tReady == null) gr.tReady = now;
        const contact = units.some((u) => dist(u.x, u.y, gr.stage.x, gr.stage.y) <= 2 * STAGE_RADIUS && foes.some((e) => dist(e.x, e.y, u.x, u.y) <= STAGE_CONTACT));
        if (!waves.has(gr.wave)) waves.set(gr.wave, []);
        waves.get(gr.wave).push({ gr, units, ready, contact });
      } else if (gr.phase === 'assault') {
        const c = centroid(units);
        const facing = foes.some((e) => dist(e.x, e.y, c.x, c.y) <= THREAT_RANGE);
        if (this.tacticsOn() && !s.alarm && facing && sumValue(units) < (1 - GROUP_BREAK) * gr.value0) {
          g.issue(t, { type: 'move', ids: units.map((u) => u.id), x: gr.stage.x, y: gr.stage.y });
          gr.phase = 'gather';
          gr.tGather = now;
          this.failed = { side: gr.side, time: now };
        } else if (now - gr.tAssault >= ASSAULT_MAX || (!facing && !inside.length && units.filter((u) => u.order.type === 'idle').length >= STAGE_READY * units.length)) {
          gr.phase = 'hold';
          if (this.tacticsOn() && !inside.length) this.holdSpread(s, units.filter((u) => !u.house && u.order.type === 'idle'));
        }
      } else if (gr.phase === 'gather' && now - gr.tGather >= REGROUP_MAX) {
        this.dissolve(s, gr, units);
      }
    }
    for (const list of waves.values()) {
      const first = Math.min(...list.map((e) => e.gr.tReady ?? Infinity));
      const go = list.every((e) => e.ready) || list.some((e) => e.contact) || now - first >= T.stageTimeout || now - list[0].gr.t0 >= STAGE_MARCH_MAX;
      for (const { gr, units } of list) {
        const ids = units.map((u) => u.id);
        if (!go) {
          // Nachzügler (untätig abseits des Bereitstellungsraums) wieder heranholen
          const late = units.filter((u) => u.order.type === 'idle' && dist(u.x, u.y, gr.stage.x, gr.stage.y) > STAGE_RADIUS).map((u) => u.id);
          if (late.length && this.once(`stage${gr.id}`, STAGE_EVERY)) g.issue(t, { type: 'attackMove', ids: late, x: gr.stage.x, y: gr.stage.y, formation: 'column' });
        } else if (gr.reinforce) {
          gr.phase = 'hold'; // Nachschub ist da: die übliche Führung der Besatzung übernimmt
        } else {
          // gleichzeitiger Angriff: Ziel auf den aktuellen Stand der Gegner in der Zone
          if (inside.length) gr.target = gr.role === 'main' ? centroid(inside) : this.flankTarget(inside, gr.stage, gr.target.x, gr.target.y);
          g.issue(t, { type: 'attackMove', ids, x: gr.target.x, y: gr.target.y, formation: gr.form });
          gr.phase = 'assault';
          gr.tAssault = now;
          gr.value0 = sumValue(units);
          this.lastWave = now;
        }
      }
    }
    this.refreshStaging();
  },
};
