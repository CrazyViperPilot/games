// KI-Gegner, Produktion und Forschung: Ausbildung in der Hauptstadt und den FOBs, Gegenmischung, Forschung, Kommandeur.
// Methoden der Klasse AI (js/ai/ai.js), eingehängt über Object.assign. Befehle nur über game.issue. Kein DOM.

import { heliTrainCheck } from '../../game/helipad.js';
import { BALANCE } from '../../data/balance.js';
import { UNITS } from '../../data/units.js';
import { hasCommander } from '../../game/commander.js';
import { researchBlock, RESEARCH_KEYS } from '../../game/research.js';
import { RESEARCH } from '../../data/research.js';
import { COUNTER_FLOOR, QUEUE_RICH, QUEUE_LONG, QUEUE_SHORT, MIX, COUNTER_MIN, COUNTER_WEIGHT, AIR_PER, AIR_MAX, AIR_SPLIT, AIR_MEMORY, SNIPER_FROM, SNIPER_ARMY, SNIPER_SHARE, ART_SHARE, ART_FROM, CMD_RESERVE, CMD_FROM, UPGRADES, UPGRADE_RESERVE, HELI_MIN_MONEY } from '../../data/ai.js';
import { dist } from './util.js';

export const produceMethods = {
  /** Eingereihte Einheiten eines Typs in den Warteschlangen. */
  queued(s, unitType) {
    let n = 0;
    for (const b of s.producers) for (const e of b.queue) if ((e.unit ?? e) === unitType) n++;
    return n;
  },

  fobCap() {
    return this.cfg.fobCap;
  },

  // ---- Geld und Platzsuche ----------------------------------------------------------

  /** Kampfeinheit ausbilden: Geld da (Einheiten kosten nur Geld). */
  canTrain(type) {
    return this.game.teams[this.team].res.money >= (UNITS[type].cost.money || 0);
  },

  // ---- Produktion ------------------------------------------------------------------

  /** Ausbildende Einrichtung für `type` (Hauptstadt bzw. Kaserne, Fabrikhalle, Heliport): kürzeste Warteschlange. */
  pickProducer(s, type, qmax, towardZone) {
    let best = null;
    let bestKey = Infinity;
    for (const b of s.producers) {
      if (!b.built || !b.produces.includes(type) || b.queue.length >= qmax) continue;
      if (UNITS[type]?.air && !UNITS[type].jet && heliTrainCheck(this.game, b)) continue; // Heliport belegt (ein Hubschrauber je Heliport, seit v5.51)
      const key = b.queue.length * 100000 + (towardZone ? dist(b.x, b.y, s.zone.x, s.zone.y) : b.id);
      if (key < bestKey) {
        bestKey = key;
        best = b;
      }
    }
    return best;
  },

  /**
   * Baufahrzeuge (Ersatz zuerst – sie bauen Verteidigung), LKW, dann Kampfeinheiten nach Zielmischung (FOB-Fahrzeuge: expand).
   * Einheiten kosten Geld; ausgebildet wird in der Hauptstadt bzw. (mit Stadt) in Kaserne, Fabrikhalle und Heliport.
   */
  produce(s) {
    const g = this.game;
    const t = this.team;
    const res = g.teams[t].res;
    const qmax = res.money > QUEUE_RICH ? QUEUE_LONG : QUEUE_SHORT;

    // Baufahrzeuge: 1 (2 ab 3 FOBs)
    const engWant = s.fobs.length >= 3 ? 2 : 1;
    const engHave = s.engineers.length + this.queued(s, 'engineer');
    if (engHave < engWant) {
      if (res.money >= UNITS.engineer.cost.money) {
        const b = this.pickProducer(s, 'engineer', BALANCE.queueMax - 1, false);
        if (b) g.issue(t, { type: 'train', buildingId: b.id, unit: 'engineer' });
      } else if (!s.engineers.length) {
        return; // ohne Baufahrzeug droht die Eliminierung: Geld dafür sparen
      }
    }

    // LKW nach Rollen
    const quota = this.truckQuota(s);
    const truckHave = s.trucks.length + this.queued(s, 'truck');
    if (truckHave < quota.total && res.money >= UNITS.truck.cost.money) {
      const b = this.pickProducer(s, 'truck', 2, false);
      if (b) g.issue(t, { type: 'train', buildingId: b.id, unit: 'truck' });
    }


    if (this.saveForScout || this.saveForRadio || this.saveForResearch || this.saveForFob) return; // Geld für Späher, Sendemast, Stufe bzw. FOB-Fahrzeug sparen
    // Festung (seit v5.26): steht ein Turm und fehlt der Transporthubschrauber, zuerst auf ihn sparen (buyHeli in fortify kauft ihn)
    if (!s.helis.length && !this.queued(s, 'transporter') && s.own.some((b) => b.type === 'tower' && b.built) && res.money < UNITS.transporter.cost.money + HELI_MIN_MONEY) return;

    const mix = this.counterMix(s);

    // Kampfeinheiten: welche Typen sind gerade ausbildbar?
    const avail = new Set();
    for (const b of s.producers) {
      if (!b.built || b.queue.length >= qmax) continue;
      for (const u of b.produces) if (mix[u]) avail.add(u);
    }
    if (!avail.size) return;
    let sumW = 0;
    for (const u of avail) sumW += mix[u];
    const counts = {};
    for (const u of avail) counts[u] = s.units.filter((x) => x.type === u).length + this.queued(s, u);
    let total = 0;
    for (const u of avail) total += counts[u];

    // Global nach Defizit: der wichtigste Typ bekommt die knappen Mittel. Fehlt er nur an Geld, wird gespart;
    // fehlt es nur im Lager der Produktionsstätten, kommt der nächste Typ dran (Pendler füllen auf).
    for (let k = 0; k < 4; k++) {
      const entries = [];
      for (const u of avail) entries.push({ u, deficit: (mix[u] / sumW) * (total + 1) - counts[u] });
      entries.sort((a, c) => c.deficit - a.deficit);
      let pick = null;
      for (const e of entries) {
        const b = this.pickProducer(s, e.u, qmax, true);
        if (b && this.canTrain(e.u)) {
          pick = { b, u: e.u };
          break;
        }
        if (b && e.deficit > 0.5) break; // sparen
      }
      if (!pick) break;
      const r = g.issue(t, { type: 'train', buildingId: pick.b.id, unit: pick.u });
      if (!r.ok) break;
      counts[pick.u]++;
      total++;
    }
  },

  /**
   * Zielmischung der Kampfeinheiten, gegen die gesehene Gegnerarmee angepasst (ab COUNTER_MIN sichtbaren Kampfeinheiten):
   * viel Gepanzertes → mehr PAK und Panzer, viel Infanterie → mehr Schützen und Schützenpanzer. Sonst die Grundmischung MIX.
   */
  counterMix(s) {
    const base = this.counterBase(s);
    if (this.difficulty === 'easy') return base;
    const shares = {}; // Zielanteil je Sorte an den Kampfeinheiten; der Rest bleibt der Grundmischung
    const add = (u, v) => {
      if (v > 0) shares[u] = (shares[u] ?? 0) + v; // Luftarten ohne gesehene Ziele tragen nichts bei
    };
    // Luftabwehr (seit v5.71): Hubschrauber und Flugzeuge getrennt gemerkt (AIR_MEMORY s), Gepard, Flak und SAM nach AIR_SPLIT
    const heli = this.rememberAir('heli', s.enemies.filter((e) => e.def.air && !e.def.jet).length);
    const jet = this.rememberAir('jet', s.enemies.filter((e) => e.def.jet).length);
    const total = Math.min(AIR_MAX, (heli + jet) * AIR_PER);
    if (total > 0) {
      const ph = heli / (heli + jet);
      for (const [u, v] of Object.entries(AIR_SPLIT.heli)) add(u, total * ph * v);
      for (const [u, v] of Object.entries(AIR_SPLIT.jet)) add(u, total * (1 - ph) * v);
    }
    // Scharfschützen (seit v5.71, Normal und Schwer): gegen viele sichtbare gegnerische Soldaten, wenn die KI selbst eine Armee hat
    const foeInf = s.enemies.filter((e) => e.def.armor === 'inf' && !e.def.air).length;
    if (foeInf >= SNIPER_FROM && (s.combat?.length ?? 0) >= SNIPER_ARMY) add('sniper', SNIPER_SHARE);
    // Panzerhaubitze (seit v5.26): ab ART_FROM Kampfeinheiten
    if ((s.combat?.length ?? 0) >= ART_FROM) add('pzh', ART_SHARE);
    const extra = Object.values(shares).reduce((a, v) => a + v, 0);
    if (extra <= 0) return base;
    // Die Grundmischung schrumpft auf den Rest, damit jede Sorte genau ihren Zielanteil hat
    const sum = Object.values(base).reduce((a, v) => a + v, 0);
    const k = (1 - extra) / sum;
    const out = {};
    for (const [u, v] of Object.entries(base)) out[u] = v * k;
    for (const [u, v] of Object.entries(shares)) out[u] = v;
    return out;
  },

  /**
   * Gemerkte Zahl gesehener Luftziele einer Art (`heli` oder `jet`): die größte Zahl gleichzeitig gesehener Ziele,
   * AIR_MEMORY s nach dem letzten Sehen vergessen (dann 0).
   */
  rememberAir(kind, n) {
    const now = this.game.time;
    const m = (this.airMemo ??= { heli: { n: 0, t: -1e9 }, jet: { n: 0, t: -1e9 } })[kind];
    if (n > 0) {
      m.n = Math.max(m.n, n);
      m.t = now;
    } else if (now - m.t > AIR_MEMORY) m.n = 0;
    return m.n;
  },

  /** Grundmischung der Bodentruppen, gegen die gesehene Gegnerarmee angepasst (siehe counterMix). */
  counterBase(s) {
    const foes = s.enemies.filter((e) => e.def.range > 0 && !e.def.air);
    if (!this.cfg.counter || foes.length < COUNTER_MIN) return MIX;
    const armored = foes.filter((e) => e.def.armor !== 'inf').length / foes.length;
    // Gepanzerte Gegner: PAK und Panzer rauf (doppelt gewichtet), Schützen und Schützenpanzer runter; bei Infanterie umgekehrt.
    const shift = COUNTER_WEIGHT * (2 * armored - 1);
    const f = (u, k) => Math.max(COUNTER_FLOOR, MIX[u] * (1 + k * shift));
    return { rifleman: f('rifleman', -1), at: f('at', 2), ifv: f('ifv', -1), tank: f('tank', 2) };
  },

  /**
   * Forschung in der Hauptstadt (seit v5.04, Forschungsbaum): ab cfg.research[0] s Stufe für Stufe, in jeder Stufe die Äste in der
   * Reihenfolge UPGRADES (zuerst die niedrigste offene Stufe), nur aus Überschuss (UPGRADE_RESERVE; auf Leicht ohne cfg.upgrades die
   * doppelte Reserve) und höchstens eine wartende Forschung hinter der laufenden.
   */
  research(s) {
    const g = this.game;
    const t = this.team;
    this.saveForResearch = false;
    if (!g.research || !s.home || !s.home.built || g.time < this.cfg.research[0]) return;
    const tech = g.teams[t].tech;
    if (tech.cur && tech.queue.length >= 1) return;
    const items = RESEARCH.items;
    const key = RESEARCH_KEYS.filter((k) => !researchBlock(g, t, k)).sort(
      (a, b) => items[a].tier - items[b].tier || UPGRADES.indexOf(items[a].lane) - UPGRADES.indexOf(items[b].lane),
    )[0];
    const reserve = UPGRADE_RESERVE * (this.cfg.upgrades ? 1 : 2);
    if (key && g.teams[t].res.money >= items[key].money + reserve) g.issue(t, { type: 'research', buildingId: s.home.id, key });
  },

  /** Gefallenen Kommandeur ersetzen (Hauptstadt), sobald genug Geld für ihn und eine Reserve da ist. */
  replaceCommander(s) {
    const g = this.game;
    if (!s.home || !s.home.built || g.time < CMD_FROM || hasCommander(g, this.team)) return;
    if (g.teams[this.team].res.money < UNITS.commander.cost.money + CMD_RESERVE) return;
    const b = this.pickProducer(s, 'commander', BALANCE.queueMax, false); // Hauptstadt bzw. Kaserne
    if (b) g.issue(this.team, { type: 'train', buildingId: b.id, unit: 'commander' });
  },
};
