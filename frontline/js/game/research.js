// Forschung (seit v5.04, PRD §7 „Forschung“): Baum aus 10 Stufen und 8 Ästen (js/data/research.js). Die Hauptstadt forscht neben der
// Ausbildung, eins nach dem anderen; bis zu RESEARCH.queueMax weitere warten (Geld beim Einreihen, Abbruch erstattet voll). Eine
// Stufe ist offen, wenn auf der Stufe davor RESEARCH.perTier Forschungen fertig sind; jede Forschung braucht ihren Vorgänger im Ast.
// Mit Stadt braucht jede Forschung eine fertige Universität; Rechenzentren beschleunigen sie (CITY.research), Strommangel bremst.
// Einheiten sind immer alle frei; Forschungen verbessern Werte je Einheitengruppe (fx) oder schalten Fähigkeiten frei (unlock).
// Aus (Standard in new Game()): keine Verbesserungen. Zustand je Team: team.tech = { tier, done: [Schlüssel], cur: { key, t } | null,
// queue: [Schlüssel] }. Kein DOM.
import { RESEARCH } from '../data/research.js';
import { CITY } from '../data/city.js';
import { cityLevel, citySum, powerRatio } from './city/query.js';

const R = RESEARCH;
export const RESEARCH_KEYS = Object.keys(R.items);
const fail = (reason) => ({ ok: false, reason });
const pct = (m) => `${Math.round(Math.abs(1 - m) * 100)} %`;
const ADD = new Set(['regen']); // Werte, die sich addieren (sonst multiplizieren)

// ---- Wirkung in Worten ----

const GROUP_NAME = {
  inf: 'Infanterie', tank: 'Kampfpanzer', ifv: 'Schützenpanzer', aa: 'Flak und SAM', log: 'LKW und Baufahrzeuge', heli: 'Hubschrauber',
  jet: 'Kampfflugzeuge', spaa: 'Flakpanzer Gepard', art: 'Panzerhaubitze', veh: 'Bodenfahrzeuge', air: 'Hubschrauber und Kampfflugzeuge', all: 'alle Einheiten', bld: 'Militärgebäude',
};
const STAT_TEXT = {
  range: (m) => `Waffenreichweite +${pct(m)}`,
  sight: (m) => `Sicht +${pct(m)}`,
  dmg: (m) => `Schaden +${pct(m)}`,
  dmgInf: (m) => `Schaden gegen Infanterie +${pct(m)}`,
  dmgVeh: (m) => `Schaden gegen Fahrzeuge und Gebäude +${pct(m)}`,
  dmgAir: (m) => `Schaden gegen Luftziele +${pct(m)}`,
  rof: (m) => `feuern ${Math.round((1 / m - 1) * 100)} % schneller`,
  armor: (m) => `nehmen ${pct(m)} weniger Schaden`,
  speed: (m) => `Tempo +${pct(m)}`,
  fuel: (m) => `Reichweite mit einer Tankfüllung +${Math.round((1 / m - 1) * 100)} %`,
  acc: (m) => `Trefferchance gelenkter Waffen +${pct(m)}`,
  evade: (m) => `gegnerische Flak, SAM und Lenkraketen treffen ${pct(m)} seltener`,
  regen: (v) => `heilen sich selbst um ${(v * 100).toLocaleString('de-DE')} % HP/s (nach ${R.regenDelay} s ohne Treffer)`,
  rearm: (m) => `auf dem Stellplatz ${pct(m)} schneller bereit`,
  build: (m) => `Bautempo +${pct(m)}`,
  repair: (m) => `Reparatur ${m.toLocaleString('de-DE')}× so schnell`,
  abilityCd: (m) => `Nebel und Minen laden ${pct(m)} schneller`,
};
const UNLOCK_TEXT = {
  smoke: 'Fahrzeuge und Hubschrauber legen mit V eine Nebelwand: eigene Einheiten darin nehmen halb so viel Schaden',
  mines: 'Baufahrzeuge legen mit M Minen, die Bodeneinheiten des Gegners treffen',
  autoturret: 'Dachaufbauten von Gefechtstürmen und Häusern feuern auch ohne Besatzung',
};

/** Wirkung einer Forschung in Worten (Menü, Meldung), z. B. „Kampfpanzer: Waffenreichweite +6 %, Sicht +5 %“. */
export function researchEffect(key) {
  const it = R.items[key];
  if (!it) return '';
  const text = (g, s, v) => (g === 'art' && s === 'acc' ? `Streuung der Granaten −${Math.round((1 - 1 / v) * 100)} %` : STAT_TEXT[s](v)); // Artillerie: Genauigkeit
  const parts = Object.entries(it.fx ?? {}).map(([g, st]) => `${GROUP_NAME[g]}: ${Object.entries(st).map(([s, v]) => text(g, s, v)).join(', ')}`);
  if (it.unlock) parts.push(UNLOCK_TEXT[it.unlock]);
  return parts.join(' · ');
}

// ---- Zustand ----

/** Legt game.research und team.tech an (on: Forschung eingeschaltet). */
export function createResearch(game, on) {
  game.research = !!on;
  game.smokes = [];
  game.mines = [];
  for (const t of game.teams) t.tech = { tier: 1, done: [], cur: null, queue: [] };
}

/** Höchste offene Stufe, wenn `have` (fertig oder geplant) erforscht ist. */
function openTier(have) {
  const set = have instanceof Set ? have : new Set(have);
  let tier = 1;
  while (tier < R.tiers) {
    let n = 0;
    for (const k of set) if (R.items[k]?.tier === tier) n++;
    if (n < R.perTier) break;
    tier++;
  }
  return tier;
}

/** Fertige, laufende und eingereihte Forschungen des Teams (für die Planung der Warteschlange). */
const planned = (tech) => new Set([...tech.done, ...(tech.cur ? [tech.cur.key] : []), ...tech.queue]);

/** Hat das Team die Fähigkeit (unlock) freigeschaltet? */
export function hasUnlock(game, team, what) {
  if (!game.research) return false;
  return game.teams[team].tech.done.some((k) => R.items[k]?.unlock === what);
}

/**
 * Warum die Forschung jetzt nicht eingereiht werden kann (ohne Geld); '' = möglich. Geplant zählt mit: was läuft oder schon wartet,
 * gilt als erforscht (so darf man Vorgänger und Nachfolger zusammen einreihen).
 */
export function researchBlock(game, team, key) {
  if (!game.research) return 'Forschung ist in dieser Partie ausgeschaltet';
  const it = R.items[key];
  if (!it) return 'Unbekannte Forschung';
  const tech = game.teams[team].tech;
  if (tech.done.includes(key)) return 'Bereits erforscht';
  if (tech.cur?.key === key) return 'Wird gerade erforscht';
  if (tech.queue.includes(key)) return 'Steht schon in der Warteschlange';
  const have = planned(tech);
  if (it.req && !have.has(it.req)) return `Benötigt ${R.items[it.req].name}`;
  if (openTier(have) < it.tier) return `Stufe ${it.tier}: erst ${R.perTier} Forschungen der Stufe ${it.tier - 1}`;
  if (game.city && cityLevel(game, team, 'uni') < 1) return 'Benötigt eine Universität in der Stadt';
  if (tech.cur && tech.queue.length >= R.queueMax) return `Warteschlange voll (${R.queueMax} wartende)`;
  return '';
}

/** Forschungstempo des Teams: mit Stadt × (1 + Rechenzentren) × Strom, ohne Universität 0; ohne Stadt 1. */
export function researchSpeed(game, team) {
  if (!game.city) return 1;
  if (cityLevel(game, team, 'uni') < 1) return 0;
  const C = CITY.research;
  return Math.min(C.maxSpeed, 1 + C.dcSpeed * citySum(game, team, 'dc')) * powerRatio(game, team);
}

/** { type: 'research', buildingId, key }: nur die Hauptstadt; läuft nichts, startet sie, sonst wartet sie. Geld beim Einreihen. */
export function cmdResearch(game, team, cmd) {
  const b = game.getEntity(cmd.buildingId);
  if (!b || b.kind !== 'building' || b.team !== team || !b.main) return fail('Nur die Hauptstadt forscht');
  const why = researchBlock(game, team, cmd.key);
  if (why) return fail(why);
  const cost = { money: R.items[cmd.key].money };
  if (!game.canAfford(team, cost)) return fail(game.missingMoney());
  game.pay(team, cost);
  const tech = game.teams[team].tech;
  if (!tech.cur) tech.cur = { key: cmd.key, t: 0 };
  else tech.queue.push(cmd.key);
  return { ok: true, queued: tech.cur.key !== cmd.key };
}

/**
 * { type: 'cancelResearch', key? }: Forschung abbrechen (ohne key die laufende), das Geld kommt ganz zurück. Wartende, die damit
 * ihren Vorgänger oder ihre Stufe verlieren, fallen ebenfalls heraus (auch erstattet). Danach rückt die nächste nach.
 */
export function cmdCancelResearch(game, team, cmd = {}) {
  const tech = game.teams[team].tech;
  const key = cmd.key ?? tech.cur?.key;
  if (!key || (tech.cur?.key !== key && !tech.queue.includes(key))) return fail('Diese Forschung läuft nicht und wartet nicht');
  const refund = (k) => game.refund(team, { money: R.items[k].money });
  refund(key);
  if (tech.cur?.key === key) tech.cur = null;
  else tech.queue.splice(tech.queue.indexOf(key), 1);
  // Warteschlange neu prüfen: nur, was mit den Vorgängern davor noch geht
  const have = new Set([...tech.done, ...(tech.cur ? [tech.cur.key] : [])]);
  const keep = [];
  for (const k of tech.queue) {
    const it = R.items[k];
    have.add(k);
    if ((it.req && !have.has(it.req)) || openTier(new Set([...have].filter((x) => x !== k))) < it.tier) {
      have.delete(k);
      refund(k);
      continue;
    }
    keep.push(k);
  }
  tech.queue = keep;
  if (!tech.cur && tech.queue.length) tech.cur = { key: tech.queue.shift(), t: 0 };
  return { ok: true };
}

/** Ein Schritt: Fortschritt der laufenden Forschung; fertig → Meldung, nächste aus der Warteschlange. */
export function updateResearch(game, dt) {
  if (!game.research) return;
  for (const team of game.teams) {
    const tech = team.tech;
    const cur = tech.cur;
    if (!cur || !game.mainFob(team.id)) continue;
    const sp = researchSpeed(game, team.id);
    if (sp <= 0) {
      game.notify(team.id, 'noUni', 'Forschung ruht: keine Universität in der Stadt', 30);
      continue;
    }
    cur.t += dt * sp;
    const it = R.items[cur.key];
    if (cur.t < it.time) continue;
    tech.done.push(cur.key);
    tech.cur = tech.queue.length ? { key: tech.queue.shift(), t: 0 } : null;
    const was = tech.tier;
    tech.tier = openTier(tech.done);
    game.message(team.id, `${it.name} erforscht: ${researchEffect(cur.key)}`);
    if (tech.tier > was) {
      game.message(team.id, `Forschungsstufe ${tech.tier} offen`);
      game.message(1 - team.id, `Der Gegner forscht auf Stufe ${tech.tier}`);
    }
  }
}

// ---- Wirkung im Spiel ----

/** Summe aller Wirkungen eines Teams je Gruppe und Wert (zwischengespeichert, neu, sobald eine Forschung fertig ist). */
const cache = new WeakMap();
function mods(tech) {
  let c = cache.get(tech);
  if (c && c.n === tech.done.length) return c.m;
  const m = {};
  for (const k of tech.done) {
    for (const [g, st] of Object.entries(R.items[k]?.fx ?? {})) {
      const o = (m[g] ??= {});
      for (const [s, v] of Object.entries(st)) o[s] = ADD.has(s) ? (o[s] ?? 0) + v : (o[s] ?? 1) * v;
    }
  }
  cache.set(tech, { n: tech.done.length, m });
  return m;
}

/** Gruppen einer Einheit: eigene (RESEARCH.groups), veh (Bodenfahrzeug) oder air (Hubschrauber, Jet), immer all. */
export function unitGroups(u) {
  const out = ['all'];
  const g = R.groups[u.type];
  if (Array.isArray(g)) out.push(...g);
  else if (g) out.push(g);
  if (u.def.air) out.push('air');
  else if (u.def.armor !== 'inf') out.push('veh');
  return out;
}

/** Wirkung `stat` auf die Gruppen `groups` eines Teams (Produkt, regen: Summe); ohne Forschung 1 bzw. 0. */
export function teamMod(game, team, groups, stat) {
  const add = ADD.has(stat);
  if (!game.research || team < 0 || !game.teams[team]) return add ? 0 : 1;
  const m = mods(game.teams[team].tech);
  let v = add ? 0 : 1;
  for (const g of groups) {
    const x = m[g]?.[stat];
    if (x !== undefined) v = add ? v + x : v * x;
  }
  return v;
}

/** Wirkung `stat` auf eine Einheit oder ein Militärgebäude (bld); Stadtgebäude und Neutrales: 1. */
export function modOf(game, e, stat) {
  if (!e || e.team < 0) return ADD.has(stat) ? 0 : 1;
  if (e.kind === 'unit') return teamMod(game, e.team, unitGroups(e), stat);
  if (e.kind === 'building' && e.type !== 'city') return teamMod(game, e.team, ['bld'], stat);
  return ADD.has(stat) ? 0 : 1;
}

/** Wirkung `stat` für das ganze Team (Gruppe all: Bautempo, Reparatur, Abklingzeit der Fähigkeiten). */
export const fxMul = (game, team, stat) => teamMod(game, team, ['all'], stat);

/** Schadensfaktor gegen eine Einheit oder ein Militärgebäude. Ein Schuss, der das unverletzte Ziel sofort tötet, bleibt tödlich. */
export function armorMul(game, e, amount) {
  if (!game.research || amount >= (e.def?.hp ?? Infinity)) return 1;
  return modOf(game, e, 'armor');
}

/** Faktor für die Sicht einer Einheit oder eines Gebäudes. */
export const sightMul = (game, e) => modOf(game, e, 'sight');

/** Faktor für die Waffenreichweite einer Einheit oder eines Gebäudes. */
export const rangeMul = (game, e) => modOf(game, e, 'range');

/** Faktor auf den Schaden eines Schusses von s auf t (allgemein und je Zielklasse). */
export function dealtMul(game, s, t) {
  if (!game.research) return 1;
  const cls = t.kind === 'unit' ? (t.def.air ? 'dmgAir' : t.def.armor === 'inf' ? 'dmgInf' : 'dmgVeh') : 'dmgVeh';
  return modOf(game, s, 'dmg') * modOf(game, s, cls);
}

/** Faktor Rauch: eigene Einheiten in einer Nebelwand ihres Teams nehmen weniger Schaden. */
export function smokeMul(game, u) {
  for (const s of game.smokes ?? []) if (s.team === u.team && Math.hypot(u.x - s.x, u.y - s.y) <= s.r) return R.smoke.taken;
  return 1;
}
